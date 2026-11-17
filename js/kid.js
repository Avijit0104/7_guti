// Village children: rigged, skinned characters generated in code.
// Each kid is ONE SkinnedMesh (one draw call) on an 18-bone skeleton. Limbs bend smoothly at the knees,
// elbows, hips and waist because the vertices near each joint are shared between the two bones.
// Ten outfits modelled on the reference sheet in references/: tees, a basketball tank, a polo with
// trousers, shorts of different lengths, a sundress, caps, a bucket hat, pigtails, a ponytail...
// Facing direction is -Z (the game's convention). Animation is driven in code (idle, run, jump,
// carry, hold / throw the ball, fall), the same poses the earlier figures used.
import * as THREE from '../vendor/three.module.min.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { makeLabel } from './character.js';
import { addTeamGlow, makeGroundGlow } from './glow.js';

// ---------- skeleton (bind pose, metres, for a 1.40 m child; each kid is scaled to its own height) ----------
const B = { ROOT: 0, HIPS: 1, SPINE: 2, CHEST: 3, NECK: 4, HEAD: 5, SHL: 6, ELL: 7, WRL: 8, SHR: 9, ELR: 10, WRR: 11, THL: 12, KNL: 13, ANL: 14, THR: 15, KNR: 16, ANR: 17 };
const SHX = 0.172, LEGX = 0.068;
const Y = { HIP: 0.72, SPINE: 0.82, CHEST: 0.98, NECK: 1.13, HEAD: 1.18, SH: 1.1, EL: 0.89, WR: 0.71, TH: 0.68, KN: 0.37, AN: 0.065 };
// [parent, x, y, z] in absolute bind-pose coordinates
const BONES = [
  [-1, 0, 0, 0], [B.ROOT, 0, Y.HIP, 0], [B.HIPS, 0, Y.SPINE, 0], [B.SPINE, 0, Y.CHEST, 0], [B.CHEST, 0, Y.NECK, 0], [B.NECK, 0, Y.HEAD, 0],
  [B.CHEST, -SHX, Y.SH, 0], [B.SHL, -SHX, Y.EL, 0], [B.ELL, -SHX, Y.WR, 0],
  [B.CHEST, SHX, Y.SH, 0], [B.SHR, SHX, Y.EL, 0], [B.ELR, SHX, Y.WR, 0],
  [B.HIPS, -LEGX, Y.TH, 0], [B.THL, -LEGX, Y.KN, 0], [B.KNL, -LEGX, Y.AN, 0],
  [B.HIPS, LEGX, Y.TH, 0], [B.THR, LEGX, Y.KN, 0], [B.KNR, LEGX, Y.AN, 0],
];

