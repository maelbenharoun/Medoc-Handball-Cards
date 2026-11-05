'use strict';
/* Médoc Hand Cards — jeu de packs façon Ultimate Team avec les cartes de medochandballstats.com
   Ce fichier : l'affichage (vues #boutique, #club, #equipe, #echanges, connexion, ouverture des packs).
   Les cartes (stats, notes, rendu) sont dans cartes.js, partagé avec l'outil de gestion admin.html ;
   le compte du joueur dans compte.js (sur le téléphone) ou serveur.js (serveur Supabase, voir docs/SERVEUR.md). */

// Mon 7 : positions sur le demi-terrain (x, y en %) ; GB réservé aux gardien(ne)s, les autres postes aux joueurs de champ
const MALUS_HORS_POSTE = 5;   // points perdus par un joueur aligné à un autre poste que le sien
const POSTES = [
  {id: 'AG', x: 12, y: 60}, {id: 'ARG', x: 27, y: 33}, {id: 'DC', x: 50, y: 18},
  {id: 'ARD', x: 73, y: 33}, {id: 'AD', x: 88, y: 60}, {id: 'PIV', x: 50, y: 57}, {id: 'GB', x: 50, y: 85, gb: true},
];

// ── état ────────────────────────────────────────────────────────────────────────
let CARTES = [], PAR_ID = {}, MAJ = '';
const S = () => Compte.etat;   // état du joueur, en lecture seule ici : les changements passent par Compte
let filtre = 'tous', occupe = false;

const $ = s => document.querySelector(s);
const nb = n => n.toLocaleString('fr-FR');
// Poste du terrain : GB pour les gardien(ne)s, les 6 autres pour les joueurs de champ.
// Hors de son poste, une carte perd MALUS_HORS_POSTE points (sans poste renseigné, elle joue partout sans malus).
const peutJouer = (c, slot) => slot === 'GB' ? c.estGB : !c.estGB;
const horsPoste = (c, slot) => slot !== 'GB' && !!c.poste && c.poste !== slot;
const noteAuPoste = (c, slot) => c.ovr - (horsPoste(c, slot) ? MALUS_HORS_POSTE : 0);
const aligne = slot => { const c = PAR_ID[S().equipe[slot]]; return c && S().possede[c.id] && peutJouer(c, slot) ? c : null; };

let piecesAffichees = null;
function majPieces() {
  const v = S().pieces;
  if (piecesAffichees !== null && v !== piecesAffichees) { const c = $('#coins'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 220); }
  piecesAffichees = v; $('#coinv').textContent = nb(v);
}
// enchaîne une action du compte : une seule à la fois, message en cas de refus, pièces et vue à jour
function action(promesse, suite) {
  occupe = true;
  return promesse.then(r => { occupe = false; majPieces(); return suite ? suite(r) : r; })
    .catch(e => { occupe = false; majPieces(); toast(e.message || 'Action impossible'); });
}
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), Math.max(2200, t.length * 60));   // le temps de lire
}

// ── vues ────────────────────────────────────────────────────────────────────────
const VUES = {boutique: vueBoutique, club: vueClub, equipe: vueEquipe, echanges: vueEchanges, compte: vueCompte};
// onglet demandé dans l'adresse (#club…) ; tout le reste, dont les retours de connexion, mène à la boutique
function vueCourante() {
  const v = location.hash.slice(1);
  if (v === 'echanges' && Compte.mode !== 'serveur') return 'boutique';
  return VUES[v] && v !== 'compte' ? v : 'boutique';
}
function route(garderDefilement) {
  const v = Compte.pret ? vueCourante() : 'compte';   // en ligne : connexion et profil d'abord
  majEntete();
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === v));
  $('#view').innerHTML = VUES[v]();
  if (!garderDefilement) window.scrollTo(0, 0);
}
function majEntete() {
  const serveur = Compte.mode === 'serveur';
  $('#coins').hidden = !Compte.pret;
  $('.tabs').hidden = !Compte.pret;
  $('.tabs [data-tab=echanges]').hidden = !serveur;
  const moi = $('#moi');
  moi.hidden = !(serveur && Compte.pret);
  moi.textContent = (S().pseudo || '?').slice(0, 1).toUpperCase();
  const n = (ECH.liste || []).filter(e => !e.envoye && e.statut === 'propose').length;
  const pastille = $('#pastille'); pastille.hidden = !n; pastille.textContent = n;
  if (Compte.pret) majPieces();
}

