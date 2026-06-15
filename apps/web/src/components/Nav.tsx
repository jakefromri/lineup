import { NavLink, useParams } from 'react-router-dom';
import { getTeamName } from '@/lib/storage';
import { cn } from '@/lib/utils';

export function Nav() {
  const { slug } = useParams<{ slug: string }>();
  const teamName = slug ? getTeamName(slug) ?? slug : 'lineup';

  const links = [
    { to: `/t/${slug}/calendar`, label: 'Calendar' },
    { to: `/t/${slug}/announcements`, label: 'Announcements' },
  ];

  return (
    <nav className="bg-white border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <span className="font-semibold text-foreground text-sm truncate">{teamName}</span>
      <div className="flex items-center gap-1">
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
    </nav>
  );
}
