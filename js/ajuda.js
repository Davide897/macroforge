// Guia: escolha de língua (a mesma da app, se já estiver definida neste aparelho).
(function () {
  let lang = 'pt';
  try { lang = (JSON.parse(localStorage.getItem('macroforge.v1') || '{}').lang) || (navigator.language || '').slice(0, 2); } catch (e) {}
  const set = l => {
    document.body.classList.toggle('en', l === 'en');
    document.documentElement.lang = l === 'en' ? 'en' : 'pt';
    document.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === (l === 'en' ? 'en' : 'pt')));
  };
  set(lang === 'en' ? 'en' : 'pt');
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => set(b.dataset.lang)));
})();
