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
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fromLocation = (location.state as RedirectLocationState | null)?.from;
  const from = `${fromLocation?.pathname || '/'}${fromLocation?.search || ''}${fromLocation?.hash || ''}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Connexion impossible. Verifiez votre email et votre mot de passe.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="login-brand">
          <strong>BBTM</strong>
          <span>SeaPilot</span>
        </div>
        <h1>Connexion a SeaPilot</h1>
        <label>
          Email
          <input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
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
        {error ? <p className="form-error">{error}</p> : null}
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
