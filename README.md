# Beans

A turn-based artillery game with explosive cartoon beans. Play against the CPU, hotseat on one device, or online with friends (peer-to-peer via WebRTC/PeerJS — no server needed).

Live at **https://beans.benji.com.jm**

## Run locally
Any static server works:
```
python3 -m http.server 8000
```
Then open http://localhost:8000. Add `?net=local` to test online play between two tabs without the internet.

## Files
- `index.html` — page, menus and styles
- `js/sim.js` — game rules and physics (runs on the host)
- `js/weapons.js` — the arsenal
- `js/ai.js` — CPU beans
- `js/render.js`, `js/art.js` — drawing
- `js/terrain.js` — destructible maps
- `js/net.js` — online play
- `build.py` — bundles everything into one `dist/index.html`
