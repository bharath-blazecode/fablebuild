// hud.js — arcade crime-game HUD: minimap, money, wanted, weapon, bars, mission, menus, big map
import { G, WEAPONS, clamp } from './core.js';

const MS = 170, MAP_M = 260, BM = 720, TAU = Math.PI * 2;
const OL = '#12081a';

let root, menuLayer, menuBack, menuPanel, mapEl, bigCanvas, bctx;
let mini, mctx, distEl, clockEl;
let moneyEl, starsEl, stars = [], weaponEl, ammoEl, hpFill, arFill, driveEl, speedEl, vhFill;
let topEl, mtEl, moEl, tmEl;
let crossEl, hitEl, dmgEl, bannerEl, bannerT, bannerSub, promptEl, toastEl, feedEl;
let hidden = null, mob = false, clockT = 0, miniAcc = 0, bigAcc = 0;
let moneyShown = 0, moneyInt = null, moneyInit = false;
let bannerLeft = 0, toastLeft = 0, hitA = 0, dmgA = 0;
let promptRaw = null, menuMine = false, menuOnClose = null, mapOpen = false;
const feedItems = [];
let sx = 0, sy = 0, sClamped = false;

const CSS = `
.hud-u{--u:clamp(8px,1.45vmin,15px);--o:calc(var(--u)*.2);font-family:Impact,"Arial Black","Segoe UI",system-ui,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#fff;
 text-shadow:var(--o) var(--o) 0 ${OL},calc(-1*var(--o)) var(--o) 0 ${OL},var(--o) calc(-1*var(--o)) 0 ${OL},calc(-1*var(--o)) calc(-1*var(--o)) 0 ${OL},0 calc(var(--o)*2) 0 ${OL}}
#hud-root{position:fixed;inset:0;z-index:10;pointer-events:none;overflow:hidden}
#hud-root>div{position:absolute}
#hud-tl{left:calc(env(safe-area-inset-left,0px) + 2vmin);top:calc(env(safe-area-inset-top,0px) + 2vmin);width:clamp(110px,22vmin,170px)}
#hud-mini{display:block;width:100%;aspect-ratio:1;border-radius:50%;border:calc(var(--u)*.35) solid #fff;box-shadow:0 0 0 calc(var(--u)*.25) ${OL},0 0 calc(var(--u)*1.5) rgba(255,61,129,.6);background:#14182b}
#hud-dist{margin-top:calc(var(--u)*.6);font-size:calc(var(--u)*1.35);color:#ff9a3d;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hud-clock{font-size:calc(var(--u)*1.2);color:#2de2e6;text-align:center}
#hud-tr{right:calc(env(safe-area-inset-right,0px) + 2vmin);top:calc(env(safe-area-inset-top,0px) + 2vmin);display:flex;flex-direction:column;align-items:flex-end;gap:calc(var(--u)*.45)}
.mob #hud-tr{right:calc(env(safe-area-inset-right,0px) + 4vmin + 2*clamp(44px,10vmin,56px) + 12px)}
#hud-money{font-size:calc(var(--u)*2.9);color:#7dff8a;line-height:1}
#hud-stars{display:flex;gap:calc(var(--u)*.2);font-size:calc(var(--u)*2.1);line-height:1}
#hud-stars span{color:rgba(255,255,255,.25)}
#hud-stars span.on{color:#ffd23d}
#hud-stars.flash span.on{animation:hud-flash .5s steps(2,jump-none) infinite}
#hud-stars.flash span:nth-child(odd).on{animation-delay:.25s}
#hud-weapon{font-size:calc(var(--u)*1.6);color:#fff;display:flex;gap:calc(var(--u)*.8);align-items:baseline}
#hud-ammo{color:#ff9a3d}
.hud-bar{width:calc(var(--u)*17);height:calc(var(--u)*1.5);background:rgba(10,5,20,.65);border:calc(var(--u)*.22) solid ${OL};border-radius:99px;overflow:hidden;box-sizing:border-box}
.hud-bar i{display:block;height:100%;width:100%;transition:width .18s}
#hud-hp i{background:linear-gradient(90deg,#ff3d81,#ff6a4d)}
#hud-ar i{background:linear-gradient(90deg,#2de2e6,#5aa8ff)}
#hud-vh i{background:linear-gradient(90deg,#ff9a3d,#ffd23d)}
#hud-vh{width:calc(var(--u)*13);height:calc(var(--u)*1.1)}
#hud-drive{display:none;flex-direction:column;align-items:flex-end;gap:calc(var(--u)*.3)}
#hud-speed{font-size:calc(var(--u)*2.6);color:#2de2e6;line-height:1}
#hud-speed small{font-size:.5em;color:#fff}
#hud-top{left:50%;top:calc(env(safe-area-inset-top,0px) + 1.5vmin);transform:translateX(-50%);text-align:center;display:none;max-width:40vw}
.mob #hud-top{max-width:30vw}
#hud-mt{font-size:calc(var(--u)*1.7);color:#ff3d81}
#hud-mo{font-size:calc(var(--u)*1.3);color:#fff}
#hud-tm{font-size:calc(var(--u)*2.4);color:#2de2e6;display:none;line-height:1.1}
#hud-tm.low{color:#ff3b3b;animation:hud-pulse .5s ease-in-out infinite alternate}
#hud-cross{left:50%;top:50%;width:0;height:0;display:none}
#hud-cross i{position:absolute;background:#fff;box-shadow:0 0 0 1px ${OL}}
#hud-cross .d{width:4px;height:4px;left:-2px;top:-2px;border-radius:50%}
#hud-cross .t{width:2px;height:7px;left:-1px}
#hud-cross .l{width:7px;height:2px;top:-1px}
#hud-cross .t1{top:-17px}#hud-cross .t2{top:10px}#hud-cross .l1{left:-17px}#hud-cross .l2{left:10px}
#hud-hit{left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0}
#hud-hit i{position:absolute;width:9px;height:3px;background:#fff;box-shadow:0 0 0 1px ${OL}}
#hud-hit i:nth-child(1){left:0;top:3px;transform:rotate(45deg)}#hud-hit i:nth-child(2){right:0;top:3px;transform:rotate(-45deg)}
#hud-hit i:nth-child(3){left:0;bottom:3px;transform:rotate(-45deg)}#hud-hit i:nth-child(4){right:0;bottom:3px;transform:rotate(45deg)}
#hud-dmg{inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(255,0,40,0) 45%,rgba(255,0,40,.75) 100%)}
#hud-banner{left:0;right:0;top:32%;text-align:center;display:none;transition:opacity .4s}
#hud-bt{font-size:calc(var(--u)*7);line-height:1;letter-spacing:.06em}
#hud-bs{font-size:calc(var(--u)*2);margin-top:calc(var(--u)*.6);color:#fff}
#hud-banner.pop{animation:hud-pop .5s cubic-bezier(.2,1.6,.4,1) both}
#hud-bottom{left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 3vmin);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.6);max-width:60vw}
.mob #hud-bottom{max-width:calc(100vw - 112vmin);bottom:calc(env(safe-area-inset-bottom,0px) + 2vmin)}
#hud-prompt{display:none;background:rgba(18,8,26,.72);border:calc(var(--u)*.25) solid #ff9a3d;border-radius:99px;padding:calc(var(--u)*.7) calc(var(--u)*1.8);font-size:calc(var(--u)*1.6);text-align:center;text-transform:none;color:#fff}
#hud-toast{display:none;font-size:calc(var(--u)*1.7);color:#ffd23d;text-align:center;transition:opacity .4s}
#hud-feed{left:calc(env(safe-area-inset-left,0px) + 2vmin);top:50%;transform:translateY(-35%);display:flex;flex-direction:column;gap:calc(var(--u)*.4);width:calc(var(--u)*30)}
.mob #hud-feed{top:42%;width:calc(var(--u)*24)}
#hud-feed div{font-size:calc(var(--u)*1.25);opacity:1;transition:opacity .6s;text-transform:none;font-weight:800}
#hud-feed div.fade{opacity:0}
#hud-menu,#hud-map{position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(10,5,25,.6);pointer-events:auto}
#hud-panel{width:min(92vw,540px);max-height:88vh;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;padding:16px;background:linear-gradient(160deg,#2a1240,#150a26);border:3px solid #ff3d81;border-radius:16px;box-shadow:0 0 30px rgba(255,61,129,.45)}
#hud-panel h2{margin:0;font-size:clamp(22px,4vmin,32px);color:#ff9a3d;text-align:center}
#hud-list{display:flex;flex-direction:column;gap:8px;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;min-height:0}
.hud-row,.hud-close{font:inherit;text-transform:none;letter-spacing:.02em;color:#fff;text-align:left;cursor:pointer;min-height:56px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.2);display:flex;flex-direction:column;justify-content:center;gap:2px;text-shadow:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.hud-row:hover,.hud-row:active{border-color:#2de2e6;background:rgba(45,226,230,.15)}
.hud-row b{font-size:clamp(16px,2.6vmin,20px);font-weight:900;text-transform:uppercase}
.hud-row span{font-size:clamp(12px,1.9vmin,14px);font-weight:600;color:#c9b8e8}
.hud-row.dis{opacity:.4;pointer-events:none}
.hud-close{text-align:center;align-items:center;background:#ff3d81;border-color:#fff;font-size:clamp(16px,2.6vmin,20px);font-weight:900;text-transform:uppercase}
#hud-map canvas{width:min(88vh,88vw);height:min(88vh,88vw);border:4px solid #fff;border-radius:10px;box-shadow:0 0 30px rgba(0,0,0,.8)}
#hud-mapcap{position:absolute;bottom:1.5vh;left:0;right:0;text-align:center;font-size:clamp(12px,2vmin,16px)}
@keyframes hud-flash{0%{opacity:1}100%{opacity:.25}}
@keyframes hud-pulse{from{transform:scale(1)}to{transform:scale(1.15)}}
@keyframes hud-pop{0%{transform:scale(.3);opacity:0}100%{transform:scale(1);opacity:1}}
`;

