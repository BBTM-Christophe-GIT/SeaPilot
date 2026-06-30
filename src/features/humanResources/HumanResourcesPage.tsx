import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import type { RoleKey } from '../permissions/roles';
import { createPerson, fetchPeople, updatePersonActive, type PersonRecord } from './peopleQueries';

interface HumanResourcesPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface PersonFormState {
  firstName: string;
  lastName: string;
  email: string;
  functionLabel: string;
  gradeLabel: string;
}

const EMPTY_FORM: PersonFormState = {
  firstName: '',
  lastName: '',
  email: '',
  functionLabel: '',
  gradeLabel: '',
};

function canManagePersonnel(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function formatPersonName(person: PersonRecord): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

function sortPeople(people: PersonRecord[]): PersonRecord[] {
  return [...people].sort((left, right) =>
    left.lastName.localeCompare(right.lastName, 'fr') ||
    left.firstName.localeCompare(right.firstName, 'fr'),
  );
}

export function HumanResourcesPage({ client, roles }: HumanResourcesPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManagePersonnel(effectiveRoles);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchPeople(effectiveClient)
      .then((loadedPeople) => {
        if (isMounted) {
          setPeople(sortPeople(loadedPeople));
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger le personnel RH.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveClient]);

  const activeCount = useMemo(() => people.filter((person) => person.active).length, [people]);
  const visiblePeople = showInactive ? people : people.filter((person) => person.active);

  function updateFormValue(key: keyof PersonFormState, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const createdPerson = await createPerson(effectiveClient, form);
      setPeople((currentPeople) => sortPeople([...currentPeople, createdPerson]));
      setForm(EMPTY_FORM);
      setStatusMessage('Collaborateur ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce collaborateur.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActiveChange(person: PersonRecord, active: boolean) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const updatedPerson = await updatePersonActive(effectiveClient, person.id, active);
      setPeople((currentPeople) =>
        sortPeople(currentPeople.map((currentPerson) => (currentPerson.id === person.id ? updatedPerson : currentPerson))),
      );
      setStatusMessage(active ? 'Collaborateur reactive.' : 'Collaborateur desactive.');
    } catch {
      setErrorMessage('Impossible de modifier le statut.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement du personnel RH...</div>;
  }

  return (
    <section className="hr-page">
      <div className="admin-header">
        <div>
          <p className="module-family">RH</p>
          <h1>Personnel RH</h1>
        </div>
        <div className="hr-summary" aria-label="Personnel actif">
          <Users aria-hidden="true" size={18} />
          <strong>{activeCount}</strong>
          <span>{activeCount > 1 ? 'actifs' : 'actif'}</span>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="hr-toolbar">
        <label className="hr-inline-control">
          <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
          Afficher les inactifs
        </label>
        <span className={isManager ? 'hr-mode-write' : 'hr-mode-read'}>{isManager ? 'Modification' : 'Lecture seule'}</span>
      </div>

      {isManager ? (
        <form className="hr-form" onSubmit={handleCreatePerson}>
          <div className="hr-form-title">
            <UserPlus aria-hidden="true" size={18} />
            <strong>Nouveau collaborateur</strong>
          </div>
          <label>
            Prenom
            <input
              onChange={(event) => updateFormValue('firstName', event.target.value)}
              required
              value={form.firstName}
            />
          </label>
          <label>
            Nom
            <input onChange={(event) => updateFormValue('lastName', event.target.value)} required value={form.lastName} />
          </label>
          <label>
            Email
            <input onChange={(event) => updateFormValue('email', event.target.value)} type="email" value={form.email} />
          </label>
          <label>
            Fonction
            <input onChange={(event) => updateFormValue('functionLabel', event.target.value)} value={form.functionLabel} />
          </label>
          <label>
            Grade
            <input onChange={(event) => updateFormValue('gradeLabel', event.target.value)} value={form.gradeLabel} />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter
          </button>
        </form>
      ) : null}

      {visiblePeople.length === 0 ? (
        <div className="admin-state">Aucun collaborateur a afficher.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table hr-table">
            <thead>
              <tr>
                <th scope="col">Collaborateur</th>
                <th scope="col">Fonction</th>
                <th scope="col">Grade</th>
                <th scope="col">Email</th>
                <th scope="col">Statut</th>
              </tr>
            </thead>
            <tbody>
              {visiblePeople.map((person) => (
                <tr key={person.id}>
                  <th scope="row">
                    <span className="admin-user-name">{formatPersonName(person)}</span>
                    <span className="admin-user-email">ID RH {person.id}</span>
                  </th>
                  <td>{person.functionLabel || '-'}</td>
                  <td>{person.gradeLabel || '-'}</td>
                  <td>{person.email || '-'}</td>
                  <td>
                    {isManager ? (
                      <label className="hr-status-toggle">
                        <input
                          checked={person.active}
                          disabled={isSaving}
                          onChange={(event) => void handleActiveChange(person, event.target.checked)}
                          type="checkbox"
                        />
                        <span>{person.active ? 'Actif' : 'Inactif'}</span>
                      </label>
                    ) : (
                      <span className={person.active ? 'hr-status-active' : 'hr-status-inactive'}>
                        <CheckCircle2 aria-hidden="true" size={16} />
                        {person.active ? 'Actif' : 'Inactif'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
