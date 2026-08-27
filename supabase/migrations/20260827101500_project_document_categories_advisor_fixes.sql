-- Keep the categorized project-document schema efficient and avoid overlapping
-- permissive SELECT policies reported by the Supabase database advisors.

create index if not exists project_document_categories_created_by_idx
  on public.project_document_categories (created_by)
  where created_by is not null;

create index if not exists project_document_categories_updated_by_idx
  on public.project_document_categories (updated_by)
  where updated_by is not null;

create index if not exists project_generated_documents_category_company_idx
  on public.project_generated_documents (company_id, category_key)
  where category_key is not null;

create index if not exists project_generated_documents_subcategory_company_idx
  on public.project_generated_documents (company_id, subcategory_key)
  where subcategory_key is not null;

drop policy if exists project_document_categories_company_write
  on public.project_document_categories;

create policy project_document_categories_company_insert
  on public.project_document_categories
  for insert to authenticated
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

create policy project_document_categories_company_update
  on public.project_document_categories
  for update to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

create policy project_document_categories_company_delete
  on public.project_document_categories
  for delete to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );
