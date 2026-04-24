create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.tool_repositories
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_status text not null default 'never',
  add column if not exists last_sync_error text,
  add column if not exists last_release_tag text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tool_repositories_tool_id_key'
      and conrelid = 'public.tool_repositories'::regclass
  ) then
    alter table public.tool_repositories
      add constraint tool_repositories_tool_id_key unique (tool_id);
  end if;
end
$$;

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  trigger_type text not null check (trigger_type in ('manual', 'scheduled')),
  status text not null check (status in ('success', 'partial', 'error')),
  total_repos integer not null default 0,
  success_repos integer not null default 0,
  failed_repos integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary_json jsonb,
  created_at timestamptz not null default now()
);

alter table public.sync_runs enable row level security;

create policy "sync_runs_read_admin"
on public.sync_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

create or replace function public.trigger_release_sync_cron()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_sync_secret text;
  v_request_id bigint;
begin
  v_project_url := current_setting('app.settings.supabase_project_url', true);
  v_sync_secret := current_setting('app.settings.sync_cron_secret', true);

  if v_project_url is null or v_project_url = '' then
    raise exception 'app.settings.supabase_project_url is not set';
  end if;

  if v_sync_secret is null or v_sync_secret = '' then
    raise exception 'app.settings.sync_cron_secret is not set';
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/github-release-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_sync_secret
    ),
    body := '{}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'github-release-sync-every-15-minutes';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'github-release-sync-every-15-minutes',
    '*/15 * * * *',
    $$select public.trigger_release_sync_cron();$$
  );
end
$$;
