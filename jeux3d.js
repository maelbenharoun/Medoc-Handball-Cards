// Mini-jeux en vraie 3D (three.js, chargé seulement à l'ouverture d'un mini-jeu).
// Personnages : avatar libre Microsoft Rocketbox (licence MIT, voir modeles/LICENCE-rocketbox.txt), maillots repeints
// d'après les photos du club (scripts/modeles3d/). Animations de course et de repos du même projet ; les gestes de
// handball (bras armé, tir, parades, contre, saut) sont des poses calculées sur le squelette (POSES plus bas).
// Le serveur décide toujours du résultat (mini_jouer) : ce fichier ne fait que montrer et mesurer le geste.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

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
  if (axe === 'lx') { os.rotateX(deg * Math.PI / 180); os.updateMatrixWorld(true); return; }   // autour de l'os lui-même (poignet)
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
    [B('R_UpperArm'), 'z', -95], [B('R_Forearm'), 'z', -80], [B('L_UpperArm'), 'z', 95], [B('L_Forearm'), 'z', 80], [B('R_Hand'), 'lx', 90], [B('L_Hand'), 'lx', -90]],
  paradeHaut: [[B('Spine'), 'z', 10], [B('R_UpperArm'), 'z', -160], [B('R_Forearm'), 'z', -5], [B('L_UpperArm'), 'z', 185], [B('L_Forearm'), 'z', 5],
    [B('R_Thigh'), 'z', -32], [B('R_Thigh'), 'x', -25], [B('R_Calf'), 'x', 40], [B('L_Thigh'), 'x', -8], [B('L_Calf'), 'x', 14], [B('R_Hand'), 'lx', 90], [B('L_Hand'), 'lx', -90]],
  paradeMilieu: [[B('Spine'), 'z', 12], [B('R_UpperArm'), 'z', -105], [B('R_Forearm'), 'z', -10], [B('L_UpperArm'), 'z', 150], [B('L_Forearm'), 'z', 15],
    [B('R_Thigh'), 'z', -50], [B('R_Calf'), 'x', 12], [B('L_Thigh'), 'x', -15], [B('L_Calf'), 'x', 28], [B('R_Hand'), 'lx', 90], [B('L_Hand'), 'lx', -90]],
  paradeBas: [[B('Spine'), 'z', 20], [B('R_UpperArm'), 'z', -38], [B('R_Forearm'), 'z', -8], [B('L_UpperArm'), 'z', 125], [B('L_Forearm'), 'z', 25],
    [B('R_Thigh'), 'z', -72], [B('R_Calf'), 'x', 4], [B('L_Thigh'), 'x', -28], [B('L_Calf'), 'x', 50], [B('R_Hand'), 'lx', 90], [B('L_Hand'), 'lx', -90]],
  paradeHautCentre: [[B('R_UpperArm'), 'z', -168], [B('L_UpperArm'), 'z', 168], [B('R_Thigh'), 'x', -20], [B('R_Calf'), 'x', 35], [B('L_Thigh'), 'x', -10], [B('L_Calf'), 'x', 15], [B('R_Hand'), 'lx', 90], [B('L_Hand'), 'lx', -90]],
  paradeBasCentre: [[B('R_UpperArm'), 'z', -30], [B('L_UpperArm'), 'z', 30], [B('R_Forearm'), 'x', -25], [B('L_Forearm'), 'x', -25],
    [B('L_Thigh'), 'z', 8], [B('R_Thigh'), 'z', -8], [B('R_Thigh'), 'x', -20], [B('R_Calf'), 'x', 35], [B('L_Thigh'), 'x', -20], [B('L_Calf'), 'x', 35], [B('Spine'), 'x', 14]],
  arme: [[B('Spine1'), 'y', 25], [B('R_UpperArm'), 'z', -105], [B('R_UpperArm'), 'y', -40], [B('R_Forearm'), 'z', -95], [B('L_UpperArm'), 'z', 45], [B('L_UpperArm'), 'x', -40], [B('L_Forearm'), 'x', -50]],
  tir: [[B('Spine1'), 'y', -20], [B('Spine1'), 'x', 15], [B('R_UpperArm'), 'z', -120], [B('R_UpperArm'), 'y', 45], [B('R_Forearm'), 'z', -15], [B('L_UpperArm'), 'z', 25]],
  contre: [[B('R_UpperArm'), 'z', -165], [B('L_UpperArm'), 'z', 165], [B('R_Forearm'), 'z', -5], [B('L_Forearm'), 'z', 5], [B('R_Hand'), 'lx', 90], [B('L_Hand'), 'lx', -90]],
  dribble: [[B('R_UpperArm'), 'z', -18], [B('R_UpperArm'), 'x', -30], [B('R_Forearm'), 'x', -55]],
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
  mainProche(p) { const d = this.main('D'), g = this.main('G'); return d.distanceTo(p) < g.distanceTo(p) ? d : g; }
  main(cote = 'D') {   // position du ballon dans la main
    return this.os['main' + cote].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .02, 0));
  }
}

