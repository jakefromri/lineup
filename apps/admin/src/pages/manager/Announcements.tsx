import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Announcement } from '@lineup/types';
import { ApiRequestError } from '@/lib/api';
import { useTeamApi } from '@/hooks/useTeamApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextEditor, RichTextView } from '@/components/RichTextEditor';

function isBlank(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length === 0;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Announcements() {
  const { teamApiFetch, teamId, token } = useTeamApi();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['announcements', teamId],
    queryFn: () => teamApiFetch<{ announcements: Announcement[] }>('/api/announcements'),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (bodyHtml: string) =>
      teamApiFetch('/api/announcements', { method: 'POST', body: JSON.stringify({ bodyHtml }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      closeForm();
    },
    onError: (e: ApiRequestError) => setFormError(e.message ?? 'Error posting announcement'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, bodyHtml }: { id: string; bodyHtml: string }) =>
      teamApiFetch(`/api/announcements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ bodyHtml }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      closeForm();
    },
    onError: (e: ApiRequestError) => setFormError(e.message ?? 'Error updating announcement'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teamApiFetch(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setConfirmDeleteId(null);
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setBody('');
    setFormError(null);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setBody(a.bodyHtml);
    setShowForm(true);
    setFormError(null);
  };

  const submit = () => {
    if (isBlank(body)) {
      setFormError('Announcement cannot be empty.');
      return;
    }
    setFormError(null);
    if (editingId) {
      updateMutation.mutate({ id: editingId, bodyHtml: body });
    } else {
      createMutation.mutate(body);
    }
  };

  const announcements = data?.announcements ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visible to all parents on this team</p>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setBody('');
            setFormError(null);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> New announcement
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? 'Edit announcement' : 'New announcement'}</CardTitle>
          </CardHeader>
          <CardContent>
            <RichTextEditor value={body} onChange={setBody} placeholder="What's the latest update for parents?" />
            <div className="flex items-center gap-2 mt-4">
              <Button
                size="sm"
                onClick={submit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving…'
                  : editingId
                    ? 'Save changes'
                    : 'Post announcement'}
              </Button>
              <Button variant="ghost" size="sm" onClick={closeForm}>
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

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading announcements…</p>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No announcements yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <p className="text-xs text-muted-foreground">
                    {a.authorName} · {formatTimestamp(a.createdAt)}
                    {a.updatedAt !== a.createdAt && ' (edited)'}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(a)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDeleteId(a.id)}
                      title="Delete"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <RichTextView html={a.bodyHtml} />
                {confirmDeleteId === a.id && (
                  <div className="mt-3 flex items-center gap-2 bg-destructive/10 rounded-md px-3 py-2">
                    <p className="text-sm text-destructive flex-1">Delete this announcement?</p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(a.id)}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
