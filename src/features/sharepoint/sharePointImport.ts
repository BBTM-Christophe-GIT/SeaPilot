import { getSharePointSourceByKey, type SharePointMigrationSource } from './sharePointInventory.ts';

type SharePointPrimitive = string | number | boolean | null;
type SharePointFieldObject = Record<string, unknown>;
type SharePointFieldValue = SharePointPrimitive | SharePointFieldObject | SharePointFieldValue[];
type SharePointFields = Record<string, SharePointFieldValue | undefined>;
type SharePointImportRow = Record<string, string | number | boolean | null>;

export interface SharePointListItem {
  id?: string | number;
  webUrl?: string;
  fields?: SharePointFields;
  [key: string]: SharePointFieldValue | SharePointFields | undefined;
}

export interface SharePointUpsertBatch {
  sourceKey: string;
  targetTable: string;
  conflictColumns: readonly string[];
  rows: SharePointImportRow[];
}

export interface SharePointUpsertResult {
  sourceKey: string;
  targetTable: string;
  rowCount: number;
}

export interface SharePointExportSource {
  sourceKey: string;
  items: SharePointListItem[];
}

export interface SharePointExportBundle {
  exportedAt?: string;
  sources: SharePointExportSource[];
}

export interface SharePointImportReport {
  totalSources: number;
  totalRows: number;
  results: SharePointUpsertResult[];
}

export interface SharePointSupabaseClient {
  from?(table: string): {
    upsert(
      rows: SharePointImportRow[],
      options: {
        onConflict: string;
      },
    ): Promise<{
      error: unknown;
    }>;
  };
  rpc?(functionName: string): Promise<{
    data: unknown;
    error: unknown;
  }>;
}

interface SharePointPlanningLinkResolutionRow {
  target_table: string;
  resolved_people: number;
  resolved_vessels: number;
}

interface SharePointHrDocumentLinkResolutionRow {
  target_table: string;
  resolved_documents: number;
}

interface SharePointFleetCertificateLinkResolutionRow {
  target_table: string;
  resolved_certificates: number;
}

interface SharePointPublishedProcedureLinkResolutionRow {
  target_table: string;
  resolved_publications: number;
}

interface SharePointProjectLinkResolutionRow {
  target_table: string;
  resolved_clients: number;
  resolved_vessels: number;
}

interface SharePointProjectDocumentLinkResolutionRow {
  target_table: string;
  resolved_documents: number;
}

interface SharePointDprLinkResolutionRow {
  target_table: string;
  resolved_projects: number;
  resolved_vessels: number;
  resolved_dpr_items: number;
}

interface SharePointOperationLinkResolutionRow {
  target_table: string;
  resolved_projects: number;
  resolved_vessels: number;
  resolved_actions: number;
}

interface SharePointDocumentLinkResolutionRow {
  target_table: string;
  resolved_people: number;
  resolved_vessels: number;
}

export interface SharePointPlanningLinkResolution {
  targetTable: string;
  resolvedPeople: number;
  resolvedVessels: number;
}

export interface SharePointHrDocumentLinkResolution {
  targetTable: string;
  resolvedDocuments: number;
}

export interface SharePointFleetCertificateLinkResolution {
  targetTable: string;
  resolvedCertificates: number;
}

export interface SharePointPublishedProcedureLinkResolution {
  targetTable: string;
  resolvedPublications: number;
}

export interface SharePointProjectLinkResolution {
  targetTable: string;
  resolvedClients: number;
  resolvedVessels: number;
}

export interface SharePointProjectDocumentLinkResolution {
  targetTable: string;
  resolvedDocuments: number;
}

export interface SharePointDprLinkResolution {
  targetTable: string;
  resolvedProjects: number;
  resolvedVessels: number;
  resolvedDprItems: number;
}

export interface SharePointOperationLinkResolution {
  targetTable: string;
  resolvedProjects: number;
  resolvedVessels: number;
  resolvedActions: number;
}

export interface SharePointDocumentLinkResolution {
  targetTable: string;
  resolvedPeople: number;
  resolvedVessels: number;
}

type SourcePayloadMapper = (item: SharePointListItem, source: SharePointMigrationSource) => SharePointImportRow;

const CONFLICT_COLUMNS = ['sharepoint_list_id', 'sharepoint_item_id'] as const;

const SOURCE_MAPPERS: Record<string, SourcePayloadMapper> = {
  'library-alerte-securite': mapGenericDocumentPayload,
  'library-archive-documentaire': mapGenericDocumentPayload,
  'library-brevets-visites-medicales': mapHrDocumentPayload,
  'library-certificats-flotte': mapFleetCertificatePayload,
  'library-documentation-technique': mapGenericDocumentPayload,
  'library-documents-contractuels': mapContractDocumentPayload,
  'library-documents-partages': mapGenericDocumentPayload,
  'library-documents-projets': mapProjectDocumentPayload,
  'library-dpr': mapDprArchivePayload,
  'library-fiche-progres': mapActionDocumentPayload,
  'library-fiche-navire-equipement': mapGenericDocumentPayload,
  'library-logos-systeme': mapGenericDocumentPayload,
  'library-notes-service': mapGenericDocumentPayload,
  'library-permis-travail': mapGenericDocumentPayload,
  'library-qsms': mapProcedurePayload,
  'library-qsms-pdf': mapPublishedProcedurePayload,
  'library-registre-apparaux-levage': mapGenericDocumentPayload,
  'library-suivi-temps-travail': mapGenericDocumentPayload,
  'library-vehicules': mapGenericDocumentPayload,
  'list-audit': mapActionItemPayload,
  'list-bbtm-clients': mapClientPayload,
  'list-rh-personnel-bbtm': mapPersonPayload,
  'list-bbtm-projets': mapProjectPayload,
  'list-bbtm-flotte': mapVesselPayload,
  'list-demande-achat': mapPurchaseRequestPayload,
  'list-indicateurs-projet-p144emdt': mapDprItemPayload,
  'list-mgo': mapMgoPricePayload,
  'list-smtr-journees-planning': mapPlanningDayPayload,
  'list-smtr-planning-periodes': mapPlanningPeriodPayload,
  'list-kpi-projets-planning': mapPlanningProjectPayload,
};

