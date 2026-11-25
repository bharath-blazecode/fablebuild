// net.js - multiplayer client. Talks to server.js over a WebSocket, keeps G.net.players
// up to date, and draws the other players (character, car, name tag) in the 3D scene.
import * as THREE from 'three';
import { G, WEAPON_ORDER, VEHICLE_TYPES, angleDiff } from './core.js';

const STATES = ['foot', 'drive', 'ride', 'dead'];
const SEND_EVERY = 0.08;      // seconds between state packets (12.5 per second)
const SNAP_DIST = 30;         // further than this from the target -> teleport instead of glide
const TAG_MAX = 120;          // name tags hidden beyond this many metres

let ws = null, wantJoin = null, sendTimer = 0, retryTimer = null;
const r2 = v => Math.round((v || 0) * 100) / 100;

// Stable colours from the player id, so a player looks the same on every screen.
const SHIRTS = [0xe63946, 0x2de2e6, 0xffb703, 0x8338ec, 0x06d6a0, 0xff7b00, 0x3a86ff, 0xff006e];
const PANTS = [0x22223b, 0x3d405b, 0x264653, 0x2b2d42, 0x403d39];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function rawSend(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

// ---- Remote player bookkeeping ----
function makeRemote(p) {
  return {
    id: p.id, name: p.name || 'Player', role: p.role || 'street',
    x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: 'foot', vehType: -1, vehColor: 0, weapon: 0, hp: 100, wanted: 0, alive: true,
    tx: 0, ty: 0, tz: 0, tyaw: 0, fresh: true,      // tx.. = latest target from the server (x.. glide toward it)
    char: null, veh: null, vehKey: '', tag: null,
  };
}
function applyRow(r, d) {       // d = [x,y,z,yaw,speed,stateIdx,vehTypeIdx,vehColor,weaponIdx,hp,wanted]
  r.tx = d[0]; r.ty = d[1]; r.tz = d[2]; r.tyaw = d[3]; r.speed = d[4];
  r.state = STATES[d[5]] || 'foot'; r.vehType = d[6]; r.vehColor = d[7];
  r.weapon = d[8]; r.hp = d[9]; r.wanted = d[10]; r.alive = r.state !== 'dead';
  if (r.fresh) { r.x = r.tx; r.y = r.ty; r.z = r.tz; r.yaw = r.tyaw; r.fresh = false; }
}
function removeVisuals(r) {
  if (r.char && G.chars) G.chars.remove(r.char);
  r.char = null;
  dropVehicle(r);
  if (r.tag) { if (G.scene) G.scene.remove(r.tag); r.tag.material.map.dispose(); r.tag.material.dispose(); r.tag = null; }
}
function dropVehicle(r) { if (r.veh && G.scene) G.scene.remove(r.veh); r.veh = null; r.vehKey = ''; }

function makeTag(name) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(name, 128, 34);
  g.fillStyle = '#fff'; g.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(3, 0.75, 1); spr.renderOrder = 999;
  return spr;
}

// ---- Incoming messages ----
function onMessage(ev) {
  let m; try { m = JSON.parse(ev.data); } catch { return; }
  const N = G.net;
  if (m.t === 'welcome') {
    N.id = m.id; N.isHost = !!m.host;
    for (const p of m.players) if (p.id !== N.id) { const r = makeRemote(p); if (p.d) applyRow(r, p.d); N.players.set(p.id, r); }
    if (m.forcedFixer) { if (G.player) G.player.role = 'fixer'; G.emit('feed', 'Street is full — you are a Fixer'); }
  } else if (m.t === 'join') {
    if (m.p.id === N.id) return;
    const r = makeRemote(m.p); if (m.p.d) applyRow(r, m.p.d);
    N.players.set(m.p.id, r);
    G.emit('feed', `${r.name} joined`);
  } else if (m.t === 'leave') {
    const r = N.players.get(m.id);
    if (r) { removeVisuals(r); N.players.delete(m.id); G.emit('feed', `${r.name} left`); }
  } else if (m.t === 'snap') {
    for (const row of m.s) {
      if (row[0] === N.id) continue;
      const r = N.players.get(row[0]);
      if (r) applyRow(r, row.slice(1));
    }
  } else if (m.t === 'ev') {
    G.emit('net:' + m.k, m.d, m.from);
  }
}

