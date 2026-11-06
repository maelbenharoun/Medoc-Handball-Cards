// Mini-jeux en vraie 3D (three.js, chargé seulement à l'ouverture d'un mini-jeu).
// Personnages : avatar libre Microsoft Rocketbox (licence MIT, voir modeles/LICENCE-rocketbox.txt), maillots repeints
// d'après les photos du club (scripts/modeles3d/). Animations de course et de repos du même projet ; les gestes de
// handball (bras armé, tir, parades, contre, saut) sont des poses calculées sur le squelette (POSES plus bas).
// Le serveur décide toujours du résultat (mini_jouer) : ce fichier ne fait que montrer et mesurer le geste.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const V = '29';
const DOSSIER = new URL('./modeles/', import.meta.url);
const fichier = f => new URL(f + '?v=' + V, DOSSIER).href;
let A = null;            // fonctions du jeu (app.js) : MJ, miniAide, miniEnvoyer, miniFin, fermerMini, toast, vibrer, moinsAnim, Compte
export function init(api) { A = api; }

// ── chargement : modèle, textures (une par tenue) ─────────────────────────────────────────────────────────────────
const KITS = ['medoc', 'adv', 'gb-medoc', 'gb-adv'];
let ressources = null;
function charger() {
  return ressources ||= (async () => {
    const tl = new THREE.TextureLoader();
    const tex = (f, couleur = true) => tl.loadAsync(fichier(f)).then(t => { if (couleur) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
    const [g, tete, teteN, corpsN, corpsNgb, ...kits] = await Promise.all([new GLTFLoader().loadAsync(fichier('joueur.glb')),
      tex('tete.jpg'), tex('tete-n.jpg', false), tex('corps-n.jpg', false), tex('corps-n-gb.jpg', false), ...KITS.map(k => tex(`corps-${k}.jpg`))]);
    const matTete = new THREE.MeshStandardMaterial({map: tete, normalMap: teteN, roughness: .62});
    const mat = Object.fromEntries(KITS.map((k, i) => [k, new THREE.MeshStandardMaterial({map: kits[i], normalMap: k.startsWith('gb') ? corpsNgb : corpsN, roughness: .86})]));
    return {g, matTete, mat, jogging: null};
  })().catch(e => { ressources = null; throw e; });
}

// Bas de jogging des gardiens : chaque sommet de la jambe est posé sur une ellipse qui va du bas du short à la cheville
// (un tube lisse, sans le genou ni le revers des chaussettes du modèle). Maillage en cm, vertical = z local.
const lin = (y, a, va, b, vb) => va + (vb - va) * Math.min(1, Math.max(0, (y - a) / (b - a)));
function jogging(geo) {
  geo = geo.clone(); const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yl = p.getY(i), y = p.getZ(i);
    if (y > 66 || y < 8 || Math.abs(x) > 26 || Math.abs(x) < 1) continue;
    const cx = Math.sign(x) * (12.9 - .044 * y), cz = .5 - .05 * y;
    const hx = y < 30 ? lin(y, 10, 5.4, 30, 7) : lin(y, 30, 7, 60, 8.4), hz = y < 30 ? lin(y, 10, 6.2, 30, 7.4) : lin(y, 30, 7.4, 60, 9.9);
    const dx = x - cx, dz = yl - cz, e = Math.hypot(dx / hx, dz / hz), poids = lin(y, 8, 0, 12, 1) * lin(y, 66, 0, 59, 1);
    if (e < .05) continue;
    const k = 1 + (1 / e - 1) * poids;
    p.setXYZ(i, cx + dx * k, cz + dz * k, y);
    if (Math.abs(k - 1) > .02) { const nx = dx / (hx * hx), nz = dz / (hz * hz), l = Math.hypot(nx, nz); n.setXYZ(i, nx / l, nz / l, 0); }
  }
  return geo;
}

// ── poses : rotations d'os autour d'axes du repère du joueur (X = sa gauche, Y = haut, Z = devant) ─────────────
const qa = new THREE.Quaternion(), qp = new THREE.Quaternion(), qr = new THREE.Quaternion(), ax = new THREE.Vector3(), qm = new THREE.Quaternion();
const AXES = {x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1)};
function tourner(perso, os, axe, deg) {
  perso.getWorldQuaternion(qr); ax.copy(AXES[axe]).applyQuaternion(qr);
  os.parent.getWorldQuaternion(qp);
  qa.setFromAxisAngle(ax, deg * Math.PI / 180);
  qm.copy(qp).invert().multiply(qa).multiply(qp);
  os.quaternion.premultiply(qm);
  os.updateMatrixWorld(true);
}
const B = n => 'Bip01_' + n;
// parades de handball (on reste debout : bras tendus vers le ballon, jambe qui part sur le côté pour les tirs bas),
// écrites pour le côté droit du gardien ; l'autre côté est le miroir
const POSES = {
  pret: [[B('L_Thigh'), 'z', 12], [B('R_Thigh'), 'z', -12], [B('L_Thigh'), 'x', -8], [B('R_Thigh'), 'x', -8], [B('L_Calf'), 'x', 14], [B('R_Calf'), 'x', 14],
    [B('R_UpperArm'), 'z', -95], [B('R_Forearm'), 'z', -80], [B('L_UpperArm'), 'z', 95], [B('L_Forearm'), 'z', 80]],
  paradeHaut: [[B('Spine'), 'z', 10], [B('R_UpperArm'), 'z', -160], [B('R_Forearm'), 'z', -5], [B('L_UpperArm'), 'z', 185], [B('L_Forearm'), 'z', 5],
    [B('R_Thigh'), 'z', -32], [B('R_Thigh'), 'x', -25], [B('R_Calf'), 'x', 40], [B('L_Thigh'), 'x', -8], [B('L_Calf'), 'x', 14]],
  paradeMilieu: [[B('Spine'), 'z', 12], [B('R_UpperArm'), 'z', -105], [B('R_Forearm'), 'z', -10], [B('L_UpperArm'), 'z', 150], [B('L_Forearm'), 'z', 15],
    [B('R_Thigh'), 'z', -50], [B('R_Calf'), 'x', 12], [B('L_Thigh'), 'x', -15], [B('L_Calf'), 'x', 28]],
  paradeBas: [[B('Spine'), 'z', 20], [B('R_UpperArm'), 'z', -38], [B('R_Forearm'), 'z', -8], [B('L_UpperArm'), 'z', 125], [B('L_Forearm'), 'z', 25],
    [B('R_Thigh'), 'z', -72], [B('R_Calf'), 'x', 4], [B('L_Thigh'), 'x', -28], [B('L_Calf'), 'x', 50]],
  paradeHautCentre: [[B('R_UpperArm'), 'z', -168], [B('L_UpperArm'), 'z', 168], [B('R_Thigh'), 'x', -20], [B('R_Calf'), 'x', 35], [B('L_Thigh'), 'x', -10], [B('L_Calf'), 'x', 15]],
  paradeBasCentre: [[B('R_UpperArm'), 'z', -30], [B('L_UpperArm'), 'z', 30], [B('R_Forearm'), 'x', -25], [B('L_Forearm'), 'x', -25],
    [B('L_Thigh'), 'z', 8], [B('R_Thigh'), 'z', -8], [B('R_Thigh'), 'x', -20], [B('R_Calf'), 'x', 35], [B('L_Thigh'), 'x', -20], [B('L_Calf'), 'x', 35], [B('Spine'), 'x', 14]],
  arme: [[B('Spine1'), 'y', 25], [B('R_UpperArm'), 'z', -105], [B('R_UpperArm'), 'y', -40], [B('R_Forearm'), 'z', -95], [B('L_UpperArm'), 'z', 45], [B('L_UpperArm'), 'x', -40], [B('L_Forearm'), 'x', -50]],
  tir: [[B('Spine1'), 'y', -20], [B('Spine1'), 'x', 15], [B('R_UpperArm'), 'z', -120], [B('R_UpperArm'), 'y', 45], [B('R_Forearm'), 'z', -15], [B('L_UpperArm'), 'z', 25]],
  contre: [[B('R_UpperArm'), 'z', -165], [B('L_UpperArm'), 'z', 165], [B('R_Forearm'), 'z', -5], [B('L_Forearm'), 'z', 5]],
  defense: [[B('R_UpperArm'), 'z', -55], [B('L_UpperArm'), 'z', 55], [B('R_Forearm'), 'x', -60], [B('L_Forearm'), 'x', -60], [B('L_Thigh'), 'z', 10], [B('R_Thigh'), 'z', -10],
    [B('L_Thigh'), 'x', -14], [B('R_Thigh'), 'x', -14], [B('L_Calf'), 'x', 24], [B('R_Calf'), 'x', 24]],
  saut: [[B('L_Thigh'), 'x', -70], [B('L_Calf'), 'x', 95], [B('R_Thigh'), 'x', -20], [B('R_Calf'), 'x', 30]],
  porte: [[B('R_UpperArm'), 'x', -30], [B('R_Forearm'), 'x', -70]],
  passe: [[B('Spine1'), 'y', 20], [B('R_UpperArm'), 'z', -70], [B('R_UpperArm'), 'x', -55], [B('R_Forearm'), 'x', -20]],
  joie: [[B('R_UpperArm'), 'z', -150], [B('L_UpperArm'), 'z', 150], [B('R_Forearm'), 'z', -40], [B('L_Forearm'), 'z', 40]],
};
function poser(perso, nom, w, miroir) {
  for (let [n, a, d] of POSES[nom] || []) {
    if (miroir) { n = n.replace(/_R_|_L_/, m => m === '_R_' ? '_L_' : '_R_'); if (a !== 'x') d = -d; }
    const os = perso.getObjectByName(n); if (os) tourner(perso, os, a, d * w);
  }
}

