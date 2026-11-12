// Audit des droits (12 nov. 2026) : le jeu ne peut appeler que les fonctions dont il se sert, et rien d'autre.
// À lancer après tout changement de la liste « grant execute » de schema.sql, de serveur.js ou d'admin.js :  node tests/test_droits.js
const fs = require('fs');
const {REPO, INTERNES, creerBase, en, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const sql = fs.readFileSync(REPO + '/supabase/schema.sql', 'utf8');
  const client = ['serveur.js', 'admin.js'].map(f => fs.readFileSync(`${REPO}/${f}`, 'utf8')).join('\n');

  // ── 1. la liste accordée = exactement ce que le jeu et l'outil appellent
  const bloc = /^grant execute on function\n([\s\S]*?)\nto authenticated;/m.exec(sql)[1];
  const accordees = new Set([...bloc.matchAll(/([a-z_0-9]+)\(/g)].map(m => m[1]));
  const appelees = new Set([...client.matchAll(/rpc\('([a-z_0-9]+)'/g)].map(m => m[1]));
  const inutiles = [...accordees].filter(f => !appelees.has(f)), manquantes = [...appelees].filter(f => !accordees.has(f));
  verif('aucune fonction accordée que le jeu n’appelle pas', !inutiles.length, inutiles);
  verif('aucune fonction appelée par le jeu sans être accordée', !manquantes.length, manquantes);
  verif('les 13 anciennes fonctions ne sont plus accordées', [...INTERNES].every(f => !accordees.has(f)), [...INTERNES].filter(f => accordees.has(f)));

  // ── 2. dans la base : mêmes droits, rien pour un visiteur, aucune table modifiable
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const fn = await q(`select p.proname nom, has_function_privilege('authenticated', p.oid, 'execute') joueur, has_function_privilege('anon', p.oid, 'execute') visiteur,
      p.prosecdef definer, coalesce(array_to_string(p.proconfig, ','), '') config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  const enBase = new Set(fn.filter(f => f.joueur).map(f => f.nom));
  verif(`la base accorde exactement ces ${accordees.size} fonctions aux joueurs`, enBase.size === accordees.size && [...accordees].every(f => enBase.has(f)),
    {enTrop: [...enBase].filter(f => !accordees.has(f)), enMoins: [...accordees].filter(f => !enBase.has(f))});
  verif('aucune fonction pour un visiteur non connecté', !fn.some(f => f.visiteur), fn.filter(f => f.visiteur).map(f => f.nom));
  verif('toute fonction à droits élevés fixe son search_path', fn.filter(f => f.definer).every(f => f.config.includes('search_path')), fn.filter(f => f.definer && !f.config.includes('search_path')).map(f => f.nom));
  const tables = await q(`select c.relname nom, c.relrowsecurity rls,
      has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete')
        or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') ecriture,
      has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select') lecture
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
  verif('aucune table modifiable par le jeu', !tables.some(t => t.ecriture), tables.filter(t => t.ecriture).map(t => t.nom));
  verif('toute table lisible par le jeu a ses règles de lecture (RLS)', tables.filter(t => t.lecture).every(t => t.rls), tables.filter(t => t.lecture && !t.rls).map(t => t.nom));

  // ── 3. chaque fonction accordée identifie le joueur (sauf le catalogue staff, public)
  const corps = nom => { const m = [...sql.matchAll(new RegExp(`^create or replace function ${nom}\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$;`, 'gm'))].pop(); return m ? m[2] : ''; };
  const anonymes = [...accordees].filter(f => !/\bmoi\(\)|auth\.uid\(\)|est_admin\(\)/.test(corps(f)) && !['catalogue_staff', 'match_championnat', 'defier_ami'].includes(f));
  verif('chaque fonction accordée identifie le joueur (moi(), auth.uid() ou est_admin())', !anonymes.length, anonymes);

  // ── 4. en vrai : un joueur ne peut plus appeler les anciennes fonctions
  const admin = await nouvelUtilisateur(db);
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Admin', 0, 'admin')", [admin]);
  await rpc(db, admin, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const [a, b, c] = [await nouvelUtilisateur(db), await nouvelUtilisateur(db), await nouvelUtilisateur(db)];
  for (const [u, p] of [[a, 'Alice'], [b, 'Bob'], [c, 'Chloe']]) { await rpc(db, u, 'creer_profil', [p, true]); await rpc(db, u, 'ouvrir_depart'); }
  await q('update profils set pieces = 50000');
  const essais = {ouvrir_booster_poste: ['AG'], seance_equipe: [], seance_payante: [], defier: ['Bob', 'duels:06'], adversaires: [], classement: [], match_championnat: ['duels:06'],
    defier_ami: ['Bob'], marche: ['tous'], publier_annonce: [null, 'x', 'or'], retirer_annonce: [null], accepter_annonce: [null], chercher_joueurs: ['bo']};
  const passees = [];
  for (const f of INTERNES) { const r = await rpcJoueur(db, a, f, essais[f]); if (!erreur(r, 'permission denied')) passees.push(f); }
  verif('un joueur qui appelle une ancienne fonction est refusé', !passees.length, passees);
  verif('un visiteur non connecté ne peut rien appeler', erreur(await rpcJoueur(db, null, 'mon_etat'), 'permission denied'));
  verif('une fonction interne (créer une carte) reste inaccessible', erreur(await en(db, a, "select creer_exemplaire($1, 'julie-valentin', 'ultime', 'triche')", [a]), 'permission denied'));
  verif('le jeu ne modifie pas ses pièces directement', erreur(await en(db, a, 'update profils set pieces = 999999')));

  // ── 5. récompenses de club : un palier 0 ou négatif relisait la liste depuis la fin (double encaissement)
  let r = await rpc(db, a, 'club_creer', ['Les Testeurs']);
  await q("insert into rencontres (user_id, type, adversaire, score, resultat, detail) select $1, 'championnat', 'x', array[30, 20], 'gagne', '{}' from generate_series(1, 120)", [a]);
  r = await rpc(db, a, 'club_reclamer', [3]);
  verif('palier 3 atteint : récompense reçue une fois', !r.erreur && r.recompense?.or === 1, r.erreur);
  for (const p of [0, -1, -2, 4, null]) {
    r = await rpc(db, a, 'club_reclamer', [p]);
    verif(`palier ${p} : refusé`, erreur(r, 'Palier inconnu'), r);
  }
  verif('palier 3 une seconde fois : refusé', erreur(await rpc(db, a, 'club_reclamer', [3]), 'déjà'));
  verif('une seule ligne de récompense pour ce palier', (await q('select palier from clubs_recompenses where user_id = $1', [a])).map(x => x.palier).join() === '3');

  // ── 6. légendes : ni montrées à un(e) ami(e), ni échangées
  await rpc(db, admin, 'admin_publier_cartes', [JSON.stringify([{id: 'legende-test', nom: 'Légende Test', equipe: 'SF1', poste: 'DC', postes: ['DC'], stats: {}, ecarts: {}, photos: {}, site: {cree: true}, legende: true}]), false]);
  const leg = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, 'legende-test', 'ultime', 100) returning id", [a]))[0].id;
  const libreA = (await q("select creer_exemplaire($1, 'julie-valentin', 'bronze', 't') id", [a]))[0].id, libreB = (await q("select creer_exemplaire($1, 'julie-valentin', 'bronze', 't') id", [b]))[0].id;
  await rpc(db, a, 'ajouter_ami', ['Bob']); await rpc(db, b, 'ajouter_ami', ['Alice']);
  r = await rpc(db, b, 'club_ami', ['Alice']);
  verif('le club d’un(e) ami(e) ne montre pas sa légende', Array.isArray(r) && r.some(x => x.id === libreA) && !r.some(x => x.id === leg || x.carte === 'legende-test'), r);
  verif('proposer sa légende à un(e) ami(e) : refusé', erreur(await rpc(db, a, 'proposer_echange', ['Bob', leg, libreB]), 'ne s’échange pas'));
  verif('demander la légende d’un(e) ami(e) : refusé', erreur(await rpc(db, b, 'proposer_echange', ['Alice', libreB, leg]), 'ne s’échange pas'));
  verif('un échange normal passe toujours', !(await rpc(db, a, 'proposer_echange', ['Bob', libreA, libreB])).erreur);

  // ── 7. suppression de compte : le club ne reste ni sans président(e), ni vide
  await rpc(db, b, 'club_rejoindre', [(await q('select id from clubs'))[0].id]);
  await rpcJoueur(db, a, 'supprimer_mon_compte');
  const membres = await q('select m.role, p.pseudo from clubs_membres m join profils p on p.user_id = m.user_id');
  verif('la présidente supprime son compte : le plus ancien membre devient président', membres.length === 1 && membres[0].pseudo === 'Bob' && membres[0].role === 'president', membres);
  await rpcJoueur(db, b, 'supprimer_mon_compte');
  verif('le dernier membre supprime son compte : le club disparaît', (await q('select count(*)::int n from clubs'))[0].n === 0);
  verif('quitter un club normalement marche toujours', !(await rpc(db, c, 'club_creer', ['Autre club'])).erreur && !(await rpc(db, c, 'club_quitter')).erreur
    && (await q('select count(*)::int n from clubs'))[0].n === 0 && erreur(await rpc(db, c, 'club_quitter'), 'aucun club'));

  process.exit(bilan() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
