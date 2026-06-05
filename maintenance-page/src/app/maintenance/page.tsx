'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

// ── Reason config ─────────────────────────────────────────────────────────
const REASON_MAP: Record<string, {
  heading: string;
  headingAccent: string;
  sub: string;
  code: string;
  codeColor: string;
  desc: string;
  steps: { title: string; detail: string }[];
  grace?: { hours: number; pct: number };
}> = {
  REVOKED: {
    heading: 'Ứng dụng tạm',
    headingAccent: 'ngừng hoạt động',
    sub: 'Hệ thống phát hiện sự cố với giấy phép sử dụng. Vui lòng liên hệ nhà cung cấp để được hỗ trợ.',
    code: 'LICENSE_REVOKED',
    codeColor: '#e74c3c',
    desc: 'License key của bạn đã bị thu hồi. Điều này thường xảy ra do vi phạm điều khoản sử dụng hoặc yêu cầu từ phía nhà cung cấp.',
    steps: [
      { title: 'Liên hệ nhà cung cấp', detail: 'Gửi email đến support@yourdomain.com kèm license key của bạn.' },
      { title: 'Cung cấp thông tin', detail: 'Bao gồm tên công ty, email đăng ký, và mô tả tình huống.' },
      { title: 'Chờ phản hồi', detail: 'Thường xử lý trong 1–2 giờ trong giờ hành chính.' },
    ],
  },
  EXPIRED: {
    heading: 'Giấy phép đã',
    headingAccent: 'hết hạn',
    sub: 'License key của bạn đã quá ngày hết hạn. Gia hạn để tiếp tục sử dụng.',
    code: 'LICENSE_EXPIRED',
    codeColor: '#e67e22',
    desc: 'Giấy phép sử dụng đã hết hạn. Ứng dụng tạm thời bị khóa cho đến khi bạn gia hạn thành công.',
    steps: [
      { title: 'Gia hạn license', detail: 'Liên hệ support@yourdomain.com hoặc truy cập trang gia hạn.' },
      { title: 'Thanh toán', detail: 'Hoàn tất thanh toán — hệ thống tự động mở khóa sau 5–10 phút.' },
      { title: 'Không cần cài lại', detail: 'Key cũ sẽ tiếp tục hoạt động sau khi gia hạn, không cần thiết lập lại.' },
    ],
  },
  GRACE_PERIOD: {
    heading: 'Chế độ',
    headingAccent: 'dự phòng đang bật',
    sub: 'Không thể kết nối máy chủ cấp phép. Ứng dụng vẫn hoạt động trong thời gian chờ.',
    code: 'GRACE_PERIOD_ACTIVE',
    codeColor: '#eaa21e',
    desc: 'License server tạm thời không phản hồi. Ứng dụng chạy ở chế độ offline trong 24 giờ. Sau đó sẽ chuyển sang bảo trì nếu server vẫn chưa khôi phục.',
    steps: [
      { title: 'Không cần làm gì ngay', detail: 'Ứng dụng vẫn hoạt động bình thường trong thời gian grace period.' },
      { title: 'Theo dõi thông báo', detail: 'Nhà cung cấp đang xử lý. Thường khôi phục trong vài giờ.' },
      { title: 'Nếu quá 12 giờ', detail: 'Liên hệ support@yourdomain.com để được cập nhật tình trạng.' },
    ],
  },
  GRACE_PERIOD_EXHAUSTED: {
    heading: 'Ứng dụng',
    headingAccent: 'tạm dừng',
    sub: 'Không thể kết nối license server trong 24 giờ qua. Liên hệ nhà cung cấp để xử lý.',
    code: 'GRACE_PERIOD_EXHAUSTED',
    codeColor: '#e74c3c',
    desc: 'Thời gian grace period đã hết. Ứng dụng không thể xác thực license. Vui lòng liên hệ nhà cung cấp ngay.',
    steps: [
      { title: 'Liên hệ ngay', detail: 'Gửi email support@yourdomain.com — đây là ưu tiên xử lý khẩn.' },
      { title: 'Kiểm tra mạng', detail: 'Đảm bảo server của bạn có thể kết nối license.yourdomain.com.' },
      { title: 'Cung cấp thông tin', detail: 'Kèm license key và mô tả từ khi nào gặp sự cố.' },
    ],
  },
  DOMAIN_MISMATCH: {
    heading: 'Domain',
    headingAccent: 'không khớp',
    sub: 'License key này không được cấp phép cho domain hiện tại. Kiểm tra cấu hình hoặc cập nhật domain.',
    code: 'DOMAIN_MISMATCH',
    codeColor: '#e74c3c',
    desc: 'License đang được xác thực từ một domain không nằm trong whitelist. Nếu bạn vừa đổi domain, hãy liên hệ nhà cung cấp để cập nhật.',
    steps: [
      { title: 'Kiểm tra domain', detail: 'Đảm bảo ứng dụng đang chạy trên đúng domain đã đăng ký khi mua license.' },
      { title: 'Đổi domain mới', detail: 'Gửi yêu cầu cập nhật domain đến support@yourdomain.com kèm license key.' },
      { title: 'Xác nhận và kích hoạt lại', detail: 'Sau khi admin cập nhật, khởi động lại ứng dụng — không cần cài lại.' },
    ],
  },
  SERVER_UNREACHABLE: {
    heading: 'Máy chủ',
    headingAccent: 'không phản hồi',
    sub: 'Không thể kết nối đến license server. Đang chờ khôi phục kết nối.',
    code: 'SERVER_UNREACHABLE',
    codeColor: '#eaa21e',
    desc: 'License server hiện không thể kết nối. Có thể do sự cố mạng tạm thời hoặc bảo trì server.',
    steps: [
      { title: 'Kiểm tra kết nối mạng', detail: 'Đảm bảo server của bạn có thể kết nối internet ổn định.' },
      { title: 'Thử lại', detail: 'Nhấn nút Thử lại bên dưới sau 2–3 phút.' },
      { title: 'Liên hệ nếu kéo dài', detail: 'Nếu sau 30 phút vẫn không được, báo support@yourdomain.com.' },
    ],
  },
  SETUP_INCOMPLETE: {
    heading: 'Chưa',
    headingAccent: 'thiết lập',
    sub: 'Ứng dụng chưa được kích hoạt. Hãy hoàn tất setup wizard để bắt đầu.',
    code: 'SETUP_INCOMPLETE',
    codeColor: '#eaa21e',
    desc: 'Ứng dụng chưa được cấu hình license. Vui lòng truy cập trang thiết lập để nhập license key và hoàn tất cài đặt.',
    steps: [
      { title: 'Truy cập trang setup', detail: 'Điều hướng đến /setup để bắt đầu wizard thiết lập.' },
      { title: 'Nhập license key', detail: 'Nhập License Server URL và License Key từ nhà cung cấp.' },
      { title: 'Hoàn tất', detail: 'Tạo tài khoản admin đầu tiên và bắt đầu sử dụng.' },
    ],
  },
};

