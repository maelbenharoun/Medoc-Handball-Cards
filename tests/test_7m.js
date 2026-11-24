// Jets de 7 m joués au mini-jeu pendant le match (demande de Maël, 23 nov. 2026) : le moteur s'arrête sur le jet (1 sur 3, au plus 1 par
// équipe et par mi-temps), le joueur tire (mini-jeu du 7 m) ou arrête (tireur sur le point de 7 m, sans trajectoire), puis la tranche
// reprend ; en Classé, le tireur vise puis le gardien devine, « trop long » si le tireur ne tire pas à temps. Serveur, puis l'écran (390 px).
//   node tests/test_7m.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8795), sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0, "sept_chance": 0.34}'`);   // le harnais les coupe par défaut
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const U = {};
  for (const n of ['Alice', 'Bob', 'Chloe']) {
    U[n] = (await sb.creerUtilisateur(n.toLowerCase() + '@test.fr', 'motdepasse-' + n.toLowerCase())).id;
    await rpcJoueur(db, U[n], 'creer_profil', [n, true]); await rpcJoueur(db, U[n], 'ouvrir_depart');
  }
  const eq = JSON.stringify({att: 70, def: 70, note: 70, joueurs: {}, tireurs: []});

  // ── 1. le moteur : fréquence, limite par mi-temps, la tranche s'arrête sur le jet
  let tous = 0, joues = 0, maxMt = 0;
  for (let i = 0; i < 30; i++) {
    let x = (await q(`select match_nouveau('championnat', '{}', $1::jsonb, $1::jsonb, 'duels:06', 'normal', 'duels', '15') e`, [eq]))[0].e;
    x.ia = (await q("select match_ia('reflechi') i"))[0].i; x.sept_jeu = true;
    const parMt = {};
    for (let k = 0; k < 40 && x.bloc < 12; k++) {
      x = (await q('select match_bloc_jouer($1::jsonb) e', [JSON.stringify(x)]))[0].e;
      while (x.sept) {   // tiré par la formule, puis la tranche reprend
        const cle = x.sept.c + (x.sept.t < 1800 ? 1 : 2); parMt[cle] = (parMt[cle] || 0) + 1; joues++;
        x = (await q('select match_reprendre_tranche(match_7m_resoudre($1::jsonb, null, null)) e', [JSON.stringify(x)]))[0].e;
      }
    }
    tous += x.ev.filter(w => w.z === '7m' && ['7m-but', '7m-arret', 'poteau', 'dehors'].includes(w.ty)).length;
    maxMt = Math.max(maxMt, ...Object.values(parMt), 0);
  }
  verif(`30 matchs : ${joues} jets de 7 m joués au mini-jeu sur ${tous} (≈ 1 sur 3), jamais plus d’un par équipe et par mi-temps`, joues > 0 && joues / tous > .15 && joues / tous < .5 && maxMt <= 1, {joues, tous, maxMt});

  // ── 2. Championnat VS Ordi : notre tir, leur tir, la suite de la tranche
  await q(`update parametres set valeurs = valeurs || '{"sept_chance": 0}'`);   // pas d'autre jet de 7 m au hasard dans la suite des tranches
  const commencer = async () => { await q('delete from matchs_direct'); await q('update profils set matchs = 10');
    return rpcJoueur(db, U.Alice, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]); };
  await commencer();
  let e = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
  verif('en direct : jets de 7 m au mini-jeu activés', e.sept_jeu === true);
  // un jet de 7 m pour nous au milieu de la 1re tranche
  e.bloc = 0; e.t = 120; e.sept = (await q(`select sept_preparer($1::jsonb, 'a', 120, 'Lea Perez', 'Gardien X', $1::jsonb -> 'a', $1::jsonb -> 'b') s`, [JSON.stringify(e)]))[0].s;
  e.ev.push({t: 120, c: 'a', ty: 'sept', n: 'Lea Perez', g: 'Gardien X', s: e.score});
  await q('update matchs_direct set etat = $2 where user_id = $1', [U.Alice, JSON.stringify(e)]);
  verif('pendant le jet de 7 m : pas de tranche', erreur(await rpcJoueur(db, U.Alice, 'match_bloc', ['duels:06', 'normal', false]), 'Jet de 7 m'));
  let v = await rpcJoueur(db, U.Alice, 'match_vue_x', []).catch(() => null);
  verif('un tir invalide est refusé', erreur(await rpcJoueur(db, U.Alice, 'match_7m', [JSON.stringify({x: 3, y: .5, puissance: .8}), 0]), 'invalide'));
  let r = await rpcJoueur(db, U.Alice, 'match_7m', [JSON.stringify({x: .15, y: .3, puissance: .8}), 0]);
  e = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
  const res = e.ev.find(w => w.joue);
  verif(`notre tir : résultat au fil (${r.tir?.resultat}), la tranche reprend jusqu’à 5'`, !r.erreur && ['but', 'arret', 'poteau', 'dehors'].includes(r.tir?.resultat) && !e.sept && e.bloc === 1 && e.t === 300 && !!res
    && r.vue.evenements.some(w => w.joue), r.erreur || r.tir);
  // leur tir : nous arrêtons
  e.sept = (await q(`select sept_preparer($1::jsonb, 'b', 400, 'Tireur Y', 'Notre GB', $1::jsonb -> 'b', $1::jsonb -> 'a') s`, [JSON.stringify(e)]))[0].s;
  e.t = 400;
  await q('update matchs_direct set etat = $2 where user_id = $1', [U.Alice, JSON.stringify(e)]);
  v = (await rpcJoueur(db, U.Alice, 'match_en_cours')).vue || await rpcJoueur(db, U.Alice, 'match_en_cours');
  const sv = v.sept;
  verif(`leur tir : le jeu connaît la zone et la durée du vol (${sv?.col}${sv?.hau}, ${sv?.duree} ms)`, sv?.c === 'b' && sv.phase === 'gardien' && ['g', 'c', 'd'].includes(sv.col) && sv.duree >= 450, sv);
  r = await rpcJoueur(db, U.Alice, 'match_7m', [JSON.stringify({colonne: sv.col, hauteur: sv.hau, temps: 200}), 0]);
  verif(`bonne zone, à temps : arrêté (ou raté par le tireur) (${r.tir?.resultat})`, ['arret', 'poteau', 'dehors'].includes(r.tir?.resultat), r.erreur || r.tir);
  e = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
  e.sept = (await q(`select sept_preparer($1::jsonb, 'b', e.t, 'Tireur Y', 'Notre GB', $1::jsonb -> 'b', $1::jsonb -> 'a') s from (select ($1::jsonb ->> 't')::int t) e`, [JSON.stringify(e)]))[0].s;
  await q('update matchs_direct set etat = $2 where user_id = $1', [U.Alice, JSON.stringify(e)]);
  r = await rpcJoueur(db, U.Alice, 'match_7m', [JSON.stringify({colonne: 'c', hauteur: 'b', temps: 99999}), 0]);
  verif(`trop tard : le ballon passe (${r.tir?.resultat})`, ['but', 'poteau', 'dehors'].includes(r.tir?.resultat), r.erreur || r.tir);
  // « Simuler la fin » avec un jet de 7 m en attente
  e = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
  e.sept = (await q(`select sept_preparer($1::jsonb, 'a', ($1::jsonb ->> 't')::int, 'Lea Perez', 'X', $1::jsonb -> 'a', $1::jsonb -> 'b') s`, [JSON.stringify(e)]))[0].s;
  await q('update matchs_direct set etat = $2 where user_id = $1', [U.Alice, JSON.stringify(e)]);
  r = await rpcJoueur(db, U.Alice, 'match_simuler_fin');
  verif('« Simuler la fin » avec un jet de 7 m en attente : tiré par la formule, le match va au bout', !r.erreur && !!r.match, r.erreur);

  // ── 2 bis. une blessure (ou autre chose) racontée avant un 7 m de la même tranche (retour de Guilhem, 24 nov. 2026 : plus rien de
  // possible) : changement et temps mort avant le 7 m sont acceptés ; le 7 m, pas encore raconté, n'a pas eu lieu
  {
    const jusquau7m = async () => {
      await q(`update parametres set valeurs = valeurs || '{"sept_chance": 1}'`);
      for (let i = 0; i < 12; i++) {
        const e = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0]?.etat;
        if (e?.sept && e.sept.t > (e.debut?.t ?? 0) + 20) break;
        if (e?.sept) await rpcJoueur(db, U.Alice, 'match_7m', [JSON.stringify({x: .15, y: .3, puissance: .8}), 0]);
        else await rpcJoueur(db, U.Alice, 'match_bloc', ['duels:06', 'normal', false]);
      }
      await q(`update parametres set valeurs = valeurs || '{"sept_chance": 0}'`);
      await q(`update matchs_direct set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()))) where user_id = $1`, [U.Alice]);
      return (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
    };
    await commencer();
    let e = await jusquau7m();
    const h = (e.debut?.t ?? 0) + 5;
    verif(`un 7 m en attente à ${e.sept?.t} s, la tranche commencée à ${e.debut?.t} s`, !!e.sept && h < e.sept.t, {sept: e.sept?.t, debut: e.debut?.t});
    // à la seconde du 7 m (ou estimé là, un téléphone qui raconte moins vite que ×1) : pris juste avant le jet, qui reste à jouer
    // (retour de Maël, 24 nov. 2026 : avant, changements refusés 3 ou 4 minutes, le temps que le récit arrive au 7 m)
    {
      const t7 = e.sept.t, avantTm = e.tm?.restants;
      const r0 = await rpcJoueur(db, U.Alice, 'match_temps_mort', [t7]);
      const e0 = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
      verif('temps mort à la seconde du 7 m : accepté, le jet reste à tirer à la reprise', !r0.erreur && e0.sept?.t === t7 && e0.tm?.restants === avantTm - 1 && !!r0.vue?.sept, r0.erreur || {sept: e0.sept?.t, tm: e0.tm});
      verif('… et la tranche ne repart pas avant le jet', erreur(await rpcJoueur(db, U.Alice, 'match_bloc', ['duels:06', 'normal', false]), 'Jet de 7 m'));
      const r1 = await rpcJoueur(db, U.Alice, 'match_changer', [JSON.stringify(['AG']), t7]);
      verif('changement à la seconde du 7 m : plus refusé à cause du 7 m', !r1.erreur ? !!r1.vue?.sept : !/Jet de 7 m/.test(r1.erreur), r1.erreur);
      await rpcJoueur(db, U.Alice, 'match_7m', [JSON.stringify({x: .15, y: .3, puissance: .8}), 0]);
      e = await jusquau7m();
    }
    let r = await rpcJoueur(db, U.Alice, 'match_changer', [JSON.stringify(['AG']), h]);
    let e2 = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
    // (le compte de test n'a pas de remplaçant : « Pas de remplaçant » prouve que le 7 m en attente ne bloque plus le changement)
    verif(`changement avant le 7 m (${h} s) : plus refusé à cause du 7 m`, !r.erreur ? r.reprise === h : !/Jet de 7 m/.test(r.erreur), r.erreur || {reprise: r.reprise, sept: e2.sept});
    e = await jusquau7m();
    const h2 = Math.max(e.debut?.t ?? 0, (e.sept?.t ?? 0) - 10);
    r = await rpcJoueur(db, U.Alice, 'match_temps_mort', [h2]);
    e2 = (await q('select etat from matchs_direct where user_id = $1', [U.Alice]))[0].etat;
    verif(`temps mort avant le 7 m (${h2} s) : accepté, le match s’arrête à cette seconde, plus de 7 m en attente`, !r.erreur && r.reprise === h2 && !e2.sept && e2.t === h2, r.erreur || {reprise: r.reprise, t: e2.t, sept: e2.sept});
    r = await rpcJoueur(db, U.Alice, 'match_bloc', ['duels:06', 'normal', false]);
    verif('… puis la fin de la tranche se joue', !r.erreur, r.erreur);
  }

  // ── 3. Classé : le tireur vise, le gardien devine, « trop long »
  await q('delete from matchs_direct');
  const id = (await q("select pvp_nouveau($1, $2, true, 0) id", [U.Alice, U.Bob]))[0].id;
  await q(`update pvp_matchs set meta = meta || jsonb_build_object('pret', '{"a": 0, "b": 0}'::jsonb) where id = $1`, [id]);
  let m = (await q('select etat from pvp_matchs where id = $1', [id]))[0].etat;
  verif('Classé : jets de 7 m au mini-jeu activés', m.sept_jeu === true);
  const poser = async (c, t) => { m = (await q('select etat from pvp_matchs where id = $1', [id]))[0].etat;
    m.t = t; m.sept = (await q(`select sept_preparer($1::jsonb, $2, $3, 'Tireur', 'Gardien', $1::jsonb -> $2, $1::jsonb -> (case $2 when 'a' then 'b' else 'a' end)) s`, [JSON.stringify(m), c, t]))[0].s;
    await q('update pvp_matchs set etat = $2 where id = $1', [id, JSON.stringify(m)]); };
  await poser('b', 100);
  let vb = await rpcJoueur(db, U.Bob, 'pvp_vue', [0]);
  verif('Bob (b) voit qu’il tire, côté a dans son miroir', vb.sept?.c === 'a' && vb.sept.phase === 'tir' && !vb.sept.col, vb.sept);
  let va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('Alice voit qu’il tire, sans la zone tant qu’il n’a pas visé', va.sept?.c === 'b' && va.sept.phase === 'tir' && !va.sept.col, va.sept);
  verif('Alice ne peut pas tirer à sa place', erreur(await rpcJoueur(db, U.Alice, 'pvp_7m', [JSON.stringify({x: .5, y: .5, puissance: .8}), 0]), 'Pas à toi'));
  r = await rpcJoueur(db, U.Bob, 'pvp_7m', [JSON.stringify({x: .15, y: .3, puissance: .7}), 0]);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif(`Bob vise : le tir part chez Alice (zone ${va.sept?.col}${va.sept?.hau}, ${va.sept?.duree} ms)`, va.sept?.phase === 'gardien' && va.sept.col === 'd' && va.sept.hau === 'h', va.sept || r.erreur);
  r = await rpcJoueur(db, U.Alice, 'pvp_7m', [JSON.stringify({colonne: 'd', hauteur: 'h', temps: 150}), 0]);
  m = (await q('select etat from pvp_matchs where id = $1', [id]))[0].etat;
  verif(`Alice devine la bonne zone : arrêté (${r.tir?.resultat}), la tranche reprend`, r.tir?.resultat === 'arret' && !m.sept, r.erreur || r.tir);
  // trop long
  await poser('a', m.t);
  await q(`update pvp_matchs set etat = jsonb_set(etat, '{sept,limite}', to_jsonb(extract(epoch from now()) - 1)) where id = $1`, [id]);
  await rpcJoueur(db, U.Bob, 'pvp_vue', [0]);
  m = (await q('select etat from pvp_matchs where id = $1', [id]))[0].etat;
  verif('Alice ne tire pas à temps : « trop long », ballon à Bob', !m.sept && m.ev.some(w => w.ty === 'perte' && w.long && w.c === 'a'), m.ev.slice(-3));

  // ── 4. l'écran : intro « 7m », notre tir au mini-jeu, la suite du match
  const b = await chromium.launch({args: ['--use-angle=swiftshader']});
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); localStorage.setItem('mhc-son', '{"musique":0,"effets":0}'); localStorage.setItem('mhc-tuto', '{"7m":1,"gardien":1}'); } catch (e) {} });
  const pg = await ctx.newPage(), erreurs = []; pg.on('pageerror', x => erreurs.push(x.message));
  await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
  await pg.fill('[name=email]', 'chloe@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-chloe'); await pg.click('button[value=connexion]');
  await pg.waitForSelector('.niveau');
  await q(`update parametres set valeurs = valeurs || '{"sept_chance": 1}'`);   // le premier jet de 7 m sera joué
  await pg.goto(web.url + '#championnat'); await pg.waitForSelector('[data-act="championnat"]');
  await pg.click('[data-act="championnat"]'); await pg.waitForSelector('.md-panneau:not([hidden])');
  await pg.evaluate(() => { MD.vitesse = 4; });
  await pg.click('[data-md-go="jouer"]');
  const vu = await pg.waitForSelector('.sept-intro, .j7.sept, .mj.sept', {timeout: 90000}).then(() => true).catch(() => false);
  verif('un jet de 7 m arrive : l’intro « 7m » s’affiche', vu && !!(await pg.$('.sept-intro, .j7.sept, .mj.sept')));
  if (SP) { await pg.waitForTimeout(400); await pg.screenshot({path: SP + '/7m-intro.png'}); }
  const quoi = await pg.waitForSelector('.j7.sept, .mj.sept', {timeout: 60000}).then(x => x.evaluate(el => el.classList.contains('j7') ? 'tir' : 'arret')).catch(() => null);
  verif(`puis le mini-jeu : ${quoi === 'tir' ? 'notre tir (viseur et jauge)' : quoi === 'arret' ? 'leur tir à arrêter' : 'rien'}`, !!quoi);
  if (SP) { await pg.waitForTimeout(1500); await pg.screenshot({path: SP + '/7m-jeu.png'}); }
  if (quoi === 'tir') {
    // sans 3D (rare, en test sans carte graphique), le jeu tire tout seul pour ne pas bloquer le match
    await pg.waitForFunction(() => (J7.ctl && J7.phase === 'visee') || !J7.el, null, {timeout: 60000});
    if (await pg.evaluate(() => !!J7.el)) { await pg.mouse.click(195, 400); await pg.waitForTimeout(500); await pg.mouse.click(195, 400); }
  } else {
    await pg.waitForTimeout(2500); await pg.mouse.click(195, 600);
  }
  await pg.waitForSelector('.j7.sept, .mj.sept', {state: 'detached', timeout: 30000});
  // le résultat est raconté au fil (après son animation), puis le match continue (un autre jet de 7 m peut suivre : la chance est à 1 ici)
  await pg.waitForFunction(() => MD.evs.some(x => x.joue || x.long), null, {timeout: 10000}).catch(() => {});
  const fin = await pg.evaluate(() => ({res: MD.evs.filter(x => x.joue || x.long).map(x => x.ty), h: MD.h, t: MD.evs.find(x => x.ty === 'sept')?.t}));
  verif(`le mini-jeu se ferme, le résultat est au fil (${fin.res.join(', ')}) et le match reprend`, fin.res.length >= 1, fin);
  // retour de Rémi (24 nov. 2026) : un match repris avec un jet de 7 m en attente restait bloqué (« Reprendre » demandait la suite,
  // refusée tant que le jet n'était pas tiré) ; maintenant le jet s'ouvre
  await pg.click('.md-x').catch(() => {}); await pg.waitForTimeout(800);
  const uC = (await q("select user_id from profils where pseudo = 'Chloe'"))[0].user_id;
  for (let i = 0; i < 14; i++) {
    const e = (await q('select etat from matchs_direct where user_id = $1', [uC]))[0]?.etat;
    if (!e || e.sept) break;
    await rpcJoueur(db, uC, 'match_bloc', ['duels:06', 'normal', false]);
  }
  const enAttente = !!(await q('select etat from matchs_direct where user_id = $1', [uC]))[0]?.etat?.sept;
  if (enAttente) {
    await pg.goto(web.url + '#championnat'); await pg.waitForSelector('[data-act=reprendre-match]'); await pg.click('[data-act=reprendre-match]');
    await pg.waitForSelector('.md-panneau:not([hidden]) [data-md-go="jouer"]'); await pg.click('[data-md-go="jouer"]');
    const ouvert = await pg.waitForSelector('.sept-intro, .j7.sept, .mj.sept', {timeout: 60000}).then(() => true).catch(() => false);
    verif('match repris avec un jet de 7 m en attente : « Reprendre » ouvre le jet (plus de blocage)', ouvert);
  } else verif('match repris avec un jet de 7 m en attente (pas de 7 m tiré cette fois)', true);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
