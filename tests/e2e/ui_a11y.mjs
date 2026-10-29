// Caixas de confirmação próprias (sem confirm/prompt do browser) e acessibilidade básica, com a app real.
// Uso: node tests/e2e/ui_a11y.mjs [pasta da app]
import { db, device, login, tab, check, sleep, stateOf, cloud, weights, addWeight, finish, synced } from './harness.mjs';

const dlg = 'dialog.mf-dialog[open]';
const isOpen = async p => !!(await p.$(dlg));
const focusedText = p => p.evaluate(() => (document.activeElement && (document.activeElement.textContent || '').trim()) || '');

// 1) Dados locais sem dono ao entrar: a pergunta não se fecha com Escape (cancelar apagaria os dados)
const A = await device('A', { session: 'none', seed: { weights: [{ date: '2026-10-10', kg: 81 }], profile: { goal: 'cut', weight: 81 } } });
await A.waitForSelector('.gate #authForm');
await A.fill('#authForm [name=email]', 'teste@example.com'); await A.fill('#authForm [name=password]', 'Teste12345A');
await A.click('#authForm button[value=in]');
await A.waitForSelector(dlg, { timeout: 10000 });
check('dados sem dono: aparece a caixa própria', await isOpen(A), await A.textContent(`${dlg} .mf-dialog-msg`));
check('... com botões com nome claro', /Juntar à minha conta/.test(await A.textContent(dlg)) && /Apagar deste aparelho/.test(await A.textContent(dlg)));
await A.keyboard.press('Escape'); await sleep(200);
check('... Escape não a fecha', await isOpen(A));
await A.click(`${dlg} button[value=ok]`);
await A.waitForSelector('nav.tabs'); await synced(A); await sleep(2000); await synced(A);
check('... "Juntar" mantém os dados e manda-os para a nuvem', weights(await stateOf(A)) === '2026-10-10' && weights(cloud()) === '2026-10-10', weights(cloud()));

// 2) Apagar alimento próprio: Cancelar por defeito, Escape cancela, OK apaga, o foco volta ao botão
await tab(A, 'foods'); await A.click('details summary');
await A.fill('#customForm [name=name]', 'Bolo de teste'); await A.fill('#customForm [name=p]', '5'); await A.fill('#customForm [name=c]', '50'); await A.fill('#customForm [name=f]', '10');
await A.click('#customForm button[type=submit]'); await sleep(600);
await A.fill('.search', 'Bolo de teste'); await sleep(300);
const del = '[data-act=delCustom], [data-act=delShared]';   // com sessão, o alimento novo vai para a comunidade
const bolos = async () => { const st = await stateOf(A); return [...st.customFoods, ...(st.sharedFoods || [])].filter(f => f.pt === 'Bolo de teste').length; };
check('botão de apagar tem nome acessível', (await A.getAttribute(del, 'aria-label')) === 'Apagar: Bolo de teste', await A.getAttribute(del, 'aria-label'));
await A.focus(del); await A.keyboard.press('Enter'); await A.waitForSelector(dlg);
check('apagar: foco começa em Cancelar', (await focusedText(A)) === 'Cancelar', await focusedText(A));
await A.keyboard.press('Escape'); await sleep(200);
check('apagar: Escape cancela e o alimento fica', !(await isOpen(A)) && (await bolos()) === 1);
check('apagar: o foco volta ao botão de apagar', await A.evaluate(() => document.activeElement && ['delCustom', 'delShared'].includes(document.activeElement.dataset.act)));
await A.click(del); await A.waitForSelector(dlg); await A.click(`${dlg} button[value=ok]`); await sleep(300);
check('apagar: OK apaga', (await bolos()) === 0 && !(await isOpen(A)));

// 3) Sair: Cancelar mantém a sessão
await tab(A, 'progress'); await A.click('[data-act=signOut]'); await A.waitForSelector(dlg);
await A.click(`${dlg} button[value=cancel]`); await sleep(300);
check('sair: Cancelar mantém a sessão', !!(await A.$('nav.tabs')) && !(await isOpen(A)));

// 4) Apagar conta: o botão só fica ativo com a palavra certa
await A.click('details.danger summary'); await A.click('[data-act=deleteAccount]'); await A.waitForSelector(dlg);
const okDisabled = () => A.$eval(`${dlg} button[value=ok]`, b => b.disabled);
check('apagar conta: começa desativado e com o campo focado', (await okDisabled()) && await A.evaluate(() => document.activeElement && document.activeElement.name === 'v'));
await A.fill(`${dlg} input`, 'apagar'); check('... palavra errada continua desativado', await okDisabled());
await A.fill(`${dlg} input`, 'APAGAR'); check('... palavra certa ativa o botão', !(await okDisabled()));
await A.keyboard.press('Escape'); await sleep(300);
check('... Escape cancela (conta intacta)', !(await isOpen(A)) && !!(await A.$('nav.tabs')));

// 5) Acessibilidade em todos os separadores
await addWeight(A, '2026-10-12', 80.4); await sleep(300);
await tab(A, 'foods'); await A.click('[data-act=basics]'); await tab(A, 'plan'); await A.click('[data-act=generate]');
const audit = p => p.evaluate(() => {
  const name = el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
  const unnamed = [...document.querySelectorAll('button, [role=button], a[href]')].filter(el => !name(el)).map(el => el.outerHTML.slice(0, 80));
  const noAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).map(i => i.outerHTML.slice(0, 80));
  const labelled = el => el.getAttribute('aria-label') || el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
  const unlabelled = [...document.querySelectorAll('input:not([type=hidden]), select')].filter(el => !labelled(el)).map(el => el.outerHTML.slice(0, 80));
  const svgs = [...document.querySelectorAll('button svg, .tab svg')].filter(s => s.getAttribute('aria-hidden') !== 'true').length;
  return { unnamed, noAlt, unlabelled, svgs };
});
for (const tb of ['goals', 'foods', 'plan', 'diary', 'shop', 'progress']) {
  await tab(A, tb); await sleep(300);
  const r = await audit(A);
  check(`a11y ${tb}: botões com nome, imagens com alt, campos com etiqueta, ícones escondidos`,
    !r.unnamed.length && !r.noAlt.length && !r.unlabelled.length && !r.svgs, JSON.stringify(r).slice(0, 300));
}
await tab(A, 'progress');
check('gráfico de peso com descrição', /Gráfico do peso de 2026-10-10 a 2026-10-12/.test((await A.getAttribute('svg.wchart', 'aria-label')) || ''), await A.getAttribute('svg.wchart', 'aria-label'));
check('separador atual marcado (aria-current)', (await A.getAttribute('.tab.on', 'aria-current')) === 'page');
check('mensagens (toast) anunciadas a leitores de ecrã', (await A.getAttribute('#toast', 'aria-live')) === 'polite');
const fileOk = await A.evaluate(() => { const el = document.querySelector('[data-act=import]'); el.focus(); return document.activeElement === el; });
check('escolher ficheiro chega-se com o teclado', fileOk);

// 6) Foco visível com o teclado
await A.focus('[data-act=syncNow]'); await A.keyboard.press('Shift+Tab'); await A.keyboard.press('Tab');
const ring = await A.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { tag: document.activeElement.tagName, outline: cs.outlineStyle, w: cs.outlineWidth }; });
check('foco visível nos botões (teclado)', ring.tag === 'BUTTON' && ring.outline !== 'none' && parseFloat(ring.w) >= 2, JSON.stringify(ring));

await finish();
