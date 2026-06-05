import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LicensePlatform } from '../src/core';

// Mock DB reads
vi.mock('../src/db', () => ({
  readSetupConfig: vi.fn(),
  writeSetupConfig: vi.fn().mockResolvedValue(undefined),
  isSetupComplete: vi.fn().mockResolvedValue(true),
}));

// Mock fingerprint
vi.mock('../src/fingerprint', () => ({
  collectFingerprint: vi.fn().mockReturnValue('sha256:aabbcc112233'),
}));

import { readSetupConfig } from '../src/db';

const MOCK_CONFIG = {
  licenseKey: 'LIC-SVP-TEST1234-ABCD-XY',
  domain: 'test.client.com',
  runtimeKey: 'base64:cachedkey==',
  setupAt: new Date(),
  licenseServerUrl: 'http://localhost:3001',
};

function mockFetch(response: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => response,
  });
}

describe('LicensePlatform', () => {
  beforeEach(() => {
    vi.mocked(readSetupConfig).mockResolvedValue(MOCK_CONFIG);
    vi.clearAllMocks();
  });

  it('returns valid result on successful verify', async () => {
    mockFetch({ valid: true, runtime_key: 'v1:newkey==', expires_at: '2027-01-01T00:00:00Z' });

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    const result = await sdk.verify();

    expect(result.valid).toBe(true);
    expect(result.runtimeKey).toBe('v1:newkey==');
    expect(result.fromCache).toBeUndefined();
  });

  it('caches result and returns fromCache on second call', async () => {
    mockFetch({ valid: true, runtime_key: 'v1:key==' });

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    await sdk.verify();
    const cached = await sdk.verify();

    expect(cached.fromCache).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns invalid when server says revoked', async () => {
    mockFetch({ valid: false, reason: 'REVOKED' });

    const onInvalid = vi.fn();
    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0', onInvalid });
    const result = await sdk.verify();

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('REVOKED');
    expect(onInvalid).toHaveBeenCalledWith('REVOKED');
  });

  it('returns invalid when server says domain mismatch', async () => {
    mockFetch({ valid: false, reason: 'DOMAIN_MISMATCH' });

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    const result = await sdk.verify();

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('DOMAIN_MISMATCH');
  });

  it('returns SETUP_INCOMPLETE when no DB config', async () => {
    vi.mocked(readSetupConfig).mockResolvedValue(null);

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    const result = await sdk.verify();

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SETUP_INCOMPLETE');
  });

  it('uses grace period when server is unreachable (after prior success)', async () => {
    // First call succeeds
    mockFetch({ valid: true, runtime_key: 'v1:key==' });
    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0', cacheTtl: 0 });
    await sdk.verify();

    // Second call — server down
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sdk.verify();

    expect(result.valid).toBe(true);
    expect(result.gracePeriod).toBe(true);
    expect(result.gracePeriodHoursRemaining).toBeGreaterThan(0);
  });

  it('returns SERVER_UNREACHABLE when server is down and no prior success', async () => {
    vi.mocked(readSetupConfig).mockResolvedValue({ ...MOCK_CONFIG, runtimeKey: '' });
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    const result = await sdk.verify();

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SERVER_UNREACHABLE');
  });

  it('returns cached DB runtime key on first unreachable if available', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    const result = await sdk.verify();

    // MOCK_CONFIG.runtimeKey is set, so grace period should apply
    expect(result.valid).toBe(true);
    expect(result.gracePeriod).toBe(true);
    expect(result.runtimeKey).toBe(MOCK_CONFIG.runtimeKey);
  });

  it('getRuntimeKey() returns null before verify', () => {
    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    expect(sdk.getRuntimeKey()).toBeNull();
  });

  it('getRuntimeKey() returns key after successful verify', async () => {
    mockFetch({ valid: true, runtime_key: 'v1:mykey==' });
    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.1.0' });
    await sdk.verify();
    expect(sdk.getRuntimeKey()).toBe('v1:mykey==');
  });

  it('verifyDuringSetup calls server with explicit params', async () => {
    mockFetch({ valid: true, runtime_key: 'v1:setupkey==' });

    const sdk = new LicensePlatform({ productId: 'SHOPVPS', version: '2.0.0' });
    const result = await sdk.verifyDuringSetup({
      key: 'LIC-SVP-AAAABBBB-CCCC-DD',
      serverUrl: 'http://localhost:3001',
      domain: 'newclient.com',
    });

    expect(result.valid).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/verify',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.key).toBe('LIC-SVP-AAAABBBB-CCCC-DD');
    expect(body.product_id).toBe('SHOPVPS');
    expect(body.domain).toBe('newclient.com');
  });
});

describe('collectFingerprint (mocked)', () => {
  it('returns sha256: prefixed string', async () => {
    const { collectFingerprint } = await import('../src/fingerprint');
    const fp = collectFingerprint();
    expect(fp).toMatch(/^sha256:/);
  });
});
