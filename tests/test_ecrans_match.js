// Le match en direct tient dans l'écran, quelle que soit sa taille (Maël, 21 nov. 2026 : sur PC on ne voyait pas le bas) : au coup
// d'envoi, le bouton du panneau est visible ; en jeu, le score, tout le terrain et la barre du bas sont dans l'écran.
//   node tests/test_ecrans_match.js [dossier des captures]
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const SP = process.argv[2];
const TAILLES = [[1280, 720, 'pc720'], [1366, 768, 'pc768'], [1440, 900, 'pc900'], [1920, 1080, 'pc1080'], [1280, 600, 'pc600'], [768, 1024, 'tablette'], [390, 844, 'tel'], [360, 640, 'petit'], [844, 390, 'paysage']];
(async () => {
  const web = await servir(8783), sb = await FS.demarrer(), db = sb.db;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const ad = await sb.creerUtilisateur('mael@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 1000, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0}'`);
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]); await rpc(db, al.id, 'ouvrir_depart');
  const b = await chromium.launch();
  for (const [w, h, nom] of TAILLES) {
    await q('delete from matchs_direct'); await q('update profils set matchs = 5 where user_id = $1', [al.id]);
    const ctx = await b.newContext({viewport: {width: w, height: h}}); await sb.brancher(ctx);
    await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toISOString().slice(0, 10)); } catch (e) {} });
    const p = await ctx.newPage();
    await p.goto(web.url); await p.waitForSelector('form[data-form=connexion]');
    await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
    await p.waitForSelector('.niveau');
    await p.goto(web.url + '#championnat'); await p.waitForSelector('[data-act=championnat]');
    await p.click('[data-act=championnat]'); await p.waitForSelector('.md-panneau:not([hidden])');
    const mesure = () => p.evaluate(() => {
      const H = innerHeight, r = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return {top: Math.round(b.top), bottom: Math.round(b.bottom)}; };
      const pan = document.querySelector('.md-panneau:not([hidden]) .md-p-c');
      return {H, bas: r('.md-bas'), terrain: r('.md-terrain') || r('.md-pitch'), panneau: pan && {bottom: Math.round(pan.getBoundingClientRect().bottom), defile: pan.scrollHeight > pan.clientHeight + 2,
        bouton: Math.round(document.querySelector('.md-panneau:not([hidden]) [data-md-go=jouer]')?.getBoundingClientRect().bottom || -1)},
        pageDefile: document.documentElement.scrollHeight > H + 2};
    });
    await p.waitForTimeout(800); const m1 = await mesure();
    if (SP) await p.screenshot({path: SP + `/md-${nom}-envoi.png`});
    await p.click('[data-md-go=jouer]'); await p.waitForTimeout(2500);
    const m2 = await mesure();
    if (SP) await p.screenshot({path: SP + `/md-${nom}-jeu.png`});
    const haut = await p.evaluate(() => Math.round(document.querySelector('.md-haut').getBoundingClientRect().top));
    verif(`${nom} (${w}×${h}) : bouton du coup d'envoi visible ; en jeu, score, terrain et barre du bas dans l'écran`,
      m1.panneau && m1.panneau.bouton <= m1.H && m2.bas && m2.bas.bottom <= m2.H && m2.terrain && m2.terrain.top >= 0 && m2.terrain.bottom <= m2.bas.top && haut >= 0,
      {envoi: m1.panneau, bas: m2.bas, terrain: m2.terrain, haut, H: m2.H});
    await ctx.close();
  }
  await b.close(); await web.fermer();
  process.exit(bilan() ? 1 : 0);
})();
