'use strict';
/* Médoc Hand Cards — logique des cartes partagée entre le jeu (app.js) et l'outil de gestion (admin.js).

   Deux sources :
   - data/cartes.json : généré par scripts/export_cartes.py depuis medochandballstats.com (nom, équipe, stats du site) ;
   - data/perso.json  : propre au jeu, rempli avec l'outil (admin.html) : poste de jeu, 6 stats, note forcée, photo.
   Une carte sans réglage dans perso.json reçoit un poste et des stats par défaut tirés des stats du site. */

// ── raretés ─────────────────────────────────────────────────────────────────────
const RARETES = ['bronze', 'argent', 'or', 'elite'];
const R_LABEL = {bronze: 'Bronze', argent: 'Argent', or: 'Or', elite: 'Élite'};
const SEUILS = [[85, 'elite'], [72, 'or'], [60, 'argent'], [0, 'bronze']];   // note minimale de chaque rareté
const rareteDe = note => SEUILS.find(([s]) => note >= s)[1];

// ── postes et stats ─────────────────────────────────────────────────────────────
const POSTES_JEU = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'];
const POSTE_NOM = {AG: 'Ailier gauche', ARG: 'Arrière gauche', DC: 'Demi-centre', ARD: 'Arrière droit', AD: 'Ailier droit',
  PIV: 'Pivot', GB: 'Gardien(ne)'};
// [clé, abréviation sur la carte, nom complet]
const STATS_CHAMP = [['tir', 'TIR', 'Tir'], ['pas', 'PAS', 'Passes'], ['def', 'DÉF', 'Défense'],
  ['men', 'MEN', 'Mental'], ['phy', 'PHY', 'Physique'], ['vit', 'VIT', 'Vitesse']];
const STATS_GB = [['ref', 'RÉF', 'Réflexes'], ['pla', 'PLA', 'Placement'], ['rel', 'REL', 'Relance'],
  ['men', 'MEN', 'Mental'], ['phy', 'PHY', 'Physique'], ['vit', 'VIT', 'Vitesse']];
const statsDu = poste => poste === 'GB' ? STATS_GB : STATS_CHAMP;

// Poids de chaque stat dans la note générale selon le poste (chaque ligne fait 1)
const POIDS = {
  AG: {tir: .25, pas: .10, def: .15, men: .10, phy: .10, vit: .30},
  AD: {tir: .25, pas: .10, def: .15, men: .10, phy: .10, vit: .30},
  ARG: {tir: .30, pas: .20, def: .15, men: .10, phy: .15, vit: .10},
  ARD: {tir: .30, pas: .20, def: .15, men: .10, phy: .15, vit: .10},
  DC: {tir: .20, pas: .30, def: .10, men: .20, phy: .05, vit: .15},
  PIV: {tir: .25, pas: .05, def: .20, men: .10, phy: .30, vit: .10},
  JDC: {tir: .25, pas: .20, def: .20, men: .10, phy: .125, vit: .125},   // joueur(se) de champ sans poste renseigné
  GB: {ref: .35, pla: .25, rel: .10, men: .15, phy: .05, vit: .10},
};

const borne = (x, a, b) => Math.max(a, Math.min(b, Math.round(x)));

function noteDepuisStats(s, poste) {
  const w = POIDS[poste || 'JDC'];
  return borne(Object.keys(w).reduce((a, k) => a + w[k] * (s[k] || 0), 0), 1, 99);
}

// Stats de départ tirées des stats du site, puis décalées pour que la note reste celle du site
function statsParDefaut(c, poste) {
  const o = c.ovr;
  let s;
  if (poste === 'GB') {
    const g = c.gb ?? o;
    s = {ref: g + 2, pla: g, rel: g - 6, men: g, phy: g - 4, vit: g - 8};
  } else {
    const a = c.att ?? o, d = c.def ?? o, t = c.tir ?? a;
    s = {tir: .7 * a + .3 * t, pas: .5 * a + .5 * o, def: d, men: o, phy: .5 * d + .5 * o, vit: o};
  }
  // décalage réparti sur les stats qui ne sont pas déjà au plafond (99) ou au plancher (20)
  const w = POIDS[poste || 'JDC'], ks = Object.keys(w);
  for (let i = 0; i < 6; i++) {
    const ecart = o - ks.reduce((a, k) => a + w[k] * s[k], 0);
    const libres = ks.filter(k => ecart > 0 ? s[k] < 99 : s[k] > 20), wl = libres.reduce((a, k) => a + w[k], 0);
    if (Math.abs(ecart) < .25 || !wl) break;
    for (const k of libres) s[k] = Math.max(20, Math.min(99, s[k] + ecart / wl));
  }
  for (const k of ks) s[k] = borne(s[k], 20, 99);
  return s;
}

