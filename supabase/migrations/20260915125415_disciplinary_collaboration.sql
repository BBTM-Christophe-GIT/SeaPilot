-- Confidential collaboration: all writes go through a checked, atomic workflow.
alter table public.disciplinary_cases
  add column issuer_id uuid references auth.users(id),
  add column workflow_status text not null default 'draft' check (workflow_status in ('draft','in_review','validated')),
  add column validated_at timestamptz,
  add column validated_by uuid references auth.users(id);
alter table public.disciplinary_cases disable trigger disciplinary_case_guard;
update public.disciplinary_cases set issuer_id = created_by;
alter table public.disciplinary_cases enable trigger disciplinary_case_guard;
alter table public.disciplinary_cases alter column issuer_id set not null;
alter table public.disciplinary_cases add constraint disciplinary_validation_consistent check (
  (workflow_status = 'validated' and validated_at is not null and validated_by is not null and letter is not null)
  or (workflow_status <> 'validated' and validated_at is null and validated_by is null));
create index disciplinary_cases_issuer_idx on public.disciplinary_cases(issuer_id);
create index disciplinary_cases_validator_idx on public.disciplinary_cases(validated_by);

create table public.disciplinary_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.disciplinary_cases(id),
  author_id uuid not null references auth.users(id),
  author_name text not null,
  kind text not null check (kind in ('comment','change')),
  target text check (target in ('data','letter')),
  field text,
  before_value jsonb,
  after_value jsonb,
  comment text not null default '' check (length(comment) <= 5000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((kind='comment' and target is null and field is null and length(btrim(comment))>0) or (kind='change' and target is not null and field is not null)),
  check (octet_length(coalesce(after_value::text,'')) < 2000000)
);
create index disciplinary_reviews_case_idx on public.disciplinary_reviews(case_id,created_at);
create index disciplinary_reviews_author_idx on public.disciplinary_reviews(author_id);
create index disciplinary_reviews_decider_idx on public.disciplinary_reviews(decided_by);
create table public.disciplinary_participants (
  case_id uuid not null references public.disciplinary_cases(id),
  user_id uuid not null references auth.users(id),
  invited_by uuid not null references auth.users(id),
  invited_at timestamptz not null default clock_timestamp(),
  primary key(case_id,user_id)
);
create index disciplinary_participants_user_idx on public.disciplinary_participants(user_id);
create index disciplinary_participants_inviter_idx on public.disciplinary_participants(invited_by);
create table public.disciplinary_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.disciplinary_cases(id),
  actor_id uuid not null references auth.users(id),
  actor_name text not null,
  kind text not null,
  detail jsonb not null default '{}' check (octet_length(detail::text)<15000),
  created_at timestamptz not null default clock_timestamp()
);
create index disciplinary_events_case_idx on public.disciplinary_events(case_id,created_at);
create index disciplinary_events_actor_idx on public.disciplinary_events(actor_id);
create table public.disciplinary_notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.disciplinary_cases(id),
  recipient_id uuid not null references auth.users(id),
  title text not null,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index disciplinary_notifications_recipient_idx on public.disciplinary_notifications(recipient_id,created_at) where read_at is null;
create index disciplinary_notifications_case_idx on public.disciplinary_notifications(case_id);
alter table public.disciplinary_reviews enable row level security;
alter table public.disciplinary_participants enable row level security;
alter table public.disciplinary_events enable row level security;
alter table public.disciplinary_notifications enable row level security;
revoke all on public.disciplinary_reviews,public.disciplinary_participants,public.disciplinary_events,public.disciplinary_notifications from public,anon,authenticated;
grant select on public.disciplinary_reviews,public.disciplinary_participants,public.disciplinary_events,public.disciplinary_notifications to authenticated;
grant update(read_at) on public.disciplinary_notifications to authenticated;
revoke insert,update on public.disciplinary_cases from authenticated;
create policy disciplinary_reviews_read on public.disciplinary_reviews for select to authenticated using (exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
create policy disciplinary_participants_read on public.disciplinary_participants for select to authenticated using (exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
create policy disciplinary_events_read on public.disciplinary_events for select to authenticated using (exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
create policy disciplinary_notifications_read on public.disciplinary_notifications for select to authenticated using (recipient_id=auth.uid() and exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));
create policy disciplinary_notifications_seen on public.disciplinary_notifications for update to authenticated
using (recipient_id=auth.uid() and exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)))
with check (recipient_id=auth.uid() and exists(select 1 from public.disciplinary_cases c where c.id=case_id and public.disciplinary_has_access(c.company_id)));

