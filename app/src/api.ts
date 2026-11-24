const TOKEN_KEY = 'benom_ops_token';

export function getAuthToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function apiGet<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event('benom-auth-expired'));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Lỗi tải dữ liệu');
  }
  return res.json();
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
  return data;
}

export function fmtVnd(v: number | string | null | undefined): string {
  const n = Number(v || 0);
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
}

export function fmtNum(v: number | string | null | undefined): string {
  return new Intl.NumberFormat('vi-VN').format(Number(v || 0));
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
  | { type: 'WARRANTY'; data: any };
