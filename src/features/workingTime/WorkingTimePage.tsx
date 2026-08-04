import type { SupabaseClient } from '@supabase/supabase-js';
import { Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import { addPlanningDays, todayPlanningDate } from '../planning/planningDates';
import { getPlanningPermissions } from '../planning/planningPermissions';
import { PlanningP13Panel, type P13Tab } from '../planning/PlanningP13Panel';
import { createPlanningPreviewOverview } from '../planning/planningPreviewData';
import { usePlanningOverview } from '../planning/usePlanningOverview';
import type { CurrentPersonSummary } from '../profiles/profileQueries';
import type { AppShellOutletContext } from '../shell/AppShell';
import { WorkingTimeWorkflowPanel } from './WorkingTimeWorkflowPanel';

interface WorkingTimePageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
  currentPerson?: CurrentPersonSummary | null;
  initialRange?: { start: string; end: string };
}

const WORK_REST_TAB: P13Tab[] = ['rest'];

function currentMonthRange(referenceDate: string): { start: string; end: string } {
  const [year, month] = referenceDate.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: addPlanningDays(nextMonth, -1),
  };
}

export function WorkingTimePage({ client, roles, currentPerson, initialRange }: WorkingTimePageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const effectiveCurrentPerson = currentPerson === undefined ? outletContext?.currentPerson || null : currentPerson;
  const previewMode = outletContext?.previewMode || false;
  const permissions = getPlanningPermissions(effectiveRoles);
  const usesLivePlanning = effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
  const referenceDate = useMemo(() => todayPlanningDate(), []);
  const previewOverview = useMemo(
    () => previewMode ? createPlanningPreviewOverview(referenceDate) : undefined,
    [previewMode, referenceDate],
  );
  const [range, setRange] = useState(() => initialRange || currentMonthRange(referenceDate));
  const {
    overview,
    reload,
    hasLoaded,
    isInitialLoading,
    isRefreshing,
    loadErrorMessage,
  } = usePlanningOverview(
    effectiveClient,
    permissions.canRead && permissions.canViewWorkRest,
    previewOverview,
    !usesLivePlanning && !previewMode,
  );
  const rangeIsValid = Boolean(range.start && range.end && range.start <= range.end);

  if (!permissions.canRead || !permissions.canViewWorkRest) {
    return <section className="working-time-page"><div className="admin-state">Vous n’avez pas accès au suivi du temps de travail.</div></section>;
  }

  return (
    <section className="working-time-page">
      <header className="working-time-header">
        <div className="working-time-heading">
          <span className="working-time-heading-icon"><Clock3 aria-hidden="true" size={24} /></span>
          <div>
            <p>Ressources Humaines</p>
            <h1>Suivi du Temps de Travail</h1>
            <span>Contrôles de travail et de repos issus du moteur Planning P1.3.</span>
          </div>
        </div>
        <div aria-label="Période analysée" className="working-time-range" role="group">
          <label>Du<input onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} type="date" value={range.start} /></label>
          <label>Au<input min={range.start} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} type="date" value={range.end} /></label>
          <button aria-label="Actualiser le suivi" disabled={isInitialLoading || isRefreshing} onClick={() => void reload()} type="button">
            <RefreshCw aria-hidden="true" className={isRefreshing ? 'is-spinning' : ''} size={17} />
            Actualiser
          </button>
        </div>
      </header>

      <aside className="working-time-foundation-note">
        <ShieldCheck aria-hidden="true" size={19} />
        <p><strong>Socle partagé avec le Planning.</strong> Les politiques, seuils et calculs affichés ici sont ceux de <code>planning_work_rest_policies</code> et du moteur P1.3.</p>
      </aside>

      {!rangeIsValid ? <p className="working-time-message is-error" role="alert">La date de fin doit être postérieure ou égale à la date de début.</p> : null}
      {loadErrorMessage ? <p className="working-time-message is-error" role="alert">{loadErrorMessage}</p> : null}
      {isInitialLoading ? <div className="admin-state" role="status"><RefreshCw aria-hidden="true" className="is-spinning" size={18} />Chargement des données de travail et repos…</div> : null}

      {rangeIsValid ? (
        <WorkingTimeWorkflowPanel
          client={effectiveClient}
          currentPerson={effectiveCurrentPerson}
          previewMode={previewMode}
          range={range}
          roles={effectiveRoles}
        />
      ) : null}

      {hasLoaded && rangeIsValid ? (
        <PlanningP13Panel
          canManageDependencies={false}
          canManageWorkRestPolicies={permissions.canManageWorkRestPolicies}
          canRefreshNotifications={false}
          canViewDashboard={false}
          canViewNotifications={false}
          canViewWorkRest={permissions.canViewWorkRest}
          client={effectiveClient}
          initialTab="rest"
          onAuditChange={async () => { await reload(); }}
          overview={overview}
          presentation="page"
          range={range}
          subtitle="Seuils administrés, contrôles sur 24 heures et 7 jours, repos consécutif, fractionnement et travail de nuit."
          title="Contrôles travail et repos"
          visibleTabs={WORK_REST_TAB}
        />
      ) : null}
    </section>
  );
}
