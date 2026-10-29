// Dois aparelhos com a app real (Chrome headless) e um Supabase falso em memória.
// Verifica que alterações feitas offline num aparelho não apagam as do outro.
// Uso: node tests/e2e/sync_two_devices.mjs [pasta da app]   (por defeito, a raiz do repositório)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(HERE, '..', '..'));
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright-core')); }
catch { ({ chromium } = createRequire(path.join(ROOT, '..', 'macroforge-test', 'package.json'))('playwright-core')); }

// ---------- base de dados falsa (regras da tabela app_state) ----------
const db = { app_state: [] }, offline = new Set();
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
const errors = [];
async function device(name) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(n => localStorage.setItem('fake.device', n), name);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  p.on('dialog', d => d.accept());
  await p.goto(URL0);
  await synced(p);
  return p;
}
const synced = p => p.waitForFunction(() => window.MF && MF.sync.user && MF.sync.ready && MF.sync.status === 'ok', null, { timeout: 20000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stateOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('macroforge.v1')));
const cloud = () => (db.app_state[0] || {}).state || {};
const weights = st => (st.weights || []).map(w => w.date).sort().join(',');
async function syncNow(p) { await p.evaluate(() => MF.sync.now()); await synced(p); }
async function tab(p, v) { await p.click(`[data-act=tab][data-v=${v}]`); }
async function addWeight(p, date, kg) {
  await tab(p, 'progress');
  await p.fill('#weightForm [name=date]', date); await p.fill('#weightForm [name=kg]', String(kg));
  await p.click('#weightForm button[type=submit]');
}
let failed = 0;
function check(label, ok, detail = '') { console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' | ' + detail : ''}`); if (!ok) failed++; }

const A = await device('A');
await addWeight(A, '2026-10-01', 80); await sleep(2200); await synced(A);
const B = await device('B');
check('B recebe o que A já tinha', weights(await stateOf(B)) === '2026-10-01', weights(await stateOf(B)));

// 1) pesos diferentes com B offline
offline.add('B');
await addWeight(B, '2026-10-03', 79.1); await sleep(2200);
await addWeight(A, '2026-10-02', 79.5); await sleep(2200); await synced(A);
offline.delete('B'); await syncNow(B); await syncNow(A);
const exp1 = '2026-10-01,2026-10-02,2026-10-03';
check('pesos de A e B (B offline) ficam todos: nuvem', weights(cloud()) === exp1, weights(cloud()));
check('... aparelho A', weights(await stateOf(A)) === exp1, weights(await stateOf(A)));
check('... aparelho B', weights(await stateOf(B)) === exp1, weights(await stateOf(B)));

// 2) perfil: objetivo em A, idade em B offline
offline.add('B');
await tab(B, 'goals'); await B.fill('input[data-bind=age]', '35'); await sleep(2200);
await tab(A, 'goals'); await A.click('[data-act=goal][data-v=bulk]'); await sleep(2200); await synced(A);
offline.delete('B'); await syncNow(B); await syncNow(A);
const pa = (await stateOf(A)).profile, pb = (await stateOf(B)).profile;
check('perfil: objetivo de A e idade de B ficam os dois', pa.goal === 'bulk' && pa.age === 35 && pb.goal === 'bulk' && pb.age === 35, `A ${pa.goal}/${pa.age} B ${pb.goal}/${pb.age}`);

// 3) apagar em A enquanto B (offline) muda outra coisa: o apagado não volta
offline.add('B');
await addWeight(B, '2026-10-04', 78.8); await sleep(2200);
await tab(A, 'progress'); await A.click('[data-act=delWeight][data-v="2026-10-01"]'); await sleep(2200); await synced(A);
offline.delete('B'); await syncNow(B); await syncNow(A);
const exp3 = '2026-10-02,2026-10-03,2026-10-04';
check('apagado em A não ressuscita, novo de B fica: nuvem', weights(cloud()) === exp3, weights(cloud()));
check('... A e B iguais', weights(await stateOf(A)) === exp3 && weights(await stateOf(B)) === exp3, `${weights(await stateOf(A))} / ${weights(await stateOf(B))}`);

check('sem erros JavaScript nas páginas', errors.length === 0, errors.join(' ; '));
await browser.close(); server.close();
console.log(failed ? `${failed} verificação(ões) falharam` : 'tudo OK');
process.exit(failed ? 1 : 0);
