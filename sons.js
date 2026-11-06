'use strict';
/* Musique et bruitages du jeu, entièrement synthétisés (Web Audio) : aucun fichier son, aucune bibliothèque.
   Son.jouer(nom) : un bruitage (voir EFFETS) ; Son.discret(true) : la musique baisse (boosters, mini-jeux) ; Son.theme(nom) : la musique de la partie du jeu (accueil, club, jouer, social). Réglages (musique, bruitages) gardés dans le téléphone
   (localStorage « mhc-son »). Le son démarre au premier toucher (règle des navigateurs) et se coupe quand l'appli est cachée. */
const Son = (() => {
  const CLE = 'mhc-son';
  let reg = {musique: true, effets: true};
  try { Object.assign(reg, JSON.parse(localStorage.getItem(CLE) || '{}')); } catch (e) {}
  let ctx = null, sortie, busMusique, busEffets, reverbe, bruitBlanc, bruitRose, discretAvant = false;
  const VOL_MUSIQUE = .075, VOL_EFFETS = .7;   // musique : moitié moins forte qu'au début (demande de Maël)

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

  // ── la musique : un thème original par partie du jeu (demande de Maël), joué en boucle. Le jeu est calme : tous les thèmes
  // sont dans l'esprit de celui du Club (piano électrique, basse ronde, batterie feutrée), sauf pendant les mini-jeux (sportif).
  // Accueil : do majeur, 84 BPM · Club et Équipe : accords de septième, 88 BPM · Jouer et Championnat : ré dorien, 92 BPM ·
  // Social : mi bémol majeur, 80 BPM · mini-jeux : sportif, mi mineur, 128 BPM.
  // Changement de partie : fondu de la musique, le nouveau thème démarre à son début.
  const musique = (() => {
    const M = () => busMusique;
    const grosse = (q, vol = .9) => note(150, q, .16, {type: 'sine', vol, glisse: 42, bus: M()});
    const claque = (q, vol = .55) => { bruit(q, .16, {type: 'bandpass', f: 1900, q: .9, vol, bus: M()}); bruit(q, .05, {type: 'highpass', f: 6000, vol: vol * .35, bus: M()}); };
    const charley = (q, vol, long = .03) => bruit(q, long, {type: 'highpass', f: 8000, vol, bus: M()});
    // thème calme : piano électrique, basse ronde, batterie feutrée, clochettes (accords de 4 notes, fondamentale en premier)
    const calme = ({bpm, acc, grille, mel, basse = [[0, 0, 6], [8, 2, 4], [14, 0, 2, 2]], frappes = [0, 7], grosse: gc = [0, 10], cloche = 24}) => ({bpm, acc, grille,
      pas(q, k, mesure, acc, P) {
        if (gc.includes(k)) grosse(q, .5);
        if (k === 4 || k === 12) bruit(q, .05, {type: 'bandpass', f: 3200, q: 3, vol: .2, bus: M()});
        if (k % 2 === 0) charley(q, k % 4 === 2 ? .06 : .035);
        for (const [p, d, l, t = 0] of basse) if (p === k) note(hz(acc[d] - 24 + t), q, P * l, {type: 'triangle', vol: .4, filtre: 420, bus: M()});
        if (frappes.includes(k)) acc.forEach((n, i) => { note(hz(n), q + i * .012, P * 8, {type: 'sine', vol: .065, att: .01, reverb: .35, bus: M()});
          note(hz(n) * 2, q + i * .012, P * 3, {type: 'triangle', vol: .014, att: .005, bus: M()}); });
        if (mesure >= 4) for (const [p, d] of mel[mesure % 2]) if (p === k) note(hz(acc[d] + cloche), q, P * 6, {type: 'sine', vol: .085, att: .005, reverb: .5, bus: M()});
      },
    });
    const THEMES = {
      // l'accueil : do majeur, lumineux (84 BPM)
      accueil: calme({bpm: 84, acc: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]], grille: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
        mel: [[[0, 2], [4, 3], [8, 1], [12, 2]], [[2, 1], [6, 3], [10, 2]]], cloche: 12}),
      // les menus Jouer et Championnat : ré dorien, un peu plus allant (92 BPM)
      jouer: calme({bpm: 92, acc: [[50, 53, 57, 60], [52, 55, 59, 62], [53, 57, 60, 64], [52, 55, 59, 62]], grille: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
        mel: [[[0, 3], [3, 2], [6, 1], [10, 2], [14, 3]], [[0, 1], [8, 2], [12, 3]]], basse: [[0, 0, 4], [6, 0, 2, 12], [8, 2, 4], [14, 3, 2]], grosse: [0, 8]}),
      // Social : mi bémol majeur, très doux (80 BPM)
      social: calme({bpm: 80, acc: [[51, 55, 58, 62], [48, 51, 55, 58], [56, 60, 63, 67], [58, 62, 65, 67]], grille: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
        mel: [[[0, 3], [6, 2], [12, 1]], [[4, 2], [8, 3], [14, 1]]], frappes: [0, 6, 11], grosse: [0, 11]}),
      club: {   // calme : piano électrique, basse ronde, batterie feutrée
        bpm: 88,
        acc: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
        grille: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
        pas(q, k, mesure, acc, P) {
          if (k === 0 || k === 10) grosse(q, .55);
          if (k === 4 || k === 12) bruit(q, .05, {type: 'bandpass', f: 3200, q: 3, vol: .22, bus: M()});   // baguette sur le cercle
          if (k % 2 === 0) charley(q, k % 4 === 2 ? .07 : .04);
          if (k === 0) note(hz(acc[0] - 24), q, P * 6, {type: 'triangle', vol: .42, filtre: 420, bus: M()});
          if (k === 8) note(hz(acc[2] - 24), q, P * 4, {type: 'triangle', vol: .36, filtre: 420, bus: M()});
          if (k === 14) note(hz(acc[0] - 22), q, P * 2, {type: 'triangle', vol: .28, filtre: 420, bus: M()});
          // piano électrique : l'accord, frappé au début de la mesure puis rappelé
          if (k === 0 || k === 7) acc.forEach((n, i) => { note(hz(n), q + i * .012, P * (k ? 8 : 7), {type: 'sine', vol: .07, att: .01, reverb: .35, bus: M()});
            note(hz(n) * 2, q + i * .012, P * 3, {type: 'triangle', vol: .015, att: .005, bus: M()}); });
          // une petite mélodie de clochettes, à partir de la 5e mesure
          const mel = mesure % 2 ? [[2, 3], [6, 2], [12, 1]] : [[0, 1], [4, 2], [10, 3], [14, 2]];
          if (mesure >= 4) for (const [p, d] of mel) if (p === k) note(hz(acc[d] + 24), q, P * 6, {type: 'sine', vol: .09, att: .005, reverb: .5, bus: M()});
        },
      },
      minijeux: {   // sportif (seulement pendant les mini-jeux) : batterie qui pousse, basse en croches, cuivres en coups, riff pentatonique
        bpm: 128,
        acc: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
        grille: [0, 1, 2, 3, 0, 1, 2, 3, 0, 0, 1, 1, 2, 2, 3, 3],
        pas(q, k, mesure, acc, P) {
          if (k % 4 === 0 || (mesure % 4 === 3 && k === 14)) grosse(q, 1);
          if (k === 4 || k === 12) { claque(q, .6); bruit(q + .012, .1, {type: 'bandpass', f: 1500, q: 1.2, vol: .3, bus: M()}); }
          charley(q, k % 4 === 2 ? .2 : .07, k % 4 === 2 ? .09 : .025);
          if (mesure % 8 === 7 && k >= 8 && k % 2 === 0) bruit(q, .09, {type: 'bandpass', f: 700 + k * 120, q: 2.5, vol: .4, bus: M()});
          if (k % 2 === 0) note(hz(acc[0] - 24 + (k % 8 === 6 ? 12 : 0)), q, P * 1.6, {type: 'sawtooth', vol: .34, filtre: 650, bus: M()});
          // cuivres : l'accord en coups secs
          if (k === 0 || k === 6 || k === 10) acc.forEach(n => note(hz(n + 12), q, P * 1.8, {type: 'sawtooth', vol: .045, att: .008, filtre: 2400, bus: M()}));
          const RIFF = [[0, 64], [3, 67], [6, 69], [8, 71], [11, 69], [14, 67]], RIFF2 = [[0, 71], [2, 74], [4, 71], [6, 69], [8, 67], [12, 64]];
          if (mesure >= 4) for (const [p, n] of (mesure % 2 ? RIFF2 : RIFF)) if (p === k) note(hz(n + 12), q, P * 2, {type: 'square', vol: .06, filtre: 3000, reverb: .2, bus: M()});
        },
      },
    };
    let actif = false, prochain = 0, pas = 0, minuteur = null, theme = THEMES.accueil, voulu = 'accueil';
    function planifier() {
      while (prochain < ctx.currentTime + .25) {
        const P = 60 / theme.bpm / 4, mesure = Math.floor(pas / 16) % theme.grille.length, k = pas % 16;
        try { theme.pas(prochain, k, mesure, theme.acc[theme.grille[mesure]], P); } catch (e) { console.warn('musique', e); }
        pas++; prochain += P;
      }
    }
    return {
      lancer() { if (actif || !ctx) return; actif = true; theme = THEMES[voulu] || THEMES.accueil; prochain = ctx.currentTime + .1; pas = 0; minuteur = setInterval(planifier, 60); },
      arreter() { actif = false; clearInterval(minuteur); },
      // une autre partie du jeu : fondu, puis le nouveau thème depuis son début
      changer(nom) {
        if (!THEMES[nom] || nom === voulu) return;
        voulu = nom;
        if (!actif || !ctx) return;
        const g = busMusique.gain; g.cancelScheduledValues(ctx.currentTime); g.setTargetAtTime(0, ctx.currentTime, .12);
        clearTimeout(musique.t);
        musique.t = setTimeout(() => { if (voulu !== nom) return; theme = THEMES[nom]; pas = 0; prochain = ctx.currentTime + .05;
          g.setTargetAtTime(niveauMusique(), ctx.currentTime + .05, .35); }, 450);
      },
    };
  })();
  const niveauMusique = () => reg.musique ? VOL_MUSIQUE * (discretAvant ? .55 : 1) : 0;

  // pas de brouhaha de fond pendant les mini-jeux (Maël : « on dirait du vent en permanence ») : la musique continue, un peu plus bas
  return {
    jouer(nom) { if (!ctx || !reg.effets || ctx.state !== 'running') return; const e = EFFETS[nom]; if (e) try { e(t0()); } catch (x) { console.warn('son', nom, x); } },
    noms: Object.keys(EFFETS),
    discret(oui) { if (!ctx || oui === discretAvant) return; discretAvant = oui; busMusique.gain.setTargetAtTime(niveauMusique(), ctx.currentTime, .3); },
    theme(nom) { musique.changer(nom); },
    get reglages() { return {...reg}; },
    regler(cle, v) {
      reg[cle] = v; try { localStorage.setItem(CLE, JSON.stringify(reg)); } catch (e) {}
      if (!ctx) return;
      if (cle === 'musique') { busMusique.gain.setTargetAtTime(niveauMusique(), ctx.currentTime, .2); if (v) musique.lancer(); else setTimeout(() => !reg.musique && musique.arreter(), 600); }
      if (cle === 'effets') { busEffets.gain.setTargetAtTime(v ? VOL_EFFETS : 0, ctx.currentTime, .05); }
    },
    get actif() { return !!ctx && ctx.state === 'running'; },
  };
})();
