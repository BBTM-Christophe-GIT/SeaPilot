import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';

const PEOPLE_SELECT = [
  'id',
  'user_id',
  'first_name',
  'last_name',
  'email',
  'function_label',
  'grade_label',
  'role_label',
  'register_label',
  'sex',
  'sailor_number',
  'm365_account',
  'phone',
  'postal_address',
  'birth_date',
  'birth_place',
  'identity_document_number',
  'identity_document_type',
  'contract_type',
  'hired_on',
  'departed_on',
  'departure_reason',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
  'emergency_contact_address',
  'waist_size',
  'chest_size',
  'full_height_size',
  'inseam_size',
  'hip_size',
  'weight_kg',
  'shoe_size',
  'coverall_size',
  'pants_size',
  'jacket_size',
  'deck_certificate_label',
  'engine_certificate_label',
  'crane_training_on',
  'crane_induction_on',
  'active',
].join(', ');

const HR_DOCUMENT_SELECT = [
  'id',
  'person_id',
  'person_name',
  'person_sharepoint_item_id',
  'category_key',
  'title',
  'status',
  'issued_on',
  'expires_on',
  'requires_captain_validation',
  'medical_restriction',
  'medical_bridge_watch',
  'medical_unfit',
  'source_label',
  'notes',
  'file_url',
  'storage_bucket',
  'storage_path',
  'file_size_bytes',
  'mime_type',
].join(', ');

const HR_DOCUMENT_TYPE_SELECT = 'id, source_item_id, name, category';

export const HR_DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  administrative: 'Documents administratifs',
  certificate: 'Certificats',
  deck: 'Pont',
  engine: 'Machine',
  lifting: 'Levage',
  medical_visit: 'Visite Médicale',
  safety_training: 'Formation de Sécurité',
  safety_induction: 'Safety Induction',
};

export const HR_PRIMARY_FUNCTIONS = [
  'Capitaine',
  'Chef Mécanicien',
  '2nd Capitaine',
  "Maître d'Equipage",
  'Matelot polyvalent',
  'Matelot Qualifié',
  'Stagiaire',
] as const;

export const HR_SEDENTARY_FUNCTIONS = [
  'Directeur QHSE / Chef de Projet',
  'Directrice Administrative et Financière',
  'Fleet Technical Manager',
  'Président',
  'Yard Manager - Le Havre',
] as const;

const HR_FUNCTION_ALIASES = new Map<string, string>([
  ['capitaine', 'Capitaine'],
  ['chef mecanicien', 'Chef Mécanicien'],
  ['2nd capitaine', '2nd Capitaine'],
  ['second capitaine', '2nd Capitaine'],
  ["maitre d'equipage", "Maître d'Equipage"],
  ['maitre equipage', "Maître d'Equipage"],
  ['matelot polyvalent', 'Matelot polyvalent'],
  ['matelot qualifie', 'Matelot Qualifié'],
  ['stagiaire', 'Stagiaire'],
]);

export type HrVisibilityScope = 'function' | 'document_type' | 'section';

interface HrVisibilityRuleRow {
  scope: HrVisibilityScope;
  item_key: string;
  item_label: string;
  visible_to_roles: string[] | null;
}

type HrDocumentStatus = 'valid' | 'renew_due' | 'expired' | 'missing' | 'pending_validation';

interface PersonRow {
  id: number;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  function_label: string | null;
  grade_label: string | null;
  role_label: string | null;
  register_label: string | null;
  sex: string | null;
  sailor_number: string | null;
  m365_account: string | null;
  phone: string | null;
  postal_address: string | null;
  birth_date: string | null;
  birth_place: string | null;
  identity_document_number: string | null;
  identity_document_type: string | null;
  contract_type: string | null;
  hired_on: string | null;
  departed_on: string | null;
  departure_reason: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_address: string | null;
  waist_size: number | string | null;
  chest_size: number | string | null;
  full_height_size: number | string | null;
  inseam_size: number | string | null;
  hip_size: number | string | null;
  weight_kg: number | string | null;
  shoe_size: number | string | null;
  coverall_size: string | null;
  pants_size: string | null;
  jacket_size: string | null;
  deck_certificate_label: string | null;
  engine_certificate_label: string | null;
  crane_training_on: string | null;
  crane_induction_on: string | null;
  active: boolean;
}

interface HrDocumentRow {
  id: number;
  person_id: number | null;
  person_name: string | null;
  person_sharepoint_item_id: string | null;
  category_key: string | null;
  title: string;
  status: string | null;
  issued_on: string | null;
  expires_on: string | null;
  requires_captain_validation: boolean | null;
  medical_restriction?: string | null;
  medical_bridge_watch?: boolean | null;
  medical_unfit?: boolean | null;
  source_label: string | null;
  notes: string | null;
  file_url: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_size_bytes?: number | string | null;
  mime_type?: string | null;
}

interface HrDocumentTypeRow {
  id: number;
  source_item_id: number;
  name: string;
  category: string | null;
}

export interface PersonRecord {
  id: number;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
  roleLabel: string;
  registerLabel: string;
  sex: string;
  sailorNumber: string;
  m365Account: string;
  phone: string;
  postalAddress: string;
  birthDate: string;
  birthPlace: string;
  identityDocumentNumber: string;
  identityDocumentType: string;
  contractType: string;
  hiredOn: string;
  departedOn: string;
  departureReason: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactAddress: string;
  waistSize: string;
  chestSize: string;
  fullHeightSize: string;
  inseamSize: string;
  hipSize: string;
  weightKg: string;
  shoeSize: string;
  coverallSize: string;
  pantsSize: string;
  jacketSize: string;
  deckCertificateLabel: string;
  engineCertificateLabel: string;
  craneTrainingOn: string;
  craneInductionOn: string;
  active: boolean;
}

