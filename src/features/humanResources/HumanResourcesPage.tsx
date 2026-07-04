import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import type { RoleKey } from '../permissions/roles';
import {
  buildStaffEvolution,
  buildHumanResourcesDashboard,
  createPerson,
  fetchHumanResourcesData,
  formatPersonName,
  getHrDocumentCategoryLabel,
  isHrDocumentRenewalDue,
  updatePersonDetails,
  updatePersonActive,
  type HrDocumentRecord,
  type PersonDashboardRecord,
  type PersonRecord,
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

function metricLabel(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular;
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

function buildDocumentExpiryText(document: HrDocumentRecord): string {
  if (!document.expiresOn) {
    return '';
  }

  return `arrive a echeance le ${document.expiresOn}`;
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
  type = 'text',
}: {
  field: keyof UpdatePersonDetailsInput;
  form: UpdatePersonDetailsInput;
  label: string;
  multiline?: boolean;
  onUpdate: (key: keyof UpdatePersonDetailsInput, value: string) => void;
  type?: string;
}) {
  return (
    <label className="hr-edit-field">
      {label}
      {multiline ? (
        <textarea onChange={(event) => onUpdate(field, event.target.value)} rows={3} value={form[field]} />
      ) : (
        <input onChange={(event) => onUpdate(field, event.target.value)} type={type} value={form[field]} />
      )}
    </label>
  );
}

function joinFieldValues(...values: string[]): string {
  return values.filter(Boolean).join(' ');
}

function buildPersonDetailsForm(person: PersonRecord): UpdatePersonDetailsInput {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    functionLabel: person.functionLabel,
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
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [documents, setDocuments] = useState<HrDocumentRecord[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<HrFilterState>(EMPTY_FILTERS);
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
  const documentsByPersonId = useMemo(
    () =>
      documents.reduce<Map<number, HrDocumentRecord[]>>((result, document) => {
        if (document.personId === null) {
          return result;
        }

        result.set(document.personId, (result.get(document.personId) || []).concat(document));
        return result;
      }, new Map<number, HrDocumentRecord[]>()),
    [documents],
  );
  const visiblePeople = useMemo(
    () =>
      people
        .filter((person) => showInactive || person.active)
        .filter((person) => !filters.collaboratorId || String(person.id) === filters.collaboratorId)
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
    [documentsByPersonId, filters, normalizedSearchQuery, people, showInactive],
  );
  const collaboratorOptions = useMemo(
    () =>
      sortPeople(people).map((person) => ({
        label: `${formatPersonName(person)} - ${person.functionLabel || 'Fonction non renseignee'}`,
        value: String(person.id),
      })),
    [people],
  );
  const categoryOptions = useMemo(
    () =>
      uniqueSorted(documents.map((document) => document.categoryKey)).sort((left, right) => compareHrCategories(left, right)),
    [documents],
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
      documents.filter((document) => {
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
    [documents, filters, isManager, normalizedSearchQuery, visiblePeopleSearchMatches, visiblePersonIds],
  );
  const dashboard = useMemo(
    () => buildHumanResourcesDashboard(visiblePeople, visibleDocuments),
    [visibleDocuments, visiblePeople],
  );
  const staffEvolution = useMemo(() => buildStaffEvolution(people), [people]);
  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) || null,
    [people, selectedPersonId],
  );
  const selectedPersonDocuments = useMemo(
    () => (selectedPerson ? documents.filter((document) => document.personId === selectedPerson.id) : []),
    [documents, selectedPerson],
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

  async function handleSavePersonDetails(personId: number, input: UpdatePersonDetailsInput) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const updatedPerson = await updatePersonDetails(effectiveClient, personId, input);
      setPeople((currentPeople) =>
        sortPeople(currentPeople.map((currentPerson) => (currentPerson.id === personId ? updatedPerson : currentPerson))),
      );
      setStatusMessage('Fiche collaborateur mise a jour.');
    } catch {
      setErrorMessage('Impossible de mettre a jour la fiche collaborateur.');
      throw new Error('person-details-update-failed');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement du personnel RH...</div>;
  }

  return (
    <section className="hr-page">
      <div className="hr-dashboard-shell">
        <aside className="hr-dashboard-sidebar">
          <p className="module-family">QHSE - Bibliotheque documentaire</p>
          <h1>Gestion des Ressources Humaines</h1>
          <p className="hr-header-subtitle">
            {visibleDocuments.length} {metricLabel(visibleDocuments.length, 'document affiche', 'documents affiches')} sur le
            perimetre RH.
          </p>
          <div className="hr-actions" aria-label="Actions RH">
            {isManager ? (
              <button className="hr-action-button" onClick={() => setIsCreateOpen(true)} type="button">
                <UserPlus aria-hidden="true" size={16} />
                Nouveau Collaborateur
              </button>
            ) : null}
            <button className="hr-action-button" type="button">
              <FileText aria-hidden="true" size={16} />
              Plan de formation
            </button>
            <button className="hr-action-button" type="button">
              <ClipboardCheck aria-hidden="true" size={16} />
              Crew competency
            </button>
            <button className="hr-action-button hr-action-button-compact" type="button">
              <HeartPulse aria-hidden="true" size={16} />
              Diagnostic
            </button>
          </div>
        </aside>

        <div className="hr-dashboard-main">
          <StaffEvolutionChart points={staffEvolution} />
          <div className="hr-kpi-band" aria-label="Indicateurs RH">
            <MetricCluster
              icon={<Users aria-hidden="true" size={18} />}
              label="Effectif RH"
              value={dashboard.metrics.activePeople}
              items={[
                { label: 'Sedentaires', value: dashboard.metrics.sedentaryPeople },
                { label: 'Navigants', value: dashboard.metrics.seafarerPeople },
                { label: 'Stagiaires', value: dashboard.metrics.trainees },
              ]}
            />
            <MetricCluster
              icon={<AlertTriangle aria-hidden="true" size={18} />}
              label="A revalider"
              tone="warning"
              value={dashboard.metrics.renewalDue}
              items={[
                { ariaLabel: 'Certificats a revalider', label: 'Certificats', value: dashboard.metrics.certificateRenewals },
                {
                  ariaLabel: 'Visites medicales a revalider',
                  label: 'Visite Medicale',
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
                { ariaLabel: 'Documents echus', label: 'Documents echus', value: dashboard.metrics.expiredDocuments },
                { ariaLabel: 'Documents manquants', label: 'Documents manquant(s)', value: dashboard.metrics.missing },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
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
        <span className={isManager ? 'hr-mode-write' : 'hr-mode-read'}>{isManager ? 'Modification' : 'Lecture seule'}</span>
      </div>

      {dashboard.groups.length === 0 ? (
        <div className="admin-state">Aucun collaborateur a afficher.</div>
      ) : (
        <div className="hr-group-list">
          {dashboard.groups.map((group) => (
            <section className="hr-person-group" key={group.label}>
              <div className="hr-group-heading">
                <h2>{group.label}</h2>
                <span>{group.people.length} collaborateur(s)</span>
              </div>
              <div className="hr-person-list">
                {group.people.map((person) => (
                  <PersonRow
                    isManager={isManager}
                    isSaving={isSaving}
                    key={person.id}
                    onActiveChange={handleActiveChange}
                    onOpen={() => setSelectedPersonId(person.id)}
                    person={person}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

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
        />
      ) : null}
    </section>
  );
}

function StaffEvolutionChart({ points }: { points: Array<{ count: number; year: number }> }) {
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const chartPoints = points.map((point, index) => {
    const x = points.length <= 1 ? 24 : 24 + (index * 552) / (points.length - 1);
    const y = 78 - (point.count / maxCount) * 56;

    return { ...point, x, y };
  });
  const polylinePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <section aria-label="Evolution des effectifs" className="hr-evolution-card">
      <div className="hr-evolution-title">
        <FileText aria-hidden="true" size={18} />
        <span>Evolution des effectifs</span>
      </div>
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

function PersonRow({
  isManager,
  isSaving,
  onActiveChange,
  onOpen,
  person,
}: {
  isManager: boolean;
  isSaving: boolean;
  onActiveChange: (person: PersonRecord, active: boolean) => void;
  onOpen: () => void;
  person: PersonDashboardRecord;
}) {
  const renewalCount = person.documents.filter(isHrDocumentRenewalDue).length;
  const [isPersonExpanded, setIsPersonExpanded] = useState(true);
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
  const hasCaptainValidation = person.documents.some((document) => document.requiresCaptainValidation);

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
        <div className="hr-person-actions">
          <button aria-label={`Ouvrir la fiche de ${formatPersonName(person)}`} className="hr-icon-button" onClick={onOpen} type="button">
            <Users aria-hidden="true" size={16} />
          </button>
          <button aria-label={`Ouvrir les documents de ${formatPersonName(person)}`} className="hr-icon-button" type="button">
            <FileText aria-hidden="true" size={16} />
          </button>
        </div>
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
            {hasCaptainValidation ? (
              <em className="hr-person-inline-alert">Validation capitaine</em>
            ) : null}
          </div>
          <small>{person.documents.length} document(s)</small>
        </div>
        <div className="hr-person-status">
          {renewalCount > 0 ? <span className="hr-alert-badge">{renewalCount} a renouveler</span> : null}
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

                      return (
                        <li className={`hr-document-tree-row hr-document-tree-${document.status}`} key={document.id}>
                          <input aria-label={`Selectionner ${document.title}`} type="checkbox" />
                          <FileText aria-hidden="true" size={16} />
                          <span className="hr-document-tree-main">
                            <strong>{document.title}</strong>
                            {buildDocumentExpiryText(document) ? <small>{buildDocumentExpiryText(document)}</small> : null}
                            {notesForDisplay ? <small className="hr-document-note">{notesForDisplay}</small> : null}
                            {document.requiresCaptainValidation ? <small>Validation capitaine requise</small> : null}
                          </span>
                          <span className={`hr-document-status hr-document-${document.status}`}>
                            {DOCUMENT_STATUS_LABELS[document.status]}
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
            <input onChange={(event) => onUpdate('functionLabel', event.target.value)} value={form.functionLabel} />
          </label>
          <label>
            Grade
            <input onChange={(event) => onUpdate('gradeLabel', event.target.value)} value={form.gradeLabel} />
          </label>
          <label>
            Role
            <input onChange={(event) => onUpdate('roleLabel', event.target.value)} value={form.roleLabel} />
          </label>
          <label>
            Registre
            <input onChange={(event) => onUpdate('registerLabel', event.target.value)} value={form.registerLabel} />
          </label>
          <label>
            Sexe
            <input onChange={(event) => onUpdate('sex', event.target.value)} value={form.sex} />
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

function PersonDetailsDialog({
  documents,
  isManager,
  isSaving,
  onClose,
  onSave,
  person,
}: {
  documents: HrDocumentRecord[];
  isManager: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (personId: number, input: UpdatePersonDetailsInput) => Promise<void>;
  person: PersonRecord;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<UpdatePersonDetailsInput>(() => buildPersonDetailsForm(person));

  useEffect(() => {
    setForm(buildPersonDetailsForm(person));
  }, [person]);

  function updateFormValue(key: keyof UpdatePersonDetailsInput, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await onSave(person.id, form);
      setIsEditing(false);
    } catch {
      // The page-level notice already tells the user why the save failed.
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
            {[
              'Identite et poste',
              'Contrat et dates',
              'Coordonnees',
              'Contact urgence',
              'Documents administratifs',
              'Sante et habilitations',
              'Tenues et mensurations',
            ].map((section, index) => (
              <span key={section}>
                <b>{index + 1}</b>
                {section}
              </span>
            ))}
          </nav>
          <div className="hr-details-content">
            <section>
              <h3>Identite et poste</h3>
              <DetailsGrid isEditing={isEditing}>
                {isEditing ? (
                  <>
                    <EditableField field="firstName" form={form} label="Prenom" onUpdate={updateFormValue} />
                    <EditableField field="lastName" form={form} label="Nom" onUpdate={updateFormValue} />
                    <EditableField field="functionLabel" form={form} label="Fonction" onUpdate={updateFormValue} />
                    <EditableField field="gradeLabel" form={form} label="Grade" onUpdate={updateFormValue} />
                    <EditableField field="roleLabel" form={form} label="Role" onUpdate={updateFormValue} />
                    <EditableField field="registerLabel" form={form} label="Registre" onUpdate={updateFormValue} />
                    <EditableField field="sex" form={form} label="Sexe" onUpdate={updateFormValue} />
                    <EditableField field="sailorNumber" form={form} label="Numero de marin" onUpdate={updateFormValue} />
                    <EditableField field="m365Account" form={form} label="Compte M365" onUpdate={updateFormValue} />
                    <EditableField field="email" form={form} label="Email" onUpdate={updateFormValue} type="email" />
                    <EditableField field="birthDate" form={form} label="Date naissance" onUpdate={updateFormValue} type="date" />
                    <EditableField field="birthPlace" form={form} label="Lieu naissance" onUpdate={updateFormValue} />
                    <EditableField
                      field="identityDocumentType"
                      form={form}
                      label="Type document identite"
                      onUpdate={updateFormValue}
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
                    <FieldValue label="Prenom" value={person.firstName} />
                    <FieldValue label="Nom" value={person.lastName} />
                    <FieldValue label="Fonction" value={person.functionLabel} />
                    <FieldValue label="Grade" value={person.gradeLabel} />
                    <FieldValue label="Role" value={person.roleLabel} />
                    <FieldValue label="Registre" value={person.registerLabel} />
                    <FieldValue label="Sexe" value={person.sex} />
                    <FieldValue label="Numero de marin" value={person.sailorNumber} />
                    <FieldValue label="Compte M365" value={person.m365Account} />
                    <FieldValue label="Email" value={person.email} />
                    <FieldValue label="Date naissance" value={person.birthDate} />
                    <FieldValue label="Lieu naissance" value={person.birthPlace} />
                    <FieldValue
                      label="Document identite"
                      value={joinFieldValues(person.identityDocumentType, person.identityDocumentNumber)}
                    />
                  </>
                )}
              </DetailsGrid>
            </section>
            <section>
              <h3>Contrat et dates</h3>
              <DetailsGrid isEditing={isEditing}>
                {isEditing ? (
                  <>
                    <EditableField field="contractType" form={form} label="Type de contrat" onUpdate={updateFormValue} />
                    <EditableField field="hiredOn" form={form} label="Date embauche" onUpdate={updateFormValue} type="date" />
                    <EditableField field="departedOn" form={form} label="Date depart" onUpdate={updateFormValue} type="date" />
                    <EditableField field="departureReason" form={form} label="Cause depart" onUpdate={updateFormValue} />
                  </>
                ) : (
                  <>
                    <FieldValue label="Type de contrat" value={person.contractType} />
                    <FieldValue label="Date embauche" value={person.hiredOn} />
                    <FieldValue label="Date depart" value={person.departedOn} />
                    <FieldValue label="Cause depart" value={person.departureReason} />
                  </>
                )}
              </DetailsGrid>
            </section>
            <section>
              <h3>Coordonnees</h3>
              <DetailsGrid isEditing={isEditing}>
                {isEditing ? (
                  <>
                    <EditableField field="phone" form={form} label="Telephone" onUpdate={updateFormValue} />
                    <EditableField
                      field="postalAddress"
                      form={form}
                      label="Adresse postale"
                      multiline
                      onUpdate={updateFormValue}
                    />
                  </>
                ) : (
                  <>
                    <FieldValue label="Telephone" value={person.phone} />
                    <FieldValue label="Adresse postale" value={person.postalAddress} />
                  </>
                )}
              </DetailsGrid>
            </section>
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
            <section>
              <h3>Documents administratifs</h3>
              <DocumentList documents={documents.filter((document) => document.categoryKey === 'administrative')} />
            </section>
            <section>
              <h3>Sante et habilitations</h3>
              <DetailsGrid isEditing={isEditing}>
                {isEditing ? (
                  <>
                    <EditableField field="deckCertificateLabel" form={form} label="Brevet Pont" onUpdate={updateFormValue} />
                    <EditableField field="engineCertificateLabel" form={form} label="Brevet Machine" onUpdate={updateFormValue} />
                    <EditableField
                      field="craneTrainingOn"
                      form={form}
                      label="Formation grutage"
                      onUpdate={updateFormValue}
                      type="date"
                    />
                    <EditableField
                      field="craneInductionOn"
                      form={form}
                      label="Induction grutage"
                      onUpdate={updateFormValue}
                      type="date"
                    />
                  </>
                ) : (
                  <>
                    <FieldValue label="Brevet Pont" value={person.deckCertificateLabel} />
                    <FieldValue label="Brevet Machine" value={person.engineCertificateLabel} />
                    <FieldValue label="Formation grutage" value={person.craneTrainingOn} />
                    <FieldValue label="Induction grutage" value={person.craneInductionOn} />
                  </>
                )}
              </DetailsGrid>
              <DocumentList documents={documents.filter((document) => document.categoryKey !== 'administrative')} />
            </section>
            <section>
              <h3>Tenues et mensurations</h3>
              <DetailsGrid isEditing={isEditing}>
                {isEditing ? (
                  <>
                    <EditableField field="waistSize" form={form} label="Tour de taille" onUpdate={updateFormValue} />
                    <EditableField field="chestSize" form={form} label="Poitrine" onUpdate={updateFormValue} />
                    <EditableField field="fullHeightSize" form={form} label="Taille totale" onUpdate={updateFormValue} />
                    <EditableField field="inseamSize" form={form} label="Entrejambe" onUpdate={updateFormValue} />
                    <EditableField field="hipSize" form={form} label="Tour de hanche" onUpdate={updateFormValue} />
                    <EditableField field="weightKg" form={form} label="Poids" onUpdate={updateFormValue} />
                    <EditableField field="shoeSize" form={form} label="Pointure" onUpdate={updateFormValue} />
                    <EditableField field="coverallSize" form={form} label="Combinaison" onUpdate={updateFormValue} />
                    <EditableField field="pantsSize" form={form} label="Pantalon" onUpdate={updateFormValue} />
                    <EditableField field="jacketSize" form={form} label="Veste" onUpdate={updateFormValue} />
                  </>
                ) : (
                  <>
                    <FieldValue label="Tour de taille" value={person.waistSize} />
                    <FieldValue label="Poitrine" value={person.chestSize} />
                    <FieldValue label="Taille totale" value={person.fullHeightSize} />
                    <FieldValue label="Entrejambe" value={person.inseamSize} />
                    <FieldValue label="Tour de hanche" value={person.hipSize} />
                    <FieldValue label="Poids" value={person.weightKg} />
                    <FieldValue label="Pointure" value={person.shoeSize} />
                    <FieldValue label="Combinaison" value={person.coverallSize} />
                    <FieldValue label="Pantalon" value={person.pantsSize} />
                    <FieldValue label="Veste" value={person.jacketSize} />
                  </>
                )}
              </DetailsGrid>
            </section>
          </div>
          </div>
          {isEditing ? (
            <div className="hr-dialog-footer">
              <button
                className="hr-secondary-button"
                onClick={() => {
                  setForm(buildPersonDetailsForm(person));
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

function DocumentList({ documents }: { documents: HrDocumentRecord[] }) {
  if (documents.length === 0) {
    return <p className="hr-muted">Aucun document renseigne.</p>;
  }

  return (
    <ul className="hr-document-list">
      {documents.map((document) => {
        const notesForDisplay = getDocumentNotesForDisplay(document.notes);

        return (
          <li key={document.id}>
            <span className="hr-document-main">
              <strong>{document.title}</strong>
              <small>{getHrDocumentCategoryLabel(document.categoryKey)}</small>
              <span className="hr-document-meta">
                {document.issuedOn ? <small>Delivre le {document.issuedOn}</small> : null}
                {document.expiresOn ? <small>Expire le {document.expiresOn}</small> : null}
                {document.sourceLabel ? <small>Source {document.sourceLabel}</small> : null}
              </span>
              {notesForDisplay ? <em>{notesForDisplay}</em> : null}
            </span>
            <span className="hr-document-actions">
              <span className={`hr-document-status hr-document-${document.status}`}>{DOCUMENT_STATUS_LABELS[document.status]}</span>
              {document.fileUrl ? (
                <a className="hr-document-link" href={document.fileUrl} rel="noreferrer" target="_blank">
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
