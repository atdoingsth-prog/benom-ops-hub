import React, { useEffect, useState } from 'react';
import { Calculator, CheckCircle2, Download, Users } from 'lucide-react';
import { apiGet, fmtVnd, getAuthToken } from '../api';

interface Props {
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function AllowanceView({ onToast }: Props) {
  const [month, setMonth] = useState('2026-10');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async (m: string) => {
    setLoading(true);
    try {
      setData(await apiGet(`/api/allowance?month=${encodeURIComponent(m)}`));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(month); }, [month]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Phụ Cấp Kỹ Thuật Viên (BEN-PRO-TechnicianAllowance)</h1>
          <p className="text-xs text-[#6e5543] mt-0.5">
            Tự động hóa 7 cột: <code className="bg-[#EFE7DC] px-1 rounded">(P_Handling × SL × K_Floor) + (P_Install × SL) + P_Distance</code> • Tự chia đều cho 1, 2, 3, 4... KTV tham gia • 0% lỗi #REF!
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-semibold text-[#3B281A]"
          >
            <option value="2026-11">Tháng 11/2026</option>
            <option value="2026-10">Tháng 10/2026</option>
            <option value="2026-09">Tháng 09/2026</option>
            <option value="">Tất cả các tháng</option>
          </select>
          <a
            href={`/api/allowance/export?month=${encodeURIComponent(month)}&token=${encodeURIComponent(getAuthToken())}`}
            className="px-3.5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1b3d2a]"
          >
            <Download className="w-4 h-4" /> Xuất Excel chốt kỳ (HR/ACC)
          </a>
        </div>
      </div>

      {loading || !data ? (
        <div className="p-8 text-center text-[#6e5543]">Đang tính bảng phụ cấp...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#3B281A] text-[#F8F4EC] rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-[#D6BCA5]">
                <span>Tổng Chi Phụ Cấp Kỳ {month || 'Tất cả'}</span>
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
            <div className="px-4 py-3 bg-[#F8F4EC] border-b border-[#E6DDD1] flex items-center justify-between">
              <span className="font-bold text-sm text-[#3B281A]">Bảng Chi Tiết 7 Cột Theo Từng Sản Phẩm</span>
              <span className="text-[11px] text-[#6e5543]">P_Distance chỉ cộng 1 lần/đơn • K_Floor = 1.2 khi đi thang bộ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">Ngày / Hóa đơn</th>
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
                    <tr><td colSpan={9} className="py-8 text-center text-[#6e5543]">Không có đơn lắp đặt nào trong kỳ này.</td></tr>
                  ) : data.lines.map((l: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#FAF7F2]">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-[#3B281A]">{l.invoice_no}</div>
                        <div className="text-[11px] text-[#6e5543]">{l.date} • {l.customer_name}</div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[220px]">
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
