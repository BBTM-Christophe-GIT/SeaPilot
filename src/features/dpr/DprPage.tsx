import type { SupabaseClient } from '@supabase/supabase-js';
import { ClipboardList, Fuel, Gauge, Paperclip, Radio, ShieldAlert, Ship, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { fetchProjectCatalogOptions, type ProjectCatalogOption } from '../projects/projectMutations';
import {
  buildDprMetrics,
  createDprItem,
  fetchDprData,
  type CreateDprItemInput,
  type DprArchiveRecord,
  type DprItemRecord,
  type MgoPriceRecord,
} from './dprQueries';

interface DprPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface DprFilterState {
  search: string;
  projectCode: string;
  vesselName: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: DprFilterState = {
  search: '',
  projectCode: '',
  vesselName: '',
  dateFrom: '',
  dateTo: '',
};

const EMPTY_DPR_FORM: CreateDprItemInput = {
  title: '',
  projectId: null,
  projectCode: '',
  projectTitle: '',
  vesselName: '',
  reportDate: '',
  reportTime: '',
  description: '',
  fuelConsumptionL: '',
  mgoRefuelingM3: '',
  qhseNote: '',
  radioContact: false,
};

function displayText(value: string): string {
  return value || '-';
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits });
}

function formatPrice(price: MgoPriceRecord | undefined): string {
  if (!price) {
    return '-';
  }

  return `${formatNumber(price.priceHt, 2)} ${price.currency || 'EUR'}`;
}

