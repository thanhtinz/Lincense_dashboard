# License Platform — Email + Webhook Add-on

Thêm vào `license-platform/apps/api/src/`.

## Files

```
src/
  services/
    email.ts      ← Nodemailer + HTML templates (expiry warn, revoke, issue confirm)
    webhook.ts    ← HMAC signing, delivery với retry 3 lần, fire events
  routes/
    webhooks.ts   ← CRUD webhooks, test delivery, delivery history
  cron.ts         ← Thay thế cron.ts cũ — thêm email + webhook cron jobs
prisma-additions.prisma  ← 2 models cần thêm vào schema.prisma
INTEGRATION.patch        ← Chỗ cần sửa trong issue.ts / revoke.ts / verify.ts
```

## Setup

### 1. Prisma schema
Copy 2 model trong `prisma-additions.prisma` vào `prisma/schema.prisma`, rồi:
```bash
npx prisma migrate dev --name add_webhooks_and_email
```

### 2. .env
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_app_password
EMAIL_FROM="License Platform <noreply@yourdomain.com>"
```

### 3. Copy files + apply patch
```bash
cp src/services/email.ts   ../license-platform/apps/api/src/services/
cp src/services/webhook.ts ../license-platform/apps/api/src/services/
cp src/routes/webhooks.ts  ../license-platform/apps/api/src/routes/
cp src/cron.ts             ../license-platform/apps/api/src/cron.ts
```
Sau đó apply các thay đổi trong `INTEGRATION.patch` vào issue.ts / revoke.ts / verify.ts / index.ts.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/webhooks` | List webhooks |
| `POST` | `/api/v1/webhooks` | Create (trả về secret 1 lần) |
| `PATCH` | `/api/v1/webhooks/:id` | Update |
| `DELETE` | `/api/v1/webhooks/:id` | Delete |
| `POST` | `/api/v1/webhooks/:id/test` | Gửi test event |
| `POST` | `/api/v1/webhooks/:id/rotate-secret` | Rotate secret |
| `GET` | `/api/v1/webhooks/:id/deliveries` | Delivery history |
| `GET` | `/api/v1/webhooks/events` | List available events |

---

## Events

| Event | Khi nào |
|-------|---------|
| `license.issued` | Cấp key mới |
| `license.revoked` | Thu hồi |
| `license.restored` | Khôi phục |
| `license.expired` | Hết hạn (cron 00:05) |
| `license.expiring_soon` | Sắp hết hạn 30/7/1 ngày (cron 09:05) |
| `license.verified` | Verify thành công |
| `license.verify_failed` | Verify thất bại |
| `license.domain_changed` | Đổi domain |
| `*` | Tất cả |

---

## Xác thực webhook phía nhận

```ts
// Trong endpoint của sản phẩm nhận webhook
import crypto from 'crypto';

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

app.post('/webhooks/license', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-license-signature'] as string;
  if (!verifyWebhook(req.body.toString(), sig, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }
  const payload = JSON.parse(req.body.toString());
  // handle payload.event ...
  res.sendStatus(200);
});
```

---

## Email triggers

| Email | Khi nào |
|-------|---------|
| Issue confirmation | Ngay sau khi cấp key |
| Revoke notice | Ngay sau khi thu hồi |
| Expiry warning ⚠️ | 30 ngày trước hết hạn |
| Expiry warning 🚨 | 7 ngày trước hết hạn |
| Expiry warning 🆘 | 1 ngày trước hết hạn |