// ── un joueur : modèle cloné, tenue, animations, poses mélangées ─────────────────────────────────────────────────
const vt = new THREE.Vector3();
class Joueur {
  constructor(R, kit) {
    this.g = new THREE.Group();
    this.o = SkeletonUtils.clone(R.g.scene); this.g.add(this.o);
    this.o.traverse(n => {
      if (!n.isMesh) return;
      n.castShadow = true; n.frustumCulled = false;
      const tete = n.material.name === 'tete';
      if (!tete && kit.startsWith('gb')) n.geometry = (R.jogging ||= jogging(n.geometry));
      n.material = tete ? R.matTete : R.mat[kit];
    });
    this.mixer = new THREE.AnimationMixer(this.o);
    this.actions = Object.fromEntries(R.g.animations.map(c => [c.name, this.mixer.clipAction(c)]));
    this.os = {mainD: this.o.getObjectByName(B('R_Hand')), mainG: this.o.getObjectByName(B('L_Hand')), piedG: this.o.getObjectByName(B('L_Toe0')), piedD: this.o.getObjectByName(B('R_Toe0')), tete: this.o.getObjectByName(B('Head'))};
    this.poses = {}; this.ancre = false; this.anim = null;
    this.jouer('repos', 0); this.mixer.update(Math.random() * 3);
  }
  jouer(nom, fondu = .2, vitesse = 1) {
    const a = this.actions[nom]; a.timeScale = vitesse;
    if (this.anim === a) return;
    a.reset().play();
    if (this.anim && fondu > 0) a.crossFadeFrom(this.anim, fondu, false); else if (this.anim) this.anim.stop();
    this.anim = a;
  }
  pose(nom, w, miroir = false) { if (w <= 0) delete this.poses[nom]; else this.poses[nom] = {w: Math.min(1, w), miroir}; }
  sansPoses() { this.poses = {}; }
  mettre(x, y, z, cap) { this.g.position.set(x, y, z); if (cap !== undefined) this.g.rotation.y = cap; }
  // cap pour regarder vers un point du sol
  regarder(x, z) { const dx = x - this.g.position.x, dz = z - this.g.position.z; if (Math.hypot(dx, dz) > .05) this.g.rotation.y = Math.atan2(dx, dz); }
  maj(dt) {
    this.mixer.update(dt);
    this.o.position.y = 0;
    this.g.updateMatrixWorld(true);
    for (const [nom, p] of Object.entries(this.poses)) poser(this.o, nom, p.w, p.miroir);
    if (this.ancre) {   // pieds au sol malgré les genoux pliés
      const bas = Math.min(this.os.piedG.getWorldPosition(vt).y, this.os.piedD.getWorldPosition(vt).y) - this.g.position.y;
      this.o.position.y = .035 - bas;
    }
  }
  main(cote = 'D') {   // position du ballon dans la main
    return this.os['main' + cote].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .02, 0));
  }
}