const enJeu = () => CARTES.filter(c => c.actif !== false);   // cartes encore tirées dans les packs
function nPossedees() { return CARTES.filter(c => S().possede[c.id]).length; }

function vueBoutique() {
  const bonus = Compte.bonusDisponible();
  const packs = PACKS.map(p => `<button class="pack pk-${p.id}" data-pack="${p.id}" ${S().pieces < p.prix && !Compte.packOffert(p.id) ? 'disabled' : ''}>
      <div class="pack-art"><img src="assets/logo.png" alt=""><span class="pn">${p.nom}</span></div>
      <div class="pack-info"><small>${p.desc}</small>
      <div class="price">${Compte.packOffert(p.id) ? 'Offert' : `<i class="coin"></i>${nb(p.prix)}`}</div></div></button>`).join('');
  return `<h1>Boutique</h1>
    <p class="sub">${enJeu().length} cartes à collectionner : SG1, SG2, SF1 et SF2, saison 2026-2027.</p>
    ${Compte.horsLigne ? '<div class="daily hors"><p><b>Hors ligne</b>Ton club reste consultable. Reviens en ligne pour ouvrir des packs.</p></div>' : ''}
    ${bonus ? `<div class="daily"><p><b>Bonus du jour</b>${nb(REGLES.bonusJour)} pièces t’attendent</p><button class="btn gold" data-act="bonus">Récupérer</button></div>` : ''}
    ${!S().bienvenue ? `<div class="daily"><p><b>Pack de bienvenue</b>Ton premier pack ${esc(PACKS.find(p => p.id === REGLES.packBienvenue)?.nom || '')} est offert</p><button class="btn gold" data-pack="${REGLES.packBienvenue}">Ouvrir</button></div>` : ''}
    <div class="packs">${packs}</div>
    <h2>Ta progression</h2>
    <div class="stats-row"><div class="stat"><b>${nPossedees()}/${enJeu().length}</b><span>cartes</span></div>
    <div class="stat"><b>${S().packs}</b><span>packs ouverts</span></div>
    <div class="stat"><b>${noteEquipe().note || '–'}</b><span>note Mon 7</span></div></div>
    <p class="sub" style="margin-top:18px">Notes sur 99 calculées à partir des 6 stats de chaque carte, selon son poste · stats de medochandballstats.com${MAJ ? ' du ' + esc(MAJ) : ''}.</p>`;
}

function vueClub() {
  const eqs = ['tous', 'SG1', 'SG2', 'SF1', 'SF2'];
  // une carte retirée du jeu n'apparaît plus que chez ceux qui l'ont
  const liste = CARTES.filter(c => (filtre === 'tous' || c.equipe === filtre) && (c.actif !== false || S().possede[c.id]));
  const eu = liste.filter(c => S().possede[c.id]).length;
  const doublons = CARTES.reduce((a, c) => a + Math.max(0, (S().possede[c.id] || 0) - 1) * VENTE[c.rarete], 0);
  return `<h1>Mon club</h1>
    <p class="sub">${eu}/${liste.length} cartes${filtre === 'tous' ? '' : ' en ' + filtre}</p>
    <div class="bar"><i style="width:${liste.length ? 100 * eu / liste.length : 0}%"></i></div>
    <div class="filters" style="margin-top:14px">${eqs.map(e => `<button data-filtre="${e}" class="${filtre === e ? 'on' : ''}">${e === 'tous' ? 'Toutes' : e}</button>`).join('')}</div>
    ${doublons ? `<div class="sellbar"><span>Doublons à vendre</span><button class="btn gold" data-act="vendre"><i class="coin"></i>+${nb(doublons)}</button></div>` : ''}
    <div class="grid">${liste.map(c => carteHTML(c, S().possede[c.id] ? {qty: S().possede[c.id]} : {cache: true})).join('')}</div>`;
}

function noteEquipe() {
  const places = POSTES.filter(p => aligne(p.id));
  if (!places.length) return {note: 0, collectif: 0, n: 0, hors: 0};
  const cs = places.map(p => aligne(p.id));
  const moy = places.reduce((a, p) => a + noteAuPoste(aligne(p.id), p.id), 0) / 7;   // une place vide compte 0
  const hors = places.filter(p => horsPoste(aligne(p.id), p.id)).length;
  const parEq = {}; cs.forEach(c => parEq[c.equipe] = (parEq[c.equipe] || 0) + 1);
  const max = Math.max(...Object.values(parEq));
  const collectif = max >= 7 ? 3 : max >= 5 ? 2 : max >= 3 ? 1 : 0;   // bonus quand on aligne des coéquipier(e)s
  return {note: Math.min(99, Math.round(moy + collectif)), collectif, n: places.length, hors};
}

