import type { SupabaseClient } from '@supabase/supabase-js';
import { Activity, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RoleKey } from '../permissions/roles';
import { workingTimeErrorMessage } from './workingTimeQueries';

interface Props {
  client: SupabaseClient;
  roles: RoleKey[];
  range: { start: string; end: string };
}

interface Option { id: number; label: string }
interface Method { id: number; name: string; version_label: string; sedentary_day_hours: number | null; offshore_actual_hour_factor: number | null }

const KPI_KEYS = ['LTI', 'LTIFR', 'TRIR', 'FAR', 'FAC', 'FAC_rate', 'MTC_rate', 'RWC_rate', 'SOFR', 'french_frequency_rate', 'french_severity_rate'] as const;
const KPI_LABELS: Record<(typeof KPI_KEYS)[number], string> = {
  LTI: 'LTI', LTIFR: 'LTIFR', TRIR: 'TRIR', FAR: 'FAR', FAC: 'FAC', FAC_rate: 'Taux FAC',
  MTC_rate: 'Taux MTC', RWC_rate: 'Taux RWC', SOFR: 'SOFR', french_frequency_rate: 'Fréquence FR', french_severity_rate: 'Gravité FR',
};

export function WorkingTimeHseKpiPanel({ client, roles, range }: Props) {
  const [methods, setMethods] = useState<Method[]>([]);
  const [methodId, setMethodId] = useState('');
  const [vessels, setVessels] = useState<Option[]>([]);
  const [people, setPeople] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [filters, setFilters] = useState({ vesselId: '', watch: '', personId: '', functionLabel: '', clientId: '', projectId: '', area: '', population: '' });
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRefresh = roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      client.from('hse_exposure_methodologies').select('id,name,version_label,sedentary_day_hours,offshore_actual_hour_factor').order('effective_from', { ascending: false }),
      client.from('vessels').select('id,name').eq('active', true).order('name'),
      client.from('people').select('id,first_name,last_name').eq('active', true).order('last_name'),
      client.from('clients').select('id,name').is('archived_at', null).order('name'),
      client.from('projects').select('id,title').is('archived_at', null).order('title'),
    ]).then(([methodResult, vesselResult, peopleResult, clientResult, projectResult]) => {
      const firstError = [methodResult, vesselResult, peopleResult, clientResult, projectResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      if (cancelled) return;
      const nextMethods = (methodResult.data || []) as Method[];
      setMethods(nextMethods);
      setMethodId((current) => current || String(nextMethods[0]?.id || ''));
      setVessels(((vesselResult.data || []) as Array<{ id: number; name: string }>).map((item) => ({ id: item.id, label: item.name })));
      setPeople(((peopleResult.data || []) as Array<{ id: number; first_name: string; last_name: string }>).map((item) => ({ id: item.id, label: `${item.first_name} ${item.last_name}`.trim() })));
      setClients(((clientResult.data || []) as Array<{ id: number; name: string }>).map((item) => ({ id: item.id, label: item.name })));
      setProjects(((projectResult.data || []) as Array<{ id: number; title: string }>).map((item) => ({ id: item.id, label: item.title })));
    }).catch((reason) => { if (!cancelled) setError(workingTimeErrorMessage(reason)); });
    return () => { cancelled = true; };
  }, [client]);

  async function loadSummary(refreshExposure = false) {
    if (!methodId) return;
    setIsBusy(true);
    setError(null);
    try {
      if (refreshExposure) {
        const { error: refreshError } = await client.rpc('refresh_hse_exposure_hours', { p_starts_on: range.start, p_ends_on: range.end, p_methodology_id: Number(methodId) });
        if (refreshError) throw refreshError;
      }
      const { data, error: rpcError } = await client.rpc('hse_kpi_summary', {
        p_starts_on: range.start, p_ends_on: range.end, p_methodology_id: Number(methodId),
        p_vessel_id: filters.vesselId ? Number(filters.vesselId) : null, p_watch_group: filters.watch || null,
        p_person_id: filters.personId ? Number(filters.personId) : null, p_function_label: filters.functionLabel || null,
        p_client_id: filters.clientId ? Number(filters.clientId) : null, p_project_id: filters.projectId ? Number(filters.projectId) : null,
        p_geographic_area: filters.area || null, p_population: filters.population || null,
      });
      if (rpcError) throw rpcError;
      setSummary((data || {}) as Record<string, unknown>);
    } catch (reason) {
      setError(workingTimeErrorMessage(reason));
    } finally {
      setIsBusy(false);
    }
  }

  const update = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const renderOption = (item: Option) => <option key={item.id} value={item.id}>{item.label}</option>;
  const formatValue = (value: unknown) => value === null || value === undefined ? 'À configurer' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

  return (
    <section aria-labelledby="hse-kpi-title" className="working-time-hse-panel">
      <header><div><p>Exposition HSE / IMCA</p><h2 id="hse-kpi-title">Indicateurs sécurité filtrables</h2></div><Activity aria-hidden="true" size={22} /></header>
      <p className="working-time-hse-note">Les heures d’exposition sont séparées des heures réelles. Les taux non configurés restent volontairement vides.</p>
      <div className="working-time-hse-filters">
        <label>Méthode<select value={methodId} onChange={(event) => setMethodId(event.target.value)}><option value="">Sélectionner…</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.name} · {method.version_label}</option>)}</select></label>
        <label>Navire<select value={filters.vesselId} onChange={(event) => update('vesselId', event.target.value)}><option value="">Tous</option>{vessels.map(renderOption)}</select></label>
        <label>Bordée<input value={filters.watch} onChange={(event) => update('watch', event.target.value)} /></label>
        <label>Personne<select value={filters.personId} onChange={(event) => update('personId', event.target.value)}><option value="">Toutes</option>{people.map(renderOption)}</select></label>
        <label>Fonction<input value={filters.functionLabel} onChange={(event) => update('functionLabel', event.target.value)} /></label>
        <label>Client<select value={filters.clientId} onChange={(event) => update('clientId', event.target.value)}><option value="">Tous</option>{clients.map(renderOption)}</select></label>
        <label>Projet<select value={filters.projectId} onChange={(event) => update('projectId', event.target.value)}><option value="">Tous</option>{projects.map(renderOption)}</select></label>
        <label>Zone<input value={filters.area} onChange={(event) => update('area', event.target.value)} /></label>
        <label>Population<select value={filters.population} onChange={(event) => update('population', event.target.value)}><option value="">Toutes</option><option value="offshore">Offshore</option><option value="sedentary">Sédentaire</option></select></label>
      </div>
      <div className="working-time-hse-actions">
        <button disabled={isBusy || !methodId} onClick={() => void loadSummary(false)} type="button">Calculer les KPI</button>
        {canRefresh ? <button disabled={isBusy || !methodId} onClick={() => void loadSummary(true)} type="button"><RefreshCw aria-hidden="true" className={isBusy ? 'is-spinning' : ''} size={16} />Actualiser l’exposition</button> : null}
      </div>
      {error ? <p className="working-time-message is-error" role="alert">{error}</p> : null}
      {summary ? <><div className="working-time-hse-kpis">{KPI_KEYS.map((key) => <article key={key}><span>{KPI_LABELS[key]}</span><strong>{formatValue(summary[key])}</strong></article>)}</div><p className="working-time-hse-summary"><ShieldAlert aria-hidden="true" size={16} />Exposition : <strong>{formatValue(summary.exposure_hours)} h</strong> · FAT {formatValue(summary.FAT)} · LWDC {formatValue(summary.LWDC)} · RWC {formatValue(summary.RWC)} · MTC {formatValue(summary.MTC)} · Near Miss {formatValue(summary.near_miss)} · Safety Observation {formatValue(summary.safety_observation)}</p></> : null}
    </section>
  );
}
