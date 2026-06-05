/**
 * Reads license config from the product's own database (app_setup table).
 * The SDK never touches .env — config is stored after the setup wizard completes.
 *
 * This module uses dynamic require so products without Prisma still compile.
 */

export interface SetupConfig {
  licenseKey: string;
  domain: string;
  runtimeKey: string;    // cached from last successful verify
  setupAt: Date;
  licenseServerUrl: string;
}

let _prisma: any = null;

async function getPrisma(): Promise<any> {
  if (_prisma) return _prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    _prisma = new PrismaClient({ log: [] });
    return _prisma;
  } catch {
    throw new Error('[LicenseSDK] @prisma/client not found. Run: npm install @prisma/client');
  }
}

export async function readSetupConfig(): Promise<SetupConfig | null> {
  try {
    const prisma = await getPrisma();
    const row = await prisma.appSetup.findFirst({
      orderBy: { setupAt: 'desc' },
    });
    if (!row) return null;
    return {
      licenseKey: row.licenseKey,
      domain: row.domain,
      runtimeKey: row.runtimeKey ?? '',
      setupAt: row.setupAt,
      licenseServerUrl: row.licenseServerUrl,
    };
  } catch {
    return null;
  }
}

export async function writeSetupConfig(
  data: Omit<SetupConfig, 'setupAt'>
): Promise<void> {
  const prisma = await getPrisma();
  await prisma.appSetup.upsert({
    where: { id: 1 },
    update: {
      licenseKey: data.licenseKey,
      domain: data.domain,
      runtimeKey: data.runtimeKey,
      licenseServerUrl: data.licenseServerUrl,
    },
    create: {
      id: 1,
      licenseKey: data.licenseKey,
      domain: data.domain,
      runtimeKey: data.runtimeKey,
      licenseServerUrl: data.licenseServerUrl,
      setupAt: new Date(),
    },
  });
}

export async function isSetupComplete(): Promise<boolean> {
  const config = await readSetupConfig();
  return config !== null;
}

/**
 * Prisma schema snippet the product must add to their schema.prisma:
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
export const REQUIRED_SCHEMA_SNIPPET = `
model AppSetup {
  id               Int      @id @default(1)
  licenseKey       String
  domain           String
  runtimeKey       String   @default("")
  licenseServerUrl String
  setupAt          DateTime @default(now())

  @@map("app_setup")
}
`;
