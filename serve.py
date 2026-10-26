# Servidor local do MacroForge.
# - Serve os ficheiros da app sem cache (as atualizações aparecem logo).
# - POST /api/label: lê a foto de uma tabela nutricional com um modelo de visão (OpenRouter)
#   e devolve o alimento já normalizado por 100 g. A chave nunca chega ao browser.
#
# Chave: variável de ambiente OPENROUTER_API_KEY, senão C:\Users\<user>\.secrets\.env.
import base64, http.server, json, os, pathlib, re, sys, time, urllib.error, urllib.parse, urllib.request

APP_DIR = os.path.dirname(os.path.abspath(__file__))
OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
# Só modelos de visão grátis (a conta não tem créditos). Lista fixa, por ordem; o router
# genérico "openrouter/free" fica de fora porque às vezes escolhe modelos de filtro de segurança.
# Medido a 2026-10-25: o Nemotron VL lê bem com o raciocínio desligado (com ele ligado gasta
# >2000 tokens a pensar e devolve a resposta cortada); as Gemma davam 429 (fornecedor ocupado).
MODELS = ['nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free',
          'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free']
RETRY_CODES = {429, 502, 503}  # erros temporários dos fornecedores grátis: esperar e repetir
RETRY_WAITS = [3, 8]
CATS = {'prot', 'protfat', 'dairy', 'carb', 'fat', 'veg', 'fruit'}
MAX_BODY = 8 * 1024 * 1024

PROMPT = """Read the nutrition facts table in this photo of a food package. Return ONLY one JSON object, no prose, no markdown.
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
Rules: read each row across to its own value (crumpled or tilted labels: follow the line carefully, do not shift rows); dot decimals; energy in kcal, never kJ; Portuguese/Spanish terms: Proteínas=protein, Hidratos de carbono/Glúcidos=carbs, dos quais açúcares=sugars, Lípidos/Gordura/Grasas=fat, saturados=satfat, Fibra=fiber, Sal=salt."""


