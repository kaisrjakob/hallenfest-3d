// Prozedurale Texturen (Canvas) – keine externen Bilddateien nötig.
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grain(g, w, h, r, amount) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// zeichnet an allen 9 Kachelpositionen, damit die Textur nahtlos wiederholt
function wrapped(S, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
}

function blotches(g, S, r, n, minR, maxR, colors, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = minR + r() * (maxR - minR);
    const col = colors[Math.floor(r() * colors.length)], a = aMin + r() * (aMax - aMin);
    const sx = 0.6 + r() * 0.9;
    wrapped(S, (ox, oy) => {
      g.save();
      g.translate(x + ox, y + oy); g.scale(sx, 1);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2);
      g.restore();
    });
  }
}

export function concrete() {
  const S = 1024, [c, g] = canvas(S), r = rng(11);
  g.fillStyle = '#a7a59f'; g.fillRect(0, 0, S, S);
  blotches(g, S, r, 220, 30, 220, ['70,68,64', '190,188,182', '120,112,100'], 0.04, 0.12);
  blotches(g, S, r, 900, 2, 10, ['60,58,55', '210,208,204'], 0.08, 0.25);
  // Reifen-/Schleifspuren
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = r() * S, y = r() * S, len = 80 + r() * 400, a = r() * Math.PI;
    g.strokeStyle = `rgba(40,38,36,${0.03 + r() * 0.05})`; g.lineWidth = 3 + r() * 14;
    wrapped(S, (ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + 60, y + oy + 40, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); g.stroke(); });
  }
  grain(g, S, S, r, 22);
  // Fugenschnitt am Kachelrand (Kachel = 6 m)
  g.fillStyle = 'rgba(45,44,42,0.85)'; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
  g.fillStyle = 'rgba(230,228,224,0.35)'; g.fillRect(0, 3, S, 1); g.fillRect(3, 0, 1, S);
  return tex(c);
}

export function concreteBump() {
  const S = 512, [c, g] = canvas(S), r = rng(5);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  blotches(g, S, r, 500, 1, 5, ['40,40,40', '200,200,200'], 0.2, 0.5);
  grain(g, S, S, r, 40);
  return tex(c, false);
}

