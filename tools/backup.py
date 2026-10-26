# Cópia de segurança do MacroForge: dados, perfis, alimentos da comunidade e fotos de TODAS as contas,
# num único ficheiro cifrado (AES-256-GCM) em Documentos\MacroForge-backups. Guarda as últimas 12.
#
#   python tools\backup.py              -> faz uma cópia
#   python tools\backup.py --ler F      -> decifra a cópia F para uma pasta, para consultar/restaurar
#
# Chaves (nunca impressas): SUPABASE_ACCESS_TOKEN e MACROFORGE_SUPABASE_REF no .secrets\.env;
# a chave da cifra MACROFORGE_BACKUP_KEY é criada no primeiro uso. SEM ELA AS CÓPIAS NÃO SE ABREM.
import base64, datetime, io, json, os, pathlib, secrets, sys, urllib.error, urllib.parse, urllib.request, zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.stdout.reconfigure(encoding='utf-8')
ENVF = pathlib.Path.home() / '.secrets' / '.env'
OUT = pathlib.Path.home() / 'Documents' / 'MacroForge-backups'
KEEP = 12
MAGIC = b'MFBAK1'

def env():
    E = {}
    for l in ENVF.read_text(encoding='utf8').splitlines():
        if '=' in l and not l.strip().startswith('#'):
            k, v = l.split('=', 1); E[k.strip()] = v.strip().strip('"').strip("'")
    return E

def backup_key(E):
    if E.get('MACROFORGE_BACKUP_KEY'):
        return base64.urlsafe_b64decode(E['MACROFORGE_BACKUP_KEY'])
    k = AESGCM.generate_key(bit_length=256)
    txt = ENVF.read_text(encoding='utf8')
    ENVF.write_text(txt + ('' if txt.endswith('\n') else '\n') + 'MACROFORGE_BACKUP_KEY=' + base64.urlsafe_b64encode(k).decode() + '\n', encoding='utf8')
    print('Criada a chave da cifra (MACROFORGE_BACKUP_KEY no .secrets\\.env). Guarda uma cópia dela fora deste PC.')
    return k

def main():
    E = env()
    tok, ref = E['SUPABASE_ACCESS_TOKEN'], E['MACROFORGE_SUPABASE_REF']
    keys = json.load(urllib.request.urlopen(urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true',
        headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'macroforge-backup/1.0'}), timeout=60))
    svc = next(k['api_key'] for k in keys if k.get('type') == 'secret')
    base = f'https://{ref}.supabase.co'
    H = {'apikey': svc, 'Authorization': 'Bearer ' + svc}

    def get(path, body=None, raw=False):
        r = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                   method='POST' if body is not None else 'GET', headers={**H, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(r, timeout=120) as resp:
            data = resp.read()
            return data if raw else json.loads(data)

    def table(name):  # paginado, 1000 de cada vez
        rows, off = [], 0
        while True:
            chunk = get(f'/rest/v1/{name}?select=*&limit=1000&offset={off}')
            rows += chunk; off += 1000
            if len(chunk) < 1000: return rows

    data = {'criado_em': datetime.datetime.now().isoformat(timespec='seconds'), 'projeto': ref,
            'app_state': table('app_state'), 'profiles': table('profiles'), 'shared_foods': table('shared_foods')}
    buf = io.BytesIO()
    n_photos = 0
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('dados.json', json.dumps(data, ensure_ascii=False, indent=1))
        for folder in get('/storage/v1/object/list/photos', {'prefix': '', 'limit': 1000}):
            uid = folder['name']
            for obj in get('/storage/v1/object/list/photos', {'prefix': uid, 'limit': 1000}):
                if not obj.get('id'): continue
                path = f"{uid}/{obj['name']}"
                z.writestr('fotos/' + path, get('/storage/v1/object/photos/' + urllib.parse.quote(path), raw=True))
                n_photos += 1
    nonce = secrets.token_bytes(12)
    blob = MAGIC + nonce + AESGCM(backup_key(E)).encrypt(nonce, buf.getvalue(), MAGIC)
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f"macroforge-{datetime.datetime.now():%Y%m%d-%H%M}.mfbak"
    f.write_bytes(blob)
    old = sorted(OUT.glob('macroforge-*.mfbak'))[:-KEEP]
    for o in old: o.unlink()
    print(f'Cópia feita: {f}')
    print(f"  contas: {len(data['profiles'])} | estados: {len(data['app_state'])} | alimentos da comunidade: {len(data['shared_foods'])} | fotos: {n_photos} | {len(blob) // 1024} KB cifrados")
    print(f'  cópias guardadas: {len(list(OUT.glob("macroforge-*.mfbak")))} (máx. {KEEP})')

def read(path):
    E = env()
    blob = pathlib.Path(path).read_bytes()
    assert blob.startswith(MAGIC), 'não é uma cópia do MacroForge'
    plain = AESGCM(backup_key(E)).decrypt(blob[6:18], blob[18:], MAGIC)  # falha se o ficheiro tiver sido alterado
    dest = pathlib.Path(path).with_suffix('')
    zipfile.ZipFile(io.BytesIO(plain)).extractall(dest)
    print('Decifrada em', dest)

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--ler':
        read(sys.argv[2])
    else:
        main()
