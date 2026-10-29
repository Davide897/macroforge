// TESTE CONTRA O SUPABASE DE PRODUÇÃO (contas temporárias criadas e apagadas por run_*.py). Correr só à mão,
// com autorização do Davide. Nunca no CI. A app tem de estar servida em MF_URL (os run_*.py arrancam o serve.py).
// Tenta os ataques que a revisão descreveu, com uma sessão real de utilizador
import { chromium } from 'playwright-core';
const { A_EMAIL, A_PW, B_EMAIL, B_PW } = process.env;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const errs = []; let alerted = false;
const dev = async () => { const c = await b.newContext(); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { if (d.type() === 'alert') alerted = true; d.accept(); }); await p.goto((process.env.MF_URL || 'http://localhost:8766/'), { waitUntil: 'networkidle' }); return p; };
const login = async (p, e, pw) => { await p.fill('#authForm [name=email]', e); await p.fill('#authForm [name=password]', pw); await p.click('#authForm button[value=in]'); await p.waitForSelector('nav.tabs', { timeout: 60000 }); await p.waitForTimeout(1500); };
const A = await dev(); await login(A, A_EMAIL, A_PW);
const r = await A.evaluate(async () => {
  const sb = MF.sync.client, out = {};
  const x = await sb.from('shared_foods').insert({ name: 'Teste MF XSS', cat: 'prot', k: 100, p: 20, c: 1, f: 1, meas: [['<img src=x onerror=alert(1)>', 10]] });
  out.medidaMaliciosa = x.error ? 'recusada' : 'ACEITE';
  const y = await sb.from('shared_foods').insert({ name: 'Teste MF XSS2', cat: 'prot', k: 100, p: 20, c: 1, f: 1, unit: { g: 10, pt: '<b>x</b>' } });
  out.unidadeMaliciosa = y.error ? 'recusada' : 'ACEITE';
  const ok = await sb.from('shared_foods').insert({ name: 'Teste MF Boa', cat: 'prot', k: 100, p: 20, c: 1, f: 1, meas: [['csopa', 15]], unit: { g: 30, pt: 'barra', en: 'bar' } }).select('id').single();
  out.alimentoNormal = ok.error ? 'RECUSADO: ' + ok.error.message : 'aceite';
  const leak = await sb.from('shared_foods').select('created_by').limit(1);
  out.lerCreatedBy = leak.error ? 'proibido' : 'PERMITIDO';
  const spoof = await sb.from('shared_foods').insert({ name: 'Teste MF Spoof', cat: 'prot', k: 100, p: 20, c: 1, f: 1, created_by: '00000000-0000-0000-0000-000000000000' });
  out.criarEmNomeDeOutro = spoof.error ? 'recusado' : 'ACEITE';
  const mine = await sb.rpc('my_shared_food_ids'); out.meusIds = (mine.data || []).length;
  const upd = await sb.from('shared_foods').update({ k: 101 }).eq('id', ok.data.id).select('id'); out.corrigirOMeu = (upd.data || []).length;
  window.__boa = ok.data.id; return out;
});
console.log('A:', JSON.stringify(r));
const B = await dev(); await login(B, B_EMAIL, B_PW);
const rb = await B.evaluate(async id => {
  const sb = MF.sync.client;
  const upd = await sb.from('shared_foods').update({ k: 1 }).eq('id', id).select('id');
  const del = await sb.from('shared_foods').delete().eq('id', id).select('id');
  const mine = await sb.rpc('my_shared_food_ids');
  return { corrigirODeA: (upd.data || []).length, apagarODeA: (del.data || []).length, meusIdsDeB: (mine.data || []).length };
}, await A.evaluate(() => window.__boa));
console.log('B:', JSON.stringify(rb));
await B.click('[data-act=tab][data-v=foods]'); await B.fill('.search', 'Teste MF'); await B.waitForTimeout(400);
console.log('B vê na lista:', await B.$$eval('.food b', els => els.map(e => e.textContent)), '| etiqueta:', await B.$eval('.food .tag.shared', e => e.innerText).catch(() => '-'));
await A.click('[data-act=tab][data-v=foods]'); await A.click('[data-act=syncNow]').catch(() => {});
await A.evaluate(() => MF.sync.now()); await A.waitForTimeout(1500); await A.fill('.search', 'Teste MF'); await A.waitForTimeout(400);
console.log('A vê o seu como:', await A.$eval('.food .tag.shared', e => e.innerText).catch(() => '-'), '| alerta disparado:', alerted);
console.log('ERROS:', errs.length ? errs : 'nenhum'); await b.close();
