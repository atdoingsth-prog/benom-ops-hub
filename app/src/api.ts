const TOKEN_KEY = 'benom_ops_token';
const NUM_FMT = new Intl.NumberFormat('vi-VN');

// In-flight GET coalescing + short TTL client cache (auto-invalidated on mutations)
const _inflightGets = new Map<string, Promise<any>>();
const _clientCache = new Map<string, { exp: number; data: any }>();

export function invalidateApiCache(prefix = '') {
  if (!prefix) {
    _clientCache.clear();
    return;
  }
  for (const k of _clientCache.keys()) {
    if (k.startsWith(prefix)) _clientCache.delete(k);
  }
}

export function getAuthToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  _clientCache.clear();
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  _clientCache.clear();
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function apiGet<T = any>(url: string, opts?: { cacheMs?: number; force?: boolean }): Promise<T> {
  const cacheMs = opts?.cacheMs || 0;
  if (cacheMs > 0 && !opts?.force) {
    const hit = _clientCache.get(url);
    if (hit && hit.exp > Date.now()) return hit.data as T;
  }
  const existing = _inflightGets.get(url);
  if (existing) return existing as Promise<T>;

  const req = (async () => {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 401) {
      clearAuthToken();
      window.dispatchEvent(new Event('benom-auth-expired'));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Lỗi tải dữ liệu');
    }
    const data = await res.json();
    if (cacheMs > 0) {
      _clientCache.set(url, { exp: Date.now() + cacheMs, data });
    }
    return data as T;
  })();

  _inflightGets.set(url, req);
  try {
    return await req;
  } finally {
    _inflightGets.delete(url);
  }
}

export async function apiGetPage<T = any>(url: string): Promise<{ data: T[]; total: number }> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event('benom-auth-expired'));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Lỗi tải dữ liệu');
  }
  const data = await res.json();
  const totalHeader = Number(res.headers.get('X-Total-Count'));
  const total = Number.isFinite(totalHeader) && totalHeader >= 0 ? totalHeader : (Array.isArray(data) ? data.length : 0);
  return { data: Array.isArray(data) ? data : [], total };
}

export async function apiSend<T = any>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !url.includes('/auth/login')) {
    clearAuthToken();
    window.dispatchEvent(new Event('benom-auth-expired'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi ${res.status}`);
  }
  _clientCache.clear();
  return data;
}

export async function apiUpload<T = any>(url: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: fd });
  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event('benom-auth-expired'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi upload (${res.status})`);
  }
  _clientCache.clear();
  return data;
}

export async function apiDownload(url: string, fallbackFilename: string, postBody?: any): Promise<void> {
  const init: RequestInit = postBody !== undefined
    ? { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(postBody) }
    : { headers: authHeaders() };
  const res = await fetch(url, init);
  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event('benom-auth-expired'));
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Lỗi tải file (${res.status})` }));
    throw new Error(err.error || `Lỗi tải file (${res.status})`);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : fallbackFilename;
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

export function fmtVnd(v: number | string | null | undefined): string {
  const n = Number(v || 0);
  return NUM_FMT.format(Math.round(n)) + ' đ';
}

export function fmtNum(v: number | string | null | undefined): string {
  return NUM_FMT.format(Number(v || 0));
}

export function fmtMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  if (ym.includes('-')) {
    const [y, m] = ym.split('-');
    return `T${m}/${y}`;
  }
  return `T${ym.slice(4, 6)}/${ym.slice(0, 4)}`;
}

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'EDITOR' | 'KTV' | 'VIEWER';
  department?: string;
}

export type PrintDoc =
  | { type: 'HANDOVER'; data: any }
  | { type: 'SLIP'; data: any }
  | { type: 'WARRANTY'; data: any }
  | { type: 'BM03'; data: any }
  | { type: 'BM04'; data: any };

export interface NavIntent {
  nonce?: number;
  subTab?: string;
  // Orders & Handovers ('orders')
  openHandoverId?: number;
  openOrCreateHandoverForOrderId?: number;
  openOrCreateHandoverForInvoice?: string;
  preferredDocType?: 'BM-01' | 'BM-05';
  openOrderId?: number;
  openOrderInvoice?: string;
  // Warehouse Slips ('warehouse')
  openSlipId?: number;
  openSlipNo?: string;
  // Warranty & QC ('warranty')
  openTicketNo?: string;
  openBm03No?: string;
  openBm04No?: string;
  // 3PL Report ('delivery3pl')
  open3plSlipNo?: string;
  // Prefill new order from Shipping Quote Calculator
  prefillNewOrder?: {
    source_warehouse?: string;
    region?: string;
    address?: string;
    distance_km?: number;
    carrier?: string;
    shipping_fee_3pl?: number;
    customer_paid_fee?: number;
    require_install?: boolean;
    notes?: string;
    items?: Array<{
      barcode: string;
      product_name: string;
      unit?: string;
      qty: number;
      net_weight_g: number;
      source_warehouse: string;
    }>;
  };
}
