import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Database,
  FlaskConical,
  Gauge,
  RefreshCw,
  Scale,
  ShieldCheck,
  Ship,
  Unplug,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPlanningDate, formatPlanningPerson } from './planningModel';
import { planningErrorMessage } from './planningErrors';
import type { PlanningAssistantAccess } from './planningP21';
import {
  analyzePlanningP22DataQuality,
  buildPlanningP22SailorLoads,
  buildPlanningP22TensionWindows,
  buildPlanningP22VesselLoads,
  simulatePlanningP22Scenario,
  type PlanningP22DataQualityReport,
  type PlanningP22Readiness,
  type PlanningP22ScenarioInput,
} from './planningP22';
import { fetchPlanningP13Data } from './planningP13Queries';
import type { PlanningDateRange, PlanningP13Data } from './planningP13';
import type { PlanningOverview } from './planningQueries';

type PanelTab = 'projections' | 'scenarios' | 'quality' | 'integrations';

const EMPTY_DATA: PlanningP13Data = {
  policies: [], notifications: [], dependencies: [],
  p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
};

const READINESS_LABELS: Record<PlanningP22Readiness, string> = {
  ready: 'Suffisant',
  limited: 'Limité',
  blocked: 'Insuffisant',
};

function EvidenceGroup({ title, values }: { title: string; values: string[] }) {
  return <section><h4>{title}</h4>{values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Aucun élément.</p>}</section>;
}

function ReadinessBadge({ status }: { status: PlanningP22Readiness }) {
  return <span className={`planning-p22-readiness is-${status}`}>{READINESS_LABELS[status]}</span>;
}

function QualitySummary({ report }: { report: PlanningP22DataQualityReport }) {
  const ready = report.features.filter((feature) => feature.status === 'ready').length;
  const limited = report.features.filter((feature) => feature.status === 'limited').length;
  const blocked = report.features.filter((feature) => feature.status === 'blocked').length;
  return <div className="planning-p22-summary">
    <div><strong>{ready}</strong><span>fonction(s) étayée(s)</span></div>
    <div><strong>{limited}</strong><span>fonction(s) bornée(s)</span></div>
    <div><strong>{blocked}</strong><span>fonction(s) non développée(s)</span></div>
  </div>;
}

function ScenarioResult({ result }: { result: NonNullable<ReturnType<typeof simulatePlanningP22Scenario>> }) {
  return <div className="planning-p22-scenario-result">
    <header><div><Scale aria-hidden="true" size={20} /><span><h3>{result.title}</h3><small>Confiance {result.confidence.level === 'medium' ? 'moyenne' : 'faible'} · {result.confidence.score}%</small></span></div><span>Validation humaine obligatoire</span></header>
    <div className="planning-p22-comparison">
      {result.metrics.map((metric) => <article key={metric.key}><small>{metric.evidenceKind === 'fact' ? 'Fait' : metric.evidenceKind === 'rule' ? 'Règle' : 'Estimation'}</small><strong>{metric.label}</strong><div><span>Plan actuel <b>{metric.baseline}</b></span><span>Scénario <b>{metric.scenario}</b></span><span className={metric.delta > 0 ? 'is-negative' : metric.delta < 0 ? 'is-positive' : ''}>Δ {metric.delta > 0 ? '+' : ''}{metric.delta} {metric.unit}</span></div></article>)}
    </div>
    <div className="planning-p22-evidence-grid">
      <EvidenceGroup title="Faits observés" values={result.facts} />
      <EvidenceGroup title="Règles appliquées" values={result.rules} />
      <EvidenceGroup title="Estimations" values={result.estimates} />
      <EvidenceGroup title="Données utilisées" values={result.dataUsed} />
      <EvidenceGroup title="Hypothèses" values={result.assumptions} />
      <EvidenceGroup title="Limites" values={result.limits} />
    </div>
    <div className="planning-p22-alternatives"><h3>Plans alternatifs à arbitrer</h3>{result.alternatives.map((alternative) => <article key={alternative.key}><h4>{alternative.label}</h4><p>{alternative.description}</p><div><EvidenceGroup title="Bénéfices potentiels" values={alternative.benefits} /><EvidenceGroup title="Risques" values={alternative.risks} /></div></article>)}</div>
    <div className="planning-p22-no-apply" role="note"><ShieldCheck aria-hidden="true" size={18} /><span><strong>Aucun plan n’a été appliqué.</strong> La comparaison reste locale à cette session ; toute modification doit être saisie et validée dans les workflows P0/P1.</span></div>
  </div>;
}

