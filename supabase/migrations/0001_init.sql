create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  department_code text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tool_repositories (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  github_owner text not null,
  github_repo text not null,
  github_installation_id bigint not null,
  default_asset_pattern text,
  release_channel text not null default 'stable',
  created_at timestamptz not null default now(),
  unique (github_owner, github_repo)
);

create table public.tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  version_tag text not null,
  release_name text,
  github_release_id bigint not null,
  published_at timestamptz,
  release_notes text,
  created_at timestamptz not null default now(),
  unique (tool_id, version_tag)
);

create table public.tool_assets (
  id uuid primary key default gen_random_uuid(),
  tool_version_id uuid not null references public.tool_versions(id) on delete cascade,
  github_asset_id bigint not null unique,
  asset_name text not null,
  content_type text,
  size_bytes bigint,
  os text,
  arch text,
  installer_kind text,
  sha256 text,
  created_at timestamptz not null default now()
);

create table public.download_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  tool_id uuid references public.tools(id) on delete set null,
  tool_version_id uuid references public.tool_versions(id) on delete set null,
  tool_asset_id uuid references public.tool_assets(id) on delete set null,
  status text not null,
  error_message text,
  user_agent text,
  requested_at timestamptz not null default now()
);
