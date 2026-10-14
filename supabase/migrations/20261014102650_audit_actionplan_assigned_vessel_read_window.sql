-- Fenêtre de consultation des audits et du Plan d'Action.
-- Les fonctions avant extension sont figées pour les gardes métier :
-- l'accès à un navire ne donne ni traitement, ni dépôt, ni correction.

do $migration$
declare item record; source_definition text; frozen_definition text;
begin
  for item in select * from (values
    ('public.action_plan_current_vessel_scope()', 'private.action_plan_vessel_scope_before_read_window', ''),
    ('public.action_item_user_can_read(bigint)', 'private.action_item_can_read_before_vessel_window', 'bigint'),
    ('internal_audit_private.can_read_finding(uuid)', 'internal_audit_private.can_read_finding_before_vessel_window', 'uuid'),
    ('internal_audit_private.can_read_audit(uuid)', 'internal_audit_private.can_read_audit_before_vessel_window', 'uuid'),
    ('internal_audit_private.can_read_site(uuid)', 'internal_audit_private.can_read_site_before_vessel_window', 'uuid'),
    ('documentary_audit_private.can_read_finding(uuid)', 'documentary_audit_private.can_read_finding_before_vessel_window', 'uuid'),
    ('documentary_audit_private.can_read_audit(uuid)', 'documentary_audit_private.can_read_audit_before_vessel_window', 'uuid')
  ) functions(source_signature, target_name, argument_types) loop
    source_definition := pg_get_functiondef(item.source_signature::regprocedure);
    frozen_definition := regexp_replace(source_definition, '^CREATE OR REPLACE FUNCTION [^(]+',
      'CREATE FUNCTION ' || item.target_name);
    -- Figer aussi les dépendances dont le lecteur va être élargi.
    if item.target_name = 'private.action_item_can_read_before_vessel_window' then
      frozen_definition := replace(frozen_definition, 'public.action_plan_current_vessel_scope(',
        'private.action_plan_vessel_scope_before_read_window(');
    elsif item.target_name = 'internal_audit_private.can_read_site_before_vessel_window' then
      frozen_definition := replace(frozen_definition, 'internal_audit_private.can_read_audit(',
        'internal_audit_private.can_read_audit_before_vessel_window(');
    end if;
    execute frozen_definition;
    execute format('revoke all on function %s(%s) from public, anon, authenticated', item.target_name, item.argument_types);
  end loop;
end;
$migration$;

