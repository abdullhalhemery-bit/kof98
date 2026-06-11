/* Arena Champions '98 — match relay + leaderboard server
   Run: npm install && npm start  (default port 8090)
   Deploy anywhere that supports Node + WebSockets (Railway, Render, Fly.io, a VPS...).
   Then set SERVER_URL in index.html to e.g. "https://your-server.example.com" */
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8090;
const LB_FILE = './leaderboard.json';

let leaderboard = {};
try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')); } catch (e) {}
let saveTimer = null;
function saveLb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(LB_FILE, JSON.stringify(leaderboard), () => {}), 500);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/leaderboard') {
    const list = Object.values(leaderboard)
      .sort((a, b) => b.wins - a.wins || b.points - a.points)
      .slice(0, 50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }

  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, fid, won, points } = JSON.parse(body);
        if (typeof name !== 'string' || name.length > 40) throw 0;
        const key = fid ? 'fid:' + fid : 'name:' + name;
        const e = leaderboard[key] || { name, fid: fid || null, wins: 0, losses: 0, points: 0 };
        e.name = name; // keep latest username
        if (won) e.wins++; else e.losses++;
        e.points += Math.max(0, Math.min(1000, points | 0));
        leaderboard[key] = e; saveLb();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"ok":false}'); }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Arena Champions \'98 server is running.');
});

/* ---- WebSocket match rooms ---- */
const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { host, guest }
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => {
  let c; do { c = Array.from({ length: 4 }, () => LETTERS[(Math.random() * LETTERS.length) | 0]).join(''); }
  while (rooms.has(c)); return c;
};

wss.on('connection', ws => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'create') {
      const code = newCode();
      ws.room = code; ws.role = 'host'; ws.playerName = String(m.name || 'Host').slice(0, 40);
      rooms.set(code, { host: ws, guest: null });
      return ws.send(JSON.stringify({ t: 'room', code }));
    }

    if (m.t === 'join') {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room || !room.host || room.host.readyState !== 1)
        return ws.send(JSON.stringify({ t: 'err', msg: 'MATCH NOT FOUND' }));
      if (room.guest && room.guest.readyState === 1)
        return ws.send(JSON.stringify({ t: 'err', msg: 'MATCH IS FULL' }));
      room.guest = ws; ws.room = room.host.room; ws.role = 'guest';
      ws.playerName = String(m.name || 'Challenger').slice(0, 40);
      room.host.send(JSON.stringify({ t: 'peer', name: ws.playerName }));
      return ws.send(JSON.stringify({ t: 'joined', hostName: room.host.playerName }));
    }

    /* relay everything else to the other peer in the room */
    const room = rooms.get(ws.room);
    if (!room) return;
    const other = ws.role === 'host' ? room.guest : room.host;
    if (other && other.readyState === 1) other.send(JSON.stringify(m));
  });

  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (!room) return;
    const other = ws.role === 'host' ? room.guest : room.host;
    if (other && other.readyState === 1) other.send(JSON.stringify({ t: 'gone' }));
    rooms.delete(ws.room);
  });
});

server.listen(PORT, () => console.log('Arena server on :' + PORT));
