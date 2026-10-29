// Caixas de confirmação próprias (em vez de confirm/prompt do browser): <dialog> modal, com foco preso lá dentro,
// Escape para cancelar e o foco devolvido a quem a abriu. Fica fora de #app para sobreviver aos redesenhos.
(function () {
  const MF = window.MF || (window.MF = {});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let seq = 0;

  // opts: ok, cancel (textos dos botões) · danger (botão vermelho) · input: {expect, label} (tem de escrever `expect`)
  //       dismiss: false = sem Escape nem clique fora (quando cancelar também faz alguma coisa)
  // Devolve true/false (ou o texto escrito, com input), como uma Promise.
  function open(message, opts = {}) {
    return new Promise(resolve => {
      const id = 'mfd' + ++seq;
      const back = document.activeElement;
      const d = document.createElement('dialog');
      d.className = 'mf-dialog';
      d.setAttribute('aria-labelledby', id + 't');
      d.innerHTML = `<form method="dialog">
        <p id="${id}t" class="mf-dialog-msg">${esc(message)}</p>
        ${opts.input ? `<label class="mf-dialog-in">${esc(opts.input.label || '')}<input name="v" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>` : ''}
        <div class="mf-dialog-act">
          <button type="button" class="btn ghost" value="cancel">${esc(opts.cancel || MF.t(lang(), 'cancel'))}</button>
          <button type="submit" class="btn ${opts.danger ? 'danger-btn' : ''}" value="ok" ${opts.input ? 'disabled' : ''}>${esc(opts.ok || 'OK')}</button>
        </div></form>`;
      const okBtn = d.querySelector('[value=ok]'), input = d.querySelector('input');
      let done = false;
      const finish = ok => {
        if (done) return; done = true;
        const v = input ? input.value.trim() : null;
        d.close(); d.remove();
        if (back && document.contains(back)) back.focus();
        resolve(input ? (ok ? v : null) : ok);
      };
      if (input) input.addEventListener('input', () => { okBtn.disabled = input.value.trim() !== opts.input.expect; });
      d.querySelector('[value=cancel]').addEventListener('click', () => finish(false));
      d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (!okBtn.disabled) finish(true); });
      d.addEventListener('cancel', e => { e.preventDefault(); if (opts.dismiss !== false) finish(false); });   // Escape
      d.addEventListener('click', e => { if (e.target === d && opts.dismiss !== false) finish(false); });     // clique fora
      document.body.appendChild(d);
      d.showModal();
      (input || (opts.danger ? d.querySelector('[value=cancel]') : okBtn)).focus();             // perigoso: o foco começa em Cancelar
    });
  }
  const lang = () => document.documentElement.lang === 'en' ? 'en' : 'pt';
  MF.ui = { confirm: (msg, opts) => open(msg, opts), prompt: (msg, opts) => open(msg, opts) };
})();
