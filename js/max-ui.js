import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export function createLabel(parent, text) {
  const el = document.createElement('div');
  el.className = 'lbl main';
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.set(0, 1.0, 0);
  label.userData.cat = 'main';
  parent.add(label);
  return label;
}

export function createBubble(parent) {
  const el = document.createElement('div');
  el.className = 'bubble';
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  obj.position.set(0, 1.15, 0);
  obj.visible = false;
  parent.add(obj);
  let left = 0;
  return {
    show(text, seconds = 1.6) { el.textContent = text; obj.visible = true; left = seconds; },
    clear() { obj.visible = false; left = 0; },
    update(dt) { if (obj.visible && (left -= dt) <= 0) obj.visible = false; },
  };
}

export function createSound() {
  let ctx = null, on = false, noise = null;

  function noiseBuffer() {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function envelope(t0, attack, hold, release, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    g.connect(ctx.destination);
    return g;
  }

  function tone(type, t0, f0, f1, dur, peak, cutoff) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    f.type = 'lowpass'; f.frequency.value = cutoff;
    o.connect(f).connect(envelope(t0, 0.015, dur * 0.4, dur * 0.6, peak));
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  function hiss(t0, dur, peak, type, freq, q = 1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    s.buffer = noise; s.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = envelope(t0, dur * 0.4, dur * 0.2, dur * 0.4, peak);
    s.connect(f).connect(g);
    s.start(t0); s.stop(t0 + dur + 0.05);
    return g;
  }

  function wobble(osc, rate, depth, t0, dur) {
    const lfo = ctx.createOscillator(), g = ctx.createGain();
    lfo.frequency.value = rate; g.gain.value = depth;
    lfo.connect(g).connect(osc.frequency);
    lfo.start(t0); lfo.stop(t0 + dur);
  }

  const play = (fn) => () => { if (on && ctx) fn(ctx.currentTime + 0.01); };

  return {
    get on() { return on; },
    toggle() {
      on = !on;
      if (on && !ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { on = false; return on; }
        ctx = new AC();
        noise = noiseBuffer();
      }
      if (on) ctx.resume();
      return on;
    },
    bark: play((t) => {
      for (const dt of [0, 0.26]) {
        tone('sawtooth', t + dt, 520, 190, 0.14, 0.32, 1500);
        hiss(t + dt, 0.1, 0.12, 'bandpass', 900, 2);
      }
    }),
    burp: play((t) => {
      const o = tone('sawtooth', t, 120, 62, 0.85, 0.4, 520);
      wobble(o, 23, 18, t, 0.9);
    }),
    fart: play((t) => {
      const o = tone('square', t, 95, 48, 1.1, 0.22, 320);
      wobble(o, 31, 22, t, 1.2);
      hiss(t, 1.1, 0.18, 'lowpass', 260);
    }),
    snore: play((t) => { hiss(t, 1.4, 0.22, 'bandpass', 340, 3); }),
  };
}

export function createMenu(items, onAction) {
  const el = document.createElement('div');
  el.className = 'max-menu';
  el.hidden = true;
  const head = document.createElement('div');
  head.className = 'max-menu-title';
  head.textContent = 'Max';
  el.appendChild(head);
  const buttons = {};
  for (const [id, text] of items) {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = () => { armTimer(); onAction(id); };
    el.appendChild(b);
    buttons[id] = b;
  }
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  let closeTimer = 0;

  function armTimer() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, 12000);
  }

  function close() {
    clearTimeout(closeTimer);
    el.hidden = true;
  }

  function open(x, y) {
    el.hidden = false;
    const r = el.getBoundingClientRect(), pad = 16;
    el.style.left = Math.min(Math.max(pad, x - r.width / 2), innerWidth - r.width - pad) + 'px';
    el.style.top = Math.min(Math.max(pad, y - r.height - 24), innerHeight - r.height - pad) + 'px';
    armTimer();
  }

  return { open, close, buttons, get isOpen() { return !el.hidden; } };
}
