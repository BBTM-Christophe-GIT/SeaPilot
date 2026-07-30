import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  GripVertical,
  Info,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { daysBetween, formatPlanningDate } from './planningDates';
import {
  createAndSchedulePlanningProject,
  createPlanningProjectClient,
  fetchPlanningProjectCatalog,
  fetchPlanningProjectClients,
  schedulePlanningCatalogProject,
  type PlanningProjectCatalogRecord,
  type PlanningProjectClientInput,
  type PlanningProjectClientRecord,
  type PlanningProjectIdentificationInput,
} from './planningProjectCatalog';
import type { PlanningProjectRecord, PlanningVessel } from './planningQueries';
import { PROJECT_STATUSES, normalizeProjectStatus } from '../projects/projectStatus';

interface PlanningProjectPickerDialogProps {
  client: SupabaseClient;
  date: string;
  editable: boolean;
  onClose: () => void;
  onScheduled: (project: PlanningProjectRecord) => void;
  vessel: PlanningVessel;
}

const EMPTY_CLIENT: PlanningProjectClientInput = {
  name: '',
  code: '',
  email: '',
  phone: '',
  city: '',
  country: 'France',
};

function projectDuration(project: PlanningProjectCatalogRecord): string {
  if (!project.startsOn) return 'Durée à définir';
  const duration = daysBetween(project.startsOn, project.endsOn || project.startsOn) + 1;
  return `Durée : ${duration} jour${duration > 1 ? 's' : ''}`;
}

function statusTone(status: string): string {
  const normalized = status.trim().toLocaleLowerCase('fr-FR');
  if (normalized.includes('confirm') || normalized.includes('valid') || normalized.includes('sign')) return 'is-confirmed';
  if (normalized.includes('cours')) return 'is-active';
  return 'is-planned';
}

function nextProjectCode(projects: PlanningProjectCatalogRecord[]): string {
  const numbers = projects.flatMap((project) => {
    const match = /^P(\d+)$/i.exec(project.projectCode.trim());
    return match ? [Number(match[1])] : [];
  });
  return `P${Math.max(266, ...numbers) + 1}`;
}

