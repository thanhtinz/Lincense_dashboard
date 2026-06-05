# @yourcompany/license-sdk

SDK tích hợp License Platform vào sản phẩm Next.js/Node.js.

## Install

```bash
npm install @yourcompany/license-sdk
# hoặc link local trong monorepo:
# npm install ../license-sdk
```

## Tích hợp vào sản phẩm (3 bước)

### Bước 1: Thêm model vào prisma/schema.prisma

```prisma
model AppSetup {
  id               Int      @id @default(1)
  licenseKey       String
  domain           String
  runtimeKey       String   @default("")
  licenseServerUrl String
  setupAt          DateTime @default(now())

  @@map("app_setup")
}
```

```bash
npx prisma migrate dev --name add_app_setup
```

### Bước 2: Tạo middleware.ts ở root

```ts
import { createLicenseMiddleware } from '@yourcompany/license-sdk';

export default createLicenseMiddleware({
  productId: 'SHOPVPS',        // hardcode — không đổi
  version: process.env.npm_package_version!,
  cacheTtl: 3600,              // re-verify mỗi 1 giờ
  gracePeriodHours: 24,        // chạy tiếp 24h nếu server down
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|setup|maintenance).*)'],
};
```

### Bước 3: Tạo setup wizard (first-run)

Tạo route API `src/app/api/setup/verify/route.ts`:

```ts
import { LicensePlatform, writeSetupConfig } from '@yourcompany/license-sdk';

export async function POST(req: Request) {
  const { key, serverUrl, domain } = await req.json();

  const sdk = new LicensePlatform({
    productId: 'SHOPVPS',
    version: process.env.npm_package_version!,
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
```

Tạo trang `src/app/setup/page.tsx` với form nhập:
- License Server URL (e.g. `https://license.yourdomain.com`)
- License Key (e.g. `LIC-SVP-A3F9X2YZ-KC82-A9`)
- Sau đó gọi API trên → nếu `success: true` → redirect `/dashboard`

---

## API Reference

### `createLicenseMiddleware(options)` — Next.js middleware

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `productId` | `string` | required | Product slug — hardcode trong source |
| `version` | `string` | required | App version từ package.json |
| `cacheTtl` | `number` | `3600` | Cache TTL (giây) |
| `gracePeriodHours` | `number` | `24` | Grace period khi server down |
| `collectHwFingerprint` | `boolean` | `false` | Gửi hardware fingerprint |
| `setupPath` | `string` | `'/setup'` | Redirect về đây nếu chưa setup |
| `maintenancePath` | `string` | `'/maintenance'` | Redirect về đây nếu license invalid |
| `publicPaths` | `string[]` | `[]` | Paths bỏ qua kiểm tra |
| `onInvalid` | `(reason) => void` | — | Callback khi license invalid |
| `onGracePeriod` | `(hours) => void` | — | Callback khi trong grace period |

### `LicensePlatform` class

```ts
const sdk = new LicensePlatform({ productId, version, ...options });

// Verify license (cached, với retry + grace period)
const result = await sdk.verify();
// => { valid: true, runtimeKey: '...', fromCache?: true, gracePeriod?: true }

// Verify trong setup wizard (không dùng cache/DB)
const result = await sdk.verifyDuringSetup({ key, serverUrl, domain });

// Lấy runtime key sau khi verify thành công
const key = sdk.getRuntimeKey(); // string | null

// Check setup wizard đã hoàn thành chưa
const ready = await sdk.isSetupComplete(); // boolean
```

### `writeSetupConfig(config)` / `readSetupConfig()`

Đọc/ghi config vào bảng `app_setup` trong DB của sản phẩm.

---

## Verify Result

```ts
{
  valid: boolean;
  reason?: 'KEY_NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'DOMAIN_MISMATCH'
         | 'VERSION_NOT_LICENSED' | 'HW_MISMATCH' | 'SETUP_INCOMPLETE'
         | 'SERVER_UNREACHABLE' | 'GRACE_PERIOD_EXHAUSTED' | 'GRACE_PERIOD';
  runtimeKey?: string;       // AES key để decrypt source/config
  fromCache?: boolean;       // true nếu từ in-memory cache
  gracePeriod?: boolean;     // true nếu đang trong grace period
  gracePeriodHoursRemaining?: number;
}
```

---

## Flow hoàn chỉnh

```
Khách cài lần đầu:
  npm run dev → middleware → isSetupComplete? → false → /setup
  /setup → nhập licenseServerUrl + licenseKey
  → POST /api/setup/verify → verifyDuringSetup()
  → license server trả về { valid: true, runtime_key }
  → writeSetupConfig() lưu vào DB
  → redirect /dashboard ✓

App đang chạy (mỗi request):
  middleware → isSetupComplete? → true
  → verify() → cache hit? → pass through ✓
  → cache stale → gọi license server
  → valid → cache + pass through ✓
  → invalid → /maintenance

License bị revoke:
  license server trả về { valid: false, reason: 'REVOKED' }
  → middleware → redirect /maintenance?reason=REVOKED
  → onInvalid() callback fired

License server down:
  0-24h: grace period → app chạy bình thường + warning header
  24h+: redirect /maintenance?reason=GRACE_PERIOD_EXHAUSTED
```
