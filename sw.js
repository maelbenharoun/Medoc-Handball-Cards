// Cache hors ligne : le jeu s'ouvre sans réseau une fois installé.
// Changer VERSION à chaque mise à jour des fichiers pour forcer le rafraîchissement.
const VERSION = 'mhc-v52';
const FICHIERS = ['./', 'index.html', 'style.css', 'config.js', 'cartes.js', 'serveur.js', 'sons.js', 'app.js', 'confidentialite.html',
  'manifest.webmanifest', 'data/cartes.json', 'data/perso.json',
  'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' : jamais la copie du cache du navigateur (GitHub Pages la garde 10 minutes), toujours la version en ligne
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting()));
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
  // modèles 3D des mini-jeux (modeles/…?v=N : une nouvelle version a une autre adresse) : gardés eux aussi
  if (autresSites.includes(url.hostname) || url.pathname.includes('/assets/photos/') || url.pathname.includes('/modeles/') || url.pathname.includes('/storage/v1/object/public/photos/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(rep => {
      // on ne garde que les vraies réponses : une photo juste publiée peut répondre 404 le temps que GitHub Pages la mette en ligne
      if (rep.ok || rep.type === 'opaque') { const copie = rep.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); }
      return rep;
    })));
    return;
  }
  // le jeu lui-même (pages, scripts, styles) : réseau d'abord, pour avoir tout de suite la dernière version ;
  // le cache ne sert que hors ligne (ignoreSearch : « app.js?v=20 » ou « ./?demo » retrouvent leur copie)
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type === 'basic') { const copie = r.clone(); caches.open(VERSION).then(c => c.put(e.request.url.split('?')[0], copie)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(m => m || caches.match('./'))));
});
