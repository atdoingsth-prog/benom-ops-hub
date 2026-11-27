import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { initDb, dbAll, dbGet, dbRun, dbBatch, isCloudDb } from './db.mjs';
import {
  hashPassword, verifyPassword, signToken, requireAuth, requireRoles,
  setAuthUserLoader, invalidateAuthCache
} from './auth.mjs';
import { isMailerConfigured, sendInviteEmail } from './mailer.mjs';

setAuthUserLoader(id =>
  dbGet('SELECT id, email, full_name, role, department, active, password_hash FROM users WHERE id = ?', [id])
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = process.env.PORT || 3005;

const app = express();
app.disable('x-powered-by');
app.use(cors({ exposedHeaders: ['X-Total-Count', 'Content-Disposition'] }));
app.use(express.json({ limit: '15mb' }));

// Zero-dependency Gzip compression for JSON API payloads >= 1 KB (cuts mobile 4G wire size 75-85%)
app.use((req, res, next) => {
  const acceptsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
  if (!acceptsGzip) return next();
  const origJson = res.json.bind(res);
  res.json = (body) => {
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    if (raw.length < 1024) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(raw);
    }
    const gz = zlib.gzipSync(raw, { level: 6 });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', String(gz.length));
    return res.end(gz);
  };
  next();
});

// Lightweight server-side TTL cache for read-heavy analytics, auto-cleared on any write mutation
const _serverCache = new Map();
function getServerCache(key) {
  const hit = _serverCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  if (hit) _serverCache.delete(key);
  return undefined;
}
function setServerCache(key, val, ttlMs = 45000) {
  _serverCache.set(key, { exp: Date.now() + ttlMs, val });
  return val;
}
function clearServerCache() {
  _serverCache.clear();
}
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 400) clearServerCache();
    });
  }
  next();
});

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

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function getVnShiftedDate(baseMs = Date.now()) {
  return new Date(baseMs + VN_OFFSET_MS);
}

