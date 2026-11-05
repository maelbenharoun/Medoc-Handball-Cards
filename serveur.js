'use strict';
/* Médoc Hand Cards — compte en ligne sur le serveur Supabase.
   Même interface que CompteLocal (compte.js), plus la connexion et les échanges.
   Ici, on ne fait que demander : c'est le serveur (supabase/schema.sql) qui vérifie et applique les règles.
   À la fin du fichier, « Compte » devient CompteServeur si config.js est rempli, sinon CompteLocal. */

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
  let sb = null, session = null, S = vide(), horsLigne = false, recuperation = false;
  const abonnes = [];

  function vide() {
    return {profil: false, pseudo: '', role: '', pieces: 0, possede: {}, equipe: {}, dernierBonus: '', bonusDispo: false, packs: 0, bienvenue: true};
  }
  const lireCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (e) { return {}; } };
  const ecrireCache = o => { try { localStorage.setItem(CACHE, JSON.stringify({...lireCache(), ...o})); } catch (e) {} };
  const prevenir = () => abonnes.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  function majEtat(e) {
    if (!e) return;
    S = {...vide(), ...e};
    if (session) ecrireCache({etat: S, utilisateur: session.user.id});
  }
  async function rpc(nom, args) {
    if (!sb || horsLigne) throw new Error('Pas de connexion : reviens en ligne pour jouer');
    const {data, error} = await sb.rpc(nom, args);
    if (error) throw new Error(texteErreur(error));
    if (data && data.etat) majEtat(data.etat);
    return data;
  }

  // Catalogue, règles et packs viennent du serveur ; l'affichage du jeu s'y adapte
  async function telechargerCatalogue() {
    const [cs, rg, pk] = await Promise.all([sb.from('cartes').select('*'), sb.from('regles').select('*').single(),
      sb.from('packs').select('*').order('ordre')]);
    for (const x of [cs, rg, pk]) if (x.error) throw x.error;
    return {cartes: cs.data, regles: rg.data, packs: pk.data};
  }
  function appliquerCatalogue({cartes, regles, packs}) {
    Object.assign(REGLES, {depart: regles.depart, bonusJour: regles.bonus_jour, packBienvenue: regles.pack_bienvenue,
      echangeMaxCartes: regles.echange_max_cartes, echangesParJour: regles.echanges_par_jour});
    Object.assign(VENTE, regles.vente);
    PACKS.splice(0, PACKS.length, ...packs.map(p => ({id: p.id, nom: p.nom, prix: p.prix, n: p.n, poids: p.poids, garanti: p.garanti, desc: p.description})));
    const brouillon = outilConnecte() ? lireBrouillon() : {};   // aperçu, seulement dans le navigateur de l'admin
    const liste = cartes.map(r => r.id in brouillon && brouillon[r.id] !== undefined
      ? {...fusionnerCarte(r.site, brouillon[r.id] || {}), actif: r.actif}
      : {...fusionnerCarte(r.site, r.reglages || {}), poste: r.poste, estGB: r.poste === 'GB', s: r.stats, ovr: r.ovr,
         rarete: r.rarete, photo: r.photo, actif: r.actif});
    liste.sort((a, b) => b.ovr - a.ovr || a.nom.localeCompare(b.nom, 'fr'));
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
    get etat() { return S; },
    get connecte() { return !!session; },
    get pret() { return !!session && !!S.profil && !recuperation; },   // connecté, avec un profil : on peut jouer
    get recuperation() { return recuperation; },                         // arrivé par le lien « mot de passe oublié »
    get horsLigne() { return horsLigne; },
    get email() { return session?.user?.email || ''; },
    surChangement(f) { abonnes.push(f); },

    async demarrer() {
      // un lien de connexion expiré revient avec une erreur dans l'adresse
      const h = new URLSearchParams(location.hash.slice(1));
      const erreurLien = h.get('error_description'), confirme = h.get('type') === 'signup';
      if (h.get('type') === 'recovery') recuperation = true;   // lien « mot de passe oublié » : nouveau mot de passe à choisir
      try {
        if (navigator.onLine === false) throw new Error('Pas de connexion au serveur');   // inutile d'attendre le réseau
        sb = await supabaseClient();
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
        if (erreurLien) history.replaceState(null, '', location.pathname + location.search);
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

    // ── jeu (mêmes actions que CompteLocal) ──
    bonusDisponible: () => !!S.bonusDispo,
    packOffert: id => id === REGLES.packBienvenue && !S.bienvenue,
    ouvrirPack: id => rpc('ouvrir_pack', {p_pack: id}).then(d => ({ids: d.ids, nouveaux: d.nouveaux})),
    recupererBonus: () => rpc('recuperer_bonus').then(d => ({gain: d.gain})),
    vendre: id => rpc('vendre', {p_carte: id}).then(d => ({gain: d.gain})),
    vendreDoublons: () => rpc('vendre_doublons').then(d => ({gain: d.gain})),
    aligner: (poste, id) => rpc('aligner', {p_poste: poste, p_carte: id || null}).then(() => ({equipe: S.equipe})),
    alignerEquipe: equipe => rpc('aligner_equipe', {p_equipe: equipe}).then(() => ({equipe: S.equipe})),

    // ── échanges ──
    echanges: () => rpc('mes_echanges'),
    chercherJoueurs: texte => rpc('chercher_joueurs', {p_texte: texte}),
    clubDe: pseudo => rpc('club_de', {p_pseudo: pseudo}),
    proposerEchange: (pseudo, offre, demande) => rpc('proposer_echange', {p_pseudo: pseudo, p_offre: offre, p_demande: demande}),
    repondreEchange: (id, accepte) => rpc('repondre_echange', {p_id: id, p_accepte: accepte}),
    annulerEchange: id => rpc('annuler_echange', {p_id: id}),
  };
})();

const Compte = CONFIG.supabaseUrl && CONFIG.supabaseCle ? CompteServeur : CompteLocal;
