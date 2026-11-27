import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Camera, CheckCircle2, Eraser, MapPin, Phone, Printer, Star, Trash2, X } from 'lucide-react';
import { apiGet, apiSend } from '../api';
import { compressImageFile } from '../utils/imageCompress';
import KtvListPicker, { KtvEntry, StaffItem } from './KtvListPicker';

interface Props {
  handover: any;
  staffList?: StaffItem[];
  readOnly?: boolean;
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

export default function HandoverModal({ handover, staffList, readOnly = false, onStaffAdded, onClose, onSaved, onPrint }: Props) {
  const initialInstallMode = handover.install_mode || (handover.doc_type === 'BM-05' ? 'Khách hàng tự lắp đặt' : 'Kỹ thuật Benom lắp đặt');
  const [staff, setStaff] = useState<StaffItem[]>(staffList || []);
  const [ktvs, setKtvs] = useState<KtvEntry[]>(() =>
    initialInstallMode === 'Khách hàng tự lắp đặt' ? [] : initKtvsFromHandover(handover)
  );
  const [form, setForm] = useState({
    handover_date: handover.handover_date || new Date().toISOString().slice(0, 10),
    driver_name: handover.driver_name || '',
    driver_phone: handover.driver_phone || '',
    vehicle_plate: handover.vehicle_plate || '',
    install_mode: initialInstallMode,
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
  const [sigUrl, setSigUrl] = useState<string>(handover.signature_data || '');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [matchedGuides, setMatchedGuides] = useState<any[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(false);

  const toggleGuides = async () => {
    const next = !showGuides;
    setShowGuides(next);
    if (next && matchedGuides.length === 0) {
      setLoadingGuides(true);
      try {
        const names = (handover.items || []).map((it: any) => it.product_name || '').join(' ');
        setMatchedGuides(await apiGet(`/api/guides/match?names=${encodeURIComponent(names)}`));
      } catch { /* ignore */ } finally {
        setLoadingGuides(false);
      }
    }
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(Boolean(handover.signature_data || handover.has_signature));

  // Lazy-load full signature_data & photos_json from GET /api/handovers/:id (TASK-10)
  useEffect(() => {
    if (handover.id && handover.signature_data === undefined) {
      setLoadingMedia(true);
      apiGet(`/api/handovers/${handover.id}`)
        .then(full => {
          setSigUrl(full.signature_data || '');
          setHasSig(Boolean(full.signature_data));
          try {
            const parsed = JSON.parse(full.photos_json || '[]');
            if (Array.isArray(parsed)) setPhotos(parsed);
          } catch { /* ignore */ }
        })
        .catch(() => {})
        .finally(() => setLoadingMedia(false));
    }
  }, [handover.id]);

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
    if (sigUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = sigUrl;
    }
  }, [sigUrl]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
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
    if (readOnly || !drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    drawing.current = false;
  };

  const clearSignature = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    setSigUrl('');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    e.target.value = '';
    if (files.length === 0) return;
    setCompressing(true);
    try {
      const compressed = await Promise.all(files.map(f => compressImageFile(f, 1280, 0.72)));
      setPhotos(prev => [...prev, ...compressed].slice(-4));
    } catch (err: any) {
      alert(err.message || 'Lỗi xử lý ảnh');
    } finally {
      setCompressing(false);
    }
  };

  const isCustomerSelfInstall = form.install_mode === 'Khách hàng tự lắp đặt';

  const handleSave = async (markCompleted: boolean) => {
    setSaving(true);
    try {
      const sigData = hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : '';
      const effectiveKtvs = isCustomerSelfInstall ? [] : ktvs;
      const payload = {
        ...form,
        ktvs: effectiveKtvs,
        ktv1_code: effectiveKtvs[0]?.code || '',
        ktv1_name: effectiveKtvs[0]?.name || '',
        ktv2_code: effectiveKtvs[1]?.code || '',
        ktv2_name: effectiveKtvs[1]?.name || '',
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
              onClick={() => {
                const printKtvs = isCustomerSelfInstall ? [] : ktvs;
                onPrint({
                  ...handover,
                  ...form,
                  ktvs: printKtvs,
                  ktv1_code: printKtvs[0]?.code || '',
                  ktv1_name: printKtvs[0]?.name || '',
                  ktv2_code: printKtvs[1]?.code || '',
                  ktv2_name: printKtvs[1]?.name || '',
                  signature_data: hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : sigUrl,
                });
              }}
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
          {loadingMedia && (
            <div className="px-3 py-2 rounded-lg bg-[#F8F4EC] border border-[#D6BCA5] text-xs text-[#6e5543]">
              Đang tải chữ ký & ảnh nghiệm thu từ Cloud...
            </div>
          )}

          {/* Customer summary + 1-tap Call/Maps & Quick HDLR/HDBQ (TASK-14) */}
          <div className="bg-[#F8F4EC] p-3.5 rounded-xl border border-[#E6DDD1] space-y-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#3B281A]">{handover.customer_name} — {handover.customer_phone}</div>
                <div className="text-xs text-[#6e5543] mt-0.5">{handover.address}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {handover.customer_phone && (
                  <a
                    href={`tel:${String(handover.customer_phone).replace(/\s+/g, '')}`}
                    className="px-2.5 py-1.5 rounded-lg bg-[#234E36] text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-[#1b3d2a]"
                  >
                    <Phone className="w-3 h-3" /> Gọi khách
                  </a>
                )}
                {handover.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(handover.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#D6BCA5] text-[#224B85] text-[11px] font-semibold flex items-center gap-1 hover:bg-blue-50"
                  >
                    <MapPin className="w-3 h-3" /> Bản đồ
                  </a>
                )}
              </div>
            </div>

            {handover.items?.length > 0 && (
              <div className="pt-2 border-t border-[#E6DDD1] space-y-1 text-xs">
                {handover.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between items-center gap-2">
                    <span>
                      {it.source_warehouse ? <strong className="font-mono text-[10px] px-1 py-0.5 mr-1 rounded bg-white border border-[#D6BCA5]">{it.source_warehouse}</strong> : '• '}
                      {it.product_name}
                      {it.moving_no ? <span className="text-[10px] text-[#6e5543] ml-1">(Moving {it.moving_no})</span> : null}
                    </span>
                    <span className="font-semibold shrink-0">SL: {it.qty}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-[#E6DDD1]">
              <button
                type="button"
                onClick={toggleGuides}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#D6BCA5] text-xs font-semibold text-[#3B281A] flex items-center justify-between hover:bg-[#FAF7F2] cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#224B85]" />
                  Xem nhanh HDLR / HDBQ sản phẩm trong đơn
                </span>
                <span className="text-[11px] text-[#6e5543]">{showGuides ? 'Thu gọn ▲' : 'Mở tài liệu ▼'}</span>
              </button>

              {showGuides && (
                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
                  {loadingGuides ? (
                    <div className="text-xs text-[#6e5543] py-2 text-center">Đang tìm tài liệu HDLR / HDBQ khớp sản phẩm...</div>
                  ) : matchedGuides.length === 0 ? (
                    <div className="text-xs text-[#6e5543] py-2 text-center">Chưa có tài liệu hướng dẫn khớp với sản phẩm trong đơn.</div>
                  ) : (
                    matchedGuides.map((g: any, idx: number) => (
                      <details key={g.id || idx} open={idx === 0} className="bg-white rounded-lg border border-[#E6DDD1] p-2.5">
                        <summary className="cursor-pointer font-semibold text-xs text-[#3B281A] flex items-center justify-between gap-2">
                          <span className="truncate">{g.title}</span>
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#F8F4EC] text-[10px] font-bold text-[#224B85]">
                            {g.guide_type || 'HDLR'} {g.product_line ? `• ${g.product_line}` : ''}
                          </span>
                        </summary>
                        <pre className="mt-2 pt-2 border-t border-[#F0E9DF] whitespace-pre-wrap font-sans text-[11px] text-[#3B281A] leading-relaxed max-h-44 overflow-y-auto">
                          {g.content_md}
                        </pre>
                      </details>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Date & Install Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#6e5543] mb-1">Ngày bàn giao</label>
              <input
                type="date"
                disabled={readOnly}
                value={form.handover_date}
                onChange={e => setForm({ ...form, handover_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#6e5543] mb-1">Hình thức lắp đặt</label>
              <select
                disabled={readOnly}
                value={form.install_mode}
                onChange={e => {
                  const nextMode = e.target.value;
                  setForm({ ...form, install_mode: nextMode });
                  if (nextMode === 'Khách hàng tự lắp đặt') setKtvs([]);
                }}
                className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm bg-white disabled:bg-gray-50"
              >
                <option value="Kỹ thuật Benom lắp đặt">Kỹ thuật Benom lắp đặt</option>
                <option value="Khách hàng tự lắp đặt">Khách hàng tự lắp đặt</option>
                <option value="Hẹn kỹ thuật Benom lắp sau">Hẹn kỹ thuật Benom lắp sau (Tự tạo BM-01)</option>
              </select>
            </div>
          </div>

          {/* Auto-expanding KTV Dropdown Picker (locked when customer self-installs) */}
          <KtvListPicker
            staff={staff}
            value={isCustomerSelfInstall ? [] : ktvs}
            disabled={readOnly || isCustomerSelfInstall}
            disabledReason={
              isCustomerSelfInstall
                ? 'Khách hàng tự lắp đặt — Không cần gán Kỹ thuật viên và không được chọn danh sách KTV tham gia.'
                : 'Chế độ chỉ xem — Không thể chỉnh sửa danh sách Kỹ thuật viên.'
            }
            onChange={v => !readOnly && !isCustomerSelfInstall && setKtvs(v)}
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
                  disabled={readOnly}
                  checked={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-[#234E36]"
                />
                <span className="text-xs sm:text-sm">{label}</span>
              </label>
            ))}
          </div>

          {/* Photos (Compressed JPEG <= 1280px) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-semibold text-[#3B281A]">Ảnh nghiệm thu hiện trường ({photos.length}/4)</span>
                <div className="text-[10px] text-[#6e5543]">Tự động nén nhẹ JPEG 1280px để gửi siêu nhanh qua 4G & tiết kiệm Cloud</div>
              </div>
              {!readOnly && (
                <label className="px-3 py-1.5 rounded-lg bg-[#F8F4EC] border border-[#D6BCA5] text-xs font-semibold text-[#3B281A] flex items-center gap-1.5 cursor-pointer hover:bg-[#efe6d8]">
                  <Camera className="w-3.5 h-3.5" /> {compressing ? 'Đang nén ảnh...' : 'Chụp / Tải ảnh'}
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoUpload} />
                </label>
              )}
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt={`Nghiệm thu ${i + 1}`} className="w-full h-20 object-cover rounded-lg border border-[#D6BCA5]" />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        title="Xóa ảnh này"
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/65 text-white hover:bg-[#9A2B26] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
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
                  disabled={readOnly}
                  onClick={() => setForm({ ...form, csat_rating: star })}
                  className="p-1 cursor-pointer transition-transform hover:scale-110 disabled:cursor-default"
                >
                  <Star className={`w-7 h-7 ${star <= form.csat_rating ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`} />
                </button>
              ))}
              <span className="text-xs font-semibold text-[#3B281A] ml-2">{form.csat_rating}/5 sao</span>
            </div>
            <input
              disabled={readOnly}
              value={form.csat_comment}
              onChange={e => setForm({ ...form, csat_comment: e.target.value })}
              placeholder="Góp ý nhanh của khách hàng (tùy chọn)..."
              className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs disabled:bg-gray-50"
            />
          </div>

          {/* Signature Pad */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-[#3B281A]">Chữ ký điện tử khách hàng</span>
              {!readOnly && (
                <button type="button" onClick={clearSignature} className="text-xs text-[#9A2B26] flex items-center gap-1 hover:underline cursor-pointer">
                  <Eraser className="w-3.5 h-3.5" /> Ký lại
                </button>
              )}
            </div>
            <canvas
              ref={canvasRef}
              width={560}
              height={160}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className={`w-full h-36 border-2 border-dashed border-[#D6BCA5] rounded-xl bg-white touch-none ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
            />
            <div className="text-[11px] text-[#6e5543] mt-1">Ký trực tiếp bằng tay (trên điện thoại/tablet) hoặc chuột.</div>
          </div>

          {/* Issue note */}
          <div>
            <label className="block text-xs font-semibold text-[#6e5543] mb-1">Ghi chú phát sinh / tồn đọng (nếu có)</label>
            <input
              disabled={readOnly}
              value={form.issue_note}
              onChange={e => setForm({ ...form, issue_note: e.target.value })}
              placeholder="VD: Thiếu 1 nút bọc chân ghế, hẹn bổ sung..."
              className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm disabled:bg-gray-50"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#F8F4EC] border-t border-[#E6DDD1] flex items-center justify-end gap-2.5">
          {readOnly ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#3B281A] text-white font-semibold text-xs hover:bg-[#563C28] cursor-pointer"
            >
              Đóng (Chế độ chỉ xem)
            </button>
          ) : (
            <>
              <button
                disabled={saving || compressing}
                onClick={() => handleSave(false)}
                className="px-4 py-2 rounded-lg border border-[#3B281A] text-[#3B281A] font-semibold text-xs hover:bg-[#efe6d8] cursor-pointer"
              >
                Lưu nháp
              </button>
              <button
                disabled={saving || compressing}
                onClick={() => handleSave(true)}
                className="px-4 py-2 rounded-lg bg-[#234E36] text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-[#1c3e2b] cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> Hoàn tất & Tự động đồng bộ ĐH
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
