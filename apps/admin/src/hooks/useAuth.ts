import { useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { JwtClaims } from '@lineup/types';

export interface AuthState {
  session: Session | null;
  user: User | null;
  claims: JwtClaims | null;
  loading: boolean;
  token: string | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    claims: null,
    loading: true,
    token: null,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const claims = (session?.user?.app_metadata as JwtClaims | null) ?? null;
      setState({
        session,
        user: session?.user ?? null,
        claims,
        loading: false,
        token: session?.access_token ?? null,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const claims = (session?.user?.app_metadata as JwtClaims | null) ?? null;
      setState({
        session,
        user: session?.user ?? null,
        claims,
        loading: false,
        token: session?.access_token ?? null,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
