// Légendes en double (demande de Maël, 26 nov. 2026) : un doublon contre un Ultime au choix, ou proposé à un joueur qui a une légende
// qu'on n'a pas (une légende contre une légende). Serveur (règles, triche), puis l'écran à 390 px.
//   node tests/test_legendes_echanges.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8801), sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  // deux légendes : Annette (filles) et Dono (garçons)
  const [l1, l2] = (await q("select id from cartes where equipe = 'SF1' order by id limit 2")).map(x => x.id);
  await q("update cartes set legende = true, actif = false, nom = 'Annette' where id = $1", [l1]);
  await q("update cartes set legende = true, actif = false, nom = 'Dono' where id = $1", [l2]);
  const U = {};
  for (const n of ['Remi', 'Guit', 'Chloe']) {
    U[n] = (await sb.creerUtilisateur(n.toLowerCase() + '@test.fr', 'motdepasse-' + n.toLowerCase())).id;
    await rpcJoueur(db, U[n], 'creer_profil', [n, true]); await rpcJoueur(db, U[n], 'ouvrir_depart');
  }
  const leg = (uid, c) => q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'ultime', 100) returning id", [uid, c]).then(r => r[0].id);
  const combien = async (uid, c) => +(await q('select count(*) n from exemplaires where proprietaire = $1 and carte_id = $2', [uid, c]))[0].n;
  const annette1 = await leg(U.Remi, l1), annette2 = await leg(U.Remi, l1);
  await leg(U.Guit, l2);

  // ── 1. ce que chacun voit
  let v = await rpcJoueur(db, U.Remi, 'mes_legendes');
  verif('Rémi : Annette en double, et Guit qui a Dono (qu’il n’a pas)', v.doublons?.length === 1 && v.doublons[0].carte === l1 && v.doublons[0].n === 2
    && v.candidats?.length === 1 && v.candidats[0].pseudo === 'Guit' && v.candidats[0].carte?.id === l2, v);
  v = await rpcJoueur(db, U.Guit, 'mes_legendes');
  verif('Guit (pas de doublon) : ne voit pas qui a les autres légendes', !v.doublons.length && !v.candidats.length, v);
  v = await rpcJoueur(db, U.Chloe, 'mes_legendes');
  verif('Chloé (aucune légende) : rien', !v.doublons.length && !v.candidats.length && !v.recues.length, v);

  // ── 2. triche et erreurs
  verif('sans doublon : refusé', erreur(await rpcJoueur(db, U.Guit, 'legende_ultime', [l2, 'x']), 'en double') || erreur(await rpcJoueur(db, U.Guit, 'legende_ultime', [l2, (await q("select id from cartes where actif and not legende limit 1"))[0].id]), 'en double'));
  verif('une carte qui n’est pas une légende : refusé', erreur(await rpcJoueur(db, U.Remi, 'legende_ultime', [(await q("select id from cartes where actif and not legende limit 1"))[0].id, l1]), 'légende'));
  verif('contre une légende (au lieu d’un Ultime) : refusé', erreur(await rpcJoueur(db, U.Remi, 'legende_ultime', [l1, l2]), 'Joueur inconnu'));
  verif('proposer à quelqu’un qui n’a pas la légende : refusé', erreur(await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Chloe', l2]), 'n’a pas'));
  verif('proposer une légende qu’on a déjà : refusé', erreur(await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Guit', l1]), 'déjà'));
  verif('proposer à soi-même : refusé', erreur(await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Remi', l2]), 'Joueur inconnu'));
  verif('le jeu ne lit pas la table des échanges de légendes', erreur(await rpcJoueur(db, U.Remi, 'legende_cedable', [U.Remi, l1])) );

  // ── 3. proposition, refus, nouvelle proposition, acceptation
  v = await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Guit', l2]);
  verif('Rémi propose Annette contre la Dono de Guit', v.envoyees?.length === 1 && v.envoyees[0].pseudo === 'Guit', v);
  verif('une seule proposition en attente chez le même joueur', erreur(await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Guit', l2]), 'déjà une proposition'));
  const etatG = await rpcJoueur(db, U.Guit, 'mon_etat');
  v = await rpcJoueur(db, U.Guit, 'mes_legendes');
  verif('Guit : la proposition reçue (avec la carte proposée) et la pastille de Social', v.recues?.length === 1 && v.recues[0].donnee?.id === l1 && etatG.social?.legendes === 1, {v, social: etatG.social});
  const id1 = v.recues[0].id;
  verif('Chloé ne peut pas répondre à la place de Guit', erreur(await rpcJoueur(db, U.Chloe, 'legende_repondre', [id1, true]), 'plus valable'));
  v = await rpcJoueur(db, U.Guit, 'legende_repondre', [id1, false]);
  verif('Guit refuse : rien ne bouge', !v.recues.length && await combien(U.Remi, l1) === 2 && await combien(U.Guit, l2) === 1);
  await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Guit', l2]);
  const id2 = (await rpcJoueur(db, U.Guit, 'mes_legendes')).recues[0].id;
  // la Dono de Guit dans son équipe : il faut la retirer d'abord
  const eqG = (await q('select equipe from profils where user_id = $1', [U.Guit]))[0].equipe, donoG = (await q('select id from exemplaires where proprietaire = $1 and carte_id = $2', [U.Guit, l2]))[0].id;
  await q('update profils set equipe = equipe || jsonb_build_object(\'DC\', $2::text) where user_id = $1', [U.Guit, donoG]);
  verif('sa légende dans son équipe : il faut la retirer d’abord', erreur(await rpcJoueur(db, U.Guit, 'legende_repondre', [id2, true]), 'équipe'));
  await q('update profils set equipe = $2 where user_id = $1', [U.Guit, JSON.stringify(eqG)]);
  v = await rpcJoueur(db, U.Guit, 'legende_repondre', [id2, true]);
  verif('Guit accepte : il a Annette, Rémi a Dono et une Annette', !v.erreur && await combien(U.Guit, l1) === 1 && await combien(U.Guit, l2) === 0
    && await combien(U.Remi, l1) === 1 && await combien(U.Remi, l2) === 1, v.erreur || v);
  verif('les cartes échangées : protection remise à 5', (await q('select protection from exemplaires where carte_id = any($1)', [[l1, l2]])).every(x => x.protection === 5));
  verif('plus de doublon : Rémi ne voit plus les légendes des autres', (await rpcJoueur(db, U.Remi, 'mes_legendes')).candidats.length === 0);

  // ── 4. un doublon contre un Ultime au choix
  await leg(U.Remi, l1);
  const choix = (await q("select id from cartes where actif and not legende and equipe = 'SG1' order by id limit 1"))[0].id;
  // ses deux Annette dans l'équipe et sur le banc : refusé
  const [a1, a2] = (await q('select id from exemplaires where proprietaire = $1 and carte_id = $2', [U.Remi, l1])).map(x => x.id);
  const eqR = (await q('select equipe, remplacants from profils where user_id = $1', [U.Remi]))[0];
  await q("update profils set equipe = equipe || jsonb_build_object('DC', $2::text), remplacants = jsonb_build_object('DC', $3::text) where user_id = $1", [U.Remi, a1, a2]);
  verif('ses deux exemplaires dans l’équipe et sur le banc : refusé', erreur(await rpcJoueur(db, U.Remi, 'legende_ultime', [l1, choix]), 'retires-en'));
  await q('update profils set equipe = $2, remplacants = $3 where user_id = $1', [U.Remi, JSON.stringify(eqR.equipe), JSON.stringify(eqR.remplacants || {})]);
  const avant = await combien(U.Remi, choix);
  v = await rpcJoueur(db, U.Remi, 'legende_ultime', [l1, choix]);
  const nv = (await q('select palier, note, origine from exemplaires where id = $1', [v.ids?.[0]]))[0];
  verif('Annette en double → un Ultime 90 du joueur choisi, une Annette de moins', !v.erreur && await combien(U.Remi, l1) === 1 && await combien(U.Remi, choix) === avant + 1
    && nv?.palier === 'ultime' && nv.note === 90, v.erreur || nv);
  verif('plus de doublon : refusé la 2e fois', erreur(await rpcJoueur(db, U.Remi, 'legende_ultime', [l1, choix]), 'en double'));

  // ── 5. l'écran : la fiche de la légende en double, la fenêtre, la proposition reçue
  await leg(U.Remi, l1);   // de nouveau un doublon
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (er) {} });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', x => erreurs.push(x.message));
  p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
  const connexion = async (mail, mdp) => { await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
    await p.fill('[name=email]', mail); await p.fill('[name=mdp]', mdp); await p.click('button[value=connexion]'); await p.waitForSelector('.niveau'); };
  await connexion('remi@test.fr', 'motdepasse-remi');
  await p.waitForSelector('.leg-bandeau');
  verif('accueil : bandeau « Légende en double »', /double/.test(await p.textContent('.leg-bandeau')));
  await p.evaluate(id => fiche(id), l1); await p.waitForSelector('#overlay [data-act=legendes]');
  verif('fiche de la légende en double : le bouton des échanges', /double/i.test(await p.textContent('#overlay .leg-double')));
  await p.click('#overlay [data-act=legendes]'); await p.waitForSelector('#overlay .leg-f');
  const f = await p.evaluate(() => ({ult: !!document.querySelector('#overlay [data-leg-ultime]'), cand: document.querySelectorAll('#overlay [data-leg-proposer]').length,
    txt: document.querySelector('#overlay .leg-f').textContent, deborde: document.documentElement.scrollWidth > innerWidth}));
  verif('fenêtre : « contre un Ultime au choix » et Guit (qui a Dono, qu’il n’a pas… ici il a déjà Dono : aucun)', f.ult && f.cand === 0 && !f.deborde, f);
  if (SP) { await p.waitForTimeout(300); await p.screenshot({path: SP + '/legendes-1.png'}); }
  // choisir un Ultime : la liste des joueurs, recherche
  await p.click('#overlay [data-leg-ultime]'); await p.waitForSelector('#overlay [data-leg-choix]');
  const nChoix = await p.$$eval('#overlay [data-leg-choix]', l => l.length);
  await p.fill('#overlay .leg-cherche', (await q('select nom from cartes where id = $1', [choix]))[0].nom.split(' ')[0]);
  await p.waitForTimeout(200);
  const nFiltre = await p.$$eval('#overlay [data-leg-choix]:not([hidden])', l => l.length);
  verif(`choix de l’Ultime : tous les joueurs (${nChoix}), une recherche par nom (${nFiltre})`, nChoix > 20 && nFiltre >= 1 && nFiltre < nChoix);
  if (SP) { await p.screenshot({path: SP + '/legendes-2.png'}); }
  const n0 = await combien(U.Remi, choix);
  await p.click(`#overlay [data-leg-choix="${choix}"]`); await p.click('.dmd-oui');
  await p.waitForSelector('.ob', {timeout: 10000});
  verif('confirmé : la carte Ultime se dévoile comme un booster, une Annette de moins', await combien(U.Remi, choix) === n0 + 1 && await combien(U.Remi, l1) === 1);
  await p.click('.ob .ob-pack', {force: true}).catch(() => {}); await p.evaluate(() => toutReveler?.()); await p.waitForSelector('.ob .ob-fin', {timeout: 10000});
  await p.click('.ob .ob-fin'); await p.waitForFunction(() => !document.querySelector('.ob'));
  // Guit : une proposition reçue (Chloé n'a pas de légende : on donne à Chloé une Dono et à Rémi deux Annette)
  await leg(U.Remi, l1);
  await q('delete from exemplaires where proprietaire = $1 and carte_id = $2', [U.Remi, l2]);   // Rémi n'a plus Dono
  await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Guit', l2]).then(r => r.erreur);   // Guit n'a plus Dono (il a Annette) : refusé
  await leg(U.Guit, l2);
  const prop = await rpcJoueur(db, U.Remi, 'legende_proposer', [l1, 'Guit', l2]);
  verif('Rémi propose de nouveau à Guit', !prop.erreur, prop.erreur);
  await p.evaluate(() => Compte.deconnexion ? Compte.deconnexion() : null).catch(() => {});
  await ctx.clearCookies(); await p.evaluate(() => { try { localStorage.clear(); localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (e) {} });
  await connexion('guit@test.fr', 'motdepasse-guit');
  await p.waitForSelector('.leg-bandeau');
  verif('Guit : bandeau « Remi te propose un échange de légende »', /Remi/.test(await p.textContent('.leg-bandeau')));
  await p.click('.leg-bandeau [data-act=legendes]'); await p.waitForSelector('#overlay [data-leg-oui]');
  if (SP) { await p.waitForTimeout(300); await p.screenshot({path: SP + '/legendes-3.png'}); }
  await p.click('#overlay [data-leg-oui]'); await p.click('.dmd-oui');
  await p.waitForSelector('.ob', {timeout: 10000});
  verif('Guit accepte : il reçoit la légende (dévoilée comme un booster), Rémi a Dono', await combien(U.Guit, l1) === 2 && await combien(U.Guit, l2) === 0 && await combien(U.Remi, l2) === 1);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
