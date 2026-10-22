// Baut die komplette Szene. Alle statischen Teile werden pro Material zu einem Mesh zusammengeführt
// (wenige Draw Calls → flüssig auf dem Handy).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import * as L from './layout.js';

const PI = Math.PI;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const cylCache = {};
const cylGeo = (seg) => (cylCache[seg] ??= new THREE.CylinderGeometry(1, 1, 1, seg));
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1));
}
const I = new THREE.Matrix4();

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rand = rng(20261022);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const jit = (a) => (rand() - 0.5) * 2 * a;

// UVs aus Weltkoordinaten je Dreieck (kachelt Texturen in echter Größe)
function triplanar(g, tile) {
  const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 3) {
    _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _c.fromBufferAttribute(p, i + 2);
    _n.crossVectors(_b.clone().sub(_a), _c.clone().sub(_a));
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? _a : k === 1 ? _b : _c;
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u / tile; uv[(i + k) * 2 + 1] = w / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

class Batch {
  constructor(mats) { this.mats = mats; this.parts = new Map(); }

  add(geo, key, matrix, o = {}) {
    const mat = this.mats[key];
    if (!mat) throw new Error('Material fehlt: ' + key);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    const tile = o.uv === false ? null : (o.tile ?? mat.userData.tile);
    if (o.pre) g.applyMatrix4(o.pre);
    if (tile && o.local) triplanar(g, tile);
    g.applyMatrix4(matrix);
    if (tile && !o.local) triplanar(g, tile);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const col = new THREE.Color(o.color ?? 0xffffff), cnt = g.attributes.position.count, ca = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
  }

  // Quader: Mittelpunkt (cx,cy,cz) im Koordinatensystem P
  box(key, P, cx, cy, cz, sx, sy, sz, o = {}) {
    const m = P.clone().multiply(M(cx, cy, cz, o.ry || 0, o.rx || 0, o.rz || 0));
    if (o.local) {
      const pre = new THREE.Matrix4().makeTranslation(sx / 2, sy / 2, sz / 2).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
      m.multiply(new THREE.Matrix4().makeTranslation(-sx / 2, -sy / 2, -sz / 2));
      this.add(BOX, key, m, { ...o, pre });
    } else {
      this.add(BOX, key, m.scale(_s.set(sx, sy, sz)), o);
    }
  }

  cyl(key, P, cx, cy, cz, r, h, o = {}) {
    const m = P.clone().multiply(M(cx, cy, cz, o.ry || 0, o.rx || 0, o.rz || 0)).scale(_s.set(r, h, o.r2 ?? r));
    this.add(cylGeo(o.seg || 16), key, m, o);
  }

  // Stab (Zylinder oder Vierkant) zwischen zwei Punkten
  rod(key, P, a, b, r, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    const m = P.clone().multiply(new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r)));
    this.add(o.square ? BOX : cylGeo(o.seg || 8), key, m, o);
  }

  plane(key, P, cx, cy, cz, w, h, o = {}) {
    const m = P.clone().multiply(M(cx, cy, cz, o.ry || 0, o.rx || 0, o.rz || 0)).scale(_s.set(w, h, 1));
    this.add(PLANE, key, m, { uv: false, ...o });
  }

  build(parent) {
    for (const [key, list] of this.parts) {
      const mat = this.mats[key];
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = !mat.userData.noShadow;
      mesh.receiveShadow = true;
      mesh.name = key;
      parent.add(mesh);
      list.forEach((g) => g.dispose());
    }
  }
}

function makeMaterials() {
  const std = (p, tile) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...p }); m.userData.tile = tile; return m; };
  const fabric = TX.fabric(); fabric.repeat.set(10, 4);
  const exit = TX.exitSign();
  const awning = TX.awning(); awning.repeat.set(3, 1);
  const mats = {
    concrete: std({ map: TX.concrete(), bumpMap: TX.concreteBump(), bumpScale: 0.6, roughness: 0.78 }, 6),
    asphalt: std({ map: TX.asphalt(), roughness: 0.95 }, 3),
    wood: std({ map: TX.wood(), roughness: 0.88 }, 1),
    cartons: std({ map: TX.cartons(), roughness: 0.9 }, 1.2),
    corrugated: std({ map: TX.corrugated(), roughness: 0.95 }, 0.5),
    kraft: std({ map: TX.kraft(), roughness: 0.95 }, 1.3),
    strap: std({ color: 0xf0f0ec, roughness: 0.45 }),
    rackOrange: std({ color: 0xe0611a, roughness: 0.42, metalness: 0.3 }),
    steel: std({ color: 0xb9bdc1, roughness: 0.32, metalness: 0.9 }),
    steelDark: std({ color: 0x2c2e31, roughness: 0.5, metalness: 0.6 }),
    panel: std({ map: TX.panel(), roughness: 0.55, metalness: 0.15 }, 1),
    cutCap: std({ color: 0x34363a, roughness: 0.85 }),
    drywall: std({ map: TX.drywall(), roughness: 0.92 }, 2),
    laminate: std({ map: TX.laminate(), roughness: 0.5 }, 2.4),
    tiles: std({ map: TX.tiles(), roughness: 0.35 }, 1.2),
    tilesWhite: std({ map: TX.tilesWhite(), roughness: 0.28 }, 0.9),
    postStripe: std({ map: TX.stripesV(), roughness: 0.45 }),
    chain: std({ map: TX.stripesU(), roughness: 0.4 }),
    rubber: std({ color: 0x1b1b1b, roughness: 0.92 }),
    sign: std({ map: TX.signNoEntry(), roughness: 0.5, side: THREE.DoubleSide }),
    exitSign: std({ map: exit, emissive: 0xffffff, emissiveMap: exit, emissiveIntensity: 0.9 }),
    doorWhite: std({ color: 0xeeebe4, roughness: 0.45 }),
    doorSteel: std({ color: 0x8e959b, roughness: 0.42, metalness: 0.55 }),
    frame: std({ color: 0x6d7276, roughness: 0.45, metalness: 0.5 }),
    sectional: std({ map: TX.sectional(), roughness: 0.42, metalness: 0.3 }, 0.6),
    beerWood: std({ map: TX.beerWood(), roughness: 0.42 }, 1),
    darkWood: std({ map: TX.darkWood(), roughness: 0.5 }, 1),
    fabricWhite: std({ map: fabric, roughness: 0.96 }),
    blackCloth: std({ color: 0x141414, roughness: 0.97 }),
    blackPlastic: std({ color: 0x18191b, roughness: 0.38 }),
    grille: std({ map: TX.grille(), roughness: 0.8 }, 0.25),
    trailerWhite: std({ color: 0xf3f3f1, roughness: 0.3, metalness: 0.1 }),
    tire: std({ color: 0x161616, roughness: 0.85 }),
    crate: std({ color: 0xffffff, roughness: 0.55 }),
    canvasWhite: std({ color: 0xf6f6f3, roughness: 0.9, side: THREE.DoubleSide }),
    ceramic: std({ color: 0xfafafa, roughness: 0.12 }),
    cabinet: std({ color: 0xefefeb, roughness: 0.45 }),
    counterTop: std({ color: 0x3a3a38, roughness: 0.35 }),
    fabricGrey: std({ color: 0x5f666e, roughness: 0.96 }),
    fabricBrown: std({ color: 0x80603f, roughness: 0.96 }),
    deskTop: std({ color: 0xd8ccb6, roughness: 0.5 }),
    screen: std({ color: 0x0b0c0e, roughness: 0.15, emissive: 0x1d2c3c, emissiveIntensity: 0.6 }),
    ember: std({ color: 0x2a0c00, emissive: 0xff5208, emissiveIntensity: 2.2, roughness: 1 }),
    sausage: std({ color: 0x9a5a2a, roughness: 0.45 }),
    sequin: std({ color: 0xc7c8cf, roughness: 0.28, metalness: 0.92 }),
    ringLight: std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 }),
    stairs: std({ color: 0x9d9b96, roughness: 0.8 }, 1),
    gasBottle: std({ color: 0x8a8f94, roughness: 0.4, metalness: 0.5 }),
    foam: std({ color: 0xfbf6ea, roughness: 0.9 }),
    carpet: std({ map: TX.carpet(), roughness: 1 }, 1),
    slats: std({ map: TX.slats(), roughness: 0.6 }, 0.5),
    awning: std({ map: awning, roughness: 0.85, side: THREE.DoubleSide }),
    anthracite: std({ color: 0x2f3338, roughness: 0.5, metalness: 0.3 }),
    frosted: std({ color: 0xe4ecef, roughness: 0.25 }),
    fluted: std({ map: TX.fluted(), roughness: 0.2 }),
    greenHandle: std({ color: 0x1d5c38, roughness: 0.35, metalness: 0.3 }),
    whiteboard: std({ color: 0xfafaf8, roughness: 0.12 }),
    fabricBlue: std({ color: 0x223f86, roughness: 0.95 }),
    rackGalv: std({ color: 0xaab0b5, roughness: 0.38, metalness: 0.75 }),
    guard: std({ map: TX.guardStripes(), roughness: 0.5 }),
  };
  const glassy = (color, opacity, rough) => {
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, color, transparent: true, opacity, roughness: rough, metalness: 0, clearcoat: 1, depthWrite: false });
    m.userData.noShadow = true;
    return m;
  };
  mats.film = glassy(0xffffff, 0.14, 0.12);
  mats.water = glassy(0x6fa8c8, 0.75, 0.02);
  mats.glass = glassy(0xffffff, 0.28, 0.04);
  mats.beer = glassy(0xd88a14, 0.85, 0.1);
  mats.bottleGreen = glassy(0x1b5c2a, 0.9, 0.1);
  mats.bottleBrown = glassy(0x5c300c, 0.92, 0.1);
  mats.canvasWhite.userData.noShadow = false;
  return mats;
}

