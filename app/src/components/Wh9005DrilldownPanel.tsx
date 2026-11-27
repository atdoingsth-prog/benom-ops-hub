import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, BarChart3, Package, Search, X } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { apiGet, fmtMonth, fmtNum, fmtVnd } from '../api';

type ProductMetric = 'close_qty' | 'footprint_m2' | 'close_cst';

interface Props {
  targetMonth: string;
  totalAreaM2: number;
  suppliers: any[];
  selectedSupplier: string;
  onSelectSupplier: (sup: string) => void;
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function Wh9005DrilldownPanel({
  targetMonth,
  totalAreaM2,
  suppliers,
  selectedSupplier,
  onSelectSupplier,
  onClose,
  onToast,
}: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [productMetric, setProductMetric] = useState<ProductMetric>('close_qty');
  const [chartLimit, setChartLimit] = useState<number>(15);
  const [sortBy, setSortBy] = useState<'footprint_m2' | 'close_qty' | 'close_cst'>('footprint_m2');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [highlightedBarcode, setHighlightedBarcode] = useState('');
  const [showChart, setShowChart] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiGet<{ items: any[] }>('/api/dashboard/wh9005-items', { cacheMs: 45000 })
      .then(res => { if (active) setItems(res.items || []); })
      .catch((e: any) => onToast(e.message, 'err'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleSort = (col: 'footprint_m2' | 'close_qty' | 'close_cst') => {
    if (sortBy === col) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return items
      .filter((it: any) => {
        if (selectedSupplier !== 'ALL' && it.supplier !== selectedSupplier) return false;
        if (q && !String(it.barcode || '').toLowerCase().includes(q) && !String(it.product_name || '').toLowerCase().includes(q) && !String(it.supplier || '').toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const diff = (Number(a[sortBy]) || 0) - (Number(b[sortBy]) || 0);
        return sortDir === 'desc' ? -diff : diff;
      });
  }, [items, selectedSupplier, productSearch, sortBy, sortDir]);

  const productChartData = useMemo(() => {
    if (!showChart) return [];
    const sorted = [...filteredProducts].sort((a, b) => (Number(b[productMetric]) || 0) - (Number(a[productMetric]) || 0));
    const sliced = chartLimit > 0 ? sorted.slice(0, chartLimit) : sorted;
    return sliced.map((it: any) => ({
      ...it,
      label: it.product_name.length > 28 ? it.product_name.slice(0, 28) + '…' : it.product_name,
      val: productMetric === 'close_cst'
        ? Number(((it.close_cst || 0) / 1e6).toFixed(2))
        : Number(it[productMetric] || 0),
    }));
  }, [filteredProducts, productMetric, chartLimit, showChart]);

  const filteredTotals = useMemo(() => {
    let qty = 0, area = 0, cost = 0, estRent = 0;
    for (const it of filteredProducts) {
      qty += Number(it.close_qty || 0);
      area += Number(it.footprint_m2 || 0);
      cost += Number(it.close_cst || 0);
      estRent += Number(it.est_monthly_cost || 0);
    }
    return {
      skuCount: filteredProducts.length,
      qty: Math.round(qty),
      area: Number(area.toFixed(2)),
      cost: Math.round(cost),
      estRent: Math.round(estRent),
    };
  }, [filteredProducts]);

  const metricLabel = productMetric === 'close_qty' ? 'Tồn kho (SL)' : productMetric === 'footprint_m2' ? 'Diện tích (m²)' : 'Giá trị tồn (Triệu VND)';
  const metricColor = productMetric === 'close_qty' ? '#234E36' : productMetric === 'footprint_m2' ? '#224B85' : '#3B281A';
  const chartHeight = Math.max(280, Math.min(820, productChartData.length * 30 + 50));
  const maxItemArea = useMemo(() => Math.max(0.01, ...filteredProducts.map((x: any) => Number(x.footprint_m2 || 0))), [filteredProducts]);

  return (
    <div className="bg-white rounded-xl p-5 border border-[#E6DDD1] space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-lg bg-[#F8F4EC] text-[#3B281A]">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-[#3B281A] text-base">
                Kho 9005 — Chi Tiết Tồn Kho Theo Barcode ({fmtMonth(targetMonth)})
              </h2>
              {selectedSupplier !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#3B281A] text-[#F8F4EC]">
                  NCC: {selectedSupplier}
                  <button onClick={() => onSelectSupplier('ALL')} className="hover:text-[#D6BCA5] cursor-pointer" title="Bỏ lọc NCC">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#6e5543] mt-0.5">
              Dữ liệu chỉ tải khi bạn mở tra cứu — đối chiếu diện tích chiếm dụng, tồn Store 3001 và giá trị vốn.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSupplier}
            onChange={(e) => { onSelectSupplier(e.target.value); setHighlightedBarcode(''); }}
            className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] text-xs font-medium text-[#3B281A]"
          >
            <option value="ALL">Tất cả NCC ({suppliers.length} NCC • {items.length} SKU)</option>
            {suppliers.map((s: any) => (
              <option key={s.supplier} value={s.supplier}>
                {s.supplier} ({s.area_m2} m² • {s.sku_count} SKU)
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6e5543] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Tìm Barcode / Tên SP..."
              className="pl-8 pr-7 py-1.5 rounded-lg border border-[#E6DDD1] text-xs text-[#3B281A] w-44"
            />
            {productSearch && (
              <button onClick={() => setProductSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6e5543] cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowChart(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${showChart ? 'bg-[#3B281A] text-white border-[#3B281A]' : 'bg-white text-[#3B281A] border-[#D6BCA5] hover:bg-[#F8F4EC]'}`}
          >
            {showChart ? 'Ẩn biểu đồ SP' : 'Xem biểu đồ SP'}
          </button>

          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-lg border border-[#E6DDD1] text-xs text-[#6e5543] hover:bg-[#FAF7F2] cursor-pointer"
          >
            Thu gọn
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-[#6e5543]">Đang tải chi tiết từng Barcode Kho 9005...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2">
              <div className="text-[11px] text-[#6e5543]">Số mã SKU tồn</div>
              <div className="text-base font-bold text-[#3B281A]">{fmtNum(filteredTotals.skuCount)}</div>
            </div>
            <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2">
              <div className="text-[11px] text-[#6e5543]">Tổng tồn Kho 9005</div>
              <div className="text-base font-bold text-[#234E36]">{fmtNum(filteredTotals.qty)} sp</div>
            </div>
            <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2">
              <div className="text-[11px] text-[#6e5543]">Diện tích chiếm dụng</div>
              <div className="text-base font-bold text-[#224B85]">
                {filteredTotals.area} m² {totalAreaM2 > 0 && <span className="text-[11px] font-normal text-[#6e5543]">({Math.round((filteredTotals.area / totalAreaM2) * 100)}%)</span>}
              </div>
            </div>
            <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2">
              <div className="text-[11px] text-[#6e5543]">Phí lưu kho ước tính/tháng</div>
              <div className="text-base font-bold text-[#3B281A]">{fmtVnd(filteredTotals.estRent)}</div>
            </div>
            <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2">
              <div className="text-[11px] text-[#6e5543]">Giá trị vốn tồn 9005</div>
              <div className="text-base font-bold text-[#3B281A]">{fmtVnd(filteredTotals.cost)}</div>
            </div>
          </div>

          {showChart && (
            <div className="rounded-xl border border-[#EFE7DC] bg-[#FCFBF9] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-[#3B281A] text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-[#234E36]" />
                  Biểu Đồ Tồn Kho Từng Sản Phẩm ({selectedSupplier === 'ALL' ? 'Toàn Kho 9005' : selectedSupplier})
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[#E6DDD1] bg-white p-0.5 text-[11px]">
                    {([['close_qty', 'SL'], ['footprint_m2', 'm²'], ['close_cst', 'Giá trị (Tr)']] as [ProductMetric, string][]).map(([k, lbl]) => (
                      <button
                        key={k}
                        onClick={() => setProductMetric(k)}
                        className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${productMetric === k ? 'bg-[#3B281A] text-[#F8F4EC]' : 'text-[#6e5543]'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="inline-flex rounded-lg border border-[#E6DDD1] bg-white p-0.5 text-[11px]">
                    {[15, 30, 0].map(lim => (
                      <button
                        key={lim}
                        onClick={() => setChartLimit(lim)}
                        className={`px-2 py-1 rounded-md cursor-pointer ${chartLimit === lim ? 'bg-[#D6BCA5] text-[#3B281A] font-semibold' : 'text-[#6e5543]'}`}
                      >
                        {lim === 0 ? `Tất cả (${filteredProducts.length})` : `Top ${lim}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {productChartData.length > 0 && (
                <div style={{ height: chartHeight }} className="w-full overflow-y-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productChartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                      <YAxis dataKey="label" type="category" width={190} tick={{ fontSize: 11, fill: '#3B281A' }} interval={0} />
                      <Tooltip formatter={(v: any) => [v, metricLabel]} />
                      <Bar
                        dataKey="val"
                        name={metricLabel}
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(entry: any) => {
                          if (entry?.barcode) setHighlightedBarcode(prev => (prev === entry.barcode ? '' : entry.barcode));
                        }}
                      >
                        {productChartData.map((entry: any) => (
                          <Cell key={entry.barcode} fill={highlightedBarcode === entry.barcode ? '#9A2B26' : metricColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto border border-[#EFE7DC] rounded-xl">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 z-10 bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                  <tr>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Tên sản phẩm</th>
                    <th className="py-2.5 px-3">NCC</th>
                    <th className="py-2.5 px-3 text-right">
                      <button onClick={() => toggleSort('close_qty')} className="inline-flex items-center gap-1 cursor-pointer font-semibold">
                        Tồn 9005 <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">Tồn 3001</th>
                    <th className="py-2.5 px-3 text-center">Thùng (cm)/Tầng</th>
                    <th className="py-2.5 px-3 text-right">
                      <button onClick={() => toggleSort('footprint_m2')} className="inline-flex items-center gap-1 cursor-pointer font-semibold">
                        Diện tích <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <button onClick={() => toggleSort('close_cst')} className="inline-flex items-center gap-1 cursor-pointer font-semibold">
                        Giá trị tồn <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {filteredProducts.map((it: any) => {
                    const isHi = highlightedBarcode === it.barcode;
                    const pctBar = Math.min(100, Math.round(((it.footprint_m2 || 0) / maxItemArea) * 100));
                    return (
                      <tr
                        key={it.barcode}
                        onClick={() => setHighlightedBarcode(isHi ? '' : it.barcode)}
                        className={`cursor-pointer ${isHi ? 'bg-amber-50/90' : 'hover:bg-[#FAF7F2]'}`}
                      >
                        <td className="py-2 px-3 font-mono text-[11px] text-[#6e5543] whitespace-nowrap">{it.barcode}</td>
                        <td className="py-2 px-3 font-medium text-[#3B281A]">{it.product_name}</td>
                        <td className="py-2 px-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectSupplier(it.supplier); }}
                            className="text-[11px] px-2 py-0.5 rounded bg-[#F8F4EC] text-[#3B281A] hover:bg-[#D6BCA5]/50 cursor-pointer"
                          >
                            {it.supplier}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-[#234E36]">{fmtNum(it.close_qty)}</td>
                        <td className="py-2 px-3 text-right text-[#6e5543]">{fmtNum(it.stock_3001)}</td>
                        <td className="py-2 px-3 text-center text-[11px] text-[#6e5543] whitespace-nowrap">
                          {it.box_w_cm > 0 ? `${it.box_w_cm}×${it.box_d_cm}×${it.box_h_cm} / ${it.max_stack}T` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex flex-col items-end">
                            <span className="font-semibold text-[#224B85]">{it.footprint_m2} m²</span>
                            <div className="w-16 h-1.5 bg-[#EFE7DC] rounded-full overflow-hidden mt-0.5">
                              <div className="h-full bg-[#224B85] rounded-full" style={{ width: `${pctBar}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-[#3B281A] whitespace-nowrap">{fmtVnd(it.close_cst)}</td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-[#6e5543]">Không tìm thấy sản phẩm nào trong Kho 9005.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