-- Références de lecture utilisées pour autoriser une mutation ou un dépôt.
-- Modifier uniquement la garde, sans changer les validations métier existantes.
do $migration$
declare item record; definition text; patched text; marker integer;
begin
  for item in select * from (values
    ('public.action_item_user_can_treat(bigint)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('public.action_item_admin_update(bigint,text,bigint,text,text,timestamptz,date,text,text,text,text,numeric,text)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('public.action_item_treat(bigint,text,text,boolean,text)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('public.action_item_add_treatment_followup(bigint,text,text,text,text,bigint,boolean)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('public.action_item_attach_finding_photos(bigint,text,text)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('public.action_item_review_closure(bigint,boolean,text)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('public.action_plan_evidence_user_can_upload(text)', 'public.action_item_user_can_read(', 'private.action_item_can_read_before_vessel_window('),
    ('internal_audit_private.add_treatment(uuid,text,text,jsonb)', 'internal_audit_private.can_read_finding(', 'internal_audit_private.can_read_finding_before_vessel_window('),
    ('internal_audit_private.can_upload_photo(text)', 'internal_audit_private.can_read_finding(', 'internal_audit_private.can_read_finding_before_vessel_window('),
    ('documentary_audit_private.add_treatment(uuid,text,text,jsonb)', 'documentary_audit_private.can_read_finding(', 'documentary_audit_private.can_read_finding_before_vessel_window('),
    ('documentary_audit_private.can_upload_file(text)', 'documentary_audit_private.can_read_finding(', 'documentary_audit_private.can_read_finding_before_vessel_window(')
  ) functions(signature, old_guard, frozen_guard) loop
    definition := pg_get_functiondef(item.signature::regprocedure);
    patched := replace(definition, item.old_guard, item.frozen_guard);
    if patched = definition then raise exception 'Garde de mutation introuvable : %', item.signature; end if;
    execute patched;
  end loop;
  for item in select * from (values
    ('internal_audit_private.overview()', 'internal_audit_private.can_read_finding(', 'internal_audit_private.can_read_finding_before_vessel_window('),
    ('documentary_audit_private.overview(text)', 'documentary_audit_private.can_read_finding(', 'documentary_audit_private.can_read_finding_before_vessel_window(')
  ) functions(signature, old_guard, frozen_guard) loop
    definition := pg_get_functiondef(item.signature::regprocedure);
    marker := position('''treatableFindingIds''' in definition);
    if marker = 0 then raise exception 'Capacités de traitement introuvables : %', item.signature; end if;
    patched := substring(definition from 1 for marker - 1)
      || replace(substring(definition from marker), item.old_guard, item.frozen_guard);
    if patched = definition then raise exception 'Garde de traitement introuvable : %', item.signature; end if;
    execute patched;
  end loop;
end;
$migration$;

create or replace function public.action_plan_current_vessel_scope()
returns bigint[] language sql stable security definer set search_path = '' as $function$
  select private.assigned_vessel_read_scope(public.current_planning_company_id());
$function$;

create or replace function public.action_item_user_can_read(target_action_id bigint)
returns boolean language sql stable security definer set search_path = '' as $function$
  select private.action_item_can_read_before_vessel_window(target_action_id)
    or exists(select 1 from public.action_items action
      where action.id = target_action_id
        and coalesce(action.action_type_key, '') <> 'discrimination_human_rights'
        and private.can_read_assigned_vessel(action.company_id, action.vessel_id));
$function$;

create or replace function internal_audit_private.can_read_finding(p_finding_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select internal_audit_private.can_read_finding_before_vessel_window(p_finding_id)
    or exists(select 1 from public.internal_audit_findings finding
      join public.internal_audits audit on audit.id = finding.audit_id and audit.company_id = finding.company_id
      join public.internal_audit_sites site on site.id = audit.site_id and site.company_id = audit.company_id
      where finding.id = p_finding_id and site.kind = 'vessel'
        and private.can_read_assigned_vessel(finding.company_id, site.vessel_id));
$function$;

create or replace function internal_audit_private.can_read_audit(p_audit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select internal_audit_private.can_read_audit_before_vessel_window(p_audit_id)
    or exists(select 1 from public.internal_audits audit
      join public.internal_audit_sites site on site.id = audit.site_id and site.company_id = audit.company_id
      where audit.id = p_audit_id and site.kind = 'vessel'
        and private.can_read_assigned_vessel(audit.company_id, site.vessel_id));
$function$;

create or replace function internal_audit_private.can_read_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select internal_audit_private.can_read_site_before_vessel_window(p_site_id)
    or exists(select 1 from public.internal_audit_sites site where site.id = p_site_id and site.kind = 'vessel'
      and private.can_read_assigned_vessel(site.company_id, site.vessel_id));
$function$;

create or replace function documentary_audit_private.can_read_finding(p_finding_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select documentary_audit_private.can_read_finding_before_vessel_window(p_finding_id)
    or exists(select 1 from public.documentary_audit_findings finding
      join public.documentary_audits audit on audit.id = finding.audit_id and audit.company_id = finding.company_id
      where finding.id = p_finding_id
        and private.can_read_assigned_vessel(finding.company_id, audit.vessel_id));
$function$;

create or replace function documentary_audit_private.can_read_audit(p_audit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select documentary_audit_private.can_read_audit_before_vessel_window(p_audit_id)
    or exists(select 1 from public.documentary_audits audit where audit.id = p_audit_id
      and private.can_read_assigned_vessel(audit.company_id, audit.vessel_id));
$function$;

-- La consultation supplémentaire ne doit pas afficher un formulaire de suivi
-- que la garde métier refuserait. Exposer uniquement les capacités historiques
-- du compte connecté, sans accepter de compte, navire ou société en argument.
create function private.action_plan_followup_action_ids()
returns bigint[] language sql stable security definer set search_path = '' as $function$
  select coalesce(array_agg(action.id order by action.id), '{}'::bigint[])
  from public.action_items action
  where auth.uid() is not null
    and action.company_id = public.current_planning_company_id()
    and public.user_belongs_to_company(action.company_id)
    and action.closed_on is null and action.workflow_status <> 'closed'
    and private.action_item_can_read_before_vessel_window(action.id);
$function$;
revoke all on function private.action_plan_followup_action_ids() from public, anon, authenticated;
grant execute on function private.action_plan_followup_action_ids() to authenticated;
create function public.action_plan_followup_action_ids()
returns bigint[] language sql stable security invoker set search_path = '' as $function$
  select private.action_plan_followup_action_ids();
$function$;
revoke all on function public.action_plan_followup_action_ids() from public, anon, authenticated;
grant execute on function public.action_plan_followup_action_ids() to authenticated;

-- CREATE OR REPLACE conserve les ACL ; aucune API legacy ni permission de
-- mutation supplémentaire n'est exposée. Les fichiers liés suivent ces lecteurs.
comment on function public.action_item_user_can_read(bigint) is 'Lecture métier existante ou fenêtre embarquement ±1 mois ; signalements discrimination/droits humains toujours privés. Aucun changement des writers.';
notify pgrst, 'reload schema';