function connect() {
  if (location.protocol === 'file:') return;
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); } catch { return; }
  ws.onopen = () => {
    G.net.connected = true;
    if (wantJoin) rawSend({ t: 'hello', name: wantJoin.name, role: wantJoin.role });   // re-join after a reconnect
  };
  ws.onmessage = onMessage;
  ws.onclose = () => {
    G.net.connected = false; G.net.isHost = false;
    for (const r of G.net.players.values()) removeVisuals(r);
    G.net.players.clear();
    clearTimeout(retryTimer); retryTimer = setTimeout(connect, 3000);
  };
  ws.onerror = () => {};
}

export function init() {
  const N = G.net;
  Object.assign(N, {
    join(name, role) { wantJoin = { name, role }; rawSend({ t: 'hello', name, role }); },
    broadcast(kind, data) { rawSend({ t: 'ev', k: kind, d: data }); },
    sendTo(id, kind, data) { rawSend({ t: 'ev', k: kind, d: data, to: id }); },
  });
  connect();
  fetch('/api/info').then(r => r.json()).then(i => { N.joinUrl = i.joinUrl; }).catch(() => {});

  // Commands from the host (applied here so the host's own copy of the logic lives in one place).
  G.on('net:host', cmd => {
    if (!cmd) return;
    if (cmd.cmd === 'pvp') G.flags.pvp = !!cmd.on;
    else if (cmd.cmd === 'freeze') G.flags.frozen = !!cmd.on;
    else if (cmd.cmd === 'bring' && G.player && G.player.role === 'street' && G.player.teleport)
      G.player.teleport(cmd.x + (Math.random() - 0.5) * 8, cmd.z + (Math.random() - 0.5) * 8);
  });
}

// ---- Per frame ----
export function update(dt) {
  const N = G.net, P = G.player;

  // 1) Send my own state (street players only).
  if (wantJoin && N.id != null && P && P.role === 'street') {
    sendTimer += dt;
    if (sendTimer >= SEND_EVERY) {
      sendTimer = 0;
      const v = P.vehicle;
      const si = Math.max(0, STATES.indexOf(P.state));
      rawSend({ t: 's', d: [r2(P.x), r2(P.y), r2(P.z), r2(P.yaw), r2(P.speed), si,
        v ? VEHICLE_TYPES.indexOf(v.type) : -1, v ? (v.colorIdx | 0) : 0,
        Math.max(0, WEAPON_ORDER.indexOf(P.weapon)), r2(P.hp), P.wanted | 0] });
    }
  }

  // 2) Smooth and draw everyone else.
  if (!G.chars || !G.vehicles || !G.scene) return;
  const k = 1 - Math.exp(-12 * dt);          // exponential smoothing factor (like an RC low-pass filter)
  const cam = G.camera;
  for (const r of N.players.values()) {
    if (r.role !== 'street') continue;
    const dx = r.tx - r.x, dz = r.tz - r.z;
    if (dx * dx + dz * dz > SNAP_DIST * SNAP_DIST) { r.x = r.tx; r.y = r.ty; r.z = r.tz; r.yaw = r.tyaw; }
    else { r.x += dx * k; r.y += (r.ty - r.y) * k; r.z += dz * k; r.yaw += angleDiff(r.tyaw, r.yaw) * k; }

    if (!r.char) {
      const h = r.id * 2654435761 >>> 0;
      r.char = G.chars.spawn({ shirt: SHIRTS[h % SHIRTS.length], pants: PANTS[(h >> 3) % PANTS.length], skin: SKINS[(h >> 6) % SKINS.length] });
    }
    const c = r.char, driving = r.state === 'drive', riding = r.state === 'ride';
    c.x = r.x; c.y = r.y; c.z = r.z; c.yaw = r.yaw; c.speed = r.speed;
    c.weapon = WEAPON_ORDER[r.weapon] || null;
    c.pose = r.alive ? 'stand' : 'dead';
    c.visible = !(driving || riding);

    if (driving && r.vehType >= 0) {
      const key = r.vehType + ':' + r.vehColor;
      if (r.vehKey !== key) {
        dropVehicle(r);
        r.veh = G.vehicles.makeMesh(VEHICLE_TYPES[r.vehType], r.vehColor);
        r.vehKey = key;
        if (r.veh) G.scene.add(r.veh);
      }
      if (r.veh) { r.veh.position.set(r.x, r.y, r.z); r.veh.rotation.y = r.yaw; }
    } else if (r.veh) dropVehicle(r);

    if (!r.tag) { r.tag = makeTag(r.name); G.scene.add(r.tag); }
    r.tag.position.set(r.x, r.y + 2.3, r.z);
    if (cam) {
      const ex = cam.position.x - r.x, ey = cam.position.y - r.y, ez = cam.position.z - r.z;
      r.tag.visible = ex * ex + ey * ey + ez * ez < TAG_MAX * TAG_MAX && r.alive;
    }
  }
}
