-- Keep the two legacy QSMS source formats that SharePoint exposes outside
-- Microsoft Graph's text-document search results.
update storage.buckets
set allowed_mime_types = array(
  select distinct unnest(
    coalesce(allowed_mime_types, array[]::text[]) || array[
      'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
      'text/html'
    ]::text[]
  )
)
where id = 'procedure-documents';
