# Proteções do servidor local serve.py (vindas de macroforge-test/run_audit.py, ponto 6).
# Uso: python -m unittest discover -s tests -p "test_*.py"
import http.client, json, os, shutil, socket, subprocess, sys, tempfile, time, unittest, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class ServeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        # Sem chave nenhuma: variável vazia e pasta pessoal temporária (o serve.py também procura em ~/.secrets/.env).
        # Assim o teste nunca chama o OpenRouter nem lê segredos do computador.
        cls.home = tempfile.mkdtemp(prefix='mf-home-')
        env = {**os.environ, 'OPENROUTER_API_KEY': '', 'HOME': cls.home, 'USERPROFILE': cls.home, 'HOMEDRIVE': '', 'HOMEPATH': ''}
        cls.proc = subprocess.Popen([sys.executable, 'serve.py', str(cls.port)], cwd=ROOT, env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                socket.create_connection(('127.0.0.1', cls.port), timeout=0.2).close()
                return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError('serve.py não arrancou')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=10)
        shutil.rmtree(cls.home, ignore_errors=True)

    def req(self, method, path, headers=None, body=None):
        rq = urllib.request.Request(f'http://127.0.0.1:{self.port}{path}', data=body, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(rq, timeout=10) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    IMG = json.dumps({'image': 'data:image/png;base64,AA'}).encode()

    def test_app_servida_sem_cache(self):
        rq = urllib.request.Request(f'http://127.0.0.1:{self.port}/index.html')
        with urllib.request.urlopen(rq, timeout=10) as r:
            self.assertEqual(r.status, 200)
            self.assertIn('no-store', r.headers.get('Cache-Control', ''))

    def test_outro_site_nao_usa_a_leitura_de_rotulos(self):
        code, _ = self.req('POST', '/api/label', {'Origin': 'https://evil.example', 'Content-Type': 'application/json'}, self.IMG)
        self.assertEqual(code, 403)

    def test_pedido_simples_sem_json_recusado(self):
        code, _ = self.req('POST', '/api/label', {'Content-Type': 'text/plain'}, self.IMG)
        self.assertEqual(code, 403)

    def test_host_estranho_recusado(self):  # DNS rebinding
        code, _ = self.req('GET', '/index.html', {'Host': 'evil.example'})
        self.assertEqual(code, 403)

    def test_ficheiros_escondidos_e_fora_da_pasta_nao_saem(self):
        for path in ['/.git/config', '/.gitignore', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2f..%2fetc%2fpasswd']:
            code, body = self.req('GET', path)
            self.assertNotEqual(code, 200, path)

    def test_sem_chave_responde_noKey(self):
        code, body = self.req('POST', '/api/label', {'Content-Type': 'application/json'}, self.IMG)
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)['error'], 'noKey')

    def test_imagem_grande_demais(self):
        # só o cabeçalho a anunciar 9 MB: o servidor tem de recusar antes de ler o corpo
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        c.putrequest('POST', '/api/label'); c.putheader('Content-Type', 'application/json'); c.putheader('Content-Length', str(9 * 1024 * 1024)); c.endheaders()
        self.assertEqual(c.getresponse().status, 413)
        c.close()


if __name__ == '__main__':
    unittest.main()
