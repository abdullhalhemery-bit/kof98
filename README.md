# Arena Champions '98 — Farcaster Mini App

A 3-vs-3 retro arcade fighting game in classic 90s style, built as a Farcaster mini app.

- **6 visually distinct fighters**, each with their own weapon and fighting style: RONIN's balanced katana, SHADE's fast double-striking twin blades, IGNIS's slow long-reach flame staff, GRIMM's armored cleaver (his heavy swing can't be interrupted), HAZEL's longest-reach hunting spear, and KANE's launcher uppercut. Every fighter also has different HP/speed/power and a unique super (wave slash, shadow dash, meteor orb, boulder toss, triple bolt, lightning cutter)
- **Best-of-3 duels**: pick one fighter; first to win 2 rounds takes the match (KO or health lead at the bell; perfect rounds earn bonus points)
- **Guard button** (GUARD / C key) blocks attacks down to 15% damage with a "BLOCK!" cue and builds your super meter
- **Retro sound**: synthesized arcade SFX (hits, blocks, shots, KO, jingles) + a chiptune battle loop, generated in-browser with WebAudio — no audio files, with a mute toggle
- **VS Computer** mode with team rotation, super meter and projectile specials
- **Live PvP**: create a match, invite a friend with a link, or cast an **open challenge** that anyone on Farcaster can join
- **Points** for winners (victory + survivors + knockouts + supers bonuses)
- **Global leaderboard** (most wins first) plus a local record fallback
- Player usernames shown in small type above the arena during a match
- 3 animated stages with crowds, camera shake, hit sparks, palette-swap fighters — all in English

## Art credits & license

Character sprites are the CC0 (Creative Commons Zero) packs by **LuizMelo** on itch.io:
[Martial Hero](https://luizmelo.itch.io/martial-hero), [Martial Hero 2](https://luizmelo.itch.io/martial-hero-2),
[EVil Wizard 2](https://luizmelo.itch.io/evil-wizard-2), [Fantasy Warrior](https://luizmelo.itch.io/fantasy-warrior),
[Huntress](https://luizmelo.itch.io/huntress), [Martial Hero 3](https://luizmelo.itch.io/martial-hero-3).
CC0 allows free commercial use without attribution, but credit is appreciated — consider leaving it in.
Stages, UI, sounds and effects are original code.
This game is an original work and is not affiliated with any commercial fighting-game franchise.

## Files

```
index.html                  the WHOLE game in one self-contained file (sprites embedded as base64)
assets/<fighter>/*.png      source CC0 sprite sheets (reference only — not required at runtime)
server.js                   optional Node server: PvP match relay + leaderboard
package.json                server dependency (ws)
.well-known/farcaster.json  mini app manifest (template)
```

## Quick local test

Open `index.html` through any static server (e.g. `npx serve .`). VS Computer works immediately.
For PvP/leaderboard locally: `npm install && npm start` (port 8090), then open
`http://localhost:3000/?server=http://localhost:8090` — the `?server=` query overrides the built-in setting for testing.

## Deploy

1. **Static hosting** (Vercel/Netlify/Cloudflare Pages…): deploy so `index.html` and
   `/.well-known/farcaster.json` are served from your domain. `index.html` is fully self-contained
   (all sprites are embedded), so missing-asset or filename-case problems on hosts like Vercel
   cannot break the fighters.
2. **Game server** (needed for PvP + global leaderboard): deploy `server.js` to any Node host with
   WebSocket support (Railway, Render, Fly.io, a VPS). Note the public URL, e.g. `https://arena-srv.example.com`.
3. In `index.html`, set:
   ```js
   let SERVER_URL = 'https://arena-srv.example.com';
   ```
   Leave it `''` to ship CPU-only (PvP buttons will explain they need the server).
4. Replace every `YOUR-DOMAIN.com` in `index.html` (the `fc:miniapp` meta tag) and in
   `.well-known/farcaster.json` with your real domain.
5. Create the images on your domain root:
   - `icon.png` — 1024×1024 (no alpha)
   - `splash.png` — 200×200
   - `embed.png` — 3:2 ratio (e.g. 1200×800), shown when the app is shared in a cast
6. **Account association** (verifies domain ownership): open
   https://farcaster.xyz/~/developers/new , enter your domain (exactly as served, no `https://`),
   sign, and paste the generated `header`/`payload`/`signature` into `.well-known/farcaster.json`.
7. Preview/validate with the Farcaster developer tools, then share your URL in a cast — the embed
   will show a **⚔️ FIGHT** launch button.

## How PvP works

The host's game is authoritative. The guest sends inputs over WebSocket; the host simulates and
streams compact state snapshots back (~15/s). Disconnection awards the win to the remaining player.
Match results are POSTed to `/result` on the server, which keeps `leaderboard.json` and serves
`GET /leaderboard` (top 50, most wins first). Identity = Farcaster username when launched inside
Farcaster (with FID as the key), otherwise a local guest name.

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Move / jump / crouch | D-pad | Arrow keys |
| Punch | PUNCH | Z |
| Kick | KICK | X |
| Guard | GUARD | C |
| Super (needs full meter) | SUPER | V |

Win a round by KO or by having more health when the 60s timer ends. First to 2 round wins takes the match. Equal health at the bell replays the round.
