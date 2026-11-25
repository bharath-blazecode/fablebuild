// chars.js — every person in the game (you, pedestrians, police, other players).
// Performance idea: "instancing". Each body-part TYPE is ONE InstancedMesh that the GPU stamps
// out many times (like one blueprint printed 96 times), so 96 people cost ~11 draw calls.
// Each frame we pose a little skeleton in code: hips swing, knees and elbows bend, torso leans.
// Character space: feet at y=0, the person faces +Z, their LEFT side is +X, RIGHT side is -X.
import * as THREE from 'three';
import { G } from './core.js';

const MAX = 96;
const list = new Array(MAX).fill(null);

// Reusable temporaries (so update() never creates garbage for the GC to clean up).
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const M0 = new THREE.Matrix4(), UM = new THREE.Matrix4(), LM = new THREE.Matrix4(), TM = new THREE.Matrix4();
const P = new THREE.Vector3(), S = new THREE.Vector3(), V = new THREE.Vector3(), V2 = new THREE.Vector3();
const END = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
const Q = new THREE.Quaternion(), QY = new THREE.Quaternion(), QX = new THREE.Quaternion();
const E = new THREE.Euler(), E2 = new THREE.Euler();
const AXY = new THREE.Vector3(0, 1, 0), AXX = new THREE.Vector3(1, 0, 0);
const col = new THREE.Color();

// Body measurements in metres (a real adult is about 1.8 m tall).
const HIP_Y = 0.93, THIGH = 0.43, SHIN = 0.43, UARM = 0.29, FARM = 0.26, SHOULDER_Y = 1.42;
// Gun sizes [width, height, length]; the gun is a dark box stretched to these.
const GUN = {
  pistol: [0.05, 0.1, 0.22], magnum: [0.06, 0.12, 0.3], smg: [0.06, 0.14, 0.45],
  shotgun: [0.06, 0.09, 0.85], rifle: [0.06, 0.1, 0.9], sniper: [0.06, 0.1, 1.1],
  minigun: [0.14, 0.14, 0.8], flame: [0.12, 0.14, 0.8], rpg: [0.14, 0.14, 1.1],
};
const LONG = new Set(['smg', 'shotgun', 'rifle', 'sniper', 'minigun', 'flame', 'rpg']);
let parts = null;

// Make one InstancedMesh. n = how many instances per person (2 for left+right pairs).
function part(geo, n) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX * n);
  m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAX * n; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, col.setHex(0xffffff)); }
  G.scene.add(m); return m;
}
// A limb is a tapered cylinder hanging DOWN from its joint (origin at the top).
function limbGeo(rTop, rBot) { const g = new THREE.CylinderGeometry(rTop, rBot, 1, 7); g.translate(0, -0.5, 0); return g; }
function blob(sx, sy, sz, seg, rows) { const g = new THREE.SphereGeometry(0.5, seg, rows); g.scale(sx, sy, sz); return g; }

export function init() {
  parts = {
    torso: part(new THREE.CylinderGeometry(0.5, 0.37, 1, 8), 1),      // chest wide, waist narrow
    pelvis: part(new THREE.CylinderGeometry(0.5, 0.45, 1, 8), 1),
    head: part(new THREE.IcosahedronGeometry(0.5, 1), 1),
    hair: part(new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), 1), // hair / cap
    uarm: part(limbGeo(0.05, 0.042), 2),
    farm: part(limbGeo(0.04, 0.03), 2),
    ball: part(new THREE.SphereGeometry(0.5, 6, 5), 3),               // left hand, right hand, neck
    thigh: part(limbGeo(0.085, 0.06), 2),
    shin: part(limbGeo(0.055, 0.04), 2),
    shoe: part(blob(0.1, 0.08, 0.27, 7, 5), 2),
    gun: part(new THREE.BoxGeometry(1, 1, 1), 1),                     // also used for the bat
  };
  G.chars = { spawn, remove };
}

// Colour every instance (index k*MAX+i) of one mesh, for k = 0..n-1.
function paint(m, hex, i, n) {
  col.setHex(hex);
  for (let k = 0; k < n; k++) m.setColorAt(k * MAX + i, col);
  m.instanceColor.needsUpdate = true;
}
// Make a person invisible: shrink every one of their instances to nothing.
function hide(i) {
  for (const k in parts) { const m = parts[k], n = m.count / MAX; for (let j = 0; j < n; j++) m.setMatrixAt(j * MAX + i, ZERO); }
}

