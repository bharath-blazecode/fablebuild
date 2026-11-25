// weapons.js — shooting, rockets, explosions, visual effects, pickups and shops.
import * as THREE from 'three';
import { G, WEAPONS, WEAPON_ORDER, dist2 } from './core.js';
import * as V from './vehicles.js';
import * as NPC from './npc.js';
import { groundY } from './world.js';

export const SHOPS = [
  { x: -26, z: -60, kind: 'gun', label: 'GUNS' }, { x: -666, z: 100, kind: 'gun', label: 'GUNS' },
  { x: 240, z: -76, kind: 'spray', label: 'SPRAY' }, { x: -80, z: -316, kind: 'spray', label: 'SPRAY' }, { x: -720, z: 84, kind: 'spray', label: 'SPRAY' }, { x: 720, z: 84, kind: 'spray', label: 'SPRAY' },
  { x: -240, z: -132, kind: 'casino', label: 'CASINO' }, { x: -26, z: 19, kind: 'safe', label: 'HOME' },
];
const dir = new THREE.Vector3();
let cool = 0, shopLock = null, sprayCool = 0;

// ---------- visual effects (all pooled: created once, reused) ----------
const TR = 28, trPos = new Float32Array(TR * 6), trLife = new Float32Array(TR);
let trGeo, trNext = 0, flash, flashT = 0;
const parts = [], booms = [], rockets = [], pickups = [];

function tracer(ax, ay, az, bx, by, bz) {
  const i = (trNext++ % TR) * 6;
  trPos[i] = ax; trPos[i + 1] = ay; trPos[i + 2] = az; trPos[i + 3] = bx; trPos[i + 4] = by; trPos[i + 5] = bz;
  trLife[i / 6] = 0.07; trGeo.attributes.position.needsUpdate = true;
}
function flashAt(x, y, z, power) { flash.position.set(x, y, z); flash.intensity = power; flashT = 0.08; }

export function puff(x, y, z, dark) {
  for (const p of parts) if (p.life <= 0) {
    p.life = p.max = dark ? 1.4 : 0.6; p.mesh.visible = true; p.mesh.material = dark ? smokeMat : fireMat;
    p.mesh.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
    p.vx = (Math.random() - 0.5) * (dark ? 1 : 14); p.vz = (Math.random() - 0.5) * (dark ? 1 : 14); p.vy = dark ? 2.5 : Math.random() * 10;
    p.size = dark ? 0.7 : 0.35; return;
  }
}
let smokeMat, fireMat;

export function explode(x, y, z, r = 9, dmg = 180, byPlayer = false, fromNet = false) {
  const pl = G.player, d = Math.hypot(pl.x - x, pl.z - z);
  G.audio.explosion(d); flashAt(x, y + 1, z, 120); flashT = 0.25;
  if (d < 80) G.cam.shake = Math.max(G.cam.shake, 1.2 * (1 - d / 80));
  for (const b of booms) if (b.t <= 0) { b.t = 0.4; b.r = r; b.mesh.visible = true; b.mesh.position.set(x, y, z); break; }
  for (let i = 0; i < 10; i++) puff(x, y + 0.5, z, i > 6);
  // damage to the local player
  if (d < r && pl.alive && (!fromNet || G.flags.pvp)) pl.damage(dmg * (1 - d / r) * (pl.state === 'drive' ? 0.45 : 0.8), null);
  if (fromNet) return;
  for (const n of NPC.list) { const dd = Math.hypot(n.x - x, n.z - z); if (n.alive && dd < r) NPC.hurt(n, dmg * (1 - dd / r), byPlayer); }
  for (const v of V.list) { const dd = Math.hypot(v.x - x, v.z - z); if (dd < r + 1.5) { V.damage(v, dmg * (1 - dd / (r + 1.5)) * 1.3, byPlayer); v.vx += (v.x - x) / (dd + 1) * 6; v.vz += (v.z - z) / (dd + 1) * 6; v.shoved = 1; } }
  NPC.noise(x, z, 70);
  if (byPlayer) { NPC.crime(2); G.net.broadcast('boom', { x, y, z, r, dmg }); }
}

