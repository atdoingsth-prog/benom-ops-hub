import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { initDb, dbAll, dbGet, dbRun, dbBatch, isCloudDb } from './db.mjs';
import { hashPassword, verifyPassword, signToken, requireAuth, requireRoles } from './auth.mjs';
import { isMailerConfigured, sendInviteEmail } from './mailer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = process.env.PORT || 3005;

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Async error wrapper
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── HELPERS ──────────────────────────────────────────────────
function num(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/VND|đ|,|\s/gi, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function calcDistanceAllowance(km) {
  const d = Number(km) || 0;
  if (d <= 0) return 0;
  if (d < 5) return 20000;
  if (d < 10) return 40000;
  if (d <= 20) return 70000;
  return 100000 + Math.ceil(d - 20) * 5000;
}

function evaluateToanNhatCutoff(expectedDate, expectedTime) {
  const warnings = [];
  const now = new Date();
  const hourNow = now.getHours();
  if (expectedDate) {
    const exp = new Date(expectedDate + 'T00:00:00');
    const dow = exp.getDay();
    if (dow === 0) warnings.push('Chủ nhật: phụ phí xếp dỡ 200%–250% + 100.000đ/giờ giám sát (PLHĐ 01).');
    if (dow === 6 && expectedTime && parseInt(expectedTime, 10) >= 13) {
      warnings.push('Chiều Thứ 7: phụ phí xếp dỡ 150%–200% + 100.000đ/giờ giám sát.');
    }
    const todayIso = now.toISOString().slice(0, 10);
    if (expectedDate === todayIso) {
      warnings.push('Đơn gấp trong ngày (< 4 giờ): Hợp đồng 019-2026 tính phí bốc xếp 200%.');
    } else if (hourNow >= 16 && hourNow < 18) {
      warnings.push('Gửi lệnh 16h00–18h00: Toàn Nhất giao chiều ngày N+1 (Đ5.2).');
    } else if (hourNow >= 18) {
      warnings.push('Gửi sau 18h00: tính sang chu kỳ ngày làm việc kế tiếp.');
    }
  }
  if (expectedTime) {
    const h = parseInt(String(expectedTime).replace(/[^\d]/g, '').slice(0, 2), 10);
    if (h >= 17) warnings.push('Ngoài giờ 17h–21h: phí 150% + 100.000đ/giờ giám sát.');
  }
  return warnings.join(' | ');
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

async function nextSlipNo(type) {
  const year = new Date().getFullYear();
  const prefix = `${type}-${year}-`;
  const rows = await dbAll(`SELECT slip_no FROM warehouse_slips WHERE slip_no LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.slip_no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(4, '0');
}

async function nextHandoverNo(docType) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = docType === 'BM-05' ? `PGH-${mm}${yy}-` : `BB-${mm}${yy}-`;
  const rows = await dbAll(`SELECT doc_no FROM handovers WHERE doc_no LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.doc_no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function nextTicketNo() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `TK-${mm}${yy}-`;
  const rows = await dbAll(`SELECT ticket_no FROM warranty_tickets WHERE ticket_no LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.ticket_no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function calcWarehouse9005Footprint() {
  const latestRow = await dbGet(`SELECT MAX(target_month) as m FROM erp_snapshots WHERE store_code = '9005'`);
  const latest = latestRow?.m || '202611';
  const rows = await dbAll(`
    SELECT e.barcode, e.product_name, e.supplier_code, e.close_qty, e.close_cst,
           p.supplier_name, p.box_w_cm, p.box_d_cm, p.box_h_cm, p.qty_per_pcs, p.qty_per_box, p.max_stack, p.retail_price
    FROM erp_snapshots e
    LEFT JOIN products p ON p.barcode = e.barcode
    WHERE e.store_code = '9005' AND e.target_month = ? AND e.close_qty > 0
  `, [latest]);

  let totalArea = 0;
  let totalQty = 0;
  let totalCost = 0;
  const bySupplier = new Map();
  const items = [];

  for (const r of rows) {
    const w = r.box_w_cm || 0;
    const d = r.box_d_cm || 0;
    const baseArea = (w * d) / 10000;
    const denom = (r.qty_per_pcs || 1) * (r.qty_per_box || 1);
    const maxStack = Math.max(1, r.max_stack || 1);
    const positions = baseArea > 0 ? Math.ceil((r.close_qty / denom) / maxStack) : 0;
    const footprint = positions * baseArea * 1.15;
    const supName = r.supplier_name || r.supplier_code || 'Khác';

    totalArea += footprint;
    totalQty += r.close_qty;
    totalCost += r.close_cst || 0;

    const cur = bySupplier.get(supName) || { supplier: supName, qty: 0, area_m2: 0, cost: 0 };
    cur.qty += r.close_qty;
    cur.area_m2 += footprint;
    cur.cost += r.close_cst || 0;
    bySupplier.set(supName, cur);

    items.push({
      barcode: r.barcode,
      product_name: r.product_name,
      supplier: supName,
      close_qty: r.close_qty,
      base_area_m2: Number(baseArea.toFixed(4)),
      positions,
      footprint_m2: Number(footprint.toFixed(2)),
    });
  }

  const suppliers = Array.from(bySupplier.values())
    .sort((a, b) => b.area_m2 - a.area_m2)
    .map(s => ({
      ...s,
      area_m2: Number(s.area_m2.toFixed(2)),
      share_pct: totalArea > 0 ? Number(((s.area_m2 / totalArea) * 100).toFixed(1)) : 0,
      est_monthly_cost: Math.round(s.area_m2 * 109000),
    }));

  return {
    target_month: latest,
    cap_m2: 300,
    total_area_m2: Number(totalArea.toFixed(2)),
    utilization_pct: Number(((totalArea / 300) * 100).toFixed(1)),
    overflow_blocks_50m2: totalArea > 300 ? Math.ceil((totalArea - 300) / 50) : 0,
    total_qty: Math.round(totalQty),
    total_cost: Math.round(totalCost),
    suppliers,
    items: items.sort((a, b) => b.footprint_m2 - a.footprint_m2),
  };
}

// ─── 0. PUBLIC HEALTH & AUTH ROUTES ───────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: isCloudDb() ? 'turso-cloud' : 'local-sqlite' });
});

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Vui lòng nhập Email và Mật khẩu.' });

  const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = ?', [email]);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng (hoặc tài khoản đã bị khóa).' });
  }
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, department: user.department },
  });
}));

// Require authentication for all remaining /api/* routes
app.use('/api', requireAuth);

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user, mode: isCloudDb() ? 'turso-cloud' : 'local-sqlite' });
});

// ─── USER SHARING & RBAC (ADMIN ONLY - Google Sheets Style) ───
app.get('/api/users', requireRoles('ADMIN'), wrap(async (req, res) => {
  const users = await dbAll('SELECT id, email, full_name, role, department, active, created_at FROM users ORDER BY id ASC');
  res.json(users);
}));

app.get('/api/users/mailer-status', requireRoles('ADMIN'), (req, res) => {
  res.json({ configured: isMailerConfigured() });
});

app.post('/api/users', requireRoles('ADMIN'), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const fullName = String(req.body.full_name || '').trim();
  const role = ['ADMIN', 'EDITOR', 'KTV', 'VIEWER'].includes(req.body.role) ? req.body.role : 'VIEWER';
  const password = String(req.body.password || 'benom2026');
  const department = String(req.body.department || 'benom').trim();
  if (!email || !fullName) return res.status(400).json({ error: 'Vui lòng nhập Email và Họ tên.' });

  const dup = await dbGet('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
  if (dup) return res.status(409).json({ error: `Email ${email} đã tồn tại trong hệ thống.` });

  const r = await dbRun(
    `INSERT INTO users (email, full_name, password_hash, role, department, active) VALUES (?,?,?,?,?,1)`,
    [email, fullName, hashPassword(password), role, department]
  );

  const origin = process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  let emailResult = { sent: false, configured: isMailerConfigured() };
  if (req.body.send_email !== false) {
    try {
      emailResult = await sendInviteEmail({
        to: email,
        fullName,
        password,
        role,
        appUrl: origin,
        invitedBy: req.user.full_name,
        isReset: false,
      });
    } catch (err) {
      emailResult = { sent: false, configured: true, error: err.message };
    }
  }

  res.json({ id: r.lastInsertRowid, ok: true, email_result: emailResult });
}));

app.put('/api/users/:id', requireRoles('ADMIN'), wrap(async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const role = ['ADMIN', 'EDITOR', 'KTV', 'VIEWER'].includes(b.role) ? b.role : 'VIEWER';
  let emailResult = null;
  if (b.new_password && String(b.new_password).trim().length >= 4) {
    const newPwd = String(b.new_password).trim();
    await dbRun(
      `UPDATE users SET full_name=?, role=?, department=?, active=?, password_hash=? WHERE id=?`,
      [b.full_name, role, b.department || 'benom', b.active ? 1 : 0, hashPassword(newPwd), id]
    );
    const u = await dbGet('SELECT email, full_name, role FROM users WHERE id = ?', [id]);
    if (u && isMailerConfigured()) {
      const origin = process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
      try {
        emailResult = await sendInviteEmail({
          to: u.email,
          fullName: u.full_name,
          password: newPwd,
          role: u.role,
          appUrl: origin,
          invitedBy: req.user.full_name,
          isReset: true,
        });
      } catch (err) {
        emailResult = { sent: false, configured: true, error: err.message };
      }
    }
  } else {
    await dbRun(
      `UPDATE users SET full_name=?, role=?, department=?, active=? WHERE id=?`,
      [b.full_name, role, b.department || 'benom', b.active ? 1 : 0, id]
    );
  }
  res.json({ ok: true, email_result: emailResult });
}));

app.delete('/api/users/:id', requireRoles('ADMIN'), wrap(async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Không thể tự xóa tài khoản Admin đang đăng nhập!' });
  }
  await dbRun('DELETE FROM users WHERE id = ?', [targetId]);
  res.json({ ok: true });
}));

// ─── 1. DASHBOARD & ERP ANALYTICS ─────────────────────────────
app.get('/api/dashboard', wrap(async (req, res) => {
  const orderStats = await dbGet(`
    SELECT COUNT(*) as total_orders,
           COALESCE(SUM(CASE WHEN require_install = 1 THEN 1 ELSE 0 END), 0) as install_orders,
           COALESCE(SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END), 0) as done_orders,
           COALESCE(SUM(shipping_fee_3pl), 0) as total_3pl_cost,
           COALESCE(SUM(customer_paid_fee), 0) as total_cust_fee,
           COALESCE(SUM(CASE WHEN is_promo_free_ship = 1 THEN 1 ELSE 0 END), 0) as promo_free_orders
    FROM orders
  `);

  const carrierBreakdown = await dbAll(`
    SELECT COALESCE(NULLIF(carrier,''), 'Chưa chọn') as carrier, COUNT(*) as orders, COALESCE(SUM(shipping_fee_3pl), 0) as total_fee
    FROM orders GROUP BY carrier ORDER BY orders DESC
  `);

  const ticketStats = await dbGet(`
    SELECT COUNT(*) as total,
           COALESCE(SUM(CASE WHEN status NOT IN ('Closed','Resolved') THEN 1 ELSE 0 END), 0) as open_count
    FROM warranty_tickets
  `);

  const qcStats = await dbGet(`
    SELECT COUNT(*) as skus, COALESCE(SUM(defective_qty), 0) as units
    FROM qc_factory_returns WHERE status != 'Closed'
  `);

  const csatStats = await dbGet(`
    SELECT COUNT(*) as count, ROUND(AVG(csat_rating), 2) as avg_rating
    FROM handovers WHERE csat_rating > 0
  `);

  const supportStats = await dbAll(`SELECT category, SUM(hours) as hours FROM support_logs GROUP BY category`);
  const wh9005 = await calcWarehouse9005Footprint();

  const rawTrend = await dbAll(`
    SELECT target_month,
           COUNT(*) as active_skus,
           ROUND(SUM(sales_qty), 0) as sales_qty,
           ROUND(SUM(sales_amt), 0) as sales_amt,
           ROUND(SUM(cogs), 0) as cogs,
           ROUND(SUM(close_qty), 0) as close_qty,
           ROUND(SUM(close_cst), 0) as close_cst,
           SUM(CASE WHEN close_qty < 0 THEN 1 ELSE 0 END) as neg_skus
    FROM erp_snapshots
    WHERE store_code = '3001'
    GROUP BY target_month ORDER BY target_month ASC
  `);
  const store3001Trend = rawTrend.map(r => ({
    ...r,
    gp_pct: r.sales_amt > 0 ? Number((((r.sales_amt - r.cogs) / r.sales_amt) * 100).toFixed(1)) : 0,
  }));

  const latest3001 = store3001Trend.length ? store3001Trend[store3001Trend.length - 1].target_month : '202611';
  const last3Months = store3001Trend.slice(-3).map(x => x.target_month);
  const ph = last3Months.length ? last3Months.map(() => '?').join(',') : '?';
  const mArgs = last3Months.length ? last3Months : [latest3001];

  const negativeStock = await dbAll(`
    SELECT barcode, product_name, close_qty, store_code
    FROM erp_snapshots
    WHERE store_code = '3001' AND target_month = ? AND close_qty < 0
    ORDER BY close_qty ASC
  `, [latest3001]);

  const replenishAlerts = await dbAll(`
    SELECT s3.barcode, s3.product_name, s3.close_qty as stock_3001,
           COALESCE(s9.close_qty, 0) as stock_9005,
           COALESCE(r3.sold_3m, 0) as sold_3m,
           COALESCE(p.is_top_50, 0) as is_top_50,
           COALESCE(p.min_stock_3001, 2) as min_stock
    FROM erp_snapshots s3
    LEFT JOIN erp_snapshots s9 ON s9.barcode = s3.barcode AND s9.store_code = '9005' AND s9.target_month = ?
    LEFT JOIN (
      SELECT barcode, SUM(sales_qty) as sold_3m
      FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph})
      GROUP BY barcode
    ) r3 ON r3.barcode = s3.barcode
    LEFT JOIN products p ON p.barcode = s3.barcode
    WHERE s3.store_code = '3001' AND s3.target_month = ?
      AND COALESCE(r3.sold_3m, 0) >= 2 AND s3.close_qty <= 1 AND COALESCE(s9.close_qty, 0) > 0
    ORDER BY r3.sold_3m DESC
  `, [wh9005.target_month, ...mArgs, latest3001]);

  const slowMoving = await dbAll(`
    SELECT s3.barcode, s3.product_name, s3.close_qty, ROUND(s3.close_cst, 0) as close_cst,
           COALESCE(p.supplier_name, s3.supplier_code) as supplier
    FROM erp_snapshots s3
    LEFT JOIN (
      SELECT barcode, SUM(sales_qty) as sold_3m
      FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph})
      GROUP BY barcode
    ) r3 ON r3.barcode = s3.barcode
    LEFT JOIN products p ON p.barcode = s3.barcode
    WHERE s3.store_code = '3001' AND s3.target_month = ?
      AND s3.close_qty > 0 AND COALESCE(r3.sold_3m, 0) = 0
    ORDER BY s3.close_cst DESC LIMIT 50
  `, [...mArgs, latest3001]);

  const slowMovingTotal = await dbGet(`
    SELECT COUNT(*) as count, ROUND(COALESCE(SUM(s3.close_cst), 0), 0) as total_cost
    FROM erp_snapshots s3
    LEFT JOIN (
      SELECT barcode, SUM(sales_qty) as sold_3m
      FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph})
      GROUP BY barcode
    ) r3 ON r3.barcode = s3.barcode
    WHERE s3.store_code = '3001' AND s3.target_month = ?
      AND s3.close_qty > 0 AND COALESCE(r3.sold_3m, 0) = 0
  `, [...mArgs, latest3001]);

  res.json({
    orderStats, carrierBreakdown, ticketStats, qcStats, csatStats,
    supportStats, wh9005, store3001Trend, latest3001,
    negativeStock, replenishAlerts, slowMoving, slowMovingTotal,
  });
}));

// ─── 2. MASTER DATA & GUIDES ──────────────────────────────────
app.get('/api/master/products', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const type = (req.query.type || '').trim();
  let sql = `SELECT * FROM products WHERE 1=1`;
  const params = [];
  if (q) {
    sql += ` AND (barcode LIKE ? OR name_vn LIKE ? OR supplier_name LIKE ? OR product_family LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    sql += ` AND item_type = ?`;
    params.push(type);
  }
  sql += ` ORDER BY is_top_50 DESC, net_weight_g DESC, name_vn ASC LIMIT 300`;
  res.json(await dbAll(sql, params));
}));

