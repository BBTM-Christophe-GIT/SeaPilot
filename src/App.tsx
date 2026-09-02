import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ActionPlanPage } from './features/actionPlan/ActionPlanPage';
import { AdminPage } from './features/admin/AdminPage';
import { LoginPage } from './features/auth/LoginPage';
import { PasswordUpdatePage } from './features/auth/PasswordUpdatePage';
import { RequireAuth } from './features/auth/RequireAuth';
import { DprPage } from './features/dpr/DprPage';
import { FleetCertificatesPage } from './features/fleetCertificates/FleetCertificatesPage';
import { FleetPage } from './features/fleet/FleetPage';
import { HumanResourcesPage } from './features/humanResources/HumanResourcesPage';
import { ModulePage } from './features/modules/ModulePage';
import { APP_MODULES } from './features/permissions/moduleAccess';
import { PlanningPage } from './features/planning/PlanningPage';
import { isSeaPilotPreviewDeployment } from './features/preview/previewMode';
import { previewSupabaseClient } from './features/preview/previewSupabaseClient';
import { ProceduresPage } from './features/procedures/ProceduresPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { PurchaseRequestsPage } from './features/purchaseRequests/PurchaseRequestsPage';
import { QhseDocumentsPage } from './features/qhseDocuments/QhseDocumentsPage';
import { ServiceProvidersPage } from './features/serviceProviders/ServiceProvidersPage';
import { ServiceNotesPage } from './features/serviceNotes/ServiceNotesPage';
import { AppShell } from './features/shell/AppShell';
import type { RoleKey } from './features/permissions/roles';

const WorkingTimePage = lazy(() => import('./features/workingTime/WorkingTimePage').then((module) => ({ default: module.WorkingTimePage })));
const KpiPage = lazy(() => import('./features/kpi/KpiPage').then((module) => ({ default: module.KpiPage })));
const HomePage = lazy(() => import('./features/home/HomePage').then((module) => ({ default: module.HomePage })));
const BillingElementsPage = lazy(() => import('./features/projects/BillingElementsPage').then((module) => ({ default: module.BillingElementsPage })));

interface AppProps {
  previewModeOverride?: boolean;
}

export default function App({ previewModeOverride }: AppProps) {
  const previewMode = previewModeOverride ?? isSeaPilotPreviewDeployment();
  const previewRoles: RoleKey[] | undefined = previewMode ? ['admin'] : undefined;

  return (
    <Routes>
      <Route path="/login" element={previewMode ? <Navigate to="/modules/planning" replace /> : <LoginPage />} />
      <Route
        path="/auth/update-password"
        element={previewMode ? <Navigate to="/modules/planning" replace /> : <PasswordUpdatePage />}
      />
      <Route element={<RequireAuth allowPreview={previewMode} />}>
        <Route
          element={
            <AppShell
              client={previewMode ? previewSupabaseClient : undefined}
              previewMode={previewMode}
              rolesOverride={previewRoles}
            />
          }
        >
          <Route index element={<Suspense fallback={<div className="admin-state" role="status">Chargement de votre accueil…</div>}><HomePage /></Suspense>} />
          {APP_MODULES.filter((module) => module.key !== 'home').map((module) => (
            <Route
              key={module.key}
              path={`modules/${module.key}`}
              element={
                module.key === 'admin' ? (
                  <AdminPage client={previewMode ? previewSupabaseClient : undefined} />
                ) : module.key === 'kpi' ? (
                  <Suspense fallback={<div className="admin-state" role="status">Chargement des indicateurs HSE…</div>}><KpiPage /></Suspense>
                ) : module.key === 'actionPlan' ? (
                  <ActionPlanPage />
                ) : module.key === 'dpr' ? (
                  <DprPage />
                ) : module.key === 'certificates' ? (
                  <FleetCertificatesPage />
                ) : module.key === 'planning' ? (
                  <PlanningPage />
                ) : module.key === 'fleet' ? (
                  <FleetPage />
                ) : module.key === 'humanResources' ? (
                  <HumanResourcesPage />
                ) : module.key === 'workingTime' ? (
                  <Suspense fallback={<div className="admin-state" role="status">Chargement du suivi du temps de travail…</div>}><WorkingTimePage /></Suspense>
                ) : module.key === 'procedures' ? (
                  <ProceduresPage />
                ) : module.key === 'serviceNotes' ? (
                  <ServiceNotesPage />
                ) : module.key === 'projects' ? (
                  <ProjectsPage />
                ) : module.key === 'billingElements' ? (
                  <Suspense fallback={<div className="admin-state" role="status">Chargement des éléments de facturation…</div>}><BillingElementsPage /></Suspense>
                ) : module.key === 'purchaseRequests' ? (
                  <PurchaseRequestsPage />
                ) : module.key === 'serviceProviders' ? (
                  <ServiceProvidersPage />
                ) : module.key === 'qhse' ? (
                  <QhseDocumentsPage />
                ) : (
                  <ModulePage module={module} />
                )
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
