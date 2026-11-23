// Tirs au but choisis (demande de Maël, 23 nov. 2026) : un nul en tournoi ou contre une Légende arrête le match sur un menu (5 tireurs
// dans l'ordre, seul le TIR compte ; le gardien, mental + réflexes) ; 2 minutes plus pénalisantes ; « changer tout le banc » d'un coup.
// Serveur (PGlite), puis le menu et la séance dans le navigateur (390 px).
//   node tests/test_tirs_au_but.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));
const POSTES = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'];

(async () => {
  const web = await servir(8781), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0}'`);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  // un banc complet : un remplaçant par poste (cartes Or 85 d'autres joueurs)
  const eq = (await q('select equipe from profils where user_id = $1', [al.id]))[0].equipe;
  const pris = new Set((await q('select carte_id from exemplaires where proprietaire = $1', [al.id])).map(x => x.carte_id));
  const remp = {};
  for (const k of POSTES) {
    const c = (await q(`select id from cartes where actif and not legende and ($1 = 'GB' and 'GB' = any(postes) or $1 <> 'GB' and $1 = any(postes)) and not (id = any($2)) order by id limit 1`, [k, [...pris]]))[0].id;
    pris.add(c);
    remp[k] = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'or', 85) returning id", [al.id, c]))[0].id;
  }
  let r = await rpcJoueur(db, al.id, 'aligner_remplacants', [JSON.stringify(eq), JSON.stringify(remp)]);
  verif('banc complet aligné', !r.erreur, r.erreur);
  const etat = async () => (await q('select etat from matchs_direct where user_id = $1', [al.id]))[0]?.etat;
  const poser = async x => q('update matchs_direct set etat = $2 where user_id = $1', [al.id, JSON.stringify(x)]);
  const parcours = async n => q("update profils set parcours = parcours_nouveau($2, null, 'Alice') where user_id = $1", [al.id, n]);
  // un match fini sur un nul (on avance le match puis on force le score)
  const finirNul = async () => {
    await q('delete from matchs_direct where user_id = $1', [al.id]); await q('update profils set matchs = 10 where user_id = $1', [al.id]);
    let x = await rpcJoueur(db, al.id, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
    if (x.erreur) throw new Error(x.erreur);
    for (let i = 0; i < 12; i++) await rpcJoueur(db, al.id, 'match_bloc', ['duels:06', 'normal', false]);
    const e = await etat(); e.score = [25, 25]; e.a.stats.buts = 25; e.b.stats.buts = 25; await poser(e);
  };

  // ── 1. serveur : un nul contre une Légende arrête le match sur le menu
  await parcours(13);
  await finirNul();
  r = await rpcJoueur(db, al.id, 'match_bloc', ['duels:06', 'normal', false]);
  const tab = r.tirsAuBut, js = tab?.joueurs || [];
  verif('nul contre une Légende : le match attend les tirs au but (menu, match toujours en cours)', !!tab && !r.match && !!(await etat())?.tab_attente, r.erreur || Object.keys(r));
  verif('le menu : les 14 joueurs (titulaires et banc), leur TIR, MEN/RÉF pour les gardiens, l’adversaire', js.length === 14 && js.every(x => x.id && x.nom && x.tir > 0)
    && js.filter(x => x.gb != null).length >= 2 && tab.adversaire?.gb > 0 && tab.adversaire?.tir > 0, {n: js.length, adv: tab?.adversaire});
  const reprise = await rpcJoueur(db, al.id, 'match_en_cours', []);
  verif('reprise du match : le menu revient (vue.tirsAuBut)', !!reprise.tirsAuBut?.joueurs?.length, reprise.erreur);
  const gb = js.filter(x => x.gb != null).sort((a, b) => b.gb - a.gb)[0].id;
  const meilleurs = js.filter(x => x.id !== gb).sort((a, b) => b.tir - a.tir).map(x => x.id);
  verif('4 tireurs : refusé', erreur(await rpcJoueur(db, al.id, 'match_tirs_au_but', [meilleurs.slice(0, 4), gb]), 'tireurs'));
  verif('le gardien parmi les tireurs : refusé', erreur(await rpcJoueur(db, al.id, 'match_tirs_au_but', [[gb, ...meilleurs.slice(0, 4)], gb]), 'tireurs'));
  verif('deux fois le même tireur : refusé', erreur(await rpcJoueur(db, al.id, 'match_tirs_au_but', [[...meilleurs.slice(0, 4), meilleurs[0]], gb]), 'tireurs'));
  verif('un joueur qui n’est pas de l’équipe : refusé', erreur(await rpcJoueur(db, al.id, 'match_tirs_au_but', [[...meilleurs.slice(0, 4), '00000000-0000-0000-0000-000000000000'], gb]), 'tireurs'));
  verif('un gardien qui n’en est pas un : refusé', erreur(await rpcJoueur(db, al.id, 'match_tirs_au_but', [meilleurs.slice(1, 6), meilleurs[0]]), 'gardien'));
  const p0 = (await q('select parcours from profils where user_id = $1', [al.id]))[0].parcours;
  r = await rpcJoueur(db, al.id, 'match_tirs_au_but', [meilleurs.slice(0, 5), gb]);
  const t = r.match?.tab;
  verif('la séance : 5 tirs au moins (moins si c’est joué avant), le résultat et le match terminé', t && t.tirs.length >= 3 && t.a !== t.b && r.match.resultat === 'nul' && !(await etat()), r.erreur || t);
  verif('les tireurs dans l’ordre choisi', t && t.tirs[0].n === js.find(x => x.id === meilleurs[0]).nom && (t.tirs[1]?.n === js.find(x => x.id === meilleurs[1]).nom));
  const p1 = (await q('select parcours from profils where user_id = $1', [al.id]))[0].parcours;
  verif('la séance compte dans la série contre la Légende', (p1.v - p0.v) + (p1.d - p0.d) === 1 && (t.a > t.b ? p1.v === p0.v + 1 : p1.d === p0.d + 1), {p0: [p0.v, p0.d], p1: [p1.v, p1.d], t});
  const det = (await q("select detail from rencontres where user_id = $1 and type = 'championnat' order by le desc limit 1", [al.id]))[0].detail;
  verif('la séance est enregistrée avec le match', det.tab?.a === t.a && det.tab?.b === t.b);
  verif('plus de tirs au but à jouer ensuite : refusé', erreur(await rpcJoueur(db, al.id, 'match_tirs_au_but', [meilleurs.slice(0, 5), gb]), 'Pas de match'));

  // ── 2. le choix compte : les 5 meilleurs tireurs gagnent bien plus souvent que les 5 moins bons
  {
    await finirNul(); await rpcJoueur(db, al.id, 'match_bloc', ['duels:06', 'normal', false]);
    const e = await etat(), pires = js.filter(x => x.id !== gb).sort((a, b) => a.tir - b.tir).map(x => x.id), gbPire = js.filter(x => x.gb != null).sort((a, b) => a.gb - b.gb)[0].id;
    let g1 = 0, g2 = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      const x = (await q('select match_tab_jouer($1::jsonb, $2::text[], $3) e', [JSON.stringify(e), meilleurs.slice(0, 5), gb]))[0].e.tab; g1 += x.a > x.b;
      const y = (await q('select match_tab_jouer($1::jsonb, $2::text[], $3) e', [JSON.stringify(e), pires.slice(0, 5).filter(z => z !== gbPire), gbPire]))[0].e.tab; g2 += y.a > y.b;
    }
    verif(`le choix compte : meilleurs tireurs et gardien ${Math.round(100 * g1 / N)} % de séances gagnées, les moins bons ${Math.round(100 * g2 / N)} %`, g1 > g2 + N * .08, {g1, g2});
    // « Simuler la fin » pendant le menu : choix automatique, match conclu
    r = await rpcJoueur(db, al.id, 'match_simuler_fin', []);
    verif('Simuler la fin pendant le menu : séance jouée automatiquement (meilleurs tireurs)', r.match?.tab?.tirs?.length >= 3 && !(await etat()), r.erreur);
  }
  // ── 3. un nul en poule (pas de départage) : pas de tirs au but
  await parcours(1); await finirNul();
  r = await rpcJoueur(db, al.id, 'match_bloc', ['duels:06', 'normal', false]);
  verif('nul en championnat de poule : pas de tirs au but, match conclu', r.match?.resultat === 'nul' && !r.tirsAuBut && !r.match.tab, r.erreur || Object.keys(r));
  // tableau final d'un tournoi : oui
  await parcours(10);
  await q("update profils set parcours = parcours || jsonb_build_object('phase', 'finale', 'tour', 0, 'adversaires', tournoi_tableau(param('parcours') -> 9, '[]')) where user_id = $1", [al.id]);
  await finirNul();
  r = await rpcJoueur(db, al.id, 'match_bloc', ['duels:06', 'normal', false]);
  verif('nul en quart de finale : tirs au but', !!r.tirsAuBut, r.erreur || Object.keys(r));
  await rpcJoueur(db, al.id, 'match_simuler_fin', []);

  // ── 4. 2 minutes : l'équipe à 5 encaisse bien plus et marque moins (exclusion_defense 1,5, exclusion_attaque 0,8)
  {
    const P = (await q("select (valeurs ->> 'exclusion_defense')::numeric d, (valeurs ->> 'exclusion_attaque')::numeric a from parametres"))[0];
    verif('réglages : exclusion_defense 1,5, exclusion_attaque 0,8', +P.d === 1.5 && +P.a === .8, P);
    await finirNul();
    const e0 = await etat(); e0.bloc = 0; e0.t = 0; e0.score = [0, 0]; e0.ev = [];
    for (const c of ['a', 'b']) { e0[c].stats.buts = 0; e0[c].stats.xg = 0; e0[c].exclu = 0; e0[c].fatigue = 0; e0[c].att = 90; e0[c].def = 90; delete e0[c].fma; delete e0[c].fmd; e0[c].elan = 0; }
    let base = 0, exc = 0; const M = 60;
    for (let i = 0; i < M; i++) {
      const x = (await q('select match_avancer($1::jsonb, 3600) e', [JSON.stringify(e0)]))[0].e; base += x.score[1] - x.score[0];
      const e1 = JSON.parse(JSON.stringify(e0)); e1.a.exclu = 999999;   // Alice à 5 tout le match
      const y = (await q('select match_avancer($1::jsonb, 3600) e', [JSON.stringify(e1)]))[0].e; exc += y.score[1] - y.score[0];
    }
    verif(`à 5 tout le match : l’écart de buts passe de ${(base / M).toFixed(1)} à ${(exc / M).toFixed(1)} en faveur de l’adversaire`, exc / M - base / M > 10, {base: base / M, exc: exc / M});
    await q('delete from matchs_direct where user_id = $1', [al.id]);
  }

  // ── 5. le navigateur : « changer tout le banc », puis le menu des tirs au but et la séance
  await parcours(13); await q('update profils set matchs = 10 where user_id = $1', [al.id]);
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (e) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  await p.goto(web.url + '#championnat'); await p.waitForSelector('[data-act=championnat]');
  await p.click('[data-act=championnat]'); await p.waitForSelector('.md-panneau:not([hidden])');
  await p.click('[data-md-go=jouer]'); await p.waitForTimeout(1200);
  await p.click('.md-tac'); await p.waitForSelector('[data-md-go=banc]'); await p.click('[data-md-go=banc]'); await p.waitForSelector('.md-bancp:not([hidden]) [data-md-chg=tous]');
  const avant = await p.evaluate(() => Object.fromEntries(Object.entries(MD.vue.nous.effectif).map(([k, x]) => [k, x.n])));
  if (SP) await p.screenshot({path: SP + '/tab-1-banc.png'});
  await p.click('[data-md-chg=tous]'); await p.waitForFunction(() => !MD.chgEnCours, null, {timeout: 10000}); await p.waitForTimeout(300);
  const apres = await p.evaluate(() => Object.fromEntries(Object.entries(MD.vue.nous.effectif).map(([k, x]) => [k, x.n])));
  verif('« changer les 6 joueurs de champ » : les 6 remplaçants entrent, le gardien reste', POSTES.filter(k => k !== 'GB').every(k => apres[k] !== avant[k]) && apres.GB === avant.GB, {avant, apres});
  await p.click('[data-md-go=banc-fermer]');
  // on ferme le match, on le pose fini sur un nul, puis on le reprend : le menu des tirs au but
  await p.click('.md-x'); await p.waitForTimeout(500);
  const e = await etat(); e.bloc = 12; e.t = 3600; e.score = [27, 27]; e.a.stats.buts = 27; e.b.stats.buts = 27; e.tab_attente = true; e.tab_gain = 1; await poser(e);
  await p.goto(web.url + '#championnat'); await p.waitForSelector('[data-act=reprendre-match]'); await p.click('[data-act=reprendre-match]');
  await p.waitForSelector('.md-tab [data-md-go=tab-tirer]');
  const menu = await p.evaluate(() => ({gb: document.querySelectorAll('[data-tab-gb]').length, t: document.querySelectorAll('[data-tab-t]').length,
    choisis: document.querySelectorAll('[data-tab-t].on').length, gbOn: document.querySelectorAll('[data-tab-gb].on').length, ok: !document.querySelector('[data-md-go=tab-tirer]').disabled,
    large: document.documentElement.scrollWidth}));
  verif('menu : gardiens et 14 joueurs, 5 tireurs et le gardien proposés d’office, bouton prêt, pas de débordement', menu.gb >= 2 && menu.t === 14 && menu.choisis === 5 && menu.gbOn === 1 && menu.ok && menu.large <= 390, menu);
  if (SP) await p.screenshot({path: SP + '/tab-2-menu.png', fullPage: false});
  // on retire un tireur : le bouton se bloque ; on en remet un autre
  const premier = await p.getAttribute('[data-tab-t].on', 'data-tab-t');
  await p.click(`[data-tab-t="${premier}"]`); await p.waitForTimeout(100);
  verif('4 tireurs : « Tirer ! » bloqué', await p.isDisabled('[data-md-go=tab-tirer]'));
  await p.click('[data-tab-t]:not(.on):not([disabled])'); await p.waitForTimeout(100);
  await p.click('[data-md-go=tab-tirer]');
  await p.waitForSelector('.tab-seance'); await p.waitForSelector('[data-md-go=tab-fin]:not([hidden])', {timeout: 30000});
  if (SP) await p.screenshot({path: SP + '/tab-3-seance.png'});
  const s = await p.evaluate(() => ({buts: document.querySelectorAll('.tab-r.but').length, rates: document.querySelectorAll('.tab-r.rate').length, txt: document.querySelector('.tab-qui').textContent}));
  verif(`la séance tir par tir : ${s.buts} buts, ${s.rates} ratés, « ${s.txt} »`, s.buts + s.rates >= 6 && /Tirs au but (gagnés|perdus)/.test(s.txt), s);
  await p.click('[data-md-go=tab-fin]'); await p.waitForSelector('.md-fin');
  verif('le résultat : « Tirs au but x – y »', /Tirs au but \d+ – \d+/.test(await p.textContent('.md-fin')));
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