export function PlanningP22Panel({
  client,
  overview,
  range,
  access,
  onClose,
}: {
  client: SupabaseClient;
  overview: PlanningOverview;
  range: PlanningDateRange;
  access: PlanningAssistantAccess;
  onClose: () => void;
}) {
  const activePeople = useMemo(() => overview.people.filter((person) => person.active), [overview.people]);
  const activeVessels = useMemo(() => overview.vessels.filter((vessel) => vessel.active), [overview.vessels]);
  const [tab, setTab] = useState<PanelTab>('projections');
  const [data, setData] = useState<PlanningP13Data>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [scenario, setScenario] = useState<PlanningP22ScenarioInput>(() => ({
    kind: 'absence', personId: activePeople[0]?.id || null, vesselId: activeVessels[0]?.id || null,
    startsOn: range.start, endsOn: range.end,
  }));

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await fetchPlanningP13Data(client));
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(planningErrorMessage(error, 'Impossible de charger les sources P2.2.'));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void fetchPlanningP13Data(client)
      .then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setErrorMessage(planningErrorMessage(error, 'Impossible de charger les sources P2.2.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [client]);

  const quality = useMemo(() => analyzePlanningP22DataQuality(overview, data, range), [data, overview, range]);
  const vesselLoads = useMemo(() => buildPlanningP22VesselLoads(overview, range), [overview, range]);
  const sailorLoads = useMemo(() => buildPlanningP22SailorLoads(overview, data, range), [data, overview, range]);
  const tensionWindows = useMemo(() => buildPlanningP22TensionWindows(overview, data, range), [data, overview, range]);
  const scenarioResult = useMemo(() => simulatePlanningP22Scenario(overview, data, range, scenario), [data, overview, range, scenario]);

  return <div className="planning-dialog-backdrop is-side-panel" role="presentation">
    <section aria-label="Prévisions et scénarios Planning" aria-modal="true" className="planning-dialog planning-p22-panel" role="dialog">
      <header className="planning-p22-header"><div><Gauge aria-hidden="true" size={22} /><span><h2>Prévisions et scénarios P2.2</h2><small>Projection déterministe · aucune décision automatique</small></span></div><button aria-label="Fermer les prévisions" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
      <div className="planning-p22-guardrail" role="note"><ShieldCheck aria-hidden="true" size={18} /><span><strong>Modèles bornés aux données fiables.</strong> Faits, règles et estimations sont séparés ; les fonctions insuffisamment étayées restent désactivées.</span><small>{access.accessMode === 'administrator' ? 'Accès administrateur' : 'Accès pilote'}</small></div>
      <nav aria-label="Sections des prévisions" className="planning-p22-tabs">
        <button aria-current={tab === 'projections' ? 'page' : undefined} onClick={() => setTab('projections')} type="button"><BarChart3 aria-hidden="true" size={16} />Projections</button>
        <button aria-current={tab === 'scenarios' ? 'page' : undefined} onClick={() => setTab('scenarios')} type="button"><FlaskConical aria-hidden="true" size={16} />Scénarios</button>
        <button aria-current={tab === 'quality' ? 'page' : undefined} onClick={() => setTab('quality')} type="button"><Database aria-hidden="true" size={16} />Qualité des données</button>
        <button aria-current={tab === 'integrations' ? 'page' : undefined} onClick={() => setTab('integrations')} type="button"><Unplug aria-hidden="true" size={16} />Intégrations</button>
        <button aria-label="Actualiser les prévisions" className="is-refresh" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw aria-hidden="true" size={16} /></button>
      </nav>
      {errorMessage ? <div className="planning-feedback is-error" role="alert">{errorMessage}</div> : null}
      {isLoading ? <div className="admin-state" role="status">Analyse des sources Planning…</div> : null}

      {!isLoading && tab === 'projections' ? <div className="planning-p22-content">
        <QualitySummary report={quality} />
        <section className="planning-p22-section"><header><div><AlertTriangle aria-hidden="true" size={18} /><span><h3>Périodes de tension planifiée</h3><small>Estimation explicite sur {formatPlanningDate(range.start)}–{formatPlanningDate(range.end)}</small></span></div><ReadinessBadge status={quality.features.find((feature) => feature.key === 'tension')?.status || 'blocked'} /></header>
          {tensionWindows.length ? <div className="planning-p22-tensions">{tensionWindows.map((window) => <article key={`${window.startsOn}:${window.endsOn}`}><header><strong>{formatPlanningDate(window.startsOn)}{window.endsOn !== window.startsOn ? ` → ${formatPlanningDate(window.endsOn)}` : ''}</strong><span>Pic {window.peakScore} · confiance {window.confidence === 'medium' ? 'moyenne' : 'faible'}</span></header><div><span>{window.operationalEvents} opération(s)</span><span>{window.unavailableVessels} indisponibilité(s)</span><span>{window.crewMovements} mouvement(s)</span><span>{window.conflicts} conflit(s)</span></div><details><summary>Voir hypothèses et limites</summary><EvidenceGroup title="Faits" values={window.facts} /><EvidenceGroup title="Hypothèses" values={window.assumptions} /><EvidenceGroup title="Limites" values={window.limits} /></details></article>)}</div> : <div className="admin-state">Aucune période ne franchit le seuil explicite sur le programme chargé.</div>}
        </section>
        <section className="planning-p22-section"><header><div><Ship aria-hidden="true" size={18} /><span><h3>Charge planifiée par navire</h3><small>Jours calendaires uniques, sans extrapolation</small></span></div><ReadinessBadge status={quality.features.find((feature) => feature.key === 'vessel_load')?.status || 'blocked'} /></header>
          <div className="planning-p22-table-wrap"><table><thead><tr><th>Navire</th><th>Charge</th><th>Opération</th><th>Transit</th><th>Maintenance</th><th>Indispo.</th><th>Affectations</th></tr></thead><tbody>{vesselLoads.map((load) => <tr key={load.vesselId}><th>{load.vesselName}</th><td><strong>{load.plannedLoadPercent}%</strong><small>{load.scheduledDays} j / {range.end && range.start ? Math.min(400, Math.max(0, Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000) + 1)) : 0} j</small></td><td>{load.operationDays} j</td><td>{load.transitDays} j</td><td>{load.maintenanceDays} j</td><td>{load.unavailableDays} j</td><td>{load.assignmentDays} j</td></tr>)}</tbody></table></div>
        </section>
        <section className="planning-p22-section"><header><div><Users aria-hidden="true" size={18} /><span><h3>Charge planifiée par marin</h3><small>Affectations connues, absences validées et journées enregistrées</small></span></div><ReadinessBadge status={quality.features.find((feature) => feature.key === 'sailor_load')?.status || 'blocked'} /></header>
          {sailorLoads.length ? <div className="planning-p22-table-wrap"><table><thead><tr><th>Marin</th><th>Charge affectée</th><th>Jours affectés</th><th>Absence</th><th>Journées source</th><th>Chevauchements</th></tr></thead><tbody>{sailorLoads.slice(0, 100).map((load) => <tr key={load.personId}><th>{load.personName}</th><td><strong>{load.plannedLoadPercent}%</strong></td><td>{load.assignedDays}</td><td>{load.absenceDays}</td><td>{load.recordedWorkDays}</td><td>{load.overlapCount}</td></tr>)}</tbody></table></div> : <div className="admin-state">Aucune charge marin démontrable sur la période.</div>}
        </section>
      </div> : null}

      {!isLoading && tab === 'scenarios' ? <div className="planning-p22-content">
        <form className="planning-p22-scenario-form" onSubmit={(event) => event.preventDefault()}>
          <label>Scénario<select aria-label="Type de scénario" onChange={(event) => setScenario((current) => ({ ...current, kind: event.target.value as PlanningP22ScenarioInput['kind'] }))} value={scenario.kind}><option value="absence">Absence d’un marin</option><option value="vessel_unavailability">Immobilisation d’un navire</option></select></label>
          {scenario.kind === 'absence' ? <label>Marin<select aria-label="Marin simulé" onChange={(event) => setScenario((current) => ({ ...current, personId: Number(event.target.value) || null }))} value={scenario.personId || ''}><option value="">Choisir</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{formatPlanningPerson(person)}</option>)}</select></label> : <label>Navire<select aria-label="Navire simulé" onChange={(event) => setScenario((current) => ({ ...current, vesselId: Number(event.target.value) || null }))} value={scenario.vesselId || ''}><option value="">Choisir</option>{activeVessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>}
          <label>Début<input aria-label="Début du scénario" onChange={(event) => setScenario((current) => ({ ...current, startsOn: event.target.value }))} type="date" value={scenario.startsOn} /></label>
          <label>Fin<input aria-label="Fin du scénario" min={scenario.startsOn} onChange={(event) => setScenario((current) => ({ ...current, endsOn: event.target.value }))} type="date" value={scenario.endsOn} /></label>
        </form>
        {scenarioResult ? <ScenarioResult result={scenarioResult} /> : <div className="admin-state">Sélectionnez une cible et une période cohérente pour comparer les plans.</div>}
      </div> : null}

      {!isLoading && tab === 'quality' ? <div className="planning-p22-content">
        <QualitySummary report={quality} />
        <div className="planning-p22-quality-finding"><Database aria-hidden="true" size={20} /><span><strong>Conclusion</strong>{quality.overallFinding}</span></div>
        <section className="planning-p22-section"><header><div><CheckCircle2 aria-hidden="true" size={18} /><span><h3>Contrôles de qualité</h3><small>Complétude, volume, intégrité et aptitude à l’usage</small></span></div></header><div className="planning-p22-quality-list">{quality.checks.map((check) => <article key={check.key}><header><strong>{check.label}</strong><ReadinessBadge status={check.status} /></header><p>{check.observed}</p><small>{check.finding}</small><em>{check.impact}</em>{check.completeness !== null ? <div><span style={{ width: `${Math.max(0, Math.min(100, check.completeness))}%` }} /></div> : null}</article>)}</div></section>
        <section className="planning-p22-section"><header><div><Database aria-hidden="true" size={18} /><span><h3>Sources chargées</h3><small>Comptages exacts dans le périmètre RLS de l’utilisateur</small></span></div></header><div className="planning-p22-source-grid">{quality.sourceCounts.map((source) => <article key={source.source}><strong>{source.count}</strong><span>{source.label}</span><small>{source.source}</small></article>)}</div></section>
        <section className="planning-p22-section"><header><div><Gauge aria-hidden="true" size={18} /><span><h3>Aptitude fonctionnelle</h3><small>Une fonction insuffisante reste volontairement non développée</small></span></div></header><div className="planning-p22-feature-list">{quality.features.map((feature) => <article key={feature.key}><ReadinessBadge status={feature.status} /><span><strong>{feature.label}</strong><small>{feature.reason}</small></span></article>)}</div></section>
      </div> : null}

      {!isLoading && tab === 'integrations' ? <div className="planning-p22-content planning-p22-integrations">
        <article className="is-limited"><CalendarRange aria-hidden="true" size={22} /><span><header><h3>Calendrier sortant</h3><ReadinessBadge status="limited" /></header><p>L’export ICS P1.3 reste disponible pour le Planning validé. Aucun abonnement bidirectionnel ni import calendrier n’est créé en P2.2.</p><small>Limite : absence de contrat CalDAV/Microsoft 365/Google Calendar et de stratégie de résolution des doublons.</small></span></article>
        <article className={quality.checks.find((check) => check.key === 'hr_documents')?.status === 'ready' ? 'is-ready' : 'is-limited'}><Users aria-hidden="true" size={22} /><span><header><h3>RH interne</h3><ReadinessBadge status={quality.checks.find((check) => check.key === 'hr_documents')?.status || 'blocked'} /></header><p>Les profils et documents RH internes alimentent les contrôles de scénarios et l’explication des limites.</p><small>Limite : aucun connecteur SIRH externe ni synchronisation de référentiel n’est configuré.</small></span></article>
        <article className={quality.checks.find((check) => check.key === 'maintenance_history')?.status === 'ready' ? 'is-ready' : 'is-limited'}><Ship aria-hidden="true" size={22} /><span><header><h3>Maintenance interne</h3><ReadinessBadge status={quality.checks.find((check) => check.key === 'maintenance_history')?.status || 'blocked'} /></header><p>Les événements maintenance du Planning sont pris en compte dans la charge et les simulations d’immobilisation.</p><small>Limite : aucun CMMS, équipement, capacité technique ou ordre de travail externe n’est disponible.</small></span></article>
        <article className="is-blocked"><Unplug aria-hidden="true" size={22} /><span><header><h3>Hors connexion persistant</h3><ReadinessBadge status="blocked" /></header><p>Les calculs restent utilisables pendant la session une fois les données chargées, sans stockage persistant local.</p><small>Blocage : aucune politique de cache chiffré, durée de conservation ou fusion des changements.</small></span></article>
      </div> : null}
    </section>
  </div>;
}
