import type { SupabaseClient } from '@supabase/supabase-js';
import { FilePlus2, FileText, Ship, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildFleetCertificateMetrics,
  createFleetCertificate,
  fetchFleetCertificates,
  getFleetCertificateCategoryLabel,
  getFleetCertificateStatusLabel,
  type CreateFleetCertificateInput,
  type FleetCertificateRecord,
  type FleetCertificateStatus,
} from './fleetCertificateQueries';

interface FleetCertificatesPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface FleetCertificateFilterState {
  search: string;
  vesselName: string;
  status: string;
}

const EMPTY_FILTERS: FleetCertificateFilterState = {
  search: '',
  vesselName: '',
  status: '',
};

const EMPTY_CERTIFICATE_FORM: CreateFleetCertificateInput = {
  vesselName: '',
  categoryKey: 'certificate',
  title: '',
  status: 'valid',
  issuedOn: '',
  expiresOn: '',
  fileUrl: '',
  notes: '',
};

function displayText(value: string): string {
  return value || '-';
}

function canManageFleetCertificates(roles: RoleKey[]): boolean {
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

function sortFleetCertificates(certificates: FleetCertificateRecord[]): FleetCertificateRecord[] {
  return [...certificates].sort(
    (left, right) =>
      left.expiresOn.localeCompare(right.expiresOn) ||
      left.vesselName.localeCompare(right.vesselName, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function certificateMatchesFilters(
  certificate: FleetCertificateRecord,
  filters: FleetCertificateFilterState,
): boolean {
  if (filters.vesselName && certificate.vesselName !== filters.vesselName) {
    return false;
  }

  if (filters.status && certificate.status !== filters.status) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      certificate.title,
      certificate.vesselName,
      certificate.categoryKey,
      certificate.sourceLabel,
      certificate.notes,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

export function FleetCertificatesPage({ client, roles }: FleetCertificatesPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageFleetCertificates(effectiveRoles);
  const [certificates, setCertificates] = useState<FleetCertificateRecord[]>([]);
  const [filters, setFilters] = useState<FleetCertificateFilterState>(EMPTY_FILTERS);
  const [certificateForm, setCertificateForm] = useState<CreateFleetCertificateInput>(EMPTY_CERTIFICATE_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchFleetCertificates(effectiveClient)
      .then((loadedCertificates) => {
        if (isMounted) {
          setCertificates(sortFleetCertificates(loadedCertificates));
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger les certificats flotte.');
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

  const vesselFilterOptions = useMemo(
    () => uniqueSorted(certificates.map((certificate) => certificate.vesselName)),
    [certificates],
  );
  const filteredCertificates = useMemo(
    () => certificates.filter((certificate) => certificateMatchesFilters(certificate, filters)),
    [certificates, filters],
  );
  const metrics = useMemo(() => buildFleetCertificateMetrics(filteredCertificates), [filteredCertificates]);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function updateFilterValue(key: keyof FleetCertificateFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateCertificateFormValue(key: keyof CreateFleetCertificateInput, value: string) {
    setCertificateForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleCreateCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const certificate = await createFleetCertificate(effectiveClient, certificateForm);
      setCertificates((currentCertificates) => sortFleetCertificates([...currentCertificates, certificate]));
      setCertificateForm(EMPTY_CERTIFICATE_FORM);
      setStatusMessage('Certificat ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce certificat.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des certificats flotte...</div>;
  }

  return (
    <section className="certificates-page">
      <div className="admin-header">
        <div>
          <p className="module-family">QHSE</p>
          <h1>Certificats flotte</h1>
        </div>
        <div className="certificates-summary-grid">
          <div className="planning-summary" aria-label="Certificats valides">
            <Ship aria-hidden="true" size={18} />
            <strong>{metrics.valid}</strong>
            <span>valides</span>
          </div>
          <div className="planning-summary" aria-label="Certificats a renouveler">
            <TriangleAlert aria-hidden="true" size={18} />
            <strong>{metrics.renewalDue}</strong>
            <span>a renouveler</span>
          </div>
          <div className="planning-summary" aria-label="Certificats expires">
            <TriangleAlert aria-hidden="true" size={18} />
            <strong>{metrics.expired}</strong>
            <span>expires</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel certificates-filter-panel" aria-label="Filtres certificats flotte">
        <label>
          Recherche certificats
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Certificat, navire, source..."
            value={filters.search}
          />
        </label>
        <label>
          Filtre navire
          <select onChange={(event) => updateFilterValue('vesselName', event.target.value)} value={filters.vesselName}>
            <option value="">Tous les navires</option>
            {vesselFilterOptions.map((vesselName) => (
              <option key={vesselName} value={vesselName}>
                {vesselName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre statut
          <select onChange={(event) => updateFilterValue('status', event.target.value)} value={filters.status}>
            <option value="">Tous les statuts</option>
            <option value="valid">Valide</option>
            <option value="renew_due">A renouveler</option>
            <option value="expired">Expire</option>
            <option value="missing">Manquant</option>
            <option value="pending_validation">Validation</option>
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
        <form className="planning-form certificates-form" onSubmit={handleCreateCertificate}>
          <div className="planning-form-title">
            <FilePlus2 aria-hidden="true" size={18} />
            <strong>Nouveau certificat</strong>
          </div>
          <label>
            Titre certificat
            <input
              onChange={(event) => updateCertificateFormValue('title', event.target.value)}
              required
              value={certificateForm.title}
            />
          </label>
          <label>
            Navire certificat
            <input
              onChange={(event) => updateCertificateFormValue('vesselName', event.target.value)}
              value={certificateForm.vesselName}
            />
          </label>
          <label>
            Categorie certificat
            <input
              onChange={(event) => updateCertificateFormValue('categoryKey', event.target.value)}
              value={certificateForm.categoryKey}
            />
          </label>
          <label>
            Statut certificat
            <select
              onChange={(event) =>
                updateCertificateFormValue('status', event.target.value as FleetCertificateStatus)
              }
              value={certificateForm.status}
            >
              <option value="valid">Valide</option>
              <option value="renew_due">A renouveler</option>
              <option value="expired">Expire</option>
              <option value="missing">Manquant</option>
              <option value="pending_validation">Validation</option>
            </select>
          </label>
          <label>
            Delivrance certificat
            <input
              onChange={(event) => updateCertificateFormValue('issuedOn', event.target.value)}
              type="date"
              value={certificateForm.issuedOn}
            />
          </label>
          <label>
            Echeance certificat
            <input
              onChange={(event) => updateCertificateFormValue('expiresOn', event.target.value)}
              type="date"
              value={certificateForm.expiresOn}
            />
          </label>
          <label>
            URL fichier certificat
            <input
              onChange={(event) => updateCertificateFormValue('fileUrl', event.target.value)}
              type="url"
              value={certificateForm.fileUrl}
            />
          </label>
          <label>
            Notes certificat
            <input
              onChange={(event) => updateCertificateFormValue('notes', event.target.value)}
              value={certificateForm.notes}
            />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter certificat
          </button>
        </form>
      ) : null}

      {filteredCertificates.length === 0 ? (
        <div className="admin-state">Aucun certificat flotte a afficher.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table certificates-table">
            <thead>
              <tr>
                <th scope="col">Certificat</th>
                <th scope="col">Navire</th>
                <th scope="col">Categorie</th>
                <th scope="col">Statut</th>
                <th scope="col">Delivrance</th>
                <th scope="col">Echeance</th>
                <th scope="col">Source</th>
                <th scope="col">Fichier</th>
              </tr>
            </thead>
            <tbody>
              {filteredCertificates.map((certificate) => (
                <tr key={certificate.id}>
                  <th scope="row">
                    <span className="certificate-title">
                      <FileText aria-hidden="true" size={16} />
                      {certificate.title}
                    </span>
                    {certificate.notes ? <small>{certificate.notes}</small> : null}
                  </th>
                  <td>{certificate.vesselName}</td>
                  <td>{getFleetCertificateCategoryLabel(certificate.categoryKey)}</td>
                  <td>
                    <span className={`hr-document-status hr-document-${certificate.status}`}>
                      {getFleetCertificateStatusLabel(certificate.status)}
                    </span>
                  </td>
                  <td>{displayText(certificate.issuedOn)}</td>
                  <td>{displayText(certificate.expiresOn)}</td>
                  <td>{displayText(certificate.sourceLabel)}</td>
                  <td>
                    {certificate.fileUrl ? (
                      <a
                        className="hr-document-link"
                        href={certificate.fileUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {`Ouvrir le fichier ${certificate.title}`}
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
