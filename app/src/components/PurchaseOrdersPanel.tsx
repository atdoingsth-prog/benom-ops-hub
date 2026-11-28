import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowUpRight, CheckCircle2, ClipboardCheck, Copy, Edit3, Factory, PackagePlus,
  Plus, Printer, Search, Trash2, Warehouse
} from 'lucide-react';
import { apiGet, apiSend, AuthUser, fmtNum, fmtVnd, NavIntent, PrintDoc } from '../api';
import type { PoPrefillPayload } from './PurchaseOrderFormModal';

const PurchaseOrderFormModal = lazy(() => import('./PurchaseOrderFormModal'));

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
  onNavigate?: (tab: string, intent?: NavIntent) => void;
  prefillPo?: PoPrefillPayload | null;
  openPoId?: number | null;
  onConsumedPrefill?: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800 border-gray-300',
  Sent: 'bg-blue-50 text-blue-900 border-blue-200',
  Confirmed: 'bg-indigo-50 text-indigo-900 border-indigo-200',
  Inspecting: 'bg-amber-50 text-amber-900 border-amber-300',
  Delivered: 'bg-teal-50 text-teal-900 border-teal-200',
  Completed: 'bg-emerald-50 text-[#234E36] border-emerald-200',
  Cancelled: 'bg-red-50 text-[#9A2B26] border-red-200',
};

