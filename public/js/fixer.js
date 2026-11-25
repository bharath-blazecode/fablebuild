// fixer.js — the Fixer phone role: full-screen 2D tactical map + "hacks".
import { G } from './core.js';

const ABIL = [
  { id: 'jam', name: 'Jam police', cost: 40, desc: 'Cops lose the crew (120 m, 20 s)' },
  { id: 'car', name: 'Getaway car', cost: 50, desc: 'Drop a sports car' },
  { id: 'supply', name: 'Supply crate', cost: 30, desc: 'Health, armour, ammo' },
  { id: 'decoy', name: 'Decoy', cost: 30, desc: 'Police chase a fake call (20 s)' },
  { id: 'strike', name: 'Strike', cost: 80, desc: 'Explosion after 3 s' },
];
const COOLDOWN = 3, MAXE = 100, REGEN = 5;
const TEAL = '#2de2e6', PINK = '#ff3d81', ORANGE = '#ff9a3d';

let inited = false, isOpen = false;
let root, cv, c2, hdrName, hdrCrew, feedEl, hintEl, barEl, helpEl, energyFill, energyTxt;
let btns = [];
let W = 0, H = 0, dpr = 1;
let scale = 1, minScale = 0.3, maxScale = 6, ox = 0, oy = 0;
let energy = MAXE, armed = null, lastT = 0, lastDraw = 0, raf = 0;
const cdUntil = {};
const feedLines = [];
const fx = [];
const ptrs = new Map();
let tapInfo = null, pinch = null;
let lastEnergyTxt = -1, lastCrew = -1, lastFeedKey = '', lastAfford = '';

const CSS = `
#fx-root{position:fixed;inset:0;z-index:40;background:#050a18;color:${TEAL};font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
#fx-root canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
#fx-top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 6px) calc(env(safe-area-inset-right) + 8px) 6px calc(env(safe-area-inset-left) + 8px);background:linear-gradient(#050a18ee,#050a1800);pointer-events:none}
#fx-hdr{display:flex;align-items:center;gap:10px;font-weight:900;font-size:14px;pointer-events:none}
#fx-hdr b{color:#fff}#fx-hdr .fx-crew{margin-left:auto;color:${TEAL}}
#fx-help{pointer-events:auto;width:30px;height:30px;border-radius:50%;border:2px solid ${TEAL};background:#0a1428;color:${TEAL};font-weight:900;font-size:16px}
#fx-feed{margin-top:4px;font-size:11px;font-weight:700;line-height:1.35;color:#9fe9ec;min-height:15px}
#fx-feed div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#fx-feed div:last-child{color:#fff}
#fx-hint{position:absolute;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 96px);padding:6px 12px;background:${PINK};color:#fff;font-weight:900;font-size:12px;border-radius:4px;display:none;pointer-events:none;white-space:nowrap}
#fx-bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:6px;padding:8px calc(env(safe-area-inset-right) + 8px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 8px);background:linear-gradient(#050a1800,#050a18f2 30%);flex-wrap:wrap}
#fx-energy{flex:1 0 100%;height:18px;border:2px solid ${TEAL};background:#0a1428;position:relative;border-radius:3px}
#fx-efill{position:absolute;inset:0 auto 0 0;background:${TEAL};width:100%}
#fx-etxt{position:absolute;inset:0;text-align:center;font-size:11px;line-height:14px;font-weight:900;color:#fff;mix-blend-mode:difference}
.fx-ab{flex:1 1 90px;min-height:60px;padding:6px 8px;text-align:left;border:2px solid ${TEAL};background:#0a1428e8;color:${TEAL};border-radius:6px;font:inherit;font-weight:900;font-size:12px;cursor:pointer;touch-action:manipulation}
.fx-ab small{display:block;font-weight:600;font-size:10px;color:#8cc;text-transform:none;letter-spacing:0;line-height:1.2;margin-top:2px}
.fx-ab .fx-c{float:right;color:${ORANGE}}
.fx-ab.off{opacity:.38;border-color:#356}
.fx-ab.armed{background:${PINK};border-color:#fff;color:#fff}.fx-ab.armed small,.fx-ab.armed .fx-c{color:#fff}
#fx-pop{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#050a18cc;z-index:2}
#fx-pop div{max-width:320px;padding:18px;border:2px solid ${TEAL};background:#0a1428;font-size:14px;text-transform:none;letter-spacing:0;line-height:1.4;color:#dff}
@media (orientation:landscape) and (max-height:600px){
 #fx-bar{left:auto;top:0;width:min(250px,34vw);flex-direction:column;flex-wrap:nowrap;justify-content:flex-end;padding-top:calc(env(safe-area-inset-top) + 64px);background:linear-gradient(90deg,#050a1800,#050a18f2 25%)}
 #fx-energy{flex:0 0 18px}.fx-ab{flex:0 0 auto;min-height:48px}
 #fx-top{right:min(250px,34vw)}#fx-hint{top:auto;bottom:12px;left:40%}
}`;

