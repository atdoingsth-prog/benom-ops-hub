export type DeliveryZone = 'HCM' | 'INTRA_REGIONAL' | 'SUB_REGIONAL' | 'CROSS_REGIONAL';

export const DELIVERY_ZONE_META: Record<DeliveryZone, { label: string; excelLabel: string; badgeClass: string }> = {
  HCM: {
    label: 'Nội thành HCM',
    excelLabel: 'Nội thành HCM/ HCM Intra-province',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  INTRA_REGIONAL: {
    label: 'Nội vùng (Miền Đông / ĐBSCL)',
    excelLabel: 'Nội vùng/ Intra-regional',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  SUB_REGIONAL: {
    label: 'Cận vùng (Miền Trung / Tây Nguyên)',
    excelLabel: 'Cận vùng/ Sub-regional',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  CROSS_REGIONAL: {
    label: 'Liên vùng (Bắc Trung Bộ / Miền Bắc)',
    excelLabel: 'Liên vùng/ Cross-regional',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
};

export interface ProvinceZoneEntry {
  province: string;
  zone: DeliveryZone;
}

export const PROVINCE_ZONES: ProvinceZoneEntry[] = [
  { province: 'HCM', zone: 'HCM' },
  // Nội vùng (18)
  { province: 'Bình Dương', zone: 'INTRA_REGIONAL' },
  { province: 'Đồng Nai', zone: 'INTRA_REGIONAL' },
  { province: 'Bà Rịa - Vũng Tàu', zone: 'INTRA_REGIONAL' },
  { province: 'Tây Ninh', zone: 'INTRA_REGIONAL' },
  { province: 'Bình Phước', zone: 'INTRA_REGIONAL' },
  { province: 'Long An', zone: 'INTRA_REGIONAL' },
  { province: 'Tiền Giang', zone: 'INTRA_REGIONAL' },
  { province: 'Bến Tre', zone: 'INTRA_REGIONAL' },
  { province: 'Vĩnh Long', zone: 'INTRA_REGIONAL' },
  { province: 'Trà Vinh', zone: 'INTRA_REGIONAL' },
  { province: 'Đồng Tháp', zone: 'INTRA_REGIONAL' },
  { province: 'Cần Thơ', zone: 'INTRA_REGIONAL' },
  { province: 'Hậu Giang', zone: 'INTRA_REGIONAL' },
  { province: 'Sóc Trăng', zone: 'INTRA_REGIONAL' },
  { province: 'An Giang', zone: 'INTRA_REGIONAL' },
  { province: 'Kiên Giang', zone: 'INTRA_REGIONAL' },
  { province: 'Bạc Liêu', zone: 'INTRA_REGIONAL' },
  { province: 'Cà Mau', zone: 'INTRA_REGIONAL' },
  // Cận vùng (13)
  { province: 'Đà Nẵng', zone: 'SUB_REGIONAL' },
  { province: 'Quảng Nam', zone: 'SUB_REGIONAL' },
  { province: 'Quảng Ngãi', zone: 'SUB_REGIONAL' },
  { province: 'Bình Định', zone: 'SUB_REGIONAL' },
  { province: 'Phú Yên', zone: 'SUB_REGIONAL' },
  { province: 'Khánh Hoà', zone: 'SUB_REGIONAL' },
  { province: 'Ninh Thuận', zone: 'SUB_REGIONAL' },
  { province: 'Bình Thuận', zone: 'SUB_REGIONAL' },
  { province: 'Kon Tum', zone: 'SUB_REGIONAL' },
  { province: 'Gia Lai', zone: 'SUB_REGIONAL' },
  { province: 'Đắk Lắk', zone: 'SUB_REGIONAL' },
  { province: 'Đắk Nông', zone: 'SUB_REGIONAL' },
  { province: 'Lâm Đồng', zone: 'SUB_REGIONAL' },
  // Liên vùng (31)
  { province: 'Huế', zone: 'CROSS_REGIONAL' },
  { province: 'Quảng Trị', zone: 'CROSS_REGIONAL' },
  { province: 'Quảng Bình', zone: 'CROSS_REGIONAL' },
  { province: 'Hà Tĩnh', zone: 'CROSS_REGIONAL' },
  { province: 'Nghệ An', zone: 'CROSS_REGIONAL' },
  { province: 'Thanh Hóa', zone: 'CROSS_REGIONAL' },
  { province: 'Ninh Bình', zone: 'CROSS_REGIONAL' },
  { province: 'Hà Nam', zone: 'CROSS_REGIONAL' },
  { province: 'Nam Định', zone: 'CROSS_REGIONAL' },
  { province: 'Thái Bình', zone: 'CROSS_REGIONAL' },
  { province: 'Hưng Yên', zone: 'CROSS_REGIONAL' },
  { province: 'Hải Dương', zone: 'CROSS_REGIONAL' },
  { province: 'Hải Phòng', zone: 'CROSS_REGIONAL' },
  { province: 'Hà Nội', zone: 'CROSS_REGIONAL' },
  { province: 'Bắc Ninh', zone: 'CROSS_REGIONAL' },
  { province: 'Bắc Giang', zone: 'CROSS_REGIONAL' },
  { province: 'Vĩnh Phúc', zone: 'CROSS_REGIONAL' },
  { province: 'Phú Thọ', zone: 'CROSS_REGIONAL' },
  { province: 'Thái Nguyên', zone: 'CROSS_REGIONAL' },
  { province: 'Tuyên Quang', zone: 'CROSS_REGIONAL' },
  { province: 'Hà Giang', zone: 'CROSS_REGIONAL' },
  { province: 'Cao Bằng', zone: 'CROSS_REGIONAL' },
  { province: 'Lạng Sơn', zone: 'CROSS_REGIONAL' },
  { province: 'Quảng Ninh', zone: 'CROSS_REGIONAL' },
  { province: 'Bắc Kạn', zone: 'CROSS_REGIONAL' },
  { province: 'Yên Bái', zone: 'CROSS_REGIONAL' },
  { province: 'Lào Cai', zone: 'CROSS_REGIONAL' },
  { province: 'Lai Châu', zone: 'CROSS_REGIONAL' },
  { province: 'Điện Biên', zone: 'CROSS_REGIONAL' },
  { province: 'Sơn La', zone: 'CROSS_REGIONAL' },
  { province: 'Hòa Bình', zone: 'CROSS_REGIONAL' },
];

export function getZoneForProvince(province: string): DeliveryZone {
  const norm = String(province || '').trim().toLowerCase();
  const found = PROVINCE_ZONES.find(p => p.province.toLowerCase() === norm);
  return found ? found.zone : 'HCM';
}

export interface PickupWarehouseInfo {
  code: '3001' | '9005' | '1001';
  shortName: string;
  fullName: string;
  address: string;
  mapsOrigin: string;
}

export const PICKUP_WAREHOUSES: PickupWarehouseInfo[] = [
  {
    code: '3001',
    shortName: '3001 • Lê Thánh Tôn',
    fullName: 'Store 3001 — Parkson Lê Thánh Tôn (Q.1)',
    address: '35-45 Lê Thánh Tôn, Phường Bến Nghé, Quận 1, TP.HCM',
    mapsOrigin: '35-45 Le Thanh Ton, Ben Nghe, District 1, Ho Chi Minh City',
  },
  {
    code: '9005',
    shortName: '9005 • Kho Toàn Nhất',
    fullName: 'DC 9005 — Kho Toàn Nhất Logistics (BD02)',
    address: 'Số 10 Đại lộ Độc Lập, KCN Sóng Thần 1, Dĩ An, Bình Dương',
    mapsOrigin: 'KCN Song Than 1, Di An, Binh Duong, Vietnam',
  },
  {
    code: '1001',
    shortName: '1001 • Aeon Bình Tân',
    fullName: 'Pop-up 1001 — Aeon Mall Bình Tân',
    address: 'Số 1 Đường Số 17A, Bình Trị Đông B, Bình Tân, TP.HCM',
    mapsOrigin: 'Aeon Mall Binh Tan, Ho Chi Minh City',
  },
];

export function buildGoogleMapsDirectionsUrl(warehouseCode: string, destinationAddress: string, province: string): string {
  const wh = PICKUP_WAREHOUSES.find(w => w.code === warehouseCode) || PICKUP_WAREHOUSES[0];
  const destParts = [destinationAddress.trim(), province === 'HCM' ? 'TP. Hồ Chí Minh' : province, 'Vietnam']
    .filter(Boolean)
    .join(', ');
  const params = new URLSearchParams({
    api: '1',
    origin: wh.mapsOrigin,
    destination: destParts,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export interface QuoteItemInput {
  id: string;
  barcode: string;
  product_name: string;
  unit?: string;
  qty: number;
  actual_weight_kg: number;
  w_cm: number;
  d_cm: number;
  h_cm: number;
  retail_price?: number;
  install_fee_unit?: number;
  stock_3001?: number;
  stock_9005?: number;
  stock_1001?: number;
}

export function extractProductShippingDims(p: any): {
  actual_weight_kg: number;
  w_cm: number;
  d_cm: number;
  h_cm: number;
} {
  const boxW = Number(p.box_w_cm) || 0;
  const boxD = Number(p.box_d_cm) || 0;
  const boxH = Number(p.box_h_cm) || 0;
  const prodL = (Number(p.length_mm) || 0) / 10;
  const prodW = (Number(p.width_mm) || 0) / 10;
  const prodH = (Number(p.height_mm) || 0) / 10;

  return {
    actual_weight_kg: Math.round(((Number(p.net_weight_g) || 0) / 1000) * 10000) / 10000,
    w_cm: boxW > 0 ? boxW : prodL,
    d_cm: boxD > 0 ? boxD : prodW,
    h_cm: boxH > 0 ? boxH : prodH,
  };
}

export interface QuoteItemMetrics extends QuoteItemInput {
  volumetric_weight_unit_kg: number;
  chargeable_weight_unit_kg: number;
  line_actual_weight_kg: number;
  line_volumetric_weight_kg: number;
  line_chargeable_weight_kg: number;
  line_cbm: number;
  sum3DimsCm: number;
  maxDimCm: number;
  sortedDimsCm: [number, number, number];
}

export interface CartMetricsSummary {
  items: QuoteItemMetrics[];
  totalQty: number;
  totalActualWeightKg: number;
  totalVolumetricWeightKg: number;
  totalChargeableWeightKg: number;
  totalCbm: number;
  max1DimCm: number;
  max3DimsCm: number;
  largestItemDimsCm: [number, number, number];
  hasHeavySingleItem: boolean;
  requiresTwoKtv: boolean;
  totalGoodsValue: number;
  totalInstallFee: number;
  highValueSagawaNotice: boolean;
}

export function computeCartMetrics(rawItems: QuoteItemInput[]): CartMetricsSummary {
  let totalQty = 0;
  let totalActualWeightKg = 0;
  let totalVolumetricWeightKg = 0;
  let totalChargeableWeightKg = 0;
  let totalCbm = 0;
  let max1DimCm = 0;
  let max3DimsCm = 0;
  let largestItemDimsCm: [number, number, number] = [0, 0, 0];
  let hasHeavySingleItem = false;
  let totalGoodsValue = 0;
  let totalInstallFee = 0;

  const items: QuoteItemMetrics[] = rawItems.map(it => {
    const qty = Math.max(1, Number(it.qty) || 1);
    const actual = Math.max(0, Number(it.actual_weight_kg) || 0);
    const w = Math.max(0, Number(it.w_cm) || 0);
    const d = Math.max(0, Number(it.d_cm) || 0);
    const h = Math.max(0, Number(it.h_cm) || 0);
    const volUnit = (w * d * h) / 5000;
    const chargeUnit = Math.max(actual, volUnit);
    const lineActual = actual * qty;
    const lineVol = volUnit * qty;
    const lineCharge = chargeUnit * qty;
    const lineCbm = (w * d * h * qty) / 1_000_000;
    const sum3 = w + d + h;
    const sorted = ([w, d, h].sort((a, b) => b - a)) as [number, number, number];
    const maxDim = sorted[0];

    totalQty += qty;
    totalActualWeightKg += lineActual;
    totalVolumetricWeightKg += lineVol;
    totalChargeableWeightKg += lineCharge;
    totalCbm += lineCbm;
    if (maxDim > max1DimCm) max1DimCm = maxDim;
    if (sum3 > max3DimsCm) max3DimsCm = sum3;
    if (sorted[0] > largestItemDimsCm[0] || (sorted[0] === largestItemDimsCm[0] && sorted[1] > largestItemDimsCm[1])) {
      largestItemDimsCm = sorted;
    }
    if (actual >= 25) hasHeavySingleItem = true;
    totalGoodsValue += (Number(it.retail_price) || 0) * qty;
    totalInstallFee += (Number(it.install_fee_unit) || 0) * qty;

    return {
      ...it,
      qty,
      actual_weight_kg: actual,
      w_cm: w,
      d_cm: d,
      h_cm: h,
      volumetric_weight_unit_kg: volUnit,
      chargeable_weight_unit_kg: chargeUnit,
      line_actual_weight_kg: lineActual,
      line_volumetric_weight_kg: lineVol,
      line_chargeable_weight_kg: lineCharge,
      line_cbm: lineCbm,
      sum3DimsCm: sum3,
      maxDimCm: maxDim,
      sortedDimsCm: sorted,
    };
  });

  return {
    items,
    totalQty,
    totalActualWeightKg,
    totalVolumetricWeightKg,
    totalChargeableWeightKg,
    totalCbm,
    max1DimCm,
    max3DimsCm,
    largestItemDimsCm,
    hasHeavySingleItem,
    requiresTwoKtv: hasHeavySingleItem || totalActualWeightKg >= 25,
    totalGoodsValue,
    totalInstallFee,
    highValueSagawaNotice: totalGoodsValue > 20_000_000,
  };
}

export interface KmTier {
  upToKm: number | null; // null = infinity
  flat?: number; // base flat fee for first tier (e.g. 0..2km)
  perKm?: number; // rate per additional km inside this band
}

export type VehicleCategory = 'BIKE' | 'TRICYCLE' | 'VAN' | 'TRUCK';
export type CarrierBrand = 'Ahamove' | 'Xanh SM' | 'Sagawa' | '247 Express' | 'Toàn Nhất Logistics';

export interface VehicleTariff {
  id: string;
  carrier: 'Ahamove' | 'Xanh SM';
  name: string;
  category: VehicleCategory;
  maxWeightKg: number;
  maxCbm: number;
  bayDimsCm: [number, number, number]; // [L, W, H] sorted descending
  maxEdgeCm?: number; // optional strict edge check (motorbikes)
  maxSum3EdgesCm?: number; // optional L+W+H limit (motorbikes)
  rushHourBanned: boolean;
  isExcelBaseline?: boolean;
  allowMultiVehicle?: boolean;
  loadingHelperFee: number;
  note: string;
  kmTiers: KmTier[];
  bulkyBikeSurchargeMode?: 'AHAMOVE_EXCEL' | 'XSM_FLAT';
}

export interface ExpressZoneTariff {
  upTo1_5: number;
  upTo3: number;
  step0_5: number;
}

export interface SagawaZoneTariff {
  upTo2Kg: number;
  perKg2To30: number;
  perKgOver30: number;
}

export interface FreightZoneTariff {
  perCbm: number;
  pickupFlat: number;
  minCbm: number;
}

export interface ShippingConfig {
  vehicles: VehicleTariff[];
  expressRates: Record<DeliveryZone, ExpressZoneTariff>;
  sagawaRates: Record<DeliveryZone, SagawaZoneTariff>;
  freightRates: {
    INTRA_REGIONAL: FreightZoneTariff;
    SUB_REGIONAL: FreightZoneTariff;
    CROSS_REGIONAL: FreightZoneTariff;
  };
}

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  vehicles: [
    {
      id: 'xsm_bike_2h',
      carrier: 'Xanh SM',
      name: 'Xanh SM Express Giao 2H',
      category: 'BIKE',
      maxWeightKg: 30,
      maxCbm: 0.12,
      bayDimsCm: [50, 50, 40],
      maxEdgeCm: 50,
      maxSum3EdgesCm: 140,
      rushHourBanned: false,
      allowMultiVehicle: false,
      loadingHelperFee: 0,
      note: 'Xe máy điện giao trong 2 giờ — Tiết kiệm cho hàng nhỏ gọn nội thành.',
      kmTiers: [
        { upToKm: 4, flat: 20000 },
        { upToKm: null, perKm: 4300 },
      ],
    },
    {
      id: 'xsm_bike_1h',
      carrier: 'Xanh SM',
      name: 'Xanh SM Express Siêu Tốc 1H',
      category: 'BIKE',
      maxWeightKg: 30,
      maxCbm: 0.12,
      bayDimsCm: [50, 50, 40],
      maxEdgeCm: 50,
      maxSum3EdgesCm: 140,
      rushHourBanned: false,
      allowMultiVehicle: false,
      loadingHelperFee: 0,
      note: 'Xe máy điện giao nhanh hỏa tốc 1 giờ.',
      kmTiers: [
        { upToKm: 2, flat: 15000 },
        { upToKm: null, perKm: 5700 },
      ],
    },
    {
      id: 'xsm_bike_bulky',
      carrier: 'Xanh SM',
      name: 'Xanh SM Express Hàng Cồng Kềnh',
      category: 'BIKE',
      maxWeightKg: 50,
      maxCbm: 0.25,
      bayDimsCm: [70, 60, 60],
      maxEdgeCm: 70,
      maxSum3EdgesCm: 190,
      rushHourBanned: false,
      allowMultiVehicle: false,
      loadingHelperFee: 0,
      note: 'Xe máy điện chở hàng vừa (≤ 50 kg, ≤ 70×60×60 cm), đã gồm phụ phí cồng kềnh +15k.',
      kmTiers: [
        { upToKm: 2, flat: 30000 },
        { upToKm: null, perKm: 5700 },
      ],
      bulkyBikeSurchargeMode: 'XSM_FLAT',
    },
    {
      id: 'aha_bike_4h',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Máy 4H Tiết Kiệm',
      category: 'BIKE',
      maxWeightKg: 30,
      maxCbm: 0.12,
      bayDimsCm: [50, 50, 40],
      maxEdgeCm: 50,
      maxSum3EdgesCm: 140,
      rushHourBanned: false,
      allowMultiVehicle: false,
      loadingHelperFee: 0,
      note: 'Gói giao ghép 4H giá rẻ (0–10 km đồng giá 24.000đ).',
      kmTiers: [
        { upToKm: 10, flat: 24000 },
        { upToKm: null, perKm: 4000 },
      ],
    },
    {
      id: 'aha_bike_express',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Máy Siêu Tốc / Cồng Kềnh',
      category: 'BIKE',
      maxWeightKg: 80,
      maxCbm: 0.35,
      bayDimsCm: [90, 80, 60],
      maxEdgeCm: 90,
      maxSum3EdgesCm: 250,
      rushHourBanned: false,
      allowMultiVehicle: false,
      loadingHelperFee: 0,
      note: 'Hỗ trợ tới 80 kg / 1 cạnh ≤ 90 cm / tổng 3 cạnh ≤ 250 cm (tự động cộng phụ phí cồng kềnh +10k/+20k/+40k).',
      kmTiers: [
        { upToKm: 2, flat: 15700 },
        { upToKm: null, perKm: 5400 },
      ],
      bulkyBikeSurchargeMode: 'AHAMOVE_EXCEL',
    },
    {
      id: 'aha_bagac',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Ba Gác',
      category: 'TRICYCLE',
      maxWeightKg: 300,
      maxCbm: 2.0,
      bayDimsCm: [150, 120, 120],
      rushHourBanned: false,
      allowMultiVehicle: true,
      loadingHelperFee: 70000,
      note: 'Rẻ cho đồ dài ≤ 150 cm; lưu ý một số tuyến đường Q.1 / trung tâm cấm xe ba gác.',
      kmTiers: [
        { upToKm: 2, flat: 90000 },
        { upToKm: 10, perKm: 11000 },
        { upToKm: null, perKm: 9000 },
      ],
    },
    {
      id: 'xsm_van',
      carrier: 'Xanh SM',
      name: 'Xanh SM Van (VinFast EC Van • 24/7)',
      category: 'VAN',
      maxWeightKg: 600,
      maxCbm: 2.4,
      bayDimsCm: [160, 130, 125],
      rushHourBanned: false,
      allowMultiVehicle: true,
      loadingHelperFee: 70000,
      note: 'Xe Van điện chạy nội đô 24/7 không cấm tải — tiết kiệm ~25–30% so với Van 1000kg cho hàng ≤ 160 cm.',
      kmTiers: [
        { upToKm: 2, flat: 110000 },
        { upToKm: 10, perKm: 11000 },
        { upToKm: null, perKm: 9000 },
      ],
    },
    {
      id: 'aha_van_500',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Van 500kg (Chạy 24/7)',
      category: 'VAN',
      maxWeightKg: 500,
      maxCbm: 2.2,
      bayDimsCm: [170, 120, 120],
      rushHourBanned: false,
      allowMultiVehicle: true,
      loadingHelperFee: 70000,
      note: 'Vào nội đô TP.HCM 24/7 không cấm giờ cao điểm; phù hợp gương/đèn dài ≤ 170 cm.',
      kmTiers: [
        { upToKm: 2, flat: 118000 },
        { upToKm: 10, perKm: 10000 },
        { upToKm: 15, perKm: 9000 },
        { upToKm: null, perKm: 7500 },
      ],
    },
    {
      id: 'aha_truck_500',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Tải 500kg',
      category: 'TRUCK',
      maxWeightKg: 500,
      maxCbm: 3.5,
      bayDimsCm: [200, 140, 140],
      rushHourBanned: true,
      allowMultiVehicle: true,
      loadingHelperFee: 80000,
      note: 'Thùng rộng 200 cm chở được bàn/sofa 1M8 nhưng CẤM TẢI TP.HCM 06h–09h & 16h–20h.',
      kmTiers: [
        { upToKm: 2, flat: 118000 },
        { upToKm: 10, perKm: 10500 },
        { upToKm: 15, perKm: 9000 },
        { upToKm: null, perKm: 7500 },
      ],
    },
    {
      id: 'aha_van_1000',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Van 1000kg [Chuẩn Excel • 24/7]',
      category: 'VAN',
      maxWeightKg: 1000,
      maxCbm: 4.5,
      bayDimsCm: [230, 170, 150],
      rushHourBanned: false,
      isExcelBaseline: true,
      allowMultiVehicle: true,
      loadingHelperFee: 100000,
      note: 'Mốc chuẩn file Excel (162k / 2km đầu) — Chạy 24/7, chứa được bàn/sofa ≤ 230 cm.',
      kmTiers: [
        { upToKm: 2, flat: 162000 },
        { upToKm: 10, perKm: 15218 },
        { upToKm: 15, perKm: 12764 },
        { upToKm: 30, perKm: 10800 },
        { upToKm: null, perKm: 8100 },
      ],
    },
    {
      id: 'aha_truck_1000',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Tải 1000kg',
      category: 'TRUCK',
      maxWeightKg: 1000,
      maxCbm: 7.0,
      bayDimsCm: [300, 160, 170],
      rushHourBanned: true,
      allowMultiVehicle: true,
      loadingHelperFee: 120000,
      note: 'Thùng dài 300 cm (chở nhiều sofa/tủ lớn), CẤM TẢI TP.HCM 06h–09h & 16h–20h.',
      kmTiers: [
        { upToKm: 2, flat: 175000 },
        { upToKm: 10, perKm: 15500 },
        { upToKm: 15, perKm: 13000 },
        { upToKm: 30, perKm: 11000 },
        { upToKm: null, perKm: 8500 },
      ],
    },
    {
      id: 'aha_truck_1500',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Tải 1500kg',
      category: 'TRUCK',
      maxWeightKg: 1500,
      maxCbm: 8.0,
      bayDimsCm: [320, 160, 170],
      rushHourBanned: true,
      allowMultiVehicle: true,
      loadingHelperFee: 150000,
      note: 'Đơn nhiều kiện lớn hoặc công trình, CẤM TẢI TP.HCM 06h–09h & 16h–20h.',
      kmTiers: [
        { upToKm: 2, flat: 215000 },
        { upToKm: 10, perKm: 17500 },
        { upToKm: 15, perKm: 15000 },
        { upToKm: 30, perKm: 12500 },
        { upToKm: null, perKm: 9500 },
      ],
    },
    {
      id: 'aha_truck_2000',
      carrier: 'Ahamove',
      name: 'Ahamove Xe Tải 2000kg',
      category: 'TRUCK',
      maxWeightKg: 2000,
      maxCbm: 10.5,
      bayDimsCm: [380, 175, 175],
      rushHourBanned: true,
      allowMultiVehicle: true,
      loadingHelperFee: 180000,
      note: 'Xe tải lớn chở trọn gói nội thất dự án, CẤM TẢI TP.HCM 06h–09h & 16h–20h.',
      kmTiers: [
        { upToKm: 2, flat: 245500 },
        { upToKm: 10, perKm: 19500 },
        { upToKm: 15, perKm: 16500 },
        { upToKm: 30, perKm: 14000 },
        { upToKm: null, perKm: 11000 },
      ],
    },
  ],
  expressRates: {
    HCM: { upTo1_5: 22000, upTo3: 30000, step0_5: 3600 },
    INTRA_REGIONAL: { upTo1_5: 30000, upTo3: 50000, step0_5: 6000 },
    SUB_REGIONAL: { upTo1_5: 40000, upTo3: 70000, step0_5: 9600 },
    CROSS_REGIONAL: { upTo1_5: 50000, upTo3: 80000, step0_5: 10800 },
  },
  sagawaRates: {
    HCM: { upTo2Kg: 35000, perKg2To30: 5500, perKgOver30: 4200 },
    INTRA_REGIONAL: { upTo2Kg: 48000, perKg2To30: 8500, perKgOver30: 6500 },
    SUB_REGIONAL: { upTo2Kg: 60000, perKg2To30: 11200, perKgOver30: 8200 },
    CROSS_REGIONAL: { upTo2Kg: 73000, perKg2To30: 13468, perKgOver30: 9800 },
  },
  freightRates: {
    INTRA_REGIONAL: { perCbm: 500000, pickupFlat: 500000, minCbm: 1.0 },
    SUB_REGIONAL: { perCbm: 650000, pickupFlat: 550000, minCbm: 1.0 },
    CROSS_REGIONAL: { perCbm: 800000, pickupFlat: 550000, minCbm: 1.0 },
  },
};

export function mergeShippingConfig(override?: Partial<ShippingConfig> | null): ShippingConfig {
  if (!override || typeof override !== 'object') return DEFAULT_SHIPPING_CONFIG;
  const overrideMap = new Map<string, Partial<VehicleTariff>>();
  if (Array.isArray(override.vehicles)) {
    for (const v of override.vehicles) {
      if (v && v.id) overrideMap.set(v.id, v);
    }
  }
  return {
    vehicles: DEFAULT_SHIPPING_CONFIG.vehicles.map(base => {
      const ov = overrideMap.get(base.id);
      if (!ov) return base;
      return {
        ...base,
        ...ov,
        bayDimsCm: Array.isArray(ov.bayDimsCm) && ov.bayDimsCm.length === 3 ? ov.bayDimsCm : base.bayDimsCm,
        kmTiers: Array.isArray(ov.kmTiers) && ov.kmTiers.length > 0 ? ov.kmTiers : base.kmTiers,
      };
    }),
    expressRates: {
      HCM: { ...DEFAULT_SHIPPING_CONFIG.expressRates.HCM, ...(override.expressRates?.HCM || {}) },
      INTRA_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.expressRates.INTRA_REGIONAL, ...(override.expressRates?.INTRA_REGIONAL || {}) },
      SUB_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.expressRates.SUB_REGIONAL, ...(override.expressRates?.SUB_REGIONAL || {}) },
      CROSS_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.expressRates.CROSS_REGIONAL, ...(override.expressRates?.CROSS_REGIONAL || {}) },
    },
    sagawaRates: {
      HCM: { ...DEFAULT_SHIPPING_CONFIG.sagawaRates.HCM, ...(override.sagawaRates?.HCM || {}) },
      INTRA_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.sagawaRates.INTRA_REGIONAL, ...(override.sagawaRates?.INTRA_REGIONAL || {}) },
      SUB_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.sagawaRates.SUB_REGIONAL, ...(override.sagawaRates?.SUB_REGIONAL || {}) },
      CROSS_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.sagawaRates.CROSS_REGIONAL, ...(override.sagawaRates?.CROSS_REGIONAL || {}) },
    },
    freightRates: {
      INTRA_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.freightRates.INTRA_REGIONAL, ...(override.freightRates?.INTRA_REGIONAL || {}) },
      SUB_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.freightRates.SUB_REGIONAL, ...(override.freightRates?.SUB_REGIONAL || {}) },
      CROSS_REGIONAL: { ...DEFAULT_SHIPPING_CONFIG.freightRates.CROSS_REGIONAL, ...(override.freightRates?.CROSS_REGIONAL || {}) },
    },
  };
}