function getVnIsoDate(offsetDays = 0) {
  const d = getVnShiftedDate(Date.now() + offsetDays * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getVnYearMonth() {
  return getVnIsoDate().slice(0, 7);
}

function getVnDateTime(offsetHours = 0) {
  const d = getVnShiftedDate(Date.now() + offsetHours * 3600000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function getIsoDateDow(isoDateStr) {
  const m = String(isoDateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

function evaluateToanNhatCutoff(expectedDate, expectedTime) {
  const warnings = [];
  const vnNow = getVnShiftedDate();
  const hourNow = vnNow.getUTCHours();
  const todayIso = getVnIsoDate();
  const parsedHour = expectedTime
    ? parseInt(String(expectedTime).replace(/[^\d]/g, '').slice(0, 2), 10)
    : NaN;

  if (expectedDate) {
    const dow = getIsoDateDow(expectedDate);
    if (dow === 0) warnings.push('Chủ nhật: phụ phí xếp dỡ 200%–250% + 100.000đ/giờ giám sát (PLHĐ 01).');
    if (dow === 6 && !Number.isNaN(parsedHour) && parsedHour >= 13) {
      warnings.push('Chiều Thứ 7: phụ phí xếp dỡ 150%–200% + 100.000đ/giờ giám sát.');
    }
    if (expectedDate === todayIso) {
      warnings.push('Đơn gấp trong ngày (< 4 giờ): Hợp đồng 019-2026 tính phí bốc xếp 200%.');
    } else if (expectedDate > todayIso) {
      const tomorrowIso = getVnIsoDate(1);
      if (expectedDate === tomorrowIso && hourNow >= 16 && hourNow < 18) {
        warnings.push('Gửi lệnh 16h00–18h00 (GMT+7): Toàn Nhất giao chiều ngày N+1 (Đ5.2).');
      } else if (expectedDate === tomorrowIso && hourNow >= 18) {
        warnings.push('Gửi sau 18h00 (GMT+7): tính sang chu kỳ ngày làm việc kế tiếp.');
      }
    }
  }
  if (!Number.isNaN(parsedHour) && parsedHour >= 17) {
    warnings.push('Ngoài giờ 17h–21h: phí 150% + 100.000đ/giờ giám sát.');
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
  const year = getVnShiftedDate().getUTCFullYear();
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
  const now = getVnShiftedDate();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(now.getUTCFullYear()).slice(-2);
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
  const now = getVnShiftedDate();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const prefix = `TK-${mm}${yy}-`;
  const rows = await dbAll(`SELECT ticket_no FROM warranty_tickets WHERE ticket_no LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.ticket_no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function nextBm03No() {
  const now = getVnShiftedDate();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const prefix = `BBTH-${mm}${yy}-`;
  const rows = await dbAll(`SELECT doc_no FROM bm03_inspections WHERE doc_no LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.doc_no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function nextBm04No() {
  const now = getVnShiftedDate();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const prefix = `SC-${mm}${yy}-`;
  const rows = await dbAll(`SELECT doc_no FROM bm04_incidents WHERE doc_no LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.doc_no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function logAudit(req, action, entityType, entityId, summary, beforeObj = null, afterObj = null) {
  try {
    const u = req?.user || {};
    await dbRun(
      `INSERT INTO audit_logs (created_at, user_id, user_email, user_name, user_role, action, entity_type, entity_id, summary, before_json, after_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        getVnDateTime(),
        u.id || null,
        u.email || '',
        u.full_name || 'System',
        u.role || '',
        action,
        entityType,
        String(entityId || ''),
        String(summary || ''),
        beforeObj ? JSON.stringify(beforeObj).slice(0, 2000) : '',
        afterObj ? JSON.stringify(afterObj).slice(0, 2000) : '',
      ]
    );
  } catch (err) {
    console.warn('[Audit] Failed to write audit log:', err.message);
  }
}

async function getLockedAllowanceMonth(dateStr) {
  const ym = String(dateStr || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  return dbGet('SELECT * FROM allowance_locks WHERE month_ym = ?', [ym]);
}

async function calcWarehouse9005Footprint(includeItems = false, latestByStoreMap = null) {
  let latestMap = latestByStoreMap;
  if (!latestMap) {
    const rowsM = await dbAll(`SELECT store_code, MAX(target_month) as m FROM erp_snapshots WHERE store_code IN ('9005','3001','1001') GROUP BY store_code`);
    latestMap = new Map(rowsM.map(r => [r.store_code, r.m]));
  }
  const latest = latestMap.get('9005') || '202611';
  const latest3001 = latestMap.get('3001') || '202611';
  const latest1001 = latestMap.get('1001') || '';

  const rows = await dbAll(includeItems ? `
    SELECT e.barcode, e.product_name, e.supplier_code, e.close_qty, e.close_cst,
           p.supplier_name, p.category, p.product_family, p.unit,
           p.box_w_cm, p.box_d_cm, p.box_h_cm, p.qty_per_pcs, p.qty_per_box, p.max_stack,
           COALESCE(s3.close_qty, 0) as stock_3001,
           COALESCE(s1.close_qty, 0) as stock_1001
    FROM erp_snapshots e
    LEFT JOIN products p ON p.barcode = e.barcode
    LEFT JOIN erp_snapshots s3 ON s3.barcode = e.barcode AND s3.store_code = '3001' AND s3.target_month = ?
    LEFT JOIN erp_snapshots s1 ON s1.barcode = e.barcode AND s1.store_code = '1001' AND s1.target_month = ?
    WHERE e.store_code = '9005' AND e.target_month = ? AND e.close_qty > 0
  ` : `
    SELECT e.barcode, e.supplier_code, e.close_qty, e.close_cst,
           p.supplier_name, p.box_w_cm, p.box_d_cm, p.qty_per_pcs, p.qty_per_box, p.max_stack
    FROM erp_snapshots e
    LEFT JOIN products p ON p.barcode = e.barcode
    WHERE e.store_code = '9005' AND e.target_month = ? AND e.close_qty > 0
  `, includeItems ? [latest3001, latest1001, latest] : [latest]);

  let totalArea = 0;
  let totalQty = 0;
  let totalCost = 0;
  const bySupplier = new Map();
  const items = [];

  for (const r of rows) {
    const w = r.box_w_cm || 0;
    const d = r.box_d_cm || 0;
    const h = r.box_h_cm || 0;
    const baseArea = (w * d) / 10000;
    const denom = (r.qty_per_pcs || 1) * (r.qty_per_box || 1);
    const maxStack = Math.max(1, r.max_stack || 1);
    const positions = baseArea > 0 ? Math.ceil((r.close_qty / denom) / maxStack) : 0;
    const footprint = positions * baseArea * 1.15;
    const supName = r.supplier_name || r.supplier_code || 'Khác';

    totalArea += footprint;
    totalQty += r.close_qty;
    totalCost += r.close_cst || 0;

    const cur = bySupplier.get(supName) || { supplier: supName, supplier_code: r.supplier_code || '', sku_count: 0, qty: 0, area_m2: 0, cost: 0 };
    cur.sku_count += 1;
    cur.qty += r.close_qty;
    cur.area_m2 += footprint;
    cur.cost += r.close_cst || 0;
    bySupplier.set(supName, cur);

    if (includeItems) {
      items.push({
        barcode: r.barcode,
        product_name: r.product_name,
        supplier: supName,
        supplier_code: r.supplier_code || '',
        category: r.category || '',
        product_family: r.product_family || '',
        unit: r.unit || 'Cái',
        close_qty: Math.round(r.close_qty),
        stock_3001: Math.round(r.stock_3001 || 0),
        stock_1001: Math.round(r.stock_1001 || 0),
        close_cst: Math.round(r.close_cst || 0),
        box_w_cm: w,
        box_d_cm: d,
        box_h_cm: h,
        max_stack: maxStack,
        base_area_m2: Number(baseArea.toFixed(4)),
        positions,
        footprint_m2: Number(footprint.toFixed(2)),
        est_monthly_cost: Math.round(footprint * 109000),
      });
    }
  }

  const suppliers = Array.from(bySupplier.values())
    .sort((a, b) => b.area_m2 - a.area_m2)
    .map(s => ({
      ...s,
      qty: Math.round(s.qty),
      cost: Math.round(s.cost),
      area_m2: Number(s.area_m2.toFixed(2)),
      share_pct: totalArea > 0 ? Number(((s.area_m2 / totalArea) * 100).toFixed(1)) : 0,
      est_monthly_cost: Math.round(s.area_m2 * 109000),
    }));

  return {
    target_month: latest,
    cap_m2: 300,
    sku_count: rows.length,
    total_area_m2: Number(totalArea.toFixed(2)),
    utilization_pct: Number(((totalArea / 300) * 100).toFixed(1)),
    overflow_blocks_50m2: totalArea > 300 ? Math.ceil((totalArea - 300) / 50) : 0,
    total_qty: Math.round(totalQty),
    total_cost: Math.round(totalCost),
    suppliers,
    ...(includeItems ? { items: items.sort((a, b) => b.footprint_m2 - a.footprint_m2) } : {}),
  };
}

async function calcStore3001Inventory(includeItems = false, latestByStoreMap = null, last3Months = null) {
  let latestMap = latestByStoreMap;
  if (!latestMap) {
    const rowsM = await dbAll(`SELECT store_code, MAX(target_month) as m FROM erp_snapshots WHERE store_code IN ('9005','3001','1001') GROUP BY store_code`);
    latestMap = new Map(rowsM.map(r => [r.store_code, r.m]));
  }
  const latest3001 = latestMap.get('3001') || '202611';
  const latest9005 = latestMap.get('9005') || '202611';
  const latest1001 = latestMap.get('1001') || '';

  let m3 = last3Months;
  if (includeItems && (!m3 || !m3.length)) {
    const months = await dbAll(`SELECT DISTINCT target_month FROM erp_snapshots WHERE store_code = '3001' ORDER BY target_month DESC LIMIT 3`);
    m3 = months.map(r => r.target_month);
  }
  const ph3 = m3 && m3.length ? m3.map(() => '?').join(',') : '?';
  const mArgs3 = m3 && m3.length ? m3 : [latest3001];

  const rows = await dbAll(includeItems ? `
    SELECT e.barcode, e.product_name, e.supplier_code, e.close_qty, e.close_cst, e.sales_qty, e.sales_amt,
           p.supplier_name, p.category, p.product_family, p.unit, p.retail_price,
           COALESCE(s9.close_qty, 0) as stock_9005,
           COALESCE(s1.close_qty, 0) as stock_1001,
           COALESCE(r3.sold_3m, 0) as sold_3m
    FROM erp_snapshots e
    LEFT JOIN products p ON p.barcode = e.barcode
    LEFT JOIN erp_snapshots s9 ON s9.barcode = e.barcode AND s9.store_code = '9005' AND s9.target_month = ?
    LEFT JOIN erp_snapshots s1 ON s1.barcode = e.barcode AND s1.store_code = '1001' AND s1.target_month = ?
    LEFT JOIN (
      SELECT barcode, SUM(sales_qty) as sold_3m
      FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph3})
      GROUP BY barcode
    ) r3 ON r3.barcode = e.barcode
    WHERE e.store_code = '3001' AND e.target_month = ? AND e.close_qty > 0
  ` : `
    SELECT e.barcode, e.supplier_code, e.close_qty, e.close_cst, e.sales_qty, e.sales_amt,
           p.supplier_name
    FROM erp_snapshots e
    LEFT JOIN products p ON p.barcode = e.barcode
    WHERE e.store_code = '3001' AND e.target_month = ? AND e.close_qty > 0
  `, includeItems ? [latest9005, latest1001, ...mArgs3, latest3001] : [latest3001]);

  let totalQty = 0;
  let totalCost = 0;
  let totalSalesAmt = 0;
  let totalSalesQty = 0;
  const bySupplier = new Map();
  const items = [];

  for (const r of rows) {
    const qty = Number(r.close_qty || 0);
    const cost = Number(r.close_cst || 0);
    const salesAmt = Number(r.sales_amt || 0);
    const salesQty = Number(r.sales_qty || 0);
    const supName = r.supplier_name || r.supplier_code || 'Khác';

    totalQty += qty;
    totalCost += cost;
    totalSalesAmt += salesAmt;
    totalSalesQty += salesQty;

    const cur = bySupplier.get(supName) || {
      supplier: supName,
      supplier_code: r.supplier_code || '',
      sku_count: 0,
      qty: 0,
      cost: 0,
      sales_amt: 0,
      sales_qty: 0,
    };
    cur.sku_count += 1;
    cur.qty += qty;
    cur.cost += cost;
    cur.sales_amt += salesAmt;
    cur.sales_qty += salesQty;
    bySupplier.set(supName, cur);

    if (includeItems) {
      items.push({
        barcode: r.barcode,
        product_name: r.product_name,
        supplier: supName,
        supplier_code: r.supplier_code || '',
        category: r.category || '',
        product_family: r.product_family || '',
        unit: r.unit || 'Cái',
        close_qty: Math.round(qty),
        stock_9005: Math.round(r.stock_9005 || 0),
        stock_1001: Math.round(r.stock_1001 || 0),
        close_cst: Math.round(cost),
        sales_qty: Math.round(salesQty),
        sales_amt: Math.round(salesAmt),
        sold_3m: Math.round(r.sold_3m || 0),
        retail_price: Math.round(r.retail_price || 0),
      });
    }
  }

  const suppliers = Array.from(bySupplier.values())
    .sort((a, b) => b.cost - a.cost)
    .map(s => ({
      ...s,
      qty: Math.round(s.qty),
      cost: Math.round(s.cost),
      cost_m: Number((s.cost / 1e6).toFixed(1)),
      sales_amt: Math.round(s.sales_amt),
      sales_qty: Math.round(s.sales_qty),
      share_pct: totalCost > 0 ? Number(((s.cost / totalCost) * 100).toFixed(1)) : 0,
    }));

  return {
    target_month: latest3001,
    sku_count: rows.length,
    total_qty: Math.round(totalQty),
    total_cost: Math.round(totalCost),
    total_sales_amt: Math.round(totalSalesAmt),
    total_sales_qty: Math.round(totalSalesQty),
    suppliers,
    ...(includeItems ? { items: items.sort((a, b) => b.close_cst - a.close_cst) } : {}),
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

app.post('/api/auth/change-password', wrap(async (req, res) => {
  const currentPwd = String(req.body.current_password || '');
  const newPwd = String(req.body.new_password || '').trim();
  if (!currentPwd || newPwd.length < 6) {
    return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới tối thiểu 6 ký tự.' });
  }
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !verifyPassword(currentPwd, user.password_hash)) {
    return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
  }
  const newHash = hashPassword(newPwd);
  await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
  invalidateAuthCache(req.user.id);
  const freshToken = signToken({ ...user, password_hash: newHash });
  res.json({ ok: true, token: freshToken });
}));

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
  await logAudit(req, 'CREATE_USER', 'USER', email, `Tạo tài khoản ${email} (${role} - ${department})`);

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
  invalidateAuthCache(id);
  await logAudit(req, 'UPDATE_USER', 'USER', id, `Cập nhật user #${id} (${b.full_name}): role=${role}, active=${b.active ? 1 : 0}${b.new_password ? ', reset mật khẩu' : ''}`);
  res.json({ ok: true, email_result: emailResult });
}));

app.delete('/api/users/:id', requireRoles('ADMIN'), wrap(async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Không thể tự xóa tài khoản Admin đang đăng nhập!' });
  }
  const targetUser = await dbGet('SELECT email, full_name, role FROM users WHERE id = ?', [targetId]);
  await dbRun('DELETE FROM users WHERE id = ?', [targetId]);
  invalidateAuthCache(targetId);
  await logAudit(req, 'DELETE_USER', 'USER', targetUser?.email || targetId, `Xóa tài khoản ${targetUser?.email || targetId}`, targetUser, null);
  res.json({ ok: true });
}));

// ─── 1. DASHBOARD & ERP ANALYTICS (PARALLELIZED + ON-DEMAND DRILLDOWN) ───
app.get('/api/dashboard', wrap(async (req, res) => {
  const cached = getServerCache('dashboard:summary');
  if (cached) return res.json(cached);

  // Batch 1: all independent KPI & trend queries in parallel (1 Turso RTT instead of 8!)
  const [orderStats, ticketStats, qcStats, csatStats, rawTrend, latestRows] = await Promise.all([
    dbGet(`
      SELECT COUNT(*) as total_orders,
             COALESCE(SUM(CASE WHEN require_install = 1 THEN 1 ELSE 0 END), 0) as install_orders,
             COALESCE(SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END), 0) as done_orders,
             COALESCE(SUM(shipping_fee_3pl), 0) as total_3pl_cost,
             COALESCE(SUM(customer_paid_fee), 0) as total_cust_fee,
             COALESCE(SUM(CASE WHEN is_promo_free_ship = 1 THEN 1 ELSE 0 END), 0) as promo_free_orders
      FROM orders
    `),
    dbGet(`
      SELECT COUNT(*) as total,
             COALESCE(SUM(CASE WHEN status NOT IN ('Closed','Resolved') THEN 1 ELSE 0 END), 0) as open_count
      FROM warranty_tickets
    `),
    dbGet(`
      SELECT COUNT(*) as skus, COALESCE(SUM(defective_qty), 0) as units
      FROM qc_factory_returns WHERE status != 'Closed'
    `),
    dbGet(`
      SELECT COUNT(*) as count, ROUND(AVG(csat_rating), 2) as avg_rating
      FROM handovers WHERE csat_rating > 0
    `),
    dbAll(`
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
    `),
    dbAll(`SELECT store_code, MAX(target_month) as m FROM erp_snapshots WHERE store_code IN ('9005','3001','1001') GROUP BY store_code`),
  ]);

  const store3001Trend = rawTrend.map(r => ({
    ...r,
    gp_pct: r.sales_amt > 0 ? Number((((r.sales_amt - r.cogs) / r.sales_amt) * 100).toFixed(1)) : 0,
  }));

  const latestMap = new Map(latestRows.map(r => [r.store_code, r.m]));
  const latest3001 = store3001Trend.length ? store3001Trend[store3001Trend.length - 1].target_month : (latestMap.get('3001') || '202611');
  const latest9005 = latestMap.get('9005') || '202611';
  const last3Months = store3001Trend.slice(-3).map(x => x.target_month);
  const ph = last3Months.length ? last3Months.map(() => '?').join(',') : '?';
  const mArgs = last3Months.length ? last3Months : [latest3001];

  // Batch 2: dependent analytics in parallel (skips heavy items[] and Top 50 lists until requested!)
  const [wh9005, wh3001, negativeStock, replenishAlerts, slowMoving, slowMovingTotal, bestSellers, bestSellersTotal] = await Promise.all([
    calcWarehouse9005Footprint(false, latestMap),
    calcStore3001Inventory(false, latestMap, last3Months),
    dbAll(`
      SELECT barcode, product_name, close_qty, store_code
      FROM erp_snapshots
      WHERE store_code = '3001' AND target_month = ? AND close_qty < 0
      ORDER BY close_qty ASC
    `, [latest3001]),
    dbAll(`
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
    `, [latest9005, ...mArgs, latest3001]),
    dbAll(`
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
        AND s3.close_qty > 0 AND COALESCE(r3.sold_3m, 0) <= 0
      ORDER BY s3.close_cst DESC LIMIT 6
    `, [...mArgs, latest3001]),
    dbGet(`
      SELECT COUNT(*) as count, ROUND(COALESCE(SUM(s3.close_cst), 0), 0) as total_cost
      FROM erp_snapshots s3
      LEFT JOIN (
        SELECT barcode, SUM(sales_qty) as sold_3m
        FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph})
        GROUP BY barcode
      ) r3 ON r3.barcode = s3.barcode
      WHERE s3.store_code = '3001' AND s3.target_month = ?
        AND s3.close_qty > 0 AND COALESCE(r3.sold_3m, 0) <= 0
    `, [...mArgs, latest3001]),
    dbAll(`
      SELECT r.barcode,
             COALESCE(NULLIF(p.name_vn,''), MAX(r.product_name)) as product_name,
             COALESCE(NULLIF(p.supplier_name,''), MAX(r.supplier_code), 'Khác') as supplier,
             ROUND(SUM(r.sales_qty), 0) as sold_qty,
             ROUND(SUM(r.sales_amt), 0) as sales_amt,
             ROUND(SUM(r.cogs), 0) as cogs,
             COALESCE(s3.close_qty, 0) as stock_3001,
             COALESCE(s9.close_qty, 0) as stock_9005,
             COALESCE(p.min_stock_3001, 2) as min_stock
      FROM erp_snapshots r
      LEFT JOIN products p ON p.barcode = r.barcode
      LEFT JOIN erp_snapshots s3 ON s3.barcode = r.barcode AND s3.store_code = '3001' AND s3.target_month = ?
      LEFT JOIN erp_snapshots s9 ON s9.barcode = r.barcode AND s9.store_code = '9005' AND s9.target_month = ?
      WHERE r.store_code = '3001' AND r.target_month IN (${ph})
        AND COALESCE(NULLIF(p.item_type,''), 'PRODUCT') = 'PRODUCT'
      GROUP BY r.barcode
      HAVING SUM(r.sales_qty) > 0
      ORDER BY SUM(r.sales_amt) DESC LIMIT 6
    `, [latest3001, latest9005, ...mArgs]),
    dbGet(`
      SELECT COUNT(*) as count,
             ROUND(COALESCE(SUM(sold_qty), 0), 0) as total_qty,
             ROUND(COALESCE(SUM(sales_amt), 0), 0) as total_sales_amt
      FROM (
        SELECT r.barcode, SUM(r.sales_qty) as sold_qty, SUM(r.sales_amt) as sales_amt
        FROM erp_snapshots r
        LEFT JOIN products p ON p.barcode = r.barcode
        WHERE r.store_code = '3001' AND r.target_month IN (${ph})
          AND COALESCE(NULLIF(p.item_type,''), 'PRODUCT') = 'PRODUCT'
        GROUP BY r.barcode
        HAVING SUM(r.sales_qty) > 0
      )
    `, mArgs),
  ]);

  const payload = {
    orderStats, ticketStats, qcStats, csatStats,
    wh9005, wh3001, store3001Trend, latest3001,
    negativeStock, replenishAlerts,
    slowMoving, slowMovingTotal, slowMovingMonths: last3Months,
    bestSellers, bestSellersTotal, bestSellersMonths: last3Months,
  };
  res.json(setServerCache('dashboard:summary', payload, 45000));
}));

// On-demand Warehouse 9005 per-barcode drilldown (loaded only when user clicks a supplier / opens drilldown)
app.get('/api/dashboard/wh9005-items', wrap(async (req, res) => {
  const cached = getServerCache('dashboard:wh9005-items');
  if (cached) return res.json(cached);
  const full = await calcWarehouse9005Footprint(true);
  const payload = { target_month: full.target_month, items: full.items || [] };
  res.json(setServerCache('dashboard:wh9005-items', payload, 45000));
}));

// On-demand Store 3001 per-barcode drilldown (loaded only when user clicks a supplier / opens drilldown)
app.get('/api/dashboard/store3001-items', wrap(async (req, res) => {
  const cached = getServerCache('dashboard:store3001-items');
  if (cached) return res.json(cached);
  const full = await calcStore3001Inventory(true);
  const payload = { target_month: full.target_month, items: full.items || [] };
  res.json(setServerCache('dashboard:store3001-items', payload, 45000));
}));

// On-demand Slow-Moving SKUs at Store 3001 for 30 / 60 / 90 days (1 / 2 / 3 latest ERP months)
app.get('/api/dashboard/slow-moving', wrap(async (req, res) => {
  const days = [30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
  const limit = Math.max(6, Math.min(100, Number(req.query.limit) || 50));
  const cacheKey = `dashboard:slow-moving:${days}:${limit}`;
  const cached = getServerCache(cacheKey);
  if (cached) return res.json(cached);

  const monthCount = days === 30 ? 1 : days === 60 ? 2 : 3;
  const monthsRows = await dbAll(`SELECT DISTINCT target_month FROM erp_snapshots WHERE store_code = '3001' ORDER BY target_month DESC LIMIT ?`, [monthCount]);
  const months = monthsRows.map(r => r.target_month);
  const latest3001 = months[0] || '202611';
  const ph = months.length ? months.map(() => '?').join(',') : '?';
  const mArgs = months.length ? months : [latest3001];

  const [items, total] = await Promise.all([
    dbAll(`
      SELECT s3.barcode, s3.product_name, s3.close_qty, ROUND(s3.close_cst, 0) as close_cst,
             COALESCE(p.supplier_name, s3.supplier_code) as supplier
      FROM erp_snapshots s3
      LEFT JOIN (
        SELECT barcode, SUM(sales_qty) as sold_w
        FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph})
        GROUP BY barcode
      ) r ON r.barcode = s3.barcode
      LEFT JOIN products p ON p.barcode = s3.barcode
      WHERE s3.store_code = '3001' AND s3.target_month = ?
        AND s3.close_qty > 0 AND COALESCE(r.sold_w, 0) <= 0
      ORDER BY s3.close_cst DESC LIMIT ?
    `, [...mArgs, latest3001, limit]),
    dbGet(`
      SELECT COUNT(*) as count, ROUND(COALESCE(SUM(s3.close_cst), 0), 0) as total_cost
      FROM erp_snapshots s3
      LEFT JOIN (
        SELECT barcode, SUM(sales_qty) as sold_w
        FROM erp_snapshots WHERE store_code = '3001' AND target_month IN (${ph})
        GROUP BY barcode
      ) r ON r.barcode = s3.barcode
      WHERE s3.store_code = '3001' AND s3.target_month = ?
        AND s3.close_qty > 0 AND COALESCE(r.sold_w, 0) <= 0
    `, [...mArgs, latest3001]),
  ]);

  res.json(setServerCache(cacheKey, { days, months: [...months].reverse(), total: total || { count: 0, total_cost: 0 }, items }, 45000));
}));

// On-demand Best-Selling SKUs at Store 3001 for 30 / 60 / 90 days (sorted by Revenue or Qty)
app.get('/api/dashboard/best-sellers', wrap(async (req, res) => {
  const days = [30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
  const sort = req.query.sort === 'sales_qty' ? 'sales_qty' : 'sales_amt';
  const limit = Math.max(6, Math.min(100, Number(req.query.limit) || 50));
  const cacheKey = `dashboard:best-sellers:${days}:${sort}:${limit}`;
  const cached = getServerCache(cacheKey);
  if (cached) return res.json(cached);

  const monthCount = days === 30 ? 1 : days === 60 ? 2 : 3;
  const [monthsRows, latest9005Row] = await Promise.all([
    dbAll(`SELECT DISTINCT target_month FROM erp_snapshots WHERE store_code = '3001' ORDER BY target_month DESC LIMIT ?`, [monthCount]),
    dbGet(`SELECT MAX(target_month) as m FROM erp_snapshots WHERE store_code = '9005'`),
  ]);
  const months = monthsRows.map(r => r.target_month);
  const latest3001 = months[0] || '202611';
  const latest9005 = latest9005Row?.m || '202611';
  const ph = months.length ? months.map(() => '?').join(',') : '?';
  const mArgs = months.length ? months : [latest3001];
  const orderCol = sort === 'sales_qty' ? 'SUM(r.sales_qty) DESC, SUM(r.sales_amt) DESC' : 'SUM(r.sales_amt) DESC, SUM(r.sales_qty) DESC';

  const [items, total] = await Promise.all([
    dbAll(`
      SELECT r.barcode,
             COALESCE(NULLIF(p.name_vn,''), MAX(r.product_name)) as product_name,
             COALESCE(NULLIF(p.supplier_name,''), MAX(r.supplier_code), 'Khác') as supplier,
             ROUND(SUM(r.sales_qty), 0) as sold_qty,
             ROUND(SUM(r.sales_amt), 0) as sales_amt,
             ROUND(SUM(r.cogs), 0) as cogs,
             COALESCE(s3.close_qty, 0) as stock_3001,
             COALESCE(s9.close_qty, 0) as stock_9005,
             COALESCE(p.min_stock_3001, 2) as min_stock
      FROM erp_snapshots r
      LEFT JOIN products p ON p.barcode = r.barcode
      LEFT JOIN erp_snapshots s3 ON s3.barcode = r.barcode AND s3.store_code = '3001' AND s3.target_month = ?
      LEFT JOIN erp_snapshots s9 ON s9.barcode = r.barcode AND s9.store_code = '9005' AND s9.target_month = ?
      WHERE r.store_code = '3001' AND r.target_month IN (${ph})
        AND COALESCE(NULLIF(p.item_type,''), 'PRODUCT') = 'PRODUCT'
      GROUP BY r.barcode
      HAVING SUM(r.sales_qty) > 0
      ORDER BY ${orderCol} LIMIT ?
    `, [latest3001, latest9005, ...mArgs, limit]),
    dbGet(`
      SELECT COUNT(*) as count,
             ROUND(COALESCE(SUM(sold_qty), 0), 0) as total_qty,
             ROUND(COALESCE(SUM(sales_amt), 0), 0) as total_sales_amt
      FROM (
        SELECT r.barcode, SUM(r.sales_qty) as sold_qty, SUM(r.sales_amt) as sales_amt
        FROM erp_snapshots r
        LEFT JOIN products p ON p.barcode = r.barcode
        WHERE r.store_code = '3001' AND r.target_month IN (${ph})
          AND COALESCE(NULLIF(p.item_type,''), 'PRODUCT') = 'PRODUCT'
        GROUP BY r.barcode
        HAVING SUM(r.sales_qty) > 0
      )
    `, mArgs),
  ]);

  res.json(setServerCache(cacheKey, { days, sort, months: [...months].reverse(), total: total || { count: 0, total_qty: 0, total_sales_amt: 0 }, items }, 45000));
}));

// ─── 2. MASTER DATA & GUIDES (PAGINATED + LEAN PROJECTION) ─────
app.get('/api/master/products', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const type = (req.query.type || '').trim();
  const includeStock = req.query.include_stock_9005 === '1';
  const includeAllStock = req.query.include_all_stock === '1';
  const defaultLimit = (includeStock || includeAllStock) ? 20 : 50;
  const limit = Math.max(1, Math.min(300, Number(req.query.limit) || defaultLimit));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let latest9005 = '';
  if (includeStock) {
    latest9005 = (await dbGet(`SELECT MAX(target_month) as m FROM erp_snapshots WHERE store_code = '9005'`))?.m || '202611';
  }

  let where = ` WHERE 1=1`;
  const filterParams = [];
  if (q) {
    where += ` AND (p.barcode LIKE ? OR p.name_vn LIKE ? OR p.supplier_name LIKE ? OR p.product_family LIKE ?)`;
    filterParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    where += ` AND p.item_type = ?`;
    filterParams.push(type);
  }

  const cols = `p.barcode, p.name_vn, p.item_type, p.supplier_name, p.unit, p.retail_price, p.cost_price,
                p.net_weight_g, p.p_handling, p.install_level, p.p_installation,
                p.warranty_policy, p.warranty_months, p.min_stock_3001, p.is_top_50`;
  const selectSql = includeStock
    ? `SELECT ${cols}, COALESCE(e.close_qty, 0) as stock_9005
       FROM products p
       LEFT JOIN erp_snapshots e ON e.barcode = p.barcode AND e.store_code = '9005' AND e.target_month = ?
       ${where} ORDER BY p.is_top_50 DESC, p.net_weight_g DESC, p.name_vn ASC LIMIT ? OFFSET ?`
    : `SELECT ${cols} FROM products p ${where} ORDER BY p.is_top_50 DESC, p.net_weight_g DESC, p.name_vn ASC LIMIT ? OFFSET ?`;

  const [countRow, prods] = await Promise.all([
    dbGet(`SELECT COUNT(*) as c FROM products p ${where}`, filterParams),
    dbAll(selectSql, includeStock ? [latest9005, ...filterParams, limit, offset] : [...filterParams, limit, offset]),
  ]);
  res.setHeader('X-Total-Count', String(countRow?.c || prods.length));
  if (!includeAllStock || prods.length === 0) return res.json(prods);

  const latestByStore = await dbAll(`SELECT store_code, MAX(target_month) as m FROM erp_snapshots WHERE store_code IN ('9005','3001','1001') GROUP BY store_code`);
  const stockMap = new Map();
  const barcodes = prods.map(p => p.barcode);
  const ph = barcodes.map(() => '?').join(',');
  // Parallelize 3 store stock lookups instead of sequential loop
  const snapBatches = await Promise.all(
    latestByStore
      .filter(row => row.store_code && row.m)
      .map(async row => ({
        store: row.store_code,
        rows: await dbAll(
          `SELECT barcode, close_qty FROM erp_snapshots WHERE store_code = ? AND target_month = ? AND barcode IN (${ph})`,
          [row.store_code, row.m, ...barcodes]
        ),
      }))
  );
  for (const batch of snapBatches) {
    for (const s of batch.rows) {
      const cur = stockMap.get(s.barcode) || { s9005: 0, s3001: 0, s1001: 0 };
      if (batch.store === '9005') cur.s9005 = s.close_qty || 0;
      else if (batch.store === '3001') cur.s3001 = s.close_qty || 0;
      else if (batch.store === '1001') cur.s1001 = s.close_qty || 0;
      stockMap.set(s.barcode, cur);
    }
  }
  res.json(prods.map(p => {
    const st = stockMap.get(p.barcode) || { s9005: 0, s3001: 0, s1001: 0 };
    return { ...p, stock_9005: st.s9005, stock_3001: st.s3001, stock_1001: st.s1001 };
  }));
}));

app.put('/api/master/products/:barcode', requireRoles('ADMIN'), wrap(async (req, res) => {
  const { barcode } = req.params;
  const b = req.body;
  const before = await dbGet('SELECT name_vn, retail_price, cost_price, net_weight_g, p_handling, p_installation, min_stock_3001 FROM products WHERE barcode = ?', [barcode]);
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
  await logAudit(req, 'UPDATE_SKU_MASTER', 'PRODUCT', barcode, `Cập nhật định mức SKU ${barcode} (${b.name_vn})`, before, {
    p_handling: num(b.p_handling), p_installation: num(b.p_installation), net_weight_g: num(b.net_weight_g), min_stock_3001: num(b.min_stock_3001)
  });
  res.json({ ok: true });
}));

app.get('/api/master/lookups', wrap(async (req, res) => {
  const cached = getServerCache('master:lookups');
  if (cached) return res.json(cached);
  const [staff, warehouses, partners] = await Promise.all([
    dbAll('SELECT * FROM staff WHERE active = 1 ORDER BY emp_code, full_name'),
    dbAll('SELECT * FROM warehouses ORDER BY code'),
    dbAll('SELECT * FROM partners ORDER BY partner_type, name'),
  ]);
  res.json(setServerCache('master:lookups', { staff, warehouses, partners }, 120000));
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
  const summary = req.query.summary === '1';
  const rows = q
    ? await dbAll(
        summary
          ? `SELECT id, title, product_line, guide_type, substr(content_md, 1, 220) as content_md FROM product_guides WHERE title LIKE ? OR product_line LIKE ? OR content_md LIKE ? ORDER BY product_line, id`
          : `SELECT * FROM product_guides WHERE title LIKE ? OR product_line LIKE ? OR content_md LIKE ? ORDER BY product_line, id`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      )
    : await dbAll(
        summary
          ? `SELECT id, title, product_line, guide_type, substr(content_md, 1, 220) as content_md FROM product_guides ORDER BY product_line, id`
          : `SELECT * FROM product_guides ORDER BY product_line, id`
      );
  if (!summary) return res.json(rows);
  res.json(rows.map(g => {
    const cleanText = String(g.content_md || '').replace(/[#*_\\!]|\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim();
    const title = String(g.title || '').trim() || cleanText.slice(0, 80) || `Tài liệu ${g.guide_type || 'HDLR'} #${g.id}`;
    return {
      id: g.id,
      title,
      product_line: g.product_line || 'Chung',
      guide_type: g.guide_type || 'HDLR',
      preview: cleanText.slice(0, 160),
    };
  }));
}));

// Quick HDLR/HDBQ matcher for KTV on-site inside BM-01 HandoverModal (TASK-14)
app.get('/api/guides/match', wrap(async (req, res) => {
  const names = String(req.query.names || '').trim().toLowerCase();
  const all = await dbAll(`SELECT id, title, product_line, guide_type, content_md FROM product_guides ORDER BY product_line, id`);

  const normalizeGuide = (g) => {
    let title = String(g.title || '').trim();
    if (!title) {
      const firstLine = String(g.content_md || '')
        .split(/\r?\n/)
        .map(l => l.replace(/[#*_\\!]|\[.*?\]/g, '').trim())
        .find(l => l.length > 2);
      title = firstLine ? firstLine.slice(0, 90) : `Tài liệu ${g.guide_type || 'HDLR'} #${g.id}`;
    }
    return { ...g, title };
  };

  const normalized = all.map(normalizeGuide);
  if (!names) return res.json(normalized.slice(0, 6));

  const stopWords = new Set(['benom', 'màu', 'trắng', 'nâu', 'đen', 'xám', 'nhiên', 'kích', 'thước', 'loại', 'chiếc', 'thùng']);
  const tokens = Array.from(
    new Set(
      names
        .split(/[\s\-_/(),.+]+/)
        .map(w => w.trim())
        .filter(w => w.length >= 3 && !stopWords.has(w) && !/^\d/.test(w))
    )
  );

  const scored = normalized
    .map(g => {
      let score = 0;
      const line = String(g.product_line || '').toLowerCase();
      const titleLow = String(g.title || '').toLowerCase();
      const contentLow = String(g.content_md || '').toLowerCase();

      if (line && line !== 'chung' && names.includes(line)) score += 20;
      for (const tok of tokens) {
        if (titleLow.includes(tok)) score += tok.length >= 4 ? 8 : 4;
        if (contentLow.includes(tok)) score += tok.length >= 4 ? 5 : 2;
      }
      return { guide: g, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const seenContent = new Set();
  const deduped = [];
  for (const x of scored) {
    const key = String(x.guide.content_md || '').trim().slice(0, 120);
    if (seenContent.has(key)) continue;
    seenContent.add(key);
    deduped.push(x.guide);
    if (deduped.length >= 6) break;
  }

  res.json(deduped.length > 0 ? deduped : normalized.slice(0, 4));
}));

app.get('/api/guides/:id', wrap(async (req, res) => {
  const row = await dbGet('SELECT id, title, product_line, guide_type, content_md FROM product_guides WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy tài liệu hướng dẫn' });
  res.json(row);
}));

// ─── 2B. SPARE PARTS / KHO NGŨ KIM KTV (TASK-15) ──────────────
app.get('/api/spare-parts', wrap(async (req, res) => {
  const [parts, logs] = await Promise.all([
    dbAll('SELECT * FROM spare_parts ORDER BY (stock_qty <= min_stock) DESC, category ASC, name ASC'),
    dbAll('SELECT * FROM spare_part_logs ORDER BY id DESC LIMIT 40'),
  ]);
  res.json({
    parts: parts.map(p => ({ ...p, is_low_stock: Number(p.stock_qty) <= Number(p.min_stock) })),
    logs,
  });
}));

app.post('/api/spare-parts', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const code = String(b.code || '').trim().toUpperCase();
  const name = String(b.name || '').trim();
  if (!code || !name) return res.status(400).json({ error: 'Vui lòng nhập Mã ngũ kim và Tên vật tư.' });
  const r = await dbRun(
    `INSERT INTO spare_parts (code, name, category, unit, stock_qty, min_stock, location, notes, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [code, name, b.category || 'Ốc vít & Liên kết', b.unit || 'Cái', num(b.stock_qty), num(b.min_stock) || 10, b.location || 'Store 3001 / Túi đồ KTV', b.notes || '', getVnDateTime()]
  );
  await logAudit(req, 'CREATE_SPARE_PART', 'SPARE_PART', code, `Thêm vật tư ngũ kim ${code} — ${name} (tồn đầu: ${num(b.stock_qty)})`);
  res.json({ id: r.lastInsertRowid, ok: true });
}));

app.post('/api/spare-parts/:id/tx', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const part = await dbGet('SELECT * FROM spare_parts WHERE id = ?', [req.params.id]);
  if (!part) return res.status(404).json({ error: 'Không tìm thấy vật tư ngũ kim' });
  const txType = req.body.tx_type === 'IN' ? 'IN' : 'OUT';
  const qty = Math.abs(num(req.body.qty));
  if (qty <= 0) return res.status(400).json({ error: 'Số lượng phải lớn hơn 0.' });

  const nextStock = txType === 'IN' ? Number(part.stock_qty) + qty : Math.max(0, Number(part.stock_qty) - qty);
  const nowVn = getVnDateTime();
  const staffName = String(req.body.staff_name || req.user.full_name || '').trim();
  const refDoc = String(req.body.ref_doc || '').trim();
  const notes = String(req.body.notes || '').trim();

  await dbRun(`UPDATE spare_parts SET stock_qty = ?, updated_at = ? WHERE id = ?`, [nextStock, nowVn, part.id]);
  await dbRun(
    `INSERT INTO spare_part_logs (part_id, part_code, part_name, tx_type, qty, staff_name, ref_doc, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [part.id, part.code, part.name, txType, qty, staffName, refDoc, notes, nowVn]
  );
  await logAudit(
    req,
    txType === 'IN' ? 'SPARE_PART_IN' : 'SPARE_PART_OUT',
    'SPARE_PART',
    part.code,
    `${txType === 'IN' ? 'Nhập' : 'Xuất KTV'} ${qty} ${part.unit} ${part.name} (tồn: ${part.stock_qty} → ${nextStock})${refDoc ? ` • ${refDoc}` : ''}`
  );
  res.json({ ok: true, stock_qty: nextStock });
}));

// ─── 3. ORDERS & DISPATCH ─────────────────────────────────────
async function batchQueryByIds(sqlPrefix, ids) {
  if (!ids || ids.length === 0) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const ph = slice.map(() => '?').join(',');
    const rows = await dbAll(`${sqlPrefix} (${ph})`, slice);
    out.push(...rows);
  }
  return out;
}

app.get('/api/orders', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const status = (req.query.status || '').trim();
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 60));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let where = ` WHERE 1=1`;
  const params = [];
  if (q) {
    where += ` AND (invoice_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR tracking_no LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where += ` AND status = ?`;
    params.push(status);
  }
  const [countRow, orders] = await Promise.all([
    dbGet(`SELECT COUNT(*) as c FROM orders${where}`, params),
    dbAll(`SELECT * FROM orders${where} ORDER BY order_date DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
  ]);
  res.setHeader('X-Total-Count', String(countRow?.c || orders.length));

  const orderIds = orders.map(o => o.id);
  const invoiceNos = Array.from(new Set(orders.map(o => o.invoice_no).filter(Boolean)));

  const [allItems, allHos] = await Promise.all([
    batchQueryByIds(`SELECT id, order_id, barcode, product_name, unit, qty, net_weight_g, source_warehouse, moving_no FROM order_items WHERE order_id IN`, orderIds),
    batchQueryByIds(`SELECT id, doc_no, doc_type, invoice_no, status, csat_rating FROM handovers WHERE invoice_no IN`, invoiceNos),
  ]);

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

  const invoiceNo = String(b.invoice_no || '').trim();
  if (!invoiceNo) {
    return res.status(400).json({ error: 'Vui lòng nhập Mã hóa đơn POS!' });
  }
  // Prevent duplicate orders (e.g., accidental double-click on Save)
  if (!b.allow_duplicate) {
    const dupOrder = await dbGet(`SELECT id, customer_name FROM orders WHERE invoice_no = ? AND status != 'Cancelled' LIMIT 1`, [invoiceNo]);
    if (dupOrder) {
      return res.status(409).json({
        error: `Đơn hàng ${invoiceNo} (${dupOrder.customer_name}) đã tồn tại! Vui lòng mở nút Sửa nếu cần cập nhật.`,
      });
    }
  }

  const defaultWh = b.source_warehouse || '9005';
  const distinctWhs = Array.from(new Set(items.map(it => (it.source_warehouse || defaultWh).trim()).filter(Boolean)));
  const summaryWh = distinctWhs.length > 0 ? distinctWhs.join(' + ') : defaultWh;

  const r = await dbRun(`
    INSERT INTO orders (
      invoice_no, order_date, delivery_date, customer_name, customer_phone, address, region,
      distance_km, carrier, tracking_no, source_warehouse, moving_no, pic_sales, channel,
      shipping_fee_3pl, customer_paid_fee, is_promo_free_ship, require_install, is_stairs,
      ktv1_name, ktv1_code, ktv2_name, ktv2_code, ktvs_json, status, install_status, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    invoiceNo, b.order_date || getVnIsoDate(), b.delivery_date || '',
    b.customer_name || '', String(b.customer_phone || '').trim(), b.address || '', b.region || 'HCM',
    num(b.distance_km), b.carrier || 'Ahamove', b.tracking_no || '', summaryWh,
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
      INSERT INTO order_items (order_id, barcode, product_name, unit, qty, net_weight_g, warranty_months, warranty_policy, p_handling_unit, p_installation_unit, source_warehouse, moving_no)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      oid, it.barcode || '', it.product_name || p?.name_vn || '', it.unit || p?.unit || 'Cái',
      num(it.qty) || 1, p?.net_weight_g || num(it.net_weight_g),
      p?.warranty_months || 0, p?.warranty_policy || 'Không bảo hành',
      p ? p.p_handling : 15000, p ? p.p_installation : 0,
      (it.source_warehouse || defaultWh).trim(),
      String(it.moving_no || b.moving_no || '').trim(),
    ]);
  }

  // Sync carrier & 3PL fee to delivery_tracking if this POS slip already exists there
  if (invoiceNo && (b.carrier || num(b.shipping_fee_3pl) > 0)) {
    await dbRun(`
      UPDATE delivery_tracking
      SET carrier_3pl = CASE WHEN carrier_3pl = '' AND ? != '' THEN ? ELSE carrier_3pl END,
          fee_3pl = CASE WHEN fee_3pl = 0 AND ? > 0 THEN ? ELSE fee_3pl END,
          updated_at = datetime('now', '+7 hours')
      WHERE slip_no = ?
    `, [b.carrier || '', b.carrier || '', num(b.shipping_fee_3pl), num(b.shipping_fee_3pl), invoiceNo]);
  }
  res.json({ id: oid, ok: true });
}));

app.put('/api/orders/:id', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const existing = await dbGet('SELECT * FROM orders WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

  const ktvNorm = normalizeKtvInput(b, existing);
  const nextRequireInstall = b.require_install !== undefined ? (b.require_install ? 1 : 0) : existing.require_install;
  const nextStatus = b.status ?? existing.status;

  // Guardrail (TASK-13): Block edits to allowance-affecting fields on orders in a LOCKED allowance month
  const existingPeriodDate = existing.delivery_date || existing.order_date;
  const lockedInfo = existing.require_install ? await getLockedAllowanceMonth(existingPeriodDate) : null;
  if (lockedInfo) {
    const allowanceChanged =
      (b.distance_km !== undefined && num(b.distance_km) !== num(existing.distance_km)) ||
      (b.is_stairs !== undefined && (b.is_stairs ? 1 : 0) !== existing.is_stairs) ||
      (b.require_install !== undefined && nextRequireInstall !== existing.require_install) ||
      (b.delivery_date !== undefined && String(b.delivery_date) !== String(existing.delivery_date || '')) ||
      (ktvNorm.json !== JSON.stringify(parseKtvs(existing)));
    if (allowanceChanged) {
      return res.status(423).json({
        error: `Kỳ phụ cấp ${lockedInfo.month_ym} đã được KHÓA bởi ${lockedInfo.locked_by} (${lockedInfo.locked_at}). Admin cần Mở khóa kỳ trước khi sửa km/thang bộ/KTV/ngày giao.`,
      });
    }
  }

  // Enforce >= 25kg safety lock on updates as well (unless order is Cancelled)
  const hasItemsUpdate = Array.isArray(b.items);
  if (nextRequireInstall && nextStatus !== 'Cancelled') {
    let maxWeight = 0;
    if (hasItemsUpdate) {
      for (const it of b.items) {
        const prod = await dbGet('SELECT net_weight_g FROM products WHERE barcode = ?', [it.barcode || '']);
        maxWeight = Math.max(maxWeight, prod?.net_weight_g || num(it.net_weight_g));
      }
    } else {
      const wRow = await dbGet('SELECT MAX(net_weight_g) as max_w FROM order_items WHERE order_id = ?', [id]);
      maxWeight = wRow?.max_w || 0;
    }
    if (maxWeight >= 25000 && ktvNorm.list.length < 2) {
      return res.status(400).json({
        error: 'Quy tắc an toàn Benom: Đơn có sản phẩm ≥ 25 kg bắt buộc phân công tối thiểu 2 KTV!',
      });
    }
  }

  const nextCarrier = b.carrier ?? existing.carrier;
  const nextFee3pl = b.shipping_fee_3pl !== undefined ? num(b.shipping_fee_3pl) : existing.shipping_fee_3pl;
  const defaultWh = b.source_warehouse ?? existing.source_warehouse ?? '9005';
  const distinctWhs = hasItemsUpdate
    ? Array.from(new Set(b.items.map(it => (it.source_warehouse || '9005').trim()).filter(Boolean)))
    : [];
  const nextSourceWh = distinctWhs.length > 0 ? distinctWhs.join(' + ') : defaultWh;

  await dbRun(`
    UPDATE orders SET
      invoice_no=?, customer_name=?, customer_phone=?, address=?, region=?, source_warehouse=?,
      status=?, carrier=?, tracking_no=?, distance_km=?, shipping_fee_3pl=?,
      customer_paid_fee=?, is_promo_free_ship=?, is_stairs=?, require_install=?,
      ktv1_name=?, ktv1_code=?, ktv2_name=?, ktv2_code=?, ktvs_json=?,
      install_status=?, delivery_date=?, notes=?
    WHERE id=?
  `, [
    b.invoice_no !== undefined ? String(b.invoice_no).trim() : existing.invoice_no,
    b.customer_name ?? existing.customer_name,
    b.customer_phone !== undefined ? String(b.customer_phone).trim() : existing.customer_phone,
    b.address ?? existing.address,
    b.region ?? existing.region,
    nextSourceWh,
    nextStatus,
    nextCarrier,
    b.tracking_no ?? existing.tracking_no,
    b.distance_km !== undefined ? num(b.distance_km) : existing.distance_km,
    nextFee3pl,
    b.customer_paid_fee !== undefined ? num(b.customer_paid_fee) : existing.customer_paid_fee,
    b.is_promo_free_ship !== undefined ? (b.is_promo_free_ship ? 1 : 0) : existing.is_promo_free_ship,
    b.is_stairs !== undefined ? (b.is_stairs ? 1 : 0) : existing.is_stairs,
    nextRequireInstall,
    ktvNorm.ktv1_name, ktvNorm.ktv1_code, ktvNorm.ktv2_name, ktvNorm.ktv2_code, ktvNorm.json,
    b.install_status ?? existing.install_status,
    b.delivery_date ?? existing.delivery_date,
    b.notes ?? existing.notes,
    id
  ]);

  if (hasItemsUpdate) {
    await dbRun('DELETE FROM order_items WHERE order_id = ?', [id]);
    for (const it of b.items) {
      const p = await dbGet('SELECT * FROM products WHERE barcode = ?', [it.barcode || '']);
      await dbRun(`
        INSERT INTO order_items (order_id, barcode, product_name, unit, qty, net_weight_g, warranty_months, warranty_policy, p_handling_unit, p_installation_unit, source_warehouse, moving_no)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        id, it.barcode || '', it.product_name || p?.name_vn || '', it.unit || p?.unit || 'Cái',
        num(it.qty) || 1, p?.net_weight_g || num(it.net_weight_g),
        p?.warranty_months || 0, p?.warranty_policy || 'Không bảo hành',
        p ? p.p_handling : num(it.p_handling_unit) || 15000,
        p ? p.p_installation : num(it.p_installation_unit) || 0,
        (it.source_warehouse || '9005').trim(),
        String(it.moving_no || '').trim(),
      ]);
    }
  }

  // 2-way sync carrier & 3PL fee to delivery_tracking if linked by invoice_no
  if (existing.invoice_no) {
    await dbRun(`
      UPDATE delivery_tracking
      SET carrier_3pl = CASE WHEN ? != '' THEN ? ELSE carrier_3pl END,
          fee_3pl = CASE WHEN ? > 0 THEN ? ELSE fee_3pl END,
          area = CASE WHEN ? != '' THEN ? ELSE area END,
          updated_at = datetime('now', '+7 hours')
      WHERE slip_no = ?
    `, [nextCarrier || '', nextCarrier || '', nextFee3pl, nextFee3pl, b.region || '', b.region || '', existing.invoice_no]);
  }
  await logAudit(req, 'UPDATE_ORDER', 'ORDER', existing.invoice_no || id, `Cập nhật ĐH ${existing.invoice_no}: ${existing.status}→${nextStatus}, Kho ${nextSourceWh}, 3PL ${nextCarrier} (${nextFee3pl}đ)`, {
    status: existing.status, carrier: existing.carrier, shipping_fee_3pl: existing.shipping_fee_3pl, distance_km: existing.distance_km, is_stairs: existing.is_stairs
  }, {
    status: nextStatus, carrier: nextCarrier, shipping_fee_3pl: nextFee3pl, distance_km: b.distance_km !== undefined ? num(b.distance_km) : existing.distance_km, is_stairs: b.is_stairs !== undefined ? (b.is_stairs ? 1 : 0) : existing.is_stairs
  });
  res.json({ ok: true });
}));

app.delete('/api/orders/:id', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const { id } = req.params;
  const existing = await dbGet('SELECT * FROM orders WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  const periodDate = existing.delivery_date || existing.order_date;
  const lockedInfo = existing.require_install ? await getLockedAllowanceMonth(periodDate) : null;
  if (lockedInfo) {
    return res.status(423).json({ error: `Kỳ phụ cấp ${lockedInfo.month_ym} đã bị KHÓA — không thể xóa đơn trong kỳ đã chốt.` });
  }
  await dbRun('DELETE FROM order_items WHERE order_id = ?', [id]);
  await dbRun('DELETE FROM orders WHERE id = ?', [id]);
  await logAudit(req, 'DELETE_ORDER', 'ORDER', existing.invoice_no || id, `Xóa đơn hàng ${existing.invoice_no} (${existing.customer_name})`, { invoice_no: existing.invoice_no, customer_name: existing.customer_name }, null);
  res.json({ ok: true });
}));

app.post('/api/orders/:id/generate-xk', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const o = await dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  const allItems = await dbAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
  // Only export items picked from Warehouse 9005 (Toàn Nhất) — exclude items picked at Store 3001 or Pop-up 1001!
  const items9005 = allItems.filter(it => {
    const wh = (it.source_warehouse || o.source_warehouse || '9005').trim();
    return wh === '9005' || wh.includes('9005');
  });
  if (items9005.length === 0) {
    return res.status(400).json({ error: `Đơn ${o.invoice_no} không có sản phẩm nào lấy tại Kho 9005 Toàn Nhất (tất cả lấy ở 3001/1001)!` });
  }
  const slipNo = await nextSlipNo('XK');
  const today = getVnIsoDate();
  const expDate = req.body.expected_date || o.delivery_date || today;
  const expTime = req.body.expected_time || '09:00';
  const warning = evaluateToanNhatCutoff(expDate, expTime);
  const movingNos = Array.from(new Set(items9005.map(it => it.moving_no).filter(Boolean))).join(', ');

  const r = await dbRun(`
    INSERT INTO warehouse_slips (slip_no, slip_type, slip_date, expected_date, expected_time, created_by, partner_name, carrier, warehouse_code, purpose, ref_invoice, status, cutoff_warning, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    slipNo, 'XK', today, expDate, expTime, req.user.full_name, 'Toàn Nhất Logistics', o.carrier || 'Ahamove', '9005',
    'Giao khách', o.invoice_no, 'Draft', warning,
    `Xuất kho 9005 giao ĐH ${o.invoice_no} - ${o.customer_name}${movingNos ? ` (Moving: ${movingNos})` : ''}${items9005.length < allItems.length ? ` [Chỉ gồm ${items9005.length}/${allItems.length} SP lấy từ 9005]` : ''}`
  ]);
  const sid = r.lastInsertRowid;
  for (const it of items9005) {
    await dbRun(
      `INSERT INTO warehouse_slip_items (slip_id, barcode, product_name, unit, qty, note) VALUES (?,?,?,?,?,?)`,
      [sid, it.barcode, it.product_name, it.unit, it.qty, it.moving_no ? `Moving ${it.moving_no}` : '']
    );
  }
  res.json({ id: sid, slip_no: slipNo, items_count: items9005.length, total_order_items: allItems.length, cutoff_warning: warning });
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
    docNo, docType, o.id, o.invoice_no, o.delivery_date || getVnIsoDate(),
    o.source_warehouse || '9005', o.customer_name, o.customer_phone, o.address, o.carrier,
    req.body.install_mode || (docType === 'BM-01' ? 'Kỹ thuật Benom lắp đặt' : 'Khách hàng tự lắp đặt'),
    o.ktv1_name, o.ktv1_code, o.ktv2_name, o.ktv2_code, ktvsJson, 'Pending'
  ]);
  res.json({ id: r.lastInsertRowid, doc_no: docNo, doc_type: docType });
}));

// ─── 4. HANDOVERS (BM-01 / BM-05 Mobile + CSAT, LAZY MEDIA) ────
app.get('/api/handovers', wrap(async (req, res) => {
  // Lightweight list query: omit heavy Base64 signature_data & photos_json blobs for fast 4G/Turso loads
  const list = await dbAll(`
    SELECT id, doc_no, doc_type, order_id, invoice_no, handover_date, warehouse_code,
           customer_name, customer_phone, address, carrier, driver_name, driver_phone, vehicle_plate,
           install_mode, ktv1_name, ktv1_code, ktv2_name, ktv2_code, ktvs_json,
           check_1, check_2, check_3, check_4, issue_note, due_date,
           csat_rating, csat_comment, status, created_at,
           CASE WHEN signature_data IS NOT NULL AND signature_data != '' THEN 1 ELSE 0 END as has_signature,
           CASE WHEN photos_json IS NOT NULL AND photos_json != '' AND photos_json != '[]' THEN 1 ELSE 0 END as has_photos
    FROM handovers
    ORDER BY id DESC LIMIT 100
  `);
  const orderIds = Array.from(new Set(list.map(h => h.order_id).filter(Boolean)));
  const allItems = await batchQueryByIds(`SELECT * FROM order_items WHERE order_id IN`, orderIds);
  const itemMap = new Map();
  for (const it of allItems) {
    const arr = itemMap.get(it.order_id) || [];
    arr.push(it);
    itemMap.set(it.order_id, arr);
  }
  res.json(list.map(h => ({ ...h, ktvs: parseKtvs(h), items: h.order_id ? (itemMap.get(h.order_id) || []) : [] })));
}));

app.get('/api/handovers/:id', wrap(async (req, res) => {
  const h = await dbGet('SELECT * FROM handovers WHERE id = ?', [req.params.id]);
  if (!h) return res.status(404).json({ error: 'Không tìm thấy biên bản' });
  const items = h.order_id ? await dbAll('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [h.order_id]) : [];
  res.json({ ...h, ktvs: parseKtvs(h), items });
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
          [newDate, getVnIsoDate(), targetOrderId]
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
            [newDate, getVnIsoDate(), targetOrderId]
          );
        }
      }
    }
  }
  res.json({ ok: true });
}));

// ─── 5. TECHNICIAN ALLOWANCE ENGINE (SOP COMPLIANT, N KTVs) ────
async function computeAllowance(monthInput, scopeInput = 'completed') {
  const scope = ['completed', 'bm01_only', 'all'].includes(scopeInput) ? scopeInput : 'completed';

  const [monthsRows, bm01Rows, allLocks] = await Promise.all([
    dbAll(`
      SELECT DISTINCT substr(COALESCE(NULLIF(delivery_date,''), order_date), 1, 7) as ym
      FROM orders
      WHERE require_install = 1
        AND (ktv1_name != '' OR ktv2_name != '' OR (ktvs_json IS NOT NULL AND ktvs_json != '' AND ktvs_json != '[]'))
        AND length(COALESCE(NULLIF(delivery_date,''), order_date)) >= 7
      ORDER BY ym DESC
    `),
    dbAll(`SELECT id, order_id, invoice_no, doc_no, status FROM handovers WHERE doc_type = 'BM-01' AND status != 'Cancelled'`),
    dbAll('SELECT month_ym, locked_by, locked_at, grand_total, order_count, notes FROM allowance_locks ORDER BY month_ym DESC'),
  ]);
  const available_months = monthsRows.map(r => r.ym).filter(Boolean);
  const currentVnMonth = getVnYearMonth();
  if (!available_months.includes(currentVnMonth)) {
    available_months.unshift(currentVnMonth);
  }

  let effectiveMonth = monthInput;
  if (monthInput === 'LATEST') {
    effectiveMonth = available_months[0] || currentVnMonth;
  } else if (monthInput === 'ALL') {
    effectiveMonth = '';
  }

  const orders = await dbAll(`
    SELECT * FROM orders
    WHERE require_install = 1
      AND (ktv1_name != '' OR ktv2_name != '' OR (ktvs_json IS NOT NULL AND ktvs_json != '' AND ktvs_json != '[]'))
      AND (? = '' OR COALESCE(NULLIF(delivery_date,''), order_date) LIKE ?)
    ORDER BY COALESCE(NULLIF(delivery_date,''), order_date) ASC, id ASC
  `, [effectiveMonth, `${effectiveMonth}%`]);

  // Map BM-01 handovers to verify SOP compliance (BEN-PRO-TechnicianAllowance Bước 4 & 6)
  const bm01ByOrderId = new Map();
  const bm01ByInvoice = new Map();
  for (const h of bm01Rows) {
    if (h.order_id && (!bm01ByOrderId.has(h.order_id) || h.status === 'Completed')) {
      bm01ByOrderId.set(h.order_id, h);
    }
    if (h.invoice_no && (!bm01ByInvoice.has(h.invoice_no) || h.status === 'Completed')) {
      bm01ByInvoice.set(h.invoice_no, h);
    }
  }

  let excludedPendingCount = 0;
  let unverifiedBm01Count = 0;
  const eligibleOrders = [];

  for (const o of orders) {
    if (o.status === 'Cancelled') continue;
    const bm01 = bm01ByOrderId.get(o.id) || bm01ByInvoice.get(o.invoice_no) || null;
    const hasCompletedBm01 = bm01?.status === 'Completed';
    const isHistoricalInstallDone = /đã lắp|nghiệm thu/i.test(o.install_status || '');
    const isPendingOrder = ['New', 'In Transit'].includes(o.status) || /chờ lắp/i.test(o.install_status || '');
    const isVerified = hasCompletedBm01 || isHistoricalInstallDone;
    const isCompletedEligible = hasCompletedBm01 || isHistoricalInstallDone || !isPendingOrder;

    if (!isCompletedEligible) excludedPendingCount++;

    const include =
      scope === 'all' ? true :
      scope === 'bm01_only' ? isVerified :
      isCompletedEligible;

    if (!include) continue;
    if (!isVerified) unverifiedBm01Count++;

    eligibleOrders.push({
      order: o,
      bm01_doc_no: bm01?.doc_no || '',
      bm01_status: hasCompletedBm01
        ? 'Đã ký BM-01'
        : isHistoricalInstallDone
          ? 'Đã nghiệm thu (Lịch sử)'
          : bm01
            ? `BM-01 ${bm01.status}`
            : 'Chưa có BM-01',
      is_verified_bm01: isVerified,
    });
  }

  // Targeted order_items lookup instead of full-table scan
  const itemMap = new Map();
  if (eligibleOrders.length > 0) {
    const ids = eligibleOrders.map(e => e.order.id);
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const ph = slice.map(() => '?').join(',');
      const batchItems = await dbAll(`SELECT * FROM order_items WHERE order_id IN (${ph}) ORDER BY id ASC`, slice);
      for (const it of batchItems) {
        const arr = itemMap.get(it.order_id) || [];
        arr.push(it);
        itemMap.set(it.order_id, arr);
      }
    }
  }

  const lines = [];
  const ktvTotals = new Map();

  for (const entry of eligibleOrders) {
    const o = entry.order;
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
        order_status: o.status, bm01_doc_no: entry.bm01_doc_no, bm01_status: entry.bm01_status,
        is_verified_bm01: entry.is_verified_bm01,
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

  const lockInfo = effectiveMonth ? (allLocks.find(l => l.month_ym === effectiveMonth) || null) : null;

  return {
    month: effectiveMonth || 'ALL',
    scope,
    available_months,
    lock_info: lockInfo,
    locked_months: allLocks.map(l => l.month_ym),
    excluded_pending_count: excludedPendingCount,
    unverified_bm01_count: unverifiedBm01Count,
    grand_total: summary.reduce((s, x) => s + x.total_allowance, 0),
    summary,
    lines,
  };
}

app.get('/api/allowance', wrap(async (req, res) => {
  const month = (req.query.month ?? 'LATEST').toString().trim();
  const scope = (req.query.scope ?? 'completed').toString().trim();
  res.json(await computeAllowance(month, scope));
}));

app.post('/api/allowance/lock', requireRoles('ADMIN'), wrap(async (req, res) => {
  const monthYm = String(req.body.month || '').trim();
  const scope = String(req.body.scope || 'completed').trim();
  const notes = String(req.body.notes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(monthYm)) {
    return res.status(400).json({ error: 'Vui lòng chọn 1 tháng cụ thể (YYYY-MM) để chốt & khóa kỳ.' });
  }
  const existing = await dbGet('SELECT * FROM allowance_locks WHERE month_ym = ?', [monthYm]);
  if (existing) {
    return res.status(409).json({ error: `Kỳ ${monthYm} đã được khóa trước đó bởi ${existing.locked_by}.` });
  }
  const report = await computeAllowance(monthYm, scope);
  const uniqueOrders = new Set(report.lines.map(l => l.invoice_no)).size;
  const lockedAt = getVnDateTime();
  await dbRun(
    `INSERT INTO allowance_locks (month_ym, locked_by, locked_at, grand_total, order_count, snapshot_json, notes) VALUES (?,?,?,?,?,?,?)`,
    [monthYm, req.user.full_name, lockedAt, report.grand_total, uniqueOrders, JSON.stringify({ scope, summary: report.summary }), notes]
  );
  await logAudit(req, 'LOCK_ALLOWANCE_PERIOD', 'ALLOWANCE', monthYm, `Chốt & khóa kỳ phụ cấp ${monthYm}: ${report.grand_total.toLocaleString('vi-VN')}đ (${uniqueOrders} đơn)`, null, {
    month_ym: monthYm, grand_total: report.grand_total, order_count: uniqueOrders, notes
  });
  res.json({ ok: true, month_ym: monthYm, locked_by: req.user.full_name, locked_at: lockedAt, grand_total: report.grand_total });
}));

app.delete('/api/allowance/lock/:monthYm', requireRoles('ADMIN'), wrap(async (req, res) => {
  const monthYm = String(req.params.monthYm || '').trim();
  const reason = String(req.body?.reason || req.query?.reason || 'Admin mở khóa điều chỉnh').trim();
  const existing = await dbGet('SELECT * FROM allowance_locks WHERE month_ym = ?', [monthYm]);
  if (!existing) return res.status(404).json({ error: `Kỳ ${monthYm} chưa bị khóa.` });
  await dbRun('DELETE FROM allowance_locks WHERE month_ym = ?', [monthYm]);
  await logAudit(req, 'UNLOCK_ALLOWANCE_PERIOD', 'ALLOWANCE', monthYm, `Mở khóa kỳ phụ cấp ${monthYm} — Lý do: ${reason}`, {
    locked_by: existing.locked_by, locked_at: existing.locked_at, grand_total: existing.grand_total
  }, { unlocked: true, reason });
  res.json({ ok: true });
}));

app.get('/api/allowance/export', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const month = (req.query.month ?? 'LATEST').toString().trim();
  const scope = (req.query.scope ?? 'completed').toString().trim();
  const data = await computeAllowance(month, scope);
  const wb = XLSX.utils.book_new();
  const wsSum = XLSX.utils.json_to_sheet(data.summary.map(s => ({
    'Mã NV (ID)': s.ktv_code || '',
    'Kỹ Thuật Viên': s.ktv_name,
    'Số đơn hàng': s.order_count,
    'Tổng Phụ Cấp (VND)': s.total_allowance,
  })));
  const wsDet = XLSX.utils.json_to_sheet(data.lines.map(l => ({
    'Ngày': l.date, 'Mã hóa đơn': l.invoice_no, 'Khách hàng': l.customer_name,
    'Trạng thái ĐH': l.order_status, 'Mã BM-01': l.bm01_doc_no || '', 'Đối soát BM-01': l.bm01_status,
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
  res.setHeader('Content-Disposition', `attachment; filename="Benom_Phu_Cap_KTV_${data.month || 'ALL'}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}));

// ─── 6. WAREHOUSE SLIPS (NK / XK, PAGINATED) & CUT-OFF CHECK ──
app.get('/api/slips', wrap(async (req, res) => {
  const type = (req.query.type || '').trim();
  const limit = Math.max(1, Math.min(150, Number(req.query.limit) || 40));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const where = type ? ` WHERE slip_type = ?` : '';
  const params = type ? [type] : [];

  const [countRow, slips] = await Promise.all([
    dbGet(`SELECT COUNT(*) as c FROM warehouse_slips${where}`, params),
    dbAll(`SELECT * FROM warehouse_slips${where} ORDER BY slip_date DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
  ]);
  res.setHeader('X-Total-Count', String(countRow?.c || slips.length));

  const slipIds = slips.map(s => s.id);
  const allItems = await batchQueryByIds(`SELECT id, slip_id, barcode, product_name, unit, qty, actual_qty, note FROM warehouse_slip_items WHERE slip_id IN`, slipIds);
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
    slipNo, slipType, b.slip_date || getVnIsoDate(),
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
  const { status, cancel_reason, notes, items } = req.body;
  const slip = await dbGet('SELECT * FROM warehouse_slips WHERE id = ?', [id]);
  if (!slip) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
  let warning = slip.cutoff_warning || '';
  if (status === 'Cancelled' && !warning.includes('Đ5.3')) {
    warning = (warning ? warning + ' | ' : '') + 'Lưu ý Đ5.3: Hủy lệnh trễ < 2h trước giờ hẹn bị tính 50% phí xếp dỡ.';
  }
  const nextNotes = notes !== undefined
    ? String(notes)
    : (cancel_reason ? `${slip.notes || ''} [Hủy: ${cancel_reason}]`.trim() : slip.notes);
  await dbRun(
    `UPDATE warehouse_slips SET status=?, cutoff_warning=?, notes=? WHERE id=?`,
    [status || slip.status, warning, nextNotes, id]
  );
  if (Array.isArray(items) && items.length > 0) {
    const batch = items
      .filter(it => it.id)
      .map(it => ({
        sql: `UPDATE warehouse_slip_items SET actual_qty=?, note=COALESCE(?, note) WHERE id=? AND slip_id=?`,
        args: [it.actual_qty !== '' && it.actual_qty !== null && it.actual_qty !== undefined ? num(it.actual_qty) : null, it.note ?? null, it.id, id],
      }));
    if (batch.length > 0) await dbBatch(batch);
  }
  await logAudit(req, status === 'Cancelled' ? 'CANCEL_SLIP' : 'UPDATE_SLIP', 'WAREHOUSE_SLIP', slip.slip_no, `${slip.slip_no}: ${slip.status} → ${status || slip.status}${cancel_reason ? ` (${cancel_reason})` : ''}`, { status: slip.status }, { status: status || slip.status });
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

app.post('/api/toannhat/reconcile/export', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const { erp_month = '', sheet_used = '', comparison = [] } = req.body || {};
  if (!Array.isArray(comparison) || comparison.length === 0) {
    return res.status(400).json({ error: 'Không có dữ liệu đối soát để xuất Excel.' });
  }
  const toRow = r => ({
    'Barcode (Chuẩn hóa)': r.barcode,
    'Tên sản phẩm': r.product_name,
    'Tồn ERP 9005': r.erp_9005_qty,
    'Toàn Nhất Hàng Tốt': r.toannhat_good_qty,
    'Toàn Nhất Hàng Hư (R)': r.toannhat_damaged_qty,
    'Tổng Tồn Toàn Nhất': r.toannhat_total_qty,
    'Chênh Lệch (TN - ERP)': r.diff,
    'Kết Luận': r.status,
  });
  const diffRows = comparison.filter(r => r.diff !== 0 || r.toannhat_damaged_qty > 0).map(toRow);
  const allRows = comparison.map(toRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diffRows.length ? diffRows : [{ 'Thông báo': '100% mã hàng khớp tồn & không có hàng hư hỏng' }]), 'Ma_Lech_Va_Hu_Hong');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), 'Toan_Bo_Doi_Soat');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const tag = erp_month || getVnIsoDate();
  res.setHeader('Content-Disposition', `attachment; filename="Bien_Ban_Doi_Soat_Toan_Nhat_9005_${tag}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
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

  const vnToday = new Date(getVnIsoDate() + 'T00:00:00Z');
  res.json(rows.map(r => {
    let daysLeft = 0;
    let status = 'Không bảo hành';
    if (r.warranty_months > 0 && r.handover_date) {
      const start = new Date(r.handover_date + 'T00:00:00Z');
      const exp = new Date(start);
      exp.setUTCMonth(exp.getUTCMonth() + r.warranty_months);
      daysLeft = Math.ceil((exp - vnToday) / (1000 * 60 * 60 * 24));
      status = daysLeft >= 0 ? 'Còn bảo hành' : 'Hết hạn bảo hành';
    }
    return { ...r, days_left: daysLeft, warranty_status: status };
  }));
}));

// Lightweight badge counts for WarrantyQcView so only active sub-tab loads rows
app.get('/api/warranty/counts', wrap(async (req, res) => {
  const cached = getServerCache('warranty:counts');
  if (cached) return res.json(cached);
  const [w, b3, b4, qc, sup] = await Promise.all([
    dbGet('SELECT COUNT(*) as c FROM warranty_tickets'),
    dbGet('SELECT COUNT(*) as c FROM bm03_inspections'),
    dbGet('SELECT COUNT(*) as c FROM bm04_incidents'),
    dbGet(`SELECT COALESCE(SUM(defective_qty), 0) as u FROM qc_factory_returns WHERE status != 'Closed'`),
    dbGet('SELECT COALESCE(SUM(hours), 0) as h FROM support_logs'),
  ]);
  res.json(setServerCache('warranty:counts', {
    warranty: w?.c || 0,
    bm03: b3?.c || 0,
    bm04: b4?.c || 0,
    qc_units: qc?.u || 0,
    support_hours: Number((sup?.h || 0).toFixed(1)),
  }, 30000));
}));

app.get('/api/warranty', wrap(async (req, res) => {
  res.json(await dbAll('SELECT * FROM warranty_tickets ORDER BY id DESC'));
}));

app.post('/api/warranty', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const ticketNo = await nextTicketNo();
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
    getVnDateTime(2), getVnDateTime(24), getVnDateTime(resolveHrs)
  ]);
  res.json({ id: r.lastInsertRowid, ticket_no: ticketNo });
}));

app.put('/api/warranty/:id', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const existing = await dbGet('SELECT * FROM warranty_tickets WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Ticket bảo hành' });

  const nowVn = getVnDateTime();
  const nextStatus = b.status || existing.status;
  const respondedAt = existing.responded_at || (nextStatus !== 'New' ? nowVn : '');
  const resolvedAt = existing.resolved_at || (['Resolved', 'Closed'].includes(nextStatus) ? nowVn : '');

  await dbRun(
    `UPDATE warranty_tickets SET status=?, service_level=?, ktv_assigned=?, resolution_note=?, bm03_no=?, bm04_no=?, responded_at=?, resolved_at=? WHERE id=?`,
    [nextStatus, b.service_level || existing.service_level, b.ktv_assigned ?? existing.ktv_assigned, b.resolution_note ?? existing.resolution_note, b.bm03_no ?? existing.bm03_no, b.bm04_no ?? existing.bm04_no, respondedAt, resolvedAt, req.params.id]
  );
  res.json({ ok: true, responded_at: respondedAt, resolved_at: resolvedAt });
}));

