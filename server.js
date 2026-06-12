/* King Of Fighters (KOF) — Supabase-powered match relay + leaderboard server
   Run: npm install && npm start  (default port 8090)
   Deploy anywhere that supports Node + WebSockets (Railway, Render, Fly.io, a VPS...).
   Then set SERVER_URL in index.html to e.g. "https://your-server.example.com" */
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 8090;

/* ---- Supabase connection ---- */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qupwfpijbtzgitdzawvx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_r6xSJ5C5afI7sT7pCKkoIQ_kMQ9_T3v';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---- Leaderboard (now persisted to Supabase) ---- */
let leaderboard = {};

async function loadLeaderboard() {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('wins', { ascending: false })
      .limit(100);
    if (error) throw error;
    if (data) {
      leaderboard = {};
      data.forEach(row => {
        const key = row.fid ? 'fid:' + row.fid : 'name:' + row.name;
        leaderboard[key] = { name: row.name, fid: row.fid, wins: row.wins, losses: row.losses, points: row.points };
      });
    }
    console.log('Leaderboard loaded from Supabase:', Object.keys(leaderboard).length, 'entries');
  } catch (e) {
    console.warn('Supabase leaderboard load failed, using empty:', e.message);
  }
}

async function saveLeaderboardEntry(key, entry) {
  try {
    const { error } = await supabase
      .from('leaderboard')
      .upsert({
        name: entry.name,
        fid: entry.fid || null,
        wins: entry.wins,
        losses: entry.losses,
        points: entry.points,
        updated_at: new Date().toISOString()
      }, { onConflict: 'name' });
    if (error) console.warn('Supabase save error:', error.message);
  } catch (e) {
    console.warn('Supabase save failed:', e.message);
  }
}

loadLeaderboard();

/* ---- HTTP server ---- */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api_key');
}

const NEYNAR_API_KEY = '045517A1-E2A1-4A41-BCDD-38DDCF2B1724';

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

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', players: rooms.size, supabase: !!supabase }));
  }

  if (req.method === 'POST' && req.url === '/result') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', async () => {
      try {
        const { name, fid, won, points } = JSON.parse(body);
        if (typeof name !== 'string' || name.length > 40) throw 0;
        const key = fid ? 'fid:' + fid : 'name:' + name;
        const e = leaderboard[key] || { name, fid: fid || null, wins: 0, losses: 0, points: 0 };
        e.name = name; // keep latest username
        if (won) e.wins++; else e.losses++;
        e.points += Math.max(0, Math.min(1000, points | 0));
        leaderboard[key] = e;
        saveLeaderboardEntry(key, e);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"ok":false}'); }
    });
    return;
  }

  /* Farcaster webhook endpoint */
  if (req.method === 'POST' && req.url === '/api/webhook') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', async () => {
      try {
        const event = JSON.parse(body);
        console.log('Farcaster webhook event:', event?.event || 'unknown');
        /* Verify user via Neynar if fid provided */
        if(event?.event === 'frame_added' && event?.fid && NEYNAR_API_KEY){
          try{
            const neynarRes = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${event.fid}`, {
              headers: { 'api_key': NEYNAR_API_KEY, 'accept': 'application/json' }
            });
            const neynarData = await neynarRes.json();
            if(neynarData?.users?.[0]){
              console.log('Neynar verified user:', neynarData.users[0].username || event.fid);
            }
          }catch(ne){ console.warn('Neynar verification failed:', ne.message); }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end('{"ok":false}');
      }
    });
    return;
  }

  /* Serve static files for the game */
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('KOF server is running (Supabase-connected).');
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

server.listen(PORT, () => console.log('Arena server on :' + PORT + ' (Supabase: ' + SUPABASE_URL + ')'));
