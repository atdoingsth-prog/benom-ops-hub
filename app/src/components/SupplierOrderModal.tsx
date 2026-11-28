import React, { useEffect, useState } from 'react';
import {
  Building2, Check, Copy, Edit3, Factory, Package, PackagePlus, PhoneCall, Save, ShoppingBag, Store, X
} from 'lucide-react';
import { apiGet, apiSend, fmtNum } from '../api';
import type { PoPrefillPayload } from './PurchaseOrderFormModal';

export type PurchaseSeason = 'NORMAL' | 'PEAK_BF' | 'PEAK_TET';

interface Props {
  supplierName: string;
  supplierCode?: string;
  focusBarcode?: string;
  season: PurchaseSeason;
  canEdit: boolean;
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPartnerUpdated?: () => void;
  onCreatePo?: (prefill: PoPrefillPayload) => void;
}

export default function SupplierOrderModal({
  supplierName,
  supplierCode,
  focusBarcode,
  season,
  canEdit,
  onClose,
  onToast,
  onPartnerUpdated,
  onCreatePo,
}: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedBarcodes, setSelectedBarcodes] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: supplierName,
    partner_type: 'TRADING',
    category: '',
    contact_info: '',
    legal_name: '',
    tax_code: '',
    address: '',
    bank_account: '',
    bank_name: '',
    contract_no: '',
    payment_terms: '50_50',
  });

  const loadInfo = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        supplier: supplierCode || supplierName,
        supplier_name: supplierName,
        season,
        ...(focusBarcode ? { barcode: focusBarcode } : {}),
      });
      const res = await apiGet(`/api/dashboard/supplier-info?${qs.toString()}`);
      setData(res);
      const sup = res.supplier || {};
      setForm({
        name: sup.name || supplierName,
        partner_type: sup.partner_type || 'TRADING',
        category: sup.category || '',
        contact_info: sup.contact_info || '',
        legal_name: sup.legal_name || '',
        tax_code: sup.tax_code || '',
        address: sup.address || '',
        bank_account: sup.bank_account || '',
        bank_name: sup.bank_name || '',
        contract_no: sup.contract_no || '',
        payment_terms: sup.payment_terms || (sup.partner_type === 'FACTORY' ? '50_50' : '100_NET30'),
      });
      const initialSel = new Set<string>();
      if (res.focus_item?.barcode) initialSel.add(res.focus_item.barcode);
      for (const it of (res.other_low_stock_items || []).slice(0, 5)) {
        if (it.suggested_order_qty > 0) initialSel.add(it.barcode);
      }
      setSelectedBarcodes(initialSel);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, [supplierName, supplierCode, focusBarcode, season]);

  const toggleBarcode = (bc: string) => {
    setSelectedBarcodes(prev => {
      const next = new Set(prev);
      if (next.has(bc)) next.delete(bc);
      else next.add(bc);
      return next;
    });
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCode = data?.supplier?.code || supplierCode || supplierName;
    if (!targetCode) return;
    setSaving(true);
    try {
      await apiSend(`/api/master/partners/${encodeURIComponent(targetCode)}`, 'PUT', form);
      onToast(`Đã cập nhật thông tin Nhà Cung Cấp ${form.name}!`);
      setEditing(false);
      await loadInfo();
      onPartnerUpdated?.();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!data) return;
    const allItems = [
      ...(data.focus_item ? [data.focus_item] : []),
      ...(data.other_low_stock_items || []),
    ];
    const picked = allItems.filter(it => selectedBarcodes.has(it.barcode));
    const listToCopy = picked.length > 0 ? picked : (data.focus_item ? [data.focus_item] : []);
    if (listToCopy.length === 0) {
      onToast('Chưa chọn mã hàng nào để copy.', 'err');
      return;
    }
    const sup = data.supplier || {};
    const lines = [
      `ĐỀ NGHỊ ĐẶT HÀNG NHÀ CUNG CẤP — benom`,
      `Nhà cung cấp: ${sup.name || supplierName}${sup.code ? ` (Mã: ${sup.code})` : ''}`,
      ...(sup.contact_info ? [`Liên hệ NCC: ${sup.contact_info}`] : []),
      `Danh sách mã đề xuất đặt (${listToCopy.length} SKU):`,
      ...listToCopy.map(
        it =>
          `• ${it.barcode} — ${it.product_name}: Đặt ${Math.max(1, it.suggested_order_qty || it.safety_stock || 1)} ${it.unit || 'Cái'} (Tồn 3001+9005: ${it.total_stock}, Tồn an toàn: ${it.safety_stock})`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      onToast('Đã copy thông tin & danh sách đặt hàng NCC vào clipboard!');
    } catch {
      onToast('Không thể truy cập clipboard trình duyệt.', 'err');
    }
  };

    const handleCreateOfficialPo = () => {
    if (!data || !onCreatePo) return;
    const allItems = [
      ...(data.focus_item ? [data.focus_item] : []),
      ...(data.other_low_stock_items || []),
    ];
    const picked = allItems.filter(it => selectedBarcodes.has(it.barcode));
    const listToSend = picked.length > 0 ? picked : (data.focus_item ? [data.focus_item] : []);
    const sup = data.supplier || {};
    const poCat = String(sup.partner_type || '').toUpperCase() === 'FACTORY' ? 'FACTORY' : 'TRADING';
    onCreatePo({
      po_category: poCat,
      supplier_code: sup.code || supplierCode || '',
      supplier_name: sup.name || supplierName,
      vendor_legal_name: sup.legal_name || sup.name || supplierName,
      vendor_tax_code: sup.tax_code || '',
      vendor_address: sup.address || '',
      vendor_bank_account: sup.bank_account || '',
      vendor_bank_name: sup.bank_name || '',
      vendor_contact: sup.contact_info || '',
      contract_no: sup.contract_no || '',
      payment_mode: sup.payment_terms || (poCat === 'FACTORY' ? '50_50' : '100_NET30'),
      items: listToSend.map(it => ({
        barcode: it.barcode,
        product_name: it.product_name,
        unit: it.unit || 'Cái',
        qty: Math.max(1, it.suggested_order_qty || it.safety_stock || 1),
        unit_price: Number(it.cost_price) || 0,
        remark: '',
      })),
    });
    onClose();
  };

  const sup = data?.supplier;
  const focus = data?.focus_item;
  const others: any[] = data?.other_low_stock_items || [];
  const isFactory = (sup?.partner_type || '').toUpperCase() === 'FACTORY';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl border border-[#D6BCA5] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <h3 className="text-base font-bold">Thông Tin Nhà Cung Cấp — Đặt Hàng (PO)</h3>
              <p className="text-[11px] text-[#D6BCA5]">
                Tra cứu nhanh liên hệ Nhà Cung Cấp & số lượng đề xuất theo Tồn Kho An Toàn.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {loading ? (
            <div className="py-10 text-center text-[#6e5543]">Đang tải thông tin Nhà Cung Cấp & tồn kho...</div>
          ) : !data ? (
            <div className="py-10 text-center text-[#9A2B26]">Không tải được thông tin Nhà Cung Cấp.</div>
          ) : (
            <>
              {/* Supplier Info Card */}
              <div className="rounded-xl border border-[#E6DDD1] bg-[#FAF7F2] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-[#3B281A]">{sup?.name || supplierName}</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-[#D6BCA5] text-[#6e5543]">
                        Mã: {sup?.code || supplierCode || 'CHƯA CÓ MÃ'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                        isFactory ? 'bg-purple-100 text-purple-900' : 'bg-blue-100 text-blue-900'
                      }`}>
                        {isFactory ? <Factory className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        {isFactory ? 'FACTORY (Xưởng SX)' : 'TRADING (Thương mại/Ký gửi)'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6e5543] mt-1 flex flex-wrap gap-3">
                      <span>Ngành hàng: <strong className="text-[#3B281A]">{sup?.category || 'Chưa phân loại'}</strong></span>
                      <span>• Số SKU đang quản lý: <strong className="text-[#3B281A]">{sup?.sku_count || 0} mã</strong></span>
                      <span>• Lead time dự kiến: <strong className="text-[#3B281A]">{sup?.lead_time_days || 21} ngày</strong></span>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(e => !e)}
                      className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white text-[11px] font-semibold text-[#3B281A] hover:bg-[#EFE7DC] flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> {editing ? 'Hủy sửa' : 'Cập nhật liên hệ NCC'}
                    </button>
                  )}
                </div>

                {!editing ? (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-white border border-[#E6DDD1] px-3 py-2.5 flex items-start gap-2">
                      <PhoneCall className="w-4 h-4 text-[#234E36] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-[#6e5543]">
                          Thông tin liên hệ (SĐT / Email / Zalo / PIC)
                        </div>
                        <div className={`text-xs font-semibold ${sup?.contact_info ? 'text-[#3B281A]' : 'text-amber-700 italic'}`}>
                          {sup?.contact_info || 'Chưa cập nhật thông tin liên hệ NCC — bấm "Cập nhật liên hệ NCC" để bổ sung.'}
                        </div>
                      </div>
                    </div>
                    {(sup?.legal_name || sup?.tax_code || sup?.bank_account || sup?.contract_no) && (
                      <div className="rounded-lg bg-white border border-[#E6DDD1] px-3 py-2 text-[11px] text-[#3B281A] grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {sup.legal_name && <div className="sm:col-span-2"><strong>Pháp lý:</strong> {sup.legal_name}</div>}
                        {sup.tax_code && <div><strong>MST:</strong> <span className="font-mono">{sup.tax_code}</span></div>}
                        {sup.contract_no && <div><strong>HĐ khung:</strong> <span className="font-mono">{sup.contract_no}</span></div>}
                        {sup.bank_account && <div className="sm:col-span-2"><strong>TK NH:</strong> <span className="font-mono">{sup.bank_account}</span> {sup.bank_name ? `(${sup.bank_name})` : ''}</div>}
                        {sup.address && <div className="sm:col-span-2"><strong>Địa chỉ:</strong> {sup.address}</div>}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSavePartner} className="rounded-lg bg-white border border-[#D6BCA5] p-3 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Tên Nhà Cung Cấp</span>
                        <input
                          required
                          value={form.name}
                          onChange={e => setForm({ ...form, name: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-semibold"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Loại hình NCC</span>
                        <select
                          value={form.partner_type}
                          onChange={e => setForm({ ...form, partner_type: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] bg-white font-semibold"
                        >
                          <option value="FACTORY">FACTORY (Xưởng sản xuất • ~30N)</option>
                          <option value="TRADING">TRADING (Thương mại/Ký gửi • ~14N)</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Ngành hàng / Nhóm SP</span>
                        <input
                          value={form.category}
                          onChange={e => setForm({ ...form, category: e.target.value })}
                          placeholder="VD: sofa, bàn ghế, gốm sứ..."
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="sm:col-span-2 block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Tên pháp lý (trên PO/HĐ)</span>
                        <input
                          value={form.legal_name}
                          onChange={e => setForm({ ...form, legal_name: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Mã số thuế (MST)</span>
                        <input
                          value={form.tax_code}
                          onChange={e => setForm({ ...form, tax_code: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-mono"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Số tài khoản (STK)</span>
                        <input
                          value={form.bank_account}
                          onChange={e => setForm({ ...form, bank_account: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-mono"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Ngân hàng & Chi nhánh</span>
                        <input
                          value={form.bank_name}
                          onChange={e => setForm({ ...form, bank_name: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-[#6e5543] font-semibold">Số Hợp đồng khung</span>
                        <input
                          value={form.contract_no}
                          onChange={e => setForm({ ...form, contract_no: e.target.value })}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-mono"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[10px] text-[#6e5543] font-semibold">Địa chỉ NCC</span>
                      <input
                        value={form.address}
                        onChange={e => setForm({ ...form, address: e.target.value })}
                        className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-[#6e5543] font-semibold">Thông tin liên hệ (SĐT / Email / Zalo / PIC)</span>
                      <input
                        value={form.contact_info}
                        onChange={e => setForm({ ...form, contact_info: e.target.value })}
                        placeholder="VD: Chị Lan - 0909xxxxxx - sale@ncc.vn"
                        className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                      />
                    </label>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-3.5 py-1.5 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center gap-1 hover:bg-[#1b3d2a] cursor-pointer disabled:opacity-60"
                      >
                        <Save className="w-3.5 h-3.5" /> {saving ? 'Đang lưu...' : 'Lưu thông tin NCC'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Focus SKU card */}
              {focus && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-[#3B281A] flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-amber-700" />
                      <span>Sản phẩm đang chọn đặt hàng</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3B281A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBarcodes.has(focus.barcode)}
                        onChange={() => toggleBarcode(focus.barcode)}
                        className="accent-[#3B281A]"
                      />
                      Gồm trong danh sách copy
                    </label>
                  </div>
                  <div className="text-xs font-bold text-[#3B281A]">
                    <span className="font-mono text-[#6e5543] mr-2">{focus.barcode}</span>
                    {focus.product_name}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                    <div className="bg-white rounded-lg p-2 border border-[#E6DDD1]">
                      <div className="text-[10px] text-[#6e5543] flex items-center gap-1"><Store className="w-3 h-3" /> Tồn 3001 / 9005</div>
                      <div className="font-bold text-[#3B281A] mt-0.5">{fmtNum(focus.stock_3001)} / {fmtNum(focus.stock_9005)} <span className="text-[#6e5543]">(= {fmtNum(focus.total_stock)})</span></div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-[#E6DDD1]">
                      <div className="text-[10px] text-[#6e5543]">Bán TB (mùa vụ)</div>
                      <div className="font-bold text-[#224B85] mt-0.5">{focus.adj_monthly_vel} sp/tháng</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-[#E6DDD1]">
                      <div className="text-[10px] text-[#6e5543]">Tồn kho an toàn</div>
                      <div className="font-bold text-amber-800 mt-0.5">{fmtNum(focus.safety_stock)} sp</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-[#E6DDD1]">
                      <div className="text-[10px] text-[#6e5543]">Điểm đặt (ROP)</div>
                      <div className="font-bold text-[#3B281A] mt-0.5">{fmtNum(focus.reorder_point)} sp</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-amber-300">
                      <div className="text-[10px] text-amber-800 font-semibold">Đề xuất đặt NCC</div>
                      <div className="font-extrabold text-[#9A2B26] mt-0.5">
                        {focus.suggested_order_qty > 0 ? `${fmtNum(focus.suggested_order_qty)} ${focus.unit || 'sp'}` : 'Đủ hàng'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other low-stock SKUs from the same Supplier */}
              {others.length > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-[#3B281A] text-xs">
                    Các mã khác của NCC {sup?.name || supplierName} cũng dưới mức đặt hàng ({others.length} SKU):
                  </div>
                  <div className="overflow-x-auto border border-[#E6DDD1] rounded-xl max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#F8F4EC] text-[#6e5543] border-b border-[#E6DDD1] sticky top-0">
                        <tr>
                          <th className="p-2 w-7"></th>
                          <th className="p-2">Barcode / Sản phẩm</th>
                          <th className="p-2 text-right">Tổng tồn</th>
                          <th className="p-2 text-right">An toàn</th>
                          <th className="p-2 text-right">Bán/T</th>
                          <th className="p-2 text-right">Đề xuất đặt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0E8DE]">
                        {others.map(it => (
                          <tr key={it.barcode} className="hover:bg-[#FAF7F2]">
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={selectedBarcodes.has(it.barcode)}
                                onChange={() => toggleBarcode(it.barcode)}
                                className="accent-[#3B281A]"
                              />
                            </td>
                            <td className="p-2">
                              <div className="font-semibold text-[#3B281A]">{it.product_name}</div>
                              <div className="font-mono text-[10px] text-[#6e5543]">{it.barcode}</div>
                            </td>
                            <td className="p-2 text-right font-semibold text-[#9A2B26]">
                              {fmtNum(it.total_stock)} <span className="text-[10px] text-[#6e5543]">({it.stock_3001}+{it.stock_9005})</span>
                            </td>
                            <td className="p-2 text-right font-semibold">{fmtNum(it.safety_stock)}</td>
                            <td className="p-2 text-right">{it.adj_monthly_vel}</td>
                            <td className="p-2 text-right font-bold text-[#3B281A]">{fmtNum(it.suggested_order_qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[#6e5543]">
            Chọn các mã cần gộp đơn rồi bấm <strong>+ Tạo PO chính thức</strong> hoặc Copy nháp.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <button
                type="button"
                onClick={handleCopyDraft}
                className="px-3 py-2 rounded-lg bg-amber-400 text-[#2A1E15] text-xs font-bold flex items-center gap-1.5 hover:bg-amber-300 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Copy danh sách
              </button>
            )}
            {data && canEdit && onCreatePo && (
              <button
                type="button"
                onClick={handleCreateOfficialPo}
                className="px-3.5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#1b3d2a] cursor-pointer"
              >
                <PackagePlus className="w-3.5 h-3.5" /> + Tạo PO chính thức
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold hover:bg-[#563C28] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 inline mr-1" /> Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
