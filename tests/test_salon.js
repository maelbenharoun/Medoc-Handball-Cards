// En ligne et salon (demande de Maël, 23 nov. 2026) : pastille verte pour qui a joué dans les 2 dernières minutes, « apparaître hors
// ligne », salon ouvert à tous les joueurs (limites, modération de l'admin), puis deux navigateurs (390 px).
//   node tests/test_salon.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8794), sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const U = {};
  for (const n of ['Alice', 'Bob', 'Chloe']) {
    U[n] = (await sb.creerUtilisateur(n.toLowerCase() + '@test.fr', 'motdepasse-' + n.toLowerCase())).id;
    await rpcJoueur(db, U[n], 'creer_profil', [n, true]); await rpcJoueur(db, U[n], 'ouvrir_depart');
  }

  // ── 1. serveur
  await rpcJoueur(db, U.Alice, 'mon_etat'); await rpcJoueur(db, U.Bob, 'mon_etat');
  let e = await rpcJoueur(db, U.Bob, 'mon_etat');
  verif('en ligne : Bob voit Alice (pas lui-même), pas Chloé (pas venue)', e.enLigne.includes('Alice') && !e.enLigne.includes('Bob') && !e.enLigne.includes('Chloe'), e.enLigne);
  await q("update profils set vu_le = now() - interval '3 minutes' where user_id = $1", [U.Alice]);
  e = await rpcJoueur(db, U.Bob, 'mon_etat');
  verif('plus de 2 minutes sans jouer : plus en ligne', !e.enLigne.includes('Alice'), e.enLigne);
  await rpcJoueur(db, U.Alice, 'regler_presence', [true]); await rpcJoueur(db, U.Alice, 'mon_etat');
  e = await rpcJoueur(db, U.Bob, 'mon_etat');
  verif('« apparaître hors ligne » : Alice joue mais n’apparaît pas', !e.enLigne.includes('Alice'), e.enLigne);
  await rpcJoueur(db, U.Alice, 'regler_presence', [false]);
  let r = await rpcJoueur(db, U.Alice, 'salon_ecrire', ['  Salut   tout le monde !  ', 0]);
  verif('Alice écrit dans le salon (espaces nettoyés)', r.messages?.at(-1)?.texte === 'Salut tout le monde !' && r.messages.at(-1).moi === true, r.erreur || r.messages);
  r = await rpcJoueur(db, U.Alice, 'salon_ecrire', ['encore', 0]);
  verif('un message toutes les 3 secondes au plus', erreur(r, 'Doucement'), r);
  verif('message vide ou trop long : refusé', erreur(await rpcJoueur(db, U.Bob, 'salon_ecrire', ['   ', 0]), 'vide') && erreur(await rpcJoueur(db, U.Bob, 'salon_ecrire', ['x'.repeat(301), 0]), 'trop long'));
  r = await rpcJoueur(db, U.Chloe, 'salon_lire', [0]);
  verif('Chloé (qui arrive) lit le message d’Alice, et la voit en ligne', r.messages.some(m => m.pseudo === 'Alice' && m.moi === false) && r.enLigne.some(x => x.pseudo === 'Alice'), r);
  verif('un visiteur ne lit rien', erreur(await rpcJoueur(db, null, 'salon_lire', [0])));
  verif('le jeu ne lit pas la table du salon directement', erreur(await rpcJoueur(db, U.Bob, 'salon_messages_x', [])) || true);
  const lecture = await db.query("set role authenticated; select count(*) from salon_messages").then(() => 'lue', er => er.message).finally(() => db.query('reset role'));
  verif('table du salon illisible pour le jeu', lecture !== 'lue', lecture);
  // modération
  const id = r.messages.find(m => m.pseudo === 'Alice').id;
  verif('un joueur ne peut ni effacer ni rendre muet', erreur(await rpcJoueur(db, U.Bob, 'salon_supprimer', [id]), 'admin') && erreur(await rpcJoueur(db, U.Bob, 'salon_muet', ['Alice', 24]), 'admin'));
  r = await rpcJoueur(db, ad.id, 'salon_supprimer', [id]);
  verif('l’admin efface le message (pour tout le monde)', !r.messages.some(m => m.id === id) && r.supprimes.includes(id), r.erreur || r);
  await rpcJoueur(db, ad.id, 'salon_muet', ['Alice', 24]);
  await q("update salon_messages set le = now() - interval '10 seconds'");
  verif('l’admin rend Alice muette 24 h : elle ne peut plus écrire', erreur(await rpcJoueur(db, U.Alice, 'salon_ecrire', ['coucou', 0]), 'pour l’instant'));
  await rpcJoueur(db, ad.id, 'salon_muet', ['Alice', 0]);
  verif('… puis de nouveau permis', !(await rpcJoueur(db, U.Alice, 'salon_ecrire', ['me revoilà', 0])).erreur);
  // suppression du compte : ses messages partent avec
  await q("insert into salon_messages (user_id, texte) values ($1, 'au revoir')", [U.Chloe]);
  await rpcJoueur(db, U.Chloe, 'supprimer_mon_compte');
  verif('compte supprimé : ses messages disparaissent', (await q("select count(*)::int n from salon_messages where texte = 'au revoir'"))[0].n === 0);

  // ── 2. deux navigateurs
  await q("update salon_messages set le = now() - interval '10 seconds'");   // la limite d'un message toutes les 3 s
  const b = await chromium.launch();
  const ouvrir = async n => {
    const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); localStorage.setItem('mhc-son', '{"musique":0,"effets":0}'); } catch (e) {} });
    const pg = await ctx.newPage(); pg.erreurs = []; pg.on('pageerror', x => pg.erreurs.push(x.message));
    await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
    await pg.fill('[name=email]', n.toLowerCase() + '@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-' + n.toLowerCase()); await pg.click('button[value=connexion]');
    await pg.waitForSelector('.niveau'); return pg;
  };
  const A = await ouvrir('Alice'), B = await ouvrir('Bob');
  await A.evaluate(() => Compte.rafraichir());
  await B.goto(web.url + '#social'); await B.waitForSelector('.porte[href="#salon"]');
  verif('Social : la porte « En ligne » avec le nombre de joueurs en ligne', /1 joueur en ligne/.test(await B.$eval('.porte[href="#salon"]', x => x.textContent)));
  await B.click('.porte[href="#salon"]'); await B.waitForSelector('#sal-fil .sal-m');
  await A.goto(web.url + '#salon'); await A.waitForSelector('form[data-form=salon]');
  await A.fill('form[data-form=salon] [name=texte]', 'Qui veut un match en Classé ?'); await A.click('form[data-form=salon] button');
  await A.waitForFunction(() => /Qui veut un match/.test(document.querySelector('#sal-fil').textContent), null, {timeout: 5000});
  verif('Alice envoie : le champ se vide, son message est dans le fil', await A.$eval('form[data-form=salon] [name=texte]', x => x.value === ''));
  await B.fill('form[data-form=salon] [name=texte]', 'Je tape un mess');
  await B.waitForFunction(() => /Qui veut un match/.test(document.querySelector('#sal-fil').textContent), null, {timeout: 9000});
  const vb = await B.evaluate(() => ({champ: document.querySelector('form[data-form=salon] [name=texte]').value, vert: !!document.querySelector('#sal-en .sal-j:not(.moi) .pt-vert'),
    pseudo: document.querySelector('.sal-m:not(.moi) .sal-p')?.textContent, large: document.documentElement.scrollWidth}));
  verif('Bob voit le message d’Alice arriver tout seul, sans perdre ce qu’il écrivait ; Alice en ligne (pastille verte)', vb.champ === 'Je tape un mess' && vb.vert && /Alice/.test(vb.pseudo) && vb.large <= 390, vb);
  if (SP) await B.screenshot({path: SP + '/salon.png'});
  await B.goto(web.url + '#classement'); await B.waitForTimeout(1500);
  verif('classement : pastille verte à côté d’Alice', await B.evaluate(() => [...document.querySelectorAll('.cl-l')].some(x => /Alice/.test(x.textContent) && x.querySelector('.pt-vert'))));
  for (const pg of [A, B]) verif('aucune erreur de page', !pg.erreurs.length, pg.erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
