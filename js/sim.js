// The authoritative game. Runs on the host only (solo play = host with no guests).
// No DOM and no three.js in here, so it can also be run headless in Node for testing.
import * as CANNON from '../vendor/cannon-es.js';
import { C, CHAR_COUNT, STONES, OBSTACLES, stackY, clampToField, pushOutOfStack, pushOutOfObstacles, handPos, stonesKnocked, rebuildPoints, DEFEND_POINTS, r2, r3 } from './config.js';
import { updateBots } from './bots.js';

const BOT_NAMES = ['Rahim', 'Karim', 'Babu', 'Tuli', 'Mitu', 'Sumon', 'Riya', 'Apu', 'Nila', 'Jamal', 'Shila', 'Rony', 'Mina', 'Tareq'];
const G_GROUND = 1, G_BALL = 2, G_STONE = 4;

export class Sim {
  constructor({ teamSize = 2, onEvent = () => {} } = {}) {
    teamSize = Math.max(2, Math.min(C.MAX_TEAM, Math.round(teamSize) || 2));
    this.teamSize = teamSize;
    this.knocked = 0;      // stones the opening hit knocked off this round
    this.hitIdx = 0;       // which stone the ball touched first
    this.onEvent = onEvent;
    this.time = 0;
    this.seq = 0;
    this.phase = 'lobby';       // lobby | throw | scramble | roundEnd | matchEnd
    this.phaseT = 0;
    this.attackTeam = 0;
    this.scores = [0, 0];
    this.round = 0;
    this.timer = 0;
    this.thrower = -1;
    this.throwQueue = [];
    this.placed = 0;
    this.ballInFlight = false;
    this.flightT = 0;
    this.hitPending = false;
    this.scrambleT = 0;
    this.lastWinner = -1;

    this._initPhysics();

    this.players = [];
    for (let i = 0; i < teamSize * 2; i++) {
      this.players.push({
        id: i, name: BOT_NAMES[i % BOT_NAMES.length], team: i % 2, bot: true, conn: null,
        x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, mv: 0, vx: 0, vz: 0, px: 0, pz: 0,
        alive: true, carry: -1, thr: 0, tp: 0, cd: 0, callT: -99, ai: {}, char: i % CHAR_COUNT,
      });
    }
    this._lineUp();
  }

