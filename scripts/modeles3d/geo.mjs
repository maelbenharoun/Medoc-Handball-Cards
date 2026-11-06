import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import fs from 'fs';
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
const buf = fs.readFileSync(process.argv[2]);
const o = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
o.updateMatrixWorld(true);
let m; o.traverse(n => { if (n.isSkinnedMesh) m = n; });
const g = m.geometry; console.log(g.groups, !!g.index, m.matrixWorld.elements.map(v=>+v.toFixed(3)).join(','));
const pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal;
const out = {groups: g.groups, n: pos.count};
fs.writeFileSync(process.argv[3] + '/pos.bin', Buffer.from(new Float32Array(pos.array).buffer));
fs.writeFileSync(process.argv[3] + '/uv.bin', Buffer.from(new Float32Array(uv.array).buffer));
fs.writeFileSync(process.argv[3] + '/nor.bin', Buffer.from(new Float32Array(nor.array).buffer));
if (g.index) fs.writeFileSync(process.argv[3] + '/idx.bin', Buffer.from(new Uint32Array(g.index.array).buffer));
fs.writeFileSync(process.argv[3] + '/geo.json', JSON.stringify(out));
// nez : sommet le plus haut du groupe tête vers l'avant
let zmax = -1e9, zmin = 1e9; for (let i = 0; i < pos.count; i++) { if (pos.getY(i) > 160) { zmax = Math.max(zmax, pos.getZ(i)); zmin = Math.min(zmin, pos.getZ(i)); } }
console.log('tête z', zmin, zmax);
