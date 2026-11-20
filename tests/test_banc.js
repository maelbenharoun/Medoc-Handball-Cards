// Remplaçants à l'écran (demande de Maël, 19 nov. 2026) : le banc sous le terrain de l'onglet Équipe (un remplaçant par poste),
// « Aligner automatiquement » remplit aussi le banc, puis un changement en plein match (bouton « Banc »). Navigateur à 390 px.
//   node tests/test_banc.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];

(async () => {
  const web = await servir(8791), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  await q('update profils set matchs = 5 where user_id = $1', [al.id]);
  // de quoi faire un banc : un joueur de plus par poste (son poste principal)
  const pris = (await q('select carte_id from exemplaires where proprietaire = $1', [al.id])).map(x => x.carte_id);
  for (const po of ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB']) {
    const c = (await q('select id from cartes where actif and not legende and poste = $1 and not (id = any($2)) order by id limit 1', [po, pris]))[0].id; pris.push(c);
    await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'bronze', 52)", [al.id, c]);
  }
  const prof = async () => (await q('select equipe, remplacants from profils where user_id = $1', [al.id]))[0];
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-vitesse', '4'); localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (er) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', x => erreurs.push(x.message)); p.on('dialog', d => d.accept());
  p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  await p.goto(web.url + '#equipe'); await p.waitForSelector('.banc');
  verif('onglet Équipe : 7 places de remplaçant sous le terrain, vides', (await p.$$('.banc-s')).length === 7 && (await p.$$('.banc-s.vide')).length === 7
    && /0\/7/.test(await p.textContent('.banc-t')));
  const geo = await p.evaluate(() => { const r = [...document.querySelectorAll('.banc-s')].map(x => x.getBoundingClientRect());
    return {ligne: r.every(z => Math.abs(z.top - r[0].top) < 2), dedans: r.every(z => z.left >= 0 && z.right <= innerWidth), deborde: document.documentElement.scrollWidth > innerWidth}; });
  verif('les 7 sur une ligne, sans déborder (390 px)', geo.ligne && geo.dedans && !geo.deborde, geo);
  // choisir un remplaçant au poste de pivot
  await p.click('.banc-s[data-banc=PIV]'); await p.waitForSelector('[data-banc-choix]');
  verif('fenêtre du remplaçant : seulement des joueurs qui ne sont pas titulaires', await p.evaluate(() => [...document.querySelectorAll('[data-banc-choix]')].every(b => !Object.values(S().equipe).includes(b.dataset.bancChoix))));
  await p.click('[data-banc-choix]'); await p.waitForFunction(() => S().remplacants?.PIV);
  await p.waitForSelector('.banc-s[data-banc=PIV]:not(.vide)');
  verif('remplaçant choisi : enregistré et affiché sur le banc', !!(await prof()).remplacants.PIV && !!(await p.$('.banc-s[data-banc=PIV] .vig')));
  // depuis le choix d'un titulaire : lien vers le remplaçant du poste
  await p.click('.slot[data-slot=PIV]'); await p.waitForSelector('.banc-lien');
  verif('choix du titulaire : « Remplaçant : … » au poste', /Remplaçant : /.test(await p.textContent('.banc-lien')) && !/aucun/.test(await p.textContent('.banc-lien')));
  await p.click('.banc-lien'); await p.waitForSelector('[data-banc-titulaire]');
  const avant = await prof();
  await p.click('[data-banc-titulaire]');
  await p.waitForFunction(id => S().equipe?.PIV === id, avant.remplacants.PIV);
  verif('« ⇄ Titulaire » : le remplaçant devient titulaire, le titulaire va sur le banc', (await prof()).equipe.PIV === avant.remplacants.PIV && (await prof()).remplacants.PIV === avant.equipe.PIV);
  // la carte du banc n'est plus vendable (Club)
  verif('un remplaçant n’a pas de bouton « Vendre »', await p.evaluate(() => typeof dansEquipe === 'function' && dansEquipe(S().remplacants.PIV)));
  // « Voir toutes les cartes staff » depuis la place staff (bug signalé le 20 nov. 2026 : on restait sur l'Équipe)
  await p.goto(web.url + '#equipe'); await p.waitForSelector('[data-act=staff-place]');
  await p.click('[data-act=staff-place]'); await p.waitForSelector('[data-act=staff-boutique]');
  await p.click('[data-act=staff-boutique]'); await p.waitForTimeout(600);
  verif('« Voir toutes les cartes staff » : la page Staff s’ouvre et y reste', (await p.evaluate(() => location.hash)) === '#staff' && /Staff/.test(await p.textContent('#view h1')) && await p.evaluate(() => $('#overlay').hidden));
  await p.goBack(); await p.waitForTimeout(500);
  verif('le retour du téléphone ramène à l’Équipe', (await p.evaluate(() => location.hash)) === '#equipe' && !!(await p.$('.pitch')));
  // aligner automatiquement : l'équipe et le banc
  await p.goto(web.url + '#equipe'); await p.waitForSelector('[data-act=auto]');
  await p.click('[data-act=auto]');
  await p.waitForFunction(() => Object.keys(S().remplacants || {}).length === 7, null, {timeout: 10000});
  const pr = await prof(), cT = (await q('select carte_id from exemplaires where id::text = any($1)', [Object.values(pr.equipe)])).map(x => x.carte_id);
  const cR = (await q('select carte_id from exemplaires where id::text = any($1)', [Object.values(pr.remplacants)])).map(x => x.carte_id);
  verif('« Aligner automatiquement » : 7 titulaires et 7 remplaçants, chaque joueur une fois', Object.keys(pr.equipe).length === 7 && Object.keys(pr.remplacants).length === 7
    && new Set([...cT, ...cR]).size === 14);
  await p.waitForSelector('.banc-s:not(.vide)');
  if (SP) { await p.evaluate(() => document.querySelector('.banc').scrollIntoView({block: 'center'})); await p.waitForTimeout(500); await p.screenshot({path: SP + '/banc-1-equipe.png'}); }
  // en match : le bouton « Banc », le panneau des changements
  await p.goto(web.url + '#championnat'); await p.waitForSelector('[data-act=championnat]');
  await p.click('[data-act=championnat]'); await p.waitForSelector('.md-panneau:not([hidden])');
  verif('coup d’envoi : « 🔁 Changements » dans le panneau', !!(await p.$('[data-md-go=banc]')));
  await p.click('[data-md-go=jouer]');
  const bas = await p.evaluate(() => { const l = [...document.querySelectorAll('.md-bas .btn')].filter(x => !x.hidden), r = document.querySelector('.md-bas').getBoundingClientRect();
    return {txt: l.map(x => x.firstChild.textContent.trim()), dedans: l.every(x => { const z = x.getBoundingClientRect(); return z.left >= r.left - 1 && z.right <= r.right + 1; }),
      haut: Math.max(...l.map(x => x.getBoundingClientRect().height)), deborde: document.documentElement.scrollWidth > innerWidth}; });
  verif('en bas : Tactique, Banc, Temps mort, vitesse, Simuler, sans déborder', bas.txt.join() === 'Tactique,Banc,Temps mort,×4,Simuler' && bas.dedans && !bas.deborde && bas.haut < 70, bas);
  if (SP) { await p.waitForTimeout(400); await p.screenshot({path: SP + '/banc-2-bas.png'}); }
  await p.waitForFunction(() => MD.h > 40 && MD.h < 150, null, {timeout: 15000});
  await p.click('.md-chg'); await p.waitForSelector('.md-bancp:not([hidden]) .md-banc');
  verif('panneau Changements : les 7 postes, titulaire ⇄ remplaçant, fraîcheur', (await p.$$('.md-bancp .md-bl')).length === 7 && (await p.$$('.md-bancp .md-fr')).length === 14);
  const h0 = await p.evaluate(() => MD.h); await p.waitForTimeout(400);
  verif('le temps ne s’arrête pas pendant le choix', (await p.evaluate(() => MD.h)) > h0);
  if (SP) await p.screenshot({path: SP + '/banc-3-changements.png'});
  const nomAG = (await prof()).remplacants.AG;
  const hClic = await p.evaluate(() => { const h = MD.h; document.querySelector('[data-md-chg=AG]').click(); return h; });
  await p.waitForFunction(() => !MD.chgEnCours, null, {timeout: 10000});
  let e = (await q('select etat from matchs_direct where user_id = $1', [al.id]))[0].etat;
  const chg = e.ev.filter(x => x.ty === 'changement');
  verif('un toucher : le remplaçant entre tout de suite, à la seconde affichée (pas à la fin de la tranche)', e.a.equipe.AG === nomAG && chg.length === 1 && chg[0].t < 300 && Math.abs(chg[0].t - hClic) < 40, {t: chg[0]?.t, hClic});
  await p.waitForFunction(() => /Entrée de/.test(document.querySelector('.md-fil').textContent), null, {timeout: 10000});
  verif('raconté au fil à la minute du changement (« Entrée de … »), avant la fin de la tranche', +(await p.textContent('.md-l.t-changement b')).replace("'", '') <= 5);
  await p.click('[data-md-chg=AD]');
  await p.waitForFunction(() => document.querySelectorAll('.md-l.t-changement').length === 2, null, {timeout: 10000});
  e = (await q('select etat from matchs_direct where user_id = $1', [al.id]))[0].etat;
  verif('un 2e changement, aussitôt fait', e.a.equipe.AD === pr.remplacants.AD);
  await p.click('[data-md-go=banc-fermer]');
  verif('Fermer : le match continue', await p.evaluate(() => document.querySelector('.md-bancp').hidden && !MD.panneau));
  // mi-temps : le panneau propose les changements, et on y revient après
  await p.waitForFunction(() => /Mi-temps/.test(document.querySelector('.md-panneau:not([hidden]) h3')?.textContent || ''), null, {timeout: 60000});
  await p.click('[data-md-go=banc]'); await p.waitForSelector('.md-bancp:not([hidden]) .md-banc');
  await p.click('[data-md-chg=AG]');
  await p.waitForFunction(() => document.querySelectorAll('.md-l.t-changement').length === 3, null, {timeout: 10000});
  await p.click('[data-md-go=banc-fermer]');
  verif('à la mi-temps : changement fait, le panneau de la mi-temps est toujours là', /Mi-temps/.test(await p.textContent('.md-panneau h3')) && (await q('select etat from matchs_direct where user_id = $1', [al.id]))[0].etat.a.equipe.AG === pr.equipe.AG);
  await p.click('[data-md-go=jouer]');
  await p.waitForFunction(() => MD.h > 1900, null, {timeout: 20000});
  await p.click('.md-sim'); await p.waitForSelector('.md-fin', {timeout: 20000});
  verif('simuler la fin : résultat', !!(await p.$('.md-fin')));
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
