// missions.js — story missions as data. Each mission is a list of steps; one small
// "step machine" runs them all, so adding a mission means adding data, not new code.
import * as THREE from 'three';
import { G, WEAPONS, dist2 } from './core.js';
import * as V from './vehicles.js';
import * as NPC from './npc.js';
import { SHOPS } from './weapons.js';
import { groundY } from './world.js';

const H = Math.PI / 2;
export const MISSIONS = [
  { id: 'm1', n: 1, title: 'First Gear', giver: [-600, -100], reward: 500, intro: 'A buyer in the Valley wants a Sol Racer. Steal it, deliver it.',
    steps: [
      { t: 'vehicle', type: 'sports', at: [-633.15, -105], yaw: Math.PI, color: 2, text: 'Steal the yellow Sol Racer on Grey St, behind the Wheel' },
      { t: 'goto', at: [800, -720], r: 9, needVehicle: true, text: 'Deliver it to Fortitude Valley, past the Story Bridge' },
    ] },
  { id: 'm2', n: 2, title: 'Rush Order', giver: [-585, -100], reward: 800, intro: 'Three packages across the river, one van, no time.',
    steps: [
      { t: 'vehicle', type: 'van', at: [-633.15, -135], yaw: Math.PI, color: 3, text: 'Get in the delivery van on Grey St, behind the Wheel' },
      { t: 'goto', at: [-560, -80], r: 9, needVehicle: true, timer: 75, text: 'Drop 1 of 3: South Bank' },
      { t: 'goto', at: [-720, 160], r: 9, needVehicle: true, add: 50, text: 'Drop 2 of 3: West End' },
      { t: 'goto', at: [-240, -400], r: 9, needVehicle: true, add: 65, text: 'Drop 3 of 3: Roma Street (back over Kurilpa Bridge)' },
    ] },
  { id: 'm3', n: 3, title: 'River Loop', giver: [-600, -140], reward: 1000, intro: 'Checkpoint race: two bridges, one lap of the city.',
    steps: [
      { t: 'anyVehicle', text: 'Get in any vehicle' },
      ...[[160, -240], [160, -400], [-320, -400], [-480, -400], [-640, -160], [-320, -160], [-320, 240], [0, 240], [0, -80]].map((p, i) =>
        ({ t: 'goto', at: p, r: 11, drive: true, timer: i === 0 ? 70 : undefined, add: i === 0 ? 0 : 18, text: 'Checkpoint ' + (i + 1) + ' of 9' })),
    ] },
  { id: 'm4', n: 4, title: 'Bad Neighbours', giver: [-585, -140], reward: 1500, intro: 'The Purple Hand gang took over the Kangaroo Point cliffs. Move them out.',
    steps: [
      { t: 'give', weapon: 'smg' },
      { t: 'goto', at: [640, 240], r: 30, text: 'Get to Kangaroo Point (footbridge at the end of Alice St)' },
      { t: 'kill', enemies: [[700, 164, 'pistol'], [730, 157, 'smg'], [760, 163, 'pistol'], [790, 158, 'pistol'], [803, 190, 'smg'], [797, 215, 'pistol']], text: 'Take out the Purple Hand' },
    ] },
  { id: 'm5', n: 5, title: 'Heat Wave', giver: [-520, -142], reward: 1200, intro: 'Someone tipped off the police. Shake them.',
    steps: [{ t: 'wanted', n: 3 }, { t: 'lose', text: 'Lose the cops: outrun them or drive into a SPRAY shop' }] },
  { id: 'heist', n: 6, title: 'The Inside Job', giver: [-505, -100], reward: 10000, intro: 'The bank on Queen Street Mall. Fixers on the phones, crew on the street.',
    steps: [
      { t: 'goto', at: [44, -126], r: 6, text: 'Walk into the bank and get to the counter' },
      { t: 'hold', at: [44, -124], r: 17, secs: 45, text: 'Hold the bank while the vault drill runs' },
      { t: 'wanted', n: 4 },
      { t: 'goto', at: [800, -720], r: 10, endTimer: true, text: 'Escape north to the hideout past the Story Bridge' },
    ] },
];