function el(tag, parent, id, cls, text) {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function setText(e, s) { if (e._v !== s) { e._v = s; e.textContent = s; } }
function setW(e, pct) { pct = Math.round(clamp(pct, 0, 100)); if (e._w !== pct) { e._w = pct; e.style.width = pct + '%'; } }
function setDisp(e, show, disp) { if (e._d !== show) { e._d = show; e.style.display = show ? (disp || 'block') : 'none'; } }
function setCls(e, c, on) { const k = '_k' + c; if (e[k] !== on) { e[k] = on; e.classList.toggle(c, on); } }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function restartAnim(e, cls) { e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); }

// ------------------------------------------------------------ public API
function message(text, seconds = 3) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  toastEl.style.opacity = '1';
  toastLeft = seconds;
}
function banner(title, sub, color, seconds = 3) {
  if (!bannerEl) return;
  bannerT.textContent = title || '';
  bannerT.style.color = color || '#ff3d81';
  bannerSub.textContent = sub || '';
  bannerEl.style.display = 'block';
  bannerEl.style.opacity = '1';
  restartAnim(bannerEl, 'pop');
  bannerLeft = seconds;
}
function renderPrompt() {
  if (!promptEl) return;
  if (!promptRaw) { setDisp(promptEl, false); return; }
  const t = mob ? promptRaw.replace(/^\s*Press F\b/i, 'Tap ENTER') : promptRaw;
  setText(promptEl, t);
  setDisp(promptEl, true);
}
function prompt(text) {
  const v = text || null;
  if (v === promptRaw) return;
  promptRaw = v;
  renderPrompt();
}
function feed(text) {
  if (!feedEl || text == null) return;
  const e = el('div', feedEl, null, null, String(text));
  feedItems.push({ e, t: 0, f: false });
  while (feedItems.length > 5) { const o = feedItems.shift(); o.e.remove(); }
}
function hitmarker() { hitA = 1; }
function damageFlash() { dmgA = 1; }

