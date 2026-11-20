// Temps mort immédiat et blessures (demande de Maël, 20 nov. 2026) : le temps mort se prend à la seconde que montre le récit ;
// un joueur peut se blesser en match (il joue diminué jusqu'à son remplacement et ne peut plus revenir), avec une gravité :
// les plus graves le privent des matchs suivants (remplacé d'office au coup d'envoi, ou diminué sans remplaçant). Serveur (PGlite).
//   node tests/test_blessures.js
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));
const POSTES = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'];

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const regler = async o => q(`update parametres set valeurs = valeurs || $1::jsonb`, [JSON.stringify(o)]);
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await nouvelUtilisateur(db);
  await rpcJoueur(db, al, 'creer_profil', ['Alice', true]); await rpcJoueur(db, al, 'ouvrir_depart');
  await q('update profils set pieces = 100000, matchs = 10 where user_id = $1', [al]);
  const eq0 = (await q('select equipe from profils where user_id = $1', [al]))[0].equipe;
  const pris = (await q('select carte_id from exemplaires where proprietaire = $1', [al])).map(x => x.carte_id), remp = {};
  for (const po of POSTES) {
    const c = (await q('select id from cartes where actif and not legende and poste = $1 and not (id = any($2)) order by id limit 1', [po, pris]))[0].id; pris.push(c);
    remp[po] = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'argent', 70) returning id", [al, c]))[0].id;
  }
  await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify(remp)]);
  const etat = async () => (await q('select etat from matchs_direct where user_id = $1', [al]))[0]?.etat;
  const vieillir = async s => q("update matchs_direct set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()) - $2::numeric)) where user_id = $1", [al, s]);

  // ── 1. temps mort immédiat
  await regler({blessure_chance: 0});
  let r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'normal', false]);
  let e0 = await etat(); await vieillir(4);   // le récit en est au moins à 100'' (vitesse ×1)
  r = await rpcJoueur(db, al, 'match_temps_mort', [150]);
  let e = await etat();
  verif('temps mort à la seconde demandée (2\'30), au milieu de la tranche déjà jouée', !r.erreur && r.reprise === 150 && e.t === 150 && e.tm.restants === 2
    && e.ev.at(-1).ty === 'temps-mort' && e.ev.at(-1).t === 150 && r.adverse?.defense === e.b.defense, r.erreur || r.reprise);
  const gardes = e0.ev.filter(x => x.t <= 150);
  verif('ce qui était raconté avant reste, la suite prévue est oubliée', JSON.stringify(e.ev.slice(0, gardes.length)) === JSON.stringify(gardes) && e.ev.length === gardes.length + 1);
  verif('élan pendant 3 minutes à partir du temps mort', e.a.elan === 150 + 180);
  r = await rpcJoueur(db, al, 'match_bloc', ['rapide:33', 'pression', false]);
  e = await etat();
  verif('la reprise joue la fin de la tranche avec la tactique choisie pendant le temps mort', !r.erreur && e.t === 300 && e.bloc === 1 && e.a.attaque === 'rapide'
    && r.vue.evenements[0]?.ty === 'tactique' && r.vue.evenements[0].t === 150 && r.vue.evenements.every(x => x.t >= 150), r.erreur || r.vue?.evenements?.slice(0, 2));
  // un 2e temps mort à la seconde 0 de la tranche suivante (réclamée trop tôt) : ramené à ce que le récit a pu montrer
  r = await rpcJoueur(db, al, 'match_bloc', ['rapide:33', 'normal', false]); await vieillir(2);
  r = await rpcJoueur(db, al, 'match_temps_mort', [300]);
  verif('temps mort demandé trop tôt : ramené à ce que le récit a pu montrer', !r.erreur && r.reprise >= 350 && r.reprise <= 365, r.erreur || r.reprise);
  verif('3e temps mort dans la même période : refusé', erreur(await rpcJoueur(db, al, 'match_temps_mort', [null]), 'Déjà 2'));
  verif('ancien appel sans seconde (jeu pas encore à jour) : accepté', !(await rpcJoueur(db, al, 'match_temps_mort', [])).erreur?.includes('function'));
  await rpcJoueur(db, al, 'match_simuler_fin');

  // ── 2. blessures en match
  await regler({blessure_chance: 0.5, blessures_max: 1, blessure_gravites: [{nom: 'grave', p: 1, min: 2, max: 2}]});
  await q('update profils set matchs = 10 where user_id = $1', [al]);
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  r = await rpcJoueur(db, al, 'match_bloc', ['duels:06', 'normal', false]);
  e = await etat();
  const bl = e.ev.find(x => x.ty === 'blessure');
  verif('une blessure : racontée avec le poste, le joueur, la gravité et l’absence', !!bl && bl.c === 'a' && POSTES.includes(bl.p) && bl.g === 'grave' && bl.m === 2 && bl.r === true && bl.id === e.a.equipe[bl.p], bl);
  verif('le blessé est sur la liste, une seule blessure (blessures_max)', JSON.stringify(e.a.blesses) === JSON.stringify([bl.id]) && e.ev.filter(x => x.ty === 'blessure').length === 1);
  verif('la vue montre le blessé dans l’effectif', r.vue.nous.effectif[bl.p].bl === true);
  const f = (await q("select force_equipe($1::jsonb, 'duels:06') f", [JSON.stringify(e.a.equipe)]))[0].f;
  const m = bl.p === 'GB' ? {att: 0, def: 6} : {att: 2.5, def: 1.5};
  verif('il joue diminué : attaque et défense de l’équipe baissent', Math.abs((f.att - e.a.att) - m.att) < .6 && Math.abs((f.def - e.a.def) - m.def) < .6, {force: [f.att, f.def], match: [e.a.att, e.a.def], malus: m});
  // un changement plus tôt dans la tranche (avant la blessure) la fait disparaître ; après, elle reste
  await vieillir(0);
  r = await rpcJoueur(db, al, 'match_changer', [JSON.stringify([bl.p === 'AG' ? 'AD' : 'AG']), 300]);
  e = await etat();
  verif('changement au bout de la tranche : la blessure racontée reste', !r.erreur && JSON.stringify(e.a.blesses) === JSON.stringify([bl.id]));
  r = await rpcJoueur(db, al, 'match_changer', [JSON.stringify([bl.p]), null]);
  e = await etat();
  verif('le remplaçant entre : le malus disparaît avec le blessé', !r.erreur && e.a.equipe[bl.p] === remp[bl.p] && e.a.banc[bl.p] === bl.id);
  verif('le blessé ne peut pas revenir', erreur(await rpcJoueur(db, al, 'match_changer', [JSON.stringify([bl.p]), null]), 'Blessure'));
  r = await rpcJoueur(db, al, 'match_simuler_fin');
  let x = (await q('select blessure, blessure_g from exemplaires where id = $1', [bl.id]))[0];
  verif('fin du match : la blessure grave est notée sur la carte (2 matchs d’absence)', x.blessure === 2 && x.blessure_g === 'grave', x);
  verif('le jeu reçoit la blessure de la carte', !!r.etat.exemplaires.find(y => y.id === bl.id && y.blessure === 2 && y.blessureG === 'grave'));

  // ── 3. les matchs suivants : remplacé d'office, puis guéri
  await regler({blessure_chance: 0});
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  e = await etat();
  verif('match suivant : absent, son remplaçant commence (raconté à 0\')', e.a.equipe[bl.p] === remp[bl.p] && e.a.blesses.includes(bl.id)
    && r.vue.evenements.some(y => y.ty === 'absent' && y.p === bl.p && y.m === 2 && y.r === true) && r.vue.evenements.some(y => y.ty === 'changement' && y.t === 0 && y.p === bl.p));
  verif('il ne peut pas entrer en cours de match', erreur(await rpcJoueur(db, al, 'match_changer', [JSON.stringify([bl.p]), null]), 'Blessure'));
  await rpcJoueur(db, al, 'match_simuler_fin');
  x = (await q('select blessure from exemplaires where id = $1', [bl.id]))[0];
  verif('un match passé : encore 1', x.blessure === 1);
  // sans remplaçant : il joue diminué
  await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), '{}']);
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  e = await etat();
  const f2 = (await q("select force_equipe($1::jsonb, 'duels:06') f", [JSON.stringify(eq0)]))[0].f;
  verif('sans remplaçant : il joue, diminué', e.a.equipe[bl.p] === bl.id && (bl.p === 'GB' ? e.a.def < f2.def - .1 : e.a.att < f2.att - .1) && r.vue.evenements.some(y => y.ty === 'absent' && y.r === false));
  await rpcJoueur(db, al, 'match_simuler_fin');
  x = (await q('select blessure, blessure_g from exemplaires where id = $1', [bl.id]))[0];
  verif('deux matchs passés : guéri', x.blessure === 0 && x.blessure_g === null, x);
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  verif('guéri : plus d’absence au coup d’envoi', !r.vue.evenements.some(y => y.ty === 'absent'));
  await rpcJoueur(db, al, 'match_simuler_fin');

  // ── 4. fréquence réelle (réglages par défaut) : environ 1 blessure tous les 2 à 4 matchs, la plupart légères
  await regler({blessure_chance: 0.003, blessures_max: 2, blessure_gravites: [{nom: 'légère', p: 0.55, min: 0, max: 0}, {nom: 'moyenne', p: 0.3, min: 1, max: 1},
    {nom: 'sérieuse', p: 0.12, min: 2, max: 3}, {nom: 'grave', p: 0.03, min: 4, max: 6}]});
  await rpcJoueur(db, al, 'aligner_remplacants', [JSON.stringify(eq0), JSON.stringify(remp)]);
  let n = 0, nb = 0;
  for (let i = 0; i < 30; i++) {
    await q('update profils set matchs = 10 where user_id = $1', [al]); await q('update exemplaires set blessure = 0 where proprietaire = $1', [al]);
    r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', true]);
    n++; nb += (r.match?.evenements || []).filter(y => y.ty === 'blessure').length;
  }
  verif(`fréquence : ${nb} blessures en ${n} matchs simulés (attendu 1 tous les 2 à 4 matchs)`, nb >= 3 && nb <= 25, nb);
  process.exit(bilan() ? 1 : 0);
})();
