import type { FormEvent } from 'react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

interface RedirectLocationState {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
}

export function LoginPage() {
  const { sendPasswordReset, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'activation' | 'recovery'>('sign-in');
  const [isEmailSent, setIsEmailSent] = useState(false);
  const fromLocation = (location.state as RedirectLocationState | null)?.from;
  const from = `${fromLocation?.pathname || '/'}${fromLocation?.search || ''}${fromLocation?.hash || ''}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'sign-in') {
        await signIn(email, password);
        navigate(from, { replace: true });
      } else {
        await sendPasswordReset(email, `${window.location.origin}/auth/update-password`);
        setIsEmailSent(true);
      }
    } catch {
      setError(
        mode === 'sign-in'
          ? 'Connexion impossible. Vérifiez votre email et votre mot de passe.'
          : "Le lien n'a pas pu être envoyé. Réessayez dans quelques instants.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode: 'sign-in' | 'activation' | 'recovery') {
    setMode(nextMode);
    setError(null);
    setIsEmailSent(false);
    setPassword('');
  }

  const recoveryTitle = mode === 'activation' ? 'Activer mon compte' : 'Mot de passe oublié';
  const recoveryDescription = mode === 'activation'
    ? "Saisissez l'adresse invitée par votre administrateur. Vous recevrez un lien personnel pour définir votre mot de passe."
    : "Saisissez votre adresse SeaPilot. Si un compte existe, un lien sécurisé vous permettra de choisir un nouveau mot de passe.";

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="login-brand">
          <strong>BBTM</strong>
          <span>SeaPilot</span>
        </div>
        <h1>{mode === 'sign-in' ? 'Connexion à SeaPilot' : recoveryTitle}</h1>
        {mode !== 'sign-in' ? <p className="login-description">{recoveryDescription}</p> : null}
        {isEmailSent ? (
          <div className="login-success" role="status">
            <strong>Consultez votre messagerie.</strong>
            <span>Si cette adresse est autorisée, un lien sécurisé vient d’être envoyé.</span>
          </div>
        ) : null}
        <label>
          Email
          <input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        {mode === 'sign-in' ? (
          <label>
            Mot de passe
            <input
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        {!isEmailSent ? (
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Envoi en cours…' : mode === 'sign-in' ? 'Se connecter' : 'Envoyer le lien sécurisé'}
          </button>
        ) : null}
        <div className="login-alternate-actions">
          {mode === 'sign-in' ? (
            <>
              <button className="login-link-button" onClick={() => switchMode('activation')} type="button">
                Première connexion / Activer mon compte
              </button>
              <button className="login-link-button" onClick={() => switchMode('recovery')} type="button">
                Mot de passe oublié
              </button>
              <p>Les comptes sont créés sur invitation d’un administrateur SeaPilot.</p>
            </>
          ) : (
            <button className="login-link-button" onClick={() => switchMode('sign-in')} type="button">
              Retour à la connexion
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
