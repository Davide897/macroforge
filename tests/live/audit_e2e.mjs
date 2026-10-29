// TESTE CONTRA O SUPABASE DE PRODUÇÃO (contas temporárias criadas e apagadas por run_*.py). Correr só à mão,
// com autorização do Davide. Nunca no CI. A app tem de estar servida em MF_URL (os run_*.py arrancam o serve.py).
import { chromium } from 'playwright-core';
import fs from 'fs';
import { fileURLToPath } from 'url';
const BAD = fileURLToPath(new globalThis.URL('./bad-backup.json', import.meta.url));
const URL = (process.env.MF_URL || 'http://localhost:8766/');
const { A_EMAIL, A_PW, B_EMAIL, B_PW } = process.env;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const errs = []; let alerted = false; const evil = [];
const dev = async () => {
  const c = await b.newContext(); const p = await c.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => { if (d.type() === 'alert') alerted = true; d.accept(); });
  p.on('request', r => { if (r.url().includes('evil.example')) evil.push(r.url()); });
  await p.goto(URL, { waitUntil: 'networkidle' }); return p;
};
const login = async (p, e, pw) => { await p.fill('#authForm [name=email]', e); await p.fill('#authForm [name=password]', pw); await p.click('#authForm button[value=in]'); await p.waitForSelector('nav.tabs', { timeout: 60000 }); await p.waitForFunction(() => MF.sync.status === 'ok', null, { timeout: 60000 }); await p.waitForTimeout(1500); };
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('macroforge.v1') || '{}'));

// 1) A cria dados na nuvem; noutro aparelho muda a língua ANTES de entrar; os dados da nuvem têm de sobreviver
const A1 = await dev(); await login(A1, A_EMAIL, A_PW);
await A1.click('[data-act=tab][data-v=progress]');
await A1.fill('#weightForm [name=kg]', '77.7'); await A1.click('#weightForm button[type=submit]'); await A1.waitForTimeout(3500);
const A2 = await dev();
await A2.click('[data-act=lang][data-v=en]'); await A2.click('[data-act=lang][data-v=pt]'); await A2.click('[data-act=lang][data-v=en]');
await login(A2, A_EMAIL, A_PW); await A2.waitForTimeout(2000);
const s2 = await st(A2);
console.log('1) língua mudada antes de entrar -> pesagens no aparelho novo:', s2.weights.length, '| peso', s2.profile.weight, '| língua mantida:', s2.lang);
await A1.click('[data-act=syncNow]'); await A1.waitForTimeout(2500);
console.log('   e no aparelho original continua:', (await st(A1)).weights.length, 'pesagem');

// 4) cópia de segurança maliciosa
const bad = { app: 'macroforge', v: 1, state: { weights: [{ date: '<img src=x onerror=alert(1)>', kg: 80 }, { date: '2026-10-20', kg: 79 }],
  customFoods: [{ id: 'x" onmouseover="alert(1)', pt: 'a', cat: 'prot', k: 1, p: 1, c: 1, f: 1 }, { id: 'c_ok', pt: '<b>Bolo</b>', cat: 'carb', k: 300, p: 5, c: 60, f: 5, unit: { g: 50, pt: '<img src=x onerror=alert(2)>' } }],
  plan: { days: [{ meals: [{ type: 'B', name: '<img src=x onerror=alert(3)>', items: [] }] }] }, profile: { goal: 'cut', weight: 80 } },
  photos: [{ id: 'p1', date: '2026-10-20', pose: 'front', data: 'https://evil.example/steal' }, { id: '"><img src=x onerror=alert(4)>', date: '2026-10-20', pose: 'front', data: 'data:image/png;base64,iVBORw0KGgo=' }] };
fs.writeFileSync(BAD, JSON.stringify(bad));
await A2.click('[data-act=tab][data-v=progress]');
await A2.setInputFiles('[data-act=import]', BAD); await A2.waitForTimeout(2500);
for (const tab of ['progress', 'foods', 'plan', 'shop']) { await A2.click(`[data-act=tab][data-v=${tab}]`); await A2.waitForTimeout(400); }
const s4 = await st(A2);
console.log('4) cópia maliciosa: pesagens aceites', s4.weights.map(w => w.date), '| alimentos aceites', s4.customFoods.map(f => f.id + ':' + f.pt + ':' + (f.unit && f.unit.pt)), '| alerta:', alerted, '| pedidos a evil.example:', evil.length);

// 2) nome "ocupado" por outra pessoa com valores diferentes
const B = await dev(); await login(B, B_EMAIL, B_PW);
const nm = 'Teste MF Arroz ' + Date.now().toString(36);
await B.evaluate(async n => MF.sync.client.from('shared_foods').insert({ name: n, cat: 'carb', k: 900, p: 50, c: 0, f: 50 }), nm);
await A1.click('[data-act=tab][data-v=foods]'); await A1.click('details summary');
await A1.fill('#customForm [name=name]', nm); await A1.selectOption('#customForm [name=cat]', 'carb');
await A1.fill('#customForm [name=p]', '7'); await A1.fill('#customForm [name=c]', '79'); await A1.fill('#customForm [name=f]', '0.6');
await A1.click('#customForm button[type=submit]'); await A1.waitForTimeout(2500);
const sA = await st(A1);
console.log('2) nome já ocupado com valores diferentes:', await A1.$eval('#toast', e => e.textContent), '| ficou privado com os teus valores:', sA.customFoods.some(f => f.pt === nm && f.c === 79));

// 5) limite diário de alimentos novos por pessoa
const rate = await B.evaluate(async () => {
  let ok = 0, err = '';
  for (let i = 0; i < 42; i++) { const r = await MF.sync.client.from('shared_foods').insert({ name: 'Teste MF Lixo ' + i + '-' + Math.random().toString(36).slice(2, 6), cat: 'carb', k: 100, p: 1, c: 20, f: 1 }); if (r.error) { err = r.error.message; break; } ok++; }
  return { ok, err };
});
console.log('5) inserções seguidas aceites:', rate.ok, '| depois:', rate.err);
console.log('ERROS:', errs.length ? errs : 'nenhum'); await b.close();
