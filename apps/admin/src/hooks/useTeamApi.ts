import { useContext } from 'react';
import { ActiveTeamContext } from '@/context/ActiveTeamContext';
import { useAuth } from './useAuth';
import { apiFetch } from '@/lib/api';

export function useTeamApi() {
  const { token } = useAuth();
  const { teamId } = useContext(ActiveTeamContext);

  function teamApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const extraHeaders: Record<string, string> = teamId ? { 'X-Tenant-Id': teamId } : {};
    return apiFetch<T>(path, token!, {
      ...init,
      headers: { ...extraHeaders, ...((init?.headers as Record<string, string>) ?? {}) },
    });
  }

  return { teamApiFetch, teamId, token };
}