// ---------- ray tests ----------
function rayChar(ox, oy, oz, dx, dy, dz, cx, cy, cz, maxT, rad2 = 0.3, top = 2.1) {
  const dl2 = dx * dx + dz * dz; if (dl2 < 1e-6) return -1;
  const t = ((cx - ox) * dx + (cz - oz) * dz) / dl2; if (t < 0 || t > maxT) return -1;
  const px = ox + dx * t - cx, pz = oz + dz * t - cz; if (px * px + pz * pz > rad2) return -1;
  const y = oy + dy * t; if (y < cy - 0.15 || y > cy + top) return -1;
  return t;
}

// Fire one bullet along a ray; returns how far it travelled. owner = 'player' or an NPC object.
export function castShot(ox, oy, oz, dx, dy, dz, range, minT, dmg, owner) {
  const pl = G.player, mine = owner === 'player';
  let best = G.world.raycast(ox, oy, oz, dx, dy, dz, range), hit = null, kind = 0, t;
  if (mine) {
    for (const n of NPC.list) { if (!n.alive) continue; t = rayChar(ox, oy, oz, dx, dy, dz, n.x, n.y, n.z, best); if (t > minT && t < best) { best = t; hit = n; kind = 1; } }
    for (const v of V.list) { if (v === pl.vehicle) continue; t = rayChar(ox, oy, oz, dx, dy, dz, v.x, v.y, v.z, best, 2.6, 1.8); if (t > minT && t < best) { best = t; hit = v; kind = 2; } }
    for (const R of G.net.players.values()) { if (R.role !== 'street' || !R.alive || R.id === pl.passengerOf) continue; t = rayChar(ox, oy, oz, dx, dy, dz, R.x, R.y, R.z, best, R.state === 'foot' ? 0.35 : 2.4); if (t > minT && t < best) { best = t; hit = R; kind = 3; } }
  } else if (pl.alive) {
    t = rayChar(ox, oy, oz, dx, dy, dz, pl.x, pl.y, pl.z, best, pl.state === 'foot' ? 0.3 : 2.4); if (t > minT && t < best) { best = t; kind = 4; }
  }
  if (kind === 1) { NPC.hurt(hit, dmg, true); G.hud.hitmarker(); }
  else if (kind === 2) { V.damage(hit, dmg * 0.6, true); hit.lastHitByPlayer = true; if (hit.ai === 'traffic') hit.panic = 6; G.hud.hitmarker(); }
  else if (kind === 3) { if (G.flags.pvp) { G.net.sendTo(hit.id, 'hit', { dmg }); G.hud.hitmarker(); } }
  else if (kind === 4) { if (pl.state === 'drive') { V.damage(pl.vehicle, dmg * 0.5, false); pl.damage(dmg * 0.3, null); } else pl.damage(dmg, null); }
  return best;
}

// Phones get aim assist: pick the best target near the centre of the screen.
function autoTarget(ox, oy, oz) {
  const pl = G.player, cy = G.cam.yaw; let best = null, bs = 1e9;
  const consider = (x, y, z, hostile) => {
    const dx = x - pl.x, dz = z - pl.z, d = Math.hypot(dx, dz); if (d > 70 || d < 0.5) return;
    let a = Math.abs(Math.atan2(dx, dz) - cy) % (Math.PI * 2); if (a > Math.PI) a = Math.PI * 2 - a;
    if (a > (hostile ? 0.45 : 0.22)) return;
    const s = a * 60 + d * 0.5 - (hostile ? 25 : 0); if (s >= bs) return;
    const tx = x - ox, ty = y + 1.2 - oy, tz = z - oz, L = Math.hypot(tx, ty, tz);
    if (G.world.raycast(ox, oy, oz, tx / L, ty / L, tz / L, L) < L - 0.5) return;       // wall in the way
    bs = s; best = { x, y, z };
  };
  for (const n of NPC.list) if (n.alive) consider(n.x, n.y, n.z, n.kind !== 'ped');
  if (G.flags.pvp) for (const R of G.net.players.values()) if (R.role === 'street' && R.alive) consider(R.x, R.y, R.z, true);
  return best;
}