// ── la salle : terrain 40 × 20 m aux vraies lignes, buts 3 × 2 m avec filet, panneaux, gradins, lumière ──────────
function toile(w, h, dessin) { const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h); return c; }
function texTerrain() {
  // 24 m (x de -12 à 12) sur 44 m (z de -2 à 42) ; haut de la toile = z = -2
  const S = 46, W = 24 * S, H = 44 * S;
  const c = toile(W, H, (g) => {
    const P = (x, z) => [(x + 12) * S, (z + 2) * S];
    g.fillStyle = '#35505e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2d68ad'; g.fillRect(...P(-10, 0), 20 * S, 40 * S);
    // zones des 6 m : deux quarts de cercle autour des poteaux reliés par une droite
    const zone = (z0, s) => { g.beginPath(); const [cx1, cz] = P(-1.5, z0), [cx2] = P(1.5, z0);
      g.moveTo(...P(-7.5, z0)); g.arc(cx1, cz, 6 * S, Math.PI, Math.PI / 2 * (s > 0 ? 1 : 3), s < 0); g.lineTo(...P(1.5, z0 + 6 * s)); g.arc(cx2, cz, 6 * S, Math.PI / 2 * (s > 0 ? 1 : 3), 0, s < 0); g.closePath(); };
    g.fillStyle = '#e08a3d'; zone(0, 1); g.fill(); zone(40, -1); g.fill();
    g.strokeStyle = '#f4f4f0'; g.lineWidth = .05 * S;
    g.strokeRect(...P(-10, 0), 20 * S, 40 * S);
    g.beginPath(); g.moveTo(...P(-10, 20)); g.lineTo(...P(10, 20)); g.stroke();
    zone(0, 1); g.stroke(); zone(40, -1); g.stroke();
    // 9 m en pointillés (traits de 15 cm)
    g.save(); g.setLineDash([.15 * S, .15 * S]);
    const neuf = (z0, s) => { g.beginPath(); const [cx1, cz] = P(-1.5, z0), [cx2] = P(1.5, z0);
      const a = Math.acos(Math.min(1, 8.5 / 9)); // le 9 m s'arrête sur la ligne de touche
      g.arc(cx1, cz, 9 * S, s > 0 ? Math.PI - a : Math.PI + a, Math.PI / 2 * (s > 0 ? 1 : 3), s < 0); g.lineTo(...P(1.5, z0 + 9 * s)); g.arc(cx2, cz, 9 * S, Math.PI / 2 * (s > 0 ? 1 : 3), s > 0 ? a : -a, s < 0); g.stroke(); };
    neuf(0, 1); neuf(40, -1); g.restore();
    // 7 m (1 m), limite du gardien à 4 m (15 cm), lignes de but plus épaisses
    g.lineWidth = .05 * S;
    for (const [z0, s] of [[0, 1], [40, -1]]) {
      g.beginPath(); g.moveTo(...P(-.5, z0 + 7 * s)); g.lineTo(...P(.5, z0 + 7 * s)); g.stroke();
      g.beginPath(); g.moveTo(...P(-.075, z0 + 4 * s)); g.lineTo(...P(.075, z0 + 4 * s)); g.stroke();
      g.lineWidth = .08 * S; g.beginPath(); g.moveTo(...P(-1.5, z0)); g.lineTo(...P(1.5, z0)); g.stroke(); g.lineWidth = .05 * S;
    }
    // zone des remplaçants : traits de 15 cm à 4,5 m de la ligne médiane
    for (const z of [15.5, 24.5]) { g.beginPath(); g.moveTo(...P(10, z)); g.lineTo(...P(10.15, z)); g.stroke(); }
    // logo au centre, discret
    g.save(); g.translate(...P(0, 20)); g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(255, 255, 255, .14)'; g.font = `800 ${1.2 * S}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MÉDOC HANDBALL', 0, 0); g.restore();
    // grain du revêtement
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - .5) * 7; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(im, 0, 0);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function texPanneau() {
  const c = toile(1024, 64, (g, w, h) => {
    g.fillStyle = '#16233d'; g.fillRect(0, 0, w, h);
    g.font = '800 38px system-ui, sans-serif'; g.textBaseline = 'middle';
    const txt = ['MÉDOC HANDBALL', 'ALLEZ MÉDOC !', 'MÉDOC HAND CARDS'];
    let x = 10; for (let i = 0; x < w; i++) { g.fillStyle = i % 2 ? '#ffd257' : '#ffffff'; const s = txt[i % 3] + '   •   '; g.fillText(s, x, h / 2); x += g.measureText(s).width; }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
function texRayures(n) {
  const c = toile(8, 64, (g) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 8, 64); g.fillStyle = '#d33a2c'; g.fillRect(0, 0, 8, 32); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, n); return t;
}
function texFilet() {
  const c = toile(64, 64, (g) => { g.strokeStyle = 'rgba(255, 255, 255, .95)'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64); });
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function texBallon() {
  const c = toile(256, 128, (g, w, h) => {
    g.fillStyle = '#f2cf3b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1f4f9a'; g.lineWidth = 14;
    for (let i = 0; i < 4; i++) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.sin(x / w * Math.PI * 4 + i * 1.6) * h * .32); g.stroke(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.cos(x / w * Math.PI * 2) * h * .4); g.stroke();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class But {
  // sens = 1 : but en z = 0, filet vers les z négatifs ; sens = -1 : but en z = 40
  constructor(sc, z0, sens) {
    this.z0 = z0; this.sens = sens;
    const g = new THREE.Group(); g.position.z = z0; if (sens < 0) g.rotation.y = Math.PI; sc.add(g);
    const matP = new THREE.MeshStandardMaterial({map: texRayures(5.2), roughness: .4}), matT = new THREE.MeshStandardMaterial({map: texRayures(1), roughness: .4});
    matT.map.repeat.set(7.9, 1); matT.map.rotation = Math.PI / 2;
    for (const x of [-1.54, 1.54]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.08, .08), matP); p.position.set(x, 1.04, -.04); p.castShadow = true; g.add(p); }
    const t = new THREE.Mesh(new THREE.BoxGeometry(3.16, .08, .08), matT); t.position.set(0, 2.04, -.04); t.castShadow = true; g.add(t);
    // filet : fond (déformable), côtés, dessus
    const fil = texFilet(), mat = new THREE.MeshBasicMaterial({map: fil, transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false, color: '#e8eef5'});
    const plan = (w, h, rx, ry) => { const m = mat.clone(); m.map = fil.clone(); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; return m; };
    this.fond = new THREE.Mesh(new THREE.PlaneGeometry(3, 2, 16, 10), plan(3, 2, 30, 20)); this.fond.position.set(0, 1, -1); g.add(this.fond);
    this.base = Float32Array.from(this.fond.geometry.attributes.position.array);
    const cote = x => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute([x, 0, 0, x, 0, -1, x, 2, -.8, x, 2, 0], 3));
      ge.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .8, 1, 0, 1], 2)); ge.setIndex([0, 1, 2, 0, 2, 3]); return new THREE.Mesh(ge, plan(1, 2, 10, 20)); };
    g.add(cote(-1.5), cote(1.5));
    const dessus = new THREE.Mesh(new THREE.PlaneGeometry(3, .8), plan(3, .8, 30, 8)); dessus.rotation.x = -Math.PI / 2; dessus.position.set(0, 2, -.4); g.add(dessus);
    this.g = g; this.bosseT = -1; this.bx = this.by = 0;
  }
  bosse(x, y) { this.bx = this.sens > 0 ? x : -x; this.by = y; this.bosseT = 0; }
  maj(dt) {
    if (this.bosseT < 0) return;
    this.bosseT += dt; const p = this.fond.geometry.attributes.position, a = Math.max(0, Math.sin(Math.min(1, this.bosseT / .5) * Math.PI)) * .45;
    for (let i = 0; i < p.count; i++) { const x = this.base[i * 3], y = this.base[i * 3 + 1] + 1, d = Math.hypot(x - this.bx, y - this.by); p.setZ(i, -a * Math.exp(-d * d / .5)); }
    p.needsUpdate = true;
    if (this.bosseT > .55) { this.bosseT = -1; for (let i = 0; i < p.count; i++) p.setZ(i, 0); }
  }
}

