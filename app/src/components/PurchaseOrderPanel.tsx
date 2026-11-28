import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Flame, HelpCircle, PackagePlus, Search, ShoppingBag, Sparkles
} from 'lucide-react';
import { apiGet, fmtMonth, fmtNum } from '../api';
import type { PurchaseSeason } from './SupplierOrderModal';

interface Props {
  season: PurchaseSeason;
  onChangeSeason: (s: PurchaseSeason) => void;
  onOpenSupplierOrder: (params: {
    supplierName: string;
    supplierCode?: string;
    focusBarcode: string;
  }) => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  refreshKey?: number;
}

const SEASON_PILLS: Array<{ id: PurchaseSeason; label: string; badge: string }> = [
  { id: 'NORMAL', label: 'Ngày thường', badge: '×1.0' },
  { id: 'PEAK_BF', label: 'Black Friday / Cuối năm', badge: '×1.45' },
  { id: 'PEAK_TET', label: 'Cao điểm Tết', badge: '×1.65 • +10N' },
];

export default function PurchaseOrderPanel({
  season,
  onChangeSeason,
  onOpenSupplierOrder,
  onToast,
  refreshKey = 0,
}: Props) {
  const [urgency, setUrgency] = useState<'NEED_ORDER' | 'CRITICAL' | 'ALL'>('NEED_ORDER');
  const [supplier, setSupplier] = useState('ALL');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams({
      season,
      urgency,
      supplier,
      q: q.trim(),
      limit: String(limit),
      offset: '0',
    });
    apiGet(`/api/dashboard/purchase-suggestions?${qs.toString()}`, { cacheMs: 30000 })
      .then(res => {
        if (active) setData(res);
      })
      .catch((e: any) => onToast(e.message, 'err'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [season, urgency, supplier, q, limit, refreshKey]);

  const items: any[] = data?.items || [];
  const summary = data?.summary || { total_active: 0, critical_count: 0, warning_count: 0, need_order_count: 0, filtered_count: 0 };
  const suppliers: Array<{ name: string; count: number; need_count: number }> = data?.suppliers || [];
  const seasonMeta = data?.season_meta;

  return (
    <div id="purchase-order-panel" className="bg-white rounded-xl p-5 border border-[#E6DDD1] space-y-4">
      {/* Header + Seasonality Selector */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-[#3B281A] text-sm sm:text-base">
                Đặt Hàng Nhà Cung Cấp — Tồn Kho An Toàn (3001 + 9005)
              </h2>
              {summary.critical_count > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-[#9A2B26] border border-red-200 text-[11px] font-bold">
                  {summary.critical_count} Nguy cấp
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold">
                {summary.need_order_count} SKU cần đặt
              </span>
              <button
                type="button"
                onClick={() => setShowFormula(v => !v)}
                className="text-[11px] text-[#224B85] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" /> {showFormula ? 'Ẩn công thức' : 'Cách tính Tồn an toàn'}
              </button>
            </div>
            <p className="text-[11px] text-[#6e5543] mt-0.5">
              Tổng hợp tồn Store 3001 ({data?.latest3001 ? fmtMonth(data.latest3001) : '...'}) + Kho 9005 ({data?.latest9005 ? fmtMonth(data.latest9005) : '...'}) & tốc độ bán thực tế để tính mốc <strong>Tồn kho an toàn</strong> và gợi ý đặt hàng NCC.
            </p>
          </div>
        </div>

        {/* Seasonality Mode Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF7F2] p-1 rounded-xl border border-[#E6DDD1] self-start">
          {SEASON_PILLS.map(p => {
            const active = season === p.id;
            const isSuggested = data?.suggested_season === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChangeSeason(p.id); setLimit(10); }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  active
                    ? p.id === 'NORMAL'
                      ? 'bg-[#3B281A] text-white'
                      : p.id === 'PEAK_BF'
                        ? 'bg-[#9A2B26] text-white'
                        : 'bg-amber-600 text-white'
                    : 'text-[#3B281A] hover:bg-white'
                }`}
              >
                {p.id !== 'NORMAL' && <Flame className="w-3.5 h-3.5" />}
                <span>{p.label}</span>
                <span className={`px-1 rounded text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[#EFE7DC] text-[#6e5543]'}`}>
                  {p.badge}
                </span>
                {isSuggested && !active && (
                  <span className="text-[9px] font-bold text-amber-700 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" /> Gợi ý
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Collapsible Formula Explanation */}
      {showFormula && (
        <div className="rounded-xl bg-[#FAF7F2] border border-[#D6BCA5] p-3.5 text-[11px] text-[#3B281A] space-y-1">
          <div className="font-bold">Cấu trúc công thức Tồn Kho An Toàn & Điểm Đặt Hàng (benom):</div>
          <div>
            • <strong>Tốc độ bán cơ sở:</strong> Trọng số <code>70% TB 3 tháng gần nhất + 30% TB 6 tháng</code> × Hệ số mùa vụ (Nhóm A/B/C: <strong>{seasonMeta?.label || season}</strong>).
          </div>
          <div>
            • <strong>Tồn kho an toàn (Safety Stock):</strong> <code>MAX(Thống kê Z·σ·√LeadTime, Dự phòng tối thiểu 7–10 ngày bán, Sàn trưng bày)</code> — tự động nâng cao hơn cho nhóm hàng bán chạy (Nhóm A: <code>Z = 1.65</code>, +45% dịp Black Friday, +65% & +10 ngày lead time dịp Tết).
          </div>
          <div>
            • <strong>Điểm đặt hàng (ROP):</strong> <code>(Bán TB/ngày × Lead time NCC) + Tồn kho an toàn</code>. Khi <strong>Tồn 3001 + 9005 ≤ ROP</strong> → Gợi ý <strong>Đặt hàng NCC</strong> đủ cho chu kỳ 30–45 ngày tiếp theo.
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'NEED_ORDER', label: `Cần đặt hàng (${summary.need_order_count})` },
            { id: 'CRITICAL', label: `Nguy cấp (${summary.critical_count})` },
            { id: 'ALL', label: `Tất cả SKU (${summary.total_active})` },
          ].map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => { setUrgency(u.id as any); setLimit(10); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                urgency === u.id
                  ? u.id === 'CRITICAL'
                    ? 'bg-[#9A2B26] text-white border-[#9A2B26]'
                    : 'bg-[#3B281A] text-white border-[#3B281A]'
                  : 'bg-white text-[#3B281A] border-[#D6BCA5] hover:bg-[#FAF7F2]'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={supplier}
            onChange={e => { setSupplier(e.target.value); setLimit(10); }}
            className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs font-medium text-[#3B281A] max-w-[230px]"
          >
            <option value="ALL">Tất cả NCC ({suppliers.length})</option>
            {suppliers.map(s => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.need_count} cần đặt / {s.count} SKU)
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6e5543] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setLimit(10); }}
              placeholder="Tìm Barcode / Tên SP / NCC..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-[#D6BCA5] text-xs w-48 sm:w-56 outline-none focus:border-[#3B281A]"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-[#E6DDD1] rounded-xl">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543] text-[11px]">
              <th className="py-2.5 px-3">Barcode & Sản phẩm</th>
              <th className="py-2.5 px-3">Nhà Cung Cấp</th>
              <th className="py-2.5 px-2 text-right">3001 + 9005</th>
              <th className="py-2.5 px-2 text-right">Bán TB/T</th>
              <th className="py-2.5 px-2 text-right">Tồn an toàn</th>
              <th className="py-2.5 px-2 text-right">Điểm đặt (ROP)</th>
              <th className="py-2.5 px-2 text-center">Đủ bán</th>
              <th className="py-2.5 px-2 text-right">Đề xuất đặt</th>
              <th className="py-2.5 px-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0E9DF]">
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[#6e5543]">
                  Đang phân tích tồn kho 3001 + 9005 & tốc độ bán từng mã...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[#234E36]">
                  Không có mã sản phẩm nào khớp bộ lọc cần đặt hàng.
                </td>
              </tr>
            ) : items.map(it => {
              const isCrit = it.urgency === 'CRITICAL';
              const isWarn = it.urgency === 'WARNING';
              return (
                <tr key={it.barcode} className="hover:bg-[#FAF7F2]">
                  <td className="py-2.5 px-3 min-w-[210px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        it.abc_tier === 'A'
                          ? 'bg-[#234E36] text-white'
                          : it.abc_tier === 'B'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        Nhóm {it.abc_tier}
                      </span>
                      <span className="font-semibold text-[#3B281A] line-clamp-1">{it.product_name}</span>
                    </div>
                    <div className="font-mono text-[10px] text-[#6e5543] mt-0.5">{it.barcode}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-medium text-[#3B281A]">{it.supplier_name}</div>
                    <div className="text-[10px] text-[#6e5543]">Lead time: {it.lead_time_days}N</div>
                  </td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    <div className={`font-bold ${isCrit ? 'text-[#9A2B26]' : isWarn ? 'text-amber-800' : 'text-[#234E36]'}`}>
                      {fmtNum(it.total_stock)}
                    </div>
                    <div className="text-[10px] text-[#6e5543]">
                      {fmtNum(it.stock_3001)} + {fmtNum(it.stock_9005)}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    <div className="font-semibold text-[#224B85]">{it.adj_monthly_vel}</div>
                    {it.peak_monthly > 0 && (
                      <div className="text-[10px] text-[#6e5543]">Đỉnh: {fmtNum(it.peak_monthly)}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 font-bold text-amber-900">
                      {fmtNum(it.safety_stock)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-semibold text-[#3B281A]">
                    {fmtNum(it.reorder_point)}
                  </td>
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                      isCrit
                        ? 'bg-red-50 text-[#9A2B26]'
                        : isWarn
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-emerald-50 text-[#234E36]'
                    }`}>
                      {isCrit && <AlertTriangle className="w-2.5 h-2.5" />}
                      {it.doc_days >= 999 ? '—' : `${it.doc_days} ngày`}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    {it.suggested_order_qty > 0 ? (
                      <span className="font-extrabold text-[#9A2B26]">
                        +{fmtNum(it.suggested_order_qty)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#234E36] font-semibold">Đủ tồn</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenSupplierOrder({
                          supplierName: it.supplier_name,
                          supplierCode: it.supplier_code,
                          focusBarcode: it.barcode,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-[#3B281A] text-white text-[11px] font-semibold hover:bg-[#563C28] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ShoppingBag className="w-3 h-3" /> Đặt hàng
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {items.length < summary.filtered_count && (
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-[#6e5543]">
            Đang hiển thị <strong>{items.length}</strong> / {summary.filtered_count} mã
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => setLimit(l => l + 20)}
            className="px-4 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold hover:bg-[#563C28] cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Đang tải...' : `Xem thêm ${Math.min(20, summary.filtered_count - items.length)} mã`}
          </button>
        </div>
      )}
    </div>
  );
}
