'use strict';
/* Outil de gestion des cartes (admin.html) : postes de jeu, 6 stats (forme du joueur) et une photo par palier de chaque carte ;
   équipe, description, légende du club ; création de cartes qui ne sont pas sur le site (mode serveur).
   Les modifications vont d'abord dans un brouillon (localStorage, visible en aperçu dans le jeu du même navigateur),
   puis « Publier » les enregistre :
   - mode serveur (config.js rempli) : dans la base Supabase (table cartes) et son stockage de photos,
     avec le compte administrateur ;
   - sinon : dans le dépôt GitHub en un seul commit (data/perso.json + assets/photos/), avec un jeton.
   Cartes staff (mode serveur) : une vraie personne par carte (nom, description, une photo par palier), publiées tout de suite
   (admin_publier_staff) ; leur passif est une règle du serveur et ne se règle pas ici. */

// photos recadrées en portrait 420×480 (format de la photo sur la carte), fond transparent gardé
// (photos détourées) en WebP, ou PNG si le navigateur ne sait pas faire de WebP ; les métadonnées, GPS compris, disparaissent
const PHOTO_L = 420, PHOTO_H = 480;
function exporterPhoto(cv) {
  const w = cv.toDataURL('image/webp', .9);
  return w.startsWith('data:image/webp') ? w : cv.toDataURL('image/png');
}
const extension = donnees => /^data:image\/(webp|png)/.exec(donnees)?.[1] || 'jpg';

let SITE = [], PAR_ID = {}, PERSO = {}, SOURCE = '';
let BROUILLON = lireBrouillon();
let REGL = lireReglages();
const PHOTOS_LOCALES = {};   // photos publiées pendant cette session, le temps que GitHub Pages les mette en ligne
let filtre = 'tous', filtrePoste = 'tous', tri = 'nom', recherche = '', ed = null;   // filtres : équipe, poste ; tri : nom ou poste
const EQUIPES_CARTES = ['SF1', 'SF2', 'SG1', 'SG2'];
// identifiant d'une carte créée : nom sans accents, en minuscules, mots reliés par des tirets (comme le site)
const slugAdmin = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
// une carte créée (pas sur le site) rejoint la liste ; SITE et PAR_ID partagent le même objet
function ajouterCreee(c) { if (!c?.id) return; if (PAR_ID[c.id]) Object.assign(PAR_ID[c.id], c); else { const x = {...c}; SITE.push(x); PAR_ID[c.id] = x; } }

const $ = s => document.querySelector(s);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }

function lireReglages() {
  const def = {depot: 'maelbenharoun/medoc-handball-cards', branche: 'main', jeton: ''};
  try { return {...def, ...JSON.parse(localStorage.getItem(CLE_OUTIL_GITHUB))}; } catch (e) { return def; }
}
function sauverReglages() { try { localStorage.setItem(CLE_OUTIL_GITHUB, JSON.stringify(REGL)); } catch (e) {} }
function sauverBrouillon() {
  try { localStorage.setItem(CLE_BROUILLON, JSON.stringify(BROUILLON)); return true; }
  catch (e) { alert('La mémoire du navigateur est pleine (photos). Publie tes modifications avant d’en faire d’autres.'); return false; }
}

// Réglages publiés + brouillon → cartes affichées
function persoCourant() {
  const p = appliquerBrouillon(PERSO, BROUILLON);
  for (const id in p) p[id] = {...p[id], photo: p[id].photo && local(p[id].photo),
    photos: p[id].photos && Object.fromEntries(Object.entries(p[id].photos).map(([k, v]) => [k, local(v)]))};
  return p;
}
function cartes() { return fusionner(SITE, persoCourant()); }
const memeEntree = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ── GitHub ──────────────────────────────────────────────────────────────────────
async function gh(chemin, methode = 'GET', corps, brut) {
  const r = await fetch(`https://api.github.com/repos/${REGL.depot}/${chemin}`, {
    method: methode, cache: 'no-store', body: corps ? JSON.stringify(corps) : undefined,
    headers: {Authorization: `Bearer ${REGL.jeton}`, 'X-GitHub-Api-Version': '2022-11-28',
      Accept: brut ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', ...(corps ? {'Content-Type': 'application/json'} : {})},
  });
  if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; }
  return brut ? r.text() : r.json();
}
function erreurGitHub(e) {
  if (e.status === 401) return 'Jeton refusé : il est expiré ou mal copié.';
  if (e.status === 403 || e.status === 404) return `Le jeton n’a pas accès en écriture à ${REGL.depot} (branche ${REGL.branche}). Vérifie « Contents : Read and write ».`;
  if (e.status === 409 || e.status === 422) return 'Le dépôt a changé pendant la publication. Réessaie.';
  return 'Impossible de joindre GitHub. Vérifie ta connexion.';
}
async function lirePersoGitHub(ref) {
  try { return JSON.parse(await gh(`contents/data/perso.json?ref=${encodeURIComponent(ref)}`, 'GET', null, true)).cartes || {}; }
  catch (e) { if (e.status === 404) return {}; throw e; }
}
function textePerso(cartes) {
  const tri = {}; Object.keys(cartes).sort().forEach(k => tri[k] = cartes[k]);
  return JSON.stringify({v: 1, maj: new Date().toLocaleDateString('fr-CA'), cartes: tri}, null, 1) + '\n';
}

async function publier() {
  const ids = Object.keys(BROUILLON);
  if (!ids.length) return;
  if (!REGL.jeton) return reglages('Ajoute ton jeton GitHub pour publier.');
  const bouton = $('#publier .btn.gold'); bouton.disabled = true; bouton.textContent = 'Publication…';
  try {
    const base = (await gh(`git/ref/heads/${REGL.branche}`)).object.sha;
    const arbreBase = (await gh(`git/commits/${base}`)).tree.sha;
    const actuel = await lirePersoGitHub(base);   // dernière version publiée (un autre appareil a pu publier entre-temps)
    const nouveau = {...actuel}, fichiers = [], locales = {};
    for (const id of ids) {
      const e = await deposerPhotos(id, BROUILLON[id], async (donnees, nom) => {
        const chemin = `assets/photos/${nom}-${unique()}.${extension(donnees)}`;
        const blob = await gh('git/blobs', 'POST', {content: donnees.split(',')[1], encoding: 'base64'});
        fichiers.push({path: chemin, mode: '100644', type: 'blob', sha: blob.sha});
        locales[chemin] = donnees; return chemin;
      });
      const gardees = photosDe(e);   // anciennes photos remplacées ou retirées : supprimées du dépôt
      for (const v of photosDe(actuel[id])) if (!gardees.includes(v) && v.startsWith('assets/photos/')) fichiers.push({path: v, mode: '100644', type: 'blob', sha: null});
      if (e) nouveau[id] = e; else delete nouveau[id];
    }
    fichiers.push({path: 'data/perso.json', mode: '100644', type: 'blob', content: textePerso(nouveau)});
    const arbre = await gh('git/trees', 'POST', {base_tree: arbreBase, tree: fichiers});
    const noms = ids.map(id => PAR_ID[id]?.nom || id);
    const message = `Cartes : ${noms.length > 3 ? noms.length + ' cartes modifiées' : noms.join(', ')} (outil de gestion)`;
    const commit = await gh('git/commits', 'POST', {message, tree: arbre.sha, parents: [base]});
    await gh(`git/refs/heads/${REGL.branche}`, 'PATCH', {sha: commit.sha});
    Object.assign(PHOTOS_LOCALES, locales);
    PERSO = nouveau; BROUILLON = {}; sauverBrouillon();
    toast('Publié ! Le jeu en ligne sera à jour d’ici 1 à 2 minutes.');
  } catch (e) {
    console.error(e); alert(e.status ? erreurGitHub(e) : 'La publication a échoué : ' + e.message);
  }
  vue();
}

// ── serveur Supabase ────────────────────────────────────────────────────────────
const SERVEUR = !!(CONFIG.supabaseUrl && CONFIG.supabaseCle);
let sbA = null, adminOk = false, emailAdmin = '', IDS_SERVEUR = [];
const DOSSIER_PHOTOS = '/storage/v1/object/public/photos/';