export function spawn(o = {}) {
  const i = list.indexOf(null); if (i < 0) return null;
  const c = { i, x: 0, y: 0, z: 0, yaw: 0, speed: 0, pose: 'stand', visible: true, weapon: null,
              phase: Math.random() * 6, punchT: 0, hat: o.hat != null };
  list[i] = c;
  const shirt = o.shirt ?? 0x3377cc, pants = o.pants ?? 0x333344, skin = o.skin ?? 0xe0b090;
  paint(parts.torso, shirt, i, 1); paint(parts.uarm, shirt, i, 2);
  paint(parts.pelvis, pants, i, 1); paint(parts.thigh, pants, i, 2); paint(parts.shin, pants, i, 2);
  paint(parts.head, skin, i, 1); paint(parts.farm, skin, i, 2); paint(parts.ball, skin, i, 3);
  paint(parts.hair, o.hat ?? o.hair ?? 0x2a1a10, i, 1);
  paint(parts.shoe, 0x181818, i, 2); paint(parts.gun, 0x1a1a1a, i, 1);
  return c;
}
export function remove(c) {
  if (!c || list[c.i] !== c) return;
  list[c.i] = null; hide(c.i);
}

// Place one part: position p, Euler rotation (rx about X = swing, rz about Z = splay), scale s,
// all in the parent's space (pm = the parent matrix, i.e. "where the body is in the world").
function put(m, idx, pm, px, py, pz, rx, rz, sx, sy, sz) {
  E.set(rx, 0, rz); Q.setFromEuler(E);
  TM.compose(P.set(px, py, pz), Q, S.set(sx, sy, sz)).premultiply(pm);
  m.setMatrixAt(idx, TM);
}
// Two-segment limb (upper + lower) hanging from joint (px,py,pz).
// a1/a2 = forward swing angle of each segment in radians (positive = forward). Leaves the
// end point (wrist or ankle) in END so hands, shoes and guns can be attached to it.
function chain(up, lo, idx, pm, px, py, pz, a1, a2, rz, l1, l2) {
  put(up, idx, pm, px, py, pz, -a1, rz, 1, l1, 1);
  V.set(0, -l1, 0).applyEuler(E.set(-a1, 0, rz)).add(P.set(px, py, pz));          // knee / elbow
  put(lo, idx, pm, V.x, V.y, V.z, -a2, rz, 1, l2, 1);
  END.copy(V2.set(0, -l2, 0).applyEuler(E2.set(-a2, 0, rz))).add(V);
}

