import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckSquare, FileText, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildActionPlanMetrics,
  createActionItem,
  fetchActionPlanData,
  type ActionDocumentRecord,
  type ActionItemRecord,
  type ActionPlanData,
  type CreateActionItemInput,
} from './actionPlanQueries';

interface ActionPlanPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface ActionFilterState {
  search: string;
  status: string;
  priority: string;
  vesselName: string;
  projectCode: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_DATA: ActionPlanData = {
  actions: [],
  documents: [],
};

const EMPTY_FILTERS: ActionFilterState = {
  dateFrom: '',
  dateTo: '',
  priority: '',
  projectCode: '',
  search: '',
  status: '',
  vesselName: '',
};

const EMPTY_FORM: CreateActionItemInput = {
  actionType: '',
  auditType: '',
  categoryKey: 'action',
  correctiveAction: '',
  description: '',
  dueOn: '',
  openedOn: '',
  ownerName: '',
  auditorName: '',
  priorityLabel: 'Normale',
  projectCode: '',
  projectTitle: '',
  status: 'Ouvert',
  title: '',
  vesselName: '',
};

const ACTION_STATUS_OPTIONS = ['Ouvert', 'En cours', 'A verifier', 'Clos', 'Annule'];
const ACTION_PRIORITY_OPTIONS = ['Basse', 'Normale', 'Haute', 'Critique'];

function canManageActionPlan(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

function displayText(value: string): string {
  return value || '-';
}

function sortActions(actions: ActionItemRecord[]): ActionItemRecord[] {
  return [...actions].sort(
    (left, right) =>
      left.dueOn.localeCompare(right.dueOn) ||
      left.openedOn.localeCompare(right.openedOn) ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function sortDocuments(documents: ActionDocumentRecord[]): ActionDocumentRecord[] {
  return [...documents].sort(
    (left, right) => left.actionTitle.localeCompare(right.actionTitle, 'fr') || left.title.localeCompare(right.title, 'fr'),
  );
}

function actionDateForFilter(action: ActionItemRecord): string {
  return action.dueOn || action.openedOn;
}

function actionMatchesStructuredFilters(action: ActionItemRecord, filters: ActionFilterState): boolean {
  if (filters.status && action.status !== filters.status) {
    return false;
  }

  if (filters.priority && action.priorityLabel !== filters.priority) {
    return false;
  }

  if (filters.vesselName && action.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.projectCode && action.projectCode !== filters.projectCode) {
    return false;
  }

  const actionDate = actionDateForFilter(action);

  if (filters.dateFrom && actionDate && actionDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && actionDate && actionDate > filters.dateTo) {
    return false;
  }

  return true;
}

function actionMatchesFilters(action: ActionItemRecord, filters: ActionFilterState): boolean {
  if (!actionMatchesStructuredFilters(action, filters)) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      action.title,
      action.actionType,
      action.auditType,
      action.categoryKey,
      action.status,
      action.priorityLabel,
      action.projectCode,
      action.projectTitle,
      action.vesselName,
      action.ownerName,
      action.auditorName,
      action.description,
      action.correctiveAction,
      action.sourceLabel,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function findDocumentAction(document: ActionDocumentRecord, actions: ActionItemRecord[]): ActionItemRecord | undefined {
  return actions.find((action) => (document.actionItemId && action.id === document.actionItemId) || document.actionTitle === action.title);
}

function documentMatchesFilters(
  document: ActionDocumentRecord,
  actions: ActionItemRecord[],
  filters: ActionFilterState,
): boolean {
  const relatedAction = findDocumentAction(document, actions);
  const hasStructuredFilters = Boolean(
    filters.status || filters.priority || filters.vesselName || filters.projectCode || filters.dateFrom || filters.dateTo,
  );

  if (hasStructuredFilters && (!relatedAction || !actionMatchesStructuredFilters(relatedAction, filters))) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      document.title,
      document.actionTitle,
      document.categoryKey,
      document.notes,
      document.sourceLabel,
      relatedAction?.title,
      relatedAction?.description,
      relatedAction?.correctiveAction,
      relatedAction?.projectCode,
      relatedAction?.vesselName,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function renderDocumentRows(documents: ActionDocumentRecord[]) {
  return documents.map((document) => (
    <tr key={document.id}>
      <th scope="row">
        <span className="action-title">
          <FileText aria-hidden="true" size={16} />
          {document.title}
        </span>
        {document.notes ? <small>{document.notes}</small> : null}
      </th>
      <td>{displayText(document.actionTitle)}</td>
      <td>{displayText(document.categoryKey)}</td>
      <td>{displayText(document.sourceLabel)}</td>
      <td>
        {document.fileUrl ? (
          <a className="hr-document-link" href={document.fileUrl} rel="noreferrer" target="_blank">
            {`Ouvrir le fichier ${document.title}`}
          </a>
        ) : (
          '-'
        )}
      </td>
    </tr>
  ));
}

export function ActionPlanPage({ client, roles }: ActionPlanPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageActionPlan(effectiveRoles);
  const [data, setData] = useState<ActionPlanData>(EMPTY_DATA);
  const [filters, setFilters] = useState<ActionFilterState>(EMPTY_FILTERS);
  const [actionForm, setActionForm] = useState<CreateActionItemInput>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchActionPlanData(effectiveClient)
      .then((loadedData) => {
        if (isMounted) {
          setData({
            actions: sortActions(loadedData.actions),
            documents: sortDocuments(loadedData.documents),
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("Impossible de charger le plan d'action.");
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

  const filteredActions = useMemo(
    () => data.actions.filter((action) => actionMatchesFilters(action, filters)),
    [data.actions, filters],
  );
  const filteredDocuments = useMemo(
    () => data.documents.filter((document) => documentMatchesFilters(document, data.actions, filters)),
    [data.actions, data.documents, filters],
  );
  const metrics = useMemo(
    () => buildActionPlanMetrics(filteredActions, filteredDocuments),
    [filteredActions, filteredDocuments],
  );
  const statusOptions = useMemo(
    () => uniqueSorted([...data.actions.map((action) => action.status), ...ACTION_STATUS_OPTIONS]),
    [data.actions],
  );
  const priorityOptions = useMemo(
    () => uniqueSorted([...data.actions.map((action) => action.priorityLabel), ...ACTION_PRIORITY_OPTIONS]),
    [data.actions],
  );
  const vesselOptions = useMemo(() => uniqueSorted(data.actions.map((action) => action.vesselName)), [data.actions]);
  const projectOptions = useMemo(() => uniqueSorted(data.actions.map((action) => action.projectCode)), [data.actions]);
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const hasVisibleData = filteredActions.length > 0 || filteredDocuments.length > 0;

  function updateFilterValue(key: keyof ActionFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateFormValue(key: keyof CreateActionItemInput, value: string) {
    setActionForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleCreateAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const action = await createActionItem(effectiveClient, actionForm);
      setData((currentData) => ({
        ...currentData,
        actions: sortActions([...currentData.actions, action]),
      }));
      setActionForm(EMPTY_FORM);
      setStatusMessage('Action ajoutee.');
    } catch {
      setErrorMessage("Impossible d'ajouter cette action.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement du plan d'action...</div>;
  }

  return (
    <section className="action-page">
      <div className="admin-header">
        <div>
          <p className="module-family">QHSE</p>
          <h1>Plan d'action</h1>
        </div>
        <div className="action-summary-grid">
          <div className="planning-summary" aria-label="Actions ouvertes">
            <CheckSquare aria-hidden="true" size={18} />
            <strong>{metrics.openActionCount}</strong>
            <span>ouvertes</span>
          </div>
          <div className="planning-summary" aria-label="Actions haute priorite">
            <AlertTriangle aria-hidden="true" size={18} />
            <strong>{metrics.highPriorityCount}</strong>
            <span>priorite</span>
          </div>
          <div className="planning-summary" aria-label="Echeances actions">
            <AlertTriangle aria-hidden="true" size={18} />
            <strong>{metrics.dueActionCount}</strong>
            <span>echeances</span>
          </div>
          <div className="planning-summary" aria-label="Fiches progres">
            <FileText aria-hidden="true" size={18} />
            <strong>{metrics.documentCount}</strong>
            <span>fiches</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel action-filter-panel" aria-label="Filtres actions">
        <label>
          Recherche actions
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Action, navire, correctif..."
            value={filters.search}
          />
        </label>
        <label>
          Filtre statut action
          <select onChange={(event) => updateFilterValue('status', event.target.value)} value={filters.status}>
            <option value="">Tous les statuts</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre priorite action
          <select onChange={(event) => updateFilterValue('priority', event.target.value)} value={filters.priority}>
            <option value="">Toutes les priorites</option>
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre navire action
          <select onChange={(event) => updateFilterValue('vesselName', event.target.value)} value={filters.vesselName}>
            <option value="">Tous les navires</option>
            {vesselOptions.map((vesselName) => (
              <option key={vesselName} value={vesselName}>
                {vesselName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre projet action
          <select onChange={(event) => updateFilterValue('projectCode', event.target.value)} value={filters.projectCode}>
            <option value="">Tous les projets</option>
            {projectOptions.map((projectCode) => (
              <option key={projectCode} value={projectCode}>
                {projectCode}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action depuis
          <input onChange={(event) => updateFilterValue('dateFrom', event.target.value)} type="date" value={filters.dateFrom} />
        </label>
        <label>
          Action jusqu'au
          <input onChange={(event) => updateFilterValue('dateTo', event.target.value)} type="date" value={filters.dateTo} />
        </label>
        <button disabled={!hasActiveFilters} onClick={() => setFilters(EMPTY_FILTERS)} type="button">
          Reinitialiser
        </button>
      </div>

      <div className="planning-toolbar">
        <span className={isManager ? 'planning-mode-write' : 'planning-mode-read'}>
          {isManager ? 'Modification' : 'Lecture seule'}
        </span>
      </div>

      {isManager ? (
        <form className="planning-form action-form" onSubmit={handleCreateAction}>
          <div className="planning-form-title">
            <Upload aria-hidden="true" size={18} />
            <strong>Nouvelle action</strong>
          </div>
          <label>
            Titre action
            <input onChange={(event) => updateFormValue('title', event.target.value)} required value={actionForm.title} />
          </label>
          <label>
            Categorie action
            <input onChange={(event) => updateFormValue('categoryKey', event.target.value)} value={actionForm.categoryKey} />
          </label>
          <label>
            Type action
            <input onChange={(event) => updateFormValue('actionType', event.target.value)} value={actionForm.actionType} />
          </label>
          <label>
            Type audit
            <input onChange={(event) => updateFormValue('auditType', event.target.value)} value={actionForm.auditType} />
          </label>
          <label>
            Numero projet action
            <input onChange={(event) => updateFormValue('projectCode', event.target.value)} value={actionForm.projectCode} />
          </label>
          <label>
            Nom projet action
            <input onChange={(event) => updateFormValue('projectTitle', event.target.value)} value={actionForm.projectTitle} />
          </label>
          <label>
            Navire action
            <input onChange={(event) => updateFormValue('vesselName', event.target.value)} value={actionForm.vesselName} />
          </label>
          <label>
            Ouverture action
            <input onChange={(event) => updateFormValue('openedOn', event.target.value)} type="date" value={actionForm.openedOn} />
          </label>
          <label>
            Echeance action
            <input onChange={(event) => updateFormValue('dueOn', event.target.value)} type="date" value={actionForm.dueOn} />
          </label>
          <label>
            Statut action
            <select onChange={(event) => updateFormValue('status', event.target.value)} value={actionForm.status}>
              {ACTION_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priorite action
            <select onChange={(event) => updateFormValue('priorityLabel', event.target.value)} value={actionForm.priorityLabel}>
              {ACTION_PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsable action
            <input onChange={(event) => updateFormValue('ownerName', event.target.value)} value={actionForm.ownerName} />
          </label>
          <label>
            Auditeur action
            <input onChange={(event) => updateFormValue('auditorName', event.target.value)} value={actionForm.auditorName} />
          </label>
          <label>
            Description action
            <input onChange={(event) => updateFormValue('description', event.target.value)} value={actionForm.description} />
          </label>
          <label>
            Correctif action
            <input
              onChange={(event) => updateFormValue('correctiveAction', event.target.value)}
              value={actionForm.correctiveAction}
            />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter action
          </button>
        </form>
      ) : null}

      {!hasVisibleData ? (
        <div className="admin-state">Aucune action a afficher.</div>
      ) : (
        <div className="action-sections">
          {filteredActions.length > 0 ? (
            <section className="action-panel" aria-labelledby="action-list-title">
              <div className="procedures-section-heading">
                <h2 id="action-list-title">Actions et audits</h2>
                <span>{filteredActions.length} action(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table action-table">
                  <thead>
                    <tr>
                      <th scope="col">Action</th>
                      <th scope="col">Projet</th>
                      <th scope="col">Navire</th>
                      <th scope="col">Echeance</th>
                      <th scope="col">Responsable</th>
                      <th scope="col">Priorite</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActions.map((action) => (
                      <tr key={action.id}>
                        <th scope="row">
                          <span className="action-title">
                            <CheckSquare aria-hidden="true" size={16} />
                            {action.title}
                          </span>
                          {action.description ? <small>{action.description}</small> : null}
                          {action.correctiveAction ? <small>{action.correctiveAction}</small> : null}
                        </th>
                        <td>
                          <strong>{displayText(action.projectCode)}</strong>
                          <small>{displayText(action.projectTitle)}</small>
                        </td>
                        <td>{displayText(action.vesselName)}</td>
                        <td>
                          {displayText(action.dueOn)}
                          {action.openedOn ? <small>{`Ouvert ${action.openedOn}`}</small> : null}
                        </td>
                        <td>
                          {displayText(action.ownerName)}
                          {action.auditorName ? <small>{`Audit ${action.auditorName}`}</small> : null}
                        </td>
                        <td>
                          <span className="action-priority-chip">{displayText(action.priorityLabel)}</span>
                        </td>
                        <td>
                          <span className="action-status-chip">{displayText(action.status)}</span>
                        </td>
                        <td>{displayText(action.sourceLabel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {filteredDocuments.length > 0 ? (
            <section className="action-panel" aria-labelledby="action-documents-title">
              <div className="procedures-section-heading">
                <h2 id="action-documents-title">Fiches de progres</h2>
                <span>{filteredDocuments.length} fichier(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table action-table">
                  <thead>
                    <tr>
                      <th scope="col">Fiche</th>
                      <th scope="col">Action</th>
                      <th scope="col">Categorie</th>
                      <th scope="col">Source</th>
                      <th scope="col">Fichier</th>
                    </tr>
                  </thead>
                  <tbody>{renderDocumentRows(filteredDocuments)}</tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
