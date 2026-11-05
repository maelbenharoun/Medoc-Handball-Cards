'use strict';
/* Outil de gestion des cartes (admin.html) : poste de jeu, 6 stats, note forcée et photo de chaque carte.
   Les modifications vont d'abord dans un brouillon (localStorage, visible en aperçu dans le jeu du même navigateur),
   puis « Publier » les enregistre dans le dépôt GitHub en un seul commit : data/perso.json + assets/photos/. */

const CLE_REGLAGES = 'mhc-outil-github';
const PHOTO_PX = 360;   // photos recadrées en carré 360×360, JPEG (les métadonnées, GPS compris, disparaissent)

let SITE = [], PAR_ID = {}, PERSO = {}, SOURCE = '';
let BROUILLON = lireBrouillon();
let REGL = lireReglages();
const PHOTOS_LOCALES = {};   // photos publiées pendant cette session, le temps que GitHub Pages les mette en ligne
let filtre = 'tous', recherche = '', ed = null;

const $ = s => document.querySelector(s);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }

function lireReglages() {
  const def = {depot: 'maelbenharoun/medoc-handball-cards', branche: 'main', jeton: ''};
  try { return {...def, ...JSON.parse(localStorage.getItem(CLE_REGLAGES))}; } catch (e) { return def; }
}
function sauverReglages() { try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(REGL)); } catch (e) {} }
function sauverBrouillon() {
  try { localStorage.setItem(CLE_BROUILLON, JSON.stringify(BROUILLON)); return true; }
  catch (e) { alert('La mémoire du navigateur est pleine (photos). Publie tes modifications avant d’en faire d’autres.'); return false; }
}

