import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';

let cachedKey: Buffer | null = null;

function parseKey(raw: string): Buffer {
  // Accept either base64 (recommended) or hex.
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('bad base64 length');
    }
    return key;
  } catch {
    key = Buffer.from(raw, 'hex');
    if (key.length !== 32) {
      throw new Error('SID_PASSWORD_KEY must be 32 bytes (base64 or hex)');
    }
    return key;
  }
}

function getDefaultKeyFileCandidates(): string[] {
  const out: string[] = [];

  // Docker image provisions /app/data
  out.push('/app/data/sid_password_key');

  // Local/dev fallbacks
  out.push(path.resolve(process.cwd(), 'data', 'sid_password_key'));
  out.push(path.resolve(process.cwd(), 'backend', 'data', 'sid_password_key'));

  return out;
}

function tryReadKeyFromFile(filePath: string): Buffer | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;
    return parseKey(raw);
  } catch {
    return null;
  }
}

function writeNewKeyFile(filePath: string, key: Buffer): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const payload = `${key.toString('base64')}\n`;
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  // Best-effort restrictive perms on POSIX
  try {
    fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
  } catch {
    fs.writeFileSync(tmp, payload, { encoding: 'utf8' });
  }

  try {
    fs.renameSync(tmp, filePath);
  } catch {
    // If rename fails (e.g. cross-device), fall back to overwrite
    fs.writeFileSync(filePath, payload, { encoding: 'utf8' });
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

function getKey(params?: { allowCreate?: boolean }): Buffer {
  if (cachedKey) return cachedKey;

  const allowCreate = Boolean(params?.allowCreate);

  const rawEnv = process.env.SID_PASSWORD_KEY;
  if (rawEnv && rawEnv.trim()) {
    cachedKey = parseKey(rawEnv.trim());
    return cachedKey;
  }

  const explicitFile = process.env.SID_PASSWORD_KEY_FILE;
  const candidates = explicitFile ? [explicitFile] : getDefaultKeyFileCandidates();

  for (const candidate of candidates) {
    const existing = tryReadKeyFromFile(candidate);
    if (existing) {
      cachedKey = existing;
      return cachedKey;
    }
  }

  if (!allowCreate) {
    throw new Error('SID password key is not configured');
  }

  // Create a persistent key file for convenience.
  // Prefer explicit SID_PASSWORD_KEY_FILE if provided; otherwise first candidate.
  const targetPath = candidates[0] ?? '/app/data/sid_password_key';
  const newKey = crypto.randomBytes(32);
  try {
    writeNewKeyFile(targetPath, newKey);
  } catch (e) {
    throw new Error(
      'Unable to auto-create SID password key file. Set SID_PASSWORD_KEY or ensure SID_PASSWORD_KEY_FILE (or /app/data) is writable.'
    );
  }

  cachedKey = newKey;
  return cachedKey;
}

export function ensureSidSecretKeyConfigured(): boolean {
  try {
    getKey({ allowCreate: true });
    return true;
  } catch (error) {
    console.warn(
      '⚠️  Failed to ensure SID password encryption key is configured:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

export function encryptSidSecret(plaintext: string): string {
  const key = getKey({ allowCreate: true });
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // version:iv:tag:ciphertext (base64)
  return [
    'v1',
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function hasSidSecretKeyConfigured(): boolean {
  try {
    getKey({ allowCreate: false });
    return true;
  } catch {
    return false;
  }
}
