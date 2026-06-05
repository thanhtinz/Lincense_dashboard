/**
 * Example: How to integrate @yourcompany/license-sdk into ShopVPS
 *
 * File: middleware.ts (place at root of your Next.js product)
 */

import { createLicenseMiddleware } from '@yourcompany/license-sdk';

// ── One-line integration ───────────────────────────────────────────────────
export default createLicenseMiddleware({
  productId: 'SHOPVPS',             // hardcoded — do not change
  version: process.env.npm_package_version ?? '1.0.0',
  cacheTtl: 3600,                   // re-verify every 1 hour
  gracePeriodHours: 24,             // keep running 24h if server down
  collectHwFingerprint: false,      // enable for Locked licenses

  onInvalid: (reason) => {
    // Optional: log to your monitoring, send alert email, etc.
    console.error(`[License] Invalid: ${reason}`);
  },
  onGracePeriod: (hoursRemaining) => {
    console.warn(`[License] Grace period active — ${hoursRemaining}h remaining`);
  },
});

// ── Matcher: exclude static files and the setup/maintenance pages ──────────
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|setup|maintenance).*)',
  ],
};

// =============================================================================

/**
 * Example: prisma/schema.prisma — add this model to your product's schema
 *
 * model AppSetup {
 *   id               Int      @id @default(1)
 *   licenseKey       String
 *   domain           String
 *   runtimeKey       String   @default("")
 *   licenseServerUrl String
 *   setupAt          DateTime @default(now())
 *
 *   @@map("app_setup")
 * }
 */

// =============================================================================

/**
 * Example: app/setup/page.tsx — first-run setup wizard in the product
 *
 * The wizard must:
 * 1. Detect current domain from window.location.hostname
 * 2. Call license server /verify via SDK's verifyDuringSetup()
 * 3. On success: save config to DB via writeSetupConfig()
 * 4. Redirect to /dashboard — middleware will now pass through
 */

// src/app/api/setup/verify/route.ts
export async function POST_EXAMPLE(req: Request) {
  const { LicensePlatform, writeSetupConfig } = await import('@yourcompany/license-sdk');
  const { key, serverUrl, domain } = await req.json();

  const sdk = new LicensePlatform({
    productId: 'SHOPVPS',
    version: process.env.npm_package_version ?? '1.0.0',
  });

  const result = await sdk.verifyDuringSetup({ key, serverUrl, domain });

  if (result.valid) {
    await writeSetupConfig({
      licenseKey: key,
      domain,
      runtimeKey: result.runtimeKey ?? '',
      licenseServerUrl: serverUrl,
    });
    return Response.json({ success: true });
  }

  return Response.json({ success: false, reason: result.reason }, { status: 400 });
}
