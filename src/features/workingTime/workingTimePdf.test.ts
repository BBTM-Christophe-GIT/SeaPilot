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

function signatureQuery(profiles: WorkingTimeWorkspace['signatures'] = []) {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn() };
  for (const method of ['select', 'eq', 'in', 'is'] as const) query[method].mockReturnValue(query);
  query.order.mockResolvedValue({ error: null, data: profiles.map((profile) => ({
    id: profile.id, person_id: profile.personId, version_number: profile.versionNumber,
    storage_bucket: profile.storageBucket, storage_path: profile.storagePath, mime_type: profile.mimeType,
    file_size_bytes: profile.fileSizeBytes, sha256: profile.sha256, valid_from: profile.validFrom,
  })) });
  return vi.fn(() => query);
}

describe('working-time PDF', () => {
  it('formats the two compliance columns without NC or T/R prefixes', () => {
    expect(formatWorkingTimeTableHours(48_600)).toBe('13h30');
    expect(formatWorkingTimeTableHours(37_800)).toBe('10h30');
    expect(`${formatWorkingTimeTableHours(91_800)} / ${formatWorkingTimeTableHours(513_000)}`).toBe('25h30 / 142h30');
  });

  it('leaves the shared compliance heading free of its internal column divider', async () => {
    const generated = await buildWorkingTimePdf({ register, workspace, signatures: [], audit: [] });
    const pageContent = generated.document.internal.pages.flat().join('\n');
    const scale = generated.document.internal.scaleFactor;
    const pageHeight = generated.document.internal.pageSize.getHeight();
    const work7ColumnX = 248.4;
    const verticalLines = Array.from(pageContent.matchAll(/([\d.-]+) ([\d.-]+) m\n([\d.-]+) ([\d.-]+) l/g))
      .map((match) => ({ x1: Number(match[1]) / scale, y1: pageHeight - Number(match[2]) / scale,
        x2: Number(match[3]) / scale, y2: pageHeight - Number(match[4]) / scale }))
      .filter((line) => Math.abs(line.x1 - work7ColumnX) < 0.001 && Math.abs(line.x2 - work7ColumnX) < 0.001);

    expect(verticalLines).toHaveLength(1);
    expect(verticalLines[0].y1).toBeCloseTo(32, 3);
    expect(verticalLines[0].y2).toBeCloseTo(170, 3);
    expect(pageContent).toContain('NE PAS REMPLIR PAR LE MARIN');
  });

  it.each([20, 99])('puts only the captain holder signature on the right regardless of the exporter (%s)', async (currentPersonId) => {
    const captainRegister = { ...register, personName: 'Camille CAPITAINE', functionLabel: 'Capitaine' };
    const captainSnapshot = { ...validatorSnapshot, signerPersonId: captainRegister.personId };
    const generated = await buildWorkingTimePdf({
      register: captainRegister,
      workspace: { ...workspace, currentPersonId },
      signatures: [{ label: 'Capitaine / Valideur', snapshot: captainSnapshot, png: signaturePng }],
      audit: [],
    });
    const pageContent = generated.document.internal.pages.flat().join('\n');
    const scale = generated.document.internal.scaleFactor;
    const headingPosition = pageContent.match(/([\d.-]+) ([\d.-]+) Td\n\(CAPITAINE \/ VALIDEUR\) Tj/);

    expect(pageContent.match(/CAPITAINE \/ VALIDEUR/g)).toHaveLength(1);
    expect(pageContent).not.toContain('(MARIN) Tj');
    expect(pageContent).not.toContain('Signature non appos');
    expect(headingPosition).not.toBeNull();
    expect(Number(headingPosition![1]) / scale).toBeCloseTo(151.5, 3);
    expect(generated.document.getNumberOfPages()).toBe(1);
    if (process.env.WORKING_TIME_PDF_CAPTAIN_QA_PATH) {
      await import('node:fs/promises').then(({ writeFile }) => writeFile(
        process.env.WORKING_TIME_PDF_CAPTAIN_QA_PATH!, new Uint8Array(generated.document.output('arraybuffer')),
      ));
    }
  });

  it('keeps both signature boxes for a second captain register', async () => {
    const generated = await buildWorkingTimePdf({
      register: { ...register, functionLabel: '2nd Capitaine' },
      workspace,
      signatures: [{ label: 'Marin', snapshot, png: signaturePng },
        { label: 'Capitaine / Valideur', snapshot: validatorSnapshot, png: signaturePng }],
      audit: [],
    });
    const pageContent = generated.document.internal.pages.flat().join('\n');

    expect(pageContent.match(/\(MARIN\) Tj/g)).toHaveLength(2);
    expect(pageContent.match(/CAPITAINE \/ VALIDEUR/g)).toHaveLength(1);
    expect(pageContent).toContain('Alex MARIN');
    expect(pageContent).toContain('Camille CAPITAINE');
  });

  it('loads the latest profile image while keeping both frozen audit snapshots', async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob(['png']), error: null });
    const client = { from: signatureQuery([sailorProfile]), storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;

    const prepared = await prepareWorkingTimePdf(client, { ...workspace, signatures: [sailorProfile] }, register);

    expect(download).toHaveBeenCalledWith(sailorProfile.storagePath);
    expect(download).toHaveBeenCalledWith(validatorSnapshot.storagePath);
    expect(prepared.signatures[0].snapshot).toEqual(snapshot);
    expect(prepared.signatures[1].snapshot).toEqual(validatorSnapshot);
    expect(download).not.toHaveBeenCalledWith(snapshot.storagePath);
  });

  it.each([
    { role: 'marin', currentPersonId: 20 },
    { role: 'capitaine', currentPersonId: 10 },
  ])('uses the register holder profile for an approved import exported by a $role', async ({ currentPersonId }) => {
    const download = vi.fn().mockResolvedValue({ data: new Blob([signaturePng]), error: null });
    const client = { from: signatureQuery([sailorProfile]), storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;
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
    expect(pageContent.match(/CAPITAINE \/ VALIDEUR/g)).toHaveLength(1);
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

  it('displays the last saved holder signature even without an approved import or validation', async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob([signaturePng]), error: null });
    const client = { from: signatureQuery([sailorProfile]), storage: { from: vi.fn(() => ({ download })) } } as unknown as SupabaseClient;
    const prepared = await prepareWorkingTimePdf(client, { ...workspace, signatures: [sailorProfile], validations: [] }, register);

    expect(prepared.signatures[0]).toMatchObject({ snapshot: null, profileSignature: sailorProfile, png: signaturePng });
    expect(download).toHaveBeenCalledWith(sailorProfile.storagePath);
    expect(prepared.audit).toEqual([]);
  });

  it('still names the sailor when an approved import has no available signature', async () => {
    const client = { from: signatureQuery() } as unknown as SupabaseClient;
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
      from: signatureQuery(),
      storage: { from: vi.fn(() => ({ download: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing' } }) })) },
    } as unknown as SupabaseClient;

    await expect(prepareWorkingTimePdf(client, workspace, register))
      .rejects.toThrow('Impossible de charger la signature de Alex MARIN.');
  });

  it('reports an inaccessible profile image instead of silently omitting the sailor signature', async () => {
    const client = {
      from: signatureQuery([sailorProfile]),
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
    expect(pageContent).toContain('Validation enregistr');
    expect(pageContent).not.toContain('signature v');
    expect(pageContent).not.toContain('04/08/2026');
  });
});
