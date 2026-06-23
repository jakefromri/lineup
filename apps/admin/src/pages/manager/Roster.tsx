import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { UserPlus, Copy, Check } from 'lucide-react';
import type { RosterEntry } from '@lineup/types';
import { useTeamApi } from '@/hooks/useTeamApi';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function CoParentInviteButton({ parentId }: { parentId: string }) {
  const { teamApiFetch } = useTeamApi();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () =>
      teamApiFetch<{ inviteUrl: string }>(`/api/team/parents/${parentId}/co-parent-invite`, {
        method: 'POST',
      }),
    onSuccess: (res) => setInviteUrl(res.inviteUrl),
  });

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (inviteUrl) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground break-all">{inviteUrl}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2 shrink-0"
          onClick={copyInvite}
        >
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setInviteUrl(null)}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground mt-1"
      onClick={() => inviteMutation.mutate()}
      disabled={inviteMutation.isPending}
    >
      <UserPlus className="h-3 w-3 mr-1" />
      {inviteMutation.isPending ? 'Creating…' : 'Add a caregiver'}
    </Button>
  );
}

export default function Roster() {
  const { teamApiFetch, teamId, token } = useTeamApi();

  const { data, isLoading } = useQuery({
    queryKey: ['roster', teamId],
    queryFn: () => teamApiFetch<{ parents: RosterEntry[] }>('/api/roster'),
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
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground whitespace-nowrap">{p.name}</p>
                      <CoParentInviteButton parentId={p.id} />
                    </td>
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