// ---------- the cast (modelled on the ten children in references/child models.webp) ----------
// Darker than they look on paper: the scene's strong sun and tone mapping lighten everything.
const SKIN = { light: 0xb98560, tan: 0x9e6844, brown: 0x84553a, deep: 0x66402a, dark: 0x4a2e1e };
const OUTFITS = [
  { h: 1.3, skin: SKIN.tan, hair: ['short', 0x3a2618], hat: ['bucket', 0x8d8f86], top: ['tee', 0xe2622e, 'short'], graphic: 0x2d5fa8, bottom: ['knee', 0xd8cdb4], shoes: ['sneaker', 0x2e2e2e] },
  { h: 1.4, skin: SKIN.brown, hair: ['short', 0x2a1a10], top: ['tank', 0xc8322b], number: 0xffffff, bottom: ['short', 0x1f1f24], trim: 0x2f6fd0, shoes: ['sneaker', 0x3a3d48], socks: true },
  { h: 1.43, skin: SKIN.dark, hair: ['buzz', 0x120c08], top: ['tee', 0x7fb4e0, 'short'], vest: 0x9fd0ee, bottom: ['knee', 0xcdb894], shoes: ['sneaker', 0xf2f2f2], socks: true },
  { h: 1.36, skin: SKIN.light, hair: ['spiky', 0x6b4a2a], top: ['tank', 0xf1efe8], graphic: 0xd08a3a, bottom: ['short', 0x34465f], shoes: ['sandal', 0x5a4636] },
  { h: 1.46, skin: SKIN.tan, hair: ['short', 0x4a2e1a], top: ['polo', 0x1d2747, 'short'], stripes: [[0.99, 1.02, 0xf2f2f2], [1.02, 1.04, 0xc0392b]], bottom: ['long', 0xc9b591], shoes: ['shoe', 0x3b2a20] },
  { h: 1.32, skin: SKIN.deep, hair: ['puffs', 0x120c08], top: ['tee', 0xe85d9a, 'short'], bottom: ['capri', 0x3f5f8f], shoes: ['sneaker', 0xf2f2f2], girl: true },
  { h: 1.38, skin: SKIN.light, hair: ['bob', 0x7a5232], top: ['tee', 0x5fb35c, 'short'], graphic: 0xe9d76a, bottom: ['short', 0x232327], shoes: ['sneaker', 0x2e2e2e], girl: true },
  { h: 1.34, skin: SKIN.tan, hair: ['long', 0xc9a066], hat: ['bucket', 0xe36aa0], dress: [0xf3e6c8, 0.47], shoes: ['sandal', 0xb07a50], girl: true },
  { h: 1.42, skin: SKIN.brown, hair: ['ponytail', 0x2a1a10], top: ['cami', 0x8fb6e6], dress: [0xf5f3ee, 0.5], shoes: ['sandal', 0xd8c4a8], girl: true },
  { h: 1.31, skin: SKIN.light, hair: ['bob', 0xb8956a], top: ['cami', 0xd13b3b], stripes: [[0.9, 0.92, 0xf6c1c1], [0.97, 0.99, 0xf6c1c1], [1.04, 1.06, 0xf6c1c1]], bottom: ['short', 0xf0e8de], shoes: ['sandal', 0xf2f2f2], girl: true },
];

// ---------- geometry helpers ----------
const col = new THREE.Color();
const V2 = (r, y) => new THREE.Vector2(Math.max(0, r), y);

// One body part: geometry + colour + which bone moves it. `near` lists neighbouring bones and the height of
// the joint with them; vertices close to that joint are shared between the two bones so the bend is smooth.
function part(list, geo, color, bone, near = [], band = 0.05, side = null) {
  if (geo.index === null) geo = geo; // all primitives used here are indexed
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position, n = pos.count;
  const cols = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const c = typeof color === 'function' ? color(x, y, z) : color;
    col.setHex(c);
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
    const ws = [];
    for (const [b, yj, dir, bd = band] of near) ws.push([b, Math.max(0, Math.min(1, 0.5 + dir * (y - yj) / (2 * bd)))]);
    if (side) { // skirts: the lower hem follows the leg on its side a little
      const w = Math.max(0, Math.min(0.55, (side.y0 - y) / side.span * 0.55));
      ws.push([x < 0 ? side.l : side.r, w]);
    }
    let sum = 0;
    for (const w of ws) sum += w[1];
    if (sum > 1) { for (const w of ws) w[1] /= sum; sum = 1; }
    si[i * 4] = bone; sw[i * 4] = 1 - sum;
    for (let k = 0; k < ws.length && k < 3; k++) { si[i * 4 + 1 + k] = ws[k][0]; sw[i * 4 + 1 + k] = ws[k][1]; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  list.push(geo);
}

function sphere(rx, ry, rz, x, y, z, w = 12, h = 9) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz); g.translate(x, y, z);
  return g;
}
function box(sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
// A rounded, tapered tube standing on the Y axis from yBot to yTop, moved to (x, z).
function limb(yTop, yBot, rTop, rBot, x, z = 0, seg = 10, rows = 6, round = true) {
  const p = [];
  if (round) p.push(V2(0, yBot - rBot * 0.85), V2(rBot * 0.62, yBot - rBot * 0.7), V2(rBot * 0.93, yBot - rBot * 0.3));
  else p.push(V2(rBot - 0.008, yBot + 0.002));
  for (let i = 0; i <= rows; i++) { const t = i / rows; p.push(V2(rBot + (rTop - rBot) * t, yBot + (yTop - yBot) * t)); }
  if (round) p.push(V2(rTop * 0.93, yTop + rTop * 0.3), V2(rTop * 0.62, yTop + rTop * 0.7), V2(0, yTop + rTop * 0.85));
  else p.push(V2(rTop * 0.75, yTop + 0.012));
  const g = new THREE.LatheGeometry(p, seg);
  g.translate(x, 0, z);
  return g;
}
// The torso: a lathe from crotch to neck, flattened front-to-back. Extra rows sit right at colour edges
// (waistband, necklines, stripes) so the vertex colours change sharply there.
function torso(edges) {
  const prof = [[0, 0.6], [0.08, 0.607], [0.12, 0.635], [0.138, 0.68], [0.144, 0.74], [0.138, 0.8], [0.134, 0.86], [0.14, 0.92], [0.152, 0.98], [0.16, 1.04], [0.156, 1.08], [0.132, 1.11], [0.078, 1.135], [0, 1.142]];
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const a = prof[i - 1], b = prof[i]; return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); }
    return 0;
  };
  const ys = new Set(prof.map((p) => p[1]));
  for (const e of edges) { ys.add(+(e - 0.0015).toFixed(4)); ys.add(+(e + 0.0015).toFixed(4)); }
  const pts = [...ys].sort((a, b) => a - b).map((y) => V2(rAt(y), y));
  const g = new THREE.LatheGeometry(pts, 16);
  g.scale(1, 1, 0.74);
  return g;
}
// Part of a cylinder (open at the front): bobs, long hair.
function shell(r0, r1, y0, y1, gap, z = 0.012) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 16, 3, true, Math.PI + gap, Math.PI * 2 - gap * 2);
  g.translate(0, (y0 + y1) / 2, z);
  return g;
}

