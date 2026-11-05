'use strict';
/* Médoc Hand Cards — le compte du joueur : règles de l'économie, tirage des packs, sauvegarde.

   Aujourd'hui, la sauvegarde est locale (localStorage, clé mhc-v1). Avec le serveur Supabase
   (voir docs/SERVEUR.md), SEUL CE FICHIER changera : chaque action renvoie une promesse avec son résultat,
   comme le fera l'appel au serveur, et c'est le serveur qui appliquera les règles (prix, tirage, ventes)
   pour qu'on ne puisse pas tricher en modifiant le téléphone.
   Le reste du jeu ne fait que lire Compte.etat et appeler les actions ci-dessous ; il ne modifie jamais l'état. */

// ── règles du jeu (à reprendre telles quelles côté serveur) ─────────────────────
const DEPART = 3000;        // pièces au premier lancement
const BONUS_JOUR = 1500;
const VENTE = {bronze: 50, argent: 150, or: 400, elite: 1200};   // pièces pour un doublon
// poids = chances relatives de chaque rareté pour une carte ; garanti = rareté minimale de la 1re carte
const PACKS = [
  {id: 'bronze', nom: 'Bronze', prix: 500, n: 5, poids: {bronze: 70, argent: 25, or: 5, elite: .5}, desc: '5 cartes, surtout bronze'},
  {id: 'argent', nom: 'Argent', prix: 1500, n: 5, poids: {bronze: 25, argent: 55, or: 17, elite: 3}, garanti: 'argent', desc: '5 cartes, 1 argent ou mieux garantie'},
  {id: 'or', nom: 'Or', prix: 3500, n: 5, poids: {bronze: 8, argent: 42, or: 42, elite: 8}, garanti: 'or', desc: '5 cartes, 1 or ou mieux garantie'},
  {id: 'elite', nom: 'Élite', prix: 9000, n: 3, poids: {bronze: 0, argent: 0, or: 70, elite: 30}, garanti: 'elite', desc: '3 cartes or, 1 élite garantie'},
];
const PACK_BIENVENUE = 'or';   // premier pack offert

// Tirage d'un pack : fonction pure (pas d'état, pas d'affichage) pour être portée telle quelle sur le serveur.
// catalogue : [{id, rarete, ovr}] ; alea : nombre au hasard dans [0, 1[ ; renvoie les ids, meilleure carte d'abord.
function tirerPack(pack, catalogue, alea = Math.random) {
  const rang = r => RARETES.indexOf(r);
  const tirerRarete = min => {
    const ok = RARETES.filter(r => rang(r) >= rang(min || 'bronze') && pack.poids[r] > 0 && catalogue.some(c => c.rarete === r));
    let x = alea() * ok.reduce((a, r) => a + pack.poids[r], 0);
    for (const r of ok) { x -= pack.poids[r]; if (x <= 0) return r; }
    return ok[ok.length - 1] || 'bronze';
  };
  const pris = new Set(), res = [];
  for (let i = 0; i < pack.n; i++) {
    const r = tirerRarete(i === 0 ? pack.garanti : null);
    let pool = catalogue.filter(c => c.rarete === r && !pris.has(c.id));
    if (!pool.length) pool = catalogue.filter(c => !pris.has(c.id));
    const c = pool[Math.floor(alea() * pool.length)];
    pris.add(c.id); res.push(c);
  }
  return res.sort((a, b) => b.ovr - a.ovr).map(c => c.id);
}

// ── compte local (sera remplacé par les appels au serveur) ──────────────────────
const Compte = (() => {
  const CLE = 'mhc-v1';
  let catalogue = [], parId = {};
  let S = charger();

  function charger() {
    try { const s = JSON.parse(localStorage.getItem(CLE)); if (s && s.v === 1) return s; } catch (e) {}
    return {v: 1, pieces: DEPART, possede: {}, equipe: {}, dernierBonus: '', packs: 0, bienvenue: false};
  }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(S)); } catch (e) {} }
  const aujourdhui = () => new Date().toLocaleDateString('fr-CA');
  const refus = msg => Promise.reject(new Error(msg));

  return {
    // état en lecture seule pour l'affichage : {pieces, possede: {id: nombre}, equipe: {poste: id}, dernierBonus, packs, bienvenue}
    get etat() { return S; },
    // catalogue des cartes du jeu (sur le serveur, il sera dans la base)
    init(cartes) { catalogue = cartes; parId = {}; cartes.forEach(c => parId[c.id] = c); return Promise.resolve(S); },
    bonusDisponible: () => S.dernierBonus !== aujourdhui(),
    packOffert: id => id === PACK_BIENVENUE && !S.bienvenue,

    // → {ids: [id…], nouveaux: [id…]}  (enregistré avant l'animation : fermer l'app ne fait rien perdre)
    ouvrirPack(id) {
      const p = PACKS.find(x => x.id === id);
      if (!p) return refus('Pack inconnu');
      const offert = this.packOffert(id);
      if (!offert && S.pieces < p.prix) return refus('Pas assez de pièces');
      const ids = tirerPack(p, catalogue);
      if (offert) S.bienvenue = true; else S.pieces -= p.prix;
      const nouveaux = ids.filter(i => !S.possede[i]);
      ids.forEach(i => S.possede[i] = (S.possede[i] || 0) + 1);
      S.packs++; sauver();
      return Promise.resolve({ids, nouveaux});
    },
    // → {gain}
    recupererBonus() {
      if (!this.bonusDisponible()) return refus('Bonus déjà récupéré aujourd’hui');
      S.dernierBonus = aujourdhui(); S.pieces += BONUS_JOUR; sauver();
      return Promise.resolve({gain: BONUS_JOUR});
    },
    // vend un exemplaire en double de la carte id → {gain}
    vendre(id) {
      const c = parId[id];
      if (!c || (S.possede[id] || 0) < 2) return refus('Pas de doublon à vendre');
      S.possede[id]--; S.pieces += VENTE[c.rarete]; sauver();
      return Promise.resolve({gain: VENTE[c.rarete]});
    },
    // vend tous les doublons → {gain}
    vendreDoublons() {
      let gain = 0;
      for (const c of catalogue) { const q = S.possede[c.id] || 0; if (q > 1) { gain += (q - 1) * VENTE[c.rarete]; S.possede[c.id] = 1; } }
      S.pieces += gain; sauver();
      return Promise.resolve({gain});
    },
    // place une carte possédée à un poste de Mon 7 (id null = retirer) ; la règle des postes reste à l'affichage
    aligner(poste, id) {
      if (id && !S.possede[id]) return refus('Carte absente du club');
      if (id) { for (const k in S.equipe) if (S.equipe[k] === id) delete S.equipe[k]; S.equipe[poste] = id; }
      else delete S.equipe[poste];
      sauver(); return Promise.resolve({equipe: S.equipe});
    },
    // remplace tout Mon 7 : {poste: id}
    alignerEquipe(equipe) {
      if (Object.values(equipe).some(id => !S.possede[id])) return refus('Carte absente du club');
      S.equipe = {...equipe}; sauver();
      return Promise.resolve({equipe: S.equipe});
    },
  };
})();
