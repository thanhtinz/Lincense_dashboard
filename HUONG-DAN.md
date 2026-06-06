# Hướng dẫn triển khai A→Z

Hướng dẫn đầy đủ để dựng License Platform và cho nó quản lý giấy phép của ShopVPS.
Đọc kèm `INTEGRATION-SHOPVPS.md` (phần đối chiếu với repo ShopVPS).

> Sơ đồ tổng quát:
> ```
> [ShopVPS của khách]  --POST /api/v1/verify-->  [license-platform API]  <--quản trị--  [license-dashboard]
>      (env LS_ENDPOINT)                              (Postgres + Redis)
> ```

---

## 0. Yêu cầu môi trường

- Node.js 18+ và npm
- PostgreSQL 14+ và Redis 6+ (chạy local, Docker, hoặc dịch vụ cloud)
- `openssl` (để sinh RSA key)
- Một tên miền cho license server, ví dụ `https://license.yourdomain.com` (production)

---

## 1. Dựng License Platform (API cấp phép)

### 1.1. Sinh secret + tạo `.env`
```bash
cd license-platform
node scripts/setup.js          # tự sinh RSA keypair + AES master key + tạo .env
```
Nếu muốn làm tay, copy `.env.example` → `.env` rồi sinh từng giá trị:
```bash
# JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# AES master key (đúng 64 ký tự hex = 32 byte)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# RSA keypair
openssl genrsa -out rsa_private.pem 2048
openssl rsa -in rsa_private.pem -pubout -out rsa_public.pem
```

### 1.2. Sửa `.env` các giá trị quan trọng
```env
DATABASE_URL=postgresql://license_user:matkhau@localhost:5432/license_platform
REDIS_URL=redis://localhost:6379
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=MatKhauManh123!
AES_MASTER_KEY=...            # 64 hex
JWT_SECRET=...
RSA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```
> Lưu ý: trong `.env`, xuống dòng của RSA key phải thay bằng `\n` (một dòng).

### 1.3. Cài đặt, migrate DB, seed dữ liệu
```bash
cd apps/api
npm install
npm run db:generate          # sinh Prisma client
npm run db:migrate           # tạo bảng
cd ../..
npm run db:seed              # tạo admin + product SHOPVPS, YOURAI (mẫu)
```
Seed đã tạo sẵn product **SHOPVPS** (prefix `SVP`, versions `1.0/1.1/2.0/2.1`).

### 1.4. Chạy API
```bash
npm run dev:api              # http://localhost:3001
```
Kiểm tra nhanh: `curl http://localhost:3001/api/v1/products` (cần token admin cho route quản trị).

---

## 2. Dựng Dashboard quản trị

```bash
cd license-dashboard
cp .env.example .env
# Sửa .env:
#   NEXT_PUBLIC_API_URL=http://localhost:3001   (URL API ở bước 1)
#   API_URL=http://localhost:3001
#   NEXTAUTH_SECRET=$(openssl rand -base64 32)
npm install
npm run dev                  # http://localhost:3000
```
Đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` đã seed → **đổi mật khẩu ngay**.

Trong dashboard bạn có: tổng quan, danh sách license, cấp key, sản phẩm, log verify.

---

## 3. Cấp license key cho khách ShopVPS

**Cách A — qua Dashboard:** vào *Licenses → New*, chọn product `SHOPVPS`, nhập
`domains` (whitelist tên miền khách sẽ chạy), `version_range`, ngày hết hạn.

**Cách B — qua API (cURL):**
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"MatKhauManh123!"}' | jq -r '.token')

curl -X POST http://localhost:3001/api/v1/issue \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "product_id": "SHOPVPS",
    "customer_name": "Nguyen Van A",
    "customer_email": "vana@gmail.com",
    "domains": ["shop.khachhang.com"],
    "version_range": "2.x",
    "expires_at": "2027-01-01T00:00:00Z",
    "hw_binding": false
  }'
```
→ Nhận key dạng `LIC-SVP-XXXXXXXX-XXXX-XX`. Gửi key này cho khách.

