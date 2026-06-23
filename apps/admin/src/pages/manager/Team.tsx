import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, RefreshCw, UserPlus, Trash2, Pencil } from 'lucide-react';
import type { ApiKeyInfo, ManagerSummary, TenantStatus } from '@lineup/types';
import { ApiRequestError } from '@/lib/api';
import { useTeamApi } from '@/hooks/useTeamApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface TeamData {
  team: { id: string; name: string; slug: string; status: TenantStatus; parentJoinUrl: string };
  apiKey: ApiKeyInfo;
  managers: ManagerSummary[];
}

function CopyableField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button variant="outline" size="icon" onClick={copy} title="Copy">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function Team() {
  const { teamApiFetch, teamId, token } = useTeamApi();
  const qc = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => teamApiFetch<TeamData>('/api/team'),
    enabled: !!token,
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      teamApiFetch('/api/team', { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setEditingName(false);
      setNameError(null);
    },
    onError: (e: ApiRequestError) => setNameError(e.message ?? 'Error renaming team'),
  });

  const regenerateJoinLinkMutation = useMutation({
    mutationFn: () =>
      teamApiFetch<{ parentJoinUrl: string }>('/api/team/join-link/regenerate', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });

  const regenerateApiKeyMutation = useMutation({
    mutationFn: () =>
      teamApiFetch<{ apiKey: string }>('/api/team/api-key/regenerate', { method: 'POST' }),
    onSuccess: (res) => {
      setNewApiKey(res.apiKey);
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });

  const inviteManagerMutation = useMutation({
    mutationFn: () =>
      teamApiFetch<{ inviteUrl: string }>('/api/team/managers/invite', { method: 'POST' }),
    onSuccess: (res) => {
      setInviteUrl(res.inviteUrl);
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });

  const removeManagerMutation = useMutation({
    mutationFn: (membershipId: string) =>
      teamApiFetch(`/api/team/managers/${membershipId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setConfirmRemoveId(null);
      setRemoveError(null);
    },
    onError: (e: ApiRequestError) => {
      setRemoveError(e.message ?? 'Error removing manager');
      setConfirmRemoveId(null);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground text-sm">Loading team settings…</p>
      </div>
    );
  }

  const { team, apiKey, managers } = data;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Team settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your team name, join link, API key, and managers
        </p>
      </div>

      {/* Team name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team name</CardTitle>
        </CardHeader>
        <CardContent>
          {editingName ? (
            <div className="space-y-3">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Team name"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => renameMutation.mutate(nameInput)}
                  disabled={!nameInput || renameMutation.isPending}
                >
                  {renameMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditingName(false); setNameError(null); }}>
                  Cancel
                </Button>
              </div>
              {nameError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{nameError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{team.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{team.slug}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditingName(true); setNameInput(team.name); }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parent join link */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parent join link</CardTitle>
          <CardDescription>Share this link with parents to register their kids</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyableField label="Join link" value={team.parentJoinUrl} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateJoinLinkMutation.mutate()}
            disabled={regenerateJoinLinkMutation.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {regenerateJoinLinkMutation.isPending ? 'Regenerating…' : 'Regenerate link'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Regenerating invalidates the old link — anyone with the old link will no longer be able to join.
          </p>
        </CardContent>
      </Card>

      {/* API key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">API key</CardTitle>
          <CardDescription>
            Used by Claude (and other tools) to bulk-create sessions via the API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {newApiKey ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-800">
                New API key generated — copy it now, it won't be shown again:
              </p>
              <CopyableField label="API key" value={newApiKey} />
            </div>
          ) : apiKey.exists ? (
            <p className="text-sm text-muted-foreground">
              Active key created {apiKey.createdAt ? new Date(apiKey.createdAt).toLocaleDateString() : '—'}.
              {apiKey.revokedAt && ' (revoked)'}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No API key has been generated yet.</p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateApiKeyMutation.mutate()}
            disabled={regenerateApiKeyMutation.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {regenerateApiKeyMutation.isPending
              ? 'Generating…'
              : apiKey.exists
                ? 'Regenerate key'
                : 'Generate key'}
          </Button>
          {apiKey.exists && (
            <p className="text-xs text-muted-foreground">
              Regenerating immediately revokes the previous key.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Managers */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Managers</CardTitle>
            <CardDescription>People who can manage this team</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => inviteManagerMutation.mutate()}
            disabled={inviteManagerMutation.isPending}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" />
            {inviteManagerMutation.isPending ? 'Inviting…' : 'Invite manager'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {inviteUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium text-emerald-800">
                Invite created. Send this link to the new manager:
              </p>
              <p className="text-xs font-mono text-emerald-700 break-all bg-emerald-100 rounded px-3 py-2">
                {inviteUrl}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-600 hover:text-emerald-800 text-xs"
                onClick={() => setInviteUrl(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {removeError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{removeError}</p>
          )}

          {managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No managers yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {managers.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.email ?? 'Pending invite'}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.acceptedAt ? `Joined ${new Date(m.acceptedAt).toLocaleDateString()}` : 'Invite not yet accepted'}
                    </p>
                  </div>
                  {confirmRemoveId === m.id ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeManagerMutation.mutate(m.id)}
                        disabled={removeManagerMutation.isPending}
                      >
                        Confirm remove
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => { setConfirmRemoveId(m.id); setRemoveError(null); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {team.status === 'inactive' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-yellow-800">
              This team is currently inactive. Contact a superadmin to reactivate it.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
