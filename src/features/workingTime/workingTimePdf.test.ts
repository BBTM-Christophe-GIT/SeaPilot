import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { WorkingTimeWorkspace } from './workingTimeQueries';
import { buildWorkingTimePdf, prepareWorkingTimePdf } from './workingTimePdf';

const register: WorkingTimeWorkspace['registers'][number] = {
  id: 100,
  companyId: 1,
  personId: 20,
  personName: 'Alex MARIN',
  functionLabel: 'Matelot',
  periodKind: 'weekly',
  periodStart: '2026-08-03',
  periodEnd: '2026-08-09',
  status: 'validated',
  workRestPolicyId: 1,
};

const snapshot = {
  signatureId: 8,
  signerPersonId: 20,
  signerName: 'Alex MARIN',
  signerRoles: ['marin'],
  signedAt: '2026-08-03T18:00:00Z',
  versionNumber: 2,
  storageBucket: 'working-time-signatures',
  storagePath: '1/20/signature.png',
  mimeType: 'image/png',
  fileSizeBytes: 1234,
  sha256: 'a'.repeat(64),
};

const signaturePng = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  (character) => character.charCodeAt(0),
);

const workspace: WorkingTimeWorkspace = {
  currentPersonId: 10,
  editablePeople: [],
  registers: [register],
  intervals: [{
    id: 200, registerId: 100, companyId: 1, personId: 20, localWorkDate: '2026-08-03',
    startsAt: '2026-08-03T06:00:00Z', endsAt: '2026-08-03T18:00:00Z', timezoneName: 'Europe/Paris',
    utcOffsetMinutes: 120, vesselId: 7, watchGroup: 'Bordée 1', comment: 'Opération pont',
    authorUserId: 'user', authorPersonId: 10, sourceType: 'manual', sourceReference: null, sourceRecordKey: null,
  }],
  calculations: [{
    id: 300, companyId: 1, personId: 20, windowEnd: '2026-08-03T20:00:00Z', localWindowEndDate: '2026-08-03',
    timezoneName: 'Europe/Paris', vesselId: 7, workRestPolicyId: 1, work24hSeconds: 43200, rest24hSeconds: 43200,
    longestRest24hSeconds: 43200, restPeriodCount24h: 1, work7dSeconds: 43200, rest7dSeconds: 561600,
    nightWork24hSeconds: 0, isCompliant: false, violationCodes: ['rest_24h'], calculationVersion: 1,
    calculatedAt: '2026-08-03T20:01:00Z',
  }],
  dayComments: [{
    id: 400, registerId: 100, personId: 20, localWorkDate: '2026-08-03', causeCategory: 'unexpected_operation',
    operationalContext: 'Opération prolongée', immediateAction: 'Relève organisée', compensatoryRestPlan: 'Repos demain',
    comment: 'Écart documenté', authoredBy: 'captain', authoredByPersonId: 10, updatedAt: '2026-08-03T20:10:00Z',
  }],
  signatures: [],
  validations: [{
    id: 500, registerId: 100, eventType: 'sailor_signed', previousStatus: 'awaiting_sailor_signature', newStatus: 'submitted',
    actorName: 'Alex MARIN', actorRoles: ['marin'], signatureSnapshot: snapshot, intervalSnapshot: [],
    nonComplianceSnapshot: [], comment: 'Signature explicite', occurredAt: '2026-08-03T18:00:00Z',
  }],
  vessels: [{ id: 7, name: 'Navire Test', acronym: 'NT' }],
};

describe('working-time PDF', () => {
  it('loads the frozen audit signature, never the current profile version', async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob(['png']), error: null });
    const client = { storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;

    const prepared = await prepareWorkingTimePdf(client, workspace, register);

    expect(download).toHaveBeenCalledWith(snapshot.storagePath);
    expect(prepared.signatures[0].snapshot).toEqual(snapshot);
    expect(prepared.signatures[1].snapshot).toBeNull();
  });

  it('refuses to produce a misleading PDF when a frozen signature cannot be loaded', async () => {
    const client = {
      storage: { from: vi.fn(() => ({ download: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing' } }) })) },
    } as unknown as SupabaseClient;

    await expect(prepareWorkingTimePdf(client, workspace, register))
      .rejects.toThrow('Impossible de charger la signature figée de Alex MARIN.');
  });

  it('generates a readable PDF containing a non-compliance section and audit', async () => {
    const generated = await buildWorkingTimePdf({
      register,
      workspace,
      signatures: [
        { label: 'Titulaire du registre', snapshot, png: signaturePng },
        { label: 'Validateur', snapshot: null, png: null },
      ],
      audit: workspace.validations,
    });
    const bytes = new Uint8Array(generated.document.output('arraybuffer'));
    if (process.env.WORKING_TIME_PDF_QA_PATH) {
      await import('node:fs/promises').then(({ writeFile }) => writeFile(process.env.WORKING_TIME_PDF_QA_PATH!, bytes));
    }
    const prefix = new TextDecoder().decode(bytes.slice(0, 4));

    expect(prefix).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    expect(generated.filename).toBe('registre-mensuel-temps-travail-Alex-MARIN-2026-08.pdf');
  });
});
