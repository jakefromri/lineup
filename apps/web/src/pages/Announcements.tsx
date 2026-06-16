import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Announcement } from '@lineup/types';
import { apiFetch } from '@/lib/api';
import { useParentAuth } from '@/hooks/useParentAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Nav } from '@/components/Nav';
import { RichTextView } from '@/components/RichTextView';
import { cn } from '@/lib/utils';

const ALLOWED_EMOJIS = ['👍', '👎', '❤️', '🎉', '💪', '👏'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ReactionBar({
  announcement,
  token,
  slug,
}: {
  announcement: Announcement;
  token: string;
  slug: string;
}) {
  const qc = useQueryClient();

  const addReaction = useMutation({
    mutationFn: (emoji: string) =>
      apiFetch(`/api/announcements/${announcement.id}/reactions`, token, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements', slug] }),
  });

  const removeReaction = useMutation({
    mutationFn: (emoji: string) =>
      apiFetch(
        `/api/announcements/${announcement.id}/reactions/${encodeURIComponent(emoji)}`,
        token,
        { method: 'DELETE' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements', slug] }),
  });

  const toggleReaction = (emoji: string) => {
    const existing = announcement.reactions.find((r) => r.emoji === emoji);
    if (existing?.reactedByMe) {
      removeReaction.mutate(emoji);
    } else {
      addReaction.mutate(emoji);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1">
      {ALLOWED_EMOJIS.map((emoji) => {
        const reaction = announcement.reactions.find((r) => r.emoji === emoji);
        const active = reaction?.reactedByMe ?? false;
        const count = reaction?.count ?? 0;

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggleReaction(emoji)}
            disabled={addReaction.isPending || removeReaction.isPending}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              active
                ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                : 'border-border text-muted-foreground hover:bg-muted/60',
            )}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function AnnouncementsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token, authenticated, isLoading: authLoading } = useParentAuth(slug!);

  const { data, isLoading } = useQuery({
    queryKey: ['announcements', slug],
    queryFn: () => apiFetch<{ announcements: Announcement[] }>('/api/announcements', token!),
    enabled: !!token && authenticated,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-sm text-foreground font-medium">You're not registered for this team.</p>
            <p className="text-sm text-muted-foreground">
              Ask your coach for the team's join link to register you and your kids.
            </p>
            <Link to="/" className="text-sm text-primary underline">
              Go to home
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const announcements = data?.announcements ?? [];

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading announcements…</p>
        ) : announcements.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            No announcements yet.
          </div>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{a.authorName}</span>
                  <span>
                    {formatDate(a.createdAt)}
                    {a.updatedAt !== a.createdAt ? ' (edited)' : ''}
                  </span>
                </div>
                <RichTextView html={a.bodyHtml} />
                <ReactionBar announcement={a} token={token!} slug={slug!} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
