// npc.js — everything with a mind of its own: pedestrians, traffic, police, gang members,
// the wanted-level system, and the effects of Fixer "hacks".
import { G, clamp, angleDiff, dist2 } from './core.js';
import * as V from './vehicles.js';
import * as W from './weapons.js';
import { PX, PZ, OX, OZ, NBX, NBZ, groundY, isWater, pedOnly, segOK } from './world.js';

export const list = [];            // all AI characters: kind = 'ped' | 'cop' | 'enemy'
const traffic = [], copCars = [];
let heat = 0, evadeT = 0, spawnT = 0, sirenT = 0;
export const hack = { jamUntil: 0, jamX: 0, jamZ: 0, decoyUntil: 0, decoyX: 0, decoyZ: 0, timers: [], marks: [] };

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c, 0x34495e, 0xff8fab];
const PANTS = [0x2c3e50, 0x4a4a4a, 0x5d4037, 0x1a237e, 0x607d8b, 0xd7ccc8];
const SKIN = [0xf1c9a5, 0xe0ac7a, 0xc68642, 0x8d5524, 0x5c3a21];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---------- wanted level ----------
export function crime(points) {
  heat += points; evadeT = 0;
  const stars = heat >= 15 ? 5 : heat >= 10 ? 4 : heat >= 6 ? 3 : heat >= 3 ? 2 : heat >= 1 ? 1 : 0;
  if (stars > G.player.wanted) G.player.wanted = stars;
}
export function setWanted(n) { heat = [0, 1, 3, 6, 10, 15][n]; G.player.wanted = n; evadeT = 0; }
export function clearWanted() {
  heat = 0; evadeT = 0; G.player.wanted = 0;
  for (const n of list) if (n.kind === 'cop') n.leave = 6;
}
// Loud things scare pedestrians.
export function noise(x, z, r) {
  for (const n of list) if (n.kind === 'ped' && n.alive && dist2(n.x, n.z, x, z) < r * r) { n.state = 'flee'; n.t = 6 + Math.random() * 4; n.fx = x; n.fz = z; }
  for (const v of traffic) if (dist2(v.x, v.z, x, z) < r * r * 0.4) v.panic = 5;
}

// ---------- characters ----------
function make(kind, x, z, look) {
  const char = G.chars.spawn(look); if (!char) return null;
  const n = { kind, x, y: groundY(x, z), z, yaw: Math.random() * 6.28, hp: kind === 'ped' ? 40 : kind === 'cop' ? 70 : 75, alive: true, char, state: 'walk', t: 0, speed: 0, cool: 1 + Math.random(), leave: 0, fx: 0, fz: 0, weapon: null };
  list.push(n); return n;
}
function removeNpc(n) { const i = list.indexOf(n); if (i >= 0) list.splice(i, 1); G.chars.remove(n.char); n.alive = false; n.gone = true; }

export function hurt(n, dmg, byPlayer) {
  if (!n.alive) return;
  n.hp -= dmg;
  if (byPlayer) {
    crime(n.kind === 'cop' ? 1 : n.kind === 'ped' ? 1 : 0);
    if (n.kind === 'ped') { n.state = 'flee'; n.t = 8; n.fx = G.player.x; n.fz = G.player.z; }
    else n.aggro = true;
  }
  if (n.hp <= 0) {
    n.alive = false; n.char.pose = 'dead'; n.char.speed = 0; n.t = 12; n.char.weapon = null;
    if (byPlayer) { G.player.kills++; crime(n.kind === 'cop' ? 3 : n.kind === 'ped' ? 1.5 : 0); }
    if (n.kind === 'ped') W.dropPickup('cash', n.x, n.z, ri(20, 120));
    else if (n.kind === 'enemy') W.dropPickup('cash', n.x, n.z, ri(150, 400));
    else if (Math.random() < 0.5) W.dropPickup('weapon', n.x, n.z, 0, G.player.wanted >= 3 ? 'smg' : 'pistol');
    G.emit('npcKilled', n);
  }
}