export interface HrDocumentRecord {
  id: number;
  personId: number | null;
  personName: string;
  personSharePointItemId: string;
  categoryKey: string;
  title: string;
  status: HrDocumentStatus;
  issuedOn: string;
  expiresOn: string;
  requiresCaptainValidation: boolean;
  medicalRestriction: string;
  medicalBridgeWatch: boolean | null;
  medicalUnfit: boolean;
  sourceLabel: string;
  notes: string;
  fileUrl: string;
  storageBucket: string;
  storagePath: string;
  fileSizeBytes: number | null;
  mimeType: string;
}

export interface HrDocumentTypeOption {
  id: number;
  sourceItemId: number;
  name: string;
  fileName: string;
  categoryKey: string;
  categoryLabel: string;
}

export interface PersonCategorySummary {
  key: string;
  label: string;
  count: number;
  urgentCount: number;
  renewalDueCount: number;
}

export interface PersonDashboardRecord extends PersonRecord {
  documents: HrDocumentRecord[];
  categorySummaries: PersonCategorySummary[];
}

export interface HumanResourcesDashboardGroup {
  label: string;
  people: PersonDashboardRecord[];
}

export interface HumanResourcesRosterGroup extends HumanResourcesDashboardGroup {
  children?: HumanResourcesDashboardGroup[];
}

export interface HumanResourcesDashboardMetrics {
  activePeople: number;
  sedentaryPeople: number;
  seafarerPeople: number;
  trainees: number;
  documents: number;
  renewalDue: number;
  urgent: number;
  missing: number;
  expiredDocuments: number;
  certificateRenewals: number;
  medicalVisitRenewals: number;
  unassignedDocuments: number;
  contractsReady: number;
  emergencyContactsReady: number;
  habilitationsReady: number;
  turnoverRate: number;
  averageTenureYears: number;
  medicalComplianceRate: number;
}

export interface HumanResourcesDashboard {
  metrics: HumanResourcesDashboardMetrics;
  groups: HumanResourcesDashboardGroup[];
}

export interface HumanResourcesData {
  people: PersonRecord[];
  documents: HrDocumentRecord[];
  documentTypes: HrDocumentTypeOption[];
  visibilityRules: HrVisibilityRule[];
}

export interface HrVisibilityRule {
  scope: HrVisibilityScope;
  itemKey: string;
  itemLabel: string;
  visibleToRoles: RoleKey[];
}

export interface StaffEvolutionPoint {
  year: number;
  count: number;
}

export interface UpdatePersonDetailsInput {
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
  roleLabel: string;
  registerLabel: string;
  sex: string;
  sailorNumber: string;
  m365Account: string;
  phone: string;
  postalAddress: string;
  birthDate: string;
  birthPlace: string;
  identityDocumentNumber: string;
  identityDocumentType: string;
  contractType: string;
  hiredOn: string;
  departedOn: string;
  departureReason: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactAddress: string;
  waistSize: string;
  chestSize: string;
  fullHeightSize: string;
  inseamSize: string;
  hipSize: string;
  weightKg: string;
  shoeSize: string;
  coverallSize: string;
  pantsSize: string;
  jacketSize: string;
  deckCertificateLabel: string;
  engineCertificateLabel: string;
  craneTrainingOn: string;
  craneInductionOn: string;
}

type CreatePersonRequiredField = 'firstName' | 'lastName' | 'email' | 'functionLabel' | 'gradeLabel';

export type CreatePersonInput = Pick<UpdatePersonDetailsInput, CreatePersonRequiredField> &
  Partial<Omit<UpdatePersonDetailsInput, CreatePersonRequiredField>>;

export interface RenewHrDocumentInput {
  document: HrDocumentRecord;
  dueDate: string;
  file: File;
  medicalBridgeWatch?: boolean | null;
  medicalRestriction?: string;
  medicalUnfit?: boolean;
  person: PersonRecord;
}

export interface CreateHrDocumentInput {
  documentType: HrDocumentTypeOption;
  dueDate: string;
  file: File;
  medicalBridgeWatch?: boolean | null;
  medicalRestriction?: string;
  medicalUnfit?: boolean;
  person: PersonRecord;
}

export interface UpdateHrDocumentMedicalInput {
  medicalBridgeWatch: boolean | null;
  medicalRestriction: string;
  medicalUnfit: boolean;
}

const HR_DOCUMENT_STORAGE_BUCKET = 'hr-documents';

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() || '';
  return trimmed || null;
}

