const {rpc, rpcJoueur, lignesCatalogue} = require('./base');
const FS = require('./fauxsupabase');
(async () => {
  const sb = await FS.demarrer(), db = sb.db, q = async (s, p = []) => (await db.query(s, p)).rows;
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0, "momentum_valeurs": {"but": 40, "but_dessus": 50, "7m-but": 30, "arret": 30, "7m-arret": 30, "perte": 25, "rate": 15, "excl": 20}}'`);
  const ad = await sb.creerUtilisateur('m@test.fr', 'x-admin-123');
  await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad.id]);
  await rpc(db, ad.id, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  const u = (await sb.creerUtilisateur('a@test.fr', 'motdepasse-a')).id;
  await rpcJoueur(db, u, 'creer_profil', ['Alice', true]); await rpcJoueur(db, u, 'ouvrir_depart');
  let essais = 0, ok = 0, ko = [];
  for (let m = 0; m < 6; m++) {
    await q('delete from matchs_direct'); await q('update profils set matchs = 10');
    await rpcJoueur(db, u, 'match_commencer', ['championnat', null, 'duels:06', 'normal', false]);
    for (let i = 0; i < 12; i++) {
      const r = await rpcJoueur(db, u, 'match_bloc', ['duels:06', 'normal', false]);
      if (r.erreur || r.match) break;
      const e = (await q('select etat from matchs_direct where user_id = $1', [u]))[0].etat;
      const lock = e.ev.slice(e.debut_n).find(x => x.ty === 'momentum' && x.t > e.debut.t + 15);
      if (!lock || (e.tm?.restants ?? 0) < 1) continue;
      await q(`update matchs_direct set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()))) where user_id = $1`, [u]);
      const h = lock.t - 8;
      const t = await rpcJoueur(db, u, 'match_temps_mort', [h]);
      const e2 = (await q('select etat from matchs_direct where user_id = $1', [u]))[0].etat;
      essais++;
      const bien = !t.erreur && e2.mom === 0 && !e2.momv;
      if (bien) ok++; else ko.push({lock: lock.c, h, reprise: t.reprise, mom: e2.mom, momv: e2.momv, err: t.erreur, evs: (t.vue?.evenements || []).map(x => x.ty)});
      break;
    }
  }
  console.log({essais, ok, ko: JSON.stringify(ko).slice(0, 800)});
  process.exit(0);
})();
