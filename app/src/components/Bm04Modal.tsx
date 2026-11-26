import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eraser, Plus, Printer, Trash2, X } from 'lucide-react';
import { apiGet, apiSend } from '../api';
import { compressImageFile } from '../utils/imageCompress';

const PKG_CHECKS = [
  'Rách/móp góc thùng',
  'Đứt băng keo niêm phong',
  'Ướt nước/dính bẩn',
  'Giao thiếu kiện',
  'Rơi vỡ khi bốc dỡ',
];

const EVIDENCE_CHECKS = [
  'Ảnh xe / biển số',
  'Ảnh bao bì bên ngoài',
  'Ảnh / video cận cảnh lỗi',
  'AWB có ghi chú lỗi',
];

interface Props {
  initial?: any;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onPrint: (doc: any) => void;
}

export default function Bm04Modal({ initial, readOnly = false, onClose, onSaved, onPrint }: Props) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    doc_date: initial?.doc_date || new Date().toISOString().slice(0, 10),
    location: initial?.location || 'Kho DC 9005',
    ticket_id: initial?.ticket_id || null,
    ticket_no: initial?.ticket_no || '',
    invoice_no: initial?.invoice_no || '',
    carrier: initial?.carrier || 'Ahamove',
    awb_no: initial?.awb_no || '',
    route: initial?.route || 'DC 9005 → Khách hàng HCM',
    vehicle_plate: initial?.vehicle_plate || '',
    driver_name: initial?.driver_name || '',
    driver_phone: initial?.driver_phone || '',
    driver_cccd: initial?.driver_cccd || '',
    packaging_checks: (() => {
      try { const a = JSON.parse(initial?.packaging_checks_json || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
    })() as string[],
    evidence_checks: (() => {
      try { const a = JSON.parse(initial?.evidence_checks_json || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
    })() as string[],
    cause_assessment: initial?.cause_assessment || 'Chằng buộc sai quy cách/va đập',
    items: (() => {
      try {
        const a = JSON.parse(initial?.items_json || '[]');
        if (Array.isArray(a) && a.length > 0) return a;
      } catch { /* fallback */ }
      if (initial?.product_name) {
        return [{ barcode: initial.barcode || '', product_name: initial.product_name, qty_delivered: 1, qty_damaged: 1, damage_pct: 100, damage_desc: initial.issue_desc || '' }];
      }
      return [{ barcode: '', product_name: '', qty_delivered: 1, qty_damaged: 1, damage_pct: 100, damage_desc: '' }];
    })() as any[],
    goods_disposition: initial?.goods_disposition || 'Tạm giữ tại DC 9005 cách ly',
    claim_amount: initial?.claim_amount || 0,
    claim_status: initial?.claim_status || 'Open',
    notes: initial?.notes || '',
  });

  const [photos, setPhotos] = useState<string[]>([]);
  const [sigUrl, setSigUrl] = useState<string>(initial?.driver_signature_data || '');
  const [hasSig, setHasSig] = useState(Boolean(initial?.driver_signature_data || initial?.has_signature));
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (isEdit && initial.driver_signature_data === undefined) {
      setLoading(true);
      apiGet(`/api/bm04/${initial.id}`)
        .then(full => {
          setSigUrl(full.driver_signature_data || '');
          setHasSig(Boolean(full.driver_signature_data));
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

  const toggleArr = (field: 'packaging_checks' | 'evidence_checks', opt: string) => {
    if (readOnly) return;
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(opt) ? prev[field].filter(x => x !== opt) : [...prev[field], opt],
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
        driver_signature_data: sigData,
      };
      if (isEdit) {
        await apiSend(`/api/bm04/${initial.id}`, 'PUT', payload);
      } else {
        await apiSend('/api/bm04', 'POST', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Lỗi lưu BM-04');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[93vh] flex flex-col overflow-hidden border border-[#E6DDD1]">
        <div className="px-5 py-3.5 bg-[#9A2B26] text-white flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-red-100">BM-04/SOP-SCM-03 • Claim Đền Bù 3PL (SLA 48h)</div>
            <div className="font-bold text-base">
              Biên Bản Sự Cố Giao Nhận Hàng Hóa {initial?.doc_no ? `• ${initial.doc_no}` : '(Mới)'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                type="button"
                onClick={() => onPrint({
                  ...initial,
                  ...form,
                  packaging_checks_json: JSON.stringify(form.packaging_checks),
                  evidence_checks_json: JSON.stringify(form.evidence_checks),
                  items_json: JSON.stringify(form.items),
                  driver_signature_data: hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : sigUrl,
                })}
                className="px-3 py-1.5 rounded-lg bg-white/20 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> In A4
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/15 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {loading && <div className="p-2 rounded bg-[#F8F4EC] text-[#6e5543]">Đang tải ảnh bằng chứng & chữ ký tài xế...</div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-[#6e5543]">Ngày lập</label>
              <input disabled={readOnly} type="date" value={form.doc_date} onChange={e => setForm({ ...form, doc_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Đơn vị vận chuyển *</label>
              <select disabled={readOnly} value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold">
                <option value="Ahamove">Ahamove</option>
                <option value="Xanh SM">Xanh SM</option>
                <option value="Sagawa">Sagawa</option>
                <option value="247 Express">247 Express</option>
                <option value="Nhất Tín Logistics">Nhất Tín Logistics</option>
                <option value="Chành xe / Khác">Chành xe / Khác</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Địa điểm lập biên bản</label>
              <select disabled={readOnly} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                <option value="Kho DC 9005">Kho DC 9005</option>
                <option value="Store 3001">Store 3001</option>
                <option value="Địa chỉ giao hàng">Địa chỉ giao hàng</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Mã đơn Benom</label>
              <input disabled={readOnly} value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Mã vận đơn (AWB / Chuyến)</label>
              <input disabled={readOnly} value={form.awb_no} onChange={e => setForm({ ...form, awb_no: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Biển số xe</label>
              <input disabled={readOnly} value={form.vehicle_plate} onChange={e => setForm({ ...form, vehicle_plate: e.target.value })} placeholder="51C-..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Tên tài xế</label>
              <input disabled={readOnly} value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">SĐT tài xế</label>
              <input disabled={readOnly} value={form.driver_phone} onChange={e => setForm({ ...form, driver_phone: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">CCCD tài xế</label>
              <input disabled={readOnly} value={form.driver_cccd} onChange={e => setForm({ ...form, driver_cccd: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
            </div>
          </div>

          {/* Bao bì & Bằng chứng */}
          <div className="space-y-2">
            <div className="font-bold text-[#3B281A]">II. Ngoại quan bao bì & Bằng chứng Claim</div>
            <div className="flex flex-wrap gap-1.5">
              {PKG_CHECKS.map(opt => (
                <label key={opt} className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center gap-1 ${form.packaging_checks.includes(opt) ? 'bg-red-50 border-[#9A2B26] text-[#9A2B26] font-semibold' : 'bg-white border-[#D6BCA5]'}`}>
                  <input disabled={readOnly} type="checkbox" checked={form.packaging_checks.includes(opt)} onChange={() => toggleArr('packaging_checks', opt)} className="accent-[#9A2B26]" />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EVIDENCE_CHECKS.map(opt => (
                <label key={opt} className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center gap-1 ${form.evidence_checks.includes(opt) ? 'bg-blue-50 border-[#224B85] text-[#224B85] font-semibold' : 'bg-white border-[#D6BCA5]'}`}>
                  <input disabled={readOnly} type="checkbox" checked={form.evidence_checks.includes(opt)} onChange={() => toggleArr('evidence_checks', opt)} className="accent-[#224B85]" />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Bảng kê hàng tổn thất */}
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DDD1] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#3B281A]">Bảng kê hàng hóa hư hỏng / tổn thất</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, items: [...p.items, { barcode: '', product_name: '', qty_delivered: 1, qty_damaged: 1, damage_pct: 100, damage_desc: '' }] }))}
                  className="text-[#224B85] font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm dòng
                </button>
              )}
            </div>
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                <input disabled={readOnly} placeholder="Tên sản phẩm" value={it.product_name} onChange={e => { const a = [...form.items]; a[idx].product_name = e.target.value; setForm({ ...form, items: a }); }} className="col-span-4 px-2 py-1.5 border border-[#D6BCA5] rounded bg-white" />
                <input disabled={readOnly} placeholder="Mô tả tổn thất (trầy/gãy/rách nỉ...)" value={it.damage_desc} onChange={e => { const a = [...form.items]; a[idx].damage_desc = e.target.value; setForm({ ...form, items: a }); }} className="col-span-5 px-2 py-1.5 border border-[#D6BCA5] rounded bg-white" />
                <input disabled={readOnly} type="number" min={1} title="SL hỏng" value={it.qty_damaged} onChange={e => { const a = [...form.items]; a[idx].qty_damaged = Number(e.target.value) || 1; setForm({ ...form, items: a }); }} className="col-span-2 px-1.5 py-1.5 border border-[#D6BCA5] rounded bg-white text-center font-bold text-[#9A2B26]" />
                {!readOnly && (
                  <button type="button" onClick={() => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))} className="col-span-1 flex justify-center text-[#9A2B26] cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Claim & Đền bù */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#F8F4EC] p-3.5 rounded-xl border border-[#D6BCA5]">
            <div>
              <label className="font-semibold text-[#6e5543]">Giá trị yêu cầu đền bù (VNĐ)</label>
              <input disabled={readOnly} type="number" min={0} value={form.claim_amount} onChange={e => setForm({ ...form, claim_amount: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-bold text-[#9A2B26]" />
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Trạng thái Claim 3PL</label>
              <select disabled={readOnly} value={form.claim_status} onChange={e => setForm({ ...form, claim_status: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold">
                <option value="Open">Mới lập (Hạn 48h)</option>
                <option value="Claim Sent">Đã gửi hồ sơ Claim</option>
                <option value="Compensated">3PL đã đền bù xong</option>
                <option value="Rejected">Từ chối / Tự xử lý</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#6e5543]">Tình trạng hàng hỏng</label>
              <select disabled={readOnly} value={form.goods_disposition} onChange={e => setForm({ ...form, goods_disposition: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                <option value="Tạm giữ tại DC 9005 cách ly">Tạm giữ DC 9005 cách ly</option>
                <option value="Bàn giao tài xế mang về kho ĐVVC">Bàn giao tài xế mang về kho ĐVVC</option>
              </select>
            </div>
          </div>

          {/* Photos & Driver Signature */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-[#3B281A]">Ảnh hiện trường & AWB ({photos.length}/4)</span>
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
                    <img src={src} alt={`BM04-${i}`} className="w-full h-20 object-cover rounded-lg border border-[#D6BCA5]" />
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
              <span className="font-bold text-[#3B281A]">Chữ ký xác nhận của Tài xế / ĐVVC ngay tại hiện trường</span>
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
              className="w-full h-28 border-2 border-dashed border-[#9A2B26]/50 rounded-xl bg-white touch-none cursor-crosshair"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Đóng</button>
          {!readOnly && (
            <button disabled={saving || compressing} type="submit" className="px-5 py-2 rounded-lg bg-[#9A2B26] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
              <CheckCircle2 className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu Biên bản Sự cố BM-04'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
