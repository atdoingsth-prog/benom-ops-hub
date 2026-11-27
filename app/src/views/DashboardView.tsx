import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, BarChart3, CheckCircle2, Flame,
  ShieldAlert, Star, Store, TrendingUp, Truck, Warehouse
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { apiGet, apiSend, AuthUser, fmtMonth, fmtNum, fmtVnd } from '../api';

const Wh9005DrilldownPanel = lazy(() => import('../components/Wh9005DrilldownPanel'));
const Store3001DrilldownPanel = lazy(() => import('../components/Store3001DrilldownPanel'));

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onNavigate: (tab: string) => void;
}

export default function DashboardView({ user, onToast, onNavigate }: Props) {
  const canEdit = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canUploadErp = user.role === 'ADMIN';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // On-demand Warehouse 9005 & Store 3001 barcode drilldown
  const [activeDrillWh, setActiveDrillWh] = useState<'NONE' | '9005' | '3001'>('NONE');
  const [selectedSupplier9005, setSelectedSupplier9005] = useState<string>('ALL');
  const [selectedSupplier3001, setSelectedSupplier3001] = useState<string>('ALL');
  const [sup3001Metric, setSup3001Metric] = useState<'cost_m' | 'qty'>('cost_m');
  const drillSectionRef = useRef<HTMLDivElement | null>(null);

  // On-demand Store 3001 Slow-Moving (90 / 60 / 30 days)
  const [slowDays, setSlowDays] = useState<90 | 60 | 30>(90);
  const [showSlowAll, setShowSlowAll] = useState(false);
  const [slowByDays, setSlowByDays] = useState<Record<string, { total: { count: number; total_cost: number }; months: string[]; items: any[] }>>({});
  const [loadingSlow, setLoadingSlow] = useState(false);

  // On-demand Store 3001 Best-Sellers (90 / 60 / 30 days, sort by revenue or qty)
  const [bestDays, setBestDays] = useState<90 | 60 | 30>(90);
  const [bestSort, setBestSort] = useState<'sales_amt' | 'sales_qty'>('sales_amt');
  const [showBestAll, setShowBestAll] = useState(false);
  const [bestByKey, setBestByKey] = useState<Record<string, { total: { count: number; total_qty: number; total_sales_amt: number }; months: string[]; items: any[] }>>({});
  const [loadingBest, setLoadingBest] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await apiGet('/api/dashboard', { cacheMs: 30000 }));
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

  const scrollToDrill = () => {
    setTimeout(() => {
      drillSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleSelectSupplier9005 = (supName: string, scrollToDetail = true) => {
    setSelectedSupplier9005(prev => (activeDrillWh === '9005' && prev === supName ? 'ALL' : supName));
    setActiveDrillWh('9005');
    if (scrollToDetail) scrollToDrill();
  };

  const handleSelectSupplier3001 = (supName: string, scrollToDetail = true) => {
    setSelectedSupplier3001(prev => (activeDrillWh === '3001' && prev === supName ? 'ALL' : supName));
    setActiveDrillWh('3001');
    if (scrollToDetail) scrollToDrill();
  };

  const fetchSlowMoving = async (days: 90 | 60 | 30, limit: number) => {
    const key = `${days}:${limit}`;
    if (slowByDays[key]) return;
    setLoadingSlow(true);
    try {
      const res = await apiGet(`/api/dashboard/slow-moving?days=${days}&limit=${limit}`, { cacheMs: 60000 });
      setSlowByDays(prev => ({
        ...prev,
        [key]: { total: res.total || { count: 0, total_cost: 0 }, months: res.months || [], items: res.items || [] },
      }));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoadingSlow(false);
    }
  };

  const handleSlowDaysChange = (days: 90 | 60 | 30) => {
    setSlowDays(days);
    const needLimit = showSlowAll ? 50 : 6;
    if (days !== 90 || showSlowAll) {
      fetchSlowMoving(days, needLimit);
    }
  };

  const toggleSlowMoving = () => {
    const next = !showSlowAll;
    setShowSlowAll(next);
    if (next) {
      fetchSlowMoving(slowDays, 50);
    }
  };

  const fetchBestSellers = async (days: 90 | 60 | 30, sort: 'sales_amt' | 'sales_qty', limit: number) => {
    const key = `${days}:${sort}:${limit}`;
    if (bestByKey[key]) return;
    setLoadingBest(true);
    try {
      const res = await apiGet(`/api/dashboard/best-sellers?days=${days}&sort=${sort}&limit=${limit}`, { cacheMs: 60000 });
      setBestByKey(prev => ({
        ...prev,
        [key]: {
          total: res.total || { count: 0, total_qty: 0, total_sales_amt: 0 },
          months: res.months || [],
          items: res.items || [],
        },
      }));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoadingBest(false);
    }
  };

  const handleBestDaysChange = (days: 90 | 60 | 30) => {
    setBestDays(days);
    const needLimit = showBestAll ? 50 : 6;
    if (days !== 90 || bestSort !== 'sales_amt' || showBestAll) {
      fetchBestSellers(days, bestSort, needLimit);
    }
  };

  const handleBestSortChange = (sort: 'sales_amt' | 'sales_qty') => {
    setBestSort(sort);
    const needLimit = showBestAll ? 50 : 6;
    if (bestDays !== 90 || sort !== 'sales_amt' || showBestAll) {
      fetchBestSellers(bestDays, sort, needLimit);
    }
  };

  const toggleBestSellers = () => {
    const next = !showBestAll;
    setShowBestAll(next);
    if (next) {
      fetchBestSellers(bestDays, bestSort, 50);
    }
  };

  const formatMonthSpan = (months: string[] | undefined) => {
    if (!months || months.length === 0) return '';
    if (months.length === 1) return fmtMonth(months[0]);
    return `${fmtMonth(months[0])}–${fmtMonth(months[months.length - 1])}`;
  };

  const trendChart = useMemo(() => (data?.store3001Trend || []).map((r: any) => ({
    month: fmtMonth(r.target_month),
    salesM: Number((r.sales_amt / 1e6).toFixed(1)),
    invM: Number((r.close_cst / 1e6).toFixed(1)),
    gp: r.gp_pct,
  })), [data?.store3001Trend]);

  const wh9005Suppliers: any[] = data?.wh9005?.suppliers || [];
  const wh3001Suppliers: any[] = data?.wh3001?.suppliers || [];

  const sup9005Chart = useMemo(() => wh9005Suppliers.slice(0, 8).map((s: any) => ({
    fullSupplier: s.supplier,
    name: s.supplier.length > 16 ? s.supplier.slice(0, 16) + '…' : s.supplier,
    area: s.area_m2,
    qty: s.qty,
    skuCount: s.sku_count || 0,
    sharePct: s.share_pct || 0,
  })), [wh9005Suppliers]);

  const sup3001Chart = useMemo(() => {
    const sorted = [...wh3001Suppliers].sort((a, b) => (Number(b[sup3001Metric]) || 0) - (Number(a[sup3001Metric]) || 0));
    return sorted.slice(0, 8).map((s: any) => ({
      fullSupplier: s.supplier,
      name: s.supplier.length > 16 ? s.supplier.slice(0, 16) + '…' : s.supplier,
      val: sup3001Metric === 'cost_m' ? s.cost_m : s.qty,
      costM: s.cost_m,
      cost: s.cost,
      qty: s.qty,
      skuCount: s.sku_count || 0,
      sharePct: s.share_pct || 0,
    }));
  }, [wh3001Suppliers, sup3001Metric]);

  if (loading || !data) {
    return <div className="p-8 text-center text-[#6e5543] text-sm">Đang tải dữ liệu vận hành benom...</div>;
  }

  const { orderStats, wh9005, wh3001, negativeStock, replenishAlerts, slowMoving, slowMovingTotal, slowMovingMonths, bestSellers, bestSellersTotal, bestSellersMonths, ticketStats, qcStats, csatStats } = data;
  const otifPct = orderStats.total_orders > 0 ? Math.round((orderStats.done_orders / orderStats.total_orders) * 100) : 0;
  const isOverCap = wh9005.total_area_m2 >= 285;

  // Resolve active Slow-Moving dataset (90/60/30 days, Top 6 or Top 50)
  const activeSlowData =
    slowByDays[`${slowDays}:50`] ||
    (showSlowAll ? null : slowByDays[`${slowDays}:6`]) ||
    (slowDays === 90 ? { total: slowMovingTotal, months: slowMovingMonths || [], items: slowMoving || [] } : null);
  const displayedSlow = activeSlowData ? (showSlowAll ? activeSlowData.items : activeSlowData.items.slice(0, 6)) : [];
  const activeSlowTotal = activeSlowData?.total || slowMovingTotal || { count: 0, total_cost: 0 };
  const activeSlowMonths = activeSlowData?.months || [];

  // Resolve active Best-Sellers dataset (90/60/30 days, Revenue or Qty, Top 6 or Top 50)
  const activeBestData =
    bestByKey[`${bestDays}:${bestSort}:50`] ||
    (showBestAll ? null : bestByKey[`${bestDays}:${bestSort}:6`]) ||
    (bestDays === 90 && bestSort === 'sales_amt'
      ? { total: bestSellersTotal || { count: 0, total_qty: 0, total_sales_amt: 0 }, months: bestSellersMonths || [], items: bestSellers || [] }
      : null);
  const displayedBest = activeBestData ? (showBestAll ? activeBestData.items : activeBestData.items.slice(0, 6)) : [];
  const activeBestTotal = activeBestData?.total || bestSellersTotal || { count: 0, total_qty: 0, total_sales_amt: 0 };
  const activeBestMonths = activeBestData?.months || [];

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
            {wh9005.utilization_pct}% trần HĐ 019-2026 • {fmtNum(wh9005.total_qty)} sp ({wh9005.sku_count} SKU)
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

      {/* Store 3001 Sales & Inventory Trend Chart */}
      <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-bold text-[#3B281A] text-sm">Store 3001 — Doanh Số & Giá Trị Tồn Kho (Triệu VND)</h2>
            <p className="text-[11px] text-[#6e5543]">Theo dữ liệu ERP InventoryPLU T01–T11/2026</p>
          </div>
          {wh3001 && (
            <div className="text-xs text-[#6e5543] flex flex-wrap items-center gap-3">
              <span>Tồn hiện tại: <strong className="text-[#234E36]">{fmtNum(wh3001.total_qty)} sp</strong> ({wh3001.sku_count} SKU)</span>
              <span>Vốn tồn: <strong className="text-[#3B281A]">{fmtVnd(wh3001.total_cost)}</strong></span>
            </div>
          )}
        </div>
        <div className="h-64">
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

      {/* Side-by-side Supplier Distribution Charts: Kho 9005 & Store 3001 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Kho 9005 Supplier Breakdown */}
        <div className="bg-white rounded-xl p-5 border border-[#E6DDD1] flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm flex items-center gap-1.5">
                <Warehouse className="w-4 h-4 text-[#224B85]" />
                Kho 9005 — Phân Bổ Diện Tích Theo NCC (m²)
              </h2>
              <p className="text-[11px] text-[#6e5543]">
                Nhấn cột hoặc tên NCC để mở bảng & biểu đồ tồn chi tiết từng Barcode
              </p>
            </div>
            {activeDrillWh === '9005' && selectedSupplier9005 !== 'ALL' && (
              <button
                onClick={() => setSelectedSupplier9005('ALL')}
                className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[#F8F4EC] text-[#3B281A] border border-[#D6BCA5] hover:bg-[#EFE7DC] cursor-pointer"
              >
                Tất cả
              </button>
            )}
          </div>
          <div className="h-60 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sup9005Chart} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                <YAxis dataKey="name" type="category" width={108} tick={{ fontSize: 10, fill: '#3B281A' }} />
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
                          Tồn 9005: <strong>{fmtNum(p.qty)}</strong> sp • <strong>{p.skuCount}</strong> SKU
                        </div>
                        <div className="text-[10px] text-[#234E36] mt-1 font-medium">
                          ▸ Nhấn để mở chi tiết từng Barcode
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
                    if (entry?.fullSupplier) handleSelectSupplier9005(entry.fullSupplier, true);
                  }}
                >
                  {sup9005Chart.map((entry: any) => (
                    <Cell
                      key={entry.fullSupplier}
                      fill={activeDrillWh === '9005' && selectedSupplier9005 === entry.fullSupplier ? '#3B281A' : '#224B85'}
                      opacity={activeDrillWh === '9005' && selectedSupplier9005 !== 'ALL' && selectedSupplier9005 !== entry.fullSupplier ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#EFE7DC] flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {wh9005Suppliers.map((s: any) => {
              const active = activeDrillWh === '9005' && selectedSupplier9005 === s.supplier;
              return (
                <button
                  key={s.supplier}
                  onClick={() => handleSelectSupplier9005(s.supplier, true)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                    active
                      ? 'bg-[#3B281A] text-[#F8F4EC] border-[#3B281A]'
                      : 'bg-[#FAF7F2] text-[#3B281A] border-[#E6DDD1] hover:border-[#224B85] hover:bg-[#F3ECE2]'
                  }`}
                  title={`${s.supplier}: ${s.area_m2} m² • ${fmtNum(s.qty)} sp • ${s.sku_count} SKU`}
                >
                  {s.supplier} <span className={active ? 'text-[#D6BCA5]' : 'text-[#6e5543]'}>({s.area_m2}m² · {s.sku_count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Store 3001 Supplier Breakdown */}
        <div className="bg-white rounded-xl p-5 border border-[#E6DDD1] flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm flex items-center gap-1.5">
                <Store className="w-4 h-4 text-[#234E36]" />
                Store 3001 — Phân Bổ Tồn Kho Theo NCC ({sup3001Metric === 'cost_m' ? 'Triệu VND' : 'SL tồn'})
              </h2>
              <p className="text-[11px] text-[#6e5543]">
                Nhấn cột hoặc tên NCC để mở bảng & biểu đồ tồn chi tiết từng Barcode
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="inline-flex rounded-md border border-[#E6DDD1] bg-[#FAF7F2] p-0.5 text-[10px]">
                <button
                  onClick={() => setSup3001Metric('cost_m')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${sup3001Metric === 'cost_m' ? 'bg-[#234E36] text-white' : 'text-[#6e5543]'}`}
                >
                  Vốn (Tr đ)
                </button>
                <button
                  onClick={() => setSup3001Metric('qty')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${sup3001Metric === 'qty' ? 'bg-[#234E36] text-white' : 'text-[#6e5543]'}`}
                >
                  SL tồn
                </button>
              </div>
              {activeDrillWh === '3001' && selectedSupplier3001 !== 'ALL' && (
                <button
                  onClick={() => setSelectedSupplier3001('ALL')}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[#F8F4EC] text-[#3B281A] border border-[#D6BCA5] hover:bg-[#EFE7DC] cursor-pointer"
                >
                  Tất cả
                </button>
              )}
            </div>
          </div>
          <div className="h-60 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sup3001Chart} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                <YAxis dataKey="name" type="category" width={108} tick={{ fontSize: 10, fill: '#3B281A' }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-white border border-[#D6BCA5] rounded-lg px-3 py-2 shadow-md text-xs">
                        <div className="font-bold text-[#3B281A]">{p.fullSupplier}</div>
                        <div className="text-[#234E36] font-semibold mt-0.5">
                          Vốn tồn: {fmtVnd(p.cost)} ({p.sharePct}%)
                        </div>
                        <div className="text-[#6e5543]">
                          Tồn 3001: <strong>{fmtNum(p.qty)}</strong> sp • <strong>{p.skuCount}</strong> SKU
                        </div>
                        <div className="text-[10px] text-[#224B85] mt-1 font-medium">
                          ▸ Nhấn để mở chi tiết từng Barcode
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="val"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: any) => {
                    if (entry?.fullSupplier) handleSelectSupplier3001(entry.fullSupplier, true);
                  }}
                >
                  {sup3001Chart.map((entry: any) => (
                    <Cell
                      key={entry.fullSupplier}
                      fill={activeDrillWh === '3001' && selectedSupplier3001 === entry.fullSupplier ? '#3B281A' : '#234E36'}
                      opacity={activeDrillWh === '3001' && selectedSupplier3001 !== 'ALL' && selectedSupplier3001 !== entry.fullSupplier ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#EFE7DC] flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {wh3001Suppliers.map((s: any) => {
              const active = activeDrillWh === '3001' && selectedSupplier3001 === s.supplier;
              return (
                <button
                  key={s.supplier}
                  onClick={() => handleSelectSupplier3001(s.supplier, true)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                    active
                      ? 'bg-[#234E36] text-[#F8F4EC] border-[#234E36]'
                      : 'bg-[#FAF7F2] text-[#3B281A] border-[#E6DDD1] hover:border-[#234E36] hover:bg-[#F3ECE2]'
                  }`}
                  title={`${s.supplier}: ${fmtVnd(s.cost)} • ${fmtNum(s.qty)} sp • ${s.sku_count} SKU`}
                >
                  {s.supplier}{' '}
                  <span className={active ? 'text-[#D6BCA5]' : 'text-[#6e5543]'}>
                    ({sup3001Metric === 'cost_m' ? `${s.cost_m}tr` : `${fmtNum(s.qty)}sp`} · {s.sku_count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* On-Demand Warehouse 9005 & Store 3001 Barcode Drilldown Section */}
      <div ref={drillSectionRef} className="scroll-mt-4 space-y-3">
        {activeDrillWh === 'NONE' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F8F4EC] text-[#224B85]">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-[#3B281A]">
                    Tra Cứu & Biểu Đồ Tồn Kho 9005 ({wh9005.sku_count} SKU • {wh9005Suppliers.length} NCC)
                  </div>
                  <div className="text-[11px] text-[#6e5543]">
                    Xem tồn kho từng Barcode, diện tích m² & biểu đồ sản phẩm Kho Toàn Nhất.
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedSupplier9005('ALL'); setActiveDrillWh('9005'); }}
                className="px-3.5 py-2 rounded-lg bg-[#224B85] text-white text-xs font-semibold hover:bg-[#1a3a68] cursor-pointer shrink-0"
              >
                Mở chi tiết 9005
              </button>
            </div>

            {wh3001 && (
              <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#F8F4EC] text-[#234E36]">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#3B281A]">
                      Tra Cứu & Biểu Đồ Tồn Store 3001 ({wh3001.sku_count} SKU • {wh3001Suppliers.length} NCC)
                    </div>
                    <div className="text-[11px] text-[#6e5543]">
                      Xem tồn kho từng Barcode, sức bán 3T & biểu đồ sản phẩm Store Lê Thánh Tôn.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedSupplier3001('ALL'); setActiveDrillWh('3001'); }}
                  className="px-3.5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold hover:bg-[#1a3c29] cursor-pointer shrink-0"
                >
                  Mở chi tiết 3001
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Quick switcher between Kho 9005 and Store 3001 drilldown */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-[#D6BCA5] bg-white p-1 text-xs">
                <button
                  onClick={() => setActiveDrillWh('9005')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                    activeDrillWh === '9005' ? 'bg-[#224B85] text-white' : 'text-[#6e5543] hover:text-[#3B281A]'
                  }`}
                >
                  <Warehouse className="w-3.5 h-3.5" />
                  Kho 9005 Toàn Nhất ({wh9005.sku_count} SKU)
                </button>
                {wh3001 && (
                  <button
                    onClick={() => setActiveDrillWh('3001')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                      activeDrillWh === '3001' ? 'bg-[#234E36] text-white' : 'text-[#6e5543] hover:text-[#3B281A]'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    Store 3001 Lê Thánh Tôn ({wh3001.sku_count} SKU)
                  </button>
                )}
              </div>
            </div>

            {activeDrillWh === '9005' ? (
              <Suspense fallback={<div className="bg-white rounded-xl p-6 border border-[#E6DDD1] text-center text-xs text-[#6e5543]">Đang tải bảng phân tích Kho 9005...</div>}>
                <Wh9005DrilldownPanel
                  targetMonth={wh9005.target_month}
                  totalAreaM2={wh9005.total_area_m2}
                  suppliers={wh9005Suppliers}
                  selectedSupplier={selectedSupplier9005}
                  onSelectSupplier={setSelectedSupplier9005}
                  onClose={() => setActiveDrillWh('NONE')}
                  onToast={onToast}
                />
              </Suspense>
            ) : wh3001 ? (
              <Suspense fallback={<div className="bg-white rounded-xl p-6 border border-[#E6DDD1] text-center text-xs text-[#6e5543]">Đang tải bảng phân tích Store 3001...</div>}>
                <Store3001DrilldownPanel
                  targetMonth={wh3001.target_month}
                  totalCost={wh3001.total_cost}
                  suppliers={wh3001Suppliers}
                  selectedSupplier={selectedSupplier3001}
                  onSelectSupplier={setSelectedSupplier3001}
                  onClose={() => setActiveDrillWh('NONE')}
                  onToast={onToast}
                />
              </Suspense>
            ) : null}
          </div>
        )}
      </div>

      {/* Actionable Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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

      {/* Best-Selling Products at Store 3001 (90 / 60 / 30 days) */}
      <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
          <div className="flex items-start gap-2">
            <Flame className="w-5 h-5 text-[#234E36] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm">
                Danh Sách Hàng Bán Chạy {bestDays} Ngày Tại Store 3001 ({fmtNum(activeBestTotal.count)} SKU • {fmtNum(activeBestTotal.total_qty)} sp • Doanh số: {fmtVnd(activeBestTotal.total_sales_amt)})
              </h2>
              <p className="text-[11px] text-[#6e5543]">
                {activeBestMonths.length > 0 ? `Kỳ ERP ${formatMonthSpan(activeBestMonths)} • ` : ''}
                Chỉ tính sản phẩm nội thất/gia dụng (đã lọc bỏ mã phí dịch vụ) — ưu tiên giữ tồn trưng bày & châm hàng từ Kho 9005.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] p-0.5 text-[11px]">
              {([30, 60, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => handleBestDaysChange(d)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                    bestDays === d ? 'bg-[#234E36] text-white' : 'text-[#6e5543] hover:text-[#3B281A]'
                  }`}
                >
                  {d} ngày
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-[#E6DDD1] bg-white p-0.5 text-[11px]">
              <button
                onClick={() => handleBestSortChange('sales_amt')}
                className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${bestSort === 'sales_amt' ? 'bg-[#3B281A] text-white' : 'text-[#6e5543]'}`}
              >
                Doanh số
              </button>
              <button
                onClick={() => handleBestSortChange('sales_qty')}
                className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${bestSort === 'sales_qty' ? 'bg-[#3B281A] text-white' : 'text-[#6e5543]'}`}
              >
                SL bán
              </button>
            </div>
            <button
              onClick={toggleBestSellers}
              disabled={loadingBest}
              className="text-xs font-semibold text-[#224B85] hover:underline cursor-pointer disabled:opacity-60"
            >
              {loadingBest ? 'Đang tải...' : showBestAll ? 'Thu gọn (Top 6)' : 'Xem Top 50 bán chạy'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#E6DDD1] text-[#6e5543] bg-[#F8F4EC]">
                <th className="py-2 px-2 text-center w-9">#</th>
                <th className="py-2 px-3">Barcode</th>
                <th className="py-2 px-3">Tên sản phẩm</th>
                <th className="py-2 px-3">NCC</th>
                <th className="py-2 px-3 text-right">SL bán ({bestDays}N)</th>
                <th className="py-2 px-3 text-right">Doanh số ({bestDays}N)</th>
                <th className="py-2 px-3 text-right">Tồn 3001</th>
                <th className="py-2 px-3 text-right">Tồn 9005</th>
                {canEdit && <th className="py-2 px-2 text-right">Châm hàng</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E9DF]">
              {loadingBest && displayedBest.length === 0 ? (
                <tr><td colSpan={canEdit ? 9 : 8} className="py-6 text-center text-[#6e5543]">Đang tải danh sách hàng bán chạy {bestDays} ngày...</td></tr>
              ) : displayedBest.length === 0 ? (
                <tr><td colSpan={canEdit ? 9 : 8} className="py-6 text-center text-[#6e5543]">Chưa có dữ liệu bán hàng trong kỳ {bestDays} ngày.</td></tr>
              ) : displayedBest.map((it: any, idx: number) => {
                const lowStoreStock = Number(it.stock_3001 || 0) <= 1;
                const canReplenish = lowStoreStock && Number(it.stock_9005 || 0) > 0;
                return (
                  <tr key={it.barcode} className="hover:bg-[#FAF7F2]">
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                        idx < 3 ? 'bg-[#234E36] text-white' : 'bg-[#EFE7DC] text-[#3B281A]'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]">{it.barcode}</td>
                    <td className="py-2 px-3 font-medium text-[#3B281A]">{it.product_name}</td>
                    <td className="py-2 px-3 text-[#6e5543]">{it.supplier}</td>
                    <td className="py-2 px-3 text-right font-bold text-[#234E36]">{fmtNum(it.sold_qty)}</td>
                    <td className="py-2 px-3 text-right font-bold text-[#3B281A] whitespace-nowrap">{fmtVnd(it.sales_amt)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${lowStoreStock ? 'text-[#9A2B26]' : 'text-[#3B281A]'}`}>
                      {fmtNum(it.stock_3001)}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-[#224B85]">{fmtNum(it.stock_9005)}</td>
                    {canEdit && (
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        {canReplenish ? (
                          <button
                            onClick={() => handleQuickReplenish({ ...it, sold_3m: it.sold_qty })}
                            className="px-2 py-1 rounded bg-[#224B85] text-white text-[10px] font-semibold hover:bg-[#1a3a68] cursor-pointer"
                          >
                            + XK 9005→3001
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#6e5543]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slow-Moving 90 / 60 / 30 days at Store 3001 (Top 6 initial, Top 50 loaded on-demand) */}
      <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-[#3B281A] text-sm">
                Danh Sách Chậm Luân Chuyển {slowDays} Ngày Tại Store 3001 ({fmtNum(activeSlowTotal.count)} SKU • Vốn đọng: {fmtVnd(activeSlowTotal.total_cost)})
              </h2>
              <p className="text-[11px] text-[#6e5543]">
                {activeSlowMonths.length > 0 ? `Kỳ ERP ${formatMonthSpan(activeSlowMonths)} • ` : ''}
                Các mã còn tồn kho nhưng doanh số {slowDays === 30 ? '1 tháng' : slowDays === 60 ? '2 tháng' : '3 tháng'} gần nhất = 0 — đề xuất Sale/Clearance để giải phóng vốn & mặt bằng.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] p-0.5 text-[11px]">
              {([30, 60, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => handleSlowDaysChange(d)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                    slowDays === d ? 'bg-amber-600 text-white' : 'text-[#6e5543] hover:text-[#3B281A]'
                  }`}
                >
                  {d} ngày
                </button>
              ))}
            </div>
            <button
              onClick={toggleSlowMoving}
              disabled={loadingSlow}
              className="text-xs font-semibold text-[#224B85] hover:underline cursor-pointer disabled:opacity-60"
            >
              {loadingSlow ? 'Đang tải...' : showSlowAll ? 'Thu gọn (Top 6)' : 'Xem Top 50 mã vốn cao nhất'}
            </button>
          </div>
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
              {loadingSlow && displayedSlow.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-[#6e5543]">Đang tải danh sách chậm luân chuyển {slowDays} ngày...</td></tr>
              ) : displayedSlow.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-[#234E36]">Không có mã chậm luân chuyển trong kỳ {slowDays} ngày!</td></tr>
              ) : displayedSlow.map((it: any) => (
                <tr key={it.barcode} className="hover:bg-[#FAF7F2]">
                  <td className="py-2 px-3 font-mono text-[11px]">{it.barcode}</td>
                  <td className="py-2 px-3 font-medium text-[#3B281A]">{it.product_name}</td>
                  <td className="py-2 px-3 text-[#6e5543]">{it.supplier}</td>
                  <td className="py-2 px-3 text-right font-semibold">{fmtNum(it.close_qty)}</td>
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
