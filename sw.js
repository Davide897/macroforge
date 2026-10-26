// Cache para funcionar offline depois da primeira abertura.
const CACHE = 'macroforge-v5';
const FILES = ['./', 'index.html', 'privacy.html', 'css/style.css', 'js/i18n.js', 'js/foods.js', 'js/engine.js', 'js/store.js', 'js/vendor/supabase.js', 'js/config.js', 'js/sync.js', 'js/app.js', 'icon.svg', 'manifest.webmanifest',
  ...['hero', 'goal-cutAgg', 'goal-cut', 'goal-maint', 'goal-bulk', 'goal-bulkAgg', 'cat-prot', 'cat-protfat', 'cat-dairy', 'cat-carb',
    'cat-fat', 'cat-veg', 'cat-fruit', 'meal-breakfast', 'meal-snack', 'meal-lunch', 'meal-dinner', 'meal-supper'].map(n => `img/${n}.jpg`)];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Rede primeiro (para apanhar atualizações), cache se estiver offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // Supabase e outros: nunca da cache
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
