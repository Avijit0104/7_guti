// Checks the line rule: during the throw nobody crosses their line; after the stack is hit everyone may.
// Run: node tools/linetest.js
import { Sim } from '../js/sim.js';
import { C } from '../js/config.js';

const sim = new Sim({ teamSize: 3 });
const att = sim.addHuman('Attacker', 'a');
const def = sim.addHuman('Defender', 'b');
sim.startMatch();
const A = sim.players.find((p) => !p.bot && p.team === sim.attackTeam && p.id !== sim.thrower) || att;
const D = sim.players.find((p) => !p.bot && p.team !== sim.attackTeam);
const tryMove = (p, z) => { sim.setHumanState(p.id, { x: 2, y: 0, z, yaw: 0, pitch: 0, mv: 1, tp: p.tp }); return p.z; };
const r = {
  attackerStopsAtThrowLine: tryMove(A, 0) === C.THROW_Z,
  defenderStopsAtDefenceLine: tryMove(D, 5) === -C.DEF_LINE,
  botsBehindLines: sim.players.every((p) => (p.team === sim.attackTeam ? p.z >= C.THROW_Z : p.z <= -C.DEF_LINE)),
};
sim._scatter(); // the stack is hit
r.attackerFreeAfterHit = tryMove(A, 0) === 0;
r.defenderFreeAfterHit = tryMove(D, 5) === 5;
console.log(r, Object.values(r).every(Boolean) ? 'PASS' : 'FAIL');
