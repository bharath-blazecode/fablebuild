// input.js — keyboard / mouse (desktop) and multi-touch controls (phones) -> G.input
import { G, WEAPON_ORDER, clamp } from './core.js';

const keys = new Set();
let locked = false, mFire = false, mAim = false;
let touchOn = false, built = false;
let root, joyBase, joyKnob, rotateEl;
let layout = '', rootShown = null, hostShown = null, portraitShown = null;
let steer = 0, joyId = null, joyX = 0, joyY = 0, joySprint = false, lastWheel = 0;
const holds = { fire: 0, jump: 0, gas: 0, brake: 0, left: 0, right: 0 };
const touches = new Map();
const btns = {};

const JR = 55, DZ = 0.12;
const TS = 'clamp(44px,10vmin,56px)';
const SZ = s => `clamp(46px,${s}vmin,${Math.round(s * 4.4)}px)`;
const R = (x, b, s) => `--s:${SZ(s)};right:calc(${x}vmin + env(safe-area-inset-right,0px));bottom:calc(${b}vmin + env(safe-area-inset-bottom,0px));`;
const L = (x, b, s) => `--s:${SZ(s)};left:calc(${x}vmin + env(safe-area-inset-left,0px));bottom:calc(${b}vmin + env(safe-area-inset-bottom,0px));`;
const TOPQR = `--s:${TS};right:calc(2vmin + env(safe-area-inset-right,0px));top:calc(2vmin + env(safe-area-inset-top,0px));`;
const TOPHOST = `--s:${TS};right:calc(2vmin + ${TS} + 8px + env(safe-area-inset-right,0px));top:calc(2vmin + env(safe-area-inset-top,0px));`;

// hold = held while touched (sets a flag); act = one-shot G.emit('action', act)
const DEFS = [
  { id: 'fire', label: 'FIRE', hold: 'fire', big: 1, at: { foot: R(3, 4, 23), ride: R(3, 4, 23), drive: R(17, 30, 14) } },
  { id: 'jump', label: 'JUMP', hold: 'jump', at: { foot: R(28, 5, 13) } },
  { id: 'enter', label: 'ENTER', act: 'enter', at: { foot: R(6, 30, 13) } },
  { id: 'swap', label: 'SWAP', act: 'next', at: { foot: R(28, 21, 13), ride: R(28, 5, 13) } },
  { id: 'exit', label: 'EXIT', act: 'enter', at: { ride: R(6, 30, 13), drive: L(3, 32, 11) } },
  { id: 'qr', label: 'QR', act: 'qr', at: { foot: TOPQR } },
  { id: 'host', label: 'HOST', act: 'host', at: { foot: TOPHOST } },
  { id: 'left', label: '◀', hold: 'left', big: 1, at: { drive: L(3, 4, 24) } },
  { id: 'right', label: '▶', hold: 'right', big: 1, at: { drive: L(29, 4, 24) } },
  { id: 'gas', label: 'GAS', hold: 'gas', big: 1, at: { drive: R(3, 4, 25) } },
  { id: 'brake', label: 'BRAKE', hold: 'brake', at: { drive: R(30, 4, 19) } },
  { id: 'hand', label: 'HAND', hold: 'jump', at: { drive: R(3, 31, 12) } },
  { id: 'horn', label: 'HORN', act: 'horn', at: { drive: R(33, 25, 11) } },
  { id: 'radio', label: 'RADIO', act: 'radio', at: { drive: L(16, 32, 11) } },
];

