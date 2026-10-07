-- Catalogue removal archives a choice; assigned document tags and searches
-- retain their existing labels. Explicit creation may reactivate the choice.
alter table public.procedure_tag_catalogue
  add column active boolean not null default true,
  add constraint procedure_tag_catalogue_single_name_check check (name !~ '[,;]');

-- prepare_document_tags already uses ON CONFLICT DO NOTHING. An old document
-- therefore retains its archived tags without making them active choices again.
comment on column public.procedure_tag_catalogue.active is
  'False hides a reusable choice without removing assigned document tags. Only an explicit manager catalogue upsert reactivates it.';