let cur = null, si = 0, ss = null, mv = null, timer = null, giverLock = null, markT = 0;
const done = {};
const beams = [];

function begin(m) {
  cur = m; si = -1; mv = null; timer = null;
  G.mission = { title: m.title, objective: '', timer: null };
  G.hud.banner(m.title.toUpperCase(), m.intro, '#ff9a3d', 3.5); G.audio.ui();
  next();
}
function next() {
  si++;
  if (si >= cur.steps.length) return pass();
  const st = cur.steps[si]; ss = { enemies: null, hold: 0, wave: 0 };
  if (st.timer !== undefined) timer = st.timer;
  if (st.add) { timer = (timer || 0) + st.add; }
  if (st.endTimer) timer = null;
  if (si > 0 && st.t === 'goto') G.audio.pickup();
  G.mission.objective = st.text || '';
}
function cleanup() {
  if (ss && ss.enemies) for (const e of ss.enemies) if (e && e.alive) NPC.removeEnemy(e);
  if (mv) mv.keep = false;
  giverLock = cur.id; cur = null; mv = null; ss = null; timer = null; G.mission = null;
}
function pass() {
  const m = cur; done[m.id] = true;
  G.player.addMoney(m.reward); G.hud.banner('MISSION PASSED', '+$' + m.reward.toLocaleString(), '#7dff8a', 4); G.audio.success();
  const text = G.player.name + ' completed "' + m.title + '"'; G.emit('feed', text); G.net.broadcast('feed', { text });
  cleanup();
}
function fail(why) { G.hud.banner('MISSION FAILED', why, '#ff3d81', 3.5); G.audio.fail(); cleanup(); }

export function startById(id) { const m = MISSIONS.find(x => x.id === id); if (m && !cur && G.player.alive && G.player.role === 'street') begin(m); }

export function init() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3d81, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    mesh.visible = false; G.scene.add(mesh); beams.push(mesh);
  }
  G.on('died', () => { if (cur) fail('You were wasted'); });
  G.on('net:mission', (d) => { if (d && d.id) { if (cur) return; G.hud.message('The host started a heist!', 3); startById(d.id); } });
}

function step(dt) {
  const pl = G.player, st = cur.steps[si], M = G.markers;
  if (timer !== null) { timer -= dt; if (timer <= 0) return fail('Out of time'); }
  G.mission.timer = timer;
  if (mv && (mv.wreck || mv.gone) && si < cur.steps.length) return fail('The vehicle was destroyed');
  switch (st.t) {
    case 'vehicle':
      if (!mv) { mv = V.spawn(st.type, st.at[0], st.at[1], st.yaw, st.color, null); mv.keep = true; }
      M.push({ x: mv.x, z: mv.z, color: '#ffe14d', kind: 'mission', r: 2.5, beam: true });
      if (pl.vehicle === mv) next();
      break;
    case 'anyVehicle': if (pl.state === 'drive') next(); break;
    case 'give': pl.owned[st.weapon] = (pl.owned[st.weapon] || 0) + WEAPONS[st.weapon].pack; pl.weapon = st.weapon; G.hud.message('You got an ' + WEAPONS[st.weapon].name, 3); next(); break;
    case 'wanted': if (pl.wanted < st.n) NPC.setWanted(st.n); next(); break;
    case 'lose': if (pl.wanted === 0) next(); break;
    case 'goto': {
      M.push({ x: st.at[0], z: st.at[1], color: '#ffe14d', kind: 'mission', r: st.r * 0.6, beam: true });
      if (mv && st.needVehicle && pl.vehicle !== mv) { G.mission.objective = 'Get back in the ' + mv.name; M.push({ x: mv.x, z: mv.z, color: '#2de2e6', kind: 'target', r: 2 }); break; }
      G.mission.objective = st.text;
      if (st.drive && pl.state !== 'drive') { G.mission.objective = 'Get back in a vehicle'; break; }
      if (dist2(pl.x, pl.z, st.at[0], st.at[1]) < st.r * st.r) next();
      break;
    }
    case 'kill': {
      if (!ss.enemies) ss.enemies = st.enemies.map(e => NPC.spawnEnemy(e[0], e[1], e[2]));
      let left = 0;
      for (const e of ss.enemies) if (e && e.alive) { left++; M.push({ x: e.x, z: e.z, color: '#ff3d81', kind: 'target' }); }
      G.mission.objective = st.text + '  (' + left + ' left)';
      if (left === 0) next();
      break;
    }
    case 'hold': {
      if (!ss.enemies) { ss.enemies = []; NPC.setWanted(Math.max(pl.wanted, 3)); }
      M.push({ x: st.at[0], z: st.at[1], color: '#ffe14d', kind: 'mission', r: st.r, beam: false });
      const inside = dist2(pl.x, pl.z, st.at[0], st.at[1]) < st.r * st.r;
      if (inside) ss.hold += dt;
      ss.wave -= dt;
      if (ss.wave <= 0) {               // bank guards arrive in waves
        ss.wave = 9;
        for (let k = 0; k < 2; k++) { const p = { x: st.at[0] + (Math.random() - 0.5) * 70, z: st.at[1] - 34 - Math.random() * 10 }; G.world.resolve(p, 1); const e = NPC.spawnEnemy(p.x, p.z, k ? 'smg' : 'pistol'); if (e) { e.aggro = true; ss.enemies.push(e); } }
      }
      for (const e of ss.enemies) if (e && e.alive) M.push({ x: e.x, z: e.z, color: '#ff3d81', kind: 'target' });
      G.mission.objective = (inside ? st.text : 'Get back to the plaza!') + '  — drill ' + Math.floor(ss.hold / st.secs * 100) + '%';
      if (ss.hold >= st.secs) { G.hud.message('Vault open! Grab the cash and run', 3); next(); }
      break;
    }
  }
}

