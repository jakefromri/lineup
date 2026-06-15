import type { AuthContext, ManagerAuthContext, ParentAuthContext, ApiKeyAuthContext } from '@lineup/types';
import { ErrorCode } from '@lineup/types';
import { apiError } from './errors.js';

export type TenantAuthContext = ManagerAuthContext | ParentAuthContext | ApiKeyAuthContext;

/**
 * Narrows an AuthContext to one of the tenant-scoped variants (manager,
 * parent, apikey — all of which have `tenantId`), throwing if it's a
 * superadmin context. Routes that don't allow `superadmin` (i.e. every route
 * except /api/teams) should call this to get a typed `tenantId`.
 *
 * In practice this branch is unreachable because `requireContext(...)` has
 * already rejected superadmin contexts at runtime — this is purely to give
 * TypeScript a discriminated-union narrowing.
 */
export function requireTenantContext(ctx: AuthContext): TenantAuthContext {
  if (ctx.type === 'superadmin') {
    throw apiError(403, ErrorCode.ROLE_MISMATCH, 'This endpoint is not available for your role');
  }
  return ctx;
}
