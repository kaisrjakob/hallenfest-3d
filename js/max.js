// Hund Max im Gehege: läuft Runden, frisst, wenn Besucher am Futterspender kurbeln.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as L from './layout.js';

const PI = Math.PI;
const std = (color, p = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...p });
const FUR = std(0xa86b32, { roughness: 0.95 });
const FUR_LIGHT = std(0xdcb47c, { roughness: 0.95 });
const FUR_DARK = std(0x6e4120, { roughness: 0.95 });
const BLACK = std(0x0d0d0d, { roughness: 0.25 });
const COLLAR = std(0xc81e28, { roughness: 0.5 });
const STEEL = std(0xc4c8cc, { roughness: 0.28, metalness: 0.9 });
const RED = std(0xc81e28, { roughness: 0.35, metalness: 0.2 });
const KIBBLE = std(0x7a4a22, { roughness: 0.8 });
const BOWL_Y = 0.28; // Napf auf Napfständer, damit Max bequem frisst

function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Hund aus Grundkörpern, lokale +x = Blickrichtung, Ursprung am Boden
function buildDog() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 16), FUR, -0.02, 0.47, 0, 0, 0, PI / 2, [1, 1, 0.92]));
  body.add(mesh(new THREE.SphereGeometry(0.155, 16, 12), FUR_LIGHT, 0.2, 0.45, 0, 0, 0, 0, [1, 1.05, 0.9]));
  body.add(mesh(new THREE.SphereGeometry(0.15, 16, 12), FUR, 0.17, 0.5, 0, 0, 0, 0, [1.05, 1, 0.92]));

  const neck = new THREE.Group();
  neck.position.set(0.28, 0.55, 0);
  body.add(neck);
  neck.add(mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 12), FUR, 0.06, 0.08, 0, 0, 0, -0.65));
  neck.add(mesh(new THREE.TorusGeometry(0.078, 0.013, 8, 20), COLLAR, 0.04, 0.05, 0, PI / 2, 0, -0.65 + PI / 2, [1, 1, 1]));
  neck.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 12), STEEL, 0.1, -0.005, 0, 0, 0, PI / 2));
  const head = new THREE.Group();
  head.position.set(0.14, 0.2, 0);
  neck.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.105, 16, 12), FUR, 0, 0, 0, 0, 0, 0, [1.15, 1, 0.95]));
  head.add(mesh(new THREE.CapsuleGeometry(0.055, 0.1, 4, 12), FUR_LIGHT, 0.13, -0.03, 0, 0, 0, PI / 2));
  head.add(mesh(new THREE.SphereGeometry(0.028, 12, 8), BLACK, 0.215, -0.015, 0));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), BLACK, 0.078, 0.035, s * 0.055));
    head.add(mesh(new THREE.BoxGeometry(0.035, 0.13, 0.075), FUR_DARK, -0.02, -0.02, s * 0.1, s * 0.28, 0, 0.1));
  }
  const tongue = mesh(new THREE.BoxGeometry(0.05, 0.008, 0.035), std(0xd9606b, { roughness: 0.4 }), 0.17, -0.075, 0, 0, 0, -0.5);
  head.add(tongue);

  const legs = [];
  for (const [fx, side, phase] of [[0.19, 1, 0], [0.19, -1, PI], [-0.21, 1, PI], [-0.21, -1, 0]]) {
    const hip = new THREE.Group();
    hip.position.set(fx, 0.42, side * 0.09);
    hip.userData.phase = phase;
    hip.add(mesh(new THREE.CapsuleGeometry(0.045, 0.28, 4, 10), fx > 0 ? FUR_LIGHT : FUR, 0, -0.185, 0));
    hip.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), FUR_LIGHT, 0.025, -0.39, 0, 0, 0, 0, [1.4, 0.6, 1]));
    body.add(hip);
    legs.push(hip);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.36, 0.56, 0);
  tail.add(mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), FUR, -0.09, 0.08, 0, 0, 0, 0.95));
  body.add(tail);

  const el = document.createElement('div');
  el.className = 'lbl main';
  el.textContent = 'Max (live)';
  const label = new CSS2DObject(el);
  label.position.set(0, 1.0, 0);
  label.userData.cat = 'main';
  root.add(label);
  return { root, body, neck, head, tongue, legs, tail, label };
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
function buildFeeder() {
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
  fill.userData.setLevel = (h) => { fill.scale.y = h; fill.position.y = 1.145 + h / 2; };
  fill.userData.setLevel(0.28);
  g.add(fill);
  g.add(mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.03, 24), RED, fx, 1.495, z));
  // Kurbel auf der Gangseite
  const crank = new THREE.Group();
  crank.position.set(fx - 0.115, 1.02, z);
  crank.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), STEEL, -0.015, 0, 0, 0, 0, PI / 2));
  crank.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.025), STEEL, -0.035, 0.05, 0));
  crank.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), std(0x1d1d1d, { roughness: 0.4 }), -0.065, 0.1, 0, 0, 0, PI / 2));
  g.add(crank);
  // Rutsche
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

function buildBowl() {
  const [x, z] = L.MAX.bowl;
  const g = new THREE.Group();
  g.position.set(x, BOWL_Y, z);
  const m = STEEL.clone(); m.side = THREE.DoubleSide;
  g.add(mesh(new THREE.BoxGeometry(0.32, BOWL_Y, 0.32), std(0x5b3a22, { roughness: 0.6 }), 0, -BOWL_Y / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.065, 28, 1, true), m, 0, 0.034, 0));
  g.add(mesh(new THREE.CircleGeometry(0.1, 28), m, 0, 0.004, 0, -PI / 2));
  const food = mesh(new THREE.CylinderGeometry(0.105, 0.098, 0.045, 24), KIBBLE, 0, 0.026, 0);
  g.add(food);
  return { group: g, food };
}

