import nodemailer from 'nodemailer';

const ROLE_LABELS = {
  ADMIN: 'Admin (Toàn quyền quản trị)',
  EDITOR: 'Chỉnh sửa (Store / CSKH / Điều phối)',
  KTV: 'Kỹ thuật viên Hiện trường (Ký BM-01 / 4G)',
  VIEWER: 'Chỉ xem (Dashboard & Báo cáo)',
};

export function isMailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

function buildInviteHtml({ fullName, email, password, role, appUrl, invitedBy, isReset = false }) {
  const roleLabel = ROLE_LABELS[role] || role;
  const title = isReset
    ? 'Mật khẩu tài khoản benom Operations Hub của bạn vừa được cập nhật'
    : 'Bạn đã được mời tham gia benom Operations Hub';

  return `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; background:#F8F4EC; padding:24px; color:#2A1E15;">
    <div style="max-width:560px; margin:0 auto; background:#FFFFFF; border-radius:14px; overflow:hidden; border:1px solid #E6DDD1;">
      <div style="background:#3B281A; color:#F8F4EC; padding:24px 28px;">
        <div style="font-size:28px; font-weight:700; letter-spacing:-0.5px;">benom</div>
        <div style="font-size:11px; color:#D6BCA5; text-transform:uppercase; letter-spacing:2px; margin-top:4px;">Operations Hub • Kohnan Việt Nam</div>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 12px; color:#3B281A; font-size:18px;">${title}</h2>
        <p style="font-size:14px; line-height:1.6; margin:0 0 16px;">
          Xin chào <strong>${fullName}</strong>,<br/>
          <strong>${invitedBy || 'Operations Lead benom'}</strong> đã ${isReset ? 'đặt lại mật khẩu cho' : 'cấp quyền truy cập'} hệ thống vận hành nội bộ <strong>benom Operations Hub</strong> cho bạn.
        </p>

        <div style="background:#F8F4EC; border:1px solid #D6BCA5; border-radius:10px; padding:16px 18px; margin-bottom:20px; font-size:13px; line-height:1.8;">
          <div><strong>Đường dẫn đăng nhập:</strong> <a href="${appUrl}" style="color:#224B85;">${appUrl}</a></div>
          <div><strong>Email đăng nhập:</strong> <span style="font-family:monospace; font-weight:700;">${email}</span></div>
          <div><strong>Mật khẩu:</strong> <span style="font-family:monospace; font-weight:700; background:#FFFFFF; padding:2px 8px; border-radius:5px; border:1px solid #D6BCA5;">${password}</span></div>
          <div><strong>Vai trò được cấp:</strong> ${roleLabel}</div>
        </div>

        <div style="text-align:center; margin:24px 0;">
          <a href="${appUrl}" style="display:inline-block; background:#3B281A; color:#F8F4EC; text-decoration:none; padding:12px 28px; border-radius:10px; font-weight:700; font-size:14px;">
            Mở benom Operations Hub
          </a>
        </div>

        <p style="font-size:12px; color:#6e5543; line-height:1.5; margin-top:20px; border-top:1px solid #EFE7DC; padding-top:14px;">
          <em>Lưu ý bảo mật: Vui lòng không chia sẻ thông tin đăng nhập ra ngoài nội bộ Công ty TNHH Kohnan Việt Nam.</em><br/>
          Tầng 3, 35–45 Lê Thánh Tôn, P. Sài Gòn, TP.HCM | Hotline/Zalo: (+84) 964 052 051
        </p>
      </div>
    </div>
  </div>`;
}

export async function sendInviteEmail({ to, fullName, password, role, appUrl, invitedBy, isReset = false }) {
  const subject = isReset
    ? '[benom Operations Hub] Cập nhật mật khẩu đăng nhập'
    : '[benom Operations Hub] Lời mời tham gia hệ thống vận hành benom';
  const html = buildInviteHtml({ fullName, email: to, password, role, appUrl, invitedBy, isReset });

  // Option 1: Resend HTTPS API (100% reliable on Render Free)
  if (process.env.RESEND_API_KEY) {
    const from = process.env.MAIL_FROM || 'benom Operations Hub <onboarding@resend.dev>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { sent: false, configured: true, error: `Resend lỗi (${res.status}): ${errText}` };
    }
    return { sent: true, configured: true, provider: 'resend' };
  }

  // Option 2: Gmail / SMTP via Nodemailer (SMTP_USER + SMTP_PASS App Password)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    const from = process.env.MAIL_FROM || `benom Operations Hub <${process.env.SMTP_USER}>`;
    await transporter.sendMail({ from, to, subject, html });
    return { sent: true, configured: true, provider: 'smtp' };
  }

  return {
    sent: false,
    configured: false,
    error: 'Chưa cấu hình SMTP_USER/SMTP_PASS (Gmail App Password) hoặc RESEND_API_KEY trên Render.',
  };
}
