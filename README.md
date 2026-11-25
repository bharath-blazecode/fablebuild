# Brisbane: Inside Job

An original open-world crime sandbox set in a stylised Brisbane city, running in a web browser with QR-code multiplayer.
The host plays on a laptop; anyone nearby scans a QR code and joins from their phone, either
on the street as a full character or as a **Fixer** who supports the crew from a tactical map.

Built in one session with Claude Code (Claude Fable 5.2) as a capability demo.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```
npm install
npm start
```

Then open **http://localhost:3000** on the laptop. The terminal prints a join address and a QR code.

### Letting phones join

1. Put the laptop and the phones on the same network. A phone hotspot is the most reliable choice,
   because university and office Wi-Fi often blocks devices from talking to each other.
2. The first time the server starts, Windows Firewall asks whether to allow Node.js. Choose **Allow**.
3. In the game press **Q** to show the QR code full-screen, and let people scan it.
4. Up to 12 people can play on the street at once. Anyone after that joins as a Fixer.

### Online mode (works on any network)

Guest, university and office Wi-Fi usually block phones from reaching your laptop. Online mode avoids
that by opening an internet tunnel with [cloudflared](https://github.com/cloudflare/cloudflared)
(install once with `winget install Cloudflare.cloudflared`):

```
npm run online
```

The terminal prints a public `https://….trycloudflare.com` address and the in-game QR code points at it,
so phones can join over mobile data. Anyone with the link can join while the server is running, and the
address changes every time you start it.

## Controls

| Action | Keyboard and mouse | Phone |
|---|---|---|
| Move / steer | W A S D | Left joystick / ◀ ▶ |
| Look | Mouse (click the game first) | Drag the right side of the screen |
| Fire | Left click | FIRE (with aim assist) |
| Jump / handbrake | Space | JUMP / HAND |
| Sprint | Shift | Push the joystick to its edge |
| Enter or exit a vehicle | F | ENTER / EXIT |
| Switch weapon | 1–6 or mouse wheel | SWAP |
| Radio / horn | X / G | RADIO / HORN |
| Big map | M | — |
| QR code / host panel | Q / H | QR / HOST |

## What is in the game

- **City:** a stylised Brisbane, hand-built from memory and not from survey data: the river loop, the CBD grid with its
  real street names, Queen Street Mall, City Hall, Story Bridge, Victoria and Kurilpa bridges, South Bank and the Wheel,
  the Botanic Gardens, Kangaroo Point cliffs, the Gabba, plus a day/night cycle, shadows and a minimap.
- **Buildings you can enter:** the bank, two gun shops, the Treasury casino (with betting) and a safehouse on
  Charlotte St that holds one of every weapon.
- **Vehicles:** sedan, sports car, pickup, van, police cruiser and motorbike, with spinning and steering wheels,
  body roll, visible damage and smoke.
- **Weapons:** fists, baseball bat, pistol, magnum, SMG, shotgun, assault rifle, sniper rifle (right-click to zoom),
  minigun, flamethrower, grenades and rocket launcher; gun shops, pickups and spray shops.
- **Life:** pedestrians, traffic that follows the road grid, and police with a five-star wanted level.
- **Missions:** six, from a tutorial car theft to a bank heist. Walk into a pink marker to start one.
- **Multiplayer:** see other players, ride in their cars, fight them (the host can turn this off).
- **Fixer role:** a phone-friendly 2D map with five abilities: jam police, drop a getaway car,
  drop a supply crate, send a decoy, call a strike.
- **Host panel:** toggle player-vs-player, freeze everyone, bring everyone to you, start the heist for all, kick.

## How it works

```
server.js            Node.js: serves the files, relays multiplayer messages, makes the QR code
public/index.html    One page; loads Three.js through an import map (no build step)
public/js/
  core.js            Shared state object G, event bus, seeded random numbers, weapon table
  main.js            Start-up, game loop, day/night, automatic quality
  world.js           City generator, collision grid, ray casting, minimap picture
  chars.js           All blocky people, drawn with GPU instancing
  vehicles.js        Vehicle models and driving physics
  player.js          Walking, driving, camera, health
  weapons.js         Shooting, rockets, explosions, pickups, shops
  npc.js             Pedestrians, traffic, police, wanted level, fixer hack effects
  missions.js        Missions as data, run by one step machine
  input.js           Keyboard/mouse and touch controls
  hud.js             Heads-up display, minimap, menus
  net.js             Multiplayer client: sends my state, draws other players
  lobby.js           Title screen, QR overlay, host panel
  fixer.js           The Fixer's tactical map
  audio.js           All sound, synthesised with the Web Audio API
```

### Design decisions

- **Browser + Three.js, no build step.** Phones can join with nothing to install, and the code
  runs exactly as written, which keeps it easy to read and explain.
- **Low-end performance.** The whole city is merged into three meshes (about four draw calls).
  Every character shares eight instanced meshes. There are no real-time shadows, fog limits the
  draw distance, and the game lowers its render resolution automatically if the frame rate drops.
- **No physics engine.** Collisions are circles against boxes stored in a grid, so only nearby
  buildings are tested. Vehicles use a small arcade model: forward speed plus sideways slip that
  tyre grip removes (less grip with the handbrake, which gives drifting).
- **Same seed, same city.** Every device generates the identical city from one number, so no map
  is ever sent over the network.
- **Relay networking.** Each device simulates its own player and sends its position about 12 times
  a second. The server only relays messages; it does not run the game. Pedestrians, traffic and
  police are simulated separately on each device and are not synchronised.
- **No asset files.** Models are boxes built in code and sounds are synthesised, so the repository
  is small and has no licensing concerns.

### Known limits

- Hits between players are decided by the shooter's device, so a modified client could cheat.
- Each device has its own pedestrians, traffic and police; only players and events are shared.
- A car another player is driving may also still appear parked on your device.
- Progress is not saved between sessions.

More detail on the module interfaces is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licence

MIT
