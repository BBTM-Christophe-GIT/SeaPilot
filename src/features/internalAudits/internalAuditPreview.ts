import type { AuditSite, InternalAudit } from './internalAuditModel';
import type { InternalAuditData } from './internalAuditQueries';
import { createDefaultAuditTemplate } from './internalAuditSeed';

/** Demonstration records only; production always loads the authenticated RPC. */
export function createInternalAuditPreviewData(): InternalAuditData {
  const names = ['Armement - CHERBOURG', 'Yard - LE HAVRE', 'GOURY', 'LE ROZEL', 'LANDEMER', 'SUROIT', 'KROKDUR', 'HIRONDELLE DE LA MANCHE'];
  const sites: AuditSite[] = names.map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    companyId: 1, name, kind: index < 2 ? 'shore' : 'vessel', vesselId: index < 2 ? null : 9400 + index,
    anniversaryOn: `2026-${String(index + 3).padStart(2, '0')}-15`,
  }));
  const common = createDefaultAuditTemplate(1, '00000000-0000-4000-8000-000000000100');
  const rozel = { ...common, id: '00000000-0000-4000-8000-000000000101', siteId: sites[3].id, name: 'Grille LE ROZEL', rows: structuredClone(common.rows) };
  const year = 2026;
  const completed: InternalAudit = {
    id: '00000000-0000-4000-8000-000000000200', companyId: 1, siteId: sites[3].id,
    templateId: rozel.id, templateName: rozel.name, templateVersion: 1, year: year - 1,
    plannedOn: '2025-06-15', performedOn: '2025-06-15', auditorName: 'Auditeur de démonstration',
    status: 'completed', completedAt: '2025-06-15T16:00:00Z',
    rows: rozel.rows.map((row, index) => ({ ...row, answer: index % 7 === 0 ? 'incomplet' : 'conforme', observation: '' })),
  };
  const current: InternalAudit = {
    ...completed, id: '00000000-0000-4000-8000-000000000201', year,
    plannedOn: '2026-06-15', performedOn: '2026-06-16', status: 'in_progress', completedAt: null,
    rows: rozel.rows.map((row, index) => ({ ...row, answer: index === 2 ? 'non_conforme' : index === 5 ? 'na' : index % 9 === 0 ? 'incomplet' : 'conforme', observation: index === 2 ? 'Contrôle complémentaire nécessaire.' : '' })),
  };
  const finding = {
    id: '00000000-0000-4000-8000-000000000300', companyId: 1, auditId: current.id,
    questionId: current.rows[2].id, reference: current.rows[2].reference, severity: 'minor' as const,
    description: 'Compléter la vérification et conserver la preuve du contrôle.',
    assigneePersonId: null, assigneeRole: 'captain' as const, assigneeVesselId: sites[3].vesselId,
    assigneeLabel: 'Capitaines LE ROZEL', openedOn: '2026-09-15', dueOn: '2026-10-15', status: 'open' as const,
    treatmentDelayValue: 1, treatmentDelayUnit: 'months' as const,
    treatment: '', resolvedAt: null, closedAt: null, photos: [],
  };
  return {
    companyId: 1, sites, templates: [common, rozel], audits: [current, completed], findings: [finding], events: [],
    people: [{ id: 9301, name: 'Arthur DEMO', functionLabel: 'Armement' }, { id: 9302, name: 'Paul DEMO', functionLabel: 'Capitaine' }],
    permissions: { canManage: true, treatableFindingIds: [finding.id] },
  };
}
