// Headless check: plays full bot-vs-bot matches without graphics and prints what happened.
// Run with:  node tools/simtest.js [matches] [teamSize]
import { Sim } from '../js/sim.js';

const matches = +process.argv[2] || 20;
const teamSize = +process.argv[3] || 3;
const tally = { built: 0, out: 0, time: 0, allmiss: 0, throws: 0, hits: 0, elim: 0, rounds: 0, simSeconds: 0, stuck: 0, scrT: 0, dist: 0, dn: 0 };

for (let m = 0; m < matches; m++) {
  const sim = new Sim({
    teamSize,
    onEvent: (e) => {
      if (e.k === 'roundEnd') { tally[e.why]++; tally.rounds++; if (e.why !== 'allmiss') tally.scrT += sim.scrambleT; }
      if (e.k === 'throw' && sim.phase === 'throw') tally.throws++;
      if (e.k === 'scatter') { tally.hits++; tally.knocked = (tally.knocked || 0) + e.n; }
      if (e.k === 'out') tally.elim++;
    },
  });
  sim.startMatch();
  let t = 0;
  while (sim.phase !== 'matchEnd' && t < 3600) {
    sim.tick(1 / 60); t += 1 / 60;
    if (sim.phase === 'scramble' && Math.abs(sim.scrambleT - 2) < 0.009) for (const st of sim.stones) { tally.dist += Math.hypot(st.body.position.x, st.body.position.z); tally.dn++; }
  }
  if (sim.phase !== 'matchEnd') tally.stuck++;
  for (const p of sim.players) if (!isFinite(p.x + p.z)) throw new Error('NaN player position');
  JSON.stringify(sim.snapshot());
  tally.simSeconds += t;
}
console.log(`${matches} matches, ${teamSize}v${teamSize}`);
console.log(tally);
console.log('avg scramble', (tally.scrT / tally.hits).toFixed(1) + 's', '| avg scatter dist', (tally.dist / tally.dn).toFixed(1) + 'm');
console.log('avg stones knocked', (tally.knocked / tally.hits).toFixed(1), '| attackers rebuild', Math.round(100 * tally.built / (tally.built + tally.out + tally.time)) + '%');
console.log('throw hit rate', (tally.hits / tally.throws).toFixed(2), '| avg match', (tally.simSeconds / matches).toFixed(0) + 's');