// Stats enregistrées valides pour ce type de poste (champ ou GB) ?
function statsValides(s, poste) {
  return !!s && statsDu(poste).every(([k]) => Number.isFinite(s[k]) && s[k] >= 1 && s[k] <= 99);
}

// Carte du site + réglages perso → carte du jeu
function fusionnerCarte(c0, p = {}) {
  const poste = POSTES_JEU.includes(p.poste) ? p.poste : (c0.poste === 'GB' ? 'GB' : null);
  const estGB = poste === 'GB';
  const s = statsValides(p.stats, poste) ? {...p.stats} : statsParDefaut(c0, poste);
  const calc = noteDepuisStats(s, poste);
  const ovr = Number.isFinite(p.ovr) ? borne(p.ovr, 1, 99) : calc;
  return {...c0, profil: c0.poste, ovrSite: c0.ovr, poste, estGB, s, calc, ovr, force: Number.isFinite(p.ovr),
    rarete: rareteDe(ovr), photo: p.photo || null, perso: !!(p.poste || p.stats || p.photo || Number.isFinite(p.ovr))};
}
function fusionner(site, perso) {
  return site.map(c => fusionnerCarte(c, perso[c.id])).sort((a, b) => b.ovr - a.ovr || a.nom.localeCompare(b.nom, 'fr'));
}

// Brouillon de l'outil (modifications pas encore publiées) : visible en aperçu dans le jeu du même navigateur.
// Une entrée null veut dire « remettre la carte par défaut ».
const CLE_BROUILLON = 'mhc-outil-v1';
const CLE_OUTIL_GITHUB = 'mhc-outil-github';   // réglages GitHub de l'outil (dépôt, branche, jeton vérifié)
// Ce navigateur est-il celui de l'administrateur (jeton GitHub accepté par l'outil) ?
// Ce n'est pas une sécurité (rien n'est publié sans le jeton) : juste pour que les joueurs ne voient jamais d'aperçu.
function outilConnecte() { try { return !!JSON.parse(localStorage.getItem(CLE_OUTIL_GITHUB))?.jeton; } catch (e) { return false; } }
function lireBrouillon() { try { return JSON.parse(localStorage.getItem(CLE_BROUILLON)) || {}; } catch (e) { return {}; } }
function appliquerBrouillon(perso, brouillon) {
  const r = {...perso};
  for (const [id, e] of Object.entries(brouillon)) { if (e === null) delete r[id]; else r[id] = e; }
  return r;
}

// ── rendu d'une carte ───────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const initiales = nom => nom.split(/[\s-]+/).filter(Boolean).map(m => m[0]).slice(0, 2).join('').toUpperCase();
const posteAffiche = c => c.poste || 'JDC';

function silhouette(r) {
  const f = r === 'elite' ? 'rgba(255,210,87,.16)' : 'rgba(0,0,0,.13)';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="34" r="17" fill="${f}"/><path d="M18 100c0-22 14-36 32-36s32 14 32 36z" fill="${f}"/></svg>`;
}

// o : {cache, cls, note (note affichée selon le poste occupé), nouveau, qty, doublon (prix de vente)}
function carteHTML(c, o = {}) {
  if (o.cache) return `<div class="card locked lr-${c.rarete}" data-id="${c.id}"><div class="c-top"><b class="c-ovr">?</b><span class="c-pos">${posteAffiche(c)}</span></div>
    <div class="c-face">${silhouette()}</div><div class="c-name">${esc(c.nom)}</div><div class="c-line"></div></div>`;
  const note = o.note ?? c.ovr;
  const visage = c.photo ? `<img class="c-photo" src="${esc(c.photo)}" alt="" loading="lazy">`
    : `<div class="c-face">${silhouette(c.rarete)}</div><div class="c-mono">${initiales(c.nom)}</div>`;
  return `<div class="card r-${c.rarete}${o.cls ? ' ' + o.cls : ''}" data-id="${c.id}" role="img" aria-label="${esc(c.nom)}, ${c.equipe}, ${posteAffiche(c)}, note ${note}">
    <div class="c-top"><b class="c-ovr">${note}</b><span class="c-pos">${posteAffiche(c)}</span><span class="c-eq">${c.equipe}</span><img class="c-logo" src="assets/logo.png" alt=""></div>
    ${visage}<div class="c-name">${esc(c.nom)}</div><div class="c-line"></div>
    <div class="c-stats">${statsDu(c.poste).map(([k, l]) => `<span><b>${c.s[k]}</b>${l}</span>`).join('')}</div>
    ${o.nouveau ? '<span class="c-new">NOUVEAU</span>' : ''}${o.qty > 1 ? `<span class="qty">×${o.qty}</span>` : ''}
    ${o.doublon ? `<span class="c-dup">Doublon · ${o.doublon} pièces</span>` : ''}</div>`;
}
