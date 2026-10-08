-- Legacy imports may have no collaborator id. Metadata-only updates must not
-- invent an identity; validate tenant references on inserts and reassignment.
drop trigger hr_documents_company_guard on public.hr_documents;
create trigger hr_documents_company_guard
before insert or update of company_id, person_id on public.hr_documents
for each row execute function public.assert_planning_company_references();
