import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SID Secrets', () => {
  beforeEach(() => {
    vi.resetModules();

    // Stable 32-byte key for deterministic tests.
    process.env.SID_PASSWORD_KEY = Buffer.alloc(32, 7).toString('base64');
    delete process.env.SID_PASSWORD_KEY_FILE;
  });

  it('encryptSidSecret + decryptSidSecret roundtrip', async () => {
    const { encryptSidSecret, decryptSidSecret } = await import('../utils/sidSecrets.js');

    const ciphertext = encryptSidSecret('super-secret');
    expect(typeof ciphertext).toBe('string');
    expect(ciphertext.startsWith('v1:')).toBe(true);

    const plaintext = decryptSidSecret(ciphertext);
    expect(plaintext).toBe('super-secret');
  });

  it('decryptSidSecret throws for invalid payload', async () => {
    const { decryptSidSecret } = await import('../utils/sidSecrets.js');
    expect(() => decryptSidSecret('not-a-valid-payload')).toThrow();
  });
});
