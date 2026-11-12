// Base Postgres locale qui imite Supabase (auth.uid(), rôles anon/authenticated, stockage), avec supabase/schema.sql chargé.
// PGlite = Postgres dans Node, une seule connexion : pour les accès simultanés, voir test_concurrence.js (vrai Postgres).
const {PGlite} = require('@electric-sql/pglite');
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
global.localStorage = {getItem: () => null, setItem() {}};
const C = new Function(fs.readFileSync(REPO + '/cartes.js', 'utf8') + '; return {fusionner, fusionnerCarte};')();

// ce qu'un projet Supabase a déjà avant schema.sql (le même texte sert au vrai Postgres de test_concurrence.js)
const SOCLE = `
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant all on storage.objects to authenticated;
  -- droits par défaut de Supabase sur le schéma public
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;
const SCHEMA = () => fs.readFileSync(REPO + '/supabase/schema.sql', 'utf8');

async function creerBase() {
  const db = new PGlite();
  await db.exec(SOCLE);
  await db.exec(SCHEMA());
  return db;
}
// exécute une requête en tant que joueur (uid) ou visiteur (null) ; renvoie {rows} ou {erreur}
async function en(db, uid, sql, params = [], interne = false) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false);${interne ? '' : ` set role ${uid ? 'authenticated' : 'anon'};`}`);
  try { return {rows: (await db.query(sql, params)).rows}; }
  catch (e) { return {erreur: e.message}; }
  finally { await db.exec('reset role'); }
}
// Fonctions que le jeu n'appelle plus (audit du 12 nov. 2026) : plus accordées au rôle des joueurs, gardées pour faire tourner le
// moteur dans les anciens tests. rpc() les appelle donc sans prendre le rôle « authenticated » ; rpcJoueur() ne triche jamais.
const INTERNES = new Set(['ouvrir_booster_poste', 'seance_equipe', 'seance_payante', 'defier', 'adversaires', 'classement', 'match_championnat',
  'defier_ami', 'marche', 'publier_annonce', 'retirer_annonce', 'accepter_annonce', 'chercher_joueurs']);
async function appel(db, uid, fn, args, interne) {
  const r = await en(db, uid, `select ${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args, interne);
  return r.erreur ? r : r.rows[0].r;
}
const rpc = (db, uid, fn, args = []) => appel(db, uid, fn, args, INTERNES.has(fn));
const rpcJoueur = (db, uid, fn, args = []) => appel(db, uid, fn, args, false);
let n = 0;
async function nouvelUtilisateur(db) {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  await db.query('insert into auth.users values ($1, $2)', [id, `j${n}@test.fr`]);
  return id;
}
function lignesCatalogue() {
  const site = JSON.parse(fs.readFileSync(REPO + '/data/cartes.json', 'utf8')).cartes;
  // postes renseignés comme le ferait l'outil : les gardiens au poste GB, les autres répartis sur les 6 postes de champ
  const champ = ['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV']; let i = 0;
  return site.map(c0 => { const reglages = c0.poste === 'GB' ? null : {poste: champ[i++ % 6]}; const c = C.fusionnerCarte(c0, reglages || {});
    return {id: c.id, nom: c.nom, equipe: c.equipe, poste: c.poste, postes: c.postes, stats: c.stats, ecarts: c.ecarts, photos: c.photos, photo: c.photo, site: c0, reglages}; });
}
// sert les fichiers du jeu sur un port local (pour les tests dans le navigateur) ; renvoie {url, fermer}
function servir(port = 8791) {
  const http = require('http'), TYPES = {html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', png: 'image/png',
    webmanifest: 'application/manifest+json', glb: 'model/gltf-binary', webp: 'image/webp', jpg: 'image/jpeg'};
  const srv = http.createServer((req, res) => {
    const chemin = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\]\.\.)+/, '');
    const fichier = path.join(REPO, chemin === '/' || chemin === path.sep ? 'index.html' : chemin);
    if (!fichier.startsWith(REPO) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'content-type': TYPES[path.extname(fichier).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(fichier).pipe(res);
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({url: `http://localhost:${port}/`, fermer: () => new Promise(r => srv.close(r))})));
}
// petit compteur de vérifications commun aux tests
function verifs() {
  let ok = 0, ko = 0;
  const verif = (nom, cond, info) => { if (cond) { ok++; console.log('✓', nom); } else { ko++; console.log('✗', nom, info !== undefined ? JSON.stringify(info).slice(0, 400) : ''); } };
  const bilan = () => { console.log(`${ok} vérifications réussies, ${ko} échouées`); return ko; };
  return {verif, bilan};
}
module.exports = {REPO, SOCLE, SCHEMA, INTERNES, servir, creerBase, en, rpc, rpcJoueur, nouvelUtilisateur, lignesCatalogue, verifs, C};