// ---------- Einzelobjekte ----------

// Europalette 1200 × 800 × 144 mm, lokale x = 1,2 m
function pallet(B, P, color) {
  const o = { color };
  for (const z of [-0.35, 0, 0.35]) B.box('wood', P, 0, 0.011, z, 1.2, 0.022, z ? 0.1 : 0.145, o);
  for (const x of [-0.5275, 0, 0.5275]) for (const z of [-0.35, 0, 0.35]) B.box('wood', P, x, 0.061, z, 0.145, 0.078, z ? 0.1 : 0.145, { color: color.clone().multiplyScalar(0.92) });
  for (const x of [-0.5275, 0, 0.5275]) B.box('wood', P, x, 0.111, 0, 0.145, 0.022, 0.8, o);
  [[-0.35, 0.1], [-0.1825, 0.145], [0, 0.145], [0.1825, 0.145], [0.35, 0.1]].forEach(([z, w]) => B.box('wood', P, 0, 0.133, z, 1.2, 0.022, w, o));
}
const palletColor = () => new THREE.Color().setHSL(0.09 + jit(0.01), 0.25 + jit(0.12), 0.62 + jit(0.12)).lerp(new THREE.Color(0xd9d4c8), rand() * 0.3);

// eingelagerte Kartons auf Palette, foliert
function cartonLoad(B, P, h) {
  const t = 0.85 + rand() * 0.2;
  B.box('cartons', P, 0, 0.144 + h / 2, 0, 1.18, h, 0.78, { local: true, color: new THREE.Color(t, t * (0.97 + jit(0.03)), t * 0.95) });
  B.box('film', P, 0, 0.05 + (h + 0.11) / 2, 0, 1.215, h + 0.11, 0.815);
}

// ungefaltete Kartonage (Wellpappzuschnitte) gestapelt, umreift
function sheetLoad(B, P, h) {
  const t = 0.9 + rand() * 0.12, col = new THREE.Color(t, t, t);
  const P2 = P.clone().multiply(M(jit(0.02), 0, jit(0.02), jit(0.02)));
  B.box('corrugated', P2, 0, 0.144 + h / 2, 0, 1.24, h, 0.84, { local: true, color: col });
  B.box('kraft', P2, 0, 0.144 + h + 0.003, 0, 1.24, 0.006, 0.84, { color: col });
  const top = 0.144 + h + 0.008;
  for (const x of [-0.35, 0.35]) {
    B.box('strap', P2, x, top, 0, 0.022, 0.004, 0.85);
    for (const z of [-0.423, 0.423]) B.box('strap', P2, x, 0.144 + h / 2, z, 0.022, h, 0.004);
  }
}

// Palettenregal: lokale x = Länge, z = Tiefe (0..depth)
function rack(B, P, len, depth, levels, H, loadLevel) {
  const bays = Math.max(1, Math.round(len / 2.85)), bl = len / bays, up = 0.08, ud = 0.07;
  for (let i = 0; i <= bays; i++) {
    const x = Math.min(Math.max(i * bl, up / 2), len - up / 2);
    for (const z of [ud / 2, depth - ud / 2]) {
      B.box('rackGalv', P, x, H / 2, z, up, H, ud);
      B.box('steelDark', P, x, 0.005, z, 0.15, 0.01, 0.13);
      if (i === bays) B.box('guard', P, x + 0.02, 0.2, z, 0.14, 0.4, 0.13);
    }
    const n = Math.max(3, Math.round(H / 0.95));
    for (let k = 0; k <= n; k++) {
      const y = 0.15 + k * (H - 0.3) / n;
      B.rod('rackGalv', P, [x, y, ud], [x, y, depth - ud], 0.014, { seg: 6 });
      if (k < n) {
        const y1 = 0.15 + (k + 1) * (H - 0.3) / n;
        B.rod('rackGalv', P, [x, y, k % 2 ? depth - ud : ud], [x, y1, k % 2 ? ud : depth - ud], 0.012, { seg: 6 });
      }
    }
  }
  for (let b = 0; b < bays; b++) {
    const cx = (b + 0.5) * bl;
    levels.forEach((lv, li) => {
      if (lv > 0) for (const z of [ud / 2, depth - ud / 2]) B.box('rackOrange', P, cx, lv - 0.055, z, bl - up, 0.11, 0.05);
      if (!loadLevel(li)) return;
      for (let k = 0; k < 3; k++) {
        if (rand() > 0.86) continue;
        const px = b * bl + up / 2 + (bl - up) * (k + 0.5) / 3;
        const PP = P.clone().multiply(M(px + jit(0.02), lv, depth / 2 + jit(0.03), PI / 2 + jit(0.015)));
        pallet(B, PP, palletColor());
        const maxH = li < levels.length - 1 ? levels[li + 1] - lv - 0.32 : 1.2;
        cartonLoad(B, PP, Math.min(maxH, rand() < 0.5 ? 0.9 : 1.2));
      }
    });
  }
}

function glassOfBeer(B, P, x, y, z) {
  B.cyl('glass', P, x, y + 0.08, z, 0.04, 0.16, { seg: 14 });
  B.cyl('beer', P, x, y + 0.06, z, 0.036, 0.11, { seg: 14 });
  B.cyl('foam', P, x, y + 0.125, z, 0.036, 0.025, { seg: 14 });
}
function bottle(B, P, x, y, z) {
  const key = rand() < 0.5 ? 'bottleGreen' : 'bottleBrown';
  B.cyl(key, P, x, y + 0.1, z, 0.032, 0.2, { seg: 12 });
  B.cyl(key, P, x, y + 0.235, z, 0.013, 0.07, { seg: 8 });
  B.cyl('steel', P, x, y + 0.272, z, 0.015, 0.006, { seg: 8 });
}

