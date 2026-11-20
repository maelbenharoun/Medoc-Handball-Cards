// « Supprimer mon compte » (page de confidentialité, 20 nov. 2026) : tout ce qui est à lui disparaît, et son pseudo ne reste pas
// dans l'historique des matchs des autres (remplacé par « Joueur supprimé »). Serveur (PGlite).
//   node tests/test_suppression.js
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await nouvelUtilisateur(db), bo = await nouvelUtilisateur(db);
  for (const [u, n] of [[al, 'Alice'], [bo, 'Bob']]) { await rpcJoueur(db, u, 'creer_profil', [n, true]); await rpcJoueur(db, u, 'ouvrir_depart'); }
  await rpcJoueur(db, al, 'ajouter_ami', ['Bob']); await rpcJoueur(db, bo, 'repondre_ami', ['Alice', true]);
  await rpcJoueur(db, al, 'envoyer_message', ['Bob', 'Salut !']);
  let r = await rpcJoueur(db, al, 'match_commencer', ['defi_ami', 'Bob', 'duels:06', 'normal', true]);
  r = await rpcJoueur(db, bo, 'match_commencer', ['defi_ami', 'Alice', 'duels:06', 'normal', true]);
  const chezBob = async () => (await q("select adversaire from rencontres where user_id = $1 and type in ('defi_ami', 'defense_ami') order by id", [bo])).map(x => x.adversaire);
  verif('avant : Alice apparaît dans l’historique de Bob (son défi, sa défense)', JSON.stringify(await chezBob()) === JSON.stringify(['Alice', 'Alice']), await chezBob());
  r = await rpcJoueur(db, al, 'supprimer_mon_compte');
  verif('suppression acceptée', !r?.erreur, r?.erreur);
  verif('chez Bob : « Joueur supprimé » à la place d’Alice', JSON.stringify(await chezBob()) === JSON.stringify(['Joueur supprimé', 'Joueur supprimé']), await chezBob());
  const reste = (await q(`select (select count(*) from profils where user_id = $1) profil, (select count(*) from exemplaires where proprietaire = $1) cartes,
    (select count(*) from rencontres where user_id = $1) matchs, (select count(*) from mouvements where user_id = $1) journal,
    (select count(*) from messages_amis where de = $1 or pour = $1) messages, (select count(*) from amis where de = $1 or pour = $1) amis,
    (select count(*) from rencontres where adversaire = 'Alice') pseudo_ailleurs`, [al]))[0];
  verif('plus rien à elle : profil, cartes, matchs, journal, messages, ami(e)s, pseudo', Object.values(reste).every(v => +v === 0), reste);
  verif('Bob, lui, garde son compte et ses cartes', +(await q('select count(*) n from exemplaires where proprietaire = $1', [bo]))[0].n > 0);
  process.exit(bilan() ? 1 : 0);
})();
