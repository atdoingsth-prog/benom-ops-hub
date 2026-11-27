import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface GuideImageItem {
  index?: number;
  kind: string;
  label: string;
  cdn_url: string;
  local_path?: string;
}

export interface GuideLightboxData {
  id: number;
  title: string;
  product_line?: string;
  guide_type?: string;
  handle?: string;
  source_url?: string;
  barcodes?: string[];
  images: GuideImageItem[];
  initialIndex?: number;
}

interface Props {
  guide: GuideLightboxData;
  onClose: () => void;
}

export default function GuideLightboxModal({ guide, onClose }: Props) {
  const images = guide.images || [];
  const [idx, setIdx] = useState(Math.min(Math.max(0, guide.initialIndex || 0), Math.max(0, images.length - 1)));
  const [zoomed, setZoomed] = useState(false);
  const [fallbackLocal, setFallbackLocal] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && images.length > 1) setIdx(i => (i + 1) % images.length);
      else if (e.key === 'ArrowLeft' && images.length > 1) setIdx(i => (i - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const current = images[idx];
  if (!current) return null;

  const activeSrc = fallbackLocal[idx] && current.local_path ? current.local_path : current.cdn_url;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden border border-[#E6DDD1]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base truncate">{guide.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#D6BCA5] mt-0.5">
              <span>{current.label} ({idx + 1}/{images.length})</span>
              {guide.barcodes && guide.barcodes.length > 0 && (
                <span className="font-mono text-[10px] bg-white/10 px-1.5 py-0.5 rounded">
                  Barcode: {guide.barcodes.slice(0, 4).join(', ')}{guide.barcodes.length > 4 ? ` +${guide.barcodes.length - 4}` : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setZoomed(z => !z)}
              className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              title="Phóng to / Thu gọn"
            >
              {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{zoomed ? 'Vừa khung' : 'Phóng to'}</span>
            </button>
            <a
              href={activeSrc}
              target="_blank"
              rel="noreferrer"
              download={`${guide.handle || 'benom'}_${current.kind}.webp`}
              className="px-2.5 py-1.5 rounded-lg bg-[#D6BCA5] text-[#3B281A] hover:bg-[#e5d2c0] text-xs font-semibold flex items-center gap-1"
              title="Mở / Tải ảnh gốc .webp"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ảnh gốc</span>
            </a>
            {guide.source_url && (
              <a
                href={guide.source_url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[#F8F4EC]"
                title="Xem trang sản phẩm trên benom.com.vn"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sheet Switcher Tabs */}
        {images.length > 1 && (
          <div className="px-4 py-2 bg-[#F8F4EC] border-b border-[#E6DDD1] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {images.map((im, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setIdx(i); setZoomed(false); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    i === idx
                      ? 'bg-[#3B281A] text-[#F8F4EC]'
                      : 'bg-white text-[#3B281A] border border-[#D6BCA5] hover:bg-[#EFE7DC]'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}. {im.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setIdx(i => (i - 1 + images.length) % images.length); setZoomed(false); }}
                className="p-1.5 rounded-lg bg-white border border-[#D6BCA5] text-[#3B281A] hover:bg-[#EFE7DC] cursor-pointer"
                title="Trang trước (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => { setIdx(i => (i + 1) % images.length); setZoomed(false); }}
                className="p-1.5 rounded-lg bg-white border border-[#D6BCA5] text-[#3B281A] hover:bg-[#EFE7DC] cursor-pointer"
                title="Trang tiếp (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Image Canvas */}
        <div className="flex-1 overflow-auto bg-[#F3EFEA] p-3 sm:p-5 flex items-start justify-center">
          <img
            src={activeSrc}
            alt={`${guide.title} — ${current.label}`}
            onClick={() => setZoomed(z => !z)}
            onError={() => {
              if (!fallbackLocal[idx] && current.local_path) {
                setFallbackLocal(prev => ({ ...prev, [idx]: true }));
              }
            }}
            className={`rounded-xl shadow-lg bg-white border border-[#E6DDD1] transition-all cursor-zoom-in ${
              zoomed ? 'w-[155%] max-w-none cursor-zoom-out' : 'max-w-full max-h-[72vh] object-contain'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
