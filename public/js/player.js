// player.js — the local player: walking, driving, camera, health, entering/leaving vehicles.
import * as THREE from 'three';
import { G, WEAPON_ORDER, clamp, angleDiff, dist2 } from './core.js';
import * as V from './vehicles.js';
import * as W from './weapons.js';
import * as NPC from './npc.js';
import { groundY } from './world.js';

const HOSPITALS = [[-530, -108], [9.5, -250], [169.5, 40], [-169.5, -40], [-650, 40], [650, 100], [44, -166]];
const tgt = new THREE.Vector3(), probe = { x: 0, z: 0 };
let vy = 0, respawnT = 0, lookIdle = 9, promptT = 0, hitCool = 0, hornT = 0;

const pl = {
  x: -530, y: 0.18, z: -108, yaw: Math.PI / 2, speed: 0,
  hp: 100, armor: 0, money: 3000, wanted: 0, alive: true, state: 'foot',
  vehicle: null, passengerOf: null,
  weapon: 'pistol', owned: { pistol: 80 },
  name: 'Player', role: 'street', kills: 0, deaths: 0, char: null,
  teleport(x, z) { leaveVehicle(); pl.x = x; pl.z = z; pl.y = groundY(x, z); G.world.resolve(pl, 0.4); },
  damage(amt, by) {
    if (!pl.alive || amt <= 0) return;
    if (pl.armor > 0) { const a = Math.min(pl.armor, amt * 0.7); pl.armor -= a; amt -= a; }
    pl.hp -= amt; G.hud.damageFlash(); G.audio.hurt();
    if (pl.hp <= 0) die(by);
  },
  addMoney(n) { pl.money = Math.max(0, pl.money + Math.round(n)); if (n > 0) G.audio.cash(); },
  setWeapon(k) { if (k === 'fists' || pl.owned[k] !== undefined) { pl.weapon = k; G.audio.ui(); } },
};
Object.defineProperty(pl, 'ammo', { get() { return G.WEAPONS[pl.weapon].melee ? Infinity : (pl.owned[pl.weapon] || 0); } });

const uiBlocked = () => G.ui.lobby || G.ui.menuOpen || G.ui.overlay || G.ui.fixer;

function leaveVehicle() {
  const v = pl.vehicle; pl.passengerOf = null;
  if (pl.state !== 'dead') pl.state = 'foot';
  if (!v) return;
  pl.vehicle = null; G.audio.engine(false, 0, v.type); G.audio.radioOff?.();
  const off = V.VSPEC[v.type].wid / 2 + 0.9;
  for (const side of [1, -1]) {        // try the driver's side first, then the other
    probe.x = v.x + Math.cos(v.yaw) * off * side; probe.z = v.z - Math.sin(v.yaw) * off * side;
    const px = probe.x, pz = probe.z; G.world.resolve(probe, 0.4);
    if (Math.abs(probe.x - px) + Math.abs(probe.z - pz) < 0.5 || side === -1) break;
  }
  pl.x = probe.x; pl.z = probe.z; pl.y = groundY(pl.x, pl.z);
}

function tryEnter() {
  if (!pl.alive || uiBlocked() || (G.flags.frozen && !G.net.isHost)) return;
  if (pl.state === 'drive' || pl.state === 'ride') { leaveVehicle(); return; }
  let best = null, bd = 3.8 * 3.8;
  for (const v of V.list) { if (v.wreck || v.burn > 0) continue; const d = dist2(v.x, v.z, pl.x, pl.z); if (d < bd) { bd = d; best = v; } }
  if (best) {
    if (best.ai === 'cop') { G.hud.message('Locked — officers inside', 2); return; }
    if (best.ai === 'traffic') { NPC.ejectDriver(best); NPC.crime(1); }
    if (best.ai === 'copEmpty') NPC.crime(2);
    best.ai = null; best.shoved = 0; pl.vehicle = best; pl.state = 'drive'; G.audio.ui();
    G.cam.yaw = best.yaw; G.emit('enteredVehicle', best);
    return;
  }
  for (const R of G.net.players.values()) {        // ride along in another player's car
    if (R.state === 'drive' && dist2(R.x, R.z, pl.x, pl.z) < 20) { pl.passengerOf = R.id; pl.state = 'ride'; G.hud.message('Riding with ' + R.name, 2); return; }
  }
}

function cycleWeapon(dir) {
  const have = WEAPON_ORDER.filter(k => k === 'fists' || pl.owned[k] !== undefined);
  pl.setWeapon(have[(have.indexOf(pl.weapon) + dir + have.length) % have.length]);
}

function die(by) {
  pl.hp = 0; pl.alive = false; pl.deaths++; respawnT = 4.5;
  leaveVehicle(); pl.state = 'dead';
  const killer = by != null ? G.net.players.get(by) : null;
  G.hud.banner('WASTED', killer ? 'by ' + killer.name : '', '#ff3d81', 4); G.audio.fail();
  if (killer) {
    const text = killer.name + ' wasted ' + pl.name;
    G.emit('feed', text); G.net.broadcast('feed', { text }); G.net.sendTo(by, 'kill', { name: pl.name });
  }
  G.emit('died');
}