  // ---------- setup ----------
  _initPhysics() {
    const world = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -C.GRAV, 0) });
    world.allowSleep = true;
    world.solver.iterations = 8;
    const mGround = new CANNON.Material('ground');
    const mBall = new CANNON.Material('ball');
    const mStone = new CANNON.Material('stone');
    world.addContactMaterial(new CANNON.ContactMaterial(mBall, mGround, { restitution: 0.55, friction: 0.5 }));
    world.addContactMaterial(new CANNON.ContactMaterial(mBall, mStone, { restitution: 0.35, friction: 0.4 }));
    world.addContactMaterial(new CANNON.ContactMaterial(mStone, mGround, { restitution: 0.12, friction: 0.75 }));
    world.addContactMaterial(new CANNON.ContactMaterial(mStone, mStone, { restitution: 0.05, friction: 0.6 }));

    const mask = G_BALL | G_STONE;
    const ground = this.ground = new CANNON.Body({ mass: 0, material: mGround, collisionFilterGroup: G_GROUND, collisionFilterMask: mask });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    const wall = (x, z, ry) => {
      const b = new CANNON.Body({ mass: 0, material: mGround, collisionFilterGroup: G_GROUND, collisionFilterMask: mask });
      b.addShape(new CANNON.Plane());
      b.quaternion.setFromEuler(0, ry, 0);
      b.position.set(x, 0, z);
      world.addBody(b);
    };
    wall(C.FIELD_X + 0.6, 0, -Math.PI / 2);
    wall(-C.FIELD_X - 0.6, 0, Math.PI / 2);
    wall(0, C.FIELD_Z + 0.6, Math.PI);
    wall(0, -C.FIELD_Z - 0.6, 0);

    // obstacles: solid for the ball and the stones (players are kept out in config.pushOutOfObstacles)
    for (const o of OBSTACLES) {
      const b = new CANNON.Body({ mass: 0, material: mGround, collisionFilterGroup: G_GROUND, collisionFilterMask: mask });
      b.addShape(new CANNON.Cylinder(o.r, o.r, o.h, 12));
      b.position.set(o.x, o.h / 2, o.z);
      world.addBody(b);
    }

    const ball = new CANNON.Body({
      mass: 0.2, material: mBall, linearDamping: C.BALL_DAMP, angularDamping: 0.45,
      collisionFilterGroup: G_BALL, collisionFilterMask: G_GROUND | G_STONE, allowSleep: false,
    });
    ball.addShape(new CANNON.Sphere(C.BALL_R));
    world.addBody(ball);
    this.ball = { body: ball, holder: -1, live: false, thrower: -1, throwTime: -9, prev: new CANNON.Vec3(), prevVel: new CANNON.Vec3() };
    ball.addEventListener('collide', (e) => {
      if (e.body === this.ground) { this.ball.live = false; this._bounce = true; return; }
      if (e.body.stoneIdx !== undefined) {
        this._bounce = true;
        if (this.phase === 'throw' && this.ballInFlight && this.stones[e.body.stoneIdx].state === 'stacked' && !this.hitPending) { this.hitPending = true; this.hitIdx = e.body.stoneIdx; }
      } else this.ball.live = false; // wall
    });

    this.stones = STONES.map((s, i) => {
      const body = new CANNON.Body({
        mass: 0, type: CANNON.Body.STATIC, material: mStone,
        collisionFilterGroup: G_STONE, collisionFilterMask: G_GROUND | G_BALL | G_STONE,
        linearDamping: 0.05, angularDamping: 0.3, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.6,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(s.hw, s.hh, s.hw * 0.9)));
      body.stoneIdx = i;
      world.addBody(body);
      return { body, state: 'stacked', carrier: -1, inWorld: true };
    });
    this._resetStones();
  }

  _stoneStatic(i, state) {
    const st = this.stones[i], b = st.body;
    b.type = CANNON.Body.STATIC; b.mass = 0; b.updateMassProperties();
    b.velocity.setZero(); b.angularVelocity.setZero();
    b.position.set(0, stackY(i), 0);
    b.quaternion.setFromEuler(0, i * 0.9, 0);
    b.aabbNeedsUpdate = true;
    if (!st.inWorld) { this.world.addBody(b); st.inWorld = true; }
    st.state = state; st.carrier = -1;
  }

  _stoneLoose(i, x, y, z) {
    const st = this.stones[i], b = st.body;
    b.type = CANNON.Body.DYNAMIC; b.mass = STONES[i].mass; b.updateMassProperties();
    if (x !== undefined) { b.position.set(x, y, z); b.velocity.setZero(); b.angularVelocity.setZero(); }
    b.aabbNeedsUpdate = true;
    if (!st.inWorld) { this.world.addBody(b); st.inWorld = true; }
    b.wakeUp();
    st.state = 'loose'; st.carrier = -1;
  }

  _resetStones() {
    for (let i = 0; i < 7; i++) this._stoneStatic(i, 'stacked');
    this.placed = 0;
  }

  _lineUp() {
    // Lobby / idle line-up: both teams face each other across the stack.
    const n = this.teamSize;
    for (const p of this.players) {
      const k = Math.floor(p.id / 2);
      p.x = (k - (n - 1) / 2) * 1.9; p.y = 0; p.vy = 0;
      p.z = p.team === 0 ? 4.5 : -4.5;
      p.yaw = p.team === 0 ? 0 : Math.PI;
      p.alive = true; p.carry = -1; p.mv = 0; p.tp++;
    }
    this._holdBall(-1);
    this.ball.body.position.set(0, 3, 6);
    this.ball.body.velocity.setZero();
  }

  // ---------- humans ----------
  addHuman(name, conn, char = -1) {
    const humans = [0, 1].map((t) => this.players.filter((p) => p.team === t && !p.bot).length);
    const team = humans[0] <= humans[1] ? 0 : 1;
    const slot = this.players.find((p) => p.team === team && p.bot) || this.players.find((p) => p.bot);
    if (!slot) return null;
    slot.bot = false; slot.conn = conn; slot.name = String(name || 'Player').slice(0, 14); slot.mv = 0; slot.ai = {};
    this.setChar(slot.id, char);
    this.emit('join', { id: slot.id, name: slot.name });
    return slot;
  }

  removeHuman(id) {
    const p = this.players[id];
    if (!p || p.bot) return;
    this.emit('leave', { id, name: p.name });
    p.bot = true; p.conn = null; p.ai = {}; p.name = BOT_NAMES[id % BOT_NAMES.length]; p.char = id % CHAR_COUNT;
  }

  // Pick a character. Allowed before a match starts and between matches, not in the middle of one.
  setChar(id, c) {
    const p = this.players[id];
    c = Math.floor(+c);
    if (!p || !(c >= 0 && c < CHAR_COUNT)) return false;
    if (this.phase !== 'lobby' && this.phase !== 'matchEnd') return false;
    p.char = c;
    return true;
  }

  switchTeam(id) {
    if (this.phase !== 'lobby') return false;
    const p = this.players[id];
    if (!p) return false;
    const currentTeam = p.team;
    const targetTeam = currentTeam ^ 1;
    const bot = this.players.find((b) => b.team === targetTeam && b.bot);
    if (!bot) return false;
    p.team = targetTeam;
    bot.team = currentTeam;
    this._lineUp();
    this.emit('switch', { id, team: targetTeam });
    return true;
  }

  setHumanState(id, s) {
    const p = this.players[id];
    if (!p || p.bot || !p.alive || s.tp !== p.tp) return;
    if (!isFinite(s.x + s.y + s.z + s.yaw + s.pitch)) return;
    p.x = s.x; p.z = s.z; p.y = Math.max(0, Math.min(3, s.y));
    p.yaw = s.yaw; p.pitch = s.pitch; p.mv = Math.max(0, Math.min(1, s.mv || 0));
    clampToField(p);
  }

  action(id, a) {
    const p = this.players[id];
    if (!p || !p.alive) return;
    if (a.k === 'throw') {
      if (this.ball.holder !== id) return;
      const d = a.d || [0, 0, -1];
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      const pw = Math.max(0, Math.min(1, +a.p || 0));
      const sp = C.THROW_MIN + (C.THROW_MAX - C.THROW_MIN) * pw;
      this.throwBall(p, d[0] / len * sp, d[1] / len * sp, d[2] / len * sp);
    } else if (a.k === 'act') {
      this.grab(p);
    } else if (a.k === 'call') {
      this.callForBall(p);
    }
  }

  // A defender asks the team-mate holding the ball to pass it. Bots holding the ball answer it (bots.js);
  // humans see a PASS bubble over the caller.
  callForBall(p) {
    const h = this.ball.holder;
    if (this.phase !== 'scramble' || !p.alive || p.team === this.attackTeam || h < 0 || h === p.id) return;
    if (this.players[h].team !== p.team || this.time - p.callT < 0.8) return;
    p.callT = this.time;
    this.emit('call', { id: p.id, to: h });
  }

  // ---------- ball ----------
  _holdBall(id) {
    const b = this.ball;
    b.holder = id; b.live = false;
    b.body.collisionFilterMask = id >= 0 ? 0 : (G_GROUND | G_STONE);
    b.body.velocity.setZero(); b.body.angularVelocity.setZero();
    if (id >= 0) { this.players[id].ai.hold = 0; this.players[id].callT = -99; }
  }

  throwBall(p, vx, vy, vz) {
    const b = this.ball;
    if (b.holder !== p.id) return;
    if (this.phase === 'throw' && (p.id !== this.thrower || this.ballInFlight)) return;
    if (this.phase !== 'throw' && this.phase !== 'scramble') return;
    const h = handPos(p);
    this._holdBall(-1);
    b.body.position.set(h[0], h[1], h[2]);
    b.body.velocity.set(vx, vy, vz);
    b.body.angularVelocity.set(vz * 2, 0, -vx * 2);
    b.prev.copy(b.body.position);
    b.thrower = p.id; b.throwTime = this.time;
    b.live = this.phase === 'scramble' && p.team !== this.attackTeam;
    p.thr++;
    if (this.phase === 'throw') { this.ballInFlight = true; this.flightT = 0; }
    this.emit('throw', { id: p.id });
  }

  // ---------- stones ----------
  grab(p) {
    if (this.phase !== 'scramble' || p.team !== this.attackTeam || !p.alive) return;
    if (p.cd > 0) return; // ignore a second tap right after picking up / dropping
    if (p.carry >= 0) {
      if (p.carry === this.placed && Math.hypot(p.x, p.z) <= C.BASE_R) this.placeStone(p);
      else { this.dropStone(p); p.cd = 0.4; }
      return;
    }
    if (this.scrambleT < 0.6) return;
    let best = -1, bd = C.PICK_R;
    for (let i = 0; i < 7; i++) {
      const st = this.stones[i];
      if (st.state !== 'loose') continue;
      const d = Math.hypot(st.body.position.x - p.x, st.body.position.z - p.z);
      // prefer the stone the stack needs next when several are in reach
      const score = i === this.placed ? -1 : d; // the stone the stack needs next always wins
      if (d <= C.PICK_R && score < bd) { bd = score; best = i; }
    }
    if (best >= 0) this.pickStone(p, best);
  }

  pickStone(p, i) {
    const st = this.stones[i];
    if (st.state !== 'loose' || p.carry >= 0 || p.cd > 0) return;
    p.cd = 0.45;
    if (st.inWorld) { this.world.removeBody(st.body); st.inWorld = false; }
    st.state = 'carried'; st.carrier = p.id; p.carry = i;
    this.emit('pick', { id: p.id, i });
  }

  dropStone(p) {
    const i = p.carry;
    if (i < 0) return;
    p.carry = -1;
    let x = p.x - Math.sin(p.yaw) * 0.6, z = p.z - Math.cos(p.yaw) * 0.6;
    const d = Math.hypot(x, z);
    if (d < 0.9) { const k = 0.9 / (d || 1); x = (x || 0.9) * k; z *= k; } // never drop inside the stack
    this._stoneLoose(i, x, 0.6, z);
  }

  placeStone(p) {
    const i = p.carry;
    if (i !== this.placed || p.cd > 0) return;
    p.cd = 0.5;
    p.carry = -1;
    this._stoneStatic(i, 'placed');
    this.placed++;
    this.emit('place', { id: p.id, i });
  }

  // ---------- rounds ----------
  startMatch() {
    this.scores = [0, 0]; this.round = 0; this.attackTeam = 0; this.lastWinner = -1;
    this.emit('start', {});
    this.startRound();
  }

  startRound() {
    this.round++;
    this._resetStones();
    this.hitPending = false; this.ballInFlight = false; this.knocked = 0;
    const n = this.teamSize;
    let a = 0, d = 0;
    for (const p of this.players) {
      p.alive = true; p.carry = -1; p.y = 0; p.vy = 0; p.mv = 0; p.ai = {};
      if (p.team === this.attackTeam) {
        const side = a % 2 ? 1 : -1;
        p.x = side * (3.2 + Math.floor(a / 2) * 1.6); p.z = C.THROW_Z + 2.4; p.yaw = 0; a++;
      } else {
        p.x = (d - (n - 1) / 2) * Math.min(5, 40 / n); p.z = -6 - (d % 2) * 2.5; p.yaw = Math.PI; d++;
        pushOutOfObstacles(p);
      }
      p.pitch = 0; p.tp++;
    }
    this.throwQueue = this.players.filter((p) => p.team === this.attackTeam).map((p) => p.id);
    this.phase = 'throw';
    this.emit('round', { n: this.round, at: this.attackTeam });
    this._nextThrower();
  }

  _nextThrower() {
    if (!this.throwQueue.length) { this._endRound(-1, 'allmiss'); return; }
    const id = this.throwQueue.shift();
    const p = this.players[id];
    this.thrower = id;
    p.x = 0; p.z = C.THROW_Z + 1; p.y = 0; p.yaw = 0; p.pitch = 0; p.tp++;
    p.ai = { t: 0, delay: 1.4 + Math.random() * 1.2 };
    this._holdBall(id);
    this.ballInFlight = false;
    this.timer = C.THROW_TIME;
    this.emit('turn', { id });
  }

  _miss() {
    this.emit('miss', { id: this.thrower });
    // move the previous thrower aside
    const p = this.players[this.thrower];
    if (p) { p.x = (p.id % 4 < 2 ? -1 : 1) * (4.5 + Math.random() * 2); p.z = C.THROW_Z + 2.4; p.tp++; }
    this._nextThrower();
  }

  // The stack breaks according to how hard and where it was hit:
  // a soft touch only slides the top stone off, a hard low hit sends all seven flying far.
  _scatter() {
    this.hitPending = false; this.ballInFlight = false;
    this.phase = 'scramble'; this.timer = C.SCRAMBLE_TIME; this.scrambleT = 0;
    const bv = this.ball.prevVel;
    const speed = bv.length();
    const e = Math.max(0, Math.min(1, (speed - C.BREAK_MIN_V) / (C.BREAK_MAX_V - C.BREAK_MIN_V)));
    // speed decides how many come off; hitting high on the stack cannot move the stones well below the impact
    const lowest = Math.max(7 - stonesKnocked(speed), this.hitIdx - 2, 0);
    this.knocked = 7 - lowest;
    this.placed = lowest;
    const bl = Math.hypot(bv.x, bv.z) || 1;
    const dx = bv.x / bl, dz = bv.z / bl;
    for (let i = lowest; i < 7; i++) {
      this._stoneLoose(i);
      const b = this.stones[i].body;
      const ang = Math.random() * Math.PI * 2;
      const out = (1.6 + e * 13) * (0.55 + Math.random() * 0.9) + (i - lowest) * 0.25;
      const along = (0.6 + e * 3.2) * (0.5 + Math.random());
      b.velocity.set(dx * along + Math.cos(ang) * out, 1.6 + e * 3.6 + Math.random() * 1.6, dz * along + Math.sin(ang) * out);
      const spin = 2 + e * 7;
      b.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    }
    this.emit('scatter', { id: this.thrower, n: this.knocked, v: r2(speed) });
    this.thrower = -1;
  }

  _endRound(winner, why) {
    const pts = winner < 0 ? 0 : why === 'built' ? rebuildPoints(this.knocked) : DEFEND_POINTS;
    if (winner >= 0) this.scores[winner] += pts;
    this.lastWinner = winner;
    this.phase = 'roundEnd'; this.phaseT = C.ROUND_END_TIME; this.thrower = -1;
    if (this.ball.holder >= 0) {
      const h = this.players[this.ball.holder], hp = handPos(h);
      this._holdBall(-1);
      this.ball.body.position.set(hp[0], hp[1], hp[2]);
    }
    this.ball.live = false;
    this.emit('roundEnd', { w: winner, why, pts, sc: this.scores.slice() });
  }

  eliminate(p) {
    p.alive = false; p.mv = 0;
    if (p.carry >= 0) this.dropStone(p);
    this.emit('out', { id: p.id, by: this.ball.thrower });
  }

  emit(k, data) { this.onEvent(Object.assign({ t: 'e', k }, data)); }

  // ---------- main tick ----------
  tick(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    for (const p of this.players) {
      if (dt > 0) { p.vx = (p.x - p.px) / dt; p.vz = (p.z - p.pz) / dt; }
      p.px = p.x; p.pz = p.z;
      if (p.cd > 0) p.cd -= dt;
    }

    updateBots(this, dt);
    for (const p of this.players) if (p.bot) { clampToField(p); pushOutOfStack(p); pushOutOfObstacles(p); }

    const ball = this.ball, bb = ball.body;
    if (this.phase === 'throw') {
      if (!this.ballInFlight) {
        this.timer -= dt;
        if (this.timer <= 0) this._miss();
      } else {
        this.flightT += dt;
        if ((this.flightT > 0.9 && bb.velocity.length() < 1.2) || this.flightT > 4.5) this._miss();
      }
    } else if (this.phase === 'scramble') {
      this.timer -= dt; this.scrambleT += dt;
    } else if (this.phase === 'roundEnd') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (Math.max(this.scores[0], this.scores[1]) >= C.WIN_SCORE) {
          this.phase = 'matchEnd';
          this.emit('match', { w: this.scores[0] > this.scores[1] ? 0 : 1, sc: this.scores.slice() });
        } else {
          this.attackTeam ^= 1;
          this.startRound();
        }
      }
    }

    // ball follows the holder's hand
    if (ball.holder >= 0) {
      const h = handPos(this.players[ball.holder]);
      bb.position.set(h[0], h[1], h[2]); bb.velocity.setZero();
    }
    ball.prev.copy(bb.position);
    ball.prevVel.copy(bb.velocity);
    this._bounce = false;
    this.world.step(1 / 60, dt, 4);
    if (this._bounce && bb.velocity.length() > 1.5) this.emit('bounce', { v: r2(Math.min(1, ball.prevVel.length() / 15)) });

    if (this.hitPending && this.phase === 'throw') this._scatter();

    if (bb.position.y < -3 || Math.abs(bb.position.x) > C.FIELD_X + 3 || Math.abs(bb.position.z) > C.FIELD_Z + 3) {
      bb.position.set(0, 2, -3); bb.velocity.setZero(); ball.live = false;
    }
    for (const st of this.stones) {
      const sp = st.body.position;
      if (st.state === 'loose' && (sp.y < -2 || Math.abs(sp.x) > C.FIELD_X + 2 || Math.abs(sp.z) > C.FIELD_Z + 2)) {
        st.body.position.set(Math.max(-C.FIELD_X, Math.min(C.FIELD_X, sp.x)), 0.5, Math.max(-C.FIELD_Z, Math.min(C.FIELD_Z, sp.z)));
        st.body.velocity.setZero();
      }
    }

    if (this.phase === 'scramble') this._scrambleChecks();
  }

  _scrambleChecks() {
    const ball = this.ball, bb = ball.body, bp = bb.position;
    if (ball.holder < 0) {
      // 1) does a live ball hit an attacker?
      if (ball.live && bb.velocity.length() > 4) {
        const R = C.PLAYER_R + C.BALL_R;
        outer: for (let s = 1; s <= 3; s++) {
          const f = s / 3;
          const x = ball.prev.x + (bp.x - ball.prev.x) * f;
          const y = ball.prev.y + (bp.y - ball.prev.y) * f;
          const z = ball.prev.z + (bp.z - ball.prev.z) * f;
          for (const p of this.players) {
            if (!p.alive || p.team !== this.attackTeam) continue;
            if (y < p.y - C.BALL_R || y > p.y + C.PLAYER_H + C.BALL_R) continue;
            const dx = x - p.x, dz = z - p.z;
            if (dx * dx + dz * dz > R * R) continue;
            // bounce the ball off the player
            const d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
            const vn = bb.velocity.x * nx + bb.velocity.z * nz;
            bb.velocity.x = (bb.velocity.x - 2 * vn * nx) * 0.35;
            bb.velocity.z = (bb.velocity.z - 2 * vn * nz) * 0.35;
            bb.velocity.y = Math.abs(bb.velocity.y) * 0.4 + 2;
            bp.set(p.x + nx * (R + 0.05), y, p.z + nz * (R + 0.05));
            ball.live = false;
            this.eliminate(p);
            break outer;
          }
        }
      }
      // 2) can a defender pick the ball up / catch it?
      if (ball.holder < 0 && bp.y < 2.1) {
        let best = null, bd = 1.05;
        for (const p of this.players) {
          if (!p.alive || p.team === this.attackTeam) continue;
          if (p.id === ball.thrower && this.time - ball.throwTime < 0.7) continue;
          if (this.time - ball.throwTime < 0.25) continue;
          const d = Math.hypot(bp.x - p.x, bp.z - p.z);
          if (d < bd && bp.y - p.y < 2.1) { bd = d; best = p; }
        }
        if (best) { this._holdBall(best.id); this.emit('catch', { id: best.id }); }
      }
    }

    // humans place automatically when they walk the right stone into the base circle
    for (const p of this.players) {
      if (!p.bot && p.alive && p.carry >= 0 && p.carry === this.placed && Math.hypot(p.x, p.z) <= C.BASE_R - 0.15) this.placeStone(p);
    }

    const defTeam = this.attackTeam ^ 1;
    if (this.placed >= 7) this._endRound(this.attackTeam, 'built');
    else if (!this.players.some((p) => p.team === this.attackTeam && p.alive)) this._endRound(defTeam, 'out');
    else if (this.timer <= 0) this._endRound(defTeam, 'time');
  }

  // ---------- state for rendering / network ----------
  snapshot() {
    const b = this.ball.body;
    return {
      t: 's', n: ++this.seq, ph: this.phase, at: this.attackTeam, sc: this.scores, rd: this.round,
      tm: Math.max(0, Math.ceil(this.phase === 'roundEnd' ? this.phaseT : this.timer)), th: this.thrower, pc: this.placed,
      fl: this.ballInFlight ? 1 : 0, lw: this.lastWinner, ts: this.teamSize, kn: this.knocked,
      p: this.players.map((p) => [p.id, p.team, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), r2(p.mv),
        (p.alive ? 1 : 0) | (p.bot ? 2 : 0) | (this.time - p.callT < C.CALL_TIME ? 4 : 0), p.carry, p.thr, p.tp, p.name, p.char]),
      b: [r2(b.position.x), r2(b.position.y), r2(b.position.z), this.ball.holder, this.ball.live ? 1 : 0],
      s: this.stones.map((st) => {
        const q = st.body.quaternion, p = st.body.position;
        return [r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), st.state === 'loose' ? 1 : st.state === 'carried' ? 2 : 0, st.carrier];
      }),
    };
  }
}
