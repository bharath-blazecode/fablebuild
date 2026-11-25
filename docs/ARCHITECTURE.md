# Port Solara: Inside Job — architecture and module contract

Open-world crime sandbox that runs in a browser. Three.js (ES modules, **no build step**) for
3D, a small Node.js server (`ws`) for multiplayer. Guests join from phones by scanning a QR code.
Roles: **street** (full 3D character) or **fixer** (2D tactical map on the phone that triggers "hacks").

## Files and owners (never edit a file you do not own)

| File | Owner | Purpose |
|---|---|---|
| `package.json`, `public/index.html`, `public/js/core.js` | lead | deps (`three`, `ws`, `qrcode`), `"type":"module"`, shared state `G` |
| `public/js/main.js, world.js, chars.js, player.js, vehicles.js, weapons.js, npc.js, missions.js` | lead | game simulation |
| `server.js`, `public/js/net.js`, `public/js/lobby.js` | agent NET | server, multiplayer client, title/join screen, QR + host panel |
| `public/js/input.js`, `public/js/hud.js` | agent UI | keyboard/mouse + touch controls, HUD, minimap, menus |
| `public/js/fixer.js`, `public/js/audio.js` | agent FX | fixer phone screen, procedural sound |

## Conventions

- `import * as THREE from 'three'` (import map in index.html). Shared state: `import { G, WEAPONS, WEAPON_ORDER, clamp, lerp } from './core.js'`. **Read `public/js/core.js` first.**
- Each module exports `init()` (called once, after the world exists, while the lobby is showing) and optionally `update(dt)` (every frame, `dt` seconds ≤ 0.05). `main.js` calls them. Do not start your own `requestAnimationFrame` loop (exception: fixer.js while fixer mode is active).
- Modules build their own DOM (append to `document.body`) and inject their own CSS with a `<style>` tag. Prefix ids/classes: `hud-`, `tc-` (touch controls), `lob-`, `net-`, `fx-`. z-index: canvas 0, HUD 10, touch controls 20, menus 30, fixer 40, lobby 50, overlays (QR, host panel) 60.
- No external assets, fonts, CDNs or frameworks. Must work offline on a LAN. System font stack only.
- Performance matters (low-end laptop + phones): no per-frame allocations in hot paths, only touch the DOM when a value changed, canvas 2D drawing at most ~20 fps for minimaps.
- `G.net`, `G.hud`, `G.audio` start as safe no-op defaults. In your `init()` use `Object.assign(G.net, {...})` for net (keep the same object), and assign `G.hud = {...}` / `G.audio = {...}` for the others.
- Coordinates: Y up, ground y = 0, world spans x,z ∈ [-1000, 1000] metres. `yaw` is rotation about Y; forward = `(sin yaw, 0, cos yaw)`.
- `G.isMobile` is true on touch phones/tablets.

## Shared state (written by lead modules, read by everyone)

```
G.player = {
  x, y, z, yaw, speed,            // speed in m/s
  hp, armor,                      // 0..100
  money, wanted,                  // wanted = 0..5 stars
  alive, state,                   // state: 'foot' | 'drive' | 'ride' | 'dead'
  vehicle,                        // null or { type, colorIdx, x, y, z, yaw, speed, hp, maxHp }  (type ∈ G.VEHICLE_TYPES)
  passengerOf,                    // null or remote player id (riding in their car)
  weapon,                         // key of WEAPONS, current weapon
  owned,                          // { pistol: ammoCount, ... } weapons the player has (fists always)
  ammo,                           // ammo of current weapon (Infinity for fists)
  name, role,                     // role: 'street' | 'fixer'
  kills, deaths,
  teleport(x, z), damage(amount, byId), addMoney(n), setWeapon(key),
}
G.cam      = { yaw, pitch }                       // camera orbit angles (player.js applies input look deltas)
G.dayTime  = 0..1                                 // 0 midnight, 0.5 noon
G.markers  = [{ x, z, color:'#rrggbb', kind:'mission'|'shop'|'target'|'drop'|'safe', label? }]   // lead rewrites; minimap draws
G.world    = { SIZE: 2000, mapCanvas, districtAt(x,z) -> string }
             // mapCanvas: 1024x1024 <canvas> top-down city picture. px = (x+1000)/2000*1024, py = (z+1000)/2000*1024  (north = -z = up)
G.ui       = { lobby, menuOpen, fixer, overlay }  // booleans; when lobby/menuOpen/overlay is true, gameplay input is ignored
G.flags    = { pvp, frozen }
G.mission  = null | { title, objective, timer }   // timer: seconds left or null
G.chars    = { spawn({shirt,pants,skin,hat}) -> c, remove(c) }
             // colours are 0xRRGGBB numbers. Each frame set: c.x c.y c.z c.yaw c.speed (m/s, drives the walk animation)
             // c.pose ('stand'|'sit'|'dead'), c.visible (bool), c.weapon (WEAPONS key or null)
G.vehicles = { makeMesh(type, colorIdx) -> THREE.Object3D }   // for remote players' cars; add to G.scene, set position + rotation.y
```