export function update(dt) {
  const pl = G.player, M = G.markers;
  M.length = 0;
  for (const s of SHOPS) M.push({ x: s.x, z: s.z, color: s.kind === 'gun' ? '#ff9a3d' : s.kind === 'spray' ? '#2de2e6' : s.kind === 'casino' ? '#ffe14d' : '#7dff8a', kind: 'shop', label: s.label, r: s.kind === 'spray' ? 3.2 : 1.3 });
  for (const h of NPC.hack.marks) M.push(h);
  if (G.waypoint) {                          // set by clicking the big map
    if (dist2(pl.x, pl.z, G.waypoint.x, G.waypoint.z) < 144) { G.waypoint = null; G.hud.message('Waypoint reached', 2); G.audio.pickup(); }
    else M.push({ x: G.waypoint.x, z: G.waypoint.z, color: '#b06cff', kind: 'target', label: 'WAYPOINT', r: 2.5, beam: true });
  }
  if (cur) step(dt);
  else if (pl.role === 'street') {
    let near = false;
    for (const m of MISSIONS) {
      M.push({ x: m.giver[0], z: m.giver[1], color: done[m.id] ? '#9aa0a8' : '#ff3d81', kind: 'mission', label: String(m.n), r: 1.5 });
      const d2 = dist2(pl.x, pl.z, m.giver[0], m.giver[1]);
      if (d2 < 36 && giverLock === m.id) near = true;
      if (d2 < 6.5 && pl.alive && giverLock !== m.id && !G.ui.lobby && !G.ui.menuOpen) { begin(m); break; }
    }
    if (!near && giverLock && !cur) giverLock = null;
  }
  // 3D light-beam markers (refreshed a few times per second)
  markT -= dt; if (markT > 0) return; markT = 0.1;
  let b = 0;
  for (let i = 0; i < M.length && b < beams.length; i++) {
    const m = M[i]; if (!m.r) continue;
    if (dist2(m.x, m.z, pl.x, pl.z) > 500 * 500) continue;
    const mesh = beams[b++], h = m.beam ? 60 : m.kind === 'shop' ? 4 : 6;
    mesh.visible = true; mesh.material.color.set(m.color); mesh.scale.set(m.r, h, m.r); mesh.position.set(m.x, groundY(m.x, m.z) + h / 2, m.z);
    mesh.material.opacity = m.beam ? 0.3 : 0.42;
  }
  for (; b < beams.length; b++) beams[b].visible = false;
}
