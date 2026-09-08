-- Keep the pre-merge production client compatible while the QSMS UI, imports,
-- and typed data contract stop using this SharePoint-era field. These nullable
-- columns are intentionally inert and may be removed in a later release after
-- every client has moved to the explicit status lifecycle.
alter table public.procedures
  add column if not exists approval_status text;

alter table public.published_procedures
  add column if not exists approval_status text;

update public.procedures
set approval_status = case status
  when 'published' then 'Document approuve'
  when 'approved' then 'Document approuve'
  when 'review' then 'En cours de validation'
  when 'archived' then 'Archive'
  else 'En cours de creation'
end
where approval_status is null;

update public.published_procedures
set approval_status = case status
  when 'published' then 'Document approuve'
  when 'approved' then 'Document approuve'
  when 'review' then 'En cours de validation'
  when 'archived' then 'Archive'
  else 'En cours de creation'
end
where approval_status is null;

comment on column public.procedures.approval_status is
  'Deprecated compatibility column. SeaPilot QSMS no longer reads, displays, or writes this field.';

comment on column public.published_procedures.approval_status is
  'Deprecated compatibility column. SeaPilot QSMS no longer reads, displays, or writes this field.';
