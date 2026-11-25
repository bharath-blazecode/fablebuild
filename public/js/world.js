// world.js — builds the whole city from one seed.
// Performance idea: thousands of boxes are merged into 3 big meshes, so the graphics card
// receives ~4 draw calls for the entire city instead of thousands.
import * as THREE from 'three';
import { G, makeRng, clamp } from './core.js';

// The real Brisbane CBD has long 200 m x 100 m blocks; here they are 160 x 80 (scale 0.8).
// The game's X axis runs along Queen Street (south-west -> north-east), Z runs towards the Botanic Gardens.
export const PX = 160, PZ = 80;     // distance between road centre lines along X and Z
export const OX = -960, OZ = -960;  // coordinate of the first road line
export const NBX = 12, NBZ = 24;    // number of blocks along X and Z
export const RW = 8;                // half road width
export const EDGE = 955;    // players cannot go further than this from the centre
const CELL = 40;            // collision grid cell size

// Corner signs for the 6 faces of a box: +X, -X, +Y, -Y, +Z, -Z
const FACES = [
  [1, 0, 0, [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
  [-1, 0, 0, [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
  [0, 1, 0, [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
  [0, -1, 0, [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  [0, 0, 1, [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
  [0, 0, -1, [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
];
const SHADE = [0.8, 0.8, 1.0, 0.5, 0.92, 0.92];   // fake ambient shading per face
const tmpC = new THREE.Color();

// Collects many coloured boxes and turns them into ONE mesh geometry.
export class BoxBatch {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.n = 0; }
  // skip = bitmask of faces to leave out (bit 2 = top, bit 3 = bottom)
  add(cx, cy, cz, sx, sy, sz, color, ry = 0, skip = 0) {
    tmpC.setHex(color);
    const cs = Math.cos(ry), sn = Math.sin(ry), hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const F = FACES[f], sh = SHADE[f];
      const U = (f < 2 ? sz : sx) / 16, V = sy / 14;
      for (let k = 0; k < 4; k++) {
        const c = F[3 + k], lx = c[0] * hx, lz = c[2] * hz;
        this.pos.push(cx + lx * cs + lz * sn, cy + c[1] * hy, cz - lx * sn + lz * cs);
        this.nor.push(F[0] * cs + F[2] * sn, F[1], -F[0] * sn + F[2] * cs);
        this.col.push(tmpC.r * sh, tmpC.g * sh, tmpC.b * sh);
        if (f === 2 || f === 3) this.uv.push(0.02, 0.02);
        else this.uv.push(k === 1 || k === 2 ? U : 0, k >= 2 ? V : 0);
      }
      const n = this.n; this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- Brisbane geography ----------
// The river wraps the CBD on three sides. Each entry is [x0, x1, z0, z1].
const WATER = [[-472, -328, -960, 632], [-472, 632, 488, 632], [488, 632, -632, 632], [488, 960, -632, -488]];
const BRIDGES = [
  { name: 'Victoria Bridge', r: [-480, -320, -168, -152] },
  { name: 'Kurilpa Bridge', r: [-480, -320, -408, -392] },
  { name: 'Neville Bonner Bridge', r: [-480, -320, -8, 8], ped: true },
  { name: 'Goodwill Bridge', r: [-480, -320, 392, 408], ped: true },
  { name: 'Captain Cook Bridge', r: [-168, -152, 480, 640] },
  { name: 'Kangaroo Point Bridge', r: [480, 640, 232, 248], ped: true },
  { name: 'Story Bridge', r: [792, 808, -640, -480] },
];
const inR = (r, x, z) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
function bridgeAt(x, z) { for (const b of BRIDGES) if (inR(b.r, x, z)) return b; return null; }
export function isWater(x, z) {
  if (bridgeAt(x, z)) return false;
  for (const w of WATER) if (inR(w, x, z)) return true;
  return false;
}
function zoneOf(x, z) {
  if (x > -320 && x < 480 && z > -400 && z < 240) return 'cbd';
  if (x > 0 && x <= 480 && z > 240 && z <= 480) return 'gardens';
  if (x > -320 && x < 0 && z > 240 && z <= 480) return 'qut';
  if (x > -640 && x <= -480 && z > -480 && z <= 480) return 'southbank';
  if (x < -480) return 'westend';
  if (x > 640 && z > -480 && z < 640) return 'kp';
  if (z > 640) return 'gabba';
  if (x > -320 && x < 0 && z < -400 && z > -720) return 'roma';
  if (x > 480 && z < -640) return 'valley';
  return 'springhill';
}
// Places where cars do not belong: Queen Street Mall, park paths, promenades, footbridges.
export function pedOnly(x, z) {
  const b = bridgeAt(x, z); if (b) return !!b.ped;
  if (Math.abs(z + 160) < 8 && x > -152 && x < 152) return true;                 // Queen Street Mall
  const zn = zoneOf(x, z);
  if (zn === 'gardens' || zn === 'roma') return true;
  if (zn === 'qut') return z > 248;
  if (zn === 'southbank') return z > -80;
  return false;
}
// Can traffic drive from junction (i, j) one step in direction (di, dj)?
export function segOK(i, j, di, dj) {
  const ni = i + di, nj = j + dj; if (ni < 1 || ni > NBX - 1 || nj < 1 || nj > NBZ - 1) return false;
  const x0 = OX + i * PX, z0 = OZ + j * PZ, x1 = OX + ni * PX, z1 = OZ + nj * PZ;
  for (let t = 0.25; t <= 1; t += 0.25) { const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (isWater(x, z) || pedOnly(x, z)) return false; }
  return true;
}
const ZONE_NAME = { cbd: 'Brisbane CBD', gardens: 'City Botanic Gardens', qut: 'Gardens Point', southbank: 'South Bank', westend: 'West End',
  kp: 'Kangaroo Point', gabba: 'Woolloongabba', roma: 'Roma Street Parkland', valley: 'Fortitude Valley', springhill: 'Spring Hill' };
const Z_ST = { '-400': 'Turbot St', '-320': 'Ann St', '-240': 'Adelaide St', '-160': 'Queen St', '-80': 'Elizabeth St', '0': 'Charlotte St', '80': 'Mary St', '160': 'Margaret St', '240': 'Alice St' };
const X_ST = { '-320': 'North Quay', '-160': 'George St', '0': 'Albert St', '160': 'Edward St', '320': 'Creek St', '480': 'Eagle St' };
export function districtAt(x, z) {
  const b = bridgeAt(x, z); if (b) return b.name;
  if (x >= -328 && x <= 488 && z >= -408 && z <= 248) {          // on a named CBD street?
    const lz = Math.round(z / 80) * 80, lx = Math.round(x / 160) * 160;
    if (Math.abs(z - lz) < 8 && Z_ST[lz]) return lz === -160 && x > -152 && x < 152 ? 'Queen Street Mall' : Z_ST[lz];
    if (Math.abs(x - lx) < 8 && X_ST[lx]) return X_ST[lx];
  }
  return ZONE_NAME[zoneOf(x, z)];
}

// Height of the ground: roads are 0, city blocks are raised kerbs.
export function groundY(x, z) {
  if (x < -960 || x > 960 || z < -960 || z > 960) return 0;
  const lx = (x - OX) % PX, lz = (z - OZ) % PZ;
  return (lx > RW && lx < PX - RW && lz > RW && lz < PZ - RW) ? 0.18 : 0;
}
const interiors = [];              // rooms you can walk into: {x0,x1,z0,z1,h}
export function ceilingAt(x, z) { for (const r of interiors) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.h; return 0; }

// ---------- collision: boxes stored in a grid so we only test nearby ones ----------
const colliders = [];            // {x0,x1,z0,z1,h}
const grid = new Map();
let stampArr = null, stamp = 0;
const cellKey = (cx, cz) => (cx + 64) * 256 + (cz + 64);
function addCollider(x0, x1, z0, z1, h) {
  const i = colliders.length; colliders.push({ x0, x1, z0, z1, h });
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = cellKey(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
    }
}

// Push a circle (o.x, o.z, radius r) out of every building it overlaps. Returns true if it touched one.
// The push direction of the last contact is left in G.world.hitNX / hitNZ.
export function resolve(o, r) {
  let hit = false; const W = G.world;
  const cx0 = Math.floor((o.x - r) / CELL), cx1 = Math.floor((o.x + r) / CELL);
  const cz0 = Math.floor((o.z - r) / CELL), cz1 = Math.floor((o.z + r) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const a = grid.get(cellKey(cx, cz)); if (!a) continue;
    for (let n = 0; n < a.length; n++) {
      const c = colliders[a[n]];
      const px = clamp(o.x, c.x0, c.x1), pz = clamp(o.z, c.z0, c.z1);
      const dx = o.x - px, dz = o.z - pz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), push = r - d;
        W.hitNX = dx / d; W.hitNZ = dz / d; o.x += W.hitNX * push; o.z += W.hitNZ * push;
      } else {                    // centre is inside the box: leave by the nearest side
        const l = o.x - c.x0, rr = c.x1 - o.x, t = o.z - c.z0, b = c.z1 - o.z, m = Math.min(l, rr, t, b);
        W.hitNX = 0; W.hitNZ = 0;
        if (m === l) { o.x = c.x0 - r; W.hitNX = -1; } else if (m === rr) { o.x = c.x1 + r; W.hitNX = 1; }
        else if (m === t) { o.z = c.z0 - r; W.hitNZ = -1; } else { o.z = c.z1 + r; W.hitNZ = 1; }
      }
    }
  }
  if (o.x < -EDGE) { o.x = -EDGE; hit = true; W.hitNX = 1; W.hitNZ = 0; }
  if (o.x > EDGE) { o.x = EDGE; hit = true; W.hitNX = -1; W.hitNZ = 0; }
  if (o.z < -EDGE) { o.z = -EDGE; hit = true; W.hitNX = 0; W.hitNZ = 1; }
  if (o.z > EDGE) { o.z = EDGE; hit = true; W.hitNX = 0; W.hitNZ = -1; }
  return hit;
}

// Distance along a ray until it hits a building or the ground (or max).
export function raycast(ox, oy, oz, dx, dy, dz, max) {
  let best = max;
  if (dy < -1e-5) { const t = (groundY(ox, oz) - oy) / dy; if (t >= 0 && t < best) best = t; }
  stamp++;
  const steps = Math.ceil(max / CELL);
  for (let s = 0; s <= steps; s++) {
    const t = s * CELL; if (t - CELL > best) break;
    const bx = Math.floor((ox + dx * t) / CELL), bz = Math.floor((oz + dz * t) / CELL);
    for (let cx = bx - 1; cx <= bx + 1; cx++) for (let cz = bz - 1; cz <= bz + 1; cz++) {
      const a = grid.get(cellKey(cx, cz)); if (!a) continue;
      for (let n = 0; n < a.length; n++) {
        const i = a[n]; if (stampArr[i] === stamp) continue; stampArr[i] = stamp;
        const c = colliders[i];
        // slab test against the box (x0..x1, 0..h, z0..z1)
        let t0 = 0, t1 = best;
        if (Math.abs(dx) < 1e-8) { if (ox < c.x0 || ox > c.x1) continue; }
        else { let a1 = (c.x0 - ox) / dx, a2 = (c.x1 - ox) / dx; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; } if (a1 > t0) t0 = a1; if (a2 < t1) t1 = a2; if (t0 > t1) continue; }
        if (Math.abs(dz) < 1e-8) { if (oz < c.z0 || oz > c.z1) continue; }
        else { let a1 = (c.z0 - oz) / dz, a2 = (c.z1 - oz) / dz; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; } if (a1 > t0) t0 = a1; if (a2 < t1) t1 = a2; if (t0 > t1) continue; }
        if (Math.abs(dy) < 1e-8) { if (oy < 0 || oy > c.h) continue; }
        else { let a1 = (0 - oy) / dy, a2 = (c.h - oy) / dy; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; } if (a1 > t0) t0 = a1; if (a2 < t1) t1 = a2; if (t0 > t1) continue; }
        if (t0 < best) best = t0;
      }
    }
  }
  return best;
}

// ---------- city generator ----------
const SAND = 0xd9c7a0, GLASS_PAL = [0x8fb3d9, 0x6f8fb8, 0x9fd6d2, 0xb8c4d6, 0x7a8aa8, 0xd0d8e8, 0x5f7f9f, 0xa9c0cf];
const MID_PAL = [0xd9b38c, 0xc97b63, 0xe8e0d0, 0xb0a090, 0xd6c6a8, 0x9c6b5a, 0xcfd6dc];
const HOUSE_PAL = [0xfff4e0, 0xf6e6d2, 0xdff0e0, 0xe0e8f8, 0xfbe8a6, 0xffffff];
const ROOFS = [0x8a8f96, 0xb5523b, 0x5f7a66, 0x6a6f78];

function windowTextures() {
  const mk = (lit) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const r = makeRng(7);
    x.fillStyle = lit ? '#000' : '#fff'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const on = r() < 0.55;
      if (lit) x.fillStyle = on ? (r() < 0.5 ? '#ffd98a' : '#bfe6ff') : '#000';
      else { const g = x.createLinearGradient(0, j * 32 + 6, 0, j * 32 + 26); g.addColorStop(0, '#5a7396'); g.addColorStop(1, '#27364d'); x.fillStyle = g; }
      x.fillRect(i * 32 + 4, j * 32 + 6, 24, 20);
      if (!lit) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i * 32, j * 32 + 28, 32, 4); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return [mk(false), mk(true)];
}

let wheel = null;
// CityCat ferries follow the river; bin chickens (ibis) wander the parks and run from you.
const cats = [], birds = [], bm4 = new THREE.Matrix4();
let birdMesh = null;
const CAT_PATH = [[-400, -940], [-400, 560], [560, 560], [560, -560], [940, -560]];
export function update(dt) {
  if (wheel) wheel.rotation.z += dt * 0.12;
  for (const c of cats) {
    const a = CAT_PATH[c.seg], b = CAT_PATH[c.seg + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    c.t += c.dir * 9 * dt / len;
    if (c.t > 1) { if (c.seg < CAT_PATH.length - 2) { c.seg++; c.t = 0; } else { c.t = 1; c.dir = -1; } }
    else if (c.t < 0) { if (c.seg > 0) { c.seg--; c.t = 1; } else { c.t = 0; c.dir = 1; } }
    c.mesh.position.set(a[0] + dx * c.t, Math.sin(G.time * 1.3 + c.seg) * 0.08, a[1] + dz * c.t);
    c.mesh.rotation.y = Math.atan2(dx * c.dir, dz * c.dir);
  }
  const p = G.player; if (!birdMesh || !p) return;
  for (let i = 0; i < birds.length; i++) {
    const b = birds[i], px = b.x - p.x, pz = b.z - p.z, pd = Math.hypot(px, pz);
    let sp = 0.9;
    if (pd < 6) { b.tx = b.x + px / (pd + 0.01) * 8; b.tz = b.z + pz / (pd + 0.01) * 8; sp = 5; }
    else if ((b.t -= dt) <= 0) { b.t = 2 + Math.random() * 5; b.tx = b.hx + (Math.random() - 0.5) * 26; b.tz = b.hz + (Math.random() - 0.5) * 26; }
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { b.x += dx / d * sp * dt; b.z += dz / d * sp * dt; b.yaw = Math.atan2(dx, dz); }
    bm4.makeRotationY(b.yaw); bm4.setPosition(b.x, groundY(b.x, b.z) + (d > 0.3 ? Math.abs(Math.sin(G.time * 9 + i)) * 0.05 : 0), b.z);
    birdMesh.setMatrixAt(i, bm4);
  }
  birdMesh.instanceMatrix.needsUpdate = true;
}

export function init() {
  const rng = makeRng(4000);                 // 4000 is the Brisbane postcode
  const walls = new BoxBatch(), flat = new BoxBatch(), marks = new BoxBatch();
  const spots = [];
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = 1024;
  const m = mapCanvas.getContext('2d'), S = 1024 / 2000;
  const rect = (x0, z0, w, d, col) => { m.fillStyle = col; m.fillRect((x0 + 1000) * S, (z0 + 1000) * S, w * S, d * S); };
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const pick = (a) => a[Math.floor(rng() * a.length)];
  rect(-1000, -1000, 2000, 2000, '#2a6f8f');
  rect(-960, -960, 1920, 1920, '#3b3e47');

  function building(x, z, w, d, h, color, roof = 0x55575e) {
    walls.add(x, h / 2 + 0.2, z, w, h, d, color, 0, 12);
    flat.add(x, h + 0.4, z, w + 0.6, 0.4, d + 0.6, roof, 0, 8);
    if (h > 14 && rng() < 0.6) flat.add(x + (rng() - 0.5) * w * 0.4, h + 1.4, z + (rng() - 0.5) * d * 0.4, 3.5, 1.8, 3, 0x9aa0a8, 0, 8);
    addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h + 0.6);
    rect(x - w / 2, z - d / 2, w, d, hex(color));
  }
  // skyscraper: podium, shaft, set-back top and a crown
  function tower(x, z, w, d, h, color, crown = 0x44464c) {
    building(x, z, w, d, h * 0.72, color);
    walls.add(x, h * 0.86 + 0.2, z, w * 0.78, h * 0.28, d * 0.78, color, 0, 12);
    flat.add(x, h + 0.5, z, w * 0.78, 0.6, d * 0.78, crown, 0, 8);
    flat.add(x, h + 5, z, 0.5, 9, 0.5, 0xcc3333, 0, 8);
  }
  function prop(x, z, w, d, h, color, solid = true, y0 = 0.2) {
    flat.add(x, y0 + h / 2, z, w, h, d, color, 0, 8);
    if (solid) addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
  }
  // a building you can walk into: four thin walls with a door gap on the -Z side, optional floors above
  function hollow(x, z, w, d, h, color, floor, above = 0, sign = 0xff3d81) {
    const t = 0.7, zf = z - d / 2 + t / 2, zb = z + d / 2 - t / 2, door = 3.4, side = (w - door) / 2;
    walls.add(x, h / 2 + 0.2, zb, w, h, t, color); addCollider(x - w / 2, x + w / 2, zb - t / 2, zb + t / 2, h);
    for (const s of [-1, 1]) {
      walls.add(x + s * (w / 2 - t / 2), h / 2 + 0.2, z, t, h, d, color); addCollider(x + s * (w / 2 - t / 2) - t / 2, x + s * (w / 2 - t / 2) + t / 2, z - d / 2, z + d / 2, h);
      const fx = x + s * (door / 2 + side / 2); walls.add(fx, h / 2 + 0.2, zf, side, h, t, color); addCollider(fx - side / 2, fx + side / 2, zf - t / 2, zf + t / 2, h);
    }
    walls.add(x, 3.1 + (h - 2.9) / 2, zf, door, h - 2.9, t, color);
    flat.add(x, 3.4, zf - 0.5, door + 3, 0.7, 0.5, sign);                               // shop sign over the door
    flat.add(x, 0.22, z, w - 1.2, 0.06, d - 1.2, floor, 0, 8);
    flat.add(x, h + 0.25, z, w, 0.3, d, 0xe8e4da);                                      // ceiling
    for (let k = -1; k <= 1; k++) flat.add(x + k * w * 0.28, h + 0.05, z, w * 0.14, 0.1, d * 0.5, 0xfffbe0);
    if (above > 0) { walls.add(x, h + 0.4 + above / 2, z, w, above, d, color, 0, 12); flat.add(x, h + above + 0.6, z, w + 0.6, 0.4, d + 0.6, 0x55575e, 0, 8); }
    interiors.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
    rect(x - w / 2, z - d / 2, w, d, hex(color)); rect(x - 2, z - d / 2 - 1.5, 4, 3, hex(sign));
  }
  function tree(x, z, palm) {
    if (isWater(x, z)) return;
    if (palm) {
      flat.add(x, 3.6, z, 0.5, 7.2, 0.5, 0x8a6a45, 0, 8);
      for (let k = 0; k < 4; k++) flat.add(x, 7.3 + (k & 1) * 0.15, z, 5.2, 0.22, 1.1, k & 1 ? 0x3f9a4a : 0x4fb35a, k * Math.PI / 4);
    } else {
      const s = 0.8 + rng() * 0.6;
      flat.add(x, 1.6 * s, z, 0.6, 3.2 * s, 0.6, 0x6b4a2f, 0, 8);
      flat.add(x, 4.4 * s, z, 4 * s, 3.0 * s, 4 * s, 0x3d8f45, rng()); flat.add(x, 6.2 * s, z, 2.6 * s, 1.6 * s, 2.6 * s, 0x4aa652, rng());
    }
    addCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 7);
    m.fillStyle = '#2f7d3a'; m.beginPath(); m.arc((x + 1000) * S, (z + 1000) * S, 1.6, 0, 6.3); m.fill();
  }
  const trees = (bx0, bz0, n, palmChance = 0.15) => { for (let k = 0; k < n; k++) tree(bx0 + 6 + rng() * 132, bz0 + 5 + rng() * 54, rng() < palmChance); };
  function house(x, z) {                      // a "Queenslander": timber house raised on stumps with a tin roof
    const w = 12 + rng() * 5, d = 10 + rng() * 4;
    flat.add(x, 1.0, z, w - 1.5, 1.6, d - 1.5, 0x6b5a4a, 0, 8);
    walls.add(x, 3.9, z, w, 4.2, d, pick(HOUSE_PAL), 0, 12);
    const rc = pick(ROOFS); flat.add(x, 6.3, z, w + 1.6, 0.5, d + 1.6, rc, 0, 8); flat.add(x, 7.0, z, w * 0.6, 1.0, d + 0.8, rc, 0, 8);
    addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 7); rect(x - w / 2, z - d / 2, w, d, hex(rc));
  }
  // eight building lots per block (4 along X, 2 along Z); `skip` lists lots kept free for something special
  function lots(bx0, bz0, fn, skip) {
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) { if (skip && skip.includes(row * 4 + c)) continue; fn(bx0 + 18 + c * 36, bz0 + 16 + row * 32); }
  }
  const cbdLot = (x, z) => { const h = 30 + rng() * rng() * 130; if (h > 95) tower(x, z, 24 + rng() * 4, 20 + rng() * 4, h, pick(GLASS_PAL)); else building(x, z, 22 + rng() * 6, 19 + rng() * 5, h, pick(rng() < 0.7 ? GLASS_PAL : MID_PAL)); };
  const midLot = (x, z) => building(x, z, 20 + rng() * 8, 18 + rng() * 6, 9 + rng() * 26, pick(MID_PAL), 0x6a5d55);
  const houseLot = (x, z) => { if (rng() < 0.8) house(x, z); if (rng() < 0.7) tree(x + (rng() < 0.5 ? -13 : 13), z + (rng() - 0.5) * 20, rng() < 0.3); };

  // ---- roads: one strip of asphalt between every pair of junctions, unless it is water ----
  const ROAD = 0x3b3e47, PAVE = 0xc9b8a0;
  const strip = (x, z, w, d) => {
    if (isWater(x, z)) return;
    const ped = pedOnly(x, z), br = bridgeAt(x, z);
    flat.add(x, -1, z, w, 2, d, ped ? PAVE : ROAD, 0, br ? 0 : 8);
    rect(x - w / 2, z - d / 2, w, d, ped ? '#c9b8a0' : '#3b3e47');
    if (!ped && w !== d) { if (w > d) marks.add(x, 0.03, z, w - 8, 0.02, 0.35, 0xe8c547, 0, 0b111011); else marks.add(x, 0.03, z, 0.35, 0.02, d - 8, 0xe8c547, 0, 0b111011); }
  };
  for (const w of WATER) rect(w[0], w[2], w[1] - w[0], w[3] - w[2], '#2a6f8f');
  for (let j = 0; j <= NBZ; j++) for (let i = 0; i < NBX; i++) strip(OX + i * PX + 80, OZ + j * PZ, 144, 16);
  for (let i = 0; i <= NBX; i++) for (let j = 0; j < NBZ; j++) strip(OX + i * PX, OZ + j * PZ + 40, 16, 64);
  for (let i = 0; i <= NBX; i++) for (let j = 0; j <= NBZ; j++) strip(OX + i * PX, OZ + j * PZ, 16, 16);
  // river: invisible barriers (with gaps where the bridges are)
  let pieces = WATER.map(w => w.slice());
  for (const b of BRIDGES) {
    const nx = [];
    for (const r of pieces) {
      const q = b.r;
      if (q[0] >= r[1] || q[1] <= r[0] || q[2] >= r[3] || q[3] <= r[2]) { nx.push(r); continue; }
      if (q[0] > r[0]) nx.push([r[0], q[0], r[2], r[3]]); if (q[1] < r[1]) nx.push([q[1], r[1], r[2], r[3]]);
      const a = Math.max(r[0], q[0]), c = Math.min(r[1], q[1]);
      if (q[2] > r[2]) nx.push([a, c, r[2], q[2]]); if (q[3] < r[3]) nx.push([a, c, q[3], r[3]]);
    }
    pieces = nx;
  }
  for (const r of pieces) addCollider(r[0], r[1], r[2], r[3], 0.01);

  // ---- bridges ----
  const STEEL = 0x8d949c;
  for (const b of BRIDGES) {
    const [x0, x1, z0, z1] = b.r, alongX = (x1 - x0) > (z1 - z0), len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const at = (t, off, y, sx, sy, sz, col) => alongX ? flat.add(x0 + t * len, y, cz + off, sx, sy, sz, col, 0, 8) : flat.add(cx + off, y, z0 + t * len, sz, sy, sx, col, 0, 8);
    for (const s of [-1, 1]) at(0.5, s * 8.2, 0.6, len, 1.1, 0.4, b.name === 'Victoria Bridge' ? 0xf2f2f2 : 0xb9bcc2);          // railings
    for (let t = 0.2; t < 0.9; t += 0.3) at(t, 0, -2.2, 3, 3.4, 14, 0x9a9da3);                                                    // piers
    if (b.name === 'Story Bridge') {
      // steel cantilever truss: two peaks over the piers, dipping in the middle
      const hAt = (t) => { const p = Math.min(Math.abs(t - 0.22), Math.abs(t - 0.78)); return Math.max(7, 44 - p * 150); };
      for (const s of [-1, 1]) for (let t = -0.12; t <= 1.12; t += 0.03) {
        const h = hAt(t); at(t, s * 9, h, 5.2, 0.9, 0.9, STEEL);
        if (Math.round(t * 100) % 6 === 0) at(t, s * 9, h / 2, 0.6, h, 0.6, STEEL);
      }
      for (const t of [0.22, 0.78, 0.5]) at(t, 0, hAt(t), 0.9, 0.9, 18.5, STEEL);
    } else if (b.name === 'Kurilpa Bridge') {
      for (let k = 0; k < 14; k++) { const h = 10 + rng() * 22; at(0.08 + k * 0.065, (k & 1 ? 8.6 : -8.6), h / 2, 0.35, h, 0.35, 0xf5f5f5); if (k % 3 === 0) at(0.08 + k * 0.065, 0, h * 0.7, 0.3, 0.3, 17, 0xf5f5f5); }
    } else if (b.name === 'Goodwill Bridge') {
      for (let t = 0.2; t <= 0.8; t += 0.04) { const h = 3 + 22 * (1 - Math.pow((t - 0.5) / 0.3, 2)); at(t, -8.6, h, 7, 0.7, 0.7, 0xdfe3e8); }
    } else if (b.name === 'Kangaroo Point Bridge' || b.name === 'Neville Bonner Bridge') {
      at(0.3, 0, 30, 1.6, 60, 1.6, 0xf2f2f2);
      for (let k = 1; k <= 5; k++) at(0.3 + k * 0.1, 0, 60 - k * 10, 16.5, 0.3, 0.3, 0xdfe3e8);
    }
  }
  // Kangaroo Point cliffs facing the city
  for (let z = -470; z < 470; z += 26) flat.add(626 + rng() * 3, 5, z + 13, 10, 12 + rng() * 6, 26, pick([0xb08a6a, 0xa37c5d, 0xbf9877]), 0, 8);

  // ---- blocks ----
  const special = {
    '5,8': 'cityhall', '4,10': 'casino', '7,8': 'anzac', '7,7': 'central', '7,9': 'postoffice', '7,11': 'cathedral',
    '4,13': 'onewilliam', '6,13': 'skytower', '4,7': 'infinity', '8,10': 'riparian', '8,9': 'riverside', '8,8': 'aurora', '8,7': 'soleil',
    '6,10': 'bank', '5,11': 'gunshop', '5,12': 'safehouse', '4,11': 'wharf', '4,12': 'wharf', '1,13': 'gunshop', '7,22': 'gabba', '2,10': 'wheel', '2,9': 'qpac', '2,8': 'museum', '2,7': 'museum',
  };
  for (let bi = 0; bi < NBX; bi++) for (let bj = 0; bj < NBZ; bj++) {
    const bx0 = OX + bi * PX + RW, bz0 = OZ + bj * PZ + RW, cx = bx0 + 72, cz = bz0 + 32;
    if (isWater(cx, cz)) continue;
    const zn = zoneOf(cx, cz), sp = special[bi + ',' + bj];
    const green = zn === 'gardens' || zn === 'roma' || (zn === 'southbank' && cz > -80) || sp === 'anzac';
    const lotCol = green ? 0x4f9a45 : (zn === 'westend' || zn === 'kp' || zn === 'gabba' || zn === 'springhill') ? 0x6a9a52 : zn === 'qut' ? 0x8fae7a : 0x9a9a9a;
    flat.add(cx, -0.925, cz, 144, 2.15, 64, green ? 0x5aa64e : 0xb9b6ae, 0, 8);
    flat.add(cx, 0.1, cz, 137, 0.2, 57, lotCol, 0, 8);
    rect(bx0, bz0, 144, 64, green ? '#5aa64e' : '#aaa79f'); rect(bx0 + 3.5, bz0 + 3.5, 137, 57, hex(lotCol));

    if (sp === 'cityhall') {                 // City Hall with its clock tower, facing King George Square
      building(cx + 34, cz, 66, 50, 24, SAND, 0x8a9a8f);
      walls.add(cx + 34, 52, cz, 12, 56, 12, SAND, 0, 12); for (const s of [-1, 1]) { flat.add(cx + 34, 70, cz + s * 6.1, 6, 6, 0.3, 0xf8f4e6); flat.add(cx + 34 + s * 6.1, 70, cz, 0.3, 6, 6, 0xf8f4e6); }
      flat.add(cx + 34, 82, cz, 9, 4, 9, 0x7fae9a); flat.add(cx + 34, 87, cz, 4, 6, 4, 0x7fae9a); flat.add(cx + 34, 94, cz, 0.6, 8, 0.6, 0xd8c070, 0, 8);
      for (let k = -3; k <= 3; k++) flat.add(cx - 1, 8, cz + k * 6, 1.6, 15, 1.6, 0xefe2c4, 0, 8);
      flat.add(cx - 36, 0.24, cz, 62, 0.08, 54, 0xcdbfa6, 0, 8);
      for (const s of [-1, 1]) tree(cx - 60, cz + s * 20, false);
      prop(cx - 30, cz, 3, 3, 1.2, 0x8a8f96); flat.add(cx - 30, 2.6, cz, 1, 2.6, 1, 0x6b5a4a, 0, 8);
    } else if (sp === 'casino') {            // Treasury building: sandstone, walk-in gaming floor
      hollow(cx, cz, 124, 50, 7, SAND, 0x7a1f2b, 14, 0xd8b04a);
      for (let k = -3; k <= 3; k++) { if (k === 0) continue; prop(cx + k * 15, cz + 6, 6, 3, 1, 0x1f6b3a); prop(cx + k * 15, cz + 19, 1.2, 1, 1.9, pick([0xff3d81, 0x2de2e6, 0xffe14d]), true); }
    } else if (sp === 'anzac') {             // Anzac Square and the Shrine of Remembrance
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; prop(cx + Math.sin(a) * 7, cz + Math.cos(a) * 7, 1.1, 1.1, 8, 0xefe2c4); }
      flat.add(cx, 8.8, cz, 17, 1.2, 17, 0xefe2c4); flat.add(cx, 0.8, cz, 1.4, 1.2, 1.4, 0xff9a3d);
      for (let k = 0; k < 10; k++) tree(bx0 + 10 + rng() * 124, bz0 + 6 + (k & 1) * 46 + rng() * 6, false);
    } else if (sp === 'central') {           // Central Station
      building(cx, cz + 6, 128, 38, 15, SAND, 0x7a5a4a); tower(cx - 30, cz - 18, 34, 18, 105, 0x9fb6c9);
      flat.add(cx, 19, cz + 6, 8, 7, 8, SAND);
    } else if (sp === 'postoffice') {        // Post Office Square + a tower
      for (let k = 0; k < 7; k++) tree(bx0 + 8 + rng() * 60, bz0 + 6 + rng() * 52, false);
      tower(cx + 36, cz, 50, 46, 175, 0x6f8fb8, 0xd8c070);
    } else if (sp === 'cathedral') {         // St Stephens Cathedral
      building(cx - 20, cz, 50, 24, 20, 0xd8cdb8, 0x5f6670);
      for (const s of [-1, 1]) { walls.add(cx - 43, 18, cz + s * 8, 6, 36, 6, 0xd8cdb8, 0, 12); flat.add(cx - 43, 40, cz + s * 8, 3.5, 8, 3.5, 0x5f6670); flat.add(cx - 43, 46, cz + s * 8, 1.2, 5, 1.2, 0x5f6670); }
      for (let k = 0; k < 6; k++) tree(cx + 20 + rng() * 44, bz0 + 6 + rng() * 52, false);
    } else if (sp === 'onewilliam') { tower(cx, cz, 60, 44, 215, 0x2f4a66, 0x1b2a3a); lots(bx0, bz0, cbdLot, [1, 2, 5, 6]); }
    else if (sp === 'skytower') { tower(cx, cz, 44, 44, 225, 0x9fb6c9, 0xe8eef2); lots(bx0, bz0, cbdLot, [1, 2, 5, 6]); }
    else if (sp === 'infinity') { tower(cx + 20, cz, 40, 40, 205, 0x7a8aa8); lots(bx0, bz0, midLot, [1, 2, 3, 5, 6, 7]); }
    else if (sp === 'riparian') { tower(cx, cz, 50, 44, 200, 0x8fb3d9, 0xf2f2f2); lots(bx0, bz0, cbdLot, [1, 2, 5, 6]); }
    else if (sp === 'riverside') { tower(cx - 30, cz, 46, 44, 150, 0xb8c4d6); tower(cx + 36, cz, 40, 40, 165, 0x5f7f9f); }
    else if (sp === 'aurora') { tower(cx, cz, 44, 40, 190, 0xa9c0cf); lots(bx0, bz0, cbdLot, [1, 2, 5, 6]); }
    else if (sp === 'soleil') { tower(cx + 10, cz, 36, 36, 235, 0xd0d8e8); lots(bx0, bz0, cbdLot, [1, 2, 3, 5, 6, 7]); }
    else if (sp === 'wharf') {               // Queens Wharf: dark podium with towers
      building(cx, cz, 132, 54, 16, 0x2a2f3a, 0x3a5f4a); walls.add(cx - 36, 16 + 65, cz, 34, 130, 30, 0x34506e, 0, 12); walls.add(cx + 36, 16 + 80, cz, 34, 160, 30, 0x3f5f80, 0, 12);
      flat.add(cx, 150, cz, 110, 5, 22, 0xd8b04a);
    } else if (sp === 'bank') {              // the heist target on Queen Street Mall (walk in through the front door)
      hollow(cx - 36, cz, 58, 46, 7, 0xe9d8a6, 0x6f7f8f, 60, 0xb8963c);
      prop(cx - 36, cz + 6, 30, 1.2, 1.2, 0x5a4632); prop(cx - 36, cz + 19, 12, 5, 5.5, 0x8a8f96);          // counter and vault
      flat.add(cx - 36, 3, cz + 16.3, 4, 4, 0.4, 0xd8c070);
      lots(bx0, bz0, cbdLot, [0, 1, 4, 5]);
    } else if (sp === 'gunshop') {
      const x = bx0 + 126, z = bz0 + 16; hollow(x, z, 26, 22, 4.6, 0x7a4a3a, 0x4a4f58, zn === 'cbd' ? 30 : 0, 0xff9a3d);
      prop(x, z + 3.5, 16, 1, 1.1, 0x3a2f28); for (let k = -2; k <= 2; k++) prop(x + k * 4, z + 9.6, 3, 0.8, 2.6, 0x55504a);
      lots(bx0, bz0, zn === 'cbd' ? cbdLot : midLot, [3]);
    } else if (sp === 'safehouse') {
      const x = bx0 + 126, z = bz0 + 16; hollow(x, z, 24, 20, 4.2, 0xcfd6dc, 0x8a6a4a, 24, 0x7dff8a);
      prop(x - 8, z + 7, 5, 2.4, 0.7, 0x3d6fa8); prop(x + 8.5, z + 8, 4, 1.2, 1.6, 0x6b4a2f);
      lots(bx0, bz0, cbdLot, [3]);
    } else if (sp === 'gabba') {             // The Gabba cricket ground
      flat.add(cx, 0.3, cz, 96, 0.1, 40, 0x3f9a3a, 0, 8);
      for (const s of [-1, 1]) { building(cx, cz + s * 26, 120, 10, 22, 0xcfd6dc, 0x8a8f96); building(cx + s * 60, cz, 14, 40, 22, 0xcfd6dc, 0x8a8f96); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) flat.add(cx + sx * 62, 22, cz + sz * 28, 1, 44, 1, 0xdfe3e8, 0, 8);
    } else if (sp === 'wheel') {             // Wheel of Brisbane (the spinning part is added below)
      flat.add(cx, 0.24, cz, 130, 0.08, 54, 0xcdbfa6, 0, 8);
      for (const s of [-1, 1]) prop(cx + s * 9, cz, 1.6, 1.6, 30, 0xf2f2f2);
      for (let k = 0; k < 6; k++) tree(bx0 + 8 + k * 25, bz0 + 6 + (k & 1) * 50, true);
    } else if (sp === 'qpac') { building(cx, cz, 120, 50, 26, 0xd8cdb8, 0x8a8f96); flat.add(cx, 30, cz, 60, 8, 30, 0xc9bda6); }
    else if (sp === 'museum') { building(cx - 30, cz, 60, 46, 18, 0xe8e4da); building(cx + 38, cz, 54, 40, 22, 0xb8c4d6); }
    else if (zn === 'cbd') {
      if (rng() < 0.22) { tower(cx - 36, cz, 56, 44, 110 + rng() * 80, pick(GLASS_PAL)); lots(bx0, bz0, cbdLot, [0, 1, 4, 5]); } else lots(bx0, bz0, cbdLot);
    } else if (zn === 'gardens') {
      trees(bx0, bz0, 16, 0.3);
      if (rng() < 0.5) { flat.add(cx + 20, 0.24, cz, 30, 0.08, 18, 0x4f9fc0, 0, 8); rect(cx + 5, cz - 9, 30, 18, '#4f9fc0'); }
    } else if (zn === 'roma') {
      trees(bx0, bz0, 13, 0.1);
      if (rng() < 0.6) { flat.add(cx, 0.24, cz, 50, 0.08, 26, 0x4f9fc0, 0, 8); rect(cx - 25, cz - 13, 50, 26, '#4f9fc0'); }
    } else if (zn === 'qut') {
      if (cz < 320) { building(cx, cz + 4, 110, 36, 18, SAND, 0x5f8a78); flat.add(cx, 24, cz + 4, 20, 8, 20, 0x5f8a78); }      // Parliament House
      else lots(bx0, bz0, (x, z) => { if (rng() < 0.75) building(x, z, 24, 20, 12 + rng() * 22, pick([0xcfd6dc, 0xb0a090, 0xe8e0d0])); else tree(x, z, false); });
    } else if (zn === 'southbank') {
      if (cz < -80) lots(bx0, bz0, midLot);
      else {                                 // South Bank Parklands: lawns, the Arbour and Streets Beach
        trees(bx0, bz0, 9, 0.45);
        for (let z = bz0 + 4; z < bz0 + 64; z += 8) { flat.add(bx0 + 30, 2.6, z, 0.25, 5, 0.25, 0x8a8f96, 0, 8); flat.add(bx0 + 30, 5.3, z, 3.2, 0.5, 5, 0xc2348f); }
        if (bj === 13 || bj === 14) { flat.add(cx + 34, 0.24, cz, 56, 0.08, 64, 0xead9a8, 0, 8); flat.add(cx + 44, 0.27, cz, 30, 0.08, 56, 0x58c4dc, 0, 8); rect(cx + 6, bz0, 56, 64, '#ead9a8'); rect(cx + 29, bz0 + 4, 30, 56, '#58c4dc'); }
      }
    } else if (zn === 'kp') {
      if (bi === 10) { trees(bx0, bz0, 7, 0.2); lots(bx0, bz0, (x, z) => building(x, z, 22, 20, 18 + rng() * 40, pick(GLASS_PAL)), [0, 4, 1, 5]); }
      else lots(bx0, bz0, rng() < 0.5 ? houseLot : midLot);
    } else if (zn === 'valley') lots(bx0, bz0, (x, z) => building(x, z, 22 + rng() * 6, 18 + rng() * 6, 10 + rng() * 40, pick([0xc97b63, 0xe8e0d0, 0x9c6b5a, 0x8fb3d9, 0xffb38a, 0x6f7680])));
    else if (zn === 'springhill') lots(bx0, bz0, rng() < 0.55 ? midLot : houseLot);
    else lots(bx0, bz0, rng() < 0.3 ? midLot : houseLot);

    // street lamps and (where there is a real road next to the block) a parked-car spot
    for (let k = 0; k < 2; k++) {
      const lx = k ? bx0 + 1 : bx0 + 143, lz = k ? bz0 + 1 : bz0 + 63;
      flat.add(lx, 3.1, lz, 0.22, 6, 0.22, 0x2b2d33, 0, 8); flat.add(lx + (k ? -0.7 : 0.7), 6.1, lz, 1.6, 0.18, 0.4, 0xfff2b0);
    }
    if (rng() < 0.75) {
      const side = Math.floor(rng() * 4), tx = 14 + rng() * 116, tz = 12 + rng() * 40;
      const s = side === 0 ? { x: bx0 + tx, z: bz0 - 1.15, yaw: Math.PI / 2 } : side === 1 ? { x: bx0 + tx, z: bz0 + 65.15, yaw: -Math.PI / 2 }
        : side === 2 ? { x: bx0 - 1.15, z: bz0 + tz, yaw: Math.PI } : { x: bx0 + 145.15, z: bz0 + tz, yaw: 0 };
      const r = rng();
      s.type = zn === 'cbd' ? (r < 0.3 ? 'sports' : r < 0.45 ? 'bike' : r < 0.9 ? 'sedan' : 'van') : (r < 0.5 ? 'sedan' : r < 0.68 ? 'pickup' : r < 0.8 ? 'bike' : r < 0.9 ? 'sports' : 'van');
      s.colorIdx = Math.floor(rng() * 8); s.v = null;
      if (!isWater(s.x, s.z) && !pedOnly(s.x, s.z) && Math.abs(s.x) < 940 && Math.abs(s.z) < 940) spots.push(s);
    }
  }
  // Queen Street Mall furniture
  for (let x = -130; x <= 130; x += 26) { if (Math.abs(x) < 14 || Math.abs(x - 44) < 12) continue; prop(x, -160 + (x % 52 ? 3 : -3), 3, 1.6, 0.7, 0x6a8a5a, true, 0); flat.add(x, 1.4, -160 + (x % 52 ? 3 : -3), 1.6, 1.4, 1, 0x3d8f45, 0, 8); }
  for (const x of [-90, 90]) { for (const s of [-1, 1]) flat.add(x + s * 7, 3, -160, 0.4, 6, 0.4, 0xf2f2f2, 0, 8); flat.add(x, 6.2, -160, 18, 0.3, 9, 0xf5f5f5); }
  stampArr = new Int32Array(colliders.length);

  const [winTex, winLit] = windowTextures();
  const wallMat = new THREE.MeshLambertMaterial({ map: winTex, vertexColors: true, emissive: 0xffffff, emissiveMap: winLit, emissiveIntensity: 0 });
  const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const markMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const add = (geo, mat, shadow) => { const me = new THREE.Mesh(geo, mat); me.matrixAutoUpdate = false; me.frustumCulled = false; me.castShadow = shadow; me.receiveShadow = shadow; G.scene.add(me); return me; };
  add(walls.build(), wallMat, true); add(flat.build(), flatMat, true); add(marks.build(), markMat, false);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshPhongMaterial({ color: 0x2f7d9c, shininess: 90, specular: 0x8fb8c8 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -1.6; G.scene.add(water);

  // Wheel of Brisbane: a slowly turning ring with spokes and gondolas
  wheel = new THREE.Group(); wheel.position.set(-560, 31, -120);
  const wm = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(27, 0.45, 6, 40), wm); t.position.z = s * 1.6; wheel.add(t); }
  for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(54, 0.3, 0.3), wm); sp.rotation.z = k * Math.PI / 6; wheel.add(sp); }
  const gond = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), new THREE.MeshLambertMaterial({ color: 0x9fd6e8 }), 18), gm = new THREE.Matrix4();
  for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283; gm.makeTranslation(Math.cos(a) * 27, Math.sin(a) * 27, 0); gond.setMatrixAt(k, gm); }
  wheel.add(gond); G.scene.add(wheel);

  // CityCat ferries
  const cb = new BoxBatch();
  cb.add(0, -0.9, 0, 7, 1.6, 26, 0x1f5fa8); cb.add(0, 0.7, -1, 6.2, 1.8, 17, 0xf5f5f5); cb.add(0, 1.75, -1, 6.6, 0.3, 18, 0x2a2f3a);
  cb.add(0, 0.9, 8.6, 6.3, 0.9, 0.2, 0x1c2a3a); cb.add(0, 0.2, 11.5, 5, 0.5, 3, 0xf5f5f5); cb.add(0, 2.6, -6, 0.2, 1.6, 0.2, 0xffe14d);
  const catGeo = cb.build(), catMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (let k = 0; k < 4; k++) { const mesh = new THREE.Mesh(catGeo, catMat); mesh.castShadow = true; G.scene.add(mesh); cats.push({ mesh, seg: k % 4, t: (k * 0.37) % 1, dir: k & 1 ? 1 : -1 }); }
  // bin chickens: white ibis with a black head and a long curved beak
  const ib = new BoxBatch();
  ib.add(0, 0.52, 0, 0.26, 0.26, 0.5, 0xf2f0e6); ib.add(0, 0.5, -0.3, 0.2, 0.16, 0.16, 0x1a1a1a);
  ib.add(0, 0.78, 0.26, 0.08, 0.36, 0.08, 0x1a1a1a); ib.add(0, 0.98, 0.3, 0.13, 0.13, 0.16, 0x1a1a1a);
  ib.add(0, 0.93, 0.48, 0.04, 0.05, 0.24, 0x1a1a1a); ib.add(0, 0.85, 0.6, 0.04, 0.12, 0.05, 0x1a1a1a);
  for (const s of [-1, 1]) ib.add(s * 0.07, 0.2, 0, 0.03, 0.4, 0.03, 0x1a1a1a);
  const homes = [[-540, -120, 6], [-560, 200, 4], [0, -160, 5], [-110, -280, 3], [240, 360, 5], [-160, 400, 3]];
  let nb = 0; for (const h of homes) nb += h[2];
  birdMesh = new THREE.InstancedMesh(ib.build(), catMat, nb); birdMesh.frustumCulled = false; birdMesh.castShadow = true; G.scene.add(birdMesh);
  for (const h of homes) for (let k = 0; k < h[2]; k++) birds.push({ hx: h[0], hz: h[1], x: h[0] + (rng() - 0.5) * 20, z: h[1] + (rng() - 0.5) * 20, tx: h[0], tz: h[1], t: rng() * 4, yaw: 0 });
  G.landmarks = [
    [-560, -120, 'Wheel of Brisbane'], [800, -560, 'Story Bridge'], [-400, -160, 'Victoria Bridge'], [-400, -400, 'Kurilpa Bridge'], [-400, 400, 'Goodwill Bridge'],
    [-160, 400, 'QUT Gardens Point'], [240, 360, 'City Botanic Gardens'], [80, -160, 'Queen St Mall'], [-46, -280, 'City Hall'], [-240, -120, 'Treasury Casino'],
    [710, 0, 'Kangaroo Point Cliffs'], [240, 840, 'The Gabba'], [-560, 220, 'South Bank Parklands'], [-160, -560, 'Roma St Parkland'], [720, -800, 'Fortitude Valley'],
    [240, -360, 'Central Station'], [-160, 280, 'Parliament House'], [80, 560, 'Brisbane River'], [-720, -400, 'West End'], [-600, -700, 'South Brisbane'],
  ];

  G.world = {
    SIZE: 2000, mapCanvas, districtAt, groundY, resolve, raycast, spots, hitNX: 0, hitNZ: 0, isWater, pedOnly, segOK, ceilingAt,
    setNight(v) { wallMat.emissiveIntensity = v * 0.9; },
    buildings: colliders.length,
  };
}

