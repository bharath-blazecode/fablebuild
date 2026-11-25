// vehicles.js — vehicle types, their blocky models, and arcade driving physics.
import * as THREE from 'three';
import { G, clamp, dist2 } from './core.js';
import { BoxBatch, groundY } from './world.js';
import { explode, puff } from './weapons.js';
import { crime } from './npc.js';

// maxSpeed in m/s, accel in m/s², turn in rad/s, hp = damage it can take
export const VSPEC = {
  sedan:  { name: 'Sedan',          len: 4.5, wid: 1.9,  maxSpeed: 36, accel: 13, turn: 2.2, hp: 110 },
  sports: { name: 'Sol Racer',      len: 4.4, wid: 1.95, maxSpeed: 54, accel: 21, turn: 2.5, hp: 100 },
  pickup: { name: 'Hauler',         len: 5.2, wid: 2.0,  maxSpeed: 33, accel: 11, turn: 2.0, hp: 150 },
  van:    { name: 'Box Van',        len: 5.4, wid: 2.1,  maxSpeed: 29, accel: 9,  turn: 1.8, hp: 170 },
  police: { name: 'Police Cruiser', len: 4.6, wid: 1.95, maxSpeed: 46, accel: 18, turn: 2.4, hp: 140 },
  bike:   { name: 'Street Bike',    len: 2.2, wid: 0.7,  maxSpeed: 50, accel: 24, turn: 2.8, hp: 60 },
};
export const PAINT = [0xd62828, 0x2176ff, 0xf7b801, 0xf5f5f5, 0x1b1b1e, 0x2ec4b6, 0xff6fb5, 0x7b2cbf, 0xf2f2f2, 0x161616];
export const list = [];
const geo = {};
let paintMats, detailMat;
const WHITE = 0xffffff, GLASS = 0x1c2a3a, TYRE = 0x141414;

