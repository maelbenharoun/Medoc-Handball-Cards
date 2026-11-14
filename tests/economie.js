// Simulation de l'économie du jeu (audit du 12 nov. 2026) : combien de pièces et de cartes par jour, et combien de jours pour les
// grands objectifs, selon le temps passé à jouer. Tous les prix, chances et récompenses sont lus dans supabase/schema.sql
// (chargé dans une base locale) : relancer après un changement de réglage pour voir son effet.   node tests/economie.js
// Variantes : ECO_REGLAGES (essayer d'autres réglages), ECO_PROFIL (un seul profil : Occasionnel, Régulier, Acharné, Plafond), ECO_RUNS.
// C'est un MODÈLE, pas une mesure : les hypothèses (rythme de jeu, adresse aux mini-jeux, taux de victoire) sont en haut du fichier.
const fs = require('fs');
const {REPO, creerBase} = require('./base');
const RUNS = +process.env.ECO_RUNS || 200, JOURS_MAX = 365 * 4;

// ── hypothèses : quatre façons de jouer ──────────────────────────────────────────
// gratuits : boosters gratuits ouverts par jour (1 toutes les 30 min, 5 en stock : 5 par visite, 48 au plus) ; championnat : envie =
// matchs qu'on a envie de jouer par jour, heures = heures de la journée où l'on revient chercher ses matchs (la réserve se recharge
// d'un match toutes les match_minutes) : matchs joués = le plus petit des deux ; minis : part des essais du jour joués ; adresse : part des essais réussis ;
// quetes / quetesSem : quêtes finies (sur 3 par jour, 4 par semaine) ; rangLigue : place habituelle dans son groupe de 10
const PROFILS = {
  'Occasionnel (1 visite par jour)': {gratuits: 5, envie: 3, heures: 24, ligue: 0, minis: .4, adresse: .5, quetes: 1.5, quetesSem: 1, defis: 0, pronos: 0, rangLigue: 0},
  'Régulier (2 à 3 visites)': {gratuits: 12, envie: 12, heures: 16, ligue: 5, minis: 1, adresse: .65, quetes: 2.5, quetesSem: 3, defis: 2, pronos: 1, rangLigue: 5},
  'Acharné (5 visites et plus)': {gratuits: 25, envie: 20, heures: 24, ligue: 5, minis: 1, adresse: .85, quetes: 3, quetesSem: 4, defis: 5, pronos: 1, rangLigue: 2},
  'Plafond (un robot, tout au maximum)': {gratuits: 48, envie: 999, heures: 24, ligue: 5, minis: 1, adresse: 1, quetes: 3, quetesSem: 4, defis: 5, pronos: 1, rangLigue: 1},
};
const VICTOIRES = {aNiveau: [.5, .1, .4], enMontee: [.75, .05, .2]};   // gagné, nul, perdu : à son niveau, ou en train de monter
const MATCHS_PAR_NIVEAU = 14;                                          // matchs pour monter d'un niveau du parcours, en moyenne
const PRONO_POINTS = 1.5, PRONO_MATCHS_SEMAINE = 4;                    // points moyens par prono, matchs du club par semaine

