import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  buildSharePointImportReport,
  buildSharePointImportBatches,
  buildSharePointImportBatchesFromExport,
  buildSharePointUpsertBatch,
  importSharePointExportBundle,
  resolveSharePointDocumentLinks,
  resolveSharePointDprLinks,
  resolveSharePointFleetCertificateLinks,
  resolveSharePointHrDocumentLinks,
  resolveSharePointOperationLinks,
  resolveSharePointPlanningLinks,
  resolveSharePointProjectDocumentLinks,
  resolveSharePointProjectLinks,
  resolveSharePointPublishedProcedureLinks,
  upsertSharePointBatch,
  upsertSharePointBatches,
} from './sharePointImport';

describe('SharePoint import mapping', () => {
  it('maps RH Personnel SharePoint items to people upserts with reconciliation metadata', () => {
    const batch = buildSharePointUpsertBatch('list-rh-personnel-bbtm', [
      {
        id: '42',
        fields: {
          Id: 42,
          UniqueId: 'rh-unique-42',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'LECOCQ',
          Pr_x00e9_nom: 'Julien',
          Email: 'julien.lecocq@bbtm.fr',
          Fonction: 'Fleet Technical Manager',
          Grade: 'Officier',
          Role: 'Navigant',
          Registre: 'RIF',
          Sexe: 'Homme',
          NumerodeMarin: '2009574',
          CompteM365: 'julien.lecocq@bbtm.fr',
          N_x00b0_T_x00e9_l_x00e9_phone: '+33 1 02 03 04 05',
          AdressePostale: '1 quai des pilotes, 76000 Rouen',
          DatedeNaissance: '1985-04-12T00:00:00Z',
          LieudeNaissance: 'Rouen',
          Num_x00e9_roIdentit_x00e9_: 'ID-12345',
          TypedeDocumentdIdentit_x00e9_: 'Passeport',
          TypedeContrat: 'CDI',
          DatedEmbauche: '2024-01-01T00:00:00Z',
          Dateded_x00e9_part: null,
          Causedud_x00e9_part: null,
          Pr_x00e9_nometNOMContactdUrgence: 'Marie MARTIN',
          LienParent_x00e9_ContactdUrgence: 'Conjointe',
          Num_x00e9_rodet_x00e9_l_x00e9_ph: '+33 6 00 00 00 00',
          Adressecompl_x00e8_teContactdUrg: '2 rue du Port, 76000 Rouen',
          A_x002d_TourdeTaille: '84',
          B_x002d_Poitrine: '102',
          C_x002d_Tailletotale: '178',
          DLongueurEntrejambe: '82',
          E_x002d_TourdeHanche: '96',
          Poids: '78,5',
          Pointure: 43,
          TailleCombinaison: 'L',
          TaillePantalon: '42',
          TailleVesteHomme: 'L',
          BrevetPont: { LookupValue: 'Capitaine 200' },
          BrevetMachine: { LookupValue: 'Mecanicien 250 kW' },
          FormationGrutage: '2025-03-10T00:00:00Z',
          InductionGrutage: '2025-03-12T00:00:00Z',
          Actif: 'Oui',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-rh-personnel-bbtm',
      targetTable: 'people',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          first_name: 'Julien',
          last_name: 'LECOCQ',
          email: 'julien.lecocq@bbtm.fr',
          function_label: 'Fleet Technical Manager',
          grade_label: 'Officier',
          role_label: 'Navigant',
          register_label: 'RIF',
          sex: 'Homme',
          sailor_number: '2009574',
          m365_account: 'julien.lecocq@bbtm.fr',
          phone: '+33 1 02 03 04 05',
          postal_address: '1 quai des pilotes, 76000 Rouen',
          birth_date: '1985-04-12',
          birth_place: 'Rouen',
          identity_document_number: 'ID-12345',
          identity_document_type: 'Passeport',
          contract_type: 'CDI',
          hired_on: '2024-01-01',
          departed_on: null,
          departure_reason: null,
          emergency_contact_name: 'Marie MARTIN',
          emergency_contact_relationship: 'Conjointe',
          emergency_contact_phone: '+33 6 00 00 00 00',
          emergency_contact_address: '2 rue du Port, 76000 Rouen',
          waist_size: 84,
          chest_size: 102,
          full_height_size: 178,
          inseam_size: 82,
          hip_size: 96,
          weight_kg: 78.5,
          shoe_size: 43,
          coverall_size: 'L',
          pants_size: '42',
          jacket_size: 'L',
          deck_certificate_label: 'Capitaine 200',
          engine_certificate_label: 'Mecanicien 250 kW',
          crane_training_on: '2025-03-10',
          crane_induction_on: '2025-03-12',
          active: true,
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: '3b6f504c-908a-4d3e-8319-a595acb54efe',
          sharepoint_list_title: 'RH - Personnel BBTM',
          sharepoint_item_id: '42',
          sharepoint_unique_id: 'rh-unique-42',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps SMTR planning day items to planning_days upserts', () => {
    const batch = buildSharePointUpsertBatch('list-smtr-journees-planning', [
      {
        fields: {
          ID: 77,
          GUID: 'day-guid-77',
          Modified: '2026-07-01T20:00:00Z',
          NomMarin: 'Paul DURAND',
          NomCapitaine: 'Jean MARTIN',
          NomNavire: 'COTENTIN',
          DateTravail: '2026-07-01T00:00:00Z',
          DateDebarque: '2026-07-14T00:00:00Z',
          Annee: '2026',
          MoisNo: '7',
          MoisLibelle: 'Juillet',
          JourNo: '1',
          Fonction: 'Pont',
          StatutMarin: 'Embarque',
          StatutJour: 'Travaille',
          Rythme: '12h',
          Bord_x00e9_e: 'A',
          Slot365: 'SLOT-123',
          DateDepart: '2026-07-01T08:00:00Z',
          HeuresTravaillees: '10,5',
          Repos24h: '14',
          Cumul7j: 60,
          Commentaires: 'RAS',
        },
      },
    ]);

    expect(batch.targetTable).toBe('planning_days');
    expect(batch.rows[0]).toEqual({
      crew_name: 'Paul DURAND',
      captain_name: 'Jean MARTIN',
      vessel_name: 'COTENTIN',
      manual_vessel_name: null,
      work_date: '2026-07-01',
      disembark_on: '2026-07-14',
      year_number: 2026,
      month_number: 7,
      month_label: 'Juillet',
      day_number: 1,
      function_label: 'Pont',
      sailor_status: 'Embarque',
      day_status: 'Travaille',
      rhythm_label: '12h',
      watch_group: 'A',
      slot365: 'SLOT-123',
      departure_on: '2026-07-01',
      worked_hours: 10.5,
      rest_24h: 14,
      cumulative_7d: 60,
      comments: 'RAS',
      source_label: 'sharepoint',
      sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
      sharepoint_list_id: 'e711a664-6c52-4e4e-95cc-0843ac7c5253',
      sharepoint_list_title: 'SMTR - Journees - Planning',
      sharepoint_item_id: '77',
      sharepoint_unique_id: 'day-guid-77',
      sharepoint_file_ref: null,
      sharepoint_encoded_abs_url: null,
      source_modified_at: '2026-07-01T20:00:00Z',
    });
  });

  it('maps SMTR planning period items and sorts import batches by source priority', () => {
    const batches = buildSharePointImportBatches({
      'list-smtr-planning-periodes': [
        {
          fields: {
            Id: 88,
            NomMarin: 'Paul DURAND',
            NomNavire: 'COTENTIN',
            Bord_x00e9_e: 'A',
            Fonction: 'Pont',
            StatutMarin: 'Embarque',
            DateDebut: '01/07/2026',
            DateFin: '14/07/2026',
            Annee: 2026,
            Commentaires: 'Rotation A',
            Slot365SourceId: 77,
            Slot365SourceKey: 'SLOT-123',
          },
        },
      ],
      'list-bbtm-flotte': [
        {
          fields: {
            ID: 12,
            Title: 'COTENTIN',
            Acronyme: 'CTN',
            NavireActif: true,
          },
        },
      ],
    });

    expect(batches.map((batch) => batch.sourceKey)).toEqual(['list-bbtm-flotte', 'list-smtr-planning-periodes']);
    expect(batches[1]).toEqual({
      sourceKey: 'list-smtr-planning-periodes',
      targetTable: 'planning_periods',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          crew_name: 'Paul DURAND',
          vessel_name: 'COTENTIN',
          manual_vessel_name: null,
          watch_group: 'A',
          function_label: 'Pont',
          sailor_status: 'Embarque',
          starts_on: '2026-07-01',
          ends_on: '2026-07-14',
          year_number: 2026,
          comments: 'Rotation A',
          slot365_source_id: '77',
          slot365_source_key: 'SLOT-123',
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: 'c03eb1f4-1d24-4d86-b91e-9afaaa45870b',
          sharepoint_list_title: 'SMTR - Planning Periodes',
          sharepoint_item_id: '88',
          sharepoint_unique_id: null,
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: null,
        },
      ],
    });
  });

  it('maps KPI planning project items with lookup/text field fallbacks', () => {
    const batch = buildSharePointUpsertBatch('list-kpi-projets-planning', [
      {
        id: '501',
        fields: {
          Title: 'Projet Atlantique',
          Dated_x00e9_but: '2026-09-02T00:00:00Z',
          Datefin: '2026-09-15T00:00:00Z',
          Description: 'Mission maritime',
          Client: { LookupValue: 'IFREMER' },
          Navire: { LookupValue: 'COTENTIN' },
          Navire_x0020_2: 'SUROIT',
          Statut: 'A planifier',
        },
      },
    ]);

    expect(batch.rows[0]).toEqual(
      expect.objectContaining({
        title: 'Projet Atlantique',
        starts_on: '2026-09-02',
        ends_on: '2026-09-15',
        description: 'Mission maritime',
        client_name: 'IFREMER',
        primary_vessel_name: 'COTENTIN',
        secondary_vessel_name: 'SUROIT',
        status: 'A planifier',
        source_label: 'sharepoint',
        sharepoint_item_id: '501',
      }),
    );
  });

  it('maps BBTM Clients list items to client upserts', () => {
    const batch = buildSharePointUpsertBatch('list-bbtm-clients', [
      {
        id: '77',
        fields: {
          ID: 77,
          UniqueId: 'client-77',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'IFREMER',
          CodeClient: 'IFR',
          Email: 'contact@ifremer.fr',
          Telephone: '+33 1 23 45 67 89',
          Adresse: '1625 route de Sainte-Anne',
          Ville: 'Plouzane',
          Pays: 'France',
          Actif: 'Oui',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-bbtm-clients',
      targetTable: 'clients',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          name: 'IFREMER',
          code: 'IFR',
          email: 'contact@ifremer.fr',
          phone: '+33 1 23 45 67 89',
          address: '1625 route de Sainte-Anne',
          city: 'Plouzane',
          country: 'France',
          active: true,
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'BBTM Clients / BBTM - Clients',
          sharepoint_item_id: '77',
          sharepoint_unique_id: 'client-77',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps BBTM Projets list items to project upserts with client and vessel staging fields', () => {
    const batch = buildSharePointUpsertBatch('list-bbtm-projets', [
      {
        id: '880',
        fields: {
          UniqueId: 'project-880',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'Campagne Atlantique 2026',
          NumeroProjet: 'P-2026-014',
          ClientId: 77,
          Client: { LookupValue: 'IFREMER' },
          NavireId: 12,
          Navire: { LookupValue: 'COTENTIN' },
          Navire_x0020_2: 'SUROIT',
          Dated_x00e9_but: '2026-09-02T00:00:00Z',
          Datefin: '2026-09-15T00:00:00Z',
          Statut: 'Contrat signe',
          Description: 'Mission maritime',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-bbtm-projets',
      targetTable: 'projects',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          title: 'Campagne Atlantique 2026',
          project_code: 'P-2026-014',
          client_id: null,
          client_sharepoint_item_id: '77',
          client_name: 'IFREMER',
          primary_vessel_id: null,
          primary_vessel_sharepoint_item_id: '12',
          primary_vessel_name: 'COTENTIN',
          secondary_vessel_id: null,
          secondary_vessel_sharepoint_item_id: null,
          secondary_vessel_name: 'SUROIT',
          starts_on: '2026-09-02',
          ends_on: '2026-09-15',
          status: 'Contrat signe',
          description: 'Mission maritime',
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'BBTM - Projets',
          sharepoint_item_id: '880',
          sharepoint_unique_id: 'project-880',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps MGO list items to fuel price upserts', () => {
    const batch = buildSharePointUpsertBatch('list-mgo', [
      {
        id: '44',
        fields: {
          ID: 44,
          UniqueId: 'mgo-44',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'MGO juillet 2026',
          Date: '2026-07-01T00:00:00Z',
          PrixMGO_x002d_HT: '812,45',
          Devise: 'EUR',
          Fournisseur: 'TotalEnergies',
          Commentaires: 'Prix mensuel',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-mgo',
      targetTable: 'mgo_prices',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          price_date: '2026-07-01',
          price_ht: 812.45,
          currency: 'EUR',
          supplier_name: 'TotalEnergies',
          title: 'MGO juillet 2026',
          notes: 'Prix mensuel',
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'MGO',
          sharepoint_item_id: '44',
          sharepoint_unique_id: 'mgo-44',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps DPR indicator list items to dpr item upserts', () => {
    const batch = buildSharePointUpsertBatch('list-indicateurs-projet-p144emdt', [
      {
        id: '1200',
        fields: {
          UniqueId: 'dpr-item-1200',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'DPR 2026-07-01',
          DPR_x002d_Date: '2026-07-01T00:00:00Z',
          Heure_x0020_du_x0020_DPR: '18:30',
          DPR_x002d_Projet: { LookupValue: 'Campagne Atlantique 2026', LookupId: 880 },
          DPR_x002d_ProjetId: 880,
          NumeroProjet: 'P-2026-014',
          DPR_x002d_Navire: { LookupValue: 'COTENTIN', LookupId: 12 },
          DPR_x002d_NavireId: 12,
          DPR_x002d_DescriptionJourn_x00e9: 'Transit et mesures',
          DPR_x002d_ConsommationdeCarburan: '1250,5',
          DPR_x002d_AvitaillementMGO_x0028: '12,5',
          DPR_x002d_NoteQHSE: 'RAS',
          DPR_x002d_ContactRadio: true,
          DPR_x002d_Incident_x002f_Acciden: 1,
          DPR_x002d_Accidents: 0,
          DPR_x002d_LEMS_x002d_NbdeSituati: 2,
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-indicateurs-projet-p144emdt',
      targetTable: 'dpr_items',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          title: 'DPR 2026-07-01',
          project_id: null,
          project_sharepoint_item_id: '880',
          project_code: 'P-2026-014',
          project_title: 'Campagne Atlantique 2026',
          vessel_id: null,
          vessel_sharepoint_item_id: '12',
          vessel_name: 'COTENTIN',
          report_date: '2026-07-01',
          report_time: '18:30',
          description: 'Transit et mesures',
          fuel_consumption_l: 1250.5,
          mgo_refueling_m3: 12.5,
          qhse_note: 'RAS',
          radio_contact: true,
          environment_incident_count: 1,
          person_accident_count: 0,
          dangerous_situation_count: 2,
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: '3c26ee87-5f55-4018-a93e-634080cfc55e',
          sharepoint_list_title: 'Indicateurs Projet P144EMDT',
          sharepoint_item_id: '1200',
          sharepoint_unique_id: 'dpr-item-1200',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps DPR library items to DPR archive upserts', () => {
    const batch = buildSharePointUpsertBatch('library-dpr', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
        fields: {
          ID: 1201,
          UniqueId: 'dpr-archive-1201',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'DPR P-2026-014 2026-07-01.pdf',
          FileRef: '/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
          DPRId: 1200,
          ProjetId: 880,
          Projet: 'Campagne Atlantique 2026',
          NumeroProjet: 'P-2026-014',
          DateduDPR: '2026-07-01T00:00:00Z',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-dpr',
      targetTable: 'dpr_archives',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          dpr_item_id: null,
          dpr_sharepoint_item_id: '1200',
          project_id: null,
          project_sharepoint_item_id: '880',
          project_code: 'P-2026-014',
          project_title: 'Campagne Atlantique 2026',
          report_date: '2026-07-01',
          title: 'DPR P-2026-014 2026-07-01.pdf',
          source_label: 'sharepoint',
          source_sharepoint_id: '1201',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
          notes: '/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: 'f6efc4dd-751b-423d-9ead-2ea1d0458e7d',
          sharepoint_list_title: 'DPR',
          sharepoint_item_id: '1201',
          sharepoint_unique_id: 'dpr-archive-1201',
          sharepoint_file_ref: '/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
          sharepoint_encoded_abs_url:
            'https://bbtm668.sharepoint.com/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it("maps Demande d'Achat list items to purchase request upserts", () => {
    const batch = buildSharePointUpsertBatch('list-demande-achat', [
      {
        id: '700',
        fields: {
          ID: 700,
          UniqueId: 'purchase-700',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'DA-2026-001',
          NumeroDemande: 'DA-2026-001',
          DateDemande: '2026-07-02T00:00:00Z',
          Demandeur: 'Julien LECOCQ',
          Fournisseur: 'Chantier Naval Manche',
          ProjetId: 880,
          Projet: { LookupValue: 'Campagne Atlantique 2026' },
          NumeroProjet: 'P-2026-014',
          MontantHT: '12500,50',
          Devise: 'EUR',
          Statut: 'En cours',
          Objet: 'Achat capteurs',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-demande-achat',
      targetTable: 'purchase_requests',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          request_number: 'DA-2026-001',
          title: 'DA-2026-001',
          requested_on: '2026-07-02',
          requester_name: 'Julien LECOCQ',
          supplier_name: 'Chantier Naval Manche',
          project_id: null,
          project_sharepoint_item_id: '880',
          project_code: 'P-2026-014',
          project_title: 'Campagne Atlantique 2026',
          amount_ht: 12500.5,
          currency: 'EUR',
          status: 'En cours',
          description: 'Achat capteurs',
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: "Demande d'Achat",
          sharepoint_item_id: '700',
          sharepoint_unique_id: 'purchase-700',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps Audit list items to action item upserts', () => {
    const batch = buildSharePointUpsertBatch('list-audit', [
      {
        id: '810',
        fields: {
          ID: 810,
          UniqueId: 'audit-810',
          Modified: '2026-06-30T08:15:00Z',
          Title: 'Audit pont COTENTIN',
          Audit_x002f_VisiteHSE: 'Audit',
          TypedAudit: 'Interne',
          DateAudit: '2026-07-03T00:00:00Z',
          Echeance: '2026-07-31T00:00:00Z',
          Auditeur_x0028_s_x0029_: 'Jean MARTIN',
          Responsable: 'Arthur MAREST',
          ProjetId: 880,
          Projet: { LookupValue: 'Campagne Atlantique 2026' },
          NumeroProjet: 'P-2026-014',
          NavireId: 12,
          Navire: { LookupValue: 'COTENTIN' },
          Statut: 'Ouvert',
          Priorite: 'Haute',
          Description: 'Controle pont',
          ActionCorrective: 'Remplacer garde-corps',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'list-audit',
      targetTable: 'action_items',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          project_id: null,
          project_sharepoint_item_id: '880',
          project_code: 'P-2026-014',
          project_title: 'Campagne Atlantique 2026',
          vessel_id: null,
          vessel_sharepoint_item_id: '12',
          vessel_name: 'COTENTIN',
          category_key: 'audit',
          action_type: 'Audit',
          audit_type: 'Interne',
          title: 'Audit pont COTENTIN',
          status: 'Ouvert',
          priority_label: 'Haute',
          opened_on: '2026-07-03',
          due_on: '2026-07-31',
          owner_name: 'Arthur MAREST',
          auditor_name: 'Jean MARTIN',
          description: 'Controle pont',
          corrective_action: 'Remplacer garde-corps',
          source_label: 'sharepoint',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'Audit',
          sharepoint_item_id: '810',
          sharepoint_unique_id: 'audit-810',
          sharepoint_file_ref: null,
          sharepoint_encoded_abs_url: null,
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps Fiche de Progres library items to action document upserts', () => {
    const batch = buildSharePointUpsertBatch('library-fiche-progres', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Fiche%20de%20Progrs/Audit-pont.pdf',
        fields: {
          ID: 811,
          UniqueId: 'action-document-811',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'FP Audit pont COTENTIN.pdf',
          FileRef: '/sites/QHSE/Fiche de Progres/FP Audit pont COTENTIN.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Fiche%20de%20Progrs/Audit-pont.pdf',
          ActionId: 810,
          Action: 'Audit pont COTENTIN',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-fiche-progres',
      targetTable: 'action_documents',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          action_item_id: null,
          action_sharepoint_item_id: '810',
          action_title: 'Audit pont COTENTIN',
          category_key: 'progress_sheet',
          title: 'FP Audit pont COTENTIN.pdf',
          source_label: 'sharepoint',
          source_sharepoint_id: '811',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Fiche%20de%20Progrs/Audit-pont.pdf',
          notes: '/sites/QHSE/Fiche de Progres/FP Audit pont COTENTIN.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'Fiche de Progres',
          sharepoint_item_id: '811',
          sharepoint_unique_id: 'action-document-811',
          sharepoint_file_ref: '/sites/QHSE/Fiche de Progres/FP Audit pont COTENTIN.pdf',
          sharepoint_encoded_abs_url:
            'https://bbtm668.sharepoint.com/sites/QHSE/Fiche%20de%20Progrs/Audit-pont.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps Documentation Technique library items to technical document upserts', () => {
    const batch = buildSharePointUpsertBatch('library-documentation-technique', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documentation%20Technique/COTENTIN/moteur.pdf',
        fields: {
          ID: 1300,
          UniqueId: 'technical-document-1300',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'Notice moteur COTENTIN.pdf',
          FileRef: '/sites/QHSE/Documentation Technique/COTENTIN/moteur.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documentation%20Technique/COTENTIN/moteur.pdf',
          NavireId: 12,
          Navire: { LookupValue: 'COTENTIN' },
          CollaborateurId: 42,
          Collaborateur: { LookupValue: 'Julien LECOCQ' },
          Categorie: 'Moteur',
          DateDocument: '2026-06-01T00:00:00Z',
          DateEcheance: '2027-06-01T00:00:00Z',
          Revision: 'A',
          Statut: 'Valide',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-documentation-technique',
      targetTable: 'technical_documents',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          person_id: null,
          person_sharepoint_item_id: '42',
          person_name: 'Julien LECOCQ',
          vessel_id: null,
          vessel_sharepoint_item_id: '12',
          vessel_name: 'COTENTIN',
          category_key: 'Moteur',
          document_date: '2026-06-01',
          expires_on: '2027-06-01',
          revision_label: 'A',
          status: 'Valide',
          title: 'Notice moteur COTENTIN.pdf',
          source_label: 'sharepoint',
          source_sharepoint_id: '1300',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documentation%20Technique/COTENTIN/moteur.pdf',
          notes: '/sites/QHSE/Documentation Technique/COTENTIN/moteur.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'Documentation Technique',
          sharepoint_item_id: '1300',
          sharepoint_unique_id: 'technical-document-1300',
          sharepoint_file_ref: '/sites/QHSE/Documentation Technique/COTENTIN/moteur.pdf',
          sharepoint_encoded_abs_url:
            'https://bbtm668.sharepoint.com/sites/QHSE/Documentation%20Technique/COTENTIN/moteur.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps remaining document libraries to their target tables', () => {
    const sourceKeysByTargetTable = {
      'library-logos-systeme': 'document_assets',
      'library-vehicules': 'fleet_documents',
      'library-permis-travail': 'work_permits',
      'library-suivi-temps-travail': 'work_time_documents',
      'library-archive-documentaire': 'document_archive',
      'library-notes-service': 'service_notes',
      'library-alerte-securite': 'safety_alerts',
      'library-fiche-navire-equipement': 'vessel_equipment_documents',
      'library-registre-apparaux-levage': 'lifting_reports',
      'library-documents-partages': 'shared_documents',
    };

    for (const [sourceKey, targetTable] of Object.entries(sourceKeysByTargetTable)) {
      const batch = buildSharePointUpsertBatch(sourceKey, [
        {
          fields: {
            ID: 1400,
            FileLeafRef: `${sourceKey}.pdf`,
            EncodedAbsUrl: `https://bbtm668.sharepoint.com/sites/QHSE/${sourceKey}.pdf`,
            FileRef: `/sites/QHSE/${sourceKey}.pdf`,
          },
        },
      ]);

      expect(batch.targetTable).toBe(targetTable);
      expect(batch.rows[0]).toEqual(
        expect.objectContaining({
          title: `${sourceKey}.pdf`,
          source_label: 'sharepoint',
          source_sharepoint_id: '1400',
          file_url: `https://bbtm668.sharepoint.com/sites/QHSE/${sourceKey}.pdf`,
          notes: `/sites/QHSE/${sourceKey}.pdf`,
          sharepoint_item_id: '1400',
        }),
      );
    }
  });

  it('maps Documents Projets library items to project document upserts', () => {
    const batch = buildSharePointUpsertBatch('library-documents-projets', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P-2026-014/rapport.pdf',
        fields: {
          ID: 990,
          UniqueId: 'project-document-990',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'P-2026-014 Rapport campagne.pdf',
          FileRef: '/sites/QHSE/Documents Projets/P-2026-014/rapport.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P-2026-014/rapport.pdf',
          ProjetId: 880,
          Projet: { LookupValue: 'Campagne Atlantique 2026' },
          NumeroProjet: 'P-2026-014',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-documents-projets',
      targetTable: 'project_documents',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          project_id: null,
          project_sharepoint_item_id: '880',
          project_code: 'P-2026-014',
          project_title: 'Campagne Atlantique 2026',
          category_key: 'project_document',
          title: 'P-2026-014 Rapport campagne.pdf',
          source_label: 'sharepoint',
          source_sharepoint_id: '990',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P-2026-014/rapport.pdf',
          notes: '/sites/QHSE/Documents Projets/P-2026-014/rapport.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'Documents Projets',
          sharepoint_item_id: '990',
          sharepoint_unique_id: 'project-document-990',
          sharepoint_file_ref: '/sites/QHSE/Documents Projets/P-2026-014/rapport.pdf',
          sharepoint_encoded_abs_url:
            'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P-2026-014/rapport.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps Documents Contractuels library items to contract document upserts', () => {
    const batch = buildSharePointUpsertBatch('library-documents-contractuels', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/P-2026-014/contrat.pdf',
        fields: {
          ID: 991,
          UniqueId: 'contract-document-991',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'P-2026-014 Contrat signe.pdf',
          FileRef: '/sites/QHSE/Documents Contractuels/P-2026-014/contrat.pdf',
          EncodedAbsUrl:
            'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/P-2026-014/contrat.pdf',
          ProjetId: 880,
          Projet: { LookupValue: 'Campagne Atlantique 2026' },
          NumeroProjet: 'P-2026-014',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-documents-contractuels',
      targetTable: 'contract_documents',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          project_id: null,
          project_sharepoint_item_id: '880',
          project_code: 'P-2026-014',
          project_title: 'Campagne Atlantique 2026',
          category_key: 'contract_document',
          title: 'P-2026-014 Contrat signe.pdf',
          source_label: 'sharepoint',
          source_sharepoint_id: '991',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/P-2026-014/contrat.pdf',
          notes: '/sites/QHSE/Documents Contractuels/P-2026-014/contrat.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: null,
          sharepoint_list_title: 'Documents Contractuels',
          sharepoint_item_id: '991',
          sharepoint_unique_id: 'contract-document-991',
          sharepoint_file_ref: '/sites/QHSE/Documents Contractuels/P-2026-014/contrat.pdf',
          sharepoint_encoded_abs_url:
            'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/P-2026-014/contrat.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps Brevets et Visites Medicales library items to HR document upserts', () => {
    const batch = buildSharePointUpsertBatch('library-brevets-visites-medicales', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Brevets/visite.pdf',
        fields: {
          ID: 555,
          UniqueId: 'document-555',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'Visite medicale Julien LECOCQ.pdf',
          FileRef: '/sites/QHSE/Brevets et Visites Medicales/Julien/visite.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Brevets/visite.pdf',
          CollaborateurId: 42,
          Collaborateur: { LookupValue: 'Julien LECOCQ' },
          DateEch_x00e9_ance: '2020-01-15T00:00:00Z',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-brevets-visites-medicales',
      targetTable: 'hr_documents',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          person_id: null,
          person_sharepoint_item_id: '42',
          person_name: 'Julien LECOCQ',
          category_key: 'medical_visit',
          title: 'Visite medicale Julien LECOCQ.pdf',
          status: 'expired',
          issued_on: null,
          expires_on: '2020-01-15',
          requires_captain_validation: true,
          source_label: 'sharepoint',
          source_sharepoint_id: '555',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Brevets/visite.pdf',
          notes: '/sites/QHSE/Brevets et Visites Medicales/Julien/visite.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: 'c5382a31-dba6-42f7-9b13-b648d7e3106b',
          sharepoint_list_title: 'Brevets et Visites Medicales',
          sharepoint_item_id: '555',
          sharepoint_unique_id: 'document-555',
          sharepoint_file_ref: '/sites/QHSE/Brevets et Visites Medicales/Julien/visite.pdf',
          sharepoint_encoded_abs_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Brevets/visite.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps Certificats Flotte BBTM library items to fleet certificate upserts', () => {
    const batch = buildSharePointUpsertBatch('library-certificats-flotte', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Certificats/cotentin-navigation.pdf',
        fields: {
          ID: 901,
          UniqueId: 'fleet-certificate-901',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'Permis de navigation COTENTIN.pdf',
          FileRef: '/sites/QHSE/Certificats Flotte BBTM/COTENTIN/permis-navigation.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Certificats/cotentin-navigation.pdf',
          NavireId: 12,
          Navire: { LookupValue: 'COTENTIN' },
          DateEch_x00e9_ance: '2027-04-20T00:00:00Z',
          DateDelivrance: '2022-04-20T00:00:00Z',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-certificats-flotte',
      targetTable: 'fleet_certificates',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          vessel_id: null,
          vessel_sharepoint_item_id: '12',
          vessel_name: 'COTENTIN',
          category_key: 'navigation',
          title: 'Permis de navigation COTENTIN.pdf',
          status: 'valid',
          issued_on: '2022-04-20',
          expires_on: '2027-04-20',
          source_label: 'sharepoint',
          source_sharepoint_id: '901',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Certificats/cotentin-navigation.pdf',
          notes: '/sites/QHSE/Certificats Flotte BBTM/COTENTIN/permis-navigation.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: 'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
          sharepoint_list_title: 'Certificats Flotte BBTM',
          sharepoint_item_id: '901',
          sharepoint_unique_id: 'fleet-certificate-901',
          sharepoint_file_ref: '/sites/QHSE/Certificats Flotte BBTM/COTENTIN/permis-navigation.pdf',
          sharepoint_encoded_abs_url:
            'https://bbtm668.sharepoint.com/sites/QHSE/Certificats/cotentin-navigation.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps QSMS library items to procedure upserts', () => {
    const batch = buildSharePointUpsertBatch('library-qsms', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS/QSMS-PRO-001.docx',
        fields: {
          ID: 300,
          UniqueId: 'procedure-300',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'QSMS-PRO-001 Gestion des non-conformites.docx',
          FileRef: '/sites/QHSE/QSMS/Procedures/QSMS-PRO-001 Gestion des non-conformites.docx',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS/QSMS-PRO-001.docx',
          Code: 'QSMS-PRO-001',
          Revision: '5',
          Statut: 'Approuve',
          DatePublication: '2026-01-10T00:00:00Z',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-qsms',
      targetTable: 'procedures',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          procedure_code: 'QSMS-PRO-001',
          title: 'QSMS-PRO-001 Gestion des non-conformites.docx',
          status: 'approved',
          revision_label: '5',
          published_on: '2026-01-10',
          source_label: 'sharepoint',
          source_sharepoint_id: '300',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS/QSMS-PRO-001.docx',
          notes: '/sites/QHSE/QSMS/Procedures/QSMS-PRO-001 Gestion des non-conformites.docx',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: '958cf50b-779a-4002-811c-0ed8bb41f7b5',
          sharepoint_list_title: 'QSMS',
          sharepoint_item_id: '300',
          sharepoint_unique_id: 'procedure-300',
          sharepoint_file_ref: '/sites/QHSE/QSMS/Procedures/QSMS-PRO-001 Gestion des non-conformites.docx',
          sharepoint_encoded_abs_url: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS/QSMS-PRO-001.docx',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });

  it('maps QSMS PDF library items to published procedure upserts', () => {
    const batch = buildSharePointUpsertBatch('library-qsms-pdf', [
      {
        webUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS%20%20PDF/QSMS-PRO-001.pdf',
        fields: {
          ID: 301,
          UniqueId: 'published-procedure-301',
          Modified: '2026-06-30T08:15:00Z',
          FileLeafRef: 'QSMS-PRO-001 Gestion des non-conformites.pdf',
          FileRef: '/sites/QHSE/QSMS  PDF/Procedures/QSMS-PRO-001 Gestion des non-conformites.pdf',
          EncodedAbsUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS%20%20PDF/QSMS-PRO-001.pdf',
          ProcedureId: 300,
          Code: 'QSMS-PRO-001',
          Revision: '5',
          Statut: 'Publie',
          DatePublication: '2026-01-10T00:00:00Z',
        },
      },
    ]);

    expect(batch).toEqual({
      sourceKey: 'library-qsms-pdf',
      targetTable: 'published_procedures',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          procedure_id: null,
          procedure_sharepoint_item_id: '300',
          procedure_code: 'QSMS-PRO-001',
          title: 'QSMS-PRO-001 Gestion des non-conformites.pdf',
          status: 'approved',
          revision_label: '5',
          published_on: '2026-01-10',
          source_label: 'sharepoint',
          source_sharepoint_id: '301',
          file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS%20%20PDF/QSMS-PRO-001.pdf',
          notes: '/sites/QHSE/QSMS  PDF/Procedures/QSMS-PRO-001 Gestion des non-conformites.pdf',
          sharepoint_site_url: 'https://bbtm668.sharepoint.com/sites/QHSE',
          sharepoint_list_id: '1a9cd5f9-77a6-45fc-8705-d35005729774',
          sharepoint_list_title: 'QSMS - PDF',
          sharepoint_item_id: '301',
          sharepoint_unique_id: 'published-procedure-301',
          sharepoint_file_ref: '/sites/QHSE/QSMS  PDF/Procedures/QSMS-PRO-001 Gestion des non-conformites.pdf',
          sharepoint_encoded_abs_url: 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS%20%20PDF/QSMS-PRO-001.pdf',
          source_modified_at: '2026-06-30T08:15:00Z',
        },
      ],
    });
  });


  it('rejects unsupported source keys before producing upserts', () => {
    expect(() => buildSharePointUpsertBatch('list-kpi-definitions', [])).toThrow(
      'SharePoint source list-kpi-definitions is not mapped to an import payload yet.',
    );
  });

  it('upserts a mapped batch into the target Supabase table with SharePoint conflict keys', async () => {
    const batch = buildSharePointUpsertBatch('list-bbtm-flotte', [
      {
        fields: {
          ID: 12,
          Title: 'COTENTIN',
          Acronyme: 'CTN',
        },
      },
    ]);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });

    await expect(upsertSharePointBatch({ from } as never, batch)).resolves.toEqual({
      sourceKey: 'list-bbtm-flotte',
      targetTable: 'vessels',
      rowCount: 1,
    });
    expect(from).toHaveBeenCalledWith('vessels');
    expect(upsert).toHaveBeenCalledWith(batch.rows, {
      onConflict: 'sharepoint_list_id,sharepoint_item_id',
    });
  });

  it('skips empty batches and upserts non-empty batches in priority order', async () => {
    const batches = [
      buildSharePointUpsertBatch('list-bbtm-flotte', []),
      buildSharePointUpsertBatch('list-rh-personnel-bbtm', [
        {
          fields: {
            ID: 42,
            Title: 'LECOCQ',
            Pr_x00e9_nom: 'Julien',
          },
        },
      ]),
    ];
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });

    await expect(upsertSharePointBatches({ from } as never, batches)).resolves.toEqual([
      { sourceKey: 'list-bbtm-flotte', targetTable: 'vessels', rowCount: 0 },
      { sourceKey: 'list-rh-personnel-bbtm', targetTable: 'people', rowCount: 1 },
    ]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('people');
  });

  it('builds import batches from an exported SharePoint bundle', () => {
    const batches = buildSharePointImportBatchesFromExport({
      exportedAt: '2026-07-01T21:30:00Z',
      sources: [
        {
          sourceKey: 'list-smtr-journees-planning',
          items: [
            {
              fields: {
                ID: 77,
                NomMarin: 'Paul DURAND',
                DateTravail: '2026-07-01T00:00:00Z',
              },
            },
          ],
        },
        {
          sourceKey: 'list-rh-personnel-bbtm',
          items: [
            {
              fields: {
                ID: 42,
                Title: 'LECOCQ',
                Pr_x00e9_nom: 'Julien',
              },
            },
          ],
        },
      ],
    });

    expect(batches.map((batch) => [batch.sourceKey, batch.targetTable, batch.rows.length])).toEqual([
      ['list-rh-personnel-bbtm', 'people', 1],
      ['list-smtr-journees-planning', 'planning_days', 1],
    ]);
  });

  it('imports an exported SharePoint bundle and returns a summary report', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });

    await expect(
      importSharePointExportBundle(
        { from } as never,
        {
          exportedAt: '2026-07-01T21:30:00Z',
          sources: [
            {
              sourceKey: 'list-bbtm-flotte',
              items: [],
            },
            {
              sourceKey: 'list-rh-personnel-bbtm',
              items: [
                {
                  fields: {
                    ID: 42,
                    Title: 'LECOCQ',
                    Pr_x00e9_nom: 'Julien',
                  },
                },
              ],
            },
          ],
        },
      ),
    ).resolves.toEqual({
      totalSources: 2,
      totalRows: 1,
      results: [
        { sourceKey: 'list-bbtm-flotte', targetTable: 'vessels', rowCount: 0 },
        { sourceKey: 'list-rh-personnel-bbtm', targetTable: 'people', rowCount: 1 },
      ],
    });
  });

  it('builds a report from upsert results', () => {
    expect(
      buildSharePointImportReport([
        { sourceKey: 'list-bbtm-flotte', targetTable: 'vessels', rowCount: 4 },
        { sourceKey: 'list-rh-personnel-bbtm', targetTable: 'people', rowCount: 23 },
      ]),
    ).toEqual({
      totalSources: 2,
      totalRows: 27,
      results: [
        { sourceKey: 'list-bbtm-flotte', targetTable: 'vessels', rowCount: 4 },
        { sourceKey: 'list-rh-personnel-bbtm', targetTable: 'people', rowCount: 23 },
      ],
    });
  });

  it('resolves imported planning rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'planning_days',
          resolved_people: 12,
          resolved_vessels: 8,
        },
        {
          target_table: 'planning_periods',
          resolved_people: 5,
          resolved_vessels: 4,
        },
        {
          target_table: 'planning_projects',
          resolved_people: 0,
          resolved_vessels: 3,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointPlanningLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'planning_days',
        resolvedPeople: 12,
        resolvedVessels: 8,
      },
      {
        targetTable: 'planning_periods',
        resolvedPeople: 5,
        resolvedVessels: 4,
      },
      {
        targetTable: 'planning_projects',
        resolvedPeople: 0,
        resolvedVessels: 3,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_planning_links');
  });

  it('resolves imported project rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'projects',
          resolved_clients: 4,
          resolved_vessels: 6,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointProjectLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'projects',
        resolvedClients: 4,
        resolvedVessels: 6,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_project_links');
  });

  it('resolves imported project document rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'project_documents',
          resolved_documents: 5,
        },
        {
          target_table: 'contract_documents',
          resolved_documents: 2,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointProjectDocumentLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'project_documents',
        resolvedDocuments: 5,
      },
      {
        targetTable: 'contract_documents',
        resolvedDocuments: 2,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_project_document_links');
  });

  it('resolves imported DPR rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'dpr_items',
          resolved_projects: 4,
          resolved_vessels: 3,
          resolved_dpr_items: 0,
        },
        {
          target_table: 'dpr_archives',
          resolved_projects: 2,
          resolved_vessels: 0,
          resolved_dpr_items: 2,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointDprLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'dpr_items',
        resolvedProjects: 4,
        resolvedVessels: 3,
        resolvedDprItems: 0,
      },
      {
        targetTable: 'dpr_archives',
        resolvedProjects: 2,
        resolvedVessels: 0,
        resolvedDprItems: 2,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_dpr_links');
  });

  it('resolves imported operation rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'purchase_requests',
          resolved_projects: 2,
          resolved_vessels: 0,
          resolved_actions: 0,
        },
        {
          target_table: 'action_items',
          resolved_projects: 1,
          resolved_vessels: 1,
          resolved_actions: 0,
        },
        {
          target_table: 'action_documents',
          resolved_projects: 0,
          resolved_vessels: 0,
          resolved_actions: 3,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointOperationLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'purchase_requests',
        resolvedProjects: 2,
        resolvedVessels: 0,
        resolvedActions: 0,
      },
      {
        targetTable: 'action_items',
        resolvedProjects: 1,
        resolvedVessels: 1,
        resolvedActions: 0,
      },
      {
        targetTable: 'action_documents',
        resolvedProjects: 0,
        resolvedVessels: 0,
        resolvedActions: 3,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_operation_links');
  });

  it('resolves imported document rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'technical_documents',
          resolved_people: 1,
          resolved_vessels: 2,
        },
        {
          target_table: 'work_time_documents',
          resolved_people: 3,
          resolved_vessels: 0,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointDocumentLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'technical_documents',
        resolvedPeople: 1,
        resolvedVessels: 2,
      },
      {
        targetTable: 'work_time_documents',
        resolvedPeople: 3,
        resolvedVessels: 0,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_document_links');
  });

  it('resolves imported HR document rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'hr_documents',
          resolved_documents: 17,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointHrDocumentLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'hr_documents',
        resolvedDocuments: 17,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_hr_document_links');
  });

  it('resolves imported fleet certificate rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'fleet_certificates',
          resolved_certificates: 9,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointFleetCertificateLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'fleet_certificates',
        resolvedCertificates: 9,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_fleet_certificate_links');
  });

  it('resolves imported published procedure rows through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'published_procedures',
          resolved_publications: 6,
        },
      ],
      error: null,
    });

    await expect(resolveSharePointPublishedProcedureLinks({ rpc } as never)).resolves.toEqual([
      {
        targetTable: 'published_procedures',
        resolvedPublications: 6,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_published_procedure_links');
  });
});
