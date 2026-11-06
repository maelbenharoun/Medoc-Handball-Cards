'use strict';
/* Médoc Hand Cards — jeu de cartes à collectionner avec les joueurs et joueuses du Médoc Handball.
   Ce fichier : l'affichage (vues #accueil, #club, #equipe, #jouer, #marche, #paris, connexion, boosters, matchs).
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

// Postes : au but seulement si GB fait partie de ses postes ; sur le terrain s'il a un poste de champ (ou aucun).
// Hors de ses postes, une carte perd MALUS_HORS_POSTE points (sans poste renseigné, elle joue partout sans malus).
const joueChamp = c => !c.postes?.length || c.postes.some(p => p !== 'GB');
const peutJouer = (c, slot) => slot === 'GB' ? !!c.postes?.includes('GB') : joueChamp(c);
const horsPoste = (c, slot) => slot !== 'GB' && !!c.postes?.length && !c.postes.includes(slot);
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
const VUES = {accueil: vueAccueil, club: vueClub, equipe: vueEquipe, jouer: vueJouer, marche: vueMarche, paris: vueParis, compte: vueCompte};
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
  const e = S(), s = secondesAvantBooster(), chances = PARAMS.booster_chances || {}, prixPoste = PARAMS.booster_poste_prix || 300;
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
    <h2>Boosters par poste</h2>
    <p class="sub petit">Un joueur dont c’est le poste principal, pour ${nb(prixPoste)} pièces, avec les mêmes chances.</p>
    <div class="postes-b">${POSTES_JEU.map(p => {
      const n = CARTES.filter(c => c.actif !== false && c.poste === p).length;
      return `<button class="bposte" data-bposte="${p}"${n && e.pieces >= prixPoste ? '' : ' disabled'} title="${POSTE_NOM[p]}"><b>${p}</b>
        <small>${n ? `${n} joueur${n > 1 ? 's' : ''}` : 'aucun'}</small></button>`;
    }).join('')}</div>
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
    <h3>${esc(c.nom)} <small>${c.equipe} · ${nomsPostes(c)}${Number.isInteger(c.numero) ? ` · n° ${c.numero}` : ''}</small></h3>
    <div class="paliers">${paliers}</div>
    ${mes.length ? `<h4>Tes cartes (${mes.length})</h4>${lignes}${fusions}` : '<p class="sub">Tu n’as pas encore ce joueur : ouvre des boosters !</p>'}
    <div class="fiche-j">${ficheHTML(c.fiche) || `<div class="kv"><div><b>${c.mj}</b><span>matchs</span></div><div><b>${c.buts}</b><span>buts</span></div><div><b>${String(c.bpm).replace('.', ',')}</b><span>buts / match</span></div></div>`}</div>
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
  const equipe = mieux.choix;
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
  const e = S(), j = e.jour || {}, l = e.limites || {}, t = JEU.tactique || e.tactique || 'equilibre';
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
    ${blocParcours(e, complet && restant('championnat') > 0, note, restant('championnat'))}
    ${blocJet7m(e)}
    ${blocMiniJeux(e)}
    <div class="mode"><div class="mode-t"><b>Entraînement d’équipe</b><span>${restant('seance')}/${l.seance || 5} aujourd’hui</span></div>
      <p class="sub petit">+${PARAMS.seance_xp_carte || 40} XP pour chaque joueur de ton 7, sans risque. Pour entraîner une seule carte : touche-la dans le Club.</p>
      <button class="btn ghost large" data-act="seance"${restant('seance') && e.equipe && Object.keys(e.equipe).length ? '' : ' disabled'}>Séance gratuite · ${restant('seance')} restante${restant('seance') > 1 ? 's' : ''}</button>
      <button class="btn gold large" data-act="seance-payante"${e.equipe && Object.keys(e.equipe).length && e.pieces >= (PARAMS.seance_payante_prix || 150) ? '' : ' disabled'}>Séance payante · ${nb(PARAMS.seance_payante_prix || 150)} pièces</button></div>
    <div class="mode"><div class="mode-t"><b>Défis</b><span>${e.trophees || 0} 🏆</span></div>
      <p class="sub petit">Affronte le 7 d’un autre joueur (il défend avec sa dernière tactique). ${restant('defi')}/${l.defi || 5} défis restants aujourd’hui.</p>
      <input class="champ" type="search" placeholder="Chercher un joueur à défier" value="${esc(JEU.recherche)}" data-cherche-defi autocapitalize="off" autocomplete="off" spellcheck="false">
      <div id="joueurs-defi">${joueursDefi()}</div>
      ${JEU.adversaires ? (adv || '<p class="sub petit">Pas encore d’adversaire avec un 7 complet.</p>') : '<p class="sub petit">Chargement…</p>'}
      <button class="lien" data-act="classement">Voir le classement</button></div>
    ${histo ? `<h2>Derniers matchs</h2><div class="hists">${histo}</div>` : ''}`;
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
function blocParcours(e, peut, note, reste) {
  const pc = e.parcours;
  if (!pc) return '';
  const resteTxt = `<p class="sub petit centre">${reste} match${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''} aujourd’hui</p>`;
  const titre = pc.type === 'legendes' ? esc(pc.nom) : `${esc(pc.groupe)} · ${esc(pc.nom)}`;
  let corps = '';
  if (pc.type === 'poule') {
    const cl = pc.classement || [], n = cl.length, pr = pc.prochain;
    const lignes = cl.map((x, i) => `<div class="${x.moi ? 'moi-l ' : ''}${i < pc.montee ? 'zm' : i >= n - pc.descente ? 'zd' : ''}">
      <span>${i + 1}</span><b>${esc(x.nom)}</b><small>${x.j}</small><small>${x.bp - x.bc > 0 ? '+' : ''}${x.bp - x.bc}</small><em>${x.pts}</em></div>`).join('');
    corps = `<p class="sub petit">Saison ${pc.saison} · journée ${Math.min(pc.journee + 1, pc.journees)}/${pc.journees}. Les ${pc.montee} premiers montent${
        pc.descente ? `, les ${pc.descente} derniers descendent` : ''}. Victoire 3 pts, nul 2, défaite 1.</p>
      ${pr ? `<div class="affiche"><div><small>Ton 7</small><b>${note || '–'}</b></div><span>${pr.domicile ? 'à domicile' : 'à l’extérieur'}</span>
        <div><small>${esc(pr.nom)}</small><b>≈ ${pr.force}</b></div></div>` : ''}
      <button class="btn gold large" data-act="championnat"${peut ? '' : ' disabled'}>Jouer la journée ${pc.journee + 1}</button>${resteTxt}
      <div class="classe poule"><div class="tete"><span>#</span><b>Équipe</b><small>J</small><small>Diff.</small><em>Pts</em></div>${lignes}</div>`;
  } else if (pc.type === 'tournoi') {
    const adv = pc.adversaires || [], a = adv[pc.tour] || {};
    corps = `<p class="sub petit">Élimination directe : 3 victoires pour le titre. Un nul se joue aux tirs au but. Éliminé ? Nouveau tirage, même tournoi.</p>
      <div class="chemin">${adv.map((x, i) => `<div class="${i < pc.tour ? 'fait' : i === pc.tour ? 'ici' : ''}"><small>${TOURS[i] || 'Tour ' + (i + 1)}</small><b>${esc(x.nom)}</b><span>≈ ${x.force}</span></div>`).join('')}</div>
      <div class="affiche"><div><small>Ton 7</small><b>${note || '–'}</b></div><span>${TOURS[pc.tour] || ''}</span><div><small>${esc(a.nom || '')}</small><b>≈ ${a.force ?? '–'}</b></div></div>
      <button class="btn gold large" data-act="championnat"${peut ? '' : ' disabled'}>Jouer ${pc.tour === 2 ? 'la finale' : pc.tour === 1 ? 'la demi-finale' : 'le quart de finale'}</button>${resteTxt}`;
  } else {
    const besoin = Math.floor(pc.manches / 2) + 1;
    corps = `<p class="sub petit">Le 7 de rêve : ${(pc.joueurs || []).map(esc).join(', ')}. Série au meilleur des ${pc.manches} manches (${besoin} victoires).
        Il faut un 7 de cartes Ultime bien entraînées.${pc.legendesBattues ? ` Déjà battues ${pc.legendesBattues} fois.` : ''}</p>
      <div class="affiche"><div><small>Ton 7</small><b>${note || '–'}</b></div><span>série ${pc.v} – ${pc.d}</span><div><small>Légendes</small><b>≈ ${pc.force}</b></div></div>
      <button class="btn gold large" data-act="championnat"${peut ? '' : ' disabled'}>Jouer la manche ${pc.v + pc.d + 1}</button>${resteTxt}`;
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
    t = fin.gagne ? `${fin.titre} !` : `Éliminé en ${(TOURS[fin.tour] || '').toLowerCase()}`;
    s = fin.gagne ? (fin.nouveau > fin.niveau ? `Prochaine étape : ${fin.nouveauNom}.` : '') : 'Nouveau tirage : retente ta chance.';
  } else {
    t = fin.gagne ? 'Tu as battu les Légendes du handball !' : 'Les Légendes gagnent la série';
    s = `Série ${fin.v} – ${fin.d}.${fin.gagne ? '' : ' Entraîne tes cartes Ultime et reviens.'}`;
  }
  return `<div class="daily depart"><p><b>${t}</b>${s}${gains ? ' ' + gains : ''}</p></div>`;
}
function texteEtape(r) {
  const x = r.etape || {};
  if (r.fin) return '';
  if (r.type === 'poule') return `${ordinal(x.rang)} du classement après ${x.journee} journée${x.journee > 1 ? 's' : ''}`;
  if (r.type === 'tournoi') return x.passe ? `Qualifié pour la ${(TOURS[x.tour + 1] || '').toLowerCase()}` : '';
  return `Série ${x.v} – ${x.d}`;
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
  const {r} = MATCH, g = r.gains || {}, res = r.match.resultat, tab = r.match.tab, etape = r.type ? texteEtape(r) : '';
  if (MATCH.i < r.match.buts.length) avancerMatch(60);   // « voir le résultat » : on affiche tout
  if (!$('#fin-match') || $('#fin-match').dataset.fait) return;
  $('#fin-match').dataset.fait = 1;
  vibrer(res === 'gagne' ? [40, 60, 80] : 30);
  const progres = (r.progres || []).map(p => `${esc(p.nom)} ${p.avant} → <b>${p.apres}</b>`).join(' · ');
  $('#fin-match').innerHTML = `<div class="resultat r-${res}"><b>${RES[res]} ${r.match.a} – ${r.match.b}</b>
      ${tab ? `<small class="tab">Tirs au but ${tab.a} – ${tab.b} : ${tab.a > tab.b ? 'gagnés' : 'perdus'}</small>` : ''}
      <small>${g.points != null ? `+${g.points} pt${g.points > 1 ? 's' : ''} · ` : ''}+${nb(g.pieces)} pièces · +${g.xp} XP${g.trophees != null ? ` · ${g.trophees >= 0 ? '+' : ''}${g.trophees} 🏆` : ''}</small></div>
    ${etape ? `<p class="sub petit centre">${esc(etape)}</p>` : ''}
    ${progres ? `<p class="sub petit centre">Progrès : ${progres}</p>` : ''}
    ${texteFin(r.fin)}
    <button class="btn gold large" data-act="fin-match">Continuer</button>`;
}

// ── marché des transferts : une carte contre une carte ──────────────────────────
const MKT = {filtre: 'tout', liste: null, charge: false, compo: null};
const carteDe = (carte, palier, note) => PAR_ID[carte] ? vueExemplaire(PAR_ID[carte], {palier, note: note ?? PALIER[palier].min}) : null;
function chargerMarche() {
  if (MKT.charge || MKT.liste || Compte.horsLigne) return;
  MKT.charge = true;
  Compte.marche(MKT.filtre).then(l => { MKT.liste = l; }).catch(e => { MKT.liste = []; toast(e.message); })
    .finally(() => { MKT.charge = false; if (vueCourante() === 'marche' && $('#overlay').hidden) route(true); });
}
function vueMarche() {
  chargerMarche();
  const L = MKT.liste;
  const annonces = (L || []).map(a => {
    const o = carteDe(a.offre.carte, a.offre.palier, a.offre.note), c = carteDe(a.cherche.carte, a.cherche.palier);
    if (!o || !c) return '';
    const fin = {conclue: a.moi ? `Échangée avec ${esc(a.acheteur || '?')}` : `Échangée avec ${esc(a.vendeur)}`, retiree: 'Retirée'}[a.statut];
    const expire = new Date(a.expire_le).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
    return `<div class="ann${fin ? ' fini' : ''}"><div class="ann-l">
        <div class="ann-c"><span>${a.moi ? 'Tu donnes' : 'Tu reçois'}</span>${carteHTML(o)}<small>${esc(o.nom)} · ${R_LABEL[o.rarete]} ${o.ovr}</small></div>
        <div class="fleche">⇄</div>
        <div class="ann-c"><span>${a.moi ? 'Tu reçois' : 'Tu donnes'}</span>${carteHTML(c)}<small>${esc(c.nom)} · ${R_LABEL[c.rarete]}</small></div></div>
      <p class="ann-p">${a.moi ? 'Ton annonce' : `Proposée par <b>${esc(a.vendeur)}</b>`} · ${fin || 'jusqu’au ' + expire}</p>
      ${a.statut !== 'ouverte' ? '' : a.moi ? `<button class="btn ghost petit" data-retirer-annonce="${a.id}">Retirer</button>`
        : a.possible ? `<button class="btn gold petit" data-accepter="${a.id}">Accepter l’échange</button>` : '<p class="sub petit">Il te faut cette carte, au même palier, hors de ton 7.</p>'}</div>`;
  }).join('');
  return `<h1>Marché des transferts</h1>
    <p class="sub">Échange une carte contre une carte avec les autres joueurs. Ta carte est réservée tant que l’annonce est ouverte (${PARAMS.annonce_jours || 7} jours au plus).</p>
    <button class="btn gold large" data-act="annoncer">Proposer une de mes cartes</button>
    <div class="filters" style="margin-top:14px">${[['tout', 'Toutes'], ['pour_moi', 'Pour moi'], ['mes', 'Mes annonces']]
      .map(([k, l]) => `<button data-mfiltre="${k}" class="${MKT.filtre === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${L ? (annonces || `<p class="sub">${MKT.filtre === 'mes' ? 'Tu n’as pas d’annonce.' : MKT.filtre === 'pour_moi' ? 'Aucune annonce ne demande une carte que tu peux donner.' : 'Aucune annonce pour l’instant : lance la première !'}</p>`)
      : '<p class="sub">Chargement…</p>'}`;
}
// Proposer : 1) une de mes cartes libres, 2) le joueur et le palier voulus
function composerAnnonce() {
  MKT.compo = MKT.compo || {ex: null, carte: null, palier: 'bronze', recherche: ''};
  const k = MKT.compo;
  const libres = EX().filter(e => !e.verrou && !dansEquipe(e.id) && PAR_ID[e.carte]).sort(rangEx);
  const o = k.ex && exParId(k.ex), c = k.carte && carteDe(k.carte, k.palier);
  ouvrirOverlay(`<div class="sheet compo">
    <h3>Nouvelle annonce</h3>
    <h4>1. Ta carte à proposer</h4>
    <div class="pickgrid">${libres.map(e => `<button class="pc${k.ex === e.id ? ' choisi' : ''}" data-offre="${e.id}">${carteHTML(vue(e))}</button>`).join('')
      || '<p class="sub">Pas de carte libre : les cartes de ton 7 ne peuvent pas être proposées.</p>'}</div>
    <h4>2. Ce que tu veux en échange</h4>
    <input class="champ" type="search" placeholder="Nom du joueur" value="${esc(k.recherche)}" data-cherche-carte autocomplete="off" spellcheck="false">
    <div class="veut" id="liste-veut">${listeVeut()}</div>
    <div class="filters">${PALIERS.map(p => `<button data-palier-veut="${p.id}" class="${k.palier === p.id ? 'on' : ''}">${p.nom}</button>`).join('')}</div>
    <div class="resume">${o ? `Tu donnes <b>${esc(PAR_ID[o.carte].nom)} ${R_LABEL[o.palier]} ${o.note}</b>` : 'Choisis ta carte'}
      · ${c ? `tu veux <b>${esc(c.nom)} ${R_LABEL[k.palier]}</b>` : 'choisis le joueur voulu'}</div>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button>
      <button class="btn gold" data-act="publier-annonce"${o && c ? '' : ' disabled'}>Publier</button></div></div>`);
}
function listeVeut() {
  const k = MKT.compo, q = k.recherche.trim().toLowerCase();
  const l = CARTES.filter(c => c.actif !== false && (!q || c.nom.toLowerCase().includes(q))).slice(0, q ? 12 : 8);
  return l.map(c => `<button class="${k.carte === c.id ? 'on' : ''}" data-veut="${c.id}">${esc(c.nom)} <small>${c.equipe}</small></button>`).join('')
    || '<p class="sub petit">Aucun joueur trouvé.</p>';
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
function vueParis() {
  chargerParis();
  const d = PARIS.data, f = PARIS.filtre;
  const garde = m => f === 'tous' || (f === 'medoc' ? !!m.medoc : m.equipe === f);
  let jour = '';
  const avenir = (d?.aVenir || []).filter(garde).map(m => {
    const j = new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});
    const titre = j !== jour ? `<h3 class="jour">${j}</h3>` : ''; jour = j;
    return titre + `<div class="pm"><small>${m.equipe} · J${m.journee ?? '?'}${m.heure ? ' · ' + m.heure : ''}</small>
      <div class="pm-eq"><b class="${m.medoc === 'dom' ? 'med' : ''}">${esc(m.dom)}</b><span>–</span><b class="${m.medoc === 'ext' ? 'med' : ''}">${esc(m.ext)}</b></div>
      ${m.pari ? `<p class="pm-p">Ton pari : ${nb(m.pari.mise)} sur <b>${esc(issueNom(m, m.pari.choix))}</b> · cote ${fr(m.pari.cote)} · gain possible ${nb(Math.floor(m.pari.mise * m.pari.cote))}</p>`
        : `<div class="pm-c">${['1', 'N', '2'].map(k => `<button data-pari="${m.rid}:${k}"><small>${k === 'N' ? 'Nul' : esc(k === '1' ? m.dom : m.ext)}</small><b>${fr(m.cotes[k])}</b></button>`).join('')}</div>`}</div>`;
  }).join('');
  const mes = (d?.mesParis || []).map(m => {
    const x = m.pari, st = {en_cours: 'En cours', gagne: `Gagné : +${nb(x.gain)}`, perdu: 'Perdu'}[x.statut];
    return `<div class="hist r-${x.statut === 'gagne' ? 'gagne' : x.statut === 'perdu' ? 'perdu' : 'nul'}"><b>${m.score ? m.score.join(' – ') : nb(x.mise)}</b>
      <span>${esc(m.dom)} – ${esc(m.ext)} · ${esc(issueNom(m, x.choix))} à ${fr(x.cote)}</span><small>${st}</small></div>`;
  }).join('');
  return `<h1>Paris</h1>
    <p class="sub">Parie tes pièces sur les vrais matchs des poules SG1, SG2, SF1 et SF2. Les cotes viennent du modèle de pronostic de medochandballstats.com.
      Pièces du jeu seulement : rien à acheter, rien à gagner en vrai.</p>
    <div class="filters">${[['medoc', 'Médoc'], ['tous', 'Tous'], ['SG1'], ['SG2'], ['SF1'], ['SF2']]
      .map(([k, l]) => `<button data-pfiltre="${k}" class="${f === k ? 'on' : ''}">${l || k}</button>`).join('')}</div>
    ${!d ? '<p class="sub">Chargement…</p>' : avenir || '<p class="sub">Pas de match dans les deux prochaines semaines.</p>'}
    ${mes ? `<h2>Mes paris</h2><div class="hists">${mes}</div>` : ''}`;
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
// Mise en scène (même esprit que l'intro) : le booster flotte et brille ; au toucher, une découpe lumineuse court le long
// du haut, le rabat est arraché, une bouffée de lumière à la couleur du meilleur palier sort, la carte monte du sachet face
// cachée et vient au centre. Or et Ultime : indices (équipe, poste, palier) avant. On touche la carte pour la retourner,
// puis « Envoyer au club » la fait filer vers l'onglet Club. Booster de départ : les 7 cartes sortent ensemble.
const TEINTE = {bronze: '212 140 88', argent: '195 204 214', or: '227 185 74', ultime: '127 211 78'};
const OB = {};
const moinsAnim = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function ouvrirBooster(promesse, nom, cls) {
  if (occupe) return;
  const avant = new Set(EX().map(e => e.carte));
  action(promesse, ({ids}) => {
    const res = ids.map(exParId).filter(e => e && PAR_ID[e.carte]).map(e => ({c: vue(e), nouveau: !avant.has(e.carte)}))
      .sort((a, b) => rangEx(a.c.ex, b.c.ex));
    if (res.length) sceneBooster(res, nom, cls);
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
  const n = type === 'depart' ? 7 : 1, pris = new Set(), res = [];
  while (res.length < Math.min(n, tous.length)) {
    const c = hasard(tous); if (pris.has(c.id)) continue; pris.add(c.id);
    const palier = RARETES.includes(type) && !res.length ? type : type === 'depart' ? 'bronze' : tirer(), P = PALIER[palier];
    res.push({c: vueExemplaire(c, {palier, note: P.min + Math.floor(Math.random() * (P.max - P.min + 1))}), nouveau: true});
  }
  res.sort((a, b) => RARETES.indexOf(b.c.rarete) - RARETES.indexOf(a.c.rarete) || b.c.ovr - a.c.ovr);
  sceneBooster(res, type === 'depart' ? 'Départ' : 'Démo', type === 'depart' ? 'pk-depart' : type === 'or' || type === 'ultime' ? 'pk-or' : 'pk-argent');
  OB.demo = type || 'hasard';
}
function sceneBooster(res, nom, cls) {
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
  el.style.setProperty('--tc', TEINTE[res[0].c.rarete]);
  el.style.setProperty('--pw', pw + 'px');
  el.innerHTML = `<div class="ob-lueur"></div><div class="ob-rayons"></div>
    <div class="ob-cartes">${res.map((r, i) => `<div class="ob-c" data-i="${i}" style="width:${finales[i].w}px;height:${finales[i].w / .69}px">
      <div class="ob-flip"><div class="ob-dos">${dosHTML(finales[i].w)}</div>
      <div class="ob-face">${carteHTML(r.c, {nouveau: r.nouveau}).replace('class="card', `style="--w:${finales[i].w}px" class="card`)}</div></div></div>`).join('')}</div>
    <button class="ob-pack ${cls}" aria-label="Ouvrir le booster ${esc(nom)}">
      <span class="ob-corps"><span class="ob-logo"><img src="assets/logo.png" alt=""></span><span class="ob-nom">${esc(nom)}</span>
        <span class="ob-n">${n > 1 ? n + ' joueurs' : '1 joueur'}</span><span class="ob-brille"></span></span>
      <span class="ob-bande"><span class="ob-brille"></span></span>
      <span class="ob-coupe"><i class="ob-trace"></i><i class="ob-etoile"></i></span>
    </button>
    <div class="ob-souffle"></div>
    <p class="ob-aide">Touche le booster pour l’ouvrir</p>
    <div class="ob-indice" hidden></div>
    <button class="ob-passer" hidden>Tout révéler</button>
    <div class="ob-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro');
  Object.assign(OB, {el, res, nom, finales, pw, ph, etape: 'pack', vite: false, anims: [], attentes: [], indice: 0, demo: false});
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
  vibrer(25);
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
  obAnim(pack, [{transform: 'translate(-50%, -51.5%) scale(1.03)', opacity: 1}, {transform: 'translate(-50%, -10%) scale(.9)', opacity: 0}], {duration: 520, easing: 'cubic-bezier(.5, 0, .75, .2)'});
  await Promise.all(cartes.map((c, i) => {
    const f = finales[i], d = OB.dansSachet - ph * .88;
    return obAnim(c, [{transform: place(W / 2, d, OB.pw * .8 / f.w)},
      {transform: place((W / 2 + f.x) / 2, Math.min(d, f.y) - 40, (OB.pw * .8 / f.w + 1) / 2, f.r * .5), offset: .55},
      {transform: place(f.x, f.y, 1.045, f.r), offset: .85}, {transform: place(f.x, f.y, 1, f.r)}],
      {duration: 640, delay: (cartes.length - 1 - i) * 70, easing: 'cubic-bezier(.3, .7, .3, 1)'}).then(() => { c.style.transform = place(f.x, f.y, 1, f.r); });
  }));
  // 5. les autres cartes se retournent d'elles-mêmes (de la moins bonne à la meilleure), la meilleure attend
  for (const c of cartes.slice(1).reverse()) { retourner(c); await obPause(240); }
  if (RARETES.indexOf(res[0].c.rarete) >= RARETES.indexOf('or') && !OB.vite) { OB.etape = 'indices'; OB.indice = 0; indiceSuivant(); }
  else attendreRetournement();
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
  const etapes = [['Équipe', c.equipe], ['Poste', posteAffiche(c)], ['Palier', R_LABEL[c.rarete]]];
  if (OB.indice >= etapes.length) { box.hidden = true; return attendreRetournement(); }
  const [l, v] = etapes[OB.indice++];
  box.hidden = false;
  box.innerHTML = `<div class="ob-ind${OB.indice === 3 ? ' t-' + c.rarete : ''}"><small>${l}</small>${esc(v)}</div>`;
  const aide = OB.el.querySelector('.ob-aide'); aide.textContent = 'Touche pour continuer'; aide.classList.remove('cache'); aide.classList.add('bas');
  OB.el.querySelector('.ob-c[data-i="0"]').classList.add('attente');
  if (OB.indice === 3) OB.el.classList.add('t-haut');
  vibrer(20);
}
function retourner(c) { c.classList.add('vu'); }
function toucherHeros() {
  if (!['retourner', 'indices'].includes(OB.etape) && !OB.vite) return;
  if (OB.etape === 'indices') { OB.el.querySelector('.ob-indice').hidden = true; }
  OB.etape = 'fini';
  const h = OB.el.querySelector('.ob-c[data-i="0"]'), aide = OB.el.querySelector('.ob-aide');
  aide.classList.add('cache');
  h.classList.remove('attente');
  retourner(h);
  if (RARETES.indexOf(OB.res[0].c.rarete) >= RARETES.indexOf('or')) OB.el.classList.add('t-haut');
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
  const memes = EX().filter(e => e.carte === h.c.id && e.palier === h.c.rarete).length;
  const nv = res.filter(r => r.nouveau).length;
  const info = res.length > 1 ? (nv ? `${nv} nouveau${nv > 1 ? 'x' : ''} joueur${nv > 1 ? 's' : ''}` : 'Déjà dans ton club')
    : h.nouveau ? `Nouveau : ${esc(h.c.nom)} rejoint ton club` : memes >= n && palierSuivant(h.c.rarete) ? 'Fusion possible !' : `${memes}/${n} pour fusionner`;
  OB.el.querySelector('.ob-bas').innerHTML = OB.demo ? `<p class="ob-info">Démo : rien n’est ajouté à ton club</p><button class="btn gold large ob-fin">Rejouer</button>`
    : `<p class="ob-info">${info}</p><button class="btn gold large ob-fin">Envoyer au club</button>`;
  OB.el.querySelector('.ob-fin').addEventListener('click', e => { e.stopPropagation(); if (OB.demo) { OB.el.remove(); demoBooster(OB.demo); } else envoyerAuClub(); });
  OB.el.querySelector('.ob-bas').animate([{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'none'}], {duration: OB.vite ? 0 : 400, delay: OB.vite ? 0 : 500, fill: 'both'});
}
function toutReveler() {
  OB.vite = true;
  OB.anims.forEach(a => { try { a.finish(); } catch (e) {} });
  OB.attentes.forEach(([t, r]) => { clearTimeout(t); r(); });
  if (['indices', 'retourner'].includes(OB.etape)) toucherHeros();
}
function envoyerAuClub() {
  const el = OB.el, cible = document.querySelector('.tabs:not([hidden]) a[data-tab="club"]')?.getBoundingClientRect();
  const tx = cible ? cible.left + cible.width / 2 : innerWidth / 2, ty = cible ? cible.top + cible.height / 2 : innerHeight + 80;
  const fin = () => { el.remove(); document.body.classList.remove('avec-intro'); route(true);
    document.querySelector('.tabs a[data-tab="club"]')?.animate([{transform: 'scale(1)'}, {transform: 'scale(1.25)'}, {transform: 'scale(1)'}], {duration: 380}); };
  el.querySelector('.ob-bas').style.visibility = 'hidden';
  if (moinsAnim()) { el.animate([{opacity: 1}, {opacity: 0}], {duration: 200, fill: 'forwards'}).onfinish = fin; return; }
  const cartes = [...el.querySelectorAll('.ob-c')];
  cartes.forEach((c, i) => c.animate([{transform: c.style.transform, opacity: 1}, {transform: place(tx, ty, .08, 0), opacity: .3}],
    {duration: 620, delay: i * 45, easing: 'cubic-bezier(.5, 0, .75, .2)', fill: 'forwards'}));
  el.animate([{opacity: 1}, {opacity: 1, offset: .55}, {opacity: 0}],
    {duration: 620 + cartes.length * 45, fill: 'forwards'}).onfinish = fin;
  vibrer(20);
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
  const t = e.target.closest('[data-act],[data-booster],[data-bposte],[data-quete],[data-filtre],[data-slot],[data-choix],[data-entrainer],[data-vendre],[data-fusion],[data-tactique],[data-defier],[data-mfiltre],[data-offre],[data-veut],[data-palier-veut],[data-retirer-annonce],[data-accepter],[data-pfiltre],[data-pari],[data-valider-pari],[data-mini],.grid .card');
  if (!t) { if (e.target.id === 'overlay' && !$('.opening') && !$('.walk') && !$('.match')) fermerOverlay(); return; }
  const a = t.dataset.act, d = t.dataset;
  if (d.filtre) { filtre = d.filtre; return route(true); }
  if (d.slot) return choisir(d.slot);
  if (t.classList.contains('card') && !t.classList.contains('locked')) return fiche(t.dataset.id);
  if (a === 'fermer') return fermerOverlay();
  if (a === 'moi') return fenetreCompte();
  if (d.tactique) { JEU.tactique = d.tactique; return route(true); }
  if (d.mfiltre) { MKT.filtre = d.mfiltre; MKT.liste = null; return route(true); }
  if (a === 'annoncer') { MKT.compo = null; return composerAnnonce(); }
  if (d.offre) { MKT.compo.ex = d.offre; return composerAnnonce(); }
  if (d.veut) { MKT.compo.carte = d.veut; return composerAnnonce(); }
  if (d.palierVeut) { MKT.compo.palier = d.palierVeut; return composerAnnonce(); }
  if (d.pfiltre) { PARIS.filtre = d.pfiltre; return route(true); }
  if (d.pari) { const [rid, choix] = d.pari.split(':'); return fenetrePari(rid, choix); }
  if (a === 'passer') return finMatch();
  if (a === 'fin-match') { JEU.rencontres = null; JEU.adversaires = null; return fermerOverlay(); }
  if (a === 'classement') return fenetreClassement();
  if (occupe) return;
  if (a === 'publier-annonce') {
    const k = MKT.compo;
    return action(Compte.publierAnnonce(k.ex, k.carte, k.palier), () => { toast('Annonce publiée'); MKT.compo = null; MKT.filtre = 'mes'; MKT.liste = null; fermerOverlay(); });
  }
  if (d.retirerAnnonce) return action(Compte.retirerAnnonce(d.retirerAnnonce), () => { toast('Annonce retirée : ta carte est revenue au club'); MKT.liste = null; route(true); });
  if (d.accepter) {
    const an = MKT.liste.find(x => x.id === d.accepter), o = PAR_ID[an.offre.carte], c = PAR_ID[an.cherche.carte];
    if (!confirm(`Tu donnes ${c.nom} ${R_LABEL[an.cherche.palier]} (ton moins entraîné, hors Mon 7) et tu reçois ${o.nom} ${R_LABEL[an.offre.palier]} ${an.offre.note}. D’accord ?`)) return;
    return action(Compte.accepterAnnonce(d.accepter), () => { toast(`${o.nom} rejoint ton club !`); vibrer([40, 60, 80]); MKT.liste = null; route(true); });
  }
  if (d.validerPari) {
    const [rid, choix] = d.validerPari.split(':'), mise = +$('input.champ[data-mise]').value;
    return action(Compte.parier(rid, choix, mise), r => { toast(`Pari enregistré : gain possible ${nb(r.gainPossible)} pièces`); PARIS.data = null; fermerOverlay(); });
  }
  const tactique = JEU.tactique || S().tactique || 'equilibre';
  if (a === 'championnat') return jouerMatch(Compte.matchChampionnat(tactique), 'championnat');
  if (d.defier) return jouerMatch(Compte.defier(d.defier, tactique), 'defi');
  if (a === 'jet7m') return ouvrirJet7m();
  if (d.mini) return ouvrirMini(d.mini);
  if (a === 'seance' || a === 'seance-payante') return action(a === 'seance' ? Compte.seance() : Compte.seancePayante(), r => {
    const progres = (r.progres || []).map(p => `${esc(p.nom)} ${p.avant} → <b>${p.apres}</b>`).join('<br>');
    ouvrirOverlay(`<div class="sheet"><h3>Séance terminée</h3><p class="sub">+${r.xpCarte} XP pour chaque joueur de ton 7.</p>
      ${progres ? `<p class="sub">Ils progressent :<br>${progres}</p>` : '<p class="sub">Encore un peu de travail avant le prochain point.</p>'}
      <button class="btn" data-act="fermer">Fermer</button></div>`);
  });
  if (a === 'depart') return ouvrirBooster(Compte.ouvrirDepart(), 'Départ', 'pk-depart');
  if (d.booster) return ouvrirBooster(Compte.ouvrirBooster(d.booster), d.booster === 'or' ? 'Or' : d.booster === 'bonus' ? 'Bonus' : 'Booster',
    d.booster === 'or' ? 'pk-or' : 'pk-argent');
  if (d.bposte) return ouvrirBooster(Compte.ouvrirBoosterPoste(d.bposte), d.bposte, 'pk-or');
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
// annonce : recherche du joueur voulu ; pari : mise et gain possible
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.chercheCarte !== undefined) { MKT.compo.recherche = t.value; $('#liste-veut').innerHTML = listeVeut(); return; }
  if (t.dataset.mise !== undefined) {
    document.querySelectorAll('[data-mise]').forEach(el => { if (el !== t) el.value = t.value; });
    const [rid, choix] = $('[data-valider-pari]').dataset.validerPari.split(':');
    $('#gain-pari').textContent = nb(Math.floor(+t.value * PARIS.data.aVenir.find(x => x.rid === rid).cotes[choix]));
  }
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

// ── mini-jeu : jet de 7 mètres ───────────────────────────────────────────────────
// Le viseur se promène sur tout le but et autour (on peut tirer à côté) : on touche pour viser. Puis la jauge de puissance
// monte et descend : on touche pour tirer. Point idéal à 80 % : en dessous le tir est plus lent (le gardien a le temps),
// au-dessus il part de plus en plus de travers.
// Le serveur (tirer_7m) fait deviner le gardien et décide : au centre, toujours arrêté ; dans les angles, ça rentre.
const J7 = {};
const RES7 = {but: ['But !', 'but'], arret: ['Arrêté !', 'rate'], dehors: ['À côté !', 'rate'], poteau: ['Poteau !', 'rate'], dessus: ['Au-dessus !', 'rate']};
const titre7 = r => r.resultat === 'dehors' && r.y < 0 ? 'Au-dessus !' : r.resultat === 'poteau' && r.y < .05 ? 'Sur la barre !' : RES7[r.resultat][0];
function blocJet7m(e) {
  const j = e.jet7m || {tirs: [], limite: 5, piecesBut: 15, bonus: 25}, reste = j.limite - j.tirs.length, buts = j.tirs.filter(x => x === 'but').length;
  const pastilles = Array.from({length: j.limite}, (_, i) => `<i class="j7p${j.tirs[i] ? (j.tirs[i] === 'but' ? ' j7p-ok' : ' j7p-ko') : ''}"></i>`).join('');
  return `<div class="mode"><div class="mode-t"><b>Jet de 7 mètres</b><span>${buts} but${buts > 1 ? 's' : ''} aujourd’hui</span></div>
    <p class="sub petit">Vise loin du gardien, dans les angles, puis règle la puissance. ${j.piecesBut} pièces par but, ${j.bonus} de plus pour un 5 sur 5 ; ${j.limite} tirs par jour.</p>
    <div class="j7-pastilles">${pastilles}</div>
    <button class="btn gold large" data-act="jet7m"${reste > 0 ? '' : ' disabled'}>${reste > 0 ? `Tirer · ${reste} tir${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}` : 'Reviens demain'}</button></div>`;
}
// gardien de face, articulé (bras, jambes, buste) pour parer comme au hand : bras tendu en haut, jambe tendue en bas
const GARDIEN_SVG = `<svg viewBox="0 0 120 150" aria-hidden="true" class="gk"><g stroke-linecap="round" stroke-linejoin="round">
  <g class="gk-jg"><path d="M53 92 L45 140" stroke="#5a6475" stroke-width="13"/><path d="M37 143 h14" stroke="#e5484d" stroke-width="7"/></g>
  <g class="gk-jd"><path d="M67 92 L75 140" stroke="#5a6475" stroke-width="13"/><path d="M69 143 h14" stroke="#e5484d" stroke-width="7"/></g>
  <g class="gk-corps"><rect x="43" y="40" width="34" height="58" rx="13" fill="#1d5b8f"/>
    <text x="60" y="78" text-anchor="middle" font-size="22" font-weight="900" fill="#ffd257" font-family="sans-serif">1</text>
    <circle cx="60" cy="25" r="13" fill="#e8c4a0"/><path d="M47 22 Q60 6 73 22" fill="#3b2a1a"/></g>
  <g class="gk-bg"><path d="M47 48 L25 18" stroke="#1d5b8f" stroke-width="12"/><circle cx="23" cy="15" r="7" fill="#e8c4a0"/></g>
  <g class="gk-bd"><path d="M73 48 L95 18" stroke="#1d5b8f" stroke-width="12"/><circle cx="97" cy="15" r="7" fill="#e8c4a0"/></g></g></svg>`;
// parades : rotations des membres (degrés, autour des épaules et des hanches) et déplacement du gardien
function parade(gx, gy) {
  const cote = gx < .4 ? -1 : gx > .6 ? 1 : 0, haut = gy < .5;
  if (!cote) return haut ? {bg: 22, bd: -22, jg: -6, jd: 6, corps: 0, dy: -12, dx: 0}               // bras levés, petit saut
    : {bg: -95, bd: 95, jg: 62, jd: -62, corps: 0, dy: 10, dx: 0};                                   // grand écart, bras au sol
  // côté choisi : membres de ce côté tendus, l'autre jambe en appui ; (cote = -1 : gauche de l'écran)
  const P = haut ? {bras: -18, autreBras: 25, jambe: 28, autreJambe: -8, corps: -12, dy: -6}       // bras tendu vers la lucarne
    : {bras: -118, autreBras: 30, jambe: 80, autreJambe: -22, corps: -16, dy: 8};                    // jambe tendue au ras du sol
  const g = cote < 0;
  return {bg: g ? P.bras : -P.autreBras, bd: g ? P.autreBras : -P.bras, jg: g ? P.jambe : -P.autreJambe, jd: g ? P.autreJambe : -P.jambe,
    corps: P.corps * (g ? 1 : -1), dy: P.dy, dx: cote};
}
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
function ouvrirJet7m(demo) {
  const j = demo ? {tirs: [], limite: 5} : S().jet7m || {tirs: [], limite: 5};
  if (j.tirs.length >= j.limite) return toast('Reviens demain pour 5 nouveaux tirs');
  const el = document.createElement('div');
  el.className = 'j7';
  el.innerHTML = `<div class="j7-haut"><b class="j7-score"></b><button class="j7-quitter">Fermer</button></div>
    <div class="j7-terrain"><div class="j7-but"><div class="j7-filet"></div><i class="j7-bosse"></i><div class="j7-gardien">${GARDIEN_SVG}</div>
      <div class="j7-viseur"><i></i></div></div>
      <div class="j7-sol"><i class="j7-ligne6"></i><i class="j7-ligne7"></i></div><div class="j7-ballon"></div></div>
    <div class="j7-jauge" aria-hidden="true"><i class="j7-ideal"></i><i class="j7-niveau"></i><small>Puissance</small></div>
    <p class="j7-aide"></p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro');
  Object.assign(J7, {el, tirs: [...j.tirs], limite: j.limite, gains: 0, demo: !!demo});
  el.querySelector('.j7-quitter').addEventListener('click', e => { e.stopPropagation(); fermerJet7m(); });
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button')) toucherJet7m(); });
  nouveauTir();
}
function fermerJet7m() { cancelAnimationFrame(J7.raf); J7.el?.remove(); J7.el = null; document.body.classList.remove('avec-intro'); route(true); }
const vaEtVient = (t, per) => { const x = (t / per) % 2; return x < 1 ? x : 2 - x; };
function nouveauTir() {
  const el = J7.el, n = J7.tirs.length, buts = J7.tirs.filter(x => x === 'but').length;
  el.querySelector('.j7-score').textContent = `Tir ${n + 1}/${J7.limite} · ${buts} but${buts > 1 ? 's' : ''}`;
  el.querySelector('.j7-resultat').hidden = true; el.querySelector('.j7-bas').innerHTML = '';
  el.classList.remove('puissance', 'tir', 'r-but', 'r-rate');
  el.querySelectorAll('.j7-gardien, .gk g, .j7-ballon, .j7-filet, .j7-bosse, .j7-but').forEach(x => x.getAnimations().forEach(a => a.cancel()));
  el.querySelector('.j7-aide').textContent = 'Touche pour viser';
  // plus rapide à chaque tir
  Object.assign(J7, {phase: 'visee', t0: performance.now(), tx: Math.max(1.2, 1.7 - n * .117), py: Math.max(.44, .62 - n * .04), x: .5, y: .4, puissance: 0});
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
    J7.el.classList.add('puissance'); J7.el.querySelector('.j7-aide').textContent = 'Touche pour tirer';
    boucleJet7m();
  } else if (J7.phase === 'puissance') {
    J7.phase = 'tir'; cancelAnimationFrame(J7.raf); vibrer(20);
    J7.el.classList.add('tir'); J7.el.querySelector('.j7-aide').textContent = '';
    const x = Math.round(J7.x * 1000) / 1000, y = Math.round(J7.y * 1000) / 1000, f = Math.round(J7.puissance * 1000) / 1000;
    (J7.demo ? tir7mDemo(x, y, f) : Compte.tirer7m(x, y, f)).then(animerTir).catch(e => { toast(e.message); fermerJet7m(); });
  }
}
function animerTir(r) {
  const el = J7.el; if (!el) return;
  J7.tirs = r.tirs; J7.gains += r.pieces + r.bonus;
  const vite = moinsAnim() ? 0 : 1, but = el.querySelector('.j7-but').getBoundingClientRect(), ballon = el.querySelector('.j7-ballon'), b0 = ballon.getBoundingClientRect();
  const duree = Math.round(560 - 330 * (r.vitesse ?? .7));   // la puissance donne la vitesse du ballon
  // point d'impact (sur le cadre pour un poteau)
  const ix = r.resultat === 'poteau' ? (r.x < .05 ? 0 : r.x > .95 ? 1 : r.x) : r.x, iy = r.resultat === 'poteau' && r.y < .05 ? 0 : r.y;
  const px = but.left + but.width * ix, py = but.top + but.height * iy;
  const dx = px - (b0.left + b0.width / 2), dy = py - (b0.top + b0.height / 2);
  // le gardien pare vers ce qu'il a deviné (vers le ballon s'il l'arrête)
  const g = r.resultat === 'arret' ? {x: Math.abs(r.x - .5) < .2 ? .5 : r.x, y: r.y} : r.gardien, P = parade(g.x, g.y);
  const gk = el.querySelector('.j7-gardien'), mv = {duration: Math.max(180, duree * .7) * vite, delay: 40 * vite, easing: 'cubic-bezier(.2, .9, .3, 1.1)', fill: 'forwards'};
  gk.animate([{transform: 'none'}, {transform: `translate(${P.dx * 42}%, ${P.dy}%)`}], mv);
  for (const [cls, rot] of [['gk-corps', P.corps], ['gk-bg', P.bg], ['gk-bd', P.bd], ['gk-jg', P.jg], ['gk-jd', P.jd]])
    el.querySelector('.' + cls).animate([{transform: 'rotate(0deg)'}, {transform: `rotate(${rot}deg)`}], mv);
  // le ballon : vers le point visé, de plus en plus petit (il s'éloigne)
  const cotes = r.x < .5 ? -1 : 1, frames = [{transform: 'translate(0, 0) scale(1) rotate(0deg)'}, {transform: `translate(${dx}px, ${dy}px) scale(.4) rotate(${cotes * 300}deg)`}];
  if (r.resultat === 'arret') frames.push({transform: `translate(${dx + cotes * 90}px, ${dy + 120}px) scale(.55) rotate(${cotes * 520}deg)`, opacity: .7});
  if (r.resultat === 'poteau') frames.push({transform: `translate(${dx + (iy === 0 ? cotes * 30 : -cotes * 70)}px, ${dy + (iy === 0 ? -70 : 60)}px) scale(.45) rotate(${cotes * 540}deg)`, opacity: .6});
  if (r.resultat === 'dehors') frames.push({transform: `translate(${dx * 1.15}px, ${dy - 40}px) scale(.3)`, opacity: 0});
  if (r.resultat === 'but') frames.push({transform: `translate(${dx}px, ${dy + 6}px) scale(.34) rotate(${cotes * 360}deg)`});
  const a = ballon.animate(frames, {duration: duree * (frames.length > 2 ? 1.7 : 1) * vite, easing: 'cubic-bezier(.3, .6, .4, 1)', fill: 'forwards'});
  setTimeout(() => {   // à l'impact
    if (!J7.el) return;
    if (r.resultat === 'but') {   // le filet se creuse là où le ballon entre
      const bo = el.querySelector('.j7-bosse'); bo.style.left = (ix * 100) + '%'; bo.style.top = (iy * 100) + '%';
      bo.animate([{transform: 'translate(-50%, -50%) scale(.2)', opacity: .9}, {transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0}], {duration: 520 * vite, fill: 'forwards'});
      el.querySelector('.j7-filet').animate([{transform: 'scale(1)'}, {transform: 'scale(1.02, 1.05)'}, {transform: 'scale(1)'}], {duration: 380 * vite});
    }
    if (r.resultat === 'poteau') el.querySelector('.j7-but').animate([{transform: 'translateX(0)'}, {transform: 'translateX(-3px)'}, {transform: 'translateX(3px)'}, {transform: 'translateX(0)'}], {duration: 220 * vite});
    if (r.resultat === 'arret') el.animate([{transform: 'translate(0, 0)'}, {transform: 'translate(-4px, 2px)'}, {transform: 'translate(4px, -2px)'}, {transform: 'translate(0, 0)'}], {duration: 200 * vite});
  }, duree * vite);
  a.finished.then(() => {
    if (!J7.el) return;
    const cls = (RES7[r.resultat] || RES7.dehors)[1];
    el.classList.add('r-' + cls);
    vibrer(r.resultat === 'but' ? [30, 40, 60] : 40);
    const box = el.querySelector('.j7-resultat');
    box.innerHTML = `<b>${titre7(r)}</b>${r.pieces ? `<small>+${r.pieces} pièces</small>` : ''}${r.bonus ? `<small>5 sur 5 : +${r.bonus} pièces de bonus !</small>` : ''}`;
    box.hidden = false;
    const n = J7.tirs.length, buts = J7.tirs.filter(t => t === 'but').length;
    el.querySelector('.j7-score').textContent = `Tir ${n}/${J7.limite} · ${buts} but${buts > 1 ? 's' : ''}`;
    el.querySelector('.j7-bas').innerHTML = r.restants > 0 ? `<button class="btn gold large j7-suivant">Tir suivant</button>`
      : J7.demo ? `<p class="j7-bilan">${buts} sur ${J7.limite} · démo : pas de pièces</p><button class="btn gold large j7-rejouer">Rejouer</button>`
      : `<p class="j7-bilan">${buts} sur ${J7.limite} · +${nb(J7.gains)} pièces</p><button class="btn gold large j7-fin">Fermer</button>`;
    el.querySelector('.j7-suivant')?.addEventListener('click', e => { e.stopPropagation(); nouveauTir(); });
    el.querySelector('.j7-rejouer')?.addEventListener('click', e => { e.stopPropagation(); J7.tirs = []; nouveauTir(); });
    el.querySelector('.j7-fin')?.addEventListener('click', e => { e.stopPropagation(); fermerJet7m(); });
  });
}

// ── trois autres mini-jeux : l'arrêt réflexe (gardien), la passe en contre, le tir en suspension ──────────
// Le jeu envoie ce que le joueur a fait (zone choisie, précision, moment du saut…) ; le serveur décide (mini_jouer).
// 5 essais par jour pour chacun, 10 pièces par réussite, 20 de plus pour un 5 sur 5. Démo : ?demo=gardien, contre, suspension.
const MJ = {};
const MINI = {
  gardien: {nom: 'L’arrêt réflexe', icone: '🧤', succes: 'arret',
    texte: 'Tu es dans les buts : lis le bras du tireur et touche la zone où il va tirer. 5 tirs enchaînés par série.',
    res: {arret: 'Arrêt !', but: 'But encaissé', tard: 'Trop tard !'}},
  contre: {nom: 'La passe en contre', icone: '🏃', succes: 'but',
    texte: '2 contre 1 : dessine la passe dans la course de ton partenaire, ou garde le ballon si le défenseur part sur lui.',
    res: {but: 'But !', arret: 'Arrêté par le gardien', interception: 'Interceptée !', neutralise: 'Le défenseur t’a pris le ballon'}},
  suspension: {nom: 'Le tir en suspension', icone: '🚀', succes: 'but',
    texte: 'Touche vite pour courir : le saut part tout seul. En l’air, dessine ton tir au-dessus du contreur, loin du gardien.',
    res: {but: 'But !', arret: 'Arrêté !', contre: 'Contré !', dehors: 'À côté !', poteau: 'Poteau !'}},
};
function blocMiniJeux(e) {
  const m = e.minijeux || {limite: 5, pieces: 10, bonus: 20};
  const lignes = Object.entries(MINI).map(([k, d]) => {
    const l = m[k] || [], lim = m.limites?.[k] || m.limite || 5, reste = lim - l.length, ok = l.filter(x => x === d.succes).length;
    // pastilles : une par essai ; au gardien, une par série de 5 (pleine si 5 arrêts)
    const past = k === 'gardien' ? Array.from({length: Math.ceil(lim / SERIE)}, (_, i) => { const s = l.slice(i * SERIE, i * SERIE + SERIE);
        return `<i class="j7p${s.length === SERIE ? (s.every(x => x === 'arret') ? ' j7p-ok' : ' j7p-ko') : ''}"></i>`; }).join('') + `<small>${ok}/${lim}</small>`
      : Array.from({length: lim}, (_, i) => `<i class="j7p${l[i] ? (l[i] === d.succes ? ' j7p-ok' : ' j7p-ko') : ''}"></i>`).join('');
    return `<div class="mj-ligne"><span class="mj-ic" aria-hidden="true">${d.icone}</span><div><b>${d.nom}</b><div class="j7-pastilles petit">${past}</div></div>
      <button class="btn gold petit" data-mini="${k}"${reste > 0 ? '' : ' disabled'}>${reste > 0 ? 'Jouer' : 'Demain'}</button></div>`;
  }).join('');
  return `<div class="mode"><div class="mode-t"><b>Mini-jeux</b><span>chaque jour</span></div>
    <p class="sub petit">${m.pieces || 50} pièces par réussite (${m.gains?.gardien || 10} par arrêt, en 5 séries de 5 tirs) et ${m.bonus || 100} de bonus pour une journée parfaite.</p>${lignes}</div>`;
}
const mjAttendre = ms => new Promise(r => MJ.timers.push(setTimeout(r, moinsAnim() ? 0 : ms)));
const mjAnim = (el, frames, o) => el.animate(frames, {fill: 'forwards', ...o, duration: moinsAnim() ? 0 : o.duration, delay: moinsAnim() ? 0 : o.delay || 0}).finished.catch(() => {});
function ouvrirMini(jeu, demo) {
  if (!MINI[jeu]) return;
  const m = demo ? {} : S().minijeux || {}, liste = demo ? [] : m[jeu] || [], limite = demo ? (jeu === 'gardien' ? 25 : 5) : m.limites?.[jeu] || m.limite || 5;
  if (liste.length >= limite) return toast('Reviens demain pour 5 nouveaux essais');
  const el = document.createElement('div');
  el.className = `j7 mj mj-${jeu}`;
  el.innerHTML = `<div class="j7-haut"><b class="j7-score"></b><button class="j7-quitter">Fermer</button></div>
    <div class="mj-scene">${JEUX[jeu].scene()}</div><p class="j7-aide"></p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro');
  Object.assign(MJ, {el, jeu, liste: [...liste], limite, gains: 0, demo: !!demo, toucher: null, timers: [], raf: 0, serie: [], serieN: 0});
  el.querySelector('.j7-quitter').addEventListener('click', e => { e.stopPropagation(); fermerMini(); });
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button') && MJ.toucher) MJ.toucher(e); });
  miniEssai();
}
function fermerMini() { MJ.timers.forEach(clearTimeout); cancelAnimationFrame(MJ.raf); MJ.el?.remove(); MJ.el = null; document.body.classList.remove('avec-intro'); route(true); }
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
  if (!MJ.demo) return Compte.miniJouer(MJ.jeu, entrees);
  const res = JEUX[MJ.jeu].demo(entrees), essais = [...MJ.liste, res.resultat];
  return Promise.resolve({...res, reussi: res.resultat === MINI[MJ.jeu].succes, pieces: 0, bonus: 0, essais, restants: MJ.limite - essais.length});
}
function miniFin(r) {
  const el = MJ.el; if (!el) return;
  MJ.liste = r.essais; MJ.gains += r.pieces + r.bonus;
  el.classList.add(r.reussi ? 'r-but' : 'r-rate');
  vibrer(r.reussi ? [30, 40, 60] : 40);
  miniAide('');
  const box = el.querySelector('.j7-resultat');
  box.innerHTML = `<b>${MINI[MJ.jeu].res[r.resultat] || r.resultat}</b>${r.pieces ? `<small>+${r.pieces} pièces</small>` : ''}${r.bonus ? `<small>5 sur 5 : +${r.bonus} pièces de bonus !</small>` : ''}`;
  box.hidden = false;
  const n = MJ.liste.length, ok = MJ.liste.filter(x => x === MINI[MJ.jeu].succes).length;
  if (MJ.jeu === 'gardien') {   // séries de 5 tirs enchaînés, sans bouton entre deux
    MJ.serie.push(r.resultat); MJ.serieN++;
    const a = MJ.serie.filter(x => x === 'arret').length;
    el.querySelector('.j7-score').textContent = `Tir ${MJ.serie.length}/${SERIE} · ${a} arrêt${a > 1 ? 's' : ''}`;
    if (MJ.serie.length < SERIE && r.restants > 0) { MJ.timers.push(setTimeout(() => { if (MJ.el) miniEssai(); }, moinsAnim() ? 300 : 1250)); return; }
    const gainsSerie = MJ.demo ? 0 : a * (S().minijeux?.gains?.gardien || 10) + (r.bonus || 0);
    el.querySelector('.j7-bas').innerHTML = `<p class="j7-bilan">Série : ${a} arrêt${a > 1 ? 's' : ''} sur ${MJ.serie.length}${MJ.demo ? ' · démo : pas de pièces' : ` · +${nb(gainsSerie)} pièces`}</p>`
      + (r.restants > 0 || MJ.demo ? `<button class="btn gold large mj-suivant">${MJ.demo && r.restants <= 0 ? 'Rejouer' : 'Série suivante'}</button>` : `<button class="btn gold large mj-fin">Fermer</button>`)
      + (r.restants > 0 ? `<button class="btn ghost large mj-fin">Fermer</button>` : '');
    el.querySelector('.mj-suivant')?.addEventListener('click', e => { e.stopPropagation(); if (MJ.demo && r.restants <= 0) MJ.liste = []; MJ.serie = []; miniEssai(); });
    el.querySelectorAll('.mj-fin').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); fermerMini(); }));
    return;
  }
  el.querySelector('.j7-score').textContent = `Essai ${n}/${MJ.limite} · ${ok} réussi${ok > 1 ? 's' : ''}`;
  el.querySelector('.j7-bas').innerHTML = r.restants > 0 ? `<button class="btn gold large mj-suivant">Essai suivant</button>`
    : MJ.demo ? `<p class="j7-bilan">${ok} sur ${MJ.limite} · démo : pas de pièces</p><button class="btn gold large mj-rejouer">Rejouer</button>`
    : `<p class="j7-bilan">${ok} sur ${MJ.limite} · +${nb(MJ.gains)} pièces</p><button class="btn gold large mj-fin">Fermer</button>`;
  el.querySelector('.mj-suivant')?.addEventListener('click', e => { e.stopPropagation(); miniEssai(); });
  el.querySelector('.mj-rejouer')?.addEventListener('click', e => { e.stopPropagation(); MJ.liste = []; miniEssai(); });
  el.querySelector('.mj-fin')?.addEventListener('click', e => { e.stopPropagation(); fermerMini(); });
}
// position d'un élément dans la scène (centre, en px)
const mjCentre = (el, scene) => { const a = el.getBoundingClientRect(), b = scene.getBoundingClientRect(); return {x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top}; };
const mjBouge = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };

// tireur de face (maillot rouge) : chaque bras peut armer le tir ; le ballon est dans la main du bras armé
const TIREUR_SVG = `<svg viewBox="0 0 100 160" class="tireur" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">
  <g class="t-jg"><path d="M44 96 L36 152" stroke="#2a2f38" stroke-width="12"/><path d="M28 154 h12" stroke="#fff" stroke-width="6"/></g>
  <g class="t-jd"><path d="M56 96 L64 152" stroke="#2a2f38" stroke-width="12"/><path d="M60 154 h12" stroke="#fff" stroke-width="6"/></g>
  <rect x="33" y="40" width="34" height="62" rx="12" fill="#c8372d"/><text x="50" y="80" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" font-family="sans-serif">9</text>
  <circle cx="50" cy="24" r="13" fill="#d9a77c"/><path d="M37 21 Q50 6 63 21" fill="#1a1a1a"/>
  <g class="t-bg"><path d="M37 48 L28 92" stroke="#c8372d" stroke-width="11"/><circle cx="27" cy="95" r="6" fill="#d9a77c"/><circle class="t-balle" cx="27" cy="102" r="9" fill="#f5d548" stroke="#1d5b8f" stroke-width="2"/></g>
  <g class="t-bd"><path d="M63 48 L72 92" stroke="#c8372d" stroke-width="11"/><circle cx="73" cy="95" r="6" fill="#d9a77c"/><circle class="t-balle" cx="73" cy="102" r="9" fill="#f5d548" stroke="#1d5b8f" stroke-width="2"/></g></g></svg>`;
// joueur de profil (pour la suspension) : jambes qui courent, bras de tir
const PROFIL_SVG = (couleur, num) => `<svg viewBox="0 0 80 130" class="profil" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">
  <g class="p-jar"><path d="M38 78 L30 124" stroke="#2a2f38" stroke-width="10"/></g>
  <g class="p-bar"><path d="M40 40 L30 70" stroke="${couleur}" stroke-width="9"/></g>
  <rect x="28" y="32" width="24" height="50" rx="10" fill="${couleur}"/><text x="40" y="64" text-anchor="middle" font-size="15" font-weight="900" fill="#fff" font-family="sans-serif">${num}</text>
  <circle cx="42" cy="20" r="11" fill="#d9a77c"/>
  <g class="p-jav"><path d="M42 78 L50 124" stroke="#2a2f38" stroke-width="10"/></g>
  <g class="p-bav"><path d="M44 40 L58 66" stroke="${couleur}" stroke-width="9"/><circle cx="59" cy="69" r="5" fill="#d9a77c"/></g></g></svg>`;

// joueur vu de dos (tir en suspension en 3D) : jambes et bras qui courent, au rythme de --cadence
const DOS_SVG = `<svg viewBox="0 0 80 130" class="dos" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">
  <g class="d-jg"><path d="M34 78 L28 124" stroke="#2a2f38" stroke-width="10"/><path d="M22 126 h10" stroke="#fff" stroke-width="5"/></g>
  <g class="d-jd"><path d="M46 78 L52 124" stroke="#2a2f38" stroke-width="10"/><path d="M48 126 h10" stroke="#fff" stroke-width="5"/></g>
  <g class="d-bg"><path d="M26 38 L16 66" stroke="#1d5b8f" stroke-width="9"/></g>
  <rect x="24" y="30" width="32" height="52" rx="11" fill="#1d5b8f"/><text x="40" y="66" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="sans-serif">7</text>
  <circle cx="40" cy="18" r="11" fill="#3b2a1a"/>
  <g class="d-bd"><path d="M54 38 L64 66" stroke="#1d5b8f" stroke-width="9"/><circle cx="65" cy="69" r="5" fill="#d9a77c"/></g></g></svg>`;
const JEUX = {
  // ── L'arrêt réflexe : on est dans les buts, face au tireur ──
  gardien: {
    scene: () => `<div class="g-salle"><div class="g-sol"><i class="g-l6"></i><i class="g-l9"></i></div>
      <div class="g-tireur"><div class="g-saut">${TIREUR_SVG}</div></div>
      <div class="g-cage"><i class="g-pg"></i><i class="g-pd"></i><i class="g-barre"></i>${['g', 'c', 'd'].map(c => ['h', 'b'].map(h => `<i class="g-z" data-z="${c}${h}"></i>`).join('')).join('')}</div>
      <div class="g-mains"><i class="g-main g-mg"></i><i class="g-main g-md"></i></div>
      <i class="g-ballon"></i><div class="g-chrono"><i></i></div></div>`,
    async essai(sc, n) {
      miniAide('Le tireur s’élance…');
      let prep;
      try { prep = MJ.demo ? {indice: (() => { const c = ['g', 'c', 'd'][Math.random() < .4 ? 0 : Math.random() < 2 / 3 ? 2 : 1], h = Math.random() < .5 ? 'h' : 'b';
        MJ.secret = {colonne: c, hauteur: h}; return {colonne: Math.random() < .65 ? c : ['g', 'c', 'd'][Math.floor(Math.random() * 3)], hauteur: Math.random() < .65 ? h : h === 'h' ? 'b' : 'h'}; })()}
        : await Compte.miniPreparer('gardien'); }
      catch (e) { toast(e.message); return fermerMini(); }
      const ind = prep.indice, tireur = sc.querySelector('.g-tireur'), saut = sc.querySelector('.g-saut'), vite = Math.max(.85, 1 - (MJ.serieN || 0) * .03);
      const course = 1150 * vite, envol = 650 * vite, armer = 520 * vite, lacher = course + envol + armer;   // le temps de lire le bras
      // course d'élan : il grandit en approchant
      mjAnim(tireur, [{transform: 'translate(-50%, 0) scale(.55)'}, {transform: 'translate(-50%, 0) scale(1)'}], {duration: course, easing: 'cubic-bezier(.4, 0, .6, 1)'});
      saut.animate([{transform: 'translateY(0)'}, {transform: 'translateY(-3%)'}], {duration: 150 * vite, iterations: Math.round(course / (150 * vite)), direction: 'alternate'});
      // le bras armé : celui du côté où il va tirer (l'indice), haut ou bas
      const bras = ind.colonne === 'g' ? 't-bg' : 't-bd', angle = {gh: 150, gb: 72, ch: -175, cb: -28, dh: -150, db: -72}[ind.colonne + ind.hauteur];
      sc.querySelectorAll('.t-balle').forEach(b => b.style.display = b.closest('.' + bras) ? '' : 'none');
      const t0 = performance.now();
      MJ.timers.push(setTimeout(() => {
        miniAide('Plonge !');
        mjAnim(saut, [{transform: 'translateY(0)'}, {transform: 'translateY(-16%)'}], {duration: envol, easing: 'cubic-bezier(.2, .8, .4, 1)'});
        mjAnim(sc.querySelector('.' + bras), [{transform: 'rotate(0deg)'}, {transform: `rotate(${angle}deg)`}], {duration: envol + armer * .6, easing: 'cubic-bezier(.3, .7, .3, 1)'});
        mjAnim(sc.querySelector('.g-chrono i'), [{transform: 'scaleX(1)'}, {transform: 'scaleX(0)'}], {duration: envol + armer + 450, easing: 'linear'});
      }, moinsAnim() ? 0 : course));
      let choisi = null;
      const envoyer = async (ent) => {
        MJ.toucher = null;
        let r; try { r = await miniEnvoyer(ent); } catch (e) { toast(e.message); return fermerMini(); }
        const reste = Math.max(0, t0 + lacher - performance.now());
        await mjAttendre(reste);
        if (MJ.el) await JEUX.gardien.tir(sc, r, ent, bras);
        miniFin(r);
      };
      MJ.toucher = e => {
        if (choisi) return;
        const cage = sc.querySelector('.g-cage').getBoundingClientRect();
        const fx = (e.clientX - cage.left) / cage.width, fy = (e.clientY - cage.top) / cage.height;
        choisi = {colonne: fx < 1 / 3 ? 'g' : fx > 2 / 3 ? 'd' : 'c', hauteur: fy < .5 ? 'h' : 'b', temps: Math.round(performance.now() - t0 - lacher)};
        vibrer(15); miniAide('');
        JEUX.gardien.plonger(sc, choisi);
        envoyer(choisi);
      };
      MJ.timers.push(setTimeout(() => { if (!choisi) { choisi = {colonne: 'c', hauteur: 'b', temps: 99999}; envoyer(choisi); } }, moinsAnim() ? 2500 : lacher + 450));
    },
    plonger(sc, z) {   // les mains du gardien partent vers la zone choisie, la vue suit le plongeon
      const cage = sc.querySelector('.g-cage'), cx = {g: 1 / 6, c: .5, d: 5 / 6}[z.colonne], cy = z.hauteur === 'h' ? .28 : .72;
      const scn = sc.getBoundingClientRect(), cr = cage.getBoundingClientRect();
      const x = cr.left - scn.left + cr.width * cx, y = cr.top - scn.top + cr.height * cy, ec = Math.min(70, cr.width * .1);
      for (const [m, dx, rot] of [['.g-mg', -ec, -25], ['.g-md', ec, 25]]) {
        const el = sc.querySelector(m), c = mjCentre(el, sc);
        mjAnim(el, [{transform: 'translate(-50%, -50%)'}, {transform: `translate(-50%, -50%) translate(${x + dx - c.x}px, ${y - c.y}px) rotate(${rot + (z.colonne === 'g' ? -30 : z.colonne === 'd' ? 30 : 0)}deg) scale(1.15)`}],
          {duration: 230, easing: 'cubic-bezier(.2, .9, .3, 1.15)'});
      }
      mjAnim(sc.querySelector('.g-salle'), [{transform: 'none'}, {transform: `translateX(${z.colonne === 'g' ? 4 : z.colonne === 'd' ? -4 : 0}%) rotate(${z.colonne === 'g' ? -3 : z.colonne === 'd' ? 3 : 0}deg) translateY(${z.hauteur === 'b' ? -2 : 1}%)`}],
        {duration: 320, easing: 'cubic-bezier(.2, .8, .3, 1)'});
    },
    async tir(sc, r, ent, bras) {   // le ballon part vers la vraie zone et grossit (il arrive vers nous)
      const zone = r.reponse || {colonne: ent.colonne, hauteur: ent.hauteur};
      const balle = sc.querySelector('.' + bras + ' .t-balle'), b = sc.querySelector('.g-ballon'), dep = mjCentre(balle, sc);
      sc.querySelectorAll('.t-balle').forEach(x => x.style.display = 'none');
      const cr = sc.querySelector('.g-cage').getBoundingClientRect(), scn = sc.getBoundingClientRect();
      const cx = {g: .14, c: .5, d: .86}[zone.colonne] + (Math.random() - .5) * .06, cy = (zone.hauteur === 'h' ? .24 : .76) + (Math.random() - .5) * .06;
      const ax = cr.left - scn.left + cr.width * cx, ay = cr.top - scn.top + cr.height * cy;
      mjBouge(b, dep.x, dep.y); b.style.opacity = 1;
      mjAnim(sc.querySelector('.' + bras), [{}, {transform: `rotate(${zone.colonne === 'g' ? 40 : zone.colonne === 'd' ? -40 : 0}deg)`}], {duration: 160});
      await mjAnim(b, [{transform: 'translate(-50%, -50%) scale(.3) rotate(0deg)'}, {transform: `translate(-50%, -50%) translate(${ax - dep.x}px, ${ay - dep.y}px) scale(2.3) rotate(400deg)`}],
        {duration: r.resultat === 'tard' ? 380 : 430, easing: 'cubic-bezier(.5, 0, .9, .6)'});
      const fin = `translate(-50%, -50%) translate(${ax - dep.x}px, ${ay - dep.y}px)`;
      if (r.resultat === 'arret') {   // repoussé : il repart vers le terrain en tournant, l'écran tremble
        const eclat = document.createElement('i'); eclat.className = 'g-eclat'; mjBouge(eclat, ax, ay); sc.querySelector('.g-salle').appendChild(eclat);
        mjAnim(eclat, [{transform: 'translate(-50%, -50%) scale(.2)', opacity: 1}, {transform: 'translate(-50%, -50%) scale(2.4)', opacity: 0}], {duration: 450});
        mjAnim(sc.querySelector('.g-salle'), [{translate: '0 0'}, {translate: '-6px 3px'}, {translate: '6px -3px'}, {translate: '-3px 2px'}, {translate: '0 0'}], {duration: 260});
        await mjAnim(b, [{transform: fin + ' scale(2.3) rotate(400deg)'}, {transform: `${fin} translate(${(cx < .5 ? -1 : 1) * 120}px, -160px) scale(1) rotate(820deg)`, opacity: .2}],
          {duration: 520, easing: 'cubic-bezier(.2, .7, .4, 1)'});
      } else {   // il nous passe : il grossit encore et file dans le filet, les poteaux vibrent
        mjAnim(sc.querySelector('.g-cage'), [{transform: 'scale(1)'}, {transform: 'scale(1.015)'}, {transform: 'scale(1)'}], {duration: 300, delay: 120});
        sc.querySelector('.g-salle').classList.add('encaisse');
        await mjAnim(b, [{transform: fin + ' scale(2.3) rotate(400deg)', opacity: 1, filter: 'blur(0)'}, {transform: `${fin} translate(${(cx - .5) * 160}px, ${(cy - .5) * 120}px) scale(4.2) rotate(560deg)`, opacity: 0, filter: 'blur(4px)'}],
          {duration: 260, easing: 'ease-in'});
      }
    },
    demo(ent) {
      const s = MJ.secret || {colonne: 'c', hauteur: 'b'};
      const resultat = ent.temps > 450 ? 'tard' : ent.colonne === s.colonne && (ent.hauteur === s.hauteur || Math.random() < .4) ? 'arret' : 'but';
      return {resultat, reponse: s};
    },
  },

  // ── La contre-attaque en 2 contre 1 : vue de dessus ; tu portes le ballon, ton partenaire court sur l'autre couloir,
  // le défenseur sort sur l'un des deux. Tu dessines la passe au doigt (dans la course du partenaire), ou tu gardes le ballon.
  contre: {
    scene: () => `<div class="c-terrain"><svg class="c-lignes" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
        <rect x="2" y="2" width="96" height="146" fill="none"/><path d="M2 75 H98"/><path d="M20 2 A30 30 0 0 0 80 2" /><path d="M14 2 A36 36 0 0 0 86 2" stroke-dasharray="3 3"/>
        <path d="M20 148 A30 30 0 0 1 80 148"/><path d="M14 148 A36 36 0 0 1 86 148" stroke-dasharray="3 3"/><rect class="c-cage" x="42" y="0" width="16" height="2.5"/><rect class="c-cage" x="42" y="147.5" width="16" height="2.5"/></svg>
      <svg class="c-trace" aria-hidden="true"><polyline points=""/></svg>
      <div class="c-j c-gardien r"><b>1</b></div><div class="c-j c-defenseur r"><b>4</b></div>
      <div class="c-j c-b"><b>9</b></div><div class="c-j c-a moi"><b>7</b><small>toi</small></div>
      <i class="c-ombre"></i><i class="c-ballon"></i></div>`,
    async essai(sc, n) {
      const T = sc.querySelector('.c-terrain'), W = T.clientWidth, H = T.clientHeight, P = (x, y) => ({x: x * W / 100, y: y * H / 150});
      const q = s => sc.querySelector(s), vite = Math.max(.8, 1 - n * .05);
      let prep;
      try { prep = MJ.demo ? (MJ.secret = {defenseur: Math.random() < .55 ? 'A' : 'B', engage: 800 + Math.floor(Math.random() * 600)}) : await Compte.miniPreparer('contre'); }
      catch (e) { toast(e.message); return fermerMini(); }
      const duree = 2400 / vite, engage = prep.engage / vite;
      const A0 = P(30, 140), A1 = P(30, 40), B0 = P(72, 136), B1 = P(74, 30), D0 = P(52, 52), G0 = P(50, 6);
      const lerp = (a, b, u) => ({x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u}), ease = u => u < 0 ? 0 : u > 1 ? 1 : u;
      const posA = t => lerp(A0, A1, ease(t / duree)), posB = t => lerp(B0, B1, ease(t / duree));
      const els = {a: q('.c-a'), b: q('.c-b'), d: q('.c-defenseur'), g: q('.c-gardien'), ballon: q('.c-ballon'), ombre: q('.c-ombre')};
      mjBouge(els.g, G0.x, G0.y);
      els.a.classList.add('court'); els.b.classList.add('court'); els.d.classList.add('court');
      miniAide('Dessine ta passe avec le doigt… ou garde le ballon');
      // le défenseur attend au centre, puis sort sur sa cible au moment « engage »
      let fini = false, decision = null, t0 = performance.now(), trace = [], dessin = false, dPos = {...D0};
      const poly = q('.c-trace polyline');
      const boucle = now => {
        if (!MJ.el || fini) return;
        const t = now - t0, a = posA(t), b = posB(t);
        mjBouge(els.a, a.x, a.y); mjBouge(els.b, b.x, b.y);
        if (!decision || decision.passe === false) { mjBouge(els.ballon, a.x + 12, a.y - 10); mjBouge(els.ombre, a.x + 12, a.y - 2); }
        const cible = t < engage ? {x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 70} : prep.defenseur === 'A' ? a : b;
        const v = t < engage ? .9 : 3.2;   // il s'avance, puis fonce
        const dx = cible.x - dPos.x, dy = cible.y - dPos.y, dist = Math.hypot(dx, dy);
        if (dist > 26) { dPos.x += dx / dist * Math.min(dist, v * 16 / vite); dPos.y += dy / dist * Math.min(dist, v * 16 / vite); }
        mjBouge(els.d, dPos.x, dPos.y);
        if (!decision && (t > engage + 900 / vite && prep.defenseur === 'A' && dist < 30)) return decider({passe: false, temps: Math.round(t * vite)}, null);   // il est sur toi
        if (!decision && t > duree) return decider({passe: false, temps: Math.round(t * vite)}, null);   // fin de course : tu gardes et tu tires
        MJ.raf = requestAnimationFrame(boucle);
      };
      const decider = async (ent, fin) => {
        if (decision) return; decision = ent; MJ.toucher = null; miniAide('');
        let r; try { r = await miniEnvoyer(ent); } catch (e) { toast(e.message); return fermerMini(); }
        fini = true; cancelAnimationFrame(MJ.raf);
        await JEUX.contre.jouer(sc, r, ent, fin, els, prep, dPos, posB(performance.now() - t0 + 500), G0);
        miniFin(r);
      };
      // la passe dessinée : on part près de soi, on trace, on lâche
      const local = e => { const b = T.getBoundingClientRect(); return {x: e.clientX - b.left, y: e.clientY - b.top}; };
      MJ.toucher = e => {
        const p = local(e), a = mjCentre(els.a, T);
        if (Math.hypot(p.x - a.x, p.y - a.y) > 90) return;   // il faut partir de son joueur
        dessin = true; trace = [a, p]; poly.setAttribute('points', trace.map(z => `${z.x},${z.y}`).join(' '));
      };
      const bouge = e => { if (!dessin) return; trace.push(local(e)); poly.setAttribute('points', trace.map(z => `${z.x},${z.y}`).join(' ')); };
      const lache = e => {
        if (!dessin) return; dessin = false;
        const fin = trace[trace.length - 1], t = performance.now() - t0;
        if (trace.length < 3 || Math.hypot(fin.x - trace[0].x, fin.y - trace[0].y) < 40) { poly.setAttribute('points', ''); return; }   // trop court : pas de passe
        const ideal = posB(t + 520), qualite = Math.max(0, 1 - Math.hypot(fin.x - ideal.x, fin.y - ideal.y) / (W * .24));
        sc.classList.add(qualite > .7 ? 'passe-top' : qualite > .35 ? 'passe-moy' : 'passe-rate');
        decider({passe: true, qualite: Math.round(qualite * 1000) / 1000, temps: Math.round(t * vite)}, trace.slice());
      };
      T.addEventListener('pointermove', bouge); T.addEventListener('pointerup', lache); T.addEventListener('pointercancel', lache);
      MJ.raf = requestAnimationFrame(boucle);
    },
    async jouer(sc, r, ent, trace, els, prep, dPos, bArrivee, G0) {
      const {a, b, d, g, ballon, ombre} = els;
      [a, b, d].forEach(x => x.classList.remove('court'));
      const pa = mjCentre(a, sc.querySelector('.c-terrain')), pb = mjCentre(b, sc.querySelector('.c-terrain'));
      const vole = async (pts, ms) => {   // le ballon suit les points (la passe dessinée), son ombre au sol
        const k = pts.map((p, i) => ({left: p.x + 'px', top: p.y + 'px', offset: i / (pts.length - 1)}));
        mjAnim(ombre, k, {duration: ms, easing: 'linear'});
        await mjAnim(ballon, pts.map((p, i) => ({left: p.x + 'px', top: p.y - Math.sin(Math.PI * i / (pts.length - 1)) * 26 + 'px',
          transform: `translate(-50%, -50%) scale(${1 + .6 * Math.sin(Math.PI * i / (pts.length - 1))})`, offset: i / (pts.length - 1)})), {duration: ms, easing: 'linear'});
      };
      const tirAuBut = async (de, marque) => {   // tir vers le but du haut, le gardien plonge
        const cible = {x: G0.x + (marque ? (de.x < G0.x ? 26 : -26) : (de.x < G0.x ? -8 : 8)), y: G0.y - 2};
        mjAnim(g, [{left: G0.x + 'px'}, {left: (marque ? G0.x - (cible.x - G0.x) : cible.x) + 'px'}], {duration: 260, easing: 'ease-out'});
        await mjAnim(ballon, [{left: de.x + 'px', top: de.y + 'px', transform: 'translate(-50%, -50%) scale(1.2)'}, {left: cible.x + 'px', top: cible.y + 'px', transform: 'translate(-50%, -50%) scale(.8)'}],
          {duration: 340, easing: 'cubic-bezier(.3, .6, .4, 1)'});
        if (marque) sc.querySelector('.c-terrain').classList.add('but');
        else await mjAnim(ballon, [{left: cible.x + 'px', top: cible.y + 'px'}, {left: cible.x + (de.x < G0.x ? -50 : 50) + 'px', top: cible.y + 60 + 'px'}], {duration: 380, easing: 'ease-out'});
      };
      ombre.style.opacity = 1;
      if (ent.passe) {
        // la passe suit le trait dessiné (12 points au plus) ; interceptée : le défenseur coupe la trajectoire
        const pts = trace.filter((_, i) => i % Math.max(1, Math.floor(trace.length / 12)) === 0).concat([trace[trace.length - 1]]);
        if (r.resultat === 'interception') {
          const mi = pts[Math.floor(pts.length * .55)];
          mjAnim(d, [{left: dPos.x + 'px', top: dPos.y + 'px'}, {left: mi.x + 'px', top: mi.y + 'px'}], {duration: 300, easing: 'ease-out'});
          await vole(pts.slice(0, Math.floor(pts.length * .55) + 1), 300);
          d.classList.add('balle'); ombre.style.opacity = 0;
          await Promise.all([mjAnim(d, [{left: mi.x + 'px', top: mi.y + 'px'}, {left: mi.x + 'px', top: mi.y + 160 + 'px'}], {duration: 700, easing: 'ease-in-out'}),
            mjAnim(ballon, [{left: mi.x + 'px', top: mi.y + 'px'}, {left: mi.x + 'px', top: mi.y + 150 + 'px'}], {duration: 700, easing: 'ease-in-out'})]);
          return;
        }
        const fin = pts[pts.length - 1];
        mjAnim(b, [{left: pb.x + 'px', top: pb.y + 'px'}, {left: fin.x + 'px', top: fin.y + 'px'}], {duration: 520, easing: 'ease-out'});
        await vole(pts, 520);
        ombre.style.opacity = 0; b.classList.add('balle');
        const saut = {x: fin.x + (fin.x > G0.x ? -30 : 30), y: fin.y - 60};
        await Promise.all([mjAnim(b, [{left: fin.x + 'px', top: fin.y + 'px', transform: 'translate(-50%, -50%) scale(1)'}, {left: saut.x + 'px', top: saut.y + 'px', transform: 'translate(-50%, -50%) scale(1.35)'}], {duration: 380, easing: 'ease-out'}),
          mjAnim(ballon, [{left: fin.x + 'px', top: fin.y + 'px'}, {left: saut.x + 'px', top: saut.y - 8 + 'px'}], {duration: 380, easing: 'ease-out'})]);
        b.classList.remove('balle');
        await tirAuBut(saut, r.resultat === 'but');
        return;
      }
      if (r.resultat === 'neutralise') {   // le défenseur est sur toi : il te prend le ballon
        mjAnim(d, [{left: dPos.x + 'px', top: dPos.y + 'px'}, {left: pa.x + 6 + 'px', top: pa.y - 14 + 'px'}], {duration: 220, easing: 'ease-out'});
        await mjAttendre(220);
        d.classList.add('balle'); ombre.style.opacity = 0;
        mjAnim(sc.querySelector('.c-terrain'), [{translate: '0 0'}, {translate: '-4px 0'}, {translate: '4px 0'}, {translate: '0 0'}], {duration: 200});
        await mjAnim(ballon, [{left: pa.x + 12 + 'px', top: pa.y - 10 + 'px'}, {left: pa.x + 8 + 'px', top: pa.y - 22 + 'px'}], {duration: 300});
        return;
      }
      // tu as gardé : tu montes seul et tu tires
      ombre.style.opacity = 0;
      const saut = {x: pa.x + 24, y: pa.y - 60};
      await Promise.all([mjAnim(a, [{left: pa.x + 'px', top: pa.y + 'px', transform: 'translate(-50%, -50%) scale(1)'}, {left: saut.x + 'px', top: saut.y + 'px', transform: 'translate(-50%, -50%) scale(1.35)'}], {duration: 380, easing: 'ease-out'}),
        mjAnim(ballon, [{left: pa.x + 12 + 'px', top: pa.y - 10 + 'px'}, {left: saut.x + 'px', top: saut.y - 8 + 'px'}], {duration: 380, easing: 'ease-out'})]);
      await tirAuBut(saut, r.resultat === 'but');
    },
    demo(ent) {
      const s = MJ.secret || {defenseur: 'A', engage: 1000}, x = ent.qualite || 0;
      let resultat;
      if (ent.passe) resultat = ent.temps > s.engage + 900 ? 'neutralise' : s.defenseur === 'A'
        ? (x < .35 && Math.random() < .75 ? 'interception' : Math.random() < .35 + .55 * x ? 'but' : 'arret')
        : (Math.random() < .65 ? 'interception' : Math.random() < .25 * x ? 'but' : 'arret');
      else resultat = s.defenseur === 'B' ? (Math.random() < .8 ? 'but' : 'arret') : (Math.random() < .85 ? 'neutralise' : Math.random() < .3 ? 'but' : 'arret');
      return {resultat, reponse: s};
    },
  },

  // ── Le tir en suspension, en 3D : la caméra suit le tireur de dos. Chaque toucher est un appui (on court plus vite) ;
  // le saut part tout seul au 9 m, plus haut et plus long si l'on court vite ; puis on dessine le tir vers le but.
  suspension: {
    scene: () => `<div class="s3"><canvas class="s3-sol"></canvas>
      <div class="s3-perso s3-gardien">${GARDIEN_SVG}</div><div class="s3-perso s3-def">${TIREUR_SVG.replace('class="tireur"', 'class="tireur contreur"')}</div>
      <div class="s3-perso s3-joueur">${DOS_SVG}</div><i class="s3-ballon"></i>
      <svg class="s3-trace" aria-hidden="true"><polyline points=""/></svg>
      <div class="s3-vitesse"><i></i><small>Vitesse</small></div></div>`,
    async essai(sc, n) {
      const q = s => sc.querySelector(s), cv = q('.s3-sol'), ctx = cv.getContext('2d');
      const W = sc.clientWidth, H = sc.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // monde en mètres : x à droite, y en haut, z vers le but (ligne de but en z = 20)
      const ZB = 20, ZDEF = 13.7, f = W * 1.35, HOR = H * .3;   // caméra serrée, juste derrière le tireur
      const cam = {x: 0, y: 2.3, z: 0}, jo = {x: -1.4, y: 0, z: 4.5}, def = {x: -1, y: 0, z: ZDEF}, gk = {x: 0, z: ZB - .4};
      const proj = (x, y, z) => { const d = Math.max(.3, z - cam.z), s = f / d; return {x: W / 2 + (x - cam.x) * s, y: HOR + (cam.y - y) * s, s}; };
      let v = 1.6, phase = 'course', tSaut = 0, Tvol = 0, Hsaut = 0, zSaut = 0, tir = null, filet = 0, t0 = performance.now(), dernier = t0;
      const placer = (el, p, hauteurM, lift = 0) => { const pp = proj(p.x, p.y + lift, p.z); el.style.left = pp.x + 'px'; el.style.top = pp.y + 'px'; el.style.width = (hauteurM * pp.s * .55) + 'px'; el.style.zIndex = Math.round(100 - p.z); };
      const ligne = (pts, couleur, larg, tirets) => { ctx.beginPath(); ctx.setLineDash(tirets || []); pts.forEach((p, i) => { const a = proj(p[0], 0, p[1]); i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y); });
        ctx.strokeStyle = couleur; ctx.lineWidth = larg; ctx.stroke(); ctx.setLineDash([]); };
      const arc = r => { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12 * Math.PI / 2; pts.push([-1.5 - r * Math.cos(t), ZB - r * Math.sin(t)]); }
        for (let k = 12; k >= 0; k--) { const t = k / 12 * Math.PI / 2; pts.push([1.5 + r * Math.cos(t), ZB - r * Math.sin(t)]); } return pts; };
      const dessiner = () => {
        ctx.clearRect(0, 0, W, H);
        const g = ctx.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, '#5a3f28'); g.addColorStop(1, '#b07a45');
        ctx.fillStyle = g; ctx.fillRect(0, HOR, W, H - HOR);
        for (let x = -12; x <= 12; x += .9) ligne([[x, cam.z + .5], [x, 40]], 'rgba(0, 0, 0, .09)', 1);   // lames du parquet, qui filent vers l'horizon
        ligne(arc(6), 'rgba(255, 255, 255, .85)', 3); ligne(arc(9), 'rgba(255, 255, 255, .55)', 2.5, [10, 8]);
        ligne([[-10, ZB], [10, ZB]], 'rgba(255, 255, 255, .7)', 2);
        // le but : filet puis montants rouges et blancs
        const c = (x, y, z) => proj(x, y, z), p1 = c(-1.5, 0, ZB), p2 = c(-1.5, 2, ZB), p3 = c(1.5, 2, ZB), p4 = c(1.5, 0, ZB), fond = (x, y) => c(x, y * .9, ZB + 1 + filet * .5);
        ctx.fillStyle = 'rgba(12, 14, 18, .65)'; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, .22)'; ctx.lineWidth = 1;
        for (let k = 0; k <= 10; k++) { const x = -1.5 + k * .3, a = c(x, 2, ZB), b = fond(x, 2), d0 = c(x, 0, ZB); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(d0.x, d0.y); ctx.stroke(); }
        for (let k = 0; k <= 7; k++) { const y = k * .29, a = c(-1.5, y, ZB), b = c(1.5, y, ZB); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        const montant = (a, b) => { for (let k = 0; k < 8; k++) { const u = k / 8, w = (k + 1) / 8; ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
          ctx.lineTo(a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w); ctx.strokeStyle = k % 2 ? '#f4f4f4' : '#e5484d'; ctx.lineWidth = Math.max(3, .08 * p1.s); ctx.stroke(); } };
        montant(p1, p2); montant(p2, p3); montant(p4, p3);
      };
      const jauge = q('.s3-vitesse i'), joueur = q('.s3-joueur'), defenseur = q('.s3-def'), gardien = q('.s3-gardien'), ballon = q('.s3-ballon');
      joueur.querySelector('svg').classList.add('court');
      miniAide('Touche vite pour courir !');
      const finir = async ent => {
        phase = 'attente'; MJ.toucher = null; miniAide('');
        let r; try { r = await miniEnvoyer(ent); } catch (e) { toast(e.message); return fermerMini(); }
        tir = {r, ent, t: performance.now(), dep: {x: jo.x + .35, y: jo.y + 2.15, z: jo.z + .2}};
        const cx = -1.5 + 3 * Math.max(-.2, Math.min(1.2, r.x ?? ent.x)), cy = 2 * (1 - Math.max(-.2, Math.min(1.1, r.y ?? ent.y)));
        tir.arr = {x: cx, y: cy, z: ZB + .1}; tir.duree = 650 - 300 * ent.force;
        if (r.resultat === 'contre') { tir.arr = {x: def.x + .25, y: 2.35, z: ZDEF}; tir.duree *= .5; }
        // le gardien pare (vers le ballon s'il l'arrête) ; le contreur saute s'il contre
        if (r.resultat === 'contre') defenseur.querySelector('svg').classList.add('saute');
        const gg = r.resultat === 'arret' ? {x: (cx + 1.5) / 3, y: 1 - cy / 2} : r.reponse || {x: .5, y: .5}, Pg = parade(Math.abs(gg.x - .5) < .18 ? .5 : gg.x, gg.y);
        const mv = {duration: tir.duree * .8, delay: 60, easing: 'cubic-bezier(.2, .9, .3, 1.1)', fill: 'forwards'};
        gardien.querySelector('svg').animate([{transform: 'none'}, {transform: `translate(${Pg.dx * 30}%, ${Pg.dy}%)`}], mv);
        for (const [cls, rot] of [['gk-corps', Pg.corps], ['gk-bg', Pg.bg], ['gk-bd', Pg.bd], ['gk-jg', Pg.jg], ['gk-jd', Pg.jd]])
          gardien.querySelector('.' + cls).animate([{transform: 'rotate(0deg)'}, {transform: `rotate(${rot}deg)`}], mv);
        await new Promise(res => { tir.fin = res; });
        miniFin(r);
      };
      const boucle = now => {
        if (!MJ.el) return;
        const dt = Math.min(.05, (now - dernier) / 1000); dernier = now;
        if (phase === 'course') {
          v = Math.max(1.2, v - 1.8 * dt);   // on ralentit si on n'appuie plus
          jo.z += v * dt;
          joueur.querySelector('svg').style.setProperty('--cadence', (.5 - v * .04).toFixed(2) + 's');
          jauge.style.transform = `scaleY(${v / 8})`;
          if (jo.z >= 11) {   // le saut part tout seul au 9 m, selon la vitesse
            phase = 'vol'; tSaut = now; Tvol = 500 + 65 * v; Hsaut = .25 + .1 * v; zSaut = jo.z;
            joueur.querySelector('svg').classList.remove('court'); joueur.querySelector('svg').classList.add('saute');
            miniAide('Dessine ton tir vers le but !'); vibrer(15);
          }
        } else if (phase === 'vol' || (phase === 'attente' && tSaut)) {
          const u = Math.min(1, (now - tSaut) / Tvol);
          jo.z = zSaut + v * .2 * u * Tvol / 1000; jo.y = Hsaut * Math.sin(Math.PI * u);   // il avance un peu en l'air, sans dépasser le contreur
          if (phase === 'vol' && u >= 1) { finir({vitesse: 0, hauteur: 0, x: .5, y: .85, force: .2}); }   // retombé sans tirer
        }
        cam.z = jo.z - 3.6; cam.x = jo.x * .75;
        dessiner();
        placer(gardien, {x: gk.x, y: 0, z: gk.z}, 1.95); placer(defenseur, def, 1.95, defenseur.querySelector('.saute') ? .45 : 0); placer(joueur, jo, 1.9);
        if (tir) {   // le ballon en 3D, de la main jusqu'au but (ou au contreur)
          const u = Math.min(1, (now - tir.t) / tir.duree), a = tir.dep, b = tir.arr, cloche = Math.sin(Math.PI * u) * .25;
          const p = proj(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + cloche, a.z + (b.z - a.z) * u);
          ballon.style.opacity = 1; ballon.style.left = p.x + 'px'; ballon.style.top = p.y + 'px'; ballon.style.width = ballon.style.height = Math.max(6, .19 * p.s) + 'px';
          ballon.style.zIndex = 200;
          if (u >= 1 && !tir.arrive) {
            tir.arrive = true;
            const res = tir.r.resultat;
            if (!tir.rebond && ['arret', 'contre', 'poteau'].includes(res)) {   // renvoyé vers le terrain
              tir.dep = {...b}; tir.arr = {x: b.x + (b.x < 0 ? -2 : 2), y: 0, z: b.z - 4}; tir.t = now; tir.duree = 500; tir.arrive = false; tir.rebond = true;
              vibrer(30);
            } else {
              if (res === 'but') { const t1 = now; const gonfle = () => { filet = Math.sin(Math.min(1, (performance.now() - t1) / 400) * Math.PI); if (performance.now() - t1 < 400) requestAnimationFrame(gonfle); else filet = 0; }; gonfle(); }
              MJ.timers.push(setTimeout(() => tir.fin?.(), 450));
            }
          }
        }
        MJ.raf = requestAnimationFrame(boucle);
      };
      // appuis : chaque toucher pendant la course donne de la vitesse ; en l'air, on dessine le tir
      const trace = q('.s3-trace polyline'); let pts = [], tDessin = 0;
      MJ.toucher = e => {
        if (phase === 'course') { v = Math.min(8, v + 1.15); vibrer(5); joueur.animate([{translate: '0 0'}, {translate: '0 -4px'}, {translate: '0 0'}], {duration: 120}); return; }
        if (phase === 'vol') { pts = [{x: e.clientX, y: e.clientY}]; tDessin = performance.now(); }
      };
      const local = p => { const b = sc.getBoundingClientRect(); return `${p.x - b.left},${p.y - b.top}`; };
      const zone = q('.s3');
      zone.addEventListener('pointermove', e => { if (phase !== 'vol' || !pts.length) return; pts.push({x: e.clientX, y: e.clientY}); trace.setAttribute('points', pts.map(local).join(' ')); });
      const lache = () => {
        if (phase !== 'vol' || pts.length < 2) return;
        const a = pts[0], b = pts[pts.length - 1], long = Math.hypot(b.x - a.x, b.y - a.y), ms = Math.max(60, performance.now() - tDessin);
        if (long < 30) { pts = []; return; }
        // point visé : la fin du trait, ramenée sur le but (x de 0 à 1 entre les poteaux, y de 0 sous la barre à 1 au sol)
        const bx = sc.getBoundingClientRect(), g1 = proj(-1.5, 2, ZB), g2 = proj(1.5, 0, ZB);
        // borné : bien à côté reste « à côté », sans sortir des valeurs acceptées par le serveur
        const x = Math.max(-.45, Math.min(1.45, (b.x - bx.left - g1.x) / (g2.x - g1.x))), y = Math.max(-.45, Math.min(1.15, (b.y - bx.top - g1.y) / (g2.y - g1.y)));
        const u = Math.min(1, (performance.now() - tSaut) / Tvol);
        finir({vitesse: Math.round(v / 8 * 1000) / 1000, hauteur: Math.round(Math.sin(Math.PI * u) * 1000) / 1000, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000,
          force: Math.round(Math.min(1, long / ms / 1.6) * 1000) / 1000});
        joueur.querySelector('svg').classList.add('tire');
      };
      zone.addEventListener('pointerup', lache); zone.addEventListener('pointercancel', lache);
      MJ.raf = requestAnimationFrame(boucle);
    },
    demo(ent) {
      const {x, y} = ent, elev = (ent.vitesse || 0) * (ent.hauteur || 0), a = Math.random(), gx = a < .3 ? .2 : a < .6 ? .8 : .5, gy = Math.random() < .5 ? .3 : .75;
      const prt = .62 - .4 * (ent.force || 0) + (gx === .5 ? .08 : 0);
      const resultat = x < 0 || x > 1 || y < 0 ? 'dehors' : x < .05 || x > .95 || y < .05 ? 'poteau' : Math.random() < Math.max(0, .75 - .8 * elev - .35 * (1 - y)) ? 'contre'
        : Math.abs(x - .5) < .18 ? 'arret' : Math.hypot(x - (.5 + (gx - .5) * .6), (y - gy) * .67) < prt ? 'arret' : 'but';
      return {resultat, reponse: {x: gx, y: gy}};
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
  vibrer(25);
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
  else if (demo !== null) demoBooster(demo);
  if (info.erreurLien) toast('Ce lien a expiré ou a déjà servi : recommence');
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