function marquerAdmin(oui) {   // le jeu de ce navigateur montre alors l'aperçu du brouillon
  try { if (oui) localStorage.setItem(CLE_OUTIL_GITHUB, JSON.stringify({admin: true})); else localStorage.removeItem(CLE_OUTIL_GITHUB); } catch (e) {}
}
async function chargerServeur() {
  sbA = await supabaseClient();
  const session = (await sbA.auth.getSession()).data.session;
  emailAdmin = session?.user?.email || '';
  adminOk = false;
  if (session) { const r = await sbA.rpc('est_admin'); adminOk = !r.error && r.data === true; }
  marquerAdmin(adminOk);
  const {data, error} = await sbA.from('cartes').select('id, reglages, site, legende');
  if (error) throw error;
  IDS_SERVEUR = data.map(r => r.id);
  data.forEach(r => { if (r.site?.cree) ajouterCreee({...r.site, id: r.id}); });   // cartes créées dans l'outil
  if (!data.length) {   // premier lancement : on part des réglages de data/perso.json
    PERSO = await fetch('data/perso.json', {cache: 'no-store'}).then(r => r.ok ? r.json() : {}).then(p => p.cartes || {}).catch(() => ({}));
  } else { PERSO = {}; data.forEach(r => { if (r.reglages) PERSO[r.id] = r.reglages; }); }
  SOURCE = !session ? 'pas connecté : touche « Compte »'
    : !adminOk ? `<span class="warn">${esc(emailAdmin)} n’est pas administrateur</span>`
    : !data.length ? '<span class="warn">catalogue du serveur vide : touche « Synchroniser avec le site »</span>'
    : `serveur Supabase · ${esc(emailAdmin)}`;
}
// carte telle qu'enregistrée sur le serveur : stats du site + réglages, note et rareté calculées par cartes.js
function ligneServeur(id, reglages) {
  const {base, ...rg} = reglages || {}, site = base ? {...base, id} : PAR_ID[id], c = fusionnerCarte(site, rg);
  return {id, nom: c.nom, equipe: c.equipe, poste: c.poste, postes: c.postes, stats: c.stats, ecarts: c.ecarts, photos: c.photos, photo: c.photo, site,
    reglages: Object.keys(rg).length ? rg : null, legende: c.legende};
}
// envoie ces cartes au serveur (photos du brouillon déposées d'abord) ; complet : les autres ne sont plus tirées
async function envoyer(ids, complet) {
  const bouton = $('#publier .btn.gold'); if (bouton) { bouton.disabled = true; bouton.textContent = 'Publication…'; }
  try {
    const nouveau = {...PERSO}, lignes = [], aSupprimer = [];
    for (const id of ids) {
      const e = await deposerPhotos(id, id in BROUILLON ? BROUILLON[id] : PERSO[id] || null, async (donnees, nom) => {
        const chemin = `${nom}-${unique()}.${extension(donnees)}`;
        const blob = await (await fetch(donnees)).blob();
        const {error} = await sbA.storage.from('photos').upload(chemin, blob, {contentType: blob.type || 'image/jpeg', cacheControl: '31536000'});
        if (error) throw error;
        return sbA.storage.from('photos').getPublicUrl(chemin).data.publicUrl;
      });
      const gardees = photosDe(e);   // anciennes photos remplacées ou retirées : supprimées du stockage
      for (const v of photosDe(PERSO[id])) if (!gardees.includes(v) && v.includes(DOSSIER_PHOTOS)) aSupprimer.push(v.split(DOSSIER_PHOTOS)[1]);
      lignes.push(ligneServeur(id, e));
      if (e) nouveau[id] = e; else delete nouveau[id];
    }
    const {data, error} = await sbA.rpc('admin_publier_cartes', {p_cartes: lignes, p_complet: !!complet});
    if (error) throw error;
    if (aSupprimer.length) await sbA.storage.from('photos').remove(aSupprimer);   // anciennes photos remplacées
    ids.forEach(id => delete BROUILLON[id]); sauverBrouillon();
    PERSO = nouveau; IDS_SERVEUR = [...new Set([...IDS_SERVEUR, ...ids])];
    toast(`Publié : ${data.cartes} carte${data.cartes > 1 ? 's' : ''}${data.retirees ? `, ${data.retirees} retirée${data.retirees > 1 ? 's' : ''} des packs` : ''}. Le jeu est à jour.`);
    await charger();
  } catch (e) {
    console.error(e); alert('La publication a échoué : ' + texteErreur(e)); vue();
  }
}
function publierServeur() {
  if (!adminOk) return connexionAdmin('Connecte-toi avec le compte administrateur pour publier.');
  if (!IDS_SERVEUR.length) return synchroniser();   // catalogue vide : on envoie tout
  return envoyer(Object.keys(BROUILLON).filter(id => PAR_ID[id]), false);
}
// Vrais matchs des poules (data/matchs.json) : mis à jour sur le serveur, et les paris dont le résultat est connu sont réglés
async function envoyerMatchs(silencieux) {
  try {
    const d = await fetch('data/matchs.json', {cache: 'no-store'}).then(r => { if (!r.ok) throw new Error('data/matchs.json introuvable'); return r.json(); });
    const {data, error} = await sbA.rpc('admin_publier_matchs', {p_matchs: d.matchs});
    if (error) throw error;
    toast(`${data.matchs} matchs à jour, ${data.parisRegles} pari${data.parisRegles > 1 ? 's' : ''} réglé${data.parisRegles > 1 ? 's' : ''}`);
  } catch (e) { console.error(e); if (!silencieux) alert('Envoi des matchs impossible : ' + texteErreur(e)); }
  return envoyerAdversaires();
}
// Vraies équipes du parcours (data/adversaires.json) : les nouvelles saisons les prennent
async function envoyerAdversaires() {
  try {
    const d = await fetch('data/adversaires.json', {cache: 'no-store'}).then(r => { if (!r.ok) throw new Error('data/adversaires.json introuvable'); return r.json(); });
    const {error} = await sbA.rpc('admin_publier_adversaires', {p_niveaux: d.niveaux});
    if (error) throw error;
  } catch (e) { console.error(e); toast('Équipes du parcours non envoyées : ' + texteErreur(e)); }
}
function synchroniser() {
  if (!adminOk) return connexionAdmin('Connecte-toi avec le compte administrateur.');
  const partis = IDS_SERVEUR.filter(id => !PAR_ID[id]);
  const msg = `Envoyer au serveur les ${SITE.length} cartes de data/cartes.json, avec tes réglages${Object.keys(BROUILLON).length ? ' et ton brouillon' : ''} ?`
    + (partis.length ? `\n\n${partis.length} carte(s) absente(s) du site ne seront plus tirées dans les packs (elles restent dans les clubs) : ${partis.join(', ')}` : '');
  if (confirm(msg)) envoyer(SITE.map(c => c.id), true).then(() => envoyerMatchs(true));
}
function connexionAdmin(msg) {
  const o = $('#overlay'); o.hidden = false;
  o.innerHTML = `<div class="sheet"><h3>Compte administrateur</h3>
    ${msg ? `<p class="sub warn">${esc(msg)}</p>` : ''}
    ${emailAdmin ? `<p class="sub">Connecté : ${esc(emailAdmin)}${adminOk ? ' (administrateur)' : ' (pas administrateur)'}</p>
      <div class="ed-btns"><button class="btn ghost" data-act="a-deco">Se déconnecter</button><button class="btn" data-act="fermer">Fermer</button></div>`
    : `<form class="form" data-form="admin">
        <input class="champ" type="email" name="email" placeholder="E-mail" autocomplete="email" required>
        <input class="champ" type="password" name="mdp" placeholder="Mot de passe" autocomplete="current-password" required>
        <button class="btn gold" type="submit">Se connecter</button></form>
      <div class="ou"><span>ou</span></div><button class="btn ghost large" data-act="a-google">Continuer avec Google</button>
      <button class="btn" data-act="fermer">Fermer</button>`}
    <p class="sub petit">Même compte que dans le jeu. Il devient administrateur dans Supabase (docs/SERVEUR.md).</p></div>`;
}