app.put('/api/master/products/:barcode', requireRoles('ADMIN'), wrap(async (req, res) => {
  const { barcode } = req.params;
  const b = req.body;
  await dbRun(`
    UPDATE products SET name_vn=?, item_type=?, retail_price=?, cost_price=?, net_weight_g=?,
      p_handling=?, install_level=?, p_installation=?, warranty_policy=?, warranty_months=?,
      min_stock_3001=?, is_top_50=?
    WHERE barcode=?
  `, [
    b.name_vn, b.item_type || 'PRODUCT', num(b.retail_price), num(b.cost_price), num(b.net_weight_g),
    num(b.p_handling), b.install_level || 'No', num(b.p_installation),
    b.warranty_policy || 'Không bảo hành', num(b.warranty_months),
    num(b.min_stock_3001), b.is_top_50 ? 1 : 0, barcode
  ]);
  res.json({ ok: true });
}));

app.get('/api/master/lookups', wrap(async (req, res) => {
  const [staff, warehouses, partners] = await Promise.all([
    dbAll('SELECT * FROM staff WHERE active = 1 ORDER BY emp_code, full_name'),
    dbAll('SELECT * FROM warehouses ORDER BY code'),
    dbAll('SELECT * FROM partners ORDER BY partner_type, name'),
  ]);
  res.json({ staff, warehouses, partners });
}));

