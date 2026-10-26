// Motor de cálculo: metas (regras old school por kg), TDEE adaptativo, gerador de plano e análise.
(function () {
  const MF = window.MF || (window.MF = {});

  // Tabela do David — multiplicadores por kg de peso corporal. Verificada a 2026-10-26 contra as regras
  // old school (kcal/lb ×10–12 / ×15 / ×18–20) e Iraki 2019, Helms 2014, ISSN 2017; ajustados cut e hidratos do bulk agressivo.
  // Os hidratos são sempre o resto (Helms 2014, Iraki 2019): o intervalo c só serve para avisar.
  // rate = ritmo alvo de variação de peso, em % do peso corporal por semana.
  MF.GOALS = {
    maint:   { kcal: [30, 34], p: [1.8, 2.2], c: [3, 5], f: [0.8, 1.2], rate: 0 },
    bulk:    { kcal: [35, 38], p: [2.0, 2.2], c: [4, 6], f: [0.8, 1.2], rate: 0.25 },
    bulkAgg: { kcal: [38, 42], p: [2.0, 2.5], c: [4.5, 7], f: [1.0, 1.5], rate: 0.5 }, // hidratos 6–8 não cabiam em ×38–42; com a fibra contada, o meio dá ~4,7 (2026-10-26)
    cut:     { kcal: [24, 28], p: [2.2, 2.8], c: [1.5, 4], f: [0.7, 1.0], rate: -0.75 }, // era ×25–30: o teto tocava a manutenção (×30); old school ×10–12 kcal/lb ≈ ×22–26
    cutAgg:  { kcal: [22, 28], p: [2.2, 2.8], c: [1.5, 4], f: [0.7, 1.0], rate: -1.0 },
  };
  MF.GOAL_ORDER = ['cutAgg', 'cut', 'maint', 'bulk', 'bulkAgg'];

  const mid = r => (r[0] + r[1]) / 2;
  const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const round = (x, s = 1) => Math.round(x / s) * s;
  MF.util = { mid, lerp, clamp, round };

  MF.ACTIVITY = [1.2, 1.375, 1.55, 1.725, 1.9];
  MF.KCAL_PER_KG = 7700; // energia aproximada de 1 kg de massa corporal

  MF.mifflin = function (p) {
    if (!p.age || !p.height || !p.weight) return null;
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'F' ? -161 : 5);
    return { bmr, tdee: bmr * (p.activity || 1.55) };
  };

  MF.computeTargets = function (p) {
    const g = MF.GOALS[p.goal] || MF.GOALS.maint;
    const kg = p.weight;
    const pKg = p.protein ?? mid(g.p);
    const fKg = p.fat ?? mid(g.f);
    const prot = pKg * kg, fat = fKg * kg;
    const kcalMult = lerp(g.kcal, p.kcalPos ?? 0.5);
    let kcal, carbs;
    if (p.mode === 'macros') {
      carbs = (p.carbs ?? mid(g.c)) * kg;
      kcal = (prot * 4 + carbs * 4 + fat * 9) / (1 - 2 * 14 / 1000); // inclui a fibra prevista
    } else {
      kcal = p.kcalOverride || kcalMult * kg;
      // Energia à moda da UE: a fibra também conta (2 kcal/g). Os hidratos enchem o que sobra
      // depois de proteína, gordura e da fibra prevista (14 g por 1000 kcal).
      carbs = Math.max(0, (kcal - prot * 4 - fat * 9 - 2 * (kcal / 1000) * 14) / 4);
    }
    const cKg = carbs / kg;
    const warnings = [];
    if (cKg < g.c[0] - 0.05) warnings.push({ k: 'wCarbsLow', v: { min: g.c[0], val: cKg.toFixed(1) } });
    if (cKg > g.c[1] + 0.05) warnings.push({ k: 'wCarbsHigh', v: { max: g.c[1], val: cKg.toFixed(1) } });
    if (pKg < g.p[0] || pKg > g.p[1]) warnings.push({ k: 'wProtRange', v: { a: g.p[0], b: g.p[1] } });
    if (fKg < g.f[0] || fKg > g.f[1]) warnings.push({ k: 'wFatRange', v: { a: g.f[0], b: g.f[1] } });
    if (fKg < 0.6) warnings.push({ k: 'wFatHormones' });
    const bmi = p.height ? kg / Math.pow(p.height / 100, 2) : 0;
    if (bmi >= 30 || (p.bodyfat && p.bodyfat >= 28)) warnings.push({ k: 'wHighBF' });
    const maintOld = mid(MF.GOALS.maint.kcal) * kg;
    return {
      kcal, p: prot, c: carbs, f: fat, pKg, fKg, cKg, kcalMult: kcal / kg,
      goal: g, fiber: (kcal / 1000) * 14, maintOld, mifflin: MF.mifflin(p), warnings,
    };
  };

  // Proteína por refeição: 0.4–0.55 g/kg (Schoenfeld & Aragon, 2018). Mínimo prático 3, máximo 6.
  MF.recommendMeals = function (targets, kg) {
    const ideal = clamp(Math.ceil(targets.pKg / 0.55), 3, 6);
    return { min: 3, max: 6, ideal, low: 0.4 * kg, high: 0.55 * kg };
  };

  // ---------- Plano ----------
  MF.MEAL_LAYOUTS = { 3: ['B', 'M', 'M'], 4: ['B', 'M', 'S', 'M'], 5: ['B', 'S', 'M', 'S', 'M'], 6: ['B', 'S', 'M', 'S', 'M', 'S'] };
  MF.MEAL_NAMES = {
    3: ['breakfast', 'lunch', 'dinner'],
    4: ['breakfast', 'lunch', 'afternoonSnack', 'dinner'],
    5: ['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner'],
    6: ['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner', 'supper'],
  };
  MF.MEAL_WEIGHT = { B: 1, M: 1.3, S: 0.65 };
  const SLOTS = {
    B: [['P'], ['C'], ['R'], ['F']],
    M: [['P'], ['C'], ['V'], ['F']],
    S: [['P'], ['R', 'C'], ['F']],
  };

  MF.role = f => ({ prot: 'P', protfat: 'P', dairy: 'P', carb: 'C', fat: 'F', veg: 'V', fruit: 'R' }[f.cat]);
  MF.isFixedRole = f => f.cat === 'veg' || f.cat === 'fruit';
  MF.defaultG = f => f.por || (f.unit ? f.unit.g : 100);
  MF.stepOf = f => (f.unit ? f.unit.g : f.step || 5);
  MF.maxOf = f => f.max || ({ prot: 300, protfat: 250, dairy: 400, carb: 200, fat: 30 }[f.cat] || 300);

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  MF.totals = function (items, fmap) {
    const t = { k: 0, p: 0, c: 0, f: 0, fb: 0 };
    for (const it of items) {
      const f = fmap[it.id]; if (!f) continue;
      const q = it.g / 100;
      t.k += f.k * q; t.p += f.p * q; t.c += f.c * q; t.f += f.f * q; t.fb += (f.fb || 0) * q;
    }
    return t;
  };
  MF.dayTotals = (day, fmap) => MF.totals(day.meals.flatMap(m => m.items), fmap);

  // Erro medido em kcal por macro; proteína pesa mais (é a prioridade num cut/bulk).
  const W = { p: 1.6 * 16, c: 1 * 16, f: 1.2 * 81 };
  function objective(x, A, t) {
    let s = 0;
    for (const m of ['p', 'c', 'f']) {
      let v = -t[m];
      for (let j = 0; j < x.length; j++) v += A[j][m] * x[j];
      s += W[m] * v * v;
    }
    return s;
  }

  // Mínimos quadrados com limites por alimento (descida por coordenadas) + arredondamento à porção.
  function solveMeal(meal, target, fmap) {
    const fixed = [], vars = [];
    for (const it of meal.items) {
      const f = fmap[it.id]; if (!f) continue;
      (it.locked || MF.isFixedRole(f) ? fixed : vars).push(it);
    }
    const ft = MF.totals(fixed, fmap);
    const t = { p: Math.max(0, target.p - ft.p), c: Math.max(0, target.c - ft.c), f: Math.max(0, target.f - ft.f) };
    if (!vars.length) return;
    const foods = vars.map(it => fmap[it.id]);
    const A = foods.map(f => ({ p: f.p / 100, c: f.c / 100, f: f.f / 100 }));
    const hi = foods.map(MF.maxOf);
    const x = foods.map((f, j) => Math.min(MF.defaultG(f), hi[j]));
    for (let it = 0; it < 400; it++) {
      for (let j = 0; j < x.length; j++) {
        let g = 0, h = 0;
        for (const m of ['p', 'c', 'f']) {
          let r = -t[m];
          for (let k = 0; k < x.length; k++) r += A[k][m] * x[k];
          g += W[m] * r * A[j][m]; h += W[m] * A[j][m] * A[j][m];
        }
        if (h > 0) x[j] = clamp(x[j] - g / h, 0, hi[j]);
      }
    }
    const st = foods.map(MF.stepOf);
    for (let j = 0; j < x.length; j++) x[j] = clamp(round(x[j], st[j]), 0, Math.floor(hi[j] / st[j]) * st[j]);
    for (let pass = 0; pass < 30; pass++) {
      let improved = false;
      for (let j = 0; j < x.length; j++) {
        const base = objective(x, A, t);
        for (const d of [st[j], -st[j]]) {
          const nv = x[j] + d;
          if (nv < 0 || nv > hi[j]) continue;
          x[j] = nv;
          if (objective(x, A, t) < base - 1e-6) { improved = true; break; }
          x[j] -= d;
        }
      }
      if (!improved) break;
    }
    vars.forEach((it, j) => { it.g = x[j]; });
    meal.items = meal.items.filter(it => !(vars.includes(it) && it.g <= 0));
  }

  // Resolve as refeições por ordem; cada uma recebe a sua quota do que AINDA falta no dia,
  // por isso os erros de arredondamento corrigem-se nas refeições seguintes.
  MF.solveDay = function (day, targets, fmap, available) {
    solvePass(day, targets, fmap);
    if (available && available.length) repair(day, targets, fmap, available);
    return day;
  };

  // Se um macro fica curto (os limites realistas por refeição não chegam), junta uma segunda
  // fonte desse macro à refeição que melhor a aceita e volta a resolver.
  const KC = { p: 4, c: 4, f: 9 }, ROLE_OF = { p: 'P', c: 'C', f: 'F' };
  function repair(day, targets, fmap, available) {
    const tried = new Set();
    for (let iter = 0; iter < 8; iter++) {
      const tot = MF.dayTotals(day, fmap);
      const gaps = ['p', 'c', 'f'].map(m => ({ m, d: targets[m] ? (targets[m] - tot[m]) / targets[m] : 0 }))
        .filter(x => x.d > 0.04).sort((a, b) => b.d - a.d);
      if (!gaps.length) return;
      let added = false;
      for (const g of gaps) {
        const cands = available.filter(f => MF.role(f) === ROLE_OF[g.m])
          .sort((a, b) => b[g.m] * KC[g.m] / b.k - a[g.m] * KC[g.m] / a.k);
        for (const f of cands) {
          const meals = day.meals.map((m, i) => ({ m, i }))
            .filter(({ m, i }) => f.m.includes(m.type) && !m.items.some(it => it.id === f.id) && !tried.has(f.id + ':' + i));
          if (!meals.length) continue;
          const cnt = m => m.items.filter(it => fmap[it.id] && MF.role(fmap[it.id]) === ROLE_OF[g.m]).length;
          meals.sort((a, b) => cnt(a.m) - cnt(b.m) || MF.MEAL_WEIGHT[b.m.type] - MF.MEAL_WEIGHT[a.m.type]);
          const { m, i } = meals[0];
          tried.add(f.id + ':' + i);
          m.items.push({ id: f.id, g: MF.defaultG(f) });
          added = true; break;
        }
        if (added) break;
      }
      if (!added) return;
      solvePass(day, targets, fmap);
    }
  }

  function solvePass(day, targets, fmap) {
    const w = day.meals.map(m => MF.MEAL_WEIGHT[m.type] || 1);
    let remW = w.reduce((a, b) => a + b, 0);
    const rem = { p: targets.p, c: targets.c, f: targets.f };
    day.meals.forEach((meal, i) => {
      const share = w[i] / remW;
      solveMeal(meal, { p: rem.p * share, c: rem.c * share, f: rem.f * share }, fmap);
      const tot = MF.totals(meal.items, fmap);
      rem.p = Math.max(0, rem.p - tot.p); rem.c = Math.max(0, rem.c - tot.c); rem.f = Math.max(0, rem.f - tot.f);
      remW -= w[i];
    });
  }

  MF.generatePlan = function ({ available, nMeals, nDays, seed, targets, fmap }) {
    const r = rng(seed);
    const layout = MF.MEAL_LAYOUTS[nMeals];
    const byRole = { P: [], C: [], F: [], V: [], R: [] };
    for (const f of available) byRole[MF.role(f)]?.push(f);
    for (const k in byRole) byRole[k] = shuffle(byRole[k], r);
    // Escolha por "menos usado": evita o que esta mesma refeição teve no dia anterior e
    // prefere o que apareceu menos vezes no plano. (A rotação simples anterior, com 2 opções
    // e 2 refeições principais, voltava ao mesmo ponto todos os dias.)
    const uses = {}, slotHist = {};
    function pick(role, type, avoid, slotKey) {
      let cands = byRole[role].filter(f => f.m.includes(type));
      if (!cands.length && (role === 'P' || role === 'C')) cands = byRole[role];
      if (!cands.length) return null;
      const hist = slotHist[slotKey] || (slotHist[slotKey] = []); // mais recente primeiro
      const recency = id => (hist[0] === id ? 100 : 0) + (hist[1] === id ? 40 : 0);
      const best = cands
        .map((f, i) => ({ f, i, s: (avoid.has(f.id) ? 1000 : 0) + recency(f.id) + 3 * (uses[f.id] || 0) }))
        .sort((a, b) => a.s - b.s || a.i - b.i)[0].f;
      uses[best.id] = (uses[best.id] || 0) + 1;
      hist.unshift(best.id);
      return best;
    }

    const days = [];
    for (let d = 0; d < nDays; d++) {
      const usedP = new Set();
      const meals = layout.map((type, mi) => {
        const items = [], inMeal = new Set();
        SLOTS[type].forEach((slot, si) => {
          // lanches alternam fruta/hidrato entre refeições e entre dias
          const roles = slot.length > 1 && (mi + d) % 2 ? slot.slice().reverse() : slot;
          for (const role of roles) {
            const avoid = new Set([...inMeal, ...(role === 'P' ? usedP : [])]);
            const f = pick(role, type, avoid, mi + ':' + si);
            if (!f) continue;
            items.push({ id: f.id, g: MF.defaultG(f) });
            inMeal.add(f.id);
            if (role === 'P') usedP.add(f.id);
            break;
          }
        });
        return { type, name: MF.MEAL_NAMES[nMeals][mi], items };
      });
      days.push(MF.solveDay({ meals }, targets, fmap, available));
    }
    return { days, seed, nMeals, nDays, createdAt: Date.now() };
  };

  // ---------- Análise: o que falta e o que está coberto ----------
  MF.analyze = function (plan, targets, available, allFoods, fmap) {
    const have = r => available.filter(f => MF.role(f) === r);
    const missing = [], ok = [], tips = [];
    const notAvail = cat => allFoods.filter(f => cat.includes(f.cat) && !available.includes(f));
    const sugg = (cats, sortKey) => notAvail(cats).sort(sortKey).slice(0, 4).map(f => f.id);

    const lean = available.filter(f => (f.cat === 'prot' || f.cat === 'dairy') && f.p * 4 / f.k > 0.6);
    if (!have('P').length) missing.push({ k: 'mNoProtein', s: sugg(['prot'], (a, b) => b.p / b.k - a.p / a.k) });
    else if (!lean.length) missing.push({ k: 'mNoLean', s: sugg(['prot', 'dairy'], (a, b) => b.p / b.k - a.p / a.k) });
    else ok.push({ k: 'okProtein', n: have('P').length });
    if (!have('C').length) missing.push({ k: 'mNoCarb', s: sugg(['carb'], (a, b) => b.fb - a.fb) });
    else ok.push({ k: 'okCarb', n: have('C').length });
    if (!have('V').length) missing.push({ k: 'mNoVeg', s: sugg(['veg'], (a, b) => b.fb - a.fb) });
    else ok.push({ k: 'okVeg', n: have('V').length });
    if (!have('R').length) missing.push({ k: 'mNoFruit', s: sugg(['fruit'], (a, b) => b.fb - a.fb) });
    else ok.push({ k: 'okFruit', n: have('R').length });
    if (!have('F').length) missing.push({ k: 'mNoFat', s: sugg(['fat'], () => 0) });
    else ok.push({ k: 'okFat', n: have('F').length });
    // Dias repetidos: com poucas opções o gerador não tem por onde variar — dizê-lo e sugerir o que juntar.
    let repeats = false;
    if (plan && plan.days.length > 1) {
      const sig = d => d.meals.map(m => m.items.map(i => i.id).sort().join('+')).join('|');
      const uniq = new Set(plan.days.map(sig)).size;
      if (uniq < plan.days.length) {
        repeats = true;
        const counts = { P: have('P').length, C: have('C').length, V: have('V').length, R: have('R').length };
        const CAT_OF = { P: ['prot', 'dairy', 'protfat'], C: ['carb'], V: ['veg'], R: ['fruit'] };
        const worst = Object.keys(counts).sort((a, b) => counts[a] - counts[b])[0];
        missing.push({ k: 'mRepeat', v: { u: uniq, n: plan.days.length, p: counts.P, c: counts.C, vv: counts.V, r: counts.R }, s: sugg(CAT_OF[worst], () => 0) });
      }
    }
    if (!repeats && have('P').length && have('P').length < 3) tips.push({ k: 'tVariety' });

    if (plan && plan.days.length) {
      const tots = plan.days.map(d => MF.dayTotals(d, fmap));
      const avg = k => tots.reduce((s, t) => s + t[k], 0) / tots.length;
      const dev = (a, b) => (b ? (a - b) / b : 0);
      const dp = dev(avg('p'), targets.p), dc = dev(avg('c'), targets.c), df = dev(avg('f'), targets.f), dk = dev(avg('k'), targets.kcal);
      if (dp < -0.07) missing.push({ k: 'mLowP', v: { g: Math.round(targets.p - avg('p')) }, s: sugg(['prot', 'dairy'], (a, b) => b.p / b.k - a.p / a.k) });
      if (dc < -0.07) missing.push({ k: 'mLowC', v: { g: Math.round(targets.c - avg('c')) }, s: sugg(['carb'], (a, b) => b.c / b.k - a.c / a.k) });
      if (df > 0.12) tips.push({ k: 'tHighF' });
      if (df < -0.12) missing.push({ k: 'mLowF', v: { g: Math.round(targets.f - avg('f')) }, s: sugg(['fat'], () => 0) });
      if (Math.abs(dp) <= 0.07 && Math.abs(dc) <= 0.07 && Math.abs(df) <= 0.12) ok.push({ k: 'okMacros', v: { kcal: Math.round(avg('k')), pct: (dk * 100).toFixed(1) } });
      const fb = avg('fb');
      if (fb < targets.fiber * 0.75) tips.push({ k: 'tFiber', v: { g: Math.round(fb), t: Math.round(targets.fiber) } });
      else ok.push({ k: 'okFiber', v: { g: Math.round(fb) } });
    }
    return { missing, ok, tips };
  };

  // ---------- Sugestões: alimentos ainda não escolhidos que melhoram a dieta ----------
  // Pontua cada alimento fora da seleção por motivos concretos e devolve os melhores,
  // no máximo 3 por papel (proteína/hidrato/...) para a lista não sair toda igual.
  MF.suggest = function ({ available, allFoods, plan, targets, fmap, dismissed = {}, limit = 8, perRoleCap = 3 }) {
    const availIds = new Set(available.map(f => f.id));
    const pool = allFoods.filter(f => !availIds.has(f.id) && !dismissed[f.id]);
    const score = {}, why = {};
    const add = (f, pts, reason) => { score[f.id] = (score[f.id] || 0) + pts; (why[f.id] || (why[f.id] = new Set())).add(reason); };

    // 1. Variedade por tipo de refeição que o plano tem
    const types = plan && plan.days.length ? [...new Set(plan.days[0].meals.map(m => m.type))] : ['B', 'M', 'S'];
    const need = { P: 3, C: 3, V: 2, R: 2 };
    for (const type of types) for (const role of ['P', 'C', 'V', 'R']) {
      if ((role === 'V' && type !== 'M') || (role === 'R' && type === 'M')) continue;
      const have = available.filter(f => MF.role(f) === role && f.m.includes(type)).length;
      if (have >= need[role]) continue;
      pool.filter(f => MF.role(f) === role && f.m.includes(type)).forEach(f => add(f, 10 * (need[role] - have), 'var' + type));
    }
    // 2. Conforme o objetivo
    const rate = targets.goal ? targets.goal.rate : 0;
    if (rate < 0) {
      pool.filter(f => (f.cat === 'prot' || f.cat === 'dairy') && f.p * 4 / f.k >= 0.7).forEach(f => add(f, 6, 'lean'));
      pool.filter(f => f.cat === 'veg').forEach(f => add(f, 3, 'volume'));
    }
    if (rate > 0) pool.filter(f => f.k >= 350 && (f.cat === 'carb' || f.cat === 'fat')).forEach(f => add(f, 5, 'dense'));
    // 3. Fibra abaixo da meta
    if (plan && plan.days.length) {
      const fb = plan.days.reduce((s, d) => s + MF.dayTotals(d, fmap).fb, 0) / plan.days.length;
      if (fb < targets.fiber * 0.9) pool.filter(f => f.fb * 100 / f.k >= 3).forEach(f => add(f, 6, 'fiber'));
    }
    // 4. Ómega-3 e cálcio
    const fish = ['salmao', 'sardinha'];
    if (!available.some(f => fish.includes(f.id))) pool.filter(f => fish.includes(f.id)).forEach(f => add(f, 4, 'omega3'));
    if (!available.some(f => f.cat === 'dairy')) pool.filter(f => f.cat === 'dairy' && f.id !== 'leite').forEach(f => add(f, 3, 'calcium'));
    // pequeno bónus aos básicos (fáceis de encontrar em qualquer supermercado)
    for (const id of MF.BASICS) if (score[id]) score[id] += 2;

    const perRole = {}, out = [];
    for (const id of Object.keys(score).sort((a, b) => score[b] - score[a])) {
      const r = MF.role(fmap[id]);
      if ((perRole[r] || 0) >= perRoleCap) continue;
      perRole[r] = (perRole[r] || 0) + 1;
      out.push({ id, why: [...why[id]], score: score[id] });
      if (out.length >= limit) break;
    }
    return out;
  };

  // Sugestões para uma refeição concreta (menu "+ Adicionar alimento")
  MF.suggestForMeal = function (type, opts, n = 5) {
    const all = MF.suggest({ ...opts, limit: 999, perRoleCap: Infinity }).filter(s => opts.fmap[s.id].m.includes(type));
    const ids = new Set(all.map(s => s.id));
    const avail = new Set(opts.available.map(f => f.id));
    const extra = MF.BASICS.filter(id => !ids.has(id) && !avail.has(id) && !(opts.dismissed || {})[id] && opts.fmap[id].m.includes(type));
    return all.map(s => s.id).concat(extra).slice(0, n);
  };

  // ---------- Medidas caseiras ----------
  // Fatores de conversão disponíveis para um alimento: gramas, a unidade natural e as medidas caseiras.
  MF.unitsOf = function (f) {
    const u = [['g', 1]];
    if (f.unit) u.push(['unit', f.unit.g]);
    for (const m of f.meas || []) u.push(m);
    return u;
  };
  const half = x => Math.round(x * 2) / 2;
  // Aproxima uma quantidade em medidas caseiras: [[medida, quantidade], ...].
  // Colheres combinam-se ("1 colher de sopa + 1½ de chá"); as outras medidas vão sozinhas.
  MF.household = function (f, g) {
    const ms = (f.meas || []).slice().sort((a, b) => b[1] - a[1]);
    if (!ms.length || g <= 0) return null;
    const small = ms[ms.length - 1];
    if (g < 0.25 * small[1]) return null;
    const i = ms.findIndex(m => g >= 0.75 * m[1]);
    if (i < 0) return [[small[0], 0.5]];
    const m = ms[i], next = ms[i + 1], count = g / m[1];
    const spoons = next && MF.SPOONS.includes(m[0]) && MF.SPOONS.includes(next[0]);
    // mais de 10 colheres já não é uma medida útil (ex.: 340 g de iogurte) — fica só em gramas
    if (MF.SPOONS.includes(m[0]) && count > 10) return null;
    if (!spoons || count >= 3) return [[m[0], Math.max(0.5, half(count))]];
    const nInt = Math.max(1, Math.floor(count + 0.15));
    const c2 = half((g - nInt * m[1]) / next[1]);
    return c2 >= 0.5 ? [[m[0], nInt], [next[0], c2]] : [[m[0], nInt]];
  };

  // ---------- Progresso: peso de tendência e TDEE adaptativo ----------
  MF.trend = function (entries) {
    const s = entries.slice().sort((a, b) => a.date.localeCompare(b.date));
    let ema = null;
    return s.map(e => { ema = ema == null ? e.kg : ema + 0.1 * (e.kg - ema); return { ...e, trend: ema }; });
  };
  const dayNum = d => Math.floor(new Date(d + 'T12:00:00').getTime() / 86400000);

  MF.adaptive = function (entries, targets, goal, windowDays = 28) {
    const tr = MF.trend(entries);
    if (tr.length < 2) return { enough: false, n: tr.length };
    const last = dayNum(tr[tr.length - 1].date);
    const win = tr.filter(e => last - dayNum(e.date) <= windowDays);
    const span = last - dayNum(win[0].date);
    const cur = tr[tr.length - 1].trend;
    if (win.length < 5 || span < 10) return { enough: false, n: win.length, span, cur };
    // regressão linear da tendência ao longo do tempo
    const xs = win.map(e => dayNum(e.date)), ys = win.map(e => e.trend);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    const slope = den ? num / den : 0; // kg/dia
    const logged = win.filter(e => e.kcal > 0);
    const assumed = logged.length < win.length / 2;
    const intake = assumed ? targets.kcal : logged.reduce((s, e) => s + e.kcal, 0) / logged.length;
    const tdee = intake - slope * MF.KCAL_PER_KG;
    const weeklyKg = slope * 7, weeklyPct = (weeklyKg / cur) * 100;
    const desiredKgDay = (goal.rate / 100) * cur / 7;
    const recommended = round(tdee + desiredKgDay * MF.KCAL_PER_KG, 10);
    const off = weeklyPct - goal.rate;
    const status = Math.abs(off) <= 0.25 ? 'onTrack' : (off > 0 ? 'above' : 'below');
    return { enough: true, cur, slope, weeklyKg, weeklyPct, intake, assumed, tdee, recommended, status, span, n: win.length };
  };
})();
