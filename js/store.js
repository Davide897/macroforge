// Persistência local: estado em localStorage, fotos em IndexedDB. Com sessão iniciada, sync.js copia para a nuvem.
(function () {
  const MF = window.MF || (window.MF = {});
  const KEY = 'macroforge.v1';

  const defaults = () => ({
    lang: 'pt', theme: 'dark', tab: 'goals',
    profile: {
      sex: 'M', age: 30, height: 178, weight: 80, bodyfat: null, activity: 1.55,
      goal: 'cut', kcalPos: 0.5, mode: 'kcal', protein: null, fat: null, carbs: null,
      kcalOverride: null, meals: null, days: 3,
    },
    foods: {},          // id -> { like, buy }
    customFoods: [],
    plan: null, dayIdx: 0,
    weights: [],        // { date, kg, waist, kcal }
    shopChecked: {},
    dismissed: {},      // sugestões que o utilizador recusou
    pendingNew: 0,      // alimentos juntados desde a última geração
    ui: { cat: 'all' },
  });

  // O que vai para a nuvem: tudo menos o estado de navegação deste aparelho.
  const LOCAL_ONLY = ['ui', 'tab', 'dayIdx', 'updatedAt', 'ownerId', 'sharedFoods']; // sharedFoods: cópia local do catálogo da comunidade // ownerId: de quem são os dados deste aparelho
  const payload = s => { const o = {}; for (const k in s) if (!LOCAL_ONLY.includes(k)) o[k] = s[k]; return o; };
  let lastPayload = null; // para só marcar updatedAt quando os DADOS mudam (mudar de separador não conta)

  MF.store = {
    payload,
    load() {
      const d = defaults();
      let s = d;
      try {
        const raw = JSON.parse(localStorage.getItem(KEY));
        if (raw) s = { ...d, ...raw, profile: { ...d.profile, ...raw.profile }, ui: { ...d.ui, ...raw.ui } };
      } catch (e) { s = d; }
      lastPayload = JSON.stringify(payload(s));
      return s;
    },
    save(s) {
      const j = JSON.stringify(payload(s));
      const changed = j !== lastPayload;
      if (changed) { s.updatedAt = Date.now(); lastPayload = j; }
      localStorage.setItem(KEY, JSON.stringify(s));
      if (changed && MF.sync && MF.sync.schedulePush) MF.sync.schedulePush();
    },
    // estado vindo da nuvem: guardar sem o marcar como alteração local
    adopt(s, updatedAt) {
      s.updatedAt = updatedAt; lastPayload = JSON.stringify(payload(s));
      localStorage.setItem(KEY, JSON.stringify(s));
    },
    replace(obj) {
      const d = defaults();
      return { ...d, ...obj, profile: { ...d.profile, ...obj.profile }, ui: { ...d.ui, ...obj.ui } };
    },
  };

  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('macroforge', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode);
      const out = fn(t.objectStore('photos'));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }
  MF.photos = {
    all: () => tx('readonly', s => s.getAll()),
    put: rec => tx('readwrite', s => s.put(rec)),
    del: id => tx('readwrite', s => s.delete(id)),
    clear: () => tx('readwrite', s => s.clear()),
    async compress(file, maxSide = 1400) {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    },
  };
})();
