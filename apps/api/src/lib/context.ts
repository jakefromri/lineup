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

/**
 * Resolves the effective tenantId for a request. For tenant-scoped contexts
 * (manager, parent, apikey) it reads from the JWT claim. For superadmin it
 * reads from the X-Tenant-Id request header, which the admin app sends when
 * managing a specific team.
 */
export function resolveTenantId(ctx: AuthContext, tenantIdHeader?: string | null): string {
  if (ctx.type === 'superadmin') {
    if (!tenantIdHeader) {
      throw apiError(400, ErrorCode.VALIDATION, 'X-Tenant-Id header is required for superadmin requests');
    }
    return tenantIdHeader;
  }
  return ctx.tenantId;
}
