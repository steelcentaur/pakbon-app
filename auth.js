// Eenvoudige login met één wachtwoord (secret APP_PASSWORD).
// De sessie is een ondertekende cookie; er wordt niets op de server bewaard.
const crypto = require('crypto');

const COOKIE = 'pakbon_sessie';
const MAX_AGE_DAYS = 30;

function secret() {
  return process.env.SESSION_SECRET || `pakbon:${process.env.APP_PASSWORD || ''}`;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function makeToken() {
  const expires = Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const value = `ok.${expires}`;
  return `${value}.${sign(value)}`;
}

function validToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const value = `${parts[0]}.${parts[1]}`;
  const expected = sign(value);
  if (expected.length !== parts[2].length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return false;
  return Number(parts[1]) > Date.now();
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function passwordMatches(input) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function setSession(res, req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE}=${encodeURIComponent(makeToken())}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function isLoggedIn(req) {
  return validToken(readCookie(req, COOKIE));
}

// Middleware: alles achter de login, behalve de opgegeven openbare paden.
function requireLogin(publicPaths) {
  return (req, res, next) => {
    if (publicPaths.some((p) => req.path === p || req.path.startsWith(p + '/'))) return next();
    if (isLoggedIn(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Niet ingelogd' });
    return res.redirect('/login');
  };
}

module.exports = { passwordMatches, setSession, clearSession, isLoggedIn, requireLogin };