const DEFAULT_REASON = REASON_MAP.REVOKED;

// ── Component ─────────────────────────────────────────────────────────────
function MaintenanceContent() {
  const searchParams = useSearchParams();
  const reasonKey = (searchParams.get('reason') ?? 'REVOKED').toUpperCase();
  const graceHours = parseInt(searchParams.get('grace_hours') ?? '0', 10);

  const r = REASON_MAP[reasonKey] ?? DEFAULT_REASON;
  const [time, setTime] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleDateString('vi-VN') + ' · ' +
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  const isGrace = reasonKey === 'GRACE_PERIOD' && graceHours > 0;
  const gracePct = isGrace ? Math.round((graceHours / 24) * 100) : 0;

  const isSetupIncomplete = reasonKey === 'SETUP_INCOMPLETE';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0c0a06',
      color: '#f0e8d6',
      fontFamily: "'Syne', sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Diagonal grid bg */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(234,162,30,0.018) 40px, rgba(234,162,30,0.018) 41px)',
      }} />

      {/* Animated top strip */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes stripScroll { from{background-position:0 0} to{background-position:64px 0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.7)} }
        .anim-1{animation:fadeUp .45s .00s ease both}
        .anim-2{animation:fadeUp .45s .08s ease both}
        .anim-3{animation:fadeUp .45s .16s ease both}
        .anim-4{animation:fadeUp .45s .24s ease both}
        .anim-5{animation:fadeUp .45s .32s ease both}
        .anim-6{animation:fadeUp .45s .40s ease both}
        .anim-7{animation:fadeUp .45s .48s ease both}
        .contact-btn:hover{filter:brightness(1.15)}
      `}</style>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 10,
        background: 'repeating-linear-gradient(90deg,#eaa21e 0,#eaa21e 24px,transparent 24px,transparent 32px)',
        animation: 'stripScroll 4s linear infinite',
        backgroundSize: '64px 3px',
      }} />

      {/* Main container */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 540 }}>

        {/* Badge row */}
        <div className="anim-1" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#eaa21e', border: '1px solid rgba(234,162,30,0.28)',
            background: 'rgba(234,162,30,0.08)', padding: '4px 10px', borderRadius: 3,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#eaa21e', animation: 'pulseDot 1.5s ease-in-out infinite' }} />
            System Notice
          </div>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(234,162,30,0.28), transparent)' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a4232' }}>{time}</span>
        </div>

        {/* Heading */}
        <h1 className="anim-2" style={{ fontSize: 'clamp(2rem,6vw,3rem)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '1rem' }}>
          {r.heading}<br />
          <span style={{ color: '#eaa21e' }}>{r.headingAccent}</span>
        </h1>

        {/* Sub */}
        <p className="anim-3" style={{ fontSize: 15, color: '#8a7d65', lineHeight: 1.65, marginBottom: '2.5rem' }}>
          {r.sub}
        </p>

        {/* Reason card */}
        <div className="anim-4" style={{
          border: '1px solid rgba(234,162,30,0.28)',
          background: '#141209', borderRadius: 6, overflow: 'hidden', marginBottom: '1.75rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderBottom: '1px solid rgba(234,162,30,0.12)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: '#4a4232', letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            Mã lỗi
          </div>
          <div style={{ padding: '14px 16px' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 20,
              fontWeight: 500, letterSpacing: '0.04em',
              color: r.codeColor, marginBottom: 6,
            }}>
              {r.code}
            </div>
            <div style={{ fontSize: 13, color: '#8a7d65', lineHeight: 1.6 }}>
              {r.desc}
            </div>
          </div>
        </div>

        {/* Grace period bar */}
        {isGrace && (
          <div className="anim-4" style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#4a4232', marginBottom: 8 }}>
              <span>Grace period</span>
              <span style={{ color: '#eaa21e' }}>{graceHours}h còn lại</span>
            </div>
            <div style={{ height: 3, background: 'rgba(234,162,30,0.12)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${gracePct}%`, background: '#eaa21e', borderRadius: 2, transition: 'width 1s ease' }} />
            </div>
          </div>
        )}

        {/* Steps */}
        <div className="anim-5" style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a4232', marginBottom: 12 }}>
            Hướng xử lý
          </div>
          {r.steps.map((step, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid rgba(234,162,30,0.1)',
              alignItems: 'flex-start',
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#eaa21e', opacity: 0.7, minWidth: 18, marginTop: 2 }}>
                0{i + 1}
              </span>
              <div style={{ fontSize: 13, color: '#8a7d65', lineHeight: 1.6 }}>
                <span style={{ color: '#f0e8d6', fontWeight: 500 }}>{step.title}</span>
                <br />
                {step.detail}
              </div>
            </div>
          ))}
        </div>

        {/* Contact buttons */}
        <div className="anim-6" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isSetupIncomplete ? (
            <a href="/setup" className="contact-btn" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 5,
              fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s',
              border: '1px solid rgba(234,162,30,0.28)',
              background: 'rgba(234,162,30,0.08)', color: '#eaa21e',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              Bắt đầu Setup
            </a>
          ) : (
            <a href="mailto:support@yourdomain.com" className="contact-btn" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 5,
              fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s',
              border: '1px solid rgba(234,162,30,0.28)',
              background: 'rgba(234,162,30,0.08)', color: '#eaa21e',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
              Liên hệ hỗ trợ
            </a>
          )}
          <button className="contact-btn" onClick={() => window.location.reload()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 5,
            fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 500,
            cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s',
            border: '1px solid rgba(234,162,30,0.12)',
            background: 'transparent', color: '#8a7d65',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Thử lại
          </button>
        </div>

        {/* Footer */}
        <div className="anim-7" style={{
          marginTop: '3rem', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a4232',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', border: '1px solid #4a4232' }} />
            License Platform v1.0
          </div>
          <span>{r.code}</span>
        </div>
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceContent />
    </Suspense>
  );
}
