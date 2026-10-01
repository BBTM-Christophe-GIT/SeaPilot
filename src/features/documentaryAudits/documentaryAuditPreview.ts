import { todayAuditParis, auditDueOnFromDuration, type AuditSite } from '../internalAudits/internalAuditModel';
import { DOCUMENTARY_AUDIT_LABELS, type AuditAttachment, type DocumentaryAudit, type DocumentaryAuditData, type DocumentaryAuditKind, type DocumentaryFinding } from './documentaryAuditModel';

/** A valid one-page demo PDF, created only in memory for safe preview downloads. */
function previewPdf(label: string, year: number): AuditAttachment {
  const content = `BT /F1 18 Tf 50 770 Td (AUDIT DE DEMONSTRATION) Tj 0 -32 Td /F1 12 Tf (${label.replace(/[^\x20-\x7e]/g, '')} - GOURY - ${year}) Tj 0 -24 Td (Ce fichier illustre un dossier documentaire SeaPilot.) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { id: `preview-report-${year}`, fileName: `Rapport-${label.replace(/\W+/g, '-')}-GOURY-${year}.pdf`, storagePath: `preview/report-${year}`, mimeType: 'application/pdf', sizeBytes: pdf.length, url: `data:application/pdf;base64,${btoa(pdf)}` };
}

export function createDocumentaryAuditPreviewData(kind: DocumentaryAuditKind): DocumentaryAuditData {
  const names = ['GOURY', 'LE ROZEL', 'LANDEMER', 'SUROIT', 'KROKDUR', 'HIRONDELLE DE LA MANCHE'];
  const sites: AuditSite[] = names.map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`, companyId: 1, name, kind: 'vessel', vesselId: 9402 + index, anniversaryOn: null }));
  const year = Number(todayAuditParis().slice(0, 4));
  const label = DOCUMENTARY_AUDIT_LABELS[kind];
  const csv = 'Controle;Resultat\nDocuments de bord;A verifier\nExercices de securite;Conforme\n';
  const audit: DocumentaryAudit = { id: `documentary-${kind}-${year}`, companyId: 1, kind, siteId: sites[0].id, year, title: `${label} · GOURY · ${year}`, auditedOn: todayAuditParis(), auditorName: 'Auditeur de démonstration', files: [previewPdf(label, year), { id: 'preview-checklist', fileName: `Checklist-GOURY-${year}.csv`, storagePath: 'preview/checklist', mimeType: 'text/csv', sizeBytes: csv.length, url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}` }], createdAt: `${year}-01-15T10:00:00Z`, updatedAt: new Date().toISOString() };
  const finding: DocumentaryFinding = { id: `documentary-finding-${kind}`, companyId: 1, auditId: audit.id, reference: 'F-01', category: 'minor', description: 'Conserver la preuve du contrôle et compléter le registre de sécurité.', assigneePersonId: null, assigneeRole: 'captain', assigneeVesselId: sites[0].vesselId, assigneeLabel: 'Capitaines GOURY', openedOn: todayAuditParis(), dueOn: auditDueOnFromDuration(todayAuditParis(), { amount: 1, unit: 'months' }), treatmentDelayValue: 1, treatmentDelayUnit: 'months', status: 'open', treatment: '', resolvedAt: null, closedAt: null, files: [{ id: 'preview-finding-photo', fileName: 'Constat-de-demonstration.png', storagePath: 'preview/finding-photo', mimeType: 'image/png', sizeBytes: 2404726, url: '/demo/action-plan-finding-ppe.png' }] };
  return { companyId: 1, sites, people: [{ id: 9301, name: 'Arthur DEMO', functionLabel: 'Armement' }, { id: 9302, name: 'Paul DEMO', functionLabel: 'Capitaine' }], audits: [audit, { ...audit, id: `documentary-${kind}-${year - 1}`, year: year - 1, title: `${label} · GOURY · ${year - 1}`, auditedOn: `${year - 1}-06-15`, files: [previewPdf(label, year - 1)] }], findings: [finding], events: [], permissions: { canManage: true, treatableFindingIds: [finding.id] } };
}