let flameSnd = 0;
export function playerFire() {
  const pl = G.player; if (cool > 0 || !pl.alive) return;
  const key = pl.weapon, w = WEAPONS[key], snd = w.snd || key; cool = w.rate;
  const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
  if (w.melee) {                               // fists and bat
    if (pl.state !== 'foot') return;
    pl.char.punchT = 0.28; G.audio.punch();
    const r2 = w.range * w.range;
    for (const n of NPC.list) { const dx = n.x - pl.x, dz = n.z - pl.z; if (n.alive && dx * dx + dz * dz < r2 && dx * fx + dz * fz > 0) { NPC.hurt(n, w.dmg, true); G.hud.hitmarker(); return; } }
    if (G.flags.pvp) for (const R of G.net.players.values()) { const dx = R.x - pl.x, dz = R.z - pl.z; if (R.alive && R.state === 'foot' && dx * dx + dz * dz < r2 && dx * fx + dz * fz > 0) { G.net.sendTo(R.id, 'hit', { dmg: w.dmg }); G.hud.hitmarker(); return; } }
    for (const v of V.list) { const dx = v.x - pl.x, dz = v.z - pl.z; if (dx * dx + dz * dz < r2 + 5 && dx * fx + dz * fz > 0) { V.damage(v, w.dmg * 0.5, true); G.hud.hitmarker(); return; } }
    return;
  }
  if (!(pl.owned[key] > 0)) {
    const alt = WEAPON_ORDER.find(k => pl.owned[k] > 0); pl.weapon = alt || 'fists';
    G.hud.message('Out of ammo', 1.5); cool = 0.35; return;
  }
  pl.owned[key]--;
  const cam = G.camera, ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
  cam.getWorldDirection(dir);
  if (G.isMobile) { const t = autoTarget(ox, oy, oz); if (t) dir.set(t.x - ox, t.y + 1.2 - oy, t.z - oz).normalize(); }
  const minT = Math.hypot(ox - pl.x, oy - pl.y - 1.2, oz - pl.z) + 0.4;
  const hl = Math.hypot(dir.x, dir.z) || 1, hx = dir.x / hl, hz = dir.z / hl;
  const mx = pl.x + hx * 0.9, my = pl.y + (pl.state === 'foot' ? 1.45 : 1.7), mz = pl.z + hz * 0.9;
  if (w.flame) {                               // flamethrower: burns everything in a short cone
    for (const n of NPC.list) { const dx = n.x - pl.x, dz = n.z - pl.z, d = Math.hypot(dx, dz); if (n.alive && d < w.range && dx * hx + dz * hz > d * 0.85) NPC.hurt(n, w.dmg, Math.random() < 0.15); }
    for (const v of V.list) { const dx = v.x - pl.x, dz = v.z - pl.z, d = Math.hypot(dx, dz); if (v !== pl.vehicle && d < w.range && dx * hx + dz * hz > d * 0.8) V.damage(v, w.dmg * 0.7, true); }
    if (G.flags.pvp) for (const R of G.net.players.values()) { const dx = R.x - pl.x, dz = R.z - pl.z, d = Math.hypot(dx, dz); if (R.alive && R.role === 'street' && d < w.range && dx * hx + dz * hz > d * 0.85) G.net.sendTo(R.id, 'hit', { dmg: w.dmg }); }
    const k = 2 + Math.random() * (w.range - 3); puff(pl.x + hx * k, my + dir.y * k, pl.z + hz * k, false); puff(mx + hx, my, mz + hz, false);
    flashAt(mx + hx * 3, my, mz + hz * 3, 30);
    if (flameSnd <= 0) { flameSnd = 0.22; G.audio.shot(snd, 0); NPC.noise(pl.x, pl.z, 25); }
    return;
  }
  G.audio.shot(snd, 0); flashAt(mx, my, mz, 25); NPC.noise(pl.x, pl.z, 45);
  if (w.rocket) {
    const ht = G.world.raycast(ox, oy, oz, dir.x, dir.y, dir.z, 300);
    const tx = ox + dir.x * ht - mx, ty = oy + dir.y * ht - my, tz = oz + dir.z * ht - mz, L = Math.hypot(tx, ty, tz) || 1;
    rockets.push({ x: mx, y: my, z: mz, dx: tx / L, dy: ty / L, dz: tz / L, life: 5 });
    return;
  }
  if (w.lob) {                                 // grenade: thrown in an arc, explodes where it lands
    pl.char.punchT = 0.28;
    rockets.push({ x: mx, y: my + 0.3, z: mz, dx: dir.x, dy: dir.y, dz: dir.z, vx: dir.x * 26, vy: dir.y * 26 + 7, vz: dir.z * 26, lob: true, life: 3 });
    return;
  }
  let ex = 0, ey = 0, ez = 0;
  for (let i = 0; i < w.pellets; i++) {
    let dx = dir.x + (Math.random() - 0.5) * 2 * w.spread, dy = dir.y + (Math.random() - 0.5) * 2 * w.spread, dz = dir.z + (Math.random() - 0.5) * 2 * w.spread;
    const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
    const t = castShot(ox, oy, oz, dx, dy, dz, w.range + minT, minT, w.dmg, 'player');
    ex = ox + dx * t; ey = oy + dy * t; ez = oz + dz * t; tracer(mx, my, mz, ex, ey, ez);
  }
  G.cam.shake = Math.max(G.cam.shake, key === 'shotgun' || key === 'magnum' || key === 'sniper' ? 0.14 : 0.04);
  G.net.broadcast('shot', { w: snd, x: +mx.toFixed(1), y: +my.toFixed(1), z: +mz.toFixed(1), tx: +ex.toFixed(1), ty: +ey.toFixed(1), tz: +ez.toFixed(1) });
}

