// Règles écrites deux fois (app.js / cartes.js pour l'affichage, schema.sql pour le jeu réel) : ce test fait calculer les deux
// sur les mêmes cas, tirés au hasard, et refuse le moindre écart. À lancer après tout changement d'une de ces règles :
//   node tests/test_parite.js            (ou  PARITE_N=1000 node tests/test_parite.js  pour plus d'équipes)
// Couvre : paliers, stats d'un joueur à chaque note (stat_note / statsAuNiveau), note au poste (hors poste, joueur de la semaine,
// capitaine, cartes staff, légende), collectif, note d'équipe, moyennes de l'équipe, bonus des 9 tactiques, défis de composition.
const fs = require('fs');
const {chromium} = require('playwright');
const FS = require('./fauxsupabase');
const {REPO, rpc, lignesCatalogue, servir, verifs} = require('./base');
const {verif, bilan} = verifs();
const N = +process.env.PARITE_N || 300;
// hasard reproductible : un échec se rejoue avec la même graine (PARITE_GRAINE)
let graine = +process.env.PARITE_GRAINE || Date.now() % 1e9; const GRAINE = graine;
const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
const entier = (a, b) => a + Math.floor(alea() * (b - a + 1)), parmi = t => t[Math.floor(alea() * t.length)];
const melange = t => { const r = [...t]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const C = new Function(fs.readFileSync(REPO + '/cartes.js', 'utf8') + '; return {statsAuNiveau, statsDu, PALIERS, NOTE_LEGENDE, palierSuivant};')();
const SLOTS = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'], PAL = {bronze: [50, 59], argent: [60, 74], or: [75, 89], ultime: [90, 99]};
const STAFF = ['prepa', 'kine', 'ailiers', 'manager', 'gardiens', 'base', 'polyvalent', 'mental', 'adjoint', 'defense'];

(async () => {
  console.log(`graine ${GRAINE}, ${N} équipes`);
  const sb = await FS.demarrer(), db = sb.db;
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  // ── catalogue : en plus des cartes du site, des joueurs à deux postes, sans poste, un gardien qui joue aussi pivot, une légende
  const lignes = lignesCatalogue(), champ = lignes.filter(l => l.poste !== 'GB'), gardiens = lignes.filter(l => l.poste === 'GB');
  champ.slice(0, 4).forEach((l, i) => { l.postes = [l.poste, ['DC', 'PIV', 'AG', 'ARD'][i]].filter((x, k, t) => t.indexOf(x) === k); });
  champ.slice(4, 7).forEach(l => { l.poste = null; l.postes = []; });
  gardiens[0].postes = ['GB', 'PIV'];
  lignes.push({...champ[8], id: 'legende-test', nom: 'Légende Test', legende: true, site: {...champ[8].site, id: 'legende-test', nom: 'Légende Test', cree: true}});
  const ad = await sb.creerUtilisateur('admin@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Admin', 0, 'admin')", [ad.id]);
  const pub = await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignes), true]);
  if (pub.erreur) throw new Error(pub.erreur);
  const cartes = await q('select id, poste, postes, ecarts, legende, equipe from cartes');
  const al = await sb.creerUtilisateur('alice@test.fr', 'motdepasse-alice');
  await rpc(db, al.id, 'creer_profil', ['Alice', true]);
  await q('update profils set depart = true where user_id = $1', [al.id]);

  // ── 1. paliers et légende
  const pal = await q("select p, palier_min(p) mi, palier_max(p) ma, palier_suivant(p) s from unnest(array['bronze', 'argent', 'or', 'ultime']) p");
  verif('paliers : mêmes bornes et même ordre (PALIERS / palier_min, palier_max, palier_suivant)', pal.length === C.PALIERS.length
    && pal.every(r => { const c = C.PALIERS.find(x => x.id === r.p); return c && c.min === r.mi && c.max === r.ma && C.palierSuivant(r.p) === r.s; }), pal);
  verif('note d’une légende (NOTE_LEGENDE / legende_note)', (await q("select parami('legende_note') n"))[0].n === C.NOTE_LEGENDE);

  // ── 2. les stats d'un joueur à chaque note : toutes les cartes, de 50 à 107 (99 + capitaine + staff)
  const notes = Array.from({length: 58}, (_, i) => 50 + i);
  const srvStats = await q(`select c.id, n, jsonb_object_agg(k, stat_note(n, (c.ecarts ->> k)::numeric)) s
    from cartes c, generate_series(50, 107) n, unnest($1::text[]) k group by c.id, n`, [`{${[...new Set([...C.statsDu('GB'), ...C.statsDu(null)].map(x => x[0]))].join(',')}}`]);
  const parCle = Object.fromEntries(srvStats.map(r => [r.id + ':' + r.n, r.s]));
  const ecartsStats = [];
  for (const c of cartes) for (const n of notes) {
    const cli = C.statsAuNiveau({poste: c.poste, ecarts: c.ecarts}, n), srv = parCle[c.id + ':' + n];
    for (const k in cli) if (cli[k] !== srv[k]) ecartsStats.push({carte: c.id, note: n, stat: k, jeu: cli[k], serveur: srv[k], ecart: c.ecarts[k]});
  }
  verif(`stats d’un joueur : ${cartes.length} cartes × ${notes.length} notes, aucune différence (statsAuNiveau / stat_note)`, !ecartsStats.length,
    {differences: ecartsStats.length, exemples: ecartsStats.slice(0, 4)});

  // ── le jeu, dans le navigateur
  const site = await servir(8791);
  const nav = await chromium.launch();
  const ctx = await nav.newContext({viewport: {width: 390, height: 844}}); await sb.brancher(ctx);
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(site.url); await p.waitForSelector('form[data-form=connexion]');
  await p.fill('[name=email]', 'alice@test.fr'); await p.fill('[name=mdp]', 'motdepasse-alice'); await p.click('button[value=connexion]');
  await p.waitForSelector('.niveau');
  const lundi = (await q("select (lundi_courant() - 7)::text l"))[0].l;

  // ── 3. des équipes au hasard : note de chaque joueur à son poste, collectif, note d'équipe, moyennes, bonus des tactiques
  const peut = (c, slot) => slot === 'GB' ? c.postes.includes('GB') : !c.postes.length || c.postes.some(x => x !== 'GB');
  const diffs = {notes: [], collectif: [], equipe: [], moyennes: [], bonus: []}; let maxBonus = 0, vus = {hors: 0, forme: 0, cap: 0, staff: 0, legende: 0, plus99: 0};
  for (let k = 0; k < N; k++) {
    const pris = new Set(), equipe = {}, ex = [];
    const memeEquipe = alea() < .4 ? parmi(['SF1', 'SF2', 'SG1', 'SG2']) : null;   // souvent des coéquipiers : le collectif joue
    const legendeEn = alea() < .15 ? parmi(SLOTS.slice(0, 6)) : null;              // parfois la légende, à un poste de champ
    for (const slot of SLOTS) {
      let cand = cartes.filter(c => !pris.has(c.id) && peut(c, slot) && !c.legende);
      const aSonPoste = cand.filter(c => c.postes.includes(slot)), dEquipe = cand.filter(c => c.equipe === memeEquipe);
      if (alea() < .65 && aSonPoste.length) cand = aSonPoste;
      if (memeEquipe && alea() < .8 && cand.some(c => c.equipe === memeEquipe)) cand = cand.filter(c => c.equipe === memeEquipe);
      let c = parmi(cand);
      if (slot === legendeEn) c = cartes.find(x => x.legende);
      const palier = c.legende ? 'ultime' : parmi(Object.keys(PAL));
      const note = c.legende ? 100 : alea() < .25 ? PAL[palier][1] : entier(...PAL[palier]);   // souvent au plafond du palier : les bornes comptent
      pris.add(c.id); ex.push({slot, carte: c.id, palier, note});
    }
    await q('delete from exemplaires where proprietaire = $1', [al.id]); await q('delete from staff_cartes where user_id = $1', [al.id]); await q('delete from joueurs_semaine');
    for (const e of ex) equipe[e.slot] = (await q('insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, $3, $4) returning id', [al.id, e.carte, e.palier, e.note]))[0].id;
    const cap = alea() < .7 ? equipe[parmi(SLOTS)] : null, staff = alea() < .8 ? parmi(STAFF) : null;
    if (staff) await q('insert into staff_cartes (user_id, staff, palier) values ($1, $2, $3)', [al.id, staff, parmi(['bronze', 'argent', 'or', 'ultime'])]);
    const forme = melange(ex).slice(0, entier(0, 3));
    for (const [i, e] of forme.entries()) await q("insert into joueurs_semaine (lundi, equipe, carte, stats) values ($1, $2, $3, '{}')", [lundi, 'E' + i, e.carte]);
    const tactique = `${parmi(['duels', 'enclenchement', 'rapide'])}:${parmi(['06', '15', '33'])}`;
    await q('update profils set equipe = $2, capitaine = $3, staff = $4, tactique = $5 where user_id = $1', [al.id, JSON.stringify(equipe), cap, staff, tactique]);
    const srv = (await q('select force_equipe(equipe, tactique) f from profils where user_id = $1', [al.id]))[0].f;
    const jeu = await p.evaluate(async () => {
      await Compte.rafraichir(); if (typeof integrerLegendes === 'function') integrerLegendes();
      const T = tactiqueActuelle(), m = moyennesEquipe();
      return {notes: Object.fromEntries(POSTES.map(x => { const c = aligne(x.id); return [x.id, c ? noteAuPoste(c, x.id) : null]; })), eq: noteEquipe(), moy: m,
        att: bonusTactique(m, TACT_ATT.find(x => x[0] === T.att)[2]), def: bonusTactique(m, TACT_DEF.find(x => x[0] === T.def)[2]), forme: (S().semaine?.joueurs || []).length};
    });
    const cas = {k, tactique, staff, cap: cap && SLOTS.find(s => equipe[s] === cap), forme: forme.map(e => e.slot), ex: ex.map(e => `${e.slot}:${e.carte}:${e.note}`)};
    for (const s of SLOTS) if (jeu.notes[s] !== srv.notes[s]) diffs.notes.push({...cas, poste: s, jeu: jeu.notes[s], serveur: srv.notes[s]});
    if (jeu.eq.collectif !== srv.collectif) diffs.collectif.push({...cas, jeu: jeu.eq.collectif, serveur: srv.collectif});
    if (jeu.eq.note !== +srv.note) diffs.equipe.push({...cas, jeu: jeu.eq.note, serveur: +srv.note});
    for (const s in srv.moyennes) if (Math.round(jeu.moy[s] * 10) / 10 !== +srv.moyennes[s]) diffs.moyennes.push({...cas, stat: s, jeu: jeu.moy[s], serveur: +srv.moyennes[s]});
    for (const [c, v] of [['attaque', jeu.att], ['defense', jeu.def]]) { const d = Math.abs(v - +srv.bonus[c]); maxBonus = Math.max(maxBonus, d);
      if (d > 1e-9) diffs.bonus.push({...cas, cote: c, jeu: v, serveur: +srv.bonus[c]}); }
    vus.hors += ex.some(e => { const c = cartes.find(x => x.id === e.carte); return e.slot !== 'GB' && c.postes.length && !c.postes.includes(e.slot); });
    vus.forme += forme.length > 0 && jeu.forme > 0; vus.cap += !!cap; vus.staff += !!staff; vus.legende += ex.some(e => e.carte === 'legende-test'); vus.plus99 += Object.values(srv.notes).some(v => v > 99);
  }
  console.log('cas couverts :', JSON.stringify(vus));
  verif('les cas difficiles sont bien tirés (hors poste, joueur de la semaine, capitaine, staff, légende, notes au-dessus de 99)', Object.values(vus).every(v => v >= Math.min(5, N / 20)), vus);
  verif(`note de chaque joueur à son poste : ${N} équipes, aucune différence (noteAuPoste / force_equipe)`, !diffs.notes.length, {differences: diffs.notes.length, exemples: diffs.notes.slice(0, 3)});
  verif('collectif : aucune différence', !diffs.collectif.length, {differences: diffs.collectif.length, exemples: diffs.collectif.slice(0, 2)});
  verif('note d’équipe : aucune différence (noteEquipe / force_equipe)', !diffs.equipe.length, {differences: diffs.equipe.length, exemples: diffs.equipe.slice(0, 3)});
  verif('moyennes des 6 stats de l’équipe : aucune différence (moyennesEquipe / force_equipe)', !diffs.moyennes.length, {differences: diffs.moyennes.length, exemples: diffs.moyennes.slice(0, 3)});
  verif('bonus des tactiques : aucune différence (bonusTactique / tactique_bonus)', !diffs.bonus.length, {differences: diffs.bonus.length, plusGrand: maxBonus, exemples: diffs.bonus.slice(0, 3)});

  // ── 4. défis de composition : la même sélection de cartes, acceptée ou refusée des deux côtés
  await q('delete from exemplaires where proprietaire = $1', [al.id]); await q("update profils set equipe = '{}', capitaine = null where user_id = $1", [al.id]);
  for (const c of cartes.filter(x => !x.legende)) for (let i = 0; i < entier(1, 3); i++) { const palier = parmi(['bronze', 'bronze', 'argent', 'argent', 'or', 'ultime']);
    await q('insert into exemplaires (proprietaire, carte_id, palier, note) values ($1, $2, $3, $4)', [al.id, c.id, palier, entier(...PAL[palier])]); }
  const defis = await q('select id, regle from compo_catalogue()');
  const tirages = await p.evaluate(async ({defis, graine}) => {
    await Compte.rafraichir();
    let g = graine; const alea = () => { g = (g * 1664525 + 1013904223) % 4294967296; return g / 4294967296; };
    const libres = compoLibres(), out = [];
    for (const d of defis) {
      const auto = compoAuto(d.regle), base = (auto.choix || []).map(e => e.id);
      for (let t = 0; t < 25; t++) {
        // la proposition du jeu, puis la même avec quelques cartes remplacées au hasard, puis des sélections toutes au hasard
        let ids = t === 0 ? base : t < 12 ? base.map(id => alea() < .25 ? libres[Math.floor(alea() * libres.length)].id : id)
          : Array.from({length: d.regle.n}, () => libres[Math.floor(alea() * libres.length)].id);
        ids = [...new Set(ids)];
        const exs = ids.map(id => libres.find(e => e.id === id));
        out.push({defi: d.id, ids, jeu: compoTest(d.regle, exs).every(x => x.ok), auto: t === 0 ? !!auto.ok : null});
      }
    }
    return out;
  }, {defis, graine: GRAINE});
  const dCompo = []; let acceptes = 0, refuses = 0;
  for (const t of tirages) {
    const regle = defis.find(d => d.id === t.defi).regle;
    const e = (await q('select compo_erreur($1, $2::jsonb, $3::uuid[]) e', [al.id, JSON.stringify(regle), `{${t.ids.join(',')}}`]))[0].e;
    const srv = e === null; acceptes += srv; refuses += !srv;
    if (srv !== t.jeu) dCompo.push({defi: t.defi, n: t.ids.length, jeu: t.jeu, serveur: e || 'accepté', regle});
    if (t.auto !== null && t.auto !== srv) dCompo.push({defi: t.defi, proposition: 'compoAuto', jeu: t.auto, serveur: e || 'accepté', regle});
  }
  verif(`défis de composition : ${defis.length} défis, ${tirages.length} sélections (${acceptes} acceptées, ${refuses} refusées), même verdict des deux côtés (compoTest, compoAuto / compo_erreur)`,
    !dCompo.length && acceptes > 0 && refuses > 0, {differences: dCompo.length, exemples: dCompo.slice(0, 3)});

  verif('aucune erreur de page', !erreurs.length, erreurs.slice(0, 3));
  await nav.close(); await site.fermer();
  process.exit(bilan() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
