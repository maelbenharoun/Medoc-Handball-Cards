'use strict';
/* Médoc Hand Cards — jeu de cartes à collectionner avec les joueurs et joueuses du Médoc Handball.
   Ce fichier : l'affichage (vues #accueil, #club, #equipe, #jouer, connexion, ouverture des boosters, matchs).
   Les cartes (paliers, stats, rendu) sont dans cartes.js, partagé avec l'outil admin.html ;
   le compte du joueur dans serveur.js : toutes les règles sont appliquées par le serveur (supabase/schema.sql). */

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
const nb = n => (n || 0).toLocaleString('fr-FR');
const EX = () => S().exemplaires || [];
const exParId = id => EX().find(e => e.id === id);
const rangEx = (a, b) => RARETES.indexOf(b.palier) - RARETES.indexOf(a.palier) || b.note - a.note || b.xp - a.xp;
const mesEx = carte => EX().filter(e => e.carte === carte).sort(rangEx);
const vue = ex => vueExemplaire(PAR_ID[ex.carte], ex);   // carte affichable d'un exemplaire
const dansEquipe = id => Object.values(S().equipe || {}).includes(id);
const fusionsPossibles = carte => RARETES.filter(r => palierSuivant(r)
  && EX().filter(e => e.carte === carte && e.palier === r && !e.verrou).length >= (PARAMS.fusion_nombre || 3));

// Poste du terrain : GB pour les gardien(ne)s, les 6 autres pour les joueurs de champ.
// Hors de son poste, une carte perd MALUS_HORS_POSTE points (sans poste renseigné, elle joue partout sans malus).
const peutJouer = (c, slot) => slot === 'GB' ? c.estGB : !c.estGB;
const horsPoste = (c, slot) => slot !== 'GB' && !!c.poste && c.poste !== slot;
const noteAuPoste = (c, slot) => c.ovr - (horsPoste(c, slot) ? MALUS_HORS_POSTE : 0);
const aligne = slot => {
  const e = exParId(S().equipe?.[slot]);
  if (!e || !PAR_ID[e.carte]) return null;
  const c = vue(e); return peutJouer(c, slot) ? c : null;
};

let piecesAffichees = null;
function majPieces() {
  const v = S().pieces;
  if (piecesAffichees !== null && v !== piecesAffichees) { const c = $('#coins'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 220); }
  piecesAffichees = v; $('#coinv').textContent = nb(v);
}
// enchaîne une action du compte : une seule à la fois, message en cas de refus, pièces et niveaux à jour
function action(promesse, suite) {
  occupe = true;
  return promesse.then(r => { occupe = false; majPieces(); celebrer(r?.niveaux); return suite ? suite(r) : r; })
    .catch(e => { occupe = false; majPieces(); toast(e.message || 'Action impossible'); });
}
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), Math.max(2200, t.length * 60));   // le temps de lire
}
// niveaux de compte gagnés pendant une action : récompenses à annoncer
function celebrer(niveaux) {
  if (!niveaux?.length) return;
  const n = niveaux[niveaux.length - 1], pieces = niveaux.reduce((t, x) => t + x.pieces, 0);
  const boosters = niveaux.map(x => x.booster === 'or' ? 'booster Or' : 'booster').join(', ');
  setTimeout(() => toast(`Niveau ${n.niveau} ! +${nb(pieces)} pièces, +${boosters}`), 400);
  vibrer([30, 40, 30]);
}

// ── vues ────────────────────────────────────────────────────────────────────────
const VUES = {accueil: vueAccueil, club: vueClub, equipe: vueEquipe, jouer: vueJouer, compte: vueCompte};
// onglet demandé dans l'adresse (#club…) ; tout le reste, dont les retours de connexion, mène à l'accueil
function vueCourante() {
  const v = location.hash.slice(1);
  return VUES[v] && v !== 'compte' ? v : 'accueil';
}
function route(garderDefilement) {
  const v = Compte.pret ? vueCourante() : 'compte';   // connexion et profil d'abord
  majEntete();
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === v));
  $('#view').innerHTML = VUES[v]();
  if (!garderDefilement) window.scrollTo(0, 0);
  minuteur();
}
function majEntete() {
  $('#coins').hidden = !Compte.pret;
  $('.tabs').hidden = !Compte.pret;
  const moi = $('#moi');
  moi.hidden = !Compte.pret;
  moi.textContent = S().niveau || 1;
  moi.setAttribute('aria-label', `Mon compte, niveau ${S().niveau || 1}`);
  const n = (S().boosters || 0) + (S().bonus || 0) + (S().bonusOr || 0) + (S().depart === false ? 1 : 0)
    + (S().quetes || []).filter(q => q.progres >= q.objectif && !q.reclamee).length;
  const pastille = $('#pastille'); pastille.hidden = !n || !Compte.pret; pastille.textContent = n;
  if (Compte.pret) majPieces();
}