export function createMax(scene) {
  const dog = buildDog(), feeder = buildFeeder(), bowl = buildBowl();
  scene.add(dog.root, feeder.group, bowl.group);

  const C = L.MAX.loop, B = L.MAX.bowl;
  const eatPos = new THREE.Vector2(B[0] + 0.48, B[1]);
  const pos = new THREE.Vector2();
  let theta = 0, heading = 0, state = 'circle', target = null;
  let food = 0, fed = 0, stride = 0, time = 0, crankSpin = 0, eatTimer = 0;
  const pellets = [];
  const pelletGeo = new THREE.SphereGeometry(0.012, 6, 4);
  const ellipse = (t, out) => out.set(C.cx + C.rx * Math.cos(t), C.cz + C.rz * Math.sin(t));
  ellipse(theta, pos);

  function turnTowards(goal, dt, rate) {
    let d = goal - heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    return Math.abs(d);
  }

  function walkTo(goal, speed, dt) {
    const d = goal.clone().sub(pos), dist = d.length();
    if (dist < 0.02) return true;
    turnTowards(Math.atan2(-d.y, d.x), dt, 6);
    pos.add(d.normalize().multiplyScalar(Math.min(dist, speed * dt)));
    stride += speed * dt * 9;
    return false;
  }

  function feed() {
    fed++;
    crankSpin = 2 * PI;
    for (let i = 0; i < 14; i++) pellets.push({ delay: 0.25 + i * 0.04, mesh: null, v: new THREE.Vector3() });
    if (state === 'circle' || state === 'back') state = 'toBowl';
    feeder.fill.userData.setLevel(0.28 * (1 - (fed % 15) / 18));
    return fed;
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    time += dt;
    let speed = 0;
    if (state === 'circle') {
      speed = 0.75;
      theta += speed / ((C.rx + C.rz) / 2) * dt;
      ellipse(theta, pos);
      const dx = -C.rx * Math.sin(theta), dz = C.rz * Math.cos(theta);
      heading = Math.atan2(-dz, dx);
      stride += speed * dt * 9;
    } else if (state === 'toBowl') {
      speed = 1.2;
      if (walkTo(eatPos, speed, dt)) state = 'turn';
    } else if (state === 'turn') {
      if (turnTowards(PI, dt, 5) < 0.02) { state = 'eat'; eatTimer = 0; }
    } else if (state === 'eat') {
      eatTimer += dt;
      if (food > 0) food = Math.max(0, food - dt * 0.12);
      else if (eatTimer > 1.2 && !pellets.length) {
        theta = Math.atan2((pos.y - C.cz) / C.rz, (pos.x - C.cx) / C.rx);
        target = ellipse(theta, new THREE.Vector2());
        state = 'back';
      }
    } else if (state === 'back') {
      speed = 0.75;
      if (walkTo(target, speed, dt)) state = 'circle';
    }

    // Pose
    dog.root.position.set(pos.x, 0, pos.y);
    dog.root.rotation.y = heading;
    const moving = speed > 0 || state === 'turn';
    const amp = moving ? (speed > 1 ? 0.6 : 0.45) : 0;
    if (state === 'turn') stride += dt * 6;
    for (const leg of dog.legs) leg.rotation.z = Math.sin(stride + leg.userData.phase) * amp;
    dog.body.position.y = moving ? Math.abs(Math.sin(stride)) * 0.018 : 0;
    const eating = state === 'eat';
    const neckGoal = eating ? -1.2 + Math.sin(time * 9) * 0.07 : Math.sin(stride * 0.5) * 0.04;
    const k = Math.min(1, dt * 6);
    dog.neck.rotation.z += (neckGoal - dog.neck.rotation.z) * k;
    dog.head.rotation.z += ((eating ? -0.5 : 0) - dog.head.rotation.z) * k;
    dog.body.rotation.z += ((eating ? -0.06 : 0) - dog.body.rotation.z) * k;
    dog.tongue.visible = !eating && speed > 1;
    const wag = eating || state === 'toBowl' ? 16 : 7;
    dog.tail.rotation.y = Math.sin(time * wag) * (eating ? 0.7 : 0.4);
    dog.tail.rotation.z = eating ? 0.25 : 0;

    // Kurbel und Futterkugeln
    if (crankSpin > 0) { const s = Math.min(crankSpin, dt * 9); feeder.crank.rotation.x += s; crankSpin -= s; }
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (!p.mesh) {
        p.mesh = mesh(pelletGeo, KIBBLE, feeder.chuteEnd.x, feeder.chuteEnd.y, feeder.chuteEnd.z);
        p.v.set(0.35 + Math.random() * 0.25, 0, (Math.random() - 0.5) * 0.25);
        scene.add(p.mesh);
      }
      p.v.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < BOWL_Y + 0.03 + food * 0.045) {
        scene.remove(p.mesh);
        pellets.splice(i, 1);
        food = Math.min(1, food + 0.06);
      }
    }
    bowl.food.visible = food > 0.01;
    bowl.food.scale.set(0.7 + food * 0.3, Math.max(0.05, food), 0.7 + food * 0.3);
    bowl.food.position.y = 0.006 + food * 0.0225;
  }

  return { update, feed, feeder: feeder.group, label: dog.label, fedCount: () => fed };
}
