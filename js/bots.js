// Bot brains. Runs on the host inside Sim.tick().
import { C, OBSTACLES, lineBlocked, handPos } from './config.js';

const BOT_SPEED = 0.93;
const BOT_PICK_TIME = 0.7;  // seconds a bot needs to pick a stone up
const BOT_PLACE_TIME = 0.9; // seconds a bot needs to set a stone on the stack
const BOT_AIM = 0.105; // radians of sideways error on the opening throw
// Defender bot skill per team size (fewer attackers = more forgiving), tuned with tools/simtest.js
const DEF_AIM = { 2: 0.42, 3: 0.28, 4: 0.17, 5: 0.12, 6: 0.09, 7: 0.07 };   // radians of sideways error when throwing at a runner
const DEF_RANGE = 7;       // defenders throw when this close
const DEF_WAIT = { 2: 1.8, 3: 1.2, 4: 0.8, 5: 0.5, 6: 0.3, 7: 0.2 };  // seconds holding the ball before throwing (plus a random extra)
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

function turn(p, target, dt, rate = 10) {
  let d = target - p.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  p.yaw += d * Math.min(1, rate * dt);
}

// Walk toward (tx,tz). `weave` adds a sideways zig-zag (used to dodge throws).
function moveTo(p, tx, tz, dt, mult = 1, stop = 0.15, weave = 0, time = 0) {
  let dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < stop) { p.mv = 0; return d; }
  dx /= d; dz /= d;
  // steer around obstacles that are in the way
  for (const o of OBSTACLES) {
    const ox = o.x - p.x, oz = o.z - p.z, od = Math.hypot(ox, oz), R = o.r + C.PLAYER_R + 0.9;
    if (od > R || od > d || ox * dx + oz * dz <= 0) continue;
    const side = dx * oz - dz * ox > 0 ? 1 : -1;       // pass on the side we are already leaning to
    const k = (1 - (od - o.r) / (R - o.r)) * 1.6 + 0.4;
    dx += (oz / od) * side * k; dz += (-ox / od) * side * k;
    const nl = Math.hypot(dx, dz) || 1; dx /= nl; dz /= nl;
  }
  if (weave) {
    const w = Math.sin(time * 4.2 + p.id * 2.1) * weave;
    const nx = dx - dz * w, nz = dz + dx * w, nl = Math.hypot(nx, nz);
    dx = nx / nl; dz = nz / nl;
  }
  const step = Math.min(d, C.RUN * BOT_SPEED * mult * dt);
  p.x += dx * step; p.z += dz * step;
  turn(p, yawTo(dx, dz), dt);
  p.mv = 1;
  return d;
}

// Velocity that sends the ball from `from` to target in a flat arc at roughly `speed`.
function lob(from, tx, ty, tz, speed) {
  const dx = tx - from[0], dy = ty - from[1], dz = tz - from[2];
  const T = Math.max(0.12, Math.hypot(dx, dz) / speed);
  return [dx / T, dy / T + 0.5 * C.GRAV * T, dz / T, T];
}

function withError(v, sigma, vsig) {
  const a = gauss() * sigma, s = Math.sin(a), c = Math.cos(a);
  return [v[0] * c - v[2] * s, v[1] + gauss() * vsig, v[0] * s + v[2] * c];
}

// Bots step aside instead of standing inside another player.
function separate(sim) {
  const ps = sim.players;
  for (const a of ps) {
    if (!a.bot || !a.alive || a.id === sim.thrower) continue;
    for (const b of ps) {
      if (a === b || !b.alive) continue;
      const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-3) { const k = (0.75 - d) * 0.5 / d; a.x += dx * k; a.z += dz * k; }
      else if (d <= 1e-3) a.x += 0.05 * (a.id < b.id ? -1 : 1);
    }
  }
}

const clear0 = (p, t) => !lineBlocked(p.x, p.z, t.x, t.z);

export function updateBots(sim, dt) {
  const ph = sim.phase;
  if (ph !== 'lobby') separate(sim);
  if (ph === 'throw') throwPhase(sim, dt);
  else if (ph === 'scramble') { attackers(sim, dt); defenders(sim, dt); }
  else for (const p of sim.players) if (p.bot) p.mv = 0;
}

