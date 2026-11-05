// Hund Max im Gehege: Verhalten als Generatoren, ein Task läuft, Idle wertet Bedürfnisse aus.
import * as THREE from 'three';
import * as L from './layout.js';
import { PI, PIVOT_Y, buildDog, buildFeeder, buildBowl, buildProps } from './max-model.js';
import { createKibble } from './max-kibble.js';
import { createLabel, createBubble, createSound, createMenu } from './max-ui.js';

const A = L.MAX.area, MARGIN = 0.45;
const BOUNDS = { x0: A.x0 + MARGIN, x1: A.x1 - MARGIN, z0: A.z0 + MARGIN, z1: A.z1 - MARGIN };
const LOOP = L.MAX.loop;
const ZOOM = { cx: (BOUNDS.x0 + BOUNDS.x1) / 2 + 0.05, cz: (BOUNDS.z0 + BOUNDS.z1) / 2, rx: (BOUNDS.x1 - BOUNDS.x0) / 2 - 0.05, rz: (BOUNDS.z1 - BOUNDS.z0) / 2 - 0.05 };
const EAT_SPOT = [L.MAX.bowl[0] + 0.48, L.MAX.bowl[1]];
const GATE_SPOT = [BOUNDS.x0 + 0.02, L.MAX.gate[1]];
const DRINK_SPOT = [L.MAX.water[0] - 0.45, L.MAX.water[1]];
const BASKET = L.MAX.basket;
const BASKET_FLOOR = 0.2;
const HURDLES = [[...BASKET, 0.62, 0.3], [...L.MAX.water, 0.3, 0.16]];
const SLEEP_AFTER = 90;
const EAT_BELOW = 1.6;
const KOMA_AT = 2;
const SATIETY_PER_BOWL = 0.5;

const POSTURES = {
  stand: { pitch: 0, lift: 0, roll: 0, front: 0, rear: 0, neck: 0 },
  sit: { pitch: 0.5, lift: -0.03, roll: 0, front: -0.5, rear: 0.55, neck: 0.25 },
  lie: { pitch: 0, lift: -0.3, roll: 0, front: 1.45, rear: 1.35, neck: 0.1 },
  back: { pitch: 0, lift: -0.3, roll: PI, front: 0.5, rear: -0.4, neck: -1.0 },
  side: { pitch: 0, lift: -0.3, roll: PI / 2, front: 0.15, rear: -0.15, neck: -0.3 },
};
const NEUTRAL = { posture: 'stand', neck: null, head: 0, tilt: 0, pitch: 0, wag: 0.4, wagSpeed: 7, tongue: false, chew: false, paw: 0, kick: false, spin: 0, jump: 0 };
const EATING = { neck: -1.2, head: -0.5, pitch: -0.06, wag: 0.7, wagSpeed: 16, chew: true };
const EATING_FLOOR = { neck: -1.45, head: -0.6, pitch: -0.12, wag: 0.7, wagSpeed: 16, chew: true };
const PUFF_GEO = new THREE.SphereGeometry(1, 12, 8);
const MENU = [['pet', 'Streicheln'], ['fetch', 'Ball werfen'], ['sit', 'Sitz'], ['paw', 'Pfote'], ['down', 'Platz'], ['roll', 'Rolle'], ['bang', 'Peng!'], ['bark', 'Gib Laut'], ['sound', 'Ton: aus']];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const chance = (p) => Math.random() < p;