create or replace function private.disciplinary_user_allowed(target_user uuid,target_company bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_memberships m where m.user_id=target_user and m.company_id=target_company and m.active)
 and exists(select 1 from public.user_roles r join public.role_module_permissions p on p.role_key=r.role_key
 where r.user_id=target_user and r.company_id=target_company and r.role_key in ('admin','direction') and p.module_key='disciplinary' and p.is_visible);
$$;
revoke all on function private.disciplinary_user_allowed(uuid,bigint) from public,anon,authenticated;

create or replace function private.disciplinary_directory(target_company bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.disciplinary_user_allowed(auth.uid(),target_company) then raise exception 'Accès refusé.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x.item order by x.name) from (
   select coalesce(nullif(btrim(concat_ws(' ',p.first_name,upper(p.last_name))),''),nullif(u.display_name,''),u.email) as name,
   jsonb_build_object('id',u.id,'name',coalesce(nullif(btrim(concat_ws(' ',p.first_name,upper(p.last_name))),''),nullif(u.display_name,''),u.email),
   'function',coalesce(p.function_label,''),'personId',p.id) as item
   from public.profiles u left join public.people p on p.user_id=u.id and p.company_id=target_company
   where private.disciplinary_user_allowed(u.id,target_company)
 ) x),'[]'::jsonb);
end $$;
revoke all on function private.disciplinary_directory(bigint) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.disciplinary_directory(bigint) to authenticated;
create function public.disciplinary_reviewers(target_company bigint) returns jsonb language sql stable security invoker set search_path='' as $$ select private.disciplinary_directory(target_company); $$;
revoke all on function public.disciplinary_reviewers(bigint) from public,anon;
grant execute on function public.disciplinary_reviewers(bigint) to authenticated;

