import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDownUp, ArrowRightLeft, BarChart3, CheckCircle2,
  Package, Search, ShieldAlert, Star, TrendingUp, Truck, Warehouse, X
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { apiGet, apiSend, AuthUser, fmtMonth, fmtNum, fmtVnd } from '../api';

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onNavigate: (tab: string) => void;
}

type ProductMetric = 'close_qty' | 'footprint_m2' | 'close_cst';

export default function DashboardView({ user, onToast, onNavigate }: Props) {
  const canEdit = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canUploadErp = user.role === 'ADMIN';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSlowAll, setShowSlowAll] = useState(false);

  // Drill-down state for Warehouse 9005 Supplier -> Barcode / Product Inventory & Chart
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [productSearch, setProductSearch] = useState('');
  const [productMetric, setProductMetric] = useState<ProductMetric>('close_qty');
  const [chartLimit, setChartLimit] = useState<number>(15);
  const [sortBy, setSortBy] = useState<'footprint_m2' | 'close_qty' | 'close_cst'>('footprint_m2');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [highlightedBarcode, setHighlightedBarcode] = useState<string>('');
  const drillSectionRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await apiGet('/api/dashboard'));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleQuickReplenish = async (item: any) => {
    try {
      const qty = Math.min(item.stock_9005, Math.max(2, (item.min_stock || 2) - item.stock_3001));
      const res = await apiSend('/api/slips', 'POST', {
        slip_type: 'XK',
        warehouse_code: '9005',
        partner_name: 'Toàn Nhất Logistics',
        purpose: 'Chuyển kho nội bộ (9005 → 3001)',
        expected_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        expected_time: '09:00',
        notes: `Châm hàng nhanh về Store 3001 (tồn 3001: ${item.stock_3001}, bán 3T: ${item.sold_3m})`,
        items: [{ barcode: item.barcode, product_name: item.product_name, unit: 'Cái', qty }],
      });
      onToast(`Đã tạo phiếu xuất chuyển kho ${res.slip_no} (${qty} cái)!`);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const handleSelectSupplier = (supName: string, scrollToDetail = true) => {
    setSelectedSupplier(prev => (prev === supName ? 'ALL' : supName));
    setHighlightedBarcode('');
    if (scrollToDetail) {
      setTimeout(() => {
        drillSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const toggleSort = (col: 'footprint_m2' | 'close_qty' | 'close_cst') => {
    if (sortBy === col) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const wh9005Items: any[] = data?.wh9005?.items || [];
  const wh9005Suppliers: any[] = data?.wh9005?.suppliers || [];

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return wh9005Items
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
  }, [wh9005Items, selectedSupplier, productSearch, sortBy, sortDir]);

  const productChartData = useMemo(() => {
    const sorted = [...filteredProducts].sort((a, b) => (Number(b[productMetric]) || 0) - (Number(a[productMetric]) || 0));
    const sliced = chartLimit > 0 ? sorted.slice(0, chartLimit) : sorted;
    return sliced.map((it: any) => {
      const shortName = it.product_name.length > 28 ? it.product_name.slice(0, 28) + '…' : it.product_name;
      return {
        ...it,
        label: shortName,
        val: productMetric === 'close_cst'
          ? Number(((it.close_cst || 0) / 1e6).toFixed(2))
          : Number(it[productMetric] || 0),
      };
    });
  }, [filteredProducts, productMetric, chartLimit]);

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

  if (loading || !data) {
    return <div className="p-8 text-center text-[#6e5543]">Đang tải dữ liệu vận hành benom...</div>;
  }

  const { orderStats, wh9005, store3001Trend, negativeStock, replenishAlerts, slowMoving, slowMovingTotal, ticketStats, qcStats, csatStats } = data;
  const otifPct = orderStats.total_orders > 0 ? Math.round((orderStats.done_orders / orderStats.total_orders) * 100) : 0;
  const isOverCap = wh9005.total_area_m2 >= 285;

  const trendChart = store3001Trend.map((r: any) => ({
    month: fmtMonth(r.target_month),
    salesM: Number((r.sales_amt / 1e6).toFixed(1)),
    invM: Number((r.close_cst / 1e6).toFixed(1)),
    gp: r.gp_pct,
  }));

  const supChart = wh9005Suppliers.slice(0, 8).map((s: any) => ({
    fullSupplier: s.supplier,
    name: s.supplier.length > 16 ? s.supplier.slice(0, 16) + '…' : s.supplier,
    area: s.area_m2,
    qty: s.qty,
    skuCount: s.sku_count || 0,
    sharePct: s.share_pct || 0,
  }));

  const metricLabel = productMetric === 'close_qty'
    ? 'Tồn kho (SL)'
    : productMetric === 'footprint_m2'
      ? 'Diện tích (m²)'
      : 'Giá trị tồn (Triệu VND)';

  const metricColor = productMetric === 'close_qty'
    ? '#234E36'
    : productMetric === 'footprint_m2'
      ? '#224B85'
      : '#3B281A';

  const chartHeight = Math.max(280, Math.min(920, productChartData.length * 30 + 50));
  const maxItemArea = Math.max(0.01, ...filteredProducts.map((x: any) => Number(x.footprint_m2 || 0)));

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Tổng Quan Vận Hành benom</h1>
          <p className="text-xs text-[#6e5543] mt-0.5">
            Dữ liệu thực tế ERP 3001 ({fmtMonth(data.latest3001)}) • Kho 9005 Toàn Nhất ({fmtMonth(wh9005.target_month)}) • Điều phối & Hậu mãi
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => onNavigate('warehouse')}
            className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-[#3B281A] text-[#F8F4EC] text-xs font-semibold hover:bg-[#563C28] cursor-pointer"
          >
            {canUploadErp ? '+ Nạp file ERP CSV / Toàn Nhất mới' : 'Mở Kho 9005 & Đối soát Toàn Nhất'}
          </button>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#6e5543] font-medium">
            <span>Tổng Đơn Giao & Lắp</span>
            <Truck className="w-4 h-4 text-[#224B85]" />
          </div>
          <div className="text-2xl font-bold text-[#3B281A] mt-2">{fmtNum(orderStats.total_orders)}</div>
          <div className="text-[11px] text-[#234E36] mt-1 font-medium">
            Hoàn tất: {otifPct}% • Có lắp đặt: {orderStats.install_orders} đơn
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#6e5543] font-medium">
            <span>Chi Phí Ship 3PL</span>
            <TrendingUp className="w-4 h-4 text-[#3B281A]" />
          </div>
          <div className="text-2xl font-bold text-[#3B281A] mt-2">{fmtVnd(orderStats.total_3pl_cost)}</div>
          <div className="text-[11px] text-[#6e5543] mt-1">
            Khách đóng: {fmtVnd(orderStats.total_cust_fee)} ({orderStats.promo_free_orders} đơn Freeship)
          </div>
        </div>

        <div className={`bg-white rounded-xl p-4 border shadow-xs ${isOverCap ? 'border-[#9A2B26]' : 'border-[#E6DDD1]'}`}>
          <div className="flex items-center justify-between text-xs text-[#6e5543] font-medium">
            <span>Diện Tích Kho 9005</span>
            <Warehouse className={`w-4 h-4 ${isOverCap ? 'text-[#9A2B26]' : 'text-[#234E36]'}`} />
          </div>
          <div className="text-2xl font-bold text-[#3B281A] mt-2">
            {wh9005.total_area_m2} <span className="text-sm font-normal text-[#6e5543]">/ 300 m²</span>
          </div>
          <div className="w-full h-2 bg-[#F8F4EC] rounded-full overflow-hidden mt-2">
            <div
              className={`h-full rounded-full ${wh9005.utilization_pct >= 95 ? 'bg-[#9A2B26]' : wh9005.utilization_pct >= 85 ? 'bg-amber-600' : 'bg-[#234E36]'}`}
              style={{ width: `${Math.min(100, wh9005.utilization_pct)}%` }}
            />
          </div>
          <div className="text-[11px] text-[#6e5543] mt-1">
            {wh9005.utilization_pct}% trần HĐ 019-2026 • {fmtNum(wh9005.total_qty)} sp ({wh9005Items.length} SKU)
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#6e5543] font-medium">
            <span>CSAT & Hậu Mãi</span>
            <Star className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-[#3B281A] mt-2">
            {csatStats.avg_rating ? `${csatStats.avg_rating} ★` : 'Chưa có'}
          </div>
          <div className="text-[11px] text-[#9A2B26] mt-1 font-medium">
            BH đang mở: {ticketStats.open_count} • QC trả xưởng: {qcStats.units} cái ({qcStats.skus} SKU)
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-[#E6DDD1]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm">Store 3001 — Doanh Số & Giá Trị Tồn Kho (Triệu VND)</h2>
              <p className="text-[11px] text-[#6e5543]">Theo dữ liệu ERP InventoryPLU T01–T11/2026</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6e5543' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6e5543' }} />
                <Tooltip formatter={(v: any, name: any) => [`${v} tr đ`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="invM" name="Tồn kho cuối kỳ (tr đ)" fill="#D6BCA5" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="salesM" name="Doanh số tháng (tr đ)" stroke="#3B281A" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-[#E6DDD1] flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm">Kho 9005 — Phân Bổ Diện Tích (m²)</h2>
              <p className="text-[11px] text-[#6e5543]">
                Nhấn vào cột hoặc tên NCC để xem tồn kho từng Barcode
              </p>
            </div>
            {selectedSupplier !== 'ALL' && (
              <button
                onClick={() => setSelectedSupplier('ALL')}
                className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[#F8F4EC] text-[#3B281A] border border-[#D6BCA5] hover:bg-[#EFE7DC] cursor-pointer"
              >
                Tất cả
              </button>
            )}
          </div>
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supChart} layout="vertical" margin={{ left: 4, right: 14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                <YAxis dataKey="name" type="category" width={104} tick={{ fontSize: 10, fill: '#3B281A' }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-white border border-[#D6BCA5] rounded-lg px-3 py-2 shadow-md text-xs">
                        <div className="font-bold text-[#3B281A]">{p.fullSupplier}</div>
                        <div className="text-[#224B85] font-semibold mt-0.5">
                          Diện tích: {p.area} m² ({p.sharePct}%)
                        </div>
                        <div className="text-[#6e5543]">
                          Tồn kho: <strong>{fmtNum(p.qty)}</strong> sp • <strong>{p.skuCount}</strong> SKU
                        </div>
                        <div className="text-[10px] text-[#234E36] mt-1 font-medium">
                          ▸ Nhấn để xem chi tiết từng Barcode
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="area"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: any) => {
                    if (entry?.fullSupplier) handleSelectSupplier(entry.fullSupplier, true);
                  }}
                >
                  {supChart.map((entry: any) => (
                    <Cell
                      key={entry.fullSupplier}
                      fill={selectedSupplier === entry.fullSupplier ? '#3B281A' : '#224B85'}
                      opacity={selectedSupplier !== 'ALL' && selectedSupplier !== entry.fullSupplier ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Clickable Supplier Pills (all suppliers, including beyond Top 8) */}
          <div className="mt-3 pt-2.5 border-t border-[#EFE7DC] flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {wh9005Suppliers.map((s: any) => {
              const active = selectedSupplier === s.supplier;
              return (
                <button
                  key={s.supplier}
                  onClick={() => handleSelectSupplier(s.supplier, true)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                    active
                      ? 'bg-[#3B281A] text-[#F8F4EC] border-[#3B281A]'
                      : 'bg-[#FAF7F2] text-[#3B281A] border-[#E6DDD1] hover:border-[#224B85] hover:bg-[#F3ECE2]'
                  }`}
                  title={`${s.supplier}: ${s.area_m2} m² • ${fmtNum(s.qty)} sp • ${s.sku_count} SKU`}
                >
                  {s.supplier} <span className={active ? 'text-[#D6BCA5]' : 'text-[#6e5543]'}>({s.area_m2}m² · {s.sku_count} SKU)</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Deep-Dive Warehouse 9005: Product Inventory Chart + Supplier Drill-down Table */}
      <div ref={drillSectionRef} className="bg-white rounded-xl p-5 border border-[#E6DDD1] space-y-5 scroll-mt-4">
        {/* Header & Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-[#F8F4EC] text-[#3B281A]">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-[#3B281A] text-base">
                  Kho 9005 — Biểu Đồ & Tồn Kho Chi Tiết Theo Sản Phẩm / Barcode
                </h2>
                {selectedSupplier !== 'ALL' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#3B281A] text-[#F8F4EC]">
                    NCC: {selectedSupplier}
                    <button
                      onClick={() => setSelectedSupplier('ALL')}
                      className="hover:text-[#D6BCA5] cursor-pointer"
                      title="Bỏ lọc NCC"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#6e5543] mt-0.5">
                Phân tích từng mã hàng đang lưu tại Kho Toàn Nhất 9005 ({fmtMonth(wh9005.target_month)}) — đối chiếu diện tích chiếm dụng, tồn Store 3001 và giá trị vốn.
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSupplier}
              onChange={(e) => { setSelectedSupplier(e.target.value); setHighlightedBarcode(''); }}
              className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] text-xs font-medium text-[#3B281A] focus:outline-none focus:border-[#3B281A]"
            >
              <option value="ALL">Tất cả NCC ({wh9005Suppliers.length} NCC • {wh9005Items.length} SKU)</option>
              {wh9005Suppliers.map((s: any) => (
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
                className="pl-8 pr-7 py-1.5 rounded-lg border border-[#E6DDD1] text-xs text-[#3B281A] w-48 focus:outline-none focus:border-[#3B281A]"
              />
              {productSearch && (
                <button
                  onClick={() => setProductSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6e5543] hover:text-[#3B281A] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Strip for Current Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2.5">
            <div className="text-[11px] text-[#6e5543]">Số mã SKU tồn</div>
            <div className="text-lg font-bold text-[#3B281A]">{fmtNum(filteredTotals.skuCount)}</div>
          </div>
          <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2.5">
            <div className="text-[11px] text-[#6e5543]">Tổng tồn Kho 9005</div>
            <div className="text-lg font-bold text-[#234E36]">{fmtNum(filteredTotals.qty)} <span className="text-xs font-normal">sp</span></div>
          </div>
          <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2.5">
            <div className="text-[11px] text-[#6e5543]">Diện tích chiếm dụng</div>
            <div className="text-lg font-bold text-[#224B85]">
              {filteredTotals.area} <span className="text-xs font-normal">m²</span>
              {wh9005.total_area_m2 > 0 && (
                <span className="text-[11px] font-normal text-[#6e5543] ml-1">
                  ({Math.round((filteredTotals.area / wh9005.total_area_m2) * 100)}%)
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2.5">
            <div className="text-[11px] text-[#6e5543]">Phí lưu kho ước tính/tháng</div>
            <div className="text-lg font-bold text-[#3B281A]">{fmtVnd(filteredTotals.estRent)}</div>
          </div>
          <div className="rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] px-3 py-2.5">
            <div className="text-[11px] text-[#6e5543]">Giá trị vốn tồn 9005</div>
            <div className="text-lg font-bold text-[#3B281A]">{fmtVnd(filteredTotals.cost)}</div>
          </div>
        </div>

        {/* Dedicated Per-Product Inventory Chart */}
        <div className="rounded-xl border border-[#EFE7DC] bg-[#FCFBF9] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-bold text-[#3B281A] text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-[#234E36]" />
                Biểu Đồ Tổng Hợp Tồn Kho Từng Sản Phẩm ({selectedSupplier === 'ALL' ? 'Toàn Kho 9005' : selectedSupplier})
              </h3>
              <p className="text-[11px] text-[#6e5543]">
                Nhấn vào từng thanh sản phẩm để làm nổi bật mã Barcode tương ứng trong bảng chi tiết bên dưới
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-[#E6DDD1] bg-white p-0.5 text-[11px]">
                {([
                  ['close_qty', 'Số lượng (SL)'],
                  ['footprint_m2', 'Diện tích (m²)'],
                  ['close_cst', 'Giá trị (Tr đ)'],
                ] as [ProductMetric, string][]).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setProductMetric(k)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      productMetric === k ? 'bg-[#3B281A] text-[#F8F4EC]' : 'text-[#6e5543] hover:text-[#3B281A]'
                    }`}
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
                    className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      chartLimit === lim ? 'bg-[#D6BCA5] text-[#3B281A] font-semibold' : 'text-[#6e5543] hover:text-[#3B281A]'
                    }`}
                  >
                    {lim === 0 ? `Tất cả (${filteredProducts.length})` : `Top ${lim}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {productChartData.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6e5543]">
              Không có sản phẩm nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div style={{ height: chartHeight }} className="w-full overflow-y-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productChartData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={195}
                    tick={{ fontSize: 11, fill: '#3B281A' }}
                    interval={0}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const it = payload[0].payload;
                      return (
                        <div className="bg-white border border-[#D6BCA5] rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
                          <div className="font-bold text-[#3B281A]">{it.product_name}</div>
                          <div className="font-mono text-[11px] text-[#6e5543] mt-0.5">
                            Barcode: {it.barcode} • NCC: {it.supplier}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-1.5 border-t border-[#EFE7DC]">
                            <div>Tồn Kho 9005: <strong className="text-[#234E36]">{fmtNum(it.close_qty)} {it.unit}</strong></div>
                            <div>Tồn Store 3001: <strong>{fmtNum(it.stock_3001)}</strong></div>
                            <div>Diện tích: <strong className="text-[#224B85]">{it.footprint_m2} m²</strong></div>
                            <div>Số vị trí chồng: <strong>{it.positions}</strong></div>
                            <div className="col-span-2">Giá trị vốn tồn: <strong className="text-[#3B281A]">{fmtVnd(it.close_cst)}</strong></div>
                            {it.box_w_cm > 0 && (
                              <div className="col-span-2 text-[10px] text-[#6e5543]">
                                Kích thước thùng: {it.box_w_cm}×{it.box_d_cm}×{it.box_h_cm} cm (Xếp tối đa {it.max_stack} tầng)
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
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
                      <Cell
                        key={entry.barcode}
                        fill={highlightedBarcode === entry.barcode ? '#9A2B26' : metricColor}
                        opacity={highlightedBarcode && highlightedBarcode !== entry.barcode ? 0.5 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Detailed Per-Barcode Inventory Table */}
        <div className="overflow-x-auto border border-[#EFE7DC] rounded-xl">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10 bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                <tr>
                  <th className="py-2.5 px-3">Barcode</th>
                  <th className="py-2.5 px-3">Tên sản phẩm</th>
                  <th className="py-2.5 px-3">Nhà cung cấp</th>
                  <th className="py-2.5 px-3 text-right">
                    <button onClick={() => toggleSort('close_qty')} className="inline-flex items-center gap-1 hover:text-[#3B281A] cursor-pointer font-semibold">
                      Tồn 9005 <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">Tồn 3001</th>
                  <th className="py-2.5 px-3 text-center">Thùng (cm) / Tầng</th>
                  <th className="py-2.5 px-3 text-right">
                    <button onClick={() => toggleSort('footprint_m2')} className="inline-flex items-center gap-1 hover:text-[#3B281A] cursor-pointer font-semibold">
                      Diện tích (m²) <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button onClick={() => toggleSort('close_cst')} className="inline-flex items-center gap-1 hover:text-[#3B281A] cursor-pointer font-semibold">
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
                      className={`cursor-pointer transition-colors ${isHi ? 'bg-amber-50/90 ring-1 ring-inset ring-[#9A2B26]/30' : 'hover:bg-[#FAF7F2]'}`}
                    >
                      <td className="py-2 px-3 font-mono text-[11px] text-[#6e5543] whitespace-nowrap">{it.barcode}</td>
                      <td className="py-2 px-3 font-medium text-[#3B281A]">{it.product_name}</td>
                      <td className="py-2 px-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectSupplier(it.supplier, false); }}
                          className="text-[11px] px-2 py-0.5 rounded bg-[#F8F4EC] text-[#3B281A] hover:bg-[#D6BCA5]/50 cursor-pointer"
                          title="Nhấn để lọc theo NCC này"
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
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#6e5543]">Không tìm thấy sản phẩm nào trong Kho 9005.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actionable Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Negative Stock */}
        <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#9A2B26]" />
              <h2 className="font-bold text-[#3B281A] text-sm">Cảnh Báo Tồn Kho Âm Store 3001 ({negativeStock.length} SKU)</h2>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-[#9A2B26] font-semibold">Cần điều chỉnh ERP</span>
          </div>
          {negativeStock.length === 0 ? (
            <div className="text-xs text-[#234E36] flex items-center gap-1.5 py-4"><CheckCircle2 className="w-4 h-4" /> Không có mã tồn âm!</div>
          ) : (
            <div className="divide-y divide-[#EFE7DC] text-xs">
              {negativeStock.map((it: any) => (
                <div key={it.barcode} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#3B281A]">{it.product_name}</div>
                    <div className="font-mono text-[11px] text-[#6e5543]">{it.barcode}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-red-50 text-[#9A2B26] font-bold">{it.close_qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Replenish 9005 -> 3001 */}
        <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-[#224B85]" />
              <h2 className="font-bold text-[#3B281A] text-sm">Đề Xuất Châm Hàng 9005 → 3001 ({replenishAlerts.length} SKU)</h2>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-[#224B85] font-semibold">Sắp hết tại Store</span>
          </div>
          {replenishAlerts.length === 0 ? (
            <div className="text-xs text-[#234E36] py-4">Tồn kho các mã bán chạy tại Store 3001 đang ổn định.</div>
          ) : (
            <div className="divide-y divide-[#EFE7DC] text-xs">
              {replenishAlerts.map((it: any) => (
                <div key={it.barcode} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#3B281A]">{it.product_name}</div>
                    <div className="text-[11px] text-[#6e5543]">
                      Store 3001: <strong className="text-[#9A2B26]">{it.stock_3001}</strong> • Kho 9005: <strong className="text-[#234E36]">{it.stock_9005}</strong> • Bán 3T: {it.sold_3m}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleQuickReplenish(it)}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[#224B85] text-white text-[11px] font-semibold hover:bg-[#1a3a68] cursor-pointer"
                    >
                      Tạo XK chuyển kho
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slow-Moving 90 days */}
      <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm">
                Danh Sách Chậm Luân Chuyển 90 Ngày Tại Store 3001 ({slowMovingTotal.count} SKU • Vốn đọng: {fmtVnd(slowMovingTotal.total_cost)})
              </h2>
              <p className="text-[11px] text-[#6e5543]">Các mã còn tồn kho nhưng doanh số 3 tháng gần nhất = 0 — đề xuất Sale/Clearance để giải phóng vốn & mặt bằng.</p>
            </div>
          </div>
          <button
            onClick={() => setShowSlowAll(!showSlowAll)}
            className="text-xs font-semibold text-[#224B85] hover:underline cursor-pointer"
          >
            {showSlowAll ? 'Thu gọn' : 'Xem Top 50 mã vốn cao nhất'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#E6DDD1] text-[#6e5543] bg-[#F8F4EC]">
                <th className="py-2 px-3">Barcode</th>
                <th className="py-2 px-3">Tên sản phẩm</th>
                <th className="py-2 px-3">NCC</th>
                <th className="py-2 px-3 text-right">Tồn 3001</th>
                <th className="py-2 px-3 text-right">Giá trị vốn đọng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E9DF]">
              {(showSlowAll ? slowMoving : slowMoving.slice(0, 6)).map((it: any) => (
                <tr key={it.barcode} className="hover:bg-[#FAF7F2]">
                  <td className="py-2 px-3 font-mono text-[11px]">{it.barcode}</td>
                  <td className="py-2 px-3 font-medium text-[#3B281A]">{it.product_name}</td>
                  <td className="py-2 px-3 text-[#6e5543]">{it.supplier}</td>
                  <td className="py-2 px-3 text-right font-semibold">{it.close_qty}</td>
                  <td className="py-2 px-3 text-right font-semibold text-[#9A2B26]">{fmtVnd(it.close_cst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
