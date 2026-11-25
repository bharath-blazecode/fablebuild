// lobby.js - title / join screen, QR overlay and host panel (all plain DOM, no libraries).
import { G } from './core.js';

const CSS = `
#lob-root{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;overflow-y:auto;
 background:radial-gradient(ellipse at 50% 0%,rgba(255,61,129,.28),transparent 60%),linear-gradient(180deg,rgba(8,4,16,.55),rgba(8,4,16,.88));
 font-family:system-ui,"Segoe UI",Arial,sans-serif;color:#fff;text-transform:uppercase;-webkit-tap-highlight-color:transparent}
#lob-root *{box-sizing:border-box}
.lob-wrap{width:min(960px,96vw);padding:clamp(8px,2.5vh,28px) 8px;display:flex;flex-direction:column;align-items:center;gap:clamp(6px,1.8vh,16px);margin:auto}
.lob-title{margin:0;font-weight:900;font-style:italic;letter-spacing:.04em;line-height:.95;font-size:clamp(34px,10vh,88px);text-align:center;
 background:linear-gradient(180deg,#ff3d81 10%,#ff9a3d 60%,#ffd36b);-webkit-background-clip:text;background-clip:text;color:transparent;
 filter:drop-shadow(0 0 18px rgba(255,61,129,.55))}
.lob-sub{margin:0;font-weight:800;letter-spacing:.5em;color:#2de2e6;font-size:clamp(11px,2.8vh,22px);text-shadow:0 0 12px rgba(45,226,230,.7)}
.lob-name{display:flex;align-items:center;gap:10px;font-weight:800;font-size:clamp(11px,2vh,14px);color:#ff9a3d}
.lob-name input{background:rgba(0,0,0,.55);border:2px solid #2de2e6;border-radius:8px;color:#fff;font:800 clamp(14px,2.6vh,20px) system-ui,Arial;
 padding:6px 12px;width:min(220px,50vw);text-transform:none;outline:none}
.lob-name input:focus{box-shadow:0 0 14px rgba(45,226,230,.7)}
.lob-roles{display:flex;gap:clamp(8px,2vw,18px);width:100%}
.lob-card{flex:1;cursor:pointer;border:3px solid;border-radius:14px;padding:clamp(8px,2.4vh,22px) clamp(8px,1.6vw,18px);text-align:center;color:#fff;
 background:rgba(0,0,0,.55);font-family:inherit;text-transform:uppercase;transition:transform .12s,box-shadow .12s}
.lob-card:hover,.lob-card:active{transform:translateY(-3px) scale(1.02)}
.lob-card b{display:block;font-weight:900;font-size:clamp(15px,4.2vh,30px);letter-spacing:.03em}
.lob-card span{display:block;margin-top:4px;font-weight:700;font-size:clamp(9px,2vh,14px);opacity:.85;line-height:1.25}
#lob-street{border-color:#ff3d81;box-shadow:0 0 18px rgba(255,61,129,.45)} #lob-street b{color:#ff3d81}
#lob-fixer{border-color:#2de2e6;box-shadow:0 0 18px rgba(45,226,230,.45)} #lob-fixer b{color:#2de2e6}
.lob-keys{font-weight:700;font-size:clamp(9px,1.9vh,13px);letter-spacing:.06em;color:#ffd9a8;text-align:center;opacity:.9}
.lob-scan{display:flex;align-items:center;gap:14px;background:rgba(0,0,0,.55);border:2px solid #ff9a3d;border-radius:12px;padding:8px 14px}
.lob-scan img{width:clamp(70px,16vh,130px);height:auto;background:#fff;border-radius:6px;padding:3px}
.lob-scan div{font-weight:800;font-size:clamp(10px,2vh,14px);line-height:1.5;text-align:left}
.lob-scan em{display:block;font-style:normal;color:#2de2e6;text-transform:none;word-break:break-all}
.lob-hide{display:none!important}
@media (max-height:480px) and (orientation:landscape){.lob-wrap{gap:4px;padding:4px}.lob-keys{display:none}.lob-sub{letter-spacing:.3em}}
@media (orientation:portrait) and (max-width:600px){.lob-roles{flex-direction:column}.lob-title{font-size:clamp(34px,12vw,60px)}}
.lob-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(5,2,12,.88);overflow-y:auto;
 font-family:system-ui,"Segoe UI",Arial,sans-serif;color:#fff;text-transform:uppercase}
.lob-ov.open{display:flex}
.lob-box{background:#12081f;border:3px solid #ff3d81;border-radius:16px;padding:16px 20px;text-align:center;max-width:94vw;max-height:94vh;overflow-y:auto;margin:auto;
 box-shadow:0 0 30px rgba(255,61,129,.5)}
.lob-box h2{margin:0 0 8px;color:#ff9a3d;font-weight:900;font-size:clamp(16px,4vh,26px)}
.lob-box img{width:min(60vh,70vw,360px);background:#fff;border-radius:10px;padding:6px}
.lob-url{color:#2de2e6;text-transform:none;font-weight:800;word-break:break-all;margin:8px 0;font-size:clamp(13px,2.6vh,20px)}
.lob-btn{display:block;width:100%;margin:6px 0;padding:10px 14px;border-radius:10px;border:2px solid #2de2e6;background:rgba(45,226,230,.12);color:#fff;
 font:900 clamp(12px,2.6vh,16px) system-ui,Arial;text-transform:uppercase;cursor:pointer}
.lob-btn:active{background:rgba(45,226,230,.4)} .lob-btn.on{border-color:#ff3d81;background:rgba(255,61,129,.22)}
.lob-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:4px 0;font-weight:800;font-size:13px;text-align:left}
.lob-row .lob-btn{width:auto;margin:0;padding:4px 10px;border-color:#ff3d81}
`;