// ── la salle, aux dimensions officielles (règles IHF) ─────────────────────────────────────────────────────────────
// Terrain 40 × 20 m, zone de sécurité 1 m le long des touches et 2 m derrière les lignes de but. Lignes de 5 cm (8 cm
// pour la ligne de but entre les poteaux), dessinées en vrai relief sur le sol (nettes de près comme de loin) :
// zone des 6 m (quarts de cercle de 6 m autour de l'arrière intérieur des poteaux, reliés par 3 m de droite),
// 9 m en traits de 15 cm espacés de 15 cm, 7 m (1 m), limite du gardien à 4 m (15 cm), ligne médiane, zones des
// remplaçants (15 cm à 4,50 m de la ligne médiane). Buts 3 × 2 m (intérieur), poteaux carrés de 8 cm à bandes de
// 20 cm, coins de 28 cm ; filet 1 m de profondeur en bas, 80 cm en haut. Salle omnisports : sol synthétique brillant,
// tracé de basket discret comme dans les gymnases, gradins avec public, bancs, table de marque, tableau d'affichage.
function toile(w, h, dessin) { const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h); return c; }
function texGrain(base, ampl = 10) {   // grain fin du revêtement synthétique
  const c = toile(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - .5) * ampl; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(im, 0, 0);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function texTexte(w, h, dessin) { const t = new THREE.CanvasTexture(toile(w, h, dessin)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function texPanneau() {
  const t = texTexte(1024, 64, (g, w, h) => {
    g.fillStyle = '#0f1a30'; g.fillRect(0, 0, w, h);
    g.font = '800 36px system-ui, sans-serif'; g.textBaseline = 'middle';
    const txt = ['MÉDOC HANDBALL', 'ALLEZ MÉDOC !', 'MÉDOC HAND CARDS'];
    let x = 10; for (let i = 0; x < w; i++) { g.fillStyle = i % 2 ? '#ffd257' : '#ffffff'; const s = txt[i % 3] + '   •   '; g.fillText(s, x, h / 2); x += g.measureText(s).width; }
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
// bandes des poteaux : coin de 28 cm (rouge) puis bandes de 20 cm alternées
function texBandes(longueur, coins) {
  const px = 50, n = Math.round(longueur * px);
  const t = texTexte(4, n, (g) => {
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 4, n);
    g.fillStyle = '#d3312a';
    const coin = .28 * px; g.fillRect(0, 0, 4, coin); if (coins === 2) g.fillRect(0, n - coin, 4, coin);
    for (let y = coin + .2 * px, k = 0; y < n - (coins === 2 ? coin : 0) - 1; y += .2 * px, k++) if (k % 2 === 0) g.fillRect(0, y, 4, .2 * px);
  });
  return t;
}
function texFilet() {
  const t = texTexte(64, 64, (g) => { g.strokeStyle = 'rgba(255, 255, 255, .9)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 2.6, 0, 7); g.fill(); });   // mailles de 10 cm, avec leurs nœuds
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function texBallon() {
  return texTexte(256, 128, (g, w, h) => {
    g.fillStyle = '#f2cf3b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1f4f9a'; g.lineWidth = 14;
    for (let i = 0; i < 4; i++) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.sin(x / w * Math.PI * 4 + i * 1.6) * h * .32); g.stroke(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.cos(x / w * Math.PI * 2) * h * .4); g.stroke();
  });
}

class But {
  // sens = 1 : but en z = 0, filet vers les z négatifs ; sens = -1 : but en z = 40
  constructor(sc, z0, sens) {
    this.z0 = z0; this.sens = sens;
    const g = new THREE.Group(); g.position.z = z0; if (sens < 0) g.rotation.y = Math.PI; sc.add(g);
    const matP = new THREE.MeshStandardMaterial({map: texBandes(2.08, 1), roughness: .35, metalness: .1});
    const tb = texBandes(3.16, 2); tb.center.set(.5, .5); tb.rotation = Math.PI / 2;
    const matT = new THREE.MeshStandardMaterial({map: tb, roughness: .35, metalness: .1});
    for (const x of [-1.54, 1.54]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.08, .08), matP); p.position.set(x, 1.04, -.04); p.castShadow = true; g.add(p); }
    const t = new THREE.Mesh(new THREE.BoxGeometry(3.16, .08, .08), matT); t.position.set(0, 2.04, -.04); t.castShadow = true; g.add(t);
    // cadre arrière qui tient le filet (tubes gris au sol et en haut)
    const matC = new THREE.MeshStandardMaterial({color: '#8d939b', roughness: .4, metalness: .6});
    for (const x of [-1.5, 1.5]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, 1), matC); b.rotation.x = Math.PI / 2; b.position.set(x, .02, -.5); g.add(b); }
    const bas = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, 3), matC); bas.rotation.z = Math.PI / 2; bas.position.set(0, .02, -1); g.add(bas);
    // filet : fond (déformable), côtés, dessus
    const fil = texFilet(), mat = new THREE.MeshStandardMaterial({alphaMap: fil, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false, color: '#f2f4f7', roughness: .9});
    const plan = (rx, ry) => { const m = mat.clone(); m.alphaMap = fil.clone(); m.alphaMap.repeat.set(rx, ry); m.alphaMap.needsUpdate = true; return m; };
    this.fond = new THREE.Mesh(new THREE.PlaneGeometry(3, 2, 18, 12), plan(30, 20)); this.fond.position.set(0, 1, -1); g.add(this.fond);
    // le fond penche (1 m en bas, 80 cm en haut) et pend un peu
    const pf = this.fond.geometry.attributes.position;
    for (let i = 0; i < pf.count; i++) { const x = pf.getX(i), y = pf.getY(i) + 1; pf.setZ(i, .2 * y / 2 - .05 * Math.sin(Math.PI * (x + 1.5) / 3) * Math.sin(Math.PI * y / 2)); }
    this.base = Float32Array.from(pf.array);
    const cote = x => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute([x, 0, 0, x, 0, -1, x, 2, -.8, x, 2, 0], 3));
      ge.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .8, 1, 0, 1], 2)); ge.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
      ge.setIndex([0, 1, 2, 0, 2, 3]); return new THREE.Mesh(ge, plan(10, 20)); };
    g.add(cote(-1.5), cote(1.5));
    const dessus = new THREE.Mesh(new THREE.PlaneGeometry(3, .8), plan(30, 8)); dessus.rotation.x = -Math.PI / 2; dessus.position.set(0, 2, -.4); g.add(dessus);
    this.g = g; this.bosseT = -1; this.bx = this.by = 0;
  }
  bosse(x, y) { this.bx = this.sens > 0 ? x : -x; this.by = y; this.bosseT = 0; }
  maj(dt) {
    if (this.bosseT < 0) return;
    this.bosseT += dt; const p = this.fond.geometry.attributes.position, a = Math.max(0, Math.sin(Math.min(1, this.bosseT / .5) * Math.PI)) * .45;
    for (let i = 0; i < p.count; i++) { const x = this.base[i * 3], y = this.base[i * 3 + 1] + 1, d = Math.hypot(x - this.bx, y - this.by); p.setZ(i, this.base[i * 3 + 2] - a * Math.exp(-d * d / .5)); }
    p.needsUpdate = true;
    if (this.bosseT > .55) { this.bosseT = -1; for (let i = 0; i < p.count; i++) p.setZ(i, this.base[i * 3 + 2]); }
  }
}

