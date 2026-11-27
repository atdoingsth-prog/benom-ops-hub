import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, BarChart3, Check, Download, GitMerge, Plus, Search, Sparkles, Trash2, Truck, UploadCloud, X
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { apiDownload, apiGet, apiSend, apiUpload, AuthUser, fmtMonth, fmtVnd } from '../api';

const SlipDetailModal = lazy(() => import('../components/SlipDetailModal'));
const MergeModal = lazy(() => import('../components/MergeModal'));

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onNavigate?: (tab: string) => void;
}

const CARRIERS = ['', 'Ahamove', 'Xanh SM', '247 Express', 'Sagawa', 'Toàn Nhất Logistics', 'Nhất Tín Logistics', 'Kỹ thuật Benom', 'Benom staff', 'Lalamove', 'Viettel Post', 'Khác'];

export default function DeliveryTrackingView({ user, onToast, onNavigate }: Props) {
  const canEdit = user.role === 'ADMIN' || user.role === 'EDITOR';
  const [pushingSlip, setPushingSlip] = useState<string | null>(null);
  const [detailSlipNo, setDetailSlipNo] = useState<string | null>(null);
  const [mergeModal, setMergeModal] = useState<{ open: boolean; masterKey?: string | null; childKeys?: string[] }>({ open: false });
  const [quickMergingKey, setQuickMergingKey] = useState<string | null>(null);
  const [month, setMonthState] = useState<string>(() => localStorage.getItem('benom_3pl_month') || 'LATEST');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [edits, setEdits] = useState<Record<string, any>>({});

  const setMonth = (m: string) => {
    setMonthState(m);
    localStorage.setItem('benom_3pl_month', m);
  };

  // Add Manual / Freeship Slip Modal
  const [showAdd, setShowAdd] = useState(false);
  const [posQuery, setPosQuery] = useState('');
  const [posMatches, setPosMatches] = useState<any[]>([]);
  const [newSlip, setNewSlip] = useState({
    slip_no: '',
    sales_month: new Date().toISOString().slice(0, 7),
    sales_day: new Date().toISOString().slice(0, 10),
    delivery_cust_pay: 0,
    install_cust_pay: 0,
    fee_3pl: 0,
    net_sales_excl_tax: 0,
    carrier_3pl: 'Ahamove',
    area: 'HCM',
    note: '',
    items_summary: '',
  });

  const load = async (m = month, force = false) => {
    setLoading(true);
    try {
      const res = await apiGet(`/api/delivery-tracking?month=${encodeURIComponent(m)}`, { cacheMs: 25000, force });
      setData(res);
      setVisibleLimit(50);
      // If requested LATEST (or resolved month differs from 'LATEST'), sync dropdown to exact resolved month (e.g. 2026-11)
      if (m === 'LATEST' && res.month && res.month !== 'LATEST') {
        setMonthState(res.month);
        localStorage.setItem('benom_3pl_month', res.month);
      }
      const initEdits: Record<string, any> = {};
      for (const r of (res.rows || [])) {
        initEdits[r.slip_no] = {
          carrier_3pl: r.carrier_3pl || '',
          fee_3pl: r.fee_3pl || 0,
          area: r.area || 'HCM',
          note: r.note || '',
          dirty: false,
        };
      }
      setEdits(initEdits);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(month); }, [month]);

  const handleUploadPos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const res = await apiUpload('/api/delivery-tracking/upload-pos', file);
      const uploadedMonths: string[] = Array.isArray(res.months) ? [...res.months].sort() : [];
      const targetMonth = uploadedMonths.length ? uploadedMonths[uploadedMonths.length - 1] : 'LATEST';
      onToast(`Đã nạp ${res.total_pos_slips} hóa đơn POS (${targetMonth !== 'LATEST' ? fmtMonth(targetMonth) : 'mới nhất'}) • Tự động tách ${res.auto_tracked_delivery_slips} đơn có phí giao/lắp!`);
      setMonth(targetMonth);
      await load(targetMonth);
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setUploading(false);
    }
  };

  const setField = (slipNo: string, field: string, value: any) => {
    setEdits(prev => ({
      ...prev,
      [slipNo]: { ...prev[slipNo], [field]: value, dirty: true },
    }));
  };

  const saveRow = async (slipNo: string) => {
    const ed = edits[slipNo];
    if (!ed) return;
    try {
      await apiSend(`/api/delivery-tracking/${encodeURIComponent(slipNo)}`, 'PUT', {
        carrier_3pl: ed.carrier_3pl,
        fee_3pl: Number(ed.fee_3pl) || 0,
        area: ed.area,
        note: ed.note,
      });
      onToast(`Đã lưu đơn ${slipNo}`);
      await load(month);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const deleteRow = async (slipNo: string) => {
    if (!confirm(`Xóa hóa đơn ${slipNo} khỏi bảng theo dõi giao hàng?`)) return;
    try {
      await apiSend(`/api/delivery-tracking/${encodeURIComponent(slipNo)}`, 'DELETE');
      onToast(`Đã xóa đơn ${slipNo}`);
      await load(month);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const pushToDispatch = async (slipNo: string) => {
    setPushingSlip(slipNo);
    try {
      const res = await apiSend(`/api/delivery-tracking/${encodeURIComponent(slipNo)}/push-to-order`, 'POST', {});
      if (res.existed) {
        onToast(`Hóa đơn ${slipNo} đã có bên Điều phối (${res.status})!`);
      } else {
        onToast(`Đã đẩy ${slipNo} sang tab Điều phối & BM-01 (${res.items_created || 0} dòng SP)!`);
      }
      await load(month);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setPushingSlip(null);
    }
  };

  const searchPosSlip = async (val: string) => {
    setPosQuery(val);
    setNewSlip(prev => ({ ...prev, slip_no: val }));
    if (val.trim().length < 3) { setPosMatches([]); return; }
    try {
      setPosMatches(await apiGet(`/api/delivery-tracking/lookup-pos?q=${encodeURIComponent(val)}`));
    } catch { /* ignore */ }
  };

  const pickPosSlip = (p: any) => {
    setNewSlip(prev => ({
      ...prev,
      slip_no: p.slip_no,
      sales_month: p.sales_month || prev.sales_month,
      sales_day: p.sales_day || prev.sales_day,
      delivery_cust_pay: p.delivery_cust_pay || 0,
      install_cust_pay: p.install_cust_pay || 0,
      net_sales_excl_tax: p.net_sales_excl_tax || 0,
      items_summary: p.items_summary || '',
    }));
    setPosQuery(p.slip_no);
    setPosMatches([]);
  };

  const submitManualSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiSend('/api/delivery-tracking', 'POST', newSlip);
      onToast(`Đã thêm hóa đơn ${newSlip.slip_no}${res.matched_pos ? ' (khớp doanh thu POS tự động)' : ''}!`);
      setShowAdd(false);
      setPosQuery('');
      await load(month);
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const quickAcceptSuggestion = async (s: { master_slip_no: string; child_slip_no: string }) => {
    const key = `${s.master_slip_no}<-${s.child_slip_no}`;
    setQuickMergingKey(key);
    try {
      await apiSend('/api/delivery-tracking/merge', 'POST', {
        master_slip_no: s.master_slip_no,
        child_slip_nos: [s.child_slip_no],
        also_merge_orders: true,
      });
      onToast(`Đã gộp bill ${s.child_slip_no} vào đơn chính ${s.master_slip_no}!`);
      await load(month, true);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setQuickMergingKey(null);
    }
  };

  const filteredRows = useMemo(() => (data?.rows || []).filter((r: any) => {
    if (!searchQ.trim()) return true;
    const q = searchQ.toLowerCase();
    return (
      String(r.slip_no).toLowerCase().includes(q) ||
      String(r.carrier_3pl || '').toLowerCase().includes(q) ||
      String(r.items_summary || '').toLowerCase().includes(q) ||
      String(r.note || '').toLowerCase().includes(q) ||
      String(r.linked_customer_name || '').toLowerCase().includes(q) ||
      (r.merged_slips || []).some((m: any) => String(m.slip_no).toLowerCase().includes(q))
    );
  }), [data?.rows, searchQ]);

  const chartData = useMemo(() => (data?.pivot || [])
    .filter((p: any) => p.sum_fee > 0 || p.sum_delivery_cust > 0)
    .map((p: any) => ({
      name: p.carrier_3pl,
      fee: Math.round(p.sum_fee / 1000),
      cust: Math.round(p.sum_delivery_cust / 1000),
    })), [data?.pivot]);

  const gt = data?.grand_total || { slip_count: 0, sum_fee: 0, sum_delivery_cust: 0, sum_install_cust: 0, sum_net_sales: 0, fee_to_sales_pct: 0, net_ship_gap: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Theo Dõi Giao Hàng 3PL (Từ POS Transaction Detail)</h1>
          <p className="text-xs text-[#6e5543] mt-0.5">
            Thay thế hoàn toàn Google Sheets: nạp <code>transaction_detail_*.csv</code> để tự tách Phí giao/lắp & Net Sales (Tax excl.), điền 3PL & Fee trực tiếp và tự xuất bảng Pivot.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month === 'LATEST' ? (data?.month || '') : month}
            onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-bold text-[#3B281A]"
          >
            <option value="ALL">Tất cả các tháng (2026)</option>
            {(data?.available_months || []).map((m: string) => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>

          {canEdit && (
            <>
              <label className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-[#F8F4EC] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer">
                <UploadCloud className="w-4 h-4" />
                {uploading ? 'Đang nạp CSV...' : 'Nạp transaction_detail CSV'}
                <input type="file" accept=".csv" className="hidden" onChange={handleUploadPos} />
              </label>

              <button
                onClick={() => setMergeModal({ open: true, masterKey: null, childKeys: [] })}
                className="px-3 py-2 rounded-lg border border-purple-700 text-purple-900 bg-purple-50 text-xs font-semibold flex items-center gap-1 hover:bg-purple-100 cursor-pointer"
                title="Gộp bill thu phí ship / bill mua thêm giao chung 1 chuyến"
              >
                <GitMerge className="w-4 h-4" /> Gộp đơn
              </button>

              <button
                onClick={() => { setNewSlip({ ...newSlip, sales_month: month === 'ALL' ? (data?.month || '2026-11') : month }); setShowAdd(true); }}
                className="px-3 py-2 rounded-lg border border-[#3B281A] text-[#3B281A] bg-white text-xs font-semibold flex items-center gap-1 hover:bg-[#F8F4EC] cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Thêm đơn Freeship
              </button>

              <button
                disabled={exporting || loading}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const m = data?.month || month;
                    await apiDownload(`/api/delivery-tracking/export?month=${encodeURIComponent(m)}`, `Benom_3PL_Delivery_Report_${m}.xlsx`);
                    onToast(`Đã xuất Excel Báo cáo 3PL (${m === 'ALL' ? '2026' : fmtMonth(m)})!`);
                  } catch (e: any) {
                    onToast(e.message, 'err');
                  } finally {
                    setExporting(false);
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" /> {exporting ? 'Đang xuất...' : 'Xuất Excel Pivot'}
              </button>
            </>
          )}
        </div>
      </div>

      {loading || !data ? (
        <div className="p-8 text-center text-[#6e5543] text-sm">Đang tải báo cáo giao hàng 3PL...</div>
      ) : (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
              <div className="text-xs text-[#6e5543] font-medium">Tổng Đơn Giao ({month === 'ALL' ? '2026' : fmtMonth(month)})</div>
              <div className="text-2xl font-bold text-[#3B281A] mt-1.5">{gt.slip_count} đơn</div>
              <div className="text-[11px] text-[#6e5543] mt-1">Theo hóa đơn POS (No Slip.)</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
              <div className="text-xs text-[#6e5543] font-medium">SUM of Fee (Thực chi 3PL)</div>
              <div className="text-2xl font-bold text-[#9A2B26] mt-1.5">{fmtVnd(gt.sum_fee)}</div>
              <div className="text-[11px] font-semibold text-[#3B281A] mt-1">
                Tỷ lệ Fee / Net Sales: <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">{gt.fee_to_sales_pct}%</span>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
              <div className="text-xs text-[#6e5543] font-medium">Khách Thanh Toán (Giao + Lắp)</div>
              <div className="text-2xl font-bold text-[#234E36] mt-1.5">{fmtVnd(gt.sum_delivery_cust + gt.sum_install_cust)}</div>
              <div className="text-[11px] text-[#6e5543] mt-1">
                Giao: {fmtVnd(gt.sum_delivery_cust)} • Lắp: {fmtVnd(gt.sum_install_cust)}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
              <div className="text-xs text-[#6e5543] font-medium">SUM of Net Sales (Tax excl.)</div>
              <div className="text-2xl font-bold text-[#224B85] mt-1.5">{fmtVnd(gt.sum_net_sales)}</div>
              <div className={`text-[11px] mt-1 font-semibold ${gt.net_ship_gap >= 0 ? 'text-[#234E36]' : 'text-[#9A2B26]'}`}>
                Bù lỗ / Dư ship: {gt.net_ship_gap >= 0 ? '+' : ''}{fmtVnd(gt.net_ship_gap)}
              </div>
            </div>
          </div>

          {/* Pivot Table + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
              <div className="px-4 py-3 bg-[#F8F4EC] border-b border-[#E6DDD1] flex items-center justify-between">
                <span className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-[#3B281A]" /> Bảng Tổng Hợp Pivot Theo Đơn Vị 3PL
                </span>
                <span className="text-[11px] text-[#6e5543]">Tự động cập nhật khi bạn sửa Fee / 3PL bên dưới</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                      <th className="py-2.5 px-3">3PL</th>
                      <th className="py-2.5 px-2 text-center">Số đơn</th>
                      <th className="py-2.5 px-3 text-right">SUM of Fee</th>
                      <th className="py-2.5 px-3 text-right">Delivery Cust.</th>
                      <th className="py-2.5 px-3 text-right">Install Cust.</th>
                      <th className="py-2.5 px-3 text-right">Net Sales (Excl.)</th>
                      <th className="py-2.5 px-3 text-right">% Fee/Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E9DF]">
                    {data.pivot.map((p: any) => (
                      <tr key={p.carrier_3pl} className="hover:bg-[#FAF7F2]">
                        <td className="py-2.5 px-3 font-bold text-[#3B281A]">{p.carrier_3pl}</td>
                        <td className="py-2.5 px-2 text-center font-semibold">{p.slip_count}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-[#9A2B26]">{fmtVnd(p.sum_fee)}</td>
                        <td className="py-2.5 px-3 text-right text-[#234E36]">{fmtVnd(p.sum_delivery_cust)}</td>
                        <td className="py-2.5 px-3 text-right">{fmtVnd(p.sum_install_cust)}</td>
                        <td className="py-2.5 px-3 text-right font-medium">{fmtVnd(p.sum_net_sales)}</td>
                        <td className="py-2.5 px-3 text-right font-bold">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] ${p.fee_to_sales_pct > 5 ? 'bg-red-50 text-[#9A2B26]' : 'bg-emerald-50 text-[#234E36]'}`}>
                            {p.fee_to_sales_pct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#3B281A] text-[#F8F4EC] font-bold">
                      <td className="py-2.5 px-3">Grand Total</td>
                      <td className="py-2.5 px-2 text-center">{gt.slip_count}</td>
                      <td className="py-2.5 px-3 text-right">{fmtVnd(gt.sum_fee)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtVnd(gt.sum_delivery_cust)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtVnd(gt.sum_install_cust)}</td>
                      <td className="py-2.5 px-3 text-right">{fmtVnd(gt.sum_net_sales)}</td>
                      <td className="py-2.5 px-3 text-right">{gt.fee_to_sales_pct}%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
              <h3 className="font-bold text-sm text-[#3B281A] mb-1">Phí 3PL vs Khách Đóng (Nghìn đ)</h3>
              <p className="text-[11px] text-[#6e5543] mb-3">So sánh chi phí thực trả & thu hộ theo hãng</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#3B281A' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6e5543' }} />
                    <Tooltip formatter={(v: any) => [`${v}k đ`, '']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="fee" name="Fee 3PL (k đ)" fill="#9A2B26" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cust" name="Khách trả (k đ)" fill="#234E36" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Smart Auto-Detected Merge Suggestions */}
          {canEdit && Array.isArray(data.merge_suggestions) && data.merge_suggestions.length > 0 && (
            <div className="bg-purple-50/70 rounded-xl border border-purple-200 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-700" />
                  Gợi ý gộp đơn tự động ({data.merge_suggestions.length} cặp phát hiện theo Ghi chú / Mã vận đơn)
                </div>
                <span className="text-[11px] text-purple-800">Gộp để cộng dồn phí ship/lắp vào 1 chuyến duy nhất (có thể tách lại bất cứ lúc nào)</span>
              </div>
              <div className="space-y-1.5">
                {data.merge_suggestions.slice(0, 6).map((s: any) => {
                  const sKey = `${s.master_slip_no}<-${s.child_slip_no}`;
                  return (
                    <div key={sKey} className="bg-white rounded-lg border border-purple-200/80 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-bold text-purple-900">{s.child_slip_no}</span>
                        <span className="mx-1.5 text-[#6e5543]">→ gộp vào →</span>
                        <span className="font-mono font-bold text-[#3B281A]">{s.master_slip_no}</span>
                        <span className="ml-2 text-[11px] text-[#6e5543]">({s.reason})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setMergeModal({ open: true, masterKey: s.master_slip_no, childKeys: [s.child_slip_no] })}
                          className="px-2.5 py-1 rounded-lg border border-purple-300 text-purple-900 text-[11px] font-semibold hover:bg-purple-50 cursor-pointer"
                        >
                          Xem trước
                        </button>
                        <button
                          type="button"
                          disabled={quickMergingKey === sKey}
                          onClick={() => quickAcceptSuggestion(s)}
                          className="px-2.5 py-1 rounded-lg bg-purple-700 text-white text-[11px] font-semibold hover:bg-purple-800 cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <GitMerge className="w-3 h-3" /> {quickMergingKey === sKey ? 'Đang gộp...' : 'Gộp ngay'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inline-Editable Slip Detail Table */}
          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] flex flex-wrap items-center justify-between gap-3">
              <div className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
                <Truck className="w-4 h-4" /> Chi Tiết Từng Hóa Đơn Giao Hàng ({filteredRows.length} đơn)
              </div>
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-[#6e5543] absolute left-3 top-2.5" />
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Lọc No Slip, 3PL, sản phẩm..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">No Slip. / Ngày</th>
                    <th className="py-2.5 px-2 text-right">Delivery Cust.</th>
                    <th className="py-2.5 px-2 text-right">Install Cust.</th>
                    <th className="py-2.5 px-2 text-right">Net Sales (Excl.)</th>
                    <th className="py-2.5 px-2">3PL</th>
                    <th className="py-2.5 px-2">Fee (3PL)</th>
                    <th className="py-2.5 px-2">Area</th>
                    <th className="py-2.5 px-2">Note</th>
                    <th className="py-2.5 px-2 text-center">Điều phối</th>
                    {canEdit && <th className="py-2.5 px-2 text-center">Lưu</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {filteredRows.slice(0, visibleLimit).map((r: any) => {
                    const ed = edits[r.slip_no] || { carrier_3pl: r.carrier_3pl, fee_3pl: r.fee_3pl, area: r.area, note: r.note, dirty: false };
                    return (
                      <tr key={r.slip_no} className={`hover:bg-[#FAF7F2] ${ed.dirty ? 'bg-amber-50/40' : ''}`}>
                        <td className="py-2 px-3 max-w-[240px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailSlipNo(r.slip_no)}
                              className="font-mono font-bold text-[#224B85] hover:text-[#3B281A] hover:underline cursor-pointer text-left inline-flex items-center gap-1"
                              title="Nhấn để xem thông tin chi tiết đơn hàng"
                            >
                              {r.slip_no}
                              <ArrowUpRight className="w-3 h-3 opacity-70 shrink-0" />
                            </button>
                            {Array.isArray(r.merged_slips) && r.merged_slips.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setDetailSlipNo(r.slip_no)}
                                className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px] font-bold inline-flex items-center gap-0.5 hover:bg-purple-200 cursor-pointer"
                                title={`Đã gộp: ${r.merged_slips.map((m: any) => m.slip_no).join(', ')} — Nhấn để xem hoặc tách`}
                              >
                                <GitMerge className="w-2.5 h-2.5" /> +{r.merged_slips.length}
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] text-[#6e5543]">
                            {r.sales_day}
                            {r.linked_customer_name && !/^Khách POS\s/i.test(r.linked_customer_name) ? ` • ${r.linked_customer_name}` : ''}
                          </div>
                          {r.items_summary && <div className="text-[10px] text-[#6e5543] truncate" title={r.items_summary}>{r.items_summary}</div>}
                        </td>
                        <td className="py-2 px-2 text-right whitespace-nowrap text-[#234E36] font-medium">{fmtVnd(r.delivery_cust_pay)}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">{fmtVnd(r.install_cust_pay)}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap font-semibold text-[#3B281A]">{fmtVnd(r.net_sales_excl_tax)}</td>
                        <td className="py-2 px-2">
                          {canEdit ? (
                            <select
                              value={ed.carrier_3pl}
                              onChange={e => setField(r.slip_no, 'carrier_3pl', e.target.value)}
                              className="px-2 py-1 rounded border border-[#D6BCA5] bg-white text-xs font-medium"
                            >
                              {CARRIERS.map(c => <option key={c} value={c}>{c || '— Chọn 3PL —'}</option>)}
                            </select>
                          ) : (
                            <span className="font-medium text-[#3B281A]">{r.carrier_3pl || '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {canEdit ? (
                            <input
                              type="number"
                              value={ed.fee_3pl}
                              onChange={e => setField(r.slip_no, 'fee_3pl', e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveRow(r.slip_no)}
                              className="w-24 px-2 py-1 rounded border border-[#D6BCA5] bg-white text-right font-semibold text-[#9A2B26]"
                            />
                          ) : (
                            <span className="font-semibold text-[#9A2B26]">{fmtVnd(r.fee_3pl)}</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {canEdit ? (
                            <input
                              value={ed.area}
                              onChange={e => setField(r.slip_no, 'area', e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveRow(r.slip_no)}
                              className="w-20 px-2 py-1 rounded border border-[#D6BCA5] bg-white"
                            />
                          ) : (
                            <span>{r.area || '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {canEdit ? (
                            <input
                              value={ed.note}
                              onChange={e => setField(r.slip_no, 'note', e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveRow(r.slip_no)}
                              placeholder="Ghi chú..."
                              className="w-28 px-2 py-1 rounded border border-[#D6BCA5] bg-white"
                            />
                          ) : (
                            <span className="text-[#6e5543]">{r.note || '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          {r.linked_order_id ? (
                            <button
                              type="button"
                              onClick={() => onNavigate?.('orders')}
                              className="px-2 py-1 rounded-full bg-emerald-50 text-[#234E36] text-[10px] font-bold hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-0.5"
                              title="Mở tab Điều phối & BM-01"
                            >
                              ✓ {r.linked_order_status || 'Đã ĐP'} <ArrowUpRight className="w-3 h-3" />
                            </button>
                          ) : canEdit ? (
                            <button
                              type="button"
                              disabled={pushingSlip === r.slip_no}
                              onClick={() => pushToDispatch(r.slip_no)}
                              className="px-2 py-1 rounded-lg bg-[#224B85] text-white text-[10px] font-semibold hover:bg-[#1a3a68] cursor-pointer disabled:opacity-60"
                              title="Tạo đơn giao/lắp bên Điều phối & tự đồng bộ 3PL"
                            >
                              {pushingSlip === r.slip_no ? '...' : '+ Đẩy ĐP'}
                            </button>
                          ) : (
                            <span className="text-[10px] text-[#6e5543]">—</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-2 px-2 text-center whitespace-nowrap space-x-1">
                            <button
                              onClick={() => saveRow(r.slip_no)}
                              className={`p-1.5 rounded-lg cursor-pointer ${ed.dirty ? 'bg-[#234E36] text-white' : 'bg-[#F8F4EC] text-[#3B281A] hover:bg-[#EFE7DC]'}`}
                              title="Lưu dòng này"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteRow(r.slip_no)}
                              className="p-1.5 rounded-lg bg-red-50 text-[#9A2B26] hover:bg-red-100 cursor-pointer"
                              title="Xóa khỏi bảng theo dõi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredRows.length > visibleLimit && (
              <div className="p-3 bg-[#FAF7F2] border-t border-[#E6DDD1] flex items-center justify-between text-xs">
                <span className="text-[#6e5543]">Đang hiển thị <strong>{visibleLimit}</strong> / {filteredRows.length} hóa đơn</span>
                <button
                  type="button"
                  onClick={() => setVisibleLimit(v => v + 50)}
                  className="px-4 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold hover:bg-[#563C28] cursor-pointer"
                >
                  Hiển thị thêm {Math.min(50, filteredRows.length - visibleLimit)} hóa đơn
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Slip No. Detail Pop-up Modal (lazy-loaded on-demand only when clicked) */}
      {detailSlipNo && (
        <Suspense fallback={null}>
          <SlipDetailModal
            slipNo={detailSlipNo}
            canEdit={canEdit}
            onClose={() => setDetailSlipNo(null)}
            onPushToDispatch={pushToDispatch}
            onChanged={() => load(month, true)}
            onNavigateOrders={onNavigate ? () => onNavigate('orders') : undefined}
            onToast={onToast}
          />
        </Suspense>
      )}

      {/* Merge Slips Modal (lazy-loaded on-demand) */}
      {mergeModal.open && (
        <Suspense fallback={null}>
          <MergeModal
            mode="3pl"
            rows={data?.rows || []}
            initialMasterKey={mergeModal.masterKey}
            initialChildKeys={mergeModal.childKeys}
            onClose={() => setMergeModal({ open: false })}
            onMerged={() => load(month, true)}
            onToast={onToast}
          />
        </Suspense>
      )}

      {/* Add Freeship / Manual Slip Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <form onSubmit={submitManualSlip} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#E6DDD1]">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
              <div className="font-bold text-sm">Thêm Hóa Đơn Giao Hàng (Freeship / Không quẹt mã phí ship)</div>
              <button type="button" onClick={() => setShowAdd(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="relative">
                <label className="font-semibold text-[#6e5543]">Tìm & chọn No Slip. từ POS (tự điền Net Sales) *</label>
                <input
                  required
                  value={posQuery}
                  onChange={e => searchPosSlip(e.target.value)}
                  placeholder="Gõ số Slip No. (VD: 3001020004394) hoặc tên sản phẩm..."
                  className="w-full mt-1 px-3 py-2 border border-[#D6BCA5] rounded-lg"
                />
                {posMatches.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D6BCA5] rounded-lg shadow-lg max-h-44 overflow-y-auto">
                    {posMatches.map(p => (
                      <button
                        type="button"
                        key={p.slip_no}
                        onClick={() => pickPosSlip(p)}
                        className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] border-b border-[#F0E9DF] flex justify-between cursor-pointer"
                      >
                        <div>
                          <div className="font-mono font-bold text-[#3B281A]">{p.slip_no} ({p.sales_day})</div>
                          <div className="text-[10px] text-[#6e5543] truncate max-w-[260px]">{p.items_summary}</div>
                        </div>
                        <span className="font-semibold text-[#224B85]">{fmtVnd(p.net_sales_excl_tax)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị 3PL</label>
                  <select value={newSlip.carrier_3pl} onChange={e => setNewSlip({ ...newSlip, carrier_3pl: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    {CARRIERS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Fee 3PL thực chi (đ)</label>
                  <input type="number" value={newSlip.fee_3pl} onChange={e => setNewSlip({ ...newSlip, fee_3pl: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Khu vực (Area)</label>
                  <input value={newSlip.area} onChange={e => setNewSlip({ ...newSlip, area: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Net Sales (Tax excl.)</label>
                  <input type="number" value={newSlip.net_sales_excl_tax} onChange={e => setNewSlip({ ...newSlip, net_sales_excl_tax: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Ghi chú (Note)</label>
                  <input value={newSlip.note} onChange={e => setNewSlip({ ...newSlip, note: e.target.value })} placeholder="VD: Freeship đơn > 5tr, Replenish..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Thêm vào bảng</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