function optionalNumber(value: string | undefined): number | null {
  const normalized = value?.trim().replace(',', '.') || '';

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(status: string | null): HrDocumentStatus {
  if (
    status === 'valid' ||
    status === 'renew_due' ||
    status === 'expired' ||
    status === 'missing' ||
    status === 'pending_validation'
  ) {
    return status;
  }

  return 'valid';
}

function statusFromDueDate(value: string): HrDocumentStatus {
  if (!value) {
    return 'valid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${value}T00:00:00`);

  if (expiryDate < today) {
    return 'expired';
  }

  const renewalWindowMs = 90 * 24 * 60 * 60 * 1000;
  return expiryDate.getTime() - today.getTime() <= renewalWindowMs ? 'renew_due' : 'valid';
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeHrFunctionLabel(value: string): string {
  const withoutOrderPrefix = (value || '').replace(/^\s*\d+\s*[-–—.)]\s*/, '').replace(/\s+/g, ' ').trim();

  if (!withoutOrderPrefix) {
    return '';
  }

  return HR_FUNCTION_ALIASES.get(normalizeSearchValue(withoutOrderPrefix)) || withoutOrderPrefix;
}

export function getHrFunctionVisibilityKey(value: string): string {
  return normalizeSearchValue(normalizeHrFunctionLabel(value)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function compareHrFunctionLabels(left: string, right: string): number {
  const normalizedLeft = normalizeHrFunctionLabel(left);
  const normalizedRight = normalizeHrFunctionLabel(right);
  const leftIndex = HR_PRIMARY_FUNCTIONS.indexOf(normalizedLeft as (typeof HR_PRIMARY_FUNCTIONS)[number]);
  const rightIndex = HR_PRIMARY_FUNCTIONS.indexOf(normalizedRight as (typeof HR_PRIMARY_FUNCTIONS)[number]);
  const leftRank = leftIndex === -1 ? HR_PRIMARY_FUNCTIONS.length : leftIndex;
  const rightRank = rightIndex === -1 ? HR_PRIMARY_FUNCTIONS.length : rightIndex;

  return leftRank - rightRank || normalizedLeft.localeCompare(normalizedRight, 'fr');
}

export function buildHumanResourcesRosterGroups(
  groups: HumanResourcesDashboardGroup[],
): HumanResourcesRosterGroup[] {
  const sedentaryOrder = new Map(
    HR_SEDENTARY_FUNCTIONS.map((label, index) => [normalizeSearchValue(label), index]),
  );
  const sedentaryGroups = groups
    .filter((group) => sedentaryOrder.has(normalizeSearchValue(group.label)))
    .sort(
      (left, right) =>
        (sedentaryOrder.get(normalizeSearchValue(left.label)) ?? Number.MAX_SAFE_INTEGER) -
        (sedentaryOrder.get(normalizeSearchValue(right.label)) ?? Number.MAX_SAFE_INTEGER),
    );
  const regularGroups = groups.filter((group) => !sedentaryOrder.has(normalizeSearchValue(group.label)));
  const primaryLabels = new Set<string>(HR_PRIMARY_FUNCTIONS);
  const primaryGroups = regularGroups.filter((group) => primaryLabels.has(group.label));
  const otherGroups = regularGroups.filter((group) => !primaryLabels.has(group.label));

  if (sedentaryGroups.length === 0) {
    return regularGroups;
  }

  return [
    ...primaryGroups,
    {
      label: 'Sédentaire',
      people: sedentaryGroups.flatMap((group) => group.people),
      children: sedentaryGroups,
    },
    ...otherGroups,
  ];
}

export function getHrDocumentCategoryLabel(categoryKey: string): string {
  return HR_DOCUMENT_CATEGORY_LABELS[categoryKey] || categoryKey;
}

export function isHrDocumentUrgent(document: HrDocumentRecord): boolean {
  return document.status === 'expired' || document.status === 'missing';
}

export function isHrDocumentRenewalDue(document: HrDocumentRecord): boolean {
  return document.status === 'expired' || document.status === 'renew_due';
}

function isCertificateLikeDocument(document: HrDocumentRecord): boolean {
  return document.categoryKey !== 'medical_visit' && document.categoryKey !== 'administrative';
}

export function formatPersonName(person: PersonRecord): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

export function getFileExtension(fileName: string): string {
  const match = /(\.[^./\\]+)$/.exec(fileName || '');
  return match ? match[1] : '';
}

export function stripFileExtension(fileName: string): string {
  return (fileName || '').replace(/\.[^./\\]+$/, '');
}

function removeYearFromDocumentName(value: string): string {
  const cleanedValue = (value || '')
    .replace(/(?:\s*[-–—]\s*)?\b(?:19|20|21)\d{2}\b(?:\s*[-–—]\s*)?/g, ' ')
    .replace(/^\s*[-–—]\s*/g, '')
    .replace(/\s*[-–—]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleanedValue || value.trim();
}

export function getHrDocumentDisplayName(document: Pick<HrDocumentRecord, 'title'>): string {
  const nameWithoutExtension = stripFileExtension(document.title);
  const separatorIndex = nameWithoutExtension.indexOf(' - ');
  const displayName =
    separatorIndex >= 0
      ? nameWithoutExtension.substring(separatorIndex + 3).trim() || nameWithoutExtension
      : nameWithoutExtension;

  return removeYearFromDocumentName(displayName);
}

function sanitizeFileNamePart(value: string): string {
  return (value || '')
    .replace(/[~"#%&*:<>?/\\{|}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
}

function yearFromInputDate(value: string): string {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return match ? match[1] : '';
}

export function buildGeneratedHrDocumentFileName(
  person: PersonRecord,
  document: HrDocumentRecord,
  dueDate: string,
  originalFileName: string,
): string {
  return buildGeneratedHrDocumentFileNameFromType(
    person,
    getHrDocumentDisplayName(document),
    dueDate,
    originalFileName,
  );
}

export function buildGeneratedHrDocumentFileNameFromType(
  person: PersonRecord,
  documentTypeName: string,
  dueDate: string,
  originalFileName: string,
): string {
  const parts = [
    sanitizeFileNamePart(formatPersonName(person)),
    sanitizeFileNamePart(stripFileExtension(documentTypeName)),
    sanitizeFileNamePart(yearFromInputDate(dueDate)),
  ].filter(Boolean);
  const extension = getFileExtension(originalFileName);

  return parts.length >= 2 ? `${parts.join(' - ')}${extension}` : '';
}

function buildHrDocumentStoragePath(person: PersonRecord, fileName: string): string {
  const storageFileName = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `people/${person.id}/${storageFileName}`;
}

const HR_DOCUMENT_FILE_NAME_ALIASES = new Map<string, string>([
  ['asn agent de surete du navire', 'ASN'],
  ['caeers certificat d exploitation des embarcations et radeaux de sauvetage', 'CAEERS'],
  ['cfbs certificat de formation de base a la securite', 'CFBS'],
  ['cgo certificat general d operateur', 'CGO'],
  ['cqali certificat de qualification avancee a la lutte contre l incendie', 'CQALI'],
  ['cro certificat restreint d operateur', 'CRO'],
  ['css certificat sensibilisation surete', 'CSS'],
  ['ecdis cartes electroniques', 'ECDIS'],
  ['enseignement medical de niveau i', 'EM I'],
  ['enseignement medical de niveau ii', 'EM II'],
  ['enseignement medical de niveau iii', 'EM III'],
  ['formation de base a la securite', 'CFBS'],
  ['certificat medical d aptitude a la navigation maritime', 'Visite Médicale'],
]);

function normalizeDocumentTypeName(value: string): string {
  return normalizeSearchValue(value)
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveHrDocumentFileName(name: string): string {
  return HR_DOCUMENT_FILE_NAME_ALIASES.get(normalizeDocumentTypeName(name)) || name.trim();
}

function resolveHrDocumentCategoryKey(categoryLabel: string): string {
  const category = normalizeDocumentTypeName(categoryLabel);

  if (category === 'pont') return 'deck';
  if (category === 'machine') return 'engine';
  if (category === 'formation de securite' || category === 'plan de formation') return 'safety_training';
  if (category === 'visite medicale') return 'medical_visit';
  if (category === 'ressources humaines') return 'administrative';
  if (category === 'levage' || category === 'conduite d engin') return 'lifting';
  if (category === 'safety induction') return 'safety_induction';

  return 'certificate';
}

export function mapHrDocumentTypeRows(rows: HrDocumentTypeRow[]): HrDocumentTypeOption[] {
  return rows
    .map((row) => {
      const categoryKey = resolveHrDocumentCategoryKey(nullableText(row.category));
      return {
        id: row.id,
        sourceItemId: row.source_item_id,
        name: row.name.trim(),
        fileName: resolveHrDocumentFileName(row.name),
        categoryKey,
        categoryLabel: getHrDocumentCategoryLabel(categoryKey),
      };
    })
    .filter((option) => Boolean(option.name))
    .sort(
      (left, right) =>
        left.categoryLabel.localeCompare(right.categoryLabel, 'fr') || left.name.localeCompare(right.name, 'fr'),
    );
}

function buildDocumentTypeFallback(documents: HrDocumentRecord[]): HrDocumentTypeOption[] {
  const options = new Map<string, HrDocumentTypeOption>();

  documents.forEach((document) => {
    const name = getHrDocumentDisplayName(document);
    const key = `${document.categoryKey}:${normalizeDocumentTypeName(name)}`;

    if (!name || options.has(key)) {
      return;
    }

    options.set(key, {
      id: -(options.size + 1),
      sourceItemId: 0,
      name,
      fileName: resolveHrDocumentFileName(name),
      categoryKey: document.categoryKey,
      categoryLabel: getHrDocumentCategoryLabel(document.categoryKey),
    });
  });

  return Array.from(options.values()).sort(
    (left, right) =>
      left.categoryLabel.localeCompare(right.categoryLabel, 'fr') || left.name.localeCompare(right.name, 'fr'),
  );
}

export function mapPersonRows(rows: PersonRow[]): PersonRecord[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: nullableText(row.email),
    functionLabel: nullableText(row.function_label),
    gradeLabel: nullableText(row.grade_label),
    roleLabel: nullableText(row.role_label),
    registerLabel: nullableText(row.register_label),
    sex: nullableText(row.sex),
    sailorNumber: nullableText(row.sailor_number),
    m365Account: nullableText(row.m365_account),
    phone: nullableText(row.phone),
    postalAddress: nullableText(row.postal_address),
    birthDate: nullableText(row.birth_date),
    birthPlace: nullableText(row.birth_place),
    identityDocumentNumber: nullableText(row.identity_document_number),
    identityDocumentType: nullableText(row.identity_document_type),
    contractType: nullableText(row.contract_type),
    hiredOn: nullableText(row.hired_on),
    departedOn: nullableText(row.departed_on),
    departureReason: nullableText(row.departure_reason),
    emergencyContactName: nullableText(row.emergency_contact_name),
    emergencyContactRelationship: nullableText(row.emergency_contact_relationship),
    emergencyContactPhone: nullableText(row.emergency_contact_phone),
    emergencyContactAddress: nullableText(row.emergency_contact_address),
    waistSize: nullableText(row.waist_size),
    chestSize: nullableText(row.chest_size),
    fullHeightSize: nullableText(row.full_height_size),
    inseamSize: nullableText(row.inseam_size),
    hipSize: nullableText(row.hip_size),
    weightKg: nullableText(row.weight_kg),
    shoeSize: nullableText(row.shoe_size),
    coverallSize: nullableText(row.coverall_size),
    pantsSize: nullableText(row.pants_size),
    jacketSize: nullableText(row.jacket_size),
    deckCertificateLabel: nullableText(row.deck_certificate_label),
    engineCertificateLabel: nullableText(row.engine_certificate_label),
    craneTrainingOn: nullableText(row.crane_training_on),
    craneInductionOn: nullableText(row.crane_induction_on),
    active: row.active,
  }));
}

export function mapHrDocumentRows(rows: HrDocumentRow[]): HrDocumentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    personName: nullableText(row.person_name),
    personSharePointItemId: nullableText(row.person_sharepoint_item_id),
    categoryKey: row.category_key || 'administrative',
    title: row.title,
    status: normalizeStatus(row.status),
    issuedOn: nullableText(row.issued_on),
    expiresOn: nullableText(row.expires_on),
    requiresCaptainValidation: row.requires_captain_validation === true,
    medicalRestriction: nullableText(row.medical_restriction),
    medicalBridgeWatch:
      row.medical_bridge_watch === null || row.medical_bridge_watch === undefined ? null : row.medical_bridge_watch === true,
    medicalUnfit: row.medical_unfit === true,
    sourceLabel: nullableText(row.source_label),
    notes: nullableText(row.notes),
    fileUrl: nullableText(row.file_url),
    storageBucket: nullableText(row.storage_bucket),
    storagePath: nullableText(row.storage_path),
    fileSizeBytes: nullableNumber(row.file_size_bytes),
    mimeType: nullableText(row.mime_type),
  }));
}

function isSedentary(person: PersonRecord): boolean {
  const searchable = normalizeSearchValue(`${person.gradeLabel} ${person.roleLabel} ${person.functionLabel}`);
  return searchable.includes('sedentaire') || searchable.includes('direction') || searchable.includes('yard manager');
}

function isTrainee(person: PersonRecord): boolean {
  return normalizeSearchValue(`${person.roleLabel} ${person.functionLabel} ${person.gradeLabel}`).includes('stagiaire');
}

function hasContractReady(person: PersonRecord): boolean {
  return Boolean(person.contractType);
}

function hasEmergencyContactReady(person: PersonRecord): boolean {
  return Boolean(person.emergencyContactName && person.emergencyContactPhone);
}

function hasHabilitationReady(person: PersonRecord): boolean {
  return Boolean(
    person.deckCertificateLabel || person.engineCertificateLabel || person.craneTrainingOn || person.craneInductionOn,
  );
}

function parseIsoDate(value: string): Date | null {
  const date = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function roundMetric(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function buildStrategicMetrics(
  people: PersonRecord[],
  activePeople: PersonDashboardRecord[],
  documentsByPersonId: Map<number, HrDocumentRecord[]>,
) {
  const today = new Date();
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setFullYear(today.getFullYear() - 1);
  const departuresLastTwelveMonths = people.filter((person) => {
    const departedOn = parseIsoDate(person.departedOn);
    return departedOn && departedOn >= twelveMonthsAgo && departedOn <= today;
  }).length;
  const headcountAtPeriodStart = people.filter((person) => {
    const hiredOn = parseIsoDate(person.hiredOn);
    const departedOn = parseIsoDate(person.departedOn);
    return (!hiredOn || hiredOn <= twelveMonthsAgo) && (!departedOn || departedOn > twelveMonthsAgo);
  }).length;
  const averageHeadcount = (headcountAtPeriodStart + activePeople.length) / 2;
  const tenureYears = activePeople.flatMap((person) => {
    const hiredOn = parseIsoDate(person.hiredOn);
    return hiredOn ? [(today.getTime() - hiredOn.getTime()) / (365.25 * 24 * 60 * 60 * 1000)] : [];
  });
  const peopleRequiringMedicalVisit = activePeople.filter((person) => !isSedentary(person) && !isTrainee(person));
  const medicallyCompliant = peopleRequiringMedicalVisit.filter((person) =>
    (documentsByPersonId.get(person.id) || []).some(
      (document) =>
        document.categoryKey === 'medical_visit' &&
        (document.status === 'valid' || document.status === 'renew_due') &&
        !document.medicalUnfit,
    ),
  ).length;

  return {
    turnoverRate: averageHeadcount > 0 ? roundMetric((departuresLastTwelveMonths / averageHeadcount) * 100) : 0,
    averageTenureYears:
      tenureYears.length > 0 ? roundMetric(tenureYears.reduce((total, value) => total + value, 0) / tenureYears.length) : 0,
    medicalComplianceRate:
      peopleRequiringMedicalVisit.length > 0
        ? Math.round((medicallyCompliant / peopleRequiringMedicalVisit.length) * 100)
        : 0,
  };
}

function buildCategorySummaries(documents: HrDocumentRecord[]): PersonCategorySummary[] {
  const summaries = documents.reduce<Map<string, PersonCategorySummary>>((result, document) => {
    const current = result.get(document.categoryKey) || {
      key: document.categoryKey,
      label: getHrDocumentCategoryLabel(document.categoryKey),
      count: 0,
      urgentCount: 0,
      renewalDueCount: 0,
    };

    current.count += 1;
    current.urgentCount += isHrDocumentUrgent(document) ? 1 : 0;
    current.renewalDueCount += isHrDocumentRenewalDue(document) ? 1 : 0;
    result.set(document.categoryKey, current);

    return result;
  }, new Map<string, PersonCategorySummary>());

  return [...summaries.values()].sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export function buildHumanResourcesDashboard(
  people: PersonRecord[],
  documents: HrDocumentRecord[],
): HumanResourcesDashboard {
  const documentsByPersonId = documents.reduce<Map<number, HrDocumentRecord[]>>((result, document) => {
    if (document.personId === null) {
      return result;
    }

    result.set(document.personId, (result.get(document.personId) || []).concat(document));
    return result;
  }, new Map<number, HrDocumentRecord[]>());

  const dashboardPeople = people.map<PersonDashboardRecord>((person) => {
    const personDocuments = documentsByPersonId.get(person.id) || [];

    return {
      ...person,
      documents: personDocuments,
      categorySummaries: buildCategorySummaries(personDocuments),
    };
  });

  const activePeople = dashboardPeople.filter((person) => person.active);
  const groupMap = dashboardPeople.reduce<Map<string, PersonDashboardRecord[]>>((result, person) => {
    const groupLabel = normalizeHrFunctionLabel(person.functionLabel);

    if (!groupLabel) {
      return result;
    }

    result.set(groupLabel, (result.get(groupLabel) || []).concat(person));
    return result;
  }, new Map<string, PersonDashboardRecord[]>());
  const strategicMetrics = buildStrategicMetrics(people, activePeople, documentsByPersonId);

  return {
    metrics: {
      activePeople: activePeople.length,
      sedentaryPeople: activePeople.filter(isSedentary).length,
      seafarerPeople: activePeople.filter((person) => !isSedentary(person) && !isTrainee(person)).length,
      trainees: activePeople.filter(isTrainee).length,
      documents: documents.length,
      renewalDue: documents.filter(isHrDocumentRenewalDue).length,
      urgent: documents.filter(isHrDocumentUrgent).length,
      missing: documents.filter((document) => document.status === 'missing').length,
      expiredDocuments: documents.filter((document) => document.status === 'expired').length,
      certificateRenewals: documents.filter(
        (document) => isCertificateLikeDocument(document) && isHrDocumentRenewalDue(document),
      ).length,
      medicalVisitRenewals: documents.filter(
        (document) => document.categoryKey === 'medical_visit' && isHrDocumentRenewalDue(document),
      ).length,
      unassignedDocuments: documents.filter((document) => document.personId === null).length,
      contractsReady: activePeople.filter(hasContractReady).length,
      emergencyContactsReady: activePeople.filter(hasEmergencyContactReady).length,
      habilitationsReady: activePeople.filter(hasHabilitationReady).length,
      ...strategicMetrics,
    },
    groups: [...groupMap.entries()]
      .map(([label, peopleInGroup]) => ({
        label,
        people: peopleInGroup.sort((left, right) => formatPersonName(left).localeCompare(formatPersonName(right), 'fr')),
      }))
      .sort((left, right) => compareHrFunctionLabels(left.label, right.label)),
  };
}

export function buildStaffEvolution(
  people: PersonRecord[],
  years: number[] = [2020, 2021, 2022, 2023, 2024, 2025, 2026],
): StaffEvolutionPoint[] {
  const activePeople = people.filter((person) => person.active);
  const sortedYears = [...years].sort((left, right) => left - right);
  const latestYear = sortedYears[sortedYears.length - 1];

  return sortedYears.map((year) => ({
    year,
    count: activePeople.filter((person) => {
      if (!person.hiredOn) {
        return year === latestYear;
      }

      const hiredYear = Number(person.hiredOn.slice(0, 4));

      if (!Number.isFinite(hiredYear)) {
        return year === latestYear;
      }

      return hiredYear <= year;
    }).length,
  }));
}

export async function fetchPeople(client: SupabaseClient): Promise<PersonRecord[]> {
  const { data, error } = await client
    .from('people')
    .select(PEOPLE_SELECT)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPersonRows((data || []) as unknown as PersonRow[]);
}

export async function fetchHrDocuments(client: SupabaseClient): Promise<HrDocumentRecord[]> {
  const { data, error } = await client.from('hr_documents').select(HR_DOCUMENT_SELECT).order('expires_on', {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    throw error;
  }

  return mapHrDocumentRows((data || []) as unknown as HrDocumentRow[]);
}

export async function fetchHrDocumentTypes(client: SupabaseClient): Promise<HrDocumentTypeOption[]> {
  const { data, error } = await client
    .from('stcw_certificates')
    .select(HR_DOCUMENT_TYPE_SELECT)
    .eq('active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapHrDocumentTypeRows((data || []) as unknown as HrDocumentTypeRow[]);
}

function mapHrVisibilityRules(rows: HrVisibilityRuleRow[]): HrVisibilityRule[] {
  return rows.map((row) => ({
    scope: row.scope,
    itemKey: row.item_key,
    itemLabel: row.item_label,
    visibleToRoles: (row.visible_to_roles || []).filter(
      (role): role is RoleKey =>
        role === 'admin' || role === 'direction' || role === 'armement' || role === 'capitaine' || role === 'marin',
    ),
  }));
}

export async function fetchHrVisibilityRules(client: SupabaseClient): Promise<HrVisibilityRule[]> {
  const { data, error } = await client
    .from('hr_visibility_rules')
    .select('scope, item_key, item_label, visible_to_roles')
    .order('scope', { ascending: true })
    .order('item_label', { ascending: true });

  if (error) {
    throw error;
  }

  return mapHrVisibilityRules((data || []) as unknown as HrVisibilityRuleRow[]);
}

export async function saveHrVisibilityRules(
  client: SupabaseClient,
  rules: HrVisibilityRule[],
): Promise<HrVisibilityRule[]> {
  const payload = rules.map((rule) => ({
    scope: rule.scope,
    item_key: rule.itemKey,
    item_label: rule.itemLabel,
    visible_to_roles: Array.from(new Set(['admin', ...rule.visibleToRoles])),
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await client
    .from('hr_visibility_rules')
    .upsert(payload, { onConflict: 'scope,item_key' })
    .select('scope, item_key, item_label, visible_to_roles');

  if (error) {
    throw error;
  }

  return mapHrVisibilityRules((data || []) as unknown as HrVisibilityRuleRow[]);
}

export async function fetchHumanResourcesData(client: SupabaseClient): Promise<HumanResourcesData> {
  const [people, documents, documentTypes, visibilityRules] = await Promise.all([
    fetchPeople(client),
    fetchHrDocuments(client),
    fetchHrDocumentTypes(client).catch(() => []),
    fetchHrVisibilityRules(client).catch(() => []),
  ]);

  return {
    people,
    documents,
    documentTypes: documentTypes.length > 0 ? documentTypes : buildDocumentTypeFallback(documents),
    visibilityRules,
  };
}

export async function createPerson(client: SupabaseClient, input: CreatePersonInput): Promise<PersonRecord> {
  const payload = buildPersonDetailsPayload(input);
  const { data, error } = await client.from('people').insert(payload).select(PEOPLE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPersonRows([data as unknown as PersonRow])[0];
}

export async function updatePersonActive(
  client: SupabaseClient,
  personId: number,
  active: boolean,
): Promise<PersonRecord> {
  const { data, error } = await client.from('people').update({ active }).eq('id', personId).select(PEOPLE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPersonRows([data as unknown as PersonRow])[0];
}

function isDuplicateStorageObjectError(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) {
    return false;
  }

  const message = normalizeSearchValue(error.message || '');
  return error.statusCode === 409 || message.includes('already exists') || message.includes('duplicate');
}

export async function createHrDocument(
  client: SupabaseClient,
  input: CreateHrDocumentInput,
): Promise<HrDocumentRecord> {
  const documentTypeName = input.documentType.fileName || input.documentType.name;
  const fileName = buildGeneratedHrDocumentFileNameFromType(
    input.person,
    documentTypeName,
    input.dueDate,
    input.file.name,
  );

  if (!fileName) {
    throw new Error('Le nom du nouveau document ne peut pas etre genere.');
  }

  const storagePath = buildHrDocumentStoragePath(input.person, fileName);
  const { error: uploadError } = await client.storage.from(HR_DOCUMENT_STORAGE_BUCKET).upload(storagePath, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    if (isDuplicateStorageObjectError(uploadError)) {
      throw new Error(`Le fichier "${fileName}" existe deja. Modifiez le document ou la date d echeance.`);
    }

    throw uploadError;
  }

  const isMedicalVisit = input.documentType.categoryKey === 'medical_visit';
  const payload = {
    person_id: input.person.id,
    person_name: formatPersonName(input.person),
    category_key: input.documentType.categoryKey,
    title: stripFileExtension(fileName),
    status: statusFromDueDate(input.dueDate),
    expires_on: input.dueDate,
    requires_captain_validation: false,
    source_label: 'supabase',
    notes: null,
    file_url: null,
    storage_bucket: HR_DOCUMENT_STORAGE_BUCKET,
    storage_path: storagePath,
    file_size_bytes: input.file.size,
    mime_type: input.file.type || null,
    medical_restriction: isMedicalVisit ? optionalText(input.medicalRestriction) : null,
    medical_bridge_watch: isMedicalVisit && !input.medicalUnfit ? input.medicalBridgeWatch ?? null : null,
    medical_unfit: isMedicalVisit && input.medicalUnfit === true,
  };
  const { data, error } = await client.from('hr_documents').insert(payload).select(HR_DOCUMENT_SELECT).single();

  if (error) {
    await client.storage.from(HR_DOCUMENT_STORAGE_BUCKET).remove([storagePath]);
    throw error;
  }

  return mapHrDocumentRows([data as unknown as HrDocumentRow])[0];
}

export async function renewHrDocument(client: SupabaseClient, input: RenewHrDocumentInput): Promise<HrDocumentRecord> {
  const fileName = buildGeneratedHrDocumentFileName(input.person, input.document, input.dueDate, input.file.name);

  if (!fileName) {
    throw new Error('Le nom du document renouvele ne peut pas etre genere.');
  }

  const storagePath = buildHrDocumentStoragePath(input.person, fileName);
  const { error: uploadError } = await client.storage.from(HR_DOCUMENT_STORAGE_BUCKET).upload(storagePath, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const payload = {
    title: stripFileExtension(fileName),
    status: statusFromDueDate(input.dueDate),
    expires_on: input.dueDate,
    source_label: 'supabase',
    file_url: null,
    storage_bucket: HR_DOCUMENT_STORAGE_BUCKET,
    storage_path: storagePath,
    file_size_bytes: input.file.size,
    mime_type: input.file.type || null,
    renewed_at: new Date().toISOString(),
    medical_restriction:
      input.document.categoryKey === 'medical_visit' ? optionalText(input.medicalRestriction) : input.document.medicalRestriction || null,
    medical_bridge_watch:
      input.document.categoryKey === 'medical_visit'
        ? input.medicalUnfit
          ? null
          : input.medicalBridgeWatch ?? null
        : input.document.medicalBridgeWatch,
    medical_unfit:
      input.document.categoryKey === 'medical_visit' ? input.medicalUnfit === true : input.document.medicalUnfit,
  };
  const { data, error } = await client.from('hr_documents').update(payload).eq('id', input.document.id).select(HR_DOCUMENT_SELECT).single();

  if (error) {
    await client.storage.from(HR_DOCUMENT_STORAGE_BUCKET).remove([storagePath]);
    throw error;
  }

  if (
    input.document.storageBucket === HR_DOCUMENT_STORAGE_BUCKET &&
    input.document.storagePath &&
    input.document.storagePath !== storagePath
  ) {
    await client.storage.from(HR_DOCUMENT_STORAGE_BUCKET).remove([input.document.storagePath]);
  }

  return mapHrDocumentRows([data as unknown as HrDocumentRow])[0];
}

export async function updateHrDocumentMedicalDetails(
  client: SupabaseClient,
  documentId: number,
  input: UpdateHrDocumentMedicalInput,
): Promise<HrDocumentRecord> {
  const payload = {
    medical_restriction: optionalText(input.medicalRestriction),
    medical_bridge_watch: input.medicalUnfit ? null : input.medicalBridgeWatch,
    medical_unfit: input.medicalUnfit,
  };
  const { data, error } = await client.from('hr_documents').update(payload).eq('id', documentId).select(HR_DOCUMENT_SELECT).single();

  if (error) {
    throw error;
  }

  return mapHrDocumentRows([data as unknown as HrDocumentRow])[0];
}

export async function createHrDocumentSignedUrl(client: SupabaseClient, document: HrDocumentRecord): Promise<string> {
  if (document.storageBucket && document.storagePath) {
    const { data, error } = await client.storage.from(document.storageBucket).createSignedUrl(document.storagePath, 60);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  if (document.fileUrl) {
    return document.fileUrl;
  }

  throw new Error(`Le document "${document.title}" n a pas de fichier associe.`);
}

export async function downloadHrDocumentBlob(client: SupabaseClient, document: HrDocumentRecord): Promise<Blob> {
  if (document.storageBucket && document.storagePath) {
    const { data, error } = await client.storage.from(document.storageBucket).download(document.storagePath);

    if (error) {
      throw error;
    }

    return data;
  }

  const url = await createHrDocumentSignedUrl(client, document);
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Impossible de telecharger "${document.title}".`);
  }

  return response.blob();
}

export async function updatePersonDetails(
  client: SupabaseClient,
  personId: number,
  input: UpdatePersonDetailsInput,
): Promise<PersonRecord> {
  const payload = buildPersonDetailsPayload(input);
  const { data, error } = await client.from('people').update(payload).eq('id', personId).select(PEOPLE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPersonRows([data as unknown as PersonRow])[0];
}

function buildPersonDetailsPayload(input: CreatePersonInput | UpdatePersonDetailsInput) {
  return {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email: optionalText(input.email),
    function_label: optionalText(input.functionLabel),
    grade_label: optionalText(input.gradeLabel),
    role_label: optionalText(input.roleLabel),
    register_label: optionalText(input.registerLabel),
    sex: optionalText(input.sex),
    sailor_number: optionalText(input.sailorNumber),
    m365_account: optionalText(input.m365Account),
    phone: optionalText(input.phone),
    postal_address: optionalText(input.postalAddress),
    birth_date: optionalText(input.birthDate),
    birth_place: optionalText(input.birthPlace),
    identity_document_number: optionalText(input.identityDocumentNumber),
    identity_document_type: optionalText(input.identityDocumentType),
    contract_type: optionalText(input.contractType),
    hired_on: optionalText(input.hiredOn),
    departed_on: optionalText(input.departedOn),
    departure_reason: optionalText(input.departureReason),
    emergency_contact_name: optionalText(input.emergencyContactName),
    emergency_contact_relationship: optionalText(input.emergencyContactRelationship),
    emergency_contact_phone: optionalText(input.emergencyContactPhone),
    emergency_contact_address: optionalText(input.emergencyContactAddress),
    waist_size: optionalNumber(input.waistSize),
    chest_size: optionalNumber(input.chestSize),
    full_height_size: optionalNumber(input.fullHeightSize),
    inseam_size: optionalNumber(input.inseamSize),
    hip_size: optionalNumber(input.hipSize),
    weight_kg: optionalNumber(input.weightKg),
    shoe_size: optionalNumber(input.shoeSize),
    coverall_size: optionalText(input.coverallSize),
    pants_size: optionalText(input.pantsSize),
    jacket_size: optionalText(input.jacketSize),
    deck_certificate_label: optionalText(input.deckCertificateLabel),
    engine_certificate_label: optionalText(input.engineCertificateLabel),
    crane_training_on: optionalText(input.craneTrainingOn),
    crane_induction_on: optionalText(input.craneInductionOn),
  };
}
