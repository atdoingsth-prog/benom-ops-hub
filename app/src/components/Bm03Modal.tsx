import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eraser, Printer, Trash2, X } from 'lucide-react';
import { apiGet, apiSend } from '../api';
import { compressImageFile } from '../utils/imageCompress';

const DAMAGE_OPTIONS = [
  'Gãy/nứt khung chịu lực',
  'Biến dạng khung/mối hàn',
  'Mút lún >20%, đứt lò xo',
  'Nứt vỡ mặt gỗ/đá/gương',
  'Cong vênh/bong keo gỗ',
];

interface Props {
  initial?: any; // existing record (with id) or prefill object (without id)
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onPrint: (doc: any) => void;
}

export default function Bm03Modal({ initial, readOnly = false, onClose, onSaved, onPrint }: Props) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    doc_date: initial?.doc_date || new Date().toISOString().slice(0, 10),
    ticket_id: initial?.ticket_id || null,
    ticket_no: initial?.ticket_no || '',
    invoice_no: initial?.invoice_no || '',
    handover_no: initial?.handover_no || '',
    location: initial?.location || 'Nhà khách hàng',
    tech_name: initial?.tech_name || 'Trần Anh Tuyến',
    wh_rep: initial?.wh_rep || '',
    customer_name: initial?.customer_name || '',
    customer_phone: initial?.customer_phone || '',
    barcode: initial?.barcode || '',
    product_name: initial?.product_name || '',
    qty: initial?.qty || 1,
    receive_date: initial?.receive_date || '',
    packaging_state: initial?.packaging_state || 'Bao bì gốc',
    damage_types: (() => {
      try {
        const arr = JSON.parse(initial?.damage_types_json || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })() as string[],
    damage_other: initial?.damage_other || '',
    root_cause: initial?.root_cause || 'Lỗi NSX/NCC',
    customer_resolution: initial?.customer_resolution || 'Đổi mới 1-1',
    replacement_code: initial?.replacement_code || '',
    appointment_date: initial?.appointment_date || '',
    refund_amount: initial?.refund_amount || 0,
    warehouse_disposition: initial?.warehouse_disposition || 'Nhập DC 9005 claim NCC',
    inv_adj_code: initial?.inv_adj_code || '',
    status: initial?.status || 'Open',
  });

  const [photos, setPhotos] = useState<string[]>([]);
  const [sigUrl, setSigUrl] = useState<string>(initial?.signature_data || '');
  const [hasSig, setHasSig] = useState(Boolean(initial?.signature_data || initial?.has_signature));
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (isEdit && initial.signature_data === undefined) {
      setLoading(true);
      apiGet(`/api/bm03/${initial.id}`)
        .then(full => {
          setSigUrl(full.signature_data || '');
          setHasSig(Boolean(full.signature_data));
          try {
            const parsed = JSON.parse(full.photos_json || '[]');
            if (Array.isArray(parsed)) setPhotos(parsed);
          } catch { /* ignore */ }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isEdit, initial?.id]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    if (sigUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = sigUrl;
    }
  }, [sigUrl]);

  const toggleDamage = (opt: string) => {
    if (readOnly) return;
    setForm(prev => ({
      ...prev,
      damage_types: prev.damage_types.includes(opt)
        ? prev.damage_types.filter(x => x !== opt)
        : [...prev.damage_types, opt],
    }));
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !canvasRef.current) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    setHasSig(true);
    const ctx = canvasRef.current.getContext('2d')!;
    const p = getPos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f1610';
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const onUp = () => { drawing.current = false; };
  const clearSig = () => {
    if (readOnly || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSig(false); setSigUrl('');
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    e.target.value = '';
    if (!files.length) return;
    setCompressing(true);
    try {
      const comp = await Promise.all(files.map(f => compressImageFile(f, 1280, 0.72)));
      setPhotos(prev => [...prev, ...comp].slice(-4));
    } finally {
      setCompressing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const sigData = hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : '';
      const payload = {
        ...form,
        photos_json: JSON.stringify(photos),
        signature_data: sigData,
      };
      if (isEdit) {
        await apiSend(`/api/bm03/${initial.id}`, 'PUT', payload);
      } else {
        await apiSend('/api/bm03', 'POST', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Lỗi lưu BM-03');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[93vh] flex flex-col overflow-hidden border border-[#E6DDD1]">
        <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#D6BCA5]">BM-03/SOP-CS-04 • Cấp độ 3</div>
            <div className="font-bold text-base">
              Biên Bản Kiểm Định Kỹ Thuật & Thu Hồi {initial?.doc_no ? `• ${initial.doc_no}` : '(Mới)'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                type="button"
                onClick={() => onPrint({
                  ...initial,
                  ...form,
                  damage_types_json: JSON.stringify(form.damage_types),
                  signature_data: hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : sigUrl,
                })}
                className="px-3 py-1.5 rounded-lg bg-[#563C28] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> In A4
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/15 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {loading && <div className="p-2 rounded bg-[#F8F4EC] text-[#6e5543]">Đang tải ảnh & chữ ký...</div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-[#6e5543]">Ngày lập</label>
              <input disabled={readOnly} type="date" value={form.doc_date} onChange={e => setForm({ ...form, doc_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Mã Ticket BM-02</label>
              <input disabled={readOnly} value={form.ticket_no} onChange={e => setForm({ ...form, ticket_no: e.target.value })} placeholder="TK-..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Mã đơn hàng gốc</label>
              <input disabled={readOnly} value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Địa điểm kiểm định</label>
              <select disabled={readOnly} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                <option value="Nhà khách hàng">Nhà khách hàng</option>
                <option value="Store 3001">Store 3001</option>
                <option value="Kho DC 9005">Kho DC 9005</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Kỹ thuật kiểm định</label>
              <input disabled={readOnly} value={form.tech_name} onChange={e => setForm({ ...form, tech_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Trạng thái</label>
              <select disabled={readOnly} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold">
                <option value="Open">Open (Chờ duyệt SCM)</option>
                <option value="Approved">Approved (Đã duyệt thu hồi)</option>
                <option value="Closed">Closed (Đã điều chỉnh ERP)</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Khách hàng *</label>
              <input disabled={readOnly} required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">SĐT khách hàng</label>
              <input disabled={readOnly} value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Đóng gói thu hồi</label>
              <select disabled={readOnly} value={form.packaging_state} onChange={e => setForm({ ...form, packaging_state: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                <option value="Bao bì gốc">Bao bì gốc</option>
                <option value="Bọc màng PE">Bọc màng PE / Chống sốc</option>
              </select>
            </div>
          </div>

          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DDD1] grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-4">
              <label className="font-semibold text-[#6e5543]">Barcode</label>
              <input disabled={readOnly} value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg bg-white font-mono" />
            </div>
            <div className="sm:col-span-6">
              <label className="font-semibold text-[#6e5543]">Tên sản phẩm thu hồi *</label>
              <input disabled={readOnly} required value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg bg-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="font-semibold text-[#6e5543]">SL</label>
              <input disabled={readOnly} type="number" min={1} value={form.qty} onChange={e => setForm({ ...form, qty: Number(e.target.value) || 1 })} className="w-full mt-1 px-2 py-1.5 border border-[#D6BCA5] rounded-lg bg-white text-center font-bold" />
            </div>
          </div>

          {/* III. Kết quả kiểm định */}
          <div className="space-y-2">
            <div className="font-bold text-[#3B281A]">III. Hiện trạng hư hỏng & Nguyên nhân</div>
            <div className="flex flex-wrap gap-2">
              {DAMAGE_OPTIONS.map(opt => (
                <label key={opt} className={`px-2.5 py-1.5 rounded-lg border cursor-pointer flex items-center gap-1.5 ${form.damage_types.includes(opt) ? 'bg-red-50 border-[#9A2B26] text-[#9A2B26] font-semibold' : 'bg-white border-[#D6BCA5]'}`}>
                  <input disabled={readOnly} type="checkbox" checked={form.damage_types.includes(opt)} onChange={() => toggleDamage(opt)} className="accent-[#9A2B26]" />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#6e5543]">Mô tả chi tiết / Khác</label>
                <input disabled={readOnly} value={form.damage_other} onChange={e => setForm({ ...form, damage_other: e.target.value })} placeholder="Ghi rõ vị trí nứt/gãy..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Xác định nguyên nhân</label>
                <select disabled={readOnly} value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold">
                  <option value="Lỗi NSX/NCC">Lỗi NSX/NCC (vật liệu, keo dán, cơ khí)</option>
                  <option value="Lỗi vận chuyển">Lỗi vận chuyển</option>
                  <option value="Lỗi lắp ráp">Lỗi lắp ráp</option>
                  <option value="Lỗi sử dụng/ngoại cảnh">Lỗi sử dụng / ngoại cảnh</option>
                </select>
              </div>
            </div>
          </div>

          {/* IV. Quyết định xử lý */}
          <div className="bg-[#F8F4EC] p-3.5 rounded-xl border border-[#D6BCA5] space-y-3">
            <div className="font-bold text-[#3B281A]">IV. Phương án xử lý Khách hàng & Kho DC 9005</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#6e5543]">Hướng xử lý với Khách hàng</label>
                <select disabled={readOnly} value={form.customer_resolution} onChange={e => setForm({ ...form, customer_resolution: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                  <option value="Đổi mới 1-1">Đổi mới 1-1</option>
                  <option value="Đổi model tương đương">Đổi model tương đương</option>
                  <option value="Hoàn tiền">Hoàn tiền</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Quản trị kho DC 9005</label>
                <select disabled={readOnly} value={form.warehouse_disposition} onChange={e => setForm({ ...form, warehouse_disposition: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                  <option value="Nhập DC 9005 claim NCC">Nhập DC 9005 claim NCC</option>
                  <option value="Nhập 9005 gia công B-grade">Nhập 9005 gia công B-grade</option>
                  <option value="Hủy bỏ">Hủy bỏ</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Mã đổi mới / Ngày hẹn</label>
                <input disabled={readOnly} value={form.replacement_code} onChange={e => setForm({ ...form, replacement_code: e.target.value })} placeholder="Mã SKU mới / ngày giao..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Mã Inventory Adjustment (ERP)</label>
                <input disabled={readOnly} value={form.inv_adj_code} onChange={e => setForm({ ...form, inv_adj_code: e.target.value })} placeholder="Mã điều chỉnh tồn kho..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-mono" />
              </div>
            </div>
          </div>

          {/* Photos & Signature */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-[#3B281A]">Ảnh kiểm định ({photos.length}/4)</span>
              {!readOnly && (
                <label className="px-2.5 py-1 rounded-lg bg-[#F8F4EC] border border-[#D6BCA5] font-semibold cursor-pointer flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> {compressing ? 'Đang nén...' : 'Chụp / Tải ảnh'}
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPhoto} />
                </label>
              )}
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt={`BM03-${i}`} className="w-full h-20 object-cover rounded-lg border border-[#D6BCA5]" />
                    {!readOnly && (
                      <button type="button" onClick={() => setPhotos(p => p.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 rounded-full bg-black/65 text-white cursor-pointer">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-[#3B281A]">Chữ ký Khách hàng / Người bàn giao</span>
              {!readOnly && (
                <button type="button" onClick={clearSig} className="text-[#9A2B26] flex items-center gap-1 hover:underline cursor-pointer">
                  <Eraser className="w-3.5 h-3.5" /> Ký lại
                </button>
              )}
            </div>
            <canvas
              ref={canvasRef}
              width={560}
              height={130}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="w-full h-28 border-2 border-dashed border-[#D6BCA5] rounded-xl bg-white touch-none cursor-crosshair"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Đóng</button>
          {!readOnly && (
            <button disabled={saving || compressing} type="submit" className="px-5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              <CheckCircle2 className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu Biên bản BM-03'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
