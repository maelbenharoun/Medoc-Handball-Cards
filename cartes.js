'use strict';
/* Médoc Hand Cards — logique des cartes partagée entre le jeu (app.js) et l'outil de gestion (admin.js).

   Deux sources :
   - data/cartes.json : généré par scripts/export_cartes.py depuis medochandballstats.com (nom, équipe, stats du site) ;
   - data/perso.json  : propre au jeu, rempli avec l'outil (admin.html) : postes de jeu, 6 stats, une photo par palier.
   Une carte sans réglage dans perso.json reçoit un poste et des stats par défaut tirés des stats du site.

   Chaque joueur existe en 4 paliers, avec le même pouvoir pour tous (supabase/schema.sql fait foi) :
   Bronze 50 → 59, Argent 60 → 74, Or 75 → 89, Ultime 90 → 99. La note d'un exemplaire vient de son palier
   et de son entraînement ; les 6 stats réglées dans l'outil ne donnent que la forme du joueur (ses « écarts »).
   À note égale, tous les joueurs ont le même total de stats : 240 en moyenne à 50 (40 par stat), 480 à 99 (80 par stat) ;
   la forme répartit ce total (écarts de somme nulle), et sur tout le catalogue chaque stat a la même moyenne
   (stat_note et normaliser_ecarts dans supabase/schema.sql font la même chose).
   La forme est proportionnelle (demande de Maël) : un écart est donné pour une moyenne de 40 (note 50) et grandit avec
   la moyenne du palier : stat = moyenne × (1 + écart / 40). Une stat qui vaut 25 % du total le vaut à tous les paliers.
   Légendes du club : cartes créées dans l'outil (legende), en une seule édition (Ultime, cadre à part), jamais tirées
   ailleurs que dans le booster gratuit (1 sur 500, schema.sql). */

// ── paliers ─────────────────────────────────────────────────────────────────────
const PALIERS = [
  {id: 'bronze', nom: 'Bronze', min: 50, max: 59}, {id: 'argent', nom: 'Argent', min: 60, max: 74},
  {id: 'or', nom: 'Or', min: 75, max: 89}, {id: 'ultime', nom: 'Ultime', min: 90, max: 99},
];
const RARETES = PALIERS.map(p => p.id);
const R_LABEL = Object.fromEntries(PALIERS.map(p => [p.id, p.nom]));
const PALIER = Object.fromEntries(PALIERS.map(p => [p.id, p]));
const palierSuivant = id => RARETES[RARETES.indexOf(id) + 1] || null;
const NOTE_LEGENDE = 100;   // une légende du club : 100 de note générale (legende_note dans schema.sql), ses stats gardent sa forme

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

// Bonus de chaque poste sur les stats (somme nulle : la note ne bouge pas, seule la forme change).
// Un joueur à plusieurs postes prend la moyenne de leurs bonus : plus polyvalent, moins spécialisé.
const BONUS_POSTE = {
  AG: {vit: 4, tir: 2, pas: -1, def: -2, men: -1, phy: -2}, AD: {vit: 4, tir: 2, pas: -1, def: -2, men: -1, phy: -2},
  ARG: {tir: 4, phy: 2, pas: -1, def: -2, men: -1, vit: -2}, ARD: {tir: 4, phy: 2, pas: -1, def: -2, men: -1, vit: -2},
  DC: {pas: 4, men: 2, tir: -1, def: -2, phy: -2, vit: -1}, PIV: {phy: 4, def: 2, tir: 0, pas: -2, men: -2, vit: -2},
};
function bonusPostes(postes) {
  const champ = (postes || []).filter(p => BONUS_POSTE[p]);
  const b = {tir: 0, pas: 0, def: 0, men: 0, phy: 0, vit: 0};
  for (const p of champ) for (const k in b) b[k] += BONUS_POSTE[p][k] / champ.length;
  for (const k in b) b[k] = Math.round(b[k]);
  return b;
}
// Postes d'une carte : la liste réglée dans l'outil (le premier = principal), sinon l'ancien poste unique,
// sinon GB pour un gardien du site ; vide = joueur de champ sans poste (joue partout sans malus)
function postesDe(p, c0) {
  const l = (Array.isArray(p.postes) ? p.postes : p.poste ? [p.poste] : []).filter((x, i, t) => POSTES_JEU.includes(x) && t.indexOf(x) === i);
  return l.length ? l : c0.poste === 'GB' ? ['GB'] : [];
}

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