function fieldsFor(item: SharePointListItem): SharePointFields {
  return item.fields || item;
}

function fieldValue(item: SharePointListItem, aliases: string[]): SharePointFieldValue | undefined {
  const fields = fieldsFor(item);

  for (const alias of aliases) {
    if (fields[alias] !== undefined) {
      return fields[alias];
    }
  }

  return undefined;
}

function stringifyValue(value: SharePointFieldValue | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const values = value.map((entry) => stringifyValue(entry)).filter((entry): entry is string => Boolean(entry));
    return values.length > 0 ? values.join('; ') : null;
  }

  if (typeof value === 'object') {
    const objectValue = value as SharePointFieldObject;
    const candidate =
      objectValue.LookupValue ??
      objectValue.lookupValue ??
      objectValue.Email ??
      objectValue.email ??
      objectValue.Url ??
      objectValue.url ??
      objectValue.Description ??
      objectValue.description;
    return stringifyValue(candidate as SharePointFieldValue | undefined);
  }

  return String(value).trim() || null;
}

function text(item: SharePointListItem, aliases: string[]): string | null {
  return stringifyValue(fieldValue(item, aliases));
}

function requiredText(item: SharePointListItem, aliases: string[], fallback: string): string {
  return text(item, aliases) || fallback;
}

function numeric(item: SharePointListItem, aliases: string[]): number | null {
  const value = stringifyValue(fieldValue(item, aliases));

  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(item: SharePointListItem, aliases: string[], fallback: boolean): boolean {
  const rawValue = fieldValue(item, aliases);

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  const value = stringifyValue(rawValue)?.toLowerCase();

  if (!value) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'oui', 'actif', 'active'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'non', 'inactif', 'inactive'].includes(value)) {
    return false;
  }

  return fallback;
}

function dateOnly(item: SharePointListItem, aliases: string[]): string | null {
  const value = stringifyValue(fieldValue(item, aliases));

  if (!value) {
    return null;
  }

  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const frenchDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (frenchDate) {
    return `${frenchDate[3]}-${frenchDate[2].padStart(2, '0')}-${frenchDate[1].padStart(2, '0')}`;
  }

  return null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sourceItemId(item: SharePointListItem): string | null {
  return text(item, ['Id', 'ID']) || (item.id !== undefined ? String(item.id) : null) || text(item, ["Chemin d'accès", 'Path']);
}

function reconciliationPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return {
    sharepoint_site_url: source.siteUrl,
    sharepoint_list_id: source.listId || null,
    sharepoint_list_title: source.title,
    sharepoint_item_id: sourceItemId(item),
    sharepoint_unique_id: text(item, ['UniqueId', 'GUID', 'UniqueID']),
    sharepoint_file_ref: text(item, ['FileRef', 'ServerRelativeUrl', "Chemin d'accès", 'Path']),
    sharepoint_encoded_abs_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    source_modified_at: text(item, ['Modified', 'LastModifiedDateTime']),
  };
}

function withReconciliation(
  item: SharePointListItem,
  source: SharePointMigrationSource,
  payload: SharePointImportRow,
): SharePointImportRow {
  return {
    ...payload,
    ...reconciliationPayload(item, source),
  };
}

function mapPersonPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    first_name: requiredText(item, ['Pr_x00e9_nom', 'Prenom', 'Prénom', 'FirstName'], ''),
    last_name: requiredText(item, ['Title', 'Titre', 'Nom', 'LastName'], ''),
    email: text(item, ['Email', 'Mail']),
    function_label: text(item, ['Fonction']),
    grade_label: text(item, ['Grade']),
    role_label: text(item, ['Role', 'R_x00f4_le', 'Mono-Polyvalent']),
    register_label: text(item, ['Registre']),
    sex: text(item, ['Sexe']),
    sailor_number: text(item, ['NumerodeMarin', 'NumeroMarin', 'Numero de Marin', 'Num_x00e9_rodeMarin']),
    m365_account: text(item, ['CompteM365', 'Compte_x0020_M365', 'M365Account']),
    phone: text(item, ['N_x00b0_T_x00e9_l_x00e9_phone', 'N° Téléphone', 'Telephone', 'Phone']),
    postal_address: text(item, ['AdressePostale', 'Adresse_x0020_Postale', 'Adresse Postale', 'PostalAddress']),
    birth_date: dateOnly(item, ['DatedeNaissance', 'DateNaissance', 'Date de Naissance', 'BirthDate']),
    birth_place: text(item, ['LieudeNaissance', 'LieuNaissance', 'Lieu de naissance', 'BirthPlace']),
    identity_document_number: text(item, [
      'Num_x00e9_roIdentit_x00e9_',
      'NumeroIdentite',
      'Numéro Document Identité',
      'IdentityDocumentNumber',
    ]),
    identity_document_type: text(item, [
      'TypedeDocumentdIdentit_x00e9_',
      'TypeDocumentIdentite',
      "Type de Document d'Identité",
      'IdentityDocumentType',
    ]),
    contract_type: text(item, ['TypedeContrat', 'TypeContrat', 'Type de Contrat', 'ContractType']),
    hired_on: dateOnly(item, ['DatedEmbauche', 'DateEmbauche', "Date d'Embauche", 'HiredOn']),
    departed_on: dateOnly(item, ['Dateded_x00e9_part', 'DateDepart', 'Date de départ', 'DepartedOn']),
    departure_reason: text(item, ['Causedud_x00e9_part', 'CauseDepart', 'Cause du départ', 'DepartureReason']),
    emergency_contact_name: text(item, [
      'Pr_x00e9_nometNOMContactdUrgence',
      "Prénom et NOM Contact d'Urgence",
      'ContactUrgence',
      'EmergencyContactName',
    ]),
    emergency_contact_relationship: text(item, [
      'LienParent_x00e9_ContactdUrgence',
      'LienParenteContactUrgence',
      "Lien Parenté Contact d'Urgence",
      'EmergencyContactRelationship',
    ]),
    emergency_contact_phone: text(item, [
      'Num_x00e9_rodet_x00e9_l_x00e9_ph',
      'TelephoneUrgence',
      "Numéro de téléphone Contact d'Urgence",
      'EmergencyContactPhone',
    ]),
    emergency_contact_address: text(item, [
      'Adressecompl_x00e8_teContactdUrg',
      'AdresseContactUrgence',
      "Adresse complète Contact d'Urgence",
      'EmergencyContactAddress',
    ]),
    waist_size: numeric(item, ['A_x002d_TourdeTaille', 'A - Tour de Taille', 'TourdeTaille', 'WaistSize']),
    chest_size: numeric(item, ['B_x002d_Poitrine', 'B - Poitrine', 'Poitrine', 'ChestSize']),
    full_height_size: numeric(item, ['C_x002d_Tailletotale', 'C - Taille totale', 'TailleTotale', 'FullHeightSize']),
    inseam_size: numeric(item, ['DLongueurEntrejambe', 'D - Longueur Entrejambe', 'LongueurEntrejambe', 'InseamSize']),
    hip_size: numeric(item, ['E_x002d_TourdeHanche', 'E - Tour de Hanche', 'TourdeHanche', 'HipSize']),
    weight_kg: numeric(item, ['Poids', 'WeightKg']),
    shoe_size: numeric(item, ['Pointure', 'ShoeSize']),
    coverall_size: text(item, ['TailleCombinaison', 'Taille Combinaison', 'CoverallSize']),
    pants_size: text(item, [
      'TaillePantalon',
      'TaillePantalonHomme',
      'Taille Pantalon Homme',
      'TaillePantalonFemme',
      'Taille Pantalon Femme',
      'PantsSize',
    ]),
    jacket_size: text(item, [
      'TailleVesteHomme',
      'Taille Veste Homme',
      'TailleVesteFemme',
      'Taille Veste Femme',
      'TailleVeste',
      'JacketSize',
    ]),
    deck_certificate_label: text(item, ['BrevetPont', 'BrevetPontLookupValue', 'Numero du Brevet Pont', 'DeckCertificate']),
    engine_certificate_label: text(item, [
      'BrevetMachine',
      'BrevetMachineLookupValue',
      'Brevet Machine: Brevet Machine',
      'EngineCertificate',
    ]),
    crane_training_on: dateOnly(item, ['FormationGrutage', 'Formation Grutage - APAVE LMG130', 'CraneTrainingOn']),
    crane_induction_on: dateOnly(item, ['InductionGrutage', 'Induction Grutage', 'CraneInductionOn']),
    active: booleanValue(item, ['Actif', 'Contrat actif', 'Active'], true),
  });
}

function inferHrDocumentCategory(title: string): string {
  const searchableTitle = normalizeSearchText(title);

  if (searchableTitle.includes('visite medical')) {
    return 'medical_visit';
  }

  if (
    searchableTitle.includes('cgo') ||
    searchableTitle.includes('cfbs') ||
    searchableTitle.includes('brevet') ||
    searchableTitle.includes('certificat')
  ) {
    return 'certificate';
  }

  if (searchableTitle.includes('machine')) {
    return 'engine';
  }

  if (searchableTitle.includes('pont')) {
    return 'deck';
  }

  if (searchableTitle.includes('levage')) {
    return 'lifting';
  }

  if (searchableTitle.includes('safety induction')) {
    return 'safety_induction';
  }

  if (searchableTitle.includes('formation') || searchableTitle.includes('securite')) {
    return 'safety_training';
  }

  return 'administrative';
}

function statusFromLabel(value: string | null): string | null {
  const normalized = normalizeSearchText(value || '');

  if (!normalized) {
    return null;
  }

  if (normalized.includes('expire') || normalized.includes('echu')) {
    return 'expired';
  }

  if (normalized.includes('renouvel')) {
    return 'renew_due';
  }

  if (normalized.includes('manquant')) {
    return 'missing';
  }

  if (normalized.includes('validation')) {
    return 'pending_validation';
  }

  if (normalized.includes('valide')) {
    return 'valid';
  }

  return null;
}

