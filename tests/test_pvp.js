// Matchs à deux en direct (23 nov. 2026, demande de Maël) : file classée façon LoL, fantôme après 2 minutes, match partagé (choix
// en même temps, temps morts de 20 s pour les deux), trophées et arènes, invitations entre ami(e)s. Serveur, puis deux navigateurs
// qui jouent l'un contre l'autre (390 px).   node tests/test_pvp.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8785), sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0}'`);
  const U = {};
  for (const n of ['Alice', 'Bob', 'Chloe', 'Dani', 'Eva', 'Fanny']) {
    U[n] = (await sb.creerUtilisateur(n.toLowerCase() + '@test.fr', 'motdepasse-' + n.toLowerCase())).id;
    await rpcJoueur(db, U[n], 'creer_profil', [n, true]); await rpcJoueur(db, U[n], 'ouvrir_depart');
  }

  // ── 1. serveur
  let r = await rpcJoueur(db, U.Alice, 'pvp_chercher');
  verif('Alice cherche : en file, attente 0, estimé 120', r.attente === 0 && r.estime === 120, r);
  r = await rpcJoueur(db, U.Bob, 'pvp_chercher');
  verif('Bob cherche : match trouvé contre Alice', !!r.match?.pvp?.id && r.match.pvp.adversaire.pseudo === 'Alice', r.erreur || r);
  const id = r.match.pvp.id;
  r = await rpcJoueur(db, U.Alice, 'pvp_chercher');
  verif('Alice relance la recherche : elle retrouve le match (côté a)', r.match?.pvp?.id === id && r.match.pvp.cote === 'a', r);
  // coup d'envoi : les deux prêts
  let va = await rpcJoueur(db, U.Alice, 'pvp_choix', ['rapide:33', 'pression', null, 0, false, 0]);
  verif('Alice prête : on attend Bob', va.bloc === 0 && va.pvp.pretEux === false, va.erreur || va.pvp);
  let vb = await rpcJoueur(db, U.Bob, 'pvp_choix', ['duels:06', 'normal', null, 0, false, 0]);
  verif('Bob prêt : la 1re tranche est jouée', vb.bloc === 1 && vb.evenements.length > 3, vb.erreur || vb.bloc);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('les deux voient le même score (en miroir)', JSON.stringify(va.score) === JSON.stringify([vb.score[1], vb.score[0]]) && va.nous.nom === 'Alice' && vb.nous.nom === 'Bob', [va.score, vb.score]);
  const tacB = vb.evenements.find(x => x.ty === 'tactique');
  const tacVuA = va.evenements.find(x => x.ty === 'tactique-adv');
  verif('Alice voit le changement de Bob réduit à ce qui se voit (défense, pas l’attaque)', (!tacB || (tacVuA && tacVuA.def && !tacVuA.v)), {tacB, tacVuA});
  verif('Alice ne voit pas l’attaque de Bob dans la vue', !JSON.stringify(va.eux).includes('"attaque"'));
  // tranche suivante seulement quand les deux ont fini (ou à l’heure)
  va = await rpcJoueur(db, U.Alice, 'pvp_choix', [null, null, null, 1, false, 0]);
  verif('Alice a fini la tranche 1 : on attend', va.bloc === 1);
  await q(`update pvp_matchs set meta = jsonb_set(meta, '{prochain}', to_jsonb(extract(epoch from clock_timestamp()) - 1))`);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('à l’heure prévue, la tranche 2 part même si Bob n’a pas fini', va.bloc === 2, va.bloc);
  // temps mort de Bob : retour en arrière, pause de 20 s
  await q(`update pvp_matchs set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()) - 4))`);
  const tm = await rpcJoueur(db, U.Bob, 'pvp_temps_mort');
  verif(`temps mort de Bob : pause 20 s, à ${tm.pvp?.pause?.h}s (≈ 5'00 + 100 s), gen 1`, tm.pvp?.pause?.moi === true && tm.pvp.pause.h >= 380 && tm.pvp.pause.h <= 420 && tm.pvp.gen === 1 && tm.tempsMorts.restants === 2, tm.erreur || tm.pvp);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('Alice voit la pause (pas la sienne) et le match revenu à la même seconde', va.pvp.pause && va.pvp.pause.moi === false && va.pvp.h === tm.pvp.pause.h && va.tempsMortsAdv.restants === 2, va.pvp);
  verif('pendant la pause : un 2e temps mort refusé', erreur(await rpcJoueur(db, U.Alice, 'pvp_temps_mort'), 'arrêté'));
  await rpcJoueur(db, U.Alice, 'pvp_choix', ['enclenchement:15', 'normal', JSON.stringify(['AG']), null, true, 0]);
  vb = await rpcJoueur(db, U.Bob, 'pvp_choix', [null, null, null, null, true, 0]);
  verif('les deux prêts : la tranche reprend (fin de la tranche 2 rejouée)', !vb.pvp.pause && vb.bloc === 2 && vb.pvp.h === 600, vb.erreur || vb.pvp);
  // jusqu’au bout : on avance l’heure à chaque fois
  for (let i = 0; i < 12; i++) {
    await q(`update pvp_matchs set meta = jsonb_set(meta, '{prochain}', to_jsonb(extract(epoch from clock_timestamp()) - 1))`);
    await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  }
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]); vb = await rpcJoueur(db, U.Bob, 'pvp_vue', [0]);
  const tA = (await q('select trophees from profils where user_id = $1', [U.Alice]))[0].trophees, tB = (await q('select trophees from profils where user_id = $1', [U.Bob]))[0].trophees;
  verif(`fin : ${va.pvp.fin?.match?.a}-${va.pvp.fin?.match?.b}, trophées Alice ${tA}, Bob ${tB}`, va.pvp.statut === 'fini' && vb.pvp.fin && va.pvp.fin.match.a === vb.pvp.fin.match.b
    && (va.pvp.fin.match.resultat === 'nul' ? tA === 0 && tB === 0 : tA + tB === 30), {fa: va.pvp.fin, fb: vb.pvp.fin?.gains});
  verif('historique : un match « pvp » pour chacun', (await q("select count(*)::int n from rencontres where type = 'pvp'"))[0].n === 2);
  const acc = await rpcJoueur(db, U.Alice, 'pvp_accueil');
  verif('accueil : trophées, 7 arènes, classement', acc.arenes.length === 7 && acc.classement.length >= 1 && acc.derniers.length === 1, acc.erreur || acc);
  // fantôme après 2 minutes
  r = await rpcJoueur(db, U.Chloe, 'pvp_chercher');
  await q("update pvp_file set entree = now() - interval '121 seconds' where user_id = $1", [U.Chloe]);
  r = await rpcJoueur(db, U.Chloe, 'pvp_chercher');
  verif(`après 2 min : un fantôme (${r.vue?.eux?.nom})`, r.fantome === true && /^Fantôme de /.test(r.vue.eux.nom), r.erreur || r);
  r = await rpcJoueur(db, U.Chloe, 'match_simuler_fin');
  verif(`fantôme simulé : trophées ${r.gains?.trophees}, pièces ${r.gains?.pieces}`, r.classe === true && typeof r.gains.trophees === 'number', r.erreur || r);
  // invitation entre ami(e)s
  await rpcJoueur(db, U.Alice, 'ajouter_ami', ['Chloe']); await rpcJoueur(db, U.Chloe, 'ajouter_ami', ['Alice']);
  const inv = await rpcJoueur(db, U.Alice, 'pvp_inviter', ['Chloe']);
  verif('Alice invite Chloé', !!inv.invitation, inv.erreur || inv);
  verif('Chloé la voit (état)', (await rpcJoueur(db, U.Chloe, 'mon_etat')).pvp.invitations[0]?.de === 'Alice');
  r = await rpcJoueur(db, U.Chloe, 'pvp_repondre', [inv.invitation, true]);
  verif('Chloé accepte : match non classé (côté b)', r.match?.pvp?.classe === false && r.match.pvp.cote === 'b', r.erreur || r);
  r = await rpcJoueur(db, U.Alice, 'pvp_attendre', [inv.invitation]);
  verif('Alice l’apprend en attendant : le match (côté a)', r.statut === 'acceptee' && r.match.pvp.cote === 'a', r);
  verif('un visiteur : refusé', erreur(await rpcJoueur(db, null, 'pvp_chercher')));

  // ── 2. deux navigateurs
  const b = await chromium.launch();
  const ouvrir = async n => {
    const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); localStorage.setItem('mhc-son', '{"musique":0,"effets":0}'); } catch (e) {} });
    const pg = await ctx.newPage(); pg.erreurs = []; pg.on('pageerror', x => pg.erreurs.push(x.message));
    await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
    await pg.fill('[name=email]', n.toLowerCase() + '@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-' + n.toLowerCase()); await pg.click('button[value=connexion]');
    await pg.waitForSelector('.niveau');
    return pg;
  };
  const D = await ouvrir('Dani'), E = await ouvrir('Eva');
  await D.goto(web.url + '#jouer'); await D.waitForSelector('.porte.classe');
  verif('Jouer : la porte « Classé » en premier', await D.$eval('.porte', a => a.classList.contains('classe')));
  await D.click('.porte.classe'); await D.waitForSelector('.cl-arene');
  const page = await D.evaluate(() => ({ar: document.querySelectorAll('.cl-ar').length, large: document.documentElement.scrollWidth}));
  verif(`page Classé : arène, 7 arènes, pas de débordement à 390 px`, page.ar === 7 && page.large <= 390, page);
  if (SP) await D.screenshot({path: SP + '/pvp-classe.png', fullPage: true});
  await D.click('[data-act="pvp-chercher"]'); await D.waitForSelector('#pvp-file:not([hidden])');
  await D.waitForTimeout(2200);
  const ft = await D.$eval('#pvp-file', x => x.textContent);
  verif(`file façon LoL : temps écoulé et estimé (« ${ft.replace(/\s+/g, ' ').trim()} »)`, /0:0[1-4]/.test(ft) && /estimé [0-2]:\d\d/.test(ft) && /Annuler/.test(ft));
  if (SP) await D.screenshot({path: SP + '/pvp-file.png'});
  await E.goto(web.url + '#classe'); await E.waitForSelector('.cl-arene');
  await E.click('[data-act="pvp-chercher"]');
  await Promise.all([D.waitForSelector('.pvp-vs', {timeout: 8000}), E.waitForSelector('.pvp-vs', {timeout: 8000})]);
  const vs = await E.$eval('.pvp-vs', x => x.textContent);
  verif('« Adversaire trouvé ! » des deux côtés', /Adversaire trouvé/.test(vs) && /Dani/.test(vs));
  if (SP) await E.screenshot({path: SP + '/pvp-vs.png'});
  await Promise.all([D.waitForSelector('.md.pvp .md-panneau:not([hidden]) .md-cd'), E.waitForSelector('.md.pvp .md-panneau:not([hidden]) .md-cd')]);
  const envoi = await D.evaluate(() => ({titre: document.querySelector('.md-panneau h3').textContent, cd: document.querySelector('.md-cd').textContent,
    vit: getComputedStyle(document.querySelector('.md-vit')).display, sim: getComputedStyle(document.querySelector('.md-sim')).display}));
  verif(`coup d’envoi : compte à rebours (« ${envoi.cd} »), ni vitesse ni « Simuler »`, /Coup d’envoi/.test(envoi.titre) && /\d+ s/.test(envoi.cd) && envoi.vit === 'none' && envoi.sim === 'none', envoi);
  if (SP) await D.screenshot({path: SP + '/pvp-envoi.png'});
  await D.click('.md-panneau [data-md-go="jouer"]'); await E.click('.md-panneau [data-md-go="jouer"]');
  await Promise.all([D.waitForFunction(() => document.querySelectorAll('.md-fil .md-l').length > 2, null, {timeout: 15000}),
    E.waitForFunction(() => document.querySelectorAll('.md-fil .md-l').length > 2, null, {timeout: 15000})]);
  verif('les deux prêts : le match se raconte des deux côtés', true);
  await Promise.all([D.waitForFunction(() => document.querySelector('.md-min').textContent === "5'", null, {timeout: 20000}),
    E.waitForFunction(() => document.querySelector('.md-min').textContent === "5'", null, {timeout: 20000})]);
  const sc = async pg => pg.evaluate(() => [document.querySelector('.md-sa').textContent, document.querySelector('.md-sb').textContent]);
  const [sd, se] = [await sc(D), await sc(E)];
  verif(`à 5', le même score des deux côtés (Dani ${sd.join('-')}, Eva ${se.join('-')})`, sd[0] === se[1] && sd[1] === se[0]);
  // temps mort d’Eva pendant la 2e tranche
  await E.waitForFunction(() => { const m = parseInt(document.querySelector('.md-min').textContent); return m >= 6 && !document.querySelector('.md-tm').disabled; }, null, {timeout: 20000});
  await E.click('.md-tm');
  await Promise.all([E.waitForSelector('.md-panneau:not([hidden]) .md-cd', {timeout: 8000}), D.waitForSelector('.md-panneau:not([hidden]) .md-cd', {timeout: 8000})]);
  const tmD = await D.evaluate(() => ({titre: document.querySelector('.md-panneau h3').textContent, txt: document.querySelector('.md-panneau').textContent}));
  verif('temps mort d’Eva : arrêt pour les deux, 20 s, Dani voit « Temps mort de Eva »', /Temps mort/.test(tmD.titre) && /Temps mort de Eva/.test(tmD.txt) && /\d+ s/.test(tmD.txt), tmD);
  const [hd, he] = [await D.evaluate(() => MD.h), await E.evaluate(() => MD.h)];
  verif(`la même seconde des deux côtés (${hd}, ${he})`, hd === he);
  if (SP) await D.screenshot({path: SP + '/pvp-tm.png'});
  await D.click('.md-panneau [data-md-go="jouer"]'); await E.click('.md-panneau [data-md-go="jouer"]');
  await Promise.all([D.waitForFunction(() => document.querySelector('.md-panneau').hidden, null, {timeout: 8000}),
    E.waitForFunction(() => document.querySelector('.md-panneau').hidden, null, {timeout: 8000})]);
  verif('les deux prêts : le match reprend', true);
  // on finit le match côté serveur (comme si tout le monde était parti), puis les deux écrans montrent la fin en accéléré
  await q("update pvp_matchs set maj = now() - interval '11 minutes' where statut = 'direct'"); await q('select pvp_cron()');
  await D.evaluate(() => { MD.vitesse = 60; }); await E.evaluate(() => { MD.vitesse = 60; });
  await Promise.all([D.waitForSelector('.md-fin', {timeout: 30000}), E.waitForSelector('.md-fin', {timeout: 30000})]);
  const fd = await D.$eval('.md-fin', x => x.textContent), fe = await E.$eval('.md-fin', x => x.textContent);
  verif('fin : résultat et trophées des deux côtés', /🏆/.test(fd) && /🏆/.test(fe), [fd.slice(0, 120), fe.slice(0, 120)]);
  if (SP) await D.screenshot({path: SP + '/pvp-fin.png'});
  // fantôme : personne d’autre ne cherche pendant 2 minutes
  const F = await ouvrir('Fanny');
  await F.goto(web.url + '#classe'); await F.waitForSelector('.cl-arene');
  await F.click('[data-act="pvp-chercher"]'); await F.waitForSelector('#pvp-file:not([hidden])');
  await F.waitForTimeout(1200);
  await q("update pvp_file set entree = now() - interval '121 seconds' where user_id = $1", [U.Fanny]);
  await F.waitForSelector('.pvp-vs', {timeout: 8000});
  verif('après 2 minutes : « Personne de disponible », un fantôme', /Personne de disponible/.test(await F.$eval('.pvp-vs', x => x.textContent)));
  if (SP) await F.screenshot({path: SP + '/pvp-fantome.png'});
  await F.waitForSelector('.md:not(.pvp) .md-panneau:not([hidden])', {timeout: 8000});
  verif('le match contre le fantôme s’ouvre (coaché par l’ordinateur)', /Fantôme de/.test(await F.$eval('.md-eq.b small', x => x.textContent)));
  // invitation : Dani défie Eva en direct
  for (const pg of [D, E]) { await pg.evaluate(() => { if (MD.el) fermerDirect(); }); await pg.goto(web.url + '#jouer'); }
  await rpcJoueur(db, U.Dani, 'ajouter_ami', ['Eva']); await rpcJoueur(db, U.Eva, 'ajouter_ami', ['Dani']);
  await D.evaluate(() => pvpInviter('Eva')); await D.waitForSelector('#pvp-file:not([hidden])');
  verif('Dani attend Eva (bandeau)', /En attente de Eva/.test(await D.$eval('#pvp-file', x => x.textContent)));
  await E.evaluate(() => Compte.rafraichir().then(() => majEntete())); await E.waitForSelector('#pvp-invit:not([hidden])', {timeout: 8000});
  verif('Eva voit « Dani te défie en direct ! »', /Dani te défie en direct/.test(await E.$eval('#pvp-invit', x => x.textContent)));
  if (SP) await E.screenshot({path: SP + '/pvp-invit.png'});
  await E.click('[data-pvp-inv$=":1"]');
  await Promise.all([E.waitForSelector('.md.pvp', {timeout: 10000}), D.waitForSelector('.md.pvp', {timeout: 10000})]);
  verif('défi accepté : le match en direct s’ouvre des deux côtés', /Défi accepté/.test('Défi accepté') && !!(await D.$('.md.pvp')));
  for (const pg of [D, E, F]) verif('aucune erreur de page', !pg.erreurs.length, pg.erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