function respawn() {
  let b = HOSPITALS[0], bd = 1e12;
  for (const h of HOSPITALS) { const d = dist2(h[0], h[1], pl.x, pl.z); if (d < bd) { bd = d; b = h; } }
  pl.x = b[0]; pl.z = b[1]; pl.y = groundY(pl.x, pl.z); pl.hp = 100; pl.armor = 0; pl.alive = true; pl.state = 'foot';
  pl.money = Math.max(0, pl.money - Math.min(500, Math.round(pl.money * 0.1)));
  NPC.clearWanted(); G.hud.message('Patched up at the clinic', 3);
}

export function init() {
  G.player = pl; G.cam.yaw = Math.PI / 2; G.cam.shake = 0;
  pl.char = G.chars.spawn({ shirt: 0xff3d81, pants: 0x22283a, skin: 0xe0ac7a, hair: 0x1a1a1a });
  G.on('action', (a) => {
    if (uiBlocked() && a !== 'enter') return;
    if (a === 'enter') tryEnter();
    else if (a === 'next') cycleWeapon(1);
    else if (a === 'prev') cycleWeapon(-1);
    else if (a === 'radio' && pl.state === 'drive') G.hud.message('Radio: ' + (G.audio.radio(true) || 'off'), 2);
    else if (a === 'horn' && pl.state === 'drive') { G.audio.horn(true); hornT = 0.5; NPC.noise(pl.x, pl.z, 15); }
  });
  G.on('weapon', (k) => pl.setWeapon(k));
  G.on('net:hit', (d, from) => { if (G.flags.pvp) pl.damage(d.dmg, from); });
  G.on('net:kill', (d) => { pl.kills++; pl.addMoney(250); G.hud.message('You wasted ' + d.name + '  +$250', 3); });
  G.on('net:feed', (d) => G.emit('feed', d.text));
}

function onFoot(dt, inp, frozen) {
  const cy = G.cam.yaw, fx = Math.sin(cy), fz = Math.cos(cy);
  let mx = fx * inp.moveY - fz * inp.moveX, mz = fz * inp.moveY + fx * inp.moveX;
  let len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; len = 1; }
  if (frozen) len = 0;
  const sp = (inp.sprint ? 8.4 : 4.8) * len;
  pl.x += mx * sp * dt; pl.z += mz * sp * dt; pl.speed = sp;
  let ty = pl.yaw;
  if (len > 0.05) ty = Math.atan2(mx, mz);
  if (inp.fire || inp.aim) ty = cy;
  pl.yaw += angleDiff(ty, pl.yaw) * Math.min(1, 14 * dt);
  if (G.isMobile && Math.abs(inp.moveX) > 0.35 && lookIdle > 0.6) G.cam.yaw -= inp.moveX * 1.1 * dt;   // one-thumb turning
  // jump + gravity
  const gy = groundY(pl.x, pl.z);
  if (inp.jump && pl.y <= gy + 0.02 && !frozen) vy = 6.6;
  vy -= 20 * dt; pl.y += vy * dt;
  if (pl.y <= gy) { pl.y = gy; vy = 0; }
  G.world.resolve(pl, 0.4);
  // vehicles: can't walk through them, and fast ones hurt
  hitCool -= dt;
  for (let i = 0; i < V.list.length; i++) {
    const v = V.list[i], dx = pl.x - v.x, dz = pl.z - v.z, d2 = dx * dx + dz * dz; if (d2 > 12) continue;
    const s = V.VSPEC[v.type], r = s.wid / 2 + 0.35, off = s.len * 0.27;
    for (let k = -1; k <= 1; k += 2) {
      const ex = pl.x - (v.x + Math.sin(v.yaw) * off * k), ez = pl.z - (v.z + Math.cos(v.yaw) * off * k), e2 = ex * ex + ez * ez;
      if (e2 < r * r && e2 > 1e-5 && pl.y < 1.2) {
        const e = Math.sqrt(e2); pl.x += ex / e * (r - e); pl.z += ez / e * (r - e);
        const vs = Math.abs(v.speed);
        if (vs > 5 && hitCool <= 0) { hitCool = 0.8; pl.damage(vs * 1.6, null); vy = 4; }
      }
    }
  }
}

