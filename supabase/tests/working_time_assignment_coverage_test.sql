begin;
select no_plan();
insert into public.companies(code,name) values('wt-coverage-chain','Synthetic coverage chain');
insert into public.planning_work_rest_policies(company_id,name,scope,effective_from,max_work_24h,min_rest_24h,max_work_7d,min_rest_7d,min_consecutive_rest_hours,max_rest_periods_24h,night_starts_at,night_ends_at,max_night_work_24h,max_amplitude_hours,max_interval_between_rests_hours,include_handover,active)
select id,'Coverage fixture','company','2026-01-01',12,10,84,77,6,4,'22:00','06:00',8,14,14,false,true from public.companies where code='wt-coverage-chain';
select set_config('test.coverage_policy',(select id::text from public.planning_work_rest_policies where name='Coverage fixture'),true);
create temp table coverage_context(label text,context jsonb);
insert into coverage_context values
('safe','[{"starts_at":"2026-10-12T10:00:00Z","ends_at":"2026-10-12T12:30:00Z"},{"starts_at":"2026-10-12T14:00:00Z","ends_at":"2026-10-12T22:00:00Z"},{"starts_at":"2026-10-13T04:00:00Z","ends_at":"2026-10-13T12:00:00Z"}]'),
('actual','[{"starts_at":"2026-10-12T10:00:00Z","ends_at":"2026-10-12T12:30:00Z"},{"starts_at":"2026-10-12T14:00:00Z","ends_at":"2026-10-12T22:00:00Z"},{"starts_at":"2026-10-13T04:00:00Z","ends_at":"2026-10-13T12:00:00Z"},{"starts_at":"2026-10-13T18:00:00Z","ends_at":"2026-10-13T23:00:00Z"},{"starts_at":"2026-10-14T04:00:00Z","ends_at":"2026-10-14T12:00:00Z"},{"starts_at":"2026-10-14T15:30:00Z","ends_at":"2026-10-14T19:30:00Z"}]');
create temp table coverage_results as select label,private.working_time_coverage_for_scope(context,'2026-10-12T00:00:00Z','2026-10-19T00:00:00Z','UTC',current_setting('test.coverage_policy')::bigint) result from coverage_context
union all select 'empty',private.working_time_coverage_for_scope('[]','2026-10-12T00:00:00Z','2026-10-19T00:00:00Z','UTC',current_setting('test.coverage_policy')::bigint);
select ok((select result->>'status' in('covered','projected') from coverage_results where label='empty'),'a seven-day assignment admits a complete chain');
select ok((select result->>'status' in('covered','projected') from coverage_results where label='safe'),'one unfavorable sliding window does not make the assignment noncompliant');
select is((private.working_time_window_verdict((select context from coverage_context where label='safe'),'2026-10-13T10:00:00Z','UTC',current_setting('test.coverage_policy')::bigint)->>'rest_24h_seconds')::numeric,27000::numeric,'Oct13 10:00 has the explained 7.5h rest but other windows may work');
select is((select result->>'status' from coverage_results where label='actual'),'uncovered','the complete known 17h cycle cannot be hidden by ending a witness earlier');
select ok((select exists(select 1 from jsonb_to_recordset(result->'uncovered_ranges') g(starts_at timestamptz,ends_at timestamptz) where g.starts_at<'2026-10-14T12:00:00Z' and g.ends_at>'2026-10-13T18:00:00Z') from coverage_results where label='actual'),'the uncovered gap identifies the actual affected work');
select ok(not exists(select 1 from coverage_results c cross join lateral jsonb_to_recordset(c.result->'windows') w(starts_at timestamptz,ends_at timestamptz) where w.ends_at-w.starts_at<>interval '24 hours'),'every witness window has exactly 24 elapsed hours');
select ok(not exists(select 1 from coverage_results c cross join lateral jsonb_to_recordset(c.result->'windows') w(starts_at timestamptz,ends_at timestamptz) join coverage_context s on s.label=c.label where not(private.working_time_window_verdict(s.context,w.ends_at,'UTC',current_setting('test.coverage_policy')::bigint)->>'valid')::boolean),'every emitted witness passes every configured threshold');
select ok(not exists(select 1 from (select label,starts_at,lag(ends_at) over(partition by label order by starts_at,ends_at) previous_end from coverage_results c cross join lateral jsonb_to_recordset(c.result->'windows') w(starts_at timestamptz,ends_at timestamptz) where label in('safe','empty')) w where previous_end<starts_at),'successful witness windows overlap or touch continuously');
select ok(not has_function_privilege('authenticated','private.working_time_coverage_for_scope(jsonb,timestamptz,timestamptz,text,bigint)','EXECUTE'),'private coverage cannot bypass profile authorization');
create temp table coverage_dst as select private.working_time_coverage_for_scope('[]',
  '2026-10-25 00:00:00 Europe/Paris','2026-11-01 00:00:00 Europe/Paris','Europe/Paris',
  current_setting('test.coverage_policy')::bigint) result;
select ok((select result->>'status' in('covered','projected') from coverage_dst),'the autumn DST seven-day assignment remains continuously covered');
select ok(not exists(select 1 from coverage_dst c cross join lateral jsonb_to_recordset(c.result->'windows') w(starts_at timestamptz,ends_at timestamptz)
  where w.ends_at-w.starts_at<>interval '24 hours'),'DST witness windows use exactly 24 elapsed hours rather than calendar days');
update public.planning_work_rest_policies set max_night_work_24h=1 where id=current_setting('test.coverage_policy')::bigint;
select is(private.working_time_coverage_for_scope(
  '[{"starts_at":"2026-10-12T22:00:00Z","ends_at":"2026-10-13T06:00:00Z"}]',
  '2026-10-12T22:00:00Z','2026-10-13T06:00:00Z','UTC',current_setting('test.coverage_policy')::bigint)->>'status',
  'uncovered','configured night-work limits participate in the complete coverage proof');
update public.planning_work_rest_policies set max_night_work_24h=8 where id=current_setting('test.coverage_policy')::bigint;
insert into public.planning_work_rest_policies(company_id,name,scope,effective_from,max_work_24h,min_rest_24h,max_work_7d,min_rest_7d,min_consecutive_rest_hours,max_rest_periods_24h,night_starts_at,night_ends_at,max_night_work_24h,max_amplitude_hours,max_interval_between_rests_hours,include_handover,active)
select company_id,'Later coverage policy','company','2026-10-14',3,10,84,77,6,4,'22:00','06:00',8,14,14,false,true
from public.planning_work_rest_policies where id=current_setting('test.coverage_policy')::bigint;
select ok(private.working_time_window_verdict('[{"starts_at":"2026-10-14T08:00:00Z","ends_at":"2026-10-14T12:00:00Z"}]',
  '2026-10-14T16:00:00Z','UTC',current_setting('test.coverage_policy')::bigint)->'violation_codes' ? 'work_24h',
  'the policy effective at the actual window end supersedes the reference policy');
select * from finish();
rollback;