create function private.disciplinary_notify(target_case uuid,target_user uuid,message text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Session requise.' using errcode='42501'; end if;
 if target_user <> auth.uid() and exists(select 1 from public.disciplinary_cases c where c.id=target_case
   and private.disciplinary_user_allowed(auth.uid(),c.company_id) and private.disciplinary_user_allowed(target_user,c.company_id)) then
   insert into public.disciplinary_notifications(case_id,recipient_id,title) values(target_case,target_user,message);
 end if;
end $$;
revoke all on function private.disciplinary_notify(uuid,uuid,text) from public,anon,authenticated;

create function public.disciplinary_lock_validated() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.workflow_status='validated' and row(new.data,new.letter,new.issuer_id,new.workflow_status,new.validated_at,new.validated_by)
   is distinct from row(old.data,old.letter,old.issuer_id,old.workflow_status,old.validated_at,old.validated_by) then
   raise exception 'Ce courrier est validé et ne peut plus être modifié.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.disciplinary_lock_validated() from public,anon,authenticated;
create trigger disciplinary_validated_guard before update on public.disciplinary_cases for each row execute function public.disciplinary_lock_validated();

create function public.disciplinary_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='letter' and not exists(select 1 from public.disciplinary_cases c where c.id=new.case_id
   and c.workflow_status='validated' and c.letter=new.letter_snapshot) then
   raise exception 'Seul le courrier validé peut être classé comme courrier final.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.disciplinary_document_guard() from public,anon,authenticated;
create trigger disciplinary_document_guard before insert on public.disciplinary_documents for each row execute function public.disciplinary_document_guard();

create function private.disciplinary_mutate(action text,target_case uuid,expected_version timestamptz,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.disciplinary_cases%rowtype; change public.disciplinary_reviews%rowtype;
 actor uuid:=auth.uid(); actor_name text; recipient uuid; new_issuer uuid; directory jsonb; issuer jsonb;
 field_name text; target_name text; proposed jsonb; previous jsonb; pair record; changed_count integer:=0;
 form_keys text[]:=array['employeeName','address','fault','sanction','reason','facts','factsOn','knownOn','vessel','evidence','rules','summonsSentOn','summonsReceivedOn','interviewAt','interviewPlace','explanations','notificationOn','extraHolidays','optionalInterview','representatives','advisorAddresses','contractType','protectedEmployee','sanctionDetails','harmfulIntent'];
 letter_keys text[]:=array['kind','date','subject','body','employeeName','address'];
begin
 if actor is null then raise exception 'Session requise.' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>2200000 then raise exception 'Données invalides.' using errcode='23514'; end if;
 if action='create' then
   c.company_id:=(payload->>'company_id')::bigint;
   if not private.disciplinary_user_allowed(actor,c.company_id) then raise exception 'Accès refusé.' using errcode='42501'; end if;
   new_issuer:=coalesce((payload->>'issuer_id')::uuid,actor);
   if not private.disciplinary_user_allowed(new_issuer,c.company_id) then raise exception 'Émetteur non autorisé.' using errcode='42501'; end if;
   insert into public.disciplinary_cases(id,company_id,person_id,data,issuer_id)
   values(target_case,c.company_id,(payload->>'person_id')::bigint,payload->'data',new_issuer) returning * into c;
 else
   select * into c from public.disciplinary_cases where id=target_case for update;
   if not found or not private.disciplinary_user_allowed(actor,c.company_id) then raise exception 'Dossier inaccessible.' using errcode='42501'; end if;
   if action not in ('comment','procedure') and (expected_version is null or expected_version<>c.updated_at) then
     raise exception 'Le dossier a changé. Actualisez-le avant de poursuivre.' using errcode='40001';
   end if;
   if c.workflow_status='validated' and action not in ('comment','procedure') then raise exception 'Le courrier est validé et verrouillé.' using errcode='23514'; end if;
 end if;
 directory:=private.disciplinary_directory(c.company_id);
 select value->>'name' into actor_name from jsonb_array_elements(directory) where value->>'id'=actor::text;
 select value into issuer from jsonb_array_elements(directory) where value->>'id'=c.issuer_id::text;
 if action='create' and new_issuer<>actor then perform private.disciplinary_notify(c.id,new_issuer,'Un dossier disciplinaire vous a été attribué'); end if;
 if action='save' or (action='create' and payload->'letter' is not null) then
   if jsonb_typeof(payload->'data') is distinct from 'object' or (payload->'letter'<>'null'::jsonb and jsonb_typeof(payload->'letter') is distinct from 'object') then raise exception 'Brouillon invalide.' using errcode='23514'; end if;
   if actor=c.issuer_id then
     proposed:=nullif(payload->'letter','null'::jsonb);
     if proposed is not null then proposed:=jsonb_set(proposed,'{emitterName}',to_jsonb(issuer->>'name')); end if;
     update public.disciplinary_cases set data=payload->'data',letter=proposed where id=c.id returning * into c;
   else
     if c.letter is null and nullif(payload->'letter','null'::jsonb) is not null then raise exception 'L’émetteur doit générer le premier courrier.' using errcode='23514'; end if;
     foreach target_name in array array['data','letter'] loop
       proposed:=coalesce(nullif(payload->target_name,'null'::jsonb),'{}'::jsonb);
       previous:=coalesce(case when target_name='data' then c.data else c.letter end,'{}'::jsonb);
       for pair in select key,value from jsonb_each(proposed) loop
         if (target_name='data' and pair.key=any(form_keys)) or (target_name='letter' and pair.key=any(letter_keys)) then
           if pair.value is distinct from previous->pair.key then
             insert into public.disciplinary_reviews(case_id,author_id,author_name,kind,target,field,before_value,after_value)
             values(c.id,actor,actor_name,'change',target_name,pair.key,coalesce(previous->pair.key,'null'),pair.value);
             changed_count:=changed_count+1;
           end if;
         end if;
       end loop;
     end loop;
     if changed_count=0 then raise exception 'Aucune modification à proposer.' using errcode='23514'; end if;
     update public.disciplinary_cases set workflow_status='in_review' where id=c.id returning * into c;
     perform private.disciplinary_notify(c.id,c.issuer_id,'Modifications proposées — décision de l’émetteur attendue');
   end if;
 elsif action='share' then
   if c.letter is null then raise exception 'Enregistrez le courrier avant de le partager.' using errcode='23514'; end if;
   if actor<>c.issuer_id and not exists(select 1 from public.user_roles where user_id=actor and company_id=c.company_id and role_key='admin') then raise exception 'Seul l’émetteur ou Administration peut partager la relecture.' using errcode='42501'; end if;
   if jsonb_typeof(payload->'recipients') is distinct from 'array' or jsonb_array_length(payload->'recipients') not between 1 and 50 then raise exception 'Choisissez les destinataires.' using errcode='23514'; end if;
   for recipient in select distinct value::uuid from jsonb_array_elements_text(payload->'recipients') loop
     if not private.disciplinary_user_allowed(recipient,c.company_id) then raise exception 'Destinataire non autorisé dans cette entreprise.' using errcode='42501'; end if;
     insert into public.disciplinary_participants(case_id,user_id,invited_by) values(c.id,recipient,actor) on conflict(case_id,user_id) do nothing;
     perform private.disciplinary_notify(c.id,recipient,'Courrier disciplinaire partagé pour relecture');
   end loop;
   update public.disciplinary_cases set workflow_status='in_review' where id=c.id returning * into c;
 elsif action='comment' then
   if coalesce(length(btrim(payload->>'comment')),0) not between 1 and 5000 then raise exception 'Renseignez un commentaire de 1 à 5 000 caractères.' using errcode='23514'; end if;
   insert into public.disciplinary_reviews(case_id,author_id,author_name,kind,comment) values(c.id,actor,actor_name,'comment',payload->>'comment');
   for recipient in select user_id from public.disciplinary_participants where case_id=c.id union select c.issuer_id loop
     perform private.disciplinary_notify(c.id,recipient,'Nouveau commentaire sur un courrier disciplinaire');
   end loop;
 elsif action='resolve' then
   if actor<>c.issuer_id then raise exception 'Seul l’émetteur décide des modifications.' using errcode='42501'; end if;
   select * into change from public.disciplinary_reviews where id=(payload->>'review_id')::uuid and case_id=c.id for update;
   if not found or change.kind<>'change' or change.status<>'pending' or coalesce(payload->>'decision','') not in ('accepted','rejected') then raise exception 'Proposition ou décision invalide.' using errcode='23514'; end if;
   if payload->>'decision'='accepted' then
     previous:=coalesce(case when change.target='data' then c.data else c.letter end,'{}');
     if coalesce(previous->change.field,'null') is distinct from change.before_value then raise exception 'Ce champ a changé depuis la proposition. Rejetez-la ou demandez une nouvelle proposition.' using errcode='40001'; end if;
     proposed:=jsonb_set(previous,array[change.field],change.after_value);
     if change.target='data' then update public.disciplinary_cases set data=proposed where id=c.id returning * into c;
     else update public.disciplinary_cases set letter=proposed where id=c.id returning * into c; end if;
   end if;
   update public.disciplinary_reviews set status=payload->>'decision',decided_by=actor,decided_at=clock_timestamp() where id=change.id;
   perform private.disciplinary_notify(c.id,change.author_id,case when payload->>'decision'='accepted' then 'Modification acceptée par l’émetteur' else 'Modification rejetée par l’émetteur' end);
 elsif action='issuer' then
   if actor<>c.issuer_id and not exists(select 1 from public.user_roles where user_id=actor and company_id=c.company_id and role_key='admin') then raise exception 'Changement d’émetteur réservé à l’émetteur actuel ou à Administration.' using errcode='42501'; end if;
   new_issuer:=(payload->>'issuer_id')::uuid;
   if new_issuer=c.issuer_id then raise exception 'Cet utilisateur est déjà l’émetteur.' using errcode='23514'; end if;
   if not coalesce(private.disciplinary_user_allowed(new_issuer,c.company_id),false) then raise exception 'Émetteur non autorisé.' using errcode='42501'; end if;
   select value into issuer from jsonb_array_elements(directory) where value->>'id'=new_issuer::text;
   update public.disciplinary_cases set issuer_id=new_issuer,letter=case when letter is null then null else letter || jsonb_build_object('emitterName',issuer->>'name','emitterFunction',issuer->>'function','signatureDataUrl','') end where id=c.id returning * into c;
   perform private.disciplinary_notify(c.id,new_issuer,'Vous êtes désormais l’émetteur du courrier disciplinaire');
 elsif action='validate' then
   if actor<>c.issuer_id then raise exception 'Seul l’émetteur peut valider le courrier.' using errcode='42501'; end if;
   if exists(select 1 from public.disciplinary_reviews where case_id=c.id and kind='change' and status='pending') then raise exception 'Acceptez ou rejetez les modifications en attente.' using errcode='23514'; end if;
   if c.letter is null then raise exception 'Générez le courrier avant validation.' using errcode='23514'; end if;
   foreach field_name in array array['subject','body','date','employeeName','address','emitterName','emitterFunction','signatureDataUrl'] loop
     if coalesce(length(btrim(regexp_replace(c.letter->>field_name,'<[^>]*>','','g'))),0)=0 then raise exception 'Courrier incomplet : %.',field_name using errcode='23514'; end if;
   end loop;
   foreach field_name in array array['facts','evidence','rules','factsOn','knownOn'] loop
     if coalesce(length(btrim(regexp_replace(c.data->>field_name,'<[^>]*>','','g'))),0)=0 then raise exception 'Préparation incomplète : %.',field_name using errcode='23514'; end if;
   end loop;
   if (c.letter->>'reviewedForm')::jsonb is distinct from c.data then raise exception 'Confirmez la relecture de la préparation actuelle.' using errcode='23514'; end if;
   if coalesce(c.letter->>'signatureDataUrl','') !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' then raise exception 'Signature PNG ou JPEG requise.' using errcode='23514'; end if;
   if coalesce(c.letter->>'kind','') not in ('convocation','notification','conservatoire') or c.letter->>'body' ~ '\[[^]]+\]' then raise exception 'Complétez le modèle avant validation.' using errcode='23514'; end if;
   update public.disciplinary_cases set workflow_status='validated',validated_by=actor,validated_at=clock_timestamp() where id=c.id returning * into c;
   for recipient in select user_id from public.disciplinary_participants where case_id=c.id loop perform private.disciplinary_notify(c.id,recipient,'Courrier disciplinaire validé'); end loop;
 elsif action='procedure' then
   if coalesce(payload->>'step','') not in ('facts','summons_sent','interview','notification_sent','sanction_started','sanction_ended','closed')
     or coalesce(payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or length(coalesce(payload->>'note',''))>5000 then raise exception 'Étape de procédure invalide.' using errcode='23514'; end if;
   perform (payload->>'date')::date;
 elsif action<>'create' then raise exception 'Action inconnue.' using errcode='23514';
 end if;
 insert into public.disciplinary_events(case_id,actor_id,actor_name,kind,detail)
 values(c.id,actor,actor_name,case when action='save' and actor<>c.issuer_id then 'proposed' else action end,
 case when action='procedure' then jsonb_build_object('step',payload->>'step','date',payload->>'date','note',payload->>'note')
 when action='resolve' then jsonb_build_object('review_id',change.id,'decision',payload->>'decision','field',change.field)
 when action='issuer' then jsonb_build_object('issuer_name',issuer->>'name')
 when action='share' then jsonb_build_object('recipients',payload->'recipients') else '{}' end);
 return to_jsonb(c);
end $$;
revoke all on function private.disciplinary_mutate(text,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function private.disciplinary_mutate(text,uuid,timestamptz,jsonb) to authenticated;
create function public.disciplinary_mutate(action text,target_case uuid,expected_version timestamptz default null,payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$ select private.disciplinary_mutate(action,target_case,expected_version,payload); $$;
revoke all on function public.disciplinary_mutate(text,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.disciplinary_mutate(text,uuid,timestamptz,jsonb) to authenticated;

create function public.disciplinary_bell_notifications()
returns table(id uuid,case_id uuid,title text,created_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select n.id,n.case_id,n.title,n.created_at from public.disciplinary_notifications n join public.disciplinary_cases c on c.id=n.case_id
 where n.recipient_id=auth.uid() and n.read_at is null and c.company_id=public.current_planning_company_id()
 order by n.created_at desc limit 100;
$$;
revoke all on function public.disciplinary_bell_notifications() from public,anon;
grant execute on function public.disciplinary_bell_notifications() to authenticated;