function stehtisch(B, x, z) {
  const pts = [[0, 0.003], [0.3, 0.003], [0.33, 0.02], [0.2, 0.08], [0.09, 0.2], [0.066, 0.4], [0.062, 0.62], [0.08, 0.78],
    [0.16, 0.9], [0.3, 0.99], [0.395, 1.05], [0.405, 1.085], [0.39, 1.103], [0, 1.106]].map(([r, y]) => new THREE.Vector2(r, y));
  B.add(new THREE.LatheGeometry(pts, 40), 'fabricWhite', M(x, 0, z, rand() * PI), { uv: false });
  const P = M(x, 0, z);
  const n = Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) { const a = rand() * 2 * PI, r = 0.12 + rand() * 0.18; (rand() < 0.6 ? glassOfBeer : bottle)(B, P, Math.cos(a) * r, 1.106, Math.sin(a) * r); }
}

// Bierzeltgarnitur: Tisch 220 × 50 cm, 2 Bänke; lokale x = Länge
function bierbank(B, P) {
  const legs = (y, w, x) => {
    for (const s of [-1, 1]) B.rod('steel', P, [x, y, s * w * 0.4], [x, 0.01, s * w * 0.55], 0.011);
    B.rod('steel', P, [x, 0.06, -w * 0.53], [x, 0.06, w * 0.53], 0.008);
    B.rod('steel', P, [x, y, -w * 0.4], [x, y, w * 0.4], 0.009);
  };
  B.box('beerWood', P, 0, 0.765, 0, 2.2, 0.03, 0.5, { local: true });
  for (const x of [-0.85, 0.85]) legs(0.75, 0.5, x);
  for (const s of [-1, 1]) {
    B.box('beerWood', P, 0, 0.465, s * 0.48, 2.2, 0.03, 0.25, { local: true });
    for (const x of [-0.85, 0.85]) {
      B.rod('steel', P, [x, 0.45, s * 0.48 - 0.08], [x, 0.01, s * 0.48 - 0.11], 0.01);
      B.rod('steel', P, [x, 0.45, s * 0.48 + 0.08], [x, 0.01, s * 0.48 + 0.11], 0.01);
    }
  }
  const n = Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) glassOfBeer(B, P, jit(0.9), 0.78, jit(0.15));
}

function chainBarrier(B, poly) {
  const pts = poly.map(([x, y]) => new THREE.Vector2(L.X(x), L.Z(y)));
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1], len = a.distanceTo(b), n = Math.max(1, Math.ceil(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      B.cyl('postStripe', I, p.x, 0.5, p.y, 0.022, 0.95, { uv: false, seg: 10 });
      B.cyl('rubber', I, p.x, 0.025, p.y, 0.16, 0.05, { seg: 16 });
      B.cyl('rubber', I, p.x, 0.985, p.y, 0.03, 0.03, { seg: 10 });
      if (i === n) continue;
      const q = a.clone().lerp(b, (i + 1) / n), seg = p.distanceTo(q), sag = 0.07 * seg;
      const cpts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, v = p.clone().lerp(q, t);
        cpts.push(new THREE.Vector3(v.x, 0.9 - 4 * sag * t * (1 - t), v.y));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 16, 0.011, 5, false);
      const uv = tube.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * seg * 5);
      B.add(tube, 'chain', I, { uv: false });
      if ((i + s) % 2 === 0) {
        const mid = p.clone().lerp(q, 0.5), d = q.clone().sub(p).normalize();
        B.plane('sign', I, mid.x, 0.9 - sag - 0.11, mid.y, 0.34, 0.17, { ry: Math.atan2(d.y, -d.x) }); // Normale senkrecht zur Kette
      }
    }
  }
}

// Wand entlang einer Achse mit Öffnungen. Linie (x0,z0)-(x1,z1) achsparallel, Öffnungen {c, w, h} in m entlang der Wand
function wall(B, key, x0, z0, x1, z1, t, h, openings = [], capKey = 'cutCap', capLift = 0) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const s0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), s1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const fixed = alongX ? z0 : x0;
  const piece = (a, b, y0, y1) => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return;
    const c = (a + b) / 2, len = b - a, hh = y1 - y0;
    if (alongX) B.box(key, I, c, y0 + hh / 2, fixed, len, hh, t); else B.box(key, I, fixed, y0 + hh / 2, c, t, hh, len);
  };
  const ops = openings.map((o) => ({ a: o.c - o.w / 2, b: o.c + o.w / 2, h: o.h, y0: o.y0 ?? 0 })).sort((p, q) => p.a - q.a);
  let cur = s0;
  for (const o of ops) { piece(cur, o.a, 0, h); piece(o.a, o.b, 0, o.y0); piece(o.a, o.b, o.h, h); cur = o.b; }
  piece(cur, s1, 0, h);
  const c = (s0 + s1) / 2, len = s1 - s0;
  if (alongX) B.box(capKey, I, c, h + 0.004 + capLift, fixed, len, 0.008, t + 0.004);
  else B.box(capKey, I, fixed, h + 0.004 + capLift, c, t + 0.004, 0.008, len);
}

// Gitter des Hundegeheges (Wand entlang z), mit geschlossener Gittertür
function fence(B, wd) {
  const x = L.X(wd.a[0]), z0 = L.Z(wd.a[1]) + 0.06, z1 = L.Z(wd.b[1]) - 0.06, h = L.MAX.fenceH;
  const g0 = L.Z(wd.gate.at) - wd.gate.w / 2, g1 = L.Z(wd.gate.at) + wd.gate.w / 2;
  for (const z of [z0, g0, g1, z1]) B.box('steelDark', I, x, h / 2, z, 0.05, h, 0.05);
  for (const y of [0.06, h - 0.02]) B.box('steelDark', I, x, y, (z0 + z1) / 2, 0.035, 0.035, z1 - z0);
  for (let z = z0 + 0.09; z < z1 - 0.04; z += 0.09) B.rod('steelDark', I, [x, 0.06, z], [x, h - 0.02, z], 0.007, { seg: 6 });
  // Gittertür: Rahmen, Scharniere, Riegel
  for (const y of [0.35, h - 0.25]) B.box('steel', I, x, y, g0 + 0.02, 0.07, 0.08, 0.03);
  B.box('steelDark', I, x, 0.6, (g0 + g1) / 2, 0.03, 0.03, g1 - g0 - 0.06);
  B.box('steel', I, x - 0.03, 0.95, g1 - 0.07, 0.03, 0.05, 0.12);
}

function officeChair(B, C, seat = 'fabricGrey') {
  B.box(seat, C, 0, 0.48, 0, 0.5, 0.07, 0.48);
  B.box(seat, C, 0, 0.82, 0.24, 0.46, 0.55, 0.06, { rx: 0.08 });
  B.cyl('steelDark', C, 0, 0.27, 0, 0.025, 0.42);
  for (let k = 0; k < 5; k++) { const a = k * 2 * PI / 5; B.rod('steelDark', C, [0, 0.07, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.018); B.cyl('rubber', C, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3, 0.025, 0.04); }
}

function desk(B, x, z, ry, { monitors = 1, chair = 'fabricGrey', top = 'deskTop', legs = 'steelDark' } = {}) {
  const P = M(x, 0, z, ry);
  B.box(top, P, 0, 0.735, 0, 1.6, 0.03, 0.8);
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.35, 0.35]) B.box(legs, P, sx, 0.36, sz, 0.05, 0.72, 0.05);
  for (let i = 0; i < monitors; i++) {
    const mx = (i - (monitors - 1) / 2) * 0.62;
    B.box('blackPlastic', P, mx, 0.76, -0.22, 0.2, 0.02, 0.15);
    B.box('blackPlastic', P, mx, 0.88, -0.25, 0.04, 0.24, 0.03);
    B.box('blackPlastic', P, mx, 1.06, -0.24, 0.6, 0.36, 0.03);
    B.box('screen', P, mx, 1.06, -0.224, 0.57, 0.33, 0.004);
  }
  if (monitors) B.box('blackPlastic', P, 0, 0.755, 0.1, 0.44, 0.015, 0.14);
  if (chair) officeChair(B, P.clone().multiply(M(jit(0.2), 0, 0.65, jit(0.5))), chair);
}

