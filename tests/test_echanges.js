// Transferts (23 nov. 2026, demande de Maël) : marché à pièces, boîte à échanges, demandes au club. Serveur (règles et triche), puis
// l'écran Transferts à 390 px.   node tests/test_echanges.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, rpcJoueur, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));

(async () => {
  const web = await servir(8783), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const U = {};
  for (const [k, ps] of [['al', 'Alice'], ['bo', 'Bob'], ['ch', 'Chloe']]) {
    U[k] = (await sb.creerUtilisateur(`${k}@test.fr`, 'motdepasse-' + k)).id;
    await rpc(db, U[k], 'creer_profil', [ps, true]); await rpc(db, U[k], 'ouvrir_depart');
  }
  await q('update profils set pieces = 20000 where user_id <> $1', [ad.id]);
  const cartes = (await q("select id from cartes where actif and not legende order by id")).map(x => x.id);
  const donner = async (u, c, pal = 'bronze', note) => (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, $3, coalesce($4, case $3 when 'bronze' then 50 when 'argent' then 60 when 'or' then 75 else 90 end)) returning id", [u, c, pal, note ?? null]))[0].id;
  const pieces = async u => (await q('select pieces from profils where user_id = $1', [u]))[0].pieces;
  const proprio = async ex => (await q('select proprietaire, verrou from exemplaires where id = $1', [ex]))[0];
  // des joueurs que personne n'a encore (le booster de départ est tiré au hasard)
  const libres = (await q('select id from cartes c where actif and not legende and not exists (select 1 from exemplaires x where x.carte_id = c.id) order by id')).map(x => x.id);
  const [X, Y, Z, W, V] = libres;

  // ── 1. marché
  const exA = await donner(U.al, X, 'argent', 66);
  verif('prix sous le plancher : refusé', erreur(await rpcJoueur(db, U.al, 'marche_vendre', [exA, 150]), 'entre 200 et 1000'));
  verif('prix au-dessus du plafond : refusé', erreur(await rpcJoueur(db, U.al, 'marche_vendre', [exA, 5000]), 'entre 200 et 1000'));
  verif('vendre la carte d’un autre : refusé', erreur(await rpcJoueur(db, U.bo, 'marche_vendre', [exA, 200]), 'absente'));
  const titulaire = (await q('select equipe ->> $2 e from profils where user_id = $1', [U.al, 'DC']))[0].e;
  verif('vendre un titulaire : refusé', erreur(await rpcJoueur(db, U.al, 'marche_vendre', [titulaire, 200]), 'titulaire'));
  let r = await rpcJoueur(db, U.al, 'marche_vendre', [exA, 200]);
  verif('mise en vente : carte bloquée, visible chez les autres, pas chez soi', !r.erreur && (await proprio(exA)).verrou === 'vente' && r.marche.mes.length === 1
    && r.marche.ventes.length === 0 && (await rpcJoueur(db, U.bo, 'mes_echanges')).marche.ventes.some(v => v.carte === X && v.prix === 200 && v.vendeur === 'Alice'), r.erreur);
  const idv = (await q("select id from ventes where statut = 'ouverte'"))[0].id;
  verif('une carte en vente : ni vendue au jeu, ni fusionnée, ni alignée, ni proposée à un ami, ni remise en vente',
    erreur(await rpcJoueur(db, U.al, 'vendre', [exA])) && erreur(await rpcJoueur(db, U.al, 'marche_vendre', [exA, 300]), 'déjà en vente')
    && (await q('select carte_libre($1, $2) l', [U.al, exA]))[0].l === false);
  verif('acheter sa propre vente : refusé', erreur(await rpcJoueur(db, U.al, 'marche_acheter', [idv]), 'propre vente'));
  await q('update profils set pieces = 100 where user_id = $1', [U.bo]);
  verif('acheter sans assez de pièces : refusé', erreur(await rpcJoueur(db, U.bo, 'marche_acheter', [idv]), '200 pièces'));
  await q('update profils set pieces = 20000 where user_id = $1', [U.bo]);
  let avA = await pieces(U.al), avB = await pieces(U.bo);
  r = await rpcJoueur(db, U.bo, 'marche_acheter', [idv]);
  let e = await proprio(exA);
  verif('achat : la carte passe à l’acheteur (débloquée), il paie 200, le vendeur reçoit 180 (taxe 10 %)', !r.erreur && e.proprietaire === U.bo && !e.verrou
    && avB - await pieces(U.bo) === 200 && await pieces(U.al) - avA === 180 && r.recu === exA, r.erreur);
  verif('protection remise à neuf pour le nouveau propriétaire', (await q('select protection from exemplaires where id = $1', [exA]))[0].protection === 5);
  verif('une vente faite ne se rachète pas', erreur(await rpcJoueur(db, U.ch, 'marche_acheter', [idv]), 'plus en vente'));
  const etA = (await rpcJoueur(db, U.al, 'mon_etat'));
  verif('pastille de Social pour le vendeur, effacée en ouvrant les Transferts', etA.social.transferts === 1 && (await rpcJoueur(db, U.al, 'mes_echanges')).etat.social.transferts === 0);
  // retrait, expiration, limites
  const exR = await donner(U.al, Y, 'bronze'); await rpcJoueur(db, U.al, 'marche_vendre', [exR, 60]);
  const idr = (await q("select id from ventes where statut = 'ouverte' and exemplaire = $1", [exR]))[0].id;
  verif('retirer sa vente : carte débloquée ; retirer celle d’un autre : refusé', erreur(await rpcJoueur(db, U.bo, 'marche_retirer', [idr]))
    && !(await rpcJoueur(db, U.al, 'marche_retirer', [idr])).erreur && !(await proprio(exR)).verrou);
  await rpcJoueur(db, U.al, 'marche_vendre', [exR, 60]);
  await q("update ventes set cree_le = now() - interval '4 days' where exemplaire = $1 and statut = 'ouverte'", [exR]);
  r = await rpcJoueur(db, U.bo, 'mes_echanges');
  verif('vente de plus de 3 jours : expirée, carte rendue', !r.marche.ventes.some(v => v.carte === Y) && !(await proprio(exR)).verrou
    && (await q("select count(*)::int n from ventes where exemplaire = $1 and statut = 'expiree'", [exR]))[0].n === 1, r.marche.ventes.map(v => v.carte));
  for (let i = 0; i < 5; i++) await rpcJoueur(db, U.ch, 'marche_vendre', [await donner(U.ch, cartes[20 + i]), 50]);
  verif('6e vente ouverte : refusée (5 au plus)', erreur(await rpcJoueur(db, U.ch, 'marche_vendre', [await donner(U.ch, cartes[26]), 50]), '5 cartes'));
  const ventesC = (await q("select id from ventes where vendeur = $1 and statut = 'ouverte'", [U.ch])).map(x => x.id);
  for (const v of ventesC.slice(0, 4)) await rpcJoueur(db, U.bo, 'marche_acheter', [v]);
  verif('6e achat de la journée : refusé (5 au plus)', erreur(await rpcJoueur(db, U.bo, 'marche_acheter', [ventesC[4]]), 'déjà acheté 5'));
  const leg = (await q("select id from cartes where legende limit 1"))[0]?.id;
  if (leg) verif('une légende ne se vend pas', erreur(await rpcJoueur(db, U.al, 'marche_vendre', [await donner(U.al, leg, 'ultime', 99), 2000]), 'ne se vend pas'));

  // ── 2. boîte à échanges
  const exS = await donner(U.al, Z, 'or');
  verif('boîte : un joueur dont on n’a qu’une carte : refusé (doublons seulement)', erreur(await rpcJoueur(db, U.al, 'boite_echanger', [Z, 'or']), 'doublons'));
  await donner(U.al, Z, 'bronze');
  verif('boîte : pas de carte libre à ce palier : refusé', erreur(await rpcJoueur(db, U.al, 'boite_echanger', [Z, 'argent']), 'carte libre'));
  r = await rpcJoueur(db, U.al, 'boite_echanger', [Z, 'or']);
  verif('boîte vide : la carte d’Alice attend dans la boîte (rien reçu tout de suite)', !r.erreur && r.attente === true && !r.id && !(await proprio(exS))
    && r.boite.attente.length === 1 && (await q("select statut from boite where carte = $1", [Z]))[0]?.statut === 'attente', r.erreur || r.boite);
  // Bob dépose un doublon Or : échange immédiat avec Alice qui attendait ; Alice reçoit la carte de Bob
  await donner(U.bo, W, 'or'); await donner(U.bo, W, 'bronze');
  r = await rpcJoueur(db, U.bo, 'boite_echanger', [W, 'or']);
  let recu = r.id && (await q('select carte_id from exemplaires where id = $1', [r.id]))[0];
  verif('boîte : Bob repart tout de suite avec la carte qu’Alice avait déposée', !r.erreur && recu?.carte_id === Z, r.erreur || recu);
  verif('… et Alice, qui attendait, reçoit celle de Bob ; la boîte est vide', (await q("select count(*)::int n from exemplaires where proprietaire = $1 and carte_id = $2 and palier = 'or' and origine = 'boite'", [U.al, W]))[0].n === 1
    && (await q('select count(*)::int n from boite')).at(0).n === 0);
  await q("update boite_faits set le = le - interval '1 minute' where user_id = $1", [U.al]);   // l'échange s'est fait après son dépôt
  let etA2 = await rpcJoueur(db, U.al, 'mon_etat');
  verif('Alice est prévenue (social.boite, pastille de Social), effacé en ouvrant les Transferts', etA2.social.boite === 1 && etA2.social.transferts >= 1
    && (await rpcJoueur(db, U.al, 'mes_echanges')).etat.social.boite === 0);
  // personne ne dépose pendant une heure : le jeu sert Chloé, sa carte reste dans la boîte pour le suivant
  await q('delete from boite_faits');
  for (let i = 0; i < 7; i++) await donner(U.ch, V, 'bronze');
  r = await rpcJoueur(db, U.ch, 'boite_echanger', [V, 'bronze']);
  verif('Chloé dépose un Bronze : en attente', r.attente === true, r.erreur);
  await q("update boite set depose_le = now() - interval '59 minutes'");
  await rpcJoueur(db, U.al, 'mes_echanges');
  verif('59 minutes : toujours en attente', (await q("select statut from boite where depose_par = $1", [U.ch]))[0].statut === 'attente');
  await q("update boite set depose_le = now() - interval '61 minutes'"); await q("update boite_faits set le = now() - interval '61 minutes'");
  const nCh = (await q("select count(*)::int n from exemplaires where proprietaire = $1 and origine = 'boite'", [U.ch]))[0].n;
  etA2 = await rpcJoueur(db, U.ch, 'mon_etat');
  const servi = (await q("select carte_id, palier, note from exemplaires where proprietaire = $1 and origine = 'boite'", [U.ch]));
  verif('1 h plus tard : le jeu sert Chloé (une autre carte Bronze, au bas du palier), elle est prévenue ; sa carte reste dans la boîte, libre',
    servi.length === nCh + 1 && servi.every(x => x.palier === 'bronze' && x.carte_id !== V && x.note === 50) && etA2.social.boite === 1
    && (await q("select statut from boite where depose_par = $1", [U.ch]))[0].statut === 'libre', servi);
  // Bob dépose un Bronze : il prend tout de suite la carte libre de Chloé, la sienne la remplace
  const T = libres[5]; await donner(U.bo, T, 'bronze'); await donner(U.bo, T, 'bronze');
  r = await rpcJoueur(db, U.bo, 'boite_echanger', [T, 'bronze']);
  recu = r.id && (await q('select carte_id from exemplaires where id = $1', [r.id]))[0];
  verif('carte libre : prise tout de suite par Bob, la sienne reste libre dans la boîte (Chloé ne reçoit rien de plus)', recu?.carte_id === V
    && (await q("select statut from boite where carte = $1", [T]))[0]?.statut === 'libre'
    && (await q("select count(*)::int n from exemplaires where proprietaire = $1 and origine = 'boite'", [U.ch]))[0].n === nCh + 1, r.erreur || recu);
  for (let i = 0; i < 4; i++) await rpcJoueur(db, U.ch, 'boite_echanger', [V, 'bronze']);
  verif('boîte : 6e dépôt du jour refusé (5 au plus)', erreur(await rpcJoueur(db, U.ch, 'boite_echanger', [V, 'bronze']), '5 échanges'));

  // ── 3. demandes au club
  verif('demande sans club : refusée', erreur(await rpcJoueur(db, U.al, 'club_demander', [X, 'bronze']), 'club'));
  await rpcJoueur(db, U.al, 'club_creer', ['Les Testeurs']); const club = (await q('select id from clubs'))[0].id;
  await rpcJoueur(db, U.bo, 'club_rejoindre', [club]);
  verif('demande Ultime : refusée', erreur(await rpcJoueur(db, U.al, 'club_demander', [X, 'ultime']), 'Bronze, Argent ou Or'));
  r = await rpcJoueur(db, U.al, 'club_demander', [X, 'bronze']);
  verif('demande Bronze : 4 cartes attendues ; la suivante dans 8 h', !r.erreur && r.club.demandes[0].voulu === 4 && r.club.prochaine > 7 * 3600, r.erreur);
  verif('deuxième demande tout de suite : refusée', erreur(await rpcJoueur(db, U.al, 'club_demander', [Y, 'bronze']), 'Prochaine demande'));
  const idd = (await q('select id from club_demandes where user_id = $1', [U.al]))[0].id;
  verif('donner à sa propre demande : refusé', erreur(await rpcJoueur(db, U.al, 'club_donner', [idd]), 'propre'));
  verif('donner hors du club : refusé', erreur(await rpcJoueur(db, U.ch, 'club_donner', [idd]), 'autre club'));
  const dBob = await donner(U.bo, X, 'bronze');
  // Bob a déjà la carte X (achetée, Argent) : 2 cartes de X, il peut donner sa Bronze
  verif('le jeu de Bob voit qu’il peut donner', (await rpcJoueur(db, U.bo, 'mes_echanges')).club.demandes.find(d => d.id === idd)?.possible === true
    && (await rpcJoueur(db, U.bo, 'mon_etat')).social.clubDemandes === 1);
  avB = await pieces(U.bo);
  r = await rpcJoueur(db, U.bo, 'club_donner', [idd]);
  verif('don : la carte passe à Alice, Bob gagne 20 pièces et de l’XP', !r.erreur && (await proprio(dBob)).proprietaire === U.al && await pieces(U.bo) - avB === 20 && r.xp === 5, r.erreur);
  verif('Bob n’a plus qu’une carte de X : il ne peut plus donner (doublons seulement)', erreur(await rpcJoueur(db, U.bo, 'club_donner', [idd]), 'doublons')
    || erreur(await rpcJoueur(db, U.bo, 'club_donner', [idd]), 'carte libre'));
  for (let i = 0; i < 4; i++) await donner(U.bo, X, 'bronze');
  for (let i = 0; i < 3; i++) await rpcJoueur(db, U.bo, 'club_donner', [idd]);
  verif('demande pleine après 4 cartes : fermée', (await q('select statut, recu from club_demandes where id = $1', [idd]))[0].statut === 'pleine'
    && erreur(await rpcJoueur(db, U.bo, 'club_donner', [idd]), 'terminée'));
  await q("update club_demandes set cree_le = now() - interval '9 hours' where user_id = $1", [U.al]);
  r = await rpcJoueur(db, U.al, 'club_demander', [Y, 'or']);
  verif('8 h plus tard : demande Or possible (1 carte)', !r.erreur && r.club.demandes.find(d => d.moi).voulu === 1, r.erreur);
  await q("update club_demandes set cree_le = now() - interval '9 hours' where user_id = $1", [U.al]);
  verif('une 2e demande Or dans la semaine : refusée', erreur(await rpcJoueur(db, U.al, 'club_demander', [Y, 'or']), 'Or'));
  await q("update club_demandes set cree_le = now() - interval '25 hours' where user_id = $1 and statut = 'ouverte'", [U.al]);
  const idOr = (await q("select id from club_demandes where user_id = $1 and palier = 'or'", [U.al]))[0].id;
  await donner(U.bo, Y, 'or'); await donner(U.bo, Y, 'or');
  verif('demande de plus de 24 h : terminée', erreur(await rpcJoueur(db, U.bo, 'club_donner', [idOr]), 'terminée'));

  // ── 4. l'écran Transferts (Alice) : marché, boîte, club, historique
  await q("update club_demandes set cree_le = now() - interval '9 hours' where user_id = $1", [U.al]);
  await rpcJoueur(db, U.bo, 'club_demander', [Z, 'bronze']);   // Alice a 1 Bronze de Z (+ celle d'Alice en Or partie) → selon ses cartes
  for (let i = 0; i < 2; i++) await donner(U.al, Z, 'bronze');
  await rpcJoueur(db, U.bo, 'marche_vendre', [await donner(U.bo, cartes[40], 'or', 80), 900]);
  // un dépôt d'Alice servi pendant son absence
  await q("insert into boite_faits (user_id, donne, recu, palier, le, fini_le) values ($1, $2, $3, 'bronze', now() - interval '2 hours', now())", [U.al, X, Y]);
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SP ? 2 : 1}); await sb.brancher(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (e) {} });
  const pg = await ctx.newPage(); const erreurs = []; pg.on('pageerror', x => erreurs.push(x.message));
  await ctx.addInitScript(() => { window.__toasts = []; document.addEventListener('DOMContentLoaded', () => { const t = document.querySelector('#toast');
    if (t) new MutationObserver(() => window.__toasts.push(t.textContent)).observe(t, {childList: true, characterData: true, subtree: true}); }); });
  await pg.goto(web.url); await pg.waitForSelector('form[data-form=connexion]');
  await pg.fill('[name=email]', 'al@test.fr'); await pg.fill('[name=mdp]', 'motdepasse-al'); await pg.click('button[value=connexion]');
  await pg.waitForSelector('.niveau');
  const tBoite = await pg.waitForFunction(() => (window.__toasts || []).some(t => /Boîte à échanges : ton échange est fait/.test(t)), null, {timeout: 6000}).then(() => true, () => false);
  verif('à l’arrivée dans le jeu : « Boîte à échanges : ton échange est fait ! »', tBoite, await pg.evaluate(() => window.__toasts));
  await pg.goto(web.url + '#social'); await pg.waitForSelector('.porte');
  verif('Social : pastille sur Transferts (une demande du club que je peux remplir)', await pg.$eval('a[href="#marche"]', a => !!a.querySelector('.pastille')));
  await pg.goto(web.url + '#marche'); await pg.waitForSelector('.tr-ong');
  let v = await pg.evaluate(() => ({ong: [...document.querySelectorAll('.tr-ong button')].map(x => x.textContent.trim()), ventes: document.querySelectorAll('.mk-o').length,
    large: document.documentElement.scrollWidth, h: document.querySelectorAll('.tr-h').length}));
  verif(`3 onglets (Marché, Boîte, Club), ${v.ventes} carte(s) en vente, historique, pas de débordement à 390 px`, v.ong.length === 3 && v.ventes >= 1 && v.h >= 1 && v.large <= 390, v);
  if (SP) await pg.screenshot({path: SP + '/tr-marche.png', fullPage: true});
  // acheter la carte Or de Bob
  avA = await pieces(U.al);
  await pg.click('.mk-o:has-text("900") [data-acheter]'); await pg.waitForSelector('.dmd'); await pg.click('.dmd-oui');
  await pg.waitForFunction(() => /rejoint ton club/.test(document.querySelector('#toast')?.textContent || ''), null, {timeout: 8000}).catch(() => {});
  verif('« Acheter » : la carte est à Alice, 900 pièces payées', avA - await pieces(U.al) === 900);
  // vendre une carte
  await pg.click('[data-act="mk-vendre"]'); await pg.waitForSelector('[data-mk-choisir]');
  await pg.click('[data-mk-choisir]'); await pg.waitForSelector('.mk-pr');
  const borne = await pg.$eval('.mk-pr input[type=number]', i => +i.max);
  await pg.fill('.mk-pr input[type=number]', String(borne));
  const gainTxt = await pg.$eval('#mk-gain', x => x.textContent);
  if (SP) await pg.screenshot({path: SP + '/tr-prix.png'});
  await pg.click('[data-mk-mettre]'); await pg.waitForTimeout(800);
  verif(`« Mettre en vente » au prix maximum (${borne}, gain affiché ${gainTxt})`, (await q("select count(*)::int n from ventes where vendeur = $1 and statut = 'ouverte' and prix = $2", [U.al, borne]))[0].n === 1
    && gainTxt.replace(/\D/g, '') === String(Math.floor(borne * .9)));
  // boîte
  await pg.click('[data-tr-onglet="boite"]'); await pg.waitForSelector('[data-boite]');
  if (SP) await pg.screenshot({path: SP + '/tr-boite.png', fullPage: true});
  const nb0 = (await q('select count(*)::int n from boite_faits where user_id = $1', [U.al]))[0].n;
  await pg.click('[data-boite]'); await pg.waitForSelector('.dmd'); await pg.click('.dmd-oui');
  await pg.waitForFunction(() => document.querySelector('.ob-pack, .ob-c') || /dans la boîte/.test(document.querySelector('#toast')?.textContent || ''), null, {timeout: 8000}).catch(() => {});
  const scene = !!(await pg.$('.ob-pack, .ob-c')), toastB = await pg.$eval('#toast', x => x.textContent);
  verif(`« Déposer » : dépôt fait, ${scene ? 'échange immédiat, la carte reçue se dévoile comme un booster' : `en attente (« ${toastB} »)`}`,
    (await q('select count(*)::int n from boite_faits where user_id = $1', [U.al]))[0].n === nb0 + 1 && (scene || /dans la boîte/.test(toastB)));
  await pg.goto(web.url + '#marche'); await pg.reload(); await pg.waitForSelector('.tr-ong');
  // club : donner à Bob
  await pg.click('[data-tr-onglet="club"]'); await pg.waitForSelector('.dm-l');
  if (SP) await pg.screenshot({path: SP + '/tr-club.png', fullPage: true});
  avA = await pieces(U.al);
  await pg.click('[data-donner]:not([disabled])'); await pg.waitForTimeout(900);
  verif('« Donner » : la carte passe à Bob, Alice gagne 20 pièces', await pieces(U.al) - avA === 20
    && (await q('select recu from club_demandes where user_id = $1 and statut = $2', [U.bo, 'ouverte']))[0]?.recu === 1);
  // nouvelle demande depuis l'écran
  await pg.click('[data-act="dm-demander"]'); await pg.waitForSelector('[data-demander]');
  await pg.click('[data-dm-palier="argent"]'); await pg.fill('[data-dm-recherche]', (await q('select nom from cartes where id = $1', [W]))[0].nom.slice(0, 5));
  await pg.click('[data-demander]'); await pg.waitForTimeout(800);
  verif('« Demander une carte » Argent : demande de 2 cartes envoyée au club', (await q("select voulu from club_demandes where user_id = $1 and statut = 'ouverte'", [U.al]))[0]?.voulu === 2);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); process.exit(bilan() ? 1 : 0);
})();
