-- Planning normalizes ends_on to the local calendar day containing ends_at.
-- A midnight-ended embarkation must not authorize the following day's medical
-- records. Require a current half-open timestamp interval in both sources.
create or replace function medical_logbook_private.can_access(p_vessel_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.vessels vessel
    join public.companies company on company.id = vessel.company_id and company.active
    join public.profiles profile on profile.id = auth.uid() and profile.active_company_id = company.id
    join public.company_memberships membership
      on membership.user_id = profile.id and membership.company_id = company.id and membership.active
    where vessel.id = p_vessel_id and vessel.active and vessel.asset_kind = 'vessel'
      and (
        public.has_company_role(company.id, array['admin'])
        or (
          public.has_company_role(company.id, array['capitaine'])
          and exists (
            select 1 from public.people person
            join public.planning_assignments assignment on assignment.company_id = company.id
              and assignment.vessel_id = vessel.id
              and (assignment.crew_person_id = person.id or assignment.captain_person_id = person.id)
            where person.company_id = company.id and person.user_id = auth.uid() and person.active
              and assignment.confirmation_status = 'confirmed'
              and (current_timestamp at time zone 'Europe/Paris')::date between assignment.starts_on and assignment.ends_on
              and assignment.starts_at <= current_timestamp and current_timestamp < assignment.ends_at
              and exists (
                select 1 from (
                  select release.snapshot from public.planning_releases release
                  where release.company_id = company.id order by release.version_number desc limit 1
                ) published
                cross join lateral jsonb_array_elements(coalesce(published.snapshot->'assignments', '[]'::jsonb)) item
                where item->>'id' = assignment.id::text and item->>'vessel_id' = vessel.id::text
                  and item->>'confirmation_status' = 'confirmed'
                  and (item->>'crew_person_id' = person.id::text or item->>'captain_person_id' = person.id::text)
                  and (current_timestamp at time zone 'Europe/Paris')::date::text
                    between item->>'starts_on' and item->>'ends_on'
                  and nullif(item->>'starts_at', '')::timestamptz <= current_timestamp
                  and current_timestamp < nullif(item->>'ends_at', '')::timestamptz
              )
          )
        )
      )
  );
$$;
revoke all on function medical_logbook_private.can_access(bigint) from public, anon, authenticated;
comment on function medical_logbook_private.can_access(bigint) is 'Administrator of active company, or active captain with matching confirmed assignment currently within starts_at/ends_at in both latest published release and live planning. No navigation override.';
