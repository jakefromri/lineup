import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { SessionWithAttendance } from '@lineup/types';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

interface SessionFormState {
  name: string;
  date: string;
  time: string;
  endTime: string; // empty string = not set
  location: string;
}

const emptyForm: SessionFormState = { name: '', date: '', time: '', endTime: '', location: '' };

export default function Calendar() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [rangeStart, setRangeStart] = useState(() => toISODate(new Date()));
  const rangeEnd = addDays(rangeStart, 27);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SessionFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', rangeStart, rangeEnd],
    queryFn: () =>
      apiFetch<{ sessions: SessionWithAttendance[] }>(
        `/api/sessions?from=${rangeStart}&to=${rangeEnd}`,
        token!
      ),
    enabled: !!token,
  });

  const buildPayload = (f: SessionFormState) => ({
    name: f.name,
    date: f.date,
    time: f.time,
    endTime: f.endTime || null,
    location: f.location,
  });

  const createMutation = useMutation({
    mutationFn: (body: SessionFormState) =>
      apiFetch('/api/sessions', token!, { method: 'POST', body: JSON.stringify(buildPayload(body)) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      closeForm();
    },
    onError: (e: ApiRequestError) => setFormError(e.message ?? 'Error creating session'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SessionFormState }) =>
      apiFetch(`/api/sessions/${id}`, token!, { method: 'PATCH', body: JSON.stringify(buildPayload(body)) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      closeForm();
    },
    onError: (e: ApiRequestError) => setFormError(e.message ?? 'Error updating session'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/sessions/${id}`, token!, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      setConfirmDeleteId(null);
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const startEdit = (s: SessionWithAttendance) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      date: s.date,
      time: s.time.slice(0, 5),
      endTime: s.endTime ? s.endTime.slice(0, 5) : '',
      location: s.location,
    });
    setShowForm(true);
    setFormError(null);
  };

  const submitForm = () => {
    setFormError(null);
    if (editingId) {
      updateMutation.mutate({ id: editingId, body: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const sessions = data?.sessions ?? [];

  // Group sessions by date for display
  const grouped = new Map<string, SessionWithAttendance[]>();
  for (const s of sessions) {
    const list = grouped.get(s.date) ?? [];
    list.push(s);
    grouped.set(s.date, list);
  }
  const dates = [...grouped.keys()].sort();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{formatRangeLabel(rangeStart, rangeEnd)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setRangeStart(addDays(rangeStart, -28))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRangeStart(toISODate(new Date()))}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setRangeStart(addDays(rangeStart, 28))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(emptyForm);
              setFormError(null);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New session
          </Button>
        </div>
      </div>

      {/* Create/edit form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? 'Edit session' : 'New session'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="s-name">Name</Label>
                <Input
                  id="s-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Tuesday practice"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-date">Date</Label>
                <Input
                  id="s-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5" />
              <div className="space-y-1.5">
                <Label htmlFor="s-time">Start time</Label>
                <Input
                  id="s-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-end-time">
                  End time <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="s-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="s-location">Location</Label>
                <Input
                  id="s-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Riverside Park, Field 2"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={submitForm}
                disabled={
                  !form.name ||
                  !form.date ||
                  !form.time ||
                  !form.location ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving…'
                  : editingId
                    ? 'Save changes'
                    : 'Create session'}
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
        <p className="text-muted-foreground text-sm">Loading sessions…</p>
      ) : dates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No sessions scheduled in this range.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dates.map((date) => (
            <div key={date}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {formatDateLabel(date)}
              </h3>
              <div className="space-y-2">
                {grouped.get(date)!.map((s) => {
                  const attending = s.attendance.filter((a) => a.status === 'attending').length;
                  const notAttending = s.attendance.filter((a) => a.status === 'not_attending').length;
                  const noResponse = s.attendance.filter((a) => a.status === 'no_response').length;
                  const expanded = expandedId === s.id;

                  return (
                    <Card key={s.id}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{s.name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatTimeLabel(s.time)}
                              {s.endTime ? ` – ${formatTimeLabel(s.endTime)}` : ''}
                              {' · '}{s.location}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="success">{attending} in</Badge>
                              <Badge variant="destructive">{notAttending} out</Badge>
                              <Badge variant="secondary">{noResponse} no response</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setExpandedId(expanded ? null : s.id)}
                              title="View attendance"
                            >
                              {expanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => startEdit(s)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmDeleteId(s.id)}
                              title="Delete"
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {confirmDeleteId === s.id && (
                          <div className="mt-3 flex items-center gap-2 bg-destructive/10 rounded-md px-3 py-2">
                            <p className="text-sm text-destructive flex-1">
                              Delete "{s.name}"? This removes all attendance records for this session.
                            </p>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteMutation.mutate(s.id)}
                              disabled={deleteMutation.isPending}
                            >
                              Delete
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </Button>
                          </div>
                        )}

                        {expanded && (
                          <div className="mt-3 border-t border-border pt-3">
                            {s.attendance.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No kids on the roster yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {s.attendance.map((a) => (
                                  <li key={a.kidId} className="flex items-center justify-between text-sm">
                                    <span className="text-foreground">{a.kidName}</span>
                                    <Badge
                                      variant={
                                        a.status === 'attending'
                                          ? 'success'
                                          : a.status === 'not_attending'
                                            ? 'destructive'
                                            : 'secondary'
                                      }
                                    >
                                      {a.status === 'attending'
                                        ? 'Attending'
                                        : a.status === 'not_attending'
                                          ? 'Not attending'
                                          : 'No response'}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
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
  );
}