app.get('/api/qc-returns', wrap(async (req, res) => {
  res.json(await dbAll('SELECT * FROM qc_factory_returns ORDER BY id DESC'));
}));

app.post('/api/qc-returns', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  if (!b.supplier_name || !b.product_name) {
    return res.status(400).json({ error: 'Vui lòng nhập Nhà cung cấp và Tên sản phẩm.' });
  }
  const defQty = num(b.defective_qty);
  const soldQty = num(b.sold_qty);
  const stockQty = num(b.stock_qty);
  const denom = soldQty + stockQty + defQty;
  const calcRate = num(b.defect_rate) || (denom > 0 ? Number(((defQty / denom) * 100).toFixed(1)) : 0);
  const r = await dbRun(`
    INSERT INTO qc_factory_returns (supplier_name, barcode, product_name, defect_category, issue, defective_qty, sold_qty, stock_qty, defect_rate, action, est_out, est_in, ref_xk_no, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    b.supplier_name, b.barcode || '', b.product_name, b.defect_category || 'Khác', b.issue || '', defQty,
    soldQty, stockQty, calcRate, b.action || 'Back to factory',
    b.est_out || 'TBU', b.est_in || 'TBU', b.ref_xk_no || '', b.status || 'Open'
  ]);
  await logAudit(req, 'CREATE_QC_RETURN', 'QC_RETURN', r.lastInsertRowid, `Ghi nhận QC lỗi: ${b.supplier_name} — ${b.product_name} (SL: ${defQty}, nhóm: ${b.defect_category || 'Khác'})`);
  res.json({ id: r.lastInsertRowid, defect_rate: calcRate, ok: true });
}));

app.put('/api/qc-returns/:id', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const b = req.body;
  const existing = await dbGet('SELECT * FROM qc_factory_returns WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy dòng QC' });
  await dbRun(
    `UPDATE qc_factory_returns SET status=?, defect_category=?, issue=?, est_out=?, est_in=?, ref_xk_no=?, ref_nk_no=? WHERE id=?`,
    [
      b.status ?? existing.status,
      b.defect_category ?? existing.defect_category ?? 'Khác',
      b.issue ?? existing.issue,
      b.est_out ?? existing.est_out,
      b.est_in ?? existing.est_in,
      b.ref_xk_no ?? existing.ref_xk_no,
      b.ref_nk_no ?? existing.ref_nk_no,
      req.params.id
    ]
  );
  await logAudit(req, 'UPDATE_QC_RETURN', 'QC_RETURN', req.params.id, `Cập nhật QC ${existing.product_name}: ${existing.status} → ${b.status ?? existing.status}`);
  res.json({ ok: true });
}));

app.post('/api/qc-returns/:id/generate-slip', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const q = await dbGet('SELECT * FROM qc_factory_returns WHERE id = ?', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Không tìm thấy bản ghi QC trả xưởng' });
  const slipType = req.body?.slip_type === 'NK' ? 'NK' : 'XK';
  const slipNo = await nextSlipNo(slipType);
  const today = getVnIsoDate();
  const expDate = req.body?.expected_date || getVnIsoDate(1);
  const expTime = req.body?.expected_time || '09:00';
  const warning = evaluateToanNhatCutoff(expDate, expTime);
  const purpose = slipType === 'XK' ? `Trả NCC / QC (${q.supplier_name})` : `Nhập lại hàng QC từ xưởng (${q.supplier_name})`;
  const notes = `[QC #${q.id}] ${q.defect_category || ''} — ${q.issue || ''}`.trim();

  const r = await dbRun(`
    INSERT INTO warehouse_slips (slip_no, slip_type, slip_date, expected_date, expected_time, created_by, partner_name, carrier, warehouse_code, purpose, status, cutoff_warning, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [slipNo, slipType, today, expDate, expTime, req.user.full_name, q.supplier_name, 'Xe xưởng NCC', '9005', purpose, 'Sent', warning, notes]);
  const sid = r.lastInsertRowid;
  await dbRun(
    `INSERT INTO warehouse_slip_items (slip_id, barcode, product_name, unit, qty, note) VALUES (?,?,?,?,?,?)`,
    [sid, q.barcode || '', q.product_name, 'Cái', Math.max(1, num(q.defective_qty)), q.issue || '']
  );

  if (slipType === 'XK') {
    await dbRun(`UPDATE qc_factory_returns SET ref_xk_no=?, status=CASE WHEN status='Open' THEN 'Sent to Factory' ELSE status END WHERE id=?`, [slipNo, q.id]);
  } else {
    await dbRun(`UPDATE qc_factory_returns SET ref_nk_no=?, status=CASE WHEN status IN ('Open','Sent to Factory') THEN 'Returned' ELSE status END WHERE id=?`, [slipNo, q.id]);
  }
  await logAudit(req, 'QC_GENERATE_SLIP', 'QC_RETURN', q.id, `Tạo phiếu ${slipNo} cho lô QC ${q.product_name} (${q.supplier_name}, SL: ${q.defective_qty})`);
  res.json({ ok: true, slip_id: sid, slip_no: slipNo, slip_type: slipType, cutoff_warning: warning });
}));

// ─── 8B. BM-03 (INSPECTION & RETURN) & BM-04 (3PL INCIDENT/CLAIM) ───
app.get('/api/bm03', wrap(async (req, res) => {
  const rows = await dbAll(`
    SELECT id, doc_no, doc_date, ticket_id, ticket_no, invoice_no, handover_no, location,
           tech_name, wh_rep, customer_name, customer_phone, barcode, product_name, qty,
           receive_date, packaging_state, damage_types_json, damage_other, root_cause,
           customer_resolution, replacement_code, appointment_date, refund_amount,
           warehouse_disposition, inv_adj_code, status, created_at,
           CASE WHEN signature_data != '' THEN 1 ELSE 0 END as has_signature,
           CASE WHEN photos_json != '' AND photos_json != '[]' THEN 1 ELSE 0 END as has_photos
    FROM bm03_inspections ORDER BY id DESC LIMIT 100
  `);
  res.json(rows);
}));

app.get('/api/bm03/:id', wrap(async (req, res) => {
  const row = await dbGet('SELECT * FROM bm03_inspections WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy biên bản BM-03' });
  res.json(row);
}));

app.post('/api/bm03', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const docNo = await nextBm03No();
  const r = await dbRun(`
    INSERT INTO bm03_inspections (
      doc_no, doc_date, ticket_id, ticket_no, invoice_no, handover_no, location,
      tech_name, wh_rep, customer_name, customer_phone, barcode, product_name, qty,
      receive_date, packaging_state, damage_types_json, damage_other, root_cause,
      customer_resolution, replacement_code, appointment_date, refund_amount,
      warehouse_disposition, inv_adj_code, photos_json, signature_data, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    docNo, b.doc_date || getVnIsoDate(), b.ticket_id || null, b.ticket_no || '', b.invoice_no || '', b.handover_no || '',
    b.location || 'Nhà khách hàng', b.tech_name || req.user.full_name, b.wh_rep || '',
    b.customer_name || '', b.customer_phone || '', b.barcode || '', b.product_name || '', num(b.qty) || 1,
    b.receive_date || '', b.packaging_state || 'Bao bì gốc',
    JSON.stringify(Array.isArray(b.damage_types) ? b.damage_types : []),
    b.damage_other || '', b.root_cause || 'Lỗi NSX/NCC',
    b.customer_resolution || 'Đổi mới 1-1', b.replacement_code || '', b.appointment_date || '', num(b.refund_amount),
    b.warehouse_disposition || 'Nhập DC 9005 claim NCC', b.inv_adj_code || '',
    b.photos_json || '[]', b.signature_data || '', b.status || 'Open'
  ]);
  if (b.ticket_id) {
    await dbRun('UPDATE warranty_tickets SET bm03_no = ? WHERE id = ?', [docNo, b.ticket_id]);
  } else if (b.ticket_no) {
    await dbRun('UPDATE warranty_tickets SET bm03_no = ? WHERE ticket_no = ?', [docNo, b.ticket_no]);
  }
  await logAudit(req, 'CREATE_BM03', 'BM03', docNo, `Lập BM-03 ${docNo} cho ${b.product_name} (${b.customer_name}) — ${b.customer_resolution}`);
  res.json({ id: r.lastInsertRowid, doc_no: docNo, ok: true });
}));

