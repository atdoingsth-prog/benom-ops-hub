import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, Edit3, MapPin, Phone, Users
} from 'lucide-react';
import { AuthUser } from '../api';

// Extract HCMC / Binh Duong district for smart route clustering (TASK-15)
export function extractDistrict(address: string, region: string): string {
  const s = String(address || '').normalize('NFC');
  const patterns: [RegExp, string][] = [
    [/quận\s*1\b|q\.?\s*1\b|lê thánh tôn|p\.?\s*sài gòn|bến nghé/i, 'Quận 1'],
    [/thủ đức|quận\s*2\b|q\.?\s*2\b|thảo điền|an phú|sala|quận\s*9\b|q\.?\s*9\b/i, 'TP. Thủ Đức (Q.2/Q.9)'],
    [/quận\s*3\b|q\.?\s*3\b/i, 'Quận 3'],
    [/quận\s*4\b|q\.?\s*4\b/i, 'Quận 4'],
    [/quận\s*5\b|q\.?\s*5\b/i, 'Quận 5'],
    [/quận\s*6\b|q\.?\s*6\b/i, 'Quận 6'],
    [/quận\s*7\b|q\.?\s*7\b|phú mỹ hưng|tân phong|tân phú,\s*q\.?7/i, 'Quận 7'],
    [/quận\s*8\b|q\.?\s*8\b/i, 'Quận 8'],
    [/quận\s*10\b|q\.?\s*10\b|3 tháng 2/i, 'Quận 10'],
    [/quận\s*11\b|q\.?\s*11\b/i, 'Quận 11'],
    [/quận\s*12\b|q\.?\s*12\b/i, 'Quận 12'],
    [/bình thạnh/i, 'Bình Thạnh'],
    [/phú nhuận/i, 'Phú Nhuận'],
    [/tân bình/i, 'Tân Bình'],
    [/tân phú/i, 'Tân Phú'],
    [/gò vấp/i, 'Gò Vấp'],
    [/bình tân|aeon bình tân/i, 'Bình Tân'],
    [/nhà bè/i, 'Nhà Bè'],
    [/bình chánh/i, 'Bình Chánh'],
    [/dĩ an|thuận an|bình dương|thủ dầu một/i, 'Bình Dương'],
    [/biên hòa|đồng nai/i, 'Đồng Nai'],
    [/hà nội|hn\b/i, 'Hà Nội'],
  ];
  for (const [re, label] of patterns) {
    if (re.test(s)) return label;
  }
  return region || 'Khu vực khác';
}

