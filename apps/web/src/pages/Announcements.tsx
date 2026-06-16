import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Announcement } from '@lineup/types';
import { apiFetch } from '@/lib/api';
import { useParentAuth } from '@/hooks/useParentAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Nav } from '@/components/Nav';
import { RichTextView } from '@/components/RichTextView';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