app.put('/api/bm03/:id', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const ex = await dbGet('SELECT * FROM bm03_inspections WHERE id = ?', [req.params.id]);
  if (!ex) return res.status(404).json({ error: 'Không tìm thấy biên bản BM-03' });
  await dbRun(`
    UPDATE bm03_inspections SET
      doc_date=?, location=?, tech_name=?, wh_rep=?, customer_name=?, customer_phone=?,
      barcode=?, product_name=?, qty=?, receive_date=?, packaging_state=?,
      damage_types_json=?, damage_other=?, root_cause=?, customer_resolution=?,
      replacement_code=?, appointment_date=?, refund_amount=?, warehouse_disposition=?,
      inv_adj_code=?, photos_json=?, signature_data=?, status=?
    WHERE id=?
  `, [
    b.doc_date ?? ex.doc_date, b.location ?? ex.location, b.tech_name ?? ex.tech_name, b.wh_rep ?? ex.wh_rep,
    b.customer_name ?? ex.customer_name, b.customer_phone ?? ex.customer_phone,
    b.barcode ?? ex.barcode, b.product_name ?? ex.product_name, b.qty !== undefined ? num(b.qty) : ex.qty,
    b.receive_date ?? ex.receive_date, b.packaging_state ?? ex.packaging_state,
    Array.isArray(b.damage_types) ? JSON.stringify(b.damage_types) : (b.damage_types_json ?? ex.damage_types_json),
    b.damage_other ?? ex.damage_other, b.root_cause ?? ex.root_cause,
    b.customer_resolution ?? ex.customer_resolution, b.replacement_code ?? ex.replacement_code,
    b.appointment_date ?? ex.appointment_date, b.refund_amount !== undefined ? num(b.refund_amount) : ex.refund_amount,
    b.warehouse_disposition ?? ex.warehouse_disposition, b.inv_adj_code ?? ex.inv_adj_code,
    b.photos_json ?? ex.photos_json, b.signature_data ?? ex.signature_data, b.status ?? ex.status,
    req.params.id
  ]);
  await logAudit(req, 'UPDATE_BM03', 'BM03', ex.doc_no, `Cập nhật BM-03 ${ex.doc_no}: status=${b.status ?? ex.status}, kho=${b.warehouse_disposition ?? ex.warehouse_disposition}`);
  res.json({ ok: true });
}));