app.post('/api/master/staff', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const empCode = String(req.body.emp_code || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const role = String(req.body.role || 'Hỗ trợ lắp đặt').trim();
  const department = String(req.body.department || 'Operations').trim();
  if (!empCode || !fullName) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Mã NV (ID) và Họ tên Kỹ thuật viên.' });
  }
  await dbRun(
    `INSERT OR REPLACE INTO staff (emp_code, full_name, role, department, active) VALUES (?,?,?,?,1)`,
    [empCode, fullName, role, department]
  );
  res.json({ ok: true, staff: { emp_code: empCode, full_name: fullName, role, department, active: 1 } });
}));

function parseKtvs(row) {
  if (row?.ktvs_json) {
    try {
      const arr = JSON.parse(row.ktvs_json);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr
          .map(x => ({ code: String(x?.code || '').trim(), name: String(x?.name || '').trim() }))
          .filter(x => x.name || x.code);
      }
    } catch { /* fallback below */ }
  }
  const out = [];
  if (row?.ktv1_name || row?.ktv1_code) out.push({ code: String(row.ktv1_code || '').trim(), name: String(row.ktv1_name || '').trim() });
  if (row?.ktv2_name || row?.ktv2_code) out.push({ code: String(row.ktv2_code || '').trim(), name: String(row.ktv2_name || '').trim() });
  return out;
}

function normalizeKtvInput(b, fallbackRow = null) {
  let list = [];
  if (Array.isArray(b.ktvs)) {
    list = b.ktvs
      .map(x => ({ code: String(x?.code || '').trim(), name: String(x?.name || '').trim() }))
      .filter(x => x.name || x.code);
  } else if (b.ktv1_name !== undefined || b.ktv2_name !== undefined) {
    if (String(b.ktv1_name || '').trim()) list.push({ code: String(b.ktv1_code || '').trim(), name: String(b.ktv1_name || '').trim() });
    if (String(b.ktv2_name || '').trim()) list.push({ code: String(b.ktv2_code || '').trim(), name: String(b.ktv2_name || '').trim() });
  } else if (fallbackRow) {
    list = parseKtvs(fallbackRow);
  }
  return {
    list,
    json: JSON.stringify(list),
    ktv1_code: list[0]?.code || '',
    ktv1_name: list[0]?.name || '',
    ktv2_code: list[1]?.code || '',
    ktv2_name: list[1]?.name || '',
  };
}

app.get('/api/guides', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q) {
    return res.json(await dbAll(`SELECT * FROM product_guides WHERE title LIKE ? OR product_line LIKE ? OR content_md LIKE ?`, [`%${q}%`, `%${q}%`, `%${q}%`]));
  }
  res.json(await dbAll(`SELECT * FROM product_guides ORDER BY product_line, title`));
}));

// ─── 3. ORDERS & DISPATCH ─────────────────────────────────────
app.get('/api/orders', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim();
  let sql = `SELECT * FROM orders WHERE 1=1`;
  const params = [];
  if (q) {
    sql += ` AND (invoice_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR tracking_no LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY order_date DESC, id DESC LIMIT 200`;
  const orders = await dbAll(sql, params);
  const allItems = await dbAll(`SELECT * FROM order_items`);
  const allHos = await dbAll(`SELECT id, doc_no, doc_type, invoice_no, status, csat_rating FROM handovers`);

  const itemMap = new Map();
  for (const it of allItems) {
    const arr = itemMap.get(it.order_id) || [];
    arr.push(it);
    itemMap.set(it.order_id, arr);
  }
  const hoMap = new Map();
  for (const h of allHos) {
    const arr = hoMap.get(h.invoice_no) || [];
    arr.push(h);
    hoMap.set(h.invoice_no, arr);
  }

  const result = orders.map(o => {
    const items = itemMap.get(o.id) || [];
    const maxWeightG = items.reduce((m, it) => Math.max(m, it.net_weight_g || 0), 0);
    return {
      ...o,
      ktvs: parseKtvs(o),
      items,
      handovers: hoMap.get(o.invoice_no) || [],
      requires_two_ktv: maxWeightG >= 25000,
    };
  });
  res.json(result);
}));

app.post('/api/orders', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const items = Array.isArray(b.items) ? b.items : [];
  const ktvNorm = normalizeKtvInput(b);
  let requiresTwo = false;
  for (const it of items) {
    const prod = await dbGet('SELECT net_weight_g FROM products WHERE barcode = ?', [it.barcode || '']);
    if ((prod?.net_weight_g || num(it.net_weight_g)) >= 25000) requiresTwo = true;
  }
  if (b.require_install && requiresTwo && ktvNorm.list.length < 2) {
    return res.status(400).json({
      error: 'Quy tắc an toàn Benom: Đơn có sản phẩm ≥ 25 kg bắt buộc phân công tối thiểu 2 KTV!',
    });
  }

  const r = await dbRun(`
    INSERT INTO orders (
      invoice_no, order_date, delivery_date, customer_name, customer_phone, address, region,
      distance_km, carrier, tracking_no, source_warehouse, moving_no, pic_sales, channel,
      shipping_fee_3pl, customer_paid_fee, is_promo_free_ship, require_install, is_stairs,
      ktv1_name, ktv1_code, ktv2_name, ktv2_code, ktvs_json, status, install_status, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    b.invoice_no, b.order_date || new Date().toISOString().slice(0, 10), b.delivery_date || '',
    b.customer_name || '', String(b.customer_phone || '').trim(), b.address || '', b.region || 'HCM',
    num(b.distance_km), b.carrier || 'Ahamove', b.tracking_no || '', b.source_warehouse || '9005',
    b.moving_no || '', b.pic_sales || '', b.channel || '',
    num(b.shipping_fee_3pl), num(b.customer_paid_fee), b.is_promo_free_ship ? 1 : 0,
    b.require_install ? 1 : 0, b.is_stairs ? 1 : 0,
    ktvNorm.ktv1_name, ktvNorm.ktv1_code, ktvNorm.ktv2_name, ktvNorm.ktv2_code, ktvNorm.json,
    b.status || 'New', b.require_install ? 'Chờ lắp đặt' : '', b.notes || ''
  ]);
  const oid = r.lastInsertRowid;

  for (const it of items) {
    const p = await dbGet('SELECT * FROM products WHERE barcode = ?', [it.barcode || '']);
    await dbRun(`
      INSERT INTO order_items (order_id, barcode, product_name, unit, qty, net_weight_g, warranty_months, warranty_policy, p_handling_unit, p_installation_unit)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      oid, it.barcode || '', it.product_name || p?.name_vn || '', it.unit || p?.unit || 'Cái',
      num(it.qty) || 1, p?.net_weight_g || num(it.net_weight_g),
      p?.warranty_months || 0, p?.warranty_policy || 'Không bảo hành',
      p ? p.p_handling : 15000, p ? p.p_installation : 0
    ]);
  }
  res.json({ id: oid, ok: true });
}));

app.put('/api/orders/:id', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const existing = await dbGet('SELECT * FROM orders WHERE id = ?', [id]);
  const ktvNorm = normalizeKtvInput(b, existing);
  await dbRun(`
    UPDATE orders SET status=?, carrier=?, tracking_no=?, distance_km=?, shipping_fee_3pl=?,
      customer_paid_fee=?, is_promo_free_ship=?, is_stairs=?, require_install=?,
      ktv1_name=?, ktv1_code=?, ktv2_name=?, ktv2_code=?, ktvs_json=?, install_status=?, delivery_date=?, notes=?
    WHERE id=?
  `, [
    b.status, b.carrier, b.tracking_no, num(b.distance_km), num(b.shipping_fee_3pl),
    num(b.customer_paid_fee), b.is_promo_free_ship ? 1 : 0, b.is_stairs ? 1 : 0,
    b.require_install ? 1 : 0, ktvNorm.ktv1_name, ktvNorm.ktv1_code, ktvNorm.ktv2_name, ktvNorm.ktv2_code, ktvNorm.json,
    b.install_status || '', b.delivery_date || '', b.notes || '', id
  ]);
  res.json({ ok: true });
}));

