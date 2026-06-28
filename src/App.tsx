import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { ModulePage } from './features/modules/ModulePage';
import { APP_MODULES } from './features/permissions/moduleAccess';
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
            <Route key={module.key} path={`modules/${module.key}`} element={<ModulePage module={module} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
