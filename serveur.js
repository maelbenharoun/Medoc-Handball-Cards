'use strict';
/* Médoc Hand Cards — le compte du joueur, sur le serveur Supabase.
   Ici, on ne fait que demander : c'est le serveur (supabase/schema.sql) qui vérifie et applique les règles.
   Chaque action renvoie une promesse ; l'état reçu du serveur remplace Compte.etat.
   À la fin du fichier, « Compte » devient CompteServeur si config.js est rempli, sinon CompteAbsent
   (le jeu affiche alors qu'il n'est pas encore ouvert). */

// Réglages du jeu (table parametres) : prix, chances, coûts… remplis au démarrage
const PARAMS = {};

// Bibliothèque officielle Supabase, version fixée, chargée seulement en mode serveur
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';

function chargerScript(src) {
  return new Promise((ok, ko) => {
    if (window.supabase) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Pas de connexion au serveur'));
    document.head.appendChild(s);
  });
}
// Client Supabase partagé par le jeu et l'outil (même session pour les deux pages)
let clientSupabase = null;
async function supabaseClient() {
  if (!clientSupabase) {
    await chargerScript(SUPABASE_JS);
    clientSupabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseCle,
      {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  }
  return clientSupabase;
}
// Adresse où revenir après un lien reçu par e-mail ou la connexion Google (à autoriser dans Supabase)
const urlRetour = () => location.origin + location.pathname;

// Retour d'un lien reçu par e-mail ou de la connexion Google avec une erreur (dans l'adresse, après « ? » ou « # ») : la vraie raison
function texteErreurRetour(desc, code) {
  const d = desc || '', c = code || '';
  if (/otp_expired|expired|invalid.*(link|token)/i.test(c + ' ' + d)) return 'Ce lien a expiré ou a déjà servi : recommence';
  if (/access_denied/i.test(c) || /denied|cancel/i.test(d)) return 'Connexion Google annulée ou refusée par Google';
  if (/exchange external code/i.test(d)) return 'Google a refusé la connexion au retour (réglage Google du serveur) : connecte-toi avec ton e-mail en attendant';
  if (/provider is not enabled/i.test(d)) return 'La connexion Google n’est pas encore activée';
  if (/email/i.test(d) && /(already|exists|registered)/i.test(d)) return 'Un compte existe déjà avec cette adresse : connecte-toi avec ton e-mail et ton mot de passe';
  return 'Connexion impossible' + (d ? ' : ' + d : '');
}
// Messages d'erreur de Supabase en français
function texteErreur(e) {
  const m = e?.message || String(e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect';
  if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse avec le lien reçu par e-mail';
  if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connecte-toi';
  if (/Password should|password.*(short|characters)/i.test(m)) return 'Mot de passe trop court (8 caractères ou plus)';
  if (/weak|pwned|leaked/i.test(m)) return 'Mot de passe trop simple, choisis-en un autre';
  if (/same.*password|different from the old/i.test(m)) return 'Choisis un mot de passe différent de l’ancien';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Trop d’essais : attends quelques minutes';
  if (/valid email|invalid.*email|email.*invalid/i.test(m)) return 'Adresse e-mail invalide';
  if (/provider is not enabled/i.test(m)) return 'La connexion Google n’est pas encore activée';
  if (/fetch|network|Load failed/i.test(m)) return 'Pas de connexion au serveur';
  if (/JWT|session.*(missing|expired)|not authenticated/i.test(m)) return 'Session expirée : reconnecte-toi';
  return m || 'Action impossible';
}

const CompteServeur = (() => {
  const CACHE = 'mhc-serveur-v1';   // dernier état et catalogue connus : on peut regarder son club hors ligne
  let sb = null, session = null, S = vide(), horsLigne = false, recuperation = false, googleActif = false;
  const abonnes = [];

  function vide() {
    return {profil: false, pseudo: '', role: '', pieces: 0, niveau: 1, xp: 0, xpNiveau: 100, depart: true, boosters: 0, bonus: 0, bonusOr: 0,
      boosterMax: 5, prochainBooster: null, equipe: {}, tactique: 'equilibre', exemplaires: [], quetes: [], recu: Date.now()};
  }
  const lireCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (e) { return {}; } };
  const ecrireCache = o => { try { localStorage.setItem(CACHE, JSON.stringify({...lireCache(), ...o})); } catch (e) {} };
  const prevenir = () => abonnes.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  function majEtat(e) {
    if (!e) return;
    S = {...vide(), ...e, recu: Date.now()};   // recu : pour le compte à rebours du prochain booster
    if (session) ecrireCache({etat: S, utilisateur: session.user.id});
  }
  async function rpc(nom, args) {
    if (!sb || horsLigne) throw new Error('Pas de connexion : reviens en ligne pour jouer');
    const {data, error} = await sb.rpc(nom, args);
    if (error) throw new Error(texteErreur(error));
    if (data && data.etat) majEtat(data.etat);
    return data;
  }

  // Catalogue et réglages du jeu viennent du serveur ; l'affichage du jeu s'y adapte
  async function telechargerCatalogue() {
    const [cs, pr] = await Promise.all([sb.from('cartes').select('*'), sb.from('parametres').select('valeurs').single()]);
    for (const x of [cs, pr]) if (x.error) throw x.error;
    return {cartes: cs.data, parametres: pr.data.valeurs};
  }
  // une ligne de la table cartes → carte du jeu ; le serveur fait foi : poste, équipe, forme du joueur et photos tels que publiés
  function carteDepuisLigne(r) {
    const base = {...fusionnerCarte(r.site, r.reglages || {}), id: r.id, poste: r.poste, postes: r.postes?.length ? r.postes : r.poste ? [r.poste] : [],
      estGB: r.poste === 'GB', ecarts: r.ecarts || {}, equipe: r.equipe || r.site?.equipe, legende: !!r.legende,
      photos: r.photos || {}, photo: r.photo || null, actif: r.actif};
    return vueExemplaire(base, r.legende ? {palier: 'ultime', note: NOTE_LEGENDE} : {palier: 'bronze', note: PALIER.bronze.min});
  }
  function appliquerCatalogue({cartes, parametres}) {
    Object.assign(PARAMS, parametres);
    const brouillon = outilConnecte() ? lireBrouillon() : {};   // aperçu, seulement dans le navigateur de l'admin
    // les légendes ne font pas partie du catalogue du jeu (seul l'admin les lit) : celles qu'on possède arrivent par l'état
    const liste = cartes.filter(r => !r.legende).map(r => r.id in brouillon ? {...fusionnerCarte(r.site, brouillon[r.id] || {}), actif: r.actif} : carteDepuisLigne(r));
    liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const maj = cartes.reduce((m, r) => r.maj > m ? r.maj : m, '');
    return {cartes: liste, maj: maj.slice(0, 10), apercu: Object.keys(brouillon).length > 0};
  }

  async function connecterSession(s) {
    session = s;
    if (s) majEtat(await rpc('mon_etat')); else S = vide();
    prevenir();
  }
  const verifier = ({data, error}) => { if (error) throw new Error(texteErreur(error)); return data; };
  const auth = () => { if (!sb || horsLigne) throw new Error('Pas de connexion au serveur'); return sb.auth; };

  return {
    mode: 'serveur',
    carteDepuisLigne,
    get etat() { return S; },
    get connecte() { return !!session; },
    get pret() { return !!session && !!S.profil && !recuperation; },   // connecté, avec un profil : on peut jouer
    get recuperation() { return recuperation; },                         // arrivé par le lien « mot de passe oublié »
    get horsLigne() { return horsLigne; },
    get googleActif() { return googleActif; },
    get email() { return session?.user?.email || ''; },
    surChangement(f) { abonnes.push(f); },

    async demarrer() {
      // un lien de connexion expiré revient avec une erreur dans l'adresse
      const h = new URLSearchParams(location.hash.slice(1)), qs = new URLSearchParams(location.search);
      const descErreur = h.get('error_description') || qs.get('error_description'), codeErreur = h.get('error_code') || qs.get('error_code') || h.get('error') || qs.get('error');
      const erreurLien = descErreur || codeErreur ? texteErreurRetour(descErreur, codeErreur) : null, confirme = h.get('type') === 'signup';
      if (h.get('type') === 'recovery') recuperation = true;   // lien « mot de passe oublié » : nouveau mot de passe à choisir
      try {
        if (navigator.onLine === false) throw new Error('Pas de connexion au serveur');   // inutile d'attendre le réseau
        sb = await supabaseClient();
        // la connexion Google n'est proposée que si elle est activée sur le projet (réglages publics de l'authentification)
        fetch(CONFIG.supabaseUrl + '/auth/v1/settings', {headers: {apikey: CONFIG.supabaseCle}}).then(r => r.ok ? r.json() : null)
          .then(d => { googleActif = !!d?.external?.google; if (googleActif) prevenir(); }).catch(() => {});
        session = (await sb.auth.getSession()).data.session;
        sb.auth.onAuthStateChange((ev, s) => setTimeout(async () => {   // hors du rappel : pas d'appel Supabase dedans
          if (ev === 'PASSWORD_RECOVERY') { recuperation = true; session = s; return prevenir(); }
          if ((s?.user?.id || null) === (session?.user?.id || null)) { session = s; return; }   // simple rafraîchissement
          try { await connecterSession(s); } catch (e) { console.error(e); }
        }, 0));
        const cat = await telechargerCatalogue();
        ecrireCache({catalogue: cat});
        const info = appliquerCatalogue(cat);
        if (session) {
          try { majEtat(await rpc('mon_etat')); }
          catch (e) {   // session expirée ou compte supprimé : on repart de l'écran de connexion
            if (/Pas de connexion/.test(e.message)) throw e;
            try { await sb.auth.signOut({scope: 'local'}); } catch (e2) {}
            session = null; S = vide();
          }
        }
        if (erreurLien) history.replaceState(null, '', location.pathname);   // l'erreur peut être dans « ? » et dans « # »
        return {...info, erreurLien, confirme};
      } catch (e) {
        const c = lireCache();
        if (!c.catalogue) throw e;
        horsLigne = true;   // pas de réseau : on montre le dernier état connu, en lecture seule
        if (c.etat) S = {...vide(), ...c.etat};
        if (!session && c.etat) session = {user: {id: c.utilisateur}};
        return {...appliquerCatalogue(c.catalogue), horsLigne: true};
      }
    },

    // ── connexion ──
    async connexion(email, mdp) {
      const d = verifier(await auth().signInWithPassword({email: email.trim(), password: mdp}));
      await connecterSession(d.session);
    },
    async inscription(email, mdp) {
      const d = verifier(await auth().signUp({email: email.trim(), password: mdp, options: {emailRedirectTo: urlRetour()}}));
      if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0)
        throw new Error('Un compte existe déjà avec cet e-mail : connecte-toi');
      if (!d.session) return {confirmer: true};   // lien de confirmation envoyé par e-mail
      await connecterSession(d.session);
      return {confirmer: false};
    },
    async google() { verifier(await auth().signInWithOAuth({provider: 'google', options: {redirectTo: urlRetour()}})); },
    async oubli(email) { verifier(await auth().resetPasswordForEmail(email.trim(), {redirectTo: urlRetour()})); },
    async nouveauMotDePasse(mdp) {
      verifier(await auth().updateUser({password: mdp}));
      recuperation = false;
      await connecterSession((await auth().getSession()).data.session);
    },
    async deconnexion() {
      try { await auth().signOut(); } catch (e) {}
      ecrireCache({etat: null, utilisateur: null});
      session = null; S = vide(); prevenir();
    },
    async creerProfil(pseudo, accord) { await rpc('creer_profil', {p_pseudo: pseudo, p_accord: accord}); prevenir(); },
    async supprimerCompte() {
      await rpc('supprimer_mon_compte');
      try { await sb.auth.signOut({scope: 'local'}); } catch (e) {}
      ecrireCache({etat: null, utilisateur: null});
      session = null; S = vide(); prevenir();
    },

    // ── cartes ── (chaque action renvoie la réponse du serveur ; « niveaux » = niveaux de compte gagnés)
    rafraichir: () => rpc('mon_etat').then(majEtat),
    ouvrirDepart: () => rpc('ouvrir_depart'),                                  // → {ids}
    ouvrirBooster: type => rpc('ouvrir_booster', {p_type: type}),               // 'gratuit' | 'bonus' | 'or' → {ids}
    fusionner: (carte, palier) => rpc('fusionner', {p_carte: carte, p_palier: palier}),   // → {id, niveaux}
    entrainer: ex => rpc('entrainer', {p_ex: ex}),                              // → {avant, apres, niveaux}
    vendre: ex => rpc('vendre', {p_ex: ex}),                                    // → {gain}
    aligner: (poste, ex) => rpc('aligner', {p_poste: poste, p_ex: ex || null}),
    alignerEquipe: equipe => rpc('aligner_equipe', {p_equipe: equipe}),
    reclamerQuete: id => rpc('reclamer_quete', {p_quete: id}),                  // → {xp, pieces, niveaux}
    reclamerQueteSemaine: id => rpc('reclamer_quete_semaine', {p_quete: id}),  // → {xp, pieces, niveaux}
    ouvrirBoosterSemaine: () => rpc('ouvrir_booster_semaine'),                 // un joueur de la semaine → {ids}
    ouvrirBoosterEquipe: eq => rpc('ouvrir_booster_equipe', {p_equipe: eq}),   // une équipe du club, acheté en pièces → {ids}
    choixCoachPreparer: poste => rpc('choix_coach_preparer', {p_poste: poste}), // 3 joueurs du poste montrés → {poste, cartes}
    ouvrirBoosterHasard: () => rpc('ouvrir_booster_hasard'),                  // booster mystère : une carte parmi toutes → {ids, staff}
    ouvrirBoostersLot: eq => rpc('ouvrir_boosters_lot', {p_equipe: eq}),      // 10 boosters d'un coup (équipe, ou '?' = mystère) → {ids, staffs}
    choixCoachChoisir: i => rpc('choix_coach_choisir', {p_i: i}),               // place touchée après le mélange → {id, places, cartes}
    mesPronostics: () => rpc('mes_pronostics'),                                 // matchs à pronostiquer, résultats, classements
    pronostiquer: (rid, dom, ext, buteur) => rpc('pronostiquer', {p_rid: rid, p_dom: dom, p_ext: ext, p_buteur: buteur || null}),
    mesLigue: () => rpc('mes_ligue'),                                           // groupe de la semaine, classement, bilan
    ligueJouer: adv => rpc('ligue_jouer', {p_adv: adv}),                        // 'u:…' (joueur) ou 'b:…' (ordinateur) → {match, points, ligue}
    monClub: texte => rpc('mon_club', {p_texte: texte || null}),
    clubCreer: nom => rpc('club_creer', {p_nom: nom}),
    clubRejoindre: id => rpc('club_rejoindre', {p_club: id}),
    clubQuitter: () => rpc('club_quitter'),
    clubReclamer: palier => rpc('club_reclamer', {p_palier: palier}),
    reclamerAlbum: (equipe, palier) => rpc('reclamer_album', {p_equipe: equipe, p_palier: palier}),
    choisirCapitaine: ex => rpc('choisir_capitaine', {p_ex: ex || null}),
    fusionnerStaff: (id, palier) => rpc('fusionner_staff', {p_staff: id, p_palier: palier}),   // 3 identiques → palier suivant
    choisirStaff: id => rpc('choisir_staff', {p_staff: id || null}),         // la carte staff placée dans l'équipe (null : aucune)
    choisirPerso: (type, id) => rpc('choisir_perso', {p_type: type, p_id: id}),
    reclamerPasse: () => rpc('reclamer_passe'),                                // tous les paliers atteints → {de, a, gains}
    faireDefi: (defi, ids) => rpc('faire_defi', {p_defi: defi, p_ex: ids}),     // défi de composition → {recompense}

    // ── matchs ── (→ {match: {a, b, buts, resultat}, adversaire, gains, progres, finSaison, niveaux})
    // ── match en direct : par blocs de 5 minutes (type 'championnat' | 'defi_ami', cible = pseudo de l'ami(e)) ──
    // → {direct, vue: {bloc, minute, score, tempsMorts, nous, eux, evenements}} ; simuler = tout de suite (→ comme un match fini)
    matchCommencer: (type, cible, tactique, consigne, simuler) => rpc('match_commencer', {p_type: type, p_cible: cible, p_tactique: tactique, p_consigne: consigne, p_simuler: !!simuler}),
    matchBloc: (tactique, consigne, tempsMort) => rpc('match_bloc', {p_tactique: tactique, p_consigne: consigne, p_temps_mort: !!tempsMort}),   // fin : + match, gains…
    matchEnCours: () => rpc('match_en_cours'),
    matchSimulerFin: () => rpc('match_simuler_fin'),
    miniPreparer: jeu => rpc('mini_preparer', {p_jeu: jeu}),                   // arrêt réflexe : {indice: {colonne, hauteur}}
    miniJouer: (jeu, entrees) => rpc('mini_jouer', {p_jeu: jeu, p_entrees: entrees}),   // → {resultat, reussi, reponse, pieces, bonus, essais, restants}
    tirer7m: (x, y, puissance) => rpc('tirer_7m', {p_x: x, p_y: y, p_puissance: puissance}),   // mini-jeu → {resultat, x, y, vitesse, gardien, pieces, bonus, tirs, restants}
    rencontres: () => rpc('mes_rencontres'),

    // ── paris sur les vrais matchs ── (→ {aVenir, resultats, mesParis, min, max})
    matchsParis: () => rpc('matchs_paris'),
    parier: (rid, choix, mise) => rpc('parier', {p_rid: rid, p_choix: choix, p_mise: mise}),   // → {cote, gainPossible}

    // ── marché des transferts ── (filtre : 'tout' | 'pour_moi' | 'mes')
    // transferts par listes : {max, veux, donne, possibles, cherchent, donnent, historique}
    mesTransferts: () => rpc('mes_transferts'),
    majListesTransfert: (veux, donne) => rpc('maj_listes_transfert', {p_veux: veux, p_donne: donne}),
    transferer: (pseudo, donne, recoit, palier) => rpc('transferer', {p_pseudo: pseudo, p_donne: donne, p_recoit: recoit, p_palier: palier}),

    // ── équipe : choix tactiques « attaque:défense » (duels | enclenchement | rapide : 06 | 15 | 33) ──
    choisirTactique: tactique => rpc('choisir_tactique', {p_tactique: tactique}),

    // ── social : classement des poules, ami(e)s, échanges entre ami(e)s (3 propositions par jour) ──
    classementPoules: () => rpc('classement_poules'),                              // → {joueurs: [{pseudo, niveau, nom, groupe, pts, moi}]}
    mesAmis: () => rpc('mes_amis'),                                                // → {amis, recues, envoyees, echanges, restants, limite}
    ajouterAmi: pseudo => rpc('ajouter_ami', {p_pseudo: pseudo}),
    repondreAmi: (pseudo, oui) => rpc('repondre_ami', {p_pseudo: pseudo, p_accepte: oui}),
    retirerAmi: pseudo => rpc('retirer_ami', {p_pseudo: pseudo}),
    clubAmi: pseudo => rpc('club_ami', {p_pseudo: pseudo}),                       // → [{id, carte, palier, note}]
    proposerEchange: (pseudo, donne, demande) => rpc('proposer_echange', {p_pseudo: pseudo, p_donne: donne, p_demande: demande}),
    repondreEchange: (id, oui) => rpc('repondre_echange', {p_id: id, p_accepte: oui}),
    annulerEchange: id => rpc('annuler_echange', {p_id: id}),
    conversation: pseudo => rpc('conversation', {p_pseudo: pseudo}),            // → {pseudo, messages: [{moi, texte, le}]} (marque comme lus)
    envoyerMessage: (pseudo, texte) => rpc('envoyer_message', {p_pseudo: pseudo, p_texte: texte}),
  };
})();

// config.js vide : le jeu n'est pas encore relié à son serveur
const CompteAbsent = {
  mode: 'absent', pret: false, connecte: false, horsLigne: false, recuperation: false, email: '', etat: {exemplaires: [], equipe: {}},
  surChangement() {}, demarrer: () => Promise.resolve({cartes: [], maj: ''}),
};

const Compte = CONFIG.supabaseUrl && CONFIG.supabaseCle ? CompteServeur : CompteAbsent;
