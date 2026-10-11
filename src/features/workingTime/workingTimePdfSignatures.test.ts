import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { prepareWorkingTimePdf } from './workingTimePdf';
import { isWorkingTimeCaptainRegister } from './workingTimePdfSignatures';
import type { WorkingTimeDayApproval, WorkingTimeSignatureSnapshot, WorkingTimeValidationEvent, WorkingTimeWorkspace } from './workingTimeQueries';

const register: WorkingTimeWorkspace['registers'][number] = {
  id: 100, companyId: 1, personId: 20, personName: 'Alex MARIN', functionLabel: 'Matelot',
  periodKind: 'monthly', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'draft', workRestPolicyId: 1,
};

const holderSnapshot: WorkingTimeSignatureSnapshot = {
  signatureId: 80, signerPersonId: 20, signerName: 'Alex MARIN', signerRoles: ['marin'],
  signedAt: '2026-09-03T18:00:00Z', versionNumber: 2, storageBucket: 'working-time-signatures',
  storagePath: '1/20/old.png', mimeType: 'image/png', fileSizeBytes: 1234, sha256: 'a'.repeat(64),
};

const validatorSnapshot: WorkingTimeSignatureSnapshot = {
  ...holderSnapshot, signatureId: 81, signerPersonId: 10, signerName: 'Camille CAPITAINE',
  signerRoles: ['capitaine'], storagePath: '1/10/old.png', signedAt: '2026-09-04T10:00:00Z',
};

function profileRow(personId: number, version = 3) {
  return { id: personId * 10 + version, person_id: personId, version_number: version,
    storage_bucket: 'working-time-signatures', storage_path: `1/${personId}/latest-${version}.png`,
    mime_type: 'image/png', file_size_bytes: 1234, sha256: 'b'.repeat(64), valid_from: '2026-10-01T00:00:00Z' };
}

function auditEvent(snapshot: WorkingTimeSignatureSnapshot, eventType: string, id = 1): WorkingTimeValidationEvent {
  return { id, registerId: 100, eventType, previousStatus: 'draft', newStatus: 'validated',
    actorName: snapshot.signerName, actorRoles: snapshot.signerRoles, signatureSnapshot: snapshot,
    intervalSnapshot: [], nonComplianceSnapshot: [], comment: '', occurredAt: snapshot.signedAt };
}

function dayApproval(overrides: Partial<WorkingTimeDayApproval> = {}): WorkingTimeDayApproval {
  return { id: 200, companyId: 1, registerId: 100, personId: 20, localWorkDate: '2026-09-04', status: 'validated',
    planningAssignmentId: 50, vesselId: 7, watchGroup: 'Bordée 1', approverPersonId: 10,
    submittedAt: holderSnapshot.signedAt, validatedAt: validatorSnapshot.signedAt, validatedByPersonId: 10,
    subjectSignatureSnapshot: holderSnapshot, approverSignatureSnapshot: validatorSnapshot, ...overrides };
}

const workspace: WorkingTimeWorkspace = {
  currentPersonId: 99, canActAsCaptain: true,
  readablePeople: [{ personId: 10, firstName: 'Camille', lastName: 'CAPITAINE', functionLabel: 'Capitaine', isSelf: false }],
  editablePeople: [], registers: [register], intervals: [], calculations: [], dayComments: [],
  signatures: [], validations: [], dayApprovals: [], vessels: [], policies: [],
};

function mockClient(rows: ReturnType<typeof profileRow>[] = [], queryError: { message: string } | null = null) {
  const download = vi.fn().mockImplementation((path: string) => Promise.resolve({ data: new Blob([path]), error: null }));
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn() };
  for (const method of ['select', 'eq', 'in', 'is'] as const) query[method].mockReturnValue(query);
  query.order.mockResolvedValue({ data: rows, error: queryError });
  const from = vi.fn().mockReturnValue(query);
  const client = { from, storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;
  return { client, download, query, from };
}

