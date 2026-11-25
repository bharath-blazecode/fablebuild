// main.js — starts everything and runs the game loop (one "tick" per screen frame).
import * as THREE from 'three';
import { G, clamp } from './core.js';
import * as World from './world.js';
import * as Chars from './chars.js';
import * as Vehicles from './vehicles.js';
import * as Player from './player.js';
import * as Weapons from './weapons.js';
import * as NPC from './npc.js';
import * as Missions from './missions.js';

const mods = {};
let sky, sun, hemi, last = 0, scale = 1, fpsT = 0, fpsN = 0, basePR = 1, shadowsOn = false;
const sunDir = new THREE.Vector3();
const cTop = new THREE.Color(), cBot = new THREE.Color(), cSun = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();

// Sky colour keyframes through the day: [time, sky top, horizon, sun colour, sun strength, ambient strength]
const SKY = [
  [0.00, 0x050a1e, 0x1a2040, 0x8090ff, 0.08, 0.45],
  [0.22, 0x1b2a5c, 0x6a4a7a, 0xff9a6b, 0.25, 0.55],
  [0.30, 0x4a7fd0, 0xffb38a, 0xffd0a0, 0.9, 0.85],
  [0.50, 0x2f86e0, 0xbfe3ff, 0xffffff, 1.5, 1.1],
  [0.70, 0x3a6fc8, 0xffc48a, 0xffd9a8, 1.2, 1.0],
  [0.78, 0x5b3d8f, 0xff7a59, 0xff8a5a, 0.7, 0.8],
  [0.86, 0x1b1f52, 0x7a3d6a, 0xb080ff, 0.2, 0.55],
  [1.00, 0x050a1e, 0x1a2040, 0x8090ff, 0.08, 0.45],
];

function daylight(dt) {
  G.dayTime = (G.dayTime + dt / 600) % 1;                 // one full day every 10 minutes
  let i = 0; while (i < SKY.length - 2 && G.dayTime > SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1], t = (G.dayTime - a[0]) / (b[0] - a[0]);
  cTop.setHex(a[1]).lerp(cA.setHex(b[1]), t); cBot.setHex(a[2]).lerp(cB.setHex(b[2]), t);
  cSun.setHex(a[3]).lerp(cA.setHex(b[3]), t);
  const sI = a[4] + (b[4] - a[4]) * t, aI = a[5] + (b[5] - a[5]) * t;
  sky.material.uniforms.top.value.copy(cTop); sky.material.uniforms.bot.value.copy(cBot);
  G.scene.fog.color.copy(cBot);
  sun.color.copy(cSun); sun.intensity = sI * 1.6; hemi.intensity = aI * 1.5; hemi.color.copy(cTop).lerp(cA.setHex(0xffffff), 0.6); hemi.groundColor.copy(cBot).multiplyScalar(0.6);
  const ang = (G.dayTime - 0.25) * Math.PI * 2;
  sunDir.set(Math.cos(ang) * 0.6, Math.max(0.3, Math.sin(ang)), 0.45).normalize();
  const fx = G.ui.lobby ? 80 : G.player.x, fz = G.ui.lobby ? -80 : G.player.z;       // the sun (and its shadow map) follows the player
  sun.target.position.set(fx, 0, fz); sun.position.set(fx + sunDir.x * 220, sunDir.y * 220, fz + sunDir.z * 220);
  G.world.setNight(clamp(1.2 - sI * 1.6, 0, 1));
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setPixelRatio(basePR * scale); G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
}

async function boot() {
  const canvas = document.getElementById('game'); G.canvas = canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.isMobile && window.devicePixelRatio <= 1.25, powerPreference: 'high-performance' });
  G.renderer = renderer; basePR = Math.min(window.devicePixelRatio || 1, G.isMobile ? 1.5 : 1.25);
  const scene = new THREE.Scene(); G.scene = scene;
  scene.fog = new THREE.Fog(0xbfe3ff, G.isMobile ? 90 : 140, G.isMobile ? 420 : 640);
  G.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2600);
  hemi = new THREE.HemisphereLight(0xffffff, 0x888877, 1.4); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(sun); scene.add(sun.target);
  // Real-time shadows on laptops (phones skip them). The shadow map only covers ~80 m around the player.
  shadowsOn = !G.isMobile;
  renderer.shadowMap.enabled = shadowsOn; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = shadowsOn; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.08;
  const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 500;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 20, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.02, 0.55, h)), 1.0);\n#include <colorspace_fragment>\n}',
  }));
  sky.frustumCulled = false; scene.add(sky);
  G.dayTime = 0.66;

  World.init(); Chars.init(); Vehicles.init(); Weapons.init(); NPC.init(); Player.init(); Missions.init();
  resize(); window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // Optional modules: if one fails to load, the rest of the game still runs.
  for (const name of ['audio', 'hud', 'input', 'net', 'fixer', 'lobby']) {
    try { mods[name] = await import('./' + name + '.js'); mods[name].init?.(); }
    catch (e) { console.error('module ' + name + ' failed', e); window.__err?.('module ' + name + ': ' + e.message); }
  }
  G.on('start', (d) => {
    G.player.name = d.name || 'Player'; G.player.role = d.role || 'street';
    if (G.player.role === 'street') G.hud.banner('BRISBANE', 'Walk into a pink marker to start a mission', '#ff9a3d', 5);
  });
  if (!mods.lobby) { G.ui.lobby = false; }
  document.getElementById('loading')?.remove();
  requestAnimationFrame(frame);
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
  G.dt = dt; G.time += dt;
  mods.input?.update?.(dt);
  if (G.player.role === 'fixer' && !G.ui.lobby) {           // fixers get the 2D map instead of the 3D world
    if (!G.ui.fixer) mods.fixer?.open?.();
    G.player.char.visible = false; mods.net?.update?.(dt); return;
  }
  if (G.ui.lobby) {                                          // title screen: slow fly-over of downtown
    const a = G.time * 0.06;
    G.camera.position.set(80 + Math.sin(a) * 430, 150 + Math.sin(a * 0.7) * 40, -80 + Math.cos(a) * 430); G.camera.lookAt(80, 60, -80);
    G.input.lookDX = G.input.lookDY = 0;
  } else Player.update(dt);
  World.update(dt); NPC.update(dt); Vehicles.update(dt); Weapons.update(dt); Missions.update(dt); Chars.update(dt);
  mods.net?.update?.(dt); mods.hud?.update?.(dt);
  daylight(dt);
  sky.position.copy(G.camera.position);
  G.renderer.render(G.scene, G.camera);

  // automatic quality: if the frame rate drops, render fewer pixels; if there is headroom, render more
  fpsT += dt; fpsN++;
  if (fpsT >= 2) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; G.fps = fps;
    const old = scale;
    if (fps < 40 && shadowsOn) { shadowsOn = false; sun.castShadow = false; }          // first drop shadows, then resolution
    else if (fps < 42) scale = Math.max(0.5, scale - 0.12); else if (fps > 56) scale = Math.min(1, scale + 0.06);
    if (scale !== old) resize();
  }
}

boot().catch((e) => { console.error(e); window.__err?.(e.message); });