## Events (`G.on(name, fn)`, `G.emit(name, a, b)`)

| Event | Payload | Emitted by → handled by |
|---|---|---|
| `action` | `'enter' \| 'next' \| 'prev' \| 'radio' \| 'horn' \| 'qr' \| 'host' \| 'cam' \| 'map'` | input → lead/net/hud (edge-triggered button presses) |
| `weapon` | WEAPONS key | input (number keys 1–6) → player |
| `start` | `{ name, role }` | lobby → main (player pressed Play) |
| `net:<kind>` | `(data, fromId)` | net → anyone. Fired for every relayed event from another client |
| `feed` | `text` | anyone → hud (kill feed / notifications) |

## Input (`G.input`, agent UI)

`input.js` mutates the existing `G.input` object every frame:
`moveX` (-1 left … +1 right), `moveY` (-1 back … +1 forward), `lookDX`/`lookDY` (**radians** of camera turn accumulated since last read; player.js zeroes them), `fire`, `aim`, `jump`, `sprint` (booleans, true while held).
When `G.player.state === 'drive'`: `moveY` = throttle/brake-reverse, `moveX` = steering, `jump` = handbrake.
When `G.ui.lobby || G.ui.menuOpen || G.ui.overlay || G.ui.fixer` is true: zero everything.

## HUD API (`G.hud`, agent UI) — called by lead code

```
G.hud.message(text, seconds=3)            // small toast, bottom centre
G.hud.banner(title, sub, color, seconds)  // big centre text: 'MISSION PASSED', 'WASTED', 'BUSTED'
G.hud.prompt(textOrNull)                  // contextual hint: 'Press F to enter Sedan' (hud rewrites 'F' hint for touch itself is NOT needed; lead passes plain text)
G.hud.feed(text)                          // also triggered by the 'feed' event
G.hud.menu(title, items, onClose)         // items: [{ label, sub, disabled, pick() }]; sets G.ui.menuOpen; stays open until closed
G.hud.closeMenu()
G.hud.hitmarker()                         // brief crosshair flash
G.hud.damageFlash()                       // red vignette
```
The HUD reads `G.player`, `G.mission`, `G.markers`, `G.net.players`, `G.world.mapCanvas`, `G.dayTime` itself.

## Network API (`G.net`, agent NET)

```
G.net.id, G.net.isHost, G.net.connected, G.net.joinUrl
G.net.players : Map<id, R>     // everyone except me
   R = { id, name, role, x, y, z, yaw, speed, state, vehType, vehColor, weapon, hp, wanted, alive }
G.net.join(name, role)         // called by lobby
G.net.broadcast(kind, data)    // relay to all OTHER clients -> they get G.emit('net:'+kind, data, fromId). Not echoed to the sender.
G.net.sendTo(id, kind, data)   // relay to one client
```
Event kinds used by lead code: `shot`, `hit`, `boom`, `hack`, `feed`, `mission`, `host`.
`host` events are only relayed by the server if the sender is the host.

## Audio API (`G.audio`, agent FX) — all synthesised with WebAudio, no files

```
unlock()                         // call from a user gesture
shot(weaponKey, distance=0)      // distance in metres -> quieter
explosion(distance=0)
engine(on, rpm01, type)          // call every frame while driving; rpm01 0..1
horn(on)  siren(on, distance)
pickup()  cash()  hurt()  punch()  ui()  fail()  success()
radio(toggle) -> station name or 'Radio off'     // simple generative music loop while in a car
```

## Fixer hacks (broadcast kind `hack`, data `{ type, x, z, by }`)

`jam` (police lose the crew within 120 m for 20 s) · `car` (getaway sports car drops at x,z) ·
`supply` (health/armour/ammo crate) · `decoy` (police chase a decoy for 20 s) · `strike` (explosion after a 3 s warning).
Street clients apply the effect (lead code). Fixer energy: max 100, +5/s; costs 40/50/30/30/80.