function canManageDpr(roles: RoleKey[]): boolean {
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

function sortDprReports(reports: DprItemRecord[]): DprItemRecord[] {
  return [...reports].sort(
    (left, right) =>
      right.reportDate.localeCompare(left.reportDate) ||
      right.reportTime.localeCompare(left.reportTime) ||
      left.projectCode.localeCompare(right.projectCode, 'fr'),
  );
}

function sortDprArchives(archives: DprArchiveRecord[]): DprArchiveRecord[] {
  return [...archives].sort(
    (left, right) =>
      right.reportDate.localeCompare(left.reportDate) ||
      left.projectCode.localeCompare(right.projectCode, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function reportMatchesFilters(report: DprItemRecord, filters: DprFilterState): boolean {
  if (filters.projectCode && report.projectCode !== filters.projectCode) {
    return false;
  }

  if (filters.vesselName && report.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.dateFrom && report.reportDate && report.reportDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && report.reportDate && report.reportDate > filters.dateTo) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      report.title,
      report.projectCode,
      report.projectTitle,
      report.vesselName,
      report.description,
      report.qhseNote,
      report.sourceLabel,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function archiveMatchesReports(archive: DprArchiveRecord, reports: DprItemRecord[], filters: DprFilterState): boolean {
  if (filters.projectCode && archive.projectCode !== filters.projectCode) {
    return false;
  }

  if (filters.dateFrom && archive.reportDate && archive.reportDate < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && archive.reportDate && archive.reportDate > filters.dateTo) {
    return false;
  }

  if (!filters.vesselName && !filters.search) {
    return true;
  }

  const relatedReport = reports.find(
    (report) =>
      (archive.dprItemId && report.id === archive.dprItemId) ||
      (archive.dprSharePointItemId && report.id.toString() === archive.dprSharePointItemId) ||
      (archive.reportDate && archive.projectCode && report.reportDate === archive.reportDate && report.projectCode === archive.projectCode),
  );

  if (filters.vesselName && relatedReport?.vesselName !== filters.vesselName) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      archive.title,
      archive.projectCode,
      archive.projectTitle,
      archive.notes,
      archive.sourceLabel,
      relatedReport?.vesselName,
      relatedReport?.description,
      relatedReport?.qhseNote,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function getReportQhseEventCount(report: DprItemRecord): number {
  return report.environmentIncidentCount + report.personAccidentCount + report.dangerousSituationCount;
}

export function DprPage({ client, roles }: DprPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageDpr(effectiveRoles);
  const [reports, setReports] = useState<DprItemRecord[]>([]);
  const [archives, setArchives] = useState<DprArchiveRecord[]>([]);
  const [mgoPrices, setMgoPrices] = useState<MgoPriceRecord[]>([]);
  const [catalogProjects, setCatalogProjects] = useState<ProjectCatalogOption[]>([]);
  const [filters, setFilters] = useState<DprFilterState>(EMPTY_FILTERS);
  const [dprForm, setDprForm] = useState<CreateDprItemInput>(EMPTY_DPR_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    Promise.all([
      fetchDprData(effectiveClient),
      isManager ? fetchProjectCatalogOptions(effectiveClient).catch(() => []) : Promise.resolve([]),
    ])
      .then(([loadedData, loadedProjects]) => {
        if (isMounted) {
          setReports(sortDprReports(loadedData.reports));
          setArchives(sortDprArchives(loadedData.archives));
          setMgoPrices(loadedData.mgoPrices);
          setCatalogProjects(loadedProjects);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger les DPR.');
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

  const projectOptions = useMemo(
    () => uniqueSorted([...reports.map((report) => report.projectCode), ...catalogProjects.map((project) => project.projectCode)]),
    [catalogProjects, reports],
  );
  const vesselOptions = useMemo(() => uniqueSorted(reports.map((report) => report.vesselName)), [reports]);
  const filteredReports = useMemo(
    () => reports.filter((report) => reportMatchesFilters(report, filters)),
    [filters, reports],
  );
  const filteredArchives = useMemo(
    () => archives.filter((archive) => archiveMatchesReports(archive, reports, filters)),
    [archives, filters, reports],
  );
  const metrics = useMemo(() => buildDprMetrics(filteredReports, filteredArchives), [filteredArchives, filteredReports]);
  const latestMgoPrice = mgoPrices[0];
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const hasVisibleData = filteredReports.length > 0 || filteredArchives.length > 0 || mgoPrices.length > 0;

  function updateFilterValue(key: keyof DprFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateDprFormValue(key: keyof CreateDprItemInput, value: string | boolean | number | null) {
    setDprForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function selectCatalogProject(projectId: string) {
    const project = catalogProjects.find((option) => option.id === Number(projectId));
    setDprForm((currentForm) => ({
      ...currentForm,
      projectId: project?.id ?? null,
      projectCode: project?.projectCode || '',
      projectTitle: project?.title || '',
    }));
  }

  async function handleCreateDpr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const report = await createDprItem(effectiveClient, dprForm);
      setReports((currentReports) => sortDprReports([...currentReports, report]));
      setDprForm(EMPTY_DPR_FORM);
      setStatusMessage('Rapport DPR ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce rapport DPR.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des DPR...</div>;
  }

  return (
    <section className="dpr-page">
      <div className="admin-header">
        <div>
          <p className="module-family">Operations</p>
          <h1>Daily Progress Report</h1>
        </div>
        <div className="dpr-summary-grid">
          <div className="planning-summary" aria-label="Rapports DPR">
            <ClipboardList aria-hidden="true" size={18} />
            <strong>{metrics.reportCount}</strong>
            <span>rapports</span>
          </div>
          <div className="planning-summary" aria-label="Archives DPR importees">
            <Paperclip aria-hidden="true" size={18} />
            <strong>{metrics.archiveCount}</strong>
            <span>archives</span>
          </div>
          <div className="planning-summary" aria-label="Consommation carburant DPR">
            <Fuel aria-hidden="true" size={18} />
            <strong>{formatNumber(metrics.fuelConsumptionL)}</strong>
            <span>L conso.</span>
          </div>
          <div className="planning-summary" aria-label="Evenements QHSE DPR">
            <ShieldAlert aria-hidden="true" size={18} />
            <strong>{formatNumber(metrics.qhseEventCount, 0)}</strong>
            <span>QHSE</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel dpr-filter-panel" aria-label="Filtres DPR">
        <label>
          Recherche DPR
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Projet, navire, description..."
            value={filters.search}
          />
        </label>
        <label>
          Filtre projet DPR
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
          Filtre navire DPR
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
          DPR depuis
          <input onChange={(event) => updateFilterValue('dateFrom', event.target.value)} type="date" value={filters.dateFrom} />
        </label>
        <label>
          DPR jusqu'au
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
        <form className="planning-form dpr-form" onSubmit={handleCreateDpr}>
          <div className="planning-form-title">
            <Upload aria-hidden="true" size={18} />
            <strong>Nouveau rapport DPR</strong>
          </div>
          <label>
            Titre DPR
            <input onChange={(event) => updateDprFormValue('title', event.target.value)} value={dprForm.title} />
          </label>
          <label>
            Projet du catalogue DPR
            <select onChange={(event) => selectCatalogProject(event.target.value)} value={dprForm.projectId ?? ''}>
              <option value="">Aucun projet</option>
              {catalogProjects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} - {project.title}</option>)}
            </select>
          </label>
          <label>
            Nom navire DPR
            <input onChange={(event) => updateDprFormValue('vesselName', event.target.value)} value={dprForm.vesselName} />
          </label>
          <label>
            Date DPR
            <input onChange={(event) => updateDprFormValue('reportDate', event.target.value)} type="date" value={dprForm.reportDate} />
          </label>
          <label>
            Heure DPR
            <input onChange={(event) => updateDprFormValue('reportTime', event.target.value)} type="time" value={dprForm.reportTime} />
          </label>
          <label>
            Conso carburant L
            <input
              inputMode="decimal"
              onChange={(event) => updateDprFormValue('fuelConsumptionL', event.target.value)}
              value={dprForm.fuelConsumptionL}
            />
          </label>
          <label>
            Avitaillement MGO m3
            <input
              inputMode="decimal"
              onChange={(event) => updateDprFormValue('mgoRefuelingM3', event.target.value)}
              value={dprForm.mgoRefuelingM3}
            />
          </label>
          <label>
            Description DPR
            <input
              onChange={(event) => updateDprFormValue('description', event.target.value)}
              value={dprForm.description}
            />
          </label>
          <label>
            Note QHSE DPR
            <input onChange={(event) => updateDprFormValue('qhseNote', event.target.value)} value={dprForm.qhseNote} />
          </label>
          <label className="dpr-radio-toggle">
            <input
              checked={dprForm.radioContact}
              onChange={(event) => updateDprFormValue('radioContact', event.target.checked)}
              type="checkbox"
            />
            Contact radio
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter DPR
          </button>
        </form>
      ) : null}

      {!hasVisibleData ? (
        <div className="admin-state">Aucun DPR a afficher.</div>
      ) : (
        <div className="dpr-sections">
          {filteredReports.length > 0 ? (
            <section className="dpr-panel" aria-labelledby="dpr-reports-title">
              <div className="procedures-section-heading">
                <h2 id="dpr-reports-title">Rapports journaliers</h2>
                <span>{filteredReports.length} rapport(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table dpr-table">
                  <thead>
                    <tr>
                      <th scope="col">DPR</th>
                      <th scope="col">Projet</th>
                      <th scope="col">Navire</th>
                      <th scope="col">Date</th>
                      <th scope="col">Carburant</th>
                      <th scope="col">MGO</th>
                      <th scope="col">QHSE</th>
                      <th scope="col">Radio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((report) => (
                      <tr key={report.id}>
                        <th scope="row">
                          <span className="dpr-title">
                            <ClipboardList aria-hidden="true" size={16} />
                            {report.title || `DPR ${report.reportDate}`}
                          </span>
                          {report.description ? <small>{report.description}</small> : null}
                        </th>
                        <td>
                          <strong>{displayText(report.projectCode)}</strong>
                          <small>{displayText(report.projectTitle)}</small>
                        </td>
                        <td>
                          <span className="dpr-inline-icon">
                            <Ship aria-hidden="true" size={15} />
                            {displayText(report.vesselName)}
                          </span>
                        </td>
                        <td>
                          {displayText(report.reportDate)}
                          {report.reportTime ? <small>{report.reportTime}</small> : null}
                        </td>
                        <td>{formatNumber(report.fuelConsumptionL)} L</td>
                        <td>{formatNumber(report.mgoRefuelingM3)} m3</td>
                        <td>
                          <span className={getReportQhseEventCount(report) > 0 ? 'dpr-qhse-warning' : 'dpr-qhse-clear'}>
                            {formatNumber(getReportQhseEventCount(report), 0)}
                          </span>
                          {report.qhseNote ? <small>{report.qhseNote}</small> : null}
                        </td>
                        <td>
                          <span className={report.radioContact ? 'dpr-radio-ok' : 'dpr-radio-off'}>
                            <Radio aria-hidden="true" size={15} />
                            {report.radioContact ? 'Oui' : 'Non'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {filteredArchives.length > 0 ? (
            <section className="dpr-panel" aria-labelledby="dpr-archives-title">
              <div className="procedures-section-heading">
                <h2 id="dpr-archives-title">Archives DPR</h2>
                <span>{filteredArchives.length} fichier(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table dpr-table">
                  <thead>
                    <tr>
                      <th scope="col">Archive</th>
                      <th scope="col">Projet</th>
                      <th scope="col">Date</th>
                      <th scope="col">Source</th>
                      <th scope="col">Fichier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchives.map((archive) => (
                      <tr key={archive.id}>
                        <th scope="row">
                          <span className="dpr-title">
                            <Paperclip aria-hidden="true" size={16} />
                            {archive.title}
                          </span>
                          {archive.notes ? <small>{archive.notes}</small> : null}
                        </th>
                        <td>
                          <strong>{displayText(archive.projectCode)}</strong>
                          <small>{displayText(archive.projectTitle)}</small>
                        </td>
                        <td>{displayText(archive.reportDate)}</td>
                        <td>{displayText(archive.sourceLabel)}</td>
                        <td>
                          {archive.fileUrl ? (
                            <a className="hr-document-link" href={archive.fileUrl} rel="noreferrer" target="_blank">
                              {`Ouvrir le fichier ${archive.title}`}
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

          {mgoPrices.length > 0 ? (
            <section className="dpr-panel" aria-labelledby="dpr-mgo-title">
              <div className="procedures-section-heading">
                <h2 id="dpr-mgo-title">Prix MGO</h2>
                <span>{mgoPrices.length} prix</span>
              </div>
              <div className="dpr-mgo-strip">
                <Gauge aria-hidden="true" size={18} />
                <strong>{latestMgoPrice?.title || 'Dernier prix MGO'}</strong>
                <span>{formatPrice(latestMgoPrice)}</span>
                <small>
                  {displayText(latestMgoPrice?.priceDate || '')}
                  {latestMgoPrice?.supplierName ? ` - ${latestMgoPrice.supplierName}` : ''}
                </small>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
