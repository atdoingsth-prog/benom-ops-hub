import React, { useEffect, useState } from 'react';
import {
  Activity, Check, Clock, Copy, Database, Download, HardDrive, ShieldCheck, X
} from 'lucide-react';
import { apiDownload, apiGet, fmtNum } from '../api';

interface Props {
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

function formatUptime(sec: number): string {
  if (!sec || sec < 60) return `${sec || 0}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút`;
}

export default function BackupHealthModal({ onClose, onToast }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<'full' | 'lite' | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const healthUrl = `${window.location.origin}/api/health`;

  const loadStatus = async () => {
    setLoading(true);
    try {
      setStatus(await apiGet('/api/admin/system-status', { force: true }));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleBackup = async (includeMedia: boolean) => {
    const mode = includeMedia ? 'full' : 'lite';
    setDownloading(mode);
    try {
      const tag = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      await apiDownload(
        `/api/admin/backup?include_media=${includeMedia ? '1' : '0'}`,
        `benom_ops_backup_${tag}_${mode}.json`
      );
      onToast(`Đã tải xuống bản sao lưu ${includeMedia ? 'đầy đủ (kèm ảnh/chữ ký)' : 'nhanh (nhẹ)'}!`);
      loadStatus();
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setDownloading(null);
    }
  };

  const copyHealthUrl = async () => {
    try {
      await navigator.clipboard.writeText(healthUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      onToast('Không thể sao chép tự động — hãy bôi đen URL bên dưới.', 'err');
    }
  };

  const ramPct = status?.memory
    ? Math.min(100, Math.round((status.memory.rss_mb / status.memory.render_free_limit_mb) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-[#E6DDD1]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-[#D6BCA5]" />
            <div>
              <div className="font-bold text-sm">Sao Lưu Dữ Liệu & Sức Khỏe Hệ Thống ($0 Cloud)</div>
              <div className="text-[11px] text-[#D6BCA5]">Chủ quyền dữ liệu 100% • Giám sát RAM Render Free (512 MB) • Chống Cold Start</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {loading || !status ? (
            <div className="py-8 text-center text-[#6e5543]">Đang kiểm tra trạng thái hệ thống & cơ sở dữ liệu...</div>
          ) : (
            <>
              {/* System Health KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1]">
                  <div className="flex items-center justify-between text-[#6e5543]">
                    <span>Cơ sở dữ liệu</span>
                    <ShieldCheck className="w-4 h-4 text-[#234E36]" />
                  </div>
                  <div className="font-bold text-sm text-[#3B281A] mt-1">
                    {status.mode === 'turso-cloud' ? 'Turso Cloud ($0)' : 'Local SQLite'}
                  </div>
                  <div className="text-[11px] text-[#6e5543] mt-0.5">
                    Tổng: <strong>{fmtNum(status.total_rows)}</strong> bản ghi
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1]">
                  <div className="flex items-center justify-between text-[#6e5543]">
                    <span>RAM máy chủ (RSS)</span>
                    <HardDrive className={`w-4 h-4 ${ramPct > 80 ? 'text-[#9A2B26]' : 'text-[#224B85]'}`} />
                  </div>
                  <div className="font-bold text-sm text-[#3B281A] mt-1">
                    {status.memory.rss_mb} <span className="font-normal text-[#6e5543]">/ {status.memory.render_free_limit_mb} MB</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#E6DDD1] rounded-full overflow-hidden mt-1.5">
                    <div
                      className={`h-full rounded-full ${ramPct > 80 ? 'bg-[#9A2B26]' : ramPct > 60 ? 'bg-amber-600' : 'bg-[#234E36]'}`}
                      style={{ width: `${ramPct}%` }}
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1]">
                  <div className="flex items-center justify-between text-[#6e5543]">
                    <span>Thời gian hoạt động</span>
                    <Activity className="w-4 h-4 text-[#234E36]" />
                  </div>
                  <div className="font-bold text-sm text-[#3B281A] mt-1">{formatUptime(status.uptime_s)}</div>
                  <div className="text-[11px] text-[#6e5543] mt-0.5">Giờ VN: {status.vn_time}</div>
                </div>
              </div>

              {/* 1-Click Backup Actions */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-[#234E36]/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-[#234E36]">Sao Lưu Toàn Bộ Dữ Liệu Về Máy / Google Drive Nội Bộ</div>
                    <div className="text-[11px] text-[#4a392d] mt-0.5">
                      Xuất 100% các bảng nghiệp vụ ra file JSON (đã nén Gzip khi tải, tự ẩn mã băm mật khẩu để đảm bảo an toàn). Khuyến nghị lưu 1 bản mỗi cuối tháng.
                    </div>
                  </div>
                </div>

                {status.last_backup && (
                  <div className="text-[11px] text-[#234E36] flex items-center gap-1.5 bg-white/80 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Sao lưu gần nhất: <strong>{status.last_backup.created_at}</strong> bởi <strong>{status.last_backup.user_name}</strong>
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={downloading !== null}
                    onClick={() => handleBackup(true)}
                    className="px-4 py-2 rounded-lg bg-[#234E36] text-white font-semibold flex items-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" />
                    {downloading === 'full' ? 'Đang đóng gói...' : 'Tải Backup Đầy Đủ (kèm ảnh & chữ ký)'}
                  </button>
                  <button
                    disabled={downloading !== null}
                    onClick={() => handleBackup(false)}
                    className="px-3.5 py-2 rounded-lg bg-white border border-[#234E36] text-[#234E36] font-semibold flex items-center gap-1.5 hover:bg-emerald-50 cursor-pointer disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" />
                    {downloading === 'lite' ? 'Đang đóng gói...' : 'Tải Backup Nhanh (không ảnh Base64)'}
                  </button>
                </div>
              </div>

              {/* Free Cold-Start Keep-Alive Setup Box */}
              <div className="p-4 rounded-xl bg-[#FAF7F2] border border-[#D6BCA5] space-y-2.5">
                <div className="font-bold text-sm text-[#3B281A]">Khử Cold Start Render Free ($0) Trong Giờ Hành Chính (08:00–20:00)</div>
                <p className="text-[11px] text-[#6e5543]">
                  Dùng dịch vụ miễn phí <strong>cron-job.org</strong> gọi URL bên dưới mỗi <strong>10 phút</strong> từ 08:00 đến 20:00 (GMT+7). Endpoint <code>/api/health</code> không truy vấn DB nên tiêu tốn <strong>0 lượt đọc Turso</strong> và giữ KTV 4G mở app tức thì không phải chờ 50 giây:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-[#E6DDD1] font-mono text-[11px] text-[#224B85] truncate">
                    {healthUrl}
                  </code>
                  <button
                    onClick={copyHealthUrl}
                    className="px-3 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold flex items-center gap-1 hover:bg-[#563C28] cursor-pointer shrink-0"
                  >
                    {copiedUrl ? <><Check className="w-3.5 h-3.5" /> Đã copy</> : <><Copy className="w-3.5 h-3.5" /> Copy URL</>}
                  </button>
                </div>
              </div>

              {/* Row Counts Breakdown */}
              <div>
                <div className="font-bold text-[#3B281A] mb-2">Chi Tiết Số Bản Ghi Theo Bảng Dữ Liệu</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {status.tables.map((t: any) => (
                    <div key={t.table} className="px-2.5 py-2 rounded-lg border border-[#EFE7DC] bg-white flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#6e5543] truncate" title={t.table}>{t.label}</span>
                      <span className="font-bold text-[#3B281A] shrink-0">{fmtNum(t.rows)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