function build() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'fx-root'; root.style.display = 'none';
  root.innerHTML = '<canvas id="fx-cv"></canvas><div id="fx-top"><div id="fx-hdr"><span>FIXER</span><b id="fx-name"></b><span class="fx-crew" id="fx-crew"></span><button id="fx-help">?</button></div><div id="fx-feed"></div></div><div id="fx-hint">Tap the map to deploy</div><div id="fx-bar"><div id="fx-energy"><div id="fx-efill"></div><div id="fx-etxt"></div></div></div><div id="fx-pop"><div>You are the Fixer. Watch your crew on the map and spend energy on hacks to jam police, drop cars and supplies, or call strikes. Pick an ability, then tap the map where you want it.</div></div>';
  document.body.appendChild(root);
  cv = root.querySelector('#fx-cv'); c2 = cv.getContext('2d');
  hdrName = root.querySelector('#fx-name'); hdrCrew = root.querySelector('#fx-crew');
  feedEl = root.querySelector('#fx-feed'); hintEl = root.querySelector('#fx-hint');
  barEl = root.querySelector('#fx-bar'); helpEl = root.querySelector('#fx-pop');
  energyFill = root.querySelector('#fx-efill'); energyTxt = root.querySelector('#fx-etxt');
  for (const a of ABIL) {
    const b = document.createElement('button'); b.className = 'fx-ab';
    b.innerHTML = '<span class="fx-c">' + a.cost + '</span>' + a.name + '<small>' + a.desc + '</small>';
    b.addEventListener('click', () => pick(a.id));
    barEl.appendChild(b); btns.push(b);
  }
  root.querySelector('#fx-help').addEventListener('click', () => { helpEl.style.display = 'flex'; });
  helpEl.addEventListener('click', () => { helpEl.style.display = 'none'; });
  cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove);
  cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pCancel);
  cv.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
}

function feed(text) {
  if (!text) return;
  feedLines.push(String(text)); if (feedLines.length > 4) feedLines.shift();
}

function pick(id) {
  const a = ABIL.find((q) => q.id === id);
  if (!a || energy < a.cost || performance.now() < (cdUntil[id] || 0)) { G.audio.fail?.(); return; }
  armed = armed === id ? null : id;
  G.audio.ui?.();
  hintEl.style.display = armed ? 'block' : 'none';
}

// ---- view math ----
const MS = 1024 / 2000;
function fit() {
  const s = Math.min(W, H) / 1024;
  minScale = s * 0.9; maxScale = s * 6; scale = s;
  ox = (W - 1024 * s) / 2; oy = (H - 1024 * s) / 2;
}
function clampView() {
  const m = 1024 * scale, pad = 80;
  ox = Math.min(W - pad, Math.max(pad - m, ox));
  oy = Math.min(H - pad, Math.max(pad - m, oy));
}
function zoomAt(px, py, k) {
  const ns = Math.min(maxScale, Math.max(minScale, scale * k)), r = ns / scale;
  ox = px - (px - ox) * r; oy = py - (py - oy) * r; scale = ns; clampView();
}
const w2sx = (x) => ((x + 1000) * MS) * scale + ox;
const w2sy = (z) => ((z + 1000) * MS) * scale + oy;
const s2wx = (px) => ((px - ox) / scale) / MS - 1000;
const s2wz = (py) => ((py - oy) / scale) / MS - 1000;

function resize() {
  if (!isOpen) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const nw = window.innerWidth, nh = window.innerHeight, first = W === 0;
  const cx = (W / 2 - ox) / scale, cy = (H / 2 - oy) / scale;
  W = nw; H = nh;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (first) fit(); else { ox = W / 2 - cx * scale; oy = H / 2 - cy * scale; clampView(); }
}