function vueEquipe() {
  const t = noteEquipe();
  const slots = POSTES.map(p => {
    const c = aligne(p.id), hors = c && horsPoste(c, p.id);
    return `<button class="slot" data-slot="${p.id}" style="left:${p.x}%;top:${p.y}%">${c ? carteHTML(c, {note: noteAuPoste(c, p.id)}) : '<span class="empty">+</span>'}<em${hors ? ' class="hors"' : ''}>${p.id}${hors ? ` −${MALUS_HORS_POSTE}` : ''}</em></button>`;
  }).join('');
  return `<h1>Mon 7</h1>
    <p class="sub">Touche un poste pour aligner une carte de ton club. Hors de son poste, un joueur perd ${MALUS_HORS_POSTE} points ; aligner des coéquipier(e)s de la même équipe donne un bonus collectif.</p>
    <div class="teamnote"><div class="stat"><b>${t.note || '–'}</b><span>note d’équipe</span></div>
    <div class="stat"><b>+${t.collectif}</b><span>collectif</span></div><div class="stat"><b>${t.n}/7</b><span>postes</span></div></div>
    <div class="pitch">${slots}</div>
    ${t.hors ? `<p class="sub warn">${t.hors} joueur${t.hors > 1 ? 's' : ''} hors de son poste (−${MALUS_HORS_POSTE} chacun)</p>` : ''}
    <button class="btn ghost" data-act="auto" style="width:100%">Aligner automatiquement le meilleur 7</button>`;
}

