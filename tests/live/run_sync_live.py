# TESTE CONTRA O SUPABASE DE PRODUÇÃO: cria uma conta temporária (@macroforge.test, aprovada com a chave de serviço,
# sem emails), corre sync_diary_live.mjs, que apaga a conta pela função delete-account, e confirma que não ficou nada.
# Correr só à mão, com autorização do Davide. Nunca no CI.
# Configuração: variáveis de ambiente ou ~/.secrets/.env (SUPABASE_ACCESS_TOKEN, MACROFORGE_SUPABASE_REF).
import atexit, json, os, pathlib, secrets, shutil, subprocess, sys, time, urllib.error, urllib.request
sys.stdout.reconfigure(encoding='utf-8')
_f = pathlib.Path.home() / '.secrets' / '.env'
E = {k.strip(): v.strip().strip('"') for k, v in (l.split('=', 1) for l in (_f.read_text(encoding='utf8').splitlines() if _f.exists() else []) if '=' in l and not l.startswith('#'))}
E.update({k: os.environ[k] for k in ('SUPABASE_ACCESS_TOKEN', 'MACROFORGE_SUPABASE_REF') if os.environ.get(k)})
HERE = pathlib.Path(__file__).resolve().parent
NODE = shutil.which('node') or 'node'
SERVER = subprocess.Popen([sys.executable, str(HERE.parent.parent / 'serve.py'), '8766'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(SERVER.terminate)
time.sleep(1.5)
tok, ref = E['SUPABASE_ACCESS_TOKEN'], E['MACROFORGE_SUPABASE_REF']
keys = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true', headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'macroforge-test/1.0'}), timeout=30))
secret = next(k['api_key'] for k in keys if k.get('type') == 'secret')
base = f'https://{ref}.supabase.co'


def admin(method, path, body=None):
    r = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                               headers={'apikey': secret, 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            t = resp.read(); return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, None


email, pw = f'teste-{secrets.token_hex(4)}@macroforge.test', 'Aa1' + secrets.token_hex(8)
code, u = admin('POST', '/auth/v1/admin/users', {'email': email, 'password': pw, 'email_confirm': True})
uid = u['id']
print('conta de teste criada:', email, '| perfil nasce:', admin('GET', f'/rest/v1/profiles?user_id=eq.{uid}&select=status')[1][0]['status'])
admin('PATCH', f'/rest/v1/profiles?user_id=eq.{uid}', {'status': 'approved'})  # APROVAR_TESTE: sem email ao administrador
try:
    out = subprocess.run([NODE, str(HERE / 'sync_diary_live.mjs')], env={**os.environ, 'TEST_EMAIL': email, 'TEST_PW': pw},
                         capture_output=True, text=True, encoding='utf8', timeout=900)
    print(out.stdout); print(out.stderr[-1500:])
finally:
    # Confirmar que não ficou nada; se a função delete-account tiver falhado, apagar pela chave de serviço
    left_user = admin('GET', f'/auth/v1/admin/users/{uid}')[0] == 200
    left_state = admin('GET', f'/rest/v1/app_state?user_id=eq.{uid}&select=user_id')[1] or []
    left_photos = admin('POST', '/storage/v1/object/list/photos', {'prefix': uid, 'limit': 100})[1] or []
    left_prof = admin('GET', f'/rest/v1/profiles?user_id=eq.{uid}&select=user_id')[1] or []
    print(f'depois do teste: conta {"AINDA EXISTE" if left_user else "apagada"} | app_state {len(left_state)} | fotos {len(left_photos)} | perfil {len(left_prof)}')
    if left_user or left_state or left_photos or left_prof:
        if left_photos: admin('DELETE', '/storage/v1/object/photos', {'prefixes': [f'{uid}/{o["name"]}' for o in left_photos]})
        admin('DELETE', f'/auth/v1/admin/users/{uid}')
        print('limpeza de reserva pela chave de serviço; conta agora:', 'apagada' if admin('GET', f'/auth/v1/admin/users/{uid}')[0] != 200 else 'AINDA EXISTE')
    lu = admin('GET', f'/rest/v1/label_usage?user_id=eq.{uid}&select=n')[1] or []
    print('label_usage desta conta:', len(lu), '(fica de propósito até ao fim do dia; o teste não lê rótulos)')
