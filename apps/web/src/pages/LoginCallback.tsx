import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { setToken } from '@/lib/storage';

// This page is the redirect target for Supabase magic links.
// Supabase appends the session tokens to the URL hash; the supabase client
// parses them automatically via detectSessionInUrl. We wait for the session,
// then exchange it for a parent pat_ token via the API.

export default function LoginCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      // Give Supabase a moment to parse the hash fragment from the URL
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        if (!cancelled) setError('The login link has expired or is invalid. Please request a new one.');
        return;
      }

      try {
        const res = await apiFetch<{ accessToken: string; slug: string }>(
          '/api/auth/link-session',
          session.access_token,
          { method: 'POST' },
        );

        if (!cancelled) {
          setToken(res.slug, res.accessToken);
          // Team name is fetched from storage or shows slug as fallback in the Nav.
          // Parents who joined via the join link already have the name cached.
          navigate(`/t/${res.slug}/calendar`, { replace: true });
        }
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof ApiRequestError
              ? e.message
              : 'Something went wrong. Please try again.';
          setError(msg);
        }
      } finally {
        // Sign out the Supabase session — we use pat_ tokens for ongoing auth,
        // not Supabase sessions. This avoids a stale Supabase session persisting.
        await supabase.auth.signOut();
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">{error}</p>
          <a href="/login" className="text-sm text-primary underline">
            Request a new login link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground animate-pulse text-sm">Signing you in…</p>
    </div>
  );
}
