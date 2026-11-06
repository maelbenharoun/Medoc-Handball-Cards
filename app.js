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
  const t = e.target.closest('[data-act],[data-booster],[data-bposte],[data-quete],[data-filtre],[data-slot],[data-choix],[data-entrainer],[data-vendre],[data-fusion],[data-tactique],[data-defier],[data-mfiltre],[data-offre],[data-veut],[data-palier-veut],[data-retirer-annonce],[data-accepter],[data-pfiltre],[data-pari],[data-valider-pari],.grid .card');
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
// Une barre de visée va et vient le long du but, puis une jauge de puissance monte et descend : on touche pour
// arrêter chacune. Le serveur fait plonger le gardien et décide du résultat (tirer_7m). 5 tirs par jour.
const J7 = {};
const RES7 = {but: ['But !', 'but'], arret: ['Arrêté !', 'rate'], dessus: ['Au-dessus !', 'rate'], poteau: ['Poteau !', 'rate']};
function blocJet7m(e) {
  const j = e.jet7m || {tirs: [], limite: 5, piecesBut: 15, bonus: 25}, reste = j.limite - j.tirs.length, buts = j.tirs.filter(x => x === 'but').length;
  const pastilles = Array.from({length: j.limite}, (_, i) => `<i class="j7p${j.tirs[i] ? ' ' + RES7[j.tirs[i]][1] : ''}"></i>`).join('');
  return `<div class="mode"><div class="mode-t"><b>Jet de 7 mètres</b><span>${buts} but${buts > 1 ? 's' : ''} aujourd’hui</span></div>
    <p class="sub petit">Arrête la visée puis la puissance au bon moment. ${j.piecesBut} pièces par but, ${j.bonus} de plus pour un 5 sur 5 ; ${j.limite} tirs par jour.</p>
    <div class="j7-pastilles">${pastilles}</div>
    <button class="btn gold large" data-act="jet7m"${reste > 0 ? '' : ' disabled'}>${reste > 0 ? `Tirer · ${reste} tir${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}` : 'Reviens demain'}</button></div>`;
}
const GARDIEN_SVG = `<svg viewBox="0 0 100 120" aria-hidden="true"><g stroke-linecap="round">
  <path d="M38 40 L14 16 M62 40 L86 16" stroke="#1d5b8f" stroke-width="11"/><circle cx="12" cy="14" r="6" fill="#e8c4a0"/><circle cx="88" cy="14" r="6" fill="#e8c4a0"/>
  <path d="M43 86 L30 116 M57 86 L70 116" stroke="#14171c" stroke-width="12"/>
  <rect x="33" y="32" width="34" height="58" rx="11" fill="#1d5b8f"/><text x="50" y="69" text-anchor="middle" font-size="20" font-weight="900" fill="#ffd257" font-family="sans-serif">1</text>
  <circle cx="50" cy="20" r="12" fill="#e8c4a0"/><path d="M38 17 Q50 3 62 17" fill="#3b2a1a"/></g></svg>`;
