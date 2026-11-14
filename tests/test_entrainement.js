// S'entraîner aux mini-jeux (demande de Maël, 14 nov. 2026) : une série d'arrêt réflexe à l'entraînement ne coûte aucun essai et ne
// rapporte rien ; « Jouer pour de vrai » enchaîne sur les essais qui comptent, dans le même écran. Navigateur à 390 px, WebGL logiciel.
//   node tests/test_entrainement.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];

(async () => {
  const web = await servir(8788), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice'); await rpc(db, al.id, 'creer_profil', ['Alice', true]);
  // essais du jour de l'arrêt réflexe, tels que le serveur les garde (profils.minijeux, liste par jeu)
  const essais = async () => +(await q("select coalesce(jsonb_array_length(minijeux -> 'gardien'), 0) n from profils where user_id = $1", [al.id]))[0].n;
  const pieces = async () => (await q('select pieces from profils where user_id = $1', [al.id]))[0].pieces;
  const b = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const ctx = await b.newContext({viewport: {width: 390, height: 844}}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-tuto', '["7m","gardien","contre","suspension"]'); } catch (e) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  await p.goto(web.url + '#pieces'); await p.waitForSelector('[data-mini-entr]');
  verif('Gagner des pièces : « S’entraîner » sous les 4 tuiles', (await p.$$('[data-mini-entr]')).length === 4 && /seuls les essais « Jouer » comptent/.test(await p.textContent('#view')));
  verif('pas de débordement', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (SP) { await p.waitForTimeout(1200); await p.screenshot({path: SP + '/entr-1-tuiles.png', fullPage: true}); }
  const e0 = await essais(), p0 = await pieces();
  // une série d'arrêt réflexe à l'entraînement
  const serie = async () => {
    for (let i = 0; i < 8 && !(await p.$('.j7-bilan')); i++) {
      await p.waitForSelector('.t3-gl', {timeout: 30000});
      await p.waitForFunction(() => document.querySelector('.j7-aide')?.textContent.includes('Touche') || document.querySelector('.j7-bilan'), null, {timeout: 20000, polling: 'raf'});
      if (await p.$('.j7-bilan')) break;
      const zr = await p.$eval('.t3-zones', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      await p.mouse.click(zr[0] + zr[2] * (.17 + (i % 3) * .33), zr[1] + zr[3] * (.25 + (i % 2) * .5));
      await p.waitForSelector('.mj .j7-resultat:not([hidden])', {timeout: 25000});
      await p.waitForFunction(() => document.querySelector('.mj .j7-resultat').hidden || document.querySelector('.j7-bilan'), null, {timeout: 12000});
    }
    await p.waitForSelector('.j7-bilan', {timeout: 30000});
  };
  await p.click('[data-mini-entr=gardien]'); await p.waitForSelector('.mj');
  verif('pendant la partie : l’étiquette « Entraînement »', (await p.textContent('.j7-mode')).includes('Entraînement'));
  await serie();
  if (SP) await p.screenshot({path: SP + '/entr-2-fin.png'});
  verif('fin de série : « entraînement : pas de pièces », « Jouer pour de vrai » et « Encore une série »', /entraînement : pas de pièces/.test(await p.textContent('.j7-bilan'))
    && !!(await p.$('.mj-vrai')) && /Encore une série/.test(await p.textContent('.mj-suivant')));
  verif('l’entraînement n’a coûté aucun essai ni rapporté de pièces', await essais() === e0 && await pieces() === p0, {essais: [e0, await essais()], pieces: [p0, await pieces()]});
  // « Jouer pour de vrai » : même écran, les essais comptent
  await p.click('.mj-vrai');
  await p.waitForFunction(() => !document.querySelector('.j7-bilan'), null, {timeout: 10000});
  verif('« Jouer pour de vrai » : l’étiquette disparaît, même écran', !(await p.$('.j7-mode')) && !!(await p.$('.mj')) && await p.evaluate(() => MJ.demo === false));
  await serie();
  verif('la série pour de vrai compte (5 essais au serveur) et rapporte selon les arrêts', await essais() === e0 + 5 && /pièces/.test(await p.textContent('.j7-bilan')), {essais: await essais(), bilan: await p.textContent('.j7-bilan')});
  await p.click('.mj-fin'); await p.waitForSelector('.mj', {state: 'detached'});
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
