import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  Upload,
  Search,
  Settings2,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import JSZip from 'jszip';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import type { RoleKey } from '../permissions/roles';
import {
  buildStaffEvolution,
  buildHumanResourcesDashboard,
  buildGeneratedHrDocumentFileName,
  compareHrFunctionLabels,
  createPerson,
  createHrDocumentSignedUrl,
  downloadHrDocumentBlob,
  fetchHumanResourcesData,
  formatPersonName,
  getHrDocumentCategoryLabel,
  getHrFunctionVisibilityKey,
  HR_DOCUMENT_CATEGORY_LABELS,
  HR_PRIMARY_FUNCTIONS,
  isHrDocumentRenewalDue,
  normalizeHrFunctionLabel,
  renewHrDocument,
  saveHrVisibilityRules,
  stripFileExtension,
  updateHrDocumentMedicalDetails,
  updatePersonDetails,
  updatePersonActive,
  type HrDocumentRecord,
  type HrVisibilityRule,
  type HrVisibilityScope,
  type PersonDashboardRecord,
  type PersonRecord,
  type UpdateHrDocumentMedicalInput,
  type UpdatePersonDetailsInput,
} from './peopleQueries';

interface HumanResourcesPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface PersonFormState {
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
}

interface HrFilterState {
  collaboratorId: string;
  functionKey: string;
  categoryKey: string;
  status: string;
  dueState: string;
}

const EMPTY_FORM: PersonFormState = {
  firstName: '',
  lastName: '',
  email: '',
  functionLabel: '',
  gradeLabel: '',
  roleLabel: '',
  registerLabel: '',
  sex: '',
  sailorNumber: '',
  m365Account: '',
};

const EMPTY_FILTERS: HrFilterState = {
  collaboratorId: '',
  functionKey: '',
  categoryKey: '',
  status: '',
  dueState: '',
};

const DOCUMENT_STATUS_LABELS: Record<HrDocumentRecord['status'], string> = {
  valid: 'A jour',
  renew_due: 'A renouveler',
  expired: 'Echu',
  missing: 'Manquant',
  pending_validation: 'Validation',
};

const DOCUMENT_STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Tous', value: '' },
  { label: 'A jour', value: 'valid' },
  { label: 'A renouveler', value: 'renew_due' },
  { label: 'Echu', value: 'expired' },
  { label: 'Manquant', value: 'missing' },
  { label: 'Validation', value: 'pending_validation' },
];

const DOCUMENT_DUE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Toutes', value: '' },
  { label: 'A renouveler', value: 'renewal_due' },
  { label: 'Urgent', value: 'urgent' },
  { label: 'Documents echus', value: 'expired' },
  { label: 'Documents manquants', value: 'missing' },
];

const HR_CATEGORY_ORDER = [
  'deck',
  'engine',
  'safety_training',
  'medical_visit',
  'lifting',
  'safety_induction',
  'certificate',
  'administrative',
];

const HR_DETAILS_SECTIONS = [
  { key: 'identity', label: 'Identite et poste' },
  { key: 'contract', label: 'Contrat et dates' },
  { key: 'contact', label: 'Coordonnees' },
  { key: 'emergency', label: 'Contact urgence' },
  { key: 'administrative', label: 'Documents administratifs' },
  { key: 'health', label: 'Sante et habilitations' },
  { key: 'clothing', label: 'Tenues et mensurations' },
] as const;

type HrDetailsSectionKey = (typeof HR_DETAILS_SECTIONS)[number]['key'];

const HR_VISIBILITY_ROLES: Array<{ key: RoleKey; label: string }> = [
  { key: 'admin', label: 'Admin' },
  { key: 'direction', label: 'Direction' },
  { key: 'armement', label: 'Armement' },
  { key: 'capitaine', label: 'Capitaine' },
  { key: 'marin', label: 'Marin' },
];

const DEFAULT_VISIBILITY_ROLES = HR_VISIBILITY_ROLES.map((role) => role.key);

function isVisibilityItemAllowed(
  rules: HrVisibilityRule[],
  scope: HrVisibilityScope,
  itemKey: string,
  roles: RoleKey[],
): boolean {
  if (roles.includes('admin')) {
    return true;
  }

  const rule = rules.find((candidate) => candidate.scope === scope && candidate.itemKey === itemKey);
  return !rule || roles.some((role) => rule.visibleToRoles.includes(role));
}

function buildVisibilityCatalog(
  people: PersonRecord[],
  documents: HrDocumentRecord[],
  savedRules: HrVisibilityRule[],
): HrVisibilityRule[] {
  const catalog = new Map<string, HrVisibilityRule>();
  const addItem = (scope: HrVisibilityScope, itemKey: string, itemLabel: string) => {
    if (!itemKey || !itemLabel) {
      return;
    }

    const savedRule = savedRules.find((rule) => rule.scope === scope && rule.itemKey === itemKey);
    catalog.set(`${scope}:${itemKey}`, savedRule || { scope, itemKey, itemLabel, visibleToRoles: DEFAULT_VISIBILITY_ROLES });
  };

  HR_PRIMARY_FUNCTIONS.forEach((label) => addItem('function', getHrFunctionVisibilityKey(label), label));
  people.forEach((person) => {
    const label = normalizeHrFunctionLabel(person.functionLabel);
    addItem('function', getHrFunctionVisibilityKey(label), label);
  });
  Object.entries(HR_DOCUMENT_CATEGORY_LABELS).forEach(([key, label]) => addItem('document_type', key, label));
  documents.forEach((document) => addItem('document_type', document.categoryKey, getHrDocumentCategoryLabel(document.categoryKey)));
  HR_DETAILS_SECTIONS.forEach((section) => addItem('section', section.key, section.label));

  return [...catalog.values()].sort((left, right) => {
    const scopeOrder: HrVisibilityScope[] = ['function', 'document_type', 'section'];
    const scopeDifference = scopeOrder.indexOf(left.scope) - scopeOrder.indexOf(right.scope);

    if (scopeDifference !== 0) {
      return scopeDifference;
    }

    return left.scope === 'function'
      ? compareHrFunctionLabels(left.itemLabel, right.itemLabel)
      : left.itemLabel.localeCompare(right.itemLabel, 'fr');
  });
}

const SHAREPOINT_SITE_ORIGIN = 'https://bbtm668.sharepoint.com';

function canManagePersonnel(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function sortPeople(people: PersonRecord[]): PersonRecord[] {
  return [...people].sort((left, right) =>
    left.lastName.localeCompare(right.lastName, 'fr') ||
    left.firstName.localeCompare(right.firstName, 'fr'),
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isHiddenSharePointLibraryNote(value: string): boolean {
  const normalized = normalizeSearch(value)
    .replace(/\\/g, '/')
    .replace(/%20/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    normalized.includes('sites/qhse/brevets et visites medicales') ||
    normalized.includes('sites/qhse/brevets et visites mdicales')
  );
}

function getDocumentNotesForDisplay(notes: string): string {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isHiddenSharePointLibraryNote(line))
    .join('\n');
}

function getDocumentFileHref(fileUrl: string): string {
  const trimmed = fileUrl.trim().replace(/\\/g, '/');

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^\/?sites\//i.test(trimmed)) {
    return encodeURI(`${SHAREPOINT_SITE_ORIGIN}/${trimmed.replace(/^\/+/, '')}`);
  }

  return trimmed;
}

function personMatchesSearch(person: PersonRecord, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = normalizeSearch(
    [
      person.firstName,
      person.lastName,
      person.email,
      person.functionLabel,
      person.gradeLabel,
      person.roleLabel,
      person.registerLabel,
      person.sailorNumber,
      person.m365Account,
      person.contractType,
      person.emergencyContactName,
      person.deckCertificateLabel,
      person.engineCertificateLabel,
    ].join(' '),
  );

  return haystack.includes(query);
}

function documentMatchesSearch(document: HrDocumentRecord, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = normalizeSearch(
    [
      document.title,
      document.personName,
      document.personSharePointItemId,
      document.sourceLabel,
      document.notes,
      getHrDocumentCategoryLabel(document.categoryKey),
    ].join(' '),
  );

  return haystack.includes(query);
}

function documentMatchesDueState(document: HrDocumentRecord, dueState: string): boolean {
  if (!dueState) {
    return true;
  }

  if (dueState === 'renewal_due') {
    return isHrDocumentRenewalDue(document);
  }

  if (dueState === 'urgent') {
    return document.status === 'expired' || document.status === 'missing';
  }

  return document.status === dueState;
}

function documentMatchesFilters(document: HrDocumentRecord, filters: HrFilterState): boolean {
  return (
    (!filters.categoryKey || document.categoryKey === filters.categoryKey) &&
    (!filters.status || document.status === filters.status) &&
    documentMatchesDueState(document, filters.dueState)
  );
}

function hasDocumentFilter(filters: HrFilterState): boolean {
  return Boolean(filters.categoryKey || filters.status || filters.dueState);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

function compareHrCategories(leftKey: string, rightKey: string): number {
  const leftIndex = HR_CATEGORY_ORDER.indexOf(leftKey);
  const rightIndex = HR_CATEGORY_ORDER.indexOf(rightKey);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }

  return getHrDocumentCategoryLabel(leftKey).localeCompare(getHrDocumentCategoryLabel(rightKey), 'fr');
}

function sortDocumentsForTree(documents: HrDocumentRecord[]): HrDocumentRecord[] {
  return [...documents].sort((left, right) => {
    if (left.status !== right.status) {
      const statusPriority: Record<HrDocumentRecord['status'], number> = {
        expired: 0,
        missing: 1,
        renew_due: 2,
        pending_validation: 3,
        valid: 4,
      };

      return statusPriority[left.status] - statusPriority[right.status];
    }

    return left.title.localeCompare(right.title, 'fr');
  });
}

function formatDateForDisplay(value: string): string {
  const dateParts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!dateParts) {
    return value;
  }

  return `${dateParts[3]}/${dateParts[2]}/${dateParts[1]}`;
}

