-- A case may contain a summons followed by a notification. Each validated
-- letter stays immutable when its emitter starts the next letter in the case.
create table public.disciplinary_validated_letters (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.disciplinary_cases(id),
 issuer_id uuid not null references auth.users(id),
 data jsonb not null,
 letter jsonb not null,
 validated_at timestamptz not null,
 validated_by uuid not null references auth.users(id),
 unique(case_id,validated_at)
);
create index disciplinary_validated_letters_issuer_idx on public.disciplinary_validated_letters(issuer_id);
create index disciplinary_validated_letters_validator_idx on public.disciplinary_validated_letters(validated_by);
create index if not exists disciplinary_cases_person_idx on public.disciplinary_cases(person_id);
alter table public.disciplinary_validated_letters enable row level security;
revoke all on public.disciplinary_validated_letters from public,anon,authenticated;
grant select on public.disciplinary_validated_letters to authenticated;
create policy disciplinary_validated_letters_read on public.disciplinary_validated_letters for select to authenticated
using(exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
insert into public.disciplinary_validated_letters(case_id,issuer_id,data,letter,validated_at,validated_by)
select id,issuer_id,data,letter,validated_at,validated_by from public.disciplinary_cases where workflow_status='validated';

create function private.disciplinary_snapshot_letter() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.workflow_status='validated' and old.workflow_status<>'validated' then
   if auth.uid() is distinct from new.issuer_id or new.validated_by is distinct from auth.uid()
     or not private.disciplinary_user_allowed(auth.uid(),new.company_id) then raise exception 'Validation non autorisée.' using errcode='42501'; end if;
   insert into public.disciplinary_validated_letters(case_id,issuer_id,data,letter,validated_at,validated_by)
   values(new.id,new.issuer_id,new.data,new.letter,new.validated_at,new.validated_by);
 end if;
 return new;
end $$;
revoke all on function private.disciplinary_snapshot_letter() from public,anon,authenticated;
create trigger disciplinary_snapshot_letter after update on public.disciplinary_cases for each row execute function private.disciplinary_snapshot_letter();

create or replace function public.disciplinary_lock_validated() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.workflow_status='validated' and row(new.data,new.letter,new.issuer_id,new.workflow_status,new.validated_at,new.validated_by)
   is distinct from row(old.data,old.letter,old.issuer_id,old.workflow_status,old.validated_at,old.validated_by) then
   if not (new.letter is null and new.workflow_status='draft' and new.validated_at is null and new.validated_by is null
     and new.data=old.data and new.issuer_id=old.issuer_id and auth.uid()=old.issuer_id
     and exists(select 1 from public.disciplinary_validated_letters l where l.case_id=old.id and l.letter=old.letter and l.data=old.data and l.validated_at=old.validated_at)) then
     raise exception 'Ce courrier est validé et ne peut plus être modifié.' using errcode='23514';
   end if;
 end if;
 return new;
end $$;

create function private.disciplinary_start_letter(target_case uuid,expected_version timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.disciplinary_cases%rowtype; actor_name text;
begin
 select * into c from public.disciplinary_cases where id=target_case for update;
 if not found or auth.uid() is null or not private.disciplinary_user_allowed(auth.uid(),c.company_id) or auth.uid()<>c.issuer_id then raise exception 'Seul l’émetteur peut préparer le courrier suivant.' using errcode='42501'; end if;
 if expected_version is null or expected_version<>c.updated_at then raise exception 'Le dossier a changé. Actualisez-le.' using errcode='40001'; end if;
 if c.workflow_status<>'validated' then raise exception 'Terminez le courrier courant avant de préparer le suivant.' using errcode='23514'; end if;
 update public.disciplinary_cases set letter=null,workflow_status='draft',validated_at=null,validated_by=null where id=c.id returning * into c;
 select value->>'name' into actor_name from jsonb_array_elements(private.disciplinary_directory(c.company_id)) where value->>'id'=auth.uid()::text;
 insert into public.disciplinary_events(case_id,actor_id,actor_name,kind) values(c.id,auth.uid(),actor_name,'new_letter');
 return to_jsonb(c);
end $$;
revoke all on function private.disciplinary_start_letter(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.disciplinary_start_letter(uuid,timestamptz) to authenticated;
create function public.disciplinary_start_letter(target_case uuid,expected_version timestamptz)
returns jsonb language sql security invoker set search_path='' as $$ select private.disciplinary_start_letter(target_case,expected_version); $$;
revoke all on function public.disciplinary_start_letter(uuid,timestamptz) from public,anon;
grant execute on function public.disciplinary_start_letter(uuid,timestamptz) to authenticated;

create or replace function public.disciplinary_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='letter' and not exists(select 1 from public.disciplinary_validated_letters l where l.case_id=new.case_id and l.letter=new.letter_snapshot) then
   raise exception 'Seul un courrier validé du dossier peut être classé comme courrier final.' using errcode='23514';
 end if;
 return new;
end $$;

-- Direct case writes are now exclusively performed by the checked RPCs.
drop policy disciplinary_cases_insert on public.disciplinary_cases;
drop policy disciplinary_cases_update on public.disciplinary_cases;
alter policy disciplinary_notifications_read on public.disciplinary_notifications
using(recipient_id=(select auth.uid()) and exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
alter policy disciplinary_notifications_seen on public.disciplinary_notifications
using(recipient_id=(select auth.uid()) and exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)))
with check(recipient_id=(select auth.uid()) and exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