function menu(title, items, onClose) {
  if (!menuLayer) return;
  const prevScroll = menuMine ? (menuPanel.querySelector('#hud-list') || {}).scrollTop || 0 : 0;
  menuOnClose = onClose || null;
  menuPanel.textContent = '';
  el('h2', menuPanel, null, null, title || '');
  const list = el('div', menuPanel, 'hud-list');
  (items || []).forEach(it => {
    const r = el('button', list, null, 'hud-row' + (it.disabled ? ' dis' : ''));
    r.type = 'button';
    el('b', r, null, null, it.label || '');
    if (it.sub) el('span', r, null, null, it.sub);
    r.addEventListener('click', ev => {
      ev.stopPropagation();
      if (!it.disabled && it.pick) it.pick();
    });
  });
  const c = el('button', menuPanel, null, 'hud-close', 'Close');
  c.type = 'button';
  c.addEventListener('click', ev => { ev.stopPropagation(); closeMenu(); });
  list.scrollTop = prevScroll;
  menuMine = true;
  menuBack.style.display = 'flex';
  G.ui.menuOpen = true;
  if (document.exitPointerLock) document.exitPointerLock();
}
function closeMenu() {
  if (!menuMine) return;
  menuMine = false;
  menuBack.style.display = 'none';
  G.ui.menuOpen = false;
  const cb = menuOnClose;
  menuOnClose = null;
  if (cb) cb();
}

