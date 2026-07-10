import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckSquare, FileText, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildQhseDocumentMetrics,
  createQhseDocument,
  fetchQhseDocuments,
  QHSE_DOCUMENT_LIBRARIES,
  type CreateQhseDocumentInput,
  type QhseDocumentRecord,
  type QhseDocumentTable,
} from './qhseDocumentQueries';

interface QhseDocumentsPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface QhseDocumentFilterState {
  search: string;
  libraryKey: string;
  categoryKey: string;
  vesselName: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: QhseDocumentFilterState = {
  categoryKey: '',
  dateFrom: '',
  dateTo: '',
  libraryKey: '',
  search: '',
  status: '',
  vesselName: '',
};

const EMPTY_FORM: CreateQhseDocumentInput = {
  categoryKey: '',
  documentDate: '',
  expiresOn: '',
  libraryKey: 'work_permits',
  notes: '',
  personName: '',
  revisionLabel: '',
  status: 'Ouvert',
  title: '',
  vesselName: '',
};

const DOCUMENT_STATUS_OPTIONS = ['Ouvert', 'Publie', 'Valide', 'A verifier', 'Clos', 'Annule'];

function canManageQhseDocuments(roles: RoleKey[]): boolean {
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

function documentDateForFilter(document: QhseDocumentRecord): string {
  return document.documentDate || document.expiresOn;
}

function sortDocuments(documents: QhseDocumentRecord[]): QhseDocumentRecord[] {
  return [...documents].sort(
    (left, right) =>
      documentDateForFilter(right).localeCompare(documentDateForFilter(left)) ||
      left.libraryLabel.localeCompare(right.libraryLabel, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function documentMatchesFilters(document: QhseDocumentRecord, filters: QhseDocumentFilterState): boolean {
  if (filters.libraryKey && document.tableKey !== filters.libraryKey) {
    return false;
  }

  if (filters.categoryKey && document.categoryKey !== filters.categoryKey) {
    return false;
  }

  if (filters.vesselName && document.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.status && document.status !== filters.status) {
    return false;
  }

  const documentDate = documentDateForFilter(document);

  if (filters.dateFrom && documentDate && documentDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && documentDate && documentDate > filters.dateTo) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      document.title,
      document.libraryLabel,
      document.categoryKey,
      document.status,
      document.vesselName,
      document.personName,
      document.revisionLabel,
      document.notes,
      document.sourceLabel,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function selectedLibraryLabel(libraryKey: QhseDocumentTable): string {
  return QHSE_DOCUMENT_LIBRARIES.find((library) => library.key === libraryKey)?.label || 'Bibliotheque';
}

export function QhseDocumentsPage({ client, roles }: QhseDocumentsPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageQhseDocuments(effectiveRoles);
  const [documents, setDocuments] = useState<QhseDocumentRecord[]>([]);
  const [filters, setFilters] = useState<QhseDocumentFilterState>(EMPTY_FILTERS);
  const [documentForm, setDocumentForm] = useState<CreateQhseDocumentInput>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchQhseDocuments(effectiveClient)
      .then((loadedDocuments) => {
        if (isMounted) {
          setDocuments(sortDocuments(loadedDocuments));
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger les documents QHSE.');
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

  const filteredDocuments = useMemo(
    () => documents.filter((document) => documentMatchesFilters(document, filters)),
    [documents, filters],
  );
  const metrics = useMemo(() => buildQhseDocumentMetrics(filteredDocuments), [filteredDocuments]);
  const categoryOptions = useMemo(() => uniqueSorted(documents.map((document) => document.categoryKey)), [documents]);
  const vesselOptions = useMemo(() => uniqueSorted(documents.map((document) => document.vesselName)), [documents]);
  const statusOptions = useMemo(
    () => uniqueSorted([...documents.map((document) => document.status), ...DOCUMENT_STATUS_OPTIONS]),
    [documents],
  );
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function updateFilterValue(key: keyof QhseDocumentFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateFormValue(key: keyof CreateQhseDocumentInput, value: string) {
    setDocumentForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleCreateDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const document = await createQhseDocument(effectiveClient, documentForm);
      setDocuments((currentDocuments) => sortDocuments([...currentDocuments, document]));
      setDocumentForm(EMPTY_FORM);
      setStatusMessage('Document ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce document.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des documents QHSE...</div>;
  }

  return (
    <section className="qhse-page">
      <div className="admin-header">
        <div>
          <p className="module-family">QHSE</p>
          <h1>QHSE documentaire</h1>
        </div>
        <div className="qhse-summary-grid">
          <div className="planning-summary" aria-label="Documents QHSE">
            <FileText aria-hidden="true" size={18} />
            <strong>{metrics.documentCount}</strong>
            <span>documents</span>
          </div>
          <div className="planning-summary" aria-label="Permis ouverts">
            <CheckSquare aria-hidden="true" size={18} />
            <strong>{metrics.openPermitCount}</strong>
            <span>permis</span>
          </div>
          <div className="planning-summary" aria-label="Alertes securite">
            <AlertTriangle aria-hidden="true" size={18} />
            <strong>{metrics.safetyAlertCount}</strong>
            <span>alertes</span>
          </div>
          <div className="planning-summary" aria-label="Echeances documentaires">
            <AlertTriangle aria-hidden="true" size={18} />
            <strong>{metrics.dueDocumentCount}</strong>
            <span>echeances</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel qhse-filter-panel" aria-label="Filtres documentaires QHSE">
        <label>
          Recherche documentaire
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Document, navire, categorie..."
            value={filters.search}
          />
        </label>
        <label>
          Filtre bibliotheque QHSE
          <select onChange={(event) => updateFilterValue('libraryKey', event.target.value)} value={filters.libraryKey}>
            <option value="">Toutes les bibliotheques</option>
            {QHSE_DOCUMENT_LIBRARIES.map((library) => (
              <option key={library.key} value={library.key}>
                {library.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre categorie QHSE
          <select onChange={(event) => updateFilterValue('categoryKey', event.target.value)} value={filters.categoryKey}>
            <option value="">Toutes les categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre navire QHSE
          <select onChange={(event) => updateFilterValue('vesselName', event.target.value)} value={filters.vesselName}>
            <option value="">Tous les navires</option>
            {vesselOptions.map((vessel) => (
              <option key={vessel} value={vessel}>
                {vessel}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre statut QHSE
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
          Document depuis
          <input onChange={(event) => updateFilterValue('dateFrom', event.target.value)} type="date" value={filters.dateFrom} />
        </label>
        <label>
          Document jusqu'au
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
        <form className="planning-form qhse-form" onSubmit={handleCreateDocument}>
          <div className="planning-form-title">
            <Upload aria-hidden="true" size={18} />
            <strong>Nouveau document</strong>
          </div>
          <label>
            Bibliotheque documentaire
            <select
              onChange={(event) => updateFormValue('libraryKey', event.target.value as QhseDocumentTable)}
              value={documentForm.libraryKey}
            >
              {QHSE_DOCUMENT_LIBRARIES.map((library) => (
                <option key={library.key} value={library.key}>
                  {library.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Titre document QHSE
            <input onChange={(event) => updateFormValue('title', event.target.value)} required value={documentForm.title} />
          </label>
          <label>
            Categorie document
            <input onChange={(event) => updateFormValue('categoryKey', event.target.value)} value={documentForm.categoryKey} />
          </label>
          <label>
            Navire document
            <input onChange={(event) => updateFormValue('vesselName', event.target.value)} value={documentForm.vesselName} />
          </label>
          <label>
            Collaborateur document
            <input onChange={(event) => updateFormValue('personName', event.target.value)} value={documentForm.personName} />
          </label>
          <label>
            Date document
            <input
              onChange={(event) => updateFormValue('documentDate', event.target.value)}
              type="date"
              value={documentForm.documentDate}
            />
          </label>
          <label>
            Echeance document
            <input
              onChange={(event) => updateFormValue('expiresOn', event.target.value)}
              type="date"
              value={documentForm.expiresOn}
            />
          </label>
          <label>
            Revision document
            <input onChange={(event) => updateFormValue('revisionLabel', event.target.value)} value={documentForm.revisionLabel} />
          </label>
          <label>
            Statut document
            <input onChange={(event) => updateFormValue('status', event.target.value)} value={documentForm.status} />
          </label>
          <label>
            Notes document
            <input onChange={(event) => updateFormValue('notes', event.target.value)} value={documentForm.notes} />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter document
          </button>
        </form>
      ) : null}

      {filteredDocuments.length === 0 ? (
        <div className="admin-state">Aucun document QHSE a afficher.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table qhse-table">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Bibliotheque</th>
                <th scope="col">Categorie</th>
                <th scope="col">Navire</th>
                <th scope="col">Date</th>
                <th scope="col">Statut</th>
                <th scope="col">Source</th>
                <th scope="col">Fichier</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((document) => (
                <tr key={`${document.tableKey}-${document.id}`}>
                  <th scope="row">
                    <span className="action-title">
                      <FileText aria-hidden="true" size={16} />
                      {document.title}
                    </span>
                    {document.notes ? <small>{document.notes}</small> : null}
                  </th>
                  <td>{selectedLibraryLabel(document.tableKey)}</td>
                  <td>{displayText(document.categoryKey)}</td>
                  <td>
                    {displayText(document.vesselName)}
                    {document.personName ? <small>{document.personName}</small> : null}
                  </td>
                  <td>
                    {displayText(document.documentDate)}
                    {document.expiresOn ? <small>{`Echeance ${document.expiresOn}`}</small> : null}
                  </td>
                  <td>
                    <span className="action-status-chip">{displayText(document.status)}</span>
                  </td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
