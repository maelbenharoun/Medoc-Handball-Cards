// Momentum (demande de Maël, 23 nov. 2026) : une barre partagée que chaque but pousse (30, 40 si l'attaque a le dessus), bloquée à 100
// (+10 % / −10 % de chances de marquer) jusqu'à un temps mort ou la mi-temps ; l'ordinateur et l'adjoint la cassent avec un
// temps mort. Serveur (moteur, sur beaucoup de matchs), puis la barre dans l'écran du match (390 px).
//   node tests/test_momentum.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const BUTS = ['but', '7m-but'];

(async () => {
  const web = await servir(8793), sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0}'`);
  const eq = JSON.stringify({att: 70, def: 70, note: 70, joueurs: {}, tireurs: []});
  const nouveau = async style => { const x = (await q(`select match_nouveau('championnat', '{}', $1::jsonb, $1::jsonb, 'duels:06', 'normal', 'duels', '15') e`, [eq]))[0].e;
    x.ia = (await q('select match_ia($1) i', [style]))[0].i; return x; };
  const bloc = async x => (await q('select match_bloc_jouer($1::jsonb) e', [JSON.stringify(x)]))[0].e;

  // ── 1. sur 40 matchs : la barre, les blocages, ce qui les casse
  let blocages = 0, mal = [], casseTm = 0, casseMt = 0, minutes = 0, tmOrdi = 0;
  for (let i = 0; i < 40; i++) {
    let x = await nouveau(i % 2 ? 'legende' : 'reflechi');
    for (let k = 0; k < 12; k++) x = await bloc(x);
    let v = 0, lock = null, debut = 0;
    for (const w of x.ev) {
      if (typeof w.m === 'number' && !['momentum', 'momentum-fin'].includes(w.ty)) {
        // valeur attendue de l'action, vers l'équipe qui marque (but) ou qui défend (arrêt, perte, tir raté) ; l'équipe restée à 6 (exclusion)
        const val = {but: [20, 28], '7m-but': [14], arret: [12], '7m-arret': [20], perte: [10], poteau: [5], dehors: [5], excl: [10]}[w.ty] || [];
        const vers = BUTS.includes(w.ty) ? w.c : w.c === 'a' ? 'b' : 'a', d = w.m - v;
        if (lock) mal.push(`la barre bouge alors qu'elle est bloquée (${w.ty})`);
        else if (Math.abs(w.m) !== 100 && !val.includes(Math.abs(d))) mal.push(`${w.ty} : ${v} → ${w.m}`);
        else if (d && Math.sign(d) !== (vers === 'a' ? 1 : -1)) mal.push(`${w.ty} : barre poussée du mauvais côté`);
        v = w.m;
      } else if (['but', 'arret', 'perte', 'poteau', 'dehors', '7m-but', '7m-arret'].includes(w.ty) && !lock) mal.push(`${w.ty} sans valeur de momentum`);
      if (w.ty === 'momentum') { blocages++; lock = w.c; debut = w.t; if (Math.abs(w.m) !== 100) mal.push('bloquée avant 100'); }
      if (w.ty === 'momentum-fin') {
        if (w.par === 'tm') { casseTm++; if (w.v && w.c === 'a' && x.ev.some(z => z.ty === 'temps-mort' && z.c === 'b' && z.t === w.t)) tmOrdi++; }
        else casseMt++;
        if (lock) minutes += (w.t - debut) / 60;
        lock = null; v = 0;
      }
      if (w.ty === 'mi-temps' && (lock || v) && !x.ev.some(z => z.ty === 'momentum-fin' && z.t === 1800)) mal.push('la mi-temps ne remet pas la barre au centre');
      if (w.ty === 'mi-temps') { lock = null; v = 0; }
      if (w.ty === 'momentum-fin' || w.ty === 'mi-temps') continue;
    }
    if (lock) minutes += (3600 - debut) / 60;
  }
  verif(`40 matchs : chaque action pousse la barre de sa valeur du bon côté, elle ne bouge plus une fois bloquée (${mal.length} écart(s))`, !mal.length, mal.slice(0, 5));
  verif(`des blocages, mais pas tout le temps : ${blocages} en 40 matchs (${(blocages / 40).toFixed(1)} par match, ${(minutes / Math.max(1, blocages)).toFixed(1)} min en moyenne)`, blocages >= 20 && blocages <= 160, blocages);
  verif(`l'ordinateur casse notre momentum avec un temps mort (${tmOrdi} fois) ; mi-temps : ${casseMt}`, tmOrdi >= 3, {tmOrdi, casseTm, casseMt});

  // ── 2. l'effet : +10 % pour l'équipe qui l'a, −10 % pour l'autre (chances de marquer, moyennes sur la possession)
  const effet = await q(`select (param('momentum_effet') #>> '{}')::numeric v`);
  verif('réglage : momentum_effet = 0,10', +effet[0].v === 0.1, effet[0].v);
  let avec = 0, sans = 0, nA = 0, nS = 0, euxA = 0, euxS = 0;
  await q(`update parametres set valeurs = valeurs || '{"momentum_max": 100000}'`);   // pas d'autre blocage pendant la mesure
  for (let i = 0; i < 60; i++) {
    let x = await nouveau('reflechi'), y = JSON.parse(JSON.stringify(x));
    x.mom = 100; x.momv = 'a'; x.ia = {style: 'hasard', hasard: true, reac: 0, mi: [0, 0], anticipe: 0};   // il ne casse jamais
    y.ia = x.ia;
    x = (await q('select match_avancer($1::jsonb, 1500) e', [JSON.stringify(x)]))[0].e;
    y = (await q('select match_avancer($1::jsonb, 1500) e', [JSON.stringify(y)]))[0].e;
    avec += x.a.stats.xg; sans += y.a.stats.xg; euxA += x.b.stats.xg; euxS += y.b.stats.xg; nA++; nS++;
  }
  await q(`update parametres set valeurs = valeurs || '{"momentum_max": 100}'`);
  verif(`bloqué pour nous : nos buts « mérités » ×${(avec / sans).toFixed(2)} (≈ 1,10), les leurs ×${(euxA / euxS).toFixed(2)} (≈ 0,90)`,
    avec / sans > 1.06 && avec / sans < 1.14 && euxA / euxS > .86 && euxA / euxS < .94, {avec, sans, euxA, euxS});

  // ── 3. un temps mort ramène la barre au centre (des deux côtés) ; rembobiner retrouve la barre
  let x = await nouveau('reflechi');
  x = await bloc(x); x = await bloc(x);
  x.mom = -100; x.momv = 'b';
  let r = (await q('select match_tm_prendre($1::jsonb) e', [JSON.stringify(x)]))[0].e;
  verif('notre temps mort casse leur momentum (barre au centre, « momentum-fin »)', r.mom === 0 && !r.momv && r.ev.at(-1).ty === 'momentum-fin' && r.ev.at(-1).c === 'b' && r.ev.at(-1).v === true, r.ev.at(-1));
  // (demande de Maël, 24 nov. 2026) : un temps mort ramène toujours la barre au centre, même celle qui penchait de notre côté
  x.mom = 100; x.momv = 'a';
  r = (await q('select match_tm_prendre($1::jsonb) e', [JSON.stringify(x)]))[0].e;
  verif('notre temps mort ramène aussi notre momentum au centre', r.mom === 0 && !r.momv && r.ev.at(-1).ty === 'momentum-fin' && r.ev.at(-1).c === 'a', r.ev.at(-1));
  x.mom = 45; delete x.momv;
  r = (await q('select match_tm_prendre($1::jsonb) e', [JSON.stringify(x)]))[0].e;
  verif('une barre qui penche (sans être bloquée) revient aussi au centre', r.mom === 0 && r.ev.at(-1).ty === 'momentum-fin' && r.ev.at(-1).v === false, r.ev.at(-1));
  // rembobiner au milieu d'une tranche où la barre s'est bloquée
  let trouve = false;
  for (let i = 0; i < 30 && !trouve; i++) {
    let z = await nouveau('reflechi');
    for (let k = 0; k < 6 && !trouve; k++) {
      z = await bloc(z);
      const n0 = z.debut_n, lk = z.ev.slice(n0).find(w => w.ty === 'momentum');
      if (lk && !z.ev.slice(n0).some(w => w.ty === 'momentum-fin')) {
        const av = (await q('select match_rembobiner($1::jsonb, $2) e', [JSON.stringify(z), lk.t]))[0].e;
        const ap = (await q('select match_rembobiner($1::jsonb, $2) e', [JSON.stringify(z), Math.max(z.debut.t, lk.t - 1)]))[0].e;
        verif(`rembobiner : bloquée à ${lk.t} s (${av.momv}, ${av.mom}), pas encore une seconde avant (${ap.momv || '-'}, ${ap.mom})`, av.momv === lk.c && Math.abs(av.mom) === 100 && !ap.momv, {av: [av.mom, av.momv], ap: [ap.mom, ap.momv]});
        trouve = true;
      }
    }
  }
  verif('un blocage trouvé pour tester le rembobinage', trouve);
  // Classé : chacun voit la barre de son côté
  const mir = (await q(`select pvp_miroir($1::jsonb) e`, [JSON.stringify({...x, mom: 70, momv: 'a', ev: [{t: 10, c: 'a', ty: 'but', m: 70, s: [1, 0]}]})]))[0].e;
  verif('Classé : la barre change de sens pour l’autre joueur (mom, momv, m des buts)', mir.mom === -70 && mir.momv === 'b' && mir.ev[0].m === -70 && mir.ev[0].c === 'b', [mir.mom, mir.momv, mir.ev[0]]);
  // l'adjoint (Simuler) casse leur momentum s'il nous reste un temps mort
  x.mom = -100; x.momv = 'b'; x.tm = {restants: 3, p1: 0, p2: 0};
  await q(`update parametres set valeurs = valeurs || '{"match_simule_lecture": 0}'`);
  r = (await q('select match_adjoint($1::jsonb) e', [JSON.stringify(x)]))[0].e;
  verif('« Simuler » : l’adjoint prend un temps mort pour casser leur momentum', !r.momv && r.tm.restants === 2 && r.ev.some(w => w.ty === 'momentum-fin'), r.tm);

  // ── 4. la barre dans l'écran du match
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); localStorage.setItem('mhc-son', '{"musique":0,"effets":0}'); } catch (e) {} });
  const pg = await ctx.newPage(), erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
  await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
  await pg.fill('[name=email]', 'alice@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-alice'); await pg.click('button[value=connexion]');
  await pg.waitForSelector('.niveau');
  await pg.goto(web.url + '#championnat'); await pg.waitForSelector('[data-act="championnat"]');
  await pg.click('[data-act="championnat"]'); await pg.waitForSelector('.md .md-mom');
  const etat = () => pg.evaluate(() => { const el = document.querySelector('.md-mom'), tr = s => getComputedStyle(el.querySelector(s)).transform;
    return {a: tr('.mm-m.a .mm-f'), b: tr('.mm-m.b .mm-f'), lockA: el.classList.contains('lock-a'), lockB: el.classList.contains('lock-b'),
      pips: el.querySelectorAll('.mm-pips.a i.on').length, plein: tr('.mm-plein'), feu: getComputedStyle(el.querySelector('.mm-feu')).opacity, large: document.documentElement.scrollWidth}; });
  await pg.evaluate(() => { for (const [c, m, ty] of [['a', 20, 'but'], ['a', 48, 'but'], ['b', 60, 'arret']]) noterMD({t: 60, c, ty, n: 'X', s: [1, 0], m}, true); });
  await pg.waitForTimeout(700);
  let e1 = await etat();
  verif(`deux buts puis un arrêt de notre gardien : la barre dorée à 60 % de notre côté, 2 pastilles (${e1.a})`, /matrix\(0\.6/.test(e1.a) && e1.pips === 2 && !e1.lockA && e1.large <= 390, e1);
  await pg.evaluate(() => { noterMD({t: 90, c: 'a', ty: 'but', n: 'X', s: [3, 0], m: 100}, true); noterMD({t: 90, c: 'a', ty: 'momentum', m: 100, s: [3, 0]}); });
  await pg.waitForTimeout(700);
  e1 = await etat();
  verif('bloquée : toute la barre se remplit et s’enflamme (badge « MOMENTUM »)', /matrix\(1,/.test(e1.plein) && e1.feu === '1' && e1.lockA, e1);
  const fil = await pg.textContent('.md-fil');
  verif('le fil le raconte : « prend le momentum ! »', /prend le momentum/.test(fil));
  if (SP) await pg.screenshot({path: SP + '/momentum-bloque.png', clip: {x: 0, y: 0, width: 390, height: 360}});
  await pg.evaluate(() => noterMD({t: 120, c: 'a', ty: 'momentum-fin', par: 'tm', v: true, m: 0, s: [3, 0]}));
  await pg.waitForTimeout(700);
  e1 = await etat();
  verif('cassée par un temps mort : la barre revient au centre', /matrix\(0,/.test(e1.a) && !e1.lockA && e1.pips === 0, e1);
  // retour de Guilhem (24 nov. 2026) : temps mort juste avant leur momentum ; le blocage, raconté en retard (~0,5 s après le but),
  // arrivait après la réponse du temps mort et rebloquait la barre à l'écran
  await pg.evaluate(() => { noterMD({t: 118, c: 'b', ty: 'but', n: 'Y', s: [3, 1], m: -100}, true); noterMD({t: 118, c: 'b', ty: 'momentum', m: -100, s: [3, 1]}); });
  await pg.waitForTimeout(700);
  e1 = await etat();
  verif('un blocage d’avant le temps mort, raconté en retard, ne rebloque pas la barre', /matrix\(0,/.test(e1.b || e1.a) && !e1.lockA && !e1.lockB, e1);
  // retour de Rémi et Guilhem (24 nov. 2026) : but et momentum à 29'59, raconté après la mi-temps : la barre restait bloquée à la pause
  await pg.evaluate(() => { noterMD({t: 1799, c: 'b', ty: 'but', n: 'Y', s: [15, 15], m: -100}, true);
    noterMD({t: 1800, ty: 'mi-temps', s: [15, 15]}); noterMD({t: 1799, c: 'b', ty: 'momentum', m: -100, s: [15, 15]}); });
  await pg.waitForTimeout(700);
  e1 = await etat();
  verif('mi-temps : un momentum raconté après la pause ne rebloque pas la barre', /matrix\(0,/.test(e1.b || e1.a) && !e1.lockA && !e1.lockB, e1);
  await pg.evaluate(() => noterMD({t: 1830, c: 'a', ty: 'but', n: 'X', s: [16, 15], m: 20}, true));
  await pg.waitForTimeout(300);
  e1 = await etat();
  verif('2e période : la barre repart normalement', !/matrix\(0,/.test(e1.a), e1);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
