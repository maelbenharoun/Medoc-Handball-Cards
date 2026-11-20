// Pseudo d'un autre joueur = lien vers son équipe, partout où il s'affiche (demande de Maël, retour de Guit, 20 nov. 2026 : pas
// seulement depuis le classement) : fiche d'un(e) ami(e) (avec retour vers elle), membres d'un club, ligue, derniers matchs, transferts.
//   node tests/test_liens_equipe.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];

(async () => {
  const web = await servir(8797), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice'), bo = await sb.creerUtilisateur('bob@test.fr', 'motdepasse-bob');
  for (const [u, n] of [[al, 'Alice'], [bo, 'Bob']]) { await rpc(db, u.id, 'creer_profil', [n, true]); await rpc(db, u.id, 'ouvrir_depart'); }
  await q('update profils set pieces = 50000 where user_id in ($1, $2)', [al.id, bo.id]);
  await rpc(db, al.id, 'ajouter_ami', ['Bob']); await rpc(db, bo.id, 'ajouter_ami', ['Alice']);
  const club = await rpc(db, al.id, 'club_creer', ['Les Pins']);
  const idClub = club?.club?.id ?? club?.id ?? (await q('select id from clubs limit 1'))[0]?.id;
  await rpc(db, bo.id, 'club_rejoindre', [idClub]);
  await q("insert into rencontres (user_id, type, adversaire, score, resultat) values ($1, 'defi_ami', 'Bob', '{28,25}', 'gagne'), ($1, 'championnat', 'Lacanau', '{30,22}', 'gagne')", [al.id]);
  await rpc(db, al.id, 'mes_ligue'); await rpc(db, bo.id, 'mes_ligue');
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}}); await sb.brancher(ctx);
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  const ouvreEquipeDeBob = async () => { await p.waitForSelector('.sheet.eq-de .eqde-t', {timeout: 8000}).catch(() => {});
    return (await p.textContent('.sheet.eq-de').catch(() => '')).includes('Équipe de Bob'); };
  const fermer = async () => { await p.click('#overlay [data-act=fermer]').catch(() => {}); await p.waitForTimeout(250); };

  // 1. fiche de l'ami(e) → son équipe → retour vers la fiche
  await p.evaluate(() => chargerAmis().then(() => ficheAmi('Bob'))); await p.waitForSelector('.voir-eq');
  await p.click('.voir-eq');
  verif('fiche d’un(e) ami(e) : « Voir son équipe » ouvre l’équipe de Bob', await ouvreEquipeDeBob());
  verif('avec un retour « ‹ Bob »', (await p.textContent('.sheet.eq-de .retour').catch(() => '')).trim() === '‹ Bob');
  await p.click('.sheet.eq-de .retour'); await p.waitForSelector('.voir-eq');
  verif('le retour ramène sur la fiche de Bob', (await p.textContent('#overlay h3')).includes('Bob'));
  await fermer();
  // 2. membres du club : Bob a un lien, pas Alice (soi-même)
  await p.goto(web.url + '#clubs'); await p.waitForSelector('.av-m', {timeout: 8000}).catch(() => {});
  const liensClub = await p.$$eval('.av-m .lien-j', l => l.map(x => x.textContent));
  verif('club : le pseudo de Bob est un lien, pas le sien', liensClub.join() === 'Bob', liensClub);
  if (SP) await p.screenshot({path: SP + '/liens-club.png'});
  await p.click('.av-m .lien-j');
  verif('club : toucher Bob ouvre son équipe', await ouvreEquipeDeBob());
  verif('pas de retour vers un(e) ami(e) depuis le club', !(await p.$('.sheet.eq-de .retour')));
  await fermer();
  // 3. derniers matchs : le défi contre Bob a un lien, pas l'équipe du championnat
  await p.goto(web.url + '#championnat'); await p.waitForSelector('.hists', {timeout: 8000}).catch(() => {});
  const liensMatchs = await p.$$eval('.hists .lien-j', l => l.map(x => x.textContent));
  verif('derniers matchs : lien sur Bob (défi), pas sur une équipe de l’ordinateur', liensMatchs.join() === 'Bob', liensMatchs);
  // 4. ligue : les joueurs du groupe (s'ils y sont ensemble), jamais l'ordinateur
  await p.goto(web.url + '#ligue'); await p.waitForSelector('.lg-l', {timeout: 8000}).catch(() => {});
  const ligue = await p.evaluate(() => ({liens: [...document.querySelectorAll('.lg-l .lien-j')].map(x => x.textContent),
    bots: [...document.querySelectorAll('.lg-l')].filter(l => l.querySelector('.bot') && l.querySelector('.lien-j')).length}));
  verif('ligue : aucun lien sur l’ordinateur, Bob en lien s’il est dans le groupe', !ligue.bots && ligue.liens.every(x => x === 'Bob'), ligue);
  // 5. transferts : l'historique
  const [ca, cb] = (await q("select id from cartes where actif order by id limit 2")).map(x => x.id);
  await q("insert into transferts_faits (a, b, carte_a, carte_b, palier) values ($1, $2, $3, $4, 'bronze')", [bo.id, al.id, ca, cb]);
  await p.goto(web.url + '#marche'); await p.waitForSelector('.tr-hs', {timeout: 8000}).catch(() => {});
  verif('transferts : « Avec Bob » est un lien', (await p.$$eval('.tr-hs .lien-j', l => l.map(x => x.textContent))).join() === 'Bob');
  const larges = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  verif('rien ne déborde à 390 px', larges);
  // 6. le bandeau des onglets reste visible et utilisable par-dessus la fenêtre des ami(e)s (retour d'un joueur, 20 nov. 2026)
  await p.goto(web.url + '#social'); await p.waitForTimeout(300);
  await p.evaluate(() => chargerAmis().then(() => panneauAmis())); await p.waitForSelector('.amis-p .ami-l');
  const bandeau = await p.evaluate(() => { const t = document.querySelector('.tabs a[data-tab="club"]').getBoundingClientRect();
    const au = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
    const fer = document.querySelector('#overlay [data-act=fermer]').getBoundingClientRect();
    return {dessus: !!au?.closest('.tabs'), fermerVisible: fer.bottom <= document.querySelector('.tabs').getBoundingClientRect().top + 1}; });
  verif('fenêtre des ami(e)s : le bandeau des onglets est par-dessus, le bouton « Fermer » reste au-dessus de lui', bandeau.dessus && bandeau.fermerVisible, bandeau);
  await p.click('.tabs a[data-tab="club"]'); await p.waitForTimeout(400);
  const apres = await p.evaluate(() => ({hash: location.hash, ferme: $('#overlay').hidden, couches: COUCHES.length, h1: document.querySelector('#view h1')?.textContent}));
  verif('toucher « Club » ferme la fenêtre et ouvre le Club', apres.hash === '#club' && apres.ferme && apres.couches === 0 && /club/i.test(apres.h1 || ''), apres);
  await p.goBack(); await p.waitForTimeout(400);
  verif('le retour du téléphone revient à Social (pas à la fenêtre fermée)', (await p.evaluate(() => location.hash)) === '#social' && await p.evaluate(() => $('#overlay').hidden));
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