function buildDocumentExpiryText(document: HrDocumentRecord): string {
  if (!document.expiresOn) {
    return '';
  }

  return `arrive a echeance le ${formatDateForDisplay(document.expiresOn)}`;
}

interface MedicalFitnessNote {
  lines: string[];
  tone: 'danger' | 'neutral';
}

type MedicalCondition = 'bridgeWatch' | 'withoutBridgeWatch' | '';

interface MedicalDetailsForm {
  condition: MedicalCondition;
  restriction: string;
  unfit: boolean;
}

interface MedicalDocumentUpdate extends UpdateHrDocumentMedicalInput {
  documentId: number;
}

function buildMedicalDetailsForm(document: HrDocumentRecord): MedicalDetailsForm {
  let condition: MedicalCondition = '';

  if (!document.medicalUnfit) {
    condition = document.medicalBridgeWatch === true ? 'bridgeWatch' : document.medicalBridgeWatch === false ? 'withoutBridgeWatch' : '';
  }

  return {
    condition,
    restriction: document.medicalRestriction,
    unfit: document.medicalUnfit,
  };
}

function buildMedicalDetailsForms(documents: HrDocumentRecord[]): Record<number, MedicalDetailsForm> {
  return Object.fromEntries(
    documents
      .filter((document) => document.categoryKey === 'medical_visit')
      .map((document) => [document.id, buildMedicalDetailsForm(document)]),
  );
}

function medicalDetailsInput(form: MedicalDetailsForm): UpdateHrDocumentMedicalInput {
  return {
    medicalBridgeWatch: form.unfit ? null : form.condition ? form.condition === 'bridgeWatch' : null,
    medicalRestriction: form.restriction,
    medicalUnfit: form.unfit,
  };
}

function medicalDetailsHaveChanged(document: HrDocumentRecord, form: MedicalDetailsForm): boolean {
  const input = medicalDetailsInput(form);

  return (
    input.medicalBridgeWatch !== document.medicalBridgeWatch ||
    input.medicalRestriction.trim() !== document.medicalRestriction.trim() ||
    input.medicalUnfit !== document.medicalUnfit
  );
}

function buildMedicalFitnessNote(document: HrDocumentRecord): MedicalFitnessNote | null {
  if (document.categoryKey !== 'medical_visit') {
    return null;
  }

  const restriction = document.medicalRestriction.trim();
  const hasRestriction = restriction.length > 0;
  const allFunctionsWithBridgeWatch =
    'Remplit les conditions médicales requises pour toutes les fonctions à bord y compris la veille à la passerelle';
  const allFunctionsWithoutBridgeWatch =
    "Remplit les conditions médicales requises pour toutes les fonctions à bord n'impliquant pas la veille à la passerelle";
  const restrictionLine = `Est apte avec les restrictions suivantes : ${restriction}`;

  if (document.medicalUnfit) {
    return {
      lines: ['Inapte à la navigation'],
      tone: 'danger',
    };
  }

  if (document.medicalBridgeWatch === true && !hasRestriction) {
    return {
      lines: [allFunctionsWithBridgeWatch],
      tone: 'neutral',
    };
  }

  if (document.medicalBridgeWatch === true && hasRestriction) {
    return {
      lines: [restrictionLine],
      tone: 'danger',
    };
  }

  if (hasRestriction) {
    return {
      lines: [allFunctionsWithoutBridgeWatch, restrictionLine],
      tone: 'danger',
    };
  }

  return {
    lines: [allFunctionsWithoutBridgeWatch],
    tone: 'danger',
  };
}

function documentDownloadFileName(document: HrDocumentRecord): string {
  const extension = document.mimeType === 'application/pdf' && !/\.[a-z0-9]+$/i.test(document.title) ? '.pdf' : '';
  return `${document.title}${extension}`;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function uniqueFileName(fileName: string, usedNames: Map<string, number>): string {
  const count = usedNames.get(fileName) || 0;
  usedNames.set(fileName, count + 1);

  if (count === 0) {
    return fileName;
  }

  const extensionMatch = fileName.match(/(\.[^./\\]+)$/);
  const extension = extensionMatch?.[1] || '';
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;

  return `${baseName} (${count + 1})${extension}`;
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="hr-field-value">
      <dt>{label}</dt>
      <dd>{value || '-'}</dd>
    </div>
  );
}

function DetailsGrid({ children, isEditing }: { children: ReactNode; isEditing: boolean }) {
  const Component = isEditing ? 'div' : 'dl';

  return <Component className="hr-field-grid">{children}</Component>;
}

function EditableField({
  field,
  form,
  label,
  multiline = false,
  onUpdate,
  options,
  type = 'text',
}: {
  field: keyof UpdatePersonDetailsInput;
  form: UpdatePersonDetailsInput;
  label: string;
  multiline?: boolean;
  onUpdate: (key: keyof UpdatePersonDetailsInput, value: string) => void;
  options?: string[];
  type?: string;
}) {
  const selectOptions = options && form[field] && !options.includes(form[field]) ? [form[field], ...options] : options;

  return (
    <label className="hr-edit-field">
      {label}
      {multiline ? (
        <textarea onChange={(event) => onUpdate(field, event.target.value)} rows={3} value={form[field]} />
      ) : selectOptions ? (
        <select onChange={(event) => onUpdate(field, event.target.value)} value={form[field]}>
          <option value="">Sélectionner</option>
          {selectOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input onChange={(event) => onUpdate(field, event.target.value)} type={type} value={form[field]} />
      )}
    </label>
  );
}

function buildPersonDetailsForm(person: PersonRecord): UpdatePersonDetailsInput {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    functionLabel: normalizeHrFunctionLabel(person.functionLabel),
    gradeLabel: person.gradeLabel,
    roleLabel: person.roleLabel,
    registerLabel: person.registerLabel,
    sex: person.sex,
    sailorNumber: person.sailorNumber,
    m365Account: person.m365Account,
    phone: person.phone,
    postalAddress: person.postalAddress,
    birthDate: person.birthDate,
    birthPlace: person.birthPlace,
    identityDocumentNumber: person.identityDocumentNumber,
    identityDocumentType: person.identityDocumentType,
    contractType: person.contractType,
    hiredOn: person.hiredOn,
    departedOn: person.departedOn,
    departureReason: person.departureReason,
    emergencyContactName: person.emergencyContactName,
    emergencyContactRelationship: person.emergencyContactRelationship,
    emergencyContactPhone: person.emergencyContactPhone,
    emergencyContactAddress: person.emergencyContactAddress,
    waistSize: person.waistSize,
    chestSize: person.chestSize,
    fullHeightSize: person.fullHeightSize,
    inseamSize: person.inseamSize,
    hipSize: person.hipSize,
    weightKg: person.weightKg,
    shoeSize: person.shoeSize,
    coverallSize: person.coverallSize,
    pantsSize: person.pantsSize,
    jacketSize: person.jacketSize,
    deckCertificateLabel: person.deckCertificateLabel,
    engineCertificateLabel: person.engineCertificateLabel,
    craneTrainingOn: person.craneTrainingOn,
    craneInductionOn: person.craneInductionOn,
  };
}