function buildKid(o) {
  const L = [];
  const skin = o.skin, top = o.top || ['tee', 0xffffff, 'short'], dress = o.dress;
  const topCol = dress && !o.top ? dress[0] : top[1];
  const botCol = o.bottom ? o.bottom[1] : dress ? dress[0] : 0x333333;
  const lips = 0x9a4f45, dark = 0x2a1d16, white = 0xf4f1ea;

  // ---- torso: bottoms below the waistband, top above, skin at the neckline for tanks / camis
  const neckLine = top[0] === 'tank' ? 1.075 : top[0] === 'cami' ? 1.06 : 1.115;
  const stripes = o.stripes || [];
  const edges = [0.8, neckLine, ...stripes.flatMap((s) => [s[0], s[1]])];
  part(L, torso(edges), (x, y, z) => {
    if (y > neckLine) return skin;
    for (const s of stripes) if (y > s[0] && y < s[1]) return s[2];
    if (o.vest && y > 0.8 && z < -0.03 && Math.abs(x) > 0.035 && Math.abs(x) < 0.12) return o.vest;
    return y < 0.8 ? botCol : topCol;
  }, B.SPINE, [[B.HIPS, Y.SPINE, -1, 0.07], [B.CHEST, Y.CHEST, 1, 0.07]]);
  // print on the chest: sits just on the shirt's front surface
  if (o.graphic) part(L, sphere(0.06, 0.05, 0.012, 0.0, 0.96, -0.112, 12, 6), o.graphic, B.CHEST);
  if (o.number) {
    // a jersey number '25' made of bars
    const z = -0.113, bar = (w, h, x, y) => part(L, box(w, h, 0.006, x, y, z), o.number, B.CHEST);
    bar(0.04, 0.009, -0.03, 1.0); bar(0.009, 0.025, -0.014, 0.984); bar(0.04, 0.009, -0.03, 0.968); bar(0.009, 0.025, -0.046, 0.952); bar(0.04, 0.009, -0.03, 0.936);
    bar(0.04, 0.009, 0.03, 1.0); bar(0.009, 0.025, 0.014, 0.984); bar(0.04, 0.009, 0.03, 0.968); bar(0.009, 0.025, 0.046, 0.952); bar(0.04, 0.009, 0.03, 0.936);
  }
  if (top[0] === 'polo') { // collar
    const c = new THREE.TorusGeometry(0.058, 0.014, 6, 14); c.rotateX(Math.PI / 2); c.scale(1, 1, 0.85); c.translate(0, 1.12, 0);
    part(L, c, topCol, B.CHEST);
  }
  if (top[0] === 'cami') for (const sx of [-1, 1]) part(L, box(0.012, 0.03, 0.15, sx * 0.09, 1.1, 0), topCol, B.CHEST); // thin straps

  // ---- neck and head
  part(L, limb(1.2, 1.09, 0.04, 0.043, 0), skin, B.NECK, [[B.CHEST, Y.NECK, -1, 0.03]]);
  part(L, sphere(0.098, 0.113, 0.104, 0, 1.275, 0.004, 16, 12), skin, B.HEAD);
  part(L, sphere(0.064, 0.055, 0.064, 0, 1.22, -0.014, 12, 8), skin, B.HEAD); // jaw
  for (const sx of [-1, 1]) {
    part(L, sphere(0.017, 0.029, 0.021, sx * 0.097, 1.268, 0.012, 8, 6), skin, B.HEAD); // ears
    part(L, sphere(0.02, 0.014, 0.009, sx * 0.036, 1.287, -0.093, 10, 6), white, B.HEAD); // eyes
    part(L, sphere(0.0105, 0.0115, 0.005, sx * 0.036, 1.287, -0.1, 8, 6), dark, B.HEAD);
    part(L, box(0.032, 0.007, 0.008, sx * 0.037, 1.311, -0.095), o.hair[1], B.HEAD); // brows
  }
  part(L, sphere(0.011, 0.017, 0.013, 0, 1.262, -0.104, 8, 6), skin, B.HEAD); // nose
  part(L, sphere(0.023, 0.006, 0.006, 0, 1.226, -0.093, 10, 4), lips, B.HEAD); // mouth

  // ---- hair
  const [hs, hc] = o.hair;
  const cap = (s = 1) => { const g = new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56); g.scale(0.106 * s, 0.103 * s, 0.112 * s); g.rotateX(0.32); g.translate(0, 1.282, 0.006); return g; };
  part(L, cap(hs === 'buzz' ? 0.975 : 1), hc, B.HEAD);
  if (hs === 'short' || hs === 'spiky') part(L, sphere(0.07, 0.022, 0.03, 0, 1.338, -0.082, 10, 6), hc, B.HEAD); // fringe
  if (hs === 'spiky') for (let k = 0; k < 6; k++) {
    const g = new THREE.ConeGeometry(0.026, 0.06, 5); g.rotateX(-0.3 + (k % 3) * 0.3); g.rotateZ((k < 3 ? -1 : 1) * 0.35); g.translate((k < 3 ? -1 : 1) * 0.035, 1.39, -0.04 + (k % 3) * 0.045);
    part(L, g, hc, B.HEAD);
  }
  if (hs === 'bob') part(L, shell(0.117, 0.112, 1.205, 1.32, 0.95), hc, B.HEAD);
  if (hs === 'long') part(L, shell(0.12, 0.112, 1.03, 1.32, 0.9, 0.02), hc, B.HEAD);
  if (hs === 'ponytail') {
    part(L, sphere(0.032, 0.03, 0.03, 0, 1.31, 0.112, 8, 6), hc, B.HEAD);
    const g = new THREE.SphereGeometry(1, 10, 8); g.scale(0.036, 0.11, 0.034); g.rotateX(0.35); g.translate(0, 1.21, 0.14);
    part(L, g, hc, B.HEAD);
  }
  if (hs === 'puffs') for (const sx of [-1, 1]) part(L, sphere(0.047, 0.045, 0.045, sx * 0.088, 1.33, 0.035, 10, 8), hc, B.HEAD);

  // ---- hats
  if (o.hat) {
    const [ht, hcol] = o.hat;
    if (ht === 'cap') {
      part(L, sphere(0.109, 0.078, 0.115, 0, 1.31, 0.006, 14, 7), hcol, B.HEAD);
      const brim = new THREE.CylinderGeometry(0.075, 0.075, 0.008, 14); brim.scale(1, 1, 1.25); brim.translate(0, 1.315, -0.1);
      part(L, brim, hcol, B.HEAD);
    } else {
      const crown = new THREE.CylinderGeometry(0.093, 0.114, 0.085, 16, 1); crown.translate(0, 1.345, 0.004);
      part(L, crown, hcol, B.HEAD);
      const brim = new THREE.CylinderGeometry(0.118, 0.175, 0.045, 18, 1, true); brim.translate(0, 1.29, 0.004);
      part(L, brim, hcol, B.HEAD);
    }
  }

  // ---- arms: skin, then sleeves over the top
  const sleeve = top[0] === 'tank' || top[0] === 'cami' || (dress && !o.top) ? null : top[2];
  for (const [sx, SH, EL, WR] of [[-1, B.SHL, B.ELL, B.WRL], [1, B.SHR, B.ELR, B.WRR]]) {
    const x = sx * SHX;
    part(L, limb(Y.SH + 0.01, Y.EL, 0.05, 0.04, x), skin, SH, [[B.CHEST, Y.SH - 0.02, 1, 0.03], [EL, Y.EL, -1, 0.04]]);
    part(L, limb(Y.EL, Y.WR + 0.01, 0.04, 0.032, x), skin, EL, [[SH, Y.EL, 1, 0.04]]);
    part(L, sphere(0.036, 0.048, 0.03, x, Y.WR - 0.04, -0.004, 10, 8), skin, WR);
    if (sleeve) {
      part(L, limb(Y.SH + 0.02, sleeve === 'long' ? Y.EL : 0.99, 0.059, 0.05, x, 0, 10, 3, false), topCol, SH, [[B.CHEST, Y.SH - 0.02, 1, 0.03], [EL, Y.EL, -1, 0.04]]);
      if (sleeve === 'long') part(L, limb(Y.EL, 0.74, 0.054, 0.045, x, 0, 10, 3, false), topCol, EL, [[SH, Y.EL, 1, 0.04]]);
    }
  }

  // ---- legs: skin, then shorts / trousers, socks and shoes
  const len = o.bottom ? o.bottom[0] : null;
  for (const [sx, TH, KN, AN] of [[-1, B.THL, B.KNL, B.ANL], [1, B.THR, B.KNR, B.ANR]]) {
    const x = sx * LEGX;
    part(L, limb(Y.TH + 0.03, Y.KN, 0.074, 0.052, x), skin, TH, [[B.HIPS, Y.TH + 0.01, 1, 0.04], [KN, Y.KN, -1, 0.045]]);
    part(L, limb(Y.KN, Y.AN + 0.02, 0.051, 0.035, x), skin, KN, [[TH, Y.KN, 1, 0.045]]);
    if (len) {
      const yb = { short: 0.55, knee: 0.4, capri: Y.KN, long: Y.KN }[len];
      part(L, limb(Y.TH + 0.07, yb, 0.094, len === 'short' ? 0.084 : 0.072, x, 0, 12, 4, false), botCol, TH, [[B.HIPS, Y.TH + 0.01, 1, 0.04], [KN, Y.KN, -1, 0.045]]);
      if (len === 'capri' || len === 'long') part(L, limb(Y.KN, len === 'long' ? 0.085 : 0.22, 0.07, len === 'long' ? 0.056 : 0.06, x, 0, 12, 4, false), botCol, KN, [[TH, Y.KN, 1, 0.045]]);
      if (o.trim) part(L, limb(yb + 0.02, yb, 0.087, 0.086, x, 0, 12, 1, false), o.trim, TH);
    }
    if (o.socks) part(L, limb(0.15, 0.07, 0.041, 0.038, x, 0, 10, 2, false), white, KN);
    const [st, sc] = o.shoes;
    if (st === 'sandal') {
      part(L, sphere(0.038, 0.026, 0.085, x, 0.035, -0.032, 10, 7), skin, AN);
      part(L, box(0.075, 0.016, 0.19, x, 0.008, -0.03), sc, AN);
      part(L, box(0.07, 0.012, 0.018, x, 0.045, -0.06), sc, AN);
    } else {
      part(L, sphere(0.047, 0.042, 0.1, x, 0.045, -0.035, 12, 8), sc, AN);
      part(L, box(0.092, 0.02, 0.2, x, 0.01, -0.035), st === 'sneaker' ? white : 0x2a1f18, AN);
    }
  }

  // ---- dress / skirt: hangs from the hips; the hem follows each leg a little so it does not cut through
  if (dress) {
    const [dc, hemY] = dress;
    const g = new THREE.CylinderGeometry(0.135, 0.215, 0.8 - hemY, 18, 5, true);
    g.scale(1, 1, 0.82); g.translate(0, (0.8 + hemY) / 2, 0);
    part(L, g, dc, B.HIPS, [[B.SPINE, 0.8, 1, 0.03]], 0.05, { y0: 0.72, span: 0.72 - hemY, l: B.THL, r: B.THR });
  }

  const geo = mergeGeometries(L, false);
  geo.computeBoundingSphere();
  return geo;
}

