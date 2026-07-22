import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ClientRecord, ProjectContractRecord, ProjectRecord } from './projectQueries';
import {
  buildGeneratedDocumentFileName,
  buildProjectOfferRows,
  buildProjectSupplytimePdfFields,
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
  redeliveryPort: 'Saint-Nazaire',
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

const client = { id: 50, name: 'Ifremer' } as ClientRecord;

describe('projectDocumentGeneration', () => {
  it('rebuilds the historical SharePoint offer headings from canonical SeaPilot values', () => {
    const rows = Object.fromEntries(buildProjectOfferRows({ client, contract, project }).map((row) => [row.label, row.value]));
    expect(rows).toMatchObject({
      Client: 'Ifremer',
      Project: 'P1107 - Campagne / Atlantique',
      'Contract form': 'SUPPLYTIME 2017',
      'Port of Delivery': 'Brest',
      'Mobilization costs HT': '2 000 EUR',
      'Durées optionnelles': '2 x 5 jours',
      'Invoicing period': 'Facturation mensuelle',
      'Payment terms': '30 jours fin de mois',
    });
  });

  it('uses canonical project and typed contract values in the SPFx SUPPLYTIME overlay', () => {
    const values = buildProjectSupplytimePdfFields(project, contract);
    expect(values.box01_owners).toBe('BBTM, Cherbourg');
    expect(values.box03_vessel).toContain('COTENTIN');
    expect(values.box06_port_delivery).toBe('Brest');
    expect(values.box20_charter_hire).toContain('12');
    expect(values.box20_charter_hire).not.toBe('ancienne valeur');
  });

  it('creates safe and explicit offer and contract filenames', () => {
    expect(buildGeneratedDocumentFileName('offer', project)).toBe('P1107 - Offre - R1.pdf');
    expect(buildGeneratedDocumentFileName('bimco_supplytime', { ...project, projectCode: '' })).toBe(
      'Campagne - Atlantique - BIMCO SUPPLYTIME 2017 - R1.pdf',
    );
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