// ---- input ----
function pDown(e) {
  try { cv.setPointerCapture?.(e.pointerId); } catch (err) { /* capture is optional */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) tapInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, multi: false };
  else {
    if (tapInfo) tapInfo.multi = true;
    const p = [...ptrs.values()];
    pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1 };
  }
}
function pMove(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (tapInfo) tapInfo.moved = Math.max(tapInfo.moved, Math.hypot(e.clientX - tapInfo.x, e.clientY - tapInfo.y));
  if (ptrs.size >= 2 && pinch) {
    const q = [...ptrs.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y) || 1;
    zoomAt((q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2, d / pinch.d);
    pinch.d = d;
  } else if (ptrs.size === 1) { ox += dx; oy += dy; clampView(); }
}
function pUp(e) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (tapInfo && !tapInfo.multi && ptrs.size === 0 && tapInfo.moved < 10 && performance.now() - tapInfo.t < 400) deploy(p.x, p.y);
  if (ptrs.size === 0) tapInfo = null;
}
function pCancel(e) { ptrs.delete(e.pointerId); pinch = null; tapInfo = null; }
function onWheel(e) { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }

function deploy(px, py) {
  if (!armed) return;
  const a = ABIL.find((q) => q.id === armed);
  if (!a || energy < a.cost) { armed = null; hintEl.style.display = 'none'; return; }
  const x = s2wx(px), z = s2wz(py);
  if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return;
  G.net.broadcast('hack', { type: a.id, x, z, by: G.player?.name || 'Fixer' });
  energy -= a.cost;
  cdUntil[a.id] = performance.now() + COOLDOWN * 1000;
  fx.push({ type: a.id, x, z, t0: performance.now() });
  feed((G.player?.name || 'Fixer') + ' used ' + a.id);
  G.audio.ui?.();
  armed = null; hintEl.style.display = 'none';
}

// ---- drawing ----
function draw(now) {
  const c = c2;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#050a18'; c.fillRect(0, 0, W, H);
  const mc = G.world?.mapCanvas;
  if (mc) {
    c.imageSmoothingEnabled = true;
    c.drawImage(mc, ox, oy, 1024 * scale, 1024 * scale);
  }
  c.fillStyle = 'rgba(6,16,46,0.72)'; c.fillRect(ox, oy, 1024 * scale, 1024 * scale);
  // grid every 100 m
  c.strokeStyle = 'rgba(45,226,230,0.13)'; c.lineWidth = 1; c.beginPath();
  for (let g = -1000; g <= 1000; g += 100) {
    const x = w2sx(g), y = w2sy(g);
    c.moveTo(x, w2sy(-1000)); c.lineTo(x, w2sy(1000));
    c.moveTo(w2sx(-1000), y); c.lineTo(w2sx(1000), y);
  }
  c.stroke();
  c.strokeStyle = TEAL; c.lineWidth = 2; c.strokeRect(w2sx(-1000), w2sy(-1000), 2000 * MS * scale, 2000 * MS * scale);

  // effects
  const mpx = MS * scale; // screen px per metre
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i], age = (now - e.t0) / 1000, life = (e.type === 'jam' || e.type === 'decoy') ? 20 : 3;
    if (age > life) { fx.splice(i, 1); continue; }
    const sx = w2sx(e.x), sy = w2sy(e.z);
    if (e.type === 'jam' || e.type === 'decoy') {
      const col = e.type === 'jam' ? TEAL : ORANGE, rad = (e.type === 'jam' ? 120 : 60) * mpx;
      c.globalAlpha = Math.max(0, 1 - age / 20) * 0.9;
      c.strokeStyle = col; c.lineWidth = 2; c.fillStyle = col;
      c.beginPath(); c.arc(sx, sy, rad, 0, 6.2832); c.stroke();
      c.globalAlpha *= 0.15; c.fill();
    }
    if (age < 1.2) {
      c.globalAlpha = 1 - age / 1.2; c.strokeStyle = PINK; c.lineWidth = 3;
      c.beginPath(); c.arc(sx, sy, 6 + age * 60, 0, 6.2832); c.stroke();
    }
    if (e.type === 'strike' && age < 3) {
      c.globalAlpha = 0.5 + 0.5 * Math.sin(age * 14); c.strokeStyle = ORANGE; c.lineWidth = 2;
      c.beginPath(); c.arc(sx, sy, 25 * mpx + 4, 0, 6.2832); c.stroke();
    }
    c.globalAlpha = 1;
  }

  // players
  let crew = 0;
  c.font = '700 11px system-ui,sans-serif'; c.textAlign = 'center';
  G.net.players.forEach((r) => {
    if (r.role !== 'street') return;
    crew++;
    const sx = w2sx(r.x), sy = w2sy(r.z);
    if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) return;
    const dead = r.alive === false || r.state === 'dead';
    const col = dead ? '#7a8590' : TEAL;
    if (!dead && r.wanted > 0) {
      c.strokeStyle = PINK; c.lineWidth = 3;
      c.beginPath(); c.arc(sx, sy, 11 + 2 * Math.sin(now / 150), 0, 6.2832); c.stroke();
    }
    c.fillStyle = col; c.beginPath(); c.arc(sx, sy, 6, 0, 6.2832); c.fill();
    c.strokeStyle = '#051'; c.lineWidth = 1.5; c.stroke();
    if (r.state === 'drive') { c.fillStyle = '#050a18'; c.fillRect(sx - 4, sy - 2, 8, 4); }
    c.fillStyle = '#fff'; c.fillText(r.name || '?', sx, sy - 15);
    if (!dead && r.wanted > 0) { c.fillStyle = PINK; c.fillText('★'.repeat(Math.min(5, r.wanted | 0)), sx, sy + 24); }
  });
  if (crew === 0) {
    c.fillStyle = 'rgba(5,10,24,.75)'; c.fillRect(W / 2 - 120, H / 2 - 18, 240, 36);
    c.fillStyle = ORANGE; c.font = '900 13px system-ui,sans-serif';
    c.fillText('NO CREW ON THE STREET YET', W / 2, H / 2 + 5);
  }
  if (crew !== lastCrew) { lastCrew = crew; hdrCrew.textContent = 'Crew ' + crew; }
}

