# License Platform — Full System

Hệ thống quản lý giấy phép đa sản phẩm (multi-product license management),
gồm server cấp phép, dashboard quản trị, SDK tích hợp, và hạ tầng triển khai.

## Cấu trúc

```
license-system-full/
├── license-platform/     # 1. API Core — Express + Prisma + PostgreSQL + Redis
│                         #    verify / issue / revoke / products / logs
│
├── license-dashboard/    # 2. Admin Dashboard — Next.js 14
│                         #    overview, licenses, issue key, products, verify logs
│
├── license-sdk/          # 3. SDK — @yourcompany/license-sdk
│                         #    cài vào sản phẩm: middleware, grace period, fingerprint
│
├── license-extras/       # 4. Email + Webhook add-on (drop vào API)
│                         #    expiry warning email, webhook delivery + retry
│
├── license-infra/        # 5. Production infra — Docker, Nginx, SSL, Backup, Ops
│
├── license-loadtest/     # 6. Load test suite + benchmark report (HTML)
│
└── maintenance-page/     # 7. Trang bảo trì cho sản phẩm khi license invalid
```

## Thứ tự triển khai

1. **license-platform** — dựng server cấp phép trước (xem README bên trong)
2. **license-extras** — copy email/webhook services vào API (tùy chọn)
3. **license-dashboard** — dựng UI quản trị, trỏ về API
4. **license-infra** — đóng gói Docker + Nginx + SSL để deploy production
5. **license-sdk** — publish/link vào từng sản phẩm (ShopVPS, YourAI...)
6. **maintenance-page** — copy vào sản phẩm
7. **license-loadtest** — chạy benchmark sau khi deploy

## Trạng thái

Tất cả code đã pass `tsc --noEmit` (0 lỗi) và SDK pass 12/12 unit test.
Không dùng emoji — toàn bộ icon là SVG/CSS hoặc text thuần.

Mỗi thư mục con có README riêng với hướng dẫn chi tiết.

## Lưu ý khớp với repo sản phẩm (ShopVPS)

Trước khi tích hợp SDK vào ShopVPS, kiểm tra 3 điểm:
1. **Endpoint** — ShopVPS gọi nội bộ `/api/setup/verify-key`, route này phải
   trỏ tới `https://<license-server>/api/v1/verify` của License Platform.
2. **Fingerprint** — ShopVPS dùng `SHA-256(CPU + MAC + platform)`.
   SDK `collectFingerprint()` cần khớp đúng công thức này nếu bật hardware binding.
3. **AppSetup schema** — field trong bảng `app_setup` của ShopVPS phải khớp
   field SDK đọc/ghi: licenseKey, domain, runtimeKey, licenseServerUrl, setupAt.