export default function PurchaseOrdersPanel({
  user,
  onToast,
  onPrint,
  onNavigate,
  prefillPo,
  openPoId,
  onConsumedPrefill,
}: Props) {
  const canEdit = user.role === 'ADMIN' || user.role === 'EDITOR';
  const isAdmin = user.role === 'ADMIN';

  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FACTORY' | 'TRADING'>('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [formModal, setFormModal] = useState<{
    open: boolean;
    editingPoId?: number | null;
    prefill?: PoPrefillPayload | null;
  }>({ open: false });

  const loadPos = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(categoryFilter !== 'ALL' ? { po_category: categoryFilter } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        limit: String(limit),
        offset: '0',
      });
      setData(await apiGet(`/api/purchase-orders?${qs.toString()}`));
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPos();
  }, [categoryFilter, statusFilter, q, limit]);

  useEffect(() => {
    if (prefillPo) {
      setFormModal({ open: true, editingPoId: null, prefill: prefillPo });
      onConsumedPrefill?.();
    } else if (openPoId) {
      setFormModal({ open: true, editingPoId: openPoId, prefill: null });
      onConsumedPrefill?.();
    }
  }, [prefillPo, openPoId]);

  const togglePaymentFlag = async (po: any, field: 'deposit_paid' | 'balance_paid') => {
    try {
      const nextVal = po[field] ? 0 : 1;
      await apiSend(`/api/purchase-orders/${po.id}/status`, 'PUT', { [field]: nextVal });
      onToast(`Đã cập nhật trạng thái thanh toán ${po.po_no}!`);
      await loadPos();
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const changePoStatus = async (po: any, nextStatus: string) => {
    try {
      await apiSend(`/api/purchase-orders/${po.id}/status`, 'PUT', { status: nextStatus });
      onToast(`Đã chuyển ${po.po_no} → ${nextStatus}!`);
      await loadPos();
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const createNkFromPo = async (po: any) => {
    try {
      const res = await apiSend(`/api/purchase-orders/${po.id}/create-nk-slip`, 'POST', {});
      onToast(res.existed ? `Phiếu ${res.slip_no} đã tồn tại — Đang mở!` : `Đã tạo phiếu Nhập Kho ${res.slip_no} từ ${po.po_no}!`);
      await loadPos();
      if (res.slip_id && onNavigate) {
        onNavigate('warehouse', { subTab: 'slips', openSlipId: res.slip_id });
      }
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const deletePo = async (po: any) => {
    if (!confirm(`Xóa Đơn Đặt Hàng ${po.po_no}?`)) return;
    try {
      await apiSend(`/api/purchase-orders/${po.id}`, 'DELETE');
      onToast(`Đã xóa ${po.po_no}!`);
      await loadPos();
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const copyPoEmail = async (po: any) => {
    const mmYY = (po.po_date || new Date().toISOString().slice(0, 10)).slice(5, 7) + '/' + (po.po_date || new Date().toISOString().slice(0, 10)).slice(2, 4);
    const subj = `[${(po.supplier_name || 'NCC').toUpperCase()}-KOHNAN] PURCHASE ORDER ${mmYY} - ${po.po_no.replace(/^PO\s+/i, '')}`;
    const items: any[] = Array.isArray(po.items) ? po.items : [];
    const lines = [
      `Tiêu đề Email: ${subj}`,
      ...(po.vendor_contact ? [`Gửi tới: ${po.vendor_contact}`] : []),
      `--------------------------------`,
      `Dear Anh/Chị ${po.supplier_name},`,
      `Team benom (Công ty TNHH Kohnan Việt Nam) xin gửi Đơn Đặt Hàng ${po.po_no}${po.revision_no > 1 ? ` (Bản điều chỉnh Rev v${po.revision_no})` : ''} với thông tin dự kiến như sau:`,
      `• Ngày giao dự kiến: ${po.delivery_schedule || 'Theo thỏa thuận'}`,
      ...(po.final_inspection_date ? [`• Thời gian kiểm hàng (Final Inspection): ${po.final_inspection_date} (trước ngày giao 1–2 ngày)`] : []),
      `• Địa điểm giao: ${po.ship_to_address || `Kho ${po.ship_to_warehouse}`}`,
      `• Chi tiết sản phẩm:`,
      ...items.map((it, i) => `  ${i + 1}. ${it.barcode} — ${it.product_name}: ${it.qty} ${it.unit || 'Cái'} × ${fmtVnd(it.unit_price)}`),
      `• Tổng sau VAT (${po.vat_rate}%): ${fmtVnd(po.total_after_vat)}`,
      ``,
      `Nhờ Quý công ty xác nhận tiến độ sản xuất & giao hàng giúp team benom nhé ạ. Trân trọng!`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      onToast(`Đã copy mẫu Email đặt hàng cho ${po.po_no}!`);
    } catch {
      onToast('Không thể truy cập clipboard trình duyệt.', 'err');
    }
  };

  const summary = data?.summary || { total_pos: 0, active_pos: 0, inspecting_pos: 0, total_value_vnd: 0 };
  const rows: any[] = data?.items || [];
  const total = Number(data?.total || rows.length);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
          <div className="text-[11px] text-[#6e5543]">Tổng Đơn Đặt Hàng (PO)</div>
          <div className="text-2xl font-bold text-[#3B281A] mt-1">{fmtNum(summary.total_pos)} PO</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
          <div className="text-[11px] text-[#6e5543]">Đang triển khai (Mở)</div>
          <div className="text-2xl font-bold text-[#224B85] mt-1">{fmtNum(summary.active_pos)} PO</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
          <div className="text-[11px] text-[#6e5543]">Chờ Final Inspection</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{fmtNum(summary.inspecting_pos)} PO</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1]">
          <div className="text-[11px] text-[#6e5543]">Tổng giá trị PO (Sau VAT)</div>
          <div className="text-xl font-bold text-[#234E36] mt-1">{fmtVnd(summary.total_value_vnd)}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-[#EFE7DC] p-0.5 text-xs">
            {[
              ['ALL', 'Tất cả'],
              ['FACTORY', 'FACTORY (SX)'],
              ['TRADING', 'TRAFFIC / TRADING'],
            ].map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategoryFilter(id as any)}
                className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer ${categoryFilter === id ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs font-semibold text-[#3B281A]"
          >
            <option value="">Tất cả trạng thái</option>
            {['Draft', 'Sent', 'Confirmed', 'Inspecting', 'Delivered', 'Completed', 'Cancelled'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6e5543] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Tìm Mã PO / NCC / Hợp đồng..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs w-52 outline-none"
            />
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setFormModal({ open: true, editingPoId: null, prefill: null })}
            className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer self-start lg:self-auto"
          >
            <Plus className="w-4 h-4" /> Tạo Đơn Đặt Hàng (PO)
          </button>
        )}
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                <th className="py-2.5 px-3">Mã PO / Ngày</th>
                <th className="py-2.5 px-3">Nhà Cung Cấp & Hợp đồng</th>
                <th className="py-2.5 px-3">Giao hàng & Kiểm hàng</th>
                <th className="py-2.5 px-3">Hàng đặt & Nhập kho</th>
                <th className="py-2.5 px-3 text-right">Tổng sau VAT</th>
                <th className="py-2.5 px-2 text-center">Thanh toán</th>
                <th className="py-2.5 px-2 text-center">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E9DF]">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-[#6e5543]">Đang tải danh sách Đơn Đặt Hàng (PO)...</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#6e5543] space-y-2">
                    <PackagePlus className="w-7 h-7 mx-auto text-[#D6BCA5]" />
                    <div>Chưa có Đơn Đặt Hàng (PO) nào. Nhấn <strong>Tạo Đơn Đặt Hàng (PO)</strong> hoặc chọn từ bảng Tồn kho an toàn trên Dashboard.</div>
                  </td>
                </tr>
              ) : rows.map(po => (
                <tr key={po.id} className={`hover:bg-[#FAF7F2] ${po.status === 'Cancelled' ? 'opacity-60' : ''}`}>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#3B281A] bg-amber-100 px-2 py-0.5 rounded">{po.po_no}</span>
                      {Number(po.revision_no || 1) > 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-900">
                          Rev v{po.revision_no}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#6e5543] mt-0.5">{po.po_date}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        po.po_category === 'FACTORY' ? 'bg-purple-100 text-purple-900' : 'bg-blue-100 text-blue-900'
                      }`}>
                        {po.po_category === 'FACTORY' ? 'FACTORY' : 'TRAFFIC'}
                      </span>
                      <span className="font-bold text-[#3B281A]">{po.supplier_name}</span>
                    </div>
                    <div className="text-[10px] text-[#6e5543] mt-0.5">
                      {po.contract_no ? `HĐ: ${po.contract_no} • ` : ''}Kho nhận: <strong>{po.ship_to_warehouse}</strong>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[#3B281A]">{po.delivery_schedule || 'Chưa chốt lịch'}</div>
                    {po.final_inspection_date && (
                      <div className="text-[10px] text-amber-800 font-medium">Inspection: {po.final_inspection_date}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 max-w-[230px]">
                    {(po.items || []).slice(0, 2).map((it: any, idx: number) => (
                      <div key={idx} className="truncate">• {it.product_name} (<strong>×{it.qty}</strong>)</div>
                    ))}
                    {(po.items || []).length > 2 && <div className="text-[10px] text-[#6e5543]">+{(po.items || []).length - 2} dòng khác</div>}
                    {po.ref_nk_slip_no && (
                      <button
                        type="button"
                        onClick={() => onNavigate?.('warehouse', { subTab: 'slips', openSlipNo: po.ref_nk_slip_no })}
                        className="mt-1 px-1.5 py-0.5 rounded bg-emerald-50 text-[#234E36] border border-emerald-200 font-mono text-[10px] font-bold inline-flex items-center gap-0.5 hover:bg-emerald-100 cursor-pointer"
                      >
                        {po.ref_nk_slip_no} <ArrowUpRight className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="font-extrabold text-[#3B281A]">{fmtVnd(po.total_after_vat)}</div>
                    <div className="text-[10px] text-[#6e5543]">VAT {po.vat_rate}%</div>
                  </td>
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <div className="inline-flex flex-col gap-1">
                      {Number(po.deposit_amount || 0) > 0 && (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => togglePaymentFlag(po, 'deposit_paid')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                            po.deposit_paid ? 'bg-emerald-50 text-[#234E36] border-emerald-300' : 'bg-amber-50 text-amber-900 border-amber-200'
                          }`}
                          title="Bấm để đánh dấu đã/chưa thanh toán Đợt 1 (Cọc)"
                        >
                          Đ1 ({po.deposit_pct}%): {po.deposit_paid ? 'Đã TT ✓' : 'Chưa TT'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => togglePaymentFlag(po, 'balance_paid')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                          po.balance_paid ? 'bg-emerald-50 text-[#234E36] border-emerald-300' : 'bg-gray-50 text-gray-700 border-gray-300'
                        }`}
                        title="Bấm để đánh dấu đã/chưa tất toán Đợt 2"
                      >
                        {Number(po.deposit_amount || 0) > 0 ? `Đ2: ` : `TT: `}
                        {po.balance_paid ? 'Đã TT ✓' : 'Chưa TT'}
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {canEdit ? (
                      <select
                        value={po.status}
                        onChange={e => changePoStatus(po, e.target.value)}
                        className={`px-2 py-1 rounded-full border text-[10px] font-bold cursor-pointer ${STATUS_STYLE[po.status] || 'bg-gray-100'}`}
                      >
                        {['Draft', 'Sent', 'Confirmed', 'Inspecting', 'Delivered', 'Completed', 'Cancelled'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLE[po.status] || 'bg-gray-100'}`}>
                        {po.status}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      onClick={() => onPrint({ type: 'PO', data: po })}
                      className="px-2 py-1 rounded border border-[#D6BCA5] text-[#3B281A] hover:bg-[#F8F4EC] text-[11px] font-semibold cursor-pointer"
                      title="In PDF chuẩn biểu mẫu benom PO"
                    >
                      <Printer className="w-3 h-3 inline mr-0.5" /> In PO
                    </button>
                    <button
                      type="button"
                      onClick={() => copyPoEmail(po)}
                      className="px-2 py-1 rounded border border-blue-200 text-[#224B85] bg-blue-50 hover:bg-blue-100 text-[11px] font-semibold cursor-pointer"
                      title="Copy mẫu Email gửi NCC"
                    >
                      <Copy className="w-3 h-3 inline" />
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => setFormModal({ open: true, editingPoId: po.id, prefill: null })}
                          className="px-2 py-1 rounded border border-[#D6BCA5] text-[#3B281A] hover:bg-[#FAF7F2] text-[11px] font-semibold cursor-pointer"
                          title="Sửa / Tạo Revision"
                        >
                          <Edit3 className="w-3 h-3 inline" />
                        </button>
                        {!po.ref_nk_slip_no && po.status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => createNkFromPo(po)}
                            className="px-2 py-1 rounded bg-[#234E36] text-white hover:bg-[#1b3d2a] text-[11px] font-semibold cursor-pointer"
                            title="Tạo Phiếu Nhập Kho (NK) từ PO này"
                          >
                            <Warehouse className="w-3 h-3 inline mr-0.5" /> Tạo NK
                          </button>
                        )}
                      </>
                    )}
                    {isAdmin && (po.status === 'Draft' || po.status === 'Cancelled') && (
                      <button
                        type="button"
                        onClick={() => deletePo(po)}
                        className="px-1.5 py-1 rounded border border-red-200 text-[#9A2B26] hover:bg-red-50 text-[11px] cursor-pointer"
                        title="Xóa PO"
                      >
                        <Trash2 className="w-3 h-3 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length < total && (
          <div className="p-3 bg-[#FAF7F2] border-t border-[#E6DDD1] flex items-center justify-between text-xs">
            <span className="text-[#6e5543]">Đang hiển thị <strong>{rows.length}</strong> / {total} PO</span>
            <button
              type="button"
              onClick={() => setLimit(l => l + 40)}
              className="px-4 py-1.5 rounded-lg bg-[#3B281A] text-white font-semibold hover:bg-[#563C28] cursor-pointer"
            >
              Xem thêm
            </button>
          </div>
        )}
      </div>

      {/* Lazy PO Create / Edit Modal */}
      {formModal.open && (
        <Suspense fallback={null}>
          <PurchaseOrderFormModal
            editingPoId={formModal.editingPoId}
            prefill={formModal.prefill}
            onSaved={() => loadPos()}
            onClose={() => setFormModal({ open: false })}
            onToast={onToast}
          />
        </Suspense>
      )}
    </div>
  );
}
