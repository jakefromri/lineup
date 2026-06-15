import { createMiddleware } from 'hono/factory';
import type { AuthContext, AuthContextType, JwtClaims } from '@lineup/types';
import { ErrorCode } from '@lineup/types';
import { supabaseAuth, supabaseAdmin } from '../lib/supabase.js';
import { hashToken } from '../lib/tokens.js';
import { apiError } from '../lib/errors.js';

declare module 'hono' {
  interface ContextVariableMap {
    authContext: AuthContext;
  }
}

/**
 * Resolves the caller's auth context from the `Authorization: Bearer <token>`
 * header via prefix routing:
 *  - `sk_...` → API key lookup (scope: sessions only, enforced via requireContext)
 *  - `pat_...` → parent access token lookup
 *  - anything else → Supabase JWT (manager or superadmin)
 *
 * Also enforces the tenant active-status check for manager/parent/apikey
 * contexts (not superadmin): an `inactive` team short-circuits with
 * `403 { error: { code: 'team_inactive' } }` for every route.
 */
export const resolveAuthContext = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw apiError(401, ErrorCode.UNAUTHORIZED, 'Missing authorization token');
  }
  const token = authHeader.slice(7);

  let ctx: AuthContext;

  if (token.startsWith('sk_')) {
    const hash = hashToken(token);
    const { data: key } = await supabaseAdmin
      .from('api_keys')
      .select('tenant_id, revoked_at')
      .eq('key_hash', hash)
      .maybeSingle();

    if (!key || key.revoked_at) {
      throw apiError(401, ErrorCode.UNAUTHORIZED, 'Invalid or revoked API key');
    }
    ctx = { type: 'apikey', tenantId: key.tenant_id };
  } else if (token.startsWith('pat_')) {
    const hash = hashToken(token);
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('id, tenant_id')
      .eq('access_token_hash', hash)
      .maybeSingle();

    if (!parent) {
      throw apiError(401, ErrorCode.UNAUTHORIZED, 'Invalid access token');
    }
    ctx = { type: 'parent', tenantId: parent.tenant_id, parentId: parent.id };
  } else {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      throw apiError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired token');
    }

    const meta = data.user.app_metadata as Partial<JwtClaims>;

    if (meta.role === 'superadmin') {
      ctx = { type: 'superadmin', userId: data.user.id };
    } else if (meta.role === 'manager' && meta.tenant_id) {
      const { data: membership } = await supabaseAdmin
        .from('memberships')
        .select('id')
        .eq('user_id', data.user.id)
        .eq('tenant_id', meta.tenant_id)
        .maybeSingle();

      if (!membership) {
        throw apiError(401, ErrorCode.UNAUTHORIZED, 'No membership found for this user');
      }

      ctx = {
        type: 'manager',
        tenantId: meta.tenant_id,
        userId: data.user.id,
        membershipId: membership.id,
      };
    } else {
      throw apiError(401, ErrorCode.UNAUTHORIZED, 'Token missing role claim');
    }
  }

  if (ctx.type !== 'superadmin') {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('status')
      .eq('id', ctx.tenantId)
      .maybeSingle();

    if (!tenant) {
      throw apiError(401, ErrorCode.UNAUTHORIZED, 'Tenant not found');
    }
    if (tenant.status === 'inactive') {
      throw apiError(403, ErrorCode.TEAM_INACTIVE, 'This team is no longer active');
    }
  }

  c.set('authContext', ctx);
  await next();
});

/**
 * Validates the resolved auth context type against the route's allowlist.
 * A valid-but-wrong-type context (e.g. a parent token on a manager-only
 * route) returns `403` — distinct from the `401` returned by
 * `resolveAuthContext` for missing/invalid credentials.
 */
export const requireContext = (...types: AuthContextType[]) =>
  createMiddleware(async (c, next) => {
    const ctx = c.get('authContext');
    if (!types.includes(ctx.type)) {
      throw apiError(403, ErrorCode.ROLE_MISMATCH, 'This endpoint is not available for your role');
    }
    await next();
  });
