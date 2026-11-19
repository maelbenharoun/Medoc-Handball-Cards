// Listes de transferts : une carte « à donner » fusionnée, vendue, échangée ou alignée sort de la liste ; une ligne morte ne bloque
// plus l'enregistrement des listes (bug signalé par un joueur le 19 nov. 2026 : après des fusions, plus moyen de changer ses listes).
//   node tests/test_listes_transfert.js
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await nouvelUtilisateur(db), bo = await nouvelUtilisateur(db);
  for (const [u, n] of [[al, 'Alice'], [bo, 'Bob']]) { await rpcJoueur(db, u, 'creer_profil', [n, true]); await rpcJoueur(db, u, 'ouvrir_depart'); }
  await q('update profils set pieces = 100000 where user_id in ($1, $2)', [al, bo]);
  const libres = (await q("select id from cartes where actif and poste is distinct from 'GB' and id not in (select carte_id from exemplaires) order by id limit 6")).map(x => x.id);
  const [X, Y, Z, W, V, U] = libres;
  const donner = async (u, c, pal, n = 1) => { for (let i = 0; i < n; i++) await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, $3, palier_min($3))", [u, c, pal]); };
  await donner(al, X, 'or', 3); await donner(al, Y, 'or', 3); await donner(al, Z, 'or'); await donner(al, W, 'bronze'); await donner(al, V, 'argent');
  const lignes = async () => (await q("select carte || ':' || palier k from listes_transfert where user_id = $1 and sens = 'donne' order by cree_le", [al])).map(x => x.k);
  const veux = [{carte: U, palier: 'or'}];
  let r = await rpcJoueur(db, al, 'maj_listes_transfert', [JSON.stringify(veux), JSON.stringify([{carte: X, palier: 'or'}, {carte: Y, palier: 'or'}, {carte: Z, palier: 'or'}, {carte: W, palier: 'bronze'}, {carte: V, palier: 'argent'}])]);
  verif('listes enregistrées : 5 cartes à donner', !r.erreur && (await lignes()).length === 5, r.erreur);
  // le cas du joueur : il fusionne deux joueurs qu'il avait mis à donner
  await rpcJoueur(db, al, 'fusionner', [X, 'or']); await rpcJoueur(db, al, 'fusionner', [Y, 'or']);
  verif('après les fusions, les deux joueurs fusionnés sortent de la liste « à donner »', JSON.stringify(await lignes()) === JSON.stringify([`${Z}:or`, `${W}:bronze`, `${V}:argent`]), await lignes());
  // les lignes mortes d'avant la correction : remises à la main, comme en production
  await q("insert into listes_transfert (user_id, sens, carte, palier) values ($1, 'donne', $2, 'or'), ($1, 'donne', $3, 'or')", [al, X, Y]);
  r = await rpcJoueur(db, al, 'maj_listes_transfert', [JSON.stringify(veux), JSON.stringify([{carte: X, palier: 'or'}, {carte: Y, palier: 'or'}, {carte: Z, palier: 'or'}, {carte: W, palier: 'bronze'}])]);
  verif('enregistrer ses listes avec deux lignes mortes : accepté, les lignes mortes sont retirées', !r.erreur && JSON.stringify(await lignes()) === JSON.stringify([`${Z}:or`, `${W}:bronze`]), r.erreur || await lignes());
  await q("insert into listes_transfert (user_id, sens, carte, palier) values ($1, 'donne', $2, 'or')", [al, X]);
  r = await rpcJoueur(db, al, 'mes_transferts');
  verif('ouvrir les Transferts fait le ménage des lignes mortes', !r.erreur && !(await lignes()).includes(`${X}:or`) && !r.donne.some(x => x.carte === X), r.erreur || await lignes());
  verif('ajouter un joueur qu’on n’a pas : toujours refusé', erreur(await rpcJoueur(db, al, 'maj_listes_transfert', [JSON.stringify(veux), JSON.stringify([{carte: U, palier: 'bronze'}])]), 'pas de carte libre'));
  verif('le refus ne touche pas aux listes', JSON.stringify(await lignes()) === JSON.stringify([`${Z}:or`, `${W}:bronze`]));
  // vendre, aligner dans l'équipe, échanger avec un(e) ami(e) : la ligne part aussi
  const exW = (await q('select id from exemplaires where proprietaire = $1 and carte_id = $2', [al, W]))[0].id;
  await rpcJoueur(db, al, 'vendre', [exW]);
  verif('après une vente : la ligne du joueur vendu part', !(await lignes()).includes(`${W}:bronze`), await lignes());
  const eq = (await q('select equipe from profils where user_id = $1', [al]))[0].equipe, exZ = (await q('select id from exemplaires where proprietaire = $1 and carte_id = $2', [al, Z]))[0].id;
  const zPoste = (await q('select poste from cartes where id = $1', [Z]))[0].poste;
  const slot = zPoste && zPoste !== 'GB' ? zPoste : 'AG';
  r = await rpcJoueur(db, al, 'aligner_equipe', [JSON.stringify({...eq, [slot]: exZ})]);
  verif('après l’avoir aligné dans l’équipe : la ligne part (il n’est plus libre)', !r.erreur && !(await lignes()).includes(`${Z}:or`), r.erreur || await lignes());
  await rpcJoueur(db, al, 'maj_listes_transfert', [JSON.stringify(veux), JSON.stringify([{carte: V, palier: 'argent'}])]);
  await q("insert into amis (de, pour, statut) values ($1, $2, 'accepte')", [al, bo]).catch(async () => {
    await rpcJoueur(db, al, 'demander_ami', ['Bob']); await rpcJoueur(db, bo, 'repondre_ami', ['Alice', true]); });
  await donner(bo, U, 'bronze');   // une carte libre pour Bob (ses 7 de départ sont dans son équipe)
  const exV = (await q('select id from exemplaires where proprietaire = $1 and carte_id = $2', [al, V]))[0].id;
  const exB = (await q('select id from exemplaires where proprietaire = $1 and id not in (select value::uuid from jsonb_each_text((select equipe from profils where user_id = $1))) limit 1', [bo]))[0].id;
  r = await rpcJoueur(db, al, 'proposer_echange', ['Bob', exV, exB]);
  const ech = (await q("select id from echanges where de = $1 and statut = 'ouvert'", [al]))[0]?.id;
  r = ech ? await rpcJoueur(db, bo, 'repondre_echange', [ech, true]) : r;
  verif('après un échange entre ami(e)s : la ligne du joueur donné part', !!ech && !r.erreur && !(await lignes()).includes(`${V}:argent`), r?.erreur || await lignes());
  process.exit(bilan() ? 1 : 0);
})();
