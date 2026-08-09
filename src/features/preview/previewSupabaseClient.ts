import type { SupabaseClient } from '@supabase/supabase-js';

const PREVIEW_WRITE_ERROR = {
  message: 'Les données de cette préversion sont démonstratives et ne peuvent pas être enregistrées.',
};

const PREVIEW_SIGNATURE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function previewSignaturePng(): Blob {
  const bytes = Uint8Array.from(atob(PREVIEW_SIGNATURE_PNG_BASE64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

type PreviewResult = { data: unknown; error: typeof PREVIEW_WRITE_ERROR | null };

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
      user_id: 'preview-user',
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
    { id: 9302, user_id: null, first_name: 'Camille', last_name: 'DURAND', function_label: 'Direction', grade_label: '', role_label: 'Sédentaire', hired_on: '2020-01-01', departed_on: null, active: true },
    { id: 9303, user_id: null, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', grade_label: 'Chef mécanicien', role_label: 'Navigant', hired_on: '2022-05-01', departed_on: null, active: true },
    { id: 9304, user_id: null, first_name: 'Hugo', last_name: 'BERNARD', function_label: 'Matelot', grade_label: 'Matelot', role_label: 'Navigant', hired_on: '2024-03-01', departed_on: null, active: true },
    { id: 9399, user_id: null, first_name: 'Ancien', last_name: 'MARIN', function_label: 'Matelot', grade_label: 'Matelot', role_label: 'Navigant', hired_on: '2018-01-01', departed_on: '2025-12-31', active: false },
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
    { key: 'off-hire', label: 'Off-Hire', display_order: 50, active: true },
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
  planning_absences: [],
  planning_conflict_cases: [],
  planning_conflict_case_history: [],
  planning_manning_matrices: [],
  planning_manning_requirements: [],
  planning_work_rest_policies: [{
    id: 9701,
    name: 'Politique de démonstration',
    scope: 'company',
    vessel_id: null,
    effective_from: '2026-01-01',
    effective_to: null,
    max_work_24h: 12,
    min_rest_24h: 11,
    max_work_7d: 72,
    min_rest_7d: 96,
    min_consecutive_rest_hours: 6,
    max_rest_periods_24h: 2,
    night_starts_at: '22:00:00',
    night_ends_at: '06:00:00',
    max_night_work_24h: 8,
    include_handover: true,
    active: true,
    notes: 'Valeurs synthétiques réservées à la préversion SeaPilot.',
    updated_at: '2026-08-01T08:00:00Z',
  }],
  working_time_registers: [
    {
      id: 9801, company_id: 1, person_id: 9301, period_kind: 'monthly',
      period_start: '2026-08-01', period_end: '2026-08-31', status: 'draft',
      work_rest_policy_id: 9701,
      people: { first_name: 'Arthur', last_name: 'DEMO', function_label: 'Capitaine' },
    },
    {
      id: 9802, company_id: 1, person_id: 9304, period_kind: 'monthly',
      period_start: '2026-08-01', period_end: '2026-08-31', status: 'submitted',
      work_rest_policy_id: 9701,
      people: { first_name: 'Hugo', last_name: 'BERNARD', function_label: 'Matelot' },
    },
  ],
  working_time_intervals: [
    {
      id: 9811, register_id: 9801, company_id: 1, person_id: 9301,
      local_work_date: '2026-08-03', starts_at: '2026-08-03T06:00:00Z', ends_at: '2026-08-03T14:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: 9201,
      watch_group: 'Bordée 1', comment: 'Quart passerelle', author_user_id: 'preview-user',
      author_person_id: 9301, source_type: 'manual', source_reference: null, source_record_key: null,
      voided_at: null,
    },
    {
      id: 9812, register_id: 9802, company_id: 1, person_id: 9304,
      local_work_date: '2026-08-03', starts_at: '2026-08-03T06:00:00Z', ends_at: '2026-08-03T18:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: 9201,
      watch_group: 'Bordée 1', comment: 'Opération pont', author_user_id: 'preview-user',
      author_person_id: 9301, source_type: 'manual', source_reference: null, source_record_key: null,
      voided_at: null,
    },
  ],
  working_time_calculation_windows: [{
    id: 9821, company_id: 1, person_id: 9304, window_end: '2026-08-03T20:00:00Z',
    local_window_end_date: '2026-08-03', timezone_name: 'Europe/Paris', vessel_id: 9201,
    work_rest_policy_id: 9701, work_24h_seconds: 43200, rest_24h_seconds: 43200,
    longest_rest_24h_seconds: 43200, rest_period_count_24h: 1,
    work_7d_seconds: 43200, rest_7d_seconds: 561600, night_work_24h_seconds: 0,
    is_compliant: false, violation_codes: ['rest_24h'], calculation_version: 1,
    calculated_at: '2026-08-03T20:01:00Z',
  }],
  working_time_day_comments: [{
    id: 9825, register_id: 9802, person_id: 9304, local_work_date: '2026-08-03',
    cause_category: 'unexpected_operation', operational_context: 'Prolongation d’une opération pont prioritaire.',
    immediate_action: 'Relève organisée et tâches non essentielles reportées.',
    compensatory_rest_plan: 'Repos compensateur de quatre heures prévu le 4 août.',
    comment: 'Écart maintenu NON CONFORME et suivi à la relève.',
    authored_by: 'preview-user', authored_by_person_id: 9301, updated_at: '2026-08-03T20:15:00Z',
  }],
  working_time_profile_signatures: [
    { id: 9831, person_id: 9301, version_number: 1, storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png', file_size_bytes: 12480, sha256: 'a'.repeat(64), valid_from: '2026-01-01T00:00:00Z', valid_to: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 9832, person_id: 9304, version_number: 1, storage_bucket: 'working-time-signatures', storage_path: '1/9304/preview.png', mime_type: 'image/png', file_size_bytes: 10960, sha256: 'b'.repeat(64), valid_from: '2026-01-01T00:00:00Z', valid_to: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  working_time_validations: [{
    id: 9841, register_id: 9802, event_type: 'sailor_signed', previous_status: 'awaiting_sailor_signature', new_status: 'submitted',
    actor_identity_snapshot: { first_name: 'Hugo', last_name: 'BERNARD', roles: ['marin'] },
    signature_snapshot: {
      signature_id: 9832, signer_person_id: 9304, signer_name: 'Hugo BERNARD', signer_roles: ['marin'],
      signed_at: '2026-08-03T20:10:00Z', version_number: 1, storage_bucket: 'working-time-signatures',
      storage_path: '1/9304/preview.png', mime_type: 'image/png', file_size_bytes: 10960, sha256: 'b'.repeat(64),
    },
    interval_snapshot: [], non_compliance_snapshot: [], comment: 'Signature explicite du marin.', occurred_at: '2026-08-03T20:10:00Z',
  }],
  hse_exposure_methodologies: [{
    id: 9851, name: 'Méthode HSE démo', version_label: '2026-08', effective_from: '2026-01-01',
    sedentary_day_hours: 8, offshore_actual_hour_factor: 1,
  }],
  hse_exposure_hours: [],
  hse_safety_events: [],
  action_type_catalog: [
    { type_key: 'progress-action', label: 'Action de Progrès - BBTM', family: 'action', hse_classification: null, tracks_exposure_rate: false, sort_order: 10, active: true },
    { type_key: 'internal-audit', label: 'Audit Interne - BBTM', family: 'audit', hse_classification: null, tracks_exposure_rate: false, sort_order: 20, active: true },
    { type_key: 'fatality', label: 'Décès (FAT)', family: 'event', hse_classification: 'FAT', tracks_exposure_rate: true, sort_order: 100, active: true },
    { type_key: 'lost-time-injury', label: 'Accident avec Arrêt de Travail (LTI)', family: 'event', hse_classification: 'LWDC', tracks_exposure_rate: true, sort_order: 110, active: true },
    { type_key: 'restricted-work-case', label: 'Blessure - Travail adapté (RWC)', family: 'event', hse_classification: 'RWC', tracks_exposure_rate: true, sort_order: 120, active: true },
    { type_key: 'medical-treatment-case', label: 'Accident avec traitement médical (MTC)', family: 'event', hse_classification: 'MTC', tracks_exposure_rate: true, sort_order: 130, active: true },
    { type_key: 'first-aid-case', label: 'Accident sans arrêt de travail (FAC)', family: 'event', hse_classification: 'FAC', tracks_exposure_rate: true, sort_order: 140, active: true },
    { type_key: 'near-miss', label: 'Presque-accident', family: 'event', hse_classification: 'NEAR_MISS', tracks_exposure_rate: true, sort_order: 150, active: true },
    { type_key: 'safety-observation', label: 'Observation sécurité', family: 'event', hse_classification: 'SAFETY_OBSERVATION', tracks_exposure_rate: true, sort_order: 160, active: true },
  ],
  action_items: [
    {
      id: 9861, company_id: 1, project_id: 9001, project_sharepoint_item_id: 'preview-project-1',
      project_code: 'P901', project_title: 'Campagne Atlantique — démonstration', vessel_id: 9201,
      vessel_sharepoint_item_id: 'preview-vessel-1', vessel_name: 'M/V Démonstration', category_key: 'audit',
      action_type_key: 'internal-audit', action_type: 'Audit Interne - BBTM', audit_type: 'Audit interne',
      title: 'Contrôler la protection du poste de manœuvre', status: 'Non soldé', priority_label: 'Haute',
      deviation_type: 'Non Conformité Majeure', opened_on: '2026-07-28', due_on: '2026-08-14', closed_on: null,
      issuer_name: 'Arthur DEMO', owner_name: 'Luc MARTIN', auditor_name: 'Arthur DEMO',
      description: 'La protection latérale du poste de manœuvre doit être remise en conformité.',
      corrective_action: 'Remplacer le garde-corps et consigner le contrôle final.', realized_action: null,
      anomaly_cause: 'Usure constatée pendant la ronde pont.', comments: 'Action issue de la liste Audit SharePoint.',
      level_label: 'Majeur', location_detail: 'Pont arrière', photo_1_path: null, photo_2_path: null,
      closure_photo_path: null, victim_person_id: null, victim_sharepoint_item_id: null, lost_days: 0,
      safety_event_details: {}, source_label: 'sharepoint-list-audit', sharepoint_list_title: "Plan d'Action",
      sharepoint_item_id: 'preview-action-101', source_modified_at: '2026-08-08T08:30:00Z',
    },
    {
      id: 9862, company_id: 1, project_id: null, project_sharepoint_item_id: null, project_code: null,
      project_title: null, vessel_id: 9201, vessel_sharepoint_item_id: 'preview-vessel-1', vessel_name: 'M/V Démonstration',
      category_key: 'event', action_type_key: 'first-aid-case', action_type: 'Accident sans arrêt de travail (FAC)',
      audit_type: 'Indicateur QHSE', title: 'Coupure superficielle pendant une manutention', status: 'Soldé',
      priority_label: 'Normale', deviation_type: 'Remarque', opened_on: '2026-07-19', due_on: '2026-07-19',
      closed_on: '2026-07-19', issuer_name: 'Arthur DEMO', owner_name: 'Hugo BERNARD', auditor_name: null,
      description: 'Premiers soins réalisés à bord sans arrêt de travail.', corrective_action: 'Rappel port des gants anticoupure.',
      realized_action: 'Brief sécurité réalisé à la relève.', anomaly_cause: 'Gants inadaptés à la tâche.', comments: null,
      level_label: 'Mineur', location_detail: 'Zone de manutention', photo_1_path: null, photo_2_path: null,
      closure_photo_path: 'demo/action-plan-closure-proof.webp', victim_person_id: 9304, victim_sharepoint_item_id: 'preview-person-4', lost_days: 0,
      safety_event_details: { treatment: 'Premiers soins' }, source_label: 'sharepoint-list-indicateurs-qhse',
      sharepoint_list_title: 'Indicateurs QHSE', sharepoint_item_id: 'preview-kpi-12', source_modified_at: '2026-08-07T09:15:00Z',
    },
    {
      id: 9863, company_id: 1, project_id: 9001, project_sharepoint_item_id: 'preview-project-1',
      project_code: 'P901', project_title: 'Campagne Atlantique — démonstration', vessel_id: 9201,
      vessel_sharepoint_item_id: 'preview-vessel-1', vessel_name: 'M/V Démonstration', category_key: 'action',
      action_type_key: 'progress-action', action_type: 'Action de Progrès - BBTM', audit_type: 'Ronde QHSE',
      title: 'Mettre à jour le balisage de la zone grue', status: 'Non soldé', priority_label: 'Normale',
      deviation_type: "Proposition d'Amélioration", opened_on: '2026-08-02', due_on: '2026-08-21', closed_on: null,
      issuer_name: 'Arthur DEMO', owner_name: 'Hugo BERNARD', auditor_name: null,
      description: 'Le balisage au sol est partiellement effacé.', corrective_action: 'Refaire le marquage et contrôler la signalétique.',
      realized_action: null, anomaly_cause: null, comments: null, level_label: 'Amélioration', location_detail: 'Pont de travail',
      photo_1_path: null, photo_2_path: null, closure_photo_path: null, victim_person_id: null,
      victim_sharepoint_item_id: null, lost_days: 0, safety_event_details: {}, source_label: 'sharepoint-list-audit',
      sharepoint_list_title: "Plan d'Action", sharepoint_item_id: 'preview-action-102', source_modified_at: '2026-08-08T10:00:00Z',
    },
  ],
  action_documents: [
    {
      id: 9871, action_item_id: 9861, action_sharepoint_item_id: 'preview-action-101',
      action_title: 'Contrôler la protection du poste de manœuvre', category_key: 'progress-sheet',
      title: 'FP protection poste de manœuvre.pdf', source_label: 'SharePoint · Fiche Progrès',
      source_sharepoint_id: 'preview-document-1', file_url: 'https://example.invalid/preview-action-plan.pdf',
      notes: 'Pièce de démonstration non téléchargeable.',
    },
  ],
  planning_notifications: [{
    id: 9891,
    company_id: 1,
    recipient_user_id: 'preview-user',
    notification_type: 'working_time_non_compliance',
    severity: 'critical',
    title: 'Temps de travail dépassé et repos insuffisant',
    body: 'Emilien LAFFAITEUR · GOURY · 06/08/2026 : travail 24 h 14 h / 12 h, repos 24 h 10 h / 11 h, travail 7 jours 78 h / 72 h et repos 7 jours 90 h / 96 h.',
    entity_kind: 'working_time_calculation_window',
    entity_id: 9821,
    person_id: 9304,
    vessel_id: 1,
    due_on: '2026-08-06',
    created_at: '2026-08-06T20:01:00Z',
    read_at: null,
  }],
  planning_dependencies: [],
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

      if (property === 'maybeSingle') {
        return () => createPreviewQuery({
          data: Array.isArray(result.data) ? result.data[0] || null : result.data,
          error: result.error,
        });
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
  if (functionName === 'refresh_planning_notifications' || functionName === 'refresh_working_time_notifications') {
    return createPreviewQuery({ data: 0, error: null });
  }
  if (functionName === 'working_time_entry_context') {
    return createPreviewQuery({
      data: {
        current_person_id: 9301,
        readable_people: [
          { person_id: 9301, first_name: 'Arthur', last_name: 'DEMO', function_label: 'Capitaine', is_self: true },
          { person_id: 9303, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', is_self: false },
          { person_id: 9304, first_name: 'Hugo', last_name: 'BERNARD', function_label: 'Matelot', is_self: false },
        ],
        editable_people: [
          { person_id: 9301, first_name: 'Arthur', last_name: 'DEMO', function_label: 'Capitaine', is_self: true },
          { person_id: 9303, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', is_self: false },
          { person_id: 9304, first_name: 'Hugo', last_name: 'BERNARD', function_label: 'Matelot', is_self: false },
        ],
      },
      error: null,
    });
  }
  if (functionName === 'working_time_interval_recommendation' || functionName === 'working_time_phases_recommendation') {
    const phases = Array.isArray(args.p_phases) ? args.p_phases as Array<{ starts_at: string; ends_at: string }> : [{ starts_at: String(args.p_proposed_start || ''), ends_at: String(args.p_proposed_end || '') }];
    const endsAt = new Date(phases.at(-1)?.ends_at || '');
    const proposedSeconds = phases.reduce((sum, phase) => sum + Math.max(0, (new Date(phase.ends_at).getTime() - new Date(phase.starts_at).getTime()) / 1000), 0);
    const existingSeconds = 4 * 3600;
    const work24hSeconds = existingSeconds + proposedSeconds;
    const available24hSeconds = Math.max(0, 12 * 3600 - work24hSeconds);
    const status = available24hSeconds === 0 ? 'alerte' : 'conforme';
    return createPreviewQuery({
      data: {
        status,
        policy_id: 9501,
        policy_name: 'Politique démo datée',
        already_non_compliant: false,
        available_24h_seconds: available24hSeconds,
        available_7d_seconds: Math.max(0, 72 * 3600 - (28 * 3600 + proposedSeconds)),
        work_24h_seconds: work24hSeconds,
        work_7d_seconds: 28 * 3600 + proposedSeconds,
        rest_24h_seconds: 24 * 3600 - work24hSeconds,
        longest_rest_24h_seconds: 8 * 3600,
        rest_impact_seconds: -proposedSeconds,
        consecutive_rest_impact_seconds: 0,
        max_additional_seconds: available24hSeconds,
        latest_end_at: new Date(endsAt.getTime() + available24hSeconds * 1000).toISOString(),
        next_resume_at: new Date(endsAt.getTime() + 8 * 3600 * 1000).toISOString(),
        violation_codes: [],
        phase_count: phases.length,
      },
      error: null,
    });
  }
  if (functionName === 'working_time_import_upload_context') {
    return createPreviewQuery({
      data: { batch_id: 9901, storage_bucket: 'working-time-imports', storage_path: `1/preview-user/9901/${String(args.p_file_name || 'registre.xlsm')}` },
      error: null,
    });
  }
  if (functionName === 'preview_working_time_import') {
    const rows = (Array.isArray(args.p_rows) ? args.p_rows : []) as Array<Record<string, unknown>>;
    const previewRows = rows.map((row, index) => {
      const phases = (Array.isArray(row.phases) ? row.phases : []) as Array<Record<string, unknown>>;
      const effectiveSeconds = phases.reduce((total, phase) => total + Math.max(0, Number(phase.end_minute || 0) - Number(phase.start_minute || 0)) * 60, 0);
      const reportedSeconds = row.reported_work_seconds === null || row.reported_work_seconds === undefined ? null : Number(row.reported_work_seconds);
      const hasTotalMismatch = reportedSeconds !== null && reportedSeconds !== effectiveSeconds;
      return {
        id: 9910 + index,
        local_work_date: row.date,
        effective_work_seconds: effectiveSeconds,
        vessel_name: row.vessel_name || 'Navire Test',
        watch_group: index % 2 === 0 ? 'Bordée 1' : 'Bordée 2',
        status: row.excluded ? 'excluded' : hasTotalMismatch ? 'inconsistent' : 'ready',
        issue_codes: hasTotalMismatch ? ['total_mismatch'] : [],
      };
    });
    const readyRows = previewRows.filter((row) => row.status === 'ready');
    const excludedRows = previewRows.filter((row) => row.status === 'excluded');
    const inconsistentRows = previewRows.filter((row) => row.status === 'inconsistent');
    return createPreviewQuery({
      data: {
        batch_id: Number(args.p_batch_id || 9901), status: 'preview_ready', rows: previewRows,
        summary: {
          total_rows: previewRows.length, ready_rows: readyRows.length,
          excluded_rows: excludedRows.length, duplicate_rows: 0,
          inconsistent_rows: inconsistentRows.length, blocked_rows: 0,
          reported_work_seconds: rows.reduce((total, row) => total + Number(row.reported_work_seconds || 0), 0),
          effective_work_seconds: readyRows.reduce((total, row) => total + row.effective_work_seconds, 0),
        },
      },
      error: null,
    });
  }
  if (functionName === 'commit_working_time_import') {
    return createPreviewQuery({ data: { batch_id: Number(args.p_batch_id || 9901), status: 'imported', summary: { ready_rows: 2 } }, error: null });
  }
  if (functionName === 'hse_kpi_summary') {
    return createPreviewQuery({ data: {
      methodology_id: 9851, methodology_version: '2026-08', exposure_hours: 12480,
      FAT: 0, LWDC: 1, RWC: 1, MTC: 2, FAC: 3, near_miss: 8, safety_observation: 42,
      LTI: 1, LTIFR: null, TRIR: null, FAR: null, FAC_rate: null, MTC_rate: null,
      RWC_rate: null, SOFR: null, french_frequency_rate: null, french_severity_rate: null,
      configuration_complete: false,
    }, error: null });
  }
  if (functionName === 'dpr_entry_context') {
    const reportDate = String(args.target_date || '2026-08-01');
    const people = previewRows('people')
      .filter((person) => person.active && (!person.hired_on || String(person.hired_on) <= reportDate) && (!person.departed_on || String(person.departed_on) >= reportDate))
      .map((person) => ({
        id: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        functionLabel: person.function_label,
        gradeLabel: person.grade_label,
        roleLabel: person.role_label,
      }));
    return createPreviewQuery({
      data: {
        issuerPersonId: 9301,
        issuerName: 'Arthur DEMO',
        vesselId: 9201,
        projectId: 9001,
        watchGroup: 'Bordée 1',
        people,
        crewPersonIds: [9301, 9303, 9304],
      },
      error: null,
    });
  }
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
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }),
      createSignedUrls: (paths: string[]) => Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: path.startsWith('demo/') ? `/${path}` : '' })), error: null,
      }),
      download: () => Promise.resolve({ data: previewSignaturePng(), error: null }),
      upload: (_path: string, _file: Blob, options?: { contentType?: string }) => bucket === 'working-time-imports' && options?.contentType === 'application/vnd.ms-excel.sheet.macroEnabled.12'
        ? Promise.resolve({ data: { path: _path }, error: null })
        : Promise.resolve({ data: null, error: PREVIEW_WRITE_ERROR }),
      remove: () => Promise.resolve({ data: null, error: PREVIEW_WRITE_ERROR }),
    }),
  },
} as unknown as SupabaseClient;
