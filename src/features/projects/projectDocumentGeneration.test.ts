import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ClientRecord, ProjectContractRecord, ProjectRecord } from './projectQueries';
import {
  buildGeneratedDocumentFileName,
  buildBareboatTemplateFields,
  buildProjectOfferRows,
  buildProjectSupplytimePdfFields,
  buildTowageTemplateFields,
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

  it('adds only non-empty included-service descriptions to the offer rows', () => {
    const rows = buildProjectOfferRows({
      client,
      contract: {
        ...contract,
        supplytimeData: {
          ...contract.supplytimeData,
          commercial_charter_hire_service_description: 'Navire, équipage et matériel de pont.',
          commercial_demobilisation_service_description: '   ',
          commercial_mobilisation_service_description: 'Préparation et transit vers Brest.',
        },
      },
      project,
    });
    const rowValues = Object.fromEntries(rows.map((row) => [row.label, row.value]));

    expect(rowValues['Charter hire included services']).toBe('Navire, équipage et matériel de pont.');
    expect(rowValues['Mobilization included services']).toBe('Préparation et transit vers Brest.');
    expect(rowValues).not.toHaveProperty('Demobilization included services');
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
    expect(buildGeneratedDocumentFileName('bareboat_charter', project)).toBe(
      "P1107 - Contrat d'affretement - R1.pdf",
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
      const generated = await generateProjectDocument('offer', {
        client,
        contract: {
          ...contract,
          supplytimeData: {
            ...contract.supplytimeData,
            commercial_charter_hire_service_description: 'Navire, équipage et matériel de pont.',
          },
        },
        emitter: {
          firstName: 'Christophe',
          functionLabel: 'Directeur commercial',
          lastName: 'MINASSIAN',
          signatureMimeType: 'image/png',
          signatureUrl: 'https://signature.test/current.png',
        },
        project,
      });
      const bytes = new Uint8Array(await generated.blob.arrayBuffer());
      const document = await PDFDocument.load(bytes);

      expect(generated.fileName).toBe('P1107 - Offre - R1.pdf');
      expect(generated.mimeType).toBe('application/pdf');
      expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(bytes.byteLength).toBeGreaterThan(10_000);
      expect(document.getPageCount()).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('generates the six-page towage contract with the numbered business fields', async () => {
    const template = await readFile(resolve('public/templates/contrat-remorquage-bbtm.pdf'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(template, {
        headers: { 'content-type': 'application/pdf' },
        status: 200,
      }),
    );

    try {
      const input = {
        client,
        contract: {
          ...contract,
          charterHire: 34_000,
          supplytimeData: {
            departure_window: 'Du 03/08 au 07/08/2026',
            connection_time: '2 heures',
            disconnection_time: '1 heure',
          },
        },
        emitter: {
          firstName: 'Christophe',
          functionLabel: 'Directeur commercial',
          lastName: 'MINASSIAN',
          signatureMimeType: '',
          signatureUrl: '',
        },
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
        towedAsset: {
          id: 1,
          projectId: project.id,
          name: 'ELAN',
          assetType: 'Vedette de surveillance désarmée',
          lengthOverallM: 41,
          breadthOverallM: 7.5,
          maxDraftM: 2.6,
          lightDisplacementT: 305,
          flag: 'FR',
          classificationSociety: '-',
          registrationNumber: '-',
          ownerName: 'MARINE NATIONALE',
          hullMachineryInsurer: '',
          liabilityInsurer: '',
          photoUrl: '',
          photoStoragePath: '',
          active: true,
        },
        vessel: {
          id: 12,
          name: 'LE ROZEL',
          acronym: 'LRZ',
          active: true,
          fleetExitOn: '',
          sharePointItemId: '12',
          lengthOverall: '19,20 m',
          bollardPullTonnes: 12,
          deckEquipment: 'Treuil de remorquage 16T + remorque 350m DN26',
          mainEngine: '2 x 325 kW',
          mainEnginePowerKw: 650,
          classificationLabel: 'Bureau Veritas',
          flagState: 'France',
          registrationNumber: '937905',
          liabilityInsurer: "Shipowner’s Club",
        },
      };
      const fields = buildTowageTemplateFields(input);
      const generated = await generateProjectDocument('towage_contract', input);
      const bytes = new Uint8Array(await generated.blob.arrayBuffer());
      const document = await PDFDocument.load(bytes);

      expect(generated.fileName).toBe('P1107 - Contrat de remorquage - R1.pdf');
      expect(generated.mimeType).toBe('application/pdf');
      expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(document.getPageCount()).toBe(6);
      expect(fields.CHARTERER).toContain('Ifremer');
      expect(fields.TOWED_VESSEL).toContain('Nom : ELAN');
      expect(fields.TUG).toContain('Nom : LE ROZEL');
      expect(fields.TUG).toContain("Assureur RC (P&I) : Shipowner’s Club");
      expect(fields.TOWED_CONDITIONS).toContain('Bonne condition de partance');
      expect(fields.OPTIONAL_COSTS).toContain('3400€ HT / 24h');
      expect(fields.PAYMENT_TERMS).toContain('A 30 jours réception de facture : 100%');
      expect(fields.SPECIAL_CONDITIONS).toBe('TVA 20%');
      expect(fields.CHARTERER_SIGNATORY).toBe('Claire MARTIN');
      expect(fields.OWNER_SIGNATORY).toBe('Christophe MINASSIAN');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('generates the four-page bareboat charter from the sanitized attached model', async () => {
    const [template, editableTemplate] = await Promise.all([
      readFile(resolve('public/templates/contrat-affretement-bbtm.pdf')),
      readFile(resolve('public/templates/contrat-affretement-bbtm.docx')),
    ]);
    const archive = await JSZip.loadAsync(editableTemplate);
    const templateXml = (await Promise.all(
      Object.values(archive.files)
        .filter((entry) => !entry.dir && entry.name.endsWith('.xml'))
        .map((entry) => entry.async('string')),
    )).join('\n');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(template, {
        headers: { 'content-type': 'application/pdf' },
        status: 200,
      }),
    );
    const input = {
      client: {
        ...client,
        address: '162 rue du Large',
        postalCode: '29280',
        city: 'Plouzané',
        country: 'France',
        siret: '123 456 789 00010',
      },
      contract: {
        ...contract,
        ownerIdentity: '',
        supplytimeData: {
          bareboat_contract_date: '2026-09-01',
          bareboat_contract_place: 'Cherbourg-En-Cotentin',
          bareboat_delivery_by_truck: 'true',
          bareboat_extension_options: 'Deux prolongations de cinq jours',
          bareboat_last_admin_visit: '2026-06-12',
          bareboat_navigation_permit: '3e catégorie',
          bareboat_manning_permit: 'Minimum 2 personnes',
          bareboat_insured_value: '400 000 €',
        },
      },
      emitter: {
        firstName: 'Christophe',
        functionLabel: 'Directeur commercial',
        lastName: 'MINASSIAN',
        signatureMimeType: '',
        signatureUrl: '',
      },
      project: { ...project, contractType: "Contrat d'Affrètement" },
      vesselCertificates: [
        {
          id: 127,
          vesselId: 12,
          documentTitle: 'Certificat de Classification',
          title: 'Certificat de Classification',
          status: 'valid',
          issuedOn: '2026-08-12',
          expiresOn: '2028-08-16',
          updatedAt: '2026-08-18T14:59:43Z',
        },
        {
          id: 100,
          vesselId: 12,
          documentTitle: 'Permis de Navigation',
          title: 'Permis de Navigation',
          status: 'valid',
          issuedOn: '2025-05-29',
          expiresOn: '2027-05-29',
          updatedAt: '2026-08-11T12:14:13Z',
        },
        {
          id: 99,
          vesselId: 12,
          documentTitle: "Permis d'Armement",
          title: "Permis d'Armement",
          status: 'valid',
          issuedOn: '2023-12-26',
          expiresOn: '',
          updatedAt: '2026-08-19T12:06:19Z',
        },
      ],
      vessel: {
        id: 12,
        name: 'LE ROZEL',
        acronym: 'LRZ',
        active: true,
        fleetExitOn: '',
        sharePointItemId: '12',
        registrationNumber: '937905',
        registrationPort: 'Cherbourg',
        flagState: 'France',
        classificationLabel: 'Bureau Veritas',
        builtYear: 2018,
        navigationCategory: '3e catégorie',
      },
    };

    try {
      const fields = buildBareboatTemplateFields(input);
      const generated = await generateProjectDocument('bareboat_charter', input);
      const bytes = new Uint8Array(await generated.blob.arrayBuffer());
      const document = await PDFDocument.load(bytes);

      expect(generated.fileName).toBe("P1107 - Contrat d'affretement - R1.pdf");
      expect(generated.mimeType).toBe('application/pdf');
      expect(document.getPageCount()).toBe(4);
      const pageFourXObjects = document.getPage(3).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      expect(pageFourXObjects?.keys()).toHaveLength(1);
      expect(fields.CHARTERER).toContain('Ifremer');
      expect(fields.CHARTERER).toContain('Siret : 123 456 789 00010');
      expect(fields.VESSEL_IDENTITY).toContain("Port d’immatriculation : Cherbourg");
      expect(fields.VESSEL_DETAILS).toContain('Année de construction : 2018');
      expect(fields.MINIMUM_DURATION).toBe('15 jours');
      expect(fields.CONTRACT_PLACE).toBe('Cherbourg-En-Cotentin');
      expect(fields.CONTRACT_DATE_LONG).toBe('1 septembre 2026');
      expect(fields.LAST_ADMIN_VISIT).toBe('12 août 2026');
      expect(fields.NAVIGATION_TITLES).toContain('Permis de navigation : 29 mai 2027');
      expect(fields.NAVIGATION_TITLES).toContain('Permis d’armement : Illimité');
      expect(fields.DELIVERY).toContain('1 juillet 2026 à 08 h 00 · Brest');
      expect(fields.DELIVERY).toContain('Sur camion – Déchargement à la charge de l’affréteur');
      expect(fields.REDELIVERY).toBe('15 juillet 2026 à 18 h 00 · Nantes - Saint-Nazaire');
      expect(fields.EXTENSIONS).toBe('Deux prolongations de cinq jours');
      expect(fields.CHARTER_HIRE).not.toContain('Loyer journalier');
      expect(fields.APPLICABLE_LAW).toBe('Française');
      expect(fields.JURISDICTION).toBe('Tribunal maritime du Havre');
      expect(fields.OWNER_SIGNATORY).toBe('Christophe MINASSIAN');
      ['HOLENN EUSA', 'P242', 'ETMF', '22 janvier 2026', 'Marteen ENDEL'].forEach((executedValue) => {
        expect(templateXml).not.toContain(executedValue);
      });
      expect(archive.file('word/media/image1.jpeg')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