// ── liste des cartes ────────────────────────────────────────────────────────────
function vue() {
  const toutes = cartes(), sansPoste = toutes.filter(c => !c.postes.length).length;
  const parPoste = p => toutes.filter(c => c.postes.includes(p)).length;
  $('#view').innerHTML = `<h1>Gestion des cartes</h1>
    <p class="sub">${SITE.length} cartes · ${Object.keys(PERSO).length} réglée${Object.keys(PERSO).length > 1 ? 's' : ''} · ${SOURCE}</p>
    ${SERVEUR && adminOk ? '<p class="actions-admin"><button class="btn gold petit" data-act="creer">＋ Créer une carte</button> <button class="btn ghost petit" data-act="synchro">Synchroniser avec le site</button> <button class="btn ghost petit" data-act="matchs">Matchs, paris et équipes du parcours</button> <button class="btn ghost petit" data-act="staff">Cartes staff</button></p>' : ''}
    <input class="champ" type="search" placeholder="Chercher un nom" value="${esc(recherche)}" data-recherche>
    <div class="filters">${[['tous', 'Toutes'], ['SG1'], ['SG2'], ['SF1'], ['SF2'], ['legendes', `Légendes (${toutes.filter(c => c.legende).length})`]]
      .map(([k, l]) => `<button data-filtre="${k}" class="${filtre === k ? 'on' : ''}">${l || k}</button>`).join('')}</div>
    <div class="filters">${[['tous', 'Tous les postes'], ...POSTES_JEU.map(p => [p, `${p} (${parPoste(p)})`]), ['sans', `Sans poste (${sansPoste})`]]
      .map(([k, l]) => `<button data-fposte="${k}" class="${filtrePoste === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="filters tri"><span>Trier :</span>${[['nom', 'Nom'], ['poste', 'Poste']]
      .map(([k, l]) => `<button data-tri="${k}" class="${tri === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="rows" id="rows"></div>`;
  majListe();
  const n = Object.keys(BROUILLON).length, pub = $('#publier');
  pub.hidden = !n;
  pub.innerHTML = n ? `<span><b>${n} modification${n > 1 ? 's' : ''}</b> non publiée${n > 1 ? 's' : ''}</span>
    <button class="btn ghost petit" data-act="jeter">Annuler</button><button class="btn gold" data-act="publier">Publier</button>` : '';
}
// la liste seule (la recherche ne redessine pas le champ, pour garder le clavier ouvert)
function majListe() {
  const q = recherche.trim().toLowerCase();
  // poste : le joueur apparaît à chacun de ses postes ; tri par poste = par poste principal, puis par nom
  const rang = c => c.postes.length ? POSTES_JEU.indexOf(c.postes[0]) : POSTES_JEU.length;
  const liste = cartes().filter(c => (filtre === 'tous' || (filtre === 'legendes' ? c.legende : c.equipe === filtre))
    && (filtrePoste === 'tous' || (filtrePoste === 'sans' ? !c.postes.length : c.postes.includes(filtrePoste)))
    && (!q || c.nom.toLowerCase().includes(q)))
    .sort((a, b) => (tri === 'poste' ? rang(a) - rang(b) : 0) || a.nom.localeCompare(b.nom, 'fr'));
  let groupe = null;
  $('#rows').innerHTML = liste.map(c => {
      const g = c.postes.length ? POSTE_NOM[c.postes[0]] : 'Sans poste';
      const titre = tri === 'poste' && g !== groupe ? `<h3 class="groupe">${g} <small>(${liste.filter(x => (x.postes.length ? POSTE_NOM[x.postes[0]] : 'Sans poste') === g).length})</small></h3>` : '';
      groupe = g;
      const principal = filtrePoste !== 'tous' && filtrePoste !== 'sans' && c.postes.length > 1
        ? (c.postes[0] === filtrePoste ? ' · principal' : ` · principal ${c.postes[0]}`) : '';
      const etat = (c.legende ? '<span class="tag leg">légende</span>' : '') + (c.cree ? '<span class="tag cree">créée</span>' : '')
        + (c.id in BROUILLON ? '<span class="tag br">brouillon</span>' : PERSO[c.id] ? '<span class="tag">réglée</span>' : '');
      return `${titre}<button class="row" data-ed="${c.id}">${carteHTML(c)}<div><b>${esc(c.nom)}</b>
        <small>${c.postes.length ? nomsPostes(c) : 'Poste non défini'}${principal} · ${c.equipe}</small>
        <small>Photos ${RARETES.filter(r => c.photos[r]).length}/4${c.photo && !Object.keys(c.photos).length ? ' (photo unique)' : ''} · ${c.stats ? 'forme ' + (PERSO[c.id]?.stats || BROUILLON[c.id]?.stats ? 'réglée' : 'par défaut') : ''}</small></div>${etat ? `<span class="tags">${etat}</span>` : ''}</button>`;
    }).join('') || '<p class="sub">Aucune carte.</p>';
}

// ── édition d'une carte ─────────────────────────────────────────────────────────
// Le palier choisi sert à la fois à l'aperçu (note du bas du palier) et à la photo qu'on règle
function ouvrir(id) {
  const p = appliquerBrouillon(PERSO, BROUILLON)[id] || {}, c = fusionnerCarte(PAR_ID[id], p);
  // postes réglés à la main (le premier = principal) ; vide = valeur par défaut (GB pour un gardien du site)
  const site = PAR_ID[id];
  ed = {id, postes: Array.isArray(p.postes) ? [...p.postes] : p.poste ? [p.poste] : [], stats: statsValides(p.stats, c.poste) ? {...p.stats} : null,
    numero: Number.isInteger(p.numero) ? p.numero : null, fiche: JSON.parse(JSON.stringify(p.fiche || {})),
    photos: {...(p.photos || {})}, photo: p.photo || null, palier: c.legende ? 'ultime' : 'bronze', img: null, cadre: null,
    equipe: c.equipe, legende: c.legende, cree: !!site.cree, nom: site.nom, genre: site.genre || 'F', vals: null};
  const o = $('#overlay'); o.hidden = false; document.body.style.overflow = 'hidden';
  o.innerHTML = `<div class="sheet editeur">
    <div class="ed-haut"><div id="apercu"></div><div class="ed-note"><small>Palier</small><b id="note"></b><small id="note-site"></small></div></div>
    <div class="filters postes" id="paliers"></div>
    <h3 id="ed-titre">${esc(c.nom)} <small>${c.equipe}</small></h3>
    ${ed.cree ? `<div class="ed-ligne"><label class="lab">Nom<input class="champ" id="ed-nom" maxlength="40" value="${esc(ed.nom)}"></label>
      <label class="lab">Genre<select class="champ" id="ed-genre"><option value="F"${ed.genre === 'F' ? ' selected' : ''}>Fille</option><option value="M"${ed.genre === 'M' ? ' selected' : ''}>Garçon</option></select></label></div>` : ''}
    <h4>Équipe</h4><div class="filters postes" id="equipes"></div>
    <label class="ed-leg"><input type="checkbox" id="ed-legende"${ed.legende ? ' checked' : ''}><span><b>Légende du club</b>
      <small>Une seule édition (Ultime, cadre à part), tirée 1 fois sur 500 dans le booster gratuit, jamais montrée ailleurs dans le jeu.</small></span></label>
    <h4>Description <small id="desc-n"></small></h4>
    <textarea class="champ" id="ed-desc" rows="2" maxlength="160" placeholder="Ex. Capitaine de la SF1, la reine des contre-attaques.">${esc(ed.fiche.intro || '')}</textarea>
    <p class="sub petit">Une petite phrase, affichée sur la fiche du joueur, sous son nom.</p>
    <h4>Postes de jeu</h4><div class="filters postes" id="postes"></div><p class="sub petit" id="aide-postes"></p>
    <h4>Numéro de maillot</h4><input class="champ numero" type="number" min="0" max="99" id="numero" inputmode="numeric" placeholder="Ex. 10">
    <h4>Stats <button class="lien" data-act="defaut">Remettre par défaut</button></h4><div id="stats"></div>
    <h4 id="titre-photo">Photo</h4>
    <div class="photo"><canvas id="cadre" width="${PHOTO_L}" height="${PHOTO_H}"></canvas>
      <div class="photo-ctl"><label class="btn ghost petit">Choisir une photo<input type="file" accept="image/*" id="fichier" hidden></label>
      <button class="btn ghost petit" data-act="sansphoto">Retirer</button>
      <div id="reglages-photo"></div></div></div>
    <p class="note-photo">Une photo par palier (sinon celle du palier en dessous). Seulement avec l’accord de la personne (de ses parents si elle est mineure) : le jeu est public.</p>
    <details class="fe-plie"><summary>Fiche du joueur (ce que le jeu montre quand on touche la carte)</summary>
    <p class="sub petit">Tout se change : texte, intitulés, valeurs, lignes et sections en plus, ou masqués.
      Une ligne que tu ne touches pas suit les stats du site à chaque mise à jour. Uniquement des infos sportives (pas d’adresse, d’école, de date de naissance…).
      <button class="lien" data-fi-tout>Tout remettre comme le site</button></p>
    <div id="fiche-ed"></div></details>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button><button class="btn gold" data-act="enregistrer">Enregistrer</button></div>
  </div>`;
  $('#numero').value = ed.numero ?? '';
  majFiche();
  // sans numéro réglé à la main, la carte prend celui des feuilles de match
  $('#numero').placeholder = Number.isInteger(PAR_ID[id].numero) ? `Feuilles de match : ${PAR_ID[id].numero}` : 'Ex. 10';
  chargerPhoto();
  majEditeur();
}

function entree() {
  const r = {}, site = PAR_ID[ed.id];
  if (ed.cree) r.base = carteCreee(ed.id, {nom: (ed.nom || '').trim() || site.nom, genre: ed.genre, equipe: ed.equipe, legende: ed.legende,
    poste: ed.postes[0] === 'GB' ? 'GB' : 'JDC'});
  else {
    if (ed.equipe && ed.equipe !== site.equipe) r.equipe = ed.equipe;
    if (ed.legende !== !!site.legende) r.legende = ed.legende;
  }
  if (ed.postes.length) r.postes = [...ed.postes];
  if (ed.numero != null) r.numero = ed.numero;
  if (ed.stats) { r.stats = {}; statsDu(posteEd()).forEach(([k]) => r.stats[k] = ed.stats[k]); }
  if (Object.keys(ed.photos).length) r.photos = {...ed.photos};
  if (ed.photo) r.photo = ed.photo;
  const f = ficheNette(ed.fiche);
  if (f) r.fiche = f;
  return Object.keys(r).length ? r : null;
}

// ── fiche du joueur : ed.fiche ne garde que ce qui diffère des stats du site (voir ficheDe dans cartes.js) ──
function ficheNette(f) {
  const r = {};
  if (f.intro?.trim()) r.intro = f.intro.trim().slice(0, 800);
  if (f.titres && Object.keys(f.titres).length) r.titres = f.titres;
  if (f.caches?.length) r.caches = [...new Set(f.caches)];
  if (f.lignes && Object.keys(f.lignes).length) r.lignes = f.lignes;
  if (f.sections?.length) r.sections = f.sections;
  if (f.ajouts?.length) r.ajouts = f.ajouts;
  return Object.keys(r).length ? r : null;
}
const ficheAuto = () => PAR_ID[ed.id].fiche || [];
function majFiche() {
  const fi = ficheDe(ficheAuto(), ed.fiche), a = v => esc(v ?? '');
  $('#fiche-ed').innerHTML = fi.sections.map(sec => `<div class="fe-sec${sec.cache ? ' off' : ''}">
      <div class="fe-tete"><input class="champ" data-fi-titre="${a(sec.id)}" value="${a(sec.titre)}" placeholder="Titre de la section">
        <button class="btn ghost petit" data-fi-cache="${a(sec.id)}">${sec.cache ? 'Afficher' : 'Masquer'}</button>
        ${sec.auto ? '' : `<button class="btn ghost petit" data-fi-suppr-sec="${a(sec.id)}">Supprimer</button>`}</div>
      ${sec.lignes.map(x => `<div class="fe-l${x.cache ? ' off' : ''}${x.modifie ? ' modif' : ''}">
        <input class="champ" data-fi-champ="l" data-fi-cle="${a(x.cle)}" value="${a(x.l)}" placeholder="Intitulé">
        <input class="champ" data-fi-champ="v" data-fi-cle="${a(x.cle)}" value="${a(x.v)}" placeholder="Valeur">
        ${sec.style === 'fun' || x.d ? `<textarea class="champ" rows="2" data-fi-champ="d" data-fi-cle="${a(x.cle)}" placeholder="Phrase">${a(x.d)}</textarea>` : ''}
        <div class="fe-b">${x.modifie ? `<button class="lien" data-fi-reset="${a(x.cle)}">↺ Valeur du site</button>` : ''}
          <button class="lien" data-fi-cache="${a(x.cle)}">${x.cache ? 'Afficher' : 'Masquer'}</button>
          ${x.ajout ? `<button class="lien" data-fi-suppr="${a(x.cle)}">Supprimer</button>` : ''}</div></div>`).join('')}
      <button class="lien" data-fi-ajout="${a(sec.id)}">+ Ajouter une ligne</button></div>`).join('')
    + `<p class="fe-ajout"><button class="btn ghost petit" data-fi-sec="lignes">+ Section de lignes</button>
      <button class="btn ghost petit" data-fi-sec="fun">+ Section « stats rigolotes »</button></p>`;
}
function ficheSaisie(t) {
  const f = ed.fiche;
  if (t.dataset.fiIntro !== undefined) { f.intro = t.value; return; }
  if (t.dataset.fiTitre !== undefined) {
    const id = t.dataset.fiTitre, ajoutee = (f.sections || []).find(x => x.id === id), auto = ficheAuto().find(x => x.id === id);
    if (ajoutee) ajoutee.titre = t.value;
    else { f.titres = f.titres || {}; if (auto && t.value === auto.titre) delete f.titres[id]; else f.titres[id] = t.value; }
    return;
  }
  const cle = t.dataset.fiCle, champ = t.dataset.fiChamp;
  const [sid, ...reste] = cle.split('.'), lid = reste.join('.');
  const ajout = (f.ajouts || []).find(x => x.s === sid && x.id === lid);
  if (ajout) { ajout[champ] = t.value; return; }
  const auto = ficheAuto().find(x => x.id === sid)?.lignes.find(x => x.id === lid) || {};
  f.lignes = f.lignes || {};
  const m = {...(f.lignes[cle] || {})};
  if (t.value === (auto[champ] ?? '')) delete m[champ]; else m[champ] = t.value;
  if (Object.keys(m).length) f.lignes[cle] = m; else delete f.lignes[cle];
}
function ficheClic(t) {
  const f = ed.fiche, d = t.dataset;
  if (d.fiTout !== undefined) { if (confirm('Effacer tous tes changements de la fiche et reprendre les stats du site ?')) { ed.fiche = {}; $('#ed-desc').value = ''; $('#desc-n').textContent = '0/160'; } }
  else if (d.fiCache) { const c = new Set(f.caches || []); c.has(d.fiCache) ? c.delete(d.fiCache) : c.add(d.fiCache); f.caches = [...c]; }
  else if (d.fiReset) { if (f.lignes) delete f.lignes[d.fiReset]; }
  else if (d.fiSuppr) { const [sid, ...r] = d.fiSuppr.split('.'); f.ajouts = (f.ajouts || []).filter(x => !(x.s === sid && x.id === r.join('.'))); }
  else if (d.fiSupprSec) {
    if (!confirm('Supprimer cette section et ses lignes ?')) return;
    f.sections = (f.sections || []).filter(x => x.id !== d.fiSupprSec); f.ajouts = (f.ajouts || []).filter(x => x.s !== d.fiSupprSec);
  }
  else if (d.fiAjout) (f.ajouts = f.ajouts || []).push({s: d.fiAjout, id: 'a' + unique(), l: '', v: ''});
  else if (d.fiSec) {
    const id = 's' + unique();
    (f.sections = f.sections || []).push({id, titre: d.fiSec === 'fun' ? 'Stats rigolotes' : 'Nouvelle section', style: d.fiSec});
    (f.ajouts = f.ajouts || []).push({s: id, id: 'a' + unique(), l: '', v: ''});
  }
  majFiche();
}
const local = u => PHOTOS_LOCALES[u] || u;
function carteEd() {
  const e = entree() || {};
  const c = fusionnerCarte(e.base ? {...e.base, id: ed.id} : PAR_ID[ed.id], {...e, photo: e.photo && local(e.photo),
    photos: e.photos && Object.fromEntries(Object.entries(e.photos).map(([k, v]) => [k, local(v)]))});
  return vueExemplaire(c, {palier: ed.palier, note: noteEd(ed.palier)});
}
const posteEd = () => ed.postes[0] || (PAR_ID[ed.id].poste === 'GB' ? 'GB' : null);   // poste principal

function majEditeur() {
  if (ed?.staff) return majEditeurStaff();
  const c = carteEd(), poste = posteEd();
  if (!ed.vals) initVals();
  $('#paliers').innerHTML = PALIERS.filter(p => !ed.legende || p.id === 'ultime').map(p => `<button data-palier="${p.id}" class="${ed.palier === p.id ? 'on' : ''}">${ed.legende ? 'Légende' : p.nom}${ed.photos[p.id] ? ' 📷' : ''}</button>`).join('');
  const eqs = [...new Set([...EQUIPES_CARTES, ed.equipe].filter(Boolean))];
  $('#equipes').innerHTML = eqs.map(e => `<button data-equipe="${esc(e)}" class="${ed.equipe === e ? 'on' : ''}">${esc(e)}</button>`).join('');
  $('#ed-titre').innerHTML = `${esc(c.nom)} <small>${esc(c.equipe)}${c.legende ? ' · légende' : ''}</small>`;
  $('#desc-n').textContent = `${(ed.fiche.intro || '').length}/160`;
  // plusieurs postes possibles : on touche pour ajouter ou retirer, le premier choisi est le principal (★)
  $('#postes').innerHTML = POSTES_JEU.map(p => {
    const i = c.postes.indexOf(p);
    return `<button data-poste="${p}" class="${i >= 0 ? 'on' : ''}">${p}${i === 0 && c.postes.length > 1 ? ' ★' : ''}</button>`;
  }).join('') + `<button data-poste="">Aucun</button>`;
  const bonus = statsDu(poste).filter(([k]) => c.bonus?.[k]).map(([k, l]) => `${l} ${c.bonus[k] > 0 ? '+' : ''}${c.bonus[k]}`).join(' · ');
  $('#aide-postes').textContent = (c.postes.length ? `${nomsPostes(c)}. ` : 'Aucun poste : joue partout sans malus. ')
    + (c.postes.length > 1 ? `Principal : ${c.postes[0]} (le seul qui compte pour les boosters par poste). ` : '')
    + 'Pas de malus à chacun de ses postes, −5 ailleurs. ' + (bonus ? `Bonus de ses postes sur les stats : ${bonus}.` : '');
  // points à répartir : le total des 6 stats au palier choisi (le même pour tous les joueurs, selon le palier)
  const st = statsDu(poste), B = budgetPalier(ed.palier), reste = B - st.reduce((t, [k]) => t + ed.vals[k], 0), P = PALIER[ed.palier];
  $('#stats').innerHTML = `<div class="pts${reste === 0 ? ' ok' : reste < 0 ? ' trop' : ''}"><b>${reste > 0 ? reste : reste < 0 ? -reste : '0'}</b>
      <span>${reste > 0 ? `point${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}` : reste < 0 ? `point${reste < -1 ? 's' : ''} en trop` : 'Tous les points sont placés'}
      <small>${ed.legende ? 'Légende' : P.nom} ${noteEd(ed.palier)} : ${B} points à répartir sur les 6 stats</small></span>
      ${reste ? '<button class="btn ghost petit" data-act="repartir">Répartir</button>' : ''}</div>`
    + st.map(([k, , nom]) => `<div class="stat-l pm"><span>${nom}</span>
      <button class="pm-b" data-pm="${k}:-1" aria-label="${nom} moins 1">−</button>
      <input type="range" min="1" max="99" value="${ed.vals[k]}" data-stat="${k}">
      <button class="pm-b" data-pm="${k}:1" aria-label="${nom} plus 1">+</button>
      <input class="champ" type="number" min="1" max="99" value="${ed.vals[k]}" data-stat="${k}" inputmode="numeric"></div>`).join('')
    + `<div class="pal-tab" role="table" aria-label="Stats à chaque palier"><div class="pt-l pt-t" role="row"><span></span>${st.map(([, l]) => `<b>${l}</b>`).join('')}<b>Total</b></div>
      ${PALIERS.filter(p => !ed.legende || p.id === 'ultime').map(p => { const s = statsPalier(p.id);
        return `<div class="pt-l t-${p.id}${p.id === ed.palier ? ' on' : ''}" role="row"><span>${ed.legende ? 'Légende' : p.nom} ${noteEd(p.id)}</span>${st.map(([k]) => `<i>${s[k]}</i>`).join('')}<i>${st.reduce((t, [k]) => t + s[k], 0)}</i></div>`; }).join('')}</div>
    <p class="sub petit">${ed.stats ? 'Réglées à la main.' : 'Par défaut, tirées des stats du site.'} Change les stats à un palier : les autres paliers suivent en proportion
      (une stat qui vaut 25 % du total le vaut à tous les paliers). Poids du poste ${poste || 'non défini'} : ${st.map(([k, l]) => `${l} ${Math.round(POIDS[poste || 'JDC'][k] * 100)} %`).join(' · ')}</p>`;
  $('#titre-photo').textContent = `Photo ${R_LABEL[ed.palier]}`;
  majApercu();
}
function majApercu() {
  if (ed?.staff) return majEditeurStaff();
  const c = carteEd(), p = PALIER[ed.palier];
  $('#apercu').innerHTML = carteHTML(c);
  $('#note').textContent = noteEd(ed.palier);
  $('#note-site').textContent = `${p.nom} ${p.min}–${p.max}`;
}

// note où l'on règle les stats : le bas du palier ; une légende, sa note (100)
const noteEd = p => ed?.legende ? NOTE_LEGENDE : PALIER[p].min;
const budgetPalier = p => Math.round(6 * moyenneExacte(noteEd(p)));
// les stats telles que le jeu les montre, au palier choisi, le total calé sur les points du palier (les arrondis le décalent d'un point ou deux)
function initVals() { ed.vals = ajusterTotal({...carteEd().s}, budgetPalier(ed.palier)); }
// les stats d'un autre palier : en proportion de la moyenne du palier (comme statsAuNiveau dans cartes.js)
function statsPalier(p) {
  const f = moyenneExacte(noteEd(p)) / moyenneExacte(noteEd(ed.palier));
  return Object.fromEntries(statsDu(posteEd()).map(([k]) => [k, borne(ed.vals[k] * f, 1, 99)]));
}
function valsVersStats() {
  const m = moyenneExacte(noteEd(ed.palier)), b = carteEd().bonus || {};
  ed.stats = Object.fromEntries(statsDu(posteEd()).map(([k]) => [k, Math.max(1, Math.round((ed.vals[k] - (b[k] || 0) * m / 40) * 10) / 10)]));
}
// ramène la somme au total voulu : en proportion, puis les arrondis sur les plus grosses stats
function ajusterTotal(vals, total) {
  const ks = Object.keys(vals), s = ks.reduce((t, k) => t + vals[k], 0) || 1;
  const r = Object.fromEntries(ks.map(k => [k, borne(vals[k] * total / s, 1, 99)]));
  for (let i = 0; i < 200; i++) {
    const d = total - ks.reduce((t, k) => t + r[k], 0); if (!d) break;
    const k = [...ks].sort((a, b) => d > 0 ? r[a] - r[b] : r[b] - r[a]).find(x => d > 0 ? r[x] < 99 : r[x] > 1); if (!k) break;
    r[k] += Math.sign(d);
  }
  return r;
}
function changerStat(k, v, source) {
  ed.vals[k] = borne(+v || 1, 1, 99);
  valsVersStats();
  document.querySelectorAll(`[data-stat="${k}"]`).forEach(el => { if (el !== source) el.value = ed.vals[k]; });
  majEditeur();
}
function repartir() { ed.vals = ajusterTotal(ed.vals, budgetPalier(ed.palier)); valsVersStats(); majEditeur(); }
function changerPoste(p) {
  const avantGB = posteEd() === 'GB';
  if (!p) ed.postes = [];
  else if (ed.postes.includes(p)) ed.postes = ed.postes.filter(x => x !== p);
  else ed.postes = [...(ed.postes.length ? ed.postes : PAR_ID[ed.id].poste === 'GB' ? ['GB'] : []), p];
  if (avantGB !== (posteEd() === 'GB')) { ed.stats = null; ed.vals = null; }   // champ ↔ gardien(ne) : autres stats, on repart des valeurs par défaut
  else if (ed.stats) valsVersStats();   // le bonus des postes change : les stats affichées restent celles réglées
  majEditeur();
}
// autre palier : les stats suivent en proportion (même part du total) ; avec tous les points placés, le total du nouveau palier
// les stats réglées passent d'une note à l'autre en proportion ; si tous les points étaient placés, ils le restent
function convertirVals(nAvant, nApres) {
  const tot = n => Math.round(6 * moyenneExacte(n)), f = moyenneExacte(nApres) / moyenneExacte(nAvant);
  const plein = tot(nAvant) === Object.values(ed.vals).reduce((t, v) => t + v, 0);
  const s = Object.fromEntries(Object.entries(ed.vals).map(([k, v]) => [k, borne(v * f, 1, 99)]));
  ed.vals = plein ? ajusterTotal(s, tot(nApres)) : s;
}
function changerPalier(p) {
  if (ed.staff) { ed.palier = p; chargerPhoto(); return majEditeurStaff(); }
  if (ed.stats) convertirVals(noteEd(ed.palier), noteEd(p));
  ed.palier = p;
  if (ed.stats) valsVersStats(); else ed.vals = null;
  chargerPhoto(); majEditeur();
}

// Photo du palier choisi : recadrage carré (zoom + position) dans un canvas, puis JPEG
function chargerPhoto() {
  ed.img = null; ed.cadre = null;
  const src = ed.photos[ed.palier] || (ed.palier === 'bronze' ? ed.photo : null);
  dessiner(); majPhoto();
  if (!src) return;
  const img = new Image();
  // photo déjà publiée (stockage Supabase, autre adresse) : demandée avec CORS, sinon le cadre serait « contaminé »
  // et le navigateur refuserait d'enregistrer ensuite toute nouvelle photo (elle disparaissait à l'enregistrement)
  if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
  img.onload = () => { if (!ed) return; ed.img = img; ed.cadre = {z: 1, x: 50, y: 50}; dessiner(); majPhoto(); };
  img.src = local(src);
}
function dessiner(cv = $('#cadre')) {
  const x = cv.getContext('2d');
  x.clearRect(0, 0, PHOTO_L, PHOTO_H);   // fond transparent (damier dessiné par la page)
  if (!ed.img) return;
  const {z, x: px, y: py} = ed.cadre, w = ed.img.naturalWidth, h = ed.img.naturalHeight;
  const k = Math.max(PHOTO_L / w, PHOTO_H / h) * z, dw = w * k, dh = h * k;   // zoom 100 % = la photo remplit le cadre
  x.drawImage(ed.img, (PHOTO_L - dw) * px / 100, (PHOTO_H - dh) * py / 100, dw, dh);
}
function majPhoto() {
  $('#reglages-photo').innerHTML = ed.img ? [['z', 'Zoom', 40, 300], ['x', 'Gauche ↔ droite', 0, 100], ['y', 'Haut ↕ bas', 0, 100]]
    .map(([k, l, a, b]) => `<label class="stat-l"><span>${l}</span><input type="range" min="${a}" max="${b}" value="${k === 'z' ? ed.cadre.z * 100 : ed.cadre[k]}" data-cadre="${k}"></label>`).join('') : '';
}
let rafPhoto = 0;
function photoDepuisCadre() {
  cancelAnimationFrame(rafPhoto);
  rafPhoto = requestAnimationFrame(() => {
    dessiner();
    // la photo enregistrée est dessinée dans un cadre neuf : jamais bloquée par une ancienne photo affichée
    const cv = document.createElement('canvas'); cv.width = PHOTO_L; cv.height = PHOTO_H;
    dessiner(cv);
    try { ed.photos[ed.palier] = exporterPhoto(cv); }
    catch (e) { console.error(e); toast('Cette photo ne peut pas être recadrée : choisis à nouveau le fichier'); return; }
    majEditeur();
  });
}
function retirerPhoto() {
  delete ed.photos[ed.palier];
  if (ed.palier === 'bronze') ed.photo = null;   // ancienne photo unique
  chargerPhoto(); majEditeur();
}
function choisirFichier(f) {
  if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => { ed.img = img; ed.cadre = {z: 1, x: 50, y: 35}; majPhoto(); photoDepuisCadre(); };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Format de photo non reconnu'); };
  img.src = url;
}

function enregistrer() {
  if (ed.stats) {
    const reste = budgetPalier(ed.palier) - Object.values(ed.vals).reduce((t, v) => t + v, 0);
    if (reste) return alert(reste > 0 ? `Il reste ${reste} point${reste > 1 ? 's' : ''} à placer dans les stats (ou touche « Répartir »).`
      : `${-reste} point${reste < -1 ? 's' : ''} en trop dans les stats : retires-en (ou touche « Répartir »).`);
  }
  if (ed.cree && !(ed.nom || '').trim()) return alert('Donne un nom à la carte.');
  const e = entree();
  if (e?.base) ajouterCreee({...e.base, id: ed.id});
  if (memeEntree(e, PERSO[ed.id])) delete BROUILLON[ed.id]; else BROUILLON[ed.id] = e;
  if (!sauverBrouillon()) return;
  fermer(); toast('Enregistré dans le brouillon');
}
function fermer() { const o = $('#overlay'), staff = ed?.staff; o.hidden = true; o.innerHTML = ''; document.body.style.overflow = ''; ed = null; if (staff) vueStaffAdmin(); else vue(); }

// ── cartes staff : une vraie personne par carte ─────────────────────────────────
let STAFF_ADMIN = [];
async function chargerStaffAdmin() {
  if (!SERVEUR || !adminOk) return connexionAdmin('Connecte-toi avec le compte administrateur pour régler les cartes staff.');
  const {data, error} = await sbA.rpc('catalogue_staff');
  if (error) return alert('Cartes staff : ' + texteErreur(error));
  STAFF_ADMIN = data || []; vueStaffAdmin();
}
function vueStaffAdmin() {
  $('#publier').hidden = true;
  $('#view').innerHTML = `<p><button class="lien" data-act="retour-cartes">‹ Cartes des joueurs</button></p><h1>Cartes staff</h1>
    <p class="sub">Mets une vraie personne sur chaque carte : son nom, une petite phrase et une photo par palier (comme les joueurs).
      Le passif de la carte (son effet dans le jeu) ne change pas. Seulement avec l’accord de la personne : le jeu est public.</p>
    <div class="stf">${STAFF_ADMIN.map(x => `<button class="stf-c a" data-sed="${esc(x.id)}">${staffCarteHTML(x, '', 'bronze')}
      <em>${x.personne ? esc(x.personne) : 'Personne à choisir'} · photos ${RARETES.filter(r => x.photos?.[r]).length}/4</em></button>`).join('')}</div>`;
}
function ouvrirStaff(id) {
  const x = STAFF_ADMIN.find(y => y.id === id); if (!x) return;
  ed = {staff: true, id, x, palier: 'bronze', photos: {...(x.photos || {})}, photo: null, img: null, cadre: null, nom: x.personne || '', intro: x.intro || ''};
  const o = $('#overlay'); o.hidden = false; document.body.style.overflow = 'hidden';
  o.innerHTML = `<div class="sheet editeur editeur-staff">
    <div class="ed-haut"><div id="apercu" class="apercu-staff"></div><div class="ed-note"><small>Passif</small><b id="note"></b><small>${esc(x.nom)}</small></div></div>
    <div class="filters postes" id="paliers"></div>
    <h3>${esc(x.nom)} <small>${esc(x.role)}</small></h3>
    <label class="lab">Nom de la personne<input class="champ" id="st-nom" maxlength="40" value="${esc(ed.nom)}" placeholder="Ex. Prénom Nom (vide = « ${esc(x.nom)} »)"></label>
    <h4>Description <small id="st-desc-n"></small></h4>
    <textarea class="champ" id="st-desc" rows="2" maxlength="160" placeholder="Ex. Kiné du club depuis 10 ans, il remet tout le monde sur pied.">${esc(ed.intro)}</textarea>
    <p class="sub petit">Une petite phrase, montrée sous la carte dans le jeu. Rien de personnel (pas d’adresse, d’école, de date de naissance…).</p>
    <h4 id="titre-photo">Photo</h4>
    <div class="photo"><canvas id="cadre" width="${PHOTO_L}" height="${PHOTO_H}"></canvas>
      <div class="photo-ctl"><label class="btn ghost petit">Choisir une photo<input type="file" accept="image/*" id="fichier" hidden></label>
      <button class="btn ghost petit" data-act="sansphoto">Retirer</button>
      <div id="reglages-photo"></div></div></div>
    <p class="note-photo">Une photo par palier (sinon celle du palier en dessous). Seulement avec l’accord de la personne : le jeu est public.</p>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button><button class="btn gold" data-act="staff-publier">Publier</button></div>
  </div>`;
  chargerPhoto(); majEditeurStaff();
}
function majEditeurStaff() {
  const x = ed.x, photos = Object.fromEntries(Object.entries(ed.photos).map(([k, v]) => [k, local(v)]));
  $('#paliers').innerHTML = PALIERS.map(p => `<button data-palier="${p.id}" class="${ed.palier === p.id ? 'on' : ''}">${p.nom}${ed.photos[p.id] ? ' 📷' : ''}</button>`).join('');
  $('#apercu').innerHTML = staffCarteHTML({...x, personne: ed.nom.trim() || null, photos}, '', ed.palier);
  $('#note').textContent = staffValeur(x, ed.palier);
  $('#st-desc-n').textContent = `${ed.intro.length}/160`;
  $('#titre-photo').textContent = `Photo ${R_LABEL[ed.palier]}`;
}
async function publierStaff() {
  if (!adminOk) return connexionAdmin('Connecte-toi avec le compte administrateur pour publier.');
  const b = $('[data-act=staff-publier]'); if (b) { b.disabled = true; b.textContent = 'Publication…'; }
  try {
    const photos = {};
    for (const [k, v] of Object.entries(ed.photos)) {
      if (!v.startsWith('data:')) { photos[k] = v; continue; }
      const chemin = `staff-${ed.id}-${k}-${unique()}.${extension(v)}`, blob = await (await fetch(v)).blob();
      const {error} = await sbA.storage.from('photos').upload(chemin, blob, {contentType: blob.type || 'image/jpeg', cacheControl: '31536000'});
      if (error) throw error;
      photos[k] = sbA.storage.from('photos').getPublicUrl(chemin).data.publicUrl;
      PHOTOS_LOCALES[photos[k]] = v;
    }
    const {data, error} = await sbA.rpc('admin_publier_staff', {p_staff: [{id: ed.id, nom: ed.nom.trim() || null, intro: ed.intro.trim() || null, photos}]});
    if (error) throw error;
    // anciennes photos remplacées ou retirées : supprimées du stockage
    const vieilles = Object.values(ed.x.photos || {}).filter(v => !Object.values(photos).includes(v) && v.includes(DOSSIER_PHOTOS)).map(v => v.split(DOSSIER_PHOTOS)[1]);
    if (vieilles.length) await sbA.storage.from('photos').remove(vieilles);
    STAFF_ADMIN = data.catalogue || STAFF_ADMIN;
    fermer(); toast('Carte staff publiée : le jeu est à jour.');
  } catch (e) {
    console.error(e); alert('La publication a échoué : ' + texteErreur(e));
    if (b) { b.disabled = false; b.textContent = 'Publier'; }
  }
}

// ── créer une carte (pas sur le site : un ancien, une légende du club…) ────────────
function fenetreCreer() {
  if (!adminOk) return connexionAdmin('Connecte-toi avec le compte administrateur pour créer une carte.');
  const o = $('#overlay'); o.hidden = false;
  o.innerHTML = `<div class="sheet"><h3>Nouvelle carte</h3>
    <form class="form" data-form="creer">
      <label class="lab">Nom<input class="champ" name="nom" required maxlength="40" placeholder="Prénom Nom" autocomplete="off"></label>
      <div class="ed-ligne"><label class="lab">Genre<select class="champ" name="genre"><option value="F">Fille</option><option value="M">Garçon</option></select></label>
        <label class="lab">Équipe<select class="champ" name="equipe">${EQUIPES_CARTES.map(e => `<option>${e}</option>`).join('')}</select></label></div>
      <label class="lab">Poste principal<select class="champ" name="poste">${POSTES_JEU.map(p => `<option value="${p}">${POSTE_NOM[p]}</option>`).join('')}</select></label>
      <label class="ed-leg"><input type="checkbox" name="legende"><span><b>Légende du club</b><small>Une seule édition, cadre à part, tirée 1 fois sur 500 dans le booster gratuit.</small></span></label>
      <p class="sub petit">Ensuite : stats, photo et description dans l’éditeur, puis « Publier ». Uniquement nom, équipe et infos sportives ; une photo seulement avec l’accord de la personne.</p>
      <div class="ed-btns"><button type="button" class="btn ghost" data-act="fermer">Annuler</button><button class="btn gold" type="submit">Créer</button></div>
    </form></div>`;
  o.querySelector('[name=nom]').focus();
}
function creerCarte(d) {
  const nom = (d.nom || '').trim().replace(/\s+/g, ' ');
  if (!nom) return;
  let id = slugAdmin(nom) || 'carte', n = 2;
  if (id.length < 2) id += '-carte';
  while (PAR_ID[id + (n > 2 ? '-' + (n - 1) : '')] && n < 99) n++;
  if (n > 2) id += '-' + (n - 1);
  const base = carteCreee(id, {nom, genre: d.genre, equipe: d.equipe, poste: d.poste, legende: !!d.legende});
  ajouterCreee(base);
  BROUILLON[id] = {base, postes: [d.poste]};
  if (!sauverBrouillon()) return;
  fermer(); ouvrir(id);
}

// Photos d'une entrée (photo unique + une par palier) ; deposer(dataURL, nom) envoie une photo neuve et renvoie son adresse
const photosDe = e => [e?.photo, ...Object.values(e?.photos || {})].filter(Boolean);
const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   // nom unique : pas de vieille photo en cache
async function deposerPhotos(id, e, deposer) {
  if (!e) return e;
  const r = {...e, photos: {...(e.photos || {})}};
  if (r.photo?.startsWith('data:')) r.photo = await deposer(r.photo, id);
  for (const [k, v] of Object.entries(r.photos)) if (v.startsWith('data:')) r.photos[k] = await deposer(v, `${id}-${k}`);
  if (!Object.keys(r.photos).length) delete r.photos;
  return r;
}

// ── réglages GitHub ─────────────────────────────────────────────────────────────
function reglages(msg) {
  const o = $('#overlay'); o.hidden = false;
  o.innerHTML = `<div class="sheet">
    <h3>Publier sur GitHub</h3>
    ${msg ? `<p class="sub warn">${esc(msg)}</p>` : ''}
    <p class="sub">Crée une fois un jeton sur <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> :
      <br>· Repository access : <b>Only select repositories</b> → ce dépôt
      <br>· Permissions → Repository → <b>Contents : Read and write</b>
      <br>Il reste enregistré dans ce navigateur seulement.</p>
    <label class="lab">Dépôt<input class="champ" id="r-depot" value="${esc(REGL.depot)}" autocapitalize="off" spellcheck="false"></label>
    <label class="lab">Branche publiée par GitHub Pages<input class="champ" id="r-branche" value="${esc(REGL.branche)}" autocapitalize="off" spellcheck="false"></label>
    <label class="lab">Jeton<input class="champ" id="r-jeton" type="password" value="${esc(REGL.jeton)}" placeholder="github_pat_…" autocomplete="off"></label>
    <div class="ed-btns">${REGL.jeton ? '<button class="btn ghost" data-act="oublier">Oublier le jeton</button>' : ''}
      <button class="btn ghost" data-act="fermer">Fermer</button><button class="btn gold" data-act="r-ok">Enregistrer</button></div></div>`;
}
async function validerReglages() {
  const avant = REGL;
  REGL = {depot: $('#r-depot').value.trim(), branche: $('#r-branche').value.trim() || 'main', jeton: $('#r-jeton').value.trim()};
  if (REGL.jeton) {
    // le jeton n'est enregistré qu'une fois accepté par GitHub
    try { await gh(`git/ref/heads/${REGL.branche}`); toast('Connecté à GitHub'); }
    catch (e) { const msg = erreurGitHub(e); REGL = avant; return reglages(msg); }
  }
  sauverReglages(); fermer(); charger();
}

// ── événements ──────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-ed],[data-sed],[data-filtre],[data-fposte],[data-tri],[data-poste],[data-palier],[data-equipe],[data-pm],[data-fi-tout],[data-fi-cache],[data-fi-reset],[data-fi-suppr],[data-fi-suppr-sec],[data-fi-ajout],[data-fi-sec]');
  if (!t) { if (e.target.id === 'overlay' && !ed) fermer(); return; }   // l'éditeur ne se ferme pas par erreur
  const a = t.dataset.act;
  if (t.dataset.ed) return ouvrir(t.dataset.ed);
  if (t.dataset.sed) return ouvrirStaff(t.dataset.sed);
  if (ed && Object.keys(t.dataset).some(k => /^fi[A-Z]/.test(k))) return ficheClic(t);
  if (t.dataset.filtre) { filtre = t.dataset.filtre; return vue(); }
  if (t.dataset.fposte) { filtrePoste = t.dataset.fposte; return vue(); }
  if (t.dataset.tri) { tri = t.dataset.tri; return vue(); }
  if (t.dataset.poste !== undefined && ed) return changerPoste(t.dataset.poste);
  if (t.dataset.palier && ed) return changerPalier(t.dataset.palier);
  if (t.dataset.equipe && ed) { ed.equipe = t.dataset.equipe; return majEditeur(); }
  if (t.dataset.pm && ed) { const [k, d] = t.dataset.pm.split(':'); return changerStat(k, ed.vals[k] + +d); }
  if (a === 'repartir') return repartir();
  if (a === 'creer') return fenetreCreer();
  if (a === 'fermer') return fermer();
  if (a === 'enregistrer') return enregistrer();
  if (a === 'defaut') { ed.stats = null; ed.vals = null; return majEditeur(); }
  if (a === 'sansphoto') return retirerPhoto();
  if (a === 'publier') return SERVEUR ? publierServeur() : publier();
  if (a === 'synchro') return synchroniser();
  if (a === 'staff') return chargerStaffAdmin();
  if (a === 'staff-publier') return publierStaff();
  if (a === 'retour-cartes') return vue();
  if (a === 'matchs') return adminOk ? envoyerMatchs() : connexionAdmin('Connecte-toi avec le compte administrateur.');
  if (a === 'a-google') return sbA.auth.signInWithOAuth({provider: 'google', options: {redirectTo: urlRetour()}}).then(({error}) => error && alert(texteErreur(error)));
  if (a === 'a-deco') return sbA.auth.signOut().finally(() => { fermer(); charger(); });
  if (a === 'jeter') { if (confirm('Annuler toutes les modifications non publiées ?')) { BROUILLON = {}; sauverBrouillon(); vue(); } return; }
  if (a === 'reglages') return SERVEUR ? connexionAdmin() : reglages();
  if (a === 'r-ok') return validerReglages();
  if (a === 'oublier') { REGL.jeton = ''; sauverReglages(); fermer(); return charger(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.recherche !== undefined) { recherche = t.value; return majListe(); }
  if (!ed) return;
  if (t.id === 'st-nom') { ed.nom = t.value; return majEditeurStaff(); }
  if (t.id === 'st-desc') { ed.intro = t.value; $('#st-desc-n').textContent = `${t.value.length}/160`; return; }
  if (t.dataset.stat) return changerStat(t.dataset.stat, t.value, t);
  if (t.id === 'ed-desc') { ed.fiche.intro = t.value; $('#desc-n').textContent = `${t.value.length}/160`; return; }
  if (t.id === 'ed-nom') { ed.nom = t.value; return majApercu(); }
  if (t.dataset.fiIntro !== undefined || t.dataset.fiTitre !== undefined || t.dataset.fiCle) return ficheSaisie(t);
  if (t.id === 'numero') { ed.numero = t.value === '' ? null : borne(+t.value, 0, 99); return majApercu(); }
  if (t.dataset.cadre) { ed.cadre[t.dataset.cadre] = t.dataset.cadre === 'z' ? t.value / 100 : +t.value; return photoDepuisCadre(); }
});
document.addEventListener('change', e => {
  if (!ed) return;
  if (e.target.id === 'fichier') return choisirFichier(e.target.files[0]);
  if (e.target.id === 'ed-genre') { ed.genre = e.target.value; return majApercu(); }
  if (e.target.id === 'ed-legende') {   // une légende n'existe qu'en Ultime, réglée à sa note (100)
    const nAvant = noteEd(ed.palier), pAvant = ed.palier;
    ed.legende = e.target.checked;
    if (ed.legende) ed.palier = 'ultime';
    if (ed.stats) { convertirVals(nAvant, noteEd(ed.palier)); valsVersStats(); } else ed.vals = null;
    if (ed.palier !== pAvant) chargerPhoto();
    return majEditeur();
  }
});
document.addEventListener('submit', async e => {
  if (e.target.dataset.form === 'creer') { e.preventDefault(); return creerCarte(Object.fromEntries(new FormData(e.target))); }
  if (e.target.dataset.form !== 'admin') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const {error} = await sbA.auth.signInWithPassword({email: d.email.trim(), password: d.mdp});
  if (error) return connexionAdmin(texteErreur(error));
  fermer(); await charger();
  if (!adminOk) connexionAdmin('Ce compte n’est pas administrateur (voir docs/SERVEUR.md, étape « Devenir administrateur »).');
  else toast('Connecté en administrateur');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#overlay').hidden) fermer(); });

// ── démarrage ───────────────────────────────────────────────────────────────────
async function charger() {
  try {
    const d = await fetch('data/cartes.json', {cache: 'no-store'}).then(r => r.json());
    SITE = d.cartes; PAR_ID = {}; SITE.forEach(c => PAR_ID[c.id] = c);
    for (const [id, e] of Object.entries(BROUILLON)) if (e?.base) ajouterCreee({...e.base, id});   // cartes créées, pas encore publiées
    $('[data-act=reglages]').textContent = SERVEUR ? 'Compte' : 'GitHub';
    if (SERVEUR) {
      try { await chargerServeur(); }
      catch (e) { console.error(e); PERSO = {}; SOURCE = `<span class="warn">Serveur : ${esc(texteErreur(e))}</span>`; }
    } else if (REGL.jeton) {
      try { PERSO = await lirePersoGitHub(REGL.branche); SOURCE = `réglages lus sur GitHub (${esc(REGL.branche)})`; }
      catch (e) { PERSO = {}; SOURCE = `<span class="warn">GitHub : ${esc(erreurGitHub(e))}</span>`; }
    } else {
      PERSO = await fetch('data/perso.json', {cache: 'no-store'}).then(r => r.ok ? r.json() : {}).then(p => p.cartes || {}).catch(() => ({}));
      SOURCE = 'pas encore connecté à GitHub';
    }
    vue();
  } catch (e) {
    $('#view').innerHTML = '<h1>Oups</h1><p class="sub">Impossible de charger les cartes.</p>';
  }
}
charger();