// corner k (0..3, clockwise) of the pavement loop around block (bi, bj)
function corner(bi, bj, k, out) {
  const x0 = OX + bi * PX + 9.5, z0 = OZ + bj * PZ + 9.5;
  out.x = (k === 1 || k === 2) ? x0 + PX - 19 : x0; out.z = k >= 2 ? z0 + PZ - 19 : z0;
}
const cA = { x: 0, z: 0 }, cB = { x: 0, z: 0 };
const blockWet = (bi, bj) => isWater(OX + bi * PX + 80, OZ + bj * PZ + 40);
function spawnPed() {
  const pl = G.player;
  const bi = clamp(Math.floor((pl.x - OX) / PX) + ri(-1, 1), 0, NBX - 1), bj = clamp(Math.floor((pl.z - OZ) / PZ) + ri(-2, 2), 0, NBZ - 1);
  if (blockWet(bi, bj)) return;
  const dir = Math.random() < 0.5 ? 1 : -1, k = ri(0, 3), t = Math.random();
  corner(bi, bj, (k - dir + 4) % 4, cA); corner(bi, bj, k, cB);
  const x = cA.x + (cB.x - cA.x) * t, z = cA.z + (cB.z - cA.z) * t, d2 = dist2(x, z, pl.x, pl.z);
  if (d2 < 45 * 45 || d2 > 150 * 150) return;
  const n = make('ped', x, z, { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), hair: pick([0x1a1a1a, 0x4a2c12, 0xc9a227, 0x7b7b7b, 0xb5523b]) });
  if (!n) return;
  n.bi = bi; n.bj = bj; n.k = k; n.dir = dir; n.tx = cB.x; n.tz = cB.z; n.walk = 1.2 + Math.random() * 0.7;
}
export function ejectDriver(v) {
  const n = make('ped', v.x + Math.cos(v.yaw) * 2, v.z - Math.sin(v.yaw) * 2, { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN) });
  if (n) { n.state = 'flee'; n.t = 10; n.fx = v.x; n.fz = v.z; rejoin(n); }
  const i = traffic.indexOf(v); if (i >= 0) traffic.splice(i, 1);
}
function rejoin(n) {       // find the nearest pavement corner so a ped can resume walking
  n.bi = clamp(Math.floor((n.x - OX) / PX), 0, NBX - 1); n.bj = clamp(Math.floor((n.z - OZ) / PZ), 0, NBZ - 1);
  let bd = 1e9; for (let k = 0; k < 4; k++) { corner(n.bi, n.bj, k, cA); const d = dist2(cA.x, cA.z, n.x, n.z); if (d < bd) { bd = d; n.k = k; n.tx = cA.x; n.tz = cA.z; } }
  n.dir = n.dir || 1; n.walk = n.walk || 1.4;
}
function moveTo(n, tx, tz, sp, dt) {
  const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
  if (d > 0.01) { n.x += dx / d * sp * dt; n.z += dz / d * sp * dt; n.yaw += angleDiff(Math.atan2(dx, dz), n.yaw) * Math.min(1, 10 * dt); }
  n.speed = sp; return d;
}

