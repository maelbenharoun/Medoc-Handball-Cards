// Cache hors ligne : le jeu s'ouvre sans réseau une fois installé.
// Changer VERSION à chaque mise à jour des fichiers pour forcer le rafraîchissement.
const VERSION = 'mhc-v2';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'data/cartes.json',
  'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord pour les cartes (mises à jour chaque semaine), cache d'abord pour le reste
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.endsWith('cartes.json')) {
    e.respondWith(fetch(e.request).then(r => {
      const copie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Police Outfit (Google Fonts) : gardée en cache dès la première visite pour l'affichage hors ligne
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(rep => {
      const copie = rep.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); return rep;
    })));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));   // ignoreSearch : « ./?sw » sert « ./ »
});
