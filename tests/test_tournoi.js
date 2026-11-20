// Tournois internationaux (demande de Maël, 20 nov. 2026 : « une phase de poule avant, le jeu se fait trop rapidement ») :
// une poule de 6 (5 matchs), les 2 premiers en quart de finale, puis élimination directe ; éliminé en poule = nouveau tirage.
// Les tournois tirés avant (sans phase) continuent en élimination directe. Serveur (PGlite).
//   node tests/test_tournoi.js
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await nouvelUtilisateur(db);
  await rpcJoueur(db, al, 'creer_profil', ['Alice', true]); await rpcJoueur(db, al, 'ouvrir_depart');
  const P = (await q('select valeurs v from parametres'))[0].v;
  const niv = P.parcours.findIndex(x => x.type === 'tournoi') + 1;   // Championnat d'Europe
  const pc = async () => (await q('select parcours from profils where user_id = $1', [al]))[0].parcours;
  const poser = async x => q('update profils set parcours = $2 where user_id = $1', [al, JSON.stringify(x)]);
  const fa = JSON.stringify({att: 80, def: 80, note: 80});
  const jouer = async res => (await q(`select championnat_conclure($1, 'duels:06', $2::jsonb, $2::jsonb, $3::jsonb, 1) r`,
    [al, fa, JSON.stringify(res === 'gagne' ? {a: 30, b: 20, resultat: 'gagne'} : {a: 20, b: 30, resultat: 'perdu'})]))[0].r;

  // ── un nouveau tournoi commence par sa poule
  await poser((await q("select parcours_nouveau($1, null, 'Alice') p", [niv]))[0].p);
  let x = await pc();
  verif('nouveau tournoi : phase de poule, 6 équipes, 5 matchs', x.type === 'tournoi' && x.phase === 'poule' && x.equipes.length === 6 && x.calendrier.length === 5
    && x.calendrier.every(j => j.some(m => m[0] === 0 || m[1] === 0)));
  verif('les adversaires de la poule sont des équipes de la compétition', x.equipes.slice(1).every(e => P.parcours[niv - 1].equipes.includes(e.nom)));
  let v = (await q('select parcours_vue($1::jsonb) v', [JSON.stringify(x)]))[0].v;
  verif('vue : comme une poule (classement, prochain adversaire), 2 qualifiés, pas de descente', v.phase === 'poule' && v.classement.length === 6 && !!v.prochain && v.montee === 2 && v.descente === 0 && v.journees === 5);
  const adv = (await q('select championnat_adversaire($1::jsonb) a', [JSON.stringify(x)]))[0].a;
  verif('l’adversaire du match est celui de la journée', adv.nom === v.prochain.nom);
  // ── 5 victoires : qualifié, tableau final tiré hors de la poule
  let r; const dePoule = x.equipes.slice(1).map(e => e.nom);
  for (let i = 0; i < 5; i++) r = await jouer('gagne');
  x = await pc();
  verif('5 victoires : 1er, qualifié pour les quarts', r.etape.phase === 'poule' && r.etape.qualifie === true && r.etape.rang === 1 && !r.fin, r.etape);
  verif('tableau final : 3 adversaires, aucun de la poule', x.phase === 'finale' && x.tour === 0 && x.adversaires.length === 3 && !x.equipes
    && x.adversaires.every(a => a.nom && !dePoule.includes(a.nom)) && new Set(x.adversaires.map(a => a.nom)).size === 3, {tableau: x.adversaires, poule: dePoule});
  v = (await q('select parcours_vue($1::jsonb) v', [JSON.stringify(x)]))[0].v;
  verif('vue : élimination directe', v.phase === 'finale' && v.adversaires.length === 3);
  for (let i = 0; i < 3; i++) r = await jouer('gagne');
  x = await pc();
  verif('quart, demie, finale gagnés : titre, niveau suivant… avec sa phase de poule', r.fin?.gagne === true && x.niveau === niv + 1 && x.phase === 'poule'
    && x.palmares.some(p => /Vainqueur/.test(p.titre)), r.fin);
  // ── éliminé en poule : nouveau tirage du même tournoi
  for (let i = 0; i < 5; i++) r = await jouer('perdu');
  x = await pc();
  verif('5 défaites : éliminé en phase de poule, nouveau tirage au même niveau', r.fin?.type === 'tournoi' && r.fin.gagne === false && r.fin.phase === 'poule'
    && r.fin.rang === 6 && x.niveau === niv + 1 && x.phase === 'poule' && x.journee === 0, r.fin);
  // ── un tournoi tiré avant (sans phase) continue en élimination directe
  await poser({niveau: niv, type: 'tournoi', saison: 3, international: true, meilleur: niv, palmares: [], legendes_battues: 0, tour: 1,
    adversaires: [{nom: 'Danemark', f: 82}, {nom: 'Suède', f: 84}, {nom: 'Norvège', f: 86}]});
  v = (await q("select parcours_vue(parcours) v from profils where user_id = $1", [al]))[0].v;
  verif('ancien tournoi : vu en élimination directe', v.phase === 'finale' && v.tour === 1);
  r = await jouer('gagne');
  x = await pc();
  verif('ancien tournoi : la demie gagnée mène à la finale', x.tour === 2 && !x.phase && r.etape.passe === true);
  r = await jouer('perdu');
  x = await pc();
  verif('ancien tournoi perdu en finale : nouveau tirage, avec la phase de poule', r.fin?.gagne === false && x.phase === 'poule' && x.niveau === niv);
  // ── un match en direct de la poule va jusqu'au bout
  await q('update profils set matchs = 5 where user_id = $1', [al]);
  r = await rpcJoueur(db, al, 'match_commencer', ['championnat', null, 'duels:06', 'normal', true]);
  verif('un match de poule simulé : la journée avance', !r.erreur && (await pc()).journee === 1 && r.etape?.phase === 'poule', r.erreur || r.etape);
  process.exit(bilan() ? 1 : 0);
})();
