-- Projects phase 6: explicitly remove anonymous/public privileges from the domain.
-- RLS remains the row-level authority for authenticated users, while anonymous
-- callers must not receive table, sequence or RPC capabilities at all.

revoke all on table
  public.clients,
  public.projects,
  public.project_contracts,
  public.project_documents,
  public.contract_documents,
  public.project_number_counters,
  public.project_change_log
from public, anon;

revoke all on sequence
  public.clients_id_seq,
  public.projects_id_seq,
  public.project_contracts_id_seq,
  public.project_documents_id_seq,
  public.contract_documents_id_seq,
  public.project_change_log_id_seq
from public, anon;

comment on table public.projects is
  'SeaPilot catalog project. Structured data is stored in Supabase; project files remain exclusively in SharePoint.';