export function update(dt) {
  const t = G.time || 0;
  for (let i = 0; i < MAX; i++) {
    const c = list[i]; if (!c) continue;
    if (!c.visible) { hide(i); continue; }
    if (c.punchT > 0) c.punchT -= dt;
    const dead = c.pose === 'dead', sit = c.pose === 'sit', moving = !dead && !sit;
    const w = c.weapon, gun = !dead && !sit && w && GUN[w] ? GUN[w] : null;
    if (moving) c.phase += c.speed * dt * 2.4;
    const amp = moving ? Math.min(1, c.speed * 0.7) : 0;              // 0 = standing, 1 = walking+
    const A = 0.3 + Math.min(c.speed, 8) * 0.075;                     // hip swing size (bigger when running)
    const s = Math.sin(c.phase) * amp, cs = Math.cos(c.phase);
    const breath = Math.sin(t * 1.8 + i);

    // --- the body's root matrix: position, facing, bob, and lying down when dead ---
    const bob = Math.abs(cs) * 0.035 * amp * Math.min(1, c.speed / 3);
    P.set(c.x, c.y + bob + (dead ? 0.12 : sit ? -0.45 : 0), c.z);
    QY.setFromAxisAngle(AXY, c.yaw);
    if (dead) QY.multiply(QX.setFromAxisAngle(AXX, -Math.PI / 2));   // tip over onto the back
    M0.compose(P, QY, ONE);
    // Upper body = root matrix + a forward lean about the hips.
    const lean = dead ? 0 : (sit ? 0.18 : 0.03 + Math.min(c.speed, 8) * 0.025 + breath * 0.008);
    LM.makeRotationX(lean);
    V.set(0, HIP_Y, 0); V2.copy(V).applyMatrix4(LM); LM.setPosition(V.sub(V2));
    UM.multiplyMatrices(M0, LM);

    // --- legs ---
    const lSwing = sit ? 1.45 : s * A, rSwing = sit ? 1.45 : -s * A;
    const lKnee = sit ? 1.45 : A * 1.1 * amp * Math.max(0, -cs) * (s > 0 ? 1 : 0.4) + 0.05 * amp;
    const rKnee = sit ? 1.45 : A * 1.1 * amp * Math.max(0, cs) * (s < 0 ? 1 : 0.4) + 0.05 * amp;
    const legSplay = dead ? 0.15 : sit ? 0.12 : 0.03;
    chain(parts.thigh, parts.shin, i, M0, 0.09, HIP_Y, 0, lSwing, lSwing - lKnee, legSplay, THIGH, SHIN);
    put(parts.shoe, i, M0, END.x, END.y - 0.02, END.z + 0.06, -(lSwing - lKnee) * 0.6, 0, 1, 1, 1);
    chain(parts.thigh, parts.shin, MAX + i, M0, -0.09, HIP_Y, 0, rSwing, rSwing - rKnee, -legSplay, THIGH, SHIN);
    put(parts.shoe, MAX + i, M0, END.x, END.y - 0.02, END.z + 0.06, -(rSwing - rKnee) * 0.6, 0, 1, 1, 1);

    // --- arms: swing opposite to the legs; elbows bend forward ---
    let aL = -s * A * 0.9, aR = s * A * 0.9, rzL = 0.12 + 0.05 * amp, rzR = -rzL;
    let eL = 0.15 + amp * (0.2 + 0.7 * Math.max(0, aL)), eR = 0.15 + amp * (0.2 + 0.7 * Math.max(0, aR));
    if (dead) { aL = aR = 0; eL = eR = 0.1; rzL = 0.45; rzR = -0.45; }
    if (sit) { aL = aR = 1.0; eL = eR = 0.25; rzL = -0.05; rzR = 0.05; }   // hands on the handlebars
    let swingR = 0, gunLen = 0;
    if (gun) {                                                        // gun: right arm raised forward
      const long = LONG.has(w);
      aR = long ? 1.0 : 1.3; eR = long ? 0.35 : 0.2; rzR = 0.15;
      if (long) { aL = 1.15; eL = 0.3; rzL = -0.3; }                  // left hand supports the gun
    } else if (c.punchT > 0 && moving) {                              // punch / bat swing
      swingR = Math.sin(Math.PI * (1 - Math.min(1, c.punchT / 0.25)));
      aR = 0.3 + swingR * (w === 'bat' ? 1.7 : 1.3); eR = 0.3 + swingR * 0.5; rzR = -0.05;
    } else if (w === 'bat' && moving) { aR = 0.8; eR = 0.7; rzR = 0.1; }  // holding the bat ready
    chain(parts.uarm, parts.farm, i, UM, 0.24, SHOULDER_Y, 0, aL, aL + eL, rzL, UARM, FARM);
    put(parts.ball, i, UM, END.x, END.y - 0.02, END.z, 0, 0, 0.085, 0.1, 0.085);
    chain(parts.uarm, parts.farm, MAX + i, UM, -0.24, SHOULDER_Y, 0, aR, aR + eR, rzR, UARM, FARM);
    put(parts.ball, MAX + i, UM, END.x, END.y - 0.02, END.z, 0, 0, 0.085, 0.1, 0.085);

    // --- held item (gun or bat), attached at the right hand ---
    if (gun) {
      gunLen = gun[2];
      put(parts.gun, i, UM, END.x, END.y + 0.02, END.z + gunLen * 0.3, 0, 0, gun[0], gun[1], gunLen);
    } else if (w === 'bat' && moving) {
      const tilt = 0.6 + swingR * 0.5;                                // bat points up and forward
      put(parts.gun, i, UM, END.x, END.y + 0.28 * Math.cos(tilt), END.z + 0.28 * Math.sin(tilt), tilt, 0, 0.045, 0.95, 0.045);
    } else parts.gun.setMatrixAt(i, ZERO);

    // --- torso, pelvis, neck, head, hair/cap ---
    const br = 1 + breath * 0.015;
    put(parts.pelvis, i, M0, 0, HIP_Y + 0.04, 0, 0, 0, 0.34, 0.2, 0.22);
    put(parts.torso, i, UM, 0, 1.22, 0, 0, 0, 0.46 * br, 0.52, 0.25 * br);
    put(parts.ball, 2 * MAX + i, UM, 0, 1.54, 0, 0, 0, 0.09, 0.12, 0.09);
    put(parts.head, i, UM, 0, 1.67, 0.01, 0, 0, 0.16, 0.23, 0.19);
    if (c.hat) put(parts.hair, i, UM, 0, 1.68, 0.03, 0, 0, 0.18, 0.18, 0.23);   // peaked cap
    else put(parts.hair, i, UM, 0, 1.67, 0.0, 0, 0, 0.17, 0.25, 0.2);
  }
  for (const k in parts) parts[k].instanceMatrix.needsUpdate = true;
}