// Carte du site + réglages perso → carte du catalogue (au palier Bronze, note 50, pour l'affichage par défaut)
function fusionnerCarte(c0, p = {}) {
  const postes = postesDe(p, c0), poste = postes[0] || null;   // poste principal : il donne la famille de stats (champ ou GB)
  const estGB = poste === 'GB';
  const profil = statsValides(p.stats, poste) ? {...p.stats} : statsParDefaut(c0, poste);
  const calc = noteDepuisStats(profil, poste);
  // la forme du joueur : ses stats (plus le bonus de ses postes) moins leur moyenne : des écarts de somme nulle
  const bonus = estGB ? {} : bonusPostes(postes), ks = statsDu(poste).map(([k]) => k);
  const mp = ks.reduce((t, k) => t + profil[k], 0) / 6 || 40, mb = ks.reduce((t, k) => t + (bonus[k] || 0), 0) / 6;
  const ecarts = Object.fromEntries(ks.map(k => [k, Math.round(40 * (profil[k] - mp) / mp + (bonus[k] || 0) - mb)]));
  const photos = {};
  for (const r of RARETES) if (p.photos?.[r]) photos[r] = p.photos[r];
  // numéro de maillot : celui réglé dans l'outil, sinon le plus porté cette saison d'après les feuilles de match
  const ok = n => Number.isInteger(n) && n >= 0 && n <= 99;
  const numero = ok(p.numero) ? p.numero : ok(c0.numero) ? c0.numero : null;
  const c = {...c0, profil: c0.poste, ovrSite: c0.ovr, poste, postes, estGB, stats: profil, calc, bonus, ecarts, photos, photo: p.photo || null, numero,
    equipe: p.equipe || c0.equipe, legende: !!(p.legende ?? c0.legende),
    fiche: ficheDe(c0.fiche, p.fiche),
    perso: !!(p.poste || p.postes?.length || p.stats || p.photo || ok(p.numero) || Object.keys(photos).length || p.fiche || p.equipe || p.legende)};
  return vueExemplaire(c, c.legende ? {palier: 'ultime', note: NOTE_LEGENDE} : {palier: 'bronze', note: PALIER.bronze.min});
}
// Fiche d'un joueur : les sections tirées des stats du site (export_cartes.py) + ce que l'outil y change.
// auto : [{id, titre, style: 'lignes' | 'fun', lignes: [{id, l, v, d?}]}]
// f (réglages.fiche) : {intro, titres: {section: titre}, caches: [id de section ou « section.ligne »],
//   lignes: {« section.ligne »: {l?, v?, d?}}, ajouts: [{s, id, l, v, d?}], sections: [{id, titre, style}]}
// Les lignes non touchées suivent les stats du site à chaque mise à jour.
// Sections que Maël ne veut plus (anciens exports encore sur le serveur) : jamais affichées
const SECTIONS_RETIREES = new Set(['club', 'saisons', 'derniers']);
function ficheDe(auto, f) {
  f = f || {};
  auto = (auto || []).filter(s => !SECTIONS_RETIREES.has(s.id));
  const caches = new Set(f.caches || []), modif = f.lignes || {};
  const secs = [...(auto || []).map(s => ({...s, auto: true, lignes: s.lignes.map(x => ({...x, auto: true}))})),
    ...(f.sections || []).map(s => ({id: s.id, titre: s.titre || '', style: s.style === 'fun' ? 'fun' : 'lignes', lignes: []}))];
  for (const a of f.ajouts || []) secs.find(s => s.id === a.s)?.lignes.push({id: a.id, l: a.l || '', v: a.v || '', d: a.d || '', ajout: true});
  return {intro: f.intro || '', sections: secs.map(s => ({...s, titre: f.titres?.[s.id] ?? s.titre, cache: caches.has(s.id),
    lignes: s.lignes.map(x => { const k = s.id + '.' + x.id, m = modif[k] || {};
      return {...x, cle: k, l: m.l ?? x.l, v: m.v ?? x.v, d: m.d ?? x.d ?? '', modifie: x.auto && !!modif[k], cache: caches.has(k)}; })}))};
}
// La fiche affichée dans le jeu (sans ce qui est masqué)
function ficheHTML(fi) {
  if (!fi) return '';
  const secs = fi.sections.filter(s => !s.cache).map(s => ({...s, lignes: s.lignes.filter(x => !x.cache && (x.l || x.v))})).filter(s => s.lignes.length);
  return (fi.intro ? `<p class="f-intro">${esc(fi.intro)}</p>` : '') + secs.map(s => `<section class="f-sec"><h4>${esc(s.titre)}</h4>${s.style === 'fun'
    ? `<div class="f-fun">${s.lignes.map(x => `<div><small>${esc(x.l)}</small><b>${esc(x.v)}</b>${x.d ? `<p>${esc(x.d)}</p>` : ''}</div>`).join('')}</div>`
    : `<dl class="f-l">${s.lignes.map(x => `<div><dt>${esc(x.l)}</dt><dd${String(x.v).length <= 26 ? ' class="court"' : ''}>${esc(x.v)}${x.d ? `<small>${esc(x.d)}</small>` : ''}</dd></div>`).join('')}</dl>`}</section>`).join('');
}
// Moyenne des 6 stats à une note : 40 à 50, 80 à 99 (moyenneExacte : sans arrondi, pour les calculs)
const moyenneExacte = note => 40 + (note - 50) * 40 / 49;
const moyenneStats = note => Math.round(moyenneExacte(note));
// Les 6 stats d'un joueur à une note : la moyenne × (1 + écart / 40), de 1 à 99 (la forme reste proportionnelle à chaque palier)
function statsAuNiveau(c, note) {
  const m = moyenneExacte(note);
  return Object.fromEntries(statsDu(c.poste).map(([k]) => [k, borne(m * (1 + (c.ecarts?.[k] || 0) / 40), 1, 99)]));
}
// Une carte créée dans l'outil (pas sur le site) : le minimum que le jeu attend d'une carte du site
function carteCreee(id, b) {
  return {id, nom: b.nom, equipe: b.equipe, genre: b.genre === 'M' ? 'M' : 'F', poste: b.poste === 'GB' ? 'GB' : 'JDC', ovr: 75, att: 75, def: 75, tir: 75,
    gb: b.poste === 'GB' ? 75 : null, arr: 0, mj: 0, buts: 0, bpm: 0, record: 0, recrue: false, numero: null, fiche: [], cree: true, legende: !!b.legende};
}
// Photo d'un palier ; sinon celle du palier inférieur le plus proche ; sinon la photo unique ; sinon rien
function photoPalier(c, palier) {
  for (let i = RARETES.indexOf(palier); i >= 0; i--) if (c.photos?.[RARETES[i]]) return c.photos[RARETES[i]];
  return c.photo || null;
}
// Ce qu'on affiche pour un exemplaire possédé : {palier, note, …} + la carte du catalogue
function vueExemplaire(c, ex) {
  return {...c, rarete: ex.palier, ovr: ex.note, s: statsAuNiveau(c, ex.note), photo: photoPalier(c, ex.palier), ex};
}
// Sur tout le catalogue, chaque stat a la même moyenne (champ et gardiens à part) : on retire à chacun la moyenne de la stat
function equilibrerEcarts(liste) {
  for (const gb of [false, true]) {
    const l = liste.filter(c => c.estGB === gb); if (!l.length) continue;
    const ks = statsDu(gb ? 'GB' : null).map(([k]) => k), m = Object.fromEntries(ks.map(k => [k, l.reduce((t, c) => t + (c.ecarts[k] || 0), 0) / l.length]));
    for (const c of l) c.ecarts = Object.fromEntries(ks.map(k => [k, Math.round((c.ecarts[k] || 0) - m[k])]));
  }
  return liste;
}
function fusionner(site, perso) {
  return equilibrerEcarts(site.map(c => fusionnerCarte(c, perso[c.id]))).map(c => vueExemplaire(c, {palier: c.rarete, note: c.ovr}))
    .sort((a, b) => b.ovr - a.ovr || a.nom.localeCompare(b.nom, 'fr'));
}