// ------------------------------------------------------------ big map
function openMap() {
  const u = G.ui;
  if (mapOpen || u.lobby || u.fixer || u.menuOpen || u.overlay) return;
  mapOpen = true;
  u.overlay = true;
  mapEl.style.display = 'flex';
  if (document.exitPointerLock) document.exitPointerLock();
  drawBig();
}
function closeMap() {
  if (!mapOpen) return;
  mapOpen = false;
  G.ui.overlay = false;
  mapEl.style.display = 'none';
}
function onAction(a) {
  if (a === 'map') { if (mapOpen) closeMap(); else openMap(); }
}

// Marker shapes: diamond for mission/target, circle for others
function shape(ctx, x, y, r, color, diamond) {
  ctx.beginPath();
  if (diamond) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
}

function drawArrow(ctx, x, y, ang, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -1.6 * s); ctx.lineTo(s, 1.2 * s); ctx.lineTo(0, 0.6 * s); ctx.lineTo(-s, 1.2 * s); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
  ctx.restore();
}

function drawMini(p) {
  const S = MS, c = S / 2, k = S / MAP_M, ctx = mctx;
  const world = G.world;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(c, c, c, 0, TAU); ctx.clip();
  ctx.fillStyle = '#14182b'; ctx.fillRect(0, 0, S, S);
  if (!p) { ctx.restore(); return; }
  const th = G.cam.yaw - Math.PI, ct = Math.cos(th), st = Math.sin(th);
  const m = world && world.mapCanvas;
  if (m) {
    const size = world.SIZE || 2000, ppm = m.width / size;
    const px = (p.x + size / 2) * ppm, py = (p.z + size / 2) * ppm, h = (MAP_M / 2) * ppm;
    ctx.save();
    ctx.translate(c, c); ctx.rotate(th); ctx.scale(k, k);
    ctx.drawImage(m, px - h, py - h, 2 * h, 2 * h, -MAP_M / 2, -MAP_M / 2, MAP_M, MAP_M);
    ctx.restore();
  }
  const lim = c - 8;
  const toScreen = (x, z) => {
    const dx = x - p.x, dz = z - p.z;
    sx = c + (dx * ct - dz * st) * k;
    sy = c + (dx * st + dz * ct) * k;
    const ox = sx - c, oy = sy - c, d = Math.hypot(ox, oy);
    sClamped = d > lim;
    if (sClamped) { sx = c + ox / d * lim; sy = c + oy / d * lim; }
  };
  // remote street players
  const pl = G.net && G.net.players;
  if (pl) {
    pl.forEach(r => {
      if (r.role !== 'street' || r.alive === false) return;
      toScreen(r.x, r.z);
      ctx.beginPath(); ctx.arc(sx, sy, sClamped ? 2.5 : 3.5, 0, TAU);
      ctx.fillStyle = '#2de2e6'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = OL; ctx.stroke();
    });
  }
  const mk = G.markers;
  if (mk) {
    for (let i = 0; i < mk.length; i++) {
      const q = mk[i];
      toScreen(q.x, q.z);
      const mission = q.kind === 'mission';
      let r = mission ? 6.5 + Math.sin(clockT * 6) * 1.6 : 4.2;
      if (sClamped && !mission) r = 3.4;
      shape(ctx, sx, sy, r, q.color || '#fff', mission || q.kind === 'target');
    }
  }
  // north tick
  ctx.font = '900 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.fillStyle = '#fff';
  const nx = c + st * (c - 10), ny = c - ct * (c - 10);
  ctx.strokeText('N', nx, ny); ctx.fillText('N', nx, ny);
  ctx.restore();
  drawArrow(ctx, c, c, G.cam.yaw - p.yaw, 7);
}