// ── connexion et profil (mode serveur) ──────────────────────────────────────────
let messageCompte = '';
function vueCompte() {
  const msg = messageCompte ? `<div class="daily"><p>${esc(messageCompte)}</p></div>` : '';
  if (Compte.recuperation) return `<h1>Nouveau mot de passe</h1>
    <form class="form" data-form="mdp"><input class="champ" type="password" name="mdp" minlength="8" required autocomplete="new-password" placeholder="Nouveau mot de passe (8 caractères ou plus)">
    <button class="btn gold" type="submit">Enregistrer</button></form>`;
  if (!Compte.connecte) return `<div class="accueil"><img src="assets/logo.png" alt=""><h1>Médoc Hand Cards</h1>
    <p class="sub">Connecte-toi pour ouvrir des packs, construire ton 7 et échanger tes cartes avec les autres joueurs du club.</p></div>${msg}
    <form class="form" data-form="connexion">
      <input class="champ" type="email" name="email" placeholder="E-mail" autocomplete="email" required>
      <input class="champ" type="password" name="mdp" placeholder="Mot de passe (8 caractères ou plus)" autocomplete="current-password" minlength="8" required>
      <button class="btn gold" type="submit" value="connexion">Se connecter</button>
      <button class="btn ghost" type="submit" value="inscription">Créer un compte</button>
      <button class="lien" type="submit" value="oubli" formnovalidate>Mot de passe oublié ?</button>
    </form>
    <div class="ou"><span>ou</span></div>
    <button class="btn ghost large" data-act="google">Continuer avec Google</button>
    <p class="sub petit centre"><a href="confidentialite.html">Données personnelles et confidentialité</a></p>`;
  return `<h1>Ton profil</h1>${msg}
    <p class="sub">Connecté avec ${esc(Compte.email)}. Choisis le pseudo que verront les autres joueurs (pas forcément ton vrai nom).</p>
    <form class="form" data-form="profil">
      <input class="champ" name="pseudo" placeholder="Pseudo (3 à 20 caractères)" minlength="3" maxlength="20" pattern="[A-Za-z0-9À-ÖØ-öø-ÿ_.\\-]{3,20}"
        title="Lettres, chiffres, point, tiret ou tiret bas" required autocapitalize="off" autocomplete="off" spellcheck="false">
      <label class="chk"><input type="checkbox" name="accord" required> J’ai 15 ans ou plus, ou mes parents sont d’accord pour que je crée ce compte</label>
      <p class="sub petit">Ton e-mail reste privé. <a href="confidentialite.html">Ce que le jeu garde et pourquoi</a></p>
      <button class="btn gold" type="submit">C’est parti</button>
    </form>
    <button class="lien" data-act="deconnexion">Utiliser un autre compte</button>`;
}
function fenetreCompte() {
  ouvrirOverlay(`<div class="sheet"><h3>${esc(S().pseudo)}</h3><p class="sub">${esc(Compte.email)}</p>
    <button class="btn ghost" data-act="deconnexion">Se déconnecter</button>
    <a class="btn ghost" href="confidentialite.html">Données personnelles</a>
    <button class="btn ghost danger" data-act="supprimer">Supprimer mon compte</button>
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}
function supprimerCompte() {
  const p = prompt(`Supprimer définitivement ton compte, tes cartes et tes échanges ?\nPour confirmer, écris ton pseudo : ${S().pseudo}`);
  if (p === null) return;
  if (p.trim() !== S().pseudo) return toast('Pseudo différent : rien n’a été supprimé');
  action(Compte.supprimerCompte(), () => { fermerOverlay(); toast('Ton compte a été supprimé'); });
}

// ── échanges (mode serveur) ─────────────────────────────────────────────────────
const ECH = {liste: null, chargement: false, recherche: '', joueurs: [], compo: null, t: 0};
// petites cartes d'un échange, avec les noms (illisibles sur une carte de 44 px)
const mini = ids => { const cs = ids.map(id => PAR_ID[id]).filter(Boolean);
  return `<div class="mini">${cs.map(c => carteHTML(c)).join('')}</div><p class="noms">${cs.map(c => `${esc(c.nom)} <b>${c.ovr}</b>`).join(' · ')}</p>`; };
function chargerEchanges() {
  if (ECH.chargement) return;
  ECH.chargement = true;
  Compte.echanges().then(l => { ECH.liste = l; }).catch(e => { ECH.liste = ECH.liste || []; toast(e.message); })
    .finally(() => { ECH.chargement = false; majEntete(); if (Compte.pret && vueCourante() === 'echanges' && $('#overlay').hidden) route(true); });
}
function vueEchanges() {
  if (!ECH.liste) chargerEchanges();
  const L = ECH.liste || [];
  const recues = L.filter(e => !e.envoye && e.statut === 'propose'), envoyees = L.filter(e => e.envoye && e.statut === 'propose');
  const fini = L.filter(e => e.statut !== 'propose').slice(0, 10);
  return `<h1>Échanges</h1>
    <p class="sub">Échange des cartes avec les autres joueurs : jusqu’à ${REGLES.echangeMaxCartes} de chaque côté, ${REGLES.echangesParJour || 10} propositions par jour.</p>
    <input class="champ" type="search" placeholder="Chercher le pseudo d’un joueur" value="${esc(ECH.recherche)}" data-cherche autocapitalize="off" autocomplete="off" spellcheck="false">
    <div class="joueurs" id="joueurs">${joueursHTML()}</div>
    ${!ECH.liste ? '<p class="sub">Chargement…</p>' : `
    <h2>Reçues</h2>${recues.length ? recues.map(echangeHTML).join('') : '<p class="sub">Aucune proposition en attente.</p>'}
    <h2>Envoyées</h2>${envoyees.length ? envoyees.map(echangeHTML).join('') : '<p class="sub">Aucune proposition en attente.</p>'}
    ${fini.length ? `<h2>Historique</h2>${fini.map(echangeHTML).join('')}` : ''}`}`;
}
function joueursHTML() {
  if (ECH.recherche.trim().length < 2) return '';
  if (!ECH.joueurs.length) return '<p class="sub petit">Aucun joueur trouvé.</p>';
  return ECH.joueurs.map(p => `<button class="joueur" data-joueur="${esc(p)}"><b>${esc(p)}</b><span>Proposer un échange ›</span></button>`).join('');
}
function majJoueurs() { const el = $('#joueurs'); if (el) el.innerHTML = joueursHTML(); }
function echangeHTML(e) {
  const recois = e.envoye ? e.demande : e.offre, donnes = e.envoye ? e.offre : e.demande;
  const fin = {accepte: 'Accepté', refuse: 'Refusé', annule: 'Annulé', expire: 'Expiré'}[e.statut];
  const date = new Date(e.cree_le).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
  const avec = e.avec ? `<b>${esc(e.avec)}</b>` : 'un compte supprimé';
  return `<div class="ech${fin ? ' fini' : ''}">
    <p class="ech-tete">${e.envoye ? 'Proposé à ' + avec : avec + ' te propose'} · ${date}${fin ? ` · <span class="st-${e.statut}">${fin}</span>` : ''}</p>
    <div class="ech-l"><span>Tu reçois</span>${mini(recois)}</div>
    <div class="ech-l"><span>Tu donnes</span>${mini(donnes)}</div>
    ${fin ? '' : e.envoye ? `<div class="ech-btns"><button class="btn ghost petit" data-ech="${e.id}" data-rep="annuler">Annuler</button></div>`
      : `<div class="ech-btns"><button class="btn ghost petit" data-ech="${e.id}" data-rep="refuser">Refuser</button><button class="btn gold petit" data-ech="${e.id}" data-rep="accepter">Accepter</button></div>`}
  </div>`;
}
function repondre(id, rep) {
  const suite = msg => () => { toast(msg); ECH.liste = null; route(true); };
  if (rep === 'accepter') return action(Compte.repondreEchange(id, true), suite('Échange fait : les nouvelles cartes sont dans ton club'));
  if (rep === 'refuser') return action(Compte.repondreEchange(id, false), suite('Échange refusé'));
  if (rep === 'annuler') return action(Compte.annulerEchange(id), suite('Proposition annulée'));
}

// Composer une proposition : mes cartes à donner, les siennes à recevoir
// (on garde toujours un exemplaire des cartes alignées dans Mon 7 : le serveur l'exige aussi)
const dispo = (club, id) => (club.possede[id] || 0) - (Object.values(club.equipe || {}).includes(id) ? 1 : 0);
function composer(pseudo) {
  action(Compte.clubDe(pseudo), club => { ECH.compo = {pseudo: club.pseudo, club, offre: [], demande: [], cote: 'moi'}; dessinerCompo(); });
}
function ajouter(cote, id) {
  const k = ECH.compo, club = cote === 'offre' ? {possede: S().possede, equipe: S().equipe} : k.club;
  if (k[cote].length >= REGLES.echangeMaxCartes) return toast(`${REGLES.echangeMaxCartes} cartes au plus de chaque côté`);
  if (k[cote].filter(x => x === id).length >= dispo(club, id)) return toast(cote === 'offre' ? 'Tu n’as pas d’autre exemplaire à donner' : 'Il n’en a pas d’autre');
  k[cote].push(id); dessinerCompo();
}
function dessinerCompo() {
  const k = ECH.compo, max = REGLES.echangeMaxCartes, moi = {possede: S().possede, equipe: S().equipe};
  const choix = (cote, label) => `<div class="ech-l"><span>${label} (${k[cote].length}/${max})</span><div class="mini sel">${
    k[cote].map((id, i) => `<button data-retire="${cote}:${i}" aria-label="Retirer ${esc(PAR_ID[id].nom)}">${carteHTML(PAR_ID[id])}</button>`).join('')
    || '<em>Touche des cartes ci-dessous</em>'}</div>${k[cote].length ? `<p class="noms">${k[cote].map(id => esc(PAR_ID[id].nom)).join(' · ')} · touche une carte pour la retirer</p>` : ''}</div>`;
  const club = k.cote === 'moi' ? moi : k.club, attr = k.cote === 'moi' ? 'donne' : 'recoit', cote = k.cote === 'moi' ? 'offre' : 'demande';
  // mes doublons d'abord ; chez lui, d'abord les cartes que je n'ai pas
  const cartes = CARTES.filter(c => dispo(club, c.id) > 0).sort((a, b) => k.cote === 'moi'
    ? (moi.possede[b.id] > 1) - (moi.possede[a.id] > 1) || b.ovr - a.ovr
    : !moi.possede[b.id] - !moi.possede[a.id] || b.ovr - a.ovr);
  const grille = cartes.map(c => {
    const reste = dispo(club, c.id) - k[cote].filter(x => x === c.id).length;
    const neuve = k.cote === 'lui' && !moi.possede[c.id];
    return `<button class="pc${reste <= 0 ? ' epuise' : ''}" data-${attr}="${c.id}">${carteHTML(c, {qty: reste})}${neuve ? '<span class="neuve">nouvelle</span>' : ''}</button>`;
  }).join('');
  ouvrirOverlay(`<div class="sheet compo"><h3>Échange avec ${esc(k.pseudo)}</h3>
    ${choix('offre', 'Tu donnes')}${choix('demande', 'Tu reçois')}
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button>
      <button class="btn gold" data-act="proposer"${k.offre.length && k.demande.length ? '' : ' disabled'}>Proposer</button></div>
    <div class="filters"><button data-cote="moi" class="${k.cote === 'moi' ? 'on' : ''}">Mes cartes</button><button data-cote="lui" class="${k.cote === 'lui' ? 'on' : ''}">Cartes de ${esc(k.pseudo)}</button></div>
    <div class="pickgrid">${grille || `<p class="sub">${k.cote === 'moi' ? 'Tu n’as pas de carte à donner (garde au moins un exemplaire de ton Mon 7).' : 'Pas de carte disponible.'}</p>`}</div>
  </div>`);
}
function proposer() {
  const k = ECH.compo;
  action(Compte.proposerEchange(k.pseudo, k.offre, k.demande), () => { toast(`Proposition envoyée à ${k.pseudo}`); ECH.compo = null; ECH.liste = null; fermerOverlay(); });
}

// ── overlays ────────────────────────────────────────────────────────────────────
function ouvrirOverlay(html) { const o = $('#overlay'); o.innerHTML = html; o.hidden = false; document.body.style.overflow = 'hidden'; }
function fermerOverlay() { const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; document.body.style.overflow = ''; route(); }

function detail(id) {
  const c = PAR_ID[id], q = S().possede[id] || 0;
  ouvrirOverlay(`<div class="sheet detail">${carteHTML(c)}
    <div class="kv"><div><b>${c.mj}</b><span>matchs</span></div><div><b>${c.buts}</b><span>buts</span></div><div><b>${String(c.bpm).replace('.', ',')}</b><span>buts / match</span></div>
    <div><b>${c.record}</b><span>record</span></div><div><b>${c.tir ?? '–'}${c.tir != null ? ' %' : ''}</b><span>réussite tir</span></div><div><b>${R_LABEL[c.rarete]}</b><span>rareté</span></div></div>
    <p class="sumline">${c.poste ? POSTE_NOM[c.poste] : 'Joueur(se) de champ'} · ${c.recrue ? 'Recrue cette saison · ' : ''}${q > 1 ? `${q} exemplaires` : '1 exemplaire'}</p>
    <div style="display:flex;gap:10px;width:100%">${q > 1 ? `<button class="btn gold" style="flex:1" data-act="vendre1" data-id="${id}">Vendre 1 · +${VENTE[c.rarete]}</button>` : ''}
    <button class="btn ghost" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}

function choisir(poste) {
  const p = POSTES.find(x => x.id === poste);
  const dejaPris = new Set(Object.entries(S().equipe).filter(([k]) => k !== poste).map(([, v]) => v));
  const ok = CARTES.filter(c => S().possede[c.id] && !dejaPris.has(c.id) && peutJouer(c, poste))
    .sort((a, b) => noteAuPoste(b, poste) - noteAuPoste(a, poste));
  ouvrirOverlay(`<div class="sheet"><h3>${poste === 'GB' ? 'Gardien(ne) de but' : 'Poste ' + poste}</h3>
    <div class="picklist">${ok.length ? ok.map(c => `<button class="pick" data-choix="${c.id}" data-poste="${poste}">${carteHTML(c, {note: noteAuPoste(c, poste)})}<div><b>${esc(c.nom)}</b><small>${noteAuPoste(c, poste)} · ${posteAffiche(c)} · ${c.equipe}${horsPoste(c, poste) ? ` · hors poste −${MALUS_HORS_POSTE}` : ''}</small></div></button>`).join('')
      : `<p class="sub">Aucune carte disponible pour ce poste. Ouvre des packs !</p>`}</div>
    <div style="display:flex;gap:10px">${S().equipe[poste] ? `<button class="btn ghost" style="flex:1" data-act="retirer" data-poste="${poste}">Retirer</button>` : ''}
    <button class="btn" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}

function autoEquipe() {
  const mine = CARTES.filter(c => S().possede[c.id]);
  const equipe = {};
  const gb = mine.filter(c => c.estGB).sort((a, b) => b.ovr - a.ovr)[0];
  if (gb) equipe.GB = gb.id;
  // meilleure répartition des joueurs de champ sur les 6 postes, malus hors poste compris :
  // pour chaque ensemble de postes occupés (masque de bits), on garde le meilleur total trouvé
  const slots = POSTES.filter(x => !x.gb).map(x => x.id);
  let meilleurs = new Map([[0, {total: 0, choix: {}}]]);
  for (const c of mine.filter(c => !c.estGB)) {
    const suite = new Map(meilleurs);
    for (const [masque, e] of meilleurs) slots.forEach((slot, i) => {
      if (masque & (1 << i)) return;
      const m = masque | (1 << i), total = e.total + noteAuPoste(c, slot);
      if (!(suite.get(m)?.total >= total)) suite.set(m, {total, choix: {...e.choix, [slot]: c.id}});
    });
    meilleurs = suite;
  }
  Object.assign(equipe, [...meilleurs.values()].reduce((a, e) => e.total > a.total ? e : a).choix);
  action(Compte.alignerEquipe(equipe), route);
}

// ── ouverture de pack ───────────────────────────────────────────────────────────
function ouvrirPack(id) {
  if (occupe) return;
  const p = PACKS.find(x => x.id === id);
  action(Compte.ouvrirPack(id), ({ids, nouveaux}) => {
    ouvrirPack.res = ids.filter(i => PAR_ID[i]).map(i => ({c: PAR_ID[i], nouveau: nouveaux.includes(i)}));
    ouvrirOverlay(`<div class="opening"><button class="bigpack pk-${p.id}" data-act="dechirer" aria-label="Ouvrir le pack">
        <div class="pack-art" style="position:absolute;inset:0"><img src="assets/logo.png" alt=""><span class="pn">${p.nom}</span></div></button>
      <p class="tap">Touche le pack pour l’ouvrir</p></div>`);
  });
}

function dechirer() {
  const res = ouvrirPack.res, top = res[0].c;
  $('.bigpack').classList.add('burst'); $('.tap').remove();
  vibrer(30);
  setTimeout(() => (top.rarete === 'elite' || top.ovr >= 85) ? walkout(top, res) : montrer(res), 520);
}

// Révélation façon « walkout » pour les grosses cartes : équipe → poste → carte
function walkout(c, res) {
  const etapes = [`<div class="clue"><small>ÉQUIPE</small>${c.equipe}</div>`, `<div class="clue"><small>POSTE</small>${posteAffiche(c)}</div>`,
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
    carteHTML(c, {nouveau, doublon: !nouveau && VENTE[c.rarete], cls: i === 0 ? 'hero' : ''}).replace('class="card', `style="animation-delay:${i * 140}ms" class="card`)).join('');
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
  const t = e.target.closest('[data-act],[data-pack],[data-filtre],[data-slot],[data-choix],[data-joueur],[data-donne],[data-recoit],[data-retire],[data-cote],[data-ech],.grid .card');
  if (!t) { if (e.target.id === 'overlay' && !$('.opening') && !$('.walk')) fermerOverlay(); return; }
  const a = t.dataset.act;
  if (t.dataset.pack) return ouvrirPack(t.dataset.pack);
  if (t.dataset.filtre) { filtre = t.dataset.filtre; return route(); }
  if (t.dataset.slot) return choisir(t.dataset.slot);
  if (occupe) return;
  if (t.dataset.choix) return action(Compte.aligner(t.dataset.poste, t.dataset.choix), fermerOverlay);
  if (t.classList.contains('card') && !t.classList.contains('locked')) return detail(t.dataset.id);
  if (a === 'dechirer') return dechirer();
  if (a === 'fermer') return fermerOverlay();
  if (a === 'retirer') return action(Compte.aligner(t.dataset.poste, null), fermerOverlay);
  if (a === 'auto') return autoEquipe();
  if (a === 'bonus') return action(Compte.recupererBonus(), ({gain}) => { toast(`+${nb(gain)} pièces`); route(); });
  if (a === 'vendre') return action(Compte.vendreDoublons(), ({gain}) => { toast(`Doublons vendus : +${nb(gain)}`); route(); });
  if (a === 'vendre1') { const id = t.dataset.id; return action(Compte.vendre(id), () => detail(id)); }
  if (a === 'moi') return fenetreCompte();
  if (a === 'google') return action(Compte.google());
  if (a === 'deconnexion') return action(Compte.deconnexion(), () => { fermerOverlay(); toast('Déconnecté'); });
  if (a === 'supprimer') return supprimerCompte();
  // échanges
  if (t.dataset.joueur) return composer(t.dataset.joueur);
  if (t.dataset.donne) return ajouter('offre', t.dataset.donne);
  if (t.dataset.recoit) return ajouter('demande', t.dataset.recoit);
  if (t.dataset.retire) { const [cote, i] = t.dataset.retire.split(':'); ECH.compo[cote].splice(+i, 1); return dessinerCompo(); }
  if (t.dataset.cote) { ECH.compo.cote = t.dataset.cote; return dessinerCompo(); }
  if (a === 'proposer') return proposer();
  if (t.dataset.ech) return repondre(t.dataset.ech, t.dataset.rep);
});
// formulaires de connexion et de profil
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  if (occupe) return;
  const d = Object.fromEntries(new FormData(f)), quoi = e.submitter?.value || f.dataset.form;
  if (quoi === 'oubli') {
    if (!/^\S+@\S+\.\S+$/.test(d.email || '')) return toast('Écris d’abord ton e-mail, puis touche « Mot de passe oublié »');
    return action(Compte.oubli(d.email), () => { messageCompte = 'Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient d’être envoyé. Pense à regarder dans les spams.'; route(); });
  }
  if (quoi === 'connexion') return action(Compte.connexion(d.email, d.mdp), () => { messageCompte = ''; route(); });
  if (quoi === 'inscription') return action(Compte.inscription(d.email, d.mdp), r => {
    messageCompte = r.confirmer ? 'Compte créé ! Clique sur le lien reçu par e-mail pour confirmer ton adresse, puis reviens ici (pense aux spams).' : '';
    route();
  });
  if (quoi === 'mdp') return action(Compte.nouveauMotDePasse(d.mdp), () => { toast('Mot de passe changé'); route(); });
  if (quoi === 'profil') return action(Compte.creerProfil(d.pseudo, !!d.accord), () => { location.hash = '#boutique'; route(); });
});
// recherche d'un joueur pour échanger (après une petite pause dans la frappe)
document.addEventListener('input', e => {
  if (e.target.dataset.cherche === undefined) return;
  ECH.recherche = e.target.value;
  clearTimeout(ECH.t);
  ECH.t = setTimeout(() => {
    const q = ECH.recherche.trim();
    if (q.length < 2) { ECH.joueurs = []; return majJoueurs(); }
    Compte.chercherJoueurs(q).then(l => { ECH.joueurs = l; majJoueurs(); }).catch(er => toast(er.message));
  }, 300);
});
window.addEventListener('hashchange', route);
// le réseau revient : on recharge pour se reconnecter au serveur (hors ligne, rien n'est en cours)
window.addEventListener('online', () => { if (Compte.horsLigne && $('#overlay').hidden) location.reload(); });
// Accès discret à l'outil de gestion des cartes : toucher 5 fois le logo
$('.brand').addEventListener('click', () => {
  const t = Date.now(); if (t - (route.tapT || 0) > 1500) route.taps = 0; route.tapT = t;
  if (++route.taps >= 5) location.href = 'admin.html';
});

