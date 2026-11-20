// Les 10 équipes de Légendes (demande de Maël, 20 nov. 2026 : Légende 1 = 99, Légende 2 = 100… Légende 10 = le 7 de rêve d'avant)
// et des niveaux Régional, National, International plus durs. Serveur (PGlite).
//   node tests/test_legendes_parcours.js
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const fs = require('fs');

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await nouvelUtilisateur(db);
  await rpcJoueur(db, al, 'creer_profil', ['Alice', true]); await rpcJoueur(db, al, 'ouvrir_depart');
  const P = (await q('select valeurs v from parametres'))[0].v;
  const L = P.legendes_equipes;
  verif('10 équipes de Légendes, de 99 à 108, 7 joueurs à leurs postes', L.length === 10 && L.every((x, i) => x.f === 99 + i && x.joueurs.length === 7
    && JSON.stringify(x.joueurs.map(j => j.poste)) === JSON.stringify(['GB', 'AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV'])));
  verif('Légende 10 = le 7 de rêve d’avant (mêmes joueurs)', JSON.stringify(L[9].joueurs.map(j => j.n)) === JSON.stringify(P.legendes.map(j => j.n)));
  const tous = L.flatMap(x => x.joueurs.map(j => j.n));
  verif('aucun joueur dans deux équipes', new Set(tous).size === 70);
  const pc = async () => (await q('select parcours from profils where user_id = $1', [al]))[0].parcours;
  const poser = async x => q('update profils set parcours = $2 where user_id = $1', [al, JSON.stringify(x)]);
  const pieces = async () => (await q('select pieces, bonus_or from profils where user_id = $1', [al]))[0];
  const fa = JSON.stringify({att: 99, def: 99, note: 99});
  const jouer = async res => (await q(`select championnat_conclure($1, 'duels:06', $2::jsonb, $2::jsonb, $3::jsonb, 1) r`,
    [al, fa, JSON.stringify(res === 'gagne' ? {a: 30, b: 20, resultat: 'gagne'} : {a: 20, b: 30, resultat: 'perdu'})]))[0].r;
  const serie = async () => { let r; for (let i = 0; i < 3; i++) r = await jouer('gagne'); return r; };

  // ── un joueur qui arrive aux Légendes
  await poser((await q("select parcours_nouveau(13, null, 'Alice') p"))[0].p);
  let v = (await q("select parcours_vue(parcours) v from profils where user_id = $1", [al]))[0].v;
  verif('arrivée : Légende 1 (99), ses joueurs', v.rang === 1 && v.force === 99 && v.nom === 'Légende 1' && v.joueurs.includes('Cléopâtre Darleux') && v.max === 0, v);
  const adv = (await q("select championnat_adversaire(parcours) a from profils where user_id = $1", [al]))[0].a;
  verif('l’adversaire : force 99, gardienne et tireurs de la Légende 1', adv.f === 99 && adv.equipe.joueurs.GB === 'Cléopâtre Darleux' && adv.equipe.tireurs.length === 6
    && !adv.equipe.tireurs.some(t => t.n === 'Cléopâtre Darleux'), adv);
  let p0 = await pieces();
  let r = await serie();
  let p1 = await pieces();
  verif('Légende 1 battue : la récompense entière, 2 boosters Or, titre, puis Légende 2', r.fin?.gagne && r.fin.premiere && r.fin.suivante === 2
    && p1.bonus_or - p0.bonus_or === P.parcours_legendes_bonus_or && (await pc()).legende === 2 && (await pc()).palmares.some(t => /Légende 1/.test(t.titre)), r.fin);
  v = (await q("select parcours_vue(parcours) v from profils where user_id = $1", [al]))[0].v;
  verif('Légende 2 : force 100', v.rang === 2 && v.force === 100 && v.max === 1);
  // perdre une série : on rejoue la même Légende
  for (let i = 0; i < 3; i++) r = await jouer('perdu');
  verif('série perdue : on reste à la Légende 2', r.fin?.gagne === false && r.fin.rang === 2 && (await pc()).legende === 2);
  // jusqu'à la 10e
  for (let k = 2; k <= 10; k++) r = await serie();
  verif('les 10 battues : « toutes les Légendes », on reste à la 10e', r.fin.premiere && !r.fin.suivante && (await pc()).legende === 10 && (await pc()).legendes_max === 10, r.fin);
  p0 = await pieces(); r = await serie(); p1 = await pieces();
  verif('la 10e rejouée : petite récompense, sans booster Or', !r.fin.premiere && r.fin.boosterOr === 0 && r.fin.pieces === P.parcours_legendes_rejouer_pieces && p1.bonus_or === p0.bonus_or, r.fin);

  // ── un joueur qui avait battu les anciennes Légendes (force 99) : il commence à la Légende 2
  await poser({niveau: 13, type: 'legendes', saison: 20, international: true, meilleur: 13, palmares: [], legendes_battues: 30, v: 1, d: 0});
  v = (await q("select parcours_vue(parcours) v from profils where user_id = $1", [al]))[0].v;
  verif('ancien vainqueur des Légendes (30 fois) : Légende 2, la 1 comptée comme battue', v.rang === 2 && v.max === 1 && v.v === 1, v);
  for (let i = 0; i < 2; i++) r = await jouer('gagne');   // il avait déjà 1 victoire dans la série
  verif('sa série continue et ouvre la Légende 3', r.fin?.gagne && r.fin.rang === 2 && r.fin.premiere && (await pc()).legende === 3);

  // ── niveaux plus durs
  const bases = P.parcours.map(x => x.base);
  verif('forces : Départemental inchangé, Régional, National et International relevés', JSON.stringify(bases) === JSON.stringify([50, 53, 56, 62, 67, 72, 77, 82, 87, 90, 93, 96, 99]), bases);
  // en production, la clé existe déjà avec les anciennes forces : la relance du schéma les met à jour, sauf une valeur réglée à la main
  const anciennes = P.parcours.map((x, i) => ({...x, base: [50, 53, 56, 60, 64, 68, 72, 76, 80, 84, 88, 91, 99][i]}));
  anciennes[5].base = 70;   // réglée à la main
  await q(`update parametres set valeurs = jsonb_set(valeurs, '{parcours}', $1::jsonb) - 'legendes_equipes'`, [JSON.stringify(anciennes)]);
  await db.exec(fs.readFileSync(__dirname + '/../supabase/schema.sql', 'utf8'));
  const P2 = (await q('select valeurs v from parametres'))[0].v;
  verif('relance du schéma sur les anciennes forces : relevées, la valeur réglée à la main gardée, les Légendes ajoutées',
    JSON.stringify(P2.parcours.map(x => x.base)) === JSON.stringify([50, 53, 56, 62, 67, 70, 77, 82, 87, 90, 93, 96, 99]) && P2.legendes_equipes?.length === 10, P2.parcours.map(x => x.base));
  // une nouvelle poule de Nationale 1 : adversaires autour de 87
  const np = (await q("select parcours_nouveau(9, null, 'Alice') p"))[0].p;
  const f = np.equipes.slice(1).map(e => e.f);
  verif('Nationale 1 : adversaires entre 83 et 91', Math.min(...f) >= 82.5 && Math.max(...f) <= 91.5, f);
  process.exit(bilan() ? 1 : 0);
})();