function buildGeo(type) {
  const p = new BoxBatch(), d = new BoxBatch(), s = VSPEC[type], W = s.wid, L = s.len;
  const ws = [];                 // wheel positions: [x, radius, z, width]. Wheels are separate meshes so they can spin and steer.
  const wheels = (r, zf) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) ws.push([sx * (W / 2 - 0.12), r, sz * L * zf, 0.3]); };
  const lights = (y) => { for (const sx of [-1, 1]) { d.add(sx * (W / 2 - 0.4), y, L / 2, 0.42, 0.16, 0.08, 0xfff6c0); d.add(sx * (W / 2 - 0.4), y, -L / 2, 0.42, 0.16, 0.08, 0xd01818); } };
  if (type === 'sedan' || type === 'police') {
    p.add(0, 0.62, 0, W, 0.55, L, WHITE);
    d.add(0, 1.13, -0.25, W - 0.22, 0.48, L * 0.46, GLASS);
    p.add(0, 1.4, -0.25, W - 0.16, 0.08, L * 0.48, WHITE);
    wheels(0.34, 0.31); lights(0.66);
    if (type === 'police') {
      d.add(0, 0.62, L * 0.34, W + 0.03, 0.57, L * 0.33, 0x15171c); d.add(0, 0.62, -L * 0.34, W + 0.03, 0.57, L * 0.33, 0x15171c);
      d.add(-0.32, 1.51, -0.25, 0.55, 0.14, 0.3, 0xff2020); d.add(0.32, 1.51, -0.25, 0.55, 0.14, 0.3, 0x2050ff);
    }
  } else if (type === 'sports') {
    p.add(0, 0.5, 0, W, 0.4, L, WHITE);
    d.add(0, 0.86, -0.35, W - 0.3, 0.34, L * 0.38, GLASS);
    p.add(0, 1.06, -0.35, W - 0.34, 0.06, L * 0.34, WHITE);
    p.add(0, 1.0, -L / 2 + 0.25, W, 0.06, 0.36, WHITE);
    for (const sx of [-1, 1]) d.add(sx * (W / 2 - 0.2), 0.84, -L / 2 + 0.25, 0.08, 0.28, 0.1, TYRE);
    wheels(0.32, 0.32); lights(0.55);
  } else if (type === 'pickup') {
    p.add(0, 0.8, 0, W, 0.6, L, WHITE);
    d.add(0, 1.38, 0.55, W - 0.2, 0.56, 1.5, GLASS); p.add(0, 1.69, 0.55, W - 0.14, 0.08, 1.6, WHITE);
    d.add(0, 1.12, -1.4, W - 0.3, 0.06, 2.2, 0x222222);
    for (const sx of [-1, 1]) p.add(sx * (W / 2 - 0.06), 1.22, -1.4, 0.12, 0.26, 2.3, WHITE);
    p.add(0, 1.22, -L / 2 + 0.06, W, 0.26, 0.12, WHITE);
    wheels(0.42, 0.32); lights(0.84);
  } else if (type === 'van') {
    p.add(0, 1.25, -0.25, W, 1.6, L - 0.5, WHITE); p.add(0, 0.9, L / 2 - 0.3, W, 0.9, 0.7, WHITE);
    d.add(0, 1.6, L / 2 - 0.49, W - 0.2, 0.6, 0.06, GLASS);
    for (const sx of [-1, 1]) d.add(sx * W / 2, 1.6, L / 2 - 1.2, 0.06, 0.5, 0.9, GLASS);
    wheels(0.4, 0.32); lights(0.8);
  } else {   // bike
    ws.push([0, 0.36, 0.75, 0.16], [0, 0.36, -0.75, 0.18]);
    d.add(0, 0.62, 0, 0.24, 0.34, 1.3, 0x2a2a2e); p.add(0, 0.95, 0.15, 0.36, 0.26, 0.6, WHITE);
    d.add(0, 0.9, -0.4, 0.32, 0.1, 0.6, 0x111111); d.add(0, 1.12, 0.6, 0.72, 0.06, 0.06, 0x333333);
    d.add(0, 0.85, 0.72, 0.1, 0.6, 0.1, 0x444444); d.add(0, 0.95, 0.86, 0.2, 0.16, 0.06, 0xfff6c0);
  }
  // damage overlay: dark crumpled panels that are switched on when the vehicle is hurt
  const dm = new BoxBatch(), top = type === 'sports' ? 0.71 : type === 'pickup' ? 1.11 : type === 'van' ? 1.36 : type === 'bike' ? 1.09 : 0.9, mid = top - 0.28;
  dm.add(0, mid, L / 2 + 0.02, W * 0.92, 0.34, 0.12, 0x1c1c1c);
  dm.add(W * 0.18, top + 0.02, L * 0.3, W * 0.5, 0.05, L * 0.22, 0x262626);
  for (const sx of [-1, 1]) dm.add(sx * (W / 2 + 0.02), mid, sx * L * 0.12, 0.05, 0.22, L * 0.42, 0x3a3a3a);
  dm.add(-W * 0.2, mid + 0.05, -L / 2 - 0.02, W * 0.4, 0.2, 0.1, 0x1c1c1c);
  return [p.build(), d.build(), ws, dm.build()];
}

let wheelGeo, wheelMat;
function wheelTexture() {            // hub cap with five spokes, so you can see the wheel turning
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#121212'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#b9bec6'; x.beginPath(); x.arc(32, 32, 20, 0, 6.3); x.fill();
  x.strokeStyle = '#2a2a2e'; x.lineWidth = 5;
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20); x.stroke(); }
  x.fillStyle = '#6a6f78'; x.beginPath(); x.arc(32, 32, 5, 0, 6.3); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeMesh(type, colorIdx) {
  const g = new THREE.Group(), body = new THREE.Group(), [pg, dg, ws, dmg] = geo[type];
  const paint = new THREE.Mesh(pg, paintMats[colorIdx] || paintMats[0]), detail = new THREE.Mesh(dg, detailMat), dm = new THREE.Mesh(dmg, detailMat);
  dm.visible = false; paint.castShadow = detail.castShadow = true;
  body.add(paint, detail, dm); g.add(body);
  const wheels = ws.map(w => {
    const m = new THREE.Mesh(wheelGeo, wheelMat); m.position.set(w[0], w[1], w[2]); m.scale.set(w[3], w[1], w[1]);
    m.rotation.order = 'YXZ'; m.castShadow = true; m.userData.front = w[2] > 0; g.add(m); return m;
  });
  g.userData = { body, paint, dm, wheels };
  return g;
}

