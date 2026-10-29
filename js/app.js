(function () {
  const MF = window.MF;
  const { mid, clamp } = MF.util;
  let S = MF.store.load();
  let photoURLs = [];
  let foodQuery = '';

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = (k, v) => MF.t(S.lang, k, v);
  const fname = f => (f ? (S.lang === 'en' ? f.en || f.pt : f.pt) : '?');
  const allFoods = () => MF.FOODS.concat(S.customFoods, S.sharedFoods || []);
  const fmap = () => Object.fromEntries(allFoods().map(f => [f.id, f]));
  const available = () => allFoods().filter(f => S.foods[f.id]?.like && S.foods[f.id]?.buy);
  const targets = () => MF.computeTargets(S.profile);
  const save = () => MF.store.save(S);
  const n = (x, d = 0) => Number(x).toLocaleString(S.lang === 'en' ? 'en-GB' : 'pt-PT', { maximumFractionDigits: d, minimumFractionDigits: d });
  const today = () => new Date().toISOString().slice(0, 10);
  const dayNum = d => Math.floor(new Date(d + 'T12:00:00').getTime() / 86400000);
  const sel = c => (c ? 'selected' : '');
  const chk = c => (c ? 'checked' : '');
  const IMG = { cat: c => `img/cat-${c}.jpg`, goal: g => `img/goal-${g}.jpg`,
    meal: name => `img/meal-${({ morningSnack: 'snack', afternoonSnack: 'snack' })[name] || name}.jpg` };
  const tkey = T => [T.kcal, T.p, T.c, T.f].map(Math.round).join('|');
  const akey = () => available().map(f => f.id).sort().join(',');
  const hasManual = plan => plan.days.some(d => d.meals.some(m => m.items.some(i => i.locked)));

  const ICON = {
    lock: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3z"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5h2a3 3 0 1 1 6 0v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5h0v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="2"/></svg>',
  };

  // ---------------- Shell ----------------
  const TABS = ['goals', 'foods', 'plan', 'shop', 'progress'];
  const TAB_KEY = { goals: 'tabGoals', foods: 'tabFoods', plan: 'tabPlan', shop: 'tabShop', progress: 'tabProgress' };
  const TAB_ICON = {
    goals: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    foods: 'M7 2v9a3 3 0 0 0 2 2.8V22h2v-8.2A3 3 0 0 0 13 11V2h-2v7h-1V2H9v7H8V2zm9 0c-1.7 0-3 2.2-3 5v6h2v9h2V2z',
    plan: 'M4 4h16v2H4zm0 5h16v2H4zm0 5h10v2H4zm0 5h10v2H4z',
    shop: 'M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 2h3l2.7 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L22 6H7.2L6.6 3.6A2 2 0 0 0 4.7 2z',
    progress: 'M3 20h18v2H3zM5 17l4-6 4 3 6-9 1.6 1.2-7.1 10.6-4-3-2.9 4.4z',
  };

  function shell() {
    const nav = TABS.map(k => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">
      <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="${TAB_ICON[k]}"/></svg><span>${t(TAB_KEY[k])}</span></button>`).join('');
    return `<header class="top">
      <div class="brand"><div class="logo">M</div><div><h1>MacroForge</h1><p>${t('tagline')}</p></div></div>
      <div class="tools">
        <div class="seg"><button class="${S.lang === 'pt' ? 'on' : ''}" data-act="lang" data-v="pt">PT</button><button class="${S.lang === 'en' ? 'on' : ''}" data-act="lang" data-v="en">EN</button></div>
        <span class="sync-slot">${syncPill()}</span>
        <a class="icon help-btn" href="ajuda.html" title="${esc(t('help'))}" aria-label="${esc(t('help'))}">?</a>
        <button class="icon" data-act="theme" title="Theme">${ICON.sun}</button>
      </div>
    </header>
    <nav class="tabs">${nav}</nav>
    <main id="view"></main>
    <div id="toast"></div>`;
  }

  function render() {
    document.documentElement.lang = S.lang;
    document.documentElement.dataset.theme = S.theme;
    const gate = gateState();
    if (gate !== 'app') { $('#app').innerHTML = gateHTML(gate); return; }
    $('#app').innerHTML = shell();
    $('#view').innerHTML = VIEWS[S.tab]();
    AFTER[S.tab]?.();
  }
  // Com o ecrã de entrada à vista (sessão terminada) não há #view: redesenha o ecrã certo
  function rerenderView() { if (!$('#view') || gateState() !== 'app') return render(); $('#view').innerHTML = VIEWS[S.tab](); AFTER[S.tab]?.(); }
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }


  // ---------------- Conta e sincronização ----------------
  const SY = () => MF.sync && MF.sync.available ? MF.sync : null;
  function syncPill() {
    const sy = SY(); if (!sy) return '';
    const st = sy.user ? sy.status : 'off';
    return `<button class="sync-pill s-${st}" data-act="account" title="${esc(sy.error || '')}">${st === 'syncing' ? '<span class="spinner"></span>' : '<span class="dot"></span>'}<span>${t('sync_' + st)}</span></button>`;
  }
  function accountCard() {
    const sy = SY(); if (!sy) return '';
    if (sy.recovering) return `<section class="card account" id="account"><h2>${t('accNewPw')}</h2>
      <form id="newPwForm" class="form cols3"><label>${t('password')}<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <div><button class="btn" type="submit">${t('save')}</button></div></form><div id="authMsg"></div></section>`;
    if (!sy.user) return `<section class="card account" id="account">
      <h2>${t('accTitle')}</h2><p class="muted small">${t('accHelp')}</p>
      <form id="authForm" class="form cols3">
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>${t('password')}<input name="password" type="password" minlength="8" required autocomplete="current-password"></label>
        <div class="row gap"><button class="btn" type="submit" value="in">${t('signIn')}</button><button class="btn ghost" type="submit" value="up">${t('signUp')}</button></div>
        <label class="inline consent span4"><input type="checkbox" name="consent"> <span>${t('consent')} <a href="privacy.html" target="_blank" rel="noopener">${t('privacyLink')}</a></span></label>
      </form>
      <button class="linkbtn" data-act="forgot">${t('forgot')}</button>
      <div id="authMsg"></div></section>`;
    const last = sy.lastSync ? new Date(sy.lastSync).toLocaleString(S.lang === 'en' ? 'en-GB' : 'pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    return `<section class="card account" id="account">
      <div class="row between wrap gap"><div><h2>${t('accTitle')}</h2>
        <p class="muted small">${t('accSignedIn', { email: esc(sy.user.email) })} · ${t('accLast', { t: last })}</p>
        ${sy.error ? `<p class="small" style="color:var(--warn)">${esc(sy.error)}</p>` : ''}</div>
        <div class="row gap">${syncPill()}<button class="btn small" data-act="syncNow">${t('syncNow')}</button><button class="btn small ghost" data-act="signOut">${t('signOut')}</button></div></div>
      <p class="muted small">${t('accHow')} <a href="privacy.html" target="_blank" rel="noopener">${t('privacyLink')}</a></p>
      <details class="danger"><summary>${t('deleteAccount')}</summary>
        <p class="small">${t('deleteWarn')}</p>
        <button class="btn small danger-btn" data-act="deleteAccount">${t('deleteAccountBtn')}</button></details></section>`;
  }
  async function hasLocalData() {
    if ((S.weights || []).length || (S.customFoods || []).length || S.plan || Object.keys(S.foods || {}).length) return true;
    return (await MF.photos.all().catch(() => [])).length > 0;
  }
  // Limpa os dados DESTE aparelho (a conta na nuvem não é tocada)
  async function wipeLocal() {
    const keep = { lang: S.lang, theme: S.theme, tab: S.tab };
    S = MF.store.replace(keep);
    MF.store.adopt(S, 0);
    await MF.photos.clear().catch(() => {});
    render();
  }
  function authMsg(msg, ok) { const el = $('#authMsg'); if (el) el.innerHTML = `<div class="note ${ok ? 'ok' : 'warn'}">${esc(msg)}</div>`; }
  function refreshSyncUI() {
    const pill = $('.tools .sync-slot'); if (pill) pill.innerHTML = syncPill();
    const acc = $('#account'); if (acc) acc.outerHTML = accountCard();
  }
  if (SY()) {
    MF.sync.attach(() => S);
    MF.sync.onRemote = async (state, ts) => {
      const keep = { ui: S.ui, tab: S.tab, dayIdx: S.dayIdx, ownerId: S.ownerId, lang: S.lang, theme: S.theme, sharedFoods: S.sharedFoods };
      const remote = sanitizeState(state);
      const dead = { ...(S.photoDeleted || {}), ...(remote.photoDeleted || {}) };
      const metaIds = new Set(remote.photoMeta.map(p => p.id));
      remote.photoMeta = remote.photoMeta.concat((S.photoMeta || []).filter(p => !metaIds.has(p.id))).filter(p => !dead[p.id]);
      remote.photoDeleted = dead;
      S = MF.store.replace({ ...remote, ...keep });
      MF.store.adopt(S, ts);
      render(); toast(t('syncPulled'));
    };
    MF.sync.onPhotos = () => { if (S.tab === 'progress') renderPhotos(); };
    // Aparelho partilhado: dados de outra conta nunca passam para esta.
    MF.sync.onShared = setShared;
    MF.sync.onSignedOut = async ({ pending }) => { if (!pending) { S.ownerId = null; await wipeLocal(); } };
    MF.sync.onUser = async user => {
      if (S.ownerId && S.ownerId !== user.id) await wipeLocal();          // dados de outra conta: nunca passam
      else if (!S.ownerId && await hasLocalData() && !confirm(t('adoptLocal'))) await wipeLocal(); // sem dono: só com o teu sim
      S.ownerId = user.id;
      // Um aparelho sem dados nunca pode passar por "mais recente" do que a nuvem.
      if (!(await hasLocalData())) MF.store.adopt(S, 0); else MF.store.save(S);
    };
    let lastGate = null;
    MF.sync.on(() => {
      const g = gateState();
      if (g !== lastGate) { lastGate = g; render(); } else if (g === 'app') refreshSyncUI();
    });
  }


  // ---------------- Entrada obrigatória ----------------
  function gateState() {
    const sy = SY();
    if (!sy) return 'app';                 // sem configuração da nuvem (versão só local): sem login
    if (!sy.authReady) return 'loading';
    if (sy.recovering) return 'recover';
    if (!sy.user) return 'login';
    if (sy.approval === null) return 'loading';
    if (sy.approval === 'rejected') return 'rejected';
    return sy.approval === 'approved' ? 'app' : 'pending';
  }
  function gateHTML(state) {
    const langs = `<div class="seg"><button class="${S.lang === 'pt' ? 'on' : ''}" data-act="lang" data-v="pt">PT</button><button class="${S.lang === 'en' ? 'on' : ''}" data-act="lang" data-v="en">EN</button></div>`;
    let body;
    if (state === 'loading') body = `<div class="gate-loading"><span class="spinner"></span></div>`;
    else if (state === 'pending') body = `<h2>${t('pendingTitle')}</h2><p class="muted">${t('pendingText', { email: esc(MF.sync.user.email) })}</p>
      <button class="btn big-btn" data-act="recheck">${t('pendingCheck')}</button>
      <button class="btn ghost" data-act="gateSignOut" style="margin-top:8px">${t('signOut')}</button><div id="authMsg"></div>`;
    else if (state === 'rejected') body = `<h2>${t('rejectedTitle')}</h2><p class="muted">${t('rejectedText')}</p>
      <button class="btn ghost" data-act="gateSignOut">${t('signOut')}</button>`;
    else if (state === 'recover') body = `<h2>${t('accNewPw')}</h2>
      <form id="newPwForm" class="form"><label>${t('password')}<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn" type="submit">${t('save')}</button></form><div id="authMsg"></div>`;
    else body = `<h2>${t('gateTitle')}</h2><p class="muted small">${t('gateHelp')}</p>
      <form id="authForm" class="form">
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>${t('password')}<input name="password" type="password" minlength="8" required autocomplete="current-password"></label>
        <small class="muted">${t('pwRules')}</small>
        <button class="btn big-btn" type="submit" value="in">${t('signIn')}</button>
        <div class="gate-sep"><span>${t('gateNew')}</span></div>
        <label class="inline consent"><input type="checkbox" name="consent"> <span>${t('consent')} <a href="privacy.html" target="_blank" rel="noopener">${t('privacyLink')}</a></span></label>
        <button class="btn ghost" type="submit" value="up">${t('signUp')}</button>
      </form>
      <button class="linkbtn" data-act="forgot">${t('forgot')}</button>
      <a class="linkbtn help-link" href="ajuda.html">${t('helpLink')}</a>
      <div id="authMsg"></div>`;
    return `<div class="gate" style="background-image:linear-gradient(rgba(10,14,12,.55),rgba(10,14,12,.85)),url(img/hero.jpg)">
      <div class="gate-card">
        <div class="row between"><div class="brand"><div class="logo">M</div><div><h1>MacroForge</h1><p>${t('tagline')}</p></div></div>${langs}</div>
        ${body}
      </div>
      <div id="toast"></div>
    </div>`;
  }

  // ---------------- Metas ----------------
  function viewGoals() {
    const p = S.profile, g = MF.GOALS[p.goal];
    const num = (k, v, step = 1, extra = '') => `<input type="number" inputmode="decimal" data-bind="${k}" value="${v ?? ''}" step="${step}" ${extra}>`;
    const goalCards = MF.GOAL_ORDER.map(k => {
      const G = MF.GOALS[k];
      return `<button class="goal ${p.goal === k ? 'on' : ''} g-${k}" data-act="goal" data-v="${k}" title="${esc(t('gd_' + k))}" style="background-image:url(${IMG.goal(k)})">
        <span class="goal-txt"><b>${t('g_' + k)}</b><small>×${G.kcal[0]}–${G.kcal[1]} kcal/kg · ${n(MF.util.mid(G.kcal) * p.weight)} kcal</small></span></button>`;
    }).join('');
    const macroIn = (key, label, r) => `<label>${label}
        ${num(key, (p[key] ?? mid(r)).toFixed(2), 0.05, 'min="0" max="10"')}<small class="muted">${t('range', { a: r[0], b: r[1] })}</small></label>`;
    return `<section class="hero" id="hero">${heroHTML()}</section>
    <section class="card"><h2>${t('goal')}</h2><div class="goals">${goalCards}</div></section>
    <div class="grid2">
      <section class="card">
        <h2>${t('profile')}</h2>
        <div class="form cols2">
          <label>${t('sex')}<select data-bind="sex"><option value="M" ${sel(p.sex === 'M')}>${t('male')}</option><option value="F" ${sel(p.sex === 'F')}>${t('female')}</option></select></label>
          <label>${t('age')}${num('age', p.age, 1, 'min="14" max="90"')}</label>
          <label>${t('height')}${num('height', p.height, 1, 'min="120" max="230"')}</label>
          <label>${t('weight')}${num('weight', p.weight, 0.1, 'min="35" max="250"')}</label>
          <label>${t('bodyfat')}${num('bodyfat', p.bodyfat, 0.5, 'min="3" max="60"')}</label>
          <label>${t('activity')}<select data-bind="activity">${MF.ACTIVITY.map((a, i) => `<option value="${a}" ${sel(p.activity === a)}>${t('act' + i)}</option>`).join('')}</select></label>
        </div>
      </section>
      <section class="card">
        <h2>${t('adjust')}</h2>
        ${p.mode === 'kcal' ? `<label class="slider">${t('kcalPos')} <b id="multv">×${MF.util.lerp(g.kcal, p.kcalPos).toFixed(1)}</b>
          <input type="range" min="0" max="1" step="0.05" value="${p.kcalPos}" data-bind="kcalPos">
          <span class="ticks"><span>${t('low')} ×${g.kcal[0]}</span><span>${t('middle')}</span><span>${t('high')} ×${g.kcal[1]}</span></span></label>` : ''}
        <div class="seg wide" title="${esc(t('modeHelp'))}">
          <button class="${p.mode === 'kcal' ? 'on' : ''}" data-act="mode" data-v="kcal">${t('modeKcal')}</button>
          <button class="${p.mode === 'macros' ? 'on' : ''}" data-act="mode" data-v="macros">${t('modeMacros')}</button>
        </div>
        <p class="muted small">${t('modeHelp')}</p>
        <div class="form cols3">
          ${macroIn('protein', t('proteinGkg'), g.p)}
          ${macroIn('fat', t('fatGkg'), g.f)}
          ${p.mode === 'macros' ? macroIn('carbs', t('carbsGkg'), g.c) : ''}
        </div>
        <button class="btn ghost" data-act="resetMid">${t('resetMid')}</button>
      </section>
    </div>
    <section class="card results" id="results">${results()}</section>`;
  }

  function macroTile(label, g, gkg, kcalShare, cls) {
    return `<div class="tile ${cls}"><span>${label}</span><b>${n(g)} g</b><small>${n(gkg, 2)} ${t('perKg')} · ${n(kcalShare)}% ${t('ofKcal')}</small></div>`;
  }
  function heroHTML() {
    const T = targets(), p = S.profile;
    const chip = (cls, label, g) => `<span class="hchip ${cls}"><b>${n(g)} g</b>${label}</span>`;
    return `<div class="hero-img" style="background-image:url(img/hero.jpg)"></div>
      <div class="hero-in">
        <span class="eyebrow">${t('heroEyebrow')} · ${t('g_' + p.goal)}</span>
        <div class="hero-kcal">${n(T.kcal)}<small> kcal ${t('perDay')}</small></div>
        <div class="hero-chips">${chip('p', t('protein'), T.p)}${chip('c', t('carbs'), T.c)}${chip('f', t('fat'), T.f)}</div>
        <div class="hero-actions"><button class="btn" data-act="tab" data-v="plan">${t('heroCta')}</button></div>
      </div>`;
  }
  function results() {
    const p = S.profile, T = targets();
    const reco = MF.recommendMeals(T, p.weight);
    const nm = p.meals || reco.ideal;
    const diff = T.kcal - T.maintOld;
    const mf = T.mifflin;
    return `<div class="res-head">
        <div><span class="muted">${t('dailyTarget')}</span><div class="big">${n(T.kcal)} <small>kcal</small></div>
          <span class="muted">${t('multiplier')} ×${n(T.kcalMult, 1)} · ${diff < 0 ? t('deficit') : t('surplus')} ${n(Math.abs(diff))} kcal ${t('vsMaint')}</span></div>
        <div class="tiles">
          ${macroTile(t('protein'), T.p, T.pKg, T.p * 400 / T.kcal, 'p')}
          ${macroTile(t('carbs'), T.c, T.cKg, T.c * 400 / T.kcal, 'c')}
          ${macroTile(t('fat'), T.f, T.fKg, T.f * 900 / T.kcal, 'f')}
          <div class="tile fb"><span>${t('fiber')}</span><b>${n(T.fiber)} g</b><small>14 g / 1000 kcal</small></div>
        </div>
      </div>
      <div class="compare-row">
        <div><span class="muted">${t('maintOld')}</span><b>${n(T.maintOld)} kcal</b></div>
        ${mf ? `<div><span class="muted">${t('mifflinT')}</span><b>${n(mf.tdee)} kcal</b><small class="muted">BMR ${n(mf.bmr)}</small></div>` : ''}
        <div><span class="muted">${t('mealsTitle')}</span><b>${nm}</b></div>
      </div>
      ${p.kcalOverride && p.mode === 'kcal' ? `<div class="note info">${t('overrideOn', { k: n(p.kcalOverride) })} <button class="btn small ghost" data-act="clearOverride">${t('clearOverride')}</button></div>` : ''}
      ${T.warnings.map(w => `<div class="note warn">${t(w.k, w.v)}</div>`).join('')}
      <p class="muted small">${t('mealsReco', { n: nm, min: reco.min, max: reco.max, per: n(T.p / nm), lo: n(reco.low), hi: n(reco.high) })} ${t('mealsNote')}</p>
      <p class="muted small">${t('tipMid')}</p>`;
  }

  // ---------------- Alimentos ----------------
  function viewFoods() {
    const av = available().length;
    const cat = S.ui.cat;
    const chips = ['all', ...MF.CATS].map(c => `<button class="chip ${cat === c ? 'on' : ''}" data-act="cat" data-v="${c}">${c === 'all' ? t('all') : t('cat_' + c)}</button>`).join('');
    return `<section class="card label-card">
      <div class="row between wrap gap"><div><h2>${t('labelTitle')}</h2><p class="muted small">${t('labelHelp')}</p></div>
        <label class="btn big-btn">${t('labelBtn')}<input type="file" accept="image/*" capture="environment" hidden data-act="labelPhoto"></label></div>
      <div id="labelBox">${labelBox()}</div>
    </section>
    <section class="card">
      <div class="row between wrap"><div><h2>${t('foodsTitle')}</h2><p class="muted">${t('foodsHelp')} ${t('rawNote')}</p></div>
        <div class="pill big-pill">${t('availableCount', { n: av })}</div></div>
      <div class="row wrap gap">
        <input class="search" type="search" placeholder="${esc(t('search'))}" value="${esc(foodQuery)}" data-act="search">
        <button class="btn" data-act="basics">${t('quickBasics')}</button>
        <button class="btn ghost" data-act="allBuy">${t('allBuy')}</button>
        <button class="btn ghost" data-act="clearSel">${t('clearSel')}</button>
      </div>
      <div class="chips">${chips}</div>
      <div id="foodlist">${foodList()}</div>
    </section>
    <section class="card">
      <details><summary><h2 class="inline">${t('customTitle')}</h2></summary>
      ${foodForm('customForm')}
</details>
    </section>`;
  }
  // Formulário de alimento (usado no "adicionar à mão" e na revisão da leitura por foto)
  function foodForm(id, v = {}, miss = []) {
    const val = x => (x === undefined || x === null ? '' : esc(x));
    const ms = Object.fromEntries((v.meas || []).map(([k, g]) => [k, g]));
    const m = v.m || 'BM';
    const req = k => (miss.includes(k) ? 'class="miss"' : '');
    const mv = (k, x) => (miss.includes(k) ? '' : val(x));
    return `<form class="form cols4" id="${id}">
        ${v.editId ? `<input type="hidden" name="editId" value="${esc(v.editId)}">` : ''}
        <label class="span2">${t('name')}<input name="name" required maxlength="60" value="${val(v.name)}"></label>
        <label>${t('category')}<select name="cat">${MF.CATS.map(c => `<option value="${c}" ${sel(v.cat === c)}>${t('cat_' + c)}</option>`).join('')}</select></label>
        <label>${t('kcalAuto')}<input name="k" type="number" step="1" min="0" value="${val(v.k)}"></label>
        <label ${req('protein')}>${t('protein')} (g)<input name="p" type="number" step="0.1" min="0" required value="${mv('protein', v.p)}"></label>
        <label ${req('carbs')}>${t('carbs')} (g)<input name="c" type="number" step="0.1" min="0" required value="${mv('carbs', v.c)}"></label>
        <label ${req('fat')}>${t('fat')} (g)<input name="f" type="number" step="0.1" min="0" required value="${mv('fat', v.f)}"></label>
        <label>${t('fiberG')}<input name="fb" type="number" step="0.1" min="0" value="${val(v.fb)}"></label>
        <fieldset class="span2"><legend>${t('mealsFor')}</legend>
          <label class="inline"><input type="checkbox" name="mB" ${chk(m.includes('B'))}> ${t('mB')}</label>
          <label class="inline"><input type="checkbox" name="mM" ${chk(m.includes('M'))}> ${t('mM')}</label>
          <label class="inline"><input type="checkbox" name="mS" ${chk(m.includes('S'))}> ${t('mS')}</label></fieldset>
        <label>${t('unitG')}<input name="ug" type="number" step="1" min="1" value="${val(v.unit && v.unit.g)}"></label>
        <label>${t('unitName')}<input name="un" maxlength="20" value="${val(v.unit && (S.lang === 'en' ? v.unit.en : v.unit.pt))}"></label>
        <label>${t('gTbsp')}<input name="gcs" type="number" step="0.5" min="1" value="${val(ms.csopa)}"></label>
        <label>${t('gTsp')}<input name="gcc" type="number" step="0.5" min="0.5" value="${val(ms.ccha)}"></label>
        <input type="hidden" name="por" value="${val(v.serving)}">
        <p class="muted small span4">${t('per100')}</p>
        <button class="btn" type="submit">${id === 'labelForm' ? t('labelSave') : t('add')}</button>
      </form>`;
  }

  // ---------------- Leitura do rótulo por foto ----------------
  let LS = { status: 'idle' }; // estado da leitura (não é guardado)
  const macroLine = f => `${n(f.k)} kcal · ${t('pS')} ${n(f.p, 1)} · ${t('cS')} ${n(f.c, 1)} · ${t('fS')} ${n(f.f, 1)} <span class="dim">/ 100 g</span>`;
  function labelBox() {
    if (LS.status === 'reading') return `<div class="note info"><span><span class="spinner"></span> ${t('labelReading')}</span></div>`;
    if (LS.status === 'error') return `<div class="note warn"><span>${t('lerr_' + LS.error)}</span> <button class="btn small ghost" data-act="labelManual">${t('manual')}</button></div>
      ${LS.tried && LS.tried.length ? `<p class="muted small">${esc(LS.tried.join(' · '))}</p>` : ''}`;
    if (LS.status === 'done') {
      const f = fmap()[LS.savedId]; if (!f) return '';
      return `<div class="note ok"><span><b>${t('labelAdded', { name: esc(fname(f)) })}</b><br><small>${esc(t('cat_' + f.cat))} · ${macroLine(f)}${LS.food && LS.food.liquid ? ' · ' + t('liquidNote') : ''}</small></span>
        <span class="row gap"><button class="btn small ghost" data-act="labelEdit">${t('labelEdit')}</button><button class="btn small ghost" data-act="labelUndo">${t('labelUndo')}</button></span></div>`;
    }
    if (LS.status === 'review') {
      const miss = (LS.food && LS.food.missing) || [];
      const msgs = (LS.flags || []).map(fl => (fl === 'missing' ? t('lf_missing', { list: miss.map(x => t(x)).join(', ') }) : t('lf_' + fl)));
      return `${msgs.length ? `<div class="note warn"><span>${t('labelReview')}<br>${msgs.map(x => '· ' + x).join('<br>')}</span></div>` : ''}
        ${foodForm('labelForm', LS.food || {}, miss)}`;
    }
    return '';
  }
  const setLabel = st => { LS = st; const box = $('#labelBox'); if (box) box.innerHTML = labelBox(); };

  function foodFromForm(fd) {
    const g = k => fd.get(k);
    const p = +g('p') || 0, c = +g('c') || 0, f = +g('f') || 0;
    const m = (g('mB') ? 'B' : '') + (g('mM') ? 'M' : '') + (g('mS') ? 'S' : '') || 'BMS';
    const name = (g('name') || '').trim();
    const food = {
      id: g('editId') || 'c_' + Date.now().toString(36), pt: name, en: name, cat: g('cat'),
      k: +g('k') || Math.round(p * 4 + c * 4 + f * 9), p, c, f, fb: +g('fb') || 0, m, custom: true,
    };
    if (+g('ug') > 0) food.unit = { g: +g('ug'), pt: g('un') || 'un', en: g('un') || 'unit' };
    const meas = []; if (+g('gcs') > 0) meas.push(['csopa', +g('gcs')]); if (+g('gcc') > 0) meas.push(['ccha', +g('gcc')]);
    if (meas.length) food.meas = meas;
    food.por = food.unit ? food.unit.g : (+g('por') || ({ veg: 150, fruit: 120, fat: 15 }[food.cat] || 100));
    return food;
  }
  // Converte a leitura do servidor num alimento da app
  function foodFromLabel(L) {
    const food = { id: 'c_' + Date.now().toString(36), pt: String(L.name || '').slice(0, 60), en: String(L.name || '').slice(0, 60), cat: MF.CATS.includes(L.cat) ? L.cat : 'carb',
      k: +L.k || 0, p: +L.p || 0, c: +L.c || 0, f: +L.f || 0, fb: +L.fb || 0, m: /^[BMS]{1,3}$/.test(L.m || '') ? L.m : 'BMS', custom: true, fromPhoto: true };
    if (L.unit && +L.unit.g > 0) food.unit = { g: +L.unit.g, pt: cleanText(L.unit.pt) || 'un', en: cleanText(L.unit.en) || 'unit' };
    if (L.meas) food.meas = L.meas;
    food.por = food.unit ? food.unit.g : (L.serving || ({ veg: 150, fruit: 120, fat: 15 }[food.cat] || 100));
    return food;
  }

  // Limpa um estado vindo de fora (ficheiro importado, nuvem, armazenamento antigo): só passam formas esperadas.
  const DATE = /^\d{4}-\d{2}-\d{2}$/, SAFE_ID = /^[\w.\-]{1,80}$/, POSES = ['front', 'side', 'back'];
  const MEAL_NAMES_OK = ['breakfast', 'morningSnack', 'lunch', 'afternoonSnack', 'dinner', 'supper'];
  function sanitizeState(st) {
    const s = st && typeof st === 'object' ? st : {};
    const num = (x, a, b) => { const v = +x; return Number.isFinite(v) && v >= a && v <= b ? v : null; };
    s.weights = (Array.isArray(s.weights) ? s.weights : []).filter(w => w && DATE.test(w.date) && num(w.kg, 20, 400) !== null)
      .map(w => ({ date: w.date, kg: +w.kg, ...(num(w.waist, 20, 300) !== null ? { waist: +w.waist } : {}), ...(num(w.kcal, 0, 20000) !== null ? { kcal: +w.kcal } : {}) }));
    s.customFoods = (Array.isArray(s.customFoods) ? s.customFoods : []).filter(f => f && SAFE_ID.test(f.id) && MF.CATS.includes(f.cat)
      && typeof f.pt === 'string' && [f.k, f.p, f.c, f.f].every(x => num(x, 0, 1000) !== null)).map(f => {
        const o = { ...f, pt: f.pt.slice(0, 60), en: String(f.en || f.pt).slice(0, 60), m: /^[BMS]{1,3}$/.test(f.m || '') ? f.m : 'BMS', custom: true };
        if (o.unit) o.unit = num(o.unit.g, 0.5, 2000) ? { g: +o.unit.g, pt: cleanText(o.unit.pt) || 'un', en: cleanText(o.unit.en) || 'unit' } : undefined;
        if (o.meas) o.meas = (Array.isArray(o.meas) ? o.meas : []).filter(e => Array.isArray(e) && MEAS_KEYS.includes(e[0]) && num(e[1], 0.5, 500)).map(e => [e[0], +e[1]]);
        return o;
      });
    const foods = {}; for (const [k, v] of Object.entries(s.foods || {})) if (SAFE_ID.test(k)) foods[k] = { like: !!(v && v.like), buy: !!(v && v.buy) };
    s.foods = foods;
    s.photoMeta = (Array.isArray(s.photoMeta) ? s.photoMeta : []).filter(p => p && SAFE_ID.test(p.id) && DATE.test(p.date) && POSES.includes(p.pose));
    const pd = {}; for (const [k, v] of Object.entries(s.photoDeleted || {})) if (SAFE_ID.test(k) && num(v, 0, 9e15)) pd[k] = +v;
    s.photoDeleted = pd;
    const ck = {}; for (const [k, v] of Object.entries(s.clock && typeof s.clock === 'object' ? s.clock : {})) if (k.length <= 120 && num(v, 0, 9e15) !== null) ck[k] = +v;
    s.clock = ck; // horas de alteração por registo (merge.js)
    if (s.plan && Array.isArray(s.plan.days)) {
      s.plan.days = s.plan.days.filter(d => d && Array.isArray(d.meals)).map(d => ({ meals: d.meals.filter(m => m && MEAL_NAMES_OK.includes(m.name) && ['B', 'M', 'S'].includes(m.type))
        .map(m => ({ type: m.type, name: m.name, items: (Array.isArray(m.items) ? m.items : []).filter(i => i && SAFE_ID.test(i.id) && num(i.g, 0, 5000) !== null)
          .map(i => ({ id: i.id, g: +i.g, ...(i.locked ? { locked: true } : {}), ...(MEAS_KEYS.concat(['unit']).includes(i.u) ? { u: i.u } : {}) })) })) }));
    } else s.plan = null;
    if (s.profile) for (const k of ['age', 'height', 'weight', 'bodyfat', 'protein', 'fat', 'carbs', 'kcalPos', 'activity', 'kcalOverride', 'meals', 'days'])
      if (s.profile[k] !== null && s.profile[k] !== undefined && num(s.profile[k], 0, 100000) === null) s.profile[k] = null;
    if (s.profile && !MF.GOALS[s.profile.goal]) s.profile.goal = 'cut';
    return s;
  }

  const SHARED_PREFIX = 'sh_';
  // Dados de outras pessoas: só passa o que tem a forma esperada (a base de dados também o garante).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MEAS_KEYS = ['csopa', 'ccha', 'chav', 'copo', 'punhado', 'clara', 'media', 'metade', 'fatia', 'quadrado'];
  const fin = (x, a, b) => { const v = +x; return Number.isFinite(v) && v >= a && v <= b ? v : null; };
  const cleanText = s => (typeof s === 'string' ? s.replace(/[^\p{L}\s.\-]/gu, '').slice(0, 20) : '');
  function sharedToFood(r) {
    if (!r || !UUID.test(r.id) || !MF.CATS.includes(r.cat) || typeof r.name !== 'string') return null;
    const k = fin(r.k, 0, 950), p = fin(r.p, 0, 100), c = fin(r.c, 0, 100), f = fin(r.f, 0, 100);
    if ([k, p, c, f].includes(null)) return null;
    const food = { id: SHARED_PREFIX + r.id, sid: r.id, pt: r.name.slice(0, 60), en: r.name.slice(0, 60), cat: r.cat, k, p, c, f,
      fb: fin(r.fb, 0, 100) || 0, m: /^[BMS]{1,3}$/.test(r.m || '') ? r.m : 'BMS', shared: true, mine: !!r.mine,
      source: r.source === 'label' ? 'label' : 'manual' };
    const ug = r.unit && fin(r.unit.g, 0.5, 2000);
    if (ug) food.unit = { g: ug, pt: cleanText(r.unit.pt) || 'un', en: cleanText(r.unit.en) || 'unit' };
    if (Array.isArray(r.meas)) {
      const meas = r.meas.filter(e => Array.isArray(e) && MEAS_KEYS.includes(e[0]) && fin(e[1], 0.5, 500)).map(e => [e[0], +e[1]]).slice(0, 6);
      if (meas.length) food.meas = meas;
    }
    const por = fin(r.por, 1, 2000); if (por) food.por = por;
    return food;
  }
  const foodToRow = (f, source) => {
    const row = { name: f.pt.trim(), cat: f.cat, k: Math.round(f.k), p: +f.p, c: +f.c, f: +f.f, fb: +f.fb || 0, m: f.m || 'BMS', source };
    if (f.unit) row.unit = f.unit; if (f.meas) row.meas = f.meas; if (f.por) row.por = f.por;
    return row;
  };
  function setShared(rows) {
    S.sharedFoods = (rows || []).map(sharedToFood).filter(Boolean);
    save(); if (S.tab === 'foods') { const fl = $('#foodlist'); if (fl) fl.innerHTML = foodList(); }
  }
  // Guardar um alimento: com sessão vai para o catálogo da comunidade; sem sessão (ou se falhar) fica só teu.
  async function saveFood(food, source) {
    const sy = MF.sync;
    if (sy && sy.available && sy.user && navigator.onLine) {
      try {
        let res;
        if (food.sid) res = { row: await sy.updateShared(food.sid, foodToRow(food, source)), created: false, updated: true };
        else res = await sy.publishFood(foodToRow(food, source));
        if (res.conflict) { upsertCustom(food); toast(t('sharedConflict')); return food; }
        const sf = sharedToFood(res.row);
        if (!sf) throw new Error('invalid');
        S.sharedFoods = (S.sharedFoods || []).filter(x => x.id !== sf.id).concat(sf);
        S.customFoods = S.customFoods.filter(x => x.id !== food.id); // se era privado, passa a ser da comunidade
        if (!S.foods[sf.id]) S.pendingNew = (S.pendingNew || 0) + 1;
        S.foods[sf.id] = { like: true, buy: true };
        save();
        if (!res.created && !res.updated) toast(t('sharedExisted'));
        return sf;
      } catch (e) { toast(t('sharedFailed')); }
    }
    upsertCustom(food);
    return food;
  }
  function upsertCustom(food) {
    const i = S.customFoods.findIndex(x => x.id === food.id);
    if (i >= 0) S.customFoods[i] = food;
    else { S.customFoods.push(food); S.pendingNew = (S.pendingNew || 0) + 1; }
    S.foods[food.id] = { like: true, buy: true };
    save();
  }
  async function readLabel(file) {
    setLabel({ status: 'reading' });
    let res;
    try {
      const blob = await MF.photos.compress(file, 1600);
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
      if (SY() && MF.sync.user) res = await MF.sync.readLabel(dataUrl);
      else if (!isLocal) return setLabel({ status: 'error', error: 'needLogin' });
      else {
        const resp = await fetch('api/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) });
        if (!resp.ok) return setLabel({ status: 'error', error: resp.status === 413 ? 'tooBig' : 'noServer' });
        res = await resp.json();
      }
    } catch (e) { return setLabel({ status: 'error', error: location.protocol === 'file:' ? 'noServer' : 'net' }); }
    if (!res.ok) return setLabel({ status: 'error', error: res.error || 'allFailed', tried: res.tried });
    // Leitura limpa (todos os macros, kcal coerentes com os macros, nome lido): guarda logo. Senão, revisão.
    const clean = (res.flags || []).every(fl => fl === 'fromServing');
    if (clean) {
      const food = await saveFood(foodFromLabel(res.food), 'label');
      setLabel({ status: 'done', savedId: food.id, food: res.food });
      updateAvail(); const fl = $('#foodlist'); if (fl) fl.innerHTML = foodList();
    } else setLabel({ status: 'review', food: res.food, flags: res.flags });
  }

  function foodList() {
    const q = foodQuery.trim().toLowerCase();
    const cat = S.ui.cat;
    const list = allFoods().filter(f => (cat === 'all' || f.cat === cat) && (!q || f.pt.toLowerCase().includes(q) || (f.en || '').toLowerCase().includes(q)));
    const groups = MF.CATS.map(c => [c, list.filter(f => f.cat === c)]).filter(([, l]) => l.length);
    return groups.map(([c, l]) => `<h3 class="cat-h c-${c}"><img class="cat-img" src="${IMG.cat(c)}" alt="" loading="lazy">${t('cat_' + c)}<small class="muted">${l.length}</small></h3><div class="foods">${l.map(f => {
      const st = S.foods[f.id] || {};
      return `<div class="food ${st.like && st.buy ? 'avail' : ''}">
        <span class="fthumb" style="background-image:url(${IMG.cat(f.cat)})"></span>
        <div class="fmain"><b>${esc(fname(f))}</b>${f.custom ? ` <span class="tag">${t('custom')}</span>` : ''}${f.shared ? ` <span class="tag shared">${f.mine ? t('sharedMine') : t('sharedTag')}</span>` : ''}
          <small class="muted">${n(f.k)} kcal · ${t('pS')} ${n(f.p, 1)} · ${t('cS')} ${n(f.c, 1)} · ${t('fS')} ${n(f.f, 1)} <span class="dim">/ 100 g</span></small></div>
        <div class="ftog">
          <button class="tog like ${st.like ? 'on' : ''}" data-act="like" data-id="${f.id}">${t('like')}</button>
          <button class="tog buy ${st.buy ? 'on' : ''}" data-act="buy" data-id="${f.id}">${t('buy')}</button>
          ${f.custom ? `<button class="icon small" data-act="delCustom" data-id="${f.id}" title="${t('del')}">${ICON.x}</button>` : ''}
          ${f.shared && f.mine ? `<button class="icon small" data-act="delShared" data-id="${f.id}" title="${t('del')}">${ICON.x}</button>` : ''}
        </div></div>`;
    }).join('')}</div>`).join('');
  }

  // ---------------- Dieta ----------------
  function viewPlan() {
    const av = available();
    if (!av.length) return `<section class="card empty with-img" style="background-image:linear-gradient(rgba(10,14,12,.78),rgba(10,14,12,.9)),url(img/cat-carb.jpg)"><p>${t('noFoods')}</p><button class="btn" data-act="tab" data-v="foods">${t('goFoods')}</button></section>`;
    const T = targets(), p = S.profile;
    const reco = MF.recommendMeals(T, p.weight);
    const nm = p.meals || reco.ideal;
    // Os alimentos mudaram desde que a dieta foi gerada: gera de novo sozinho,
    // exceto se houver quantidades fixadas à mão (aí só avisa, para não as perder).
    let foodsChanged = false;
    if (S.plan && S.plan.akey !== akey()) {
      if (!hasManual(S.plan)) { generate(true); setTimeout(() => toast(t('autoRegen')), 50); }
      else foodsChanged = true;
    }
    const plan = S.plan;
    const controls = `<section class="card">
      <div class="row wrap between gap">
        <div><span class="lbl">${t('mealsTitle')}</span><div class="seg">${[3, 4, 5, 6].map(k => `<button class="${nm === k ? 'on' : ''} ${reco.ideal === k ? 'reco' : ''}" data-act="meals" data-v="${k}">${k}</button>`).join('')}</div></div>
        <div><span class="lbl">${t('daysVariants')}</span><div class="seg">${[1, 2, 3, 7].map(k => `<button class="${p.days === k ? 'on' : ''}" data-act="days" data-v="${k}">${k}</button>`).join('')}</div></div>
        <div class="row gap"><button class="btn" data-act="generate">${t('generate')}</button>${plan ? `<button class="btn ghost" data-act="readjust">${t('readjust')}</button>` : ''}</div>
      </div>
      <p class="muted small">${t('mealsReco', { n: nm, min: reco.min, max: reco.max, per: n(T.p / nm), lo: n(reco.low), hi: n(reco.high) })}
        ${plan ? `<br>${t('generatedAt', { t: new Date(plan.createdAt).toLocaleString(S.lang === 'en' ? 'en-GB' : 'pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })}` : ''}</p>
    </section>` + (foodsChanged ? `<div class="note warn">${t('foodsChanged')} <button class="btn small" data-act="generate">${t('generate')}</button></div>` : '');
    if (!plan) return controls + `<section class="card empty with-img" style="background-image:linear-gradient(rgba(10,14,12,.78),rgba(10,14,12,.9)),url(img/hero.jpg)"><p>${t('noPlan')}</p><button class="btn" data-act="generate">${t('generate')}</button></section>` + suggestCard(av, T, fmap());
    const fm = fmap();
    const di = clamp(S.dayIdx, 0, plan.days.length - 1);
    const day = plan.days[di];
    const tot = MF.dayTotals(day, fm);
    const stale = plan.tkey !== tkey(T);
    const bar = (label, v, tg, unit, cls) => {
      const pct = tg ? v / tg : 0, ok = Math.abs(pct - 1) <= 0.07;
      return `<div class="bar ${cls}"><div class="bl"><span>${label}</span><b class="${ok ? 'ok' : 'off'}">${n(v)}<small> / ${n(tg)} ${unit}</small></b></div>
        <div class="track"><div style="width:${Math.min(100, pct * 100)}%"></div></div></div>`;
    };
    const dayTabs = plan.days.length > 1 ? `<div class="chips">${plan.days.map((_, i) => `<button class="chip ${i === di ? 'on' : ''}" data-act="day" data-v="${i}">${t('day', { n: i + 1 })}</button>`).join('')}</div>` : '';
    return controls +
      (stale ? `<div class="note warn">${t('planStale')} <button class="btn small" data-act="readjust">${t('readjust')}</button></div>` : '') +
      `<section class="card sticky-totals">${dayTabs}
        <div class="bars">${bar('kcal', tot.k, T.kcal, '', 'k')}${bar(t('protein'), tot.p, T.p, 'g', 'p')}${bar(t('carbs'), tot.c, T.c, 'g', 'c')}${bar(t('fat'), tot.f, T.f, 'g', 'f')}</div>
        <p class="muted small">${t('editHint')}</p></section>
      <div class="meals">${day.meals.map((m, mi) => mealCard(m, mi, fm, av)).join('')}</div>
      ${suggestCard(av, T, fm)}
      ${analysisCard(plan, T, av, fm)}`;
  }

  // Nome de uma medida, no singular ou plural ("1 colher de sopa", "2 colheres de sopa")
  function measName(f, key, count) {
    if (key === 'g') return 'g';
    if (key === 'unit') { const u = S.lang === 'en' ? f.unit.en : f.unit.pt; return esc(u) + (count > 1.01 ? 's' : ''); }
    return MEAS_KEYS.includes(key) ? t((count > 1.01 ? 'mp_' : 'ms_') + key) : '';
  }
  const fmtCount = c => { const i = Math.floor(c), h = c - i >= 0.5; return i === 0 && h ? '½' : `${i}${h ? '½' : ''}`; };
  function unitText(f, g) {
    const parts = [];
    if (f.unit) { const k = g / f.unit.g; parts.push(`${n(k, k % 1 ? 1 : 0)} ${measName(f, 'unit', k)}`); }
    const hh = MF.household(f, g);
    if (hh) parts.push(hh.map(([k, c]) => `${fmtCount(c)} ${measName(f, k, c)}`).join(' + '));
    return parts.length ? '≈ ' + parts.join(' · ') : '';
  }
  // Campo de quantidade com seletor de unidade (g, unidade, colheres...). O plano guarda sempre gramas.
  function qtyField(f, it, mi, ii) {
    const units = MF.unitsOf(f);
    const cur = units.find(u => u[0] === it.u) || units[0];
    const val = cur[0] === 'g' ? Math.round(it.g * 10) / 10 : Math.round(it.g / cur[1] * 10) / 10;
    const step = cur[0] === 'g' ? (MF.stepOf(f) >= 10 ? 5 : 1) : 0.5;
    const sel = units.length > 1
      ? `<select data-act="qtyUnit" data-m="${mi}" data-i="${ii}">${units.map(([k]) => `<option value="${esc(k)}" ${k === cur[0] ? 'selected' : ''}>${esc(measName(f, k, 2))}</option>`).join('')}</select>`
      : '<span>g</span>';
    return `<div class="iqty"><input type="number" inputmode="decimal" min="0" step="${step}" value="${val}" data-act="qty" data-m="${mi}" data-i="${ii}">${sel}</div>`;
  }
  function mealCard(m, mi, fm, av) {
    const tot = MF.totals(m.items, fm);
    const rows = m.items.map((it, ii) => {
      const f = fm[it.id]; if (!f) return '';
      const q = it.g / 100;
      const alts = av.filter(a => MF.role(a) === MF.role(f) && a.id !== f.id);
      return `<div class="item ${it.locked ? 'locked' : ''}">
        <div class="iname"><b>${esc(fname(f))}</b><small class="muted">${unitText(f, it.g)}</small></div>
        ${qtyField(f, it, mi, ii)}
        <div class="imac muted">${n(f.k * q)} kcal · ${t('pS')} ${n(f.p * q)} · ${t('cS')} ${n(f.c * q)} · ${t('fS')} ${n(f.f * q)}</div>
        <div class="iact">
          <select data-act="swap" data-m="${mi}" data-i="${ii}" ${alts.length ? '' : 'disabled'} title="${t('swap')}"><option value="">⇄</option>${alts.map(a => `<option value="${a.id}">${esc(fname(a))}</option>`).join('')}</select>
          <button class="icon small ${it.locked ? 'on' : ''}" data-act="lock" data-m="${mi}" data-i="${ii}" title="${t('lock')}">${it.locked ? ICON.lock : ICON.unlock}</button>
          <button class="icon small" data-act="remove" data-m="${mi}" data-i="${ii}" title="${t('remove')}">${ICON.x}</button>
        </div></div>`;
    }).join('');
    const inMeal = new Set(m.items.map(i => i.id));
    const addable = av.filter(a => !inMeal.has(a.id));
    const sugIds = MF.suggestForMeal(m.type, sugOpts(av, fm));
    return `<section class="card meal">
      <div class="meal-banner" style="background-image:url(${IMG.meal(m.name)})">
        <div class="meal-h"><h3>${t(m.name)}</h3><span>${n(tot.k)} kcal · ${t('pS')} ${n(tot.p)} · ${t('cS')} ${n(tot.c)} · ${t('fS')} ${n(tot.f)}</span></div></div>
      ${rows}
      <select class="add" data-act="addFood" data-m="${mi}"><option value="">${t('addFood')}</option>${MF.CATS.map(c => {
        const l = addable.filter(a => a.cat === c); return l.length ? `<optgroup label="${t('cat_' + c)}">${l.map(a => `<option value="${a.id}">${esc(fname(a))}</option>`).join('')}</optgroup>` : '';
      }).join('')}${sugIds.length ? `<optgroup label="${t('sugInMeal')}">${sugIds.map(id => `<option value="new:${id}">+ ${esc(fname(fm[id]))}</option>`).join('')}</optgroup>` : ''}</select>
    </section>`;
  }

  const sugOpts = (av, fm) => ({ available: av, allFoods: allFoods(), plan: S.plan, targets: targets(), fmap: fm, dismissed: S.dismissed });
  function suggestCard(av, T, fm) {
    const list = MF.suggest({ ...sugOpts(av, fm), limit: 8 });
    const nd = Object.keys(S.dismissed).length;
    const fmac = f => `${n(f.k)} kcal · ${t('pS')} ${n(f.p, 1)} · ${t('cS')} ${n(f.c, 1)} · ${t('fS')} ${n(f.f, 1)} <span class="dim">/ 100 g</span>`;
    return `<section class="card">
      <div class="row between wrap"><div><h2>${t('sugTitle')}</h2><p class="muted small">${t('sugHelp')}</p></div>
        ${nd ? `<button class="btn small ghost" data-act="undismiss">${t('dismissedReset', { n: nd })}</button>` : ''}</div>
      ${S.pendingNew ? `<div class="note info">${t('sugPending', { n: S.pendingNew })} <button class="btn small" data-act="generate">${t('generate')}</button></div>` : ''}
      ${list.length ? `<div class="sugs">${list.map(s => { const f = fm[s.id]; return `<div class="sug">
          <div class="fmain"><b>${esc(fname(f))}</b><small class="muted">${fmac(f)}</small>
            <div class="why">${s.why.map(w => `<span class="tag">${t('r_' + w)}</span>`).join('')}</div></div>
          <div class="sug-act"><button class="btn small" data-act="sugAdd" data-id="${f.id}">${t('sugAdd')}</button>
            <button class="btn small ghost" data-act="sugDismiss" data-id="${f.id}">${t('sugDismiss')}</button></div></div>`; }).join('')}</div>`
        : `<p class="muted">${t('sugEmpty')}</p>`}
    </section>`;
  }

  function analysisCard(plan, T, av, fm) {
    const A = MF.analyze(plan, T, av, allFoods(), fm);
    const sug = s => (s && s.length ? `<div class="sugg">${t('suggest')} ${s.map(id => `<button class="chip small" data-act="quickAdd" data-id="${id}">+ ${esc(fname(fm[id]))}</button>`).join('')}</div>` : '');
    const li = (x, cls) => `<li class="${cls}">${t(x.k, x.v || { n: x.n })}${sug(x.s)}</li>`;
    return `<section class="card analysis"><h2>${t('analysisTitle')}</h2><div class="grid3">
      <div><h4 class="bad">${t('missingT')}</h4><ul>${A.missing.map(x => li(x, 'bad')).join('') || '<li class="muted">—</li>'}</ul></div>
      <div><h4 class="good">${t('okT')}</h4><ul>${A.ok.map(x => li(x, 'good')).join('') || '<li class="muted">—</li>'}</ul></div>
      <div><h4 class="tip">${t('tipsT')}</h4><ul>${A.tips.map(x => li(x, 'tip')).join('') || '<li class="muted">—</li>'}</ul></div>
    </div></section>`;
  }

  function generate(quiet) {
    const T = targets(), p = S.profile;
    const nm = p.meals || MF.recommendMeals(T, p.weight).ideal;
    S.plan = MF.generatePlan({ available: available(), nMeals: nm, nDays: p.days, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, targets: T, fmap: fmap() });
    S.plan.tkey = tkey(T); S.plan.akey = akey();
    S.dayIdx = 0; S.shopChecked = {}; S.pendingNew = 0;
    save(); if (!quiet) rerenderView();
  }
  function resolveDay(d) {
    const T = targets();
    MF.solveDay(S.plan.days[d], T, fmap());
  }
  function readjust() {
    const T = targets(), fm = fmap();
    const av = available();
    S.plan.days.forEach(d => MF.solveDay(d, T, fm, av));
    S.plan.tkey = tkey(T);
    save(); rerenderView();
  }

  // ---------------- Compras ----------------
  function shopData() {
    const plan = S.plan, fm = fmap(), tot = {};
    for (let d = 0; d < 7; d++) {
      const day = plan.days[d % plan.days.length];
      for (const m of day.meals) for (const it of m.items) tot[it.id] = (tot[it.id] || 0) + it.g;
    }
    return MF.CATS.map(c => [c, Object.keys(tot).filter(id => fm[id] && fm[id].cat === c).map(id => ({ f: fm[id], g: tot[id] }))]).filter(([, l]) => l.length);
  }
  function amountText(f, g) {
    const w = g >= 1000 ? `${n(g / 1000, 2)} kg` : `${n(g)} g`;
    if (!f.unit) return w;
    const k = Math.ceil(g / f.unit.g - 0.05);
    const u = S.lang === 'en' ? f.unit.en : f.unit.pt;
    return `${w} · ${t('approx', { n: k, u: esc(u) + (k > 1 ? 's' : '') })}`;
  }
  function viewShop() {
    if (!S.plan) return `<section class="card empty with-img" style="background-image:linear-gradient(rgba(10,14,12,.78),rgba(10,14,12,.9)),url(img/meal-lunch.jpg)"><p>${t('noPlan')}</p><button class="btn" data-act="tab" data-v="plan">${t('tabPlan')}</button></section>`;
    const data = shopData();
    return `<section class="card"><div class="row between wrap"><div><h2>${t('shopTitle')}</h2><p class="muted">${t('shopHelp')} ${t('rawNote')}</p></div>
      <div class="row gap"><button class="btn" data-act="copyList">${t('copyList')}</button><button class="btn ghost" data-act="resetChecks">${t('resetChecks')}</button></div></div>
      ${data.map(([c, l]) => `<h3 class="cat-h c-${c}"><img class="cat-img" src="${IMG.cat(c)}" alt="" loading="lazy">${t('cat_' + c)}</h3><ul class="shop">${l.map(({ f, g }) => `
        <li class="${S.shopChecked[f.id] ? 'done' : ''}"><label><input type="checkbox" data-act="shopCheck" data-id="${f.id}" ${chk(S.shopChecked[f.id])}>
        <span>${esc(fname(f))}</span><b>${amountText(f, g)}</b></label></li>`).join('')}</ul>`).join('')}
    </section>`;
  }

  // ---------------- Progresso ----------------
  function viewProgress() {
    const T = targets(), g = MF.GOALS[S.profile.goal];
    const tr = MF.trend(S.weights);
    const ad = MF.adaptive(S.weights, T, g);
    const last = tr[tr.length - 1];
    const sign = x => (x > 0 ? '+' : '') ;
    const stats = `<div class="tiles">
      <div class="tile"><span>${t('trendW')}</span><b>${last ? n(last.trend, 1) + ' kg' : '—'}</b><small>${last ? n(last.kg, 1) + ' kg · ' + last.date : ''}</small></div>
      <div class="tile"><span>${t('weeklyChange')}</span><b>${ad.enough ? sign(ad.weeklyKg) + n(ad.weeklyKg, 2) + ' kg' : '—'}</b><small>${ad.enough ? sign(ad.weeklyPct) + n(ad.weeklyPct, 2) + '%' + t('perWeek') : ''}</small></div>
      <div class="tile"><span>${t('targetRate')}</span><b>${sign(g.rate)}${n(g.rate, 2)}%${t('perWeek')}</b><small>${last ? sign(g.rate) + n(g.rate / 100 * last.trend, 2) + ' kg' + t('perWeek') : ''}</small></div>
    </div>`;
    const adaptive = !ad.enough
      ? `<p class="muted">${t('adaptiveNeed', { n: ad.n || 0 })}</p>`
      : `<div class="tiles">
          <div class="tile"><span>${t('estTdee')}</span><b>${n(ad.tdee)} kcal</b></div>
          <div class="tile accent"><span>${t('recommended')}</span><b>${n(ad.recommended)} kcal</b><small>${t('dailyTarget')}: ${n(T.kcal)}</small></div>
        </div>
        <div class="note ${ad.status === 'onTrack' ? 'ok' : 'warn'}">${t('st_' + ad.status)}</div>
        ${ad.assumed ? `<p class="muted small">${t('assumedNote', { k: n(T.kcal) })}</p>` : ''}
        <button class="btn" data-act="applyKcal" data-v="${ad.recommended}">${t('apply')}</button>`;
    const hist = tr.slice().reverse().slice(0, 14).map(e => `<tr><td>${e.date}</td><td>${n(e.kg, 1)}</td><td>${n(e.trend, 1)}</td><td>${e.waist ? n(e.waist, 1) : ''}</td><td>${e.kcal ? n(e.kcal) : ''}</td>
      <td><button class="icon small" data-act="delWeight" data-v="${e.date}">${ICON.x}</button></td></tr>`).join('');
    return `${accountCard()}<div class="grid2">
      <section class="card">
        <h2>${t('logWeight')}</h2>
        <form class="form cols4" id="weightForm">
          <label>${t('date')}<input type="date" name="date" value="${today()}" required></label>
          <label>${t('weightKg')}<input type="number" name="kg" step="0.1" min="30" max="300" required value="${last ? last.kg : S.profile.weight}"></label>
          <label>${t('waist')} <small class="muted">${t('optional')}</small><input type="number" name="waist" step="0.5" min="40" max="200"></label>
          <label>${t('kcalEaten')} <small class="muted">${t('optional')}</small><input type="number" name="kcal" step="10" min="500" max="10000"></label>
          <button class="btn" type="submit">${t('save')}</button>
        </form>
        <p class="muted small">${t('weighHint')}</p>
        ${stats}
        <div class="chart">${chart(tr)}</div>
      </section>
      <section class="card">
        <h2>${t('adaptiveTitle')}</h2>
        ${adaptive}
        <p class="muted small">${t('checkin')}</p>
        ${hist ? `<h3>${t('history')}</h3><table class="hist"><thead><tr><th>${t('date')}</th><th>kg</th><th>${t('trendW')}</th><th>${t('waist')}</th><th>kcal</th><th></th></tr></thead><tbody>${hist}</tbody></table>` : ''}
      </section>
    </div>
    <section class="card">
      <div class="row between wrap"><div><h2>${t('photosTitle')}</h2><p class="muted small">${t('photosLocal')}</p></div>
        <div class="row gap wrap">
          <input type="date" id="photoDate" value="${today()}">
          <select id="photoPose"><option value="front">${t('front')}</option><option value="side">${t('side')}</option><option value="back">${t('back')}</option></select>
          <label class="btn">${t('addPhotos')}<input type="file" accept="image/*" multiple hidden data-act="photoFiles"></label>
        </div></div>
      <div id="compare"></div>
      <div id="gallery" class="gallery"></div>
    </section>
    <section class="card">
      <h2>${t('backupTitle')}</h2><p class="muted small">${t('dataLocal')}</p>
      <div class="row gap"><button class="btn ghost" data-act="export">${t('exportB')}</button>
      <label class="btn ghost">${t('importB')}<input type="file" accept="application/json" hidden data-act="import"></label></div>
    </section>`;
  }

  function chart(tr) {
    if (tr.length < 2) return `<p class="muted">${t('chartEmpty')}</p>`;
    const W = 640, H = 230, L = 40, R = 12, Tp = 12, B = 26;
    const xs = tr.map(e => dayNum(e.date));
    let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 === x0) x1 = x0 + 1;
    const ys = tr.flatMap(e => [e.kg, e.trend]);
    const y0 = Math.floor(Math.min(...ys) - 0.5), y1 = Math.ceil(Math.max(...ys) + 0.5);
    const X = x => L + (x - x0) / (x1 - x0) * (W - L - R);
    const Y = y => Tp + (1 - (y - y0) / (y1 - y0)) * (H - Tp - B);
    const grid = [];
    const stepY = Math.max(0.5, Math.ceil((y1 - y0) / 4 * 2) / 2);
    for (let y = y0; y <= y1 + 1e-9; y += stepY) grid.push(`<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" class="gl"/><text x="${L - 6}" y="${Y(y) + 4}" text-anchor="end">${n(y, stepY % 1 ? 1 : 0)}</text>`);
    const pts = tr.map(e => `<circle cx="${X(dayNum(e.date))}" cy="${Y(e.kg)}" r="3" class="raw"/>`).join('');
    const line = tr.map(e => `${X(dayNum(e.date)).toFixed(1)},${Y(e.trend).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="wchart" role="img">
      ${grid.join('')}
      <polyline points="${line}" class="trend"/>${pts}
      <text x="${L}" y="${H - 6}">${tr[0].date}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${tr[tr.length - 1].date}</text>
    </svg>`;
  }

  async function renderPhotos() {
    const gal = $('#gallery'); if (!gal) return;
    photoURLs.forEach(URL.revokeObjectURL); photoURLs = [];
    let list = [];
    try { list = await MF.photos.all(); } catch (e) { gal.innerHTML = `<p class="note warn">IndexedDB: ${esc(e.message || e)}</p>`; return; }
    if (!document.body.contains(gal) || !$('#compare')) return; // entretanto o ecrã mudou (ex.: saiu da conta)
    list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const url = p => { const u = URL.createObjectURL(p.blob); photoURLs.push(u); return u; };
    if (!list.length) { gal.innerHTML = `<p class="muted">${t('noPhotos')}</p>`; $('#compare').innerHTML = ''; return; }
    const urls = Object.fromEntries(list.map(p => [p.id, url(p)]));
    gal.innerHTML = list.map(p => `<figure><img src="${urls[p.id]}" alt="" loading="lazy"><figcaption>${p.date} · ${t(p.pose)}
      <button class="icon small" data-act="delPhoto" data-id="${p.id}">${ICON.x}</button></figcaption></figure>`).join('');
    // Comparar: escolhe a pose, por defeito a mais antiga vs a mais recente
    const cmp = S.ui.cmp || {};
    const pose = cmp.pose && list.some(p => p.pose === cmp.pose) ? cmp.pose : list[0].pose;
    const ofPose = list.filter(p => p.pose === pose).slice().reverse();
    if (ofPose.length < 2) { $('#compare').innerHTML = ''; return; }
    const a = ofPose.find(p => p.id === cmp.a) || ofPose[0];
    const b = ofPose.find(p => p.id === cmp.b) || ofPose[ofPose.length - 1];
    const opts = cur => ofPose.map(p => `<option value="${p.id}" ${sel(p.id === cur.id)}>${p.date}</option>`).join('');
    $('#compare').innerHTML = `<h3>${t('compare')}</h3>
      <div class="row gap wrap"><select data-act="cmpPose">${['front', 'side', 'back'].filter(ps => list.some(p => p.pose === ps)).map(ps => `<option value="${ps}" ${sel(ps === pose)}>${t(ps)}</option>`).join('')}</select>
      <label>${t('before')} <select data-act="cmpA">${opts(a)}</select></label><label>${t('after')} <select data-act="cmpB">${opts(b)}</select></label></div>
      <div class="cmp"><figure><img src="${urls[a.id]}"><figcaption>${t('before')} · ${a.date}</figcaption></figure><figure><img src="${urls[b.id]}"><figcaption>${t('after')} · ${b.date}</figcaption></figure></div>`;
  }

  async function exportAll() {
    const photos = await MF.photos.all().catch(() => []);
    const toData = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    const ph = [];
    for (const p of photos) ph.push({ id: p.id, date: p.date, pose: p.pose, data: await toData(p.blob) });
    const blob = new Blob([JSON.stringify({ app: 'macroforge', v: 1, state: S, photos: ph })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `macroforge-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importAll(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'macroforge' || !data.state) throw new Error('bad');
      S = MF.store.replace({ ...sanitizeState(data.state), ownerId: S.ownerId, lang: S.lang, theme: S.theme, sharedFoods: S.sharedFoods }); save();
      await MF.photos.clear();
      for (const p of data.photos || []) {
        if (!p || !SAFE_ID.test(p.id) || !DATE.test(p.date) || !POSES.includes(p.pose) || !/^data:image\/(jpeg|png|webp);base64,/.test(p.data || '')) continue;
        await MF.photos.put({ id: p.id, date: p.date, pose: p.pose, blob: await (await fetch(p.data)).blob() });
      }
      render(); toast(t('importOk'));
    } catch (e) { toast(t('importFail')); }
  }

  const VIEWS = { goals: viewGoals, foods: viewFoods, plan: viewPlan, shop: viewShop, progress: viewProgress };
  const AFTER = { progress: renderPhotos };

  // ---------------- Eventos ----------------
  function setFood(id, key, val) {
    const st = S.foods[id] || (S.foods[id] = {});
    st[key] = val ?? !st[key];
  }
  function item(el) { return S.plan.days[S.dayIdx].meals[+el.dataset.m].items[+el.dataset.i]; }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const a = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
    switch (a) {
      case 'tab': S.tab = v; save(); render(); window.scrollTo(0, 0); return;
      case 'lang': S.lang = v; save(); render(); return;
      case 'theme': S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); render(); return;
      case 'goal': Object.assign(S.profile, { goal: v, protein: null, fat: null, carbs: null, kcalOverride: null }); break;
      case 'mode': S.profile.mode = v; break;
      case 'resetMid': Object.assign(S.profile, { protein: null, fat: null, carbs: null, kcalPos: 0.5 }); break;
      case 'clearOverride': S.profile.kcalOverride = null; break;
      case 'like': case 'buy': setFood(id, a); save(); $('#foodlist').innerHTML = foodList(); updateAvail(); return;
      case 'cat': S.ui.cat = v; break;
      case 'basics': MF.BASICS.forEach(i => { setFood(i, 'like', true); setFood(i, 'buy', true); }); break;
      case 'allBuy': Object.values(S.foods).forEach(st => { if (st.like) st.buy = true; }); break;
      case 'clearSel': S.foods = {}; break;
      case 'delShared': {
        const f0 = fmap()[id];
        if (!f0 || !f0.mine || !confirm(t('confirmDelShared'))) return;
        MF.sync.deleteShared(f0.sid).then(() => { S.sharedFoods = S.sharedFoods.filter(f => f.id !== id); delete S.foods[id]; save(); rerenderView(); })
          .catch(() => toast(t('sharedFailed')));
        return;
      }
      case 'delCustom':
        if (!confirm(t('confirmDel'))) return;
        S.customFoods = S.customFoods.filter(f => f.id !== id); delete S.foods[id]; break;
      case 'meals': S.profile.meals = +v; save(); if (S.plan) generate(); else rerenderView(); return;
      case 'days': S.profile.days = +v; save(); if (S.plan) generate(); else rerenderView(); return;
      case 'generate': generate(); return;
      case 'readjust': readjust(); return;
      case 'day': S.dayIdx = +v; break;
      case 'lock': { const it = item(el); it.locked = !it.locked; resolveDay(S.dayIdx); break; }
      case 'remove': S.plan.days[S.dayIdx].meals[+el.dataset.m].items.splice(+el.dataset.i, 1); resolveDay(S.dayIdx); break;
      case 'quickAdd': case 'sugAdd':
        setFood(id, 'like', true); setFood(id, 'buy', true); delete S.dismissed[id];
        S.pendingNew = (S.pendingNew || 0) + 1; toast(t('sugAdded')); break;
      case 'sugDismiss': S.dismissed[id] = true; break;
      case 'undismiss': S.dismissed = {}; break;
      case 'copyList': {
        const txt = shopData().map(([c, l]) => `${t('cat_' + c)}\n` + l.map(({ f, g }) => `- ${fname(f)}: ${amountText(f, g)}`).join('\n')).join('\n\n');
        navigator.clipboard?.writeText(txt).then(() => toast(t('copied')), () => toast(txt.slice(0, 40)));
        return;
      }
      case 'resetChecks': S.shopChecked = {}; break;
      case 'delWeight': S.weights = S.weights.filter(w => w.date !== v); break;
      case 'applyKcal': Object.assign(S.profile, { kcalOverride: +v, mode: 'kcal' }); save(); rerenderView(); toast(t('applied')); return;
      case 'delPhoto': if (confirm(t('confirmDelPhoto'))) MF.photos.del(id).then(() => { if (SY()) MF.sync.photoDeleted(id); renderPhotos(); }); return;
      case 'account': if (S.tab !== 'progress') { S.tab = 'progress'; save(); render(); } setTimeout(() => $('#account')?.scrollIntoView({ behavior: 'smooth' }), 50); return;
      case 'syncNow': MF.sync.now(); return;
      case 'recheck': MF.sync.recheck().then(st => { if (st !== 'approved') authMsg(t('pendingStill'), true); }); return;
      case 'gateSignOut': MF.sync.signOut().then(() => wipeLocal()); return;
      case 'signOut': (async () => {
        if (!confirm(t('signOutConfirm'))) return;
        await MF.sync.now();
        if (MF.sync.status !== 'ok' && !confirm(t('signOutUnsynced'))) return;
        await MF.sync.signOut(); await wipeLocal(); toast(t('signedOut'));
      })(); return;
      case 'deleteAccount': (async () => {
        const word = t('deleteWord');
        if (prompt(t('deleteConfirm', { w: word })) !== word) return toast(t('deleteCancelled'));
        try { await MF.sync.deleteAccount(); await wipeLocal(); toast(t('deleteDone')); }
        catch (e) { toast(t('deleteFailed') + ' ' + (e.message || '')); }
      })(); return;
      case 'forgot': {
        const email = ($('#authForm [name=email]') || {}).value;
        if (!email) return authMsg(t('accNeedEmail'));
        MF.sync.resetPassword(email).then(({ error }) => authMsg(error ? error.message : t('accResetSent'), !error));
        return;
      }
      case 'export': exportAll(); return;
      case 'labelManual': setLabel({ status: 'review', food: {}, flags: [] }); return;
      case 'labelEdit': {
        const f = fmap()[LS.savedId];
        setLabel({ status: 'review', flags: [], food: { name: f.pt, cat: f.cat, k: f.k, p: f.p, c: f.c, f: f.f, fb: f.fb, m: f.m, unit: f.unit, meas: f.meas, serving: f.por, editId: f.id } });
        return;
      }
      case 'labelUndo': {
        const f0 = fmap()[LS.savedId];
        if (f0 && f0.shared && f0.mine && MF.sync.user) MF.sync.deleteShared(f0.sid).catch(() => {});
        S.sharedFoods = (S.sharedFoods || []).filter(f => f.id !== LS.savedId);
      }
        S.customFoods = S.customFoods.filter(f => f.id !== LS.savedId); delete S.foods[LS.savedId];
        S.pendingNew = Math.max(0, (S.pendingNew || 0) - 1); LS = { status: 'idle' }; break;
      default: return;
    }
    save(); rerenderView();
  });

  function updateAvail() { const pill = document.querySelector('.big-pill'); if (pill) pill.textContent = t('availableCount', { n: available().length }); }

  const NUM_FIELDS = { age: 1, height: 1, weight: 1, bodyfat: 1, protein: 1, fat: 1, carbs: 1, kcalPos: 1, activity: 1 };
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.act === 'search') { foodQuery = el.value; $('#foodlist').innerHTML = foodList(); return; }
    const k = el.dataset.bind; if (!k) return;
    if (NUM_FIELDS[k]) {
      const v = parseFloat(el.value);
      if (isNaN(v)) { if (['bodyfat', 'protein', 'fat', 'carbs'].includes(k)) S.profile[k] = null; else return; }
      else S.profile[k] = v;
    } else S.profile[k] = el.value;
    if (k === 'kcalPos' || k === 'weight') S.profile.kcalOverride = null;
    if (S.profile.weight < 30) return;
    save();
    const r = $('#results'); if (r) r.innerHTML = results();
    const h = $('#hero'); if (h) h.innerHTML = heroHTML();
    const mv = $('#multv'); if (mv) mv.textContent = '×' + MF.util.lerp(MF.GOALS[S.profile.goal].kcal, S.profile.kcalPos).toFixed(1);
  });

  document.addEventListener('change', async e => {
    const el = e.target, a = el.dataset.act;
    if (el.dataset.bind && el.tagName === 'SELECT') { S.profile[el.dataset.bind] = el.dataset.bind === 'activity' ? +el.value : el.value; save(); $('#results').innerHTML = results(); return; }
    switch (a) {
      case 'qty': {
        const it = item(el); const v = Math.max(0, parseFloat(el.value) || 0);
        const u = MF.unitsOf(fmap()[it.id]).find(x => x[0] === it.u) || ['g', 1];
        it.g = Math.round(v * u[1] * 10) / 10; it.locked = true; resolveDay(S.dayIdx); break;
      }
      case 'qtyUnit': { const it = item(el); it.u = el.value === 'g' ? undefined : el.value; break; }
      case 'swap': {
        if (!el.value) return;
        const it = item(el); const f = fmap()[el.value];
        Object.assign(it, { id: f.id, g: MF.defaultG(f), locked: false, u: undefined }); resolveDay(S.dayIdx); break;
      }
      case 'addFood': {
        if (!el.value) return;
        let fid = el.value;
        if (fid.startsWith('new:')) { fid = fid.slice(4); setFood(fid, 'like', true); setFood(fid, 'buy', true); delete S.dismissed[fid]; }
        const f = fmap()[fid];
        S.plan.days[S.dayIdx].meals[+el.dataset.m].items.push({ id: f.id, g: MF.defaultG(f) }); resolveDay(S.dayIdx); break;
      }
      case 'shopCheck': S.shopChecked[el.dataset.id] = el.checked; save(); el.closest('li').classList.toggle('done', el.checked); return;
      case 'photoFiles': {
        const date = $('#photoDate').value || today(), pose = $('#photoPose').value;
        for (const file of el.files) {
          const blob = await MF.photos.compress(file);
          const rec = { id: date + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, pose, blob };
          await MF.photos.put(rec);
          if (SY()) MF.sync.photoAdded(rec);
        }
        el.value = ''; renderPhotos(); return;
      }
      case 'cmpPose': S.ui.cmp = { pose: el.value }; save(); renderPhotos(); return;
      case 'cmpA': case 'cmpB': S.ui.cmp = { ...(S.ui.cmp || {}), pose: $('[data-act=cmpPose]').value, [a === 'cmpA' ? 'a' : 'b']: el.value }; save(); renderPhotos(); return;
      case 'import': if (el.files[0]) importAll(el.files[0]); return;
      case 'labelPhoto': if (el.files[0]) readLabel(el.files[0]); el.value = ''; return;
      default: return;
    }
    save(); rerenderView();
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'authForm') {
      const fd = new FormData(e.target), email = fd.get('email').trim(), pw = fd.get('password');
      const up = e.submitter && e.submitter.value === 'up';
      if (up && !fd.get('consent')) return authMsg(t('consentNeeded'));
      authMsg(t('accWorking'), true);
      (up ? MF.sync.signUp(email, pw, { consent_at: new Date().toISOString(), consent_version: 1 }) : MF.sync.signIn(email, pw)).then(({ data, error }) => {
        if (error) return authMsg(error.message);
        if (up && !data.session) return authMsg(t('accCheckEmail'), true);
        toast(t('signedIn'));
      });
      return;
    }
    if (e.target.id === 'newPwForm') {
      MF.sync.updatePassword(new FormData(e.target).get('password')).then(({ error }) => {
        if (error) return authMsg(error.message);
        MF.sync.recovering = false; render(); toast(t('accPwChanged'));
      });
      return;
    }
    const fd = new FormData(e.target), g = k => fd.get(k);
    if (e.target.id === 'weightForm') {
      const rec = { date: g('date'), kg: parseFloat(g('kg')) };
      if (g('waist')) rec.waist = parseFloat(g('waist'));
      if (g('kcal')) rec.kcal = parseFloat(g('kcal'));
      S.weights = S.weights.filter(w => w.date !== rec.date).concat(rec);
      S.profile.weight = rec.kg; // a meta acompanha o peso mais recente
      save(); rerenderView(); return;
    }
    if (e.target.id === 'customForm' || e.target.id === 'labelForm') {
      const draft = foodFromForm(fd);
      const old = fmap()[draft.id];
      if (old && old.shared && old.mine) draft.sid = old.sid;
      else if (old && old.shared) draft.id = 'c_' + Date.now().toString(36); // alimento de outra pessoa: a correção fica uma cópia só tua
      const isLabel = e.target.id === 'labelForm';
      saveFood(draft, isLabel ? 'label' : 'manual').then(food => {
        if (isLabel) LS = { status: 'done', savedId: food.id, food: LS.food };
        rerenderView();
      });
    }
  });

  // O estado guardado neste aparelho também passa pela limpeza, sem contar como alteração
  S = MF.store.replace({ ...sanitizeState(S), ownerId: S.ownerId, lang: S.lang, theme: S.theme, sharedFoods: S.sharedFoods });
  MF.store.adopt(S, S.updatedAt || 0);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
})();