// Fenster in einer Wandöffnung. P: Mitte Brüstung, lokale x entlang der Wand, lokale +z zeigt in den Raum
function windowUnit(B, P, w, h, wallT, kind) {
  const f = 0.06;
  for (const y of [f / 2, h - f / 2]) B.box('doorWhite', P, 0, y, 0, w, f, 0.08);
  for (const x of [-w / 2 + f / 2, w / 2 - f / 2]) B.box('doorWhite', P, x, h / 2, 0, f, h, 0.08);
  const sashes = w > 1.2 ? 2 : 1;
  if (sashes === 2) B.box('doorWhite', P, 0, h / 2, 0, 0.09, h, 0.08);
  for (let i = 0; i < sashes; i++) {
    const sw = w / sashes, sx = -w / 2 + sw * (i + 0.5);
    for (const y of [0.1, h - 0.1]) B.box('doorWhite', P, sx, y, 0.01, sw - 0.12, 0.07, 0.06);
    for (const d of [-1, 1]) B.box('doorWhite', P, sx + d * (sw / 2 - 0.09), h / 2, 0.01, 0.07, h - 0.2, 0.06);
    B.box(kind === 'frosted' ? 'frosted' : 'glass', P, sx, h / 2, 0, sw - 0.2, h - 0.24, 0.012);
    B.box('steel', P, sx + (i ? -1 : 1) * (sw / 2 - 0.1), h / 2, 0.06, 0.025, 0.12, 0.03);
  }
  if (kind === 'awning') B.plane('awning', P, 0, h / 2, -wallT / 2 - 0.03, w - 0.1, h - 0.1);
  B.box('cabinet', P, 0, -0.015, wallT / 2 + 0.09, w + 0.1, 0.03, 0.2);
  B.box('cabinet', P, 0, -0.5, wallT / 2 + 0.06, w - 0.2, 0.55, 0.08, { color: 0xf6f6f2 });
  for (let x = -w / 2 + 0.16; x < w / 2 - 0.12; x += 0.05) B.box('cabinet', P, x, -0.5, wallT / 2 + 0.105, 0.012, 0.5, 0.01, { color: 0xdadad4 });
}

// Tür in einer Einbauwand. P: Anfang der Öffnung am Boden, lokale x entlang der Wand, lokale z = Wandnormale
function door(B, P, d, tt) {
  const w = d.w, h = d.h, zarge = d.type === 'double' ? 'frame' : d.type ? 'anthracite' : 'frame';
  for (const x of [-0.02, w + 0.02]) B.box(zarge, P, x, h / 2 + 0.005, 0, 0.04, h + 0.01, tt + 0.03);
  if (d.type) B.box(zarge, P, w / 2, h - 0.02, 0, w + 0.08, 0.04, tt + 0.03);
  if (d.transom) {
    B.box(zarge, P, w / 2, 2.07, 0, w, 0.05, tt + 0.02);
    B.box('frosted', P, w / 2, (2.1 + h - 0.04) / 2, 0, w - 0.02, h - 2.14, 0.015, { color: d.type === 'double' ? 0xc7dbe8 : 0xffffff });
  }
  if (d.type === 'double') {
    for (const k of [0, 1]) {
      const cx = w / 4 + k * w / 2, lw = w / 2 - 0.01;
      for (const y of [0.05, 2.0]) B.box('frame', P, cx, y, 0, lw, 0.1, 0.05);
      for (const x of [cx - lw / 2 + 0.04, cx + lw / 2 - 0.04]) B.box('frame', P, x, 1.025, 0, 0.08, 2.05, 0.05);
      B.box('frosted', P, cx, 1.025, 0, lw - 0.14, 1.86, 0.02, { color: 0xbfd6e6 });
    }
    for (const s of [-1, 1]) B.add(new THREE.TorusGeometry(0.11, 0.013, 8, 32), 'greenHandle', P.clone().multiply(M(w / 2, 1.05, s * 0.06)), { uv: false });
    B.box('rubber', P, w / 2, 0.008, 0.65, 1.0, 0.012, 0.65);
    return;
  }
  if (d.type === 'sliding') {
    const zs = -(tt / 2 + 0.035), cx = w / 2 - 0.7 * w, lw = w + 0.08;
    B.box('anthracite', P, w / 2 - 0.35 * w, 2.13, zs - 0.01, 2 * w, 0.07, 0.05);
    for (const y of [0.04, 2.03]) B.box('anthracite', P, cx, y, zs, lw, 0.08, 0.04);
    for (const x of [cx - lw / 2 + 0.03, cx + lw / 2 - 0.03]) B.box('anthracite', P, x, 1.035, zs, 0.06, 2.07, 0.04);
    B.box('fluted', P, cx, 1.035, zs, lw - 0.1, 1.92, 0.015, { uv: false });
    B.cyl('steel', P, cx + lw / 2 - 0.12, 1.05, zs - 0.03, 0.03, 0.03, { rx: PI / 2, seg: 16 });
    return;
  }
  // Drehflügel offen (~95°)
  const DP = P.clone().multiply(M(0.02, 0, tt / 2, 0.08));
  const lw = w - 0.06;
  if (d.type === 'glass') {
    for (const y of [0.06, 1.93]) B.box('anthracite', DP, 0.02, y, lw / 2, 0.045, 0.12, lw);
    for (const z of [0.04, lw - 0.04]) B.box('anthracite', DP, 0.02, 1.0, z, 0.045, 1.98, 0.08);
    B.box('frosted', DP, 0.02, 1.0, lw / 2, 0.02, 1.76, lw - 0.16, { color: 0xd3e2ea });
  } else {
    B.box(d.type ? 'anthracite' : 'doorWhite', DP, 0.02, 1.0, lw / 2, 0.04, 1.98, lw);
  }
  B.box(d.type === 'steel' ? 'blackPlastic' : 'steel', DP, 0.06, 1.02, w - 0.14, 0.04, 0.025, 0.12);
}

// Stehtisch-artige Getränkekisten
function crateStack(B, P, x, z, n) {
  const cols = [0x2f5d36, 0x6b3b1d, 0x1e3f73, 0x8a1d1d];
  const c = pick(cols);
  for (let i = 0; i < n; i++) {
    B.box('crate', P, x, 0.15 + i * 0.3, z, 0.4, 0.29, 0.3, { color: c });
    for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 3; bz++) if (i === n - 1) B.cyl('steel', P, x - 0.15 + bx * 0.1, 0.3 + i * 0.3 + 0.01, z - 0.1 + bz * 0.1, 0.013, 0.02, { seg: 6 });
  }
}

