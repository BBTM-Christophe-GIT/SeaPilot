begin;
select no_plan();
create temporary table icon_fixture(kind text primary key,payload jsonb);
grant select on icon_fixture to authenticated;
insert into icon_fixture values('point','{"id":"isolated","number":"P1","descriptionVhf":"Balise","latitude":"49.65","longitude":"-1.62","ukc":"historique","eta":"2026-10-27T12:07","denseTraffic":false}');
insert into icon_fixture select 'plan',jsonb_build_object('version',1,'etd','','charts','','includeInPdf',false,'waypoints','[]'::jsonb,'points',jsonb_build_array(payload),'zones','[]'::jsonb) from icon_fixture where kind='point';
select ok(not (select prosecdef from pg_proc where oid='project_location_private.waypoint(jsonb,boolean)'::regprocedure),'icon canonicalizer remains pure invoker code');
select ok(not has_function_privilege('anon','project_location_private.waypoint(jsonb,boolean)','EXECUTE'),'anonymous gains no function privilege');
select ok(not has_table_privilege('authenticated','public.projects','INSERT,UPDATE,DELETE'),'project direct writes remain revoked');
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),'operation direct writes remain revoked');
set local role authenticated;
select is(project_location_private.waypoint(payload,true),payload,'legacy isolated point stays byte-for-byte canonical without inferred icon') from icon_fixture where kind='point';
select is(project_location_private.waypoint(payload),payload,'legacy route point stays canonical without a symbol') from icon_fixture where kind='point';
select is(project_location_private.normalize_plan(payload),payload,'legacy location plan remains unchanged') from icon_fixture where kind='plan';
select is(project_location_private.waypoint(payload||jsonb_build_object('isolatedPointIcon',icon),true)->>'isolatedPointIcon',icon,'valid isolated icon retained: '||icon)
from icon_fixture cross join unnest(array['buoy','pin','platform','wind-farm','mooring','anchor']) icon where kind='point';
select lives_ok(format($$select project_location_private.validate_overlay((payload-array['etd','charts','waypoints','includeInPdf'])||jsonb_build_object('points',jsonb_build_array(jsonb_set(payload#>'{points,0}','{isolatedPointIcon}',%L::jsonb))),'[]') from icon_fixture where kind='plan'$$,to_jsonb(icon)::text),'operation overlay retains isolated icon: '||icon)
from unnest(array['buoy','pin','platform','wind-farm','mooring','anchor']) icon;
select throws_ok(format($$select project_location_private.waypoint(payload||jsonb_build_object('isolatedPointIcon',%L::jsonb),true) from icon_fixture where kind='point'$$,value),'22023',null,'malformed isolated icon rejected: '||value)
from (values('null'),('1'),('true'),('{}'),('[]'),('""'),('"square"'),('"vessel"'),('"Buoy"'),('"wind_farm"')) invalid(value);
select throws_ok(format($$select project_location_private.waypoint(payload||jsonb_build_object('isolatedPointIcon',%L),false) from icon_fixture where kind='point'$$,icon),'22023',null,'symbol forbidden on route: '||icon)
from unnest(array['buoy','pin','platform','wind-farm','mooring','anchor']) icon;
select throws_ok($$select project_location_private.waypoint(payload||'{"isolatedPointIcon":null}'::jsonb) from icon_fixture where kind='point'$$,'22023',null,'legacy one-argument helper stays strict route validation');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set(payload,'{waypoints}',jsonb_build_array(payload#>'{points,0}'||'{"id":"route","isolatedPointIcon":"anchor"}'::jsonb))) from icon_fixture where kind='plan'$$,'22023',null,'project route cannot retain an isolated symbol');
select throws_ok($$select project_location_private.normalize_plan(payload||'{"zones":[{"id":"zone","name":"","vertices":[],"isolatedPointIcon":"anchor"}]}'::jsonb) from icon_fixture where kind='plan'$$,'22023',null,'zone cannot retain an isolated symbol');
select throws_ok($$select project_location_private.normalize_plan(payload||'{"zones":[{"id":"zone","name":"","vertices":[{"latitude":"","longitude":"","isolatedPointIcon":"anchor"}]}]}'::jsonb) from icon_fixture where kind='plan'$$,'22023',null,'zone vertex cannot retain an isolated symbol');
select throws_ok($$select project_location_private.validate_overlay('{"version":1,"points":[],"zones":[]}','[{"id":"route","isolatedPointIcon":"anchor"}]')$$,'22023',null,'overlay identity guard also refuses route symbols');
reset role;
select * from finish();
rollback;
