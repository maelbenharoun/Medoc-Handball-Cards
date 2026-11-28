// Retours de Rémi et Guilhem (27 nov. 2026) : sur PC, les rangées de filtres du Club défilent à la souris (glisser, molette) sans changer
// de filtre ; musique et bruitages gardés avec le compte (un téléphone qui perd son stockage les retrouve).
//   node tests/test_souris_son.js
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();

(async () => {
  const web = await servir(8798), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');

  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 560, height: 900}}); await sb.brancher(ctx);   // une petite fenêtre de PC, à la souris
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (er) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', x => erreurs.push(x.message));
  p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
  const connexion = async () => {
    await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
    await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
    await p.waitForSelector('.niveau');
  };
  await connexion();

  // ── 1. filtres du Club à la souris
  await p.goto(web.url + '#club'); await p.waitForSelector('.filters [data-filtre]');
  const f = await p.$('.filters'), bx = await f.boundingBox();
  const avant = await p.evaluate(() => ({w: document.querySelector('.filters').scrollWidth - document.querySelector('.filters').clientWidth, on: document.querySelector('.filters .on')?.dataset.filtre}));
  verif('la rangée des équipes dépasse la largeur (sinon rien à faire défiler)', avant.w > 20, avant);
  await p.mouse.move(bx.x + bx.width - 30, bx.y + bx.height / 2); await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(bx.x + bx.width - 30 - i * 25, bx.y + bx.height / 2);
  await p.mouse.up(); await p.waitForTimeout(200);
  const apres = await p.evaluate(() => ({s: document.querySelector('.filters').scrollLeft, on: document.querySelector('.filters .on')?.dataset.filtre}));
  verif('glisser à la souris : la rangée défile, le filtre ne change pas', apres.s > 100 && apres.on === avant.on, {avant, apres});
  await p.evaluate(() => { document.querySelector('.filters').scrollLeft = 0; });
  await p.mouse.move(bx.x + 60, bx.y + bx.height / 2); await p.mouse.wheel(0, 200); await p.waitForTimeout(200);
  verif('molette : la rangée défile de côté', await p.evaluate(() => document.querySelector('.filters').scrollLeft) > 50);
  const btn = await p.$('.filters [data-filtre]:not(.on)'), nom = await btn.getAttribute('data-filtre');
  await btn.click(); await p.waitForTimeout(200);
  verif('un simple clic choisit toujours le filtre', await p.evaluate(n => document.querySelector('.filters .on')?.dataset.filtre === n, nom), nom);

  // ── 2. le son, gardé avec le compte
  await p.click('#moi'); await p.waitForSelector('[data-act=son-musique]');
  await p.click('[data-act=son-musique]'); await p.waitForTimeout(500);
  verif('musique coupée : enregistrée dans le compte', JSON.stringify((await q('select son from profils where user_id = $1', [al.id]))[0].son) === '{"effets":true,"musique":false}',
    (await q('select son from profils where user_id = $1', [al.id]))[0].son);
  await p.evaluate(() => localStorage.removeItem('mhc-son'));   // le téléphone a perdu son stockage
  await p.goto(web.url + '#accueil'); await p.reload(); await p.waitForSelector('#moi:not([hidden])');
  await p.waitForFunction(() => Son.reglages.musique === false, null, {timeout: 5000}).catch(() => {});
  verif('rechargé sans le stockage du téléphone : la musique reste coupée', await p.evaluate(() => Son.reglages.musique === false && Son.reglages.effets === true));
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