// Police and gang members shoot through this.
export function npcShoot(n, tx, ty, tz, spread, dmg, key) {
  const ox = n.x, oy = n.y + 1.45, oz = n.z;
  let dx = tx - ox + (Math.random() - 0.5) * spread * 60, dy = ty - oy + (Math.random() - 0.5) * spread * 20, dz = tz - oz + (Math.random() - 0.5) * spread * 60;
  const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
  const t = castShot(ox, oy, oz, dx, dy, dz, 90, 0.6, dmg, n);
  tracer(ox + dx * 0.8, oy, oz + dz * 0.8, ox + dx * t, oy + dy * t, oz + dz * t);
  G.audio.shot(key, Math.hypot(G.player.x - ox, G.player.z - oz));
}

// ---------- pickups ----------
const PK = { cash: [0x7dff8a, 0.45], health: [0xff4d6d, 0.6], armor: [0x2de2e6, 0.6], weapon: [0xff9a3d, 0.7], crate: [0x9b6b3a, 1.3] };
let pkGeo; const pkMats = {};
export function dropPickup(kind, x, z, amount = 0, key = null, permanent = false) {
  const m = new THREE.Mesh(pkGeo, pkMats[kind]); m.scale.setScalar(PK[kind][1]);
  const p = { kind, x, z, amount, key, permanent, life: permanent ? 1e9 : 45, hidden: 0, mesh: m };
  m.position.set(x, groundY(x, z) + 0.8, z); G.scene.add(m); pickups.push(p); return p;
}
function collect(p) {
  const pl = G.player;
  if (p.kind === 'cash') { pl.addMoney(p.amount); G.hud.message('+$' + p.amount, 1.5); }
  else if (p.kind === 'health') { if (pl.hp >= 100) return false; pl.hp = Math.min(100, pl.hp + 50); G.audio.pickup(); }
  else if (p.kind === 'armor') { if (pl.armor >= 100) return false; pl.armor = 100; G.audio.pickup(); }
  else if (p.kind === 'weapon') { const w = WEAPONS[p.key]; pl.owned[p.key] = (pl.owned[p.key] || 0) + w.pack; pl.weapon = p.key; G.hud.message(w.name + ' picked up', 2); G.audio.pickup(); }
  else { pl.hp = 100; pl.armor = 100; for (const k in pl.owned) pl.owned[k] += WEAPONS[k].pack; G.hud.message('Supply crate: health, armour and ammo', 3); G.audio.pickup(); }
  return true;
}

function gunMenu() {
  const pl = G.player, items = [];
  for (const k of WEAPON_ORDER) {
    if (k === 'fists') continue; const w = WEAPONS[k], has = pl.owned[k] !== undefined, cost = has ? Math.round(w.price * 0.25) : w.price;
    items.push({ label: w.name + (has ? ' ammo +' + w.pack : ''), sub: '$' + cost + (has ? '  (have ' + pl.owned[k] + ')' : '  — new weapon'), disabled: pl.money < cost,
      pick() { if (pl.money < cost) return; pl.money -= cost; pl.owned[k] = (pl.owned[k] || 0) + w.pack; pl.weapon = k; G.audio.cash(); gunMenu(); } });
  }
  items.push({ label: 'Body armour', sub: '$400', disabled: pl.money < 400 || pl.armor >= 100, pick() { if (pl.money < 400) return; pl.money -= 400; pl.armor = 100; G.audio.cash(); gunMenu(); } });
  items.push({ label: 'First-aid kit', sub: '$150', disabled: pl.money < 150 || pl.hp >= 100, pick() { if (pl.money < 150) return; pl.money -= 150; pl.hp = 100; G.audio.cash(); gunMenu(); } });
  G.hud.menu('IRON SIGHT ARMS  —  $' + pl.money, items, () => {});
}

