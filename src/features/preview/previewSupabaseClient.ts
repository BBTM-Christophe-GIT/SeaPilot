import type { SupabaseClient } from '@supabase/supabase-js';

const PREVIEW_WRITE_ERROR = {
  message: 'Les données de cette préversion sont démonstratives et ne peuvent pas être enregistrées.',
};

type PreviewResult = { data: unknown[] | null; error: typeof PREVIEW_WRITE_ERROR | null };

const PREVIEW_STCW_SHORT_FILE_NAMES: Partial<Record<number, string>> = {
  15: 'CRO',
  16: 'CGO',
  25: 'CFBS',
  26: 'CSS',
  27: 'ASN',
  28: 'CAEERS',
  29: 'CQALI',
  30: 'EM I',
  31: 'EM II',
  32: 'EM III',
  33: 'ECDIS',
  37: 'Visite Médicale',
  55: 'Induction THOMSEA',
};

const PREVIEW_STCW_SOURCE_ROWS: Array<[number, string, string, string[], boolean]> = [
  [1, 'Capitaine polyvalent', 'Pont', ['II/2'], true],
  [2, 'Second Capitaine', 'Pont', ['II/2', 'III/2'], true],
  [3, 'Capitaine 200', 'Pont', ['II/3'], true],
  [4, 'Capitaine', 'Pont', ['II/2', 'III/2'], true],
  [5, 'Capitaine 3000', 'Pont', ['II/2'], true],
  [6, 'Capitaine 500', 'Pont', ['II/3'], true],
  [7, 'Chef Mécanicien', 'Machine', ['III/2'], true],
  [8, 'Chef Mécanicien 8000 kW', 'Machine', ['III/2'], true],
  [9, 'Chef Mécanicien 3000 kW', 'Machine', ['III/3'], true],
  [10, 'Chef Mécanicien 3000 kW limité à 200 milles des côtes', 'Machine', [], true],
  [11, 'Chef de Quart Machine', 'Machine', ['III/1'], true],
  [12, 'Officier Electrotechnicien', 'Machine', ['III/6'], true],
  [13, 'Mécanicien 750 kW', 'Machine', [], true],
  [14, 'Mécanicien 250 kW', 'Machine', [], true],
  [15, "CRO - Certificat Restreint d'Opérateur", 'Formation de Sécurité', ['IV'], true],
  [16, "CGO - Certificat Général d'Opérateur", 'Formation de Sécurité', ['IV'], true],
  [17, 'Matelot Pont', 'Pont', [], true],
  [18, 'Matelot de Quart Passerelle', 'Pont', ['II/4'], true],
  [19, 'Marin Qualifié Pont', 'Pont', ['II/5'], true],
  [20, 'Mécanicien', 'Machine', [], true],
  [21, 'Mécanicien de Quart Machine', 'Machine', ['III/4'], true],
  [22, 'Marin Qualifié Machine', 'Machine', ['III/5'], true],
  [23, 'Matelot Electrotechnicien', 'Machine', ['III/7'], true],
  [24, 'Sécurité', 'Formation de Sécurité', ['VI/1'], true],
  [25, 'CFBS - Certificat de Formation de Base à la Sécurité', 'Formation de Sécurité', [], true],
  [26, 'CSS - Certificat Sensibilisation Sûreté', 'Formation de Sécurité', ['VI/5'], true],
  [27, 'ASN - Agent de Sûreté du Navire', 'Formation de Sécurité', [], true],
  [28, "CAEERS - Certificat d'exploitation des embarcations et radeaux de sauvetage", 'Formation de Sécurité', ['VI/2§1'], true],
  [29, 'CQALI - Certificat de Qualification Avancée à la Lutte contre l’Incendie', 'Formation de Sécurité', ['VI/3'], true],
  [30, 'Enseignement Médical de niveau I', 'Formation de Sécurité', ['VI/4'], true],
  [31, 'Enseignement Médical de niveau II', 'Formation de Sécurité', ['VI/4'], true],
  [32, 'Enseignement Médical de niveau III', 'Formation de Sécurité', ['VI/4'], true],
  [33, 'ECDIS - Cartes électroniques', 'Formation de Sécurité', ['II/1', 'II/2', 'II/3'], true],
  [34, 'Chef de Quart 500', 'Pont', ['II/3'], true],
  [35, 'Mécanicien Quart Machine', 'Machine', [], true],
  [37, "Certificat Médical d'Aptitude à la Navigation Maritime", 'Visite Médicale', [], false],
  [38, 'Contrat', 'Ressources Humaines', [], false],
  [39, 'Informations Personnelles', 'Ressources Humaines', [], false],
  [40, "Contact d'Urgence", 'Ressources Humaines', [], false],
  [41, 'Coordonnées Bancaires', 'Ressources Humaines', [], false],
  [42, "Carte Nationale d'Identité", 'Ressources Humaines', [], false],
  [43, 'Permis de Conduire', 'Ressources Humaines', [], false],
  [44, 'Passeport', 'Ressources Humaines', [], false],
  [45, 'Arrêt de Travail', 'Ressources Humaines', [], false],
  [46, 'Arrêt Maladie', 'Ressources Humaines', [], false],
  [47, 'CACES', "Conduite d'Engin", [], true],
  [48, 'APAVE - Formation Conduite de Grue - LMG 130', 'Levage', [], true],
  [49, 'Autorisation de Conduite', "Conduite d'Engin", [], true],
  [50, 'Induction Grue', 'Levage', [], true],
  [51, 'APAVE - Vérificateur Appareils Accessoires de Levage', 'Levage', [], true],
  [52, 'LEMS - HSE Induction', 'Safety Induction', [], true],
  [53, 'Convocation Formation', 'Plan de Formation', [], false],
  [54, 'Formation', 'Plan de Formation', [], false],
  [55, 'BBTM - Induction THOMSEA', 'Safety Induction', [], true],
];

