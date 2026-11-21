// 2 équipes par joueur et légendes de toutes les équipes (demande de Maël, 21 nov. 2026) : publication par l'outil, collectif
// (serveur force_equipe = jeu collectifDe), booster d'équipe, albums. Serveur (PGlite) et cartes.js.
//   node tests/test_equipes.js
const fs = require('fs');
const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs, REPO} = require('./base');
const {verif, bilan} = verifs();
const C = new Function(fs.readFileSync(REPO + '/cartes.js', 'utf8') + '; return {collectifDe, equipesDe, coequipiers, libelleEquipes, fusionnerCarte};')();

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  const cat = lignesCatalogue();
  // une carte de SF1 qui joue aussi en ZZ (une équipe où elle est seule), réglée comme le ferait l'outil ; une 3e équipe est ignorée
  const base = cat.find(c => c.equipe === 'SF1' && c.poste !== 'GB');
  const rg = {...(base.reglages || {}), equipes: ['SF1', 'ZZ', 'SG1']};
  const c2 = C.fusionnerCarte(base.site, rg);
  verif('cartes.js : au plus 2 équipes, la première = principale', c2.equipe === 'SF1' && JSON.stringify(c2.equipes) === '["SF1","ZZ"]' && C.libelleEquipes(c2) === 'SF1/ZZ', c2.equipes);
  const lignes = cat.map(c => c.id === base.id ? {...c, reglages: rg, equipe: c2.equipe, equipes: ['SF1', 'ZZ', 'SG1']} : c);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignes), true]);
  const ligne = (await q('select equipe, equipes from cartes where id = $1', [base.id]))[0];
  verif('serveur : 2 équipes enregistrées (la 3e ignorée)', ligne.equipe === 'SF1' && JSON.stringify(ligne.equipes) === '["SF1","ZZ"]', ligne);
  // booster d'équipe et album de ZZ : la carte à 2 équipes y est
  const al = await nouvelUtilisateur(db);
  await rpcJoueur(db, al, 'creer_profil', ['Alice', true]); await rpcJoueur(db, al, 'ouvrir_depart');
  await q('update profils set pieces = 100000 where user_id = $1', [al]);
  const r = await rpcJoueur(db, al, 'ouvrir_booster_equipe', ['ZZ']);
  const tire = r.erreur ? null : (await q('select carte_id from exemplaires where id = $1', [r.ids[0]]))[0]?.carte_id;
  verif('booster de ZZ : la carte qui joue aussi en ZZ', tire === base.id, r.erreur || tire);
  const alb = (await q('select albums_vue($1) a', [al]))[0].a.filter(a => a.equipe === 'ZZ');
  verif('album de ZZ : 1 joueur, celui à 2 équipes (et elle compte aussi dans SF1)', alb.length === 4 && alb.every(a => a.total === 1)
    && (await q('select albums_vue($1) a', [al]))[0].a.filter(a => a.equipe === 'SF1')[0].total === cat.filter(c => c.equipe === 'SF1').length, alb);
  // collectif : serveur = jeu, sur des équipes faites exprès (2 équipes, légendes)
  const leg = cat.find(c => c.equipe === 'SG2' && c.poste !== 'GB' && c.id !== base.id);
  await q('update cartes set legende = true, actif = false where id = $1', [leg.id]);
  const parId = Object.fromEntries((await q('select id, equipe, equipes, legende from cartes')).map(x => [x.id, x]));
  const de = eq => cat.filter(c => c.equipe === eq && c.id !== base.id && c.id !== leg.id && c.poste !== 'GB').map(c => c.id);
  const gb = cat.find(c => c.poste === 'GB' && c.equipe === 'SG1').id;
  const essais = [
    ['3 de SF1 dont celle à 2 équipes', [...de('SF1').slice(0, 2), base.id, ...de('SG1').slice(0, 3)]],
    ['2 de SF1 + la légende', [...de('SF1').slice(0, 2), leg.id, ...de('SG1').slice(0, 1), ...de('SF2').slice(0, 2)]],
    ['4 de SG1 + la légende (+ le gardien SG1)', [...de('SG1').slice(0, 4), leg.id, ...de('SF2').slice(0, 1)]],
    ['la carte à 2 équipes compte pour SF1 et pour ZZ', [base.id, ...de('SF1').slice(0, 4), ...de('SG2').slice(0, 1)]],
  ];
  const POSTES = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV'];
  for (const [nom, ids] of essais) {
    const eq = {GB: null};
    const exIds = [];
    for (const [i, id] of [...ids, gb].entries()) {
      const ex = (await q("insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, 'or', 80) returning id", [al, id]))[0].id;
      exIds.push(ex); eq[i < 6 ? POSTES[i] : 'GB'] = ex;
    }
    const f = (await q("select force_equipe($1::jsonb, 'duels:06') f", [JSON.stringify(eq)]))[0].f;
    const jeu = C.collectifDe([...ids, gb].map(id => parId[id]));
    verif(`collectif : ${nom} → serveur +${f.collectif}, jeu +${jeu}`, f.collectif === jeu, {serveur: f.collectif, jeu});
  }
  verif('liens dorés : une légende est coéquipière de tout le monde, la carte à 2 équipes de SF1 et de ZZ',
    C.coequipiers(parId[leg.id], parId[gb]) && C.coequipiers(parId[base.id], {equipe: 'ZZ'}) && !C.coequipiers(parId[base.id], parId[gb]));
  process.exit(bilan() ? 1 : 0);
})();
