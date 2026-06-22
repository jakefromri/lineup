import { Hono } from 'hono';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { apiError } from '../lib/errors.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';
import { resolveTenantId } from '../lib/context.js';

const app = new Hono();

app.use('*', resolveAuthContext, requireContext('manager', 'superadmin'));

// ─── GET /api/roster ──────────────────────────────────────────────────────────
// Auth: manager or superadmin (superadmin must pass X-Tenant-Id header)

app.get('/', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));

  const { data: parents, error: parentsError } = await supabaseAdmin
    .from('parents')
    .select('id, name, contact_email, contact_phone')
    .eq('tenant_id', tenantId)
    .order('name');

  if (parentsError || !parents) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to load roster');
  }

  const { data: kids, error: kidsError } = await supabaseAdmin
    .from('kids')
    .select('id, name, parent_id')
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (kidsError) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to load roster');
  }

  const kidsByParent = new Map<string, { id: string; name: string }[]>();
  for (const kid of kids ?? []) {
    const list = kidsByParent.get(kid.parent_id) ?? [];
    list.push({ id: kid.id, name: kid.name });
    kidsByParent.set(kid.parent_id, list);
  }

  return c.json({
    parents: parents.map((p) => ({
      id: p.id,
      name: p.name,
      contactEmail: p.contact_email,
      contactPhone: p.contact_phone,
      kids: kidsByParent.get(p.id) ?? [],
    })),
  });
});

export default app;