// ── accueil : niveau, boosters, quêtes ──────────────────────────────────────────
function secondesAvantBooster() {
  const s = S().prochainBooster;
  return s == null ? null : Math.max(0, Math.ceil(s - (Date.now() - S().recu) / 1000));
}
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function minuteur() {
  clearInterval(minuteur.t);
  if (!$('#minuteur')) return;
  minuteur.t = setInterval(() => {
    const el = $('#minuteur'); if (!el) return clearInterval(minuteur.t);
    const s = secondesAvantBooster();
    el.textContent = mmss(s || 0);
    if (s === 0 && !minuteur.charge && !occupe) {   // un booster vient d'arriver
      minuteur.charge = true; clearInterval(minuteur.t);
      Compte.rafraichir().catch(() => {}).finally(() => { minuteur.charge = false; if ($('#overlay').hidden) route(true); });
    }
  }, 1000);
}
function vueAccueil() {
  const e = S(), s = secondesAvantBooster(), chances = PARAMS.booster_chances || {};
  const pct = Math.round(100 * e.xp / (e.xpNiveau || 1));
  const quetes = (e.quetes || []).map(q => {
    const fini = q.progres >= q.objectif;
    return `<div class="quete${q.reclamee ? ' faite' : ''}"><div><b>${esc(q.texte)}</b><small>${q.progres}/${q.objectif} · +${q.xp} XP · +${nb(q.pieces)} pièces</small>
      <div class="bar"><i style="width:${100 * q.progres / q.objectif}%"></i></div></div>
      ${q.reclamee ? '<span class="ok">✓</span>' : fini ? `<button class="btn gold petit" data-quete="${q.id}">Récupérer</button>` : ''}</div>`;
  }).join('');
  const differentes = new Set(EX().map(x => x.carte)).size;
  return `<h1>Salut ${esc(e.pseudo)}</h1>
    ${Compte.horsLigne ? '<div class="daily hors"><p><b>Hors ligne</b>Ton club reste consultable. Reviens en ligne pour jouer.</p></div>' : ''}
    <div class="niveau"><div><b>Niveau ${e.niveau}</b><small>${nb(e.xp)} / ${nb(e.xpNiveau)} XP</small></div><div class="bar"><i style="width:${pct}%"></i></div>
      <small>Chaque niveau : des pièces et un booster. Tous les ${PARAMS.niveau_or_tous || 5} niveaux : un booster Or.</small></div>
    ${e.depart === false ? `<div class="daily depart"><p><b>Booster de départ</b>7 joueurs, un à chaque poste : ton premier 7 !</p>
      <button class="btn gold" data-act="depart">Ouvrir</button></div>` : ''}
    <h2>Boosters</h2>
    <div class="boosters">
      <button class="booster" data-booster="gratuit"${e.boosters < 1 ? ' disabled' : ''}>
        <span class="b-art"><img src="assets/logo.png" alt=""><b>×${e.boosters}</b></span>
        <span class="b-txt"><b>Booster gratuit</b><small>${e.boosters}/${e.boosterMax} en stock · ${s == null ? 'stock plein' : `prochain dans <span id="minuteur">${mmss(s)}</span>`}</small></span>
      </button>
      ${e.bonus ? `<button class="booster bonus" data-booster="bonus"><span class="b-art"><img src="assets/logo.png" alt=""><b>×${e.bonus}</b></span>
        <span class="b-txt"><b>Booster bonus</b><small>Gagné en montant de niveau</small></span></button>` : ''}
      ${e.bonusOr ? `<button class="booster orr" data-booster="or"><span class="b-art"><img src="assets/logo.png" alt=""><b>×${e.bonusOr}</b></span>
        <span class="b-txt"><b>Booster Or</b><small>Une carte Or ou Ultime</small></span></button>` : ''}
    </div>
    <p class="sub petit">Un joueur par booster : ${RARETES.map(r => `${chances[r] ?? 0} % ${R_LABEL[r]}`).join(' · ')}. Un booster gratuit toutes les ${PARAMS.booster_minutes || 30} minutes, ${e.boosterMax} au plus en stock.</p>
    <h2>Quêtes du jour</h2>
    <div class="quetes">${quetes || '<p class="sub">Reviens demain pour de nouvelles quêtes.</p>'}</div>
    <h2>Ta collection</h2>
    <div class="stats-row"><div class="stat"><b>${differentes}/${enJeu().length}</b><span>joueurs</span></div>
    <div class="stat"><b>${EX().length}</b><span>cartes</span></div>
    <div class="stat"><b>${noteEquipe().note || '–'}</b><span>note Mon 7</span></div></div>
    <p class="sub petit" style="margin-top:18px">4 paliers pour chaque joueur : ${PALIERS.map(p => `${p.nom} ${p.min}–${p.max}`).join(' · ')}.
      Entraîne tes cartes pour les faire monter dans leur palier ; 3 fois le même joueur au même palier = 1 au palier suivant.</p>`;
}

