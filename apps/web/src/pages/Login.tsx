import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login/callback`,
        // Note: we do NOT set shouldCreateUser: false here — Supabase can error on
        // admin-created users with that flag. The backend (/api/auth/link-session)
        // is the real guard: it rejects anyone not in the parents table.
      },
    });

    setLoading(false);

    if (otpError) {
      setError('Something went wrong sending the login link. Please try again.');
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex flex-col items-center space-y-3">
            <Logo textSize={28} iconSize={36} />
          </div>
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="text-4xl">📬</div>
              <p className="font-medium text-foreground">Check your email</p>
              <p className="text-sm text-muted-foreground">
                We sent a login link to <span className="font-medium text-foreground">{email}</span>.
                Click it to sign in — the link expires in 1 hour.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setSent(false); setEmail(''); }}
              >
                Use a different email
              </Button>
            </CardContent>
          </Card>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center flex flex-col items-center space-y-3">
          <Logo textSize={28} iconSize={36} />
          <p className="text-sm text-muted-foreground">Sign in to access your team</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign in with email</CardTitle>
            <CardDescription>
              We'll send a one-click login link to your inbox — no password needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={!email || loading}>
                {loading ? 'Sending…' : 'Send login link'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          New parent?{' '}
          <span className="text-foreground">
            Use the join link your coach shared with you.
          </span>
        </p>

        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
