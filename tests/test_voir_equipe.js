// « Voir l'équipe » depuis le classement : ce que le serveur renvoie (equipe_publique), puis la fenêtre dans le navigateur (390 px).
//   node tests/test_voir_equipe.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8798), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice'), bo = await sb.creerUtilisateur('bob@test.fr', 'motdepasse-bob');
  for (const [u, n] of [[al, 'Alice'], [bo, 'Bob']]) { await rpc(db, u.id, 'creer_profil', [n, true]); await rpc(db, u.id, 'ouvrir_depart'); }
  await q("update profils set pieces = 98765 where user_id = $1", [al.id]);
  await rpcJoueur(db, al.id, 'choisir_tactique', ['rapide:33']);
  const eqA = (await q('select equipe from profils where user_id = $1', [al.id]))[0].equipe;
  await q('update profils set capitaine = $2 where user_id = $1', [al.id, eqA.DC]);

  // ── 1. le serveur
  let r = await rpcJoueur(db, bo.id, 'equipe_publique', ['alice']);
  const attendu = (await q('select force_equipe($1, $2) r', [JSON.stringify(eqA), 'rapide:33']))[0].r;   // fonction interne : appelée directement
  verif('Bob voit les 7 alignés d’Alice (pseudo sans majuscule)', r.pseudo === 'Alice' && r.joueurs?.length === 7 && !r.moi, r.erreur || r);
  verif('note d’équipe et notes par poste = celles du match (force_equipe)', r.note === attendu.note && r.collectif === attendu.collectif && JSON.stringify(r.notes) === JSON.stringify(attendu.notes), {r: r.note, attendu: attendu.note});
  verif('tactique et capitaine', r.tactique === 'rapide:33' && r.joueurs.filter(j => j.capitaine).map(j => j.poste).join() === 'DC');
  verif('rien de privé : ni pièces, ni identifiant, ni cartes hors équipe', !JSON.stringify(r).includes('98765') && !JSON.stringify(r).includes(al.id)
    && Object.keys(r).sort().join() === 'collectif,groupe,joueurs,moi,niveau,note,notes,perso,poule,pseudo,staff,tactique', Object.keys(r));
  verif('joueur inconnu : refusé', erreur(await rpcJoueur(db, bo.id, 'equipe_publique', ['Personne']), 'introuvable'));
  verif('visiteur non connecté : refusé', erreur(await rpcJoueur(db, null, 'equipe_publique', ['Alice'])));
  verif('sa propre équipe : marquée « moi »', (await rpcJoueur(db, al.id, 'equipe_publique', ['Alice'])).moi === true);
  // une légende alignée se voit, avec sa carte (le jeu ne l'a pas dans son catalogue)
  const leg = (await q("select id from cartes where poste <> 'GB' and id not in (select carte_id from exemplaires where proprietaire = $1) order by id limit 1", [al.id]))[0].id;
  await q('update cartes set legende = true, actif = false where id = $1', [leg]);
  const exL = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'ultime', 100) returning id", [al.id, leg]))[0].id;
  eqA.AG = exL; await q('update profils set equipe = $2 where user_id = $1', [al.id, JSON.stringify(eqA)]);
  r = await rpcJoueur(db, bo.id, 'equipe_publique', ['Alice']);
  const jl = r.joueurs.find(j => j.poste === 'AG');
  verif('légende alignée : visible, avec sa carte et sa note de 100', r.joueurs.length === 7 && jl?.carte === leg && jl.note === 100 && jl.legende?.id === leg && jl.legende.legende === true && typeof r.note === 'number', jl);
  verif('les autres joueurs n’ont pas de carte jointe', r.joueurs.filter(j => j.poste !== 'AG').every(j => j.legende === null));
  // équipe incomplète : pas de note
  delete eqA.PIV; await q('update profils set equipe = $2 where user_id = $1', [al.id, JSON.stringify(eqA)]);
  r = await rpcJoueur(db, bo.id, 'equipe_publique', ['Alice']);
  verif('équipe incomplète (6/7) : 6 joueurs, pas de note d’équipe', r.joueurs.length === 6 && r.note === null);
  eqA.PIV = (await q("select id from exemplaires where proprietaire = $1 and id not in (select value::uuid from jsonb_each_text($2::jsonb)) limit 1", [al.id, JSON.stringify(eqA)]))[0]?.id;
  if (!eqA.PIV) { const c = (await q("select id from cartes where actif and id not in (select carte_id from exemplaires where proprietaire = $1) limit 1", [al.id]))[0].id;
    eqA.PIV = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'or', 80) returning id", [al.id, c]))[0].id; }
  await q('update profils set equipe = $2 where user_id = $1', [al.id, JSON.stringify(eqA)]);
  // une carte staff placée
  await q("insert into staff_cartes (user_id, staff, palier) values ($1, 'gardiens', 'or')", [al.id]); await q("update profils set staff = 'gardiens' where user_id = $1", [al.id]);
  r = await rpcJoueur(db, bo.id, 'equipe_publique', ['Alice']);
  verif('carte staff placée : son id et son palier', r.staff?.id === 'gardiens' && r.staff.palier === 'or', r.staff);

  // ── 2. le jeu
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('dialog', d => d.accept());
  p.on('console', m => m.type() === 'error' && !/status of 40[0-6]/.test(m.text()) && erreurs.push(m.text()));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'bob@test.fr'); await p.fill('[name=mdp]', 'motdepasse-bob'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  await p.goto(web.url + '#classement'); await p.waitForSelector('.cl-l');
  verif('classement : chaque ligne propose « Équipe › »', (await p.$$('.cl-l')).length === 3 && (await p.$$('.cl-l .cl-eq')).length === 3 && /voir son équipe/.test(await p.textContent('#view')));
  verif('classement : pas de débordement', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (SP) await p.screenshot({path: SP + '/ve-1-classement.png'});
  await p.click('.cl-l[data-voir-equipe="Alice"]'); await p.waitForSelector('.eq-de .pitch');
  const vue = await p.evaluate(() => ({titre: document.querySelector('.eq-de h3').textContent, vig: document.querySelectorAll('.eq-de .pitch .vig').length,
    cartes: document.querySelectorAll('.eqde-c .card').length, legende: document.querySelectorAll('.eqde-c .card.legende').length, note: document.querySelector('.eq-de .teamnote .stat b').textContent,
    tac: document.querySelector('.eqde-tac').textContent, staff: !!document.querySelector('.eqde-staff .card.staff'), cap: document.querySelectorAll('.eq-de .pitch .cap').length,
    deborde: document.documentElement.scrollWidth > innerWidth}));
  verif('fenêtre « Équipe de Alice » : 7 vignettes sur le terrain, 7 cartes dont la légende', vue.titre === 'Équipe de Alice' && vue.vig === 7 && vue.cartes === 7 && vue.legende === 1, vue);
  verif('note d’équipe = celle du serveur, tactique Jeu rapide / 3-3, staff, capitaine', vue.note === String(r.note) && vue.tac === 'Jeu rapide3-3' && vue.staff && vue.cap === 1, vue);
  verif('pas de débordement (fenêtre)', !vue.deborde);
  if (SP) { await p.screenshot({path: SP + '/ve-2-equipe.png'}); await (await p.$('.eq-de')).screenshot({path: SP + '/ve-3-equipe-entiere.png'}); }
  // une carte (pas la légende) ouvre sa fiche, avec le retour vers l'équipe
  await p.click('button.eqde-c'); await p.waitForSelector('.sheet.fiche');
  verif('toucher une carte : sa fiche, avec « ‹ Équipe de Alice »', (await p.textContent('.fiche .retour')).trim() === '‹ Équipe de Alice');
  await p.click('.fiche .retour'); await p.waitForSelector('.eq-de .pitch');
  verif('retour : l’équipe d’Alice revient', (await p.textContent('.eq-de h3')) === 'Équipe de Alice');
  verif('la légende n’ouvre pas de fiche (pas de bouton)', await p.evaluate(() => [...document.querySelectorAll('.eqde-c')].some(x => x.tagName === 'DIV' && x.querySelector('.card.legende'))));
  await p.click('[data-act=fermer]'); await p.waitForSelector('#overlay', {state: 'hidden'});
  verif('fermer : retour au classement', !!(await p.$('.cl-l')));
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
