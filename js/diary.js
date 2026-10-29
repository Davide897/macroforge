// Diário alimentar: o que foi mesmo comido, por dia e refeição.
// state.diary = { "<data>/<id>": { m: refeição, f: id do alimento, g: gramas, v: [kcal, P, C, G] por 100 g, n?: nome } }
// Cada entrada é um registo próprio na sincronização (merge.js), por isso dois aparelhos podem registar no mesmo dia.
// Os valores do alimento ficam copiados na entrada: corrigir ou apagar o alimento depois não muda o que já foi comido.
(function (root) {
  const MF = root.MF || (root.MF = {});
  const MEALS = ['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner', 'supper'];
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const KEY = /^(\d{4}-\d{2}-\d{2})\/([a-z0-9]{4,24})$/;
  const FID = /^[\w.\-]{1,80}$/;
  const r1 = x => Math.round(x * 10) / 10;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  const key = (date, id) => `${date}/${id || newId()}`;
  const dateOf = k => k.slice(0, 10);

  // Entrada a partir de um alimento. `keepName`: guardar o nome (alimentos próprios ou da comunidade podem desaparecer).
  function entry(food, meal, g, keepName) {
    const e = { m: meal, f: food.id, g: r1(g), v: [Math.round(food.k), r1(food.p), r1(food.c), r1(food.f)] };
    if (keepName) e.n = String(food.pt || '').slice(0, 60);
    return e;
  }

  // Entradas de um dia, por ordem de registo
  function day(diary, date) {
    return Object.entries(diary || {}).filter(([k]) => dateOf(k) === date)
      .map(([k, e]) => ({ key: k, ...e })).sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  function totals(list) {
    const t = { k: 0, p: 0, c: 0, f: 0 };
    for (const e of list) { const q = e.g / 100; t.k += e.v[0] * q; t.p += e.v[1] * q; t.c += e.v[2] * q; t.f += e.v[3] * q; }
    return t;
  }

  // Resumo dos últimos `n` dias até `last` (inclusive): [{date, k, p, c, f, count}]
  function recent(diary, last, n = 7) {
    const out = [];
    const d0 = new Date(last + 'T12:00:00');
    for (let i = 0; i < n; i++) {
      const d = new Date(d0); d.setDate(d0.getDate() - i);
      const date = localDate(d);
      const list = day(diary, date);
      out.push({ date, count: list.length, ...totals(list) });
    }
    return out;
  }

  // Data local (não UTC): depois da meia-noite em Portugal já é o dia seguinte
  function localDate(d = new Date()) {
    const p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function shift(date, days) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + days); return localDate(d); }

  // Só passam entradas com a forma esperada (vêm da nuvem, de cópias de segurança importadas...)
  function sanitize(diary) {
    const out = {};
    if (!diary || typeof diary !== 'object' || Array.isArray(diary)) return out;
    const num = (x, a, b) => { const v = +x; return Number.isFinite(v) && v >= a && v <= b ? v : null; };
    for (const [k, e] of Object.entries(diary)) {
      if (!KEY.test(k) || !e || typeof e !== 'object') continue;
      if (!MEALS.includes(e.m) || typeof e.f !== 'string' || !FID.test(e.f) || num(e.g, 0.1, 5000) === null) continue;
      if (!Array.isArray(e.v) || e.v.length !== 4) continue;
      const v = [num(e.v[0], 0, 950), num(e.v[1], 0, 100), num(e.v[2], 0, 100), num(e.v[3], 0, 100)];
      if (v.includes(null)) continue;
      const o = { m: e.m, f: e.f, g: +e.g, v };
      if (typeof e.n === 'string' && e.n) o.n = e.n.slice(0, 60);
      out[k] = o;
    }
    return out;
  }

  MF.diary = { MEALS, DATE, entry, key, day, totals, recent, localDate, shift, sanitize, dateOf };
  if (typeof module === 'object' && module.exports) module.exports = MF.diary;
})(typeof window !== 'undefined' ? window : globalThis);