// Brouillon de l'outil (modifications pas encore publiées) : visible en aperçu dans le jeu du même navigateur.
// Une entrée null veut dire « remettre la carte par défaut ».
const CLE_BROUILLON = 'mhc-outil-v1';
const CLE_OUTIL_GITHUB = 'mhc-outil-github';   // outil : réglages GitHub (jeton vérifié) ou {admin: true} en mode serveur
// Ce navigateur est-il celui de l'administrateur (jeton GitHub accepté par l'outil) ?
// Ce n'est pas une sécurité (rien n'est publié sans le jeton) : juste pour que les joueurs ne voient jamais d'aperçu.
function outilConnecte() { try { const o = JSON.parse(localStorage.getItem(CLE_OUTIL_GITHUB)); return !!(o?.jeton || o?.admin); } catch (e) { return false; } }
function lireBrouillon() { try { return JSON.parse(localStorage.getItem(CLE_BROUILLON)) || {}; } catch (e) { return {}; } }
function appliquerBrouillon(perso, brouillon) {
  const r = {...perso};
  for (const [id, e] of Object.entries(brouillon)) { if (e === null) delete r[id]; else r[id] = e; }
  return r;
}

// ── rendu d'une carte ───────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const initiales = nom => nom.split(/[\s-]+/).filter(Boolean).map(m => m[0]).slice(0, 2).join('').toUpperCase();
// poste principal sur la carte (« + » s'il en a d'autres) ; nomsPostes : la liste complète
const posteAffiche = c => c.postes?.length ? c.postes[0] + (c.postes.length > 1 ? '+' : '') : c.poste || 'JDC';
const nomsPostes = c => c.postes?.length ? c.postes.map(p => POSTE_NOM[p]).join(', ') : 'Joueur(se) de champ';