const CSS = `
#tc-root{position:fixed;inset:0;z-index:20;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;display:none;overflow:hidden}
#tc-root *{touch-action:none;user-select:none;-webkit-user-select:none}
.tc-btn{position:absolute;width:var(--s);height:var(--s);border-radius:50%;box-sizing:border-box;background:rgba(12,8,24,.45);border:2px solid rgba(255,255,255,.55);color:#fff;font:800 calc(var(--s)*.23)/1 system-ui,Segoe UI,Arial,sans-serif;letter-spacing:0;display:flex;align-items:center;justify-content:center;text-shadow:0 1px 3px #000;pointer-events:auto;transition:background .06s,transform .06s}
.tc-btn.big{font-size:calc(var(--s)*.27);border-color:rgba(255,154,61,.85)}
.tc-btn.on{background:rgba(255,61,129,.65);transform:scale(.93);border-color:#fff}
#tc-joy{position:absolute;left:0;top:0;width:${JR * 2}px;height:${JR * 2}px;border-radius:50%;background:rgba(255,255,255,.10);border:2px solid rgba(255,255,255,.45);display:none;pointer-events:none}
#tc-knob{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:rgba(45,226,230,.55);border:2px solid #fff}
#tc-rotate{position:fixed;inset:0;z-index:25;background:#0b0716;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;font:900 6vw system-ui,Arial,sans-serif;text-align:center;text-transform:uppercase;gap:2vh;touch-action:none}
#tc-rotate b{font-size:18vw;color:#ff3d81;line-height:1}
`;

const isTyping = e => {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
const blockedNow = () => { const u = G.ui; return !!(u.lobby || u.menuOpen || u.overlay || u.fixer); };

function zero(I) {
  I.moveX = 0; I.moveY = 0; I.lookDX = 0; I.lookDY = 0;
  I.fire = false; I.aim = false; I.jump = false; I.sprint = false;
}

// ---------------------------------------------------------------- desktop
function onKeyDown(e) {
  if (isTyping(e)) return;
  const c = e.code;
  if (c === 'Space' || c === 'Tab' || c.startsWith('Arrow')) e.preventDefault();
  keys.add(c);
  if (e.repeat) return;
  const u = G.ui;
  if (u.lobby || u.menuOpen || u.fixer) return;
  // map / QR / host panels can be toggled even while an overlay is up
  if (c === 'KeyM') return G.emit('action', 'map');
  if (c === 'KeyQ') return G.emit('action', 'qr');
  if (c === 'KeyH') return G.emit('action', 'host');
  if (u.overlay) return;
  if (c === 'KeyF' || c === 'Enter' || c === 'NumpadEnter') G.emit('action', 'enter');
  else if (c === 'KeyE') G.emit('action', 'next');
  else if (c === 'KeyX') G.emit('action', 'radio');
  else if (c === 'KeyG') G.emit('action', 'horn');
  else if (c === 'KeyC') G.emit('action', 'cam');
  else if (c.length === 6 && c.startsWith('Digit') && c[5] >= '1' && c[5] <= '6') G.emit('weapon', WEAPON_ORDER[+c[5] - 1]);
}
function onKeyUp(e) { keys.delete(e.code); }
function clearHeld() {
  keys.clear(); mFire = false; mAim = false;
  releaseAll();
}
function onMouseMove(e) {
  if (!locked || blockedNow()) return;
  G.input.lookDX += e.movementX * 0.0024;
  G.input.lookDY += e.movementY * 0.0024;
}
function onMouseDown(e) {
  if (!locked || blockedNow()) return;
  if (e.button === 0) mFire = true;
  else if (e.button === 2) mAim = true;
}
function onMouseUp(e) {
  if (e.button === 0) mFire = false;
  else if (e.button === 2) mAim = false;
}
function onClick(e) {
  if (touchOn && G.isMobile) return;
  if (!G.canvas || e.target !== G.canvas || locked || blockedNow()) return;
  const r = G.canvas.requestPointerLock && G.canvas.requestPointerLock();
  if (r && r.catch) r.catch(() => {});
}
function onWheel(e) {
  if (!locked || blockedNow()) return;
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheel < 90 || Math.abs(e.deltaY) < 1) return;
  lastWheel = now;
  G.emit('action', e.deltaY > 0 ? 'next' : 'prev');
}
function onLockChange() {
  locked = !!document.pointerLockElement;
  if (!locked) { mFire = false; mAim = false; }
}

