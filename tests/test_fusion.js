// Fusion depuis la fiche d'un joueur (390 px) : après l'animation de montée, on revient sur sa fiche (retour de Maël, 14 nov. 2026 :
// « ça sort du menu fusion, ça me paraîtrait mieux d'y rester »), y compris quand la fiche venait du choix d'un poste.
//   node tests/test_fusion.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];

(async () => {
  const web = await servir(8799), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  await q('update profils set pieces = 50000 where user_id = $1', [al.id]);
  const cartes = (await q("select id from cartes where actif and poste <> 'GB' and id not in (select carte_id from exemplaires where proprietaire = $1) order by id limit 2", [al.id])).map(x => x.id);
  for (const c of cartes) for (let i = 0; i < 6; i++) await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'bronze', 50)", [al.id, c]);
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}}); await sb.brancher(ctx);
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  const fusionner = async () => { await p.click(`[data-fusion="${cartes[0]}:bronze"]`); await p.waitForSelector('.mt-bas button', {timeout: 15000});
    await p.waitForTimeout(400); await p.click('.mt-bas button'); await p.waitForSelector('.sheet.fiche', {timeout: 5000}).catch(() => {}); };
  // 1. la fiche telle qu'on l'ouvre en touchant la carte dans le Club
  await p.goto(web.url + '#club'); await p.waitForTimeout(500);
  await p.evaluate(c => fiche(c), cartes[0]); await p.waitForSelector('.sheet.fiche');
  const nom = (await p.textContent('.fiche h3')).split(/\s{2,}|\n/)[0].trim();
  await fusionner();
  let etat = await p.evaluate(() => ({fiche: !!document.querySelector('#overlay:not([hidden]) .sheet.fiche'), titre: document.querySelector('.fiche h3')?.textContent || '',
    argent: (document.querySelector('.fiche')?.textContent || '').includes('Argent'), bouton: !!document.querySelector('[data-fusion$=":bronze"]')}));
  verif('après la fusion : on revient sur la fiche du joueur', etat.fiche && etat.titre.includes(nom), etat);
  verif('la fiche est à jour : l’Argent obtenu, et on peut refusionner les 3 Bronze restants', etat.argent && etat.bouton, etat);
  await fusionner();
  verif('deuxième fusion à la suite, sans quitter la fiche', !!(await p.$('#overlay:not([hidden]) .sheet.fiche')) && +(await q("select count(*) n from exemplaires where proprietaire = $1 and carte_id = $2 and palier = 'argent'", [al.id, cartes[0]]))[0].n === 2);
  if (SP) await p.screenshot({path: SP + '/fusion-fiche.png'});
  // 2. depuis le choix d'un poste (Équipe) : le retour vers le poste reste
  await p.click('[data-act=fermer]').catch(() => p.keyboard.press('Escape'));
  await p.evaluate(c => fiche(c, 'AG'), cartes[0]); await p.waitForSelector('.fiche .retour');
  const avantRetour = (await p.textContent('.fiche .retour')).trim();
  // plus de Bronze à fusionner pour la première carte : on prend la seconde
  if (!(await p.$(`[data-fusion^="${cartes[0]}:"]`))) { await p.evaluate(c => fiche(c, 'AG'), cartes[1]); await p.waitForSelector(`[data-fusion="${cartes[1]}:bronze"]`); cartes[0] = cartes[1]; }
  await fusionner();
  verif('fiche ouverte depuis un poste : après la fusion, le retour « ‹ Poste AG » est toujours là', (await p.textContent('.fiche .retour').catch(() => '')).trim() === avantRetour && avantRetour === '‹ Poste AG', avantRetour);
  verif('une seule couche ouverte (la fiche) après trois fusions', await p.evaluate(() => COUCHES.length === 1 && retoursIgnores === 0));
  // 3. le bouton retour du téléphone ferme la fiche (une seule couche, pas de couche fantôme)
  await p.goBack(); await p.waitForSelector('#overlay', {state: 'hidden'});
  verif('retour du téléphone : la fiche se ferme, on reste dans le jeu', !(await p.$('.sheet.fiche')) && !!(await p.$('.tabs')));
  // 4. report de l'entraînement (demande de Maël, 20 nov. 2026) : Or 89 + deux Or 75 → Ultime 94 (moitié de 14 × 200 XP, à 300 XP le point)
  const c3 = (await q("select id from cartes where actif and poste <> 'GB' and id <> all($1) order by id limit 1", [cartes]))[0].id;
  await q("delete from exemplaires where proprietaire = $1 and carte_id = $2", [al.id, c3]);
  await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'or', 89), ($1, $2, 'or', 75), ($1, $2, 'or', 75)", [al.id, c3]);
  await p.evaluate(() => Compte.rafraichir()); await p.waitForTimeout(300);
  await p.evaluate(c => fiche(c), c3); await p.waitForSelector(`[data-fusion="${c3}:or"]`);
  const txt = await p.textContent(`[data-fusion="${c3}:or"]`);
  verif('le bouton annonce la note gardée : Ultime 94', txt.includes('Ultime 94'), txt);
  await p.click(`[data-fusion="${c3}:or"]`); await p.waitForSelector('.mt-bas button', {timeout: 15000}); await p.waitForTimeout(400); await p.click('.mt-bas button');
  const u = await q("select note, xp from exemplaires where proprietaire = $1 and carte_id = $2 and palier = 'ultime'", [al.id, c3]);
  verif('serveur : la carte fusionnée garde la moitié de l’entraînement (Ultime 94, 200 XP)', u.length === 1 && u[0].note === 94 && u[0].xp === 200, u);
  await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'bronze', 50), ($1, $2, 'bronze', 50), ($1, $2, 'bronze', 50)", [al.id, c3]);
  const r0 = await rpc(db, al.id, 'fusionner', [c3, 'bronze']);
  verif('sans entraînement, rien ne change : Argent 60', (await q('select note from exemplaires where id = $1', [r0.id]))[0].note === 60);
  // 5. Club : filtre par poste, combiné avec l'équipe
  await p.click('[data-act=fermer]').catch(() => {}); await p.goto(web.url + '#club'); await p.waitForSelector('[data-fposte="PIV"]');
  await p.click('[data-fposte="PIV"]'); await p.waitForTimeout(200);
  const filtreOk = await p.evaluate(() => [...document.querySelectorAll('.grid .card')].length > 0 && CARTES.filter(c => (c.postes?.length ? c.postes : [c.poste]).includes('PIV') && c.actif !== false).length >= document.querySelectorAll('.grid > .cg, .grid > .card').length);
  const larges = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  verif('Club : le filtre PIV ne garde que des pivots, sans déborder à 390 px', filtreOk && larges);
  await p.click('[data-filtre="SF1"]'); await p.waitForTimeout(200);
  const combine = await p.evaluate(() => document.querySelector('[data-fposte="PIV"]').classList.contains('on') && document.querySelector('[data-filtre="SF1"]').classList.contains('on'));
  verif('le filtre de poste reste quand on change d’équipe', combine);
  if (SP) await p.screenshot({path: SP + '/club-postes.png'});
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
