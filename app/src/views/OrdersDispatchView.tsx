import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, ClipboardCheck, Edit3, FileOutput, GitMerge,
  Plus, Printer, Search, Smartphone, Star, Trash2, Truck, Unlink, X
} from 'lucide-react';
import { apiGet, apiGetPage, apiSend, AuthUser, fmtVnd, NavIntent, PrintDoc } from '../api';
import KtvListPicker, { KtvEntry } from '../components/KtvListPicker';

const KtvFieldBoard = lazy(() => import('../components/KtvFieldBoard'));
const HandoverModal = lazy(() => import('../components/HandoverModal'));
const MergeModal = lazy(() => import('../components/MergeModal'));
const ORDER_PAGE_SIZE = 60;

function formatKtvList(row: any): string {
  const noInstallMode = row.install_mode === 'Sản phẩm không cần lắp đặt';
  const selfInstallMode = row.install_mode === 'Khách hàng tự lắp đặt';
  const isNoKtv = noInstallMode || selfInstallMode || (row.require_install !== undefined && !row.require_install);
  const arr: KtvEntry[] = Array.isArray(row.ktvs) && row.ktvs.length > 0
    ? row.ktvs
    : [
        ...(row.ktv1_name ? [{ code: row.ktv1_code || '', name: row.ktv1_name }] : []),
        ...(row.ktv2_name ? [{ code: row.ktv2_code || '', name: row.ktv2_name }] : []),
      ];
  if (arr.length === 0) {
    if (noInstallMode) return 'Không cần gán (SP không lắp đặt)';
    if (selfInstallMode) return 'Không cần gán (KH tự lắp)';
    return isNoKtv ? 'Không cần gán (Không lắp đặt)' : 'Chưa gán';
  }
  return arr.map(k => (k.code ? `[${k.code}] ${k.name}` : k.name)).join(', ');
}

const WAREHOUSE_BADGE: Record<string, string> = {
  '9005': 'bg-blue-50 text-[#224B85] border-blue-200',
  '3001': 'bg-[#F8F4EC] text-[#3B281A] border-[#D6BCA5]',
  '1001': 'bg-emerald-50 text-[#234E36] border-emerald-200',
};

const CARRIER_OPTIONS = [
  'Ahamove', 'Xanh SM', '247 Express', 'Sagawa', 'Nhất Tín Logistics',
  'Lalamove', 'Viettel Post', 'Toàn Nhất Logistics', 'Kỹ thuật Benom', 'Khách tự nhận'
];

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
  onNavigate?: (tab: string, intent?: NavIntent) => void;
  navIntent?: NavIntent | null;
  onConsumeIntent?: () => void;
}

