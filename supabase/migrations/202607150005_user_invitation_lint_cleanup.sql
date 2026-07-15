-- Keep the already-deployed invitation function behavior unchanged while
-- making its locked person row an explicit part of the validation branch.
-- Fresh databases already receive the clean body from migration 202607150004;
-- this guarded patch aligns databases that applied its first revision.
--
-- Rollback: no functional rollback is required. Restoring the prior branch
-- would only reintroduce a PL/pgSQL lint warning.

do $migration$
declare
  current_definition text;
  patched_definition text;
begin
  select pg_get_functiondef(
    'public.provision_invited_seapilot_user(uuid,text,text,text[],bigint,uuid)'::regprocedure
  ) into current_definition;

  if position('if target_person.id is null then' in current_definition) > 0 then
    return;
  end if;

  patched_definition := replace(
    current_definition,
    'if not found then',
    'if target_person.id is null then'
  );

  if patched_definition = current_definition then
    raise exception 'USER_INVITATION_LINT_PATCH_NOT_APPLICABLE';
  end if;

  execute patched_definition;
end;
$migration$;
