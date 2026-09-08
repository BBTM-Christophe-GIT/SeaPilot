import { useOutletContext } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ManagerHomeDashboard } from './ManagerHomeDashboard';

export function HomePage() {
  const { roles, client, currentPerson } = useOutletContext<AppShellOutletContext>();
  return (
    <ManagerHomeDashboard
      client={client}
      firstName={currentPerson?.firstName.trim() || ''}
      personId={currentPerson?.id ?? null}
      roles={roles}
    />
  );
}
