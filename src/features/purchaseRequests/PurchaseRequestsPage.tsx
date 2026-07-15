import type { SupabaseClient } from '@supabase/supabase-js';
import { ClipboardList, FileText, Truck, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { fetchProjectCatalogOptions, type ProjectCatalogOption } from '../projects/projectMutations';
import {
  buildPurchaseRequestMetrics,
  createPurchaseRequest,
  fetchPurchaseRequests,
  type CreatePurchaseRequestInput,
  type PurchaseRequestRecord,
} from './purchaseRequestQueries';

interface PurchaseRequestsPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface PurchaseRequestFilterState {
  search: string;
  status: string;
  projectCode: string;
  supplierName: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: PurchaseRequestFilterState = {
  dateFrom: '',
  dateTo: '',
  projectCode: '',
  search: '',
  status: '',
  supplierName: '',
};

const EMPTY_FORM: CreatePurchaseRequestInput = {
  amountHt: '',
  currency: 'EUR',
  description: '',
  projectId: null,
  projectCode: '',
  projectTitle: '',
  requestedOn: '',
  requesterName: '',
  requestNumber: '',
  status: 'A valider',
  supplierName: '',
  title: '',
};

const PURCHASE_STATUS_OPTIONS = ['A valider', 'En cours', 'Valide', 'Commande', 'Recu', 'Annule'];

function canManagePurchaseRequests(roles: RoleKey[]): boolean {
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

function formatAmount(value: number, currency: string): string {
  const formattedValue = value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return `${formattedValue} ${currency || 'EUR'}`;
}

function sortPurchaseRequests(requests: PurchaseRequestRecord[]): PurchaseRequestRecord[] {
  return [...requests].sort(
    (left, right) =>
      right.requestedOn.localeCompare(left.requestedOn) ||
      left.requestNumber.localeCompare(right.requestNumber, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function requestMatchesFilters(request: PurchaseRequestRecord, filters: PurchaseRequestFilterState): boolean {
  if (filters.status && request.status !== filters.status) {
    return false;
  }

  if (filters.projectCode && request.projectCode !== filters.projectCode) {
    return false;
  }

  if (filters.supplierName && request.supplierName !== filters.supplierName) {
    return false;
  }

  if (filters.dateFrom && request.requestedOn && request.requestedOn < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && request.requestedOn && request.requestedOn > filters.dateTo) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      request.requestNumber,
      request.title,
      request.description,
      request.requesterName,
      request.supplierName,
      request.projectCode,
      request.projectTitle,
      request.status,
      request.sourceLabel,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

export function PurchaseRequestsPage({ client, roles }: PurchaseRequestsPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManagePurchaseRequests(effectiveRoles);
  const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
  const [filters, setFilters] = useState<PurchaseRequestFilterState>(EMPTY_FILTERS);
  const [requestForm, setRequestForm] = useState<CreatePurchaseRequestInput>(EMPTY_FORM);
  const [catalogProjects, setCatalogProjects] = useState<ProjectCatalogOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([
      fetchPurchaseRequests(effectiveClient),
      isManager ? fetchProjectCatalogOptions(effectiveClient).catch(() => []) : Promise.resolve([]),
    ])
      .then(([loadedRequests, loadedProjects]) => {
        if (isMounted) {
          setRequests(sortPurchaseRequests(loadedRequests));
          setCatalogProjects(loadedProjects);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("Impossible de charger les demandes d'achat.");
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
  }, [effectiveClient, isManager]);

  const filteredRequests = useMemo(
    () => requests.filter((request) => requestMatchesFilters(request, filters)),
    [filters, requests],
  );
  const metrics = useMemo(() => buildPurchaseRequestMetrics(filteredRequests), [filteredRequests]);
  const statusOptions = useMemo(
    () => uniqueSorted([...requests.map((request) => request.status), ...PURCHASE_STATUS_OPTIONS]),
    [requests],
  );
  const projectOptions = useMemo(
    () => uniqueSorted([...requests.map((request) => request.projectCode), ...catalogProjects.map((project) => project.projectCode)]),
    [catalogProjects, requests],
  );
  const supplierOptions = useMemo(() => uniqueSorted(requests.map((request) => request.supplierName)), [requests]);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function updateFilterValue(key: keyof PurchaseRequestFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateFormValue(key: keyof CreatePurchaseRequestInput, value: string | number | null) {
    setRequestForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function selectCatalogProject(projectId: string) {
    const project = catalogProjects.find((option) => option.id === Number(projectId));
    setRequestForm((currentForm) => ({
      ...currentForm,
      projectId: project?.id ?? null,
      projectCode: project?.projectCode || '',
      projectTitle: project?.title || '',
    }));
  }

  async function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const request = await createPurchaseRequest(effectiveClient, requestForm);
      setRequests((currentRequests) => sortPurchaseRequests([...currentRequests, request]));
      setRequestForm(EMPTY_FORM);
      setStatusMessage('Demande ajoutee.');
    } catch {
      setErrorMessage("Impossible d'ajouter cette demande.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des demandes d'achat...</div>;
  }

  return (
    <section className="purchase-page">
      <div className="admin-header">
        <div>
          <p className="module-family">Achats</p>
          <h1>Demandes d'achat</h1>
        </div>
        <div className="purchase-summary-grid">
          <div className="planning-summary" aria-label="Demandes achat">
            <ClipboardList aria-hidden="true" size={18} />
            <strong>{metrics.requestCount}</strong>
            <span>demandes</span>
          </div>
          <div className="planning-summary" aria-label="Demandes en cours">
            <FileText aria-hidden="true" size={18} />
            <strong>{metrics.openRequestCount}</strong>
            <span>en cours</span>
          </div>
          <div className="planning-summary" aria-label="Montant HT">
            <FileText aria-hidden="true" size={18} />
            <strong>{metrics.totalAmountHt.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</strong>
            <span>HT</span>
          </div>
          <div className="planning-summary" aria-label="Fournisseurs achats">
            <Truck aria-hidden="true" size={18} />
            <strong>{metrics.supplierCount}</strong>
            <span>fournisseurs</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel purchase-filter-panel" aria-label="Filtres achats">
        <label>
          Recherche achats
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Demande, fournisseur, projet..."
            value={filters.search}
          />
        </label>
        <label>
          Filtre statut achat
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
          Filtre projet achat
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
          Filtre fournisseur achat
          <select onChange={(event) => updateFilterValue('supplierName', event.target.value)} value={filters.supplierName}>
            <option value="">Tous les fournisseurs</option>
            {supplierOptions.map((supplierName) => (
              <option key={supplierName} value={supplierName}>
                {supplierName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Achat depuis
          <input onChange={(event) => updateFilterValue('dateFrom', event.target.value)} type="date" value={filters.dateFrom} />
        </label>
        <label>
          Achat jusqu'au
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
        <form className="planning-form purchase-form" onSubmit={handleCreateRequest}>
          <div className="planning-form-title">
            <Upload aria-hidden="true" size={18} />
            <strong>Nouvelle demande</strong>
          </div>
          <label>
            Numero demande
            <input onChange={(event) => updateFormValue('requestNumber', event.target.value)} value={requestForm.requestNumber} />
          </label>
          <label>
            Titre demande
            <input onChange={(event) => updateFormValue('title', event.target.value)} value={requestForm.title} />
          </label>
          <label>
            Date demande
            <input onChange={(event) => updateFormValue('requestedOn', event.target.value)} type="date" value={requestForm.requestedOn} />
          </label>
          <label>
            Demandeur
            <input onChange={(event) => updateFormValue('requesterName', event.target.value)} value={requestForm.requesterName} />
          </label>
          <label>
            Fournisseur
            <input onChange={(event) => updateFormValue('supplierName', event.target.value)} value={requestForm.supplierName} />
          </label>
          <label>
            Projet du catalogue achat
            <select onChange={(event) => selectCatalogProject(event.target.value)} value={requestForm.projectId ?? ''}>
              <option value="">Aucun projet</option>
              {catalogProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} - {project.title}</option>)}
            </select>
          </label>
          <label>
            Montant HT demande
            <input inputMode="decimal" onChange={(event) => updateFormValue('amountHt', event.target.value)} value={requestForm.amountHt} />
          </label>
          <label>
            Devise demande
            <input onChange={(event) => updateFormValue('currency', event.target.value)} value={requestForm.currency} />
          </label>
          <label>
            Statut achat
            <select onChange={(event) => updateFormValue('status', event.target.value)} value={requestForm.status}>
              {PURCHASE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objet achat
            <input onChange={(event) => updateFormValue('description', event.target.value)} value={requestForm.description} />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter demande
          </button>
        </form>
      ) : null}

      {filteredRequests.length === 0 ? (
        <div className="admin-state">Aucune demande d'achat a afficher.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table purchase-table">
            <thead>
              <tr>
                <th scope="col">Demande</th>
                <th scope="col">Projet</th>
                <th scope="col">Fournisseur</th>
                <th scope="col">Demandeur</th>
                <th scope="col">Date</th>
                <th scope="col">Montant</th>
                <th scope="col">Statut</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id}>
                  <th scope="row">
                    <span className="purchase-title">
                      <ClipboardList aria-hidden="true" size={16} />
                      {request.requestNumber || request.title}
                    </span>
                    {request.description ? <small>{request.description}</small> : null}
                  </th>
                  <td>
                    <strong>{displayText(request.projectCode)}</strong>
                    <small>{displayText(request.projectTitle)}</small>
                  </td>
                  <td>{displayText(request.supplierName)}</td>
                  <td>{displayText(request.requesterName)}</td>
                  <td>{displayText(request.requestedOn)}</td>
                  <td>{formatAmount(request.amountHt, request.currency)}</td>
                  <td>
                    <span className="purchase-status-chip">{displayText(request.status)}</span>
                  </td>
                  <td>{displayText(request.sourceLabel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
