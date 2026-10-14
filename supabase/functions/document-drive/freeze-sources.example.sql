-- OPERATOR INPUT ONLY. Not a migration and never run automatically.
-- Apply the generic document_drive_source_freeze migration first.
-- Operator supplies freeze_json: a JSON array of the 507 manifest records.
-- With psql: set freeze_json as a bound psql variable before running this file.
-- For the SQL connector, substitute one correctly quoted JSON literal for
-- :'freeze_json'. Keep document names and this populated input out of Git.
-- Populate before activation/final verification. Keep these paths after purge.
begin;
insert into document_drive_private.frozen_sources(source_bucket,source_path)
select source_bucket,source_path from jsonb_to_recordset(:'freeze_json'::jsonb)
as input(source_bucket text,source_path text);
do $$ begin
  if (select count(*) from document_drive_private.frozen_sources) <> 507 then
    raise exception 'Freeze must cover exactly the 507 reviewed source paths.';
  end if;
end $$;
commit;

-- Service-role clients bypass RLS. During cutover, do not run the two concrete
-- uploaders migrate-qsms-documents-to-storage.ts (procedure-documents) and
-- migrate-project-contract-documents-to-storage.ts (project-files). Their
-- upsert:false prevents overwrites while the source exists, but either could
-- recreate a source after purge. No deployed Edge or SQL/trigger writer was
-- found; project-contract-document-migrate returns 410 MIGRATION_CLOSED.
-- Keep the tombstone paths frozen until creation flows have been migrated.
-- If an operator deliberately retires this temporary freeze, drop the three
-- policies first, then the helper, then the private table, in one transaction.
