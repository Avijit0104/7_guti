# সাত গুটি — Sat Guti (Seven Stones / Pittu / Lagori)

A 3D, physics-driven multiplayer browser game based on the traditional Bengali and South Asian street game **Sat Guti** (also known as *Seven Stones*, *Pittu*, or *Lagori*).

Playable on mobile and desktop browsers with no installation, accounts, or build steps required.

---

### 🌐 Play Live
- **Cloudflare Pages**: **[https://7-guti.pages.dev](https://7-guti.pages.dev)**
- **GitHub Pages**: **[https://avijit0104.github.io/7_guti/](https://avijit0104.github.io/7_guti/)**

---

## 🎮 Game Concept & Rules

**Sat Guti** is played between two teams (Red and Blue), with 2 to 7 players on each side:

1. **The Stack**: In the middle of the field stands a tower of 7 flat stones arranged from largest at the base to smallest at the top.
2. **Throw Phase**:
   - Attackers take turns throwing a ball from behind the throw line (11 meters away).
   - A swinging power meter determines the speed and force of the throw.
   - The stack scatters realistically based on velocity and point of impact:
     - Soft hits knock off only the top stones.
     - Hard, low hits send all 7 stones flying across the field.
3. **Scramble Phase (120s)**:
   - **Attackers' Goal**: Rush into the field, pick up the scattered stones, and rebuild the tower in the correct order (largest first).
   - **Defenders' Goal**: Retrieve the ball and eliminate attacking players by hitting them directly with throws before the tower is completed.
   - Attackers can hide behind obstacles (haystacks, trees, wells, clay pots) to dodge incoming throws.
4. **Scoring & Victory**:
   - Rebuilding the stack awards points based on how many stones were knocked down:
     - 1–3 stones: 1 point
     - 4–6 stones: 2 points
     - All 7 stones: 3 points
   - Eliminating all attackers or letting the timer run out gives 2 points to the defending team.
   - First team to reach **7 points** wins the match!

---

## 🕹️ Controls

### Desktop (Keyboard & Mouse)
- **WASD / Arrow Keys**: Move
- **Mouse**: Look around (click canvas to lock pointer)
- **Hold Left Click or F**: Charge throw power, release to throw
- **E**: Grab stone / Pick up ball / Place stone at stack
- **Space**: Jump
- **V**: Toggle First-Person (FPP) and Third-Person (TPP) view
- **Esc**: Pause / Unlock cursor

### Mobile & Touch
- **Left Screen / Joystick**: Move
- **Right Screen**: Drag to aim / look around
- **THROW Button**: Hold to charge power, release to throw
- **GRAB Button**: Pick up stones / ball or rebuild stack
- **JUMP Button**: Jump
- **TPP / FPP Button**: Toggle camera perspective

---

## ✨ Features & Architecture

- **Rigid-Body 3D Physics**: Powered by `cannon-es` for authentic stone collisions, ball bounce, damping, and scattering.
- **Skinned 3D Character Models**: Rigged characters with smooth skeletal animations (Idle, Run, Jump, Throw, Hit/Death).
- **Camera Modes**: Full support for both TPP (Third-Person Perspective) and FPP (First-Person Perspective).
- **Serverless Peer-to-Peer Multiplayer**: Uses WebRTC via `PeerJS`. The room host runs the authoritative simulation while guests join using a simple 5-letter room code.
- **Autonomous AI Bots**: Smart bot opponents automatically backfill empty slots (supporting 2v2 up to 7v7 matches or solo play).
- **Procedural Audio**: 100% synthesized sound effects in real-time using the Web Audio API (whistles, impacts, ball bouncing, crowds).
- **Zero Build Step**: Pure ES Modules and static HTML/CSS/JS. Deployable instantly to GitHub Pages, Cloudflare Pages, Netlify, or Vercel.

---

## 🚀 Getting Started

### Run Locally

Since the game uses standard ES modules and Web Workers / WebRTC, serve it via any local HTTP server:

```bash
# Using Python
python -m http.server 8080

# Or using Node.js
npx serve .
```

Then open `http://localhost:8080` in your browser.

### Headless Simulation Tests

Run headless verification tests for the physics and bot AI:

```bash
# Run simulation match test (20 matches)
node tools/simtest.js

# Run stone impact test
node tools/breaktest.js
```

### Deployment

This game requires no build step and can be hosted for free anywhere:

- **Cloudflare Pages**: Connect your GitHub repo (`Avijit0104/7_guti`) on [Cloudflare Pages](https://dash.cloudflare.com/) with framework preset `None` and output directory `/`. Automatic deploys on every push.
- **GitHub Pages**: Enabled under repository **Settings → Pages** from branch `main` at root `/`.

---

## 📜 Credits & License

- Character models: [KayKit Character Pack](https://kaylousberg.itch.io/) (CC0 - Public Domain).
- Physics: [cannon-es](https://github.com/pmndrs/cannon-es) (MIT).
- 3D Engine: [three.js](https://threejs.org/) (MIT).
- Multiplayer: [PeerJS](https://peerjs.com/) (MIT).