const PREVIEW_STCW_CERTIFICATES = PREVIEW_STCW_SOURCE_ROWS.map(
  ([sourceItemId, name, category, stcwRules, isCredential]) => ({
    id: sourceItemId,
    source_item_id: sourceItemId,
    name,
    category,
    file_name: PREVIEW_STCW_SHORT_FILE_NAMES[sourceItemId] || name,
    stcw_rules: stcwRules,
    is_credential: isCredential,
    active: true,
  }),
);

const PREVIEW_ROWS: Record<string, unknown[]> = {
  profiles: [{ id: 'preview-user', display_name: 'Administrateur Démonstration' }],
  people: [
    {
      id: 9301,
      user_id: null,
      first_name: 'Arthur',
      last_name: 'DEMO',
      email: 'arthur.demo@example.invalid',
      function_label: 'Capitaine',
      grade_label: 'Capitaine',
      role_label: 'Navigant',
      register_label: 'ENIM',
      sex: 'M',
      sailor_number: 'DEMO-001',
      m365_account: null,
      phone: '+33 0 00 00 00 00',
      postal_address: 'Adresse de demonstration',
      birth_date: '1988-04-12',
      birth_place: 'Brest',
      identity_document_number: 'DEMO-ID-001',
      identity_document_type: "Carte d'identite",
      contract_type: 'CDI',
      hired_on: '2021-02-15',
      departed_on: null,
      departure_reason: null,
      emergency_contact_name: 'Contact Demo',
      emergency_contact_relationship: 'Proche',
      emergency_contact_phone: '+33 0 00 00 00 01',
      emergency_contact_address: 'Adresse de demonstration',
      waist_size: null,
      chest_size: null,
      full_height_size: null,
      inseam_size: null,
      hip_size: null,
      weight_kg: null,
      shoe_size: null,
      coverall_size: null,
      pants_size: null,
      jacket_size: null,
      deck_certificate_label: 'Capitaine 500',
      engine_certificate_label: null,
      crane_training_on: null,
      crane_induction_on: null,
      active: true,
    },
  ],
  hr_documents: [
    {
      id: 9401,
      person_id: 9301,
      person_name: 'Arthur DEMO',
      person_sharepoint_item_id: null,
      category_key: 'deck',
      title: 'Arthur DEMO - Capitaine 500 - 2030.pdf',
      status: 'valid',
      issued_on: '2025-03-20',
      expires_on: '2030-03-20',
      requires_captain_validation: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/arthur-demo-capitaine-500.pdf',
      file_size_bytes: 245760,
      mime_type: 'application/pdf',
    },
    {
      id: 9402,
      person_id: 9301,
      person_name: 'Arthur DEMO',
      person_sharepoint_item_id: null,
      category_key: 'safety_training',
      title: 'Arthur DEMO - CFBS - 2029.pdf',
      status: 'valid',
      issued_on: '2024-01-17',
      expires_on: '2029-01-17',
      requires_captain_validation: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/arthur-demo-cfbs.pdf',
      file_size_bytes: 184320,
      mime_type: 'application/pdf',
    },
    {
      id: 9403,
      person_id: 9301,
      person_name: 'Arthur DEMO',
      person_sharepoint_item_id: null,
      category_key: 'safety_training',
      title: 'Arthur DEMO - CGO - 2030.pdf',
      status: 'valid',
      issued_on: '2025-04-17',
      expires_on: '2030-04-17',
      requires_captain_validation: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/arthur-demo-cgo.pdf',
      file_size_bytes: 163840,
      mime_type: 'application/pdf',
    },
    {
      id: 9404,
      person_id: 9301,
      person_name: 'Arthur DEMO',
      person_sharepoint_item_id: null,
      category_key: 'medical_visit',
      title: 'Arthur DEMO - Visite Medicale - 2027.pdf',
      status: 'valid',
      issued_on: '2025-11-08',
      expires_on: '2027-11-08',
      requires_captain_validation: false,
      medical_restriction: null,
      medical_bridge_watch: true,
      medical_unfit: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/arthur-demo-visite-medicale.pdf',
      file_size_bytes: 204800,
      mime_type: 'application/pdf',
    },
  ],
  hr_visibility_rules: [],
  projects: [
    {
      id: 9001,
      title: 'Campagne Atlantique — démonstration',
      project_code: 'P901',
      client_id: 9101,
      client_sharepoint_item_id: 'preview-client-1',
      client_name: 'Affréteur Démonstration',
      primary_vessel_id: 9201,
      primary_vessel_sharepoint_item_id: 'preview-vessel-1',
      primary_vessel_name: 'M/V Démonstration',
      secondary_vessel_id: null,
      secondary_vessel_sharepoint_item_id: null,
      secondary_vessel_name: null,
      starts_on: '2026-08-03',
      ends_on: '2026-08-21',
      delivery_at: '2026-08-03T08:00:00+02:00',
      redelivery_at: '2026-08-21T18:00:00+02:00',
      charter_starts_at: '2026-08-03T08:00:00+02:00',
      charter_ends_at: '2026-08-21T18:00:00+02:00',
      delivery_port: 'Brest',
      redelivery_port: 'Brest',
      contract_type: 'SUPPLYTIME 2017',
      operation_area: 'Atlantique Nord',
      is_rov_support: true,
      is_diving_support: false,
      status: 'Contrat signé',
      description: 'Données entièrement synthétiques pour la recette de préversion.',
      source_label: 'sharepoint',
      sharepoint_list_title: 'BBTM - Projets',
      sharepoint_item_id: 'preview-project-1',
      source_modified_at: '2026-07-15T10:00:00Z',
      archived_at: null,
      updated_at: '2026-07-15T10:00:00Z',
    },
    {
      id: 9002,
      title: 'Inspection côtière — démonstration',
      project_code: 'P902',
      client_id: 9102,
      client_sharepoint_item_id: null,
      client_name: 'Client SeaPilot Démonstration',
      primary_vessel_id: 9202,
      primary_vessel_sharepoint_item_id: null,
      primary_vessel_name: 'Support Démonstration',
      secondary_vessel_id: null,
      secondary_vessel_sharepoint_item_id: null,
      secondary_vessel_name: null,
      starts_on: '2026-09-07',
      ends_on: '2026-09-12',
      delivery_at: null,
      redelivery_at: null,
      charter_starts_at: null,
      charter_ends_at: null,
      delivery_port: 'Cherbourg',
      redelivery_port: 'Cherbourg',
      contract_type: 'Prestation',
      operation_area: 'Manche',
      is_rov_support: false,
      is_diving_support: true,
      status: 'Offre transmise',
      description: 'Projet synthétique créé dans SeaPilot pour tester les filtres.',
      source_label: 'seapilot',
      sharepoint_list_title: null,
      sharepoint_item_id: null,
      source_modified_at: null,
      archived_at: null,
      updated_at: '2026-07-15T11:00:00Z',
    },
  ],
  planning_projects: [
    {
      id: 9601,
      catalog_project_id: 9001,
      title: 'P901 - Campagne Atlantique — démonstration',
      starts_on: '2026-08-03',
      ends_on: '2026-08-08',
      description: 'Première rotation synthétique.',
      client_name: 'Affréteur Démonstration',
      primary_vessel_id: 9201,
      primary_vessel_name: 'M/V Démonstration',
      secondary_vessel_id: null,
      secondary_vessel_name: null,
      event_type: 'operation',
      responsible_name: null,
      status: 'Validé',
      charter_hire: 18000,
      hire_currency: 'EUR',
      hire_unit: 'jour',
      source_label: 'seapilot-projects',
      created_at: '2026-07-15T12:00:00Z',
    },
    {
      id: 9602,
      catalog_project_id: 9001,
      title: 'P901 - Campagne Atlantique — démonstration',
      starts_on: '2026-08-14',
      ends_on: '2026-08-21',
      description: 'Seconde rotation synthétique du même projet.',
      client_name: 'Affréteur Démonstration',
      primary_vessel_id: 9201,
      primary_vessel_name: 'M/V Démonstration',
      secondary_vessel_id: null,
      secondary_vessel_name: null,
      event_type: 'operation',
      responsible_name: null,
      status: 'A planifier',
      charter_hire: 19500,
      hire_currency: 'EUR',
      hire_unit: 'jour',
      source_label: 'seapilot-projects',
      created_at: '2026-07-15T12:05:00Z',
    },
    {
      id: 9603,
      catalog_project_id: 9002,
      title: 'P902 - Inspection côtière — démonstration',
      starts_on: '2026-09-07',
      ends_on: '2026-09-12',
      description: 'Occurrence synthétique.',
      client_name: 'Client SeaPilot Démonstration',
      primary_vessel_id: 9202,
      primary_vessel_name: 'Support Démonstration',
      secondary_vessel_id: null,
      secondary_vessel_name: null,
      event_type: 'operation',
      responsible_name: null,
      status: 'A planifier',
      charter_hire: null,
      hire_currency: null,
      hire_unit: null,
      source_label: 'seapilot-projects',
      created_at: '2026-07-15T12:10:00Z',
    },
  ],
  project_contracts: [
    {
      id: 9301,
      project_id: 9001,
      owner_identity: 'Armateur Démonstration',
      vessel_assignment_limit: 'Navire de remplacement soumis à accord',
      extension_count: 1,
      extension_duration: 5,
      extension_unit: 'jours',
      auto_extension_period: null,
      max_extension_days: 5,
      mobilisation_fee: 15000,
      demobilisation_fee: 12500,
      fee_currency: 'EUR',
      charter_hire: 18000,
      extension_hire: 18000,
      hire_currency: 'EUR',
      hire_unit: 'jour',
      max_audit_period: '30 jours',
      supplytime_schema_version: 'supplytime-2017-v1',
      supplytime_data: {
        box05_cancelling_date: '3 août 2026 à 12:00',
        box22_invoice_remittance: 'Facturation mensuelle — démonstration',
        box33_dispute_resolution: 'Droit français — démonstration',
      },
      source_label: 'sharepoint',
      sharepoint_list_title: 'BBTM - Projets',
      sharepoint_item_id: 'preview-project-1',
      source_modified_at: '2026-07-15T10:00:00Z',
      archived_at: null,
    },
  ],
  project_documents: [
    {
      id: 9401,
      project_id: 9001,
      project_sharepoint_item_id: 'preview-project-1',
      project_code: 'P901',
      project_title: 'Campagne Atlantique — démonstration',
      category_key: 'project_document',
      title: 'Plan de mobilisation — démonstration.pdf',
      source_label: 'sharepoint',
      source_sharepoint_id: 'preview-project-document-1',
      file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/Preview-Projet.pdf',
      notes: 'Référence synthétique de préversion ; aucun fichier n’est copié dans SeaPilot.',
      sharepoint_list_id: 'preview-project-library',
      sharepoint_list_title: 'Documents Projets',
      sharepoint_item_id: 'preview-project-document-1',
      sharepoint_drive_id: 'preview-project-drive',
      sharepoint_drive_item_id: 'preview-project-drive-item-1',
      file_name: 'Preview-Projet.pdf',
      folder_path: '/Documents Projets/Démonstration',
      mime_type: 'application/pdf',
      file_extension: 'pdf',
      file_size_bytes: 245760,
      source_modified_at: '2026-07-15T09:00:00Z',
      is_folder: false,
    },
  ],
  contract_documents: [
    {
      id: 9501,
      project_id: 9001,
      project_sharepoint_item_id: 'preview-project-1',
      project_code: 'P901',
      project_title: 'Campagne Atlantique — démonstration',
      category_key: 'contract_document',
      title: 'SUPPLYTIME signé — démonstration.pdf',
      source_label: 'sharepoint',
      source_sharepoint_id: 'preview-contract-document-1',
      file_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/Preview-Contrat.pdf',
      notes: 'Référence synthétique de préversion.',
      sharepoint_list_id: 'preview-contract-library',
      sharepoint_list_title: 'Documents Contractuels',
      sharepoint_item_id: 'preview-contract-document-1',
      sharepoint_drive_id: 'preview-contract-drive',
      sharepoint_drive_item_id: 'preview-contract-drive-item-1',
      file_name: 'Preview-Contrat.pdf',
      folder_path: '/Documents Contractuels/Démonstration',
      mime_type: 'application/pdf',
      file_extension: 'pdf',
      file_size_bytes: 368640,
      source_modified_at: '2026-07-15T09:30:00Z',
      is_folder: false,
    },
  ],
  clients: [
    {
      id: 9101,
      name: 'Affréteur Démonstration',
      code: 'DEMO-SP',
      email: '',
      phone: '',
      address: '',
      city: 'Brest',
      country: 'France',
      active: true,
      source_label: 'sharepoint',
      sharepoint_list_title: 'BBTM - Clients',
      sharepoint_item_id: 'preview-client-1',
      source_modified_at: '2026-07-15T08:00:00Z',
      archived_at: null,
      updated_at: '2026-07-15T08:00:00Z',
    },
    {
      id: 9102,
      name: 'Client SeaPilot Démonstration',
      code: 'DEMO-SPT',
      email: '',
      phone: '',
      address: '',
      city: 'Cherbourg',
      country: 'France',
      active: true,
      source_label: 'seapilot',
      sharepoint_list_title: null,
      sharepoint_item_id: null,
      source_modified_at: null,
      archived_at: null,
      updated_at: '2026-07-15T11:00:00Z',
    },
  ],
  vessels: [
    { id: 9201, name: 'M/V Démonstration', acronym: 'MVD', active: true, fleet_exit_on: null, sharepoint_item_id: 'preview-vessel-1' },
    { id: 9202, name: 'Support Démonstration', acronym: 'SD', active: true, fleet_exit_on: null, sharepoint_item_id: 'preview-vessel-2' },
  ],
  dpr_reports: [
    {
      id: 9908, dpr_number: 1062, status: 'validated', report_date: '2026-08-01',
      project_id: 9002, unlisted_project_name: null, vessel_id: 9202,
      issuer_name_snapshot: 'Arthur DEMO', description: 'Inspection sous-marine et relevÃ©s cÃ´tiers.',
      qhse_note: 'RAS', created_by: 'preview-user', updated_at: '2026-08-01T18:00:00Z', deleted_at: null,
    },
    {
      id: 9907, dpr_number: 1061, status: 'submitted', report_date: '2026-08-01',
      project_id: 9001, unlisted_project_name: null, vessel_id: 9201,
      issuer_name_snapshot: 'Arthur DEMO', description: 'Mobilisation et essais des Ã©quipements.',
      qhse_note: 'Point de vigilance lors du levage.', created_by: 'preview-user', updated_at: '2026-08-01T17:30:00Z', deleted_at: null,
    },
    {
      id: 9906, dpr_number: 1060, status: 'draft', report_date: '2026-07-31',
      project_id: 9001, unlisted_project_name: null, vessel_id: 9201,
      issuer_name_snapshot: 'Arthur DEMO', description: 'PrÃ©paration du pont et contrÃ´les avant appareillage.',
      qhse_note: 'RAS', created_by: 'preview-user', updated_at: '2026-07-31T16:00:00Z', deleted_at: null,
    },
    {
      id: 9905, dpr_number: 1059, status: 'validated', report_date: '2026-07-30',
      project_id: 9002, unlisted_project_name: null, vessel_id: 9202,
      issuer_name_snapshot: 'Arthur DEMO', description: 'Transit vers la zone dâ€™inspection.',
      qhse_note: 'RAS', created_by: 'preview-user', updated_at: '2026-07-30T18:00:00Z', deleted_at: null,
    },
    {
      id: 9904, dpr_number: 1058, status: 'validated', report_date: '2026-07-29',
      project_id: 9001, unlisted_project_name: null, vessel_id: 9201,
      issuer_name_snapshot: 'Arthur DEMO', description: 'OpÃ©rations de positionnement et mesures.',
      qhse_note: 'RAS', created_by: 'preview-user', updated_at: '2026-07-29T18:00:00Z', deleted_at: null,
    },
    {
      id: 9903, dpr_number: 1057, status: 'submitted', report_date: '2026-07-28',
      project_id: 9001, unlisted_project_name: null, vessel_id: 9201,
      issuer_name_snapshot: 'Arthur DEMO', description: 'Maintenance prÃ©ventive et attente mÃ©tÃ©o.',
      qhse_note: 'Brief sÃ©curitÃ© rÃ©alisÃ©.', created_by: 'preview-user', updated_at: '2026-07-28T18:00:00Z', deleted_at: null,
    },
    {
      id: 9901, dpr_number: 1056, status: 'validated', report_date: '2026-07-21',
      project_id: 9001, unlisted_project_name: null, vessel_id: 9201,
      issuer_name_snapshot: 'Arthur DEMO', description: 'Transit et opérations de démonstration.',
      qhse_note: 'RAS', created_by: 'preview-user', updated_at: '2026-07-21T18:00:00Z', deleted_at: null,
    },
    {
      id: 9902, dpr_number: 1055, status: 'submitted', report_date: '2026-07-20',
      project_id: 9001, unlisted_project_name: null, vessel_id: 9201,
      issuer_name_snapshot: 'Arthur DEMO', description: 'Maintenance et attente météo.',
      qhse_note: 'Brief sécurité réalisé.', created_by: 'preview-user', updated_at: '2026-07-20T18:00:00Z', deleted_at: null,
    },
  ],
  project_generated_documents: [
    {
      id: 9451,
      project_id: 9001,
      planning_occurrence_id: 9601,
      document_type: 'operation_attachment',
      file_name: 'Ordre-de-mission-rotation-1.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 184320,
      sharepoint_web_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/Preview-Operation-1.pdf',
      created_at: '2026-07-16T09:00:00Z',
    },
    {
      id: 9452,
      project_id: 9001,
      planning_occurrence_id: 9602,
      document_type: 'operation_attachment',
      file_name: 'Instructions-portuaires.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_size_bytes: 96256,
      sharepoint_web_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/Preview-Operation-2.docx',
      created_at: '2026-07-17T14:30:00Z',
    },
  ],
  dpr_daily_metrics: [
    { dpr_id: 9908, fuel_consumed_liters: 420, fuel_on_board_liters: 6400 },
    { dpr_id: 9907, fuel_consumed_liters: 780, fuel_on_board_liters: 7050 },
    { dpr_id: 9906, fuel_consumed_liters: 510, fuel_on_board_liters: 7730 },
    { dpr_id: 9905, fuel_consumed_liters: 390, fuel_on_board_liters: 6790 },
    { dpr_id: 9904, fuel_consumed_liters: 610, fuel_on_board_liters: 8240 },
    { dpr_id: 9903, fuel_consumed_liters: 540, fuel_on_board_liters: 8850 },
    { dpr_id: 9901, fuel_consumed_liters: 650, fuel_on_board_liters: 8200 },
    { dpr_id: 9902, fuel_consumed_liters: 800, fuel_on_board_liters: 7550 },
  ],
  dpr_files: [],
  emergency_exercise_types: [
    { key: 'fire-protection', label: "Protection contre l'incendie", display_order: 10, active: true },
    { key: 'abandon-ship', label: 'Évacuation et abandon du navire', display_order: 20, active: true },
    { key: 'sea-rescue', label: 'Sauvetage en mer', display_order: 30, active: true },
  ],
  port_call_reason_types: [
    { key: 'crew-change', label: 'Crew Change', display_order: 10, active: true },
    { key: 'weather-standby', label: 'Stand-by météo', display_order: 20, active: true },
    { key: 'breakdown', label: 'Avarie', display_order: 30, active: true },
    { key: 'standby', label: 'Stand-by', display_order: 40, active: true },
  ],
  dpr_crew_members: [], dpr_other_people: [],
  dpr_incidents: [
    { id: 9981, dpr_id: 9907, level: 'T1', title: 'Quasi-accident lors du levage', description: 'Zone balisÃ©e et briefing repris.' },
  ],
  dpr_hse_actions: [],
  dpr_emergency_exercises: [], dpr_port_calls: [], dpr_supplies: [], dpr_waste_records: [],
  planning_rotation_series: [],
  planning_rotation_occurrences: [],
  planning_templates: [],
  planning_manning_matrices: [],
  planning_manning_requirements: [],
  project_billing_periods: [],
  project_billing_services: [],
  project_chargeable_expenses: [],
  project_billing_documents: [],
  stcw_certificates: PREVIEW_STCW_CERTIFICATES,
};

