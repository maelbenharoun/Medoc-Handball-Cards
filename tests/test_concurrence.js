// Accès simultanés (audit du 12 nov. 2026) : plusieurs appels lancés au même instant ne doivent jamais créer une carte, des pièces
// ou une récompense en double. PGlite n'a qu'une connexion : il faut un vrai Postgres.
//   PGTEST_URL=postgres://utilisateur:motdepasse@127.0.0.1:5432/postgres node tests/test_concurrence.js
// (un rôle qui peut créer une base ; la base « mhc_concurrence » est recréée à chaque lancement). Sans PGTEST_URL, le test est sauté.
const {Client} = require('pg');
const {SOCLE, SCHEMA, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const URL_PG = process.env.PGTEST_URL;
if (!URL_PG) { console.log('PGTEST_URL absent : test des accès simultanés sauté (voir tests/LISEZMOI.md)'); process.exit(0); }
const BASE = 'mhc_concurrence', N = 12;
const url = base => { const u = new URL(URL_PG); u.pathname = '/' + base; return u.toString(); };
const ouvrir = async base => { const c = new Client({connectionString: url(base)}); await c.connect(); return c; };

(async () => {
  const adm = await ouvrir(new URL(URL_PG).pathname.slice(1) || 'postgres');
  await adm.query(`drop database if exists ${BASE} with (force)`); await adm.query(`create database ${BASE}`); await adm.end();
  const db = await ouvrir(BASE);
  // les rôles sont communs à tout le serveur Postgres : créés seulement s'ils manquent
  const roles = ['anon', 'authenticated'].map(r => `do $do$ begin create role ${r}; exception when duplicate_object then null; end $do$;`).join(' ');
  await db.query(SOCLE.replace('create role anon; create role authenticated;', () => roles));
  await db.query(SCHEMA());
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  let n = 0;
  const joueur = async pseudo => { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    await q('insert into auth.users values ($1, $2)', [id, `j${n}@test.fr`]);
    if (pseudo) await appel(db, id, 'creer_profil', [pseudo, true]);
    return id; };
  // un appel du jeu : dans sa transaction, avec le rôle et l'identité d'un joueur connecté
  async function appel(c, uid, fn, args = []) {
    try {
      await c.query('begin'); await c.query(`set local role authenticated`); await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const r = await c.query(`select ${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args);
      await c.query('commit'); return {ok: true, r: r.rows[0].r};
    } catch (e) { await c.query('rollback').catch(() => {}); return {ok: false, erreur: e.message}; }
  }
  // N connexions prêtes d'avance, puis tous les appels partent en même temps
  const pool = []; for (let i = 0; i < N; i++) pool.push(await ouvrir(BASE));
  const ensemble = appels => Promise.all(appels.map(([uid, fn, args], i) => appel(pool[i % N], uid, fn, args)));
  const fois = (k, x) => Array.from({length: k}, () => x);
  const reussis = rs => rs.filter(r => r.ok).length;

  const admin = await joueur();
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Admin', 0, 'admin')", [admin]);
  await appel(db, admin, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const cartes = (await q("select id from cartes where actif and equipe = 'SF1' order by id")).map(x => x.id);
  const donner = async (uid, carte, palier = 'bronze') => (await q('select creer_exemplaire($1, $2, $3, $4) id', [uid, carte, palier, 'test']))[0].id;
  const pieces = async uid => (await q('select pieces from profils where user_id = $1', [uid]))[0].pieces;
  const nb = async (uid, carte, palier) => (await q('select count(*)::int n from exemplaires where proprietaire = $1 and carte_id = $2 and palier = $3', [uid, carte, palier]))[0].n;

  // ── un seul joueur, le même appel N fois au même instant
  const a = await joueur('Alice');
  await q('update profils set pieces = 100000 where user_id = $1', [a]);
  for (let i = 0; i < 3; i++) await donner(a, cartes[0]);
  let av = await pieces(a), rs = await ensemble(fois(N, [a, 'fusionner', [cartes[0], 'bronze']]));
  verif(`${N} fusions en même temps avec 3 cartes : une seule réussit`, reussis(rs) === 1 && await nb(a, cartes[0], 'bronze') === 0 && await nb(a, cartes[0], 'argent') === 1
    && av - await pieces(a) === 200, {reussis: reussis(rs), bronze: await nb(a, cartes[0], 'bronze'), argent: await nb(a, cartes[0], 'argent'), cout: av - await pieces(a)});

  const aVendre = await donner(a, cartes[1], 'or');
  av = await pieces(a); rs = await ensemble(fois(N, [a, 'vendre', [aVendre]]));
  verif(`${N} ventes de la même carte : payée une fois`, reussis(rs) === 1 && await pieces(a) - av === 150, {reussis: reussis(rs), gain: await pieces(a) - av});

  await q('update profils set boosters = 2, boosters_maj = now() where user_id = $1', [a]);
  const avantCartes = (await q('select count(*)::int n from exemplaires where proprietaire = $1', [a]))[0].n, avantStaff = (await q('select count(*)::int n from staff_cartes where user_id = $1', [a]))[0].n;
  rs = await ensemble(fois(N, [a, 'ouvrir_booster', ['gratuit']]));
  const recues = (await q('select count(*)::int n from exemplaires where proprietaire = $1', [a]))[0].n - avantCartes + (await q('select count(*)::int n from staff_cartes where user_id = $1', [a]))[0].n - avantStaff;
  verif(`${N} boosters gratuits avec 2 en stock : 2 cartes, pas une de plus`, reussis(rs) === 2 && recues === 2 && (await q('select boosters from profils where user_id = $1', [a]))[0].boosters === 0,
    {reussis: reussis(rs), recues});

  await q('update profils set pieces = 350 where user_id = $1', [a]);
  rs = await ensemble(fois(N, [a, 'ouvrir_booster_hasard', []]));
  verif(`${N} boosters mystère avec de quoi en payer un : un seul`, reussis(rs) === 1 && await pieces(a) === 50, {reussis: reussis(rs), pieces: await pieces(a)});

  await appel(db, a, 'mon_etat');
  const quete = (await q('select q.quete, k.objectif, k.pieces from quetes q join quetes_catalogue() k on k.id = q.quete where q.user_id = $1 limit 1', [a]))[0];
  await q('update quetes set progres = $2 where user_id = $1 and quete = $3', [a, quete.objectif, quete.quete]);
  av = await pieces(a); rs = await ensemble(fois(N, [a, 'reclamer_quete', [quete.quete]]));
  verif(`${N} réclamations de la même quête : payée une fois`, reussis(rs) === 1 && await pieces(a) - av === quete.pieces, {reussis: reussis(rs), gain: await pieces(a) - av});

  await appel(db, a, 'club_creer', ['Club A']);
  await q("insert into rencontres (user_id, type, adversaire, score, resultat, detail) select $1, 'championnat', 'x', array[30, 20], 'gagne', '{}' from generate_series(1, 30)", [a]);
  av = (await q('select bonus from profils where user_id = $1', [a]))[0].bonus; rs = await ensemble(fois(N, [a, 'club_reclamer', [1]]));
  verif(`${N} réclamations de la récompense du club : reçue une fois`, reussis(rs) === 1 && (await q('select bonus from profils where user_id = $1', [a]))[0].bonus - av === 1, {reussis: reussis(rs)});

  // ── deux joueurs : la même carte prise des deux côtés au même instant
  const b = await joueur('Bob');
  await q('update profils set pieces = 100000 where user_id in ($1, $2)', [a, b]);
  let doubles = 0, transferts = 0, fusions = 0;
  for (let tour = 0; tour < 15; tour++) {
    const X = cartes[2], Y = cartes[3];
    await q('delete from exemplaires where carte_id in ($1, $2)', [X, Y]); await q('delete from listes_transfert');
    await donner(a, Y); for (let i = 0; i < 3; i++) await donner(b, X);
    await appel(db, a, 'maj_listes_transfert', [JSON.stringify([{carte: X, palier: 'bronze'}]), JSON.stringify([{carte: Y, palier: 'bronze'}])]);
    await appel(db, b, 'maj_listes_transfert', [JSON.stringify([{carte: Y, palier: 'bronze'}]), JSON.stringify([{carte: X, palier: 'bronze'}])]);
    // Alice prend une des 3 cartes X de Bob pendant que Bob fusionne ses 3 cartes X
    const [t, f] = await ensemble([[a, 'transferer', ['Bob', Y, X, 'bronze']], [b, 'fusionner', [X, 'bronze']]]);
    transferts += t.ok; fusions += f.ok;
    // en « équivalents Bronze » (1 Argent = 3 Bronze), il doit toujours y avoir exactement 3 cartes X et 1 carte Y dans le jeu
    const eq = (await q("select carte_id, sum(case palier when 'argent' then 3 else 1 end)::int n from exemplaires where carte_id in ($1, $2) group by 1", [X, Y]));
    const nX = eq.find(e => e.carte_id === X)?.n, nY = eq.find(e => e.carte_id === Y)?.n;
    if (nX !== 3 || nY !== 1 || (t.ok && f.ok)) doubles++;
  }
  verif(`transfert et fusion de la même carte au même instant (15 fois) : jamais les deux, aucune carte créée ni perdue`, doubles === 0, {doubles, transferts, fusions});

  await appel(db, a, 'ajouter_ami', ['Bob']); await appel(db, b, 'ajouter_ami', ['Alice']);
  doubles = 0; let ventes = 0, echanges = 0;
  for (let tour = 0; tour < 3; tour++) {   // 3 propositions d'échange par jour au plus
    await q('delete from echanges');
    const ca = await donner(a, cartes[4], 'or'), cb = await donner(b, cartes[5]);
    const p = await appel(db, a, 'proposer_echange', ['Bob', ca, cb]);
    const idx = (await q("select id from echanges where statut = 'ouvert'"))[0]?.id;
    const avA = await pieces(a);
    // Bob accepte la carte d'Alice pendant qu'Alice la vend
    const [e, v] = await ensemble([[b, 'repondre_echange', [idx, true]], [a, 'vendre', [ca]]]);
    echanges += e.ok; ventes += v.ok;
    const existe = (await q('select proprietaire from exemplaires where id = $1', [ca]))[0];
    if (!p.ok || (e.ok && v.ok) || (v.ok && existe) || (e.ok && existe?.proprietaire !== b) || (v.ok !== (await pieces(a) - avA === 150))) doubles++;
  }
  verif('échange accepté et vente de la même carte au même instant (3 fois) : jamais les deux', doubles === 0, {doubles, echanges, ventes});

  // ── plusieurs joueurs sur la même place
  await q(`update parametres set valeurs = valeurs || '{"club_membres_max": 3}'`);
  const club = (await q('select id from clubs'))[0].id, nouveaux = [];
  for (let i = 0; i < 8; i++) nouveaux.push(await joueur('Joueur' + i));
  rs = await ensemble(nouveaux.map(u => [u, 'club_rejoindre', [club]]));
  verif('8 joueurs rejoignent en même temps un club à 2 places libres : 3 membres, pas plus', reussis(rs) === 2 && (await q('select count(*)::int n from clubs_membres where club = $1', [club]))[0].n === 3,
    {reussis: reussis(rs)});

  for (const u of nouveaux) { await appel(db, u, 'ouvrir_depart'); }
  rs = await ensemble(nouveaux.map(u => [u, 'mes_ligue', []]));
  const groupes = await q('select g.id, jsonb_array_length(g.bots) bots, (select count(*)::int from ligue_membres m where m.groupe = g.id) humains from ligue_groupes g');
  verif('8 joueurs ouvrent la ligue en même temps : chaque groupe fait exactement 10 équipes', reussis(rs) === 8 && groupes.every(g => g.bots + g.humains === 10)
    && groupes.reduce((t, g) => t + g.humains, 0) === 8, groupes);

  // deux transferts croisés au même instant : Postgres peut en annuler un (interblocage), mais rien ne doit se dédoubler
  const c = await joueur('Chloe'), d = await joueur('David');
  const X = cartes[6], Y = cartes[7];
  await q('delete from exemplaires where proprietaire in ($1, $2)', [c, d]);
  await donner(c, X); await donner(c, X); await donner(d, Y); await donner(d, Y);
  await appel(db, c, 'maj_listes_transfert', [JSON.stringify([{carte: Y, palier: 'bronze'}]), JSON.stringify([{carte: X, palier: 'bronze'}])]);
  await appel(db, d, 'maj_listes_transfert', [JSON.stringify([{carte: X, palier: 'bronze'}]), JSON.stringify([{carte: Y, palier: 'bronze'}])]);
  rs = await ensemble([[c, 'transferer', ['David', X, Y, 'bronze']], [d, 'transferer', ['Chloe', Y, X, 'bronze']]]);
  const rep = await q('select proprietaire, carte_id, count(*)::int n from exemplaires where carte_id in ($1, $2) and proprietaire in ($3, $4) group by 1, 2', [X, Y, c, d]);
  verif('deux transferts croisés au même instant : un seul échange, 2 cartes X et 2 cartes Y au total', reussis(rs) === 1 && rep.reduce((t, r) => t + r.n, 0) === 4
    && rep.filter(r => r.carte_id === X).reduce((t, r) => t + r.n, 0) === 2 && (await q('select count(*)::int n from transferts_faits where a in ($1, $2)', [c, d]))[0].n === 1,
    {reussis: reussis(rs), erreurs: rs.filter(r => !r.ok).map(r => r.erreur), rep});

  // le schéma se relance sur un vrai Postgres qui contient déjà des joueurs, des cartes, des clubs, une ligue (comme en production)
  for (const u of nouveaux.slice(0, 2)) await appel(db, u, 'ligue_jouer', [(await q("select 'b:' || (x ->> 'id') id from ligue_groupes g, jsonb_array_elements(g.bots) x limit 1"))[0].id]);
  const avantRelance = (await q('select (select count(*) from exemplaires)::int ex, (select count(*) from rencontres)::int re, (select count(*) from profils)::int pr'))[0];
  const relance = await db.query(SCHEMA()).then(() => null, e => e.message);
  const apresRelance = (await q('select (select count(*) from exemplaires)::int ex, (select count(*) from rencontres)::int re, (select count(*) from profils)::int pr'))[0];
  verif('relance du schéma sur un vrai Postgres avec des données : aucune erreur, rien de perdu', relance === null && avantRelance.re > 0 && JSON.stringify(avantRelance) === JSON.stringify(apresRelance),
    {relance, avantRelance, apresRelance});

  for (const cx of pool) await cx.end();
  await db.end();
  process.exit(bilan() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