// ---------- shared resources ----------
const geoCache = new Map();
const matCache = new Map();
function kidGeometry(i) {
  if (!geoCache.has(i)) geoCache.set(i, buildKid(OUTFITS[i]));
  return geoCache.get(i);
}
function teamMaterial(color) {
  if (!matCache.has(color)) matCache.set(color, addTeamGlow(new THREE.MeshLambertMaterial({ vertexColors: true }), color));
  return matCache.get(color);
}
export const KID_COUNT = OUTFITS.length;

const damp = (cur, target, k) => cur + (target - cur) * k;

export class Kid {
  constructor({ id = 0, shirt = 0xe2483d, name = '', labelCss = '#fff' }) {
    const oi = id % OUTFITS.length, o = OUTFITS[oi];
    this.group = new THREE.Group();
    const scale = this.scale = o.h / 1.4;

    const bones = BONES.map(([, x, y, z]) => { const b = new THREE.Bone(); b.userData.abs = [x, y, z]; return b; });
    BONES.forEach(([p], i) => {
      const a = bones[i].userData.abs;
      if (p < 0) bones[i].position.set(a[0], a[1], a[2]);
      else { const pa = bones[p].userData.abs; bones[i].position.set(a[0] - pa[0], a[1] - pa[1], a[2] - pa[2]); bones[p].add(bones[i]); }
    });
    const mesh = this.mesh = new THREE.SkinnedMesh(kidGeometry(oi), teamMaterial(shirt));
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.scale.setScalar(scale);
    this.group.add(mesh);
    this.bones = bones;
    this.hand = new THREE.Object3D();
    this.hand.position.set(0, -0.06, -0.01);
    bones[B.WRR].add(this.hand);

    this.glow = makeGroundGlow(shirt, 1.45);
    this.group.add(this.glow);
    this.label = makeLabel(name, labelCss);
    this.label.position.y = o.h + 0.32;
    this.group.add(this.label);

    this.phase = id * 1.7;
    this.t = id;
    this.throwT = 9;
    this.lastThr = -1;
    this.fall = 0;
    this.deadT = 0;
    this.carryY = 0.8 * scale; this.carryF = 0.33; // where a carried stone sits
  }

