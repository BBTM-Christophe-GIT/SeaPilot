import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  buildBoardingCertificateData,
  generateBoardingCertificate,
} from './planningBoardingCertificate';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const overview = {
  ...EMPTY_PLANNING_OVERVIEW,
  people: [{
    id: 10,
    firstName: 'Adrien',
    lastName: 'BOIS',
    functionLabel: '2nd Capitaine',
    gradeLabel: '',
    roleLabel: '',
    sailorNumber: '20136866',
    contractType: 'CDI',
    hiredOn: '',
    departedOn: '',
    birthDate: '1995-12-02',
    deckCertificateLabel: 'Capitaine 200, Chef de Quart 500',
    engineCertificateLabel: 'Mécanicien 250 kW',
    active: true,
  }],
  vessels: [
    { id: 2, name: 'GOURY', acronym: 'GY', registrationNumber: '934968', active: true },
    { id: 3, name: 'COTENTIN', acronym: 'CTN', registrationNumber: '123456', active: true },
  ],
  assignments: [
    { id: 1, vesselId: 2, vesselName: 'GOURY', captainPersonId: null, captainName: '', crewPersonId: 10, crewName: 'Adrien BOIS', startsOn: '2026-07-28', endsOn: '2026-08-11', startsAt: '', endsAt: '', assignmentRole: '2nd Capitaine', statusLabel: 'En Mer', confirmationStatus: 'confirmed' as const, watchGroup: 'A', comments: '', sourceLabel: 'test' },
    { id: 2, vesselId: 2, vesselName: 'GOURY', captainPersonId: null, captainName: '', crewPersonId: 10, crewName: 'Adrien BOIS', startsOn: '2026-07-01', endsOn: '2026-07-05', startsAt: '', endsAt: '', assignmentRole: '2nd Capitaine', statusLabel: 'En Mer', confirmationStatus: 'confirmed' as const, watchGroup: 'A', comments: '', sourceLabel: 'test' },
    { id: 3, vesselId: 3, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 10, crewName: 'Adrien BOIS', startsOn: '2026-06-01', endsOn: '2026-06-03', startsAt: '', endsAt: '', assignmentRole: 'Lieutenant', statusLabel: 'En Mer', confirmationStatus: 'confirmed' as const, watchGroup: 'B', comments: '', sourceLabel: 'test' },
  ],
};

const input = {
  personId: 10,
  vesselIds: [2],
  startsOn: '2026-07-01',
  endsOn: '2026-08-31',
  generatedOn: '2026-12-31',
};

async function template(name: string): Promise<ArrayBuffer> {
  const buffer = await readFile(resolve(process.cwd(), 'public', 'templates', name));
  return Uint8Array.from(buffer).buffer;
}

describe('Attestation d’Embarquement', () => {
  it('builds inclusive periods from newest to oldest and totals their days', () => {
    const data = buildBoardingCertificateData(overview, input);
    expect(data).toMatchObject({
      personName: 'Adrien BOIS',
      sailorNumber: '20136866',
      certificates: 'Capitaine 200, Chef de Quart 500, Mécanicien 250 kW',
      birthDate: '1995-12-02',
      totalDays: 20,
      generatedOn: '2026-12-31',
    });
    expect(data.periods).toEqual([
      expect.objectContaining({ startsOn: '2026-07-28', endsOn: '2026-08-11', vesselName: 'GOURY', registrationNumber: '934968', dayCount: 15 }),
      expect.objectContaining({ startsOn: '2026-07-01', endsOn: '2026-07-05', vesselName: 'GOURY', registrationNumber: '934968', dayCount: 5 }),
    ]);
  });

  it('keeps consecutive services grouped when several vessels are selected', () => {
    const overlappingVessels = {
      ...overview,
      assignments: overview.assignments.map((assignment, index) => index === 2
        ? { ...assignment, startsOn: '2026-07-02', endsOn: '2026-07-03' }
        : assignment),
    };
    const data = buildBoardingCertificateData(overlappingVessels, {
      ...input,
      vesselIds: [2, 3],
    });
    expect(data.periods).toEqual([
      expect.objectContaining({ startsOn: '2026-07-28', endsOn: '2026-08-11', vesselName: 'GOURY', dayCount: 15 }),
      expect.objectContaining({ startsOn: '2026-07-01', endsOn: '2026-07-05', vesselName: 'GOURY', dayCount: 5 }),
      expect.objectContaining({ startsOn: '2026-07-02', endsOn: '2026-07-03', vesselName: 'COTENTIN', dayCount: 2 }),
    ]);
  });

  it('patches the retained Word template while preserving its header, footer and images', async () => {
    const originalBytes = await template('attestation-embarquement.docx');
    const original = await JSZip.loadAsync(originalBytes);
    const result = await generateBoardingCertificate('docx', overview, input, { docx: originalBytes });
    expect(result.fileName).toBe("Attestation d'embarquement - Adrien BOIS - 31-12-2026.docx");
    const generated = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await generated.file('word/document.xml')!.async('string');
    expect(xml).toContain('Adrien BOIS');
    expect(xml).toContain('20136866');
    expect(xml).toContain('Capitaine 200, Chef de Quart 500, Mécanicien 250 kW');
    expect(xml).toContain('28/07/2026 au 11/08/2026');
    expect(xml).toContain('31/12/2026');
    expect(xml).not.toMatch(/<w:t>10<\/w:t>/);
    const preserveOnlyParts = Object.keys(original.files).filter((part) => part !== 'word/document.xml' && !original.files[part].dir);
    for (const part of preserveOnlyParts) {
      await expect(generated.file(part)!.async('uint8array')).resolves.toEqual(await original.file(part)!.async('uint8array'));
    }
  });

  it('generates the PDF from the retained one-page template', async () => {
    const result = await generateBoardingCertificate('pdf', overview, input, {
      pdf: await template('attestation-embarquement.pdf'),
      signature: await template('attestation-signature.png'),
    });
    expect(result.fileName).toBe("Attestation d'embarquement - Adrien BOIS - 31-12-2026.pdf");
    const document = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(document.getPageCount()).toBe(1);
    expect(result.blob.size).toBeGreaterThan(250_000);
  });

  it('repeats the retained PDF template when the service table needs several pages', async () => {
    const assignments = Array.from({ length: 19 }, (_, index) => {
      const serviceDate = new Date(Date.UTC(2026, 0, 1 + index * 2)).toISOString().slice(0, 10);
      return {
        ...overview.assignments[0],
        id: 100 + index,
        startsOn: serviceDate,
        endsOn: serviceDate,
      };
    });
    const result = await generateBoardingCertificate('pdf', { ...overview, assignments }, {
      ...input,
      startsOn: '2026-01-01',
      endsOn: '2026-02-28',
    }, {
      pdf: await template('attestation-embarquement.pdf'),
      signature: await template('attestation-signature.png'),
    });
    const document = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(document.getPageCount()).toBe(2);
  });
});