function createPreviewQuery(result: PreviewResult): object {
  const query: object = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: PreviewResult) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }

      return () => query;
    },
  });

  return query;
}

function previewRows(table: string): Array<Record<string, unknown>> {
  return (PREVIEW_ROWS[table] || []) as Array<Record<string, unknown>>;
}

function nextPreviewId(table: string, fallback: number): number {
  return Math.max(fallback, ...previewRows(table).map((row) => Number(row.id) || 0)) + 1;
}

function previewVessel(vesselId: number): { id: number; name: string } {
  const stored = previewRows('vessels').find((row) => Number(row.id) === vesselId);
  if (stored) return { id: vesselId, name: String(stored.name || `Navire ${vesselId}`) };
  if (vesselId === 1) return { id: 1, name: 'GOURY' };
  return { id: vesselId, name: `Navire ${vesselId}` };
}

function schedulePreviewProject(args: Record<string, unknown>): PreviewResult {
  const project = previewRows('projects').find((row) => Number(row.id) === Number(args.target_project_id));
  if (!project) return { data: null, error: { message: 'Projet de démonstration introuvable.' } };
  const vessel = previewVessel(Number(args.target_primary_vessel_id));
  const startsOn = String(args.target_starts_on || '');
  const row = {
    id: nextPreviewId('planning_projects', 9602),
    catalog_project_id: Number(project.id),
    title: `${String(project.project_code || 'Projet')} - ${String(project.title || '')}`,
    starts_on: startsOn,
    ends_on: String(args.target_ends_on || startsOn),
    description: String(args.target_description || project.description || ''),
    client_name: String(project.client_name || ''),
    primary_vessel_id: vessel.id,
    primary_vessel_name: vessel.name,
    secondary_vessel_id: null,
    secondary_vessel_name: null,
    event_type: 'operation',
    responsible_name: null,
    status: String(args.target_status || 'A planifier'),
    charter_hire: args.target_charter_hire == null ? null : Number(args.target_charter_hire),
    hire_currency: String(args.target_hire_currency || '') || null,
    hire_unit: String(args.target_hire_unit || '') || null,
    source_label: 'seapilot-planning-preview',
    created_at: new Date().toISOString(),
  };
  PREVIEW_ROWS.planning_projects.push(row);
  return { data: [row], error: null };
}

