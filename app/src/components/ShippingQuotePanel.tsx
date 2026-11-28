import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink,
  MapPin, Package, Plus, Search, Settings2, Sparkles, Trash2, Truck, Wrench
} from 'lucide-react';
import { apiGet, AuthUser, fmtVnd, NavIntent } from '../api';
import {
  applyRounding,
  buildGoogleMapsDirectionsUrl,
  DEFAULT_SHIPPING_CONFIG,
  DELIVERY_ZONE_META,
  EvaluatedShippingOption,
  evaluateShippingOptions,
  extractProductShippingDims,
  formatCustomerQuoteText,
  mergeShippingConfig,
  PICKUP_WAREHOUSES,
  PROVINCE_ZONES,
  QuoteItemInput,
  RoundingMode,
  ShippingConfig,
} from '../utils/shippingCalculator';

const TariffSettingsModal = lazy(() => import('./TariffSettingsModal'));

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onNavigate?: (tab: string, intent?: NavIntent) => void;
}

const CARRIER_FILTER_TABS: Array<{ id: 'ALL' | 'Xanh SM' | 'Ahamove' | 'Sagawa' | '247 Express' | 'Toàn Nhất Logistics'; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'Xanh SM', label: 'Xanh SM' },
  { id: 'Ahamove', label: 'Ahamove' },
  { id: 'Sagawa', label: 'Sagawa' },
  { id: '247 Express', label: '247 Express' },
  { id: 'Toàn Nhất Logistics', label: 'Toàn Nhất Logistics' },
];

const CARRIER_BADGE: Record<string, string> = {
  'Xanh SM': 'bg-teal-100 text-teal-900 border-teal-300',
  Ahamove: 'bg-orange-100 text-orange-900 border-orange-300',
  Sagawa: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  '247 Express': 'bg-sky-100 text-sky-900 border-sky-300',
  'Toàn Nhất Logistics': 'bg-amber-100 text-amber-900 border-amber-300',
};

