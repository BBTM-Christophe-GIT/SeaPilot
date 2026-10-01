import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditFinding, AuditFindingEvent, AuditFindingStatus, AuditQuestion, AuditSite,
  AuditTemplate, InternalAudit,
} from './internalAuditModel';
import { discardAuditPhotoUploads, hydrateAuditPhotoUrls, mapAuditPhotos, photoReferences, uploadAuditPhotos } from './internalAuditPhotos';

export interface AuditPersonOption {
  id: number;
  name: string;
  functionLabel: string;
}

export interface InternalAuditData {
  companyId: number;
  sites: AuditSite[];
  templates: AuditTemplate[];
  audits: InternalAudit[];
  findings: AuditFinding[];
  events: AuditFindingEvent[];
  people: AuditPersonOption[];
  permissions: { canManage: boolean; treatableFindingIds: string[] };
}

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? '' : String(value);
const nullableText = (value: unknown) => value == null ? null : String(value);
const nullableNumber = (value: unknown) => value == null ? null : Number(value);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

export function mapAuditSite(row: Row): AuditSite {
  return { id: text(row.id), companyId: Number(row.company_id), name: text(row.name),
    kind: row.kind as AuditSite['kind'], vesselId: nullableNumber(row.vessel_id), anniversaryOn: nullableText(row.anniversary_on) };
}

export function mapAuditTemplate(row: Row): AuditTemplate {
  return { id: text(row.id), companyId: Number(row.company_id), siteId: nullableText(row.site_id),
    name: text(row.name), version: Number(row.version), rows: rows(row.rows) as unknown as AuditQuestion[], active: row.active !== false };
}

export function mapInternalAudit(row: Row): InternalAudit {
  return { id: text(row.id), companyId: Number(row.company_id), siteId: text(row.site_id), templateId: text(row.template_id),
    templateName: text(row.template_name), templateVersion: Number(row.template_version), year: Number(row.year),
    plannedOn: text(row.planned_on), performedOn: nullableText(row.performed_on), auditorName: text(row.auditor_name),
    status: row.status as InternalAudit['status'], rows: rows(row.rows) as unknown as InternalAudit['rows'], completedAt: nullableText(row.completed_at) };
}

export function mapAuditFinding(row: Row): AuditFinding {
  return { id: text(row.id), companyId: Number(row.company_id), auditId: text(row.audit_id), questionId: text(row.question_id),
    reference: text(row.reference), severity: row.severity as AuditFinding['severity'], description: text(row.description),
    assigneePersonId: nullableNumber(row.assignee_person_id), assigneeRole: row.assignee_role == null ? null : row.assignee_role as AuditFinding['assigneeRole'],
    assigneeVesselId: nullableNumber(row.assignee_vessel_id), assigneeLabel: text(row.assignee_label), dueOn: nullableText(row.due_on),
    openedOn: text(row.opened_on), treatmentDelayValue: nullableNumber(row.treatment_delay_value),
    treatmentDelayUnit: row.treatment_delay_unit == null ? null : row.treatment_delay_unit as AuditFinding['treatmentDelayUnit'],
    status: row.status as AuditFinding['status'], treatment: text(row.treatment), resolvedAt: nullableText(row.resolved_at), closedAt: nullableText(row.closed_at), photos: mapAuditPhotos(row.photos) };
}

export function mapAuditFindingEvent(row: Row): AuditFindingEvent {
  return { id: text(row.id), findingId: text(row.finding_id), actorId: nullableText(row.actor_id), actorName: text(row.actor_name),
    createdAt: text(row.created_at), status: row.status as AuditFindingStatus, treatment: text(row.treatment), photos: mapAuditPhotos(row.photos) };
}

async function rpc(client: SupabaseClient, name: string, args?: Row): Promise<Row> {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  if (result.data == null || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw new Error('Réponse du module Audits Internes invalide.');
  }
  return result.data as Row;
}

export async function fetchInternalAuditData(client: SupabaseClient): Promise<InternalAuditData> {
  const data = await rpc(client, 'internal_audits_overview');
  const permissions = (data.permissions || {}) as Row;
  const result: InternalAuditData = {
    companyId: Number(data.company_id), sites: rows(data.sites).map(mapAuditSite), templates: rows(data.templates).map(mapAuditTemplate),
    audits: rows(data.audits).map(mapInternalAudit), findings: rows(data.findings).map(mapAuditFinding), events: rows(data.events).map(mapAuditFindingEvent),
    people: rows(data.people).map((person) => ({ id: Number(person.id), name: text(person.name), functionLabel: text(person.function_label) })),
    permissions: { canManage: permissions.canManage === true, treatableFindingIds: Array.isArray(permissions.treatableFindingIds) ? permissions.treatableFindingIds.map(text) : [] },
  };
  await hydrateAuditPhotoUrls(client, [...result.findings.flatMap((finding) => finding.photos || []), ...result.events.flatMap((event) => event.photos || [])]);
  return result;
}

