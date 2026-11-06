// Modèle + animations Rocketbox → un seul GLB (sans textures : elles sont chargées à part, une par équipe)
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import {mergeVertices, mergeGroups} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
const R = '/home/user/microsoft/microsoft-rocketbox/Assets/';
const lire = f => { const b = fs.readFileSync(R + f); return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const modele = lire('Avatars/Professions/Sports_Male_02/Export/Sports_Male_02.fbx');
let peau; const os = new Set();
modele.traverse(n => { if (n.isSkinnedMesh) peau = n; if (n.isBone) os.add(n.name); });
peau.material = [new THREE.MeshStandardMaterial({name: 'corps', roughness: .8}), new THREE.MeshStandardMaterial({name: 'tete', roughness: .6})];
// on ne garde que position, normale, uv, poids (pas de couleurs)
for (const k of Object.keys(peau.geometry.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) peau.geometry.deleteAttribute(k);
peau.geometry = mergeGroups(mergeVertices(peau.geometry, 1e-3));
console.log('sommets', peau.geometry.attributes.position.count, peau.geometry.groups);
for (const n of [...modele.children]) if (n.isLight || n.isCamera) modele.remove(n);
const DUREE = {repos: [0, 120], joie: [0, 96]};
const clips = [];
for (const [nom, f, enPlace] of [['repos', 'Animations/all_animations_max_motextr_static/m_idle_neutral_01.max.fbx'],
  ['course', 'Animations/all_animations_max_motextr_xy/m_run_fast_01.max.fbx', true],
  ['trot', 'Animations/all_animations_max_motextr_xy/m_run_neutral_01.max.fbx', true],
  ['joie', 'Animations/all_animations_max_motextr_static/m_cheer_01.max.fbx']]) {
  const c = lire(f).animations[0];
  const pistes = [];
  for (const t of c.tracks) {
    const [os_, prop] = t.name.split('.');
    if (!os.has(os_)) continue;
    if (prop === 'scale') continue;
    if (prop === 'position' && os_ !== 'Bip01') continue;
    if (prop === 'position' && enPlace) {
      // retire l'avancée (tendance linéaire) sur les deux axes horizontaux, garde le rebond vertical
      const v = t.values, n = t.times.length;
      for (const ax of [0, 1, 2]) {
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < n; i++) { const x = t.times[i], y = v[i * 3 + ax]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
        const pente = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
        if (Math.abs(pente) < 20) continue; // axe sans avancée nette (le vertical)
        for (let i = 0; i < n; i++) v[i * 3 + ax] -= pente * (t.times[i] - t.times[0]);
      }
    }
    pistes.push(t);
  }
  let clip = new THREE.AnimationClip(nom, c.duration, pistes);
  if (DUREE[nom]) clip = THREE.AnimationUtils.subclip(clip, nom, DUREE[nom][0], DUREE[nom][1], 30);
  clip.optimize(); clips.push(clip);
  console.log(nom, c.duration.toFixed(2), pistes.length);
}
modele.animations = clips;
// le FBX est en centimètres : on met à l'échelle 1 = 1 m
modele.scale.setScalar(.01);
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend && this.onloadend(); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); } };
new GLTFExporter().parse(modele, res => { fs.writeFileSync(process.argv[2], Buffer.from(res)); console.log('glb', res.byteLength); }, e => console.error(e), {binary: true, animations: clips});
