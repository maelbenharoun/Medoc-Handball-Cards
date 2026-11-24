// Chat du club et objectif du club dans les quêtes (demande de Maël, 24 nov. 2026) : les membres parlent entre eux, les demandes de
// cartes (à donner d'un toucher) et les dons s'affichent dans le même fil ; l'objectif de la semaine et ses paliers sont dans les quêtes.
// Serveur (droits, limites, modération), puis deux navigateurs (390 px).
//   node tests/test_chat_club.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8801), sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const U = {};
  for (const n of ['Alice', 'Bob', 'Chloe']) {
    U[n] = (await sb.creerUtilisateur(n.toLowerCase() + '@test.fr', 'motdepasse-' + n.toLowerCase())).id;
    await rpcJoueur(db, U[n], 'creer_profil', [n, true]); await rpcJoueur(db, U[n], 'ouvrir_depart');
  }
  // ── 1. serveur
  verif('hors d’un club : pas de chat', erreur(await rpcJoueur(db, U.Alice, 'club_chat', [0, null]), 'Rejoins un club'));
  const club = (await rpcJoueur(db, U.Alice, 'club_creer', ['Les Pins'])).club.id;
  await rpcJoueur(db, U.Bob, 'club_rejoindre', [club]);
  let r = await rpcJoueur(db, U.Alice, 'club_chat', [0, '  Salut   la team ! ']);
  verif('Alice écrit (espaces nettoyés)', r.messages?.at(-1)?.texte === 'Salut la team !' && r.messages.at(-1).moi, r.erreur || r.messages);
  verif('un message toutes les 3 secondes au plus', erreur(await rpcJoueur(db, U.Alice, 'club_chat', [0, 'encore']), 'Doucement'));
  verif('message vide ou trop long : refusé', erreur(await rpcJoueur(db, U.Bob, 'club_chat', [0, '   ']), 'vide') && erreur(await rpcJoueur(db, U.Bob, 'club_chat', [0, 'x'.repeat(301)]), 'trop long'));
  r = await rpcJoueur(db, U.Bob, 'club_chat', [0, null]);
  verif('Bob (membre) lit le message, sans pouvoir l’effacer', r.messages.some(m => m.pseudo === 'Alice' && !m.moi && !m.peutEffacer), r.messages);
  verif('Chloé (pas du club) ne lit rien', erreur(await rpcJoueur(db, U.Chloe, 'club_chat', [0, null]), 'Rejoins un club'));
  const lecture = await db.query("set role authenticated; select count(*) from club_messages").then(() => 'lue', er => er.message).finally(() => db.query('reset role'));
  verif('table du chat illisible pour le jeu', lecture !== 'lue', lecture);
  const id1 = r.messages[0].id;
  verif('Bob ne peut pas effacer le message d’Alice', erreur(await rpcJoueur(db, U.Bob, 'club_chat_supprimer', [id1]), 'président'));
  verif('Chloé ne peut rien effacer dans un autre club', erreur(await rpcJoueur(db, U.Chloe, 'club_chat_supprimer', [id1]), 'introuvable'));
  r = await rpcJoueur(db, U.Alice, 'club_chat_supprimer', [id1]);
  verif('Alice (présidente) efface : le message part pour tout le monde', !r.erreur && !r.messages.some(m => m.id === id1) && r.supprimes.includes(id1), r.erreur || r);
  // une demande de carte et un don, dans le fil
  const carte = (await q("select id from cartes where actif and not legende order by id limit 1"))[0].id;
  await rpcJoueur(db, U.Bob, 'club_demander', [carte, 'bronze']);
  for (let i = 0; i < 2; i++) await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'bronze', 52)", [U.Alice, carte]);
  r = await rpcJoueur(db, U.Alice, 'club_chat', [0, null]);
  verif('la demande de Bob est dans le fil d’Alice, qu’elle peut remplir', r.club?.demandes?.some(d => d.pseudo === 'Bob' && d.carte === carte && d.possible), r.club);
  // l'objectif du club dans l'état (quêtes)
  const e = await rpcJoueur(db, U.Alice, 'mon_etat');
  verif('l’état donne l’objectif du club et ses 3 paliers (fenêtre des quêtes)', e.club?.nom === 'Les Pins' && e.club.paliers?.length === 3 && e.club.victoires === 0, e.club);
  await q("update matchs_direct set etat = etat where false");
  await q("update salon_messages set le = le where false");
  await q("update club_messages set le = now() - interval '10 seconds'");

  // ── 2. deux navigateurs
  const b = await chromium.launch();
  const ouvrir = async n => {
    const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); localStorage.setItem('mhc-son', '{"musique":0,"effets":0}'); } catch (e) {} });
    const pg = await ctx.newPage(); pg.erreurs = []; pg.on('pageerror', x => pg.erreurs.push(x.message));
    await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
    await pg.fill('[name=email]', n.toLowerCase() + '@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-' + n.toLowerCase()); await pg.click('button[value=connexion]');
    await pg.waitForSelector('.niveau'); return pg;
  };
  const A = await ouvrir('Alice'), B = await ouvrir('Bob');
  await A.goto(web.url + '#clubs'); await A.waitForSelector('#cc-fil .cc-dem', {timeout: 10000});
  verif('page du club : le chat, avec la demande de Bob et un bouton « Donner »', !!(await A.$('#cc-fil .cc-dem [data-donner]:not([disabled])')));
  await B.goto(web.url + '#clubs'); await B.waitForSelector('form[data-form="chat-club"]');
  await B.fill('form[data-form="chat-club"] [name=texte]', 'Qui a une Bronze en trop ?'); await B.click('form[data-form="chat-club"] button');
  await B.waitForFunction(() => /Bronze en trop/.test(document.querySelector('#cc-fil').textContent), null, {timeout: 6000});
  verif('Bob envoie : le champ se vide, son message est dans le fil', await B.$eval('form[data-form="chat-club"] [name=texte]', x => x.value === ''));
  await A.fill('form[data-form="chat-club"] [name=texte]', 'Je tape');
  await A.waitForFunction(() => /Bronze en trop/.test(document.querySelector('#cc-fil').textContent), null, {timeout: 9000});
  verif('Alice voit le message de Bob arriver tout seul, sans perdre ce qu’elle écrivait', await A.$eval('form[data-form="chat-club"] [name=texte]', x => x.value === 'Je tape'));
  if (SP) await A.screenshot({path: SP + '/chat-club.png', fullPage: true});
  await A.fill('form[data-form="chat-club"] [name=texte]', '');
  await A.click('#cc-fil .cc-dem [data-donner]');
  await A.waitForFunction(() => /a donné|as donné/.test(document.querySelector('#cc-fil')?.textContent || ''), null, {timeout: 9000}).catch(() => {});
  verif('Alice donne depuis le chat : « Tu as donné … à Bob » dans le fil', /Tu as donné .* à Bob/.test(await A.textContent('#cc-fil')));
  await B.waitForFunction(() => /a donné .* à toi/.test(document.querySelector('#cc-fil').textContent), null, {timeout: 9000}).catch(() => {});
  verif('Bob voit le don : « Alice a donné … à toi »', /Alice a donné .* à toi/.test(await B.textContent('#cc-fil')));
  verif('pas de débordement à 390 px', await A.evaluate(() => document.documentElement.scrollWidth <= 390));
  // quêtes : l'objectif du club
  await q("insert into rencontres (user_id, type, adversaire, score, resultat) select $1, 'championnat', 'X', '{30,20}', 'gagne' from generate_series(1, 30)", [U.Bob]);
  await A.evaluate(() => Compte.rafraichir()); await A.waitForFunction(() => (S().club?.victoires || 0) >= 30, null, {timeout: 10000}); await A.evaluate(() => route(true));   // l'en-tête (pastille) se redessine avec la vue
  await A.click('#quetes-b'); await A.waitForSelector('.quetes-s');
  const qv = await A.evaluate(() => ({txt: document.querySelector('.quetes-s').textContent, bouton: !!document.querySelector('.quetes-s [data-club-palier]'),
    pastille: document.querySelector('#pastille-q')?.textContent}));
  verif('quêtes : l’objectif du club (30 victoires), le 1er palier à récupérer, compté dans la pastille', /Objectif du club/.test(qv.txt) && /30 victoires/.test(qv.txt) && qv.bouton && +qv.pastille >= 1, {bouton: qv.bouton, pastille: qv.pastille, club: /Objectif du club/.test(qv.txt), v: /30 victoires/.test(qv.txt)});
  if (SP) await A.screenshot({path: SP + '/quetes-club.png'});
  await A.click('.quetes-s [data-club-palier]'); await A.waitForTimeout(1200);
  verif('« Récupérer » : la fenêtre des quêtes se redessine, le palier est coché', await A.evaluate(() => !!document.querySelector('.quetes-s') && /✓/.test(document.querySelector('.quetes-s .cl-pal').textContent)));
  // hors d'un club : « Trouver un club » mène à la page des clubs
  const C = await ouvrir('Chloe'); await C.click('#quetes-b'); await C.waitForSelector('.quetes-s [data-act="vers-clubs"]');
  await C.click('[data-act="vers-clubs"]'); await C.waitForTimeout(800);
  verif('hors d’un club : « Trouver un club » ferme les quêtes et ouvre la page des clubs', await C.evaluate(() => location.hash === '#clubs' && document.querySelector('#overlay').hidden));
  for (const pg of [A, B, C]) verif('aucune erreur de page', !pg.erreurs.length, pg.erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
