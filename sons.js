'use strict';
/* Musique et bruitages du jeu, entièrement synthétisés (Web Audio) : aucun fichier son, aucune bibliothèque.
   Son.jouer(nom) : un bruitage (voir EFFETS) ; Son.discret(true) : la musique baisse (boosters, mini-jeux). Réglages (musique, bruitages) gardés dans le téléphone
   (localStorage « mhc-son »). Le son démarre au premier toucher (règle des navigateurs) et se coupe quand l'appli est cachée. */
const Son = (() => {
  const CLE = 'mhc-son';
  let reg = {musique: true, effets: true};
  try { Object.assign(reg, JSON.parse(localStorage.getItem(CLE) || '{}')); } catch (e) {}
  let ctx = null, sortie, busMusique, busEffets, reverbe, bruitBlanc, bruitRose, discretAvant = false;
  const VOL_MUSIQUE = .15, VOL_EFFETS = .7;

  function demarrer() {
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
    sortie = ctx.createGain(); sortie.gain.value = 2.4; sortie.connect(comp);
    busMusique = ctx.createGain(); busMusique.gain.value = reg.musique ? VOL_MUSIQUE : 0; busMusique.connect(sortie);
    busEffets = ctx.createGain(); busEffets.gain.value = reg.effets ? VOL_EFFETS : 0; busEffets.connect(sortie);
    // une petite réverbération de salle (réponse fabriquée : bruit qui décroît)
    reverbe = ctx.createConvolver(); const n = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    reverbe.buffer = ir; const rv = ctx.createGain(); rv.gain.value = .22; reverbe.connect(rv); rv.connect(sortie);
    // bruits pré-calculés (2 s) : blanc et rose
    bruitBlanc = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const b = bruitBlanc.getChannelData(0);
    for (let i = 0; i < b.length; i++) b[i] = Math.random() * 2 - 1;
    bruitRose = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const r = bruitRose.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < r.length; i++) { const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0527; r[i] = (b0 + b1 + b2 + w * .1848) * .2; }
    if (reg.musique) musique.lancer();
  }
  ['pointerdown', 'keydown'].forEach(t => addEventListener(t, demarrer, {capture: true, passive: true}));
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  // ── briques ────────────────────────────────────────────────────────────────
  const t0 = () => ctx.currentTime + .01;
  function note(f, quand, duree, {type = 'sine', vol = .3, att = .005, fin, bus = busEffets, glisse, filtre, reverb = 0} = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, quand);
    if (glisse) o.frequency.exponentialRampToValueAtTime(glisse, quand + duree);
    g.gain.setValueAtTime(0, quand); g.gain.linearRampToValueAtTime(vol, quand + att);
    g.gain.exponentialRampToValueAtTime(.0008, quand + (fin || duree));
    let x = o; if (filtre) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filtre; o.connect(fl); x = fl; }
    x.connect(g); g.connect(bus); if (reverb) { const s = ctx.createGain(); s.gain.value = reverb; g.connect(s); s.connect(reverbe); }
    o.start(quand); o.stop(quand + (fin || duree) + .05);
    return o;
  }
  function bruit(quand, duree, {type = 'bandpass', f = 1000, f2, q = 1, vol = .3, att = .005, rose = false, bus = busEffets, reverb = 0} = {}) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = rose ? bruitRose : bruitBlanc; s.loop = duree > 1.9;
    fl.type = type; fl.frequency.setValueAtTime(f, quand); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, quand + duree);
    g.gain.setValueAtTime(0, quand); g.gain.linearRampToValueAtTime(vol, quand + att); g.gain.exponentialRampToValueAtTime(.0008, quand + duree);
    s.connect(fl); fl.connect(g); g.connect(bus); if (reverb) { const r = ctx.createGain(); r.gain.value = reverb; g.connect(r); r.connect(reverbe); }
    s.start(quand, s.loop ? Math.random() * 1.5 : Math.random() * Math.max(0, 1.95 - duree)); s.stop(quand + duree + .05);
    return g;
  }
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);   // numéro de note MIDI → fréquence
  const arpege = (notes, quand, pas, opts) => notes.forEach((n, i) => note(hz(n), quand + i * pas, opts.duree || .25, opts));
  // la foule : bruit rose filtré qui monte et redescend (acclamations) ou qui retombe (« ooooh »)
  function foule(quand, duree, {vol = .25, f = 1100, retombe = false} = {}) {
    const g = bruit(quand, duree, {type: 'bandpass', f, f2: retombe ? f * .55 : f * 1.15, q: .7, vol, att: retombe ? .08 : .25, rose: true, reverb: .6});
    return g;
  }

  // ── les bruitages ──────────────────────────────────────────────────────────
  const EFFETS = {
    clic: q => { note(1500, q, .045, {type: 'triangle', vol: .07}); },
    tap: q => { note(900, q, .03, {type: 'sine', vol: .06}); },
    onglet: q => { note(660, q, .05, {type: 'triangle', vol: .06}); note(990, q + .04, .06, {type: 'triangle', vol: .05}); },
    piece: q => { note(hz(88), q, .08, {type: 'square', vol: .07, filtre: 5000}); note(hz(95), q + .07, .28, {type: 'square', vol: .07, filtre: 5000, reverb: .2}); },
    erreur: q => { note(170, q, .11, {type: 'square', vol: .08, filtre: 900}); note(130, q + .13, .16, {type: 'square', vol: .08, filtre: 900}); },
    notif: q => { note(hz(81), q, .18, {type: 'sine', vol: .14, reverb: .3}); note(hz(88), q + .12, .35, {type: 'sine', vol: .14, reverb: .3}); },
    // booster : on déchire le haut, le souffle sort, la carte se révèle selon son palier
    dechire: q => { bruit(q, .42, {type: 'bandpass', f: 1800, f2: 7000, q: 1.6, vol: .32, att: .02}); bruit(q + .05, .3, {type: 'highpass', f: 5000, vol: .12}); },
    souffle: q => { bruit(q, .9, {type: 'bandpass', f: 500, f2: 2400, q: .8, vol: .22, att: .15, reverb: .4}); },
    envol: q => { bruit(q, .35, {type: 'bandpass', f: 900, f2: 3800, q: 1.2, vol: .16, att: .05}); },
    retourne: q => { bruit(q, .12, {type: 'highpass', f: 2500, vol: .14}); note(520, q, .1, {type: 'triangle', vol: .06, glisse: 780}); },
    'revele-bronze': q => { arpege([64, 67, 71], q, .07, {type: 'triangle', vol: .1, duree: .3, reverb: .3}); },
    'revele-argent': q => { arpege([69, 73, 76, 81], q, .07, {type: 'triangle', vol: .12, duree: .45, reverb: .4}); bruit(q, .6, {type: 'highpass', f: 7000, vol: .05}); },
    'revele-or': q => { note(55, q, .5, {type: 'sine', vol: .35, glisse: 38}); arpege([72, 76, 79, 84, 88], q + .05, .075, {type: 'square', vol: .07, duree: .6, filtre: 4000, reverb: .5});
      bruit(q + .1, 1.2, {type: 'highpass', f: 6000, vol: .08, att: .2}); },
    'revele-ultime': q => { note(45, q, .9, {type: 'sine', vol: .45, glisse: 30}); bruit(q, .5, {type: 'lowpass', f: 400, vol: .3});
      arpege([69, 73, 76, 81, 85, 88, 93], q + .08, .07, {type: 'square', vol: .08, duree: .8, filtre: 4500, reverb: .6});
      [57, 64, 69, 73].forEach(n => note(hz(n), q + .55, 1.6, {type: 'sawtooth', vol: .04, att: .2, filtre: 2200, reverb: .6}));
      bruit(q + .2, 1.8, {type: 'highpass', f: 6500, vol: .1, att: .3}); },
    // la fusion : trois cartes qui se rejoignent (montée), l'éclair, puis la fanfare
    fusion: q => { note(180, q, 1.1, {type: 'sawtooth', vol: .07, glisse: 1400, filtre: 3000, att: .3}); bruit(q, 1.1, {type: 'bandpass', f: 600, f2: 5000, q: 2, vol: .12, att: .4});
      bruit(q + 1.1, .4, {type: 'lowpass', f: 1200, vol: .35}); note(60, q + 1.1, .6, {type: 'sine', vol: .4, glisse: 40}); },
    montee: q => { arpege([60, 64, 67, 72, 76, 79, 84], q, .06, {type: 'square', vol: .07, duree: .5, filtre: 5000, reverb: .5}); },
    niveau: q => { arpege([67, 72, 76], q, .11, {type: 'square', vol: .08, duree: .2, filtre: 4000}); note(hz(79), q + .33, .9, {type: 'square', vol: .08, filtre: 4000, reverb: .5});
      note(hz(84), q + .33, .9, {type: 'triangle', vol: .08, reverb: .5}); bruit(q + .3, 1, {type: 'highpass', f: 7000, vol: .06}); },
    recompense: q => { arpege([76, 79, 84], q, .08, {type: 'triangle', vol: .12, duree: .4, reverb: .4}); EFFETS.piece(q + .25); },
    pari: q => { bruit(q, .06, {type: 'lowpass', f: 900, vol: .3}); note(140, q, .09, {type: 'sine', vol: .25, glisse: 80}); EFFETS.piece(q + .12); },
    // le handball : sifflet, tir, filet, poteau, arrêt, rebond, foule
    sifflet: q => { [0, .32].forEach((d, i) => { const o = note(2850, q + d, i ? .5 : .2, {type: 'sine', vol: .12, att: .01});
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 38; lg.gain.value = 140; lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(q + d); lfo.stop(q + d + .55); }); bruit(q, .8, {type: 'bandpass', f: 2900, q: 8, vol: .04}); },
    tir: q => { bruit(q, .2, {type: 'bandpass', f: 500, f2: 3200, q: 1.5, vol: .24, att: .01}); note(110, q, .06, {type: 'sine', vol: .2, glisse: 70}); },
    filet: q => { bruit(q, .35, {type: 'highpass', f: 2200, f2: 5000, vol: .2, att: .01}); },
    poteau: q => { [523, 1427, 2349, 3350].forEach((f, i) => note(f, q, 1.1 - i * .2, {type: 'sine', vol: .12 / (i + 1), att: .002, reverb: .4})); note(90, q, .15, {type: 'sine', vol: .3}); },
    rebond: q => { note(95, q, .12, {type: 'sine', vol: .32, glisse: 55}); bruit(q, .05, {type: 'lowpass', f: 600, vol: .15}); },
    arret: q => { note(130, q, .18, {type: 'sine', vol: .4, glisse: 60}); bruit(q, .08, {type: 'lowpass', f: 800, vol: .3}); foule(q + .05, 1.3, {vol: .22, f: 700, retombe: true}); },
    but: q => { EFFETS.filet(q); foule(q + .05, 2.2, {vol: .5, f: 1200}); note(hz(57), q + .1, .7, {type: 'sawtooth', vol: .05, filtre: 1800, reverb: .5});
      note(hz(64), q + .1, .7, {type: 'sawtooth', vol: .05, filtre: 1800, reverb: .5}); },
    rate: q => { foule(q, 1.1, {vol: .18, f: 650, retombe: true}); },
    parade: q => { note(130, q, .18, {type: 'sine', vol: .4, glisse: 60}); bruit(q, .08, {type: 'lowpass', f: 800, vol: .3}); foule(q + .05, 1.8, {vol: .3, f: 1150}); },
    encaisse: q => { EFFETS.filet(q); foule(q + .1, 1.2, {vol: .2, f: 650, retombe: true}); },
    victoire: q => { foule(q, 2.6, {vol: .3, f: 1100}); arpege([67, 72, 76, 79], q + .1, .12, {type: 'square', vol: .08, duree: .25, filtre: 4000});
      [72, 76, 79, 84].forEach(n => note(hz(n), q + .6, 1.1, {type: 'square', vol: .05, filtre: 4000, reverb: .5})); },
    defaite: q => { arpege([67, 63, 60], q, .22, {type: 'triangle', vol: .12, duree: .45, reverb: .4}); note(hz(55), q + .66, .9, {type: 'triangle', vol: .1, reverb: .4}); },
    nul: q => { arpege([67, 69], q, .2, {type: 'triangle', vol: .1, duree: .5, reverb: .4}); },
    buzzer: q => { note(220, q, .7, {type: 'sawtooth', vol: .1, filtre: 1500, att: .01}); note(223, q, .7, {type: 'square', vol: .06, filtre: 1500, att: .01}); },
    intro: q => { bruit(q, .7, {type: 'bandpass', f: 300, f2: 3000, q: 1, vol: .2, att: .1, reverb: .4}); note(55, q + .5, .8, {type: 'sine', vol: .4, glisse: 35});
      arpege([69, 76, 81], q + .55, .09, {type: 'triangle', vol: .1, duree: .6, reverb: .5}); },
  };

  // ── la musique : un thème original, entraînant (116 battements par minute), joué en boucle tant que l'appli est ouverte ──
  // la mineur : la, fa, do, sol (couplet), puis ré mineur, fa, do, mi (pont) ; batterie, basse, nappe, arpège et une mélodie.
  const musique = (() => {
    const BPM = 116, PAS = 60 / BPM / 4;   // une double croche
    const ACC = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [50, 53, 57], [53, 57, 60], [48, 52, 55], [52, 56, 59]];
    const GRILLE = [0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3];   // 16 mesures
    // mélodie : [pas dans la mesure, décalage dans l'accord (0 1 2 = notes de l'accord, 3 = octave), durée en pas]
    const MEL = [[0, 2, 3], [4, 1, 2], [6, 2, 2], [8, 3, 4], [12, 2, 2], [14, 1, 2]];
    const MEL2 = [[0, 3, 2], [2, 2, 2], [4, 1, 4], [10, 0, 2], [12, 1, 2], [14, 2, 2]];
    let actif = false, prochain = 0, pas = 0, minuteur = null;
    function jouerPas(q, i) {
      const mesure = Math.floor(i / 16) % GRILLE.length, k = i % 16, acc = ACC[GRILLE[mesure]], partie = mesure < 8 ? 'A' : 'B';
      const M = busMusique;
      // batterie
      if (k % 4 === 0) note(150, q, .16, {type: 'sine', vol: .9, glisse: 42, bus: M});                                   // grosse caisse
      if (k === 4 || k === 12) { bruit(q, .16, {type: 'bandpass', f: 1900, q: .9, vol: .55, bus: M}); bruit(q, .05, {type: 'highpass', f: 6000, vol: .2, bus: M}); }  // claquement
      if (k % 2 === 0) bruit(q, k % 4 === 2 ? .06 : .03, {type: 'highpass', f: 8000, vol: k % 4 === 2 ? .22 : .12, bus: M});   // charleston
      if (mesure % 4 === 3 && k >= 12) bruit(q, .08, {type: 'bandpass', f: 900 + (k - 12) * 300, q: 2, vol: .35, bus: M});   // roulement de fin de phrase
      // basse : la fondamentale en croches, l'octave sur les contretemps
      if (k % 2 === 0) note(hz(acc[0] - 24 + (k % 4 === 2 ? 12 : 0)), q, PAS * 1.8, {type: 'sawtooth', vol: .32, filtre: 520, bus: M});
      // nappe : l'accord, au début de chaque mesure
      if (k === 0) acc.forEach(n => { note(hz(n), q, PAS * 16, {type: 'sawtooth', vol: .045, att: .25, filtre: 1300, bus: M});
        note(hz(n) * 1.006, q, PAS * 16, {type: 'sawtooth', vol: .035, att: .25, filtre: 1300, bus: M}); });
      // arpège en doubles croches (partie B : une octave plus haut)
      const ar = [0, 1, 2, 3, 2, 1][k % 6], na = acc[ar % 3] + 12 + (ar === 3 ? 12 : 0) + (partie === 'B' ? 12 : 0);
      if (mesure >= 2) note(hz(na), q, PAS * 1.4, {type: 'square', vol: .05, filtre: 2600, bus: M});
      // mélodie (à partir de la 5e mesure)
      if (mesure >= 4) for (const [p, d, l] of (mesure % 2 ? MEL2 : MEL)) if (p === k) note(hz(acc[d % 3] + 12 + (d === 3 ? 12 : 0)), q, PAS * l, {type: 'triangle', vol: .16, filtre: 3800, reverb: .3, bus: M});
    }
    function planifier() {
      while (prochain < ctx.currentTime + .25) { jouerPas(prochain, pas++); prochain += PAS; }
    }
    return {
      lancer() { if (actif || !ctx) return; actif = true; prochain = ctx.currentTime + .1; pas = 0; minuteur = setInterval(planifier, 60); },
      arreter() { actif = false; clearInterval(minuteur); },
    };
  })();

  // pas de brouhaha de fond pendant les mini-jeux (Maël : « on dirait du vent en permanence ») : la musique continue, un peu plus bas
  return {
    jouer(nom) { if (!ctx || !reg.effets || ctx.state !== 'running') return; const e = EFFETS[nom]; if (e) try { e(t0()); } catch (x) { console.warn('son', nom, x); } },
    noms: Object.keys(EFFETS),
    discret(oui) { if (!ctx || oui === discretAvant) return; discretAvant = oui; busMusique.gain.setTargetAtTime(reg.musique ? VOL_MUSIQUE * (oui ? .55 : 1) : 0, ctx.currentTime, .3); },
    get reglages() { return {...reg}; },
    regler(cle, v) {
      reg[cle] = v; try { localStorage.setItem(CLE, JSON.stringify(reg)); } catch (e) {}
      if (!ctx) return;
      if (cle === 'musique') { busMusique.gain.setTargetAtTime(v ? VOL_MUSIQUE * (discretAvant ? .55 : 1) : 0, ctx.currentTime, .2); if (v) musique.lancer(); else setTimeout(() => !reg.musique && musique.arreter(), 600); }
      if (cle === 'effets') { busEffets.gain.setTargetAtTime(v ? VOL_EFFETS : 0, ctx.currentTime, .05); }
    },
    get actif() { return !!ctx && ctx.state === 'running'; },
  };
})();
