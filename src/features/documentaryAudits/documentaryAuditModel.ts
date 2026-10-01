import { auditDueOnFromDuration, todayAuditParis, type AuditAssigneeRole, type AuditDeadlineUnit, type AuditFindingStatus, type AuditSite } from '../internalAudits/internalAuditModel';
import type { AuditPersonOption } from '../internalAudits/internalAuditQueries';

export type DocumentaryAuditKind = 'ovid' | 'ecmid' | 'external_ism' | 'client';
export type DocumentaryFindingCategory = 'finding' | 'major' | 'minor' | 'remark';
export interface AuditAttachment { id: string; fileName: string; storagePath: string; mimeType: string; sizeBytes: number; url: string }
export interface DocumentaryAudit {
  id: string; companyId: number; kind: DocumentaryAuditKind; siteId: string; year: number;
  title: string; plannedOn: string | null; auditedOn: string | null; auditorName: string; files: AuditAttachment[];
  createdAt: string; updatedAt: string;
}
export interface DocumentaryFinding {
  id: string; companyId: number; auditId: string; reference: string; category: DocumentaryFindingCategory; description: string;
  assigneePersonId: number | null; assigneeRole: AuditAssigneeRole | null; assigneeVesselId: number | null; assigneeLabel: string;
  openedOn: string; dueOn: string | null; treatmentDelayValue: number | null; treatmentDelayUnit: AuditDeadlineUnit | null;
  status: AuditFindingStatus; treatment: string; resolvedAt: string | null; closedAt: string | null; files: AuditAttachment[];
}
export interface DocumentaryFindingEvent { id: string; findingId: string; actorId: string | null; actorName: string; createdAt: string; status: AuditFindingStatus; treatment: string; files: AuditAttachment[] }
export interface DocumentaryAuditData {
  companyId: number; sites: AuditSite[]; people: AuditPersonOption[];
  audits: DocumentaryAudit[]; findings: DocumentaryFinding[]; events: DocumentaryFindingEvent[];
  permissions: { canManage: boolean; treatableFindingIds: string[] };
}
export const DOCUMENTARY_AUDIT_LABELS: Record<DocumentaryAuditKind, string> = { ovid: 'OVID', ecmid: 'eCMID', external_ism: 'Audit ISM Externe', client: 'Audit Client' };
export const DOCUMENTARY_FINDING_LABELS: Record<DocumentaryFindingCategory, string> = { finding: 'Findings', major: 'Non Conformité Majeure', minor: 'Non Conformité Mineure', remark: 'Remarque' };
export const DOCUMENTARY_STATUS_LABELS: Record<AuditFindingStatus, string> = { open: 'Ouvert', in_progress: 'En traitement', resolved: 'Traité, à vérifier', closed: 'Clôturé' };
export function defaultDocumentaryDuration(category: DocumentaryFindingCategory): { amount: number; unit: AuditDeadlineUnit } | null {
  return category === 'major' ? { amount: 1, unit: 'weeks' } : category === 'minor' ? { amount: 1, unit: 'months' } : null;
}
export function documentaryFindingIssues(finding: DocumentaryFinding): string[] {
  const issues: string[] = [];
  if (!finding.description.trim()) issues.push('Décrivez le constat.');
  const personal = Number.isInteger(finding.assigneePersonId) && Number(finding.assigneePersonId) > 0;
  const collective = finding.assigneeRole !== null && ['captain', 'chief_engineer', 'crew'].includes(finding.assigneeRole) && Number(finding.assigneeVesselId) > 0;
  if (personal === collective || (personal && (finding.assigneeRole !== null || finding.assigneeVesselId !== null))) issues.push('Désignez une personne ou une fonction sur un navire.');
  const duration = finding.treatmentDelayValue !== null && finding.treatmentDelayUnit !== null ? { amount: finding.treatmentDelayValue, unit: finding.treatmentDelayUnit } : null;
  const hasDuration = finding.treatmentDelayValue !== null || finding.treatmentDelayUnit !== null;
  const due = auditDueOnFromDuration(finding.openedOn, duration);
  if (finding.category === 'remark' && (hasDuration || finding.dueOn)) issues.push('Une remarque ne comporte pas de délai.');
  if (['major', 'minor'].includes(finding.category) && !due) issues.push('Renseignez un délai de traitement.');
  if (finding.category === 'finding' && (finding.dueOn || hasDuration) && !due) issues.push('Le délai est invalide.');
  return issues;
}
export function documentaryFindingOverdue(finding: DocumentaryFinding, today = todayAuditParis()): boolean {
  return Boolean(finding.dueOn && finding.dueOn < today && !['resolved', 'closed'].includes(finding.status));
}