function updatePed(n, dt) {
  if (n.state === 'flee') {
    n.t -= dt;
    const dx = n.x - n.fx, dz = n.z - n.fz, d = Math.hypot(dx, dz) || 1;
    moveTo(n, n.x + dx / d * 10, n.z + dz / d * 10, 6.2, dt); G.world.resolve(n, 0.35);
    if (n.t <= 0) { n.state = 'walk'; rejoin(n); }
  } else if (moveTo(n, n.tx, n.tz, n.walk, dt) < 0.7) {
    // reached a corner: either keep walking round this block or cross the road to the next one
    corner(n.bi, n.bj, (n.k - n.dir + 4) % 4, cA); corner(n.bi, n.bj, n.k, cB);
    const sx = Math.sign(Math.round(cB.x - cA.x)), sz = Math.sign(Math.round(cB.z - cA.z));
    const nbi = n.bi + sx, nbj = n.bj + sz;
    if (Math.random() < 0.4 && nbi >= 0 && nbi < NBX && nbj >= 0 && nbj < NBZ && !blockWet(nbi, nbj)) { n.bi = nbi; n.bj = nbj; n.k = (n.k - n.dir + 4) % 4; }
    else n.k = (n.k + n.dir + 4) % 4;
    corner(n.bi, n.bj, n.k, cA); n.tx = cA.x; n.tz = cA.z;
  }
}

// ---------- traffic: cars follow the road grid from junction to junction ----------
function spawnTraffic() {
  const pl = G.player;
  const i = clamp(Math.round((pl.x - OX) / PX) + ri(-2, 2), 1, NBX - 1), j = clamp(Math.round((pl.z - OZ) / PZ) + ri(-3, 3), 1, NBZ - 1);
  const x = OX + i * PX, z = OZ + j * PZ, d2 = dist2(x, z, pl.x, pl.z);
  if (d2 < 100 * 100 || d2 > 250 * 250 || isWater(x, z) || pedOnly(x, z)) return;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => segOK(i, j, d[0], d[1]));
  if (!dirs.length) return;
  const d = pick(dirs), r = Math.random();
  const type = r < 0.5 ? 'sedan' : r < 0.65 ? 'pickup' : r < 0.78 ? 'van' : r < 0.92 ? 'sports' : 'bike';
  const v = V.spawn(type, x - d[1] * 3.6 + d[0] * 10, z + d[0] * 3.6 + d[1] * 10, Math.atan2(d[0], d[1]), ri(0, 7), 'traffic');
  v.ti = i + d[0]; v.tj = j + d[1]; v.di = d[0]; v.dj = d[1]; v.cruise = 9 + Math.random() * 4; v.cur = 0; v.block = 0; v.panic = 0;
  traffic.push(v);
}
function updateTraffic(v, dt) {
  const pl = G.player;
  if (v.shoved > 0 || v.burn > 0 || v.wreck) return;
  const nx = OX + v.ti * PX, nz = OZ + v.tj * PZ;
  const tx = nx - v.dj * 3.6, tz = nz + v.di * 3.6;
  // arrived at the junction? choose the next road (no U-turns)
  if (Math.abs((nx - v.x) * v.di + (nz - v.z) * v.dj) < 7.5) {
    const opts = [[v.di, v.dj], [v.di, v.dj], [v.dj, v.di], [-v.dj, -v.di]].filter(d => segOK(v.ti, v.tj, d[0], d[1]));
    const d = opts.length ? pick(opts) : [-v.di, -v.dj];
    v.di = d[0]; v.dj = d[1]; v.ti += d[0]; v.tj += d[1];
  }
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  // brake if something is right in front
  let blocked = false;
  const ahead = (x, z, w) => { const dx = x - v.x, dz = z - v.z, a = dx * fx + dz * fz; return a > 0.5 && a < 10 && Math.abs(-dx * fz + dz * fx) < w; };
  if (pl.alive && pl.state === 'foot' && ahead(pl.x, pl.z, 1.6)) blocked = true;
  if (!blocked) for (let i = 0; i < V.list.length; i++) { const o = V.list[i]; if (o !== v && ahead(o.x, o.z, 1.9)) { blocked = true; break; } }
  if (!blocked) for (let i = 0; i < list.length; i++) { const n = list[i]; if (n.alive && ahead(n.x, n.z, 1.4)) { blocked = true; break; } }
  if (blocked) v.block += dt; else v.block = 0;
  if (v.block > 5) { blocked = false; if (v.block > 7) v.block = 0; }     // don't stay gridlocked forever
  if (v.panic > 0) { v.panic -= dt; blocked = false; }
  const want = blocked ? 0 : (v.panic > 0 ? 22 : v.cruise);
  v.cur += clamp(want - v.cur, -22 * dt, 7 * dt);
  v.yaw += clamp(angleDiff(Math.atan2(tx - v.x, tz - v.z), v.yaw), -2.4 * dt, 2.4 * dt) * Math.min(1, v.cur / 3);
  v.x += Math.sin(v.yaw) * v.cur * dt; v.z += Math.cos(v.yaw) * v.cur * dt; v.y = groundY(v.x, v.z);
  v.speed = v.cur; v.vx = Math.sin(v.yaw) * v.cur; v.vz = Math.cos(v.yaw) * v.cur;
}