export function PlanningProjectPickerDialog({
  client,
  date,
  editable,
  onClose,
  onScheduled,
  vessel,
}: PlanningProjectPickerDialogProps) {
  const [mode, setMode] = useState<'catalog' | 'create'>('catalog');
  const [projects, setProjects] = useState<PlanningProjectCatalogRecord[]>([]);
  const [clients, setClients] = useState<PlanningProjectClientRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [identificationExpanded, setIdentificationExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [form, setForm] = useState<PlanningProjectIdentificationInput>({
    title: '',
    clientId: null,
    status: 'Non validé',
    description: '',
    vesselId: vessel.id,
    startsOn: date,
  });

  useEffect(() => {
    let active = true;
    Promise.all([fetchPlanningProjectCatalog(client), fetchPlanningProjectClients(client)])
      .then(([loadedProjects, loadedClients]) => {
        if (!active) return;
        setProjects(loadedProjects);
        setClients(loadedClients);
      })
      .catch((error) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les projets.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr-FR');
    if (!needle) return projects;
    return projects.filter((project) => [
      project.projectCode,
      project.title,
      project.clientName,
      project.status,
      project.description,
    ].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle)));
  }, [projects, query]);
  const codePreview = useMemo(() => nextProjectCode(projects), [projects]);

  async function addSelectedProject() {
    if (!editable || selectedProjectId === null) return;
    setErrorMessage('');
    setIsSaving(true);
    try {
      onScheduled(await schedulePlanningCatalogProject(client, {
        projectId: selectedProjectId,
        vesselId: vessel.id,
        startsOn: date,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'ajouter ce projet au planning.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;
    setErrorMessage('');
    setIsSaving(true);
    try {
      onScheduled(await createAndSchedulePlanningProject(client, form));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de créer ce projet.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleClientCreated(created: PlanningProjectClientRecord) {
    setClients((current) => [...current.filter((item) => item.id !== created.id), created]
      .sort((left, right) => left.name.localeCompare(right.name, 'fr')));
    setForm((current) => ({ ...current, clientId: created.id }));
    setClientDialogOpen(false);
  }

  return (
    <div className="planning-project-picker-backdrop" role="presentation">
      <section
        aria-label={mode === 'catalog' ? 'Planifier un projet' : 'Créer un projet'}
        aria-modal="true"
        className="planning-project-picker"
        role="dialog"
      >
        <header>
          <span>
            <strong>{mode === 'catalog' ? 'Planifier un projet' : 'Créer un projet'}</strong>
            <small>{vessel.name} · {formatPlanningDate(date)}</small>
          </span>
          <div>
            <em className={editable ? 'is-editable' : 'is-readonly'}>
              {editable ? <Pencil aria-hidden="true" size={14} /> : <LockKeyhole aria-hidden="true" size={14} />}
              {editable ? 'Mode modification' : 'Mode lecture seule'}
            </em>
            <button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>

        {mode === 'catalog' ? (
          <>
            <main className="planning-project-picker-catalog">
              <div className="planning-project-picker-tools">
                <label>
                  <Search aria-hidden="true" size={19} />
                  <input
                    aria-label="Rechercher un projet par mot-clé"
                    autoFocus
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Rechercher un projet par mot-clé"
                    type="search"
                    value={query}
                  />
                </label>
                <button
                  className="is-create"
                  disabled={!editable || isSaving}
                  onClick={() => setMode('create')}
                  title={editable ? 'Créer un nouveau projet' : 'Votre rôle dispose d’un accès en lecture seule'}
                  type="button"
                >
                  <Plus aria-hidden="true" size={18} />
                  Créer un nouveau projet
                </button>
              </div>

              {isLoading ? <div className="planning-project-picker-state" role="status">Chargement des projets…</div> : null}
              {!isLoading && !visibleProjects.length ? (
                <div className="planning-project-picker-state">
                  <FolderKanban aria-hidden="true" size={28} />
                  <strong>Aucun projet trouvé</strong>
                  <span>Modifiez la recherche ou créez un nouveau projet.</span>
                </div>
              ) : null}
              {!isLoading && visibleProjects.length ? (
                <div aria-label="Liste des projets" className="planning-project-picker-list" role="listbox">
                  {visibleProjects.map((project) => {
                    const selected = selectedProjectId === project.id;
                    return (
                      <button
                        aria-selected={selected}
                        className={selected ? 'is-selected' : ''}
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                        role="option"
                        type="button"
                      >
                        <span className="planning-project-picker-icon"><FolderKanban aria-hidden="true" size={20} /></span>
                        <span className="planning-project-picker-copy">
                          <strong>{project.projectCode ? `${project.projectCode} · ` : ''}{project.title}</strong>
                          <small>
                            Client : {project.clientName || 'Non renseigné'}
                            <i>·</i>
                            {projectDuration(project)}
                          </small>
                        </span>
                        <em className={statusTone(project.status)}>{normalizeProjectStatus(project.status)}</em>
                        <ChevronRight aria-hidden="true" size={18} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </main>
            {errorMessage ? <p className="planning-project-picker-error" role="alert">{errorMessage}</p> : null}
            <footer>
              <p><Info aria-hidden="true" size={17} />Le projet sera ajouté sur la ligne du navire et pourra être déplacé ou étendu dans le planning.</p>
              <span>
                <button className="is-secondary" disabled={isSaving} onClick={onClose} type="button">Annuler</button>
                <button disabled={!editable || selectedProjectId === null || isSaving} onClick={() => void addSelectedProject()} type="button">
                  {isSaving ? 'Ajout…' : 'Ajouter au planning'}
                </button>
              </span>
            </footer>
          </>
        ) : (
          <form onSubmit={createProject}>
            <main className="planning-project-identification">
              <fieldset className={identificationExpanded ? 'is-expanded' : 'is-collapsed'}>
                <legend>
                  <GripVertical aria-hidden="true" className="planning-project-drag-handle" size={19} />
                  <button
                    aria-expanded={identificationExpanded}
                    onClick={() => setIdentificationExpanded((current) => !current)}
                    type="button"
                  >
                    <b>1</b>
                    <strong>Identification</strong>
                    <small>8 champs</small>
                    {identificationExpanded ? <ChevronDown aria-hidden="true" size={18} /> : <ChevronRight aria-hidden="true" size={18} />}
                  </button>
                </legend>
                {identificationExpanded ? (
                  <div className="planning-project-identification-body">
                    <p className="project-code-preview">
                      Nom final : <strong>{codePreview} - {form.title || '…'}</strong>
                      <small>Le numéro affiché est un aperçu ; il sera attribué automatiquement à l’enregistrement.</small>
                    </p>
                    <div className="project-editor-grid">
                      <label>
                        <span>Code projet</span>
                        <input disabled value={codePreview} />
                      </label>
                      <label className="is-wide">
                        <span>Nom du projet *</span>
                        <input
                          autoFocus
                          disabled={!editable}
                          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                          required
                          value={form.title}
                        />
                      </label>
                      <div className="project-editor-client-field">
                        <div className="project-editor-field-label">
                          <span>Client / affréteur</span>
                          <button
                            aria-label="Ajouter un client ou affréteur"
                            disabled={!editable}
                            onClick={() => setClientDialogOpen(true)}
                            type="button"
                          >
                            <Plus aria-hidden="true" size={15} />
                            Ajouter
                          </button>
                        </div>
                        <select
                          aria-label="Client / affréteur"
                          disabled={!editable}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            clientId: event.target.value ? Number(event.target.value) : null,
                          }))}
                          value={form.clientId ?? ''}
                        >
                          <option value="">Non renseigné</option>
                          {clients.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                      <label>
                        <span>Statut</span>
                        <input
                          disabled={!editable}
                          list="planning-project-status-values"
                          onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                          value={form.status}
                        />
                        <datalist id="planning-project-status-values">
                          {PROJECT_STATUSES.map((status) => <option key={status} value={status} />)}
                        </datalist>
                      </label>
                      <label className="is-wide">
                        <span>Description</span>
                        <textarea
                          disabled={!editable}
                          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                          value={form.description}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </fieldset>
            </main>
            {errorMessage ? <p className="planning-project-picker-error" role="alert">{errorMessage}</p> : null}
            <footer>
              <button className="is-secondary is-back" disabled={isSaving} onClick={() => setMode('catalog')} type="button">
                <ArrowLeft aria-hidden="true" size={16} />
                Retour aux projets
              </button>
              <span>
                <button className="is-secondary" disabled={isSaving} onClick={onClose} type="button">Annuler</button>
                <button disabled={!editable || isSaving} type="submit">
                  {isSaving ? 'Création…' : 'Créer et ajouter au planning'}
                </button>
              </span>
            </footer>
          </form>
        )}
      </section>

      {clientDialogOpen ? (
        <PlanningProjectClientDialog
          client={client}
          onClose={() => setClientDialogOpen(false)}
          onCreated={handleClientCreated}
        />
      ) : null}
    </div>
  );
}

function PlanningProjectClientDialog({
  client,
  onClose,
  onCreated,
}: {
  client: SupabaseClient;
  onClose: () => void;
  onCreated: (clientRecord: PlanningProjectClientRecord) => void;
}) {
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);
    try {
      onCreated(await createPlanningProjectClient(client, form));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de créer ce client.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="planning-project-client-backdrop" role="presentation">
      <form aria-label="Ajouter un client ou affréteur" aria-modal="true" className="planning-project-client-dialog" onSubmit={submit} role="dialog">
        <header>
          <span><strong>Nouveau client</strong><small>Référentiel projets</small></span>
          <button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="planning-project-client-grid">
          <label className="is-wide"><span>Nom *</span><input autoFocus onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} /></label>
          <label><span>Code</span><input onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} value={form.code} /></label>
          <label><span>Pays</span><input onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} value={form.country} /></label>
          <label><span>E-mail</span><input onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} type="email" value={form.email} /></label>
          <label><span>Téléphone</span><input onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} value={form.phone} /></label>
          <label className="is-wide"><span>Ville</span><input onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} value={form.city} /></label>
        </div>
        {errorMessage ? <p className="planning-project-picker-error" role="alert">{errorMessage}</p> : null}
        <footer>
          <button className="is-secondary" disabled={isSaving} onClick={onClose} type="button">Annuler</button>
          <button disabled={isSaving} type="submit">{isSaving ? 'Création…' : 'Créer le client'}</button>
        </footer>
      </form>
    </div>
  );
}
