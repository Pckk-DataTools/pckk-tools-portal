do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tools'
      and policyname = 'tools_delete_admin'
  ) then
    create policy "tools_delete_admin"
    on public.tools
    for delete
    to authenticated
    using (
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
