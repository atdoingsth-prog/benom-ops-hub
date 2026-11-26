import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, FileOutput,
  Plus, Printer, Search, Star, Truck, X
} from 'lucide-react';
import { apiGet, apiSend, fmtVnd, PrintDoc } from '../api';
import HandoverModal from '../components/HandoverModal';
import KtvListPicker, { KtvEntry } from '../components/KtvListPicker';

function formatKtvList(row: any): string {
  const arr: KtvEntry[] = Array.isArray(row.ktvs) && row.ktvs.length > 0
    ? row.ktvs
    : [
        ...(row.ktv1_name ? [{ code: row.ktv1_code || '', name: row.ktv1_name }] : []),
        ...(row.ktv2_name ? [{ code: row.ktv2_code || '', name: row.ktv2_name }] : []),
      ];
  if (arr.length === 0) return 'Chưa gán';
  return arr.map(k => (k.code ? `[${k.code}] ${k.name}` : k.name)).join(', ');
}

interface Props {
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
}

export default function OrdersDispatchView({ onToast, onPrint }: Props) {
  const [subTab, setSubTab] = useState<'orders' | 'handovers'>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeHandover, setActiveHandover] = useState<any>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  // New Order Form
  const [newOrder, setNewOrder] = useState<any>({
    invoice_no: '',
    order_date: new Date().toISOString().slice(0, 10),
    delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    customer_name: '',
    customer_phone: '',
    address: '',
    region: 'HCM',
    distance_km: 5,
    carrier: 'Ahamove',
    source_warehouse: '9005',
    shipping_fee_3pl: 0,
    customer_paid_fee: 0,
    is_promo_free_ship: false,
    require_install: true,
    is_stairs: false,
    ktvs: [{ code: '260135', name: 'Trần Anh Tuyến' }] as KtvEntry[],
    notes: '',
    items: [] as any[],
  });
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [o, h, l] = await Promise.all([
        apiGet(`/api/orders?q=${encodeURIComponent(q)}&status=${encodeURIComponent(statusFilter)}`),
        apiGet('/api/handovers'),
        apiGet('/api/master/lookups'),
      ]);
      setOrders(o);
      setHandovers(h);
      setStaff(l.staff || []);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  useEffect(() => { loadData(); }, [statusFilter]);

  const searchSku = async (val: string) => {
    setSkuSearch(val);
    if (val.trim().length < 2) { setSkuResults([]); return; }
    try {
      const res = await apiGet(`/api/master/products?q=${encodeURIComponent(val)}&type=PRODUCT`);
      setSkuResults(res.slice(0, 8));
    } catch { /* ignore */ }
  };

  const addSkuToOrder = (p: any) => {
    setNewOrder((prev: any) => ({
      ...prev,
      items: [...prev.items, { barcode: p.barcode, product_name: p.name_vn, unit: p.unit || 'Cái', qty: 1, net_weight_g: p.net_weight_g || 0 }],
    }));
    setSkuSearch('');
    setSkuResults([]);
  };

  const requiresTwoKtv = newOrder.items.some((it: any) => (it.net_weight_g || 0) >= 25000);

  const submitNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrder.invoice_no || !newOrder.customer_name || newOrder.items.length === 0) {
      onToast('Vui lòng nhập Mã hóa đơn, Tên khách và ít nhất 1 sản phẩm!', 'err');
      return;
    }
    try {
      await apiSend('/api/orders', 'POST', newOrder);
      onToast(`Đã tạo đơn hàng ${newOrder.invoice_no}!`);
      setShowNewOrder(false);
      setNewOrder({ ...newOrder, invoice_no: '', customer_name: '', customer_phone: '', address: '', items: [] });
      loadData();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const genXk = async (o: any) => {
    try {
      const res = await apiSend(`/api/orders/${o.id}/generate-xk`, 'POST', {});
      onToast(`Đã tạo phiếu xuất kho ${res.slip_no}${res.cutoff_warning ? ' — Lưu ý Cut-off!' : ''}`);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const genHandover = async (o: any, docType: 'BM-01' | 'BM-05') => {
    try {
      const res = await apiSend(`/api/orders/${o.id}/generate-handover`, 'POST', { doc_type: docType });
      onToast(`Đã tạo ${res.doc_type} số ${res.doc_no}!`);
      await loadData();
      setSubTab('handovers');
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Điều Phối Đơn Hàng & Bàn Giao (BM-01 / BM-05)</h1>
          <p className="text-xs text-[#6e5543]">Tích hợp khóa an toàn hàng ≥ 25 kg (2 KTV), tạo nhanh XK 9005 & biên bản ký điện tử + CSAT trên di động.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#EFE7DC] p-1 rounded-lg">
            <button
              onClick={() => setSubTab('orders')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'orders' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              <Truck className="w-3.5 h-3.5" /> Đơn hàng ({orders.length})
            </button>
            <button
              onClick={() => setSubTab('handovers')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'handovers' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" /> Biên bản BM-01/05 ({handovers.length})
            </button>
          </div>
          <button
            onClick={() => setShowNewOrder(true)}
            className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tạo đơn mới
          </button>
        </div>
      </div>

      {subTab === 'orders' ? (
        <>
          {/* Filter Bar */}
          <form onSubmit={e => { e.preventDefault(); loadData(); }} className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Tìm Mã hóa đơn, Khách hàng, SĐT, Mã vận đơn..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-medium"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="New">Mới tạo (New)</option>
              <option value="In Transit">Đang giao (In Transit)</option>
              <option value="Done">Hoàn tất (Done)</option>
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Lọc</button>
          </form>

          {/* Orders Table */}
          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">Hóa đơn / Ngày</th>
                    <th className="py-2.5 px-3">Khách hàng</th>
                    <th className="py-2.5 px-3">Sản phẩm</th>
                    <th className="py-2.5 px-3">Vận chuyển & KTV</th>
                    <th className="py-2.5 px-2 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Thao tác nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {orders.slice(0, 80).map(o => (
                    <tr key={o.id} className="hover:bg-[#FAF7F2]">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-[#3B281A]">{o.invoice_no}</div>
                        <div className="text-[11px] text-[#6e5543]">{o.delivery_date || o.order_date}</div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px]">
                        <div className="font-semibold text-[#3B281A] truncate">{o.customer_name}</div>
                        <div className="text-[11px] text-[#6e5543]">{o.customer_phone} • {o.region}</div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[240px]">
                        {o.items?.slice(0, 2).map((it: any, i: number) => (
                          <div key={i} className="truncate text-[#3B281A]">• {it.product_name} (x{it.qty})</div>
                        ))}
                        {o.items?.length > 2 && <div className="text-[10px] text-[#6e5543]">+{o.items.length - 2} sản phẩm khác</div>}
                        {o.requires_two_ktv && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-red-50 text-[#9A2B26] text-[10px] font-bold">
                            ≥ 25 kg • Cần 2 KTV
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[230px]">
                        <div className="font-medium text-[#224B85]">{o.carrier || '—'} {o.shipping_fee_3pl ? `(${fmtVnd(o.shipping_fee_3pl)})` : ''}</div>
                        <div className="text-[11px] text-[#6e5543] leading-snug">
                          {o.require_install || (o.ktvs?.length > 0)
                            ? `KTV (${o.ktvs?.length || 0}): ${formatKtvList(o)}`
                            : 'Giao không lắp'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          o.status === 'Done' ? 'bg-emerald-50 text-[#234E36]' :
                          o.status === 'In Transit' ? 'bg-blue-50 text-[#224B85]' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          onClick={() => genXk(o)}
                          className="px-2 py-1 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[#3B281A] hover:bg-[#efe6d8] text-[11px] font-semibold cursor-pointer"
                          title="Tạo phiếu xuất kho Toàn Nhất 9005"
                        >
                          <FileOutput className="w-3 h-3 inline mr-0.5" /> XK 9005
                        </button>
                        {o.handovers?.length > 0 ? (
                          <button
                            onClick={() => {
                              const found = handovers.find(h => h.id === o.handovers[0].id);
                              if (found) setActiveHandover(found);
                              else setSubTab('handovers');
                            }}
                            className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                              o.handovers[0].status === 'Completed'
                                ? 'bg-emerald-50 border border-[#234E36] text-[#234E36] hover:bg-emerald-100'
                                : 'bg-amber-50 border border-amber-400 text-amber-900 hover:bg-amber-100'
                            }`}
                            title="Mở biên bản đã tạo"
                          >
                            {o.handovers[0].status === 'Completed' ? '✓ ' : ''}{o.handovers[0].doc_no}
                          </button>
                        ) : (
                          <button
                            onClick={() => genHandover(o, o.require_install ? 'BM-01' : 'BM-05')}
                            className="px-2 py-1 rounded bg-[#234E36] text-white hover:bg-[#1b3d2a] text-[11px] font-semibold cursor-pointer"
                          >
                            + {o.require_install ? 'BM-01' : 'BM-05'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* HANDOVERS (BM-01 / BM-05 Mobile Cards) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {handovers.map(h => (
            <div key={h.id} className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-col justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${h.doc_type === 'BM-01' ? 'bg-[#3B281A] text-white' : 'bg-[#224B85] text-white'}`}>
                    {h.doc_type} • {h.doc_no}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.status === 'Completed' ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-800'}`}>
                    {h.status === 'Completed' ? 'Đã nghiệm thu' : 'Chờ ký hiện trường'}
                  </span>
                </div>
                <div className="font-bold text-[#3B281A] mt-2">{h.customer_name}</div>
                <div className="text-xs text-[#6e5543]">{h.customer_phone} • ĐH {h.invoice_no}</div>
                <div className="text-xs text-[#6e5543] mt-1 line-clamp-2">{h.address}</div>
                <div className="text-[11px] text-[#3B281A] mt-2 leading-snug">
                  <strong>KTV ({h.ktvs?.length || 0}):</strong> {formatKtvList(h)}
                </div>
                {h.csat_rating > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-500" /> CSAT: {h.csat_rating}/5 {h.csat_comment ? `— "${h.csat_comment}"` : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-[#EFE7DC]">
                <button
                  onClick={() => setActiveHandover(h)}
                  className="flex-1 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> {h.status === 'Completed' ? 'Xem / Sửa biên bản' : 'Mở ký hiện trường'}
                </button>
                <button
                  onClick={() => onPrint({ type: 'HANDOVER', data: h })}
                  className="px-3 py-2 rounded-lg border border-[#D6BCA5] text-[#3B281A] text-xs font-semibold hover:bg-[#F8F4EC] cursor-pointer"
                  title="In bản A4 PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Handover Mobile Modal */}
      {activeHandover && (
        <HandoverModal
          handover={activeHandover}
          staffList={staff}
          onStaffAdded={s => setStaff(prev => [...prev.filter(x => x.emp_code !== s.emp_code), s])}
          onClose={() => setActiveHandover(null)}
          onSaved={() => { onToast('Đã lưu biên bản & tự động đồng bộ KTV + trạng thái đơn hàng!'); loadData(); }}
          onPrint={h => onPrint({ type: 'HANDOVER', data: h })}
        />
      )}

      {/* Create New Order Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
          <form onSubmit={submitNewOrder} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
              <div className="font-bold">Tạo Đơn Giao & Lắp Đặt Mới</div>
              <button type="button" onClick={() => setShowNewOrder(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Mã hóa đơn POS *</label>
                  <input required value={newOrder.invoice_no} onChange={e => setNewOrder({ ...newOrder, invoice_no: e.target.value })} placeholder="VD: 3001-20261125-001" className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Ngày giao dự kiến</label>
                  <input type="date" value={newOrder.delivery_date} onChange={e => setNewOrder({ ...newOrder, delivery_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Kho xuất</label>
                  <select value={newOrder.source_warehouse} onChange={e => setNewOrder({ ...newOrder, source_warehouse: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="9005">9005 — Kho Toàn Nhất</option>
                    <option value="3001">3001 — Store Lê Thánh Tôn</option>
                    <option value="1001">1001 — Pop-up Aeon Bình Tân</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Tên khách hàng *</label>
                  <input required value={newOrder.customer_name} onChange={e => setNewOrder({ ...newOrder, customer_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Số điện thoại</label>
                  <input value={newOrder.customer_phone} onChange={e => setNewOrder({ ...newOrder, customer_phone: e.target.value })} placeholder="09..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Quãng đường (km)</label>
                  <input type="number" step="0.5" value={newOrder.distance_km} onChange={e => setNewOrder({ ...newOrder, distance_km: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="sm:col-span-3">
                  <label className="font-semibold text-[#6e5543]">Địa chỉ giao hàng</label>
                  <input value={newOrder.address} onChange={e => setNewOrder({ ...newOrder, address: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>

              {/* SKU Search Picker */}
              <div className="bg-[#F8F4EC] p-3.5 rounded-xl border border-[#D6BCA5] space-y-2">
                <label className="font-bold text-[#3B281A]">Thêm sản phẩm từ Master Data *</label>
                <div className="relative">
                  <input
                    value={skuSearch}
                    onChange={e => searchSku(e.target.value)}
                    placeholder="Gõ tên hoặc Barcode sản phẩm (VD: Kito, Cheri, 893...)"
                    className="w-full px-3 py-2 border border-[#D6BCA5] rounded-lg bg-white"
                  />
                  {skuResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D6BCA5] rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {skuResults.map(p => (
                        <button
                          type="button"
                          key={p.barcode}
                          onClick={() => addSkuToOrder(p)}
                          className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] flex justify-between items-center border-b border-[#F0E9DF] cursor-pointer"
                        >
                          <div>
                            <div className="font-semibold text-[#3B281A]">{p.name_vn}</div>
                            <div className="font-mono text-[10px] text-[#6e5543]">{p.barcode} • {(p.net_weight_g / 1000).toFixed(1)} kg</div>
                          </div>
                          <span className="text-[11px] font-bold text-[#234E36]">+ Thêm</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {newOrder.items.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {newOrder.items.map((it: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-[#E6DDD1]">
                        <div>
                          <span className="font-semibold">{it.product_name}</span>
                          {it.net_weight_g >= 25000 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-[#9A2B26] text-[10px] font-bold">≥ 25kg</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={1} value={it.qty}
                            onChange={e => {
                              const arr = [...newOrder.items];
                              arr[i].qty = Number(e.target.value) || 1;
                              setNewOrder({ ...newOrder, items: arr });
                            }}
                            className="w-14 px-2 py-1 border border-[#D6BCA5] rounded text-center"
                          />
                          <button type="button" onClick={() => setNewOrder({ ...newOrder, items: newOrder.items.filter((_: any, idx: number) => idx !== i) })} className="text-[#9A2B26] cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 25kg Safety Lock Banner */}
              {newOrder.require_install && requiresTwoKtv && (
                <div className="p-3 rounded-lg bg-red-50 border border-[#9A2B26] text-[#9A2B26] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Khóa an toàn benom (≥ 25 kg):</strong> Đơn có sản phẩm nặng từ 25 kg trở lên — hệ thống <strong>bắt buộc chọn đủ KTV 1 và KTV 2</strong>!
                  </div>
                </div>
              )}

              {/* Dispatch & KTV */}
              <div className="space-y-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị vận chuyển</label>
                  <select value={newOrder.carrier} onChange={e => setNewOrder({ ...newOrder, carrier: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="Ahamove">Ahamove</option>
                    <option value="Xanh SM">Xanh SM</option>
                    <option value="247 Express">247 Express</option>
                    <option value="Lalamove">Lalamove</option>
                    <option value="Viettel Post">Viettel Post</option>
                    <option value="Toàn Nhất">Toàn Nhất</option>
                    <option value="Khách tự nhận">Khách tự nhận</option>
                  </select>
                </div>
                <KtvListPicker
                  staff={staff}
                  value={newOrder.ktvs || []}
                  onChange={ktvs => setNewOrder({ ...newOrder, ktvs })}
                  onStaffAdded={s => setStaff(prev => [...prev.filter(x => x.emp_code !== s.emp_code), s])}
                  label={`Phân công Kỹ thuật viên ${requiresTwoKtv ? '(Tối thiểu 2 KTV)' : ''}`}
                />
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newOrder.require_install} onChange={e => setNewOrder({ ...newOrder, require_install: e.target.checked })} className="accent-[#3B281A]" />
                  <span>Cần KTV benom lắp đặt</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newOrder.is_stairs} onChange={e => setNewOrder({ ...newOrder, is_stairs: e.target.checked })} className="accent-[#3B281A]" />
                  <span>Khiêng thang bộ (K_Floor = 1.2)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newOrder.is_promo_free_ship} onChange={e => setNewOrder({ ...newOrder, is_promo_free_ship: e.target.checked })} className="accent-[#3B281A]" />
                  <span>Đơn Freeship khuyến mãi</span>
                </label>
              </div>
            </div>

            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewOrder(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold hover:bg-[#563C28] cursor-pointer">Lưu đơn hàng</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
