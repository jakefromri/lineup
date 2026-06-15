import type { ApiError } from '@lineup/types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(status: number, body: ApiError | { error?: string }) {
    const message =
      'error' in body && typeof body.error === 'object' && body.error
        ? body.error.message
        : 'error' in body && typeof body.error === 'string'
          ? body.error
          : 'Request failed';
    super(message);
    this.status = status;
    this.code =
      'error' in body && typeof body.error === 'object' && body.error ? body.error.code : 'unknown';
  }
}

export async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiRequestError(res.status, json);
  }

  return json as T;
}

export async function publicApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiRequestError(res.status, json);
  }

  return json as T;
}