  handWorld(out) { return this.hand.getWorldPosition(out); }

  // s: { mv 0..1, air, carry, ball, alive, thr counter, pitch }
  update(dt, s) {
    const bn = this.bones;
    this.t += dt;
    const k = 1 - Math.exp(-14 * dt);
    if (this.lastThr < 0) this.lastThr = s.thr;
    if (s.thr !== this.lastThr) { this.lastThr = s.thr; this.throwT = 0; }
    this.throwT += dt;

    if (!s.alive) {
      this.deadT += dt;
      this.fall = Math.min(1, this.fall + dt * 2.6);
      const e = this.fall * this.fall * (3 - 2 * this.fall);
      bn[B.ROOT].rotation.x = e * 1.5;
      bn[B.ROOT].position.y = e * 0.1;
      this._pose(k, 0.5, 0.4, -0.5, -0.3, -0.4, 0.3, 0.3, 0.5, 0, 0, 0.35, 0.35);
      this.group.visible = this.deadT < 3;
      this.label.visible = this.glow.visible = false;
      return;
    }
    if (this.fall > 0) { this.fall = 0; this.deadT = 0; bn[B.ROOT].rotation.x = 0; this.label.visible = this.glow.visible = true; }
    this.group.visible = true;

    const mv = s.mv;
    this.phase += dt * (3.8 + 10 * mv);
    const ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph);
    const br = Math.sin(this.t * 1.6) * 0.03;