app.get('/api/bm04', wrap(async (req, res) => {
  const rows = await dbAll(`
    SELECT id, doc_no, doc_date, location, ticket_id, ticket_no, invoice_no, carrier, awb_no, route,
           vehicle_plate, driver_name, driver_phone, driver_cccd, packaging_checks_json,
           evidence_checks_json, cause_assessment, items_json, goods_disposition,
           claim_amount, claim_deadline_at, claim_status, notes, created_at,
           CASE WHEN driver_signature_data != '' THEN 1 ELSE 0 END as has_signature,
           CASE WHEN photos_json != '' AND photos_json != '[]' THEN 1 ELSE 0 END as has_photos
    FROM bm04_incidents ORDER BY id DESC LIMIT 100
  `);
  res.json(rows);
}));

app.get('/api/bm04/:id', wrap(async (req, res) => {
  const row = await dbGet('SELECT * FROM bm04_incidents WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy biên bản BM-04' });
  res.json(row);
}));

app.post('/api/bm04', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const docNo = await nextBm04No();
  const claimDeadline = getVnDateTime(48); // SOP: phản hồi đền bù trong 48h
  const r = await dbRun(`
    INSERT INTO bm04_incidents (
      doc_no, doc_date, location, ticket_id, ticket_no, invoice_no, carrier, awb_no, route,
      vehicle_plate, driver_name, driver_phone, driver_cccd, packaging_checks_json,
      evidence_checks_json, cause_assessment, items_json, goods_disposition,
      claim_amount, claim_deadline_at, claim_status, photos_json, driver_signature_data, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    docNo, b.doc_date || getVnIsoDate(), b.location || 'Kho DC 9005',
    b.ticket_id || null, b.ticket_no || '', b.invoice_no || '',
    b.carrier || 'Ahamove', b.awb_no || '', b.route || '',
    b.vehicle_plate || '', b.driver_name || '', b.driver_phone || '', b.driver_cccd || '',
    JSON.stringify(Array.isArray(b.packaging_checks) ? b.packaging_checks : []),
    JSON.stringify(Array.isArray(b.evidence_checks) ? b.evidence_checks : []),
    b.cause_assessment || 'Chằng buộc sai quy cách/va đập',
    JSON.stringify(Array.isArray(b.items) ? b.items : []),
    b.goods_disposition || 'Tạm giữ tại DC 9005 cách ly',
    num(b.claim_amount), claimDeadline, b.claim_status || 'Open',
    b.photos_json || '[]', b.driver_signature_data || '', b.notes || ''
  ]);
  if (b.ticket_id) {
    await dbRun('UPDATE warranty_tickets SET bm04_no = ? WHERE id = ?', [docNo, b.ticket_id]);
  } else if (b.ticket_no) {
    await dbRun('UPDATE warranty_tickets SET bm04_no = ? WHERE ticket_no = ?', [docNo, b.ticket_no]);
  }
  await logAudit(req, 'CREATE_BM04', 'BM04', docNo, `Lập BM-04 ${docNo} claim 3PL ${b.carrier || ''} — ĐH ${b.invoice_no || '—'} (${num(b.claim_amount).toLocaleString('vi-VN')}đ)`);
  res.json({ id: r.lastInsertRowid, doc_no: docNo, claim_deadline_at: claimDeadline, ok: true });
}));

app.put('/api/bm04/:id', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const ex = await dbGet('SELECT * FROM bm04_incidents WHERE id = ?', [req.params.id]);
  if (!ex) return res.status(404).json({ error: 'Không tìm thấy biên bản BM-04' });
  await dbRun(`
    UPDATE bm04_incidents SET
      doc_date=?, location=?, invoice_no=?, carrier=?, awb_no=?, route=?,
      vehicle_plate=?, driver_name=?, driver_phone=?, driver_cccd=?,
      packaging_checks_json=?, evidence_checks_json=?, cause_assessment=?,
      items_json=?, goods_disposition=?, claim_amount=?, claim_status=?,
      photos_json=?, driver_signature_data=?, notes=?
    WHERE id=?
  `, [
    b.doc_date ?? ex.doc_date, b.location ?? ex.location, b.invoice_no ?? ex.invoice_no,
    b.carrier ?? ex.carrier, b.awb_no ?? ex.awb_no, b.route ?? ex.route,
    b.vehicle_plate ?? ex.vehicle_plate, b.driver_name ?? ex.driver_name,
    b.driver_phone ?? ex.driver_phone, b.driver_cccd ?? ex.driver_cccd,
    Array.isArray(b.packaging_checks) ? JSON.stringify(b.packaging_checks) : (b.packaging_checks_json ?? ex.packaging_checks_json),
    Array.isArray(b.evidence_checks) ? JSON.stringify(b.evidence_checks) : (b.evidence_checks_json ?? ex.evidence_checks_json),
    b.cause_assessment ?? ex.cause_assessment,
    Array.isArray(b.items) ? JSON.stringify(b.items) : (b.items_json ?? ex.items_json),
    b.goods_disposition ?? ex.goods_disposition,
    b.claim_amount !== undefined ? num(b.claim_amount) : ex.claim_amount,
    b.claim_status ?? ex.claim_status,
    b.photos_json ?? ex.photos_json,
    b.driver_signature_data ?? ex.driver_signature_data,
    b.notes ?? ex.notes,
    req.params.id
  ]);
  await logAudit(req, 'UPDATE_BM04', 'BM04', ex.doc_no, `Cập nhật BM-04 ${ex.doc_no}: claim=${b.claim_status ?? ex.claim_status}, giá trị=${(b.claim_amount !== undefined ? num(b.claim_amount) : ex.claim_amount).toLocaleString('vi-VN')}đ`);
  res.json({ ok: true });
}));

// ─── 8C. AUDIT TRAIL LOGS (GOVERNANCE / ACC) ──────────────────
app.get('/api/audit-logs', wrap(async (req, res) => {
  const entityType = String(req.query.entity_type || '').trim();
  const q = String(req.query.q || '').trim();
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (entityType) {
    sql += ' AND entity_type = ?';
    params.push(entityType);
  }
  if (q) {
    sql += ' AND (summary LIKE ? OR entity_id LIKE ? OR user_name LIKE ? OR action LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY id DESC LIMIT ${limit}`;
  res.json(await dbAll(sql, params));
}));

