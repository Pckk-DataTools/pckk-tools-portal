insert into public.tools (slug, display_name, description)
values ('iric-input-checker', 'iRIC Input Checker', 'Pckk-iRIC private release distribution target')
on conflict (slug) do update set
  display_name = excluded.display_name,
  description = excluded.description;

insert into public.tool_repositories (
  tool_id,
  github_owner,
  github_repo,
  github_installation_id,
  default_asset_pattern,
  release_channel
)
select
  t.id,
  'Pckk-iRIC',
  'iRIC-Input-Checker',
  125744521,
  '*',
  'stable'
from public.tools t
where t.slug = 'iric-input-checker'
on conflict (github_owner, github_repo) do update set
  github_installation_id = excluded.github_installation_id,
  default_asset_pattern = excluded.default_asset_pattern,
  release_channel = excluded.release_channel;
