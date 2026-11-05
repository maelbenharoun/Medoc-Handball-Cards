'use strict';
/* Médoc Hand Cards — jeu de packs façon Ultimate Team avec les cartes de medochandballstats.com
   Tout tient dans ce fichier : données (data/cartes.json), sauvegarde (localStorage), vues (#boutique, #club, #equipe). */

// ── réglages du jeu ─────────────────────────────────────────────────────────────
const RARETES = ['bronze', 'argent', 'or', 'elite'];
const R_LABEL = {bronze: 'Bronze', argent: 'Argent', or: 'Or', elite: 'Élite'};
const VENTE = {bronze: 50, argent: 150, or: 400, elite: 1200};   // pièces pour un doublon
const DEPART = 3000;                                               // pièces au premier lancement
const BONUS_JOUR = 1500;

// poids = chances relatives de chaque rareté pour une carte ; garanti = rareté minimale de la 1re carte
const PACKS = [
  {id: 'bronze', nom: 'Bronze', prix: 500, n: 5, poids: {bronze: 70, argent: 25, or: 5, elite: .5}, desc: '5 cartes, surtout bronze'},
  {id: 'argent', nom: 'Argent', prix: 1500, n: 5, poids: {bronze: 25, argent: 55, or: 17, elite: 3}, garanti: 'argent', desc: '5 cartes, 1 argent ou mieux garantie'},
  {id: 'or', nom: 'Or', prix: 3500, n: 5, poids: {bronze: 8, argent: 42, or: 42, elite: 8}, garanti: 'or', desc: '5 cartes, 1 or ou mieux garantie'},
  {id: 'elite', nom: 'Élite', prix: 9000, n: 3, poids: {bronze: 0, argent: 0, or: 70, elite: 30}, garanti: 'elite', desc: '3 cartes or, 1 élite garantie'},
];

// Mon 7 : positions sur le demi-terrain (x, y en %) ; GB réservé aux gardien(ne)s
const POSTES = [
  {id: 'AG', x: 12, y: 60}, {id: 'ARG', x: 27, y: 33}, {id: 'DC', x: 50, y: 18},
  {id: 'ARD', x: 73, y: 33}, {id: 'AD', x: 88, y: 60}, {id: 'PIV', x: 50, y: 57}, {id: 'GB', x: 50, y: 85, gb: true},
];

// ── état ────────────────────────────────────────────────────────────────────────
const CLE = 'mhc-v1';
let CARTES = [], PAR_ID = {}, MAJ = '';
let S = charger();
let filtre = 'tous';

function charger() {
  try { const s = JSON.parse(localStorage.getItem(CLE)); if (s && s.v === 1) return s; } catch (e) {}
  return {v: 1, pieces: DEPART, possede: {}, equipe: {}, dernierBonus: '', packs: 0, bienvenue: false};
}
function sauver() { try { localStorage.setItem(CLE, JSON.stringify(S)); } catch (e) {} }

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const nb = n => n.toLocaleString('fr-FR');
const aujourdhui = () => new Date().toLocaleDateString('fr-CA');
const rang = r => RARETES.indexOf(r);

function majPieces(delta) {
  if (delta) { S.pieces += delta; sauver(); const c = $('#coins'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 220); }
  $('#coinv').textContent = nb(S.pieces);
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }

// ── carte ───────────────────────────────────────────────────────────────────────
const initiales = nom => nom.split(/[\s-]+/).filter(Boolean).map(m => m[0]).slice(0, 2).join('').toUpperCase();
function statsCarte(c) {
  if (c.poste === 'GB') return [[c.gb, 'GB'], [String(c.arr).replace('.', ','), 'ARR']];
  const s = [[c.att, 'ATT'], [c.def, 'DÉF'], [c.tir ?? '–', 'TIR']];
  if (c.poste === 'JDC·GB') s[2] = [c.gb, 'GB'];
  return s;
}
function silhouette(r) {
  const f = r === 'elite' ? 'rgba(255,210,87,.16)' : 'rgba(0,0,0,.13)';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="34" r="17" fill="${f}"/><path d="M18 100c0-22 14-36 32-36s32 14 32 36z" fill="${f}"/></svg>`;
}
function carteHTML(c, o = {}) {
  if (o.cache) return `<div class="card locked lr-${c.rarete}" data-id="${c.id}"><div class="c-top"><b class="c-ovr">?</b><span class="c-pos">${c.poste}</span></div>
    <div class="c-face">${silhouette()}</div><div class="c-name">${esc(c.nom)}</div><div class="c-line"></div></div>`;
  const st = statsCarte(c);
  return `<div class="card r-${c.rarete}${o.cls ? ' ' + o.cls : ''}" data-id="${c.id}" role="img" aria-label="${esc(c.nom)}, ${c.equipe}, note ${c.ovr}">
    <div class="c-top"><b class="c-ovr">${c.ovr}</b><span class="c-pos">${c.poste}</span><span class="c-eq">${c.equipe}</span><img class="c-logo" src="assets/logo.png" alt=""></div>
    <div class="c-face">${silhouette(c.rarete)}</div><div class="c-mono">${initiales(c.nom)}</div>
    <div class="c-name">${esc(c.nom)}</div><div class="c-line"></div>
    <div class="c-stats">${st.map(([v, l]) => `<span><b>${v}</b>${l}</span>`).join('')}</div>
    ${o.nouveau ? '<span class="c-new">NOUVEAU</span>' : ''}${o.qty > 1 ? `<span class="qty">×${o.qty}</span>` : ''}
    ${o.doublon ? `<span class="c-dup">Doublon · ${VENTE[c.rarete]} pièces</span>` : ''}</div>`;
}

// ── tirage ──────────────────────────────────────────────────────────────────────
function tirerRarete(poids, min) {
  const ok = RARETES.filter(r => rang(r) >= rang(min || 'bronze') && poids[r] > 0 && CARTES.some(c => c.rarete === r));
  const tot = ok.reduce((a, r) => a + poids[r], 0);
  let x = Math.random() * tot;
  for (const r of ok) { x -= poids[r]; if (x <= 0) return r; }
  return ok[ok.length - 1] || 'bronze';
}
function tirerPack(p) {
  const pris = new Set(), res = [];
  for (let i = 0; i < p.n; i++) {
    const r = tirerRarete(p.poids, i === 0 ? p.garanti : null);
    let pool = CARTES.filter(c => c.rarete === r && !pris.has(c.id));
    if (!pool.length) pool = CARTES.filter(c => !pris.has(c.id));
    const c = pool[Math.floor(Math.random() * pool.length)];
    pris.add(c.id); res.push(c);
  }
  return res.sort((a, b) => b.ovr - a.ovr);
}

// ── vues ────────────────────────────────────────────────────────────────────────
const VUES = {boutique: vueBoutique, club: vueClub, equipe: vueEquipe};
function route() {
  const v = (location.hash.slice(1) || 'boutique');
  const f = VUES[v] || vueBoutique;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === v));
  $('#view').innerHTML = f();
  window.scrollTo(0, 0);
}

function nPossedees() { return CARTES.filter(c => S.possede[c.id]).length; }

function vueBoutique() {
  const bonus = S.dernierBonus !== aujourdhui();
  const packs = PACKS.map(p => `<button class="pack pk-${p.id}" data-pack="${p.id}" ${S.pieces < p.prix && !(p.id === 'or' && !S.bienvenue) ? 'disabled' : ''}>
      <div class="pack-art"><img src="assets/logo.png" alt=""><span class="pn">${p.nom}</span></div>
      <div class="pack-info"><small>${p.desc}</small>
      <div class="price">${p.id === 'or' && !S.bienvenue ? 'Offert' : `<i class="coin"></i>${nb(p.prix)}`}</div></div></button>`).join('');
  return `<h1>Boutique</h1>
    <p class="sub">${CARTES.length} cartes à collectionner : SG1, SG2, SF1 et SF2, saison 2026-2027.</p>
    ${bonus ? `<div class="daily"><p><b>Bonus du jour</b>${nb(BONUS_JOUR)} pièces t’attendent</p><button class="btn gold" data-act="bonus">Récupérer</button></div>` : ''}
    ${!S.bienvenue ? `<div class="daily"><p><b>Pack de bienvenue</b>Ton premier pack Or est offert</p><button class="btn gold" data-pack="or">Ouvrir</button></div>` : ''}
    <div class="packs">${packs}</div>
    <h2>Ta progression</h2>
    <div class="stats-row"><div class="stat"><b>${nPossedees()}/${CARTES.length}</b><span>cartes</span></div>
    <div class="stat"><b>${S.packs}</b><span>packs ouverts</span></div>
    <div class="stat"><b>${noteEquipe().note || '–'}</b><span>note Mon 7</span></div></div>
    <p class="sub" style="margin-top:18px">Notes sur 99 calculées avec la formule de medochandballstats.com · cartes du ${esc(MAJ)}.</p>`;
}

function vueClub() {
  const eqs = ['tous', 'SG1', 'SG2', 'SF1', 'SF2'];
  const liste = CARTES.filter(c => filtre === 'tous' || c.equipe === filtre);
  const eu = liste.filter(c => S.possede[c.id]).length;
  const doublons = CARTES.reduce((a, c) => a + Math.max(0, (S.possede[c.id] || 0) - 1) * VENTE[c.rarete], 0);
  return `<h1>Mon club</h1>
    <p class="sub">${eu}/${liste.length} cartes${filtre === 'tous' ? '' : ' en ' + filtre}</p>
    <div class="bar"><i style="width:${liste.length ? 100 * eu / liste.length : 0}%"></i></div>
    <div class="filters" style="margin-top:14px">${eqs.map(e => `<button data-filtre="${e}" class="${filtre === e ? 'on' : ''}">${e === 'tous' ? 'Toutes' : e}</button>`).join('')}</div>
    ${doublons ? `<div class="sellbar"><span>Doublons à vendre</span><button class="btn gold" data-act="vendre"><i class="coin"></i>+${nb(doublons)}</button></div>` : ''}
    <div class="grid">${liste.map(c => carteHTML(c, S.possede[c.id] ? {qty: S.possede[c.id]} : {cache: true})).join('')}</div>`;
}

function noteEquipe() {
  const ids = POSTES.map(p => S.equipe[p.id]).filter(id => id && PAR_ID[id] && S.possede[id]);
  if (!ids.length) return {note: 0, collectif: 0, n: 0};
  const cs = ids.map(id => PAR_ID[id]);
  const moy = cs.reduce((a, c) => a + c.ovr, 0) / 7;   // une place vide compte 0
  const parEq = {}; cs.forEach(c => parEq[c.equipe] = (parEq[c.equipe] || 0) + 1);
  const max = Math.max(...Object.values(parEq));
  const collectif = max >= 7 ? 3 : max >= 5 ? 2 : max >= 3 ? 1 : 0;   // bonus quand on aligne des coéquipier(e)s
  return {note: Math.min(99, Math.round(moy + collectif)), collectif, n: ids.length};
}

function vueEquipe() {
  const t = noteEquipe();
  const slots = POSTES.map(p => {
    const c = S.possede[S.equipe[p.id]] && PAR_ID[S.equipe[p.id]];
    return `<button class="slot" data-slot="${p.id}" style="left:${p.x}%;top:${p.y}%">${c ? carteHTML(c) : '<span class="empty">+</span>'}<em>${p.id}</em></button>`;
  }).join('');
  return `<h1>Mon 7</h1>
    <p class="sub">Touche un poste pour aligner une carte de ton club. Aligner des coéquipier(e)s de la même équipe donne un bonus collectif.</p>
    <div class="teamnote"><div class="stat"><b>${t.note || '–'}</b><span>note d’équipe</span></div>
    <div class="stat"><b>+${t.collectif}</b><span>collectif</span></div><div class="stat"><b>${t.n}/7</b><span>postes</span></div></div>
    <div class="pitch">${slots}</div>
    <button class="btn ghost" data-act="auto" style="width:100%">Aligner automatiquement le meilleur 7</button>`;
}

// ── overlays ────────────────────────────────────────────────────────────────────
function ouvrirOverlay(html) { const o = $('#overlay'); o.innerHTML = html; o.hidden = false; document.body.style.overflow = 'hidden'; }
function fermerOverlay() { const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; document.body.style.overflow = ''; route(); }

function detail(id) {
  const c = PAR_ID[id], q = S.possede[id] || 0;
  ouvrirOverlay(`<div class="sheet detail">${carteHTML(c)}
    <div class="kv"><div><b>${c.mj}</b><span>matchs</span></div><div><b>${c.buts}</b><span>buts</span></div><div><b>${String(c.bpm).replace('.', ',')}</b><span>buts / match</span></div>
    <div><b>${c.record}</b><span>record</span></div><div><b>${c.tir ?? '–'}${c.tir != null ? ' %' : ''}</b><span>réussite tir</span></div><div><b>${R_LABEL[c.rarete]}</b><span>rareté</span></div></div>
    <p class="sumline">${c.recrue ? 'Recrue cette saison · ' : ''}${q > 1 ? `${q} exemplaires` : '1 exemplaire'}</p>
    <div style="display:flex;gap:10px;width:100%">${q > 1 ? `<button class="btn gold" style="flex:1" data-act="vendre1" data-id="${id}">Vendre 1 · +${VENTE[c.rarete]}</button>` : ''}
    <button class="btn ghost" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}

