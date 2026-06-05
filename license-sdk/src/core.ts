import crypto from 'crypto';
import { collectFingerprint } from './fingerprint.js';
import { readSetupConfig, writeSetupConfig, type SetupConfig } from './db.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface LicensePlatformOptions {
  /** Product ID — hardcoded in the product source, e.g. "SHOPVPS" */
  productId: string;
  /** Product version — typically process.env.npm_package_version */
  version: string;
  /** Override license server URL (for testing). Normally read from DB. */
  serverUrl?: string;
  /** Cache TTL in seconds. Default: 3600 (1 hour) */
  cacheTtl?: number;
  /** Grace period in hours when server is unreachable. Default: 24 */
  gracePeriodHours?: number;
  /** Whether to collect hardware fingerprint. Default: false */
  collectHwFingerprint?: boolean;
  /** Called when license becomes invalid (revoked/expired). */
  onInvalid?: (reason: string) => void;
  /** Called when server is unreachable and grace period is active. */
  onGracePeriod?: (hoursRemaining: number) => void;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  runtimeKey?: string;
  expiresAt?: string;
  fromCache?: boolean;
  gracePeriod?: boolean;
  gracePeriodHoursRemaining?: number;
}

interface CacheEntry {
  result: VerifyResult;
  cachedAt: number;
}

// ── LicensePlatform ───────────────────────────────────────────────────────

export class LicensePlatform {
  private readonly productId: string;
  private readonly version: string;
  private readonly serverUrl?: string;
  private readonly cacheTtl: number;
  private readonly gracePeriodMs: number;
  private readonly collectHwFingerprint: boolean;
  private readonly onInvalid?: (reason: string) => void;
  private readonly onGracePeriod?: (hours: number) => void;

  // In-memory cache — not written to disk/file
  private cache: CacheEntry | null = null;
  // Last time server was reachable
  private lastSuccessfulContactMs: number | null = null;
  // Runtime key kept only in memory
  private runtimeKey: string | null = null;

