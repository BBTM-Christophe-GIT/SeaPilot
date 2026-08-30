import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ClientRecord, ProjectContractRecord, ProjectRecord } from './projectQueries';
import {
  buildGeneratedDocumentFileName,
  buildProjectOfferRows,
  buildProjectSupplytimePdfFields,
  formatOfferGenerationDate,
  generateProjectDocument,
} from './projectDocumentGeneration';

const project: ProjectRecord = {
  id: 901,
  title: 'Campagne / Atlantique',
  projectCode: 'P1107',
  clientId: 50,
  clientSharePointItemId: '50',
  clientName: 'Ifremer',
  primaryVesselId: 12,
  primaryVesselSharePointItemId: '12',
  primaryVesselName: 'COTENTIN',
  secondaryVesselId: null,
  secondaryVesselSharePointItemId: '',
  secondaryVesselName: '',
  startsOn: '2026-07-01',
  endsOn: '2026-07-15',
  deliveryAt: '2026-07-01T08:00:00+02:00',
  redeliveryAt: '2026-07-15T18:00:00+02:00',
  charterStartsAt: '2026-07-01T08:00:00+02:00',
  charterEndsAt: '2026-07-15T18:00:00+02:00',
  deliveryPort: 'Brest',
  redeliveryPort: 'Nantes - Saint-Nazaire',
  contractType: 'SUPPLYTIME 2017',
  operationArea: 'Atlantique Nord',
  isRovSupport: true,
  isDivingSupport: false,
  status: 'Offre transmise',
  description: 'Campagne bathymétrique',
  sourceLabel: 'sharepoint',
  sharePointListTitle: 'BBTM - Projets',
  sharePointItemId: '901',
  sourceModifiedAt: '2026-07-14T12:00:00Z',
  archivedAt: '',
  updatedAt: '2026-07-16T08:00:00Z',
};

const contract: ProjectContractRecord = {
  id: 1,
  projectId: 901,
  ownerIdentity: 'BBTM, Cherbourg',
  vesselAssignmentLimit: '',
  extensionCount: 2,
  extensionDuration: 5,
  extensionUnit: 'jours',
  autoExtensionPeriod: 'Voyage',
  maxExtensionDays: 10,
  mobilisationFee: 2000,
  demobilisationFee: 1000,
  feeCurrency: 'EUR',
  charterHire: 12000,
  extensionHire: 13000,
  hireCurrency: 'EUR',
  hireUnit: 'jour',
  maxAuditPeriod: '30 jours',
  supplytimeSchemaVersion: 'supplytime-2017-v1',
  supplytimeData: {
    box02_charterers: 'Ifremer, Brest',
    box09_period: '15 jours fermes',
    box19_special_fuel: "A la charge de l'affréteur",
    box20_charter_hire: 'ancienne valeur',
    box22_invoice_remittance: 'Facturation mensuelle',
    box23_payment: '30 jours fin de mois',
  },
  sourceLabel: 'sharepoint',
  sharePointListTitle: 'BBTM - Projets',
  sharePointItemId: '901',
  sourceModifiedAt: '2026-07-14T12:00:00Z',
  archivedAt: '',
};

const client = { id: 50, name: 'Ifremer', representedBy: 'Claire MARTIN' } as ClientRecord;

