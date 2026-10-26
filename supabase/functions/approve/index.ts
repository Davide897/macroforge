// O administrador aprova ou recusa uma conta (chamado pela página approve.html, a partir do email).
// Sem sessão (verify_jwt desligado): a autorização é a assinatura HMAC do link, com validade.
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sign(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sameString(a: string, b: string) { // comparação em tempo constante
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'notFound' }, 404);
  let body: { u?: string; a?: string; e?: string | number; s?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'badRequest' }, 400); }
  const u = String(body.u || ''), a = String(body.a || ''), e = Number(body.e), s = String(body.s || '');
  if (!UUID.test(u) || !['approve', 'reject'].includes(a) || !Number.isFinite(e)) return json({ ok: false, error: 'badRequest' }, 400);
  if (e < Date.now() / 1000) return json({ ok: false, error: 'expired' }, 400);
  const expected = await sign(Deno.env.get('APPROVAL_SECRET')!, `${u}|${a}|${e}`);
  if (!sameString(expected, s)) return json({ ok: false, error: 'badSignature' }, 403);

  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const status = a === 'approve' ? 'approved' : 'rejected';
  const r = await fetch(`${url}/rest/v1/profiles?user_id=eq.${u}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ status, decided_at: new Date().toISOString() }) });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return json({ ok: false, error: 'notFound' }, 404);
  const email = String(rows[0].email || '');
  if (status === 'approved' && email) {
    try {
      const t = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 465, secure: true,
        auth: { user: Deno.env.get('BREVO_SMTP_LOGIN')!, pass: Deno.env.get('BREVO_SMTP_KEY')! } });
      await t.sendMail({ from: `MacroForge <${Deno.env.get('BREVO_SENDER_EMAIL')}>`, to: email, subject: 'MacroForge: a tua conta foi aprovada',
        html: `<h2>A tua conta MacroForge está ativa</h2><p><a href="${Deno.env.get('APP_URL')}">Abrir o MacroForge</a></p>` });
    } catch { /* a aprovação vale na mesma; o email é só um aviso */ }
  }
  return json({ ok: true, status, email });
});
