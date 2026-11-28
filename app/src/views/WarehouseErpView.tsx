import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, Ban, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet,
  Plus, Printer, UploadCloud, Warehouse, X
} from 'lucide-react';
import { apiDownload, apiGet, apiGetPage, apiSend, apiUpload, AuthUser, NavIntent, PrintDoc } from '../api';

const SparePartsPanel = lazy(() => import('../components/SparePartsPanel'));
const PurchaseOrdersPanel = lazy(() => import('../components/PurchaseOrdersPanel'));
const SLIP_PAGE_SIZE = 40;

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
  onNavigate?: (tab: string, intent?: NavIntent) => void;
  navIntent?: NavIntent | null;
  onConsumeIntent?: () => void;
}

export default function WarehouseErpView({ user, onToast, onPrint, onNavigate, navIntent, onConsumeIntent }: Props) {
  const canEditSlips = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canUploadErp = user.role === 'ADMIN';

  const [subTab, setSubTabState] = useState<'slips' | 'po' | 'erp' | 'reconcile' | 'spare_parts'>(() => {
    const s = localStorage.getItem('benom_wh_subtab');
    return s === 'po' || s === 'erp' || s === 'reconcile' || s === 'spare_parts' ? s : 'slips';
  });
  const setSubTab = (v: 'slips' | 'po' | 'erp' | 'reconcile' | 'spare_parts') => {
    setSubTabState(v);
    localStorage.setItem('benom_wh_subtab', v);
  };
  const [pendingPoPrefill, setPendingPoPrefill] = useState<any>(null);
  const [pendingOpenPoId, setPendingOpenPoId] = useState<number | null>(null);
  const [slips, setSlips] = useState<any[]>([]);
  const [totalSlips, setTotalSlips] = useState(0);
  const [loadingMoreSlips, setLoadingMoreSlips] = useState(false);
  const [slipFilter, setSlipFilter] = useState('');
  const [showNewSlip, setShowNewSlip] = useState(false);

  // New Slip Form + SKU Autocomplete with 9005 stock (TASK-09)
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [newSlip, setNewSlip] = useState<any>({
    slip_type: 'XK',
    expected_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    expected_time: '09:00',
    warehouse_code: '9005',
    partner_name: 'Toàn Nhất Logistics',
    carrier: 'Ahamove',
    purpose: 'Giao khách',
    ref_invoice: '',
    notes: '',
    items: [] as any[],
  });

  // Actual Qty / Status Update Modal (TASK-09)
  const [completingSlip, setCompletingSlip] = useState<any>(null);
  const [savingActual, setSavingActual] = useState(false);

  // ERP Upload State
  const [erpUploading, setErpUploading] = useState(false);
  const [erpResult, setErpResult] = useState<any>(null);

  // Reconcile State
  const [recUploading, setRecUploading] = useState(false);
  const [recExporting, setRecExporting] = useState(false);
  const [recData, setRecData] = useState<any>(null);
  const [onlyDiff, setOnlyDiff] = useState(true);

  const loadSlips = async (offset = 0, append = false) => {
    if (append) setLoadingMoreSlips(true);
    try {
      const { data, total } = await apiGetPage(`/api/slips?type=${encodeURIComponent(slipFilter)}&limit=${SLIP_PAGE_SIZE}&offset=${offset}`);
      setSlips(prev => (append ? [...prev, ...data] : data));
      setTotalSlips(total);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      if (append) setLoadingMoreSlips(false);
    }
  };

  // On-demand: only fetch slips when user is actually on the 'slips' sub-tab
  useEffect(() => {
    if (subTab === 'slips') loadSlips(0, false);
  }, [subTab, slipFilter]);

  // Cross-module deep-link consumer: immediately opens Warehouse Slip popup (XK/NK) or PO tab/prefill
  useEffect(() => {
    if (!navIntent?.nonce) return;
    const intent = navIntent;
    onConsumeIntent?.();
    if (intent.subTab === 'po' || intent.openPoId || intent.prefillNewPo) {
      setSubTab('po');
      if (intent.prefillNewPo) setPendingPoPrefill(intent.prefillNewPo);
      if (intent.openPoId) setPendingOpenPoId(intent.openPoId);
      return;
    }
    if (intent.subTab === 'slips' || intent.openSlipId || intent.openSlipNo) {
      setSubTab('slips');
    }
    (async () => {
      try {
        if (intent.openSlipId) {
          const full = await apiGet(`/api/slips/${intent.openSlipId}`);
          openCompleteSlip(full);
        } else if (intent.openSlipNo) {
          const full = await apiGet(`/api/slips/by-no/${encodeURIComponent(intent.openSlipNo)}`);
          openCompleteSlip(full);
        }
      } catch (e: any) {
        onToast(e.message, 'err');
      }
    })();
  }, [navIntent?.nonce]);

  const searchSkuWithStock = async (val: string) => {
    setSkuSearch(val);
    if (val.trim().length < 2) { setSkuResults([]); return; }
    try {
      const res = await apiGet(`/api/master/products?q=${encodeURIComponent(val.trim())}&include_stock_9005=1`);
      setSkuResults(res.slice(0, 8));
    } catch { /* ignore */ }
  };

  const addSkuToSlip = (p: any) => {
    setNewSlip((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          barcode: p.barcode,
          product_name: p.name_vn,
          unit: p.unit || 'Thùng',
          qty: 1,
          stock_9005: Number(p.stock_9005 || 0),
        },
      ],
    }));
    setSkuSearch('');
    setSkuResults([]);
  };

  const submitNewSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = (newSlip.items || []).filter((it: any) => it.barcode || it.product_name);
    if (validItems.length === 0) {
      onToast('Vui lòng chọn ít nhất 1 sản phẩm cho phiếu NK/XK!', 'err');
      return;
    }
    try {
      const res = await apiSend('/api/slips', 'POST', { ...newSlip, items: validItems });
      onToast(`Đã tạo phiếu ${res.slip_no}${res.cutoff_warning ? ' (Có cảnh báo Cut-off)' : ''}`);
      setShowNewSlip(false);
      setNewSlip({ ...newSlip, ref_invoice: '', notes: '', items: [] });
      loadSlips();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const openCompleteSlip = (s: any) => {
    setCompletingSlip({
      ...s,
      nextStatus: s.status === 'Draft' ? 'Sent' : 'Completed',
      editNotes: s.notes || '',
      editItems: (s.items || []).map((it: any) => ({
        ...it,
        actual_qty: it.actual_qty !== null && it.actual_qty !== undefined ? it.actual_qty : it.qty,
        note: it.note || '',
      })),
    });
  };

  const saveCompleteSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingSlip) return;
    setSavingActual(true);
    try {
      await apiSend(`/api/slips/${completingSlip.id}/status`, 'PUT', {
        status: completingSlip.nextStatus,
        notes: completingSlip.editNotes,
        items: completingSlip.editItems.map((it: any) => ({
          id: it.id,
          actual_qty: Number(it.actual_qty),
          note: it.note,
        })),
      });
      onToast(`Đã cập nhật ${completingSlip.slip_no} → ${completingSlip.nextStatus} kèm số lượng thực tế!`);
      setCompletingSlip(null);
      loadSlips();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setSavingActual(false);
    }
  };

  const cancelSlip = async (s: any) => {
    const reason = prompt(`Nhập lý do hủy phiếu ${s.slip_no} (Lưu ý Đ5.3: hủy < 2h bị tính 50% phí xếp dỡ):`);
    if (reason === null) return;
    try {
      await apiSend(`/api/slips/${s.id}/status`, 'PUT', { status: 'Cancelled', cancel_reason: reason || 'Hủy lệnh' });
      onToast(`Đã chuyển phiếu ${s.slip_no} sang trạng thái Cancelled (giữ nguyên số thứ tự).`);
      loadSlips();
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const handleErpFile = async (file: File | undefined) => {
    if (!file) return;
    setErpUploading(true);
    try {
      const res = await apiUpload('/api/erp/upload', file);
      setErpResult(res);
      onToast(`Đã nạp ${res.imported_skus} SKU benom cho Store ${res.store_code} (${res.target_month})!`);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setErpUploading(false);
    }
  };

  const handleReconcileFile = async (file: File | undefined) => {
    if (!file) return;
    setRecUploading(true);
    try {
      const res = await apiUpload('/api/toannhat/reconcile', file);
      setRecData(res);
      onToast(`Đối soát xong ${res.total_skus} SKU: Khớp ${res.matched}, Lệch ${res.mismatched}`);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setRecUploading(false);
    }
  };

  const exportReconcileExcel = async () => {
    if (!recData) return;
    setRecExporting(true);
    try {
      await apiDownload(
        '/api/toannhat/reconcile/export',
        `Bien_Ban_Doi_Soat_Toan_Nhat_9005_${recData.erp_month || '2026'}.xlsx`,
        { erp_month: recData.erp_month, sheet_used: recData.sheet_used, comparison: recData.comparison }
      );
      onToast('Đã xuất Excel Biên bản Đối soát Toàn Nhất (HĐ 019-2026)!');
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setRecExporting(false);
    }
  };

  // Live Cut-off preview (Vietnam GMT+7, synced with backend)
  const cutoffPreview = (() => {
    const warns: string[] = [];
    const vnNow = new Date(Date.now() + 7 * 3600000);
    const vnHour = vnNow.getUTCHours();
    const todayIso = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}-${String(vnNow.getUTCDate()).padStart(2, '0')}`;
    const vnTomorrow = new Date(Date.now() + (7 + 24) * 3600000);
    const tomorrowIso = `${vnTomorrow.getUTCFullYear()}-${String(vnTomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(vnTomorrow.getUTCDate()).padStart(2, '0')}`;
    const expHour = parseInt(String(newSlip.expected_time || '').slice(0, 2), 10);

    if (newSlip.expected_date) {
      const m = newSlip.expected_date.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const dow = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() : -1;
      if (dow === 0) warns.push('Chủ nhật: phụ phí xếp dỡ 200%–250% + 100k/h giám sát (PLHĐ 01).');
      if (dow === 6 && !Number.isNaN(expHour) && expHour >= 13) warns.push('Chiều Thứ 7: phụ phí 150%–200% + 100k/h.');
      if (newSlip.expected_date === todayIso) {
        warns.push('Đơn gấp trong ngày (< 4h): phí xếp dỡ 200% (HĐ 019-2026).');
      } else if (newSlip.expected_date === tomorrowIso && vnHour >= 16 && vnHour < 18) {
        warns.push('Gửi lệnh 16h00–18h00 (GMT+7): Toàn Nhất giao chiều ngày N+1 (Đ5.2).');
      } else if (newSlip.expected_date === tomorrowIso && vnHour >= 18) {
        warns.push('Gửi sau 18h00 (GMT+7): tính sang chu kỳ ngày làm việc kế tiếp.');
      }
    }
    if (!Number.isNaN(expHour) && expHour >= 17) warns.push('Ngoài giờ 17h–21h: phí 150% + 100k/h giám sát.');
    return warns;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Kho 9005 Toàn Nhất, ERP Sidecar & Ngũ Kim KTV</h1>
          <p className="text-xs text-[#6e5543]">Quản lý Phiếu NK/XK (SKU tồn 9005, SL thực tế, Cut-off HĐ 019-2026), nạp ERP CSV, đối soát Toàn Nhất & Kho Ngũ Kim KTV.</p>
        </div>
        <div className="flex flex-wrap bg-[#EFE7DC] p-1 rounded-lg self-start gap-0.5 shrink-0">
          {[
            ['slips', 'Phiếu NK / XK'],
            ['po', 'Đơn Đặt Hàng (PO)'],
            ['erp', 'Nạp ERP CSV'],
            ['reconcile', 'Đối soát Toàn Nhất'],
            ['spare_parts', 'Kho Ngũ Kim (KTV)'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id as any)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer ${subTab === id ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: SLIPS */}
      {subTab === 'slips' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {[['', 'Tất cả'], ['NK', 'Nhập kho (NK)'], ['XK', 'Xuất kho (XK)']].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setSlipFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${slipFilter === val ? 'bg-[#3B281A] text-white border-[#3B281A]' : 'bg-white text-[#3B281A] border-[#D6BCA5]'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {canEditSlips && (
              <button
                onClick={() => setShowNewSlip(true)}
                className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Lập phiếu NK / XK
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">Số phiếu</th>
                    <th className="py-2.5 px-3">Ngày lập / Hẹn kho</th>
                    <th className="py-2.5 px-3">Mục đích & Đối tác</th>
                    <th className="py-2.5 px-3">Hàng hóa (YC / Thực tế)</th>
                    <th className="py-2.5 px-2 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {slips.map(s => (
                    <tr key={s.id} className={`hover:bg-[#FAF7F2] ${s.status === 'Cancelled' ? 'opacity-60' : ''}`}>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openCompleteSlip(s)}
                          className={`px-2 py-0.5 rounded font-bold text-[11px] font-mono cursor-pointer hover:opacity-80 inline-flex items-center gap-0.5 ${
                            s.slip_type === 'NK' ? 'bg-emerald-50 text-[#234E36]' : 'bg-blue-50 text-[#224B85]'
                          }`}
                          title="Mở chi tiết & kiểm đếm phiếu kho"
                        >
                          {s.slip_no} <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-[#3B281A]">{s.slip_date}</div>
                        {s.expected_date && <div className="text-[10px] text-[#6e5543]">Hẹn: {s.expected_date} {s.expected_time}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#3B281A]">{s.purpose}</div>
                        <div className="text-[11px] text-[#6e5543]">
                          {s.partner_name}
                          {s.ref_invoice ? (
                            <>
                              {' • '}
                              <button
                                type="button"
                                onClick={() => onNavigate?.('orders', { subTab: 'orders', openOrderInvoice: s.ref_invoice })}
                                className="font-mono font-semibold text-[#224B85] hover:underline cursor-pointer"
                                title={`Mở đơn hàng ${s.ref_invoice} bên Điều phối`}
                              >
                                ĐH {s.ref_invoice}
                              </button>
                            </>
                          ) : ''}
                        </div>
                        {s.cutoff_warning && (
                          <div className="mt-1 text-[10px] text-[#9A2B26] font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> {s.cutoff_warning}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[240px]">
                        {s.items?.slice(0, 2).map((it: any, i: number) => (
                          <div key={i} className="truncate">
                            • {it.product_name || it.barcode} (YC: {it.qty}
                            {it.actual_qty !== null && it.actual_qty !== undefined ? (
                              <span className={it.actual_qty !== it.qty ? ' text-[#9A2B26] font-bold' : ' text-[#234E36] font-semibold'}> / TT: {it.actual_qty}</span>
                            ) : ''})
                          </div>
                        ))}
                        {s.items?.length > 2 && <div className="text-[10px] text-[#6e5543]">+{s.items.length - 2} dòng khác</div>}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === 'Cancelled' ? 'bg-red-50 text-[#9A2B26]' :
                          s.status === 'Completed' || s.status === 'Confirmed' ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                        {canEditSlips && s.status !== 'Cancelled' && (
                          <button
                            onClick={() => openCompleteSlip(s)}
                            className="px-2 py-1 rounded bg-[#234E36] text-white hover:bg-[#1b3d2a] text-[11px] font-semibold cursor-pointer"
                            title="Cập nhật SL thực tế & Trạng thái phiếu"
                          >
                            <ClipboardCheck className="w-3 h-3 inline mr-0.5" /> Thực tế
                          </button>
                        )}
                        <button
                          onClick={() => onPrint({ type: 'SLIP', data: s })}
                          className="px-2 py-1 rounded border border-[#D6BCA5] text-[#3B281A] hover:bg-[#F8F4EC] text-[11px] font-semibold cursor-pointer"
                        >
                          <Printer className="w-3 h-3 inline mr-0.5" /> In PDF
                        </button>
                        {canEditSlips && s.status !== 'Cancelled' && (
                          <button
                            onClick={() => cancelSlip(s)}
                            className="px-2 py-1 rounded border border-red-200 text-[#9A2B26] hover:bg-red-50 text-[11px] cursor-pointer"
                            title="Hủy phiếu (không xóa số thứ tự)"
                          >
                            <Ban className="w-3 h-3 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {slips.length < totalSlips && (
              <div className="p-3 bg-[#FAF7F2] border-t border-[#E6DDD1] flex items-center justify-between text-xs">
                <span className="text-[#6e5543]">Đang hiển thị <strong>{slips.length}</strong> / {totalSlips} phiếu</span>
                <button
                  disabled={loadingMoreSlips}
                  onClick={() => loadSlips(slips.length, true)}
                  className="px-4 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold hover:bg-[#563C28] cursor-pointer disabled:opacity-60"
                >
                  {loadingMoreSlips ? 'Đang tải...' : `Tải thêm ${Math.min(SLIP_PAGE_SIZE, totalSlips - slips.length)} phiếu cũ`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PURCHASE ORDERS (PO) */}
      {subTab === 'po' && (
        <Suspense fallback={<div className="p-8 text-center text-xs text-[#6e5543] bg-white rounded-xl border border-[#E6DDD1]">Đang tải phân hệ Đơn Đặt Hàng (PO)...</div>}>
          <PurchaseOrdersPanel
            user={user}
            onToast={onToast}
            onPrint={onPrint}
            onNavigate={onNavigate}
            prefillPo={pendingPoPrefill}
            openPoId={pendingOpenPoId}
            onConsumedPrefill={() => {
              setPendingPoPrefill(null);
              setPendingOpenPoId(null);
            }}
          />
        </Suspense>
      )}

      {/* TAB 3: ERP CSV FILE-DROP SIDECAR */}
      {subTab === 'erp' && (
        <div className="bg-white rounded-2xl p-6 border border-[#E6DDD1] space-y-5">
          <div className="flex items-start gap-3">
            <Warehouse className="w-6 h-6 text-[#3B281A] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-[#3B281A]">Nạp File InventoryPLU CSV từ ERP Kohnan (Sidecar Mode)</h2>
              <p className="text-xs text-[#6e5543] mt-1">
                Kéo thả file CSV 69 cột tải từ ERP Kohnan (áp dụng cho cả Store <strong>3001</strong>, Kho <strong>9005</strong>, và Pop-up <strong>1001</strong>). Hệ thống tự động nhận diện tháng/kho, lọc sạch các mã không phải benom và cập nhật tức thì Dashboard & Diện tích kho 9005.
              </p>
            </div>
          </div>

          {canUploadErp ? (
            <label className="block border-2 border-dashed border-[#D6BCA5] rounded-2xl p-10 text-center bg-[#FAF7F2] hover:bg-[#F3ECE0] cursor-pointer transition-colors">
              <UploadCloud className="w-10 h-10 text-[#3B281A] mx-auto mb-2" />
              <div className="font-bold text-sm text-[#3B281A]">
                {erpUploading ? 'Đang xử lý & lọc SKU benom...' : 'Nhấn để chọn file InventoryPLU_*.csv'}
              </div>
              <div className="text-xs text-[#6e5543] mt-1">Hỗ trợ file dung lượng lớn (tối đa 150 MB — đọc stream chống tràn RAM)</div>
              <input type="file" accept=".csv" className="hidden" onChange={e => handleErpFile(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              Chỉ tài khoản <strong>Admin</strong> được phép nạp file <code>InventoryPLU_*.csv</code> ghi đè snapshot ERP. Liên hệ Operations Lead nếu cần cập nhật số liệu tháng mới.
            </div>
          )}

          {erpResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-[#234E36] text-[#234E36] text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <strong>Nạp thành công!</strong> Kho/Store: <strong>{erpResult.store_code}</strong> • Tháng: <strong>{erpResult.target_month}</strong> • Đã lưu <strong>{erpResult.imported_skus}</strong> SKU benom có phát sinh (từ {erpResult.total_raw_lines.toLocaleString()} dòng ERP gốc).
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TOAN NHAT 3-WAY RECONCILIATION */}
      {subTab === 'reconcile' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-[#E6DDD1] space-y-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-6 h-6 text-[#234E36] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-[#3B281A]">Đối Soát 3 Chiều: Báo Cáo Excel Toàn Nhất (BD02) vs ERP Kho 9005</h2>
                <p className="text-xs text-[#6e5543] mt-1">
                  Tải lên file <code>BÁO CÁO TỒN KHO CÔNG TY KOHNAN THÁNG ...xlsx</code> từ Toàn Nhất. Hệ thống tự động bóc tiền tố <code>BD02- </code> / <code>BD02- R</code> (hàng hư hỏng), so khớp với ERP 9005 và xuất Biên bản Excel gửi Toàn Nhất ký trong hạn 2 ngày làm việc (HĐ 019-2026).
                </p>
              </div>
            </div>

            {canEditSlips ? (
              <label className="block border-2 border-dashed border-[#D6BCA5] rounded-2xl p-8 text-center bg-[#FAF7F2] hover:bg-[#F3ECE0] cursor-pointer">
                <UploadCloud className="w-9 h-9 text-[#234E36] mx-auto mb-2" />
                <div className="font-bold text-sm text-[#3B281A]">
                  {recUploading ? 'Đang đối soát tồn kho 3 chiều...' : 'Chọn file Excel (.xlsx) Báo cáo tồn kho Toàn Nhất'}
                </div>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleReconcileFile(e.target.files?.[0])} />
              </label>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                Tính năng tải lên đối soát Excel Toàn Nhất chỉ dành cho vai trò <strong>Admin / Editor</strong>.
              </div>
            )}
          </div>

          {recData && (
            <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
              <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span>Sheet: <strong>{recData.sheet_used}</strong> (ERP {recData.erp_month})</span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-[#234E36] font-bold">Khớp: {recData.matched} SKU</span>
                  <span className="px-2.5 py-1 rounded-full bg-red-50 text-[#9A2B26] font-bold">Lệch: {recData.mismatched} SKU</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#3B281A] cursor-pointer">
                    <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="accent-[#9A2B26]" />
                    Chỉ hiện mã lệch
                  </label>
                  {canEditSlips && (
                    <button
                      disabled={recExporting}
                      onClick={exportReconcileExcel}
                      className="px-3 py-1.5 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" /> {recExporting ? 'Đang xuất...' : 'Xuất Biên bản Excel'}
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                      <th className="py-2.5 px-3">Barcode (Đã chuẩn hóa)</th>
                      <th className="py-2.5 px-3">Tên sản phẩm</th>
                      <th className="py-2.5 px-3 text-right">ERP 9005</th>
                      <th className="py-2.5 px-3 text-right">TN Hàng tốt</th>
                      <th className="py-2.5 px-3 text-right">TN Hư (R)</th>
                      <th className="py-2.5 px-3 text-right">Chênh lệch</th>
                      <th className="py-2.5 px-3 text-center">Kết luận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E9DF]">
                    {recData.comparison
                      .filter((r: any) => !onlyDiff || r.diff !== 0)
                      .map((r: any) => (
                        <tr key={r.barcode} className="hover:bg-[#FAF7F2]">
                          <td className="py-2 px-3 font-mono text-[11px]">{r.barcode}</td>
                          <td className="py-2 px-3 font-medium text-[#3B281A]">{r.product_name}</td>
                          <td className="py-2 px-3 text-right font-semibold">{r.erp_9005_qty}</td>
                          <td className="py-2 px-3 text-right">{r.toannhat_good_qty}</td>
                          <td className="py-2 px-3 text-right text-[#9A2B26]">{r.toannhat_damaged_qty || '—'}</td>
                          <td className={`py-2 px-3 text-right font-bold ${r.diff === 0 ? 'text-[#234E36]' : 'text-[#9A2B26]'}`}>
                            {r.diff > 0 ? `+${r.diff}` : r.diff}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.diff === 0 ? 'bg-emerald-50 text-[#234E36]' : 'bg-red-50 text-[#9A2B26]'}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SPARE PARTS / HARDWARE MINI WAREHOUSE (TASK-15, lazy-loaded) */}
      {subTab === 'spare_parts' && (
        <Suspense fallback={<div className="bg-white rounded-xl p-6 border border-[#E6DDD1] text-center text-xs text-[#6e5543]">Đang tải Kho Ngũ Kim KTV...</div>}>
          <SparePartsPanel user={user} onToast={onToast} />
        </Suspense>
      )}

      {/* Universal Warehouse Slip Detail & Actual Qty Popup Modal (TASK-09) */}
      {completingSlip && (() => {
        const readOnlySlip = !canEditSlips || completingSlip.status === 'Cancelled';
        return (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 overflow-y-auto" onClick={() => setCompletingSlip(null)}>
          <form onSubmit={saveCompleteSlip} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-[#D6BCA5] uppercase">
                  {completingSlip.slip_type === 'NK' ? 'Phiếu Nhập Kho Toàn Nhất (NK)' : 'Phiếu Xuất Kho Toàn Nhất (XK)'}
                </div>
                <div className="font-bold text-sm flex flex-wrap items-center gap-2">
                  <span>{completingSlip.slip_no}</span>
                  {completingSlip.ref_invoice && (
                    <button
                      type="button"
                      onClick={() => {
                        const inv = completingSlip.ref_invoice;
                        setCompletingSlip(null);
                        onNavigate?.('orders', { subTab: 'orders', openOrderInvoice: inv });
                      }}
                      className="px-2 py-0.5 rounded-full bg-white/15 text-[#F8F4EC] hover:bg-white/25 text-[11px] font-mono inline-flex items-center gap-1 cursor-pointer"
                      title="Mở đơn hàng tham chiếu bên Điều phối"
                    >
                      ĐH {completingSlip.ref_invoice} <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onPrint({ type: 'SLIP', data: completingSlip })}
                  className="px-2.5 py-1.5 rounded-lg bg-[#563C28] text-xs font-semibold hover:bg-[#6a4b33] cursor-pointer inline-flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" /> In PDF
                </button>
                <button type="button" onClick={() => setCompletingSlip(null)} className="p-1 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-5 space-y-3.5 text-xs max-h-[75vh] overflow-y-auto">
              <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1] grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-[#6e5543]">Mục đích:</span> <strong className="text-[#3B281A]">{completingSlip.purpose || '—'}</strong></div>
                <div><span className="text-[#6e5543]">Đối tác / ĐVVC:</span> <strong className="text-[#3B281A]">{completingSlip.partner_name}{completingSlip.carrier ? ` • ${completingSlip.carrier}` : ''}</strong></div>
                <div><span className="text-[#6e5543]">Ngày lập:</span> <strong className="text-[#3B281A]">{completingSlip.slip_date || '—'}</strong></div>
                <div><span className="text-[#6e5543]">Hẹn kho {completingSlip.warehouse_code || '9005'}:</span> <strong className="text-[#3B281A]">{completingSlip.expected_date || '—'} {completingSlip.expected_time || ''}</strong></div>
              </div>

              {completingSlip.cutoff_warning && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-[#9A2B26] text-[#9A2B26] text-[11px] flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{completingSlip.cutoff_warning}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Trạng thái phiếu</label>
                  <select
                    disabled={readOnlySlip}
                    value={readOnlySlip ? completingSlip.status : completingSlip.nextStatus}
                    onChange={e => setCompletingSlip({ ...completingSlip, nextStatus: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold disabled:bg-gray-50"
                  >
                    <option value="Draft">Draft (Nháp)</option>
                    <option value="Sent">Sent (Đã gửi Toàn Nhất)</option>
                    <option value="Confirmed">Confirmed (Kho đã xác nhận)</option>
                    <option value="Completed">Completed (Hoàn tất xuất/nhập)</option>
                    <option value="Cancelled">Cancelled (Đã hủy)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Ghi chú biên bản</label>
                  <input
                    disabled={readOnlySlip}
                    value={completingSlip.editNotes}
                    onChange={e => setCompletingSlip({ ...completingSlip, editNotes: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg disabled:bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#3B281A]">Kiểm đếm số lượng thực tế tại Kho {completingSlip.warehouse_code || '9005'}</div>
                {completingSlip.editItems.map((it: any, idx: number) => {
                  const diff = Number(it.actual_qty) - Number(it.qty);
                  return (
                    <div key={it.id || idx} className="p-2.5 rounded-lg bg-[#FAF7F2] border border-[#E6DDD1] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#3B281A]">{it.product_name || it.barcode}</div>
                          <div className="font-mono text-[10px] text-[#6e5543]">{it.barcode} • SL yêu cầu: <strong>{it.qty}</strong> {it.unit}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[#6e5543]">Thực tế:</span>
                          <input
                            type="number"
                            min={0}
                            disabled={readOnlySlip}
                            value={it.actual_qty}
                            onChange={e => {
                              const arr = [...completingSlip.editItems];
                              arr[idx].actual_qty = Number(e.target.value);
                              setCompletingSlip({ ...completingSlip, editItems: arr });
                            }}
                            className={`w-16 px-2 py-1 rounded border text-center font-bold bg-white disabled:bg-gray-50 ${diff !== 0 ? 'border-[#9A2B26] text-[#9A2B26]' : 'border-[#234E36] text-[#234E36]'}`}
                          />
                        </div>
                      </div>
                      <input
                        disabled={readOnlySlip}
                        value={it.note}
                        onChange={e => {
                          const arr = [...completingSlip.editItems];
                          arr[idx].note = e.target.value;
                          setCompletingSlip({ ...completingSlip, editItems: arr });
                        }}
                        placeholder="Ghi chú chênh lệch / tình trạng thùng..."
                        className="w-full px-2.5 py-1 rounded border border-[#D6BCA5] bg-white text-[11px] disabled:bg-gray-50"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setCompletingSlip(null)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">
                {readOnlySlip ? 'Đóng' : 'Hủy'}
              </button>
              {!readOnlySlip && (
                <button disabled={savingActual} type="submit" className="px-5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60">
                  {savingActual ? 'Đang lưu...' : 'Lưu thực tế & Cập nhật'}
                </button>
              )}
            </div>
          </form>
        </div>
        );
      })()}

      {/* New Slip Modal (with SKU Autocomplete + 9005 stock) */}
      {showNewSlip && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
          <form onSubmit={submitNewSlip} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
              <div className="font-bold">Lập Phiếu Yêu Cầu Nhập / Xuất Kho 9005</div>
              <button type="button" onClick={() => setShowNewSlip(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Loại phiếu</label>
                  <select value={newSlip.slip_type} onChange={e => setNewSlip({ ...newSlip, slip_type: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="XK">Xuất kho (XK)</option>
                    <option value="NK">Nhập kho (NK)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Mục đích</label>
                  <input value={newSlip.purpose} onChange={e => setNewSlip({ ...newSlip, purpose: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Ngày hẹn kho</label>
                  <input type="date" value={newSlip.expected_date} onChange={e => setNewSlip({ ...newSlip, expected_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Giờ hẹn</label>
                  <input type="time" value={newSlip.expected_time} onChange={e => setNewSlip({ ...newSlip, expected_time: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Chứng từ tham chiếu (ĐH/PO)</label>
                  <input value={newSlip.ref_invoice} onChange={e => setNewSlip({ ...newSlip, ref_invoice: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị vận chuyển</label>
                  <input value={newSlip.carrier} onChange={e => setNewSlip({ ...newSlip, carrier: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>

              {cutoffPreview.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-[#9A2B26] text-[#9A2B26] space-y-1">
                  <div className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Cảnh báo Hợp đồng 019-2026 (Toàn Nhất):</div>
                  {cutoffPreview.map((w, i) => <div key={i}>• {w}</div>)}
                </div>
              )}

              {/* SKU Autocomplete with live 9005 stock */}
              <div className="bg-[#F8F4EC] p-3.5 rounded-xl border border-[#D6BCA5] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#3B281A]">Chọn hàng hóa từ Master Data (Hiện tồn ERP 9005)</span>
                  <button
                    type="button"
                    onClick={() => setNewSlip({ ...newSlip, items: [...newSlip.items, { barcode: '', product_name: '', unit: 'Thùng', qty: 1 }] })}
                    className="text-[#224B85] font-semibold hover:underline cursor-pointer"
                  >
                    + Nhập tay 1 dòng
                  </button>
                </div>
                <div className="relative">
                  <input
                    value={skuSearch}
                    onChange={e => searchSkuWithStock(e.target.value)}
                    placeholder="Gõ tên sản phẩm hoặc Barcode để thêm (VD: Noma, Kito, 893...)"
                    className="w-full px-3 py-2 border border-[#D6BCA5] rounded-lg bg-white"
                  />
                  {skuResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#3B281A] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {skuResults.map(p => (
                        <button
                          type="button"
                          key={p.barcode}
                          onClick={() => addSkuToSlip(p)}
                          className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] flex justify-between items-center border-b border-[#F0E9DF] cursor-pointer"
                        >
                          <div>
                            <div className="font-semibold text-[#3B281A]">{p.name_vn}</div>
                            <div className="font-mono text-[10px] text-[#6e5543]">{p.barcode} • {p.supplier_name || 'benom'}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${Number(p.stock_9005) > 0 ? 'bg-emerald-50 text-[#234E36]' : 'bg-red-50 text-[#9A2B26]'}`}>
                            Tồn 9005: {p.stock_9005 || 0}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {newSlip.items.length > 0 && (
                  <div className="space-y-1.5">
                    {newSlip.items.map((it: any, i: number) => {
                      const overStock = newSlip.slip_type === 'XK' && it.stock_9005 !== undefined && it.qty > it.stock_9005;
                      return (
                        <div key={i} className={`p-2 rounded-lg bg-white border space-y-1 ${overStock ? 'border-[#9A2B26]' : 'border-[#E6DDD1]'}`}>
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <input placeholder="Barcode" value={it.barcode} onChange={e => { const a = [...newSlip.items]; a[i].barcode = e.target.value; setNewSlip({ ...newSlip, items: a }); }} className="col-span-3 px-2 py-1 border border-[#D6BCA5] rounded font-mono text-[11px]" />
                            <input placeholder="Tên sản phẩm" value={it.product_name} onChange={e => { const a = [...newSlip.items]; a[i].product_name = e.target.value; setNewSlip({ ...newSlip, items: a }); }} className="col-span-5 px-2 py-1 border border-[#D6BCA5] rounded" />
                            <input placeholder="ĐVT" value={it.unit} onChange={e => { const a = [...newSlip.items]; a[i].unit = e.target.value; setNewSlip({ ...newSlip, items: a }); }} className="col-span-2 px-1.5 py-1 border border-[#D6BCA5] rounded text-center" />
                            <input type="number" min={1} value={it.qty} onChange={e => { const a = [...newSlip.items]; a[i].qty = Number(e.target.value) || 1; setNewSlip({ ...newSlip, items: a }); }} className="col-span-1 px-1 py-1 border border-[#D6BCA5] rounded text-center font-bold" />
                            <button type="button" onClick={() => setNewSlip({ ...newSlip, items: newSlip.items.filter((_: any, idx: number) => idx !== i) })} className="col-span-1 flex justify-center text-[#9A2B26] cursor-pointer">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          {overStock && (
                            <div className="text-[10px] text-[#9A2B26] font-semibold">
                              ⚠ Cảnh báo: Số lượng xuất ({it.qty}) vượt tồn ERP 9005 hiện tại ({it.stock_9005})!
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewSlip(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Tạo phiếu</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