// ---------------------------------------------------------------- touch
function enableTouch() {
  if (touchOn) return;
  touchOn = true;
  build();
}

function build() {
  if (built) return;
  built = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  root = document.createElement('div');
  root.id = 'tc-root';
  joyBase = document.createElement('div'); joyBase.id = 'tc-joy';
  joyKnob = document.createElement('div'); joyKnob.id = 'tc-knob';
  joyBase.appendChild(joyKnob);
  root.appendChild(joyBase);
  for (const d of DEFS) {
    const e = document.createElement('div');
    e.className = 'tc-btn' + (d.big ? ' big' : '');
    e.textContent = d.label;
    e.dataset.id = d.id;
    root.appendChild(e);
    btns[d.id] = { def: d, el: e, n: 0 };
  }
  document.body.appendChild(root);

  rotateEl = document.createElement('div');
  rotateEl.id = 'tc-rotate';
  rotateEl.innerHTML = '<b>↻</b><span>Rotate your phone</span><span style="font-size:3.5vw;opacity:.7">Landscape mode only</span>';
  document.body.appendChild(rotateEl);

  const o = { passive: false };
  root.addEventListener('touchstart', tStart, o);
  root.addEventListener('touchmove', tMove, o);
  root.addEventListener('touchend', tEnd, o);
  root.addEventListener('touchcancel', tEnd, o);
  root.addEventListener('contextmenu', e => e.preventDefault());
  rotateEl.addEventListener('touchstart', e => e.preventDefault(), o);
  rotateEl.addEventListener('touchmove', e => e.preventDefault(), o);
  layout = ''; // force applyLayout on next update
}

function applyLayout() {
  for (const id in btns) {
    const b = btns[id];
    const pos = b.def.at[layout];
    if (!pos || (id === 'host' && !G.net.isHost)) b.el.style.cssText = 'display:none';
    else b.el.style.cssText = pos;
  }
  hostShown = !!G.net.isHost;
}

function press(b) {
  b.n++;
  b.el.classList.add('on');
  if (b.def.hold) holds[b.def.hold]++;
  else G.emit('action', b.def.act);
}
function release(b) {
  b.n = Math.max(0, b.n - 1);
  if (!b.n) b.el.classList.remove('on');
  if (b.def.hold) holds[b.def.hold] = Math.max(0, holds[b.def.hold] - 1);
}
function releaseAll() {
  touches.clear();
  for (const k in holds) holds[k] = 0;
  for (const id in btns) { btns[id].n = 0; btns[id].el.classList.remove('on'); }
  joyId = null; joyX = 0; joyY = 0; joySprint = false; steer = 0;
  if (joyBase) joyBase.style.display = 'none';
}

function joyMove(x, y, rec) {
  const dx = x - rec.ox, dy = y - rec.oy;
  const len = Math.hypot(dx, dy) || 1e-6;
  const n = Math.min(len / JR, 1);
  const kx = dx / len, ky = dy / len;
  const mag = n < DZ ? 0 : (n - DZ) / (1 - DZ);
  joyX = kx * mag; joyY = -ky * mag;
  joySprint = n > 0.85;
  const kr = Math.min(len, JR);
  joyKnob.style.transform = `translate(${kx * kr}px,${ky * kr}px)`;
}