    let hipL = sw * 0.9 * mv, hipR = -sw * 0.9 * mv;
    let kneeL = -(0.15 + 1.1 * Math.max(0, cw)) * mv, kneeR = -(0.15 + 1.1 * Math.max(0, -cw)) * mv;
    let shL = -sw * 0.85 * mv + br, shR = sw * 0.85 * mv - br;
    let elL = 0.15 + 1.15 * mv, elR = 0.15 + 1.15 * mv;
    let lean = -0.16 * mv, twist = sw * 0.16 * mv;
    let spreadL = 0.1, spreadR = 0.1;

    if (s.air) { hipL = 0.6; hipR = 0.2; kneeL = -1.15; kneeR = -0.6; shL = -0.7; shR = -0.5; spreadL = spreadR = 0.55; }
    if (s.carry) { shL = shR = 0.95; elL = elR = 0.65; spreadL = spreadR = -0.06; lean -= 0.04; }
    if (s.ball) { shR = 2.5 + br; elR = 0.6; twist += 0.25; spreadR = 0.18; }

    let kR = k;
    if (this.throwT < 0.42) { // wind back, whip forward, follow through
      const u = this.throwT / 0.42, e = 1 - (1 - u) * (1 - u);
      shR = 3.4 - 3.1 * e; elR = 0.9 - 0.8 * e; twist = 0.5 - 1.0 * e; lean = -0.1 - 0.3 * e;
      kR = 1;
    }

