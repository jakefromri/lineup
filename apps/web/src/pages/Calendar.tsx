import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Check, X, HelpCircle } from 'lucide-react';
import type { SessionWithAttendance, AttendanceStatus } from '@lineup/types';
import { apiFetch } from '@/lib/api';
import { useParentAuth } from '@/hooks/useParentAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Nav } from '@/components/Nav';
import { cn } from '@/lib/utils';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeLabel(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatRangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  return `${f.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: typeof Check }[] = [
  { value: 'attending', label: 'In', icon: Check },
  { value: 'not_attending', label: 'Out', icon: X },
  { value: 'no_response', label: '?', icon: HelpCircle },
];

export default function CalendarPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token, me, authenticated, isLoading: authLoading } = useParentAuth(slug!);
  const qc = useQueryClient();
  const [rangeStart, setRangeStart] = useState(() => toISODate(new Date()));
  const rangeEnd = addDays(rangeStart, 27);

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', slug, rangeStart, rangeEnd],
    queryFn: () =>
      apiFetch<{ sessions: SessionWithAttendance[] }>(
        `/api/sessions?from=${rangeStart}&to=${rangeEnd}`,
        token!
      ),
    enabled: !!token && authenticated,
  });

  const attendanceMutation = useMutation({
    mutationFn: ({ sessionId, kidId, status }: { sessionId: string; kidId: string; status: AttendanceStatus }) =>
      apiFetch(`/api/sessions/${sessionId}/attendance`, token!, {
        method: 'PUT',
        body: JSON.stringify({ updates: [{ kidId, status }] }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', slug] }),
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

  const myKidIds = new Set((me?.kids ?? []).map((k) => k.id));
  const sessions = data?.sessions ?? [];

  const grouped = new Map<string, SessionWithAttendance[]>();
  for (const s of sessions) {
    const list = grouped.get(s.date) ?? [];
    list.push(s);
    grouped.set(s.date, list);
  }
  const dates = [...grouped.keys()].sort();

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="px-4 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-medium text-muted-foreground">{formatRangeLabel(rangeStart, rangeEnd)}</p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => setRangeStart(addDays(rangeStart, -28))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRangeStart(toISODate(new Date()))}>
              Today
            </Button>
            <Button variant="outline" size="icon" data-testid="range-next" onClick={() => setRangeStart(addDays(rangeStart, 28))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading sessions…</p>
        ) : dates.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            No sessions scheduled in this range.
          </div>
        ) : (
          <div className="space-y-5">
            {dates.map((date) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {formatDateLabel(date)}
                  </h3>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {grouped.get(date)!.map((s) => {
                    const myKids = s.attendance.filter((a) => myKidIds.has(a.kidId));
                    const otherKids = s.attendance.filter((a) => !myKidIds.has(a.kidId));

                    return (
                      <Card key={s.id}>
                        <CardContent className="py-4 space-y-3">
                          <div>
                            <p className="font-medium text-foreground">{s.name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatTimeLabel(s.time)} · {s.location}
                            </p>
                          </div>

                          {myKids.length > 0 && (
                            <div className="space-y-2">
                              {myKids.map((a) => (
                                <div key={a.kidId} className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">{a.kidName}</span>
                                  <div className="flex items-center gap-1">
                                    {STATUS_OPTIONS.map((opt) => {
                                      const Icon = opt.icon;
                                      const active = a.status === opt.value;
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() =>
                                            attendanceMutation.mutate({
                                              sessionId: s.id,
                                              kidId: a.kidId,
                                              status: opt.value,
                                            })
                                          }
                                          className={cn(
                                            'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                                            active
                                              ? opt.value === 'attending'
                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                : opt.value === 'not_attending'
                                                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                                                  : 'bg-muted border-border text-foreground'
                                              : 'border-border text-muted-foreground hover:bg-muted/50'
                                          )}
                                        >
                                          <Icon className="h-3 w-3" />
                                          {opt.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {otherKids.length > 0 && (
                            <div className="border-t border-border pt-2 flex flex-wrap gap-1.5">
                              {otherKids.map((a) => (
                                <Badge
                                  key={a.kidId}
                                  variant={
                                    a.status === 'attending'
                                      ? 'success'
                                      : a.status === 'not_attending'
                                        ? 'destructive'
                                        : 'secondary'
                                  }
                                >
                                  {a.kidName}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