function tStart(e) {
  e.preventDefault();
  const list = e.changedTouches;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const el = t.target && t.target.closest ? t.target.closest('.tc-btn') : null;
    const b = el ? btns[el.dataset.id] : null;
    if (b && el.style.display !== 'none') {
      touches.set(t.identifier, { k: 'btn', b, x: t.clientX, y: t.clientY });
      press(b);
    } else if (layout === 'foot' && t.clientX < window.innerWidth / 2) {
      if (joyId !== null) continue;
      joyId = t.identifier;
      const rec = { k: 'joy', ox: t.clientX, oy: t.clientY };
      touches.set(t.identifier, rec);
      joyBase.style.display = 'block';
      joyBase.style.transform = `translate(${t.clientX - JR}px,${t.clientY - JR}px)`;
      joyKnob.style.transform = 'translate(0,0)';
      joyX = 0; joyY = 0; joySprint = false;
    } else if (layout === 'ride' || t.clientX >= window.innerWidth / 2) {
      touches.set(t.identifier, { k: 'look', x: t.clientX, y: t.clientY });
    }
  }
}
function tMove(e) {
  e.preventDefault();
  const list = e.changedTouches, I = G.input;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const rec = touches.get(t.identifier);
    if (!rec) continue;
    if (rec.k === 'joy') joyMove(t.clientX, t.clientY, rec);
    else if (rec.k === 'look' || (rec.k === 'btn' && rec.b.def.id === 'fire')) {
      I.lookDX += (t.clientX - rec.x) * 0.006;
      I.lookDY += (t.clientY - rec.y) * 0.006;
      rec.x = t.clientX; rec.y = t.clientY;
    }
  }
}
function tEnd(e) {
  e.preventDefault();
  const list = e.changedTouches;
  for (let i = 0; i < list.length; i++) {
    const id = list[i].identifier;
    const rec = touches.get(id);
    if (!rec) continue;
    touches.delete(id);
    if (rec.k === 'btn') release(rec.b);
    else if (rec.k === 'joy') {
      joyId = null; joyX = 0; joyY = 0; joySprint = false;
      joyBase.style.display = 'none';
    }
  }
}

function syncTouch() {
  const u = G.ui;
  const portrait = window.innerHeight > window.innerWidth;
  const showRotate = portrait && !u.lobby && !u.fixer;
  if (showRotate !== portraitShown) { portraitShown = showRotate; rotateEl.style.display = showRotate ? 'flex' : 'none'; }
  const show = !blockedNow();
  if (show !== rootShown) {
    rootShown = show;
    root.style.display = show ? 'block' : 'none';
    if (!show) releaseAll();
  }
  const s = G.player && G.player.state;
  const lay = s === 'drive' ? 'drive' : s === 'ride' ? 'ride' : 'foot';
  if (lay !== layout) { layout = lay; releaseAll(); applyLayout(); }
  else if (hostShown !== !!G.net.isHost) applyLayout();
}

// ---------------------------------------------------------------- public
export function init() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearHeld);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('contextmenu', e => {
    if (locked || (G.canvas && e.target === G.canvas)) e.preventDefault();
  });
  window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
  if (G.isMobile) enableTouch();
}

export function update(dt) {
  const I = G.input;
  if (touchOn) syncTouch();
  if (blockedNow()) {
    zero(I);
    if (locked && document.exitPointerLock) document.exitPointerLock();
    return;
  }

  let mx = 0, my = 0;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1;

  const drive = !!(G.player && G.player.state === 'drive');
  let tSprint = false;
  if (touchOn) {
    if (drive) {
      const tgt = (holds.right > 0 ? 1 : 0) - (holds.left > 0 ? 1 : 0);
      steer += (tgt - steer) * Math.min(1, 6 * dt);
      if (!tgt && Math.abs(steer) < 0.01) steer = 0;
      mx += steer;
      my += (holds.gas > 0 ? 1 : 0) - (holds.brake > 0 ? 1 : 0);
    } else {
      steer = 0;
      mx += joyX; my += joyY;
      tSprint = joySprint;
    }
  }
  I.moveX = clamp(mx, -1, 1);
  I.moveY = clamp(my, -1, 1);
  I.fire = (mFire && locked) || holds.fire > 0;
  I.aim = mAim;
  I.jump = keys.has('Space') || holds.jump > 0;
  I.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || tSprint;
}
