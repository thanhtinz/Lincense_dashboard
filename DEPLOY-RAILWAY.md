# Deploy lên Railway (Postgres dùng Neon)

Hướng dẫn deploy hệ thống lên [Railway](https://railway.app) với **PostgreSQL chạy trên
[Neon](https://neon.tech)** (thay cho Postgres của Railway). Redis vẫn cần và dùng plugin
Redis của Railway (hoặc Upstash).

```
                 ┌──────────────── Railway project ────────────────┐
   Neon Postgres │  [Service: api]  ──REDIS_URL──▶  [Redis plugin]  │
        ▲────────┼── DATABASE_URL ──┘                               │
        │        │  [Service: dashboard]  ──NEXT_PUBLIC_API_URL──▶ api│
        └─────────────────────────────────────────────────────────┘
ShopVPS đặt LS_ENDPOINT = URL public của service `api`.
```

Repo đã có sẵn `railway.json` cho mỗi service + Dockerfile, nên Railway tự nhận cấu hình.

> ❗ **QUAN TRỌNG — đây là monorepo:** bạn phải tạo **2 service riêng** và **set Root
> Directory** cho từng cái (`license-platform` và `license-dashboard`). Nếu để 1 service
> trỏ vào **gốc repo** mà không set Root Directory, Railway dùng builder tự động
> (**Railpack**) ở gốc và báo lỗi `railpack process exited with an error` — vì ở gốc không
> có app nào để build. Set đúng Root Directory thì Railway mới đọc `railway.json` trong thư
> mục con và build bằng Dockerfile.

---

## Bước 1 — Tạo Postgres trên Neon

1. Tạo project tại https://console.neon.tech → tạo database (vd `license_platform`).
2. Vào **Connection Details**, lấy **connection string**. Dùng bản **Direct connection**
   (KHÔNG phải `-pooler`) để Prisma migrate chạy được, dạng:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/license_platform?sslmode=require
   ```
   > `sslmode=require` là bắt buộc với Neon. Bản direct hợp cho cả migrate lẫn runtime ở
   > tải vừa. Nếu cần connection pooling cho tải cao, dùng bản `-pooler` và thêm
   > `?sslmode=require&pgbouncer=true&connection_limit=1`.
3. Giữ chuỗi này lại → sẽ dán vào biến `DATABASE_URL` của service `api`.

---

## Bước 2 — Tạo project Railway + Redis

1. https://railway.app → **New Project** → **Deploy from GitHub repo** → chọn
   `thanhtinz/Lincense_dashboard`.
2. Trong project, **New → Database → Add Redis**. Railway tạo service Redis và biến
   `REDIS_URL` (sẽ tham chiếu ở bước 3 bằng `${{Redis.REDIS_URL}}`).

---

## Bước 3 — Service `api` (license-platform)

Tạo/sửa service trỏ tới repo, đặt:

- **Settings → Root Directory:** `license-platform`
  (Railway sẽ đọc `license-platform/railway.json` → build bằng `apps/api/Dockerfile`).
- **Settings → Networking:** bấm **Generate Domain** → ghi lại URL, vd
  `https://api-production-xxxx.up.railway.app`.

**Variables** (Settings → Variables):
```
NODE_ENV=production
DATABASE_URL=<chuỗi Neon ở Bước 1>
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<sinh bên dưới>
JWT_EXPIRES_IN=8h
AES_MASTER_KEY=<sinh: 64 ký tự hex>
RSA_PRIVATE_KEY=<PEM, xuống dòng thay bằng \n>
RSA_PUBLIC_KEY=<PEM, xuống dòng thay bằng \n>
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<mật khẩu mạnh>
ADMIN_NAME=Super Admin
DASHBOARD_URL=<URL dashboard ở Bước 4 — điền sau, để CORS đúng>
# Tùy chọn email:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="License Platform <noreply@yourdomain.com>"
```

Sinh secret (chạy local):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # AES_MASTER_KEY (64 hex)
openssl genrsa -out rsa_private.pem 2048
openssl rsa -in rsa_private.pem -pubout -out rsa_public.pem
# Chuyển PEM thành 1 dòng có \n để dán vào Railway:
awk 'NR>1{printf "\\n"} {printf "%s", $0}' rsa_private.pem; echo
awk 'NR>1{printf "\\n"} {printf "%s", $0}' rsa_public.pem;  echo
```

> Khi service `api` khởi động, `docker-entrypoint.sh` **tự chạy `prisma migrate deploy`
> (tạo bảng trên Neon) + seed admin/product SHOPVPS**. Không cần thao tác thủ công.
> `PORT` do Railway tự cấp — app đã đọc `process.env.PORT`.

---

## Bước 4 — Service `dashboard` (license-dashboard)

Trong cùng project: **New → GitHub Repo** (cùng repo) tạo service thứ hai, đặt:

- **Settings → Root Directory:** `license-dashboard`
- **Settings → Networking → Generate Domain** → ghi lại URL dashboard.

**Variables:**
```
NEXT_PUBLIC_API_URL=<URL public của service api, Bước 3>
API_URL=<URL public của service api>
NEXTAUTH_URL=<URL public của dashboard>
NEXTAUTH_SECRET=<openssl rand -base64 32>
```

> ⚠️ `NEXT_PUBLIC_API_URL` phải có **trước khi build** (Next.js nhúng vào bundle client).
> Dockerfile đã khai báo `ARG NEXT_PUBLIC_API_URL`/`ARG API_URL`; Railway truyền biến
> service vào lúc build nên chỉ cần đặt ở Variables là đủ. Nếu đổi giá trị này, phải
> **Redeploy** để build lại.

---

## Bước 5 — Nối CORS + ShopVPS

1. Quay lại service `api`, đặt `DASHBOARD_URL` = URL dashboard (Bước 4) → **Redeploy**
   (production CORS chỉ cho phép origin này).
2. Trên môi trường chạy **ShopVPS**, đặt:
   ```
   LS_ENDPOINT=<URL public của service api>
   ```
   rồi vào `/setup` của ShopVPS nhập license key. Xem `INTEGRATION-SHOPVPS.md`.

---

## Bước 6 — Kiểm tra

```bash
curl https://<api-domain>/health
# {"status":"ok","db":"ok","redis":"ok",...}
```
Mở dashboard → đăng nhập bằng `ADMIN_EMAIL`/`ADMIN_PASSWORD` → **đổi mật khẩu ngay**.
Thử cấp 1 key SHOPVPS để xác nhận luồng hoạt động.

---

## Xử lý lỗi thường gặp

### `railpack process exited with an error` (hoặc "Nixpacks build failed")
Railway đang build bằng builder tự động chứ không dùng Dockerfile của mình — gần như luôn
do **chưa set Root Directory**. Khắc phục:

1. Mở service lỗi → **Settings → Source** → mục **Root Directory** → điền:
   - `license-platform` nếu đây là service **api**, hoặc
   - `license-dashboard` nếu đây là service **dashboard**.
   Bấm lưu.
2. Vào **Settings → Build**, đảm bảo **Builder = Dockerfile** (Railway sẽ tự nhận từ
   `railway.json`; nếu đang bị ép Railpack/Nixpacks thì đổi lại). Dockerfile path đã khai
   báo sẵn trong `railway.json` (`apps/api/Dockerfile` cho api).
3. **Redeploy**.
4. Nếu mới có 1 service: tạo thêm service thứ hai cho phần còn lại (xem Bước 3/Bước 4) và
   set Root Directory tương ứng. **Phải có 2 service.**

### Dashboard gọi API sai địa chỉ / lỗi CORS
- `NEXT_PUBLIC_API_URL` được nhúng **lúc build** → sau khi đổi phải **Redeploy** dashboard.
- Đặt `DASHBOARD_URL` ở service api = URL dashboard rồi redeploy api (CORS production).

### Build dashboard fail ở bước `COPY .next/standalone`
Cần `output: 'standalone'` trong `next.config.mjs` (đã bật sẵn trong repo). Nếu tự sửa
file này, đừng xoá dòng đó.

## Lưu ý

- **Redis là bắt buộc** (rate limit, chống replay nonce, anomaly). Dùng plugin Redis của
  Railway hoặc Upstash (đặt `REDIS_URL=rediss://...`).
- **Migrate tự chạy mỗi lần boot** (idempotent). Khi thêm field/bảng mới, chỉ cần redeploy.
- **Neon free tier** có auto-suspend; request đầu sau khi ngủ sẽ hơi chậm (cold start) —
  bình thường. Healthcheck timeout đã để 120s.
- Hai service nằm chung một project Railway nhưng deploy độc lập theo Root Directory.
