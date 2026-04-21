alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.tool_repositories enable row level security;
alter table public.tool_versions enable row level security;
alter table public.tool_assets enable row level security;
alter table public.download_logs enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

create policy "tools_read_authenticated"
on public.tools
for select
to authenticated
using (true);

create policy "tool_repositories_read_authenticated"
on public.tool_repositories
for select
to authenticated
using (true);

create policy "tool_versions_read_authenticated"
on public.tool_versions
for select
to authenticated
using (true);

create policy "tool_assets_read_authenticated"
on public.tool_assets
for select
to authenticated
using (true);

create policy "download_logs_read_own"
on public.download_logs
for select
to authenticated
using (auth.uid() = user_id);
