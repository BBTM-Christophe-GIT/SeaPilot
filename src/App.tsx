import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminPage } from './features/admin/AdminPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { FleetCertificatesPage } from './features/fleetCertificates/FleetCertificatesPage';
import { HumanResourcesPage } from './features/humanResources/HumanResourcesPage';
import { ModulePage } from './features/modules/ModulePage';
import { APP_MODULES } from './features/permissions/moduleAccess';
import { PlanningPage } from './features/planning/PlanningPage';
import { ProceduresPage } from './features/procedures/ProceduresPage';
import { AppShell } from './features/shell/AppShell';

export default function App() {
  const homeModule = APP_MODULES.find((module) => module.key === 'home');

  if (!homeModule) {
    throw new Error('Home module is missing');
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<ModulePage module={homeModule} />} />
          {APP_MODULES.filter((module) => module.key !== 'home').map((module) => (
            <Route
              key={module.key}
              path={`modules/${module.key}`}
              element={
                module.key === 'admin' ? (
                  <AdminPage />
                ) : module.key === 'certificates' ? (
                  <FleetCertificatesPage />
                ) : module.key === 'planning' ? (
                  <PlanningPage />
                ) : module.key === 'humanResources' ? (
                  <HumanResourcesPage />
                ) : module.key === 'procedures' ? (
                  <ProceduresPage />
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