app.get('/api/support-logs', wrap(async (req, res) => {
  res.json(await dbAll('SELECT * FROM support_logs ORDER BY log_date DESC, id DESC'));
}));

app.post('/api/support-logs', requireRoles('ADMIN', 'EDITOR', 'KTV'), wrap(async (req, res) => {
  const b = req.body;
  const r = await dbRun(`INSERT INTO support_logs (log_date, staff_name, category, location, hours, notes) VALUES (?,?,?,?,?,?)`,
    [b.log_date || getVnIsoDate(), b.staff_name || req.user.full_name, b.category, b.location || '', num(b.hours), b.notes || '']);
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
      ? (available_months[0] || getVnYearMonth())
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

  // Annotate linked dispatch orders (TASK-08 2-way integration)
  const slipNos = rows.map(r => r.slip_no).filter(Boolean);
  const linkedOrders = await batchQueryByIds(`SELECT id, invoice_no, status, require_install FROM orders WHERE invoice_no IN`, slipNos);
  const orderBySlip = new Map();
  for (const lo of linkedOrders) {
    orderBySlip.set(lo.invoice_no, lo);
  }
  const enrichedRows = rows.map(r => {
    const lo = orderBySlip.get(r.slip_no);
    return {
      ...r,
      linked_order_id: lo?.id || null,
      linked_order_status: lo?.status || '',
      linked_require_install: lo?.require_install || 0,
    };
  });

  return { month: effectiveMonth, available_months, pivot, grand_total, rows: enrichedRows };
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

app.post('/api/delivery-tracking/:slipNo/push-to-order', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const slipNo = String(req.params.slipNo || '').trim();
  const existingOrder = await dbGet(`SELECT id, status FROM orders WHERE invoice_no = ? ORDER BY id DESC LIMIT 1`, [slipNo]);
  if (existingOrder) {
    return res.json({ ok: true, existed: true, order_id: existingOrder.id, status: existingOrder.status });
  }
  const dt = await dbGet(`SELECT * FROM delivery_tracking WHERE slip_no = ?`, [slipNo]);
  const pos = await dbGet(`SELECT * FROM pos_slips WHERE slip_no = ?`, [slipNo]);
  const src = dt || pos;
  if (!src) return res.status(404).json({ error: `Không tìm thấy hóa đơn POS ${slipNo}` });

  const custPayTotal = num(src.delivery_cust_pay) + num(src.install_cust_pay);
  const reqInstall = num(src.install_cust_pay) > 0 ? 1 : 0;
  const isFree = num(src.delivery_cust_pay) === 0 ? 1 : 0;
  const r = await dbRun(`
    INSERT INTO orders (
      invoice_no, order_date, delivery_date, customer_name, customer_phone, address, region,
      distance_km, carrier, tracking_no, source_warehouse, shipping_fee_3pl, customer_paid_fee,
      is_promo_free_ship, require_install, is_stairs, ktvs_json, status, install_status, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    slipNo,
    src.sales_day || getVnIsoDate(),
    '',
    req.body?.customer_name || `Khách POS ${slipNo}`,
    req.body?.customer_phone || '',
    req.body?.address || '',
    dt?.area || 'HCM',
    0,
    dt?.carrier_3pl || 'Ahamove',
    '',
    '9005',
    num(dt?.fee_3pl),
    custPayTotal,
    isFree,
    reqInstall,
    0,
    '[]',
    'New',
    reqInstall ? 'Chờ lắp đặt' : '',
    [dt?.note, src.items_summary ? `POS: ${src.items_summary}` : ''].filter(Boolean).join(' | '),
  ]);
  const oid = r.lastInsertRowid;

  // Parse items_summary e.g. "Bàn Noma (x1), Ghế Cheri (x2)" and match against Master Data when possible
  const rawSummary = String(src.items_summary || '').replace(/\s*\(\+\d+\)$/, '').trim();
  const parsedEntries = rawSummary
    ? rawSummary.split(/,\s*/).map(chunk => {
        const m = chunk.match(/^(.+?)\s*\(x([\d.]+)\)$/i);
        return { name: (m ? m[1] : chunk).trim(), qty: m ? num(m[2]) || 1 : 1 };
      }).filter(x => x.name)
    : [];

  for (const it of parsedEntries) {
    const prod = await dbGet(`SELECT * FROM products WHERE LOWER(name_vn) = LOWER(?) OR name_vn LIKE ? LIMIT 1`, [it.name, `%${it.name}%`]);
    await dbRun(`
      INSERT INTO order_items (order_id, barcode, product_name, unit, qty, net_weight_g, warranty_months, warranty_policy, p_handling_unit, p_installation_unit)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      oid, prod?.barcode || '', prod?.name_vn || it.name, prod?.unit || 'Cái', it.qty,
      prod?.net_weight_g || 0, prod?.warranty_months || 0, prod?.warranty_policy || 'Không bảo hành',
      prod ? prod.p_handling : 15000, prod ? prod.p_installation : 0,
    ]);
  }

  res.json({ ok: true, existed: false, order_id: oid, items_created: parsedEntries.length });
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
  const salesMonth = b.sales_month || pos?.sales_month || getVnYearMonth();
  const salesDay = b.sales_day || pos?.sales_day || getVnIsoDate();

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
  const before = await dbGet('SELECT carrier_3pl, fee_3pl, area, note FROM delivery_tracking WHERE slip_no = ?', [slipNo]);
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
  // 2-way sync carrier & 3PL fee back to orders if linked
  await dbRun(`
    UPDATE orders
    SET carrier = CASE WHEN ? != '' THEN ? ELSE carrier END,
        shipping_fee_3pl = CASE WHEN ? > 0 THEN ? ELSE shipping_fee_3pl END,
        region = CASE WHEN ? != '' THEN ? ELSE region END
    WHERE invoice_no = ?
  `, [b.carrier_3pl ?? '', b.carrier_3pl ?? '', num(b.fee_3pl), num(b.fee_3pl), b.area ?? '', b.area ?? '', slipNo]);
  await logAudit(req, 'UPDATE_3PL_FEE', 'DELIVERY_3PL', slipNo, `Sửa 3PL ${slipNo}: ${b.carrier_3pl || '—'} (${num(b.fee_3pl).toLocaleString('vi-VN')}đ)`, before, {
    carrier_3pl: b.carrier_3pl ?? '', fee_3pl: num(b.fee_3pl), area: b.area ?? 'HCM'
  });
  res.json({ ok: true });
}));

