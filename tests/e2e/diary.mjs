// Diário alimentar com a app real: juntar, mudar quantidade, copiar do plano, mudar de dia, apagar,
// e dois aparelhos a registar no mesmo dia (um deles offline). Supabase falso em memória.
// Uso: node tests/e2e/diary.mjs [pasta da app]   ·   SHOTS=<pasta> guarda capturas
import path from 'node:path';
import { offline, device, syncNow, tab, check, sleep, stateOf, cloud, finish } from './harness.mjs';

const SHOTS = process.env.SHOTS;
const entries = st => Object.entries(st.diary || {});
const onDay = (st, d) => entries(st).filter(([k]) => k.startsWith(d + '/'));
const todayOf = p => p.evaluate(() => MF.diary.localDate());
const addFood = async (p, meal, foodId, g) => {
  const f = `form.diary-add[data-meal=${meal}]`;
  await p.selectOption(`${f} select`, foodId);
  if (g) await p.fill(`${f} input[name=g]`, String(g));
  await p.click(`${f} button[type=submit]`);
};

const A = await device('A');
await tab(A, 'foods'); await A.click('[data-act=basics]');
await tab(A, 'plan'); await A.click('[data-act=generate]');
await tab(A, 'diary');
const today = await todayOf(A);
check('separador Diário abre no dia de hoje (data local)', (await A.inputValue('[data-act=diaryDate]')) === today, today);
check('refeições do esquema da pessoa aparecem', (await A.$$('form.diary-add')).length >= 3, `${(await A.$$('form.diary-add')).length} refeições`);

await addFood(A, 'lunch', 'frango', 150);
let st = await stateOf(A), e = onDay(st, today);
check('juntar alimento ao almoço', e.length === 1 && e[0][1].f === 'frango' && e[0][1].g === 150 && e[0][1].m === 'lunch', JSON.stringify(e[0] && e[0][1]));
const kcalTxt = await A.textContent('.bars .bar.k b');
const expK = Math.round(e[0][1].v[0] * e[0][1].g / 100);
check('totais do dia mostram as kcal registadas', kcalTxt.trim().startsWith(String(expK)), `${kcalTxt.trim()} (esperado ${expK})`);

await A.fill('[data-act=diaryQty]', '200'); await A.press('[data-act=diaryQty]', 'Tab');
st = await stateOf(A);
check('mudar a quantidade', onDay(st, today)[0][1].g === 200);

await addFood(A, 'dinner', 'arroz'); // sem gramas: porção por defeito do alimento
st = await stateOf(A);
check('sem gramas usa a porção por defeito', onDay(st, today).some(([, x]) => x.f === 'arroz' && x.g > 0));

const planItems = await A.evaluate(() => { const p = JSON.parse(localStorage.getItem('macroforge.v1')).plan; return p.days[0].meals.reduce((n, m) => n + m.items.length, 0); });
const before = onDay(await stateOf(A), today).length;
await A.click('section.card [data-act=diaryFromPlan]:not([data-v])');
check('copiar o dia do plano junta todos os alimentos do dia', onDay(await stateOf(A), today).length === before + planItems, `${before} + ${planItems}`);

await A.click('[data-act=diaryShift][data-v="-1"]');
const yest = await A.inputValue('[data-act=diaryDate]');
await addFood(A, 'breakfast', 'ovo', 120);
check('dia anterior: registo fica nesse dia', onDay(await stateOf(A), yest).length === 1, yest);
check('botão Hoje aparece noutro dia', !!(await A.$('[data-act=diaryToday]')));
await A.click('[data-act=diaryToday]');
check('volta a hoje', (await A.inputValue('[data-act=diaryDate]')) === today);
check('últimos 7 dias mostra os dois dias', (await A.$$('[data-act=diaryGo]')).length === 7 && (await A.textContent('table.hist')).includes(yest));

const n0 = onDay(await stateOf(A), today).length;
await A.click('[data-act=diaryDel] >> nth=0');
check('apagar um registo', onDay(await stateOf(A), today).length === n0 - 1);
if (SHOTS) {
  await A.screenshot({ path: path.join(SHOTS, 'diario-desk.png'), fullPage: true });
  await A.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  await A.screenshot({ path: path.join(SHOTS, 'diario-mob.png'), fullPage: false });
  await A.setViewportSize({ width: 1200, height: 900 });
}
await sleep(2200); await syncNow(A);

// Dois aparelhos no mesmo dia, B offline
const B = await device('B');
await tab(B, 'diary');
check('B recebe o diário de A', onDay(await stateOf(B), today).length === n0 - 1 && onDay(await stateOf(B), yest).length === 1);
offline.add('B');
await addFood(B, 'dinner', 'batata', 300); await sleep(2200);
await addFood(A, 'breakfast', 'ovo', 60); await sleep(2200); await syncNow(A);
await B.click('[data-act=diaryDel] >> nth=0'); await sleep(2200);  // B apaga (offline) o primeiro registo de hoje
offline.delete('B'); await syncNow(B); await syncNow(A);
const ka = onDay(await stateOf(A), today).map(([k]) => k).sort().join(), kb = onDay(await stateOf(B), today).map(([k]) => k).sort().join();
const kc = onDay(cloud(), today).map(([k]) => k).sort().join();
check('mesmo dia em dois aparelhos: A, B e nuvem iguais', ka === kb && kb === kc, `${ka.split(',').length} registos`);
const sa = await stateOf(A);
check('... com o registo de B (offline) e o de A', onDay(sa, today).some(([, x]) => x.f === 'batata' && x.g === 300) && onDay(sa, today).some(([, x]) => x.f === 'ovo' && x.g === 60));
check('... e o apagado por B não voltou', onDay(sa, today).length === n0 - 1 + 2 - 1, `${onDay(sa, today).length}`);

await A.click('[data-act=lang][data-v=en]');
check('em inglês', (await A.textContent('main h2')).includes('Food diary'));
if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'diario-en.png'), fullPage: false });
await finish();
