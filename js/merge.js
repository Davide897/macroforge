// Fusão por registo do estado sincronizado (vários aparelhos, local primeiro).
// O estado divide-se em "unidades": um peso por data, um alimento, uma preferência, um campo do perfil, o plano...
// Cada unidade tem a hora da última alteração em state.clock. Juntar dois estados escolhe, unidade a unidade,
// a alteração mais recente; apagar deixa uma lápide (hora no clock sem valor) para o registo não ressuscitar.
// Assim dois aparelhos que mudam coisas diferentes ficam ambos com tudo, em vez de o último apagar o outro.
(function (root) {
  const MF = root.MF || (root.MF = {});
  const TOMB_MS = 90 * 864e5;   // lápides guardadas 90 dias (um aparelho parado mais tempo pode ressuscitar um registo)

  // Coleções guardadas por registo, e como se tira a chave de cada elemento
  const LISTS = { weights: w => w && w.date, customFoods: f => f && f.id, photoMeta: p => p && p.id };
  const MAPS = ['foods', 'dismissed', 'shopChecked', 'photoDeleted'];
  const FIELDS = ['profile'];   // objetos fundidos campo a campo (mudar o objetivo num aparelho e a idade noutro: ficam os dois)
  const SEP = ':';

  // JSON com as chaves por ordem: dois estados iguais dão sempre o mesmo texto
  function stable(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : stable(x))).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }

  function units(state) {
    const out = new Map();
    if (!state || typeof state !== 'object') return out;
    for (const key of Object.keys(state)) {
      if (key === 'clock') continue;
      const v = state[key];
      if (v === undefined) continue;
      if (LISTS[key] && Array.isArray(v)) {
        for (const el of v) { const id = LISTS[key](el); if (typeof id === 'string' && id) out.set(key + SEP + id, el); }
      } else if ((MAPS.includes(key) || FIELDS.includes(key)) && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const id of Object.keys(v)) if (v[id] !== undefined) out.set(key + SEP + id, v[id]);
      } else out.set(key, v);
    }
    return out;
  }

  // Volta a montar o estado a partir das unidades. `keys`: chaves de topo que existiam nalgum dos lados.
  function rebuild(u, keys) {
    const st = {};
    for (const key of keys) {
      if (LISTS[key]) st[key] = [];
      else if (MAPS.includes(key) || FIELDS.includes(key)) st[key] = {};
    }
    for (const [uk, v] of u) {
      const i = uk.indexOf(SEP);
      const key = i < 0 ? uk : uk.slice(0, i), id = i < 0 ? null : uk.slice(i + 1);
      if (id !== null && LISTS[key]) (st[key] = st[key] || []).push(v);
      else if (id !== null && (MAPS.includes(key) || FIELDS.includes(key))) (st[key] = st[key] || {})[id] = v;
      else st[key] = v;
    }
    // ordem fixa (por chave): dois aparelhos chegam ao mesmo texto e não ficam a trocar versões
    for (const key of Object.keys(LISTS)) if (Array.isArray(st[key])) st[key].sort((a, b) => (LISTS[key](a) < LISTS[key](b) ? -1 : 1));
    return st;
  }

  // Hora para uma alteração nova: nunca abaixo de nada que este aparelho já viu (relógio atrasado não perde)
  function tick(clock, now) {
    let m = 0;
    for (const k in clock) if (clock[k] > m) m = clock[k];
    return Math.max(now, m + 1);
  }

  // Marca no clock as unidades que mudaram de `prev` para `next` (inclui lápides das que desapareceram).
  // `legacy`: hora do estado antes desta alteração. Unidades ainda sem hora (dados de antes desta versão) ficam
  // com ela, congelada: senão cada alteração nova faria os valores antigos parecer recentes.
  function stamp(prev, next, clock, now = Date.now(), legacy = 0) {
    const c = { ...(clock || {}) };
    const a = units(prev), b = units(next);
    const t = tick(c, now);
    for (const [k, v] of b) {
      if (!a.has(k) || stable(a.get(k)) !== stable(v)) c[k] = t;
      else if (!(k in c)) c[k] = legacy;
    }
    for (const k of a.keys()) if (!b.has(k)) c[k] = t;
    for (const k of Object.keys(c)) if (!b.has(k) && c[k] < now - TOMB_MS) delete c[k];
    return c;
  }

  // Junta dois estados. lts/rts: hora do estado inteiro, usada para unidades ainda sem hora própria
  // (dados de antes desta versão), que assim se comportam como antes mas registo a registo.
  function merge(L, R, lts = 0, rts = 0) {
    L = L || {}; R = R || {};
    const lu = units(L), ru = units(R), lc = L.clock || {}, rc = R.clock || {};
    const all = new Set([...lu.keys(), ...Object.keys(lc), ...ru.keys(), ...Object.keys(rc)]);
    const out = new Map(), clock = {};
    for (const k of all) {
      const tl = k in lc ? lc[k] : lu.has(k) ? lts : -Infinity;
      const tr = k in rc ? rc[k] : ru.has(k) ? rts : -Infinity;
      let side;
      if (tl !== tr) side = tl > tr ? 'L' : 'R';
      else if (lu.has(k) !== ru.has(k)) side = lu.has(k) ? 'L' : 'R';         // empate: quem tem o valor ganha à lápide
      else side = stable(lu.get(k)) >= stable(ru.get(k)) ? 'L' : 'R';         // empate: escolha fixa, igual nos dois aparelhos
      const src = side === 'L' ? lu : ru;
      if (src.has(k)) out.set(k, src.get(k));
      const tk = Math.max(tl, tr);
      if (Number.isFinite(tk)) clock[k] = tk;        // depois da primeira junção todas as unidades têm hora própria
    }
    const keys = new Set([...Object.keys(L), ...Object.keys(R)].filter(k => k !== 'clock'));
    return { ...rebuild(out, keys), clock };
  }

  // Protocolo com o servidor. A linha do servidor tem uma versão (updated_at); só se escreve por cima da versão
  // que se juntou (escrita condicional). Se outro aparelho escreveu entretanto, a escrita falha: puxa, junta e repete.
  // io: fetch() -> {state, updated_at} | null · insert(state, v) -> 'ok' | 'conflict' · cas(state, v, base) -> true | false
  //     getLocal() -> {payload, updatedAt} · apply(state, v): pôr o estado junto neste aparelho
  function createStateSync(io) {
    let base = null;           // versão do servidor que este aparelho já juntou
    const MAX = 4;
    async function pull(depth = 0) {
      const row = await io.fetch();
      const cur = io.getLocal();
      if (!row) {
        const v = Date.now();
        const first = merge(cur.payload, {}, cur.updatedAt || 0, 0);   // primeira escrita já com hora em cada unidade
        if ((await io.insert(first, v)) === 'ok') {
          base = v;
          if (stable(first) !== stable(cur.payload)) io.apply(first, v);
          return { pushed: true };
        }
        if (depth >= MAX) throw new Error('syncConflict');
        return pull(depth + 1);
      }
      const merged = merge(cur.payload, row.state || {}, cur.updatedAt || 0, row.updated_at || 0);
      base = row.updated_at;
      let applied = false;
      if (stable(merged) !== stable(cur.payload)) { io.apply(merged, row.updated_at); applied = true; }
      if (stable(merged) !== stable(row.state || {})) return { applied, ...(await push(depth)) };
      return { applied };
    }
    async function push(depth = 0) {
      if (base === null) return pull(depth);
      const cur = io.getLocal();
      const v = Math.max(Date.now(), base + 1);
      if (await io.cas(cur.payload, v, base)) { base = v; return { pushed: true }; }
      if (depth >= MAX) throw new Error('syncConflict');
      return pull(depth + 1);
    }
    return { pull, push, reset() { base = null; }, get base() { return base; } };
  }

  MF.merge = { stable, units, stamp, merge, createStateSync, TOMB_MS };
  if (typeof module === 'object' && module.exports) module.exports = MF.merge;
})(typeof window !== 'undefined' ? window : globalThis);
