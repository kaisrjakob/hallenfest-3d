import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildScene } from './builders.js';
import { createMax } from './max.js';
import * as L from './layout.js';

const params = new URLSearchParams(location.search);
const renderView = params.get('render');          // PDF-Rendering: ?render=<ansicht>
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
const QUALITIES = {
  niedrig: { pr: 1, shadow: 1024, ao: false },
  mittel: { pr: Math.min(devicePixelRatio, 1.75), shadow: 2048, ao: false },
  hoch: { pr: Math.min(devicePixelRatio, 2), shadow: 4096, ao: true },
};
let quality = renderView ? 'hoch' : (params.get('q') || (isMobile ? 'mittel' : 'hoch'));

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!renderView, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9d6e2);
scene.fog = new THREE.Fog(0xc9d6e2, 70, 160);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 0.8;
controls.maxDistance = 110;
controls.zoomToCursor = true;

// Licht: Himmel/Boden + "Sonne" mit weichen Schatten
scene.add(new THREE.HemisphereLight(0xe6eef8, 0x8c8478, 0.9));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(30, 38, -6);
sun.target.position.set(11, 0, 14);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 110 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
fill.position.set(-20, 25, 40);
scene.add(fill);

let composer = null, gtao = null;
function setupComposer(w, h) {
  if (!QUALITIES[quality].ao) { composer = null; return; }
  try {
    if (!composer) {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      gtao = new GTAOPass(scene, camera, w, h);
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1 });
      composer.addPass(gtao);
      composer.addPass(new OutputPass());
    }
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  } catch (e) {
    console.warn('AO nicht verfügbar', e);
    composer = null;
  }
}

function applyQuality() {
  const q = QUALITIES[quality];
  renderer.setPixelRatio(q.pr);
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  document.getElementById('btn-quality').textContent = 'Qualität: ' + quality;
  resize();
}

// ---------- Ansichten ----------
const BASE_ASPECT = 1.6, BASE_FOV = 50, MAX_VFOV = 72;
let anim = null;

function viewCamera(name) {
  const v = L.VIEWS[name], a = camera.aspect;
  const baseV = v.fov || BASE_FOV;
  const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(baseV) / 2) * BASE_ASPECT);
  let vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / a));
  vfov = Math.min(Math.max(vfov, baseV), v.fov ? v.fov + 15 : MAX_VFOV);
  const pos = new THREE.Vector3(...v.pos), target = new THREE.Vector3(...v.target);
  if (v.fit) {
    // Draufsicht: Abstand so wählen, dass Fläche fit[0] × fit[1] (x × z) komplett sichtbar ist
    const vr = THREE.MathUtils.degToRad(vfov) / 2, hr = Math.atan(Math.tan(vr) * a);
    const dist = Math.max(v.fit[1] / 2 / Math.tan(vr), v.fit[0] / 2 / Math.tan(hr)) * 1.04 + 6;
    pos.copy(target).add(new THREE.Vector3(0, dist, 0.01));
  } else if (v.fitR) {
    // Bereich mit Radius fitR um das Ziel vollständig ins Bild bringen (Hoch- und Querformat)
    const vr = THREE.MathUtils.degToRad(vfov) / 2, hr = Math.atan(Math.tan(vr) * a);
    const dist = v.fitR / Math.sin(Math.min(vr, hr));
    pos.sub(target).setLength(dist).add(target);
  } else if (!v.eye) {
    const achievedH = Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * a);
    const scale = Math.pow(Math.max(1, Math.tan(hHalf) / Math.tan(achievedH)), 0.75);
    pos.sub(target).multiplyScalar(scale).add(target);
  }
  return { pos, target, fov: vfov };
}

function goTo(name, instant = false) {
  const c = viewCamera(name);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (instant) {
    camera.position.copy(c.pos); controls.target.copy(c.target); camera.fov = c.fov; camera.updateProjectionMatrix();
    controls.update(); invalidate();
    return;
  }
  anim = { t0: performance.now(), dur: 1100, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), fromFov: camera.fov, ...c };
  invalidate();
}
let currentView = renderView || 'overview';

// ---------- Beschriftungen ----------
const labels = [];
for (const [text, x, y, z, cat] of L.LABELS) {
  const el = document.createElement('div');
  el.className = 'lbl ' + cat;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  o.userData.cat = cat;
  scene.add(o);
  labels.push(o);
}
let showLabels = params.get('labels') !== '0';
let showMinor = !isMobile || !!renderView;
function applyLabels() {
  labels.forEach((o) => { o.visible = showLabels && (o.userData.cat !== 'minor' || showMinor); });
  document.getElementById('btn-labels').classList.toggle('on', showLabels);
  invalidate();
}

