// Boosters par 10 : la règle du serveur (ouvrir_boosters_lot) puis la scène dans le navigateur, à 390 et 320 px.
//   node tests/test_boosters_lot.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8795), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const un = async (sql, p = []) => (await q(sql, p))[0];
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const profil = () => un('select pieces, boosters_ouverts from profils where user_id = $1', [al.id]);
  const cartes = async () => +(await un('select count(*) n from exemplaires where proprietaire = $1', [al.id])).n;
  const staffs = async () => +(await un('select count(*) n from staff_cartes where user_id = $1', [al.id])).n;
  const reglage = v => q('update parametres set valeurs = valeurs || $1::jsonb', [JSON.stringify(v)]);

  // ── 1. le serveur
  await q('update profils set pieces = 4999 where user_id = $1', [al.id]);
  let avant = await profil(), nb = await cartes();
  let r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['SF1']);
  verif('pas assez de pièces : refusé, rien ne change', erreur(r, '5000 pièces') && (await profil()).pieces === 4999 && await cartes() === nb, r);
  await q('update profils set pieces = 20000 where user_id = $1', [al.id]);
  avant = await profil(); nb = await cartes();
  r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['SF1']);
  let nv = await q("select c.equipe, e.origine from exemplaires e join cartes c on c.id = e.carte_id where e.id = any($1::uuid[])", [r.ids || []]);
  let apres = await profil();
  verif('10 boosters SF1 : 10 cartes, toutes de l’équipe', r.ids?.length === 10 && nv.length === 10 && nv.every(x => x.equipe === 'SF1') && await cartes() === nb + 10, r.erreur || nv);
  verif('10 boosters SF1 : 5 000 pièces, 10 boosters ouverts de plus', avant.pieces - apres.pieces === 5000 && apres.boosters_ouverts - avant.boosters_ouverts === 10, {avant, apres});
  verif('10 boosters SF1 : jamais de carte staff', (r.staffs || []).length === 0);
  const quete = await un("select progres from quetes where user_id = $1 and quete = 'booster' and jour = aujourdhui()", [al.id]);
  verif('la quête des boosters avance de 10 (si elle est tirée aujourd’hui)', !quete || quete.progres >= 10, quete);
  verif('équipe inconnue ou absente : refusé', erreur(await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['XYZ']), 'Équipe inconnue')
    && erreur(await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', [null]), 'Équipe inconnue'));
  verif('visiteur non connecté : refusé', erreur(await rpcJoueur(db, null, 'ouvrir_boosters_lot', ['SF1'])));
  // mystère : joueurs de toutes les équipes, staff selon staff_chance, jamais de légende
  await q("update cartes set legende = true, actif = false where id = (select id from cartes where equipe = 'SG2' order by id limit 1)");
  await reglage({staff_chance: 0});
  avant = await profil(); nb = await cartes(); let ns = await staffs();
  r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['?']);
  apres = await profil();
  verif('10 boosters mystère sans staff : 10 joueurs, 3 000 pièces', r.ids?.length === 10 && !r.staffs.length && avant.pieces - apres.pieces === 3000 && await cartes() === nb + 10, r.erreur || r.staffs);
  await reglage({staff_chance: 1});
  nb = await cartes(); ns = await staffs();
  r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['?']);
  verif('staff à coup sûr : 10 cartes staff avec leur palier, aucun joueur', r.ids?.length === 0 && r.staffs?.length === 10 && r.staffs.every(x => x.id && x.palier)
    && await staffs() === ns + 10 && await cartes() === nb, r.erreur || r.staffs);
  verif('la première carte staff est placée dans l’équipe', !!(await un('select staff from profils where user_id = $1', [al.id])).staff);
  await reglage({staff_chance: 0.1});
  await q('update profils set pieces = 200000 where user_id = $1', [al.id]);
  let legendes = 0, equipes = new Set();
  for (let k = 0; k < 15; k++) { r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['?']);
    for (const x of await q('select c.legende, c.equipe from exemplaires e join cartes c on c.id = e.carte_id where e.id = any($1::uuid[])', [r.ids])) { legendes += x.legende ? 1 : 0; equipes.add(x.equipe); } }
  verif('150 boosters mystère : jamais de légende, des joueurs de plusieurs équipes', legendes === 0 && equipes.size >= 3, {legendes, equipes: [...equipes]});
  // le nombre vient du réglage, borné
  await reglage({booster_lot: 4});
  avant = await profil(); r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['SF2']); apres = await profil();
  verif('réglage booster_lot = 4 : 4 cartes pour 4 fois le prix', r.ids?.length === 4 && avant.pieces - apres.pieces === 2000, r.erreur || r.ids?.length);
  await reglage({booster_lot: 500});
  r = await rpcJoueur(db, al.id, 'ouvrir_boosters_lot', ['SF2']);
  verif('réglage démesuré : 20 boosters au plus', r.ids?.length === 20, r.erreur || r.ids?.length);
  await reglage({booster_lot: 10});

  // ── 2. le jeu
  await q('delete from exemplaires where proprietaire = $1 and id not in (select id from exemplaires where proprietaire = $1 order by obtenu_le limit 7)', [al.id]).catch(() => {});
  const b = await chromium.launch();
  for (const [W, H] of [[390, 844], [320, 640]]) {
    await q('update profils set pieces = 5200 where user_id = $1', [al.id]);
    const ctx = await b.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 1}); await sb.brancher(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (e) {} });
    const p = await ctx.newPage(); const erreurs = []; let accepter = false;
    p.on('pageerror', e => erreurs.push(e.message)); p.on('dialog', d => accepter ? d.accept() : d.dismiss());
    p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
    await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
    await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
    await p.waitForSelector('.btn-lot');
    const L = `${W} px : `;
    verif(L + 'bouton « ×10 · 10 boosters · 5 000 pièces » sous Acheter', /×10\s*10 boosters · 5.000 pièces/.test((await p.textContent('.btn-lot')).trim()) && await p.isEnabled('.btn-lot'), await p.textContent('.btn-lot'));
    verif(L + 'le bouton tient dans son bloc', await p.evaluate(() => { const r = document.querySelector('.btn-lot').getBoundingClientRect(), s = document.querySelector('.btn-lot').closest('.scene-b').getBoundingClientRect();
      return r.left >= s.left && r.right <= s.right && document.documentElement.scrollWidth <= innerWidth; }));
    await p.click('.car-points i[data-car="4"]', {force: true}); await p.waitForTimeout(700);
    verif(L + 'booster mystère : 10 boosters · 3 000 pièces', /10 boosters · 3.000 pièces/.test(await p.textContent('.btn-lot')), await p.textContent('.btn-lot'));
    await p.click('.car-points i[data-car="0"]', {force: true}); await p.waitForTimeout(700);
    // on refuse la confirmation : rien n'est acheté
    await p.click('.btn-lot'); await p.waitForTimeout(400);
    verif(L + 'confirmation refusée : rien n’est acheté', !(await p.$('.ob-lot')) && (await profil()).pieces === 5200);
    accepter = true;
    await p.click('.btn-lot'); await p.waitForSelector('.ob-lot');
    verif(L + '10 sachets en éventail, tous dans l’écran', await p.evaluate(() => { const l = [...document.querySelectorAll('.lot-p')];
      return l.length === 10 && l.every(x => { const r = x.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight; }); }));
    verif(L + 'les pièces sont déjà payées (5 000)', (await profil()).pieces === 200);
    if (SP) { await p.waitForTimeout(500); await p.screenshot({path: `${SP}/lot-${W}-1-eventail.png`}); }
    await p.mouse.click(W / 2, H / 2);
    await p.waitForSelector('.ob-c.attente', {timeout: 8000}); await p.waitForTimeout(700);
    const geo = await p.evaluate(() => { const l = [...document.querySelectorAll('.ob-c')].map(x => x.getBoundingClientRect());
      return {n: l.length, dedans: l.every(r => r.left >= 0 && r.right <= innerWidth && r.top >= 40 && r.bottom <= innerHeight - 40), w: Math.round(l[0].width),
        chevauche: l.some((a, i) => l.some((b, j) => j > i && a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2)),
        vus: document.querySelectorAll('.ob-c.vu').length, sachets: document.querySelectorAll('.lot-p').length}; });
    verif(L + `10 cartes de dos (${geo.w} px de large), dans l’écran, sans se chevaucher, sachets partis`, geo.n === 10 && geo.dedans && !geo.chevauche && geo.vus === 0 && geo.sachets === 0 && geo.w >= 60, geo);
    if (SP) await p.screenshot({path: `${SP}/lot-${W}-2-dos.png`});
    // on retourne deux cartes en les touchant
    await p.click('.ob-c[data-i="3"]', {force: true}); await p.waitForTimeout(300);
    await p.click('.ob-c[data-i="7"]', {force: true}); await p.waitForTimeout(900);
    verif(L + 'toucher une carte la retourne (2 / 10), les autres restent de dos', await p.evaluate(() => [...document.querySelectorAll('.ob-c.vu')].map(x => x.dataset.i).join() === '3,7')
      && (await p.textContent('.lot-compte')).trim() === '2 / 10' && !(await p.$('.ob-fin')));
    // une carte retournée se voit en grand, un toucher la renvoie
    const petit = (await (await p.$('.ob-c[data-i="3"]')).boundingBox()).width;
    await p.click('.ob-c[data-i="3"]', {force: true}); await p.waitForTimeout(600);
    const grand = await (await p.$('.ob-c[data-i="3"]')).boundingBox();
    verif(L + 'toucher une carte retournée : elle vient en grand au centre', grand.width > petit * 1.8 && Math.abs(grand.x + grand.width / 2 - W / 2) < 3 && grand.x >= 0 && grand.x + grand.width <= W, {petit, grand});
    if (SP) await p.screenshot({path: `${SP}/lot-${W}-3-grand.png`});
    await p.mouse.click(10, H * .2); await p.waitForTimeout(500);
    verif(L + 'un toucher la renvoie à sa place, sans retourner d’autre carte', Math.abs((await (await p.$('.ob-c[data-i="3"]')).boundingBox()).width - petit) < 1
      && (await p.$$('.ob-c.vu')).length === 2);
    // « Tout retourner »
    await p.click('.ob-passer'); await p.waitForSelector('.ob-fin'); await p.waitForTimeout(1300);
    verif(L + '« Tout retourner » : 10 cartes vues, bilan et « Envoyer au club »', (await p.$$('.ob-c.vu')).length === 10 && /nouveau|Rien de nouveau/.test(await p.textContent('.ob-info'))
      && (await p.textContent('.ob-fin')).trim() === 'Envoyer au club', await p.textContent('.ob-bas'));
    verif(L + 'le bas (bilan, bouton) ne recouvre aucune carte', await p.evaluate(() => { const b = document.querySelector('.ob-bas').getBoundingClientRect();
      return [...document.querySelectorAll('.ob-c')].every(x => x.getBoundingClientRect().bottom <= b.top + 1); }));
    if (SP) await p.screenshot({path: `${SP}/lot-${W}-4-fin.png`});
    await p.click('.ob-fin'); await p.waitForSelector('.ob-lot', {state: 'detached'});
    verif(L + 'retour au jeu, pièces à jour (200), bouton ×10 coupé', (await p.textContent('#coinv')).replace(/\D/g, '') === '200' && await p.isDisabled('.btn-lot'));
    // bouton retour du téléphone : 1er retour = tout se retourne, 2e = au club
    await q('update profils set pieces = 5200 where user_id = $1', [al.id]);
    await p.reload(); await p.waitForSelector('.btn-lot:not([disabled])');
    await p.click('.btn-lot'); await p.waitForSelector('.ob-lot'); await p.mouse.click(W / 2, H / 2);
    await p.waitForSelector('.ob-c.attente', {timeout: 8000});
    await p.goBack(); await p.waitForSelector('.ob-fin');
    verif(L + 'retour du téléphone : toutes les cartes se retournent, on reste dans la scène', (await p.$$('.ob-c.vu')).length === 10 && !!(await p.$('.ob-lot')));
    await p.waitForTimeout(300); await p.goBack(); await p.waitForSelector('.ob-lot', {state: 'detached'});
    verif(L + 'second retour : la scène se ferme', !(await p.$('.ob-lot')));
    // un booster seul marche toujours après un lot (l'état du lot ne déborde pas)
    await q('update profils set pieces = 600 where user_id = $1', [al.id]);
    await p.reload(); await p.waitForSelector('[data-bequipe]:not([disabled])');
    await p.click('[data-bequipe]'); await p.waitForSelector('.ob-pack'); await p.click('.ob-pack', {force: true});
    await p.waitForSelector('.ob-passer:not([hidden])'); await p.click('.ob-passer'); await p.waitForSelector('.ob-fin');
    verif(L + 'un booster seul s’ouvre toujours comme avant', !(await p.$('.ob-lot')) && (await p.$$('.ob-c')).length === 1 && (await p.$$('.ob-c.vu')).length === 1);
    await p.click('.ob-fin'); await p.waitForSelector('.ob', {state: 'detached'});
    verif(L + 'aucune erreur de page', !erreurs.length, erreurs);
    await ctx.close();
  }
  // démo, moins d'animations demandé par le système : tout arrive d'un coup, on retourne quand même à la main
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'}); await sb.brancher(ctx);
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(web.url + '?demo=lot'); await p.waitForSelector('.ob-lot');   // la démo s'ouvre sans compte
  await p.mouse.click(195, 400); await p.waitForSelector('.ob-c.attente');
  verif('?demo=lot, moins d’animations : 10 cartes de dos tout de suite', (await p.$$('.ob-c')).length === 10 && (await p.$$('.ob-c.vu')).length === 0);
  for (let i = 0; i < 10; i++) await p.click(`.ob-c[data-i="${i}"]`, {force: true});
  await p.waitForSelector('.ob-fin');
  verif('démo : les 10 retournées à la main, bouton « Rejouer », aucune erreur', (await p.textContent('.ob-fin')).trim() === 'Rejouer' && !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
