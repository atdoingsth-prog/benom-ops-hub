import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eraser, Printer, Star, X } from 'lucide-react';
import { apiGet, apiSend } from '../api';
import KtvListPicker, { KtvEntry, StaffItem } from './KtvListPicker';

interface Props {
  handover: any;
  staffList?: StaffItem[];
  onStaffAdded?: (s: StaffItem) => void;
  onClose: () => void;
  onSaved: () => void;
  onPrint: (h: any) => void;
}

function initKtvsFromHandover(h: any): KtvEntry[] {
  if (Array.isArray(h.ktvs) && h.ktvs.length > 0) {
    return h.ktvs.map((k: any) => ({ code: k.code || '', name: k.name || '' })).filter((k: KtvEntry) => k.name || k.code);
  }
  const out: KtvEntry[] = [];
  if (h.ktv1_name || h.ktv1_code) out.push({ code: h.ktv1_code || '', name: h.ktv1_name || '' });
  if (h.ktv2_name || h.ktv2_code) out.push({ code: h.ktv2_code || '', name: h.ktv2_name || '' });
  return out;
}

export default function HandoverModal({ handover, staffList, onStaffAdded, onClose, onSaved, onPrint }: Props) {
  const [staff, setStaff] = useState<StaffItem[]>(staffList || []);
  const [ktvs, setKtvs] = useState<KtvEntry[]>(() => initKtvsFromHandover(handover));
  const [form, setForm] = useState({
    handover_date: handover.handover_date || new Date().toISOString().slice(0, 10),
    driver_name: handover.driver_name || '',
    driver_phone: handover.driver_phone || '',
    vehicle_plate: handover.vehicle_plate || '',
    install_mode: handover.install_mode || (handover.doc_type === 'BM-05' ? 'Khách hàng tự lắp đặt' : 'Kỹ thuật Benom lắp đặt'),
    check_1: Boolean(handover.check_1 ?? 1),
    check_2: Boolean(handover.check_2 ?? 1),
    check_3: Boolean(handover.check_3 ?? 1),
    check_4: Boolean(handover.check_4 ?? 1),
    issue_note: handover.issue_note || '',
    csat_rating: handover.csat_rating || 5,
    csat_comment: handover.csat_comment || '',
    status: handover.status || 'Pending',
  });
  const [photos, setPhotos] = useState<string[]>(() => {
    try { return JSON.parse(handover.photos_json || '[]'); } catch { return []; }
  });
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(Boolean(handover.signature_data));

  useEffect(() => {
    if (!staffList || staffList.length === 0) {
      apiGet('/api/master/lookups').then(res => setStaff(res.staff || [])).catch(() => {});
    } else {
      setStaff(staffList);
    }
  }, [staffList]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (handover.signature_data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = handover.signature_data;
    }
  }, [handover.signature_data]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    setHasSig(true);
    const ctx = canvas.getContext('2d')!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f1610';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    drawing.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotos(prev => [...prev.slice(-3), reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSave = async (markCompleted: boolean) => {
    setSaving(true);
    try {
      const sigData = hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : '';
      const payload = {
        ...form,
        ktvs,
        ktv1_code: ktvs[0]?.code || '',
        ktv1_name: ktvs[0]?.name || '',
        ktv2_code: ktvs[1]?.code || '',
        ktv2_name: ktvs[1]?.name || '',
        status: markCompleted ? 'Completed' : form.status,
        signature_data: sigData,
        photos_json: JSON.stringify(photos),
      };
      await apiSend(`/api/handovers/${handover.id}`, 'PUT', payload);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden border border-[#E6DDD1]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#D6BCA5]">
              {handover.doc_type === 'BM-05' ? 'Phiếu Giao Hàng (BM-05)' : 'Biên Bản Giao Nhận & Lắp Đặt (BM-01)'}
            </div>
            <div className="text-lg font-bold">{handover.doc_no} • ĐH {handover.invoice_no}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPrint({
                ...handover,
                ...form,
                ktvs,
                ktv1_code: ktvs[0]?.code || '',
                ktv1_name: ktvs[0]?.name || '',
                ktv2_code: ktvs[1]?.code || '',
                ktv2_name: ktvs[1]?.name || '',
                signature_data: hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : handover.signature_data,
              })}
              className="px-3 py-1.5 rounded-lg bg-[#563C28] text-xs font-medium flex items-center gap-1 hover:bg-[#6a4b33] cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> In PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Customer summary */}
          <div className="bg-[#F8F4EC] p-3.5 rounded-xl border border-[#E6DDD1]">
            <div className="font-semibold text-[#3B281A]">{handover.customer_name} — {handover.customer_phone}</div>
            <div className="text-xs text-[#6e5543] mt-0.5">{handover.address}</div>
            {handover.items?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#E6DDD1] space-y-1 text-xs">
                {handover.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span>• {it.product_name}</span>
                    <span className="font-semibold">SL: {it.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date & Install Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#6e5543] mb-1">Ngày bàn giao</label>
              <input
                type="date"
                value={form.handover_date}
                onChange={e => setForm({ ...form, handover_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#6e5543] mb-1">Hình thức lắp đặt</label>
              <select
                value={form.install_mode}
                onChange={e => setForm({ ...form, install_mode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm bg-white"
              >
                <option value="Kỹ thuật Benom lắp đặt">Kỹ thuật Benom lắp đặt</option>
                <option value="Khách hàng tự lắp đặt">Khách hàng tự lắp đặt</option>
                <option value="Hẹn kỹ thuật Benom lắp sau">Hẹn kỹ thuật Benom lắp sau (Tự tạo BM-01)</option>
              </select>
            </div>
          </div>

          {/* Auto-expanding KTV Dropdown Picker (ID + Name, unlimited KTVs) */}
          <KtvListPicker
            staff={staff}
            value={ktvs}
            onChange={setKtvs}
            onStaffAdded={s => {
              setStaff(prev => [...prev.filter(x => x.emp_code !== s.emp_code), s].sort((a, b) => a.emp_code.localeCompare(b.emp_code)));
              if (onStaffAdded) onStaffAdded(s);
            }}
          />

          {/* 4-point checklist */}
          <div className="space-y-2">
            <div className="font-semibold text-[#3B281A]">Checklist nghiệm thu 4 điểm</div>
            {[
              ['check_1', '1. Đúng mẫu mã, kích thước, màu sắc và đủ số lượng'],
              ['check_2', '2. Ngoại quan nguyên vẹn, không trầy xước / móp méo'],
              ['check_3', '3. Lắp đặt chắc chắn, cân bằng, vận hành trơn tru'],
              ['check_4', '4. Đã vệ sinh khu vực lắp & hướng dẫn sử dụng / HDBQ'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E6DDD1] hover:bg-[#F8F4EC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-[#234E36]"
                />
                <span className="text-xs sm:text-sm">{label}</span>
              </label>
            ))}
          </div>

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-[#3B281A]">Ảnh nghiệm thu hiện trường</span>
              <label className="px-3 py-1.5 rounded-lg bg-[#F8F4EC] border border-[#D6BCA5] text-xs font-semibold text-[#3B281A] flex items-center gap-1.5 cursor-pointer hover:bg-[#efe6d8]">
                <Camera className="w-3.5 h-3.5" /> Chụp / Tải ảnh
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt="Nghiệm thu" className="w-full h-20 object-cover rounded-lg border border-[#D6BCA5]" />
                ))}
              </div>
            )}
          </div>

          {/* CSAT 1-5 stars */}
          <div className="bg-[#F8F4EC] p-4 rounded-xl border border-[#D6BCA5]">
            <div className="font-semibold text-[#3B281A] mb-2">Khách hàng đánh giá dịch vụ giao lắp (CSAT)</div>
            <div className="flex items-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setForm({ ...form, csat_rating: star })}
                  className="p-1 cursor-pointer transition-transform hover:scale-110"
                >
                  <Star className={`w-7 h-7 ${star <= form.csat_rating ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                </button>
              ))}
              <span className="text-xs font-semibold text-[#3B281A] ml-2">{form.csat_rating}/5 sao</span>
            </div>
            <input
              value={form.csat_comment}
              onChange={e => setForm({ ...form, csat_comment: e.target.value })}
              placeholder="Góp ý nhanh của khách hàng (tùy chọn)..."
              className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs"
            />
          </div>

          {/* Signature Pad */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-[#3B281A]">Chữ ký điện tử khách hàng</span>
              <button type="button" onClick={clearSignature} className="text-xs text-[#9A2B26] flex items-center gap-1 hover:underline cursor-pointer">
                <Eraser className="w-3.5 h-3.5" /> Ký lại
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={560}
              height={160}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="w-full h-36 border-2 border-dashed border-[#D6BCA5] rounded-xl bg-white touch-none cursor-crosshair"
            />
            <div className="text-[11px] text-[#6e5543] mt-1">Ký trực tiếp bằng tay (trên điện thoại/tablet) hoặc chuột.</div>
          </div>

          {/* Issue note */}
          <div>
            <label className="block text-xs font-semibold text-[#6e5543] mb-1">Ghi chú phát sinh / tồn đọng (nếu có)</label>
            <input
              value={form.issue_note}
              onChange={e => setForm({ ...form, issue_note: e.target.value })}
              placeholder="VD: Thiếu 1 nút bọc chân ghế, hẹn bổ sung..."
              className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#F8F4EC] border-t border-[#E6DDD1] flex items-center justify-end gap-2.5">
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            className="px-4 py-2 rounded-lg border border-[#3B281A] text-[#3B281A] font-semibold text-xs hover:bg-[#efe6d8] cursor-pointer"
          >
            Lưu nháp
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            className="px-4 py-2 rounded-lg bg-[#234E36] text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-[#1c3e2b] cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" /> Hoàn tất & Tự động đồng bộ ĐH
          </button>
        </div>
      </div>
    </div>
  );
}