  constructor(options: LicensePlatformOptions) {
    this.productId = options.productId.toUpperCase();
    this.version = options.version;
    this.serverUrl = options.serverUrl;
    this.cacheTtl = (options.cacheTtl ?? 3600) * 1000;
    this.gracePeriodMs = (options.gracePeriodHours ?? 24) * 60 * 60 * 1000;
    this.collectHwFingerprint = options.collectHwFingerprint ?? false;
    this.onInvalid = options.onInvalid;
    this.onGracePeriod = options.onGracePeriod;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Verify the license. Call this from your Next.js middleware or app startup.
   *
   * - Returns cached result if within TTL.
   * - Calls license server if cache is stale.
   * - Falls back to grace period if server is unreachable.
   * - Returns { valid: false } if grace period exhausted.
   */
  async verify(): Promise<VerifyResult> {
    // Return cache if still fresh
    if (this.cache && Date.now() - this.cache.cachedAt < this.cacheTtl) {
      return { ...this.cache.result, fromCache: true };
    }

    // Load config from DB
    const config = await readSetupConfig();
    if (!config) {
      return { valid: false, reason: 'SETUP_INCOMPLETE' };
    }

    const serverUrl = this.serverUrl ?? config.licenseServerUrl;

    // Try to reach server
    try {
      const result = await this._callVerify(serverUrl, config);

      if (result.valid) {
        this.lastSuccessfulContactMs = Date.now();
        this.runtimeKey = result.runtimeKey ?? null;

        // Cache the successful result
        this.cache = { result, cachedAt: Date.now() };

        // Persist runtime key to DB for startup recovery
        if (result.runtimeKey) {
          await writeSetupConfig({
            ...config,
            runtimeKey: result.runtimeKey,
          }).catch(() => {}); // Non-blocking
        }

        return result;
      } else {
        // Server responded but license is invalid
        this.cache = { result, cachedAt: Date.now() };
        this.onInvalid?.(result.reason ?? 'INVALID');
        return result;
      }
    } catch (err) {
      // Server unreachable — apply grace period logic
      return this._handleServerUnreachable(config);
    }
  }

  /**
   * Get the runtime key (AES key for decrypting product source/config).
   * Only available after a successful verify().
   * Returns null if not verified yet.
   */
  getRuntimeKey(): string | null {
    return this.runtimeKey;
  }

  /**
   * Check if setup wizard has been completed.
   */
  async isSetupComplete(): Promise<boolean> {
    const config = await readSetupConfig();
    return config !== null;
  }

  /**
   * Perform initial license verification during setup wizard.
   * Different from verify() — takes explicit params, doesn't use DB cache.
   */
  async verifyDuringSetup(params: {
    key: string;
    serverUrl: string;
    domain: string;
  }): Promise<VerifyResult> {
    const nonce = crypto.randomUUID();
    const timestamp = Date.now();

    const body: Record<string, unknown> = {
      key: params.key,
      product_id: this.productId,
      version: this.version,
      domain: params.domain,
      timestamp,
      nonce,
    };

    if (this.collectHwFingerprint) {
      body.hw_fingerprint = collectFingerprint();
    }

    const res = await fetch(`${params.serverUrl}/api/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`License server returned HTTP ${res.status}`);
    }

    return normalizeVerifyResponse(await res.json());
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async _callVerify(
    serverUrl: string,
    config: SetupConfig
  ): Promise<VerifyResult> {
    const nonce = crypto.randomUUID();
    const timestamp = Date.now();

    const body: Record<string, unknown> = {
      key: config.licenseKey,
      product_id: this.productId,
      version: this.version,
      domain: config.domain,
      timestamp,
      nonce,
    };

    if (this.collectHwFingerprint) {
      body.hw_fingerprint = collectFingerprint();
    }

    const res = await fetch(`${serverUrl}/api/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000), // 8s timeout
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return normalizeVerifyResponse(await res.json());
  }

  private _handleServerUnreachable(config: SetupConfig): VerifyResult {
    const now = Date.now();
    const lastContact = this.lastSuccessfulContactMs;

    // First time unreachable — use DB-persisted runtime key as fallback
    if (!lastContact) {
      if (config.runtimeKey) {
        // We have a cached runtime key from a previous successful verify
        this.runtimeKey = config.runtimeKey;
        const hoursRemaining = this.gracePeriodMs / 3_600_000;
        this.lastSuccessfulContactMs = now - (this.gracePeriodMs - this.gracePeriodMs); // start grace
        this.onGracePeriod?.(hoursRemaining);
        return {
          valid: true,
          reason: 'GRACE_PERIOD',
          runtimeKey: config.runtimeKey,
          fromCache: true,
          gracePeriod: true,
          gracePeriodHoursRemaining: hoursRemaining,
        };
      }
      // Never verified successfully — can't grant access
      return { valid: false, reason: 'SERVER_UNREACHABLE' };
    }

    const elapsed = now - lastContact;
    const remaining = this.gracePeriodMs - elapsed;

    if (remaining > 0) {
      const hoursRemaining = Math.round(remaining / 3_600_000);
      this.onGracePeriod?.(hoursRemaining);
      return {
        valid: true,
        reason: 'GRACE_PERIOD',
        runtimeKey: this.runtimeKey ?? config.runtimeKey,
        fromCache: true,
        gracePeriod: true,
        gracePeriodHoursRemaining: hoursRemaining,
      };
    }

    // Grace period exhausted
    this.onInvalid?.('GRACE_PERIOD_EXHAUSTED');
    return { valid: false, reason: 'GRACE_PERIOD_EXHAUSTED' };
  }
}

// ── Response normalizer ─────────────────────────────────────────────────────

/**
 * The license server returns snake_case fields (runtime_key, expires_at).
 * Map them to the SDK's camelCase VerifyResult shape.
 */
function normalizeVerifyResponse(raw: any): VerifyResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, reason: 'INVALID_RESPONSE' };
  }
  return {
    valid: !!raw.valid,
    reason: raw.reason,
    runtimeKey: raw.runtime_key ?? raw.runtimeKey,
    expiresAt: raw.expires_at ?? raw.expiresAt,
  };
}
