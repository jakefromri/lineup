import { NavLink, useNavigate, useMatch, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const managerLinks = [
  { to: '/manager/calendar', label: 'Calendar' },
  { to: '/manager/announcements', label: 'Announcements' },
  { to: '/manager/roster', label: 'Roster' },
  { to: '/manager/team', label: 'Team' },
];

const superadminLinks = [{ to: '/admin/teams', label: 'Teams' }];

export function Nav() {
  const { user, claims } = useAuth();
  const navigate = useNavigate();
  const role = claims?.role;

  const teamMatch = useMatch('/admin/teams/:teamId/*');
  const managingTeamId = teamMatch?.params.teamId ?? null;

  const links = managingTeamId
    ? [
        { to: `/admin/teams/${managingTeamId}/calendar`, label: 'Calendar' },
        { to: `/admin/teams/${managingTeamId}/announcements`, label: 'Announcements' },
        { to: `/admin/teams/${managingTeamId}/roster`, label: 'Roster' },
        { to: `/admin/teams/${managingTeamId}/team`, label: 'Team' },
      ]
    : role === 'superadmin'
      ? superadminLinks
      : managerLinks;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="font-semibold text-foreground text-sm">lineup</span>
        <span className="text-muted-foreground/30 text-xs px-1">·</span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-medium">
          {role === 'superadmin' ? 'Superadmin' : 'Manager'}
        </span>
        {managingTeamId && (
          <Link
            to="/admin/teams"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All teams
          </Link>
        )}
        <div className="flex items-center gap-1 ml-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{user?.email}</span>
        <Button variant="ghost" size="sm" onClick={signOut} className="text-xs">
          Sign out
        </Button>
      </div>
    </nav>
  );
}