function casinoMenu(note) {
  const pl = G.player, items = [];
  for (const bet of [100, 500, 2000]) items.push({ label: 'Bet $' + bet + ' on red', sub: 'Double or nothing', disabled: pl.money < bet,
    pick() { if (pl.money < bet) return; const win = Math.random() < 0.47; pl.money += win ? bet : -bet; if (win) G.audio.cash(); else G.audio.fail(); casinoMenu(win ? 'Red! You won $' + bet : 'Black. You lost $' + bet); } });
  G.hud.menu('TREASURY CASINO  —  $' + pl.money + (note ? '  —  ' + note : ''), items, () => {});
}

export function init() {
  trGeo = new THREE.BufferGeometry(); trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
  const lines = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ color: 0xffe9a0 })); lines.frustumCulled = false; G.scene.add(lines);
  flash = new THREE.PointLight(0xffc070, 0, 45, 1.2); G.scene.add(flash);
  smokeMat = new THREE.MeshBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.65 });
  fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < (G.isMobile ? 24 : 40); i++) { const mesh = new THREE.Mesh(box, smokeMat); mesh.visible = false; G.scene.add(mesh); parts.push({ mesh, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1 }); }
  const sph = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 3; i++) { const mesh = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9 })); mesh.visible = false; G.scene.add(mesh); booms.push({ mesh, t: 0, r: 8 }); }
  pkGeo = box; for (const k in PK) pkMats[k] = new THREE.MeshLambertMaterial({ color: PK[k][0], emissive: PK[k][0], emissiveIntensity: 0.35 });
  // permanent pickups: a few on the street, and one of every weapon inside the safehouse on Charlotte St
  dropPickup('health', 9.5, -250, 0, null, true); dropPickup('health', 169.5, 40, 0, null, true); dropPickup('armor', 60, -150.5, 0, null, true);
  dropPickup('weapon', 26, -170, 0, 'bat', true); dropPickup('weapon', 20, -150.5, 0, 'smg', true);
  ['magnum', 'shotgun', 'rifle', 'sniper', 'minigun', 'flame', 'grenade', 'rpg'].forEach((k, i) => dropPickup('weapon', -35 + i * 2.5, 29.5, 0, k, true));
  dropPickup('armor', -35, 22, 0, null, true); dropPickup('health', -17, 22, 0, null, true);
  dropPickup('weapon', 800, -560, 0, 'rpg', true); dropPickup('weapon', -116, -280, 0, 'sniper', true); dropPickup('weapon', 240, 360, 0, 'flame', true);
  dropPickup('weapon', -560, -120, 0, 'grenade', true); dropPickup('weapon', 700, 100, 0, 'magnum', true);

  G.on('net:shot', (d) => { tracer(d.x, d.y, d.z, d.tx, d.ty, d.tz); G.audio.shot(d.w, Math.hypot(G.player.x - d.x, G.player.z - d.z)); });
  G.on('net:boom', (d) => explode(d.x, d.y, d.z, d.r, d.dmg, false, true));
}

