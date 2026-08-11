import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  History,
  RefreshCw,
  Search,
  Ship,
  UploadCloud,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildFleetCertificateFileName,
  buildFleetCertificateMetrics,
  fetchFleetCertificates,
  fetchFleetCertificateVersions,
  getEffectiveFleetCertificateStatus,
  getFleetCertificateStatusLabel,
  openFleetCertificateDocument,
  planFleetCertificateRenewal,
  submitFleetCertificateRenewal,
  validateFleetCertificateRenewal,
  type FleetCertificateRecord,
  type FleetCertificateVersion,
} from './fleetCertificateQueries';

interface FleetCertificatesPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

type DeadlineFilter = 'all' | 'renew_due' | 'expired';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const VESSEL_COLORS = ['#72b7e8', '#f7b88a', '#b8bdc5', '#f9e65f', '#df8ad1', '#95dc92', '#f7aaaa'];

function canManageFleetCertificates(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function normalizeSearchValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

function sortCertificates(certificates: FleetCertificateRecord[]): FleetCertificateRecord[] {
  return [...certificates].sort((left, right) => {
    const vesselOrder = left.vesselName.localeCompare(right.vesselName, 'fr');
    if (vesselOrder) return vesselOrder;
    if (!left.expiresOn && right.expiresOn) return 1;
    if (left.expiresOn && !right.expiresOn) return -1;
    return left.expiresOn.localeCompare(right.expiresOn) || left.documentTitle.localeCompare(right.documentTitle, 'fr');
  });
}

function formatDate(value: string): string {
  if (!value) return 'Non renseignée';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatUpdatedAt(value: string): string {
  if (!value) return 'inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Taille inconnue';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function yearPosition(value: string, year: number): number {
  const date = new Date(`${value}T12:00:00Z`);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return Math.max(0, Math.min(99.3, ((date.getTime() - start) / (end - start)) * 100));
}

function matchesSearch(certificate: FleetCertificateRecord, search: string): boolean {
  if (!search.trim()) return true;
  const searchable = normalizeSearchValue([
    certificate.documentTitle,
    certificate.originalFileName,
    certificate.fileName,
    certificate.vesselName,
    certificate.categoryLabel,
    certificate.providerName,
  ].join(' '));
  return searchable.includes(normalizeSearchValue(search.trim()));
}

function metricVessels(vessels: string[]): string {
  return vessels.length ? `Navires : ${vessels.join(', ')}` : 'Aucun navire concerné';
}

interface MetricCardProps {
  count: number;
  icon: typeof AlertTriangle;
  label: string;
  tone: 'amber' | 'blue' | 'red';
  vessels: string[];
}

function MetricCard({ count, icon: Icon, label, tone, vessels }: MetricCardProps) {
  return (
    <article aria-label={label} className={`fc-metric fc-metric--${tone}`}>
      <span className="fc-metric__icon"><Icon aria-hidden="true" size={18} /></span>
      <span className="fc-metric__badge">{count}</span>
      <small>{label}</small>
      <strong>{count}</strong>
      <p>{metricVessels(vessels)}</p>
    </article>
  );
}

interface CertificateDrawerProps {
  certificate: FleetCertificateRecord;
  client: SupabaseClient;
  isManager: boolean;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}

function CertificateDrawer({ certificate, client, isManager, onClose, onChanged }: CertificateDrawerProps) {
  const [versions, setVersions] = useState<FleetCertificateVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [planForm, setPlanForm] = useState({
    plannedOn: certificate.plannedOn,
    providerName: certificate.providerName,
    visitLocation: certificate.visitLocation,
    notes: certificate.renewalNotes,
  });
  const [file, setFile] = useState<File | null>(null);
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');

  const loadVersions = useCallback(async () => {
    setIsLoadingVersions(true);
    try {
      setVersions(await fetchFleetCertificateVersions(client, certificate.id));
    } catch {
      setErrorMessage("Impossible de charger l'historique des versions.");
    } finally {
      setIsLoadingVersions(false);
    }
  }, [certificate.id, client]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const pendingVersion = versions.find((version) => version.status === 'pending_validation');
  const previewName = file
    ? buildFleetCertificateFileName(certificate, expiresOn, file.name)
    : `${certificate.vesselAcronym || 'NAV'} - ${certificate.documentTitle} - AAAA.pdf`;

  async function openDocument(document: FleetCertificateRecord | FleetCertificateVersion) {
    setErrorMessage('');
    try {
      const url = await openFleetCertificateDocument(client, document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setErrorMessage("Impossible d'ouvrir ce document.");
    }
  }

  async function handlePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    try {
      await planFleetCertificateRenewal(client, certificate.id, planForm);
      await onChanged('Renouvellement planifié.');
    } catch {
      setErrorMessage("Impossible d'enregistrer la planification.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setErrorMessage('Sélectionnez le nouveau document.');
      return;
    }
    setIsSaving(true);
    setErrorMessage('');
    try {
      await submitFleetCertificateRenewal(client, certificate, { file, issuedOn, expiresOn, notes: uploadNotes });
      await loadVersions();
      await onChanged('Document envoyé pour validation.');
      setFile(null);
      setIssuedOn('');
      setExpiresOn('');
      setUploadNotes('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'envoyer le document.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleValidate(version: FleetCertificateVersion) {
    setIsSaving(true);
    setErrorMessage('');
    try {
      await validateFleetCertificateRenewal(client, version.id);
      await loadVersions();
      await onChanged('Nouvelle version validée et activée.');
    } catch {
      setErrorMessage('Impossible de valider cette version.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fc-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside
        aria-label={`Détail du certificat ${certificate.documentTitle}`}
        aria-modal="true"
        className="fc-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="fc-drawer__header">
          <div>
            <small>{certificate.vesselName} · {certificate.categoryLabel}</small>
            <h2>{certificate.documentTitle}</h2>
          </div>
          <button aria-label="Fermer" onClick={onClose} type="button"><X size={19} /></button>
        </header>

        <div className="fc-drawer__body">
          {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
          <section className="fc-detail-card">
            <div className="fc-detail-card__title">
              <span className={`fc-status fc-status--${getEffectiveFleetCertificateStatus(certificate)}`}>
                {getFleetCertificateStatusLabel(getEffectiveFleetCertificateStatus(certificate))}
              </span>
              <button className="fc-primary-action" onClick={() => void openDocument(certificate)} type="button">
                <Download size={16} /> Ouvrir le document
              </button>
            </div>
            <dl className="fc-detail-list">
              <div><dt>Échéance</dt><dd>{formatDate(certificate.expiresOn)}</dd></div>
              <div><dt>Planification</dt><dd>{formatDate(certificate.plannedOn)}</dd></div>
              <div><dt>Prestataire</dt><dd>{certificate.providerName || 'Non renseigné'}</dd></div>
              <div><dt>Lieu</dt><dd>{certificate.visitLocation || 'Non renseigné'}</dd></div>
              <div><dt>Version active</dt><dd>v{certificate.currentVersionNo} · {formatFileSize(certificate.fileSizeBytes)}</dd></div>
              <div><dt>Source</dt><dd>{certificate.sourceLabel || 'Supabase'}</dd></div>
            </dl>
          </section>

          <section className="fc-renaming-card">
            <span><FileCheck2 aria-hidden="true" size={18} /></span>
            <div>
              <small>Référentiel de renommage</small>
              <strong>ACRONYME - TITRE DU DOCUMENT - ANNÉE.extension</strong>
              <code>{previewName}</code>
            </div>
          </section>

          {isManager ? (
            <form className="fc-workflow-form" onSubmit={handlePlan}>
              <div className="fc-section-heading">
                <CalendarClock aria-hidden="true" size={18} />
                <div><small>Étape 1</small><h3>Planifier le renouvellement</h3></div>
              </div>
              <div className="fc-form-grid">
                <label>Date prévue<input aria-label="Date prévue du renouvellement" onChange={(event) => setPlanForm((current) => ({ ...current, plannedOn: event.target.value }))} required type="date" value={planForm.plannedOn} /></label>
                <label>Prestataire<input aria-label="Prestataire du renouvellement" onChange={(event) => setPlanForm((current) => ({ ...current, providerName: event.target.value }))} value={planForm.providerName} /></label>
                <label>Lieu de la visite<input aria-label="Lieu de la visite" onChange={(event) => setPlanForm((current) => ({ ...current, visitLocation: event.target.value }))} value={planForm.visitLocation} /></label>
                <label className="is-wide">Commentaires<textarea aria-label="Commentaires de planification" onChange={(event) => setPlanForm((current) => ({ ...current, notes: event.target.value }))} rows={2} value={planForm.notes} /></label>
              </div>
              <button disabled={isSaving} type="submit">Enregistrer la planification</button>
            </form>
          ) : null}

          {isManager ? (
            <form className="fc-workflow-form" onSubmit={handleUpload}>
              <div className="fc-section-heading">
                <UploadCloud aria-hidden="true" size={18} />
                <div><small>Étape 2</small><h3>Déposer le nouveau certificat</h3></div>
              </div>
              <label className="fc-file-drop">
                <UploadCloud aria-hidden="true" size={22} />
                <span>{file?.name || 'PDF, image ou Excel · 50 Mo maximum'}</span>
                <input accept=".pdf,.png,.jpg,.jpeg,.xlsx" aria-label="Nouveau document du certificat" onChange={(event) => setFile(event.target.files?.[0] || null)} required type="file" />
              </label>
              <div className="fc-form-grid">
                <label>Date de délivrance<input aria-label="Nouvelle date de délivrance" onChange={(event) => setIssuedOn(event.target.value)} type="date" value={issuedOn} /></label>
                <label>Nouvelle échéance<input aria-label="Nouvelle date d'échéance" onChange={(event) => setExpiresOn(event.target.value)} required type="date" value={expiresOn} /></label>
                <label className="is-wide">Note de transmission<textarea aria-label="Note de transmission" onChange={(event) => setUploadNotes(event.target.value)} rows={2} value={uploadNotes} /></label>
              </div>
              <button disabled={isSaving || Boolean(pendingVersion)} type="submit">
                {pendingVersion ? 'Une version attend déjà validation' : 'Envoyer pour validation'}
              </button>
            </form>
          ) : null}

          <section className="fc-history">
            <div className="fc-section-heading">
              <History aria-hidden="true" size={18} />
              <div><small>Traçabilité</small><h3>Historique des versions</h3></div>
            </div>
            {isLoadingVersions ? <p>Chargement…</p> : versions.map((version) => (
              <article className="fc-version" key={version.id}>
                <span className={`fc-version__state fc-version__state--${version.status}`} />
                <div>
                  <strong>Version {version.versionNo} · {version.normalizedFileName}</strong>
                  <small>{formatDate(version.expiresOn)} · {formatFileSize(version.fileSizeBytes)}</small>
                </div>
                <button aria-label={`Ouvrir la version ${version.versionNo}`} onClick={() => void openDocument(version)} type="button"><Download size={16} /></button>
                {isManager && version.status === 'pending_validation' ? (
                  <button className="fc-validate-action" disabled={isSaving} onClick={() => void handleValidate(version)} type="button"><CheckCircle2 size={16} /> Valider</button>
                ) : null}
              </article>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}

export function FleetCertificatesPage({ client, roles }: FleetCertificatesPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageFleetCertificates(effectiveRoles);
  const [certificates, setCertificates] = useState<FleetCertificateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [search, setSearch] = useState('');
  const [vesselName, setVesselName] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedVessel, setExpandedVessel] = useState('GOURY');
  const [selectedCertificate, setSelectedCertificate] = useState<FleetCertificateRecord | null>(null);

  const loadCertificates = useCallback(async () => {
    const loaded = sortCertificates(await fetchFleetCertificates(effectiveClient));
    setCertificates(loaded);
    setSelectedCertificate((current) => current ? loaded.find((certificate) => certificate.id === current.id) || current : null);
  }, [effectiveClient]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    loadCertificates()
      .catch(() => { if (active) setErrorMessage('Impossible de charger les certificats flotte.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [loadCertificates]);

  const activeCertificates = useMemo(
    () => certificates.filter((certificate) => certificate.isActiveFleet),
    [certificates],
  );
  const metrics = useMemo(() => buildFleetCertificateMetrics(activeCertificates), [activeCertificates]);
  const vesselOptions = useMemo(
    () => uniqueSorted(activeCertificates.map((certificate) => certificate.vesselName)),
    [activeCertificates],
  );
  const statusFilteredCertificates = useMemo(() => activeCertificates.filter((certificate) => {
    if (vesselName && certificate.vesselName !== vesselName) return false;
    if (deadlineFilter === 'all') return true;
    return getEffectiveFleetCertificateStatus(certificate) === deadlineFilter;
  }), [activeCertificates, deadlineFilter, vesselName]);
  const searchResults = useMemo(
    () => search.trim() ? activeCertificates.filter((certificate) => matchesSearch(certificate, search)).slice(0, 12) : [],
    [activeCertificates, search],
  );
  const timelineGroups = useMemo(() => {
    const names = vesselName ? [vesselName] : uniqueSorted(statusFilteredCertificates.map((certificate) => certificate.vesselName));
    return names.map((name, index) => ({
      name,
      color: VESSEL_COLORS[index % VESSEL_COLORS.length],
      certificates: statusFilteredCertificates.filter(
        (certificate) => certificate.vesselName === name && certificate.expiresOn.startsWith(String(year)),
      ),
    }));
  }, [statusFilteredCertificates, vesselName, year]);
  const lastUpdatedAt = useMemo(
    () => certificates.map((certificate) => certificate.updatedAt).filter(Boolean).sort().at(-1) || '',
    [certificates],
  );
  const todayPosition = year === new Date().getFullYear()
    ? yearPosition(new Date().toISOString().slice(0, 10), year)
    : -1;

  async function handleChanged(message: string) {
    await loadCertificates();
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 4500);
  }

  if (isLoading) return <div className="admin-state">Chargement des certificats flotte…</div>;

  return (
    <section className="certificates-page fc-page">
      <header className="fc-hero">
        <div className="fc-hero__intro">
          <h1>Suivi des certificats</h1>
          <p>Vue centralisée des échéances, certificats et visites réglementaires.</p>
          <span><Clock3 aria-hidden="true" size={16} /> Mise à jour {formatUpdatedAt(lastUpdatedAt)}</span>
        </div>
        <div className="fc-metrics">
          <MetricCard count={metrics.renewalDue} icon={AlertTriangle} label="CERTIFICATS À 3 MOIS" tone="amber" vessels={metrics.renewalVessels} />
          <MetricCard count={metrics.unplannedVisits} icon={CalendarClock} label="VISITES NON PLANIFIÉES À 3 MOIS" tone="blue" vessels={metrics.unplannedVessels} />
          <MetricCard count={metrics.expired} icon={AlertTriangle} label="CERTIFICATS EXPIRÉS" tone="red" vessels={metrics.expiredVessels} />
        </div>
      </header>

      <div aria-live="polite" className="fc-notices">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <section className="fc-control-bar">
        <div className="fc-filter-zone">
          <div className="fc-control-heading"><small>FILTRES</small><strong>{vesselName || 'Tous les navires'}</strong><span>{statusFilteredCertificates.length} certificat(s) affichés</span></div>
          <label className="fc-vessel-select">
            <Ship aria-hidden="true" size={16} />
            <select aria-label="Filtre navire" onChange={(event) => { setVesselName(event.target.value); if (event.target.value) setExpandedVessel(event.target.value); }} value={vesselName}>
              <option value="">Tous les navires</option>
              {vesselOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div aria-label="Filtre échéance" className="fc-deadline-tabs" role="group">
            <button className={deadlineFilter === 'all' ? 'is-active' : ''} onClick={() => setDeadlineFilter('all')} type="button">Toutes échéances ({metrics.total})</button>
            <button className={deadlineFilter === 'renew_due' ? 'is-active' : ''} onClick={() => setDeadlineFilter('renew_due')} type="button">À renouveler ({metrics.renewalDue})</button>
            <button className={deadlineFilter === 'expired' ? 'is-active' : ''} onClick={() => setDeadlineFilter('expired')} type="button">Expirées ({metrics.expired})</button>
          </div>
        </div>
        <div className="fc-search-zone">
          <div className="fc-control-heading"><small>RECHERCHE DE DOCUMENT</small><strong>{search ? `${searchResults.length} résultat(s)` : 'Tous les documents'}</strong></div>
          <label className="fc-search-input"><Search aria-hidden="true" size={17} /><input aria-label="Recherche de document" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un certificat…" value={search} />{search ? <button aria-label="Effacer la recherche" onClick={() => setSearch('')} type="button"><X size={15} /></button> : null}</label>
          {search ? (
            <div className="fc-search-results">
              {searchResults.length ? searchResults.map((certificate) => (
                <button key={certificate.id} onClick={() => setSelectedCertificate(certificate)} type="button">
                  <FileText aria-hidden="true" size={16} /><span><strong>{certificate.documentTitle}</strong><small>{certificate.vesselName} · {certificate.originalFileName}</small></span><ChevronRight size={16} />
                </button>
              )) : <p>Aucun document trouvé.</p>}
            </div>
          ) : null}
        </div>
      </section>

      <section className="fc-timeline-card">
        <header className="fc-timeline-title">
          <span><ChevronDown aria-hidden="true" size={18} /></span>
          <div><small>TIMELINE</small><h2>Échéances et visites planifiées {year}</h2></div>
          <div className="fc-year-controls">
            <button aria-label="Année précédente" onClick={() => setYear((current) => current - 1)} type="button"><ChevronLeft size={17} /></button>
            <strong>{year}</strong>
            <button aria-label="Année suivante" onClick={() => setYear((current) => current + 1)} type="button"><ChevronRight size={17} /></button>
            <button aria-label="Actualiser les certificats" onClick={() => void loadCertificates()} type="button"><RefreshCw size={16} /></button>
          </div>
        </header>
        <div className="fc-months" aria-hidden="true">{MONTHS.map((month) => <span key={month}>{month}</span>)}</div>

        <div className="fc-vessels">
          {timelineGroups.map((group) => {
            const expanded = expandedVessel === group.name;
            return (
              <article className={`fc-vessel ${expanded ? 'is-expanded' : ''}`} key={group.name} style={{ '--vessel-color': group.color } as CSSProperties}>
                <button className="fc-vessel__header" onClick={() => setExpandedVessel(expanded ? '' : group.name)} type="button">
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span className="fc-vessel__dot" />
                  <strong>{group.name}</strong>
                  <small>{group.certificates.length} certificat(s)</small>
                </button>
                {expanded ? (
                  <div className="fc-vessel__tracks">
                    {todayPosition >= 0 ? <span className="fc-today-line" style={{ left: `${todayPosition}%` }} /> : null}
                    {group.certificates.length ? group.certificates.map((certificate, eventIndex) => {
                      const position = yearPosition(certificate.expiresOn, year);
                      const status = getEffectiveFleetCertificateStatus(certificate);
                      return (
                        <button
                          aria-label={`${certificate.documentTitle}, échéance ${formatDate(certificate.expiresOn)}`}
                          className={`fc-timeline-event fc-timeline-event--${status}`}
                          key={certificate.id}
                          onClick={() => setSelectedCertificate(certificate)}
                          style={{ '--event-top': `${12 + eventIndex * 34}px`, left: `${position}%` } as CSSProperties}
                          title={`${certificate.documentTitle} · ${formatDate(certificate.expiresOn)}`}
                          type="button"
                        >
                          <span>{certificate.documentTitle}</span>
                          <i />
                        </button>
                      );
                    }) : <p className="fc-empty-year">Aucune échéance pour {year}.</p>}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!timelineGroups.length ? <div className="admin-state">Aucune échéance ne correspond à ces filtres.</div> : null}
        </div>
      </section>

      {selectedCertificate ? (
        <CertificateDrawer certificate={selectedCertificate} client={effectiveClient} isManager={isManager} onChanged={handleChanged} onClose={() => setSelectedCertificate(null)} />
      ) : null}
    </section>
  );
}
