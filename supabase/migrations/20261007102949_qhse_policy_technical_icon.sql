-- Add the Technique wrench without changing strategic-axis IDs or permissions.
alter table public.qhse_policy_processes
  drop constraint qhse_policy_processes_icon_key_check,
  add constraint qhse_policy_processes_icon_key_check
    check(icon_key in ('safety','ethics','health','environment','customer','technical','cybersecurity','general'));

-- Preserve the complete existing RPC implementation, owner and EXECUTE grants.
do $technical_icon$
declare previous text; updated text;
begin
  previous:=pg_get_functiondef('qhse_policy_private.save_process(uuid,text,text,integer,integer,text)'::regprocedure);
  updated:=replace(previous,
    $old$p_icon_key not in ('safety','ethics','health','environment','customer','cybersecurity','general')$old$,
    $new$p_icon_key not in ('safety','ethics','health','environment','customer','technical','cybersecurity','general')$new$);
  if updated=previous then raise exception 'Expected QHSE icon validation missing'; end if;
  execute updated;
end $technical_icon$;

-- Existing Technique axes received general before a dedicated icon existed.
-- Preserve any other explicit choice and invalidate stale editor revisions.
update public.qhse_policy_processes
set icon_key='technical',revision=revision+1,updated_at=clock_timestamp()
where icon_key='general' and lower(btrim(name))='technique';

notify pgrst,'reload schema';
