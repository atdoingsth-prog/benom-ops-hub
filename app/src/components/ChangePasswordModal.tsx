import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';
import { apiSend, setAuthToken } from '../api';

interface Props {
  email: string;
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function ChangePasswordModal({ email, onClose, onToast }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có tối thiểu 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiSend<{ ok: boolean; token?: string }>('/api/auth/change-password', 'POST', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (res.token) setAuthToken(res.token);
      onToast('Đã đổi mật khẩu thành công! Các phiên đăng nhập cũ trên thiết bị khác đã tự động đăng xuất.');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể đổi mật khẩu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[#E6DDD1]">
        <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <KeyRound className="w-4 h-4 text-[#D6BCA5]" />
            <span>Đổi mật khẩu cá nhân</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/15 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-xs">
          <div className="text-[#6e5543]">
            Tài khoản: <strong className="text-[#3B281A] font-mono">{email}</strong>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-[#9A2B26] text-[#9A2B26] font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="font-semibold text-[#6e5543]">Mật khẩu hiện tại *</label>
            <div className="relative mt-1">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 pr-9 rounded-lg border border-[#D6BCA5]"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-2.5 top-2 text-[#6e5543] hover:text-[#3B281A] cursor-pointer"
                title={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#6e5543]">Mật khẩu mới (tối thiểu 6 ký tự) *</label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#D6BCA5]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#6e5543]">Nhập lại mật khẩu mới *</label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#D6BCA5]"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">
            Hủy
          </button>
          <button
            disabled={saving}
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Đang cập nhật...' : 'Lưu mật khẩu mới'}
          </button>
        </div>
      </form>
    </div>
  );
}
