// TESTE CONTRA O SUPABASE DE PRODUÇÃO (conta temporária criada e apagada por run_sync_live.py). Correr só à mão,
// com autorização do Davide. Nunca no CI.
// Sincronização registo a registo e diário, com dois aparelhos e a mesma conta; no fim apaga a conta pela app
// (função delete-account). Variáveis: TEST_EMAIL, TEST_PW, MF_URL.
import { chromium } from 'playwright-core';
const URL = process.env.MF_URL || 'http://localhost:8766/';
const { TEST_EMAIL: email, TEST_PW: pw } = process.env;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const errs = [], native = [];
let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' | ' + detail : ''}`); if (!ok) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function device(name) {
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  p.on('dialog', d => { native.push(d.type()); d.accept(); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.fill('#authForm [name=email]', email); await p.fill('#authForm [name=password]', pw);
  await p.click('#authForm button[value=in]');
  await p.waitForSelector('nav.tabs', { timeout: 60000 });
  await synced(p);
  return { p, ctx };
}
const synced = p => p.waitForFunction(() => MF.sync.ready && MF.sync.status === 'ok', null, { timeout: 60000 });
const syncNow = async p => { await p.evaluate(() => MF.sync.now()); await synced(p); };
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('macroforge.v1')));
const server = p => p.evaluate(async () => { const r = await MF.sync.client.from('app_state').select('state, updated_at').eq('user_id', MF.sync.user.id).maybeSingle(); return r.data; });
const W = s => (s.weights || []).map(w => w.date).sort().join(',');
const tab = (p, v) => p.click(`[data-act=tab][data-v=${v}]`);
async function addWeight(p, date, kg) { await tab(p, 'progress'); await p.fill('#weightForm [name=date]', date); await p.fill('#weightForm [name=kg]', String(kg)); await p.click('#weightForm button[type=submit]'); }
async function addDiary(p, meal, food, g) {
  await tab(p, 'diary'); const f = `form.diary-add[data-meal=${meal}]`;
  await p.selectOption(`${f} select`, food); await p.fill(`${f} input[name=g]`, String(g)); await p.click(`${f} button[type=submit]`);
}
const today = p => p.evaluate(() => MF.diary.localDate());
const diaryToday = async p => { const d = await today(p); return Object.entries((await st(p)).diary || {}).filter(([k]) => k.startsWith(d + '/')).map(([, e]) => `${e.f}:${e.g}`).sort().join(','); };

const A = await device('A');
await addWeight(A.p, '2026-09-01', 80); await sleep(2500); await synced(A.p);
const B = await device('B');
check('B recebe o que A já tinha (Supabase real)', W(await st(B.p)) === '2026-09-01', W(await st(B.p)));

// 1) B offline; os dois mudam coisas diferentes
await B.ctx.setOffline(true);
await addWeight(B.p, '2026-09-03', 79.1); await addDiary(B.p, 'dinner', 'batata', 300); await sleep(2500);
await addWeight(A.p, '2026-09-02', 79.5); await addDiary(A.p, 'lunch', 'frango', 150); await sleep(2500); await synced(A.p);
await B.ctx.setOffline(false); await sleep(500); await syncNow(B.p); await syncNow(A.p);
const exp = '2026-09-01,2026-09-02,2026-09-03';
const srv1 = await server(A.p);
check('pesos de A e B (B offline): servidor', W(srv1.state) === exp, W(srv1.state));
check('... A e B', W(await st(A.p)) === exp && W(await st(B.p)) === exp, `${W(await st(A.p))} / ${W(await st(B.p))}`);
const da = await diaryToday(A.p), db = await diaryToday(B.p);
check('diário de hoje: registo de A e o de B (offline) nos dois', da === 'batata:300,frango:150' && db === da, `${da} / ${db}`);

// 2) escritas quase ao mesmo tempo (escrita condicional no servidor real)
await Promise.all([addWeight(A.p, '2026-09-05', 78.6), addWeight(B.p, '2026-09-06', 78.4)]);
await sleep(4000); await syncNow(A.p); await syncNow(B.p); await syncNow(A.p);
const exp2 = exp + ',2026-09-05,2026-09-06';
check('escritas ao mesmo tempo: ficam as duas', W((await server(A.p)).state) === exp2 && W(await st(A.p)) === exp2 && W(await st(B.p)) === exp2, W((await server(A.p)).state));

// 3) apagar em A enquanto B (offline) junta outro: o apagado não volta
await B.ctx.setOffline(true);
await addWeight(B.p, '2026-09-07', 78.2); await sleep(2500);
await tab(A.p, 'progress'); await A.p.click('[data-act=delWeight][data-v="2026-09-01"]'); await sleep(2500); await synced(A.p);
await B.ctx.setOffline(false); await sleep(500); await syncNow(B.p); await syncNow(A.p);
const exp3 = '2026-09-02,2026-09-03,2026-09-05,2026-09-06,2026-09-07';
check('apagado em A não ressuscita, novo de B fica: servidor', W((await server(A.p)).state) === exp3, W((await server(A.p)).state));
check('... A e B iguais', W(await st(A.p)) === exp3 && W(await st(B.p)) === exp3);

// 4) convergência: puxar outra vez não reescreve
const v0 = (await server(A.p)).updated_at;
await syncNow(A.p); await syncNow(B.p); await syncNow(A.p);
check('depois de convergir, sincronizar não reescreve a linha', (await server(A.p)).updated_at === v0, `${v0}`);
check('sem erros JavaScript e sem caixas nativas', errs.length === 0 && native.length === 0, [...errs, ...native].join(' ; '));

// 5) apagar a conta pela app (função delete-account)
const del = await A.p.evaluate(async () => { try { return await MF.sync.deleteAccount(); } catch (e) { return { ok: false, error: e.message }; } });
check('conta de teste apagada pela função delete-account', del && del.ok === true, JSON.stringify(del));
await b.close();
console.log(failed ? `${failed} verificação(ões) falharam` : 'tudo OK');
process.exit(failed ? 1 : 0);
