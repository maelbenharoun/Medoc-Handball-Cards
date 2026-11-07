// Captures de mouvement CMU (BVH, mocap.cs.cmu.edu) → animations du joueur Rocketbox (squelette Bip01), ajoutées à modeles/joueur.glb
// node cmu.mjs analyse <fichier.bvh>        : hauteur du bassin et des mains, vitesse des mains (pour choisir les extraits)
// node cmu.mjs <entrée.glb> <sortie.glb>      : reprend les 4 animations Rocketbox et ajoute celles de RECETTES
// Méthode : les deux squelettes sont en pose en T (image 1 des BVH CMU) ; chaque os du joueur est d'abord aligné sur l'os
// correspondant de la capture (même direction), puis on lui reporte, image par image, la rotation de l'os capturé depuis sa
// pose en T. Le bassin donne la hauteur (sauts) ; l'avancée au sol est retirée (le jeu déplace lui-même le joueur).
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {BVHLoader} from 'three/examples/jsm/loaders/BVHLoader.js';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
// dossier data/ d'une copie BVH de la base CMU (par ex. git clone https://github.com/una-dinosauria/cmu-mocap) ; à adapter
const CMU = process.env.CMU || './cmu-mocap/data/';
const B = n => 'Bip01_' + n;
// os du joueur ← os de la capture ; [os enfant du joueur, os enfant de la capture] pour aligner les directions en pose en T
const CORRESP = [
  ['Bip01', 'Hips', null, null],
  [B('Spine'), 'LowerBack', B('Spine1'), 'Spine'], [B('Spine1'), 'Spine', B('Spine2'), 'Spine1'], [B('Spine2'), 'Spine1', B('Neck'), 'Neck1'],
  [B('Neck'), 'Neck1', B('Head'), 'Head'], [B('Head'), 'Head', null, null],
  [B('L_Clavicle'), 'LeftShoulder', B('L_UpperArm'), 'LeftArm'], [B('L_UpperArm'), 'LeftArm', B('L_Forearm'), 'LeftForeArm'],
  [B('L_Forearm'), 'LeftForeArm', B('L_Hand'), 'LeftHand'], [B('L_Hand'), 'LeftHand', B('L_Finger2'), 'LeftHandIndex1'],
  [B('R_Clavicle'), 'RightShoulder', B('R_UpperArm'), 'RightArm'], [B('R_UpperArm'), 'RightArm', B('R_Forearm'), 'RightForeArm'],
  [B('R_Forearm'), 'RightForeArm', B('R_Hand'), 'RightHand'], [B('R_Hand'), 'RightHand', B('R_Finger2'), 'RightHandIndex1'],
  [B('L_Thigh'), 'LeftUpLeg', B('L_Calf'), 'LeftLeg'], [B('L_Calf'), 'LeftLeg', B('L_Foot'), 'LeftFoot'], [B('L_Foot'), 'LeftFoot', B('L_Toe0'), 'LeftToeBase'],
  [B('R_Thigh'), 'RightUpLeg', B('R_Calf'), 'RightLeg'], [B('R_Calf'), 'RightLeg', B('R_Foot'), 'RightFoot'], [B('R_Foot'), 'RightFoot', B('R_Toe0'), 'RightToeBase'],
];
const BRAS_D = [B('R_Clavicle'), B('R_UpperArm'), B('R_Forearm'), B('R_Hand')];
// extraits de capture : nom → [fichier, première image, dernière image (120 images/s)]
const EXTRAITS = {
  dribble: ['006/06_02.bvh', 288, 396],     // basket : dribble en avançant, d'un sommet de la main au suivant
  lancer: ['124/124_01.bvh', 380, 500],     // lancer bras armé (sans le lever de jambe du baseball) : armé 0,33 s, lâcher 0,52 s
  saut: ['124/124_05.bvh', 290, 470, {sansMonter: true}],   // suspension : flexion, impulsion (≈ 0,58 s), sommet (≈ 0,98 s), réception ;
                                                            // la hauteur du saut, c'est le jeu qui la donne
  brasTir: ['124/124_01.bvh', 340, 500],    // le bras du lancer, piloté par le jeu : armé 0,67 s, lâcher 0,85 s
  paradeHaute: ['013/13_10.bvh', 0, 150],   // monter les deux bras, sur la pointe des pieds (bras en haut ≈ 0,8 s)
};

