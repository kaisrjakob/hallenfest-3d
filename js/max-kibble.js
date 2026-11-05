import * as THREE from 'three';
import * as L from './layout.js';
import { BOWL_Y, KIBBLE, PI, mesh } from './max-model.js';

const PELLETS_PER_FEED = 14;
const PELLET_FOOD = 0.06;
const BOWL_FULL = 1;
const BOWL_HEAP = 1.35;
const HEAP_H = 0.09;
const STOCK = 12;
const REFILL_DELAY = 20;
const FLOOR_MAX = 300;
const JAR_LEVEL = 0.28;

export function createKibble(scene, feeder, bowl) {
  const [bx, bz] = L.MAX.bowl;
  const A = L.MAX.area;
  const pelletGeo = new THREE.SphereGeometry(0.012, 6, 4);
  const flying = [];
  const floor = new THREE.InstancedMesh(new THREE.SphereGeometry(0.013, 6, 4), KIBBLE, FLOOR_MAX);
  floor.count = 0;
  floor.frustumCulled = false;
  floor.receiveShadow = true;
  scene.add(floor);
  const floorPos = Array.from({ length: FLOOR_MAX }, () => new THREE.Vector3());
  const _m = new THREE.Matrix4();

  let food = 0, stock = STOCK, refillIn = 0, jar = JAR_LEVEL, crankSpin = 0;
  feeder.fill.userData.setLevel(jar);

  const surface = () => BOWL_Y + 0.03 + Math.min(food, BOWL_FULL) * 0.045 + Math.max(0, food - BOWL_FULL) / (BOWL_HEAP - BOWL_FULL) * HEAP_H;

  function feed() {
    crankSpin += 2 * PI;
    if (!stock) return false;
    stock--;
    if (!stock) refillIn = REFILL_DELAY;
    for (let i = 0; i < PELLETS_PER_FEED; i++) flying.push({ delay: 0.25 + i * 0.04, mesh: null, v: new THREE.Vector3(), spill: null });
    return true;
  }

  function spillTarget() {
    const a = Math.random() * PI / 2;
    const r = 0.24 + Math.random() * (0.08 + floor.count * 0.0022);
    return new THREE.Vector3(
      Math.min(bx + Math.cos(a) * r, A.x1 - 0.1),
      0.012 + Math.random() * Math.min(0.05, floor.count * 0.0003),
      Math.max(bz - Math.sin(a) * r, A.z0 + 0.1),
    );
  }

  function addFloor(p) {
    if (floor.count >= FLOOR_MAX) return;
    floorPos[floor.count].copy(p);
    floor.setMatrixAt(floor.count, _m.makeTranslation(p.x, p.y, p.z));
    floor.count++;
    floor.instanceMatrix.needsUpdate = true;
  }

  function removeFloor(i) {
    const last = --floor.count;
    if (i !== last) {
      floorPos[i].copy(floorPos[last]);
      floor.setMatrixAt(i, _m.makeTranslation(floorPos[i].x, floorPos[i].y, floorPos[i].z));
    }
    floor.instanceMatrix.needsUpdate = true;
  }

  function nearestFloor(x, z) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < floor.count; i++) {
      const d = (floorPos[i].x - x) ** 2 + (floorPos[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : floorPos[best];
  }

  function eatFloorAt(x, z, radius, max) {
    let eaten = 0;
    for (let i = floor.count - 1; i >= 0 && eaten < max; i--) {
      if ((floorPos[i].x - x) ** 2 + (floorPos[i].z - z) ** 2 < radius * radius) { removeFloor(i); eaten++; }
    }
    return eaten * PELLET_FOOD;
  }

  function eatBowl(amount) {
    const taken = Math.min(food, amount);
    food -= taken;
    return taken;
  }

  function updateFlying(p, dt) {
    if (p.spill) {
      const s = p.spill;
      s.t = Math.min(1, s.t + dt / s.dur);
      p.mesh.position.lerpVectors(s.from, s.to, s.t);
      p.mesh.position.y += Math.sin(s.t * PI) * 0.12;
      if (s.t < 1) return false;
      addFloor(s.to);
      return true;
    }
    p.v.y -= 9.8 * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    if (p.mesh.position.y > surface()) return false;
    if (food < BOWL_HEAP) { food = Math.min(BOWL_HEAP, food + PELLET_FOOD); return true; }
    p.spill = { from: p.mesh.position.clone(), to: spillTarget(), t: 0, dur: 0.45 + Math.random() * 0.2 };
    return false;
  }

  function update(dt) {
    if (crankSpin > 0) { const s = Math.min(crankSpin, dt * 9); feeder.crank.rotation.x += s; crankSpin -= s; }
    for (let i = flying.length - 1; i >= 0; i--) {
      const p = flying[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (!p.mesh) {
        p.mesh = mesh(pelletGeo, KIBBLE, feeder.chuteEnd.x, feeder.chuteEnd.y, feeder.chuteEnd.z);
        p.v.set(0.35 + Math.random() * 0.25, 0, (Math.random() - 0.5) * 0.25);
        scene.add(p.mesh);
      }
      if (updateFlying(p, dt)) { scene.remove(p.mesh); flying.splice(i, 1); }
    }
    if (refillIn > 0 && (refillIn -= dt) <= 0) stock = STOCK;
    const jarGoal = JAR_LEVEL * stock / STOCK;
    jar += (jarGoal - jar) * Math.min(1, dt * (jarGoal > jar ? 1.5 : 6));
    feeder.fill.userData.setLevel(jar);

    const base = Math.min(food, BOWL_FULL), heap = Math.max(0, food - BOWL_FULL) / (BOWL_HEAP - BOWL_FULL);
    bowl.food.visible = food > 0.01;
    bowl.food.scale.set(0.7 + base * 0.3, Math.max(0.05, base), 0.7 + base * 0.3);
    bowl.food.position.y = 0.006 + base * 0.0225;
    bowl.heap.visible = heap > 0.01;
    bowl.heap.scale.set(0.5 + heap * 0.5, heap * HEAP_H, 0.5 + heap * 0.5);
    bowl.heap.position.y = 0.051 + heap * HEAP_H / 2;
  }

  return {
    feed, update, eatBowl, nearestFloor, eatFloorAt,
    get bowlFood() { return food; },
    get floorCount() { return floor.count; },
    get inFlight() { return flying.length > 0; },
    get empty() { return stock === 0; },
  };
}
