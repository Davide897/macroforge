// Estado da aprovação da conta de quem pede. Se ainda não foi pedida, envia ao administrador
// um email com os botões Aprovar / Recusar (links assinados, válidos 30 dias).
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function sign(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendMail(to: string, subject: string, html: string) {
  // Brevo por SMTP na porta 465 (as Edge Functions bloqueiam a 587)
  const t = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', port: 465, secure: true,
    auth: { user: Deno.env.get('BREVO_SMTP_LOGIN')!, pass: Deno.env.get('BREVO_SMTP_KEY')! },
  });
  await t.sendMail({ from: `MacroForge <${Deno.env.get('BREVO_SENDER_EMAIL')}>`, to, subject, html });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'notFound' }, 404);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'needLogin' }, 401);
  const ur = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!ur.ok) { await ur.body?.cancel(); return json({ ok: false, error: 'needLogin' }, 401); }
  const user = await ur.json();
  if (!user?.id) return json({ ok: false, error: 'needLogin' }, 401);
  const admin = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };
  const rest = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...admin, Prefer: 'return=representation', ...(init.headers || {}) } });

  let prof = (await (await rest(`profiles?user_id=eq.${user.id}&select=status,notified_at`)).json())[0];
  if (!prof) prof = (await (await rest('profiles', { method: 'POST', body: JSON.stringify({ user_id: user.id, email: user.email }) })).json())[0];
  if (prof.status === 'approved' || prof.status === 'rejected') return json({ ok: true, status: prof.status });

  const adminEmail = (Deno.env.get('ADMIN_EMAIL') || '').toLowerCase();
  if (adminEmail && String(user.email).toLowerCase() === adminEmail && user.email_confirmed_at) {
    await rest(`profiles?user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', decided_at: new Date().toISOString() }) });
    return json({ ok: true, status: 'approved' });
  }
  // Avisar o administrador (uma vez por dia no máximo, enquanto estiver pendente)
  const last = prof.notified_at ? Date.parse(prof.notified_at) : 0;
  if (Date.now() - last > 24 * 3600e3) {
    const exp = Math.floor(Date.now() / 1000) + 30 * 86400, secret = Deno.env.get('APPROVAL_SECRET')!, app = Deno.env.get('APP_URL')!;
    const link = async (a: string) => `${app}approve.html?u=${user.id}&a=${a}&e=${exp}&s=${await sign(secret, `${user.id}|${a}|${exp}`)}`;
    const html = `<h2>Novo pedido de conta no MacroForge</h2>
      <p><b>${esc(String(user.email))}</b> criou conta e confirmou o email.</p>
      <p><a href="${await link('approve')}" style="background:#4f9d12;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Aprovar</a>
      &nbsp; <a href="${await link('reject')}" style="color:#c93c3c">Recusar</a></p>
      <p style="color:#777">Os links abrem a app e pedem-te para confirmar. Válidos 30 dias.</p>`;
    try {
      await sendMail(adminEmail, `MacroForge: aprovar ${user.email}?`, html);
      await rest(`profiles?user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    } catch (e) {
      console.error('request-approval: envio do email falhou:', (e as Error).message); // só no registo do servidor
      return json({ ok: true, status: 'pending', notify: 'failed' });
    }
  }
  return json({ ok: true, status: 'pending' });
});