app.post('/api/orders/:id/generate-xk', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const o = await dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  const items = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
  const slipNo = await nextSlipNo('XK');
  const today = new Date().toISOString().slice(0, 10);
  const expDate = req.body.expected_date || o.delivery_date || today;
  const expTime = req.body.expected_time || '09:00';
  const warning = evaluateToanNhatCutoff(expDate, expTime);

  const r = await dbRun(`
    INSERT INTO warehouse_slips (slip_no, slip_type, slip_date, expected_date, expected_time, created_by, partner_name, carrier, warehouse_code, purpose, ref_invoice, status, cutoff_warning, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [slipNo, 'XK', today, expDate, expTime, req.user.full_name, 'Toàn Nhất Logistics', o.carrier || 'Ahamove', '9005', 'Giao khách', o.invoice_no, 'Draft', warning, `Xuất giao ĐH ${o.invoice_no} - ${o.customer_name}`]);
  const sid = r.lastInsertRowid;
  for (const it of items) {
    await dbRun(`INSERT INTO warehouse_slip_items (slip_id, barcode, product_name, unit, qty) VALUES (?,?,?,?,?)`, [sid, it.barcode, it.product_name, it.unit, it.qty]);
  }
  res.json({ id: sid, slip_no: slipNo, cutoff_warning: warning });
}));

app.post('/api/orders/:id/generate-handover', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const o = await dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  const docType = req.body.doc_type || (o.require_install ? 'BM-01' : 'BM-05');
  const existing = await dbGet(`SELECT doc_no FROM handovers WHERE invoice_no = ? AND doc_type = ? AND status != 'Cancelled'`, [o.invoice_no, docType]);
  if (existing && !req.body.allow_duplicate) {
    return res.status(409).json({ error: `Đơn ${o.invoice_no} đã có phiếu ${existing.doc_no}!` });
  }
  const docNo = await nextHandoverNo(docType);
  const ktvsJson = JSON.stringify(parseKtvs(o));
  const r = await dbRun(`
    INSERT INTO handovers (doc_no, doc_type, order_id, invoice_no, handover_date, warehouse_code, customer_name, customer_phone, address, carrier, install_mode, ktv1_name, ktv1_code, ktv2_name, ktv2_code, ktvs_json, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    docNo, docType, o.id, o.invoice_no, o.delivery_date || new Date().toISOString().slice(0, 10),
    o.source_warehouse || '9005', o.customer_name, o.customer_phone, o.address, o.carrier,
    req.body.install_mode || (docType === 'BM-01' ? 'Kỹ thuật Benom lắp đặt' : 'Khách hàng tự lắp đặt'),
    o.ktv1_name, o.ktv1_code, o.ktv2_name, o.ktv2_code, ktvsJson, 'Pending'
  ]);
  res.json({ id: r.lastInsertRowid, doc_no: docNo, doc_type: docType });
}));

// ─── 4. HANDOVERS (BM-01 / BM-05 Mobile + CSAT) ───────────────
app.get('/api/handovers', wrap(async (req, res) => {
  const list = await dbAll(`SELECT * FROM handovers ORDER BY id DESC LIMIT 100`);
  const allItems = await dbAll(`SELECT * FROM order_items`);
  const itemMap = new Map();
  for (const it of allItems) {
    const arr = itemMap.get(it.order_id) || [];
    arr.push(it);
    itemMap.set(it.order_id, arr);
  }
  res.json(list.map(h => ({ ...h, ktvs: parseKtvs(h), items: h.order_id ? (itemMap.get(h.order_id) || []) : [] })));
}));

app.put('/api/handovers/:id', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const h = await dbGet('SELECT * FROM handovers WHERE id = ?', [id]);
  if (!h) return res.status(404).json({ error: 'Không tìm thấy biên bản' });

  const newDate = b.handover_date || h.handover_date || '';
  const ktvNorm = normalizeKtvInput(b, h);
  const newInstallMode = b.install_mode ?? h.install_mode ?? '';
  const newStatus = b.status || h.status;

  await dbRun(`
    UPDATE handovers SET
      handover_date=?, ktv1_name=?, ktv1_code=?, ktv2_name=?, ktv2_code=?, ktvs_json=?,
      driver_name=?, driver_phone=?, vehicle_plate=?,
      install_mode=?, check_1=?, check_2=?, check_3=?, check_4=?, issue_note=?, due_date=?,
      signature_data=?, photos_json=?, csat_rating=?, csat_comment=?, status=?
    WHERE id=?
  `, [
    newDate, ktvNorm.ktv1_name, ktvNorm.ktv1_code, ktvNorm.ktv2_name, ktvNorm.ktv2_code, ktvNorm.json,
    b.driver_name ?? h.driver_name, b.driver_phone ?? h.driver_phone, b.vehicle_plate ?? h.vehicle_plate,
    newInstallMode,
    b.check_1 ? 1 : 0, b.check_2 ? 1 : 0, b.check_3 ? 1 : 0, b.check_4 ? 1 : 0,
    b.issue_note ?? h.issue_note, b.due_date ?? h.due_date,
    b.signature_data ?? h.signature_data, b.photos_json ?? h.photos_json,
    num(b.csat_rating), b.csat_comment ?? h.csat_comment, newStatus, id
  ]);

  // Resolve linked Order by order_id or fallback by invoice_no
  let targetOrderId = h.order_id;
  if (!targetOrderId && h.invoice_no) {
    const matchedOrder = await dbGet('SELECT id FROM orders WHERE invoice_no = ? ORDER BY id DESC LIMIT 1', [h.invoice_no]);
    if (matchedOrder) {
      targetOrderId = matchedOrder.id;
      await dbRun('UPDATE handovers SET order_id = ? WHERE id = ?', [targetOrderId, id]);
    }
  }

  // Always sync ALL KTVs (1..N), delivery_date & require_install back to the linked Order!
  if (targetOrderId) {
    const isBenomInstall = h.doc_type === 'BM-01' || /benom lắp/i.test(newInstallMode);
    await dbRun(`
      UPDATE orders SET
        ktv1_name = ?,
        ktv1_code = ?,
        ktv2_name = ?,
        ktv2_code = ?,
        ktvs_json = ?,
        delivery_date = CASE WHEN ? != '' THEN ? ELSE delivery_date END,
        require_install = CASE WHEN ? = 1 THEN 1 ELSE require_install END
      WHERE id = ?
    `, [
      ktvNorm.ktv1_name, ktvNorm.ktv1_code, ktvNorm.ktv2_name, ktvNorm.ktv2_code, ktvNorm.json,
      newDate, newDate, isBenomInstall ? 1 : 0, targetOrderId
    ]);

    if (newStatus === 'Completed') {
      if (h.doc_type === 'BM-01') {
        await dbRun(
          `UPDATE orders SET status='Done', install_status='Đã lắp & Nghiệm thu', delivery_date=COALESCE(NULLIF(?,''), NULLIF(delivery_date,''), ?) WHERE id=?`,
          [newDate, new Date().toISOString().slice(0, 10), targetOrderId]
        );
      } else if (h.doc_type === 'BM-05') {
        if (newInstallMode === 'Hẹn kỹ thuật Benom lắp sau') {
          const dup = await dbGet(`SELECT id FROM handovers WHERE invoice_no=? AND doc_type='BM-01'`, [h.invoice_no]);
          if (!dup) {
            const bm01No = await nextHandoverNo('BM-01');
            await dbRun(`
              INSERT INTO handovers (doc_no, doc_type, order_id, invoice_no, handover_date, warehouse_code, customer_name, customer_phone, address, carrier, install_mode, status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            `, [bm01No, 'BM-01', targetOrderId, h.invoice_no, '', h.warehouse_code, h.customer_name, h.customer_phone, h.address, h.carrier, 'Kỹ thuật Benom lắp đặt (tách từ BM-05)', 'Pending']);
          }
        } else {
          await dbRun(
            `UPDATE orders SET status='Done', delivery_date=COALESCE(NULLIF(?,''), NULLIF(delivery_date,''), ?) WHERE id=?`,
            [newDate, new Date().toISOString().slice(0, 10), targetOrderId]
          );
        }
      }
    }
  }
  res.json({ ok: true });
}));

