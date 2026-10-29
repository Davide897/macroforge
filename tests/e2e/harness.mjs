// Infraestrutura dos testes e2e: serve a app, troca js/vendor/supabase.js por um Supabase falso em memória
// e abre "aparelhos" (contextos de Chrome headless). Nunca fala com o Supabase real.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(process.argv[2] || path.join(HERE, '..', '..'));
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright-core')); }
catch { ({ chromium } = createRequire(path.join(ROOT, '..', 'macroforge-test', 'package.json'))('playwright-core')); }

// ---------- base de dados falsa (regras da tabela app_state) ----------
export const db = { app_state: [] }, offline = new Set();
const match = (row, f) => f.every(([c, v]) => row[c] === v);
function handle(b) {
  if (b.t !== 'app_state') return { data: b.mode === 'many' ? [] : null, error: null };
  const T = db.app_state;
  const clone = x => JSON.parse(JSON.stringify(x));
  if (b.op === 'select') { const rows = T.filter(r => match(r, b.f)).map(clone); return { data: b.mode === 'many' ? rows : rows[0] || null, error: null }; }
  if (b.op === 'insert') {
    if (T.some(r => r.user_id === b.row.user_id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
    T.push(clone(b.row)); return { data: b.ret ? [clone(b.row)] : null, error: null };
  }
  if (b.op === 'upsert') {
    const i = T.findIndex(r => r.user_id === b.row.user_id);
    if (i >= 0) T[i] = clone(b.row); else T.push(clone(b.row));
    return { data: null, error: null };
  }
  if (b.op === 'update') {
    const rows = T.filter(r => match(r, b.f)); rows.forEach(r => Object.assign(r, clone(b.row)));
    return { data: b.ret ? rows.map(clone) : null, error: null };
  }
  return { data: null, error: null };
}

// ---------- servidor de ficheiros ----------
const FAKE = fs.readFileSync(path.join(HERE, 'fake-supabase.js'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, rs) => {
  const url = new URL(rq.url, 'http://x');
  if (url.pathname === '/__fake') {
    let body = ''; rq.on('data', c => (body += c)); rq.on('end', () => {
      if (offline.has(rq.headers['x-device'])) { rs.writeHead(503); return rs.end(); }
      rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(handle(JSON.parse(body))));
    });
    return;
  }
  if (url.pathname === '/js/vendor/supabase.js') { rs.writeHead(200, { 'Content-Type': 'text/javascript' }); return rs.end(FAKE); }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404); return rs.end(); }
  rs.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(rs);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;

// ---------- aparelhos ----------
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
export const errors = [];
export async function device(name) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(n => localStorage.setItem('fake.device', n), name);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  p.on('dialog', d => d.accept());
  await p.goto(URL0);
  await synced(p);
  return p;
}
export const synced = p => p.waitForFunction(() => window.MF && MF.sync.user && MF.sync.ready && MF.sync.status === 'ok', null, { timeout: 20000 });
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const stateOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('macroforge.v1')));
export const cloud = () => (db.app_state[0] || {}).state || {};
export const weights = st => (st.weights || []).map(w => w.date).sort().join(',');
export async function syncNow(p) { await p.evaluate(() => MF.sync.now()); await synced(p); }
export async function tab(p, v) { await p.click(`[data-act=tab][data-v=${v}]`); }
export async function addWeight(p, date, kg) {
  await tab(p, 'progress');
  await p.fill('#weightForm [name=date]', date); await p.fill('#weightForm [name=kg]', String(kg));
  await p.click('#weightForm button[type=submit]');
}
export const result = { failed: 0 };
export function check(label, ok, detail = '') { console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' | ' + detail : ''}`); if (!ok) result.failed++; }

export async function finish() {
  check('sem erros JavaScript nas páginas', errors.length === 0, errors.join(' ; '));
  await browser.close(); server.close();
  console.log(result.failed ? `${result.failed} verificação(ões) falharam` : 'tudo OK');
  process.exit(result.failed ? 1 : 0);
}
export { browser };
