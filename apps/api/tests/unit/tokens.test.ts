import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { generateToken, hashToken } from '../../src/lib/tokens.js';

describe('token generation & hashing', () => {
  it('generates a token with the given prefix', () => {
    const token = generateToken('pat_');
    expect(token.startsWith('pat_')).toBe(true);
    expect(token.length).toBeGreaterThan('pat_'.length);
  });

  it('generates an API key with the sk_ prefix', () => {
    const token = generateToken('sk_');
    expect(token.startsWith('sk_')).toBe(true);
  });

  it('generates a join/invite token with no prefix', () => {
    const token = generateToken('');
    expect(token.length).toBeGreaterThan(0);
    expect(token.startsWith('pat_')).toBe(false);
    expect(token.startsWith('sk_')).toBe(false);
  });

  it('generates unique tokens on each call', () => {
    const a = generateToken('pat_');
    const b = generateToken('pat_');
    expect(a).not.toBe(b);
  });

  it('hashToken returns the SHA-256 hex digest of the raw token', async () => {
    const token = 'pat_abc123';
    const expected = createHash('sha256').update(token).digest('hex');
    expect(await hashToken(token)).toBe(expected);
  });

  it('hashToken is deterministic', async () => {
    const token = generateToken('sk_');
    expect(await hashToken(token)).toBe(await hashToken(token));
  });

  it('different tokens hash to different values', async () => {
    const a = generateToken('pat_');
    const b = generateToken('pat_');
    expect(await hashToken(a)).not.toBe(await hashToken(b));
  });
});
