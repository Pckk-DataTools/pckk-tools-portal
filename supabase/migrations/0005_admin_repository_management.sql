do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tools'
      and policyname = 'tools_update_admin'
  ) then
    create policy "tools_update_admin"
    on public.tools
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
      )
    )
    with check (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
      )
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tool_repositories'
      and policyname = 'tool_repositories_update_admin'
  ) then
    create policy "tool_repositories_update_admin"
    on public.tool_repositories
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
      )
    )
    with check (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
      )
    );
  end if;
end
$$;
