-- Keep already-issued Word contracts readable; all new generations are PDF.
alter table public.hr_employment_contracts drop constraint hr_employment_contracts_file_name_check;
alter table public.hr_employment_contracts add constraint hr_employment_contracts_file_name_check
check(length(file_name) between 1 and 200 and file_name ~ '\.(pdf|docx)$' and file_name !~ '[/\\]');
alter table public.hr_employment_contracts drop constraint hr_employment_contracts_check;
alter table public.hr_employment_contracts add constraint hr_employment_contracts_path_check
check(storage_path ~ '^[0-9]+/people/[0-9]+/[a-f0-9-]{36}\.(pdf|docx)$'
  and split_part(storage_path,'/',1)=company_id::text and split_part(storage_path,'/',3)=person_id::text);
update storage.buckets set public=false,allowed_mime_types=array['application/pdf']
where id='hr-employment-contracts';

create or replace function public.hr_employment_contract_path_allowed(target_path text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and target_path ~ '^[0-9]+/people/[0-9]+/[a-f0-9-]{36}\.(pdf|docx)$'
    and split_part(target_path,'/',1)=public.current_planning_company_id()::text
    and public.has_company_role(public.current_planning_company_id(),array['admin','direction'])
    and exists(select 1 from public.people p where p.id::text=split_part(target_path,'/',3)
      and p.company_id=public.current_planning_company_id());
$$;
alter policy hr_employment_contract_storage_insert on storage.objects
with check(bucket_id='hr-employment-contracts' and name ~ '\.pdf$' and public.hr_employment_contract_path_allowed(name));
alter policy hr_employment_contract_storage_guard on storage.objects
with check(bucket_id<>'hr-employment-contracts' or (name ~ '\.pdf$' and public.hr_employment_contract_path_allowed(name)));

create or replace function public.hr_employment_contract_check_file()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.has_company_role(new.company_id,array['admin','direction']) or new.created_by is distinct from auth.uid() then
    raise exception 'Les contrats sont réservés à Administration et Direction.' using errcode='42501';
  end if;
  if new.file_name !~ '\.pdf$' or new.storage_path !~ '\.pdf$' then
    raise exception 'Les nouveaux contrats doivent être générés au format PDF.' using errcode='23514';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='hr-employment-contracts'
    and o.name=new.storage_path and o.metadata->>'mimetype'='application/pdf') then
    raise exception 'Le fichier PDF du contrat doit être enregistré avant son classement.' using errcode='23514';
  end if;
  return new;
end $$;

-- Reuse the existing private signature record and its existing RLS. There is
-- no public image, role broadening or arbitrary signer/person argument.
create function public.hr_employment_contract_signer()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  signer_person bigint;
  signer_count integer;
  result jsonb;
begin
  if auth.uid() is null or not public.has_company_role(company,array['admin','direction']) then
    raise exception 'La signature des contrats est réservée à Administration et Direction.' using errcode='42501';
  end if;
  select min(p.id),count(*) into signer_person,signer_count from public.people p
  where p.company_id=company and p.active
    and lower(btrim(p.first_name))='benjamin' and lower(btrim(p.last_name))='bon';
  if signer_count<>1 then
    raise exception 'La fiche RH active unique de Benjamin BON est introuvable.' using errcode='22023';
  end if;
  select jsonb_build_object('id',s.id,'person_id',s.person_id,'signer_name','Benjamin BON',
    'storage_bucket',s.storage_bucket,'storage_path',s.storage_path,'mime_type',s.mime_type,
    'file_size_bytes',s.file_size_bytes,'sha256',s.sha256)
  into result from public.working_time_profile_signatures s
  where s.company_id=company and s.person_id=signer_person and s.valid_to is null and s.valid_from<=now()
    and s.mime_type in ('image/png','image/jpeg')
  order by s.version_number desc limit 1;
  if result is null then
    raise exception 'La signature numérisée active de Benjamin BON est absente de sa fiche RH.' using errcode='22023';
  end if;
  return result;
end $$;
revoke all on function public.hr_employment_contract_signer() from public,anon;
grant execute on function public.hr_employment_contract_signer() to authenticated;
notify pgrst,'reload schema';
