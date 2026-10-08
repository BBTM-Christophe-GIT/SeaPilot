import { useOutletContext } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ManagerHomeDashboard } from './ManagerHomeDashboard';
import { QhsePolicyHomeCard } from '../qhsePolicy/QhsePolicyHomeCard';

export function HomePage() {
  const { roles, client, currentPerson, visibleModules } = useOutletContext<AppShellOutletContext>();
  return (
    <ManagerHomeDashboard
      client={client}
      firstName={currentPerson?.firstName.trim() || ''}
      personId={currentPerson?.id ?? null}
      roles={roles}
    >
      {(!visibleModules || visibleModules.some((module) => module.key === 'qhsePolicy')) ? <QhsePolicyHomeCard client={client} /> : null}
    </ManagerHomeDashboard>
  );
}