// ── club : la collection ────────────────────────────────────────────────────────
const enJeu = () => CARTES.filter(c => c.actif !== false);   // cartes encore tirées dans les boosters
function vueClub() {
  const eqs = ['tous', 'SG1', 'SG2', 'SF1', 'SF2', 'fusion'];
  const vus = CARTES.filter(c => (c.actif !== false || mesEx(c.id).length)
    && (filtre === 'tous' || c.equipe === filtre || (filtre === 'fusion' && fusionsPossibles(c.id).length)));
  const mes = vus.filter(c => mesEx(c.id).length).sort((a, b) => rangEx(mesEx(a.id)[0], mesEx(b.id)[0]));
  const autres = filtre === 'fusion' ? [] : vus.filter(c => !mesEx(c.id).length);
  const nf = CARTES.filter(c => fusionsPossibles(c.id).length).length;
  return `<h1>Mon club</h1>
    <p class="sub">${mes.length}/${vus.length} joueurs · ${EX().length} cartes. Touche une carte pour l’entraîner, la fusionner ou la vendre.</p>
    <div class="bar"><i style="width:${vus.length ? 100 * mes.length / vus.length : 0}%"></i></div>
    <div class="filters" style="margin-top:14px">${eqs.map(e => `<button data-filtre="${e}" class="${filtre === e ? 'on' : ''}">${
      e === 'tous' ? 'Toutes' : e === 'fusion' ? `Fusions (${nf})` : e}</button>`).join('')}</div>
    <div class="grid">${mes.map(c => {
      const best = mesEx(c.id)[0], n = mesEx(c.id).length;
      return carteHTML(vue(best), {qty: n, cls: fusionsPossibles(c.id).length ? 'peut-fusion' : ''});
    }).join('')}${autres.map(c => carteHTML(c, {cache: true})).join('')}</div>
    ${!mes.length && filtre === 'fusion' ? '<p class="sub">Aucune fusion possible : il faut 3 fois le même joueur au même palier.</p>' : ''}`;
}

// Fiche d'un joueur : ses 4 paliers, tes exemplaires, entraînement, fusion, vente
function fiche(carte) {
  const c = PAR_ID[carte], mes = mesEx(carte), n = PARAMS.fusion_nombre || 3;
  const paliers = PALIERS.map(p => {
    const a = mes.some(e => e.palier === p.id);
    return `<div class="pal${a ? '' : ' absent'}">${carteHTML(vueExemplaire(c, {palier: p.id, note: p.min}))}<small>${p.nom} ${p.min}–${p.max}</small></div>`;
  }).join('');
  const lignes = mes.map(e => {
    const v = vue(e), max = PALIER[e.palier].max, besoin = PARAMS.xp_par_point?.[e.palier] || 100;
    const cout = PARAMS.entrainement_cout?.[e.palier], gain = PARAMS.vente?.[e.palier];
    return `<div class="exl">${carteHTML(v)}<div class="exl-d"><b>${R_LABEL[e.palier]} ${e.note}${e.note >= max ? ' · max' : ''}</b>
      <small>${e.note >= max ? 'Au plafond du palier : fusionne pour monter' : `${e.xp}/${besoin} XP avant ${e.note + 1}`}${dansEquipe(e.id) ? ' · dans ton 7' : ''}${e.verrou ? ' · au marché' : ''}</small>
      ${e.note < max ? `<div class="bar"><i style="width:${100 * e.xp / besoin}%"></i></div>` : ''}
      <div class="exl-b">${e.note < max ? `<button class="btn gold petit" data-entrainer="${e.id}">Entraîner · ${nb(cout)}</button>` : ''}
        ${!dansEquipe(e.id) && !e.verrou ? `<button class="btn ghost petit" data-vendre="${e.id}">Vendre · +${nb(gain)}</button>` : ''}</div></div></div>`;
  }).join('');
  const fusions = RARETES.filter(r => palierSuivant(r)).map(r => {
    const k = mes.filter(e => e.palier === r && !e.verrou).length;
    if (!k) return '';
    const cout = PARAMS.fusion_cout?.[r];
    return k >= n ? `<button class="btn gold large" data-fusion="${carte}:${r}">Fusionner ${n} ${R_LABEL[r]} → 1 ${R_LABEL[palierSuivant(r)]} ${PALIER[palierSuivant(r)].min} · ${nb(cout)} pièces</button>`
      : `<p class="sub petit">${R_LABEL[r]} : ${k}/${n} pour fusionner vers ${R_LABEL[palierSuivant(r)]}</p>`;
  }).join('');
  ouvrirOverlay(`<div class="sheet fiche">
    <h3>${esc(c.nom)} <small>${c.equipe} · ${c.poste ? POSTE_NOM[c.poste] : 'Joueur(se) de champ'}</small></h3>
    <div class="paliers">${paliers}</div>
    <div class="kv"><div><b>${c.mj}</b><span>matchs</span></div><div><b>${c.buts}</b><span>buts</span></div><div><b>${String(c.bpm).replace('.', ',')}</b><span>buts / match</span></div></div>
    ${mes.length ? `<h4>Tes cartes (${mes.length})</h4>${lignes}${fusions}` : '<p class="sub">Tu n’as pas encore ce joueur : ouvre des boosters !</p>'}
    <button class="btn" data-act="fermer">Fermer</button></div>`);
}

