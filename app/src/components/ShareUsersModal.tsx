import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Mail, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { apiGet, apiSend } from '../api';

interface Props {
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin (Toàn quyền)',
  EDITOR: 'Chỉnh sửa (Store / CSKH)',
  KTV: 'KTV Hiện trường (BM-01)',
  VIEWER: 'Chỉ xem (Viewer)',
};

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = 'Bn';
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export default function ShareUsersModal({ onClose, onToast }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [mailerReady, setMailerReady] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ email: string; fullName: string; password: string; role: string; sent: boolean; error?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() => ({
    email: '',
    full_name: '',
    department: 'Store 3001',
    role: 'VIEWER',
    password: generateTempPassword(),
    send_email: true,
  }));

  const load = async () => {
    try {
      const [list, ms] = await Promise.all([
        apiGet('/api/users'),
        apiGet<{ configured: boolean }>('/api/users/mailer-status').catch(() => ({ configured: false })),
      ]);
      setUsers(list);
      setMailerReady(Boolean(ms.configured));
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  useEffect(() => { load(); }, []);

  const buildInviteText = (inv: { email: string; fullName: string; password: string; role: string }) => {
    const appUrl = window.location.origin;
    return [
      `Xin chào ${inv.fullName},`,
      `Bạn đã được mời tham gia hệ thống vận hành nội bộ benom Operations Hub.`,
      `- Đường dẫn: ${appUrl}`,
      `- Email đăng nhập: ${inv.email}`,
      `- Mật khẩu: ${inv.password}`,
      `- Quyền truy cập: ${ROLE_LABELS[inv.role] || inv.role}`,
    ].join('\n');
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = { email: form.email, fullName: form.full_name, password: form.password, role: form.role };
      const res = await apiSend('/api/users', 'POST', form);
      const sent = Boolean(res.email_result?.sent);
      setLastInvite({ ...created, sent, error: res.email_result?.error });
      if (sent) {
        onToast(`Đã tạo tài khoản & gửi email mời tới ${form.email}!`);
      } else {
        onToast(`Đã tạo tài khoản ${form.email}! (Chưa cấu hình SMTP — bạn có thể sao chép hoặc gửi mail nhanh bên dưới)`);
      }
      setForm({ email: '', full_name: '', department: 'Store 3001', role: 'VIEWER', password: generateTempPassword(), send_email: true });
      load();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setSubmitting(false);
    }
  };

  const updateUser = async (u: any, patch: any) => {
    try {
      const res = await apiSend(`/api/users/${u.id}`, 'PUT', { ...u, ...patch });
      if (res.email_result?.sent) {
        onToast(`Đã cập nhật & gửi email mật khẩu mới tới ${u.email}!`);
      } else {
        onToast(`Đã cập nhật quyền cho ${u.email}`);
      }
      load();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const resetPassword = async (u: any) => {
    const pwd = prompt(`Nhập mật khẩu mới cho ${u.email} (tối thiểu 4 ký tự):`);
    if (!pwd || pwd.trim().length < 4) return;
    await updateUser(u, { new_password: pwd.trim() });
  };

  const deleteUser = async (u: any) => {
    if (!confirm(`Bạn chắc chắn muốn xóa vĩnh viễn tài khoản ${u.email} (${u.full_name})?`)) return;
    try {
      await apiSend(`/api/users/${u.id}`, 'DELETE');
      onToast(`Đã xóa tài khoản ${u.email}`);
      load();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const copyInvite = async () => {
    if (!lastInvite) return;
    await navigator.clipboard.writeText(buildInviteText(lastInvite));
    onToast('Đã sao chép lời mời + mật khẩu! Bạn có thể dán gửi qua Zalo/Email.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[#E6DDD1]">
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D6BCA5]" />
            <div>
              <div className="font-bold text-sm">Chia Sẻ & Phân Quyền Truy Cập (Như Google Sheets)</div>
              <div className="text-[11px] text-[#D6BCA5]">
                Thêm thành viên team benom • {mailerReady ? 'Email mời tự động: ĐÃ BẬT ✓' : 'Email tự động: Chưa cấu hình SMTP (Có sẵn nút gửi nhanh)'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Add Member Form */}
          <form onSubmit={addUser} className="bg-[#F8F4EC] p-4 rounded-xl border border-[#D6BCA5] space-y-3">
            <div className="font-bold text-[#3B281A] flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-[#234E36]" /> Mời / Tạo tài khoản thành viên mới
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email (VD: tuan.ktv@benom.vn)" className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white" />
              <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Họ và tên" className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white" />
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white font-semibold">
                <option value="VIEWER">Chỉ xem (Viewer — Sếp / Marketing)</option>
                <option value="KTV">KTV Hiện trường (Ký BM-01 / 4G)</option>
                <option value="EDITOR">Chỉnh sửa (Store 3001 / CSKH / Sales)</option>
                <option value="ADMIN">Admin (Toàn quyền)</option>
              </select>
              <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mật khẩu khởi tạo" className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-[#3B281A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.send_email}
                  onChange={e => setForm({ ...form, send_email: e.target.checked })}
                  className="accent-[#234E36]"
                />
                <span>Tự động gửi Email mời kèm mật khẩu tới thành viên này</span>
              </label>
              <button disabled={submitting} type="submit" className="px-4 py-2 rounded-lg bg-[#234E36] text-white font-semibold hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60">
                {submitting ? 'Đang tạo & gửi mail...' : '+ Cấp quyền truy cập'}
              </button>
            </div>
          </form>

          {/* Invite Result Banner */}
          {lastInvite && (
            <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${lastInvite.sent ? 'bg-emerald-50 border-[#234E36] text-[#234E36]' : 'bg-amber-50 border-amber-400 text-amber-950'}`}>
              <div className="font-bold flex items-center gap-1.5">
                {lastInvite.sent ? <CheckCircle2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                {lastInvite.sent
                  ? `Đã gửi email mời kèm mật khẩu tới ${lastInvite.email}!`
                  : `Đã tạo tài khoản ${lastInvite.email} (Email tự động chưa gửi được: ${lastInvite.error || 'Chưa cấu hình SMTP'})`}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyInvite} className="px-3 py-1.5 rounded-lg bg-white border border-[#D6BCA5] text-[#3B281A] font-semibold flex items-center gap-1 hover:bg-[#F8F4EC] cursor-pointer">
                  <Copy className="w-3.5 h-3.5" /> Sao chép tin nhắn mời (Zalo)
                </button>
                <a
                  href={`mailto:${encodeURIComponent(lastInvite.email)}?subject=${encodeURIComponent('[benom Operations Hub] Lời mời tham gia hệ thống')}&body=${encodeURIComponent(buildInviteText(lastInvite))}`}
                  className="px-3 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold flex items-center gap-1 hover:bg-[#563C28]"
                >
                  <Mail className="w-3.5 h-3.5" /> Mở Gmail / Outlook gửi ngay
                </a>
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <div className="font-bold text-[#3B281A] flex items-center gap-1.5">
              <Shield className="w-4 h-4" /> Danh sách người có quyền truy cập ({users.length})
            </div>
            <div className="divide-y divide-[#EFE7DC] border border-[#E6DDD1] rounded-xl overflow-hidden">
              {users.map(u => (
                <div key={u.id} className={`p-3 flex flex-wrap items-center justify-between gap-2 bg-white ${!u.active ? 'opacity-50' : ''}`}>
                  <div>
                    <div className="font-bold text-[#3B281A]">{u.full_name}</div>
                    <div className="text-[11px] text-[#6e5543]">{u.email} • {u.department}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={u.role}
                      onChange={e => updateUser(u, { role: e.target.value })}
                      className="px-2 py-1.5 rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] font-semibold text-[11px]"
                    >
                      <option value="ADMIN">Admin (Toàn quyền)</option>
                      <option value="EDITOR">Chỉnh sửa (Editor)</option>
                      <option value="KTV">KTV (BM-01)</option>
                      <option value="VIEWER">Chỉ xem (Viewer)</option>
                    </select>
                    <button
                      onClick={() => resetPassword(u)}
                      className="p-1.5 rounded-lg border border-[#D6BCA5] text-[#3B281A] hover:bg-[#F8F4EC] cursor-pointer"
                      title="Đổi mật khẩu (tự gửi mail nếu đã bật SMTP)"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateUser(u, { active: u.active ? 0 : 1 })}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        u.active ? 'bg-amber-50 text-amber-800 hover:bg-amber-100' : 'bg-emerald-50 text-[#234E36]'
                      }`}
                    >
                      {u.active ? 'Khóa' : 'Mở lại'}
                    </button>
                    <button
                      onClick={() => deleteUser(u)}
                      className="p-1.5 rounded-lg bg-red-50 text-[#9A2B26] hover:bg-red-100 cursor-pointer"
                      title="Xóa vĩnh viễn tài khoản"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
