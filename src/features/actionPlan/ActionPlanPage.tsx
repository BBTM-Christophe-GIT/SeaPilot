import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  FileImage, History, Plus, RefreshCw, Search, ShieldCheck, Upload, X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildActionPlanMetrics, createActionItem, fetchActionPlanData, isActionClosed, normalizeActionLabel,
  updateActionItemTreatment, type ActionItemRecord, type ActionPlanData, type ActionTreatmentInput,
  type CreateActionItemInput,
} from './actionPlanQueries';
import './actionPlan.css';

interface ActionPlanPageProps { client?: SupabaseClient; roles?: RoleKey[] }
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

  const filtered = useMemo(() => data.actions.filter((action) => actionMatches(action, filters)), [data.actions, filters]);
  const metrics = useMemo(() => buildActionPlanMetrics(filtered, data.exposureHours), [filtered, data.exposureHours]);
  const vesselOptions = useMemo(() => unique(data.actions.map((a) => a.vesselName)), [data.actions]);
  const typeOptions = useMemo(() => unique(data.actions.map(actionTypeLabel)), [data.actions]);
  const deviationOptions = useMemo(() => unique([...DEVIATION_TYPES, ...data.actions.map((a) => a.deviationType)]), [data.actions]);
  const vesselCount = unique(filtered.map((a) => a.vesselName)).length;

  function updateFilter(key: keyof Filters, value: string) { setFilters((current) => ({ ...current, [key]: value })); }
  function replaceAction(updated: ActionItemRecord) {
    setData((current) => ({ ...current, actions: current.actions.map((action) => action.id === updated.id ? updated : action) }));
    setTreatmentAction(null); setMessage('Action mise à jour.');
  }

  const groupedStatuses = [
    { key: 'open', label: 'Écarts non soldés', actions: filtered.filter((a) => !isActionClosed(a)) },
    { key: 'closed', label: 'Actions soldées', actions: filtered.filter(isActionClosed) },
  ];

  if (loading) return <div className="admin-state" role="status">Chargement du plan d'action…</div>;

  return <section className="action-plan-page">
    <header className="action-plan-header"><div><h1>Plan d'action</h1><p>Suivi des écarts, événements QHSE, actions correctives, responsables et échéances.</p></div></header>
    <nav className="action-plan-toolbar" aria-label="Fonctionnalités du plan d'action">
      <div><button aria-current="page" className="is-active"><ShieldCheck size={16} />Actions</button></div>
      <span><button className="is-secondary" onClick={() => void load()}><RefreshCw size={16} />Actualiser</button>{isManager && <button onClick={() => setCreateOpen(true)}><Plus size={17} />Nouvelle action</button>}</span>
    </nav>

    {(message || error) && <p className={`action-plan-message${error ? ' is-error' : ' is-success'}`}>{error || message}</p>}

    <div className="action-plan-metrics">
      <MetricCard detail={`${vesselCount} navire(s) / lieu(x)`} icon={<Clock3 size={20} />} label="Actions non soldées" tone="is-orange" value={metrics.openActionCount} />
      <MetricCard detail={`${metrics.overdueActionCount} action(s) en retard`} icon={<AlertTriangle size={20} />} label="Non-conformités majeures" tone="is-red" value={metrics.majorNonConformityCount} />
      <MetricCard detail={`${filtered.length} action(s) affichée(s)`} icon={<CheckCircle2 size={20} />} label="Actions soldées" tone="is-green" value={metrics.closedActionCount} />
      <MetricCard detail={`Période ${new Date().getFullYear()}`} icon={<History size={20} />} label="Heures travaillées" tone="is-teal" value={formatHours(metrics.exposureHours)} />
    </div>

    <>
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
    </>

    <CreateActionDialog client={effectiveClient} data={data} issuerName={profileName} onClose={() => setCreateOpen(false)} onCreated={(action) => { setData((current) => ({ ...current, actions: [action, ...current.actions] })); setCreateOpen(false); setMessage('Action ajoutée.'); }} open={createOpen} />
    <TreatmentDialog action={treatmentAction} client={effectiveClient} onClose={() => setTreatmentAction(null)} onSaved={replaceAction} />
  </section>;
}
