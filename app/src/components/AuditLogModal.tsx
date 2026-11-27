import React, { useEffect, useState } from 'react';
import { History, Search, X } from 'lucide-react';
import { apiGet } from '../api';

interface Props {
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

const ENTITY_OPTIONS = [
  ['', 'Tất cả phân hệ'],
  ['ALLOWANCE', 'Chốt / Mở khóa Phụ cấp KTV'],
  ['DELIVERY_3PL', 'Phí 3PL (POS)'],
  ['3PL', 'Gộp / Nạp POS 3PL'],
  ['ORDER', 'Đơn hàng & Điều phối'],
  ['WAREHOUSE_SLIP', 'Phiếu Kho 9005 (NK/XK)'],
  ['ERP', 'Nạp ERP CSV'],
  ['PRODUCT', 'Định mức Master SKU'],
  ['BM03', 'BM-03 Thu hồi Cấp 3'],
  ['BM04', 'BM-04 Sự cố / Claim 3PL'],
  ['QC_RETURN', 'QC Trả xưởng NCC'],
  ['SPARE_PART', 'Kho Ngũ Kim KTV'],
  ['USER', 'Tài khoản & Phân quyền'],
  ['SYSTEM', 'Hệ thống / Sao lưu'],
];

export default function AuditLogModal({ onClose, onToast }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [entityType, setEntityType] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await apiGet(`/api/audit-logs?entity_type=${encodeURIComponent(entityType)}&q=${encodeURIComponent(q)}&limit=120`));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityType]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-[#E6DDD1]">
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#D6BCA5]" />
            <div>
              <div className="font-bold text-sm">Nhật Ký Kiểm Toán & Thay Đổi Dữ Liệu (Audit Trail)</div>
              <div className="text-[11px] text-[#D6BCA5]">Ghi nhận tự động ai sửa gì, lúc nào (GMT+7) phục vụ đối soát Kế toán (ACC) & Quản trị nội bộ.</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1]">
          <form onSubmit={e => { e.preventDefault(); load(); }} className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Tìm mã chứng từ, tên nhân sự, nội dung thay đổi..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs"
              />
            </div>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-semibold"
            >
              {ENTITY_OPTIONS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Lọc</button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-xs text-[#6e5543]">Đang tải nhật ký kiểm toán...</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6e5543]">Chưa có bản ghi kiểm toán nào phù hợp bộ lọc.</div>
          ) : (
            <div className="divide-y divide-[#F0E9DF] border border-[#E6DDD1] rounded-xl overflow-hidden text-xs">
              {logs.map(l => (
                <div key={l.id} className="p-3 hover:bg-[#FAF7F2] flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#3B281A] text-[#F8F4EC] text-[10px] font-bold">{l.entity_type}</span>
                      <span className="px-2 py-0.5 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[10px] font-mono font-bold text-[#3B281A]">{l.action}</span>
                      {l.entity_id && <span className="font-mono text-[11px] font-semibold text-[#224B85]">#{l.entity_id}</span>}
                    </div>
                    <div className="text-[#2A1E15] font-medium">{l.summary}</div>
                    {(l.before_json || l.after_json) && (
                      <div className="text-[10px] font-mono text-[#6e5543] bg-[#FAF7F2] px-2 py-1 rounded border border-[#EFE7DC] break-all">
                        {l.before_json ? <span>Trước: {l.before_json} </span> : null}
                        {l.after_json ? <span>→ Sau: {l.after_json}</span> : null}
                      </div>
                    )}
                  </div>
                  <div className="sm:text-right shrink-0 text-[11px] text-[#6e5543]">
                    <div className="font-semibold text-[#3B281A]">{l.user_name} ({l.user_role})</div>
                    <div className="font-mono text-[10px]">{l.created_at}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
