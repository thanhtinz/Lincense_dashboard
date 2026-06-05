import crypto from 'crypto';

const AES_MASTER_KEY = Buffer.from(process.env.AES_MASTER_KEY || '', 'hex');
const RSA_PRIVATE_KEY = (process.env.RSA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const RSA_PUBLIC_KEY = (process.env.RSA_PUBLIC_KEY || '').replace(/\\n/g, '\n');

// ─── RSA Key Signing ────────────────────────────────────────────────────────

/**
 * Sign a license key with RSA private key.
 * Returns base64url signature appended to verify key authenticity.
 */
export function signLicenseKey(key: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(key);
  sign.end();
  return sign.sign(RSA_PRIVATE_KEY, 'base64url');
}

/**
 * Verify a license key signature.
 */
export function verifyKeySignature(key: string, signature: string): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(key);
    verify.end();
    return verify.verify(RSA_PUBLIC_KEY, signature, 'base64url');
  } catch {
    return false;
  }
}

// ─── AES-256-GCM Runtime Key Encryption ────────────────────────────────────

/**
 * Encrypt a runtime key for storage in DB.
 * Uses AES-256-GCM with random IV each time.
 * Output format: iv:authTag:ciphertext (all hex)
 */
export function encryptRuntimeKey(plaintext: string): string {
  if (AES_MASTER_KEY.length !== 32) {
    throw new Error('AES_MASTER_KEY must be 32 bytes (64 hex chars)');
  }
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_MASTER_KEY, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a runtime key from DB storage.
 */
export function decryptRuntimeKey(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Invalid encrypted runtime key format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_MASTER_KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Encrypt runtime key for transport (response to product).
 * New IV each time — prevents replay with cached response.
 */
export function encryptForTransport(runtimeKey: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.randomBytes(32); // ephemeral key derived from master
  
  // Derive a per-request key using HKDF
  const derived = crypto.hkdfSync(
    'sha256',
    AES_MASTER_KEY,
    iv,
    Buffer.from('license-platform-transport-v1'),
    32
  );

  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(derived), iv);
  const encrypted = Buffer.concat([
    cipher.update(runtimeKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Return as single base64 blob: iv + authTag + key_hint + ciphertext
  // The product SDK knows the derivation — it sends back iv to decrypt
  const payload = Buffer.concat([iv, authTag, encrypted]);
  return `v1:${payload.toString('base64')}`;
}

// ─── Hardware Fingerprint ───────────────────────────────────────────────────

/**
 * Normalize and validate a hardware fingerprint hash.
 * Accepts both "sha256:<hex>" (license-sdk format) and a bare 64-char hex
 * digest (the format ShopVPS' getHardwareFingerprint() sends — no prefix).
 */
export function validateFingerprint(fp: string): boolean {
  const hash = fp.startsWith('sha256:') ? fp.slice(7) : fp;
  return /^[a-f0-9]{64}$/.test(hash);
}

/**
 * Normalize a fingerprint to its bare lowercase hex digest, so values that
 * differ only by the optional "sha256:" prefix compare as equal when stored
 * and re-checked on subsequent verifies.
 */
export function normalizeFingerprint(fp: string): string {
  return (fp.startsWith('sha256:') ? fp.slice(7) : fp).toLowerCase();
}

// ─── License Key Generation ─────────────────────────────────────────────────

/**
 * Generate a license key in format: LIC-{PREFIX}-{RANDOM8}-{RANDOM4}-{CHECKSUM2}
 * Example: LIC-SVP-A3F9X2YZ-KC82-A9
 */
export function generateLicenseKey(productPrefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion
  
  const randomSegment = (len: number) =>
    Array.from(crypto.randomBytes(len))
      .map((b) => chars[b % chars.length])
      .join('');

  const part1 = randomSegment(8);
  const part2 = randomSegment(4);
  const base = `LIC-${productPrefix.toUpperCase()}-${part1}-${part2}`;
  
  // Simple checksum: XOR of char codes mod chars.length, 2 chars
  const checksum = Array.from(base)
    .reduce((acc, c) => acc ^ c.charCodeAt(0), 0);
  const c1 = chars[checksum % chars.length];
  const c2 = chars[(checksum >> 4) % chars.length];

  return `${base}-${c1}${c2}`;
}

/**
 * Generate a fresh AES-256 runtime key (for new products/licenses).
 */
export function generateRuntimeKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

// ─── Nonce / Replay Attack Prevention ──────────────────────────────────────

/**
 * Validate request timestamp is within NONCE_WINDOW_SECONDS.
 */
export function isTimestampFresh(timestamp: number): boolean {
  const windowMs = parseInt(process.env.NONCE_WINDOW_SECONDS || '300') * 1000;
  const now = Date.now();
  return Math.abs(now - timestamp) <= windowMs;
}