// ── démarrage ───────────────────────────────────────────────────────────────────
Compte.surChangement(() => { ECH.liste = null; if ($('#overlay').hidden) route(); else majEntete(); });
Compte.demarrer().then(info => {
  CARTES = info.cartes; CARTES.forEach(c => PAR_ID[c.id] = c);
  MAJ = info.maj ? new Date(info.maj).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : '';
  route();
  if (info.erreurLien) toast('Ce lien a expiré ou a déjà servi : recommence');
  else if (info.confirme) toast('Adresse confirmée, bienvenue !');
  else if (info.horsLigne) toast('Hors ligne : ton club reste consultable');
  else if (info.apercu) toast('Aperçu avec les modifications non publiées de l’outil');
  if (Compte.mode === 'serveur' && Compte.pret && !Compte.horsLigne) chargerEchanges();   // pour la pastille de l'onglet
}).catch(e => {
  console.error(e);
  $('#view').innerHTML = '<h1>Oups</h1><p class="sub">Impossible de charger les cartes. Vérifie ta connexion et recharge la page.</p>';
});

// En ligne (https) : toujours. En local : seulement avec ?sw dans l'adresse, pour tester le hors-ligne
// sans que le cache gêne pendant qu'on modifie les fichiers.
if ('serviceWorker' in navigator && window.isSecureContext && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw')))
  navigator.serviceWorker.register('sw.js');
