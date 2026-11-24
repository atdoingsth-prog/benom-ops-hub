import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { apiSend, AuthUser, setAuthToken } from '../api';

interface Props {
  onSuccess: (user: AuthUser) => void;
}

export default function LoginScreen({ onSuccess }: Props) {
  const [email, setEmail] = useState('admin@benom.vn');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiSend<{ token: string; user: AuthUser }>('/api/auth/login', 'POST', { email, password });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#E6DDD1] overflow-hidden">
        <div className="bg-[#3B281A] text-[#F8F4EC] px-7 py-7 text-center">
          <div className="text-4xl font-bold tracking-tight">benom</div>
          <div className="text-xs uppercase tracking-widest text-[#D6BCA5] mt-1">Operations Hub • Kohnan Việt Nam</div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          <div className="text-center mb-2">
            <h1 className="text-lg font-bold text-[#3B281A]">Đăng nhập nội bộ</h1>
            <p className="text-xs text-[#6e5543]">Hệ thống điều phối, kho 9005, phụ cấp KTV & hậu mãi</p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-[#9A2B26] text-[#9A2B26] text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#6e5543] mb-1">Email tài khoản</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ten@benom.vn"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D6BCA5] text-sm focus:outline-none focus:border-[#3B281A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6e5543] mb-1">Mật khẩu</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D6BCA5] text-sm focus:outline-none focus:border-[#3B281A]"
              />
            </div>
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#3B281A] text-[#F8F4EC] font-semibold text-sm hover:bg-[#563C28] transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>

          <div className="pt-3 border-t border-[#EFE7DC] text-[11px] text-[#6e5543] space-y-1">
            <div className="flex items-center gap-1 font-semibold text-[#3B281A]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#234E36]" /> Tài khoản khởi tạo mặc định (mật khẩu: <code className="bg-[#F8F4EC] px-1 rounded">benom2026</code>):
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              {[
                ['admin@benom.vn', 'Admin (Toàn quyền)'],
                ['store@benom.vn', 'Store/CSKH (Sửa)'],
                ['ktv@benom.vn', 'KTV (Ký BM-01)'],
                ['viewer@benom.vn', 'Quản lý (Chỉ xem)'],
              ].map(([em, lbl]) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => { setEmail(em); setPassword('benom2026'); }}
                  className="text-left px-2 py-1 rounded-lg bg-[#FAF7F2] hover:bg-[#EFE7DC] border border-[#E6DDD1] cursor-pointer"
                >
                  <div className="font-semibold text-[#3B281A]">{lbl}</div>
                  <div className="text-[10px] text-[#6e5543]">{em}</div>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