function ouvrirJet7m() {
  const j = S().jet7m || {tirs: [], limite: 5};
  if (j.tirs.length >= j.limite) return toast('Reviens demain pour 5 nouveaux tirs');
  const el = document.createElement('div');
  el.className = 'j7';
  el.innerHTML = `<div class="j7-haut"><b class="j7-score"></b><button class="j7-quitter">Fermer</button></div>
    <div class="j7-terrain"><div class="j7-but"><div class="j7-filet"></div><div class="j7-gardien">${GARDIEN_SVG}</div>
      <div class="j7-visee"><i></i></div></div>
      <div class="j7-sol"><i class="j7-ligne6"></i><i class="j7-ligne7"></i></div><div class="j7-ballon"></div></div>
    <div class="j7-jauge" aria-hidden="true"><i class="j7-vert"></i><i class="j7-rouge"></i><i class="j7-niveau"></i><small>Puissance</small></div>
    <p class="j7-aide"></p><div class="j7-resultat" hidden></div><div class="j7-bas"></div>`;
  document.body.appendChild(el);
  document.body.classList.add('avec-intro');
  Object.assign(J7, {el, tirs: [...j.tirs], limite: j.limite, gains: 0});
  el.querySelector('.j7-quitter').addEventListener('click', e => { e.stopPropagation(); fermerJet7m(); });
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button')) toucherJet7m(); });
  nouveauTir();
}
function fermerJet7m() { cancelAnimationFrame(J7.raf); J7.el?.remove(); J7.el = null; document.body.classList.remove('avec-intro'); route(true); }
function nouveauTir() {
  const el = J7.el, n = J7.tirs.length;
  el.querySelector('.j7-score').textContent = `Tir ${n + 1}/${J7.limite} · ${J7.tirs.filter(x => x === 'but').length} but${J7.tirs.filter(x => x === 'but').length > 1 ? 's' : ''}`;
  el.querySelector('.j7-resultat').hidden = true; el.querySelector('.j7-bas').innerHTML = '';
  el.classList.remove('puissance', 'tir', 'r-but', 'r-rate');
  for (const q of ['.j7-gardien', '.j7-ballon', '.j7-filet']) { const x = el.querySelector(q); x.getAnimations().forEach(a => a.cancel()); x.style.transform = ''; }
  el.querySelector('.j7-aide').textContent = 'Touche pour viser';
  Object.assign(J7, {phase: 'visee', t0: performance.now(), periodeV: Math.max(.8, 1.3 - n * .1), periodeP: Math.max(.75, 1.05 - n * .06), visee: .5, puissance: 0});
  cancelAnimationFrame(J7.raf);
  const tri = (t, per) => { const x = (t / per) % 2; return x < 1 ? x : 2 - x; };   // va-et-vient de 0 à 1
  const boucle = now => {
    const t = (now - J7.t0) / 1000;
    if (J7.phase === 'visee') { J7.visee = tri(t, J7.periodeV); el.querySelector('.j7-visee').style.left = (J7.visee * 100) + '%'; }
    if (J7.phase === 'puissance') { J7.puissance = tri(t, J7.periodeP); el.querySelector('.j7-niveau').style.bottom = (J7.puissance * 100) + '%'; }
    if (J7.phase === 'visee' || J7.phase === 'puissance') J7.raf = requestAnimationFrame(boucle);
  };
  el.querySelector('.j7-niveau').style.bottom = '0%';
  J7.raf = requestAnimationFrame(boucle);
}
function toucherJet7m() {
  if (J7.phase === 'visee') {
    J7.phase = 'puissance'; J7.t0 = performance.now(); vibrer(10);
    J7.el.classList.add('puissance'); J7.el.querySelector('.j7-aide').textContent = 'Touche pour tirer';
    cancelAnimationFrame(J7.raf);
    const tri = (t, per) => { const x = (t / per) % 2; return x < 1 ? x : 2 - x; };
    const boucle = now => { if (J7.phase !== 'puissance') return; J7.puissance = tri((now - J7.t0) / 1000, J7.periodeP);
      J7.el.querySelector('.j7-niveau').style.bottom = (J7.puissance * 100) + '%'; J7.raf = requestAnimationFrame(boucle); };
    J7.raf = requestAnimationFrame(boucle);
  } else if (J7.phase === 'puissance') {
    J7.phase = 'tir'; cancelAnimationFrame(J7.raf); vibrer(20);
    J7.el.classList.add('tir'); J7.el.querySelector('.j7-aide').textContent = '';
    const v = Math.round(J7.visee * 1000) / 1000, f = Math.round(J7.puissance * 1000) / 1000;
    Compte.tirer7m(v, f).then(r => animerTir(r, v, f)).catch(e => { toast(e.message); fermerJet7m(); });
  }
}
function animerTir(r, v, f) {
  const el = J7.el; if (!el) return;
  J7.tirs = r.tirs; J7.gains += r.pieces + r.bonus;
  const but = el.querySelector('.j7-but').getBoundingClientRect(), ballon = el.querySelector('.j7-ballon'), b0 = ballon.getBoundingClientRect();
  // point visé dans le but : haut si la puissance est bonne, au milieu sinon ; au-dessus de la barre si trop fort
  // le dessin suit le résultat du serveur : arrêt = le gardien va au ballon ; but alors qu'il a deviné = au-dessus des bras, ou entre les jambes au centre
  const devine = r.resultat === 'but' && r.gardien === r.zone;
  const hauteur = r.resultat === 'dessus' ? -.25 : devine ? (r.zone === 'c' ? .86 : .1) : f > .6 ? .3 : .6;
  const x = but.left + but.width * (r.resultat === 'poteau' ? (v < .5 ? 0 : 1) : v), y = but.top + but.height * hauteur;
  const dx = x - (b0.left + b0.width / 2), dy = y - (b0.top + b0.height / 2), vite = moinsAnim() ? 0 : 1;
  const gardien = el.querySelector('.j7-gardien');
  const cote = r.resultat === 'arret' ? r.zone : r.gardien, court = devine && cote !== 'c';
  const plongeon = {g: `translate(${court ? -40 : -62}%, 8%) rotate(${court ? -45 : -62}deg)`, d: `translate(${court ? 40 : 62}%, 8%) rotate(${court ? 45 : 62}deg)`,
    c: devine ? 'translateY(-14%) scale(1.04)' : 'translateY(-6%) scale(1.06)'}[cote];
  gardien.animate([{transform: 'none'}, {transform: plongeon}], {duration: 360 * vite, delay: 60 * vite, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'forwards'});
  const frames = [{transform: 'translate(0, 0) scale(1)'}, {transform: `translate(${dx}px, ${dy}px) scale(.42)`}];
  if (r.resultat === 'arret') frames.push({transform: `translate(${dx + (v < .5 ? -1 : 1) * 70}px, ${dy + 90}px) scale(.5)`, opacity: .6});
  if (r.resultat === 'poteau') frames.push({transform: `translate(${dx + (v < .5 ? -1 : 1) * 60}px, ${dy + 40}px) scale(.4)`, opacity: .5});
  if (r.resultat === 'dessus') frames.push({transform: `translate(${dx * 1.2}px, ${dy - 80}px) scale(.3)`, opacity: 0});
  const a = ballon.animate(frames, {duration: (r.resultat === 'but' ? 380 : 620) * vite, easing: 'cubic-bezier(.25, .7, .4, 1)', fill: 'forwards'});
  a.finished.then(() => {
    if (!J7.el) return;
    if (r.resultat === 'but') el.querySelector('.j7-filet').animate([{transform: 'scale(1)'}, {transform: 'scale(1.04, 1.07)'}, {transform: 'scale(1)'}], {duration: 360 * vite});
    const [titre, cls] = RES7[r.resultat];
    el.classList.add('r-' + cls);
    vibrer(r.resultat === 'but' ? [30, 40, 60] : 40);
    const box = el.querySelector('.j7-resultat');
    box.innerHTML = `<b>${titre}</b>${r.pieces ? `<small>+${r.pieces} pièces</small>` : ''}${r.bonus ? `<small>5 sur 5 : +${r.bonus} pièces de bonus !</small>` : ''}`;
    box.hidden = false;
    const n = J7.tirs.length, buts = J7.tirs.filter(t => t === 'but').length;
    el.querySelector('.j7-score').textContent = `Tir ${n}/${J7.limite} · ${buts} but${buts > 1 ? 's' : ''}`;
    el.querySelector('.j7-bas').innerHTML = r.restants > 0 ? `<button class="btn gold large j7-suivant">Tir suivant</button>`
      : `<p class="j7-bilan">${buts} sur ${J7.limite} · +${nb(J7.gains)} pièces</p><button class="btn gold large j7-fin">Fermer</button>`;
    el.querySelector('.j7-suivant')?.addEventListener('click', e => { e.stopPropagation(); nouveauTir(); });
    el.querySelector('.j7-fin')?.addEventListener('click', e => { e.stopPropagation(); fermerJet7m(); });
  });
}

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
  if (demo !== null) demoBooster(demo);
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