function woodCanvas(S, base, line, seed, knots = true) {
  const [c, g] = canvas(S), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    const y = r() * S, amp = 2 + r() * 6, f = 0.004 + r() * 0.01, ph = r() * 6;
    g.strokeStyle = `rgba(${line},${0.06 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * f * 6.283 / 1 + ph) * amp);
    g.stroke();
  }
  if (knots) for (let i = 0; i < 4; i++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 10;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${line},0.75)`); gr.addColorStop(1, `rgba(${line},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rad * 1.8, rad, 0, 0, 7); g.fill();
  }
  grain(g, S, S, r, 14);
  return c;
}

export const wood = () => tex(woodCanvas(512, '#cdb084', '110,80,45', 3));
export const beerWood = () => tex(woodCanvas(512, '#b9783f', '90,45,15', 8, false));
export const darkWood = () => tex(woodCanvas(512, '#5b3a22', '30,16,8', 9));

export function laminate() {
  const S = 1024, [c, g] = canvas(S), r = rng(21);
  const rows = 12, ph = S / rows; // 2,4 m Kachel → 20 cm Dielen, 1,2 m lang
  for (let row = 0; row < rows; row++) {
    const off = (row % 3) * S / 3 + r() * 60;
    for (let k = -1; k < 3; k++) {
      const x0 = off + k * S / 2;
      const tone = 150 + r() * 40;
      g.fillStyle = `rgb(${tone + 30},${tone + 5},${tone - 35})`;
      g.fillRect(x0, row * ph, S / 2, ph);
      g.strokeStyle = 'rgba(70,45,20,0.5)'; g.lineWidth = 1.5; g.strokeRect(x0, row * ph, S / 2, ph);
    }
  }
  const w = woodCanvas(1024, 'rgba(0,0,0,0)', '90,60,30', 22, false);
  g.globalAlpha = 0.7; g.drawImage(w, 0, 0); g.globalAlpha = 1;
  return tex(c);
}

function tileCanvas(S, nx, ny, base, grout, seed) {
  const [c, g] = canvas(S), r = rng(seed);
  g.fillStyle = grout; g.fillRect(0, 0, S, S);
  const tw = S / nx, th = S / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const v = (r() - 0.5) * 10;
    g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
    g.fillRect(i * tw + 2, j * th + 2, tw - 4, th - 4);
  }
  grain(g, S, S, r, 8);
  return c;
}
export const tiles = () => tex(tileCanvas(512, 2, 4, [160, 160, 155], '#77766f', 31));
export const tilesWhite = () => tex(tileCanvas(512, 3, 3, [228, 228, 224], '#b8b8b2', 32));

export function cartons() {
  // 1,2 m Kachel: Kartons 40 cm breit, 30 cm hoch
  const S = 512, [c, g] = canvas(S), r = rng(41);
  const cols = 3, rows = 4, cw = S / cols, ch = S / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const t = r() * 22;
    g.fillStyle = `rgb(${186 - t},${140 - t},${92 - t})`;
    g.fillRect(i * cw, j * ch, cw, ch);
    // Klebeband mittig
    g.fillStyle = 'rgba(205,165,110,0.85)'; g.fillRect(i * cw, j * ch + ch * 0.12, cw, 10);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(i * cw, j * ch + ch * 0.12, cw, 2);
    // Etikett
    if (r() < 0.55) {
      g.fillStyle = '#f3f1ea'; const lx = i * cw + 18 + r() * 40, ly = j * ch + 40 + r() * 30;
      g.fillRect(lx, ly, 46, 30);
      g.fillStyle = '#333'; for (let k = 0; k < 4; k++) g.fillRect(lx + 4, ly + 5 + k * 6, 20 + r() * 18, 2);
    }
    g.strokeStyle = 'rgba(60,40,20,0.75)'; g.lineWidth = 3; g.strokeRect(i * cw + 1, j * ch + 1, cw - 2, ch - 2);
  }
  grain(g, S, S, r, 10);
  return tex(c);
}

export function corrugated() {
  // Seitenansicht gestapelter Wellpappzuschnitte (0,5 m Kachel, ~4 mm pro Bogen)
  const S = 512, [c, g] = canvas(S), r = rng(51);
  let y = 0;
  while (y < S) {
    const bundle = 18 + Math.floor(r() * 14), tone = r() * 18;
    for (let k = 0; k < bundle && y < S; k++) {
      const h = 4;
      g.fillStyle = `rgb(${176 - tone},${136 - tone},${92 - tone})`; g.fillRect(0, y, S, h);
      g.fillStyle = `rgba(90,62,35,${0.35 + r() * 0.2})`; g.fillRect(0, y + h - 1, S, 1);
      g.fillStyle = 'rgba(230,200,160,0.25)'; g.fillRect(0, y, S, 1);
      y += h;
    }
    g.fillStyle = 'rgba(70,48,25,0.6)'; g.fillRect(0, y - 1, S, 2);
  }
  // leichte Welligkeit / Druckstellen
  blotches(g, S, r, 40, 20, 80, ['80,55,30', '220,190,150'], 0.05, 0.12);
  grain(g, S, S, r, 12);
  return tex(c);
}

export function kraft() {
  const S = 512, [c, g] = canvas(S), r = rng(61);
  g.fillStyle = '#ad8456'; g.fillRect(0, 0, S, S);
  blotches(g, S, r, 120, 10, 90, ['120,85,50', '200,165,120'], 0.05, 0.15);
  grain(g, S, S, r, 16);
  return tex(c);
}

export function panel() {
  // Trapez-/Sandwichpaneel, 1 m Kachel, vertikale Sicken
  const S = 512, [c, g] = canvas(S), r = rng(71);
  g.fillStyle = '#d5d8da'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) {
    const x = i * S / 4;
    const gr = g.createLinearGradient(x, 0, x + 20, 0);
    gr.addColorStop(0, 'rgba(120,125,130,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(160,165,170,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 20, S);
  }
  g.fillStyle = 'rgba(80,85,90,0.8)'; g.fillRect(0, 0, 3, S);
  blotches(g, S, r, 30, 30, 120, ['150,150,145'], 0.04, 0.08);
  grain(g, S, S, r, 6);
  return tex(c);
}

export function drywall() {
  const S = 256, [c, g] = canvas(S), r = rng(81);
  g.fillStyle = '#ebeae5'; g.fillRect(0, 0, S, S);
  grain(g, S, S, r, 7);
  return tex(c);
}

export function asphalt() {
  const S = 512, [c, g] = canvas(S), r = rng(91);
  g.fillStyle = '#4b4b4a'; g.fillRect(0, 0, S, S);
  blotches(g, S, r, 80, 20, 140, ['40,40,40', '90,90,88'], 0.03, 0.07);
  blotches(g, S, r, 3500, 0.6, 1.8, ['140,138,132', '30,30,30'], 0.3, 0.7);
  grain(g, S, S, r, 18);
  return tex(c);
}

export function sectional() {
  const S = 256, [c, g] = canvas(S), r = rng(95);
  g.fillStyle = '#c9cdd1'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(70,75,80,0.7)'; g.fillRect(0, 0, S, 4);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 4, S, 2);
  g.fillStyle = 'rgba(90,95,100,0.35)'; g.fillRect(0, S / 2, S, 2);
  grain(g, S, S, r, 6);
  return tex(c);
}

function stripes(vertical, n) {
  const [c, g] = vertical ? canvas(256, 16) : canvas(16, 256);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#f2f2f0' : '#c8161d';
    if (vertical) g.fillRect(i * 256 / n, 0, 256 / n, 16); else g.fillRect(0, i * 256 / n, 16, 256 / n);
  }
  return tex(c);
}
export const stripesU = () => stripes(true, 2);   // entlang u (Kette)
export const stripesV = () => stripes(false, 8);  // entlang v (Pfosten)

export function signNoEntry() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#c8161d'; g.lineWidth = 18; g.strokeRect(9, 9, 494, 238);
  g.fillStyle = '#c8161d'; g.beginPath(); g.arc(90, 128, 62, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.fillRect(48, 116, 84, 24);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 54px Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText('KEIN', 175, 92); g.fillText('ZUTRITT', 175, 150);
  g.font = '28px Arial, sans-serif'; g.fillText('Logistikbereich', 175, 205);
  return tex(c);
}

export function exitSign() {
  const [c, g] = canvas(512, 192);
  g.fillStyle = '#0b8a3b'; g.fillRect(0, 0, 512, 192);
  g.fillStyle = '#ffffff'; g.font = 'bold 64px Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText('AUSGANG', 150, 98);
  // Pfeil
  g.beginPath(); g.moveTo(30, 98); g.lineTo(80, 50); g.lineTo(80, 78); g.lineTo(125, 78); g.lineTo(125, 118); g.lineTo(80, 118); g.lineTo(80, 146); g.closePath(); g.fill();
  return tex(c);
}

export function fabric() {
  const S = 256, [c, g] = canvas(S), r = rng(99);
  g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 4) { g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(x, 0, 1, S); }
  for (let y = 0; y < S; y += 4) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y, S, 1); }
  // Falten
  for (let i = 0; i < 10; i++) {
    const x = r() * S;
    const gr = g.createLinearGradient(x - 10, 0, x + 10, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 10, 0, 20, S);
  }
  grain(g, S, S, r, 5);
  return tex(c);
}

export function grille() {
  const S = 128, [c, g] = canvas(S);
  g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#0a0a0b';
  for (let x = 4; x < S; x += 8) for (let y = 4; y < S; y += 8) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
  return tex(c);
}

export function zones(L) {
  const sc = 2, W = 850 * sc, H = 1068 * sc;
  const [c, g] = canvas(W, H);
  const rect = ([x0, y0, x1, y1]) => g.fillRect((x0 - 13) * sc, (y0 - 13) * sc, (x1 - x0) * sc, (y1 - y0) * sc);
  g.fillStyle = 'rgba(230,20,20,1)';
  rect([13, 13, 863, 155]); rect([13, 155, 620, 1081]);
  g.fillStyle = 'rgba(120,200,0,1)';
  L.ZONE_GREEN.forEach(rect);
  g.fillStyle = 'rgba(255,200,0,1)';
  L.RACKS.forEach(rect); rect(L.REGAL); L.MONDI.forEach(rect);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
