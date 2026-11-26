import React, { useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, Calculator, History, KeyRound, LayoutDashboard, LogOut, ShieldCheck, Truck, Users, Warehouse
} from 'lucide-react';
import { apiGet, AuthUser, clearAuthToken, getAuthToken, PrintDoc } from './api';
import PrintModal from './components/PrintModal';
import LoginScreen from './components/LoginScreen';
import ShareUsersModal from './components/ShareUsersModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import AuditLogModal from './components/AuditLogModal';
import DashboardView from './views/DashboardView';
import OrdersDispatchView from './views/OrdersDispatchView';
import DeliveryTrackingView from './views/DeliveryTrackingView';
import AllowanceView from './views/AllowanceView';
import WarehouseErpView from './views/WarehouseErpView';
import WarrantyQcView from './views/WarrantyQcView';
import MasterDataView from './views/MasterDataView';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'delivery3pl', label: 'Báo cáo 3PL (POS)', icon: BarChart3 },
  { id: 'orders', label: 'Điều phối & BM-01', icon: Truck },
  { id: 'allowance', label: 'Phụ cấp KTV', icon: Calculator },
  { id: 'warehouse', label: 'Kho 9005 & ERP', icon: Warehouse },
  { id: 'warranty', label: 'Bảo hành & QC', icon: ShieldCheck },
  { id: 'master', label: 'Master & HDLR', icon: BookOpen },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'Admin • Toàn quyền',
  EDITOR: 'Editor • Chỉnh sửa',
  KTV: 'KTV • Hiện trường',
  VIEWER: 'Viewer • Chỉ xem',
};

const VALID_TABS = new Set(NAV_ITEMS.map(n => n.id));

