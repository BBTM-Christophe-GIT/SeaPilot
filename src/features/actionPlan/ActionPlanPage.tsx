import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  BookOpen, FileImage, History, Plus, RefreshCw, Search, ShieldCheck, Upload, X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildActionPlanMetrics, createActionItem, fetchActionPlanData, fetchActionPlanHseDashboard, isActionClosed, normalizeActionLabel,
  updateActionItemTreatment, type ActionItemRecord, type ActionPlanData, type ActionTreatmentInput,
  type ActionPlanHsePoint, type CreateActionItemInput,
} from './actionPlanQueries';
import './actionPlan.css';

interface ActionPlanPageProps { client?: SupabaseClient; roles?: RoleKey[] }
type ActionPlanTab = 'actions' | 'indicators';
type CreateStep = 'title' | 'issuer' | 'category' | 'proposal' | 'photos';

interface Filters { search: string; status: string; vessel: string; actionType: string; deviationType: string }

const EMPTY_DATA: ActionPlanData = {
  actions: [], documents: [], actionTypes: [], vessels: [], exposureHours: 0, hseKpis: null, hseDashboard: null,
};

const EMPTY_FILTERS: Filters = { search: '', status: '', vessel: '', actionType: '', deviationType: '' };
const DEVIATION_TYPES = [
  'Non Conformité Majeure', 'Non Conformité Mineure', 'Prescription', "Proposition d'Amélioration",
  'Recommandation', 'Remarque', 'Remarque Positive',
];

function newActionForm(issuerName = ''): CreateActionItemInput {
  return {
    title: '', issuerName, vesselId: null, vesselName: '', actionTypeKey: '', actionType: '',
    deviationType: 'Remarque', openedOn: new Date().toISOString().slice(0, 10), dueOn: '',
    ownerName: '', description: '', correctiveAction: '', lostDays: 0,
  };
}

function canManage(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function display(value: string, fallback = 'Non renseigné'): string { return value || fallback }

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
}

