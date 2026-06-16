// Parent auth for lineup is a long-lived access token (pat_...) issued on
// join-link registration — not a Supabase Auth session. Stored client-side,
// scoped per team slug, since a parent (in principle) could be registered on
// multiple teams in this browser.

const TOKEN_PREFIX = 'lineup_token_';
const TEAM_NAME_PREFIX = 'lineup_team_name_';

export function getToken(slug: string): string | null {
  return localStorage.getItem(`${TOKEN_PREFIX}${slug}`);
}

export function setToken(slug: string, token: string): void {
  localStorage.setItem(`${TOKEN_PREFIX}${slug}`, token);
}

export function clearToken(slug: string): void {
  localStorage.removeItem(`${TOKEN_PREFIX}${slug}`);
}

export function getTeamName(slug: string): string | null {
  return localStorage.getItem(`${TEAM_NAME_PREFIX}${slug}`);
}

export function setTeamName(slug: string, name: string): void {
  localStorage.setItem(`${TEAM_NAME_PREFIX}${slug}`, name);
}

export function getStoredTeams(): Array<{ slug: string; name: string }> {
  const teams: Array<{ slug: string; name: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(TOKEN_PREFIX)) {
      const slug = key.slice(TOKEN_PREFIX.length);
      const name = getTeamName(slug) ?? slug;
      teams.push({ slug, name });
    }
  }
  return teams;
}
