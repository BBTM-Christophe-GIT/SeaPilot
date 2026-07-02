import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
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
          <strong>BBTM</strong>
          <span>SeaPilot</span>
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

  useEffect(() => {
    let isMounted = true;

    client.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
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
      signIn: async (email: string, password: string) => {
        const { error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
          throw error;
        }
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();

        if (error) {
          throw error;
        }
      },
    }),
    [client, isLoading, session],
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