function getVnTodayIso(): string {
  const vn = new Date(Date.now() + 7 * 3600000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}-${String(vn.getUTCDate()).padStart(2, '0')}`;
}

interface KtvFieldProps {
  mode: 'ktv_today' | 'schedule';
  user: AuthUser;
  orders: any[];
  handovers: any[];
  canManageOrders: boolean;
  canHandover: boolean;
  onEditOrder: (o: any) => void;
  onOpenHandover: (o: any) => void;
}

export default function KtvFieldBoard({
  mode,
  user,
  orders,
  handovers,
  canManageOrders,
  canHandover,
  onEditOrder,
  onOpenHandover,
}: KtvFieldProps) {
  const todayIso = getVnTodayIso();
  const [onlyMine, setOnlyMine] = useState(false);
  const [ktvFilterMode, setKtvFilterMode] = useState<'pending' | 'all_recent'>('pending');
  const [selectedDate, setSelectedDate] = useState<string>(''); // '' = 7 days / active window

  const handoverByInvoice = useMemo(() => {
    const m = new Map<string, any>();
    for (const h of handovers) {
      if (!m.has(h.invoice_no) || h.status !== 'Completed') m.set(h.invoice_no, h);
    }
    return m;
  }, [handovers]);

  // MODE 1: KTV MOBILE 4G FIELD JOBS (TASK-14)
  if (mode === 'ktv_today') {
    const fieldJobs = orders.filter(o => {
      if (o.status === 'Cancelled') return false;
      const ho = handoverByInvoice.get(o.invoice_no);
      const isPending = o.status !== 'Done' || (ho && ho.status !== 'Completed');
      if (ktvFilterMode === 'pending' && !isPending) return false;
      if (onlyMine) {
        const myName = user.full_name.toLowerCase();
        const ktvNames = (o.ktvs || []).map((k: any) => String(k.name || '').toLowerCase());
        if (!ktvNames.some((n: string) => n && (myName.includes(n) || n.includes(myName.split('(')[0].trim())))) {
          return false;
        }
      }
      return true;
    }).slice(0, 40);

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-sm text-[#3B281A]">Bảng Việc Hiện Trường KTV (Tối ưu 4G Mobile)</div>
            <div className="text-[11px] text-[#6e5543]">1 chạm gọi khách, dẫn đường Google Maps, xem nhanh HDLR/HDBQ & ký biên bản BM-01/BM-05.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex bg-[#EFE7DC] p-0.5 rounded-lg">
              <button
                onClick={() => setKtvFilterMode('pending')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${ktvFilterMode === 'pending' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
              >
                Chưa hoàn tất
              </button>
              <button
                onClick={() => setKtvFilterMode('all_recent')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${ktvFilterMode === 'all_recent' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
              >
                Tất cả gần đây
              </button>
            </div>
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#D6BCA5] font-semibold cursor-pointer">
              <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} className="accent-[#3B281A]" />
              Chỉ việc của tôi
            </label>
          </div>
        </div>

        {fieldJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-10 text-center text-xs text-[#6e5543] border border-[#E6DDD1]">
            Tuyệt vời! Hiện không còn đơn giao lắp tồn đọng nào theo bộ lọc này. (Bấm "Tất cả gần đây" để xem lịch sử).
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fieldJobs.map(o => {
              const ho = handoverByInvoice.get(o.invoice_no);
              const district = extractDistrict(o.address, o.region);
              const isToday = (o.delivery_date || o.order_date) === todayIso;
              return (
                <div key={o.id} className={`bg-white rounded-2xl p-4 border shadow-xs flex flex-col justify-between gap-3 ${isToday ? 'border-[#234E36] ring-1 ring-[#234E36]/20' : 'border-[#E6DDD1]'}`}>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-[#3B281A] text-white text-[10px] font-bold font-mono">{o.invoice_no}</span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-[#224B85] text-[10px] font-bold">{district}</span>
                        {isToday && <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#234E36] text-[10px] font-bold">HÔM NAY</span>}
                      </div>
                      <span className="text-[11px] font-semibold text-[#6e5543]">{o.delivery_date || o.order_date}</span>
                    </div>

                    <div>
                      <div className="font-bold text-base text-[#3B281A]">{o.customer_name}</div>
                      <div className="text-xs text-[#6e5543]">{o.address || 'Chưa cập nhật địa chỉ'}</div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                      {o.requires_two_ktv && <span className="px-2 py-0.5 rounded bg-red-100 text-[#9A2B26]">⚠ HÀNG ≥ 25 KG (2 KTV)</span>}
                      {o.is_stairs ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900">🪜 THANG BỘ (K_Floor 1.2x)</span> : null}
                      {o.distance_km > 0 && <span className="px-2 py-0.5 rounded bg-[#F8F4EC] text-[#3B281A]">{o.distance_km} km</span>}
                    </div>

                    <div className="bg-[#FAF7F2] p-2.5 rounded-xl border border-[#EFE7DC] text-xs space-y-1">
                      {(o.items || []).map((it: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className="font-medium text-[#3B281A]">• {it.product_name}</span>
                          <span className="font-bold">x{it.qty}</span>
                        </div>
                      ))}
                      <div className="text-[11px] text-[#6e5543] pt-1 border-t border-[#EFE7DC]">
                        <strong>KTV:</strong> {(o.ktvs || []).map((k: any) => k.name).join(', ') || 'Chưa phân công'}
                      </div>
                    </div>
                  </div>

                  {/* Mobile 1-tap Action Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#EFE7DC]">
                    {o.customer_phone ? (
                      <a
                        href={`tel:${String(o.customer_phone).replace(/[^\d+]/g, '')}`}
                        className="py-2.5 rounded-xl bg-[#F8F4EC] border border-[#D6BCA5] text-[#3B281A] text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#EFE7DC]"
                      >
                        <Phone className="w-3.5 h-3.5 text-[#234E36]" /> Gọi
                      </a>
                    ) : (
                      <span className="py-2.5 rounded-xl bg-gray-50 text-gray-400 text-xs text-center">No SĐT</span>
                    )}

                    {o.address ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[#224B85] text-xs font-bold flex items-center justify-center gap-1 hover:bg-blue-100"
                      >
                        <MapPin className="w-3.5 h-3.5" /> Maps
                      </a>
                    ) : (
                      <span className="py-2.5 rounded-xl bg-gray-50 text-gray-400 text-xs text-center">No Maps</span>
                    )}

                    {canHandover ? (
                      <button
                        onClick={() => onOpenHandover(o)}
                        className="py-2.5 rounded-xl bg-[#234E36] text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#1b3d2a] cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> {ho ? 'Ký BB' : '+ Ký BB'}
                      </button>
                    ) : (
                      <span className="py-2.5 rounded-xl bg-gray-50 text-gray-500 text-xs text-center">{o.status}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // MODE 2: DAILY DISPATCH CALENDAR, KTV WORKLOAD & DISTRICT ROUTE CLUSTERING (TASK-15)
  const installOrders = orders.filter(o => o.status !== 'Cancelled' && (o.require_install || (o.ktvs?.length > 0)));
  const availableDates = Array.from(new Set(installOrders.map(o => o.delivery_date || o.order_date).filter(Boolean))).sort().reverse();
  const focusDate = selectedDate || (availableDates.includes(todayIso) ? todayIso : (availableDates[0] || todayIso));
  const dayOrders = installOrders.filter(o => (o.delivery_date || o.order_date) === focusDate);

  // Group by KTV to detect overload (>= 3 orders/day)
  const byKtv = new Map<string, any[]>();
  const byDistrict = new Map<string, any[]>();
  for (const o of dayOrders) {
    const ktvs = Array.isArray(o.ktvs) && o.ktvs.length > 0 ? o.ktvs : [{ code: '', name: 'Chưa phân công KTV' }];
    for (const k of ktvs) {
      const label = k.code ? `[${k.code}] ${k.name}` : k.name;
      const arr = byKtv.get(label) || [];
      arr.push(o);
      byKtv.set(label, arr);
    }
    const dist = extractDistrict(o.address, o.region);
    const dArr = byDistrict.get(dist) || [];
    dArr.push(o);
    byDistrict.set(dist, dArr);
  }

  const overloadedKtvs = Array.from(byKtv.entries()).filter(([name, arr]) => name !== 'Chưa phân công KTV' && arr.length >= 3);
  const understaffedHeavy = dayOrders.filter(o => o.requires_two_ktv && (o.ktvs?.length || 0) < 2);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#224B85]" /> Lịch Điều Phối KTV Theo Ngày & Gom Tuyến Quận (TP.HCM)
          </div>
          <div className="text-[11px] text-[#6e5543]">Phát hiện quá tải KTV (≥ 3 đơn/ngày), đơn ≥ 25 kg thiếu 2 KTV, và tự động nhóm đơn cùng quận để tiết kiệm cự ly.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={focusDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] bg-white font-semibold"
          />
          <select
            value={focusDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] bg-white font-semibold"
          >
            {!availableDates.includes(focusDate) && <option value={focusDate}>{focusDate} (0 đơn)</option>}
            {availableDates.slice(0, 20).map(d => (
              <option key={d} value={d}>{d}{d === todayIso ? ' (Hôm nay)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Conflict & Safety Alerts */}
      {(overloadedKtvs.length > 0 || understaffedHeavy.length > 0) && (
        <div className="space-y-2 text-xs">
          {overloadedKtvs.map(([ktv, arr]) => (
            <div key={ktv} className="p-3 rounded-xl bg-amber-50 border border-amber-400 text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span><strong>Cảnh báo quá tải KTV:</strong> <strong>{ktv}</strong> đang có <strong>{arr.length} đơn lắp đặt</strong> trong ngày {focusDate} — cân nhắc san tải sang KTV hỗ trợ!</span>
            </div>
          ))}
          {understaffedHeavy.map(o => (
            <div key={o.id} className="p-3 rounded-xl bg-red-50 border border-[#9A2B26] text-[#9A2B26] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><strong>Thiếu KTV an toàn (≥ 25 kg):</strong> Đơn <strong>{o.invoice_no}</strong> ({o.customer_name}) mới gán {o.ktvs?.length || 0} KTV!</span>
            </div>
          ))}
        </div>
      )}

      {dayOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-xs text-[#6e5543] border border-[#E6DDD1]">
          Không có đơn lắp đặt nào vào ngày <strong>{focusDate}</strong>. Hãy chọn ngày khác ở ô lịch phía trên.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Workload by KTV */}
          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="px-4 py-3 bg-[#F8F4EC] border-b border-[#E6DDD1] font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Phân Tải Theo Kỹ Thuật Viên ({dayOrders.length} đơn ngày {focusDate})
            </div>
            <div className="divide-y divide-[#EFE7DC]">
              {Array.from(byKtv.entries()).map(([ktv, list]) => (
                <div key={ktv} className="p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#3B281A]">{ktv}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${list.length >= 3 ? 'bg-red-100 text-[#9A2B26]' : 'bg-emerald-50 text-[#234E36]'}`}>
                      {list.length} đơn {list.length >= 3 ? '• Quá tải!' : ''}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {list.map(o => (
                      <div key={o.id} className="p-2.5 rounded-lg bg-[#FAF7F2] border border-[#E6DDD1] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#3B281A] truncate">
                            {o.invoice_no} — {o.customer_name} <span className="text-[#224B85]">({extractDistrict(o.address, o.region)})</span>
                          </div>
                          <div className="text-[10px] text-[#6e5543] truncate">
                            {(o.items || []).map((i: any) => `${i.product_name} (x${i.qty})`).join(', ')}
                          </div>
                        </div>
                        {canManageOrders && (
                          <button
                            onClick={() => onEditOrder(o)}
                            className="shrink-0 p-1.5 rounded bg-white border border-[#D6BCA5] text-[#3B281A] hover:bg-[#EFE7DC] cursor-pointer"
                            title="Điều chỉnh KTV / Ngày giao"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Route Clustering by District */}
          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="px-4 py-3 bg-[#F8F4EC] border-b border-[#E6DDD1] font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#224B85]" /> Gom Tuyến Giao Lắp Theo Quận / Khu Vực
            </div>
            <div className="divide-y divide-[#EFE7DC]">
              {Array.from(byDistrict.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .map(([dist, list]) => (
                  <div key={dist} className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#224B85]">{dist}</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#224B85] text-[10px] font-bold">
                        {list.length} điểm giao {list.length >= 2 ? '• Gom chung chuyến!' : ''}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {list.map(o => (
                        <div key={o.id} className="p-2.5 rounded-lg bg-[#FAF7F2] border border-[#E6DDD1] flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-[#3B281A] truncate">{o.customer_name} • {o.distance_km || 0} km</div>
                            <div className="text-[10px] text-[#6e5543] truncate">{o.address || 'Chưa rõ địa chỉ'}</div>
                          </div>
                          {o.address && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 px-2 py-1 rounded bg-white border border-blue-200 text-[#224B85] text-[10px] font-bold"
                            >
                              Maps
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