// ── Mon 7 ───────────────────────────────────────────────────────────────────────
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
function choisir(poste) {
  // un même joueur ne joue qu'une fois : on écarte ceux déjà alignés à un autre poste
  const ailleurs = new Set(Object.entries(S().equipe || {}).filter(([k]) => k !== poste).map(([, id]) => exParId(id)?.carte));
  const ok = EX().filter(e => !e.verrou && PAR_ID[e.carte] && !ailleurs.has(e.carte) && peutJouer(PAR_ID[e.carte], poste))
    .map(vue).sort((a, b) => noteAuPoste(b, poste) - noteAuPoste(a, poste));
  ouvrirOverlay(`<div class="sheet"><h3>${poste === 'GB' ? 'Gardien(ne) de but' : 'Poste ' + poste}</h3>
    <div class="picklist">${ok.length ? ok.map(c => `<button class="pick" data-choix="${c.ex.id}" data-poste="${poste}">${carteHTML(c, {note: noteAuPoste(c, poste)})}<div><b>${esc(c.nom)}</b><small>${noteAuPoste(c, poste)} · ${R_LABEL[c.rarete]} · ${posteAffiche(c)} · ${c.equipe}${horsPoste(c, poste) ? ` · hors poste −${MALUS_HORS_POSTE}` : ''}</small></div></button>`).join('')
      : `<p class="sub">Aucune carte disponible pour ce poste. Ouvre des boosters !</p>`}</div>
    <div style="display:flex;gap:10px">${S().equipe?.[poste] ? `<button class="btn ghost" style="flex:1" data-act="retirer" data-poste="${poste}">Retirer</button>` : ''}
    <button class="btn" style="flex:1" data-act="fermer">Fermer</button></div></div>`);
}
function autoEquipe() {
  // le meilleur exemplaire de chaque joueur, puis la meilleure répartition (malus hors poste compris)
  const meilleurs = Object.values(EX().filter(e => !e.verrou && PAR_ID[e.carte]).reduce((m, e) => {
    if (!m[e.carte] || rangEx(e, m[e.carte]) < 0) m[e.carte] = e; return m; }, {})).map(vue);
  const equipe = {};
  const gb = meilleurs.filter(c => c.estGB).sort((a, b) => b.ovr - a.ovr)[0];
  if (gb) equipe.GB = gb.ex.id;
  // pour chaque ensemble de postes occupés (masque de bits), on garde le meilleur total trouvé
  const slots = POSTES.filter(x => !x.gb).map(x => x.id);
  let best = new Map([[0, {total: 0, choix: {}}]]);
  for (const c of meilleurs.filter(c => !c.estGB)) {
    const suite = new Map(best);
    for (const [masque, e] of best) slots.forEach((slot, i) => {
      if (masque & (1 << i)) return;
      const m = masque | (1 << i), total = e.total + noteAuPoste(c, slot);
      if (!(suite.get(m)?.total >= total)) suite.set(m, {total, choix: {...e.choix, [slot]: c.ex.id}});
    });
    best = suite;
  }
  Object.assign(equipe, [...best.values()].reduce((a, e) => e.total > a.total ? e : a).choix);
  action(Compte.alignerEquipe(equipe), () => { toast('Ton meilleur 7 est aligné'); route(true); });
}

// ── jouer : championnat, séance, défis ──────────────────────────────────────────
const TACTIQUES = [['attaque', 'Attaque', 'Plus de buts marqués, mais plus de buts encaissés'], ['equilibre', 'Équilibre', 'Ni trop offensif, ni trop défensif'],
  ['defense', 'Défense', 'Moins de buts encaissés, mais moins de buts marqués']];
