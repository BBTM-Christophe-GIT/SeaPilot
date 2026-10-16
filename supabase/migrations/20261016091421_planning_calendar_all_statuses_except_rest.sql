-- Personal calendar subscriptions retain their existing URLs, authorization and
-- published-only scope. Export every supported status; never export free text.
create or replace function private.planning_calendar_status(p_status text)
returns text
language sql immutable security invoker set search_path = ''
as $$
  select case when status_key like '%repos%' or status_key like '%debar%' then 'Repos' else case status_key
    when 'enmer' then 'En Mer'
    when 'embarque' then 'En Mer'
    when 'travaille' then 'En Mer'
    when 'aterre' then 'À terre'
    when 'repos' then 'Repos'
    when 'debarque' then 'Repos'
    when 'vacance' then 'Vacances'
    when 'vacances' then 'Vacances'
    when 'conge' then 'Congés'
    when 'conges' then 'Congés'
    when 'congepaternite' then 'Congés Paternité'
    when 'congespaternite' then 'Congés Paternité'
    when 'congepaternites' then 'Congés Paternité'
    when 'congespaternites' then 'Congés Paternité'
    when 'arretmaladie' then 'Arrêt Maladie'
    when 'accidentdutravail' then 'Accident du Travail'
    when 'arretdetravail' then 'Arrêt de travail'
    when 'arrettravail' then 'Arrêt de travail'
    when 'formation' then 'Formation'
    when 'extra' then 'Extra'
    when 'rtt' then 'RTT'
    else 'Indisponible'
  end end
  from (select regexp_replace(translate(lower(coalesce(p_status, '')),
    'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc'), '[^a-z0-9]', '', 'g') as status_key) normalized;
$$;

create or replace function private.personal_planning_calendar(p_user_id uuid, p_company_id bigint, p_person_id bigint)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  latest_release public.planning_releases%rowtype;
  calendar_events jsonb;
begin
  select * into latest_release from public.planning_releases release
    where release.company_id = p_company_id order by release.version_number desc limit 1;
  if latest_release.id is null then
    return jsonb_build_object('calendar_name', 'SeaPilot — Mon planning',
      'published_at', null, 'revision', 0, 'events', '[]'::jsonb);
  end if;
  with current_days as materialized (
    select * from private.planning_calendar_days(latest_release.snapshot, p_company_id, p_person_id)
    where summary <> 'Repos'
  ), removed_days as (
    -- Include the latest release so existing rest entries are cancelled even
    -- when they never appeared in an earlier release. Keep durable tombstones
    -- for clients that skip releases, with the same opaque per-date UID.
    select distinct on (historical.work_date) historical.*
    from public.planning_releases release
    cross join lateral private.planning_calendar_days(release.snapshot, p_company_id, p_person_id) historical
    where release.company_id = p_company_id and release.version_number <= latest_release.version_number
      and not exists (select 1 from current_days where current_days.work_date = historical.work_date)
    order by historical.work_date, release.version_number desc
  ), events as (
    select current_days.*, 'confirmed'::text as status from current_days
    union all
    select work_date, case when summary = 'Repos' then 'Planning supprimé' else summary end,
      location, 'cancelled'::text from removed_days
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'uid', encode(extensions.digest(p_user_id::text || ':' || p_company_id::text || ':' || events.work_date::text, 'sha256'), 'hex') || '@seapilot',
    'start_date', events.work_date, 'end_date', events.work_date + 1,
    'summary', events.summary, 'location', events.location, 'status', events.status
  ) order by events.work_date), '[]'::jsonb) into calendar_events from events;

  return jsonb_build_object('calendar_name', 'SeaPilot — Mon planning',
    'published_at', latest_release.published_at, 'revision', latest_release.version_number, 'events', calendar_events);
end;
$$;

revoke all on function private.planning_calendar_status(text) from public, anon, authenticated, service_role;
revoke all on function private.personal_planning_calendar(uuid,bigint,bigint) from public, anon, authenticated, service_role;