class Salle {
  constructor(R) {
    this.R = R;
    const r = this.r = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 't3-gl';
    const sc = this.sc = new THREE.Scene(); sc.background = new THREE.Color('#1c232c'); sc.fog = new THREE.Fog('#1c232c', 34, 80);
    this.cam = new THREE.PerspectiveCamera(45, 1, .1, 140);
    sc.add(new THREE.HemisphereLight('#fff7ea', '#4d443a', 1.25));
    const s = this.soleil = new THREE.DirectionalLight('#ffffff', 2.3);
    s.castShadow = true; s.shadow.mapSize.set(1024, 1024); Object.assign(s.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50});
    s.shadow.bias = -.0004; s.shadow.normalBias = .03; sc.add(s, s.target);
    const f = new THREE.DirectionalLight('#dfe8ff', .55); f.position.set(-8, 10, -6); sc.add(f);
    // sol
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(24, 44), new THREE.MeshStandardMaterial({map: texTerrain(), roughness: .55}));
    sol.rotation.x = -Math.PI / 2; sol.position.z = 20; sol.receiveShadow = true; sc.add(sol);
    const autour = new THREE.Mesh(new THREE.PlaneGeometry(90, 120), new THREE.MeshStandardMaterial({color: '#2e3b44', roughness: .8}));
    autour.rotation.x = -Math.PI / 2; autour.position.set(0, -.01, 20); autour.receiveShadow = true; sc.add(autour);
    // panneaux autour du terrain
    const pan = texPanneau(), matPan = (n) => { const m = new THREE.MeshStandardMaterial({map: pan.clone(), emissive: '#ffffff', emissiveIntensity: .25, emissiveMap: null, roughness: .5}); m.map.repeat.set(n, 1); m.map.needsUpdate = true; return m; };
    for (const x of [-12.2, 12.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.08, .9, 40), matPan(4)); p.position.set(x, .45, 20); p.rotation.y = x < 0 ? Math.PI : 0; p.castShadow = true; sc.add(p); }
    // derrière le but du fond seulement (celui de devant serait entre la caméra et le but, à l'arrêt réflexe)
    { const p = new THREE.Mesh(new THREE.BoxGeometry(20, .9, .08), matPan(2)); p.position.set(0, .45, 43.5); p.rotation.y = Math.PI; sc.add(p); }
    // gradins sur un côté, murs, plafond lumineux
    const matG = new THREE.MeshStandardMaterial({color: '#39424d', roughness: .9}), matSiege = new THREE.MeshStandardMaterial({color: '#1d5b8f', roughness: .7});
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2, .5 + i * .55, 44), matG); m.position.set(14.5 + i * 1.2, (.5 + i * .55) / 2, 20); sc.add(m);
      const sg = new THREE.Mesh(new THREE.BoxGeometry(.5, .35, 44), matSiege); sg.position.set(14.2 + i * 1.2, .5 + i * .55 + .17, 20); sc.add(sg); }
    const matMur = new THREE.MeshStandardMaterial({color: '#59626d', roughness: .95, side: THREE.BackSide});
    const salle = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 70), matMur); salle.position.set(0, 6.9, 20); sc.add(salle);   // fond sous le parquet (sinon il scintille avec lui)
    const matL = new THREE.MeshBasicMaterial({color: '#fffdf2'});
    for (let i = 0; i < 4; i++) for (const x of [-6, 6]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .5), matL); l.rotation.x = Math.PI / 2; l.position.set(x, 13.9, 2 + i * 12); sc.add(l); }
    this.buts = [new But(sc, 0, 1), new But(sc, 40, -1)];
    const ballon = this.ballon = new THREE.Mesh(new THREE.SphereGeometry(.095, 28, 18), new THREE.MeshStandardMaterial({map: texBallon(), roughness: .55}));
    ballon.castShadow = true; sc.add(ballon);
    // trajectoire montrée : points lumineux
    this.points = new THREE.InstancedMesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({color: '#ffd257', transparent: true, opacity: .95}), 40);
    this.points.count = 0; this.points.frustumCulled = false; sc.add(this.points);
    this.joueurs = {};
    this.v = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.horloge = performance.now();
  }
  attacher(z) {
    this.z = z; z.prepend(this.r.domElement);
    this.ro?.disconnect(); this.ro = new ResizeObserver(() => this.taille()); this.ro.observe(z); this.taille();
  }
  taille() {
    const w = this.z.clientWidth || 390, h = this.z.clientHeight || 600;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.r.setSize(w, h, false); this.r.domElement.style.width = w + 'px'; this.r.domElement.style.height = h + 'px';
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.cadrage?.();
  }
  joueur(role, kit) {
    const j = this.joueurs[role] ||= (() => { const j = new Joueur(this.R, kit); this.sc.add(j.g); return j; })();
    j.g.visible = true; j.sansPoses(); j.ancre = false; j.enlair = j.sorti = false; j.sauteT = 0; j.g.position.set(0, 0, 0); j.g.rotation.set(0, 0, 0); j.jouer('repos', 0);
    return j;
  }
  // compile les matériaux et fait un premier rendu avant de lancer l'horloge du jeu (sinon le premier affichage saute)
  prechauffer() { this.r.compile(this.sc, this.cam); this.maj(0); this.horloge = performance.now(); }
  cacherJoueurs(sauf) { for (const [k, j] of Object.entries(this.joueurs)) j.g.visible = sauf.includes(k); }
  pas() { const t = performance.now(), dt = Math.min(.05, (t - this.horloge) / 1000); this.horloge = t; return dt; }
  maj(dt, cible) {
    for (const j of Object.values(this.joueurs)) if (j.g.visible) j.maj(dt);
    for (const b of this.buts) b.maj(dt);
    if (cible) { this.soleil.target.position.copy(cible); this.soleil.position.copy(cible).add(new THREE.Vector3(5, 15, 7)); }
    this.r.render(this.sc, this.cam);
  }
  ecran(x, y, z) { const v = this.v.set(x, y, z).project(this.cam); return {x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, z: v.z}; }
  sol(px, py) {
    this.ray.setFromCamera({x: px / this.w * 2 - 1, y: 1 - py / this.h * 2}, this.cam);
    const p = this.ray.ray.intersectPlane(this.plan, new THREE.Vector3()); return p && {x: p.x, z: p.z};
  }
  montrerTrajectoire(f, n = 28) {   // f(u) → Vector3, u de 0 à 1
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const p = f((i + 1) / (n + 1)); m.makeTranslation(p.x, p.y, p.z); this.points.setMatrixAt(i, m); }
    this.points.count = n; this.points.instanceMatrix.needsUpdate = true;
  }
  cacherTrajectoire() { this.points.count = 0; }
  regarder(px, py, pz, cx, cy, cz) { this.cam.position.set(px, py, pz); this.cam.lookAt(cx, cy, cz); this.cam.updateMatrixWorld(); }
  detruire() { this.ro?.disconnect(); this.r.dispose(); this.r.forceContextLoss?.(); this.r.domElement.remove(); }
}

// une seule salle par mini-jeu ouvert (le contexte WebGL est gardé d'un essai à l'autre)
async function salle(z) {
  const {MJ} = A;
  if (!MJ.salle) A.miniAide('Chargement du terrain…');
  let R;
  try { R = await charger(); } catch (e) { A.toast('Impossible de charger le terrain 3D : vérifie ta connexion'); A.fermerMini(); return null; }
  if (!MJ.el) return null;
  if (!MJ.salle) {
    try { MJ.salle = new Salle(R); } catch (e) { A.toast('Ton téléphone ne peut pas afficher la 3D'); A.fermerMini(); return null; }
  }
  MJ.salle.cadrage = null; MJ.salle.w = 0;
  MJ.salle.attacher(z);
  MJ.salle.buts.forEach(b => { b.bosseT = 0.56; b.maj(0); });
  MJ.salle.cacherTrajectoire(); MJ.salle.ballon.visible = true;
  return MJ.salle;
}
export function fermer() { A?.MJ.salle?.detruire(); if (A) A.MJ.salle = null; }

