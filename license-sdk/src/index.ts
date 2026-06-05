export { LicensePlatform } from './core.js';
export type { LicensePlatformOptions, VerifyResult } from './core.js';

export { collectFingerprint } from './fingerprint.js';

export {
  readSetupConfig,
  writeSetupConfig,
  isSetupComplete,
  REQUIRED_SCHEMA_SNIPPET,
} from './db.js';
export type { SetupConfig } from './db.js';

export { createLicenseMiddleware, getLicenseInstance } from './next.js';
export type { LicenseMiddlewareOptions } from './next.js';
