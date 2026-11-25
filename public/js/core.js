// core.js — the shared "bus bar" of the game.
// Every module imports G from here. G holds shared state plus a tiny event system,
// so modules can talk to each other without importing each other directly.
import * as THREE from 'three';

const listeners = {};

// Weapon stats. dmg = damage per hit, rate = seconds between shots, range in metres.
export const WEAPONS = {
  fists:   { name: 'Fists',        dmg: 18,  rate: 0.40, range: 2.4, spread: 0,     pellets: 1, price: 0,    pack: 0, melee: true },
  bat:     { name: 'Baseball Bat', dmg: 48,  rate: 0.55, range: 3.0, spread: 0,     pellets: 1, price: 150,  pack: 0, melee: true, snd: 'fists' },
  pistol:  { name: 'Pistol',       dmg: 24,  rate: 0.26, range: 120, spread: 0.012, pellets: 1, price: 300,  pack: 60 },
  magnum:  { name: 'Magnum',       dmg: 75,  rate: 0.62, range: 160, spread: 0.006, pellets: 1, price: 1200, pack: 24, snd: 'shotgun' },
  smg:     { name: 'SMG',          dmg: 13,  rate: 0.085, range: 110, spread: 0.035, pellets: 1, price: 900,  pack: 150 },
  shotgun: { name: 'Shotgun',      dmg: 12,  rate: 0.80, range: 45,  spread: 0.09,  pellets: 8, price: 1200, pack: 30 },
  rifle:   { name: 'Assault Rifle', dmg: 32, rate: 0.12, range: 220, spread: 0.012, pellets: 1, price: 2500, pack: 120 },
  sniper:  { name: 'Sniper Rifle', dmg: 170, rate: 1.25, range: 450, spread: 0,     pellets: 1, price: 4000, pack: 15, snd: 'rifle', zoom: true },
  minigun: { name: 'Minigun',      dmg: 15,  rate: 0.04, range: 130, spread: 0.05,  pellets: 1, price: 8000, pack: 400, snd: 'smg' },
  flame:   { name: 'Flamethrower', dmg: 7,   rate: 0.05, range: 13,  spread: 0,     pellets: 1, price: 3500, pack: 300, flame: true, snd: 'rpg' },
  grenade: { name: 'Grenades',     dmg: 200, rate: 0.9,  range: 60,  spread: 0,     pellets: 1, price: 800,  pack: 6, lob: true, snd: 'fists' },
  rpg:     { name: 'Rocket Launcher', dmg: 220, rate: 1.4, range: 300, spread: 0,   pellets: 1, price: 5000, pack: 6, rocket: true },
};
export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'magnum', 'smg', 'shotgun', 'rifle', 'sniper', 'minigun', 'flame', 'grenade', 'rpg'];
export const VEHICLE_TYPES = ['sedan', 'sports', 'pickup', 'van', 'police', 'bike'];

export const G = {
  THREE,
  scene: null, camera: null, renderer: null, canvas: null,
  time: 0,          // seconds since game start
  dt: 0,            // last frame time in seconds
  dayTime: 0.35,    // 0..1 (0 = midnight, 0.5 = noon)
  isMobile: (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
            (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900),
  ui: { lobby: true, menuOpen: false, fixer: false, overlay: false },
  flags: { pvp: true, frozen: false },
  // input.js writes this every frame; player.js reads it.
  input: { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, fire: false, aim: false, jump: false, sprint: false },
  cam: { yaw: 0, pitch: 0.25 },
  markers: [],      // minimap markers: {x, z, color, kind, label}
  player: null, world: null, chars: null, vehicles: null,
  // Safe defaults so the game still runs if a module is missing or the server is offline.
  net: { id: null, isHost: false, connected: false, players: new Map(), joinUrl: '', broadcast() {}, sendTo() {}, join() {} },
  hud: new Proxy({}, { get: () => () => {} }),
  audio: new Proxy({}, { get: () => () => {} }),
  WEAPONS, WEAPON_ORDER, VEHICLE_TYPES,
  on(evt, fn) { (listeners[evt] ??= []).push(fn); },
  emit(evt, a, b) { const l = listeners[evt]; if (l) for (let i = 0; i < l.length; i++) l[i](a, b); },
};

// Seeded random number generator (mulberry32): same seed -> same city on every device.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function angleDiff(a, b) {           // shortest signed difference a-b, in radians
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
