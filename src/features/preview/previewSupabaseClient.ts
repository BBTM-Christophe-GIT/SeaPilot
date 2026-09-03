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

function createPreviewFleetCertificates(): unknown[] {
  const categories = [
    { key: '01-registre-international-francais', label: '01 - Registre International Français', titles: ['Acte de Francisation', "Permis d’Armement"] },
    { key: '02-centre-de-securite-des-navires', label: '02 - Centre de Sécurité des Navires', titles: ['Permis de Navigation', 'Certificat de Franc-Bord', 'Rapport de visite de sécurité', 'Certificat national de sécurité'] },
    { key: '03-societe-de-classification-dnv', label: '03 - Société de Classification - DNV', titles: ['Certificat de Classification', 'Certificat de jaugeage', 'Rapport annuel DNV'] },
    { key: '03-societe-de-classification-bv', label: '03 - Société de Classification - BV', titles: ['Certificat de Classification', 'Rapport annuel BV'] },
    { key: '04-assurance', label: '04 - Assurance', titles: ['Assurance Corps et Machine', 'Assurance P&I'] },
    { key: '05-safety-plan', label: '05 - Safety Plan', titles: ['Safety Plan'] },
    { key: '06-incendie', label: '06 - Incendie', titles: ['Visite Extinction Fixe et Portatif', 'Certificat extincteurs', 'Rapport installation incendie'] },
    { key: '07-lsa', label: '07 - LSA', titles: ['Certificat Radeau', 'Certificat brassières', 'Rapport moyens de sauvetage'] },
    { key: '08-levage', label: '08 - Levage', titles: ['Registre des Apparaux de Levage', 'Certificat grue', 'Certificat bossoir', 'Rapport palans', 'Rapport accessoires de levage'] },
    { key: '09-anfr', label: '09 - ANFR', titles: ['Licence Radio', 'Rapport Visite Radio'] },
    { key: '10-dotation-medicale', label: '10 - Dotation Médicale', titles: ['Dotation médicale'] },
    { key: '11-analyse-eau', label: '11 - Analyse Eau', titles: ['Analyse eau potable', 'Analyse légionelles', 'Rapport sanitaire'] },
    { key: '12-dossier-de-stabilite', label: '12 - Dossier de Stabilité', titles: ['Dossier de Stabilité'] },
    { key: '13-amiante', label: '13 - Amiante', titles: ['Dossier technique amiante'] },
    { key: '14-ecmid', label: '14 - eCMID', titles: ['Rapport eCMID', 'Questionnaire eCMID'] },
  ];
  const vessels = [
    { name: 'GOURY', acronym: 'GRY', counts: [2, 1, 3, 0, 2, 1, 3, 3, 5, 2, 1, 3, 1, 1, 1], dates: ['2026-04-12', '2026-04-20', '2026-09-15', '2026-11-28', '2026-12-10', '2026-12-28'] },
    { name: 'HIRONDELLE DE LA MANCHE', acronym: 'HIR', counts: [2, 2, 0, 0, 1, 0, 2, 1, 0, 2, 1, 0, 0, 0, 1], dates: ['2026-12-12'] },
    { name: 'HOLENN EUSA', acronym: 'HE', counts: [2, 1, 0, 0, 1, 0, 2, 1, 1, 1, 0, 0, 0, 0, 0], dates: ['2026-10-10', '2026-11-22', '2026-12-18'] },
    { name: 'KROKDUR', acronym: 'KDR', counts: [2, 4, 0, 0, 1, 1, 1, 2, 5, 2, 0, 0, 1, 1, 1], dates: ['2026-10-22', '2026-11-25', '2026-12-20'] },
    { name: 'LANDEMER', acronym: 'LDM', counts: [0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0], dates: ['2026-06-14'] },
    { name: 'LE ROZEL', acronym: 'RZL', counts: [2, 1, 0, 2, 2, 1, 2, 3, 4, 2, 0, 0, 1, 1, 1], dates: ['2026-11-20', '2026-12-08', '2026-12-22'] },
    { name: 'SUROIT', acronym: 'SUR', counts: [2, 2, 0, 2, 2, 1, 1, 3, 5, 1, 0, 0, 0, 1, 2], dates: ['2026-01-18', '2026-02-14', '2026-03-21', '2026-04-16', '2026-05-20', '2026-06-24', '2026-07-16', '2026-12-16'] },
  ];
  let id = 5000;
  return vessels.flatMap((vessel, vesselIndex) => vessel.counts.flatMap((count, categoryIndex) => Array.from({ length: count }, (_, categoryDocumentIndex) => {
    const index = vessel.counts.slice(0, categoryIndex).reduce((total, value) => total + value, 0) + categoryDocumentIndex;
    const expiresOn = vessel.dates[index] || null;
    const expired = Boolean(expiresOn && expiresOn < '2026-08-11');
    const renewalDue = Boolean(expiresOn && expiresOn >= '2026-08-11' && expiresOn <= '2026-11-09');
    const category = categories[categoryIndex];
    const title = vesselIndex === 0 && categoryIndex === 1
      ? 'Certificat de Franc-Bord'
      : category.titles[categoryDocumentIndex] || `${category.label.replace(/^\d+\s*-\s*/, '')} ${categoryDocumentIndex + 1}`;
    const currentId = id++;
    return {
      id: currentId,
      company_id: 1,
      vessel_id: vesselIndex + 1,
      vessel_name: vessel.name,
      vessel: { acronym: vessel.acronym },
      category_key: category.key,
      category_label: category.label,
      document_title: title,
      title,
      status: expired ? 'expired' : renewalDue ? 'renew_due' : 'valid',
      issued_on: expiresOn ? `${Number(expiresOn.slice(0, 4)) - 1}${expiresOn.slice(4)}` : null,
      expires_on: expiresOn,
      planned_on: !renewalDue && index < 4 ? `2026-${String(Math.min(12, index + 8)).padStart(2, '0')}-05` : null,
      alarm_on: null,
      provider_name: index < 3 ? 'Prestataire de démonstration' : null,
      visit_location: index < 3 ? 'Cherbourg' : null,
      workflow_status: renewalDue || expired ? 'due' : index < 4 ? 'planned' : 'not_started',
      renewal_notes: null,
      renaming_rule_key: 'vessel-title-issued-year',
      original_file_name: `${vessel.acronym} - ${title}.pdf`,
      file_name: `${vessel.acronym} - ${title}.pdf`,
      source_label: 'prévisualisation',
      file_url: null,
      storage_bucket: 'fleet-certificates',
      storage_path: `1/${vessel.acronym}/preview/${currentId}.pdf`,
      mime_type: 'application/pdf',
      file_size_bytes: 245000 + index * 2000,
      current_version_no: 1,
      is_active_fleet: true,
      notes: null,
      updated_at: '2026-08-11T11:42:00Z',
    };
  })));
}

function createPreviewFleetCertificateFindings(): unknown[] {
  return [
    { id: 8601, company_id: 1, certificate_id: 5002, reference: 'EC-2026-0012', finding_type: 'major_non_conformity', title: 'Corrosion du support bâbord', description: 'Corrosion perforante constatée sur le support bâbord. Décaper, contrôler l’épaisseur résiduelle puis remplacer la partie dégradée avant validation.', detected_on: '2026-07-16', treatment_delay_days: 21, treatment_due_on: '2026-08-06', status: 'in_progress', progress: 60, responsible_person_id: 9303, responsible_name: 'Luc MARTIN', created_at: '2026-07-16T09:14:00Z', updated_at: '2026-08-10T15:20:00Z' },
    { id: 8602, company_id: 1, certificate_id: 5002, reference: 'EC-2026-0013', finding_type: 'minor_non_conformity', title: 'Marquage de sécurité incomplet', description: 'Compléter le marquage réglementaire sur la zone de travail arrière.', detected_on: '2026-07-16', treatment_delay_days: 45, treatment_due_on: '2026-08-30', status: 'assigned', progress: 20, responsible_person_id: 9304, responsible_name: 'Hugo BERNARD', created_at: '2026-07-16T09:40:00Z', updated_at: '2026-08-09T10:00:00Z' },
    { id: 8603, company_id: 1, certificate_id: 5002, reference: 'EC-2026-0014', finding_type: 'class_condition', title: 'Essai de charge à fournir', description: 'Transmettre le procès-verbal de l’essai de charge de l’apparau concerné.', detected_on: '2026-07-17', treatment_delay_days: 60, treatment_due_on: '2026-09-15', status: 'assigned', progress: 35, responsible_person_id: 9301, responsible_name: 'Arthur DEMO', created_at: '2026-07-17T08:20:00Z', updated_at: '2026-08-08T14:10:00Z' },
    { id: 8604, company_id: 1, certificate_id: 5000, reference: 'EC-2026-0015', finding_type: 'prescription', title: 'Actualiser l’acte de francisation', description: 'Intégrer la dernière modification administrative et déposer le document signé.', detected_on: '2026-07-20', treatment_delay_days: 30, treatment_due_on: '2026-08-19', status: 'in_progress', progress: 70, responsible_person_id: 9302, responsible_name: 'Camille DURAND', created_at: '2026-07-20T08:20:00Z', updated_at: '2026-08-10T09:10:00Z' },
    { id: 8605, company_id: 1, certificate_id: 5002, reference: 'EC-2026-0016', finding_type: 'remark', title: 'Plan de maintenance à compléter', description: 'Préciser la périodicité du contrôle visuel dans le plan de maintenance.', detected_on: '2026-07-21', treatment_delay_days: 90, treatment_due_on: '2026-10-19', status: 'closed', progress: 100, responsible_person_id: 9303, responsible_name: 'Luc MARTIN', closed_at: '2026-08-07T11:30:00Z', created_at: '2026-07-21T08:20:00Z', updated_at: '2026-08-07T11:30:00Z' },
  ];
}

function createPreviewFleetFindingAttachments(): unknown[] {
  return [
    { id: 8701, company_id: 1, finding_id: 8601, attachment_kind: 'finding', original_file_name: 'corrosion-support-babord.jpg', storage_bucket: 'fleet-certificates', storage_path: 'demo/action-plan-closure-proof.webp', mime_type: 'image/jpeg', file_size_bytes: 422100, caption: 'Constat initial', created_at: '2026-07-16T09:18:00Z' },
    { id: 8702, company_id: 1, finding_id: 8601, attachment_kind: 'finding', original_file_name: 'rapport-visite-CSN.pdf', storage_bucket: 'fleet-certificates', storage_path: 'demo/rapport-visite-CSN.pdf', mime_type: 'application/pdf', file_size_bytes: 815000, caption: 'Rapport de visite', created_at: '2026-07-16T09:20:00Z' },
    { id: 8703, company_id: 1, finding_id: 8601, attachment_kind: 'treatment', original_file_name: 'reparation-support.jpg', storage_bucket: 'fleet-certificates', storage_path: 'demo/action-plan-closure-proof.webp', mime_type: 'image/jpeg', file_size_bytes: 385200, caption: 'Travaux réalisés', created_at: '2026-08-10T15:20:00Z' },
  ];
}

