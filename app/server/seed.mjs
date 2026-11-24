import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { getDb, DB_PATH } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..'); // d:\Projects\benom operations SOP
const DATA = path.join(ROOT, '03_data');
const IMPORTED = path.join(ROOT, '05_imported_benom');

function readCsv(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return parse(raw, {
    relax_column_count: true,
    skip_empty_lines: true,
    ...options,
  });
}

function num(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/VND|đ|,|\s/gi, '').trim();
  if (!s || s === '-' || s.startsWith('#')) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanPhone(v) {
  let s = String(v || '').replace(/[^\d]/g, '');
  if (s.length === 9 && !s.startsWith('0')) s = '0' + s;
  return s;
}

function normalizeCarrier(v) {
  const s = String(v || '').trim();
  const l = s.toLowerCase();
  if (!s) return '';
  if (l.includes('aha')) return 'Ahamove';
  if (l.includes('xanh') || l.includes('green')) return 'Xanh SM';
  if (l.includes('sagawa')) return 'Sagawa';
  if (l.includes('247')) return '247 Express';
  if (l.includes('nhất tín') || l.includes('nhat tin')) return 'Nhất Tín Logistics';
  if (l.includes('toàn nhất') || l.includes('toan nhat')) return 'Toàn Nhất Logistics';
  if (l.includes('benom') || l.includes('nhân viên') || l.includes('ktv')) return 'Kỹ thuật Benom';
  return s;
}

function normalizeRegion(v) {
  const s = String(v || '').trim();
  const l = s.toLowerCase();
  if (!s) return 'HCM';
  if (l === 'hcm' || l.includes('hồ chí minh') || l.includes('tp.hcm')) return 'HCM';
  if (l === 'hn' || l.includes('hà nội') || l.includes('ha noi')) return 'Hà Nội';
  return s;
}

