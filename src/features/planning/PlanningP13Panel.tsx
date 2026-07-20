import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Activity,
  Bell,
  CheckCircle2,
  Gauge,
  Link2,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatPlanningDate, formatPlanningDateTime, todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningDependencyViolations,
  buildPlanningP13Dashboard,
  buildPlanningWorkRestChecks,
  PLANNING_DEPENDENCY_LABELS,
  PLANNING_NOTIFICATION_LABELS,
  type PlanningDependencyEntityKind,
  type PlanningDependencyType,
  type PlanningP13Data,
  type PlanningWorkRestPolicy,
} from './planningP13';
import {
  deletePlanningDependency,
  fetchPlanningP13Data,
  markPlanningNotificationRead,
  refreshPlanningNotifications,
  savePlanningDependency,
  savePlanningWorkRestPolicy,
} from './planningP13Queries';
type P13Tab = 'dashboard' | 'rest' | 'notifications' | 'dependencies';

const EMPTY_DATA: PlanningP13Data = {
  policies: [], notifications: [], dependencies: [],
  p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
};

interface PolicyForm {
  id?: number;
  name: string;
  scope: 'company' | 'vessel';
  vesselId: string;
  effectiveFrom: string;
  effectiveTo: string;
  maxWork24h: string;
  minRest24h: string;
  maxWork7d: string;
  minRest7d: string;
  minConsecutiveRestHours: string;
  maxRestPeriods24h: string;
  nightStartsAt: string;
  nightEndsAt: string;
  maxNightWork24h: string;
  includeHandover: boolean;
  active: boolean;
  notes: string;
}

interface DependencyForm {
  dependencyType: PlanningDependencyType;
  predecessor: string;
  successor: string;
  lagMinutes: string;
  notes: string;
}

const TABS: Array<{ key: P13Tab; label: string }> = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'rest', label: 'Travail & repos' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'dependencies', label: 'Dépendances' },
];

const DEPENDENCY_TYPES = Object.keys(PLANNING_DEPENDENCY_LABELS) as PlanningDependencyType[];

function emptyPolicy(rangeStart: string): PolicyForm {
  return {
    name: '', scope: 'company', vesselId: '', effectiveFrom: rangeStart || todayPlanningDate(), effectiveTo: '',
    maxWork24h: '', minRest24h: '', maxWork7d: '', minRest7d: '', minConsecutiveRestHours: '',
    maxRestPeriods24h: '', nightStartsAt: '', nightEndsAt: '', maxNightWork24h: '',
    includeHandover: true, active: true, notes: '',
  };
}

function policyForm(policy: PlanningWorkRestPolicy): PolicyForm {
  return {
    id: policy.id, name: policy.name, scope: policy.scope, vesselId: policy.vesselId ? String(policy.vesselId) : '',
    effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo, maxWork24h: String(policy.maxWork24h),
    minRest24h: String(policy.minRest24h), maxWork7d: String(policy.maxWork7d), minRest7d: String(policy.minRest7d),
    minConsecutiveRestHours: String(policy.minConsecutiveRestHours), maxRestPeriods24h: String(policy.maxRestPeriods24h),
    nightStartsAt: policy.nightStartsAt, nightEndsAt: policy.nightEndsAt, maxNightWork24h: String(policy.maxNightWork24h),
    includeHandover: policy.includeHandover, active: policy.active, notes: policy.notes,
  };
}

function splitEntity(value: string): { kind: PlanningDependencyEntityKind; id: number } {
  const [kind, id] = value.split(':');
  return { kind: kind as PlanningDependencyEntityKind, id: Number(id) };
}

