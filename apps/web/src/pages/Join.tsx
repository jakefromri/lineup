import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { publicApiFetch, ApiRequestError } from '@/lib/api';
import { setToken, setTeamName } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface JoinInfo {
  teamName: string;
  teamSlug: string;
}

interface JoinResult {
  accessToken: string;
  parent: { id: string; name: string };
  kids: { id: string; name: string }[];
}

export default function Join() {
  const { joinToken } = useParams<{ joinToken: string }>();
  const navigate = useNavigate();

  const [parentName, setParentName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [kidNames, setKidNames] = useState<string[]>(['']);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: joinInfo, isLoading, error } = useQuery({
    queryKey: ['join', joinToken],
    queryFn: () => publicApiFetch<JoinInfo>(`/api/join/${joinToken}`),
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      publicApiFetch<JoinResult>(`/api/join/${joinToken}`, {
        method: 'POST',
        body: JSON.stringify({
          parentName,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          kids: kidNames.filter((n) => n.trim()).map((name) => ({ name: name.trim() })),
        }),
      }),
    onSuccess: (res) => {
      if (joinInfo) {
        setToken(joinInfo.teamSlug, res.accessToken);
        setTeamName(joinInfo.teamSlug, joinInfo.teamName);
        navigate(`/t/${joinInfo.teamSlug}/calendar`);
      }
    },
    onError: (e: ApiRequestError) => setFormError(e.message ?? 'Something went wrong'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!contactEmail.trim() && !contactPhone.trim()) {
      setFormError('Please provide an email or phone number.');
      return;
    }
    if (kidNames.filter((n) => n.trim()).length === 0) {
      setFormError('Add at least one kid.');
      return;
    }

    joinMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error || !joinInfo) {
    const code = error instanceof ApiRequestError ? error.code : null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">lineup</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">
              {code === 'team_inactive'
                ? 'This team is currently inactive. Contact your coach for help.'
                : 'This join link is invalid or has expired. Ask your coach for a new link.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Join {joinInfo.teamName}</CardTitle>
          <CardDescription>Register your contact info and your kid(s) for this team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="parent-name">Your name</Label>
              <Input
                id="parent-name"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                required
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <p className="text-xs text-muted-foreground">Provide at least one of email or phone.</p>

            <div className="space-y-1.5">
              <Label>Kid(s)</Label>
              <div className="space-y-2">
                {kidNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(e) => {
                        const next = [...kidNames];
                        next[i] = e.target.value;
                        setKidNames(next);
                      }}
                      placeholder={`Kid ${i + 1} name`}
                    />
                    {kidNames.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setKidNames(kidNames.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setKidNames([...kidNames, ''])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add another kid
              </Button>
            </div>

            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={!parentName || joinMutation.isPending}>
              {joinMutation.isPending ? 'Joining…' : 'Join team'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