function drawBig() {
  const ctx = bctx, p = G.player, world = G.world;
  ctx.fillStyle = '#14182b'; ctx.fillRect(0, 0, BM, BM);
  const m = world && world.mapCanvas;
  if (m) ctx.drawImage(m, 0, 0, BM, BM);
  const size = (world && world.SIZE) || 2000, k = BM / size;
  if (G.landmarks) {                         // landmark names
    ctx.font = '800 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const L of G.landmarks) { const x = (L[0] + size / 2) * k, y = (L[1] + size / 2) * k; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,5,25,.9)'; ctx.fillStyle = '#ffe9a8'; ctx.strokeText(L[2], x, y); ctx.fillText(L[2], x, y); }
  }
  ctx.font = '900 15px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const mk = G.markers;
  if (mk) {
    for (let i = 0; i < mk.length; i++) {
      const q = mk[i];
      const x = (q.x + size / 2) * k, y = (q.z + size / 2) * k;
      shape(ctx, x, y, q.kind === 'mission' ? 10 : 7, q.color || '#fff', q.kind === 'mission' || q.kind === 'target');
      if (q.label) {
        ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.fillStyle = '#fff';
        ctx.strokeText(q.label, x + 12, y); ctx.fillText(q.label, x + 12, y);
      }
    }
  }
  const pl = G.net && G.net.players;
  if (pl) {
    pl.forEach(r => {
      if (r.role !== 'street') return;
      const x = (r.x + size / 2) * k, y = (r.z + size / 2) * k;
      shape(ctx, x, y, 6, '#2de2e6', false);
      if (r.name) {
        ctx.lineWidth = 4; ctx.strokeStyle = OL; ctx.fillStyle = '#2de2e6';
        ctx.strokeText(r.name, x + 10, y); ctx.fillText(r.name, x + 10, y);
      }
    });
  }
  if (p) drawArrow(ctx, (p.x + size / 2) * k, (p.z + size / 2) * k, Math.PI - p.yaw, 10);
}