// Büro 1: 4er-Bench, Whiteboard, TV, Stütze, Klimageräte, Garderobe, Palettensessel
function buero1(B) {
  const xw = L.X(620) + 0.06, xe = L.X(863) - 0.06, zn = L.Z(690) + 0.06;
  const bx = 17.6, bz = 17.75, opt = { monitors: 2, chair: 'fabricBlue', legs: 'cabinet' };
  for (const dx of [-0.8, 0.8]) { desk(B, bx + dx, bz - 0.4, PI, opt); desk(B, bx + dx, bz + 0.4, 0, opt); }
  B.box('fabricGrey', I, bx, 1.0, bz, 3.2, 0.5, 0.03);
  B.cyl('cabinet', I, 19.5, L.ROOM_WALL_H / 2, bz, 0.07, L.ROOM_WALL_H, { seg: 16 });
  // Whiteboard an der Nordwand
  B.box('steel', I, 19.35, 1.6, zn + 0.012, 1.55, 0.95, 0.02);
  B.box('whiteboard', I, 19.35, 1.6, zn + 0.024, 1.49, 0.89, 0.006);
  B.box('steel', I, 19.35, 1.11, zn + 0.05, 1.0, 0.02, 0.07);
  // TV auf Rollständer
  {
    const P = M(19.75, 0, 16.95, -PI / 2);
    for (const a of [0, PI / 2, PI, -PI / 2]) B.rod('steelDark', P, [0, 0.06, 0], [Math.cos(a) * 0.35, 0.06, Math.sin(a) * 0.35], 0.02, { square: true });
    B.box('steelDark', P, 0, 0.8, 0, 0.08, 1.5, 0.05);
    B.box('blackPlastic', P, 0, 1.35, -0.05, 1.1, 0.64, 0.05);
    B.box('screen', P, 0, 1.35, -0.076, 1.06, 0.6, 0.004);
  }
  // Split-Klimageräte an der Westwand
  for (const [y, z] of [[2.45, 17.3], [2.1, 18.4]]) B.box('cabinet', I, xw + 0.11, y, z, 0.22, 0.28, 0.85, { color: 0xfbfbf9 });
  // Sideboard, Garderobenständer
  B.box('cabinet', I, xw + 0.23, 0.55, 18.35, 0.45, 1.1, 0.8);
  {
    const P = M(xw + 0.35, 0, 17.35);
    B.cyl('steelDark', P, 0, 0.9, 0, 0.02, 1.8);
    for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3; B.rod('steelDark', P, [0, 0.35, 0], [Math.cos(a) * 0.32, 0.01, Math.sin(a) * 0.32], 0.012); }
    for (let k = 0; k < 6; k++) {
      const a = k * PI / 3, tip = [Math.cos(a) * 0.2, 1.75, Math.sin(a) * 0.2];
      B.rod('steelDark', P, [0, 1.6, 0], tip, 0.01);
      B.cyl('wood', P, tip[0], tip[1] + 0.02, tip[2], 0.022, 0.04, { seg: 10 });
    }
  }
  // Palettensessel in der Ecke
  {
    const P = M(15.3, 0, 18.85);
    pallet(B, P, palletColor());
    pallet(B, P.clone().multiply(M(0, 0.144, 0)), palletColor());
    B.box('fabricGrey', P, 0, 0.35, 0.02, 1.15, 0.12, 0.76, { color: 0x6e7174 });
    B.box('fabricGrey', P, 0, 0.6, 0.33, 1.15, 0.4, 0.14, { color: 0x6e7174 });
    B.box('blackCloth', P, 0.25, 0.55, 0.2, 0.42, 0.38, 0.12, { rx: -0.2 });
  }
  B.box('cabinet', I, xe - 0.3, 0.3, 16.6, 0.5, 0.6, 0.4, { color: 0xeeeeea });
}

// Ruheraum: Holzlamellenwand, Schreibtisch vor dem Fenster, Palettentisch
function ruheraum(B) {
  const x0 = L.X(716) + 0.06, x1 = L.X(863), zn = L.Z(320) + 0.06;
  B.box('slats', I, (x0 + x1) / 2, L.ROOM_WALL_H / 2, zn + 0.012, x1 - x0, L.ROOM_WALL_H, 0.024);
  desk(B, 19.4, zn + 0.42, 0, { chair: 'blackCloth', top: 'cabinet', legs: 'cabinet' });
  officeChair(B, M(18.75, 0, zn + 1.25, 2.3), 'blackCloth');
  const P = M(17.65, 0, zn + 0.95);
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.35, 0.35]) B.box('steel', P, sx, 0.3, sz, 0.04, 0.6, 0.04);
  pallet(B, P.clone().multiply(M(0, 0.6, 0)), palletColor());
  B.box('blackPlastic', P, 0, 0.76, 0, 1.22, 0.03, 0.82);
}

// Gang: Getränkeregal mit schräg eingehängten Kisten, Gelber Sack, Wasserkiste, Kallax
function gangAusstattung(B) {
  const q = L.R(L.GETRAENKEREGAL), xw = L.X(620) + 0.06;
  const cols = [[0xb3261e, 0xf2b705, 0x1e4fa0], [0xb3261e, 0x1e4fa0, 0x1e4fa0]];
  cols.forEach((col, ci) => {
    const z = q.z0 + 0.3 + ci * 0.5;
    for (const dz of [-0.24, 0.24]) {
      B.rod('steel', I, [xw + 0.05, 0.02, z + dz], [xw + 0.05, 1.55, z + dz], 0.012);
      B.rod('steel', I, [xw + 0.38, 0.02, z + dz], [xw + 0.3, 1.45, z + dz], 0.012);
    }
    col.forEach((c, li) => {
      const C = M(xw + 0.22, 0.25 + li * 0.48, z, 0, 0, 0.55);
      B.box('crate', C, 0, 0.15, 0, 0.3, 0.3, 0.42, { color: c });
      for (let bx = 0; bx < 3; bx++) for (let bz = 0; bz < 4; bz++) B.cyl('bottleBrown', C, -0.09 + bx * 0.09, 0.32, -0.15 + bz * 0.1, 0.012, 0.08, { seg: 6 });
    });
  });
  B.box('kraft', I, xw + 0.5, 0.17, q.z0 + 0.55, 0.36, 0.34, 0.4);
  B.box('kraft', I, xw + 0.5, 0.15, q.z0 + 0.98, 0.32, 0.3, 0.36);
  // Gelber Sack, Wasserkiste
  const zs = q.z1 + 0.18;
  B.box('crate', I, xw + 0.2, 0.42, zs, 0.32, 0.78, 0.34, { color: 0xe6dc8c });
  B.box('cabinet', I, xw + 0.2, 0.83, zs, 0.38, 0.05, 0.4);
  B.box('crate', I, xw + 0.2, 0.15, zs + 0.42, 0.4, 0.3, 0.3, { color: 0x1b2a4a });
  for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 3; bz++) B.cyl('glass', I, xw + 0.06 + bx * 0.09, 0.32, zs + 0.32 + bz * 0.1, 0.03, 0.06, { seg: 8 });

  // Kallax 4 × 5 Fächer, Eiche
  const k = L.R(L.KALLAX), oak = { color: 0xdcc59e }, H = 1.82, cw = (k.d - 0.07) / 4, ch = (H - 0.07) / 5;
  for (const z of [k.z0 + 0.0175, k.z1 - 0.0175]) B.box('cabinet', I, k.cx, H / 2, z, k.w, H, 0.035, oak);
  for (const y of [0.0175, H - 0.0175]) B.box('cabinet', I, k.cx, y, k.cz, k.w, 0.035, k.d, oak);
  for (let i = 1; i < 4; i++) B.box('cabinet', I, k.cx, H / 2, k.z0 + 0.035 + i * cw, k.w, H - 0.07, 0.015, oak);
  for (let j = 1; j < 5; j++) B.box('cabinet', I, k.cx, 0.035 + j * ch, k.cz, k.w, 0.015, k.d - 0.07, oak);
  const snacks = [0xd23b2a, 0x2c6e3f, 0xf0c419, 0x3a5fb0, 0x8e44ad, 0xe67e22];
  for (let i = 0; i < 4; i++) {
    const cz = k.z0 + 0.035 + (i + 0.5) * cw;
    for (const j of [0, 1]) B.box('blackCloth', I, k.cx + 0.02, 0.035 + (j + 0.5) * ch, cz, k.w - 0.08, ch - 0.04, cw - 0.04, { color: 0x4a4a4c });
    B.box('cabinet', I, k.cx, 0.04 + 3 * ch + 0.09, cz - 0.05, 0.18, 0.16, 0.1, { color: snacks[i] });
    B.box('cabinet', I, k.cx, 0.04 + 4 * ch + 0.07, cz + 0.06, 0.14, 0.12, 0.12, { color: snacks[i + 2] });
  }
  for (let i = 0; i < 3; i++) B.cyl('blackPlastic', I, k.cx, H + 0.13, k.z0 + 0.3 + i * 0.45, 0.07, 0.26, { seg: 14 });
}

