// Dois aparelhos com a app real (Chrome headless) e um Supabase falso em memória.
// Verifica que alterações feitas offline num aparelho não apagam as do outro.
// Uso: node tests/e2e/sync_two_devices.mjs [pasta da app]   (por defeito, a raiz do repositório)
import { db, offline, device, syncNow, tab, addWeight, check, synced, sleep, stateOf, cloud, weights, finish } from './harness.mjs';

const A = await device('A');
await addWeight(A, '2026-10-01', 80); await sleep(2200); await synced(A);
const B = await device('B');
check('B recebe o que A já tinha', weights(await stateOf(B)) === '2026-10-01', weights(await stateOf(B)));

// 1) pesos diferentes com B offline
offline.add('B');
await addWeight(B, '2026-10-03', 79.1); await sleep(2200);
await addWeight(A, '2026-10-02', 79.5); await sleep(2200); await synced(A);
offline.delete('B'); await syncNow(B); await syncNow(A);
const exp1 = '2026-10-01,2026-10-02,2026-10-03';
check('pesos de A e B (B offline) ficam todos: nuvem', weights(cloud()) === exp1, weights(cloud()));
check('... aparelho A', weights(await stateOf(A)) === exp1, weights(await stateOf(A)));
check('... aparelho B', weights(await stateOf(B)) === exp1, weights(await stateOf(B)));

// 2) perfil: objetivo em A, idade em B offline
offline.add('B');
await tab(B, 'goals'); await B.fill('input[data-bind=age]', '35'); await sleep(2200);
await tab(A, 'goals'); await A.click('[data-act=goal][data-v=bulk]'); await sleep(2200); await synced(A);
offline.delete('B'); await syncNow(B); await syncNow(A);
const pa = (await stateOf(A)).profile, pb = (await stateOf(B)).profile;
check('perfil: objetivo de A e idade de B ficam os dois', pa.goal === 'bulk' && pa.age === 35 && pb.goal === 'bulk' && pb.age === 35, `A ${pa.goal}/${pa.age} B ${pb.goal}/${pb.age}`);

// 3) apagar em A enquanto B (offline) muda outra coisa: o apagado não volta
offline.add('B');
await addWeight(B, '2026-10-04', 78.8); await sleep(2200);
await tab(A, 'progress'); await A.click('[data-act=delWeight][data-v="2026-10-01"]'); await sleep(2200); await synced(A);
offline.delete('B'); await syncNow(B); await syncNow(A);
const exp3 = '2026-10-02,2026-10-03,2026-10-04';
check('apagado em A não ressuscita, novo de B fica: nuvem', weights(cloud()) === exp3, weights(cloud()));
check('... A e B iguais', weights(await stateOf(A)) === exp3 && weights(await stateOf(B)) === exp3, `${weights(await stateOf(A))} / ${weights(await stateOf(B))}`);

await finish();
