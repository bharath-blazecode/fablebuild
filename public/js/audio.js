// audio.js — procedural sound (WebAudio only, no files). Exports init(); assigns G.audio.
import { G } from './core.js';

let ctx = null, master = null, noiseBuf = null;
let eng = null, hornN = null, sirenN = null;
let radioGain = null, radioIdx = -1, radioTimer = 0, radioNext = 0, radioStep = 0;

const STATIONS = [
  { name: 'Solara FM', bpm: 100, wave: 'sawtooth', scale: [0, 2, 3, 5, 7, 8, 10], root: 45, lead: 0.5 },
  { name: 'Low Tide', bpm: 80, wave: 'triangle', scale: [0, 3, 5, 7, 10], root: 48, lead: 0.4 },
  { name: 'Redline', bpm: 130, wave: 'square', scale: [0, 1, 4, 5, 7, 8, 11], root: 43, lead: 0.35 },
];
const BASS_PAT = [0, 0, 3, 0, 4, 0, 3, 5];
const LEAD_PAT = [0, 2, 4, 2, 5, 4, 2, 1, 0, 3, 4, 6, 5, 4, 2, 3];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// ---- one-shot helpers (nodes are stopped + disconnected when they end) ----
function noise(t, dur, type, freq, vol, dest, q) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || master);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
}
function tone(t, dur, wave, f0, f1, vol, dest) {
  const o = ctx.createOscillator(); o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.02);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}
const atten = (d) => (d > 250 ? 0 : 1 / (1 + d / 25));

// weapon: [noiseDur, noiseFilterType, noiseFreq, noiseVol, thumpFreq0, thumpFreq1, thumpDur, thumpVol]
const SHOTS = {
  pistol:  [0.12, 'bandpass', 2200, 0.9, 200, 60, 0.12, 0.7],
  smg:     [0.07, 'bandpass', 3000, 0.6, 220, 90, 0.06, 0.4],
  shotgun: [0.40, 'lowpass', 1800, 1.3, 120, 35, 0.35, 1.0],
  rifle:   [0.16, 'highpass', 1800, 0.9, 160, 50, 0.14, 0.6],
  rpg:     [0.70, 'bandpass', 600, 0.8, 90, 40, 0.5, 0.6],
  fists:   [0.08, 'lowpass', 500, 0.5, 120, 60, 0.10, 0.6],
};
function shot(key, distance = 0) {
  if (!ctx) return;
  const a = atten(distance); if (a <= 0) return;
  const p = SHOTS[key] || SHOTS.pistol, t = ctx.currentTime;
  noise(t, p[0], p[1], p[2], p[3] * a, null, 0.8);
  tone(t, p[6], 'sine', p[4], p[5], p[7] * a);
}
function explosion(distance = 0) {
  if (!ctx) return;
  const a = atten(distance); if (a <= 0) return;
  const t = ctx.currentTime;
  noise(t, 2.2, 'lowpass', 500, 1.6 * a);
  tone(t, 1.2, 'sine', 120, 30, 1.2 * a);
}

// ---- engine (persistent; no allocation per call) ----
const ENG_BASE = { sports: 75, bike: 85, van: 50, pickup: 52, police: 70, sedan: 62 };
function engInit() {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  const g = ctx.createGain(); g.gain.value = 0;
  const a = ctx.createOscillator(); a.type = 'sawtooth';
  const b = ctx.createOscillator(); b.type = 'square';
  const gb = ctx.createGain(); gb.gain.value = 0.5;
  a.connect(f); b.connect(gb); gb.connect(f); f.connect(g); g.connect(master);
  a.start(); b.start();
  eng = { a, b, f, g };
}
function engine(on, rpm, type) {
  if (!ctx) return;
  if (!eng) { if (!on) return; engInit(); }
  const t = ctx.currentTime;
  if (!on) { eng.g.gain.setTargetAtTime(0, t, 0.08); return; }
  const base = ENG_BASE[type] || 62;
  const r = rpm < 0 ? 0 : rpm > 1 ? 1 : rpm;
  const fr = base * (0.55 + 0.45 * r) + r * 110 * (base / 62) * 0.8;
  const fq = Math.min(190, Math.max(55, fr));
  eng.a.frequency.setTargetAtTime(fq, t, 0.06);
  eng.b.frequency.setTargetAtTime(fq * 0.5, t, 0.06);
  eng.f.frequency.setTargetAtTime(300 + r * 900, t, 0.08);
  eng.g.gain.setTargetAtTime(0.10 + r * 0.10, t, 0.08);
}

