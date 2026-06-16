import { useState } from 'react';
import { NavLink, Link, useParams, useNavigate } from 'react-router-dom';
import { LogOut, UserPlus, Copy, Check } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { getTeamName, clearToken } from '@/lib/storage';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { useParentAuth } from '@/hooks/useParentAuth';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export function Nav() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const teamName = slug ? getTeamName(slug) ?? slug : null;
  const { token, authenticated } = useParentAuth(slug ?? '');

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { to: `/t/${slug}/calendar`, label: 'Calendar' },
    { to: `/t/${slug}/announcements`, label: 'Announcements' },
  ];

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ inviteUrl: string }>('/api/co-parent/invite', token!, { method: 'POST' }),
    onSuccess: (res) => {
      setInviteUrl(res.inviteUrl);
      setMenuOpen(false);
    },
  });

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleLogout = () => {
    if (slug) {
      clearToken(slug);
      navigate('/');
    }
  };

  return (
    <nav className="bg-white border-b border-border shadow-sm sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" aria-label="teamsn home">
            <Logo textSize={18} iconSize={22} />
          </Link>
          {teamName && (
            <>
              <span className="text-border select-none">·</span>
              <span className="font-semibold text-foreground text-sm truncate">{teamName}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'text-primary bg-primary/10 font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )
              }
            >
              {link.label}
            </NavLink>
          ))}

          {authenticated && slug && (
            <div className="relative ml-1">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="More options"
                aria-label="More options"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="2" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="14" r="1.5" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-border rounded-lg shadow-lg z-20 py-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      onClick={() => inviteMutation.mutate()}
                      disabled={inviteMutation.isPending}
                    >
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                      {inviteMutation.isPending ? 'Creating link…' : 'Add a caregiver'}
                    </button>
                    <div className="h-px bg-border mx-2 my-1" />
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Co-parent invite banner */}
      {inviteUrl && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-emerald-800 mb-1">
                Caregiver invite — share this link:
              </p>
              <p className="text-xs font-mono text-emerald-700 break-all">{inviteUrl}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <Button
                variant="outline"
                size="sm"
                className="text-emerald-700 border-emerald-300 hover:bg-emerald-100 h-7 text-xs"
                onClick={copyInvite}
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <button
                type="button"
                className="text-xs text-emerald-600 hover:text-emerald-800"
                onClick={() => setInviteUrl(null)}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
