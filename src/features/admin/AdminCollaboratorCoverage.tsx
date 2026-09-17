import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { fetchAdminCollaborators, mapAdminCollaborators, type AdminCollaboratorRow } from './adminCollaborators';
import type { AdminUser } from './adminQueries';
import './adminCollaborators.css';

interface AdminCollaboratorCoverageProps {
  client: SupabaseClient;
  users: AdminUser[];
}

export function AdminCollaboratorCoverage({ client, users }: AdminCollaboratorCoverageProps) {
  const [people, setPeople] = useState<AdminCollaboratorRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'account' | 'email'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  // Refresh HR links after invitations or account deletion, but not role edits.
  const accountKeys = JSON.stringify(users.map(({ id, email }) => [id, email]));

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    fetchAdminCollaborators(client)
      .then((rows) => { if (!cancelled) setPeople(rows); })
      .catch(() => { if (!cancelled) setHasError(true); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [client, accountKeys]);

  const collaborators = mapAdminCollaborators(people, users);
  const missingAccount = collaborators.filter((person) => !person.hasAccount);
  const missingEmail = collaborators.filter((person) => !person.hasBbtmEmail);
  const all = collaborators.filter((person) => !person.hasAccount || !person.hasBbtmEmail);
  const visible = filter === 'account' ? missingAccount : filter === 'email' ? missingEmail : all;
  const filters = [
    { key: 'all', label: 'Tous les cas', count: all.length },
    { key: 'account', label: 'Sans compte SeaPilot', count: missingAccount.length },
    { key: 'email', label: 'Sans adresse @bbtm.fr', count: missingEmail.length },
  ] as const;

  return (
    <section className="admin-panel admin-collaborators" aria-labelledby="admin-collaborators-title">
      <div>
        <h2 id="admin-collaborators-title">Collaborateurs sans compte ou sans adresse BBTM</h2>
        <p className="admin-section-description">
          Collaborateurs en poste, y compris ceux sans adresse email.
        </p>
      </div>
      {isLoading ? <p role="status">Chargement des collaborateurs…</p> : hasError ? (
        <p className="form-error" role="alert">Impossible de charger les collaborateurs. Rechargez la page pour réessayer.</p>
      ) : (
        <>
          <div className="admin-collaborator-filters" role="group" aria-label="Filtrer les collaborateurs">
            {filters.map(({ key, label, count }) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label} <strong>{count}</strong>
              </button>
            ))}
          </div>
          <p className="admin-collaborator-count" role="status">{visible.length} collaborateur(s) affiché(s)</p>
          {visible.length === 0 ? <p className="admin-state">Aucun collaborateur dans cette catégorie.</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-collaborator-table" aria-label="Collaborateurs sans compte ou sans adresse BBTM">
                <thead>
                  <tr>
                    <th scope="col">Collaborateur</th>
                    <th scope="col">Adresse email</th>
                    <th scope="col">Compte SeaPilot</th>
                    <th scope="col">Adresse @bbtm.fr</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((person) => (
                    <tr key={person.id}>
                      <th scope="row">
                        <span className="admin-user-name">{person.displayName}</span>
                        {person.functionLabel ? <span className="admin-user-email">{person.functionLabel}</span> : null}
                      </th>
                      <td>
                        <span>{person.email || 'Non renseignée'}</span>
                        {person.accountEmail ? <span className="admin-user-email">Compte : {person.accountEmail}</span> : null}
                      </td>
                      <td><span className={person.hasAccount ? 'admin-success-chip' : 'admin-warning-chip'}>
                        {person.hasAccount ? 'Compte existant' : 'Sans compte'}
                      </span></td>
                      <td><span className={person.hasBbtmEmail ? 'admin-success-chip' : 'admin-warning-chip'}>
                        {person.hasBbtmEmail ? 'Renseignée' : 'Sans adresse @bbtm.fr'}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
