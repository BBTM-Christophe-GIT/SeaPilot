import { useState } from 'react';
import type { AdminCollaborator, AdminPopulation } from './adminCollaborators';
import './adminCollaborators.css';

interface AdminCollaboratorCoverageProps {
  collaborators: AdminCollaborator[];
  population: AdminPopulation;
}

export function AdminCollaboratorCoverage({ collaborators: allCollaborators, population }: AdminCollaboratorCoverageProps) {
  const [filter, setFilter] = useState<'all' | 'account' | 'email'>('all');
  const collaborators = allCollaborators.filter((person) => population === 'all' || person.employmentStatus === population);
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
          {population === 'current' ? 'Collaborateurs en poste' : population === 'former' ? 'Anciens collaborateurs' : 'Tous les collaborateurs'}, y compris ceux sans adresse email.
        </p>
      </div>
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
                        {person.employmentStatus === 'former' ? <span className="admin-user-email">
                          Ancien collaborateur{person.departedOn ? ` · Départ le ${person.departedOn.split('-').reverse().join('/')}` : ''}
                        </span> : null}
                        {person.employmentStatus === 'upcoming' ? <span className="admin-user-email">Arrivée à venir</span> : null}
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
    </section>
  );
}
