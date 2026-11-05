import * as THREE from 'three';
import * as L from './layout.js';

export const PI = Math.PI;
export const BOWL_Y = 0.28;
export const PIVOT_Y = 0.47;

const std = (color, p = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...p });
const FUR = std(0xa86b32, { roughness: 0.95 });
const FUR_LIGHT = std(0xdcb47c, { roughness: 0.95 });
const FUR_DARK = std(0x6e4120, { roughness: 0.95 });
const BLACK = std(0x0d0d0d, { roughness: 0.25 });
const COLLAR = std(0xc81e28, { roughness: 0.5 });
const STEEL = std(0xc4c8cc, { roughness: 0.28, metalness: 0.9 });
const RED = std(0xc81e28, { roughness: 0.35, metalness: 0.2 });
export const KIBBLE = std(0x7a4a22, { roughness: 0.8 });

export function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Lokale +x = Blickrichtung, Ursprung am Boden. pivot liegt auf Rumpfhöhe, damit Rolle/Seitenlage um die Längsachse drehen.
export function buildDog() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = PIVOT_Y;
  root.add(pivot);
  const body = new THREE.Group();
  body.position.y = -PIVOT_Y;
  pivot.add(body);
  const belly = mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 16), FUR, -0.02, 0.47, 0, 0, 0, PI / 2, [1, 1, 0.92]);
  body.add(belly);
  body.add(mesh(new THREE.SphereGeometry(0.155, 16, 12), FUR_LIGHT, 0.2, 0.45, 0, 0, 0, 0, [1, 1.05, 0.9]));
  body.add(mesh(new THREE.SphereGeometry(0.15, 16, 12), FUR, 0.17, 0.5, 0, 0, 0, 0, [1.05, 1, 0.92]));

  const neck = new THREE.Group();
  neck.position.set(0.28, 0.55, 0);
  body.add(neck);
  neck.add(mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 12), FUR, 0.06, 0.08, 0, 0, 0, -0.65));
  neck.add(mesh(new THREE.TorusGeometry(0.078, 0.013, 8, 20), COLLAR, 0.04, 0.05, 0, PI / 2, 0, -0.65 + PI / 2));
  neck.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 12), STEEL, 0.1, -0.005, 0, 0, 0, PI / 2));
  const head = new THREE.Group();
  head.position.set(0.14, 0.2, 0);
  neck.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.105, 16, 12), FUR, 0, 0, 0, 0, 0, 0, [1.15, 1, 0.95]));
  head.add(mesh(new THREE.CapsuleGeometry(0.055, 0.1, 4, 12), FUR_LIGHT, 0.13, -0.03, 0, 0, 0, PI / 2));
  head.add(mesh(new THREE.SphereGeometry(0.028, 12, 8), BLACK, 0.215, -0.015, 0));
  const ears = [];
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), BLACK, 0.078, 0.035, s * 0.055));
    const ear = mesh(new THREE.BoxGeometry(0.035, 0.13, 0.075), FUR_DARK, -0.02, -0.02, s * 0.1, s * 0.28, 0, 0.1);
    ear.userData.rest = ear.rotation.x;
    head.add(ear);
    ears.push(ear);
  }
  const tongue = mesh(new THREE.BoxGeometry(0.05, 0.008, 0.035), std(0xd9606b, { roughness: 0.4 }), 0.17, -0.075, 0, 0, 0, -0.5);
  head.add(tongue);
  const mouth = new THREE.Group();
  mouth.position.set(0.2, -0.07, 0);
  head.add(mouth);

  const legs = [];
  for (const [fx, side, phase] of [[0.19, 1, 0], [0.19, -1, PI], [-0.21, 1, PI], [-0.21, -1, 0]]) {
    const hip = new THREE.Group();
    hip.position.set(fx, 0.42, side * 0.09);
    hip.userData.phase = phase;
    hip.userData.front = fx > 0;
    hip.add(mesh(new THREE.CapsuleGeometry(0.045, 0.28, 4, 10), fx > 0 ? FUR_LIGHT : FUR, 0, -0.185, 0));
    hip.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), FUR_LIGHT, 0.025, -0.39, 0, 0, 0, 0, [1.4, 0.6, 1]));
    body.add(hip);
    legs.push(hip);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.36, 0.56, 0);
  tail.add(mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), FUR, -0.09, 0.08, 0, 0, 0, 0.95));
  body.add(tail);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 0.55), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0.05, 0.45, 0);
  root.add(hit);

  return { root, pivot, body, belly, neck, head, ears, tongue, mouth, legs, tail, hit };
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff8e8'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#c81e28'; g.lineWidth = 14; g.strokeRect(7, 7, 498, 242);
  g.fillStyle = '#1d2125'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 74px Arial, sans-serif'; g.fillText('MAX FÜTTERN', 256, 98);
  g.font = '40px Arial, sans-serif'; g.fillText('Kurbel drehen', 256, 180);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Futterspender am Gitter (Gangseite), Rutsche durchs Gitter in den Napf
