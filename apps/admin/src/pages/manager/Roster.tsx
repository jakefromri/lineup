import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { RosterEntry } from '@lineup/types';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Roster() {
  const { token } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['roster'],
    queryFn: () => apiFetch<{ parents: RosterEntry[] }>('/api/roster', token!),
    enabled: !!token,
  });

  const parents = data?.parents ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Roster</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Parents and kids registered for this team
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading roster…</p>
      ) : parents.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No parents have joined yet. Share the join link from the Team page to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-hidden rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Parent</th>
                  <th className="text-left px-4 py-3">Contact</th>
                  <th className="text-left px-4 py-3">Kids</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parents.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        {p.contactEmail && <span>{p.contactEmail}</span>}
                        {p.contactPhone && <span>{p.contactPhone}</span>}
                        {!p.contactEmail && !p.contactPhone && <span>—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.kids.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          p.kids.map((k) => (
                            <Badge key={k.id} variant="secondary">
                              {k.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