function camera(dt) {
  const cam = G.camera, drive = pl.state === 'drive' || pl.state === 'ride';
  const yaw = G.cam.yaw, p = G.cam.pitch, cp = Math.cos(p), fx = Math.sin(yaw), fz = Math.cos(yaw);
  let dist = drive ? (pl.vehicle && pl.vehicle.type === 'bike' ? 7 : 9.5) : (G.input.aim ? 3.2 : 5.4);
  const sh = drive ? 0 : 0.65;                       // over-the-shoulder offset on foot
  tgt.set(pl.x - fz * sh, pl.y + (drive ? 2.1 : 1.75), pl.z + fx * sh);
  const dx = -fx * cp, dy = Math.sin(p), dz = -fz * cp;
  const hit = G.world.raycast(tgt.x, tgt.y, tgt.z, dx, dy, dz, dist);
  dist = Math.max(0.7, Math.min(dist, hit - 0.35));
  const ceil = G.world.ceilingAt(pl.x, pl.z);                 // indoors: keep the camera under the ceiling
  if (ceil && dy > 0.01) dist = Math.max(0.7, Math.min(dist, (ceil - 0.25 - tgt.y) / dy));
  cam.position.set(tgt.x + dx * dist, tgt.y + dy * dist, tgt.z + dz * dist);
  if (G.cam.shake > 0.001) {
    cam.position.x += (Math.random() - 0.5) * G.cam.shake; cam.position.y += (Math.random() - 0.5) * G.cam.shake;
    G.cam.shake *= Math.exp(-6 * dt);
  }
  cam.lookAt(tgt);
  const zoom = G.input.aim && G.WEAPONS[pl.weapon].zoom && !drive;      // sniper scope
  const fov = zoom ? 16 : 62 + (drive ? Math.min(14, pl.speed * 0.3) : 0);
  if (Math.abs(cam.fov - fov) > 0.3) { cam.fov += (fov - cam.fov) * Math.min(1, 5 * dt); cam.updateProjectionMatrix(); }
}

export function update(dt) {
  const inp = G.input, c = pl.char;
  if (inp.lookDX || inp.lookDY) lookIdle = 0; else lookIdle += dt;
  G.cam.yaw -= inp.lookDX; G.cam.pitch = clamp(G.cam.pitch + inp.lookDY, -0.4, 1.3); inp.lookDX = inp.lookDY = 0;
  if (hornT > 0) { hornT -= dt; if (hornT <= 0) G.audio.horn(false); }

  if (!pl.alive) {
    respawnT -= dt; pl.speed = 0;
    if (respawnT <= 0) respawn();
  } else {
    const frozen = G.flags.frozen && !G.net.isHost;
    if (pl.state === 'drive') {
      const v = pl.vehicle;
      if (v.gone) { leaveVehicle(); }
      else {
        V.drive(v, frozen ? 0 : inp.moveY, frozen ? 0 : inp.moveX, inp.jump || frozen, dt, true);
        pl.x = v.x; pl.y = v.y; pl.z = v.z; pl.yaw = v.yaw; pl.speed = Math.abs(v.speed);
        G.audio.engine(true, clamp(pl.speed / V.VSPEC[v.type].maxSpeed, 0, 1) * 0.85 + 0.12, v.type);
        if ((lookIdle > (G.isMobile ? 0.5 : 1.2)) && pl.speed > 2) G.cam.yaw += angleDiff(v.yaw + (v.speed < -1 ? Math.PI : 0), G.cam.yaw) * Math.min(1, 2.6 * dt);
      }
    } else if (pl.state === 'ride') {
      const R = G.net.players.get(pl.passengerOf);
      if (!R || R.state !== 'drive') leaveVehicle();
      else { pl.x = R.x; pl.y = R.y; pl.z = R.z; pl.yaw = R.yaw; pl.speed = R.speed || 0; }
    } else onFoot(dt, inp, frozen);
    if (inp.fire && !frozen && !uiBlocked()) W.playerFire();
  }

  // show our own character (hidden inside cars, visible on bikes)
  const onBike = pl.state === 'drive' && pl.vehicle && pl.vehicle.type === 'bike';
  c.visible = pl.state === 'foot' || pl.state === 'dead' || onBike;
  c.x = pl.x; c.y = pl.y + (onBike ? 0.75 : 0); c.z = pl.z; c.yaw = pl.yaw;
  c.speed = pl.state === 'foot' ? pl.speed : 0;
  c.pose = !pl.alive ? 'dead' : onBike ? 'sit' : 'stand';
  c.weapon = onBike ? null : pl.weapon;

  // "press F" hint for the nearest vehicle
  promptT -= dt;
  if (promptT <= 0) {
    promptT = 0.2; let txt = null;
    if (pl.alive && pl.state === 'foot' && !G.mission?.prompt) {
      for (const v of V.list) if (!v.wreck && dist2(v.x, v.z, pl.x, pl.z) < 3.8 * 3.8) { txt = 'Press F to ' + (v.ai === 'traffic' ? 'hijack ' : 'enter ') + v.name; break; }
      if (!txt) for (const R of G.net.players.values()) if (R.state === 'drive' && dist2(R.x, R.z, pl.x, pl.z) < 20) { txt = 'Press F to ride with ' + R.name; break; }
    }
    G.hud.prompt(txt || G.mission?.prompt || null);
  }
  camera(dt);
}
