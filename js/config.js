// Tunable numbers and small helpers shared by the host simulation and the clients.
// World: stack of stones at the origin. +Z is the attackers' side (throw line), -Z the defenders' side.
// Yaw convention: forward = (-sin(yaw), 0, -cos(yaw)), so yaw 0 looks toward -Z.

export const C = {
  FIELD_X: 45,           // the field is 90 x 70 m
  FIELD_Z: 35,
  THROW_Z: 11,           // throw line distance from the stack
  DEF_LINE: 6,           // defence line: defenders wait at least this far from the stack, on the far side
  PLAYER_H: 1.5,          // the players are children: 1.3-1.46 m tall
  PLAYER_R: 0.35,
  RUN: 6.2,              // m/s
  BALL_MULT: 0.55,       // speed multiplier while holding the ball
  STONE_MULT: 0.88,      // speed multiplier while carrying a stone
  JUMP_V: 5.4,
  PGRAV: 15,             // player gravity (snappier than the ball's)
  BALL_R: 0.13,
  GRAV: 9.82,
  BALL_DAMP: 0.12,
  THROW_MIN: 8,
  THROW_MAX: 24,
  BASE_R: 1.6,           // how close to the base you must be to place a stone
  PICK_R: 1.6,           // how close to a stone you must be to grab it
  STACK_BLOCK_R: 0.6,    // players cannot walk through the stack
  SCRAMBLE_TIME: 160,
  CALL_TIME: 2.5,        // seconds a call for the ball stays active
  THROW_TIME: 14,
  ROUND_END_TIME: 5,
  WIN_SCORE: 7,
  MAX_TEAM: 7,
  // Breaking the stack: ball speed (m/s) at impact decides how many stones come off.
  BREAK_MIN_V: 6,        // at or below this only the top stone falls
  BREAK_MAX_V: 19,       // at or above this all seven fly
  CHARGE_TIME: 0.75,     // seconds for the power bar to swing from empty to full (it swings back and forth)
  SNAP_HZ: 20,
};

// Number of selectable characters (js/kid.js has the list). Kept here so the game logic needs no 3D code.
export const CHAR_COUNT = 11;

export const TEAMS = [
  { name: 'Red', color: 0xe2483d, css: '#ff5a4d' },
  { name: 'Blue', color: 0x2f7fe0, css: '#4a9bff' },
];

// Things standing on the field. They stop the ball and block players, so runners can hide behind them.
// Lobbed throws can clear the low ones. r = radius, h = height in metres.
export const OBSTACLES = [
  { kind: 'hay', x: -7, z: -5, r: 1.15, h: 1.7 },
  { kind: 'tree', x: 7.5, z: -6.5, r: 0.5, h: 6 },
  { kind: 'well', x: 0, z: -11, r: 1.1, h: 1.0 },
  { kind: 'tree', x: -13, z: 3, r: 0.5, h: 6 },
  { kind: 'hay', x: 12, z: 4, r: 1.15, h: 1.7 },
  { kind: 'pots', x: -6.5, z: 7, r: 0.85, h: 1.25 },
  { kind: 'pots', x: 6, z: 8.5, r: 0.85, h: 1.25 },
  { kind: 'hay', x: 4.5, z: -14, r: 1.15, h: 1.7 },
  { kind: 'pots', x: -15, z: -11, r: 0.85, h: 1.25 },
  { kind: 'well', x: 17, z: -10, r: 1.1, h: 1.0 },
  { kind: 'tree', x: -10, z: -15, r: 0.5, h: 6 },
  { kind: 'hay', x: -19, z: 12, r: 1.15, h: 1.7 },
  { kind: 'tree', x: 18, z: 13, r: 0.5, h: 6 },
  { kind: 'pots', x: 20, z: 1, r: 0.85, h: 1.25 },
  { kind: 'hay', x: -21, z: -2, r: 1.15, h: 1.7 },
  // outer ring, added when the field grew to 64 x 50 m
  { kind: 'tree', x: -26, z: -18, r: 0.5, h: 6 },
  { kind: 'well', x: -27, z: 8, r: 1.1, h: 1.0 },
  { kind: 'hay', x: 26, z: -19, r: 1.15, h: 1.7 },
  { kind: 'pots', x: 27, z: 9, r: 0.85, h: 1.25 },
  { kind: 'tree', x: 10, z: -21, r: 0.5, h: 6 },
  { kind: 'hay', x: -4, z: -21, r: 1.15, h: 1.7 },
  { kind: 'pots', x: -12, z: 18, r: 0.85, h: 1.25 },
  { kind: 'tree', x: 13, z: 19, r: 0.5, h: 6 },
  // third ring, added when the field grew to 90 x 70 m
  { kind: 'hay', x: -36, z: -24, r: 1.15, h: 1.7 },
  { kind: 'tree', x: -38, z: 6, r: 0.5, h: 6 },
  { kind: 'well', x: -33, z: 24, r: 1.1, h: 1.0 },
  { kind: 'pots', x: -22, z: 30, r: 0.85, h: 1.25 },
  { kind: 'hay', x: -2, z: 31, r: 1.15, h: 1.7 },
  { kind: 'tree', x: 24, z: 28, r: 0.5, h: 6 },
  { kind: 'hay', x: 38, z: 20, r: 1.15, h: 1.7 },
  { kind: 'pots', x: 39, z: -6, r: 0.85, h: 1.25 },
  { kind: 'tree', x: 35, z: -27, r: 0.5, h: 6 },
  { kind: 'well', x: 14, z: -31, r: 1.1, h: 1.0 },
  { kind: 'pots', x: -14, z: -31, r: 0.85, h: 1.25 },
  { kind: 'hay', x: -28, z: -8, r: 1.15, h: 1.7 },
  { kind: 'hay', x: 28, z: 12, r: 1.15, h: 1.7 },
  { kind: 'tree', x: 0, z: 22, r: 0.5, h: 6 },
];