export function init() {
  paintMats = PAINT.map(c => new THREE.MeshPhongMaterial({ color: c, vertexColors: true, shininess: 90, specular: 0x777777 }));
  detailMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x333333 });
  wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 14); wheelGeo.rotateZ(Math.PI / 2);
  const uv = wheelGeo.attributes.uv; for (let i = 0; i < 30; i++) uv.setXY(i, 0.02, 0.02);     // tyre tread = dark corner of the texture
  wheelMat = new THREE.MeshLambertMaterial({ map: wheelTexture() });
  for (const t in VSPEC) geo[t] = buildGeo(t);
  G.vehicles = { makeMesh, list, VSPEC };
}

export function spawn(type, x, z, yaw, colorIdx = 0, ai = null) {
  const s = VSPEC[type]; if (type === 'police') colorIdx = 8;
  const v = { type, colorIdx, x, y: groundY(x, z), z, yaw, vx: 0, vz: 0, speed: 0, hp: s.hp, maxHp: s.hp, ai, wreck: false, burn: 0, shoved: 0, spin: 0, steer: 0, steerVis: 0, stage: 0, tilt: 0, keep: false, spot: null, gone: false, name: s.name };
  v.mesh = makeMesh(type, colorIdx); v.mesh.position.set(x, v.y, z); v.mesh.rotation.y = yaw;
  G.scene.add(v.mesh); list.push(v); return v;
}
export function remove(v) {
  const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
  G.scene.remove(v.mesh); v.gone = true;
  if (v.spot) { v.spot.v = null; }
}
export function setColor(v, idx) { v.colorIdx = idx; v.mesh.userData.paint.material = paintMats[idx]; }

export function damage(v, amt, byPlayer) {
  if (v.wreck) return;
  v.hp -= amt;
  if (byPlayer && v.ai === 'cop') crime(0.4);
  if (v.hp <= 0 && v.burn <= 0) {
    v.hp = 0; v.burn = 2.6;
    if (G.player.vehicle === v) G.hud.message('Vehicle on fire — get out!', 2.5);
  }
}

