const {creerBase, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs} = require('./base');
const {verif, bilan} = verifs();
const erreur = (r, motif) => !!r?.erreur && (!motif || r.erreur.includes(motif));
(async () => {
  const db = await creerBase(), q = async (s, p = []) => (await db.query(s, p)).rows;
  const ad = await nouvelUtilisateur(db); await q("insert into profils (user_id, pseudo, pieces, role) values ($1, 'Mael', 0, 'admin')", [ad]);
  await rpc(db, ad, 'admin_publier_cartes', [JSON.stringify(lignesCatalogue()), true]);
  await q(`update parametres set valeurs = valeurs || '{"blessure_chance": 0}'`);
  const U = {};
  for (const n of ['Alice', 'Bob', 'Chloe']) { U[n] = await nouvelUtilisateur(db); await rpcJoueur(db, U[n], 'creer_profil', [n, true]); await rpcJoueur(db, U[n], 'ouvrir_depart'); }
  let r = await rpcJoueur(db, U.Alice, 'pvp_chercher');
  verif('Alice cherche : en file, attente 0, estimé 120', r.attente === 0 && r.estime === 120, r);
  r = await rpcJoueur(db, U.Bob, 'pvp_chercher');
  verif('Bob cherche : match trouvé contre Alice', !!r.match?.pvp?.id && r.match.pvp.adversaire.pseudo === 'Alice', r.erreur || r);
  const id = r.match.pvp.id;
  r = await rpcJoueur(db, U.Alice, 'pvp_chercher');
  verif('Alice relance la recherche : elle retrouve le match (côté a)', r.match?.pvp?.id === id && r.match.pvp.cote === 'a', r);
  // coup d'envoi : les deux prêts
  let va = await rpcJoueur(db, U.Alice, 'pvp_choix', ['rapide:33', 'pression', null, 0, false, 0]);
  verif('Alice prête : on attend Bob', va.bloc === 0 && va.pvp.pretEux === false, va.erreur || va.pvp);
  let vb = await rpcJoueur(db, U.Bob, 'pvp_choix', ['duels:06', 'normal', null, 0, false, 0]);
  verif('Bob prêt : la 1re tranche est jouée', vb.bloc === 1 && vb.evenements.length > 3, vb.erreur || vb.bloc);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('les deux voient le même score (en miroir)', JSON.stringify(va.score) === JSON.stringify([vb.score[1], vb.score[0]]) && va.nous.nom === 'Alice' && vb.nous.nom === 'Bob', [va.score, vb.score]);
  const tacB = vb.evenements.find(x => x.ty === 'tactique');
  const tacVuA = va.evenements.find(x => x.ty === 'tactique-adv');
  verif('Alice voit le changement de Bob réduit à ce qui se voit (défense, pas l’attaque)', (!tacB || (tacVuA && tacVuA.def && !tacVuA.v)), {tacB, tacVuA});
  verif('Alice ne voit pas l’attaque de Bob dans la vue', !JSON.stringify(va.eux).includes('"attaque"'));
  // tranche suivante seulement quand les deux ont fini (ou à l’heure)
  va = await rpcJoueur(db, U.Alice, 'pvp_choix', [null, null, null, 1, false, 0]);
  verif('Alice a fini la tranche 1 : on attend', va.bloc === 1);
  await q(`update pvp_matchs set meta = jsonb_set(meta, '{prochain}', to_jsonb(extract(epoch from clock_timestamp()) - 1))`);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('à l’heure prévue, la tranche 2 part même si Bob n’a pas fini', va.bloc === 2, va.bloc);
  // temps mort de Bob : retour en arrière, pause de 20 s
  await q(`update pvp_matchs set etat = jsonb_set(etat, '{servi}', to_jsonb(extract(epoch from clock_timestamp()) - 4))`);
  const tm = await rpcJoueur(db, U.Bob, 'pvp_temps_mort');
  verif(`temps mort de Bob : pause 20 s, à ${tm.pvp?.pause?.h}s (≈ 5'00 + 100 s), gen 1`, tm.pvp?.pause?.moi === true && tm.pvp.pause.h >= 380 && tm.pvp.pause.h <= 420 && tm.pvp.gen === 1 && tm.tempsMorts.restants === 2, tm.erreur || tm.pvp);
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  verif('Alice voit la pause (pas la sienne) et le match revenu à la même seconde', va.pvp.pause && va.pvp.pause.moi === false && va.pvp.h === tm.pvp.pause.h && va.tempsMortsAdv.restants === 2, va.pvp);
  verif('pendant la pause : un 2e temps mort refusé', erreur(await rpcJoueur(db, U.Alice, 'pvp_temps_mort'), 'arrêté'));
  await rpcJoueur(db, U.Alice, 'pvp_choix', ['enclenchement:15', 'normal', JSON.stringify(['AG']), null, true, 0]);
  vb = await rpcJoueur(db, U.Bob, 'pvp_choix', [null, null, null, null, true, 0]);
  verif('les deux prêts : la tranche reprend (fin de la tranche 2 rejouée)', !vb.pvp.pause && vb.bloc === 2 && vb.pvp.h === 600, vb.erreur || vb.pvp);
  // jusqu’au bout : on avance l’heure à chaque fois
  for (let i = 0; i < 12; i++) {
    await q(`update pvp_matchs set meta = jsonb_set(meta, '{prochain}', to_jsonb(extract(epoch from clock_timestamp()) - 1))`);
    await rpcJoueur(db, U.Alice, 'pvp_vue', [0]);
  }
  va = await rpcJoueur(db, U.Alice, 'pvp_vue', [0]); vb = await rpcJoueur(db, U.Bob, 'pvp_vue', [0]);
  const tA = (await q('select trophees from profils where user_id = $1', [U.Alice]))[0].trophees, tB = (await q('select trophees from profils where user_id = $1', [U.Bob]))[0].trophees;
  verif(`fin : ${va.pvp.fin?.match?.a}-${va.pvp.fin?.match?.b}, trophées Alice ${tA}, Bob ${tB}`, va.pvp.statut === 'fini' && vb.pvp.fin && va.pvp.fin.match.a === vb.pvp.fin.match.b
    && (va.pvp.fin.match.resultat === 'nul' ? tA === 0 && tB === 0 : tA + tB === 30), {fa: va.pvp.fin, fb: vb.pvp.fin?.gains});
  verif('historique : un match « pvp » pour chacun', (await q("select count(*)::int n from rencontres where type = 'pvp'"))[0].n === 2);
  const acc = await rpcJoueur(db, U.Alice, 'pvp_accueil');
  verif('accueil : trophées, 7 arènes, classement', acc.arenes.length === 7 && acc.classement.length >= 1 && acc.derniers.length === 1, acc.erreur || acc);
  // fantôme après 2 minutes
  r = await rpcJoueur(db, U.Chloe, 'pvp_chercher');
  await q("update pvp_file set entree = now() - interval '121 seconds' where user_id = $1", [U.Chloe]);
  r = await rpcJoueur(db, U.Chloe, 'pvp_chercher');
  verif(`après 2 min : un fantôme (${r.vue?.eux?.nom})`, r.fantome === true && /^Fantôme de /.test(r.vue.eux.nom), r.erreur || r);
  r = await rpcJoueur(db, U.Chloe, 'match_simuler_fin');
  verif(`fantôme simulé : trophées ${r.gains?.trophees}, pièces ${r.gains?.pieces}`, r.classe === true && typeof r.gains.trophees === 'number', r.erreur || r);
  // invitation entre ami(e)s
  await rpcJoueur(db, U.Alice, 'ajouter_ami', ['Chloe']); await rpcJoueur(db, U.Chloe, 'ajouter_ami', ['Alice']);
  const inv = await rpcJoueur(db, U.Alice, 'pvp_inviter', ['Chloe']);
  verif('Alice invite Chloé', !!inv.invitation, inv.erreur || inv);
  verif('Chloé la voit (état)', (await rpcJoueur(db, U.Chloe, 'mon_etat')).pvp.invitations[0]?.de === 'Alice');
  r = await rpcJoueur(db, U.Chloe, 'pvp_repondre', [inv.invitation, true]);
  verif('Chloé accepte : match non classé (côté b)', r.match?.pvp?.classe === false && r.match.pvp.cote === 'b', r.erreur || r);
  r = await rpcJoueur(db, U.Alice, 'pvp_attendre', [inv.invitation]);
  verif('Alice l’apprend en attendant : le match (côté a)', r.statut === 'acceptee' && r.match.pvp.cote === 'a', r);
  verif('un visiteur : refusé', erreur(await rpcJoueur(db, null, 'pvp_chercher')));
  process.exit(bilan() ? 1 : 0);
})();