function createPreviewFleetFindingEvents(): unknown[] {
  return [
    { id: 8801, company_id: 1, finding_id: 8601, event_type: 'created', from_status: null, to_status: 'declared', note: 'Écart créé après visite CSN', author: { display_name: 'Arthur DEMO' }, created_at: '2026-07-16T09:14:00Z' },
    { id: 8802, company_id: 1, finding_id: 8601, event_type: 'assigned', from_status: 'declared', to_status: 'assigned', note: 'Responsable : Luc MARTIN', author: { display_name: 'Camille DURAND' }, created_at: '2026-07-17T07:30:00Z' },
    { id: 8803, company_id: 1, finding_id: 8601, event_type: 'progress_updated', from_status: 'in_progress', to_status: 'in_progress', note: 'Décapage réalisé et pièce de remplacement commandée', author: { display_name: 'Luc MARTIN' }, created_at: '2026-08-05T14:05:00Z' },
    { id: 8804, company_id: 1, finding_id: 8601, event_type: 'evidence_added', from_status: null, to_status: null, note: 'Preuve de traitement ajoutée : reparation-support.jpg', author: { display_name: 'Luc MARTIN' }, created_at: '2026-08-10T15:20:00Z' },
  ];
}

const PREVIEW_ROWS: Record<string, unknown[]> = {
  procedures: [
    {
      id: 8101, procedure_code: 'GEN 01-A', title: 'Manuel Qualité Santé Sécurité Environnement', status: 'approved',
      revision_label: 'A', published_on: '2026-08-20', source_label: 'seapilot', file_url: null,
      notes: 'Document de démonstration', category_label: 'Manuel', diffusion_on: '2026-08-20',
      description: 'Référentiel général du système de management QHSE.', regulatory_requirement: 'Code ISM',
      ism_chapter: '01', vessel_name: '', project_name: 'BBTM', document_number: '01', restrictions: '',
      annual_review: true, approval_status: 'Document approuve', theme: 'GEN', document_type: 'MAN',
      bridge_watch: false, version_label: 'A', source_storage_bucket: 'procedure-documents',
      source_storage_path: 'sources/demo/gen-01-a.docx', source_file_name: 'GEN 01-A Manuel QHSE.docx',
      source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source_size_bytes: 845000,
    },
    {
      id: 8102, procedure_code: 'POL 01-B', title: 'Politique Santé Sécurité Environnement', status: 'approved',
      revision_label: 'B', published_on: '2026-08-22', source_label: 'seapilot', file_url: null,
      notes: '', category_label: 'Politique', diffusion_on: '2026-08-22', description: '', regulatory_requirement: 'Code ISM',
      ism_chapter: '02', vessel_name: '', project_name: 'BBTM', document_number: '01', restrictions: '', annual_review: true,
      approval_status: 'Document approuve', theme: 'POL', document_type: 'GEN', bridge_watch: false, version_label: 'B',
      source_storage_bucket: 'procedure-documents', source_storage_path: 'sources/demo/pol-01-b.docx',
      source_file_name: 'POL 01-B Politique SSE.docx', source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source_size_bytes: 312000,
    },
    {
      id: 8103, procedure_code: 'RAC 01-A', title: 'Fiche de Poste - Président', status: 'review',
      revision_label: 'A', published_on: null, source_label: 'seapilot', file_url: null, notes: '', category_label: 'Responsabilités',
      diffusion_on: '', description: '', regulatory_requirement: '', ism_chapter: '03', vessel_name: '', project_name: 'BBTM',
      document_number: '01', restrictions: '', annual_review: false, approval_status: 'En cours de validation', theme: 'RAC',
      document_type: 'FOR', bridge_watch: false, version_label: 'A', source_storage_bucket: 'procedure-documents',
      source_storage_path: 'sources/demo/rac-01-a.docx', source_file_name: 'RAC 01-A Fiche de Poste Président.docx',
      source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source_size_bytes: 126000,
    },
    {
      id: 8104, procedure_code: 'RAC 03-A', title: 'Fiche de Poste - Directeur QHSE - RSE - DPA', status: 'approved',
      revision_label: 'A', published_on: '2026-08-25', source_label: 'seapilot', file_url: null, notes: '', category_label: 'Responsabilités',
      diffusion_on: '2026-08-25', description: '', regulatory_requirement: '', ism_chapter: '03', vessel_name: '', project_name: 'BBTM',
      document_number: '03', restrictions: '', annual_review: false, approval_status: 'Document approuve', theme: 'RAC',
      document_type: 'FOR', bridge_watch: false, version_label: 'A', source_storage_bucket: 'procedure-documents',
      source_storage_path: 'sources/demo/rac-03-a.docx', source_file_name: 'RAC 03-A Fiche Directeur QHSE.docx',
      source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source_size_bytes: 139000,
    },
    {
      id: 8105, procedure_code: 'URG 02-C', title: 'Réponse à une pollution accidentelle', status: 'approved',
      revision_label: 'C', published_on: '2026-08-28', source_label: 'seapilot', file_url: null, notes: '', category_label: "Procédure d'urgence",
      diffusion_on: '2026-08-28', description: '', regulatory_requirement: 'MARPOL', ism_chapter: '08', vessel_name: 'GOURY', project_name: 'P144',
      document_number: '02', restrictions: '', annual_review: true, approval_status: 'Document approuve', theme: 'URG',
      document_type: 'PRO', bridge_watch: true, version_label: 'C', source_storage_bucket: 'procedure-documents',
      source_storage_path: 'sources/demo/urg-02-c.docx', source_file_name: 'URG 02-C Pollution accidentelle.docx',
      source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source_size_bytes: 460000,
    },
  ],
  published_procedures: [
    {
      id: 8201, procedure_id: 8101, procedure_sharepoint_item_id: null, procedure_code: 'GEN 01-A',
      title: 'GEN 01-A Manuel Qualité Santé Sécurité Environnement.pdf', status: 'approved', revision_label: 'A',
      published_on: '2026-08-20', source_label: 'seapilot', file_url: null, notes: '', category_label: 'Manuel',
      diffusion_on: '2026-08-20', description: '', regulatory_requirement: 'Code ISM', ism_chapter: '01', vessel_name: '',
      project_name: 'BBTM', document_number: 'GEN 01-A', restrictions: '', annual_review: true, approval_status: 'Document approuve',
      theme: 'GEN', document_type: 'MAN', bridge_watch: false, version_label: 'A', storage_bucket: 'procedure-documents',
      storage_path: 'published/8101/gen-01-a.pdf', file_name: 'GEN 01-A Manuel QHSE.pdf', mime_type: 'application/pdf', size_bytes: 612000, published_by: 'preview-user',
    },
    {
      id: 8202, procedure_id: 8102, procedure_sharepoint_item_id: null, procedure_code: 'POL 01-B',
      title: 'POL 01-B Politique Santé Sécurité Environnement.pdf', status: 'approved', revision_label: 'B',
      published_on: '2026-08-22', source_label: 'seapilot', file_url: null, notes: '', category_label: 'Politique',
      diffusion_on: '2026-08-22', description: '', regulatory_requirement: 'Code ISM', ism_chapter: '02', vessel_name: '',
      project_name: 'BBTM', document_number: 'POL 01-B', restrictions: '', annual_review: true, approval_status: 'Document approuve',
      theme: 'POL', document_type: 'GEN', bridge_watch: false, version_label: 'B', storage_bucket: 'procedure-documents',
      storage_path: 'published/8102/pol-01-b.pdf', file_name: 'POL 01-B Politique SSE.pdf', mime_type: 'application/pdf', size_bytes: 244000, published_by: 'preview-user',
    },
    {
      id: 8204, procedure_id: 8104, procedure_sharepoint_item_id: null, procedure_code: 'RAC 03-A',
      title: 'RAC 03-A Fiche de Poste - Directeur QHSE - RSE - DPA.pdf', status: 'approved', revision_label: 'A',
      published_on: '2026-08-25', source_label: 'seapilot', file_url: null, notes: '', category_label: 'Responsabilités',
      diffusion_on: '2026-08-25', description: '', regulatory_requirement: '', ism_chapter: '03', vessel_name: '',
      project_name: 'BBTM', document_number: 'RAC 03-A', restrictions: '', annual_review: false, approval_status: 'Document approuve',
      theme: 'RAC', document_type: 'FOR', bridge_watch: false, version_label: 'A', storage_bucket: 'procedure-documents',
      storage_path: 'published/8104/rac-03-a.pdf', file_name: 'RAC 03-A Directeur QHSE.pdf', mime_type: 'application/pdf', size_bytes: 108000, published_by: 'preview-user',
    },
    {
      id: 8205, procedure_id: 8105, procedure_sharepoint_item_id: null, procedure_code: 'URG 02-C',
      title: 'URG 02-C Réponse à une pollution accidentelle.pdf', status: 'approved', revision_label: 'C',
      published_on: '2026-08-28', source_label: 'seapilot', file_url: null, notes: '', category_label: "Procédure d'urgence",
      diffusion_on: '2026-08-28', description: '', regulatory_requirement: 'MARPOL', ism_chapter: '08', vessel_name: 'GOURY',
      project_name: 'P144', document_number: 'URG 02-C', restrictions: '', annual_review: true, approval_status: 'Document approuve',
      theme: 'URG', document_type: 'PRO', bridge_watch: true, version_label: 'C', storage_bucket: 'procedure-documents',
      storage_path: 'published/8105/urg-02-c.pdf', file_name: 'URG 02-C Pollution accidentelle.pdf', mime_type: 'application/pdf', size_bytes: 382000, published_by: 'preview-user',
    },
  ],
  profiles: [{ id: 'preview-user', display_name: 'Administrateur Démonstration' }],
  people: [
    {
      id: 9301,
      user_id: 'preview-user',
      first_name: 'Arthur',
      last_name: 'DEMO',
      email: 'arthur.demo@example.invalid',
      function_label: 'Capitaine',
      enim_function_code: 'AA01A',
      enim_category: 15,
      grade_label: 'Capitaine',
      role_label: 'Navigant',
      register_label: 'ENIM',
      sex: 'M',
      sailor_number: 'DEMO-001',
      employee_number: '00051',
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
    { id: 9302, user_id: null, first_name: 'Camille', last_name: 'DURAND', function_label: 'Direction', enim_function_code: null, enim_category: null, grade_label: '', role_label: 'Sédentaire', hired_on: '2020-01-01', departed_on: null, active: true },
    { id: 9303, user_id: null, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', enim_function_code: 'CB01A', enim_category: 15, grade_label: 'Chef mécanicien', role_label: 'Navigant', hired_on: '2022-05-01', departed_on: null, active: true },
    { id: 9304, user_id: null, first_name: 'Hugo', last_name: 'BERNARD', function_label: 'Matelot', grade_label: 'Matelot', role_label: 'Navigant', hired_on: '2024-03-01', departed_on: null, active: true },
    { id: 9398, user_id: null, first_name: 'Nicolas', last_name: 'BOUVILLE', function_label: 'Matelot polyvalent', enim_function_code: 'PA01A', enim_category: 5, grade_label: 'Matelot', role_label: 'Navigant', hired_on: '2019-03-01', departed_on: '2026-06-25', active: false },
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
    {
      id: 9405,
      person_id: 9302,
      person_name: 'Camille DURAND',
      person_sharepoint_item_id: null,
      category_key: 'safety_training',
      title: 'LEMS - HSE Induction',
      status: 'renew_due',
      issued_on: '2025-09-08',
      expires_on: '2026-09-08',
      requires_captain_validation: false,
      medical_unfit: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/camille-durand-lems-hse-induction.pdf',
      file_size_bytes: 174080,
      mime_type: 'application/pdf',
    },
    {
      id: 9406,
      person_id: 9399,
      person_name: 'Ancien MARIN',
      person_sharepoint_item_id: null,
      category_key: 'safety_training',
      title: 'LEMS - HSE Induction',
      status: 'renew_due',
      issued_on: '2025-09-08',
      expires_on: '2026-09-08',
      requires_captain_validation: false,
      medical_unfit: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/ancien-marin-lems-hse-induction.pdf',
      file_size_bytes: 174080,
      mime_type: 'application/pdf',
    },
    {
      id: 9407,
      person_id: null,
      person_name: 'Nicolas BOUVILLE',
      person_sharepoint_item_id: null,
      category_key: 'medical_visit',
      title: 'Visite Médicale',
      status: 'renew_due',
      issued_on: '2025-08-31',
      expires_on: '2026-08-31',
      requires_captain_validation: false,
      medical_unfit: false,
      source_label: 'preview',
      notes: null,
      file_url: null,
      storage_bucket: 'hr-documents',
      storage_path: 'preview/nicolas-bouville-visite-medicale.pdf',
      file_size_bytes: 174080,
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
      charter_hire_override: false,
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
      charter_hire_override: true,
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
      charter_hire_override: false,
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
      towed_asset_id: null,
      source_label: 'sharepoint',
      sharepoint_list_title: 'BBTM - Projets',
      sharepoint_item_id: 'preview-project-1',
      source_modified_at: '2026-07-15T10:00:00Z',
      archived_at: null,
    },
  ],
  project_towed_assets: [
    {
      id: 9351,
      name: 'DENVER',
      asset_type: 'AUTOMOTEUR FLUVIAL',
      length_overall_m: 82,
      breadth_overall_m: 8.2,
      max_draft_m: 1,
      light_displacement_t: 700,
      flag: 'FR',
      classification_society: null,
      registration_number: null,
      owner_name: null,
      hull_machinery_insurer: null,
      liability_insurer: null,
      photo_url: '/vessels/goury.jpg',
      photo_storage_path: null,
      active: true,
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
      represented_by: 'Camille MARTIN',
      code: 'DEMO-SP',
      email: '',
      phone: '',
      address: '',
      postal_code: '29200',
      city: 'Brest',
      country: 'France',
      website: 'https://example.com/',
      logo_url: 'https://example.com/favicon.ico',
      logo_storage_path: null,
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
      represented_by: 'Alex MOREAU',
      code: 'DEMO-SPT',
      email: '',
      phone: '',
      address: '',
      postal_code: '50100',
      city: 'Cherbourg',
      country: 'France',
      website: '',
      logo_url: null,
      logo_storage_path: null,
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
    {
      id: 1, company_id: 1, name: 'GOURY', acronym: 'GRY', asset_kind: 'vessel', active: true,
      type_label: 'Navire de charge', unit_type_label: 'Navire', fleet_exit_on: null,
      registration_number: '934968', imo_number: '9213870', registration_port: 'MARSEILLE',
      call_sign: 'FLBU', mmsi: '361001000', gross_tonnage: '293', max_people: 12,
      crew_members: null, medical_dotation: 'Dotation médicale B - Médicaments (catégorie 2 - 200 miles)',
      length_overall: '30.62 m', flag_state: 'France',
      sharepoint_list_id: '543b9f00-aed2-489a-808a-7b64cc835a83', sharepoint_item_id: '1',
      source_modified_at: '2026-05-31T10:45:21Z', source_guid: '9c29663e-fe10-4560-b2cf-4bd228e38da5',
      source_etag: '33', source_active_label: 'GOURY', source_fleet_exit_at: null,
      photo_url: '/vessels/goury.jpg', photo_storage_bucket: null, photo_storage_path: null,
      brochure_subtitle: 'Offshore Guard Vessel',
      brochure_summary: 'Navire polyvalent conçu pour la surveillance, l’assistance offshore et le transfert de personnel.',
      brochure_operations: ['Standby & Guard Vessel', 'Transfert de personnel', 'Support plongée', 'Assistance offshore'],
      built_year: 2001, classification_label: 'DNV', navigation_category: 'Catégorie 2 — jusqu’à 200 milles des côtes',
      beam_overall_m: 8.5, lightship_tonnes: 400, deadweight_tonnes: 100, safe_manning: 4,
      main_engine: 'CATERPILLAR C3512 B', main_engine_power_kw: 750, bow_thruster_power_kw: 75,
      gensets: '2 × 230 KVA + 1 × 180 KVA', max_speed_knots: 12, bollard_pull_tonnes: 12,
      fuel_capacity_m3: 110, range_description: '4 semaines · 11 000 milles nautiques à 8 nœuds · Hs 5 m',
      deck_equipment: 'Treuil de remorquage, cabestan, grue de pont et zone de travail arrière.',
      electronics_communications: 'Équipements de navigation et de radiocommunication adaptés à la zone SMDSM.',
      accommodation: 'Capacité maximale de 12 personnes à bord.',
    },
    {
      id: 2, company_id: 1, name: 'Armement - Cherbourg', acronym: null, asset_kind: 'office', active: true,
      type_label: null, unit_type_label: 'Armement', fleet_exit_on: null, sharepoint_item_id: '15',
    },
    {
      id: 3, company_id: 1, name: 'YARD - Le Havre', acronym: null, asset_kind: 'quay', active: true,
      type_label: null, unit_type_label: 'Yard', fleet_exit_on: null, sharepoint_item_id: '8',
    },
    { id: 9201, name: 'M/V Démonstration', acronym: 'MVD', active: true, fleet_exit_on: null, sharepoint_item_id: 'preview-vessel-1' },
    { id: 9202, name: 'Support Démonstration', acronym: 'SD', active: true, fleet_exit_on: null, sharepoint_item_id: 'preview-vessel-2' },
  ],
  purchase_requests: [
    {
      id: 9951, request_number: '95', title: 'Moteur de commande régulation GE1', requested_on: '2026-07-29',
      requester_name: 'Julien LECOCQ', supplier_name: 'CATERPILLAR', vessel_id: 9201, vessel_name: 'M/V Démonstration',
      reference: '4W-7773', quantity: 1, unit_label: 'Unité', amount_ht: 0, currency: 'EUR', status: 'Approbation en attente',
      description: 'Remplacement du moteur de commande régulation GE1 défectueux. Indispensable pour garantir le bon fonctionnement de la régulation.',
      urgent: false, ordered_on: null, expected_delivery_on: null, received_on: null, delivery_location: 'Brest',
      delivery_details: 'Déposer à l’atelier machine.', category_label: 'Approvisionnement', approval_status: 'En attente',
      source_label: 'preview', created_at: '2026-07-29T17:39:00Z', updated_at: '2026-07-29T17:40:00Z',
    },
    {
      id: 9952, request_number: '86', title: 'Ampoule feu de navigation', requested_on: '2026-07-28',
      requester_name: 'Arthur DEMO', supplier_name: 'SERVAUX', vessel_id: 9201, vessel_name: 'M/V Démonstration',
      reference: 'NAV-24V', quantity: 4, unit_label: 'Unité', amount_ht: 152, currency: 'EUR', status: 'À traiter',
      description: 'Remplacement préventif avant appareillage.', urgent: true, urgency_reason: 'Sécurité navigation',
      ordered_on: null, expected_delivery_on: null, received_on: null, delivery_location: 'A bord', delivery_details: 'Passerelle',
      category_label: 'Approvisionnement', approval_status: 'En attente', source_label: 'preview', created_at: '2026-07-28T08:15:00Z', updated_at: '2026-07-28T08:15:00Z',
    },
    {
      id: 9953, request_number: '29', title: 'Visite grue et bossoir', requested_on: '2026-07-20', requester_name: 'Luc MARTIN',
      supplier_name: 'Marine Services', vessel_id: 9201, vessel_name: 'M/V Démonstration', quantity: 1, unit_label: 'Prestation',
      amount_ht: 2450, currency: 'EUR', status: 'Commande en cours', description: 'Visite annuelle réglementaire.', urgent: false,
      owner_name: 'Camille DURAND', ordered_on: '2026-07-24', expected_delivery_on: null, received_on: null, delivery_location: 'Cherbourg',
      category_label: 'Prestataire de Service', approval_status: 'Approuvée', source_label: 'preview', created_at: '2026-07-20T09:00:00Z', updated_at: '2026-07-24T10:30:00Z',
    },
    {
      id: 9954, request_number: '74', title: 'Douilles inox M12', requested_on: '2026-07-18', requester_name: 'Arthur DEMO',
      supplier_name: 'Marine Supplies', vessel_id: 9202, vessel_name: 'Support Démonstration', quantity: 24, unit_label: 'Unité',
      amount_ht: 438, currency: 'EUR', status: 'Réception', description: 'Lot de douilles inox pour maintenance pont.', urgent: false,
      owner_name: 'Camille DURAND', ordered_on: '2026-07-22', expected_delivery_on: '2026-08-10', received_on: null,
      delivery_location: 'A bord', category_label: 'Approvisionnement', approval_status: 'Approuvée', source_label: 'preview', created_at: '2026-07-18T11:00:00Z', updated_at: '2026-07-22T14:00:00Z',
    },
    {
      id: 9955, request_number: '53', title: 'Joint torique NBR 20x2', requested_on: '2026-07-12', requester_name: 'Luc MARTIN',
      supplier_name: 'Atlantic Joints', vessel_id: 9201, vessel_name: 'M/V Démonstration', quantity: 10, unit_label: 'Unité',
      amount_ht: 64, currency: 'EUR', status: 'Traitée', description: 'Stock machine.', urgent: true,
      urgency_reason: 'Ancienne urgence déjà soldée', owner_name: 'Camille DURAND',
      ordered_on: '2026-07-14', expected_delivery_on: '2026-07-20', received_on: '2026-07-20', delivery_location: 'A bord',
      category_label: 'Approvisionnement', approval_status: 'Approuvée', source_label: 'preview', created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-20T16:00:00Z',
    },
  ],
  project_contract_hire_periods: [
    {
      id: 9351,
      project_id: 9001,
      contract_id: 9301,
      starts_on: '2026-08-01',
      ends_on: '2026-08-12',
      charter_hire: 18000,
      hire_currency: 'EUR',
      hire_unit: 'jour',
    },
    {
      id: 9352,
      project_id: 9001,
      contract_id: 9301,
      starts_on: '2026-08-13',
      ends_on: null,
      charter_hire: 19500,
      hire_currency: 'EUR',
      hire_unit: 'jour',
    },
  ],
  purchase_request_attachments: [
    { id: 9961, purchase_request_id: 9951, title: 'photo-moteur-ge1.jpg', content_type: 'image/jpeg', file_size_bytes: 248000, source_kind: 'sharepoint', file_url: 'https://example.invalid/photo-moteur-ge1.jpg', storage_bucket: null, storage_path: null, created_at: '2026-07-29T17:39:00Z' },
  ],
  purchase_request_events: [
    { id: 9971, purchase_request_id: 9951, event_type: 'created', status_label: 'Demande créée', actor_name: 'Julien LECOCQ', comment: null, effective_on: '2026-07-29', created_at: '2026-07-29T17:39:00Z' },
    { id: 9972, purchase_request_id: 9951, event_type: 'information_requested', status_label: 'Envoyée pour approbation', actor_name: 'Julien LECOCQ', comment: null, effective_on: '2026-07-29', created_at: '2026-07-29T17:40:00Z' },
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
    { key: 'fire-protection', label: "Protection contre l'incendie", display_order: 100, active: true },
    { key: 'sea-rescue', label: 'Sauvetage en mer', display_order: 110, active: true },
    { key: 'loss-of-propulsion', label: 'Perte de propulsion – manœuvrabilité', display_order: 140, active: true },
    { key: 'onboard-evacuation', label: 'Évacuation à bord', display_order: 160, active: true },
    { key: 'flooding-control', label: "Lutte contre l'envahissement", display_order: 170, active: true },
    { key: 'abandon-ship', label: 'Évacuation et abandon du navire', display_order: 180, active: true },
    { key: 'loss-of-power', label: "Perte d'énergie", display_order: 190, active: true },
    { key: 'injured-person', label: "Évacuation et prise en charge d'un blessé", display_order: 220, active: true },
    { key: 'anti-pollution', label: 'Exercice Antipollution', display_order: 230, active: true },
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
  planning_manning_matrices: [{
    id: 98001, vessel_id: 1, name: 'Situation 1', navigation_genre: 'CI-CABOTAGE INTERNATIONAL',
    activity_description: 'Navigation limitée à 200 milles des côtes / Zone radio SMDSM : A1-A2',
    effective_from: '2026-01-01', effective_to: null, status: 'active',
    notes: 'Prescriptions suivant le permis de navigation.', version: 1,
  }],
  planning_manning_requirements: [
    { id: 98101, matrix_id: 98001, function_label: 'Capitaine', minimum_count: 1, target_count: 1, required_certificates: ['Capitaine 500'], required_qualifications: [], required_authorizations: [], required_trainings: [], restrictions: [], display_order: 1 },
    { id: 98102, matrix_id: 98001, function_label: 'Matelot', minimum_count: 2, target_count: 3, required_certificates: ['CGO - Certificat Général d’Opérateur'], required_qualifications: [], required_authorizations: [], required_trainings: [], restrictions: [], display_order: 2 },
  ],
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
      id: 9813, register_id: 9801, company_id: 1, person_id: 9301,
      local_work_date: '2026-08-17', starts_at: '2026-08-17T04:30:00Z', ends_at: '2026-08-17T10:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: null,
      watch_group: null, comment: 'Données de démonstration du registre', author_user_id: 'preview-user',
      author_person_id: 9301, source_type: 'excel_import', source_reference: 'Arthur DEMO - 2026.xlsm', source_record_key: 'preview:3051:1',
      voided_at: null,
    },
    {
      id: 9814, register_id: 9801, company_id: 1, person_id: 9301,
      local_work_date: '2026-08-17', starts_at: '2026-08-17T10:30:00Z', ends_at: '2026-08-17T18:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: null,
      watch_group: null, comment: 'Données de démonstration du registre', author_user_id: 'preview-user',
      author_person_id: 9301, source_type: 'excel_import', source_reference: 'Arthur DEMO - 2026.xlsm', source_record_key: 'preview:3051:2',
      voided_at: null,
    },
    {
      id: 9815, register_id: 9801, company_id: 1, person_id: 9301,
      local_work_date: '2026-08-18', starts_at: '2026-08-18T06:30:00Z', ends_at: '2026-08-18T12:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: null,
      watch_group: null, comment: 'Données de démonstration du registre', author_user_id: 'preview-user',
      author_person_id: 9301, source_type: 'excel_import', source_reference: 'Arthur DEMO - 2026.xlsm', source_record_key: 'preview:3052:1',
      voided_at: null,
    },
    {
      id: 9816, register_id: 9801, company_id: 1, person_id: 9301,
      local_work_date: '2026-08-18', starts_at: '2026-08-18T13:30:00Z', ends_at: '2026-08-18T17:00:00Z',
      timezone_name: 'Europe/Paris', utc_offset_minutes: 120, vessel_id: null,
      watch_group: null, comment: 'Données de démonstration du registre', author_user_id: 'preview-user',
      author_person_id: 9301, source_type: 'excel_import', source_reference: 'Arthur DEMO - 2026.xlsm', source_record_key: 'preview:3052:2',
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
    longest_rest_24h_seconds: 18000, rest_period_count_24h: 1,
    work_7d_seconds: 43200, rest_7d_seconds: 561600, night_work_24h_seconds: 0,
    is_compliant: false, violation_codes: ['consecutive_rest'], calculation_version: 1,
    calculated_at: '2026-08-03T20:01:00Z',
  }, {
    id: 9822, company_id: 1, person_id: 9301, window_end: '2026-08-17T18:00:00Z',
    local_window_end_date: '2026-08-17', timezone_name: 'Europe/Paris', vessel_id: null,
    work_rest_policy_id: 9701, work_24h_seconds: 46800, rest_24h_seconds: 39600,
    longest_rest_24h_seconds: 37800, rest_period_count_24h: 2,
    work_7d_seconds: 46800, rest_7d_seconds: 558000, night_work_24h_seconds: 0,
    is_compliant: false, violation_codes: ['work_24h'], calculation_version: 1,
    calculated_at: '2026-08-17T18:00:01Z',
  }, {
    id: 9823, company_id: 1, person_id: 9301, window_end: '2026-08-18T04:30:00Z',
    local_window_end_date: '2026-08-18', timezone_name: 'Europe/Paris', vessel_id: null,
    work_rest_policy_id: 9701, work_24h_seconds: 46800, rest_24h_seconds: 39600,
    longest_rest_24h_seconds: 37800, rest_period_count_24h: 2,
    work_7d_seconds: 46800, rest_7d_seconds: 558000, night_work_24h_seconds: 0,
    is_compliant: false, violation_codes: ['work_24h'], calculation_version: 1,
    calculated_at: '2026-08-18T04:30:01Z',
  }, {
    id: 9824, company_id: 1, person_id: 9301, window_end: '2026-08-18T18:00:00Z',
    local_window_end_date: '2026-08-18', timezone_name: 'Europe/Paris', vessel_id: null,
    work_rest_policy_id: 9701, work_24h_seconds: 32400, rest_24h_seconds: 54000,
    longest_rest_24h_seconds: 45000, rest_period_count_24h: 3,
    work_7d_seconds: 79200, rest_7d_seconds: 525600, night_work_24h_seconds: 0,
    is_compliant: true, violation_codes: [], calculation_version: 1,
    calculated_at: '2026-08-18T18:00:01Z',
  }],
  working_time_day_comments: [{
    id: 9825, register_id: 9802, person_id: 9304, local_work_date: '2026-08-03',
    cause_category: 'unexpected_operation', operational_context: 'Prolongation d’une opération pont prioritaire.',
    immediate_action: 'Relève organisée et tâches non essentielles reportées.',
    compensatory_rest_plan: 'Repos compensateur de quatre heures prévu le 4 août.',
    comment: 'Écart maintenu NON CONFORME et suivi à la relève.',
    authored_by: 'preview-user', authored_by_person_id: 9301, updated_at: '2026-08-03T20:15:00Z',
  }],
  working_time_day_approvals: [],
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
    ltifr_multiplier: 1000000, trir_multiplier: 1000000, far_multiplier: 100000000,
    fac_rate_multiplier: 1000000, mtc_rate_multiplier: 1000000, rwc_rate_multiplier: 1000000,
    sofr_multiplier: 200000, french_frequency_multiplier: 1000000, french_severity_multiplier: 1000,
  }],
  hse_exposure_hours: [],
  hse_safety_events: [],
  action_type_catalog: [
    { type_key: 'action_progress', label: 'Action de Progrès - BBTM', family: 'action', hse_classification: null, tracks_exposure_rate: false, sort_order: 10, active: true },
    { type_key: 'audit_client', label: 'Audit Client', family: 'audit', hse_classification: null, tracks_exposure_rate: false, sort_order: 20, active: true },
    { type_key: 'audit_ecmid', label: 'Audit eCMID - IMCA', family: 'audit', hse_classification: null, tracks_exposure_rate: false, sort_order: 30, active: true },
    { type_key: 'audit_internal', label: 'Audit Interne - BBTM', family: 'audit', hse_classification: null, tracks_exposure_rate: false, sort_order: 40, active: true },
    { type_key: 'visit_davit', label: 'Visite Bossoir', family: 'visit', hse_classification: null, tracks_exposure_rate: false, sort_order: 60, active: true },
    { type_key: 'visit_crane', label: 'Visite Grue', family: 'visit', hse_classification: null, tracks_exposure_rate: false, sort_order: 70, active: true },
    { type_key: 'visit_hse', label: 'Visite HSE/Exploitation', family: 'visit', hse_classification: null, tracks_exposure_rate: false, sort_order: 80, active: true },
    { type_key: 'visit_radio', label: 'Visite Radio', family: 'visit', hse_classification: null, tracks_exposure_rate: false, sort_order: 90, active: true },
    { type_key: 'visit_classification', label: 'Visite Société de Classification', family: 'visit', hse_classification: null, tracks_exposure_rate: false, sort_order: 100, active: true },
    { type_key: 'fatality', label: 'Décès (FAT)', family: 'event', hse_classification: 'FAT', tracks_exposure_rate: true, sort_order: 200, active: true },
    { type_key: 'lost_time_injury', label: 'Accident avec Arrêt de Travail (LTI)', family: 'event', hse_classification: 'LWDC', tracks_exposure_rate: true, sort_order: 210, active: true },
    { type_key: 'restricted_work_case', label: 'Blessure - Travail adapté (RWC)', family: 'event', hse_classification: 'RWC', tracks_exposure_rate: true, sort_order: 220, active: true },
    { type_key: 'medical_treatment_case', label: 'Accident avec traitement médical (MTC)', family: 'event', hse_classification: 'MTC', tracks_exposure_rate: true, sort_order: 230, active: true },
    { type_key: 'first_aid_case', label: 'Accident sans arrêt de travail (FAC)', family: 'event', hse_classification: 'FAC', tracks_exposure_rate: true, sort_order: 240, active: true },
    { type_key: 'near_miss', label: 'Presque-accident', family: 'event', hse_classification: 'NEAR_MISS', tracks_exposure_rate: true, sort_order: 250, active: true },
    { type_key: 'safety_observation', label: 'Observation sécurité', family: 'event', hse_classification: 'SAFETY_OBSERVATION', tracks_exposure_rate: true, sort_order: 260, active: true },
  ],
  action_items: [
    {
      id: 9861, company_id: 1, project_id: 9001, project_sharepoint_item_id: 'preview-project-1',
      project_code: 'P901', project_title: 'Campagne Atlantique — démonstration', vessel_id: 9201,
      vessel_sharepoint_item_id: 'preview-vessel-1', vessel_name: 'M/V Démonstration', category_key: 'audit',
      action_type_key: 'audit_internal', action_type: 'Audit Interne - BBTM', audit_type: 'Audit interne',
      title: 'Contrôler la protection du poste de manœuvre', status: 'Non soldé', priority_label: 'Haute',
      deviation_type: 'Non Conformité Majeure', opened_on: '2026-07-28', due_on: '2026-08-14', closed_on: null,
      occurred_at: '2026-07-28T09:20:00+02:00', issuer_name: 'Arthur DEMO', issuer_person_id: 9301,
      issuer_signature_snapshot: { storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png' },
      owner_name: 'Luc MARTIN', auditor_name: 'Arthur DEMO', workflow_status: 'approved',
      vessel_maneuver: 'Navire à quai pendant une opération de manutention', weather_conditions: 'Vent 12 nœuds, mer belle',
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
      category_key: 'event', action_type_key: 'first_aid_case', action_type: 'Accident sans arrêt de travail (FAC)',
      audit_type: 'Indicateur QHSE', title: 'Coupure superficielle pendant une manutention', status: 'Soldé',
      priority_label: 'Normale', deviation_type: 'Remarque', opened_on: '2026-07-19', due_on: '2026-07-19',
      closed_on: '2026-07-19', occurred_at: '2026-07-19T11:35:00+02:00', issuer_name: 'Arthur DEMO', issuer_person_id: 9301,
      issuer_signature_snapshot: { storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png' },
      owner_name: 'Hugo BERNARD', auditor_name: null, workflow_status: 'closed', vessel_maneuver: 'Transit à vitesse réduite',
      weather_conditions: 'Couvert, vent faible',
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
      action_type_key: 'action_progress', action_type: 'Action de Progrès - BBTM', audit_type: 'Ronde QHSE',
      title: 'Mettre à jour le balisage de la zone grue', status: "En attente d'approbation", priority_label: 'Normale',
      deviation_type: null, opened_on: '2026-08-02', occurred_at: '2026-08-02T14:10:00+02:00', due_on: '2026-08-21', closed_on: null,
      issuer_name: 'Arthur DEMO', issuer_person_id: 9301,
      issuer_signature_snapshot: { storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png' },
      owner_name: null, auditor_name: null, workflow_status: 'pending_approval', approver_person_id: 9301,
      approval_requested_at: '2026-08-02T12:11:00Z', vessel_maneuver: 'Navire à quai', weather_conditions: 'Ensoleillé, vent 8 nœuds',
      description: 'Le balisage au sol est partiellement effacé.', corrective_action: 'Refaire le marquage et contrôler la signalétique.',
      realized_action: null, anomaly_cause: null, comments: null, level_label: 'Amélioration', location_detail: 'Pont de travail',
      photo_1_path: 'demo/action-plan-finding-lifting-zone.png',
      photo_2_path: 'demo/action-plan-finding-ppe.png', closure_photo_path: null, victim_person_id: null,
      victim_sharepoint_item_id: null, lost_days: 0, safety_event_details: {}, source_label: 'sharepoint-list-audit',
      sharepoint_list_title: "Plan d'Action", sharepoint_item_id: 'preview-action-102', source_modified_at: '2026-08-08T10:00:00Z',
    },
  ],
  action_item_assignees: [
    { id: 9881, company_id: 1, action_item_id: 9861, assignee_kind: 'person', person_id: 9303, vessel_id: null, created_at: '2026-07-28T08:30:00Z' },
    { id: 9882, company_id: 1, action_item_id: 9861, assignee_kind: 'vessel_crew', person_id: null, vessel_id: 9201, created_at: '2026-07-28T08:30:00Z' },
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
  project_billing_periods: [{
    id: 9941,
    company_id: 1,
    project_id: 9001,
    period_month: '2026-08-01',
    client_reference: 'DEMO-AOUT-2026',
    invoice_number: null,
    invoice_issued_on: null,
    invoice_sent_on: null,
    payment_due_on: null,
    paid_on: null,
    amount_ht: 0,
    comments: 'Période synthétique pour vérifier la sélection des lignes du PDF.',
    include_operations_in_pdf: true,
    include_expenses_in_pdf: true,
    include_bbtm_in_pdf: true,
    excluded_operation_keys: [],
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  }],
  project_billing_services: [{
    id: 9942,
    company_id: 1,
    project_id: 9001,
    billing_period_id: 9941,
    category: 'spread_antipollution',
    unit_amount_ht: 1250,
    quantity: 3,
    include_in_pdf: true,
    created_at: '2026-08-01T08:05:00Z',
    updated_at: '2026-08-01T08:05:00Z',
  }],
  project_chargeable_expenses: [{
    id: 9943,
    company_id: 1,
    project_id: 9001,
    billing_period_id: 9941,
    category: 'port',
    nature: null,
    supplier: 'Port de Brest — démonstration',
    invoice_date: '2026-08-05',
    invoice_number: 'DEMO-PORT-08',
    amount_ht: 850,
    amount_ttc: 1020,
    currency: 'EUR',
    quantity: 1,
    unit: 'forfait',
    comments: null,
    chargeable: true,
    included_in_client_invoice: false,
    dpr_report_id: null,
    include_in_pdf: true,
    created_at: '2026-08-05T12:00:00Z',
    updated_at: '2026-08-05T12:00:00Z',
  }],
  project_billing_documents: [],
  fleet_certificates: createPreviewFleetCertificates(),
  fleet_certificate_document_names: [
    { id: 9841, name: 'Certificat de Franc-Bord' },
    { id: 9842, name: 'Permis de Navigation' },
    { id: 9843, name: 'Certificat extincteurs' },
  ],
  fleet_certificate_versions: [],
  fleet_certificate_findings: createPreviewFleetCertificateFindings(),
  fleet_certificate_finding_attachments: createPreviewFleetFindingAttachments(),
  fleet_certificate_finding_events: createPreviewFleetFindingEvents(),
  service_providers: [{
    id: 9801,
    company_id: 1,
    name: 'SERVAUX',
    category: 'Prestataire de Service',
    service_type: 'Radeaux · Équipements incendie',
    activity: 'Maintenance et contrôle d’équipements de sécurité maritime',
    address: '5 Quai de Guinée',
    city: 'Le Havre',
    phone: '02 32 74 95 80',
    legal_form: 'SAS',
    accounting_email: null,
    company_email: 'contact@servaux.com',
    supplies: 'Radeaux de sauvetage, appareils respiratoires, équipements incendie',
    evaluation: '5',
    active: true,
    merged_into_provider_id: null,
    specialties: [
      { id: 9811, name: 'Visite Equipements Incendie', active: true },
      { id: 9812, name: 'Visite Radeaux', active: true },
    ],
    contacts: [
      { id: 9821, full_name: 'Yann DUVAL', role_label: 'Radeaux', email: 'y.duval@servaux.com', phone: '02 32 74 95 80', active: true },
      { id: 9822, full_name: 'Xavier LECOINTRE', role_label: 'Incendie', email: 'x.lecointre@servaux.com', phone: '06 00 00 00 01', active: true },
    ],
  }, {
    id: 9802,
    company_id: 1,
    name: 'DNV France SARL',
    category: 'Prestataire de Service',
    service_type: 'Classification · Paris',
    activity: 'Classification et certification maritime',
    address: '28-34 rue du Château des Rentiers',
    city: 'Paris',
    phone: '',
    legal_form: 'SARL',
    accounting_email: '',
    company_email: '',
    supplies: 'Visites de classification',
    evaluation: '',
    active: true,
    merged_into_provider_id: null,
    specialties: [{ id: 9813, name: 'Visite société de Classification', active: true }],
    contacts: [{ id: 9823, full_name: 'Mathieu BOKOBZA', role_label: 'Surveyor', email: 'mathieu.bokobza@dnv.com', phone: '06 59 67 88 32', active: true }],
  }, {
    id: 9803,
    company_id: 1,
    name: 'APAVE',
    category: 'Prestataire de Service',
    service_type: 'Visite Grue / Bossoir',
    activity: 'Contrôles réglementaires et formations',
    address: '2 rue de l’Industrie',
    city: 'Montivilliers',
    phone: '02 35 00 00 00',
    legal_form: 'SA',
    accounting_email: '',
    company_email: 'contact@apave.example',
    supplies: 'Contrôles des appareils de levage',
    evaluation: '4.5',
    active: true,
    merged_into_provider_id: null,
    specialties: [{ id: 9814, name: 'Visite Grue / Bossoir', active: true }],
    contacts: [{ id: 9824, full_name: 'Marc LEROY', role_label: 'Inspecteur', email: 'marc.leroy@apave.example', phone: '', active: true }],
  }, {
    id: 9804,
    company_id: 1,
    name: 'BUREAU VERITAS',
    category: 'Prestataire de Service',
    service_type: 'Société de classification',
    activity: 'Classification maritime',
    address: '',
    city: 'Nantes',
    phone: '',
    legal_form: 'SA',
    accounting_email: '',
    company_email: '',
    supplies: 'Visites statutaires',
    evaluation: '4',
    active: true,
    merged_into_provider_id: null,
    specialties: [{ id: 9815, name: 'Classification', active: true }],
    contacts: [
      { id: 9825, full_name: 'Claire MARTIN', role_label: 'Surveyor', email: 'claire.martin@bureauveritas.example', phone: '', active: true },
      { id: 9826, full_name: 'Paul MOREAU', role_label: 'Planification', email: '', phone: '02 40 00 00 00', active: true },
    ],
  }, {
    id: 9805,
    company_id: 1,
    name: 'ÉTABLISSEMENTS MARCHAND',
    category: 'Approvisionnement',
    service_type: 'Fuel · Dieppe',
    activity: 'Approvisionnement combustible',
    address: '',
    city: 'Dieppe',
    phone: '',
    legal_form: '',
    accounting_email: '',
    company_email: '',
    supplies: 'Gasoil marine',
    evaluation: '',
    active: true,
    merged_into_provider_id: null,
    specialties: [],
    contacts: [],
  }, {
    id: 9806,
    company_id: 1,
    name: 'Würth',
    category: 'Approvisionnement',
    service_type: 'Matériel et fournitures',
    activity: 'Fournitures industrielles',
    address: '',
    city: '',
    phone: '',
    legal_form: '',
    accounting_email: '',
    company_email: '',
    supplies: 'Outillage et consommables',
    evaluation: '',
    active: true,
    merged_into_provider_id: null,
    specialties: [],
    contacts: [],
  }],
  fleet_certificate_visits: [{
    id: 9831,
    certificate_id: 5002,
    scheduled_start: '2026-09-15T07:00:00Z',
    scheduled_end: '2026-09-15T10:00:00Z',
    location: 'Port de Cherbourg',
    purpose: 'Visite annuelle du certificat',
    notes: '',
    status: 'confirmed',
    certificate: { vessel_name: 'GOURY', category_label: '02 - Centre de Sécurité des Navires', document_title: 'Certificat de Franc-Bord' },
    assignments: [{
      provider_id: 9801,
      specialty_id: 9811,
      contact_id: 9822,
      scheduled_start: '2026-09-15T07:00:00Z',
      scheduled_end: '2026-09-15T10:00:00Z',
      provider: { id: 9801, name: 'SERVAUX' },
      specialty: { id: 9811, name: 'Visite Equipements Incendie' },
      contact: { id: 9822, full_name: 'Xavier LECOINTRE' },
    }],
  }],
  qhse_service_notes: [{
    id: 9001, company_id: 1, chronology_code: 'NS 08-26', subject: 'Consignes de sécurité avant appareillage',
    body: 'Bonjour,\n\nAvant chaque appareillage, le capitaine confirme la tenue du briefing sécurité, la fermeture des accès et la disponibilité des équipements d’urgence.\n\nMerci de lire les références jointes avant de signer cette note.\n\nBien cordialement,',
    scope: 'all_accounts', vessel_id: 1, vessel: { name: 'GOURY', acronym: 'GRY' }, status: 'published',
    author_person_id: 9301, author_identity_snapshot: { display_name: 'Arthur DEMO', first_name: 'Arthur', last_name: 'DEMO' },
    author_signature_snapshot: { signature_id: 9831, signer_person_id: 9301, signer_user_id: 'preview-user', signer_name: 'Arthur DEMO', signed_at: '2026-09-01T09:15:00Z', version_number: 1, storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png', sha256: 'a'.repeat(64) },
    authored_on: '2026-09-01', published_at: '2026-09-01T09:15:00Z', published_by: 'preview-user',
    source_kind: 'seapilot', source_file_name: null, source_web_url: null, source_modified_at: null,
    created_by: 'preview-user', created_at: '2026-09-01T08:30:00Z', updated_at: '2026-09-01T09:15:00Z',
  }, {
    id: 9002, company_id: 1, chronology_code: '', subject: 'Mise à jour du DUP de KROKDUR',
    body: 'Note de service historique importée depuis SharePoint.', scope: 'all_accounts', vessel_id: null, vessel: null,
    status: 'draft', author_person_id: null, author_identity_snapshot: { display_name: 'Import SharePoint' }, author_signature_snapshot: {},
    authored_on: '2026-09-01', published_at: null, published_by: null,
    source_kind: 'sharepoint', source_file_name: 'NS 07-26 - Mise à jour du DUP.docx',
    source_web_url: 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2007-26%20-%20Mise%20%C3%A0%20jour%20du%20DUP.docx?web=1',
    source_modified_at: '2026-09-01T14:35:28Z', created_by: 'preview-user', created_at: '2026-09-01T14:35:28Z', updated_at: '2026-09-01T14:35:28Z',
  }, {
    id: 9003, company_id: 1, chronology_code: '', subject: 'Organisation des exercices trimestriels',
    body: 'Bonjour,\n\nPrécisez ici les consignes de la prochaine note de service.\n\nBien cordialement,', scope: 'all_accounts',
    vessel_id: null, vessel: null, status: 'draft', author_person_id: 9301,
    author_identity_snapshot: { display_name: 'Arthur DEMO', first_name: 'Arthur', last_name: 'DEMO' }, author_signature_snapshot: {},
    authored_on: '2026-09-02', published_at: null, published_by: null, source_kind: 'seapilot', source_file_name: null,
    source_web_url: null, source_modified_at: null, created_by: 'preview-user', created_at: '2026-09-02T08:30:00Z', updated_at: '2026-09-02T10:05:00Z',
  }, {
    id: 9004, company_id: 1, chronology_code: '', subject: 'Politique d’accès aux zones techniques',
    body: 'Cette note a été rappelée. Elle reste consultable par Administration et Direction avant une éventuelle nouvelle diffusion.',
    scope: 'all_accounts', vessel_id: 1, vessel: { name: 'GOURY', acronym: 'GRY' }, status: 'recalled',
    author_person_id: 9301, author_identity_snapshot: { display_name: 'Arthur DEMO', first_name: 'Arthur', last_name: 'DEMO' },
    author_signature_snapshot: { signature_id: 9831, signer_person_id: 9301, signer_user_id: 'preview-user', signer_name: 'Arthur DEMO', signed_at: '2026-08-30T09:15:00Z', version_number: 1, storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png', sha256: 'c'.repeat(64) },
    authored_on: '2026-08-30', published_at: '2026-08-30T09:15:00Z', published_by: 'preview-user',
    last_recalled_at: '2026-09-02T13:30:00Z', last_recalled_by: 'preview-user', last_recalled_chronology_code: 'NS 07-26',
    source_kind: 'seapilot', source_file_name: null, source_web_url: null, source_modified_at: null,
    created_by: 'preview-user', created_at: '2026-08-30T08:30:00Z', updated_at: '2026-09-02T13:30:00Z',
  }],
  qhse_service_note_attachments: [{
    id: 9051, company_id: 1, note_id: 9001, attachment_kind: 'procedure',
    display_name: 'GEN 01-A - Manuel Qualité Santé Sécurité Environnement', storage_bucket: null, storage_path: null,
    external_url: '/modules/procedures?document=8201', linked_record_id: 8201, mime_type: null, file_size_bytes: null, sort_order: 0,
  }, {
    id: 9052, company_id: 1, note_id: 9001, attachment_kind: 'fleet_certificate',
    display_name: 'Permis de Navigation', storage_bucket: null, storage_path: null,
    external_url: '/modules/certificates?certificate=5001', linked_record_id: 5001, mime_type: null, file_size_bytes: null, sort_order: 1,
  }],
  qhse_service_note_recipients: [
    { id: 9062, company_id: 1, note_id: 9001, user_id: 'preview-direction', person_id: 9302, first_name_snapshot: 'Camille', last_name_snapshot: 'DURAND', function_snapshot: 'Direction' },
    { id: 9063, company_id: 1, note_id: 9001, user_id: 'preview-marin', person_id: 9303, first_name_snapshot: 'Luc', last_name_snapshot: 'MARTIN', function_snapshot: 'Marin' },
  ],
  qhse_service_note_target_vessels: [],
  qhse_service_note_target_people: [],
  qhse_service_note_signatures: [{
    id: 9071, company_id: 1, note_id: 9001, recipient_id: 9062, user_id: 'preview-direction', person_id: 9302,
    identity_snapshot: { first_name: 'Camille', last_name: 'DURAND', function_label: 'Direction' }, signature_version_id: 9831,
    signature_snapshot: { signature_id: 9831, signer_person_id: 9302, signer_user_id: 'preview-direction', signer_name: 'Camille DURAND', signed_at: '2026-09-01T10:02:00Z', version_number: 1, storage_bucket: 'working-time-signatures', storage_path: '1/9302/preview.png', mime_type: 'image/png', sha256: 'b'.repeat(64) },
    signed_at: '2026-09-01T10:02:00Z', read_confirmed: true, signature_kind: 'captured',
  }],
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
  if (functionName === 'service_note_targeting_options') {
    const note = previewRows('qhse_service_notes').find((row) => Number(row.id) === Number(args.p_note_id));
    if (!note) return createPreviewQuery({ data: null, error: { message: 'Brouillon de démonstration introuvable.' } });
    return createPreviewQuery({
      data: {
        date: String(args.p_on_date || note.authored_on || ''),
        people: [
          { id: 9302, first_name: 'Camille', last_name: 'DURAND', function_label: 'Direction', hired_on: '2020-01-01', departed_on: null, vessel_ids: [2] },
          { id: 9303, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', hired_on: '2022-05-01', departed_on: null, vessel_ids: [1] },
          { id: 9304, first_name: 'Hugo', last_name: 'BERNARD', function_label: 'Matelot', hired_on: '2024-03-01', departed_on: null, vessel_ids: [1] },
        ],
        vessels: previewRows('vessels').filter((row) => row.active).map((row) => ({
          id: row.id,
          name: row.name,
          recipient_count: Number(row.id) === 1 ? 2 : Number(row.id) === 2 ? 1 : 0,
        })),
      },
      error: null,
    });
  }
  if (functionName === 'save_service_note_draft') {
    const note = previewRows('qhse_service_notes').find((row) => Number(row.id) === Number(args.p_note_id) && row.status === 'draft');
    if (!note) return createPreviewQuery({ data: null, error: { message: 'SERVICE_NOTE_DRAFT_FORBIDDEN.' } });
    note.subject = String(args.p_subject || '');
    note.body = String(args.p_body || '');
    note.authored_on = String(args.p_authored_on || note.authored_on || '');
    note.scope = String(args.p_scope || 'all_accounts');
    note.chronology_code = '';
    note.updated_at = new Date().toISOString();
    const vessels = previewRows('qhse_service_note_target_vessels');
    const people = previewRows('qhse_service_note_target_people');
    for (let index = vessels.length - 1; index >= 0; index -= 1) if (Number(vessels[index].note_id) === Number(note.id)) vessels.splice(index, 1);
    for (let index = people.length - 1; index >= 0; index -= 1) if (Number(people[index].note_id) === Number(note.id)) people.splice(index, 1);
    if (note.scope === 'vessels') (Array.isArray(args.p_vessel_ids) ? args.p_vessel_ids : []).forEach((id) => vessels.push({ note_id: note.id, vessel_id: Number(id), vessel: previewVessel(Number(id)) }));
    if (note.scope === 'people') (Array.isArray(args.p_person_ids) ? args.p_person_ids : []).forEach((id) => people.push({ note_id: note.id, person_id: Number(id) }));
    return createPreviewQuery({ data: note.id, error: null });
  }
  if (functionName === 'recall_service_note') {
    const note = previewRows('qhse_service_notes').find((row) => Number(row.id) === Number(args.p_note_id));
    const latest = previewRows('qhse_service_notes')
      .filter((row) => row.status === 'published')
      .sort((left, right) => new Date(String(right.published_at)).getTime() - new Date(String(left.published_at)).getTime())[0];
    if (!note || note.status !== 'published' || note.id !== latest?.id) {
      return createPreviewQuery({ data: null, error: { message: 'SERVICE_NOTE_RECALL_LATEST_ONLY.' } });
    }
    note.last_recalled_chronology_code = note.chronology_code;
    note.chronology_code = '';
    note.status = 'recalled';
    note.last_recalled_at = new Date().toISOString();
    note.last_recalled_by = 'preview-user';
    note.updated_at = new Date().toISOString();
    return createPreviewQuery({ data: note.id, error: null });
  }
  if (functionName === 'publish_service_note') {
    const note = previewRows('qhse_service_notes').find((row) => Number(row.id) === Number(args.p_note_id));
    if (!note || !['draft', 'recalled'].includes(String(note.status))) {
      return createPreviewQuery({ data: null, error: { message: 'SERVICE_NOTE_PUBLISH_FORBIDDEN.' } });
    }
    const year = new Date().getFullYear().toString().slice(-2);
    const sequence = Math.max(0, ...previewRows('qhse_service_notes').filter((row) => row.id !== note.id).map((row) => {
      const match = String(row.chronology_code || '').match(new RegExp(`^NS (\\d+)-${year}`));
      return match ? Number(match[1]) : 0;
    })) + 1;
    note.chronology_code = `NS ${String(sequence).padStart(2, '0')}-${year}`;
    note.status = 'published';
    note.published_at = new Date().toISOString();
    note.published_by = 'preview-user';
    note.source_kind = 'seapilot';
    note.updated_at = new Date().toISOString();
    return createPreviewQuery({ data: note.id, error: null });
  }
  if (functionName === 'delete_service_note_draft') {
    const notes = previewRows('qhse_service_notes');
    const noteIndex = notes.findIndex((row) => Number(row.id) === Number(args.p_note_id) && row.status === 'draft');
    if (noteIndex < 0) return createPreviewQuery({ data: null, error: { message: 'SERVICE_NOTE_DELETE_DRAFT_FORBIDDEN.' } });
    const [deleted] = notes.splice(noteIndex, 1);
    const attachments = previewRows('qhse_service_note_attachments');
    for (let index = attachments.length - 1; index >= 0; index -= 1) {
      if (Number(attachments[index].note_id) === Number(deleted.id)) attachments.splice(index, 1);
    }
    return createPreviewQuery({ data: deleted.id, error: null });
  }
  if (functionName === 'action_item_create') {
    const vessel = previewRows('vessels').find((row) => Number(row.id) === Number(args.p_vessel_id));
    const type = previewRows('action_type_catalog').find((row) => row.type_key === args.p_action_type_key);
    const actionId = nextPreviewId('action_items', 9900);
    const action = {
      id: actionId,
      company_id: 1,
      project_id: null,
      project_sharepoint_item_id: null,
      project_code: null,
      project_title: null,
      vessel_id: vessel?.id || null,
      vessel_sharepoint_item_id: null,
      vessel_name: vessel?.name || '',
      category_key: type?.family || 'event',
      action_type_key: type?.type_key || String(args.p_action_type_key || ''),
      action_type: type?.label || '',
      audit_type: null,
      title: String(args.p_title || ''),
      status: "En attente d'approbation",
      priority_label: 'Normale',
      deviation_type: args.p_deviation_type || null,
      opened_on: String(args.p_occurred_at || '').slice(0, 10),
      occurred_at: args.p_occurred_at || new Date().toISOString(),
      due_on: args.p_due_on || null,
      closed_on: null,
      issuer_name: 'Arthur DEMO',
      issuer_person_id: 9301,
      issuer_signature_snapshot: { storage_bucket: 'working-time-signatures', storage_path: '1/9301/preview.png', mime_type: 'image/png' },
      owner_name: null,
      auditor_name: null,
      workflow_status: 'pending_approval',
      approver_person_id: 9301,
      approval_requested_at: new Date().toISOString(),
      vessel_maneuver: args.p_vessel_maneuver || null,
      weather_conditions: args.p_weather_conditions || null,
      description: args.p_description || null,
      corrective_action: args.p_corrective_action || null,
      realized_action: null,
      anomaly_cause: null,
      comments: null,
      level_label: null,
      location_detail: null,
      photo_1_path: null,
      photo_2_path: null,
      closure_photo_path: null,
      victim_person_id: null,
      victim_sharepoint_item_id: null,
      lost_days: Number(args.p_lost_days || 0),
      safety_event_details: {},
      source_label: 'seapilot',
      sharepoint_list_title: null,
      sharepoint_item_id: null,
      source_modified_at: new Date().toISOString(),
    };
    PREVIEW_ROWS.action_items.unshift(action);
    return createPreviewQuery({ data: action, error: null });
  }
  if (functionName === 'action_item_attach_finding_photos') {
    const action = previewRows('action_items').find((row) => Number(row.id) === Number(args.p_action_id));
    if (!action) return createPreviewQuery({ data: null, error: { message: 'Rapport introuvable.' } });
    action.photo_1_path = args.p_photo_1_path || null;
    action.photo_2_path = args.p_photo_2_path || null;
    return createPreviewQuery({ data: action, error: null });
  }
  if (functionName === 'action_item_approve') {
    const action = previewRows('action_items').find((row) => Number(row.id) === Number(args.p_action_id));
    if (!action) return createPreviewQuery({ data: null, error: { message: 'Rapport introuvable.' } });
    const personIds = Array.isArray(args.p_person_ids) ? args.p_person_ids.map(Number) : [];
    const vesselIds = Array.isArray(args.p_vessel_ids) ? args.p_vessel_ids.map(Number) : [];
    const personNames = previewRows('people').filter((person) => personIds.includes(Number(person.id)))
      .map((person) => `${person.first_name} ${person.last_name}`.trim());
    const vesselNames = previewRows('vessels').filter((vesselRow) => vesselIds.includes(Number(vesselRow.id)))
      .map((vesselRow) => `Équipage — ${vesselRow.name}`);
    action.anomaly_cause = args.p_anomaly_cause || null;
    action.owner_name = [...personNames, ...vesselNames].join(', ');
    action.workflow_status = 'approved';
    action.status = 'Ecart Non Soldé';
    action.approved_by_person_id = 9301;
    action.approved_at = new Date().toISOString();
    personIds.forEach((personId) => PREVIEW_ROWS.action_item_assignees.push({
      id: nextPreviewId('action_item_assignees', 9950), company_id: 1, action_item_id: action.id,
      assignee_kind: 'person', person_id: personId, vessel_id: null, created_at: new Date().toISOString(),
    }));
    vesselIds.forEach((vesselId) => PREVIEW_ROWS.action_item_assignees.push({
      id: nextPreviewId('action_item_assignees', 9950), company_id: 1, action_item_id: action.id,
      assignee_kind: 'vessel_crew', person_id: null, vessel_id: vesselId, created_at: new Date().toISOString(),
    }));
    return createPreviewQuery({ data: action, error: null });
  }
  if (functionName === 'action_item_treat') {
    const action = previewRows('action_items').find((row) => Number(row.id) === Number(args.p_action_id));
    if (!action) return createPreviewQuery({ data: null, error: { message: 'Action introuvable.' } });
    action.comments = args.p_comments || null;
    action.realized_action = args.p_realized_action || null;
    action.closure_photo_path = args.p_closure_photo_path || action.closure_photo_path || null;
    if (args.p_close_action) {
      action.status = 'Ecart Soldé';
      action.workflow_status = 'closed';
      action.closed_on = new Date().toISOString().slice(0, 10);
    }
    return createPreviewQuery({ data: action, error: null });
  }
  if (functionName === 'create_fleet_certificate_line') {
    const vesselSource = previewRows('fleet_certificates').find((row) => Number(row.vessel_id) === Number(args.p_vessel_id));
    const categoryKey = String(args.p_category_key || '').trim();
    const categoryLabel = String(args.p_category_label || '').trim();
    const documentTitle = String(args.p_document_title || '').trim();
    const issuedOn = args.p_issued_on ? String(args.p_issued_on) : null;
    const expiresOn = args.p_expires_on ? String(args.p_expires_on) : null;
    if (!vesselSource || !categoryKey || !categoryLabel || !documentTitle) {
      return createPreviewQuery({ data: null, error: { message: 'Les informations de la ligne sont incomplètes.' } });
    }
    if (issuedOn && expiresOn && expiresOn < issuedOn) {
      return createPreviewQuery({ data: null, error: { message: 'La date d’échéance ne peut pas être antérieure à la date d’émission.' } });
    }
    const certificateId = nextPreviewId('fleet_certificates', 5200);
    const alarmOn = expiresOn ? new Date(`${expiresOn}T00:00:00Z`) : null;
    alarmOn?.setUTCDate(alarmOn.getUTCDate() - 90);
    PREVIEW_ROWS.fleet_certificates.push({
      id: certificateId,
      company_id: vesselSource.company_id,
      vessel_id: Number(args.p_vessel_id),
      vessel_name: vesselSource.vessel_name,
      vessel: vesselSource.vessel,
      category_key: categoryKey,
      category_label: categoryLabel,
      document_title: documentTitle,
      title: documentTitle,
      status: 'missing',
      issued_on: issuedOn,
      expires_on: expiresOn,
      planned_on: null,
      alarm_on: alarmOn?.toISOString().slice(0, 10) || null,
      provider_name: null,
      visit_location: null,
      workflow_status: 'not_started',
      renewal_notes: null,
      renaming_rule_key: 'vessel-title-issued-year',
      original_file_name: null,
      file_name: null,
      source_label: 'manual',
      file_url: null,
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      file_size_bytes: null,
      current_version_no: 0,
      is_active_fleet: true,
      notes: null,
      updated_at: new Date().toISOString(),
    });
    return createPreviewQuery({ data: certificateId, error: null });
  }
  if (functionName === 'update_fleet_certificate_document_metadata') {
    const certificate = previewRows('fleet_certificates').find((row) => Number(row.id) === Number(args.p_certificate_id));
    const vesselSource = previewRows('fleet_certificates').find((row) => Number(row.vessel_id) === Number(args.p_vessel_id));
    const categoryKey = String(args.p_category_key || '').trim();
    const categoryLabel = String(args.p_category_label || '').trim();
    const documentTitle = String(args.p_document_title || '').trim();
    const issuedOn = args.p_issued_on ? String(args.p_issued_on) : null;
    const expiresOn = args.p_expires_on ? String(args.p_expires_on) : null;
    if (!certificate || !vesselSource || !categoryKey || !categoryLabel || !documentTitle) {
      return createPreviewQuery({ data: null, error: { message: 'Les informations du document sont incomplètes.' } });
    }
    if (issuedOn && expiresOn && expiresOn < issuedOn) {
      return createPreviewQuery({ data: null, error: { message: 'La date d’échéance ne peut pas être antérieure à la date d’émission.' } });
    }
    const today = new Date().toISOString().slice(0, 10);
    const renewalLimit = new Date(`${today}T00:00:00Z`);
    renewalLimit.setUTCDate(renewalLimit.getUTCDate() + 90);
    const specialStatus = certificate.status === 'missing' || certificate.status === 'pending_validation';
    certificate.vessel_id = Number(args.p_vessel_id);
    certificate.vessel_name = vesselSource.vessel_name;
    certificate.vessel = vesselSource.vessel;
    certificate.category_key = categoryKey;
    certificate.category_label = categoryLabel;
    certificate.document_title = documentTitle;
    certificate.title = documentTitle;
    certificate.issued_on = issuedOn;
    certificate.expires_on = expiresOn;
    if (!specialStatus) {
      certificate.status = !expiresOn ? 'valid' : expiresOn < today ? 'expired' : expiresOn <= renewalLimit.toISOString().slice(0, 10) ? 'renew_due' : 'valid';
    }
    if (expiresOn) {
      const alarmOn = new Date(`${expiresOn}T00:00:00Z`);
      alarmOn.setUTCDate(alarmOn.getUTCDate() - 90);
      certificate.alarm_on = alarmOn.toISOString().slice(0, 10);
    } else {
      certificate.alarm_on = null;
    }
    certificate.updated_at = new Date().toISOString();
    return createPreviewQuery({ data: certificate.id, error: null });
  }
  if (functionName === 'save_fleet_certificate_visit') {
    const certificate = previewRows('fleet_certificates').find((row) => Number(row.id) === Number(args.p_certificate_id));
    const assignments = (Array.isArray(args.p_assignments) ? args.p_assignments : []) as Array<Record<string, unknown>>;
    if (!certificate || !assignments.length) return createPreviewQuery({ data: null, error: { message: 'Visite de démonstration invalide.' } });
    const visitId = nextPreviewId('fleet_certificate_visits', 9831);
    PREVIEW_ROWS.fleet_certificate_visits.push({
      id: visitId,
      certificate_id: certificate.id,
      scheduled_start: args.p_scheduled_start,
      scheduled_end: args.p_scheduled_end,
      location: args.p_location,
      purpose: args.p_purpose,
      notes: args.p_notes,
      status: 'planned',
      certificate: {
        vessel_name: certificate.vessel_name,
        category_label: certificate.category_label,
        document_title: certificate.document_title,
      },
      assignments: assignments.map((assignment) => {
        const provider = previewRows('service_providers').find((row) => Number(row.id) === Number(assignment.providerId));
        const specialties = (provider?.specialties || []) as Array<Record<string, unknown>>;
        const contacts = (provider?.contacts || []) as Array<Record<string, unknown>>;
        const specialty = specialties.find((row) => Number(row.id) === Number(assignment.specialtyId));
        const contact = contacts.find((row) => Number(row.id) === Number(assignment.contactId));
        return {
          provider_id: provider?.id,
          specialty_id: specialty?.id,
          contact_id: contact?.id || null,
          scheduled_start: assignment.scheduledStart,
          scheduled_end: assignment.scheduledEnd,
          provider: { id: provider?.id, name: provider?.name },
          specialty: { id: specialty?.id, name: specialty?.name },
          contact: contact ? { id: contact.id, full_name: contact.full_name } : null,
        };
      }),
    });
    return createPreviewQuery({ data: visitId, error: null });
  }
  if (functionName === 'refresh_planning_notifications' || functionName === 'refresh_working_time_notifications') {
    return createPreviewQuery({ data: 0, error: null });
  }
  if (functionName === 'ensure_working_time_registers_for_period') {
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
  if (functionName === 'refresh_hse_exposure_hours') {
    return createPreviewQuery({ data: { actual_days: 156, planning_days: 0, methodology_id: 9851 }, error: null });
  }
  if (functionName === 'hse_kpi_summary') {
    const endDate = new Date(`${String(args.p_ends_on || '2026-08-09')}T00:00:00Z`);
    const month = Math.max(1, Math.min(12, endDate.getUTCMonth() + 1));
    const exposureHours = 1560 * month;
    const lwdc = month >= 4 ? 1 : 0;
    const rwc = month >= 5 ? 1 : 0;
    const mtc = month >= 6 ? 2 : month >= 3 ? 1 : 0;
    const fac = month >= 7 ? 3 : month >= 5 ? 2 : month >= 2 ? 1 : 0;
    const nearMiss = Math.min(8, month);
    const observations = month * 5;
    const lostDays = lwdc ? 12 : 0;
    return createPreviewQuery({ data: {
      methodology_id: 9851, methodology_version: '2026-08', exposure_hours: exposureHours,
      FAT: 0, LWDC: lwdc, RWC: rwc, MTC: mtc, FAC: fac, near_miss: nearMiss, safety_observation: observations,
      lost_days: lostDays, LTI: lwdc,
      LTIFR: lwdc * 1000000 / exposureHours,
      TRIR: (lwdc + rwc + mtc) * 1000000 / exposureHours,
      FAR: 0,
      FAC_rate: fac * 1000000 / exposureHours,
      MTC_rate: mtc * 1000000 / exposureHours,
      RWC_rate: rwc * 1000000 / exposureHours,
      SOFR: observations * 200000 / exposureHours,
      french_frequency_rate: lwdc * 1000000 / exposureHours,
      french_severity_rate: lostDays * 1000 / exposureHours,
      configuration_complete: true,
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
        project: { id: 9001, code: 'P-DEMO', title: 'Projet de démonstration' },
        watchGroup: 'Bordée 1',
        people,
        crewPersonIds: [9301, 9303, 9304],
      },
      error: null,
    });
  }
  if (functionName === 'dpr_validator_context') {
    const captain = previewRows('people').find((person) => person.id === 9301);
    return createPreviewQuery({
      data: {
        defaultValidatorPersonId: 9301,
        people: captain ? [{
          id: captain.id,
          firstName: captain.first_name,
          lastName: captain.last_name,
          functionLabel: captain.function_label,
          gradeLabel: captain.grade_label,
          roleLabel: captain.role_label,
          isDprValidator: true,
        }] : [],
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
  if (functionName === 'projects_contracts') {
    return createPreviewQuery({ data: previewRows('project_contracts'), error: null });
  }
  if (functionName === 'projects_towed_assets') {
    return createPreviewQuery({ data: previewRows('project_towed_assets'), error: null });
  }
  if (functionName === 'projects_save_towed_asset') {
    const requestedId = Number(args.target_towed_asset_id || 0);
    let asset = previewRows('project_towed_assets').find((row) => Number(row.id) === requestedId);
    if (!asset) {
      asset = { id: nextPreviewId('project_towed_assets', 9351), active: true };
      PREVIEW_ROWS.project_towed_assets.push(asset);
    }
    Object.assign(asset, {
      name: String(args.target_name || ''),
      asset_type: args.target_asset_type || null,
      length_overall_m: args.target_length_overall_m ?? null,
      breadth_overall_m: args.target_breadth_overall_m ?? null,
      max_draft_m: args.target_max_draft_m ?? null,
      light_displacement_t: args.target_light_displacement_t ?? null,
      flag: args.target_flag || null,
      classification_society: args.target_classification_society || null,
      registration_number: args.target_registration_number || null,
      owner_name: args.target_owner_name || null,
      hull_machinery_insurer: args.target_hull_machinery_insurer || null,
      liability_insurer: args.target_liability_insurer || null,
      photo_url: args.target_photo_url || null,
      photo_storage_path: args.target_photo_storage_path || null,
    });
    return createPreviewQuery({ data: asset.id, error: null });
  }
  if (functionName === 'projects_archive_towed_asset') {
    const asset = previewRows('project_towed_assets').find(
      (row) => Number(row.id) === Number(args.target_towed_asset_id),
    );
    if (asset) asset.active = false;
    return createPreviewQuery({ data: null, error: null });
  }
  if (functionName === 'projects_planning_occurrences') {
    return createPreviewQuery({
      data: previewRows('planning_projects').map((occurrence) => ({
        ...occurrence,
        vessel_ids: [occurrence.primary_vessel_id, occurrence.secondary_vessel_id].filter(Boolean),
        vessel_names: [occurrence.primary_vessel_name, occurrence.secondary_vessel_name].filter(Boolean),
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
  if (functionName === 'clients_save') {
    const requestedId = Number(args.target_client_id || 0);
    let client = previewRows('clients').find((row) => Number(row.id) === requestedId);
    if (!client) {
      client = {
        id: nextPreviewId('clients', 9102),
        archived_at: null,
        sharepoint_item_id: null,
        sharepoint_list_title: null,
        source_label: 'seapilot-preview',
        source_modified_at: null,
      };
      PREVIEW_ROWS.clients.push(client);
    }
    Object.assign(client, {
      name: String(args.target_name || ''),
      represented_by: args.target_represented_by || null,
      code: args.target_code || null,
      email: args.target_email || null,
      phone: args.target_phone || null,
      address: args.target_address || null,
      postal_code: args.target_postal_code || null,
      city: args.target_city || null,
      country: args.target_country || null,
      website: args.target_website || null,
      logo_url: args.target_logo_url || null,
      logo_storage_path: args.target_logo_storage_path || null,
      active: args.target_active !== false,
      updated_at: new Date().toISOString(),
    });
    return createPreviewQuery({ data: client, error: null });
  }
  if (functionName === 'clients_archive') {
    const client = previewRows('clients').find((row) => Number(row.id) === Number(args.target_client_id));
    if (client) {
      client.active = false;
      client.archived_at = new Date().toISOString();
    }
    return createPreviewQuery({ data: null, error: null });
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
  functions: {
    invoke: (functionName: string, options?: { body?: Record<string, unknown> }) => {
      if (functionName === 'admin-invite-user') {
        const email = String(options?.body?.email || '').toLowerCase();
        return Promise.resolve({
          data: email === 'quota-demo@bbtm.fr'
            ? {
                invitation: { invitationId: 9901 },
                delivery: 'manual_link',
                activationLink: 'https://preview.supabase.invalid/auth/v1/verify?token=preview-only',
              }
            : { invitation: { invitationId: 9901 }, delivery: 'email', activationLink: null },
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: PREVIEW_WRITE_ERROR });
    },
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: (path: string) => Promise.resolve({
        data: {
          signedUrl: bucket === 'fleet-certificates'
            ? '/demo/action-plan-closure-proof.webp'
            : bucket === 'working-time-signatures'
              ? `data:image/png;base64,${PREVIEW_SIGNATURE_PNG_BASE64}`
            : bucket === 'project-catalog-media'
              ? path.startsWith('clients/') ? '/bbtm-logo.png' : '/vessels/goury.jpg'
              : '',
        },
        error: null,
      }),
      createSignedUrls: (paths: string[]) => Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: path.startsWith('demo/') ? `/${path}` : '' })), error: null,
      }),
      download: () => Promise.resolve({ data: previewSignaturePng(), error: null }),
      upload: (_path: string, _file: Blob, options?: { contentType?: string }) => (
        bucket === 'project-catalog-media'
        || (bucket === 'working-time-imports' && options?.contentType === 'application/vnd.ms-excel.sheet.macroEnabled.12')
      )
        ? Promise.resolve({ data: { path: _path }, error: null })
        : Promise.resolve({ data: null, error: PREVIEW_WRITE_ERROR }),
      remove: () => bucket === 'project-catalog-media' || bucket === 'service-note-files'
        ? Promise.resolve({ data: [], error: null })
        : Promise.resolve({ data: null, error: PREVIEW_WRITE_ERROR }),
    }),
  },
} as unknown as SupabaseClient;
