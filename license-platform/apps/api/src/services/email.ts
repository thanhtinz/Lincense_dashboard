import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';

// ── Transporter ───────────────────────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM || 'License Platform <noreply@yourdomain.com>';

// ── Email Templates ───────────────────────────────────────────────────────
function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:0; padding:0; background:#0a0c0f; font-family:'Segoe UI',sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .card { background:#111418; border:1px solid rgba(255,255,255,0.07); border-radius:8px; overflow:hidden; }
  .header { background:#0d1b2a; padding:28px 32px; border-bottom:1px solid rgba(255,255,255,0.07); }
  .header-logo { display:flex; align-items:center; gap:10px; }
  .header-dot { width:8px; height:8px; background:#00e5ff; border-radius:50%; display:inline-block; }
  .header-title { color:#00e5ff; font-size:13px; font-family:monospace; letter-spacing:0.15em; text-transform:uppercase; }
  .body { padding:32px; }
  .key { font-family:monospace; font-size:13px; background:rgba(0,229,255,0.06); border:1px solid rgba(0,229,255,0.2); color:#00e5ff; padding:6px 12px; border-radius:4px; display:inline-block; }
  .info-row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
  .info-label { color:#4a5568; font-size:13px; }
  .info-value { color:#e8edf2; font-size:13px; }
  .btn { display:inline-block; background:#00e5ff; color:#0a0c0f; font-weight:600; font-size:13px; padding:10px 24px; border-radius:6px; text-decoration:none; margin-top:24px; }
  .footer { padding:20px 32px; border-top:1px solid rgba(255,255,255,0.05); color:#4a5568; font-size:11px; font-family:monospace; }
  .badge { display:inline-block; font-size:12px; font-weight:600; padding:3px 10px; border-radius:4px; }
  .badge-warn { background:rgba(255,167,30,0.12); color:#ffa71e; border:1px solid rgba(255,167,30,0.25); }
  .badge-danger { background:rgba(255,77,109,0.12); color:#ff4d6d; border:1px solid rgba(255,77,109,0.25); }
  .badge-success { background:rgba(0,255,136,0.08); color:#00ff88; border:1px solid rgba(0,255,136,0.2); }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="header-logo">
        <span class="header-dot"></span>
        <span class="header-title">License Platform</span>
      </div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      License Platform · Automated notification · Do not reply to this email
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Send functions ────────────────────────────────────────────────────────

export async function sendExpiryWarning(params: {
  to: string;
  customerName: string;
  licenseKey: string;
  productName: string;
  expiresAt: Date;
  daysRemaining: number;
}): Promise<void> {
  const { to, customerName, licenseKey, productName, expiresAt, daysRemaining } = params;
  const urgency = daysRemaining <= 7 ? 'danger' : 'warn';
  const urgencyText = daysRemaining <= 7 ? 'Khan cap' : 'Canh bao';

  const content = `
    <p style="color:#e8edf2;font-size:15px;margin:0 0 20px">
      Xin chào <strong>${customerName}</strong>,
    </p>
    <p style="color:#8892a0;font-size:14px;line-height:1.7;margin:0 0 24px">
      License của bạn sắp hết hạn.
      <span class="badge badge-${urgency}">${urgencyText} — còn ${daysRemaining} ngày</span>
    </p>

    <div style="margin-bottom:24px">
      <div class="info-row">
        <span class="info-label">License Key</span>
        <span class="key">${licenseKey}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Sản phẩm</span>
        <span class="info-value">${productName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Hết hạn lúc</span>
        <span class="info-value" style="color:${urgency === 'danger' ? '#ff4d6d' : '#ffa71e'}">
          ${expiresAt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>

    <p style="color:#8892a0;font-size:13px;line-height:1.7">
      Để tiếp tục sử dụng không gián đoạn, vui lòng liên hệ gia hạn trước ngày hết hạn.
      Sau khi gia hạn, license tự động hoạt động lại — không cần cài đặt lại.
    </p>

    <a href="mailto:support@yourdomain.com?subject=Gia hạn license: ${licenseKey}" class="btn">
      Liên hệ gia hạn →
    </a>`;

  const subject = `[${urgencyText}] License ${productName} còn ${daysRemaining} ngày — ${licenseKey.slice(-8)}`;

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject,
    html: baseTemplate(content),
  });
}

export async function sendRevokeNotice(params: {
  to: string;
  customerName: string;
  licenseKey: string;
  productName: string;
  reason: string;
}): Promise<void> {
  const { to, customerName, licenseKey, productName, reason } = params;

  const content = `
    <p style="color:#e8edf2;font-size:15px;margin:0 0 20px">
      Xin chào <strong>${customerName}</strong>,
    </p>
    <p style="color:#8892a0;font-size:14px;line-height:1.7;margin:0 0 24px">
      License của bạn đã bị <span class="badge badge-danger">Thu hồi</span>
    </p>

    <div style="margin-bottom:24px">
      <div class="info-row">
        <span class="info-label">License Key</span>
        <span class="key">${licenseKey}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Sản phẩm</span>
        <span class="info-value">${productName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Lý do</span>
        <span class="info-value" style="color:#ff4d6d">${reason}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Thời điểm</span>
        <span class="info-value">${new Date().toLocaleString('vi-VN')}</span>
      </div>
    </div>

    <p style="color:#8892a0;font-size:13px;line-height:1.7">
      Nếu bạn cho rằng đây là nhầm lẫn hoặc muốn khiếu nại, vui lòng liên hệ hỗ trợ.
    </p>

    <a href="mailto:support@yourdomain.com?subject=Khiếu nại thu hồi license: ${licenseKey}" class="btn" style="background:#ff4d6d">
      Liên hệ hỗ trợ →
    </a>`;

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: `[License bị thu hồi] ${productName} — ${licenseKey.slice(-8)}`,
    html: baseTemplate(content),
  });
}

export async function sendIssueConfirmation(params: {
  to: string;
  customerName: string;
  licenseKey: string;
  productName: string;
  domains: string[];
  expiresAt: Date | null;
  versionRange: string | null;
}): Promise<void> {
  const { to, customerName, licenseKey, productName, domains, expiresAt, versionRange } = params;

  const content = `
    <p style="color:#e8edf2;font-size:15px;margin:0 0 20px">
      Xin chào <strong>${customerName}</strong>,
    </p>
    <p style="color:#8892a0;font-size:14px;line-height:1.7;margin:0 0 24px">
      License của bạn đã được cấp thành công.
      <span class="badge badge-success">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline;vertical-align:middle;margin-right:4px"><path d="m20 6-11 11-5-5"/></svg>
        Kich hoat
      </span>
    </p>

    <div style="margin-bottom:24px">
      <div class="info-row">
        <span class="info-label">License Key</span>
        <span class="key">${licenseKey}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Sản phẩm</span>
        <span class="info-value">${productName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Domain</span>
        <span class="info-value" style="font-family:monospace;font-size:12px">${domains.join(', ')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phiên bản</span>
        <span class="info-value">${versionRange ?? 'Tất cả'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Hết hạn</span>
        <span class="info-value">${expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'Vinh vien'}</span>
      </div>
    </div>

    <div style="background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.12);border-radius:6px;padding:16px;margin-bottom:20px">
      <p style="color:#8892a0;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.08em">Hướng dẫn kích hoạt</p>
      <p style="color:#e8edf2;font-size:13px;margin:0;line-height:1.8">
        1. Cài đặt sản phẩm trên server của bạn<br>
        2. Mở trình duyệt → truy cập <code style="color:#00e5ff">/setup</code><br>
        3. Nhập License Key ở trên + URL máy chủ license<br>
        4. Hoàn tất — hệ thống tự xác thực và mở khóa
      </p>
    </div>`;

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: `[License đã cấp] ${productName} — ${licenseKey}`,
    html: baseTemplate(content),
  });
}

// ── Cron job: send expiry warnings ────────────────────────────────────────
export async function runExpiryEmailCron(): Promise<void> {
  if (!process.env.SMTP_USER) return; // Email not configured

  const now = new Date();

  // Find licenses expiring in exactly 30 or 7 days (±12h window to avoid double-send)
  const targets = [
    { days: 30, from: addDays(now, 29, 12), to: addDays(now, 30, 12) },
    { days: 7,  from: addDays(now, 6, 12),  to: addDays(now, 7, 12) },
    { days: 1,  from: addDays(now, 0, 12),  to: addDays(now, 1, 12) },
  ];

  for (const { days, from, to } of targets) {
    const licenses = await prisma.license.findMany({
      where: {
        revoked: false,
        expiresAt: { gte: from, lt: to },
      },
      include: { product: { select: { name: true, slug: true } } },
    });

    for (const lic of licenses) {
      try {
        await sendExpiryWarning({
          to: lic.customerEmail,
          customerName: lic.customerName,
          licenseKey: lic.key,
          productName: lic.product.name,
          expiresAt: lic.expiresAt!,
          daysRemaining: days,
        });
        console.log(`[email] Expiry warning sent (${days}d): ${lic.key} → ${lic.customerEmail}`);
      } catch (err: any) {
        console.error(`[email] Failed to send expiry warning for ${lic.key}:`, err.message);
      }
    }
  }
}

function addDays(date: Date, days: number, hours = 0): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours);
  return d;
}
