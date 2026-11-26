import crypto from 'node:crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || 'benom-ops-hub-local-secret-2026-kohnan-vn';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const USER_CACHE_TTL_MS = 30 * 1000; // 30s cache to minimize Turso reads while enforcing revocation

if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  console.warn('[Auth WARNING] AUTH_SECRET is not set in production! Configure AUTH_SECRET in Render environment variables.');
}

let _userLoader = null;
const _userCache = new Map();

export function setAuthUserLoader(loaderFn) {
  _userLoader = loaderFn;
}

export function invalidateAuthCache(userId = null) {
  if (userId === null || userId === undefined) {
    _userCache.clear();
  } else {
    _userCache.delete(Number(userId));
  }
}

function passwordVersion(passwordHash) {
  if (!passwordHash || !passwordHash.includes(':')) return '';
  return passwordHash.split(':')[0].slice(0, 16);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, keyHex] = stored.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signToken(user) {
  const payload = {
    id: Number(user.id),
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    pwd_v: passwordVersion(user.password_hash),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractToken(req) {
  const hdr = req.headers.authorization || '';
  if (hdr.startsWith('Bearer ')) return hdr.slice(7).trim();
  return '';
}

async function getLiveUser(userId) {
  if (!_userLoader) return null;
  const id = Number(userId);
  const cached = _userCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  const user = await _userLoader(id);
  _userCache.set(id, { user: user || null, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return user || null;
}

export async function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(extractToken(req));
    if (!payload) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    if (_userLoader) {
      const liveUser = await getLiveUser(payload.id);
      if (!liveUser || !liveUser.active) {
        return res.status(401).json({ error: 'Tài khoản đã bị khóa hoặc không còn tồn tại.' });
      }
      // Revoke old tokens automatically if password was changed/reset
      if (payload.pwd_v && passwordVersion(liveUser.password_hash) !== payload.pwd_v) {
        return res.status(401).json({ error: 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.' });
      }
      req.user = {
        id: Number(liveUser.id),
        email: liveUser.email,
        full_name: liveUser.full_name,
        role: liveUser.role,
        department: liveUser.department,
      };
    } else {
      req.user = payload;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Chưa đăng nhập.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Tài khoản (${req.user.role}) không có quyền thực hiện thao tác này. Liên hệ Admin để cấp quyền.`,
      });
    }
    next();
  };
}