function parseDateIso(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  // dd-Mon-yyyy e.g. 1-Oct-2026
  const mMon = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
  if (mMon) {
    const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
    const mo = months[mMon[2].toLowerCase()];
    if (mo) {
      const yr = mMon[3].length === 2 ? '20' + mMon[3] : mMon[3];
      return `${yr}-${mo}-${mMon[1].padStart(2, '0')}`;
    }
  }
  // dd/mm/yyyy
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mSlash) {
    let a = parseInt(mSlash[1], 10);
    let b = parseInt(mSlash[2], 10);
    const yr = mSlash[3].length === 2 ? '20' + mSlash[3] : mSlash[3];
    // Handle US mm/dd when b > 12
    if (b > 12 && a <= 12) { const tmp = a; a = b; b = tmp; }
    return `${yr}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function warrantyMonthsFromText(txt) {
  const l = String(txt || '').toLowerCase();
  if (l.includes('12')) return 12;
  if (l.includes('06') || l.includes('6 tháng')) return 6;
  return 0;
}

function classifyPurpose(note) {
  const l = String(note || '').toLowerCase();
  if (l.includes('1001') || l.includes('pop') || l.includes('aeon')) return 'Moving Pop-up 1001';
  if (l.includes('replenish') || l.includes('xuân') || l.includes('3001') && !/3001020\d+/.test(l)) return 'Replenish Store 3001';
  if (l.includes('return') || l.includes('trả') || l.includes('supplier') || l.includes('lỗi')) return 'Trả NCC / QC';
  if (l.includes('#')) return 'Đơn Online / Web';
  return 'Giao khách';
}

export function runSeed(force = false) {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (existing > 0 && !force) {
    console.log(`[Seed] Database already seeded (${existing} products). Skipping.`);
    return;
  }

  console.log('[Seed] Initializing Benom Operations Hub database from real data...');

  db.exec(`
    DELETE FROM order_items; DELETE FROM orders;
    DELETE FROM warehouse_slip_items; DELETE FROM warehouse_slips;
    DELETE FROM handovers; DELETE FROM warranty_tickets;
    DELETE FROM qc_factory_returns; DELETE FROM erp_snapshots;
    DELETE FROM support_logs; DELETE FROM product_guides;
    DELETE FROM products; DELETE FROM staff; DELETE FROM warehouses; DELETE FROM partners;
  `);

  // 1. WAREHOUSES
  const insWh = db.prepare(`INSERT OR REPLACE INTO warehouses VALUES (?,?,?,?,?,?)`);
  [
    ['3001', 'Store 3001 — Parkson Lê Thánh Tôn', 'Store', 'Tầng 3, 35-45 Lê Thánh Tôn, P. Sài Gòn, TP.HCM', 140, 0],
    ['9005', 'DC 9005 — Toàn Nhất Logistics (BD02)', '3PL Warehouse', 'Số 10 Đại lộ Độc Lập, KCN Sóng Thần 1, Dĩ An', 300, 32700000],
    ['1001', 'Pop-up Store 1001 — Aeon Mall Bình Tân', 'Pop-up', 'Lô G64-G65, Tầng trệt, Aeon Mall Bình Tân, TP.HCM', 90, 0],
    ['PCS', 'Kho PCS', 'Transit', 'TP.HCM', 0, 0],
  ].forEach(r => insWh.run(...r));

  // 2. STAFF
  const insStaff = db.prepare(`INSERT OR REPLACE INTO staff VALUES (?,?,?,?,?,?,1)`);
  [
    ['260135', 'Trần Anh Tuyến', 'OPT AM / SC Coordinator', 'Operations', '', 'tuyen.tran@kohnanvn.com'],
    ['260107', 'Nguyễn Huy Hoàng Tuấn', 'KTV Lắp đặt / Sales', 'Operations / Sales', '', ''],
    ['250182', 'Đặng Phương Nam', 'Hỗ trợ lắp đặt / Sales', 'Sales', '', ''],
    ['260199', 'Trương Văn Tính', 'Hỗ trợ lắp đặt / Sales', 'Sales', '', ''],
    ['260001', 'Trần Thị Quỳnh Nhi', 'Department Manager', 'Management', '0903684778', 'nhi.tran@kohnanvn.com'],
    ['260010', 'Bùi Phạm Thanh Xuân', 'Sales Senior / ASM', 'Sales', '', 'xuan.bui@kohnanvn.com'],
    ['260011', 'Trần Hoàng Gia Uyên', 'Operations Support', 'Operations', '', 'uyennhi.tran@kohnanvn.com'],
    ['260020', 'Huỳnh Thị Đương Thời', 'Sales Staff', 'Sales', '', ''],
    ['260021', 'Đỗ Huỳnh Bích Ngọc', 'Sales Staff', 'Sales', '', ''],
    ['260022', 'Trần Thái Khang', 'Hỗ trợ lắp đặt / Sales', 'Sales', '', ''],
  ].forEach(r => insStaff.run(...r));

  // 3. PARTNERS (Suppliers + Carriers)
  const insPartner = db.prepare(`INSERT OR REPLACE INTO partners VALUES (?,?,?,?,?)`);
  const supRows = readCsv(path.join(IMPORTED, 'Automatic_Inventory 9005 - Supplier.csv'), { columns: true });
  let supIdx = 1;
  for (const r of supRows) {
    const code = (r['SUPPLIER CODE'] || '').trim() || `SUP-${supIdx++}`;
    const name = (r['SUPPLIER NAME'] || '').trim();
    if (!name) continue;
    insPartner.run(code, name, (r['TYPE'] || 'TRADING').trim(), (r['CATEGORY'] || '').trim(), '');
  }
  [
    ['3PL-TN', 'Toàn Nhất Logistics (BD02)', '3PL', 'Kho tổng 9005 Sóng Thần 1', 'nam.nguyen@toannhat.com; tuan.ngo@toannhat.com'],
    ['CAR-AHA', 'Ahamove', 'CARRIER', 'Giao nội thành HCM & xe tải', 'BUSINESS_ACCOUNT'],
    ['CAR-XSM', 'Xanh SM', 'CARRIER', 'Giao hàng nhỏ gọn nội thành', ''],
    ['CAR-247', '247 Express', 'CARRIER', 'Giao liên tỉnh hàng nhỏ/vừa', ''],
    ['CAR-SGW', 'Sagawa', 'CARRIER', 'Giao liên tỉnh (cũ)', 'Mã KH: 0233805'],
    ['CAR-NTL', 'Nhất Tín Logistics', 'CARRIER', 'Pilot Q4 hàng cồng kềnh đi tỉnh', ''],
    ['CAR-BN', 'Kỹ thuật Benom', 'CARRIER', 'Giao lắp trực tiếp nội bộ', 'service.benom@kohnanvn.com'],
  ].forEach(r => insPartner.run(...r));

  // 4. UNIFIED PRODUCTS MASTER
  const productMap = new Map();
  const upsertProd = (bc, patch) => {
    const cleanBc = String(bc || '').trim();
    if (!cleanBc) return;
    const cur = productMap.get(cleanBc) || {
      barcode: cleanBc, sku: '', name_vn: cleanBc, name_en: '', category: '', product_family: '',
      item_type: cleanBc.toUpperCase().startsWith('BN-') ? 'PACKAGING' : 'PRODUCT',
      supplier_code: '', supplier_name: '', retail_price: 0, cost_price: 0, unit: 'Cái',
      length_mm: 0, width_mm: 0, height_mm: 0, net_weight_g: 0,
      box_w_cm: 0, box_d_cm: 0, box_h_cm: 0, qty_per_pcs: 1, qty_per_box: 1, max_stack: 1,
      p_handling: 15000, install_level: 'No', p_installation: 0,
      warranty_policy: 'Không bảo hành', warranty_months: 0, has_hdlr: 0, has_hdbq: 0,
      min_stock_3001: 0, is_top_50: 0, status: 'Active'
    };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && v === 0 && cur[k] > 0)) {
        cur[k] = v;
      }
    }
    productMap.set(cleanBc, cur);
  };

  // 4a. product_master.csv
  const pmRows = readCsv(path.join(DATA, 'product_master.csv'), { columns: true });
  for (const r of pmRows) {
    const bc = r['Barcode'] || r['BARCODE'] || Object.values(r)[0];
    if (!bc || String(bc).toLowerCase().includes('barcode')) continue;
    const wp = r['Chính sách bảo hành'] || r['Warranty Policy'] || 'Không bảo hành';
    upsertProd(bc, {
      sku: r['SKU'] || '',
      name_vn: r['Product Name VN'] || r['Tên sản phẩm'] || r['Product Name'] || bc,
      name_en: r['Product Name EN'] || '',
      category: r['Category'] || r['Ngành hàng'] || '',
      product_family: r['Product Family'] || r['Nhóm sản phẩm'] || '',
      supplier_code: r['Partner Code'] || r['Mã NCC'] || '',
      supplier_name: r['Partner Name'] || r['Nhà cung cấp'] || '',
      retail_price: num(r['Retail Price (VAT incl.)'] || r['Giá bán lẻ'] || r['Retail Price']),
      length_mm: num(r['Length (mm)'] || r['Length\n(mm)']),
      width_mm: num(r['Width (mm)'] || r['Width\n(mm)']),
      height_mm: num(r['Height (mm)'] || r['Height\n(mm)']),
      net_weight_g: num(r['Net Weight (g)'] || r['Net Weight\n(g)']),
      warranty_policy: wp,
      warranty_months: warrantyMonthsFromText(wp),
      has_hdlr: String(r['HDLR'] || '').toLowerCase().includes('có') || String(r['HDLR'] || '').toLowerCase() === 'yes' ? 1 : 0,
      has_hdbq: String(r['HDBQ'] || '').toLowerCase().includes('có') || String(r['HDBQ'] || '').toLowerCase() === 'yes' ? 1 : 0,
      status: r['Trạng thái POS 3001'] || r['Status'] || 'Active',
    });
  }

  // 4b. nk_sheet/Product_list.csv (Cost + BN-* items)
  const plRows = readCsv(path.join(DATA, 'nk_sheet', 'Product_list.csv'), { columns: true });
  for (const r of plRows) {
    const bc = r['Barcode'] || r['BARCODE'];
    if (!bc) continue;
    upsertProd(bc, {
      product_family: r['Product Family'] || '',
      name_vn: r['Product Name'] || bc,
      cost_price: num(r['Cost']),
      item_type: String(bc).toUpperCase().startsWith('BN-') ? 'PACKAGING' : 'PRODUCT',
    });
  }

  // 4c. Master_SKU_Allowance.csv (P_Handling, P_Installation, Net Weight)
  const alRows = readCsv(path.join(DATA, 'allowance_sheet', 'Master_SKU_Allowance.csv'), { columns: true });
  for (const r of alRows) {
    const bc = r['Barcode'];
    if (!bc) continue;
    const ph = num(r['Phụ Cấp Khuân Vác (VND)\nP_Handling'] ?? r['Phụ Cấp Khuân Vác (VND) P_Handling']);
    const pi = num(r['Phụ Cấp Lắp Đặt (VND)\nP_Installation'] ?? r['Phụ Cấp Lắp Đặt (VND) P_Installation']);
    const il = (r['Mức độ Lắp đặt\n(Installation Level)'] || r['Mức độ Lắp đặt (Installation Level)'] || 'No').trim();
    const cur = productMap.get(String(bc).trim());
    upsertProd(bc, {
      supplier_code: r['Partner Code'] || '',
      supplier_name: r['Partner Name'] || '',
      name_en: r['Product Name EN'] || '',
      name_vn: r['Product Name VN'] || bc,
      category: r['Category'] || '',
      product_family: r['Product Family'] || '',
      length_mm: num(r['Length\n(mm)']),
      width_mm: num(r['Width\n(mm)']),
      height_mm: num(r['Height\n(mm)']),
      net_weight_g: num(r['Net Weight\n(g)']),
      install_level: il,
    });
    // Explicitly set exact P_Handling & P_Installation (including 0)
    const p = productMap.get(String(bc).trim());
    if (p) {
      p.p_handling = ph;
      p.p_installation = pi;
    }
  }

  // 4d. Automatic_Inventory 9005 - Master_Data.csv (Box dims & Max Stack)
  const invMdRows = readCsv(path.join(IMPORTED, 'Automatic_Inventory 9005 - Master_Data.csv'), { columns: true });
  for (const r of invMdRows) {
    const bc = r['Barcode'];
    if (!bc) continue;
    const msRaw = r['Max Stack\n(Maximum Stacking Layer)'] || r['Max Stack'];
    const ms = num(msRaw) || 1;
    upsertProd(bc, {
      name_vn: r['Product Name'] || bc,
      supplier_code: r['Supplier Code'] || '',
      supplier_name: r['Supplier Name'] || '',
      box_w_cm: num(r['W (cm)\n(Box Dimension)']),
      box_d_cm: num(r['D (cm)\n(Box Dimension)']),
      box_h_cm: num(r['H (cm)\n(Box Dimension)']),
      net_weight_g: num(r['Net Weight (kg)']) * 1000,
      qty_per_pcs: num(r['Qty of pcs']) || 1,
      qty_per_box: num(r['Qty of box']) || 1,
      max_stack: ms,
    });
  }

  // 4e. Service/Fee SKUs & BN-* from danhmuc.csv
  const dmRows = readCsv(path.join(DATA, 'danh_muc', 'danhmuc.csv'));
  for (let i = 1; i < dmRows.length; i++) {
    const [bc, name] = dmRows[i];
    if (!bc || !name) continue;
    const l = name.toLowerCase();
    const isFee = l.includes('phí vận chuyển') || l.includes('phí giao hàng') || l.includes('phí lắp đặt');
    const isBn = bc.toUpperCase().startsWith('BN-');
    if (isFee || isBn || bc === '8935273455849' || bc === '8935273402393') {
      upsertProd(bc, {
        name_vn: name.trim(),
        item_type: isFee ? 'SERVICE_FEE' : (isBn ? 'PACKAGING' : 'PRODUCT'),
        p_handling: isFee || isBn ? 0 : 15000,
        p_installation: 0,
      });
    }
  }

  const insProd = db.prepare(`
    INSERT INTO products (
      barcode, sku, name_vn, name_en, category, product_family, item_type,
      supplier_code, supplier_name, retail_price, cost_price, unit,
      length_mm, width_mm, height_mm, net_weight_g,
      box_w_cm, box_d_cm, box_h_cm, qty_per_pcs, qty_per_box, max_stack,
      p_handling, install_level, p_installation,
      warranty_policy, warranty_months, has_hdlr, has_hdbq, min_stock_3001, is_top_50, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (const p of productMap.values()) {
    insProd.run(
      p.barcode, p.sku, p.name_vn, p.name_en, p.category, p.product_family, p.item_type,
      p.supplier_code, p.supplier_name, p.retail_price, p.cost_price, p.unit,
      p.length_mm, p.width_mm, p.height_mm, p.net_weight_g,
      p.box_w_cm, p.box_d_cm, p.box_h_cm, p.qty_per_pcs, p.qty_per_box, p.max_stack,
      p.p_handling, p.install_level, p.p_installation,
      p.warranty_policy, p.warranty_months, p.has_hdlr, p.has_hdbq, p.min_stock_3001, p.is_top_50, p.status
    );
  }
  console.log(`[Seed] Products: ${productMap.size}`);

  // 5. ORDERS & ORDER ITEMS from shipments_tracking.csv (header is on line 4 / index 3)
  const shipRaw = readCsv(path.join(DATA, 'shipments_tracking.csv'));
  const shipHeaderIdx = shipRaw.findIndex(r => r.some(c => String(c || '').includes('Mã hoá đơn')));
  const shipHeaders = shipHeaderIdx >= 0 ? shipRaw[shipHeaderIdx] : [];
  const shipRows = shipHeaderIdx >= 0
    ? shipRaw.slice(shipHeaderIdx + 1).map(r => {
        const obj = {};
        shipHeaders.forEach((h, i) => { obj[h] = r[i] ?? ''; });
        return obj;
      })
    : [];
  const orderGroups = new Map();
  let autoInvIdx = 1;
  for (const r of shipRows) {
    const rawInv = (r['Mã hoá đơn'] || '').trim();
    const cust = (r['Tên KH'] || '').trim();
    const bc = (r['Barcode'] || '').trim();
    if (!rawInv && !cust && !bc) continue;
    const inv = rawInv || `NOINV-${String(autoInvIdx++).padStart(4, '0')}`;
    if (!orderGroups.has(inv)) {
      let ktv1Code = String(r['Mã Nhân viên 1'] || '').replace(/[^\d]/g, '');
      let ktv2Code = String(r['Mã Nhân Viên 2'] || '').replace(/[^\d]/g, '');
      if (ktv1Code === '260153') ktv1Code = '260135';
      if (ktv2Code === '260153') ktv2Code = '260135';
      const note = (r['Note for sales'] || r['Ghi chú'] || '').trim();
      const addr = (r['Địa chỉ giao hàng'] || '').trim();
      const isStairs = /thang bộ|khiêng bộ|lầu bộ|không có thang máy/i.test(addr + ' ' + note) ? 1 : 0;
      orderGroups.set(inv, {
        invoice_no: inv,
        order_date: parseDateIso(r['Ngày nhập data (d/m/y)']),
        delivery_date: parseDateIso(r['Ngày KH nhận hàng thực tế (d/m/y)'] || r['Ngày hẹn lắp đặt \n(dd/mm/yyyy)']),
        customer_name: cust,
        customer_phone: cleanPhone(r['SĐT KH']),
        address: addr,
        region: normalizeRegion(r['Khu vực']),
        distance_km: num(r['Số Km']),
        carrier: normalizeCarrier(r['Vận chuyển']),
        tracking_no: (r['Mã vận đơn'] || '').trim(),
        source_warehouse: (r['Điểm lấy hàng'] || '9005').trim() || '9005',
        moving_no: (r['Mã moving'] || '').trim(),
        pic_sales: (r['PIC sales'] || '').trim(),
        channel: (r['Khách hàng biết đến benom qua đâu?\n(nếu có)'] || '').trim(),
        shipping_fee_3pl: num(r['Chi phí vận chuyển']),
        customer_paid_fee: 0,
        is_promo_free_ship: /free|miễn phí/i.test(note) ? 1 : 0,
        require_install: String(r['Yêu cầu lắp đặt'] || '').toLowerCase().includes('có') ? 1 : 0,
        is_stairs: isStairs,
        ktv1_name: (r['Kỹ thuật viên \nphụ trách 1'] || r['Kỹ thuật viên phụ trách 1'] || '').trim(),
        ktv1_code: ktv1Code,
        ktv2_name: (r['Kỹ thuật viên phụ trách 2'] || '').trim(),
        ktv2_code: ktv2Code,
        status: (r['Trạng thái'] || 'Done').trim() || 'New',
        install_status: (r['Trạng thái\nlắp đặt (BM-01)'] || '').trim(),
        notes: note,
        items: [],
        tickets: [],
      });
    }
    const og = orderGroups.get(inv);
    // accumulate shipping fee if first row had 0
    if (og.shipping_fee_3pl === 0 && num(r['Chi phí vận chuyển']) > 0) {
      og.shipping_fee_3pl = num(r['Chi phí vận chuyển']);
    }
    if (String(r['Yêu cầu lắp đặt'] || '').toLowerCase().includes('có')) og.require_install = 1;
    const p = productMap.get(bc);
    og.items.push({
      barcode: bc,
      product_name: (r['Tên sản phẩm'] || p?.name_vn || bc).trim(),
      unit: (r['Đơn vị'] || 'Cái').trim() || 'Cái',
      qty: num(r['Số lượng']) || 1,
      net_weight_g: p?.net_weight_g || num(r['Trọng lượng (kg)']) * 1000,
      warranty_months: p?.warranty_months || warrantyMonthsFromText(r['Thời hạn bảo hành']),
      warranty_policy: p?.warranty_policy || (r['Thời hạn bảo hành'] || 'Không bảo hành').trim(),
      p_handling_unit: p ? p.p_handling : 15000,
      p_installation_unit: p ? p.p_installation : 0,
    });

    const tkNo = (r['Mã Ticket dịch vụ\n (BM-02)'] || r['Mã Ticket dịch vụ (BM-02)'] || '').trim();
    if (tkNo) {
      og.tickets.push({
        ticket_no: tkNo,
        invoice_no: inv,
        customer_name: cust,
        customer_phone: cleanPhone(r['SĐT KH']),
        address: (r['Địa chỉ giao hàng'] || '').trim(),
        barcode: bc,
        product_name: (r['Tên sản phẩm'] || '').trim(),
        service_level: String(r['Phân cấp xử lý'] || '').includes('3') ? 'C3' : (String(r['Phân cấp xử lý'] || '').includes('2') ? 'C2' : 'C1'),
        status: String(r['Trạng thái xử lý BH'] || '').toLowerCase().includes('hoàn tất') ? 'Closed' : 'In Progress',
      });
    }
  }

  const insOrder = db.prepare(`
    INSERT INTO orders (
      invoice_no, order_date, delivery_date, customer_name, customer_phone, address, region,
      distance_km, carrier, tracking_no, source_warehouse, moving_no, pic_sales, channel,
      shipping_fee_3pl, customer_paid_fee, is_promo_free_ship, require_install, is_stairs,
      ktv1_name, ktv1_code, ktv2_name, ktv2_code, status, install_status, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insItem = db.prepare(`
    INSERT INTO order_items (
      order_id, barcode, product_name, unit, qty, net_weight_g,
      warranty_months, warranty_policy, p_handling_unit, p_installation_unit
    ) VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const insTicket = db.prepare(`
    INSERT OR IGNORE INTO warranty_tickets (
      ticket_no, invoice_no, customer_name, customer_phone, address, barcode, product_name,
      channel, issue_desc, service_level, is_in_warranty, ktv_assigned, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let orderCount = 0;
  let itemCount = 0;
  const orderIdByInv = new Map();
  for (const og of orderGroups.values()) {
    const res = insOrder.run(
      og.invoice_no, og.order_date, og.delivery_date, og.customer_name, og.customer_phone, og.address, og.region,
      og.distance_km, og.carrier, og.tracking_no, og.source_warehouse, og.moving_no, og.pic_sales, og.channel,
      og.shipping_fee_3pl, og.customer_paid_fee, og.is_promo_free_ship, og.require_install, og.is_stairs,
      og.ktv1_name, og.ktv1_code, og.ktv2_name, og.ktv2_code, og.status, og.install_status, og.notes
    );
    const oid = Number(res.lastInsertRowid);
    orderIdByInv.set(og.invoice_no, oid);
    orderCount++;
    for (const it of og.items) {
      insItem.run(oid, it.barcode, it.product_name, it.unit, it.qty, it.net_weight_g, it.warranty_months, it.warranty_policy, it.p_handling_unit, it.p_installation_unit);
      itemCount++;
    }
    for (const tk of og.tickets) {
      insTicket.run(tk.ticket_no, tk.invoice_no, tk.customer_name, tk.customer_phone, tk.address, tk.barcode, tk.product_name, 'Zalo OA', 'Sự cố bảo hành lịch sử (Shipments)', tk.service_level, 1, 'Trần Anh Tuyến', tk.status);
    }
  }
  console.log(`[Seed] Orders: ${orderCount} (${itemCount} items)`);

  // 6. WAREHOUSE SLIPS (NK & XK)
  const insSlip = db.prepare(`
    INSERT OR IGNORE INTO warehouse_slips (
      slip_no, slip_type, slip_date, expected_date, expected_time, created_by,
      partner_code, partner_name, carrier, warehouse_code, purpose, ref_invoice, ref_po, status, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insSlipItem = db.prepare(`
    INSERT INTO warehouse_slip_items (slip_id, barcode, product_name, unit, qty, actual_qty, note)
    VALUES (?,?,?,?,?,?,?)
  `);

  // 6a. NK (PHIEU_DATA_NK.csv - remember shifted header: col0=Số phiếu, col1=Ngày, col2=Người lập, col3=Mã NCC, col4=Tên NCC, col5=Đơn vị nhập, col6=Giờ, col7=Ghi chú, col8=Barcode, col9=Tên SP, col10=ĐVT, col11=SL)
  const nkRaw = readCsv(path.join(DATA, 'nk_sheet', 'PHIEU_DATA_NK.csv'));
  const nkGroups = new Map();
  for (let i = 2; i < nkRaw.length; i++) {
    const r = nkRaw[i];
    const sno = (r[0] || '').trim();
    if (!sno || !sno.startsWith('NK-')) continue;
    if (!nkGroups.has(sno)) {
      const note = (r[7] || '').trim();
      const invMatch = note.match(/3001\d{9}/);
      const poMatch = note.match(/BN\d{6}/i);
      const isCancelled = /huỷ|hủy|thay thế/i.test(note);
      nkGroups.set(sno, {
        slip_no: sno,
        slip_date: parseDateIso(r[1]),
        created_by: (r[2] || '').trim().replace(/^Tran Anh Tuyen$/i, 'Trần Anh Tuyến'),
        partner_code: (r[3] || '').trim(),
        partner_name: (r[4] || '').trim(),
        carrier: (r[5] || 'Toàn Nhất Logistics').trim(),
        expected_time: (r[6] || '').trim(),
        purpose: /return|hoàn/i.test(note) ? 'Nhập hàng hoàn' : (/3001|1001|pcs|moving/i.test(r[4] + ' ' + note) ? 'Nhập chuyển kho' : 'Nhập PO NCC'),
        ref_invoice: invMatch ? invMatch[0] : '',
        ref_po: poMatch ? poMatch[0].toUpperCase() : '',
        status: isCancelled ? 'Cancelled' : 'Confirmed',
        notes: note,
        items: [],
      });
    }
    nkGroups.get(sno).items.push({
      barcode: (r[8] || '').trim(),
      product_name: (r[9] || '').trim(),
      unit: (r[10] || 'Thùng').trim(),
      qty: num(r[11]) || 1,
    });
  }
  for (const g of nkGroups.values()) {
    const res = insSlip.run(g.slip_no, 'NK', g.slip_date, g.slip_date, g.expected_time, g.created_by, g.partner_code, g.partner_name, g.carrier, '9005', g.purpose, g.ref_invoice, g.ref_po, g.status, g.notes);
    const sid = Number(res.lastInsertRowid);
    if (sid) g.items.forEach(it => insSlipItem.run(sid, it.barcode, it.product_name, it.unit, it.qty, it.qty, ''));
  }

  // 6b. XK (PHIEU_DATA.csv)
  const xkRaw = readCsv(path.join(DATA, 'xk_sheet', 'PHIEU_DATA.csv'));
  const xkGroups = new Map();
  for (let i = 2; i < xkRaw.length; i++) {
    const r = xkRaw[i];
    const sno = (r[0] || '').trim();
    if (!sno || !sno.startsWith('XK-')) continue;
    if (!xkGroups.has(sno)) {
      const note = (r[7] || '').trim();
      const invMatch = note.match(/3001\d{9}/);
      xkGroups.set(sno, {
        slip_no: sno,
        slip_date: parseDateIso(r[1]),
        created_by: (r[2] || '').trim().replace(/^Tran Anh Tuyen$/i, 'Trần Anh Tuyến'),
        carrier: normalizeCarrier(r[3]),
        expected_date: parseDateIso(r[5]),
        expected_time: (r[6] || '').trim(),
        purpose: classifyPurpose(note),
        ref_invoice: invMatch ? invMatch[0] : '',
        status: 'Confirmed',
        notes: note,
        items: [],
      });
    }
    xkGroups.get(sno).items.push({
      barcode: String(r[8] || '').replace(/^BD02-\s*/i, '').trim(),
      product_name: (r[9] || '').trim(),
      unit: (r[10] || 'Thùng').trim(),
      qty: num(r[11]) || 1,
    });
  }
  for (const g of xkGroups.values()) {
    const res = insSlip.run(g.slip_no, 'XK', g.slip_date, g.expected_date, g.expected_time, g.created_by, '', 'Toàn Nhất Logistics', g.carrier, '9005', g.purpose, g.ref_invoice, '', g.status, g.notes);
    const sid = Number(res.lastInsertRowid);
    if (sid) g.items.forEach(it => insSlipItem.run(sid, it.barcode, it.product_name, it.unit, it.qty, it.qty, ''));
  }
  console.log(`[Seed] Warehouse slips: ${nkGroups.size} NK, ${xkGroups.size} XK`);

  // 7. HANDOVERS (BM-01 from BIEN_BAN_DATA.csv)
  const bmRaw = readCsv(path.join(DATA, 'bm01_sheet', 'BIEN_BAN_DATA.csv'));
  const insHo = db.prepare(`
    INSERT OR IGNORE INTO handovers (
      doc_no, doc_type, order_id, invoice_no, handover_date, warehouse_code,
      customer_name, customer_phone, address, carrier, install_mode,
      ktv1_name, ktv1_code, ktv2_name, ktv2_code, csat_rating, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const seenBm = new Set();
  for (let i = 2; i < bmRaw.length; i++) {
    const r = bmRaw[i];
    const docNo = (r[0] || '').trim();
    if (!docNo || !docNo.startsWith('BB-') || seenBm.has(docNo)) continue;
    seenBm.add(docNo);
    const inv = (r[1] || '').trim();
    insHo.run(
      docNo, 'BM-01', orderIdByInv.get(inv) || null, inv, parseDateIso(r[2]), (r[3] || 'DC 9005').replace('DC ', '').trim(),
      (r[4] || '').trim(), cleanPhone(r[5]), (r[6] || '').trim(), normalizeCarrier(r[7]), (r[8] || 'Kỹ thuật Benom').trim(),
      (r[9] || '').trim(), (r[10] || '').trim(), (r[11] || '').trim(), (r[12] || '').trim(), 5, 'Completed'
    );
  }
  console.log(`[Seed] Handovers (BM-01): ${seenBm.size}`);

  // 8. QC FACTORY RETURNS (Slide 6 of benom leader 19/11/2026)
  const insQc = db.prepare(`
    INSERT INTO qc_factory_returns (supplier_name, barcode, product_name, issue, defective_qty, sold_qty, stock_qty, defect_rate, action, est_out, est_in, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  [
    ['ELEK', '8935273401013', 'Đèn Elia', 'Broken shade', 1, 2, 51, 1.9, 'Replace shade', '16/11', '17/11', 'Returned'],
    ['ELEK', '8935273400993', 'Đèn Livia Đỏ', 'Broken + tilted', 2, 9, 37, 4.3, 'Exchange new', '16/11', '17/11', 'Returned'],
    ['HIỂU ĐỨC', '8935382601229', 'Kệ Claro Xanh Đen', 'Misaligned holes', 1, 1, 0, 100.0, 'Back to factory', '10/11', 'TBU', 'Sent'],
    ['SAVIMEX', '8935273401143', 'Kệ Keepsake 5 Tự Nhiên', 'No screw holes', 1, 1, 24, 4.0, 'Back to factory', 'TBU', 'TBU', 'Open'],
    ['SAVIMEX', '8935273401501', 'Sofa Murest 2M2', 'Missing middle leg', 1, 0, 5, 20.0, 'Back to factory', 'TBU', 'TBU', 'Open'],
    ['SAVIMEX', '8935273401525', 'Đôn Murest', 'Dented cushion', 1, 0, 11, 9.1, 'Back to factory', 'TBU', 'TBU', 'Open'],
    ['CABAY', '8935273400849', 'Mâm Harmin Gỗ Nâu', 'Cracked, no feet', 2, 9, 87, 2.1, 'Back to Sala office', '16/11', 'TBU', 'Sent'],
    ['HIỂU ĐỨC', '8935273455047', 'Kệ Treo Nolyn Xanh Đen', 'Scratch marks (38%)', 19, 3, 47, 38.0, 'Back to factory', '16/11', 'TBU', 'Sent'],
    ['HIỂU ĐỨC', '8935382601113', 'Bàn Ăn Noma Tự Nhiên', 'Turntable raised', 1, 0, 14, 7.1, 'Back to factory', '16/11', 'TBU', 'Sent'],
  ].forEach(r => insQc.run(...r));

  // 9. ERP SNAPSHOTS (DC 9005 T11.2026 + Store 3001 T1-T11.2026, active Benom rows only!)
  const insErp = db.prepare(`
    INSERT INTO erp_snapshots (
      target_month, store_code, barcode, product_name, supplier_code,
      open_qty, income_qty, sales_qty, sales_amt, cogs,
      movement_qty, return_qty, adj_qty, close_qty, close_cst, loss_qty
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  function fastCsvLine(line) {
    if (!line.includes('"')) return line.split(',');
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function ingestErpFile(filePath, overrideMonth = null) {
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    if (lines.length < 2) return 0;
    const headers = fastCsvLine(lines[0]);
    const idx = {};
    headers.forEach((h, i) => { idx[h.trim()] = i; });

    let inserted = 0;
    db.exec('BEGIN');
    for (let li = 1; li < lines.length; li++) {
      const line = lines[li];
      if (!line) continue;
      const row = fastCsvLine(line);
      if (row.length < 25) continue;
      const oq = num(row[idx['Open Qty']]);
      const iq = num(row[idx['Income Qty']]);
      const sq = num(row[idx['Sales Qty']]);
      const sa = num(row[idx['Sales Amt']]);
      const cq = num(row[idx['Close Qty']]);
      const mq = num(row[idx['Movement Qty']]);
      if (oq === 0 && iq === 0 && sq === 0 && sa === 0 && cq === 0 && mq === 0) continue;

      insErp.run(
        overrideMonth || (row[idx['Target Month']] || '').trim(),
        (row[idx['Store Code']] || '').trim(),
        (row[idx['Barcode']] || '').trim(),
        (row[idx['Product Name']] || '').trim(),
        (row[idx['Supplier Code']] || '').trim(),
        oq, iq, sq, sa, num(row[idx['COGS']]),
        mq, num(row[idx['Return Qty']]), num(row[idx['Adj Qty']]),
        cq, num(row[idx['Close Cst']]), num(row[idx['Loss Qty']])
      );
      inserted++;
    }
    db.exec('COMMIT');
    return inserted;
  }

  const cnt9005 = ingestErpFile(path.join(IMPORTED, 'Automatic_Inventory 9005 - Raw_ERP.csv'), '202611');
  let cnt3001 = 0;
  const inv3001Dir = path.join(DATA, 'inventory 3001');
  if (fs.existsSync(inv3001Dir)) {
    const invFiles = fs.readdirSync(inv3001Dir).filter(f => f.endsWith('.csv')).sort();
    for (const f of invFiles) {
      const m = f.match(/_T(\d+)[._]2026\.csv$/);
      const ym = m ? `2026${m[1].padStart(2, '0')}` : null;
      cnt3001 += ingestErpFile(path.join(inv3001Dir, f), ym);
    }
  }
  console.log(`[Seed] ERP snapshots: 9005=${cnt9005} rows, 3001 (11 months)=${cnt3001} rows`);

  // Mark Top 50 SKUs by 2026 Store 3001 revenue
  const top50 = db.prepare(`
    SELECT barcode FROM erp_snapshots
    WHERE store_code = '3001' AND sales_amt > 0
    GROUP BY barcode ORDER BY SUM(sales_amt) DESC LIMIT 50
  `).all();
  const updTop = db.prepare(`UPDATE products SET is_top_50 = 1, min_stock_3001 = CASE WHEN min_stock_3001 = 0 THEN 2 ELSE min_stock_3001 END WHERE barcode = ?`);
  top50.forEach(r => updTop.run(r.barcode));

  // 10. PRODUCT GUIDES (HDLR & HDBQ)
  const guidePath = path.join(ROOT, '06_product_guides', 'HDLR_HDBQ_San_pham_2025-2026.md');
  if (fs.existsSync(guidePath)) {
    const md = fs.readFileSync(guidePath, 'utf8');
    // Split on top-level headings (# or ##)
    const sections = md.split(/\n(?=#{1,2}\s+)/).filter(s => s.trim().length > 80);
    const insGuide = db.prepare(`INSERT INTO product_guides (title, product_line, guide_type, content_md) VALUES (?,?,?,?)`);
    for (const sec of sections.slice(0, 40)) {
      const firstLine = sec.split('\n')[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      const lineKey = ['Noma','Jomo','Welin','Cherish','Pourin','Sunim','Raima','Keepsake','Solace','Livia','Lilow','Be-there','Stillie','Orini','Claro','Stelo','Murest','Nelia'].find(k => firstLine.toLowerCase().includes(k.toLowerCase())) || 'Chung';
      const gtype = /bảo quản|hdbq/i.test(firstLine) ? 'HDBQ' : 'HDLR';
      insGuide.run(firstLine.slice(0, 120), lineKey, gtype, sec.slice(0, 6000));
    }
    console.log(`[Seed] Product guides: ${Math.min(sections.length, 40)} sections`);
  }

  // 11. Sample Support Logs (to illustrate OPT AM time tracking)
  const insSup = db.prepare(`INSERT INTO support_logs (log_date, staff_name, category, location, hours, notes) VALUES (?,?,?,?,?,?)`);
  [
    ['2026-11-16', 'Trần Anh Tuyến', 'Factory QC', 'Xưởng Hiểu Đức', 4.5, 'Kiểm tra lô 19 Kệ treo Nolyn xanh đen bị trầy xước (38%)'],
    ['2026-11-18', 'Trần Anh Tuyến', 'Pop-up 1001 Support', 'Aeon Mall Bình Tân (1001)', 5.0, 'Hỗ trợ đứng ca & điều phối trưng bày hàng Pop-up 1001'],
    ['2026-11-20', 'Trần Anh Tuyến', 'Warehouse 9005 Audit', 'Toàn Nhất Sóng Thần (BD02)', 3.0, 'Đo đạc tối ưu layout đưa diện tích kho về 296,58 m²'],
  ].forEach(r => insSup.run(...r));

  console.log(`[Seed] Complete! SQLite saved to ${DB_PATH}`);
}

if (process.argv[1] && process.argv[1].endsWith('seed.mjs')) {
  runSeed(process.argv.includes('--force'));
}