// ─── 5. TECHNICIAN ALLOWANCE ENGINE (0% #REF!, SUPPORTS N KTVs) ──
async function computeAllowance(monthYm) {
  const orders = await dbAll(`
    SELECT * FROM orders
    WHERE require_install = 1
      AND (ktv1_name != '' OR ktv2_name != '' OR (ktvs_json IS NOT NULL AND ktvs_json != '' AND ktvs_json != '[]'))
      AND (? = '' OR COALESCE(NULLIF(delivery_date,''), order_date) LIKE ?)
    ORDER BY COALESCE(NULLIF(delivery_date,''), order_date) ASC, id ASC
  `, [monthYm, `${monthYm}%`]);

  const allItems = await dbAll(`SELECT * FROM order_items ORDER BY id ASC`);
  const itemMap = new Map();
  for (const it of allItems) {
    const arr = itemMap.get(it.order_id) || [];
    arr.push(it);
    itemMap.set(it.order_id, arr);
  }

  const lines = [];
  const ktvTotals = new Map();

  for (const o of orders) {
    const ktvs = parseKtvs(o);
    if (ktvs.length === 0) continue;
    const items = itemMap.get(o.id) || [];
    const kFloor = o.is_stairs ? 1.2 : 1.0;
    const pDistOrder = calcDistanceAllowance(o.distance_km);
    const dateStr = o.delivery_date || o.order_date;

    items.forEach((it, idx) => {
      const pHandling = (it.p_handling_unit || 0) * (it.qty || 1);
      const pInstall = (it.p_installation_unit || 0) * (it.qty || 1);
      const pDistLine = idx === 0 ? pDistOrder : 0;
      const totalLine = Math.round(pHandling * kFloor + pInstall + pDistLine);
      const sharePerKtv = totalLine / ktvs.length;

      lines.push({
        order_id: o.id, date: dateStr, invoice_no: o.invoice_no, customer_name: o.customer_name,
        barcode: it.barcode, product_name: it.product_name, qty: it.qty, distance_km: o.distance_km,
        is_stairs: o.is_stairs, k_floor: kFloor,
        ktv_count: ktvs.length,
        ktvs: ktvs.map(k => ({ ...k, pay: Math.round(sharePerKtv) })),
        ktv1: ktvs[0]?.name || '',
        ktv2: ktvs[1]?.name || '',
        p_handling: pHandling, p_installation: pInstall, p_distance: pDistLine,
        total: totalLine,
        share_per_ktv: Math.round(sharePerKtv),
        pay_ktv1: ktvs[0] ? Math.round(sharePerKtv) : 0,
        pay_ktv2: ktvs[1] ? Math.round(sharePerKtv) : 0,
      });

      for (const k of ktvs) {
        const key = k.name || k.code;
        const c = ktvTotals.get(key) || { code: k.code, name: k.name || k.code, orders: new Set(), total: 0 };
        if (k.code && !c.code) c.code = k.code;
        c.orders.add(o.invoice_no);
        c.total += sharePerKtv;
        ktvTotals.set(key, c);
      }
    });
  }

  const summary = Array.from(ktvTotals.values())
    .map(x => ({ ktv_code: x.code, ktv_name: x.name, order_count: x.orders.size, total_allowance: Math.round(x.total) }))
    .sort((a, b) => b.total_allowance - a.total_allowance);

  return {
    month: monthYm || 'ALL',
    grand_total: summary.reduce((s, x) => s + x.total_allowance, 0),
    summary,
    lines,
  };
}

app.get('/api/allowance', wrap(async (req, res) => {
  const month = (req.query.month ?? '2026-10').toString().trim();
  res.json(await computeAllowance(month));
}));

app.get('/api/allowance/export', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const month = (req.query.month ?? '2026-10').toString().trim();
  const data = await computeAllowance(month);
  const wb = XLSX.utils.book_new();
  const wsSum = XLSX.utils.json_to_sheet(data.summary.map(s => ({
    'Mã NV (ID)': s.ktv_code || '',
    'Kỹ Thuật Viên': s.ktv_name,
    'Số đơn hàng': s.order_count,
    'Tổng Phụ Cấp (VND)': s.total_allowance,
  })));
  const wsDet = XLSX.utils.json_to_sheet(data.lines.map(l => ({
    'Ngày': l.date, 'Mã hóa đơn': l.invoice_no, 'Khách hàng': l.customer_name,
    'Barcode': l.barcode, 'Sản phẩm': l.product_name, 'SL': l.qty, 'Km': l.distance_km,
    'K_Floor': l.k_floor, 'P_Handling': l.p_handling, 'P_Installation': l.p_installation,
    'P_Distance': l.p_distance, 'Tổng Dòng': l.total,
    'Số KTV': l.ktv_count,
    'Thù lao mỗi KTV': l.share_per_ktv,
    'Danh sách KTV (ID - Tên)': (l.ktvs || []).map(k => k.code ? `${k.code} - ${k.name}` : k.name).join('; '),
  })));
  XLSX.utils.book_append_sheet(wb, wsSum, 'Tong_Hop_KTV');
  XLSX.utils.book_append_sheet(wb, wsDet, 'Chi_Tiet_Phu_Cap');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="Benom_Phu_Cap_KTV_${month || 'ALL'}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}));

// ─── 6. WAREHOUSE SLIPS (NK / XK) & CUT-OFF CHECK ─────────────
app.get('/api/slips', wrap(async (req, res) => {
  const type = (req.query.type || '').trim();
  let sql = `SELECT * FROM warehouse_slips WHERE 1=1`;
  const params = [];
  if (type) { sql += ` AND slip_type = ?`; params.push(type); }
  sql += ` ORDER BY slip_date DESC, id DESC LIMIT 150`;
  const slips = await dbAll(sql, params);
  const allItems = await dbAll(`SELECT * FROM warehouse_slip_items`);
  const itemMap = new Map();
  for (const it of allItems) {
    const arr = itemMap.get(it.slip_id) || [];
    arr.push(it);
    itemMap.set(it.slip_id, arr);
  }
  res.json(slips.map(s => ({ ...s, items: itemMap.get(s.id) || [] })));
}));

app.post('/api/slips', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const slipType = b.slip_type === 'NK' ? 'NK' : 'XK';
  const slipNo = await nextSlipNo(slipType);
  const warning = evaluateToanNhatCutoff(b.expected_date, b.expected_time);
  const r = await dbRun(`
    INSERT INTO warehouse_slips (slip_no, slip_type, slip_date, expected_date, expected_time, created_by, partner_code, partner_name, carrier, warehouse_code, purpose, ref_invoice, ref_po, status, cutoff_warning, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    slipNo, slipType, b.slip_date || new Date().toISOString().slice(0, 10),
    b.expected_date || '', b.expected_time || '', req.user.full_name || b.created_by || 'Trần Anh Tuyến',
    b.partner_code || '', b.partner_name || 'Toàn Nhất Logistics', b.carrier || '',
    b.warehouse_code || '9005', b.purpose || (slipType === 'NK' ? 'Nhập PO NCC' : 'Giao khách'),
    b.ref_invoice || '', b.ref_po || '', b.status || 'Sent', warning, b.notes || ''
  ]);
  const sid = r.lastInsertRowid;
  for (const it of (b.items || [])) {
    const p = await dbGet('SELECT name_vn FROM products WHERE barcode = ?', [it.barcode || '']);
    await dbRun(
      `INSERT INTO warehouse_slip_items (slip_id, barcode, product_name, unit, qty, actual_qty, note) VALUES (?,?,?,?,?,?,?)`,
      [sid, it.barcode || '', it.product_name || p?.name_vn || '', it.unit || 'Thùng', num(it.qty) || 1, null, it.note || '']
    );
  }
  res.json({ id: sid, slip_no: slipNo, cutoff_warning: warning });
}));

app.put('/api/slips/:id/status', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const { id } = req.params;
  const { status, cancel_reason } = req.body;
  const slip = await dbGet('SELECT * FROM warehouse_slips WHERE id = ?', [id]);
  if (!slip) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
  let warning = slip.cutoff_warning || '';
  if (status === 'Cancelled') {
    warning = (warning ? warning + ' | ' : '') + 'Lưu ý Đ5.3: Hủy lệnh trễ < 2h trước giờ hẹn bị tính 50% phí xếp dỡ.';
  }
  await dbRun(
    `UPDATE warehouse_slips SET status=?, cutoff_warning=?, notes=CASE WHEN ? != '' THEN notes || ' [Hủy: ' || ? || ']' ELSE notes END WHERE id=?`,
    [status, warning, cancel_reason || '', cancel_reason || '', id]
  );
  res.json({ ok: true, cutoff_warning: warning });
}));

// ─── 7. ERP CSV UPLOAD & TOÀN NHẤT 3-WAY RECONCILIATION ───────
app.post('/api/erp/upload', requireRoles('ADMIN'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file CSV' });
  const raw = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return res.status(400).json({ error: 'File CSV trống' });
  const headers = fastCsvLine(lines[0]);
  const idx = {};
  headers.forEach((h, i) => { idx[h.trim()] = i; });
  if (idx['Barcode'] === undefined || idx['Close Qty'] === undefined) {
    return res.status(400).json({ error: 'File không đúng chuẩn 69 cột ERP Kohnan (thiếu Barcode / Close Qty)' });
  }

  let detectedMonth = '';
  let detectedStore = '';
  const rowsToInsert = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const r = fastCsvLine(line);
    if (r.length < 25) continue;
    const oq = num(r[idx['Open Qty']]), iq = num(r[idx['Income Qty']]), sq = num(r[idx['Sales Qty']]),
          sa = num(r[idx['Sales Amt']]), cq = num(r[idx['Close Qty']]), mq = num(r[idx['Movement Qty']]);
    if (oq === 0 && iq === 0 && sq === 0 && sa === 0 && cq === 0 && mq === 0) continue;
    detectedMonth = detectedMonth || (r[idx['Target Month']] || '').trim();
    detectedStore = detectedStore || (r[idx['Store Code']] || '').trim();
    rowsToInsert.push([
      (r[idx['Target Month']] || detectedMonth).trim(),
      (r[idx['Store Code']] || detectedStore).trim(),
      (r[idx['Barcode']] || '').trim(),
      (r[idx['Product Name']] || '').trim(),
      (r[idx['Supplier Code']] || '').trim(),
      oq, iq, sq, sa, num(r[idx['COGS']]), mq, num(r[idx['Return Qty']]),
      num(r[idx['Adj Qty']]), cq, num(r[idx['Close Cst']]), num(r[idx['Loss Qty']]),
    ]);
  }

  if (detectedMonth && detectedStore) {
    await dbRun(`DELETE FROM erp_snapshots WHERE target_month = ? AND store_code = ?`, [detectedMonth, detectedStore]);
    const insertSql = `INSERT INTO erp_snapshots (target_month,store_code,barcode,product_name,supplier_code,open_qty,income_qty,sales_qty,sales_amt,cogs,movement_qty,return_qty,adj_qty,close_qty,close_cst,loss_qty) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    // Batch in chunks of 100 for fast Turso cloud writes
    for (let i = 0; i < rowsToInsert.length; i += 100) {
      const chunk = rowsToInsert.slice(i, i + 100).map(args => ({ sql: insertSql, args }));
      await dbBatch(chunk);
    }
  }
  res.json({ ok: true, target_month: detectedMonth, store_code: detectedStore, imported_skus: rowsToInsert.length, total_raw_lines: lines.length - 1 });
}));