export function pushOutOfObstacles(p) {
  for (const o of OBSTACLES) {
    const dx = p.x - o.x, dz = p.z - o.z, R = o.r + C.PLAYER_R, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-4) { p.x = o.x + R; continue; }
    p.x = o.x + dx / d * R; p.z = o.z + dz / d * R;
  }
}

// Does the straight line a -> b pass through an obstacle? (used by bots before they throw)
export function lineBlocked(ax, az, bx, bz, pad = 0.15) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
  for (const o of OBSTACLES) {
    const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / len2));
    const cx = ax + dx * t - o.x, cz = az + dz * t - o.z, R = o.r + pad;
    if (cx * cx + cz * cz < R * R) return true;
  }
  return false;
}

// How many stones a hit at this speed knocks off (1..7), and the points a rebuild of that many is worth.
export function stonesKnocked(speed) {
  const e = Math.max(0, Math.min(1, (speed - C.BREAK_MIN_V) / (C.BREAK_MAX_V - C.BREAK_MIN_V)));
  return 1 + Math.round(e * 6);
}
export const rebuildPoints = (knocked) => (knocked >= 7 ? 3 : knocked >= 4 ? 2 : 1);
export const DEFEND_POINTS = 2;

// 7 stones, index 0 is the largest (bottom of the stack).
export const STONES = Array.from({ length: 7 }, (_, i) => ({
  hw: 0.34 - i * 0.03,   // half width
  hh: 0.055,             // half height
  mass: 1.3 - i * 0.12,
}));

export function stackY(i) {
  let y = 0;
  for (let k = 0; k < i; k++) y += STONES[k].hh * 2;
  return y + STONES[i].hh;
}

export function clampToField(p) {
  if (p.x > C.FIELD_X) p.x = C.FIELD_X; else if (p.x < -C.FIELD_X) p.x = -C.FIELD_X;
  if (p.z > C.FIELD_Z) p.z = C.FIELD_Z; else if (p.z < -C.FIELD_Z) p.z = -C.FIELD_Z;
}

export function pushOutOfStack(p) {
  const d = Math.hypot(p.x, p.z);
  if (d < C.STACK_BLOCK_R) {
    if (d < 1e-4) { p.z = C.STACK_BLOCK_R; return; }
    const k = C.STACK_BLOCK_R / d;
    p.x *= k; p.z *= k;
  }
}

// The thrower must stay in a small box behind the throw line.
// Line rule: until the ball touches the stack, attackers stay behind the throw line and defenders behind
// the defence line on the far side. side: 'attack' | 'defend'.
export function clampToLine(p, side) {
  if (side === 'attack') { if (p.z < C.THROW_Z) p.z = C.THROW_Z; }
  else if (side === 'defend') { if (p.z > -C.DEF_LINE) p.z = -C.DEF_LINE; }
}

export function clampToThrowZone(p) {
  if (p.x > 3) p.x = 3; else if (p.x < -3) p.x = -3;
  if (p.z < C.THROW_Z) p.z = C.THROW_Z; else if (p.z > C.THROW_Z + 3) p.z = C.THROW_Z + 3;
}

export function aimDir(yaw, pitch) {
  const p = Math.max(-1.3, Math.min(1.3, pitch + 0.08)); // slight built-in lift
  const cp = Math.cos(p);
  return [-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp];
}

// Where the ball leaves the hand. Same formula on host and client so the aim arc is exact.
export function handPos(p) {
  const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  return [p.x - s * 0.4 + c * 0.24, p.y + 1.3, p.z - c * 0.4 - s * 0.24];
}

// Moves a human-controlled player. mx = strafe right, my = forward, both -1..1.
// opts: { mult, frozen, zone } ; mutates p {x,y,z,vy,yaw,mv}
export function stepLocal(p, mx, my, jump, dt, opts) {
  let len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; len = 1; }
  if (opts.frozen) { len = 0; mx = my = 0; jump = false; }
  const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  const sp = C.RUN * (opts.mult || 1);
  p.x += (-s * my + c * mx) * sp * dt;
  p.z += (-c * my - s * mx) * sp * dt;
  if (jump && p.y <= 0.001) p.vy = C.JUMP_V;
  p.vy -= C.PGRAV * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; }
  clampToField(p);
  pushOutOfStack(p);
  pushOutOfObstacles(p);
  if (opts.zone) clampToThrowZone(p);
  if (opts.line) clampToLine(p, opts.line);
  p.mv = len;
}

export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
