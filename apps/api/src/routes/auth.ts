import { Hono } from 'hono';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin, supabaseAuth } from '../lib/supabase.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { apiError } from '../lib/errors.js';

const app = new Hono();

// ─── POST /api/auth/link-session ──────────────────────────────────────────────
// Auth: Supabase JWT (from magic link callback in the web app)
// Exchanges a Supabase magic-link session for a pat_ token stored in
// parent_sessions. Issues a new session token without revoking existing ones
// (supports multiple devices).

app.post('/link-session', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw apiError(401, ErrorCode.UNAUTHORIZED, 'Missing token');
  }
  const jwtToken = authHeader.slice(7);

  const { data, error } = await supabaseAuth.auth.getUser(jwtToken);
  if (error || !data.user) {
    throw apiError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired Supabase session');
  }

  // Look up parent by Supabase user ID
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, tenant_id')
    .eq('supabase_user_id', data.user.id)
    .maybeSingle();

  if (!parent) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'No parent account linked to this email. Use the join link your coach shared to register.');
  }

  // Verify team is still active
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('slug, status')
    .eq('id', parent.tenant_id)
    .single();

  if (!tenant || tenant.status === 'inactive') {
    throw apiError(403, ErrorCode.TEAM_INACTIVE, 'This team is no longer active');
  }

  // Issue a new session token (doesn't invalidate any existing tokens)
  const accessToken = generateToken('pat_');
  const tokenHash = await hashToken(accessToken);

  const { error: insertError } = await supabaseAdmin.from('parent_sessions').insert({
    tenant_id: parent.tenant_id,
    parent_id: parent.id,
    token_hash: tokenHash,
  });

  if (insertError) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create session');
  }

  return c.json({ accessToken, slug: tenant.slug });
});

export default app;
