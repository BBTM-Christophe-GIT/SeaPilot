-- Drive links are private source metadata, protected by the existing procedures RLS.
-- Supabase source objects may be retained as migration backups; Drive takes precedence.
alter table public.procedures
  add column source_google_drive_file_id text,
  add column source_google_drive_path text,
  add constraint procedures_google_drive_link_check check (
    (source_google_drive_file_id is null and source_google_drive_path is null)
    or (
      source_google_drive_file_id is not null
      and source_google_drive_path is not null
      and source_google_drive_file_id ~ '^[a-zA-Z0-9_-]{10,200}$'
      and length(source_google_drive_path) between 1 and 500
      and source_google_drive_path !~ '(^/|(^|/)\.\.?(/|$)|[\\:])'
      and source_google_drive_path ~* '\.(docx?|xlsx?|pptx?|odt|ods|odp|txt)$'
    )
  );

comment on column public.procedures.source_google_drive_file_id is
  'Private Google Drive source. Access also requires Google Drive permission; never copied to a published PDF row.';
comment on column public.procedures.source_google_drive_path is
  'Path relative to the SeaPilot Drive launcher root on each workstation. Update when moving or renaming the file.';
