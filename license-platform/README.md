# License Platform

Hệ thống Quản lý License Đa Sản Phẩm — Multi-product license management server.

## Architecture

```
license-platform/
├── apps/
│   └── api/              # Express + TypeScript API server  ← Phase 1 ✅
│       └── src/
│           ├── routes/   # verify, issue, revoke, products, auth, logs
│           ├── middleware/  # auth (JWT), rateLimit (Redis)
│           └── lib/      # crypto, prisma, redis, version
├── prisma/
│   ├── schema.prisma     # DB schema
│   └── seed.ts           # Initial data seed
├── scripts/
│   └── setup.js          # One-time setup (generates keys, .env)
└── docker-compose.yml
```

## Quick Start

### 1. Initial Setup

```bash
node scripts/setup.js
```

Tự động generate RSA keypair + AES master key + tạo `.env`.

### 2. Edit `.env`

```env
DATABASE_URL=postgresql://license_user:password@localhost:5432/license_platform
REDIS_URL=redis://localhost:6379
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=StrongPassword123!
```

### 3. Install & Migrate

```bash
cd apps/api
npm install
npm run db:generate   # Generate Prisma client
npm run db:push       # Sync schema to DB (no migration files in repo)
npm run db:seed       # Create admin + sample products
```

### 4. Start

```bash
npm run dev:api
# API: http://localhost:3001
```

### Docker (Production)

```bash
# Edit docker-compose.yml — set all environment variables
docker-compose up -d
```

---

## API Reference

Base URL: `https://license.yourdomain.com/api/v1`

### Public Endpoints (No Auth)

#### `POST /verify` — Verify License (called by products)

```json
{
  "key": "LIC-SVP-A3F9X2YZ-KC82-A9",
  "product_id": "SHOPVPS",
  "version": "2.1.0",
  "domain": "client.shopvps.com",
  "hw_fingerprint": "sha256:abc123...",
  "timestamp": 1735689600000,
  "nonce": "unique-request-id"
}
```

**Success response:**
```json
{
  "valid": true,
  "runtime_key": "v1:base64encodedkey...",
  "expires_at": "2027-01-01T00:00:00Z",
  "product": "SHOPVPS",
  "version_ok": true
}
```

**Failure response:**
```json
{
  "valid": false,
  "reason": "DOMAIN_MISMATCH"
}
```

Possible `reason` values: `KEY_NOT_FOUND`, `PRODUCT_MISMATCH`, `REVOKED`, `EXPIRED`, `DOMAIN_MISMATCH`, `VERSION_NOT_LICENSED`, `HW_MISMATCH`, `RATE_LIMITED`

#### `POST /register-domain` — Update Domain Whitelist

```json
{ "key": "LIC-SVP-...", "new_domain": "newdomain.com" }
```

---

### Admin Endpoints (Bearer Token Required)

#### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Get JWT token |
| `GET` | `/auth/me` | Current admin info |
| `POST` | `/auth/change-password` | Change password |

#### License Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/issue` | Create new license key |
| `GET` | `/issue` | List licenses (paginated + filtered) |
| `GET` | `/issue/:id` | License details + verify logs |
| `PATCH` | `/issue/:id/extend` | Extend expiry date |
| `POST` | `/revoke` | Revoke by key (immediate effect) |
| `POST` | `/revoke/bulk` | Bulk revoke by IDs |
| `POST` | `/revoke/restore` | Un-revoke a license |

#### Products

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | List all products |
| `POST` | `/products` | Create product |
| `PATCH` | `/products/:id` | Update product |
| `DELETE` | `/products/:id` | Deactivate product |

#### Logs & Stats

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/logs` | Verify logs (filtered) |
| `GET` | `/logs/stats` | Dashboard statistics |
| `GET` | `/logs/expiring` | Licenses expiring soon |

---

## Issue a License (Example)

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"yourpassword"}' \
  | jq -r '.token')

# 2. Issue license
curl -X POST http://localhost:3001/api/v1/issue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "SHOPVPS",
    "customer_name": "Nguyen Van A",
    "customer_email": "vana@gmail.com",
    "domains": ["shopvps.vana.com"],
    "version_range": "2.x",
    "expires_at": "2027-01-01T00:00:00Z",
    "hw_binding": false
  }'
```

---

## Security Features

| Feature | Implementation |
|---------|----------------|
| Rate Limiting | 10 req/min per IP on `/verify`, Redis-backed, ban 1h on abuse |
| HTTPS Only | Redirect all HTTP → HTTPS in production |
| RSA Key Signing | All license keys signed with 2048-bit RSA |
| AES-256-GCM | Runtime keys encrypted at rest + in transit |
| Replay Attack | Timestamp + nonce validation, 5min window |
| IP Anomaly Detection | Alert when 1 key used from 2+ IPs in 1h |
| Hardware Binding | Optional SHA-256 fingerprint lock |
| JWT Admin Auth | 8h expiry, verified on every request |

---

## License Key Format

```
LIC-{PRODUCT_PREFIX}-{RANDOM_8}-{RANDOM_4}-{CHECKSUM_2}

Examples:
  LIC-SVP-A3F9X2YZ-KC82-A9   (ShopVPS)
  LIC-YAI-B7M2P4QR-ZX91-F3   (YourAI)
```

Characters: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0,O,1,I)

---

## Roadmap

- [x] **Phase 1** — API Core (verify, issue, revoke, products, logs)
- [ ] **Phase 2** — Admin Dashboard (Next.js)
- [ ] **Phase 3** — SDK (`@yourcompany/license-sdk`)
- [ ] **Phase 4** — Production hardening + load testing