const lerp = (a, b, u) => a + (b - a) * u, cl = u => Math.max(0, Math.min(1, u)), doux = u => u * u * (3 - 2 * u);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// parade du gardien vers une zone (côté vu par le gardien : 'droite' = son côté droit)
function parade(gb, droite, centre, hauteur) {
  const nom = centre ? (hauteur > .55 ? 'paradeHautCentre' : 'paradeBasCentre') : hauteur > 1.25 ? 'paradeHaut' : hauteur > .7 ? 'paradeMilieu' : 'paradeBas';
  return {nom, miroir: !droite};
}

// ── 1. L'arrêt réflexe : caméra haute derrière ton but (but dans la moitié basse, poteaux aux bords de l'écran),
// le tireur arrive en face, au-dessus de la barre. Dès que le ballon part, sa trajectoire s'affiche en points
// lumineux : touche la zone du but où il va avant qu'il arrive. 5 tirs enchaînés par série.
export async function gardien(sc, n) {
  const {MJ, miniAide, miniEnvoyer, miniFin, fermerMini, toast, vibrer, Compte} = A;
  const z = sc.querySelector('.t3'), S = await salle(z); if (!S) return;
  const q = s => z.querySelector(s);
  let prep;
  try { prep = MJ.demo ? (MJ.secret = {colonne: ['g', 'c', 'd'][Math.random() < .4 ? 0 : Math.random() < 2 / 3 ? 2 : 1], hauteur: Math.random() < .5 ? 'h' : 'b',
    duree: Math.max(520, 980 - 18 * MJ.liste.length - Math.floor(Math.random() * 120))}) : await Compte.miniPreparer('gardien'); }
  catch (e) { toast(e.message); return fermerMini(); }
  if (!MJ.el) return;
  S.cacherJoueurs(['tireur', 'gardien']);
  const tireur = S.joueur('tireur', 'adv'), moi = S.joueur('gardien', 'gb-medoc');
  moi.mettre(0, 0, .55, 0); moi.ancre = true; moi.pose('pret', 1);
  // cadrage : caméra haute, 10 m derrière le but : poteaux aux bords de l'écran, barre au milieu (le but occupe la
  // moitié basse) et le tireur, qui prend son appel au 9 m, entièrement au-dessus de la barre
  S.cadrage = () => {
    const cam = S.cam, v = new THREE.Vector3(), D = 10, H = 5.3;
    const essai = (ly, fov) => { cam.fov = fov; cam.updateProjectionMatrix(); S.regarder(0, H, -D, 0, ly, 8);
      return {px: v.set(1.6, 1, 0).project(cam).x, barre: v.set(0, 2.04, 0).project(cam).y}; };
    const fovPour = ly => { let a = 8, b = 90; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (Math.abs(essai(ly, m).px) > .985) a = m; else b = m; } return (a + b) / 2; };
    let a = -4, b = 4;   // plus on vise haut, plus la barre descend à l'écran
    for (let k = 0; k < 22; k++) { const m = (a + b) / 2; if (essai(m, fovPour(m)).barre > -.02) a = m; else b = m; }
    essai(a, fovPour(a));
    const g0 = S.ecran(1.5, 2, 0), g1 = S.ecran(-1.5, 0, 0);
    Object.assign(q('.t3-zones').style, {left: g0.x + 'px', top: g0.y + 'px', width: (g1.x - g0.x) + 'px', height: (g1.y - g0.y) + 'px'});
  };
  S.w = 0; S.taille();
  q('.t3-zones').innerHTML = ['g', 'c', 'd'].map(c => ['h', 'b'].map(h => `<i data-z="${c}${h}"></i>`).join('')).join('');
  // à l'écran, la gauche du but est du côté des x positifs (on regarde vers le terrain)
  const X = {g: 1.05, c: 0, d: -1.05};
  const x0 = (Math.random() - .5) * 5, dep = {x: x0, z: 15.5}, appui = {x: x0 * .55, z: 9.6};
  const cible = v3(X[prep.colonne] + (Math.random() - .5) * .3, {h: 1.55, b: .42}[prep.hauteur] + (Math.random() - .5) * .25, 0);
  const vite = Math.max(.85, 1 - (MJ.serieN || 0) * .02), course = 1100 * vite, saut = 520 * vite, duree = prep.duree;
  tireur.mettre(dep.x, 0, dep.z, Math.PI); tireur.regarder(appui.x, appui.z); tireur.jouer('course', .1, 1.15);
  miniAide('Le tireur arrive…');
  let choisi = null, envoye = false, r = null, quand = 0, depart = null, fini = false, tChoix = 0, par = null;
  const envoyer = async ent => {
    if (envoye) return; envoye = true; MJ.toucher = null;
    try { r = await miniEnvoyer(ent); } catch (e) { toast(e.message); return fermerMini(); }
  };
  const posBallon = u => { const a = depart; return v3(lerp(a.x, cible.x, u), lerp(a.y, cible.y, u) + Math.sin(Math.PI * u) * .3, lerp(a.z, cible.z, u)); };
  S.prechauffer(); let t = 0;
  const boucle = now => {
    if (!MJ.el || fini) return;
    const dt = S.pas(); t += dt * 1000;
    // tireur : course d'élan, appel, saut ; bras armé puis tir
    if (t < course) { const u = t / course; tireur.mettre(lerp(dep.x, appui.x, u), 0, lerp(dep.z, appui.z, u)); }
    else {
      const u = cl((t - course) / (saut + 520));
      tireur.mettre(appui.x, Math.sin(Math.PI * u) * .55, appui.z - u * .9);
      if (!tireur.enlair) { tireur.enlair = true; tireur.jouer('repos', .15); miniAide('Regarde le ballon…'); }
      tireur.pose('saut', doux(cl((t - course) / 200)) * (1 - doux(cl((t - course - saut - 300) / 200))));
      if (t < course + saut) tireur.pose('arme', doux(cl((t - course) / 260)));
      else { const v = doux(cl((t - course - saut) / 120)); tireur.pose('arme', 1 - v); tireur.pose('tir', v); }
    }
    // gardien : prêt, puis parade vers la zone touchée
    if (par) { const v = doux(cl((now - tChoix) / 170)); moi.pose('pret', 1 - v); moi.pose(par.nom, v, par.miroir);
      moi.mettre(lerp(0, par.dx, v), par.saut * Math.sin(Math.PI * cl((now - tChoix) / 420)), .55); }
    // ballon : dans la main, puis sur sa trajectoire (montrée dès qu'il part)
    if (t >= course + saut) {
      if (!depart) {
        depart = tireur.main(); quand = now; vibrer(10); miniAide('Touche la zone du but où va le ballon !');
        S.montrerTrajectoire(posBallon);
        MJ.timers.push(setTimeout(() => { if (!choisi) { choisi = {colonne: 'c', hauteur: 'b', temps: 99999}; envoyer(choisi); } }, duree + 80));
      }
      const u = cl((now - quand) / duree);
      S.ballon.position.copy(posBallon(u));
      if (u >= 1 && r) { fini = true; S.cacherTrajectoire(); impact().then(() => miniFin(r)); }
    }
    S.maj(dt, v3(0, 0, 4));
    if (!depart) S.ballon.position.copy(tireur.main());
    if (!fini) MJ.raf = requestAnimationFrame(boucle);
  };
  // la suite : arrêt (le ballon repart vers le terrain) ou but (filet qui se creuse)
  const impact = () => new Promise(fin => {
    const t1 = performance.now(), arret = r.resultat === 'arret', a = cible.clone();
    const b = arret ? v3(a.x * 2.2 + (Math.random() - .5), .1, 5.5) : v3(a.x * .9, Math.max(.12, a.y - .3), -.85);
    if (arret) { vibrer(30); z.animate([{translate: '0 0'}, {translate: '-5px 3px'}, {translate: '5px -2px'}, {translate: '0 0'}], {duration: 240}); }
    else S.buts[0].bosse(a.x, a.y);
    const pas = now => {
      if (!MJ.el) return fin();
      const u = cl((now - t1) / (arret ? 620 : 380)), dt = S.pas();
      const p = v3(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + (arret ? Math.sin(Math.PI * u) * 1.2 : 0), lerp(a.z, b.z, u));
      if (!arret && u >= 1) p.y = Math.max(.1, b.y - (now - t1 - 380) / 400);
      S.ballon.position.copy(p);
      if (par) { const v = doux(cl((now - tChoix) / 170)); moi.pose('pret', 1 - v); moi.pose(par.nom, v, par.miroir); }
      S.maj(dt, v3(0, 0, 4));
      if (now - t1 < 820) MJ.raf = requestAnimationFrame(pas); else fin();
    };
    MJ.raf = requestAnimationFrame(pas);
  });
  MJ.toucher = e => {
    if (choisi) return;
    const zr = q('.t3-zones').getBoundingClientRect(), fx = (e.clientX - zr.left) / zr.width, fy = (e.clientY - zr.top) / zr.height;
    if (fy < -.8 || fy > 1.6) return;
    choisi = {colonne: fx < 1 / 3 ? 'g' : fx > 2 / 3 ? 'd' : 'c', hauteur: fy < .5 ? 'h' : 'b', temps: quand ? Math.round(performance.now() - quand) : -1};
    vibrer(15); miniAide('');
    q(`.t3-zones [data-z="${choisi.colonne}${choisi.hauteur}"]`)?.classList.add('choisie');
    // vu de dos, la droite de l'écran est la droite de ton gardien
    const P = parade(moi, choisi.colonne === 'd', choisi.colonne === 'c', choisi.hauteur === 'h' ? 1.5 : .4);
    par = {...P, dx: X[choisi.colonne] * .42, saut: choisi.hauteur === 'h' ? .14 : 0}; tChoix = performance.now();
    envoyer(choisi);
  };
  MJ.raf = requestAnimationFrame(boucle);
}

