// Remplaçants (demande de Maël, 19 nov. 2026) : un remplaçant à chaque poste dans l'onglet Équipe, protégé comme un titulaire,
// et des changements pendant les matchs (fatigue par joueur : sur le terrain elle monte, sur le banc elle redescend) ; en « Simuler »,
// l'adjoint fait les changements. Serveur seulement (PGlite).
//   node tests/test_remplacants.js
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));
const POSTES = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'];

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await nouvelUtilisateur(db), bo = await nouvelUtilisateur(db);
  for (const [u, n] of [[al, 'Alice'], [bo, 'Bob']]) { await rpcJoueur(db, u, 'creer_profil', [n, true]); await rpcJoueur(db, u, 'ouvrir_depart'); }
  await q('update profils set pieces = 100000, matchs = 10 where user_id in ($1, $2)', [al, bo]);
  const prof = async () => (await q('select equipe, remplacants, capitaine from profils where user_id = $1', [al]))[0];
  const eq0 = (await prof()).equipe;
  // un remplaçant par poste : des joueurs de ce poste (principal) que l'équipe n'a pas
  const pris = (await q('select carte_id from exemplaires where proprietaire = $1', [al])).map(x => x.carte_id);
  const remp = {}, cartes = {};
  for (const po of POSTES) {
    const c = (await q('select id from cartes where actif and not legende and poste = $1 and not (id = any($2)) order by id limit 1', [po, pris]))[0].id;
    pris.push(c); cartes[po] = c;
    remp[po] = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'argent', 70) returning id", [al, c]))[0].id;
  }
  let r = await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify(remp)]);
  verif('un remplaçant à chaque poste : enregistré', !r.erreur && Object.keys((await prof()).remplacants).length === 7 && r.etat?.remplacants?.GB === remp.GB, r.erreur);
  verif('un joueur de champ remplaçant au but : refusé', erreur(await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify({...remp, GB: remp.AG, AG: remp.GB})])));
  verif('un titulaire aussi remplaçant : refusé', erreur(await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify({...remp, DC: eq0.ARG})])));
  const autre = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, (select carte_id from exemplaires where id = $2), 'bronze', 50) returning id", [al, eq0.DC]))[0].id;
  verif('un autre exemplaire d’un titulaire sur le banc : refusé (déjà titulaire)', erreur(await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify({...remp, DC: autre})]), 'déjà titulaire'));
  verif('la carte d’un autre joueur sur le banc : refusée', erreur(await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify({...remp, PIV: (await q('select id from exemplaires where proprietaire = $1 limit 1', [bo]))[0].id})])));
  // protégés comme l'équipe
  verif('un remplaçant ne se vend pas', erreur(await rpcJoueur(db, al, 'vendre', [remp.AD]), 'titulaire ou remplaçant'));
  verif('ni ne se met dans la liste « à donner »', erreur(await rpcJoueur(db, al, 'maj_listes_transfert', ['[]', JSON.stringify([{carte: cartes.AD, palier: 'argent'}])]), 'pas de carte libre'));
  verif('ni n’est une carte libre pour un échange', (await q('select carte_libre($1, $2) l', [al, remp.AD]))[0].l === false);
  // l'échange titulaire ⇄ remplaçant à un poste (même appel)
  const eq1 = {...eq0, AD: remp.AD}, remp1 = {...remp, AD: eq0.AD};
  r = await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq1), JSON.stringify(remp1)]);
  verif('échanger le titulaire et le remplaçant d’un poste', !r.erreur && (await prof()).equipe.AD === remp.AD && (await prof()).remplacants.AD === eq0.AD, r.erreur);
  r = await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify(remp)]);
  // un remplaçant aligné comme titulaire (ancien appel) : il quitte le banc
  r = await rpcJoueur(db, al, 'aligner_equipe', [JSON.stringify({...eq0, ARG: remp.ARG})]);
  verif('aligné comme titulaire ailleurs : il quitte le banc', !r.erreur && !('ARG' in (await prof()).remplacants), r.erreur || (await prof()).remplacants);
  await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify(remp)]);
  // fusion d'un remplaçant : le nouvel exemplaire garde sa place sur le banc
  for (let i = 0; i < 2; i++) await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'argent', 60)", [al, cartes.PIV]);
  r = await rpcJoueur(db, al, 'fusionner', [cartes.PIV, 'argent']);
  const bancPiv = (await prof()).remplacants.PIV;
  verif('fusion qui prend le remplaçant : le nouvel exemplaire (Or) prend sa place sur le banc', !r.erreur && bancPiv === r.id
    && (await q('select palier from exemplaires where id = $1', [bancPiv]))[0]?.palier === 'or', r.erreur || bancPiv);
  remp.PIV = bancPiv;
  for (let i = 0; i < 3; i++) await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'or', 75)", [al, cartes.PIV]);
  await q('update exemplaires set note = 80 where id = $1', [bancPiv]);
  r = await rpcJoueur(db, al, 'fusionner', [cartes.PIV, 'or']);
  verif('fusion avec assez de copies libres : le remplaçant (le plus entraîné) reste', !r.erreur && (await prof()).remplacants.PIV === bancPiv, r.erreur || (await prof()).remplacants);
  // ── en match
  await q("update profils set staff = null, capitaine = null where user_id = $1", [al]);
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'pression', false]);
  const etat = async () => (await q('select etat from matchs_direct where user_id = $1', [al]))[0]?.etat;
  let e = await etat();
  verif('au coup d’envoi : le banc, les noms, les notes au poste, tout le monde frais', Object.keys(e.a.banc).length === 7 && e.a.bn.GB && e.a.nb.GB > 0
    && Object.keys(e.a.fp).length === 14 && Object.values(e.a.fp).every(v => +v === 0), e.a.banc);
  verif('la vue montre l’effectif : titulaire et remplaçant de chaque poste', POSTES.every(k => r.vue.nous.effectif?.[k]?.n && r.vue.nous.effectif[k].r), r.vue.nous.effectif);
  for (let k = 0; k < 3; k++) r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'pression', false]);
  e = await etat();
  const fT = e.a.fp[e.a.equipe.AG], fB = e.a.fp[e.a.banc.AG];
  verif('sans changement : les 7 sur le terrain ont la même fatigue, celle de l’équipe ; le banc reste frais', +fT > 0 && +fB === 0
    && POSTES.every(k => +e.a.fp[e.a.equipe[k]] === +fT) && Math.abs(+e.a.fatigue - +fT) < 1e-9, {fT, fB, f: e.a.fatigue});
  const avant = {att: e.a.att, nomAG: e.a.joueurs.AG, nomR: e.a.bn.AG};
  r = await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['AG', 'PIV']), null]);
  e = await etat();
  verif('changement : le remplaçant entre, le titulaire va sur le banc', !r.erreur && e.a.equipe.AG === remp.AG && e.a.banc.AG === eq0.AG && e.a.joueurs.AG === avant.nomR && e.a.bn.AG === avant.nomAG, r.erreur);
  verif('raconté au fil (« changement », entrant et sortant)', r.vue?.evenements?.some(x => x.ty === 'changement' && x.p === 'AG' && x.n === avant.nomR && x.o === avant.nomAG));
  verif('la force est recalculée (tireurs, attaque)', e.a.tireurs.some(x => x.n === avant.nomR) && !e.a.tireurs.some(x => x.n === avant.nomAG));
  const w = +e.a.fw, att = w * fT * 5 / 7 + (1 - w) * fT;   // moitié la moyenne des 7 sur le terrain, moitié la fatigue du groupe (match_banc_poids)
  verif('la fatigue de l’équipe baisse (2 joueurs frais sur 7, compté à moitié : match_banc_poids)', w === 0.5 && Math.abs(+e.a.fatigue - att) < 1e-3, {f: e.a.fatigue, attendu: att});
  r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'pression', false]);
  e = await etat();
  verif('la tranche suivante : le titulaire sorti récupère sur le banc, l’entrant se fatigue', +e.a.fp[eq0.AG] < +fT && +e.a.fp[remp.AG] > 0, {sorti: e.a.fp[eq0.AG], entre: e.a.fp[remp.AG]});
  r = await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['AG']), null]);
  verif('il peut revenir (changements libres)', !r.erreur && (await etat()).a.equipe.AG === eq0.AG, r.erreur);
  verif('poste inconnu : refusé', erreur(await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['XX']), null]), 'Poste inconnu'));
  verif('liste vide : refusée', erreur(await rpcJoueur(db, al, 'match_changer', ['[]', null])));
  // ── changement immédiat (demande de Maël, 20 nov. 2026) : au milieu d'une tranche déjà jouée, à la seconde que montre le récit
  r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'pression', false]);
  let e0 = await etat();
  const t0 = e0.servi_t, tFin = e0.t;
  // le récit a commencé la tranche il y a 4,8 s : même à la vitesse ×1, il est au moins à t0 + 120
  await q("update matchs_direct set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()) - 4.8)) where user_id = $1", [al]);
  e0 = await etat();
  r = await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['PIV']), t0 + 30]);
  e = await etat();
  const h = r.reprise;
  verif('demandé plus tôt que ce que le récit a pu montrer : ramené à ce qu’il a pu montrer (pas de tranche rejouée en connaissant la fin)', !r.erreur && h >= t0 + 120 && h < t0 + 135, r.erreur || h);
  const avantH = e0.ev.filter(x => x.t <= h), apres = e.ev.slice(avantH.length);
  verif('ce qui est déjà raconté ne change pas', JSON.stringify(e.ev.slice(0, avantH.length)) === JSON.stringify(avantH));
  verif('le changement est à la seconde demandée, la suite de la tranche est rejouée après', apres[0]?.ty === 'changement' && apres[0].t === h && apres.every(x => x.t >= h) && e.t === tFin && e.bloc === e0.bloc && e.a.equipe.PIV === e0.a.banc.PIV);
  verif('la vue ne renvoie que les nouveaux événements, avec « reprise »', r.vue.evenements.length === apres.length && r.vue.evenements[0].ty === 'changement');
  const recompte = c => { const o = c === 'a' ? 'b' : 'a', n = {tirs: 0, buts: 0, arrets: 0, pertes: 0, excl: 0, sept: 0};
    for (const x of e.ev) { if (x.c === c) { if (['but', 'arret', 'poteau', 'dehors', '7m-but', '7m-arret'].includes(x.ty)) n.tirs++; if (['but', '7m-but'].includes(x.ty)) n.buts++;
      if (x.ty === 'perte') n.pertes++; if (x.ty === 'excl') n.excl++; if (x.ty.startsWith('7m')) n.sept++; } if (x.c === o && ['arret', '7m-arret'].includes(x.ty)) n.arrets++; }
    return n; };
  const ok = c => Object.entries(recompte(c)).every(([k, v]) => e[c].stats[k] === v);
  const dernier = [...e.ev].reverse().find(x => x.s);
  verif('score et stats des deux équipes = ce que raconte le fil, du début du match', ok('a') && ok('b') && JSON.stringify(e.score) === JSON.stringify(dernier.s), {a: [recompte('a'), e.a.stats], b: [recompte('b'), e.b.stats]});
  await q("update matchs_direct set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()) - 8)) where user_id = $1", [al]);
  const e1 = await etat();
  r = await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['PIV']), t0 + 210]);
  e = await etat();
  verif('un 2e changement plus loin dans la même tranche : le 1er reste raconté, le pivot revient', !r.erreur && r.reprise >= t0 + 200 && e.ev.filter(x => x.ty === 'changement' && x.t === h).length === 1
    && JSON.stringify(e.ev.slice(0, e1.ev.filter(x => x.t <= r.reprise).length)) === JSON.stringify(e1.ev.filter(x => x.t <= r.reprise)) && e.a.equipe.PIV === e0.a.equipe.PIV, r.erreur);
  verif('le titulaire qui est sorti 80 secondes a récupéré un peu, celui qui est entré s’est fatigué', +e.a.fp[e0.a.banc.PIV] > 0, e.a.fp);
  // la carte du banc a disparu entre-temps (retirée du banc dans l'onglet Équipe, puis vendue)
  await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify({...remp, DC: undefined})]);
  r = await rpcJoueur(db, al, 'vendre', [remp.DC]);
  verif('remplaçant retiré du banc puis vendu pendant le match : vente permise', !r.erreur, r.erreur);
  verif('le faire entrer : refusé proprement', erreur(await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['DC']), null]), 'n’est plus dans ton club'));
  // l'adjoint (« Simuler la fin ») : il fait les changements, et la carte vendue ne le bloque pas
  r = await rpcJoueur(db, al, 'match_simuler_fin');
  verif('« Simuler la fin » avec une carte vendue sur le banc du match : le match se termine', !r.erreur && !!r.match, r.erreur);
  verif('l’adjoint a fait des changements (pression : fatigue forte)', (r.match?.evenements || []).some(x => x.ty === 'changement'), (r.match?.evenements || []).filter(x => x.ty === 'changement').length);
  // un match sans banc : comme avant
  await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), '{}']);
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  e = await etat();
  verif('sans remplaçant : pas de changement possible', erreur(await rpcJoueur(db, al, 'match_changer', [JSON.stringify(['AG']), null]), 'Pas de remplaçant'));
  r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'normal', false]); e = await etat();
  verif('sans remplaçant : fatigue de l’équipe = celle des 7', +e.a.fatigue > 0 && Object.values(e.a.fp).every(v => +v === +e.a.fatigue));
  // un match commencé avant cette version (sans fp ni banc) : il se joue toujours
  await q("update matchs_direct set etat = jsonb_set(etat, '{a}', (etat -> 'a') - 'fp' - 'banc' - 'equipe' - 'bn' - 'nb') where user_id = $1", [al]);
  r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'normal', false]);
  verif('ancien match en cours : il continue (fatigue d’équipe)', !r.erreur && +(await etat()).a.fatigue > 0, r.erreur);
  r = await rpcJoueur(db, al, 'match_simuler_fin');
  verif('et se termine', !r.erreur && !!r.match, r.erreur);
  process.exit(bilan() ? 1 : 0);
})();
