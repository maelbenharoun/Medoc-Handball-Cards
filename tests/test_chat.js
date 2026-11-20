// Messages entre ami(e)s (390 px) : la relève des nouveaux messages (toutes les 40 s) ne doit pas effacer le message en cours d'écriture
// (retour de Rémi, 20 nov. 2026, iPhone : « t'as 30 s pour envoyer un message via le chat sinon ça reset »).
//   node tests/test_chat.js
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();

(async () => {
  const web = await servir(8798), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const bo = await sb.creerUtilisateur('bob@test.fr', 'motdepasse-bob');
  await rpc(db, bo.id, 'creer_profil', ['Bob', true]); await rpc(db, bo.id, 'ouvrir_depart');
  await rpc(db, al.id, 'ajouter_ami', ['Bob']); await rpc(db, bo.id, 'ajouter_ami', ['Alice']);
  await rpc(db, bo.id, 'envoyer_message', ['Alice', 'Salut !']);
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 390, height: 844}}); await sb.brancher(ctx);
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  await p.evaluate(() => { SOC.conv = null; conversationAmi('Bob'); });
  await p.waitForFunction(() => document.querySelector('#fil-msg')?.textContent.includes('Salut'));
  await p.click('form[data-form=message] [name=texte]'); await p.keyboard.type('Je suis en train d’écr');
  // Bob répond pendant qu'Alice écrit, puis la relève passe (la même que celle du minuteur de 40 s)
  await rpc(db, bo.id, 'envoyer_message', ['Alice', 'Tu joues ce soir ?']);
  await p.evaluate(() => Compte.conversation('Bob').then(c => { SOC.conv = c; majConversation(); }));
  await p.waitForFunction(() => document.querySelector('#fil-msg')?.textContent.includes('ce soir'));
  const etat = await p.evaluate(() => ({valeur: document.querySelector('form[data-form=message] [name=texte]').value,
    focus: document.activeElement?.name === 'texte', n: document.querySelectorAll('#fil-msg .msg').length}));
  verif('le nouveau message de Bob apparaît dans le fil', etat.n === 2, etat);
  verif('le message en cours d’écriture reste, le champ garde la main', etat.valeur === 'Je suis en train d’écr' && etat.focus, etat);
  await p.keyboard.type('ire'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('#fil-msg .msg').length === 3);
  const apres = await p.evaluate(() => ({valeur: document.querySelector('form[data-form=message] [name=texte]').value, dernier: [...document.querySelectorAll('#fil-msg .msg')].pop().textContent}));
  verif('envoyé : le message est dans le fil et le champ est vidé', apres.valeur === '' && apres.dernier.includes('Je suis en train d’écrire'), apres);
  verif('serveur : 3 messages', +(await q('select count(*) n from messages_amis'))[0].n === 3);
  verif('aucune erreur de page', !erreurs.length, erreurs);
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