// Each vehicle is treated as two circles (front and rear) for collisions.
const probe = { x: 0, z: 0 };
function worldCollide(v, s) {
  const r = s.wid / 2 + 0.15, off = s.len * 0.3; let hitSpeed = 0;
  for (let k = -1; k <= 1; k += 2) {
    probe.x = v.x + Math.sin(v.yaw) * off * k; probe.z = v.z + Math.cos(v.yaw) * off * k;
    const px = probe.x, pz = probe.z;
    if (G.world.resolve(probe, r)) {
      v.x += probe.x - px; v.z += probe.z - pz;
      const nx = G.world.hitNX, nz = G.world.hitNZ, vn = v.vx * nx + v.vz * nz;
      if (vn < 0) { v.vx -= nx * vn * 1.25; v.vz -= nz * vn * 1.25; hitSpeed = Math.max(hitSpeed, -vn); }
    }
  }
  return hitSpeed;
}
function vehicleCollide(v, s, isPlayer) {
  const r = s.wid / 2 + 0.1, off = s.len * 0.27, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  for (let i = 0; i < list.length; i++) {
    const o = list[i]; if (o === v) continue;
    if (dist2(v.x, v.z, o.x, o.z) > 36) continue;
    const so = VSPEC[o.type], ro = so.wid / 2 + 0.1, oo = so.len * 0.27, ox = Math.sin(o.yaw), oz = Math.cos(o.yaw);
    for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
      const dx = (v.x + fx * off * a) - (o.x + ox * oo * b), dz = (v.z + fz * off * a) - (o.z + oz * oo * b);
      const rr = r + ro, d2 = dx * dx + dz * dz; if (d2 >= rr * rr || d2 < 1e-5) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
      v.x += nx * pen * 0.7; v.z += nz * pen * 0.7; o.x -= nx * pen * 0.3; o.z -= nz * pen * 0.3;
      const rel = (v.vx - o.vx) * nx + (v.vz - o.vz) * nz;
      if (rel < 0) {
        v.vx -= nx * rel * 0.75; v.vz -= nz * rel * 0.75; o.vx += nx * rel * 0.55; o.vz += nz * rel * 0.55; o.shoved = 1.5;
        const hit = -rel;
        if (hit > 6) { damage(v, (hit - 6) * 1.2, false); damage(o, (hit - 6) * 1.6, isPlayer); if (isPlayer) { G.audio.punch(); G.cam.shake = Math.min(0.5, hit * 0.02); } }
        if (isPlayer && o.ai === 'traffic' && hit > 4) o.panic = 6;
      }
    }
  }
}

// Arcade driving: thr = throttle (-1..1), steer (-1..1, + = right), hb = handbrake.
export function drive(v, thr, steer, hb, dt, isPlayer) {
  const s = VSPEC[v.type];
  if (v.wreck || v.burn > 0) { thr = 0; }
  v.steer = steer;
  let sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
  let fwd = v.vx * sn + v.vz * cs;
  const sp = Math.abs(fwd);
  // steering: needs some speed to turn, and turns less sharply when going very fast
  const steerF = Math.min(1, sp / 5) * (1 - 0.5 * Math.min(1, sp / s.maxSpeed));
  v.yaw -= steer * s.turn * steerF * (hb ? 1.45 : 1) * (fwd < -0.5 ? -1 : 1) * dt;
  sn = Math.sin(v.yaw); cs = Math.cos(v.yaw);
  fwd = v.vx * sn + v.vz * cs;                    // speed along the car's nose
  let lat = -v.vx * cs + v.vz * sn;               // sideways sliding speed
  if (thr > 0) fwd += (fwd < 0 ? 28 : s.accel * (1 - 0.8 * Math.max(0, fwd) / s.maxSpeed)) * thr * dt;
  else if (thr < 0) fwd += (fwd > 0.5 ? -30 : (fwd > -s.maxSpeed * 0.35 ? -s.accel * 0.6 : 0)) * -thr * dt;
  fwd -= fwd * 0.22 * dt;
  if (thr === 0) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 2.2 * dt);
  if (hb) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 13 * dt);
  fwd = clamp(fwd, -s.maxSpeed * 0.4, s.maxSpeed);
  lat *= Math.exp(-(hb ? 2.0 : 8.5) * dt);        // tyre grip removes sideways speed (less with handbrake = drift)
  v.vx = sn * fwd - cs * lat; v.vz = cs * fwd + sn * lat;
  v.x += v.vx * dt; v.z += v.vz * dt;
  const hit = worldCollide(v, s);
  if (hit > 7) { damage(v, (hit - 7) * 2.2, false); if (isPlayer) { G.audio.punch(); G.cam.shake = Math.min(0.6, hit * 0.025); } }
  vehicleCollide(v, s, isPlayer);
  v.speed = v.vx * sn + v.vz * cs;
  v.y = groundY(v.x, v.z);
}