function choisir(poste) {
  const p = POSTES.find(x => x.id === poste);
  const dejaPris = new Set(Object.entries(S.equipe).filter(([k]) => k !== poste).map(([, v]) => v));
  const ok = CARTES.filter(c => S.possede[c.id] && !dejaPris.has(c.id) && (p.gb ? c.poste !== 'JDC' : c.poste !== 'GB'))
    .sort((a, b) => b.ovr - a.ovr);
  ouvrirOverlay(`<div class="sheet"><h3>${poste === 'GB' ? 'Gardien(ne) de but' : 'Poste ' + poste}</h3>
    <div class="picklist">${ok.length ? ok.map(c => `<button class="pick" data-choix="${c.id}" data-poste="${poste}">${carteHTML(c)}<div><b>${esc(c.nom)}</b><small>${c.ovr} · ${c.poste} · ${c.equipe}</small></div></button>`).join('')
      : `<p class="sub">Aucune carte disponible pour ce poste. Ouvre des packs !</p>`}</div>
    <div style="display:flex;gap:10px">${S.equipe[poste] ? `<button class="btn ghost" style="flex:1" data-act="retirer" data-poste="${poste}">Retirer</button>` : ''}
    <button class="btn" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}

function autoEquipe() {
  const mine = CARTES.filter(c => S.possede[c.id]).sort((a, b) => b.ovr - a.ovr);
  const pris = new Set(); S.equipe = {};
  const gb = mine.find(c => c.poste !== 'JDC'); if (gb) { S.equipe.GB = gb.id; pris.add(gb.id); }
  for (const p of POSTES.filter(x => !x.gb)) { const c = mine.find(c => !pris.has(c.id) && c.poste !== 'GB'); if (c) { S.equipe[p.id] = c.id; pris.add(c.id); } }
  sauver(); route();
}

// ── ouverture de pack ───────────────────────────────────────────────────────────
function ouvrirPack(id) {
  const p = PACKS.find(x => x.id === id);
  const offert = id === 'or' && !S.bienvenue;
  if (!offert && S.pieces < p.prix) return toast('Pas assez de pièces');
  if (offert) S.bienvenue = true; else majPieces(-p.prix);
  const tirage = tirerPack(p);
  // on enregistre tout de suite : fermer l'app pendant l'animation ne fait rien perdre
  const resultat = tirage.map(c => { const nouveau = !S.possede[c.id]; S.possede[c.id] = (S.possede[c.id] || 0) + 1; return {c, nouveau}; });
  S.packs++; sauver();

  ouvrirOverlay(`<div class="opening"><button class="bigpack pk-${p.id}" data-act="dechirer" aria-label="Ouvrir le pack">
      <div class="pack-art" style="position:absolute;inset:0"><img src="assets/logo.png" alt=""><span class="pn">${p.nom}</span></div></button>
    <p class="tap">Touche le pack pour l’ouvrir</p></div>`);
  ouvrirPack.res = resultat;
}

function dechirer() {
  const res = ouvrirPack.res, top = res[0].c;
  $('.bigpack').classList.add('burst'); $('.tap').remove();
  vibrer(30);
  setTimeout(() => (top.rarete === 'elite' || top.ovr >= 85) ? walkout(top, res) : montrer(res), 520);
}

// Révélation façon « walkout » pour les grosses cartes : équipe → poste → carte
function walkout(c, res) {
  const etapes = [`<div class="clue"><small>ÉQUIPE</small>${c.equipe}</div>`, `<div class="clue"><small>POSTE</small>${c.poste}</div>`,
    `<div class="clue"><small>NOTE</small>${c.ovr}</div>`];
  let i = 0;
  const pas = () => {
    if (i < etapes.length) { $('#overlay').innerHTML = `<div class="walk"><div class="rays"></div>${etapes[i]}<p class="tap">Touche pour continuer</p></div>`; vibrer(20); i++; }
    else { $('#overlay').onclick = null; vibrer([40, 60, 80]); montrer(res); }
  };
  pas();
  setTimeout(() => { $('#overlay').onclick = e => { e.stopPropagation(); pas(); }; }, 50);
}

function montrer(res) {
  const nv = res.filter(r => r.nouveau).length;
  // les doublons restent au club : on les vend depuis l'onglet Club
  const html = res.map(({c, nouveau}, i) =>
    carteHTML(c, {nouveau, doublon: !nouveau, cls: i === 0 ? 'hero' : ''}).replace('class="card', `style="animation-delay:${i * 140}ms" class="card`)).join('');
  const nd = res.length - nv;
  ouvrirOverlay(`<div class="sheet" style="align-items:center">
    ${res[0].c.rarete === 'elite' ? '<div class="rays"></div>' : ''}
    <div class="reveal">${html}</div>
    <p class="sumline">${nv ? `<b>${nv} nouvelle${nv > 1 ? 's' : ''}</b> carte${nv > 1 ? 's' : ''}` : 'Pas de nouvelle carte'}${nd ? ` · ${nd} doublon${nd > 1 ? 's' : ''} à vendre dans le Club` : ''}</p>
    <button class="btn" data-act="fermer" style="width:100%">Envoyer au club</button></div>`);
}

function vibrer(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

// ── événements ──────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-pack],[data-filtre],[data-slot],[data-choix],.grid .card');
  if (!t) { if (e.target.id === 'overlay' && !$('.opening') && !$('.walk')) fermerOverlay(); return; }
  const a = t.dataset.act;
  if (t.dataset.pack) return ouvrirPack(t.dataset.pack);
  if (t.dataset.filtre) { filtre = t.dataset.filtre; return route(); }
  if (t.dataset.slot) return choisir(t.dataset.slot);
  if (t.dataset.choix) { S.equipe[t.dataset.poste] = t.dataset.choix; sauver(); return fermerOverlay(); }
  if (t.classList.contains('card') && !t.classList.contains('locked')) return detail(t.dataset.id);
  if (a === 'dechirer') return dechirer();
  if (a === 'fermer') return fermerOverlay();
  if (a === 'retirer') { delete S.equipe[t.dataset.poste]; sauver(); return fermerOverlay(); }
  if (a === 'auto') return autoEquipe();
  if (a === 'bonus') { S.dernierBonus = aujourdhui(); majPieces(BONUS_JOUR); toast(`+${nb(BONUS_JOUR)} pièces`); return route(); }
  if (a === 'vendre') {
    let g = 0; for (const c of CARTES) { const q = S.possede[c.id] || 0; if (q > 1) { g += (q - 1) * VENTE[c.rarete]; S.possede[c.id] = 1; } }
    majPieces(g); toast(`Doublons vendus : +${nb(g)}`); return route();
  }
  if (a === 'vendre1') { const c = PAR_ID[t.dataset.id]; S.possede[c.id]--; majPieces(VENTE[c.rarete]); return detail(c.id); }
});
window.addEventListener('hashchange', route);

// ── démarrage ───────────────────────────────────────────────────────────────────
fetch('data/cartes.json').then(r => r.json()).then(d => {
  CARTES = d.cartes; MAJ = new Date(d.maj).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'});
  CARTES.forEach(c => PAR_ID[c.id] = c);
  majPieces(0); route();
}).catch(() => { $('#view').innerHTML = '<h1>Oups</h1><p class="sub">Impossible de charger les cartes. Vérifie ta connexion et recharge la page.</p>'; });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