function throwPhase(sim, dt) {
  for (const p of sim.players) {
    if (!p.bot) continue;
    p.mv = 0;
    turn(p, yawTo(-p.x, -p.z), dt, 4);
    if (p.id !== sim.thrower || sim.ballInFlight || sim.ball.holder !== p.id) continue;
    const ai = p.ai;
    ai.t = (ai.t || 0) + dt;
    if (ai.t < (ai.delay || 1.5)) continue;
    if (ai.power === undefined) ai.power = 11 + Math.random() * 9; // some bots throw soft, some hard
    const v = withError(lob(handPos(p), 0, 0.42, 0, ai.power), BOT_AIM, 0.6);
    sim.throwBall(p, v[0], v[1], v[2]);
  }
}

function attackers(sim, dt) {
  const at = sim.attackTeam;
  const mine = sim.players.filter((p) => p.team === at && p.alive);
  const bots = mine.filter((p) => p.bot);
  if (!bots.length) return;
  const holder = sim.ball.holder >= 0 ? sim.players[sim.ball.holder] : null;
  const need = sim.placed;

  // Unblock: the stone the stack needs is on the ground, but every attacker has their hands full.
  if (need < 7 && sim.stones[need].state === 'loose' && !mine.some((p) => p.carry < 0)) {
    const worst = bots.reduce((a, b) => (a.carry > b.carry ? a : b));
    sim.dropStone(worst);
  }

  // Give each free bot one loose stone, most urgent stone first.
  const free = bots.filter((p) => p.carry < 0);
  const job = new Map();
  for (let i = need; i < 7 && free.length; i++) {
    const st = sim.stones[i];
    if (st.state !== 'loose') continue;
    let bi = 0, bd = 1e9;
    free.forEach((p, k) => {
      const d = Math.hypot(st.body.position.x - p.x, st.body.position.z - p.z);
      if (d < bd) { bd = d; bi = k; }
    });
    job.set(free[bi].id, i);
    free.splice(bi, 1);
  }

  for (const p of bots) {
    if (p.cd > 0) { p.mv = 0; continue; } // bending down to pick up / set down a stone
    const danger = holder ? Math.hypot(holder.x - p.x, holder.z - p.z) : 99;
    const weave = danger < 10 ? 0.75 : 0.25;
    if (p.carry >= 0) {
      if (p.carry === need) {
        const d = moveTo(p, 0, 0, dt, C.STONE_MULT, 0.9, Math.hypot(p.x, p.z) > 3 ? weave : 0, sim.time);
        if (d <= C.BASE_R - 0.2 && p.cd <= 0) { sim.placeStone(p); p.cd = BOT_PLACE_TIME; }
      } else {
        // wait near the base, keep moving so we are harder to hit
        const a = p.id * 1.7 + sim.time * 0.9;
        moveTo(p, Math.cos(a) * 3.2, Math.sin(a) * 3.2, dt, C.STONE_MULT, 0.2, 0, sim.time);
      }
    } else if (job.has(p.id)) {
      const i = job.get(p.id), sp = sim.stones[i].body.position;
      const d = moveTo(p, sp.x, sp.z, dt, 1, 0.5, Math.hypot(sp.x - p.x, sp.z - p.z) > 2.5 ? weave : 0, sim.time);
      if (d < C.PICK_R - 0.3 && sim.scrambleT > 0.6 && p.cd <= 0) { sim.pickStone(p, i); p.cd = BOT_PICK_TIME; }
    } else {
      // nothing to carry: stay away from the ball
      const a = p.id * 2.3 + sim.time * 0.7;
      let tx = Math.cos(a) * 6, tz = Math.sin(a) * 6;
      if (holder && danger < 7) { tx = p.x + (p.x - holder.x); tz = p.z + (p.z - holder.z); }
      moveTo(p, tx, tz, dt, 1, 0.3, 0.3, sim.time);
    }
  }
}