> `version_range`: để trống = mọi version. Nếu giới hạn (vd `"2.x"`) phải khớp version
> ShopVPS thật gửi lên, nếu không sẽ trả `VERSION_NOT_LICENSED`.

---

## 4. Kết nối ShopVPS với license server

ShopVPS **đã có sẵn** phần client (middleware + setup wizard). Việc cần làm:

1. Trên môi trường chạy ShopVPS, đặt biến môi trường:
   ```env
   LS_ENDPOINT=https://license.yourdomain.com
   ```
   (Mặc định fallback là `https://license.yourdomain.com` — **phải đổi** thành URL
   license server thật của bạn ở bước 1.)
2. Mở ShopVPS, vào trang `/setup`, nhập license key vừa cấp ở bước 3.
3. ShopVPS sẽ gọi `POST {LS_ENDPOINT}/api/v1/verify`, nhận `valid: true` + `runtime_key`,
   lưu vào bảng `app_setup` của nó → vào được `/dashboard`.

> ⚠️ **Không** nhúng `license-sdk` (trong repo này) vào ShopVPS — ShopVPS tự lo phần client,
> nhúng vào sẽ xung đột schema `AppSetup`. Xem `INTEGRATION-SHOPVPS.md`.

---

## 5. Vận hành license

| Việc | Cách làm |
|---|---|
| Thu hồi key (revoke) | Dashboard, hoặc `POST /api/v1/revoke {"key":"LIC-SVP-..."}` — có hiệu lực ngay lần verify kế tiếp |
| Gia hạn | `PATCH /api/v1/issue/:id/extend` |
| Đổi domain | `POST /api/v1/register-domain {"key":"...","new_domain":"..."}` (giới hạn số lần đổi) |
| Xem log/thống kê | Dashboard *Logs*, hoặc `GET /api/v1/logs`, `/logs/stats`, `/logs/expiring` |

Cơ chế bảo vệ phía client: ShopVPS cache kết quả verify, có **grace period 24h** khi
server down (vẫn chạy), quá 24h thì chặn về trang maintenance.

---

## 6. Production (tùy chọn)

- **Railway + Neon** (khuyến nghị, đơn giản nhất): xem **`DEPLOY-RAILWAY.md`** —
  Postgres chạy trên Neon, Redis dùng plugin Railway, deploy 2 service api + dashboard.
- `license-infra/` — Docker Compose + Nginx + SSL + script backup/ops (tự host).
  Sửa `license-infra/.env.example`, trỏ domain, bật HTTPS.
- Chạy API bằng Docker: `cd license-platform && npm run docker:up`.

### Email + Webhook (đã tích hợp sẵn trong API)

Tính năng email (xác nhận cấp key, thông báo thu hồi, cảnh báo hết hạn 30/7/1 ngày)
và webhook (sự kiện `license.issued`, `license.revoked`, `license.verified`…) **đã được
tích hợp thẳng vào license-platform**. Để bật:
1. Điền `SMTP_*` + `EMAIL_FROM` trong `.env` của API (xem `.env.example`).
2. Quản lý webhook qua route `/api/v1/webhooks` (hoặc cURL) — tạo webhook nhận sẽ
   trả secret 1 lần; verify chữ ký qua header `X-License-Signature`.

---

## Checklist nhanh

- [ ] Postgres + Redis chạy được
- [ ] `.env` của API đã có AES/JWT/RSA + DATABASE_URL + REDIS_URL
- [ ] `db:migrate` + `db:seed` chạy xong, product SHOPVPS tồn tại
- [ ] API chạy ở `:3001`, dashboard ở `:3000`, đăng nhập + đổi mật khẩu admin
- [ ] Cấp được 1 key `LIC-SVP-...` cho domain test
- [ ] ShopVPS đặt `LS_ENDPOINT` đúng, `/setup` nhập key → `valid: true`
