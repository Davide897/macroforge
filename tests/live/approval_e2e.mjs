// TESTE CONTRA O SUPABASE DE PRODUÇÃO (contas temporárias criadas e apagadas por run_*.py). Correr só à mão,
// com autorização do Davide. Nunca no CI. A app tem de estar servida em MF_URL (os run_*.py arrancam o serve.py).
import { chromium } from 'playwright-core';
const URL = (process.env.MF_URL || 'http://localhost:8766/');
const { P_EMAIL, P_PW, R_EMAIL, R_PW, LINK_OK, LINK_REJ } = process.env;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const errs = [];
const dev = async () => { const c = await b.newContext(); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(URL, { waitUntil: 'networkidle' }); return p; };
const what = p => p.evaluate(() => document.querySelector('.gate-loading') ? 'carregamento' : document.querySelector('[data-act=recheck]') ? 'a aguardar aprovação' : document.querySelector('.gate h2') && /não aprovada|not approved/i.test(document.querySelector('.gate h2').innerText) ? 'recusada' : document.querySelector('.gate #authForm') ? 'entrada' : document.querySelector('nav.tabs') ? 'app' : '?');
const login = async (p, e, pw) => { await p.fill('#authForm [name=email]', e); await p.fill('#authForm [name=password]', pw); await p.click('#authForm button[value=in]'); await p.waitForFunction(() => MF.sync.approval !== null, null, { timeout: 60000 }); await p.waitForTimeout(800); };

// Pessoa P: entra, fica pendente, tenta mexer nos dados diretamente
const P = await dev(); await login(P, P_EMAIL, P_PW);
console.log('1) depois de entrar:', await what(P));
const tries = await P.evaluate(async () => {
  const sb = MF.sync.client, uid = MF.sync.user.id;
  const w = await sb.from('app_state').upsert({ user_id: uid, state: {}, updated_at: 1 });
  const f = await sb.from('shared_foods').select('id').limit(1);
  const i = await sb.from('shared_foods').insert({ name: 'Teste MF Pendente', cat: 'carb', k: 100, p: 1, c: 20, f: 1 });
  const ph = await sb.storage.from('photos').upload(uid + '/x.jpg', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }));
  const l = await sb.functions.invoke('label', { body: { image: 'data:image/png;base64,AA' } });
  const prof = await sb.from('profiles').update({ status: 'approved' }).eq('user_id', uid).select();
  return { guardarDados: w.error ? 'recusado' : 'ACEITE', verComunidade: (f.data || []).length + ' linhas', criarNaComunidade: i.error ? 'recusado' : 'ACEITE',
    enviarFoto: ph.error ? 'recusado' : 'ACEITE', lerRotulo: l.error ? 'recusado' : JSON.stringify(l.data).slice(0, 40), aprovarASiProprio: prof.error ? 'recusado' : (prof.data || []).length + ' linhas' };
});
console.log('2) pendente a tentar usar a nuvem:', JSON.stringify(tries));

// O administrador abre o link do email e confirma
const A = await dev();
await A.goto(LINK_OK, { waitUntil: 'networkidle' });
console.log('3) página de aprovação (só abrir, sem clicar):', await A.$eval('h1', e => e.innerText));
await P.click('[data-act=recheck]'); await P.waitForTimeout(1500);
console.log('   a pessoa continua:', await what(P), '(abrir o link não aprova)');
await A.click('#go'); await A.waitForFunction(() => /aprovada|recusada|inválido|expirou/i.test(document.body.innerText), null, { timeout: 60000 });
console.log('4) depois de confirmar:', await A.$eval('h1', e => e.innerText), '|', await A.$eval('#text', e => e.innerText));
await P.click('[data-act=recheck]'); await P.waitForSelector('nav.tabs', { timeout: 60000 });
console.log('5) a pessoa carrega em "Verificar outra vez":', await what(P), '| sincroniza:', await P.waitForFunction(() => MF.sync.status === 'ok', null, { timeout: 60000 }).then(() => 'sim'));
// link adulterado e link de recusa
await A.goto(LINK_OK.replace(/s=[^&]+/, 's=xxxxx'), { waitUntil: 'networkidle' }); await A.click('#go'); await A.waitForTimeout(2500);
console.log('6) link adulterado:', await A.$eval('#msg', e => e.innerText));
const R = await dev(); await login(R, R_EMAIL, R_PW);
await A.goto(LINK_REJ, { waitUntil: 'networkidle' }); await A.click('#go'); await A.waitForTimeout(3000);
await R.click('[data-act=recheck]'); await R.waitForTimeout(2000);
console.log('7) pessoa recusada vê:', await what(R));
console.log('ERROS:', errs.length ? errs : 'nenhum'); await b.close();
