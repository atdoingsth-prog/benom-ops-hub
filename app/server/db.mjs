import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../data');
export const DB_PATH = path.join(DATA_DIR, 'benom_ops.db');

let _client = null;
let _initialized = false;

export function isCloudDb() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

export function getClient() {
  if (_client) return _client;
  if (process.env.TURSO_DATABASE_URL) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Windows-safe file URL for libsql
    const fileUrl = 'file:' + DB_PATH.replace(/\\/g, '/');
    _client = createClient({ url: fileUrl });
  }
  return _client;
}

function normalizeRow(row) {
  if (!row) return row;
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    obj[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return obj;
}

export async function dbAll(sql, args = []) {
  const res = await getClient().execute({ sql, args });
  return res.rows.map(normalizeRow);
}

export async function dbGet(sql, args = []) {
  const res = await getClient().execute({ sql, args });
  return res.rows.length ? normalizeRow(res.rows[0]) : undefined;
}

export async function dbRun(sql, args = []) {
  const res = await getClient().execute({ sql, args });
  return {
    rowsAffected: res.rowsAffected,
    lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
  };
}

export async function dbBatch(statements) {
  return getClient().batch(statements, 'write');
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'VIEWER',
    department TEXT DEFAULT 'benom',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    barcode TEXT PRIMARY KEY,
    sku TEXT DEFAULT '',
    name_vn TEXT NOT NULL,
    name_en TEXT DEFAULT '',
    category TEXT DEFAULT '',
    product_family TEXT DEFAULT '',
    item_type TEXT DEFAULT 'PRODUCT',
    supplier_code TEXT DEFAULT '',
    supplier_name TEXT DEFAULT '',
    retail_price REAL DEFAULT 0,
    cost_price REAL DEFAULT 0,
    unit TEXT DEFAULT 'Cái',
    length_mm REAL DEFAULT 0,
    width_mm REAL DEFAULT 0,
    height_mm REAL DEFAULT 0,
    net_weight_g REAL DEFAULT 0,
    box_w_cm REAL DEFAULT 0,
    box_d_cm REAL DEFAULT 0,
    box_h_cm REAL DEFAULT 0,
    qty_per_pcs REAL DEFAULT 1,
    qty_per_box REAL DEFAULT 1,
    max_stack REAL DEFAULT 1,
    p_handling REAL DEFAULT 15000,
    install_level TEXT DEFAULT 'No',
    p_installation REAL DEFAULT 0,
    warranty_policy TEXT DEFAULT 'Không bảo hành',
    warranty_months INTEGER DEFAULT 0,
    has_hdlr INTEGER DEFAULT 0,
    has_hdbq INTEGER DEFAULT 0,
    min_stock_3001 INTEGER DEFAULT 0,
    is_top_50 INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active'
  )`,
  `CREATE TABLE IF NOT EXISTS staff (
    emp_code TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT '',
    department TEXT DEFAULT 'Operations',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS warehouses (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'Store',
    address TEXT DEFAULT '',
    capacity_m2 REAL DEFAULT 0,
    monthly_fee_vnd REAL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS partners (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    partner_type TEXT DEFAULT 'TRADING',
    category TEXT DEFAULT '',
    contact_info TEXT DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT NOT NULL,
    order_date TEXT DEFAULT '',
    delivery_date TEXT DEFAULT '',
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    region TEXT DEFAULT 'HCM',
    distance_km REAL DEFAULT 0,
    carrier TEXT DEFAULT '',
    tracking_no TEXT DEFAULT '',
    source_warehouse TEXT DEFAULT '9005',
    moving_no TEXT DEFAULT '',
    pic_sales TEXT DEFAULT '',
    channel TEXT DEFAULT '',
    shipping_fee_3pl REAL DEFAULT 0,
    customer_paid_fee REAL DEFAULT 0,
    is_promo_free_ship INTEGER DEFAULT 0,
    require_install INTEGER DEFAULT 0,
    is_stairs INTEGER DEFAULT 0,
    ktv1_name TEXT DEFAULT '',
    ktv1_code TEXT DEFAULT '',
    ktv2_name TEXT DEFAULT '',
    ktv2_code TEXT DEFAULT '',
    ktvs_json TEXT DEFAULT '[]',
    status TEXT DEFAULT 'New',
    install_status TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    barcode TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    unit TEXT DEFAULT 'Cái',
    qty REAL DEFAULT 1,
    net_weight_g REAL DEFAULT 0,
    warranty_months INTEGER DEFAULT 0,
    warranty_policy TEXT DEFAULT 'Không bảo hành',
    p_handling_unit REAL DEFAULT 15000,
    p_installation_unit REAL DEFAULT 0,
    source_warehouse TEXT DEFAULT '',
    moving_no TEXT DEFAULT '',
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS warehouse_slips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slip_no TEXT UNIQUE NOT NULL,
    slip_type TEXT NOT NULL,
    slip_date TEXT DEFAULT '',
    expected_date TEXT DEFAULT '',
    expected_time TEXT DEFAULT '',
    created_by TEXT DEFAULT 'Trần Anh Tuyến',
    partner_code TEXT DEFAULT '',
    partner_name TEXT DEFAULT '',
    carrier TEXT DEFAULT '',
    warehouse_code TEXT DEFAULT '9005',
    purpose TEXT DEFAULT 'Giao khách',
    ref_invoice TEXT DEFAULT '',
    ref_po TEXT DEFAULT '',
    status TEXT DEFAULT 'Sent',
    cutoff_warning TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS warehouse_slip_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slip_id INTEGER NOT NULL,
    barcode TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    unit TEXT DEFAULT 'Thùng',
    qty REAL DEFAULT 1,
    actual_qty REAL,
    note TEXT DEFAULT '',
    FOREIGN KEY (slip_id) REFERENCES warehouse_slips(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS handovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no TEXT UNIQUE NOT NULL,
    doc_type TEXT DEFAULT 'BM-01',
    order_id INTEGER,
    invoice_no TEXT DEFAULT '',
    handover_date TEXT DEFAULT '',
    warehouse_code TEXT DEFAULT '9005',
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    carrier TEXT DEFAULT '',
    driver_name TEXT DEFAULT '',
    driver_phone TEXT DEFAULT '',
    vehicle_plate TEXT DEFAULT '',
    install_mode TEXT DEFAULT 'Kỹ thuật Benom lắp đặt',
    ktv1_name TEXT DEFAULT '',
    ktv1_code TEXT DEFAULT '',
    ktv2_name TEXT DEFAULT '',
    ktv2_code TEXT DEFAULT '',
    ktvs_json TEXT DEFAULT '[]',
    check_1 INTEGER DEFAULT 1,
    check_2 INTEGER DEFAULT 1,
    check_3 INTEGER DEFAULT 1,
    check_4 INTEGER DEFAULT 1,
    issue_note TEXT DEFAULT '',
    due_date TEXT DEFAULT '',
    signature_data TEXT DEFAULT '',
    photos_json TEXT DEFAULT '[]',
    csat_rating INTEGER DEFAULT 0,
    csat_comment TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS warranty_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_no TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now', '+7 hours')),
    invoice_no TEXT DEFAULT '',
    handover_no TEXT DEFAULT '',
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    channel TEXT DEFAULT 'Zalo OA',
    issue_desc TEXT DEFAULT '',
    service_level TEXT DEFAULT 'C1',
    is_in_warranty INTEGER DEFAULT 1,
    fee_service REAL DEFAULT 0,
    fee_parts REAL DEFAULT 0,
    fee_ship REAL DEFAULT 0,
    ktv_assigned TEXT DEFAULT '',
    status TEXT DEFAULT 'New',
    sla_respond_at TEXT DEFAULT '',
    sla_assess_at TEXT DEFAULT '',
    sla_resolve_at TEXT DEFAULT '',
    responded_at TEXT DEFAULT '',
    resolved_at TEXT DEFAULT '',
    bm03_no TEXT DEFAULT '',
    bm04_no TEXT DEFAULT '',
    resolution_note TEXT DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS qc_factory_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    barcode TEXT DEFAULT '',
    product_name TEXT NOT NULL,
    issue TEXT DEFAULT '',
    defective_qty INTEGER DEFAULT 0,
    sold_qty INTEGER DEFAULT 0,
    stock_qty INTEGER DEFAULT 0,
    defect_rate REAL DEFAULT 0,
    action TEXT DEFAULT 'Back to factory',
    est_out TEXT DEFAULT '',
    est_in TEXT DEFAULT '',
    ref_xk_no TEXT DEFAULT '',
    ref_nk_no TEXT DEFAULT '',
    status TEXT DEFAULT 'Open'
  )`,
  `CREATE TABLE IF NOT EXISTS erp_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_month TEXT NOT NULL,
    store_code TEXT NOT NULL,
    barcode TEXT NOT NULL,
    product_name TEXT DEFAULT '',
    supplier_code TEXT DEFAULT '',
    open_qty REAL DEFAULT 0,
    income_qty REAL DEFAULT 0,
    sales_qty REAL DEFAULT 0,
    sales_amt REAL DEFAULT 0,
    cogs REAL DEFAULT 0,
    movement_qty REAL DEFAULT 0,
    return_qty REAL DEFAULT 0,
    adj_qty REAL DEFAULT 0,
    close_qty REAL DEFAULT 0,
    close_cst REAL DEFAULT 0,
    loss_qty REAL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_erp_month_store ON erp_snapshots(target_month, store_code)`,
  `CREATE INDEX IF NOT EXISTS idx_erp_barcode ON erp_snapshots(barcode)`,
  `CREATE TABLE IF NOT EXISTS support_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    staff_name TEXT DEFAULT 'Trần Anh Tuyến',
    category TEXT NOT NULL,
    location TEXT DEFAULT '',
    hours REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS product_guides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    product_line TEXT DEFAULT '',
    guide_type TEXT DEFAULT 'HDLR',
    content_md TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pos_slips (
    slip_no TEXT PRIMARY KEY,
    sales_month TEXT NOT NULL,
    sales_day TEXT DEFAULT '',
    store_code TEXT DEFAULT '3001',
    delivery_cust_pay REAL DEFAULT 0,
    install_cust_pay REAL DEFAULT 0,
    net_sales_excl_tax REAL DEFAULT 0,
    gross_sales_incl_tax REAL DEFAULT 0,
    has_furniture INTEGER DEFAULT 0,
    items_summary TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pos_slips_month ON pos_slips(sales_month)`,
  `CREATE TABLE IF NOT EXISTS delivery_tracking (
    slip_no TEXT PRIMARY KEY,
    sales_month TEXT NOT NULL,
    sales_day TEXT DEFAULT '',
    store_code TEXT DEFAULT '3001',
    delivery_cust_pay REAL DEFAULT 0,
    install_cust_pay REAL DEFAULT 0,
    fee_3pl REAL DEFAULT 0,
    net_sales_excl_tax REAL DEFAULT 0,
    carrier_3pl TEXT DEFAULT '',
    area TEXT DEFAULT 'HCM',
    note TEXT DEFAULT '',
    items_summary TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_tracking_month ON delivery_tracking(sales_month)`,
  `CREATE TABLE IF NOT EXISTS bm03_inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no TEXT UNIQUE NOT NULL,
    doc_date TEXT DEFAULT '',
    ticket_id INTEGER,
    ticket_no TEXT DEFAULT '',
    invoice_no TEXT DEFAULT '',
    handover_no TEXT DEFAULT '',
    location TEXT DEFAULT 'Nhà khách hàng',
    tech_name TEXT DEFAULT '',
    wh_rep TEXT DEFAULT '',
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    qty REAL DEFAULT 1,
    receive_date TEXT DEFAULT '',
    packaging_state TEXT DEFAULT 'Bao bì gốc',
    damage_types_json TEXT DEFAULT '[]',
    damage_other TEXT DEFAULT '',
    root_cause TEXT DEFAULT 'Lỗi NSX/NCC',
    customer_resolution TEXT DEFAULT 'Đổi mới 1-1',
    replacement_code TEXT DEFAULT '',
    appointment_date TEXT DEFAULT '',
    refund_amount REAL DEFAULT 0,
    warehouse_disposition TEXT DEFAULT 'Nhập DC 9005 claim NCC',
    inv_adj_code TEXT DEFAULT '',
    photos_json TEXT DEFAULT '[]',
    signature_data TEXT DEFAULT '',
    status TEXT DEFAULT 'Open',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS bm04_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no TEXT UNIQUE NOT NULL,
    doc_date TEXT DEFAULT '',
    location TEXT DEFAULT 'Kho DC 9005',
    ticket_id INTEGER,
    ticket_no TEXT DEFAULT '',
    invoice_no TEXT DEFAULT '',
    carrier TEXT DEFAULT 'Ahamove',
    awb_no TEXT DEFAULT '',
    route TEXT DEFAULT '',
    vehicle_plate TEXT DEFAULT '',
    driver_name TEXT DEFAULT '',
    driver_phone TEXT DEFAULT '',
    driver_cccd TEXT DEFAULT '',
    packaging_checks_json TEXT DEFAULT '[]',
    evidence_checks_json TEXT DEFAULT '[]',
    cause_assessment TEXT DEFAULT 'Chằng buộc sai quy cách/va đập',
    items_json TEXT DEFAULT '[]',
    goods_disposition TEXT DEFAULT 'Tạm giữ tại DC 9005 cách ly',
    claim_amount REAL DEFAULT 0,
    claim_deadline_at TEXT DEFAULT '',
    claim_status TEXT DEFAULT 'Open',
    photos_json TEXT DEFAULT '[]',
    driver_signature_data TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS allowance_locks (
    month_ym TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    locked_at TEXT NOT NULL,
    grand_total REAL DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    snapshot_json TEXT DEFAULT '{}',
    notes TEXT DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    user_id INTEGER,
    user_email TEXT DEFAULT '',
    user_name TEXT DEFAULT '',
    user_role TEXT DEFAULT '',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    before_json TEXT DEFAULT '',
    after_json TEXT DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type)`,
  `CREATE TABLE IF NOT EXISTS spare_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Ngũ kim liên kết',
    unit TEXT DEFAULT 'Bộ',
    stock_qty REAL DEFAULT 0,
    min_stock REAL DEFAULT 10,
    location TEXT DEFAULT 'Kho Store 3001 / Túi đồ KTV',
    notes TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  `CREATE TABLE IF NOT EXISTS spare_part_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER NOT NULL,
    part_code TEXT DEFAULT '',
    part_name TEXT DEFAULT '',
    tx_type TEXT NOT NULL,
    qty REAL NOT NULL,
    staff_name TEXT DEFAULT '',
    ref_doc TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
  )`,
  // Performance indexes for Turso Cloud & Local SQLite (eliminates full-table scans on joins & filters)
  `CREATE INDEX IF NOT EXISTS idx_erp_store_month_bc ON erp_snapshots(store_code, target_month, barcode)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(invoice_no)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_date_id ON orders(order_date DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_handovers_invoice ON handovers(invoice_no)`,
  `CREATE INDEX IF NOT EXISTS idx_handovers_order ON handovers(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_handovers_doctype ON handovers(doc_type, status)`,
  `CREATE INDEX IF NOT EXISTS idx_slips_type_date ON warehouse_slips(slip_type, slip_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_slip_items_slip ON warehouse_slip_items(slip_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_type_top ON products(item_type, is_top_50 DESC, net_weight_g DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_spare_part_logs_part ON spare_part_logs(part_id, id DESC)`,
];

export async function initDb() {
  if (_initialized) return;
  // Execute all CREATE TABLE / CREATE INDEX statements in 1 batch round-trip (huge Turso Cloud cold-start win)
  await dbBatch(SCHEMA_STATEMENTS.map(sql => ({ sql, args: [] })));
  // Safe migrations for existing Local/Turso databases
  await Promise.all([
    `ALTER TABLE orders ADD COLUMN ktvs_json TEXT DEFAULT '[]'`,
    `ALTER TABLE handovers ADD COLUMN ktvs_json TEXT DEFAULT '[]'`,
    `ALTER TABLE order_items ADD COLUMN source_warehouse TEXT DEFAULT ''`,
    `ALTER TABLE order_items ADD COLUMN moving_no TEXT DEFAULT ''`,
    `ALTER TABLE qc_factory_returns ADD COLUMN defect_category TEXT DEFAULT 'Khác'`,
  ].map(alterSql => dbRun(alterSql).catch(() => { /* column already exists */ })));

  // Check seed status in 1 parallel batch instead of 4 sequential round-trips
  const [userCount, whCount, stCount, spCount] = await Promise.all([
    dbGet('SELECT COUNT(*) as c FROM users'),
    dbGet('SELECT COUNT(*) as c FROM warehouses'),
    dbGet('SELECT COUNT(*) as c FROM staff'),
    dbGet('SELECT COUNT(*) as c FROM spare_parts'),
  ]);
  if (!userCount || userCount.c === 0) {
    const defaultPwd = hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || 'benom2026');
    const defaults = [
      ['admin@benom.vn', 'Trần Anh Tuyến (Operations Lead)', defaultPwd, 'ADMIN', 'Operations'],
      ['ktv@benom.vn', 'Kỹ thuật viên benom (Mobile 4G)', defaultPwd, 'KTV', 'Technical'],
      ['store@benom.vn', 'Store 3001 / Pop-up 1001 / CSKH', defaultPwd, 'EDITOR', 'Store & CS'],
      ['viewer@benom.vn', 'Quản lý / Marketing (Chỉ Xem)', defaultPwd, 'VIEWER', 'Management'],
    ];
    for (const u of defaults) {
      await dbRun(
        `INSERT OR IGNORE INTO users (email, full_name, password_hash, role, department, active) VALUES (?,?,?,?,?,1)`,
        u
      );
    }
    console.log('[Auth] Seeded 4 default role accounts (password: benom2026).');
  }
  // Seed base warehouses & staff if empty (useful on fresh Turso cloud DB)
  if (!whCount || whCount.c === 0) {
    const whs = [
      ['3001', 'Store benom Parkson Lê Thánh Tôn', 'Store', 'Tầng 3, 35-45 Lê Thánh Tôn, Q.1, TP.HCM', 0, 0],
      ['9005', 'Kho DC Toàn Nhất (BD02 - Sóng Thần 1)', '3PL Warehouse', 'Số 10 ĐL Độc Lập, KCN Sóng Thần 1, Dĩ An', 300, 32700000],
      ['1001', 'Pop-up Store benom Aeon Bình Tân', 'Pop-up', 'Aeon Mall Bình Tân, TP.HCM', 0, 0],
    ];
    await dbBatch(whs.map(w => ({ sql: `INSERT OR IGNORE INTO warehouses (code, name, type, address, capacity_m2, monthly_fee_vnd) VALUES (?,?,?,?,?,?)`, args: w })));
  }
  if (!stCount || stCount.c === 0) {
    const staffRows = [
      ['260135', 'Trần Anh Tuyến', 'Operations Lead', 'Operations'],
      ['KTV01', 'Nguyễn Huy Hoàng Tuấn', 'Kỹ thuật viên', 'Operations'],
      ['KTV02', 'Trương Văn Tính', 'Kỹ thuật viên', 'Operations'],
    ];
    await dbBatch(staffRows.map(s => ({ sql: `INSERT OR IGNORE INTO staff (emp_code, full_name, role, department, active) VALUES (?,?,?,?,1)`, args: s })));
  }
  // Seed default furniture hardware / spare parts kit if empty (TASK-15)
  if (!spCount || spCount.c === 0) {
    const defaultsSp = [
      ['NK-OC-M6', 'Bulông lục giác M6 + Long đền (Bàn/Ghế/Kệ)', 'Ốc vít & Liên kết', 'Cái', 100, 30, 'Túi đồ KTV / Store 3001', 'Dùng cho ghế Cheri, kệ Keepsake, bàn trà'],
      ['NK-OC-M8', 'Bulông lục giác M8 chịu lực (Bàn ăn/Giường)', 'Ốc vít & Liên kết', 'Cái', 80, 20, 'Túi đồ KTV / Store 3001', 'Dùng cho bàn ăn Noma, khung giường Kito'],
      ['NK-CAM-15', 'Ốc cam liên kết + Chốt gỗ ø8 (Tủ/Kệ)', 'Ốc vít & Liên kết', 'Bộ', 60, 20, 'Store 3001', 'Khắc phục hở mối nối tủ/kệ lắp ráp'],
      ['NK-BL-GM', 'Bản lề giảm chấn cánh tủ (Thẳng/Cong)', 'Bản lề & Ray trượt', 'Cái', 24, 10, 'Store 3001', 'Bảo hành Cấp 1–2 cân chỉnh cánh tủ'],
      ['NK-BAS-GUONG', 'Bộ bas treo tường + Tắc kê ø8 & Vít khoan', 'Phụ kiện treo tường', 'Bộ', 30, 10, 'Túi đồ KTV', 'Treo gương Be-there, kệ treo tường Nolyn'],
      ['NK-NUT-CHAN', 'Nút đệm nỉ / cao su chống trầy sàn gỗ', 'Bảo vệ & Hoàn thiện', 'Cái', 120, 40, 'Túi đồ KTV', 'Chống trầy sàn khi bàn giao bàn/ghế'],
      ['NK-SAP-GO', 'Sáp / Dầu dưỡng gỗ tự nhiên & Dầu bôi trơn bi', 'Bảo dưỡng đồ gỗ', 'Chai', 6, 2, 'Store 3001', 'Bảo dưỡng bàn xoay Noma & mặt gỗ định kỳ'],
      ['NK-BUT-DAM', 'Bút dặm màu sơn gỗ (Tự nhiên / Óc chó / Đen)', 'Xử lý bề mặt gỗ', 'Cây', 9, 3, 'Túi đồ KTV', 'Chấm dặm vết xước nhẹ tại nhà khách (Cấp 1)'],
    ];
    await dbBatch(defaultsSp.map(sp => ({
      sql: `INSERT OR IGNORE INTO spare_parts (code, name, category, unit, stock_qty, min_stock, location, notes) VALUES (?,?,?,?,?,?,?,?)`,
      args: sp,
    })));
  }
  _initialized = true;
}
