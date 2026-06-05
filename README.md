# License Platform — Full System

Hệ thống quản lý giấy phép đa sản phẩm (multi-product license management),
gồm server cấp phép, dashboard quản trị và hạ tầng triển khai. Dùng để quản lý
giấy phép cho sản phẩm **ShopVPS** (xem `INTEGRATION-SHOPVPS.md`).

> Hướng dẫn triển khai từng bước: **`HUONG-DAN.md`**.

## Cấu trúc

```
├── license-platform/     # 1. API Core — Express + Prisma + PostgreSQL + Redis
│                         #    verify / issue / revoke / products / logs
│                         #    + email cảnh báo hết hạn + webhook (đã tích hợp sẵn)
│
├── license-dashboard/    # 2. Admin Dashboard — Next.js 14
│                         #    overview, licenses, issue key, products, verify logs
│
└── license-infra/        # 3. Production infra — Docker, Nginx, SSL, Backup, Ops
```

## Thứ tự triển khai

1. **license-platform** — dựng server cấp phép trước (xem README bên trong)
2. **license-dashboard** — dựng UI quản trị, trỏ về API
3. **license-infra** — đóng gói Docker + Nginx + SSL để deploy production
4. Cấp key cho ShopVPS và trỏ ShopVPS về server qua env `LS_ENDPOINT`
   (chi tiết trong `INTEGRATION-SHOPVPS.md`)

## Tích hợp với ShopVPS

ShopVPS **đã có sẵn phần client** (middleware, fingerprint, setup wizard, model
`AppSetup`, `src/lib/license/client.ts` gọi `/api/v1/verify`). Vì vậy chỉ cần dựng
**phía server** (license-platform + dashboard) và trỏ ShopVPS về qua biến môi trường
`LS_ENDPOINT`. **Không** nhúng thêm SDK vào ShopVPS. Xem `INTEGRATION-SHOPVPS.md`.

Mỗi thư mục con có README riêng với hướng dẫn chi tiết.