def load_key():
    k = os.environ.get('OPENROUTER_API_KEY', '').strip()
    if k:
        return k
    f = pathlib.Path.home() / '.secrets' / '.env'
    if f.exists():
        for line in f.read_text(encoding='utf-8', errors='ignore').splitlines():
            if line.strip().startswith('OPENROUTER_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''


def num(x):
    try:
        v = float(str(x).replace(',', '.'))
        return v if v >= 0 else None
    except (TypeError, ValueError):
        return None


def extract_json(text):
    if not text:
        return None
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def guess_cat(p, c, f, k):
    if not k:
        return 'carb'
    pp, cc, ff = p * 4 / k, c * 4 / k, f * 9 / k
    if pp >= 0.5:
        return 'prot' if ff < 0.35 else 'protfat'
    if ff >= 0.5:
        return 'fat'
    return 'carb'


def normalize(raw):
    """Converte a resposta do modelo num alimento da app (valores por 100 g) + avisos."""
    flags = []
    per = raw.get('per100') or {}
    vals = {k: num(per.get(k)) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')}
    srv = raw.get('serving') or {}
    sg = num(srv.get('grams'))
    # só há coluna por porção: converter para 100 g
    if any(vals[k] is None for k in ('protein', 'carbs', 'fat')) and sg:
        for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber'):
            if vals[k] is None and num(srv.get(k)) is not None:
                vals[k] = num(srv.get(k)) * 100 / sg
        flags.append('fromServing')
    p, c, f = vals['protein'], vals['carbs'], vals['fat']
    missing = [n for n, v in (('protein', p), ('carbs', c), ('fat', f)) if v is None]
    if missing:
        flags.append('missing')
        p, c, f = p or 0, c or 0, f or 0
    calc = p * 4 + c * 4 + f * 9
    k = vals['kcal']
    if k is None:
        k = calc
        flags.append('kcalComputed')
    elif not missing and k > 0 and abs(calc - k) / k > 0.2:
        flags.append('kcalMismatch')
    if p + c + f > 101:
        flags.append('over100')
    # linhas trocadas (rótulos tortos): açúcares > hidratos, saturados > gordura, proteína = açúcares
    sug, sat = num(per.get('sugars')), num(per.get('satfat'))
    if (sug is not None and sug > c + 0.5) or (sat is not None and sat > f + 0.5) or             (sug is not None and sug > 5 and abs(sug - p) < 0.05):
        flags.append('rowShift')
    cat = raw.get('category') if raw.get('category') in CATS else guess_cat(p, c, f, k)
    # o modelo às vezes chama "proteína" a doces com gordura: confirmar pelos macros
    if cat in ('prot', 'protfat') and k and p * 4 / k < 0.3:
        cat = guess_cat(p, c, f, k)
    meals = ''.join(ch for ch in 'BMS' if ch in str(raw.get('meals') or '').upper()) or 'BMS'
    name = (raw.get('name') or '').strip()
    brand = (raw.get('brand') or '').strip()
    if not name:
        flags.append('noName')
        name = brand  # vazio obriga a escrever o nome na revisão
    elif brand and brand.lower() not in name.lower():
        name = f'{name} ({brand})'
    conf = num(raw.get('confidence'))
    if conf is not None and conf < 0.6:
        flags.append('lowConfidence')
    food = {'name': name[:60], 'cat': cat, 'm': meals, 'k': round(k), 'p': round(p, 1), 'c': round(c, 1),
            'f': round(f, 1), 'fb': round(vals['fiber'] or 0, 1), 'liquid': bool(raw.get('liquid')), 'missing': missing}
    u = raw.get('unit') or {}
    if num(u.get('grams')):
        food['unit'] = {'g': round(num(u['grams']), 1), 'pt': (u.get('name_pt') or 'unidade')[:20], 'en': (u.get('name_en') or 'unit')[:20]}
    elif sg and 5 <= sg <= 500:
        food['serving'] = round(sg, 1)
    tb = num(raw.get('tbsp_grams'))
    if tb and 2 <= tb <= 40:
        food['meas'] = [['csopa', round(tb, 1)], ['ccha', round(tb / 3, 1)]]
    return food, flags


def read_label(data_url, key):
    """Tenta cada modelo por ordem até ter uma resposta válida."""
    tried, partial = [], None
    for model in MODELS:
        body = {
            'model': model, 'max_tokens': 3000, 'temperature': 0,
            'reasoning': {'enabled': False},
            'messages': [
                {'role': 'system', 'content': 'You read nutrition labels from photos and answer with JSON only.'},
                {'role': 'user', 'content': [{'type': 'text', 'text': PROMPT}, {'type': 'image_url', 'image_url': {'url': data_url}}]},
            ],
        }
        req = urllib.request.Request(OPENROUTER, data=json.dumps(body).encode(), method='POST', headers={
            'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost/macroforge', 'X-Title': 'MacroForge'})
        resp, err = None, None
        for wait in [0] + RETRY_WAITS:
            if wait:
                time.sleep(wait)
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    resp = json.load(r)
                if resp.get('error') and not resp.get('choices'):  # erro do fornecedor dentro de um "200 OK"
                    code = (resp['error'] or {}).get('code')
                    err, resp = f'erro {code}', None
                    if code in RETRY_CODES:
                        continue
                break
            except urllib.error.HTTPError as e:
                err = f'HTTP {e.code}'
                if e.code not in RETRY_CODES:
                    break
            except Exception as e:  # rede, timeout
                err = type(e).__name__
                break
        if resp is None:
            tried.append(f'{model}: {err}')
            continue
        text = ((resp.get('choices') or [{}])[0].get('message') or {}).get('content')
        raw = extract_json(text if isinstance(text, str) else json.dumps(text))
        if not raw:
            tried.append(f'{model}: resposta sem JSON')
            continue
        if raw.get('table_visible') is False:
            return {'ok': False, 'error': 'noTable', 'model': model, 'tried': tried}
        food, flags = normalize(raw)
        if 'missing' in flags:  # leitura parcial: guardar como reserva e tentar o modelo seguinte
            tried.append(f'{model}: faltam {", ".join(food["missing"])}')
            if not partial:
                partial = {'ok': True, 'food': food, 'flags': flags, 'model': model}
            continue
        return {'ok': True, 'food': food, 'flags': flags, 'model': model, 'tried': tried}
    if partial:
        return {**partial, 'tried': tried}
    return {'ok': False, 'error': 'allFailed', 'tried': tried}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _hosts(self):
        # Lista fixa (nunca construída a partir do Host do pedido, por causa de DNS rebinding).
        port = self.server.server_port
        return {f'localhost:{port}', f'127.0.0.1:{port}'}

    def _allowed_origin(self):
        # Um site qualquer não pode usar este servidor (e a tua chave) por trás das costas.
        if self.headers.get('Host', '') not in self._hosts():
            return False
        origin = self.headers.get('Origin')
        return origin is None or origin in {f'http://{h}' for h in self._hosts()}

    def translate_path(self, path):
        # Verificar o ficheiro REAL que vai ser aberto (já descodificado e resolvido): nada fora da pasta
        # da app e nada escondido (.git, .gitignore...). Cobre GET e HEAD e qualquer codificação (%2e).
        full = super().translate_path(path)
        root = pathlib.Path(APP_DIR).resolve()
        try:
            rel = pathlib.Path(full).resolve().relative_to(root)
        except ValueError:
            return str(root / '__bloqueado__')
        if any(part.startswith('.') for part in rel.parts):
            return str(root / '__bloqueado__')
        return full

    def do_HEAD(self):
        if self.headers.get('Host', '') not in self._hosts():
            return self.send_json(403, {'ok': False, 'error': 'forbidden'})
        return super().do_HEAD()

    def do_GET(self):
        if self.headers.get('Host', '') not in self._hosts():
            return self.send_json(403, {'ok': False, 'error': 'forbidden'})  # DNS rebinding
        if self.path == '/api/status':
            return self.send_json(200, {'label': bool(load_key())})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/label':
            return self.send_json(404, {'ok': False, 'error': 'notFound'})
        if not self._allowed_origin() or not self.headers.get('Content-Type', '').startswith('application/json'):
            return self.send_json(403, {'ok': False, 'error': 'forbidden'})
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_BODY:
            return self.send_json(413, {'ok': False, 'error': 'tooBig'})
        try:
            img = json.loads(self.rfile.read(n)).get('image', '')
        except json.JSONDecodeError:
            return self.send_json(400, {'ok': False, 'error': 'badRequest'})
        if not img.startswith('data:image/'):
            return self.send_json(400, {'ok': False, 'error': 'badRequest'})
        key = load_key()
        if not key:
            return self.send_json(200, {'ok': False, 'error': 'noKey'})
        self.send_json(200, read_label(img, key))

    def log_message(self, fmt, *args):  # sem ruído na janela, exceto erros
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--test':  # python serve.py --test foto.jpg
        b64 = base64.b64encode(open(sys.argv[2], 'rb').read()).decode()
        print(json.dumps(read_label('data:image/jpeg;base64,' + b64, load_key()), ensure_ascii=False, indent=1))
        sys.exit()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'MacroForge em http://localhost:{port}/  (fecha esta janela para parar)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
