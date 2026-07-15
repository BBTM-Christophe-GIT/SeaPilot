import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

const MINIMUM_PASSWORD_LENGTH = 12;

export function PasswordUpdatePage() {
  const { isLoading, session, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setErrorMessage(`Le mot de passe doit contenir au moins ${MINIMUM_PASSWORD_LENGTH} caractères.`);
      return;
    }

    if (password !== confirmation) {
      setErrorMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setIsSubmitting(true);

    try {
      await updatePassword(password);
      setIsUpdated(true);
    } catch {
      setErrorMessage("Le mot de passe n'a pas pu être enregistré. Demandez un nouveau lien.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <main className="auth-loading">Vérification du lien sécurisé…</main>;
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <strong>BBTM</strong>
          <span>SeaPilot</span>
        </div>
        <h1>Choisir mon mot de passe</h1>

        {!session ? (
          <>
            <p className="form-error">Ce lien est invalide ou expiré.</p>
            <button onClick={() => navigate('/login')} type="button">Demander un nouveau lien</button>
          </>
        ) : isUpdated ? (
          <>
            <div className="login-success" role="status">
              <strong>Mot de passe enregistré.</strong>
              <span>Votre compte SeaPilot est prêt.</span>
            </div>
            <button onClick={() => navigate('/', { replace: true })} type="button">Accéder à SeaPilot</button>
          </>
        ) : (
          <form className="password-update-form" onSubmit={handleSubmit}>
            <p className="login-description">
              Utilisez au moins {MINIMUM_PASSWORD_LENGTH} caractères et évitez un mot de passe déjà employé ailleurs.
            </p>
            <label>
              Nouveau mot de passe
              <input
                autoComplete="new-password"
                minLength={MINIMUM_PASSWORD_LENGTH}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label>
              Confirmer le mot de passe
              <input
                autoComplete="new-password"
                minLength={MINIMUM_PASSWORD_LENGTH}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </label>
            {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer mon mot de passe'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