function lireBVH(f) {
  const r = new BVHLoader().parse(fs.readFileSync(CMU + f, 'utf8'));
  const racine = new THREE.Group(); racine.add(r.skeleton.bones[0]);
  const mixer = new THREE.AnimationMixer(racine), act = mixer.clipAction(r.clip); act.play();
  const os = Object.fromEntries(r.skeleton.bones.map(b => [b.name, b]));
  const poser = i => { act.time = i / 120; mixer.update(0); racine.updateMatrixWorld(true); };
  return {os, poser, n: Math.round(r.clip.duration * 120) + 1};
}
const wq = o => o.getWorldQuaternion(new THREE.Quaternion()), wp = o => o.getWorldPosition(new THREE.Vector3());

if (process.argv[2] === 'analyse') {
  const s = lireBVH(process.argv[3]); let prev;
  for (let i = 0; i < s.n; i += 12) {
    s.poser(i); const d = wp(s.os.RightHand), h = wp(s.os.Hips), v = prev ? d.distanceTo(prev) * 10 : 0; prev = d;
    console.log(String(i).padStart(5), 'bassin', h.y.toFixed(1).padStart(6), 'main D', d.y.toFixed(1).padStart(6), 'v', v.toFixed(0).padStart(4));
  }
  process.exit(0);
}

// ── reciblage d'un extrait : pistes {os: [quaternions locaux à 30 images/s]}, position de Bip01
function recibler(ctx, nom) {
  const [f, i0, i1, opt = {}] = EXTRAITS[nom], {repos, ordre} = ctx;
  const s = lireBVH(f); s.poser(0);
  const jambeS = wp(s.os.LeftUpLeg).distanceTo(wp(s.os.LeftLeg)) + wp(s.os.LeftLeg).distanceTo(wp(s.os.LeftFoot)), echelle = ctx.jambeT / jambeS;
  const ref = {}, corr = {};
  for (const [t, sn, tc, sc] of CORRESP) {
    ref[sn] = wq(s.os[sn]); corr[t] = new THREE.Quaternion();
    if (tc && sc) { const dt = repos[tc].p.clone().sub(repos[t].p).normalize(), ds = wp(s.os[sc]).sub(wp(s.os[sn])).normalize(); corr[t].setFromUnitVectors(dt, ds); }
  }
  const hips0 = wp(s.os.Hips).y;
  s.poser(i0);   // cap au début de l'extrait : le joueur regarde vers l'avant (+z)
  const av = new THREE.Vector3(0, 0, 1).applyQuaternion(wq(s.os.Hips).multiply(ref.Hips.clone().invert()));
  const lacet = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(av.x, av.z));
  const pas = 4, n = Math.floor((i1 - i0) / pas) + 1, temps = new Float32Array(n).map((_, k) => k * pas / 120);
  const pistes = {}, pos = new Float32Array(n * 3);
  for (const o of ordre) pistes[o.name] = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    s.poser(i0 + k * pas);
    for (const o of ordre) {   // du bassin vers les extrémités
      const qp = wq(o.parent), c = CORRESP.find(x => x[0] === o.name);
      const qw = c ? lacet.clone().multiply(wq(s.os[c[1]])).multiply(ref[c[1]].clone().invert()).multiply(corr[o.name]).multiply(repos[o.name].q)
        : qp.clone().multiply(repos[o.name].lq);
      o.quaternion.copy(qp.clone().invert().multiply(qw));
      if (o.name === 'Bip01') {
        const monde = repos.Bip01.p.clone(), dy = (wp(s.os.Hips).y - hips0) * echelle; monde.y += opt.sansMonter ? Math.min(0, dy) : dy;
        o.position.copy(monde.applyMatrix4(o.parent.matrixWorld.clone().invert()));
      }
      o.updateMatrixWorld(true);
      o.quaternion.toArray(pistes[o.name], k * 4);
      if (o.name === 'Bip01') o.position.toArray(pos, k * 3);
    }
  }
  for (const o of ordre) { o.quaternion.copy(repos[o.name].lq); o.position.copy(repos[o.name].lp); }
  return {temps, pistes, pos, duree: temps[n - 1]};
}
// pistes d'un clip existant (Rocketbox) ou recible, lues à des instants donnés (u = 0..1 de la durée, en boucle si besoin)
function lire(clip, nomOs, u, prop = 'quaternion') {
  const tr = clip.tracks.find(t => t.name === nomOs + '.' + prop); if (!tr) return null;
  const it = tr.createInterpolant(); return Array.from(it.evaluate(u * clip.duration));
}
// seul : 'brasD' = le bras droit seulement ; sauf : 'brasD' = tout le corps sauf le bras droit (deux actions jouées ensemble)
const versClip = (nom, R, {seul, sauf} = {}) => {
  const garde = o => (seul ? BRAS_D.includes(o) : true) && (sauf ? !BRAS_D.includes(o) : true);
  const tracks = Object.entries(R.pistes).filter(([o]) => garde(o)).map(([o, v]) => new THREE.QuaternionKeyframeTrack(o + '.quaternion', R.temps, v));
  if (!seul) tracks.push(new THREE.VectorKeyframeTrack('Bip01.position', R.temps, R.pos));
  const c = new THREE.AnimationClip(nom, R.duree, tracks); c.optimize(); return c;
};
// une course qui dribble : jambes et corps du clip de course, bras droit du dribble (un rebond par foulée), en boucle
function avecBras(nom, base, bras, rebonds = 1) {
  const n = 31, temps = new Float32Array(n).map((_, k) => k / (n - 1) * base.duration), tracks = [];
  for (const tr of base.tracks) {
    const [o, prop] = tr.name.split('.');
    if (!(prop === 'quaternion' && BRAS_D.includes(o))) { tracks.push(tr.clone()); continue; }
    const v = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { const u = ((k / (n - 1)) * rebonds) % 1, q = lire(bras, o, u === 0 && k ? 1 : u); v.set(q, k * 4); }
    tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, temps, v));
  }
  return new THREE.AnimationClip(nom, base.duration, tracks);
}

globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend && this.onloadend(); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); } };
const buf = fs.readFileSync(process.argv[2]);
new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', gltf => {
  const scene = gltf.scene; let peau; scene.traverse(n => { if (n.isSkinnedMesh) peau = n; });
  peau.skeleton.pose();
  const bip = scene.getObjectByName('Bip01'); scene.updateMatrixWorld(true);
  const ordre = []; (function f(o) { ordre.push(o); o.children.forEach(c => c.isBone && f(c)); })(bip);
  const repos = Object.fromEntries(ordre.map(o => [o.name, {q: wq(o), lq: o.quaternion.clone(), lp: o.position.clone(), p: wp(o)}]));
  const jambeT = repos[B('L_Thigh')].p.distanceTo(repos[B('L_Calf')].p) + repos[B('L_Calf')].p.distanceTo(repos[B('L_Foot')].p);
  const ctx = {repos, ordre, jambeT};
  const R = Object.fromEntries(Object.keys(EXTRAITS).map(k => [k, recibler(ctx, k)]));
  const anciens = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const dribble = versClip('dribble', R.dribble);
  // la boucle du bras : la fin rejoint le début
  const clips = [anciens.repos, anciens.course, anciens.trot, anciens.joie,
    avecBras('courseBalle', anciens.course, dribble), avecBras('trotBalle', anciens.trot, dribble),
    versClip('lancer', R.lancer), versClip('paradeHaute', R.paradeHaute),
    // tir en suspension : le saut (sans le bras droit) et le bras du lancer, joués ensemble ; le jeu pilote le bras (armé, puis tir au toucher)
    versClip('saut', R.saut, {sauf: true}), versClip('brasTir', R.brasTir, {seul: true})];
  for (const c of clips) console.log(c.name.padEnd(12), c.duration.toFixed(2) + ' s', c.tracks.length, 'pistes');
  peau.skeleton.pose();
  new GLTFExporter().parse(scene, res => { fs.writeFileSync(process.argv[3], Buffer.from(res)); console.log('glb', res.byteLength); },
    e => console.error(e), {binary: true, animations: clips});
}, e => console.error('lecture', e));
