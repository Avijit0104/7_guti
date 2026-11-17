// Checks "call for the ball": a defender calls, the bot team-mate holding the ball passes to them.
// Run: node tools/calltest.js
import { Sim } from '../js/sim.js';

let ok = 0, tries = 0, blocked = 0;
for (let k = 0; k < 40; k++) {
  const log = [];
  const sim = new Sim({ teamSize: 3, onEvent: (e) => log.push(e) });
  const me = sim.addHuman('Tester', 'local');            // the human who calls
  sim.startMatch();
  sim.attackTeam = me.team ^ 1; sim.round = 0; sim.startRound();
  sim._scatter();                                         // jump straight to the scramble
  const mate = sim.players.find((p) => p.team === me.team && p.bot);
  for (const p of sim.players) if (p.bot) p.bot = 'idle'; // keep everyone still...
  mate.bot = true;                                        // ...except the holder, whose brain we test
  sim.players.forEach((p) => { if (p.bot === 'idle') p.bot = false; });
  me.x = -2 + (k % 5) * 2; me.z = -3; mate.x = me.x + 8; mate.z = -4;
  sim._holdBall(mate.id);
  mate.ai.hold = 0; mate.ai.wait = 99;                    // it would not throw on its own yet
  sim.action(me.id, { k: 'call' });
  tries++;
  let got = false;
  for (let i = 0; i < 180 && !got; i++) {
    sim.setHumanState(me.id, { x: me.x, y: 0, z: me.z, yaw: 0, pitch: 0, mv: 0, tp: me.tp });
    sim.tick(1 / 60);
    if (sim.ball.holder === me.id) got = true;
  }
  if (got) ok++;
  if (!log.some((e) => e.k === 'call')) blocked++;
}
console.log(`call answered with a pass that reached the caller: ${ok}/${tries} (calls rejected: ${blocked})`);
