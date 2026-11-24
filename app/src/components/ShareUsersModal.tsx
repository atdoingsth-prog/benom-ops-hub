import React, { useEffect, useState } from 'react';
import { KeyRound, Shield, UserPlus, Users, X } from 'lucide-react';
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

export default function ShareUsersModal({ onClose, onToast }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    department: 'Store 3001',
    role: 'VIEWER',
    password: 'benom2026',
  });

  const load = async () => {
    try {
      setUsers(await apiGet('/api/users'));
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  useEffect(() => { load(); }, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiSend('/api/users', 'POST', form);
      onToast(`Đã cấp quyền cho ${form.email} (${ROLE_LABELS[form.role]})!`);
      setForm({ email: '', full_name: '', department: 'Store 3001', role: 'VIEWER', password: 'benom2026' });
      load();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const updateUser = async (u: any, patch: any) => {
    try {
      await apiSend(`/api/users/${u.id}`, 'PUT', { ...u, ...patch });
      onToast(`Đã cập nhật quyền cho ${u.email}`);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[#E6DDD1]">
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D6BCA5]" />
            <div>
              <div className="font-bold text-sm">Chia Sẻ & Phân Quyền Truy Cập (Như Google Sheets)</div>
              <div className="text-[11px] text-[#D6BCA5]">Thêm thành viên team benom và chọn quyền Xem / Chỉnh sửa / KTV</div>
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
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#234E36] text-white font-semibold hover:bg-[#1b3d2a] cursor-pointer">
                + Cấp quyền truy cập
              </button>
            </div>
          </form>

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
                      title="Đổi mật khẩu"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateUser(u, { active: u.active ? 0 : 1 })}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        u.active ? 'bg-red-50 text-[#9A2B26] hover:bg-red-100' : 'bg-emerald-50 text-[#234E36]'
                      }`}
                    >
                      {u.active ? 'Khóa' : 'Mở lại'}
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
