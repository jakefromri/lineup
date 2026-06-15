import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { TenantSummary, Tenant } from '@lineup/types';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CreateResult {
  team: Tenant;
  managerInviteUrl: string;
  parentJoinUrl: string;
}

export default function TeamList() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch<{ teams: TenantSummary[] }>('/api/teams', token!),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; slug: string }) =>
      apiFetch<CreateResult>('/api/teams', token!, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setCreating(false);
      setNewName('');
      setNewSlug('');
      setFormError(null);
      setCreateResult(res);
    },
    onError: (e: ApiRequestError) => setFormError(e.message ?? 'Error creating team'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      apiFetch(`/api/teams/${id}`, token!, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  const teams: TenantSummary[] = data?.teams ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage all teams in the system</p>
        </div>
        <Button onClick={() => { setCreating(true); setCreateResult(null); }}>
          + New team
        </Button>
      </div>

      {/* Invite/join URLs after team creation */}
      {createResult && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-medium text-emerald-800">
              Team "{createResult.team.name}" created.
            </p>
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-1">Manager invite link:</p>
              <p className="text-xs font-mono text-emerald-700 break-all bg-emerald-100 rounded px-3 py-2">
                {createResult.managerInviteUrl}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-1">Parent join link:</p>
              <p className="text-xs font-mono text-emerald-700 break-all bg-emerald-100 rounded px-3 py-2">
                {createResult.parentJoinUrl}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-600 hover:text-emerald-800 text-xs"
                onClick={() => setCreateResult(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create team form */}
      {creating && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create team</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="U10 Comets"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="u10-comets"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setFormError(null);
                  createMutation.mutate({ name: newName, slug: newSlug });
                }}
                disabled={!newName || !newSlug || createMutation.isPending}
                size="sm"
              >
                {createMutation.isPending ? 'Creating…' : 'Create team'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setCreating(false); setFormError(null); }}
              >
                Cancel
              </Button>
            </div>
            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2 mt-3">
                {formError}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Teams table */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading teams…</p>
      ) : (
        <Card>
          <div className="overflow-hidden rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Slug</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Managers</th>
                  <th className="text-left px-4 py-3">Parents</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No teams yet. Create one above.
                    </td>
                  </tr>
                )}
                {teams.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{t.slug}</td>
                    <td className="px-4 py-3">
                      <Badge variant={t.status === 'active' ? 'success' : 'secondary'}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.managerCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.parentCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className={
                          t.status === 'active'
                            ? 'text-destructive hover:bg-destructive/10 border-destructive/30'
                            : 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                        }
                        onClick={() =>
                          statusMutation.mutate({
                            id: t.id,
                            status: t.status === 'active' ? 'inactive' : 'active',
                          })
                        }
                        disabled={statusMutation.isPending}
                      >
                        {t.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </Button>
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