// lignes au sol : bandes fines (droites) et anneaux (arcs), posées juste au-dessus du revêtement
const SOL = {lignes: .004, zone: .002, terrain: .001};
function bande(grp, mat, x1, z1, x2, z2, l = .05, y = SOL.lignes) {
  const d = Math.hypot(x2 - x1, z2 - z1), m = new THREE.Mesh(new THREE.PlaneGeometry(d, l), mat);
  m.rotation.set(-Math.PI / 2, 0, -Math.atan2(z2 - z1, x2 - x1)); m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); m.receiveShadow = true; grp.add(m); return m;
}
function arc(grp, mat, cx, cz, r, a0, a1, l = .05, y = SOL.lignes) {   // angles depuis +x vers +z
  const m = new THREE.Mesh(new THREE.RingGeometry(r - l, r, Math.max(6, Math.ceil(Math.abs(a1 - a0) * r * 6)), 1, a0, a1 - a0), mat);
  m.rotation.x = Math.PI / 2; m.position.set(cx, y, cz); m.receiveShadow = true; grp.add(m); return m;
}
function marquesDeBut(grp, matL, matZ) {   // demi-terrain vu depuis le but en z = 0 (le terrain est du côté des z positifs)
  const s = new THREE.Shape();
  s.moveTo(-7.5, 0); s.absarc(-1.5, 0, 6, Math.PI, Math.PI / 2, true); s.lineTo(1.5, 6); s.absarc(1.5, 0, 6, Math.PI / 2, 0, true); s.lineTo(-7.5, 0);
  const zone = new THREE.Mesh(new THREE.ShapeGeometry(s, 32), matZ); zone.rotation.x = Math.PI / 2; zone.position.y = SOL.zone; zone.receiveShadow = true; grp.add(zone);
  arc(grp, matL, 1.5, 0, 6, 0, Math.PI / 2); arc(grp, matL, -1.5, 0, 6, Math.PI / 2, Math.PI); bande(grp, matL, -1.5, 5.975, 1.5, 5.975);
  // 9 m : traits de 15 cm, espaces de 15 cm, arrêtés à la ligne de touche
  const a9 = Math.acos(8.5 / 9), pas = .3 / 9, trait = .15 / 9;
  for (let a = a9; a < Math.PI / 2 - trait; a += pas) { arc(grp, matL, 1.5, 0, 9, a, a + trait); arc(grp, matL, -1.5, 0, 9, Math.PI - a - trait, Math.PI - a); }
  for (let x = -1.5 + .075; x < 1.5; x += .3) bande(grp, matL, x - .075, 8.975, Math.min(1.5, x + .075), 8.975);
  bande(grp, matL, -.5, 6.975, .5, 6.975);                 // 7 m
  bande(grp, matL, -.075, 3.975, .075, 3.975);             // limite du gardien (4 m)
  bande(grp, matL, -1.5, .04, 1.5, .04, .08);              // ligne de but entre les poteaux : 8 cm
}

