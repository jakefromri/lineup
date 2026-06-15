import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/storage';

export interface MeResponse {
  parent: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  kids: { id: string; name: string }[];
}

// Resolves the parent's identity for a given team slug from the locally
// stored access token. `authenticated` is false if there's no token, or if
// the stored token was rejected by the API (e.g. revoked/lost).
export function useParentAuth(slug: string) {
  const token = getToken(slug);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', slug, token],
    queryFn: () => apiFetch<MeResponse>('/api/me', token!),
    enabled: !!token,
    retry: false,
  });

  return {
    token,
    me: data,
    isLoading: !!token && isLoading,
    authenticated: !!token && !isError,
  };
}