app.delete('/api/delivery-tracking/:slipNo', requireRoles('ADMIN', 'EDITOR'), wrap(async (req, res) => {
  const before = await dbGet('SELECT slip_no, carrier_3pl, fee_3pl, net_sales_excl_tax FROM delivery_tracking WHERE slip_no = ?', [req.params.slipNo]);
  await dbRun(`DELETE FROM delivery_tracking WHERE slip_no = ?`, [req.params.slipNo]);
  await logAudit(req, 'DELETE_3PL_ROW', 'DELIVERY_3PL', req.params.slipNo, `Xóa hóa đơn ${req.params.slipNo} khỏi báo cáo 3PL`, before, null);
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

// Serve built frontend in production with in-memory gzip & immutable long-term asset caching
if (fs.existsSync(DIST_DIR)) {
  const gzStaticCache = new Map();
  const MIME_BY_EXT = {
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  const sendGzippedFile = (req, res, filePath, isImmutable) => {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime || !/\bgzip\b/i.test(req.headers['accept-encoding'] || '')) return false;
    try {
      const stat = fs.statSync(filePath);
      const cacheKey = `${filePath}:${stat.mtimeMs}`;
      let gz = gzStaticCache.get(cacheKey);
      if (!gz) {
        gz = zlib.gzipSync(fs.readFileSync(filePath), { level: 9 });
        gzStaticCache.set(cacheKey, gz);
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Control', isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.setHeader('Content-Length', String(gz.length));
      res.end(gz);
      return true;
    } catch {
      return false;
    }
  };

  app.get('/assets/*', (req, res, next) => {
    const rel = path.normalize(req.path).replace(/^([/\\])+/, '');
    const full = path.join(DIST_DIR, rel);
    if (full.startsWith(DIST_DIR) && fs.existsSync(full) && sendGzippedFile(req, res, full, true)) return;
    next();
  });

  app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      const indexPath = path.join(DIST_DIR, 'index.html');
      if (sendGzippedFile(req, res, indexPath, false)) return;
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexPath);
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
