// Infraestrutura dos testes e2e: serve a app, troca js/vendor/supabase.js por um Supabase falso em memória
// e abre "aparelhos" (contextos de Chrome headless). Nunca fala com o Supabase real.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(process.argv[2] || path.join(HERE, '..', '..'));
const { chromium } = createRequire(import.meta.url)('playwright-core');   // npm ci (package.json)

// ---------- base de dados falsa (regras de app_state e o essencial de shared_foods) ----------
export const db = { app_state: [], shared_foods: [] }, offline = new Set();
const USER_ID = '11111111-1111-4111-8111-111111111111';
const clone = x => JSON.parse(JSON.stringify(x));
const match = (row, f) => f.every(([c, v, op]) => (op === 'ilike' ? String(row[c]).toLowerCase() === String(v).replace(/\\(.)/g, '$1').toLowerCase() : row[c] === v));
const pub = r => { const { created_by, ...o } = r; return o; };    // created_by nunca sai, como na base de dados real
function sharedFoods(b) {
  const T = db.shared_foods;
  const one = rows => (b.mode === 'many' ? rows : rows[0] || null);
  if (b.op === 'select') return { data: one(T.filter(r => match(r, b.f)).map(pub).map(clone)), error: null };
  if (b.op === 'insert') {
    if (T.some(r => r.name.trim().toLowerCase() === b.row.name.trim().toLowerCase())) return { data: null, error: { code: '23505', message: 'duplicate key' } };
    const row = { id: crypto.randomUUID(), created_by: USER_ID, created_at: new Date().toISOString(), ...clone(b.row) };
    T.push(row); return { data: b.ret ? one([pub(row)]) : null, error: null };
  }
  if (b.op === 'update') { const rows = T.filter(r => match(r, b.f) && r.created_by === USER_ID); rows.forEach(r => Object.assign(r, clone(b.row))); return { data: one(rows.map(pub)), error: null }; }
  if (b.op === 'delete') { db.shared_foods = T.filter(r => !(match(r, b.f) && r.created_by === USER_ID)); return { data: null, error: null }; }
  return { data: null, error: null };
}
function handle(b) {
  if (b.t === 'rpc') return { data: b.op === 'my_shared_food_ids' ? db.shared_foods.filter(r => r.created_by === USER_ID).map(r => r.id) : null, error: null };
  if (b.t === 'shared_foods') return sharedFoods(b);
  if (b.t !== 'app_state') return { data: b.mode === 'many' ? [] : null, error: null };
  const T = db.app_state;
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
export const errors = [], alerts = [], external = [];
// opts.session = 'none': abre no ecrã de entrada, sem sessão · opts.before(page): antes de abrir a app
export async function device(name, opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([n, none]) => {
    if (sessionStorage.getItem('fake.init')) return;          // só na primeira abertura deste aparelho
    sessionStorage.setItem('fake.init', '1');
    localStorage.setItem('fake.device', n);
    if (none) localStorage.setItem('fake.session', 'none');
  }, [name, opts.session === 'none']);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  p.on('dialog', d => { if (d.type() === 'alert') alerts.push(`${name}: ${d.message()}`); d.accept(); });
  p.on('request', r => { if (!r.url().startsWith(URL0) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await p.goto(URL0);
  if (opts.session !== 'none') await synced(p);
  return p;
}
export async function login(p) {
  await p.fill('#authForm [name=email]', 'teste@example.com'); await p.fill('#authForm [name=password]', 'Teste12345A');
  await p.click('#authForm button[value=in]');
  await p.waitForSelector('nav.tabs', { timeout: 20000 }); await synced(p);
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
  check('nenhum alerta disparado e nenhum pedido para fora da app', alerts.length === 0 && external.length === 0, [...alerts, ...external].join(' ; '));
  await browser.close(); server.close();
  console.log(result.failed ? `${result.failed} verificação(ões) falharam` : 'tudo OK');
  process.exit(result.failed ? 1 : 0);
}
export { browser };