export function update(dt) {
  const pl = G.player;
  if (cool > 0) cool -= dt;
  if (flameSnd > 0) flameSnd -= dt;
  // tracers fade
  let dirty = false;
  for (let i = 0; i < TR; i++) if (trLife[i] > 0) { trLife[i] -= dt; if (trLife[i] <= 0) { trPos.fill(0, i * 6, i * 6 + 6); dirty = true; } }
  if (dirty) trGeo.attributes.position.needsUpdate = true;
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.intensity = 0; }
  for (const p of parts) if (p.life > 0) {
    p.life -= dt; const m = p.mesh; m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt;
    if (p.mesh.material === fireMat) p.vy -= 20 * dt;
    m.scale.setScalar(p.size * (1 + (1 - p.life / p.max) * 2)); if (p.life <= 0 || m.position.y < -0.2) { p.life = 0; m.visible = false; }
  }
  for (const b of booms) if (b.t > 0) { b.t -= dt; const k = 1 - b.t / 0.4; b.mesh.scale.setScalar(b.r * (0.3 + k * 0.8)); b.mesh.material.opacity = 0.9 * (1 - k); if (b.t <= 0) b.mesh.visible = false; }
  // rockets fly until they hit something
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; let step = 70 * dt;
    if (r.lob) { r.vy -= 22 * dt; const sp = Math.hypot(r.vx, r.vy, r.vz) || 1; r.dx = r.vx / sp; r.dy = r.vy / sp; r.dz = r.vz / sp; step = sp * dt; }
    let t = G.world.raycast(r.x, r.y, r.z, r.dx, r.dy, r.dz, step), hit = t < step;
    for (const n of NPC.list) if (n.alive && Math.hypot(n.x - r.x, n.y + 1 - r.y, n.z - r.z) < 1.4) hit = true;
    for (const v of V.list) if (v !== pl.vehicle && Math.hypot(v.x - r.x, v.z - r.z) < 2.2 && r.y < 2.2) hit = true;
    for (const R of G.net.players.values()) if (R.alive && R.role === 'street' && Math.hypot(R.x - r.x, R.z - r.z) < 1.6 && r.y < R.y + 2.4) hit = true;
    r.x += r.dx * Math.min(t, step); r.y += r.dy * Math.min(t, step); r.z += r.dz * Math.min(t, step); r.life -= dt;
    if (!r.lob || Math.random() < 0.3) puff(r.x, r.y, r.z, true);
    if (hit || r.life <= 0) { explode(r.x, Math.max(0.5, r.y), r.z, r.lob ? 8 : 10, r.lob ? 200 : 220, true); rockets.splice(i, 1); }
  }
  // pickups spin; walk (or drive) over them to collect
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.hidden > 0) { p.hidden -= dt; if (p.hidden <= 0) p.mesh.visible = true; continue; }
    p.mesh.rotation.y += dt * 2; p.life -= dt;
    const reach = p.kind === 'crate' || pl.state === 'drive' ? 3.2 : 1.7;
    if (pl.alive && dist2(p.x, p.z, pl.x, pl.z) < reach * reach && collect(p)) { if (p.permanent) { p.hidden = 60; p.mesh.visible = false; } else p.life = 0; }
    if (p.life <= 0) { G.scene.remove(p.mesh); pickups.splice(i, 1); }
  }
  // shops: walk into a gun shop marker, or drive into a spray shop
  if (sprayCool > 0) sprayCool -= dt;
  let near = null;
  for (const s of SHOPS) if (dist2(s.x, s.z, pl.x, pl.z) < (s.kind === 'spray' ? 16 : 5)) near = s;
  if (!near) shopLock = null;
  else if (near.kind === 'gun' && pl.state === 'foot' && shopLock !== near && !G.ui.menuOpen && pl.alive) { shopLock = near; gunMenu(); }
  else if (near.kind === 'casino' && pl.state === 'foot' && shopLock !== near && !G.ui.menuOpen && pl.alive) { shopLock = near; casinoMenu(''); }
  else if (near.kind === 'safe' && pl.state === 'foot' && shopLock !== near && pl.alive) { shopLock = near; pl.hp = 100; G.audio.success(); G.hud.message('Home: health restored. Every weapon is on the back wall, help yourself', 4); }
  else if (near.kind === 'spray' && pl.state === 'drive' && sprayCool <= 0) {
    sprayCool = 4; const v = pl.vehicle;
    if (pl.wanted > 0 && pl.money < 300) G.hud.message('Respray costs $300', 2);
    else {
      if (pl.wanted > 0) { pl.money -= 300; NPC.clearWanted(); G.hud.message('Fresh paint — the cops lost you  (-$300)', 3); } else G.hud.message('Fresh paint!', 2);
      if (v.type !== 'police') V.setColor(v, (v.colorIdx + 1 + Math.floor(Math.random() * 6)) % 8);
      v.hp = v.maxHp; G.audio.success();
    }
  }
}