    bn[B.ROOT].position.y = s.air ? 0 : Math.abs(sw) * 0.05 * mv;
    bn[B.ROOT].rotation.x = 0;
    this._pose(k, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, lean, twist, spreadL, spreadR, kR);
    bn[B.HEAD].rotation.x = damp(bn[B.HEAD].rotation.x, (s.pitch || 0) * 0.5 - lean, k);
  }

  _pose(k, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, lean, twist, spreadL, spreadR, kR = k) {
    const bn = this.bones;
    bn[B.THL].rotation.x = damp(bn[B.THL].rotation.x, hipL, k);
    bn[B.THR].rotation.x = damp(bn[B.THR].rotation.x, hipR, k);
    bn[B.KNL].rotation.x = damp(bn[B.KNL].rotation.x, kneeL, k);
    bn[B.KNR].rotation.x = damp(bn[B.KNR].rotation.x, kneeR, k);
    bn[B.SHL].rotation.x = damp(bn[B.SHL].rotation.x, shL, k);
    bn[B.SHR].rotation.x = damp(bn[B.SHR].rotation.x, shR, kR);
    bn[B.SHL].rotation.z = damp(bn[B.SHL].rotation.z, -spreadL, k);
    bn[B.SHR].rotation.z = damp(bn[B.SHR].rotation.z, spreadR, k);
    bn[B.ELL].rotation.x = damp(bn[B.ELL].rotation.x, elL, k);
    bn[B.ELR].rotation.x = damp(bn[B.ELR].rotation.x, elR, kR);
    bn[B.SPINE].rotation.x = damp(bn[B.SPINE].rotation.x, lean * 0.6, k);
    bn[B.CHEST].rotation.x = damp(bn[B.CHEST].rotation.x, lean * 0.4, k);
    bn[B.SPINE].rotation.y = damp(bn[B.SPINE].rotation.y, twist * 0.45, kR);
    bn[B.CHEST].rotation.y = damp(bn[B.CHEST].rotation.y, twist * 0.55, kR);
  }

  dispose() {
    // geometry and the two team materials are shared between kids and kept for reuse
    this.glow.material.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
