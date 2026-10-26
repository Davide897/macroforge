// Página de aprovação: só confirma com um clique (os verificadores de links do Outlook abrem o link sozinhos).
(function () {
  const q = new URLSearchParams(location.search);
  const a = q.get('a') === 'reject' ? 'reject' : 'approve';
  const $ = id => document.getElementById(id);
  if (a === 'reject') {
    $('title').textContent = 'Recusar conta?';
    $('text').textContent = 'Vais recusar o pedido de conta do MacroForge. A pessoa não terá acesso.';
    $('go').className = 'no';
  }
  $('go').addEventListener('click', async () => {
    $('go').disabled = true; $('msg').textContent = 'A tratar…';
    try {
      const r = await fetch('https://zpqoirmddxndxfwbahtv.supabase.co/functions/v1/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u: q.get('u'), a, e: q.get('e'), s: q.get('s') }),
      });
      const d = await r.json();
      if (d.ok) {
        $('title').textContent = d.status === 'approved' ? 'Conta aprovada' : 'Conta recusada';
        $('text').textContent = (d.email || 'A conta') + (d.status === 'approved' ? ' já pode usar o MacroForge. Enviámos-lhe um email.' : ' não tem acesso.');
        $('go').style.display = 'none'; $('msg').textContent = '';
      } else {
        $('msg').textContent = { expired: 'Este link expirou.', badSignature: 'Link inválido.', notFound: 'Conta não encontrada (pode ter sido apagada).' }[d.error] || 'Não foi possível.';
        $('go').disabled = false;
      }
    } catch (e) { $('msg').textContent = 'Sem ligação. Tenta outra vez.'; $('go').disabled = false; }
  });
})();
