import React, { useEffect, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Download, ShieldCheck, Users } from 'lucide-react';
import { apiDownload, apiGet, AuthUser, fmtMonth, fmtVnd } from '../api';

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function AllowanceView({ user, onToast }: Props) {
  const canExport = user.role === 'ADMIN' || user.role === 'EDITOR';
  const [month, setMonthState] = useState(() => localStorage.getItem('benom_allow_month') || 'LATEST');
  const [scope, setScopeState] = useState<'completed' | 'bm01_only' | 'all'>(() => {
    const saved = localStorage.getItem('benom_allow_scope');
    return saved === 'bm01_only' || saved === 'all' ? saved : 'completed';
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const setMonth = (m: string) => {
    setMonthState(m);
    localStorage.setItem('benom_allow_month', m);
  };

  const setScope = (s: 'completed' | 'bm01_only' | 'all') => {
    setScopeState(s);
    localStorage.setItem('benom_allow_scope', s);
  };

  const load = async (m: string, s: string) => {
    setLoading(true);
    try {
      const res = await apiGet(`/api/allowance?month=${encodeURIComponent(m)}&scope=${encodeURIComponent(s)}`);
      setData(res);
      if (m === 'LATEST' && res.month && res.month !== 'LATEST') {
        setMonthState(res.month);
        localStorage.setItem('benom_allow_month', res.month);
      }
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(month, scope); }, [month, scope]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const effectiveMonth = data?.month || month;
      await apiDownload(
        `/api/allowance/export?month=${encodeURIComponent(effectiveMonth)}&scope=${encodeURIComponent(scope)}`,
        `Benom_Phu_Cap_KTV_${effectiveMonth || 'ALL'}.xlsx`
      );
      onToast(`Đã xuất file Excel chốt phụ cấp kỳ ${effectiveMonth === 'ALL' ? 'Tất cả' : fmtMonth(effectiveMonth)}!`);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setExporting(false);
    }
  };

  const availableMonths: string[] = data?.available_months || [];
  const selectedMonthValue = month === 'LATEST' ? (data?.month || '') : month;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Phụ Cấp Kỹ Thuật Viên (BEN-PRO-TechnicianAllowance)</h1>
          <p className="text-xs text-[#6e5543] mt-0.5">
            Công thức chuẩn SOP: <code className="bg-[#EFE7DC] px-1 rounded">(P_Handling × SL × K_Floor) + (P_Install × SL) + P_Distance</code> • Tự chia đều N KTV • Đối soát BM-01 trước khi trình ACC.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonthValue}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-semibold text-[#3B281A]"
          >
            <option value="ALL">Tất cả các tháng</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>

          <select
            value={scope}
            onChange={e => setScope(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-semibold text-[#3B281A]"
            title="Phạm vi đơn hàng tính phụ cấp theo SOP"
          >
            <option value="completed">Đủ điều kiện thanh toán (Đã hoàn tất / BM-01)</option>
            <option value="bm01_only">Chặt theo SOP (Chỉ đơn đã ký BM-01 / Nghiệm thu)</option>
            <option value="all">Xem dự kiến (Bao gồm đơn chưa xong)</option>
          </select>

          {canExport && (
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="px-3.5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4" /> {exporting ? 'Đang xuất...' : 'Xuất Excel chốt kỳ (HR/ACC)'}
            </button>
          )}
        </div>
      </div>

      {loading || !data ? (
        <div className="p-8 text-center text-[#6e5543]">Đang tính bảng phụ cấp...</div>
      ) : (
        <>
          {/* SOP Compliance Banners */}
          {(data.excluded_pending_count > 0 || data.unverified_bm01_count > 0) && (
            <div className="flex flex-col sm:flex-row gap-2.5 text-xs">
              {data.excluded_pending_count > 0 && scope !== 'all' && (
                <div className="flex-1 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[#224B85] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Đã tự động loại trừ <strong>{data.excluded_pending_count} đơn</strong> đang ở trạng thái Chờ lắp / Đang giao (chỉ tính khi hoàn tất nghiệm thu theo SOP).
                  </span>
                </div>
              )}
              {data.unverified_bm01_count > 0 && (
                <div className="flex-1 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    Có <strong>{data.unverified_bm01_count} đơn</strong> trong bảng chưa gắn biên bản <strong>BM-01 Completed</strong> — cần bổ sung chữ ký khách hàng trước khi chuyển Kế toán đối soát (Bước 6 SOP).
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#3B281A] text-[#F8F4EC] rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-[#D6BCA5]">
                <span>Tổng Chi Phụ Cấp Kỳ {data.month === 'ALL' ? 'Tất cả' : fmtMonth(data.month)}</span>
                <Calculator className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold mt-2">{fmtVnd(data.grand_total)}</div>
              <div className="text-[11px] text-[#D6BCA5] mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {data.lines.length} dòng sản phẩm • 0 lỗi #REF!
              </div>
            </div>

            {data.summary.map((s: any) => (
              <div key={s.ktv_name} className="bg-white rounded-xl p-4 border border-[#E6DDD1] shadow-xs">
                <div className="flex items-center justify-between text-xs text-[#6e5543]">
                  <span className="font-semibold text-[#3B281A]">
                    {s.ktv_code ? <span className="font-mono text-[10px] px-1.5 py-0.5 mr-1 rounded bg-[#F8F4EC] border border-[#D6BCA5]">{s.ktv_code}</span> : null}
                    {s.ktv_name}
                  </span>
                  <Users className="w-4 h-4 text-[#224B85]" />
                </div>
                <div className="text-2xl font-bold text-[#234E36] mt-2">{fmtVnd(s.total_allowance)}</div>
                <div className="text-[11px] text-[#6e5543] mt-1">Tham gia {s.order_count} đơn lắp đặt</div>
              </div>
            ))}
          </div>

          {/* 7-Column Detail Table */}
          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="px-4 py-3 bg-[#F8F4EC] border-b border-[#E6DDD1] flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-sm text-[#3B281A]">Bảng Chi Tiết Theo Từng Sản Phẩm & Trạng Thái BM-01</span>
              <span className="text-[11px] text-[#6e5543]">P_Distance chỉ cộng 1 lần/đơn • K_Floor = 1.2 khi đi thang bộ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">Ngày / Hóa đơn</th>
                    <th className="py-2.5 px-2 text-center">Đối soát BM-01</th>
                    <th className="py-2.5 px-3">Sản phẩm</th>
                    <th className="py-2.5 px-2 text-center">SL</th>
                    <th className="py-2.5 px-2 text-center">K_Floor</th>
                    <th className="py-2.5 px-2 text-right">P_Handling</th>
                    <th className="py-2.5 px-2 text-right">P_Install</th>
                    <th className="py-2.5 px-2 text-right">P_Dist (km)</th>
                    <th className="py-2.5 px-3 text-right font-bold">Tổng Dòng</th>
                    <th className="py-2.5 px-3">Danh sách KTV & Thù lao chia đều</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {data.lines.length === 0 ? (
                    <tr><td colSpan={10} className="py-8 text-center text-[#6e5543]">Không có đơn lắp đặt đủ điều kiện trong kỳ này.</td></tr>
                  ) : data.lines.map((l: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#FAF7F2]">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-[#3B281A]">{l.invoice_no}</div>
                        <div className="text-[11px] text-[#6e5543]">{l.date} • {l.customer_name}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          l.is_verified_bm01 ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {l.bm01_doc_no ? `${l.bm01_doc_no}` : l.bm01_status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-[210px]">
                        <div className="font-medium text-[#3B281A] truncate" title={l.product_name}>{l.product_name}</div>
                        <div className="font-mono text-[10px] text-[#6e5543]">{l.barcode}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold">{l.qty}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${l.k_floor > 1 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                          {l.k_floor}x
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">{fmtVnd(l.p_handling)}</td>
                      <td className="py-2.5 px-2 text-right">{fmtVnd(l.p_installation)}</td>
                      <td className="py-2.5 px-2 text-right">
                        {l.p_distance > 0 ? (
                          <span className="text-[#224B85] font-medium">{fmtVnd(l.p_distance)} <span className="text-[10px]">({l.distance_km}km)</span></span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#3B281A]">{fmtVnd(l.total)}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(l.ktvs || []).map((k: any, ki: number) => (
                            <span key={ki} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F8F4EC] border border-[#D6BCA5] text-[11px]">
                              {k.code ? <strong className="font-mono text-[#3B281A]">{k.code}</strong> : null}
                              <span>{k.name}</span>
                              <strong className="text-[#234E36]">({fmtVnd(k.pay)})</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
