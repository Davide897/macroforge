# TESTE CONTRA O SUPABASE DE PRODUÇÃO: cria contas temporárias (aprovadas com a chave de serviço), corre o teste e
# apaga tudo no fim. Correr só à mão, com autorização do Davide. Nunca no CI.
# Configuração: variáveis de ambiente ou ~/.secrets/.env (SUPABASE_ACCESS_TOKEN, MACROFORGE_SUPABASE_REF).
import json, pathlib, urllib.request, urllib.error, secrets, subprocess, os, sys, atexit, shutil, time
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
keys = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true', headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'macroforge-audit/1.0'}), timeout=30))
secret = next(k['api_key'] for k in keys if k.get('type') == 'secret')
base = f'https://{ref}.supabase.co'
def admin(method, path, body=None):
    r = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers={'apikey': secret, 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp: t = resp.read(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code, None
def sql(q):
    r = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query', data=json.dumps({'query': q}).encode(), method='POST', headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'macroforge-audit/1.0', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=60))
mk = lambda: (f'teste-{secrets.token_hex(4)}@macroforge.test', ('Aa1' + secrets.token_hex(8)))
(ea, pa), (eb, pb) = mk(), mk()
ids = [admin('POST', '/auth/v1/admin/users', {'email': e, 'password': p, 'email_confirm': True})[1]['id'] for e, p in ((ea, pa), (eb, pb))]
[admin('PATCH', f'/rest/v1/profiles?user_id=eq.{i}', {'status': 'approved'}) for i in ids]  # APROVAR_TESTE
try:
    out = subprocess.run([NODE, str(HERE / 'audit_e2e.mjs')], env={**os.environ, 'A_EMAIL': ea, 'A_PW': pa, 'B_EMAIL': eb, 'B_PW': pb}, capture_output=True, text=True, encoding='utf8', timeout=900)
    print(out.stdout); print(out.stderr[-1500:])
    # ataques com sessão real (mesmas duas contas temporárias)
    out = subprocess.run([NODE, str(HERE / 'attack_e2e.mjs')], env={**os.environ, 'A_EMAIL': ea, 'A_PW': pa, 'B_EMAIL': eb, 'B_PW': pb}, capture_output=True, text=True, encoding='utf8', timeout=900)
    print('== ataques'); print(out.stdout); print(out.stderr[-1500:])
    # 3) imutável depois de 24 h: envelhecer um alimento de B e tentar mudá-lo/apagá-lo com a sessão de B
    sql(f"update public.shared_foods set created_at = now() - interval '25 hours' where created_by = '{ids[1]}'")
    # sessão de B via palavra-passe
    pub = next(k['api_key'] for k in keys if k.get('type') == 'publishable')
    r = urllib.request.Request(base + '/auth/v1/token?grant_type=password', data=json.dumps({'email': eb, 'password': pb}).encode(), method='POST', headers={'apikey': pub, 'Content-Type': 'application/json'})
    jwt = json.load(urllib.request.urlopen(r, timeout=30))['access_token']
    def asB(method, path, body=None):
        rq = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers={'apikey': pub, 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
        try:
            with urllib.request.urlopen(rq, timeout=30) as resp: return resp.status, json.loads(resp.read() or b'[]')
        except urllib.error.HTTPError as e: return e.code, e.read()[:150].decode()
    c, rows = asB('PATCH', '/rest/v1/shared_foods?name=like.Teste%20MF%20Arroz*', {'k': 1})
    c2, rows2 = asB('DELETE', '/rest/v1/shared_foods?name=like.Teste%20MF%20Arroz*')
    print('3) alimento com mais de 24 h: corrigido', len(rows) if isinstance(rows, list) else rows, '| apagado', len(rows2) if isinstance(rows2, list) else rows2)
finally:
    admin('DELETE', '/rest/v1/shared_foods?name=like.Teste%20MF*')
    for uid in ids:
        objs = admin('POST', '/storage/v1/object/list/photos', {'prefix': uid, 'limit': 1000})[1] or []
        if isinstance(objs, list) and objs: admin('DELETE', '/storage/v1/object/photos', {'prefixes': [f'{uid}/{o["name"]}' for o in objs]})
        admin('DELETE', f'/rest/v1/shared_foods?created_by=eq.{uid}'); admin('DELETE', f'/auth/v1/admin/users/{uid}')
    left = admin('GET', '/rest/v1/shared_foods?name=like.Teste%20MF*&select=id')[1]
    print('limpeza: alimentos de teste', len(left), '| contas de teste', sum(1 for u in admin('GET', '/auth/v1/admin/users?per_page=100')[1].get('users', []) if u['email'].endswith('@macroforge.test')))
# 6) serve.py
def raw(method, path, hdr):
    rq = urllib.request.Request('http://127.0.0.1:8766' + path, data=b'{"image":"data:image/png;base64,AA"}' if method == 'POST' else None, method=method, headers=hdr)
    try: return urllib.request.urlopen(rq, timeout=30).status
    except urllib.error.HTTPError as e: return e.code
print('6) serve.py: pedido de outro site ->', raw('POST', '/api/label', {'Origin': 'https://evil.example', 'Content-Type': 'application/json'}),
      '| text/plain ->', raw('POST', '/api/label', {'Content-Type': 'text/plain'}), '| /.git/config ->', raw('GET', '/.git/config', {}), '| /index.html ->', raw('GET', '/index.html', {}))
