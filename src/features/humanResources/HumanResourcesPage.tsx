import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ClipboardCheck,
  FileCheck2,
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
  functionLabel: string;
  gradeLabel: string;
  registerLabel: string;
  roleLabel: string;
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
  functionLabel: '',
  gradeLabel: '',
  registerLabel: '',
  roleLabel: '',
};

const DOCUMENT_STATUS_LABELS: Record<HrDocumentRecord['status'], string> = {
  valid: 'A jour',
  renew_due: 'A renouveler',
  expired: 'Echu',
  missing: 'Manquant',
  pending_validation: 'Validation',
};

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

function personMatchesFilters(person: PersonRecord, filters: HrFilterState): boolean {
  return (
    (!filters.functionLabel || person.functionLabel === filters.functionLabel) &&
    (!filters.gradeLabel || person.gradeLabel === filters.gradeLabel) &&
    (!filters.registerLabel || person.registerLabel === filters.registerLabel) &&
    (!filters.roleLabel || person.roleLabel === filters.roleLabel)
  );
}

function metricLabel(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
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
  const visiblePeople = useMemo(
    () =>
      people
        .filter((person) => showInactive || person.active)
        .filter((person) => personMatchesFilters(person, filters))
        .filter((person) => personMatchesSearch(person, normalizedSearchQuery)),
    [filters, normalizedSearchQuery, people, showInactive],
  );
  const functionOptions = useMemo(() => uniqueSorted(people.map((person) => person.functionLabel)), [people]);
  const gradeOptions = useMemo(() => uniqueSorted(people.map((person) => person.gradeLabel)), [people]);
  const registerOptions = useMemo(() => uniqueSorted(people.map((person) => person.registerLabel)), [people]);
  const roleOptions = useMemo(() => uniqueSorted(people.map((person) => person.roleLabel)), [people]);
  const visiblePersonIds = useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]);
  const visibleDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          (document.personId !== null && visiblePersonIds.has(document.personId)) || (isManager && document.personId === null),
      ),
    [documents, isManager, visiblePersonIds],
  );
  const dashboard = useMemo(
    () => buildHumanResourcesDashboard(visiblePeople, visibleDocuments),
    [visibleDocuments, visiblePeople],
  );
  const unassignedDocuments = useMemo(
    () => (isManager ? visibleDocuments.filter((document) => document.personId === null) : []),
    [isManager, visibleDocuments],
  );
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
      <div className="hr-dashboard-header">
        <div>
          <p className="module-family">QHSE - Bibliotheque documentaire</p>
          <h1>Gestion des Ressources Humaines</h1>
          <p className="hr-header-subtitle">
            {visibleDocuments.length} {metricLabel(visibleDocuments.length, 'document affiche', 'documents affiches')} sur le
            perimetre RH.
          </p>
        </div>
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
          <button className="hr-action-button" type="button">
            <HeartPulse aria-hidden="true" size={16} />
            Diagnostic
          </button>
        </div>
      </div>

      <div className="hr-kpi-grid" aria-label="Indicateurs RH">
        <MetricCard icon={<Users aria-hidden="true" size={18} />} label="Effectif RH" value={dashboard.metrics.activePeople} />
        <MetricCard label="Sedentaires" value={dashboard.metrics.sedentaryPeople} />
        <MetricCard label="Navigants" value={dashboard.metrics.seafarerPeople} />
        <MetricCard label="Stagiaires" value={dashboard.metrics.trainees} />
        <MetricCard label="Contrats renseignes" value={dashboard.metrics.contractsReady} />
        <MetricCard label="Contacts urgence" value={dashboard.metrics.emergencyContactsReady} />
        <MetricCard label="Habilitations" value={dashboard.metrics.habilitationsReady} />
        {isManager ? (
          <MetricCard tone="warning" label="Documents a rattacher" value={dashboard.metrics.unassignedDocuments} />
        ) : null}
        <MetricCard
          tone="warning"
          icon={<AlertTriangle aria-hidden="true" size={18} />}
          label="Documents a renouveler"
          value={dashboard.metrics.renewalDue}
        />
        <MetricCard
          tone="danger"
          icon={<AlertTriangle aria-hidden="true" size={18} />}
          label="Urgent"
          value={dashboard.metrics.urgent}
        />
        <MetricCard icon={<FileCheck2 aria-hidden="true" size={18} />} label="Documents RH" value={dashboard.metrics.documents} />
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="hr-filter-panel">
        <label className="hr-search-field">
          <span>Recherche RH</span>
          <Search aria-hidden="true" size={16} />
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Collaborateur, fichier, document..."
            value={searchQuery}
          />
        </label>
        <label className="hr-filter-field">
          Filtre fonction RH
          <select onChange={(event) => updateFilterValue('functionLabel', event.target.value)} value={filters.functionLabel}>
            <option value="">Toutes les fonctions</option>
            {functionOptions.map((functionLabel) => (
              <option key={functionLabel} value={functionLabel}>
                {functionLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Filtre grade RH
          <select onChange={(event) => updateFilterValue('gradeLabel', event.target.value)} value={filters.gradeLabel}>
            <option value="">Tous les grades</option>
            {gradeOptions.map((gradeLabel) => (
              <option key={gradeLabel} value={gradeLabel}>
                {gradeLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Filtre registre RH
          <select onChange={(event) => updateFilterValue('registerLabel', event.target.value)} value={filters.registerLabel}>
            <option value="">Tous les registres</option>
            {registerOptions.map((registerLabel) => (
              <option key={registerLabel} value={registerLabel}>
                {registerLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-filter-field">
          Filtre role RH
          <select onChange={(event) => updateFilterValue('roleLabel', event.target.value)} value={filters.roleLabel}>
            <option value="">Tous les roles</option>
            {roleOptions.map((roleLabel) => (
              <option key={roleLabel} value={roleLabel}>
                {roleLabel}
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

      {unassignedDocuments.length > 0 ? <UnassignedDocumentsPanel documents={unassignedDocuments} /> : null}

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

function MetricCard({
  icon,
  label,
  tone = 'neutral',
  value,
}: {
  icon?: ReactNode;
  label: string;
  tone?: 'neutral' | 'warning' | 'danger';
  value: number;
}) {
  return (
    <div aria-label={label} className={`hr-kpi-card hr-kpi-${tone}`}>
      <div className="hr-kpi-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
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

  return (
    <article className="hr-person-row">
      <div className="hr-person-main">
        <button aria-label={`Ouvrir la fiche de ${formatPersonName(person)}`} className="hr-person-open" onClick={onOpen} type="button">
          <span>{formatPersonName(person)}</span>
          <small>
            {person.gradeLabel || 'Grade non renseigne'}
            {person.sailorNumber ? ` - Marin ${person.sailorNumber}` : ''}
          </small>
        </button>
        <div className="hr-person-badges" aria-label={`Synthese RH ${formatPersonName(person)}`}>
          {person.registerLabel ? <span>Registre {person.registerLabel}</span> : null}
          {person.contractType ? <span>Contrat {person.contractType}</span> : null}
          <span>{person.emergencyContactName && person.emergencyContactPhone ? 'Urgence OK' : 'Urgence incomplete'}</span>
          {person.deckCertificateLabel ? <span>Pont {person.deckCertificateLabel}</span> : null}
          {person.engineCertificateLabel ? <span>Machine {person.engineCertificateLabel}</span> : null}
        </div>
        {renewalCount > 0 ? <span className="hr-alert-badge">{renewalCount} a renouveler</span> : null}
      </div>
      <div className="hr-category-row">
        {person.categorySummaries.length > 0 ? (
          person.categorySummaries.map((category) => (
            <span className="hr-category-chip" key={category.key}>
              {category.label}
              <b>{category.count}</b>
              {category.urgentCount > 0 ? <em>{category.urgentCount} urgent</em> : null}
            </span>
          ))
        ) : (
          <span className="hr-category-empty">Aucun document associe</span>
        )}
      </div>
      <div className="hr-person-status">
        {person.documents.some((document) => document.requiresCaptainValidation) ? (
          <span className="hr-validation-badge">Validation capitaine</span>
        ) : null}
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
      {documents.map((document) => (
        <li key={document.id}>
          <span className="hr-document-main">
            <strong>{document.title}</strong>
            <small>{getHrDocumentCategoryLabel(document.categoryKey)}</small>
            <span className="hr-document-meta">
              {document.issuedOn ? <small>Delivre le {document.issuedOn}</small> : null}
              {document.expiresOn ? <small>Expire le {document.expiresOn}</small> : null}
              {document.sourceLabel ? <small>Source {document.sourceLabel}</small> : null}
            </span>
            {document.notes ? <em>{document.notes}</em> : null}
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
      ))}
    </ul>
  );
}

function UnassignedDocumentsPanel({ documents }: { documents: HrDocumentRecord[] }) {
  return (
    <section className="hr-unassigned-documents" aria-label="Documents RH a rattacher">
      <div>
        <p className="module-family">Import SharePoint</p>
        <h2>Documents RH a rattacher</h2>
      </div>
      <ul>
        {documents.map((document) => (
          <li key={document.id}>
            <span>
              <strong>{document.title}</strong>
              <small>{getHrDocumentCategoryLabel(document.categoryKey)}</small>
            </span>
            <span>
              <b>{document.personName || 'Collaborateur non renseigne'}</b>
              {document.personSharePointItemId ? <small>SharePoint ID {document.personSharePointItemId}</small> : null}
            </span>
            <span className={`hr-document-status hr-document-${document.status}`}>{DOCUMENT_STATUS_LABELS[document.status]}</span>
            {document.fileUrl ? (
              <a
                aria-label={`Ouvrir le fichier ${document.title}`}
                className="hr-document-link"
                href={document.fileUrl}
                rel="noreferrer"
                target="_blank"
              >
                Ouvrir le fichier
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