app.post('/api/toannhat/reconcile', requireRoles('ADMIN', 'EDITOR'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file Excel Toàn Nhất' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const tonSheetName = wb.SheetNames.find(n => {
    const norm = n.normalize('NFC').toLowerCase();
    return norm.includes('tồn') || norm.includes('ton');
  }) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[tonSheetName], { header: 1, defval: '' });

  const hIdx = rows.findIndex(r => r.some(c => {
    const s = String(c).normalize('NFC').trim().toLowerCase();
    return s.includes('mã vật tư') || s.includes('mã hàng') || s === 'barcode';
  }));
  if (hIdx < 0) return res.status(400).json({ error: `Không tìm thấy cột 'Mã vật tư' trong sheet '${tonSheetName}'` });

  const header = rows[hIdx].map(c => String(c).normalize('NFC').trim().toLowerCase());
  const colBc = header.findIndex(h => h.includes('mã vật tư') || h.includes('mã hàng') || h === 'barcode');
  const colName = header.findIndex(h => h.includes('tên vật tư') || h.includes('tên hàng') || h.includes('product'));
  let colClose = header.findIndex(h => h.includes('tồn cuối') && h.includes('sl'));
  if (colClose < 0) colClose = header.findIndex(h => h.includes('cuối kỳ') || h.includes('tồn cuối'));
  if (colClose < 0) colClose = 17;

  const tnMap = new Map();
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const rawCode = String(r[colBc] || '').trim();
    if (!rawCode) continue;
    const isDamaged = /^(BD02|MOP)-\s*R\b/i.test(rawCode) || /^BD02-\s*R\s/i.test(rawCode);
    const bc = rawCode.replace(/^(BD02|MOP)-\s*(?:R\s*)?/i, '').trim();
    if (!bc || bc.toLowerCase().includes('tổng')) continue;
    const qty = num(r[colClose]);
    const cur = tnMap.get(bc) || { barcode: bc, name: String(r[colName] || '').trim(), tn_qty: 0, damaged_qty: 0 };
    if (isDamaged) cur.damaged_qty += qty;
    else cur.tn_qty += qty;
    tnMap.set(bc, cur);
  }

  const latest9005 = (await dbGet(`SELECT MAX(target_month) as m FROM erp_snapshots WHERE store_code = '9005'`))?.m || '202611';
  const erpRows = await dbAll(`SELECT barcode, product_name, close_qty FROM erp_snapshots WHERE store_code = '9005' AND target_month = ? AND close_qty != 0`, [latest9005]);
  const erpMap = new Map(erpRows.map(r => [r.barcode, r]));

  const allBcs = new Set([...tnMap.keys(), ...erpMap.keys()]);
  const comparison = [];
  let matched = 0, mismatched = 0;

  for (const bc of allBcs) {
    const tn = tnMap.get(bc);
    const erp = erpMap.get(bc);
    const tnQty = (tn?.tn_qty || 0) + (tn?.damaged_qty || 0);
    const erpQty = erp?.close_qty || 0;
    const diff = tnQty - erpQty;
    if (diff === 0) matched++;
    else mismatched++;
    comparison.push({
      barcode: bc,
      product_name: erp?.product_name || tn?.name || bc,
      erp_9005_qty: erpQty,
      toannhat_good_qty: tn?.tn_qty || 0,
      toannhat_damaged_qty: tn?.damaged_qty || 0,
      toannhat_total_qty: tnQty,
      diff,
      status: diff === 0 ? 'Khớp' : (diff > 0 ? 'Toàn Nhất dư' : 'ERP 9005 dư'),
    });
  }

  comparison.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  res.json({ sheet_used: tonSheetName, erp_month: latest9005, total_skus: comparison.length, matched, mismatched, comparison });
}));

// ─── 8. WARRANTY (BM-02/03/04), QC RETURNS & SUPPORT LOGS ─────
app.get('/api/warranty/lookup', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const rows = await dbAll(`
    SELECT o.invoice_no, o.customer_name, o.customer_phone, o.address,
           COALESCE(NULLIF(o.delivery_date,''), o.order_date) as handover_date,
           oi.barcode, oi.product_name, oi.warranty_months, oi.warranty_policy
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_phone LIKE ? OR o.invoice_no LIKE ? OR o.customer_name LIKE ?
    ORDER BY o.order_date DESC LIMIT 30
  `, [`%${q}%`, `%${q}%`, `%${q}%`]);

  const now = new Date();
  res.json(rows.map(r => {
    let daysLeft = 0;
    let status = 'Không bảo hành';
    if (r.warranty_months > 0 && r.handover_date) {
      const start = new Date(r.handover_date + 'T00:00:00');
      const exp = new Date(start);
      exp.setMonth(exp.getMonth() + r.warranty_months);
      daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      status = daysLeft >= 0 ? 'Còn bảo hành' : 'Hết hạn bảo hành';
    }
    return { ...r, days_left: daysLeft, warranty_status: status };
  }));
}));

app.get('/api/warranty', wrap(async (req, res) => {
  res.json(await dbAll('SELECT * FROM warranty_tickets ORDER BY id DESC'));
}));

