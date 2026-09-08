import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { WorkingTimeWorkspace } from './workingTimeQueries';
import { buildWorkingTimePdf, formatWorkingTimeTableHours, prepareWorkingTimePdf } from './workingTimePdf';

const register: WorkingTimeWorkspace['registers'][number] = {
  id: 100,
  companyId: 1,
  personId: 20,
  personName: 'Alex MARIN',
  functionLabel: 'Matelot',
  periodKind: 'monthly',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
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

const validatorSnapshot = {
  ...snapshot,
  signatureId: 9,
  signerPersonId: 10,
  signerName: 'Camille CAPITAINE',
  signerRoles: ['capitaine'],
  signedAt: '2026-08-04T08:00:00Z',
  versionNumber: 4,
  storagePath: '1/10/signature.png',
  sha256: 'b'.repeat(64),
};

const signaturePng = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  (character) => character.charCodeAt(0),
);

const workspace: WorkingTimeWorkspace = {
  currentPersonId: 10,
  readablePeople: [],
  editablePeople: [],
  registers: [register],
  dayApprovals: [],
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
    id: 502, registerId: 100, eventType: 'approved_import', previousStatus: 'draft', newStatus: 'validated',
    actorName: 'Import Admin', actorRoles: ['admin'], signatureSnapshot: null, intervalSnapshot: [],
    nonComplianceSnapshot: [], comment: 'Import XLSM approuvé #42 - Alex MARIN - 2026.xlsm', occurredAt: '2026-08-04T09:00:00Z',
  }, {
    id: 501, registerId: 100, eventType: 'captain_validated', previousStatus: 'submitted', newStatus: 'validated',
    actorName: 'Camille CAPITAINE', actorRoles: ['capitaine'], signatureSnapshot: validatorSnapshot, intervalSnapshot: [],
    nonComplianceSnapshot: [], comment: 'Validation explicite', occurredAt: '2026-08-04T08:00:00Z',
  }, {
    id: 500, registerId: 100, eventType: 'sailor_signed', previousStatus: 'awaiting_sailor_signature', newStatus: 'submitted',
    actorName: 'Alex MARIN', actorRoles: ['marin'], signatureSnapshot: snapshot, intervalSnapshot: [],
    nonComplianceSnapshot: [], comment: 'Signature explicite', occurredAt: '2026-08-03T18:00:00Z',
  }],
  vessels: [{ id: 7, name: 'Navire Test', acronym: 'NT', registrationNumber: 'CH 1234', imoNumber: '9213870', flagState: 'France' }],
  policies: [],
};

const sailorProfile: WorkingTimeWorkspace['signatures'][number] = {
  id: 10,
  personId: register.personId,
  versionNumber: 3,
  storageBucket: snapshot.storageBucket,
  storagePath: '1/20/current-signature.png',
  mimeType: 'image/png',
  fileSizeBytes: 1234,
  sha256: 'c'.repeat(64),
  validFrom: '2026-09-01T00:00:00Z',
};

