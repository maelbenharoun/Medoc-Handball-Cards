// Boosters gratuits (demande de Maël, 26 nov. 2026) : « Ouvrir les N d'un coup », toucher la carte dévoilée l'envoie au club (ou à sa
// fiche quand une fusion est possible), et le choix d'un joueur au poste ne propose que sa meilleure carte. Navigateur à 390 px.
//   node tests/test_boosters_gratuits.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];

(async () => {
  const web = await servir(8799), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  await q(`update parametres set valeurs = valeurs || '{"staff_chance": 0, "legende_chance": 0}'`);   // seulement des joueurs : comptes exacts
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const nCartes = async () => +(await q('select count(*) n from exemplaires where proprietaire = $1', [al.id]))[0].n;
  const stock = async () => (await q('select boosters from profils where user_id = $1', [al.id]))[0].boosters;
  await q('update profils set boosters = 3, boosters_maj = now() where user_id = $1', [al.id]);

  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (er) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', x => erreurs.push(x.message));
  p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');

  // ── 1. tous les boosters gratuits d'un coup
  await p.waitForSelector('[data-act=boosters-tous]');
  verif('3 boosters gratuits en stock : « Ouvrir les 3 d’un coup »', /Ouvrir les 3/.test(await p.textContent('[data-act=boosters-tous]'))
    && !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  if (SP) { await p.evaluate(() => document.querySelector('.scene-b').scrollIntoView({block: 'center'})); await p.waitForTimeout(300); await p.screenshot({path: SP + '/gratuits-1.png'}); }
  const n0 = await nCartes();
  await p.click('[data-act=boosters-tous]');
  await p.waitForSelector('.ob-lot');
  verif('la scène des boosters par 10, avec 3 sachets', (await p.$$('.ob-lot .lot-p')).length === 3);
  await p.click('.ob-lot'); await p.waitForSelector('.ob-lot .ob-passer:not([hidden])', {timeout: 15000});
  await p.click('.ob-lot .ob-passer'); await p.waitForSelector('.ob-lot .ob-fin', {timeout: 15000});
  verif('3 cartes de plus au club, plus de booster gratuit en stock', await nCartes() === n0 + 3 && await stock() === 0, {cartes: await nCartes() - n0, stock: await stock()});
  await p.click('.ob-lot .ob-fin'); await p.waitForFunction(() => !document.querySelector('.ob'), null, {timeout: 5000});

  // ── 2. un seul booster : toucher la carte dévoilée l'envoie au club
  await q('update profils set boosters = 1, boosters_maj = now() where user_id = $1', [al.id]); await p.evaluate(async () => { await Compte.rafraichir(); route(true); });
  await p.waitForSelector('.btn-penche[data-booster=gratuit]:not([disabled])');
  verif('un seul booster : pas de bouton « d’un coup »', !(await p.$('[data-act=boosters-tous]')));
  await p.click('.btn-penche[data-booster=gratuit]'); await p.waitForSelector('.ob .ob-pack');
  await p.click('.ob .ob-pack', {force: true}); await p.waitForSelector('.ob .ob-passer:not([hidden])', {timeout: 15000});
  await p.click('.ob .ob-passer'); await p.waitForSelector('.ob .ob-fin', {timeout: 15000});
  verif('carte dévoilée : l’astuce « Touche la carte… » est affichée', /Touche la carte/.test(await p.textContent('.ob .ob-bas')));
  if (SP) { await p.waitForTimeout(900); await p.screenshot({path: SP + '/gratuits-2.png'}); }
  await p.waitForTimeout(300);
  await p.click('.ob .ob-c[data-i="0"]', {force: true});
  await p.waitForFunction(() => !document.querySelector('.ob'), null, {timeout: 5000});
  verif('toucher la carte dévoilée : elle part au club, sans le bouton du bas', await p.evaluate(() => !document.querySelector('.ob') && $('#overlay').hidden));

  // ── 3. fusion possible : toucher la carte ouvre sa fiche
  await q('update profils set boosters = 1, boosters_maj = now() where user_id = $1', [al.id]); await p.evaluate(async () => { await Compte.rafraichir(); route(true); });
  await p.waitForSelector('.btn-penche[data-booster=gratuit]:not([disabled])');
  await p.click('.btn-penche[data-booster=gratuit]'); await p.waitForSelector('.ob .ob-pack');
  const tire = await p.evaluate(() => ({id: OB.res[0].c.id, palier: OB.res[0].c.rarete, note: OB.res[0].c.ovr}));
  await q('insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, $3, $4), ($1, $2, $3, $4)', [al.id, tire.id, tire.palier, tire.note]);
  await p.evaluate(async () => { await Compte.rafraichir(); route(true); });
  await p.click('.ob .ob-pack', {force: true}); await p.waitForSelector('.ob .ob-passer:not([hidden])', {timeout: 15000});
  await p.click('.ob .ob-passer'); await p.waitForSelector('.ob .ob-fin', {timeout: 15000});
  verif('fusion possible : l’astuce dit « pour aller la fusionner »', /fusionner/.test(await p.textContent('.ob .ob-bas')), await p.textContent('.ob .ob-bas'));
  await p.waitForTimeout(300);
  await p.click('.ob .ob-c[data-i="0"]', {force: true});
  await p.waitForFunction(() => !document.querySelector('.ob') && !$('#overlay').hidden, null, {timeout: 5000});
  verif('toucher la carte : sa fiche s’ouvre, avec la fusion', await p.evaluate(id => FICHE.carte === id && !!document.querySelector('#overlay [data-fusion]'), tire.id), tire);
  if (SP) { await p.waitForTimeout(500); await p.screenshot({path: SP + '/gratuits-3-fiche.png'}); }
  await p.evaluate(() => fermerOverlay());

  // ── 4. le choix d'un joueur au poste : seulement sa meilleure carte
  const dc = (await q("select id from cartes where actif and not legende and 'DC' = any(postes) order by id limit 1"))[0].id;
  await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'bronze', 52), ($1, $2, 'argent', 66), ($1, $2, 'bronze', 55)", [al.id, dc]);
  await p.evaluate(async () => { await Compte.rafraichir(); route(true); });
  await p.goto(web.url + '#equipe'); await p.waitForSelector('.slot[data-slot=DC]');
  await p.click('.slot[data-slot=DC]'); await p.waitForSelector('[data-choix]');
  const choix = await p.evaluate(id => { const l = [...document.querySelectorAll('[data-choix]')].map(b => exParId(b.dataset.choix)).filter(Boolean);
    const lui = l.filter(e => e.carte === id); return {n: lui.length, note: lui[0]?.note, total: l.length, joueurs: new Set(l.map(e => e.carte)).size}; }, dc);
  verif(`poste DC : une seule carte par joueur (${choix.total} cartes, ${choix.joueurs} joueurs), la meilleure (Argent 66)`, choix.n === 1 && choix.note === 66 && choix.total === choix.joueurs, choix);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
