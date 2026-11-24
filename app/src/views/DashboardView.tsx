import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Box, CheckCircle2, PackageCheck,
  ShieldAlert, Star, TrendingUp, Truck, Warehouse
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { apiGet, apiSend, fmtMonth, fmtNum, fmtVnd } from '../api';

interface Props {
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onNavigate: (tab: string) => void;
}

export default function DashboardView({ onToast, onNavigate }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSlowAll, setShowSlowAll] = useState(false);

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

  const supChart = (wh9005.suppliers || []).slice(0, 7).map((s: any) => ({
    name: s.supplier.length > 16 ? s.supplier.slice(0, 16) + '…' : s.supplier,
    area: s.area_m2,
  }));

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
        <button
          onClick={() => onNavigate('warehouse')}
          className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-[#3B281A] text-[#F8F4EC] text-xs font-semibold hover:bg-[#563C28] cursor-pointer"
        >
          + Nạp file ERP CSV / Toàn Nhất mới
        </button>
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
            {wh9005.utilization_pct}% trần HĐ 019-2026 • {fmtNum(wh9005.total_qty)} sp
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

        <div className="bg-white rounded-xl p-5 border border-[#E6DDD1]">
          <h2 className="font-bold text-[#3B281A] text-sm mb-1">Kho 9005 — Phân Bổ Diện Tích (m²)</h2>
          <p className="text-[11px] text-[#6e5543] mb-4">Top NCC chiếm dụng mặt bằng Toàn Nhất</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supChart} layout="vertical" margin={{ left: 10, right: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: '#3B281A' }} />
                <Tooltip formatter={(v: any) => [`${v} m²`, 'Diện tích']} />
                <Bar dataKey="area" fill="#224B85" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                  <button
                    onClick={() => handleQuickReplenish(it)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[#224B85] text-white text-[11px] font-semibold hover:bg-[#1a3a68] cursor-pointer"
                  >
                    Tạo XK chuyển kho
                  </button>
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
