import { randomBytes, createHash } from 'crypto';

/**
 * Generates an opaque token with the given prefix, e.g. `pat_...` or `sk_...`.
 * The raw token is shown to the caller exactly once; only its hash is stored.
 */
export function generateToken(prefix: string, byteLength = 32): string {
  return `${prefix}${randomBytes(byteLength).toString('hex')}`;
}

/** SHA-256 hash of a token, hex-encoded. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