const JEU = {tactique: null, adversaires: null, rencontres: null, recherche: '', joueurs: [], t: 0, charge: false};
const RES = {gagne: 'Victoire', nul: 'Match nul', perdu: 'Défaite'};
function chargerJeu(force) {
  if (JEU.charge || (!force && JEU.adversaires && JEU.rencontres) || Compte.horsLigne) return;
  JEU.charge = true;
  Promise.all([Compte.adversaires(), Compte.rencontres()]).then(([a, r]) => { JEU.adversaires = a; JEU.rencontres = r; })
    .catch(e => toast(e.message)).finally(() => { JEU.charge = false; if (vueCourante() === 'jouer' && $('#overlay').hidden) route(true); });
}
function vueJouer() {
  chargerJeu();
  const e = S(), sa = e.saison || {}, j = e.jour || {}, l = e.limites || {}, t = JEU.tactique || e.tactique || 'equilibre';
  const complet = noteEquipe().n === 7, note = noteEquipe().note;
  const restant = (k) => Math.max(0, (l[k] || 0) - (j[k] || 0));
  const adv = (JEU.adversaires || []).map(x => `<div class="adv"><div><b>${esc(x.pseudo)}</b><small>niveau ${x.niveau} · 7 de ${x.note ?? '–'} · ${x.trophees} 🏆</small></div>
    <button class="btn gold petit" data-defier="${esc(x.pseudo)}"${complet && restant('defi') ? '' : ' disabled'}>Défier</button></div>`).join('');
  const histo = (JEU.rencontres || []).slice(0, 8).map(r => `<div class="hist r-${r.resultat}"><b>${r.score ? r.score.join(' – ') : ''}</b>
    <span>${r.type === 'championnat' ? 'Championnat' : r.type === 'defi' ? 'Défi' : 'Défendu'} · ${esc(r.adversaire)}</span><small>${RES[r.resultat] || ''}</small></div>`).join('');
  return `<h1>Jouer</h1>
    ${complet ? '' : '<div class="daily hors"><p><b>Ton 7 n’est pas complet</b>Aligne 7 joueurs dans Mon 7 pour jouer des matchs.</p></div>'}
    <h2>Tactique</h2>
    <div class="filters">${TACTIQUES.map(([k, n]) => `<button data-tactique="${k}" class="${t === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <p class="sub petit">${TACTIQUES.find(x => x[0] === t)[2]}. Elle sert aussi quand on te défie.</p>
    <div class="mode"><div class="mode-t"><b>${esc(e.divisionNom || 'Championnat')}</b><span>${sa.journee}/${sa.matchs} matchs · ${sa.points} pts</span></div>
      <div class="bar"><i style="width:${100 * sa.points / (sa.montee || 20)}%"></i></div>
      <p class="sub petit">${sa.points >= sa.montee ? 'Objectif atteint : la montée t’attend en fin de saison !' : `${sa.montee} points en fin de saison pour ${e.division < 4 ? 'monter' : 'être champion'}`}
        · bilan ${sa.bilan?.v || 0} V, ${sa.bilan?.n || 0} N, ${sa.bilan?.d || 0} D</p>
      <div class="affiche"><div><small>Ton 7</small><b>${note || '–'}</b></div><span>contre</span><div><small>${esc(sa.adversaire || '')}</small><b>≈ ${sa.niveauAdversaire || '–'}</b></div></div>
      <button class="btn gold large" data-act="championnat"${complet && restant('championnat') ? '' : ' disabled'}>Jouer la journée ${sa.journee + 1}</button>
      <p class="sub petit centre">${restant('championnat')} match${restant('championnat') > 1 ? 's' : ''} restant${restant('championnat') > 1 ? 's' : ''} aujourd’hui</p></div>
    <div class="mode"><div class="mode-t"><b>Entraînement d’équipe</b><span>${restant('seance')}/${l.seance || 5} aujourd’hui</span></div>
      <p class="sub petit">+${PARAMS.seance_xp_carte || 40} XP pour chaque joueur de ton 7, sans risque.</p>
      <button class="btn ghost large" data-act="seance"${restant('seance') && e.equipe && Object.keys(e.equipe).length ? '' : ' disabled'}>Lancer une séance</button></div>
    <div class="mode"><div class="mode-t"><b>Défis</b><span>${e.trophees || 0} 🏆</span></div>
      <p class="sub petit">Affronte le 7 d’un autre joueur (il défend avec sa dernière tactique). ${restant('defi')}/${l.defi || 5} défis restants aujourd’hui.</p>
      <input class="champ" type="search" placeholder="Chercher un joueur à défier" value="${esc(JEU.recherche)}" data-cherche-defi autocapitalize="off" autocomplete="off" spellcheck="false">
      <div id="joueurs-defi">${joueursDefi()}</div>
      ${JEU.adversaires ? (adv || '<p class="sub petit">Pas encore d’adversaire avec un 7 complet.</p>') : '<p class="sub petit">Chargement…</p>'}
      <button class="lien" data-act="classement">Voir le classement</button></div>
    ${histo ? `<h2>Derniers matchs</h2><div class="hists">${histo}</div>` : ''}`;
}
function joueursDefi() {
  if (JEU.recherche.trim().length < 2) return '';
  if (!JEU.joueurs.length) return '<p class="sub petit">Aucun joueur trouvé.</p>';
  return JEU.joueurs.map(p => `<div class="adv"><div><b>${esc(p)}</b></div><button class="btn gold petit" data-defier="${esc(p)}">Défier</button></div>`).join('');
}
function fenetreClassement() {
  action(Compte.classement(), c => ouvrirOverlay(`<div class="sheet"><h3>Classement des défis</h3>
    <p class="sub">Tu es ${c.rang}${c.rang === 1 ? 'er' : 'e'} avec ${c.trophees} 🏆</p>
    <div class="classe">${c.top.map((x, i) => `<div class="${x.pseudo === S().pseudo ? 'moi-l' : ''}"><span>${i + 1}</span><b>${esc(x.pseudo)}</b><small>niv. ${x.niveau}</small><em>${x.trophees} 🏆</em></div>`).join('')}</div>
    <button class="btn" data-act="fermer">Fermer</button></div>`));
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
  const {r} = MATCH, g = r.gains || {}, res = r.match.resultat, fin = r.finSaison;
  if (MATCH.i < r.match.buts.length) avancerMatch(60);   // « voir le résultat » : on affiche tout
  if (!$('#fin-match') || $('#fin-match').dataset.fait) return;
  $('#fin-match').dataset.fait = 1;
  vibrer(res === 'gagne' ? [40, 60, 80] : 30);
  const progres = (r.progres || []).map(p => `${esc(p.nom)} ${p.avant} → <b>${p.apres}</b>`).join(' · ');
  $('#fin-match').innerHTML = `<div class="resultat r-${res}"><b>${RES[res]} ${r.match.a} – ${r.match.b}</b>
      <small>${g.points != null ? `+${g.points} pt${g.points > 1 ? 's' : ''} · ` : ''}+${nb(g.pieces)} pièces · +${g.xp} XP${g.trophees != null ? ` · ${g.trophees >= 0 ? '+' : ''}${g.trophees} 🏆` : ''}</small></div>
    ${progres ? `<p class="sub petit centre">Progrès : ${progres}</p>` : ''}
    ${fin ? `<div class="daily depart"><p><b>${fin.montee ? 'Montée !' : fin.champion ? 'Champion !' : 'Fin de saison'}</b>${fin.points} points · +${nb(fin.pieces)} pièces${fin.champion ? ' · +1 booster' : ''}${
      fin.montee ? ` · bienvenue en ${esc(S().divisionNom)}` : fin.champion ? '' : ' · nouvelle saison, nouvel essai'}</p></div>` : ''}
    <button class="btn gold large" data-act="fin-match">Continuer</button>`;
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
    <p class="sub">Connecte-toi pour ouvrir tes boosters, entraîner tes joueurs et construire ton 7.</p></div>${msg}
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
  const e = S();
  ouvrirOverlay(`<div class="sheet"><h3>${esc(e.pseudo)} <small>niveau ${e.niveau}</small></h3><p class="sub">${esc(Compte.email)}</p>
    <button class="btn ghost" data-act="deconnexion">Se déconnecter</button>
    <a class="btn ghost" href="confidentialite.html">Données personnelles</a>
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
function ouvrirOverlay(html) { const o = $('#overlay'); o.innerHTML = html; o.hidden = false; document.body.style.overflow = 'hidden'; }
function fermerOverlay() { const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; document.body.style.overflow = ''; route(true); }

// ── ouverture des boosters ──────────────────────────────────────────────────────
// promesse : action du compte qui renvoie {ids} ; nom et cls : l'emballage montré avant d'ouvrir
function ouvrirBooster(promesse, nom, cls) {
  if (occupe) return;
  const avant = new Set(EX().map(e => e.carte));
  action(promesse, ({ids}) => {
    ouvrirBooster.res = ids.map(exParId).filter(e => e && PAR_ID[e.carte]).map(e => ({c: vue(e), nouveau: !avant.has(e.carte)}))
      .sort((a, b) => rangEx(a.c.ex, b.c.ex));
    ouvrirOverlay(`<div class="opening"><button class="bigpack ${cls}" data-act="dechirer" aria-label="Ouvrir le booster">
        <div class="pack-art" style="position:absolute;inset:0"><img src="assets/logo.png" alt=""><span class="pn">${nom}</span></div></button>
      <p class="tap">Touche le booster pour l’ouvrir</p></div>`);
  });
}
function dechirer() {
  const res = ouvrirBooster.res, top = res[0].c;
  $('.bigpack').classList.add('burst'); $('.tap').remove();
  vibrer(30);
  setTimeout(() => RARETES.indexOf(top.rarete) >= RARETES.indexOf('or') ? walkout(top, res) : montrer(res), 520);
}
// Révélation façon « walkout » pour les cartes Or et Ultime : équipe → poste → palier → carte
function walkout(c, res) {
  const etapes = [`<div class="clue"><small>ÉQUIPE</small>${c.equipe}</div>`, `<div class="clue"><small>POSTE</small>${posteAffiche(c)}</div>`,
    `<div class="clue c-${c.rarete}"><small>PALIER</small>${R_LABEL[c.rarete]}</div>`];
  let i = 0;
  const pas = () => {
    if (i < etapes.length) { $('#overlay').innerHTML = `<div class="walk"><div class="rays"></div>${etapes[i]}<p class="tap">Touche pour continuer</p></div>`; vibrer(20); i++; }
    else { $('#overlay').onclick = null; vibrer([40, 60, 80]); montrer(res); }
  };
  pas();
  setTimeout(() => { $('#overlay').onclick = e => { e.stopPropagation(); pas(); }; }, 50);
}
function montrer(res) {
  const nv = res.filter(r => r.nouveau).length, n = PARAMS.fusion_nombre || 3;
  const html = res.map(({c, nouveau}, i) => {
    const memes = EX().filter(e => e.carte === c.id && e.palier === c.rarete).length;
    const info = nouveau ? '' : memes >= n && palierSuivant(c.rarete) ? 'Fusion possible !' : `${memes}/${n} pour fusionner`;
    return `<div class="rv" style="animation-delay:${i * 140}ms">${carteHTML(c, {nouveau, cls: i === 0 ? 'hero' : ''})}${info ? `<small>${info}</small>` : ''}</div>`;
  }).join('');
  ouvrirOverlay(`<div class="sheet" style="align-items:center">
    ${res[0].c.rarete === 'ultime' ? '<div class="rays"></div>' : ''}
    <div class="reveal">${html}</div>
    <p class="sumline">${nv ? `<b>${nv} nouveau${nv > 1 ? 'x' : ''} joueur${nv > 1 ? 's' : ''}</b>` : 'Déjà dans ton club'}</p>
    <button class="btn" data-act="fermer" style="width:100%">Envoyer au club</button></div>`);
}
function vibrer(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

// ── événements ──────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-booster],[data-quete],[data-filtre],[data-slot],[data-choix],[data-entrainer],[data-vendre],[data-fusion],[data-tactique],[data-defier],.grid .card');
  if (!t) { if (e.target.id === 'overlay' && !$('.opening') && !$('.walk') && !$('.match')) fermerOverlay(); return; }
  const a = t.dataset.act, d = t.dataset;
  if (d.filtre) { filtre = d.filtre; return route(true); }
  if (d.slot) return choisir(d.slot);
  if (t.classList.contains('card') && !t.classList.contains('locked')) return fiche(t.dataset.id);
  if (a === 'fermer') return fermerOverlay();
  if (a === 'dechirer') return dechirer();
  if (a === 'moi') return fenetreCompte();
  if (d.tactique) { JEU.tactique = d.tactique; return route(true); }
  if (a === 'passer') return finMatch();
  if (a === 'fin-match') { JEU.rencontres = null; JEU.adversaires = null; return fermerOverlay(); }
  if (a === 'classement') return fenetreClassement();
  if (occupe) return;
  const tactique = JEU.tactique || S().tactique || 'equilibre';
  if (a === 'championnat') return jouerMatch(Compte.matchChampionnat(tactique), 'championnat');
  if (d.defier) return jouerMatch(Compte.defier(d.defier, tactique), 'defi');
  if (a === 'seance') return action(Compte.seance(), r => {
    const progres = (r.progres || []).map(p => `${esc(p.nom)} ${p.avant} → <b>${p.apres}</b>`).join('<br>');
    ouvrirOverlay(`<div class="sheet"><h3>Séance terminée</h3><p class="sub">+${r.xpCarte} XP pour chaque joueur de ton 7.</p>
      ${progres ? `<p class="sub">Ils progressent :<br>${progres}</p>` : '<p class="sub">Encore un peu de travail avant le prochain point.</p>'}
      <button class="btn" data-act="fermer">Fermer</button></div>`);
  });
  if (a === 'depart') return ouvrirBooster(Compte.ouvrirDepart(), 'Départ', 'pk-depart');
  if (d.booster) return ouvrirBooster(Compte.ouvrirBooster(d.booster), d.booster === 'or' ? 'Or' : d.booster === 'bonus' ? 'Bonus' : 'Booster',
    d.booster === 'or' ? 'pk-or' : 'pk-argent');
  if (d.quete) return action(Compte.reclamerQuete(d.quete), r => { toast(`+${r.xp} XP · +${nb(r.pieces)} pièces`); route(true); });
  if (d.choix) return action(Compte.aligner(d.poste, d.choix), fermerOverlay);
  if (a === 'retirer') return action(Compte.aligner(d.poste, null), fermerOverlay);
  if (a === 'auto') return autoEquipe();
  if (d.entrainer) {
    const carte = exParId(d.entrainer).carte;
    return action(Compte.entrainer(d.entrainer), r => { toast(r.apres > r.avant ? `+1 ! Note ${r.apres}` : '+XP : encore un peu d’entraînement'); fiche(carte); });
  }
  if (d.vendre) {
    const ex = exParId(d.vendre);
    if (RARETES.indexOf(ex.palier) >= RARETES.indexOf('or') && !confirm(`Vendre cette carte ${R_LABEL[ex.palier]} ${ex.note} pour ${nb(PARAMS.vente?.[ex.palier])} pièces ?`)) return;
    return action(Compte.vendre(d.vendre), r => { toast(`+${nb(r.gain)} pièces`); if (mesEx(ex.carte).length) fiche(ex.carte); else fermerOverlay(); });
  }
  if (d.fusion) {
    const [carte, palier] = d.fusion.split(':');
    return action(Compte.fusionner(carte, palier), r => {
      const e = exParId(r.id);
      ouvrirBooster.res = [{c: vue(e), nouveau: false}];
      vibrer([40, 60, 80]);
      montrer(ouvrirBooster.res);
      toast(`Fusion réussie : ${PAR_ID[carte].nom} passe ${R_LABEL[e.palier]} !`);
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
});
// recherche d'un joueur à défier (après une petite pause dans la frappe)
document.addEventListener('input', e => {
  if (e.target.dataset.chercheDefi === undefined) return;
  JEU.recherche = e.target.value;
  clearTimeout(JEU.t);
  JEU.t = setTimeout(() => {
    const q = JEU.recherche.trim(), maj = () => { const el = $('#joueurs-defi'); if (el) el.innerHTML = joueursDefi(); };
    if (q.length < 2) { JEU.joueurs = []; return maj(); }
    Compte.chercherJoueurs(q).then(l => { JEU.joueurs = l; maj(); }).catch(er => toast(er.message));
  }, 300);
});
window.addEventListener('hashchange', () => route());
// le réseau revient : on recharge pour se reconnecter au serveur (hors ligne, rien n'est en cours)
window.addEventListener('online', () => { if (Compte.horsLigne && $('#overlay').hidden) location.reload(); });
// retour sur l'appli après un moment : boosters et quêtes à jour
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Compte.pret && !Compte.horsLigne && !occupe && $('#overlay').hidden)
    Compte.rafraichir().then(() => route(true)).catch(() => {});
});
// Accès discret à l'outil de gestion des cartes : toucher 5 fois le logo
$('.brand').addEventListener('click', () => {
  const t = Date.now(); if (t - (route.tapT || 0) > 1500) route.taps = 0; route.tapT = t;
  if (++route.taps >= 5) location.href = 'admin.html';
});

// ── démarrage ───────────────────────────────────────────────────────────────────
Compte.surChangement(() => { if ($('#overlay').hidden) route(); else majEntete(); });
Compte.demarrer().then(info => {
  CARTES = info.cartes; CARTES.forEach(c => PAR_ID[c.id] = c);
  MAJ = info.maj ? new Date(info.maj).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : '';
  route();
  if (info.erreurLien) toast('Ce lien a expiré ou a déjà servi : recommence');
  else if (info.confirme) toast('Adresse confirmée, bienvenue !');
  else if (info.horsLigne) toast('Hors ligne : ton club reste consultable');
  else if (info.apercu) toast('Aperçu avec les modifications non publiées de l’outil');
}).catch(e => {
  console.error(e);
  $('#view').innerHTML = '<h1>Oups</h1><p class="sub">Impossible de joindre le serveur du jeu. Vérifie ta connexion et recharge la page.</p>';
});

// En ligne (https) : toujours. En local : seulement avec ?sw dans l'adresse, pour tester le hors-ligne
// sans que le cache gêne pendant qu'on modifie les fichiers.
if ('serviceWorker' in navigator && window.isSecureContext && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw')))
  navigator.serviceWorker.register('sw.js');
