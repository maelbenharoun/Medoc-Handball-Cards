// Cache hors ligne : le jeu s'ouvre sans réseau une fois installé.
// Changer VERSION à chaque mise à jour des fichiers pour forcer le rafraîchissement.
const VERSION = 'mhc-v20';
const FICHIERS = ['./', 'index.html', 'style.css', 'config.js', 'cartes.js', 'serveur.js', 'app.js', 'confidentialite.html',
  'manifest.webmanifest', 'data/cartes.json', 'data/perso.json',
  'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord pour les données (cartes du site chaque semaine, réglages de l'outil), cache d'abord pour le reste
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // serveur Supabase (comptes, packs, échanges) : jamais de cache, toujours le réseau
  const autresSites = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];
  if (url.origin !== self.location.origin && !autresSites.includes(url.hostname) && !url.pathname.includes('/storage/v1/object/public/photos/')) return;
  if (url.pathname.endsWith('cartes.json') || url.pathname.endsWith('perso.json')) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); }
      return r.ok ? r : caches.match(e.request).then(m => m || r);
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Police Outfit, bibliothèque Supabase (version fixée) et photos des joueurs : gardées en cache dès la première
  // visite pour le hors-ligne (chaque photo a un nom unique : une nouvelle n'est jamais masquée par l'ancienne)
  if (autresSites.includes(url.hostname) || url.pathname.includes('/assets/photos/') || url.pathname.includes('/storage/v1/object/public/photos/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(rep => {
      // on ne garde que les vraies réponses : une photo juste publiée peut répondre 404 le temps que GitHub Pages la mette en ligne
      if (rep.ok || rep.type === 'opaque') { const copie = rep.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); }
      return rep;
    })));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));   // ignoreSearch : « ./?sw » sert « ./ »
});