describe('projectDocumentGeneration', () => {
  it('rebuilds the historical SharePoint offer headings from canonical SeaPilot values', () => {
    const rows = Object.fromEntries(buildProjectOfferRows({ client, contract, project }).map((row) => [row.label, row.value]));
    expect(rows).toMatchObject({
      Client: 'Ifremer',
      'Represented by': 'Claire MARTIN',
      Project: 'P1107 - Campagne / Atlantique',
      'Contract form': 'SUPPLYTIME 2017',
      Duties: 'Campagne bathymétrique',
      'Port of Delivery': 'Brest\nFR BES',
      'Port of Redelivery': 'Nantes - Saint-Nazaire\nFR NTE',
      'Mobilization costs HT': '2 000 € HT',
      'Demobilization costs HT': '1 000 € HT',
      'Day rate extension': '13 000 € HT / Jour',
      'Durées optionnelles': '2 x 5 jours',
      Fuel: "A la charge de l'affréteur",
      'Invoicing period': 'Facturation mensuelle',
      'Payment terms': '30 jours fin de mois',
    });
  });

  it('formats positive day rates in the requested order and omits zero values', () => {
    const rows = buildProjectOfferRows({
      client,
      contract: {
        ...contract,
        hirePeriods: [{
          id: 1,
          projectId: project.id,
          contractId: contract.id,
          startsOn: '2026-07-01',
          endsOn: '',
          charterHire: 2200,
          standbyHire: 0,
          weatherStandbyHire: 2500,
          hireCurrency: 'EUR',
          hireUnit: 'jour',
        }],
      },
      project,
    });
    const dayRate = rows.find((row) => row.label === 'Day rate normal')?.value;

    expect(dayRate).toBe('En Opération : 2 200 € HT / Jour.\nWeather Stand-by : 2 500 € HT / Jour.');
    expect(dayRate).not.toContain('\nStand-by :');
    expect(rows.every((row) => row.value && !row.value.startsWith('Non renseign'))).toBe(true);
  });

  it('uses canonical project and typed contract values in the SPFx SUPPLYTIME overlay', () => {
    const values = buildProjectSupplytimePdfFields(project, {
      ...contract,
      hirePeriods: [{
        id: 1,
        projectId: project.id,
        contractId: contract.id,
        startsOn: '2026-07-01',
        endsOn: '',
        charterHire: 12000,
        standbyHire: 9000,
        weatherStandbyHire: 6000,
        hireCurrency: 'EUR',
        hireUnit: 'jour',
      }],
    });
    expect(values.box01_owners).toBe('BBTM, Cherbourg');
    expect(values.box03_vessel).toContain('COTENTIN');
    expect(values.box06_port_delivery).toBe('Brest');
    expect(values.box20_charter_hire).toContain('12');
    expect(values.box20_charter_hire).toContain('Stand-by');
    expect(values.box20_charter_hire).toContain('Weather Stand-by');
    expect(values.box20_charter_hire).not.toBe('ancienne valeur');
  });

  it('creates safe and explicit offer and contract filenames', () => {
    expect(buildGeneratedDocumentFileName('offer', project)).toBe('P1107 - Offre - R1.pdf');
    expect(buildGeneratedDocumentFileName('bimco_supplytime', { ...project, projectCode: '' })).toBe(
      'Campagne - Atlantique - BIMCO - R1.pdf',
    );
  });

  it('formats the commercial offer generation date for the PDF footer', () => {
    expect(formatOfferGenerationDate(new Date('2026-08-20T12:00:00Z'))).toBe('20/08/2026');
  });

  it('generates an offer PDF with the BBTM logo asset', async () => {
    const logo = await readFile(resolve('public/bbtm-report-logo.png'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(logo, { headers: { 'content-type': 'image/png' }, status: 200 }),
    );

    try {
      const generated = await generateProjectDocument('offer', { client, contract, project });
      const bytes = new Uint8Array(await generated.blob.arrayBuffer());

      expect(generated.fileName).toBe('P1107 - Offre - R1.pdf');
      expect(generated.mimeType).toBe('application/pdf');
      expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(bytes.byteLength).toBeGreaterThan(10_000);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('fills every towage placeholder with project and mission data', async () => {
    const template = await readFile(resolve('public/templates/contrat-remorquage-bbtm.docx'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(template, {
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        status: 200,
      }),
    );

    try {
      const generated = await generateProjectDocument('towage_contract', {
        client,
        contract,
        occurrence: {
          id: 44,
          projectId: project.id,
          primaryVesselId: 12,
          primaryVesselName: 'LE ROZEL',
          startsOn: '2026-08-03',
          endsOn: '2026-08-07',
          status: 'Planifié',
          description: 'Remorquage de test',
          charterHire: 12_000,
          hireCurrency: 'EUR',
          hireUnit: 'jour',
          sourceLabel: 'seapilot',
          createdAt: '2026-07-21T12:00:00Z',
        },
        project,
      });
      const zip = await JSZip.loadAsync(await generated.blob.arrayBuffer());
      const xml = await zip.file('word/document.xml')?.async('string');

      expect(generated.fileName).toBe('P1107 - Contrat de remorquage - R1.docx');
      expect(xml).toContain('LE ROZEL');
      expect(xml).toContain('Ifremer');
      expect(xml).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