// tout le décor fixe (lignes, tribune, murs, plafond…) fusionné par matériau : quelques dizaines d'appels de dessin au lieu de centaines
function fusionnerFixes(sc) {
  sc.updateMatrixWorld(true);
  const parMat = new Map();
  sc.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material)) { const l = parMat.get(o.material) || []; l.push(o); parMat.set(o.material, l); } });
  for (const [mat, liste] of parMat) {
    if (liste.length < 2) continue;
    const geos = liste.map(m => { const g = m.geometry.index ? m.geometry : null; return g && g.clone().applyMatrix4(m.matrixWorld); });
    if (geos.some(g => !g)) continue;
    const geo = mergeGeometries(geos); if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.castShadow = liste.some(x => x.castShadow); m.receiveShadow = liste.some(x => x.receiveShadow);
    liste.forEach(x => x.removeFromParent()); sc.add(m);
  }
}

class Salle {
  constructor(R) {
    this.R = R;
    const r = this.r = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 't3-gl';
    const sc = this.sc = new THREE.Scene(); sc.background = new THREE.Color('#151a21');
    // éclairage de salle : reflets doux venus de partout (environnement), un grand projecteur qui donne les ombres
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
    sc.environmentIntensity = .55;
    this.cam = new THREE.PerspectiveCamera(45, 1, .1, 160);
    sc.add(new THREE.HemisphereLight('#fff8ee', '#3c3a36', .7));
    const s = this.soleil = new THREE.DirectionalLight('#fffaf0', 2.1);
    s.castShadow = true; s.shadow.mapSize.set(1024, 1024); Object.assign(s.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50});
    s.shadow.bias = -.0004; s.shadow.normalBias = .03; sc.add(s, s.target);
    const f = new THREE.DirectionalLight('#e4ecff', .45); f.position.set(-8, 10, -6); sc.add(f);
    // sol : zone de sécurité (1 m le long des touches, 2 m derrière les buts) et au-delà, puis le terrain bleu
    // revêtement satiné : un léger reflet des projecteurs, sans blanchir les couleurs du terrain
    const matSol = (couleur, rep, rough = .66) => { const m = new THREE.MeshStandardMaterial({map: texGrain(couleur), roughness: rough, metalness: 0, envMapIntensity: .12}); m.map.repeat.set(rep, rep); return m; };
    const plan = (w, h, mat, y, z = 20) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, z); m.receiveShadow = true; sc.add(m); return m; };
    plan(60, 90, matSol('#2a5246', 30, .78), -.03);                // tout autour (vert, comme beaucoup de salles), un peu dessous : pas de scintillement
    plan(20, 40, matSol('#245b9e', 20), SOL.terrain);              // terrain
    // lignes du handball (blanches) et, discrètes, celles du basket (comme dans un gymnase)
    const matL = new THREE.MeshStandardMaterial({color: '#f2f2ee', roughness: .5, envMapIntensity: .15, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2});
    const matZ = matSol('#cf6d2a', 6);                              // zones des 6 m
    matZ.polygonOffset = true; matZ.polygonOffsetFactor = -1; matZ.side = THREE.DoubleSide;
    const lignes = new THREE.Group(); sc.add(lignes);
    bande(lignes, matL, -9.975, 0, -9.975, 40); bande(lignes, matL, 9.975, 0, 9.975, 40);           // touches
    bande(lignes, matL, -10, .025, 10, .025); bande(lignes, matL, -10, 39.975, 10, 39.975);         // lignes de but (sorties)
    bande(lignes, matL, -10, 20, 10, 20);                                                            // médiane
    for (const z of [15.5, 24.5]) bande(lignes, matL, -10.15, z, -9.85, z);                          // zones des remplaçants
    const g0 = new THREE.Group(), g1 = new THREE.Group(); g1.position.z = 40; g1.rotation.y = Math.PI; lignes.add(g0, g1);
    marquesDeBut(g0, matL, matZ); marquesDeBut(g1, matL, matZ);
    const matB = new THREE.MeshStandardMaterial({color: '#e9c13b', roughness: .45, transparent: true, opacity: .55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2});
    const basket = new THREE.Group(); sc.add(basket);   // terrain de basket 28 × 15 m, plus fin
    bande(basket, matB, -7.5, 6, 7.5, 6, .04); bande(basket, matB, -7.5, 34, 7.5, 34, .04); bande(basket, matB, -7.5, 6, -7.5, 34, .04); bande(basket, matB, 7.5, 6, 7.5, 34, .04);
    arc(basket, matB, 0, 20, 1.8, 0, Math.PI * 2, .04);
    for (const [z0, s0] of [[6, 1], [34, -1]]) { const z = z0 + 1.575 * s0; arc(basket, matB, 0, z, 6.75, s0 > 0 ? .2 : Math.PI + .2, s0 > 0 ? Math.PI - .2 : Math.PI * 2 - .2, .04);
      bande(basket, matB, -2.45, z0, -2.45, z0 + 5.8 * s0, .04); bande(basket, matB, 2.45, z0, 2.45, z0 + 5.8 * s0, .04); bande(basket, matB, -2.45, z0 + 5.8 * s0, 2.45, z0 + 5.8 * s0, .04); }
    // panneaux publicitaires le long de la touche, côté tribune, et derrière le but du fond
    const pan = texPanneau(), matPan = n => { const m = new THREE.MeshStandardMaterial({map: pan.clone(), emissive: '#ffffff', emissiveIntensity: .35, roughness: .5}); m.emissiveMap = m.map; m.map.repeat.set(n, 1); m.map.needsUpdate = true; return m; };
    { const p = new THREE.Mesh(new THREE.BoxGeometry(.1, .9, 40), matPan(4)); p.position.set(11.6, .45, 20); p.castShadow = true; sc.add(p); }
    { const p = new THREE.Mesh(new THREE.BoxGeometry(20, .9, .1), matPan(2)); p.position.set(0, .45, 42.6); p.rotation.y = Math.PI; sc.add(p); }
    // tribune : 7 rangs, sièges bleus, public
    const matG = new THREE.MeshStandardMaterial({color: '#3a4049', roughness: .85}), matSiege = new THREE.MeshStandardMaterial({color: '#1d5b8f', roughness: .6});
    const sieges = [];
    for (let i = 0; i < 7; i++) {
      const x = 13 + i * .85, h = .45 * (i + 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(.85, h, 44), matG); m.position.set(x + .42, h / 2, 20); m.receiveShadow = true; sc.add(m);
      const sg = new THREE.Mesh(new THREE.BoxGeometry(.38, .12, 44), matSiege); sg.position.set(x + .3, h + .2, 20); sc.add(sg);
      for (let z = -1.6; z < 41.6; z += .55) if (Math.random() < .42) sieges.push([x + .32, h + .26, z + (Math.random() - .5) * .08]);
    }
    const corps = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.19, .42, 2, 6), new THREE.MeshStandardMaterial({roughness: .8}), sieges.length);
    const tetes = new THREE.InstancedMesh(new THREE.SphereGeometry(.105, 7, 5), new THREE.MeshStandardMaterial({roughness: .7}), sieges.length);
    const habits = ['#f4f4f4', '#1d5b8f', '#2b2f36', '#c8372d', '#ffd257', '#5c6b7a', '#e9e2d0', '#121417', '#3f7d5b'], peaux = ['#e8bf9a', '#c98f62', '#8a5a3b', '#f1d0b5', '#a8704a'];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    sieges.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y + .32, z); corps.setMatrixAt(i, m4); corps.setColorAt(i, col.set(habits[Math.floor(Math.random() * habits.length)]));
      m4.makeTranslation(x - .02, y + .72, z); tetes.setMatrixAt(i, m4); tetes.setColorAt(i, col.set(peaux[Math.floor(Math.random() * peaux.length)]));
    });
    sc.add(corps, tetes);
    // côté bancs : deux bancs d'équipe et la table de marque
    const matBanc = new THREE.MeshStandardMaterial({color: '#20252c', roughness: .6}), matTable = new THREE.MeshStandardMaterial({color: '#e9ecef', roughness: .5});
    for (const [z0, z1] of [[12.5, 17.5], [22.5, 27.5]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.5, .45, z1 - z0), matBanc); b.position.set(-11.6, .225, (z0 + z1) / 2); b.castShadow = true; sc.add(b);
      const dos = new THREE.Mesh(new THREE.BoxGeometry(.08, .5, z1 - z0), matBanc); dos.position.set(-11.85, .7, (z0 + z1) / 2); sc.add(dos);
    }
    { const tb = new THREE.Mesh(new THREE.BoxGeometry(.8, .75, 4), matTable); tb.position.set(-11.4, .375, 20); tb.castShadow = true; sc.add(tb); }
    // murs : bas bleu (protections) et haut clair à panneaux ; plafond sombre avec poutres et projecteurs
    const texMur = texTexte(512, 256, (g, w, h) => {
      g.fillStyle = '#c9ced4'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = x % 64 ? '#c2c7cd' : '#ced3d9'; g.fillRect(x, 0, 32, h); }
      g.fillStyle = '#16365e'; g.fillRect(0, h * .78, w, h * .22); g.fillStyle = '#ffd257'; g.fillRect(0, h * .78, w, 3);
    });
    texMur.wrapS = THREE.RepeatWrapping;
    const mur = (w, x, z, ry) => { const t = texMur.clone(); t.repeat.set(w / 16, 1); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 12), new THREE.MeshStandardMaterial({map: t, roughness: .9})); m.position.set(x, 6, z); m.rotation.y = ry; sc.add(m); };
    mur(34, -15, 20, Math.PI / 2); mur(90, 19.5, 20, -Math.PI / 2); mur(35, 2.25, -12, 0); mur(35, 2.25, 52, Math.PI);
    const plafond = new THREE.Mesh(new THREE.PlaneGeometry(40, 70), new THREE.MeshStandardMaterial({color: '#2a2f36', roughness: 1})); plafond.rotation.x = Math.PI / 2; plafond.position.set(2.25, 12, 20); sc.add(plafond);
    const matPoutre = new THREE.MeshStandardMaterial({color: '#59606a', roughness: .6, metalness: .4}), matLum = new THREE.MeshBasicMaterial({color: '#fffbea'});
    for (let z = -8; z <= 48; z += 8) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(34, .5, .25), matPoutre); p.position.set(2.25, 11.6, z); sc.add(p);
      for (const x of [-8, -2.5, 3, 8.5]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .9), matLum); l.rotation.x = Math.PI / 2; l.position.set(x, 11.3, z + 4); sc.add(l); }
    }
    // tableau d'affichage au fond
    const texScore = texTexte(512, 160, (g, w, h) => {
      g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
      g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.fillText('MÉDOC', 110, 42); g.fillText('VISITEURS', 402, 42);
      g.font = '900 78px ui-monospace, monospace'; g.fillStyle = '#ffb21a'; g.fillText('00', 110, 128); g.fillText('00', 402, 128);
      g.fillStyle = '#ff4b3a'; g.font = '900 56px ui-monospace, monospace'; g.fillText('60:00', 256, 110);
    });
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshBasicMaterial({map: texScore})); tab.position.set(0, 6.5, 51.9); tab.rotation.y = Math.PI; sc.add(tab);
    fusionnerFixes(sc);
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
      const u = cl((now - quand) / duree), p = posBallon(u);
      // arrêt : le ballon finit dans les mains du gardien (un peu devant la ligne), et c'est sur lui qu'il rebondit
      const arret = r?.resultat === 'arret', uStop = 1 - .75 / depart.z;
      if (arret) p.lerp(moi.mainProche(p), doux(cl((u - uStop + .3) / .3)));
      S.ballon.position.copy(p);
      if (r && (u >= 1 || (arret && u >= uStop))) { fini = true; S.cacherTrajectoire(); impact().then(() => miniFin(r)); }
    }
    S.maj(dt, v3(0, 0, 4));
    if (!depart) S.ballon.position.copy(tireur.main());
    if (!fini) MJ.raf = requestAnimationFrame(boucle);
  };
  // la suite : arrêt (le ballon repart vers le terrain) ou but (filet qui se creuse)
  const impact = () => new Promise(fin => {
    const t1 = performance.now(), arret = r.resultat === 'arret', a = arret ? S.ballon.position.clone() : cible.clone();
    const b = arret ? v3(a.x * 2.2 + (Math.random() - .5), .1, 5.5) : v3(a.x * .9, Math.max(.12, a.y - .3), -.85);   // repoussé vers le terrain
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
      if (!decision) {   // il dribble : le ballon descend au sol devant sa main droite et remonte (un rebond tous les 2 pas)
        const k = Math.abs(Math.cos(Math.PI * t / 470));
        ja.pose('dribble', .45 + .55 * k);
        S.ballon.position.copy(ja.g.localToWorld(v3(-.3, .11 + .82 * k, .42)));
      }
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
    ja.pose('dribble', 0); ja.pose('porte', 1);
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
  let v = 1.6, phase = 'course', tAppel = 0, vAppel = 0, tSaut = 0, Tvol = 0, Hsaut = 0, zSaut = 0, tir = null, pts = [], tDessin = 0, par = null, tPar = 0;
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
    if (r.resultat === 'arret') tir.arr.z = ZB - .85;   // arrêté devant la ligne, dans les mains du gardien
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
      // fin de la course : une seconde d'appel (derniers pas, touchers ignorés) avant le saut, pour ne pas tirer sans le vouloir
      if (jo.z >= 31 - .55 * v) { phase = 'appel'; tAppel = now; vAppel = Math.max(2, v * .55); moi.jouer('trot', .3, vAppel / 3.4); miniAide('Appel… prépare ton tir'); }
    } else if (phase === 'appel') {
      jo.z += vAppel * dt;
      if (now - tAppel >= 1000) { phase = 'vol'; tSaut = now; Tvol = (500 + 65 * v) * 1.5;   // un peu de ralenti en l'air pour dessiner le tir
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
      const p = v3(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + Math.sin(Math.PI * u) * .25, lerp(a.z, b.z, u));
      if (!tir.rebond && tir.r.resultat === 'arret') p.lerp(gb.mainProche(p), doux(cl((u - .7) / .3)));
      S.ballon.position.copy(p);
      if (u >= 1 && !tir.arrive) {
        tir.arrive = true; const res = tir.r.resultat;
        if (!tir.rebond && ['arret', 'contre', 'poteau'].includes(res)) { tir.dep = p.clone(); tir.arr = v3(b.x + (b.x < 0 ? -2 : 2), .1, b.z - 4); tir.t = now; tir.duree = 500; tir.arrive = false; tir.rebond = true; vibrer(30); }
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

// ── 4. Le jet de 7 mètres : caméra derrière le tireur (Médoc), le gardien adverse en face. Le viseur et la jauge restent
// dans app.js (même règles, tirer_7m) ; ici on ne fait que la scène : le but projeté sert de cadre au viseur, puis le tir.
// J7 = l'état du jeu de app.js (el, salle, raf3) ; renvoie les commandes de la scène, ou null si la 3D est impossible.
export async function jet7m(J7, z) {
  let R; try { R = await charger(); } catch (e) { return null; }
  if (!J7.el) return null;
  let S = J7.salle;
  if (!S) { try { S = J7.salle = new Salle(R); } catch (e) { return null; } }
  S.w = 0; S.attacher(z);
  S.cacherJoueurs(['t7', 'g7']);
  const tireur = S.joueur('t7', 'medoc'), gb = S.joueur('g7', 'gb-adv'), but = J7.el.querySelector('.j7-but');
  // cadrage : on voit le but en grand, avec de la place autour pour viser à côté ; le tireur, de dos, sous le but
  S.cadrage = () => {
    const cam = S.cam, v = new THREE.Vector3();
    const essai = fov => { cam.fov = fov; cam.updateProjectionMatrix(); S.regarder(-.5, 3.3, 11.8, 0, .9, 0); return v.set(1.5, 1, 0).project(cam).x; };
    let a = 8, b = 90; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (essai(m) > .7) a = m; else b = m; }
    essai((a + b) / 2);
    // vu depuis le tireur, la gauche de l'écran est du côté des x négatifs
    const g0 = S.ecran(-1.5, 2, 0), g1 = S.ecran(1.5, 0, 0);
    Object.assign(but.style, {left: g0.x + 'px', top: g0.y + 'px', width: (g1.x - g0.x) + 'px', height: (g1.y - g0.y) + 'px'});
  };
  S.w = 0; S.taille();
  let etat = null, enMain = true;
  const placer = () => {
    etat = null; enMain = true;
    tireur.sansPoses(); tireur.jouer('repos', 0); tireur.mettre(.1, 0, 7.6, Math.PI); tireur.pose('arme', .5);
    gb.sansPoses(); gb.jouer('repos', 0); gb.ancre = true; gb.mettre(0, 0, .5, 0); gb.pose('pret', 1);
    S.buts.forEach(b => { b.bosseT = .56; b.maj(0); }); S.ballon.visible = true;
  };
  placer(); S.prechauffer();
  const boucle = () => {
    if (!J7.el) return;
    const dt = S.pas(), now = performance.now();
    if (etat) etat(now);
    S.maj(dt, v3(0, 0, 4));
    if (enMain) S.ballon.position.copy(tireur.main());
    J7.raf3 = requestAnimationFrame(boucle);
  };
  J7.raf3 = requestAnimationFrame(boucle);
  return {
    nouveau: placer,
    armer() { tireur.pose('arme', 1); },
    // r : réponse de tirer_7m (x, y sur le but, 0-1 de gauche à droite et de haut en bas ; gardien {x, y}) ; duree du vol en ms
    tirer(r, duree) {
      return new Promise(fin => {
        const t0 = performance.now(), arret = r.resultat === 'arret';
        const ix = r.resultat === 'poteau' ? (r.x < .05 ? 0 : r.x > .95 ? 1 : r.x) : r.x, iy = r.resultat === 'poteau' && r.y < .05 ? 0 : r.y;
        const cible = v3(-1.5 + 3 * ix, 2 * (1 - iy), arret ? .7 : 0);
        // le gardien pare vers ce qu'il a deviné (vers le ballon s'il l'arrête) ; il nous fait face : sa droite est à gauche de l'écran
        const g = arret ? {x: Math.abs(r.x - .5) < .2 ? .5 : r.x, y: r.y} : r.gardien || {x: .5, y: .5};
        const P = parade(gb, g.x < .5, g.x === .5, 2 * (1 - g.y)), dx = (-1.5 + 3 * g.x) * .42, saut = 2 * (1 - g.y) > 1.2 ? .14 : 0;
        let dep = null, rebond = null, tR = 0, fini = false;
        etat = now => {
          const t = now - t0;
          const w = doux(cl(t / 110)); tireur.pose('arme', (1 - w) * 1); tireur.pose('tir', w);
          const v = doux(cl((t - 150) / Math.max(180, duree * .7)));
          gb.pose('pret', 1 - v); gb.pose(P.nom, v, P.miroir); gb.mettre(lerp(0, dx, v), saut * Math.sin(Math.PI * cl((t - 150) / 420)), .5);
          if (t < 110) return;
          if (!dep) { dep = tireur.main(); enMain = false; }
          if (!rebond) {
            const u = cl((t - 110) / duree), p = v3(lerp(dep.x, cible.x, u), lerp(dep.y, cible.y, u) + Math.sin(Math.PI * u) * .12, lerp(dep.z, cible.z, u));
            if (arret) p.lerp(gb.mainProche(p), doux(cl((u - .7) / .3)));   // dans les mains du gardien
            S.ballon.position.copy(p);
            if (u >= 1) {
              tR = now; const a = p.clone();
              if (r.resultat === 'but') { S.buts[0].bosse(a.x, a.y); rebond = {a, b: v3(a.x * .9, Math.max(.12, a.y - .3), -.85), d: 380, chute: true}; }
              else if (arret) rebond = {a, b: v3(a.x * 2.4 + (Math.random() - .5), .1, 5), d: 620, h: 1.1};
              else if (r.resultat === 'poteau') rebond = iy === 0 ? {a, b: v3(a.x * 1.2, 3.4, -2.5), d: 520} : {a, b: v3(a.x * 2.2, .1, 4.5), d: 560, h: .6};
              else rebond = {a, b: v3(a.x * 1.4 + (a.x - dep.x) * .3, a.y + (a.y - dep.y) * .4, -4.5), d: 420};   // à côté : il file
            }
          } else {
            const u = cl((now - tR) / rebond.d), {a, b} = rebond;
            const p = v3(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + (rebond.h || 0) * Math.sin(Math.PI * u), lerp(a.z, b.z, u));
            if (rebond.chute && u >= 1) p.y = Math.max(.1, b.y - (now - tR - rebond.d) / 400);
            S.ballon.position.copy(p);
            if (!fini && now - tR > rebond.d + 250) { fini = true; fin(); }
          }
        };
      });
    },
  };
}
