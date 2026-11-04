import { buildCollaboratorSheetSections } from './collaboratorSheet';
import {
  compareHrFunctionLabels,
  formatPersonName,
  getHrDocumentCategoryLabel,
  getPersonEmploymentPeriods,
  HR_PRIMARY_FUNCTIONS,
  HR_SEDENTARY_FUNCTIONS,
  isPersonEmployedOn,
  isPersonFormerOn,
  normalizeHrFunctionLabel,
  type HrDocumentRecord,
  type HrDocumentTypeOption,
  type PersonRecord,
} from './peopleQueries';

export const QUALIFICATIONS_MATRIX_CATEGORIES = [
  { key: 'deck', label: getHrDocumentCategoryLabel('deck') },
  { key: 'engine', label: getHrDocumentCategoryLabel('engine') },
  { key: 'safety_training', label: getHrDocumentCategoryLabel('safety_training') },
  { key: 'medical_visit', label: getHrDocumentCategoryLabel('medical_visit') },
  { key: 'safety_induction', label: getHrDocumentCategoryLabel('safety_induction') },
  { key: 'lifting', label: getHrDocumentCategoryLabel('lifting') },
] as const;

export type QualificationsMatrixCategoryKey = typeof QUALIFICATIONS_MATRIX_CATEGORIES[number]['key'];

export const QUALIFICATIONS_MATRIX_STATUS_LABELS: Readonly<Record<HrDocumentRecord['status'], string>> = {
  valid: 'À jour',
  renew_due: 'À renouveler',
  expired: 'Échu',
  missing: 'Manquant',
  pending_validation: 'Validation',
};

export interface QualificationsMatrixDocument {
  documentId: number;
  title: string;
  expiresOn: string;
  expiresOnLabel: string;
  status: HrDocumentRecord['status'];
  statusLabel: string;
}

export interface QualificationsMatrixPerson {
  personId: number;
  personName: string;
  functionLabel: string;
  active: boolean;
  employmentStatusLabel: string;
  categories: Record<QualificationsMatrixCategoryKey, QualificationsMatrixDocument[]>;
}

export interface QualificationsMatrixGroup {
  functionLabel: string;
  people: QualificationsMatrixPerson[];
}

export interface QualificationsMatrix {
  categories: Array<{ key: QualificationsMatrixCategoryKey; label: string }>;
  groups: QualificationsMatrixGroup[];
  peopleCount: number;
}

export interface QualificationsMatrixInput {
  /** Only people, documents and catalogue entries already authorized for the real account. */
  people: readonly PersonRecord[];
  documents: readonly HrDocumentRecord[];
  documentTypes?: readonly HrDocumentTypeOption[];
  visibleCategoryKeys: ReadonlySet<string>;
  asOf?: string;
  population?: 'all' | 'current';
  includeTrainees?: boolean;
}

const nameCollator = new Intl.Collator('fr-FR', { sensitivity: 'base', numeric: true });
const documentSections = new Set(['documents']);

function normalizePopulationLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
}

/** Use the RH roles and function catalogue, without treating a missing medical visit as a seafarer classification. */
export function isQualificationsMatrixSeafarer(person: PersonRecord): boolean {
  const functionLabel = normalizeHrFunctionLabel(person.functionLabel);
  const population = normalizePopulationLabel(`${person.roleLabel} ${person.gradeLabel} ${person.registerLabel}`);
  if (population.includes('sedentaire')) return false;
  if (HR_SEDENTARY_FUNCTIONS.some((label) => normalizePopulationLabel(label) === normalizePopulationLabel(functionLabel))) return false;
  return HR_PRIMARY_FUNCTIONS.some((label) => label === functionLabel)
    || /\b(?:navigant|marin)\b/.test(population) || Boolean(person.sailorNumber.trim());
}

function parisDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function employmentStatusLabel(person: PersonRecord, asOf: string): string {
  if (isPersonEmployedOn(person, asOf)) return 'En poste';
  if (isPersonFormerOn(person, asOf)) return 'Ancien';
  return getPersonEmploymentPeriods(person).some((period) => period.hiredOn > asOf) ? 'À venir' : 'Non renseigné';
}

function emptyCategories(): QualificationsMatrixPerson['categories'] {
  return { deck: [], engine: [], safety_training: [], medical_visit: [], safety_induction: [], lifting: [] };
}

function nameWords(value: string): Array<{ value: string; end: number }> {
  return [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu)].map((match) => ({
    value: normalizePopulationLabel(match[0]), end: match.index + match[0].length,
  }));
}

function withoutDocumentExtension(value: string): string {
  return value.trim().replace(/\.(?:pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|jpe?g|png|gif|webp|tiff?|bmp|heic)$/iu, '').trim();
}

function certificateNameWithoutPerson(title: string, document: HrDocumentRecord, person: PersonRecord): string {
  const titleWords = nameWords(title);
  const identities = [
    { name: document.personName, requireDelimiter: false },
    { name: formatPersonName(person), requireDelimiter: !person.firstName.trim() || !person.lastName.trim() },
    { name: `${person.lastName} ${person.firstName}`, requireDelimiter: !person.firstName.trim() || !person.lastName.trim() },
    { name: person.lastName, requireDelimiter: true },
  ].map(({ name, requireDelimiter }) => ({ words: nameWords(name), requireDelimiter }))
    .filter(({ words }) => words.length > 0 && words.length < titleWords.length)
    .sort((left, right) => right.words.length - left.words.length);
  for (const identity of identities) {
    if (!identity.words.every((word, index) => word.value === titleWords[index].value)) continue;
    const end = titleWords[identity.words.length - 1].end;
    const remainder = title.slice(end);
    // A surname alone needs an explicit delimiter, so a certificate beginning
    // with the same single word is not treated as a person's file prefix.
    if ((identity.requireDelimiter || identity.words.length === 1) && !/^\s*[-–—_:|]/u.test(remainder)) continue;
    return remainder.replace(/^[-\s_–—:|]+/u, '').trim();
  }
  return title;
}

