-- Match the HR "en poste" population on today's date in France.
-- is_current still identifies the person linked to the signed-in account.
create or replace function private.expense_note_people()
returns table (id bigint, name text, is_current boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, btrim(concat_ws(' ', p.first_name, p.last_name)), p.user_id = auth.uid()
  from public.people p
  where auth.uid() is not null and p.active
    and p.hired_on <= (now() at time zone 'Europe/Paris')::date
    and (p.departed_on is null or p.departed_on > (now() at time zone 'Europe/Paris')::date)
    and public.user_belongs_to_company(p.company_id)
    and exists (select 1 from public.role_module_permissions r
      where r.module_key = 'expenseNotes' and r.is_visible and public.has_role(r.role_key))
  order by p.last_name, p.first_name, p.id;
$$;
revoke all on function private.expense_note_people() from public, anon;
grant execute on function private.expense_note_people() to authenticated;