export function buildFeeder() {
  const { x, z } = L.MAX.feeder;
  const g = new THREE.Group();
  const fx = x - 0.16;
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.86, 0.36), STEEL, x - 0.035, 1.32, z));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.24, 0.24), RED, fx, 1.02, z));
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05, clearcoat: 1, depthWrite: false });
  const jar = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 24, 1, true), glass, fx, 1.31, z);
  jar.castShadow = false;
  g.add(jar);
  const fill = mesh(new THREE.CylinderGeometry(0.092, 0.092, 1, 20), KIBBLE, fx, 1.15, z);
  fill.userData.setLevel = (h) => {
    fill.visible = h > 0.004;
    fill.scale.y = Math.max(h, 0.001);
    fill.position.y = 1.145 + h / 2;
  };
  g.add(fill);
  g.add(mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.03, 24), RED, fx, 1.495, z));
  const crank = new THREE.Group();
  crank.position.set(fx - 0.115, 1.02, z);
  crank.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), STEEL, -0.015, 0, 0, 0, 0, PI / 2));
  crank.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.025), STEEL, -0.035, 0.05, 0));
  crank.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), std(0x1d1d1d, { roughness: 0.4 }), -0.065, 0.1, 0, 0, 0, PI / 2));
  g.add(crank);
  const a = new THREE.Vector3(fx + 0.05, 0.9, z), b = new THREE.Vector3(L.MAX.bowl[0] - 0.06, BOWL_Y + 0.25, L.MAX.bowl[1]);
  const chute = mesh(new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 12, 1, true), STEEL, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  chute.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  chute.material = STEEL.clone(); chute.material.side = THREE.DoubleSide;
  g.add(chute);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
  sign.position.set(x - 0.047, 1.8, z);
  sign.rotation.y = -PI / 2;
  g.add(sign);
  return { group: g, crank, fill, chuteEnd: b };
}

export function buildBowl() {
  const [x, z] = L.MAX.bowl;
  const g = new THREE.Group();
  g.position.set(x, BOWL_Y, z);
  const m = STEEL.clone(); m.side = THREE.DoubleSide;
  g.add(mesh(new THREE.BoxGeometry(0.32, BOWL_Y, 0.32), std(0x5b3a22, { roughness: 0.6 }), 0, -BOWL_Y / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.065, 28, 1, true), m, 0, 0.034, 0));
  g.add(mesh(new THREE.CircleGeometry(0.1, 28), m, 0, 0.004, 0, -PI / 2));
  const food = mesh(new THREE.CylinderGeometry(0.105, 0.098, 0.045, 24), KIBBLE, 0, 0.026, 0);
  g.add(food);
  const heap = mesh(new THREE.ConeGeometry(0.125, 1, 24), KIBBLE, 0, 0, 0);
  g.add(heap);
  return { group: g, food, heap };
}

export function buildProps() {
  const ball = mesh(new THREE.SphereGeometry(0.035, 16, 12), std(0xc9e23a, { roughness: 0.9 }));
  const wurst = new THREE.Group();
  wurst.add(mesh(new THREE.CapsuleGeometry(0.022, 0.14, 4, 10), std(0x8a4b24, { roughness: 0.55 }), 0, 0, 0, 0, 0, PI / 2));
  for (const dx of [-0.04, 0, 0.04]) wurst.add(mesh(new THREE.BoxGeometry(0.006, 0.046, 0.046), std(0x3a1c0c), dx, 0, 0, 0.6));
  const pipe = new THREE.Group();
  pipe.add(mesh(new THREE.TorusGeometry(0.07, 0.028, 10, 18, PI / 2), STEEL, 0, 0, 0, PI / 2));
  pipe.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 18), STEEL, 0.07, 0, 0, PI / 2));
  pipe.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 18), STEEL, 0, 0, 0.07, 0, 0, PI / 2));
  return { ball, wurst, pipe };
}
