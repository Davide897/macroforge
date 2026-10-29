// Defesas do lado da app, com a app real e um Supabase falso (vindas de macroforge-test/audit_e2e.mjs e attack_e2e.mjs).
// As defesas do lado do servidor (RLS, CHECKs, limites, aprovação) só se testam contra o Supabase real: tests/live/.
// Uso: node tests/e2e/client_security.mjs [pasta da app]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, device, login, tab, check, sleep, stateOf, cloud, weights, finish, synced } from './harness.mjs';

const XSS = '<img src=x onerror=alert(1)>';
const injected = p => p.evaluate(() => document.querySelectorAll('img[src="x"], img[src$="/x"], b.evil, [onmouseover], [onerror]').length);

// 1) Na nuvem já há dados; noutro aparelho muda-se a língua no ecrã de entrada ANTES de entrar: os dados sobrevivem
db.app_state.push({ user_id: '11111111-1111-4111-8111-111111111111', updated_at: 1000,
  state: { profile: { goal: 'cut', weight: 77.7 }, weights: [{ date: '2026-10-20', kg: 77.7 }], foods: { frango: { like: true, buy: true } } } });
const A = await device('A', { session: 'none' });
check('sem sessão abre o ecrã de entrada', !!(await A.waitForSelector('.gate #authForm', { timeout: 10000 }).catch(() => null)));
for (const l of ['en', 'pt', 'en']) await A.click(`[data-act=lang][data-v=${l}]`);
await login(A);
const s1 = await stateOf(A);
check('língua mudada antes de entrar não apaga a nuvem: pesagens', weights(s1) === '2026-10-20' && weights(cloud()) === '2026-10-20', `${weights(s1)} / nuvem ${weights(cloud())}`);
check('... e a língua escolhida mantém-se', s1.lang === 'en', s1.lang);

// 2) Cópia de segurança maliciosa
const bad = { app: 'macroforge', v: 1, state: {
  weights: [{ date: XSS, kg: 80 }, { date: '2026-10-21', kg: 79 }],
  customFoods: [{ id: 'x" onmouseover="alert(1)', pt: 'a', cat: 'prot', k: 1, p: 1, c: 1, f: 1 },
    { id: 'c_ok', pt: '<b class="evil">Bolo</b>', cat: 'carb', k: 300, p: 5, c: 60, f: 5, unit: { g: 50, pt: '<img src=x onerror=alert(2)>' } }],
  plan: { days: [{ meals: [{ type: 'B', name: '<img src=x onerror=alert(3)>', items: [] }] }] },
  diary: { '2026-10-21/abcd1234': { m: 'lunch', f: 'frango', g: 150, v: [113, 22.5, 0, 2.6] },
    [`2026-10-21/${XSS}`]: { m: 'lunch', f: 'frango', g: 1, v: [1, 1, 1, 1] },
    '2026-10-21/abcd5678': { m: XSS, f: 'frango', g: 1, v: [1, 1, 1, 1] },
    '2026-10-21/abcd9999': { m: 'dinner', f: 'c_ok', g: 100, v: [1, 1, 1, 1], n: XSS } },
  profile: { goal: 'cut', weight: 80 } },
  photos: [{ id: 'p1', date: '2026-10-21', pose: 'front', data: 'https://evil.example/steal' },
    { id: '"><img src=x onerror=alert(4)>', date: '2026-10-21', pose: 'front', data: 'data:image/png;base64,iVBORw0KGgo=' }] };
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mf-')), 'bad-backup.json');
fs.writeFileSync(file, JSON.stringify(bad));
await tab(A, 'progress');
await A.setInputFiles('[data-act=import]', file); await sleep(1500);
await A.evaluate(() => { const st = JSON.parse(localStorage.getItem('macroforge.v1')); st.ui = { ...st.ui, diaryDate: '2026-10-21' }; localStorage.setItem('macroforge.v1', JSON.stringify(st)); });
await A.reload(); await synced(A);
for (const t of ['progress', 'foods', 'plan', 'diary', 'shop', 'goals']) { await tab(A, t); await sleep(300); check(`cópia maliciosa: nada injetado no separador ${t}`, (await injected(A)) === 0); }
const s2 = await stateOf(A);
check('cópia maliciosa: só a pesagem válida', s2.weights.some(w => w.date === '2026-10-21') && !s2.weights.some(w => w.date.includes('<')));
check('cópia maliciosa: alimento com id malicioso recusado', s2.customFoods.map(f => f.id).join() === 'c_ok', s2.customFoods.map(f => f.id).join());
check('cópia maliciosa: unidade limpa', s2.customFoods[0].unit && !/[<>]/.test(s2.customFoods[0].unit.pt), s2.customFoods[0].unit && s2.customFoods[0].unit.pt);
check('cópia maliciosa: refeição de plano com nome inválido recusada', !(s2.plan && s2.plan.days.some(d => d.meals.length)));
check('cópia maliciosa: diário só com as entradas válidas', Object.keys(s2.diary).sort().join() === '2026-10-21/abcd1234,2026-10-21/abcd9999', Object.keys(s2.diary).join());
fs.rmSync(path.dirname(file), { recursive: true, force: true });

