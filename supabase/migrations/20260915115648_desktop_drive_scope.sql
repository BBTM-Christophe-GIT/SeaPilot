-- The shared Windows launcher obtains its write scope from the authenticated server.
-- Future modules can extend this function without changing the installed launcher.
create or replace function public.desktop_drive_scope(target_module text, target_company bigint, target_person bigint default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare collaborator public.people%rowtype;
begin
  if target_module = 'disciplinary' then
    if not public.disciplinary_has_access(target_company) then
      raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    select * into collaborator from public.people where id = target_person and company_id = target_company;
    if not found then raise exception 'Collaborateur introuvable.' using errcode = '42501'; end if;
    return jsonb_build_object('directory', 'Sanctions Disciplinaires', 'companyId', target_company,
      'personId', collaborator.id, 'personName', concat_ws(' ', collaborator.first_name, upper(collaborator.last_name)));
  end if;
  -- Procedure source files are edited in Office via root/open. There is no generic
  -- write grant for modules that have not yet defined their own write policy.
  raise exception 'Ce module ne prend pas en charge cet enregistrement.' using errcode = '42501';
end;
$$;
revoke all on function public.desktop_drive_scope(text,bigint,bigint) from public, anon;
grant execute on function public.desktop_drive_scope(text,bigint,bigint) to authenticated;
