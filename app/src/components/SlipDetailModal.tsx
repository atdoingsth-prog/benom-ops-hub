import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight, Check, ClipboardCheck, Edit3, FileText, GitMerge, MapPin, Package, Phone,
  ShieldAlert, Star, Truck, Unlink, User, Warehouse, Wrench, X
} from 'lucide-react';
import { apiGet, apiSend, fmtVnd, NavIntent } from '../api';

interface Props {
  slipNo: string | null;
  canEdit: boolean;
  onClose: () => void;
  onPushToDispatch: (slipNo: string) => Promise<void>;
  onChanged?: () => void;
  onNavigate?: (tab: string, intent?: NavIntent) => void;
  onNavigateOrders?: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

const NO_KTV_MODES = ['Khách hàng tự lắp đặt', 'Sản phẩm không cần lắp đặt'];

function parseKtvs(order: any): Array<{ code: string; name: string }> {
  if (!order) return [];
  try {
    const arr = JSON.parse(order.ktvs_json || '[]');
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.filter((k: any) => k && (k.name || k.code)).map((k: any) => ({
        code: String(k.code || '').trim(),
        name: String(k.name || '').trim(),
      }));
    }
  } catch { /* fallback */ }
  const out: Array<{ code: string; name: string }> = [];
  if (order.ktv1_name) out.push({ code: order.ktv1_code || '', name: order.ktv1_name });
  if (order.ktv2_name) out.push({ code: order.ktv2_code || '', name: order.ktv2_name });
  return out;
}

