// L'entraîneur des Légendes (match_ordi, style « legende ») et la fatigue de l'ordinateur et des gardiens (demande de Maël,
// 21 nov. 2026, retours de Guilhem et Rémi). Duel tactique simulé directement sur les fonctions du serveur (PGlite) : le joueur
// choisit la tactique de la tranche suivante pendant le récit (il voit leur défense, pas leur attaque, pas encore leur changement).
//   node tests/test_ia_legende.js
const {creerBase, verifs} = require('./base');
const {verif, bilan} = verifs();
const ATT = ['duels', 'enclenchement', 'rapide'], DEF = ['06', '15', '33'];
const contre = (a, d) => ({'duels:06': 1, 'duels:15': -1, 'enclenchement:33': 1, 'enclenchement:06': -1, 'rapide:15': 1, 'rapide:33': -1})[a + ':' + d] || 0;
const batDef = d => ATT.find(a => contre(a, d) === 1), batAtt = a => DEF.find(d => contre(a, d) === -1);
const parmi = l => l[Math.floor(Math.random() * l.length)];

(async () => {
  const db = await creerBase();
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  // une façon de jouer : la tactique suivante d'après la nôtre (aa, ad) et leur défense visible (df)
  const STYLES = {
    'garde sa tactique': (aa, ad) => [aa, ad],
    'contre ce qu’il voit': (aa, ad, df) => [batDef(df), batAtt(batDef(ad))],
    'un coup d’avance': (aa, ad, df) => { const a1 = batDef(df), d1 = batAtt(batDef(ad)); return [batDef(batAtt(a1)), batAtt(batDef(d1))]; },
    'varie ses façons': (aa, ad, df) => { const c = parmi([0, 1, 2]), a1 = batDef(df), d1 = batAtt(batDef(ad));
      return [[aa, a1, batDef(batAtt(a1))][c], [ad, d1, batAtt(batDef(d1))][parmi([0, 1, 2])]]; },
  };
  const res = {};
  for (const [nom, joue] of Object.entries(STYLES)) {
    let dessus = 0, contres = 0, n = 0;
    for (let m = 0; m < 50; m++) {
      const pa = parmi(ATT), pd = parmi(DEF);
      let e = {bloc: 0, t: 0, score: [0, 0], ev: [], ia: (await q("select match_ia('legende') i"))[0].i, blocs: [],
        a: {attaque: parmi(ATT), defense: parmi(DEF)}, b: {attaque: pa, defense: pd, att: 90, def: 90, consigne: 'normal', fatigue: 0, pref_att: pa, pref_def: pd}};
      for (let k = 0; k < 12; k++) {
        e.blocs.push({aa: e.a.attaque, ad: e.a.defense, ba: e.b.attaque, bd: e.b.defense});
        dessus += contre(e.a.attaque, e.b.defense) === 1; contres += contre(e.a.attaque, e.b.defense) === -1; n++;
        const [na, nd] = joue(e.a.attaque, e.a.defense, e.b.defense);
        e.bloc = k + 1; e.t = (k + 1) * 300;
        e = (await q('select match_ordi($1::jsonb, false) e', [JSON.stringify(e)]))[0].e;
        e.ev = [];
        e.a = {attaque: na, defense: nd};
      }
    }
    res[nom] = {dessus: +(12 * dessus / n).toFixed(1), contre: +(12 * contres / n).toFixed(1)};
  }
  console.log(res);
  verif(`une façon de jouer fixe est contrée la plupart du temps (en attaque, sur 12 tranches) : ${JSON.stringify(res)}`,
    ['garde sa tactique', 'contre ce qu’il voit', 'un coup d’avance'].every(s => res[s].contre >= 5.5 && res[s].dessus <= 3.5));
  verif('plus de coup imparable : un coup d’avance ne le bat plus à coup sûr (avant : 10,5 tranches sur 12)', res['un coup d’avance'].dessus <= 3.5);
  verif('qui varie ses façons de jouer s’en sort mieux que toute façon fixe', ['garde sa tactique', 'contre ce qu’il voit', 'un coup d’avance'].every(s => res['varie ses façons'].dessus > res[s].dessus));
  // les autres entraîneurs ne changent pas : le « réfléchi » contre notre tactique de la tranche jouée
  const ref = (await q(`select match_ordi('{"bloc": 3, "t": 900, "score": [0, 0], "ia": {"style": "reflechi", "reac": 1, "neutre": 1, "anticipe": 0, "lecture": 1},
    "blocs": [], "ev": [], "a": {"attaque": "duels", "defense": "06"}, "b": {"attaque": "rapide", "defense": "06", "att": 90, "def": 90, "consigne": "normal", "fatigue": 0}}'::jsonb, false) e`))[0].e;
  verif('entraîneur réfléchi : toujours le contre de notre tactique (duels → 1-5, 0-6 → duels)', ref.b.defense === '15' && ref.b.attaque === 'duels', ref.b);

  // fatigue de l'ordinateur : 0 → 1 sur une période (consigne normale), jusqu'à fatigue_ordi (4) points d'attaque et de défense en moins
  const fo = +(await q("select parami('fatigue_ordi') v"))[0].v;
  const b = (await q(`select match_fatiguer('{"fo": 4, "fatigue": 0, "consigne": "normal"}'::jsonb, 900) b`))[0].b;
  verif(`ordinateur : après 15 min, fatigue ½ et 2 points de moins en attaque et en défense (${b.fatigue}, ${b.fma}, ${b.fmd})`, fo === 4 && +b.fatigue === .5 && +b.fma === 2 && +b.fmd === 2, b);
  const p = (await q(`select match_fatiguer('{"fo": 4, "fatigue": 0, "consigne": "pression"}'::jsonb, 900) b`))[0].b;
  verif('ordinateur sous pression : plus vite (×4/3)', Math.abs(+p.fatigue - 2 / 3) < .01, p);
  const ancien = (await q(`select match_fatiguer('{"fatigue": 0, "consigne": "normal"}'::jsonb, 900) b`))[0].b;
  verif('match commencé avant (sans « fo ») : ancienne fatigue d’équipe, sans malus', +ancien.fatigue === .025 && !ancien.fma, ancien);

  // gardiens : 3 fois moins vite ; endurance de 0,65 à 1,35
  const g = (await q(`select match_fat('{"fp": {"x1": 0, "x2": 0}, "equipe": {"GB": "x1", "AG": "x2"}, "fr": {"x1": 1, "x2": 1},
    "fcfg": {"m": 80, "s": 0.3, "gb": 0.33}}'::jsonb, 0.3, 0.04) e`))[0].e;
  verif(`gardien 3 fois moins vite qu’un joueur de champ (${g.fp.x1} contre ${g.fp.x2})`, Math.abs(+g.fp.x1 - .099) < .001 && +g.fp.x2 === .3, g.fp);
  const par = (await q("select (param('fatigue_gardien') #>> '{}')::numeric g, (valeurs ->> 'fatigue_endurance')::numeric e, (valeurs ->> 'fatigue_endurance_ecart')::numeric x from parametres"))[0];
  verif('réglages : fatigue_gardien 0,33, endurance 0,8 et écart 0,35 (de 0,65 à 1,35)', +par.g === .33 && +par.e === .8 && +par.x === .35, par);
  process.exit(bilan() ? 1 : 0);
})();