function formatDate(value: string): string {
  if (!value) return 'Sans échéance';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatHours(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} h`;
}

function actionTypeLabel(action: ActionItemRecord): string {
  return action.actionType || action.auditType || 'Autre action';
}

function actionMatches(action: ActionItemRecord, filters: Filters): boolean {
  if (filters.status === 'open' && isActionClosed(action)) return false;
  if (filters.status === 'closed' && !isActionClosed(action)) return false;
  if (filters.vessel && action.vesselName !== filters.vessel) return false;
  if (filters.actionType && actionTypeLabel(action) !== filters.actionType) return false;
  if (filters.deviationType && action.deviationType !== filters.deviationType) return false;
  if (!filters.search) return true;
  const haystack = normalizeActionLabel([
    action.title, action.vesselName, actionTypeLabel(action), action.deviationType, action.ownerName,
    action.issuerName, action.correctiveAction, action.comments, action.description,
  ].join(' '));
  return haystack.includes(normalizeActionLabel(filters.search));
}

function severityClass(value: string): string {
  const normalized = normalizeActionLabel(value);
  if (normalized.includes('majeure') || normalized.includes('deces') || normalized.includes('fatal')) return 'is-critical';
  if (normalized.includes('mineure') || normalized.includes('prescription')) return 'is-warning';
  if (normalized.includes('positive')) return 'is-positive';
  return 'is-neutral';
}

function MetricCard({ icon, label, value, tone, detail }: {
  icon: ReactNode; label: string; value: string | number; tone: string; detail: string;
}) {
  return (
    <article className={`action-plan-metric ${tone}`} aria-label={label}>
      <span className="action-plan-metric-icon">{icon}</span>
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </article>
  );
}

interface RateSeries {
  key: keyof ActionPlanHsePoint;
  label: string;
  color: string;
  axis?: 'left' | 'right';
}

function formatRate(value: unknown): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value));
}

function RateChart({ title, description, points, series }: {
  title: string; description: string; points: ActionPlanHsePoint[]; series: RateSeries[];
}) {
  const latest = points[points.length - 1];
  return <article className="action-plan-chart-card">
    <header><div><h3>{title}</h3><p>{description}</p></div><div className="action-plan-chart-values">
      {series.map((item) => <span key={String(item.key)} style={{ '--series-color': item.color } as CSSProperties}>
        <small>{item.label}</small><strong>{formatRate(latest?.[item.key])}</strong>
      </span>)}
    </div></header>
    <div className="action-plan-chart" role="img" aria-label={`${title}, évolution cumulée mois par mois`}>
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={points} margin={{ top: 10, right: 18, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="#e5ebf3" strokeDasharray="3 4" vertical={false} />
          <XAxis axisLine={false} dataKey="monthLabel" fontSize={11} tickLine={false} />
          <YAxis axisLine={false} fontSize={11} tickLine={false} yAxisId="left" />
          {series.some((item) => item.axis === 'right') && <YAxis axisLine={false} fontSize={11} orientation="right" tickLine={false} yAxisId="right" />}
          <Tooltip formatter={(value, name) => [formatRate(value), name]} labelFormatter={(label) => `Cumul à fin ${label}`} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {series.map((item) => <Line activeDot={{ r: 5 }} connectNulls={false} dataKey={item.key} dot={{ r: 2.5 }} key={String(item.key)}
            name={item.label} stroke={item.color} strokeWidth={2.5} type="monotone" yAxisId={item.axis || 'left'} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  </article>;
}

function HseDefinitionsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  if (!open) return null;
  const definitions = [
    ['FAT', 'Décès lié au travail.'],
    ['LWDC', 'Accident entraînant au moins une journée de travail perdue.'],
    ['LTI', 'Accident avec arrêt : FAT + LWDC.'],
    ['RWC', 'Blessure permettant un travail adapté ou restreint.'],
    ['MTC', 'Cas nécessitant un traitement médical au-delà des premiers soins.'],
    ['FAC', 'Cas traité uniquement par des premiers soins.'],
    ['Near miss', 'Presqu’accident sans blessure, mais avec un potentiel de dommage.'],
    ['Safety observation', 'Observation documentée d’une situation ou d’un comportement de sécurité.'],
  ];
  const formulas = [
    ['LTIFR', '(FAT + LWDC) × 1 000 000 ÷ heures travaillées'],
    ['TRIR', '(FAT + LWDC + RWC + MTC) × 1 000 000 ÷ heures travaillées'],
    ['FAR', 'FAT × 100 000 000 ÷ heures travaillées'],
    ['SOFR', 'Observations sécurité × 200 000 ÷ heures travaillées'],
    ['Taux de fréquence (TF)', '(FAT + LWDC) × 1 000 000 ÷ heures travaillées'],
    ['Taux de gravité (TG)', 'Jours perdus × 1 000 ÷ heures travaillées'],
  ];
  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-definitions" role="dialog" aria-modal="true" aria-labelledby="hse-definitions-title">
    <header><div><span>Référentiel HSE</span><h2 id="hse-definitions-title">Définitions et formules</h2></div><button aria-label="Fermer" onClick={onClose}><X size={22} /></button></header>
    <div className="action-plan-definitions-body"><section><h3>Classification des événements</h3><dl>{definitions.map(([term, definition]) => <Fragment key={term}><dt>{term}</dt><dd>{definition}</dd></Fragment>)}</dl></section>
      <section><h3>Formules de calcul</h3><dl>{formulas.map(([term, formula]) => <Fragment key={term}><dt>{term}</dt><dd>{formula}</dd></Fragment>)}</dl>
        <p>Les courbes affichent le cumul du 1er janvier à la fin de chaque mois. Les taux restent indisponibles tant qu’aucune heure travaillée n’est enregistrée.</p></section></div>
    <footer><button onClick={onClose}>Fermer</button></footer>
  </section></div>;
}

function CreateActionDialog({
  open, issuerName, data, onClose, onCreated, client,
}: {
  open: boolean; issuerName: string; data: ActionPlanData; onClose(): void;
  onCreated(action: ActionItemRecord): void; client: SupabaseClient;
}) {
  const [step, setStep] = useState<CreateStep>('title');
  const [form, setForm] = useState<CreateActionItemInput>(() => newActionForm(issuerName));
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (open) setForm((current) => ({ ...current, issuerName: current.issuerName || issuerName })); }, [issuerName, open]);
  if (!open) return null;

  const steps: Array<[CreateStep, string]> = [
    ['title', 'Titre'], ['issuer', 'Émetteur'], ['category', 'Catégorie'],
    ['proposal', "Proposition d'Action"], ['photos', 'Photos'],
  ];

  function update<K extends keyof CreateActionItemInput>(key: K, value: CreateActionItemInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setIsSaving(true);
    try { onCreated(await createActionItem(client, form, photos)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer cette action."); }
    finally { setIsSaving(false); }
  }

  return (
    <div className="action-plan-dialog-backdrop" role="presentation">
      <section className="action-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="new-action-title">
        <header><span>Création</span><h2 id="new-action-title">Nouvelle Action</h2>
          <button aria-label="Fermer" onClick={onClose} type="button"><X size={22} /></button></header>
        <form onSubmit={submit}>
          <aside aria-label="Sections Action"><small>Sections</small><strong>Action</strong>
            {steps.map(([key, label], index) => <button className={step === key ? 'is-active' : ''} key={key}
              onClick={() => setStep(key)} type="button"><span>{index + 1}</span>{label}</button>)}
          </aside>
          <div className="action-plan-dialog-content">
            {step === 'title' && <section><h3>Titre</h3><label>Constat <b>*</b>
              <textarea autoFocus value={form.title} onChange={(e) => update('title', e.target.value)} /></label>
              <label>Description complémentaire<textarea value={form.description} onChange={(e) => update('description', e.target.value)} /></label></section>}
            {step === 'issuer' && <section><h3>Émetteur</h3><div className="action-plan-form-grid">
              <label>Émetteur <input required value={form.issuerName} onChange={(e) => update('issuerName', e.target.value)} /></label>
              <label>Navire / lieu <select value={form.vesselId || ''} onChange={(e) => { const vessel = data.vessels.find((v) => v.id === Number(e.target.value)); update('vesselId', vessel?.id || null); update('vesselName', vessel?.name || ''); }}>
                <option value="">Sélectionner un navire</option>{data.vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
              <label>Responsable du traitement<input value={form.ownerName} onChange={(e) => update('ownerName', e.target.value)} /></label>
              <label>Date du constat<input type="date" value={form.openedOn} onChange={(e) => update('openedOn', e.target.value)} /></label>
              <label>À traiter avant<input type="date" value={form.dueOn} onChange={(e) => update('dueOn', e.target.value)} /></label>
            </div></section>}
            {step === 'category' && <section><h3>Catégorie</h3><div className="action-plan-form-grid">
              <label>Type d'action <b>*</b><select required value={form.actionTypeKey} onChange={(e) => { const type = data.actionTypes.find((item) => item.key === e.target.value); update('actionTypeKey', type?.key || ''); update('actionType', type?.label || ''); }}>
                <option value="">Sélectionner un type</option>
                <optgroup label="Actions, audits et visites">{data.actionTypes.filter((t) => t.family !== 'event').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
                <optgroup label="Événements liés aux indicateurs HSE">{data.actionTypes.filter((t) => t.family === 'event').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
              </select></label>
              <label>Type d'écart<select value={form.deviationType} onChange={(e) => update('deviationType', e.target.value)}>{DEVIATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              {data.actionTypes.find((t) => t.key === form.actionTypeKey)?.tracksExposureRate && <label>Jours d'arrêt<input min="0" step="0.5" type="number" value={form.lostDays} onChange={(e) => update('lostDays', Number(e.target.value))} /></label>}
            </div><p className="action-plan-link-note"><Clock3 size={16} />Les événements HSE comptabilisés alimentent automatiquement les taux calculés à partir des heures d’exposition.</p></section>}
            {step === 'proposal' && <section><h3>Proposition d'Action</h3><label>Proposition d'action<textarea value={form.correctiveAction} onChange={(e) => update('correctiveAction', e.target.value)} /></label></section>}
            {step === 'photos' && <section><h3>Photos</h3><label className="action-plan-file-drop"><Upload size={24} /><strong>Ajouter jusqu'à deux photos</strong><span>PNG, JPEG, WebP ou HEIC · 10 Mo maximum</span><input accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple type="file" onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 2))} /></label>
              {photos.length > 0 && <ul className="action-plan-file-list">{photos.map((file) => <li key={`${file.name}-${file.size}`}><FileImage size={15} />{file.name}</li>)}</ul>}</section>}
            {error && <p className="action-plan-message is-error" role="alert">{error}</p>}
          </div>
          <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
        </form>
      </section>
    </div>
  );
}

function TreatmentDialog({ action, client, onClose, onSaved }: {
  action: ActionItemRecord | null; client: SupabaseClient; onClose(): void; onSaved(action: ActionItemRecord): void;
}) {
  const [input, setInput] = useState<ActionTreatmentInput>({ comments: '', realizedAction: '', closeAction: false });
  const [photo, setPhoto] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (action) setInput({ comments: action.comments, realizedAction: action.realizedAction, closeAction: false }); }, [action]);
  if (!action) return null;

  async function save(closeAction: boolean) {
    setSaving(true); setError('');
    try { onSaved(await updateActionItemTreatment(client, action!, { ...input, closeAction }, photo)); }
    catch { setError("Impossible d'enregistrer le traitement."); }
    finally { setSaving(false); }
  }

  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-treatment" role="dialog" aria-modal="true" aria-labelledby="treatment-title">
    <header><span>Traitement</span><h2 id="treatment-title">{action.title}</h2><button aria-label="Fermer" onClick={onClose}><X size={22} /></button></header>
    <div className="action-plan-treatment-type">{actionTypeLabel(action)}</div>
    <label>Action réalisée<textarea value={input.realizedAction} onChange={(e) => setInput((current) => ({ ...current, realizedAction: e.target.value }))} /></label>
    <label>Commentaire<textarea value={input.comments} onChange={(e) => setInput((current) => ({ ...current, comments: e.target.value }))} /></label>
    <label className="action-plan-file-drop is-compact"><Upload size={20} /><strong>Photo de clôture</strong><span>{photo?.name || 'Choisir un fichier'}</span><input accept="image/*" type="file" onChange={(e) => setPhoto(e.target.files?.[0])} /></label>
    {error && <p className="action-plan-message is-error">{error}</p>}
    <footer><button className="is-secondary" disabled={saving} onClick={onClose}>Annuler</button><button className="is-secondary" disabled={saving} onClick={() => void save(false)}>Enregistrer</button><button disabled={saving} onClick={() => void save(true)}>Clôturer l'Action</button></footer>
  </section></div>;
}

export function ActionPlanPage({ client, roles }: ActionPlanPageProps) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const effectiveRoles = roles || context?.roles || [];
  const profileName = context?.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}`.trim() : '';
  const isManager = canManage(effectiveRoles);
  const [data, setData] = useState<ActionPlanData>(EMPTY_DATA);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [activeTab, setActiveTab] = useState<ActionPlanTab>('actions');
  const [hseYear, setHseYear] = useState(new Date().getFullYear());
  const [hseLoading, setHseLoading] = useState(false);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const [expandedActionId, setExpandedActionId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [treatmentAction, setTreatmentAction] = useState<ActionItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { setData(await fetchActionPlanData(effectiveClient)); }
    catch { setError("Impossible de charger le plan d'action."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [effectiveClient]);

  async function loadHseDashboard(year = hseYear) {
    setHseLoading(true); setError('');
    try {
      const dashboard = await fetchActionPlanHseDashboard(effectiveClient, year);
      setData((current) => ({
        ...current,
        hseDashboard: dashboard,
        exposureHours: dashboard?.totals.exposureHours || 0,
        hseKpis: dashboard ? dashboard.totals as unknown as ActionPlanData['hseKpis'] : null,
      }));
    } catch {
      setError(`Impossible de calculer les indicateurs HSE ${year}.`);
    } finally { setHseLoading(false); }
  }

  useEffect(() => {
    if (activeTab === 'indicators' && data.hseDashboard?.year !== hseYear) void loadHseDashboard(hseYear);
  }, [activeTab, hseYear]);

  const filtered = useMemo(() => data.actions.filter((action) => actionMatches(action, filters)), [data.actions, filters]);
  const metrics = useMemo(() => buildActionPlanMetrics(filtered, data.exposureHours), [filtered, data.exposureHours]);
  const vesselOptions = useMemo(() => unique(data.actions.map((a) => a.vesselName)), [data.actions]);
  const typeOptions = useMemo(() => unique(data.actions.map(actionTypeLabel)), [data.actions]);
  const deviationOptions = useMemo(() => unique([...DEVIATION_TYPES, ...data.actions.map((a) => a.deviationType)]), [data.actions]);
  const vesselCount = unique(filtered.map((a) => a.vesselName)).length;
  const hseYears = useMemo(() => Array.from(new Set([
    ...Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index),
    ...data.actions.map((action) => Number(action.openedOn.slice(0, 4))).filter((year) => Number.isInteger(year) && year > 2000),
  ])).sort((a, b) => b - a), [data.actions]);

  function updateFilter(key: keyof Filters, value: string) { setFilters((current) => ({ ...current, [key]: value })); }
  function replaceAction(updated: ActionItemRecord) {
    setData((current) => ({ ...current, actions: current.actions.map((action) => action.id === updated.id ? updated : action) }));
    setTreatmentAction(null); setMessage('Action mise à jour.');
    void loadHseDashboard();
  }

  const groupedStatuses = [
    { key: 'open', label: 'Écarts non soldés', actions: filtered.filter((a) => !isActionClosed(a)) },
    { key: 'closed', label: 'Actions soldées', actions: filtered.filter(isActionClosed) },
  ];

  if (loading) return <div className="admin-state" role="status">Chargement du plan d'action…</div>;

  return <section className="action-plan-page">
    <header className="action-plan-header"><div><h1>Plan d'action</h1><p>Suivi des écarts, événements QHSE, actions correctives, responsables et échéances.</p></div></header>
    <nav className="action-plan-toolbar" aria-label="Fonctionnalités du plan d'action">
      <div>{([['actions', 'Actions'], ['indicators', 'Indicateurs HSE']] as Array<[ActionPlanTab, string]>).map(([key, label]) => <button aria-current={activeTab === key ? 'page' : undefined} className={activeTab === key ? 'is-active' : ''} key={key} onClick={() => setActiveTab(key)}>{key === 'indicators' ? <BarChart3 size={16} /> : <ShieldCheck size={16} />}{label}</button>)}</div>
      <span><button className="is-secondary" onClick={() => void load()}><RefreshCw size={16} />Actualiser</button>{isManager && <button onClick={() => setCreateOpen(true)}><Plus size={17} />Nouvelle action</button>}</span>
    </nav>

    {(message || error) && <p className={`action-plan-message${error ? ' is-error' : ' is-success'}`}>{error || message}</p>}

    <div className="action-plan-metrics">
      <MetricCard detail={`${vesselCount} navire(s) / lieu(x)`} icon={<Clock3 size={20} />} label="Actions non soldées" tone="is-orange" value={metrics.openActionCount} />
      <MetricCard detail={`${metrics.overdueActionCount} action(s) en retard`} icon={<AlertTriangle size={20} />} label="Non-conformités majeures" tone="is-red" value={metrics.majorNonConformityCount} />
      <MetricCard detail={`${filtered.length} action(s) affichée(s)`} icon={<CheckCircle2 size={20} />} label="Actions soldées" tone="is-green" value={metrics.closedActionCount} />
      <MetricCard detail={`Période ${new Date().getFullYear()}`} icon={<History size={20} />} label="Heures travaillées" tone="is-teal" value={formatHours(metrics.exposureHours)} />
    </div>

    {activeTab === 'actions' && <>
      <div className="action-plan-filters">
        <label>Navire / lieu<select value={filters.vessel} onChange={(e) => updateFilter('vessel', e.target.value)}><option value="">Tous les navires</option>{vesselOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Type d'action<select value={filters.actionType} onChange={(e) => updateFilter('actionType', e.target.value)}><option value="">Tous les types</option>{typeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Statut<select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="">Tous les statuts</option><option value="open">Non soldé</option><option value="closed">Soldé</option></select></label>
        <label>Type d'écart<select value={filters.deviationType} onChange={(e) => updateFilter('deviationType', e.target.value)}><option value="">Tous les types d'écart</option>{deviationOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="action-plan-search"><span className="sr-only">Rechercher</span><Search size={17} /><input aria-label="Rechercher une action" placeholder="Rechercher par titre, navire, responsable…" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} /></label>
      </div>
      <div className="action-plan-list" aria-label="Actions groupées">
        {groupedStatuses.map((statusGroup) => statusGroup.actions.length > 0 && <details key={statusGroup.key} open>
          <summary><span className={`action-plan-count ${statusGroup.key}`}>{statusGroup.actions.length}</span>{statusGroup.label}</summary>
          {unique(statusGroup.actions.map((a) => a.vesselName || 'Sans navire')).map((vessel) => {
            const vesselActions = statusGroup.actions.filter((a) => (a.vesselName || 'Sans navire') === vessel);
            return <details key={`${statusGroup.key}-${vessel}`} open><summary><span className="action-plan-count vessel">{vesselActions.length}</span>{vessel}</summary>
              {unique(vesselActions.map(actionTypeLabel)).map((type) => { const typeActions = vesselActions.filter((a) => actionTypeLabel(a) === type);
                return <details key={`${statusGroup.key}-${vessel}-${type}`} open><summary><span className="action-plan-count type">{typeActions.length}</span>{type}</summary>
                  {typeActions.map((action) => <article className={`action-plan-row ${severityClass(action.deviationType)}`} key={action.id}>
                    {isManager && !isActionClosed(action)
                      ? <button className="action-plan-treat" onClick={() => setTreatmentAction(action)}>Traiter</button>
                      : <span aria-hidden="true" className="action-plan-treat-spacer" />}
                    {action.thumbnailUrl
                      ? <a aria-label={isActionClosed(action) ? `Ouvrir la preuve de traitement de ${action.title}` : `Ouvrir la photo jointe de ${action.title}`} className="action-plan-thumbnail" href={action.thumbnailUrl} rel="noreferrer" target="_blank"><img alt={isActionClosed(action) ? `Preuve de traitement — ${action.title}` : `Photo jointe — ${action.title}`} src={action.thumbnailUrl} /></a>
                      : <span aria-hidden="true" className="action-plan-thumbnail is-empty"><FileImage size={18} /></span>}
                    <button aria-expanded={expandedActionId === action.id} className="action-plan-row-main" onClick={() => setExpandedActionId(expandedActionId === action.id ? null : action.id)}>
                      <span>{expandedActionId === action.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong><time className={action.dueOn && action.dueOn < new Date().toISOString().slice(0, 10) && !isActionClosed(action) ? 'is-overdue' : ''} dateTime={action.dueOn || undefined}>{formatDate(action.dueOn)}</time><span> - </span><span className="action-plan-row-title-text">{action.title}</span></strong></span>
                      <span><strong>{display(action.ownerName)}</strong><small>Responsable du traitement</small></span>
                      <span>{display(action.deviationType, 'Remarque')}</span>
                      <span><em className={isActionClosed(action) ? 'is-closed' : 'is-open'}>{isActionClosed(action) ? 'Soldé' : 'À traiter'}</em></span>
                    </button>
                    {expandedActionId === action.id && <div className="action-plan-row-details"><dl>
                      <dt>Constat</dt><dd>{display(action.description, action.title)}</dd>
                      <dt>Proposition d'action</dt><dd>{display(action.correctiveAction, 'Aucune proposition renseignée.')}</dd>
                      <dt>Commentaire</dt><dd>{display(action.comments, 'Aucun commentaire renseigné.')}</dd>
                      {action.realizedAction && <><dt>Action réalisée</dt><dd>{action.realizedAction}</dd></>}
                      <dt>Émetteur</dt><dd>{display(action.issuerName)}</dd>
                      {(action.projectCode || action.projectTitle) && <><dt>Projet</dt><dd>{[action.projectCode, action.projectTitle].filter(Boolean).join(' · ')}</dd></>}
                      {data.documents.filter((document) => document.actionItemId === action.id || (document.actionSharePointItemId && document.actionSharePointItemId === action.sourceItemId)).map((document) => <Fragment key={document.id}><dt>Fiche de progrès</dt><dd><a aria-label={`Ouvrir le fichier ${document.title}`} href={document.fileUrl} rel="noreferrer" target="_blank">{document.title}</a></dd></Fragment>)}
                    </dl></div>}
                  </article>)}
                </details>; })}
            </details>; })}
        </details>)}
        {filtered.length === 0 && <div className="action-plan-empty">Aucune action ne correspond aux filtres.</div>}
      </div>
    </>}

    {activeTab === 'indicators' && <section className="action-plan-indicators"><header><div><span className="action-plan-eyebrow">Pilotage annuel</span><h2>Indicateurs HSE liés au temps de travail</h2><p>Les événements du plan d’action et les heures travaillées alimentent un même calcul versionné.</p></div><div className="action-plan-indicator-actions">
      <label>Année<select aria-label="Année des indicateurs HSE" disabled={hseLoading} value={hseYear} onChange={(event) => setHseYear(Number(event.target.value))}>{hseYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <button className="is-secondary" onClick={() => setDefinitionsOpen(true)}><BookOpen size={17} />Définitions et formules</button>
    </div></header>

      {hseLoading && <div className="action-plan-hse-loading" role="status"><RefreshCw size={18} />Calcul des indicateurs {hseYear}…</div>}
      {!hseLoading && data.hseDashboard && <>
        <div className="action-plan-hse-summary"><div><small>Heures travaillées</small><strong>{formatHours(data.hseDashboard.totals.exposureHours)}</strong><span>Du 1er janvier à la dernière période disponible</span></div><div><small>Méthodologie</small><strong>{data.hseDashboard.methodologyVersion || 'SeaPilot HSE'}</strong><span>{data.hseDashboard.exposureRefreshed ? 'Registre des heures actualisé' : 'Dernier registre des heures disponible'}</span></div></div>
        <div className="action-plan-indicator-grid">{[
          ['FAT', 'Décès', data.hseDashboard.totals.FAT, data.hseDashboard.historicalTotals.FAT],
          ['LTI', 'Accidents avec arrêt', data.hseDashboard.totals.LTI, data.hseDashboard.historicalTotals.LTI],
          ['RWC', 'Travail adapté', data.hseDashboard.totals.RWC, data.hseDashboard.historicalTotals.RWC],
          ['MTC', 'Traitement médical', data.hseDashboard.totals.MTC, data.hseDashboard.historicalTotals.MTC],
          ['FAC', 'Premiers soins', data.hseDashboard.totals.FAC, data.hseDashboard.historicalTotals.FAC],
          ['Near miss', 'Presqu’accidents', data.hseDashboard.totals.nearMiss, data.hseDashboard.historicalTotals.nearMiss],
        ].map(([key, label, value, historical]) => <article key={String(key)}><small>{key}</small><strong>{Number(value)}</strong><span>{label}<small>{Number(historical)} au total</small></span></article>)}</div>

        <section className="action-plan-chart-section"><header><div><span className="action-plan-eyebrow">Référentiel français</span><h2>Fréquence et gravité</h2></div><p>Évolution cumulée depuis le 1er janvier. Le taux de gravité utilise les jours perdus.</p></header>
          <RateChart description="TF par million d’heures · TG par millier d’heures" points={data.hseDashboard.monthly} series={[
            { key: 'frequencyRate', label: 'Taux de fréquence', color: '#2663eb' },
            { key: 'severityRate', label: 'Taux de gravité', color: '#dc6b2f', axis: 'right' },
          ]} title="Taux de fréquence et taux de gravité" />
        </section>

        <section className="action-plan-chart-section"><header><div><span className="action-plan-eyebrow">Référentiel IMCA</span><h2>Performance sécurité maritime</h2></div><p>Lecture séparée des accidents enregistrables et des indicateurs de prévention.</p></header>
          <div className="action-plan-chart-grid"><RateChart description="Taux cumulés rapportés aux heures travaillées" points={data.hseDashboard.monthly} series={[
            { key: 'LTIFR', label: 'LTIFR', color: '#2463d4' }, { key: 'TRIR', label: 'TRIR', color: '#13a06f' },
            { key: 'FAR', label: 'FAR', color: '#c33c42', axis: 'right' },
          ]} title="Accidents enregistrables" />
          <RateChart description="Cas et observations rapportés aux heures travaillées" points={data.hseDashboard.monthly} series={[
            { key: 'RWCRate', label: 'RWC', color: '#7a57c7' }, { key: 'MTCRate', label: 'MTC', color: '#d17a24' },
            { key: 'FACRate', label: 'FAC', color: '#2383a8' }, { key: 'SOFR', label: 'SOFR', color: '#19875b', axis: 'right' },
          ]} title="Prévention, soins et travail adapté" /></div>
        </section>
        <div className="action-plan-rate-note"><Clock3 size={20} /><div><strong>Dénominateur commun et traçable</strong><p>Tous les taux sont calculés côté serveur à partir du registre des heures travaillées. Les courbes sont cumulées mois par mois pour l’année {hseYear}.</p></div></div>
      </>}
      {!hseLoading && !data.hseDashboard && <div className="action-plan-empty">Aucune méthodologie HSE disponible pour cette année.</div>}
    </section>}

    <CreateActionDialog client={effectiveClient} data={data} issuerName={profileName} onClose={() => setCreateOpen(false)} onCreated={(action) => { setData((current) => ({ ...current, actions: [action, ...current.actions] })); setCreateOpen(false); setMessage('Action ajoutée.'); void loadHseDashboard(); }} open={createOpen} />
    <TreatmentDialog action={treatmentAction} client={effectiveClient} onClose={() => setTreatmentAction(null)} onSaved={replaceAction} />
    <HseDefinitionsDialog onClose={() => setDefinitionsOpen(false)} open={definitionsOpen} />
  </section>;
}