describe('working-time PDF', () => {
  it('formats the two compliance columns without NC or T/R prefixes', () => {
    expect(formatWorkingTimeTableHours(48_600)).toBe('13h30');
    expect(formatWorkingTimeTableHours(37_800)).toBe('10h30');
    expect(`${formatWorkingTimeTableHours(91_800)} / ${formatWorkingTimeTableHours(513_000)}`).toBe('25h30 / 142h30');
  });

  it('keeps both frozen audit signatures when a newer profile version exists', async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob(['png']), error: null });
    const client = { storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;

    const prepared = await prepareWorkingTimePdf(client, { ...workspace, signatures: [sailorProfile] }, register);

    expect(download).toHaveBeenCalledWith(snapshot.storagePath);
    expect(download).toHaveBeenCalledWith(validatorSnapshot.storagePath);
    expect(prepared.signatures[0].snapshot).toEqual(snapshot);
    expect(prepared.signatures[1].snapshot).toEqual(validatorSnapshot);
    expect(download).not.toHaveBeenCalledWith(sailorProfile.storagePath);
  });

  it.each([
    { role: 'marin', currentPersonId: 20 },
    { role: 'capitaine', currentPersonId: 10 },
  ])('uses the register holder profile for an approved import exported by a $role', async ({ currentPersonId }) => {
    const download = vi.fn().mockResolvedValue({ data: new Blob([signaturePng]), error: null });
    const client = { storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;
    const importedWorkspace: WorkingTimeWorkspace = {
      ...workspace,
      currentPersonId,
      signatures: [{ ...sailorProfile, personId: 10, storagePath: '1/10/current-signature.png' }, sailorProfile],
      validations: workspace.validations.filter((event) => event.eventType !== 'sailor_signed'),
    };

    const prepared = await prepareWorkingTimePdf(client, importedWorkspace, register);
    const generated = await buildWorkingTimePdf(prepared);
    const pageContent = generated.document.internal.pages.flat().join('\n');

    expect(download).toHaveBeenCalledWith(sailorProfile.storagePath);
    expect(download).not.toHaveBeenCalledWith('1/10/current-signature.png');
    expect(prepared.signatures[0]).toMatchObject({ snapshot: null, profileSignature: sailorProfile, png: signaturePng });
    expect(prepared.audit).toEqual(importedWorkspace.validations);
    expect(pageContent.match(/Alex MARIN/g)).toHaveLength(2);
    expect(pageContent).toContain('Camille CAPITAINE');
    expect(pageContent).toContain('Navire Test - OMI 9213870');
    expect(pageContent.match(/CAPITAINE \/ VALIDATEUR/g)).toHaveLength(1);
    expect(pageContent).not.toContain('STATUT');
    expect(pageContent).not.toContain('Non requise');
    expect(pageContent).not.toContain('signature v');
    expect(pageContent).not.toContain('04/08/2026');
    expect(generated.document.getNumberOfPages()).toBe(1);

    if (process.env.WORKING_TIME_PDF_IMPORT_QA_PATH) {
      await import('node:fs/promises').then(({ writeFile }) => writeFile(
        process.env.WORKING_TIME_PDF_IMPORT_QA_PATH!, new Uint8Array(generated.document.output('arraybuffer')),
      ));
    }
  });

  it('does not apply a profile signature to an unsigned register without an approved import', async () => {
    const download = vi.fn();
    const client = { storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;
    const prepared = await prepareWorkingTimePdf(client, { ...workspace, signatures: [sailorProfile], validations: [] }, register);

    expect(prepared.signatures[0]).toMatchObject({ snapshot: null, profileSignature: null, png: null });
    expect(download).not.toHaveBeenCalled();
  });

  it('still names the sailor when an approved import has no available signature', async () => {
    const client = {} as SupabaseClient;
    const prepared = await prepareWorkingTimePdf(client, {
      ...workspace,
      validations: workspace.validations.filter((event) => event.eventType === 'approved_import'),
    }, register);
    const generated = await buildWorkingTimePdf(prepared);
    const pageContent = generated.document.internal.pages.flat().join('\n');

    expect(pageContent.match(/Alex MARIN/g)).toHaveLength(2);
    expect(pageContent).toContain('Signature non apposée');
    expect(pageContent).not.toContain('Non requise');
  });

  it('uses the vessel registration in comments when its OMI number is missing', async () => {
    const generated = await buildWorkingTimePdf({
      register,
      workspace: {
        ...workspace,
        vessels: [{ ...workspace.vessels[0], imoNumber: '' }],
      },
      signatures: [],
      audit: [],
    });
    const pageContent = generated.document.internal.pages.flat().join('\n');

    expect(pageContent).toContain('Navire Test - CH 1234');
    expect(pageContent).not.toContain('OMI 9213870');
  });

  it('refuses to produce a misleading PDF when a frozen signature cannot be loaded', async () => {
    const client = {
      storage: { from: vi.fn(() => ({ download: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing' } }) })) },
    } as unknown as SupabaseClient;

    await expect(prepareWorkingTimePdf(client, workspace, register))
      .rejects.toThrow('Impossible de charger la signature de Alex MARIN.');
  });

  it('reports an inaccessible profile image instead of silently omitting the sailor signature', async () => {
    const client = {
      storage: { from: vi.fn(() => ({ download: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }) })) },
    } as unknown as SupabaseClient;

    await expect(prepareWorkingTimePdf(client, {
      ...workspace,
      signatures: [sailorProfile],
      validations: workspace.validations.filter((event) => event.eventType === 'approved_import'),
    }, register)).rejects.toThrow('Impossible de charger la signature de Alex MARIN.');
  });

  it('generates a single-page French maritime monthly grid with both signatures', async () => {
    const generated = await buildWorkingTimePdf({
      register,
      workspace,
      signatures: [
        { label: 'Titulaire du registre', snapshot, png: signaturePng },
        { label: 'Validateur', snapshot: validatorSnapshot, png: signaturePng },
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
    expect(generated.document.getNumberOfPages()).toBe(1);
    expect(generated.filename).toBe('registre-mensuel-temps-travail-Alex-MARIN-2026-08.pdf');
    const pageContent = generated.document.internal.pages.flat().join('\n');
    expect(pageContent).toContain('Camille CAPITAINE');
    expect(pageContent).not.toContain('Camille CAPITAINE - capitaine');
    expect(pageContent).toContain('Navire Test - OMI 9213870');
    expect(pageContent).not.toContain('NAVIRE');
    expect(pageContent.match(/OMI/g)).toHaveLength(1);
    expect(pageContent).not.toContain('PAVILLON');
    expect(pageContent).not.toContain('STATUT');
    expect(pageContent).toContain('signature v2');
    expect(pageContent).not.toContain('signature v4');
    expect(pageContent).not.toContain('04/08/2026');
  });
});