export function PlanningP13Panel({
  client,
  overview,
  range,
  canManageWorkRestPolicies,
  canViewDashboard,
  canViewWorkRest,
  canViewNotifications,
  canRefreshNotifications,
  canManageDependencies,
  onClose,
  onAuditChange,
}: {
  client: SupabaseClient;
  overview: PlanningOverview;
  range: { start: string; end: string };
  canManageWorkRestPolicies: boolean;
  canViewDashboard: boolean;
  canViewWorkRest: boolean;
  canViewNotifications: boolean;
  canRefreshNotifications: boolean;
  canManageDependencies: boolean;
  onClose: () => void;
  onAuditChange: () => Promise<void>;
}) {
  const [tab, setTab] = useState<P13Tab>(() => canViewDashboard ? 'dashboard' : canViewWorkRest ? 'rest' : 'notifications');
  const [data, setData] = useState<PlanningP13Data>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [policyEditor, setPolicyEditor] = useState<PolicyForm | null>(null);
  const [restFilter, setRestFilter] = useState<'all' | 'alerts' | 'missing'>('alerts');
  const [dependencyForm, setDependencyForm] = useState<DependencyForm | null>(null);
  const availableTabs = useMemo(() => TABS.filter((item) => {
    if (item.key === 'dashboard') return canViewDashboard;
    if (item.key === 'rest') return canViewWorkRest;
    if (item.key === 'notifications') return canViewNotifications;
    return canManageDependencies;
  }), [canManageDependencies, canViewDashboard, canViewNotifications, canViewWorkRest]);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      if (refresh && canRefreshNotifications) await refreshPlanningNotifications(client, todayPlanningDate());
      setData(await fetchPlanningP13Data(client));
      setFeedback(null);
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de charger le cockpit P1.3.'), error: true });
    } finally {
      setLoading(false);
    }
  }, [canRefreshNotifications, client]);

  useEffect(() => {
    let active = true;
    const request = canRefreshNotifications
      ? refreshPlanningNotifications(client, todayPlanningDate()).catch(() => 0).then(() => fetchPlanningP13Data(client))
      : fetchPlanningP13Data(client);
    void request.then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setFeedback({ text: planningErrorMessage(error, 'Impossible de charger le cockpit P1.3.'), error: true }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canRefreshNotifications, client]);

  const checks = useMemo(() => buildPlanningWorkRestChecks(overview, data.policies, range), [data.policies, overview, range]);
  const dependencyResults = useMemo(() => buildPlanningDependencyViolations(overview, data.p12.absences, data.dependencies), [data.dependencies, data.p12.absences, overview]);
  const metrics = useMemo(() => buildPlanningP13Dashboard(overview, data, checks, dependencyResults, todayPlanningDate()), [checks, data, dependencyResults, overview]);
  const filteredChecks = useMemo(() => checks.filter((check) => restFilter === 'all'
    || (restFilter === 'alerts' && check.status === 'non_compliant')
    || (restFilter === 'missing' && check.status === 'not_evaluable')), [checks, restFilter]);

  const entities = useMemo(() => {
    const values: Array<{ value: string; label: string }> = [];
    overview.projects.forEach((project) => values.push({ value: `project:${project.id}`, label: `Opération · ${project.title}` }));
    overview.assignments.forEach((assignment) => values.push({ value: `assignment:${assignment.id}`, label: `Affectation · ${assignment.crewName} / ${assignment.vesselName}` }));
    data.p12.absences.forEach((absence) => values.push({ value: `absence:${absence.id}`, label: `Formation/absence · ${absence.reason}` }));
    overview.handovers.forEach((handover) => values.push({ value: `handover:${handover.id}`, label: `Relève · ${handover.location}` }));
    return values;
  }, [data.p12.absences, overview.assignments, overview.handovers, overview.projects]);

  async function submitPolicy(event: FormEvent) {
    event.preventDefault();
    if (!policyEditor) return;
    setSaving(true);
    try {
      await savePlanningWorkRestPolicy(client, {
        id: policyEditor.id, name: policyEditor.name, scope: policyEditor.scope,
        vesselId: policyEditor.vesselId ? Number(policyEditor.vesselId) : null,
        effectiveFrom: policyEditor.effectiveFrom, effectiveTo: policyEditor.effectiveTo,
        maxWork24h: Number(policyEditor.maxWork24h), minRest24h: Number(policyEditor.minRest24h),
        maxWork7d: Number(policyEditor.maxWork7d), minRest7d: Number(policyEditor.minRest7d),
        minConsecutiveRestHours: Number(policyEditor.minConsecutiveRestHours),
        maxRestPeriods24h: Number(policyEditor.maxRestPeriods24h), nightStartsAt: policyEditor.nightStartsAt,
        nightEndsAt: policyEditor.nightEndsAt, maxNightWork24h: Number(policyEditor.maxNightWork24h),
        includeHandover: policyEditor.includeHandover, active: policyEditor.active, notes: policyEditor.notes,
      });
      setPolicyEditor(null);
      await Promise.all([load(), onAuditChange()]);
      setFeedback({ text: 'Politique de travail et repos enregistrée.', error: false });
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible d’enregistrer les seuils.'), error: true });
    } finally {
      setSaving(false);
    }
  }

  async function submitDependency(event: FormEvent) {
    event.preventDefault();
    if (!dependencyForm) return;
    const predecessor = splitEntity(dependencyForm.predecessor);
    const successor = splitEntity(dependencyForm.successor);
    setSaving(true);
    try {
      await savePlanningDependency(client, {
        dependencyType: dependencyForm.dependencyType,
        predecessorKind: predecessor.kind, predecessorId: predecessor.id,
        successorKind: successor.kind, successorId: successor.id,
        lagMinutes: Number(dependencyForm.lagMinutes), notes: dependencyForm.notes, active: true,
      });
      setDependencyForm(null);
      await Promise.all([load(), onAuditChange()]);
      setFeedback({ text: 'Dépendance enregistrée et contrôlée.', error: false });
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible d’enregistrer la dépendance.'), error: true });
    } finally {
      setSaving(false);
    }
  }

  async function removeDependency(id: number) {
    setSaving(true);
    try {
      await deletePlanningDependency(client, id);
      await Promise.all([load(), onAuditChange()]);
      setFeedback({ text: 'Dépendance supprimée.', error: false });
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de supprimer la dépendance.'), error: true });
    } finally {
      setSaving(false);
    }
  }

  async function toggleNotification(id: number, read: boolean) {
    try {
      await markPlanningNotificationRead(client, id, read);
      setData((current) => ({ ...current, notifications: current.notifications.map((notification) => notification.id === id ? { ...notification, readAt: read ? new Date().toISOString() : '' } : notification) }));
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de mettre à jour la notification.'), error: true });
    }
  }

  return <div className="planning-dialog-backdrop is-side-panel" role="presentation">
    <section aria-modal="true" className="planning-dialog planning-p13-panel" role="dialog">
      <header><div><Gauge aria-hidden="true" size={21} /><div><h2>Cockpit Planning P1.3</h2><small>Repos, notifications, indicateurs, exports et dépendances</small></div></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={18} /></button></header>
      <nav aria-label="Sections P1.3" className="planning-p13-tabs" role="tablist">{availableTabs.map((item) => <button aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''} key={item.key} onClick={() => setTab(item.key)} role="tab" type="button">{item.label}{item.key === 'notifications' && metrics.unreadNotifications ? <span>{metrics.unreadNotifications}</span> : null}</button>)}</nav>
      {feedback ? <p className={`planning-p13-feedback${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p> : null}
      {loading ? <div className="admin-state" role="status"><RefreshCw className="is-spinning" size={18} />Chargement des contrôles P1.3…</div> : null}

      {!loading && tab === 'dashboard' ? <div className="planning-p13-content">
        <div className="planning-p13-kpis">
          {[
            ['Navires en opération', metrics.operatingVessels], ['Marins embarqués', metrics.embarkedSailors],
            ['Marins disponibles', metrics.availableSailors], ['Relèves à 30 jours', metrics.upcomingHandovers],
            ['Postes vacants', metrics.vacantPositions], ['Conflits critiques', metrics.criticalConflicts],
            ['Taux de couverture', metrics.coverageRate === null ? 'N/A' : `${metrics.coverageRate} %`],
            ['Taux de conformité', metrics.complianceRate === null ? 'N/A' : `${metrics.complianceRate} %`],
          ].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}
        </div>
        <section className="planning-p13-deadlines"><h3>Échéances documentaires</h3><div><span><strong>{metrics.deadlines7Days}</strong> à 7 jours</span><span><strong>{metrics.deadlines14Days}</strong> à 14 jours</span><span><strong>{metrics.deadlines30Days}</strong> à 30 jours</span></div></section>
        <section className="planning-p13-health"><h3>À traiter</h3><p><Bell size={17} />{metrics.unreadNotifications} notification(s) non lue(s)</p><p><Link2 size={17} />{metrics.dependencyViolations} dépendance(s) non respectée(s)</p></section>
      </div> : null}

      {!loading && tab === 'rest' ? <div className="planning-p13-content">
        <div className="planning-p13-toolbar"><div><strong>Contrôles travail & repos</strong><small>{data.policies.length ? `${data.policies.length} politique(s) administrée(s)` : 'Aucun seuil configuré : aucun seuil réglementaire implicite n’est appliqué.'}</small></div>{canManageWorkRestPolicies ? <button onClick={() => setPolicyEditor(emptyPolicy(range.start))} type="button"><Plus size={16} />Nouvelle politique</button> : null}</div>
        <div className="planning-p13-segmented"><button className={restFilter === 'alerts' ? 'is-active' : ''} onClick={() => setRestFilter('alerts')} type="button">Alertes</button><button className={restFilter === 'missing' ? 'is-active' : ''} onClick={() => setRestFilter('missing')} type="button">Données manquantes</button><button className={restFilter === 'all' ? 'is-active' : ''} onClick={() => setRestFilter('all')} type="button">Tous</button></div>
        <div className="planning-p13-policy-list">{data.policies.map((policy) => <button key={policy.id} onClick={() => canManageWorkRestPolicies && setPolicyEditor(policyForm(policy))} type="button"><span><strong>{policy.name}</strong><small>{policy.scope === 'company' ? 'Entreprise' : overview.vessels.find((vessel) => vessel.id === policy.vesselId)?.name} · depuis le {formatPlanningDate(policy.effectiveFrom)}</small></span><em>{policy.active ? 'Active' : 'Inactive'}</em></button>)}</div>
        <div className="planning-p13-check-list">{filteredChecks.length ? filteredChecks.map((check) => <article className={`is-${check.status}`} key={check.id}><div><strong>{check.personName}</strong><span>{check.ruleLabel}</span><small>{check.vesselName} · {formatPlanningDate(check.date)} · {check.policyName}</small></div><div><strong>{check.value ?? 'N/A'} {check.value === null ? '' : check.unit === 'hours' ? 'h' : 'période(s)'}</strong><span>Seuil : {check.threshold ?? 'non configuré'}</span><em>{check.status === 'compliant' ? 'Conforme' : check.status === 'non_compliant' ? 'Non conforme' : 'Non évaluable'}</em></div></article>) : <div className="admin-empty"><CheckCircle2 size={20} /><p>Aucun contrôle dans ce filtre.</p></div>}</div>
      </div> : null}

      {!loading && tab === 'notifications' ? <div className="planning-p13-content">
        <div className="planning-p13-toolbar"><div><strong>Notifications métier</strong><small>{metrics.unreadNotifications} non lue(s) sur {data.notifications.length}</small></div>{canRefreshNotifications ? <button onClick={() => void load(true)} type="button"><RefreshCw size={16} />Actualiser</button> : null}</div>
        <div className="planning-p13-notifications">{data.notifications.length ? data.notifications.map((notification) => <article className={`${notification.readAt ? 'is-read' : ''} is-${notification.severity}`} key={notification.id}><Bell size={18} /><div><span><strong>{notification.title}</strong><em>{PLANNING_NOTIFICATION_LABELS[notification.notificationType]}</em></span><p>{notification.body}</p><small>{formatPlanningDateTime(notification.createdAt)}{notification.dueOn ? ` · échéance ${formatPlanningDate(notification.dueOn)}` : ''}</small></div><button onClick={() => void toggleNotification(notification.id, !notification.readAt)} type="button">{notification.readAt ? 'Marquer non lue' : 'Marquer lue'}</button></article>) : <div className="admin-empty"><Bell size={20} /><p>Aucune notification.</p></div>}</div>
      </div> : null}

      {!loading && tab === 'dependencies' ? <div className="planning-p13-content">
        <div className="planning-p13-toolbar"><div><strong>Dépendances opérationnelles</strong><small>La cible doit commencer après la source et le délai configuré.</small></div>{canManageDependencies && entities.length > 1 ? <button onClick={() => setDependencyForm({ dependencyType: 'operation_sequence', predecessor: entities[0].value, successor: entities[1].value, lagMinutes: '0', notes: '' })} type="button"><Plus size={16} />Nouvelle dépendance</button> : null}</div>
        <div className="planning-p13-dependencies">{dependencyResults.length ? dependencyResults.map((result) => <article className={result.violated ? 'is-violated' : 'is-valid'} key={result.dependency.id}><Activity size={18} /><div><span><strong>{PLANNING_DEPENDENCY_LABELS[result.dependency.dependencyType]}</strong><em>{result.violated ? 'Non respectée' : 'Respectée'}</em></span><p>{result.predecessorLabel} → {result.successorLabel}</p><small>{result.detail}</small></div>{canManageDependencies ? <button aria-label={`Supprimer la dépendance ${result.dependency.id}`} disabled={saving} onClick={() => void removeDependency(result.dependency.id)} type="button"><Trash2 size={16} /></button> : null}</article>) : <div className="admin-empty"><Link2 size={20} /><p>Aucune dépendance configurée.</p></div>}</div>
      </div> : null}

      {policyEditor ? <form className="planning-p13-inline-editor" onSubmit={submitPolicy}><header><div><Settings2 size={18} /><h3>{policyEditor.id ? 'Modifier la politique' : 'Nouvelle politique'}</h3></div><button aria-label="Fermer l’éditeur" onClick={() => setPolicyEditor(null)} type="button"><X size={16} /></button></header><div className="planning-p13-form-grid"><label className="is-wide">Nom<input required minLength={2} value={policyEditor.name} onChange={(event) => setPolicyEditor({ ...policyEditor, name: event.target.value })} /></label><label>Portée<select value={policyEditor.scope} onChange={(event) => setPolicyEditor({ ...policyEditor, scope: event.target.value as PolicyForm['scope'], vesselId: '' })}><option value="company">Entreprise</option><option value="vessel">Navire</option></select></label>{policyEditor.scope === 'vessel' ? <label>Navire<select required value={policyEditor.vesselId} onChange={(event) => setPolicyEditor({ ...policyEditor, vesselId: event.target.value })}><option value="">Sélectionner</option>{overview.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label> : null}<label>Applicable du<input required type="date" value={policyEditor.effectiveFrom} onChange={(event) => setPolicyEditor({ ...policyEditor, effectiveFrom: event.target.value })} /></label><label>Au<input min={policyEditor.effectiveFrom} type="date" value={policyEditor.effectiveTo} onChange={(event) => setPolicyEditor({ ...policyEditor, effectiveTo: event.target.value })} /></label><label>Travail max / 24 h<input max="24" min="0" required step="0.25" type="number" value={policyEditor.maxWork24h} onChange={(event) => setPolicyEditor({ ...policyEditor, maxWork24h: event.target.value })} /></label><label>Repos min / 24 h<input max="24" min="0" required step="0.25" type="number" value={policyEditor.minRest24h} onChange={(event) => setPolicyEditor({ ...policyEditor, minRest24h: event.target.value })} /></label><label>Travail max / 7 j<input max="168" min="0" required step="0.25" type="number" value={policyEditor.maxWork7d} onChange={(event) => setPolicyEditor({ ...policyEditor, maxWork7d: event.target.value })} /></label><label>Repos min / 7 j<input max="168" min="0" required step="0.25" type="number" value={policyEditor.minRest7d} onChange={(event) => setPolicyEditor({ ...policyEditor, minRest7d: event.target.value })} /></label><label>Repos consécutif min<input max="24" min="0" required step="0.25" type="number" value={policyEditor.minConsecutiveRestHours} onChange={(event) => setPolicyEditor({ ...policyEditor, minConsecutiveRestHours: event.target.value })} /></label><label>Périodes de repos max<input max="24" min="1" required type="number" value={policyEditor.maxRestPeriods24h} onChange={(event) => setPolicyEditor({ ...policyEditor, maxRestPeriods24h: event.target.value })} /></label><label>Début de nuit<input required type="time" value={policyEditor.nightStartsAt} onChange={(event) => setPolicyEditor({ ...policyEditor, nightStartsAt: event.target.value })} /></label><label>Fin de nuit<input required type="time" value={policyEditor.nightEndsAt} onChange={(event) => setPolicyEditor({ ...policyEditor, nightEndsAt: event.target.value })} /></label><label>Travail de nuit max<input max="24" min="0" required step="0.25" type="number" value={policyEditor.maxNightWork24h} onChange={(event) => setPolicyEditor({ ...policyEditor, maxNightWork24h: event.target.value })} /></label><label className="is-checkbox"><input checked={policyEditor.includeHandover} onChange={(event) => setPolicyEditor({ ...policyEditor, includeHandover: event.target.checked })} type="checkbox" />Inclure la passation</label><label className="is-checkbox"><input checked={policyEditor.active} onChange={(event) => setPolicyEditor({ ...policyEditor, active: event.target.checked })} type="checkbox" />Politique active</label><label className="is-wide">Notes<textarea value={policyEditor.notes} onChange={(event) => setPolicyEditor({ ...policyEditor, notes: event.target.value })} /></label></div><footer><button className="is-secondary" onClick={() => setPolicyEditor(null)} type="button">Annuler</button><button disabled={saving} type="submit">Enregistrer</button></footer></form> : null}

      {dependencyForm ? <form className="planning-p13-inline-editor" onSubmit={submitDependency}><header><div><Link2 size={18} /><h3>Nouvelle dépendance</h3></div><button aria-label="Fermer l’éditeur" onClick={() => setDependencyForm(null)} type="button"><X size={16} /></button></header><div className="planning-p13-form-grid"><label>Type<select value={dependencyForm.dependencyType} onChange={(event) => setDependencyForm({ ...dependencyForm, dependencyType: event.target.value as PlanningDependencyType })}>{DEPENDENCY_TYPES.map((type) => <option key={type} value={type}>{PLANNING_DEPENDENCY_LABELS[type]}</option>)}</select></label><label className="is-wide">Source<select value={dependencyForm.predecessor} onChange={(event) => setDependencyForm({ ...dependencyForm, predecessor: event.target.value })}>{entities.map((entity) => <option key={entity.value} value={entity.value}>{entity.label}</option>)}</select></label><label className="is-wide">Cible<select value={dependencyForm.successor} onChange={(event) => setDependencyForm({ ...dependencyForm, successor: event.target.value })}>{entities.map((entity) => <option key={entity.value} value={entity.value}>{entity.label}</option>)}</select></label><label>Délai minimum (minutes)<input max="525600" min="0" required type="number" value={dependencyForm.lagMinutes} onChange={(event) => setDependencyForm({ ...dependencyForm, lagMinutes: event.target.value })} /></label><label className="is-wide">Commentaire<textarea value={dependencyForm.notes} onChange={(event) => setDependencyForm({ ...dependencyForm, notes: event.target.value })} /></label></div><footer><button className="is-secondary" onClick={() => setDependencyForm(null)} type="button">Annuler</button><button disabled={saving} type="submit">Enregistrer</button></footer></form> : null}
    </section>
  </div>;
}
