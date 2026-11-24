'use strict';
/* Médoc Hand Cards — jeu de cartes à collectionner avec les joueurs et joueuses du Médoc Handball.
   Ce fichier : l'affichage (onglets Accueil, Club, Équipe, Jouer, Social ; connexion, boosters, matchs).
   Les cartes (paliers, stats, rendu) sont dans cartes.js, partagé avec l'outil admin.html ;
   le compte du joueur dans serveur.js : toutes les règles sont appliquées par le serveur (supabase/schema.sql). */

// Équipe : les joueurs placés en défense devant leur but (en bas), selon le dispositif choisi (demande de Maël) :
// 0-6 : les six sur les 6 m ; 1-5 : cinq sur les 6 m et le demi-centre avancé ; 3-3 : arrières et pivot sur les 6 m,
// ailiers et demi-centre devant, vers 10 m. x, y en mètres : x de −10 (touche gauche) à 10, y depuis notre ligne de but.
const MALUS_HORS_POSTE = 5;   // points perdus par un joueur aligné à un autre poste que le sien (2 avec la carte staff « Coach polyvalent »)
const staffActif = () => S().staff?.actif || null;
const staffVal = id => { const x = staffActif() === id && (S().staff?.liste || []).find(y => y.id === id); return x && x.meilleur ? staffValeur(x) : 0; };
const malusHors = () => staffActif() === 'polyvalent' ? staffVal('polyvalent') : MALUS_HORS_POSTE;
const POSTES = [{id: 'AG'}, {id: 'ARG'}, {id: 'DC'}, {id: 'ARD'}, {id: 'AD'}, {id: 'PIV'}, {id: 'GB', gb: true}];
// Une carte sur le terrain fait 3 m de large (15 % de la largeur) : les places sont écartées d'au moins 3 m en largeur
// ou 4,7 m en profondeur, pour que les cartes ne se chevauchent pas.
const PLACEMENTS = {
  '06': {AG: [-7.9, 2.2], ARG: [-4.75, 5.8], PIV: [-1.65, 6.9], DC: [1.65, 6.9], ARD: [4.75, 5.8], AD: [7.9, 2.2]},
  '15': {AG: [-7.9, 2.2], ARG: [-4.4, 6], PIV: [0, 6.9], ARD: [4.4, 6], AD: [7.9, 2.2], DC: [0, 11.7]},
  '33': {ARG: [-4.6, 5.9], PIV: [0, 6.8], ARD: [4.6, 5.9], AG: [-6.9, 10.8], DC: [0, 11.8], AD: [6.9, 10.8]},
};
// terrain dessiné à l'échelle (rien d'étiré) : jusqu'à 14,8 m de notre but, et la zone de sécurité de 2 m derrière la ligne de but
const TERRAIN_H = 14.8, TERRAIN_B = 2;

// ── état ────────────────────────────────────────────────────────────────────────
let CARTES = [], PAR_ID = {}, MAJ = '';
const S = () => Compte.etat;   // état du joueur, en lecture seule ici : les changements passent par Compte
let filtre = 'tous', filtrePoste = 'tous', occupe = false;

const $ = s => document.querySelector(s);
const nb = n => (n || 0).toLocaleString('fr-FR');
const EX = () => S().exemplaires || [];
const exParId = id => EX().find(e => e.id === id);
const rangEx = (a, b) => RARETES.indexOf(b.palier) - RARETES.indexOf(a.palier) || b.note - a.note || b.xp - a.xp;
const mesEx = carte => EX().filter(e => e.carte === carte).sort(rangEx);
const vue = ex => vueExemplaire(PAR_ID[ex.carte], ex);   // carte affichable d'un exemplaire
const titulaireEx = id => Object.values(S().equipe || {}).includes(id);
const remplacantEx = id => Object.values(S().remplacants || {}).includes(id);
const dansEquipe = id => titulaireEx(id) || remplacantEx(id);   // titulaires et remplaçants : ni vendus, ni échangés, ni donnés
const fusionsPossibles = carte => RARETES.filter(r => palierSuivant(r)
  && EX().filter(e => e.carte === carte && e.palier === r && !e.verrou).length >= (PARAMS.fusion_nombre || 3));
// note de la carte née d'une fusion (demande de Maël : ne plus perdre l'entraînement) : la moitié de l'XP mise dans les cartes
// fusionnées (les moins entraînées, comme le serveur les choisit) passe à la nouvelle, au coût du palier suivant (fusionner, schema.sql)
function noteApresFusion(carte, palier) {
  const n = PARAMS.fusion_nombre || 3, suiv = palierSuivant(palier), xpp = PARAMS.xp_par_point || {};
  const pris = EX().filter(e => e.carte === carte && e.palier === palier && !e.verrou)
    .sort((a, b) => a.note - b.note || a.xp - b.xp || dansEquipe(a.id) - dansEquipe(b.id)).slice(0, n);
  let xp = Math.floor((PARAMS.fusion_report ?? 0) * pris.reduce((t, e) =>
    t + Math.max(0, e.note - PALIER[palier].min) * (xpp[palier] || 100) + (e.xp || 0), 0));
  let note = PALIER[suiv].min;
  const cout = xpp[suiv] || 100;
  while (xp >= cout && note < PALIER[suiv].max) { xp -= cout; note++; }
  return note;
}

// Postes : au but seulement si GB fait partie de ses postes ; sur le terrain s'il a un poste de champ (ou aucun).
// Hors de ses postes, une carte perd MALUS_HORS_POSTE points (sans poste renseigné, elle joue partout sans malus).
const joueChamp = c => !c.postes?.length || c.postes.some(p => p !== 'GB');
const peutJouer = (c, slot) => slot === 'GB' ? !!c.postes?.includes('GB') : joueChamp(c);
const horsPoste = (c, slot) => slot !== 'GB' && !!c.postes?.length && !c.postes.includes(slot);
// comme force_equipe (schema.sql) : capitaine +2 (+5 avec le préparateur mental) ; cartes staff des gardiens, des ailiers, de la base arrière
const bonusStaff = slot => ({gardiens: slot === 'GB', ailiers: ['AG', 'AD'].includes(slot), base: ['ARG', 'DC', 'ARD'].includes(slot)})[staffActif()] ? staffVal(staffActif()) : 0;
// Même calcul, dans le même ordre, que force_equipe : hors poste, puis joueur de la semaine (+3, sans dépasser 99), puis capitaine
// et carte staff (qui peuvent dépasser 99). tests/test_parite.js compare les deux sur des centaines d'équipes : le lancer après
// tout changement ici ou dans force_equipe.
function noteAuPoste(c, slot) {
  let n = c.ovr - (horsPoste(c, slot) ? malusHors() : 0);
  const forme = bonusForme(c.id);
  if (forme && n < 99) n = Math.min(99, n + forme);
  return n + (c.ex?.id && c.ex.id === S().capitaine ? (PARAMS.capitaine_bonus ?? 2) + staffVal('mental') : 0) + bonusStaff(slot);
}
const aligne = slot => {
  const e = exParId(S().equipe?.[slot]);
  if (!e || !PAR_ID[e.carte]) return null;
  const c = vue(e); return peutJouer(c, slot) ? c : null;
};
// le remplaçant d'un poste (demande de Maël : un remplaçant à chaque poste, il entre pendant les matchs)
const remplacant = slot => {
  const e = exParId(S().remplacants?.[slot]);
  if (!e || !PAR_ID[e.carte]) return null;
  const c = vue(e); return peutJouer(c, slot) ? c : null;
};

let piecesAffichees = null;
function majPieces() {
  const v = S().pieces;
  if (piecesAffichees !== null && v !== piecesAffichees) { const c = $('#coins'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 220);
    if (v > piecesAffichees) Son.jouer('piece'); }
  piecesAffichees = v; $('#coinv').textContent = nb(v);
}
// enchaîne une action du compte : une seule à la fois, message en cas de refus, pièces et niveaux à jour
function action(promesse, suite) {
  occupe = true;
  const filet = setTimeout(() => { occupe = false; }, 30000);   // jamais bloqué pour de bon (le serveur abandonne à 25 s)
  return promesse.then(r => { clearTimeout(filet); occupe = false; majPieces(); celebrer(r?.niveaux); return suite ? suite(r) : r; })
    .catch(e => { clearTimeout(filet); occupe = false; majPieces(); Son.jouer('erreur'); toast(e.message || 'Action impossible'); });
}
// Confirmation dans le jeu, à la place de confirm() (retour de Rémi, iPhone, 20 nov. 2026 : des boutons ne marchaient plus « par
// moment » jusqu'au rafraîchissement ; Safari peut bloquer les fenêtres de confirmation d'un site, confirm() renvoie alors « non »
// sans rien afficher). Renvoie une promesse : true si on confirme.
function demander(texte, oui = 'Confirmer') {
  document.querySelector('.dmd')?.remove();
  return new Promise(ok => {
    const el = document.createElement('div'); el.className = 'dmd'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="dmd-b"><p>${esc(texte)}</p><div class="ed-btns"><button class="btn ghost dmd-non">Annuler</button><button class="btn gold dmd-oui">${esc(oui)}</button></div></div>`;
    const fin = v => { el.remove(); ok(v); };
    el.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('.dmd-oui')) fin(true); else if (e.target.closest('.dmd-non') || e.target === el) fin(false); });
    document.body.appendChild(el); el.querySelector('.dmd-oui').focus();
  });
}
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), Math.max(2200, t.length * 60));   // le temps de lire
}
// niveaux de compte gagnés pendant une action : récompenses à annoncer
function celebrer(niveaux) {
  if (!niveaux?.length) return;
  Son.jouer('niveau');
  const n = niveaux[niveaux.length - 1], pieces = niveaux.reduce((t, x) => t + x.pieces, 0);
  const boosters = niveaux.map(x => x.booster === 'or' ? 'booster Or' : 'booster').join(', ');
  setTimeout(() => toast(`Niveau ${n.niveau} ! +${nb(pieces)} pièces, +${boosters}`), 400);
  vibrer([30, 40, 30]);
}

// ── vues ────────────────────────────────────────────────────────────────────────
const VUES = {accueil: vueAccueil, club: vueClub, equipe: vueEquipe, jouer: vueJouer, championnat: vueChampionnat, classe: vueClasse, salon: vueSalon, pieces: vuePieces, defis: vueDefis,
  ligue: vueJouer, pronos: vuePronos,   // la ligue de la semaine est retirée (Maël, 24 nov. 2026) : un vieux lien mène à Jouer
  clubs: vueClubs, albums: vueAlbums, staff: vueStaff,
  social: vueSocial, classement: vueClassement, marche: vueMarche, paris: vueParis, compte: vueCompte};
// sous-pages : l'onglet qui reste allumé, et le retour
const ONGLET = {championnat: 'jouer', classe: 'jouer', salon: 'social', pieces: 'jouer', defis: 'jouer', ligue: 'jouer', pronos: 'social', clubs: 'social', albums: 'club', staff: 'club', classement: 'social', marche: 'social', paris: 'social'};
const retour = (h, l) => `<a class="retour" href="#${h}">‹ ${l}</a>`;
// onglet demandé dans l'adresse (#club…) ; tout le reste, dont les retours de connexion, mène à l'accueil
function vueCourante() {
  const v = location.hash.slice(1);
  return VUES[v] && v !== 'compte' ? v : 'accueil';
}
function route(garderDefilement) {
  const v = Compte.pret ? vueCourante() : 'compte';   // connexion et profil d'abord
  majEntete();
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (ONGLET[v] || v)));
  $('#view').innerHTML = VUES[v]();
  if (!garderDefilement) window.scrollTo(0, 0);
  observerScenes(); echelleScenes(); hexAnimer();
  // une musique par partie du jeu : Accueil, Club et Équipe, Jouer, Social
  Son.theme({club: 'club', equipe: 'club', jouer: 'jouer', social: 'social'}[ONGLET[v] || v] || 'accueil');
  minuteur();
  if (v === 'accueil') departAuto();
}
// booster de départ jamais ouvert (demande de Maël : des comptes ne l'ouvraient pas) : il s'ouvre tout seul en arrivant
// sur l'accueil, juste après la création du pseudo ou à la visite suivante ; une fois par visite, après l'intro du jour
function departAuto() {
  if (departAuto.fait || !Compte.pret || S().depart !== false) return;
  clearTimeout(departAuto.t);
  departAuto.t = setTimeout(() => {
    if (departAuto.fait || S().depart !== false || vueCourante() !== 'accueil') return;
    if (occupe || !$('#overlay').hidden || document.body.classList.contains('avec-intro') || MD.el) return departAuto();   // plus tard
    departAuto.fait = true;
    ouvrirBooster(Compte.ouvrirDepart(), 'Départ', 'pk-depart');
  }, 700);
}
// légendes du club : absentes du catalogue (jamais annoncées) ; celles qu'on possède arrivent par l'état du joueur
function integrerLegendes() {
  for (const r of S().legendes || []) if (!PAR_ID[r.id] && Compte.carteDepuisLigne) { const c = Compte.carteDepuisLigne(r); CARTES.push(c); PAR_ID[c.id] = c; }
}
function nTransferts() { return (S().social?.transferts || 0) + (S().social?.clubDemandes || 0); }
function majEntete() {
  try { majInvitations(); } catch (er) {}
  integrerLegendes();
  $('#coins').hidden = !Compte.pret;
  $('.tabs').hidden = !Compte.pret;
  const moi = $('#moi');
  moi.hidden = !Compte.pret; document.body.classList.toggle('connecte', !!Compte.pret);
  $('#moi-niv').textContent = S().niveau || 1;
  $('#moi-xp').style.transform = `scaleX(${Math.min(1, (S().xp || 0) / (S().xpNiveau || 100))})`;
  moi.setAttribute('aria-label', `Mon compte, niveau ${S().niveau || 1}`);
  $('#hud-boost').hidden = !Compte.pret; majHudBooster();
  const n = (S().boosters || 0) + (S().bonus || 0) + (S().bonusOr || 0) + (S().depart === false ? 1 : 0);
  const pastille = $('#pastille'); pastille.hidden = !n || !Compte.pret; pastille.textContent = n;
  // quêtes : une icône en haut à droite, avec une pastille quand une récompense attend
  const q = [...(S().quetes || []), ...(S().quetesSemaine || [])].filter(x => x.progres >= x.objectif && !x.reclamee).length + (passePret() ? 1 : 0)
    + (S().club?.paliers || []).filter(p => p.atteint && !p.reclame).length;
  $('#quetes-b').hidden = !Compte.pret; const pq = $('#pastille-q'); pq.hidden = !q || !Compte.pret; pq.textContent = q;
  // ami(e)s : la bulle, avec une pastille pour les demandes, les échanges proposés et les messages non lus
  const so = (S().social?.demandes || 0) + (S().social?.echanges || 0) + (S().social?.messages || 0), pa = $('#pastille-a');
  $('#bulle-amis').hidden = !Compte.pret; pa.hidden = !so || !Compte.pret; pa.textContent = so;
  // transferts : cartes vendues ou reçues du club pas encore vues, demandes du club que je peux remplir (Social, porte Transferts)
  // boîte à échanges : un dépôt servi pendant l'absence (un joueur a déposé, ou l'heure d'attente est passée)
  const bx = S().social?.boite || 0;
  if (Compte.pret && bx > (majEntete.bx || 0)) { toast(`🎁 Boîte à échanges : ${bx > 1 ? `${bx} échanges faits` : 'ton échange est fait'} ! Social → Transferts`); Son.jouer('notif'); }
  majEntete.bx = bx;
  const nt = nTransferts(), ps = $('#pastille-s'); ps.hidden = !nt || !Compte.pret; ps.textContent = nt;
  if (Compte.pret && so > (majEntete.so ?? so)) Son.jouer('notif');
  majEntete.so = so;
  if (Compte.pret) majPieces();
}

// ── accueil : niveau, boosters, quêtes ──────────────────────────────────────────
function secondesAvantBooster() {
  const s = S().prochainBooster;
  return s == null ? null : Math.max(0, Math.ceil(s - (Date.now() - S().recu) / 1000));
}
// recharge des matchs de championnat (match_minutes : 1 par heure depuis le 14 nov. 2026)
const rechargeMatch = () => { const m = +(PARAMS.match_minutes ?? 60); return m === 60 ? '1 par heure' : m % 60 ? `1 toutes les ${m} min` : `1 toutes les ${m / 60} h`; };
// matchs de championnat disponibles : la réserve (1 par heure, 10 au plus) ; avec un serveur pas encore à jour,
// l'ancienne limite du jour
const matchsDispo = e => e.matchs ?? Math.max(0, (e.limites?.championnat || 0) - (e.jour?.championnat || 0));
// le prochain match de championnat (1 par heure, 10 en réserve au plus)
function secondesAvantMatch() {
  const s = S().prochainMatch;
  return s == null ? null : Math.max(0, Math.ceil(s - (Date.now() - S().recu) / 1000));
}
const mmss = s => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// HUD : boosters gratuits en stock et compte à rebours du prochain (comme le sachet et son minuteur de Pokémon TCG Pocket)
function majHudBooster() {
  const e = S(), n = e.boosters || 0, max = e.boosterMax || 5, s = secondesAvantBooster();
  $('#hud-bn').textContent = `${n}/${max}`;
  $('#hud-bt').textContent = n >= max || s == null ? 'plein' : mmss(s);
  $('#hud-boost').classList.toggle('pret', n > 0);
  if (s === 0 && n < max && Compte.pret && !minuteur.charge && !occupe && !document.body.classList.contains('avec-intro')) {
    minuteur.charge = true;
    Compte.rafraichir().catch(() => {}).finally(() => { minuteur.charge = false; if ($('#overlay').hidden && !MD.el) route(true); });
  }
}
setInterval(() => { if (Compte.pret && !document.hidden) majHudBooster(); }, 1000);
function minuteur() {
  clearInterval(minuteur.t);
  if (!$('#minuteur') && !$('#minuteur-match')) return;
  minuteur.t = setInterval(() => {
    const el = $('#minuteur'), em = $('#minuteur-match'); if (!el && !em) return clearInterval(minuteur.t);
    const sb = el ? secondesAvantBooster() : null, sm = em ? secondesAvantMatch() : null, s = el && sb === 0 ? 0 : em && sm === 0 ? 0 : 1;
    if (el) el.textContent = mmss(sb || 0);
    if (em) em.textContent = mmss(sm || 0);
    if (s === 0 && !minuteur.charge && !occupe) {   // un booster ou un match vient d'arriver
      minuteur.charge = true; clearInterval(minuteur.t);
      Compte.rafraichir().catch(() => {}).finally(() => { minuteur.charge = false; if ($('#overlay').hidden) route(true); });
    }
  }, 1000);
}
// Boosters par poste : un joueur sur chaque sachet (choix de Maël : [poste, carte, palier de la photo])
// boosters par équipe (demande de Maël : 5 à 9 joueurs par poste, trop peu) : [équipe, carte de la photo, palier de la photo]
// jeunes (demande de Maël, 21 nov. 2026) : un booster par équipe aussi ; sachet sans photo tant que Maël n'en a pas choisi
// (seul Dorian Bondy, -18G, a une photo publiée)
const BOOSTERS_EQUIPE = [['SF1', 'julie-valentin', 'or'], ['SF2', 'elodie-perez', 'bronze'], ['SG1', 'wassia-donzow', 'or'], ['SG2', 'luigi-bataillon', 'or'],
  ['-18F1', null, null], ['-18F2', null, null], ['-18G', 'dorian-bondy', 'bronze'], ['-15F', null, null], ['-15G', null, null]];
// carrousel « Acheter un booster » (demande de Maël) : le booster mystère en premier (« ? » : une carte parmi toutes ; 21 nov. 2026),
// puis les équipes
const BOOSTERS_CAR = [['?', null, null], ...BOOSTERS_EQUIPE];
// ordre des équipes à l'écran (joueurs de la semaine) : seniors, puis -18, puis -15
const rangEquipe = eq => { const i = BOOSTERS_EQUIPE.findIndex(b => b[0] === eq); return i < 0 ? 99 : i; };
const NOM_EQUIPE = {SF1: 'Seniors Filles 1', SF2: 'Seniors Filles 2', SG1: 'Seniors Garçons 1', SG2: 'Seniors Garçons 2', '-18F1': 'Moins de 18 ans Filles 1', '-18F2': 'Moins de 18 ans Filles 2', '-18G': 'Moins de 18 ans Garçons',
  '-15F': 'Moins de 15 ans Filles', '-15G': 'Moins de 15 ans Garçons'};
const carTitre = eq => eq === '?' ? 'Booster mystère' : NOM_EQUIPE[eq] || eq;
const carSous = eq => eq === '?' ? 'Une carte au hasard parmi toutes, joueurs et staff · mêmes chances' : `${uneEquipe(eq)} · mêmes chances · ${joueursEquipe(eq)}`;
const carPrix = eq => eq === '?' ? PARAMS.booster_hasard_prix ?? 300 : PARAMS.booster_equipe_prix ?? 500;
const carPossible = eq => S().pieces >= carPrix(eq) && (eq === '?' || nbEquipe(eq) > 0);
const nbEquipe = eq => CARTES.filter(c => c.actif !== false && deLEquipe(c, eq)).length;
const uneEquipe = eq => eq.startsWith('SF') ? 'Une joueuse de l’équipe' : 'Un joueur de l’équipe';
const joueursEquipe = eq => { const n = nbEquipe(eq), f = eq.startsWith('SF'); return `${n} ${f ? 'joueuse' : 'joueur'}${n > 1 ? 's' : ''}`; };
const CARROUSEL = {i: 0};
const photoSachet = (carte, palier) => { const c = PAR_ID[carte]; return c ? c.photos?.[palier] || photoPalier(c, palier) : null; };
// Fond animé des boosters (accueil et ouverture) : rayons qui tournent, halos colorés, lignes du terrain, ballons qui flottent
const fondHand = () => `<div class="fond-hand" aria-hidden="true"><i class="fh-rayons"></i><i class="fh-halo h1"></i><i class="fh-halo h2"></i><i class="fh-halo h3"></i>
  <svg class="fh-terrain" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice"><path d="M25 0 A60 60 0 0 0 85 60 H115 A60 60 0 0 0 175 0"/><path class="tir" d="M0 30 A90 90 0 0 0 85 90 H115 A90 90 0 0 0 200 30"/><path d="M95 70 h10"/></svg>
  <i class="fh-ballon b1"></i><i class="fh-ballon b2"></i><i class="fh-ballon b3"></i><i class="fh-ballon b4"></i>
  <i class="fh-eclat e1"></i><i class="fh-eclat e2"></i><i class="fh-eclat e3"></i><i class="fh-eclat e4"></i><i class="fh-eclat e5"></i></div>`;
// Sachet : aluminium brillant aux bords dentelés, reflets holographiques ; un joueur en photo sur les boosters par poste
// Les scènes animées de l'accueil (fond, sachets) s'arrêtent quand elles sortent de l'écran : moins de travail en défilant
const VUE_SCENES = 'IntersectionObserver' in window ? new IntersectionObserver(l => l.forEach(x => x.target.classList.toggle('hors-vue', !x.isIntersecting))) : null;
const observerScenes = () => VUE_SCENES && document.querySelectorAll('.scene-b:not([data-vue])').forEach(s => { s.dataset.vue = 1; VUE_SCENES.observe(s); });
function sachetHTML({theme, nom, sous, photo, poste, pw, hasard}) {
  return `<span class="sachet ${theme}${photo ? ' avec-photo' : ''}${hasard ? ' hasard' : ''}"${poste ? ` data-p="${poste}"` : ''} style="--pw:${pw}px">${sachetInterieur({nom, sous, photo, poste, hasard})}</span>`;
}
// booster mystère : trois points d'interrogation holographiques à la place de la photo
const SA_HASARD = '<span class="sa-hasard" aria-hidden="true"><i class="q1">?</i><i class="q2">?</i><i class="q3">?</i></span>';
function sachetInterieur({nom, sous, photo, poste, hasard}) {
  return `<span class="ob-corps"><span class="sa-plis"></span>${photo ? `<img class="sa-photo" src="${esc(photo)}" alt="" loading="lazy">` : ''}${hasard ? SA_HASARD : ''}
      <span class="sa-logo"><img src="assets/logo.png" alt=""></span>${poste ? `<span class="sa-poste">${poste}</span>` : ''}
      <span class="sa-bas"><span class="ob-nom">${esc(nom)}</span><span class="ob-n">${esc(sous)}</span></span>
      <span class="sa-holo"></span><span class="ob-brille"></span></span>
    <span class="ob-bande"><span class="sa-marque">Médoc Hand Cards</span><span class="sa-holo"></span><span class="ob-brille"></span></span>`;
}
function vueAccueil() {
  const e = S(), s = secondesAvantBooster(), chances = PARAMS.booster_chances || {};
  const pct = Math.round(100 * e.xp / (e.xpNiveau || 1));
  const i = CARROUSEL.i % BOOSTERS_CAR.length, n = BOOSTERS_CAR.length;
  // les sachets sont tous là, placés en cercle par transform (seuls le choisi et ses deux voisins se voient) : en changeant
  // d'équipe, ils tournent avec une animation, et suivent le doigt pendant qu'on glisse (placerCarrousel)
  const carrousel = BOOSTERS_CAR.map(([eq, carte, palier], k) =>
    `<button class="car-it${k === i ? ' centre' : ''}" data-car="${k}" style="${styleCar(ecartCar(k, i))}" aria-label="${carTitre(eq)}"${k === i ? ' aria-current="true"' : ''}>
      ${eq === '?' ? sachetHTML({theme: 'pk-hasard', nom: 'Mystère', sous: 'Toutes les cartes', hasard: true, pw: 168})
        : sachetHTML({theme: 'pk-poste', nom: eq, sous: joueursEquipe(eq), photo: photoSachet(carte, palier), poste: eq, pw: 168})}</button>`).join('');
  const [eqSel] = BOOSTERS_CAR[i];
  return `${Compte.horsLigne ? '<div class="daily hors"><p><b>Hors ligne</b>Ton club reste consultable. Reviens en ligne pour jouer.</p></div>' : ''}
    <div class="niveau"><div><b>Niveau ${e.niveau}</b><small>${nb(e.xp)} / ${nb(e.xpNiveau)} XP</small></div><div class="bar"><i style="width:${pct}%"></i></div></div>
    ${blocPasse()}
    ${e.depart === false ? `<div class="daily depart"><p><b>Booster de départ</b>7 joueurs, un à chaque poste : ta première équipe !</p>
      <button class="btn gold" data-act="depart">Ouvrir</button></div>` : ''}
    <section class="scene-b">${fondHand()}
      <button class="sachet-b flotte" data-booster="gratuit"${e.boosters < 1 ? ' disabled' : ''} aria-label="Ouvrir un booster gratuit">
        ${sachetHTML({theme: 'pk-gratuit', nom: 'Booster', sous: '1 joueur', pw: 172})}<b class="sa-stock">×${e.boosters}</b></button>
      <div class="scene-t"><b>Booster gratuit</b><small>${e.boosters}/${e.boosterMax} en stock · ${s == null ? 'stock plein' : `prochain dans <span id="minuteur">${mmss(s)}</span>`}</small></div>
      <button class="btn-penche" data-booster="gratuit"${e.boosters < 1 ? ' disabled' : ''}>${e.boosters ? 'Ouvrir' : 'Bientôt'}</button>
      ${e.bonus || e.bonusOr ? `<div class="extras">${e.bonus ? `<button class="mini-sachet" data-booster="bonus">${sachetHTML({theme: 'pk-bonus', nom: 'Bonus', sous: '1 joueur', pw: 64})}<span>Bonus ×${e.bonus}</span></button>` : ''}
        ${e.bonusOr ? `<button class="mini-sachet" data-booster="or">${sachetHTML({theme: 'pk-or', nom: 'Or', sous: 'Or ou Ultime', pw: 64})}<span>Or ×${e.bonusOr}</span></button>` : ''}</div>` : ''}
    </section>
    <p class="sub petit centre">Un joueur par booster : ${RARETES.map(r => `${chances[r] ?? 0} % ${R_LABEL[r]}`).join(' · ')}.</p>
    <h2>Acheter un booster</h2>
    <section class="scene-b petite">${fondHand()}
      <div class="carrousel" data-carrousel><button class="car-fl g" data-car="${(i - 1 + n) % n}" aria-label="Booster précédent">‹</button>${carrousel}
        <button class="car-fl d" data-car="${(i + 1) % n}" aria-label="Booster suivant">›</button></div>
      <div class="scene-t"><b>${carTitre(eqSel)}</b><small>${carSous(eqSel)}</small></div>
      <button class="btn-penche" data-bequipe="${eqSel}"${carPossible(eqSel) ? '' : ' disabled'}>Acheter · ${nb(carPrix(eqSel))} pièces</button>
      <button class="btn-lot" data-blot="${eqSel}"${lotPossible(eqSel) ? '' : ' disabled'}><b>×${lotN()}</b><span>${lotTexte(eqSel)}</span></button>
      <div class="car-points">${BOOSTERS_CAR.map(([p], k) => `<i class="${k === i ? 'on' : ''}" data-car="${k}"></i>`).join('')}</div>
    </section>
    ${blocSemaine()}
    ${blocCoach()}`;
}
// ── carrousel des boosters par poste : place de chaque sachet selon son écart au choisi (d, fractionnaire pendant un glissé)
const ecartCar = (k, i) => { const n = BOOSTERS_CAR.length; let d = ((k - i) % n + n) % n; if (d > n / 2) d -= n; return d; };
function styleCar(d) {
  const a = Math.min(Math.abs(d), 2), sg = Math.sign(d);
  const x = sg * (a <= 1 ? a * 79 : 79 + (a - 1) * 70), echelle = 1 - .3 * Math.min(a, 1), r = sg * 8 * Math.min(a, 1);
  const op = a <= 1 ? 1 - .55 * a : Math.max(0, .45 * (2 - a) / 1);
  return `transform: translate(-50%, -50%) translateX(${x.toFixed(2)}%) rotate(${r.toFixed(2)}deg) scale(${echelle.toFixed(3)}); opacity: ${op.toFixed(3)};`
    + ` z-index: ${10 - Math.round(a * 3)}; pointer-events: ${a < 1.5 ? 'auto' : 'none'};`;
}
function placerCarrousel(decalage = 0) {
  document.querySelectorAll('.carrousel .car-it').forEach(el => {
    const d = ecartCar(+el.dataset.car, CARROUSEL.i) + decalage;
    el.style.cssText = styleCar(d);
    el.classList.toggle('centre', !decalage && d === 0); el.toggleAttribute('aria-current', !decalage && d === 0);
  });
}
// un autre poste choisi : les sachets tournent jusqu'à leur place ; le titre, le bouton d'achat et les points suivent
function choisirCarrousel(k, auto) {
  const n = BOOSTERS_CAR.length, sc = $('.carrousel');
  CARROUSEL.i = ((k % n) + n) % n;
  if (!sc) return route(true);
  placerCarrousel();
  const [eq] = BOOSTERS_CAR[CARROUSEL.i];
  const scene = sc.closest('.scene-b');
  scene.querySelector('.scene-t b').textContent = carTitre(eq);
  scene.querySelector('.scene-t small').textContent = carSous(eq);
  const achat = scene.querySelector('[data-bequipe]'); achat.dataset.bequipe = eq; achat.disabled = !carPossible(eq); achat.textContent = `Acheter · ${nb(carPrix(eq))} pièces`;
  const lot = scene.querySelector('[data-blot]'); lot.dataset.blot = eq; lot.disabled = !lotPossible(eq); lot.querySelector('span').textContent = lotTexte(eq);
  scene.querySelectorAll('.car-points i').forEach((x, j) => x.classList.toggle('on', j === CARROUSEL.i));
  sc.querySelector('.car-fl.g').dataset.car = (CARROUSEL.i - 1 + n) % n; sc.querySelector('.car-fl.d').dataset.car = (CARROUSEL.i + 1) % n;
  if (!auto) { Son.jouer('envol'); CARROUSEL.touche = Date.now(); }
}
// le carrousel tourne tout seul toutes les 4 s (demande de Maël), sans bruit ; il attend 8 s après un geste, et ne tourne pas
// s'il est hors de l'écran, pendant un glissé, une fenêtre ouverte, une ouverture de booster ou quand l'appli est cachée
const CAR_AUTO = 4000, CAR_PAUSE = 8000;
setInterval(() => {
  const sc = $('.carrousel'), scene = sc?.closest('.scene-b');
  if (!sc || glisse || document.hidden || scene.classList.contains('hors-vue') || !$('#overlay').hidden || document.body.classList.contains('avec-intro')
    || Date.now() - (CARROUSEL.touche || 0) < CAR_PAUSE || moinsAnim()) return;
  choisirCarrousel(CARROUSEL.i + 1, true);
}, CAR_AUTO);
// Quêtes du jour : dans une fenêtre, depuis l'icône en haut à droite
const queteHTML = (q, attr) => { const fini = q.progres >= q.objectif;
  return `<div class="quete${q.reclamee ? ' faite' : ''}"><div><b>${esc(q.texte)}</b><small>${q.progres}/${q.objectif} · +${q.xp} XP · +${nb(q.pieces)} pièces</small>
    <div class="bar"><i style="width:${100 * q.progres / q.objectif}%"></i></div></div>
    ${q.reclamee ? '<span class="ok">✓</span>' : fini ? `<button class="btn gold petit" ${attr}="${q.id}">Récupérer</button>` : ''}</div>`; };
function fenetreQuetes() {
  const quetes = (S().quetes || []).map(q => queteHTML(q, 'data-quete')).join(''), sem = (S().quetesSemaine || []).map(q => queteHTML(q, 'data-quete-s')).join('');
  ouvrirOverlay(`<div class="sheet quetes-s"><h3>Quêtes du jour</h3><div class="quetes">${quetes || '<p class="sub">Reviens demain pour de nouvelles quêtes.</p>'}</div>
    ${blocClubQuetes()}
    ${sem ? `<h3>Quêtes de la semaine</h3><p class="sub petit">Jusqu’au ${S().finSemaine ? dateCourte(S().finSemaine) : 'dimanche'} · grosses récompenses 💪</p><div class="quetes">${sem}</div>` : ''}
    ${blocPasse()}
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}

// l'objectif du club dans les quêtes (demande de Maël, 24 nov. 2026) : victoires de la semaine de tous les membres, 3 paliers à récupérer
function blocClubQuetes() {
  const c = S().club;
  if (!c) return `<h3>🛡️ Objectif du club</h3><p class="sub petit">Rejoins un club de joueurs : vos victoires s’additionnent chaque semaine, avec des récompenses à la clé.</p>
    <button class="btn ghost" data-act="vers-clubs" style="width:100%">Trouver un club</button>`;
  const ps = c.paliers || [];
  return `<h3>🛡️ Objectif du club · ${esc(c.nom)}</h3><p class="sub petit">${plur(c.victoires || 0, 'victoire')} cette semaine (championnat, Classé, défis), tous les membres ensemble</p>
    <div class="cl-pal">${ps.map(p => `<div class="${p.atteint ? 'ok' : ''}"><b>${p.objectif}</b><span class="bar"><i style="width:${Math.min(100, 100 * (c.victoires || 0) / p.objectif)}%"></i></span>
      ${RECOMP(p.recompense || {})}${p.reclame ? '<em>✓</em>' : p.atteint ? `<button class="btn gold petit" data-club-palier="${p.palier}">Récupérer</button>` : ''}</div>`).join('')}</div>`;
}

// ── pour ne pas tourner en rond (demande de Maël, d'après les jeux du genre) : joueurs de la semaine (vrais matchs du club),
// passe de saison (toute l'XP compte, 30 paliers en 4 semaines), quêtes de la semaine, défis de composition (cartes en trop
// données contre des boosters). Tout est réglé par le serveur (schema.sql) ; ici, l'affichage.
const enForme = carte => !!S().semaine?.joueurs?.some(j => j.carte === carte);
const bonusForme = carte => enForme(carte) ? (S().semaine.forme ?? 3) : 0;
const RECOMP = r => [r.or ? `<span class="rc rc-or">⭐ Or${r.or > 1 ? ' ×' + r.or : ''}</span>` : '',
  r.bonus ? `<span class="rc rc-b">🎁 Booster${r.bonus > 1 ? ' ×' + r.bonus : ''}</span>` : '',
  r.pieces ? `<span class="rc rc-p"><i class="coin"></i>${nb(r.pieces)}</span>` : ''].join('');
const texteRecomp = r => [r.or ? `${r.or} booster${r.or > 1 ? 's' : ''} Or` : '', r.bonus ? `${r.bonus} booster${r.bonus > 1 ? 's' : ''}` : '',
  r.pieces ? `${nb(r.pieces)} pièces` : ''].filter(Boolean).join(' + ');
const dateCourte = j => new Date(j + 'T12:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
// les buts seulement, jamais les tirs (demande de Maël, 21 nov. 2026) ; les arrêts pour un(e) gardien(ne) élu(e) sur ses arrêts
const ligneStats = s => s.arrets && s.arrets / 2 >= s.buts ? `${s.arrets} arrêts` : `${s.buts} but${s.buts > 1 ? 's' : ''}`;
// la carte à montrer d'un joueur : ma meilleure, sinon la carte de base
const carteMontree = id => { const ex = mesEx(id)[0]; return ex ? vue(ex) : PAR_ID[id]; };

function blocSemaine() {
  const w = S().semaine;
  if (!w?.joueurs?.some(j => PAR_ID[j.carte])) return '';
  const reste = Math.max(0, (w.parJour ?? 3) - (w.achetes || 0)), prix = w.prix ?? 400;
  return `<h2>⭐ Joueurs de la semaine</h2>
    <section class="js-b">
      <p class="sub petit">Les meilleurs des vrais matchs du week-end (semaine du ${dateCourte(w.lundi)}) : <b>+${w.forme} en match</b> toute la semaine 🔥</p>
      <div class="js-l" style="--c:${Math.min(4, w.joueurs.filter(j => PAR_ID[j.carte]).length)}">${w.joueurs.filter(j => PAR_ID[j.carte]).sort((a, b) => rangEquipe(a.equipe) - rangEquipe(b.equipe)).map(j => { const m = j.stats.match;
        return `<button class="js-j" data-voir-fiche="${j.carte}">${vignetteHTML(carteMontree(j.carte))}<span class="js-t"><b>${esc(j.equipe)}</b><span>${ligneStats(j.stats)}</span>
          ${m ? `<small>${m.lieu === 'dom' ? 'contre' : 'à'} ${esc(m.adv)} · ${m.score.join(' – ')}</small>` : ''}</span></button>`; }).join('')}</div>
      <button class="btn gold js-go" data-act="booster-semaine"${reste && S().pieces >= prix ? '' : ' disabled'}>Booster de la semaine · ${nb(prix)} <i class="coin"></i></button>
      <small class="js-r">Un de ces joueurs, plus de chances d’Argent et d’Or · ${reste}/${w.parJour} aujourd’hui</small>
    </section>`;
}

const passePret = () => { const p = S().passe; return p ? Math.max(0, p.palier - p.reclame) : 0; };
function blocPasse() {
  const p = S().passe;
  if (!p) return '';
  const fini = p.palier >= p.paliers, dans = p.xp - p.palier * p.xpPalier, pret = passePret();
  return `<button class="passe-b${pret ? ' pret' : ''}" data-act="passe"><span class="pa-n"><small>palier</small><b>${p.palier}</b></span>
    <span class="pa-t"><b>Passe de la saison ${p.saison}</b><small>${fini ? 'Tous les paliers atteints 🏆' : `${nb(dans)} / ${nb(p.xpPalier)} XP · jusqu’au ${dateCourte(p.fin)}`}</small>
      <span class="bar"><i style="width:${fini ? 100 : Math.round(100 * dans / p.xpPalier)}%"></i></span></span>
    <span class="pa-go">${pret ? `🎁 ${pret}` : 'Voir'}</span></button>`;
}
function fenetrePasse() {
  const p = S().passe;
  if (!p) return;
  const liste = p.recompenses.map((r, i) => { const k = i + 1, cls = k <= p.reclame ? 'recu' : k <= p.palier ? 'pret' : 'verrou';
    return `<div class="pa-pal ${cls}${k % 10 === 0 ? ' gros' : ''}"><b>${k}</b><span>${RECOMP(r)}</span><em>${cls === 'recu' ? '✓' : cls === 'pret' ? '🎁' : '🔒'}</em></div>`; }).join('');
  ouvrirOverlay(`<div class="sheet passe-s"><h3>Passe de la saison ${p.saison}</h3>
    <p class="sub petit">Du ${dateCourte(p.debut)} au ${dateCourte(p.fin)} · toute ton XP compte (matchs, quêtes, mini-jeux…) · ${nb(p.xpPalier)} XP par palier</p>
    ${blocPasse().replace('data-act="passe"', 'data-act="rien"')}
    <div class="pa-grille">${liste}</div>
    ${passePret() ? `<button class="btn gold" data-act="passe-reclamer">Tout récupérer (${passePret()} palier${passePret() > 1 ? 's' : ''})</button>` : ''}
    <button class="btn" data-act="fermer">Fermer</button></div>`);
  const ici = $('.pa-pal.pret, .pa-pal.verrou');
  if (ici) ici.parentNode.scrollTop = ici.offsetTop - ici.parentNode.offsetTop - 60;
}

// ── défis de composition ─────────────────────────────────────────────────────────
const RANG = p => RARETES.indexOf(p);
const compoLibres = () => EX().filter(e => !e.verrou && !dansEquipe(e.id) && PAR_ID[e.carte] && !PAR_ID[e.carte].legende);
const condOk = (k, e) => { const c = PAR_ID[e.carte];
  return (!k.palier || e.palier === k.palier) && (!k.equipe || c.equipe === k.equipe) && (!k.genre || c.genre === k.genre) && (!k.poste || c.poste === k.poste); };
const condNom = k => k.poste ? POSTE_NOM[k.poste] : k.equipe ? `de ${k.equipe}` : k.genre ? (k.genre === 'F' ? 'fille' : 'garçon') : k.palier ? R_LABEL[k.palier] : '';
// les morceaux de la règle, cochés ou non (même règle que compo_erreur dans schema.sql)
function compoTest(regle, exs) {
  const out = [{ok: exs.length === regle.n, txt: `${exs.length}/${regle.n} cartes`}];
  if (regle.differents) out.push({ok: exs.length > 0 && new Set(exs.map(e => e.carte)).size === exs.length, txt: 'Joueurs tous différents'});
  if (regle.palier_min) out.push({ok: exs.length > 0 && exs.every(e => RANG(e.palier) >= RANG(regle.palier_min)), txt: `${R_LABEL[regle.palier_min]} ou mieux`});
  if (regle.equipes) { const v = new Set(exs.map(e => PAR_ID[e.carte].equipe)).size; out.push({ok: v >= regle.equipes, txt: `${regle.equipes} équipes différentes (${v})`}); }
  if (regle.note_moy) { const m = exs.length ? exs.reduce((t, e) => t + e.note, 0) / exs.length : 0;
    out.push({ok: m >= regle.note_moy, txt: `Note moyenne ${regle.note_moy} ou plus (${exs.length ? Math.floor(m) : '–'})`}); }
  if (regle.un_par_poste) { const v = new Set(exs.map(e => PAR_ID[e.carte].poste).filter(Boolean)).size; out.push({ok: v >= 7, txt: `Un à chaque poste (${v}/7)`}); }
  for (const k of regle.conds || []) { const v = exs.filter(e => condOk(k, e)).length; out.push({ok: v >= k.n, txt: `${k.n} × ${condNom(k)} (${v})`}); }
  return out;
}
// une carte qui peut servir au défi
const compoUtile = (regle, e) => (!regle.palier_min || RANG(e.palier) >= RANG(regle.palier_min)) && (!regle.note_moy || e.note >= regle.note_moy)
  && (!regle.conds?.length || regle.conds.some(k => condOk(k, e)));
// proposition de départ : les cartes qui coûtent le moins (doublons d'abord, palier et note les plus bas)
function compoAuto(regle) {
  const nbJ = {}; EX().forEach(e => { nbJ[e.carte] = (nbJ[e.carte] || 0) + 1; });
  const cout = e => (nbJ[e.carte] > 1 ? 0 : 1000) + RANG(e.palier) * 100 + e.note;
  const pool = compoLibres().filter(e => compoUtile(regle, e)).sort((a, b) => cout(a) - cout(b));
  const choix = [], pris = new Set(), joueurs = new Set(), unique = regle.differents || regle.un_par_poste;
  const libre = e => !pris.has(e.id) && !(unique && joueurs.has(e.carte));
  const prendre = e => { choix.push(e); pris.add(e.id); joueurs.add(e.carte); };
  if (regle.un_par_poste) for (const {id} of POSTES) { const e = pool.find(x => libre(x) && PAR_ID[x.carte].poste === id); if (e) prendre(e); }
  if (regle.equipes) for (const eq of new Set(pool.map(e => PAR_ID[e.carte].equipe))) {
    if (new Set(choix.map(e => PAR_ID[e.carte].equipe)).size >= regle.equipes) break;
    const e = pool.find(x => libre(x) && PAR_ID[x.carte].equipe === eq); if (e) prendre(e);
  }
  for (const k of regle.conds || []) { let v = choix.filter(e => condOk(k, e)).length;
    for (const e of pool) { if (v >= k.n || choix.length >= regle.n) break; if (libre(e) && condOk(k, e)) { prendre(e); v++; } } }
  for (const e of pool) { if (choix.length >= regle.n) break; if (libre(e)) prendre(e); }
  return {choix, ok: compoTest(regle, choix).every(t => t.ok)};
}

// ── choix du coach (dans l'esprit du « choix miracle » de Pokémon TCG Pocket) : 3 joueurs d'un poste arrivent face visible,
// se retournent et échangent leurs places ; on en touche un et il est à nous (éclat à la couleur de son palier), puis les deux
// autres se retournent. Le serveur a tiré la place de chaque carte en secret (choix_coach_preparer / choix_coach_choisir) :
// l'animation ne fait que le montrer. Les cartes sont placées par des variables CSS (--x, --y, --r, --s, --o) qui glissent
// en transition : seuls transform et opacity bougent.
const CC = {poste: 'DC', el: null, data: null, etape: null, pos: [0, 1, 2]};
const CC_W = 116;   // écart entre deux places : une carte de 104 px + 12
function blocCoach() {
  const cc = S().choixCoach;
  if (!cc) return '';
  const att = cc.attente, reste = Math.max(0, (cc.parJour ?? 3) - (cc.faits || 0)), prix = cc.prix ?? 400, poste = att?.poste || CC.poste;
  return `<h2>Choix du coach</h2>
    <section class="scene-b petite cc-b">${fondHand()}
      <div class="cc-eventail" aria-hidden="true">${[-1, 1, 0].map(k => `<span class="cc-ev" style="--k:${k}">${dosHTML(70)}</span>`).join('')}<b class="cc-q">?</b></div>
      <div class="scene-t"><b>${POSTE_NOM[poste]}</b><small>3 joueurs montrés, puis mélangés face cachée : retournes-en un, il est à toi !</small></div>
      ${att ? `<button class="btn-penche" data-act="choix-coach">Reprendre ton choix · ${POSTE_NOM[att.poste]}</button>
      <small class="cc-reste">Les mêmes 3 cartes t’attendent</small>` : `
      <div class="cc-postes" role="group" aria-label="Poste">${POSTES.map(({id}) => `<button class="${CC.poste === id ? 'on' : ''}" data-cc-poste="${id}" aria-pressed="${CC.poste === id}">${id}</button>`).join('')}</div>
      <button class="btn-penche" data-act="choix-coach"${reste && S().pieces >= prix ? '' : ' disabled'}>${POSTE_NOM[CC.poste]} · ${nb(prix)} pièces</button>
      <small class="cc-reste">${reste}/${cc.parJour} aujourd’hui</small>`}
    </section>`;
}
function lancerCoach() {
  if (occupe || CC.el) return;
  action(Compte.choixCoachPreparer(S().choixCoach?.attente?.poste || CC.poste), sceneCoach);
}
const faceCoach = x => `<i class="cc-aura"></i>${carteHTML(vueExemplaire(PAR_ID[x.carte], {palier: x.palier, note: PALIER[x.palier].min}))}`;
const coucheCC = () => fermerCoach(true);
const placerCC = (c, o) => { for (const [k, v] of Object.entries(o)) c.style.setProperty('--' + k, v); };
function sceneCoach(r) {
  const el = document.createElement('div');
  el.className = 'cc'; CC.el = el; CC.data = r; CC.etape = 'montre'; CC.pos = [0, 1, 2];
  el.innerHTML = `${fondHand()}<div class="cc-tete"><small>Choix du coach</small><b>${POSTE_NOM[r.poste]}</b></div>
    <p class="cc-aide">Ton coach te propose…</p>
    <div class="cc-l">${r.cartes.map((x, i) => `<button class="cc-c" data-cc="${i}" data-place="${i}" disabled aria-label="Carte ${i + 1}" style="--tc:${TEINTE[x.palier]}">
      <span class="cc-bob" style="--i:${i}"><span class="cc-in"><span class="cc-f">${faceCoach(x)}</span><span class="cc-d">${dosHTML(104)}</span></span></span></button>`).join('')}</div>
    <button class="btn gold cc-fin" data-act="cc-fin" hidden>Continuer</button>`;
  const cs = [...el.querySelectorAll('.cc-c')], vite = moinsAnim();
  cs.forEach(c => placerCC(c, {x: CC_W + 'px', y: '280px', r: '0deg', s: .35, o: 0}));   // au départ : en bas, petites
  document.body.appendChild(el); document.body.classList.add('avec-intro');
  ouvrirCouche(coucheCC); Son.discret(true); Son.jouer('envol');
  const aide = t => { el.querySelector('.cc-aide').textContent = t; };
  const pause = ms => new Promise(f => setTimeout(f, vite ? Math.min(ms, 20) : ms));
  const vivant = () => CC.el === el;
  (async () => {
    await pause(60);
    // 1. elles arrivent une à une, face visible, avec l'aura de leur palier
    for (const [i, c] of cs.entries()) { if (!vivant()) return; placerCC(c, {x: i * CC_W + 'px', y: '0px', r: (i - 1) * 5 + 'deg', s: 1, o: 1}); Son.jouer('tap'); await pause(170); }
    el.classList.add('vues');
    await pause(1700); if (!vivant()) return;
    // 2. elles se retournent l'une après l'autre
    aide('Retiens-les bien…');
    for (const c of cs) { if (!vivant()) return; c.classList.add('dos'); placerCC(c, {r: '0deg'}); await pause(150); }
    el.classList.remove('vues'); Son.jouer('retourne');
    await pause(500); if (!vivant()) return;
    // 3. le mélange : six échanges de places, l'une passe par-dessus, l'autre par-dessous
    aide('On mélange…'); el.classList.add('melange'); Son.jouer('souffle');
    for (let k = 0; k < 6; k++) {
      if (!vivant()) return;
      const pa = Math.floor(Math.random() * 3), pb = (pa + 1 + Math.floor(Math.random() * 2)) % 3;
      const a = CC.pos.indexOf(pa), b = CC.pos.indexOf(pb);
      CC.pos[a] = pb; CC.pos[b] = pa;
      placerCC(cs[a], {x: pb * CC_W + 'px', y: '-38px', s: 1.06, r: (pb > pa ? 6 : -6) + 'deg'});
      placerCC(cs[b], {x: pa * CC_W + 'px', y: '30px', s: .92, r: (pa > pb ? 6 : -6) + 'deg'});
      cs[a].style.zIndex = 3; cs[b].style.zIndex = 1; Son.jouer('tap');
      await pause(250);
      [cs[a], cs[b]].forEach(c => placerCC(c, {y: '0px', s: 1, r: '0deg'}));
      await pause(110);
    }
    if (!vivant()) return;
    cs.forEach((c, i) => { c.dataset.place = CC.pos[i]; c.style.zIndex = ''; c.setAttribute('aria-label', `Carte ${CC.pos[i] + 1}`); });
    el.classList.remove('melange');
    // 4. au joueur de choisir
    await pause(250); if (!vivant()) return;
    CC.etape = 'choix'; aide('Touche une carte !'); el.classList.add('a-toi'); cs.forEach(c => { c.disabled = false; });
  })();
}
function toucherCoach(i) {
  const el = CC.el;
  if (!el || CC.etape !== 'choix' || occupe) return;
  const p = CC.pos[i], cs = [...el.querySelectorAll('.cc-c')];
  CC.etape = 'attend'; el.classList.remove('a-toi'); cs.forEach(c => { c.disabled = true; });
  placerCC(cs[i], {y: '-18px', s: 1.1}); cs.forEach((c, j) => { if (j !== i) placerCC(c, {s: .92, o: .8}); });
  Son.jouer('clic');
  action(Compte.choixCoachChoisir(p), res => {
    if (CC.el !== el) return;
    // chaque place reçoit la carte que le serveur y avait mise
    cs.forEach((c, j) => { const x = res.cartes[res.places[CC.pos[j]]]; c.querySelector('.cc-f').innerHTML = faceCoach(x); c.style.setProperty('--tc', TEINTE[x.palier]); });
    const x = res.cartes[res.places[p]], c = PAR_ID[x.carte], haut = RARETES.indexOf(x.palier) >= 2;
    CC.etape = 'revele';
    cs[i].insertAdjacentHTML('afterbegin', `<span class="cc-eclat${haut ? ' fort' : ''}" aria-hidden="true">${Array.from({length: 14}, (_, k) =>
      `<i style="--a:${k * 360 / 14}deg;--d:${90 + (k % 3) * 28}px"></i>`).join('')}</span>`);
    cs[i].classList.add('choisi'); placerCC(cs[i], {y: '-4px', s: 1.22, r: '0deg', o: 1});
    setTimeout(() => {
      if (CC.el !== el) return;
      cs[i].classList.remove('dos'); Son.jouer(haut ? 'recompense' : 'retourne'); vibrer(haut ? [30, 40, 70] : 25);
      el.querySelector('.cc-aide').innerHTML = `${esc(c?.nom || '')} · <b class="t-${x.palier}">${R_LABEL[x.palier]}</b> !`;
    }, 260);
    setTimeout(() => {
      if (CC.el !== el) return;
      cs.forEach((b, j) => { if (j !== i) { b.classList.add('rate'); b.classList.remove('dos'); placerCC(b, {s: .84, o: .55, y: '22px'}); } });
      el.querySelector('.cc-fin').hidden = false; CC.etape = 'fini';
    }, 1400);
  }).then(r => { if (r === undefined && CC.el === el && CC.etape === 'attend') fermerCoach(); });
}
function fermerCoach(parRetour) {
  if (!CC.el) return;
  if (parRetour !== true) quitterCouche(coucheCC);
  CC.el.remove(); CC.el = null; CC.etape = null;
  document.body.classList.remove('avec-intro'); Son.discret(false);
  route(true);
}

// ── profil personnalisé (avatar, cadre, fond), vu dans les classements et les clubs ─────────────────────────
const AVATARS = {logo: '<img src="assets/logo.png" alt="">', maillot: '<svg class="av-maillot" viewBox="0 0 40 40"><path d="M14 6l-9 5 3 8 4-2v17h16V17l4 2 3-8-9-5c-1 3-3 4-6 4s-5-1-6-4z" fill="#fff" stroke="#15171b" stroke-width="1.2"/><path d="M14 6l-4 2.2L17 17M26 6l4 2.2L23 17M8.5 15.5l3.5-1.6M31.5 15.5l-3.5-1.6" stroke="#15171b" stroke-width="2.2" fill="none"/><circle cx="17" cy="25" r=".9" fill="#9aa1ab"/><circle cx="23" cy="28" r=".9" fill="#9aa1ab"/><circle cx="20" cy="31" r=".9" fill="#9aa1ab"/></svg>', ballon: '🤾', gardien: '🥅', trophee: '🏆', couronne: '👑'};
const avatarHTML = (p, cls = '') => `<span class="av cd-${esc((p || {}).cadre || 'simple')}${cls ? ' ' + cls : ''}" aria-hidden="true">${AVATARS[(p || {}).avatar] || AVATARS.logo}</span>`;
// voisins sur le terrain (liens entre coéquipiers)
const LIENS = [['AG', 'ARG'], ['ARG', 'DC'], ['DC', 'ARD'], ['ARD', 'AD'], ['ARG', 'PIV'], ['DC', 'PIV'], ['ARD', 'PIV'], ['DC', 'GB']];
const plur = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// ── pronostics du week-end (Social) ──────────────────────────────────────────────
function vuePronos() {
  chargerSoc('pronos', () => Compte.mesPronostics());
  const d = SOC.pronos;
  if (!d) return `${retour('social', 'Social')}<h1>Pronos</h1><p class="sub">Chargement…</p>`;
  const B = d.bareme || {}, nomC = id => PAR_ID[id]?.nom || '';
  const joueurs = eq => CARTES.filter(c => c.actif !== false && deLEquipe(c, eq)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const quand = m => `${new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', {weekday: 'short', day: 'numeric', month: 'short'})}${m.heure ? ' · ' + m.heure : ''}`;
  const aVenir = d.aVenir.map(m => `<div class="pr-m" data-prono-l="${esc(m.rid)}"><div class="pr-t"><b>${esc(m.equipe)}</b><small>${quand(m)}</small>
      ${m.prono ? '<em class="pr-ok">✓ enregistré</em>' : ''}</div>
    <div class="pr-score"><span class="${m.medoc === 'dom' ? 'med' : ''}">${esc(m.dom)}</span>
      <input class="champ" type="number" min="0" max="80" inputmode="numeric" data-pr="dom" value="${m.prono?.dom ?? ''}" aria-label="Buts de ${esc(m.dom)}">
      <i>–</i><input class="champ" type="number" min="0" max="80" inputmode="numeric" data-pr="ext" value="${m.prono?.ext ?? ''}" aria-label="Buts de ${esc(m.ext)}">
      <span class="${m.medoc === 'ext' ? 'med' : ''}">${esc(m.ext)}</span></div>
    <div class="pr-but"><select class="champ" data-pr="buteur" aria-label="Meilleur buteur du club"><option value="">Meilleur buteur du club (facultatif)</option>
      ${joueurs(m.equipe).map(c => `<option value="${c.id}"${m.prono?.buteur === c.id ? ' selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>
      <button class="btn gold petit" data-prono="${esc(m.rid)}">${m.prono ? 'Modifier' : 'Valider'}</button></div></div>`).join('');
  const passes = d.passes.map(m => `<div class="pr-r"><div><b>${esc(m.dom)} ${m.score.join(' – ')} ${esc(m.ext)}</b>
      <small>Ton prono : ${m.prono.dom} – ${m.prono.ext}${m.prono.buteur ? ' · ' + esc(nomC(m.prono.buteur)) : ''}${m.buteur ? ` · meilleur buteur : ${esc(nomC(m.buteur.carte))} (${m.buteur.buts})` : ''}</small></div>
    <em class="${m.prono.points ? 'gagne' : ''}">${m.prono.points == null ? '…' : '+' + m.prono.points}</em></div>`).join('');
  const classe = (l, vide) => l.length ? `<div class="classe av-l">${l.map((x, i) => `<div class="${x.moi ? 'moi-l' : ''}"><span>${i + 1}</span>${avatarHTML(x.perso)}<b>${lienJ(x.pseudo)}</b><em>${plur(x.points, 'pt')}</em></div>`).join('')}</div>` : `<p class="sub">${vide}</p>`;
  return `${retour('social', 'Social')}<h1>Pronos</h1>
    <p class="sub">Devine le score des matchs du club et leur meilleur buteur, avant le coup d’envoi 🔮</p>
    <p class="pr-bareme">Score exact <b>${B.exact} pts</b> · bon vainqueur <b>${B.issue}</b> (+${B.ecart} avec le bon écart) · buteur <b>${B.buteur}</b> · 1 point = ${d.piecesPoint} <i class="coin"></i></p>
    <h2>À pronostiquer</h2>${aVenir || '<p class="sub">Pas de match du club dans les 7 prochains jours.</p>'}
    ${passes ? `<h2>Tes résultats</h2><div class="pr-rs">${passes}</div>` : ''}
    <h2>Classement${d.semaine ? ` · semaine du ${dateCourte(d.semaine)}` : ''}</h2>${classe(d.classementSemaine, 'Les points arrivent après les matchs.')}
    <h2>Saison <small class="sub">· toi : ${plur(d.mesPoints, 'point')}</small></h2>${classe(d.classementSaison, 'Personne pour l’instant.')}`;
}
function validerProno(rid) {
  const l = document.querySelector(`[data-prono-l="${CSS.escape(rid)}"]`), v = k => l.querySelector(`[data-pr="${k}"]`).value;
  if (v('dom') === '' || v('ext') === '') return toast('Mets un score pour les deux équipes');
  action(Compte.pronostiquer(rid, +v('dom'), +v('ext'), v('buteur')), d => { SOC.pronos = d; Son.jouer('pari'); toast('Prono enregistré 🔮'); route(true); });
}

function vueClubs() {
  chargerSoc('clubs', () => Compte.monClub(SOC.rechClub));
  const d = SOC.clubs;
  if (!d) return `${retour('social', 'Social')}<h1>Clubs</h1><p class="sub">Chargement…</p>`;
  const liste = d.clubs.map((x, i) => `<div class="cl-l"><span>${i + 1}</span><b>${esc(x.nom)}</b><small>${x.membres}/${d.max} · ${plur(x.victoires, 'victoire')}</small>
    ${d.club ? '' : `<button class="btn ghost petit" data-club-rejoindre="${x.id}"${x.membres >= d.max ? ' disabled' : ''}>Rejoindre</button>`}</div>`).join('');
  if (!d.club) return `${retour('social', 'Social')}<h1>Clubs</h1>
    <p class="sub">Un club, c’est jusqu’à ${d.max} joueurs avec un objectif commun chaque semaine : leurs victoires s’additionnent 🛡️</p>
    <h2>Créer un club</h2><div class="cl-creer"><input class="champ" id="club-nom" maxlength="24" placeholder="Nom du club (ex. Les parents de la SF2)"><button class="btn gold" data-act="club-creer">Créer</button></div>
    <h2>Rejoindre un club</h2><input class="champ" type="search" placeholder="Chercher un club" value="${esc(SOC.rechClub || '')}" data-club-recherche>
    <div class="cl-liste">${liste || '<p class="sub">Aucun club pour l’instant : crée le premier !</p>'}</div>`;
  const c = d.club;
  return `${retour('social', 'Social')}<h1>${esc(c.nom)}</h1>
    <p class="sub">${c.membres.length}/${c.max} membres · l’objectif de la semaine du club et ses récompenses sont dans les quêtes 🎯</p>
    ${blocChatClub()}
    <h2>Membres</h2><div class="classe av-m">${c.membres.map(m => `<div class="${m.moi ? 'moi-l' : ''}">${avatarHTML(m.perso)}<b>${lienJ(m.pseudo)}${m.role === 'president' ? ' 👑' : ''}</b>
      <small>niv. ${m.niveau}</small><em>${plur(m.victoires, 'victoire')}</em></div>`).join('')}</div>
    <h2>Classement des clubs</h2><div class="cl-liste">${liste}</div>
    <button class="btn ghost danger" data-act="club-quitter" style="width:100%;margin-top:14px">Quitter le club</button>`;
}

// ── albums (Club) ────────────────────────────────────────────────────────────────
function vueAlbums() {
  const A = S().albums || [], eqs = [...new Set(A.map(a => a.equipe))];
  return `${retour('club', 'Club')}<h1>Albums</h1>
    <p class="sub">Une équipe complète à un palier (une carte de chaque joueur, à ce palier ou mieux) = une récompense 📒</p>
    ${eqs.map(eq => `<h2>${esc(NOM_EQUIPE[eq] || eq)} <small class="sub">${eq}</small></h2><div class="alb">${A.filter(a => a.equipe === eq).map(a => {
      const plein = a.total && a.possede >= a.total;
      return `<div class="alb-t t-${a.palier}${a.fait ? ' fait' : plein ? ' plein' : ''}"><b>${R_LABEL[a.palier]}</b><small>${a.possede}/${a.total}</small>
        <span class="bar"><i style="width:${a.total ? 100 * a.possede / a.total : 0}%"></i></span><span class="alb-r">${RECOMP(a.recompense || {})}</span>
        ${a.fait ? '<em>✓ Fini</em>' : plein ? `<button class="btn gold petit" data-album="${a.equipe}:${a.palier}">Récupérer</button>` : ''}</div>`; }).join('')}</div>`).join('')}`;
}

// ── staff (Club) ─────────────────────────────────────────────────────────────────
const staffListe = () => S().staff?.liste || [];
const staffDe = id => staffListe().find(x => x.id === id);
function vueStaff() {
  const actif = staffActif(), n = PARAMS.fusion_nombre ?? 3;
  const bloc = x => {
    const ex = x.exemplaires || {}, possede = !!x.meilleur;
    // progression : la valeur du passif à chaque palier, le palier atteint en couleur
    const pal = RARETES.map(r => `<i class="p-${r}${x.meilleur === r ? ' on' : ''}${STAFF_RANG[r] <= STAFF_RANG[x.meilleur] ? ' ok' : ''}">${R_LABEL[r][0]} ${staffValeur(x, r)}</i>`).join('');
    const copies = RARETES.filter(r => ex[r]).map(r => `<i class="p-${r}${ex[r] >= n && palierSuivant(r) ? ' fus' : ''}">${R_LABEL[r][0]}×${ex[r]}</i>`).join('');
    const fusion = RARETES.filter(r => palierSuivant(r) && ex[r] >= n)[0];
    return `<div class="stf-c${possede ? ' a' : ''}${x.id === actif ? ' on' : ''}">${staffCarteHTML(x)}
      ${x.intro ? `<p class="stf-i">${esc(x.intro)}</p>` : ''}
      <span class="stf-p" aria-label="passif à chaque palier">${pal}</span>
      ${copies ? `<span class="stf-x">${copies}</span>` : ''}
      ${fusion ? `<button class="btn gold petit" data-staff-fusion="${x.id}:${fusion}">Fusionner ${n} ${R_LABEL[fusion]} → ${R_LABEL[palierSuivant(fusion)]} · ${nb(PARAMS.fusion_cout?.[fusion] ?? 0)} <i class="coin"></i></button>` : ''}
      ${x.id === actif ? '<em>Dans ton équipe</em>' : possede ? `<button class="btn ghost petit" data-staff-mettre="${x.id}">Placer dans l’équipe</button>` : '<em class="stf-b">🎁 Dans les boosters</em>'}</div>`;
  };
  return `${retour('club', 'Club')}<h1>Staff</h1>
    <p class="sub">Des cartes qui ne jouent pas, à trouver dans les boosters (gratuit et mystère) : place-en une dans ton équipe (onglet Équipe), son passif compte tant qu’elle y est. Comme les joueurs, ${n} cartes identiques du même palier fusionnent vers le palier suivant, et le passif grandit 🧑‍🏫</p>
    <div class="stf">${staffListe().map(bloc).join('')}</div>`;
}
// la place staff de l'onglet Équipe : choisir parmi ses cartes
// « Voir toutes les cartes staff » (demande de Maël, retour de Rémi, 20 nov. 2026) : toutes les cartes dans la même fenêtre, on change
// sans quitter l'onglet Équipe (comme pour les joueurs) ; celles qu'on n'a pas encore sont grisées
function fenetreStaffEquipe(tout) {
  const actif = staffActif(), liste = tout ? staffListe() : staffListe().filter(x => x.meilleur);
  const carte = x => x.meilleur ? `<button class="stf-c a${x.id === actif ? ' on' : ''}" data-staff-mettre="${x.id === actif ? '' : x.id}">${staffCarteHTML(x)}
      <em>${x.id === actif ? 'Dans ton équipe · retirer' : 'Placer'}</em></button>`
    : `<div class="stf-c a absente">${staffCarteHTML(x)}<em>🎁 Dans les boosters</em></div>`;
  ouvrirOverlay(`<div class="sheet"><h3>${tout ? 'Toutes les cartes staff' : 'Carte staff de l’équipe'}</h3><p class="sub">Une seule place : elle ne joue pas, mais son passif compte en match, à l’entraînement ou pour les pièces. C’est ton meilleur exemplaire de la carte qui compte.</p>
    ${liste.length ? `<div class="stf">${liste.map(carte).join('')}</div>` : '<p class="sub">Tu n’as pas encore de carte staff : elles sortent des boosters (gratuit et mystère).</p>'}
    <button class="btn gold" data-act="${tout ? 'staff-miennes' : 'staff-toutes'}">${tout ? 'Seulement mes cartes' : 'Voir toutes les cartes staff'}</button>
    <button class="btn ghost" data-act="fermer">Fermer</button></div>`);
}
const COMPO = {id: null, choix: []};
function vueDefis() {
  const d = S().defis || [];
  const tuile = x => { const pos = !x.fait && compoAuto(x.regle).ok;
    return `<div class="df${x.fait ? ' fait' : ''}${pos ? ' possible' : ''}"><div class="df-t"><b>${esc(x.titre)}</b><small>${esc(x.texte)}</small>
      <span class="df-r">${RECOMP(x.recompense)}</span></div>
      ${x.fait ? '<span class="df-ok">✓ Réussi</span>' : `<button class="btn ${pos ? 'gold' : 'ghost'} petit" data-compo="${x.id}">${pos ? 'Faire' : 'Voir'}</button>`}</div>`; };
  const sem = d.filter(x => x.periode === 'semaine'), mois = d.filter(x => x.periode === 'mois');
  return `${retour('jouer', 'Jouer')}<h1>Défis</h1>
    <p class="sub">Donne des cartes en trop qui suivent la règle : elles partent, la récompense arrive 🎁</p>
    <h2>Cette semaine</h2><p class="sub petit">Nouveaux défis lundi · jusqu’au ${S().finSemaine ? dateCourte(S().finSemaine) : 'dimanche'}</p>
    <div class="dfs">${sem.map(tuile).join('') || '<p class="sub">Pas de défi cette semaine.</p>'}</div>
    ${mois.length ? `<h2>Défi du mois</h2><div class="dfs">${mois.map(tuile).join('')}</div>` : ''}`;
}
function fenetreCompo(id) {
  const x = (S().defis || []).find(d => d.id === id);
  if (!x) return;
  COMPO.id = id; COMPO.choix = compoAuto(x.regle).choix.map(e => e.id);
  const nbJ = {}; EX().forEach(e => { nbJ[e.carte] = (nbJ[e.carte] || 0) + 1; });
  const libres = compoLibres().filter(e => compoUtile(x.regle, e))
    .sort((a, b) => (nbJ[a.carte] > 1 ? 0 : 1) - (nbJ[b.carte] > 1 ? 0 : 1) || RANG(a.palier) - RANG(b.palier) || a.note - b.note);
  ouvrirOverlay(`<div class="sheet compo-s"><h3>${esc(x.titre)}</h3>
    <p class="sub petit">${esc(x.texte)} · ${RECOMP(x.recompense)}</p>
    <ul class="cp-regles"></ul>
    <p class="sub petit">On t’a proposé tes cartes en trop : touche une carte pour la choisir ou la retirer (cartes hors de ton équipe).</p>
    <div class="cp-grille">${libres.map(e => `<button class="cp-c" data-compo-c="${e.id}" aria-pressed="false">${carteHTML(vue(e), {qty: nbJ[e.carte]})}</button>`).join('')
      || '<p class="sub">Aucune de tes cartes libres ne convient pour l’instant.</p>'}</div>
    <button class="btn gold" data-act="compo-ok" disabled>Donner les cartes</button>
    <button class="btn" data-act="fermer">Annuler</button></div>`);
  majCompo();
}
function majCompo() {
  const x = (S().defis || []).find(d => d.id === COMPO.id), o = $('#overlay');
  if (!x || !o.querySelector('.compo-s')) return;
  const choix = COMPO.choix.map(exParId).filter(Boolean), test = compoTest(x.regle, choix), ok = test.every(t => t.ok);
  o.querySelector('.cp-regles').innerHTML = test.map(t => `<li class="${t.ok ? 'r-ok' : ''}">${t.ok ? '✓' : '○'} ${esc(t.txt)}</li>`).join('');
  o.querySelectorAll('[data-compo-c]').forEach(b => { const on = COMPO.choix.includes(b.dataset.compoC); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const btn = o.querySelector('[data-act="compo-ok"]');
  btn.disabled = !ok; btn.textContent = `Donner ${choix.length} carte${choix.length > 1 ? 's' : ''} · ${texteRecomp(x.recompense)}`;
}
function basculerCompo(id) {
  const i = COMPO.choix.indexOf(id);
  if (i >= 0) COMPO.choix.splice(i, 1); else COMPO.choix.push(id);
  majCompo();
}
function validerCompo() {
  const x = (S().defis || []).find(d => d.id === COMPO.id);
  if (!x) return;
  demander(`Donner ces ${COMPO.choix.length} cartes ? Elles quittent ton club pour de bon.`, 'Donner').then(oui => oui && !occupe &&
    action(Compte.faireDefi(COMPO.id, COMPO.choix.slice()), r => { Son.jouer('recompense'); toast(`Défi réussi ! +${texteRecomp(r.recompense)}`); fermerOverlay(); }));
}

// ── club : la collection ────────────────────────────────────────────────────────
const enJeu = () => CARTES.filter(c => c.actif !== false);   // cartes encore tirées dans les boosters
function vueClub() {
  const eqs = ['tous', 'SG1', 'SG2', 'SF1', 'SF2', '-18G', '-18F1', '-18F2', '-15G', '-15F', 'fusion'];
  const vus = CARTES.filter(c => (c.actif !== false || mesEx(c.id).length)
    && (filtre === 'tous' || (filtre === 'fusion' ? fusionsPossibles(c.id).length : deLEquipe(c, filtre)))
    && (filtrePoste === 'tous' || (c.postes?.length ? c.postes : [c.poste]).includes(filtrePoste)));   // un joueur à plusieurs postes est sous chacun
  const mes = vus.filter(c => mesEx(c.id).length).sort((a, b) => rangEx(mesEx(a.id)[0], mesEx(b.id)[0]));
  const autres = filtre === 'fusion' ? [] : vus.filter(c => !mesEx(c.id).length);
  const nf = CARTES.filter(c => fusionsPossibles(c.id).length).length;
  const differentes = new Set(EX().filter(x => !PAR_ID[x.carte]?.legende).map(x => x.carte)).size;
  const nbAlbums = (S().albums || []).filter(a => !a.fait && a.total && a.possede >= a.total).length;
  return `<h1>Mon club</h1>
    <div class="portes club-portes"><a class="porte albums" href="#albums"><span class="porte-ic" aria-hidden="true">📒</span><b>Albums</b><small>Complète chaque équipe, palier par palier</small>${nbAlbums ? `<b class="pastille">${nbAlbums}</b>` : ''}</a>
      <a class="porte staff" href="#staff"><span class="porte-ic" aria-hidden="true">🧑‍🏫</span><b>Staff</b><small>Ils ne jouent pas, mais aident ton club</small></a></div>
    <h2>Ta collection</h2>
    <div class="stats-row"><div class="stat"><b>${differentes}/${enJeu().length}</b><span>joueurs</span></div>
    <div class="stat"><b>${EX().length}</b><span>cartes</span></div>
    <div class="stat"><b>${noteEquipe().note || '–'}</b><span>note de l’équipe</span></div></div>
    <p class="sub petit">Touche une carte pour l’entraîner, la fusionner ou la vendre. 3 cartes identiques = 1 palier au-dessus ⬆️</p>
    <div class="bar"><i style="width:${vus.length ? 100 * mes.length / vus.length : 0}%"></i></div>
    <div class="filters" style="margin-top:14px">${eqs.map(e => `<button data-filtre="${e}" class="${filtre === e ? 'on' : ''}">${
      e === 'tous' ? 'Toutes' : e === 'fusion' ? `Fusions (${nf})` : e}</button>`).join('')}</div>
    <div class="filters f-postes" role="group" aria-label="Poste">${['tous', ...POSTES.map(p => p.id)].map(p =>
      `<button data-fposte="${p}" class="${filtrePoste === p ? 'on' : ''}" aria-pressed="${filtrePoste === p}">${p === 'tous' ? 'Tous postes' : p}</button>`).join('')}</div>
    <div class="grid">${mes.map(c => {
      // demande de Maël : bien voir combien on a de chaque carte (au total et par palier ; 3 au même palier = fusion)
      const ex = mesEx(c.id), best = ex[0], n = ex.length, nf = PARAMS.fusion_nombre || 3;
      const par = PALIERS.map(p => [p, ex.filter(e => e.palier === p.id).length]).filter(([, k]) => k);
      return `<div class="cg">${carteHTML(vue(best), {qty: n, cls: fusionsPossibles(c.id).length ? 'peut-fusion' : ''})}
        ${enForme(c.id) ? `<span class="cg-forme">🔥 +${bonusForme(c.id)} en match</span>` : ''}
        <div class="cg-q" aria-label="${n} exemplaire${n > 1 ? 's' : ''}">${par.map(([p, k]) =>
          `<span class="pq t-${p.id}${k >= nf && p.id !== 'ultime' ? ' plein' : ''}" title="${p.nom}">${p.nom[0]}<b>×${k}</b></span>`).join('')}</div></div>`;
    }).join('')}${autres.map(c => carteHTML(c, {cache: true})).join('')}</div>
    ${!mes.length && filtre === 'fusion' ? '<p class="sub">Aucune fusion possible : il faut 3 fois le même joueur au même palier.</p>'
      : !vus.length ? '<p class="sub">Aucun joueur à ce poste dans cette équipe.</p>' : ''}`;
}

// ── hexagone des stats, façon jeu (demande de Maël : fiche du joueur et stats de l'équipe) ──────────────────────────
// 6 axes (les 6 stats), grille en bandes, forme en dégradé à la couleur du palier qui grandit depuis le centre, pastilles des
// valeurs qui comptent jusqu'à leur valeur (en relief, dorées pour les stats mises en avant). Seuls transform et opacity sont
// animés ; changer de palier fait glisser la forme (hexMorph, quelques images sur un petit SVG).
const HEX_R = 46, HEX_TON = {legende: ['#fff6d8', '#c9a24a'], bronze: ['#f0b384', '#b86a35'], argent: ['#f1f5f9', '#8f9aa8'], or: ['#ffe39a', '#c9952b'], ultime: ['#b8f28f', '#4c9c2a'], equipe: ['#8fd0ff', '#2f6fc4']};
let hexId = 0;
const hexPoint = (i, v, min = 0) => { const a = (-90 + i * 60) * Math.PI / 180, r = HEX_R * Math.max(0, Math.min(1, (v - min) / (99 - min)));
  return [r * Math.cos(a), r * Math.sin(a)]; };
const hexPoints = (liste, s, min) => liste.map(([k], i) => hexPoint(i, s[k] || 0, min).map(n => n.toFixed(2)).join(',')).join(' ');
// liste : STATS_CHAMP ou STATS_GB ; s : {clé: valeur} ; o : {ton, fond (contour en pointillé), forts: [clés], min (centre), titre}
function hexHTML(liste, s, o = {}) {
  const id = 'hx' + (++hexId), [c1, c2] = HEX_TON[o.ton] || HEX_TON.or, min = o.min ?? 0;
  const bande = (f, cls) => `<polygon class="${cls}" points="${liste.map((_, i) => hexPoint(i, min + (99 - min) * f, min).map(n => n.toFixed(2)).join(',')).join(' ')}"/>`;
  const pastilles = liste.map(([k, ab], i) => { const a = (-90 + i * 60) * Math.PI / 180, x = 50 + 41 * Math.cos(a), y = 50 + 41 * Math.sin(a) * .92;
    return `<span class="hx-p${o.forts?.includes(k) ? ' fort' : ''}" style="left:${x}%;top:${y}%;--i:${i}"><small>${ab}</small><b data-v="${Math.round(s[k] || 0)}">${moinsAnim() ? Math.round(s[k] || 0) : 0}</b></span>`; }).join('');
  return `<div class="hx" data-min="${min}" data-liste="${liste === STATS_GB ? 'gb' : 'champ'}" style="--c1:${c1};--c2:${c2}">
    <svg viewBox="-60 -60 120 120" aria-hidden="true"><defs><radialGradient id="${id}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${c1}" stop-opacity=".95"/>
      <stop offset="1" stop-color="${c2}" stop-opacity=".85"/></radialGradient></defs>
      ${bande(1, 'hx-b1')}${bande(.75, 'hx-b2')}${bande(.5, 'hx-b1')}${bande(.25, 'hx-b2')}
      ${liste.map((_, i) => { const [x, y] = hexPoint(i, 99, min); return `<line class="hx-a" x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`; }).join('')}
      ${o.fond ? `<polygon class="hx-fond" points="${hexPoints(liste, o.fond, min)}"/>` : ''}
      <g class="hx-forme"><polygon class="hx-halo" points="${hexPoints(liste, s, min)}"/><polygon class="hx-f" fill="url(#${id})" points="${hexPoints(liste, s, min)}"/>
      ${liste.map(([k], i) => { const [x, y] = hexPoint(i, s[k] || 0, min); return `<circle class="hx-d" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2"/>`; }).join('')}</g>
    </svg>${pastilles}${o.titre ? `<em class="hx-t">${o.titre}</em>` : ''}</div>`;
}
// à l'affichage : la forme grandit, les pastilles apparaissent puis comptent jusqu'à leur valeur
function hexAnimer(racine = document) {
  racine.querySelectorAll('.hx:not(.hx-on)').forEach(h => {
    h.classList.add('hx-on');
    if (moinsAnim()) return;
    const vals = [...h.querySelectorAll('b[data-v]')], t0 = performance.now() + 250, D = 700;
    const pas = t => { const k = Math.min(1, Math.max(0, (t - t0) / D)), e = 1 - Math.pow(1 - k, 3);
      vals.forEach(b => { b.textContent = Math.round(+b.dataset.v * e); }); if (k < 1 && h.isConnected) requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
  });
}
// changer les valeurs d'un hexagone déjà affiché (autre palier) : la forme glisse, les pastilles comptent de l'ancienne à la nouvelle valeur
function hexMorph(h, liste, s, ton) {
  if (!h) return;
  const min = +h.dataset.min || 0, f = h.querySelectorAll('.hx-f, .hx-halo'), dots = h.querySelectorAll('.hx-d'), vals = [...h.querySelectorAll('b[data-v]')];
  const avant = liste.map(([k], i) => +vals[i].dataset.v), apres = liste.map(([k]) => Math.round(s[k] || 0));
  if (ton && HEX_TON[ton]) { const [c1, c2] = HEX_TON[ton]; h.style.setProperty('--c1', c1); h.style.setProperty('--c2', c2);
    h.querySelectorAll('stop').forEach((st, i) => st.setAttribute('stop-color', i ? c2 : c1)); }
  const t0 = performance.now(), D = moinsAnim() ? 0 : 420;
  const pas = t => { const k = D ? Math.min(1, (t - t0) / D) : 1, e = 1 - Math.pow(1 - k, 3), cur = avant.map((a, i) => a + (apres[i] - a) * e);
    const pts = liste.map((_, i) => hexPoint(i, cur[i], min));
    f.forEach(p => p.setAttribute('points', pts.map(q => q.map(n => n.toFixed(2)).join(',')).join(' ')));
    dots.forEach((d, i) => { d.setAttribute('cx', pts[i][0].toFixed(2)); d.setAttribute('cy', pts[i][1].toFixed(2)); });
    vals.forEach((b, i) => { b.textContent = Math.round(cur[i]); });
    if (k < 1) requestAnimationFrame(pas); else vals.forEach((b, i) => { b.dataset.v = apres[i]; });
  };
  requestAnimationFrame(pas);
}

// Fiche d'un joueur : ses stats en hexagone, ses 4 paliers, tes exemplaires, entraînement, fusion, vente
// (poste : ouverte depuis le choix d'un poste de l'onglet Équipe, avec un retour vers ce choix)
const FICHE = {carte: null, liste: null};
function fiche(carte, poste, de) {
  const c = PAR_ID[carte], mes = mesEx(carte), n = PARAMS.fusion_nombre || 3;
  const liste = statsDu(c.poste), meilleur = PALIERS.map(p => mes.filter(e => e.palier === p.id).sort((a, b) => b.note - a.note)[0]);
  const best = [...meilleur].reverse().find(Boolean), palH = best ? best.palier : 'bronze', noteH = best ? best.note : PALIER.bronze.min;
  Object.assign(FICHE, {carte, liste, poste, de});
  const forts = [...liste].sort((a, b) => (c.ecarts?.[b[0]] || 0) - (c.ecarts?.[a[0]] || 0)).slice(0, 2).map(x => x[0]);
  const hex = `<div class="fiche-hex">${hexHTML(liste, statsAuNiveau(c, noteH), {ton: c.legende ? 'legende' : palH, fond: statsAuNiveau(c, 99), forts, min: 20})}
    ${c.legende ? '' : `<div class="hx-ch">${PALIERS.map((p, i) => { const nt = meilleur[i] ? meilleur[i].note : p.min;
      return `<button class="t-${p.id}${p.id === palH ? ' on' : ''}" data-hex="${p.id}:${nt}">${p.nom}<b>${nt}</b></button>`; }).join('')}</div>`}
    <p class="sub petit centre">${best ? 'Ta meilleure carte' : 'Au plus bas du palier'} · en pointillé : au maximum (99) · points forts : ${forts.map(k => liste.find(x => x[0] === k)[2].toLowerCase()).join(' et ')}</p></div>`;
  const paliers = c.legende ? '' : PALIERS.map(p => {
    const a = mes.some(e => e.palier === p.id);
    return `<div class="pal${a ? '' : ' absent'}">${carteHTML(vueExemplaire(c, {palier: p.id, note: p.min}))}<small>${p.nom} ${p.min}–${p.max}</small></div>`;
  }).join('');
  const lignes = mes.map(e => {
    const v = vue(e), max = PALIER[e.palier].max, besoin = PARAMS.xp_par_point?.[e.palier] || 100;
    const cout = PARAMS.entrainement_cout?.[e.palier], gain = PARAMS.vente?.[e.palier];
    return `<div class="exl">${carteHTML(v)}<div class="exl-d"><b>${c.legende ? 'Légende' : R_LABEL[e.palier]} ${e.note}${e.note >= max ? ' · max' : ''}</b>
      <small>${c.legende ? 'Note maximale' : e.note >= max ? 'Au plafond du palier : fusionne pour monter' : `${e.xp}/${besoin} XP avant ${e.note + 1}`}${titulaireEx(e.id) ? ' · dans ton équipe' : remplacantEx(e.id) ? ' · remplaçant' : ''}${e.blessure > 0 ? ` · 🚑 blessure ${esc(e.blessureG || '')}, absent(e) ${e.blessure} match${e.blessure > 1 ? 's' : ''}` : ''}${e.verrou ? ' · en vente au marché' : ''}</small>
      ${e.note < max ? `<div class="bar"><i style="width:${100 * e.xp / besoin}%"></i></div>` : ''}
      <div class="exl-b">${e.note < max ? `<button class="btn gold petit" data-entrainer="${e.id}">Entraîner · ${nb(cout)}</button>` : ''}
        ${!dansEquipe(e.id) && !e.verrou ? `<button class="btn ghost petit" data-vendre="${e.id}">Vendre · +${nb(gain)}</button>` : ''}
        ${!c.legende && !dansEquipe(e.id) && !e.verrou ? `<button class="btn ghost petit" data-mk-choisir="${e.id}">Au marché</button>` : ''}</div></div></div>`;
  }).join('');
  const fusions = RARETES.filter(r => palierSuivant(r)).map(r => {
    const k = mes.filter(e => e.palier === r && !e.verrou).length;
    if (!k) return '';
    const cout = PARAMS.fusion_cout?.[r];
    const s = palierSuivant(r), apres = k >= n ? noteApresFusion(carte, r) : 0;
    return k >= n ? `<button class="btn gold large" data-fusion="${carte}:${r}">Fusionner ${n} ${R_LABEL[r]} → 1 ${R_LABEL[s]} ${apres} · ${nb(cout)} pièces</button>
      ${apres > PALIER[s].min ? `<p class="sub petit">Ton entraînement compte : la moitié passe à la nouvelle carte (${R_LABEL[s]} ${apres} au lieu de ${PALIER[s].min}).</p>` : ''}`
      : `<p class="sub petit">${R_LABEL[r]} : ${k}/${n} pour fusionner vers ${R_LABEL[palierSuivant(r)]}</p>`;
  }).join('');
  ouvrirOverlay(`<div class="sheet fiche">${de ? `<button class="retour" data-retour-equipe="${esc(de)}">‹ Équipe de ${esc(de)}</button>`
    : poste ? `<button class="retour" data-retour-poste="${poste}">‹ ${poste === 'GB' ? 'Gardien(ne)' : 'Poste ' + poste}</button>` : ''}
    <h3>${esc(c.nom)} <small>${c.legende ? `Légende du club · équipes ${libelleEquipes(c).toLowerCase()}` : libelleEquipes(c).replace('/', ' / ')} · ${nomsPostes(c)}${Number.isInteger(c.numero) ? ` · n° ${c.numero}` : ''}</small></h3>
    ${c.fiche?.intro ? `<p class="f-desc">${esc(c.fiche.intro)}</p>` : ''}
    ${hex}
    ${paliers ? `<div class="paliers">${paliers}</div>` : ''}
    ${mes.length ? `<h4>Tes cartes (${mes.length})</h4>${lignes}${fusions}` : '<p class="sub">Tu n’as pas encore ce joueur : ouvre des boosters !</p>'}
    <div class="fiche-j">${ficheHTML(c.fiche && {...c.fiche, intro: ''}) || (c.cree ? '' : `<div class="kv"><div><b>${c.mj}</b><span>matchs</span></div><div><b>${c.buts}</b><span>buts</span></div><div><b>${String(c.bpm).replace('.', ',')}</b><span>buts / match</span></div></div>`)}</div>
    <button class="btn" data-act="fermer">Fermer</button></div>`);
  hexAnimer($('#overlay'));
}

// ── Équipe ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function noteEquipe() {
  const places = POSTES.filter(p => aligne(p.id));
  if (!places.length) return {note: 0, collectif: 0, n: 0, hors: 0};
  const cs = places.map(p => aligne(p.id));
  const moy = places.reduce((a, p) => a + noteAuPoste(aligne(p.id), p.id), 0) / 7;   // une place vide compte 0
  const hors = places.filter(p => horsPoste(aligne(p.id), p.id)).length;
  const collectif = collectifDe(cs);   // bonus quand on aligne des coéquipier(e)s (2 équipes possibles, une légende est de toutes celles de son genre)
  return {note: Math.min(99, Math.round(moy + collectif)), collectif, n: places.length, hors};
}
// Tactiques (même calcul que tactique_bonus dans schema.sql) : chaque choix s'appuie sur deux stats ; bonus de 2 % pour une
// équipe moyenne, jusqu'à 10 % si elle est spécialisée dans ces deux stats, 0 % si elle est à l'opposé.
const TACT_ATT = [['duels', 'Duels', ['tir', 'phy']], ['enclenchement', 'Enclenchement', ['men', 'pas']], ['rapide', 'Jeu rapide', ['def', 'vit']]];
const TACT_DEF = [['06', '0-6', ['tir', 'def']], ['15', '1-5', ['men', 'phy']], ['33', '3-3', ['pas', 'vit']]];
const NOM_STAT = Object.fromEntries(STATS_CHAMP.map(([k, , n]) => [k, n]));
function tactiqueActuelle() {
  const t = String(S().tactique || ''), m = t.match(/^(duels|enclenchement|rapide):(06|15|33)$/);
  return m ? {att: m[1], def: m[2], choisie: true} : {att: 'duels', def: '06', choisie: false};
}
// moyennes des 6 stats des joueurs de champ alignés (à la note de leur poste, comme le serveur)
// qui : la carte à chaque poste (par défaut les titulaires ; l'équipe des remplaçants : le remplaçant, sinon le titulaire)
function moyennesEquipe(qui = aligne) {
  const champ = POSTES.filter(p => !p.gb).map(p => [p, qui(p.id)]).filter(([, c]) => c);
  if (!champ.length) return null;
  const m = Object.fromEntries(STATS_CHAMP.map(([k]) => [k, 0]));
  for (const [p, c] of champ) { const st = statsAuNiveau(c.estGB ? {...c, poste: null} : c, noteAuPoste(c, p.id)); for (const k in m) m[k] += (st[k] || 0) / 6; }
  return m;
}
function bonusTactique(m, stats) {
  if (!m) return 0;
  // comme le serveur : moyennes arrondies au dixième, bonus arrondi au millième (sinon « 2 % » ici et « 3 % » en match)
  const r = k => Math.round(m[k] * 10) / 10;
  const tout = Object.keys(m).reduce((a, k) => a + r(k), 0) / 6, spe = (r(stats[0]) + r(stats[1])) / 2 / tout - 1;
  const base = PARAMS.tactique_bonus_base ?? .02, max = PARAMS.tactique_bonus_max ?? .1, pente = PARAMS.tactique_pente ?? .4;
  return Math.round(Math.max(0, Math.min(max, base + pente * spe)) * 1000) / 1000;
}
const pc100 = x => Math.round(x * 100) + ' %';
// vignette d'un joueur aligné : sa photo (ou ses initiales) dans un rond aux couleurs du palier, et son nom
function vignetteHTML(c) {
  const [prenom, ...reste] = c.nom.split(' ');
  return `<span class="vig r-${c.rarete}${c.legende ? ' legende' : ''}" style="--tc:${TEINTE[c.rarete] || '212 140 88'}" aria-label="${esc(c.nom)}, ${R_LABEL[c.rarete] || ''}">
    <span class="vig-p">${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : `<b>${esc(initiales(c.nom))}</b>`}</span>
    <span class="vig-n"><b>${esc(prenom)}</b>${reste.length ? `<small>${esc(reste.join(' '))}</small>` : ''}</span>${enForme(c.id) ? '<i class="vig-f" aria-label="joueur de la semaine">🔥</i>' : ''}${c.ex?.blessure > 0 ? `<i class="vig-b" aria-label="blessé(e) : ${c.ex.blessure} match${c.ex.blessure > 1 ? 's' : ''} d’absence">🚑</i>` : ''}</span>`;
}
// notre demi-terrain aux mesures officielles (20 m de large, but de 3 m), notre but en bas. La zone n'est pas un demi-cercle :
// deux quarts de cercle de 6 m centrés sur les poteaux, reliés par 3 m de ligne droite (15 m de large, 6 m de profondeur).
// 9 m : même tracé à 9 m, en pointillés, coupé par les lignes de touche ; 7 m : 1 m de long ; 4 m : 15 cm.
function terrainSVG() {
  const H = TERRAIN_H + TERRAIN_B, G = TERRAIN_H, n9 = G - Math.sqrt(81 - 8.5 * 8.5);
  return `<svg class="pitch-l" viewBox="-10 0 20 ${H}" aria-hidden="true">
    <rect class="aire" x="-10" y="0" width="20" height="${G}"/>
    <path class="zone" d="M-7.5 ${G} A6 6 0 0 1 -1.5 ${G - 6} H1.5 A6 6 0 0 1 7.5 ${G} Z"/>
    <path d="M-10 ${G} H10 M-7.5 ${G} A6 6 0 0 1 -1.5 ${G - 6} H1.5 A6 6 0 0 1 7.5 ${G}"/>
    <path class="neuf" d="M-10 ${n9} A9 9 0 0 1 -1.5 ${G - 9} H1.5 A9 9 0 0 1 10 ${n9}"/>
    <path d="M-0.5 ${G - 7} h1 M-0.075 ${G - 4} h.15"/><rect class="but" x="-1.5" y="${G}" width="3" height="1"/></svg>`;
}
// Compos enregistrées (demande de Rémi, 23 nov. 2026) : 3 emplacements, chacun garde titulaires, remplaçants, capitaine, tactique
// et carte staff (compo_enregistrer, compo_charger : un joueur fusionné revient avec son meilleur exemplaire)
function blocCompos() {
  const cs = S().compos || [], n = o => Object.keys(o || {}).length;
  const tac = t => { const [a, d] = String(t || '').split(':'); return NOM_ATT[a] && NOM_DEF[d] ? `${NOM_ATT[a]} + ${NOM_DEF[d]}` : ''; };
  return `<h3 class="banc-t">Mes compos <small>équipe, banc, capitaine, tactique et staff</small></h3>
    <div class="cps">${[1, 2, 3].map(i => { const c = cs[i - 1];
      return `<div class="cps-l${c ? '' : ' vide'}"><span class="cps-t"><b>Compo ${i}</b><small>${c ? `${n(c.equipe)} titulaires · ${n(c.remplacants)} remplaçants${tac(c.tactique) ? ' · ' + tac(c.tactique) : ''}` : 'vide'}</small></span>
        <span class="cps-b">${c ? `<button class="btn gold" data-compo-charger="${i}">Charger</button>` : ''}<button class="btn ghost" data-compo-enr="${i}">${c ? 'Remplacer' : 'Enregistrer'}</button></span></div>`; }).join('')}</div>`;
}
function vueEquipe() {
  const t = noteEquipe(), T = tactiqueActuelle(), m = moyennesEquipe(), pl = PLACEMENTS[T.def];
  const H = TERRAIN_H + TERRAIN_B, px = x => (x + 10) / 20 * 100, py = y => (TERRAIN_H - y) / H * 100;   // en % du terrain
  // sur le terrain : une vignette résumée (photo ronde aux couleurs du palier + nom), bien plus lisible qu'une carte en petit
  const carte = p => { const c = aligne(p.id), hors = c && horsPoste(c, p.id), cap = c && c.ex?.id === S().capitaine;
    return `${c ? vignetteHTML(c) : '<span class="empty">+</span>'}${cap ? '<i class="cap" aria-label="capitaine">C</i>' : ''}<em${hors ? ' class="hors"' : ''}>${p.id}${hors ? ` −${malusHors()}` : ''}</em>`; };
  // liens : deux voisins de la même équipe du club (leur collectif compte), en doré
  const posDe = id => { const p = POSTES.find(x => x.id === id), [x, y] = p.gb ? [0, 1.1] : pl[id]; return [px(x), py(y)]; };
  const liens = LIENS.map(([u, v]) => { const a = aligne(u), b = aligne(v); if (!a || !b) return '';
    const [x1, y1] = posDe(u), [x2, y2] = posDe(v), meme = coequipiers(a, b);
    return `<line class="${meme ? 'or' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('');
  const slots = POSTES.map(p => { const [x, y] = p.gb ? [0, 1.1] : pl[p.id];
    return `<button class="slot${p.gb ? ' gb' : ''}" data-slot="${p.id}" style="left:${px(x)}%;top:${py(y)}%">${carte(p)}</button>`; }).join('');
  const terrain = terrainSVG();
  // l'équipe des remplaçants (retour de Guilhem, 21 nov. 2026) : son bonus pour chaque tactique, quand elle est sur le terrain
  // (le remplaçant de chaque poste, le titulaire là où il n'y en a pas)
  const mR = POSTES.some(p => !p.gb && remplacant(p.id)) ? moyennesEquipe(id => remplacant(id) || aligne(id)) : null;
  const cls = b => b >= .06 ? 'fort' : b <= .005 ? 'nul' : '';
  const bloc = (liste, cle) => liste.map(([k, nom, st]) => { const b = bonusTactique(m, st), on = T[cle] === k, bR = mR && bonusTactique(mR, st);
    return `<button class="tac${on ? ' on' : ''}" data-tac="${cle}:${k}"><b>${nom}</b><small>${NOM_STAT[st[0]]} · ${NOM_STAT[st[1]]}</small><em class="${cls(b)}">+${pc100(b)}</em>${mR ? `<i class="tac-r ${cls(bR)}">remplaçants +${pc100(bR)}</i>` : ''}</button>`; }).join('');
  const att = TACT_ATT.find(x => x[0] === T.att), def = TACT_DEF.find(x => x[0] === T.def);
  return `<h1>Équipe</h1>
    <p class="sub">Touche un poste pour aligner un joueur. Hors de son poste : −${malusHors()}. Des coéquipiers ensemble : bonus 🤝</p>
    <div class="teamnote"><div class="stat"><b>${t.note || '–'}</b><span>note d’équipe</span></div>
    <div class="stat"><b>+${t.collectif}</b><span>collectif</span></div><div class="stat"><b>${t.n}/7</b><span>postes</span></div></div>
    <p class="pitch-dispo">Placement en défense <b>${def[1]}</b><small>à changer dans Tactique, plus bas</small></p>
    <div class="pitch" style="aspect-ratio:20 / ${H}">${terrain}<svg class="liens" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${liens}</svg>${slots}</div>
    <p class="sub petit">Liens dorés : des coéquipiers de la même équipe côte à côte (le bonus collectif). <b>C</b> : ton capitaine, +${PARAMS.capitaine_bonus ?? 2} en match.${S().capitaine ? '' : ' Nomme-le en touchant son poste.'}</p>
    ${t.hors ? `<p class="sub warn">${t.hors} joueur${t.hors > 1 ? 's' : ''} hors de son poste (−${malusHors()} chacun)</p>` : ''}
    ${(() => { const l = POSTES.map(p => [p, aligne(p.id)]).filter(([, c]) => c?.ex?.blessure > 0);
      return l.length ? `<p class="sub warn">🚑 ${l.map(([p, c]) => { const r = remplacant(p.id), rOk = r && !(r.ex?.blessure > 0);
        return `<b>${esc(c.nom)}</b> (${p.id}) blessé(e), absent(e) ${c.ex.blessure} match${c.ex.blessure > 1 ? 's' : ''} : ${rOk ? `${esc(r.nom)} le remplacera` : 'sans remplaçant valide, il jouera diminué'}`; }).join(' · ')}</p>` : ''; })()}
    <h3 class="banc-t">Remplaçants <small>${POSTES.filter(p => remplacant(p.id)).length}/7 · ils entrent pendant les matchs</small></h3>
    <div class="banc">${POSTES.map(p => { const c = remplacant(p.id);
      return `<button class="banc-s${c ? '' : ' vide'}" data-banc="${p.id}" aria-label="Remplaçant ${p.id}">${c ? vignetteHTML(c) : '<span class="empty">+</span>'}<em>${p.id}</em></button>`; }).join('')}</div>
    ${(() => { const x = staffDe(staffActif());
      return `<button class="staff-place${x ? '' : ' vide'}" data-act="staff-place"><span class="sp-t">Staff</span>${x ? staffCarteHTML(x, 'mini') : '<span class="sp-plus" aria-hidden="true">+</span>'}
        <span class="sp-d"><b>${x ? esc(x.personne || x.nom) : 'Aucune carte staff'}</b><small>${x ? `${R_LABEL[x.meilleur] || ''} · ${staffEffet(x)}` : 'Place une carte staff : elle ne joue pas, mais donne son passif'}</small></span></button>`; })()}
    <button class="btn ghost" data-act="auto" style="width:100%">Aligner automatiquement la meilleure équipe et le banc</button>
    ${blocCompos()}
    <h2>Tactique</h2>
    ${m ? `<div class="hex-eq">${hexHTML(STATS_CHAMP, m, {ton: 'equipe', min: Math.max(0, Math.floor(Math.min(...Object.values(m)) - 12)), forts: [...att[2], ...def[2]], titre: 'Moyennes de tes 6 joueurs de champ'})}</div>
      <p class="sub petit centre">En doré : les deux stats de ton attaque (${att[1]}) et de ta défense (${def[1]}).</p>
      <p class="sub petit">Chaque tactique donne un bonus si ton équipe est forte dans ses deux stats (jusqu’à +${Math.round(100 * (PARAMS.tactique_bonus_max ?? .1))} %).${POSTES.some(p => !p.gb && remplacant(p.id)) ? ' En petit : le bonus quand tes remplaçants sont sur le terrain.' : ''}</p>` : '<p class="sub">Aligne tes joueurs pour voir les moyennes de ton équipe.</p>'}
    <h3 class="tac-t">Attaque</h3><div class="tacs">${bloc(TACT_ATT, 'att')}</div>
    <h3 class="tac-t">Défense : dispositif (le terrain montre le placement)</h3><div class="tacs">${bloc(TACT_DEF, 'def')}</div>
    <p class="sub petit">${T.choisie ? `${att[1]} + ${def[1]} : ta tactique de départ.` : 'Choisis ton attaque et ta défense de départ.'} En match, contrer l’adversaire compte encore plus 😉</p>`;
}
function choisir(poste) {
  // un même joueur ne joue qu'une fois : on écarte ceux déjà alignés à un autre poste
  const ailleurs = new Set(Object.entries(S().equipe || {}).filter(([k]) => k !== poste).map(([, id]) => exParId(id)?.carte));
  const ok = EX().filter(e => !e.verrou && PAR_ID[e.carte] && !ailleurs.has(e.carte) && peutJouer(PAR_ID[e.carte], poste))
    .map(vue).sort((a, b) => noteAuPoste(b, poste) - noteAuPoste(a, poste));
  const exA = S().equipe?.[poste] && exParId(S().equipe[poste]), actuel = exA && PAR_ID[exA.carte] ? vue(exA) : null;
  ouvrirOverlay(`<div class="sheet"><h3>${poste === 'GB' ? 'Gardien(ne) de but' : 'Poste ' + poste}</h3>
    ${actuel ? `<div class="pick-actuel">${carteHTML(actuel, {note: noteAuPoste(actuel, poste)})}<div><small>Aligné(e)</small><b>${esc(actuel.nom)}</b></div>
      <button class="btn ghost petit" data-voir-fiche="${actuel.id}" data-poste="${poste}">Voir la fiche</button>
      ${S().capitaine === actuel.ex.id ? '<span class="cap-on">C · capitaine</span>' : `<button class="btn ghost petit" data-capitaine="${actuel.ex.id}">Nommer capitaine</button>`}</div>` : ''}
    ${(rb => `<button class="banc-lien" data-banc="${poste}"><span aria-hidden="true">🔁</span> Remplaçant : <b>${rb ? esc(rb.nom) : 'aucun'}</b><i aria-hidden="true">›</i></button>`)(remplacant(poste))}
    <div class="picklist">${ok.length ? ok.map(c => `<div class="pick-l"><button class="pick" data-choix="${c.ex.id}" data-poste="${poste}">${carteHTML(c, {note: noteAuPoste(c, poste)})}<div><b>${esc(c.nom)}</b><small>${noteAuPoste(c, poste)} · ${R_LABEL[c.rarete]} · ${posteAffiche(c)} · ${c.equipe}${horsPoste(c, poste) ? ` · hors poste −${MALUS_HORS_POSTE}` : ''}${remplacantEx(c.ex.id) ? ' · remplaçant' : ''}</small></div></button>
      <button class="pick-f" data-voir-fiche="${c.id}" data-poste="${poste}" aria-label="Fiche de ${esc(c.nom)}"><span aria-hidden="true">⬡</span>Fiche</button></div>`).join('')
      : `<p class="sub">Aucune carte disponible pour ce poste. Ouvre des boosters !</p>`}</div>
    <div style="display:flex;gap:10px">${S().equipe?.[poste] ? `<button class="btn ghost" style="flex:1" data-act="retirer" data-poste="${poste}">Retirer</button>` : ''}
    <button class="btn" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}
// le remplaçant d'un poste : un joueur qui n'est ni titulaire ni remplaçant ailleurs, qui peut jouer à ce poste
function choisirBanc(poste) {
  const eq = S().equipe || {}, rp = S().remplacants || {};
  const pris = new Set([...Object.values(eq), ...Object.entries(rp).filter(([k]) => k !== poste).map(([, id]) => id)].map(id => exParId(id)?.carte));
  const ok = EX().filter(e => !e.verrou && PAR_ID[e.carte] && !pris.has(e.carte) && peutJouer(PAR_ID[e.carte], poste))
    .map(vue).sort((a, b) => noteAuPoste(b, poste) - noteAuPoste(a, poste));
  const actuel = remplacant(poste), tit = aligne(poste), nomP = poste === 'GB' ? 'gardien(ne)' : 'poste ' + poste;
  ouvrirOverlay(`<div class="sheet"><h3>Remplaçant · ${nomP}</h3>
    <p class="sub petit">Il entre pendant les matchs (bouton « Banc ») quand ton titulaire fatigue ou pour changer de jeu. Il ne compte pas dans la note d’équipe.</p>
    ${actuel ? `<div class="pick-actuel">${carteHTML(actuel, {note: noteAuPoste(actuel, poste)})}<div><small>Remplaçant</small><b>${esc(actuel.nom)}</b></div>
      <button class="btn ghost petit" data-voir-fiche="${actuel.id}" data-poste="${poste}">Voir la fiche</button>
      ${tit ? `<button class="btn ghost petit" data-banc-titulaire="${poste}">⇄ Titulaire</button>` : ''}</div>` : ''}
    ${tit ? `<p class="sub petit">Titulaire : <b>${esc(tit.nom)}</b> (${noteAuPoste(tit, poste)})</p>` : ''}
    <div class="picklist">${ok.length ? ok.map(c => `<div class="pick-l"><button class="pick" data-banc-choix="${c.ex.id}" data-poste="${poste}">${carteHTML(c, {note: noteAuPoste(c, poste)})}<div><b>${esc(c.nom)}</b><small>${noteAuPoste(c, poste)} · ${R_LABEL[c.rarete]} · ${posteAffiche(c)} · ${c.equipe}${horsPoste(c, poste) ? ` · hors poste −${MALUS_HORS_POSTE}` : ''}</small></div></button>
      <button class="pick-f" data-voir-fiche="${c.id}" data-poste="${poste}" aria-label="Fiche de ${esc(c.nom)}"><span aria-hidden="true">⬡</span>Fiche</button></div>`).join('')
      : `<p class="sub">Aucune carte libre pour ce poste : il faut un joueur qui n’est pas déjà dans ton équipe.</p>`}</div>
    <div style="display:flex;gap:10px">${actuel ? `<button class="btn ghost" style="flex:1" data-banc-retirer="${poste}">Retirer du banc</button>` : ''}
    <button class="btn" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}
// les meilleurs remplaçants possibles pour une équipe donnée (un par poste, jamais un titulaire, chaque joueur une fois)
function bancAuto(equipe, meilleurs) {
  const pris = new Set(Object.values(equipe).map(id => exParId(id)?.carte)), banc = {};
  for (const p of [...POSTES.filter(x => x.gb), ...POSTES.filter(x => !x.gb)]) {
    const c = meilleurs.filter(c => !pris.has(c.id) && peutJouer(c, p.id)).sort((a, b) => noteAuPoste(b, p.id) - noteAuPoste(a, p.id))[0];
    if (c) { banc[p.id] = c.ex.id; pris.add(c.id); }
  }
  return banc;
}
function autoEquipe() {
  // le meilleur exemplaire de chaque joueur, puis la meilleure répartition (malus hors poste compris)
  const meilleurs = Object.values(EX().filter(e => !e.verrou && PAR_ID[e.carte]).reduce((m, e) => {
    if (!m[e.carte] || rangEx(e, m[e.carte]) < 0) m[e.carte] = e; return m; }, {})).map(vue);
  // pour chaque ensemble de postes occupés (masque de bits), on garde le meilleur total trouvé
  const slots = POSTES.filter(x => !x.gb).map(x => x.id);
  const terrain = sauf => {
    let best = new Map([[0, {total: 0, choix: {}}]]);
    for (const c of meilleurs.filter(c => c !== sauf && joueChamp(c))) {
      const suite = new Map(best);
      for (const [masque, e] of best) slots.forEach((slot, i) => {
        if (masque & (1 << i)) return;
        const m = masque | (1 << i), total = e.total + noteAuPoste(c, slot);
        if (!(suite.get(m)?.total >= total)) suite.set(m, {total, choix: {...e.choix, [slot]: c.ex.id}});
      });
      best = suite;
    }
    return [...best.values()].reduce((a, e) => e.total > a.total ? e : a);
  };
  // chaque gardien(ne) possible (joueurs mixtes compris), et le meilleur terrain avec les autres
  const gardiens = meilleurs.filter(c => peutJouer(c, 'GB')).sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  let mieux = {total: -1, choix: {}};
  for (const g of gardiens.length ? gardiens : [null]) {
    const t = terrain(g), total = t.total + (g ? g.ovr : 0);
    if (total > mieux.total) mieux = {total, choix: g ? {GB: g.ex.id, ...t.choix} : t.choix};
  }
  const equipe = mieux.choix, banc = bancAuto(equipe, meilleurs);
  action(Compte.alignerRemplacants(equipe, banc), () => { toast(Object.keys(banc).length ? 'Ta meilleure équipe et ses remplaçants sont alignés' : 'Ta meilleure équipe est alignée'); route(true); });
}

// ── jouer : le championnat (les défis passent par les ami(e)s, l'entraînement par le Club) ───────────────
const JEU = {rencontres: null, charge: false};
const RES = {gagne: 'Victoire', nul: 'Match nul', perdu: 'Défaite'};
function chargerJeu(force) {
  if (JEU.charge || (!force && JEU.rencontres) || Compte.horsLigne) return;
  JEU.charge = true;
  Compte.rencontres().then(r => { JEU.rencontres = r; })
    .catch(e => toast(e.message)).finally(() => { JEU.charge = false; if (vueCourante() === 'championnat' && $('#overlay').hidden) route(true); });
}
// Jouer : deux grandes portes, le championnat (les matchs du parcours) et les mini-jeux pour gagner des pièces
function vueJouer() {
  const e = S(), j = e.jour || {}, l = e.limites || {}, pc = e.parcours;
  const restant = k => Math.max(0, (l[k] || 0) - (j[k] || 0));
  const mj = e.minijeux || {}, essais = seriesRestantes((mj.gardien || []).length, mj.limites?.gardien || 25)
    + ['contre', 'suspension'].reduce((t, k) => t + Math.max(0, (mj.limites?.[k] || 5) - (mj[k] || []).length), 0)
    + Math.max(0, (e.jet7m?.limite || 5) - (e.jet7m?.tirs || []).length);
  const pv = e.pvp || {};
  return `<h1>Jouer</h1>
    <a class="porte classe" href="#classe"><span class="porte-ic" aria-hidden="true">⚔️</span><b>Classé</b>
      <small>${pv.match ? '<em class="md-porte">Match en direct en cours : reprends-le</em> · ' : ''}${nb(pv.trophees ?? e.trophees ?? 0)} 🏆 · en direct contre un vrai joueur, trophées et arènes</small></a>
    <a class="porte championnat" href="#championnat"><span class="porte-ic" aria-hidden="true">🏆</span><b>Championnat VS Ordi</b>
      <small>${e.matchDirect ? '<em class="md-porte">Match en cours : reprends-le</em> · ' : ''}${pc ? `${esc(pc.type === 'legendes' ? pc.nom : pc.groupe + ' · ' + pc.nom)} · ` : ''}${e.matchMax ? `${matchsDispo(e)}/${e.matchMax} match${matchsDispo(e) > 1 ? 's' : ''} en réserve (${rechargeMatch()})` : `${matchsDispo(e)} match${matchsDispo(e) > 1 ? 's' : ''} aujourd’hui`} · de la Promotion aux Légendes</small></a>
    <a class="porte pieces" href="#pieces"><span class="porte-ic" aria-hidden="true"><i class="coin"></i></span><b>Gagner des pièces</b>
      <small>Jet de 7 m, arrêt réflexe, contre-attaque, tir en suspension · ${essais} essai${essais > 1 ? 's' : ''} aujourd’hui</small></a>
    <a class="porte defis" href="#defis"><span class="porte-ic" aria-hidden="true">🧩</span><b>Défis</b>
      <small>${(e.defis || []).filter(x => !x.fait).length} à faire · donne tes cartes en trop contre des boosters</small></a>`;
}
function vueChampionnat() {
  chargerJeu();
  const e = S(), j = e.jour || {}, l = e.limites || {};
  const complet = noteEquipe().n === 7, note = noteEquipe().note;
  const restant = (k) => Math.max(0, (l[k] || 0) - (j[k] || 0));
  const histo = (JEU.rencontres || []).slice(0, 8).map(r => `<div class="hist r-${r.resultat}"><b>${r.score ? r.score.join(' – ') : ''}</b>
    <span>${{championnat: 'Championnat', defi: 'Défi', defi_ami: 'Défi ami(e)', defense_ami: 'Défi ami(e) reçu'}[r.type] || 'Défendu'} · ${r.type === 'championnat' || r.type === 'ligue' ? esc(r.adversaire) : lienJ(r.adversaire)}</span><small>${RES[r.resultat] || ''}</small></div>`).join('');
  const T = tactiqueActuelle(), ta = TACT_ATT.find(x => x[0] === T.att)[1], td = TACT_DEF.find(x => x[0] === T.def)[1];
  return `${retour('jouer', 'Jouer')}<h1>Championnat VS Ordi</h1>
    ${complet ? '' : '<div class="daily hors"><p><b>Ton équipe n’est pas complète</b>Aligne 7 joueurs dans l’onglet Équipe pour jouer des matchs.</p></div>'}
    <p class="sub petit">Tactique : <b>${ta}</b> et <b>${td}</b>${T.choisie ? '' : ' (par défaut)'} · <a href="#equipe">changer dans l’onglet Équipe</a></p>
    ${blocParcours(e, complet && matchsDispo(e) > 0, note, matchsDispo(e))}
    ${histo ? `<h2>Derniers matchs</h2><div class="hists">${histo}</div>` : ''}`;
}
// Gagner des pièces : 4 grandes tuiles animées (une scène par jeu) ; « ? » pour revoir le tuto
const NOMS_TUILE = {'7m': 'Jet de 7 mètres', gardien: 'Arrêt réflexe', contre: 'Passe en contre', suspension: 'Tir en suspension'};
const seriesRestantes = (faits, lim) => Math.max(0, Math.ceil(lim / SERIE) - Math.ceil(faits / SERIE));   // une série commencée compte
const gainMini = k => { const m = S().minijeux || {}; return m.gains?.[k] ?? m.pieces ?? (k === 'gardien' ? 10 : 50); };
function vuePieces() {
  const e = S(), j = e.jet7m || {tirs: [], limite: 5, piecesBut: 50, bonus: 100}, m = e.minijeux || {};
  const tuiles = [{k: '7m', attr: 'data-act="jet7m"', liste: j.tirs, lim: j.limite, succes: 'but', gain: `${j.piecesBut} par but`, unite: 'tir'},
    ...Object.entries(MINI).map(([k, d]) => ({k, attr: `data-mini="${k}"`, liste: m[k] || [], lim: m.limites?.[k] || m.limite || 5, succes: d.succes,
      gain: `${gainMini(k)} par ${k === 'gardien' ? 'arrêt' : 'but'}`, unite: k === 'gardien' ? 'série' : 'essai'}))];
  let essais = 0;
  const html = tuiles.map((t, i) => {
    const ok = t.liste.filter(x => x === t.succes).length;
    // l'arrêt réflexe se compte en séries de 5 tirs (5 séries par jour, et non 25 tirs)
    const reste = t.k === 'gardien' ? seriesRestantes(t.liste.length, t.lim) : Math.max(0, t.lim - t.liste.length); essais += reste;
    // pastilles : une par essai ; à l'arrêt réflexe, une par série de 5 tirs (pleine si 5 arrêts)
    const past = t.k === 'gardien' ? Array.from({length: Math.ceil(t.lim / SERIE)}, (_, i) => { const s = t.liste.slice(i * SERIE, i * SERIE + SERIE);
        return `<i class="j7p${s.length === SERIE ? (s.every(x => x === 'arret') ? ' j7p-ok' : ' j7p-ko') : ''}"></i>`; }).join('') + `<small>${ok} arrêt${ok > 1 ? 's' : ''}</small>`
      : Array.from({length: t.lim}, (_, i) => `<i class="j7p${t.liste[i] ? (t.liste[i] === t.succes ? ' j7p-ok' : ' j7p-ko') : ''}"></i>`).join('');
    return `<div class="jeu-w" style="--i:${i}"><button class="jeu j-${t.k}" ${t.attr}${reste ? '' : ' disabled'}>
      ${sceneJeu(t.k)}<b class="jeu-nom">${NOMS_TUILE[t.k]}</b><small class="jeu-gain"><i class="coin"></i>${t.gain}</small>
      <span class="j7-pastilles petit">${past}</span>
      <span class="jeu-go">${reste ? `Jouer · ${reste} ${t.unite}${reste > 1 ? 's' : ''}` : '✓ Reviens demain'}</span></button>
      <button class="jeu-aide" data-tuto="${t.k}" aria-label="Comment jouer : ${NOMS_TUILE[t.k]}">?</button>
      <button class="jeu-entr" data-mini-entr="${t.k}" aria-label="S’entraîner : ${NOMS_TUILE[t.k]}, sans pièces">🎯 S’entraîner</button></div>`;
  }).join('');
  return `${retour('jouer', 'Jouer')}<h1>Gagner des pièces</h1>
    <p class="sub">4 mini-jeux, chaque jour : gagne des pièces pour tes boosters ! 🪙 Entraîne-toi autant que tu veux avant : seuls les essais « Jouer » comptent.</p>
    <p class="pieces-tete"><b>${essais}</b> essai${essais > 1 ? 's' : ''} aujourd’hui</p>
    <div class="jeux">${html}</div>`;
}
// ── scènes animées des tuiles et des tutos : un décor fixe de 160 × 110, et des éléments qui ne bougent que par
// transform et opacity (la carte graphique les déplace sans rien repeindre : fluide même sur un petit téléphone).
// La scène est agrandie à la taille de sa tuile par --k (echelleScenes, après chaque affichage).
const svgP = (vb, w, h, x, y, corps) => `<svg viewBox="${vb}" width="${w}" height="${h}" style="left:${x}px;top:${y}px">${corps}</svg>`;
const PERSO = (maillot, short, bras) => svgP('-16 -46 32 48', 32, 48, -16, -46, `<path d="M-3.5,-15 L-6,0 M3.5,-15 L6,0" stroke="${short}" stroke-width="4" stroke-linecap="round"/>
  <path d="${bras}" stroke="${maillot}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  <path d="M-6.5,-31 Q0,-34 6.5,-31 L5.5,-14 L-5.5,-14Z" fill="${maillot}"/><circle cy="-37" r="4.6" fill="#f1c7a1"/>`);
const BRAS = {haut: 'M-6,-29 L-13,-41 M6,-29 L13,-41', tir: 'M-6,-29 L-10,-19 M6,-29 L9,-44'};
const BALLE = svgP('-7 -7 14 14', 14, 14, -7, -7, '<circle r="5.5" fill="#ffd257" stroke="#b98f1a" stroke-width=".8"/><path d="M-5.5,0 Q0,-2.6 5.5,0 M0,-5.5 Q-2.6,0 0,5.5" stroke="#1d5b8f" stroke-width="1.2" fill="none"/>');
const mv = (cls, corps, x, y) => `<span class="mv ${cls}"${x != null ? ` style="left:${x}px;top:${y}px"` : ''}>${corps}</span>`;
const fond = corps => `<svg class="st-fond" viewBox="0 0 160 110">${corps}</svg>`;
const TAP = '<i class="tap"></i>', cri = t => `<b class="cri">${t}</b>`;
const filet = () => { let d = ''; for (let x = 50; x < 118; x += 9) d += `M${x},16 V70 `; for (let y = 25; y < 70; y += 9) d += `M42,${y} H118 `; return d; };
const SCENES = {
  // tir face au gardien : il bouge, le ballon part en lucarne, le filet tremble
  '7m': () => fond('<path class="s-sol" d="M-10,110 L26,70 H134 L170,110Z"/><path class="s-l" d="M-6,106 Q80,82 166,106"/><path class="s-l" d="M78,80 h4"/>')
    + `<svg class="st-fond mv a-filet" viewBox="0 0 160 110"><path class="s-filet" d="${filet()}"/></svg>`
    + fond('<path class="s-cadre" d="M42,70 V16 H118 V70"/><path class="s-cadre r" d="M42,70 V16 H118 V70"/>')
    + mv('a-gk', PERSO('#27a35a', '#145c32', BRAS.haut)) + mv('a-b7', BALLE) + mv('a-tap7', TAP, 80, 96) + mv('a-cri', cri('BUT !'), 80, 44),
  // dans les buts : le tireur saute, la trajectoire s'affiche, on touche la zone, le gant arrête le ballon
  gardien: () => fond('<path class="s-l p" d="M-4,40 Q80,12 164,40"/><path class="s-l" d="M-4,66 Q80,40 164,66"/><path class="s-zg" d="M58,60 V112 M102,60 V112 M14,86 H146"/>')
    + mv('a-zone', '<i class="zone"></i>', 102, 60)
    + fond('<path class="s-cadre" d="M14,112 V60 H146 V112"/><path class="s-cadre r" d="M14,112 V60 H146 V112"/>')
    + `<svg class="st-fond mv a-traj" viewBox="0 0 160 110"><path class="s-traj" d="M85.6,8.7 Q112,26 124,74"/></svg>`
    + mv('a-tireur', PERSO('#3b6fd8', '#1b2f66', BRAS.tir)) + mv('a-bg', BALLE) + mv('a-tapg', TAP, 124, 74)
    + mv('a-gant', '<b class="gant">✋</b>') + mv('a-burst', '<i class="burst"></i>', 122, 78) + mv('a-cri', cri('ARRÊT !'), 44, 100),
  // vue du dessus, 2 contre 1 : le défenseur sort sur le porteur, le doigt dessine la passe, le partenaire marque
  contre: () => fond('<path class="s-l" d="M30,0 Q30,34 62,36 H98 Q130,34 130,0"/><path class="s-l p" d="M8,0 Q10,54 62,56 H98 Q150,54 152,0"/><path class="s-but" d="M66,0 H94 V4 H66Z"/><path class="s-l" d="M0,108 H160"/>')
    + `<span class="mvs mv a-fondu">${`<svg class="st-fond mv a-trace" viewBox="0 0 160 110"><path class="s-trace" d="M55,59 Q84,24 105,48"/></svg>`
    + mv('a-D', '<i class="tok d"></i>') + mv('a-A', '<i class="tok m">7</i>') + mv('a-B', '<i class="tok m">11</i>') + mv('a-bc', BALLE) + mv('a-doigt', '<i class="doigt"></i>')}</span>`
    + mv('a-cri c2', cri('BUT !'), 80, 22),
  // de profil : la barre de course se remplit (touchers), l'appel, le saut au-dessus du contreur, le tir au sommet
  suspension: () => fond('<path class="s-l f" d="M0,96 H160"/><path class="s-filet" d="M150,52 L160,48 M150,62 L160,58 M150,72 L160,68 M150,82 L160,78 M150,92 L160,88"/><path class="s-cadre" d="M150,97 V44 H166"/><path class="s-cadre r" d="M150,97 V44 H166"/>')
    + `<span class="mvs mv a-fondu">${mv('a-barc', '<i class="barre"><i class="mv a-barre"></i></i>', 12, 101) + mv('a-taps', TAP, 40, 103)
    + mv('a-ct', PERSO('#3b6fd8', '#1b2f66', BRAS.haut)) + mv('a-ts', PERSO('#f4f4f4', '#111', BRAS.tir)) + mv('a-bs', BALLE) + mv('a-tapa', TAP, 93, 16)}</span>`
    + mv('a-cri c3', cri('BUT !'), 118, 26),
};
const sceneJeu = k => `<span class="stage st-${k}" aria-hidden="true"><span class="stage-i">${SCENES[k]()}</span></span>`;
const echelleScenes = (racine = document) => racine.querySelectorAll('.stage').forEach(s => s.style.setProperty('--k', s.clientWidth / 160));
window.addEventListener('resize', () => echelleScenes());
// ── tuto rapide : à la première partie de chaque jeu (localStorage « mhc-tuto »), ou avec le « ? » de sa tuile ──
const TUTOS = {
  '7m': ['<b>Touche</b> pour viser 🎯', '<b>Touche encore</b> pour la puissance 💥', 'Vise les coins, loin du gardien !'],
  gardien: ['Le tireur arrive… 👀', 'La trajectoire s’allume ✨', '<b>Touche vite</b> la bonne zone ✋'],
  contre: ['Tu fonces, ton coéquipier aussi 🏃', '<b>Glisse le doigt</b> pour faire la passe ➜', 'Défenseur sur lui ? <b>Garde la balle</b> et marque !'],
  suspension: ['<b>Tape vite</b> pour prendre de l’élan ⚡', 'Le saut part tout seul 🚀', '<b>Touche au sommet</b> : but assuré ! 🔥'],
};
const CLE_TUTO = 'mhc-tuto';
const tutosVus = () => { try { return JSON.parse(localStorage.getItem(CLE_TUTO) || '[]'); } catch (e) { return []; } };
const tutoVu = k => { try { const v = tutosVus(); if (!v.includes(k)) localStorage.setItem(CLE_TUTO, JSON.stringify([...v, k])); } catch (e) {} };
function gainTuto(k) {
  const e = S(), m = e.minijeux || {};
  if (k === '7m') { const j = e.jet7m || {}; return `${j.piecesBut ?? 50} par but · 5/5 = +${j.bonus ?? 100}`; }
  return k === 'gardien' ? `${gainMini(k)} par arrêt · 5 séries par jour` : `${gainMini(k)} par but · 5/5 = +${m.bonus ?? 100}`;
}
function tuto(k, dans, revoir) {
  if (!revoir && tutosVus().includes(k)) return Promise.resolve();
  return new Promise(fini => {
    const el = document.createElement('div');
    el.className = `tuto j-${k}`; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Comment jouer : ' + NOMS_TUILE[k]);
    el.innerHTML = `<div class="tuto-c"><small class="tuto-s">Comment jouer</small><h2>${NOMS_TUILE[k]}</h2>${sceneJeu(k)}
      <ol class="tuto-e">${TUTOS[k].map((t, i) => `<li style="--i:${i}"><span>${i + 1}</span><p>${t}</p></li>`).join('')}</ol>
      <p class="tuto-g"><i class="coin"></i>${gainTuto(k)}</p>
      <button class="btn gold large tuto-ok">${revoir ? 'Compris !' : 'C’est parti !'}</button></div>`;
    (dans || document.body).appendChild(el); echelleScenes(el);
    const coucheT = () => { el.remove(); fini(); };   // seul (« ? » d'une tuile) : le retour le ferme ; dans un jeu, le retour ferme le jeu
    if (!dans) ouvrirCouche(coucheT);
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.querySelector('.tuto-ok').addEventListener('click', e => {
      e.stopPropagation(); tutoVu(k); el.classList.add('fin'); vibrer(10);
      if (!dans) quitterCouche(coucheT);
      setTimeout(() => { el.remove(); fini(); }, moinsAnim() ? 0 : 280);
    });
  });
}
// ── parcours : poules (Départemental, Régional, National), tournois (International), Légendes ──
const TOURS = ['Quart de finale', 'Demi-finale', 'Finale'];
const ordinal = n => n === 1 ? '1re' : n + 'e';
function echelleParcours(pc) {
  const L = PARAMS.parcours || [], groupes = [];
  L.forEach((x, i) => { let g = groupes.find(y => y.nom === x.groupe); if (!g) groupes.push(g = {nom: x.groupe, n: []}); g.n.push({...x, i: i + 1}); });
  return `<div class="echelle">${groupes.map(g => `<div class="ech-g${g.n.some(x => x.i === pc.niveau) ? ' ici' : ''}"><div>${g.n.map(x =>
    `<i class="${x.i < pc.niveau ? 'fait' : x.i === pc.niveau ? 'ici' : x.i <= pc.meilleur ? 'vu' : ''}" title="${esc(x.groupe + ' ' + x.nom)}"></i>`).join('')}</div>
    <small>${esc(g.nom === 'Départemental' ? 'Départ.' : g.nom === 'International' ? 'Inter.' : g.nom)}</small></div>`).join('')}</div>`;
}
// Jouer (en direct) ou Simuler (tout de suite, gains réduits) ; un match en cours se reprend
function boutonsMatch(txt, peut) {
  const md = S().matchDirect;
  if (md) return `<div class="md-encours"><p><b>Match en cours</b>${md.type === 'defi_ami' ? 'Défi contre' : 'contre'} ${esc(md.adversaire || '')}</p>
    <button class="btn gold" data-act="reprendre-match">Reprendre</button></div>`;
  return `<div class="jouer-2"><button class="btn gold large" data-act="championnat"${peut ? '' : ' disabled'}>${txt}</button>
    <button class="btn ghost" data-act="simuler"${peut ? '' : ' disabled'}>Simuler<small>gains −${pcMoins(gainSimule())} %</small></button></div>`;
}
function blocParcours(e, peut, note, reste) {
  const pc = e.parcours;
  if (!pc) return '';
  const pm = secondesAvantMatch(), max = e.matchMax;
  const resteTxt = max ? `<p class="sub petit centre recharge-m"><b>${reste}/${max}</b> match${reste > 1 ? 's' : ''} en réserve${pm != null ? ` · prochain dans <b id="minuteur-match">${mmss(pm)}</b>` : ' · réserve pleine'}</p>`
    : `<p class="sub petit centre">${reste} match${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''} aujourd’hui</p>`;
  const titre = pc.type === 'legendes' ? `Légendes du handball · ${esc(pc.nom)}` : `${esc(pc.groupe)} · ${esc(pc.nom)}`;
  let corps = '';
  // une poule : championnat (montées, descentes) ou phase de poule d'un tournoi international (les premiers vont en quart de finale)
  if (pc.type === 'poule' || pc.type === 'tournoi' && pc.phase === 'poule') {
    const cl = pc.classement || [], n = cl.length, pr = pc.prochain, tournoi = pc.type === 'tournoi';
    const lignes = cl.map((x, i) => `<div class="${x.moi ? 'moi-l ' : ''}${i < pc.montee ? 'zm' : i >= n - pc.descente ? 'zd' : ''}">
      <span>${i + 1}</span><b>${esc(x.nom)}</b><small>${x.j}</small><small>${x.bp - x.bc > 0 ? '+' : ''}${x.bp - x.bc}</small><em>${x.pts}</em></div>`).join('');
    corps = `<p class="sub petit">${tournoi ? `Phase de poule · match ${Math.min(pc.journee + 1, pc.journees)}/${pc.journees}. ${n} équipes : les ${pc.montee} premiers vont en quart de finale, puis élimination directe. Éliminé ? Nouveau tirage, même tournoi.`
        : `Saison ${pc.saison} · journée ${Math.min(pc.journee + 1, pc.journees)}/${pc.journees}. ${n} équipes : les ${pc.montee} premiers montent${
        pc.descente ? (pc.descente > 1 ? `, les ${pc.descente} derniers descendent` : ', le dernier descend') : ''}.`} Victoire 3 pts, nul 2, défaite 1.</p>
      ${pr ? `<div class="affiche"><div><small>Ton équipe</small><b>${note || '–'}</b></div><span>${tournoi ? 'poule' : pr.domicile ? 'à domicile' : 'à l’extérieur'}</span>
        <div><small>${esc(pr.nom)}</small><b>≈ ${pr.force}</b></div></div>` : ''}
      ${boutonsMatch(tournoi ? `Match de poule ${pc.journee + 1}/${pc.journees}` : `Jouer la journée ${pc.journee + 1}`, peut)}${resteTxt}
      <div class="classe poule"><div class="tete"><span>#</span><b>Équipe</b><small>J</small><small>Diff.</small><em>Pts</em></div>${lignes}</div>`;
  } else if (pc.type === 'tournoi') {
    const adv = pc.adversaires || [], a = adv[pc.tour] || {};
    corps = `<p class="sub petit">Élimination directe : 3 victoires pour le titre. Un nul se joue aux tirs au but. Éliminé ? Nouveau tirage, même tournoi (avec sa phase de poule).</p>
      <div class="chemin">${adv.map((x, i) => `<div class="${i < pc.tour ? 'fait' : i === pc.tour ? 'ici' : ''}"><small>${TOURS[i] || 'Tour ' + (i + 1)}</small><b>${esc(x.nom)}</b><span>≈ ${x.force}</span></div>`).join('')}</div>
      <div class="affiche"><div><small>Ton équipe</small><b>${note || '–'}</b></div><span>${TOURS[pc.tour] || ''}</span><div><small>${esc(a.nom || '')}</small><b>≈ ${a.force ?? '–'}</b></div></div>
      ${boutonsMatch(`Jouer ${pc.tour === 2 ? 'la finale' : pc.tour === 1 ? 'la demi-finale' : 'le quart de finale'}`, peut)}${resteTxt}`;
  } else {
    // 10 équipes de Légendes (demande de Maël, 20 nov. 2026) : chacune battue ouvre la suivante, plus forte d'un point
    const besoin = Math.floor(pc.manches / 2) + 1, rg = pc.rang || 1, nl = pc.rangs || 10, toutes = (pc.max || 0) >= nl;
    corps = `<div class="leg-echelle" aria-label="Légende ${rg} sur ${nl}">${Array.from({length: nl}, (_, i) =>
        `<i class="${i + 1 === rg ? 'ici' : i + 1 <= (pc.max || 0) ? 'fait' : ''}">${i + 1}</i>`).join('')}</div>
      <p class="sub petit"><b>${esc(pc.equipe || '')}</b> : ${(pc.joueurs || []).map(esc).join(', ')}. Série au meilleur des ${pc.manches} manches (${besoin} victoires).
        ${toutes ? 'Tu as battu les 10 Légendes : la dernière se rejoue pour une petite récompense.' : 'Chaque Légende battue ouvre la suivante, plus forte d’un point.'}</p>
      <div class="affiche"><div><small>Ton équipe</small><b>${note || '–'}</b></div><span>série ${pc.v} – ${pc.d}</span><div><small>Légende ${rg}</small><b>≈ ${pc.force}</b></div></div>
      ${boutonsMatch(`Jouer la manche ${pc.v + pc.d + 1}`, peut)}${resteTxt}`;
  }
  const palm = (pc.palmares || []).slice(-4).reverse().map(x => `<li>🏆 ${esc(x.titre)} <small>saison ${x.saison}</small></li>`).join('');
  return `<div class="mode parcours"><div class="mode-t"><b>${titre}</b><span>niveau ${pc.niveau}/${pc.niveaux}</span></div>
    ${echelleParcours(pc)}${pc.international ? '<p class="sub petit">Champion de Nationale 1 : plus de descente possible.</p>' : ''}
    ${corps}${palm ? `<ul class="palmares">${palm}</ul>` : ''}</div>`;
}
function texteFin(fin) {
  if (!fin) return '';
  const gains = [fin.pieces ? `+${nb(fin.pieces)} pièces` : '', fin.booster ? '+1 booster' : '', fin.boosterOr ? `+${fin.boosterOr} booster${fin.boosterOr > 1 ? 's' : ''} Or` : ''].filter(Boolean).join(' · ');
  let t, s;
  if (fin.type === 'saison') {
    t = fin.montee ? (fin.international ? 'Champion de Nationale 1 : place à l’International !' : `Montée en ${fin.nouveauNom} !`)
      : fin.descente ? `Relégation en ${fin.nouveauNom}` : 'Maintien';
    s = `Fin de saison : ${ordinal(fin.rang)} sur ${fin.equipes}${fin.rang === 1 ? ', champion' : ''}.`;
  } else if (fin.type === 'tournoi') {
    t = fin.gagne ? `${fin.titre} !` : fin.phase === 'poule' ? `Éliminé en phase de poule (${ordinal(fin.rang)} sur ${fin.equipes})` : `Éliminé en ${(TOURS[fin.tour] || '').toLowerCase()}`;
    s = fin.gagne ? (fin.nouveau > fin.niveau ? `Prochaine étape : ${fin.nouveauNom}.` : '') : 'Nouveau tirage : retente ta chance.';
  } else {
    t = !fin.gagne ? `Légende ${fin.rang || ''} gagne la série` : !fin.premiere ? `Légende ${fin.rang || ''} battue de nouveau`
      : fin.suivante ? `Légende ${fin.rang} battue (${fin.equipe}) !` : 'Tu as battu toutes les Légendes du handball !';
    s = `Série ${fin.v} – ${fin.d}.${fin.gagne ? (fin.suivante ? ` Prochaine : Légende ${fin.suivante}.` : '') : ' Entraîne tes cartes Ultime et reviens.'}`;
  }
  return `<div class="daily depart"><p><b>${t}</b>${s}${gains ? ' ' + gains : ''}</p></div>`;
}
function texteEtape(r) {
  const x = r.etape || {};
  if (r.fin) return '';
  if (r.type === 'poule') return `${ordinal(x.rang)} du classement après ${x.journee} journée${x.journee > 1 ? 's' : ''}`;
  if (r.type === 'tournoi' && x.phase === 'poule') return x.qualifie ? `Qualifié pour les quarts de finale (${ordinal(x.rang)} de la poule) !`
    : `${ordinal(x.rang)} de la poule après ${x.journee} match${x.journee > 1 ? 's' : ''} sur ${x.journees}`;
  if (r.type === 'tournoi') return x.passe ? `Qualifié pour la ${(TOURS[x.tour + 1] || '').toLowerCase()}` : '';
  return `Série ${x.v} – ${x.d}`;
}
// Match raconté minute par minute (60 minutes en 7 secondes), puis le résultat et les gains
const MATCH = {};
function jouerMatch(promesse, type) {
  if (occupe) return;
  action(promesse, r => {
    clearInterval(MATCH.t);
    Object.assign(MATCH, {r, type, minute: 0, a: 0, b: 0, i: 0});
    ouvrirOverlay(`<div class="sheet match">
      <div class="tableau"><div><small>${esc(S().pseudo)}</small><b id="sc-a">0</b></div><div class="mn" id="minute">0'</div>
        <div><small>${esc(r.adversaire)}</small><b id="sc-b">0</b></div></div>
      <div class="fil" id="fil"></div>
      <div id="fin-match"><button class="btn ghost large" data-act="passer">Voir le résultat</button></div></div>`);
    MATCH.t = setInterval(() => avancerMatch(MATCH.minute + 1), 115);
    Son.jouer('sifflet');
  });
}
function avancerMatch(m) {
  const {r} = MATCH, buts = r.match.buts;
  if (!$('#fil')) return clearInterval(MATCH.t);
  MATCH.minute = m;
  while (MATCH.i < buts.length && buts[MATCH.i].m <= m) {
    const x = buts[MATCH.i++];
    if (x.c === 'a') MATCH.a++; else MATCH.b++;
    $('#fil').insertAdjacentHTML('afterbegin', `<p class="but ${x.c}"><b>${x.m}'</b> But de ${esc(x.n)} <span>${MATCH.a} – ${MATCH.b}</span></p>`);
  }
  $('#sc-a').textContent = MATCH.a; $('#sc-b').textContent = MATCH.b; $('#minute').textContent = Math.min(m, 60) + "'";
  if (m >= 60) finMatch();
}
function finMatch() {
  clearInterval(MATCH.t);
  const {r} = MATCH, res = r.match.resultat;
  if (MATCH.i < r.match.buts.length) avancerMatch(60);   // « voir le résultat » : on affiche tout
  if (!$('#fin-match') || $('#fin-match').dataset.fait) return;
  $('#fin-match').dataset.fait = 1;
  vibrer(res === 'gagne' ? [40, 60, 80] : 30);
  Son.jouer('buzzer'); setTimeout(() => Son.jouer(res === 'gagne' ? 'victoire' : res === 'nul' ? 'nul' : 'defaite'), 450);
  $('#fin-match').innerHTML = htmlFin(r) + '<button class="btn gold large" data-act="fin-match">Continuer</button>';
}
function htmlFin(r) {
  const g = r.gains || {}, res = r.match.resultat, tab = r.match.tab, etape = r.type ? texteEtape(r) : '';
  const progres = (r.progres || []).map(p => `${esc(p.nom)} ${p.avant} → <b>${p.apres}</b>`).join(' · ');
  return `<div class="resultat r-${res}"><b>${RES[res]} ${r.match.a} – ${r.match.b}</b>
      ${tab ? `<small class="tab">Tirs au but ${tab.a} – ${tab.b} : ${tab.a > tab.b ? 'gagnés' : 'perdus'}</small>` : ''}
      <small>${g.points != null ? `+${g.points} pt${g.points > 1 ? 's' : ''} · ` : ''}+${nb(g.pieces)} pièces${g.xp != null ? ` · +${g.xp} XP` : ''}${g.trophees != null ? ` · ${g.trophees >= 0 ? '+' : ''}${g.trophees} 🏆` : ''}</small></div>
    ${r.trophees ? `<p class="sub petit centre">🏆 ${nb(r.trophees.avant)} → <b>${nb(r.trophees.apres)}</b> · ${esc(r.trophees.arene || '')}</p>` : ''}
    ${r.trophees?.nouvelle ? `<p class="pvp-arene">Nouvelle arène : <b>${esc(r.trophees.nouvelle.nom)}</b> ${r.trophees.nouvelle.recompense ? RECOMP(r.trophees.nouvelle.recompense) : ''}</p>` : ''}
    ${etape ? `<p class="sub petit centre">${esc(etape)}</p>` : ''}
    ${progres ? `<p class="sub petit centre">Progrès : ${progres}</p>` : ''}
    ${r.gain != null && r.gain < 1 ? `<p class="sub petit centre">${r.direct ? 'Fin simulée' : 'Match simulé'} : gains −${pcMoins(r.gain)} %</p>` : ''}
    ${htmlResume(r.resume)}
    ${texteFin(r.fin)}`;
}

// ── Match en direct, « à la Football Manager » (demande de Maël) ──────────────────────────────────────────────
// Le serveur joue le match par blocs de 5 minutes (match_bloc), avec la tactique du moment ; ici, chaque possession est
// racontée sur un terrain vu de dessus (14 pastilles, seuls les transform bougent), avec les commentaires et les stats.
// Tactique et consigne ne changent qu'au coup d'envoi, à la mi-temps ou sur un temps mort (3 par match, 2 par période) :
// le temps mort est pris à la fin du bloc en cours. « Simuler » joue tout de suite et rapporte un peu moins.
const CONSIGNES = [['prudent', 'Prudent', 'moins de pertes et d’exclusions, moins de buts'], ['normal', 'Normal', 'l’équilibre'],
  ['pression', 'Pression', 'plus de buts, plus de fatigue et d’exclusions']];
const BAT = {duels: '06', enclenchement: '33', rapide: '15'}, BATTU = {duels: '15', enclenchement: '06', rapide: '33'};   // pierre-feuille-ciseaux
const ZONE_ATT = {duels: 'tirs des arrières', enclenchement: 'jeu avec le pivot', rapide: 'ailes et contre-attaques'};
const NOM_ATT = Object.fromEntries(TACT_ATT.map(x => [x[0], x[1]])), NOM_DEF = {'06': '0-6', '15': '1-5', '33': '3-3'};
const ZONES_MD = [['arrieres', 'Arrières'], ['ailes', 'Ailes'], ['pivot', 'Pivot'], ['contre', 'Contre-attaque'], ['7m', 'Jets de 7 m']];
const TIRS_MD = ['but', 'arret', 'poteau', 'dehors', '7m-but', '7m-arret'], BUTS_MD = ['but', '7m-but'];
const SLOTS_MD = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV'];
// places sur le terrain (40 × 20 m), pour l'équipe qui attaque vers la droite ; l'autre est tournée d'un demi-tour
const ATT_POS = {AG: [37.6, 1.6], ARG: [29.8, 4.6], DC: [28.6, 10], ARD: [29.8, 15.4], AD: [37.6, 18.4], PIV: [34.6, 10.6]};
const CONTRE_POS = [[31, 3.5], [25.5, 7], [33.4, 9.4], [26, 13], [31, 16.5], [24, 10]];
const DEF_POS = {'06': [[38.6, 3.2], [35.8, 5.6], [34.3, 8.6], [34.3, 11.4], [35.8, 14.4], [38.6, 16.8]],
  '15': [[38.4, 3.4], [35.2, 6.4], [30.8, 10], [34.3, 10], [35.2, 13.6], [38.4, 16.6]],
  '33': [[37.4, 4.2], [31.6, 5.4], [30.6, 10], [34.6, 10], [31.6, 14.6], [37.4, 15.8]]};
const REPLI = [[22, 4], [24.5, 8], [21, 11.5], [25, 13], [22.5, 16], [27, 9]];
const TIR_POS = {ailes: s => s === 'AD' ? [37.4, 16.6] : [37.4, 3.4], arrieres: s => [31.2, s === 'ARG' ? 6.6 : s === 'ARD' ? 13.4 : 10],
  pivot: () => [35.2, 10.2], contre: () => [34.8, 9.6], '7m': () => [33, 10]};
// ce que fait l'entraîneur adverse, selon le niveau (match_ia dans schema.sql)
const ASTUCE_IA = {'imprévisible': 'il change au hasard 🎲', 'lent à réagir': 'il réagit… mais lentement 🐢',
  'réfléchi': 'il réagit quand tu le contres 🧠', 'rapide': 'il réagit vite et cherche à te contrer ⚡',
  'légendaire': 'il s’adapte sans arrêt et apprend ta façon de jouer : varie tes choix 👑'};
// Légendes : ce que l'entraîneur a remarqué de ta façon de jouer (ia_lecture dans schema.sql, demande de Maël, 21 nov. 2026) :
// il vise cette façon de jouer 6 fois sur 10 ; à toi d'en profiter (ou de changer)
const LECTURE_ATT = {1: 'tu <b>gardes ton attaque</b>', 2: 'tu <b>contres sa défense</b> dès que tu la vois', 3: 'tu <b>joues un coup d’avance</b> (tu contres son contre)'};
const LECTURE_DEF = {1: 'tu <b>gardes ta défense</b>', 2: 'tu <b>te protèges</b> de l’attaque qui bat ta défense', 3: 'tu <b>joues un coup d’avance</b>'};
function indiceIA() {
  const l = MD.vue?.eux?.lecture;
  if (!l) return '';
  return `<p class="md-indice">👁️ Il a remarqué qu’en attaque, ${LECTURE_ATT[l.att] || LECTURE_ATT[1]}, et qu’en défense, ${LECTURE_DEF[l.def] || LECTURE_DEF[1]}. Il s’attend à ce que tu recommences.</p>`;
}
// résumé tactique de fin (match_resume) : tranche par tranche, qui avait le dessus en attaque et en défense, puis les tactiques révélées
function htmlResume(R) {
  if (!R?.blocs?.length) return '';
  const cases = k => R.blocs.map((x, i) => `<i class="rs-${x[k] > 0 ? 'p' : x[k] < 0 ? 'm' : 'n'}${i === 6 ? ' mt' : ''}" title="${i * 5}-${i * 5 + 5}'"></i>`).join('');
  const compte = k => ({p: R.blocs.filter(x => x[k] > 0).length, m: R.blocs.filter(x => x[k] < 0).length});
  const ca = compte('att'), cd = compte('def'), n = R.blocs.length;
  const plus = (l, k) => { const c = {}; l.forEach(x => { c[x[k]] = (c[x[k]] || 0) + 1; }); return Object.entries(c).sort((p, q) => q[1] - p[1]); };
  const leursAtt = plus(R.blocs, 'ba').map(([k, v]) => `${NOM_ATT[k] || k} (${v * 5} min)`).join(', ');
  const leursDef = plus(R.blocs, 'bd').map(([k, v]) => `${NOM_DEF[k] || k} (${v * 5} min)`).join(', ');
  const bo = R.bonus || {}, mAtt = TACT_ATT.map(x => x[0]).sort((p, q) => (bo[q] || 0) - (bo[p] || 0))[0], mDef = ['06', '15', '33'].sort((p, q) => (bo[q] || 0) - (bo[p] || 0))[0];
  const conseil = ca.m + cd.m > ca.p + cd.p ? 'Il a eu le dessus : regarde sa défense (elle se voit) et d’où partent ses tirs, et sers-toi de tes temps morts.'
    : ca.p + cd.p >= n ? 'Bien lu : tu as eu le dessus la plupart du temps.' : 'Match serré tactiquement : chaque changement compte.';
  return `<div class="md-resume"><h4>Résumé tactique</h4>
    <div class="rs-l"><small>Ton attaque</small><span>${cases('att')}</span><b>${ca.p}/${n}</b></div>
    <div class="rs-l"><small>Ta défense</small><span>${cases('def')}</span><b>${cd.p}/${n}</b></div>
    <p class="rs-leg"><i class="rs-p"></i>tu prenais le dessus <i class="rs-m"></i>contré <i class="rs-n"></i>neutre · par tranche de 5 minutes</p>
    <p class="sub petit">Leur attaque : ${leursAtt}. Leur défense : ${leursDef}. ${MD.pvp ? nomEux() : `Entraîneur ${esc(R.entraineur || '')}`} : ${R.changementsAdv} changement${R.changementsAdv > 1 ? 's' : ''},
      ${R.tempsMortsAdv} temps mort${R.tempsMortsAdv > 1 ? 's' : ''} ; toi : ${R.tempsMorts} temps mort${R.tempsMorts > 1 ? 's' : ''}.</p>
    <p class="sub petit">Ton équipe est faite pour <b>${NOM_ATT[mAtt]}</b> (+${Math.round((bo[mAtt] || 0) * 100)} %) et la <b>${NOM_DEF[mDef]}</b> (+${Math.round((bo[mDef] || 0) * 100)} %). ${conseil}</p></div>`;
}
const MS_SEC = 40;   // ×1 : une seconde de match = 40 ms (un bloc de 5 minutes en 12 s, le match en 2 min 24)
const MD = {};
const rotMD = (c, [x, y]) => c === 'a' ? [x, y] : [40 - x, 20 - y];
const gainSimule = () => +(PARAMS.match_simule_gain ?? .95);
const pcMoins = g => Math.round((1 - g) * 1000) / 10;
const vitesseMD = () => { try { return [1, 2, 4].includes(+localStorage.getItem('mhc-vitesse')) ? +localStorage.getItem('mhc-vitesse') : 1; } catch (e) { return 1; } };

// statistiques recalculées depuis les événements déjà racontés (elles suivent le récit, sans rien dévoiler d'avance)
function statsMD(evs) {
  const vide = () => ({buts: 0, tirs: 0, arrets: 0, pertes: 0, excl: 0, sept: 0, zones: {arrieres: 0, ailes: 0, pivot: 0, contre: 0, '7m': 0}});
  const s = {a: vide(), b: vide()};
  for (const x of evs) {
    if (!s[x.c]) continue;
    const S = s[x.c], O = s[x.c === 'a' ? 'b' : 'a'];
    if (TIRS_MD.includes(x.ty)) S.tirs++;
    if (BUTS_MD.includes(x.ty)) { S.buts++; if (x.z in S.zones) S.zones[x.z]++; }
    if (x.ty === 'arret' || x.ty === '7m-arret') O.arrets++;
    if (x.ty === 'perte') S.pertes++;
    if (x.ty === 'excl') S.excl++;
    if (x.ty.startsWith('7m')) S.sept++;
  }
  return s;
}
function texteMD(x) {
  const n = esc(x.n || ''), g = esc(x.g || 'le gardien');
  return {but: `But de <b>${n}</b>${x.z === 'contre' ? ' en contre-attaque' : x.z === 'pivot' ? ' au pivot' : x.z === 'ailes' ? ' depuis l’aile' : ''}`,
    '7m-but': `<b>${n}</b> transforme le jet de 7 m`, '7m-arret': `<b>${g}</b> arrête le jet de 7 m de ${n}`,
    arret: `Arrêt de <b>${g}</b> devant ${n}`, poteau: `Poteau ! Le tir de ${n} ne rentre pas`, dehors: `${n} tire à côté`,
    perte: x.long ? `⏱️ Trop long ! ${n} n’a pas tiré son jet de 7 m : ballon à ${esc((x.c === 'b' ? MD.vue?.nous?.nom : MD.vue?.eux?.nom) || '')}` : `Perte de balle de ${n}`,
    excl: `2 minutes pour <b>${n}</b>`,
    sept: `🎯 Jet de 7 m pour ${esc((x.c === 'b' ? MD.vue?.eux?.nom : MD.vue?.nous?.nom) || '')} : <b>${n}</b> face à ${g}`,
    'temps-mort': x.c === 'a' && x.va ? `Temps mort : ${esc(MD.vue?.eux?.nom || '')} attaque en <b>${NOM_ATT[x.va] || x.va}</b> et défend en <b>${NOM_DEF[x.vd] || x.vd}</b> 🕵️`
      : `Temps mort pour ${esc((x.c === 'b' ? MD.vue?.eux?.nom : MD.vue?.nous?.nom) || '')}`,
    tactique: `${x.adj ? 'Ton adjoint passe en' : 'Tu passes en'} <b>${NOM_ATT[String(x.v).split(':')[0]] || ''}</b> · <b>${NOM_DEF[String(x.v).split(':')[1]] || ''}</b>${x.cons && x.cons !== 'normal' ? ` · ${x.cons === 'pression' ? 'pression' : 'prudent'}` : ''}`,
    attaque: `${esc(MD.vue?.eux?.nom || '')} change d’attaque : regarde d’où partent ses tirs`,
    consigne: `${esc(MD.vue?.eux?.nom || '')} passe en jeu ${x.v === 'pression' ? 'sous <b>pression</b>' : x.v === 'prudent' ? '<b>prudent</b>' : '<b>normal</b>'}`,
    momentum: `🔥 <b>${esc((x.c === 'b' ? MD.vue?.eux?.nom : MD.vue?.nous?.nom) || '')}</b> prend le momentum !`,
    'momentum-fin': x.par === 'mi-temps' ? 'La mi-temps fait retomber le momentum'
      : `⏱️ Le temps mort ${x.v ? 'casse le momentum' : 'coupe l’élan'} de <b>${esc((x.c === 'b' ? MD.vue?.eux?.nom : MD.vue?.nous?.nom) || '')}</b>`,
    'mi-temps': 'Mi-temps', defense: `${esc(MD.vue?.eux?.nom || '')} change de défense : <b>${NOM_DEF[x.v] || ''}</b>`,
    'tactique-adv': `${esc(MD.vue?.eux?.nom || '')} ${[x.def ? `passe en défense <b>${NOM_DEF[x.def] || ''}</b>` : '', x.att ? 'change d’attaque : regarde d’où partent ses tirs' : '',
      x.cons ? `joue ${x.cons === 'pression' ? 'sous <b>pression</b>' : x.cons === 'prudent' ? '<b>prudent</b>' : '<b>normal</b>'}` : ''].filter(Boolean).join(', ') || 'change de tactique'}`,
    changement: x.c === 'b' ? `🔁 ${esc(MD.vue?.eux?.nom || '')} : entrée de <b>${esc(x.n || '')}</b> (${x.p}), ${esc(x.o || '')} sort`
      : `🔁 ${x.adj ? 'Ton adjoint fait entrer' : 'Entrée de'} <b>${esc(x.n || '')}</b> (${x.p}), ${esc(x.o || '')} sort`,
    blessure: x.c === 'b' ? `🚑 Blessure chez ${esc(MD.vue?.eux?.nom || '')} : <b>${esc(x.n || '')}</b> (${x.p})` : `🚑 Blessure ${x.g ? `<b>${esc(x.g)}</b> ` : ''}de <b>${esc(x.n || '')}</b> (${x.p})${x.m ? `, absent(e) ${x.m} match${x.m > 1 ? 's' : ''} après celui-ci` : ''} : ${x.r ? 'fais entrer son remplaçant (Banc)' : 'pas de remplaçant à ce poste, jeu diminué'}`,
    absent: `🚑 <b>${esc(x.n || '')}</b> (${x.p}) est blessé(e)${x.m ? `, encore ${x.m} match${x.m > 1 ? 's' : ''} d’absence` : ''} : ${x.r ? 'son remplaçant commence' : 'pas de remplaçant valide, il joue diminué'}`}[x.ty] || '';
}
const ligneMD = (x, calme) => `<p class="md-l ${x.c || 'n'} t-${x.ty}${calme ? ' calme' : ''}"><b>${Math.min(60, Math.floor(x.t / 60) + (x.t % 60 || !x.t ? 1 : 0))}'</b><span>${texteMD(x)}</span>${x.s ? `<em>${x.s[0]} – ${x.s[1]}</em>` : ''}</p>`;

// commencer : en direct (on choisit sa tactique au coup d'envoi) ou simulé (résultat tout de suite, gains réduits)
function commencerMatch(type, cible, simuler) {
  if (occupe) return;
  const tactique = (T => `${T.att}:${T.def}`)(tactiqueActuelle());
  const pr = Compte.matchCommencer(type, cible, tactique, 'normal', !!simuler);
  if (simuler) return jouerMatch(type === 'defi_ami' ? pr.then(r => { SOC.amis = null; return r; }) : pr, type);
  action(pr, r => { if (type === 'defi_ami') SOC.amis = null; if (r?.vue) ouvrirDirect(r.vue); });
}
function reprendreMatch() {
  if (occupe) return;
  action(Compte.matchEnCours(), v => { if (v?.bloc != null) ouvrirDirect(v, true); else { toast('Pas de match en cours'); route(true); } });
}
function ouvrirDirect(vue, reprise) {
  if (MD.el) fermerDirect(false, true);
  const el = document.createElement('div');
  el.className = 'md';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Match en direct');
  const pt = (c, i) => `<g class="md-pt ${c}${i === 6 ? ' gb' : ''}" data-pt="${c}${i}"><circle r=".78"/></g>`;
  el.innerHTML = `<div class="md-haut"><div class="md-eq a"><small>${esc(vue.nous.nom)}</small><b class="md-sa">0</b><i class="md-ex a" hidden>2'</i></div>
      <div class="md-mn"><b class="md-min">0'</b><small class="md-per">1re période</small></div>
      <div class="md-eq b"><small>${esc(vue.eux.nom)}</small><b class="md-sb">0</b><i class="md-ex b" hidden>2'</i></div>
      <button class="md-x" aria-label="Quitter le match (il reste en pause)">✕</button></div>
    <div class="md-mom" aria-label="Momentum"><span class="mm-pips a"><i></i><i></i><i></i></span>
      <div class="mm-zone"><div class="mm-rail"><span class="mm-m a"><i class="mm-f"></i></span><span class="mm-m b"><i class="mm-f"></i></span><i class="mm-c"></i></div>
        <div class="mm-feu"><i class="mm-plein"></i><span class="mm-fl">${'<i></i>'.repeat(10)}</span><b class="mm-badge">🔥 MOMENTUM</b></div></div>
      <span class="mm-pips b"><i></i><i></i><i></i></span><i class="mm-onde"></i></div>
    <div class="md-terrain"><svg viewBox="-1.5 -1.5 43 23" aria-hidden="true">
      <rect class="md-sol" x="0" y="0" width="40" height="20" rx=".3"/>
      <path class="md-zone" d="M40 2.5 A6 6 0 0 0 34 8.5 V11.5 A6 6 0 0 0 40 17.5 Z M0 2.5 A6 6 0 0 1 6 8.5 V11.5 A6 6 0 0 1 0 17.5 Z"/>
      <path class="md-li" d="M0 0 H40 V20 H0 Z M20 0 V20 M40 2.5 A6 6 0 0 0 34 8.5 V11.5 A6 6 0 0 0 40 17.5 M0 2.5 A6 6 0 0 1 6 8.5 V11.5 A6 6 0 0 1 0 17.5 M32.5 9.5 v1 M7.5 9.5 v1"/>
      <path class="md-li neuf" d="M37.04 0 A9 9 0 0 0 31 8.5 V11.5 A9 9 0 0 0 37.04 20 M2.96 0 A9 9 0 0 1 9 8.5 V11.5 A9 9 0 0 1 2.96 20"/>
      <path class="md-but" d="M40 8.5 h1 v3 h-1 M0 8.5 h-1 v3 h1"/>
      ${[0, 1, 2, 3, 4, 5, 6].map(i => pt('a', i) + pt('b', i)).join('')}
      <g class="md-pt bal" data-pt="bal"><circle r=".5"/></g></svg>
      <b class="md-flash" hidden></b><div class="md-pause-b" hidden></div></div>
    <p class="md-info"></p>
    <div class="md-onglets" role="tablist"><button class="on" data-md-onglet="direct">Direct</button><button data-md-onglet="stats">Stats</button></div>
    <div class="md-corps"><div class="md-fil"></div><div class="md-stats" hidden></div></div>
    <div class="md-bas"><button class="btn ghost md-tac">Tactique</button><button class="btn ghost md-tm">Temps mort</button><button class="btn ghost md-vit">×1</button><button class="btn ghost md-sim">Simuler</button></div>
    <div class="md-panneau" hidden></div><div class="md-panneau md-bancp" hidden></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro'); Son.discret(true); ouvrirCouche(coucheMD);
  const h0 = Math.max(vue.bloc * 300, Math.round((vue.minute || 0) * 60));
  Object.assign(MD, {el, vue, evs: [], file: [], h: h0, finBloc: h0, attente: true, fin: null, tab: null, tabSel: null, timers: [], ts: 0,
    tac: vue.nous.tactique, cons: vue.nous.consigne || 'normal', defB: vue.eux.defense, vitesse: vitesseMD(), onglet: 'direct',
    exclu: {a: 0, b: 0}, mom: momVide(), pts: Object.fromEntries([...el.querySelectorAll('[data-pt]')].map(g => [g.dataset.pt, g])), svg: el.querySelector('svg')});
  if (!/^(duels|enclenchement|rapide):(06|15|33)$/.test(MD.tac)) MD.tac = `${tactiqueActuelle().att}:${tactiqueActuelle().def}`;
  // match à deux en direct : même écran, rythme ×1 imposé, pas de « Simuler » ; le serveur est interrogé toutes les secondes ou deux
  Object.assign(MD, {pvp: vue.pvp || null, gen: vue.pvp?.gen ?? 0, n: (vue.evenements || []).length, pvpRecu: Date.now(), pvpPostes: vue.pvp?.choix?.postes || [],
    pretEnvoye: null, miTemps: false, pvpPret: false, adverse: null});
  // Classé contre un fantôme : pas de simulation (demande de Maël, 23 nov. 2026), comme contre un vrai joueur
  if (vue.type === 'classe') el.classList.add('sans-sim');
  if (MD.pvp) {
    MD.vitesse = 1; el.classList.add('pvp');
    if (vue.pvp.choix?.tac) { MD.tac = vue.pvp.choix.tac; MD.cons = vue.pvp.choix.cons || 'normal'; }
    MD.pvpT = setInterval(pvpTick, 1000);
  }
  el.classList.toggle('avec-banc', bancMD().length > 0);
  // reprise : tout ce qui s'est passé est affiché d'un coup ; puis le panneau qui convient (coup d'envoi, mi-temps ou pause)
  for (const x of vue.evenements || []) noterMD(x, true);
  formationDepart();
  majMD();
  el.addEventListener('click', clicMD);
  el.addEventListener('pointerdown', e => e.stopPropagation());
  MD.raf = requestAnimationFrame(boucleMD);
  if (MD.pvp) {
    if (vue.pvp.pause) { MD.h = MD.finBloc = vue.pvp.pause.h; majHorlogeMD(); pvpPause(); }
    else if (vue.bloc === 0) panneauMD('envoi');
    else { MD.h = MD.finBloc = Math.max(h0, vue.pvp.h || 0); majHorlogeMD(); if (vue.bloc === 6 && MD.h === 1800) { MD.miTemps = true; panneauMD('mi-temps'); } else pvpFinBloc(); }
    if (!reprise) Son.jouer('sifflet');
    return;
  }
  if (vue.tirsAuBut) { MD.tab = vue.tirsAuBut; MD.h = MD.finBloc = 3600; majHorlogeMD(); panneauTab(); }
  else if (vue.tabJeu) { MD.h = MD.finBloc = 3600; majHorlogeMD(); tabJeu(vue.tabJeu, true); }   // séance commencée aux mini-jeux
  else if (vue.bloc === 0) panneauMD('envoi');
  else if (vue.bloc === 6 && h0 === 1800) panneauMD('mi-temps');
  else panneauMD(reprise ? 'pause' : 'pause');
  if (!reprise) Son.jouer('sifflet');
}
const coucheMD = () => fermerDirect(true);
function fermerDirect(parRetour, sansRoute) {
  if (!MD.el) return;
  if (parRetour !== true) quitterCouche(coucheMD);
  cancelAnimationFrame(MD.raf); MD.timers.forEach(clearTimeout); clearInterval(MD.pvpT);
  const fini = !!MD.fin, pvp = !!MD.pvp; MD.pvp = null;
  MD.el.remove(); MD.el = null; MD.fin = null;
  document.body.classList.remove('avec-intro'); Son.discret(false);
  if (fini) { JEU.rencontres = null; CL.data = null; }
  else if (!sansRoute) toast(pvp ? 'Le match continue sans toi : ton adjoint coache ton équipe. Reviens vite (Jouer, Classé)' : 'Match en pause : reprends-le quand tu veux depuis Championnat VS Ordi');
  if (!sansRoute) route(true);
}
// une ligne au fil + score et stats (sans animation : reprise, ou fin simulée)
// momentum (demande de Maël, 23 nov. 2026) : la barre suit les événements racontés, en direct : chaque action la remplit ou la vide
// un peu (m = sa valeur après l'action, + = nous) ; « momentum » = elle se bloque (toute la barre s'enflamme), « momentum-fin » = un
// temps mort ou la mi-temps la casse
const momVide = () => ({v: 0, lock: null, serie: {c: null, n: 0}});
function momNoter(x, muet) {
  const M = MD.mom || (MD.mom = momVide());
  const avant = M.v;
  // un événement d'avant le dernier temps mort, raconté en retard (le blocage attend que le ballon soit au fond, ~0,5 s) : il ne
  // touche plus la barre (retour de Guilhem, 24 nov. 2026 : temps mort juste avant leur momentum, la barre restait bloquée à l'écran)
  const avantCoupe = M.coupe != null && x.t != null && x.t <= M.coupe && x.ty !== 'momentum-fin' && x.ty !== 'mi-temps';
  if (typeof x.m === 'number' && !M.lock && !avantCoupe) M.v = x.m;
  if (x.ty === 'but' || x.ty === '7m-but') {
    M.serie = M.serie.c === x.c ? {c: x.c, n: M.serie.n + 1} : {c: x.c, n: 1};
  } else if (x.ty === 'momentum') {
    if (avantCoupe) return;
    M.lock = x.c; if (typeof x.m === 'number') M.v = x.m;
    if (!muet) { momOnde(x.c); vibrer([30, 40, 90]); }
  } else if (x.ty === 'momentum-fin') {
    if (!muet && x.v) momEclats(x.c || M.lock);
    Object.assign(M, momVide(), x.par === 'tm' ? {coupe: x.t} : {});
  } else if (x.ty === 'mi-temps') Object.assign(M, momVide());
  else if (M.v === avant) return;
  majMom();
}
function majMom() {
  const el = MD.el?.querySelector('.md-mom'); if (!el) return;
  const M = MD.mom || momVide();
  el.querySelector('.mm-m.a .mm-f').style.transform = `scaleX(${Math.max(0, M.v) / 100})`;
  el.querySelector('.mm-m.b .mm-f').style.transform = `scaleX(${Math.max(0, -M.v) / 100})`;
  el.classList.toggle('lock-a', M.lock === 'a'); el.classList.toggle('lock-b', M.lock === 'b');
  for (const c of ['a', 'b']) el.querySelectorAll(`.mm-pips.${c} i`).forEach((p, i) => p.classList.toggle('on', M.serie.c === c && i < M.serie.n));
}
function momOnde(c) {
  const o = MD.el?.querySelector('.mm-onde'); if (!o) return;
  o.className = `mm-onde ${c}`; void o.offsetWidth; o.classList.add('go');
}
function momEclats(c) {
  const el = MD.el?.querySelector('.md-mom'); if (!el || !c) return;
  for (let i = 0; i < 12; i++) {
    const e = document.createElement('i'); e.className = `mm-eclat ${c}`;
    e.style.setProperty('--dx', Math.round(Math.random() * 140 - 70) + 'px'); e.style.setProperty('--dy', Math.round(Math.random() * 50 - 34) + 'px');
    el.appendChild(e); setTimeout(() => e.remove(), 800);
  }
}
function noterMD(x, muet) {
  MD.evs.push(x);
  momNoter(x, muet);
  if (x.ty === 'defense') MD.defB = x.v;
  if (x.ty === 'tactique-adv' && x.def) MD.defB = x.def;
  if (x.ty === 'excl') MD.exclu[x.c] = x.t + 120;
  const fil = MD.el.querySelector('.md-fil');
  fil.insertAdjacentHTML('afterbegin', ligneMD(x, muet));
  if (!muet && fil.children.length > 80) fil.lastElementChild.remove();
  if (x.s) { MD.el.querySelector('.md-sa').textContent = x.s[0]; MD.el.querySelector('.md-sb').textContent = x.s[1]; }
  if (MD.onglet === 'stats' && !muet) majStatsMD();
}
function placerMD(id, [x, y]) { const g = MD.pts[id]; if (g) g.style.transform = `translate(${x}px,${y}px)`; }
function formationDepart() {
  const [, defA] = MD.tac.split(':');
  (DEF_POS[defA] || DEF_POS['06']).forEach((p, i) => placerMD('a' + i, rotMD('b', p)));
  (DEF_POS[MD.defB] || DEF_POS['06']).forEach((p, i) => placerMD('b' + i, rotMD('a', p)));
  placerMD('a6', [1, 10]); placerMD('b6', [39, 10]); placerMD('bal', [20, 10]);
}
// x attaque (vers la droite pour a, vers la gauche pour b), y défend dans son dispositif ; en contre-attaque, y revient en courant
function formationMD(x, contre) {
  const y = x === 'a' ? 'b' : 'a', defY = y === 'a' ? MD.tac.split(':')[1] : MD.defB;
  SLOTS_MD.forEach((s, i) => placerMD(x + i, rotMD(x, contre ? CONTRE_POS[i] : ATT_POS[s])));
  placerMD(x + 6, rotMD(x, [1.2, 10]));
  (contre ? REPLI : DEF_POS[defY] || DEF_POS['06']).forEach((p, i) => placerMD(y + i, rotMD(x, p)));
  placerMD(y + 6, rotMD(x, [39.1, 10]));
}
function slotMD(c, nom, z) {
  const j = (c === 'a' ? MD.vue.nous.joueurs : MD.vue.eux.joueurs) || {};
  const s = Object.keys(j).find(k => j[k] === nom && k !== 'GB');
  if (s && SLOTS_MD.includes(s)) return s;
  return {ailes: 'AG', arrieres: 'DC', pivot: 'PIV', contre: 'DC', '7m': 'DC'}[z] || 'DC';
}
const nomCourt = n => { const m = String(n || '').trim().split(/\s+/); return m.length > 1 && !/^n°/.test(n) ? m.slice(1).join(' ') : n; };
function flashMD(txt, cls) {
  const f = MD.el.querySelector('.md-flash'), nf = f.cloneNode(false);
  nf.className = `md-flash ${cls || ''}`; nf.innerHTML = txt; nf.hidden = false; f.replaceWith(nf);
}
// Jets de 7 m joués au mini-jeu (demande de Maël, 23 nov. 2026) : le récit s'arrête, une intro « 7m » (traits qui défilent, sifflet long qui
// décroît) le temps que la scène 3D se charge, puis notre tir (mini-jeu du jet de 7 m) ou leur tir à arrêter (le tireur reste sur le point
// de 7 m, sans trajectoire dessinée) ; le serveur décide (match_7m, pvp_7m) et la tranche reprend. En Classé : le tireur vise d'abord, le
// gardien voit partir le ballon ensuite ; sans tir à temps, « trop long » : ballon à l'adversaire.
const R7M = {but: 'But !', arret: 'Arrêté !', poteau: 'Poteau !', dehors: 'À côté !', long: 'Trop long !'};
function septIntro(nom) {
  const el = document.createElement('div'); el.className = 'sept-intro'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="si-l g">${'<i></i>'.repeat(6)}</div><div class="si-l d">${'<i></i>'.repeat(6)}</div>
    <div class="si-c"><b class="si-7m">7m</b><small>Jet de 7 m · ${esc(nom || '')}</small></div>`;
  document.body.appendChild(el);
  Son.jouer('sifflet-long'); vibrer([80, 60, 160]);
  return new Promise(f => setTimeout(() => f(el), moinsAnim() ? 500 : 1800));
}
function septMD(x) {
  if (MD.sept || !MD.el) return;
  const S7 = MD.vue.sept || {};
  MD.sept = {c: S7.c || x.c, n: S7.n || x.n, t: S7.t ?? x.t}; MD.septVue = null; MD.attente = true; majMD();
  Promise.all([septIntro(MD.sept.n), jeux3d().catch(() => null)]).then(([intro]) => {
    if (!MD.el || !MD.sept) { intro.remove(); return; }
    if (MD.sept.c === 'a') septTirer(); else septArreter();
    setTimeout(() => intro.classList.add('fin'), 250); setTimeout(() => intro.remove(), 700);
  });
}
// le résultat d'un jet de 7 m, d'après le fil (Classé : il arrive par la relève)
function septResultat(evs) {
  const t = MD.sept?.t; if (t == null) return null;
  const e = (evs || []).find(y => y.t === t && (y.joue || y.long));
  if (!e) return null;
  return e.long ? 'long' : {'7m-but': 'but', '7m-arret': 'arret'}[e.ty] || e.ty;
}
function septVerifier(neufs, v) {
  if (!MD.sept) return;
  if (MD.septPrep && v.sept?.phase === 'gardien' && v.sept.col) { const f = MD.septPrep; MD.septPrep = null; f({colonne: v.sept.col, hauteur: v.sept.hau, duree: v.sept.duree}); }
  const r = septResultat(neufs);
  if (r && MD.septAttente) { const f = MD.septAttente; MD.septAttente = null; f(r); }
  else if (r && (r === 'long' || MD.septPrep)) septSansJeu(r);   // trop long, ou tiré à côté avant que le gardien n'ait à jouer
}
function septSansJeu(r) {
  MD.septPrep = null; Son.jouer(r === 'long' ? 'sifflet' : 'rate');
  toast(r === 'long' ? 'Trop long ! L’arbitre siffle : ballon à l’adversaire' : R7M[r] || '');
  septFin();
}
function septTirer() {
  ouvrirJet7mMatch({nom: MD.sept.n, pvp: !!MD.pvp,
    tirer: (x, y, f) => MD.pvp
      ? Compte.pvp7m({x, y, puissance: f}, MD.n).then(v => new Promise(res => {
          MD.septAttente = r => res(r === 'long' ? {resultat: 'long'} : {resultat: r, x, y, vitesse: Math.min(f, .8) / .8,
            gardien: {x: r === 'arret' ? x : x < .5 ? .8 : .2, y: r === 'arret' ? y : .5}});
          pvpRecevoir(v);
        }))
      : Compte.match7m({x, y, puissance: f}, MD.n).then(r => { MD.septVue = r.vue; return r.tir; }),
    fin: () => septFin()});
}
function septArreter() {
  const S7 = MD.vue.sept || {};
  ouvrirArret7m({nom: MD.sept.n,
    prep: () => S7.col ? Promise.resolve({colonne: S7.col, hauteur: S7.hau, duree: S7.duree}) : new Promise(res => { MD.septPrep = res; }),
    envoyer: ent => MD.pvp
      ? Compte.pvp7m(ent, MD.n).then(v => { const t = v.tir; pvpRecevoir(v); return {resultat: t?.resultat || septResultat(v.evenements) || 'but'}; })
      : Compte.match7m(ent, MD.n).then(r => { MD.septVue = r.vue; return {resultat: r.tir?.resultat || 'but'}; })
        // l'envoi a échoué (réseau) : le mini-jeu se ferme sans finir ; le 7 m reste à jouer et se rouvre (avant : écran bloqué)
        .catch(e => { setTimeout(() => { if (!MD.el) return; MJ.match = null; MD.sept = null; MD.attente = false; document.body.classList.add('avec-intro'); majMD(); reprendreMD(); }, 400); throw e; }),
    fin: () => septFin()});
}
function septFin() {
  if (J7.match) { J7.match = null; fermerJet7m(true); }
  if (MJ.match) { MJ.match = null; fermerMini(true); }
  if (!MD.el) return;
  document.body.classList.add('avec-intro');
  const v = MD.septVue;
  if (v) {   // Championnat VS Ordi : le résultat et la fin de la tranche
    MD.vue = v; const nv = v.evenements || []; MD.file.push(...nv); MD.n += nv.length;
    MD.finBloc = v.sept ? v.sept.t : v.bloc * 300;
  }
  MD.sept = null; MD.septVue = null; MD.septAttente = null; MD.septPrep = null;
  MD.attente = false; majMD();
}
// notre tir : le mini-jeu du jet de 7 m, sans essais ni pièces
function ouvrirJet7mMatch(o) {
  const el = document.createElement('div');
  el.className = 'j7 j7-3d sept';
  el.innerHTML = `<div class="j7-haut"><b class="j7-score">Jet de 7 m · ${esc(o.nom || '')}</b></div>
    <div class="j7-terrain"><div class="t3"></div><div class="j7-but"><div class="j7-viseur"><i></i></div></div></div>
    <div class="j7-jauge" aria-hidden="true"><i class="j7-ideal"></i><i class="j7-niveau"></i><small>Puissance</small></div>
    <p class="j7-aide">Chargement du terrain…</p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  Son.discret(true);
  Object.assign(J7, {el, tirs: [], limite: 1, gains: 0, demo: false, match: o});
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button') && J7.ctl) { Son.jouer('tap'); toucherJet7m(); } });
  jeux3d().then(m => m.jet7m(J7, el.querySelector('.t3'))).catch(() => null).then(ctl => {
    if (J7.el !== el) return;
    if (!ctl) { toast('Impossible de charger le terrain 3D'); return o.tirer(.5, .5, .5).then(r => o.fin(r)).catch(() => o.fin()); }
    J7.ctl = ctl; nouveauTir();
    el.querySelector('.j7-score').textContent = `Jet de 7 m · ${o.nom || ''}`;
    if (o.pvp) el.querySelector('.j7-aide').textContent = 'Touche pour viser · ne traîne pas, sinon « trop long » !';
  });
}
function animerTir7mMatch(r) {
  const el = J7.el; if (!el) return;
  if (r.resultat === 'long') { el.querySelector('.j7-aide').textContent = ''; }
  const fin = () => {
    if (!J7.el) return;
    el.classList.add(r.resultat === 'but' ? 'r-but' : 'r-rate');
    vibrer(r.resultat === 'but' ? [30, 40, 60] : 40);
    Son.jouer({but: 'but', arret: 'arret', poteau: 'poteau', long: 'sifflet'}[r.resultat] || 'rate');
    const box = el.querySelector('.j7-resultat'); box.innerHTML = `<b>${r.resultat === 'long' ? R7M.long : titre7(r)}</b>`; box.hidden = false;
    setTimeout(() => J7.match?.fin(r), moinsAnim() ? 500 : 1500);
  };
  if (r.resultat === 'long') return fin();
  J7.ctl.tirer(r, moinsAnim() ? 1 : Math.round(560 - 330 * (r.vitesse ?? .7))).then(fin);
}
// Démo (?demo=sept) : un jet de 7 m de match à tirer, puis les deux bouts de la fourchette des arrêts d'affilée (demande de Maël,
// 23 nov. 2026) : le plus lent (1,1 s : tireur bien plus faible que ton gardien) et le plus rapide (0,48 s : bien plus fort), comme en
// match (intro, mini-jeux), sans serveur
function demoSept() {
  const tour = (titre, duree) => Promise.all([septIntro(titre), jeux3d().catch(() => null)]).then(([intro]) => new Promise(fin => {
    if (!duree) ouvrirJet7mMatch({nom: titre, tirer: (x, y, f) => tir7mDemo(x, y, f), fin: () => { J7.match = null; fermerJet7m(true); fin(); }});
    else {
      const prep = {colonne: ['g', 'c', 'd'][Math.floor(Math.random() * 3)], hauteur: Math.random() < .5 ? 'h' : 'b', duree};
      ouvrirArret7m({nom: titre, prep: () => Promise.resolve(prep),
        envoyer: ent => Promise.resolve({resultat: ent.colonne === prep.colonne && ent.hauteur === prep.hauteur && ent.temps <= prep.duree ? 'arret' : 'but'}),
        fin: () => { MJ.match = null; fermerMini(true); fin(); }});
    }
    setTimeout(() => intro.classList.add('fin'), 250); setTimeout(() => intro.remove(), 700);
  }));
  tour('Démo · à toi de tirer')
    .then(() => tour('Arrêt le plus lent · 1,1 s', 1100))
    .then(() => tour('Arrêt le plus rapide · 0,48 s', 480))
    .then(() => toast('Démo des jets de 7 m terminée'));
}
// leur tir : l'arrêt réflexe, le tireur sur le point de 7 m (jeux3d.gardien, MJ.match)
function ouvrirArret7m(o) {
  const el = document.createElement('div');
  el.className = 'j7 mj mj-gardien sept';
  el.innerHTML = `<div class="j7-haut"><b class="j7-score">Jet de 7 m · ${esc(o.nom || '')}</b></div>
    <div class="mj-scene">${JEUX.gardien.scene()}</div><p class="j7-aide"></p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  Son.discret(true);
  Object.assign(MJ, {el, jeu: 'gardien', liste: [], limite: 1, gains: 0, demo: false, toucher: null, timers: [], raf: 0, serie: [], serieN: 0, match: o});
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button') && MJ.toucher) { Son.jouer('tap'); MJ.toucher(e); } });
  JEUX.gardien.essai(el.querySelector('.mj-scene'), 0);
}
// raconte une possession : mise en place, le tireur s'avance, le ballon part ; durée D (ms) jusqu'à l'action suivante
function animerMD(x, D) {
  const tir = TIRS_MD.includes(x.ty), c = x.c;
  MD.svg.style.setProperty('--md-dur', Math.round(Math.max(90, Math.min(520, D * .3))) + 'ms');
  const fin = () => { noterMD(x); sonMD(x); };
  if (x.ty === 'sept') { noterMD(x); return septMD(x); }   // jet de 7 m joué au mini-jeu
  // le momentum se bloque au but qui vient d'être raconté : on attend que le ballon soit au fond
  if (x.ty === 'momentum') return MD.timers.push(setTimeout(() => { if (!MD.el) return; fin();
    flashMD(`🔥 Momentum<small>${esc((x.c === 'b' ? MD.vue.eux.nom : MD.vue.nous.nom) || '')}</small>`, x.c === 'b' ? 'b' : 'a'); }, Math.max(450, D * .85)));
  if (!tir && x.ty !== 'perte') {
    fin();
    if (x.ty === 'excl') flashMD(`2 minutes<small>${esc(nomCourt(x.n))}</small>`, 'ex');
    else if (x.ty === 'temps-mort') flashMD(x.c === 'b' ? `Temps mort<small>${esc(MD.vue.eux.nom)}</small>` : 'Temps mort', x.c === 'b' ? 'b' : 'tm');
    else if (x.ty === 'attaque') flashMD('Nouvelle attaque<small>à deviner</small>', 'b');
    else if (x.ty === 'consigne') flashMD(x.v === 'pression' ? 'Ils pressent !' : x.v === 'prudent' ? 'Ils gèrent' : 'Jeu normal', 'b');
    else if (x.ty === 'mi-temps') { flashMD('Mi-temps', 'tm'); formationDepart(); }
    else if (x.ty === 'momentum-fin' && x.v && x.par === 'tm') flashMD('Momentum cassé', 'tm');
    else if (x.ty === 'defense') flashMD(`Défense ${NOM_DEF[x.v] || ''}`, 'tm');
    else if (x.ty === 'changement') flashMD(`Changement<small>${esc(nomCourt(x.n))} entre</small>`, 'tm');
    else if (x.ty === 'blessure') {   // le match s'arrête et le banc s'ouvre : il faut le remplacer (il joue diminué en attendant)
      flashMD(`Blessure !<small>${esc(nomCourt(x.n))}</small>`, 'ex'); Son.jouer('sifflet'); vibrer([60, 40, 60]);
      if (x.r && !MD.fin) { MD.blessePoste = x.p; MD.blesseNom = x.n; panneauMD('blessure'); panneauBanc(); }
    }
    return;
  }
  const s = slotMD(c, x.n, x.z), i = SLOTS_MD.indexOf(s), contre = x.z === 'contre';
  formationMD(c, contre);
  const p0 = rotMD(c, contre ? CONTRE_POS[i] : x.z === '7m' ? [32.4, 10] : ATT_POS[s]);
  placerMD('bal', [p0[0] + (c === 'a' ? .5 : -.5), p0[1] - .4]);
  const p1 = rotMD(c, (TIR_POS[x.z] || TIR_POS.arrieres)(s));
  MD.timers.push(setTimeout(() => { if (!MD.el) return; placerMD(c + i, p1); placerMD('bal', [p1[0] + (c === 'a' ? .5 : -.5), p1[1] - .4]); }, D * .3));
  MD.timers.push(setTimeout(() => {
    if (!MD.el) return;
    const y = c === 'a' ? 'b' : 'a', r = Math.random();
    let cible = [40.4, 8.9 + r * 2.2], txt = '', cls = c;
    if (x.ty === 'but' || x.ty === '7m-but') { txt = `BUT !<small>${esc(nomCourt(x.n))}</small>`; }
    else if (x.ty === 'arret' || x.ty === '7m-arret') { cible = [39.1, 9 + r * 2]; placerMD(y + 6, rotMD(c, cible)); txt = 'Arrêt !'; cls = y; }
    else if (x.ty === 'poteau') { cible = [40, r < .5 ? 8.5 : 11.5]; txt = 'Poteau !'; }
    else if (x.ty === 'dehors') { cible = [41.2, r < .5 ? 6.8 : 13.2]; txt = 'À côté'; }
    else { const k = Math.floor(r * 6); cible = (DEF_POS[y === 'a' ? MD.tac.split(':')[1] : MD.defB] || DEF_POS['06'])[k]; txt = 'Ballon perdu'; cls = 'n'; }
    placerMD('bal', rotMD(c, cible));
    flashMD(txt, cls); fin();
  }, D * .62));
}
function sonMD(x) {
  const s = {but: x.c === 'a' ? 'but' : 'encaisse', '7m-but': x.c === 'a' ? 'but' : 'encaisse', arret: 'arret', '7m-arret': 'arret', poteau: 'poteau',
    dehors: 'rate', excl: 'sifflet', 'temps-mort': 'sifflet', 'mi-temps': 'buzzer', momentum: x.c === 'a' ? 'montee' : 'notif', 'momentum-fin': x.v ? 'dechire' : null}[x.ty];
  if (s && MD.vitesse < 4 || ['but', '7m-but', 'mi-temps'].includes(x.ty) && s) Son.jouer(s);
}
function boucleMD(ts) {
  if (!MD.el) return;
  const dt = MD.ts ? Math.min(120, ts - MD.ts) : 0; MD.ts = ts;
  if (!MD.attente) {
    MD.h = Math.min(MD.h + dt * MD.vitesse / MS_SEC, MD.finBloc);
    while (MD.file.length && MD.file[0].t <= MD.h && !MD.attente) {
      // durée jusqu'à la prochaine seconde différente (un but et le momentum, ou une exclusion, tombent à la même seconde)
      const x = MD.file.shift(), suivant = MD.file.find(y => y.t > x.t)?.t ?? x.t + 30;
      animerMD(x, Math.max(120, Math.min(1500, (suivant - x.t) * MS_SEC / MD.vitesse * .95)));
    }
    majHorlogeMD();
    if (!MD.attente && !MD.file.length && MD.h >= MD.finBloc) finBlocMD();
  }
  MD.raf = requestAnimationFrame(boucleMD);
}
function majHorlogeMD() {
  const m = Math.min(60, Math.floor(MD.h / 60));
  MD.el.querySelector('.md-min').textContent = m + "'";
  MD.el.querySelector('.md-per').textContent = MD.fin && MD.h >= 3600 ? 'Fin du match' : MD.h < 1800 || (MD.h === 1800 && MD.vue.bloc <= 6 && !MD.evs.some(x => x.t > 1800)) ? (MD.h === 1800 ? 'Mi-temps' : '1re période') : '2e période';
  for (const c of ['a', 'b']) MD.el.querySelector('.md-ex.' + c).hidden = !(MD.exclu[c] > MD.h);
}
// fin du récit d'un bloc : le bloc suivant, la mi-temps, le temps mort demandé ou le résultat
// (la mi-temps est obligatoire : le match s'arrête à 30' sur un écran à part, même sans rien changer)
function finBlocMD() {
  MD.attente = true;
  // une tranche ou un changement déjà demandés, ou un panneau ouvert : on attend (sauf « Tactique » d'un match à deux, qui n'arrête pas le jeu)
  if (MD.enCours || MD.chgEnCours || MD.panneau && !(MD.pvp && MD.panneau === 'tactique')) return;
  if (MD.vue.sept && !MD.sept) return septMD(MD.vue.sept);   // un jet de 7 m à jouer (match repris, par exemple)
  if (MD.pvp) return pvpFinBloc();
  const pause = Math.round(650 / MD.vitesse);
  if (MD.tab) return MD.timers.push(setTimeout(() => panneauTab(), pause + 400));
  if (MD.fin) return MD.timers.push(setTimeout(() => resultatMD(MD.fin), pause + 400));
  if (MD.vue.bloc === 6) return MD.timers.push(setTimeout(() => panneauMD('mi-temps'), pause));
  blocMD();
}
// temps mort (à la fin de la tranche) : le serveur le compte et dévoile leur tactique du moment, attaque comprise
// temps mort tout de suite (demande de Maël, 20 nov. 2026), à la seconde affichée : le serveur revient à cette seconde ; ce qui était
// prévu après est oublié, la fin de la tranche sera jouée à la reprise (blocMD), avec la tactique choisie pendant le temps mort
function tempsMortMD() {
  if (MD.pvp) return pvpTempsMort();
  if (MD.enCours || MD.chgEnCours) return toast('Un instant…');
  MD.enCours = true; MD.attente = true; majMD();
  Compte.matchTempsMort(Math.floor(MD.h)).then(r => {
    MD.enCours = false; if (!MD.el) return;
    MD.vue = r.vue; MD.adverse = r.adverse; MD.defB = r.adverse.defense;
    // ce qui était déjà joué jusqu'au temps mort s'écrit au fil ; la suite prévue est oubliée
    const avant = MD.file.filter(x => x.t <= r.reprise); MD.file = [];
    for (const x of avant) noterMD(x, true);
    MD.h = Math.max(MD.h, r.reprise); MD.finBloc = MD.h; majHorlogeMD();
    for (const x of r.vue.evenements || []) noterMD(x);
    fermerBancMD(); Son.jouer('sifflet'); flashMD('Temps mort', 'tm'); panneauMD('tm');
  }).catch(e => { MD.enCours = false; if (!MD.el) return; Son.jouer('erreur'); toast(e.message || 'Action impossible'); reprendreMD(); majMD(); });
}
function blocMD() {
  if (MD.vue?.sept && !MD.sept) return septMD(MD.vue.sept);   // temps mort ou changement pris juste avant un jet de 7 m : le jet d'abord
  MD.attente = true; MD.enCours = true; majMD();
  Compte.matchBloc(MD.tac, MD.cons, false).then(r => {
    MD.enCours = false; if (!MD.el) return;
    MD.vue = r.vue; MD.file.push(...(r.vue.evenements || [])); MD.finBloc = r.vue.sept ? r.vue.sept.t : r.vue.bloc * 300;
    if (r.match) { MD.fin = r; MD.finBloc = 3600; }
    if (r.tirsAuBut) { MD.tab = r.tirsAuBut; MD.finBloc = 3600; }   // nul en tournoi ou contre une Légende : tirs au but
    if (!MD.panneau) MD.attente = false;
    majMD(); majBancMD();
  }).catch(e => { MD.enCours = false; if (!MD.el) return;
    // un jet de 7 m attend sur le serveur et l'écran ne le savait pas (match repris, écran d'avant la v99) : on relit le match et on le
    // joue, au lieu de redemander la suite en boucle (retour de Rémi, 24 nov. 2026 : bloqué en plein match « à cause d'un penalty »)
    if (/Jet de 7 m/.test(e.message || '')) return Compte.matchEnCours().then(v => {
      if (!MD.el) return;
      if (v?.sept) { MD.vue = v; MD.finBloc = v.sept.t; septMD(v.sept); } else panneauMD('erreur');
    }).catch(() => MD.el && panneauMD('erreur'));
    Son.jouer('erreur'); toast(e.message || 'Action impossible'); panneauMD('erreur'); });
}
const tmPossible = () => { const t = MD.vue.tempsMorts || {}, per = MD.h < 1800 ? 'p1' : 'p2';
  return t.restants > 0 && (t[per] || 0) < 2 && MD.h > 0 && MD.h < 3600 && !(MD.h === 1800 && MD.vue.bloc === 6) && !MD.panneau && !MD.pvp?.pause; };
function majMD() {
  if (!MD.el) return;
  const t = MD.vue.tempsMorts || {restants: 3}, [att, def] = MD.tac.split(':');
  const tc = MD.el.querySelector('.md-tac');
  // les changements se font depuis « Tactique » (retour de Guilhem, 21 nov. 2026) : le bouton prévient quand des joueurs sont dans le rouge
  const ef = MD.vue.nous.effectif || {}, rouges = bancMD().length ? POSTES_MD.filter(k => ef[k]?.n && fraicheur(ef[k].f) < 40).length : 0;
  tc.disabled = !!MD.fin; tc.classList.toggle('alerte', !!rouges && !MD.fin);
  tc.innerHTML = `Tactique<small>${rouges ? `🔁 ${rouges} dans le rouge` : bancMD().length ? 'et changements' : MD.vue.bloc > 0 && MD.vue.bloc < 12 ? `change à ${Math.min(60, MD.finBloc / 60)}'` : 'à tout moment'}</small>`;
  const bt = MD.el.querySelector('.md-tm');
  bt.disabled = !tmPossible() || !!MD.fin || !!MD.enCours;
  bt.innerHTML = `Temps mort<small>${t.restants} · ${MD.pvp ? '20 s pour tous' : 'voir leur jeu'}</small>`;
  MD.el.querySelector('.md-vit').innerHTML = `×${MD.vitesse}<small>vitesse</small>`;
  const sim = MD.el.querySelector('.md-sim'), g = 1 - (1 - gainSimule()) * (12 - MD.vue.bloc) / 12;
  sim.disabled = !!MD.fin; sim.innerHTML = `Simuler<small>gains −${pcMoins(g)} %</small>`;
  const sb = statsMD(MD.evs).b, top = ZONES_MD.filter(([k]) => k !== '7m').sort((p, q) => sb.zones[q[0]] - sb.zones[p[0]])[0];
  MD.el.querySelector('.md-info').innerHTML = `Toi : <b>${NOM_ATT[att]}</b> · <b>${NOM_DEF[def]}</b> · ${CONSIGNES.find(c => c[0] === MD.cons)?.[1] || ''}
    <span>Eux : défense <b>${NOM_DEF[MD.defB] || '?'}</b> · ${MD.vue.tempsMortsAdv?.restants ?? 3} temps mort${(MD.vue.tempsMortsAdv?.restants ?? 3) > 1 ? 's' : ''}${sb.buts >= 3 ? ` · buts surtout : ${top[1].toLowerCase()}` : ''}</span>`;
  if (MD.onglet === 'stats') majStatsMD();
}
function majStatsMD() {
  const s = statsMD(MD.evs), A = s.a, B = s.b;
  const ligne = (nom, a, b, suffixe = '') => { const t = a + b; return `<div class="md-st"><b>${a}${suffixe}</b><span>${nom}<i><i style="transform:scaleX(${t ? a / t : .5})"></i></i></span><b>${b}${suffixe}</b></div>`; };
  const reu = x => x.tirs ? Math.round(x.buts / x.tirs * 100) : 0;
  const zones = (S, titre) => `<h4>${titre}</h4><div class="md-zones">${ZONES_MD.map(([k, nom]) => `<div><small>${nom}</small><i><i style="transform:scaleX(${S.buts ? S.zones[k] / S.buts : 0})"></i></i><b>${S.zones[k]}</b></div>`).join('')}</div>`;
  MD.el.querySelector('.md-stats').innerHTML = `<div class="md-st t"><b>${esc(MD.vue.nous.nom)}</b><span></span><b>${esc(MD.vue.eux.nom)}</b></div>
    ${ligne('Buts', A.buts, B.buts)}${ligne('Tirs', A.tirs, B.tirs)}${ligne('Réussite', reu(A), reu(B), ' %')}${ligne('Arrêts', A.arrets, B.arrets)}
    ${ligne('Pertes de balle', A.pertes, B.pertes)}${ligne('Exclusions', A.excl, B.excl)}${ligne('Jets de 7 m', A.sept, B.sept)}
    ${zones(B, `D’où viennent leurs buts`)}${zones(A, 'Tes buts')}
    <p class="sub petit">🕵️ D’où tirent-ils ? Arrières = duels, pivot = enclenchement, ailes et contres = jeu rapide.</p>`;
}
// panneau de choix : coup d'envoi, mi-temps, temps mort (changements permis) ; pause (reprise) ; erreur réseau
function panneauMD(type) {
  if (!MD.el) return;
  if (!(MD.pvp && type === 'tactique')) MD.attente = true;
  MD.panneau = type; MD.panneauBloc = MD.vue.bloc;
  const [att, def] = MD.tac.split(':');
  MD.choix = {att, def, cons: MD.cons};
  const p = MD.el.querySelector('.md-panneau'), sc = MD.vue.score || [0, 0];
  const titre = {envoi: 'Coup d’envoi', 'mi-temps': `Mi-temps · ${sc[0]} – ${sc[1]}`, tm: `Temps mort · ${Math.floor(MD.h / 60)}'`, tactique: 'Tactique',
    pause: `Match en pause · ${Math.floor(MD.h / 60)}'`, blessure: `Blessure · ${Math.floor(MD.h / 60)}'`, erreur: 'Connexion perdue'}[type];
  const change = ['envoi', 'mi-temps', 'tm', 'tactique', 'pause', 'blessure'].includes(type), A = MD.adverse;
  const quand = MD.vue.bloc > 0 && MD.vue.bloc < 12 && type === 'tactique' ? ` Ton choix s’applique à <b>${Math.min(60, MD.finBloc / 60)}'</b>.` : '';
  const PZ = MD.pvp?.pause;
  const intro = MD.pvp ? {envoi: `Match en direct contre <b>${nomEux()}</b> : vous choisissez en même temps. Ils commencent en <b>${NOM_DEF[MD.defB]}</b>.`,
    'mi-temps': `Ils défendent en <b>${NOM_DEF[MD.defB]}</b>. Change ce que tu veux 🔄`,
    tm: PZ?.moi ? (A ? `🕵️ Leur jeu dévoilé : ils attaquent en <b>${NOM_ATT[A.attaque]}</b> et défendent en <b>${NOM_DEF[A.defense]}</b>. Élan pendant 3 minutes ⚡` : 'Ton temps mort.')
      : `Temps mort de <b>${nomEux()}</b> : profites-en pour changer ta tactique ou faire tes changements.`,
    tactique: `Ils défendent en <b>${NOM_DEF[MD.defB]}</b> ; leur attaque reste cachée. Ton choix part avec la tranche suivante, le match continue.`,
    pause: '', blessure: '', erreur: 'Oups, la connexion a coupé.'}[type] : {envoi: `Ils défendent en <b>${NOM_DEF[MD.defB]}</b>. À toi de jouer ! Tu pourras changer de tactique toutes les 5 minutes.`,
    'mi-temps': `Ils défendent en <b>${NOM_DEF[MD.defB]}</b>. Change ce que tu veux 🔄`,
    tm: A ? `🕵️ Leur jeu dévoilé : ils attaquent en <b>${NOM_ATT[A.attaque]}</b> et défendent en <b>${NOM_DEF[A.defense]}</b>. Bonus : élan pendant 3 minutes ⚡`
      : `Ils défendent en <b>${NOM_DEF[MD.defB]}</b>.`,
    tactique: `Ils défendent en <b>${NOM_DEF[MD.defB]}</b> ; leur attaque reste cachée (un temps mort la dévoile).${quand}`,
    pause: `Ils défendent en <b>${NOM_DEF[MD.defB]}</b>. Change ce que tu veux, puis reprends.`,
    blessure: `🚑 <b>${esc(nomCourt(MD.blesseNom || ''))}</b> est blessé(e) et joue diminué(e) : fais entrer son remplaçant (obligatoire), puis reprends.`, erreur: 'Oups, la connexion a coupé.'}[type];
  // la mi-temps : le bilan de la 1re période (ce qui a été raconté jusqu'ici)
  const st = type === 'mi-temps' ? statsMD(MD.evs) : null, reu = x => x.tirs ? Math.round(x.buts / x.tirs * 100) + ' %' : '–';
  const zoneB = st && ZONES_MD.filter(([k]) => k !== '7m').sort((x, y) => st.b.zones[y[0]] - st.b.zones[x[0]])[0];
  const bilan = st ? `<div class="md-bilan"><div><b>${st.a.tirs}</b><small>tirs</small><b>${st.b.tirs}</b></div><div><b>${reu(st.a)}</b><small>réussite</small><b>${reu(st.b)}</b></div>
    <div><b>${st.a.arrets}</b><small>arrêts</small><b>${st.b.arrets}</b></div><div><b>${st.a.pertes}</b><small>pertes</small><b>${st.b.pertes}</b></div></div>
    ${st.b.buts >= 3 ? `<p class="sub petit centre">Leurs buts viennent surtout : <b>${zoneB[1].toLowerCase()}</b></p>` : ''}` : '';
  p.innerHTML = `<div class="md-p-c"><h3>${titre}</h3>${bilan}<p class="sub petit">${intro}</p>
    ${MD.pvp && ['envoi', 'mi-temps', 'tm'].includes(type) ? '<p class="md-cd"></p>' : ''}
    ${change && !MD.pvp ? `<p class="md-astuce">Coach adverse <b>${esc(MD.vue.eux.entraineur || 'réfléchi')}</b> : ${ASTUCE_IA[MD.vue.eux.entraineur] || ASTUCE_IA['réfléchi']}</p>` : ''}
    ${change && !MD.pvp ? indiceIA() : ''}
    ${change ? `<h4>Attaque</h4><div class="md-ch">${TACT_ATT.map(([k, nom]) => `<button data-md-att="${k}"><b>${nom}</b><small>${ZONE_ATT[k]}<br>bat la ${NOM_DEF[BAT[k]]} · bute sur la ${NOM_DEF[BATTU[k]]}</small></button>`).join('')}</div>
      <h4>Défense</h4><div class="md-ch">${['06', '15', '33'].map(d => { const fort = Object.keys(BATTU).find(a => BATTU[a] === d), faible = Object.keys(BAT).find(a => BAT[a] === d);
        return `<button data-md-def="${d}"><b>${NOM_DEF[d]}</b><small>arrête ${NOM_ATT[fort].toLowerCase()}<br>souffre face ${faible === 'duels' ? 'aux duels' : faible === 'rapide' ? 'au jeu rapide' : 'à l’enclenchement'}</small></button>`; }).join('')}</div>
      <h4>Consigne</h4><div class="md-ch">${CONSIGNES.map(([k, nom, aide]) => `<button data-md-cons="${k}"><b>${nom}</b><small>${aide}</small></button>`).join('')}</div>` : ''}
    ${change && bancMD().length ? `<button class="btn ghost md-p-banc" data-md-go="banc">🔁 Changements<small>${resumeBancMD()}</small></button>` : ''}
    <div class="md-p-b">${type === 'tactique' ? '<button class="btn ghost" data-md-go="annuler">Annuler</button>'
        : type !== 'envoi' && !MD.pvp && MD.vue.type !== 'classe' ? `<button class="btn ghost" data-md-go="sim">Simuler la fin</button>` : ''}
      <button class="btn gold" data-md-go="jouer">${MD.pvp && type !== 'tactique' ? 'Prêt' : {envoi: 'Coup d’envoi', 'mi-temps': '2e période', tm: 'Reprendre le jeu', tactique: 'Valider', pause: 'Reprendre', blessure: 'Reprendre', erreur: 'Réessayer'}[type]}</button></div></div>`;
  p.hidden = false; MD.el.classList.add('en-pause');
  choixMD();
  majMD(); if (MD.pvp) pvpCompteur();
}
// ── remplaçants en match (demande de Maël, 19 nov. 2026) : chaque poste, son titulaire et son remplaçant, leur fraîcheur
const POSTES_MD = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'];
const bancMD = () => { const ef = MD.vue?.nous?.effectif; return ef ? POSTES_MD.filter(k => ef[k]?.r) : []; };
// fraîcheur affichée : fatigue 0 → 100 %, 1 → 0 % (fatigue de chaque joueur, 20 nov. 2026) ; dans le rouge sous 40 %, il joue
// moins bien et risque de se blesser
const fraicheur = f => Math.max(0, Math.min(100, Math.round(100 - 100 * (+f || 0))));
const zoneFr = fr => fr < 40 ? ' rouge' : fr < 65 ? ' bas' : '';
function resumeBancMD() {
  const ef = MD.vue.nous.effectif, k = POSTES_MD.filter(k => ef[k]?.n).sort((a, b) => fraicheur(ef[a].f) - fraicheur(ef[b].f))[0];
  return k ? `le plus fatigué : ${esc(nomCourt(ef[k].n))}, ${fraicheur(ef[k].f)} %` : '';
}
// le banc s'ouvre par-dessus le match sans l'arrêter (demande de Maël, 20 nov. 2026 : « dès qu'on appuie, et le temps ne
// s'arrête pas ») : un toucher sur un poste et le remplaçant entre à la seconde affichée (match_changer)
function panneauBanc() {
  if (!MD.el || !bancMD().length) return;
  MD.bancOuvert = true; majBancMD();
  MD.el.querySelector('.md-bancp').hidden = false;
}
function majBancMD() {
  if (!MD.el || !MD.bancOuvert) return;
  const ef = MD.vue.nous.effectif || {}, p = MD.el.querySelector('.md-bancp'), occupe = MD.chgEnCours || MD.enCours;
  const blesses = new Set(MD.evs.filter(x => (x.ty === 'blessure' || x.ty === 'absent') && x.c === 'a').map(x => x.n));
  const jr = (n, note, f, cls) => `<span class="md-bj ${cls}"><b>${esc(String(nomCourt(n) || '').replace(/--/g, '-'))}</b><small>${note ?? '–'} · ${fraicheur(f)} %</small><i class="md-fr${zoneFr(fraicheur(f))}"><i style="transform:scaleX(${fraicheur(f) / 100})"></i></i></span>`;
  const bl = POSTES_MD.find(k => blesses.has(ef[k]?.n) && ef[k]?.r && !blesses.has(ef[k].r));
  p.innerHTML = `<div class="md-p-c"><h3>Changements <small>le match continue</small></h3>
    ${bl ? `<p class="md-alerte">🚑 <b>${esc(nomCourt(ef[bl].n))}</b> est blessé(e) et joue diminué(e) : fais entrer ${esc(nomCourt(ef[bl].r))} (${bl}).</p>` : ''}
    <p class="sub petit">${MD.pvp ? 'Touche un poste : le remplaçant entre à la reprise (tranche suivante, ou fin du temps mort) ; touche-le encore pour annuler.' : 'Touche un poste : le remplaçant entre tout de suite.'} Autant de changements que tu veux, comme au handball ; sur le banc, on récupère. La barre = la fraîcheur : dans le rouge, il joue moins bien et risque de se blesser.</p>
    <div class="md-banc">${POSTES_MD.map(k => { const x = ef[k] || {};
      const bt = blesses.has(x.n), br = blesses.has(x.r);
      const prevu = MD.pvp && (MD.pvpPostes || []).includes(k);
      return `<button class="md-bl${MD.chgPoste === k || prevu ? ' on' : ''}${bt ? ' blesse' : ''}" data-md-chg="${k}"${x.r && !br && !occupe && !MD.fin ? '' : ' disabled'}><em>${prevu ? k + ' ⏳' : k}</em>${jr(x.n, x.note, x.f, 't' + (bt ? ' md-blesse' : ''))}<span class="md-bfl" aria-hidden="true">⇄</span>${x.r ? jr(x.r, x.rnote, x.rf, 'r' + (br ? ' md-blesse' : '')) : '<span class="md-bj r vide"><small>pas de remplaçant</small></span>'}</button>`; }).join('')}</div>
    ${(() => { const n = postesBancTous().length;
      return n > 1 ? `<button class="btn ghost md-tous${MD.chgPoste === 'tous' ? ' on' : ''}" data-md-chg="tous"${occupe || MD.fin ? ' disabled' : ''}>⇄ Changer les ${n} joueurs de champ d’un coup<small>le gardien reste</small></button>` : ''; })()}
    <div class="md-p-b"><button class="btn gold" data-md-go="banc-fermer">Fermer</button></div></div>`;
}
function fermerBancMD() { MD.bancOuvert = false; if (MD.el) MD.el.querySelector('.md-bancp').hidden = true; }
// « tout le banc » (demande de Rémi, 23 nov. 2026) : les postes de champ qui ont un remplaçant valide (jamais le gardien)
function postesBancTous() {
  const ef = MD.vue.nous.effectif || {}, blesses = new Set(MD.evs.filter(x => (x.ty === 'blessure' || x.ty === 'absent') && x.c === 'a').map(x => x.n));
  return POSTES_MD.filter(k => k !== 'GB' && ef[k]?.r && !blesses.has(ef[k].r));
}
function changerMD(poste) {
  if (MD.pvp) return pvpChanger(poste);
  if (MD.chgEnCours || MD.fin || MD.tab) return;
  if (MD.enCours) return toast('Un instant…');
  const postes = poste === 'tous' ? postesBancTous() : [poste];
  if (!postes.length) return;
  MD.chgEnCours = true; MD.chgPoste = poste; majBancMD();
  Compte.matchChanger(postes, Math.floor(MD.h)).then(r => {
    MD.chgEnCours = false; MD.chgPoste = null; if (!MD.el) return;
    // ce qui est déjà raconté (jusqu'à « reprise ») reste ; la suite de la tranche est rejouée avec le remplaçant
    MD.vue = r.vue; MD.file = MD.file.filter(x => x.t <= r.reprise).concat(r.vue.evenements || []);
    if (MD.blessePoste && postes.includes(MD.blessePoste)) MD.blessePoste = null;   // le blessé est remplacé : on peut reprendre
    // la tranche rejouée va jusqu'au bout, ou jusqu'à un jet de 7 m (celui d'avant, plus loin, n'a pas eu lieu)
    if (r.reprise < MD.finBloc || r.vue.sept) MD.finBloc = r.vue.sept ? r.vue.sept.t : Math.max(MD.finBloc, r.vue.bloc * 300);
    // récit à l'arrêt (mi-temps, temps mort, pause) : le changement s'écrit tout de suite au fil
    // (le serveur a pu le placer quelques secondes plus loin que le récit en pause : le fil va jusqu'à son entrée)
    if (MD.attente && r.reprise > MD.h) { MD.h = Math.min(r.reprise, MD.finBloc); majHorlogeMD(); }
    if (MD.attente) while (MD.file.length && MD.file[0].t <= MD.h) animerMD(MD.file.shift(), 300);
    // pas de sifflet à chaque changement (retour de Guilhem, 21 nov. 2026 : « horrible et inutile »)
    if (r.reprise > MD.h + 30) toast(`${postes.length > 1 ? 'Ils entrent' : 'Il entre'} à ${Math.floor(r.reprise / 60)}'`);
    majBancMD(); majMD();
    if (!MD.panneau && !MD.file.length && MD.h >= MD.finBloc) finBlocMD();
  }).catch(e => { MD.chgEnCours = false; MD.chgPoste = null; if (!MD.el) return; Son.jouer('erreur'); toast(e.message || 'Action impossible'); majBancMD(); });
}
function choixMD() {
  const p = MD.el.querySelector('.md-panneau'), c = MD.choix;
  p.querySelectorAll('[data-md-att]').forEach(b => b.classList.toggle('on', b.dataset.mdAtt === c.att));
  p.querySelectorAll('[data-md-def]').forEach(b => b.classList.toggle('on', b.dataset.mdDef === c.def));
  p.querySelectorAll('[data-md-cons]').forEach(b => b.classList.toggle('on', b.dataset.mdCons === c.cons));
}
// après le panneau Tactique : le récit reprend là où il était (ou la tranche suivante est demandée s'il était fini)
function reprendreMD() {
  if (MD.enCours) return;
  if (!MD.file.length && MD.h >= MD.finBloc) return finBlocMD();
  MD.attente = false;
}
function fermerPanneauMD() { MD.el.querySelector('.md-panneau').hidden = true; MD.el.classList.remove('en-pause'); MD.panneau = null; }
function clicMD(e) {
  e.stopPropagation();
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  Son.jouer('clic');
  const d = b.dataset;
  if (b.classList.contains('md-x')) return fermerDirect();
  if (d.mdOnglet) {
    MD.onglet = d.mdOnglet;
    MD.el.querySelectorAll('[data-md-onglet]').forEach(x => x.classList.toggle('on', x === b));
    MD.el.querySelector('.md-fil').hidden = MD.onglet !== 'direct'; MD.el.querySelector('.md-stats').hidden = MD.onglet !== 'stats';
    if (MD.onglet === 'stats') majStatsMD();
    return;
  }
  if (d.mdAtt) { MD.choix.att = d.mdAtt; return choixMD(); }
  if (d.mdDef) { MD.choix.def = d.mdDef; return choixMD(); }
  if (d.mdCons) { MD.choix.cons = d.mdCons; return choixMD(); }
  if (d.mdChg) return changerMD(d.mdChg);
  if (d.tabGb) { MD.tabSel.gb = d.tabGb; MD.tabSel.tireurs = MD.tabSel.tireurs.filter(x => x !== d.tabGb); return panneauTab(); }
  if (d.tabT) { const t = MD.tabSel.tireurs, i = t.indexOf(d.tabT);
    if (i >= 0) t.splice(i, 1); else if (t.length < tabMax()) t.push(d.tabT); return panneauTab(); }
  if (d.mdGo === 'tab-tirer') return tirerTab();
  if (d.mdGo === 'tab-fin') return resultatMD(MD.fin);
  if (d.mdGo === 'tab-jouer') return tabJouer();
  if (b.classList.contains('md-chg') || d.mdGo === 'banc') return panneauBanc();
  if (d.mdGo === 'banc-fermer') return fermerBancMD();
  if (b.classList.contains('md-vit')) { MD.vitesse = MD.vitesse === 4 ? 1 : MD.vitesse * 2; try { localStorage.setItem('mhc-vitesse', MD.vitesse); } catch (er) {} return majMD(); }
  if (b.classList.contains('md-tm')) return tempsMortMD();
  if (b.classList.contains('md-tac')) return panneauMD('tactique');
  if ((b.classList.contains('md-sim') || d.mdGo === 'sim') && !MD.pvp && MD.vue.type !== 'classe') return simulerFinMD();
  if (d.mdGo === 'annuler') { fermerPanneauMD(); return reprendreMD(); }
  if (d.mdGo === 'jouer') {
    const type = MD.panneau;
    // blessure : le remplacement est obligatoire quand il y a un remplaçant (demande de Maël, 24 nov. 2026)
    if (type === 'blessure' && MD.blessePoste && !MD.pvp) { Son.jouer('erreur'); toast('Fais d’abord entrer son remplaçant'); return panneauBanc(); }
    if (type !== 'erreur') { MD.tac = `${MD.choix.att}:${MD.choix.def}`; MD.cons = MD.choix.cons; }
    fermerPanneauMD(); majMD();
    if (type === 'envoi' || type === 'mi-temps') Son.jouer('sifflet');
    if (MD.pvp) return pvpJouer(type);
    if (type === 'tactique' || type === 'blessure') return reprendreMD();   // le récit reprend ; le changement de tactique part avec la tranche suivante
    return blocMD();
  }
  if (d.act === 'fin-direct') return fermerDirect();
}
function simulerFinMD() {
  const g = 1 - (1 - gainSimule()) * (12 - MD.vue.bloc) / 12;
  demander(`Simuler la fin du match ? Le reste est joué tout de suite avec ta tactique actuelle, sans temps mort. Gains −${pcMoins(g)} %.`, 'Simuler')
    .then(oui => { if (oui && MD.el && !MD.fin && !MD.attente) simulerFinMDOui(); });
}
function simulerFinMDOui() {
  MD.attente = true; MD.timers.forEach(clearTimeout); MD.file = [];
  Compte.matchSimulerFin().then(r => {
    if (!MD.el) return;
    const deja = MD.evs.length, tous = r.match.evenements || [];
    for (const x of tous.slice(deja)) noterMD(x, true);
    MD.fin = r; MD.h = 3600; majHorlogeMD(); resultatMD(r);
  }).catch(e => { Son.jouer('erreur'); toast(e.message || 'Action impossible'); MD.attente = false; });
}
// Tirs au but (demande de Maël, 23 nov. 2026) : après un nul en tournoi ou contre une Légende, le joueur choisit son gardien
// (mental et réflexes) et 5 tireurs dans l'ordre (seul le TIR compte) ; le serveur joue la séance (match_tirs_au_but)
const tabMax = () => Math.min(5, (MD.tab?.joueurs || []).filter(x => x.id !== MD.tabSel?.gb).length);
function panneauTab() {
  if (!MD.el || !MD.tab) return;
  const js = MD.tab.joueurs || [], adv = MD.tab.adversaire || {};
  if (!MD.tabSel) {   // proposé d'office : le meilleur gardien et les 5 meilleurs tireurs
    const gb = [...js].filter(x => x.gb != null).sort((a, b) => b.gb - a.gb)[0];
    MD.tabSel = {gb: gb?.id || null, tireurs: []};
    MD.tabSel.tireurs = [...js].filter(x => x.id !== MD.tabSel.gb).sort((a, b) => b.tir - a.tir).slice(0, 5).map(x => x.id);
  }
  const s = MD.tabSel, nom = x => esc(String(nomCourt(x.nom) || '').replace(/--/g, '-')), ok = s.gb && s.tireurs.length === tabMax();
  MD.panneau = 'tab'; MD.attente = true;
  const p = MD.el.querySelector('.md-panneau');
  p.innerHTML = `<div class="md-p-c md-tab"><h3>Tirs au but</h3>
    <p class="sub petit">Match nul : choisis ton gardien et tes ${tabMax()} tireurs, dans l’ordre. Pour un tireur, seul son <b>TIR</b> compte ; pour le gardien, son <b>mental</b> et ses <b>réflexes</b>.</p>
    <p class="md-astuce">En face (${esc(adv.nom || '')}) : gardien <b>${adv.gb ?? '–'}</b> · tireurs <b>${adv.tir ?? '–'}</b></p>
    <h4>Gardien</h4><div class="tab-l">${js.filter(x => x.gb != null).sort((a, b) => b.gb - a.gb).map(x =>
      `<button class="tab-j${s.gb === x.id ? ' on' : ''}" data-tab-gb="${x.id}"><b>${nom(x)}</b><small>MEN/RÉF ${x.gb}${x.titulaire ? '' : ' · banc'}</small></button>`).join('') || '<p class="sub petit">Aucun gardien valide.</p>'}</div>
    <h4>Tireurs <small>${s.tireurs.length}/${tabMax()} · touche dans l’ordre</small></h4><div class="tab-l">${[...js].sort((a, b) => b.tir - a.tir).map(x => { const i = s.tireurs.indexOf(x.id);
      return `<button class="tab-j${i >= 0 ? ' on' : ''}" data-tab-t="${x.id}"${x.id === s.gb ? ' disabled' : ''}>${i >= 0 ? `<em>${i + 1}</em>` : ''}<b>${nom(x)}</b><small>TIR ${x.tir}${x.titulaire ? '' : ' · banc'}</small></button>`; }).join('')}</div>
    <div class="md-p-b"><button class="btn gold" data-md-go="tab-tirer"${ok && !MD.enCours ? '' : ' disabled'}>Tirer !</button></div></div>`;
  p.hidden = false; MD.el.classList.add('en-pause');
}
function tirerTab() {
  if (MD.enCours || !MD.tabSel) return;
  MD.enCours = true; panneauTab();
  Compte.matchTirsAuBut(MD.tabSel.tireurs, MD.tabSel.gb, true).then(r => {
    MD.enCours = false; if (!MD.el) return;
    MD.tab = null;
    if (r.tabJeu) return tabJeu(r.tabJeu, true);   // la séance se joue aux mini-jeux
    MD.fin = r; MD.vue = r.vue || MD.vue;
    seanceTab(r);
  }).catch(e => { MD.enCours = false; if (!MD.el) return; Son.jouer('erreur'); toast(e.message || 'Action impossible'); panneauTab(); });
}
// Tirs au but joués aux mini-jeux (demande de Maël, 24 nov. 2026) : nous tirons puis ils tirent, chacun son tour (5 chacun, puis mort
// subite) ; notre tir = mini-jeu du jet de 7 m, le leur = mini-jeu de l'arrêt ; le serveur décide chaque tir (match_tab_tir)
function tableauTab(v) {
  const n = Math.max(v.max || 5, (v.seq || []).length), seq = Array.from({length: n}, (_, i) => (v.seq || [])[i]);
  const rond = (x, k) => `<i class="tab-r${x?.[k] === true ? ' but' : x?.[k] === false ? ' rate' : ''}"></i>`;
  return `<div class="tab-seance"><div class="tab-ligne"><b>${esc(MD.vue.nous?.nom || 'Toi')}</b><span>${seq.map(x => rond(x, 'a')).join('')}</span><strong class="tab-sa">${v.a ?? 0}</strong></div>
    <div class="tab-ligne"><b>${esc(MD.vue.eux?.nom || 'Eux')}</b><span>${seq.map(x => rond(x, 'b')).join('')}</span><strong class="tab-sb">${v.b ?? 0}</strong></div></div>`;
}
function tabJeu(v, premier) {
  if (!MD.el || !v?.k) return;
  MD.tabJeu = v; const k = v.k, p = MD.el.querySelector('.md-panneau');
  p.innerHTML = `<div class="md-p-c md-tab"><h3>Tirs au but${v.na >= 5 && v.nb >= 5 ? ' · mort subite' : ''}</h3>${tableauTab(v)}
    <p class="md-info tab-qui">${k.qui === 'a' ? `🎯 À toi de tirer : <b>${esc(nomCourt(k.n))}</b>` : `🥅 Leur tireur s’élance : à toi d’arrêter${v.gardien ? ` (${esc(nomCourt(v.gardien))})` : ''}`}</p>
    <div class="md-p-b"><button class="btn gold" data-md-go="tab-jouer">${k.qui === 'a' ? 'Tirer' : 'Arrêter'}</button></div></div>`;
  p.hidden = false; MD.el.classList.add('en-pause');
  MD.timers.push(setTimeout(() => { if (MD.tabJeu === v && !MD.tabEnJeu) tabJouer(); }, premier ? 1500 : 1200));
}
function tabJouer() {
  const v = MD.tabJeu; if (!v || MD.tabEnJeu || !MD.el) return;
  MD.tabEnJeu = true; MD.tabR = null; const k = v.k;
  const ouvrir = () => {
    if (!MD.el) return;
    if (k.qui === 'a') ouvrirJet7mMatch({nom: k.n, tirer: (x, y, f) => Compte.matchTabTir({x, y, puissance: f}).then(r => { MD.tabR = r; return r.tir; }),
      fin: () => { J7.match = null; fermerJet7m(true); tabSuite(); }});
    else ouvrirArret7m({nom: k.n, prep: () => Promise.resolve({colonne: k.col, hauteur: k.hau, duree: k.duree}),
      envoyer: ent => Compte.matchTabTir(ent).then(r => { MD.tabR = r; return {resultat: r.tir?.resultat || 'but'}; })
        .catch(e => { setTimeout(() => { MD.tabEnJeu = false; document.body.classList.add('avec-intro'); tabJeu(MD.tabJeu); }, 300); throw e; }),
      fin: () => { MJ.match = null; fermerMini(true); tabSuite(); }});
  };
  if (!v.na && !v.nb) septIntro('Tirs au but').then(intro => { ouvrir(); setTimeout(() => intro.classList.add('fin'), 250); setTimeout(() => intro.remove(), 700); });
  else ouvrir();
}
function tabSuite() {
  MD.tabEnJeu = false; if (!MD.el) return;
  document.body.classList.add('avec-intro');
  const r = MD.tabR; MD.tabR = null;
  if (!r) return tabJeu(MD.tabJeu);   // le tir n'est pas parti (erreur) : on le rejoue
  if (r.tabJeu) return tabJeu(r.tabJeu);
  MD.tabJeu = null; MD.fin = r; MD.vue = r.vue || MD.vue;
  const t = r.match?.tab || {}, gagne = t.a > t.b, p = MD.el.querySelector('.md-panneau');
  p.innerHTML = `<div class="md-p-c md-tab"><h3>Tirs au but</h3>${tableauTab({seq: t.tirs, a: t.a, b: t.b, max: 5})}
    <p class="md-info tab-qui"><b>${gagne ? 'Tirs au but gagnés !' : 'Tirs au but perdus'}</b> ${t.a} – ${t.b}</p>
    <div class="md-p-b"><button class="btn gold" data-md-go="tab-fin">Voir le résultat</button></div></div>`;
  p.hidden = false; vibrer(gagne ? [40, 60, 80] : 30);
}
// la séance, tir par tir (nos tirs en haut, les leurs en bas), puis le résultat
function seanceTab(r) {
  const t = r.match?.tab, p = MD.el.querySelector('.md-panneau');
  if (!t?.tirs?.length) return resultatMD(r);
  const rond = (v, k, i) => `<i class="tab-r" data-k="${k}${i}">${v ? '' : ''}</i>`;
  p.innerHTML = `<div class="md-p-c md-tab"><h3>Tirs au but</h3>
    <div class="tab-seance"><div class="tab-ligne"><b>${esc(MD.vue.nous?.nom || 'Toi')}</b><span>${t.tirs.map((x, i) => rond(x.a, 'a', i)).join('')}</span><strong class="tab-sa">0</strong></div>
      <div class="tab-ligne"><b>${esc(MD.vue.eux?.nom || 'Eux')}</b><span>${t.tirs.map((x, i) => rond(x.b, 'b', i)).join('')}</span><strong class="tab-sb">0</strong></div></div>
    <p class="md-info tab-qui">&nbsp;</p><div class="md-p-b"><button class="btn gold" data-md-go="tab-fin" hidden>Voir le résultat</button></div></div>`;
  let a = 0, b = 0;
  t.tirs.forEach((x, i) => {
    MD.timers.push(setTimeout(() => { if (!MD.el) return;
      p.querySelector('.tab-qui').textContent = `${nomCourt(x.n)} s’élance…`;
      const ra = p.querySelector(`[data-k="a${i}"]`); ra.classList.add(x.a ? 'but' : 'rate'); a += x.a ? 1 : 0;
      p.querySelector('.tab-sa').textContent = a; Son.jouer(x.a ? 'but' : 'arret');
    }, 500 + i * 1300));
    MD.timers.push(setTimeout(() => { if (!MD.el) return;
      const rb = p.querySelector(`[data-k="b${i}"]`); rb.classList.add(x.b ? 'but' : 'rate'); b += x.b ? 1 : 0;
      p.querySelector('.tab-sb').textContent = b; Son.jouer(x.b ? 'encaisse' : 'arret');
    }, 500 + i * 1300 + 650));
  });
  MD.timers.push(setTimeout(() => { if (!MD.el) return;
    p.querySelector('.tab-qui').innerHTML = `<b>${t.a > t.b ? 'Tirs au but gagnés !' : 'Tirs au but perdus'}</b> ${t.a} – ${t.b}${t.gardien ? ` · gardien : ${esc(nomCourt(t.gardien))}` : ''}`;
    p.querySelector('[data-md-go="tab-fin"]').hidden = false;
  }, 500 + t.tirs.length * 1300 + 300));
}
function resultatMD(r) {
  if (!MD.el) return;
  fermerPanneauMD(); fermerBancMD(); MD.attente = true;
  majPieces(); celebrer(r.niveaux);
  if (MD.pvp || r.classe) { clearInterval(MD.pvpT); CL.data = null; Compte.rafraichir().catch(() => {}); }
  MD.el.querySelector('.md-sa').textContent = r.match.a; MD.el.querySelector('.md-sb').textContent = r.match.b;
  MD.el.querySelector('.md-per').textContent = 'Fin du match';
  const res = r.match.resultat;
  vibrer(res === 'gagne' ? [40, 60, 80] : 30);
  Son.jouer('buzzer'); setTimeout(() => Son.jouer(res === 'gagne' ? 'victoire' : res === 'nul' ? 'nul' : 'defaite'), 450);
  const p = MD.el.querySelector('.md-panneau');
  p.innerHTML = `<div class="md-p-c md-fin">${htmlFin(r)}<button class="btn gold large" data-act="fin-direct">Continuer</button></div>`;
  p.hidden = false; MD.el.classList.add('en-pause', 'fini');
  majMD();
}

// ── matchs à deux en direct (23 nov. 2026, demande de Maël : « les défis sont nazes » : en temps réel, temps morts de 20 secondes,
// classement avec des trophées façon Clash Royale, file d'attente façon LoL avec le temps écoulé, fantôme après 2 minutes).
// Le serveur joue le match (pvp_*) ; les deux jeux racontent chaque tranche au même rythme (×1) et interrogent le serveur toutes
// les secondes ou deux. Les choix (tactique, consigne, changements) partent avec la tranche suivante ; un temps mort arrête le match
// pour les deux pendant 20 s et le ramène à la seconde où il a été demandé (le fil est alors réécrit, pvpRebobiner).
const nomEux = () => esc(MD.vue?.eux?.nom || 'L’adversaire');
const chronoTx = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
function pvpTick() {
  if (!MD.el || !MD.pvp || MD.pvpReq || (MD.fin && !MD.file.length)) return;
  pvpCompteur();
  // pendant le récit : toutes les 2 s (un temps mort adverse) ; à l'arrêt ou en attente : chaque seconde
  if (!MD.attente && !MD.panneau && (MD.pvpTour = (MD.pvpTour || 0) + 1) % 2) return;
  MD.pvpReq = true;
  Compte.pvpVue(MD.n).then(v => pvpRecevoir(v)).catch(() => {}).finally(() => { MD.pvpReq = false; });
}
function pvpRecevoir(v, complet) {
  if (!MD.el || !v || v.aucun || !v.pvp) return;
  const P = v.pvp;
  if (P.gen !== MD.gen) {
    // un temps mort (le sien ou celui de l'adversaire) : le match est revenu à une seconde ; tout le fil est relu
    if (complet) return pvpRebobiner(v);
    MD.pvpReq = true;
    return Compte.pvpVue(0).then(w => pvpRebobiner(w)).catch(() => {}).finally(() => { MD.pvpReq = false; });
  }
  // deux réponses peuvent apporter les mêmes événements (la relève et « Prêt » en même temps, à la mi-temps : match de Rémi et Maël,
  // 23 nov. 2026) : le serveur donne le total (P.n), on ne garde que ce qui est nouveau ; une réponse plus ancienne est ignorée
  const nv = v.evenements || [], debut = (P.n ?? MD.n + nv.length) - nv.length;
  if ((P.n ?? 0) < MD.n) return;
  if (debut > MD.n) return;   // un trou : la relève suivante redemande la suite depuis MD.n
  const avant = MD.vue.bloc, neufs = nv.slice(MD.n - debut);
  MD.vue = v; MD.pvp = P; MD.pvpRecu = Date.now(); MD.pvpPostes = P.choix?.postes || [];
  if (neufs.length) { MD.file.push(...neufs); MD.n = debut + nv.length; }
  if (!P.pause) MD.finBloc = Math.max(MD.finBloc, v.bloc * 300, v.sept?.t || 0);
  septVerifier(neufs, v);
  if (P.fin && !MD.fin) { MD.fin = P.fin; MD.finBloc = 3600; clearInterval(MD.pvpT); }
  // coup d'envoi ou mi-temps : le compte à rebours est fini, la tranche suivante est partie
  if (['envoi', 'mi-temps'].includes(MD.panneau) && v.bloc > avant) { fermerPanneauMD(); fermerBancMD(); }
  if (P.pause) { if (MD.panneau !== 'tm') pvpPause(); }
  else if (MD.panneau === 'tm') { fermerPanneauMD(); fermerBancMD(); flashMD('Reprise', 'tm'); Son.jouer('sifflet'); }
  // le panneau « Tactique » ne met pas le match à deux en pause : le récit continue derrière
  if (MD.file.length && MD.attente && !MD.sept && (!MD.panneau || MD.panneau === 'tactique')) MD.attente = false;
  pvpCompteur(); majMD(); majBancMD();
  if (MD.attente && !MD.panneau && !MD.file.length && MD.h >= MD.finBloc && MD.fin) finBlocMD();
}
// le fil réécrit depuis le début : ce qui avait été raconté jusqu'à la seconde du temps mort reste, la suite est oubliée
function pvpRebobiner(v) {
  if (!MD.el || !v?.pvp) return;
  // pendant un temps mort, les deux écrans se calent sur la seconde du serveur (celui qui était en retard rattrape, l'autre revient en arrière)
  const P = v.pvp, h = P.pause ? P.pause.h : P.h, montre = P.pause ? h : Math.min(MD.h, h);
  MD.evs = []; MD.file = []; MD.exclu = {a: 0, b: 0}; MD.mom = momVide();
  MD.el.querySelector('.md-fil').innerHTML = '';
  MD.el.querySelector('.md-sa').textContent = '0'; MD.el.querySelector('.md-sb').textContent = '0';
  for (const x of v.evenements || []) { if (x.t <= montre) noterMD(x, true); else MD.file.push(x); }
  MD.n = (v.evenements || []).length; MD.h = montre; MD.finBloc = P.pause ? h : Math.max(h, v.bloc * 300);
  MD.vue = v; MD.pvp = P; MD.gen = P.gen; MD.pvpRecu = Date.now(); MD.pvpPostes = P.choix?.postes || [];
  majHorlogeMD();
  if (P.pause) { MD.attente = true; if (!P.pause.moi) { Son.jouer('sifflet'); flashMD('Temps mort', 'tm'); } pvpPause(); }
  majMD();
}
function pvpPause() {
  fermerBancMD();
  panneauMD('tm');
}
// les comptes à rebours (coup d'envoi, mi-temps, temps mort) et l'attente de l'adversaire
function pvpCompteur() {
  if (!MD.el || !MD.pvp) return;
  const P = MD.pvp, ecoule = (Date.now() - (MD.pvpRecu || Date.now())) / 1000;
  const cd = MD.el.querySelector('.md-panneau:not([hidden]) .md-cd');
  if (cd) {
    const reste = MD.panneau === 'tm' ? (P.pause?.reste ?? 0) - ecoule : (P.prochain ?? 0) - ecoule;
    cd.innerHTML = `⏱️ <b>${Math.max(0, Math.ceil(reste))} s</b>${(MD.panneau === 'tm' ? P.pause?.pretEux : P.pretEux) ? ` · ${nomEux()} est prêt(e)` : ''}${(MD.panneau === 'tm' ? P.pause?.pret : MD.pvpPret) ? ' · tu es prêt(e)' : ''}`;
  }
  const pb = MD.el.querySelector('.md-pause-b'), attend = MD.attente && !MD.panneau && !MD.file.length && !MD.fin && MD.h >= MD.finBloc;
  pb.hidden = !attend;
  if (attend) pb.textContent = P.absentEux ? `${MD.vue.eux.nom} s’est absenté(e) : son adjoint joue à sa place…` : `En attente de ${MD.vue.eux.nom}…`;
}
function pvpEnvoyer(o = {}) {
  return Compte.pvpChoix(MD.tac, MD.cons, o.postes ?? null, o.pret ?? null, !!o.pause, MD.n).then(v => pvpRecevoir(v))
    .catch(e => { Son.jouer('erreur'); toast(e.message || 'Action impossible'); });
}
// fin du récit d'une tranche : prêt pour la suivante (elle part quand les deux sont prêts, ou à l'heure prévue)
function pvpFinBloc() {
  MD.attente = true;
  if (MD.fin) return MD.timers.push(setTimeout(() => resultatMD(MD.fin), 900));
  if (MD.pvp.pause) return;
  if (MD.vue.bloc === 6 && MD.h >= 1800 && !MD.miTemps) { MD.miTemps = true; return panneauMD('mi-temps'); }
  if (MD.pretEnvoye === MD.vue.bloc) return;
  MD.pretEnvoye = MD.vue.bloc;
  pvpCompteur();
  pvpEnvoyer({pret: MD.vue.bloc});
}
// le bouton d'un panneau : prêt (coup d'envoi, mi-temps, temps mort) ou nouvelle tactique (pendant le récit, sans pause)
function pvpJouer(type) {
  MD.pvpPret = false;
  if (type === 'tactique') { pvpEnvoyer(); return reprendreMD(); }
  if (type === 'envoi') { MD.pretEnvoye = 0; pvpEnvoyer({pret: 0}); }
  else if (type === 'mi-temps') { MD.pretEnvoye = 6; pvpEnvoyer({pret: 6}); }
  else if (type === 'tm') pvpEnvoyer({pause: true});
  else pvpEnvoyer();
  MD.attente = true; pvpCompteur();
}
function pvpTempsMort() {
  if (MD.enCours) return toast('Un instant…');
  MD.enCours = true; majMD();
  Compte.pvpTempsMort().then(v => {
    MD.enCours = false; if (!MD.el) return;
    MD.adverse = v.adverse; if (v.adverse?.defense) MD.defB = v.adverse.defense;
    Son.jouer('sifflet'); flashMD('Temps mort', 'tm');
    pvpRebobiner(v);
  }).catch(e => { MD.enCours = false; if (!MD.el) return; Son.jouer('erreur'); toast(e.message || 'Action impossible'); majMD(); });
}
// changements : ils entrent à la reprise (tranche suivante, ou fin du temps mort) ; un second toucher annule
function pvpChanger(poste) {
  if (MD.fin) return;
  const l = new Set(MD.pvpPostes || []);
  const postes = poste === 'tous' ? postesBancTous() : [poste];
  const tous = postes.every(k => l.has(k));
  for (const k of postes) tous ? l.delete(k) : l.add(k);
  MD.pvpPostes = [...l];
  pvpEnvoyer({postes: MD.pvpPostes});
  toast(tous ? 'Changement annulé' : `${postes.length > 1 ? 'Ils entrent' : 'Il entre'} à la reprise (tranche suivante ou fin du temps mort)`);
  majBancMD();
}

// ── la file d'attente classée, façon LoL : le temps écoulé, le temps estimé, « Annuler » ; elle reste affichée en naviguant
const FILE = {t: null, req: false, attente: 0, recu: 0, estime: 120, fantome: 120};
function pvpChercher() {
  if (FILE.t) return;
  if (noteEquipe().n < 7) return toast('Aligne 7 joueurs dans l’onglet Équipe pour jouer');
  if (S().matchDirect) return toast('Termine d’abord ton match en cours (Jouer, Championnat VS Ordi)');
  Object.assign(FILE, {attente: 0, recu: Date.now(), estime: 120, fantome: PARAMS.pvp_fantome_secondes ?? 120});
  let el = $('#pvp-file');
  if (!el) { el = document.createElement('div'); el.id = 'pvp-file'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.hidden = false; Son.jouer('clic');
  FILE.t = setInterval(fileTick, 1000); fileTick(true);
}
function fileTick(forcer) {
  const el = $('#pvp-file'); if (!el) return;
  const ecoule = FILE.attente + (Date.now() - FILE.recu) / 1000;
  el.innerHTML = `<span class="pf-anim" aria-hidden="true">⚔️</span><div class="pf-t"><b>${chronoTx(ecoule)}</b><small>Recherche d’un adversaire · estimé ${chronoTx(FILE.estime)}</small></div>
    <button class="pf-x" data-act="pvp-annuler">Annuler</button>`;
  if (FILE.req || (!forcer && !$('#pvp-pret') && Math.round(ecoule) % 2)) return;   // match trouvé : chaque seconde
  FILE.req = true;
  Compte.pvpChercher().then(r => {
    FILE.req = false; if (!FILE.t) return;
    if (r.propose) return pvpPropose(r.propose);
    if (r.prepa) { arreterFile(); return pvpPrepa(r.prepa); }
    if (r.match) { arreterFile(); fermerPropose(); return ouvrirDirect(r.match); }
    if (r.fantome === true && r.vue) { arreterFile(); fermerPropose(); return pvpTrouve(r.vue, true); }
    // l'adversaire a refusé (ou n'a pas répondu) alors qu'on avait accepté : retour dans la file
    if ($('#pvp-pret')) { fermerPropose(); toast('L’adversaire n’a pas accepté : tu restes dans la file'); }
    FILE.attente = r.attente; FILE.recu = Date.now(); FILE.estime = r.estime ?? 120;
  }).catch(e => { FILE.req = false; arreterFile(); toast(e.message || 'Recherche impossible'); });
}
// « Match trouvé ! » (demande de Maël, 23 nov. 2026, comme dans LoL) : par-dessus tout le jeu, sans montrer l'adversaire, 15 s pour
// accepter ; sans réponse, c'est un refus ; si l'autre refuse, on reste dans la file
function pvpPropose(P) {
  let el = $('#pvp-pret');
  if (!el) {
    el = document.createElement('div'); el.id = 'pvp-pret'; el.setAttribute('role', 'alertdialog'); document.body.appendChild(el);
    Son.jouer('notif'); vibrer([60, 60, 120]);
    FILE.pretFin = Date.now() + (P.reste ?? 15) * 1000; FILE.pretOk = false;
    clearInterval(FILE.pretT); FILE.pretT = setInterval(() => majPropose(), 250);
  }
  FILE.pretOk = FILE.pretOk || P.accepte;
  majPropose();
}
function majPropose() {
  const el = $('#pvp-pret'); if (!el) return clearInterval(FILE.pretT);
  const reste = Math.max(0, (FILE.pretFin - Date.now()) / 1000);
  if (reste <= 0 && !FILE.pretOk) { refuserPropose(true); return; }   // pas de réponse : refusé
  // la fenêtre est dessinée une fois ; seuls le rond et les secondes changent (un bouton redessiné sans cesse rate les touchers)
  if (!el.firstChild) el.innerHTML = `<div class="pp-boite"><p class="pp-titre">⚔️ Match trouvé !</p><div class="pp-rond"><b></b></div>
    <div class="pp-btns"><button class="btn gold large" data-act="pvp-accepter">Prêt</button><button class="btn ghost" data-act="pvp-refuser">Annuler</button></div></div>`;
  const rond = el.querySelector('.pp-rond'); rond.style.setProperty('--p', (reste / 15).toFixed(3)); rond.firstChild.textContent = Math.ceil(reste);
  const btns = el.querySelector('.pp-btns');
  if (FILE.pretOk && btns) btns.outerHTML = '<p class="pp-att">Prêt ✓ · en attente de l’adversaire…</p>';
}
function fermerPropose() { clearInterval(FILE.pretT); $('#pvp-pret')?.remove(); }
function accepterPropose() {
  FILE.pretOk = true; majPropose(); Son.jouer('clic');
  Compte.pvpAccepter(true).then(r => {
    if (r.prepa) { arreterFile(); pvpPrepa(r.prepa); }
    else if (r.annule) { fermerPropose(); toast('Match annulé'); }
  }).catch(e => toast(e.message || 'Action impossible'));
}
function refuserPropose(silence) {
  fermerPropose(); arreterFile();
  Compte.pvpAccepter(false).catch(() => {});
  toast(silence ? 'Tu n’as pas répondu : match refusé, tu sors de la file' : 'Match refusé');
}
// présentation (demande de Maël) : l'équipe adverse, ses stats et ses bonus, une minute au plus ou jusqu'à ce que les deux soient prêts
const PREPA = {t: null, fin: 0, req: false, d: null};
function pvpPrepa(P) {
  fermerPropose();
  PREPA.d = P; PREPA.fin = Date.now() + (P.reste ?? 60) * 1000;
  let el = $('#pvp-pres');
  if (!el) {
    el = document.createElement('div'); el.id = 'pvp-pres'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Présentation du match');
    document.body.appendChild(el); document.body.classList.add('avec-intro');
    Son.jouer('sifflet'); vibrer([30, 40, 60]);
    el.innerHTML = `<div class="pr-haut"><div class="pr-vs"><div><b>${esc(S().pseudo)}</b><small>${nb(S().pvp?.trophees ?? 0)} 🏆</small></div><i>VS</i>
        <div><b>${esc(P.adversaire?.pseudo || '')}</b><small>${nb(P.adversaire?.trophees ?? 0)} 🏆</small></div></div>
      <p class="pr-cd"></p></div>
      <div class="pr-corps"><h3>Équipe de ${esc(P.adversaire?.pseudo || '')}</h3>${P.equipe ? equipeCorpsHTML(P.equipe, true) : '<p class="sub">Équipe inconnue.</p>'}</div>
      <div class="pr-bas"><button class="btn gold large" data-act="pvp-pret-prepa">Prêt</button><p class="pr-etat"></p></div>`;
    clearInterval(PREPA.t); PREPA.t = setInterval(prepaTick, 1000);
  }
  majPrepa();
}
function majPrepa() {
  const el = $('#pvp-pres'), P = PREPA.d; if (!el || !P) return;
  const reste = Math.max(0, Math.ceil((PREPA.fin - Date.now()) / 1000));
  el.querySelector('.pr-cd').innerHTML = `${P.classe === false ? 'Défi en direct' : 'Classé'} · le match commence dans <b>${reste} s</b>`;
  const b = el.querySelector('[data-act="pvp-pret-prepa"]'); b.disabled = !!P.pret; b.textContent = P.pret ? 'Prêt ✓' : 'Prêt';
  el.querySelector('.pr-etat').textContent = P.pretEux ? `${P.adversaire?.pseudo || 'L’adversaire'} est prêt(e)` : P.pret ? `En attente de ${P.adversaire?.pseudo || 'l’adversaire'}…` : '';
}
function prepaTick() {
  if (!$('#pvp-pres')) return clearInterval(PREPA.t);
  majPrepa();
  if (PREPA.req) return;
  PREPA.req = true;
  Compte.pvpVue(0).then(v => { PREPA.req = false; prepaRecevoir(v); }).catch(() => { PREPA.req = false; });
}
function prepaRecevoir(v) {
  if (v?.prepa) { PREPA.d = {...PREPA.d, ...v.prepa, equipe: PREPA.d?.equipe}; PREPA.fin = Date.now() + (v.prepa.reste ?? 0) * 1000; return majPrepa(); }
  const vue = v?.match || (v?.pvp ? v : null);
  if (vue) { fermerPrepa(); ouvrirDirect(vue); }
  else if (v?.aucun || v?.annule) { fermerPrepa(); toast('Le match a été annulé'); }
}
function fermerPrepa() { clearInterval(PREPA.t); $('#pvp-pres')?.remove(); if (!MD.el) document.body.classList.remove('avec-intro'); }
function pretPrepa() {
  if (PREPA.d) PREPA.d.pret = true; majPrepa(); Son.jouer('clic');
  Compte.pvpAccepter(true).then(prepaRecevoir).catch(e => toast(e.message || 'Action impossible'));
}
function arreterFile(annuler) {
  clearInterval(FILE.t); FILE.t = null;
  const el = $('#pvp-file'); if (el) el.hidden = true;
  if (annuler) Compte.pvpAnnuler().catch(() => {});
}
// « Adversaire trouvé ! » : les deux équipes face à face, puis le match
function pvpTrouve(vue, fantome) {
  const moi = vue.nous?.nom || S().pseudo, eux = vue.eux?.nom || '';
  const tr = fantome ? null : vue.pvp?.adversaire?.trophees;
  const el = document.createElement('div'); el.className = 'pvp-vs';
  el.innerHTML = `<p class="pvp-t">${fantome ? 'Personne de disponible' : vue.pvp?.classe === false ? 'Défi accepté !' : 'Adversaire trouvé !'}</p>
    <div class="pvp-face"><div><b>${esc(moi)}</b><small>${nb(S().pvp?.trophees ?? S().trophees ?? 0)} 🏆</small></div><i>VS</i>
      <div><b>${esc(eux)}</b><small>${fantome ? 'joué par l’ordinateur' : tr != null ? `${nb(tr)} 🏆` : ''}</small></div></div>
    ${fantome ? '<p class="pvp-s">Tu affrontes son équipe, coachée par l’ordinateur. Contre l’ordinateur, pas de trophées : seulement des pièces.</p>' : ''}`;
  document.body.appendChild(el);
  Son.jouer('sifflet'); vibrer([30, 40, 60]);
  setTimeout(() => { el.remove(); ouvrirDirect(vue); if (fantome) Compte.rafraichir().catch(() => {}); }, fantome ? 2600 : 1800);
}
function reprendrePvp() {
  if (occupe) return;
  action(Compte.pvpVue(0), v => {
    if (v?.prepa) return pvpPrepa(v.prepa);
    if (v?.propose) { if (!FILE.t) pvpChercher(); return pvpPropose(v.propose); }
    if (v?.pvp && v.pvp.statut === 'direct') ouvrirDirect(v, true); else { toast('Ce match est terminé'); Compte.rafraichir().then(() => route(true)).catch(() => {}); } });
}

// ── l'écran Classé : trophées, arène, saison, classement
const CL = {data: null, charge: false, recu: 0};
function chargerClasse() {
  if (CL.charge || Compte.horsLigne || (CL.data && Date.now() - CL.recu < 15000)) return;
  CL.charge = true;
  Compte.pvpAccueil().then(d => { CL.data = d; CL.recu = Date.now();
    if (d.saisonRecompense) toast(`🏆 Fin de saison : ${d.saisonRecompense.arene}, ta récompense est arrivée !`); })
    .catch(e => toast(e.message)).finally(() => { CL.charge = false; if (vueCourante() === 'classe' && $('#overlay').hidden) route(true); });
}
function vueClasse() {
  chargerClasse();
  const D = CL.data, tete = `${retour('jouer', 'Jouer')}<h1>Classé</h1>`;
  if (!D) return `${tete}<p class="sub">Chargement…</p>`;
  const A = D.arenes || [], a = A[D.arene] || {}, suiv = A[D.arene + 1];
  const pc = suiv ? Math.min(100, 100 * (D.trophees - a.min) / (suiv.min - a.min)) : 100;
  const enCours = S().pvp?.match, complet = noteEquipe().n === 7;
  const fin = new Date(D.saisonFin), jours = Math.max(0, Math.ceil((fin - Date.now()) / 864e5));
  const rec = r => r ? RECOMP(r) : '';
  return `${tete}
    <div class="cl-arene"><small>Arène ${D.arene + 1}</small><b>${esc(a.nom || '')}</b><span class="cl-tr">${nb(D.trophees)} 🏆</span>
      <span class="bar"><i style="width:${pc}%"></i></span><small>${suiv ? `${nb(suiv.min - D.trophees)} 🏆 avant ${esc(suiv.nom)}` : 'Arène la plus haute'} · rang ${D.rang}</small></div>
    ${enCours ? '<button class="btn gold large" data-act="pvp-reprendre" style="width:100%">⚔️ Reprendre le match en direct</button>'
      : `<button class="btn gold large" data-act="pvp-chercher" style="width:100%"${complet && !FILE.t ? '' : ' disabled'}>⚔️ ${FILE.t ? 'Recherche en cours…' : 'Trouver un adversaire'}</button>`}
    <p class="sub petit">${complet ? '' : 'Aligne 7 joueurs dans l’onglet Équipe pour jouer. '}En direct contre un vrai joueur : vous choisissez vos tactiques en même temps, 3 temps morts de 20 s chacun.
      Personne après ${Math.round((D.fantome || 120) / 60)} min : tu affrontes le fantôme d’un joueur proche en trophées (son équipe, coachée par l’ordinateur ; ni trophées gagnés, ni perdus).
      Victoire ${nb(D.pieces?.gagne || 0)}+ pièces selon l’arène, ${D.gainsRestants} match${D.gainsRestants > 1 ? 's' : ''} récompensé${D.gainsRestants > 1 ? 's' : ''} aujourd’hui.</p>
    <p class="sub petit">Saison : fin dans ${jours} jour${jours > 1 ? 's' : ''}. Récompense selon ton arène ; au-dessus de ${nb(D.saisonSeuil)} 🏆, la moitié des trophées en plus repart.</p>
    <h2>Arènes</h2><div class="cl-ars">${A.map(x => `<div class="cl-ar${x.i === D.arene ? ' on' : ''}${x.atteinte ? ' ok' : ''}"><b>${esc(x.nom)}</b><small>${nb(x.min)} 🏆</small>
      <span>${x.recompense ? rec(x.recompense) : ''}</span>${x.atteinte && x.i ? '<em>✓</em>' : ''}</div>`).join('')}</div>
    <h2>Classement</h2><div class="classe av-m">${(D.classement || []).map((x, i) => `<div class="${x.moi ? 'moi-l' : ''}">${avatarHTML(x.perso)}<b>${i + 1}. ${lienJ(x.pseudo)}</b>
      <small>${esc(x.arene || '')}</small><em>${nb(x.trophees)} 🏆</em></div>`).join('') || '<p class="sub">Personne n’a encore de trophée : sois le premier !</p>'}
      ${D.moi && !(D.classement || []).some(x => x.moi) ? `<p class="cl-sep" aria-hidden="true">⋯</p><div class="moi-l">${avatarHTML(D.moi.perso)}<b>${D.moi.rang}. ${esc(D.moi.pseudo)}</b>
      <small>${esc(D.moi.arene || '')}</small><em>${nb(D.moi.trophees)} 🏆</em></div>` : ''}</div>
    ${(D.derniers || []).length ? `<h2>Derniers matchs</h2><div class="hists">${D.derniers.map(r => `<div class="hist r-${r.resultat}"><b>${(r.score || []).join(' – ')}</b>
      <span>${r.classe ? 'Classé' : 'Défi'} · ${r.fantome ? esc(r.adversaire) : lienJ(r.adversaire)}</span><small>${RES[r.resultat] || ''}${r.trophees != null ? ` · ${r.trophees >= 0 ? '+' : ''}${r.trophees} 🏆` : ''}</small></div>`).join('')}</div>` : ''}`;
}

// ── défi en direct entre ami(e)s : une invitation de 2 minutes ; l'invité(e) la voit dans un bandeau
const INV = {id: null, t: null, pour: '', debut: 0, secondes: 120, req: false};
function pvpInviter(pseudo) {
  if (INV.t || FILE.t) return toast('Une recherche est déjà en cours');
  if (S().matchDirect) return toast('Termine d’abord ton match en cours (Jouer, Championnat VS Ordi)');
  action(Compte.pvpInviter(pseudo), r => {
    Object.assign(INV, {id: r.invitation, pour: r.pour, debut: Date.now(), secondes: r.secondes || 120});
    if (!$('#overlay').hidden) cacherOverlay();
    let el = $('#pvp-file');
    if (!el) { el = document.createElement('div'); el.id = 'pvp-file'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.hidden = false; INV.t = setInterval(invTick, 1000); invTick();
  });
}
function invTick() {
  const el = $('#pvp-file'); if (!el || !INV.t) return;
  const ecoule = (Date.now() - INV.debut) / 1000;
  el.innerHTML = `<span class="pf-anim" aria-hidden="true">⚔️</span><div class="pf-t"><b>${chronoTx(ecoule)}</b><small>En attente de ${esc(INV.pour)} · ${chronoTx(Math.max(0, INV.secondes - ecoule))} pour accepter</small></div>
    <button class="pf-x" data-act="pvp-inv-annuler">Annuler</button>`;
  if (INV.req || Math.round(ecoule) % 2) return;
  INV.req = true;
  Compte.pvpAttendre(INV.id).then(r => {
    INV.req = false; if (!INV.t) return;
    if (r.statut === 'acceptee') { arreterInv(); return r.prepa ? pvpPrepa(r.prepa) : r.match ? ouvrirDirect(r.match) : null; }
    if (r.statut !== 'attente') { const qui = INV.pour; arreterInv(); toast(`${qui} ${r.statut === 'refusee' ? 'a refusé ton défi' : 'n’a pas répondu'}`); }
  }).catch(() => { INV.req = false; });
}
function arreterInv(annuler) {
  if (annuler && INV.id) Compte.pvpAnnulerInvitation(INV.id).catch(() => {});
  clearInterval(INV.t); INV.t = null; INV.id = null;
  const el = $('#pvp-file'); if (el) el.hidden = true;
}
// invitations reçues : un bandeau en haut, « Accepter » ou « Refuser » (vu à chaque relecture de l'état)
function majInvitations() {
  const l = (S().pvp?.invitations || []).filter(x => x.reste > 0), vu = majInvitations.refusees || (majInvitations.refusees = new Set());
  const x = l.find(i => !vu.has(i.id));
  let el = $('#pvp-invit');
  if (!x || MD.el || FILE.t || INV.t) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('div'); el.id = 'pvp-invit'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  if (el.dataset.id !== x.id) { Son.jouer('notif'); vibrer([30, 40, 30]); }
  el.dataset.id = x.id; el.hidden = false;
  el.innerHTML = `<span aria-hidden="true">⚔️</span><p><b>${esc(x.de)}</b> te défie en direct !</p>
    <button class="btn ghost petit" data-pvp-inv="${x.id}:0">Refuser</button><button class="btn gold petit" data-pvp-inv="${x.id}:1">Accepter</button>`;
}
function repondreInvitation(id, oui) {
  const el = $('#pvp-invit'); if (el) el.hidden = true;
  (majInvitations.refusees || (majInvitations.refusees = new Set())).add(id);
  if (!oui) return Compte.pvpRepondre(id, false).catch(() => {});
  if (S().matchDirect) return toast('Termine d’abord ton match en cours (Jouer, Championnat VS Ordi)');
  action(Compte.pvpRepondre(id, true), r => { if (r.prepa) pvpPrepa(r.prepa); else if (r.match) ouvrirDirect(r.match); });
}

// ── transferts (23 nov. 2026, demande de Maël : les listes « 7 voulus / 7 à donner » ne donnaient aucun échange, il fallait un joueur
// qui veut ma carte ET donne celle que je veux, au même palier). Trois façons d'échanger sans attendre qu'un autre ait l'inverse :
// le marché à pièces (façon Ultimate Team), la boîte à échanges (un doublon contre une carte du même palier, façon Pokémon GO) et les
// demandes au club (on demande une carte à son club, les membres donnent leurs doublons, façon Clash Royale). Règles : schema.sql.
const MKT = {data: null, charge: false, recu: 0, onglet: 'marche', palier: '', equipe: '', recherche: '', tri: 'recent',
  vPalier: '', dPalier: 'bronze', dEquipe: '', dRecherche: ''};
const carteDe = (carte, palier, note) => PAR_ID[carte] ? vueExemplaire(PAR_ID[carte], {palier, note: note ?? PALIER[palier].min}) : null;
// relu à chaque visite s'il date de plus de 15 s (les ventes et les demandes des autres changent)
function chargerMarche() {
  if (MKT.charge || Compte.horsLigne || (MKT.data && Date.now() - MKT.recu < 15000)) return;
  MKT.charge = true;
  Compte.mesEchanges().then(d => { MKT.data = d; MKT.recu = Date.now(); })
    .catch(e => { if (!MKT.data) MKT.data = {marche: {ventes: [], mes: [], prix: {}}, boite: {restants: 0, limite: 0}, club: null, historique: []}; toast(e.message); })
    .finally(() => { MKT.charge = false; majEntete(); if (vueCourante() === 'marche' && $('#overlay').hidden) route(true); });
}
const majMarche = (d, msg) => { MKT.data = d; MKT.recu = Date.now(); if (msg) toast(msg); if (!$('#overlay').hidden) cacherOverlay(); route(true); if (vueCourante() === 'clubs') clubChatTick(true); };
const dureeTx = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.min(59, Math.ceil(s % 3600 / 60))).padStart(2, '0')}` : `${Math.max(1, Math.ceil(s / 60))} min`;
const resteTx = t => dureeTx(Math.max(0, (new Date(t) - Date.now()) / 1000));
const libreEx = e => !e.verrou && !dansEquipe(e.id) && PAR_ID[e.carte] && !PAR_ID[e.carte].legende;
// mes cartes qu'on peut céder (hors équipe, banc et ventes), une ligne par joueur et par palier ; doublons = au moins 2 cartes du
// joueur à ce palier, j'en garde une (retour de Rémi : une Ultime seule passait pour un doublon s'il avait le joueur à un autre palier)
function mesCedables(doublons) {
  const tot = {}, g = {};
  for (const e of EX()) tot[e.carte + ':' + e.palier] = (tot[e.carte + ':' + e.palier] || 0) + 1;
  for (const e of EX()) if (libreEx(e) && (!doublons || tot[e.carte + ':' + e.palier] >= 2)) {
    const k = e.carte + ':' + e.palier, x = g[k] = g[k] || {carte: e.carte, palier: e.palier, n: 0, note: 99, tot: tot[k]};
    x.n++; x.note = Math.min(x.note, e.note);   // la moins entraînée : c'est elle qui part
  }
  return Object.values(g).sort((a, b) => RARETES.indexOf(b.palier) - RARETES.indexOf(a.palier) || PAR_ID[a.carte].nom.localeCompare(PAR_ID[b.carte].nom, 'fr'));
}
const equipesJeu = () => [...new Set(CARTES.filter(c => c.actif !== false && !c.legende).flatMap(equipesDe))].filter(e => e !== '*').sort();
const filtresPalier = (attr, val, liste = RARETES, tous = 'Tous') => `<div class="filters">${[...(tous ? [''] : []), ...liste].map(r =>
  `<button data-${attr}="${r || '*'}" class="${val === r ? 'on' : ''}">${r ? R_LABEL[r] : tous}</button>`).join('')}</div>`;
const filtresEquipe = (attr, val) => `<div class="filters">${['', ...equipesJeu()].map(e => `<button data-${attr}="${e || '*'}" class="${val === e ? 'on' : ''}">${e || 'Toutes les équipes'}</button>`).join('')}</div>`;
function vueMarche() {
  chargerMarche();
  const D = MKT.data, tete = `${retour('social', 'Social')}<h1>Transferts</h1>`;
  if (!D) return `${tete}<p class="sub">Chargement…</p>`;
  const nClub = S().social?.clubDemandes || 0;
  const ong = [['marche', '🪙 Marché'], ['boite', '🎁 Boîte'], ['club', '🛡️ Club']].map(([k, t]) =>
    `<button role="tab" aria-selected="${MKT.onglet === k}" class="${MKT.onglet === k ? 'on' : ''}" data-tr-onglet="${k}">${t}${k === 'club' && nClub ? ` <b class="pastille-n">${nClub}</b>` : ''}</button>`).join('');
  return `${tete}<div class="tr-ong" role="tablist">${ong}</div>
    ${MKT.onglet === 'boite' ? vueBoite(D) : MKT.onglet === 'club' ? vueDemandes(D) : vueVentes(D)}
    ${histoTransferts(D)}`;
}
// ── marché à pièces
function ventesFiltrees(M) {
  const q = MKT.recherche.trim().toLowerCase();
  const l = M.ventes.filter(v => PAR_ID[v.carte] && (!MKT.palier || v.palier === MKT.palier) && (!MKT.equipe || deLEquipe(PAR_ID[v.carte], MKT.equipe))
    && (!q || PAR_ID[v.carte].nom.toLowerCase().includes(q)));
  if (MKT.tri === 'prix') l.sort((a, b) => a.prix - b.prix);
  else if (MKT.tri === 'note') l.sort((a, b) => RARETES.indexOf(b.palier) - RARETES.indexOf(a.palier) || b.note - a.note);
  return l;
}
function listeVentesHTML(M) {
  const l = ventesFiltrees(M);
  return l.map(v => `<div class="mk-o">${carteHTML(carteDe(v.carte, v.palier, v.note))}<b class="mk-prix">${nb(v.prix)} <i class="coin"></i></b>
      <small>${lienJ(v.vendeur)}${v.ami ? ' · ami(e)' : ''}</small>
      <button class="btn gold petit" data-acheter="${v.id}"${S().pieces >= v.prix && M.achatsRestants ? '' : ' disabled'}>Acheter</button></div>`).join('')
    || `<p class="sub">${M.ventes.length ? 'Aucune carte en vente avec ces filtres.' : 'Aucune carte en vente pour l’instant : mets-en une, les autres la verront tout de suite.'}</p>`;
}
function vueVentes(D) {
  const M = D.marche;
  const mes = M.mes.map(v => { const c = carteDe(v.carte, v.palier, v.note); if (!c) return '';
    return `<div class="mk-m${v.statut === 'vendue' ? ' vendue' : ''}">${carteHTML(c)}<div><b>${esc(c.nom)}</b><small>${R_LABEL[v.palier]} ${v.note} · ${nb(v.prix)} <i class="coin"></i></small>
      <small>${v.statut === 'vendue' ? `Vendue à ${lienJ(v.acheteur)} : +${nb(v.gain)} <i class="coin"></i>` : `Encore ${resteTx(v.expire)} · tu recevras ${nb(v.gain)} <i class="coin"></i>`}</small></div>
      ${v.statut === 'ouverte' ? `<button class="btn ghost petit" data-mk-retirer="${v.id}">Retirer</button>` : ''}</div>`; }).join('');
  const ouvertes = M.mes.filter(v => v.statut === 'ouverte').length;
  return `<p class="sub">Mets tes cartes en vente au prix que tu veux, achète celles des autres d’un toucher. Le jeu garde ${Math.round((M.taxe || 0) * 100)} % du prix.</p>
    <h2>Mes ventes <small class="tr-c">${ouvertes}/${M.max}</small></h2>
    ${mes ? `<div class="mk-ms">${mes}</div>` : ''}
    <button class="btn gold" data-act="mk-vendre" style="width:100%"${ouvertes >= M.max ? ' disabled' : ''}>Vendre une carte</button>
    <h2>En vente <small class="tr-c">${plur(M.achatsRestants, 'achat')} possible${M.achatsRestants > 1 ? 's' : ''} aujourd’hui</small></h2>
    ${filtresPalier('mk-palier', MKT.palier)}${filtresEquipe('mk-equipe', MKT.equipe)}
    <div class="mk-r"><input class="champ" type="search" placeholder="Nom du joueur" value="${esc(MKT.recherche)}" data-mk-recherche autocomplete="off" spellcheck="false">
      <select class="champ" data-mk-tri aria-label="Trier">${[['recent', 'Les plus récentes'], ['prix', 'Prix croissant'], ['note', 'Meilleures notes']].map(([k, t]) =>
        `<option value="${k}"${MKT.tri === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="mk-l" id="mk-liste">${listeVentesHTML(M)}</div>`;
}
// choisir la carte à vendre : mes cartes libres une par une (on peut vendre une carte entraînée), puis le prix
const listeVendreHTML = () => { const q = (MKT.vRecherche || '').trim().toLowerCase();
  const l = EX().filter(e => libreEx(e) && (!MKT.vPalier || e.palier === MKT.vPalier) && (!MKT.vEquipe || deLEquipe(PAR_ID[e.carte], MKT.vEquipe))
    && (!q || PAR_ID[e.carte].nom.toLowerCase().includes(q))).sort(rangEx);
  return l.map(e => `<button class="pc" data-mk-choisir="${e.id}">${carteHTML(vue(e))}</button>`).join('') || '<p class="sub petit">Aucune carte libre avec ces filtres.</p>'; };
function fenetreVendre() {
  ouvrirOverlay(`<div class="sheet compo"><h3>Vendre une carte</h3>
    <p class="sub petit">Tes cartes hors de l’équipe et du banc. Touche celle à vendre.</p>
    ${filtresPalier('mk-vpalier', MKT.vPalier)}${filtresEquipe('mk-vequipe', MKT.vEquipe || '')}
    <input class="champ" type="search" placeholder="Nom du joueur" value="${esc(MKT.vRecherche || '')}" data-mk-vrecherche autocomplete="off" spellcheck="false">
    <div class="pickgrid" id="mk-vliste">${listeVendreHTML()}</div>
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}
function fenetrePrix(id) {
  const e = exParId(id), M = MKT.data?.marche, b = (M?.prix || PARAMS.marche_prix || {})[e?.palier];
  if (!e || !b) return toast('Carte introuvable');
  const taxe = M?.taxe ?? PARAMS.marche_taxe ?? 0, defaut = Math.round((b[0] * 2) / 10) * 10 || b[0];
  ouvrirOverlay(`<div class="sheet mk-pr"><h3>Mettre en vente</h3>${carteHTML(vue(e))}
    <p class="sub centre">Prix d’une carte ${R_LABEL[e.palier]} : entre ${nb(b[0])} et ${nb(b[1])} <i class="coin"></i></p>
    <input class="champ" type="number" inputmode="numeric" min="${b[0]}" max="${b[1]}" step="10" value="${defaut}" data-mk-prix="${taxe}" aria-label="Prix en pièces">
    <input type="range" min="${b[0]}" max="${b[1]}" step="10" value="${defaut}" data-mk-prix="${taxe}" aria-label="Prix en pièces">
    <p class="sub centre">Tu recevras <b id="mk-gain">${nb(Math.floor(defaut * (1 - taxe)))}</b> <i class="coin"></i> quand elle partira · en vente ${M?.jours ?? 3} jours</p>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button><button class="btn gold" data-mk-mettre="${e.id}">Mettre en vente</button></div></div>`);
}
// ── boîte à échanges
function vueBoite(D) {
  const B = D.boite, l = mesCedables(true);
  const attente = (B.attente || []).map(x => { const c = carteDe(x.carte, x.palier); return c ? `<div class="mk-m">${carteHTML(c)}<div><b>${esc(c.nom)}</b><small>${R_LABEL[x.palier]} · dans la boîte</small>
      <small>Échange dès qu’un autre joueur dépose une carte ${R_LABEL[x.palier]}, sinon dans ${resteTx(x.fin)} au plus tard</small></div></div>` : ''; }).join('');
  return `<div class="daily bx-t"><p><b>🎁 Boîte à échanges</b>Dépose un doublon contre une autre carte du même palier, déposée par un autre joueur (plutôt un joueur que tu n’as pas encore).
      S’il y en a une dans la boîte, l’échange est immédiat ; sinon ta carte attend qu’un joueur dépose la sienne, ${B.minutes || 60} min au plus, puis la boîte t’en donne une. <em>${B.restants ? `Encore ${plur(B.restants, 'échange')} aujourd’hui (${B.limite} par jour)` : 'Plus d’échange aujourd’hui : reviens demain'}</em></p></div>
    ${attente ? `<h2>En attente dans la boîte</h2><div class="mk-ms">${attente}</div>` : ''}
    <h2>Tes doublons</h2><p class="sub petit">Touche une carte pour l’échanger. Un doublon = 2 cartes du même joueur au même palier : tu en gardes toujours une, et c’est la moins entraînée qui part.</p>
    <div class="pickgrid">${l.map(x => `<button class="pc" data-boite="${x.carte}:${x.palier}"${B.restants ? '' : ' disabled'}>${carteHTML(carteDe(x.carte, x.palier, x.note), {qty: x.tot})}</button>`).join('')
      || '<p class="sub">Pas de doublon libre pour l’instant (cartes hors de ton équipe et de ton banc).</p>'}</div>`;
}
// ── demandes au club
function vueDemandes(D) {
  const C = D.club;
  if (!C) return `<div class="daily"><p><b>🛡️ Demandes au club</b>Rejoins un club de joueurs pour demander des cartes à tes coéquipiers et leur donner tes doublons.</p></div>
    <a class="btn gold" href="#clubs" style="width:100%">Trouver un club</a>`;
  const n = C.nombre || {}, mienne = C.demandes.find(x => x.moi), autres = C.demandes.filter(x => !x.moi);
  const ligne = x => { const c = carteDe(x.carte, x.palier); if (!c) return '';
    return `<div class="dm-l${x.possible ? ' ok' : ''}">${carteHTML(c)}<div class="dm-d">${x.moi ? `<b>${esc(c.nom)}</b><small>${R_LABEL[x.palier]}</small>` : `<b>${lienJ(x.pseudo)}</b><small>${esc(c.nom)} · ${R_LABEL[x.palier]}</small>`}
      <span class="bar"><i style="width:${100 * x.recu / x.voulu}%"></i></span><small>${x.recu}/${x.voulu} reçue${x.recu > 1 ? 's' : ''} · encore ${resteTx(x.fin)}</small></div>
      ${x.moi ? '' : `<button class="btn gold petit" data-donner="${x.id}"${x.possible && C.donsRestants ? '' : ' disabled'}>Donner<small>+${nb(C.pieces?.[x.palier] || 0)} <i class="coin"></i></small></button>`}</div>`; };
  const bouton = C.prochaine > 0 ? `<p class="sub">Prochaine demande dans ${dureeTx(C.prochaine)}</p>`
    : `<button class="btn gold" data-act="dm-demander" style="width:100%">${mienne ? 'Faire une nouvelle demande' : 'Demander une carte'}</button>`;
  return `<div class="daily"><p><b>🛡️ ${esc(C.nom)}</b>Toutes les ${C.heures} h, demande une carte à ton club : Bronze ×${n.bronze}, Argent ×${n.argent} ou Or ×${n.or}
      (Or : une fois tous les ${C.orJours} jours). Donne tes doublons aux autres : des pièces et de l’XP à chaque carte. <em>${C.donsRestants ? `Encore ${plur(C.donsRestants, 'don')} aujourd’hui (${C.donsLimite} par jour)` : 'Plus de don aujourd’hui : reviens demain'}</em></p></div>
    <h2>Ta demande</h2>${mienne ? ligne(mienne) : ''}${bouton}
    <h2>Demandes du club</h2>${autres.map(ligne).join('') || '<p class="sub">Aucune demande en cours dans ton club.</p>'}`;
}
const joueursDemande = () => { const q = MKT.dRecherche.trim().toLowerCase();
  return CARTES.filter(c => c.actif !== false && !c.legende && (!MKT.dEquipe || deLEquipe(c, MKT.dEquipe)) && (!q || c.nom.toLowerCase().includes(q)))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')); };
const listeDemandeHTML = () => joueursDemande().map(c => `<button class="pc" data-demander="${c.id}">${carteHTML(carteDe(c.id, MKT.dPalier))}</button>`).join('')
  || '<p class="sub petit">Aucun joueur trouvé.</p>';
function fenetreDemande() {
  const C = MKT.data?.club; if (!C) return;
  const pals = ['bronze', 'argent', ...(C.prochaineOr > 0 ? [] : ['or'])];
  if (!pals.includes(MKT.dPalier)) MKT.dPalier = 'bronze';
  ouvrirOverlay(`<div class="sheet compo"><h3>Demander une carte</h3>
    <p class="sub petit">${pals.map(p => `${R_LABEL[p]} ×${C.nombre[p]}`).join(' · ')}${C.prochaineOr > 0 ? ` · Or de nouveau dans ${dureeTx(C.prochaineOr)}` : ''}</p>
    ${filtresPalier('dm-palier', MKT.dPalier, pals, '')}${filtresEquipe('dm-equipe', MKT.dEquipe)}
    <input class="champ" type="search" placeholder="Nom du joueur" value="${esc(MKT.dRecherche)}" data-dm-recherche autocomplete="off" spellcheck="false">
    <div class="pickgrid" id="dm-liste">${listeDemandeHTML()}</div>
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}
// ── derniers mouvements
function histoTransferts(D) {
  const h = D.historique || []; if (!h.length) return '';
  const nom = id => esc(PAR_ID[id]?.nom || 'une carte'), qui = a => a ? lienJ(a) : 'un joueur supprimé';
  const txt = x => x.type === 'vente' ? `Tu as vendu ${nom(x.carte)} à ${qui(x.avec)} : +${nb(x.prix)} <i class="coin"></i>`
    : x.type === 'achat' ? `Tu as acheté ${nom(x.carte)} à ${qui(x.avec)} : ${nb(x.prix)} <i class="coin"></i>`
    : x.type === 'don' ? `Tu as donné ${nom(x.carte)} à ${qui(x.avec)}`
    : x.type === 'recu' ? `${qui(x.avec)} t’a donné ${nom(x.carte)}`
    : x.type === 'boite' ? `Boîte à échanges : ${nom(x.donne)} → ${nom(x.carte)}`
    : `Avec ${qui(x.avec)} : ${nom(x.donne)} ⇄ ${nom(x.carte)}`;
  return `<h2>Derniers mouvements</h2><div class="tr-hs">${h.map(x => `<p class="tr-h${x.nouveau ? ' nouveau' : ''}">${x.nouveau ? '<b class="pastille-n">nouveau</b>' : ''}${txt(x)}
    <small>${R_LABEL[x.palier] || ''} · ${new Date(x.le).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}</small></p>`).join('')}</div>`;
}

// ── paris sur les vrais matchs ──────────────────────────────────────────────────
const PARIS = {data: null, charge: false, filtre: 'medoc'};
const fr = n => Number(n).toFixed(2).replace('.', ',');   // cote : toujours 2 décimales
function chargerParis() {
  if (PARIS.charge || PARIS.data || Compte.horsLigne) return;
  PARIS.charge = true;
  Compte.matchsParis().then(d => { PARIS.data = d; }).catch(e => { PARIS.data = {aVenir: [], resultats: [], mesParis: []}; toast(e.message); })
    .finally(() => { PARIS.charge = false; if (vueCourante() === 'paris' && $('#overlay').hidden) route(true); });
}
const issueNom = (m, choix) => choix === '1' ? m.dom : choix === '2' ? m.ext : 'Match nul';
// couleurs des quatre poules (bandeau des matchs, filtres) et blason des clubs : le logo pour le Médoc, des initiales sinon
const TEINTE_EQ = {SG1: '#4f8cff', SG2: '#1fc7b6', SF1: '#ff5c93', SF2: '#a979ff', '-18G': '#5ad16a', '-18F1': '#ff8a5c', '-18F2': '#e0c341', '-15G': '#4fc3e8', '-15F': '#ffb347'};
const teinteClub = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initialesClub = n => { const num = n.match(/\s(\d+)$/)?.[1] || '', mots = n.replace(/\s\d+$/, '').split(/[\s-]+/).filter(w => w.length > 2 || /^[A-ZÉ]/.test(w));
  return ((mots.length > 1 ? mots[0][0] + mots[1][0] : (mots[0] || n).slice(0, 2)) + num).toUpperCase(); };
const blason = (nom, med) => med ? '<i class="bl med" aria-hidden="true"><img src="assets/logo.png" alt=""></i>'
  : `<i class="bl" style="--h:${teinteClub(nom)}" aria-hidden="true">${esc(initialesClub(nom))}</i>`;
// probabilités tirées des cotes (inverse des cotes, ramené à 100 %)
const probasCotes = c => { const i = ['1', 'N', '2'].map(k => 1 / c[k]), s = i[0] + i[1] + i[2]; return i.map(x => x / s); };
const barreProbas = (p, noms) => `<div class="pm-proba" role="img" aria-label="${noms ? `${esc(noms[0])} ${Math.round(p[0] * 100)} %, nul ${Math.round(p[1] * 100)} %, ${esc(noms[1])} ${Math.round(p[2] * 100)} %` : 'Chances de chaque issue'}">
  <i class="pp1" style="--p:${p[0]}"></i><i class="ppn" style="--p:${p[1]}"></i><i class="pp2" style="--p:${p[2]}"></i></div>
  <div class="pm-pct"><span>${Math.round(p[0] * 100)} %</span><span>nul ${Math.round(p[1] * 100)} %</span><span>${Math.round(p[2] * 100)} %</span></div>`;
// 3 paris au plus par semaine (serveur : paris_par_semaine) : une fois atteint, les cotes restent visibles mais grisées
const parisRestants = () => { const d = PARIS.data; return d ? Math.max(0, (d.parSemaine ?? 3) - (d.cetteSemaine || 0)) : 0; };
const boutonsCotes = m => `<div class="pm-c">${['1', 'N', '2'].map(k => `<button data-pari="${m.rid}:${k}"${parisRestants() ? '' : ' disabled'}><small>${k === 'N' ? 'Nul' : esc(k === '1' ? m.dom : m.ext)}</small><b>${fr(m.cotes[k])}</b></button>`).join('')}</div>`;
const ticketPari = m => `<div class="pm-ticket"><span aria-hidden="true">🎟️</span><p>Ton pari : <b>${nb(m.pari.mise)}</b> sur <b>${esc(issueNom(m, m.pari.choix))}</b> · cote ${fr(m.pari.cote)}<small>gain possible ${nb(Math.floor(m.pari.mise * m.pari.cote))} pièces</small></p></div>`;
function vueParis() {
  chargerParis();
  const d = PARIS.data, f = PARIS.filtre;
  const garde = m => f === 'tous' || (f === 'medoc' ? !!m.medoc : m.equipe === f);
  let jour = '', sem = '', i = 0;
  // semaine du lundi au dimanche : les paris de la semaine sont payés le lundi matin, ceux d'après restent ouverts
  const lundi = x => { const t = new Date(x + 'T12:00'); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return t.toLocaleDateString('sv'); };
  const ceLundi = lundi(new Date().toLocaleDateString('sv'));
  const nomSem = l => l <= ceLundi ? 'Cette semaine' : (new Date(l + 'T12:00') - new Date(ceLundi + 'T12:00')) / 864e5 < 8 ? 'La semaine prochaine'
    : 'Semaine du ' + new Date(l + 'T12:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'});
  const avenir = (d?.aVenir || []).filter(garde).map(m => {
    const j = new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});
    const w = nomSem(lundi(m.date)), titreSem = w !== sem ? `<h2 class="semaine">${w}</h2>` : ''; sem = w;
    const titre = titreSem + (j !== jour ? `<h3 class="jour">${j}</h3>` : ''); jour = j;
    return titre + `<article class="pm${m.pari ? ' parie' : ''}" style="--eq:${TEINTE_EQ[m.equipe] || '#ffd257'};--i:${Math.min(i++, 8)}">
      <header class="pm-h"><span class="pm-cat">${m.equipe}</span><small>J${m.journee ?? '?'}${m.heure ? ' · ' + m.heure : ''}</small></header>
      <div class="pm-eq"><div class="pm-t">${blason(m.dom, m.medoc === 'dom')}<b class="${m.medoc === 'dom' ? 'med' : ''}">${esc(m.dom)}</b></div>
        <span class="pm-vs">VS</span>
        <div class="pm-t">${blason(m.ext, m.medoc === 'ext')}<b class="${m.medoc === 'ext' ? 'med' : ''}">${esc(m.ext)}</b></div></div>
      ${barreProbas(probasCotes(m.cotes))}
      ${m.pari ? ticketPari(m) : boutonsCotes(m)}
      <button class="pm-fiche" data-fiche="${m.rid}"><span aria-hidden="true">📊</span> Voir la fiche du match</button></article>`;
  }).join('');
  const mes = (d?.mesParis || []).map(m => {
    const x = m.pari, st = {en_cours: 'En cours', gagne: `Gagné : +${nb(x.gain)}`, perdu: 'Perdu'}[x.statut];
    return `<div class="hist r-${x.statut === 'gagne' ? 'gagne' : x.statut === 'perdu' ? 'perdu' : 'nul'}"><b>${m.score ? m.score.join(' – ') : nb(x.mise)}</b>
      <span>${esc(m.dom)} – ${esc(m.ext)} · ${esc(issueNom(m, x.choix))} à ${fr(x.cote)}</span><small>${st}</small></div>`;
  }).join('');
  const enCours = (d?.mesParis || []).filter(m => m.pari.statut === 'en_cours').length;
  return `${retour('social', 'Social')}
    <div class="paris-hero"><span class="ph-ticket" aria-hidden="true">🎟️</span><h1>Paris</h1>
      <p>Parie tes pièces sur les vrais matchs des poules SG1, SG2, SF1 et SF2, jusqu’à deux semaines à l’avance.</p>
      <small class="ph-lundi">Les paris gagnants sont payés automatiquement le lundi matin.</small>
      <small>Cotes du modèle de pronostic de medochandballstats.com · pièces du jeu seulement : rien à acheter, rien à gagner en vrai.</small>
      ${d ? `<div class="ph-chiffres"><span><b>${(d.aVenir || []).length}</b> matchs</span><span><b>${enCours}</b> pari${enCours > 1 ? 's' : ''} en cours</span>
        <span class="${parisRestants() ? '' : 'plein'}"><b>${parisRestants()}/${d.parSemaine ?? 3}</b> pari${parisRestants() > 1 ? 's' : ''} restant${parisRestants() > 1 ? 's' : ''} cette semaine</span></div>` : ''}</div>
    <div class="filters paris-f">${[['medoc', 'Médoc'], ['tous', 'Tous'], ['SG1'], ['SG2'], ['SF1'], ['SF2']]
      .map(([k, l]) => `<button data-pfiltre="${k}" class="${f === k ? 'on' : ''}" style="--eq:${TEINTE_EQ[k] || '#ffd257'}">${l || k}</button>`).join('')}</div>
    ${!d ? '<p class="sub">Chargement…</p>' : avenir || '<p class="sub">Pas de match dans les deux prochaines semaines.</p>'}
    ${mes ? `<h2>Mes paris</h2><div class="hists">${mes}</div>` : ''}`;
}
// ── fiche du match : résumé du « face-à-face » de medochandballstats.com (data/face.json, scripts/export_face.py) ──
const FACE = {data: null, charge: null};
const chargerFace = () => FACE.data ? Promise.resolve(FACE.data)
  : FACE.charge ||= fetch('data/face.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : {matchs: {}}).catch(() => ({matchs: {}})).then(d => (FACE.data = d));
const v1 = x => x == null ? '–' : x.toFixed(1).replace('.', ',');
const sg1 = x => x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + v1(Math.abs(x));
const pc = x => x == null ? '–' : Math.round(x * 100) + ' %';
const verdictP = p => p >= .85 ? 'grande favorite' : p >= .65 ? 'favorite' : p >= .52 ? 'légère favorite' : p >= .4 ? 'dans un match ouvert' : p >= .2 ? 'outsider' : 'en grand danger';
function fenetreFiche(rid) {
  const m = PARIS.data?.aVenir.find(x => x.rid === rid); if (!m) return;
  ouvrirOverlay('<div class="sheet fiche-m"><p class="sub">Chargement de la fiche…</p></div>');
  chargerFace().then(F => { if (!$('.fiche-m')) return; $('#overlay').innerHTML = ficheMatchHTML(m, F.matchs?.[rid], F.home); });
}
function ficheMatchHTML(m, x, home) {
  const date = new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});
  const tete = `<header class="fm-h" style="--eq:${TEINTE_EQ[m.equipe] || '#ffd257'}"><span class="pm-cat">${m.equipe}</span><small>J${m.journee ?? '?'} · ${date}${m.heure ? ' · ' + m.heure : ''}</small>
    <button class="fm-x" data-act="fermer" aria-label="Fermer">✕</button></header>
    <div class="fm-eq"><div>${blason(m.dom, m.medoc === 'dom')}<b class="${m.medoc === 'dom' ? 'med' : ''}">${esc(m.dom)}</b>${x?.dom.place ? `<small>${ordinal(x.dom.place)} · ${x.dom.pts} pts</small>` : ''}</div>
      <span class="pm-vs">VS</span>
      <div>${blason(m.ext, m.medoc === 'ext')}<b class="${m.medoc === 'ext' ? 'med' : ''}">${esc(m.ext)}</b>${x?.ext.place ? `<small>${ordinal(x.ext.place)} · ${x.ext.pts} pts</small>` : ''}</div></div>`;
  const pied = `${m.pari ? ticketPari(m) : boutonsCotes(m)}
    <a class="fm-site" href="https://medochandballstats.com" target="_blank" rel="noopener">Toute l’analyse sur medochandballstats.com ↗</a>`;
  if (!x) return `<div class="sheet fiche-m">${tete}${barreProbas(probasCotes(m.cotes), [m.dom, m.ext])}
    <p class="sub">La fiche de ce match n’est pas encore prête.</p>${pied}</div>`;
  const L = x.dom, R = x.ext, p = x.p, fav = p[0] >= p[2] ? L : R, pf = Math.max(p[0], p[2]);
  // demande de Maël : seulement le pronostic et le face-à-face (plus de rapport de force, de forme ni d'attaque contre défense)
  const prono = `<b>${esc(fav.nom)}</b> part ${verdictP(pf)} (${pc(pf)}).${x.score ? ` Score probable : <b>${x.score[0]} – ${x.score[1]}</b>.` : ''}`;
  // le face-à-face en chiffres : la meilleure valeur de chaque ligne en couleur, et une barre qui montre qui domine
  const bil = b => b.j ? `${b.g}V ${b.n}N ${b.p}D` : '–';
  const formeH = f => f ? `<span class="fm-forme">${[...f].map(c => `<i class="f-${c}">${c}</i>`).join('')}</span>` : '–';
  const lignes = [
    ['Classement', L.place, R.place, L.place ? ordinal(L.place) : '–', R.place ? ordinal(R.place) : '–', false],
    ['Points', L.pts, R.pts, L.pts ?? '–', R.pts ?? '–', true],
    ['Niveau estimé', L.niveau, R.niveau, sg1(L.niveau), sg1(R.niveau), true],
    ['Buts marqués / match', L.att, R.att, v1(L.att), v1(R.att), true],
    ['Buts encaissés / match', L.def, R.def, v1(L.def), v1(R.def), false],
    ['Écart moyen', L.gd, R.gd, sg1(L.gd), sg1(R.gd), true],
    ['Bilan dom. / ext.', L.bilan.j ? L.bilan.g / L.bilan.j : null, R.bilan.j ? R.bilan.g / R.bilan.j : null, bil(L.bilan), bil(R.bilan), true],
    ['Derniers matchs', L.forme ? [...L.forme].filter(c => c === 'V').length / L.forme.length : null, R.forme ? [...R.forme].filter(c => c === 'V').length / R.forme.length : null, formeH(L.forme), formeH(R.forme), true],
    ['Plus large victoire', L.best, R.best, L.best ? '+' + L.best : '–', R.best ? '+' + R.best : '–', true],
    ['Chance de finir 1er', L.p1, R.p1, pc(L.p1), pc(R.p1), true],
  ];
  const ff = lignes.map(([lab, a, b, da, db, haut], k) => {
    const ok = a != null && b != null && a !== b, gauche = ok && (haut ? a > b : a < b);
    // part de la barre : rapport des deux valeurs (rangs et valeurs négatives ramenés à une échelle positive)
    let part = .5;
    if (ok) { const lo = Math.min(a, b, 0), A = a - lo + .5, B = b - lo + .5; part = haut ? A / (A + B) : B / (A + B); }
    return `<div class="fm-l" style="--k:${k}"><b class="${ok && gauche ? 'top' : ''}">${da}</b><span>${lab}</span><b class="${ok && !gauche ? 'top' : ''}">${db}</b>
      <i class="fm-bar" style="--part:${Math.max(.08, Math.min(.92, part))}"></i></div>`;
  }).join('');
  const deja = x.deja.length ? `<h4>Déjà cette saison</h4>${x.deja.map(r => `<p class="fm-deja">${esc(r.dom)} <b>${r.score[0]} – ${r.score[1]}</b> ${esc(r.ext)}</p>`).join('')}` : '';
  return `<div class="sheet fiche-m">${tete}${barreProbas(p, [L.nom, R.nom])}
    <div class="fm-txt"><p style="--k:0"><b>Le pronostic</b>${prono}</p></div>
    <h4>Le face-à-face en chiffres</h4><div class="fm-ff">${ff}</div>${deja}${pied}</div>`;
}
function fenetrePari(rid, choix) {
  const m = PARIS.data.aVenir.find(x => x.rid === rid), c = m.cotes[choix];
  const min = PARIS.data.min || 10, max = Math.min(PARIS.data.max || 300, S().pieces);
  if (max < min) return toast('Pas assez de pièces pour parier');
  const mise = Math.min(max, Math.max(min, 50));
  ouvrirOverlay(`<div class="sheet"><h3>${esc(m.dom)} – ${esc(m.ext)}</h3>
    <p class="sub">${m.equipe} · ${new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})}${m.heure ? ' · ' + m.heure : ''}</p>
    <p>Ton choix : <b>${esc(issueNom(m, choix))}</b> · cote <b>${fr(c)}</b></p>
    <label class="stat-l mise"><span>Mise</span><input type="range" min="${min}" max="${max}" step="10" value="${mise}" data-mise>
      <input class="champ" type="number" min="${min}" max="${max}" step="10" value="${mise}" data-mise inputmode="numeric"></label>
    <p class="sub">Gain possible : <b id="gain-pari">${nb(Math.floor(mise * c))}</b> pièces (mise comprise). Les paris ferment au coup d’envoi.</p>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button>
      <button class="btn gold" data-valider-pari="${rid}:${choix}">Parier</button></div></div>`);
}

// ── social : classement, transferts, paris, ami(e)s ─────────────────────────────
function vueSocial() {
  const porte = (h, ic, t, st) => `<a class="porte social" href="#${h}"><span class="porte-ic" aria-hidden="true">${ic}</span><b>${t}</b><small>${st}</small></a>`;
  return `<h1>Social</h1>
    <div class="portes">${porte('salon', '🟢', 'En ligne', `${nEnLigne() ? `${nEnLigne()} joueur${nEnLigne() > 1 ? 's' : ''} en ligne · ` : ''}le salon de tous les joueurs`)}
    ${porte('classement', '🏅', 'Classement', 'Le niveau de poule de chaque joueur')}
    ${porte('marche', '⇄', 'Transferts', 'Marché, boîte à échanges et demandes au club').replace('</a>', nTransferts() ? `<b class="pastille">${nTransferts()}</b></a>` : '</a>')}
    ${porte('paris', '🎟️', 'Paris', 'Les vrais matchs du Médoc')}
    ${porte('pronos', '🔮', 'Pronos', 'Devine le score et le buteur des matchs du week-end')}
    ${porte('clubs', '🛡️', 'Clubs', S().club ? esc(S().club.nom) : 'Rejoins un club : un objectif commun chaque semaine')}</div>
    <p class="sub petit">Tes ami(e)s sont dans la bulle en bas à droite : messages, échanges, défis.</p>`;
}
const SOC = {classement: null, amis: null, charge: {}, recu: {}, ajout: '', echange: null, panneau: null, conv: null};
// Salon « En ligne » (demande de Maël, 23 nov. 2026) : qui est là, et un fil ouvert à tous les joueurs (messages gardés 7 jours).
// Relu toutes les 4 s tant que la page est ouverte ; seul le fil est redessiné, jamais le champ (comme la bulle des ami(e)s)
const SAL = {msgs: [], dernier: 0, en: [], t: null, req: false, d: null};
function vueSalon() {
  if (!SAL.t) { SAL.t = setInterval(salonTick, 4000); salonTick(true); }
  const D = SAL.d || {};
  return `${retour('social', 'Social')}<h1>En ligne</h1>
    <div class="sal-en" id="sal-en">${salonEnHTML()}</div>
    <div class="sal-fil" id="sal-fil">${salonFilHTML()}</div>
    ${D.muet ? '<p class="sub petit">Tu ne peux pas écrire dans le salon pour l’instant.</p>' : `<form class="ajout-ami sal-f" data-form="salon"><input class="champ" name="texte" maxlength="${D.longueur || 300}" placeholder="Écris à tous les joueurs" autocomplete="off" required>
      <button class="btn gold" type="submit">Envoyer</button></form>`}
    <p class="sub petit">Tout le monde peut lire le salon. Reste correct et ne donne jamais d’informations personnelles (nom, adresse, téléphone…).</p>`;
}
const salonEnHTML = () => SAL.en.length ? SAL.en.map(x => `<span class="sal-j${x.moi ? ' sal-moi' : ''}">${avatarHTML(x.perso)}<b>${x.moi ? 'Toi' : lienJ(x.pseudo)}</b></span>`).join('')
  : '<p class="sub petit">Chargement…</p>';
function salonFilHTML() {
  if (!SAL.msgs.length) return `<p class="sub petit centre">${SAL.d ? 'Personne n’a encore écrit : lance la discussion !' : 'Chargement…'}</p>`;
  const adm = SAL.d?.admin;
  return SAL.msgs.map(m => `<p class="msg sal-m${m.moi ? ' moi' : ''}" data-id="${m.id}">${m.moi ? '' : `<b class="sal-p">${lienJ(m.pseudo)}</b>`}<span>${esc(m.texte)}</span>
    <small>${new Date(m.le).toLocaleString('fr-FR', {weekday: 'short', hour: '2-digit', minute: '2-digit'})}${adm ? ` <button class="lien" data-sal-suppr="${m.id}">🗑</button>${m.moi ? '' : ` <button class="lien" data-sal-muet="${esc(m.pseudo)}">🔇</button>`}` : ''}</small></p>`).join('');
}
function salonMaj(r) {
  if (!r) return;
  SAL.d = r;
  const vus = new Set(SAL.msgs.map(m => m.id)), sup = new Set(r.supprimes || []);
  SAL.msgs = SAL.msgs.concat((r.messages || []).filter(m => !vus.has(m.id))).filter(m => !sup.has(m.id)).slice(-120);
  SAL.dernier = Math.max(SAL.dernier, ...SAL.msgs.map(m => m.id), 0);
  SAL.en = r.enLigne || [];
  S().enLigne = SAL.en.filter(x => !x.moi).map(x => x.pseudo);
  const f = $('#sal-fil'), en = $('#sal-en');
  if (en) en.innerHTML = salonEnHTML();
  if (f) { const bas = f.scrollHeight - f.scrollTop - f.clientHeight < 60, html = salonFilHTML(); if (f.innerHTML !== html) { f.innerHTML = html; if (bas || !f.dataset.vu) f.scrollTop = f.scrollHeight; f.dataset.vu = 1; } }
}
function salonTick(forcer) {
  if (vueCourante() !== 'salon') { clearInterval(SAL.t); SAL.t = null; return; }
  if (SAL.req || (!forcer && document.hidden)) return;
  SAL.req = true;
  // un message effacé par l'admin : on relit tout (rare)
  Compte.salonLire(forcer ? 0 : SAL.dernier).then(salonMaj).catch(e => { if (forcer) toast(e.message); }).finally(() => { SAL.req = false; });
}
// Chat du club (demande de Maël, 24 nov. 2026) : les messages des membres, les demandes de cartes (à donner d'un toucher) et les dons, dans
// un seul fil. Relu toutes les 4 s tant que la page du club est ouverte ; seul le fil est redessiné, jamais le champ (comme le salon)
const CCH = {msgs: [], dernier: 0, d: null, t: null, req: false};
function blocChatClub() {
  if (!CCH.t) { CCH.t = setInterval(clubChatTick, 4000); clubChatTick(true); }
  const D = CCH.d || {}, C = D.club || {};
  const demander = C.prochaine > 0 ? `<small class="sub">Prochaine demande de carte dans ${dureeTx(C.prochaine)}</small>`
    : `<button class="btn ghost petit" data-act="cc-demander">🃏 Demander une carte</button>`;
  return `<h2>💬 Chat du club</h2>
    <div class="sal-fil cc-fil" id="cc-fil">${clubFilHTML()}</div>
    ${D.muet ? '<p class="sub petit">Tu ne peux pas écrire pour l’instant.</p>' : `<form class="ajout-ami sal-f" data-form="chat-club"><input class="champ" name="texte" maxlength="${D.longueur || 300}" placeholder="Écris à ton club" autocomplete="off" required>
      <button class="btn gold" type="submit">Envoyer</button></form>`}
    <div class="cc-act">${demander}<small class="sub">Seuls les membres du club lisent ce fil.</small></div>`;
}
function clubFilHTML() {
  const D = CCH.d; if (!D) return '<p class="sub petit centre">Chargement…</p>';
  const C = D.club || {}, h = d => new Date(d).toLocaleString('fr-FR', {weekday: 'short', hour: '2-digit', minute: '2-digit'});
  const items = [
    ...CCH.msgs.map(m => ({t: +new Date(m.le), html: `<p class="msg sal-m${m.moi ? ' moi' : ''}">${m.moi ? '' : `<b class="sal-p">${lienJ(m.pseudo)}</b>`}<span>${esc(m.texte)}</span>
      <small>${h(m.le)}${m.peutEffacer ? ` <button class="lien" data-cc-suppr="${m.id}">🗑</button>` : ''}</small></p>`})),
    ...(D.dons || []).map(x => ({t: +new Date(x.le), html: `<p class="cc-sys">🎁 ${x.moi ? 'Tu as' : `${lienJ(x.de || 'Un joueur')} a`} donné <b>${esc(PAR_ID[x.carte]?.nom || 'une carte')}</b> (${R_LABEL[x.palier]}) à ${x.pourMoi ? 'toi' : lienJ(x.pour || '?')}</p>`})),
    ...(C.demandes || []).map(x => { const c = carteDe(x.carte, x.palier); if (!c) return null;
      const debut = +new Date(x.fin) - (C.duree || 24) * 3600e3;
      return {t: debut, html: `<div class="cc-dem${x.moi ? ' moi' : ''}${x.possible ? ' ok' : ''}">${vignetteHTML(c)}<div class="dm-d"><b>${x.moi ? 'Ta demande' : `${lienJ(x.pseudo)} demande`}</b>
        <small>${esc(c.nom)} · ${R_LABEL[x.palier]}</small><span class="bar"><i style="width:${100 * x.recu / x.voulu}%"></i></span><small>${x.recu}/${x.voulu} reçue${x.recu > 1 ? 's' : ''} · encore ${resteTx(x.fin)}</small></div>
        ${x.moi ? '' : `<button class="btn gold petit" data-donner="${x.id}"${x.possible && C.donsRestants ? '' : ' disabled'}>Donner<small>+${nb(C.pieces?.[x.palier] || 0)} <i class="coin"></i></small></button>`}</div>`}; })
  ].filter(Boolean).sort((a, b) => a.t - b.t);
  return items.length ? items.map(x => x.html).join('') : '<p class="sub petit centre">Personne n’a encore écrit : lance la discussion !</p>';
}
function clubChatMaj(r) {
  if (!r) return;
  CCH.d = r;
  const vus = new Set(CCH.msgs.map(m => m.id)), sup = new Set(r.supprimes || []);
  CCH.msgs = CCH.msgs.concat((r.messages || []).filter(m => !vus.has(m.id))).filter(m => !sup.has(m.id)).slice(-150);
  CCH.dernier = Math.max(CCH.dernier, ...CCH.msgs.map(m => m.id), 0);
  const f = $('#cc-fil');
  if (f) { const bas = f.scrollHeight - f.scrollTop - f.clientHeight < 60, html = clubFilHTML(); if (f.innerHTML !== html) { f.innerHTML = html; if (bas || !f.dataset.vu) f.scrollTop = f.scrollHeight; f.dataset.vu = 1; } }
}
function clubChatTick(forcer) {
  if (vueCourante() !== 'clubs' || !SOC.clubs?.club) { clearInterval(CCH.t); CCH.t = null; return; }
  if (CCH.req || (!forcer && document.hidden)) return;
  CCH.req = true;
  Compte.clubChat(forcer ? 0 : CCH.dernier).then(r => { if (forcer) { CCH.msgs = []; CCH.dernier = 0; } clubChatMaj(r); }).catch(e => { if (forcer) toast(e.message); }).finally(() => { CCH.req = false; });
}
// Classement, ligue, clubs, pronos : relus à chaque visite de la page s'ils datent de plus de 15 s (la page montre d'abord ceux
// qu'elle a, puis se met à jour). Avant, ils n'étaient chargés qu'une fois par session : les victoires du club ne bougeaient pas
// après des défis gagnés (retour de Guilhem, 21 nov. 2026 ; le serveur les comptait bien)
function chargerSoc(cle, f) {
  if (SOC.charge[cle] || Compte.horsLigne || (SOC[cle] && Date.now() - (SOC.recu[cle] || 0) < 15000)) return;
  SOC.charge[cle] = true;
  f().then(d => { SOC[cle] = d; }).catch(e => { if (!SOC[cle]) { toast(e.message); SOC[cle] = cle === 'amis' ? {amis: [], recues: [], envoyees: [], echanges: [], restants: 0} : {joueurs: []}; } })
    .finally(() => { SOC.charge[cle] = false; SOC.recu[cle] = Date.now(); if ([cle].includes(vueCourante()) && $('#overlay').hidden) route(true); });
}
function vueClassement() {
  chargerSoc('classement', () => Compte.classementPoules());
  const L = SOC.classement?.joueurs;
  const moi = L ? L.findIndex(x => x.moi) : -1;
  return `${retour('social', 'Social')}<h1>Classement</h1>
    <p class="sub">Le niveau de poule de chaque joueur inscrit, du plus haut au plus bas.${moi >= 0 ? ` Tu es <b>${ordinal(moi + 1)}</b>.` : ''}
      Touche un joueur pour <b>voir son équipe</b>.</p>
    ${!L ? '<p class="sub">Chargement…</p>' : `<div class="classe poules">${L.map((x, i) => `<button class="cl-l${x.moi ? ' moi-l' : ''}" data-voir-equipe="${esc(x.pseudo)}"
      aria-label="Voir l’équipe de ${esc(x.pseudo)}"><span>${i + 1}</span><b>${esc(x.pseudo)}${x.moi ? '' : pastilleEL(x.pseudo)}</b>
      <small>${esc(x.groupe === 'Légendes' ? x.nom : x.groupe + ' · ' + x.nom)}</small><em>niv. ${x.niveau}</em><i class="cl-eq" aria-hidden="true">Équipe ›</i></button>`).join('')
      || '<p class="sub">Personne pour l’instant.</p>'}</div>`}`;
}
// Pseudo d'un autre joueur, partout où il s'affiche (demande de Maël, retour de Guit, 20 nov. 2026 : pas seulement depuis le
// classement) : un toucher ouvre son équipe. Pas de lien pour soi-même ni pour un compte supprimé.
// en ligne (demande de Maël, 23 nov. 2026) : une pastille verte pour qui a joué dans les 2 dernières minutes (etat → enLigne)
const enLigne = pseudo => !!pseudo && (S().enLigne || []).some(x => x.toLowerCase() === String(pseudo).toLowerCase());
const nEnLigne = () => (S().enLigne || []).length;
const pastilleEL = pseudo => enLigne(pseudo) ? '<i class="pt-vert" title="En ligne" aria-label="en ligne"></i>' : '';
const lienJ = pseudo => !pseudo || pseudo === 'Joueur supprimé' || pseudo.toLowerCase() === String(S().pseudo || '').toLowerCase() ? esc(pseudo || '?')
  : `<button class="lien-j" data-voir-equipe="${esc(pseudo)}" aria-label="Voir l’équipe de ${esc(pseudo)}">${esc(pseudo)}${pastilleEL(pseudo)}</button>`;
// « Voir l'équipe » (demande de Maël) : ce que joue un autre joueur du classement, en lecture seule. Le serveur donne ses 7 alignés,
// sa tactique, sa carte staff et sa note d'équipe calculée comme en match (equipe_publique) ; ses légendes viennent avec leur carte.
const EQDE = {d: null, pseudo: '', ami: null};
function voirEquipe(pseudo, depuisFiche) {
  EQDE.pseudo = pseudo;
  if (!depuisFiche) { EQDE.ami = (SOC.panneau === 'ami' || SOC.panneau === 'defi') && !$('#overlay').hidden ? SOC.ami : null; SOC.panneau = null; }
  if (depuisFiche && EQDE.d && EQDE.d.pseudo.toLowerCase() === pseudo.toLowerCase()) return fenetreEquipeDe(EQDE.d);
  ouvrirOverlay(`<div class="sheet eq-de"><h3>Équipe de ${esc(pseudo)}</h3><p class="sub">Chargement…</p></div>`);
  action(Compte.equipePublique(pseudo), d => { EQDE.d = d; if (EQDE.pseudo === pseudo && !$('#overlay').hidden) fenetreEquipeDe(d); })
    .then(() => { if (EQDE.d?.pseudo?.toLowerCase() !== pseudo.toLowerCase() && !$('#overlay').hidden) cacherOverlay(); });
}
function fenetreEquipeDe(d) {
  ouvrirOverlay(`<div class="sheet eq-de">${EQDE.ami ? `<button class="retour" data-ami="${esc(EQDE.ami)}">‹ ${esc(EQDE.ami)}</button>` : ''}
    <div class="eqde-t">${avatarHTML(d.perso)}<div><h3>${d.moi ? 'Ton équipe' : 'Équipe de ' + esc(d.pseudo)}</h3>
      <small>${esc(d.groupe === 'Légendes' ? d.poule : d.groupe + ' · ' + d.poule)} · niv. ${d.niveau}</small></div></div>
    ${equipeCorpsHTML(d)}
    <button class="btn" data-act="fermer" style="width:100%">Fermer</button></div>`);
}
// l'équipe d'un autre joueur : note, collectif, tactique, terrain, staff, cartes, remplaçants, bonus des tactiques
// (lecture : sans fiche à ouvrir, pour la présentation d'un match à deux)
function equipeCorpsHTML(d, lecture) {
  const [ta, td] = String(d.tactique || '').split(':'), att = TACT_ATT.find(x => x[0] === ta), def = TACT_DEF.find(x => x[0] === td);
  const pl = PLACEMENTS[def ? def[0] : '06'], H = TERRAIN_H + TERRAIN_B, px = x => (x + 10) / 20 * 100, py = y => (TERRAIN_H - y) / H * 100;
  const al = {};
  for (const j of d.joueurs || []) {
    const c = j.legende ? Compte.carteDepuisLigne?.(j.legende) : PAR_ID[j.carte] && vueExemplaire(PAR_ID[j.carte], {palier: j.palier, note: j.note});
    if (c) al[j.poste] = {c, j};
  }
  const posDe = id => { const [x, y] = id === 'GB' ? [0, 1.1] : pl[id]; return [px(x), py(y)]; };
  const liens = LIENS.map(([u, v]) => { const a = al[u], b = al[v]; if (!a || !b) return '';
    const [x1, y1] = posDe(u), [x2, y2] = posDe(v);
    return `<line class="${coequipiers(a.c, b.c) ? 'or' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('');
  // une légende n'a pas de fiche à ouvrir chez un autre (elle n'est pas dans le catalogue du jeu)
  const ouvre = x => x && !x.j.legende && !lecture ? ` data-voir-fiche="${x.c.id}" data-de="${esc(d.pseudo)}"` : '';
  const slots = POSTES.map(p => { const x = al[p.id], [l, t] = posDe(p.id), tag = x && !x.j.legende && !lecture ? 'button' : 'div';
    return `<${tag} class="slot${p.gb ? ' gb' : ''}"${ouvre(x)} style="left:${l}%;top:${t}%">${x ? vignetteHTML(x.c) : '<span class="empty">–</span>'}${x?.j.capitaine ? '<i class="cap" aria-label="capitaine">C</i>' : ''}<em${x && horsPoste(x.c, p.id) ? ' class="hors"' : ''}>${p.id}</em></${tag}>`; }).join('');
  const st = d.staff && staffDe(d.staff.id);
  // ses remplaçants et le bonus de chaque tactique (demande de Maël, 21 nov. 2026)
  const banc = POSTES.map(p => { const j = (d.remplacants || []).find(x => x.poste === p.id); if (!j) return '';
    const c = j.legende ? Compte.carteDepuisLigne?.(j.legende) : PAR_ID[j.carte] && vueExemplaire(PAR_ID[j.carte], {palier: j.palier, note: j.note}); if (!c) return '';
    const tag = j.legende || lecture ? 'div' : 'button';
    return `<${tag} class="eqde-c"${j.legende || lecture ? '' : ` data-voir-fiche="${c.id}" data-de="${esc(d.pseudo)}"`}>${carteHTML(c)}<small>${p.id} · remplaçant</small></${tag}>`; }).join('');
  const T = d.tactiques, TR = d.tactiques_r, clsB = b => b >= .06 ? 'fort' : b <= .005 ? 'nul' : '';
  const tacBloc = liste => liste.map(([k, nom, sts]) => `<div class="tac${(k === ta || k === td) ? ' on' : ''}"><b>${nom}</b><small>${NOM_STAT[sts[0]]} · ${NOM_STAT[sts[1]]}</small>
    <em class="${clsB(T[k] || 0)}">+${pc100(T[k] || 0)}</em>${TR ? `<i class="tac-r ${clsB(TR[k] || 0)}">remplaçants +${pc100(TR[k] || 0)}</i>` : ''}</div>`).join('');
  const tacs = T ? `<h2>Bonus de ses tactiques</h2><p class="sub petit">Ce que chaque tactique lui rapporte, d’après les stats de son équipe${TR ? ' (en petit : avec ses remplaçants)' : ''}. Entourées : sa tactique de départ.</p>
    <h3 class="tac-t">Attaque</h3><div class="tacs">${tacBloc(TACT_ATT)}</div><h3 class="tac-t">Défense</h3><div class="tacs">${tacBloc(TACT_DEF)}</div>` : '';
  const cartes = POSTES.filter(p => al[p.id]).map(p => { const x = al[p.id], tag = x.j.legende || lecture ? 'div' : 'button';
    return `<${tag} class="eqde-c"${ouvre(x)}>${carteHTML(x.c)}<small>${p.id}${d.notes?.[p.id] != null ? ` · ${d.notes[p.id]} en match` : ''}</small></${tag}>`; }).join('');
  return `${Object.keys(al).length ? `<div class="teamnote"><div class="stat"><b>${d.note ?? '–'}</b><span>note d’équipe</span></div>
      <div class="stat"><b>+${d.collectif ?? 0}</b><span>collectif</span></div>
      <div class="stat"><b class="eqde-tac">${att ? att[1] : '–'}<br>${def ? def[1] : '–'}</b><span>tactique</span></div></div>
      <div class="pitch" style="aspect-ratio:20 / ${H}">${terrainSVG()}<svg class="liens" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${liens}</svg>${slots}</div>
      ${st ? `<div class="staff-place eqde-staff"><span class="sp-t">Staff</span>${staffCarteHTML(st, 'mini', d.staff.palier)}
        <span class="sp-d"><b>${esc(st.personne || st.nom)}</b><small>${R_LABEL[d.staff.palier] || ''} · ${staffEffet(st, d.staff.palier)}</small></span></div>` : ''}
      <h2>Ses ${Object.keys(al).length} cartes</h2><div class="eqde-cartes">${cartes}</div>
      ${banc ? `<h2>Ses remplaçants</h2><div class="eqde-cartes">${banc}</div>` : ''}
      ${tacs}
      ${d.note == null ? '<p class="sub petit">Note d’équipe : il faut 7 joueurs alignés.</p>' : ''}`
      : '<p class="sub">Aucun joueur aligné pour l’instant.</p>'}`;
}
// Ami(e)s (la bulle) : la liste, puis pour chaque ami(e) : message, échange, défi
function chargerAmis() { return Compte.mesAmis().then(d => { SOC.amis = d; return d; }); }
function panneauAmis() {
  SOC.panneau = 'liste';
  const A = SOC.amis;
  if (!A) { ouvrirOverlay(`<div class="sheet amis-p"><h3>Ami(e)s</h3><p class="sub">Chargement…</p></div>`);
    return chargerAmis().then(() => SOC.panneau === 'liste' && panneauAmis()).catch(e => toast(e.message)); }
  const recus = A.echanges.filter(x => x.statut === 'ouvert' && !x.moi);
  ouvrirOverlay(`<div class="sheet amis-p"><h3>Ami(e)s</h3>
    <form class="ajout-ami" data-form="ami"><input class="champ" name="pseudo" placeholder="Pseudo d’un(e) ami(e)" value="${esc(SOC.ajout)}" autocapitalize="off" autocomplete="off" spellcheck="false" required>
      <button class="btn gold" type="submit">Ajouter</button></form>
    ${A.recues.map(p => `<div class="adv"><div><b>${lienJ(p)}</b><small>veut être ton ami(e)</small></div>
      <div class="ed-btns"><button class="btn ghost petit" data-repondre-ami="${esc(p)}:0">Refuser</button><button class="btn gold petit" data-repondre-ami="${esc(p)}:1">Accepter</button></div></div>`).join('')}
    ${recus.length ? `<p class="sub petit">${recus.length} échange${recus.length > 1 ? 's' : ''} proposé${recus.length > 1 ? 's' : ''} : touche l’ami(e) pour répondre.</p>` : ''}
    <div class="liste-amis">${A.amis.map(x => { const r = recus.some(e => e.de === x.pseudo);
      return `<button class="ami-l" data-ami="${esc(x.pseudo)}"><i class="ami-av" aria-hidden="true">${esc(x.pseudo[0].toUpperCase())}</i>
        <span><b>${esc(x.pseudo)}${pastilleEL(x.pseudo)}</b><small>${enLigne(x.pseudo) ? 'en ligne · ' : ''}${esc(x.nom || '')} · niveau ${x.niveau}</small></span>
        ${x.nonLus ? `<em class="ami-n">${x.nonLus} message${x.nonLus > 1 ? 's' : ''}</em>` : r ? '<em class="ami-n">échange</em>' : ''}</button>`; }).join('')
      || '<p class="sub petit">Pas encore d’ami(e) : ajoute un pseudo ci-dessus.</p>'}</div>
    ${A.envoyees.length ? `<p class="sub petit">En attente de réponse : ${A.envoyees.map(lienJ).join(', ')}</p>` : ''}
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}
function ficheAmi(pseudo) {
  SOC.panneau = 'ami'; SOC.ami = pseudo;
  const A = SOC.amis, x = A.amis.find(y => y.pseudo === pseudo);
  if (!x) return panneauAmis();
  const ech = A.echanges.filter(e => e.de === pseudo || e.pour === pseudo).slice(0, 4).map(e => {
    const o = carteDe(e.offre.carte, e.offre.palier, e.offre.note), c = carteDe(e.cherche.carte, e.cherche.palier, e.cherche.note);
    if (!o || !c) return '';
    const fin = {accepte: 'Échange fait', refuse: 'Refusé', annule: 'Annulé'}[e.statut];
    return `<div class="ann${fin ? ' fini' : ''}"><div class="ann-l">
        <div class="ann-c"><span>${e.moi ? 'Tu donnes' : 'Tu reçois'}</span>${carteHTML(o)}<small>${esc(o.nom)} · ${R_LABEL[o.rarete]} ${o.ovr}</small></div>
        <div class="fleche">⇄</div>
        <div class="ann-c"><span>${e.moi ? 'Tu reçois' : 'Tu donnes'}</span>${carteHTML(c)}<small>${esc(c.nom)} · ${R_LABEL[c.rarete]} ${c.ovr}</small></div></div>
      <p class="ann-p">${e.moi ? 'Ta proposition' : 'Sa proposition'}${fin ? ' · ' + fin : ''}</p>
      ${e.statut !== 'ouvert' ? '' : e.moi ? `<button class="btn ghost petit" data-annuler-echange="${e.id}">Annuler</button>`
        : `<div class="ed-btns"><button class="btn ghost petit" data-repondre-echange="${e.id}:0">Refuser</button><button class="btn gold petit" data-repondre-echange="${e.id}:1">Accepter</button></div>`}</div>`;
  }).join('');
  ouvrirOverlay(`<div class="sheet amis-p"><button class="retour" data-act="amis">‹ Ami(e)s</button>
    <h3>${esc(pseudo)} <small>${esc(x.nom || '')} · niveau ${x.niveau}</small></h3>
    <button class="lien voir-eq" data-voir-equipe="${esc(pseudo)}">Voir son équipe ›</button>
    <div class="ami-actions">
      <button class="ami-a" data-ami-message="${esc(pseudo)}"><span aria-hidden="true">💬</span><b>Message</b><small>${x.nonLus ? `${x.nonLus} non lu${x.nonLus > 1 ? 's' : ''}` : 'Écrire'}</small></button>
      <button class="ami-a" data-proposer="${esc(pseudo)}"${x.echange || !A.restants ? ' disabled' : ''}><span aria-hidden="true">⇄</span><b>Échange</b>
        <small>${x.echange ? 'Un échange en cours' : A.restants ? `${A.restants}/${A.limite} aujourd’hui` : 'Demain'}</small></button>
      <button class="ami-a" data-defier-ami="${esc(pseudo)}"${A.defis && x.equipe && noteEquipe().n === 7 ? '' : ' disabled'}><span aria-hidden="true">⚔️</span><b>Défier</b>
        <small>${!x.equipe ? 'Équipe incomplète' : A.defis ? `${A.defis}/${A.defisLimite} · ${A.defiPieces} pièces au gagnant` : 'Demain'}</small></button></div>
    ${ech ? `<h4>Échanges</h4>${ech}` : ''}
    <button class="lien danger" data-retirer-ami="${esc(pseudo)}">Retirer de mes ami(e)s</button></div>`);
}
// défier un(e) ami(e) : en direct (tactique, temps morts) ou simulé ; son équipe joue avec sa tactique à lui (elle)
function fenetreDefi(pseudo) {
  if (S().matchDirect) return toast('Termine d’abord ton match en cours (Jouer, Championnat VS Ordi)');
  SOC.defi = pseudo; SOC.panneau = 'defi';
  const A = SOC.amis || {};
  ouvrirOverlay(`<div class="sheet amis-p"><button class="retour" data-ami="${esc(pseudo)}">‹ ${esc(pseudo)}</button>
    <h3>Défier ${esc(pseudo)}</h3>
    <button class="lien voir-eq" data-voir-equipe="${esc(pseudo)}">Voir son équipe ›</button>
    <p class="sub petit"><b>En direct</b> : ${esc(pseudo)} reçoit ton invitation (2 minutes pour accepter), vous jouez le match ensemble, chacun sa tactique, 3 temps morts de 20 s. ${A.defiPieces ?? 30} pièces au gagnant.</p>
    <button class="btn gold large" data-act="defi-live" style="width:100%">⚔️ Défier en direct</button></div>`);
}
const filMsgHTML = C => C ? C.messages.map(m => `<p class="msg${m.moi ? ' moi' : ''}"><span>${esc(m.texte)}</span>
      <small>${new Date(m.le).toLocaleString('fr-FR', {weekday: 'short', hour: '2-digit', minute: '2-digit'})}</small></p>`).join('') || '<p class="sub petit centre">Pas encore de message : dis bonjour !</p>' : '<p class="sub">Chargement…</p>';
function conversationAmi(pseudo) {
  SOC.panneau = 'conv'; SOC.ami = pseudo;
  const C = SOC.conv?.pseudo === pseudo ? SOC.conv : null;
  ouvrirOverlay(`<div class="sheet amis-p conv"><button class="retour" data-ami="${esc(pseudo)}">‹ ${esc(pseudo)}</button><h3>Messages</h3>
    <div class="fil-msg" id="fil-msg" data-ami="${esc(pseudo)}">${filMsgHTML(C)}</div>
    <form class="ajout-ami" data-form="message"><input class="champ" name="texte" maxlength="${PARAMS.message_longueur || 300}" placeholder="Ton message" autocomplete="off" required>
      <button class="btn gold" type="submit">Envoyer</button></form></div>`);
  const f = $('#fil-msg'); if (f) f.scrollTop = f.scrollHeight;
  if (!C) Compte.conversation(pseudo).then(c => { SOC.conv = c; if (SOC.panneau === 'conv' && SOC.ami === pseudo) majConversation(); majEntete(); }).catch(e => toast(e.message));
}
// nouveaux messages arrivés (relève toutes les 40 s, premier chargement) : seul le fil est redessiné. Avant, toute la fenêtre l'était
// et le message en cours d'écriture disparaissait (retour de Rémi, iPhone : « t'as 30 s pour envoyer un message sinon ça reset »)
function majConversation() {
  const f = $('#fil-msg');
  if (!f || f.dataset.ami !== SOC.ami) return conversationAmi(SOC.ami);
  const enBas = f.scrollHeight - f.scrollTop - f.clientHeight < 40, html = filMsgHTML(SOC.conv);
  if (f.innerHTML === html) return;
  f.innerHTML = html;
  if (enBas) f.scrollTop = f.scrollHeight;
}
// après une action d'ami(e)s : on remet à jour ce qui est affiché dans la bulle
function revoirAmis() { if (SOC.panneau === 'ami') ficheAmi(SOC.ami); else if (SOC.panneau === 'liste') panneauAmis(); }
// Proposer un échange à un(e) ami(e) : 1) une de mes cartes libres, 2) une des siennes
function fenetreEchange() {
  const k = SOC.echange, libres = EX().filter(e => !e.verrou && !dansEquipe(e.id) && PAR_ID[e.carte]).sort(rangEx);
  const siennes = (k.club || []).filter(x => PAR_ID[x.carte]);
  const o = k.donne && exParId(k.donne), c = k.demande && siennes.find(x => x.id === k.demande);
  ouvrirOverlay(`<div class="sheet compo"><h3>Échange avec ${esc(k.pseudo)}</h3>
    <h4>1. Ta carte</h4>
    <div class="pickgrid">${libres.map(e => `<button class="pc${k.donne === e.id ? ' choisi' : ''}" data-ech-donne="${e.id}">${carteHTML(vue(e))}</button>`).join('')
      || '<p class="sub">Pas de carte libre : les cartes de ton équipe ne peuvent pas être échangées.</p>'}</div>
    <h4>2. Sa carte</h4>
    <div class="pickgrid">${k.club ? siennes.map(x => `<button class="pc${k.demande === x.id ? ' choisi' : ''}" data-ech-demande="${x.id}">${carteHTML(carteDe(x.carte, x.palier, x.note))}</button>`).join('')
      || '<p class="sub">Pas de carte libre dans son club.</p>' : '<p class="sub">Chargement…</p>'}</div>
    <div class="resume">${o ? `Tu donnes <b>${esc(PAR_ID[o.carte].nom)} ${R_LABEL[o.palier]} ${o.note}</b>` : 'Choisis ta carte'}
      · ${c ? `tu reçois <b>${esc(PAR_ID[c.carte].nom)} ${R_LABEL[c.palier]} ${c.note}</b>` : 'choisis la sienne'}</div>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button>
      <button class="btn gold" data-act="envoyer-echange"${o && c ? '' : ' disabled'}>Proposer</button></div></div>`);
  SOC.panneau = 'echange';
}

// ── connexion et profil ─────────────────────────────────────────────────────────
let messageCompte = '';
function vueCompte() {
  if (Compte.mode === 'absent') return `<div class="accueil"><img src="assets/logo.png" alt=""><h1>Médoc Hand Cards</h1>
    <p class="sub">Le jeu ouvre bientôt ! Collectionne les cartes des joueurs et joueuses du Médoc Handball, entraîne-les et défie les autres supporters.</p></div>`;
  const msg = messageCompte ? `<div class="daily"><p>${esc(messageCompte)}</p></div>` : '';
  if (Compte.recuperation) return `<h1>Nouveau mot de passe</h1>
    <form class="form" data-form="mdp"><input class="champ" type="password" name="mdp" minlength="8" required autocomplete="new-password" placeholder="Nouveau mot de passe (8 caractères ou plus)">
    <button class="btn gold" type="submit">Enregistrer</button></form>`;
  if (!Compte.connecte) return `<div class="accueil"><img src="assets/logo.png" alt=""><h1>Médoc Hand Cards</h1>
    <p class="sub">Connecte-toi pour ouvrir tes boosters, entraîner tes joueurs et construire ton équipe.</p></div>${msg}
    <form class="form" data-form="connexion">
      <input class="champ" type="email" name="email" placeholder="E-mail" autocomplete="email" required>
      <input class="champ" type="password" name="mdp" placeholder="Mot de passe (8 caractères ou plus)" autocomplete="current-password" minlength="8" required>
      <button class="btn gold" type="submit" value="connexion">Se connecter</button>
      <button class="btn ghost" type="submit" value="inscription">Créer un compte</button>
      <button class="lien" type="submit" value="oubli" formnovalidate>Mot de passe oublié ?</button>
    </form>
    ${Compte.googleActif ? `<div class="ou"><span>ou</span></div>
    <button class="btn ghost large" data-act="google">Continuer avec Google</button>` : ''}
    <p class="sub petit centre"><a href="confidentialite.html">Données personnelles et confidentialité</a> · <a href="mentions-legales.html">Mentions légales</a></p>`;
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
  const e = S();
  const deb = new Set(e.persoDebloques || []), cat = e.persoCatalogue || [];
  const choix = type => `<div class="perso-l">${cat.filter(k => k.type === type).map(k => { const ok = deb.has(k.id), on = (e.perso || {})[type] === k.id;
    const apercu = type === 'avatar' ? avatarHTML({avatar: k.id, cadre: e.perso?.cadre}) : type === 'cadre' ? avatarHTML({avatar: e.perso?.avatar, cadre: k.id}) : `<i class="fond-p fd-${k.id}"></i>`;
    return `<button class="perso-o${on ? ' on' : ''}${ok ? '' : ' verrou'}" ${ok ? `data-perso="${type}:${k.id}"` : 'disabled'} title="${esc(k.condition || k.nom)}">${apercu}<small>${esc(k.nom)}</small>
      ${ok ? '' : `<em>🔒 ${esc(k.condition)}</em>`}</button>`; }).join('')}</div>`;
  ouvrirOverlay(`<div class="sheet compte-s"><div class="profil-t fd-${esc(e.perso?.fond || 'nuit')}">${avatarHTML(e.perso, 'grand')}<div><h3>${esc(e.pseudo)}</h3>
      <small>niveau ${e.niveau}${e.club ? ` · ${esc(e.club.nom)}` : ''}</small></div></div><p class="sub">${esc(Compte.email)}</p>
    <details class="perso"><summary>Personnaliser mon profil</summary>
      <h4>Avatar</h4>${choix('avatar')}<h4>Cadre</h4>${choix('cadre')}<h4>Fond</h4>${choix('fond')}
      <p class="sub petit">Les autres les voient dans les classements et les clubs. Débloque-en dans le passe et les albums.</p></details>
    <button class="son-b presence${S().invisible ? '' : ' on'}" data-act="presence" aria-pressed="${!S().invisible}"><span aria-hidden="true">🟢</span>Les autres me voient en ligne<b>${S().invisible ? 'Non' : 'Oui'}</b></button>
    <div class="sons">${[['musique', '🎵', 'Musique'], ['effets', '🔊', 'Bruitages']].map(([k, ic, l]) =>
      `<button class="son-b${Son.reglages[k] ? ' on' : ''}" data-act="son-${k}" aria-pressed="${Son.reglages[k]}"><span aria-hidden="true">${ic}</span>${l}<b>${Son.reglages[k] ? 'Oui' : 'Non'}</b></button>`).join('')}</div>
    <button class="btn ghost" data-act="deconnexion">Se déconnecter</button>
    <a class="btn ghost" href="confidentialite.html">Données personnelles</a>
    <a class="btn ghost" href="mentions-legales.html">Mentions légales</a>
    <button class="btn ghost danger" data-act="supprimer">Supprimer mon compte</button>
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}
function supprimerCompte() {
  const p = prompt(`Supprimer définitivement ton compte et tes cartes ?\nPour confirmer, écris ton pseudo : ${S().pseudo}`);
  if (p === null) return;
  if (p.trim() !== S().pseudo) return toast('Pseudo différent : rien n’a été supprimé');
  action(Compte.supprimerCompte(), () => { fermerOverlay(); toast('Ton compte a été supprimé'); });
}

// ── overlays ────────────────────────────────────────────────────────────────────
// ── bouton retour du téléphone (demande de Maël) : il ferme d'abord ce qui est ouvert (fiche, fenêtre, mini-jeu, tuto,
// booster…), du plus récent au plus ancien. Chaque « couche » ouverte ajoute une étape à l'historique ; la fermer depuis le jeu
// la retire (history.back, dont le retour est ignoré).
const COUCHES = [];
let retoursIgnores = 0;
function ouvrirCouche(fermer) { COUCHES.push(fermer); try { history.pushState({mhc: COUCHES.length}, ''); } catch (e) {} }
// passer une couche à une autre sans toucher à l'historique : un history.back() suivi aussitôt d'un pushState embrouille le
// navigateur (l'entrée qu'on vient d'ajouter peut être retirée, la page rechargée au toucher suivant)
function relayerCouche(ancien, nouveau) { const i = COUCHES.lastIndexOf(ancien); if (i < 0) return false; COUCHES[i] = nouveau; return true; }
function quitterCouche(fermer) {
  const i = COUCHES.lastIndexOf(fermer); if (i < 0) return;
  COUCHES.splice(i, 1); retoursIgnores++; history.back();
}
addEventListener('popstate', () => {
  if (retoursIgnores > 0) { retoursIgnores--; return; }
  const f = COUCHES.pop(); if (f) f();
});
const coucheOverlay = () => { SOC.panneau = null; fermerOverlay(true); };
function ouvrirOverlay(html) { const o = $('#overlay'); if (o.hidden) ouvrirCouche(coucheOverlay); o.innerHTML = html; o.hidden = false; document.body.style.overflow = 'hidden'; }
function cacherOverlay(parRetour) { const o = $('#overlay'); if (!parRetour) quitterCouche(coucheOverlay); o.hidden = true; o.innerHTML = ''; document.body.style.overflow = ''; }
function fermerOverlay(parRetour) { cacherOverlay(parRetour); route(true); }
// Bandeau des onglets visible par-dessus la fenêtre des ami(e)s (retour d'un joueur, 20 nov. 2026 : « dans Amis, le bandeau en bas me
// manque, je suis un peu perdu ») : toucher un onglet ferme la fenêtre et ouvre l'onglet ; la place de la fenêtre dans
// l'historique devient cet onglet (un history.back() suivi d'un changement d'adresse se faisait annuler par le retour)
document.addEventListener('click', e => {
  const a = e.target.closest('.tabs a[href^="#"]'), o = $('#overlay');
  if (!a || o.hidden || !o.querySelector('.amis-p')) return;
  e.preventDefault(); SOC.panneau = null;
  const i = COUCHES.lastIndexOf(coucheOverlay);
  if (i >= 0) COUCHES.splice(i, 1);
  cacherOverlay(true);
  try { history.replaceState(null, '', a.getAttribute('href')); } catch (er) { location.hash = a.getAttribute('href'); return; }
  route();
}, true);

// ── ouverture des boosters ──────────────────────────────────────────────────────
// Mise en scène (même esprit que l'intro) : le booster flotte et brille ; au toucher, une découpe lumineuse court le long
// du haut, le rabat est arraché, une bouffée de lumière à la couleur du meilleur palier sort, la carte monte du sachet face
// cachée et vient au centre. Or et Ultime : indices (équipe, poste, palier) avant. On touche la carte pour la retourner,
// puis « Envoyer au club » la fait filer vers l'onglet Club. Booster de départ : les 7 cartes sortent ensemble.
const TEINTE = {bronze: '212 140 88', argent: '195 204 214', or: '227 185 74', ultime: '127 211 78'};
const OB = {};
const moinsAnim = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function ouvrirBooster(promesse, nom, cls, deco) {
  if (occupe) return;
  const avant = new Set(EX().map(e => e.carte)), avantStaff = new Set(staffListe().filter(x => x.meilleur).map(x => x.id));
  action(promesse, ({ids, staff}) => {
    integrerLegendes();
    const res = (ids || []).map(exParId).filter(e => e && PAR_ID[e.carte]).map(e => ({c: vue(e), nouveau: !avant.has(e.carte)}))
      .sort((a, b) => rangEx(a.c.ex, b.c.ex));
    const x = staff && staffDe(staff.id);   // carte staff : même scène, sa carte à elle
    if (x) res.push({c: {id: x.id, nom: x.personne || x.nom, rarete: staff.palier, equipe: 'Staff', staff: true}, staff: x, nouveau: !avantStaff.has(x.id)});
    if (res.length) sceneBooster(res, nom, cls, deco);
  });
}
const dosHTML = w => `<div class="card dos" style="--w:${w}px"><i class="c-eclat"></i><span class="dos-logo"><img src="assets/logo.png" alt=""></span>
  <b class="dos-nom">Médoc<br>Hand Cards</b></div>`;
// une étape d'animation qui se termine tout de suite si on a touché « Tout révéler »
function obAnim(el, frames, o) {
  const a = el.animate(frames, {fill: 'forwards', ...o, duration: OB.vite ? 0 : o.duration, delay: OB.vite ? 0 : o.delay || 0});
  OB.anims.push(a);
  return a.finished.catch(() => {});
}
const obPause = ms => OB.vite ? Promise.resolve() : new Promise(r => { const t = setTimeout(r, ms); OB.attentes.push([t, r]); });
const place = (x, y, s = 1, r = 0) => `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${r}deg) scale(${s})`;

// Démo de l'ouverture (?demo, ?demo=ultime, ?demo=or, ?demo=argent, ?demo=bronze, ?demo=depart) : seulement l'animation,
// avec des cartes du catalogue tirées au hasard ; rien n'est demandé au serveur ni ajouté au club.
function demoBooster(type) {
  const tous = CARTES.filter(c => c.actif !== false), hasard = a => a[Math.floor(Math.random() * a.length)];
  if (!tous.length) return;
  const tirer = () => { const ch = PARAMS.booster_chances || {bronze: 80, argent: 12, or: 7, ultime: 1}; let x = Math.random() * 100;
    for (const r of RARETES) { x -= ch[r] || 0; if (x < 0) return r; } return 'bronze'; };
  if (type === 'legende') { const c = hasard(tous);
    sceneBooster([{c: vueExemplaire({...c, legende: true}, {palier: 'ultime', note: NOTE_LEGENDE}), nouveau: true}], 'Booster', 'pk-gratuit'); OB.demo = type; return; }
  if (type === 'staff') { const l = staffListe(); if (!l.length) return; const x = hasard(l), palier = tirer();   // ?demo=staff : une carte staff
    sceneBooster([{c: {id: x.id, nom: x.personne || x.nom, rarete: palier, equipe: 'Staff', staff: true}, staff: x, nouveau: true}], 'Mystère', 'pk-hasard', {hasard: true});
    OB.demo = type; return; }
  if (type === 'lot') {   // ?demo=lot : 10 boosters mystère (doublons possibles, une carte staff de temps en temps)
    const res = Array.from({length: lotN()}, () => { const l = staffListe(), palier = tirer(), P = PALIER[palier];
      if (l.length && Math.random() < .1) { const x = hasard(l); return {c: {id: x.id, nom: x.personne || x.nom, rarete: palier, equipe: 'Staff', staff: true}, staff: x, nouveau: true}; }
      return {c: vueExemplaire(hasard(tous), {palier, note: P.min + Math.floor(Math.random() * (P.max - P.min + 1))}), nouveau: Math.random() < .5}; });
    sceneLot(res, ...lotDeco('?')); OB.demo = type; return; }
  const n = type === 'depart' ? 7 : 1, pris = new Set(), res = [];
  while (res.length < Math.min(n, tous.length)) {
    const c = hasard(tous); if (pris.has(c.id)) continue; pris.add(c.id);
    const palier = RARETES.includes(type) && !res.length ? type : type === 'depart' ? 'bronze' : tirer(), P = PALIER[palier];
    res.push({c: vueExemplaire(c, {palier, note: P.min + Math.floor(Math.random() * (P.max - P.min + 1))}), nouveau: true});
  }
  res.sort((a, b) => RARETES.indexOf(b.c.rarete) - RARETES.indexOf(a.c.rarete) || b.c.ovr - a.c.ovr);
  const bp = type === 'poste' || type === 'equipe' ? BOOSTERS_EQUIPE[Math.floor(Math.random() * BOOSTERS_EQUIPE.length)] : null;
  if (type === 'hasard') { sceneBooster(res, 'Mystère', 'pk-hasard', {hasard: true}); OB.demo = type; return; }   // ?demo=hasard : booster mystère
  sceneBooster(res, type === 'depart' ? 'Départ' : bp ? bp[0] : 'Booster', type === 'depart' ? 'pk-depart' : bp ? 'pk-poste' : type === 'or' || type === 'ultime' ? 'pk-or' : 'pk-gratuit',
    bp ? {poste: bp[0], photo: photoSachet(bp[1], bp[2])} : {});
  OB.demo = type || 'hasard';
}
function sceneBooster(res, nom, cls, deco = {}) {
  const W = innerWidth, H = innerHeight, n = res.length;
  const pw = Math.round(Math.min(W * .56, H * .33, 240)), ph = pw * 1.45;
  // places finales : la meilleure carte au centre, les autres autour (booster de départ)
  const hw = Math.round(n > 1 ? Math.min(W * .5, H * .3, 220) : Math.min(W * .62, H * .4, 260));
  const ow = Math.round(Math.min(W * .24, H * .145, 140));
  const cy = H * .46, finales = res.map((r, i) => {
    if (!i) return {x: W / 2, y: cy, w: hw, r: 0};
    const a = (-90 + (i - .5) * 360 / (n - 1)) * Math.PI / 180, hh = ow / .69;
    return {x: Math.min(W - ow / 2 - 6, Math.max(ow / 2 + 6, W / 2 + Math.cos(a) * W * .38)),
            y: Math.min(H - hh / 2 - 84, Math.max(hh / 2 + 56, cy + Math.sin(a) * H * .34)), w: ow, r: Math.round(Math.cos(a) * 6)};
  });
  const el = document.createElement('div');
  el.className = 'ob';
  el.style.setProperty('--tc', res[0].c.legende ? '255 226 140' : TEINTE[res[0].c.rarete]);
  el.style.setProperty('--pw', pw + 'px');
  el.innerHTML = `${fondHand()}<div class="ob-lueur"></div><div class="ob-rayons"></div>
    <div class="ob-cartes">${res.map((r, i) => `<div class="ob-c" data-i="${i}" style="width:${finales[i].w}px;height:${finales[i].w / .69}px">
      <div class="ob-flip"><div class="ob-dos">${dosHTML(finales[i].w)}</div>
      <div class="ob-face">${(r.staff ? staffCarteHTML(r.staff, '', r.c.rarete, {nouveau: r.nouveau}) : carteHTML(r.c, {nouveau: r.nouveau})).replace('class="card', `style="--w:${finales[i].w}px" class="card`)}</div></div></div>`).join('')}</div>
    <button class="ob-pack sachet ${cls}${deco.photo ? ' avec-photo' : ''}${deco.hasard ? ' hasard' : ''}"${deco.poste ? ` data-p="${deco.poste}"` : ''} aria-label="Ouvrir le booster ${esc(nom)}">
      ${sachetInterieur({nom, sous: n > 1 ? n + ' joueurs' : deco.hasard ? '1 carte' : '1 joueur', photo: deco.photo, poste: deco.poste, hasard: deco.hasard})}
      <span class="ob-coupe"><i class="ob-trace"></i><i class="ob-etoile"></i></span>
    </button>
    <div class="ob-souffle"></div>
    <p class="ob-aide">Touche le booster pour l’ouvrir</p>
    <div class="ob-indice" hidden></div>
    <button class="ob-passer" hidden>Tout révéler</button>
    <div class="ob-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro'); Son.discret(true); ouvrirCouche(coucheOB);
  Object.assign(OB, {el, res, nom, finales, pw, ph, etape: 'pack', vite: false, anims: [], attentes: [], indice: 0, demo: false, lot: false, zoom: null});
  // dans le sachet : chaque carte, petite, cachée derrière le corps du booster
  const packY = cy, s0 = pw * .8;
  el.querySelectorAll('.ob-c').forEach((c, i) => { c.style.transform = place(W / 2 + (i - (n - 1) / 2) * 2, packY + ph * .07, s0 / finales[i].w); });
  OB.dansSachet = packY + ph * .07;
  el.querySelector('.ob-pack').style.top = packY + 'px';
  el.querySelector('.ob-souffle').style.top = (packY - ph / 2 + ph * .13) + 'px';
  el.querySelector('.ob-pack').addEventListener('click', e => { e.stopPropagation(); dechirerBooster(); });
  el.querySelector('.ob-passer').addEventListener('click', e => { e.stopPropagation(); toutReveler(); });
  el.querySelector('.ob-c[data-i="0"]').addEventListener('click', e => { e.stopPropagation(); toucherHeros(); });
  el.addEventListener('click', () => { if (OB.etape === 'indices') indiceSuivant(); else if (OB.etape === 'retourner') toucherHeros(); });
}

async function dechirerBooster() {
  if (OB.etape !== 'pack') return;
  OB.etape = 'ouverture';
  const {el, res, finales, ph} = OB, $o = q => el.querySelector(q), W = innerWidth;
  if (moinsAnim()) OB.vite = true;
  $o('.ob-aide').classList.add('cache');
  $o('.ob-passer').hidden = false;
  vibrer(15);
  const pack = $o('.ob-pack');
  pack.classList.add('ouvre');
  // 1. le booster se soulève et frissonne
  await obAnim(pack, [{transform: 'translate(-50%, -50%)'}, {transform: 'translate(-50%, -52%) rotate(-1.5deg) scale(1.04)', offset: .45},
    {transform: 'translate(-50%, -52%) rotate(1.2deg) scale(1.04)', offset: .62}, {transform: 'translate(-50%, -52%) rotate(-.8deg) scale(1.04)', offset: .8},
    {transform: 'translate(-50%, -51.5%) rotate(0) scale(1.03)'}], {duration: 520, easing: 'cubic-bezier(.2, .9, .3, 1)'});
  // 2. la découpe : une étoile file le long du pointillé, avec sa traînée et des étincelles
  const coupe = $o('.ob-coupe'), lw = coupe.offsetWidth;
  vibrer(25); Son.jouer('dechire');
  obAnim($o('.ob-etoile'), [{transform: 'translate(-50%, -50%) scale(.6)', opacity: 1}, {transform: `translate(${lw}px, 0) translate(-50%, -50%) scale(1.2)`, opacity: 1}], {duration: 280, easing: 'cubic-bezier(.6, 0, .25, 1)'});
  obAnim($o('.ob-trace'), [{transform: 'scaleX(0)', opacity: 1}, {transform: 'scaleX(1)', opacity: 1}], {duration: 280, easing: 'cubic-bezier(.6, 0, .25, 1)'});
  if (!OB.vite) etincelles(coupe, lw);
  await obPause(280);
  obAnim($o('.ob-etoile'), [{opacity: 1}, {opacity: 0, transform: `translate(${lw}px, 0) translate(-50%, -50%) scale(2.2) rotate(45deg)`}], {duration: 220});
  obAnim($o('.ob-trace'), [{opacity: 1}, {opacity: 0}], {duration: 320});
  // 3. le rabat est arraché, la lumière sort à la couleur du meilleur palier
  vibrer([20, 30, 40]);
  obAnim($o('.ob-bande'), [{transform: 'none', opacity: 1},
    {transform: `perspective(700px) translate(${W * .22}px, ${-ph * .55}px) rotate(28deg) rotateX(-150deg) scale(.94)`, opacity: .9, offset: .7},
    {transform: `perspective(700px) translate(${W * .32}px, ${-ph * .7}px) rotate(36deg) rotateX(-170deg) scale(.9)`, opacity: 0}], {duration: 680, easing: 'cubic-bezier(.3, .6, .4, 1)'});
  el.classList.add('ouvert');
  if (!OB.vite) souffle();
  await obPause(160);
  // 4. les cartes montent du sachet (cachées par le corps du booster), puis viennent à leur place
  const cartes = [...el.querySelectorAll('.ob-c')];
  await Promise.all(cartes.map((c, i) => obAnim(c, [{transform: c.style.transform},
    {transform: place(W / 2 + (i - (cartes.length - 1) / 2) * 2, OB.dansSachet - ph * .88 - i * 3, OB.pw * .8 / finales[i].w)}],
    {duration: 560, delay: i * 40, easing: 'cubic-bezier(.25, .8, .35, 1)'})));   // tout entière sortie du sachet avant de passer devant
  el.classList.add('sorti');   // les cartes passent devant le booster
  Son.jouer('envol');
  obAnim(pack, [{transform: 'translate(-50%, -51.5%) scale(1.03)', opacity: 1}, {transform: 'translate(-50%, -10%) scale(.9)', opacity: 0}], {duration: 520, easing: 'cubic-bezier(.5, 0, .75, .2)'});
  await Promise.all(cartes.map((c, i) => {
    const f = finales[i], d = OB.dansSachet - ph * .88;
    return obAnim(c, [{transform: place(W / 2, d, OB.pw * .8 / f.w)},
      {transform: place((W / 2 + f.x) / 2, Math.min(d, f.y) - 40, (OB.pw * .8 / f.w + 1) / 2, f.r * .5), offset: .55},
      {transform: place(f.x, f.y, 1.045, f.r), offset: .85}, {transform: place(f.x, f.y, 1, f.r)}],
      {duration: 640, delay: (cartes.length - 1 - i) * 70, easing: 'cubic-bezier(.3, .7, .3, 1)'}).then(() => { c.style.transform = place(f.x, f.y, 1, f.r); });
  }));
  if (res[0].c.legende && !OB.vite) return sequenceLegende();   // une légende du club : sa scène à elle
  // 5. les autres cartes se retournent d'elles-mêmes (de la moins bonne à la meilleure), la meilleure attend
  for (const c of cartes.slice(1).reverse()) { retourner(c); await obPause(240); }
  if (RARETES.indexOf(res[0].c.rarete) >= RARETES.indexOf('or') && !OB.vite) { OB.etape = 'indices'; OB.indice = 0; indiceSuivant(); }
  else attendreRetournement();
}

// Légende du club (1 booster gratuit sur 500) : la scène la plus spectaculaire du jeu. Tout s'éteint, un faisceau doré monte,
// des étincelles s'envolent, la carte tourne dans la lumière, les lettres de LÉGENDE tombent une à une et l'écran tremble ;
// éclair blanc, la carte se retourne devant des rayons qui tournent, couronne. Seuls transform et opacity bougent.
async function sequenceLegende() {
  OB.etape = 'legende';
  const {el, finales} = OB, f = finales[0], h = el.querySelector('.ob-c[data-i="0"]'), W = innerWidth, H = innerHeight;
  const scene = document.createElement('div');
  scene.className = 'lg-scene';
  scene.innerHTML = `<i class="lg-noir"></i><i class="lg-faisceau"></i><i class="lg-rayons"></i><div class="lg-part"></div>
    <div class="lg-titre" aria-hidden="true">${[...'LÉGENDE'].map((l, i) => `<span style="--i:${i}">${l}</span>`).join('')}</div>
    <p class="lg-sous">du Médoc Handball</p>`;
  el.querySelector('.ob-cartes').before(scene);
  const flash = document.createElement('i'); flash.className = 'lg-flash'; el.appendChild(flash);
  const part = scene.querySelector('.lg-part');
  for (let i = 0; i < 48; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--d:${(1.8 + Math.random() * 2.4).toFixed(2)}s;--r:${(-Math.random() * 4).toFixed(2)}s;--t:${(2 + Math.random() * 5).toFixed(1)}px;--x:${((Math.random() - .5) * 60).toFixed(0)}px`;
    part.appendChild(p);
  }
  el.classList.add('lg'); el.style.setProperty('--tc', '255 226 140');
  Son.jouer('legende'); vibrer([80, 60, 120]);
  await obPause(60); scene.classList.add('allume');
  await obPause(1100);
  // la carte, encore de dos, monte au centre en tournant dans le faisceau
  const cy = H * .44;
  await obAnim(h, [{transform: place(f.x, f.y, 1, f.r)}, {transform: `${place(W / 2, cy + 30, 1.06, 0)} rotateY(540deg)`, offset: .7},
    {transform: `${place(W / 2, cy, 1.12, 0)} rotateY(720deg)`}], {duration: 1700, easing: 'cubic-bezier(.45, 0, .2, 1)'});
  h.style.transform = place(W / 2, cy, 1.12, 0);
  // les lettres tombent une à une, puis tout tremble
  scene.classList.add('titre');
  for (let i = 0; i < 7; i++) { await obPause(110); vibrer(12); }
  await obPause(260);
  obAnim(el, [{transform: 'none'}, {transform: 'translate(-7px, 4px)'}, {transform: 'translate(6px, -5px)'}, {transform: 'translate(-4px, 3px)'},
    {transform: 'translate(3px, -2px)'}, {transform: 'none'}], {duration: 420, easing: 'linear'});
  vibrer([40, 30, 90]);
  await obPause(650);
  // éclair blanc, la carte se retourne
  obAnim(flash, [{opacity: 0}, {opacity: 1, offset: .12}, {opacity: 0}], {duration: 900, easing: 'ease-out'});
  await obPause(110);
  scene.classList.add('revele'); el.classList.add('t-haut', 'eclair');
  retourner(h); Son.jouer('revele-ultime'); vibrer([60, 40, 140]);
  OB.etape = 'fini';
  finBooster();
}
function etincelles(coupe, lw) {
  for (let i = 0; i < 16; i++) {
    const t = document.createElement('i'); t.className = 'ob-etincelle'; t.style.left = (lw * i / 15) + 'px'; coupe.appendChild(t);
    const dx = (Math.random() - .5) * 60, dy = 20 + Math.random() * 70;
    t.animate([{transform: 'translate(0, 0) scale(1)', opacity: 0}, {opacity: 1, offset: .15}, {transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0}],
      {duration: 520 + Math.random() * 300, delay: i * 16, easing: 'cubic-bezier(.2, .6, .4, 1)', fill: 'forwards'}).finished.then(() => t.remove());
  }
}
function souffle() {
  Son.jouer('souffle');
  const s = OB.el.querySelector('.ob-souffle');
  const anneau = document.createElement('i'); anneau.className = 'ob-anneau'; s.appendChild(anneau);
  anneau.animate([{transform: 'translate(-50%, -50%) scale(.1)', opacity: 1}, {transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0}], {duration: 700, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'forwards'});
  for (let i = 0; i < 12; i++) {
    const r = document.createElement('i'); r.className = 'ob-rai'; s.appendChild(r);
    const a = -170 + i * (160 / 11) + (Math.random() - .5) * 8, l = 50 + Math.random() * 60;
    r.animate([{transform: `rotate(${a + 90}deg) translateY(0) scaleY(.2)`, opacity: 1}, {transform: `rotate(${a + 90}deg) translateY(${-l}px) scaleY(1)`, opacity: 0}],
      {duration: 560 + Math.random() * 200, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'forwards'});
  }
  setTimeout(() => s.replaceChildren(), 1000);
}
function attendreRetournement() {
  if (OB.vite) return toucherHeros();
  OB.etape = 'retourner';
  OB.el.querySelector('.ob-c[data-i="0"]').classList.add('attente');
  const a = OB.el.querySelector('.ob-aide'); a.textContent = 'Touche la carte pour la retourner'; a.classList.remove('cache'); a.classList.add('bas');
}
// Or et Ultime : équipe → poste → palier, au-dessus de la carte encore cachée
function indiceSuivant() {
  const c = OB.res[0].c, box = OB.el.querySelector('.ob-indice');
  const etapes = c.staff ? [['Carte', 'Staff'], ['Poste', OB.res[0].staff.nom], ['Palier', R_LABEL[c.rarete]]]
    : [['Équipe', libelleEquipes(c)], ['Poste', posteAffiche(c)], ['Palier', R_LABEL[c.rarete]]];
  if (OB.indice >= etapes.length) { box.hidden = true; return attendreRetournement(); }
  const [l, v] = etapes[OB.indice++];
  box.hidden = false;
  box.innerHTML = `<div class="ob-ind${OB.indice === 3 ? ' t-' + c.rarete : ''}"><small>${l}</small>${esc(v)}</div>`;
  const aide = OB.el.querySelector('.ob-aide'); aide.textContent = 'Touche pour continuer'; aide.classList.remove('cache'); aide.classList.add('bas');
  OB.el.querySelector('.ob-c[data-i="0"]').classList.add('attente');
  if (OB.indice === 3) OB.el.classList.add('t-haut');
  vibrer(20);
}
function retourner(c) { c.classList.add('vu'); if (c.dataset.i !== '0') Son.jouer('retourne'); }
function toucherHeros() {
  if (!['retourner', 'indices'].includes(OB.etape) && !OB.vite) return;
  if (OB.etape === 'indices') { OB.el.querySelector('.ob-indice').hidden = true; }
  OB.etape = 'fini';
  const h = OB.el.querySelector('.ob-c[data-i="0"]'), aide = OB.el.querySelector('.ob-aide');
  aide.classList.add('cache');
  h.classList.remove('attente');
  retourner(h);
  if (RARETES.indexOf(OB.res[0].c.rarete) >= RARETES.indexOf('or')) OB.el.classList.add('t-haut');
  Son.jouer('revele-' + ({elite: 'ultime'}[OB.res[0].c.rarete] || OB.res[0].c.rarete));
  vibrer(RARETES.indexOf(OB.res[0].c.rarete) >= RARETES.indexOf('or') ? [40, 60, 80] : 30);
  if (!OB.vite) {   // éclair et onde à la couleur du palier
    const s = OB.el.querySelector('.ob-souffle'), f = OB.finales[0];
    s.style.top = f.y + 'px';
    const o = document.createElement('i'); o.className = 'ob-anneau grand'; s.appendChild(o);
    o.animate([{transform: 'translate(-50%, -50%) scale(.3)', opacity: .9}, {transform: 'translate(-50%, -50%) scale(3)', opacity: 0}], {duration: 800, delay: 220, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'both'});
    OB.el.classList.add('eclair');
  }
  finBooster();
}
function finBooster() {
  OB.el.querySelector('.ob-passer').hidden = true;
  const {res} = OB, n = PARAMS.fusion_nombre || 3, h = res[0];
  const memes = h.staff ? staffDe(h.c.id)?.exemplaires?.[h.c.rarete] || 0 : EX().filter(e => e.carte === h.c.id && e.palier === h.c.rarete).length;
  const nv = res.filter(r => r.nouveau).length;
  const info = res.length > 1 ? (nv ? `${nv} nouveau${nv > 1 ? 'x' : ''} joueur${nv > 1 ? 's' : ''}` : 'Déjà dans ton club')
    : h.nouveau ? `Nouveau : ${esc(h.c.nom)} rejoint ton ${h.staff ? 'staff' : 'club'}` : memes >= n && palierSuivant(h.c.rarete) ? 'Fusion possible !' : `${memes}/${n} pour fusionner`;
  OB.el.querySelector('.ob-bas').innerHTML = OB.demo ? `<p class="ob-info">Démo : rien n’est ajouté à ton club</p><button class="btn gold large ob-fin">Rejouer</button>`
    : `<p class="ob-info">${info}</p><button class="btn gold large ob-fin">Envoyer au club</button>`;
  OB.el.querySelector('.ob-fin').addEventListener('click', e => { e.stopPropagation(); if (OB.demo) { quitterCouche(coucheOB); OB.el.remove(); demoBooster(OB.demo); } else envoyerAuClub(); });
  OB.el.querySelector('.ob-bas').animate([{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'none'}], {duration: OB.vite ? 0 : 400, delay: OB.vite ? 0 : 500, fill: 'both'});
}
function toutReveler() {
  OB.vite = true;
  OB.anims.forEach(a => { try { a.finish(); } catch (e) {} });
  OB.attentes.forEach(([t, r]) => { clearTimeout(t); r(); });
  if (OB.lot) { OB.tout = true; return lotTout(); }   // 10 boosters : tout s'ouvre et se retourne
  if (['indices', 'retourner'].includes(OB.etape)) toucherHeros();
}
// retour pendant l'ouverture d'un booster : d'abord tout révéler, puis (une fois tout montré) envoyer au club
function coucheOB() {
  if (!OB.el) return;
  if (OB.lot && OB.zoom) { lotZoom(null); return ouvrirCouche(coucheOB); }   // d'abord la carte vue en grand
  if (OB.el.querySelector('.ob-fin')) { OB.parRetour = true; return envoyerAuClub(); }
  toutReveler(); ouvrirCouche(coucheOB);
}
function envoyerAuClub() {
  document.body.classList.remove('lot-ouvert');   // l'accueil réapparaît derrière le fondu
  if (!OB.parRetour) quitterCouche(coucheOB); OB.parRetour = false;
  const el = OB.el, cible = document.querySelector('.tabs:not([hidden]) a[data-tab="club"]')?.getBoundingClientRect();
  const tx = cible ? cible.left + cible.width / 2 : innerWidth / 2, ty = cible ? cible.top + cible.height / 2 : innerHeight + 80;
  const fin = () => { el.remove(); document.body.classList.remove('avec-intro'); route(true);
    document.querySelector('.tabs a[data-tab="club"]')?.animate([{transform: 'scale(1)'}, {transform: 'scale(1.25)'}, {transform: 'scale(1)'}], {duration: 380}); };
  el.querySelector('.ob-bas').style.visibility = 'hidden';
  Son.jouer('envol'); Son.discret(false);
  if (moinsAnim()) { el.animate([{opacity: 1}, {opacity: 0}], {duration: 200, fill: 'forwards'}).onfinish = fin; return; }
  const cartes = [...el.querySelectorAll('.ob-c')];
  cartes.forEach((c, i) => c.animate([{transform: c.style.transform, opacity: 1}, {transform: place(tx, ty, .08, 0), opacity: .3}],
    {duration: 620, delay: i * 45, easing: 'cubic-bezier(.5, 0, .75, .2)', fill: 'forwards'}));
  el.animate([{opacity: 1}, {opacity: 1, offset: .55}, {opacity: 0}],
    {duration: 620 + cartes.length * 45, fill: 'forwards'}).onfinish = fin;
  vibrer(20);
}
// ── 10 boosters d'un coup (demande de Maël) ─────────────────────────────────────────
// Une scène à elle : les 10 sachets en éventail ; au toucher ils filent chacun à leur place, frissonnent, sont découpés et
// arrachés tous ensemble dans un éclair, et laissent 10 cartes de dos. On retourne chaque carte en la touchant (onde et
// étincelles à la couleur du palier, éclair et rayons pour Or et Ultime), une carte retournée se regarde en grand.
// Mémoire graphique (bug vu sur Android à « Tout retourner » : des trous dans l'écran, l'accueil visible au travers) : les cartes
// sont dessinées à leur taille dans la grille (agrandies seulement pour la vue en grand), sans ombre floutée ; l'accueil est
// caché dessous (body.lot-ouvert) ; seuls transform et opacity bougent.
const lotN = () => PARAMS.booster_lot ?? 10;
const lotPrix = eq => carPrix(eq) * lotN();
const lotPossible = eq => S().pieces >= lotPrix(eq) && (eq === '?' || nbEquipe(eq) > 0);
const lotTexte = eq => `${lotN()} boosters · ${nb(lotPrix(eq))} pièces`;
const lotDeco = eq => { const bp = BOOSTERS_EQUIPE.find(x => x[0] === eq);
  return eq === '?' ? ['Mystère', 'pk-hasard', {hasard: true}] : [eq, 'pk-poste', {poste: eq, photo: bp && photoSachet(bp[1], bp[2])}]; };
const melanger = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function acheterLot(eq) {
  if (occupe || !lotPossible(eq)) return;
  const n = lotN();
  demander(`Acheter ${n} ${eq === '?' ? 'boosters mystère' : 'boosters ' + (NOM_EQUIPE[eq] || eq)} pour ${nb(lotPrix(eq))} pièces ?`, 'Acheter')
    .then(oui => { if (oui && !occupe && lotPossible(eq)) acheterLotOui(eq); });
}
function acheterLotOui(eq) {
  const avant = new Set(EX().map(e => e.carte)), avantStaff = new Set(staffListe().filter(x => x.meilleur).map(x => x.id));
  action(Compte.ouvrirBoostersLot(eq), ({ids, staffs}) => {
    integrerLegendes();   // une légende du club (booster mystère, 1 sur 500) : absente du catalogue tant qu'on ne l'a pas
    // « nouveau » seulement sur le premier exemplaire d'un joueur qu'on n'avait pas
    const res = (ids || []).map(exParId).filter(e => e && PAR_ID[e.carte]).map(e => ({c: vue(e), nouveau: !avant.has(e.carte) && !!avant.add(e.carte)}));
    for (const st of staffs || []) { const x = staffDe(st.id);
      if (x) res.push({c: {id: x.id, nom: x.personne || x.nom, rarete: st.palier, equipe: 'Staff', staff: true}, staff: x, nouveau: !avantStaff.has(x.id) && !!avantStaff.add(x.id)}); }
    if (res.length) sceneLot(melanger(res), ...lotDeco(eq));
  });
}
// répartition des cartes en r rangs, les plus fournis au milieu (10 cartes en 4 rangs : 2, 3, 3, 2)
function rangsLot(n, r) {
  const base = Math.floor(n / r), t = Array(r).fill(base);
  const ordre = [...t.keys()].sort((a, b) => Math.abs(a - (r - 1) / 2) - Math.abs(b - (r - 1) / 2));
  for (let k = 0; k < n - base * r; k++) t[ordre[k]]++;
  return t;
}
function sceneLot(res, nom, cls, deco = {}) {
  const W = innerWidth, H = innerHeight, n = res.length, large = W > H * 1.1;
  // la grille qui donne les plus grandes cartes (téléphone : 2, 3, 3, 2 ; écran large : 5 et 5)
  const g = 10, haut = 62, bas = H - 150;
  const largeur = r => { const cols = Math.ceil(n / r); return Math.min((W - 24 - (cols - 1) * g) / cols, ((bas - haut) - (r - 1) * g) / r * .69, 170); };
  const nr = Array.from({length: n}, (_, k) => k + 1).reduce((m, r) => largeur(r) > largeur(m) + .5 ? r : m, 1);
  const rangs = rangsLot(n, nr), w = Math.floor(largeur(nr)), h = w / .69;
  const hw = Math.round(Math.min(W * .64, H * .42, 260));   // largeur de la carte vue en grand
  const y0 = haut + ((bas - haut) - (rangs.length * h + (rangs.length - 1) * g)) / 2 + h / 2, finales = [];
  rangs.forEach((m, k) => { for (let j = 0; j < m; j++) finales.push({x: W / 2 + (j - (m - 1) / 2) * (w + g), y: y0 + k * (h + g), w, s: 1, r: 0}); });
  // l'éventail du départ : les sachets en arc, comme une main de cartes
  // (rayon = 2 sachets : chacun montre une bande de son voisin ; la taille est choisie pour que l'éventail tienne dans l'écran)
  const pw = Math.round(w * .98), amax = (large ? 28 : 32) * Math.PI / 180, kR = 2;
  const S0 = Math.min(pw * 1.5, (W - 20) / (2 * Math.sin(amax) * kR + Math.cos(amax) + 1.45 * Math.sin(amax)), H * .2), es = S0 / pw, R = S0 * kR;
  const ey = H * .47;
  const eventail = i => { const a = (n > 1 ? i / (n - 1) - .5 : 0) * 2 * amax; return place(W / 2 + Math.sin(a) * R, ey + (1 - Math.cos(a)) * R, es, a * 180 / Math.PI); };
  const el = document.createElement('div');
  el.className = 'ob ob-lot';
  el.style.setProperty('--pw', pw + 'px');
  el.innerHTML = `${fondHand()}<div class="ob-lueur"></div><div class="ob-rayons"></div>
    <div class="lot-titre"><b>×${n}</b><span>${deco.hasard ? 'Boosters mystère' : 'Boosters ' + esc(nom)}</span></div>
    <div class="ob-cartes"><i class="lot-voile"></i>${res.map((r, i) => `<div class="ob-c lot-c" data-i="${i}" style="width:${w}px;height:${w / .69}px;--tc:${TEINTE[r.c.rarete]};--i:${i}">
      <i class="lot-aura"></i><div class="lot-f"><div class="ob-flip"><div class="ob-dos">${dosHTML(w)}</div>
      <div class="ob-face">${(r.staff ? staffCarteHTML(r.staff, '', r.c.rarete, {nouveau: r.nouveau}) : carteHTML(r.c, {nouveau: r.nouveau})).replace('class="card', `style="--w:${w}px" class="card`)}</div></div></div></div>`).join('')}</div>
    <div class="lot-packs">${res.map((r, i) => `<div class="lot-p" style="--i:${i}">${sachetHTML({theme: cls, nom, sous: deco.hasard ? '1 carte' : '1 joueur', photo: deco.photo, poste: deco.poste, pw, hasard: deco.hasard})}
      <span class="ob-coupe"><i class="ob-trace"></i><i class="ob-etoile"></i></span></div>`).join('')}</div>
    <i class="lot-flash"></i>
    <p class="ob-aide">Touche pour ouvrir les ${n} boosters</p>
    <span class="lot-compte" hidden></span>
    <button class="ob-passer" hidden>Tout retourner</button>
    <div class="ob-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro', 'lot-ouvert'); Son.discret(true); ouvrirCouche(coucheOB);
  Object.assign(OB, {el, res, nom, finales, pw, ph: pw * 1.45, zoomS: hw / w, etape: 'pack', vite: false, anims: [], attentes: [], indice: 0, demo: false,
    lot: true, tout: false, zoom: null, meilleur: -1, enVague: false});
  el.querySelectorAll('.lot-p').forEach((p, i) => { p.style.transform = eventail(i); });
  el.querySelectorAll('.ob-c').forEach((c, i) => { const f = finales[i]; c.style.transform = place(f.x, f.y, f.s * .8); });   // cachée derrière son sachet
  el.querySelector('.ob-passer').addEventListener('click', e => { e.stopPropagation(); lotTout(); });
  el.addEventListener('click', e => {
    if (OB.etape === 'pack') return ouvrirLot();
    if (OB.zoom) return lotZoom(null);
    const c = e.target.closest('.ob-c');
    if (!c || !['retourner', 'fini'].includes(OB.etape)) return;
    if (c.classList.contains('vu')) lotZoom(c); else lotRetourner(c);
  });
}
// déplace une carte : sa place est écrite tout de suite, l'animation ne fait que l'y amener
function lotVers(c, t, o = {}) {
  const de = c.style.transform; c.style.transform = t;
  if (OB.vite && !o.toujours) return Promise.resolve();
  const a = c.animate([{transform: de}, ...(o.via ? [{transform: o.via, offset: o.a ?? .6}] : []), {transform: t}],
    {duration: o.duree || 400, delay: o.delai || 0, easing: o.courbe || 'cubic-bezier(.3, .7, .3, 1)', fill: 'backwards'});
  OB.anims.push(a);
  return a.finished.catch(() => {});
}
async function ouvrirLot() {
  if (OB.etape !== 'pack') return;
  OB.etape = 'ouverture';
  const {el, finales, pw, ph} = OB, packs = [...el.querySelectorAll('.lot-p')], cartes = [...el.querySelectorAll('.ob-c')], n = packs.length;
  if (moinsAnim()) OB.vite = true;
  el.querySelector('.ob-aide').classList.add('cache');
  el.classList.add('part');
  vibrer(15); Son.jouer('envol');
  // 1. l'éventail s'ouvre : chaque sachet file à sa place
  await Promise.all(packs.map((p, i) => { const f = finales[i];
    return lotVers(p, place(f.x, f.y), {via: place(f.x, f.y - 16, 1.08, (i % 2 ? 3 : -3)), a: .78, duree: 560, delai: i * 38}); }));
  el.classList.add('range');   // les cartes attendent derrière les sachets
  // 2. tous frissonnent, puis une étoile découpe le haut de chacun
  packs.forEach((p, i) => obAnim(p.querySelector('.sachet'), [{transform: 'none'}, {transform: 'rotate(-2.5deg) scale(1.05)', offset: .3}, {transform: 'rotate(2deg) scale(1.05)', offset: .55},
    {transform: 'rotate(-1.2deg) scale(1.05)', offset: .8}, {transform: 'scale(1.04)'}], {duration: 460, delay: i * 14, easing: 'cubic-bezier(.2, .9, .3, 1)'}));
  await obPause(430);
  vibrer(25); Son.jouer('dechire');
  const lw = packs[0].querySelector('.ob-coupe').offsetWidth;
  packs.forEach(p => {
    obAnim(p.querySelector('.ob-etoile'), [{transform: 'translate(-50%, -50%) scale(.6)', opacity: 1}, {transform: `translate(${lw}px, 0) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: .8},
      {transform: `translate(${lw}px, 0) translate(-50%, -50%) scale(2) rotate(45deg)`, opacity: 0}], {duration: 360, easing: 'cubic-bezier(.6, 0, .25, 1)'});
    obAnim(p.querySelector('.ob-trace'), [{transform: 'scaleX(0)', opacity: 1}, {transform: 'scaleX(1)', opacity: 1, offset: .75}, {transform: 'scaleX(1)', opacity: 0}], {duration: 420, easing: 'cubic-bezier(.6, 0, .25, 1)'});
  });
  await obPause(300);
  // 3. les rabats sont arrachés tous ensemble, dans un éclair
  vibrer([20, 30, 60]); Son.jouer('souffle');
  packs.forEach((p, i) => { const dx = (Math.random() - .5) * pw * 1.6;
    obAnim(p.querySelector('.ob-bande'), [{transform: 'none', opacity: 1}, {transform: `translate(${dx * .7}px, ${-ph * .5}px) rotate(${dx > 0 ? 30 : -30}deg) scale(.95)`, opacity: .9, offset: .7},
      {transform: `translate(${dx}px, ${-ph * .68}px) rotate(${dx > 0 ? 44 : -44}deg) scale(.9)`, opacity: 0}], {duration: 600, delay: i * 12, easing: 'cubic-bezier(.3, .6, .4, 1)'});
    if (!OB.vite) lotOnde(finales[i].x, finales[i].y - ph * .37, pw, TEINTE.or, 1.5, 520, i * 12); });
  el.classList.add('ouvert');
  obAnim(el.querySelector('.lot-flash'), [{opacity: 0}, {opacity: .9, offset: .18}, {opacity: 0}], {duration: 700, easing: 'ease-out'});
  await obPause(200);
  // 4. les sachets tombent, les cartes surgissent
  el.classList.add('sorti');
  packs.forEach((p, i) => { const f = finales[i];
    obAnim(p, [{transform: place(f.x, f.y), opacity: 1}, {transform: place(f.x, f.y + ph * .5, .88, i % 2 ? 9 : -9), opacity: 0}], {duration: 460, delay: i * 22, easing: 'cubic-bezier(.5, 0, .75, .2)'}); });
  await Promise.all(cartes.map((c, i) => { const f = finales[i];
    return lotVers(c, place(f.x, f.y, f.s), {via: place(f.x, f.y - 6, f.s * 1.1), a: .6, duree: 520, delai: i * 22, courbe: 'cubic-bezier(.25, .9, .35, 1)'}); }));
  el.querySelector('.lot-packs').remove();
  // 5. à toi : chaque carte se retourne quand on la touche
  OB.etape = 'retourner';
  cartes.forEach(c => c.classList.add('attente'));
  const aide = el.querySelector('.ob-aide'); aide.textContent = 'Touche les cartes pour les retourner'; aide.classList.remove('cache'); aide.classList.add('bas');
  el.querySelector('.ob-passer').hidden = false;
  lotCompte();
  if (OB.tout) lotTout();
}
function lotOnde(x, y, d, teinte, taille, duree, delai = 0) {
  const o = document.createElement('i'); o.className = 'lot-onde'; o.style.cssText = `--tc:${teinte};--d:${Math.round(d)}px`; OB.el.appendChild(o);
  o.animate([{transform: place(x, y, .4), opacity: .95}, {transform: place(x, y, taille), opacity: 0}], {duration: duree, delay: delai, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'both'}).finished
    .then(() => o.remove(), () => o.remove());
}
function lotCompte() {
  const {el, res} = OB, vus = el.querySelectorAll('.ob-c.vu').length, c = el.querySelector('.lot-compte');
  c.hidden = false; c.textContent = `${vus} / ${res.length}`;
  return vus;
}
function lotRetourner(c, enMasse) {
  if (c.classList.contains('vu') || OB.etape !== 'retourner') return;
  const {el, res, finales} = OB, i = +c.dataset.i, f = finales[i], r = res[i].c.rarete, k = Math.max(0, RARETES.indexOf(r)), d = f.w * f.s;
  c.classList.remove('attente'); c.classList.add('vu', 't-' + r);
  Son.jouer('retourne');
  const leg = !!res[i].c.legende;   // une légende du club : son à elle, et l'écran tremble même pendant « Tout retourner »
  if (!enMasse) { Son.jouer(leg ? 'legende' : 'revele-' + r); vibrer(leg ? [60, 40, 60, 40, 120] : k >= 2 ? [40, 60, 80] : 20); }
  else if (leg) Son.jouer('legende');
  if (k > OB.meilleur) { OB.meilleur = k; el.style.setProperty('--tc', TEINTE[r]); }   // le fond prend la couleur de la meilleure carte vue
  if (!OB.vite) {
    lotVers(c, place(f.x, f.y, f.s), {via: place(f.x, f.y - 8, f.s * (1.1 + k * .03)), a: .45, duree: 620});
    if (!enMasse || k) lotOnde(f.x, f.y, d, TEINTE[r], 1.7 + k * .5, 600 + k * 100, 240);
    for (let j = 0; j < (enMasse ? 0 : [0, 8, 16, 26][k]); j++) {   // « Tout retourner » : pas d'étincelles (10 cartes en 1 s)   // étincelles : plus le palier est haut, plus il y en a
      const p = document.createElement('i'); p.className = 'lot-etin'; p.style.setProperty('--tc', TEINTE[r]); el.appendChild(p);
      const a = Math.random() * 6.283, l = d * (.55 + Math.random() * (.7 + k * .25));
      p.animate([{transform: `translate(${f.x}px, ${f.y}px) scale(1)`, opacity: 0}, {opacity: 1, offset: .15},
        {transform: `translate(${f.x + Math.cos(a) * l}px, ${f.y + Math.sin(a) * l}px) scale(.2)`, opacity: 0}],
        {duration: 600 + Math.random() * 400, delay: 260 + Math.random() * 120, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'both'}).finished.then(() => p.remove(), () => p.remove());
    }
    if (k >= 2) {   // Or et Ultime : éclair à leur couleur, rayons, et l'écran tremble pour un Ultime
      el.classList.add('t-haut');
      el.querySelector('.lot-flash').animate([{opacity: 0}, {opacity: k > 2 ? .75 : .45, offset: .2}, {opacity: 0}], {duration: 800, delay: 230, easing: 'ease-out'});
      if (k > 2 && (!enMasse || leg)) el.animate([{transform: 'none'}, {transform: 'translate(-6px, 3px)'}, {transform: 'translate(5px, -4px)'}, {transform: 'translate(-3px, 2px)'}, {transform: 'none'}],
        {duration: 380, delay: 260, easing: 'linear'});
    }
  } else if (k >= 2) el.classList.add('t-haut');
  if (lotCompte() === res.length) finLot();
}
// « Tout retourner » : les cartes qui restent se retournent en vague, la meilleure donne le son de la fin
async function lotTout() {
  if (OB.etape !== 'retourner' || OB.enVague) return;
  OB.enVague = true;
  const {el, res} = OB, reste = [...el.querySelectorAll('.ob-c:not(.vu)')];
  const mieux = Math.max(-1, ...reste.map(c => RARETES.indexOf(res[+c.dataset.i].c.rarete)));
  el.querySelector('.ob-passer').hidden = true;
  for (const c of reste) { lotRetourner(c, true); await obPause(75); }
  OB.enVague = false;
  if (mieux >= 0) { Son.jouer('revele-' + RARETES[mieux]); vibrer(mieux >= 2 ? [40, 60, 80] : 20); }
}
// une carte retournée se regarde en grand ; un toucher la renvoie à sa place
function lotZoom(c) {
  const {el, finales} = OB, z = OB.zoom;
  if (z) { const f = finales[+z.dataset.i]; OB.zoom = null; el.classList.remove('zoom');
    lotVers(z, place(f.x, f.y, f.s), {duree: 260, toujours: !moinsAnim()}).then(() => { if (OB.zoom !== z) z.classList.remove('grand'); }); }
  if (!c || c === z) return;
  OB.zoom = c; c.classList.add('grand'); el.classList.add('zoom'); Son.jouer('retourne');
  lotVers(c, place(innerWidth / 2, innerHeight * .45, OB.zoomS), {duree: 320, courbe: 'cubic-bezier(.25, .9, .35, 1)', toujours: !moinsAnim()});
}
function finLot() {
  OB.etape = 'fini';
  const {el, res} = OB, nv = res.filter(r => r.nouveau).length;
  el.querySelector('.ob-passer').hidden = true; el.querySelector('.lot-compte').hidden = true; el.querySelector('.ob-aide').classList.add('cache');
  const beaux = ['ultime', 'or', 'argent'].map(r => [res.filter(x => x.c.rarete === r).length, R_LABEL[r]]).filter(x => x[0]).map(x => x.join(' '));
  const info = [nv ? `${nv} nouveau${nv > 1 ? 'x' : ''}` : 'Rien de nouveau', ...beaux].join(' · ');
  el.querySelector('.ob-bas').innerHTML = `<p class="ob-info">${info}</p><small class="lot-astuce">Touche une carte pour la voir en grand</small>
    <button class="btn gold large ob-fin">${OB.demo ? 'Rejouer' : 'Envoyer au club'}</button>`;
  el.querySelector('.ob-fin').addEventListener('click', e => { e.stopPropagation(); if (OB.demo) { quitterCouche(coucheOB); OB.el.remove(); demoBooster(OB.demo); } else envoyerAuClub(); });
  el.querySelector('.ob-bas').animate([{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'none'}], {duration: OB.vite ? 0 : 400, delay: OB.vite ? 0 : 700, fill: 'both'});
}
// Démo de la montée de palier (?demo=montee) : un joueur du catalogue au hasard, d'un palier au suivant ; rien au serveur
function demoMontee() {
  const tous = CARTES.filter(c => c.actif !== false); if (!tous.length) return;
  const c = tous[Math.floor(Math.random() * tous.length)], r = RARETES[Math.floor(Math.random() * 3)];
  montee(vueExemplaire(c, {palier: r, note: PALIER[r].max}), vueExemplaire(c, {palier: palierSuivant(r), note: PALIER[palierSuivant(r)].min}));
}
function vibrer(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

// Montée de palier (fusion) : les 3 cartes se rejoignent dans un éclair, la carte se retourne au nouveau palier
// (couleur, cadre, photo du palier) et sa note et ses 6 stats montent sous nos yeux.
// suite : ce qu'on rouvre après (la fiche du joueur, après une fusion) ; relais : la couche de la fenêtre d'où l'on vient, que
// l'animation reprend dans l'historique puis rend à la fiche (pas d'aller-retour dans l'historique)
function montee(avant, apres, suite, relais) {
  const W = Math.round(Math.min(innerWidth * .62, innerHeight * .4, 260)), w3 = Math.round(W * .52);
  const el = document.createElement('div');
  el.className = 'montee'; el.style.setProperty('--tc', TEINTE[apres.rarete]); el.style.setProperty('--ta', TEINTE[avant.rarete]);
  const dos = carteHTML(avant).replace('class="card', `style="--w:${w3}px" class="card`);
  el.innerHTML = `${fondHand()}<div class="mt-rayons"></div>
    <div class="mt-trois">${[0, 1, 2].map(i => `<div class="mt-c" data-i="${i}">${dos}</div>`).join('')}</div>
    <div class="mt-carte"><div class="mt-flip"><div class="mt-face a">${carteHTML(avant).replace('class="card', `style="--w:${W}px" class="card`)}</div>
      <div class="mt-face b">${carteHTML(apres).replace('class="card', `style="--w:${W}px" class="card`)}</div></div></div>
    <div class="mt-titre"><small>Fusion</small><b><span class="t-${avant.rarete}">${R_LABEL[avant.rarete]}</span> → <span class="t-${apres.rarete}">${R_LABEL[apres.rarete]}</span></b></div>
    <div class="mt-bas"><p>${esc(apres.nom)} passe ${R_LABEL[apres.rarete]} ${apres.ovr}</p><button class="btn gold large">${suite ? 'Continuer' : 'Envoyer au club'}</button></div>`;
  document.body.appendChild(el); document.body.classList.add('avec-intro');
  const q = x => el.querySelector(x), vite = moinsAnim();
  const anim = (x, f, o) => x.animate(f, {fill: 'forwards', ...o, duration: vite ? 0 : o.duration, delay: vite ? 0 : o.delay || 0}).finished.catch(() => {});
  const coucheM = () => fin(true);
  const fin = parRetour => {
    el.remove(); document.body.classList.remove('avec-intro'); Son.discret(false); route(true);
    if (parRetour) return;   // le retour du téléphone pendant l'animation : on la quitte, sans rouvrir la fiche
    if (suite && relayerCouche(coucheM, coucheOverlay)) { $('#overlay').hidden = false; return suite(); }   // la fiche reprend la place
    quitterCouche(coucheM); if (suite) suite();
  };
  if (!(relais && relayerCouche(relais, coucheM))) ouvrirCouche(coucheM);
  q('.mt-bas button').addEventListener('click', () => fin());
  (async () => {
    // 1. les trois cartes arrivent, puis se rejoignent au centre
    const cs = [...el.querySelectorAll('.mt-c')];
    Son.discret(true); Son.jouer('fusion');
    await Promise.all(cs.map((c, i) => anim(c, [{transform: `translate(${(i - 1) * 120}%, 60%) rotate(${(i - 1) * 12}deg) scale(.6)`, opacity: 0},
      {transform: `translate(${(i - 1) * 105}%, 0) rotate(${(i - 1) * 8}deg)`, opacity: 1}], {duration: 450, delay: i * 90, easing: 'cubic-bezier(.2, .8, .3, 1)'})));
    vibrer(20);
    await Promise.all(cs.map((c, i) => anim(c, [{transform: `translate(${(i - 1) * 105}%, 0) rotate(${(i - 1) * 8}deg)`}, {transform: `translate(${(i - 1) * 108}%, 2%) rotate(${(i - 1) * 9}deg)`, offset: .25},
      {transform: 'translate(0, 0) rotate(0) scale(1.05)', opacity: 1, offset: .9}, {transform: 'scale(1.6)', opacity: 0}], {duration: 650, delay: 150, easing: 'cubic-bezier(.6, 0, .4, 1)'})));
    // 2. éclair, la carte apparaît (ancien palier) puis se retourne au nouveau
    el.classList.add('eclair'); vibrer([30, 40, 60]);
    q('.mt-carte').style.opacity = 1;
    await anim(q('.mt-carte'), [{transform: 'scale(.6)', opacity: 0}, {transform: 'scale(1.08)', opacity: 1, offset: .6}, {transform: 'scale(1)', opacity: 1}], {duration: 420, easing: 'cubic-bezier(.2, 1.3, .4, 1)'});
    await anim(q('.mt-carte'), [{transform: 'rotate(0)'}, {transform: 'rotate(-2deg)'}, {transform: 'rotate(2deg)'}, {transform: 'rotate(0)'}], {duration: 360, delay: 120});
    el.classList.add('retourne'); Son.jouer('montee');
    await new Promise(r => setTimeout(r, vite ? 0 : 520));
    el.classList.add('haut'); vibrer([40, 60, 80]);
    anim(q('.mt-titre'), [{opacity: 0, transform: 'translateY(-14px) scale(.8)'}, {opacity: 1, transform: 'none'}], {duration: 420, easing: 'cubic-bezier(.2, 1.4, .4, 1)'});
    // 3. la note et les 6 stats montent, du palier d'avant au nouveau
    const b = q('.mt-face.b'), vals = [[b.querySelector('.c-ovr'), avant.ovr, apres.ovr],
      ...statsDu(apres.poste).map(([k], i) => [b.querySelectorAll('.c-stats b')[i], avant.s[k], apres.s[k]])];
    vals.forEach(([x, v0]) => { if (x) x.textContent = v0; });
    const t0 = performance.now(), D = vite ? 1 : 1100;
    await new Promise(res => { const pas = now => { const u = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - u, 3);
      vals.forEach(([x, v0, v1]) => { if (!x) return; const v = Math.round(v0 + (v1 - v0) * e); if (x.textContent !== String(v)) { x.textContent = v; if (v1 > v0) x.classList.add('monte'); } });
      if (u < 1) requestAnimationFrame(pas); else res(); }; requestAnimationFrame(pas); });
    b.querySelectorAll('.monte').forEach(x => x.classList.add('fini'));
    anim(q('.mt-bas'), [{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'none'}], {duration: 380});
  })();
}

// ── événements ──────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const b = e.target.closest('button, a[href], .grid .card');
  if (b && !b.disabled && !b.closest('.j7')) Son.jouer(b.closest('.tabs') ? 'onglet' : 'clic');
}, true);
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-cc-suppr],[data-sal-suppr],[data-sal-muet],[data-booster],[data-blot],[data-bposte],[data-quete],[data-filtre],[data-fposte],[data-slot],[data-choix],[data-entrainer],[data-vendre],[data-fusion],[data-tactique],[data-voir-fiche],[data-retour-poste],[data-voir-equipe],[data-retour-equipe],[data-mini-entr],[data-hex],[data-tr-onglet],[data-mk-palier],[data-mk-equipe],[data-mk-vpalier],[data-mk-vequipe],[data-mk-choisir],[data-mk-mettre],[data-mk-retirer],[data-acheter],[data-boite],[data-dm-palier],[data-dm-equipe],[data-demander],[data-donner],[data-pfiltre],[data-pari],[data-fiche],[data-valider-pari],[data-mini],[data-tuto],[data-car],[data-tac],[data-repondre-ami],[data-retirer-ami],[data-proposer],[data-ech-donne],[data-ech-demande],[data-annuler-echange],[data-repondre-echange],[data-ami],[data-ami-message],[data-defier-ami],[data-quete-s],[data-compo],[data-compo-c],[data-bequipe],[data-cc-poste],[data-cc],[data-prono],[data-club-rejoindre],[data-club-palier],[data-album],[data-staff-mettre],[data-staff-fusion],[data-capitaine],[data-perso],[data-banc],[data-banc-choix],[data-banc-retirer],[data-banc-titulaire],[data-compo-enr],[data-compo-charger],[data-pvp-inv],.grid .card');
  if (!t) { if (e.target.id === 'overlay' && !$('.opening') && !$('.walk') && !$('.match')) { SOC.panneau = null; fermerOverlay(); } return; }
  if (t.closest('#pvp-pres') && !t.dataset.act) return;   // présentation d'un match à deux : rien à ouvrir derrière
  const a = t.dataset.act, d = t.dataset;
  if (d.filtre) { filtre = d.filtre; return route(true); }
  if (d.fposte) { filtrePoste = d.fposte; return route(true); }
  if (d.slot) return choisir(d.slot);
  if (t.classList.contains('card') && !t.classList.contains('locked')) return fiche(t.dataset.id);
  if (a === 'fermer') { SOC.panneau = null; return fermerOverlay(); }
  if (a === 'vers-clubs') {   // depuis les quêtes : la fenêtre se ferme, sa place dans l'historique devient la page des clubs (comme les onglets)
    const i = COUCHES.lastIndexOf(coucheOverlay); if (i >= 0) COUCHES.splice(i, 1);
    cacherOverlay(true); try { history.replaceState(null, '', '#clubs'); } catch (er) { location.hash = '#clubs'; return; }
    return route();
  }
  if (a === 'moi') return fenetreCompte();
  if (a === 'quetes') return fenetreQuetes();
  if (a === 'amis') { SOC.amis = null; return panneauAmis(); }
  if (d.ami) return ficheAmi(d.ami);
  if (d.amiMessage) { SOC.conv = null; return conversationAmi(d.amiMessage); }
  if (d.car !== undefined) return choisirCarrousel(+d.car);
  if (d.echDonne) { SOC.echange.donne = d.echDonne; return fenetreEchange(); }
  if (d.echDemande) { SOC.echange.demande = d.echDemande; return fenetreEchange(); }
  // transferts : onglets et filtres (sans serveur)
  if (d.trOnglet) { MKT.onglet = d.trOnglet; return route(true); }
  if (d.mkPalier) { MKT.palier = d.mkPalier === '*' ? '' : d.mkPalier; return route(true); }
  if (d.mkEquipe) { MKT.equipe = d.mkEquipe === '*' ? '' : d.mkEquipe; return route(true); }
  if (d.mkVpalier) { MKT.vPalier = d.mkVpalier === '*' ? '' : d.mkVpalier; return fenetreVendre(); }
  if (d.mkVequipe) { MKT.vEquipe = d.mkVequipe === '*' ? '' : d.mkVequipe; return fenetreVendre(); }
  if (d.mkChoisir) return fenetrePrix(d.mkChoisir);
  if (d.dmPalier) { MKT.dPalier = d.dmPalier; return fenetreDemande(); }
  if (d.dmEquipe) { MKT.dEquipe = d.dmEquipe === '*' ? '' : d.dmEquipe; return fenetreDemande(); }
  if (a === 'mk-vendre') return fenetreVendre();
  if (a === 'dm-demander') { MKT.dRecherche = ''; return fenetreDemande(); }
  if (a === 'cc-demander') { MKT.dRecherche = ''; MKT.data = {...(MKT.data || {}), club: CCH.d?.club}; return fenetreDemande(); }   // depuis le chat du club
  if (d.pfiltre) { PARIS.filtre = d.pfiltre; return route(true); }
  if (d.pari) { const [rid, choix] = d.pari.split(':'); return fenetrePari(rid, choix); }
  if (d.fiche) return fenetreFiche(d.fiche);
  if (d.voirFiche) return fiche(d.voirFiche, d.poste, d.de);
  if (d.retourPoste) return choisir(d.retourPoste);
  if (d.voirEquipe) return voirEquipe(d.voirEquipe);
  if (d.retourEquipe) return voirEquipe(d.retourEquipe, true);
  if (d.hex) { const [pal, nt] = d.hex.split(':'); t.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === t));
    return hexMorph($('.fiche .hx'), FICHE.liste, statsAuNiveau(PAR_ID[FICHE.carte], +nt), pal); }
  if (a === 'passer') return finMatch();
  if (a === 'fin-match') { JEU.rencontres = null; return fermerOverlay(); }
  if (occupe) return;
  if (d.tac) {   // choix tactique : gardé tout de suite sur le serveur
    const [cle, v] = d.tac.split(':'), T = tactiqueActuelle(); T[cle] = v;
    return action(Compte.choisirTactique(`${T.att}:${T.def}`), () => route(true));
  }
  if (d.mkMettre) { const prix = Math.round(+($('.mk-pr input[type=number]')?.value || 0));
    return action(Compte.marcheVendre(d.mkMettre, prix), r => { Son.jouer('clic'); majMarche(r, 'Carte mise en vente 🪙'); }); }
  if (d.mkRetirer) return action(Compte.marcheRetirer(d.mkRetirer), r => majMarche(r, 'Vente retirée : la carte revient dans ton club'));
  if (d.acheter) {
    const v = MKT.data?.marche.ventes.find(x => x.id === d.acheter), c = v && PAR_ID[v.carte]; if (!c) return;
    return demander(`Acheter ${c.nom} ${R_LABEL[v.palier]} ${v.note} à ${v.vendeur} pour ${nb(v.prix)} pièces ?`, 'Acheter').then(oui => oui && !occupe &&
      action(Compte.marcheAcheter(v.id), r => { Son.jouer('recompense'); vibrer([40, 60, 80]); majMarche(r, `${c.nom} rejoint ton club !`); }));
  }
  if (d.boite) {
    const [carte, palier] = d.boite.split(':'), c = PAR_ID[carte]; if (!c) return;
    return demander(`Déposer ${c.nom} ${R_LABEL[palier]} dans la boîte contre une autre carte ${R_LABEL[palier]} ?`, 'Déposer').then(oui => oui && !occupe &&
      action(Compte.boiteEchanger(carte, palier), r => { const avant = new Set(EX().map(e => e.carte));
        if (r.attente) { Son.jouer('clic'); return majMarche(r, `${c.nom} est dans la boîte : échange dès qu’un joueur dépose, ${r.minutes} min au plus 🎁`); }
        majMarche(r);
        const e = exParId(r.id); if (e && PAR_ID[e.carte]) sceneBooster([{c: vue(e), nouveau: EX().filter(x => x.carte === e.carte).length === 1 && !avant.has(e.carte)}], 'Boîte', 'pk-hasard', {hasard: true}); }));
  }
  if (d.demander) { const c = PAR_ID[d.demander]; if (!c) return;
    return action(Compte.clubDemander(d.demander, MKT.dPalier), r => { Son.jouer('clic'); majMarche(r, `Demande envoyée à ton club : ${c.nom} ${R_LABEL[MKT.dPalier]} 🛡️`); }); }
  if (d.donner) return action(Compte.clubDonner(d.donner), r => { Son.jouer('recompense'); majMarche(r, `Merci ! +${nb(r.pieces)} pièces · +${r.xp} XP`); });
  const amis = (pr, msg) => action(pr, r => { if (r?.amis) SOC.amis = r; if (msg) toast(msg); route(true); revoirAmis(); });
  if (d.repondreAmi) { const [ps, oui] = d.repondreAmi.split(':'); return amis(Compte.repondreAmi(ps, oui === '1'), oui === '1' ? `${ps} est ton ami(e) !` : ''); }
  if (d.retirerAmi) { const qui = d.retirerAmi; return demander(`Retirer ${qui} de tes ami(e)s ?`, 'Retirer').then(oui => oui && !occupe && amis(Compte.retirerAmi(qui))); }
  if (d.annulerEchange) return amis(Compte.annulerEchange(d.annulerEchange), 'Proposition annulée');
  if (d.repondreEchange) { const [id, oui] = d.repondreEchange.split(':'); return amis(Compte.repondreEchange(id, oui === '1'), oui === '1' ? 'Échange fait : la carte est dans ton club' : 'Proposition refusée'); }
  if (d.proposer) {
    SOC.echange = {pseudo: d.proposer, donne: null, demande: null, club: null}; fenetreEchange();
    return Compte.clubAmi(d.proposer).then(l => { if (SOC.echange?.pseudo === d.proposer) { SOC.echange.club = l; fenetreEchange(); } }).catch(er => toast(er.message));
  }
  if (a === 'envoyer-echange') { const k = SOC.echange;
    return action(Compte.proposerEchange(k.pseudo, k.donne, k.demande), r => { SOC.amis = r; SOC.echange = null; toast(`Proposition envoyée à ${k.pseudo}`); ficheAmi(k.pseudo); }); }
  if (d.defierAmi) return fenetreDefi(d.defierAmi);
  if (d.validerPari) {
    const [rid, choix] = d.validerPari.split(':'), mise = +$('input.champ[data-mise]').value;
    return action(Compte.parier(rid, choix, mise), r => { Son.jouer('pari'); toast(`Pari enregistré : gain possible ${nb(r.gainPossible)} pièces`); PARIS.data = null; fermerOverlay(); });
  }
  const tactique = (T => `${T.att}:${T.def}`)(tactiqueActuelle());
  if (a === 'championnat') return commencerMatch('championnat', null, false);
  if (a === 'simuler') return commencerMatch('championnat', null, true);
  if (a === 'reprendre-match') return reprendreMatch();
  if (a === 'defi-live') { const ps = SOC.defi; cacherOverlay(); return pvpInviter(ps); }
  if (a === 'pvp-chercher') { pvpChercher(); return route(true); }
  if (a === 'presence') return action(Compte.reglerPresence(!S().invisible), () => { toast(S().invisible ? 'Tu apparais hors ligne' : 'Les autres te voient en ligne'); fenetreCompte(); });
  if (d.ccSuppr) return demander('Effacer ce message du chat du club ?', 'Effacer').then(oui => oui && Compte.clubChatSupprimer(+d.ccSuppr).then(r => { CCH.msgs = []; CCH.dernier = 0; clubChatMaj(r); }).catch(er => toast(er.message)));
  if (d.salSuppr) return demander('Effacer ce message pour tout le monde ?', 'Effacer').then(oui => oui && Compte.salonSupprimer(+d.salSuppr).then(r => { SAL.msgs = []; SAL.dernier = 0; salonMaj(r); }).catch(er => toast(er.message)));
  if (d.salMuet) return demander(`Empêcher ${d.salMuet} d’écrire dans le salon pendant 24 h ?`, 'Oui').then(oui => oui && Compte.salonMuet(d.salMuet, 24).then(r => { salonMaj(r); toast(`${d.salMuet} ne peut plus écrire pendant 24 h`); }).catch(er => toast(er.message)));
  if (a === 'pvp-accepter') return accepterPropose();
  if (a === 'pvp-refuser') return refuserPropose();
  if (a === 'pvp-pret-prepa') return pretPrepa();
  if (a === 'pvp-annuler') { arreterFile(true); toast('Recherche annulée'); return route(true); }
  if (a === 'pvp-inv-annuler') { arreterInv(true); return toast('Invitation annulée'); }
  if (a === 'pvp-reprendre') return reprendrePvp();
  if (d.pvpInv) { const [id, oui] = d.pvpInv.split(':'); return repondreInvitation(id, oui === '1'); }
  if (a === 'son-musique' || a === 'son-effets') { const k = a.slice(4); Son.regler(k, !Son.reglages[k]); return fenetreCompte(); }
  if (a === 'jet7m') return ouvrirJet7m();
  if (d.mini) return ouvrirMini(d.mini);
  if (d.miniEntr) return d.miniEntr === '7m' ? ouvrirJet7m(true) : ouvrirMini(d.miniEntr, true);
  if (d.tuto) return tuto(d.tuto, null, true);
  if (a === 'depart') return ouvrirBooster(Compte.ouvrirDepart(), 'Départ', 'pk-depart');
  if (d.booster) return ouvrirBooster(Compte.ouvrirBooster(d.booster), d.booster === 'or' ? 'Or' : d.booster === 'bonus' ? 'Bonus' : 'Booster',
    d.booster === 'or' ? 'pk-or' : d.booster === 'bonus' ? 'pk-bonus' : 'pk-gratuit');
  if (d.blot) return acheterLot(d.blot);
  if (d.bequipe === '?') return ouvrirBooster(Compte.ouvrirBoosterHasard(), 'Mystère', 'pk-hasard', {hasard: true});
  if (d.bequipe) { const bp = BOOSTERS_EQUIPE.find(x => x[0] === d.bequipe);
    return ouvrirBooster(Compte.ouvrirBoosterEquipe(d.bequipe), d.bequipe, 'pk-poste', {poste: d.bequipe, photo: bp && photoSachet(bp[1], bp[2])}); }
  if (d.ccPoste) { CC.poste = d.ccPoste; return route(true); }
  if (a === 'choix-coach') return lancerCoach();
  if (d.cc !== undefined) return toucherCoach(+d.cc);
  if (a === 'cc-fin') return fermerCoach();
  if (d.prono) return validerProno(d.prono);
  if (a === 'club-creer') { const nom = $('#club-nom')?.value || ''; return action(Compte.clubCreer(nom), r => { SOC.clubs = r; Son.jouer('recompense'); toast('Club créé 🛡️'); route(true); }); }
  if (d.clubRejoindre) return action(Compte.clubRejoindre(+d.clubRejoindre), r => { SOC.clubs = r; toast('Bienvenue au club !'); route(true); });
  if (a === 'club-quitter') return demander('Quitter ton club ?', 'Quitter').then(oui => oui && !occupe && action(Compte.clubQuitter(), r => { SOC.clubs = r; route(true); }));
  if (d.clubPalier) return action(Compte.clubReclamer(+d.clubPalier), r => { SOC.clubs = r; Son.jouer('recompense'); toast(`+${texteRecomp(r.recompense)}`); route(true);
    if ($('#overlay .quetes-s')) fenetreQuetes(); });
  if (d.album) { const [eq, pal] = d.album.split(':'); return action(Compte.reclamerAlbum(eq, pal), r => { Son.jouer('recompense'); toast(`Album fini ! +${texteRecomp(r.recompense)}`); route(true); }); }
  if (d.staffFusion) { const [id, pal] = d.staffFusion.split(':');
    return action(Compte.fusionnerStaff(id, pal), r => { Son.jouer('recompense'); toast(`${staffDe(r.staff)?.personne || staffDe(r.staff)?.nom || 'Staff'} passe ${R_LABEL[r.palier]} ✨`); route(true); }); }
  if (d.staffMettre !== undefined) return action(Compte.choisirStaff(d.staffMettre), () => { Son.jouer('clic'); toast(d.staffMettre ? 'Carte staff placée 🧑‍🏫' : 'Place staff libre');
    if (!$('#overlay').hidden) cacherOverlay(); route(true); });
  if (d.capitaine) return action(Compte.choisirCapitaine(d.capitaine), () => { Son.jouer('tap'); toast('Nouveau capitaine'); fermerOverlay(); });
  if (d.compoEnr) { const i = +d.compoEnr, c = (S().compos || [])[i - 1];
    const go = () => action(Compte.compoEnregistrer(i), () => { Son.jouer('tap'); toast(`Compo ${i} enregistrée`); route(true); });
    return c ? demander(`Remplacer la compo ${i} par ton équipe actuelle ?`, 'Remplacer').then(ok => ok && go()) : go(); }
  if (d.compoCharger) { const i = +d.compoCharger;
    return action(Compte.compoCharger(i), r => { Son.jouer('tap'); route(true);
      toast(r?.manquants?.length ? `Compo ${i} chargée, sauf : ${r.manquants.join(', ')} (plus au club)` : `Compo ${i} chargée`); }); }
  if (d.perso) { const [type, id] = d.perso.split(':'); return action(Compte.choisirPerso(type, id), () => { fenetreCompte(); const d = document.querySelector('#overlay details.perso'); if (d) d.open = true; }); }
  if (d.queteS) return action(Compte.reclamerQueteSemaine(d.queteS), r => { Son.jouer('recompense'); toast(`+${r.xp} XP · +${nb(r.pieces)} pièces`); route(true); fenetreQuetes(); });
  if (a === 'passe') return fenetrePasse();
  if (a === 'rien') return;
  if (a === 'passe-reclamer') return action(Compte.reclamerPasse(), r => { Son.jouer('recompense'); toast(`Passe : +${texteRecomp(r.gains)}`); route(true); fenetrePasse(); });
  if (a === 'booster-semaine') return ouvrirBooster(Compte.ouvrirBoosterSemaine(), 'Semaine', 'pk-semaine');
  if (d.compo) return fenetreCompo(d.compo);
  if (d.compoC) return basculerCompo(d.compoC);
  if (a === 'compo-ok') return validerCompo();
  if (d.quete) return action(Compte.reclamerQuete(d.quete), r => { Son.jouer('recompense'); toast(`+${r.xp} XP · +${nb(r.pieces)} pièces`); route(true); fenetreQuetes(); });
  if (d.choix) return action(Compte.aligner(d.poste, d.choix), fermerOverlay);
  if (d.banc) return choisirBanc(d.banc);
  if (d.bancChoix) return action(Compte.alignerRemplacants(S().equipe || {}, {...(S().remplacants || {}), [d.poste]: d.bancChoix}), () => { toast('Remplaçant choisi'); fermerOverlay(); });
  if (d.bancRetirer) { const r = {...(S().remplacants || {})}; delete r[d.bancRetirer]; return action(Compte.alignerRemplacants(S().equipe || {}, r), fermerOverlay); }
  if (d.bancTitulaire) {   // le remplaçant devient titulaire, le titulaire passe sur le banc
    const k = d.bancTitulaire, eq = {...(S().equipe || {})}, r = {...(S().remplacants || {})}; [eq[k], r[k]] = [r[k], eq[k]];
    return action(Compte.alignerRemplacants(eq, r), () => { toast('Ton remplaçant devient titulaire'); fermerOverlay(); });
  }
  if (a === 'retirer') return action(Compte.aligner(d.poste, null), fermerOverlay);
  if (a === 'auto') return autoEquipe();
  if (a === 'staff-place') return fenetreStaffEquipe();
  if (a === 'staff-toutes' || a === 'staff-miennes') return fenetreStaffEquipe(a === 'staff-toutes');
  if (d.entrainer) {
    const carte = exParId(d.entrainer).carte;
    return action(Compte.entrainer(d.entrainer), r => { toast(r.apres > r.avant ? `+1 ! Note ${r.apres}` : '+XP : encore un peu d’entraînement'); fiche(carte); });
  }
  if (d.vendre) {
    const ex = exParId(d.vendre);
    const vendre = () => action(Compte.vendre(ex.id), r => { toast(`+${nb(r.gain)} pièces`); if (mesEx(ex.carte).length) fiche(ex.carte); else fermerOverlay(); });
    if (RARETES.indexOf(ex.palier) < RARETES.indexOf('or')) return vendre();
    return demander(`Vendre cette carte ${R_LABEL[ex.palier]} ${ex.note} pour ${nb(PARAMS.vente?.[ex.palier])} pièces ?`, 'Vendre').then(oui => oui && !occupe && vendre());
  }
  if (d.fusion) {
    const [carte, palier] = d.fusion.split(':');
    // la carte d'avant : le meilleur exemplaire du palier fusionné (la note de départ de l'animation)
    const avantEx = mesEx(carte).filter(e => e.palier === palier).sort(rangEx)[0];
    const avant = vueExemplaire(PAR_ID[carte], {palier, note: avantEx?.note ?? PALIER[palier].max});
    const {poste, de} = FICHE;   // après la montée, on revient sur la fiche (retour de Maël : « ça sort du menu fusion, mieux d'y rester »)
    return action(Compte.fusionner(carte, palier), r => {
      const e = exParId(r.id);
      cacherOverlay(true);   // sa place dans l'historique passe à l'animation, puis revient à la fiche
      montee(avant, vue(e), () => fiche(carte, poste, de), coucheOverlay);
    });
  }
  if (a === 'google') return action(Compte.google());
  if (a === 'deconnexion') return action(Compte.deconnexion(), () => { fermerOverlay(); toast('Déconnecté'); });
  if (a === 'supprimer') return supprimerCompte();
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
  if (quoi === 'profil') return action(Compte.creerProfil(d.pseudo, !!d.accord), () => { location.hash = '#accueil'; route(); });
  if (quoi === 'ami') return action(Compte.ajouterAmi(d.pseudo), r => { SOC.amis = r; SOC.ajout = '';
    toast(r.amis.some(x => x.pseudo.toLowerCase() === d.pseudo.trim().toLowerCase()) ? 'Vous êtes ami(e)s !' : 'Demande envoyée'); panneauAmis(); });
  if (quoi === 'salon') {
    const champ = f.querySelector('[name=texte]'), texte = champ.value;
    return Compte.salonEcrire(texte, SAL.dernier).then(r => { champ.value = ''; salonMaj(r); const fl = $('#sal-fil'); if (fl) fl.scrollTop = fl.scrollHeight; })
      .catch(er => toast(er.message || 'Message non envoyé'));
  }
  if (quoi === 'chat-club') {
    const champ = f.querySelector('[name=texte]'), texte = champ.value;
    return Compte.clubChat(CCH.dernier, texte).then(r => { champ.value = ''; clubChatMaj(r); const fl = $('#cc-fil'); if (fl) fl.scrollTop = fl.scrollHeight; })
      .catch(er => toast(er.message || 'Message non envoyé'));
  }
  if (quoi === 'message') return action(Compte.envoyerMessage(SOC.ami, d.texte), c => {   // le clavier reste ouvert : on vide le champ, seul le fil change
    SOC.conv = c; f.reset(); majConversation(); const fil = $('#fil-msg'); if (fil) fil.scrollTop = fil.scrollHeight; });
});
// annonce : recherche du joueur voulu ; pari : mise et gain possible
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.clubRecherche !== undefined) {   // recherche d'un club : la liste se recharge, le champ garde le clavier
    SOC.rechClub = t.value; clearTimeout(SOC.tRech);
    SOC.tRech = setTimeout(() => Compte.monClub(SOC.rechClub).then(d => { SOC.clubs = d; route(true);
      const c = $('[data-club-recherche]'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }).catch(er => toast(er.message)), 350);
    return;
  }
  if (t.dataset.mkRecherche !== undefined) { MKT.recherche = t.value; $('#mk-liste').innerHTML = listeVentesHTML(MKT.data.marche); return; }
  if (t.dataset.mkVrecherche !== undefined) { MKT.vRecherche = t.value; $('#mk-vliste').innerHTML = listeVendreHTML(); return; }
  if (t.dataset.dmRecherche !== undefined) { MKT.dRecherche = t.value; $('#dm-liste').innerHTML = listeDemandeHTML(); return; }
  if (t.dataset.mkPrix !== undefined) { const v = +t.value; document.querySelectorAll('[data-mk-prix]').forEach(el => { if (el !== t) el.value = v; });
    $('#mk-gain').textContent = nb(Math.max(0, Math.floor(v * (1 - +t.dataset.mkPrix)))); return; }
  if (t.dataset.mise !== undefined) {
    document.querySelectorAll('[data-mise]').forEach(el => { if (el !== t) el.value = t.value; });
    const [rid, choix] = $('[data-valider-pari]').dataset.validerPari.split(':');
    $('#gain-pari').textContent = nb(Math.floor(+t.value * PARIS.data.aVenir.find(x => x.rid === rid).cotes[choix]));
  }
});
// carrousel des boosters par poste : glisser vers la gauche ou la droite
// les sachets suivent le doigt (un sachet par tiers d'écran), puis tournent jusqu'au poste le plus proche
let glisse = null;
const PAS_CAR = () => 133;   // px : l'écart entre deux sachets (79 % de 168 px)
document.addEventListener('pointerdown', e => {
  // un toucher n'importe où dans le bloc (le bouton d'achat compris) met la rotation automatique en pause : on n'achète jamais un autre poste
  if (e.target.closest('.scene-b')?.querySelector('.carrousel')) CARROUSEL.touche = Date.now();
  if (e.target.closest('[data-carrousel]')) glisse = {x: e.clientX, y: e.clientY, actif: false};
});
document.addEventListener('pointermove', e => {
  if (!glisse) return; const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
  if (!glisse.actif && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { glisse.actif = true; $('.carrousel')?.classList.add('glisse'); }
  if (glisse.actif) placerCarrousel(dx / PAS_CAR());
});
document.addEventListener('pointercancel', () => { if (glisse?.actif) { $('.carrousel')?.classList.remove('glisse'); placerCarrousel(); } glisse = null; });
document.addEventListener('pointerup', e => {
  if (!glisse) return; const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y, actif = glisse.actif; glisse = null;
  $('.carrousel')?.classList.remove('glisse');
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) { if (actif) placerCarrousel(); return; }
  const pas = Math.max(1, Math.round(Math.abs(dx) / PAS_CAR()));
  choisirCarrousel(CARROUSEL.i + (dx < 0 ? pas : -pas));
  const bloque = ev => { ev.stopPropagation(); ev.preventDefault(); };   // pas de clic sur le sachet juste après un glissé
  document.addEventListener('click', bloque, {capture: true, once: true}); setTimeout(() => document.removeEventListener('click', bloque, {capture: true}), 350);
});
window.addEventListener('hashchange', () => route());
// le réseau revient : on recharge pour se reconnecter au serveur (hors ligne, rien n'est en cours)
window.addEventListener('online', () => { if (Compte.horsLigne && $('#overlay').hidden) location.reload(); });
// ami(e)s : nouvelles demandes, échanges et messages (pastille de la bulle) : toutes les 40 s quand la bulle est ouverte,
// sinon toutes les 3 min 20 (moins de trafic sur le serveur gratuit)
let tourAmis = 0;
setInterval(() => {
  if (document.visibilityState !== 'visible' || !Compte.pret || Compte.horsLigne || occupe || document.body.classList.contains('avec-intro')) return;
  if (!SOC.panneau && !FILE.t && ++tourAmis % 2 && !(S().pvp?.invitations || []).length) return;   // toutes les 80 s (40 s fenêtre ouverte)
  Compte.rafraichir().then(() => { majEntete();
    const ami = SOC.ami;
    if (SOC.panneau === 'conv' && ami) Compte.conversation(ami).then(c => { if (SOC.panneau === 'conv' && SOC.ami === ami) { SOC.conv = c; majConversation(); majEntete(); } }).catch(() => {});
  }).catch(() => {});
}, 40000);
// retour sur l'appli après un moment : boosters et quêtes à jour
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Compte.pret && !Compte.horsLigne && !occupe && $('#overlay').hidden)
    Compte.rafraichir().then(() => route(true)).catch(() => {});
});
// Accès discret à l'outil de gestion des cartes : toucher 5 fois le logo, seulement pour le compte admin (demande de Maël)
$('.brand').addEventListener('click', () => {
  if (S().role !== 'admin') return;
  const t = Date.now(); if (t - (route.tapT || 0) > 1500) route.taps = 0; route.tapT = t;
  if (++route.taps >= 5) location.href = 'admin.html';
});

// ── mini-jeu : jet de 7 mètres ───────────────────────────────────────────────────
// Le viseur se promène sur tout le but et autour (on peut tirer à côté) : on touche pour viser. Puis la jauge de puissance
// monte et descend : on touche pour tirer. Point idéal à 80 % : en dessous le tir est plus lent (le gardien a le temps),
// au-dessus il part de plus en plus de travers.
// Le serveur (tirer_7m) fait deviner le gardien et décide : au centre, toujours arrêté ; dans les angles, ça rentre.
const J7 = {};
const RES7 = {but: ['But !', 'but'], arret: ['Arrêté !', 'rate'], dehors: ['À côté !', 'rate'], poteau: ['Poteau !', 'rate'], dessus: ['Au-dessus !', 'rate']};
const titre7 = r => r.resultat === 'dehors' && r.y < 0 ? 'Au-dessus !' : r.resultat === 'poteau' && r.y < .05 ? 'Sur la barre !' : RES7[r.resultat][0];
// Démo (?demo=7m) : mêmes règles que tirer_7m, calculées dans la page, sans pièces ni serveur
function tir7mDemo(x0, y0, f) {
  let x = x0, y = y0;
  const trop = Math.max(0, f - .8) / .2;   // point idéal : 80 %
  x += (Math.random() - .5) * .44 * trop; y += (Math.random() - .5) * .38 * trop;
  const vitesse = Math.min(f, .8) / .8, a = Math.random();
  const gx = a < .3 ? .2 : a < .6 ? .8 : .5, gy = Math.random() < .5 ? .3 : .75;
  const portee = .66 - .46 * vitesse + (gx === .5 ? .08 : 0);
  const res = x < 0 || x > 1 || y < 0 ? 'dehors' : x < .05 || x > .95 || y < .05 ? 'poteau' : Math.abs(x - .5) < .2 ? 'arret'
    : Math.hypot(x - (.5 + (gx - .5) * .6), (y - gy) * .67) < portee ? 'arret' : 'but';
  const tirs = [...J7.tirs, res];
  return Promise.resolve({resultat: res, x, y, vitesse, gardien: {x: gx, y: gy}, pieces: 0, bonus: 0, tirs, restants: J7.limite - tirs.length});
}
// Entraînement (demande de Maël, 14 nov. 2026) : le mode démo des mini-jeux (mêmes règles, calculées dans la page, sans pièces ni
// essai compté), ouvert par « S'entraîner » sous chaque tuile ; à la fin, « Jouer pour de vrai » enchaîne sur les essais qui comptent
const essaisVrais = k => { if (k === '7m') { const j = S().jet7m || {tirs: [], limite: 5}; return Math.max(0, j.limite - j.tirs.length); }
  const m = S().minijeux || {}, l = m[k] || [], lim = m.limites?.[k] || m.limite || 5; return k === 'gardien' ? seriesRestantes(l.length, lim) : Math.max(0, lim - l.length); };
const MODE_ENTR = '<span class="j7-mode">Entraînement</span>';
function ouvrirJet7m(demo) {
  const j = demo ? {tirs: [], limite: 5} : S().jet7m || {tirs: [], limite: 5};
  if (j.tirs.length >= j.limite) return toast('Reviens demain pour 5 nouveaux tirs');
  const el = document.createElement('div');
  el.className = 'j7 j7-3d';
  el.innerHTML = `<div class="j7-haut"><b class="j7-score"></b>${demo ? MODE_ENTR : ''}<button class="j7-quitter">Fermer</button></div>
    <div class="j7-terrain"><div class="t3"></div><div class="j7-but"><div class="j7-viseur"><i></i></div></div></div>
    <div class="j7-jauge" aria-hidden="true"><i class="j7-ideal"></i><i class="j7-niveau"></i><small>Puissance</small></div>
    <p class="j7-aide"></p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro'); Son.discret(true); Son.theme('minijeux'); ouvrirCouche(coucheJ7);
  Object.assign(J7, {el, tirs: [...j.tirs], limite: j.limite, gains: 0, demo: !!demo});
  el.querySelector('.j7-quitter').addEventListener('click', e => { e.stopPropagation(); fermerJet7m(); });
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button') && J7.ctl) { Son.jouer('tap'); toucherJet7m(); } });
  // la scène en 3D (jeux3d.js) : on attend qu'elle soit prête pour lancer le premier tir
  el.querySelector('.j7-aide').textContent = 'Chargement du terrain…';
  Promise.all([jeux3d().then(m => m.jet7m(J7, el.querySelector('.t3'))).catch(() => null), tuto('7m', el)]).then(([ctl]) => {
    if (!J7.el) return;
    if (!ctl) { toast('Impossible de charger le terrain 3D : vérifie ta connexion'); return fermerJet7m(); }
    J7.ctl = ctl; nouveauTir();
  });
}
const coucheJ7 = () => fermerJet7m(true);
function fermerJet7m(parRetour) { if (parRetour !== true) quitterCouche(coucheJ7); Son.discret(false); cancelAnimationFrame(J7.raf); cancelAnimationFrame(J7.raf3); J7.salle?.detruire(); J7.salle = J7.ctl = null; J7.el?.remove(); J7.el = null; document.body.classList.remove('avec-intro'); route(true); }
const vaEtVient = (t, per) => { const x = (t / per) % 2; return x < 1 ? x : 2 - x; };
function nouveauTir() {
  const el = J7.el, n = J7.tirs.length, buts = J7.tirs.filter(x => x === 'but').length;
  el.querySelector('.j7-score').textContent = `Tir ${n + 1}/${J7.limite} · ${buts} but${buts > 1 ? 's' : ''}`;
  el.querySelector('.j7-resultat').hidden = true; el.querySelector('.j7-bas').innerHTML = '';
  el.classList.remove('puissance', 'tir', 'r-but', 'r-rate');
  J7.ctl.nouveau(); J7.ctl.figer?.(true);   // la 3D au ralenti pendant la visée : viseur et jauge fluides sur les téléphones lents
  el.querySelector('.j7-aide').textContent = 'Touche pour viser';
  // plus rapide à chaque tir
  // viseur 20 % plus lent (Maël, 20 nov. 2026 : « les penaltys sont trop durs ») : période × 1,25
  Object.assign(J7, {phase: 'visee', t0: performance.now(), tx: 1.25 * Math.max(1.2, 1.7 - n * .117), py: Math.max(.44, .62 - n * .04), x: .5, y: .4, puissance: 0});
  el.querySelector('.j7-niveau').style.bottom = '0%';
  boucleJet7m();
}
function boucleJet7m() {
  cancelAnimationFrame(J7.raf);
  const v = J7.el.querySelector('.j7-viseur'), niv = J7.el.querySelector('.j7-niveau');
  const pas = now => {
    const t = (now - J7.t0) / 1000;
    if (J7.phase === 'visee') {   // trajet qui couvre tout le but et ses abords (deux périodes qui ne se recoupent pas)
      J7.x = .5 + .68 * Math.sin(2 * Math.PI * t / J7.tx); J7.y = .38 + .64 * Math.sin(2 * Math.PI * t / (J7.tx * .71) + 1.3);
      v.style.left = (J7.x * 100) + '%'; v.style.top = (J7.y * 100) + '%';
    } else if (J7.phase === 'puissance') { J7.puissance = vaEtVient(t, J7.py); niv.style.bottom = (J7.puissance * 100) + '%'; }
    else return;
    J7.raf = requestAnimationFrame(pas);
  };
  J7.raf = requestAnimationFrame(pas);
}
function toucherJet7m() {
  if (J7.phase === 'visee') {
    J7.phase = 'puissance'; J7.t0 = performance.now(); vibrer(10);
    J7.el.classList.add('puissance'); J7.el.querySelector('.j7-aide').textContent = 'Touche pour tirer'; J7.ctl.armer();
    boucleJet7m();
  } else if (J7.phase === 'puissance') {
    J7.phase = 'tir'; cancelAnimationFrame(J7.raf); vibrer(20); Son.jouer('tir');
    J7.el.classList.add('tir'); J7.el.querySelector('.j7-aide').textContent = '';
    const x = Math.round(J7.x * 1000) / 1000, y = Math.round(J7.y * 1000) / 1000, f = Math.round(J7.puissance * 1000) / 1000;
    if (J7.match) return J7.match.tirer(x, y, f).then(animerTir7mMatch).catch(e => { toast(e.message); J7.match?.fin(); });
    (J7.demo ? tir7mDemo(x, y, f) : Compte.tirer7m(x, y, f)).then(animerTir).catch(e => { toast(e.message); fermerJet7m(); });
  }
}
function animerTir(r) {
  const el = J7.el; if (!el) return;
  J7.tirs = r.tirs; J7.gains += r.pieces + r.bonus;
  const duree = Math.round(560 - 330 * (r.vitesse ?? .7));   // la puissance donne la vitesse du ballon
  J7.ctl.tirer(r, moinsAnim() ? 1 : duree).then(() => {
    if (!J7.el) return;
    const cls = (RES7[r.resultat] || RES7.dehors)[1];
    el.classList.add('r-' + cls);
    vibrer(r.resultat === 'but' ? [30, 40, 60] : 40);
    Son.jouer({but: 'but', arret: 'arret', poteau: 'poteau'}[r.resultat] || 'rate');
    const box = el.querySelector('.j7-resultat');
    box.innerHTML = `<b>${titre7(r)}</b>${r.pieces ? `<small>+${r.pieces} pièces</small>` : ''}${r.bonus ? `<small>5 sur 5 : +${r.bonus} pièces de bonus !</small>` : ''}`;
    box.hidden = false;
    const n = J7.tirs.length, buts = J7.tirs.filter(t => t === 'but').length;
    el.querySelector('.j7-score').textContent = `Tir ${n}/${J7.limite} · ${buts} but${buts > 1 ? 's' : ''}`;
    el.querySelector('.j7-bas').innerHTML = r.restants > 0 ? `<button class="btn gold large j7-suivant">Tir suivant</button>`
      : J7.demo ? `<p class="j7-bilan">${buts} sur ${J7.limite} · entraînement : pas de pièces</p>${essaisVrais('7m') ? '<button class="btn gold large j7-vrai">Jouer pour de vrai</button>' : ''}
        <button class="btn ${essaisVrais('7m') ? 'ghost' : 'gold'} large j7-rejouer">Rejouer l’entraînement</button>`
      : `<p class="j7-bilan">${buts} sur ${J7.limite} · +${nb(J7.gains)} pièces</p><button class="btn gold large j7-fin">Fermer</button>`;
    el.querySelector('.j7-suivant')?.addEventListener('click', e => { e.stopPropagation(); nouveauTir(); });
    el.querySelector('.j7-rejouer')?.addEventListener('click', e => { e.stopPropagation(); J7.tirs = []; nouveauTir(); });
    el.querySelector('.j7-vrai')?.addEventListener('click', e => { e.stopPropagation(); const j = S().jet7m || {tirs: [], limite: 5};
      Object.assign(J7, {demo: false, tirs: [...j.tirs], limite: j.limite, gains: 0}); el.querySelector('.j7-mode')?.remove(); nouveauTir(); });
    el.querySelector('.j7-fin')?.addEventListener('click', e => { e.stopPropagation(); fermerJet7m(); });
  });
}

// ── trois autres mini-jeux : l'arrêt réflexe (gardien), la passe en contre, le tir en suspension ──────────
// Le jeu envoie ce que le joueur a fait (zone choisie, précision, moment du saut…) ; le serveur décide (mini_jouer).
// 5 essais par jour pour chacun, 10 pièces par réussite, 20 de plus pour un 5 sur 5. Démo : ?demo=gardien, contre, suspension.
const MJ = {};
const MINI = {
  gardien: {nom: 'L’arrêt réflexe', icone: '🥅', succes: 'arret',
    texte: 'Tu es dans les buts : dès que le ballon part, sa trajectoire s’affiche ; touche la zone où il va avant qu’il arrive. 5 tirs enchaînés par série.',
    res: {arret: 'Arrêt !', but: 'But encaissé', tard: 'Trop tard !'}},
  contre: {nom: 'La passe en contre', icone: '🏃', succes: 'but',
    texte: '2 contre 1 : dessine la passe dans la course de ton partenaire, ou garde le ballon si le défenseur part sur lui.',
    res: {but: 'But !', interception: 'Interceptée !', neutralise: 'Le défenseur t’a pris le ballon'}},
  suspension: {nom: 'Le tir en suspension', icone: '🚀', succes: 'but',
    texte: 'Touche vite pour remplir la barre de course : le saut part tout seul. En l’air, touche pour tirer au sommet du saut, au-dessus du contreur. Barre pleine et tir au sommet : but à coup sûr.',
    res: {but: 'But !', arret: 'Arrêté !', contre: 'Contré !', dehors: 'À côté !', poteau: 'Poteau !'}},
};
const mjAttendre = ms => new Promise(r => MJ.timers.push(setTimeout(r, moinsAnim() ? 0 : ms)));
function ouvrirMini(jeu, demo) {
  if (!MINI[jeu]) return;
  const m = demo ? {} : S().minijeux || {}, liste = demo ? [] : m[jeu] || [], limite = demo ? (jeu === 'gardien' ? 25 : 5) : m.limites?.[jeu] || m.limite || 5;
  if (liste.length >= limite) return toast('Reviens demain pour 5 nouveaux essais');
  const el = document.createElement('div');
  el.className = `j7 mj mj-${jeu}`;
  el.innerHTML = `<div class="j7-haut"><b class="j7-score"></b>${demo ? MODE_ENTR : ''}<button class="j7-quitter">Fermer</button></div>
    <div class="mj-scene">${JEUX[jeu].scene()}</div><p class="j7-aide"></p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro'); Son.discret(true); Son.theme('minijeux'); ouvrirCouche(coucheMini);
  Object.assign(MJ, {el, jeu, liste: [...liste], limite, gains: 0, demo: !!demo, toucher: null, timers: [], raf: 0, serie: [], serieN: 0});
  el.querySelector('.j7-quitter').addEventListener('click', e => { e.stopPropagation(); fermerMini(); });
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button') && MJ.toucher) { Son.jouer('tap'); MJ.toucher(e); } });
  jeux3d().catch(() => {});   // la salle 3D se charge pendant le tuto
  tuto(jeu, el).then(() => { if (MJ.el === el) miniEssai(); });
}
const coucheMini = () => fermerMini(true);
function fermerMini(parRetour) { if (parRetour !== true) quitterCouche(coucheMini); Son.discret(false); MJ.timers.forEach(clearTimeout); cancelAnimationFrame(MJ.raf); J3?.then(m => m.fermer()).catch(() => {}); MJ.el?.remove(); MJ.el = null; document.body.classList.remove('avec-intro'); route(true); }
const SERIE = 5;   // l'arrêt réflexe : 5 tirs enchaînés par série
function scoreMini() {
  const ok = MJ.liste.filter(x => x === MINI[MJ.jeu].succes).length;
  if (MJ.jeu === 'gardien') { const a = MJ.serie.filter(x => x === 'arret').length;
    return `Série ${Math.ceil((MJ.liste.length + (MJ.serie.length < SERIE ? 1 : 0)) / SERIE) || 1} · tir ${Math.min(SERIE, MJ.serie.length + 1)}/${SERIE} · ${a} arrêt${a > 1 ? 's' : ''}`; }
  return `Essai ${Math.min(MJ.limite, MJ.liste.length + 1)}/${MJ.limite} · ${ok} réussi${ok > 1 ? 's' : ''}`;
}
function miniEssai() {
  const el = MJ.el, n = MJ.liste.length;
  if (MJ.jeu === 'gardien' && MJ.serie.length >= SERIE) MJ.serie = [];
  el.querySelector('.j7-score').textContent = scoreMini();
  el.querySelector('.j7-resultat').hidden = true; el.querySelector('.j7-bas').innerHTML = '';
  el.classList.remove('r-but', 'r-rate');
  MJ.timers.forEach(clearTimeout); MJ.timers = []; cancelAnimationFrame(MJ.raf); MJ.toucher = null;
  el.querySelectorAll('.mj-scene *').forEach(x => x.getAnimations().forEach(a => a.cancel()));
  el.querySelector('.mj-scene').innerHTML = JEUX[MJ.jeu].scene();
  JEUX[MJ.jeu].essai(el.querySelector('.mj-scene'), n);
}
const miniAide = t => { if (MJ.el) MJ.el.querySelector('.j7-aide').textContent = t; };
function miniEnvoyer(entrees) {
  if (MJ.match) return MJ.match.envoyer(entrees);   // jet de 7 m en match
  if (!MJ.demo) return Compte.miniJouer(MJ.jeu, entrees);
  const res = JEUX[MJ.jeu].demo(entrees), essais = [...MJ.liste, res.resultat];
  return Promise.resolve({...res, reussi: res.resultat === MINI[MJ.jeu].succes, pieces: 0, bonus: 0, essais, restants: MJ.limite - essais.length});
}
function miniFin(r) {
  const el = MJ.el; if (!el) return;
  if (MJ.match) {   // jet de 7 m en match : le résultat, puis le match reprend
    const ok = r.resultat !== 'but';
    el.classList.add(ok ? 'r-but' : 'r-rate'); vibrer(ok ? [30, 40, 60] : 40); Son.jouer(r.resultat === 'arret' ? 'parade' : ok ? 'rate' : 'encaisse'); miniAide('');
    const box = el.querySelector('.j7-resultat'); box.innerHTML = `<b>${{arret: 'Arrêté !', but: 'But…', poteau: 'Poteau !', dehors: 'À côté !'}[r.resultat] || r.resultat}</b>`; box.hidden = false;
    const m = MJ.match; MJ.timers.push(setTimeout(() => m.fin(r), moinsAnim() ? 500 : 1500));
    return;
  }
  MJ.liste = r.essais; MJ.gains += r.pieces + r.bonus;
  el.classList.add(r.reussi ? 'r-but' : 'r-rate');
  vibrer(r.reussi ? [30, 40, 60] : 40);
  // l'arrêt réflexe : une parade fait lever la salle, un but encaissé la fait soupirer
  Son.jouer(MJ.jeu === 'gardien' ? (r.reussi ? 'parade' : 'encaisse') : r.reussi ? 'but' : {arret: 'arret', poteau: 'poteau'}[r.resultat] || 'rate');
  miniAide('');
  const box = el.querySelector('.j7-resultat');
  box.innerHTML = `<b>${MINI[MJ.jeu].res[r.resultat] || r.resultat}</b>${r.pieces ? `<small>+${r.pieces} pièces</small>` : ''}${r.bonus ? `<small>5 sur 5 : +${r.bonus} pièces de bonus !</small>` : ''}`;
  box.hidden = false;
  const n = MJ.liste.length, ok = MJ.liste.filter(x => x === MINI[MJ.jeu].succes).length;
  if (MJ.jeu === 'gardien') {   // séries de 5 tirs enchaînés, sans bouton entre deux
    MJ.serie.push(r.resultat); MJ.serieN++;
    const a = MJ.serie.filter(x => x === 'arret').length;
    el.querySelector('.j7-score').textContent = `Tir ${MJ.serie.length}/${SERIE} · ${a} arrêt${a > 1 ? 's' : ''}`;
    if (MJ.serie.length < SERIE && r.restants > 0) { MJ.timers.push(setTimeout(() => { if (MJ.el) miniEssai(); }, moinsAnim() ? 300 : 700)); return; }
    const gainsSerie = MJ.demo ? 0 : a * (S().minijeux?.gains?.gardien || 10) + (r.bonus || 0);
    const vrai = MJ.demo && essaisVrais(MJ.jeu) > 0;
    // les séries s'enchaînent toutes seules (Maël, 20 nov. 2026) : le bilan de la série, puis la suivante démarre ; « Fermer » pour arrêter
    if (r.restants > 0 && !MJ.demo) {
      el.querySelector('.j7-bas').innerHTML = `<p class="j7-bilan">Série : ${a} arrêt${a > 1 ? 's' : ''} sur ${MJ.serie.length} · +${nb(gainsSerie)} pièces · série suivante…</p><button class="btn ghost large mj-fin">Fermer</button>`;
      el.querySelector('.mj-fin').addEventListener('click', e => { e.stopPropagation(); fermerMini(); });
      MJ.timers.push(setTimeout(() => { if (MJ.el) { MJ.serie = []; miniEssai(); } }, moinsAnim() ? 600 : 1800));
      return;
    }
    el.querySelector('.j7-bas').innerHTML = `<p class="j7-bilan">Série : ${a} arrêt${a > 1 ? 's' : ''} sur ${MJ.serie.length}${MJ.demo ? ' · entraînement : pas de pièces' : ` · +${nb(gainsSerie)} pièces`}</p>`
      + (vrai ? '<button class="btn gold large mj-vrai">Jouer pour de vrai</button>' : '')
      + (r.restants > 0 || MJ.demo ? `<button class="btn ${vrai ? 'ghost' : 'gold'} large mj-suivant">${MJ.demo ? 'Encore une série d’entraînement' : 'Série suivante'}</button>` : `<button class="btn gold large mj-fin">Fermer</button>`)
      + (r.restants > 0 && !MJ.demo ? `<button class="btn ghost large mj-fin">Fermer</button>` : '');
    el.querySelector('.mj-suivant')?.addEventListener('click', e => { e.stopPropagation(); if (MJ.demo && r.restants <= 0) MJ.liste = []; MJ.serie = []; miniEssai(); });
    el.querySelector('.mj-vrai')?.addEventListener('click', e => { e.stopPropagation(); passerEnVrai(); });
    el.querySelectorAll('.mj-fin').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); fermerMini(); }));
    return;
  }
  el.querySelector('.j7-score').textContent = `Essai ${n}/${MJ.limite} · ${ok} réussi${ok > 1 ? 's' : ''}`;
  el.querySelector('.j7-bas').innerHTML = r.restants > 0 ? `<button class="btn gold large mj-suivant">Essai suivant</button>`
    : MJ.demo ? `<p class="j7-bilan">${ok} sur ${MJ.limite} · entraînement : pas de pièces</p>${essaisVrais(MJ.jeu) ? '<button class="btn gold large mj-vrai">Jouer pour de vrai</button>' : ''}
      <button class="btn ${essaisVrais(MJ.jeu) ? 'ghost' : 'gold'} large mj-rejouer">Rejouer l’entraînement</button>`
    : `<p class="j7-bilan">${ok} sur ${MJ.limite} · +${nb(MJ.gains)} pièces</p><button class="btn gold large mj-fin">Fermer</button>`;
  el.querySelector('.mj-suivant')?.addEventListener('click', e => { e.stopPropagation(); miniEssai(); });
  el.querySelector('.mj-rejouer')?.addEventListener('click', e => { e.stopPropagation(); MJ.liste = []; miniEssai(); });
  el.querySelector('.mj-vrai')?.addEventListener('click', e => { e.stopPropagation(); passerEnVrai(); });
  el.querySelector('.mj-fin')?.addEventListener('click', e => { e.stopPropagation(); fermerMini(); });
}

// fin d'entraînement → les essais qui comptent, dans le même écran (pas d'aller-retour dans l'historique)
function passerEnVrai() {
  const m = S().minijeux || {};
  Object.assign(MJ, {demo: false, liste: [...(m[MJ.jeu] || [])], limite: m.limites?.[MJ.jeu] || m.limite || 5, gains: 0, serie: [], serieN: 0});
  MJ.el.querySelector('.j7-mode')?.remove(); Son.jouer('sifflet'); miniEssai();
}
// Les trois jeux sont en vraie 3D (jeux3d.js, three.js) : le module n'est chargé qu'à l'ouverture d'un mini-jeu.
let J3 = null;
const jeux3d = () => J3 ||= import('./jeux3d.js?v=101').then(m => { m.init({MJ, miniAide, miniEnvoyer, miniFin, fermerMini, toast, vibrer, moinsAnim, Compte}); return m; })
  .catch(e => { J3 = null; throw e; });
const essai3d = jeu => async (sc, n) => {
  let m; try { m = await jeux3d(); } catch (e) { toast('Impossible de charger le mini-jeu : vérifie ta connexion'); return fermerMini(); }
  if (MJ.el) m[jeu](sc, n);
};
const JEUX = {
  // L'arrêt réflexe : caméra haute derrière ton but, le tireur arrive en face ; dès que le ballon part, sa trajectoire
  // s'affiche : touche la zone du but où il va avant qu'il arrive. 5 tirs enchaînés par série.
  gardien: {
    scene: () => '<div class="t3"><div class="t3-zones"></div></div>',
    essai: essai3d('gardien'),
    demo(ent) {
      const s = MJ.secret || {colonne: 'c', hauteur: 'b', duree: 700};
      const resultat = ent.temps > s.duree + 60 ? 'tard' : ent.colonne === s.colonne && ent.hauteur === s.hauteur ? 'arret' : ent.colonne === s.colonne && Math.random() < .35 ? 'arret' : 'but';
      return {resultat, reponse: s};
    },
  },
  // La contre-attaque en 2 contre 1 : dessine la passe, ou garde le ballon si le défenseur part sur ton partenaire.
  contre: {
    scene: () => '<div class="t3"><svg class="t3-trace" aria-hidden="true"><polyline points=""/></svg></div>',
    essai: essai3d('contre'),
    demo(ent) {
      const s = MJ.secret || {defenseur: 'A', engage: 1000}, x = ent.qualite || 0;
      let resultat;
      if (ent.passe) resultat = ent.temps > s.engage + 900 ? 'neutralise' : s.defenseur === 'A'
        ? (x < .35 && Math.random() < .75 ? 'interception' : Math.random() < (1 - x) * .3 ? 'interception' : 'but')
        : (Math.random() < .7 ? 'interception' : 'but');
      else resultat = s.defenseur === 'B' ? 'but' : Math.random() < .9 ? 'neutralise' : 'but';
      return {resultat, reponse: s};
    },
  },
  // Le tir en suspension : touche vite pour courir, le saut part tout seul ; en l'air, dessine ton tir.
  suspension: {
    scene: () => '<div class="t3"><div class="s3-vitesse"><i></i><small>Vitesse</small></div></div>',
    essai: essai3d('suspension'),
    demo(ent) {   // mêmes règles que mini_jouer : élan = barre × hauteur au tir (pleines à 99 %) ; au sommet avec une barre pleine, toujours but ; sinon élan³
      const vit = Math.min(1, Math.max(0, ent.vitesse || 0)), hau = Math.min(1, Math.max(0, ent.hauteur || 0)), elan = Math.min(1, vit / .99) * Math.min(1, hau / .99);
      const resultat = elan >= 1 || Math.random() < elan ** 3 ? 'but' : hau < .6 || Math.random() < .5 ? 'contre' : 'arret';
      return {resultat, reponse: {x: Math.random() < .5 ? .2 : .8, y: Math.random() < .5 ? .3 : .75}};
    },
  },
};

// ── intro : le logo du club au milieu, 10 cartes autour ; on touche le logo, les cartes s'envolent ─────
// Une fois par jour (?intro dans l'adresse pour la revoir). Le jeu se charge et s'affiche dessous pendant ce temps.
const INTRO_CARTES = [   // [carte, palier, note, place autour du logo : 0 = en haut, puis dans le sens des aiguilles d'une montre]
  ['wassia-donzow', 'ultime', 96, 0], ['julie-valentin', 'ultime', 92, 5], ['amandine-faugerolles', 'or', 87, 2], ['lilian-clet', 'or', 83, 7],
  ['ingrid-cnudde', 'argent', 66, 1], ['cecilia-ennelin', 'argent', 64, 6], ['mael-benharoun', 'argent', 62, 3], ['yohann-besnard', 'argent', 61, 8],
  ['victoire-grivet', 'bronze', 53, 4], ['sebastien-schumi', 'bronze', 52, 9]];
const CLE_INTRO = 'mhc-intro';
const INTRO = {el: null, parti: false, demande: false, pret: false};
const jourLocal = () => new Date().toLocaleDateString('sv');   // AAAA-MM-JJ, à l'heure du téléphone
function introDuJour() {
  const p = new URLSearchParams(location.search);
  if (p.has('intro')) return true;
  if (p.has('demo')) return false;   // démo de l'ouverture des boosters : directement
  if (/access_token|type=|error=/.test(location.hash)) return false;   // retour d'un lien de connexion ou de confirmation
  try { if (localStorage.getItem(CLE_INTRO) === jourLocal()) return false; localStorage.setItem(CLE_INTRO, jourLocal()); } catch (e) {}
  return true;
}
function ouvrirIntro() {
  if (!introDuJour()) return;
  const el = document.createElement('div');
  el.id = 'intro'; el.className = 'intro';
  el.innerHTML = `<div class="intro-cartes"></div>
    <button class="intro-logo" aria-label="Lancer le jeu"><img src="assets/logo.png" alt="Médoc Handball"></button>
    <p class="intro-tap">Touche le logo</p>
    <button class="intro-passer">Passer</button>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro');
  el.querySelector('.intro-logo').addEventListener('click', sortieIntro);
  el.querySelector('.intro-passer').addEventListener('click', sortieIntro);
  INTRO.el = el;
}
// Les cartes arrivent une fois le catalogue chargé et leurs photos prêtes (2,5 s au plus)
function cartesIntro() {
  if (!INTRO.el || INTRO.parti) return;
  const W = innerWidth, H = innerHeight, w = Math.round(Math.max(72, Math.min(W * .25, H * .17, 170))), h = w / .69;
  const cartes = INTRO_CARTES.filter(([id]) => PAR_ID[id]).map(([id, palier, note, place]) => ({c: vueExemplaire(PAR_ID[id], {palier, note}), place}));
  const photos = cartes.map(x => x.c.photo).filter(Boolean).map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; }));
  Promise.race([Promise.all(photos), new Promise(r => setTimeout(r, 2500))]).then(() => {
    if (INTRO.parti) return;
    INTRO.el.querySelector('.intro-cartes').innerHTML = cartes.map(({c, place}, i) => {
      const a = [-90, -50, -15, 15, 50, 90, 130, 165, 195, 230][place] * Math.PI / 180;   // autour du logo, sur une ellipse qui suit l'écran, plus serrée sur les côtés
      const x = Math.min(W - w / 2 + 6, Math.max(w / 2 - 6, W / 2 + Math.cos(a) * W * .39));
      const y = Math.min(H - h / 2 - 8, Math.max(h / 2 + 8, H / 2 + Math.sin(a) * H * .37));
      const r = Math.round((Math.cos(a) * 9 + ((place * 7) % 5) - 2) * 10) / 10;   // penchées vers l'extérieur
      return `<div class="intro-carte" style="left:${x}px;top:${y}px;--i:${i};--r:${r}deg;--d:${3.4 + (place % 4) * .45}s">
        <div class="ic-a"><div class="ic-f">${carteHTML(c).replace('class="card', `style="--w:${w}px" class="card`)}</div></div></div>`;
    }).join('');
    INTRO.pret = true;
    if (INTRO.demande) sortieIntro();
  });
}
function sortieIntro() {
  const el = INTRO.el;
  if (!el || INTRO.parti) return;
  if (!INTRO.pret && !INTRO.demande) { INTRO.demande = true; el.classList.add('attente'); setTimeout(() => { INTRO.pret = true; sortieIntro(); }, 1800); return; }
  INTRO.parti = true;
  vibrer(25); Son.jouer('intro');
  const fin = () => { el.remove(); INTRO.el = null; document.body.classList.remove('avec-intro'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.animate([{opacity: 1}, {opacity: 0}], {duration: 250, fill: 'forwards'}).onfinish = fin; return; }
  el.classList.add('sortie');
  const W = innerWidth, H = innerHeight, loin = Math.max(W, H) * 1.25;
  el.querySelectorAll('.intro-carte').forEach((c, i) => {
    const b = c.getBoundingClientRect(), dx = b.left + b.width / 2 - W / 2, dy = b.top + b.height / 2 - H / 2, n = Math.hypot(dx, dy) || 1;
    const tourne = (dx >= 0 ? 1 : -1) * (25 + (i % 3) * 12);
    c.animate([{transform: 'translate(-50%, -50%)'},
               {transform: `translate(-50%, -50%) translate(${dx / n * -14}px, ${dy / n * -14}px) scale(1.04)`, offset: .18},
               {transform: `translate(-50%, -50%) translate(${dx / n * loin}px, ${dy / n * loin}px) rotate(${tourne}deg) scale(1.15)`}],
      {duration: 720, delay: (i % 5) * 35, easing: 'cubic-bezier(.5, 0, .75, .2)', fill: 'forwards'});
  });
  el.querySelector('.intro-logo').animate([{transform: 'scale(1)', opacity: 1}, {transform: 'scale(.88)', opacity: 1, offset: .2}, {transform: 'scale(1.5)', opacity: 0}],
    {duration: 650, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'forwards'});
  el.animate([{opacity: 1}, {opacity: 1, offset: .45}, {opacity: 0}], {duration: 900, fill: 'forwards'}).onfinish = fin;
}
ouvrirIntro();

// ── démarrage ───────────────────────────────────────────────────────────────────
Compte.surChangement(() => { if ($('#overlay').hidden) route(); else majEntete(); });
Compte.demarrer().then(info => {
  CARTES = info.cartes; CARTES.forEach(c => PAR_ID[c.id] = c);
  MAJ = info.maj ? new Date(info.maj).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : '';
  route();
  cartesIntro();
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo === '7m') ouvrirJet7m(true);
  else if (MINI[demo]) ouvrirMini(demo, true);
  else if (demo === 'montee') demoMontee();
  else if (demo === 'sept') demoSept();
  else if (demo !== null) demoBooster(demo);
  if (info.erreurLien) { if (Compte.connecte) toast(info.erreurLien); else { messageCompte = info.erreurLien; route(); } }   // une seule fois à l'écran
  else if (info.confirme) toast('Adresse confirmée, bienvenue !');
  else if (info.horsLigne) toast('Hors ligne : ton club reste consultable');
  else if (info.apercu) toast('Aperçu avec les modifications non publiées de l’outil');
}).catch(e => {
  console.error(e);
  $('#view').innerHTML = '<h1>Oups</h1><p class="sub">Impossible de joindre le serveur du jeu. Vérifie ta connexion et recharge la page.</p>';
  INTRO.pret = true; if (INTRO.demande) sortieIntro();
});

// En ligne (https) : toujours. En local : seulement avec ?sw dans l'adresse, pour tester le hors-ligne
// sans que le cache gêne pendant qu'on modifie les fichiers.
if ('serviceWorker' in navigator && window.isSecureContext && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw')))
  navigator.serviceWorker.register('sw.js');