// ── 2. La contre-attaque en 2 contre 1, filmée de derrière : tu portes le ballon, ton partenaire court sur l'autre
// couloir, le défenseur (en bleu) sort sur l'un des deux. Dessine la passe au doigt, ou garde le ballon s'il part sur
// ton partenaire. Pas de gardien : le but est vide.
export async function contre(sc, n) {
  const {MJ, miniAide, miniEnvoyer, miniFin, fermerMini, toast, Compte} = A;
  const z = sc.querySelector('.t3'), S = await salle(z); if (!S) return;
  const q = s => z.querySelector(s);
  let prep;
  try { prep = MJ.demo ? (MJ.secret = {defenseur: Math.random() < .8 ? 'A' : 'B', engage: 800 + Math.floor(Math.random() * 600)}) : await Compte.miniPreparer('contre'); }
  catch (e) { toast(e.message); return fermerMini(); }
  if (!MJ.el) return;
  S.cacherJoueurs(['a', 'b', 'd']);
  const ja = S.joueur('a', 'medoc'), jb = S.joueur('b', 'medoc'), jd = S.joueur('d', 'adv');
  S.cam.fov = 60; S.cam.updateProjectionMatrix();
  const vite = Math.max(.85, 1 - n * .04), duree = 3100 / vite, engage = prep.engage / vite;
  const A0 = {x: -1.9, z: 12}, A1 = {x: -1.6, z: 31}, B0 = {x: 2.3, z: 11}, B1 = {x: 2, z: 32.5};
  const lp = (a, b, u) => ({x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u)});
  const posA = t => lp(A0, A1, cl(t / duree)), posB = t => lp(B0, B1, cl(t / duree));
  const vA = Math.hypot(A1.x - A0.x, A1.z - A0.z) / duree * 1000, vB = Math.hypot(B1.x - B0.x, B1.z - B0.z) / duree * 1000;
  ja.jouer('course', .1, vA / 6.5); jb.jouer('course', .1, vB / 6.5); jd.jouer('trot', .1, .8);
  ja.pose('porte', 1);
  miniAide('Dessine ta passe… ou garde le ballon');
  let decision = null, fini = false, dessin = false, trace = [], D = {x: .3, z: 27}, anim = null;
  const poly = q('.t3-trace polyline');
  const camera = (a, b) => { const mz = Math.min(a.z, b.z), mx = (a.x + b.x) / 2; S.regarder(mx * .8, 9, mz - 8.5, mx * .8, 0, mz + 5.5); };
  camera(A0, B0); S.prechauffer(); let t = 0;
  const boucle = now => {
    if (!MJ.el) return;
    const dt = S.pas(); t += dt * 1000;
    if (!fini) {
      const a = posA(t), b = posB(t);
      // défenseur : il recule entre les deux, puis sort sur sa cible (m/s réalistes : 1,8 puis 5)
      // il vise un peu devant sa cible, pour lui faire face
      const c = t < engage ? {x: (a.x + b.x) / 2, z: Math.max(a.z, b.z) + 5} : prep.defenseur === 'A' ? posA(t + 450) : posB(t + 450), v = t < engage ? 1.8 : 5;
      const dx = c.x - D.x, dz = c.z - D.z, dist = Math.hypot(dx, dz), pas = Math.min(dist, v * dt);
      if (dist > .8) { D.x += dx / dist * pas; D.z += dz / dist * pas; }
      if (t >= engage && !jd.sorti) { jd.sorti = true; jd.jouer('course', .2, .85); }
      jd.mettre(D.x, 0, D.z); if (t < engage) jd.g.rotation.y = Math.PI; else jd.regarder(c.x, c.z);
      jd.pose('defense', t < engage ? 1 : .4);
      if (!decision && t > engage + 900 / vite && prep.defenseur === 'A' && dist < 1.1) decider({passe: false, temps: Math.round(t * vite)}, null);
      if (!decision && t > duree) decider({passe: false, temps: Math.round(t * vite)}, null);
      ja.mettre(a.x, 0, a.z, Math.atan2(A1.x - A0.x, A1.z - A0.z)); jb.mettre(b.x, 0, b.z, Math.atan2(B1.x - B0.x, B1.z - B0.z));
      camera(a, b);
      S.maj(dt, v3(a.x, 0, a.z + 4));
      if (!decision) S.ballon.position.copy(ja.main());
    } else if (anim) anim(now, dt);
    MJ.raf = requestAnimationFrame(boucle);
  };
  const decider = async (ent, sol) => {
    if (decision) return; decision = ent; MJ.toucher = null; miniAide('');
    let r; try { r = await miniEnvoyer(ent); } catch (e) { toast(e.message); return fermerMini(); }
    fini = true;
    await suite(r, ent, sol, posA(t), posB(t), {...D});
    anim = null; miniFin(r);
  };
  // la suite, filmée : passe en cloche (ou interception), réception, saut, tir dans le but vide ; ou ballon gardé ; ou perdu
  const suite = (r, ent, sol, a, b, d) => new Promise(fin => {
    let t2 = 0, etape = 0, tE = 0, tireur = null, depT = null, ciblT = null;
    const tir = (j, t) => {   // saut puis tir vers l'angle opposé
      if (!tireur) { tireur = j; j.jouer('repos', .15); depT = null; }
      const u = cl(t / 520); j.pose('saut', Math.sin(Math.PI * u)); j.pose('porte', 0);
      if (t < 300) { j.pose('arme', doux(cl(t / 250))); S.ballon.position.copy(j.main()); return false; }
      j.pose('arme', 1 - doux(cl((t - 300) / 100))); j.pose('tir', doux(cl((t - 300) / 100)));
      if (!depT) { depT = j.main(); ciblT = v3((j.g.position.x < 0 ? -1 : 1) * 1.1, 1.3, 39.95); }
      const v = cl((t - 300) / 380); S.ballon.position.set(lerp(depT.x, ciblT.x, v), lerp(depT.y, ciblT.y, v), lerp(depT.z, ciblT.z, v));
      if (v >= 1 && !etape) { etape = 1; tE = t2; if (r.resultat === 'but') S.buts[1].bosse(ciblT.x, ciblT.y); }
      return etape && t2 - tE > 600;
    };
    const saut = (j, p, t) => j.mettre(p.x, Math.sin(Math.PI * cl(t / 520)) * .6, p.z + Math.min(1.8, t / 400));
    anim = (now, dt) => {
      t2 += dt * 1000; const t = t2;
      ja.anim !== ja.actions.repos && t > 300 && ja.jouer('repos', .3);
      if (ent.passe) {
        const arrivee = 520, inter = r.resultat === 'interception';
        const c = inter ? {x: lerp((a.x + sol.x) / 2, d.x, .6), z: (a.z + sol.z) / 2} : sol;
        if (t < arrivee) {
          const u = t / arrivee; if (t < 160) ja.pose('passe', doux(t / 160)); else ja.pose('passe', 1 - doux(cl((t - 160) / 200)));
          S.ballon.position.set(lerp(a.x, c.x, u), 1.2 + Math.sin(Math.PI * u) * 2 * (inter ? .6 : 1), lerp(a.z, c.z, u));
          jb.mettre(lerp(b.x, sol.x, u), 0, lerp(b.z, sol.z, u));
          if (inter) { jd.mettre(lerp(d.x, c.x, u), 0, lerp(d.z, c.z, u)); jd.regarder(a.x, a.z); jd.pose('contre', doux(u)); }
          camera(a, jb.g.position); S.maj(dt, v3(a.x, 0, a.z + 4)); return;
        }
        if (inter) { jd.jouer('repos', .2); jd.pose('contre', 1 - doux(cl((t - arrivee) / 300))); jd.pose('porte', doux(cl((t - arrivee) / 300)));
          S.ballon.position.copy(jd.main()); jb.jouer('trot', .3, .6); camera(a, jb.g.position); S.maj(dt, v3(a.x, 0, a.z + 4)); if (t > arrivee + 900) fin(); return; }
        const tt = t - arrivee; saut(jb, sol, tt);
        const ok = tir(jb, tt); camera(a, jb.g.position); S.maj(dt, v3(sol.x, 0, sol.z + 3)); if (ok) fin(); return;
      }
      if (r.resultat === 'neutralise') {
        const u = cl(t / 280); jd.mettre(lerp(d.x, a.x, u), 0, lerp(d.z, a.z + .7, u)); jd.regarder(a.x, a.z); jd.pose('defense', 0); jd.pose('porte', doux(u));
        ja.pose('porte', 1 - u); S.ballon.position.copy(u < .7 ? ja.main() : jd.main()); camera(a, b); S.maj(dt, v3(a.x, 0, a.z + 4)); if (t > 1000) fin(); return;
      }
      saut(ja, a, t); const ok = tir(ja, t); camera(ja.g.position, b); S.maj(dt, v3(a.x, 0, a.z + 3)); if (ok) fin();
    };
  });
  const local = e => { const b = z.getBoundingClientRect(); return {x: e.clientX - b.left, y: e.clientY - b.top}; };
  MJ.toucher = e => {
    const p = local(e), a = posA(t), s = S.ecran(a.x, 1, a.z);
    if (Math.hypot(p.x - s.x, p.y - s.y) > 90) return;   // la passe part de ton joueur
    dessin = true; trace = [p]; poly.setAttribute('points', `${p.x},${p.y}`);
  };
  z.addEventListener('pointermove', e => { if (!dessin) return; trace.push(local(e)); poly.setAttribute('points', trace.map(p => `${p.x},${p.y}`).join(' ')); });
  const lache = () => {
    if (!dessin) return; dessin = false;
    const fin = trace[trace.length - 1];
    if (trace.length < 3 || Math.hypot(fin.x - trace[0].x, fin.y - trace[0].y) < 40) { poly.setAttribute('points', ''); return; }
    const sol = S.sol(fin.x, fin.y) || {x: 0, z: 0}, ideal = posB(t + 600);
    sol.z = Math.min(36, sol.z);
    const qualite = Math.max(0, 1 - Math.hypot(sol.x - ideal.x, sol.z - ideal.z) / 3.5);
    z.classList.add(qualite > .7 ? 'passe-top' : qualite > .35 ? 'passe-moy' : 'passe-rate');
    decider({passe: true, qualite: Math.round(qualite * 1000) / 1000, temps: Math.round(t * vite)}, sol);
  };
  z.addEventListener('pointerup', lache); z.addEventListener('pointercancel', lache);
  MJ.raf = requestAnimationFrame(boucle);
}