// Räume und Kleinteile nur aus der Nähe bzw. in der Draufsicht beschriften
const _dir = new THREE.Vector3();
function updateLabelVisibility() {
  if (!showLabels) return;
  const topDown = camera.getWorldDirection(_dir).y < -0.93;
  for (const o of labels) {
    const cat = o.userData.cat;
    if (cat !== 'room' && cat !== 'minor') continue;
    const d = camera.position.distanceTo(o.position);
    o.visible = (cat !== 'minor' || showMinor) && (topDown || !!renderView || d < (cat === 'room' ? 30 : 20));
  }
}

// ---------- Rendering ----------
let dirty = true;
function invalidate() { dirty = true; }
controls.addEventListener('change', invalidate);

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  setupComposer(w, h);
  invalidate();
}
addEventListener('resize', () => { resize(); if (!anim) goTo(currentView, true); });

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let framesAfterReady = 0, settleUntil = 0, lastNow = 0;
function loop(now) {
  requestAnimationFrame(loop);
  // Max läuft dauerhaft → jedes Bild neu zeichnen
  max.update(lastNow ? (now - lastNow) / 1000 : 0);
  lastNow = now;
  dirty = true;
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.dur), e = ease(k);
    camera.position.lerpVectors(anim.fromPos, anim.pos, e);
    controls.target.lerpVectors(anim.fromTarget, anim.target, e);
    camera.fov = anim.fromFov + (anim.fov - anim.fromFov) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) anim = null;
    dirty = true;
  }
  if (controls.update() || now < settleUntil) dirty = true;
  if (!dirty) return;
  dirty = false;
  updateLabelVisibility();
  if (composer) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  if (renderView && ++framesAfterReady === 4) window.__ready = true;
  if (renderView && framesAfterReady < 4) dirty = true;
}

// ---------- UI ----------
function buildUI() {
  const bar = document.getElementById('views');
  const order = ['overview', 'top', 'party', 'bar', 'stehtische', 'max', 'eingang', 'grill', 'logistik'];
  for (const name of order) {
    const b = document.createElement('button');
    b.textContent = L.VIEWS[name].label;
    b.dataset.view = name;
    b.onclick = () => { currentView = name; goTo(name); };
    bar.appendChild(b);
  }
  document.getElementById('btn-labels').onclick = () => { showLabels = !showLabels; applyLabels(); };
  document.getElementById('btn-zones').onclick = (ev) => {
    world.zones.visible = !world.zones.visible;
    ev.currentTarget.classList.toggle('on', world.zones.visible);
    invalidate();
  };
  document.getElementById('btn-quality').onclick = () => {
    const keys = Object.keys(QUALITIES);
    quality = keys[(keys.indexOf(quality) + 1) % keys.length];
    applyQuality();
  };
  document.getElementById('btn-feed').onclick = () => {
    if (currentView !== 'max') { currentView = 'max'; goTo('max'); }
    feedMax();
  };
  // Antippen/Klicken des Futterspenders im Modell (nicht beim Drehen der Ansicht)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  labelRenderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  labelRenderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = labelRenderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(max.feeder, true).length) feedMax();
  });
  const hint = document.getElementById('hint');
  const hideHint = () => hint.classList.add('hide');
  labelRenderer.domElement.addEventListener('pointerdown', hideHint, { once: true });
  setTimeout(hideHint, 9000);
}

let toastTimer = 0;
function feedMax() {
  const n = max.feed();
  const t = document.getElementById('toast');
  t.textContent = n === 1 ? 'Max frisst – danke fürs Füttern!' : `Max frisst – schon ${n}× gefüttert`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

let world, max;
function start() {
  world = buildScene(scene);
  max = createMax(scene);
  labels.push(max.label);
  if (renderView) {
    document.body.classList.add('render');
    if (params.get('zones') === '1') world.zones.visible = true;
  }
  buildUI();
  applyQuality();
  applyLabels();
  goTo(currentView, true);
  document.getElementById('loading').classList.add('hide');
  if (renderView) document.getElementById('loading').style.display = 'none';
  settleUntil = performance.now() + 1500;
  requestAnimationFrame(loop);
}

// Szene erst nach dem ersten Paint aufbauen, damit die Ladeanzeige sichtbar ist
requestAnimationFrame(() => setTimeout(() => {
  try { start(); } catch (e) {
    console.error(e);
    document.getElementById('loading').textContent = 'Fehler beim Aufbau des Modells: ' + e.message;
  }
}, 30));