// 3) Alimentos da comunidade maliciosos vindos do servidor (se uma regra da base de dados falhasse)
const row = (name, extra = {}) => ({ id: crypto.randomUUID(), created_by: '22222222-2222-4222-8222-222222222222', name, cat: 'prot', k: 100, p: 20, c: 1, f: 1, fb: 0, m: 'BMS', source: 'manual', ...extra });
db.shared_foods.push(
  row('Teste MF ' + XSS),
  row('Teste MF Medida', { meas: [[XSS, 10], ['csopa', 15]] }),
  row('Teste MF Unidade', { unit: { g: 30, pt: XSS, en: 'bar' } }),
  { ...row('Teste MF Id'), id: '"><img src=x onerror=alert(6)>' },
  row('Teste MF Valores', { k: 99999 }));
await A.evaluate(() => MF.sync.now()); await synced(A);
await tab(A, 'foods'); await A.fill('.search', 'Teste MF'); await sleep(400);
const names = await A.$$eval('.food b', els => els.map(e => e.textContent));
check('comunidade maliciosa: nada injetado na lista', (await injected(A)) === 0);
check('comunidade maliciosa: nome mostrado como texto', names.includes('Teste MF ' + XSS), names.join(' | '));
check('comunidade maliciosa: id e valores impossíveis recusados', !names.includes('Teste MF Id') && !names.includes('Teste MF Valores'));
const meas = await A.evaluate(() => JSON.parse(localStorage.getItem('macroforge.v1')).sharedFoods.find(f => f.pt === 'Teste MF Medida').meas);
check('comunidade maliciosa: medida desconhecida descartada', JSON.stringify(meas) === '[["csopa",15]]', JSON.stringify(meas));

// 4) Nome já usado na comunidade por outra pessoa
db.shared_foods.push(row('Teste MF Arroz', { cat: 'carb', k: 900, p: 50, c: 0, f: 50 }));
await A.evaluate(() => MF.sync.now()); await synced(A);
await A.click('details summary');
const addCustom = async (nm, p, c, f, k) => {
  await A.fill('#customForm [name=name]', nm); if (k) await A.fill('#customForm [name=k]', String(k)); await A.selectOption('#customForm [name=cat]', 'carb');
  await A.fill('#customForm [name=p]', String(p)); await A.fill('#customForm [name=c]', String(c)); await A.fill('#customForm [name=f]', String(f));
  await A.click('#customForm button[type=submit]'); await sleep(800);
};
await addCustom('teste mf arroz', 7, 79, 0.6);
const s4 = await stateOf(A);
check('nome ocupado com valores diferentes: fica privado com os teus valores', s4.customFoods.some(f => f.pt === 'teste mf arroz' && f.c === 79));
check('... e o da outra pessoa não muda', db.shared_foods.find(r => r.name === 'Teste MF Arroz').k === 900);
await A.click('details summary').catch(() => {});
await addCustom('Teste MF Arroz', 50, 0, 50, 900);
const s5 = await stateOf(A);
check('nome ocupado com os mesmos valores: usa o da comunidade sem duplicar', db.shared_foods.filter(r => r.name.toLowerCase() === 'teste mf arroz').length === 1 && !s5.customFoods.some(f => f.pt === 'Teste MF Arroz'));

await finish();
