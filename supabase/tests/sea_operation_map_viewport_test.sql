begin;
select no_plan();
create temporary table viewport_fixture(kind text primary key,payload jsonb);
grant all on viewport_fixture to authenticated;
insert into viewport_fixture values('plan','{"version":1,"etd":"","charts":"","waypoints":[],"points":[],"zones":[],"includeInPdf":false}');
select ok(not (select prosecdef from pg_proc where oid='sea_operation_private.validate_map_viewport(jsonb)'::regprocedure),'map validation is pure invoker code');
select ok(not has_function_privilege('anon','sea_operation_private.validate_map_viewport(jsonb)','EXECUTE'),'anonymous gains no map validation RPC');
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),'operation write grants remain restricted');
select ok(not has_table_privilege('authenticated','public.projects','INSERT,UPDATE,DELETE'),'project write grants remain restricted');
set local role authenticated;
select lives_ok(format('select sea_operation_private.validate_map_viewport(%L::jsonb)',value),'inclusive viewport boundary accepted: '||value)
from (values('{"centerLatitude":-90,"centerLongitude":-180,"longitudeSpan":0.02}'),('{"centerLatitude":90,"centerLongitude":180,"longitudeSpan":360}'),
  ('{"centerLatitude":49.654321987,"centerLongitude":-1.987654321,"longitudeSpan":0.020000001}')) valid(value);
select throws_ok(format('select sea_operation_private.validate_map_viewport(%L::jsonb)',value),'22023',null,'invalid viewport rejected: '||value)
from (values('null'),('[]'),('false'),('{}'),('{"centerLatitude":0,"centerLongitude":0}'),
  ('{"centerLatitude":0,"centerLongitude":0,"longitudeSpan":1,"extra":1}'),
  ('{"centerLatitude":"1","centerLongitude":0,"longitudeSpan":1}'),('{"centerLatitude":0,"centerLongitude":null,"longitudeSpan":1}'),
  ('{"centerLatitude":0,"centerLongitude":0,"longitudeSpan":"NaN"}'),('{"centerLatitude":0,"centerLongitude":0,"longitudeSpan":"Infinity"}'),
  ('{"centerLatitude":-90.00001,"centerLongitude":0,"longitudeSpan":1}'),('{"centerLatitude":90.00001,"centerLongitude":0,"longitudeSpan":1}'),
  ('{"centerLatitude":0,"centerLongitude":-180.00001,"longitudeSpan":1}'),('{"centerLatitude":0,"centerLongitude":180.00001,"longitudeSpan":1}'),
  ('{"centerLatitude":0,"centerLongitude":0,"longitudeSpan":0.019999999}'),('{"centerLatitude":0,"centerLongitude":0,"longitudeSpan":360.000001}'),
  ('{"centerLatitude":1e1000,"centerLongitude":0,"longitudeSpan":1}')) invalid(value);
select is(project_location_private.normalize_plan(payload),payload,'legacy project without framing remains unchanged') from viewport_fixture where kind='plan';
select is(project_location_private.normalize_plan(payload||jsonb_build_object('mapViewport',frame))->'mapViewport',frame,'project normalization retains exact manual frame')
from viewport_fixture cross join (values('{"centerLatitude":49.654321987,"centerLongitude":-1.987654321,"longitudeSpan":0.020000001}'::jsonb)) view(frame) where kind='plan';
select throws_ok($$select project_location_private.normalize_plan(payload||'{"mapViewport":null}'::jsonb) from viewport_fixture where kind='plan'$$,'22023',null,'project cannot retain null manual framing');
select throws_ok($$select project_location_private.validate_overlay('{"version":1,"points":[],"zones":[],"mapViewport":{"centerLatitude":0,"centerLongitude":0,"longitudeSpan":1}}','[]')$$,'22023',null,'strict operation overlays do not accept framing');
reset role;
select * from finish();
rollback;
