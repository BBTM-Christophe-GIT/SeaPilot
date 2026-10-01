import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditFindingStatus } from '../internalAudits/internalAuditModel';
import { mapAuditSite } from '../internalAudits/internalAuditQueries';
import { documentaryFindingIssues, type DocumentaryAudit, type DocumentaryAuditData, type DocumentaryAuditKind, type DocumentaryFinding, type DocumentaryFindingEvent } from './documentaryAuditModel';
import { discardDocumentaryUploads, documentaryFileReferences, hydrateDocumentaryFiles, mapDocumentaryFiles, uploadDocumentaryFiles } from './documentaryAuditFiles';

type Row = Record<string, unknown>;
const text = (x: unknown) => x == null ? '' : String(x);
const nullable = (x: unknown) => x == null ? null : String(x);
const numberOrNull = (x: unknown) => x == null ? null : Number(x);
const rows = (x: unknown): Row[] => Array.isArray(x) ? x : [];
export function mapDocumentaryAudit(row: Row): DocumentaryAudit {
  return { id: text(row.id), companyId: Number(row.company_id), kind: row.kind as DocumentaryAuditKind, siteId: text(row.site_id), year: Number(row.year), title: text(row.title), auditedOn: nullable(row.audited_on), auditorName: text(row.auditor_name), files: mapDocumentaryFiles(row.files), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}
export function mapDocumentaryFinding(row: Row): DocumentaryFinding {
  return { id: text(row.id), companyId: Number(row.company_id), auditId: text(row.audit_id), reference: text(row.reference), category: row.category as DocumentaryFinding['category'], description: text(row.description), assigneePersonId: numberOrNull(row.assignee_person_id), assigneeRole: row.assignee_role == null ? null : row.assignee_role as DocumentaryFinding['assigneeRole'], assigneeVesselId: numberOrNull(row.assignee_vessel_id), assigneeLabel: text(row.assignee_label), openedOn: text(row.opened_on), dueOn: nullable(row.due_on), treatmentDelayValue: numberOrNull(row.treatment_delay_value), treatmentDelayUnit: row.treatment_delay_unit == null ? null : row.treatment_delay_unit as DocumentaryFinding['treatmentDelayUnit'], status: row.status as DocumentaryFinding['status'], treatment: text(row.treatment), resolvedAt: nullable(row.resolved_at), closedAt: nullable(row.closed_at), files: mapDocumentaryFiles(row.files) };
}
export function mapDocumentaryEvent(row: Row): DocumentaryFindingEvent {
  return { id: text(row.id), findingId: text(row.finding_id), actorId: nullable(row.actor_id), actorName: text(row.actor_name), createdAt: text(row.created_at), status: row.status as AuditFindingStatus, treatment: text(row.treatment), files: mapDocumentaryFiles(row.files) };
}
async function rpc(client: SupabaseClient, name: string, args: Row): Promise<Row> {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  if (!result.data || typeof result.data !== 'object') throw new Error('Le serveur n’a pas confirmé l’enregistrement.');
  return result.data as Row;
}
export async function fetchDocumentaryAuditData(client: SupabaseClient, kind: DocumentaryAuditKind): Promise<DocumentaryAuditData> {
  const row = await rpc(client, 'documentary_audits_overview', { p_kind: kind });
  const permissions = (row.permissions || {}) as Row;
  const data: DocumentaryAuditData = { companyId: Number(row.company_id), sites: rows(row.sites).map(mapAuditSite), people: rows(row.people).map((x) => ({ id: Number(x.id), name: text(x.name), functionLabel: text(x.function_label) })), audits: rows(row.audits).map(mapDocumentaryAudit), findings: rows(row.findings).map(mapDocumentaryFinding), events: rows(row.events).map(mapDocumentaryEvent), permissions: { canManage: permissions.canManage === true, treatableFindingIds: Array.isArray(permissions.treatableFindingIds) ? permissions.treatableFindingIds.map(text) : [] } };
  await hydrateDocumentaryFiles(client, [...data.audits.flatMap((x) => x.files), ...data.findings.flatMap((x) => x.files), ...data.events.flatMap((x) => x.files)]);
  return data;
}
export async function saveDocumentaryAudit(client: SupabaseClient, audit: DocumentaryAudit, files: File[] = []): Promise<DocumentaryAudit> {
  if (!Number.isInteger(audit.year) || audit.year < 1900 || audit.year > 9998 || !audit.siteId) throw new Error('Sélectionnez un navire et une année valide.');
  const uploaded = await uploadDocumentaryFiles(client, { companyId: audit.companyId, auditId: audit.id, recordId: audit.id, kind: 'audit' }, files);
  try {
    const saved = mapDocumentaryAudit(await rpc(client, 'documentary_audit_save', { p_payload: { ...audit, files: documentaryFileReferences([...audit.files, ...uploaded]) } }));
    await hydrateDocumentaryFiles(client, saved.files); return saved;
  } catch (error) {
    if (!await discardDocumentaryUploads(client, uploaded)) throw new Error('L’enregistrement n’a pas pu être confirmé. Des fichiers sont conservés : rechargez le dossier avant de réessayer.', { cause: error });
    throw error;
  }
}
export async function saveDocumentaryFinding(client: SupabaseClient, finding: DocumentaryFinding, files: File[] = []): Promise<DocumentaryFinding> {
  const issues = documentaryFindingIssues(finding);
  if (issues.length) throw new Error(issues.join(' '));
  const uploaded = await uploadDocumentaryFiles(client, { companyId: finding.companyId, auditId: finding.auditId, recordId: finding.id, kind: 'finding' }, files);
  try {
    const saved = mapDocumentaryFinding(await rpc(client, 'documentary_audit_save_finding', { p_payload: { ...finding, files: documentaryFileReferences([...finding.files, ...uploaded]) } }));
    await hydrateDocumentaryFiles(client, saved.files); return saved;
  } catch (error) {
    if (!await discardDocumentaryUploads(client, uploaded)) throw new Error('L’écart n’a pas pu être confirmé. Des fichiers sont conservés : rechargez le dossier avant de réessayer.', { cause: error });
    throw error;
  }
}
export async function addDocumentaryTreatment(client: SupabaseClient, findingId: string, status: AuditFindingStatus, treatment: string, files: File[] = []): Promise<DocumentaryFindingEvent> {
  if (!treatment.trim() && !files.length && status !== 'closed') throw new Error('Décrivez le traitement ou joignez une preuve.');
  const kind = status === 'closed' ? 'closure' : 'treatment';
  const scope = files.length ? await rpc(client, 'documentary_audit_upload_scope', { p_audit_id: null, p_finding_id: findingId, p_kind: kind }) : null;
  const uploaded = scope ? await uploadDocumentaryFiles(client, { companyId: Number(scope.company_id), auditId: text(scope.audit_id), recordId: findingId, kind }, files) : [];
  try {
    const saved = mapDocumentaryEvent(await rpc(client, 'documentary_audit_add_treatment', { p_finding_id: findingId, p_status: status, p_treatment: treatment.trim(), p_files: documentaryFileReferences(uploaded) }));
    await hydrateDocumentaryFiles(client, saved.files); return saved;
  } catch (error) {
    if (!await discardDocumentaryUploads(client, uploaded)) throw new Error('Le traitement n’a pas pu être confirmé. Des preuves sont conservées : rechargez le dossier avant de réessayer.', { cause: error });
    throw error;
  }
}