export function calcTieredKmCost(km: number, tiers: KmTier[]): number {
  if (km <= 0 || !tiers.length) return 0;
  let total = 0;
  let prevEdge = 0;
  for (const tier of tiers) {
    const edge = tier.upToKm === null ? Infinity : tier.upToKm;
    if (tier.flat !== undefined) {
      if (km > prevEdge) {
        total += tier.flat;
      }
      if (km <= edge) break;
      prevEdge = edge;
    } else if (tier.perKm !== undefined) {
      if (km <= prevEdge) break;
      const bandKm = Math.min(km, edge) - prevEdge;
      if (bandKm > 0) total += bandKm * tier.perKm;
      if (km <= edge) break;
      prevEdge = edge;
    }
  }
  return Math.round(total);
}

export function fitsCargoBay(itemSortedDims: [number, number, number], baySortedDims: [number, number, number]): boolean {
  const [iL, iW, iH] = [...itemSortedDims].sort((a, b) => b - a);
  const [bL, bW, bH] = [...baySortedDims].sort((a, b) => b - a);
  return iL <= bL && iW <= bW && iH <= bH;
}

export type RoundingMode = 'NONE' | 'ROUND_1000' | 'ROUND_10000';

export function applyRounding(amount: number, mode: RoundingMode): number {
  if (amount <= 0) return 0;
  if (mode === 'ROUND_1000') return Math.ceil(amount / 1000) * 1000;
  if (mode === 'ROUND_10000') return Math.ceil(amount / 10000) * 10000;
  return Math.round(amount);
}