// Réglages publiés + brouillon → cartes affichées
function persoCourant() {
  const p = appliquerBrouillon(PERSO, BROUILLON);
  for (const id in p) if (PHOTOS_LOCALES[p[id].photo]) p[id] = {...p[id], photo: PHOTOS_LOCALES[p[id].photo]};
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
      const e = BROUILLON[id];
      let photo = e?.photo || null;
      if (photo && photo.startsWith('data:')) {
        const chemin = `assets/photos/${id}-${Date.now().toString(36)}.jpg`;   // nom unique : pas de vieille photo en cache
        const blob = await gh('git/blobs', 'POST', {content: photo.split(',')[1], encoding: 'base64'});
        fichiers.push({path: chemin, mode: '100644', type: 'blob', sha: blob.sha});
        locales[chemin] = photo; photo = chemin;
      }
      const ancienne = actuel[id]?.photo;
      if (ancienne && ancienne !== photo && ancienne.startsWith('assets/photos/')) fichiers.push({path: ancienne, mode: '100644', type: 'blob', sha: null});
      if (e) { nouveau[id] = {...e}; if (photo) nouveau[id].photo = photo; } else delete nouveau[id];
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

// ── liste des cartes ────────────────────────────────────────────────────────────
function vue() {
  const sansPoste = cartes().filter(c => !c.poste).length;
  $('#view').innerHTML = `<h1>Gestion des cartes</h1>
    <p class="sub">${SITE.length} cartes · ${Object.keys(PERSO).length} réglée${Object.keys(PERSO).length > 1 ? 's' : ''} · ${SOURCE}</p>
    <input class="champ" type="search" placeholder="Chercher un nom" value="${esc(recherche)}" data-recherche>
    <div class="filters">${[['tous', 'Toutes'], ['SG1'], ['SG2'], ['SF1'], ['SF2'], ['sans', `Sans poste (${sansPoste})`]]
      .map(([k, l]) => `<button data-filtre="${k}" class="${filtre === k ? 'on' : ''}">${l || k}</button>`).join('')}</div>
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
  const liste = cartes().filter(c => (filtre === 'tous' || c.equipe === filtre || (filtre === 'sans' && !c.poste))
    && (!q || c.nom.toLowerCase().includes(q)));
  $('#rows').innerHTML = liste.map(c => {
      const etat = c.id in BROUILLON ? '<span class="tag br">brouillon</span>' : PERSO[c.id] ? '<span class="tag">réglée</span>' : '';
      return `<button class="row" data-ed="${c.id}">${carteHTML(c)}<div><b>${esc(c.nom)}</b>
        <small>${c.poste ? POSTE_NOM[c.poste] : 'Poste non défini'} · ${c.equipe}</small>
        <small>Note ${c.ovr}${c.ovr !== c.ovrSite ? ` (site ${c.ovrSite})` : ''} · ${R_LABEL[c.rarete]}${c.photo ? ' · photo' : ''}</small></div>${etat}</button>`;
    }).join('') || '<p class="sub">Aucune carte.</p>';
}

// ── édition d'une carte ─────────────────────────────────────────────────────────
function ouvrir(id) {
  const p = appliquerBrouillon(PERSO, BROUILLON)[id] || {}, c = fusionnerCarte(PAR_ID[id], p);
  ed = {id, poste: p.poste || null, stats: statsValides(p.stats, c.poste) ? {...p.stats} : null,
    force: Number.isFinite(p.ovr), ovr: Number.isFinite(p.ovr) ? p.ovr : c.ovr, photo: p.photo || null, img: null, cadre: null};
  const o = $('#overlay'); o.hidden = false; document.body.style.overflow = 'hidden';
  o.innerHTML = `<div class="sheet editeur">
    <div class="ed-haut"><div id="apercu"></div><div class="ed-note"><small>Note</small><b id="note"></b><small id="note-site"></small></div></div>
    <h3>${esc(c.nom)} <small>${c.equipe}</small></h3>
    <h4>Poste de jeu</h4><div class="filters postes" id="postes"></div>
    <h4>Stats <button class="lien" data-act="defaut">Remettre par défaut</button></h4><div id="stats"></div>
    <label class="chk"><input type="checkbox" id="force"> Forcer la note</label>
    <input class="champ" type="number" id="ovr" min="1" max="99" inputmode="numeric">
    <h4>Photo</h4>
    <div class="photo"><canvas id="cadre" width="${PHOTO_PX}" height="${PHOTO_PX}"></canvas>
      <div class="photo-ctl"><label class="btn ghost petit">Choisir une photo<input type="file" accept="image/*" id="fichier" hidden></label>
      <button class="btn ghost petit" data-act="sansphoto">Retirer</button>
      <div id="reglages-photo"></div></div></div>
    <p class="note-photo">Photo seulement avec l’accord de la personne (de ses parents si elle est mineure) : le dépôt est public.</p>
    <div class="ed-btns"><button class="btn ghost" data-act="fermer">Annuler</button><button class="btn gold" data-act="enregistrer">Enregistrer</button></div>
  </div>`;
  $('#force').checked = ed.force;
  if (ed.photo) { const img = new Image(); img.onload = () => { ed.img = img; ed.cadre = {z: 1, x: 50, y: 50, modifie: false}; dessiner(); majPhoto(); }; img.src = PHOTOS_LOCALES[ed.photo] || ed.photo; }
  majEditeur();
}

function entree() {
  const r = {};
  if (ed.poste) r.poste = ed.poste;
  if (ed.stats) { r.stats = {}; statsDu(posteEd()).forEach(([k]) => r.stats[k] = ed.stats[k]); }
  if (ed.force) r.ovr = ed.ovr;
  if (ed.photo) r.photo = ed.photo;
  return Object.keys(r).length ? r : null;
}
function carteEd() {
  const e = entree() || {};
  return fusionnerCarte(PAR_ID[ed.id], PHOTOS_LOCALES[e.photo] ? {...e, photo: PHOTOS_LOCALES[e.photo]} : e);
}
const posteEd = () => ed.poste || (PAR_ID[ed.id].poste === 'GB' ? 'GB' : null);

function majEditeur() {
  const c = carteEd(), poste = posteEd();
  const choix = PAR_ID[ed.id].poste === 'GB' ? POSTES_JEU : [...POSTES_JEU, ''];
  $('#postes').innerHTML = choix.map(p => `<button data-poste="${p}" class="${(ed.poste || '') === p || (!ed.poste && p === poste) ? 'on' : ''}">${p || 'Non défini'}</button>`).join('');
  $('#stats').innerHTML = statsDu(poste).map(([k, , nom]) => `<label class="stat-l"><span>${nom}</span>
    <input type="range" min="1" max="99" value="${c.s[k]}" data-stat="${k}"><input class="champ" type="number" min="1" max="99" value="${c.s[k]}" data-stat="${k}" inputmode="numeric"></label>`).join('')
    + `<p class="sub petit">${ed.stats ? 'Stats réglées à la main.' : 'Stats par défaut, tirées des stats du site.'} Poids du poste ${poste || 'non défini'} : ${
      statsDu(poste).map(([k, l]) => `${l} ${Math.round(POIDS[poste || 'JDC'][k] * 100)} %`).join(' · ')}</p>`;
  $('#ovr').hidden = !ed.force;
  if (!ed.force) ed.ovr = c.calc;
  $('#ovr').value = ed.ovr;
  majApercu();
}
function majApercu() {
  const c = carteEd();
  $('#apercu').innerHTML = carteHTML(c);
  $('#note').textContent = c.ovr;
  $('#note-site').textContent = `${R_LABEL[c.rarete]} · site ${c.ovrSite}${c.force ? ` · calculée ${c.calc}` : ''}`;
}

function changerStat(k, v, source) {
  const poste = posteEd();
  if (!ed.stats) ed.stats = {...carteEd().s};
  ed.stats[k] = borne(+v || 1, 1, 99);
  document.querySelectorAll(`[data-stat="${k}"]`).forEach(el => { if (el !== source) el.value = ed.stats[k]; });
  if (!ed.force) ed.ovr = noteDepuisStats(ed.stats, poste);
  $('#ovr').value = ed.ovr;
  majApercu();
}
function changerPoste(p) {
  const avantGB = posteEd() === 'GB';
  ed.poste = p || null;
  if (avantGB !== (posteEd() === 'GB')) ed.stats = null;   // champ ↔ gardien(ne) : autres stats, on repart des valeurs par défaut
  majEditeur();
}

// Photo : recadrage carré (zoom + position) dans un canvas, puis JPEG
function dessiner() {
  const cv = $('#cadre'), x = cv.getContext('2d');
  x.fillStyle = '#1a1d22'; x.fillRect(0, 0, PHOTO_PX, PHOTO_PX);
  if (!ed.img) return;
  const {z, x: px, y: py} = ed.cadre, w = ed.img.naturalWidth, h = ed.img.naturalHeight;
  const k = Math.max(PHOTO_PX / w, PHOTO_PX / h) * z, dw = w * k, dh = h * k;
  x.drawImage(ed.img, (PHOTO_PX - dw) * px / 100, (PHOTO_PX - dh) * py / 100, dw, dh);
}
function majPhoto() {
  $('#reglages-photo').innerHTML = ed.img ? [['z', 'Zoom', 100, 300], ['x', 'Gauche ↔ droite', 0, 100], ['y', 'Haut ↕ bas', 0, 100]]
    .map(([k, l, a, b]) => `<label class="stat-l"><span>${l}</span><input type="range" min="${a}" max="${b}" value="${k === 'z' ? ed.cadre.z * 100 : ed.cadre[k]}" data-cadre="${k}"></label>`).join('') : '';
}
let rafPhoto = 0;
function photoDepuisCadre() {
  cancelAnimationFrame(rafPhoto);
  rafPhoto = requestAnimationFrame(() => { dessiner(); ed.photo = $('#cadre').toDataURL('image/jpeg', .85); ed.cadre.modifie = true; majApercu(); });
}
function choisirFichier(f) {
  if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => { ed.img = img; ed.cadre = {z: 1, x: 50, y: 35}; majPhoto(); photoDepuisCadre(); };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Format de photo non reconnu'); };
  img.src = url;
}

function enregistrer() {
  if (ed.force) ed.ovr = borne(+$('#ovr').value || ed.ovr, 1, 99);
  const e = entree();
  if (memeEntree(e, PERSO[ed.id])) delete BROUILLON[ed.id]; else BROUILLON[ed.id] = e;
  if (!sauverBrouillon()) return;
  fermer(); toast('Enregistré dans le brouillon');
}
function fermer() { const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; document.body.style.overflow = ''; ed = null; vue(); }

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
  REGL = {depot: $('#r-depot').value.trim(), branche: $('#r-branche').value.trim() || 'main', jeton: $('#r-jeton').value.trim()};
  sauverReglages();
  if (REGL.jeton) {
    try { await gh(`git/ref/heads/${REGL.branche}`); toast('Connecté à GitHub'); }
    catch (e) { return reglages(erreurGitHub(e)); }
  }
  fermer(); charger();
}

// ── événements ──────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-ed],[data-filtre],[data-poste]');
  if (!t) { if (e.target.id === 'overlay' && !ed) fermer(); return; }   // l'éditeur ne se ferme pas par erreur
  const a = t.dataset.act;
  if (t.dataset.ed) return ouvrir(t.dataset.ed);
  if (t.dataset.filtre) { filtre = t.dataset.filtre; return vue(); }
  if (t.dataset.poste !== undefined && ed) return changerPoste(t.dataset.poste);
  if (a === 'fermer') return fermer();
  if (a === 'enregistrer') return enregistrer();
  if (a === 'defaut') { ed.stats = null; ed.force = false; $('#force').checked = false; return majEditeur(); }
  if (a === 'sansphoto') { ed.photo = null; ed.img = null; dessiner(); majPhoto(); return majApercu(); }
  if (a === 'publier') return publier();
  if (a === 'jeter') { if (confirm('Annuler toutes les modifications non publiées ?')) { BROUILLON = {}; sauverBrouillon(); vue(); } return; }
  if (a === 'reglages') return reglages();
  if (a === 'r-ok') return validerReglages();
  if (a === 'oublier') { REGL.jeton = ''; sauverReglages(); fermer(); return charger(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.recherche !== undefined) { recherche = t.value; return majListe(); }
  if (!ed) return;
  if (t.dataset.stat) return changerStat(t.dataset.stat, t.value, t);
  if (t.dataset.cadre) { ed.cadre[t.dataset.cadre] = t.dataset.cadre === 'z' ? t.value / 100 : +t.value; return photoDepuisCadre(); }
  if (t.id === 'ovr') { ed.ovr = borne(+t.value || 1, 1, 99); return majApercu(); }
});
document.addEventListener('change', e => {
  if (!ed) return;
  if (e.target.id === 'fichier') return choisirFichier(e.target.files[0]);
  if (e.target.id === 'force') { ed.force = e.target.checked; majEditeur(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#overlay').hidden) fermer(); });

// ── démarrage ───────────────────────────────────────────────────────────────────
async function charger() {
  try {
    const d = await fetch('data/cartes.json', {cache: 'no-store'}).then(r => r.json());
    SITE = d.cartes; SITE.forEach(c => PAR_ID[c.id] = c);
    if (REGL.jeton) {
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