(async () => {
  const db = await creerBase(), q = async (s, p = []) => (await db.query(s, p)).rows;
  const P = (await q('select valeurs from parametres'))[0].valeurs;
  // essayer un réglage sans toucher au serveur :  ECO_REGLAGES='{"booster_equipe_prix": 300}' node tests/economie.js
  const essai = process.env.ECO_REGLAGES ? JSON.parse(process.env.ECO_REGLAGES) : null;
  if (essai) { Object.assign(P, essai); console.log('Réglages essayés (pas ceux du serveur) :', JSON.stringify(essai)); }
  const qJour = await q('select * from quetes_catalogue()'), qSem = await q('select * from quetes_semaine_catalogue()');
  const passe = (await q('select n, passe_recompense(n) r from generate_series(1, $1::int) n', [P.passe_paliers])).map(x => x.r);
  const xpNiveau = (await q('select n, xp_niveau(n) x from generate_series(1, 400) n')).map(x => x.x);
  const staffIds = (await q('select id from staff_catalogue()')).map(x => x.id);
  const cartes = JSON.parse(fs.readFileSync(REPO + '/data/cartes.json', 'utf8')).cartes.map(c => ({id: c.id, equipe: c.equipe, gb: c.poste === 'GB'}));
  const PAL = ['bronze', 'argent', 'or', 'ultime'], MIN = [50, 60, 75, 90], MAX = [59, 74, 89, 99];
  const moy = (t, k) => t.reduce((a, x) => a + x[k], 0) / t.length;
  const tirerPalier = ch => { let x = Math.random() * PAL.reduce((a, p) => a + (ch[p] || 0), 0); for (let i = 0; i < 4; i++) { x -= ch[PAL[i]] || 0; if (x <= 0) return i; } return 0; };
  const esp = (t, pr) => pr[0] * t.gagne + pr[1] * t.nul + pr[2] * t.perdu;
  const nb = x => Math.round(x).toLocaleString('fr-FR');

  // ── revenu d'une journée (hors boosters et hors effets du niveau de championnat) ──
  function revenuFixe(f) {
    const mini = (limite, gain, bonus) => limite * f.minis * gain * f.adresse + (f.minis === 1 ? bonus * f.adresse ** limite : 0);
    const r = {};
    r['Mini-jeux'] = mini(P.jet7m_tirs_par_jour, P.jet7m_pieces_but, P.jet7m_bonus_parfait) + mini(P.mini_gardien_tirs_par_jour, P.mini_gardien_pieces, P.mini_bonus_parfait)
      + 2 * mini(P.mini_essais_par_jour, P.mini_pieces, P.mini_bonus_parfait);
    r['Quêtes du jour'] = f.quetes * moy(qJour, 'pieces');
    r['Quêtes de la semaine'] = f.quetesSem * moy(qSem, 'pieces') / 7;
    const rl = P.ligue_recompenses[f.rangLigue] || P.ligue_recompenses.autres;
    r['Ligue'] = f.ligue ? f.ligue * esp(P.ligue_pieces, VICTOIRES.aNiveau) + (rl.pieces || 0) / 7 : 0;
    r['Défis entre ami(e)s'] = f.defis * P.defi_ami_pieces * .5;
    r['Pronostics'] = f.pronos * PRONO_MATCHS_SEMAINE * PRONO_POINTS * P.prono_pieces_point / 7;
    const xp = f.quetes * moy(qJour, 'xp') + f.quetesSem * moy(qSem, 'xp') / 7 + f.ligue * esp(P.pve_xp, VICTOIRES.aNiveau);
    const boosters = f.ligue ? ((rl.bonus || 0)) / 7 : 0, boostersOr = f.ligue ? (rl.or || 0) / 7 : 0;
    return {r, xp, boosters, boostersOr};
  }

  // matchs de championnat joués par jour, et ce que rapporte chacun (championnat_gain : ×0,5 depuis le 14 nov. 2026)
  const matchsJour = f => Math.min(f.envie, f.heures * 60 / P.match_minutes, 1440 / P.match_minutes);
  const gainMatch = +(P.championnat_gain ?? 1);
  // ── une partie simulée, jour après jour ──
  function partie(f0, cible = 'SF1') {
    const f = {...f0, matchs: matchsJour(f0)};
    const fixe = revenuFixe(f), equipe = cartes.filter(c => c.equipe === cible);
    const cibles = [equipe.find(c => c.gb), ...equipe.filter(c => !c.gb).slice(0, 6)].map(c => c.id), estCible = new Set(cibles);
    const inv = {}, staff = {}, notes = {};   // inv[carte] = [bronze, argent, or, ultime] ; notes[carte] = note de la carte Ultime entraînée
    let pieces = P.depart_pieces, xp = 0, niveau = 1, xpPasse = 0, palPasse = 0, matchs = 0, bBonus = 0, bOr = 0, resteB = 0, resteO = 0;
    const jalons = {}, sources = {}, depenses = {boosters: 0, fusions: 0, entrainement: 0};
    const gagner = (k, v) => { pieces += v; sources[k] = (sources[k] || 0) + v; };
    const ajouter = (id, pal) => { (inv[id] = inv[id] || [0, 0, 0, 0])[pal]++; };
    const fusionner = (t, payant = true) => { for (let p = 0; p < 3; p++) while (t[p] >= P.fusion_nombre && (!payant || pieces >= P.fusion_cout[PAL[p]])) {
      t[p] -= P.fusion_nombre; t[p + 1]++; pieces -= P.fusion_cout[PAL[p]]; depenses.fusions += P.fusion_cout[PAL[p]]; gagnerXp(P.xp_fusion); } };
    const meilleur = id => { const t = inv[id]; if (!t) return -1; for (let p = 3; p >= 0; p--) if (t[p]) return p; return -1; };
    function gagnerXp(v) {
      xp += v; xpPasse += v;
      while (xp >= xpNiveau[niveau - 1]) { xp -= xpNiveau[niveau - 1]; niveau++; gagner('Niveaux', Math.min(P.niveau_pieces * niveau, P.niveau_pieces_max));
        if (niveau % P.niveau_or_tous === 0) bOr++; else bBonus++; }
      while (palPasse < P.passe_paliers && xpPasse >= (palPasse + 1) * P.passe_xp_palier) { const r = passe[palPasse++];
        gagner('Passe de saison', r.pieces || 0); bBonus += r.bonus || 0; bOr += r.or || 0; }
    }
    const tirer = (type) => {
      if (type !== 'or' && type !== 'equipe' && (type === 'gratuit' || type === 'hasard') && Math.random() < P.staff_chance) {
        const s = staffIds[Math.floor(Math.random() * staffIds.length)]; (staff[s] = staff[s] || [0, 0, 0, 0])[tirerPalier(P.booster_chances)]++; fusionner(staff[s]); return; }
      const pool = type === 'equipe' ? equipe : cartes, c = pool[Math.floor(Math.random() * pool.length)];
      ajouter(c.id, tirerPalier(type === 'or' ? P.booster_or_chances : P.booster_chances));
    };
    for (let jour = 1; jour <= JOURS_MAX; jour++) {
      if ((jour - 1) % (P.passe_semaines * 7) === 0) { if (jour === P.passe_semaines * 7 + 1) jalons.passe1 = palPasse; xpPasse = 0; palPasse = 0; }   // nouvelle saison du passe
      // niveau de championnat : celui de la force de l'équipe, pas plus vite que les matchs joués ne le permettent
      const forces = cibles.map(id => { const p = meilleur(id); return p < 0 ? 50 : p === 3 ? notes[id] || 90 : MIN[p]; });
      const noteEq = forces.reduce((a, b) => a + b, 0) / 7 + 3;
      const nivForce = Math.max(1, P.parcours.filter(x => x.base <= noteEq).length), niv = Math.min(nivForce, 1 + Math.floor(matchs / MATCHS_PAR_NIVEAU));
      const pr = niv < nivForce ? VICTOIRES.enMontee : VICTOIRES.aNiveau, mult = 1 + (niv - 1) / 4;
      for (const k in fixe.r) gagner(k, fixe.r[k]);
      gagner('Championnat', f.matchs * (esp(P.pve_pieces, pr) * mult * gainMatch + P.parcours_saison_pieces * mult * 1.2 / MATCHS_PAR_NIVEAU)); matchs += f.matchs;
      gagnerXp(fixe.xp + f.matchs * esp(P.pve_xp, pr) * gainMatch);
      resteB += fixe.boosters; resteO += fixe.boostersOr;
      while (resteB >= 1) { resteB--; bBonus++; } while (resteO >= 1) { resteO--; bOr++; }
      for (let i = 0; i < f.gratuits; i++) tirer('gratuit');
      while (bBonus > 0) { bBonus--; tirer('bonus'); } while (bOr > 0) { bOr--; tirer('or'); }
      // les cartes : on fusionne celles de l'équipe visée ; des autres joueurs on garde la meilleure, le reste est vendu
      const ranger = () => { for (const id in inv) { const t = inv[id];
        if (estCible.has(id)) fusionner(t);
        else { let garde = false; for (let p = 3; p >= 0; p--) while (t[p] > (garde ? 0 : 1)) { t[p]--; gagner('Ventes', P.vente[PAL[p]]); } } } };
      ranger();
      // les pièces : des boosters de l'équipe tant qu'un des 7 n'est pas Ultime, puis l'entraînement jusqu'à 99
      let garde = 0;
      while (pieces >= P.booster_equipe_prix + 200 && cibles.some(id => meilleur(id) < 3) && garde++ < 200) { pieces -= P.booster_equipe_prix; depenses.boosters += P.booster_equipe_prix; tirer('equipe'); ranger(); }
      if (cibles.every(id => meilleur(id) === 3)) for (const id of cibles) { notes[id] = notes[id] || 90;
        const coutPoint = P.xp_par_point.ultime / P.entrainement_xp * P.entrainement_cout.ultime;
        while (notes[id] < 99 && pieces >= coutPoint) { pieces -= coutPoint; depenses.entrainement += coutPoint; notes[id]++; gagnerXp(P.xp_par_point.ultime / P.entrainement_xp * P.xp_entrainement); } }
      // jalons
      const j = (k, ok) => { if (ok && !(k in jalons)) jalons[k] = jour; };
      const mini = Math.min(...cibles.map(meilleur));
      j('7 Argent ou mieux', mini >= 1); j('7 Or ou mieux', mini >= 2); j('7 Ultime', mini >= 3); j('7 Ultime à 99', mini >= 3 && cibles.every(id => notes[id] >= 99));
      j('Album Bronze d’une équipe', equipe.every(c => meilleur(c.id) >= 0)); j('Album Or d’une équipe', equipe.every(c => meilleur(c.id) >= 2));
      const sT = Object.values(staff);
      j('1re carte staff', sT.length > 0); j('Les 10 cartes staff', sT.length >= staffIds.length);
      j('Une carte staff Or', sT.some(t => t[2] || t[3])); j('Une carte staff Ultime', sT.some(t => t[3]));
      j('Une carte staff précise en Or', !!(staff[staffIds[0]] && (staff[staffIds[0]][2] || staff[staffIds[0]][3])));
      j('Une carte staff précise en Ultime', !!(staff[staffIds[0]] && staff[staffIds[0]][3]));
      j('Niveau 20', niveau >= 20); j('Sommet du championnat (Légendes)', niv >= P.parcours.length);
      j('Collection complète (chaque joueur au moins en Bronze)', cartes.every(c => meilleur(c.id) >= 0));
      if (jour === 30) { jalons._sources = {...sources}; jalons._niveau = niveau; jalons._depenses = {...depenses}; }
      if (jalons['7 Ultime à 99'] && jalons['Une carte staff précise en Ultime'] && jalons['Album Or d’une équipe'] && jalons['Collection complète (chaque joueur au moins en Bronze)']
        && jalons['Sommet du championnat (Légendes)'] && jour > 60) break;
    }
    return jalons;
  }

  const mediane = t => { const s = [...t].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const duree = j => j == null ? `plus de ${JOURS_MAX / 365} ans` : j < 60 ? `${j} j` : j < 730 ? `${Math.round(j / 30.4)} mois` : `${(j / 365).toFixed(1).replace('.', ',')} ans`;
  const JALONS = ['7 Argent ou mieux', '7 Or ou mieux', '7 Ultime', '7 Ultime à 99', 'Album Bronze d’une équipe', 'Album Or d’une équipe', '1re carte staff', 'Les 10 cartes staff',
    'Une carte staff Or', 'Une carte staff Ultime', 'Une carte staff précise en Or', 'Une carte staff précise en Ultime', 'Niveau 20', 'Sommet du championnat (Légendes)', 'Collection complète (chaque joueur au moins en Bronze)'];
  const sortie = {reglages: {booster_equipe_prix: P.booster_equipe_prix, booster_hasard_prix: P.booster_hasard_prix, staff_chance: P.staff_chance, booster_chances: P.booster_chances}, profils: {}};
  console.log(`Simulation de l'économie : ${RUNS} parties par profil, jusqu'à ${JOURS_MAX / 365} ans. Équipe visée : 7 joueurs de SF1 (collectif +3).\n`);
  for (const [nom, f] of Object.entries(PROFILS).filter(([n]) => !process.env.ECO_PROFIL || n.startsWith(process.env.ECO_PROFIL))) {
    const parties = Array.from({length: RUNS}, () => partie(f));
    const src = {}; for (const p of parties) for (const k in p._sources) src[k] = (src[k] || 0) + p._sources[k] / RUNS / 30;
    const total = Object.values(src).reduce((a, b) => a + b, 0);
    console.log(`━━ ${nom}`);
    console.log(`   Pièces par jour (moyenne des 30 premiers jours) : ${nb(total)}  →  ${(total / P.booster_equipe_prix).toFixed(1).replace('.', ',')} booster(s) d'équipe par jour`);
    console.log('   ' + Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${nb(v)} (${Math.round(100 * v / total)} %)`).join(' · '));
    console.log(`   Matchs de championnat par jour : ${matchsJour(f)} · cartes par jour : ${f.gratuits} gratuites · niveau du compte après 30 jours : ${mediane(parties.map(p => p._niveau))} · paliers du passe à la 1re saison : ${mediane(parties.map(p => p.passe1 ?? 0))}/${P.passe_paliers}`);
    const res = {};
    for (const k of JALONS) { const v = parties.map(p => p[k] ?? Infinity), m = mediane(v); res[k] = isFinite(m) ? m : null; }
    console.log('   ' + JALONS.map(k => `${k} : ${duree(res[k])}`).join('\n   ') + '\n');
    sortie.profils[nom] = {piecesParJour: Math.round(total), sources: Object.fromEntries(Object.entries(src).map(([k, v]) => [k, Math.round(v)])), jalonsJours: res};
  }
  // ── prix de référence
  const fusionTotal = 9 * P.fusion_cout.bronze + 3 * P.fusion_cout.argent + P.fusion_cout.or;
  const entr = p => (MAX[p] - MIN[p]) * P.xp_par_point[PAL[p]] / P.entrainement_xp * P.entrainement_cout[PAL[p]];
  console.log('━━ Prix de référence');
  console.log(`   Une carte de Bronze à Ultime par fusion : 27 cartes Bronze et ${nb(fusionTotal)} pièces de fusion`);
  console.log(`   Entraîner une carte du bas au haut de son palier : Bronze ${nb(entr(0))} · Argent ${nb(entr(1))} · Or ${nb(entr(2))} · Ultime ${nb(entr(3))} pièces`);
  const be = PAL.reduce((a, p, i) => a + P.booster_chances[p] / 100 * 3 ** i, 0);
  console.log(`   Un booster vaut en moyenne ${be.toFixed(2).replace('.', ',')} carte(s) Bronze (1 Argent = 3, 1 Or = 9, 1 Ultime = 27)`);
  console.log(`   Chance par booster gratuit ou mystère d'avoir une carte staff précise : 1 sur ${Math.round(1 / (P.staff_chance / staffIds.length))} ; en Ultime directement : 1 sur ${nb(1 / (P.staff_chance / staffIds.length * P.booster_chances.ultime / 100))}`);
  if (process.env.ECO_JSON) fs.writeFileSync(process.env.ECO_JSON, JSON.stringify(sortie, null, 1));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