function horn(on) {
  if (!ctx) return;
  if (on && !hornN) {
    const g = ctx.createGain(); g.gain.value = 0.15; g.connect(master);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = o2.type = 'square'; o1.frequency.value = 400; o2.frequency.value = 500;
    o1.connect(g); o2.connect(g); o1.start(); o2.start();
    hornN = { o1, o2, g };
  } else if (!on && hornN) {
    const h = hornN; hornN = null;
    h.o1.stop(); h.o2.stop();
    h.o1.onended = () => { h.o1.disconnect(); h.o2.disconnect(); h.g.disconnect(); };
  }
}

function siren(on, distance = 0) {
  if (!ctx) return;
  const a = on ? atten(distance) : 0;
  if (!sirenN) {
    if (a <= 0) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 800;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(master); o.start();
    sirenN = { o, g };
  }
  const t = ctx.currentTime;
  sirenN.o.frequency.setTargetAtTime(800 + 150 * Math.sin(t * 5), t, 0.03);
  sirenN.g.gain.setTargetAtTime(0.12 * a, t, 0.1);
}

function pickup() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.08, 'triangle', 600, 900, 0.25); tone(t + 0.07, 0.12, 'triangle', 900, 1200, 0.25); }
function cash() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.12, 'sine', 988, 988, 0.3); tone(t + 0.09, 0.3, 'sine', 1319, 1319, 0.3); }
function hurt() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.18, 'sawtooth', 220, 90, 0.35); noise(t, 0.1, 'bandpass', 900, 0.3); }
function punch() { if (!ctx) return; const t = ctx.currentTime; tone(t, 0.1, 'sine', 140, 50, 0.7); noise(t, 0.06, 'lowpass', 700, 0.4); }
function ui() { if (!ctx) return; tone(ctx.currentTime, 0.04, 'sine', 1400, 1000, 0.15); }
function fail() { if (!ctx) return; const t = ctx.currentTime; [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.16, 0.25, 'sawtooth', f, f * 0.98, 0.18)); }
function success() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, 0.25, 'triangle', f, f, 0.25)); }

// ---- radio: tiny step sequencer with 100 ms lookahead ----
function radioTick() {
  if (!ctx || radioIdx < 0) return;
  const st = STATIONS[radioIdx], sp = 60 / st.bpm / 4; // 16th notes
  while (radioNext < ctx.currentTime + 0.1) {
    const t = radioNext, s = radioStep, n = st.scale.length;
    const deg = (i) => st.root + st.scale[i % n] + 12 * Math.floor(i / n);
    if (s % 2 === 0) tone(t, sp * 1.8, st.wave === 'square' ? 'sawtooth' : 'sine', mtof(deg(BASS_PAT[(s >> 1) % 8] % n) - 12 + 12), mtof(deg(BASS_PAT[(s >> 1) % 8] % n)) , 0.5, radioGain);
    const li = LEAD_PAT[s % 16];
    if (s % 2 === 0 || st.bpm > 120) tone(t, sp * 1.5, st.wave, mtof(deg(li) + 24), mtof(deg(li) + 24), st.lead * 0.3, radioGain);
    if (s % 4 === 0) tone(t, 0.12, 'sine', 120, 45, 0.9, radioGain);          // kick
    if (s % 2 === 1) noise(t, 0.04, 'highpass', 7000, 0.25, radioGain);        // hi-hat
    if (s % 8 === 4) noise(t, 0.12, 'bandpass', 1800, 0.3, radioGain);         // snare
    radioNext += sp; radioStep = (radioStep + 1) % 64;
  }
}
function radioOff() {
  if (radioTimer) { clearInterval(radioTimer); radioTimer = 0; }
  if (radioGain && ctx) { const g = radioGain; g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => g.disconnect(), 400); }
  radioGain = null; radioIdx = -1;
}
function radio() {
  if (!ctx) return 'Radio off';
  const next = radioIdx + 1;
  radioOff();
  if (next >= STATIONS.length) return 'Radio off';
  radioIdx = next;
  radioGain = ctx.createGain(); radioGain.gain.value = 0.12; radioGain.connect(master);
  radioNext = ctx.currentTime + 0.05; radioStep = 0;
  radioTimer = setInterval(radioTick, 25);
  return STATIONS[next].name;
}

export function init() {
  G.audio = { unlock, shot, explosion, engine, horn, siren, pickup, cash, hurt, punch, ui, fail, success, radio, radioOff };
  const un = () => unlock();
  window.addEventListener('pointerdown', un, { passive: true });
  window.addEventListener('keydown', un);
  window.addEventListener('touchend', un, { passive: true });
}
