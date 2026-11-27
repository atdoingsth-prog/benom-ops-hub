import React, { useMemo, useState } from 'react';
import { CheckCircle2, GitMerge, Info, Search, X } from 'lucide-react';
import { apiSend, fmtVnd } from '../api';

interface Props {
  mode: '3pl' | 'orders';
  rows: any[];
  initialMasterKey?: string | number | null;
  initialChildKeys?: Array<string | number>;
  onClose: () => void;
  onMerged: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function MergeModal({
  mode,
  rows,
  initialMasterKey = null,
  initialChildKeys = [],
  onClose,
  onMerged,
  onToast,
}: Props) {
  const getKey = (r: any) => (mode === '3pl' ? String(r.slip_no) : String(r.id));
  const getCode = (r: any) => (mode === '3pl' ? String(r.slip_no) : String(r.invoice_no));
  const getCustomer = (r: any) => (mode === '3pl' ? String(r.linked_customer_name || '') : String(r.customer_name || ''));
  const getTracking = (r: any) => (mode === '3pl' ? String(r.linked_tracking_no || '') : String(r.tracking_no || ''));
  const getNote = (r: any) => (mode === '3pl' ? String(r.note || '') : String(r.notes || ''));
  const getSummary = (r: any) => {
    if (mode === '3pl') return String(r.items_summary || '');
    return (r.items || []).map((it: any) => `${it.product_name} (x${it.qty})`).join(', ');
  };

  // Eligible candidates (exclude Cancelled or already Merged orders)
  const candidates = useMemo(() => {
    return (rows || []).filter((r: any) => {
      if (mode === 'orders' && (r.status === 'Cancelled' || r.status === 'Merged' || r.merged_into_order_id)) return false;
      return true;
    });
  }, [rows, mode]);

  const [masterKey, setMasterKey] = useState<string>(initialMasterKey ? String(initialMasterKey) : '');
  const [childKeys, setChildKeys] = useState<string[]>(initialChildKeys.map(String));
  const [masterSearch, setMasterSearch] = useState('');
  const [childSearch, setChildSearch] = useState('');
  const [syncBoth, setSyncBoth] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const masterRow = useMemo(() => candidates.find(r => getKey(r) === masterKey) || null, [candidates, masterKey]);
  const selectedChildren = useMemo(() => candidates.filter(r => childKeys.includes(getKey(r))), [candidates, childKeys]);

  const filteredMasters = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    return candidates
      .filter(r => !childKeys.includes(getKey(r)))
      .filter(r => {
        if (!q) return true;
        return (
          getCode(r).toLowerCase().includes(q) ||
          getCustomer(r).toLowerCase().includes(q) ||
          getTracking(r).toLowerCase().includes(q) ||
          getSummary(r).toLowerCase().includes(q) ||
          getNote(r).toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [candidates, childKeys, masterSearch]);

  const filteredChildren = useMemo(() => {
    const q = childSearch.trim().toLowerCase();
    const mCode = masterRow ? getCode(masterRow) : '';
    const mCust = masterRow ? getCustomer(masterRow).trim().toLowerCase() : '';
    const mTrk = masterRow ? getTracking(masterRow).trim().toLowerCase() : '';

    return candidates
      .filter(r => getKey(r) !== masterKey)
      .filter(r => {
        if (!q) return true;
        return (
          getCode(r).toLowerCase().includes(q) ||
          getCustomer(r).toLowerCase().includes(q) ||
          getTracking(r).toLowerCase().includes(q) ||
          getSummary(r).toLowerCase().includes(q) ||
          getNote(r).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Bubble best matches to top: references master slip in note, same tracking, same customer, or fee-only bill
        const score = (r: any) => {
          let s = 0;
          if (childKeys.includes(getKey(r))) s += 100;
          if (mCode && getNote(r).includes(mCode)) s += 50;
          if (mTrk && mTrk.length >= 5 && getTracking(r).trim().toLowerCase() === mTrk) s += 40;
          if (mCust && !mCust.startsWith('khách pos') && getCustomer(r).trim().toLowerCase() === mCust) s += 30;
          if (mode === '3pl' && Number(r.net_sales_excl_tax || 0) === 0) s += 10;
          return s;
        };
        return score(b) - score(a);
      })
      .slice(0, 80);
  }, [candidates, masterKey, masterRow, childKeys, childSearch, mode]);

  const toggleChild = (key: string) => {
    setChildKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  // Consolidated preview numbers
  const preview = useMemo(() => {
    if (!masterRow) return null;
    const all = [masterRow, ...selectedChildren];
    if (mode === '3pl') {
      const sumDel = all.reduce((a, r) => a + Number(r.delivery_cust_pay || 0), 0);
      const sumInst = all.reduce((a, r) => a + Number(r.install_cust_pay || 0), 0);
      const sumFee = all.reduce((a, r) => a + Number(r.fee_3pl || 0), 0);
      const sumSales = all.reduce((a, r) => a + Number(r.net_sales_excl_tax || 0), 0);
      return { sumDel, sumInst, sumFee, sumSales, totalBills: all.length };
    }
    const sumCust = all.reduce((a, r) => a + Number(r.customer_paid_fee || 0), 0);
    const sumFee = Number(masterRow.shipping_fee_3pl || 0) || all.reduce((a, r) => a + Number(r.shipping_fee_3pl || 0), 0);
    const totalItems = all.reduce((a, r) => a + (r.items?.length || 0), 0);
    return { sumCust, sumFee, totalItems, totalBills: all.length };
  }, [masterRow, selectedChildren, mode]);

  const handleConfirmMerge = async () => {
    if (!masterRow || selectedChildren.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      if (mode === '3pl') {
        const res = await apiSend('/api/delivery-tracking/merge', 'POST', {
          master_slip_no: masterRow.slip_no,
          child_slip_nos: selectedChildren.map(c => c.slip_no),
          also_merge_orders: syncBoth,
        });
        onToast(`Đã gộp ${res.merged_count} bill vào No Slip. chính ${res.master_slip_no}!`);
      } else {
        const res = await apiSend('/api/orders/merge', 'POST', {
          master_order_id: masterRow.id,
          child_order_ids: selectedChildren.map(c => c.id),
          sync_3pl: syncBoth,
        });
        onToast(`Đã gộp ${res.merged_count} đơn phụ vào ĐH chính ${res.master_invoice_no || masterRow.invoice_no}!`);
      }
      onMerged();
      onClose();
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-[#E6DDD1]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between gap-2 shrink-0">
          <div>
            <div className="font-bold text-sm flex items-center gap-1.5">
              <GitMerge className="w-4 h-4 text-[#D6BCA5]" />
              Gộp Đơn Hàng / Hóa Đơn POS ({mode === '3pl' ? 'Báo cáo 3PL' : 'Điều phối & BM-01'})
            </div>
            <div className="text-[11px] text-[#D6BCA5] mt-0.5">
              Dùng khi Sales tách bill thu phí ship/lắp đặt riêng hoặc khách mua thêm hàng nhưng giao chung 1 chuyến / 1 mã vận đơn.
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Column 1: Pick Master */}
            <div className="rounded-xl border border-[#D6BCA5] overflow-hidden flex flex-col">
              <div className="px-3.5 py-2.5 bg-[#F8F4EC] border-b border-[#E6DDD1]">
                <div className="font-bold text-[#3B281A]">1. Chọn Đơn Chính (Giữ lại làm Master)</div>
                <div className="relative mt-1.5">
                  <Search className="w-3.5 h-3.5 text-[#6e5543] absolute left-2.5 top-2" />
                  <input
                    value={masterSearch}
                    onChange={e => setMasterSearch(e.target.value)}
                    placeholder="Tìm số bill, khách hàng, sản phẩm..."
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-xs"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[#F0E9DF]">
                {filteredMasters.map(r => {
                  const key = getKey(r);
                  const active = key === masterKey;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setMasterKey(key)}
                      className={`w-full text-left px-3 py-2 cursor-pointer transition-colors ${
                        active ? 'bg-[#3B281A] text-white' : 'hover:bg-[#FAF7F2] text-[#3B281A]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold">{getCode(r)}</span>
                        <span className={`text-[10px] ${active ? 'text-[#D6BCA5]' : 'text-[#6e5543]'}`}>
                          {mode === '3pl' ? `${fmtVnd(r.net_sales_excl_tax)} • ${r.sales_day}` : (r.delivery_date || r.order_date)}
                        </span>
                      </div>
                      <div className={`text-[11px] truncate ${active ? 'text-[#F8F4EC]' : 'text-[#6e5543]'}`}>
                        {getCustomer(r) ? `${getCustomer(r)} • ` : ''}{getSummary(r) || getNote(r) || '—'}
                      </div>
                    </button>
                  );
                })}
                {filteredMasters.length === 0 && (
                  <div className="p-4 text-center text-[#6e5543]">Không tìm thấy hóa đơn phù hợp.</div>
                )}
              </div>
            </div>

            {/* Column 2: Pick Children */}
            <div className="rounded-xl border border-purple-200 overflow-hidden flex flex-col">
              <div className="px-3.5 py-2.5 bg-purple-50 border-b border-purple-200">
                <div className="font-bold text-purple-950">
                  2. Chọn Đơn Phụ Cần Gộp Vào ({selectedChildren.length} đã chọn)
                </div>
                <div className="relative mt-1.5">
                  <Search className="w-3.5 h-3.5 text-purple-700 absolute left-2.5 top-2" />
                  <input
                    value={childSearch}
                    onChange={e => setChildSearch(e.target.value)}
                    placeholder="Tìm bill thu phí ship / bill mua thêm..."
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-purple-200 bg-white text-xs"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-purple-100">
                {filteredChildren.map(r => {
                  const key = getKey(r);
                  const checked = childKeys.includes(key);
                  const mCode = masterRow ? getCode(masterRow) : '';
                  const noteMatch = Boolean(mCode && getNote(r).includes(mCode));
                  const sameTrk = Boolean(masterRow && getTracking(masterRow).length >= 5 && getTracking(r) === getTracking(masterRow));
                  const isFeeBill = mode === '3pl' && Number(r.net_sales_excl_tax || 0) === 0 && (Number(r.delivery_cust_pay || 0) > 0 || Number(r.install_cust_pay || 0) > 0);
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                        checked ? 'bg-purple-100/80' : 'hover:bg-purple-50/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChild(key)}
                        className="mt-0.5 accent-purple-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-mono font-bold text-[#3B281A]">{getCode(r)}</span>
                          <div className="flex flex-wrap gap-1">
                            {noteMatch && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-[#234E36] text-[9px] font-bold">Ghi chú trỏ ĐH chính</span>}
                            {sameTrk && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-[#224B85] text-[9px] font-bold">Chung mã vận đơn</span>}
                            {isFeeBill && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">Bill thu phí</span>}
                          </div>
                        </div>
                        <div className="text-[10px] text-[#6e5543]">
                          {mode === '3pl'
                            ? `Sales: ${fmtVnd(r.net_sales_excl_tax)} • Giao: ${fmtVnd(r.delivery_cust_pay)} • Lắp: ${fmtVnd(r.install_cust_pay)}`
                            : `${getCustomer(r)} • Phí KH: ${fmtVnd(r.customer_paid_fee)} • ${(r.items || []).length} SP`}
                        </div>
                        {(getSummary(r) || getNote(r)) && (
                          <div className="text-[10px] text-[#3B281A] truncate">
                            {getSummary(r)}{getSummary(r) && getNote(r) ? ' | ' : ''}{getNote(r) ? `Note: ${getNote(r)}` : ''}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live Consolidated Preview */}
          {masterRow && selectedChildren.length > 0 && preview && (
            <div className="rounded-xl bg-[#FAF7F2] border border-[#3B281A]/30 p-3.5 space-y-2">
              <div className="font-bold text-[#3B281A] flex items-center justify-between gap-2">
                <span>Xem trước kết quả sau khi gộp ({preview.totalBills} hóa đơn → 1 chuyến giao)</span>
                <span className="font-mono text-[11px] text-purple-800">
                  {getCode(masterRow)} + {selectedChildren.map(getCode).join(', ')}
                </span>
              </div>
              {mode === '3pl' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Tổng Net Sales</div>
                    <div className="font-bold text-[#224B85]">{fmtVnd((preview as any).sumSales)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Tổng Delivery Cust.</div>
                    <div className="font-bold text-[#234E36]">{fmtVnd((preview as any).sumDel)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Tổng Install Cust.</div>
                    <div className="font-bold text-[#3B281A]">{fmtVnd((preview as any).sumInst)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Tổng Fee 3PL</div>
                    <div className="font-bold text-[#9A2B26]">{fmtVnd((preview as any).sumFee)}</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Tổng dòng SP sau gộp</div>
                    <div className="font-bold text-[#3B281A]">{(preview as any).totalItems} dòng</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Tổng phí khách đóng</div>
                    <div className="font-bold text-[#234E36]">{fmtVnd((preview as any).sumCust)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#E6DDD1]">
                    <div className="text-[10px] text-[#6e5543]">Phí 3PL chuyến giao</div>
                    <div className="font-bold text-[#9A2B26]">{fmtVnd((preview as any).sumFee)}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sync checkbox + reversible guarantee */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#3B281A]">
              <input
                type="checkbox"
                checked={syncBoth}
                onChange={e => setSyncBoth(e.target.checked)}
                className="accent-[#3B281A]"
              />
              <span>Tự động đồng bộ gộp cả Điều phối & Báo cáo 3PL (khuyên dùng)</span>
            </label>
            <div className="text-[11px] text-[#6e5543] flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-[#224B85] shrink-0" />
              Không xóa bill POS gốc — có thể bấm <strong>Tách đơn</strong> lại bất cứ lúc nào.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs cursor-pointer">
            Hủy
          </button>
          <button
            type="button"
            disabled={!masterRow || selectedChildren.length === 0 || submitting}
            onClick={handleConfirmMerge}
            className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold hover:bg-[#563C28] cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Đang gộp...' : `Xác nhận gộp ${selectedChildren.length || ''} đơn`}
          </button>
        </div>
      </div>
    </div>
  );
}