function defenders(sim, dt) {
  const at = sim.attackTeam;
  const mine = sim.players.filter((p) => p.team !== at && p.alive);
  const targets = sim.players.filter((p) => p.team === at && p.alive);
  const ball = sim.ball, bp = ball.body.position, bv = ball.body.velocity;
  const holder = ball.holder >= 0 ? sim.players[ball.holder] : null;

  // who chases a free ball: the nearest defender (if that is a human, the nearest bot goes too)
  let chaser = null;
  if (!holder) {
    let bd = 1e9;
    for (const p of mine) {
      if (!p.bot) continue;
      const d = Math.hypot(bp.x - p.x, bp.z - p.z);
      if (d < bd) { bd = d; chaser = p; }
    }
  }

  // A human holds the ball: a bot team-mate much closer to a runner calls for it.
  if (holder && !holder.bot) {
    const near = (q) => Math.min(...targets.map((t) => Math.hypot(t.x - q.x, t.z - q.z)), 99);
    const hd = near(holder);
    for (const p of mine) {
      if (!p.bot || p === holder || sim.time - p.callT < 3.5) continue;
      if (near(p) < hd - 6 && near(p) < 9 && !lineBlocked(holder.x, holder.z, p.x, p.z)) { sim.callForBall(p); break; }
    }
  }

  let slot = 0;
  for (const p of mine) {
    if (!p.bot) { slot++; continue; }
    const ai = p.ai;
    if (holder === p) {
      ai.hold = (ai.hold || 0) + dt;
      if (ai.wait === undefined || ai.hold < dt * 1.5) ai.wait = (DEF_WAIT[sim.teamSize] || 2) + Math.random() * 1.4;
      // pick a target: nearest attacker, with a bonus for whoever carries the stone the stack needs
      let tgt = null, td = 1e9;
      for (const t of targets) {
        let d = Math.hypot(t.x - p.x, t.z - p.z);
        if (t.carry === sim.placed) d -= 3;
        if (d < td) { td = d; tgt = t; }
      }
      if (!tgt) { p.mv = 0; slot++; continue; }
      // a team-mate called for the ball: pass to them if the way is clear (bots answer after a short reaction)
      const caller = mine.find((m) => m !== p && sim.time - m.callT < C.CALL_TIME && sim.time - m.callT > 0.25 && !lineBlocked(p.x, p.z, m.x, m.z));
      if (caller) {
        turn(p, yawTo(caller.x - p.x, caller.z - p.z), dt, 20);
        const v = lob(handPos(p), caller.x + caller.vx * 0.3, caller.y + 1.0, caller.z + caller.vz * 0.3, 13);
        caller.callT = -99;
        sim.throwBall(p, v[0], v[1], v[2]);
        slot++; continue;
      }
      const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      turn(p, yawTo(tgt.x - p.x, tgt.z - p.z), dt, 12);
      // pass to a team-mate who is much closer to the target
      if ((dist > 11 || !clear0(p, tgt)) && ai.hold > ai.wait) {
        let mate = null, md = dist - 5;
        for (const m of mine) {
          if (m === p || lineBlocked(p.x, p.z, m.x, m.z)) continue;
          const d = Math.hypot(tgt.x - m.x, tgt.z - m.z);
          if (d < md) { md = d; mate = m; }
        }
        if (mate) {
          const v = lob(handPos(p), mate.x + mate.vx * 0.3, mate.y + 1.2, mate.z + mate.vz * 0.3, 13);
          sim.throwBall(p, v[0], v[1], v[2]);
          slot++; continue;
        }
      }
      const clear = !lineBlocked(p.x, p.z, tgt.x, tgt.z);
      if ((dist < DEF_RANGE && ai.hold > ai.wait && clear) || ai.hold > 6) {
        const from = handPos(p), speed = 17;
        const T = dist / speed;
        const v = withError(lob(from, tgt.x + tgt.vx * T * 0.85, tgt.y + 0.85, tgt.z + tgt.vz * T * 0.85, speed), DEF_AIM[sim.teamSize] || 0.3, 0.9);
        sim.throwBall(p, v[0], v[1], v[2]);
      } else {
        moveTo(p, tgt.x, tgt.z, dt, C.BALL_MULT, 3, 0, sim.time);
        turn(p, yawTo(tgt.x - p.x, tgt.z - p.z), dt, 12);
      }
    } else if (chaser === p) {
      // run to where the ball is going to be
      const lead = Math.min(0.5, Math.hypot(bp.x - p.x, bp.z - p.z) / 12);
      let tx = bp.x + bv.x * lead, tz = bp.z + bv.z * lead;
      tx = Math.max(-C.FIELD_X, Math.min(C.FIELD_X, tx)); tz = Math.max(-C.FIELD_Z, Math.min(C.FIELD_Z, tz));
      moveTo(p, tx, tz, dt, 1, 0.1, 0, sim.time);
    } else {
      // guard a ring around the base so a pass can reach someone close to the attackers
      const a = slot * (Math.PI * 2 / Math.max(1, mine.length)) + 0.6;
      const d = moveTo(p, Math.cos(a) * 5, Math.sin(a) * 5, dt, 1, 0.4, 0, sim.time);
      if (d < 0.4) turn(p, yawTo(-p.x, -p.z), dt, 5);
    }
    slot++;
  }
}