let spotT = 0;
export function update(dt) {
  const pl = G.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i], driven = pl.vehicle === v;
    // vehicles nobody is driving just coast to a stop
    if (!driven && (v.ai !== 'traffic' && v.ai !== 'cop' || v.shoved > 0)) {
      if (v.vx * v.vx + v.vz * v.vz > 0.01) {
        v.x += v.vx * dt; v.z += v.vz * dt; const k = Math.exp(-2.5 * dt); v.vx *= k; v.vz *= k;
        worldCollide(v, VSPEC[v.type]); v.y = groundY(v.x, v.z);
        v.speed = Math.hypot(v.vx, v.vz);
      } else if (v.ai !== 'traffic' && v.ai !== 'cop') v.speed = 0;
    }
    if (v.shoved > 0) v.shoved -= dt;
    if (v.burn > 0) {
      v.burn -= dt;
      if (Math.random() < dt * 14) puff(v.x, v.y + 1.2, v.z, true);
      if (v.burn <= 0) {
        v.wreck = true; v.ai = null; v.removeT = 25; v.mesh.userData.paint.material = paintMats[9];
        explode(v.x, v.y + 0.8, v.z, 9, 160, driven || v.lastHitByPlayer);
      }
    }
    if (v.wreck) { v.removeT -= dt; if (v.removeT <= 0 && !driven) { remove(v); continue; } }
    // clean up abandoned vehicles far from the player
    if (!driven && !v.keep && (v.ai === null || v.ai === 'copEmpty') && !v.wreck && dist2(v.x, v.z, pl.x, pl.z) > 330 * 330) { remove(v); continue; }
    // ---- looks: spinning/steering wheels, body roll, and damage you can see ----
    const u = v.mesh.userData, sp = v.speed || 0;
    v.spin += sp * dt / 0.36;
    v.steerVis += ((driven || v.ai === 'cop' ? -v.steer * 0.5 : 0) - v.steerVis) * Math.min(1, 10 * dt);
    for (let k = 0; k < u.wheels.length; k++) { const w = u.wheels[k]; w.rotation.x = v.spin; if (w.userData.front) w.rotation.y = v.steerVis; }
    const ratio = v.hp / v.maxHp, stage = v.wreck ? 3 : ratio < 0.35 ? 2 : ratio < 0.7 ? 1 : 0;
    if (stage !== v.stage) {
      v.stage = stage; u.dm.visible = stage >= 1;
      u.body.scale.set(1, stage >= 2 ? 0.92 : 1, stage >= 2 ? 0.97 : 1); v.tilt = stage >= 2 ? (Math.random() < 0.5 ? -0.05 : 0.05) : 0;
    }
    const roll = v.tilt - (driven ? v.steer * Math.min(1, Math.abs(sp) / 25) * 0.07 : 0);
    u.body.rotation.z += (roll - u.body.rotation.z) * Math.min(1, 6 * dt);
    if (!v.wreck && v.burn <= 0 && stage >= 1 && Math.random() < dt * (stage === 2 ? 6 : Math.abs(sp) > 1 ? 1.5 : 0))
      puff(v.x + Math.sin(v.yaw) * 1.6, v.y + 1.1, v.z + Math.cos(v.yaw) * 1.6, true);
    v.mesh.position.set(v.x, v.y, v.z); v.mesh.rotation.y = v.yaw;
  }
  // parked cars appear when the player gets near their spot and disappear when far away
  spotT -= dt;
  if (spotT <= 0) {
    spotT = 0.5; const spots = G.world.spots;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i], d2 = dist2(s.x, s.z, pl.x, pl.z);
      if (s.v && s.v.ai !== 'parked') { s.v.spot = null; s.v = null; s.used = true; }
      if (!s.v && !s.used && d2 < 200 * 200 && list.length < (G.isMobile ? 26 : 40)) { s.v = spawn(s.type, s.x, s.z, s.yaw, s.colorIdx, 'parked'); s.v.spot = s; }
      else if (s.v && d2 > 250 * 250) remove(s.v);
      if (s.used && d2 > 320 * 320) s.used = false;
    }
  }
}
