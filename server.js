// server.js - the "switchboard" of Port Solara.
// It does two jobs: (1) hand out the game files over HTTP, (2) relay player data over WebSocket.
// The server does NOT simulate the game; each browser simulates itself and the server just
// forwards positions and events between players (like a bus bar sharing power between feeders).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three', 'build');
const PORT = Number(process.env.PORT) || 3000;
const MAX_STREET = 12;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.map': 'application/json' };

// ---- Find this computer's address on the Wi-Fi/LAN so phones can reach it ----
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  // Home/office private ranges first (192.168.x, 10.x, 172.16-31.x).
  const score = a => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}
const lan = lanAddresses();
let joinUrl = process.env.PUBLIC_URL || `http://${lan[0] || 'localhost'}:${PORT}`;

// ---- Online mode (npm run online): open an internet tunnel so phones can join from ANY network ----
// Guest/university Wi-Fi blocks devices from reaching each other. A tunnel avoids that: this laptop makes
// an outbound connection to Cloudflare, which gives us a public https address that forwards to the game.
function startTunnel() {
  const candidates = ['cloudflared', 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'];
  const tryNext = (n) => {
    if (n >= candidates.length) { console.log('\n[online] cloudflared was not found. Install it with:  winget install Cloudflare.cloudflared\n'); return; }
    const proc = spawn(candidates[n], ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { windowsHide: true });
    let found = false;
    const onData = async (buf) => {
      const m = !found && String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (!m) return;
      found = true; joinUrl = m[0];
      console.log(`\n[online] PUBLIC JOIN URL: ${joinUrl}\n         Anyone with this link can join, on any network. Scan:\n`);
      console.log(await QRCode.toString(joinUrl, { type: 'terminal', small: true }));
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('error', () => tryNext(n + 1));
    proc.on('exit', (code) => { if (found) console.log('[online] tunnel closed'); });
    process.on('exit', () => proc.kill());
    process.on('SIGINT', () => { proc.kill(); process.exit(0); });
  };
  console.log('[online] opening internet tunnel…');
  tryNext(0);
}

// ---- HTTP: static files + two small API routes ----
function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}
function safeJoin(base, rel) {           // refuse paths that escape the base folder ("../..")
  const full = path.normalize(path.join(base, rel));
  return full.startsWith(base + path.sep) || full === base ? full : null;
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ joinUrl, lanUrls: lan.map(a => `http://${a}:${PORT}`), players: clients.size }));
  }
  if (pathname === '/qr.svg') {
    const svg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1 });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(svg);
  }
  let file;
  if (pathname.startsWith('/vendor/three/')) file = safeJoin(THREE_DIR, pathname.slice('/vendor/three/'.length));
  else file = safeJoin(PUBLIC, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file) { res.writeHead(403); return res.end(); }
  serveFile(res, file);
});

// ---- WebSocket: one entry per connected browser ----
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });   // >4 KB messages are rejected
const clients = new Map();    // id -> { id, ws, name, role, host, d, dirty, evCount }
let nextId = 1;

const send = (c, obj) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj)); };
const broadcast = (obj, exceptId) => { const s = JSON.stringify(obj); for (const c of clients.values()) if (c.id !== exceptId && c.ws.readyState === 1) c.ws.send(s); };
const publicInfo = c => ({ id: c.id, name: c.name, role: c.role, host: c.host, d: c.d });
const isLoopback = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
const cleanName = n => String(n ?? '').replace(/[<>]/g, '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 14) || 'Player';

wss.on('connection', (ws, req) => {
  const c = { id: nextId++, ws, name: 'Player', role: 'street', host: false, joined: false, d: null, dirty: false, evCount: 0, alive: true };
  const local = isLoopback(req.socket.remoteAddress);
  ws.on('pong', () => { c.alive = true; });

  ws.on('message', raw => {
    if (raw.length > 4096) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      if (c.joined) return;                                   // only the first hello counts
      c.name = cleanName(m.name);
      c.role = m.role === 'fixer' ? 'fixer' : 'street';
      let forcedFixer = false;
      const streetCount = [...clients.values()].filter(x => x.joined && x.role === 'street').length;
      c.role = 'street';      // single play mode: everyone joins as a street player (no Fixer overflow)
      // Host = the first joined client running on the same machine as the server.
      c.host = local && ![...clients.values()].some(x => x.host);
      c.joined = true;
      clients.set(c.id, c);
      send(c, { t: 'welcome', id: c.id, host: c.host, role: c.role, forcedFixer, players: [...clients.values()].map(publicInfo) });
      broadcast({ t: 'join', p: publicInfo(c) }, c.id);
      return;
    }
    if (!c.joined) return;

    if (m.t === 's' && Array.isArray(m.d) && m.d.length === 11) {   // my latest state
      c.d = m.d.map(Number);
      c.dirty = true;
    } else if (m.t === 'ev' && typeof m.k === 'string') {
      // Rate limit: counter is reset every second (see timers below).
      if (++c.evCount > 60) return;
      if (m.k === 'host') {                                   // only the host may send host commands
        if (!c.host) return;
        if (m.d && m.d.cmd === 'kick') { const t = clients.get(Number(m.d.id)); if (t && t !== c) t.ws.close(); return; }
      }
      const out = { t: 'ev', k: m.k, d: m.d, from: c.id };
      if (m.to != null) { const t = clients.get(Number(m.to)); if (t) send(t, out); }
      else broadcast(out, c.id);
    }
  });

  ws.on('close', () => {
    if (clients.delete(c.id) && c.joined) broadcast({ t: 'leave', id: c.id });
  });
  ws.on('error', () => {});
});

// Every 80 ms: send ONE message with every player whose state changed since last time.
setInterval(() => {
  const rows = [];
  for (const c of clients.values()) if (c.dirty && c.d) { rows.push([c.id, ...c.d]); c.dirty = false; }
  if (rows.length) broadcast({ t: 'snap', s: rows });
}, 80);

setInterval(() => { for (const c of clients.values()) c.evCount = 0; }, 1000);   // reset event rate limit

// Every 15 s: ping everyone; anyone who did not answer the previous ping is dead, so drop them.
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false; c.ws.ping();
  }
}, 15000);

server.listen(PORT, '0.0.0.0', async () => {
  console.log('\n=== BRISBANE: INSIDE JOB ===');
  console.log(`Local URL : http://localhost:${PORT}   (open this on the host computer)`);
  if (process.argv.includes('--online')) return startTunnel();
  console.log(`Join URL  : ${joinUrl}   (phones on the same Wi-Fi scan this)`);
  console.log('Phones cannot connect? Guest/university Wi-Fi blocks it. Use:  npm run online\n');
  console.log(await QRCode.toString(joinUrl, { type: 'terminal', small: true }));
});