export interface EvaluatedShippingOption {
  id: string;
  carrier: CarrierBrand;
  serviceType: 'BIKE' | 'TRICYCLE' | 'VAN' | 'TRUCK' | 'SAGAWA' | 'EXPRESS' | 'FREIGHT';
  name: string;
  dispatchCarrierValue: string; // maps to benom Orders CARRIER_OPTIONS
  eligible: boolean;
  rejectionReason: string;
  warnings: string[];
  highlightBadge?: string;
  vehicleCount: number;
  maxWeightKg: number;
  maxCbm: number;
  bayLabel: string;
  rushHourBanned: boolean;
  isExcelBaseline: boolean;
  baseFreightCost: number;
  bulkySurcharge: number;
  loadingHelperFee: number;
  shippingCost: number;
  breakdownText: string;
  savingsVsBaseline: number;
  savingsPctVsBaseline: number;
  note: string;
  isRecommended?: boolean;
}

export interface EvaluateShippingInput {
  items: QuoteItemInput[];
  pickupWarehouse: string;
  province: string;
  distanceKm: number;
  rushHourRestricted: boolean;
  includeLoadingHelper: boolean;
  rounding: RoundingMode;
}

export interface ShippingEvaluationResult {
  zone: DeliveryZone;
  summary: CartMetricsSummary;
  baselineCost: number;
  baselineLabel: string;
  eligibleOptions: EvaluatedShippingOption[];
  ineligibleOptions: EvaluatedShippingOption[];
  recommendedOption: EvaluatedShippingOption | null;
}