app.post('/api/warranty', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const ticketNo = await nextTicketNo();
  const now = new Date();
  const addHrs = h => new Date(now.getTime() + h * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const lvl = b.service_level || 'C1';
  const resolveHrs = lvl === 'C3' ? 240 : 48;

  const r = await dbRun(`
    INSERT INTO warranty_tickets (
      ticket_no, invoice_no, handover_no, customer_name, customer_phone, address,
      barcode, product_name, channel, issue_desc, service_level, is_in_warranty,
      fee_service, fee_parts, fee_ship, ktv_assigned, status,
      sla_respond_at, sla_assess_at, sla_resolve_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    ticketNo, b.invoice_no || '', b.handover_no || '', b.customer_name || '', b.customer_phone || '',
    b.address || '', b.barcode || '', b.product_name || '', b.channel || 'Zalo OA',
    b.issue_desc || '', lvl, b.is_in_warranty ? 1 : 0,
    b.is_in_warranty ? 0 : (num(b.fee_service) || 100000), num(b.fee_parts), num(b.fee_ship),
    b.ktv_assigned || 'Trần Anh Tuyến', 'New',
    addHrs(2), addHrs(24), addHrs(resolveHrs)
  ]);
  res.json({ id: r.lastInsertRowid, ticket_no: ticketNo });
}));

app.put('/api/warranty/:id', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  await dbRun(`UPDATE warranty_tickets SET status=?, service_level=?, ktv_assigned=?, resolution_note=?, bm03_no=?, bm04_no=? WHERE id=?`,
    [b.status, b.service_level, b.ktv_assigned || '', b.resolution_note || '', b.bm03_no || '', b.bm04_no || '', req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/qc-returns', wrap(async (req, res) => {
  res.json(await dbAll('SELECT * FROM qc_factory_returns ORDER BY id DESC'));
}));

app.post('/api/qc-returns', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const r = await dbRun(`
    INSERT INTO qc_factory_returns (supplier_name, barcode, product_name, issue, defective_qty, sold_qty, stock_qty, defect_rate, action, est_out, est_in, ref_xk_no, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    b.supplier_name, b.barcode || '', b.product_name, b.issue || '', num(b.defective_qty),
    num(b.sold_qty), num(b.stock_qty), num(b.defect_rate), b.action || 'Back to factory',
    b.est_out || 'TBU', b.est_in || 'TBU', b.ref_xk_no || '', b.status || 'Open'
  ]);
  res.json({ id: r.lastInsertRowid, ok: true });
}));

app.put('/api/qc-returns/:id', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  await dbRun(`UPDATE qc_factory_returns SET status=?, est_out=?, est_in=?, ref_xk_no=?, ref_nk_no=? WHERE id=?`,
    [b.status, b.est_out || '', b.est_in || '', b.ref_xk_no || '', b.ref_nk_no || '', req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/support-logs', wrap(async (req, res) => {
  res.json(await dbAll('SELECT * FROM support_logs ORDER BY log_date DESC, id DESC'));
}));

app.post('/api/support-logs', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const r = await dbRun(`INSERT INTO support_logs (log_date, staff_name, category, location, hours, notes) VALUES (?,?,?,?,?,?)`,
    [b.log_date || new Date().toISOString().slice(0, 10), b.staff_name || req.user.full_name, b.category, b.location || '', num(b.hours), b.notes || '']);
  res.json({ id: r.lastInsertRowid, ok: true });
}));

// ─── 9. 3PL DELIVERY TRACKING FROM POS TRANSACTION_DETAIL ─────
function parseSalesDayToIso(rawDay) {
  const s = String(rawDay || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function parseTransactionDetailCsv(rawText) {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length < 2) throw new Error('File transaction_detail CSV trống');
  const headers = fastCsvLine(lines[0]).map(h => h.trim());
  const iSlip = headers.indexOf('Slip No.');
  const iDay = headers.indexOf('Sales Day');
  const iStore = headers.indexOf('Store');
  const iDiv = headers.indexOf('Slip Div');
  const iL1 = headers.indexOf('Layer1');
  const iName = headers.indexOf('Item Name');
  const iQty = headers.indexOf('QTY');
  const iExcl = headers.indexOf('Amount(Tax excl.)');
  const iIncl = headers.indexOf('Amount(Tax incl.)');
  if (iSlip < 0 || iExcl < 0 || iIncl < 0) {
    throw new Error('File không đúng chuẩn transaction_detail ERP Kohnan (thiếu Slip No. / Amount)');
  }

  const slipMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = fastCsvLine(line);
    const slipNo = (cols[iSlip] || '').trim();
    const div = (cols[iDiv] || '').trim();
    if (!slipNo || div === 'Delete') continue;

    const isoDay = parseSalesDayToIso(cols[iDay]);
    const month = isoDay ? isoDay.slice(0, 7) : '';
    const store = (cols[iStore] || '3001').trim();
    const l1 = (cols[iL1] || '').trim();
    const name = (cols[iName] || '').trim();
    const qty = num(cols[iQty]);
    const amtExcl = num(cols[iExcl]);
    const amtIncl = num(cols[iIncl]);

    let cur = slipMap.get(slipNo);
    if (!cur) {
      cur = {
        slip_no: slipNo,
        sales_month: month,
        sales_day: isoDay,
        store_code: store,
        delivery_cust_pay: 0,
        install_cust_pay: 0,
        net_sales_excl_tax: 0,
        gross_sales_incl_tax: 0,
        has_furniture: 0,
        items: [],
      };
      slipMap.set(slipNo, cur);
    }

    cur.net_sales_excl_tax += amtExcl;
    cur.gross_sales_incl_tax += amtIncl;
    if (l1 === 'FURNITURE/STORAGE') cur.has_furniture = 1;

    if (l1 === 'SERVICES') {
      if (/phí vận chuyển|vận chuyển|giao hàng/i.test(name)) {
        cur.delivery_cust_pay += amtIncl;
      } else if (/phí lắp đặt|lắp đặt/i.test(name)) {
        cur.install_cust_pay += amtIncl;
      }
    } else if (name && qty !== 0) {
      cur.items.push(`${name} (x${qty})`);
    }
  }

  return Array.from(slipMap.values()).map(s => ({
    ...s,
    items_summary: s.items.slice(0, 4).join(', ') + (s.items.length > 4 ? ` (+${s.items.length - 4})` : ''),
  }));
}

async function buildDeliveryReport(monthFilter) {
  const monthsRows = await dbAll(`SELECT DISTINCT sales_month FROM delivery_tracking WHERE sales_month != '' ORDER BY sales_month DESC`);
  const available_months = monthsRows.map(r => r.sales_month);

  const effectiveMonth =
    !monthFilter || monthFilter === 'LATEST'
      ? (available_months[0] || new Date().toISOString().slice(0, 7))
      : monthFilter;

  let rows;
  if (effectiveMonth && effectiveMonth !== 'ALL') {
    rows = await dbAll(`SELECT * FROM delivery_tracking WHERE sales_month = ? ORDER BY sales_day DESC, slip_no DESC`, [effectiveMonth]);
  } else {
    rows = await dbAll(`SELECT * FROM delivery_tracking ORDER BY sales_month DESC, sales_day DESC, slip_no DESC`);
  }

  const pivotMap = new Map();
  let gCount = 0, gFee = 0, gDel = 0, gInst = 0, gSales = 0;

  for (const r of rows) {
    const key = (r.carrier_3pl || '').trim() || 'Chưa phân bổ 3PL';
    const p = pivotMap.get(key) || {
      carrier_3pl: key,
      slip_count: 0,
      sum_fee: 0,
      sum_delivery_cust: 0,
      sum_install_cust: 0,
      sum_net_sales: 0,
    };
    p.slip_count += 1;
    p.sum_fee += num(r.fee_3pl);
    p.sum_delivery_cust += num(r.delivery_cust_pay);
    p.sum_install_cust += num(r.install_cust_pay);
    p.sum_net_sales += num(r.net_sales_excl_tax);
    pivotMap.set(key, p);

    gCount += 1;
    gFee += num(r.fee_3pl);
    gDel += num(r.delivery_cust_pay);
    gInst += num(r.install_cust_pay);
    gSales += num(r.net_sales_excl_tax);
  }

  const pivot = Array.from(pivotMap.values())
    .sort((a, b) => b.sum_fee - a.sum_fee || b.slip_count - a.slip_count)
    .map(p => ({
      ...p,
      fee_to_sales_pct: p.sum_net_sales > 0 ? Number(((p.sum_fee / p.sum_net_sales) * 100).toFixed(2)) : 0,
      net_ship_gap: p.sum_delivery_cust - p.sum_fee,
    }));

  const grand_total = {
    slip_count: gCount,
    sum_fee: gFee,
    sum_delivery_cust: gDel,
    sum_install_cust: gInst,
    sum_net_sales: gSales,
    fee_to_sales_pct: gSales > 0 ? Number(((gFee / gSales) * 100).toFixed(2)) : 0,
    net_ship_gap: gDel - gFee,
  };

  return { month: effectiveMonth, available_months, pivot, grand_total, rows };
}

