// Testes do diário alimentar (node --test tests/*.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const D = req('../js/diary.js');
const M = req('../js/merge.js');

const frango = { id: 'frango', pt: 'Peito de frango', k: 110, p: 23.1, c: 0, f: 1.24 };

test('entrada guarda os valores por 100 g e só guarda o nome quando pedido', () => {
  assert.deepEqual(D.entry(frango, 'lunch', 150, false), { m: 'lunch', f: 'frango', g: 150, v: [110, 23.1, 0, 1.2] });
  assert.equal(D.entry({ ...frango, id: 'c_x' }, 'lunch', 100, true).n, 'Peito de frango');
});

test('totais do dia contam só esse dia', () => {
  const diary = { [D.key('2026-10-29', 'aaaa1')]: D.entry(frango, 'lunch', 200), [D.key('2026-10-28', 'aaaa2')]: D.entry(frango, 'dinner', 100) };
  const t = D.totals(D.day(diary, '2026-10-29'));
  assert.equal(Math.round(t.k), 220); assert.equal(Math.round(t.p * 10) / 10, 46.2);
});

test('últimos 7 dias e mudança de dia, com mudança de mês', () => {
  const r = D.recent({}, '2026-11-02', 7);
  assert.deepEqual(r.map(x => x.date), ['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27']);
  assert.equal(D.shift('2026-10-31', 1), '2026-11-01'); assert.equal(D.shift('2026-03-01', -1), '2026-02-28');
});

test('a data local não é a de UTC', () => {
  const d = new Date(2026, 9, 30, 0, 30); // 00:30 locais
  assert.equal(D.localDate(d), '2026-10-30');
});

test('limpeza: só passam entradas com a forma esperada', () => {
  const ok = { m: 'lunch', f: 'frango', g: 150, v: [110, 23, 0, 1.2] };
  const out = D.sanitize({
    '2026-10-29/abcd1': ok,
    '2026-10-29/abcd2': { ...ok, m: '<img onerror=x>' },
    '2026-10-29/abcd3': { ...ok, f: 'x" onclick="y' },
    '2026-10-29/abcd4': { ...ok, v: [1, 2, 3] },
    '2026-10-29/abcd5': { ...ok, g: -5 },
    '../etc/abcd6': ok,
    '2026-10-29/abcd7': { ...ok, n: 'x'.repeat(200) },
  });
  assert.deepEqual(Object.keys(out).sort(), ['2026-10-29/abcd1', '2026-10-29/abcd7']);
  assert.equal(out['2026-10-29/abcd7'].n.length, 60);
});

test('sincronização: entradas no mesmo dia em dois aparelhos ficam as duas; apagar não ressuscita', () => {
  const k1 = D.key('2026-10-29', 'aaaa1'), k2 = D.key('2026-10-29', 'bbbb2');
  const base = { diary: { [k1]: D.entry(frango, 'lunch', 150) } };
  base.clock = M.stamp({}, base, {}, 1000);
  // A apaga a entrada; B junta outra no mesmo dia
  const A = { diary: {} }; A.clock = M.stamp(base, A, base.clock, 2000);
  const B = { diary: { ...base.diary, [k2]: D.entry(frango, 'dinner', 100) } }; B.clock = M.stamp(base, B, base.clock, 2100);
  const m1 = M.merge(A, B), m2 = M.merge(B, A);
  assert.deepEqual(Object.keys(m1.diary), [k2]);
  assert.equal(M.stable(m1), M.stable(m2));
});

test('mudar a quantidade num aparelho e outra entrada noutro: ficam as duas alterações', () => {
  const k1 = D.key('2026-10-29', 'aaaa1'), k2 = D.key('2026-10-29', 'bbbb2');
  const base = { diary: { [k1]: D.entry(frango, 'lunch', 150) } }; base.clock = M.stamp({}, base, {}, 1000);
  const A = JSON.parse(JSON.stringify(base)); A.diary[k1].g = 220; A.clock = M.stamp(base, A, base.clock, 2000);
  const B = JSON.parse(JSON.stringify(base)); B.diary[k2] = D.entry(frango, 'dinner', 90); B.clock = M.stamp(base, B, base.clock, 2100);
  const m = M.merge(A, B);
  assert.equal(m.diary[k1].g, 220); assert.equal(m.diary[k2].g, 90);
});