export function HumanResourcesPage({ client, roles }: HumanResourcesPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManagePersonnel(effectiveRoles);
  const isAdmin = effectiveRoles.includes('admin');
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [documents, setDocuments] = useState<HrDocumentRecord[]>([]);
  const [visibilityRules, setVisibilityRules] = useState<HrVisibilityRule[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<HrFilterState>(EMPTY_FILTERS);
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<number>>(() => new Set());
  const [renewalDocumentId, setRenewalDocumentId] = useState<number | null>(null);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchHumanResourcesData(effectiveClient)
      .then((loadedData) => {
        if (isMounted) {
          setPeople(sortPeople(loadedData.people));
          setDocuments(loadedData.documents);
          setVisibilityRules(loadedData.visibilityRules);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger le personnel RH.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveClient]);

  const normalizedSearchQuery = normalizeSearch(searchQuery.trim());
  const roleVisiblePeople = useMemo(
    () =>
      people.filter((person) => {
        const functionLabel = normalizeHrFunctionLabel(person.functionLabel);
        return (
          Boolean(functionLabel) &&
          isVisibilityItemAllowed(visibilityRules, 'function', getHrFunctionVisibilityKey(functionLabel), effectiveRoles)
        );
      }),
    [effectiveRoles, people, visibilityRules],
  );
  const roleVisibleDocuments = useMemo(
    () =>
      documents.filter((document) =>
        isVisibilityItemAllowed(visibilityRules, 'document_type', document.categoryKey, effectiveRoles),
      ),
    [documents, effectiveRoles, visibilityRules],
  );
  const documentsByPersonId = useMemo(
    () =>
      roleVisibleDocuments.reduce<Map<number, HrDocumentRecord[]>>((result, document) => {
        if (document.personId === null) {
          return result;
        }

        result.set(document.personId, (result.get(document.personId) || []).concat(document));
        return result;
      }, new Map<number, HrDocumentRecord[]>()),
    [roleVisibleDocuments],
  );
  const visiblePeople = useMemo(
    () =>
      roleVisiblePeople
        .filter((person) => showInactive || person.active)
        .filter((person) => !filters.collaboratorId || String(person.id) === filters.collaboratorId)
        .filter(
          (person) =>
            !filters.functionKey || getHrFunctionVisibilityKey(person.functionLabel) === filters.functionKey,
        )
        .filter((person) => {
          const personDocuments = documentsByPersonId.get(person.id) || [];
          const personTextMatches = personMatchesSearch(person, normalizedSearchQuery);
          const documentTextMatches = personDocuments.some((document) => documentMatchesSearch(document, normalizedSearchQuery));
          const documentFilterMatches = personDocuments.some(
            (document) => documentMatchesFilters(document, filters) && documentMatchesSearch(document, normalizedSearchQuery),
          );

          if (hasDocumentFilter(filters)) {
            return documentFilterMatches;
          }

          return personTextMatches || documentTextMatches;
        }),
    [documentsByPersonId, filters, normalizedSearchQuery, roleVisiblePeople, showInactive],
  );
  const collaboratorOptions = useMemo(
    () =>
      sortPeople(roleVisiblePeople).map((person) => ({
        label: `${formatPersonName(person)} - ${normalizeHrFunctionLabel(person.functionLabel)}`,
        value: String(person.id),
      })),
    [roleVisiblePeople],
  );
  const categoryOptions = useMemo(
    () =>
      uniqueSorted(roleVisibleDocuments.map((document) => document.categoryKey)).sort((left, right) => compareHrCategories(left, right)),
    [roleVisibleDocuments],
  );
  const functionOptions = useMemo(
    () =>
      uniqueSorted(roleVisiblePeople.map((person) => normalizeHrFunctionLabel(person.functionLabel))).sort(
        compareHrFunctionLabels,
      ),
    [roleVisiblePeople],
  );
  const visiblePersonIds = useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]);
  const visiblePeopleSearchMatches = useMemo(
    () =>
      visiblePeople.reduce<Map<number, boolean>>((result, person) => {
        result.set(person.id, personMatchesSearch(person, normalizedSearchQuery));
        return result;
      }, new Map<number, boolean>()),
    [normalizedSearchQuery, visiblePeople],
  );
  const visibleDocuments = useMemo(
    () =>
      roleVisibleDocuments.filter((document) => {
        const belongsToVisiblePerson = document.personId !== null && visiblePersonIds.has(document.personId);
        const isVisibleUnassigned = isManager && document.personId === null;

        if (!belongsToVisiblePerson && !isVisibleUnassigned) {
          return false;
        }

        if (!documentMatchesFilters(document, filters)) {
          return false;
        }

        if (!normalizedSearchQuery) {
          return true;
        }

        if (document.personId !== null && visiblePeopleSearchMatches.get(document.personId)) {
          return true;
        }

        return documentMatchesSearch(document, normalizedSearchQuery);
      }),
    [filters, isManager, normalizedSearchQuery, roleVisibleDocuments, visiblePeopleSearchMatches, visiblePersonIds],
  );
  const dashboard = useMemo(
    () => buildHumanResourcesDashboard(visiblePeople, visibleDocuments),
    [visibleDocuments, visiblePeople],
  );
  const staffEvolution = useMemo(() => buildStaffEvolution(roleVisiblePeople), [roleVisiblePeople]);
  const selectedPerson = useMemo(
    () => roleVisiblePeople.find((person) => person.id === selectedPersonId) || null,
    [roleVisiblePeople, selectedPersonId],
  );
  const selectedPersonDocuments = useMemo(
    () => (selectedPerson ? roleVisibleDocuments.filter((document) => document.personId === selectedPerson.id) : []),
    [roleVisibleDocuments, selectedPerson],
  );
  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedDocumentIds.has(document.id)),
    [documents, selectedDocumentIds],
  );
  const renewalDocument = useMemo(
    () => documents.find((document) => document.id === renewalDocumentId) || null,
    [documents, renewalDocumentId],
  );
  const renewalPerson = useMemo(
    () => (renewalDocument?.personId ? people.find((person) => person.id === renewalDocument.personId) || null : null),
    [people, renewalDocument],
  );
  const visibleSectionKeys = useMemo(
    () =>
      new Set(
        HR_DETAILS_SECTIONS.filter((section) =>
          isVisibilityItemAllowed(visibilityRules, 'section', section.key, effectiveRoles),
        ).map((section) => section.key),
      ),
    [effectiveRoles, visibilityRules],
  );
  const visibilityCatalog = useMemo(
    () => buildVisibilityCatalog(people, documents, visibilityRules),
    [documents, people, visibilityRules],
  );

  function updateFormValue(key: keyof PersonFormState, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateFilterValue(key: keyof HrFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  async function handleCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const createdPerson = await createPerson(effectiveClient, form);
      setPeople((currentPeople) => sortPeople([...currentPeople, createdPerson]));
      setForm(EMPTY_FORM);
      setIsCreateOpen(false);
      setStatusMessage('Collaborateur ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce collaborateur.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActiveChange(person: PersonRecord, active: boolean) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const updatedPerson = await updatePersonActive(effectiveClient, person.id, active);
      setPeople((currentPeople) =>
        sortPeople(currentPeople.map((currentPerson) => (currentPerson.id === person.id ? updatedPerson : currentPerson))),
      );
      setStatusMessage(active ? 'Collaborateur reactive.' : 'Collaborateur desactive.');
    } catch {
      setErrorMessage('Impossible de modifier le statut.');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleDocumentSelection(documentId: number) {
    setSelectedDocumentIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(documentId)) {
        nextIds.delete(documentId);
      } else {
        nextIds.add(documentId);
      }

      return nextIds;
    });
  }

  async function handleOpenDocument(document: HrDocumentRecord) {
    setErrorMessage(null);

    try {
      const url = await createHrDocumentSignedUrl(effectiveClient, document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setErrorMessage("Impossible d'ouvrir ce document.");
    }
  }

  async function handleDownloadSelectedDocuments() {
    if (selectedDocuments.length === 0) {
      return;
    }

    setErrorMessage(null);
    setIsDownloading(true);

    try {
      if (selectedDocuments.length === 1) {
        const documentToDownload = selectedDocuments[0];
        const blob = await downloadHrDocumentBlob(effectiveClient, documentToDownload);
        saveBlob(blob, documentDownloadFileName(documentToDownload));
      } else {
        const zip = new JSZip();
        const usedNames = new Map<string, number>();

        await Promise.all(
          selectedDocuments.map(async (documentToDownload) => {
            const blob = await downloadHrDocumentBlob(effectiveClient, documentToDownload);
            zip.file(uniqueFileName(documentDownloadFileName(documentToDownload), usedNames), blob);
          }),
        );

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveBlob(zipBlob, `Documents RH - ${new Date().toISOString().slice(0, 10)}.zip`);
      }

      setSelectedDocumentIds(new Set());
    } catch {
      setErrorMessage('Impossible de telecharger les fichiers selectionnes.');
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleRenewDocument(input: {
    document: HrDocumentRecord;
    dueDate: string;
    file: File;
    medicalBridgeWatch: boolean | null;
    medicalRestriction: string;
    medicalUnfit: boolean;
    person: PersonRecord;
  }) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const updatedDocument = await renewHrDocument(effectiveClient, input);
      setDocuments((currentDocuments) =>
        currentDocuments.map((currentDocument) => (currentDocument.id === updatedDocument.id ? updatedDocument : currentDocument)),
      );
      setRenewalDocumentId(null);
      setSelectedDocumentIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(updatedDocument.id);
        return nextIds;
      });
      setStatusMessage('Document renouvele.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de renouveler le document.');
      throw new Error('hr-document-renewal-failed');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSavePersonDetails(
    personId: number,
    input: UpdatePersonDetailsInput,
    medicalUpdates: MedicalDocumentUpdate[],
  ) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const [updatedPerson, updatedMedicalDocuments] = await Promise.all([
        updatePersonDetails(effectiveClient, personId, input),
        Promise.all(
          medicalUpdates.map(({ documentId, ...medicalInput }) =>
            updateHrDocumentMedicalDetails(effectiveClient, documentId, medicalInput),
          ),
        ),
      ]);
      setPeople((currentPeople) =>
        sortPeople(currentPeople.map((currentPerson) => (currentPerson.id === personId ? updatedPerson : currentPerson))),
      );
      if (updatedMedicalDocuments.length > 0) {
        const documentsById = new Map(updatedMedicalDocuments.map((document) => [document.id, document]));
        setDocuments((currentDocuments) =>
          currentDocuments.map((document) => documentsById.get(document.id) || document),
        );
      }
      setStatusMessage('Fiche collaborateur mise a jour.');
    } catch {
      setErrorMessage('Impossible de mettre a jour la fiche collaborateur.');
      throw new Error('person-details-update-failed');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveVisibilityRules(rules: HrVisibilityRule[]) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const savedRules = await saveHrVisibilityRules(effectiveClient, rules);
      setVisibilityRules(savedRules);
      setIsVisibilityOpen(false);
      setStatusMessage('Visibilité RH mise à jour.');
    } catch {
      setErrorMessage("Impossible de mettre à jour la visibilité RH. Vérifiez que la migration a bien été appliquée.");
      throw new Error('hr-visibility-update-failed');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement du personnel RH...</div>;
  }

  return (
    <section className="hr-page">
      <header className="hr-command-header">
        <div>
          <h1>Ressources humaines</h1>
          <p>Pilotage RH analytique · {visibleDocuments.length} documents suivis</p>
        </div>
        <div className="hr-command-actions">
          {isManager ? (
            <button aria-label="Nouveau Collaborateur" className="hr-primary-button" onClick={() => setIsCreateOpen(true)} type="button">
              <UserPlus aria-hidden="true" size={17} />
              Ajouter un collaborateur
            </button>
          ) : null}
          {isAdmin ? (
            <button className="hr-secondary-button" onClick={() => setIsVisibilityOpen(true)} type="button">
              <Settings2 aria-hidden="true" size={17} />
              Paramétrer les accès
            </button>
          ) : null}
          {isAdmin ? (
            <span className="hr-visibility-summary">
              <ShieldCheck aria-hidden="true" size={17} />
              <span>
                <strong>Visibilité par rôle</strong>
                Fonctions, documents et sections
              </span>
            </span>
          ) : null}
        </div>
      </header>

      <div className="hr-kpi-band" aria-label="Indicateurs RH">
        <MetricCluster
          icon={<Users aria-hidden="true" size={18} />}
          label="Effectif RH"
          value={dashboard.metrics.activePeople}
          items={[
            { label: 'Sédentaires', value: dashboard.metrics.sedentaryPeople },
            { label: 'Navigants', value: dashboard.metrics.seafarerPeople },
            { label: 'Stagiaires', value: dashboard.metrics.trainees },
          ]}
        />
        <MetricCluster
          icon={<TrendingUp aria-hidden="true" size={18} />}
          label="À revalider"
          tone="warning"
          value={dashboard.metrics.renewalDue}
          items={[
            { ariaLabel: 'Certificats a revalider', label: 'Certificats', value: dashboard.metrics.certificateRenewals },
            {
              ariaLabel: 'Visites medicales a revalider',
              label: 'Visites médicales',
              value: dashboard.metrics.medicalVisitRenewals,
            },
          ]}
        />
        <MetricCluster
          icon={<AlertTriangle aria-hidden="true" size={18} />}
          label="Urgent"
          tone="danger"
          value={dashboard.metrics.urgent}
          items={[
            { ariaLabel: 'Documents echus', label: 'Documents échus', value: dashboard.metrics.expiredDocuments },
            { ariaLabel: 'Documents manquants', label: 'Documents manquants', value: dashboard.metrics.missing },
          ]}
        />
        <StrategicMetric label="Turnover 12 mois" suffix="%" value={dashboard.metrics.turnoverRate} />
        <StrategicMetric label="Ancienneté moyenne" suffix=" ans" value={dashboard.metrics.averageTenureYears} />
        <StrategicMetric label="Conformité médicale" suffix="%" tone="success" value={dashboard.metrics.medicalComplianceRate} />
      </div>

      <div className="hr-analytics-grid">
        <StaffEvolutionChart points={staffEvolution} turnoverRate={dashboard.metrics.turnoverRate} />
        <FunctionDistribution groups={dashboard.groups} />
      </div>

      {statusMessage || errorMessage ? (
        <div className="admin-notices" aria-live="polite">
          {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
        </div>
      ) : null}

      <section className="hr-roster-panel">
        <div className="hr-roster-heading">
          <div>
            <h2>Marins par fonction</h2>
            <p>Les fonctions sont classées selon l’ordre métier défini.</p>
          </div>
          <span className={isManager ? 'hr-mode-write' : 'hr-mode-read'}>{isManager ? 'Modification' : 'Lecture seule'}</span>
        </div>
        <div className="hr-filter-panel">
        <label className="hr-search-field">
          <span>Recherche</span>
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Recherche RH"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Collaborateur, fichier, document..."
            value={searchQuery}
          />
        </label>
        <label className="hr-filter-field">
          Collaborateur
          <select onChange={(event) => updateFilterValue('collaboratorId', event.target.value)} value={filters.collaboratorId}>
            <option value="">Tous</option>
            {collaboratorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Fonction
          <select onChange={(event) => updateFilterValue('functionKey', event.target.value)} value={filters.functionKey}>
            <option value="">Toutes</option>
            {functionOptions.map((functionLabel) => (
              <option key={functionLabel} value={getHrFunctionVisibilityKey(functionLabel)}>
                {functionLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Categories
          <select onChange={(event) => updateFilterValue('categoryKey', event.target.value)} value={filters.categoryKey}>
            <option value="">Toutes</option>
            {categoryOptions.map((categoryKey) => (
              <option key={categoryKey} value={categoryKey}>
                {getHrDocumentCategoryLabel(categoryKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Statut
          <select onChange={(event) => updateFilterValue('status', event.target.value)} value={filters.status}>
            {DOCUMENT_STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all-status'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Echeances
          <select onChange={(event) => updateFilterValue('dueState', event.target.value)} value={filters.dueState}>
            {DOCUMENT_DUE_OPTIONS.map((option) => (
              <option key={option.value || 'all-due'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-inline-control">
          <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
          Afficher les inactifs
        </label>
        </div>

      {selectedDocuments.length > 0 ? (
        <section aria-label="Selection documentaire RH" className="hr-selection-bar">
          <span>{selectedDocuments.length} document(s) selectionne(s)</span>
          <div className="hr-selection-actions">
            <button disabled={isDownloading} onClick={() => setSelectedDocumentIds(new Set())} type="button">
              Annuler la selection
            </button>
            <button disabled={isDownloading} onClick={handleDownloadSelectedDocuments} type="button">
              <Download aria-hidden="true" size={16} />
              {isDownloading ? 'Telechargement...' : 'Telecharger'}
            </button>
          </div>
        </section>
      ) : null}

        {dashboard.groups.length === 0 ? (
          <div className="admin-state">Aucun collaborateur à afficher.</div>
        ) : (
          <div className="hr-group-list">
            {dashboard.groups.map((group) => (
              <PersonnelGroup
                group={group}
                isManager={isManager}
                isSaving={isSaving}
                key={group.label}
                onActiveChange={handleActiveChange}
                onDocumentOpen={handleOpenDocument}
                onDocumentRenew={(document) => setRenewalDocumentId(document.id)}
                onDocumentSelect={toggleDocumentSelection}
                onPersonOpen={setSelectedPersonId}
                selectedDocumentIds={selectedDocumentIds}
              />
            ))}
          </div>
        )}
      </section>

      {isCreateOpen ? (
        <CreatePersonDialog
          form={form}
          isSaving={isSaving}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreatePerson}
          onUpdate={updateFormValue}
        />
      ) : null}

      {selectedPerson ? (
        <PersonDetailsDialog
          documents={selectedPersonDocuments}
          isManager={isManager}
          isSaving={isSaving}
          onClose={() => setSelectedPersonId(null)}
          onSave={handleSavePersonDetails}
          person={selectedPerson}
          visibleSectionKeys={visibleSectionKeys}
        />
      ) : null}

      {isVisibilityOpen ? (
        <VisibilitySettingsDialog
          isSaving={isSaving}
          onClose={() => setIsVisibilityOpen(false)}
          onSave={handleSaveVisibilityRules}
          rules={visibilityCatalog}
        />
      ) : null}

      {renewalDocument && renewalPerson ? (
        <DocumentRenewalDialog
          document={renewalDocument}
          isSaving={isSaving}
          onClose={() => setRenewalDocumentId(null)}
          onSubmit={handleRenewDocument}
          person={renewalPerson}
        />
      ) : null}
    </section>
  );
}

function StaffEvolutionChart({
  points,
  turnoverRate,
}: {
  points: Array<{ count: number; year: number }>;
  turnoverRate: number;
}) {
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const chartPoints = points.map((point, index) => {
    const x = points.length <= 1 ? 24 : 24 + (index * 552) / (points.length - 1);
    const y = 78 - (point.count / maxCount) * 56;

    return { ...point, x, y };
  });
  const polylinePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <section aria-label="Evolution des effectifs" className="hr-evolution-card">
      <div className="hr-analytics-title">
        <span>
          <BarChart3 aria-hidden="true" size={18} />
          Évolution des effectifs
        </span>
        <small>2020 – 2026</small>
      </div>
      <div className="hr-evolution-content">
        <svg aria-hidden="true" className="hr-evolution-chart" preserveAspectRatio="none" viewBox="0 0 600 96">
          <line className="hr-evolution-axis" x1="24" x2="576" y1="78" y2="78" />
          <polyline className="hr-evolution-line" points={polylinePoints} />
          {chartPoints.map((point) => (
            <g key={point.year}>
              <circle className="hr-evolution-dot" cx={point.x} cy={point.y} r="3" />
              <text className="hr-evolution-value" x={point.x} y={Math.max(10, point.y - 8)}>
                {point.count}
              </text>
              <text className="hr-evolution-year" x={point.x} y="93">
                {point.year}
              </text>
            </g>
          ))}
        </svg>
        <aside className="hr-turnover-panel" aria-label="Turnover sur 12 mois">
          <small>Turnover 12 mois</small>
          <strong>{formatMetric(turnoverRate)} %</strong>
          <span>Départs sur effectif moyen</span>
        </aside>
      </div>
    </section>
  );
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function StrategicMetric({
  label,
  suffix,
  tone = 'neutral',
  value,
}: {
  label: string;
  suffix: string;
  tone?: 'neutral' | 'success';
  value: number;
}) {
  return (
    <section aria-label={label} className={`hr-strategic-metric hr-strategic-metric-${tone}`}>
      <small>{label}</small>
      <strong>
        {formatMetric(value)}
        {suffix}
      </strong>
      <span>{tone === 'success' ? 'Dossiers à jour' : 'Indicateur sur 12 mois'}</span>
    </section>
  );
}

function FunctionDistribution({ groups }: { groups: Array<{ label: string; people: PersonDashboardRecord[] }> }) {
  const maxCount = Math.max(1, ...groups.map((group) => group.people.length));

  return (
    <section aria-label="Effectifs par fonction" className="hr-function-distribution">
      <div className="hr-analytics-title">
        <span>
          <Users aria-hidden="true" size={18} />
          Effectifs par fonction
        </span>
        <small>{groups.reduce((total, group) => total + group.people.length, 0)} personnes</small>
      </div>
      <div className="hr-function-bars">
        {groups.map((group) => (
          <div className="hr-function-bar-row" key={group.label}>
            <span>{group.label}</span>
            <div aria-hidden="true" className="hr-function-bar-track">
              <i style={{ width: `${Math.max(8, (group.people.length / maxCount) * 100)}%` }} />
            </div>
            <strong>{group.people.length}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCluster({
  icon,
  items,
  label,
  tone = 'neutral',
  value,
}: {
  icon?: ReactNode;
  items: Array<{ ariaLabel?: string; label: string; value: number }>;
  label: string;
  tone?: 'neutral' | 'warning' | 'danger';
  value: number;
}) {
  return (
    <section aria-label={label} className={`hr-kpi-cluster hr-kpi-cluster-${tone}`}>
      <div className="hr-kpi-cluster-total">
        <span className="hr-kpi-cluster-label">
          {icon}
          {label}
        </span>
        <strong>{value}</strong>
      </div>
      <div className="hr-kpi-cluster-items">
        {items.map((item) => (
          <span aria-label={item.ariaLabel || item.label} className="hr-kpi-submetric" key={item.ariaLabel || item.label}>
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function PersonnelGroup({
  group,
  isManager,
  isSaving,
  onActiveChange,
  onDocumentOpen,
  onDocumentRenew,
  onDocumentSelect,
  onPersonOpen,
  selectedDocumentIds,
}: {
  group: { label: string; people: PersonDashboardRecord[] };
  isManager: boolean;
  isSaving: boolean;
  onActiveChange: (person: PersonRecord, active: boolean) => void;
  onDocumentOpen: (document: HrDocumentRecord) => void;
  onDocumentRenew: (document: HrDocumentRecord) => void;
  onDocumentSelect: (documentId: number) => void;
  onPersonOpen: (personId: number) => void;
  selectedDocumentIds: Set<number>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="hr-person-group">
      <button
        aria-expanded={isExpanded}
        aria-label={`${group.label}, ${group.people.length} collaborateur(s)`}
        className="hr-group-heading"
        onClick={() => setIsExpanded((currentValue) => !currentValue)}
        type="button"
      >
        <span>
          {isExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          <strong>{group.label}</strong>
        </span>
        <b>{group.people.length}</b>
      </button>
      {isExpanded ? (
        <div className="hr-person-list">
          {group.people.map((person) => (
            <PersonRow
              isManager={isManager}
              isSaving={isSaving}
              key={person.id}
              onActiveChange={onActiveChange}
              onDocumentOpen={onDocumentOpen}
              onDocumentRenew={onDocumentRenew}
              onDocumentSelect={onDocumentSelect}
              onOpen={() => onPersonOpen(person.id)}
              person={person}
              selectedDocumentIds={selectedDocumentIds}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PersonRow({
  isManager,
  isSaving,
  onActiveChange,
  onDocumentOpen,
  onDocumentRenew,
  onDocumentSelect,
  onOpen,
  person,
  selectedDocumentIds,
}: {
  isManager: boolean;
  isSaving: boolean;
  onActiveChange: (person: PersonRecord, active: boolean) => void;
  onDocumentOpen: (document: HrDocumentRecord) => void;
  onDocumentRenew: (document: HrDocumentRecord) => void;
  onDocumentSelect: (documentId: number) => void;
  onOpen: () => void;
  person: PersonDashboardRecord;
  selectedDocumentIds: Set<number>;
}) {
  const renewalCount = person.documents.filter(isHrDocumentRenewalDue).length;
  const urgentCount = person.documents.filter((document) => document.status === 'expired' || document.status === 'missing').length;
  const [isPersonExpanded, setIsPersonExpanded] = useState(false);
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState<Set<string>>(() => new Set());
  const documentGroups = Array.from(
    person.documents.reduce<Map<string, HrDocumentRecord[]>>((result, document) => {
      result.set(document.categoryKey, (result.get(document.categoryKey) || []).concat(document));
      return result;
    }, new Map<string, HrDocumentRecord[]>()),
  )
    .map(([key, categoryDocuments]) => ({
      documents: sortDocumentsForTree(categoryDocuments),
      key,
      label: getHrDocumentCategoryLabel(key),
    }))
    .sort((left, right) => compareHrCategories(left.key, right.key));
  function toggleCategory(key: string) {
    setCollapsedCategoryKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }

      return nextKeys;
    });
  }

  return (
    <article aria-label={`Documents de ${formatPersonName(person)}`} className="hr-person-row" role="region">
      <header className="hr-person-tree-header">
        <div className="hr-person-main">
          <div className="hr-person-title-line">
            <button
              aria-expanded={isPersonExpanded}
              className="hr-person-tree-toggle"
              onClick={() => setIsPersonExpanded((currentValue) => !currentValue)}
              type="button"
            >
              {isPersonExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
              <span>{formatPersonName(person)}</span>
            </button>
          </div>
          <small>{person.sailorNumber ? `N° marin ${person.sailorNumber}` : person.gradeLabel || normalizeHrFunctionLabel(person.functionLabel)}</small>
        </div>
        <span className="hr-roster-metric">
          <strong>{person.documents.length}</strong>
          <small>Documents</small>
        </span>
        <span className={`hr-roster-metric ${renewalCount > 0 ? 'is-warning' : ''}`}>
          <strong>{renewalCount}</strong>
          <small>À revalider</small>
        </span>
        <span className={`hr-roster-metric ${urgentCount > 0 ? 'is-danger' : ''}`}>
          <strong>{urgentCount}</strong>
          <small>Urgent</small>
        </span>
        <div className="hr-person-status">
          {isManager ? (
            <label className="hr-status-toggle">
              <input
                checked={person.active}
                disabled={isSaving}
                onChange={(event) => onActiveChange(person, event.target.checked)}
                type="checkbox"
              />
              <span>{person.active ? 'Actif' : 'Inactif'}</span>
            </label>
          ) : (
            <span className={person.active ? 'hr-status-active' : 'hr-status-inactive'}>
              {person.active ? 'Actif' : 'Inactif'}
            </span>
          )}
        </div>
        <button aria-label={`Ouvrir la fiche de ${formatPersonName(person)}`} className="hr-icon-button" onClick={onOpen} type="button">
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      </header>

      {isPersonExpanded && documentGroups.length > 0 ? (
        <div className="hr-document-tree">
          {documentGroups.map((group) => {
            const groupRenewalCount = group.documents.filter(isHrDocumentRenewalDue).length;
            const isCategoryExpanded = !collapsedCategoryKeys.has(group.key);

            return (
              <section className="hr-document-category" key={group.key}>
                <button
                  aria-expanded={isCategoryExpanded}
                  aria-label={`${group.label} ${group.documents.length}`}
                  className="hr-document-category-button"
                  onClick={() => toggleCategory(group.key)}
                  type="button"
                >
                  {isCategoryExpanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}
                  <span>{group.label}</span>
                  <b>{group.documents.length}</b>
                  {groupRenewalCount > 0 ? <em aria-hidden="true">{groupRenewalCount} a renouveler</em> : null}
                </button>
                {isCategoryExpanded ? (
                  <ul className="hr-document-tree-list">
                    {group.documents.map((document) => {
                      const notesForDisplay = getDocumentNotesForDisplay(document.notes);
                      const documentHref = getDocumentFileHref(document.fileUrl);
                      const medicalFitnessNote = buildMedicalFitnessNote(document);
                      const canRenewDocument = isManager && isHrDocumentRenewalDue(document);

                      return (
                        <li className={`hr-document-tree-row hr-document-tree-${document.status}`} key={document.id}>
                          <input
                            aria-label={`Selectionner ${document.title}`}
                            checked={selectedDocumentIds.has(document.id)}
                            onChange={() => onDocumentSelect(document.id)}
                            type="checkbox"
                          />
                          <FileText aria-hidden="true" size={16} />
                          <span className="hr-document-tree-main">
                            <strong>
                              {documentHref ? (
                                <a className="hr-document-title-link" href={documentHref} rel="noreferrer" target="_blank">
                                  {document.title}
                                </a>
                              ) : (
                                <button className="hr-document-title-button" onClick={() => onDocumentOpen(document)} type="button">
                                  {document.title}
                                </button>
                              )}
                            </strong>
                            {buildDocumentExpiryText(document) ? <small>{buildDocumentExpiryText(document)}</small> : null}
                            {medicalFitnessNote ? (
                              <span className={`hr-medical-note hr-medical-note-${medicalFitnessNote.tone}`}>
                                {medicalFitnessNote.lines.map((line) => (
                                  <small key={line}>{line}</small>
                                ))}
                              </span>
                            ) : null}
                            {notesForDisplay ? <small className="hr-document-note">{notesForDisplay}</small> : null}
                            {document.requiresCaptainValidation ? <small>Validation capitaine requise</small> : null}
                          </span>
                          <span className="hr-document-row-actions">
                            {canRenewDocument ? (
                              <button disabled={isSaving} onClick={() => onDocumentRenew(document)} type="button">
                                <Upload aria-hidden="true" size={14} />
                                Renouveler
                              </button>
                            ) : null}
                            <span className={`hr-document-status hr-document-${document.status}`}>
                              {DOCUMENT_STATUS_LABELS[document.status]}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}

      {isPersonExpanded && documentGroups.length === 0 ? (
        <p className="hr-category-empty">Aucun document associe</p>
      ) : null}
    </article>
  );
}

function MedicalOptionsFields({
  disabled,
  idPrefix,
  onChange,
  value,
}: {
  disabled: boolean;
  idPrefix: string;
  onChange: (value: MedicalDetailsForm) => void;
  value: MedicalDetailsForm;
}) {
  return (
    <fieldset className="hr-medical-options">
      <legend>Informations médicales</legend>
      <label>
        <input
          checked={value.condition === 'bridgeWatch'}
          disabled={disabled || value.unfit}
          id={`${idPrefix}-bridge-watch`}
          onChange={(event) =>
            onChange({
              ...value,
              condition: event.currentTarget.checked ? 'bridgeWatch' : '',
              unfit: false,
            })
          }
          type="checkbox"
        />
        Remplit les conditions médicales requises pour toutes les fonctions à bord y compris la veille à la passerelle
      </label>
      <label>
        <input
          checked={value.condition === 'withoutBridgeWatch'}
          disabled={disabled || value.unfit}
          id={`${idPrefix}-without-bridge-watch`}
          onChange={(event) =>
            onChange({
              ...value,
              condition: event.currentTarget.checked ? 'withoutBridgeWatch' : '',
              unfit: false,
            })
          }
          type="checkbox"
        />
        Remplit les conditions médicales requises pour toutes les fonctions à bord n'impliquant pas la veille à la passerelle
      </label>
      <label className="hr-edit-field">
        Est apte avec les restrictions suivantes
        <textarea
          disabled={disabled}
          id={`${idPrefix}-restriction`}
          onChange={(event) => onChange({ ...value, restriction: event.target.value })}
          rows={2}
          value={value.restriction}
        />
      </label>
      <label>
        <input
          checked={value.unfit}
          disabled={disabled}
          id={`${idPrefix}-unfit`}
          onChange={(event) =>
            onChange({
              ...value,
              condition: event.currentTarget.checked ? '' : value.condition,
              unfit: event.currentTarget.checked,
            })
          }
          type="checkbox"
        />
        Inapte à la navigation
      </label>
    </fieldset>
  );
}

function DocumentRenewalDialog({
  document,
  isSaving,
  onClose,
  onSubmit,
  person,
}: {
  document: HrDocumentRecord;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: {
    document: HrDocumentRecord;
    dueDate: string;
    file: File;
    medicalBridgeWatch: boolean | null;
    medicalRestriction: string;
    medicalUnfit: boolean;
    person: PersonRecord;
  }) => Promise<void>;
  person: PersonRecord;
}) {
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState('');
  const [medicalForm, setMedicalForm] = useState<MedicalDetailsForm>(() => buildMedicalDetailsForm(document));
  const generatedFileName = file ? buildGeneratedHrDocumentFileName(person, document, dueDate, file.name) : '';
  const isMedicalVisit = document.categoryKey === 'medical_visit';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (!file || !dueDate || !generatedFileName) {
      setFormError('Depose le nouveau document et renseigne la nouvelle date d echeance.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setFormError('Le fichier depasse la limite de 50 Mo du stockage gratuit Supabase.');
      return;
    }

    try {
      await onSubmit({
        document,
        dueDate,
        file,
        ...medicalDetailsInput(medicalForm),
        person,
      });
    } catch {
      setFormError('Impossible de renouveler le document.');
    }
  }

  return (
    <div aria-label={`Renouveler ${document.title}`} aria-modal="true" className="hr-dialog-backdrop" role="dialog">
      <form className="hr-dialog hr-renewal-dialog" onSubmit={handleSubmit}>
        <div className="hr-dialog-header">
          <div>
            <p>Renouvellement documentaire</p>
            <h2>Renouveler le document</h2>
            <span>{`${formatPersonName(person)} - ${stripFileExtension(document.title)}`}</span>
          </div>
          <button aria-label="Fermer" className="hr-icon-button" disabled={isSaving} onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="hr-renewal-body">
          <label className="hr-edit-field">
            Nouveau document
            <input
              disabled={isSaving}
              onChange={(event) => setFile(event.currentTarget.files?.[0] || null)}
              type="file"
            />
          </label>
          <label className="hr-edit-field">
            Nouvelle date d'echeance
            <input disabled={isSaving} onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
          </label>
          <label className="hr-edit-field">
            Nom genere
            <input readOnly value={generatedFileName} />
          </label>

          {isMedicalVisit ? (
            <MedicalOptionsFields
              disabled={isSaving}
              idPrefix={`renew-medical-${document.id}`}
              onChange={setMedicalForm}
              value={medicalForm}
            />
          ) : null}
        </div>

        {formError ? <p className="form-error">{formError}</p> : null}

        <footer className="hr-dialog-footer">
          <button disabled={isSaving} onClick={onClose} type="button">
            Annuler
          </button>
          <button disabled={isSaving} type="submit">
            <Upload aria-hidden="true" size={16} />
            {isSaving ? 'Chargement...' : 'Renouveler'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CreatePersonDialog({
  form,
  isSaving,
  onClose,
  onSubmit,
  onUpdate,
}: {
  form: PersonFormState;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (key: keyof PersonFormState, value: string) => void;
}) {
  return (
    <div aria-label="Nouveau collaborateur" aria-modal="true" className="hr-dialog-backdrop" role="dialog">
      <form className="hr-dialog hr-create-dialog" onSubmit={onSubmit}>
        <div className="hr-dialog-header">
          <div>
            <p>Fiche RH</p>
            <h2>Nouveau Collaborateur</h2>
          </div>
          <button aria-label="Fermer" className="hr-icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="hr-form-grid">
          <label>
            Prenom
            <input onChange={(event) => onUpdate('firstName', event.target.value)} required value={form.firstName} />
          </label>
          <label>
            Nom
            <input onChange={(event) => onUpdate('lastName', event.target.value)} required value={form.lastName} />
          </label>
          <label>
            Fonction
            <input list="hr-function-options" onChange={(event) => onUpdate('functionLabel', event.target.value)} value={form.functionLabel} />
            <datalist id="hr-function-options">
              {HR_PRIMARY_FUNCTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            Grade
            <input onChange={(event) => onUpdate('gradeLabel', event.target.value)} value={form.gradeLabel} />
          </label>
          <label>
            Rôle
            <select onChange={(event) => onUpdate('roleLabel', event.target.value)} value={form.roleLabel}>
              <option value="">Sélectionner</option>
              {['Navigant', 'Sédentaire', 'Stagiaire'].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Registre
            <select onChange={(event) => onUpdate('registerLabel', event.target.value)} value={form.registerLabel}>
              <option value="">Sélectionner</option>
              <option>RIF</option>
              <option>ENIM</option>
            </select>
          </label>
          <label>
            Sexe
            <select onChange={(event) => onUpdate('sex', event.target.value)} value={form.sex}>
              <option value="">Sélectionner</option>
              <option>Femme</option>
              <option>Homme</option>
              <option>Autre</option>
            </select>
          </label>
          <label>
            Numero de marin
            <input onChange={(event) => onUpdate('sailorNumber', event.target.value)} value={form.sailorNumber} />
          </label>
          <label>
            Compte M365
            <input onChange={(event) => onUpdate('m365Account', event.target.value)} value={form.m365Account} />
          </label>
          <label>
            Email
            <input onChange={(event) => onUpdate('email', event.target.value)} type="email" value={form.email} />
          </label>
        </div>
        <div className="hr-dialog-footer">
          <button className="hr-secondary-button" onClick={onClose} type="button">
            Annuler
          </button>
          <button className="hr-primary-button" disabled={isSaving} type="submit">
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}

function VisibilitySettingsDialog({
  isSaving,
  onClose,
  onSave,
  rules,
}: {
  isSaving: boolean;
  onClose: () => void;
  onSave: (rules: HrVisibilityRule[]) => Promise<void>;
  rules: HrVisibilityRule[];
}) {
  const [draftRules, setDraftRules] = useState(rules);
  const [formError, setFormError] = useState('');
  const scopeLabels: Record<HrVisibilityScope, string> = {
    function: 'Fonctions',
    document_type: 'Types de document',
    section: 'Sections de la fiche RH',
  };

  useEffect(() => setDraftRules(rules), [rules]);

  function toggleRole(rule: HrVisibilityRule, role: RoleKey, checked: boolean) {
    if (role === 'admin') {
      return;
    }

    setDraftRules((currentRules) =>
      currentRules.map((candidate) => {
        if (candidate.scope !== rule.scope || candidate.itemKey !== rule.itemKey) {
          return candidate;
        }

        const nextRoles = new Set(candidate.visibleToRoles);
        if (checked) {
          nextRoles.add(role);
        } else {
          nextRoles.delete(role);
        }
        nextRoles.add('admin');

        return { ...candidate, visibleToRoles: [...nextRoles] };
      }),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    try {
      await onSave(draftRules);
    } catch {
      setFormError("L'enregistrement a échoué.");
    }
  }

  return (
    <div aria-label="Paramétrer la visibilité RH" aria-modal="true" className="hr-dialog-backdrop" role="dialog">
      <form className="hr-dialog hr-visibility-dialog" onSubmit={handleSubmit}>
        <div className="hr-dialog-header">
          <div>
            <p>Administration RH</p>
            <h2>Visibilité par rôle</h2>
            <span>Définissez les fonctions, documents et sections accessibles à chaque profil.</span>
          </div>
          <button aria-label="Fermer" className="hr-icon-button" disabled={isSaving} onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="hr-visibility-body">
          {(['function', 'document_type', 'section'] as HrVisibilityScope[]).map((scope) => (
            <section className="hr-visibility-scope" key={scope}>
              <div className="hr-visibility-scope-title">
                <h3>{scopeLabels[scope]}</h3>
                <small>Administrateur toujours autorisé</small>
              </div>
              <div className="hr-visibility-table-wrap">
                <table className="hr-visibility-table">
                  <thead>
                    <tr>
                      <th>Élément</th>
                      {HR_VISIBILITY_ROLES.map((role) => (
                        <th key={role.key}>{role.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draftRules
                      .filter((rule) => rule.scope === scope)
                      .map((rule) => (
                        <tr key={`${rule.scope}:${rule.itemKey}`}>
                          <th>{rule.itemLabel}</th>
                          {HR_VISIBILITY_ROLES.map((role) => (
                            <td key={role.key}>
                              <input
                                aria-label={`${rule.itemLabel} visible pour ${role.label}`}
                                checked={role.key === 'admin' || rule.visibleToRoles.includes(role.key)}
                                disabled={isSaving || role.key === 'admin'}
                                onChange={(event) => toggleRole(rule, role.key, event.currentTarget.checked)}
                                type="checkbox"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
        {formError ? <p className="form-error">{formError}</p> : null}
        <footer className="hr-dialog-footer">
          <button className="hr-secondary-button" disabled={isSaving} onClick={onClose} type="button">
            Annuler
          </button>
          <button className="hr-primary-button" disabled={isSaving} type="submit">
            <ShieldCheck aria-hidden="true" size={17} />
            {isSaving ? 'Enregistrement...' : 'Enregistrer la visibilité'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function PersonDetailsDialog({
  documents,
  isManager,
  isSaving,
  onClose,
  onSave,
  person,
  visibleSectionKeys,
}: {
  documents: HrDocumentRecord[];
  isManager: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    personId: number,
    input: UpdatePersonDetailsInput,
    medicalUpdates: MedicalDocumentUpdate[],
  ) => Promise<void>;
  person: PersonRecord;
  visibleSectionKeys: Set<HrDetailsSectionKey>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<UpdatePersonDetailsInput>(() => buildPersonDetailsForm(person));
  const [medicalForms, setMedicalForms] = useState<Record<number, MedicalDetailsForm>>(() =>
    buildMedicalDetailsForms(documents),
  );
  const availableSections = HR_DETAILS_SECTIONS.filter((section) => visibleSectionKeys.has(section.key));
  const [activeSectionKey, setActiveSectionKey] = useState<HrDetailsSectionKey>(availableSections[0]?.key || 'identity');

  useEffect(() => {
    setForm(buildPersonDetailsForm(person));
    setActiveSectionKey(availableSections[0]?.key || 'identity');
  }, [person]);

  useEffect(() => {
    if (!visibleSectionKeys.has(activeSectionKey) && availableSections[0]) {
      setActiveSectionKey(availableSections[0].key);
    }
  }, [activeSectionKey, availableSections, visibleSectionKeys]);

  useEffect(() => {
    setMedicalForms(buildMedicalDetailsForms(documents));
  }, [documents]);

  function updateFormValue(key: keyof UpdatePersonDetailsInput, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateMedicalForm(documentId: number, value: MedicalDetailsForm) {
    setMedicalForms((currentForms) => ({
      ...currentForms,
      [documentId]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const medicalUpdates = documents.flatMap((document) => {
      const medicalForm = medicalForms[document.id];

      if (!medicalForm || !medicalDetailsHaveChanged(document, medicalForm)) {
        return [];
      }

      return [{ documentId: document.id, ...medicalDetailsInput(medicalForm) }];
    });

    try {
      await onSave(person.id, form, medicalUpdates);
      setIsEditing(false);
    } catch {
      // The page-level notice already tells the user why the save failed.
    }
  }

  function renderActiveSection() {
    switch (activeSectionKey) {
      case 'identity':
        return (
          <section>
            <h3>Identite et poste</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField field="firstName" form={form} label="Prenom" onUpdate={updateFormValue} />
                  <EditableField field="lastName" form={form} label="Nom" onUpdate={updateFormValue} />
                  <EditableField
                    field="functionLabel"
                    form={form}
                    label="Fonction"
                    onUpdate={updateFormValue}
                    options={[...HR_PRIMARY_FUNCTIONS]}
                  />
                  <EditableField field="gradeLabel" form={form} label="Grade" onUpdate={updateFormValue} />
                  <EditableField
                    field="roleLabel"
                    form={form}
                    label="Rôle"
                    onUpdate={updateFormValue}
                    options={['Navigant', 'Sédentaire', 'Stagiaire']}
                  />
                  <EditableField
                    field="registerLabel"
                    form={form}
                    label="Registre"
                    onUpdate={updateFormValue}
                    options={['RIF', 'ENIM']}
                  />
                  <EditableField
                    field="sex"
                    form={form}
                    label="Sexe"
                    onUpdate={updateFormValue}
                    options={['Femme', 'Homme', 'Autre']}
                  />
                  <EditableField field="sailorNumber" form={form} label="Numero de marin" onUpdate={updateFormValue} />
                  <EditableField field="m365Account" form={form} label="Compte M365" onUpdate={updateFormValue} />
                  <EditableField field="email" form={form} label="Email" onUpdate={updateFormValue} type="email" />
                </>
              ) : (
                <>
                  <FieldValue label="Prenom" value={person.firstName} />
                  <FieldValue label="Nom" value={person.lastName} />
                  <FieldValue label="Fonction" value={normalizeHrFunctionLabel(person.functionLabel)} />
                  <FieldValue label="Grade" value={person.gradeLabel} />
                  <FieldValue label="Role" value={person.roleLabel} />
                  <FieldValue label="Registre" value={person.registerLabel} />
                  <FieldValue label="Sexe" value={person.sex} />
                  <FieldValue label="Numero de marin" value={person.sailorNumber} />
                  <FieldValue label="Compte M365" value={person.m365Account} />
                  <FieldValue label="Email" value={person.email} />
                </>
              )}
            </DetailsGrid>
          </section>
        );
      case 'contract':
        return (
          <section>
            <h3>Contrat et dates</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField
                    field="contractType"
                    form={form}
                    label="Type de contrat"
                    onUpdate={updateFormValue}
                    options={['CDI', 'CDD', 'Intérim', 'Alternance', 'Stage', 'Prestataire']}
                  />
                  <EditableField field="hiredOn" form={form} label="Date embauche" onUpdate={updateFormValue} type="date" />
                  <EditableField field="departedOn" form={form} label="Date depart" onUpdate={updateFormValue} type="date" />
                  <EditableField field="departureReason" form={form} label="Cause depart" onUpdate={updateFormValue} />
                  <EditableField field="birthDate" form={form} label="Date naissance" onUpdate={updateFormValue} type="date" />
                  <EditableField field="birthPlace" form={form} label="Lieu naissance" onUpdate={updateFormValue} />
                </>
              ) : (
                <>
                  <FieldValue label="Type de contrat" value={person.contractType} />
                  <FieldValue label="Date embauche" value={person.hiredOn} />
                  <FieldValue label="Date depart" value={person.departedOn} />
                  <FieldValue label="Cause depart" value={person.departureReason} />
                  <FieldValue label="Date naissance" value={person.birthDate} />
                  <FieldValue label="Lieu naissance" value={person.birthPlace} />
                </>
              )}
            </DetailsGrid>
          </section>
        );
      case 'contact':
        return (
          <section>
            <h3>Coordonnees</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField
                    field="postalAddress"
                    form={form}
                    label="Adresse postale"
                    multiline
                    onUpdate={updateFormValue}
                  />
                  <EditableField field="phone" form={form} label="Telephone" onUpdate={updateFormValue} />
                </>
              ) : (
                <>
                  <FieldValue label="Adresse postale" value={person.postalAddress} />
                  <FieldValue label="Telephone" value={person.phone} />
                </>
              )}
            </DetailsGrid>
          </section>
        );
      case 'emergency':
        return (
          <section>
            <h3>Contact urgence</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField field="emergencyContactName" form={form} label="Contact" onUpdate={updateFormValue} />
                  <EditableField
                    field="emergencyContactRelationship"
                    form={form}
                    label="Lien parente"
                    onUpdate={updateFormValue}
                  />
                  <EditableField
                    field="emergencyContactPhone"
                    form={form}
                    label="Telephone urgence"
                    onUpdate={updateFormValue}
                  />
                  <EditableField
                    field="emergencyContactAddress"
                    form={form}
                    label="Adresse urgence"
                    multiline
                    onUpdate={updateFormValue}
                  />
                </>
              ) : (
                <>
                  <FieldValue label="Contact" value={person.emergencyContactName} />
                  <FieldValue label="Lien parente" value={person.emergencyContactRelationship} />
                  <FieldValue label="Telephone urgence" value={person.emergencyContactPhone} />
                  <FieldValue label="Adresse urgence" value={person.emergencyContactAddress} />
                </>
              )}
            </DetailsGrid>
          </section>
        );
      case 'administrative':
        return (
          <section>
            <h3>Documents administratifs</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField
                    field="identityDocumentType"
                    form={form}
                    label="Type document identite"
                    onUpdate={updateFormValue}
                    options={['Carte nationale d’identité', 'Passeport', 'Titre de séjour', 'Livret maritime']}
                  />
                  <EditableField
                    field="identityDocumentNumber"
                    form={form}
                    label="Numero document identite"
                    onUpdate={updateFormValue}
                  />
                </>
              ) : (
                <>
                  <FieldValue label="Type document identite" value={person.identityDocumentType} />
                  <FieldValue label="Numero document identite" value={person.identityDocumentNumber} />
                </>
              )}
            </DetailsGrid>
            <DocumentList documents={documents.filter((document) => document.categoryKey === 'administrative')} />
          </section>
        );
      case 'health':
        return (
          <section>
            <h3>Sante et habilitations</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField field="deckCertificateLabel" form={form} label="Brevet Pont" onUpdate={updateFormValue} />
                  <EditableField field="engineCertificateLabel" form={form} label="Brevet Machine" onUpdate={updateFormValue} />
                  <EditableField
                    field="craneInductionOn"
                    form={form}
                    label="Induction grutage"
                    onUpdate={updateFormValue}
                    type="date"
                  />
                  <EditableField
                    field="craneTrainingOn"
                    form={form}
                    label="Formation grutage"
                    onUpdate={updateFormValue}
                    type="date"
                  />
                </>
              ) : (
                <>
                  <FieldValue label="Brevet Pont" value={person.deckCertificateLabel} />
                  <FieldValue label="Brevet Machine" value={person.engineCertificateLabel} />
                  <FieldValue label="Induction grutage" value={person.craneInductionOn} />
                  <FieldValue label="Formation grutage" value={person.craneTrainingOn} />
                </>
              )}
            </DetailsGrid>
            <DocumentList
              documents={documents.filter((document) => document.categoryKey !== 'administrative')}
              isEditing={isEditing}
              medicalForms={medicalForms}
              onMedicalFormUpdate={updateMedicalForm}
            />
          </section>
        );
      case 'clothing':
        return (
          <section>
            <h3>Tenues et mensurations</h3>
            <DetailsGrid isEditing={isEditing}>
              {isEditing ? (
                <>
                  <EditableField field="coverallSize" form={form} label="Combinaison" onUpdate={updateFormValue} />
                  <EditableField field="pantsSize" form={form} label="Pantalon" onUpdate={updateFormValue} />
                  <EditableField field="jacketSize" form={form} label="Veste" onUpdate={updateFormValue} />
                  <EditableField field="shoeSize" form={form} label="Pointure" onUpdate={updateFormValue} />
                  <EditableField field="weightKg" form={form} label="Poids" onUpdate={updateFormValue} />
                  <EditableField field="waistSize" form={form} label="Tour de taille" onUpdate={updateFormValue} />
                  <EditableField field="chestSize" form={form} label="Poitrine" onUpdate={updateFormValue} />
                  <EditableField field="fullHeightSize" form={form} label="Taille totale" onUpdate={updateFormValue} />
                  <EditableField field="inseamSize" form={form} label="Entrejambe" onUpdate={updateFormValue} />
                  <EditableField field="hipSize" form={form} label="Tour de hanche" onUpdate={updateFormValue} />
                </>
              ) : (
                <>
                  <FieldValue label="Combinaison" value={person.coverallSize} />
                  <FieldValue label="Pantalon" value={person.pantsSize} />
                  <FieldValue label="Veste" value={person.jacketSize} />
                  <FieldValue label="Pointure" value={person.shoeSize} />
                  <FieldValue label="Poids" value={person.weightKg} />
                  <FieldValue label="Tour de taille" value={person.waistSize} />
                  <FieldValue label="Poitrine" value={person.chestSize} />
                  <FieldValue label="Taille totale" value={person.fullHeightSize} />
                  <FieldValue label="Entrejambe" value={person.inseamSize} />
                  <FieldValue label="Tour de hanche" value={person.hipSize} />
                </>
              )}
            </DetailsGrid>
          </section>
        );
      default:
        return null;
    }
  }

  return (
    <div aria-label={`Fiche RH ${formatPersonName(person)}`} aria-modal="true" className="hr-dialog-backdrop" role="dialog">
      <div className="hr-dialog hr-details-dialog">
        <div className="hr-dialog-header">
          <div>
            <p>Fiche RH</p>
            <h2>{formatPersonName(person)}</h2>
          </div>
          <div className="hr-dialog-header-actions">
            {isManager && !isEditing ? (
              <button className="hr-secondary-button" onClick={() => setIsEditing(true)} type="button">
                Modifier la fiche RH
              </button>
            ) : null}
            <button aria-label="Fermer" className="hr-icon-button" onClick={onClose} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
        <form className="hr-details-form" onSubmit={handleSubmit}>
          <div className="hr-details-layout">
            <nav className="hr-section-nav" aria-label="Sections Fiche RH">
              <div className="hr-section-nav-header">
                <span>Sections</span>
                <strong>Fiche RH</strong>
              </div>
              <ol>
                {availableSections.map((section) => (
                  <li key={section.key}>
                    <button
                      aria-current={activeSectionKey === section.key ? 'step' : undefined}
                      aria-label={section.label}
                      className={activeSectionKey === section.key ? 'is-active' : undefined}
                      onClick={() => setActiveSectionKey(section.key)}
                      type="button"
                    >
                      <b>{HR_DETAILS_SECTIONS.findIndex((candidate) => candidate.key === section.key) + 1}</b>
                      <span>{section.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="hr-details-content">{renderActiveSection()}</div>
          </div>
          {isEditing ? (
            <div className="hr-dialog-footer">
              <button
                className="hr-secondary-button"
                onClick={() => {
                  setForm(buildPersonDetailsForm(person));
                  setMedicalForms(buildMedicalDetailsForms(documents));
                  setIsEditing(false);
                }}
                type="button"
              >
                Annuler
              </button>
              <button className="hr-primary-button" disabled={isSaving} type="submit">
                Enregistrer la fiche
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function DocumentList({
  documents,
  isEditing = false,
  medicalForms = {},
  onMedicalFormUpdate,
}: {
  documents: HrDocumentRecord[];
  isEditing?: boolean;
  medicalForms?: Record<number, MedicalDetailsForm>;
  onMedicalFormUpdate?: (documentId: number, value: MedicalDetailsForm) => void;
}) {
  if (documents.length === 0) {
    return <p className="hr-muted">Aucun document renseigne.</p>;
  }

  return (
    <ul className="hr-document-list">
      {documents.map((document) => {
        const notesForDisplay = getDocumentNotesForDisplay(document.notes);
        const documentHref = getDocumentFileHref(document.fileUrl);
        const medicalFitnessNote = buildMedicalFitnessNote(document);
        const medicalForm = medicalForms[document.id];

        return (
          <li key={document.id}>
            <span className="hr-document-main">
              <strong>{document.title}</strong>
              <small>{getHrDocumentCategoryLabel(document.categoryKey)}</small>
              <span className="hr-document-meta">
                {document.issuedOn ? <small>Delivre le {formatDateForDisplay(document.issuedOn)}</small> : null}
                {document.expiresOn ? <small>Expire le {formatDateForDisplay(document.expiresOn)}</small> : null}
                {document.sourceLabel ? <small>Source {document.sourceLabel}</small> : null}
              </span>
              {isEditing && medicalForm && onMedicalFormUpdate ? (
                <MedicalOptionsFields
                  disabled={false}
                  idPrefix={`profile-medical-${document.id}`}
                  onChange={(value) => onMedicalFormUpdate(document.id, value)}
                  value={medicalForm}
                />
              ) : medicalFitnessNote ? (
                <span className={`hr-medical-note hr-medical-note-${medicalFitnessNote.tone}`}>
                  {medicalFitnessNote.lines.map((line) => (
                    <small key={line}>{line}</small>
                  ))}
                </span>
              ) : null}
              {notesForDisplay ? <em>{notesForDisplay}</em> : null}
            </span>
            <span className="hr-document-actions">
              <span className={`hr-document-status hr-document-${document.status}`}>{DOCUMENT_STATUS_LABELS[document.status]}</span>
              {documentHref ? (
                <a className="hr-document-link" href={documentHref} rel="noreferrer" target="_blank">
                  Ouvrir le fichier
                </a>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
