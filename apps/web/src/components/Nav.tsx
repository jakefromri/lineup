import { NavLink, Link, useParams } from 'react-router-dom';
import { getTeamName } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';

export function Nav() {
  const { slug } = useParams<{ slug: string }>();
  const teamName = slug ? getTeamName(slug) ?? slug : null;

  const links = [
    { to: `/t/${slug}/calendar`, label: 'Calendar' },
    { to: `/t/${slug}/announcements`, label: 'Announcements' },
  ];

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
        </div>
      </div>
    </nav>
  );
}
