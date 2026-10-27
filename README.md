# Vocab Impostor: Hold Your Nose & Eat
Real-time multiplayer vocabulary game (Node.js + WebSocket).

## Run locally (teacher laptop)
1. Install Node.js 18+ (nodejs.org)
2. In this folder: `npm install` then `npm start`
3. Open http://localhost:3000 and tap "Teacher: host a new game"
4. Students on the SAME Wi-Fi open http://YOUR-LAPTOP-IP:3000 (some school Wi-Fi blocks device-to-device; use a phone hotspot if so)

## Deploy online (free): Render.com
1. Put this folder in a GitHub repo
2. Render > New > Web Service > connect repo
3. Build command: `npm install`   Start command: `npm start`
4. Share the https URL. Free plan sleeps when idle: open it 1-2 min before class.