function getInitialTab(): string {
  const fromHash = window.location.hash.replace(/^#/, '').trim();
  if (VALID_TABS.has(fromHash)) return fromHash;
  const fromStorage = localStorage.getItem('benom_active_tab') || '';
  if (VALID_TABS.has(fromStorage)) return fromStorage;
  return 'dashboard';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dbMode, setDbMode] = useState('local-sqlite');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTabState] = useState<string>(getInitialTab);
  const [printDoc, setPrintDoc] = useState<PrintDoc | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null);

  const setTab = (nextTab: string) => {
    if (!VALID_TABS.has(nextTab)) return;
    setTabState(nextTab);
    localStorage.setItem('benom_active_tab', nextTab);
    if (window.location.hash !== `#${nextTab}`) {
      window.history.replaceState(null, '', `#${nextTab}`);
    }
  };

  useEffect(() => {
    // Sync URL hash on initial load and browser back/forward
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`);
    }
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, '').trim();
      if (VALID_TABS.has(h)) {
        setTabState(h);
        localStorage.setItem('benom_active_tab', h);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const showToast = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('benom-auth-expired', onExpired);
    if (getAuthToken()) {
      apiGet<{ user: AuthUser; mode: string }>('/api/auth/me')
        .then(res => { setUser(res.user); setDbMode(res.mode || 'local-sqlite'); })
        .catch(() => { clearAuthToken(); setUser(null); })
        .finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
    return () => window.removeEventListener('benom-auth-expired', onExpired);
  }, []);

  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
  };

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center text-sm text-[#6e5543]">Đang tải benom Operations Hub...</div>;
  }

  if (!user) {
    return <LoginScreen onSuccess={u => setUser(u)} />;
  }

  return (
    <div className="min-h-screen flex bg-[#F8F4EC] text-[#2A1E15]">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden md:flex md:flex-col w-60 bg-[#3B281A] text-[#F8F4EC] shrink-0 sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-[#563C28]">
          <div className="text-3xl font-bold tracking-tight text-[#F8F4EC]">benom</div>
          <div className="text-[11px] text-[#D6BCA5] mt-0.5 uppercase tracking-widest">Operations Hub</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  active ? 'bg-[#F8F4EC] text-[#3B281A] font-bold shadow-xs' : 'text-[#E6D5C3] hover:bg-[#563C28]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#563C28] text-[11px] text-[#D6BCA5] space-y-2">
          <div>
            <div className="font-semibold text-[#F8F4EC] truncate">{user.full_name}</div>
            <div className="inline-block mt-1 px-2 py-0.5 rounded bg-[#563C28] text-[#F8F4EC] text-[10px] font-semibold">
              {ROLE_BADGE[user.role] || user.role}
            </div>
          </div>

          {user.role === 'ADMIN' && (
            <button
              onClick={() => setShowShare(true)}
              className="w-full py-2 px-3 rounded-lg bg-[#D6BCA5] text-[#3B281A] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#e4d0bc] cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" /> Chia sẻ & Phân quyền
            </button>
          )}

          {user.role !== 'KTV' && (
            <button
              onClick={() => setShowAudit(true)}
              className="w-full py-1.5 px-3 rounded-lg bg-[#563C28] text-[#F8F4EC] font-medium text-[11px] flex items-center justify-center gap-1.5 hover:bg-[#6a4b33] cursor-pointer"
            >
              <History className="w-3 h-3" /> Nhật ký kiểm toán
            </button>
          )}

          <button
            onClick={() => setShowChangePwd(true)}
            className="w-full py-1.5 px-3 rounded-lg bg-[#563C28] text-[#F8F4EC] font-medium text-[11px] flex items-center justify-center gap-1.5 hover:bg-[#6a4b33] cursor-pointer"
          >
            <KeyRound className="w-3 h-3" /> Đổi mật khẩu
          </button>

          <div className="flex items-center justify-between pt-1 text-[10px] opacity-80">
            <span>{dbMode === 'turso-cloud' ? 'Cloud 24/7 (Turso)' : 'Local SQLite'}</span>
            <button onClick={handleLogout} className="flex items-center gap-1 text-[#F8F4EC] hover:underline cursor-pointer">
              <LogOut className="w-3 h-3" /> Thoát
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="no-print flex-1 min-w-0 pb-20 md:pb-8">
        {/* Mobile Top Bar */}
        <header className="md:hidden sticky top-0 z-20 bg-[#3B281A] text-[#F8F4EC] px-4 py-3 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xl font-bold tracking-tight">benom</span>
            <span className="text-[10px] text-[#D6BCA5] ml-2">{ROLE_BADGE[user.role]}</span>
          </div>
          <div className="flex items-center gap-2">
            {user.role === 'ADMIN' && (
              <button onClick={() => setShowShare(true)} className="px-2.5 py-1 rounded bg-[#D6BCA5] text-[#3B281A] text-[11px] font-bold cursor-pointer">
                Chia sẻ
              </button>
            )}
            <button onClick={() => setShowChangePwd(true)} title="Đổi mật khẩu" className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <KeyRound className="w-4 h-4" />
            </button>
            <button onClick={handleLogout} title="Đăng xuất" className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {user.role === 'VIEWER' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-[11px] text-amber-900 font-medium">
            Bạn đang đăng nhập ở chế độ <strong>Chỉ Xem (Viewer)</strong>. Liên hệ Admin để được cấp quyền chỉnh sửa.
          </div>
        )}

        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {tab === 'dashboard' && <DashboardView user={user} onToast={showToast} onNavigate={setTab} />}
          {tab === 'delivery3pl' && <DeliveryTrackingView user={user} onToast={showToast} onNavigate={setTab} />}
          {tab === 'orders' && <OrdersDispatchView user={user} onToast={showToast} onPrint={setPrintDoc} />}
          {tab === 'allowance' && <AllowanceView user={user} onToast={showToast} />}
          {tab === 'warehouse' && <WarehouseErpView user={user} onToast={showToast} onPrint={setPrintDoc} />}
          {tab === 'warranty' && <WarrantyQcView user={user} onToast={showToast} onPrint={setPrintDoc} />}
          {tab === 'master' && <MasterDataView user={user} onToast={showToast} />}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#3B281A] text-[#E6D5C3] border-t border-[#563C28] grid grid-cols-7">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`py-2.5 flex flex-col items-center justify-center gap-0.5 text-[10px] cursor-pointer ${
                active ? 'text-[#F8F4EC] bg-[#563C28] font-bold' : 'opacity-80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[56px]">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Toast Notification */}
      {toast && (
        <div className={`no-print fixed bottom-20 md:bottom-6 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white max-w-sm ${
          toast.tone === 'err' ? 'bg-[#9A2B26]' : 'bg-[#234E36]'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Printable A4 Modal */}
      <PrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />

      {/* Share & RBAC Modal (Admin) */}
      {showShare && <ShareUsersModal onClose={() => setShowShare(false)} onToast={showToast} />}

      {/* Change Password Modal (All roles) */}
      {showChangePwd && (
        <ChangePasswordModal
          email={user.email}
          onClose={() => setShowChangePwd(false)}
          onToast={showToast}
        />
      )}

      {/* Audit Trail Modal */}
      {showAudit && <AuditLogModal onClose={() => setShowAudit(false)} onToast={showToast} />}
    </div>
  );
}