export default function ShippingQuotePanel({ user, onToast, onNavigate }: Props) {
  const canEditTariffs = user.role === 'ADMIN' || user.role === 'EDITOR';

  // Tariff config (loaded once from server, merged with defaults)
  const [tariffConfig, setTariffConfig] = useState<ShippingConfig>(DEFAULT_SHIPPING_CONFIG);
  const [tariffMeta, setTariffMeta] = useState<{ updated_by?: string | null; updated_at?: string | null }>({});
  const [showTariffsModal, setShowTariffsModal] = useState(false);

  // SKU / Barcode Search
  const [skuQuery, setSkuQuery] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [searchingSku, setSearchingSku] = useState(false);

  // Cart items
  const [items, setItems] = useState<QuoteItemInput[]>([]);

  // Route & Quote options
  const [pickupWarehouse, setPickupWarehouse] = useState<'3001' | '9005' | '1001'>('3001');
  const [province, setProvince] = useState('HCM');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [address, setAddress] = useState('');
  const [distanceKm, setDistanceKm] = useState<number>(8.5);
  const [rushHourRestricted, setRushHourRestricted] = useState(false);
  const [includeLoadingHelper, setIncludeLoadingHelper] = useState(false);
  const [includeInstallFee, setIncludeInstallFee] = useState(false);
  const [installFeeManual, setInstallFeeManual] = useState<number | null>(null);
  const [rounding, setRounding] = useState<RoundingMode>('ROUND_1000');
  const [carrierFilter, setCarrierFilter] = useState<'ALL' | 'Xanh SM' | 'Ahamove' | 'Sagawa' | '247 Express' | 'Toàn Nhất Logistics'>('ALL');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showIneligible, setShowIneligible] = useState(false);

  useEffect(() => {
    apiGet<{ config: Partial<ShippingConfig> | null; updated_by?: string | null; updated_at?: string | null }>(
      '/api/shipping/tariffs',
      { cacheMs: 120000 }
    )
      .then(res => {
        if (res?.config) {
          setTariffConfig(mergeShippingConfig(res.config));
        }
        setTariffMeta({ updated_by: res?.updated_by, updated_at: res?.updated_at });
      })
      .catch(() => { /* fallback cleanly to DEFAULT_SHIPPING_CONFIG */ });
  }, []);

  const searchProducts = async (val: string, autoPickExact = false) => {
    setSkuQuery(val);
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setSkuResults([]);
      return;
    }
    setSearchingSku(true);
    try {
      const res = await apiGet<any[]>(
        `/api/master/products?q=${encodeURIComponent(trimmed)}&type=PRODUCT&include_all_stock=1&include_dims=1&limit=12`
      );
      if (autoPickExact) {
        const exact = res.find(p => String(p.barcode).trim() === trimmed);
        if (exact) {
          addProductToQuote(exact);
          return;
        }
      }
      setSkuResults(res);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setSearchingSku(false);
    }
  };

  const addProductToQuote = (p: any) => {
    const dims = extractProductShippingDims(p);
    setItems(prev => {
      const idx = prev.findIndex(it => it.barcode && it.barcode === p.barcode);
      if (idx >= 0) {
        return prev.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it));
      }
      return [
        ...prev,
        {
          id: `${p.barcode || 'custom'}-${Date.now()}-${Math.random()}`,
          barcode: String(p.barcode || ''),
          product_name: p.name_vn || '',
          unit: p.unit || 'Cái',
          qty: 1,
          actual_weight_kg: dims.actual_weight_kg,
          w_cm: dims.w_cm,
          d_cm: dims.d_cm,
          h_cm: dims.h_cm,
          retail_price: Number(p.retail_price) || 0,
          install_fee_unit: Number(p.p_installation) || 0,
          stock_3001: Number(p.stock_3001) || 0,
          stock_9005: Number(p.stock_9005) || 0,
          stock_1001: Number(p.stock_1001) || 0,
        },
      ];
    });
    setSkuQuery('');
    setSkuResults([]);
    setSelectedOptionId(null);

    // Smart hint if chosen pickup warehouse is out of stock while another has stock
    const chosenStock = Number(p[`stock_${pickupWarehouse}`] || 0);
    if (chosenStock <= 0) {
      const alt = (['3001', '9005', '1001'] as const).find(w => Number(p[`stock_${w}`] || 0) > 0);
      if (alt) {
        onToast(`Lưu ý: Kho ${pickupWarehouse} hết "${p.name_vn}" (Kho ${alt} đang còn ${p[`stock_${alt}`]}).`, 'ok');
      }
    }
  };

  const addCustomLine = () => {
    setItems(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random()}`,
        barcode: '',
        product_name: 'Sản phẩm / Kiện hàng tùy chỉnh',
        unit: 'Cái',
        qty: 1,
        actual_weight_kg: 5,
        w_cm: 50,
        d_cm: 40,
        h_cm: 30,
        retail_price: 0,
        install_fee_unit: 0,
      },
    ]);
    setSelectedOptionId(null);
  };

  const updateItem = (id: string, patch: Partial<QuoteItemInput>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
    setSelectedOptionId(null);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
    setSelectedOptionId(null);
  };

  const evaluation = useMemo(
    () =>
      evaluateShippingOptions(
        {
          items,
          pickupWarehouse,
          province,
          distanceKm,
          rushHourRestricted,
          includeLoadingHelper,
          rounding,
        },
        tariffConfig
      ),
    [items, pickupWarehouse, province, distanceKm, rushHourRestricted, includeLoadingHelper, rounding, tariffConfig]
  );

  const effectiveInstallFee =
    installFeeManual !== null ? installFeeManual : evaluation.summary.totalInstallFee;

  const activeOption: EvaluatedShippingOption | null = useMemo(() => {
    if (selectedOptionId) {
      const found = evaluation.eligibleOptions.find(o => o.id === selectedOptionId);
      if (found) return found;
    }
    return evaluation.recommendedOption;
  }, [evaluation, selectedOptionId]);

  const filteredEligible = useMemo(() => {
    if (carrierFilter === 'ALL') return evaluation.eligibleOptions;
    return evaluation.eligibleOptions.filter(o => o.carrier === carrierFilter);
  }, [evaluation.eligibleOptions, carrierFilter]);

  const filteredProvinces = useMemo(() => {
    const q = provinceSearch.trim().toLowerCase();
    if (!q) return PROVINCE_ZONES;
    return PROVINCE_ZONES.filter(p => p.province.toLowerCase().includes(q));
  }, [provinceSearch]);

  const handleCopyQuote = async () => {
    if (!activeOption || evaluation.summary.items.length === 0) return;
    const text = formatCustomerQuoteText({
      warehouseCode: pickupWarehouse,
      province,
      address,
      distanceKm,
      zone: evaluation.zone,
      summary: evaluation.summary,
      option: activeOption,
      includeInstallFee,
      installFeeOverride: effectiveInstallFee,
    });
    try {
      await navigator.clipboard.writeText(text);
      onToast('Đã copy tin nhắn báo giá vào clipboard — dán trực tiếp gửi Zalo/Facebook cho khách!');
    } catch {
      onToast('Không thể truy cập clipboard trình duyệt.', 'err');
    }
  };

  const handleCreateOrder = () => {
    if (!onNavigate || !activeOption || evaluation.summary.items.length === 0) return;
    const installCost = includeInstallFee ? effectiveInstallFee : 0;
    const regionValue = evaluation.zone === 'HCM' ? 'HCM' : `${province} (${DELIVERY_ZONE_META[evaluation.zone].label})`;
    onNavigate('orders', {
      subTab: 'orders',
      prefillNewOrder: {
        source_warehouse: pickupWarehouse,
        region: regionValue,
        address: address || province,
        distance_km: distanceKm,
        carrier: activeOption.dispatchCarrierValue,
        shipping_fee_3pl: activeOption.shippingCost,
        customer_paid_fee: activeOption.shippingCost + installCost,
        require_install: includeInstallFee,
        notes: `Từ Báo giá nhanh: ${activeOption.name} (${evaluation.summary.totalChargeableWeightKg.toFixed(2)} kg / ${evaluation.summary.totalCbm.toFixed(3)} m³)`,
        items: evaluation.summary.items
          .filter(it => it.barcode.trim() || it.product_name.trim())
          .map(it => ({
            barcode: it.barcode || 'CUSTOM',
            product_name: it.product_name,
            unit: it.unit || 'Cái',
            qty: it.qty,
            net_weight_g: Math.round(it.actual_weight_kg * 1000),
            source_warehouse: pickupWarehouse,
          })),
      },
    });
  };

  const zoneMeta = DELIVERY_ZONE_META[evaluation.zone];

  return (
    <div className="space-y-5">
      {/* Top Info Banner & Tariff Settings Button */}
      <div className="bg-white rounded-2xl border border-[#E6DDD1] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <h2 className="text-base font-bold text-[#3B281A]">
              Tính Phí & Báo Giá Vận Chuyển Nhanh (v2.0 — Ahamove • Xanh SM • Sagawa • Toàn Nhất • 247)
            </h2>
          </div>
          <p className="text-xs text-[#6e5543] mt-0.5">
            Tự động tra cân nặng & kích thước thùng từ Barcode, tính Chargeable Weight <code>MAX(Thực, D×R×C/5000)</code>, kiểm tra lọt thùng 3D từng xe và xếp hạng phương án tối ưu nhất so với chuẩn Excel (Van 1000kg).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tariffMeta.updated_at && (
            <span className="text-[11px] text-[#6e5543] hidden sm:inline">
              Bảng giá cập nhật: {tariffMeta.updated_at}
            </span>
          )}
          {canEditTariffs && (
            <button
              onClick={() => setShowTariffsModal(true)}
              className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-[#FAF7F2] text-xs font-semibold text-[#3B281A] flex items-center gap-1.5 hover:bg-[#EFE7DC] cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" /> Chỉnh bảng giá cước
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (7/12): Cart + Route Inputs */}
        <div className="xl:col-span-7 space-y-5">
          {/* Card 1: Barcode Lookup & Items Table */}
          <div className="bg-white rounded-2xl border border-[#E6DDD1] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#3B281A]" />
                <h3 className="text-sm font-bold text-[#3B281A]">1. Sản phẩm cần báo giá (Barcode / Tên SP)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCustomLine}
                  className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] text-[11px] font-semibold text-[#3B281A] hover:bg-[#F8F4EC] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm dòng tự nhập
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
              <input
                value={skuQuery}
                onChange={e => searchProducts(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && skuQuery.trim().length >= 2) {
                    e.preventDefault();
                    searchProducts(skuQuery, true);
                  }
                }}
                placeholder="Quét hoặc nhập Barcode (VD: 8935273400955) hoặc tên sản phẩm (Gương Be-There, Sofa Lilow...)"
                className="w-full pl-9 pr-24 py-2 rounded-xl border border-[#D6BCA5] text-xs focus:ring-2 focus:ring-[#3B281A]/20 outline-none"
              />
              {searchingSku && (
                <span className="absolute right-3 top-2.5 text-[11px] text-[#6e5543]">Đang tìm...</span>
              )}
              {skuResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-[#D6BCA5] rounded-xl shadow-xl z-30 max-h-72 overflow-y-auto divide-y divide-[#F0E8DE]">
                  {skuResults.map(p => {
                    const dims = extractProductShippingDims(p);
                    return (
                      <button
                        key={p.barcode}
                        type="button"
                        onClick={() => addProductToQuote(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-[#FAF7F2] flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#3B281A] truncate">
                            <span className="font-mono text-[11px] text-[#6e5543] mr-1.5">{p.barcode}</span>
                            {p.name_vn}
                          </div>
                          <div className="text-[11px] text-[#6e5543] mt-0.5 flex flex-wrap gap-2">
                            <span>Nặng: <strong>{dims.actual_weight_kg} kg</strong></span>
                            <span>Hộp: <strong>{dims.w_cm}×{dims.d_cm}×{dims.h_cm} cm</strong></span>
                            {Number(p.p_installation) > 0 && (
                              <span className="text-purple-700">Lắp đặt: {fmtVnd(p.p_installation)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 text-[10px] font-semibold">
                          <span className={`px-1.5 py-0.5 rounded border ${(p.stock_3001 || 0) > 0 ? 'bg-[#F8F4EC] text-[#3B281A] border-[#D6BCA5]' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                            3001: {p.stock_3001 || 0}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded border ${(p.stock_9005 || 0) > 0 ? 'bg-blue-50 text-[#224B85] border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                            9005: {p.stock_9005 || 0}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded border ${(p.stock_1001 || 0) > 0 ? 'bg-emerald-50 text-[#234E36] border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                            1001: {p.stock_1001 || 0}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart Table */}
            {evaluation.summary.items.length === 0 ? (
              <div className="border-2 border-dashed border-[#E6DDD1] rounded-xl py-8 text-center text-xs text-[#6e5543] space-y-2">
                <div>Chưa có sản phẩm nào. Hãy tìm Barcode hoặc nhấn <strong>Thêm dòng tự nhập</strong>.</div>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => searchProducts('8935273400955', true)}
                    className="px-2.5 py-1 rounded-md bg-[#FAF7F2] border border-[#D6BCA5] text-[11px] font-medium hover:bg-[#EFE7DC] cursor-pointer"
                  >
                    + Gương Be-There (HCM Van)
                  </button>
                  <button
                    type="button"
                    onClick={() => searchProducts('8935382601243', true)}
                    className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] font-medium hover:bg-indigo-100 cursor-pointer"
                  >
                    + Kệ Claro (&lt;1 m³ Sagawa)
                  </button>
                  <button
                    type="button"
                    onClick={() => searchProducts('8935273401488', true)}
                    className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium hover:bg-amber-100 cursor-pointer"
                  >
                    + Sofa Murest (≥1 m³ Toàn Nhất)
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E6DDD1] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF7F2] text-[11px] text-[#6e5543] border-b border-[#E6DDD1]">
                    <tr>
                      <th className="p-2.5">Sản phẩm / Barcode</th>
                      <th className="p-2 w-16 text-center">SL</th>
                      <th className="p-2 w-20 text-right">Nặng (kg)</th>
                      <th className="p-2 text-center">Kích thước hộp W×D×H (cm)</th>
                      <th className="p-2 text-right">Tính cước (kg)</th>
                      <th className="p-2 w-9"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E8DE]">
                    {evaluation.summary.items.map(it => (
                      <tr key={it.id} className="hover:bg-[#FAF7F2]/60">
                        <td className="p-2.5 min-w-[180px]">
                          <input
                            value={it.product_name}
                            onChange={e => updateItem(it.id, { product_name: e.target.value })}
                            className="w-full font-semibold text-[#3B281A] bg-transparent border-b border-transparent focus:border-[#D6BCA5] outline-none"
                          />
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#6e5543]">
                            <span className="font-mono">{it.barcode || 'Tùy chỉnh'}</span>
                            {it.barcode && (
                              <span>
                                • Tồn {pickupWarehouse}:{' '}
                                <strong className={Number((it as any)[`stock_${pickupWarehouse}`] || 0) > 0 ? 'text-emerald-700' : 'text-red-700'}>
                                  {Number((it as any)[`stock_${pickupWarehouse}`] || 0)}
                                </strong>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min={1}
                            value={it.qty}
                            onChange={e => updateItem(it.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-14 px-1.5 py-1 rounded border border-[#D6BCA5] text-center font-bold"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            value={it.actual_weight_kg}
                            onChange={e => updateItem(it.id, { actual_weight_kg: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-16 px-1.5 py-1 rounded border border-[#D6BCA5] text-right font-semibold"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={it.w_cm}
                              onChange={e => updateItem(it.id, { w_cm: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-14 px-1 py-1 rounded border border-[#D6BCA5] text-center"
                              title="Dài / Rộng (cm)"
                            />
                            <span className="text-[#6e5543]">×</span>
                            <input
                              type="number"
                              min={0}
                              value={it.d_cm}
                              onChange={e => updateItem(it.id, { d_cm: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-14 px-1 py-1 rounded border border-[#D6BCA5] text-center"
                              title="Rộng / Sâu (cm)"
                            />
                            <span className="text-[#6e5543]">×</span>
                            <input
                              type="number"
                              min={0}
                              value={it.h_cm}
                              onChange={e => updateItem(it.id, { h_cm: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-14 px-1 py-1 rounded border border-[#D6BCA5] text-center"
                              title="Cao (cm)"
                            />
                          </div>
                          {(it.w_cm === 0 || it.d_cm === 0 || it.h_cm === 0) && (
                            <div className="text-[10px] text-amber-700 text-center mt-0.5">Chưa đủ 3 chiều — hãy nhập cm</div>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <div className="font-bold text-[#3B281A]">{it.line_chargeable_weight_kg.toFixed(2)} kg</div>
                          <div className="text-[10px] text-[#6e5543]">
                            QĐ: {it.volumetric_weight_unit_kg.toFixed(2)} kg/SP
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            className="p-1 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                            title="Xóa dòng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary KPI Strip */}
            {evaluation.summary.items.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="bg-[#FAF7F2] rounded-xl p-2.5 border border-[#E6DDD1]">
                  <div className="text-[10px] text-[#6e5543]">Cân nặng thực</div>
                  <div className="text-sm font-bold text-[#3B281A]">{evaluation.summary.totalActualWeightKg.toFixed(2)} kg</div>
                </div>
                <div className="bg-[#FAF7F2] rounded-xl p-2.5 border border-[#E6DDD1]">
                  <div className="text-[10px] text-[#6e5543]">Chargeable Weight</div>
                  <div className="text-sm font-bold text-[#224B85]">{evaluation.summary.totalChargeableWeightKg.toFixed(2)} kg</div>
                </div>
                <div className="bg-[#FAF7F2] rounded-xl p-2.5 border border-[#E6DDD1]">
                  <div className="text-[10px] text-[#6e5543]">Thể tích (CBM)</div>
                  <div className="text-sm font-bold text-[#3B281A]">{evaluation.summary.totalCbm.toFixed(3)} m³</div>
                </div>
                <div className="bg-[#FAF7F2] rounded-xl p-2.5 border border-[#E6DDD1]">
                  <div className="text-[10px] text-[#6e5543]">Kiện lớn nhất</div>
                  <div className="text-sm font-bold text-[#3B281A]">{evaluation.summary.largestItemDimsCm.join('×')} cm</div>
                </div>
              </div>
            )}

            {/* SOP Badges & Inter-province CBM Rule */}
            {(evaluation.zone !== 'HCM' || evaluation.summary.requiresTwoKtv || evaluation.summary.highValueSagawaNotice) && evaluation.summary.items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {evaluation.zone !== 'HCM' && (
                  <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 ${
                    evaluation.summary.totalCbm < 1
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}>
                    {evaluation.summary.totalCbm < 1
                      ? `Tổng ${evaluation.summary.totalCbm.toFixed(3)} m³ (< 1 m³) → Ưu tiên Sagawa rẻ hơn chành xe`
                      : `Tổng ${evaluation.summary.totalCbm.toFixed(3)} m³ (≥ 1 m³) → Ưu tiên Toàn Nhất Logistics (Chành xe)`}
                  </span>
                )}
                {evaluation.summary.requiresTwoKtv && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Hàng ≥ 25 kg: SOP yêu cầu bố trí ≥ 2 KTV nếu lắp đặt
                  </span>
                )}
                {evaluation.summary.highValueSagawaNotice && (
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 text-[11px] font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Đơn &gt; 20 triệu đ: SOP ưu tiên Sagawa / bảo hiểm hàng hóa
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Pickup Warehouse, Province, Distance & Toggles */}
          <div className="bg-white rounded-2xl border border-[#E6DDD1] p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#3B281A]" />
              <h3 className="text-sm font-bold text-[#3B281A]">2. Điểm lấy hàng, Khu vực giao & Tuyến đường</h3>
            </div>

            {/* Pickup Warehouse */}
            <div>
              <label className="text-[11px] font-semibold text-[#6e5543] block mb-1.5">Kho xuất hàng (Pick Up)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PICKUP_WAREHOUSES.map(w => {
                  const active = pickupWarehouse === w.code;
                  return (
                    <button
                      key={w.code}
                      type="button"
                      onClick={() => setPickupWarehouse(w.code)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        active
                          ? 'bg-[#3B281A] text-[#F8F4EC] border-[#3B281A] shadow-sm'
                          : 'bg-[#FAF7F2] text-[#3B281A] border-[#D6BCA5] hover:bg-[#EFE7DC]'
                      }`}
                    >
                      <div className="text-xs font-bold">{w.shortName}</div>
                      <div className={`text-[10px] mt-0.5 line-clamp-1 ${active ? 'text-[#D6BCA5]' : 'text-[#6e5543]'}`}>
                        {w.address}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Province + Zone + Distance */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="text-[11px] font-semibold text-[#6e5543] block mb-1">Tỉnh / Thành phố nhận hàng (63 tỉnh thành)</label>
                <div className="space-y-1">
                  <input
                    value={provinceSearch}
                    onChange={e => {
                      const val = e.target.value;
                      setProvinceSearch(val);
                      const exact = PROVINCE_ZONES.find(p => p.province.toLowerCase() === val.trim().toLowerCase());
                      if (exact) setProvince(exact.province);
                    }}
                    placeholder="Lọc nhanh tỉnh thành..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] text-xs outline-none"
                  />
                  <select
                    value={province}
                    onChange={e => setProvince(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-bold text-[#3B281A]"
                  >
                    {filteredProvinces.map(p => (
                      <option key={p.province} value={p.province}>
                        {p.province} — {DELIVERY_ZONE_META[p.zone].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="text-[11px] font-semibold text-[#6e5543] block mb-1">Delivery Radius (Tự động)</label>
                <div className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${zoneMeta.badgeClass}`}>
                  {zoneMeta.label}
                </div>
                <div className="text-[10px] text-[#6e5543] mt-1">{zoneMeta.excelLabel}</div>
              </div>

              <div className="sm:col-span-3">
                <label className="text-[11px] font-semibold text-[#6e5543] block mb-1">Khoảng cách (Km)</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={distanceKm}
                  onChange={e => setDistanceKm(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-sm font-bold text-[#3B281A]"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {[3, 5, 8.5, 12, 20].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDistanceKm(preset)}
                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                        distanceKm === preset ? 'bg-[#3B281A] text-white font-bold' : 'bg-[#EFE7DC] text-[#3B281A]'
                      }`}
                    >
                      {preset}km
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Customer address + Google Maps helper */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-[#6e5543] block mb-1">Địa chỉ khách hàng (tùy chọn để đo km & xuất báo giá)</label>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="VD: 120 Nguyễn Thị Minh Khai, Quận 3"
                  className="w-full px-3 py-2 rounded-lg border border-[#D6BCA5] text-xs"
                />
              </div>
              <a
                href={buildGoogleMapsDirectionsUrl(pickupWarehouse, address, province)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-lg border border-blue-700 bg-blue-50 text-blue-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-100 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Đo km Google Maps
              </a>
            </div>

            {/* Surcharge & Policy Toggles */}
            <div className="pt-2 border-t border-[#EFE7DC] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={rushHourRestricted}
                  onChange={e => setRushHourRestricted(e.target.checked)}
                  className="mt-0.5 accent-[#3B281A]"
                />
                <div>
                  <div className="font-semibold text-[#3B281A]">Giao giờ cấm tải TP.HCM (06h–09h / 16h–20h)</div>
                  <div className="text-[10px] text-[#6e5543]">Tự động loại Xe Tải và ưu tiên Xe Van / Xanh SM Van</div>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLoadingHelper}
                  onChange={e => setIncludeLoadingHelper(e.target.checked)}
                  className="mt-0.5 accent-[#3B281A]"
                />
                <div>
                  <div className="font-semibold text-[#3B281A]">Cộng thêm dịch vụ bốc xếp tận nơi</div>
                  <div className="text-[10px] text-[#6e5543]">Tài xế hỗ trợ bốc dỡ hàng nặng lên/xuống xe</div>
                </div>
              </label>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInstallFee}
                    onChange={e => setIncludeInstallFee(e.target.checked)}
                    className="accent-[#3B281A]"
                  />
                  <span className="font-semibold text-[#3B281A] flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5" /> Kèm phí lắp đặt KTV
                  </span>
                </label>
                {includeInstallFee && (
                  <input
                    type="number"
                    step={10000}
                    value={effectiveInstallFee}
                    onChange={e => setInstallFeeManual(Math.max(0, Number(e.target.value) || 0))}
                    className="w-28 px-2 py-1 rounded border border-[#D6BCA5] bg-white text-right font-bold text-[#3B281A]"
                  />
                )}
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DDD1]">
                <span className="font-semibold text-[#3B281A]">Làm tròn báo giá:</span>
                <select
                  value={rounding}
                  onChange={e => setRounding(e.target.value as RoundingMode)}
                  className="px-2 py-1 rounded border border-[#D6BCA5] bg-white font-semibold text-[#3B281A]"
                >
                  <option value="ROUND_1000">Làm tròn lên 1.000đ</option>
                  <option value="ROUND_10000">Làm tròn lên 10.000đ</option>
                  <option value="NONE">Giữ chính xác từng đồng</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5/12): Smart Recommendations & Customer Quote */}
        <div className="xl:col-span-5 space-y-4">
          {/* Hero Quote Summary Card */}
          <div className="bg-[#3B281A] text-[#F8F4EC] rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[#D6BCA5] font-semibold">
                Phương án báo giá đang chọn
              </span>
              {activeOption?.isRecommended && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 text-[10px] font-bold">
                  Đề xuất tối ưu nhất
                </span>
              )}
            </div>

            {!activeOption || evaluation.summary.items.length === 0 ? (
              <div className="py-4 text-xs text-[#D6BCA5]">
                Thêm ít nhất 1 sản phẩm và nhập số km (với HCM / Nội vùng) để xem báo giá đề xuất.
              </div>
            ) : (
              <>
                <div>
                  <div className="text-lg font-bold leading-snug">
                    {activeOption.name}
                    {activeOption.vehicleCount > 1 && ` (${activeOption.vehicleCount} xe)`}
                  </div>
                  <div className="text-3xl font-extrabold text-amber-300 mt-1">
                    {fmtVnd(activeOption.shippingCost + (includeInstallFee ? effectiveInstallFee : 0))}
                  </div>
                  <div className="text-[11px] text-[#D6BCA5] mt-1">
                    Phí ship: <strong>{fmtVnd(activeOption.shippingCost)}</strong>
                    {includeInstallFee && effectiveInstallFee > 0 && (
                      <> + Lắp đặt: <strong>{fmtVnd(effectiveInstallFee)}</strong></>
                    )}
                    {' • '}
                    {activeOption.breakdownText}
                  </div>
                </div>

                {evaluation.baselineCost > 0 && activeOption.savingsVsBaseline !== 0 && (
                  <div className={`rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-between ${
                    activeOption.savingsVsBaseline > 0
                      ? 'bg-emerald-900/60 border border-emerald-500/40 text-emerald-100'
                      : 'bg-white/10 border border-white/20 text-[#F8F4EC]'
                  }`}>
                    <span>So với {evaluation.baselineLabel} ({fmtVnd(evaluation.baselineCost)}):</span>
                    <span>
                      {activeOption.savingsVsBaseline > 0
                        ? `Tiết kiệm ${fmtVnd(activeOption.savingsVsBaseline)} (-${activeOption.savingsPctVsBaseline}%)`
                        : `+${fmtVnd(Math.abs(activeOption.savingsVsBaseline))}`}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyQuote}
                    className="px-3.5 py-2.5 rounded-xl bg-amber-400 text-[#2A1E15] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-300 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy báo giá Zalo/FB
                  </button>
                  {onNavigate && (user.role === 'ADMIN' || user.role === 'EDITOR') && (
                    <button
                      type="button"
                      onClick={handleCreateOrder}
                      className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5" /> Tạo đơn Điều phối
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* All Eligible Options Ranked */}
          <div className="bg-white rounded-2xl border border-[#E6DDD1] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#3B281A]">
                3. So sánh Ahamove • Xanh SM • Sagawa • Toàn Nhất ({filteredEligible.length} phương án phù hợp)
              </h3>
              <div className="flex flex-wrap gap-1">
                {CARRIER_FILTER_TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCarrierFilter(t.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                      carrierFilter === t.id
                        ? 'bg-[#3B281A] text-white'
                        : 'bg-[#FAF7F2] text-[#6e5543] hover:bg-[#EFE7DC]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredEligible.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#6e5543]">
                Không có phương án phù hợp trong bộ lọc này. Hãy kiểm tra lại kích thước kiện hoặc bỏ lọc hãng.
              </div>
            ) : (
              <div className="space-y-2 max-h-[540px] overflow-y-auto pr-0.5">
                {filteredEligible.map(opt => {
                  const selected = activeOption?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedOptionId(opt.id)}
                      className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                        selected
                          ? 'border-[#3B281A] bg-[#FAF7F2] ring-2 ring-[#3B281A]/15'
                          : 'border-[#E6DDD1] bg-white hover:border-[#D6BCA5]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${CARRIER_BADGE[opt.carrier] || 'bg-gray-100'}`}>
                              {opt.carrier}
                            </span>
                            {opt.isRecommended && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                                Rẻ & Phù hợp nhất
                              </span>
                            )}
                            {opt.highlightBadge && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-bold">
                                {opt.highlightBadge}
                              </span>
                            )}
                            {opt.isExcelBaseline && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 text-[10px] font-bold">
                                Mốc Excel cũ
                              </span>
                            )}
                            {!opt.rushHourBanned && (opt.serviceType === 'VAN' || opt.serviceType === 'BIKE') && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium">
                                24/7
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-[#3B281A] mt-1 flex items-center gap-1">
                            {selected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />}
                            <span>{opt.name}</span>
                            {opt.vehicleCount > 1 && (
                              <span className="text-amber-800">× {opt.vehicleCount} xe</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#6e5543] mt-0.5">
                            Thùng: {opt.bayLabel} • Tải ≤ {opt.maxWeightKg} kg
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-extrabold text-[#3B281A]">
                            {fmtVnd(applyRounding(opt.shippingCost, 'NONE'))}
                          </div>
                          {opt.savingsVsBaseline > 0 && !opt.isExcelBaseline && (
                            <div className="text-[10px] font-bold text-emerald-700">
                              -{fmtVnd(opt.savingsVsBaseline)} (-{opt.savingsPctVsBaseline}%)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-[#6e5543] mt-1.5 pt-1.5 border-t border-[#F0E8DE] flex flex-wrap justify-between gap-1">
                        <span>{opt.breakdownText}</span>
                      </div>
                      {opt.warnings.map((w, idx) => (
                        <div key={idx} className="text-[10px] text-amber-800 mt-1 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3 shrink-0" /> {w}
                        </div>
                      ))}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Ineligible options explanation */}
            {evaluation.ineligibleOptions.length > 0 && (
              <div className="pt-2 border-t border-[#EFE7DC]">
                <button
                  type="button"
                  onClick={() => setShowIneligible(s => !s)}
                  className="w-full flex items-center justify-between text-[11px] font-semibold text-[#6e5543] hover:text-[#3B281A] cursor-pointer"
                >
                  <span>Loại trừ {evaluation.ineligibleOptions.length} phương án không vừa thùng / sai tuyến (xem lý do)</span>
                  {showIneligible ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showIneligible && (
                  <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                    {evaluation.ineligibleOptions.map(opt => (
                      <div key={opt.id} className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-[11px]">
                        <div className="font-semibold text-gray-700">
                          [{opt.carrier}] {opt.name} <span className="text-gray-400">({opt.bayLabel})</span>
                        </div>
                        <div className="text-red-700 mt-0.5">{opt.rejectionReason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lazy Admin Tariff Editor Modal */}
      {showTariffsModal && (
        <Suspense fallback={null}>
          <TariffSettingsModal
            config={tariffConfig}
            onSaved={(nextCfg, meta) => {
              setTariffConfig(mergeShippingConfig(nextCfg));
              if (meta) setTariffMeta(meta);
            }}
            onClose={() => setShowTariffsModal(false)}
            onToast={onToast}
          />
        </Suspense>
      )}
    </div>
  );
}
