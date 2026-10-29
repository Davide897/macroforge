// Testes da fusão por registo e do protocolo de sincronização (node --test tests/).
// Dois aparelhos contra um servidor em memória com a mesma regra da tabela app_state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../js/merge.js');

// Servidor em memória: uma linha {state, updated_at}; update condicional como o .eq('updated_at', base)
function server() {
  const srv = { row: null, writes: 0 };
  srv.io = () => ({
    fetch: async () => (srv.row ? JSON.parse(JSON.stringify(srv.row)) : null),
    insert: async (state, v) => { if (srv.row) return 'conflict'; srv.row = { state: clone(state), updated_at: v }; srv.writes++; return 'ok'; },
    cas: async (state, v, base) => { if (!srv.row || srv.row.updated_at !== base) return false; srv.row = { state: clone(state), updated_at: v }; srv.writes++; return true; },
  });
  return srv;
}
const clone = x => JSON.parse(JSON.stringify(x));

// Aparelho: estado local + "save" que marca o clock como o store.js
function device(srv, init = {}, now = () => Date.now()) {
  const d = { s: clone(init), updatedAt: init.updatedAt || 0 };
  delete d.s.updatedAt;
  d.edit = fn => { const prev = clone(d.s); fn(d.s); d.s.clock = M.stamp(prev, d.s, d.s.clock, now(), d.updatedAt); d.updatedAt = now(); };
  d.sync = M.createStateSync({
    ...srv.io(),
    getLocal: () => ({ payload: clone(d.s), updatedAt: d.updatedAt }),
    apply: (st, v) => { d.s = clone(st); d.updatedAt = v; },
  });
  return d;
}
const W = d => d.s.weights.map(w => `${w.date}=${w.kg}`).join(',');
const base = () => ({ profile: { goal: 'cut', age: 30, weight: 80 }, weights: [{ date: '2026-10-01', kg: 80 }], foods: { frango: { like: true, buy: true } } });

test('dois aparelhos offline com pesos diferentes: ficam os dois', async () => {
  const srv = server();
  const A = device(srv, base()), B = device(srv, {});
  await A.sync.pull(); await B.sync.pull();
  A.edit(s => s.weights.push({ date: '2026-10-02', kg: 79.5 }));
  B.edit(s => s.weights.push({ date: '2026-10-03', kg: 79.1 }));
  await A.sync.push(); await B.sync.push(); await A.sync.pull();
  assert.equal(W(A), '2026-10-01=80,2026-10-02=79.5,2026-10-03=79.1');
  assert.equal(M.stable(A.s), M.stable(B.s));
  assert.equal(M.stable(srv.row.state), M.stable(A.s));
});

test('o mesmo registo mudado nos dois: ganha a alteração mais recente, nos dois aparelhos', async () => {
  let t = 1000; const now = () => t;
  const srv = server();
  const A = device(srv, base(), now), B = device(srv, {}, now);
  await A.sync.pull(); await B.sync.pull();
  t = 2000; A.edit(s => { s.weights[0].kg = 81; });
  t = 3000; B.edit(s => { s.weights[0].kg = 82; });
  await B.sync.push(); await A.sync.push(); await B.sync.pull();
  assert.equal(W(A), '2026-10-01=82'); assert.equal(W(B), '2026-10-01=82');
});

test('apagado num aparelho não ressuscita pelo outro', async () => {
  const srv = server();
  const A = device(srv, base()), B = device(srv, {});
  await A.sync.pull(); await B.sync.pull();
  A.edit(s => { s.weights = []; delete s.foods.frango; });
  B.edit(s => { s.profile.age = 31; });
  await A.sync.push(); await B.sync.push(); await A.sync.pull();
  assert.equal(W(A), ''); assert.equal(W(B), '');
  assert.equal(A.s.foods.frango, undefined); assert.equal(B.s.foods.frango, undefined);
  assert.equal(A.s.profile.age, 31);
});

test('perfil campo a campo: objetivo num aparelho, idade noutro', async () => {
  const srv = server();
  const A = device(srv, base()), B = device(srv, {});
  await A.sync.pull(); await B.sync.pull();
  A.edit(s => { s.profile.goal = 'bulk'; });
  B.edit(s => { s.profile.age = 35; });
  await A.sync.push(); await B.sync.push(); await A.sync.pull();
  assert.deepEqual([A.s.profile.goal, A.s.profile.age, B.s.profile.goal, B.s.profile.age], ['bulk', 35, 'bulk', 35]);
});

