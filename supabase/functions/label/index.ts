// Função na nuvem: lê a foto de uma tabela nutricional (OpenRouter, modelos de visão grátis)
// e devolve o alimento normalizado por 100 g. Mesma lógica do serve.py (versão local).
// Só aceita pedidos com sessão iniciada (verify_jwt). A chave vive nos segredos do Supabase.

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = ['nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'];
const RETRY_CODES = new Set([429, 502, 503]);
const RETRY_WAITS = [3000, 8000];
const CATS = new Set(['prot', 'protfat', 'dairy', 'carb', 'fat', 'veg', 'fruit']);
const MAX_IMAGE = 6 * 1024 * 1024;

const PROMPT = `Read the nutrition facts table in this photo of a food package. Return ONLY one JSON object, no prose, no markdown.
CRITICAL: report only numbers you can actually read printed in this photo. Never use your own knowledge of the product.
If a value is not legible, use null. If there is no nutrition table in the photo, set "table_visible": false and all numbers null.
Keys:
"table_visible": true/false,
"name": product name as printed, short, original language (null if not visible),
"brand": brand or null,
"liquid": true if values are per 100 ml,
"per100": {"kcal","protein","carbs","sugars","fat","satfat","fiber","salt"} for the per 100 g / 100 ml column (numbers or null),
"serving": {"grams","kcal","protein","carbs","fat","fiber"} if a per-serving/portion column or serving size is printed, else null,
"category": one of "prot" (lean protein), "protfat" (protein with a lot of fat), "dairy", "carb", "fat", "veg", "fruit",
"meals": letters for where it fits: B breakfast, M lunch/dinner, S snack (e.g. "BS"),
"unit": {"grams","name_pt","name_en"} if sold in natural units (bar, slice, can, pot, egg), else null,
"tbsp_grams": grams in one level tablespoon if it is a spread, oil, powder or grain, else null,
"confidence": 0 to 1.
Rules: read each row across to its own value (crumpled or tilted labels: follow the line carefully, do not shift rows); dot decimals; energy in kcal, never kJ; Portuguese/Spanish terms: Proteínas=protein, Hidratos de carbono/Glúcidos=carbs, dos quais açúcares=sugars, Lípidos/Gordura/Grasas=fat, saturados=satfat, Fibra=fiber, Sal=salt.`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const num = (x: unknown): number | null => {
  if (x === null || x === undefined) return null;
  const v = parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
};
const extractJson = (text: unknown) => {
  if (typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
};
const guessCat = (p: number, c: number, f: number, k: number) => {
  if (!k) return 'carb';
  const pp = p * 4 / k, ff = f * 9 / k;
  if (pp >= 0.5) return ff < 0.35 ? 'prot' : 'protfat';
  if (ff >= 0.5) return 'fat';
  return 'carb';
};
const r1 = (x: number) => Math.round(x * 10) / 10;

// deno-lint-ignore no-explicit-any
function normalize(raw: any) {
  const flags: string[] = [];
  const per = raw.per100 || {};
  const vals: Record<string, number | null> = {};
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) vals[k] = num(per[k]);
  const srv = raw.serving || {};
  const sg = num(srv.grams);
  if (['protein', 'carbs', 'fat'].some(k => vals[k] === null) && sg) {
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) {
      const sv = num(srv[k]);
      if (vals[k] === null && sv !== null) vals[k] = sv * 100 / sg;
    }
    flags.push('fromServing');
  }
  const missing = (['protein', 'carbs', 'fat'] as const).filter(k => vals[k] === null);
  if (missing.length) flags.push('missing');
  const p = vals.protein ?? 0, c = vals.carbs ?? 0, f = vals.fat ?? 0;
  const calc = p * 4 + c * 4 + f * 9;
  let k = vals.kcal;
  if (k === null) { k = calc; flags.push('kcalComputed'); }
  else if (!missing.length && k > 0 && Math.abs(calc - k) / k > 0.2) flags.push('kcalMismatch');
  if (p + c + f > 101) flags.push('over100');
  const sug = num(per.sugars), sat = num(per.satfat);
  if ((sug !== null && sug > c + 0.5) || (sat !== null && sat > f + 0.5) || (sug !== null && sug > 5 && Math.abs(sug - p) < 0.05)) flags.push('rowShift');
  let cat = CATS.has(raw.category) ? raw.category : guessCat(p, c, f, k);
  if ((cat === 'prot' || cat === 'protfat') && k && p * 4 / k < 0.3) cat = guessCat(p, c, f, k);
  const meals = ['B', 'M', 'S'].filter(ch => String(raw.meals || '').toUpperCase().includes(ch)).join('') || 'BMS';
  let name = String(raw.name || '').trim();
  const brand = String(raw.brand || '').trim();
  if (!name) { flags.push('noName'); name = brand; }
  else if (brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${name} (${brand})`;
  const conf = num(raw.confidence);
  if (conf !== null && conf < 0.6) flags.push('lowConfidence');
  // deno-lint-ignore no-explicit-any
  const food: any = { name: name.slice(0, 60), cat, m: meals, k: Math.round(k), p: r1(p), c: r1(c), f: r1(f), fb: r1(vals.fiber ?? 0), liquid: !!raw.liquid, missing };
  const u = raw.unit || {};
  if (num(u.grams)) food.unit = { g: r1(num(u.grams)!), pt: String(u.name_pt || 'unidade').slice(0, 20), en: String(u.name_en || 'unit').slice(0, 20) };
  else if (sg && sg >= 5 && sg <= 500) food.serving = r1(sg);
  const tb = num(raw.tbsp_grams);
  if (tb && tb >= 2 && tb <= 40) food.meas = [['csopa', r1(tb)], ['ccha', r1(tb / 3)]];
  return { food, flags };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function readLabel(dataUrl: string, key: string) {
  const tried: string[] = [];
  // deno-lint-ignore no-explicit-any
  let partial: any = null;
  for (const model of MODELS) {
    const body = {
      model, max_tokens: 3000, temperature: 0, reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'You read nutrition labels from photos and answer with JSON only.' },
        { role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] },
      ],
    };
    // deno-lint-ignore no-explicit-any
    let resp: any = null, err = '';
    for (const wait of [0, ...RETRY_WAITS]) {
      if (wait) await sleep(wait);
      try {
        const r = await fetch(OPENROUTER, {
          method: 'POST', body: JSON.stringify(body),
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://davide897.github.io/macroforge/', 'X-Title': 'MacroForge' },
        });
        if (!r.ok) { err = `HTTP ${r.status}`; await r.body?.cancel(); if (RETRY_CODES.has(r.status)) continue; break; }
        resp = await r.json();
        if (resp.error && !resp.choices) { // erro do fornecedor dentro de um "200 OK"
          const code = resp.error?.code; err = `erro ${code}`; resp = null;
          if (RETRY_CODES.has(code)) continue;
        }
        break;
      } catch (e) { err = (e as Error).name; break; }
    }
    if (!resp) { tried.push(`${model}: ${err}`); continue; }
    const raw = extractJson(resp.choices?.[0]?.message?.content);
    if (!raw) { tried.push(`${model}: resposta sem JSON`); continue; }
    if (raw.table_visible === false) return { ok: false, error: 'noTable', model, tried };
    const { food, flags } = normalize(raw);
    if (flags.includes('missing')) {
      tried.push(`${model}: faltam ${food.missing.join(', ')}`);
      if (!partial) partial = { ok: true, food, flags, model };
      continue;
    }
    return { ok: true, food, flags, model, tried };
  }
  return partial ? { ...partial, tried } : { ok: false, error: 'allFailed', tried };
}

// Confirma a sessão junto do Supabase Auth. Não confiar só no verify_jwt do gateway:
// medido a 2026-10-26, com as chaves novas (publishable) a função corria sem sessão nenhuma.
async function signedInUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!r.ok) { await r.body?.cancel(); return null; }
  const u = await r.json();
  return u && u.id ? u.id : null;
}

async function approved(uid: string) {
  const url = Deno.env.get('SUPABASE_URL'), svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/profiles?user_id=eq.${uid}&select=status`, { headers: { apikey: svc!, Authorization: `Bearer ${svc}` } });
  if (!r.ok) { await r.body?.cancel(); return false; }
  const rows = await r.json();
  return rows.length > 0 && rows[0].status === 'approved';
}
const PER_USER_DAY = Number(Deno.env.get('LABEL_PER_USER_DAY') || 8);
const GLOBAL_DAY = Number(Deno.env.get('LABEL_GLOBAL_DAY') || 20);
async function quota(uid: string): Promise<{ ok: boolean; reason?: string }> {
  const url = Deno.env.get('SUPABASE_URL'), svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !svc) return { ok: false, reason: 'quota' };
  const r = await fetch(`${url}/rest/v1/rpc/try_label`, {
    method: 'POST', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user: uid, p_user_limit: PER_USER_DAY, p_global_limit: GLOBAL_DAY }),
  });
  if (!r.ok) { await r.body?.cancel(); return { ok: false, reason: 'quota' }; }
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'notFound' }, 404);
  const uid = await signedInUser(req);
  if (!uid) return json({ ok: false, error: 'needLogin' }, 401);
  if (!(await approved(uid))) return json({ ok: false, error: 'notApproved' }, 403);
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) return json({ ok: false, error: 'noKey' });
  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'badRequest' }, 400); }
  const img = String(body?.image || '');
  if (!img.startsWith('data:image/')) return json({ ok: false, error: 'badRequest' }, 400);
  if (img.length > MAX_IMAGE) return json({ ok: false, error: 'tooBig' }, 413);
  // Quota partilhada do OpenRouter grátis (50 pedidos/dia na conta): limite por pessoa e no total.
  const q = await quota(uid);
  if (!q.ok) return json({ ok: false, error: q.reason || 'quota' });
  return json(await readLabel(img, key));
});
