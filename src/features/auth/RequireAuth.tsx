import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { isLoading, session } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="auth-loading">Chargement...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