// ---------- police ----------
function copTarget(out) {
  const pl = G.player, now = G.time;
  if (now < hack.decoyUntil) { out.x = hack.decoyX; out.z = hack.decoyZ; out.real = false; return; }
  out.x = pl.x; out.z = pl.z; out.real = true;
}
const jammed = (x, z) => G.time < hack.jamUntil && dist2(x, z, hack.jamX, hack.jamZ) < 120 * 120;
const tg = { x: 0, z: 0, real: true };

function spawnCopCar() {
  const pl = G.player;
  const i = clamp(Math.round((pl.x - OX) / PX) + ri(-1, 1), 0, NBX), j = clamp(Math.round((pl.z - OZ) / PZ) + ri(-2, 2), 0, NBZ);
  const x = OX + i * PX, z = OZ + j * PZ, d2 = dist2(x, z, pl.x, pl.z);
  if (d2 < 100 * 100 || d2 > 240 * 240 || isWater(x, z)) return;
  const v = V.spawn('police', x, z, Math.atan2(pl.x - x, pl.z - z), 8, 'cop');
  v.stuck = 0; v.rev = 0; v.cops = 2; copCars.push(v);
}
function updateCopCar(v, dt) {
  const pl = G.player;
  if (v.burn > 0 || v.wreck || v.ai !== 'cop') return false;
  copTarget(tg);
  const dx = tg.x - v.x, dz = tg.z - v.z, d = Math.hypot(dx, dz);
  if (jammed(v.x, v.z)) { V.drive(v, 0, 0, true, dt, false); return true; }
  const diff = angleDiff(Math.atan2(dx, dz), v.yaw);
  let thr = d > 13 ? (Math.abs(diff) > 1.3 ? 0.5 : 1) : -0.6, steer = clamp(-diff * 2.2, -1, 1);
  if (v.rev > 0) { v.rev -= dt; thr = -1; steer = -steer; }
  else if (thr > 0 && Math.abs(v.speed) < 1.2) { v.stuck += dt; if (v.stuck > 1.2) { v.rev = 1.1; v.stuck = 0; } } else v.stuck = 0;
  V.drive(v, thr, steer, d < 13 && Math.abs(v.speed) > 4, dt, false);
  // close enough and the suspect is slow: officers get out
  if (tg.real && d < 17 && Math.abs(v.speed) < 7 && pl.speed < 9 && list.filter(n => n.kind === 'cop').length < (G.isMobile ? 4 : 6)) {
    for (let k = 0; k < v.cops; k++) {
      const side = k ? 1 : -1, n = make('cop', v.x + Math.cos(v.yaw) * 2 * side, v.z - Math.sin(v.yaw) * 2 * side, { shirt: 0x1f3a93, pants: 0x101a3a, skin: pick(SKIN), hat: 0x0b1437 });
      if (n) { n.weapon = pl.wanted >= 3 ? 'smg' : 'pistol'; n.char.weapon = n.weapon; n.aggro = true; }
    }
    v.cops = 0; v.ai = 'copEmpty'; v.vx = v.vz = 0; return false;
  }
  if (d > 300) { V.remove(v); return false; }
  return true;
}
// cops on foot and gang members share this: approach, face the player, shoot
function updateGunman(n, dt) {
  const pl = G.player, cop = n.kind === 'cop';
  if (cop) {
    copTarget(tg);
    if (n.leave > 0 || pl.wanted === 0) { n.leave = (n.leave || 6) - dt; n.speed = 0; if (n.leave <= 0 || dist2(n.x, n.z, pl.x, pl.z) > 70 * 70) removeNpc(n); return; }
  } else { tg.x = pl.x; tg.z = pl.z; tg.real = true; }
  const d = Math.hypot(tg.x - n.x, tg.z - n.z);
  if (!cop && !n.aggro) { if (d < 45 && pl.alive) n.aggro = true; n.speed = 0; return; }
  if (cop && d > 110) { removeNpc(n); return; }
  if (cop && jammed(n.x, n.z)) { n.speed = 0; return; }
  const keep = cop ? 11 : 16;
  if (d > keep) { moveTo(n, tg.x, tg.z, cop ? 5.6 : 3.6, dt); G.world.resolve(n, 0.35); }
  else { n.speed = 0; n.yaw += angleDiff(Math.atan2(tg.x - n.x, tg.z - n.z), n.yaw) * Math.min(1, 10 * dt); }
  n.cool -= dt;
  if (n.cool <= 0 && tg.real && pl.alive && d < 42) {
    const smg = n.weapon === 'smg';
    n.cool = smg ? 0.28 + Math.random() * 0.3 : 0.8 + Math.random() * 0.7;
    W.npcShoot(n, pl.x, pl.y + 1.1, pl.z, G.isMobile ? 0.1 : 0.075, smg ? 4 : 7, n.weapon || 'pistol');
  }
}