function updateDom() {
  const e = Math.floor(energy);
  if (e !== lastEnergyTxt) { lastEnergyTxt = e; energyTxt.textContent = 'ENERGY ' + e + ' / ' + MAXE; energyFill.style.width = energy + '%'; }
  const now = performance.now(); let key = '';
  for (let i = 0; i < ABIL.length; i++) {
    const a = ABIL[i], ok = energy >= a.cost && now >= (cdUntil[a.id] || 0);
    key += ok ? '1' : '0';
    if (armed === a.id && !ok) { armed = null; hintEl.style.display = 'none'; }
  }
  const k2 = key + armed;
  if (k2 !== lastAfford) {
    lastAfford = k2;
    for (let i = 0; i < ABIL.length; i++) {
      btns[i].classList.toggle('off', key[i] === '0');
      btns[i].classList.toggle('armed', armed === ABIL[i].id);
    }
  }
  const fk = feedLines.join('|');
  if (fk !== lastFeedKey) {
    lastFeedKey = fk; feedEl.textContent = '';
    for (const l of feedLines) { const d = document.createElement('div'); d.textContent = l; feedEl.appendChild(d); }
  }
}

function loop(t) {
  if (!isOpen) return;
  raf = requestAnimationFrame(loop);
  if (t - lastDraw < 33) return;
  const dt = Math.min(0.2, (t - (lastT || t)) / 1000);
  lastT = t; lastDraw = t;
  energy = Math.min(MAXE, energy + REGEN * dt);
  draw(t); updateDom();
}

export function open() {
  if (!inited) init();
  if (isOpen) return;
  isOpen = true; G.ui.fixer = true;
  root.style.display = 'block';
  hdrName.textContent = G.player?.name || 'Fixer';
  W = 0; resize();
  lastT = 0; lastEnergyTxt = -1; lastFeedKey = ''; lastAfford = '';
  raf = requestAnimationFrame(loop);
}

export function init() {
  if (inited) return;
  inited = true;
  build();
  G.on('start', (d) => { if (d && d.role === 'fixer') { if (d.name && G.player) hdrName.textContent = d.name; open(); if (d.name) hdrName.textContent = d.name; } });
  G.on('feed', (t) => feed(t));
  G.on('net:feed', (d) => feed(d && d.text));
  G.on('net:hack', (d) => { if (d) feed(d.by + ' used ' + d.type); });
}