function withoutCertificateYear(value: string): string {
  return value.replace(/[-\s_–—:|]+(?:19|20|21)\d{2}\s*$/u, '').trim();
}

function normalizeCertificateName(value: string): string {
  const normalized = nameWords(value).map((word) => word.value).join(' ');
  // Keep the historical aliases already recognized by the individual RH sheet.
  if (normalized === 'cquali') return 'cqali';
  if (normalized === 'hse induction') return 'lems hse induction';
  return normalized;
}

function matrixCertificateTitle(document: HrDocumentRecord, person: PersonRecord, documentTypes: readonly HrDocumentTypeOption[]): string {
  const rawTitle = withoutDocumentExtension(document.title);
  const title = certificateNameWithoutPerson(rawTitle, document, person);
  const withoutYear = withoutCertificateYear(title);
  // Prefer a real complete catalogue label before interpreting any part of it
  // as a person prefix or an annual filename suffix.
  for (const candidate of [rawTitle, withoutCertificateYear(rawTitle), title, withoutYear]) {
    const normalized = normalizeCertificateName(candidate);
    if (!normalized) continue;
    const names = new Set(documentTypes.filter((type) => type.id > 0 && type.categoryKey === document.categoryKey
      && [withoutDocumentExtension(type.fileName), type.name].some((name) => normalizeCertificateName(name) === normalized))
      .map((type) => type.name.trim()).filter(Boolean));
    if (names.size === 1) return [...names][0];
    if (names.size > 1) break;
  }
  // Unknown, ambiguous and synthetic fallback types do not establish a
  // catalogue identity. Keep only the reliably cleaned document label.
  return withoutYear || title || 'Non renseigné';
}

/** Project the authorized RH records into qualification metadata only; no network or document file is read. */
export function buildQualificationsMatrix({
  people, documents, documentTypes = [], visibleCategoryKeys, asOf = parisDateKey(),
  population = 'all', includeTrainees = true,
}: QualificationsMatrixInput): QualificationsMatrix {
  const categories = QUALIFICATIONS_MATRIX_CATEGORIES.filter(({ key }) => visibleCategoryKeys.has(key))
    .map(({ key, label }) => ({ key, label }));
  const categoryKeys = new Set<string>(categories.map(({ key }) => key));
  const seafarers = [...new Map(people.filter((person) => isQualificationsMatrixSeafarer(person)
    && (population === 'all' || (person.active && isPersonEmployedOn(person, asOf)))
    && (includeTrainees || !normalizePopulationLabel(`${person.roleLabel} ${person.gradeLabel} ${person.functionLabel}`).includes('stagiaire')))
    .map((person) => [person.id, person])).values()];
  const personIds = new Set(seafarers.map((person) => person.id));
  const ownDocuments = new Map<number, HrDocumentRecord>();
  for (const document of documents) {
    if (document.personId !== null && personIds.has(document.personId) && categoryKeys.has(document.categoryKey)
      && !ownDocuments.has(document.id)) ownDocuments.set(document.id, document);
  }
  const documentsByPerson = new Map<number, HrDocumentRecord[]>();
  for (const document of ownDocuments.values()) {
    if (document.personId === null) continue;
    const own = documentsByPerson.get(document.personId) || [];
    own.push(document);
    documentsByPerson.set(document.personId, own);
  }

  const groups = new Map<string, QualificationsMatrixPerson[]>();
  seafarers.sort((left, right) => nameCollator.compare(left.lastName, right.lastName)
    || nameCollator.compare(left.firstName, right.firstName) || left.id - right.id);
  for (const person of seafarers) {
    const functionLabel = normalizeHrFunctionLabel(person.functionLabel) || 'Fonction non renseignée';
    const row: QualificationsMatrixPerson = {
      personId: person.id, personName: formatPersonName(person) || 'Non renseigné', functionLabel,
      active: person.active, employmentStatusLabel: employmentStatusLabel(person, asOf), categories: emptyCategories(),
    };
    for (const document of documentsByPerson.get(person.id) || []) {
      // Reuse the individual sheet's date format and saved status. Matrix titles
      // also support historical person prefixes without changing stored records.
      const certificateSections = buildCollaboratorSheetSections(person, [document], documentSections);
      const certificate = certificateSections[0]?.table?.rows[0];
      if (!certificate) continue;
      const hasExpiry = certificate.expiresOn !== 'Non renseigné';
      row.categories[document.categoryKey as QualificationsMatrixCategoryKey].push({
        documentId: document.id, title: matrixCertificateTitle(document, person, documentTypes),
        expiresOn: hasExpiry ? document.expiresOn.slice(0, 10) : '',
        expiresOnLabel: hasExpiry ? certificate.expiresOn : 'Non renseignée',
        status: document.status, statusLabel: certificate.status,
      });
    }
    for (const category of categories) {
      row.categories[category.key].sort((left, right) => nameCollator.compare(left.title, right.title)
        || left.expiresOn.localeCompare(right.expiresOn) || left.documentId - right.documentId);
    }
    const group = groups.get(functionLabel) || [];
    group.push(row);
    groups.set(functionLabel, group);
  }
  return {
    categories,
    groups: [...groups].map(([functionLabel, groupPeople]) => ({ functionLabel, people: groupPeople }))
      .sort((left, right) => compareHrFunctionLabels(left.functionLabel, right.functionLabel)),
    peopleCount: seafarers.length,
  };
}
