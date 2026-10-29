// Supabase falso para testes: substitui js/vendor/supabase.js. Conta aprovada; as tabelas vivem no servidor
// de teste (POST /__fake). Nunca fala com o Supabase real.
// localStorage 'fake.device': nome do aparelho · 'fake.session' = 'none': começa sem sessão (ecrã de entrada)
(function () {
  const DEVICE = localStorage.getItem('fake.device') || 'X';
  const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'teste@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' };
  const call = body => fetch('/__fake', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device': DEVICE }, body: JSON.stringify(body) })
    .then(r => { if (!r.ok) throw new TypeError('Failed to fetch'); return r.json(); });
  class Q {
    constructor(t) { this.b = { t, op: 'select', f: [], mode: 'many', ret: false }; }
    select() { if (this.b.op !== 'select') this.b.ret = true; return this; }
    insert(row) { this.b.op = 'insert'; this.b.row = row; return this; }
    update(row) { this.b.op = 'update'; this.b.row = row; return this; }
    upsert(row) { this.b.op = 'upsert'; this.b.row = row; return this; }
    delete() { this.b.op = 'delete'; return this; }
    eq(c, v) { this.b.f.push([c, v]); return this; }
    ilike(c, v) { this.b.f.push([c, v, 'ilike']); return this; }
    order() { return this; } limit() { return this; }
    maybeSingle() { this.b.mode = 'maybe'; return this; }
    single() { this.b.mode = 'single'; return this; }
    then(res, rej) { return call(this.b).then(res, rej); }
  }
  window.supabase = {
    createClient() {
      const listeners = [];
      let session = localStorage.getItem('fake.session') === 'none' ? null : { user: USER };
      const emit = ev => listeners.forEach(cb => cb(ev, session));
      return {
        auth: {
          onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb(session ? 'SIGNED_IN' : 'INITIAL_SESSION', session), 50); return { data: { subscription: { unsubscribe() {} } } }; },
          signInWithPassword: async () => { session = { user: USER }; localStorage.removeItem('fake.session'); setTimeout(() => emit('SIGNED_IN'), 10); return { data: { session }, error: null }; },
          signOut: async () => { session = null; setTimeout(() => emit('SIGNED_OUT'), 10); return { error: null }; },
          signUp: async () => ({ data: {}, error: null }), resetPasswordForEmail: async () => ({ error: null }), updateUser: async () => ({ error: null }),
        },
        from: t => new Q(t),
        rpc: name => call({ t: 'rpc', op: name, f: [], mode: 'many' }),
        functions: { invoke: async name => (name === 'request-approval' ? { data: { ok: true, status: 'approved' }, error: null } : { data: null, error: { message: 'fake' } }) },
        storage: { from: () => ({ list: async () => ({ data: [] }), upload: async () => ({}), download: async () => ({ data: null }), remove: async () => ({}) }) },
      };
    },
  };
})();
