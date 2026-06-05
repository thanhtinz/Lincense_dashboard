# Tích hợp License Platform với ShopVPS

Tài liệu này tổng hợp kết quả đối chiếu trực tiếp giữa hệ thống trong repo này
và repo sản phẩm thật [`thanhtinz/shopvps`](https://github.com/thanhtinz/shopvps),
kèm danh sách việc còn phải làm để License Platform quản lý được giấy phép của ShopVPS.

## TL;DR — ShopVPS đã có sẵn phần client

Điểm quan trọng nhất: **ShopVPS đã tự cài đặt đầy đủ phía client của licensing**,
nó **không cần** import `license-sdk` trong repo này. Cụ thể ShopVPS đã có:

| Thành phần | Vị trí trong ShopVPS |
|---|---|
| Gọi verify | `src/lib/license/client.ts` → `verifyLicense({ licenseKey, domain })` |
| Endpoint resolver | `src/lib/license/endpoint.ts` → `getLicenseEndpoint()` |
| Hardware fingerprint | `src/lib/license/fingerprint.ts` |
| Middleware chặn request | `middleware.ts` (root) |
| Setup wizard | `src/app/api/setup/{verify-key,complete,status}` |
| Lưu cấu hình | model `AppSetup` trong `prisma/schema.prisma` |

Vì vậy **việc cần làm không phải nhúng SDK**, mà là **dựng phía server** (license-platform
+ license-dashboard) để cấp/quản lý các key mà middleware sẵn có của ShopVPS đi xác thực.

> Ghi chú: bộ SDK nhúng (`license-sdk`) cùng `license-loadtest`, `maintenance-page` đã được
> gỡ khỏi repo này vì ShopVPS không cần. Phần email + webhook (trước ở `license-extras`) đã
> được **tích hợp thẳng vào `license-platform`**.

## Hợp đồng API — đã khớp ✓

Đối chiếu request/response giữa hai bên:

ShopVPS `client.ts` gửi `POST {LS_ENDPOINT}/api/v1/verify`:
```json
{ "key": "...", "product_id": "SHOPVPS", "version": "...", "domain": "...", "hw_fingerprint": "..." }
```
và đọc về `valid`, `reason`, `runtime_key`, `expires_at`.

`license-platform` route `apps/api/src/routes/verify.ts` nhận đúng các field này
(`timestamp`/`nonce` là optional nên việc ShopVPS không gửi không sao) và trả về
`valid`, `runtime_key`, `expires_at`, `product`, `version_ok`. **→ Khớp.**

## Đã sửa trong repo này

**Lỗi fingerprint (blocker với license khoá phần cứng).**
ShopVPS `getHardwareFingerprint()` trả về **hex 64 ký tự, không có tiền tố**.
Server cũ yêu cầu bắt buộc `sha256:` (`validateFingerprint` trả `false` nếu thiếu),
nên **mọi license bật `hwBinding` đều bị từ chối với `HW_MISMATCH`**.

Đã sửa ở `license-platform/apps/api/src/lib/crypto.ts` + `routes/verify.ts`:
`validateFingerprint` nay chấp nhận cả `sha256:<hex>` lẫn hex trần, và fingerprint
được `normalizeFingerprint()` trước khi lưu/so sánh để hai định dạng coi như bằng nhau.

> Nếu **không** dùng khoá phần cứng (`hwBinding = false`, mặc định) thì lỗi này không
> ảnh hưởng — có thể bỏ qua. Nhưng bản vá giúp bật `hwBinding` an toàn về sau.

## Việc còn phải làm (theo thứ tự)

1. **Dựng `license-platform`** — xem `license-platform/README.md`.
   Cần Postgres + Redis và sinh các secret trong `.env`:
   `AES_MASTER_KEY` (32 byte = 64 hex), `RSA_PRIVATE_KEY`/`RSA_PUBLIC_KEY`, JWT secret.
2. **Seed sản phẩm SHOPVPS** — `prisma/seed.ts` đã có sẵn entry
   `{ slug: 'SHOPVPS', prefix: 'SVP', versions: ['1.0','1.1','2.0','2.1'] }`.
   Chạy `npm run seed`. Kiểm tra `versions` phủ version thật của ShopVPS
   (`npm_package_version` mà ShopVPS gửi lên) để không dính `VERSION_NOT_LICENSED`.
3. **Dựng `license-dashboard`** — trỏ `NEXT_PUBLIC_API_URL` về API ở bước 1,
   đăng nhập bằng admin đã seed, đổi mật khẩu ngay.
4. **Cấp key cho khách** — Dashboard → Issue Key (hoặc `POST /api/v1/issue`):
   chọn product `SHOPVPS`, nhập `domains` (whitelist), `version_range`, hạn dùng…
   → nhận key dạng `LIC-SVP-XXXXXXXX-XXXX-XX`.
5. **Trỏ ShopVPS về server** — trên môi trường chạy ShopVPS, đặt biến môi trường
   **`LS_ENDPOINT=https://license.<tên-miền-của-bạn>`** (mặc định fallback là
   `https://license.yourdomain.com` — phải đổi). Sau đó vào `/setup` của ShopVPS,
   nhập license key vừa cấp; ShopVPS sẽ gọi `/api/v1/verify` và lưu vào `AppSetup`.
6. **Email + webhook** — đã tích hợp sẵn trong `license-platform`; chỉ cần điền
   `SMTP_*` trong `.env` để bật email, và quản lý webhook qua `/api/v1/webhooks`.
7. **(Tuỳ chọn) `license-infra`** — Docker + Nginx + SSL để deploy production.

## Lưu ý / điểm cần xác nhận thêm

- **Ý nghĩa `runtime_key`.** Server cấp cho mỗi license một runtime key **ngẫu nhiên**
  rồi bọc transport (`encryptForTransport` → chuỗi `v1:...`). ShopVPS lưu `runtime_key`
  **nguyên trạng** (không giải mã lớp transport), tức coi nó như token mờ. Điều này nhất
  quán nên **chạy được**, nhưng nếu ý định ban đầu là dùng runtime key để **AES-giải-mã
  source/config** của sản phẩm thì cần thống nhất lại: key phải là khoá đã mã hoá source,
  và client phải giải mã lớp transport.
- **Đừng nhúng SDK vào ShopVPS.** `AppSetup` của ShopVPS (`id` String `"singleton"`, có
  `setupBy`, không có `licenseServerUrl`) khác schema mà một SDK nhúng thường giả định.
  ShopVPS đã có code client riêng nên **không cần** và **không nên** thêm SDK — tránh xung
  đột schema. ShopVPS tự lo toàn bộ phần client.
- **`version_range` khi cấp key.** Để trống = cho mọi version; nếu giới hạn (vd `"2.x"`)
  phải khớp version ShopVPS thực gửi, nếu không sẽ `VERSION_NOT_LICENSED`.
