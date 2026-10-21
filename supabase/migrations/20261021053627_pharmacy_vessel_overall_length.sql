-- Append the vessel record's original text length for the shared fleet sorter.
-- Existing consumers retain the same first five fields, authorization and grants.
-- PostgreSQL requires recreation to extend RETURNS TABLE; never cascade into dependencies.
set local lock_timeout='5s';

drop function public.pharmacy_available_vessels();
drop function pharmacy_private.available_vessels();

create function pharmacy_private.available_vessels()
returns table(id bigint,company_id bigint,name text,acronym text,can_manage boolean,length_overall text)
language sql stable security definer set search_path='' as $$
  select v.id,v.company_id,v.name,v.acronym,pharmacy_private.can_manage(v.company_id,v.id),v.length_overall
  from public.vessels v where pharmacy_private.can_access(v.company_id,v.id) order by v.name,v.id;
$$;
create function public.pharmacy_available_vessels()
returns table(id bigint,company_id bigint,name text,acronym text,can_manage boolean,length_overall text)
language sql stable security invoker set search_path='' as $$ select * from pharmacy_private.available_vessels(); $$;

revoke all on function pharmacy_private.available_vessels() from public,anon,authenticated,service_role;
grant execute on function pharmacy_private.available_vessels() to authenticated;
revoke all on function public.pharmacy_available_vessels() from public,anon,authenticated,service_role;
grant execute on function public.pharmacy_available_vessels() to authenticated,service_role;

notify pgrst,'reload schema';