function silhouette(r) {
  const f = r === 'ultime' ? 'rgba(255,210,87,.16)' : 'rgba(0,0,0,.13)';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="34" r="17" fill="${f}"/><path d="M18 100c0-22 14-36 32-36s32 14 32 36z" fill="${f}"/></svg>`;
}

// c : carte affichée (voir vueExemplaire) ; o : {cache, cls, note (selon le poste occupé), nouveau, qty, doublon (prix de vente)}
// Carte en blason : note + palier + poste en haut à gauche, photo à droite, nom, 6 stats en ligne,
// puis numéro de maillot, logo du club et équipe (style dans style.css, « carte »)
function carteHTML(c, o = {}) {
  if (o.cache) return `<div class="card locked lr-${c.rarete}" data-id="${c.id}"><div class="c-top"><b class="c-ovr">?</b><i class="c-sep"></i><span class="c-pos">${posteAffiche(c)}</span></div>
    <div class="c-face">${silhouette()}</div><div class="c-name">${esc(c.nom)}</div></div>`;
  const note = o.note ?? c.ovr;
  const visage = c.photo ? `<img class="c-photo" src="${esc(c.photo)}" alt="" loading="lazy">`
    : `<div class="c-face">${silhouette(c.rarete)}</div><div class="c-mono">${initiales(c.nom)}</div>`;
  const pal = c.legende ? 'Légende' : R_LABEL[c.rarete] || '';
  return `<div class="card r-${c.rarete}${c.legende ? ' legende' : ''}${o.cls ? ' ' + o.cls : ''}" data-id="${c.id}" role="img" aria-label="${esc(c.nom)}, ${c.equipe}, ${posteAffiche(c)}, ${pal} ${note}">
    <i class="c-eclat"></i>${c.legende ? '<i class="c-holo"></i><i class="c-couronne" aria-hidden="true">♛</i>' : ''}${visage}
    <div class="c-top"><b class="c-ovr">${note}</b><span class="c-pal">${pal}</span><i class="c-sep"></i><span class="c-pos">${posteAffiche(c)}</span></div>
    <div class="c-name">${esc(c.nom)}</div>
    <div class="c-stats">${statsDu(c.poste).map(([k, l]) => `<span><small>${l}</small><b>${c.s[k]}</b></span>`).join('')}</div>
    <div class="c-bas"><span class="c-num">${c.numero != null ? 'N°' + c.numero : 'N°–'}</span><img class="c-logo" src="assets/logo.png" alt=""><span class="c-eq">${c.equipe}</span></div>
    ${o.nouveau ? '<span class="c-new">NOUVEAU</span>' : ''}${o.qty > 1 ? `<span class="qty">×${o.qty}</span>` : ''}
    ${o.doublon ? `<span class="c-dup">Doublon · ${o.doublon} pièces</span>` : ''}</div>`;
}