export function createMax(scene, camera, { say = () => {}, calm = false } = {}) {
  const dog = buildDog(), feeder = buildFeeder(), bowl = buildBowl(), props = buildProps();
  scene.add(dog.root, feeder.group, bowl.group);
  const kibble = createKibble(scene, feeder, bowl);
  const label = createLabel(dog.root, calm ? 'Max (live)' : 'Max – antippen');
  const bubble = createBubble(dog.root);
  const sound = createSound();
  const menu = createMenu(MENU, act);

  const pos = new THREE.Vector2(LOOP.cx + LOOP.rx, LOOP.cz);
  const pose = { ...NEUTRAL };
  const cur = { pitch: 0, lift: 0, roll: 0, front: 0, rear: 0, neck: 0, head: 0, tilt: 0, paw: 0, base: 0 };
  let heading = -PI / 2, theta = 0, stride = 0, gait = 0, time = 0, dt = 0;
  let satiety = 0, lastInteraction = 0, tailChaseAt = 40 + Math.random() * 40, lastGreet = -Infinity;
  let earTwitch = 0, tailThump = 0, fed = 0, petTimes = [];
  let task = null, taskName = '', doing = '', locked = false, sleeping = false;
  const puffs = [];
  const _v = new THREE.Vector3();

  const fat = () => clamp(satiety - 1, 0, 1);
  const pace = () => 1 - 0.35 * fat();
  const relax = () => Object.assign(pose, NEUTRAL);
  const angleTo = (x, z) => Math.atan2(-(z - pos.y), x - pos.x);
  const distTo = (x, z) => Math.hypot(x - pos.x, z - pos.y);
  const wantsFood = () => satiety < EAT_BELOW && (kibble.bowlFood > 0.01 || kibble.inFlight || kibble.floorCount > 0);
  const bored = () => !calm && time - lastInteraction > SLEEP_AFTER;

  function start(name, gen) {
    task?.return();
    relax();
    taskName = name;
    task = gen;
  }

  function turnTowards(goal, rate) {
    const d = Math.atan2(Math.sin(goal - heading), Math.cos(goal - heading));
    heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    return Math.abs(d);
  }

  function step(x, z, speed) {
    const dx = x - pos.x, dz = z - pos.y, d = Math.hypot(dx, dz);
    if (d < 0.03) return true;
    turnTowards(Math.atan2(-dz, dx), 6);
    const s = Math.min(d, speed * dt);
    pos.x += dx / d * s;
    pos.y += dz / d * s;
    gait = speed;
    return false;
  }

  function approach(x, z, gap) {
    const dx = pos.x - x, dz = pos.y - z, d = Math.hypot(dx, dz) || 1;
    return [clamp(x + dx / d * gap, BOUNDS.x0, BOUNDS.x1), clamp(z + dz / d * gap, BOUNDS.z0, BOUNDS.z1)];
  }

  function* wait(seconds) { for (let t = 0; t < seconds; t += dt) yield; }
  function* walkTo(x, z, speed = 0.75) { while (!step(x, z, speed * pace())) yield; }
  function* face(angle) { while (turnTowards(angle, 5) > 0.03) { gait = 0.6; yield; } }
  function* faceCamera() { yield* face(angleTo(camera.position.x, camera.position.z)); }

  function* idle() {
    for (;;) {
      if (wantsFood()) yield* eat();
      else if (bored()) yield* sleep();
      else if (!calm && time > tailChaseAt) yield* tailChase();
      else yield* roam();
    }
  }

  function* roam() {
    doing = 'roam';
    theta = Math.atan2((pos.y - LOOP.cz) / LOOP.rz, (pos.x - LOOP.cx) / LOOP.rx);
    yield* walkTo(LOOP.cx + LOOP.rx * Math.cos(theta), LOOP.cz + LOOP.rz * Math.sin(theta));
    while (!wantsFood() && !bored() && (calm || time <= tailChaseAt)) {
      const speed = 0.75 * pace();
      theta += speed / ((LOOP.rx + LOOP.rz) / 2) * dt;
      pos.set(LOOP.cx + LOOP.rx * Math.cos(theta), LOOP.cz + LOOP.rz * Math.sin(theta));
      heading = Math.atan2(-LOOP.rz * Math.cos(theta), -LOOP.rx * Math.sin(theta));
      gait = speed;
      yield;
    }
  }

  function* eat() {
    doing = 'eat';
    let ate = 0;
    const bowlHasFood = () => kibble.bowlFood > 0.01 || kibble.inFlight;
    while (satiety < KOMA_AT && (bowlHasFood() || kibble.floorCount > 0)) {
      if (bowlHasFood()) {
        yield* walkTo(...EAT_SPOT, 1.2);
        yield* face(PI);
        Object.assign(pose, EATING);
        while (satiety < KOMA_AT && bowlHasFood()) {
          const got = kibble.eatBowl(0.12 * dt);
          satiety += got * SATIETY_PER_BOWL;
          ate += got;
          yield;
        }
      } else {
        const { x, z } = kibble.nearestFloor(pos.x, pos.y);
        yield* walkTo(...approach(x, z, 0.42), 1.0);
        yield* face(angleTo(x, z));
        Object.assign(pose, EATING_FLOOR);
        yield* wait(0.7);
        const got = kibble.eatFloorAt(x, z, 0.14, 4);
        satiety += got * SATIETY_PER_BOWL;
        ate += got;
      }
      relax();
    }
    if (satiety >= KOMA_AT) yield* koma();
    else if (ate > 0.3) yield* drink();
  }

  function* drink() {
    doing = 'drink';
    yield* walkTo(...DRINK_SPOT, 0.8);
    yield* face(0);
    Object.assign(pose, EATING_FLOOR, { tongue: true, wag: 0.4, wagSpeed: 7 });
    yield* wait(2.2);
    relax();
  }

  function* intoBasket(speed) {
    yield* walkTo(...BASKET, speed);
    yield* face(PI);
    pose.posture = 'lie';
    yield* wait(0.6);
    Object.assign(pose, { neck: -0.15, head: -0.35, wag: 0 });
  }

  function* snooze(until) {
    sleeping = true;
    try {
      let snoreAt = time + 1;
      while (!until()) {
        if (time > snoreAt) { bubble.show('Zzz', 2.4); sound.snore(); snoreAt = time + 3; }
        yield;
      }
    } finally {
      sleeping = false;
      bubble.clear();
    }
  }

  function* sleep() {
    doing = 'sleep';
    yield* intoBasket(0.6);
    yield* snooze(() => false);
  }

  function* koma() {
    doing = 'koma';
    locked = true;
    try {
      say('Max hat genug – Kugelbauch!');
      bubble.show('BÖÖRP!', 2);
      sound.burp();
      Object.assign(pose, { neck: 0.4, head: 0.3 });
      yield* wait(1.6);
      relax();
      yield* intoBasket(0.5);
      const fartAt = time + 6;
      let farted = false;
      yield* snooze(() => {
        if (!farted && time > fartAt) { farted = true; fart(); }
        return satiety < 1;
      });
      bubble.show('*gähn*', 1.5);
      yield* stretch();
    } finally {
      locked = false;
    }
  }

  function fart() {
    say('Abgaswerte im Gehege überschritten – bitte lüften!');
    bubble.show('*pffrrt*', 2);
    sound.fart();
    dog.tail.getWorldPosition(_v);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(PUFF_GEO, new THREE.MeshBasicMaterial({ color: 0x9ad04f, transparent: true, opacity: 0.45, depthWrite: false }));
      m.position.copy(_v);
      m.userData = { age: -i * 0.12, v: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.12 + Math.random() * 0.12, (Math.random() - 0.5) * 0.25) };
      m.visible = false;
      scene.add(m);
      puffs.push(m);
    }
  }

  function* stretch() {
    relax();
    yield* wait(0.5);
    Object.assign(pose, { pitch: -0.32, neck: 0.3, wag: 0.6 });
    yield* wait(1.0);
    relax();
  }

  function* tailChase() {
    doing = 'chase';
    tailChaseAt = time + 40 + Math.random() * 40;
    Object.assign(pose, { wag: 1, wagSpeed: 22, neck: -0.25, head: 0.35 });
    for (let a = 0; a < 6 * PI; a += 7 * dt) { heading += 7 * dt; gait = 1.3; yield; }
    relax();
    bubble.show('@_@', 1.8);
    for (let t = 0; t < 1.8; t += dt) { pose.spin = Math.sin(t * 7) * 0.12; pose.tilt = Math.sin(t * 5) * 0.4; yield; }
    relax();
  }

  function* zoomies() {
    bubble.show('ZOOMIES!', 1.5);
    let a = Math.atan2((pos.y - ZOOM.cz) / ZOOM.rz, (pos.x - ZOOM.cx) / ZOOM.rx);
    yield* walkTo(ZOOM.cx + ZOOM.rx * Math.cos(a), ZOOM.cz + ZOOM.rz * Math.sin(a), 2.2);
    pose.tongue = true;
    const speed = 3.2 * pace();
    for (const end = a + 6 * PI; a < end;) {
      a += speed / ((ZOOM.rx + ZOOM.rz) / 2) * dt;
      pos.set(ZOOM.cx + ZOOM.rx * Math.cos(a), ZOOM.cz + ZOOM.rz * Math.sin(a));
      heading = Math.atan2(-ZOOM.rz * Math.cos(a), -ZOOM.rx * Math.sin(a));
      gait = speed;
      pose.jump = hurdleJump();
      yield;
    }
    Object.assign(pose, { jump: 0, posture: 'lie', tongue: true, neck: 0.3 });
    bubble.show('*hechel*', 2.5);
    yield* wait(2.5);
  }

  function hurdleJump() {
    let h = 0;
    for (const [x, z, r, height] of HURDLES) {
      const d = distTo(x, z);
      if (d < r) h = Math.max(h, Math.cos(d / r * PI / 2) * height);
    }
    return h;
  }

  function* attention() {
    yield* faceCamera();
    Object.assign(pose, { wag: 0.8, wagSpeed: 15, neck: 0.15, tilt: 0.15 });
    while (menu.isOpen) yield;
  }

  function* greet() {
    yield* walkTo(...GATE_SPOT, 1.6);
    yield* face(PI);
    Object.assign(pose, { wag: 1, wagSpeed: 18, neck: 0.3, head: 0.2 });
    bubble.show('Wuff!', 1.4);
    sound.bark();
    yield* wait(1.6);
  }

  function* pet() {
    yield* faceCamera();
    petTimes = petTimes.filter((t) => time - t < 10);
    petTimes.push(time);
    if (petTimes.length >= 3) {
      petTimes = [];
      bubble.show('♥ ♥ ♥', 3.5);
      Object.assign(pose, { posture: 'back', kick: true, tongue: true, wag: 0.5, wagSpeed: 10 });
      yield* wait(3.5);
      relax();
      yield* wait(0.6);
      return;
    }
    bubble.show('♥', 1.6);
    Object.assign(pose, { tilt: 0.35, head: 0.15, neck: 0.2, wag: 1, wagSpeed: 20, tongue: true });
    yield* wait(1.8);
  }

  function* sit() {
    yield* faceCamera();
    if (chance(0.15)) {
      pose.posture = 'lie';
      bubble.show('… nö.', 2);
      yield* wait(3);
      return;
    }
    Object.assign(pose, { posture: 'sit', wag: 0.6, wagSpeed: 12 });
    yield* wait(3);
  }

  function* paw() {
    yield* faceCamera();
    Object.assign(pose, { posture: 'sit', wag: 0.7, wagSpeed: 12 });
    yield* wait(0.6);
    Object.assign(pose, { paw: 1, tilt: 0.2 });
    yield* wait(2.2);
    pose.paw = 0;
    yield* wait(0.5);
  }

  function* down() {
    yield* faceCamera();
    pose.posture = 'lie';
    yield* wait(3.5);
  }

  function* roll() {
    yield* faceCamera();
    pose.posture = 'lie';
    yield* wait(0.7);
    for (let t = 0; t < 1; t += dt / 1.2) { pose.spin = t * 2 * PI; yield; }
    pose.spin = 0;
    bubble.show('Ta-daa!', 1.4);
    yield* wait(0.8);
  }

  function* bang() {
    yield* faceCamera();
    Object.assign(pose, { neck: 0.35, head: 0.35 });
    yield* wait(0.3);
    Object.assign(pose, { posture: 'side', tongue: true, wag: 0, neck: -0.3, head: 0.3 });
    yield* wait(2.4);
    Object.assign(pose, { wag: 0.25, wagSpeed: 18 });
    bubble.show('(nicht ganz tot)', 1.4);
    yield* wait(1.0);
    relax();
    yield* wait(0.6);
  }

  function* bark() {
    yield* faceCamera();
    bubble.show('Wuff! Wuff!', 1.6);
    sound.bark();
    for (let t = 0; t < 1.4; t += dt) {
      Object.assign(pose, { neck: 0.35, head: Math.sin(t * 24) > 0 ? 0.35 : 0.1, wag: 0.8, wagSpeed: 16 });
      yield;
    }
  }

  function* fetch() {
    const item = chance(0.8) ? 'ball' : chance(0.5) ? 'wurst' : 'pipe';
    const ball = props.ball;
    let tx, tz;
    do {
      tx = BOUNDS.x0 + 0.5 + Math.random() * (BOUNDS.x1 - BOUNDS.x0 - 0.5);
      tz = BOUNDS.z0 + Math.random() * (BOUNDS.z1 - BOUNDS.z0);
    } while (Math.hypot(tx - BASKET[0], tz - BASKET[1]) < 0.6);
    const from = new THREE.Vector3(A.x0 - 0.3, 1.35, L.MAX.gate[1]), to = new THREE.Vector3(tx, 0.035, tz);
    for (const prop of Object.values(props)) prop.removeFromParent();
    try {
      scene.add(ball);
      Object.assign(pose, { neck: 0.3, wag: 1, wagSpeed: 18 });
      for (let t = 0; t < 1; t += dt / 0.9) {
        ball.position.lerpVectors(from, to, t);
        ball.position.y += Math.sin(t * PI) * 0.9;
        turnTowards(angleTo(ball.position.x, ball.position.z), 5);
        yield;
      }
      ball.position.copy(to);
      pose.neck = null;
      yield* walkTo(...approach(tx, tz, 0.42), 2.2);
      yield* face(angleTo(tx, tz));
      Object.assign(pose, EATING_FLOOR, { chew: false });
      yield* wait(0.35);
      let carried = ball;
      if (item !== 'ball') {
        relax();
        bubble.show('?', 1);
        yield* walkTo(...BASKET, 1.4);
        Object.assign(pose, EATING_FLOOR);
        yield* wait(1.2);
        carried = props[item];
      }
      hold(carried, item);
      Object.assign(pose, { neck: null, chew: false, head: 0, pitch: 0, wag: 0.9, wagSpeed: 16 });
      yield* walkTo(...GATE_SPOT, 1.4);
      yield* face(PI);
      if (item === 'wurst') {
        say('Max hat am Grill eingekauft');
        bubble.show('Mampf', 1.6);
        pose.chew = true;
        yield* wait(1.6);
        carried.removeFromParent();
        satiety += 0.15;
      } else {
        drop(carried);
        if (item === 'pipe') say('Max apportiert ein Abgasrohr – echte Fachkraft!');
        else bubble.show('Nochmal!', 1.4);
      }
      Object.assign(pose, { posture: 'sit', chew: false });
      yield* wait(1.5);
      if (chance(0.3)) { relax(); yield* zoomies(); }
    } finally {
      for (const prop of dog.mouth.children.slice()) drop(prop);
    }
  }

  function hold(item, kind) {
    dog.mouth.add(item);
    item.position.set(kind === 'pipe' ? -0.03 : 0.01, -0.01, 0);
    item.rotation.set(kind === 'pipe' ? PI / 2 : 0, kind === 'wurst' ? PI / 2 : 0, 0);
  }

  function drop(item) {
    item.getWorldPosition(_v);
    scene.add(item);
    item.position.set(_v.x, 0.032, _v.z);
    item.rotation.set(0, Math.random() * PI, 0);
  }

  const ACTIONS = { pet, fetch, sit, paw, down, roll, bang, bark };

  function* wakeThen(next, text) {
    doing = 'wake';
    bubble.show(text, 1.2);
    pose.jump = 0.12;
    yield* wait(0.15);
    pose.jump = 0;
    yield* stretch();
    yield* next;
  }

  function act(id) {
    if (id === 'sound') {
      menu.buttons.sound.textContent = sound.toggle() ? 'Ton: an' : 'Ton: aus';
      return;
    }
    menu.close();
    lastInteraction = time;
    if (locked) {
      if (id === 'pet') { tailThump = 1.4; bubble.show('♥', 1.4); } else say('Max kann nicht mehr – erst verdauen');
      return;
    }
    start(id, sleeping ? wakeThen(ACTIONS[id](), '?!') : ACTIONS[id]());
  }

  function feed() {
    menu.close();
    lastInteraction = time;
    const overflow = kibble.bowlFood > 0.5;
    if (!kibble.feed()) { say('Futterspender leer – Nachschub kommt gleich'); return; }
    fed++;
    if (locked) {
      earTwitch = 1;
      say('Max ist pappsatt – das Futter landet daneben');
      return;
    }
    if (sleeping) start('idle', wakeThen(idle(), 'Futter?!'));
    else if (taskName !== 'idle') start('idle', idle());
    if (fed === 1) say('Max frisst – danke fürs Füttern!');
    else if (overflow) say('Der Napf läuft über!');
    else if (satiety > 1) say('Max wird langsam rund …');
    else say(`Max frisst – schon ${fed}× gefüttert`);
  }

  function openMenu(x, y) {
    if (calm) return;
    lastInteraction = time;
    menu.buttons.sound.textContent = sound.on ? 'Ton: an' : 'Ton: aus';
    menu.open(x, y);
    if (!locked && !sleeping) start('attention', attention());
  }

  function visitorArrived() {
    if (calm || locked || sleeping || time - lastGreet < 30) return;
    if (taskName !== 'idle' || (doing !== 'roam' && doing !== 'chase')) return;
    lastGreet = time;
    lastInteraction = time;
    start('greet', greet());
  }

  function applyPose() {
    const P = POSTURES[pose.posture];
    const k = Math.min(1, dt * 6);
    const blend = (key, goal) => { cur[key] += (goal - cur[key]) * k; };
    blend('pitch', P.pitch + pose.pitch);
    blend('lift', P.lift);
    blend('roll', P.roll);
    blend('front', P.front);
    blend('rear', P.rear);
    blend('neck', pose.neck ?? P.neck);
    blend('head', pose.head);
    blend('tilt', pose.tilt);
    blend('paw', pose.paw);
    blend('base', distTo(...BASKET) < 0.45 ? BASKET_FLOOR : 0);

    const f = fat(), moving = gait > 0;
    stride += gait * dt * 9;
    const amp = moving ? Math.min(0.65, 0.3 + gait * 0.2) : 0;
    const bob = moving ? Math.abs(Math.sin(stride)) * 0.018 : 0;
    dog.root.position.set(pos.x, 0, pos.y);
    dog.root.rotation.y = heading;
    dog.pivot.position.y = PIVOT_Y + cur.lift + cur.base + pose.jump + bob;
    dog.pivot.rotation.x = cur.roll + pose.spin + (moving ? Math.sin(stride) * 0.1 * f : 0);
    dog.body.rotation.z = cur.pitch;
    dog.legs.forEach((leg, i) => {
      let r = (leg.userData.front ? cur.front : cur.rear) + Math.sin(stride + leg.userData.phase) * amp;
      if (i === 0) r += cur.paw * 1.3;
      if (i === 2 && pose.kick) r += Math.sin(time * 26) * 0.6;
      leg.rotation.z = r;
    });
    dog.neck.rotation.z = cur.neck + (pose.chew ? Math.sin(time * 9) * 0.07 : 0);
    dog.head.rotation.z = cur.head;
    dog.head.rotation.x = cur.tilt;
    dog.tongue.visible = pose.tongue || gait > 1;
    const wag = tailThump > 0 ? 0.6 : pose.wag, wagSpeed = tailThump > 0 ? 12 : pose.wagSpeed;
    dog.tail.rotation.y = Math.sin(time * wagSpeed) * wag;
    const round = 1 + f * 0.35;
    dog.belly.scale.set(round, 1, 0.92 * round);
    for (const ear of dog.ears) ear.rotation.x = ear.userData.rest + (earTwitch > 0 ? Math.sin(time * 40) * 0.35 : 0);
    earTwitch -= dt;
    tailThump -= dt;
  }

  function updatePuffs() {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const m = puffs[i], u = m.userData;
      u.age += dt;
      if (u.age < 0) continue;
      m.visible = true;
      m.position.addScaledVector(u.v, dt);
      m.scale.setScalar(0.08 + u.age * 0.12);
      m.material.opacity = 0.45 * (1 - u.age / 3);
      if (u.age >= 3) {
        scene.remove(m);
        m.material.dispose();
        puffs.splice(i, 1);
      }
    }
  }

  function update(rawDt) {
    dt = Math.min(rawDt, 0.05);
    time += dt;
    satiety = Math.max(0, satiety - dt * (sleeping ? 0.025 : 0.01));
    gait = 0;
    if (!calm && task.next().done) start('idle', idle());
    kibble.update(dt);
    bubble.update(dt);
    applyPose();
    updatePuffs();
  }

  heading = Math.atan2(-LOOP.rz, 0);
  start('idle', idle());

  return {
    update, feed, openMenu, visitorArrived,
    closeMenu: () => menu.close(),
    get menuOpen() { return menu.isOpen; },
    feeder: feeder.group, hit: dog.hit, label,
    get state() { return { x: pos.x, z: pos.y, heading, satiety, task: taskName, doing, sleeping, locked, bowl: kibble.bowlFood, floor: kibble.floorCount }; },
  };
}
