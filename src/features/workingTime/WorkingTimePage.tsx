import type { SupabaseClient } from '@supabase/supabase-js';
import { RefreshCw } from 'lucide-react';
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
import { WorkingTimeHseKpiPanel } from './WorkingTimeHseKpiPanel';
import { WorkingTimeImportWizard } from './WorkingTimeImportWizard';

interface WorkingTimePageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
  currentPerson?: CurrentPersonSummary | null;
  initialRange?: { start: string; end: string };
}

const WORK_REST_TAB: P13Tab[] = ['rest'];
const WORK_REST_NOTIFICATION_TABS: P13Tab[] = ['notifications', 'rest'];

function currentMonthRange(referenceDate: string): { start: string; end: string } {
  const [year, month] = referenceDate.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: addPlanningDays(nextMonth, -1),
  };
}

function shiftMonthRange(range: { start: string; end: string }, direction: -1 | 1) {
  const date = new Date(`${range.start}T12:00:00`);
  date.setMonth(date.getMonth() + direction, 1);
  const anchor = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  return currentMonthRange(anchor);
}

export function WorkingTimePage({ client, roles, currentPerson, initialRange }: WorkingTimePageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const effectiveCurrentPerson = currentPerson === undefined ? outletContext?.currentPerson || null : currentPerson;
  const previewMode = outletContext?.previewMode || false;
  const permissions = getPlanningPermissions(effectiveRoles);
  const usesLivePlanning = effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
  const canReceiveManagementAlerts = effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
  const referenceDate = useMemo(() => todayPlanningDate(), []);
  const previewOverview = useMemo(
    () => previewMode ? createPlanningPreviewOverview(referenceDate) : undefined,
    [previewMode, referenceDate],
  );
  const [range, setRange] = useState(() => currentMonthRange(initialRange?.start || referenceDate));
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState(0);
  const {
    overview,
    reload,
    hasLoaded,
    isInitialLoading,
    loadErrorMessage,
  } = usePlanningOverview(
    effectiveClient,
    permissions.canRead && permissions.canViewWorkRest,
    previewOverview,
    !usesLivePlanning && !previewMode,
  );
  const rangeIsValid = Boolean(range.start && range.end && range.start <= range.end);
  const changeMonth = (direction: -1 | 0 | 1) => setRange((current) => direction === 0
    ? currentMonthRange(referenceDate)
    : shiftMonthRange(current, direction));
  const refreshAll = async () => {
    setWorkspaceRefreshToken((value) => value + 1);
    await reload();
  };

  if (!permissions.canRead || !permissions.canViewWorkRest) {
    return <section className="working-time-page"><div className="admin-state">Vous n’avez pas accès au suivi du temps de travail.</div></section>;
  }

  return (
    <section className="working-time-page">
      <h1 className="sr-only">Suivi du Temps de Travail</h1>

      {!rangeIsValid ? <p className="working-time-message is-error" role="alert">La date de fin doit être postérieure ou égale à la date de début.</p> : null}
      {loadErrorMessage ? <p className="working-time-message is-error" role="alert">{loadErrorMessage}</p> : null}
      {isInitialLoading ? <div className="admin-state" role="status"><RefreshCw aria-hidden="true" className="is-spinning" size={18} />Chargement des données de travail et repos…</div> : null}

      {rangeIsValid ? (
        <WorkingTimeWorkflowPanel
          client={effectiveClient}
          currentPerson={effectiveCurrentPerson}
          previewMode={previewMode}
          range={range}
          refreshToken={workspaceRefreshToken}
          onMonthChange={changeMonth}
          onRefresh={refreshAll}
          roles={effectiveRoles}
        />
      ) : null}

      {rangeIsValid && effectiveRoles.some((role) => role === 'admin' || role === 'armement') ? (
        <WorkingTimeImportWizard client={effectiveClient} onImported={refreshAll} roles={effectiveRoles} />
      ) : null}

      {rangeIsValid && effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement' || role === 'capitaine') ? (
        <div id="working-time-hse"><WorkingTimeHseKpiPanel client={effectiveClient} range={range} roles={effectiveRoles} /></div>
      ) : null}

      {hasLoaded && rangeIsValid ? (
        <div id="working-time-p13"><PlanningP13Panel
          canManageDependencies={false}
          canManageWorkRestPolicies={permissions.canManageWorkRestPolicies}
          canRefreshNotifications={canReceiveManagementAlerts}
          canViewDashboard={false}
          canViewNotifications={canReceiveManagementAlerts}
          canViewWorkRest={permissions.canViewWorkRest}
          client={effectiveClient}
          initialTab="rest"
          onAuditChange={async () => { await reload(); }}
          overview={overview}
          presentation="page"
          range={range}
          subtitle="Seuils administrés, contrôles sur 24 heures et 7 jours, repos consécutif, fractionnement et travail de nuit."
          title="Contrôles travail et repos"
          visibleTabs={canReceiveManagementAlerts ? WORK_REST_NOTIFICATION_TABS : WORK_REST_TAB}
        /></div>
      ) : null}
    </section>
  );
}
