import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { initDb, dbAll, dbGet, dbRun, dbBatch, DB_PATH, isCloudDb } from './db.mjs';

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
  const mMon = s.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/);
  if (mMon) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mo = months[mMon[2].toLowerCase()];
    if (mo) {
      const yr = mMon[3].length === 2 ? '20' + mMon[3] : mMon[3];
      return `${yr}-${mo}-${mMon[1].padStart(2, '0')}`;
    }
  }
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mSlash) {
    let a = parseInt(mSlash[1], 10);
    let b = parseInt(mSlash[2], 10);
    const yr = mSlash[3].length === 2 ? '20' + mSlash[3] : mSlash[3];
    if (b > 12 && a <= 12) { const tmp = a; a = b; b = tmp; }
    return `${yr}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
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
  if (l.includes('replenish') || l.includes('xuân') || (l.includes('3001') && !/3001020\d+/.test(l))) return 'Replenish Store 3001';
  if (l.includes('return') || l.includes('trả') || l.includes('supplier') || l.includes('lỗi')) return 'Trả NCC / QC';
  if (l.includes('#')) return 'Đơn Online / Web';
  return 'Giao khách';
}

function buildKtvsJson(k1Code, k1Name, k2Code, k2Name) {
  const arr = [];
  if (k1Name || k1Code) arr.push({ code: k1Code || '', name: k1Name || '' });
  if (k2Name || k2Code) arr.push({ code: k2Code || '', name: k2Name || '' });
  return JSON.stringify(arr);
}

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

async function batchInsert(sql, rows, chunkSize = 100) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(args => ({ sql, args }));
    await dbBatch(chunk);
  }
}

export async function runSeed(force = false, confirmCloudReset = false) {
  await initDb();
  const existingRow = await dbGet('SELECT COUNT(*) as c FROM products');
  const existing = existingRow?.c || 0;
  if (existing > 0 && !force) {
    console.log(`[Seed] Database already seeded (${existing} products). Skipping. Pass --force to re-seed.`);
    return;
  }
  if (force && isCloudDb() && !confirmCloudReset) {
    throw new Error('[Seed Safety Guard] Refusing to --force wipe Turso Cloud DB without --confirm-cloud-reset flag!');
  }

  console.log(`[Seed] Initializing Benom Operations Hub (${isCloudDb() ? 'Turso Cloud' : 'Local SQLite'}) from real data...`);

  const clearTables = [
    'order_items', 'orders',
    'warehouse_slip_items', 'warehouse_slips',
    'handovers', 'warranty_tickets',
    'qc_factory_returns', 'erp_snapshots',
    'support_logs', 'product_guides',
    'products', 'staff', 'warehouses', 'partners',
  ];
  await dbBatch(clearTables.map(t => ({ sql: `DELETE FROM ${t}`, args: [] })));

  // 1. WAREHOUSES
  await batchInsert(
    `INSERT OR REPLACE INTO warehouses (code, name, type, address, capacity_m2, monthly_fee_vnd) VALUES (?,?,?,?,?,?)`,
    [
      ['3001', 'Store 3001 — Parkson Lê Thánh Tôn', 'Store', 'Tầng 3, 35-45 Lê Thánh Tôn, P. Sài Gòn, TP.HCM', 140, 0],
      ['9005', 'DC 9005 — Toàn Nhất Logistics (BD02)', '3PL Warehouse', 'Số 10 Đại lộ Độc Lập, KCN Sóng Thần 1, Dĩ An', 300, 32700000],
      ['1001', 'Pop-up Store 1001 — Aeon Mall Bình Tân', 'Pop-up', 'Lô G64-G65, Tầng trệt, Aeon Mall Bình Tân, TP.HCM', 90, 0],
      ['PCS', 'Kho PCS', 'Transit', 'TP.HCM', 0, 0],
    ]
  );

  // 2. STAFF
  await batchInsert(
    `INSERT OR REPLACE INTO staff (emp_code, full_name, role, department, phone, email, active) VALUES (?,?,?,?,?,?,1)`,
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
    ]
  );

  // 3. PARTNERS (Suppliers + Carriers)
  const partnerRows = [];
  const supRows = readCsv(path.join(IMPORTED, 'Automatic_Inventory 9005 - Supplier.csv'), { columns: true });
  let supIdx = 1;
  for (const r of supRows) {
    const code = (r['SUPPLIER CODE'] || '').trim() || `SUP-${supIdx++}`;
    const name = (r['SUPPLIER NAME'] || '').trim();
    if (!name) continue;
    partnerRows.push([code, name, (r['TYPE'] || 'TRADING').trim(), (r['CATEGORY'] || '').trim(), '']);
  }
  partnerRows.push(
    ['3PL-TN', 'Toàn Nhất Logistics (BD02)', '3PL', 'Kho tổng 9005 Sóng Thần 1', 'nam.nguyen@toannhat.com; tuan.ngo@toannhat.com'],
    ['CAR-AHA', 'Ahamove', 'CARRIER', 'Giao nội thành HCM & xe tải', 'BUSINESS_ACCOUNT'],
    ['CAR-XSM', 'Xanh SM', 'CARRIER', 'Giao hàng nhỏ gọn nội thành', ''],
    ['CAR-247', '247 Express', 'CARRIER', 'Giao liên tỉnh hàng nhỏ/vừa', ''],
    ['CAR-SGW', 'Sagawa', 'CARRIER', 'Giao liên tỉnh (cũ)', 'Mã KH: 0233805'],
    ['CAR-NTL', 'Nhất Tín Logistics', 'CARRIER', 'Pilot Q4 hàng cồng kềnh đi tỉnh', ''],
    ['CAR-BN', 'Kỹ thuật Benom', 'CARRIER', 'Giao lắp trực tiếp nội bộ', 'service.benom@kohnanvn.com']
  );
  await batchInsert(`INSERT OR REPLACE INTO partners (code, name, partner_type, category, contact_info) VALUES (?,?,?,?,?)`, partnerRows);

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

  for (const r of readCsv(path.join(DATA, 'product_master.csv'), { columns: true })) {
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

  for (const r of readCsv(path.join(DATA, 'nk_sheet', 'Product_list.csv'), { columns: true })) {
    const bc = r['Barcode'] || r['BARCODE'];
    if (!bc) continue;
    upsertProd(bc, {
      product_family: r['Product Family'] || '',
      name_vn: r['Product Name'] || bc,
      cost_price: num(r['Cost']),
      item_type: String(bc).toUpperCase().startsWith('BN-') ? 'PACKAGING' : 'PRODUCT',
    });
  }

  for (const r of readCsv(path.join(DATA, 'allowance_sheet', 'Master_SKU_Allowance.csv'), { columns: true })) {
    const bc = r['Barcode'];
    if (!bc) continue;
    const ph = num(r['Phụ Cấp Khuân Vác (VND)\nP_Handling'] ?? r['Phụ Cấp Khuân Vác (VND) P_Handling']);
    const pi = num(r['Phụ Cấp Lắp Đặt (VND)\nP_Installation'] ?? r['Phụ Cấp Lắp Đặt (VND) P_Installation']);
    const il = (r['Mức độ Lắp đặt\n(Installation Level)'] || r['Mức độ Lắp đặt (Installation Level)'] || 'No').trim();
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
    const p = productMap.get(String(bc).trim());
    if (p) {
      p.p_handling = ph;
      p.p_installation = pi;
    }
  }

  for (const r of readCsv(path.join(IMPORTED, 'Automatic_Inventory 9005 - Master_Data.csv'), { columns: true })) {
    const bc = r['Barcode'];
    if (!bc) continue;
    const ms = num(r['Max Stack\n(Maximum Stacking Layer)'] || r['Max Stack']) || 1;
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

  await batchInsert(
    `INSERT INTO products (
      barcode, sku, name_vn, name_en, category, product_family, item_type,
      supplier_code, supplier_name, retail_price, cost_price, unit,
      length_mm, width_mm, height_mm, net_weight_g,
      box_w_cm, box_d_cm, box_h_cm, qty_per_pcs, qty_per_box, max_stack,
      p_handling, install_level, p_installation,
      warranty_policy, warranty_months, has_hdlr, has_hdbq, min_stock_3001, is_top_50, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    Array.from(productMap.values()).map(p => [
      p.barcode, p.sku, p.name_vn, p.name_en, p.category, p.product_family, p.item_type,
      p.supplier_code, p.supplier_name, p.retail_price, p.cost_price, p.unit,
      p.length_mm, p.width_mm, p.height_mm, p.net_weight_g,
      p.box_w_cm, p.box_d_cm, p.box_h_cm, p.qty_per_pcs, p.qty_per_box, p.max_stack,
      p.p_handling, p.install_level, p.p_installation,
      p.warranty_policy, p.warranty_months, p.has_hdlr, p.has_hdbq, p.min_stock_3001, p.is_top_50, p.status,
    ])
  );
  console.log(`[Seed] Products: ${productMap.size}`);

  // 5. ORDERS & ORDER ITEMS from shipments_tracking.csv (positional columns to avoid duplicate 'Trạng thái' header)
  const shipRaw = readCsv(path.join(DATA, 'shipments_tracking.csv'));
  const shipHeaderIdx = shipRaw.findIndex(r => r.some(c => String(c || '').includes('Mã hoá đơn')));
  const shipRows = shipHeaderIdx >= 0 ? shipRaw.slice(shipHeaderIdx + 1) : [];

  const orderGroups = new Map();
  let autoInvIdx = 1;
  for (const r of shipRows) {
    const rawInv = (r[13] || '').trim();
    const cust = (r[6] || '').trim();
    const bc = (r[15] || '').trim();
    if (!rawInv && !cust && !bc) continue;
    const inv = rawInv || `NOINV-${String(autoInvIdx++).padStart(4, '0')}`;
    const itemWh = (r[12] || '').trim() || '9005';
    const rawMv = (r[14] || '').trim();
    const itemMv = /không làm moving/i.test(rawMv) ? '' : rawMv;
    const trk = String(r[2] || '').replace(/\r?\n/g, '').trim();
    let car = normalizeCarrier(r[11]);
    if (!car && /^893195\d{6,}$/.test(trk)) car = 'Sagawa';
    else if (!car && /^26[A-Z0-9]{6,}$/i.test(trk)) car = 'Ahamove';

    if (!orderGroups.has(inv)) {
      let ktv1Code = String(r[27] || '').replace(/[^\d]/g, '');
      let ktv2Code = String(r[29] || '').replace(/[^\d]/g, '');
      if (ktv1Code === '260153') ktv1Code = '260135';
      if (ktv2Code === '260153') ktv2Code = '260135';
      const ktv1Name = /^sagawa$/i.test((r[28] || '').trim()) ? '' : (r[28] || '').trim();
      const ktv2Name = (r[30] || '').trim();
      const note = (r[23] || r[3] || '').trim();
      const addr = (r[8] || '').trim();
      const isStairs = /thang bộ|khiêng bộ|lầu bộ|không có thang máy|không thang máy/i.test(addr + ' ' + note) ? 1 : 0;
      orderGroups.set(inv, {
        invoice_no: inv,
        order_date: parseDateIso(r[5]),
        delivery_date: parseDateIso(r[1] || r[26]),
        customer_name: cust,
        customer_phone: cleanPhone(r[7]),
        address: addr,
        region: normalizeRegion(r[10]),
        distance_km: num(r[9]),
        carrier: car,
        tracking_no: trk,
        source_warehouse: itemWh,
        _whSet: new Set([itemWh]),
        moving_no: itemMv,
        pic_sales: (r[22] || '').trim(),
        channel: (r[24] || '').trim(),
        shipping_fee_3pl: num(r[25]),
        customer_paid_fee: 0,
        is_promo_free_ship: /free|miễn phí/i.test(note) ? 1 : 0,
        require_install: String(r[21] || '').toLowerCase().includes('có') ? 1 : 0,
        is_stairs: isStairs,
        ktv1_name: ktv1Name,
        ktv1_code: ktv1Code,
        ktv2_name: ktv2Name,
        ktv2_code: ktv2Code,
        ktvs_json: buildKtvsJson(ktv1Code, ktv1Name, ktv2Code, ktv2Name),
        status: (r[0] || 'New').trim() || 'New',
        install_status: (r[31] || '').trim(),
        notes: note,
        items: [],
        tickets: [],
      });
    }
    const og = orderGroups.get(inv);
    og._whSet.add(itemWh);
    og.source_warehouse = [...og._whSet].join(' + ');
    if (!og.moving_no && itemMv) og.moving_no = itemMv;
    if (og.shipping_fee_3pl === 0 && num(r[25]) > 0) {
      og.shipping_fee_3pl = num(r[25]);
    }
    if (String(r[21] || '').toLowerCase().includes('có')) og.require_install = 1;
    const p = productMap.get(bc);
    og.items.push({
      barcode: bc,
      product_name: (r[16] || p?.name_vn || bc).trim(),
      unit: (r[17] || 'Cái').trim() || 'Cái',
      qty: num(r[18]) || 1,
      net_weight_g: p?.net_weight_g || num(r[19]) * 1000,
      warranty_months: p?.warranty_months || warrantyMonthsFromText(r[33]),
      warranty_policy: p?.warranty_policy || (r[33] || 'Không bảo hành').trim(),
      p_handling_unit: p ? p.p_handling : 15000,
      p_installation_unit: p ? p.p_installation : 0,
      source_warehouse: itemWh,
      moving_no: itemMv,
    });

    const tkNo = (r[37] || '').trim();
    if (tkNo) {
      og.tickets.push({
        ticket_no: tkNo,
        invoice_no: inv,
        customer_name: cust,
        customer_phone: cleanPhone(r[7]),
        address: (r[8] || '').trim(),
        barcode: bc,
        product_name: (r[16] || '').trim(),
        service_level: String(r[38] || '').includes('3') ? 'C3' : (String(r[38] || '').includes('2') ? 'C2' : 'C1'),
        status: String(r[39] || '').toLowerCase().includes('hoàn tất') ? 'Closed' : 'In Progress',
      });
    }
  }

  let orderCount = 0;
  let itemCount = 0;
  const orderIdByInv = new Map();
  const orderItemRows = [];
  const ticketRows = [];

  for (const og of orderGroups.values()) {
    const res = await dbRun(
      `INSERT INTO orders (
        invoice_no, order_date, delivery_date, customer_name, customer_phone, address, region,
        distance_km, carrier, tracking_no, source_warehouse, moving_no, pic_sales, channel,
        shipping_fee_3pl, customer_paid_fee, is_promo_free_ship, require_install, is_stairs,
        ktv1_name, ktv1_code, ktv2_name, ktv2_code, ktvs_json, status, install_status, notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        og.invoice_no, og.order_date, og.delivery_date, og.customer_name, og.customer_phone, og.address, og.region,
        og.distance_km, og.carrier, og.tracking_no, og.source_warehouse, og.moving_no, og.pic_sales, og.channel,
        og.shipping_fee_3pl, og.customer_paid_fee, og.is_promo_free_ship, og.require_install, og.is_stairs,
        og.ktv1_name, og.ktv1_code, og.ktv2_name, og.ktv2_code, og.ktvs_json, og.status, og.install_status, og.notes,
      ]
    );
    const oid = res.lastInsertRowid;
    orderIdByInv.set(og.invoice_no, oid);
    orderCount++;
    for (const it of og.items) {
      orderItemRows.push([oid, it.barcode, it.product_name, it.unit, it.qty, it.net_weight_g, it.warranty_months, it.warranty_policy, it.p_handling_unit, it.p_installation_unit, it.source_warehouse || '9005', it.moving_no || '']);
      itemCount++;
    }
    for (const tk of og.tickets) {
      ticketRows.push([tk.ticket_no, tk.invoice_no, tk.customer_name, tk.customer_phone, tk.address, tk.barcode, tk.product_name, 'Zalo OA', 'Sự cố bảo hành lịch sử (Shipments)', tk.service_level, 1, 'Trần Anh Tuyến', tk.status]);
    }
  }
  await batchInsert(
    `INSERT INTO order_items (order_id, barcode, product_name, unit, qty, net_weight_g, warranty_months, warranty_policy, p_handling_unit, p_installation_unit, source_warehouse, moving_no) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    orderItemRows
  );
  await batchInsert(
    `INSERT OR IGNORE INTO warranty_tickets (ticket_no, invoice_no, customer_name, customer_phone, address, barcode, product_name, channel, issue_desc, service_level, is_in_warranty, ktv_assigned, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ticketRows
  );
  console.log(`[Seed] Orders: ${orderCount} (${itemCount} items)`);

  // 6. WAREHOUSE SLIPS (NK & XK)
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

  const slipItemRows = [];
  for (const g of nkGroups.values()) {
    const res = await dbRun(
      `INSERT OR IGNORE INTO warehouse_slips (slip_no, slip_type, slip_date, expected_date, expected_time, created_by, partner_code, partner_name, carrier, warehouse_code, purpose, ref_invoice, ref_po, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [g.slip_no, 'NK', g.slip_date, g.slip_date, g.expected_time, g.created_by, g.partner_code, g.partner_name, g.carrier, '9005', g.purpose, g.ref_invoice, g.ref_po, g.status, g.notes]
    );
    const sid = res.lastInsertRowid;
    if (sid) g.items.forEach(it => slipItemRows.push([sid, it.barcode, it.product_name, it.unit, it.qty, it.qty, '']));
  }

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
    const res = await dbRun(
      `INSERT OR IGNORE INTO warehouse_slips (slip_no, slip_type, slip_date, expected_date, expected_time, created_by, partner_code, partner_name, carrier, warehouse_code, purpose, ref_invoice, ref_po, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [g.slip_no, 'XK', g.slip_date, g.expected_date, g.expected_time, g.created_by, '', 'Toàn Nhất Logistics', g.carrier, '9005', g.purpose, g.ref_invoice, '', g.status, g.notes]
    );
    const sid = res.lastInsertRowid;
    if (sid) g.items.forEach(it => slipItemRows.push([sid, it.barcode, it.product_name, it.unit, it.qty, it.qty, '']));
  }
  await batchInsert(
    `INSERT INTO warehouse_slip_items (slip_id, barcode, product_name, unit, qty, actual_qty, note) VALUES (?,?,?,?,?,?,?)`,
    slipItemRows
  );
  console.log(`[Seed] Warehouse slips: ${nkGroups.size} NK, ${xkGroups.size} XK`);

  // 7. HANDOVERS (BM-01 from BIEN_BAN_DATA.csv)
  const bmRaw = readCsv(path.join(DATA, 'bm01_sheet', 'BIEN_BAN_DATA.csv'));
  const seenBm = new Set();
  const hoRows = [];
  for (let i = 2; i < bmRaw.length; i++) {
    const r = bmRaw[i];
    const docNo = (r[0] || '').trim();
    if (!docNo || !docNo.startsWith('BB-') || seenBm.has(docNo)) continue;
    seenBm.add(docNo);
    const inv = (r[1] || '').trim();
    const k1Name = (r[9] || '').trim(), k1Code = (r[10] || '').trim();
    const k2Name = (r[11] || '').trim(), k2Code = (r[12] || '').trim();
    hoRows.push([
      docNo, 'BM-01', orderIdByInv.get(inv) || null, inv, parseDateIso(r[2]), (r[3] || 'DC 9005').replace('DC ', '').trim(),
      (r[4] || '').trim(), cleanPhone(r[5]), (r[6] || '').trim(), normalizeCarrier(r[7]), (r[8] || 'Kỹ thuật Benom').trim(),
      k1Name, k1Code, k2Name, k2Code, buildKtvsJson(k1Code, k1Name, k2Code, k2Name), 5, 'Completed',
    ]);
  }
  await batchInsert(
    `INSERT OR IGNORE INTO handovers (
      doc_no, doc_type, order_id, invoice_no, handover_date, warehouse_code,
      customer_name, customer_phone, address, carrier, install_mode,
      ktv1_name, ktv1_code, ktv2_name, ktv2_code, ktvs_json, csat_rating, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    hoRows
  );
  console.log(`[Seed] Handovers (BM-01): ${seenBm.size}`);

  // 8. QC FACTORY RETURNS
  await batchInsert(
    `INSERT INTO qc_factory_returns (supplier_name, barcode, product_name, issue, defective_qty, sold_qty, stock_qty, defect_rate, action, est_out, est_in, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ['ELEK', '8935273401013', 'Đèn Elia', 'Broken shade', 1, 2, 51, 1.9, 'Replace shade', '16/11', '17/11', 'Returned'],
      ['ELEK', '8935273400993', 'Đèn Livia Đỏ', 'Broken + tilted', 2, 9, 37, 4.3, 'Exchange new', '16/11', '17/11', 'Returned'],
      ['HIỂU ĐỨC', '8935382601229', 'Kệ Claro Xanh Đen', 'Misaligned holes', 1, 1, 0, 100.0, 'Back to factory', '10/11', 'TBU', 'Sent to Factory'],
      ['SAVIMEX', '8935273401143', 'Kệ Keepsake 5 Tự Nhiên', 'No screw holes', 1, 1, 24, 4.0, 'Back to factory', 'TBU', 'TBU', 'Open'],
      ['SAVIMEX', '8935273401501', 'Sofa Murest 2M2', 'Missing middle leg', 1, 0, 5, 20.0, 'Back to factory', 'TBU', 'TBU', 'Open'],
      ['SAVIMEX', '8935273401525', 'Đôn Murest', 'Dented cushion', 1, 0, 11, 9.1, 'Back to factory', 'TBU', 'TBU', 'Open'],
      ['CABAY', '8935273400849', 'Mâm Harmin Gỗ Nâu', 'Cracked, no feet', 2, 9, 87, 2.1, 'Back to Sala office', '16/11', 'TBU', 'Sent to Factory'],
      ['HIỂU ĐỨC', '8935273455047', 'Kệ Treo Nolyn Xanh Đen', 'Scratch marks (38%)', 19, 3, 47, 38.0, 'Back to factory', '16/11', 'TBU', 'Sent to Factory'],
      ['HIỂU ĐỨC', '8935382601113', 'Bàn Ăn Noma Tự Nhiên', 'Turntable raised', 1, 0, 14, 7.1, 'Back to factory', '16/11', 'TBU', 'Sent to Factory'],
    ]
  );

  // 9. ERP SNAPSHOTS
  const erpInsertSql = `
    INSERT INTO erp_snapshots (
      target_month, store_code, barcode, product_name, supplier_code,
      open_qty, income_qty, sales_qty, sales_amt, cogs,
      movement_qty, return_qty, adj_qty, close_qty, close_cst, loss_qty
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  async function ingestErpFile(filePath, overrideMonth = null) {
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    if (lines.length < 2) return 0;
    const headers = fastCsvLine(lines[0]);
    const idx = {};
    headers.forEach((h, i) => { idx[h.trim()] = i; });

    const rows = [];
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

      rows.push([
        overrideMonth || (row[idx['Target Month']] || '').trim(),
        (row[idx['Store Code']] || '').trim(),
        (row[idx['Barcode']] || '').trim(),
        (row[idx['Product Name']] || '').trim(),
        (row[idx['Supplier Code']] || '').trim(),
        oq, iq, sq, sa, num(row[idx['COGS']]),
        mq, num(row[idx['Return Qty']]), num(row[idx['Adj Qty']]),
        cq, num(row[idx['Close Cst']]), num(row[idx['Loss Qty']]),
      ]);
    }
    await batchInsert(erpInsertSql, rows, 150);
    return rows.length;
  }

  const cnt9005 = await ingestErpFile(path.join(IMPORTED, 'Automatic_Inventory 9005 - Raw_ERP.csv'), '202611');
  let cnt3001 = 0;
  const inv3001Dir = path.join(DATA, 'inventory 3001');
  if (fs.existsSync(inv3001Dir)) {
    const invFiles = fs.readdirSync(inv3001Dir).filter(f => f.endsWith('.csv')).sort();
    for (const f of invFiles) {
      const m = f.match(/_T(\d+)[._]2026\.csv$/);
      const ym = m ? `2026${m[1].padStart(2, '0')}` : null;
      cnt3001 += await ingestErpFile(path.join(inv3001Dir, f), ym);
    }
  }
  console.log(`[Seed] ERP snapshots: 9005=${cnt9005} rows, 3001=${cnt3001} rows`);

  // Mark Top 50 SKUs by Store 3001 revenue
  const top50 = await dbAll(`
    SELECT barcode FROM erp_snapshots
    WHERE store_code = '3001' AND sales_amt > 0
    GROUP BY barcode ORDER BY SUM(sales_amt) DESC LIMIT 50
  `);
  await batchInsert(
    `UPDATE products SET is_top_50 = 1, min_stock_3001 = CASE WHEN min_stock_3001 = 0 THEN 2 ELSE min_stock_3001 END WHERE barcode = ?`,
    top50.map(r => [r.barcode])
  );

  // 10. PRODUCT GUIDES (HDLR & HDBQ)
  const guidePath = path.join(ROOT, '06_product_guides', 'HDLR_HDBQ_San_pham_2025-2026.md');
  if (fs.existsSync(guidePath)) {
    const md = fs.readFileSync(guidePath, 'utf8');
    const sections = md.split(/\n(?=#{1,2}\s+)/).filter(s => s.trim().length > 80);
    const guideRows = sections.slice(0, 40).map(sec => {
      const firstLine = sec.split('\n')[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      const lineKey = ['Noma', 'Jomo', 'Welin', 'Cherish', 'Pourin', 'Sunim', 'Raima', 'Keepsake', 'Solace', 'Livia', 'Lilow', 'Be-there', 'Stillie', 'Orini', 'Claro', 'Stelo', 'Murest', 'Nelia'].find(k => firstLine.toLowerCase().includes(k.toLowerCase())) || 'Chung';
      const gtype = /bảo quản|hdbq/i.test(firstLine) ? 'HDBQ' : 'HDLR';
      return [firstLine.slice(0, 120), lineKey, gtype, sec.slice(0, 6000)];
    });
    await batchInsert(`INSERT INTO product_guides (title, product_line, guide_type, content_md) VALUES (?,?,?,?)`, guideRows);
    console.log(`[Seed] Product guides: ${guideRows.length} sections`);
  }

  // 11. Sample Support Logs
  await batchInsert(
    `INSERT INTO support_logs (log_date, staff_name, category, location, hours, notes) VALUES (?,?,?,?,?,?)`,
    [
      ['2026-11-16', 'Trần Anh Tuyến', 'QC Xưởng NCC', 'Xưởng Hiểu Đức', 4.5, 'Kiểm tra lô 19 Kệ treo Nolyn xanh đen bị trầy xước (38%)'],
      ['2026-11-18', 'Trần Anh Tuyến', 'Hỗ trợ Pop-up 1001', 'Aeon Mall Bình Tân (1001)', 5.0, 'Hỗ trợ đứng ca & điều phối trưng bày hàng Pop-up 1001'],
      ['2026-11-20', 'Trần Anh Tuyến', 'QC Xưởng NCC', 'Toàn Nhất Sóng Thần (BD02)', 3.0, 'Đo đạc tối ưu layout đưa diện tích kho về 296,58 m²'],
    ]
  );

  console.log(`[Seed] Complete! Database ready (${isCloudDb() ? 'Turso Cloud' : DB_PATH})`);
}

if (process.argv[1] && process.argv[1].endsWith('seed.mjs')) {
  runSeed(
    process.argv.includes('--force'),
    process.argv.includes('--confirm-cloud-reset')
  ).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
