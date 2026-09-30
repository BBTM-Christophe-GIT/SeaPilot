// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuditFinding, AuditTemplate, InternalAudit } from './internalAuditModel';
import { addAuditFindingTreatment, fetchInternalAuditData, saveAuditFinding, saveAuditTemplate, saveInternalAudit } from './internalAuditQueries';

const question = { id: 'q1', section: 'ISM 1', reference: '1.2', question: 'Critère', maxPoints: 3, guidance: '' };
const template: AuditTemplate = { id: 'template', companyId: 1, siteId: 'site', name: 'LE ROZEL', version: 1, rows: [question], active: true };
const audit: InternalAudit = {
  id: 'audit', companyId: 1, siteId: 'site', templateId: 'template', templateName: 'LE ROZEL', templateVersion: 1, year: 2026,
  plannedOn: '2026-09-30', performedOn: null, auditorName: 'Auditeur', status: 'in_progress', rows: [{ ...question, answer: null, observation: '' }], completedAt: null,
};
const finding: AuditFinding = {
  id: 'finding', companyId: 1, auditId: 'audit', questionId: 'q1', reference: '1.2', severity: 'major', description: 'Document absent',
  assigneePersonId: 42, assigneeRole: null, assigneeVesselId: null, assigneeLabel: 'Personne', dueOn: '2026-10-30', status: 'open', treatment: '', resolvedAt: null, closedAt: null,
};

function mockClient(data: unknown = {}, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('internal audit queries', () => {
  it('uses only server-granted workflow permissions for a real restricted account', async () => {
    const { client, rpc } = mockClient({ company_id: 1, sites: [], templates: [], audits: [], findings: [], events: [], people: [], permissions: { canManage: false, treatableFindingIds: ['assigned-finding'] } });
    const data = await fetchInternalAuditData(client);
    expect(data.permissions).toEqual({ canManage: false, treatableFindingIds: ['assigned-finding'] });
    expect(rpc).toHaveBeenCalledWith('internal_audits_overview', undefined);
  });

  it('denies management by default if the permission payload is missing', async () => {
    const { client } = mockClient({ company_id: 1 });
    expect((await fetchInternalAuditData(client)).permissions).toEqual({ canManage: false, treatableFindingIds: [] });
  });

  it('maps frozen graded answers and numeric personnel/vessel IDs without losing N/A', async () => {
    const { client } = mockClient({ company_id: 7, audits: [{ id: 'a', company_id: 7, site_id: 's', template_id: 't', template_name: 'Grille originale', template_version: 2, year: 2026, planned_on: '2026-09-30', performed_on: '2026-09-30', auditor_name: 'Auditeur', status: 'completed', completed_at: '2026-09-30T10:00:00Z', rows: [{ ...question, answer: 'na', observation: 'Hors périmètre' }] }], findings: [{ id: 'f', company_id: 7, audit_id: 'a', question_id: 'q1', severity: 'minor', description: 'Écart', assignee_person_id: null, assignee_role: 'chief_engineer', assignee_vessel_id: 24, assignee_label: 'Chefs Mécaniciens LE ROZEL', due_on: '2026-10-30', status: 'resolved', treatment: 'Terminé', resolved_at: '2026-10-01T10:00:00Z', closed_at: null }], permissions: { canManage: false, treatableFindingIds: ['f'] } });
    const data = await fetchInternalAuditData(client);
    expect(data.audits[0]).toMatchObject({ companyId: 7, templateVersion: 2, status: 'completed', completedAt: '2026-09-30T10:00:00Z', rows: [{ answer: 'na', observation: 'Hors périmètre' }] });
    expect(data.findings[0]).toMatchObject({ assigneePersonId: null, assigneeVesselId: 24, assigneeRole: 'chief_engineer', closedAt: null });
  });

  it('surfaces RLS/workflow errors instead of returning an empty apparent success', async () => {
    const error = { code: '42501', message: 'Écart inaccessible.' };
    const { client } = mockClient(null, error);
    await expect(fetchInternalAuditData(client)).rejects.toBe(error);
    await expect(addAuditFindingTreatment(client, 'finding', 'resolved', 'Réparation terminée')).rejects.toBe(error);
  });

  it('rejects an empty or malformed backend result', async () => {
    const { client } = mockClient(null);
    await expect(fetchInternalAuditData(client)).rejects.toThrow('Réponse du module');
  });

  it('requires exactly one assignee, including a vessel for a function', async () => {
    const { client, rpc } = mockClient();
    await expect(saveAuditFinding(client, { ...finding, assigneeRole: 'captain', assigneeVesselId: 24 })).rejects.toThrow('Désignez une personne');
    await expect(saveAuditFinding(client, { ...finding, assigneePersonId: null, assigneeRole: 'captain' })).rejects.toThrow('Désignez une personne');
    await expect(saveAuditFinding(client, { ...finding, assigneePersonId: null })).rejects.toThrow('Désignez une personne');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires every answer plus auditor and performed date for completion', async () => {
    const { client, rpc } = mockClient();
    await expect(saveInternalAudit(client, { ...audit, status: 'completed', performedOn: '2026-09-30' })).rejects.toThrow('toutes les réponses');
    await expect(saveInternalAudit(client, { ...audit, status: 'completed', rows: [{ ...audit.rows[0], answer: 'conforme' }] })).rejects.toThrow('date');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects duplicate question identifiers and invalid scoring data before saving', async () => {
    const { client, rpc } = mockClient();
    await expect(saveAuditTemplate(client, { ...template, rows: [question, question] })).rejects.toThrow('identifiant unique');
    await expect(saveAuditTemplate(client, { ...template, rows: [{ ...question, maxPoints: Number.NaN }] })).rejects.toThrow('barème');
    await expect(saveAuditTemplate(client, { ...template, rows: [{ ...question, section: '' }] })).rejects.toThrow('libellé');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records treatment through the atomic workflow with no client actor or timestamps', async () => {
    const { client, rpc } = mockClient({ id: 'event', finding_id: 'finding', actor_id: 'real-user', actor_name: 'Vrai Marin', created_at: '2026-10-01T10:00:00Z', status: 'resolved', treatment: 'Réparation terminée' });
    const event = await addAuditFindingTreatment(client, 'finding', 'resolved', '  Réparation terminée  ');
    expect(rpc).toHaveBeenCalledWith('internal_audit_add_treatment', { p_finding_id: 'finding', p_status: 'resolved', p_treatment: 'Réparation terminée' });
    expect(event).toMatchObject({ actorId: 'real-user', actorName: 'Vrai Marin', status: 'resolved' });
  });
});
