// Match en direct (demande de Maël, 14 nov. 2026) : changement de tactique libre à chaque tranche de 5 minutes, temps mort qui
// dévoile la tactique adverse (attaque comprise), mi-temps obligatoire avec le bilan de la 1re période ; l'entraîneur adverse
// change lui aussi sans temps mort. Serveur, puis un match dans le navigateur (390 px).
//   node tests/test_match_direct.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));
const ATT = ['duels', 'enclenchement', 'rapide'];

(async () => {
  const web = await servir(8789), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const etat = async () => (await q('select etat from matchs_direct where user_id = $1', [al.id]))[0]?.etat;

  // ── 1. le serveur
  verif('temps mort sans match : refusé', erreur(await rpcJoueur(db, al.id, 'match_temps_mort'), 'Pas de match'));
  let r = await rpcJoueur(db, al.id, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
  verif('match commencé', r.direct === true, r.erreur);
  verif('temps mort au coup d’envoi : refusé', erreur(await rpcJoueur(db, al.id, 'match_temps_mort'), 'Pas de temps mort maintenant'));
  r = await rpcJoueur(db, al.id, 'match_bloc', ['duels:06', 'normal', false]);
  // tranche 2 : on change sans temps mort
  r = await rpcJoueur(db, al.id, 'match_bloc', ['rapide:33', 'pression', false]);
  let e = await etat();
  verif('changement libre après 5 minutes : tactique et consigne appliquées, sans temps mort', e.a.tactique === 'rapide:33' && e.a.attaque === 'rapide' && e.a.defense === '33' && e.a.consigne === 'pression' && e.tm.restants === 3);
  verif('le changement est raconté au fil (« tactique »)', r.vue.evenements.some(x => x.ty === 'tactique' && x.c === 'a' && x.v === 'rapide:33' && x.cons === 'pression'));
  r = await rpcJoueur(db, al.id, 'match_bloc', ['enclenchement:15', 'normal', false]);
  verif('et encore à la tranche suivante', (await etat()).a.tactique === 'enclenchement:15');
  const vueSans = JSON.stringify(r.vue);
  verif('hors temps mort, leur attaque n’est pas dans la vue', !('attaque' in r.vue.eux) && !/"va"/.test(vueSans));
  // temps mort : leur tactique du moment dévoilée
  e = await etat();
  r = await rpcJoueur(db, al.id, 'match_temps_mort');
  verif('temps mort : leur attaque et leur défense dévoilées, exactement celles du moment', r.adverse?.attaque === e.b.attaque && r.adverse?.defense === e.b.defense, {r: r.adverse || r.erreur, vrai: [e.b.attaque, e.b.defense]});
  verif('temps mort : compté (2 restants), au fil avec leur tactique, élan', r.vue.tempsMorts.restants === 2 && r.vue.evenements.some(x => x.ty === 'temps-mort' && x.c === 'a' && x.va === e.b.attaque && x.vd === e.b.defense)
    && (await etat()).a.elan > e.t);
  verif('deuxième temps mort dans la même période : permis', (await rpcJoueur(db, al.id, 'match_temps_mort')).vue?.tempsMorts?.restants === 1);
  verif('troisième dans la même période : refusé', erreur(await rpcJoueur(db, al.id, 'match_temps_mort'), 'Déjà 2'));
  for (let k = 0; k < 3; k++) r = await rpcJoueur(db, al.id, 'match_bloc', ['enclenchement:15', 'normal', false]);
  verif('à la mi-temps (30\') : pas de temps mort, on change librement', (await etat()).bloc === 6 && erreur(await rpcJoueur(db, al.id, 'match_temps_mort'), 'mi-temps'));
  r = await rpcJoueur(db, al.id, 'match_bloc', ['duels:33', 'normal', false]);
  verif('2e période : le dernier temps mort reste', (await rpcJoueur(db, al.id, 'match_temps_mort')).vue?.tempsMorts?.restants === 0
    && erreur(await rpcJoueur(db, al.id, 'match_temps_mort'), 'Plus de temps mort'));
  verif('tactique inconnue : refusée', erreur(await rpcJoueur(db, al.id, 'match_bloc', ['n_importe:quoi', 'normal', false])));
  await rpcJoueur(db, al.id, 'match_simuler_fin');
  // championnat (demande de Maël, 14 nov. 2026) : un match par heure, chaque match rapporte moitié moins (pièces et XP)
  const P = (await q('select valeurs v from parametres'))[0].v;
  await q('update profils set matchs = 5 where user_id = $1', [al.id]);
  r = await rpcJoueur(db, al.id, 'match_commencer', ['championnat', null, 'duels:06', 'normal', true]);
  const res = r.match?.resultat, g = +P.match_simule_gain * +P.championnat_gain;
  verif(`recharge d’une heure, gains du championnat ×${P.championnat_gain} (match simulé, ${res})`, P.match_minutes === 60 && +P.championnat_gain === .5
    && r.gains?.pieces === Math.round(P.pve_pieces[res] * g) && r.gains.xp === Math.round(P.pve_xp[res] * g) && r.gains.xpCarte === Math.round(P.pve_xp_carte[res] * g),
    {gains: r.gains, attendu: [P.pve_pieces[res] * g, P.pve_xp[res] * g]});
  // l'entraîneur adverse change lui aussi sans temps mort (style « rapide »), et n'en prend que mené de 3 buts ou plus
  let libres = 0, tms = 0, tmsMalMenes = 0;
  const ia = (await q("select match_ia('rapide') i"))[0].i;
  for (let i = 0; i < 25; i++) {
    let x = (await q(`select match_nouveau('championnat', '{}', $1::jsonb, $1::jsonb, 'duels:06', 'normal', $2, '15') e`,
      [JSON.stringify({att: 70, def: 70, note: 70, joueurs: {}, tireurs: []}), ATT[i % 3]]))[0].e;
    x.ia = ia;
    for (let k = 0; k < 12; k++) x = (await q('select match_bloc_jouer($1::jsonb) e', [JSON.stringify(x)]))[0].e;
    for (const v of x.ev) {
      if (v.c !== 'b') continue;
      if (v.ty === 'temps-mort') { tms++; if (v.s[1] - v.s[0] > -3) tmsMalMenes++; }
      if ((v.ty === 'defense' || v.ty === 'attaque') && v.t !== 1800 && !x.ev.some(w => w.c === 'b' && w.ty === 'temps-mort' && w.t === v.t)) libres++;
    }
  }
  verif(`l’entraîneur adverse change sans temps mort (${libres} fois en 25 matchs, contre une tactique figée)`, libres >= 5, libres);
  verif(`il ne prend un temps mort que mené de 3 buts ou plus (${tms} temps morts)`, tmsMalMenes === 0, tmsMalMenes);
  // « Simuler » : l'adjoint (match_adjoint) contre leur défense une tranche sur deux environ ; jamais de temps mort
  let contres = 0, essais = 0, adjTm = 0, adjEv = 0;
  for (let i = 0; i < 40; i++) {
    let x = (await q(`select match_nouveau('championnat', '{}', $1::jsonb, $1::jsonb, 'duels:06', 'normal', 'duels', '15') e`,
      [JSON.stringify({att: 70, def: 70, note: 70, joueurs: {}, tireurs: []})]))[0].e;
    x.ia = ia; x.bloc = 1; x.t = 300;
    const y = (await q('select match_adjoint($1::jsonb) e', [JSON.stringify(x)]))[0].e;
    essais++; if (y.a.attaque === 'rapide') contres++;   // rapide bat la 1-5
    adjTm += y.tm.restants !== 3 ? 1 : 0; adjEv += y.ev.some(v => v.ty === 'tactique' && v.adj) ? 1 : 0;
  }
  verif(`adjoint de « Simuler » : il contre leur défense environ une fois sur deux (${contres}/${essais}), raconté au fil, sans temps mort`,
    contres >= 10 && contres <= 30 && adjEv === contres && adjTm === 0, {contres, adjEv, adjTm});
  // l'adjoint ne touche pas à la tactique choisie (enregistrée dans l'onglet Équipe en fin de match) : bug de la v71
  await q("update profils set tactique = 'duels:06', matchs = 5 where user_id = $1", [al.id]);
  let changee = 0;
  for (let i = 0; i < 6; i++) { const m = await rpcJoueur(db, al.id, 'match_commencer', ['championnat', null, 'duels:06', 'normal', true]);
    if ((await q('select tactique from profils where user_id = $1', [al.id]))[0].tactique !== 'duels:06') changee++;
    if (m.erreur) { changee = -1; break; } await q('update profils set matchs = 5 where user_id = $1', [al.id]); }
  verif('après des matchs simulés, la tactique choisie reste la même (l’adjoint ne l’écrase pas)', changee === 0, changee);

  // ── 2. dans le navigateur
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-vitesse', '4'); } catch (er) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', x => erreurs.push(x.message)); p.on('dialog', d => d.accept());
  p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
  await q('update profils set matchs = 5 where user_id = $1', [al.id]);
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  await p.goto(web.url + '#championnat'); await p.waitForSelector('[data-act=championnat]');
  await p.click('[data-act=championnat]'); await p.waitForSelector('.md-panneau:not([hidden])');
  verif('coup d’envoi : on annonce le changement possible toutes les 5 minutes', /toutes les 5 minutes/.test(await p.textContent('.md-panneau')));
  await p.click('[data-md-go=jouer]');
  const bas = await p.evaluate(() => { const l = [...document.querySelectorAll('.md-bas .btn')], r = document.querySelector('.md-bas').getBoundingClientRect();
    return {n: l.length, txt: l.map(x => x.firstChild.textContent.trim()), dedans: l.every(x => { const z = x.getBoundingClientRect(); return z.left >= r.left - 1 && z.right <= r.right + 1; }),
      deborde: document.documentElement.scrollWidth > innerWidth}; });
  verif('en bas : Tactique, Temps mort, vitesse, Simuler, sans déborder', bas.n === 4 && bas.txt[0] === 'Tactique' && bas.txt[1] === 'Temps mort' && bas.dedans && !bas.deborde, bas);
  // pendant la tranche : Tactique → le récit s'arrête, le choix part à la fin de la tranche
  await p.waitForFunction(() => MD.h > 60 && MD.h < 240, null, {timeout: 15000});
  await p.click('.md-tac'); await p.waitForSelector('.md-panneau:not([hidden])');
  const h0 = await p.evaluate(() => MD.h);
  verif('panneau Tactique : leur défense visible, leur attaque cachée, appliqué à 5\'', /attaque reste cachée/.test(await p.textContent('.md-panneau')) && /s’applique à 5'/.test(await p.textContent('.md-panneau')));
  if (SP) { await p.waitForTimeout(700); await p.screenshot({path: SP + '/md-1-tactique.png'}); }
  await p.waitForTimeout(800);
  verif('le récit est en pause pendant le choix', (await p.evaluate(() => MD.h)) === h0);
  const actuelle = await p.evaluate(() => MD.tac.split(':')[0]), autre = ATT.find(x => x !== actuelle);
  await p.click(`[data-md-att=${autre}]`); await p.click('[data-md-go=jouer]');
  await p.waitForFunction(() => MD.h > 330, null, {timeout: 20000});
  verif('à 5\' : le changement est fait et raconté au fil', (await etat()).a.attaque === autre && /Tu passes en/.test(await p.textContent('.md-fil')));
  // temps mort : leur tactique dévoilée
  await p.waitForFunction(() => !document.querySelector('.md-tm').disabled && MD.vue.bloc < 5, null, {timeout: 15000});
  await p.click('.md-tm');
  await p.waitForSelector('.md-panneau:not([hidden]) h3', {timeout: 20000});
  await p.waitForFunction(() => /Temps mort/.test(document.querySelector('.md-panneau h3')?.textContent || ''), null, {timeout: 20000});
  e = await etat();
  const txt = await p.textContent('.md-panneau');
  const NA = {duels: 'Duels', enclenchement: 'Enclenchement', rapide: 'Jeu rapide'}, ND = {'06': '0-6', '15': '1-5', '33': '3-3'};
  verif('temps mort : « ils attaquent en … et défendent en … », la vraie tactique adverse', txt.includes(`ils attaquent en ${NA[e.b.attaque]} et défendent en ${ND[e.b.defense]}`), txt.slice(0, 200));
  verif('temps mort : au fil aussi', (await p.textContent('.md-fil')).includes(`attaque en ${NA[e.b.attaque]}`));
  if (SP) await p.screenshot({path: SP + '/md-2-temps-mort.png'});
  await p.click('[data-md-go=jouer]');
  // mi-temps obligatoire : arrêt à 30', bilan de la 1re période
  await p.waitForFunction(() => /Mi-temps/.test(document.querySelector('.md-panneau:not([hidden]) h3')?.textContent || ''), null, {timeout: 60000});
  verif('mi-temps : le match s’arrête à 30\', bilan de la 1re période (tirs, réussite, arrêts, pertes)', (await p.evaluate(() => MD.h)) === 1800 && (await etat()).bloc === 6
    && (await p.$$('.md-bilan div')).length === 4 && /2e période/.test(await p.textContent('.md-panneau')));
  if (SP) { await p.waitForTimeout(700); await p.screenshot({path: SP + '/md-3-mi-temps.png'}); }
  await p.waitForTimeout(1500);
  verif('mi-temps : le match attend le joueur', (await etat()).bloc === 6 && (await p.evaluate(() => MD.h)) === 1800);
  await p.click('[data-md-go=jouer]');
  await p.waitForFunction(() => MD.h > 1900, null, {timeout: 20000});
  await p.click('.md-sim'); await p.waitForSelector('.md-fin', {timeout: 20000});
  verif('simuler la fin : résultat', !!(await p.$('.md-fin')));
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
