// Apaga a conta de quem pede: fotos no armazenamento, dados (em cascata) e o próprio utilizador.
// Só a própria pessoa: a sessão é confirmada no código (não confiar só no verify_jwt).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'notFound' }, 404);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'needLogin' }, 401);
  const ur = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!ur.ok) { await ur.body?.cancel(); return json({ ok: false, error: 'needLogin' }, 401); }
  const uid = (await ur.json()).id as string;
  if (!uid) return json({ ok: false, error: 'needLogin' }, 401);
  const admin = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };
  // 1) fotos (pasta <uid>/ no bucket privado)
  let removed = 0;
  for (let page = 0; page < 50; page++) {
    const lr = await fetch(`${url}/storage/v1/object/list/photos`, { method: 'POST', headers: admin, body: JSON.stringify({ prefix: uid, limit: 1000 }) });
    const objs = lr.ok ? await lr.json() : [];
    if (!Array.isArray(objs) || !objs.length) break;
    const prefixes = objs.map((o: { name: string }) => `${uid}/${o.name}`);
    const dr = await fetch(`${url}/storage/v1/object/photos`, { method: 'DELETE', headers: admin, body: JSON.stringify({ prefixes }) });
    if (!dr.ok) return json({ ok: false, error: 'photosFailed' }, 500);
    await dr.body?.cancel();
    removed += prefixes.length;
  }
  // 2) conta (app_state e label_usage apagam em cascata)
  const del = await fetch(`${url}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: admin });
  if (!del.ok) return json({ ok: false, error: 'userFailed' }, 500);
  await del.body?.cancel();
  return json({ ok: true, photos: removed });
});
