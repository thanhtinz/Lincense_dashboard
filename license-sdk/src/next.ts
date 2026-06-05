/**
 * Next.js middleware integration.
 *
 * Usage in middleware.ts (root of product):
 *
 *   import { createLicenseMiddleware } from '@yourcompany/license-sdk/next';
 *
 *   const licenseMiddleware = createLicenseMiddleware({
 *     productId: 'SHOPVPS',
 *     version: process.env.npm_package_version!,
 *   });
 *
 *   export default licenseMiddleware;
 *
 *   export const config = {
 *     matcher: ['/((?!_next/static|_next/image|favicon.ico|setup).*)'],
 *   };
 */

// Minimal structural type for NextRequest — avoids a hard dependency on `next`
// at type-check time. Real Next.js NextRequest is structurally compatible.
interface NextRequestLike {
  nextUrl: { pathname: string };
  url: string;
}

import { LicensePlatform, type LicensePlatformOptions } from './core.js';

// Singleton instance per process — cache persists across requests
let _instance: LicensePlatform | null = null;

export interface LicenseMiddlewareOptions extends LicensePlatformOptions {
  /** Path of the setup wizard. Default: '/setup' */
  setupPath?: string;
  /** Path of the maintenance page. Default: '/maintenance' */
  maintenancePath?: string;
  /** Public paths that bypass license check (besides setup/maintenance). */
  publicPaths?: string[];
}

/**
 * Returns a Next.js middleware function that:
 * 1. Redirects to /setup if setup is not complete.
 * 2. Redirects to /maintenance if license is invalid.
 * 3. Passes through all other requests if license is valid.
 */
export function createLicenseMiddleware(options: LicenseMiddlewareOptions) {
  const setupPath = options.setupPath ?? '/setup';
  const maintenancePath = options.maintenancePath ?? '/maintenance';
  const publicPaths = options.publicPaths ?? [];

  if (!_instance) {
    _instance = new LicensePlatform({
      ...options,
      onInvalid: (reason) => {
        console.error(`[LicenseSDK] License invalid: ${reason}`);
        options.onInvalid?.(reason);
      },
      onGracePeriod: (hours) => {
        console.warn(`[LicenseSDK] Server unreachable — grace period: ${hours}h remaining`);
        options.onGracePeriod?.(hours);
      },
    });
  }

  return async function licenseMiddleware(req: NextRequestLike) {
    // Lazy import Next.js server — avoids bundling issues + lets the SDK
    // type-check without `next` installed. The string is built to prevent
    // tsc from statically resolving the optional peer module.
    const mod = 'next/server';
    const { NextResponse } = await import(/* @vite-ignore */ mod);

    const pathname = req.nextUrl.pathname;

    // Always allow: static assets, API routes
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname === '/favicon.ico' ||
      publicPaths.some(p => pathname.startsWith(p))
    ) {
      return NextResponse.next();
    }

    // Always allow setup and maintenance pages themselves
    if (pathname.startsWith(setupPath) || pathname.startsWith(maintenancePath)) {
      return NextResponse.next();
    }

    // Check setup complete
    const setupComplete = await _instance!.isSetupComplete();
    if (!setupComplete) {
      return NextResponse.redirect(new URL(setupPath, req.url));
    }

    // Verify license
    const result = await _instance!.verify();

    if (!result.valid) {
      // Redirect to maintenance with reason in query string
      const url = new URL(maintenancePath, req.url);
      url.searchParams.set('reason', result.reason ?? 'INVALID');
      return NextResponse.redirect(url);
    }

    // Attach grace period warning header for the app to display
    const response = NextResponse.next();
    if (result.gracePeriod && result.gracePeriodHoursRemaining !== undefined) {
      response.headers.set(
        'X-License-Grace-Period',
        String(result.gracePeriodHoursRemaining)
      );
    }

    return response;
  };
}

/**
 * Get the singleton LicensePlatform instance (after createLicenseMiddleware called).
 * Use this in Server Components to access getRuntimeKey().
 */
export function getLicenseInstance(): LicensePlatform | null {
  return _instance;
}