// ---------- fixer hacks (arrive over the network from phones) ----------
export function applyHack(d) {
  const by = d.by || 'Fixer', x = clamp(+d.x || 0, -940, 940), z = clamp(+d.z || 0, -940, 940);
  const mark = (color, label, secs) => hack.marks.push({ x, z, color, kind: 'drop', label, until: G.time + secs, r: 1.4 });
  if (d.type === 'jam') { hack.jamUntil = G.time + 20; hack.jamX = x; hack.jamZ = z; mark('#2de2e6', 'JAM', 20); G.emit('feed', by + ' jammed the police radios'); }
  else if (d.type === 'decoy') { hack.decoyUntil = G.time + 20; hack.decoyX = x; hack.decoyZ = z; mark('#ff9a3d', 'DECOY', 20); G.emit('feed', by + ' sent the cops on a fake call'); }
  else if (d.type === 'car') { const p = { x, z }; G.world.resolve(p, 2.6); const v = V.spawn('sports', p.x, p.z, 0, 5, null); v.keep = true; setTimeout(() => { v.keep = false; }, 90000); mark('#7dff8a', 'CAR', 60); G.emit('feed', by + ' dropped a getaway car'); }
  else if (d.type === 'supply') { const p = { x, z }; G.world.resolve(p, 1.5); W.dropPickup('crate', p.x, p.z); mark('#7dff8a', 'CRATE', 45); G.emit('feed', by + ' dropped a supply crate'); }
  else if (d.type === 'strike') { mark('#ff3d81', 'STRIKE', 4); hack.timers.push({ t: 3, fn: () => W.explode(x, 1, z, 14, 230, false) }); G.emit('feed', by + ' called a strike — move!'); G.hud.message('Incoming strike!', 2.5); }
  G.audio.ui();
}

export function init() {
  G.on('net:hack', applyHack);
  G.on('enteredVehicle', (v) => { const i = copCars.indexOf(v); if (i >= 0) copCars.splice(i, 1); });
}

