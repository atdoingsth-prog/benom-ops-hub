import React, { useEffect, useState } from 'react';
import { PackagePlus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { apiGet, apiSend, fmtVnd } from '../api';

export interface PoPrefillPayload {
  po_category?: 'FACTORY' | 'TRADING';
  supplier_code?: string;
  supplier_name?: string;
  vendor_legal_name?: string;
  vendor_tax_code?: string;
  vendor_address?: string;
  vendor_bank_account?: string;
  vendor_bank_name?: string;
  vendor_contact?: string;
  contract_no?: string;
  payment_mode?: string;
  items?: Array<{
    barcode: string;
    product_name: string;
    unit?: string;
    qty: number;
    unit_price: number;
    remark?: string;
  }>;
}

interface Props {
  editingPoId?: number | null;
  prefill?: PoPrefillPayload | null;
  onSaved: (po: any) => void;
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

const WAREHOUSE_ADDR: Record<string, string> = {
  '3001': 'Tầng 3, Lô Anchor Tenant #2, TTTM Parkson Lê Thánh Tôn, 35-45 Bis, P. Sài Gòn, Q.1, TP.HCM',
  '9005': 'Số 10 Đại lộ Độc Lập, KCN Sóng Thần 1, Dĩ An (Kho Toàn Nhất Logistics BD02)',
  '1001': 'Lô G64-G65, Tầng trệt, Aeon Mall Bình Tân, TP.HCM',
};

export default function PurchaseOrderFormModal({ editingPoId, prefill, onSaved, onClose, onToast }: Props) {
  const isEdit = Boolean(editingPoId);
  const [loading, setLoading] = useState(Boolean(editingPoId));
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [bumpRevision, setBumpRevision] = useState(false);

  const [form, setForm] = useState<any>({
    po_no: '',
    revision_no: 1,
    po_date: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
    po_category: prefill?.po_category || 'FACTORY',
    contract_no: prefill?.contract_no || '',
    supplier_code: prefill?.supplier_code || '',
    supplier_name: prefill?.supplier_name || '',
    vendor_legal_name: prefill?.vendor_legal_name || '',
    vendor_tax_code: prefill?.vendor_tax_code || '',
    vendor_address: prefill?.vendor_address || '',
    vendor_bank_account: prefill?.vendor_bank_account || '',
    vendor_bank_name: prefill?.vendor_bank_name || '',
    vendor_contact: prefill?.vendor_contact || '',
    ship_to_warehouse: '3001',
    ship_to_address: WAREHOUSE_ADDR['3001'],
    delivery_schedule: '',
    final_inspection_date: '',
    vat_rate: 8,
    payment_mode: prefill?.payment_mode || (prefill?.po_category === 'TRADING' ? '100_NET30' : '50_50'),
    deposit_pct: prefill?.payment_mode === '50_50' || (!prefill?.payment_mode && (prefill?.po_category || 'FACTORY') === 'FACTORY') ? 50 : 0,
    payment_terms_note: '',
    status: 'Draft',
    notes: '',
    items: Array.isArray(prefill?.items)
      ? prefill!.items.map(it => ({
          product_code: '',
          barcode: it.barcode || '',
          product_name: it.product_name || '',
          image_url: '',
          unit: it.unit || 'Cái',
          qty: Number(it.qty) || 1,
          unit_price: Number(it.unit_price) || 0,
          remark: it.remark || '',
        }))
      : ([] as any[]),
  });

  useEffect(() => {
    apiGet<{ partners: any[] }>('/api/master/lookups', { cacheMs: 120000 })
      .then(res => setPartners((res.partners || []).filter(p => p.partner_type === 'FACTORY' || p.partner_type === 'TRADING')))
      .catch(() => {});

    if (editingPoId) {
      setLoading(true);
      apiGet(`/api/purchase-orders/${editingPoId}`)
        .then(po => {
          setForm({
            ...po,
            items: (po.items || []).map((it: any) => ({
              product_code: it.product_code || '',
              barcode: it.barcode || '',
              product_name: it.product_name || '',
              image_url: it.image_url || '',
              unit: it.unit || 'Cái',
              qty: Number(it.qty) || 1,
              unit_price: Number(it.unit_price) || 0,
              remark: it.remark || '',
            })),
          });
        })
        .catch((e: any) => onToast(e.message, 'err'))
        .finally(() => setLoading(false));
    } else {
      apiGet<{ po_no: string }>('/api/purchase-orders/next-no')
        .then(res => {
          if (res?.po_no) setForm((prev: any) => ({ ...prev, po_no: prev.po_no || res.po_no }));
        })
        .catch(() => {});
    }
  }, [editingPoId]);

  const applyPartner = (pt: any) => {
    const isFact = String(pt.partner_type || '').toUpperCase() === 'FACTORY';
    const nextPay = pt.payment_terms || (isFact ? '50_50' : '100_NET30');
    setForm((prev: any) => ({
      ...prev,
      supplier_code: pt.code || '',
      supplier_name: pt.name || '',
      po_category: isFact ? 'FACTORY' : 'TRADING',
      vendor_legal_name: pt.legal_name || pt.name || '',
      vendor_tax_code: pt.tax_code || '',
      vendor_address: pt.address || '',
      vendor_bank_account: pt.bank_account || '',
      vendor_bank_name: pt.bank_name || '',
      vendor_contact: pt.contact_info || '',
      contract_no: pt.contract_no || prev.contract_no,
      payment_mode: nextPay,
      deposit_pct: nextPay === '50_50' ? 50 : 0,
    }));
  };

  const searchSku = async (val: string) => {
    setSkuSearch(val);
    if (val.trim().length < 2) { setSkuResults([]); return; }
    try {
      const res = await apiGet<any[]>(`/api/master/products?q=${encodeURIComponent(val.trim())}&type=PRODUCT&limit=10`);
      setSkuResults(res);
    } catch { /* ignore */ }
  };

  const addSkuLine = (p: any) => {
    setForm((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_code: '',
          barcode: p.barcode || '',
          product_name: p.name_vn || '',
          image_url: Array.isArray(p.guide_images) && p.guide_images[0] ? p.guide_images[0] : '',
          unit: p.unit || 'Cái',
          qty: 1,
          unit_price: Number(p.cost_price) || 0,
          remark: '',
        },
      ],
    }));
    setSkuSearch('');
    setSkuResults([]);
  };

  const addEmptyLine = () => {
    setForm((prev: any) => ({
      ...prev,
      items: [
        ...prev.items,
        { product_code: '', barcode: '', product_name: '', image_url: '', unit: 'Cái', qty: 1, unit_price: 0, remark: '' },
      ],
    }));
  };

  const updateLine = (idx: number, patch: any) => {
    setForm((prev: any) => ({
      ...prev,
      items: prev.items.map((it: any, i: number) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const removeLine = (idx: number) => {
    setForm((prev: any) => ({
      ...prev,
      items: prev.items.filter((_: any, i: number) => i !== idx),
    }));
  };

  const subtotal = (form.items || []).reduce((acc: number, it: any) => acc + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const vatRate = Math.max(0, Number(form.vat_rate) || 0);
  const vatAmount = Math.round((subtotal * vatRate) / 100);
  const totalAfterVat = subtotal + vatAmount;
  const effectiveDepPct = form.payment_mode === '50_50' ? (Number(form.deposit_pct) || 50) : form.payment_mode === 'CUSTOM' ? (Number(form.deposit_pct) || 0) : 0;
  const depositAmount = effectiveDepPct > 0 ? Math.round((totalAfterVat * effectiveDepPct) / 100) : 0;
  const balanceAmount = totalAfterVat - depositAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier_name?.trim()) {
      onToast('Vui lòng chọn hoặc nhập Tên Nhà Cung Cấp!', 'err');
      return;
    }
    const validItems = (form.items || []).filter((it: any) => it.product_name?.trim() || it.barcode?.trim());
    if (validItems.length === 0) {
      onToast('Vui lòng thêm ít nhất 1 sản phẩm vào đơn PO!', 'err');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        items: validItems,
        bump_revision: isEdit ? bumpRevision : false,
      };
      const res = isEdit
        ? await apiSend(`/api/purchase-orders/${editingPoId}`, 'PUT', payload)
        : await apiSend('/api/purchase-orders', 'POST', payload);
      onToast(isEdit ? `Đã cập nhật ${res.po?.po_no || form.po_no}!` : `Đã tạo Đơn Đặt Hàng ${res.po?.po_no}!`);
      onSaved(res.po);
      onClose();
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-[#D6BCA5] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                {isEdit ? `Chỉnh sửa / Điều chỉnh ${form.po_no} (Rev v${form.revision_no || 1})` : 'Lập Đơn Đặt Hàng Nhà Cung Cấp (Purchase Order)'}
              </h3>
              <p className="text-[11px] text-[#D6BCA5]">Chuẩn biểu mẫu song ngữ benom — hỗ trợ cả PO Sản xuất (50/50) & PO Traffic (Net 30/COD).</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {loading ? (
            <div className="py-12 text-center text-[#6e5543]">Đang tải chi tiết Đơn Đặt Hàng...</div>
          ) : (
            <>
              {/* Row 1: PO Type, Code, Date, Contract */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DDD1]">
                <label className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-semibold text-[#6e5543]">Loại PO</span>
                  <select
                    value={form.po_category}
                    onChange={e => {
                      const cat = e.target.value as 'FACTORY' | 'TRADING';
                      setForm((prev: any) => ({
                        ...prev,
                        po_category: cat,
                        payment_mode: cat === 'FACTORY' ? '50_50' : '100_NET30',
                        deposit_pct: cat === 'FACTORY' ? 50 : 0,
                      }));
                    }}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white font-bold"
                  >
                    <option value="FACTORY">FACTORY (SX / Nội thất)</option>
                    <option value="TRADING">TRADING (Hàng Traffic)</option>
                  </select>
                </label>
                <label>
                  <span className="text-[10px] font-semibold text-[#6e5543]">Mã ĐH / PO NO.</span>
                  <input
                    required
                    value={form.po_no}
                    onChange={e => setForm({ ...form, po_no: e.target.value })}
                    placeholder="PO BN261128"
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] font-mono font-bold bg-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-semibold text-[#6e5543]">Ngày lập PO</span>
                  <input
                    type="date"
                    value={form.po_date}
                    onChange={e => setForm({ ...form, po_date: e.target.value })}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-semibold text-[#6e5543]">Số Hợp đồng / Contract</span>
                  <input
                    value={form.contract_no}
                    onChange={e => setForm({ ...form, contract_no: e.target.value })}
                    placeholder="VD: 01/2025/HĐMB/HD-KN"
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-semibold text-[#6e5543]">Trạng thái</span>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-white font-semibold"
                  >
                    {['Draft', 'Sent', 'Confirmed', 'Inspecting', 'Delivered', 'Completed', 'Cancelled'].map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Row 2: Vendor Details */}
              <div className="border border-[#E6DDD1] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#3B281A]">1. Thông tin Nhà Cung Cấp (Bên B / VENDOR)</div>
                  <select
                    value=""
                    onChange={e => {
                      const pt = partners.find(x => x.code === e.target.value);
                      if (pt) applyPartner(pt);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] text-xs font-semibold text-[#3B281A]"
                  >
                    <option value="">-- Chọn nhanh NCC có sẵn để tự điền --</option>
                    {partners.map(p => (
                      <option key={p.code} value={p.code}>
                        [{p.partner_type}] {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label>
                    <span className="text-[10px] text-[#6e5543] font-semibold">Tên thương hiệu NCC *</span>
                    <input
                      required
                      value={form.supplier_name}
                      onChange={e => setForm({ ...form, supplier_name: e.target.value })}
                      placeholder="VD: HIỂU ĐỨC"
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-bold"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[10px] text-[#6e5543] font-semibold">Tên pháp lý trên Hợp đồng / Hóa đơn VAT</span>
                    <input
                      value={form.vendor_legal_name}
                      onChange={e => setForm({ ...form, vendor_legal_name: e.target.value })}
                      placeholder="VD: CÔNG TY TNHH CHẾ BIẾN LÂM SẢN VÀ THƯƠNG MẠI HIỂU ĐỨC"
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-[#6e5543] font-semibold">Mã số thuế (MST)</span>
                    <input
                      value={form.vendor_tax_code}
                      onChange={e => setForm({ ...form, vendor_tax_code: e.target.value })}
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-mono"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-[#6e5543] font-semibold">Số tài khoản (STK)</span>
                    <input
                      value={form.vendor_bank_account}
                      onChange={e => setForm({ ...form, vendor_bank_account: e.target.value })}
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] font-mono"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-[#6e5543] font-semibold">Ngân hàng & Chi nhánh</span>
                    <input
                      value={form.vendor_bank_name}
                      onChange={e => setForm({ ...form, vendor_bank_name: e.target.value })}
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-[10px] text-[#6e5543] font-semibold">Địa chỉ NCC</span>
                    <input
                      value={form.vendor_address}
                      onChange={e => setForm({ ...form, vendor_address: e.target.value })}
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-[#6e5543] font-semibold">Email / SĐT đầu mối NCC</span>
                    <input
                      value={form.vendor_contact}
                      onChange={e => setForm({ ...form, vendor_contact: e.target.value })}
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                    />
                  </label>
                </div>
              </div>

              {/* Row 3: Delivery & Final Inspection */}
              <div className="border border-[#E6DDD1] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#3B281A]">2. Giao đến (SHIP TO)</span>
                    <div className="flex gap-1">
                      {(['3001', '9005', '1001'] as const).map(wh => (
                        <button
                          key={wh}
                          type="button"
                          onClick={() => setForm({ ...form, ship_to_warehouse: wh, ship_to_address: WAREHOUSE_ADDR[wh] })}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            form.ship_to_warehouse === wh ? 'bg-[#3B281A] text-white' : 'bg-[#EFE7DC] text-[#3B281A]'
                          }`}
                        >
                          Kho {wh}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    value={form.ship_to_address}
                    onChange={e => setForm({ ...form, ship_to_address: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                  />
                </div>
                <label className="sm:col-span-3">
                  <span className="font-bold text-[#3B281A]">Lịch giao (Delivery Date)</span>
                  <input
                    value={form.delivery_schedule}
                    onChange={e => setForm({ ...form, delivery_schedule: e.target.value })}
                    placeholder="VD: Đợt 1: 26/12 hoặc 15-20/01/2027"
                    className="w-full mt-1.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                  />
                </label>
                <label className="sm:col-span-3">
                  <span className="font-bold text-[#3B281A]">Ngày Kiểm hàng (Final Inspection)</span>
                  <input
                    type="date"
                    value={form.final_inspection_date || ''}
                    onChange={e => setForm({ ...form, final_inspection_date: e.target.value })}
                    className="w-full mt-1.5 px-2.5 py-1.5 rounded border border-[#D6BCA5]"
                  />
                </label>
              </div>

              {/* Row 4: Items */}
              <div className="border border-[#E6DDD1] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#3B281A]">3. Danh sách hàng đặt (Items)</div>
                  <button
                    type="button"
                    onClick={addEmptyLine}
                    className="px-2.5 py-1 rounded-lg border border-[#D6BCA5] text-[11px] font-semibold hover:bg-[#FAF7F2] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm dòng tự nhập
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#6e5543] absolute left-3 top-2.5" />
                  <input
                    value={skuSearch}
                    onChange={e => searchSku(e.target.value)}
                    placeholder="Tìm Barcode hoặc Tên SP để thêm vào PO (tự điền Giá vốn)..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D6BCA5] outline-none"
                  />
                  {skuResults.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-[#3B281A] rounded-lg shadow-xl z-20 max-h-52 overflow-y-auto divide-y divide-[#F0E8DE]">
                      {skuResults.map(p => (
                        <button
                          key={p.barcode}
                          type="button"
                          onClick={() => addSkuLine(p)}
                          className="w-full text-left px-3 py-2 hover:bg-[#FAF7F2] flex items-center justify-between cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-[#3B281A]">{p.name_vn}</div>
                            <div className="font-mono text-[10px] text-[#6e5543]">{p.barcode} • NCC: {p.supplier_name || '—'}</div>
                          </div>
                          <span className="font-bold text-[#224B85]">{fmtVnd(p.cost_price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto border border-[#E6DDD1] rounded-lg">
                  <table className="w-full text-left">
                    <thead className="bg-amber-100/70 text-[11px] text-[#3B281A]">
                      <tr>
                        <th className="p-2">Barcode</th>
                        <th className="p-2">Tên SP</th>
                        <th className="p-2 w-16 text-center">ĐVT</th>
                        <th className="p-2 w-16 text-center">SL</th>
                        <th className="p-2 w-28 text-right">Đơn giá (đ)</th>
                        <th className="p-2 w-28 text-right">Thành tiền</th>
                        <th className="p-2">Ghi chú (VD: 1 pcs/ctn)</th>
                        <th className="p-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0E8DE]">
                      {form.items.map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-1.5">
                            <input
                              value={it.barcode}
                              onChange={e => updateLine(idx, { barcode: e.target.value })}
                              className="w-28 px-1.5 py-1 rounded border border-[#D6BCA5] font-mono text-[11px]"
                            />
                          </td>
                          <td className="p-1.5 min-w-[180px]">
                            <input
                              value={it.product_name}
                              onChange={e => updateLine(idx, { product_name: e.target.value })}
                              className="w-full px-1.5 py-1 rounded border border-[#D6BCA5] font-semibold"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              value={it.unit}
                              onChange={e => updateLine(idx, { unit: e.target.value })}
                              className="w-14 px-1 py-1 rounded border border-[#D6BCA5] text-center"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={1}
                              value={it.qty}
                              onChange={e => updateLine(idx, { qty: Math.max(1, Number(e.target.value) || 1) })}
                              className="w-16 px-1 py-1 rounded border border-[#D6BCA5] text-center font-bold"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={it.unit_price}
                              onChange={e => updateLine(idx, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-28 px-1.5 py-1 rounded border border-[#D6BCA5] text-right font-mono font-semibold"
                            />
                          </td>
                          <td className="p-1.5 text-right font-mono font-bold text-[#3B281A]">
                            {fmtVnd((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                          </td>
                          <td className="p-1.5">
                            <input
                              value={it.remark || ''}
                              onChange={e => updateLine(idx, { remark: e.target.value })}
                              placeholder="Ghi chú..."
                              className="w-full px-1.5 py-1 rounded border border-[#D6BCA5]"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button type="button" onClick={() => removeLine(idx)} className="text-red-700 p-1 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Row 5: VAT, Payment Terms, Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 bg-[#FAF7F2] p-4 rounded-xl border border-[#E6DDD1]">
                <div className="sm:col-span-7 space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label>
                      <span className="text-[10px] font-semibold text-[#6e5543]">VAT (%)</span>
                      <select
                        value={form.vat_rate}
                        onChange={e => setForm({ ...form, vat_rate: Number(e.target.value) })}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-[#D6BCA5] bg-white font-bold"
                      >
                        <option value={8}>8% VAT</option>
                        <option value={10}>10% VAT</option>
                        <option value={0}>0% (Không VAT)</option>
                      </select>
                    </label>
                    <label>
                      <span className="text-[10px] font-semibold text-[#6e5543]">Điều khoản thanh toán</span>
                      <select
                        value={form.payment_mode}
                        onChange={e => {
                          const m = e.target.value;
                          setForm({ ...form, payment_mode: m, deposit_pct: m === '50_50' ? 50 : m === 'CUSTOM' ? 30 : 0 });
                        }}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-[#D6BCA5] bg-white font-semibold"
                      >
                        <option value="50_50">50% Cọc (10N) + 50% Net 30</option>
                        <option value="100_NET30">100% Net 30 (Traffic/Trading)</option>
                        <option value="100_COD">100% COD khi nhận hàng</option>
                        <option value="CONSIGNMENT">Ký gửi (Đối soát cuối tháng)</option>
                        <option value="CUSTOM">Tùy chỉnh % cọc</option>
                      </select>
                    </label>
                    {form.payment_mode === 'CUSTOM' && (
                      <label>
                        <span className="text-[10px] font-semibold text-[#6e5543]">% Cọc Đợt 1</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={form.deposit_pct}
                          onChange={e => setForm({ ...form, deposit_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                          className="w-full mt-0.5 px-2 py-1.5 rounded border border-[#D6BCA5] bg-white font-bold"
                        />
                      </label>
                    )}
                  </div>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-[#6e5543]">Ghi chú thêm trên PO</span>
                    <input
                      value={form.notes || ''}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder="VD: Kiểm hàng trước xuất 1-2 ngày, đổi quy cách đóng gói..."
                      className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#D6BCA5] bg-white"
                    />
                  </label>
                  {isEdit && (
                    <label className="flex items-center gap-2 font-semibold text-[#3B281A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bumpRevision}
                        onChange={e => setBumpRevision(e.target.checked)}
                        className="accent-[#3B281A]"
                      />
                      Tăng phiên bản điều chỉnh PO (Rev v{(Number(form.revision_no) || 1) + 1})
                    </label>
                  )}
                </div>

                <div className="sm:col-span-5 bg-white rounded-xl border border-[#D6BCA5] p-3.5 space-y-1.5">
                  <div className="flex justify-between"><span>Tổng trước thuế:</span><strong className="font-mono">{fmtVnd(subtotal)}</strong></div>
                  <div className="flex justify-between text-[#9A2B26]"><span>Thuế VAT ({vatRate}%):</span><strong className="font-mono">{fmtVnd(vatAmount)}</strong></div>
                  <div className="flex justify-between text-sm font-extrabold text-[#3B281A] pt-1 border-t border-[#EFE7DC]">
                    <span>Tổng sau VAT:</span><span className="font-mono">{fmtVnd(totalAfterVat)}</span>
                  </div>
                  {depositAmount > 0 ? (
                    <div className="text-[11px] text-[#6e5543] pt-1 space-y-0.5">
                      <div className="flex justify-between"><span>• Đợt 1 ({effectiveDepPct}%):</span><strong className="font-mono">{fmtVnd(depositAmount)}</strong></div>
                      <div className="flex justify-between"><span>• Đợt 2 ({100 - effectiveDepPct}%):</span><strong className="font-mono">{fmtVnd(balanceAmount)}</strong></div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#6e5543] pt-1">
                      Thanh toán Đợt 2 / Net 30: <strong className="font-mono">{fmtVnd(balanceAmount)}</strong>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs cursor-pointer">
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving || loading}
            className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi PO' : 'Tạo Đơn Đặt Hàng (PO)'}
          </button>
        </div>
      </form>
    </div>
  );
}