// ── 3. Le tir en suspension : la caméra suit le tireur de dos. Chaque toucher est un appui (on court plus vite) ;
// le saut part tout seul au 9 m, plus haut si l'on court vite ; en l'air, on dessine le tir vers le but, au-dessus
// du contreur et loin du gardien.
export async function suspension(sc, n) {
  const {MJ, miniAide, miniEnvoyer, miniFin, fermerMini, toast, vibrer} = A;
  const z = sc.querySelector('.t3'), S = await salle(z); if (!S) return;
  const q = s => z.querySelector(s), jauge = q('.s3-vitesse i');
  S.cacherJoueurs(['moi', 'def', 'gb']);
  const moi = S.joueur('moi', 'medoc'), def = S.joueur('def', 'adv'), gb = S.joueur('gb', 'gb-adv');
  S.cam.fov = 52; S.cam.updateProjectionMatrix();
  const ZB = 40, ZDEF = 33.7, jo = {x: -1.3, y: 0, z: 25.5}, D = {x: -.9, z: ZDEF};
  def.mettre(D.x, 0, D.z, Math.PI); def.pose('contre', .85); def.ancre = true;
  gb.mettre(0, 0, 39.4, Math.PI); gb.pose('pret', 1); gb.ancre = true;
  let v = 1.6, phase = 'course', tSaut = 0, Tvol = 0, Hsaut = 0, zSaut = 0, tir = null, pts = [], tDessin = 0, par = null, tPar = 0;
  moi.jouer('trot', .1, .7); moi.pose('porte', 1);
  miniAide('Touche vite pour courir !');
  // vu de face (caméra derrière le tireur), la gauche de l'écran est du côté des x positifs
  const versX = fx => 1.5 - 3 * fx, versY = fy => 2 * (1 - fy);
  const finir = async ent => {
    phase = phase === 'vol' ? 'vol-fini' : 'attente'; MJ.toucher = null; miniAide('');
    let r; try { r = await miniEnvoyer(ent); } catch (e) { toast(e.message); return fermerMini(); }
    const cx = versX(Math.max(-.2, Math.min(1.2, ent.x))), cy = versY(Math.max(-.2, Math.min(1.1, ent.y)));
    tir = {r, t: performance.now(), dep: moi.main(), arr: v3(cx, cy, ZB + .1), duree: 650 - 300 * ent.force};
    if (r.resultat === 'contre') { tir.arr = v3(D.x + .2, 2.45, ZDEF); tir.duree *= .5; def.sauteT = performance.now(); }
    // le gardien part vers le tir (s'il l'arrête) ou vers son choix ; vu de face, sa droite est à gauche de l'écran
    const gg = r.resultat === 'arret' ? {x: (1.5 - cx) / 3, y: 1 - cy / 2} : r.reponse || {x: .5, y: .5};
    const gx = Math.abs(gg.x - .5) < .18 ? .5 : gg.x, hy = versY(gg.y);
    par = {...parade(gb, gx < .5, gx === .5, hy), dx: versX(gx) * .45, saut: hy > 1.2 ? .14 : 0}; tPar = performance.now() + 60;
    await new Promise(res => { tir.fin = res; });
    miniFin(r);
  };
  S.regarder(jo.x * .75, 2.7, jo.z - 4.4, jo.x * .3, 1.4, jo.z + 9); S.prechauffer();
  const boucle = now => {
    if (!MJ.el) return;
    const dt = S.pas();
    if (phase === 'course') {
      v = Math.max(1.2, v - 1.8 * dt); jo.z += v * dt;
      if (v > 3.6) moi.jouer('course', .25, v / 6.5); else moi.jouer('trot', .25, v / 3.4);
      jauge.style.transform = `scaleY(${v / 8})`;
      if (jo.z >= 31) { phase = 'vol'; tSaut = now; Tvol = (500 + 65 * v) * 1.5;   // un peu de ralenti en l'air pour dessiner le tir
        Hsaut = .25 + .1 * v; zSaut = jo.z; moi.jouer('repos', .12);
        miniAide('Dessine ton tir vers le but !'); vibrer(15); }
    } else if (tSaut) {
      const u = cl((now - tSaut) / Tvol);
      jo.z = zSaut + v * .2 * u * Tvol / 1000; jo.y = Hsaut * Math.sin(Math.PI * u);
      moi.pose('saut', Math.sin(Math.PI * Math.min(1, u * 1.2))); moi.pose('porte', 1 - doux(cl(u * 4)));
      if (!tir) moi.pose('arme', doux(cl(u * 3)));
      if (phase === 'vol' && u >= 1) finir({vitesse: 0, hauteur: 0, x: .5, y: .85, force: .2});
    }
    if (tir) { const w = doux(cl((now - tir.t) / 110)); moi.pose('arme', 1 - w); moi.pose('tir', w); }
    moi.mettre(jo.x, jo.y, jo.z, 0);
    // contreur : il saute bras levés si le tir est contré
    const ds = def.sauteT ? cl((now - def.sauteT) / 450) : 0;
    def.mettre(D.x, Math.sin(Math.PI * ds) * .45, D.z); def.pose('contre', .85 + .15 * Math.sin(Math.PI * Math.min(1, ds * 1.5))); def.ancre = !def.sauteT;
    if (par && now > tPar) { const w = doux(cl((now - tPar) / 170)); gb.pose('pret', 1 - w); gb.pose(par.nom, w, par.miroir);
      gb.mettre(lerp(0, par.dx, w), par.saut * Math.sin(Math.PI * cl((now - tPar) / 420)), 39.4); }
    // en course la caméra suit de près ; en l'air elle recule et monte pour montrer le but au-dessus du contreur
    const k = tSaut ? doux(cl((now - tSaut) / 350)) : 0;
    S.regarder(lerp(jo.x * .75, jo.x * .5, k), lerp(2.7, 3.5, k), jo.z - lerp(4.4, 6, k), lerp(jo.x * .3, 0, k), lerp(1.4, 1.2, k), lerp(jo.z + 9, ZB, k));
    if (tir) {
      const u = cl((now - tir.t) / tir.duree), a = tir.dep, b = tir.arr;
      S.ballon.position.set(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + Math.sin(Math.PI * u) * .25, lerp(a.z, b.z, u));
      if (u >= 1 && !tir.arrive) {
        tir.arrive = true; const res = tir.r.resultat;
        if (!tir.rebond && ['arret', 'contre', 'poteau'].includes(res)) { tir.dep = b.clone(); tir.arr = v3(b.x + (b.x < 0 ? -2 : 2), .1, b.z - 4); tir.t = now; tir.duree = 500; tir.arrive = false; tir.rebond = true; vibrer(30); }
        else { if (res === 'but') S.buts[1].bosse(b.x, b.y); MJ.timers.push(setTimeout(() => tir.fin?.(), 520)); }
      }
    }
    S.maj(dt, v3(jo.x, 0, jo.z + 3));
    if (!tir) S.ballon.position.copy(moi.main());
    MJ.raf = requestAnimationFrame(boucle);
  };
  MJ.toucher = e => {
    if (phase === 'course') { v = Math.min(8, v + 1.15); vibrer(5); return; }
    if (phase === 'vol') { pts = [{x: e.clientX, y: e.clientY}]; tDessin = performance.now(); }
  };
  const trace = q('.t3-trace polyline'), loc = p => { const b = z.getBoundingClientRect(); return `${p.x - b.left},${p.y - b.top}`; };
  z.addEventListener('pointermove', e => { if (phase !== 'vol' || !pts.length) return; pts.push({x: e.clientX, y: e.clientY}); trace.setAttribute('points', pts.map(loc).join(' ')); });
  const lache = () => {
    if (phase !== 'vol' || pts.length < 2) return;
    const a = pts[0], b = pts[pts.length - 1], long = Math.hypot(b.x - a.x, b.y - a.y), ms = Math.max(60, performance.now() - tDessin);
    if (long < 30) { pts = []; return; }
    const bx = z.getBoundingClientRect(), g1 = S.ecran(1.5, 2, ZB), g2 = S.ecran(-1.5, 0, ZB);
    const x = Math.max(-.45, Math.min(1.45, (b.x - bx.left - g1.x) / (g2.x - g1.x))), y = Math.max(-.45, Math.min(1.15, (b.y - bx.top - g1.y) / (g2.y - g1.y)));
    const u = Math.min(1, (performance.now() - tSaut) / Tvol);
    finir({vitesse: Math.round(v / 8 * 1000) / 1000, hauteur: Math.round(Math.sin(Math.PI * u) * 1000) / 1000, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000,
      force: Math.round(Math.min(1, long / ms / 1.6) * 1000) / 1000});
  };
  z.addEventListener('pointerup', lache); z.addEventListener('pointercancel', lache);
  MJ.raf = requestAnimationFrame(boucle);
}
