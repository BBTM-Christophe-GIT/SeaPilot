import type { SupabaseClient } from '@supabase/supabase-js';
import { X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';
import { ROLE_KEYS, ROLE_LABELS, type RoleKey } from '../permissions/roles';
import {
  fetchAdminInviteCandidates,
  inviteSeaPilotUser,
  type AdminInviteCandidate,
} from './adminQueries';

interface InviteUserDialogProps {
  client: SupabaseClient;
  onClose: () => void;
  onInvited: () => Promise<void> | void;
}

export function InviteUserDialog({ client, onClose, onInvited }: InviteUserDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [candidates, setCandidates] = useState<AdminInviteCandidate[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [roleKeys, setRoleKeys] = useState<RoleKey[]>(['marin']);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchAdminInviteCandidates(client)
      .then((loadedCandidates) => {
        if (isMounted) {
          setCandidates(loadedCandidates);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("La liste des marins n'a pas pu être chargée. Vous pouvez néanmoins créer le compte.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingCandidates(false);
        }
      });

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [client, onClose]);

  function handleCandidateChange(personId: string) {
    setSelectedPersonId(personId);

    const candidate = candidates.find((person) => String(person.id) === personId);

    if (candidate) {
      setDisplayName(candidate.displayName);
      setEmail(candidate.email);
    }
  }

  function handleRoleChange(roleKey: RoleKey, checked: boolean) {
    setRoleKeys((currentRoles) =>
      checked
        ? ROLE_KEYS.filter((role) => currentRoles.includes(role) || role === roleKey)
        : currentRoles.filter((role) => role !== roleKey),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (roleKeys.length === 0) {
      setErrorMessage('Sélectionnez au moins un rôle.');
      return;
    }

    setIsSubmitting(true);

    try {
      await inviteSeaPilotUser(client, {
        email,
        displayName,
        roleKeys,
        personId: selectedPersonId ? Number(selectedPersonId) : null,
      });
      await onInvited();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'envoyer l'invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="admin-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="admin-dialog"
        role="dialog"
      >
        <header className="admin-dialog-header">
          <div>
            <p className="module-family">Accès SeaPilot</p>
            <h2 id={titleId}>Inviter un utilisateur</h2>
          </div>
          <button aria-label="Fermer" className="admin-icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <p className="admin-dialog-description" id={descriptionId}>
          SeaPilot enverra un lien personnel pour activer le compte et choisir un mot de passe.
        </p>

        <form className="admin-invite-form" onSubmit={handleSubmit}>
          <label>
            Associer à un marin (facultatif)
            <select
              disabled={isLoadingCandidates || isSubmitting}
              onChange={(event) => handleCandidateChange(event.target.value)}
              value={selectedPersonId}
            >
              <option value="">Aucun marin associé</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.displayName}{candidate.functionLabel ? ` — ${candidate.functionLabel}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nom affiché
            <input
              autoComplete="name"
              disabled={isSubmitting}
              maxLength={120}
              minLength={2}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              type="text"
              value={displayName}
            />
          </label>

          <label>
            Adresse email
            <input
              autoComplete="email"
              disabled={isSubmitting}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <fieldset className="admin-role-picker">
            <legend>Rôles</legend>
            <p>Accordez uniquement les droits nécessaires. Le rôle Marin est présélectionné.</p>
            <div>
              {ROLE_KEYS.map((roleKey) => (
                <label key={roleKey}>
                  <input
                    checked={roleKeys.includes(roleKey)}
                    disabled={isSubmitting}
                    onChange={(event) => handleRoleChange(roleKey, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{ROLE_LABELS[roleKey]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

          <footer className="admin-dialog-actions">
            <button className="admin-secondary-button" disabled={isSubmitting} onClick={onClose} type="button">
              Annuler
            </button>
            <button className="admin-primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Envoi en cours…' : "Envoyer l'invitation"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
