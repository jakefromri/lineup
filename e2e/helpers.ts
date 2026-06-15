// Shared seed/cleanup helpers for the Playwright e2e suite — re-exports the
// same Supabase-service-role-backed helpers used by the API integration
// tests, so e2e specs can seed teams/managers/parents directly via Supabase
// and exercise the UI for the actual user-facing flow under test.
export * from '../apps/api/tests/helpers';

export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