test('aparelho vazio que entra não apaga a nuvem', async () => {
  const srv = server();
  const A = device(srv, base()); await A.sync.pull();
  const fresh = device(srv, { profile: { goal: 'cut', age: 30, weight: 80 }, weights: [], foods: {} }); // valores por defeito, updatedAt 0
  await fresh.sync.pull();
  assert.equal(W(fresh), '2026-10-01=80'); assert.equal(fresh.s.foods.frango.like, true);
  assert.equal(srv.row.state.weights.length, 1);
});

test('dados de antes desta versão (sem clock): pesos juntam-se, perfil do estado mais recente', async () => {
  const srv = server();
  srv.row = { state: { profile: { goal: 'cut', age: 30 }, weights: [{ date: '2026-09-01', kg: 82 }] }, updated_at: 5000 };
  const A = device(srv, { profile: { goal: 'bulk', age: 30 }, weights: [{ date: '2026-09-02', kg: 81 }], updatedAt: 9000 });
  await A.sync.pull();
  assert.equal(W(A), '2026-09-01=82,2026-09-02=81');
  assert.equal(A.s.profile.goal, 'bulk');
});

test('escritas cruzadas na mesma versão: a segunda falha, junta e repete, sem perder nada', async () => {
  const srv = server();
  const A = device(srv, base()), B = device(srv, {});
  await A.sync.pull(); await B.sync.pull();
  A.edit(s => s.weights.push({ date: '2026-10-05', kg: 78 }));
  B.edit(s => s.weights.push({ date: '2026-10-06', kg: 77 }));
  await Promise.all([A.sync.push(), B.sync.push()]);
  await A.sync.pull(); await B.sync.pull();
  assert.equal(W(A), '2026-10-01=80,2026-10-05=78,2026-10-06=77');
  assert.equal(M.stable(A.s), M.stable(B.s));
});

test('depois de convergir, puxar outra vez não escreve nada (sem pingue-pongue)', async () => {
  const srv = server();
  const A = device(srv, base()), B = device(srv, {});
  await A.sync.pull(); await B.sync.pull();
  A.edit(s => s.weights.push({ date: '2026-10-07', kg: 76 }));
  B.edit(s => { s.dismissed = { aveia: true }; });
  await A.sync.push(); await B.sync.push(); await A.sync.pull(); await B.sync.pull();
  const w = srv.writes;
  for (let i = 0; i < 3; i++) { await A.sync.pull(); await B.sync.pull(); }
  assert.equal(srv.writes, w);
});

test('relógio atrasado: uma alteração feita depois de ver outra mais recente ganha na mesma', async () => {
  const srv = server();
  let ta = 10_000, tb = 1_000; // B tem o relógio 9 s atrasado
  const A = device(srv, base(), () => ta), B = device(srv, {}, () => tb);
  await A.sync.pull(); await B.sync.pull();
  A.edit(s => { s.profile.weight = 79; }); await A.sync.push();
  await B.sync.pull();
  tb += 100; B.edit(s => { s.profile.weight = 78; }); await B.sync.push();
  await A.sync.pull();
  assert.equal(A.s.profile.weight, 78);
});

test('lápides com mais de 90 dias são esquecidas', () => {
  const now = 200 * 864e5;
  const c = M.stamp({ weights: [{ date: 'a', kg: 1 }] }, { weights: [] }, {}, 10 * 864e5);
  assert.ok('weights:a' in c);
  const c2 = M.stamp({ weights: [] }, { weights: [{ date: 'b', kg: 2 }] }, c, now);
  assert.ok(!('weights:a' in c2)); assert.ok('weights:b' in c2);
});

test('mudar o separador ou a ordem das chaves não conta como alteração', () => {
  const c = M.stamp({ profile: { a: 1, b: 2 } }, { profile: { b: 2, a: 1 } }, {}, 5, 1);
  assert.deepEqual(c, { 'profile:a': 1, 'profile:b': 1 }); // só a hora antiga, congelada; nada marcado como novo
});