function deletePreviewProjectOperation(args: Record<string, unknown>): PreviewResult {
  const occurrenceId = Number(args.target_occurrence_id);
  const projectId = Number(args.target_project_id);
  const occurrenceIndex = previewRows('planning_projects').findIndex(
    (row) => Number(row.id) === occurrenceId && Number(row.catalog_project_id) === projectId,
  );
  if (occurrenceIndex < 0) {
    return { data: null, error: { message: 'Opération de démonstration introuvable.' } };
  }

  PREVIEW_ROWS.planning_projects.splice(occurrenceIndex, 1);
  previewRows('project_generated_documents').forEach((document) => {
    if (Number(document.planning_occurrence_id) === occurrenceId) {
      document.planning_occurrence_id = null;
    }
  });
  return { data: [occurrenceId], error: null };
}

function previewRpc(functionName: string, args: Record<string, unknown> = {}): object {
  if (functionName === 'planning_project_catalog') {
    return createPreviewQuery({
      data: previewRows('projects').map((project) => ({
        id: project.id,
        project_code: project.project_code,
        title: project.title,
        client_name: project.client_name,
        status: project.status,
        description: project.description,
        starts_on: project.starts_on,
        ends_on: project.ends_on,
      })),
      error: null,
    });
  }
  if (functionName === 'planning_project_clients') {
    return createPreviewQuery({
      data: previewRows('clients').map((client) => ({ id: client.id, name: client.name, active: client.active })),
      error: null,
    });
  }
  if (functionName === 'planning_schedule_catalog_project') {
    return createPreviewQuery(schedulePreviewProject(args));
  }
  if (functionName === 'planning_create_and_schedule_project') {
    const vessel = previewVessel(Number(args.target_primary_vessel_id));
    const client = previewRows('clients').find((row) => Number(row.id) === Number(args.target_client_id));
    const projectId = nextPreviewId('projects', 9002);
    const project = {
      id: projectId,
      project_code: `P${projectId - 8100}`,
      title: String(args.target_title || ''),
      client_id: client?.id || null,
      client_name: String(client?.name || ''),
      primary_vessel_id: vessel.id,
      primary_vessel_name: vessel.name,
      starts_on: String(args.target_starts_on || ''),
      ends_on: String(args.target_starts_on || ''),
      status: String(args.target_status || 'A planifier'),
      description: String(args.target_description || ''),
      source_label: 'seapilot-planning-preview',
      archived_at: null,
      updated_at: new Date().toISOString(),
    };
    PREVIEW_ROWS.projects.push(project);
    return createPreviewQuery(schedulePreviewProject({
      ...args,
      target_project_id: projectId,
      target_ends_on: args.target_starts_on,
    }));
  }
  if (functionName === 'planning_create_project_client') {
    const client = {
      id: nextPreviewId('clients', 9102),
      name: String(args.target_name || ''),
      code: String(args.target_code || ''),
      email: String(args.target_email || ''),
      phone: String(args.target_phone || ''),
      city: String(args.target_city || ''),
      country: String(args.target_country || ''),
      active: true,
      source_label: 'seapilot-planning-preview',
      archived_at: null,
      updated_at: new Date().toISOString(),
    };
    PREVIEW_ROWS.clients.push(client);
    return createPreviewQuery({ data: [client], error: null });
  }
  if (functionName === 'projects_delete_planning_occurrence') {
    return createPreviewQuery(deletePreviewProjectOperation(args));
  }
  return createPreviewQuery({ data: null, error: PREVIEW_WRITE_ERROR });
}

export const previewSupabaseClient = {
  from: (table: string) => table in PREVIEW_ROWS
    ? createPreviewQuery({ data: PREVIEW_ROWS[table], error: null })
    : createPreviewQuery({ data: null, error: PREVIEW_WRITE_ERROR }),
  rpc: (functionName: string, args?: Record<string, unknown>) => previewRpc(functionName, args),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'preview-user', email: 'preview@seapilot.local' } }, error: null }),
  },
} as unknown as SupabaseClient;
