import React, { useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import { apiSend, fmtVnd } from '../api';
import {
  DEFAULT_SHIPPING_CONFIG,
  DeliveryZone,
  DELIVERY_ZONE_META,
  ShippingConfig,
} from '../utils/shippingCalculator';

interface Props {
  config: ShippingConfig;
  onSaved: (nextConfig: ShippingConfig, meta?: { updated_by?: string | null; updated_at?: string | null }) => void;
  onClose: () => void;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function TariffSettingsModal({ config, onSaved, onClose, onToast }: Props) {
  const [draft, setDraft] = useState<ShippingConfig>(() => JSON.parse(JSON.stringify(config)));
  const [saving, setSaving] = useState(false);

  const updateTier = (vehicleId: string, tierIdx: number, field: 'flat' | 'perKm', val: number) => {
    setDraft(prev => ({
      ...prev,
      vehicles: prev.vehicles.map(v => {
        if (v.id !== vehicleId) return v;
        return {
          ...v,
          kmTiers: v.kmTiers.map((t, i) => (i === tierIdx ? { ...t, [field]: Math.max(0, val) } : t)),
        };
      }),
    }));
  };

  const updateHelperFee = (vehicleId: string, val: number) => {
    setDraft(prev => ({
      ...prev,
      vehicles: prev.vehicles.map(v => (v.id === vehicleId ? { ...v, loadingHelperFee: Math.max(0, val) } : v)),
    }));
  };

  const updateExpress = (zone: DeliveryZone, field: 'upTo1_5' | 'upTo3' | 'step0_5', val: number) => {
    setDraft(prev => ({
      ...prev,
      expressRates: {
        ...prev.expressRates,
        [zone]: { ...prev.expressRates[zone], [field]: Math.max(0, val) },
      },
    }));
  };

  const updateSagawa = (zone: DeliveryZone, field: 'upTo2Kg' | 'perKg2To30' | 'perKgOver30', val: number) => {
    setDraft(prev => ({
      ...prev,
      sagawaRates: {
        ...prev.sagawaRates,
        [zone]: { ...prev.sagawaRates[zone], [field]: Math.max(0, val) },
      },
    }));
  };

  const updateFreight = (
    zone: 'INTRA_REGIONAL' | 'SUB_REGIONAL' | 'CROSS_REGIONAL',
    field: 'perCbm' | 'pickupFlat' | 'minCbm',
    val: number
  ) => {
    setDraft(prev => ({
      ...prev,
      freightRates: {
        ...prev.freightRates,
        [zone]: { ...prev.freightRates[zone], [field]: Math.max(0, val) },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiSend('/api/shipping/tariffs', 'PUT', { config: draft });
      onToast('Đã lưu bảng cước vận chuyển vào hệ thống!');
      onSaved(draft, { updated_by: res.updated_by, updated_at: res.updated_at });
      onClose();
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Khôi phục toàn bộ bảng giá Ahamove, Xanh SM, CPN & Chành xe về mặc định?')) return;
    setSaving(true);
    try {
      await apiSend('/api/shipping/tariffs', 'PUT', { reset: true });
      const fresh = JSON.parse(JSON.stringify(DEFAULT_SHIPPING_CONFIG));
      setDraft(fresh);
      onSaved(fresh, { updated_by: null, updated_at: null });
      onToast('Đã khôi phục bảng cước mặc định!');
      onClose();
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl border border-[#D6BCA5] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">Cấu hình Bảng Giá Cước (Ahamove • Xanh SM • CPN • Chành xe)</h3>
            <p className="text-[11px] text-[#D6BCA5]">Áp dụng chung cho toàn bộ đội Sales & Điều phối benom (lưu trên Cloud DB).</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6 text-xs">
          {/* Distance-based fleet */}
          <div>
            <h4 className="font-bold text-[#3B281A] mb-2">1. Bảng cước nội thành / nội vùng (Ahamove & Xanh SM)</h4>
            <div className="space-y-2">
              {draft.vehicles.map(v => (
                <div key={v.id} className="border border-[#E6DDD1] rounded-xl p-3 bg-[#FAF7F2]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${v.carrier === 'Xanh SM' ? 'bg-teal-100 text-teal-900' : 'bg-orange-100 text-orange-900'}`}>
                        {v.carrier}
                      </span>
                      <span className="font-bold text-[#3B281A]">{v.name}</span>
                      <span className="text-[11px] text-[#6e5543]">({v.bayDimsCm.join('×')} cm • {v.maxWeightKg} kg)</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#6e5543]">
                      <span>Bốc xếp (+):</span>
                      <input
                        type="number"
                        step={5000}
                        value={v.loadingHelperFee}
                        onChange={e => updateHelperFee(v.id, Number(e.target.value))}
                        className="w-24 px-2 py-1 rounded border border-[#D6BCA5] bg-white text-right font-semibold text-[#3B281A]"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {v.kmTiers.map((t, idx) => {
                      const prev = idx === 0 ? 0 : (v.kmTiers[idx - 1].upToKm || 0);
                      const bandLabel = t.upToKm === null ? `> ${prev} km (đ/km)` : `${prev}–${t.upToKm} km (${t.flat !== undefined ? 'Cước đầu' : 'đ/km'})`;
                      const field = t.flat !== undefined ? 'flat' : 'perKm';
                      const val = t.flat !== undefined ? t.flat : (t.perKm || 0);
                      return (
                        <label key={idx} className="bg-white border border-[#E6DDD1] rounded-lg px-2.5 py-1.5">
                          <div className="text-[10px] text-[#6e5543]">{bandLabel}</div>
                          <input
                            type="number"
                            step={500}
                            value={val}
                            onChange={e => updateTier(v.id, idx, field, Number(e.target.value))}
                            className="w-full mt-0.5 font-bold text-[#3B281A] outline-none border-b border-transparent focus:border-[#3B281A]"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sagawa Express (< 1 m3) */}
          <div>
            <h4 className="font-bold text-[#3B281A] mb-2">2. Bảng cước Sagawa (Ưu tiên đi tỉnh &lt; 1 m³ — Hiệu chuẩn thực tế)</h4>
            <div className="overflow-x-auto border border-[#E6DDD1] rounded-xl">
              <table className="w-full text-left">
                <thead className="bg-[#EFE7DC] text-[11px] text-[#3B281A]">
                  <tr>
                    <th className="p-2.5">Vùng giao hàng</th>
                    <th className="p-2.5">Cước đầu (≤ 2 kg)</th>
                    <th className="p-2.5">2–30 kg (đ/kg)</th>
                    <th className="p-2.5">&gt; 30 kg (đ/kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE7DC]">
                  {(['HCM', 'INTRA_REGIONAL', 'SUB_REGIONAL', 'CROSS_REGIONAL'] as DeliveryZone[]).map(z => (
                    <tr key={z}>
                      <td className="p-2.5 font-semibold text-[#3B281A]">{DELIVERY_ZONE_META[z].label}</td>
                      {(['upTo2Kg', 'perKg2To30', 'perKgOver30'] as const).map(f => (
                        <td key={f} className="p-2">
                          <input
                            type="number"
                            step={500}
                            value={draft.sagawaRates[z][f]}
                            onChange={e => updateSagawa(z, f, Number(e.target.value))}
                            className="w-28 px-2 py-1 rounded border border-[#D6BCA5] font-semibold text-[#3B281A]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 247 Express weight tiers */}
          <div>
            <h4 className="font-bold text-[#3B281A] mb-2">3. Bảng cước 247 Express (Chuyển phát nhanh ≤ 10 kg — Chuẩn Excel)</h4>
            <div className="overflow-x-auto border border-[#E6DDD1] rounded-xl">
              <table className="w-full text-left">
                <thead className="bg-[#EFE7DC] text-[11px] text-[#3B281A]">
                  <tr>
                    <th className="p-2.5">Vùng giao hàng</th>
                    <th className="p-2.5">Đến 1.5 kg</th>
                    <th className="p-2.5">Đến 3 kg</th>
                    <th className="p-2.5">Mỗi +0.5 kg tiếp theo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE7DC]">
                  {(['HCM', 'INTRA_REGIONAL', 'SUB_REGIONAL', 'CROSS_REGIONAL'] as DeliveryZone[]).map(z => (
                    <tr key={z}>
                      <td className="p-2.5 font-semibold text-[#3B281A]">{DELIVERY_ZONE_META[z].label}</td>
                      {(['upTo1_5', 'upTo3', 'step0_5'] as const).map(f => (
                        <td key={f} className="p-2">
                          <input
                            type="number"
                            step={500}
                            value={draft.expressRates[z][f]}
                            onChange={e => updateExpress(z, f, Number(e.target.value))}
                            className="w-28 px-2 py-1 rounded border border-[#D6BCA5] font-semibold text-[#3B281A]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Toàn Nhất Logistics (Chanh xe CBM >= 1 m3) */}
          <div>
            <h4 className="font-bold text-[#3B281A] mb-2">4. Bảng cước Toàn Nhất Logistics / Chành xe (Ưu tiên ≥ 1 m³)</h4>
            <div className="grid sm:grid-cols-3 gap-3">
              {(['INTRA_REGIONAL', 'SUB_REGIONAL', 'CROSS_REGIONAL'] as const).map(z => (
                <div key={z} className="border border-[#E6DDD1] rounded-xl p-3 bg-[#FAF7F2] space-y-2">
                  <div className="font-bold text-[#3B281A]">{DELIVERY_ZONE_META[z].label}</div>
                  <label className="block">
                    <span className="text-[10px] text-[#6e5543]">Đơn giá / CBM ({fmtVnd(draft.freightRates[z].perCbm)})</span>
                    <input
                      type="number"
                      step={10000}
                      value={draft.freightRates[z].perCbm}
                      onChange={e => updateFreight(z, 'perCbm', Number(e.target.value))}
                      className="w-full mt-0.5 px-2 py-1 rounded border border-[#D6BCA5] bg-white font-semibold"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-[#6e5543]">Phí trung chuyển ra chành</span>
                    <input
                      type="number"
                      step={10000}
                      value={draft.freightRates[z].pickupFlat}
                      onChange={e => updateFreight(z, 'pickupFlat', Number(e.target.value))}
                      className="w-full mt-0.5 px-2 py-1 rounded border border-[#D6BCA5] bg-white font-semibold"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-[#6e5543]">Số khối tính tối thiểu (m³)</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={draft.freightRates[z].minCbm ?? 1}
                      onChange={e => updateFreight(z, 'minCbm', Number(e.target.value))}
                      className="w-full mt-0.5 px-2 py-1 rounded border border-[#D6BCA5] bg-white font-semibold"
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleReset}
            className="px-3.5 py-2 rounded-lg border border-red-300 text-red-800 bg-white text-xs font-semibold flex items-center gap-1.5 hover:bg-red-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Khôi phục mặc định
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs cursor-pointer">
              Hủy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Đang lưu...' : 'Lưu bảng giá'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
