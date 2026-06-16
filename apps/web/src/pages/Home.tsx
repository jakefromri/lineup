import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { getStoredTeams } from '@/lib/storage';

export default function Home() {
  const teams = getStoredTeams();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="space-y-3 flex flex-col items-center">
          <Logo textSize={32} iconSize={40} />
          <p className="text-muted-foreground text-sm">Team training schedules, made simple.</p>
        </div>

        {teams.length > 0 ? (
          <div className="text-left space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              Your teams
            </p>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {teams.map((t) => (
                <Link
                  key={t.slug}
                  to={`/t/${t.slug}/calendar`}
                  className="flex items-center justify-between px-4 py-3 bg-white hover:bg-muted/40 transition-colors"
                >
                  <span className="font-medium text-sm text-foreground">{t.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-lg p-5 text-left space-y-2 bg-muted/30">
            <p className="text-sm font-medium text-foreground">Getting started</p>
            <p className="text-sm text-muted-foreground">
              To register, use the join link your coach shared with you.
            </p>
            <p className="text-sm text-muted-foreground">
              Already joined? Use the team link your coach sent to view your calendar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