export default function OrdersDispatchView({ user, onToast, onPrint, onNavigate, navIntent, onConsumeIntent }: Props) {
  const canManageOrders = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canHandover = user.role === 'ADMIN' || user.role === 'EDITOR' || user.role === 'KTV';

  type OrdersSubTab = 'ktv_today' | 'schedule' | 'orders' | 'handovers';
  const subTabStorageKey = `benom_orders_subtab_${user.role}`;
  const [subTab, setSubTabState] = useState<OrdersSubTab>(() => {
    const saved = localStorage.getItem(subTabStorageKey);
    if (saved === 'ktv_today' || saved === 'schedule' || saved === 'orders' || saved === 'handovers') {
      return saved;
    }
    return user.role === 'KTV' ? 'ktv_today' : 'orders';
  });
  const setSubTab = (v: OrdersSubTab) => {
    setSubTabState(v);
    localStorage.setItem(subTabStorageKey, v);
  };
  const [orders, setOrders] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [handoversLoaded, setHandoversLoaded] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeHandover, setActiveHandover] = useState<any>(null);
  const [showMergeOrders, setShowMergeOrders] = useState(false);
  const [unmergingOrderId, setUnmergingOrderId] = useState<number | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSkuSearch, setEditSkuSearch] = useState('');
  const [editSkuResults, setEditSkuResults] = useState<any[]>([]);

  // New Order Form + POS Auto-fill (TASK-08)
  const [posMatches, setPosMatches] = useState<any[]>([]);
  const [posHintSummary, setPosHintSummary] = useState('');
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
    tracking_no: '',
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

  const ensureStaffLoaded = async () => {
    if (staff.length > 0) return;
    try {
      const l = await apiGet('/api/master/lookups', { cacheMs: 300000 });
      setStaff(l.staff || []);
    } catch { /* ignore */ }
  };

  const loadOrders = async (offset = 0, append = false) => {
    if (append) setLoadingMoreOrders(true);
    try {
      const lim = subTab === 'orders' ? ORDER_PAGE_SIZE : 100;
      const { data, total } = await apiGetPage(
        `/api/orders?q=${encodeURIComponent(q)}&status=${encodeURIComponent(statusFilter)}&limit=${lim}&offset=${offset}`
      );
      setOrders(prev => (append ? [...prev, ...data] : data));
      setTotalOrders(total);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      if (append) setLoadingMoreOrders(false);
    }
  };

  const loadHandovers = async () => {
    try {
      setHandovers(await apiGet('/api/handovers'));
      setHandoversLoaded(true);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const loadData = async () => {
    if (subTab === 'handovers') {
      await loadHandovers();
    } else {
      await loadOrders(0, false);
      if (handoversLoaded) loadHandovers();
    }
  };

  useEffect(() => {
    if (subTab === 'handovers') {
      if (!handoversLoaded) loadHandovers();
    } else {
      loadOrders(0, false);
    }
  }, [subTab, statusFilter]);

  // Cross-module deep-link consumer: immediately opens HandoverModal or EditOrderModal
  useEffect(() => {
    if (!navIntent?.nonce) return;
    const intent = navIntent;
    onConsumeIntent?.();

    if (intent.subTab === 'ktv_today' || intent.subTab === 'schedule' || intent.subTab === 'orders' || intent.subTab === 'handovers') {
      setSubTab(intent.subTab);
    }

    (async () => {
      try {
        if (intent.openHandoverId) {
          ensureStaffLoaded();
          const full = await apiGet(`/api/handovers/${intent.openHandoverId}`);
          setActiveHandover(full);
          return;
        }
        if (intent.openOrCreateHandoverForOrderId || intent.openOrCreateHandoverForInvoice) {
          ensureStaffLoaded();
          const ord = intent.openOrCreateHandoverForOrderId
            ? await apiGet(`/api/orders/${intent.openOrCreateHandoverForOrderId}`)
            : await apiGet(`/api/orders/by-invoice/${encodeURIComponent(intent.openOrCreateHandoverForInvoice || '')}`);
          await openOrCreateHandoverForOrder(ord, intent.preferredDocType);
          return;
        }
        if (intent.openOrderId || intent.openOrderInvoice) {
          const ord = intent.openOrderId
            ? await apiGet(`/api/orders/${intent.openOrderId}`)
            : await apiGet(`/api/orders/by-invoice/${encodeURIComponent(intent.openOrderInvoice || '')}`);
          if (canManageOrders) {
            openEditOrder(ord);
          } else {
            await openOrCreateHandoverForOrder(ord);
          }
          return;
        }
        if (intent.prefillNewOrder && canManageOrders) {
          ensureStaffLoaded();
          const pf = intent.prefillNewOrder;
          const reqInstall = pf.require_install !== undefined ? pf.require_install : true;
          setNewOrder((prev: any) => ({
            ...prev,
            invoice_no: '',
            order_date: new Date().toISOString().slice(0, 10),
            delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            customer_name: '',
            customer_phone: '',
            address: pf.address ?? prev.address,
            region: pf.region ?? prev.region,
            distance_km: pf.distance_km ?? prev.distance_km,
            carrier: pf.carrier ?? prev.carrier,
            tracking_no: '',
            source_warehouse: pf.source_warehouse ?? prev.source_warehouse,
            shipping_fee_3pl: pf.shipping_fee_3pl ?? 0,
            customer_paid_fee: pf.customer_paid_fee ?? 0,
            is_promo_free_ship: (pf.customer_paid_fee ?? 0) === 0,
            require_install: reqInstall,
            ktvs: reqInstall ? [{ code: '260135', name: 'Trần Anh Tuyến' }] : [],
            notes: pf.notes ?? '',
            items: Array.isArray(pf.items) && pf.items.length > 0
              ? pf.items.map(it => ({
                  barcode: it.barcode,
                  product_name: it.product_name,
                  unit: it.unit || 'Cái',
                  qty: Number(it.qty) || 1,
                  net_weight_g: Number(it.net_weight_g) || 0,
                  source_warehouse: it.source_warehouse || pf.source_warehouse || '9005',
                  moving_no: '',
                }))
              : [],
          }));
          setPosHintSummary('');
          setSubTab('orders');
          setShowNewOrder(true);
          onToast('Đã nạp dữ liệu báo giá vận chuyển vào form tạo đơn hàng mới!');
        }
      } catch (e: any) {
        onToast(e.message, 'err');
      }
    })();
  }, [navIntent?.nonce]);

  const searchPosForOrder = async (val: string) => {
    setNewOrder((prev: any) => ({ ...prev, invoice_no: val }));
    if (val.trim().length < 3) { setPosMatches([]); return; }
    try {
      const res = await apiGet(`/api/delivery-tracking/lookup-pos?q=${encodeURIComponent(val.trim())}`);
      setPosMatches(res.slice(0, 6));
    } catch { /* ignore */ }
  };

  const applyPosSlipToNewOrder = (p: any) => {
    const custPaid = Number(p.delivery_cust_pay || 0) + Number(p.install_cust_pay || 0);
    setNewOrder((prev: any) => ({
      ...prev,
      invoice_no: p.slip_no,
      order_date: p.sales_day || prev.order_date,
      customer_paid_fee: custPaid,
      require_install: Number(p.install_cust_pay || 0) > 0 ? true : prev.require_install,
      is_promo_free_ship: Number(p.delivery_cust_pay || 0) === 0,
    }));
    setPosHintSummary(p.items_summary || '');
    setPosMatches([]);
    onToast(`Đã tự điền thông tin từ hóa đơn POS ${p.slip_no}!`);
  };

  const pickDefaultWarehouseForProduct = (p: any, fallback: string) => {
    if ((p.stock_9005 || 0) > 0) return '9005';
    if ((p.stock_3001 || 0) > 0) return '3001';
    if ((p.stock_1001 || 0) > 0) return '1001';
    return fallback || '9005';
  };

  const searchSku = async (val: string) => {
    setSkuSearch(val);
    if (val.trim().length < 2) { setSkuResults([]); return; }
    try {
      const res = await apiGet(`/api/master/products?q=${encodeURIComponent(val)}&type=PRODUCT&include_all_stock=1`);
      setSkuResults(res.slice(0, 8));
    } catch { /* ignore */ }
  };

  const addSkuToOrder = (p: any) => {
    const wh = pickDefaultWarehouseForProduct(p, newOrder.source_warehouse);
    setNewOrder((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          barcode: p.barcode,
          product_name: p.name_vn,
          unit: p.unit || 'Cái',
          qty: 1,
          net_weight_g: p.net_weight_g || 0,
          source_warehouse: wh,
          moving_no: wh === '9005' ? (prev.moving_no || '') : '',
        },
      ],
    }));
    setSkuSearch('');
    setSkuResults([]);
  };

  const searchEditSku = async (val: string) => {
    setEditSkuSearch(val);
    if (val.trim().length < 2) { setEditSkuResults([]); return; }
    try {
      const res = await apiGet(`/api/master/products?q=${encodeURIComponent(val)}&type=PRODUCT&include_all_stock=1`);
      setEditSkuResults(res.slice(0, 8));
    } catch { /* ignore */ }
  };

  const addSkuToEditOrder = (p: any) => {
    if (!editingOrder) return;
    const wh = pickDefaultWarehouseForProduct(p, '9005');
    setEditingOrder((prev: any) => ({
      ...prev,
      items: [
        ...(prev.items || []),
        {
          barcode: p.barcode,
          product_name: p.name_vn,
          unit: p.unit || 'Cái',
          qty: 1,
          net_weight_g: p.net_weight_g || 0,
          source_warehouse: wh,
          moving_no: '',
        },
      ],
    }));
    setEditSkuSearch('');
    setEditSkuResults([]);
  };

  const requiresTwoKtv = newOrder.items.some((it: any) => (it.net_weight_g || 0) >= 25000);

  const submitNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingNew) return;
    if (!newOrder.invoice_no || !newOrder.customer_name || newOrder.items.length === 0) {
      onToast('Vui lòng nhập Mã hóa đơn, Tên khách và ít nhất 1 sản phẩm!', 'err');
      return;
    }
    setSavingNew(true);
    try {
      await apiSend('/api/orders', 'POST', newOrder);
      onToast(`Đã tạo đơn hàng ${newOrder.invoice_no}!`);
      setShowNewOrder(false);
      setPosHintSummary('');
      setNewOrder({ ...newOrder, invoice_no: '', customer_name: '', customer_phone: '', address: '', tracking_no: '', shipping_fee_3pl: 0, customer_paid_fee: 0, notes: '', items: [] });
      loadData();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setSavingNew(false);
    }
  };

  const openEditOrder = (o: any) => {
    ensureStaffLoaded();
    setEditSkuSearch('');
    setEditSkuResults([]);
    setEditingOrder({
      ...o,
      is_stairs: Boolean(o.is_stairs),
      require_install: Boolean(o.require_install),
      is_promo_free_ship: Boolean(o.is_promo_free_ship),
      ktvs: Array.isArray(o.ktvs) ? o.ktvs : [],
      items: (o.items || []).map((it: any) => ({
        ...it,
        source_warehouse: it.source_warehouse || (['9005', '3001', '1001'].includes(o.source_warehouse) ? o.source_warehouse : '9005'),
        moving_no: it.moving_no || '',
      })),
    });
  };

  const submitEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || savingEdit) return;
    setSavingEdit(true);
    try {
      await apiSend(`/api/orders/${editingOrder.id}`, 'PUT', editingOrder);
      onToast(`Đã cập nhật đơn hàng ${editingOrder.invoice_no}!`);
      setEditingOrder(null);
      loadData();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteOrder = async (o: any) => {
    if (!confirm(`Bạn chắc chắn muốn XÓA đơn hàng ${o.invoice_no} (${o.customer_name})?`)) return;
    try {
      await apiSend(`/api/orders/${o.id}`, 'DELETE');
      onToast(`Đã xóa đơn hàng ${o.invoice_no}!`);
      loadData();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const unmergeChildOrder = async (childId: number, childInvoice: string) => {
    if (!confirm(`Tách đơn phụ ${childInvoice} trở lại thành đơn riêng biệt?`)) return;
    setUnmergingOrderId(childId);
    try {
      await apiSend(`/api/orders/${childId}/unmerge`, 'POST', {});
      onToast(`Đã tách đơn ${childInvoice} thành công!`);
      setEditingOrder(null);
      await loadData();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setUnmergingOrderId(null);
    }
  };

  const genXk = async (o: any) => {
    try {
      const res = await apiSend(`/api/orders/${o.id}/generate-xk`, 'POST', {});
      const partNote = res.items_count && res.total_order_items && res.items_count < res.total_order_items
        ? ` (${res.items_count}/${res.total_order_items} SP lấy từ 9005)`
        : '';
      onToast(`Đã tạo phiếu xuất kho ${res.slip_no}${partNote}${res.cutoff_warning ? ' — Lưu ý Cut-off!' : ''}`);
      if (onNavigate && res.id) {
        onNavigate('warehouse', { subTab: 'slips', openSlipId: res.id });
      } else {
        await loadData();
      }
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const genHandover = async (o: any, docType: 'BM-01' | 'BM-05') => {
    ensureStaffLoaded();
    try {
      const res = await apiSend(`/api/orders/${o.id}/generate-handover`, 'POST', { doc_type: docType });
      onToast(`Đã tạo ${res.doc_type} số ${res.doc_no}!`);
      const full = await apiGet(`/api/handovers/${res.id}`);
      await loadData();
      setSubTab('handovers');
      setActiveHandover(full);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  // Lazy-fetch full handover (signature + photos) before printing from card list
  const printHandover = async (h: any) => {
    try {
      const full = h.signature_data === undefined && h.id
        ? await apiGet(`/api/handovers/${h.id}`)
        : h;
      onPrint({ type: 'HANDOVER', data: full });
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  // 1-tap open or auto-create BM-01/BM-05 (from KtvFieldBoard, 3PL Push, Allowance, etc.)
  const openOrCreateHandoverForOrder = async (o: any, preferredDocType?: 'BM-01' | 'BM-05') => {
    ensureStaffLoaded();
    try {
      const existingId = o.handovers?.[0]?.id;
      if (existingId) {
        const found = handovers.find(h => h.id === existingId);
        if (found) {
          setActiveHandover(found);
          return;
        }
        const full = await apiGet(`/api/handovers/${existingId}`);
        setActiveHandover(full);
        return;
      }
      if (!canHandover) {
        onToast('Đơn hàng này chưa có biên bản bàn giao.', 'err');
        return;
      }
      const docType = preferredDocType || (o.require_install ? 'BM-01' : 'BM-05');
      const res = await apiSend(`/api/orders/${o.id}/generate-handover`, 'POST', { doc_type: docType });
      onToast(`Đã tạo ${res.doc_type} số ${res.doc_no}!`);
      const full = await apiGet(`/api/handovers/${res.id}`);
      await loadData();
      setActiveHandover(full);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Điều Phối Đơn Hàng, Lịch KTV & Bàn Giao (BM-01/05)</h1>
          <p className="text-xs text-[#6e5543]">Chế độ KTV 4G Hiện trường, Lịch Điều phối gom tuyến theo quận, khóa an toàn ≥ 25 kg (2 KTV) & ký BM-01/05 + CSAT.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap bg-[#EFE7DC] p-1 rounded-lg gap-0.5">
            <button
              onClick={() => setSubTab('ktv_today')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'ktv_today' ? 'bg-[#234E36] text-white' : 'text-[#3B281A]'}`}
            >
              <Smartphone className="w-3.5 h-3.5" /> KTV Hiện trường
            </button>
            <button
              onClick={() => setSubTab('schedule')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'schedule' ? 'bg-[#224B85] text-white' : 'text-[#3B281A]'}`}
            >
              <Calendar className="w-3.5 h-3.5" /> Lịch ĐP
            </button>
            <button
              onClick={() => setSubTab('orders')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'orders' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              <Truck className="w-3.5 h-3.5" /> Đơn hàng {totalOrders > 0 ? `(${totalOrders})` : ''}
            </button>
            <button
              onClick={() => setSubTab('handovers')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'handovers' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" /> Biên bản {handoversLoaded ? `(${handovers.length})` : ''}
            </button>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('delivery3pl', { subTab: 'quote' })}
              className="px-3 py-2 rounded-lg border border-amber-700 text-amber-900 bg-amber-50 text-xs font-semibold flex items-center gap-1.5 hover:bg-amber-100 cursor-pointer"
              title="Mở công cụ tính phí & báo giá Ahamove / Xanh SM / CPN"
            >
              <Truck className="w-4 h-4" /> Tính phí Ship
            </button>
          )}
          {canManageOrders && (
            <>
              <button
                onClick={() => setShowMergeOrders(true)}
                className="px-3 py-2 rounded-lg border border-purple-700 text-purple-900 bg-purple-50 text-xs font-semibold flex items-center gap-1.5 hover:bg-purple-100 cursor-pointer"
                title="Gộp nhiều bill của cùng 1 khách giao chung chuyến"
              >
                <GitMerge className="w-4 h-4" /> Gộp đơn
              </button>
              <button
                onClick={() => { ensureStaffLoaded(); setShowNewOrder(true); }}
                className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Tạo đơn mới
              </button>
            </>
          )}
        </div>
      </div>

      {(subTab === 'ktv_today' || subTab === 'schedule') ? (
        <Suspense fallback={<div className="p-8 text-center text-xs text-[#6e5543]">Đang tải lịch điều phối KTV...</div>}>
          <KtvFieldBoard
            mode={subTab}
            user={user}
            orders={orders}
            handovers={handovers}
            canManageOrders={canManageOrders}
            canHandover={canHandover}
            onEditOrder={openEditOrder}
            onOpenHandover={openOrCreateHandoverForOrder}
          />
        </Suspense>
      ) : subTab === 'orders' ? (
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
              <option value="Cancelled">Đã hủy (Cancelled)</option>
              <option value="Merged">Đã gộp vào đơn khác (Merged)</option>
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
                  {orders.map(o => (
                    <tr key={o.id} className={`hover:bg-[#FAF7F2] ${o.status === 'Cancelled' ? 'opacity-60' : ''}`}>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-[#3B281A] flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('delivery3pl', { open3plSlipNo: o.invoice_no })}
                            className="font-mono hover:text-[#224B85] hover:underline cursor-pointer text-left"
                            title="Mở pop-up Chi tiết POS & 3PL"
                          >
                            {o.invoice_no}
                          </button>
                          {o.merged_invoices && (
                            <span
                              className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px] font-bold inline-flex items-center gap-0.5"
                              title={`Đã gộp bill: ${o.merged_invoices}`}
                            >
                              <GitMerge className="w-2.5 h-2.5" /> +{o.merged_invoices.split(',').filter(Boolean).length}
                            </span>
                          )}
                        </div>
                        {o.merged_invoices && (
                          <div className="text-[10px] font-mono text-purple-800 truncate max-w-[175px]" title={o.merged_invoices}>
                            Gộp: {o.merged_invoices}
                          </div>
                        )}
                        <div className="text-[11px] text-[#6e5543]">
                          {o.delivery_date || o.order_date} {o.distance_km ? `• ${o.distance_km}km` : ''}
                        </div>
                        {Array.isArray(o.warehouse_slips) && o.warehouse_slips.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {o.warehouse_slips.map((ws: any) => (
                              <button
                                type="button"
                                key={ws.id}
                                onClick={() => onNavigate?.('warehouse', { subTab: 'slips', openSlipId: ws.id })}
                                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold cursor-pointer hover:opacity-80 ${
                                  ws.slip_type === 'NK'
                                    ? 'bg-emerald-50 text-[#234E36] border-emerald-200'
                                    : 'bg-blue-50 text-[#224B85] border-blue-200'
                                }`}
                                title={`Mở phiếu kho ${ws.slip_no} (${ws.status})`}
                              >
                                {ws.slip_no}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px]">
                        <div className="font-semibold text-[#3B281A] truncate">{o.customer_name}</div>
                        <div className="text-[11px] text-[#6e5543]">
                          {o.customer_phone} • {o.region} {o.is_stairs ? '• Thang bộ (1.2x)' : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[270px]">
                        {o.items?.slice(0, 3).map((it: any, i: number) => {
                          const wh = it.source_warehouse || (['9005', '3001', '1001'].includes(o.source_warehouse) ? o.source_warehouse : '');
                          return (
                            <div key={i} className="truncate text-[#3B281A] flex items-center gap-1">
                              {wh && (
                                <span className={`shrink-0 px-1 py-0 rounded border text-[9px] font-mono font-bold ${WAREHOUSE_BADGE[wh] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                  {wh}
                                </span>
                              )}
                              <span className="truncate">{it.product_name} (x{it.qty})</span>
                            </div>
                          );
                        })}
                        {o.items?.length > 3 && <div className="text-[10px] text-[#6e5543]">+{o.items.length - 3} sản phẩm khác</div>}
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
                          o.status === 'Merged' ? 'bg-purple-100 text-purple-900' :
                          o.status === 'Cancelled' ? 'bg-red-50 text-[#9A2B26]' :
                          o.status === 'Done' ? 'bg-emerald-50 text-[#234E36]' :
                          o.status === 'In Transit' ? 'bg-blue-50 text-[#224B85]' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                        {canManageOrders && (
                          <button
                            onClick={() => openEditOrder(o)}
                            className="p-1.5 rounded bg-white border border-[#D6BCA5] text-[#3B281A] hover:bg-[#F8F4EC] cursor-pointer align-middle"
                            title="Sửa đơn hàng (điểm lấy hàng, sản phẩm, km, 3PL, KTV)"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManageOrders && (
                          <button
                            onClick={() => deleteOrder(o)}
                            className="p-1.5 rounded bg-red-50 border border-red-200 text-[#9A2B26] hover:bg-red-100 cursor-pointer align-middle"
                            title="Xóa đơn hàng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManageOrders && (
                          <button
                            onClick={() => genXk(o)}
                            className="px-2 py-1 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[#3B281A] hover:bg-[#efe6d8] text-[11px] font-semibold cursor-pointer align-middle"
                            title="Tạo phiếu xuất kho Toàn Nhất 9005"
                          >
                            <FileOutput className="w-3 h-3 inline mr-0.5" /> XK 9005
                          </button>
                        )}
                        {o.handovers?.length > 0 ? (
                          <button
                            onClick={() => openOrCreateHandoverForOrder(o)}
                            className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer align-middle ${
                              o.handovers[0].status === 'Completed'
                                ? 'bg-emerald-50 border border-[#234E36] text-[#234E36] hover:bg-emerald-100'
                                : 'bg-amber-50 border border-amber-400 text-amber-900 hover:bg-amber-100'
                            }`}
                            title="Mở biên bản đã tạo"
                          >
                            {o.handovers[0].status === 'Completed' ? '✓ ' : ''}{o.handovers[0].doc_no}
                          </button>
                        ) : canHandover ? (
                          <button
                            onClick={() => genHandover(o, o.require_install ? 'BM-01' : 'BM-05')}
                            className="px-2 py-1 rounded bg-[#234E36] text-white hover:bg-[#1b3d2a] text-[11px] font-semibold cursor-pointer align-middle"
                          >
                            + {o.require_install ? 'BM-01' : 'BM-05'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#6e5543]">Chưa có BB</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {orders.length < totalOrders && (
              <div className="p-3 bg-[#FAF7F2] border-t border-[#E6DDD1] flex items-center justify-between text-xs">
                <span className="text-[#6e5543]">Đang hiển thị <strong>{orders.length}</strong> / {totalOrders} đơn hàng</span>
                <button
                  disabled={loadingMoreOrders}
                  onClick={() => loadOrders(orders.length, true)}
                  className="px-4 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold hover:bg-[#563C28] cursor-pointer disabled:opacity-60"
                >
                  {loadingMoreOrders ? 'Đang tải...' : `Tải thêm ${Math.min(ORDER_PAGE_SIZE, totalOrders - orders.length)} đơn cũ`}
                </button>
              </div>
            )}
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
                <div className="text-xs text-[#6e5543]">
                  {h.customer_phone} •{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate?.('delivery3pl', { open3plSlipNo: h.invoice_no })}
                    className="font-mono text-[#224B85] hover:underline cursor-pointer"
                    title="Xem chi tiết POS & 3PL"
                  >
                    ĐH {h.invoice_no}
                  </button>
                </div>
                <div className="text-xs text-[#6e5543] mt-1 line-clamp-2">{h.address}</div>
                <div className="text-[11px] text-[#3B281A] mt-2 leading-snug">
                  <strong>KTV ({h.ktvs?.length || 0}):</strong> {formatKtvList(h)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  {h.has_signature ? <span className="text-[#234E36] font-semibold">✓ Đã ký</span> : null}
                  {h.has_photos ? <span className="text-[#224B85] font-semibold">📷 Có ảnh</span> : null}
                  {h.csat_rating > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                      <Star className="w-3.5 h-3.5 fill-amber-500" /> {h.csat_rating}/5
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-[#EFE7DC]">
                <button
                  onClick={() => { ensureStaffLoaded(); setActiveHandover(h); }}
                  className="flex-1 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> {!canHandover ? 'Xem chi tiết' : h.status === 'Completed' ? 'Xem / Sửa biên bản' : 'Mở ký hiện trường'}
                </button>
                <button
                  onClick={() => printHandover(h)}
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

      {/* Handover Mobile Modal (lazy-loaded on-demand) */}
      {activeHandover && (
        <Suspense fallback={null}>
          <HandoverModal
            handover={activeHandover}
            staffList={staff}
            readOnly={!canHandover}
            onStaffAdded={s => setStaff(prev => [...prev.filter(x => x.emp_code !== s.emp_code), s])}
            onClose={() => setActiveHandover(null)}
            onSaved={() => { onToast('Đã lưu biên bản & tự động đồng bộ KTV + trạng thái đơn hàng!'); loadData(); }}
            onPrint={h => onPrint({ type: 'HANDOVER', data: h })}
          />
        </Suspense>
      )}

      {/* Merge Orders Modal (lazy-loaded on-demand) */}
      {showMergeOrders && (
        <Suspense fallback={null}>
          <MergeModal
            mode="orders"
            rows={orders}
            onClose={() => setShowMergeOrders(false)}
            onMerged={() => loadData()}
            onToast={onToast}
          />
        </Suspense>
      )}

      {/* Edit Order Modal (TASK-07) */}
      {editingOrder && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
          <form onSubmit={submitEditOrder} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
              <div className="font-bold text-sm">Cập Nhật Đơn Hàng • {editingOrder.invoice_no}</div>
              <button type="button" onClick={() => setEditingOrder(null)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Merged child orders banner + 1-click Unmerge */}
              {Array.isArray(editingOrder.merged_children) && editingOrder.merged_children.length > 0 && (
                <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200 space-y-2">
                  <div className="font-bold text-purple-950 flex items-center gap-1.5">
                    <GitMerge className="w-3.5 h-3.5 text-purple-700" />
                    Các đơn phụ đã gộp vào ĐH {editingOrder.invoice_no} ({editingOrder.merged_children.length} đơn)
                  </div>
                  <div className="space-y-1.5">
                    {editingOrder.merged_children.map((ch: any) => (
                      <div key={ch.id} className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-purple-200/80">
                        <div>
                          <span className="font-mono font-bold text-purple-950">{ch.invoice_no}</span>
                          <span className="ml-2 text-[#6e5543]">
                            {ch.customer_name} • Phí KH: {fmtVnd(ch.customer_paid_fee)}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={unmergingOrderId === ch.id}
                          onClick={() => unmergeChildOrder(ch.id, ch.invoice_no)}
                          className="px-2 py-1 rounded bg-purple-100 text-purple-900 font-semibold text-[11px] hover:bg-purple-200 cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Unlink className="w-3 h-3" /> {unmergingOrderId === ch.id ? 'Đang tách...' : 'Tách đơn'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable Products + Per-Item Pickup Warehouse (9005 / 3001 / 1001) + Moving No */}
              <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#D6BCA5] space-y-2">
                <div className="font-bold text-[#3B281A]">Sản phẩm & Điểm lấy hàng theo từng món ({editingOrder.items?.length || 0} dòng)</div>
                <div className="relative">
                  <input
                    value={editSkuSearch}
                    onChange={e => searchEditSku(e.target.value)}
                    placeholder="+ Gõ tên hoặc Barcode để thêm sản phẩm vào đơn..."
                    className="w-full px-3 py-1.5 border border-[#D6BCA5] rounded-lg bg-white"
                  />
                  {editSkuResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D6BCA5] rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {editSkuResults.map(p => (
                        <button
                          type="button"
                          key={p.barcode}
                          onClick={() => addSkuToEditOrder(p)}
                          className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] flex justify-between items-center border-b border-[#F0E9DF] cursor-pointer"
                        >
                          <div>
                            <div className="font-semibold text-[#3B281A]">{p.name_vn}</div>
                            <div className="font-mono text-[10px] text-[#6e5543]">
                              {p.barcode} • Tồn: <strong className="text-[#224B85]">9005:{p.stock_9005 ?? 0}</strong> | <strong className="text-[#3B281A]">3001:{p.stock_3001 ?? 0}</strong> | <strong className="text-[#234E36]">1001:{p.stock_1001 ?? 0}</strong>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-[#234E36]">+ Thêm</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {(editingOrder.items || []).map((it: any, idx: number) => (
                  <div key={idx} className="flex flex-wrap items-center justify-between gap-2 bg-white px-2.5 py-2 rounded-lg border border-[#E6DDD1]">
                    <div className="min-w-[160px] flex-1">
                      <span className="font-semibold text-[#3B281A]">{it.product_name}</span>
                      {it.orig_invoice && it.orig_invoice !== editingOrder.invoice_no && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-800 font-mono text-[9px] font-bold">
                          Bill {it.orig_invoice}
                        </span>
                      )}
                      {it.net_weight_g >= 25000 && <span className="ml-1 px-1 py-0.5 rounded bg-red-100 text-[#9A2B26] text-[9px] font-bold">≥25kg</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={it.source_warehouse || '9005'}
                        onChange={e => {
                          const arr = [...editingOrder.items];
                          arr[idx] = { ...arr[idx], source_warehouse: e.target.value };
                          setEditingOrder({ ...editingOrder, items: arr });
                        }}
                        title="Điểm lấy hàng cho sản phẩm này"
                        className="px-2 py-1 border border-[#D6BCA5] rounded bg-[#FAF7F2] font-mono text-[11px] font-bold text-[#3B281A]"
                      >
                        <option value="9005">Kho 9005</option>
                        <option value="3001">Store 3001</option>
                        <option value="1001">Pop-up 1001</option>
                      </select>
                      <input
                        value={it.moving_no || ''}
                        onChange={e => {
                          const arr = [...editingOrder.items];
                          arr[idx] = { ...arr[idx], moving_no: e.target.value };
                          setEditingOrder({ ...editingOrder, items: arr });
                        }}
                        placeholder="Mã moving"
                        className="w-20 px-2 py-1 border border-[#D6BCA5] rounded font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={e => {
                          const arr = [...editingOrder.items];
                          arr[idx] = { ...arr[idx], qty: Number(e.target.value) || 1 };
                          setEditingOrder({ ...editingOrder, items: arr });
                        }}
                        className="w-12 px-1.5 py-1 border border-[#D6BCA5] rounded text-center"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingOrder({ ...editingOrder, items: editingOrder.items.filter((_: any, i: number) => i !== idx) })}
                        className="text-[#9A2B26] hover:bg-red-50 p-1 rounded cursor-pointer"
                        title="Bỏ sản phẩm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {editingOrder.require_install && editingOrder.requires_two_ktv && editingOrder.status !== 'Cancelled' && (
                <div className="p-3 rounded-lg bg-red-50 border border-[#9A2B26] text-[#9A2B26] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span><strong>Khóa an toàn benom (≥ 25 kg):</strong> Bắt buộc chọn tối thiểu 2 KTV khi đơn có lắp đặt!</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Trạng thái đơn</label>
                  <select value={editingOrder.status} onChange={e => setEditingOrder({ ...editingOrder, status: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold">
                    <option value="New">New (Mới tạo)</option>
                    <option value="In Transit">In Transit (Đang giao)</option>
                    <option value="Done">Done (Hoàn tất)</option>
                    <option value="Cancelled">Cancelled (Hủy đơn)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Ngày giao thực tế / dự kiến</label>
                  <input type="date" value={editingOrder.delivery_date || ''} onChange={e => setEditingOrder({ ...editingOrder, delivery_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Kho xuất</label>
                  <select value={editingOrder.source_warehouse || '9005'} onChange={e => setEditingOrder({ ...editingOrder, source_warehouse: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="9005">9005 — Kho Toàn Nhất</option>
                    <option value="3001">3001 — Store Lê Thánh Tôn</option>
                    <option value="1001">1001 — Pop-up Aeon Bình Tân</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Khách hàng</label>
                  <input value={editingOrder.customer_name || ''} onChange={e => setEditingOrder({ ...editingOrder, customer_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Số điện thoại</label>
                  <input value={editingOrder.customer_phone || ''} onChange={e => setEditingOrder({ ...editingOrder, customer_phone: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Khu vực</label>
                  <input value={editingOrder.region || 'HCM'} onChange={e => setEditingOrder({ ...editingOrder, region: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="sm:col-span-3">
                  <label className="font-semibold text-[#6e5543]">Địa chỉ giao hàng</label>
                  <input value={editingOrder.address || ''} onChange={e => setEditingOrder({ ...editingOrder, address: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị 3PL</label>
                  <select value={editingOrder.carrier || ''} onChange={e => setEditingOrder({ ...editingOrder, carrier: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="">— Chọn 3PL —</option>
                    {CARRIER_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Mã vận đơn (AWB)</label>
                  <input value={editingOrder.tracking_no || ''} onChange={e => setEditingOrder({ ...editingOrder, tracking_no: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Quãng đường thực tế (km)</label>
                  <input type="number" step="0.5" min={0} value={editingOrder.distance_km || 0} onChange={e => setEditingOrder({ ...editingOrder, distance_km: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Phí 3PL thực chi (đ)</label>
                  <input type="number" min={0} value={editingOrder.shipping_fee_3pl || 0} onChange={e => setEditingOrder({ ...editingOrder, shipping_fee_3pl: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Phí khách thanh toán (đ)</label>
                  <input type="number" min={0} value={editingOrder.customer_paid_fee || 0} onChange={e => setEditingOrder({ ...editingOrder, customer_paid_fee: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Trạng thái lắp đặt</label>
                  <input value={editingOrder.install_status || ''} onChange={e => setEditingOrder({ ...editingOrder, install_status: e.target.value })} placeholder="VD: Đã lắp & Nghiệm thu" className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingOrder.require_install}
                    onChange={e => {
                      const checked = e.target.checked;
                      setEditingOrder({ ...editingOrder, require_install: checked, ktvs: checked ? (editingOrder.ktvs || []) : [] });
                    }}
                    className="accent-[#3B281A]"
                  />
                  <span>Cần KTV benom lắp đặt</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editingOrder.is_stairs} onChange={e => setEditingOrder({ ...editingOrder, is_stairs: e.target.checked })} className="accent-[#3B281A]" />
                  <span>Khiêng thang bộ (K_Floor = 1.2)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editingOrder.is_promo_free_ship} onChange={e => setEditingOrder({ ...editingOrder, is_promo_free_ship: e.target.checked })} className="accent-[#3B281A]" />
                  <span>Đơn Freeship khuyến mãi</span>
                </label>
              </div>

              <KtvListPicker
                staff={staff}
                value={editingOrder.require_install ? (editingOrder.ktvs || []) : []}
                disabled={!editingOrder.require_install}
                disabledReason="Sản phẩm không cần lắp đặt / KH tự lắp đặt (không tích 'Cần KTV benom lắp đặt') — Không cần gán Kỹ thuật viên."
                onChange={ktvs => setEditingOrder({ ...editingOrder, ktvs })}
                onStaffAdded={s => setStaff(prev => [...prev.filter(x => x.emp_code !== s.emp_code), s])}
                label={`Phân công Kỹ thuật viên ${editingOrder.requires_two_ktv ? '(Tối thiểu 2 KTV)' : ''}`}
              />

              <div>
                <label className="font-semibold text-[#6e5543]">Ghi chú vận hành</label>
                <input value={editingOrder.notes || ''} onChange={e => setEditingOrder({ ...editingOrder, notes: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setEditingOrder(null)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button disabled={savingEdit} type="submit" className="px-5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60">
                {savingEdit ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
            </div>
          </form>
        </div>
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
                <div className="relative">
                  <label className="font-semibold text-[#6e5543]">Mã hóa đơn POS (Auto-fill) *</label>
                  <input
                    required
                    value={newOrder.invoice_no}
                    onChange={e => searchPosForOrder(e.target.value)}
                    placeholder="Gõ No Slip. POS (3001...)"
                    className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono"
                  />
                  {posMatches.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 sm:w-80 mt-1 bg-white border border-[#3B281A] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {posMatches.map(p => (
                        <button
                          type="button"
                          key={p.slip_no}
                          onClick={() => applyPosSlipToNewOrder(p)}
                          className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] border-b border-[#F0E9DF] cursor-pointer"
                        >
                          <div className="flex justify-between">
                            <span className="font-mono font-bold text-[#3B281A]">{p.slip_no}</span>
                            <span className="text-[10px] text-[#224B85] font-semibold">{p.sales_day}</span>
                          </div>
                          <div className="text-[10px] text-[#6e5543] truncate">{p.items_summary || 'Hóa đơn POS'}</div>
                        </button>
                      ))}
                    </div>
                  )}
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

              {posHintSummary && (
                <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[#224B85] text-[11px]">
                  <strong>Gợi ý từ hóa đơn POS:</strong> {posHintSummary}
                </div>
              )}

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
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D6BCA5] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {skuResults.map(p => (
                        <button
                          type="button"
                          key={p.barcode}
                          onClick={() => addSkuToOrder(p)}
                          className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] flex justify-between items-center border-b border-[#F0E9DF] cursor-pointer"
                        >
                          <div>
                            <div className="font-semibold text-[#3B281A]">{p.name_vn}</div>
                            <div className="font-mono text-[10px] text-[#6e5543]">
                              {p.barcode} • {(p.net_weight_g / 1000).toFixed(1)}kg • Tồn: <strong className="text-[#224B85]">9005:{p.stock_9005 ?? 0}</strong> | <strong className="text-[#3B281A]">3001:{p.stock_3001 ?? 0}</strong> | <strong className="text-[#234E36]">1001:{p.stock_1001 ?? 0}</strong>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-[#234E36] shrink-0 ml-2">+ Thêm</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {newOrder.items.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {newOrder.items.map((it: any, i: number) => (
                      <div key={i} className="flex flex-wrap items-center justify-between gap-2 bg-white px-2.5 py-2 rounded-lg border border-[#E6DDD1]">
                        <div className="min-w-[160px] flex-1">
                          <span className="font-semibold text-[#3B281A]">{it.product_name}</span>
                          {it.net_weight_g >= 25000 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-[#9A2B26] text-[10px] font-bold">≥ 25kg</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={it.source_warehouse || newOrder.source_warehouse || '9005'}
                            onChange={e => {
                              const arr = [...newOrder.items];
                              arr[i] = { ...arr[i], source_warehouse: e.target.value };
                              setNewOrder({ ...newOrder, items: arr });
                            }}
                            title="Điểm lấy hàng cho sản phẩm này"
                            className="px-2 py-1 border border-[#D6BCA5] rounded bg-[#FAF7F2] font-mono text-[11px] font-bold text-[#3B281A]"
                          >
                            <option value="9005">Kho 9005</option>
                            <option value="3001">Store 3001</option>
                            <option value="1001">Pop-up 1001</option>
                          </select>
                          <input
                            value={it.moving_no || ''}
                            onChange={e => {
                              const arr = [...newOrder.items];
                              arr[i] = { ...arr[i], moving_no: e.target.value };
                              setNewOrder({ ...newOrder, items: arr });
                            }}
                            placeholder="Mã moving"
                            className="w-20 px-2 py-1 border border-[#D6BCA5] rounded font-mono text-[11px]"
                          />
                          <input
                            type="number" min={1} value={it.qty}
                            onChange={e => {
                              const arr = [...newOrder.items];
                              arr[i] = { ...arr[i], qty: Number(e.target.value) || 1 };
                              setNewOrder({ ...newOrder, items: arr });
                            }}
                            className="w-12 px-1.5 py-1 border border-[#D6BCA5] rounded text-center"
                          />
                          <button type="button" onClick={() => setNewOrder({ ...newOrder, items: newOrder.items.filter((_: any, idx: number) => idx !== i) })} className="text-[#9A2B26] p-1 hover:bg-red-50 rounded cursor-pointer">
                            <X className="w-3.5 h-3.5" />
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị vận chuyển</label>
                  <select value={newOrder.carrier} onChange={e => setNewOrder({ ...newOrder, carrier: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    {CARRIER_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Phí 3PL thực chi (đ)</label>
                  <input type="number" min={0} value={newOrder.shipping_fee_3pl} onChange={e => setNewOrder({ ...newOrder, shipping_fee_3pl: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Phí khách thanh toán (đ)</label>
                  <input type="number" min={0} value={newOrder.customer_paid_fee} onChange={e => setNewOrder({ ...newOrder, customer_paid_fee: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newOrder.require_install}
                    onChange={e => {
                      const checked = e.target.checked;
                      setNewOrder({ ...newOrder, require_install: checked, ktvs: checked ? (newOrder.ktvs || []) : [] });
                    }}
                    className="accent-[#3B281A]"
                  />
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

              <KtvListPicker
                staff={staff}
                value={newOrder.require_install ? (newOrder.ktvs || []) : []}
                disabled={!newOrder.require_install}
                disabledReason="Sản phẩm không cần lắp đặt / KH tự lắp đặt (không tích 'Cần KTV benom lắp đặt') — Không cần gán Kỹ thuật viên."
                onChange={ktvs => setNewOrder({ ...newOrder, ktvs })}
                onStaffAdded={s => setStaff(prev => [...prev.filter(x => x.emp_code !== s.emp_code), s])}
                label={`Phân công Kỹ thuật viên ${requiresTwoKtv ? '(Tối thiểu 2 KTV)' : ''}`}
              />
            </div>

            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewOrder(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button disabled={savingNew} type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold hover:bg-[#563C28] cursor-pointer disabled:opacity-60">
                {savingNew ? 'Đang lưu...' : 'Lưu đơn hàng'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
