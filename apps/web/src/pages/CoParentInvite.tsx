import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { publicApiFetch, ApiRequestError } from '@/lib/api';
import { setToken, setTeamName } from '@/lib/storage';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface InviteInfo {
  teamName: string;
  teamSlug: string;
}

interface AcceptResult {
  accessToken: string;
  parent: { id: string; name: string };
}

export default function CoParentInvite() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();

  const [parentName, setParentName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: inviteInfo, isLoading, error } = useQuery({
    queryKey: ['co-parent-invite', inviteToken],
    queryFn: () => publicApiFetch<InviteInfo>(`/api/co-parent/invite/${inviteToken}`),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      publicApiFetch<AcceptResult>(`/api/co-parent/invite/${inviteToken}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          parentName,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
        }),
      }),
    onSuccess: (res) => {
      if (inviteInfo) {
        setToken(inviteInfo.teamSlug, res.accessToken);
        setTeamName(inviteInfo.teamSlug, inviteInfo.teamName);
        navigate(`/t/${inviteInfo.teamSlug}/calendar`);
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

    acceptMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error || !inviteInfo) {
    const code = error instanceof ApiRequestError ? error.code : null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="flex justify-center mb-2"><Logo textSize={20} iconSize={24} /></div>
            <CardTitle className="text-xl text-center">Invalid invite</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive text-center">
              {code === 'conflict'
                ? 'This invite has already been accepted.'
                : code === 'team_inactive'
                  ? 'This team is currently inactive.'
                  : 'This invite link is invalid or has expired. Ask the primary parent or coach to send a new one.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-3"><Logo textSize={20} iconSize={24} /></div>
          <CardTitle className="text-xl text-center">Join {inviteInfo.teamName}</CardTitle>
          <CardDescription className="text-center">
            You've been added as a caregiver for this team. Enter your details to get access.
          </CardDescription>
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
                autoFocus
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

            {formError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!parentName || acceptMutation.isPending}
            >
              {acceptMutation.isPending ? 'Setting up access…' : 'Accept invite'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
