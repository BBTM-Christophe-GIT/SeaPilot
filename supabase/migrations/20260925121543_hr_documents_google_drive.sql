-- Keep legacy references until each file has been copied and verified.
alter table public.hr_documents
  add column drive_path text,
  add column drive_sha256 text,
  add column drive_file_id text,
  add constraint hr_drive_reference_check check (
    (drive_path is null and drive_sha256 is null) or
    (drive_path is not null and length(drive_path) between 1 and 500
     and drive_sha256 is not null and drive_sha256 ~ '^[a-f0-9]{64}$'
     and file_size_bytes is not null and file_size_bytes between 1 and 26214400)
  );
create unique index hr_document_drive_path_idx on public.hr_documents(drive_path) where drive_path is not null;

insert into public.stcw_certificates
  (source_list_id, source_item_id, name, category, file_name, stcw_rules, is_credential, active)
values
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 57, 'Attestation de droits', 'Ressources Humaines', 'Attestation de droits', '{}', false, true),
  ('8c8561d7-9fb4-420f-8290-b66309d07e92', 58, 'Carte Vitale', 'Ressources Humaines', 'Carte Vitale', '{}', false, true)
on conflict (source_list_id, source_item_id) do update set
  name=excluded.name, category=excluded.category, file_name=excluded.file_name,
  stcw_rules=excluded.stcw_rules, is_credential=false, active=true, updated_at=now();

-- Invoker: reads are subject to the existing RH policies, including the real
-- Marin ownership and Capitaine watch scope. Writes require an office role.
create function public.hr_document_drive_scope(target_person bigint default null, target_document bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p public.people%rowtype; d public.hr_documents%rowtype; folder text;
begin
  if auth.uid() is null then raise exception 'Session requise.' using errcode='42501'; end if;
  if target_document is not null then
    select * into d from public.hr_documents where id=target_document;
    if not found or d.drive_path is null then raise exception 'Fichier RH inaccessible.' using errcode='42501'; end if;
    return jsonb_build_object('directory','Ressources Humaines','path',d.drive_path,
      'sha256',d.drive_sha256,'bytes',d.file_size_bytes);
  end if;
  if not public.has_any_role(array['admin','direction','armement']) then
    raise exception 'Modification RH refusée.' using errcode='42501';
  end if;
  select * into p from public.people where id=target_person and company_id=public.current_planning_company_id();
  if not found then raise exception 'Collaborateur inaccessible.' using errcode='42501'; end if;
  -- Reuse the original folder even after a collaborator's name changes.
  select split_part(drive_path,'/',1) into folder from public.hr_documents
    where person_id=p.id and company_id=p.company_id and drive_path is not null order by id limit 1;
  if folder is null then
    folder:=rtrim(left(regexp_replace(p.first_name||' '||upper(p.last_name),'[<>:"/\\|?*[:cntrl:]]','-','g'),75),'. ');
    if folder='' or folder ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.]|$)' then folder:='Collaborateur-'||folder; end if;
    folder:=folder||' - c'||p.company_id||'-p'||p.id;
  end if;
  return jsonb_build_object('directory','Ressources Humaines','folder',folder);
end $$;
revoke all on function public.hr_document_drive_scope(bigint,bigint) from public,anon;
grant execute on function public.hr_document_drive_scope(bigint,bigint) to authenticated;

-- A client may only register files in its authorized collaborator's folder.
-- This prevents forging a reference to another person's local Drive file.
create function public.validate_hr_document_drive_reference()
returns trigger language plpgsql security invoker set search_path='' as $$
declare folder text;
begin
  if new.drive_path is null then return new; end if;
  if new.drive_path ~ '[\\[:cntrl:]]' or new.drive_path ~ '(^|/)[.]{1,2}(/|$)'
    or array_length(string_to_array(new.drive_path,'/'),1)<>2
    or new.drive_path !~* '[.](pdf|png|jpe?g|docx?|xlsx?|pptx?|odt|ods|odp|txt)$' then
    raise exception 'Chemin RH invalide.' using errcode='23514';
  end if;
  if auth.uid() is not null then
    if tg_op='UPDATE' then
      if new.drive_path=old.drive_path and new.person_id is not distinct from old.person_id
        and new.company_id=old.company_id then return new; end if;
    end if;
    folder:=public.hr_document_drive_scope(new.person_id,null)->>'folder';
    if split_part(new.drive_path,'/',1) is distinct from folder or new.company_id<>public.current_planning_company_id() then
      raise exception 'Dossier RH non autorisé.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_hr_document_drive_reference() from public,anon;
create trigger validate_hr_document_drive_reference before insert or update on public.hr_documents
for each row execute function public.validate_hr_document_drive_reference();