function inferHrDocumentStatus(statusLabel: string | null, expiresOn: string | null): string {
  const explicitStatus = statusFromLabel(statusLabel);

  if (explicitStatus) {
    return explicitStatus;
  }

  if (!expiresOn) {
    return 'valid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiresOn}T00:00:00`);

  if (expiryDate < today) {
    return 'expired';
  }

  const renewalWindowMs = 90 * 24 * 60 * 60 * 1000;
  return expiryDate.getTime() - today.getTime() <= renewalWindowMs ? 'renew_due' : 'valid';
}

function inferFleetCertificateCategory(title: string): string {
  const searchableTitle = normalizeSearchText(title);

  if (searchableTitle.includes('navigation')) {
    return 'navigation';
  }

  if (searchableTitle.includes('francisation')) {
    return 'francisation';
  }

  if (searchableTitle.includes('assurance')) {
    return 'insurance';
  }

  if (searchableTitle.includes('radio') || searchableTitle.includes('licence')) {
    return 'radio';
  }

  if (searchableTitle.includes('securite') || searchableTitle.includes('safety')) {
    return 'safety';
  }

  if (searchableTitle.includes('classe') || searchableTitle.includes('classification')) {
    return 'classification';
  }

  return 'certificate';
}

function inferProcedureCode(title: string): string | null {
  const codeMatch = title.match(/\b([A-Z]{2,}(?:[-_ ][A-Z0-9]+)*[-_ ]\d{2,}[A-Z0-9-]*)\b/i);

  if (!codeMatch) {
    return null;
  }

  return codeMatch[1].replace(/[\s_]+/g, '-').toUpperCase();
}

function inferProcedureStatus(statusLabel: string | null): string {
  const normalized = normalizeSearchText(statusLabel || '');

  if (normalized.includes('archive')) {
    return 'archived';
  }

  if (normalized.includes('revision') || normalized.includes('relecture') || normalized.includes('review')) {
    return 'review';
  }

  if (normalized.includes('brouillon') || normalized.includes('draft')) {
    return 'draft';
  }

  if (
    normalized.includes('approuv') ||
    normalized.includes('publie') ||
    normalized.includes('valide') ||
    normalized.includes('applicable')
  ) {
    return 'approved';
  }

  return 'unknown';
}

function mapHrDocumentPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(
    item,
    ['FileLeafRef', 'Brevet: Nom de Fichier', 'Nom', 'Brevet: Titre', 'Title'],
    `Document SharePoint ${itemId || ''}`.trim(),
  );
  const expiresOn = dateOnly(item, [
    'DateEch_x00e9_ance',
    'Date Echéance',
    'Date Échéance',
    'DateEcheance',
    'DateExpiration',
    'ExpiresOn',
  ]);
  const categoryLabel = text(item, ['CategoryKey', 'Categorie', 'Catégorie', 'Brevet: Catégorie', 'Brevet']);
  const categoryKey = categoryLabel ? inferHrDocumentCategory(categoryLabel) : inferHrDocumentCategory(title);
  const fileUrl = text(item, ['EncodedAbsUrl', "Chemin d'accès"]) || stringifyValue(item.webUrl);

  return withReconciliation(item, source, {
    person_id: null,
    person_sharepoint_item_id: text(item, ['CollaborateurId', 'CollaborateurLookupId', 'PersonId']),
    person_name: text(item, [
      'Collaborateur: Prénom & NOM',
      'Collaborateur',
      'CollaborateurLookupValue',
      'NomMarin',
      'PersonName',
    ]),
    category_key: categoryKey,
    title,
    status: inferHrDocumentStatus(text(item, ['Status', 'Statut']), expiresOn),
    issued_on: dateOnly(item, ['DateDelivrance', 'Date_x0020_delivrance', 'IssuedOn']),
    expires_on: expiresOn,
    requires_captain_validation:
      booleanValue(item, ['RequiresCaptainValidation', 'ValidationCapitaine'], false) || categoryKey === 'medical_visit',
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: fileUrl,
    notes: text(item, ['FileRef', 'ServerRelativeUrl', "Chemin d'accès"]),
  });
}

function mapFleetCertificatePayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Certificat flotte SharePoint ${itemId || ''}`.trim());
  const expiresOn = dateOnly(item, ['DateEch_x00e9_ance', 'DateEcheance', 'DateExpiration', 'ExpiresOn']);
  const categoryKey = text(item, ['CategoryKey', 'Categorie']) || inferFleetCertificateCategory(title);
  const fileUrl = text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl);

  return withReconciliation(item, source, {
    vessel_id: null,
    vessel_sharepoint_item_id: text(item, ['NavireId', 'NavireLookupId', 'VesselId']),
    vessel_name: text(item, ['Navire', 'NavireLookupValue', 'NomNavire', 'VesselName']),
    category_key: categoryKey,
    title,
    status: inferHrDocumentStatus(text(item, ['Status', 'Statut']), expiresOn),
    issued_on: dateOnly(item, ['DateDelivrance', 'Date_x0020_delivrance', 'IssuedOn']),
    expires_on: expiresOn,
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: fileUrl,
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function mapProcedurePayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Procedure SharePoint ${itemId || ''}`.trim());
  const procedureCode = text(item, ['Code', 'ProcedureCode', 'Reference', 'Ref']) || inferProcedureCode(title);

  return withReconciliation(item, source, {
    procedure_code: procedureCode,
    title,
    status: inferProcedureStatus(text(item, ['Status', 'Statut'])),
    revision_label: text(item, ['Revision', 'Version', 'Indice']),
    published_on: dateOnly(item, ['DatePublication', 'PublishedOn', 'DateValidation']),
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function mapPublishedProcedurePayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Procedure PDF SharePoint ${itemId || ''}`.trim());
  const procedureCode = text(item, ['Code', 'ProcedureCode', 'Reference', 'Ref']) || inferProcedureCode(title);

  return withReconciliation(item, source, {
    procedure_id: null,
    procedure_sharepoint_item_id: text(item, ['ProcedureId', 'ProcedureLookupId', 'QSMSId']),
    procedure_code: procedureCode,
    title,
    status: inferProcedureStatus(text(item, ['Status', 'Statut'])),
    revision_label: text(item, ['Revision', 'Version', 'Indice']),
    published_on: dateOnly(item, ['DatePublication', 'PublishedOn', 'DateValidation']),
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function mapVesselPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    name: requiredText(item, ['Title', 'NomNavire', 'Nom_x0020_navire'], ''),
    acronym: text(item, ['Acronyme']),
    active: booleanValue(item, ['NavireActif', 'Actif', 'Active'], true),
    type_label: text(item, ['Type', 'TypeLabel']),
    unit_type_label: text(item, ['TypeUnite', 'TypeUnit_x00e9']),
    fleet_exit_on: dateOnly(item, ['DateSortieFlotte', 'SortieFlotte']),
    registration_number: text(item, ['NumeroImmatriculation', 'Immatriculation']),
    imo_number: text(item, ['IMO', 'NumeroIMO']),
    registration_port: text(item, ['PortImmatriculation']),
    call_sign: text(item, ['IndicatifAppel', 'CallSign']),
    mmsi: text(item, ['MMSI']),
    gross_tonnage: text(item, ['JaugeBrute', 'GrossTonnage']),
    max_people: numeric(item, ['NombrePersonnesMax', 'MaxPeople']),
    crew_members: text(item, ['Equipage', 'CrewMembers']),
    medical_dotation: text(item, ['DotationMedicale']),
    length_overall: text(item, ['LongueurHorsTout', 'Longueur']),
  });
}

function mapClientPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    name: requiredText(item, ['Title', 'Nom', 'ClientName'], ''),
    code: text(item, ['CodeClient', 'Code', 'ClientCode']),
    email: text(item, ['Email', 'Mail']),
    phone: text(item, ['Telephone', 'T_x00e9_l_x00e9_phone', 'Phone']),
    address: text(item, ['Adresse', 'Address']),
    city: text(item, ['Ville', 'City']),
    country: text(item, ['Pays', 'Country']),
    active: booleanValue(item, ['Actif', 'Active'], true),
    source_label: 'sharepoint',
  });
}

function mapPlanningDayPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    crew_name: requiredText(item, ['NomMarin'], ''),
    captain_name: text(item, ['NomCapitaine']),
    vessel_name: text(item, ['NomNavire']),
    manual_vessel_name: text(item, ['NavireManuel']),
    work_date: dateOnly(item, ['DateTravail']),
    disembark_on: dateOnly(item, ['DateDebarque']),
    year_number: numeric(item, ['Annee']),
    month_number: numeric(item, ['MoisNo']),
    month_label: text(item, ['MoisLibelle']),
    day_number: numeric(item, ['JourNo']),
    function_label: text(item, ['Fonction']),
    sailor_status: text(item, ['StatutMarin']),
    day_status: text(item, ['StatutJour']),
    rhythm_label: text(item, ['Rythme']),
    watch_group: text(item, ['Bord_x00e9_e', 'Bordee']),
    slot365: text(item, ['Slot365']),
    departure_on: dateOnly(item, ['DateDepart', 'datedepart', 'Datedepart']),
    worked_hours: numeric(item, ['HeuresTravaillees']),
    rest_24h: numeric(item, ['Repos24h']),
    cumulative_7d: numeric(item, ['Cumul7j']),
    comments: text(item, ['Commentaires', 'Title']),
    source_label: 'sharepoint',
  });
}

function mapPlanningPeriodPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    crew_name: requiredText(item, ['NomMarin'], ''),
    vessel_name: text(item, ['NomNavire']),
    manual_vessel_name: text(item, ['NavireManuel']),
    watch_group: text(item, ['Bord_x00e9_e', 'Bordee']),
    function_label: text(item, ['Fonction']),
    sailor_status: text(item, ['StatutMarin']),
    starts_on: dateOnly(item, ['DateDebut']),
    ends_on: dateOnly(item, ['DateFin']),
    year_number: numeric(item, ['Annee']),
    comments: text(item, ['Commentaires', 'Title']),
    slot365_source_id: text(item, ['Slot365SourceId']),
    slot365_source_key: text(item, ['Slot365SourceKey']),
    source_label: 'sharepoint',
  });
}

function mapProjectPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    title: requiredText(item, ['Title'], ''),
    project_code: text(item, ['NumeroProjet', 'Num_x00e9_roProjet', 'ProjectCode', 'CodeProjet', 'Code']),
    client_id: null,
    client_sharepoint_item_id: text(item, ['ClientId', 'ClientLookupId']),
    client_name: text(item, ['Client', 'ClientLookupValue', 'NomClient']),
    primary_vessel_id: null,
    primary_vessel_sharepoint_item_id: text(item, ['NavireId', 'NavireLookupId', 'PrimaryVesselId']),
    primary_vessel_name: text(item, ['Navire', 'NavireLookupValue', 'NomNavire']),
    secondary_vessel_id: null,
    secondary_vessel_sharepoint_item_id: text(item, ['Navire_x0020_2Id', 'Navire2Id', 'SecondaryVesselId']),
    secondary_vessel_name: text(item, ['Navire_x0020_2', 'Navire2', 'SecondaryVesselName']),
    starts_on: dateOnly(item, ['Dated_x00e9_but', 'DateDebut', 'StartsOn']),
    ends_on: dateOnly(item, ['Datefin', 'DateFin', 'EndsOn']),
    status: text(item, ['Statut', 'Status']),
    description: text(item, ['Description', 'Commentaires']),
    source_label: 'sharepoint',
  });
}

function projectDocumentPayload(
  item: SharePointListItem,
  source: SharePointMigrationSource,
  categoryKey: string,
): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Document projet SharePoint ${itemId || ''}`.trim());

  return withReconciliation(item, source, {
    project_id: null,
    project_sharepoint_item_id: text(item, ['ProjetId', 'ProjectId', 'ProjetLookupId']),
    project_code: text(item, ['NumeroProjet', 'Num_x00e9_roProjet', 'ProjectCode', 'CodeProjet', 'Code']),
    project_title: text(item, ['Projet', 'Project', 'ProjetLookupValue', 'ProjectTitle']),
    category_key: categoryKey,
    title,
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function mapProjectDocumentPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return projectDocumentPayload(item, source, 'project_document');
}

function mapContractDocumentPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return projectDocumentPayload(item, source, 'contract_document');
}

function mapMgoPricePayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    price_date: dateOnly(item, ['Date', 'DatePrix', 'Date_x0020_prix', 'PriceDate']),
    price_ht: numeric(item, ['PrixMGO_x002d_HT', 'PrixMGOHT', 'PrixMGO', 'PriceHT']),
    currency: text(item, ['Devise', 'Currency']),
    supplier_name: text(item, ['Fournisseur', 'Supplier']),
    title: requiredText(item, ['Title'], ''),
    notes: text(item, ['Commentaires', 'Notes']),
    source_label: 'sharepoint',
  });
}

function mapDprItemPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    title: requiredText(item, ['Title'], ''),
    project_id: null,
    project_sharepoint_item_id: text(item, [
      'DPR_x002d_ProjetId',
      'DPR_x002d_Projet0Id',
      'ProjetId',
      'ProjectId',
    ]),
    project_code: text(item, ['NumeroProjet', 'Num_x00e9_roProjet', 'ProjectCode', 'CodeProjet', 'Code']),
    project_title: text(item, ['DPR_x002d_Projet', 'DPR_x002d_Projet0', 'Projet', 'Project']),
    vessel_id: null,
    vessel_sharepoint_item_id: text(item, ['DPR_x002d_NavireId', 'NavireId', 'VesselId']),
    vessel_name: text(item, ['DPR_x002d_Navire', 'Navire', 'NomNavire', 'VesselName']),
    report_date: dateOnly(item, ['DPR_x002d_Date', 'DateduDPR', 'DateDPR', 'Date']),
    report_time: text(item, ['Heure_x0020_du_x0020_DPR', 'HeureduDPR', 'DPR_x002d_Heure']),
    description: text(item, ['DPR_x002d_DescriptionJourn_x00e9', 'DPR_x002d_DescriptionJournee', 'Description']),
    fuel_consumption_l: numeric(item, ['DPR_x002d_ConsommationdeCarburan']),
    mgo_refueling_m3: numeric(item, ['DPR_x002d_AvitaillementMGO_x0028']),
    qhse_note: text(item, ['DPR_x002d_NoteQHSE']),
    radio_contact: booleanValue(item, ['DPR_x002d_ContactRadio'], false),
    environment_incident_count: numeric(item, ['DPR_x002d_Incident_x002f_Acciden']),
    person_accident_count: numeric(item, ['DPR_x002d_Accidents']),
    dangerous_situation_count: numeric(item, ['DPR_x002d_LEMS_x002d_NbdeSituati']),
    source_label: 'sharepoint',
  });
}

function mapDprArchivePayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Archive DPR SharePoint ${itemId || ''}`.trim());

  return withReconciliation(item, source, {
    dpr_item_id: null,
    dpr_sharepoint_item_id: text(item, ['DPRId', 'DPRLookupId', 'DPR_x002d_ID']),
    project_id: null,
    project_sharepoint_item_id: text(item, ['ProjetId', 'ProjectId', 'DPR_x002d_ProjetId']),
    project_code: text(item, ['NumeroProjet', 'Num_x00e9_roProjet', 'ProjectCode', 'CodeProjet', 'Code']),
    project_title: text(item, ['Projet', 'Project', 'DPR_x002d_Projet', 'DPR_x002d_Projet0']),
    report_date: dateOnly(item, ['DateduDPR', 'DateDPR', 'DPR_x002d_Date', 'Date']),
    title,
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function inferActionCategory(actionType: string | null): string {
  const normalized = normalizeSearchText(actionType || '');

  if (normalized.includes('audit')) {
    return 'audit';
  }

  if (normalized.includes('visite') || normalized.includes('hse')) {
    return 'hse_visit';
  }

  return 'action';
}

function mapPurchaseRequestPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const requestNumber = text(item, [
    'NumeroDemande',
    'Num_x00e9_roDemande',
    'Num_x00e9_ro_x0020_demande',
    'RequestNumber',
    'Title',
  ]);

  return withReconciliation(item, source, {
    request_number: requestNumber,
    title: requiredText(item, ['Title', 'Objet', 'Description'], requestNumber || ''),
    requested_on: dateOnly(item, ['DateDemande', 'Date_x0020_demande', 'RequestedOn', 'Created']),
    requester_name: text(item, ['Demandeur', 'Requester', 'Author']),
    supplier_name: text(item, ['Fournisseur', 'Supplier']),
    project_id: null,
    project_sharepoint_item_id: text(item, ['ProjetId', 'ProjectId', 'ProjetLookupId']),
    project_code: text(item, ['NumeroProjet', 'Num_x00e9_roProjet', 'ProjectCode', 'CodeProjet', 'Code']),
    project_title: text(item, ['Projet', 'Project', 'ProjetLookupValue', 'ProjectTitle']),
    amount_ht: numeric(item, ['MontantHT', 'Montant_x0020_HT', 'AmountHT']),
    currency: text(item, ['Devise', 'Currency']),
    status: text(item, ['Statut', 'Status']),
    description: text(item, ['Objet', 'Description', 'Commentaires', 'Comments']),
    source_label: 'sharepoint',
  });
}

function mapActionItemPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const actionType = text(item, ['Audit_x002f_VisiteHSE', 'ActionType', 'Type']);

  return withReconciliation(item, source, {
    project_id: null,
    project_sharepoint_item_id: text(item, ['ProjetId', 'ProjectId', 'ProjetLookupId']),
    project_code: text(item, ['NumeroProjet', 'Num_x00e9_roProjet', 'ProjectCode', 'CodeProjet', 'Code']),
    project_title: text(item, ['Projet', 'Project', 'ProjetLookupValue', 'ProjectTitle']),
    vessel_id: null,
    vessel_sharepoint_item_id: text(item, ['NavireId', 'VesselId', 'NavireLookupId']),
    vessel_name: text(item, ['Navire', 'NomNavire', 'VesselName', 'NavireLookupValue']),
    category_key: inferActionCategory(actionType),
    action_type: actionType,
    audit_type: text(item, ['TypedAudit', 'TypeAudit', 'AuditType']),
    title: requiredText(item, ['Title'], ''),
    status: text(item, ['Statut', 'Status']),
    priority_label: text(item, ['Priorite', 'Priority']),
    opened_on: dateOnly(item, ['DateAudit', 'Date', 'OpenedOn', 'Created']),
    due_on: dateOnly(item, ['Echeance', 'DueOn', 'DateEcheance']),
    owner_name: text(item, ['Responsable', 'Owner', 'AssignedTo']),
    auditor_name: text(item, [
      'Auditeur_x0028_s_x0029_',
      'Auditeur_x0028_s_x0029__x003a__x',
      'Auditeur',
      'Auditor',
    ]),
    description: text(item, ['Description', 'Constat', 'Commentaires']),
    corrective_action: text(item, ['ActionCorrective', 'Action_x0020_corrective', 'CorrectiveAction']),
    source_label: 'sharepoint',
  });
}

function mapActionDocumentPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Fiche de progres SharePoint ${itemId || ''}`.trim());

  return withReconciliation(item, source, {
    action_item_id: null,
    action_sharepoint_item_id: text(item, ['ActionId', 'ActionItemId', 'AuditId']),
    action_title: text(item, ['Action', 'ActionItem', 'ActionTitle', 'Audit']),
    category_key: 'progress_sheet',
    title,
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function mapGenericDocumentPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  const itemId = sourceItemId(item);
  const title = requiredText(item, ['FileLeafRef', 'Title'], `Document SharePoint ${itemId || ''}`.trim());

  return withReconciliation(item, source, {
    person_id: null,
    person_sharepoint_item_id: text(item, [
      'CollaborateurId',
      'PersonId',
      'MarinId',
      'PersonnelId',
      'EmployeeId',
      'PersonLookupId',
    ]),
    person_name: text(item, ['Collaborateur', 'NomMarin', 'Marin', 'PersonName', 'Auteur', 'Author']),
    vessel_id: null,
    vessel_sharepoint_item_id: text(item, ['NavireId', 'VesselId', 'NavireLookupId']),
    vessel_name: text(item, ['Navire', 'NomNavire', 'VesselName', 'NavireLookupValue']),
    category_key: text(item, ['CategoryKey', 'Categorie', 'Cat_x00e9_gorie', 'TypeDocument', 'Type', 'DocumentType']) || source.moduleKey,
    document_date: dateOnly(item, ['DateDocument', 'DocumentDate', 'Date', 'Created']),
    expires_on: dateOnly(item, ['DateEcheance', 'DateEch_x00e9_ance', 'DateExpiration', 'ExpiresOn']),
    revision_label: text(item, ['Revision', 'Version', 'Indice']),
    status: text(item, ['Statut', 'Status']),
    title,
    source_label: 'sharepoint',
    source_sharepoint_id: itemId,
    file_url: text(item, ['EncodedAbsUrl']) || stringifyValue(item.webUrl),
    notes: text(item, ['FileRef', 'ServerRelativeUrl']),
  });
}

function mapPlanningProjectPayload(item: SharePointListItem, source: SharePointMigrationSource): SharePointImportRow {
  return withReconciliation(item, source, {
    title: requiredText(item, ['Title'], ''),
    starts_on: dateOnly(item, ['Dated_x00e9_but', 'DateDebut']),
    ends_on: dateOnly(item, ['Datefin', 'DateFin']),
    description: text(item, ['Description']),
    client_name: text(item, ['Client']),
    primary_vessel_name: text(item, ['Navire', 'NavireId']),
    secondary_vessel_name: text(item, ['Navire_x0020_2', 'Navire2']),
    status: text(item, ['Statut']),
    source_label: 'sharepoint',
  });
}

export function buildSharePointUpsertBatch(sourceKey: string, items: SharePointListItem[]): SharePointUpsertBatch {
  const source = getSharePointSourceByKey(sourceKey);

  if (!source?.targetTable || !SOURCE_MAPPERS[sourceKey]) {
    throw new Error(`SharePoint source ${sourceKey} is not mapped to an import payload yet.`);
  }

  return {
    sourceKey,
    targetTable: source.targetTable,
    conflictColumns: CONFLICT_COLUMNS,
    rows: items.map((item) => SOURCE_MAPPERS[sourceKey](item, source)),
  };
}

export function buildSharePointImportBatches(
  itemsBySource: Record<string, SharePointListItem[]>,
): SharePointUpsertBatch[] {
  return Object.entries(itemsBySource)
    .map(([sourceKey, items]) => buildSharePointUpsertBatch(sourceKey, items))
    .sort((left, right) => {
      const leftSource = getSharePointSourceByKey(left.sourceKey);
      const rightSource = getSharePointSourceByKey(right.sourceKey);
      return (leftSource?.importPriority || 0) - (rightSource?.importPriority || 0);
    });
}

export async function upsertSharePointBatch(
  client: SharePointSupabaseClient,
  batch: SharePointUpsertBatch,
): Promise<SharePointUpsertResult> {
  if (batch.rows.length === 0) {
    return {
      sourceKey: batch.sourceKey,
      targetTable: batch.targetTable,
      rowCount: 0,
    };
  }

  if (!client.from) {
    throw new Error('Supabase client does not support table upserts.');
  }

  const { error } = await client.from(batch.targetTable).upsert(batch.rows, {
    onConflict: batch.conflictColumns.join(','),
  });

  if (error) {
    throw error;
  }

  return {
    sourceKey: batch.sourceKey,
    targetTable: batch.targetTable,
    rowCount: batch.rows.length,
  };
}

export async function upsertSharePointBatches(
  client: SharePointSupabaseClient,
  batches: SharePointUpsertBatch[],
): Promise<SharePointUpsertResult[]> {
  const results: SharePointUpsertResult[] = [];

  for (const batch of batches) {
    results.push(await upsertSharePointBatch(client, batch));
  }

  return results;
}

export function buildSharePointImportBatchesFromExport(bundle: SharePointExportBundle): SharePointUpsertBatch[] {
  return buildSharePointImportBatches(
    bundle.sources.reduce<Record<string, SharePointListItem[]>>((itemsBySource, source) => {
      itemsBySource[source.sourceKey] = source.items;
      return itemsBySource;
    }, {}),
  );
}

export function buildSharePointImportReport(results: SharePointUpsertResult[]): SharePointImportReport {
  return {
    totalSources: results.length,
    totalRows: results.reduce((total, result) => total + result.rowCount, 0),
    results,
  };
}

export async function importSharePointExportBundle(
  client: SharePointSupabaseClient,
  bundle: SharePointExportBundle,
): Promise<SharePointImportReport> {
  const batches = buildSharePointImportBatchesFromExport(bundle);
  const results = await upsertSharePointBatches(client, batches);
  return buildSharePointImportReport(results);
}

export async function resolveSharePointPlanningLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointPlanningLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_planning_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointPlanningLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedPeople: row.resolved_people,
    resolvedVessels: row.resolved_vessels,
  }));
}

export async function resolveSharePointHrDocumentLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointHrDocumentLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_hr_document_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointHrDocumentLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedDocuments: row.resolved_documents,
  }));
}

export async function resolveSharePointFleetCertificateLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointFleetCertificateLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_fleet_certificate_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointFleetCertificateLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedCertificates: row.resolved_certificates,
  }));
}

export async function resolveSharePointPublishedProcedureLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointPublishedProcedureLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_published_procedure_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointPublishedProcedureLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedPublications: row.resolved_publications,
  }));
}

export async function resolveSharePointProjectLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointProjectLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_project_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointProjectLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedClients: row.resolved_clients,
    resolvedVessels: row.resolved_vessels,
  }));
}

export async function resolveSharePointProjectDocumentLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointProjectDocumentLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_project_document_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointProjectDocumentLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedDocuments: row.resolved_documents,
  }));
}

export async function resolveSharePointDprLinks(client: SharePointSupabaseClient): Promise<SharePointDprLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_dpr_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointDprLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedProjects: row.resolved_projects,
    resolvedVessels: row.resolved_vessels,
    resolvedDprItems: row.resolved_dpr_items,
  }));
}

export async function resolveSharePointOperationLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointOperationLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_operation_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointOperationLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedProjects: row.resolved_projects,
    resolvedVessels: row.resolved_vessels,
    resolvedActions: row.resolved_actions,
  }));
}

export async function resolveSharePointDocumentLinks(
  client: SharePointSupabaseClient,
): Promise<SharePointDocumentLinkResolution[]> {
  if (!client.rpc) {
    throw new Error('Supabase client does not support RPC calls.');
  }

  const { data, error } = await client.rpc('resolve_sharepoint_document_links');

  if (error) {
    throw error;
  }

  return ((data || []) as SharePointDocumentLinkResolutionRow[]).map((row) => ({
    targetTable: row.target_table,
    resolvedPeople: row.resolved_people,
    resolvedVessels: row.resolved_vessels,
  }));
}
