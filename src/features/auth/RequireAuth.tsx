import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

interface RequireAuthProps {
  allowPreview?: boolean;
}

export function RequireAuth({ allowPreview = false }: RequireAuthProps) {
  const { isLoading, session } = useAuth();
  const location = useLocation();

  if (allowPreview) {
    return <Outlet />;
  }

  if (isLoading) {
    return <div className="auth-loading">Chargement...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