export function update(dt) {
  const pl = G.player, mobile = G.isMobile;
  // keep the streets populated around the player
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.25;
    let peds = 0; for (const n of list) if (n.kind === 'ped') peds++;
    if (peds < (mobile ? 12 : 22)) spawnPed();
    if (traffic.length < (mobile ? 7 : 12)) spawnTraffic();
    const wantCars = Math.min(mobile ? 3 : 5, [0, 1, 2, 2, 3, 4][pl.wanted]);
    for (let i = copCars.length - 1; i >= 0; i--) if (copCars[i].gone || copCars[i].ai !== 'cop') copCars.splice(i, 1);
    if (pl.wanted > 0 && copCars.length < wantCars && G.time > hack.jamUntil) spawnCopCar();
  }
  for (let i = traffic.length - 1; i >= 0; i--) {
    const v = traffic[i];
    if (v.gone || v.ai !== 'traffic') { traffic.splice(i, 1); continue; }
    if (dist2(v.x, v.z, pl.x, pl.z) > 270 * 270) { V.remove(v); traffic.splice(i, 1); continue; }
    updateTraffic(v, dt);
  }
  let nearCop = 1e9;
  for (const v of copCars) if (updateCopCar(v, dt) && !jammed(v.x, v.z)) nearCop = Math.min(nearCop, Math.hypot(v.x - pl.x, v.z - pl.z));
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i], c = n.char;
    if (!n.alive) { n.t -= dt; if (n.t <= 0) removeNpc(n); continue; }
    if (n.kind === 'ped') {
      updatePed(n, dt);
      if (dist2(n.x, n.z, pl.x, pl.z) > 170 * 170) { removeNpc(n); continue; }
    } else {
      updateGunman(n, dt); if (n.gone) continue;
      if (n.kind === 'cop' && !jammed(n.x, n.z)) nearCop = Math.min(nearCop, Math.hypot(n.x - pl.x, n.z - pl.z));
    }
    // run over by a moving vehicle
    for (let k = 0; k < V.list.length; k++) {
      const v = V.list[k]; if (Math.abs(v.speed) < 4) continue;
      if (dist2(v.x, v.z, n.x, n.z) < 2.6) { const mine = v === pl.vehicle; hurt(n, Math.abs(v.speed) * 6, mine); if (mine) { G.audio.punch(); G.cam.shake = 0.2; } break; }
    }
    n.y = groundY(n.x, n.z);
    c.x = n.x; c.y = n.y; c.z = n.z; c.yaw = n.yaw; c.speed = n.speed;
  }
  // wanted level cools off when no officer is close
  if (pl.wanted > 0) {
    if (nearCop > 95) evadeT += dt * (G.time < hack.jamUntil ? 3 : 1); else evadeT = 0;
    if (evadeT > 9 + pl.wanted * 2) { clearWanted(); G.hud.message('You lost the cops', 3); G.audio.success(); }
    sirenT -= dt; if (sirenT <= 0) { sirenT = 0.3; G.audio.siren(nearCop < 160, nearCop); }
  } else if (sirenT !== -1) { sirenT = -1; G.audio.siren(false, 999); }
  if (pl.wanted > 0 && sirenT === -1) sirenT = 0;
  // delayed hack effects and expiring map marks
  for (let i = hack.timers.length - 1; i >= 0; i--) { const t = hack.timers[i]; t.t -= dt; if (t.t <= 0) { hack.timers.splice(i, 1); t.fn(); } }
  for (let i = hack.marks.length - 1; i >= 0; i--) if (G.time > hack.marks[i].until) hack.marks.splice(i, 1);
}

// used by missions: place a hostile gang member
export function spawnEnemy(x, z, weapon = 'pistol') {
  const n = make('enemy', x, z, { shirt: 0x7b1fa2, pants: 0x1a1a1a, skin: pick(SKIN), hat: 0xf7b801 });
  if (n) { n.weapon = weapon; n.char.weapon = weapon; n.state = 'guard'; }
  return n;
}
export function removeEnemy(n) { if (n && !n.gone) removeNpc(n); }