describe('working-time PDF signature preparation', () => {
  it('exports the last registered holder image before any validation, without modifying the audit', async () => {
    const mocked = mockClient([profileRow(20)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, workspace, register);

    expect(prepared.signatures[0].snapshot).toBeNull();
    expect(prepared.signatures[0].profileSignature?.versionNumber).toBe(3);
    expect(new TextDecoder().decode(prepared.signatures[0].png!)).toBe('1/20/latest-3.png');
    expect(prepared.audit).toEqual([]);
    expect(workspace.validations).toEqual([]);
    expect(prepared.signatures[1].png).toBeNull();
    expect(mocked.query.eq).toHaveBeenCalledWith('company_id', 1);
    expect(mocked.query.in).toHaveBeenCalledWith('person_id', [20]);
    expect(mocked.query.is).toHaveBeenCalledWith('valid_to', null);
  });

  it('refreshes both profile images after a version change while retaining the historical decision snapshots', async () => {
    const outdatedProfile = { id: 1, personId: 20, versionNumber: 1, storageBucket: 'working-time-signatures',
      storagePath: '1/20/stale-workspace.png', mimeType: 'image/png', fileSizeBytes: 1, sha256: 'x', validFrom: '' };
    const source = { ...workspace, signatures: [outdatedProfile], validations: [
      auditEvent(holderSnapshot, 'sailor_signed'), auditEvent(validatorSnapshot, 'captain_validated', 2),
    ] };
    const mocked = mockClient([profileRow(20, 4), profileRow(10, 8)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, source, register);

    expect(mocked.download).toHaveBeenCalledWith('1/20/latest-4.png');
    expect(mocked.download).toHaveBeenCalledWith('1/10/latest-8.png');
    expect(mocked.download).not.toHaveBeenCalledWith(holderSnapshot.storagePath);
    expect(mocked.download).not.toHaveBeenCalledWith(outdatedProfile.storagePath);
    expect(prepared.signatures.map((signature) => signature.snapshot)).toEqual([holderSnapshot, validatorSnapshot]);
    expect(mocked.query.in).toHaveBeenCalledWith('person_id', [20, 10]);
    expect(source.validations[0].signatureSnapshot?.versionNumber).toBe(2);
  });

  it('uses the daily workflow snapshots when no monthly signature event exists', async () => {
    const mocked = mockClient([profileRow(20), profileRow(10)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, { ...workspace, dayApprovals: [dayApproval()] }, register);

    expect(prepared.signatures.map((signature) => signature.snapshot)).toEqual([holderSnapshot, validatorSnapshot]);
    expect(prepared.signatures[1].profileSignature?.personId).toBe(10);
    expect(prepared.audit).toEqual([]);
  });

  it.each(['daily', 'monthly'])('selects the latest real validator across both workflow sources (%s is newer)', async (latest) => {
    const otherSnapshot = { ...validatorSnapshot, signerPersonId: 30, signerName: 'Morgan VALIDEUR',
      storagePath: '1/30/old.png', signedAt: '2026-09-06T10:00:00Z' };
    const monthlySnapshot = latest === 'monthly' ? otherSnapshot : validatorSnapshot;
    const dailySnapshot = latest === 'daily' ? otherSnapshot : validatorSnapshot;
    const mocked = mockClient([profileRow(20), profileRow(30)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, { ...workspace,
      validations: [auditEvent(monthlySnapshot, 'captain_validated')],
      dayApprovals: [dayApproval({ validatedByPersonId: dailySnapshot.signerPersonId,
        approverSignatureSnapshot: dailySnapshot, validatedAt: dailySnapshot.signedAt })],
    }, register);

    expect(prepared.signatures[1].snapshot).toEqual(otherSnapshot);
    expect(prepared.signatures[1].profileSignature?.personId).toBe(30);
    expect(mocked.download).toHaveBeenCalledWith('1/30/latest-3.png');
    expect(mocked.query.in).toHaveBeenCalledWith('person_id', [20, 30]);
  });

  it('keeps a captain register to one holder signature even when exported by another profile', async () => {
    const mocked = mockClient([profileRow(20), profileRow(99)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, { ...workspace,
      currentPersonId: 99, dayApprovals: [dayApproval()],
    }, { ...register, functionLabel: 'Capitaine' });

    expect(prepared.signatures).toHaveLength(1);
    expect(prepared.signatures[0]).toMatchObject({ label: 'Capitaine / Valideur', profileSignature: { personId: 20 } });
    expect(mocked.query.in).toHaveBeenCalledWith('person_id', [20]);
    expect(mocked.download).not.toHaveBeenCalledWith('1/99/latest-3.png');
    expect(isWorkingTimeCaptainRegister({ functionLabel: '2nd Capitaine' })).toBe(false);
    expect(isWorkingTimeCaptainRegister({ functionLabel: 'Matelot' })).toBe(false);
  });

  it('uses an explicitly requested validator before validation and never the exporter', async () => {
    const mocked = mockClient([profileRow(20), profileRow(10), profileRow(99)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, workspace, { ...register, requestedCaptainPersonId: 10 });

    expect(prepared.signatures[1]).toMatchObject({ snapshot: null, profileSignature: { personId: 10 } });
    expect(mocked.query.in).toHaveBeenCalledWith('person_id', [20, 10]);
    expect(mocked.download).not.toHaveBeenCalledWith('1/99/latest-3.png');
  });

  it('ignores approvals for another person, company, register or month', async () => {
    const mocked = mockClient([profileRow(20)]);
    const prepared = await prepareWorkingTimePdf(mocked.client, { ...workspace, dayApprovals: [
      dayApproval({ personId: 30 }), dayApproval({ companyId: 2 }), dayApproval({ registerId: 101 }),
      dayApproval({ localWorkDate: '2026-08-31' }),
    ] }, register);

    expect(prepared.signatures.map((signature) => signature.snapshot)).toEqual([null, null]);
    expect(mocked.query.in).toHaveBeenCalledWith('person_id', [20]);
  });

  it('falls back to authorized historical images when the active profile is no longer visible', async () => {
    const mocked = mockClient();
    const prepared = await prepareWorkingTimePdf(mocked.client, { ...workspace, dayApprovals: [dayApproval()] }, register);

    expect(mocked.download).toHaveBeenCalledWith(holderSnapshot.storagePath);
    expect(mocked.download).toHaveBeenCalledWith(validatorSnapshot.storagePath);
    expect(prepared.signatures.map((signature) => signature.profileSignature)).toEqual([null, null]);
    expect(prepared.signatures.map((signature) => signature.snapshot)).toEqual([holderSnapshot, validatorSnapshot]);
  });

  it('reports an authorization/database error instead of silently exporting stale images', async () => {
    const mocked = mockClient([], { message: 'permission denied' });
    await expect(prepareWorkingTimePdf(mocked.client, { ...workspace, dayApprovals: [dayApproval()] }, register))
      .rejects.toThrow('Impossible de charger les dernières signatures enregistrées.');
    expect(mocked.download).not.toHaveBeenCalled();
  });

  it('reports a private image download failure instead of omitting a known signature', async () => {
    const mocked = mockClient([profileRow(20)]);
    mocked.download.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(prepareWorkingTimePdf(mocked.client, workspace, register))
      .rejects.toThrow('Impossible de charger la signature de Alex MARIN.');
  });
});
