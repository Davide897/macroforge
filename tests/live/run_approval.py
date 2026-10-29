# TESTE CONTRA O SUPABASE DE PRODUÇÃO: cria contas temporárias (aprovadas com a chave de serviço), corre o teste e
# apaga tudo no fim. Correr só à mão, com autorização do Davide. Nunca no CI.
# Configuração: variáveis de ambiente ou ~/.secrets/.env (SUPABASE_ACCESS_TOKEN, MACROFORGE_SUPABASE_REF, MACROFORGE_APPROVAL_SECRET, MF_TEST_EMAIL com {tag}, ex.: nome+mfteste{tag}@exemplo.pt).
import json, pathlib, urllib.request, urllib.error, secrets, subprocess, os, sys, hmac, hashlib, base64, time, atexit, shutil
sys.stdout.reconfigure(encoding='utf-8')
_f = pathlib.Path.home() / '.secrets' / '.env'
E = {k.strip(): v.strip().strip('"') for k, v in (l.split('=', 1) for l in (_f.read_text(encoding='utf8').splitlines() if _f.exists() else []) if '=' in l and not l.startswith('#'))}
E.update({k: os.environ[k] for k in ('SUPABASE_ACCESS_TOKEN', 'MACROFORGE_SUPABASE_REF', 'MACROFORGE_APPROVAL_SECRET', 'MF_TEST_EMAIL') if os.environ.get(k)})
HERE = pathlib.Path(__file__).resolve().parent
NODE = shutil.which('node') or 'node'
# a app servida pelo serve.py do repositório na porta 8766, durante o teste
SERVER = subprocess.Popen([sys.executable, str(HERE.parent.parent / 'serve.py'), '8766'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(SERVER.terminate)
time.sleep(1.5)
tok, ref = E['SUPABASE_ACCESS_TOKEN'], E['MACROFORGE_SUPABASE_REF']
keys = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true', headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'macroforge-test/1.0'}), timeout=30))
secret = next(k['api_key'] for k in keys if k.get('type') == 'secret'); base = f'https://{ref}.supabase.co'
def admin(method, path, body=None):
    r = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers={'apikey': secret, 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp: t = resp.read(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code, e.read()[:200].decode()
def link(uid, action):
    exp = int(time.time()) + 3600
    sig = base64.urlsafe_b64encode(hmac.new(E['MACROFORGE_APPROVAL_SECRET'].encode(), f'{uid}|{action}|{exp}'.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    return f'http://localhost:8766/approve.html?u={uid}&a={action}&e={exp}&s={sig}'
tag = secrets.token_hex(3)
if '{tag}' not in E.get('MF_TEST_EMAIL', ''): sys.exit('Falta MF_TEST_EMAIL com {tag} (caixa real: a app envia o email de conta aprovada).')
users = {'P': (E['MF_TEST_EMAIL'].format(tag=tag + 'a'), 'Teste' + secrets.token_hex(6) + 'A1'), 'R': (E['MF_TEST_EMAIL'].format(tag=tag + 'b'), 'Teste' + secrets.token_hex(6) + 'B2')}
ids = {}
for k, (e, p) in users.items():
    c, u = admin('POST', '/auth/v1/admin/users', {'email': e, 'password': p, 'email_confirm': True})
    ids[k] = u['id']
print('perfis novos nascem pendentes:', [admin('GET', f"/rest/v1/profiles?user_id=eq.{i}&select=status")[1][0]['status'] for i in ids.values()])
try:
    env = {**os.environ, 'P_EMAIL': users['P'][0], 'P_PW': users['P'][1], 'R_EMAIL': users['R'][0], 'R_PW': users['R'][1],
           'LINK_OK': link(ids['P'], 'approve'), 'LINK_REJ': link(ids['R'], 'reject')}
    out = subprocess.run([NODE, str(HERE / 'approval_e2e.mjs')], env=env, capture_output=True, text=True, encoding='utf8', timeout=900)
    print(out.stdout); print(out.stderr[-1500:])
    print('email ao administrador enviado (notified_at preenchido):', [bool(admin('GET', f"/rest/v1/profiles?user_id=eq.{i}&select=notified_at")[1][0]['notified_at']) for i in ids.values()])
finally:
    for i in ids.values():
        objs = admin('POST', '/storage/v1/object/list/photos', {'prefix': i, 'limit': 100})[1] or []
        if isinstance(objs, list) and objs: admin('DELETE', '/storage/v1/object/photos', {'prefixes': [f'{i}/{o["name"]}' for o in objs]})
        admin('DELETE', f'/auth/v1/admin/users/{i}')
    admin('DELETE', '/rest/v1/shared_foods?name=like.Teste%20MF*')
    print('limpeza: contas de teste restantes', sum(1 for u in admin('GET', '/auth/v1/admin/users?per_page=100')[1].get('users', []) if 'mfteste' in u['email'] or u['email'].endswith('@macroforge.test')))