function validateQuestions(questions: AuditQuestion[]): void {
  if (!questions.length || questions.length > 1000) throw new Error('La grille doit comporter entre 1 et 1 000 questions.');
  const ids = new Set<string>();
  for (const question of questions) {
    if (!question.id.trim() || ids.has(question.id)) throw new Error('Chaque question doit avoir un identifiant unique.');
    ids.add(question.id);
    if (!question.section.trim() || !question.question.trim() || !Number.isFinite(question.maxPoints) || question.maxPoints < 0) {
      throw new Error('Chaque question doit comporter un libellé et un barème positif ou nul.');
    }
  }
}

export async function saveAuditSite(client: SupabaseClient, site: AuditSite): Promise<AuditSite> {
  if (!site.name.trim()) throw new Error('Le nom du site est obligatoire.');
  return mapAuditSite(await rpc(client, 'internal_audit_save_site', { p_payload: site }));
}

export async function saveAuditTemplate(client: SupabaseClient, template: AuditTemplate): Promise<AuditTemplate> {
  if (!template.name.trim()) throw new Error('Le nom de la grille est obligatoire.');
  validateQuestions(template.rows);
  return mapAuditTemplate(await rpc(client, 'internal_audit_save_template', { p_payload: template }));
}

export async function saveInternalAudit(client: SupabaseClient, audit: InternalAudit): Promise<InternalAudit> {
  validateQuestions(audit.rows);
  if (!audit.plannedOn || !audit.siteId || !audit.templateId || !Number.isInteger(audit.year)) throw new Error('Le site, la grille et la date prévue sont obligatoires.');
  if (audit.status === 'completed' && (!audit.performedOn || !audit.auditorName.trim() || audit.rows.some((row) => !row.answer))) {
    throw new Error('Renseignez la date, l’auditeur et toutes les réponses avant de terminer l’audit.');
  }
  return mapInternalAudit(await rpc(client, 'internal_audit_save', { p_payload: audit }));
}

export async function saveAuditFinding(client: SupabaseClient, finding: AuditFinding, files: File[] = []): Promise<AuditFinding> {
  const person = finding.assigneePersonId != null;
  const role = finding.assigneeRole != null && finding.assigneeVesselId != null;
  if (!finding.description.trim()) throw new Error('La description est obligatoire.');
  if (finding.severity !== 'remark' && (!Number.isInteger(finding.treatmentDelayValue) || (finding.treatmentDelayValue || 0) < 1
    || (finding.treatmentDelayValue || 0) > 3650 || !['days', 'weeks', 'months'].includes(finding.treatmentDelayUnit || ''))) {
    throw new Error('Le délai de traitement doit être une durée de 1 à 3 650 jours, semaines ou mois.');
  }
  if (person === role || (person && (finding.assigneeRole != null || finding.assigneeVesselId != null))) {
    throw new Error('Désignez une personne ou une fonction sur un navire pour traiter l’écart.');
  }
  const uploaded = await uploadAuditPhotos(client, { companyId: finding.companyId, auditId: finding.auditId, findingId: finding.id, kind: 'finding' }, files);
  try {
    const payload = { ...finding, photos: photoReferences([...(finding.photos || []), ...uploaded]) };
    return mapAuditFinding(await rpc(client, 'internal_audit_save_finding', { p_payload: payload }));
  } catch (error) {
    const cleaned = await discardAuditPhotoUploads(client, uploaded);
    if (!cleaned) throw new Error('L’enregistrement a échoué et certaines photos n’ont pas pu être nettoyées. Rechargez l’audit avant de réessayer.', { cause: error });
    throw error;
  }
}

export async function addAuditFindingTreatment(client: SupabaseClient, findingId: string, status: AuditFindingStatus, treatment: string, files: File[] = []): Promise<AuditFindingEvent> {
  if (!treatment.trim() && !files.length && status !== 'closed') throw new Error('Ajoutez un commentaire ou une photo au traitement.');
  const kind = status === 'closed' ? 'closure' : 'treatment';
  const scope = files.length ? await rpc(client, 'internal_audit_photo_upload_scope', { p_finding_id: findingId, p_kind: kind }) : null;
  const uploaded = scope ? await uploadAuditPhotos(client, { companyId: Number(scope.company_id), auditId: text(scope.audit_id), findingId, kind }, files) : [];
  try {
    return mapAuditFindingEvent(await rpc(client, 'internal_audit_add_treatment', { p_finding_id: findingId, p_status: status, p_treatment: treatment.trim(), p_photos: photoReferences(uploaded) }));
  } catch (error) {
    const cleaned = await discardAuditPhotoUploads(client, uploaded);
    if (!cleaned) throw new Error('Le traitement n’a pas pu être confirmé et certaines photos sont conservées. Rechargez l’audit avant de réessayer.', { cause: error });
    throw error;
  }
}