// ------------------------------------------------------------ init / update
export function init() {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  mob = !!G.isMobile;

  root = el('div', document.body, 'hud-root', 'hud-u' + (mob ? ' mob' : ''));

  // top-left minimap
  const tl = el('div', root, 'hud-tl');
  mini = el('canvas', tl, 'hud-mini');
  mini.width = MS; mini.height = MS;
  mctx = mini.getContext('2d');
  distEl = el('div', tl, 'hud-dist');
  clockEl = el('div', tl, 'hud-clock');

  // top-right stats
  const tr = el('div', root, 'hud-tr');
  moneyEl = el('div', tr, 'hud-money', null, '$0');
  starsEl = el('div', tr, 'hud-stars');
  for (let i = 0; i < 5; i++) stars.push(el('span', starsEl, null, null, '★'));
  weaponEl = el('div', tr, 'hud-weapon');
  const wn = el('span', weaponEl, null, null, 'Fists');
  ammoEl = el('span', weaponEl, 'hud-ammo', null, '∞');
  weaponEl._n = wn;
  const hp = el('div', tr, 'hud-hp', 'hud-bar'); hpFill = el('i', hp);
  const ar = el('div', tr, 'hud-ar', 'hud-bar'); arFill = el('i', ar);
  driveEl = el('div', tr, 'hud-drive');
  speedEl = el('div', driveEl, 'hud-speed');
  speedEl.innerHTML = '0 <small>km/h</small>';
  speedEl._n = document.createTextNode('');
  const vh = el('div', driveEl, 'hud-vh', 'hud-bar'); vhFill = el('i', vh);

  // top-centre mission
  topEl = el('div', root, 'hud-top');
  mtEl = el('div', topEl, 'hud-mt');
  moEl = el('div', topEl, 'hud-mo');
  tmEl = el('div', topEl, 'hud-tm');

  // centre
  crossEl = el('div', root, 'hud-cross');
  el('i', crossEl, null, 'd');
  el('i', crossEl, null, 't t1'); el('i', crossEl, null, 't t2');
  el('i', crossEl, null, 'l l1'); el('i', crossEl, null, 'l l2');
  hitEl = el('div', root, 'hud-hit');
  for (let i = 0; i < 4; i++) el('i', hitEl);
  dmgEl = el('div', root, 'hud-dmg');
  bannerEl = el('div', root, 'hud-banner');
  bannerT = el('div', bannerEl, 'hud-bt');
  bannerSub = el('div', bannerEl, 'hud-bs');

  // bottom
  const bot = el('div', root, 'hud-bottom');
  promptEl = el('div', bot, 'hud-prompt');
  toastEl = el('div', bot, 'hud-toast');

  feedEl = el('div', root, 'hud-feed');

  // menu + big map layers (own z-index 30, outside the HUD stacking context)
  menuBack = el('div', document.body, 'hud-menu', 'hud-u');
  menuPanel = el('div', menuBack, 'hud-panel');
  menuBack.addEventListener('click', e => { if (e.target === menuBack) closeMenu(); });
  mapEl = el('div', document.body, 'hud-map', 'hud-u');
  bigCanvas = el('canvas', mapEl);
  bigCanvas.width = BM; bigCanvas.height = BM;
  bctx = bigCanvas.getContext('2d');
  el('div', mapEl, 'hud-mapcap', null, 'Click the map to set a waypoint (click it again to clear)  ·  click outside, M or Esc to close');
  mapEl.addEventListener('click', closeMap);
  bigCanvas.style.cursor = 'crosshair';
  bigCanvas.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = bigCanvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2000 - 1000, z = (e.clientY - r.top) / r.height * 2000 - 1000;
    if (G.waypoint && Math.hypot(G.waypoint.x - x, G.waypoint.z - z) < 40) { G.waypoint = null; feed('Waypoint cleared'); }
    else { G.waypoint = { x, z }; feed('Waypoint set: ' + ((G.world && G.world.districtAt(x, z)) || 'map')); }
  });
  // the minimap is a button: click or tap it to open the full map
  const mapBtn = el('div', document.body, 'hud-mapbtn');
  mapBtn.style.cssText = 'position:fixed;left:0;top:0;width:clamp(110px,26vmin,210px);height:clamp(110px,26vmin,210px);z-index:25;pointer-events:auto;cursor:pointer;border-radius:50%';
  const openIt = (e) => { e.preventDefault(); e.stopPropagation(); if (!G.ui.lobby && !G.ui.fixer && !G.ui.menuOpen) G.emit('action', 'map'); };
  mapBtn.addEventListener('click', openIt); mapBtn.addEventListener('touchend', openIt);

  G.hud = { message, banner, prompt, feed, menu, closeMenu, hitmarker, damageFlash };
  G.on('feed', feed);
  G.on('action', onAction);

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menuMine) closeMenu();
    else if (mapOpen) closeMap();
  });
  window.addEventListener('touchstart', () => {
    if (mob) return;
    mob = true; root.classList.add('mob'); renderPrompt();
  }, { passive: true, once: true });
}

