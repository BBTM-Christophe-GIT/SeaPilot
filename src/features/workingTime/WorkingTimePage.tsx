import type { SupabaseClient } from '@supabase/supabase-js';
import { RefreshCw, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
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
import { WorkingTimeComplianceReport } from './WorkingTimeComplianceReport';
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

type WorkingTimeModalKey = 'import' | 'hse' | 'report' | 'workRest';

function WorkingTimeModal({ children, onClose, subtitle, title }: {
  children: ReactNode;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div
      className="working-time-modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section aria-label={title} aria-modal="true" className="working-time-modal" role="dialog">
        <header className="working-time-modal-header">
          <div><span>Suivi du temps de travail</span><h2>{title}</h2><p>{subtitle}</p></div>
          <button aria-label={`Fermer la fenêtre ${title}`} onClick={onClose} type="button"><X aria-hidden="true" size={21} /></button>
        </header>
        <div className="working-time-modal-body">{children}</div>
      </section>
    </div>
  );
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
  const [activeModal, setActiveModal] = useState<WorkingTimeModalKey | null>(null);
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
  const canImport = effectiveRoles.includes('admin');
  const canViewHse = effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement' || role === 'capitaine');
  const canViewComplianceReport = effectiveRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
  const changeMonth = (direction: -1 | 0 | 1) => setRange((current) => direction === 0
    ? currentMonthRange(referenceDate)
    : shiftMonthRange(current, direction));
  const refreshAll = async () => {
    setWorkspaceRefreshToken((value) => value + 1);
    await reload();
  };

  useEffect(() => {
    if (!activeModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveModal(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal]);

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
          onOpenHse={canViewHse ? () => setActiveModal('hse') : undefined}
          onOpenImport={canImport ? () => setActiveModal('import') : undefined}
          onOpenReport={canViewComplianceReport ? () => setActiveModal('report') : undefined}
          onOpenWorkRest={hasLoaded ? () => setActiveModal('workRest') : undefined}
          onRefresh={refreshAll}
          roles={effectiveRoles}
        />
      ) : null}

      {activeModal === 'import' && canImport && rangeIsValid ? (
        <WorkingTimeModal
          onClose={() => setActiveModal(null)}
          subtitle="Importez un registre annuel approuvé sans exécuter les macros du classeur."
          title="Import annuel XLSM"
        >
          <WorkingTimeImportWizard client={effectiveClient} onImported={refreshAll} roles={effectiveRoles} />
        </WorkingTimeModal>
      ) : null}

      {activeModal === 'hse' && canViewHse && rangeIsValid ? (
        <WorkingTimeModal
          onClose={() => setActiveModal(null)}
          subtitle="Analysez les heures d’exposition et les indicateurs de sécurité."
          title="Exposition HSE / IMCA"
        >
          <WorkingTimeHseKpiPanel client={effectiveClient} range={range} roles={effectiveRoles} />
        </WorkingTimeModal>
      ) : null}

      {activeModal === 'report' && canViewComplianceReport ? (
        <WorkingTimeModal
          onClose={() => setActiveModal(null)}
          subtitle="Consolidez les indicateurs, les non-conformités et l’analyse sur le périmètre choisi."
          title="Rapport de conformité"
        >
          <WorkingTimeComplianceReport client={effectiveClient} initialYear={Number(range.start.slice(0, 4))} />
        </WorkingTimeModal>
      ) : null}

      {activeModal === 'workRest' && hasLoaded && rangeIsValid ? (
        <WorkingTimeModal
          onClose={() => setActiveModal(null)}
          subtitle="Consultez les contrôles, politiques et alertes issus du moteur Planning P1.3."
          title="Contrôles travail et repos"
        >
          <PlanningP13Panel
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
          />
        </WorkingTimeModal>
      ) : null}
    </section>
  );
}