const $ = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function init() {
  const style = $('style'); style.textContent = CSS; document.head.appendChild(style);

  // ---------- Title / join screen ----------
  const root = $('div'); root.id = 'lob-root';
  const savedName = (() => { try { return localStorage.getItem('ps_name'); } catch { return null; } })();
  const defName = savedName || 'Player' + Math.floor(100 + Math.random() * 900);
  root.innerHTML = `<div class="lob-wrap">
    <h1 class="lob-title">BRISBANE</h1><p class="lob-sub">INSIDE JOB</p>
    <label class="lob-name">Your name <input id="lob-nameIn" maxlength="14" autocomplete="off" value="${esc(defName)}"></label>
    <div class="lob-roles">
      <button class="lob-card" id="lob-street"><b>Play</b><span>Drive, shoot, run missions</span></button>
    </div>
    <div class="lob-keys ${G.isMobile ? 'lob-hide' : ''}">WASD move · Mouse look · Click fire · F enter car · 1–6 weapons · Space jump/handbrake · Shift sprint · Q QR code · H host panel</div>
    <div class="lob-scan ${G.isMobile ? 'lob-hide' : ''}"><img src="/qr.svg" alt="QR code"><div>Scan to join<em id="lob-url"></em><span id="lob-count">0 players online</span></div></div>
  </div>`;
  document.body.appendChild(root);
  const nameIn = root.querySelector('#lob-nameIn');

  const refreshInfo = () => fetch('/api/info').then(r => r.json()).then(i => {
    root.querySelector('#lob-url').textContent = i.joinUrl;
    root.querySelector('#lob-count').textContent = `${i.players} player${i.players === 1 ? '' : 's'} online`;
  }).catch(() => {});
  refreshInfo();
  const infoTimer = setInterval(() => { if (G.ui.lobby) refreshInfo(); else clearInterval(infoTimer); }, 4000);

  function choose(role) {
    const name = (nameIn.value.replace(/[<>]/g, '').trim() || 'Player').slice(0, 14);
    try { localStorage.setItem('ps_name', name); } catch {}
    try { G.audio.unlock(); } catch {}
    if (G.isMobile) {
      try { document.documentElement.requestFullscreen().catch(() => {}); } catch {}
      try { screen.orientation.lock('landscape').catch(() => {}); } catch {}
    }
    G.ui.lobby = false;
    root.classList.add('lob-hide');
    G.net.join(name, role);
    G.emit('start', { name, role });
  }
  root.querySelector('#lob-street').onclick = () => choose('street');

  // ---------- Overlays (QR + host panel) ----------
  const qr = $('div', 'lob-ov');
  qr.innerHTML = `<div class="lob-box"><h2>Scan to join</h2><img src="/qr.svg" alt="QR code"><div class="lob-url"></div><button class="lob-btn">Close</button></div>`;
  const host = $('div', 'lob-ov');
  const hostBox = $('div', 'lob-box'); host.appendChild(hostBox);
  document.body.append(qr, host);

  const syncOverlay = () => { G.ui.overlay = qr.classList.contains('open') || host.classList.contains('open'); };
  const open = el => { el.classList.add('open'); syncOverlay(); document.exitPointerLock?.(); };
  const close = el => { el.classList.remove('open'); syncOverlay(); };
  qr.onclick = () => close(qr);                       // tap anywhere to close

  // Host panel: each button broadcasts a 'host' command and also applies it locally.
  function hostCmd(d) { G.net.broadcast('host', d); G.emit('net:host', d, G.net.id); }
  function renderHost() {
    hostBox.innerHTML = '<h2>Host panel</h2>';
    const btn = (label, fn, on) => { const b = $('button', 'lob-btn' + (on ? ' on' : ''), label); b.onclick = fn; hostBox.appendChild(b); };
    btn('PvP: ' + (G.flags.pvp ? 'ON' : 'OFF'), () => { hostCmd({ cmd: 'pvp', on: !G.flags.pvp }); renderHost(); }, G.flags.pvp);
    btn('Freeze everyone: ' + (G.flags.frozen ? 'ON' : 'OFF'), () => { hostCmd({ cmd: 'freeze', on: !G.flags.frozen }); renderHost(); }, G.flags.frozen);
    btn('Bring everyone to me', () => { if (G.player) hostCmd({ cmd: 'bring', x: G.player.x, z: G.player.z }); });
    btn('Start heist for all', () => { G.net.broadcast('mission', { id: 'heist' }); G.emit('net:mission', { id: 'heist' }, G.net.id); });
    hostBox.appendChild($('h2', null, 'Players'));
    for (const r of G.net.players.values()) {
      const row = $('div', 'lob-row', `<span>${esc(r.name)} (${esc(r.role)})</span>`);
      const k = $('button', 'lob-btn', 'Kick'); k.onclick = () => { G.net.broadcast('host', { cmd: 'kick', id: r.id }); setTimeout(renderHost, 300); };
      row.appendChild(k); hostBox.appendChild(row);
    }
    if (!G.net.players.size) hostBox.appendChild($('div', 'lob-row', 'Nobody else here yet'));
    btn('Close', () => close(host));
  }

  G.on('action', a => {
    if (G.ui.lobby) return;
    if (a === 'qr') {
      if (qr.classList.contains('open')) return close(qr);
      qr.querySelector('.lob-url').textContent = G.net.joinUrl || '';
      open(qr);
    } else if (a === 'host' && G.net.isHost) {
      if (host.classList.contains('open')) return close(host);
      renderHost(); open(host);
    }
  });
  qr.querySelector('.lob-btn').onclick = e => { e.stopPropagation(); close(qr); };
}