export function update(dt) {
  if (!root) return;
  clockT += dt;
  const u = G.ui;
  const hide = !!(u.lobby || u.fixer);
  if (hide !== hidden) { hidden = hide; root.style.display = hide ? 'none' : 'block'; }
  if (hide) return;

  const p = G.player;

  // ---- transient effects
  if (toastLeft > 0) {
    toastLeft -= dt;
    if (toastLeft <= 0.4 && toastEl.style.opacity !== '0') toastEl.style.opacity = '0';
    if (toastLeft <= 0) toastEl.style.display = 'none';
  }
  if (bannerLeft > 0) {
    bannerLeft -= dt;
    if (bannerLeft <= 0.4 && bannerEl.style.opacity !== '0') bannerEl.style.opacity = '0';
    if (bannerLeft <= 0) bannerEl.style.display = 'none';
  }
  if (hitA > 0) { hitA = Math.max(0, hitA - dt * 6); hitEl.style.opacity = hitA; }
  if (dmgA > 0) { dmgA = Math.max(0, dmgA - dt * 2); dmgEl.style.opacity = dmgA; }
  for (let i = feedItems.length - 1; i >= 0; i--) {
    const f = feedItems[i];
    f.t += dt;
    if (!f.f && f.t > 5.4) { f.f = true; f.e.classList.add('fade'); }
    if (f.t > 6) { f.e.remove(); feedItems.splice(i, 1); }
  }

  // ---- mission
  const ms = G.mission;
  setDisp(topEl, !!ms);
  if (ms) {
    setText(mtEl, ms.title || '');
    setText(moEl, ms.objective || '');
    if (ms.timer != null) {
      const s = Math.max(0, Math.ceil(ms.timer));
      setText(tmEl, Math.floor(s / 60) + ':' + pad2(s % 60));
      setDisp(tmEl, true);
      setCls(tmEl, 'low', ms.timer < 10);
    } else setDisp(tmEl, false);
  }

  if (!p) { setDisp(crossEl, false); return; }

  // ---- crosshair
  setDisp(crossEl, p.state === 'foot' && p.alive !== false && !u.menuOpen && !u.overlay);

  // ---- money (count-up)
  const target = p.money || 0;
  if (!moneyInit) { moneyInit = true; moneyShown = target; }
  if (moneyShown !== target) {
    const d = target - moneyShown;
    moneyShown = Math.abs(d) < 1 ? target : moneyShown + d * Math.min(1, dt * 5);
  }
  const mi = Math.round(moneyShown);
  if (mi !== moneyInt) { moneyInt = mi; moneyEl.textContent = '$' + mi.toLocaleString('en-US'); }

  // ---- wanted
  const w = Math.max(0, Math.min(5, Math.floor(p.wanted || 0)));
  if (starsEl._w !== w) {
    starsEl._w = w;
    for (let i = 0; i < 5; i++) stars[i].classList.toggle('on', i < w);
    starsEl.classList.toggle('flash', w > 0);
  }

  // ---- weapon + bars
  const wd = WEAPONS[p.weapon];
  setText(weaponEl._n, wd ? wd.name : String(p.weapon || ''));
  const inf = p.weapon === 'fists' || !isFinite(p.ammo);
  const am = inf ? -1 : Math.floor(p.ammo || 0);
  if (ammoEl._a !== am) { ammoEl._a = am; ammoEl.textContent = inf ? '∞' : String(am); }
  setW(hpFill, p.hp);
  setW(arFill, p.armor);

  // ---- driving
  const drv = p.state === 'drive' && !!p.vehicle;
  setDisp(driveEl, drv, 'flex');
  if (drv) {
    const kmh = Math.round(Math.abs(p.vehicle.speed != null ? p.vehicle.speed : p.speed || 0) * 3.6);
    if (speedEl._s !== kmh) { speedEl._s = kmh; speedEl.innerHTML = kmh + ' <small>km/h</small>'; }
    setW(vhFill, p.vehicle.maxHp ? p.vehicle.hp / p.vehicle.maxHp * 100 : 100);
  }

  // ---- minimap (<= 15 fps) + labels
  miniAcc += dt;
  if (miniAcc >= 1 / 15) {
    miniAcc = 0;
    drawMini(p);
    const world = G.world;
    setText(distEl, world && world.districtAt ? String(world.districtAt(p.x, p.z) || '') : '');
    const hrs = ((G.dayTime % 1) + 1) % 1 * 24;
    setText(clockEl, pad2(Math.floor(hrs) % 24) + ':' + pad2(Math.floor((hrs % 1) * 60)));
  }

  // ---- big map refresh (5 fps)
  if (mapOpen) {
    bigAcc += dt;
    if (bigAcc >= 0.2) { bigAcc = 0; drawBig(); }
  }
}
