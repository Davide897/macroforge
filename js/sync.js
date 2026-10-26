// Sincronização entre aparelhos (Supabase): login, estado da app e fotos.
// Local primeiro: a app funciona sempre offline; a nuvem acompanha quando há rede.
// Regras: no arranque puxa ANTES de empurrar; o estado mais recente ganha (updatedAt);
// as fotos juntam-se dos dois lados e só desaparecem com uma "lápide" (apagadas de propósito).
(function () {
  const MF = window.MF;
  const cfg = window.MF_CONFIG;
  const listeners = new Set();
  const sync = MF.sync = {
    available: !!(cfg && window.supabase),
    user: null, status: 'off', lastSync: null, error: null, ready: false,
    onRemote: null,                       // a app regista aqui como aplicar um estado vindo da nuvem
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const emit = () => listeners.forEach(fn => { try { fn(sync); } catch (e) { console.error(e); } });
  const set = (k, v) => { sync[k] = v; emit(); };
  if (!sync.available) return;

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'macroforge.auth' },
  });
  sync.client = sb;
  const redirect = () => location.origin + location.pathname;

  // ---------- conta ----------
  sync.signUp = (email, password, meta) => sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect(), data: meta || {} } });
  sync.signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
  sync.signOut = () => sb.auth.signOut();
  sync.resetPassword = email => sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  sync.updatePassword = password => sb.auth.updateUser({ password });

  // ---------- estado ----------
  let getState = null, pushTimer = null, pulling = false, pendingPush = false;
  sync.attach = fn => { getState = fn; };

  async function pull() {
    if (!sync.user || pulling) return;
    pulling = true; set('status', 'syncing');
    try {
      const { data, error } = await sb.from('app_state').select('state, updated_at').eq('user_id', sync.user.id).maybeSingle();
      if (error) throw error;
      const local = getState && getState();
      if (data && (!local || (data.updated_at || 0) > (local.updatedAt || 0))) {
        if (sync.onRemote) await sync.onRemote(data.state, data.updated_at);
      } else if (local) {
        sync.ready = true; await push(true);
      }
      sync.ready = true;
      if (sync.onShared) await sync.fetchShared().then(sync.onShared).catch(() => {});
      await syncPhotos();
      sync.lastSync = Date.now(); set('status', 'ok'); set('error', null);
    } catch (e) {
      set('error', e.message || String(e)); set('status', navigator.onLine ? 'error' : 'offline');
    } finally { pulling = false; }
  }

  async function push(force) {
    if (!sync.user || !sync.ready || !getState) { pendingPush = true; return; }
    const s = getState();
    if (!force && !pendingPush) return;
    pendingPush = false;
    set('status', 'syncing');
    try {
      const { error } = await sb.from('app_state').upsert({ user_id: sync.user.id, state: MF.store.payload(s), updated_at: s.updatedAt || Date.now() });
      if (error) throw error;
      sync.lastSync = Date.now(); set('status', 'ok'); set('error', null);
    } catch (e) {
      pendingPush = true;
      set('error', e.message || String(e)); set('status', navigator.onLine ? 'error' : 'offline');
    }
  }
  sync.schedulePush = () => {
    pendingPush = true;
    if (!sync.user) return;
    clearTimeout(pushTimer); pushTimer = setTimeout(() => push(), 1500);
  };
  sync.now = async () => { await pull(); if (pendingPush) await push(); };

  // ---------- fotos ----------
  // state.photoMeta = [{id, date, pose}] · state.photoDeleted = {id: ts}
  const path = id => `${sync.user.id}/${id}.jpg`;
  async function syncPhotos() {
    if (!sync.user || !getState) return;
    const s = getState();
    s.photoMeta = s.photoMeta || []; s.photoDeleted = s.photoDeleted || {};
    const local = await MF.photos.all().catch(() => []);
    const localIds = new Set(local.map(p => p.id));
    const metaIds = new Set(s.photoMeta.map(p => p.id));
    let changed = false;
    // lápides: apagar aqui e na nuvem
    for (const id of Object.keys(s.photoDeleted)) {
      if (localIds.has(id)) { await MF.photos.del(id); localIds.delete(id); }
      if (metaIds.has(id)) { s.photoMeta = s.photoMeta.filter(p => p.id !== id); changed = true; }
    }
    const dead = Object.keys(s.photoDeleted).map(path);
    if (dead.length) await sb.storage.from('photos').remove(dead).catch(() => {});
    // fotos locais que a nuvem ainda não conhece: juntar ao índice
    for (const p of local) if (!s.photoDeleted[p.id] && !metaIds.has(p.id)) { s.photoMeta.push({ id: p.id, date: p.date, pose: p.pose }); metaIds.add(p.id); changed = true; }
    // enviar as que faltam na nuvem
    const { data: remoteList } = await sb.storage.from('photos').list(sync.user.id, { limit: 1000 });
    const remoteIds = new Set((remoteList || []).map(o => o.name.replace(/\.jpg$/, '')));
    for (const p of local) if (!s.photoDeleted[p.id] && !remoteIds.has(p.id)) {
      await sb.storage.from('photos').upload(path(p.id), p.blob, { contentType: 'image/jpeg', upsert: true });
    }
    // descarregar as que existem no índice mas não neste aparelho
    for (const m of s.photoMeta) if (!localIds.has(m.id) && remoteIds.has(m.id)) {
      const { data: blob } = await sb.storage.from('photos').download(path(m.id));
      if (blob) await MF.photos.put({ id: m.id, date: m.date, pose: m.pose, blob });
    }
    if (changed) { MF.store.save(s); }
    if (sync.onPhotos) sync.onPhotos();
  }
  sync.photoAdded = rec => { const s = getState && getState(); if (!s) return; s.photoMeta = (s.photoMeta || []).filter(p => p.id !== rec.id).concat({ id: rec.id, date: rec.date, pose: rec.pose }); MF.store.save(s); if (sync.user) syncPhotos().catch(() => {}); };
  sync.photoDeleted = id => { const s = getState && getState(); if (!s) return; s.photoDeleted = { ...(s.photoDeleted || {}), [id]: Date.now() }; s.photoMeta = (s.photoMeta || []).filter(p => p.id !== id); MF.store.save(s); if (sync.user) syncPhotos().catch(() => {}); };

  // ---------- catálogo de alimentos da comunidade ----------
  const COLS = 'id, created_by, name, cat, k, p, c, f, fb, m, unit, meas, por, source';
  sync.fetchShared = async () => {
    if (!sync.user) return null;
    const { data, error } = await sb.from('shared_foods').select(COLS).order('name').limit(5000);
    if (error) throw error;
    return data;
  };
  // Publica um alimento. Se o nome já existir na comunidade, devolve o existente (sem duplicar).
  sync.publishFood = async row => {
    const { data, error } = await sb.from('shared_foods').insert({ ...row, created_by: sync.user.id }).select(COLS).single();
    if (!error) return { row: data, created: true };
    if (error.code === '23505') {
      const { data: ex } = await sb.from('shared_foods').select(COLS).ilike('name', row.name.trim()).limit(1).maybeSingle();
      if (ex) return { row: ex, created: false };
    }
    throw error;
  };
  sync.updateShared = async (id, row) => {
    const { data, error } = await sb.from('shared_foods').update(row).eq('id', id).select(COLS).single();
    if (error) throw error;
    return data;
  };
  sync.deleteShared = async id => { const { error } = await sb.from('shared_foods').delete().eq('id', id); if (error) throw error; };

  // ---------- leitura de rótulos pela função na nuvem ----------
  sync.readLabel = async dataUrl => {
    const { data, error } = await sb.functions.invoke('label', { body: { image: dataUrl } });
    if (error) throw error;
    return data;
  };

  // ---------- apagar conta (função na nuvem: fotos + dados + conta) ----------
  sync.deleteAccount = async () => {
    const { data, error } = await sb.functions.invoke('delete-account', { body: {} });
    if (error) throw error;
    if (!data || !data.ok) throw new Error((data && data.error) || 'deleteFailed');
    await sb.auth.signOut().catch(() => {});
    return data;
  };

  // ---------- ciclo de vida ----------
  sb.auth.onAuthStateChange((event, session) => {
    const was = sync.user && sync.user.id;
    sync.user = session ? session.user : null;
    if ((sync.user && sync.user.id) !== was) { sync.ready = false; clearTimeout(pushTimer); }
    if (event === 'PASSWORD_RECOVERY') sync.recovering = true;
    if (!sync.user) {
      sync.ready = false; set('status', 'off');
      // sessão terminada sem o botão "Sair" (expirou, foi revogada): avisar a app para limpar o aparelho
      if (was && event === 'SIGNED_OUT' && sync.onSignedOut) sync.onSignedOut({ pending: pendingPush });
      return;
    }
    emit();
    // Antes de puxar, a app confirma de quem são os dados deste aparelho (aparelho partilhado = limpar primeiro)
    if (sync.user.id !== was) {
      pendingPush = false; // alterações pendentes da conta anterior não passam para esta
      setTimeout(() => Promise.resolve(sync.onUser && sync.onUser(sync.user)).then(() => { pendingPush = false; return pull(); }), 0);
    }
  });
  window.addEventListener('online', () => sync.user && sync.now());
  document.addEventListener('visibilitychange', () => {
    if (!sync.user) return;
    if (document.visibilityState === 'visible' && (!sync.lastSync || Date.now() - sync.lastSync > 30000)) pull();
    if (document.visibilityState === 'hidden' && pendingPush) push();
  });
})();
