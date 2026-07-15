import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createPlanningPreviewOverview } from './planningPreviewData';
import {
  availablePlanningCrewListBoards,
  buildPlanningCrewList,
  generatePlanningCrewList,
  inferPlanningBirthCountry,
  planningIdentityDocumentLabel,
} from './planningCrewList';

describe('planning crew list', () => {
  it('selects the active board and uses only Planning/Supabase profile fields', () => {
    const overview = createPlanningPreviewOverview('2026-07-14');
    overview.people = overview.people.map((person) => person.id === 101 ? {
      ...person,
      birthDate: '1982-04-12',
      birthPlace: 'Cherbourg',
      identityDocumentType: 'Passeport',
      identityDocumentNumber: 'FR123456',
    } : person);

    expect(availablePlanningCrewListBoards(overview, 1, '2026-07-14')).toEqual(['Bordée 1']);
    const document = buildPlanningCrewList(overview, { vesselId: 1, date: '2026-07-14', watchGroup: 'Bordée 1' });
    expect(document.vesselName).toBe('GOURY');
    expect(document.rows).toHaveLength(5);
    expect(document.rows[0]).toMatchObject({
      familyName: 'LEPRETRE', firstName: 'Pierre', birthDate: '1982-04-12',
      birthPlace: 'Cherbourg', birthCountry: 'France', nationality: 'FR', identityDocumentType: 'passport',
      identityDocumentNumber: 'FR123456', rank: 'Capitaine', visaNumber: 'N/A',
    });
    expect(document.shipOwnerName).toBe('Benjamin BON');
    expect(document.incompleteProfiles).toHaveLength(4);
  });

  it('normalizes identity documents and infers an English country name from the birth place', () => {
    expect(planningIdentityDocumentLabel('CNI')).toBe('ID');
    expect(planningIdentityDocumentLabel('Passeport')).toBe('passport');
    expect(inferPlanningBirthCountry('Dakar')).toBe('Senegal');
    expect(inferPlanningBirthCountry('Cherbourg-en-Cotentin')).toBe('France');
  });

  it('generates a valid styled Excel workbook with an A4 landscape crew-list sheet', async () => {
    const document = buildPlanningCrewList(createPlanningPreviewOverview('2026-07-14'), {
      vesselId: 1, date: '2026-07-14', watchGroup: 'Bordée 1',
    });
    const generated = await generatePlanningCrewList(document, 'xlsx');
    const zip = await JSZip.loadAsync(await generated.blob.arrayBuffer());
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    const styles = await zip.file('xl/styles.xml')?.async('string');
    const drawing = await zip.file('xl/drawings/drawing1.xml')?.async('string');
    expect(generated.fileName).toBe('crew-list-goury-bordee-1-2026-07-14.xlsx');
    expect(sheet).toContain('orientation="landscape"');
    expect(sheet).toContain('IMO CREW LIST');
    expect(sheet).toContain('Pierre');
    expect(sheet).not.toContain('Sophie');
    expect(sheet!.indexOf('<autoFilter')).toBeLessThan(sheet!.indexOf('<mergeCells'));
    expect(sheet!.indexOf('<printOptions')).toBeLessThan(sheet!.indexOf('<pageMargins'));
    expect(drawing).toContain('Signature Benjamin BON');
    expect(zip.file('xl/media/signature-benjamin-bon.png')).not.toBeNull();
    expect(styles).not.toMatch(/0C5A82|E8F1F7|103A5F/);
    expect(new DOMParser().parseFromString(styles || '', 'application/xml').querySelector('parsererror')).toBeNull();
  });

  it('generates an A4 landscape PDF crew list', async () => {
    const document = buildPlanningCrewList(createPlanningPreviewOverview('2026-07-14'), {
      vesselId: 1, date: '2026-07-14', watchGroup: 'Bordée 1',
    });
    const generated = await generatePlanningCrewList(document, 'pdf');
    const bytes = new Uint8Array(await generated.blob.arrayBuffer());
    const content = new TextDecoder('latin1').decode(bytes);
    expect(generated.fileName).toBe('crew-list-goury-bordee-1-2026-07-14.pdf');
    expect(content.startsWith('%PDF-')).toBe(true);
    expect(content).toMatch(/\/MediaBox \[0 0 841\.88\d* 595\.27\d*\]/);
    expect(content).toContain('FAL 5 - Crew list');
    expect(content).toContain('Benjamin BON');
    expect(content).not.toContain('Generated from SeaPilot Planning data');
  });

  it('keeps historical Supabase periods available when no native assignment supersedes them', () => {
    const overview = createPlanningPreviewOverview('2026-07-14');
    overview.assignments = [];
    overview.periods = [{
      id: 1, personId: 101, vesselId: 1, crewName: 'Pierre LEPRETRE', vesselName: 'GOURY', watchGroup: 'Bordée historique',
      functionLabel: 'Capitaine', sailorStatus: 'Embarqué', startsOn: '2026-07-01', endsOn: '2026-07-31', yearNumber: 2026,
      comments: '', slot365SourceId: '1', slot365SourceKey: 'history-1', sourceLabel: 'sharepoint',
    }];
    expect(availablePlanningCrewListBoards(overview, 1, '2026-07-14')).toEqual(['Bordée historique']);
    expect(buildPlanningCrewList(overview, { vesselId: 1, date: '2026-07-14', watchGroup: 'Bordée historique' }).rows[0].rank).toBe('Capitaine');
  });
});