// ---------- Gesamtszene ----------
export function buildScene(scene) {
  const mats = makeMaterials();
  const B = new Batch(mats);
  const W = L.HALL.w, D = L.HALL.d;

  // Böden
  B.add(PLANE, 'asphalt', M(W / 2, -0.02, D / 2, 0, -PI / 2).scale(_s.set(160, 160, 1)));
  B.add(PLANE, 'concrete', M(W / 2, 0, D / 2, 0, -PI / 2).scale(_s.set(W, D, 1)));
  for (const r of L.ROOMS) if (r.floor) { const q = L.R(r.r); B.add(PLANE, r.floor, M(q.cx, 0.006, q.cz, 0, -PI / 2).scale(_s.set(q.w, q.d, 1))); }

  // Hallenwände (angeschnitten)
  const t = 0.2, Hh = L.HALL_WALL_H;
  wall(B, 'panel', -t, -t / 2, W + t, -t / 2, t, Hh);
  wall(B, 'panel', -t, D + t / 2, W + t, D + t / 2, t, Hh);
  wall(B, 'panel', -t / 2, 0, -t / 2, D, t, Hh);
  wall(B, 'panel', W + t / 2, 0, W + t / 2, D, t, Hh, [
    { c: L.EXIT2.z, w: L.EXIT2.w, h: 2.1 }, { c: L.EXIT1.z, w: L.EXIT1.w, h: 2.1 },
    { c: (L.HALLENTOR.z0 + L.HALLENTOR.z1) / 2, w: L.HALLENTOR.z1 - L.HALLENTOR.z0, h: 3.1 },
    ...L.HALL_WINDOWS.map((o) => ({ c: L.Z(o.at), w: o.w, y0: 0.9, h: 2.1 })),
  ]);
  for (const o of L.HALL_WINDOWS) windowUnit(B, M(W + t / 2, 0.9, L.Z(o.at), -PI / 2), o.w, 1.2, t, o.kind);
  // Türen in der Ostwand
  for (const [ex, open] of [[L.EXIT1, true], [L.EXIT2, false]]) {
    const z0 = ex.z - ex.w / 2;
    for (const zz of [z0 - 0.03, z0 + ex.w + 0.03]) B.box('frame', I, W + t / 2, 1.06, zz, t + 0.02, 2.12, 0.06);
    B.box('frame', I, W + t / 2, 2.13, ex.z, t + 0.02, 0.06, ex.w + 0.12);
    const DP = M(W + t, 0, z0, open ? 1.2 : 0);
    B.box('doorSteel', DP, open ? 0.025 : -0.05, 1.03, ex.w / 2 - 0.01, 0.05, 2.04, ex.w - 0.03);
    B.box('steel', DP, open ? -0.02 : -0.11, 1.05, ex.w - 0.12, 0.04, 0.03, 0.14);
    B.plane('exitSign', I, W - 0.01, 2.38, ex.z, 0.42, 0.16, { ry: -PI / 2 });
    B.plane('exitSign', I, W + t + 0.01, 2.38, ex.z, 0.42, 0.16, { ry: PI / 2 });
  }
  B.box('sectional', I, W + 0.06, 1.55, (L.HALLENTOR.z0 + L.HALLENTOR.z1) / 2, 0.06, 3.1, L.HALLENTOR.z1 - L.HALLENTOR.z0);
  B.box('frame', I, W + 0.02, 1.55, L.HALLENTOR.z0 + 0.04, 0.08, 3.1, 0.08);
  B.box('frame', I, W + 0.02, 1.55, L.HALLENTOR.z1 - 0.04, 0.08, 3.1, 0.08);
  B.box('steelDark', I, W - 0.05, 1.2, L.HALLENTOR.z0 - 0.25, 0.08, 0.18, 0.12);

  // Einbau: Wände, Türen
  L.ROOM_WALLS.forEach((wd, i) => {
    if (wd.fence) { fence(B, wd); return; }
    const tt = 0.12;
    const alongX = wd.a[1] === wd.b[1];
    let x0 = L.X(wd.a[0]), z0 = L.Z(wd.a[1]), x1 = L.X(wd.b[0]), z1 = L.Z(wd.b[1]);
    if (alongX) { x0 -= tt / 2; x1 = Math.min(x1 + tt / 2, W); } else { z0 -= tt / 2; z1 += tt / 2; }
    const along = (px) => (alongX ? L.X(px) : L.Z(px));
    const doors = (wd.doors || []).map((d) => ({ ...d, c: along(d.at), h: d.transom || d.type === 'double' ? 2.6 : 2.05 }));
    const windows = (wd.windows || []).map((o) => ({ ...o, c: along(o.at), y0: 0.9, h: 2.1 }));
    wall(B, 'drywall', x0, z0, x1, z1, tt, L.ROOM_WALL_H, [...doors, ...windows], 'cutCap', i * 0.0007);
    for (const d of doors) door(B, alongX ? M(d.c - d.w / 2, 0, z0) : M(x0, 0, d.c - d.w / 2, -PI / 2), d, tt);
    const inward = alongX ? (wd.indoor > 0 ? 0 : PI) : (wd.indoor > 0 ? PI / 2 : -PI / 2);
    for (const o of windows) windowUnit(B, alongX ? M(o.c, 0.9, z0, inward) : M(x0, 0.9, o.c, inward), o.w, 1.2, tt, o.kind);
  });

  // Möblierung Einbau
  desk(B, L.X(690), L.Z(178), 0); desk(B, L.X(800), L.Z(178), 0);
  B.box('cabinet', I, L.X(632), 1.0, L.Z(240), 0.4, 2.0, 1.6);
  buero1(B);
  ruheraum(B);
  // Treppenhaus: gerade Treppe entlang Nordwand (Richtung Westen steigend)
  {
    const steps = 15, x0 = L.X(858), run = 0.21, rise = L.ROOM_WALL_H / steps, z = L.Z(395) + 0.06 + 0.5;
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * rise;
      B.box('stairs', I, x0 - (i + 0.5) * run, h / 2, z, run, h, 1.0);
    }
    B.rod('steel', I, [x0, 0.95, z + 0.5], [x0 - steps * run, L.ROOM_WALL_H + 0.9, z + 0.5], 0.02);
    for (let i = 0; i <= steps; i += 5) B.rod('steel', I, [x0 - i * run, i * rise, z + 0.5], [x0 - i * run, i * rise + 0.92, z + 0.5], 0.015);
  }
  // WCs
  for (const [rx, sinkSide] of [[[716, 790], 0], [[790, 863], 1]]) {
    const cx = L.X((rx[0] + rx[1]) / 2), zS = L.Z(595) - 0.06;
    B.box('ceramic', I, cx, 0.4, zS - 0.38, 0.38, 0.4, 0.55);
    B.box('ceramic', I, cx, 0.65, zS - 0.1, 0.42, 0.5, 0.18);
    B.cyl('ceramic', I, cx, 0.42, zS - 0.42, 0.2, 0.06, { seg: 20, r2: 0.25 });
    const sx = sinkSide ? L.X(rx[1]) - 0.06 - 0.25 : L.X(rx[0]) + 0.06 + 0.25;
    B.box('ceramic', I, sx, 0.85, L.Z(530), 0.45, 0.15, 0.5, { ry: PI / 2 });
  }
  // Küche: weiße Fronten, Holz-Arbeitsplatte, Eiche-Rückwand
  {
    const xw = L.X(716) - 0.06, xk = xw - 0.3, z0 = L.Z(325) + 0.62, z1 = L.Z(432), zc = (z0 + z1) / 2;
    B.box('cabinet', I, xk, 0.43, zc, 0.6, 0.86, z1 - z0, { color: 0xf8f8f4 });
    for (let z = z0 + 0.3; z < z1; z += 0.6) {
      B.box('cabinet', I, xk - 0.3, 0.45, z - 0.3, 0.01, 0.8, 0.005, { color: 0xc8c8c2 });
      B.box('steel', I, xk - 0.33, 0.72, z, 0.02, 0.02, 0.16);
    }
    B.box('steel', I, xk - 0.302, 0.44, zc + 0.15, 0.006, 0.72, 0.58);
    B.box('darkWood', I, xk, 0.88, zc, 0.62, 0.04, z1 - z0);
    B.box('wood', I, xw - 0.006, 1.2, zc, 0.012, 0.6, z1 - z0, { color: 0xe0c9a2 });
    B.box('cabinet', I, xw - 0.18, 1.85, z0 + 0.45, 0.35, 0.7, 0.8, { color: 0xf8f8f4 });
    B.box('cabinet', I, xk, 0.95, z0 - 0.33, 0.62, 1.9, 0.6, { color: 0xdcc39b });
    B.box('steel', I, xk - 0.05, 0.905, z0 + 0.5, 0.42, 0.01, 0.5);
    B.box('steel', I, xk + 0.05, 1.08, zc, 0.35, 0.36, 0.22);
    B.box('blackPlastic', I, xk + 0.02, 1.05, z1 - 0.4, 0.38, 0.28, 0.48);
    B.box('blackPlastic', I, xk + 0.12, 1.1, z0 + 0.15, 0.18, 0.4, 0.14);
  }
  gangAusstattung(B);
  // Gehege Max: Hundekorb und Napf
  {
    const P = M(L.X(800), 0, L.Z(650));
    B.cyl('fabricBrown', P, 0, 0.1, 0, 0.5, 0.2, { seg: 24, r2: 0.38 });
    B.cyl('fabricGrey', P, 0, 0.12, 0, 0.4, 0.2, { seg: 24, r2: 0.29 });
    B.cyl('steel', P, 0.8, 0.035, 0.2, 0.1, 0.07, { seg: 16 });
    B.cyl('water', P, 0.8, 0.065, 0.2, 0.088, 0.008, { seg: 16 });
  }

  // Palettenregale
  L.RACKS.forEach((r) => {
    const q = L.R(r);
    rack(B, M(q.x0, 0, q.z0), q.w, q.d, L.RACK_LEVELS, L.RACK_H, () => true);
  });
  // Regal mit Steh-Brettern (lokale x → Welt-z, lokale z → Welt -x)
  {
    const q = L.R(L.REGAL);
    rack(B, M(q.x1, 0, q.z0, -PI / 2), q.d, q.w, L.REGAL_LEVELS, 5.4, (li) => li > 0);
    const front = q.x0;
    L.STEHBRETTER.forEach((sr) => {
      const s = L.R(sr), len = s.d - 0.06;
      B.box('beerWood', I, front - 0.17, 1.125, s.cz, 0.42, 0.035, len, { local: true });
      for (const dz of [-len / 2 + 0.2, len / 2 - 0.2]) {
        B.box('steelDark', I, front + 0.01, 1.08, s.cz + dz, 0.05, 0.1, 0.04);
        B.rod('steelDark', I, [front - 0.3, 1.105, s.cz + dz], [front - 0.01, 0.82, s.cz + dz], 0.012, { square: true });
      }
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) (rand() < 0.5 ? glassOfBeer : bottle)(B, I, front - 0.2 + jit(0.08), 1.143, s.cz + jit(len / 2 - 0.15));
    });
  }

  // Mondi Pap Paletten: je 3 Europaletten nebeneinander
  L.MONDI.forEach((r) => {
    const q = L.R(r);
    for (let k = -1; k <= 1; k++) {
      const PP = M(q.cx + k * 0.81 + jit(0.02), 0, q.cz + jit(0.04), PI / 2 + jit(0.03));
      pallet(B, PP, palletColor());
      sheetLoad(B, PP, 0.95 + rand() * 0.3);
    }
  });

  // Absperrung Logistikbereich
  L.BARRIERS.forEach((p) => chainBarrier(B, p));

  // Bar
  {
    const q = L.R(L.BAR), P = M(q.cx, 0, q.cz);
    B.box('darkWood', P, -0.06, 0.52, 0, 0.6, 1.04, q.d, { local: true });
    B.box('beerWood', P, 0.02, 1.06, 0, 0.82, 0.04, q.d + 0.06, { local: true });
    B.box('steelDark', P, 0.25, 0.06, 0, 0.04, 0.12, q.d - 0.04);
    B.cyl('steel', P, -0.05, 1.3, 0.1, 0.04, 0.48);
    B.box('steel', P, -0.05, 1.5, 0.1, 0.1, 0.08, 0.32);
    for (const dz of [-0.08, 0.1, 0.28]) {
      B.rod('steel', P, [-0.02, 1.47, dz], [0.06, 1.44, dz], 0.008);
      B.cyl('blackPlastic', P, -0.02, 1.58, dz, 0.012, 0.12);
    }
    for (let i = 0; i < 6; i++) glassOfBeer(B, P, 0.18 + jit(0.08), 1.08, -0.6 + i * 0.17 + jit(0.03));
    B.box('steelDark', P, -0.06, 1.09, -0.75, 0.3, 0.02, 0.2);
  }

  // Getränkewagen (Kühlanhänger, Türen zur Bar geöffnet)
  {
    const q = L.R(L.GETRAENKEWAGEN), P = M(q.cx, 0, q.cz);
    const bx = 0.24, bl = 1.55, bw = 1.18, by = 0.5, bh = 1.75;
    B.box('trailerWhite', P, bx, by + bh / 2, 0, bl, bh, bw);
    B.box('steelDark', P, bx, by - 0.06, 0, bl, 0.12, bw - 0.1);
    B.box('steel', P, bx, by + bh + 0.01, 0, bl + 0.02, 0.03, bw + 0.02);
    const ex = bx + bl / 2;
    B.box('steelDark', P, ex + 0.003, by + bh / 2, 0, 0.004, bh - 0.12, bw - 0.12);
    const cols = [0x2f5d36, 0x6b3b1d, 0x1e3f73, 0x7f1c1c];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) B.box('crate', P, ex - 0.02, by + 0.2 + j * 0.3, -0.38 + i * 0.38, 0.06, 0.28, 0.36, { color: pick(cols) });
    for (const s of [-1, 1]) {
      const DP = P.clone().multiply(M(ex, 0, s * bw / 2, s > 0 ? 0 : 0));
      B.box('trailerWhite', DP, 0.28, by + bh / 2, -s * 0.02, 0.56, bh - 0.06, 0.035);
      B.cyl('tire', P, bx - 0.05, 0.27, s * 0.68, 0.27, 0.17, { rx: PI / 2, seg: 24 });
      B.cyl('steel', P, bx - 0.05, 0.27, s * 0.77, 0.15, 0.01, { rx: PI / 2, seg: 16 });
      B.box('steelDark', P, bx - 0.05, 0.58, s * 0.68, 0.7, 0.03, 0.22);
      B.rod('steelDark', P, [bx - bl / 2, by - 0.08, s * 0.45], [-1.0, 0.45, 0], 0.03, { square: true });
    }
    B.cyl('steelDark', P, -1.0, 0.45, 0, 0.045, 0.08);
    B.cyl('steelDark', P, -0.75, 0.28, 0, 0.025, 0.4);
    B.cyl('tire', P, -0.75, 0.06, 0, 0.06, 0.05, { rx: PI / 2 });
    crateStack(B, P, -1.3, -0.35, 3);
    crateStack(B, P, -1.3, 0.35, 4);
  }

  // Musik (DJ-Tisch, Lautsprecher auf Stativ)
  {
    const q = L.R(L.MUSIK), P = M(q.cx, 0, q.cz);
    B.box('blackCloth', P, 0.5, 0.45, 0, 0.7, 0.9, 1.25);
    B.box('blackPlastic', P, 0.48, 0.93, 0.05, 0.38, 0.06, 0.68);
    for (const dz of [-0.17, 0.27]) B.cyl('steelDark', P, 0.48, 0.965, dz, 0.07, 0.008, { seg: 20 });
    B.box('steel', P, 0.42, 0.91, -0.45, 0.26, 0.015, 0.34, { color: 0x999999 });
    B.box('steel', P, 0.31, 1.03, -0.45, 0.015, 0.24, 0.34, { rz: -0.25, color: 0x999999 });
    B.box('blackCloth', P, -0.4, 0.3, 0.2, 0.55, 0.6, 0.55);
    for (const s of [-1, 1]) {
      const S = P.clone().multiply(M(1.05, 0, s * 0.55));
      for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3 + 0.4; B.rod('steelDark', S, [0, 0.75, 0], [Math.cos(a) * 0.32, 0.0, Math.sin(a) * 0.32], 0.012); }
      B.rod('steelDark', S, [0, 0.55, 0], [0, 1.55, 0], 0.018);
      B.box('blackPlastic', S, 0, 1.85, 0, 0.36, 0.58, 0.34);
      B.box('grille', S, 0.183, 1.85, 0, 0.006, 0.52, 0.3);
    }
  }

  // Fotobox (Fotowand im Westen, Box mit Ringlicht im Osten)
  {
    const q = L.R(L.FOTOBOX);
    const bx = q.x0 + 0.12;
    for (const s of [-1, 1]) {
      B.cyl('steelDark', I, bx, 1.1, q.cz + s * 0.82, 0.015, 2.2);
      B.cyl('steelDark', I, bx, 0.02, q.cz + s * 0.82, 0.18, 0.03, { seg: 3 });
    }
    B.cyl('steelDark', I, bx, 2.2, q.cz, 0.015, 1.7, { rx: PI / 2 });
    B.box('sequin', I, bx + 0.03, 1.12, q.cz, 0.01, 2.05, 1.6);
    const P = M(q.x1 - 0.25, 0, q.cz, PI / 2); // lokale -z = Front Richtung Fotowand (Westen)
    B.box('cabinet', P, 0, 0.65, 0, 0.32, 1.3, 0.32);
    B.box('cabinet', P, 0, 1.55, 0.02, 0.44, 0.52, 0.26);
    B.box('screen', P, 0, 1.44, -0.112, 0.36, 0.22, 0.004);
    B.box('blackPlastic', P, 0, 1.68, -0.13, 0.09, 0.09, 0.04);
    B.add(new THREE.TorusGeometry(0.1, 0.013, 8, 32), 'ringLight', P.clone().multiply(M(0, 1.68, -0.115)), { uv: false });
    B.box('cabinet', P, 0.45, 0.4, 0.2, 0.4, 0.8, 0.35, { color: 0xcf3b6f });
  }

  // 5 Stehtische
  L.STEHTISCHE.forEach(([x, z]) => stehtisch(B, x, z));

  // 6 Bierbank-Garnituren
  L.BIERBAENKE.forEach((q) => bierbank(B, M(q.cx, 0, q.cz, PI / 2)));

  // Grill-Pavillon draußen
  {
    const q = L.GRILL, P = M(q.cx, 0, q.cz), pw = 4.6, pd = 3.1, ph = 2.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.box('steel', P, sx * (pw / 2 - 0.03), ph / 2, sz * (pd / 2 - 0.03), 0.04, ph, 0.04);
      B.box('steelDark', P, sx * (pw / 2 - 0.03), 0.01, sz * (pd / 2 - 0.03), 0.16, 0.02, 0.16);
      B.rod('steel', P, [sx * (pw / 2 - 0.03), ph - 0.4, sz * (pd / 2 - 0.03)], [sx * (pw / 2 - 0.5), ph, sz * (pd / 2 - 0.03)], 0.012, { square: true });
    }
    for (const sz of [-1, 1]) B.box('canvasWhite', P, 0, ph + 0.12, sz * pd / 2, pw, 0.26, 0.01);
    for (const sx of [-1, 1]) B.box('canvasWhite', P, sx * pw / 2, ph + 0.12, 0, 0.01, 0.26, pd);
    const roof = new THREE.Matrix4().makeTranslation(q.cx, ph + 0.25 + 0.4, q.cz)
      .multiply(new THREE.Matrix4().makeScale(pw + 0.04, 0.8, pd + 0.04)).multiply(new THREE.Matrix4().makeRotationY(PI / 4));
    B.add(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), 'canvasWhite', roof, { uv: false });
    // Rückwand (Wetterseite) nach Norden
    B.box('canvasWhite', P, 0, ph / 2 + 0.05, -pd / 2, pw - 0.1, ph - 0.1, 0.01);

    // Gasgrill
    const G = P.clone().multiply(M(-1.1, 0, -0.75));
    B.box('steelDark', G, 0, 0.45, 0, 0.75, 0.7, 0.5);
    B.box('steel', G, 0, 0.83, 0, 0.75, 0.06, 0.52);
    B.cyl('steelDark', G, 0, 0.88, 0, 0.24, 0.72, { rz: PI / 2, r2: 0.25, seg: 20 });
    for (const s of [-1, 1]) B.box('steel', G, s * 0.6, 0.86, 0, 0.42, 0.03, 0.45);
    B.rod('steel', G, [-0.28, 1.12, 0.3], [0.28, 1.12, 0.3], 0.012);
    for (const s of [-1, 1]) for (const z of [-0.22, 0.22]) B.cyl('tire', G, s * 0.33, 0.05, z, 0.05, 0.04, { rx: PI / 2, seg: 12 });
    B.cyl('gasBottle', G, 0.62, 0.32, 0.3, 0.15, 0.6, { seg: 20 });
    B.cyl('gasBottle', G, 0.62, 0.66, 0.3, 0.07, 0.1, { seg: 12 });

    // Schwenkgrill
    const S = P.clone().multiply(M(1.05, 0, -0.2));
    for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3; B.rod('steelDark', S, [Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8], [0, 1.95, 0], 0.016); }
    B.rod('steelDark', S, [0, 1.95, 0], [0, 0.62, 0], 0.005);
    B.cyl('steel', S, 0, 0.6, 0, 0.38, 0.012, { seg: 32 });
    B.cyl('steelDark', S, 0, 0.17, 0, 0.44, 0.14, { seg: 32, r2: 0.44 });
    B.cyl('ember', S, 0, 0.245, 0, 0.4, 0.02, { seg: 32 });
    for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3 + 0.5; B.rod('steelDark', S, [Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 0.012); }
    for (let k = 0; k < 7; k++) B.add(new THREE.CapsuleGeometry(0.014, 0.12, 4, 8), 'sausage', S.clone().multiply(M(-0.24 + k * 0.08, 0.622, jit(0.08), 0, PI / 2)), { uv: false });

    // Arbeitstisch + Kisten
    const T = P.clone().multiply(M(0.2, 0, 0.95));
    B.box('beerWood', T, 0, 0.765, 0, 2.2, 0.03, 0.5, { local: true });
    for (const x of [-0.85, 0.85]) for (const s of [-1, 1]) B.rod('steel', T, [x, 0.75, s * 0.2], [x, 0.01, s * 0.27], 0.011);
    B.box('steel', T, -0.6, 0.8, 0, 0.5, 0.04, 0.32);
    B.box('cabinet', T, 0.5, 0.8, 0, 0.4, 0.04, 0.3, { color: 0xf0e8d0 });
    crateStack(B, P, 2.0, 1.2, 2);
  }

  const group = new THREE.Group();
  B.build(group);
  scene.add(group);

  // Zonen-Overlay (Farben des Originalplans)
  const zoneMat = new THREE.MeshBasicMaterial({ map: TX.zones(L), transparent: true, opacity: 0.42, depthWrite: false });
  const zones = new THREE.Mesh(new THREE.PlaneGeometry(W, D), zoneMat);
  zones.rotation.x = -PI / 2; zones.position.set(W / 2, 0.015, D / 2);
  zones.visible = false; zones.renderOrder = 2;
  scene.add(zones);

  return { group, zones, mats };
}
