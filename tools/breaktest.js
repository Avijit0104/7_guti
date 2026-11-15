// Checks that a harder hit knocks more stones further. Run: node tools/breaktest.js
import { Sim } from '../js/sim.js';
import { C, handPos } from '../js/config.js';

for (const speed of [9, 11, 13, 15, 17, 20, 23]) {
  let n = 0, hits = 0, dist = 0, stones = 0;
  for (let k = 0; k < 40; k++) {
    let got = null;
    const sim = new Sim({ teamSize: 2, onEvent: (e) => { if (e.k === 'scatter') got = e; } });
    sim.players.forEach((p) => { p.bot = false; }); // nobody acts on their own
    sim.startMatch();
    const p = sim.players[sim.thrower], h = handPos(p);
    const T = Math.hypot(h[0], h[2]) / speed;
    sim.throwBall(p, -h[0] / T, (0.3 - h[1]) / T + 0.5 * C.GRAV * T, -h[2] / T);
    for (let i = 0; i < 240 && sim.phase === 'throw'; i++) sim.tick(1 / 60);
    if (!got) continue;
    hits++; n += got.n;
    for (let i = 0; i < 180; i++) sim.tick(1 / 60);
    for (const st of sim.stones) if (st.state === 'loose') { dist += Math.hypot(st.body.position.x, st.body.position.z); stones++; }
  }
  console.log(`throw ${String(speed).padStart(2)} m/s: hit ${hits}/40, stones knocked ${(n / hits || 0).toFixed(1)}, they land ${(dist / stones || 0).toFixed(1)} m away`);
}
