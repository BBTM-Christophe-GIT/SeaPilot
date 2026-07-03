import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpenCheck, FileCheck2, FilePlus2, FileText, ListChecks } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildProcedureMetrics,
  createProcedure,
  fetchProceduresData,
  getProcedureStatusLabel,
  type CreateProcedureInput,
  type ProcedureRecord,
  type ProcedureStatus,
  type PublishedProcedureRecord,
} from './procedureQueries';

interface ProceduresPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface ProcedureFilterState {
  search: string;
  status: string;
  documentType: string;
}

const EMPTY_FILTERS: ProcedureFilterState = {
  search: '',
  status: '',
  documentType: '',
};

const EMPTY_PROCEDURE_FORM: CreateProcedureInput = {
  procedureCode: '',
  title: '',
  status: 'draft',
  revisionLabel: '',
  publishedOn: '',
  fileUrl: '',
  notes: '',
};

function displayText(value: string): string {
  return value || '-';
}

function canManageProcedures(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sortProcedures(records: ProcedureRecord[]): ProcedureRecord[] {
  return [...records].sort(
    (left, right) =>
      right.publishedOn.localeCompare(left.publishedOn) ||
      left.procedureCode.localeCompare(right.procedureCode, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function sortPublishedProcedures(records: PublishedProcedureRecord[]): PublishedProcedureRecord[] {
  return [...records].sort(
    (left, right) =>
      right.publishedOn.localeCompare(left.publishedOn) ||
      left.procedureCode.localeCompare(right.procedureCode, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function procedureMatchesFilters(record: ProcedureRecord, filters: ProcedureFilterState): boolean {
  if (filters.status && record.status !== filters.status) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      record.title,
      record.procedureCode,
      record.revisionLabel,
      record.status,
      record.sourceLabel,
      record.notes,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

export function ProceduresPage({ client, roles }: ProceduresPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageProcedures(effectiveRoles);
  const [procedures, setProcedures] = useState<ProcedureRecord[]>([]);
  const [publications, setPublications] = useState<PublishedProcedureRecord[]>([]);
  const [filters, setFilters] = useState<ProcedureFilterState>(EMPTY_FILTERS);
  const [procedureForm, setProcedureForm] = useState<CreateProcedureInput>(EMPTY_PROCEDURE_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchProceduresData(effectiveClient)
      .then((loadedData) => {
        if (isMounted) {
          setProcedures(sortProcedures(loadedData.procedures));
          setPublications(sortPublishedProcedures(loadedData.publications));
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger les procedures QHSE.');
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

  const filteredProcedures = useMemo(
    () =>
      filters.documentType === 'publication'
        ? []
        : procedures.filter((procedure) => procedureMatchesFilters(procedure, filters)),
    [filters, procedures],
  );
  const filteredPublications = useMemo(
    () =>
      filters.documentType === 'source'
        ? []
        : publications.filter((publication) => procedureMatchesFilters(publication, filters)),
    [filters, publications],
  );
  const metrics = useMemo(
    () => buildProcedureMetrics({ procedures: filteredProcedures, publications: filteredPublications }),
    [filteredProcedures, filteredPublications],
  );
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function updateFilterValue(key: keyof ProcedureFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateProcedureFormValue(key: keyof CreateProcedureInput, value: string) {
    setProcedureForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleCreateProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const procedure = await createProcedure(effectiveClient, procedureForm);
      setProcedures((currentProcedures) => sortProcedures([...currentProcedures, procedure]));
      setProcedureForm(EMPTY_PROCEDURE_FORM);
      setStatusMessage('Procedure ajoutee.');
    } catch {
      setErrorMessage("Impossible d'ajouter cette procedure.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des procedures QHSE...</div>;
  }

  const hasVisibleProcedures = filteredProcedures.length > 0 || filteredPublications.length > 0;

  return (
    <section className="procedures-page">
      <div className="admin-header">
        <div>
          <p className="module-family">QHSE</p>
          <h1>Procedures QHSE</h1>
        </div>
        <div className="procedures-summary-grid">
          <div className="planning-summary" aria-label="Procedures approuvees">
            <BookOpenCheck aria-hidden="true" size={18} />
            <strong>{metrics.approvedProcedures}</strong>
            <span>approuvees</span>
          </div>
          <div className="planning-summary" aria-label="Publications PDF publiees">
            <FileCheck2 aria-hidden="true" size={18} />
            <strong>{metrics.publishedProcedures}</strong>
            <span>PDF publies</span>
          </div>
          <div className="planning-summary" aria-label="Procedures en revue">
            <ListChecks aria-hidden="true" size={18} />
            <strong>{metrics.reviewProcedures}</strong>
            <span>en revue</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel procedures-filter-panel" aria-label="Filtres procedures QHSE">
        <label>
          Recherche procedures
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Code, titre, revision, source..."
            value={filters.search}
          />
        </label>
        <label>
          Filtre statut
          <select onChange={(event) => updateFilterValue('status', event.target.value)} value={filters.status}>
            <option value="">Tous les statuts</option>
            <option value="approved">Approuvee</option>
            <option value="review">En revue</option>
            <option value="draft">Brouillon</option>
            <option value="archived">Archivee</option>
            <option value="unknown">Non renseigne</option>
          </select>
        </label>
        <label>
          Type document
          <select
            onChange={(event) => updateFilterValue('documentType', event.target.value)}
            value={filters.documentType}
          >
            <option value="">Sources et PDF</option>
            <option value="source">Sources QSMS</option>
            <option value="publication">Publications PDF</option>
          </select>
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
        <form className="planning-form procedures-form" onSubmit={handleCreateProcedure}>
          <div className="planning-form-title">
            <FilePlus2 aria-hidden="true" size={18} />
            <strong>Nouvelle procedure</strong>
          </div>
          <label>
            Code procedure
            <input
              onChange={(event) => updateProcedureFormValue('procedureCode', event.target.value)}
              value={procedureForm.procedureCode}
            />
          </label>
          <label>
            Titre procedure
            <input
              onChange={(event) => updateProcedureFormValue('title', event.target.value)}
              required
              value={procedureForm.title}
            />
          </label>
          <label>
            Statut procedure
            <select
              onChange={(event) => updateProcedureFormValue('status', event.target.value as ProcedureStatus)}
              value={procedureForm.status}
            >
              <option value="draft">Brouillon</option>
              <option value="review">En revue</option>
              <option value="approved">Approuvee</option>
              <option value="archived">Archivee</option>
              <option value="unknown">Non renseigne</option>
            </select>
          </label>
          <label>
            Revision procedure
            <input
              onChange={(event) => updateProcedureFormValue('revisionLabel', event.target.value)}
              value={procedureForm.revisionLabel}
            />
          </label>
          <label>
            Publication procedure
            <input
              onChange={(event) => updateProcedureFormValue('publishedOn', event.target.value)}
              type="date"
              value={procedureForm.publishedOn}
            />
          </label>
          <label>
            URL fichier procedure
            <input
              onChange={(event) => updateProcedureFormValue('fileUrl', event.target.value)}
              type="url"
              value={procedureForm.fileUrl}
            />
          </label>
          <label>
            Notes procedure
            <input
              onChange={(event) => updateProcedureFormValue('notes', event.target.value)}
              value={procedureForm.notes}
            />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter procedure
          </button>
        </form>
      ) : null}

      {!hasVisibleProcedures ? (
        <div className="admin-state">Aucune procedure QHSE a afficher.</div>
      ) : (
        <div className="procedures-sections">
          {filteredProcedures.length > 0 ? (
            <section className="procedures-panel" aria-labelledby="procedures-source-title">
              <div className="procedures-section-heading">
                <h2 id="procedures-source-title">Referentiel QSMS</h2>
                <span>{filteredProcedures.length} source(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table procedures-table">
                  <thead>
                    <tr>
                      <th scope="col">Procedure</th>
                      <th scope="col">Code</th>
                      <th scope="col">Revision</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Publication</th>
                      <th scope="col">Source</th>
                      <th scope="col">Fichier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcedures.map((procedure) => (
                      <tr key={procedure.id}>
                        <th scope="row">
                          <span className="procedure-title">
                            <FileText aria-hidden="true" size={16} />
                            {procedure.title}
                          </span>
                          {procedure.notes ? <small>{procedure.notes}</small> : null}
                        </th>
                        <td>{displayText(procedure.procedureCode)}</td>
                        <td>{displayText(procedure.revisionLabel)}</td>
                        <td>
                          <span className={`hr-document-status procedure-status-${procedure.status}`}>
                            {getProcedureStatusLabel(procedure.status)}
                          </span>
                        </td>
                        <td>{displayText(procedure.publishedOn)}</td>
                        <td>{displayText(procedure.sourceLabel)}</td>
                        <td>
                          {procedure.fileUrl ? (
                            <a className="hr-document-link" href={procedure.fileUrl} rel="noreferrer" target="_blank">
                              {`Ouvrir le fichier ${procedure.title}`}
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
            </section>
          ) : null}

          {filteredPublications.length > 0 ? (
            <section className="procedures-panel" aria-labelledby="procedures-publications-title">
              <div className="procedures-section-heading">
                <h2 id="procedures-publications-title">Publications PDF</h2>
                <span>{filteredPublications.length} fichier(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table procedures-table">
                  <thead>
                    <tr>
                      <th scope="col">Publication</th>
                      <th scope="col">Code</th>
                      <th scope="col">Revision</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Publication</th>
                      <th scope="col">Source</th>
                      <th scope="col">Fichier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPublications.map((publication) => (
                      <tr key={publication.id}>
                        <th scope="row">
                          <span className="procedure-title">
                            <FileText aria-hidden="true" size={16} />
                            {publication.title}
                          </span>
                          {publication.notes ? <small>{publication.notes}</small> : null}
                        </th>
                        <td>{displayText(publication.procedureCode)}</td>
                        <td>{displayText(publication.revisionLabel)}</td>
                        <td>
                          <span className={`hr-document-status procedure-status-${publication.status}`}>
                            {getProcedureStatusLabel(publication.status)}
                          </span>
                        </td>
                        <td>{displayText(publication.publishedOn)}</td>
                        <td>{displayText(publication.sourceLabel)}</td>
                        <td>
                          {publication.fileUrl ? (
                            <a
                              className="hr-document-link"
                              href={publication.fileUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {`Ouvrir le fichier ${publication.title}`}
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
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
