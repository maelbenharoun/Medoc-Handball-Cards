// Faux serveur Supabase pour Playwright : auth, rest (tables + rpc), storage, sur la base PGlite qui charge supabase/schema.sql
const fs = require('fs'), crypto = require('crypto');
const {creerBase, en, REPO} = require('./base');
const URL_SB = 'https://test.supabase.co';
const UMD = __dirname + '/node_modules/@supabase/supabase-js/dist/umd/supabase.js';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
// Signatures des fonctions : lues dans la base au démarrage (celles accordées aux joueurs), rien à tenir à jour à la main.
async function signatures(db) {
  const r = await db.query(`select p.proname nom, coalesce(p.proargnames, '{}') noms, array(select format_type(t, null) from unnest(p.proargtypes) t) types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')`);
  const court = {integer: 'int', 'character varying': 'text'};
  return Object.fromEntries(r.rows.map(f => [f.nom, Object.fromEntries(f.types.map((t, k) => [f.noms[k], court[t] || t]))]));
}
const VIDES = ['supprimer_mon_compte'];   // fonctions sans résultat

async function demarrer(options = {}) {
  const db = await creerBase();
  const SIG = await signatures(db);
  const users = {};   // email → {id, email, mdp, confirme}
  const journal = [];
  let coupe = false;   // simule une panne réseau du serveur
  const session = u => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const user = {id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
      app_metadata: {provider: 'email', providers: ['email']}, user_metadata: {}, identities: [{id: u.id, provider: 'email'}], created_at: new Date().toISOString()};
    return {access_token: `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp})}.sig`,
      token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + u.id, user};
  };
  const uidDe = req => {
    const h = req.headers()['authorization'] || '';
    try { return JSON.parse(Buffer.from(h.split(' ')[1].split('.')[1], 'base64url').toString()).sub || null; } catch (e) { return null; }
  };
  async function creerUtilisateur(email, mdp, confirme = true) {
    const id = crypto.randomUUID();
    await db.query('insert into auth.users values ($1, $2)', [id, email]);
    return users[email] = {id, email, mdp, confirme};
  }
  async function gerer(route) {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    const cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
    const json = (status, corps) => route.fulfill({status, contentType: 'application/json', headers: cors, body: corps === undefined ? '' : JSON.stringify(corps)});
    if (m === 'OPTIONS') return route.fulfill({status: 200, headers: cors});
    if (coupe) return route.abort('internetdisconnected');
    let corps = null;
    if (req.postData()) { try { corps = JSON.parse(req.postData()); } catch (e) { corps = req.postData(); } }
    journal.push(`${m} ${url.pathname}${url.search}`);
    // ── auth
    if (url.pathname === '/auth/v1/signup') {
      if (users[corps.email]) return json(200, {id: crypto.randomUUID(), email: corps.email, identities: []});   // comme Supabase : pas d'erreur
      if ((corps.password || '').length < 8) return json(422, {code: 'weak_password', msg: 'Password should be at least 8 characters.'});
      const u = await creerUtilisateur(corps.email, corps.password, !options.confirmation);
      return json(200, options.confirmation ? {...session(u).user, email_confirmed_at: null} : session(u));
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const u = Object.values(users).find(x => 'r-' + x.id === corps.refresh_token);
        return u ? json(200, session(u)) : json(400, {error: 'invalid_grant', error_description: 'Invalid Refresh Token'});
      }
      const u = users[corps.email];
      if (!u || u.mdp !== corps.password) return json(400, {code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials'});
      if (!u.confirme) return json(400, {code: 'email_not_confirmed', error_description: 'Email not confirmed', msg: 'Email not confirmed'});
      return json(200, session(u));
    }
    if (url.pathname === '/auth/v1/user') {
      const id = uidDe(req), u = Object.values(users).find(x => x.id === id);
      if (!u) return json(401, {msg: 'invalid JWT'});
      if (m === 'PUT') u.mdp = corps.password;
      return json(200, session(u).user);
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({status: 204, headers: cors});
    if (url.pathname === '/auth/v1/recover') return json(200, {});
    // ── rest : fonctions et tables
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop(), sig = SIG[fn];
      if (!sig) return json(404, {message: 'not found'});
      const noms = Object.keys(sig), args = corps || {};
      const vals = noms.map(n => args[n] === undefined || args[n] === null ? null
        : (sig[n] === 'jsonb' || sig[n].endsWith('[]')) ? JSON.stringify(args[n]) : sig[n] === 'boolean' ? !!args[n] : sig[n] === 'int' || sig[n] === 'bigint' ? Number(args[n]) : String(args[n]));
      const exprs = noms.map((n, i) => `${n} => ${sig[n].endsWith('[]') ? `(select array_agg(x::${sig[n].slice(0, -2)}) from jsonb_array_elements_text($${i + 1}::jsonb) x)` : `$${i + 1}::${sig[n]}`}`);
      const sql = VIDES.includes(fn) ? `select ${fn}()::text as r` : `select to_jsonb(${fn}(${exprs.join(', ')})) as r`;
      const r = await en(db, uidDe(req), sql, vals);
      if (r.erreur) return json(r.erreur.includes('permission denied') ? 401 : 400, {code: 'P0001', message: r.erreur, details: null, hint: null});
      if (VIDES.includes(fn)) return route.fulfill({status: 204, headers: cors});
      return json(200, r.rows[0].r);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').pop(), select = url.searchParams.get('select') || '*';
      const ordre = url.searchParams.get('order');
      const r = await en(db, uidDe(req), `select ${select} from ${table}${ordre ? ' order by ' + ordre.replace('.asc', ' asc').replace('.desc', ' desc') : ''}`);
      if (r.erreur) return json(400, {message: r.erreur});
      if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) return r.rows.length === 1 ? json(200, r.rows[0]) : json(406, {message: 'not one row'});
      return json(200, r.rows);
    }
    // ── stockage des photos
    if (url.pathname.startsWith('/storage/v1/object/public/photos/'))
      return route.fulfill({status: 200, contentType: 'image/png', headers: cors, body: fs.readFileSync(REPO + '/assets/icon-192.png')});
    if (url.pathname.startsWith('/storage/v1/object/photos/') && m === 'POST') {
      const nom = decodeURIComponent(url.pathname.split('/storage/v1/object/photos/')[1]);
      const r = await en(db, uidDe(req), "insert into storage.objects (bucket_id, name) values ('photos', $1)", [nom]);
      if (r.erreur) return json(403, {statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy'});
      return json(200, {Key: 'photos/' + nom, Id: crypto.randomUUID()});
    }
    if (url.pathname === '/storage/v1/object/photos' && m === 'DELETE') {
      await en(db, uidDe(req), 'delete from storage.objects where bucket_id = $1 and name in (select jsonb_array_elements_text($2::jsonb))', ['photos', JSON.stringify(corps.prefixes)]);
      return json(200, []);
    }
    return json(404, {message: 'route inconnue ' + url.pathname});
  }
  async function brancher(ctx) {
    // l'intro du jour est déjà vue (sauf si le test la demande avec ?intro, ou options.intro)
    if (!options.intro) await ctx.addInitScript(() => { try { localStorage.setItem('mhc-intro', new Date().toLocaleDateString('sv')); } catch (e) {} });
    await ctx.route(URL_SB + '/**', gerer);
    // three.js (mini-jeux 3D) : copie locale de la même version ; le reste de jsDelivr = supabase-js
    const THREE_DIR = __dirname + '/node_modules/three/';   // seulement pour les tests des mini-jeux 3D (npm install three, même version qu'index.html)
    await ctx.route('https://cdn.jsdelivr.net/**', r => {
      const m = r.request().url().match(/three@[\d.]+\/(.*)$/);
      if (m) return r.fulfill({status: 200, contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(THREE_DIR + m[1])});
      return r.fulfill({status: 200, contentType: 'application/javascript', body: fs.readFileSync(UMD)});
    });
    await ctx.route(/localhost:87\d\d\/config\.js/, r => r.fulfill({status: 200, contentType: 'application/javascript',
      body: `const CONFIG = {supabaseUrl: '${URL_SB}', supabaseCle: 'cle-publique-test'};`}));
  }
  return {db, users, journal, brancher, creerUtilisateur, couper: v => { coupe = v; }};
}
module.exports = {demarrer};