export function evaluateShippingOptions(
  input: EvaluateShippingInput,
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG
): ShippingEvaluationResult {
  const summary = computeCartMetrics(input.items);
  const zone = getZoneForProvince(input.province);
  const km = Math.max(0, Number(input.distanceKm) || 0);

  // Baseline = Excel formula (Ahamove Van 1000kg when km > 0 in HCM/INTRA_REGIONAL, else Freight/Express)
  const van1000 = config.vehicles.find(v => v.id === 'aha_van_1000') || config.vehicles[config.vehicles.length - 1];
  const vanCountForBaseline = Math.max(
    1,
    Math.ceil((summary.totalChargeableWeightKg || 0.1) / van1000.maxWeightKg),
    Math.ceil((summary.totalCbm || 0.001) / van1000.maxCbm)
  );
  const van1000BaseSingle = calcTieredKmCost(km, van1000.kmTiers);
  const van1000Helper = input.includeLoadingHelper ? van1000.loadingHelperFee * vanCountForBaseline : 0;
  const van1000Cost = km > 0 ? applyRounding(van1000BaseSingle * vanCountForBaseline + van1000Helper, input.rounding) : 0;

  const options: EvaluatedShippingOption[] = [];

  if (summary.items.length > 0) {
    // 1. Evaluate distance-based Ahamove & Xanh SM fleet
    for (const v of config.vehicles) {
      const baySorted = [...v.bayDimsCm].sort((a, b) => b - a) as [number, number, number];
      const bayLabel = `${baySorted[0]}×${baySorted[1]}×${baySorted[2]} cm`;
      let eligible = true;
      let rejectionReason = '';
      const warnings: string[] = [];

      if (zone === 'SUB_REGIONAL' || zone === 'CROSS_REGIONAL') {
        eligible = false;
        rejectionReason = 'Tuyến cận vùng / liên vùng — dùng Chuyển phát nhanh hoặc Chành xe.';
      } else if (km <= 0) {
        eligible = false;
        rejectionReason = 'Nhập số km (> 0) để tính cước Ahamove / Xanh SM.';
      } else if (zone === 'INTRA_REGIONAL' && v.category === 'BIKE' && km > 35) {
        eligible = false;
        rejectionReason = `Quãng đường ${km} km quá xa cho xe máy nội vùng (khuyên dùng CPN / Van).`;
      }

      // Check every item's single-package fit into cargo bay
      if (eligible) {
        const oversizedItem = summary.items.find(it => {
          if (v.maxEdgeCm && it.maxDimCm > v.maxEdgeCm) return true;
          if (v.maxSum3EdgesCm && it.sum3DimsCm > v.maxSum3EdgesCm) return true;
          return !fitsCargoBay(it.sortedDimsCm, baySorted);
        });
        if (oversizedItem) {
          eligible = false;
          if (v.maxEdgeCm && oversizedItem.maxDimCm > v.maxEdgeCm) {
            rejectionReason = `Kiện "${oversizedItem.product_name}" cạnh ${oversizedItem.maxDimCm} cm vượt giới hạn ${v.maxEdgeCm} cm.`;
          } else if (v.maxSum3EdgesCm && oversizedItem.sum3DimsCm > v.maxSum3EdgesCm) {
            rejectionReason = `Tổng 3 chiều "${oversizedItem.product_name}" (${oversizedItem.sum3DimsCm} cm) vượt ${v.maxSum3EdgesCm} cm.`;
          } else {
            rejectionReason = `Kích thước "${oversizedItem.product_name}" (${oversizedItem.sortedDimsCm.join('×')} cm) vượt thùng (${bayLabel}).`;
          }
        }
      }

      let vehicleCount = 1;
      if (eligible) {
        if (!v.allowMultiVehicle) {
          if (summary.totalChargeableWeightKg > v.maxWeightKg) {
            eligible = false;
            rejectionReason = `Tổng trọng lượng tính cước ${summary.totalChargeableWeightKg.toFixed(1)} kg vượt mức ${v.maxWeightKg} kg.`;
          } else if (summary.totalCbm > v.maxCbm) {
            eligible = false;
            rejectionReason = `Tổng thể tích ${summary.totalCbm.toFixed(3)} m³ vượt thùng xe (${v.maxCbm} m³).`;
          }
        } else {
          vehicleCount = Math.max(
            1,
            Math.ceil((summary.totalChargeableWeightKg || 0.1) / v.maxWeightKg),
            Math.ceil((summary.totalCbm || 0.001) / v.maxCbm)
          );
          if (vehicleCount > 1) {
            warnings.push(`Tự tách ${vehicleCount} chuyến/xe do vượt tải (${v.maxWeightKg} kg / ${v.maxCbm} m³).`);
          }
        }
      }

      if (eligible && input.rushHourRestricted && v.rushHourBanned) {
        eligible = false;
        rejectionReason = 'Khung giờ cấm tải TP.HCM (06h–09h & 16h–20h) — chọn Xe Van / Xanh SM Van.';
      } else if (v.rushHourBanned && zone === 'HCM') {
        warnings.push('Lưu ý giờ cấm tải TP.HCM: 06h–09h & 16h–20h.');
      }

      // Compute cost
      const singleKmCost = km > 0 ? calcTieredKmCost(km, v.kmTiers) : 0;
      let bulkySurcharge = 0;
      if (v.bulkyBikeSurchargeMode === 'AHAMOVE_EXCEL') {
        const w = summary.totalChargeableWeightKg;
        const s3 = summary.max3DimsCm;
        const tierW = w <= 5 ? 1 : w <= 30 ? 2 : w <= 40 ? 3 : w <= 60 ? 4 : 5;
        const tierS = s3 <= 69 ? 1 : s3 <= 140 ? 2 : s3 <= 170 ? 3 : s3 <= 200 ? 4 : 5;
        const tierFinal = Math.max(tierW, tierS);
        bulkySurcharge = tierFinal === 3 ? 10000 : tierFinal === 4 ? 20000 : tierFinal >= 5 ? 40000 : 0;
      }

      const baseFreightCost = singleKmCost * vehicleCount;
      const loadingHelperFee = input.includeLoadingHelper ? v.loadingHelperFee * vehicleCount : 0;
      const rawTotal = baseFreightCost + bulkySurcharge + loadingHelperFee;
      const shippingCost = km > 0 ? applyRounding(rawTotal, input.rounding) : 0;

      const breakdownParts = [
        `${km} km × ${vehicleCount} xe = ${baseFreightCost.toLocaleString('vi-VN')}đ`,
      ];
      if (bulkySurcharge > 0) breakdownParts.push(`+ Cồng kềnh ${bulkySurcharge.toLocaleString('vi-VN')}đ`);
      if (loadingHelperFee > 0) breakdownParts.push(`+ Bốc xếp ${loadingHelperFee.toLocaleString('vi-VN')}đ`);

      options.push({
        id: v.id,
        carrier: v.carrier,
        serviceType: v.category,
        name: v.name,
        dispatchCarrierValue: v.carrier === 'Xanh SM' ? 'Xanh SM' : 'Ahamove',
        eligible,
        rejectionReason,
        warnings,
        vehicleCount,
        maxWeightKg: v.maxWeightKg,
        maxCbm: v.maxCbm,
        bayLabel,
        rushHourBanned: v.rushHourBanned,
        isExcelBaseline: Boolean(v.isExcelBaseline),
        baseFreightCost,
        bulkySurcharge,
        loadingHelperFee,
        shippingCost,
        breakdownText: km > 0 ? breakdownParts.join(' ') : 'Chưa nhập km',
        savingsVsBaseline: 0,
        savingsPctVsBaseline: 0,
        note: v.note,
      });
    }

    // 2. Evaluate Sagawa (Ưu tiên hàng đi tỉnh < 1 m³, tính theo Chargeable Weight)
    const sagRate = config.sagawaRates[zone];
    const w = summary.totalChargeableWeightKg;
    let sagCost = 0;
    if (w > 0) {
      if (w <= 2) sagCost = sagRate.upTo2Kg;
      else if (w <= 30) sagCost = sagRate.upTo2Kg + (w - 2) * sagRate.perKg2To30;
      else sagCost = sagRate.upTo2Kg + 28 * sagRate.perKg2To30 + (w - 30) * sagRate.perKgOver30;
    }
    const sagEligible = w > 0 && summary.max1DimCm <= 220 && summary.totalCbm <= 2.5;
    const sagRejection = w <= 0
      ? 'Chưa có thông tin cân nặng / kích thước.'
      : summary.max1DimCm > 220
        ? `Kiện dài ${summary.max1DimCm} cm vượt giới hạn Sagawa (≤ 220 cm) — dùng Toàn Nhất Logistics.`
        : `Tổng thể tích ${summary.totalCbm.toFixed(2)} m³ vượt ngưỡng 2.5 m³ — chuyển sang Toàn Nhất Logistics.`;
    const sagWarnings: string[] = [];
    if (zone !== 'HCM' && summary.totalCbm >= 1) {
      sagWarnings.push('Tổng thể tích ≥ 1 m³ — Toàn Nhất Logistics (Chành xe) thường tiết kiệm hơn.');
    }
    if (summary.highValueSagawaNotice) {
      sagWarnings.push('Đơn > 20 triệu đ: SOP benom ưu tiên Sagawa / bảo hiểm hàng hóa.');
    }
    const sagHighlight = zone !== 'HCM' && summary.totalCbm < 1 ? 'Tối ưu < 1 m³' : undefined;

    options.push({
      id: 'sagawa_express',
      carrier: 'Sagawa',
      serviceType: 'SAGAWA',
      name: `Sagawa Đường Bộ / Express (${DELIVERY_ZONE_META[zone].label})`,
      dispatchCarrierValue: 'Sagawa',
      eligible: sagEligible,
      rejectionReason: sagRejection,
      warnings: sagWarnings,
      highlightBadge: sagHighlight,
      vehicleCount: 1,
      maxWeightKg: 500,
      maxCbm: 2.5,
      bayLabel: '1 cạnh ≤ 220 cm • ≤ 2.5 m³',
      rushHourBanned: false,
      isExcelBaseline: false,
      baseFreightCost: Math.round(sagCost),
      bulkySurcharge: 0,
      loadingHelperFee: 0,
      shippingCost: applyRounding(sagCost, input.rounding),
      breakdownText: `Tính cước ${w.toFixed(2)} kg • ${summary.totalCbm.toFixed(3)} m³ (${summary.totalCbm < 1 ? '< 1 m³' : '≥ 1 m³'})`,
      savingsVsBaseline: 0,
      savingsPctVsBaseline: 0,
      note: 'Hiệu chuẩn theo đơn thực tế benom (VD: 3001020005047 Kệ Claro 13kg Hà Nội = 221k). Tối ưu cho hàng đi tỉnh < 1 m³.',
    });

    // 3. Evaluate 247 Express weight-tier (Hàng nhỏ gọn ≤ 10 kg, cạnh ≤ 90 cm — Chuẩn Excel)
    const expRate = config.expressRates[zone];
    let expCost = 0;
    if (w > 0) {
      if (w <= 1.5) expCost = expRate.upTo1_5;
      else if (w <= 3) expCost = expRate.upTo3;
      else expCost = expRate.upTo3 + Math.ceil((w - 3) / 0.5) * expRate.step0_5;
    }
    const expEligible = w > 0 && w <= 10 && summary.max1DimCm <= 90 && summary.max3DimsCm <= 180;
    const expRejection = w <= 0
      ? 'Chưa có thông tin cân nặng / kích thước.'
      : w > 10
        ? `Trọng lượng tính cước ${w.toFixed(1)} kg vượt ngưỡng 247 Express (≤ 10 kg) — chọn Sagawa hoặc Toàn Nhất.`
        : summary.max1DimCm > 90
          ? `Kiện dài ${summary.max1DimCm} cm vượt giới hạn cạnh 247 Express (≤ 90 cm).`
          : summary.max3DimsCm > 180
            ? `Tổng 3 chiều (${summary.max3DimsCm} cm) vượt giới hạn 247 Express (≤ 180 cm).`
            : '';

    options.push({
      id: 'cpn_247_sagawa',
      carrier: '247 Express',
      serviceType: 'EXPRESS',
      name: '247 Express (Chuyển phát nhanh ≤ 10 kg)',
      dispatchCarrierValue: '247 Express',
      eligible: expEligible,
      rejectionReason: expRejection,
      warnings: [],
      vehicleCount: 1,
      maxWeightKg: 10,
      maxCbm: 0.25,
      bayLabel: '1 cạnh ≤ 90 cm • 3 chiều ≤ 180 cm',
      rushHourBanned: false,
      isExcelBaseline: false,
      baseFreightCost: expCost,
      bulkySurcharge: 0,
      loadingHelperFee: 0,
      shippingCost: applyRounding(expCost, input.rounding),
      breakdownText: `Tính cước ${w.toFixed(2)} kg • Vùng ${DELIVERY_ZONE_META[zone].label}`,
      savingsVsBaseline: 0,
      savingsPctVsBaseline: 0,
      note: 'Bảng cước chuẩn Excel (≤1.5kg, ≤3kg, bước +0.5kg). Rẻ cho phụ kiện/hàng nhẹ ≤10kg.',
    });

    // 4. Evaluate Toàn Nhất Logistics / Chành xe (Ưu tiên hàng đi tỉnh ≥ 1 m³)
    if (zone !== 'HCM') {
      const fr = config.freightRates[zone];
      const minCbm = Number(fr.minCbm) > 0 ? Number(fr.minCbm) : 1;
      const billableCbm = summary.totalCbm > 0 ? Math.max(minCbm, summary.totalCbm) : 0;
      const baseCbmCost = Math.round(billableCbm * fr.perCbm);
      const freightRaw = summary.totalCbm > 0 ? baseCbmCost + fr.pickupFlat : 0;
      const frWarnings: string[] = [];
      if (summary.totalCbm < minCbm) {
        frWarnings.push(`Hàng < ${minCbm} m³ (tối thiểu ${minCbm} m³) — nên ưu tiên Sagawa để tiết kiệm hơn.`);
      } else {
        frWarnings.push('Phí đã ước tính gồm trung chuyển & VAT 8% (giao chành/tận nơi tùy tuyến).');
      }
      options.push({
        id: 'toan_nhat_logistics',
        carrier: 'Toàn Nhất Logistics',
        serviceType: 'FREIGHT',
        name: `Toàn Nhất Logistics / Chành xe (${DELIVERY_ZONE_META[zone].label})`,
        dispatchCarrierValue: 'Toàn Nhất Logistics',
        eligible: summary.totalCbm > 0,
        rejectionReason: summary.totalCbm <= 0 ? 'Chưa có kích thước thùng để tính CBM.' : '',
        warnings: frWarnings,
        highlightBadge: summary.totalCbm >= 1 ? 'Tối ưu ≥ 1 m³' : undefined,
        vehicleCount: 1,
        maxWeightKg: 5000,
        maxCbm: 20,
        bayLabel: 'Hàng khối CBM (Tối ưu ≥ 1 m³)',
        rushHourBanned: false,
        isExcelBaseline: false,
        baseFreightCost: baseCbmCost,
        bulkySurcharge: fr.pickupFlat,
        loadingHelperFee: 0,
        shippingCost: applyRounding(freightRaw, input.rounding),
        breakdownText: `${billableCbm.toFixed(3)} m³${summary.totalCbm < minCbm ? ' (tối thiểu)' : ''} × ${fr.perCbm.toLocaleString('vi-VN')}đ + ${fr.pickupFlat.toLocaleString('vi-VN')}đ trung chuyển`,
        savingsVsBaseline: 0,
        savingsPctVsBaseline: 0,
        note: 'Hiệu chuẩn theo đơn thực tế benom (3001020004889 Sofa Murest Quảng Ngãi 1.24m³ = 1.36tr). Tối ưu cho hàng ≥ 1 m³.',
      });
    }
  }

  // Determine comparison baseline (Excel Van 1000kg for HCM/INTRA_REGIONAL with km > 0, else alternate inter-city carrier)
  const sagOptRaw = options.find(o => o.id === 'sagawa_express' && o.eligible);
  const tnlOptRaw = options.find(o => o.id === 'toan_nhat_logistics' && o.eligible);
  const intercityHigherCost = Math.max(sagOptRaw?.shippingCost || 0, tnlOptRaw?.shippingCost || 0);
  const baselineCost =
    van1000Cost > 0
      ? van1000Cost
      : intercityHigherCost;
  const baselineLabel =
    van1000Cost > 0
      ? 'Xe Van 1000kg (Chuẩn Excel)'
      : summary.totalCbm >= 1
        ? 'Phương án còn lại (Sagawa)'
        : 'Phương án còn lại (Chành xe)';

  for (const opt of options) {
    if (baselineCost > 0 && opt.shippingCost > 0) {
      opt.savingsVsBaseline = baselineCost - opt.shippingCost;
      opt.savingsPctVsBaseline = Math.round(((baselineCost - opt.shippingCost) / baselineCost) * 100);
    }
  }

  const eligibleOptions = options
    .filter(o => o.eligible)
    .sort((a, b) => {
      if (a.shippingCost !== b.shippingCost) return a.shippingCost - b.shippingCost;
      // Tie-breaker: prefer 24/7 no-ban & higher value options
      if (a.rushHourBanned !== b.rushHourBanned) return a.rushHourBanned ? 1 : -1;
      return 0;
    });

  const ineligibleOptions = options.filter(o => !o.eligible);

  // Pick #1 recommended option: cheapest eligible option (preferring Sagawa if > 20M inter-province & < 1m3)
  let recommendedOption: EvaluatedShippingOption | null = eligibleOptions[0] || null;
  if (zone !== 'HCM' && summary.highValueSagawaNotice && summary.totalCbm < 1) {
    const sagOpt = eligibleOptions.find(o => o.id === 'sagawa_express');
    if (sagOpt) recommendedOption = sagOpt;
  }
  if (recommendedOption) recommendedOption.isRecommended = true;

  return {
    zone,
    summary,
    baselineCost,
    baselineLabel,
    eligibleOptions,
    ineligibleOptions,
    recommendedOption,
  };
}

export function formatCustomerQuoteText(params: {
  warehouseCode: string;
  province: string;
  address: string;
  distanceKm: number;
  zone: DeliveryZone;
  summary: CartMetricsSummary;
  option: EvaluatedShippingOption;
  includeInstallFee: boolean;
  installFeeOverride: number;
}): string {
  const fmt = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
  const destination = `${params.address ? `${params.address}, ` : ''}${params.province} (${DELIVERY_ZONE_META[params.zone].label})${params.distanceKm > 0 ? ` — ${params.distanceKm} km` : ''}`;
  const lines: string[] = [
    `Điểm giao: ${destination}`,
    `Phương án đề xuất: ${params.option.name}${params.option.vehicleCount > 1 ? ` (${params.option.vehicleCount} xe)` : ''}`,
    `Phí vận chuyển dự kiến: ${fmt(params.option.shippingCost)}`,
  ];

  const installCost = params.includeInstallFee ? Math.max(0, Number(params.installFeeOverride) || 0) : 0;
  if (installCost > 0) {
    lines.push(`Phí lắp đặt dự kiến: ${fmt(installCost)}`);
    lines.push(`Tổng cộng: ${fmt(params.option.shippingCost + installCost)}`);
  }
  return lines.join('\n');
}