app.get('/api/delivery-tracking', wrap(async (req, res) => {
  const month = String(req.query.month || 'LATEST').trim();
  res.json(await buildDeliveryReport(month));
}));

app.get('/api/delivery-tracking/lookup-pos', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const rows = await dbAll(
    `SELECT * FROM pos_slips WHERE slip_no LIKE ? OR items_summary LIKE ? ORDER BY sales_day DESC LIMIT 20`,
    [`%${q}%`, `%${q}%`]
  );
  res.json(rows);
}));

app.post('/api/delivery-tracking/upload-pos', requireRoles('ADMIN', 'EDITOR'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file transaction_detail CSV' });
  const slips = parseTransactionDetailCsv(req.file.buffer.toString('utf8'));
  const monthsFound = new Set();
  const posSql = `INSERT OR REPLACE INTO pos_slips (slip_no,sales_month,sales_day,store_code,delivery_cust_pay,install_cust_pay,net_sales_excl_tax,gross_sales_incl_tax,has_furniture,items_summary) VALUES (?,?,?,?,?,?,?,?,?,?)`;

  for (let i = 0; i < slips.length; i += 100) {
    const chunk = slips.slice(i, i + 100).map(s => {
      if (s.sales_month) monthsFound.add(s.sales_month);
      return {
        sql: posSql,
        args: [s.slip_no, s.sales_month, s.sales_day, s.store_code, s.delivery_cust_pay, s.install_cust_pay, s.net_sales_excl_tax, s.gross_sales_incl_tax, s.has_furniture, s.items_summary],
      };
    });
    await dbBatch(chunk);
  }

  // Upsert slips that have delivery or installation customer payment into delivery_tracking (preserving manual 3PL/Fee/Area/Note!)
  const deliverySlips = slips.filter(s => s.delivery_cust_pay !== 0 || s.install_cust_pay !== 0);
  const trackSql = `
    INSERT INTO delivery_tracking (slip_no,sales_month,sales_day,store_code,delivery_cust_pay,install_cust_pay,net_sales_excl_tax,items_summary)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(slip_no) DO UPDATE SET
      sales_month=excluded.sales_month,
      sales_day=excluded.sales_day,
      delivery_cust_pay=excluded.delivery_cust_pay,
      install_cust_pay=excluded.install_cust_pay,
      net_sales_excl_tax=excluded.net_sales_excl_tax,
      items_summary=excluded.items_summary,
      updated_at=datetime('now', '+7 hours')
  `;
  for (let i = 0; i < deliverySlips.length; i += 100) {
    const chunk = deliverySlips.slice(i, i + 100).map(s => ({
      sql: trackSql,
      args: [s.slip_no, s.sales_month, s.sales_day, s.store_code, s.delivery_cust_pay, s.install_cust_pay, s.net_sales_excl_tax, s.items_summary],
    }));
    await dbBatch(chunk);
  }

  res.json({
    ok: true,
    months: Array.from(monthsFound).sort(),
    total_pos_slips: slips.length,
    auto_tracked_delivery_slips: deliverySlips.length,
  });
}));

app.post('/api/delivery-tracking', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const slipNo = String(b.slip_no || '').trim();
  if (!slipNo) return res.status(400).json({ error: 'Vui lòng nhập Số hóa đơn (No Slip.)' });

  const pos = await dbGet(`SELECT * FROM pos_slips WHERE slip_no = ?`, [slipNo]);
  const salesMonth = b.sales_month || pos?.sales_month || new Date().toISOString().slice(0, 7);
  const salesDay = b.sales_day || pos?.sales_day || new Date().toISOString().slice(0, 10);

  await dbRun(`
    INSERT INTO delivery_tracking (slip_no,sales_month,sales_day,store_code,delivery_cust_pay,install_cust_pay,fee_3pl,net_sales_excl_tax,carrier_3pl,area,note,items_summary)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(slip_no) DO UPDATE SET
      carrier_3pl=excluded.carrier_3pl,
      fee_3pl=excluded.fee_3pl,
      area=excluded.area,
      note=excluded.note,
      updated_at=datetime('now', '+7 hours')
  `, [
    slipNo,
    salesMonth,
    salesDay,
    b.store_code || pos?.store_code || '3001',
    b.delivery_cust_pay !== undefined ? num(b.delivery_cust_pay) : (pos?.delivery_cust_pay || 0),
    b.install_cust_pay !== undefined ? num(b.install_cust_pay) : (pos?.install_cust_pay || 0),
    num(b.fee_3pl),
    b.net_sales_excl_tax !== undefined ? num(b.net_sales_excl_tax) : (pos?.net_sales_excl_tax || 0),
    b.carrier_3pl || '',
    b.area || 'HCM',
    b.note || '',
    pos?.items_summary || b.items_summary || '',
  ]);
  res.json({ ok: true, matched_pos: Boolean(pos) });
}));

app.put('/api/delivery-tracking/:slipNo', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const slipNo = req.params.slipNo;
  const b = req.body;
  await dbRun(`
    UPDATE delivery_tracking SET
      carrier_3pl=?, fee_3pl=?, area=?, note=?,
      delivery_cust_pay=COALESCE(?, delivery_cust_pay),
      install_cust_pay=COALESCE(?, install_cust_pay),
      net_sales_excl_tax=COALESCE(?, net_sales_excl_tax),
      updated_at=datetime('now', '+7 hours')
    WHERE slip_no=?
  `, [
    b.carrier_3pl ?? '',
    num(b.fee_3pl),
    b.area ?? 'HCM',
    b.note ?? '',
    b.delivery_cust_pay !== undefined ? num(b.delivery_cust_pay) : null,
    b.install_cust_pay !== undefined ? num(b.install_cust_pay) : null,
    b.net_sales_excl_tax !== undefined ? num(b.net_sales_excl_tax) : null,
    slipNo,
  ]);
  res.json({ ok: true });
}));

app.delete('/api/delivery-tracking/:slipNo', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  await dbRun(`DELETE FROM delivery_tracking WHERE slip_no = ?`, [req.params.slipNo]);
  res.json({ ok: true });
}));

app.get('/api/delivery-tracking/export', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const month = String(req.query.month || 'LATEST').trim();
  const report = await buildDeliveryReport(month);
  const wb = XLSX.utils.book_new();
  const wsPivot = XLSX.utils.json_to_sheet([
    ...report.pivot.map(p => ({
      '3PL': p.carrier_3pl,
      'COUNTA of No Slip.': p.slip_count,
      'SUM of Fee': p.sum_fee,
      'SUM of Delivery Customer Payment': p.sum_delivery_cust,
      'SUM of Installation Customer Payment': p.sum_install_cust,
      'SUM of Net Sales (Tax excl.)': p.sum_net_sales,
      'Fee / Net Sales (%)': p.fee_to_sales_pct,
    })),
    {
      '3PL': 'Grand Total',
      'COUNTA of No Slip.': report.grand_total.slip_count,
      'SUM of Fee': report.grand_total.sum_fee,
      'SUM of Delivery Customer Payment': report.grand_total.sum_delivery_cust,
      'SUM of Installation Customer Payment': report.grand_total.sum_install_cust,
      'SUM of Net Sales (Tax excl.)': report.grand_total.sum_net_sales,
      'Fee / Net Sales (%)': report.grand_total.fee_to_sales_pct,
    },
  ]);
  const wsDet = XLSX.utils.json_to_sheet(report.rows.map(r => ({
    'No Slip.': r.slip_no,
    'Sales Day': r.sales_day,
    'Delivery Customer Payment': r.delivery_cust_pay,
    'Installation Customer Payment': r.install_cust_pay,
    'Fee': r.fee_3pl,
    'Net Sales (Tax excl.)': r.net_sales_excl_tax,
    '3PL': r.carrier_3pl,
    'Area': r.area,
    'Note': r.note,
    'Items': r.items_summary,
  })));
  XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot_3PL');
  XLSX.utils.book_append_sheet(wb, wsDet, 'Chi_Tiet_Giao_Hang');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="Benom_3PL_Delivery_Report_${month}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}));

// Global API error handler
app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  res.status(500).json({ error: err.message || 'Lỗi hệ thống nội bộ' });
});

// Serve built frontend in production
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    }
  });
}

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  benom Operations Hub (${isCloudDb() ? 'Turso Cloud' : 'Local SQLite'}) running at http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