function whBadgeClass(wh: string) {
  if (wh === '9005') return 'bg-blue-50 text-[#224B85] border-blue-200';
  if (wh === '3001') return 'bg-emerald-50 text-[#234E36] border-emerald-200';
  if (wh === '1001') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-[#F8F4EC] text-[#3B281A] border-[#D6BCA5]';
}

function statusBadgeClass(st: string) {
  const l = String(st || '').toLowerCase();
  if (l === 'done' || l === 'completed' || l === 'closed') return 'bg-emerald-100 text-[#234E36]';
  if (l === 'packing' || l === 'in delivery' || l === 'in progress') return 'bg-amber-100 text-amber-900';
  if (l === 'cancelled' || l === 'return') return 'bg-red-100 text-[#9A2B26]';
  return 'bg-white/15 text-[#F8F4EC]';
}

export default function SlipDetailModal({
  slipNo,
  canEdit,
  onClose,
  onPushToDispatch,
  onChanged,
  onNavigate,
  onNavigateOrders,
  onToast,
}: Props) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [unmergingSlip, setUnmergingSlip] = useState<string | null>(null);
  const [editingCust, setEditingCust] = useState(false);
  const [savingCust, setSavingCust] = useState(false);
  const [custForm, setCustForm] = useState({ customer_name: '', customer_phone: '', address: '', region: 'HCM' });

  const loadDetail = async (no: string, force = false) => {
    setLoading(true);
    try {
      const res = await apiGet(`/api/delivery-tracking/${encodeURIComponent(no)}/detail`, { cacheMs: 20000, force });
      setDetail(res);
      setCustForm({
        customer_name: res?.order?.customer_name || '',
        customer_phone: res?.order?.customer_phone || '',
        address: res?.order?.address || '',
        region: res?.order?.region || res?.tracking?.area || 'HCM',
      });
      setEditingCust(false);
    } catch (e: any) {
      onToast(e.message, 'err');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!slipNo) {
      setDetail(null);
      return;
    }
    loadDetail(slipNo);
  }, [slipNo]);

  useEffect(() => {
    if (!slipNo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slipNo, onClose]);

  if (!slipNo) return null;

  const tr = detail?.tracking;
  const pos = detail?.pos;
  const ord = detail?.order;
  const items: any[] = detail?.order_items || [];
  const handovers: any[] = detail?.handovers || [];
  const slips: any[] = detail?.warehouse_slips || [];
  const tickets: any[] = detail?.warranty_tickets || [];
  const mergedSlips: any[] = detail?.merged_slips || [];

  const netSales = Number(tr?.net_sales_excl_tax ?? pos?.net_sales_excl_tax ?? 0);
  const delCust = Number(tr?.delivery_cust_pay ?? pos?.delivery_cust_pay ?? 0);
  const instCust = Number(tr?.install_cust_pay ?? pos?.install_cust_pay ?? 0);
  const custTotal = delCust + instCust;
  const fee3pl = Number(tr?.fee_3pl ?? ord?.shipping_fee_3pl ?? 0);
  const shipGap = custTotal - fee3pl;
  const feeRatio = netSales > 0 ? Number(((fee3pl / netSales) * 100).toFixed(2)) : 0;
  const ktvList = parseKtvs(ord);
  const carrierLabel = tr?.carrier_3pl || ord?.carrier || 'Chưa chọn 3PL';
  const latestHandoverMode = handovers[0]?.install_mode || '';
  const isNoKtvInstall = Boolean(
    NO_KTV_MODES.includes(latestHandoverMode) ||
    (ord && !ord.require_install && (!ord.install_status || ord.install_status === 'Không yêu cầu'))
  );
  const noKtvLabel = latestHandoverMode === 'Sản phẩm không cần lắp đặt'
    ? 'Sản phẩm không cần lắp đặt'
    : latestHandoverMode === 'Khách hàng tự lắp đặt'
      ? 'Khách hàng tự lắp đặt'
      : 'Không cần lắp đặt';

  const handlePush = async () => {
    setPushing(true);
    try {
      const hasCustInput = Boolean(custForm.customer_name || custForm.customer_phone || custForm.address);
      const res = await apiSend(`/api/delivery-tracking/${encodeURIComponent(slipNo)}/push-to-order`, 'POST', hasCustInput ? {
        customer_name: custForm.customer_name || undefined,
        customer_phone: custForm.customer_phone || '',
        address: custForm.address || '',
      } : {});
      onToast(
        res.existed
          ? `Hóa đơn ${slipNo} đã có bên Điều phối — Đang mở Biên bản / Phiếu giao hàng!`
          : `Đã đẩy ${slipNo} sang Điều phối (${res.items_created || 0} dòng SP) — Đang mở Biên bản / Phiếu giao hàng!`
      );
      onChanged?.();
      if (onNavigate && res.order_id) {
        onClose();
        if (res.existing_handover_id) {
          onNavigate('orders', { subTab: 'handovers', openHandoverId: res.existing_handover_id });
        } else {
          onNavigate('orders', {
            subTab: 'handovers',
            openOrCreateHandoverForOrderId: res.order_id,
            preferredDocType: res.require_install ? 'BM-01' : 'BM-05',
          });
        }
        return;
      }
      if (!hasCustInput) await onPushToDispatch(slipNo);
      await loadDetail(slipNo, true);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setPushing(false);
    }
  };

  const handleSaveCustomer = async () => {
    if (!ord) return;
    setSavingCust(true);
    try {
      await apiSend(`/api/orders/${ord.id}`, 'PUT', {
        ...ord,
        ktvs: parseKtvs(ord),
        customer_name: custForm.customer_name.trim() || ord.customer_name,
        customer_phone: custForm.customer_phone.trim(),
        address: custForm.address.trim(),
        region: custForm.region.trim() || ord.region || 'HCM',
      });
      onToast(`Đã cập nhật thông tin khách hàng cho đơn ${slipNo} & đồng bộ sang Biên bản!`);
      onChanged?.();
      await loadDetail(slipNo, true);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setSavingCust(false);
    }
  };

  const handleUnmergeChild = async (childSlipNo: string) => {
    if (!confirm(`Tách bill ${childSlipNo} ra khỏi đơn gộp ${slipNo}?`)) return;
    setUnmergingSlip(childSlipNo);
    try {
      await apiSend('/api/delivery-tracking/unmerge', 'POST', { child_slip_no: childSlipNo });
      onToast(`Đã tách bill ${childSlipNo} thành công!`);
      onChanged?.();
      await loadDetail(slipNo, true);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setUnmergingSlip(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-[#E6DDD1]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-base tracking-tight">{slipNo}</span>
              {mergedSlips.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-400/25 text-purple-100 inline-flex items-center gap-1">
                  <GitMerge className="w-3 h-3" /> Gộp +{mergedSlips.length} bill
                </span>
              )}
              {ord ? (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusBadgeClass(ord.status)}`}>
                  {ord.status}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/15 text-[#D6BCA5]">
                  Chỉ có trên POS / 3PL
                </span>
              )}
              {ord?.require_install ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/20 text-amber-200">
                  Có lắp đặt
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-[#D6BCA5] mt-0.5">
              Ngày bán POS: {tr?.sales_day || pos?.sales_day || ord?.order_date || '—'}
              {ord?.delivery_date ? ` • Ngày giao thực tế: ${ord.delivery_date}` : ''}
              {tr?.store_code || pos?.store_code ? ` • Store POS: ${tr?.store_code || pos?.store_code}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer shrink-0"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {loading || !detail ? (
            <div className="py-12 text-center text-[#6e5543]">Đang tải chi tiết hóa đơn {slipNo}...</div>
          ) : (
            <>
              {/* 1. POS Financial & 3PL Cost Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE7DC] p-3">
                  <div className="text-[11px] text-[#6e5543]">Net Sales (Tax excl.)</div>
                  <div className="text-base font-bold text-[#224B85] mt-0.5">{fmtVnd(netSales)}</div>
                  {pos?.gross_sales_incl_tax ? (
                    <div className="text-[10px] text-[#6e5543] mt-0.5">Gồm VAT (bill gốc): {fmtVnd(pos.gross_sales_incl_tax)}</div>
                  ) : null}
                </div>
                <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE7DC] p-3">
                  <div className="text-[11px] text-[#6e5543]">Khách đóng (Giao + Lắp)</div>
                  <div className="text-base font-bold text-[#234E36] mt-0.5">{fmtVnd(custTotal)}</div>
                  <div className="text-[10px] text-[#6e5543] mt-0.5">
                    Giao: {fmtVnd(delCust)} • Lắp: {fmtVnd(instCust)}
                  </div>
                </div>
                <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE7DC] p-3">
                  <div className="text-[11px] text-[#6e5543]">Chi phí 3PL ({carrierLabel})</div>
                  <div className="text-base font-bold text-[#9A2B26] mt-0.5">{fmtVnd(fee3pl)}</div>
                  <div className="text-[10px] text-[#6e5543] mt-0.5">Tỷ lệ / Net Sales: <strong>{feeRatio}%</strong></div>
                </div>
                <div className="rounded-xl bg-[#FAF7F2] border border-[#EFE7DC] p-3">
                  <div className="text-[11px] text-[#6e5543]">Chênh lệch vận chuyển</div>
                  <div className={`text-base font-bold mt-0.5 ${shipGap >= 0 ? 'text-[#234E36]' : 'text-[#9A2B26]'}`}>
                    {shipGap >= 0 ? '+' : ''}{fmtVnd(shipGap)}
                  </div>
                  <div className="text-[10px] text-[#6e5543] mt-0.5">
                    {shipGap >= 0 ? 'Khách đóng đủ / dư' : 'benom hỗ trợ bù ship'}
                  </div>
                </div>
              </div>

              {/* 1b. Consolidated / Merged Child Slips (with 1-click Unmerge!) */}
              {mergedSlips.length > 0 && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-purple-100/70 border-b border-purple-200 flex items-center justify-between gap-2">
                    <span className="font-bold text-purple-950 flex items-center gap-1.5">
                      <GitMerge className="w-4 h-4 text-purple-700" />
                      Các Bill Đã Gộp Vào Đơn Này ({mergedSlips.length} bill phụ)
                    </span>
                    <span className="text-[10px] text-purple-800">Doanh thu & phí đã tự cộng dồn vào tổng phía trên</span>
                  </div>
                  <div className="divide-y divide-purple-200/70">
                    {mergedSlips.map((ms: any) => (
                      <div key={ms.slip_no} className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-purple-950">{ms.slip_no}</span>
                            <span className="text-[10px] text-[#6e5543]">{ms.sales_day}</span>
                            {Number(ms.net_sales_excl_tax || 0) === 0 && (Number(ms.delivery_cust_pay || 0) > 0 || Number(ms.install_cust_pay || 0) > 0) && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">Bill thu phí</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#3B281A] mt-0.5">
                            Net Sales: <strong>{fmtVnd(ms.net_sales_excl_tax)}</strong> • Giao: <strong className="text-[#234E36]">{fmtVnd(ms.delivery_cust_pay)}</strong>
                            {Number(ms.install_cust_pay || 0) > 0 ? ` • Lắp: ${fmtVnd(ms.install_cust_pay)}` : ''}
                          </div>
                          {(ms.items_summary || ms.note) && (
                            <div className="text-[10px] text-[#6e5543] mt-0.5 truncate" title={ms.items_summary || ms.note}>
                              {ms.items_summary || ''}{ms.items_summary && ms.note ? ' | ' : ''}{ms.note ? `Note: ${ms.note}` : ''}
                            </div>
                          )}
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={unmergingSlip === ms.slip_no}
                            onClick={() => handleUnmergeChild(ms.slip_no)}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-purple-300 text-purple-900 text-[11px] font-semibold hover:bg-purple-100 cursor-pointer inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                          >
                            <Unlink className="w-3 h-3" /> {unmergingSlip === ms.slip_no ? 'Đang tách...' : 'Tách bill'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Customer & Dispatch Details */}
              {ord ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[#E6DDD1] p-4 space-y-2">
                    <div className="font-bold text-[#3B281A] flex items-center justify-between gap-1.5 pb-1.5 border-b border-[#EFE7DC]">
                      <span className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-[#3B281A]" /> Thông Tin Khách Hàng & Sales
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingCust(v => !v)}
                          className="px-2 py-0.5 rounded border border-[#D6BCA5] bg-[#FAF7F2] text-[10px] font-semibold text-[#3B281A] hover:bg-[#EFE7DC] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" /> {editingCust ? 'Hủy' : 'Sửa KH'}
                        </button>
                      )}
                    </div>

                    {editingCust ? (
                      <div className="space-y-2 pt-1">
                        <div>
                          <label className="text-[10px] font-semibold text-[#6e5543]">Tên khách hàng</label>
                          <input
                            value={custForm.customer_name}
                            onChange={e => setCustForm({ ...custForm, customer_name: e.target.value })}
                            className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-[#6e5543]">Số điện thoại</label>
                            <input
                              value={custForm.customer_phone}
                              onChange={e => setCustForm({ ...custForm, customer_phone: e.target.value })}
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-[#6e5543]">Khu vực</label>
                            <input
                              value={custForm.region}
                              onChange={e => setCustForm({ ...custForm, region: e.target.value })}
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[#6e5543]">Địa chỉ giao hàng</label>
                          <input
                            value={custForm.address}
                            onChange={e => setCustForm({ ...custForm, address: e.target.value })}
                            className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={savingCust}
                          onClick={handleSaveCustomer}
                          className="w-full py-1.5 rounded-lg bg-[#234E36] text-white text-xs font-semibold hover:bg-[#1a3c29] cursor-pointer inline-flex items-center justify-center gap-1 disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" /> {savingCust ? 'Đang lưu...' : 'Lưu & Đồng bộ sang Biên bản'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[#6e5543]">Khách hàng:</span>
                          <span className="font-bold text-[#3B281A] text-right">{ord.customer_name || '—'}</span>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[#6e5543] flex items-center gap-1"><Phone className="w-3 h-3" /> SĐT:</span>
                          <span className="font-mono text-[#3B281A]">{ord.customer_phone || '—'}</span>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[#6e5543] shrink-0 flex items-center gap-1"><MapPin className="w-3 h-3" /> Địa chỉ:</span>
                          <span className="text-[#3B281A] text-right">{ord.address || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#6e5543]">Khu vực / Khoảng cách:</span>
                          <span className="text-[#3B281A] font-medium">
                            {ord.region || tr?.area || 'HCM'}{ord.distance_km ? ` • ${ord.distance_km} km` : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#6e5543]">PIC Sales / Kênh:</span>
                          <span className="text-[#3B281A]">
                            {ord.pic_sales || '—'}{ord.channel ? ` • ${ord.channel}` : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#E6DDD1] p-4 space-y-2">
                    <div className="font-bold text-[#3B281A] flex items-center gap-1.5 pb-1.5 border-b border-[#EFE7DC]">
                      <Truck className="w-4 h-4 text-[#224B85]" /> Giao Nhận, Kho & Kỹ Thuật Viên
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6e5543]">Đơn vị 3PL:</span>
                        <span className="font-bold text-[#224B85]">{carrierLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6e5543]">Mã vận đơn:</span>
                        <span className="font-mono font-semibold text-[#3B281A]">{ord.tracking_no || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6e5543] flex items-center gap-1"><Warehouse className="w-3 h-3" /> Điểm lấy hàng:</span>
                        <span className="font-semibold text-[#3B281A]">
                          {ord.source_warehouse || '—'}{ord.moving_no ? ` (Moving: ${ord.moving_no})` : ''}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[#6e5543] shrink-0 flex items-center gap-1"><Wrench className="w-3 h-3" /> KTV phụ trách:</span>
                        <div className="text-right">
                          {isNoKtvInstall ? (
                            <span className="text-[#6e5543] italic">Không cần gán ({noKtvLabel})</span>
                          ) : ktvList.length > 0 ? (
                            <div className="flex flex-wrap justify-end gap-1">
                              {ktvList.map((k, i) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[11px] font-medium text-[#3B281A]">
                                  {k.code ? `[${k.code}] ` : ''}{k.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#6e5543]">Chưa gán</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6e5543]">Lắp đặt (BM-01):</span>
                        <span className="font-medium text-[#3B281A]">
                          {isNoKtvInstall
                            ? noKtvLabel
                            : (ord.install_status || (ord.require_install ? 'Yêu cầu lắp đặt' : 'Không yêu cầu'))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#D6BCA5] bg-[#FAF7F2] p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#3B281A]">Hóa đơn này chưa có hồ sơ bên Điều phối & BM-01</div>
                      <div className="text-[11px] text-[#6e5543] mt-0.5">
                        Khu vực: <strong>{tr?.area || 'HCM'}</strong> • 3PL: <strong>{carrierLabel}</strong>
                        {tr?.note ? ` • Ghi chú: ${tr.note}` : ''}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={pushing}
                        onClick={handlePush}
                        className="px-3.5 py-2 rounded-lg bg-[#224B85] text-white text-xs font-semibold hover:bg-[#1a3a68] cursor-pointer shrink-0 disabled:opacity-60"
                      >
                        {pushing ? 'Đang đẩy...' : '+ Đẩy sang Điều phối & BM-01'}
                      </button>
                    )}
                  </div>
                  {canEdit && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#E6DDD1]">
                      <input
                        value={custForm.customer_name}
                        onChange={e => setCustForm({ ...custForm, customer_name: e.target.value })}
                        placeholder="Tên khách hàng (tùy chọn)..."
                        className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs"
                      />
                      <input
                        value={custForm.customer_phone}
                        onChange={e => setCustForm({ ...custForm, customer_phone: e.target.value })}
                        placeholder="SĐT khách hàng..."
                        className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs font-mono"
                      />
                      <input
                        value={custForm.address}
                        onChange={e => setCustForm({ ...custForm, address: e.target.value })}
                        placeholder="Địa chỉ giao hàng..."
                        className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Notes if present */}
              {(ord?.notes || tr?.note) && (
                <div className="rounded-xl bg-amber-50/60 border border-amber-200/80 px-3.5 py-2.5 text-[#3B281A]">
                  <span className="font-bold text-[#6e5543] mr-1.5">Ghi chú:</span>
                  {ord?.notes || ''}
                  {ord?.notes && tr?.note && !ord.notes.includes(tr.note) ? ` | 3PL: ${tr.note}` : (!ord?.notes ? tr?.note : '')}
                </div>
              )}

              {/* 3. Product Items List */}
              <div className="rounded-xl border border-[#E6DDD1] overflow-hidden">
                <div className="px-3.5 py-2.5 bg-[#F8F4EC] border-b border-[#E6DDD1] font-bold text-[#3B281A] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-[#3B281A]" />
                    Danh Sách Sản Phẩm ({items.length > 0 ? `${items.length} dòng` : 'Theo POS'})
                  </span>
                </div>
                {items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-[#FAF7F2] border-b border-[#EFE7DC] text-[#6e5543]">
                          <th className="py-2 px-3">Barcode</th>
                          <th className="py-2 px-3">Tên sản phẩm</th>
                          <th className="py-2 px-2 text-center">SL</th>
                          <th className="py-2 px-3">Điểm lấy / Moving</th>
                          <th className="py-2 px-3">Bảo hành</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0E9DF]">
                        {items.map((it: any) => (
                          <tr key={it.id} className="hover:bg-[#FAF7F2]">
                            <td className="py-2 px-3 font-mono text-[11px] text-[#6e5543] whitespace-nowrap">{it.barcode || '—'}</td>
                            <td className="py-2 px-3 font-medium text-[#3B281A]">
                              {it.product_name}
                              {it.orig_invoice && it.orig_invoice !== slipNo && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-800 font-mono text-[10px]">
                                  Bill {it.orig_invoice}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center font-bold text-[#3B281A]">{it.qty} {it.unit || ''}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${whBadgeClass(it.source_warehouse || ord?.source_warehouse || '')}`}>
                                {it.source_warehouse || ord?.source_warehouse || '—'}
                              </span>
                              {it.moving_no && (
                                <span className="ml-1.5 font-mono text-[10px] text-[#6e5543]">MV:{it.moving_no}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-[#6e5543] whitespace-nowrap">
                              {it.warranty_months > 0 ? `${it.warranty_months} tháng` : (it.warranty_policy || 'Không BH')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3.5 text-[#3B281A]">
                    {tr?.items_summary || pos?.items_summary || 'Không có danh sách sản phẩm chi tiết.'}
                  </div>
                )}
              </div>

              {/* 4. Linked Documents (all clickable to jump straight to target popup!) */}
              {(handovers.length > 0 || slips.length > 0 || tickets.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {handovers.length > 0 && (
                    <div className="rounded-xl border border-[#E6DDD1] p-3 space-y-1.5">
                      <div className="font-bold text-[#3B281A] flex items-center gap-1.5 text-[11px] uppercase">
                        <ClipboardCheck className="w-3.5 h-3.5 text-[#234E36]" /> Biên bản ({handovers.length})
                      </div>
                      {handovers.map((h: any) => (
                        <button
                          type="button"
                          key={h.id}
                          onClick={() => {
                            if (onNavigate) {
                              onClose();
                              onNavigate('orders', { subTab: 'handovers', openHandoverId: h.id });
                            }
                          }}
                          className="w-full text-left p-2 rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] hover:border-[#234E36] hover:bg-emerald-50/40 transition-colors cursor-pointer"
                          title={`Mở popup ${h.doc_type} ${h.doc_no}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-[#3B281A] inline-flex items-center gap-0.5">
                              {h.doc_no} <ArrowUpRight className="w-3 h-3 text-[#234E36]" />
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusBadgeClass(h.status)}`}>{h.status}</span>
                          </div>
                          <div className="text-[10px] text-[#6e5543] mt-0.5">
                            {h.doc_type} • {h.handover_date || '—'}
                            {h.csat_rating > 0 && (
                              <span className="ml-1.5 inline-flex items-center text-amber-600 font-bold">
                                <Star className="w-2.5 h-2.5 fill-amber-500 mr-0.5" />{h.csat_rating}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {slips.length > 0 && (
                    <div className="rounded-xl border border-[#E6DDD1] p-3 space-y-1.5">
                      <div className="font-bold text-[#3B281A] flex items-center gap-1.5 text-[11px] uppercase">
                        <FileText className="w-3.5 h-3.5 text-[#224B85]" /> Phiếu kho ({slips.length})
                      </div>
                      {slips.map((s: any) => (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => {
                            if (onNavigate) {
                              onClose();
                              onNavigate('warehouse', { subTab: 'slips', openSlipId: s.id });
                            }
                          }}
                          className="w-full text-left p-2 rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] hover:border-[#224B85] hover:bg-blue-50/40 transition-colors cursor-pointer"
                          title={`Mở popup phiếu kho ${s.slip_no}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-[#3B281A] inline-flex items-center gap-0.5">
                              {s.slip_no} <ArrowUpRight className="w-3 h-3 text-[#224B85]" />
                            </span>
                            <span className="text-[10px] font-semibold text-[#224B85]">{s.status}</span>
                          </div>
                          <div className="text-[10px] text-[#6e5543] mt-0.5">
                            Kho {s.warehouse_code} • {s.slip_date || s.expected_date || '—'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {tickets.length > 0 && (
                    <div className="rounded-xl border border-[#E6DDD1] p-3 space-y-1.5">
                      <div className="font-bold text-[#3B281A] flex items-center gap-1.5 text-[11px] uppercase">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#9A2B26]" /> Bảo hành ({tickets.length})
                      </div>
                      {tickets.map((t: any) => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => {
                            if (onNavigate) {
                              onClose();
                              onNavigate('warranty', { subTab: 'warranty', openTicketNo: t.ticket_no });
                            }
                          }}
                          className="w-full text-left p-2 rounded-lg bg-[#FAF7F2] border border-[#EFE7DC] hover:border-[#9A2B26] hover:bg-red-50/40 transition-colors cursor-pointer"
                          title={`Mở Ticket bảo hành ${t.ticket_no}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-[#9A2B26] inline-flex items-center gap-0.5">
                              {t.ticket_no} <ArrowUpRight className="w-3 h-3" />
                            </span>
                            <span className="text-[10px] font-semibold text-[#3B281A]">{t.service_level} • {t.status}</span>
                          </div>
                          <div className="text-[10px] text-[#6e5543] mt-0.5 truncate" title={t.product_name}>
                            {t.product_name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {ord && (onNavigate || onNavigateOrders) && (
              <>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigate('orders', { subTab: 'orders', openOrderId: ord.id });
                    }}
                    className="px-3 py-2 rounded-lg border border-[#3B281A] bg-white text-[#3B281A] text-xs font-semibold hover:bg-[#FAF7F2] cursor-pointer inline-flex items-center gap-1"
                  >
                    Sửa đơn điều phối <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onNavigate) {
                      onNavigate('orders', {
                        subTab: 'handovers',
                        openHandoverId: handovers[0]?.id || undefined,
                        openOrCreateHandoverForOrderId: handovers[0]?.id ? undefined : ord.id,
                        preferredDocType: ord.require_install ? 'BM-01' : 'BM-05',
                      });
                    } else {
                      onNavigateOrders?.();
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold hover:bg-[#1a3c29] cursor-pointer inline-flex items-center gap-1"
                >
                  Mở Biên bản / PGH <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#D6BCA5] bg-white text-[#3B281A] text-xs font-semibold hover:bg-[#FAF7F2] cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
