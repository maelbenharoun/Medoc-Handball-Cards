// Compos enregistrées (demande de Rémi, 23 nov. 2026) : 3 emplacements (titulaires, remplaçants, capitaine, tactique, staff) ;
// un joueur fusionné revient avec son meilleur exemplaire, un joueur qui n'est plus au club est signalé. Serveur, puis l'onglet Équipe (390 px).
//   node tests/test_compos.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const meme = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));
const POSTES = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'];

(async () => {
  const web = await servir(8782), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const prof = async () => (await q('select equipe, remplacants, capitaine, tactique, staff, compos from profils where user_id = $1', [al.id]))[0];
  // un banc, un capitaine, une tactique, une carte staff
  const eq1 = (await prof()).equipe, pris = new Set((await q('select carte_id from exemplaires where proprietaire = $1', [al.id])).map(x => x.carte_id)), remp = {};
  for (const k of POSTES) {
    const c = (await q(`select id from cartes where actif and not legende and ($1 = 'GB' and 'GB' = any(postes) or $1 <> 'GB' and $1 = any(postes)) and not (id = any($2)) order by id limit 1`, [k, [...pris]]))[0].id;
    pris.add(c); remp[k] = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'argent', 65) returning id", [al.id, c]))[0].id;
  }
  await rpcJoueur(db, al.id, 'aligner_remplacants', [JSON.stringify(eq1), JSON.stringify(remp)]);
  await rpcJoueur(db, al.id, 'choisir_capitaine', [eq1.DC]);
  await rpcJoueur(db, al.id, 'choisir_tactique', ['rapide:33']);
  await q("insert into staff_cartes (user_id, staff, palier) values ($1, 'adjoint', 'or')", [al.id]);
  await rpcJoueur(db, al.id, 'choisir_staff', ['adjoint']);

  // ── 1. serveur
  verif('compo vide : refusée', erreur(await rpcJoueur(db, al.id, 'compo_charger', [1]), 'vide'));
  verif('emplacement 0 ou 4 : refusé', erreur(await rpcJoueur(db, al.id, 'compo_enregistrer', [0]), 'Emplacement') && erreur(await rpcJoueur(db, al.id, 'compo_charger', [4]), 'Emplacement'));
  verif('visiteur : refusé', erreur(await rpcJoueur(db, null, 'compo_enregistrer', [1])));
  let r = await rpcJoueur(db, al.id, 'compo_enregistrer', [2]);
  let c = (await prof()).compos;
  verif('compo 2 enregistrée : 7 titulaires, 7 remplaçants, capitaine, tactique, staff ; les autres emplacements vides', !r.erreur && c.length === 3 && c[0] === null && c[2] === null
    && Object.keys(c[1].equipe).length === 7 && Object.keys(c[1].remplacants).length === 7 && c[1].capitaine && c[1].tactique === 'rapide:33' && c[1].staff === 'adjoint', r.erreur || c);
  verif('l’état du jeu reçoit les compos', (r.etat?.compos || [])[1]?.tactique === 'rapide:33');
  // on change tout : équipe et banc échangés, autre tactique, plus de staff, plus de capitaine
  await rpcJoueur(db, al.id, 'aligner_remplacants', [JSON.stringify(remp), JSON.stringify(eq1)]);
  await rpcJoueur(db, al.id, 'choisir_tactique', ['duels:06']); await rpcJoueur(db, al.id, 'choisir_staff', [null]);
  r = await rpcJoueur(db, al.id, 'compo_charger', [2]);
  let p = await prof();
  verif('compo 2 chargée : titulaires, banc, capitaine, tactique et staff retrouvés', !r.erreur && meme(p.equipe, eq1) && meme(p.remplacants, remp)
    && p.capitaine === eq1.DC && p.tactique === "rapide:33" && p.staff === "adjoint" && r.manquants.length === 0, r.erreur || p);
  // le DC a été fusionné (son exemplaire n'existe plus, un autre exemplaire du même joueur est au club) ; l'AG n'est plus au club
  const dc = (await q('select carte_id from exemplaires where id = $1', [eq1.DC]))[0].carte_id;
  const nouveauDC = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'or', 80) returning id", [al.id, dc]))[0].id;
  const agNom = (await q('select c.nom from exemplaires x join cartes c on c.id = x.carte_id where x.id = $1', [eq1.AG]))[0].nom;
  await q("update profils set equipe = '{}', remplacants = '{}', capitaine = null where user_id = $1", [al.id]);
  await q('delete from exemplaires where id = any($1::uuid[])', [[eq1.DC, eq1.AG]]);
  r = await rpcJoueur(db, al.id, 'compo_charger', [2]);
  p = await prof();
  verif(`joueur fusionné : son meilleur exemplaire prend sa place (et reste capitaine) ; joueur parti : signalé (${(r.manquants || []).join(', ')})`,
    !r.erreur && p.equipe.DC === nouveauDC && p.capitaine === nouveauDC && !p.equipe.AG && r.manquants.includes(agNom) && Object.keys(p.equipe).length === 6, r.erreur || {p, m: r.manquants});
  await rpcJoueur(db, al.id, 'compo_enregistrer', [1]);
  verif('compo 1 enregistrée à son tour, la 2 reste', (await prof()).compos[0] && (await prof()).compos[1]);

  // ── 2. l'onglet Équipe
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (e) {} });
  const pg = await ctx.newPage(); const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
  await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
  await pg.fill('[name=email]', 'alice@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-alice'); await pg.click('button[value=connexion]');
  await pg.waitForSelector('.niveau');
  await pg.goto(web.url + '#equipe'); await pg.waitForSelector('.compos');
  const v = await pg.evaluate(() => ({n: document.querySelectorAll('.compo').length, vides: document.querySelectorAll('.compo.vide').length, charger: document.querySelectorAll('[data-compo-charger]').length,
    txt: document.querySelector('.compos').textContent, large: document.documentElement.scrollWidth}));
  verif(`3 emplacements, 2 remplis (« Charger »), 1 vide ; pas de débordement`, v.n === 3 && v.vides === 1 && v.charger === 2 && /Jeu rapide \+ 3-3/.test(v.txt) && v.large <= 390, v);
  await pg.evaluate(() => document.querySelector('.compos').scrollIntoView({block: 'center'}));
  if (SP) await pg.screenshot({path: SP + '/compos-1.png'});
  await pg.click('[data-compo-enr="3"]'); await pg.waitForFunction(() => !document.querySelector('.compo:nth-child(3)').classList.contains('vide'), null, {timeout: 8000}).catch(() => {});
  verif('« Enregistrer » sur l’emplacement vide : compo 3 enregistrée', !!(await prof()).compos[2]);
  await pg.click('[data-compo-enr="1"]'); await pg.waitForSelector('.dmd'); await pg.click('.dmd-non'); await pg.waitForTimeout(300);
  verif('« Remplacer » demande d’abord une confirmation', !!(await pg.$('[data-compo-enr="1"]')));
  // on vide l'équipe côté serveur puis on charge la compo 2 depuis l'écran
  await q("update profils set equipe = '{}', remplacants = '{}' where user_id = $1", [al.id]);
  await pg.click('[data-compo-charger="2"]'); await pg.waitForTimeout(1200);
  const t = await pg.evaluate(() => ({toast: document.querySelector('.toast')?.textContent || document.body.innerText.match(/Compo 2 chargée[^\n]*/)?.[0] || '', vig: document.querySelectorAll('.pitch .vig').length}));
  verif(`« Charger » : l’équipe revient sur le terrain et le joueur parti est signalé (« ${t.toast} »)`, t.vig >= 6 && /Compo 2 chargée/.test(t.toast) && t.toast.includes(agNom), t);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
