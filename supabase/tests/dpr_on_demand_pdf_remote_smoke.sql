select '1..2';

select case when exists (
  select 1 from pg_trigger
  where tgname = 'dpr_files_reject_stored_pdf'
    and tgrelid = 'public.dpr_files'::regclass
    and not tgisinternal
)
  then 'ok 1 - the anti-persistence trigger is installed'
  else 'not ok 1 - the anti-persistence trigger is missing'
end;

select case when pg_get_functiondef('public.dpr_reject_stored_pdf()'::regprocedure) ilike '%must not be stored%'
  then 'ok 2 - the rejection function is explicit'
  else 'not ok 2 - the rejection function is incomplete'
end;
