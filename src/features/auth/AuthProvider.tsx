import { SeaPilotLogo } from '../../components/SeaPilotLogo';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { clearPasswordUpdateIntent, passwordUpdateIntentState, preparePasswordUpdateIntent, recordPasswordUpdateAuthEvent } from '../../lib/passwordUpdateIntent';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  passwordUpdateRequested: boolean;
  passwordUpdateLinkAttempted: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string, redirectTo: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  client?: SupabaseClient;
}

function resolveSupabaseClient(client?: SupabaseClient): { client: SupabaseClient } | { error: Error } {
  if (client) {
    return { client };
  }

  try {
    return { client: getSupabaseClient() };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Configuration Supabase invalide.') };
  }
}

function AuthConfigurationError({ error }: { error: Error }) {
  return (
    <main className="configuration-page" role="alert">
      <section className="configuration-panel" aria-label="Configuration application">
        <div className="login-brand">
          <SeaPilotLogo />
        </div>
        <h1>Configuration Supabase incomplete</h1>
        <p>
          L'application est bien chargee, mais les variables de connexion Supabase ne sont pas encore disponibles pour cet
          environnement.
        </p>
        <code>{error.message}</code>
      </section>
    </main>
  );
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const resolution = useMemo(() => resolveSupabaseClient(client), [client]);

  if ('error' in resolution) {
    return <AuthConfigurationError error={resolution.error} />;
  }

  return <ResolvedAuthProvider client={resolution.client}>{children}</ResolvedAuthProvider>;
}

function ResolvedAuthProvider({ children, client }: Required<AuthProviderProps>) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordIntent, setPasswordIntent] = useState({ requested: false, linkAttempted: false });
  const sessionRef = useRef<Session | null>(null);
  preparePasswordUpdateIntent(client);

  useEffect(() => {
    let isMounted = true;
    let authRevision = 0;
    const applySession = (nextSession: Session | null) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      setPasswordIntent(passwordUpdateIntentState(client, nextSession));
      setIsLoading(false);
    };
    const initialRevision = authRevision;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      authRevision += 1;
      recordPasswordUpdateAuthEvent(client, event, nextSession);
      applySession(nextSession);
    });
    client.auth.getSession().then(({ data }) => {
      if (isMounted && authRevision === initialRevision) {
        recordPasswordUpdateAuthEvent(client, 'INITIAL_SESSION', data.session);
        applySession(data.session);
      }
    }).catch(() => {
      if (isMounted && authRevision === initialRevision) applySession(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      passwordUpdateRequested: passwordIntent.requested,
      passwordUpdateLinkAttempted: passwordIntent.linkAttempted,
      signIn: async (email: string, password: string) => {
        const { error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
          throw error;
        }
        clearPasswordUpdateIntent(client);
        setPasswordIntent({ requested: false, linkAttempted: false });
      },
      sendPasswordReset: async (email: string, redirectTo: string) => {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

        if (error) {
          throw error;
        }
      },
      updatePassword: async (password: string) => {
        const updatingUserId = sessionRef.current?.user.id;
        const { error } = await client.auth.updateUser({ password });

        if (error) {
          throw error;
        }
        if (sessionRef.current?.user.id !== updatingUserId) throw new Error('La session a changé pendant l’enregistrement.');
        clearPasswordUpdateIntent(client, sessionRef.current);
        setPasswordIntent({ requested: false, linkAttempted: false });
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();

        if (error) {
          throw error;
        }
        clearPasswordUpdateIntent(client, session);
        setPasswordIntent({ requested: false, linkAttempted: false });
      },
    }),
    [client, isLoading, passwordIntent, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
