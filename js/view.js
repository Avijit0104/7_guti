// Draws the game state: players, ball, stones, markers, effects, and drives the camera (TPP / FPP).
// It only reads snapshots; it never changes the game.
import * as THREE from '../vendor/three.module.min.js';
import { C, STONES, TEAMS, handPos } from './config.js';
import { Human } from './character.js';
import { RigHuman, riggedReady } from './rigged.js';
import { Kid } from './kid.js';
import { Person, peopleReady } from './person.js';
import { CAST } from './cast.js';

// Which characters to draw: the village kids (default), ?chars=kaykit for the KayKit models, ?chars=simple for the first figures.
const CHARS = new URLSearchParams(location.search).get('chars') || 'kids';

function callMarker() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffe066'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6;
  g.beginPath(); g.arc(64, 56, 44, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(48, 96); g.lineTo(64, 122); g.lineTo(80, 96); g.closePath(); g.fill();
  g.fillStyle = '#2a1c06'; g.font = '900 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PASS', 64, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.7, 0.7, 1); s.renderOrder = 5; s.visible = false;
  return s;
}

// snapshot player array indexes
export const P = { ID: 0, TEAM: 1, X: 2, Y: 3, Z: 4, YAW: 5, PITCH: 6, MV: 7, FLAGS: 8, CARRY: 9, THR: 10, TP: 11, NAME: 12, CHAR: 13 };

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function rockGeometry(hw, hh, seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const bump = new Map(); // same offset for duplicated vertices so the rock has no cracks
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!bump.has(key)) bump.set(key, 0.9 + rnd() * 0.2);
    const k = bump.get(key);
    // squash into a flat pebble with a fairly flat top and bottom
    const y = Math.sign(p.getY(i)) * Math.pow(Math.abs(p.getY(i)), 0.55);
    p.setXYZ(i, p.getX(i) * hw * 1.06 * k, y * hh * 1.12, p.getZ(i) * hw * 0.96 * k);
  }
  g.computeVertexNormals();
  return g;
}

export class View {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.chars = new Map();
    this.A = null; this.B = null; this.direct = true;
    this.shake = 0;
    this.disp = new Map(); // id -> displayed {x,y,z,yaw}
    this.markers = new Map(); // id -> 'PASS' sprite
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();

    // ball
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0xd9f04a, roughness: 0.75, emissive: 0xff3b1f, emissiveIntensity: 0 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(C.BALL_R, 16, 12), this.ballMat);
    this.ball.castShadow = true;
    scene.add(this.ball);

    // stones
    const tones = [0x8c8a84, 0x9a8f80, 0x7d7f84, 0xa39a8c, 0x86807a, 0x9c9690, 0x777a7c];
    this.stones = STONES.map((s, i) => {
      const m = new THREE.Mesh(rockGeometry(s.hw, s.hh, i + 3), new THREE.MeshStandardMaterial({ color: tones[i], roughness: 0.95, flatShading: true }));
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      return m;
    });

    // base ring + "next stone" arrow
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(C.BASE_R - 0.12, C.BASE_R, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.04;
    scene.add(this.ring);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.arrow.rotation.x = Math.PI;
    scene.add(this.arrow);
    // ring under the current thrower
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.turnRing.rotation.x = -Math.PI / 2;
    scene.add(this.turnRing);

    // aim arc
    this.arcN = 7; // only the first part of the flight is shown: the rest is the thrower's judgement
    this.arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), this.arcN);
    this.arc.frustumCulled = false; this.arc.visible = false;
    scene.add(this.arc);
    this.land = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.land.rotation.x = -Math.PI / 2; this.land.visible = false;
    scene.add(this.land);
    this._m = new THREE.Matrix4();

    // dust particles
    const N = this.pN = 160;
    this.pPos = new Float32Array(N * 3); this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N);
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -50;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd8c09a, size: 0.42, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }));
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.pNext = 0;
  }

  push(snap, direct) {
    this.direct = direct;
    if (this.B && snap.n <= this.B.n && !direct) return; // old packet
    snap.rt = performance.now();
    this.A = this.B || snap;
    this.B = snap;
  }

  burst(x, y, z, n, speed) {
    for (let i = 0; i < n; i++) {
      const k = this.pNext = (this.pNext + 1) % this.pN;
      const a = Math.random() * 6.283, s = speed * (0.3 + Math.random() * 0.7);
      this.pPos[k * 3] = x; this.pPos[k * 3 + 1] = y; this.pPos[k * 3 + 2] = z;
      this.pVel[k * 3] = Math.cos(a) * s; this.pVel[k * 3 + 1] = 0.6 + Math.random() * speed * 0.6; this.pVel[k * 3 + 2] = Math.sin(a) * s;
      this.pLife[k] = 0.6 + Math.random() * 0.6;
    }
  }

  onEvent(e) {
    if (e.k === 'scatter') { this.burst(0, 0.4, 0, 46, 4.2); this.shake = 0.35; }
    else if (e.k === 'out') { const d = this.disp.get(e.id); if (d) this.burst(d.x, d.y + 1, d.z, 22, 2.4); }
    else if (e.k === 'place') { this.burst(0, 0.3, 0, 10, 1.4); }
  }

  // Throw away the current figures so they are rebuilt (used when the rigged models finish loading).
  rebuildCharacters() {
    for (const c of this.chars.values()) { this.scene.remove(c.h.group); c.h.dispose(); }
    this.chars.clear();
  }

  _char(row) {
    const id = row[P.ID];
    let c = this.chars.get(id);
    if (c && (c.name !== row[P.NAME] || c.team !== row[P.TEAM] || c.char !== row[P.CHAR])) { this.scene.remove(c.h.group); c.h.dispose(); c = null; }
    if (!c) {
      const team = TEAMS[row[P.TEAM]];
      // the human models once they have loaded; until then the code-built figure of the same outfit
      const ci = row[P.CHAR] ?? -1;
      let h;
      const opts = { id, shirt: team.color, name: row[P.NAME], labelCss: team.css };
      if (CHARS === 'kaykit') h = new (riggedReady() ? RigHuman : Human)(opts);
      else if (CHARS === 'simple') h = new Human(opts);
      else if (peopleReady()) h = new Person({ ...opts, outfit: ci });
      else h = new Kid({ ...opts, outfit: ci >= 0 ? CAST[ci % CAST.length].kid : -1 });
      this.scene.add(h.group);
      c = { h, name: row[P.NAME], team: row[P.TEAM], char: row[P.CHAR] };
      this.chars.set(id, c);
    }
    return c.h;
  }

  // ctx: { myId, me, fpp, aiming, charge, time }
  update(dt, ctx) {
    const A = this.A, B = this.B;
    if (!B) return;
    let t = 1;
    if (!this.direct) {
      const span = Math.max(16, B.rt - A.rt);
      t = Math.min(1.3, (performance.now() - B.rt) / span);
    }
    const cam = this.camera;

    // ---- players
    for (let i = 0; i < B.p.length; i++) {
      const b = B.p[i], a = (A.p[i] && A.p[i][P.ID] === b[P.ID] && A.p[i][P.TP] === b[P.TP]) ? A.p[i] : b;
      const id = b[P.ID], h = this._char(b);
      let d = this.disp.get(id);
      if (!d) { d = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0 }; this.disp.set(id, d); }
      const alive = !!(b[P.FLAGS] & 1);
      if (id === ctx.myId && ctx.me && alive) {
        const m = ctx.me;
        d.x = m.x; d.y = m.y; d.z = m.z; d.yaw = m.yaw; d.pitch = m.pitch; d.mv = m.mv;
      } else {
        d.x = lerp(a[P.X], b[P.X], t); d.y = lerp(a[P.Y], b[P.Y], t); d.z = lerp(a[P.Z], b[P.Z], t);
        d.yaw = lerpAngle(a[P.YAW], b[P.YAW], Math.min(1, t)); d.pitch = b[P.PITCH]; d.mv = lerp(a[P.MV], b[P.MV], Math.min(1, t));
      }
      h.group.position.set(d.x, d.y, d.z);
      // ground speed, and the direction actually travelled (players can run sideways or backwards)
      if (d.px !== undefined && dt > 0) {
        const vx = (d.x - d.px) / dt, vz = (d.z - d.pz) / dt, v = Math.hypot(vx, vz);
        if (v > 20) d.sp = 0; // a teleport (new round, own throw turn)
        else { d.sp = lerp(d.sp || 0, v, Math.min(1, dt * 10)); if (v > 0.8) d.moveYaw = Math.atan2(-vx, -vz); }
      }
      d.px = d.x; d.pz = d.z;
      // the body turns to face where it runs, except while holding or throwing the ball (then it faces the aim)
      const aiming = B.b[3] === id || (h.throwT !== undefined && h.throwT < 0.6);
      const faceTo = !aiming && (d.sp || 0) > 1.2 && d.moveYaw !== undefined ? d.moveYaw : d.yaw;
      d.fy = d.fy === undefined ? faceTo : lerpAngle(d.fy, faceTo, Math.min(1, dt * 12));
      h.group.rotation.y = d.fy;
      h.update(dt, { speed: alive ? (d.sp || 0) : 0, mv: d.mv, air: d.y > 0.06, carry: b[P.CARRY] >= 0, ball: B.b[3] === id, alive, thr: b[P.THR], pitch: d.pitch });
      if (id === ctx.myId && ctx.fpp && alive) h.group.visible = false;
      // name tags: not for yourself, and not when someone is right in front of the camera (they would fill the screen)
      h.label.visible = alive && id !== ctx.myId && this.camera.position.distanceToSquared(h.group.position) > 9;
      // 'PASS' bubble over a player who is calling for the ball
      const calling = alive && !!(b[P.FLAGS] & 4);
      let mk = this.markers.get(id);
      if (calling && !mk) { mk = callMarker(); this.scene.add(mk); this.markers.set(id, mk); }
      if (mk) {
        mk.visible = calling && !(id === ctx.myId && ctx.fpp);
        if (mk.visible) mk.position.set(d.x, d.y + 2.05 + Math.sin(ctx.time * 9) * 0.07, d.z);
      }
    }
    for (const [id, c] of this.chars) if (!B.p.some((r) => r[P.ID] === id)) { this.scene.remove(c.h.group); c.h.dispose(); this.chars.delete(id); }

    // ---- camera
    this._camera(dt, ctx, B);

    // ---- ball
    const holder = B.b[3];
    if (holder >= 0 && this.chars.has(holder)) {
      if (holder === ctx.myId && ctx.fpp) {
        this.ball.position.set(0.26, -0.2, -0.55).applyMatrix4(cam.matrixWorld);
      } else {
        const ch = this.chars.get(holder).h;
        ch.group.updateMatrixWorld(true);
        ch.handWorld(this.ball.position);
      }
    } else {
      const a = A.b[3] >= 0 ? B.b : A.b;
      this.ball.position.set(lerp(a[0], B.b[0], t), Math.max(C.BALL_R, lerp(a[1], B.b[1], t)), lerp(a[2], B.b[2], t));
      this.ball.rotation.x += dt * 9; this.ball.rotation.z += dt * 5;
    }
    this.ballMat.emissiveIntensity = B.b[4] ? 0.55 + Math.sin(ctx.time * 20) * 0.25 : 0;

    // ---- stones
    for (let i = 0; i < 7; i++) {
      const b = B.s[i], a = A.s[i], m = this.stones[i];
      if (b[7] === 2) {
        const d = this.disp.get(b[8]);
        if (b[8] === ctx.myId && ctx.fpp) {
          m.position.set(0, -0.34, -0.72).applyMatrix4(cam.matrixWorld);
          m.quaternion.copy(cam.quaternion);
        } else if (d) {
          const ch = this.chars.get(b[8]), cf = ch ? ch.h.carryF : 0.42, cy = ch ? ch.h.carryY : 1.08;
          const fy = d.fy !== undefined ? d.fy : d.yaw;
          m.position.set(d.x - Math.sin(fy) * cf, d.y + cy, d.z - Math.cos(fy) * cf);
          m.rotation.set(0, fy, 0);
        }
      } else if (a[7] === 2 || t >= 1) {
        m.position.set(b[0], b[1], b[2]); m.quaternion.set(b[3], b[4], b[5], b[6]);
      } else {
        m.position.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
        this._q.set(a[3], a[4], a[5], a[6]); this._q2.set(b[3], b[4], b[5], b[6]);
        m.quaternion.slerpQuaternions(this._q, this._q2, Math.min(1, t));
      }
    }

    // ---- markers
    const meRow = B.p.find((r) => r[P.ID] === ctx.myId);
    const iAttack = meRow && meRow[P.TEAM] === B.at;
    const scr = B.ph === 'scramble';
    const next = B.pc < 7 ? B.s[B.pc] : null;
    this.arrow.visible = !!(scr && iAttack && next && next[7] === 1);
    if (this.arrow.visible) {
      const m = this.stones[B.pc];
      this.arrow.position.set(m.position.x, m.position.y + 0.75 + Math.sin(ctx.time * 5) * 0.12, m.position.z);
      this.arrow.rotation.y = ctx.time * 2.5;
    }
    const carryingNext = meRow && meRow[P.CARRY] === B.pc && scr;
    this.ringMat.color.setHex(carryingNext ? 0x6dff7a : 0xffe066);
    this.ringMat.opacity = scr && iAttack ? (carryingNext ? 0.75 + Math.sin(ctx.time * 8) * 0.2 : 0.35) : 0;
    const th = B.ph === 'throw' && B.th >= 0 ? this.disp.get(B.th) : null;
    this.turnRing.visible = !!th && !B.fl;
    if (th) { this.turnRing.position.set(th.x, 0.05, th.z); this.turnRing.scale.setScalar(1 + Math.sin(ctx.time * 5) * 0.08); }

    // ---- aim arc
    this.arc.visible = this.land.visible = false;
    if (ctx.aiming && ctx.me) {
      const hp = handPos(ctx.me), v = ctx.aimVel, step = 1 / 30, dampK = Math.pow(1 - C.BALL_DAMP, step);
      let x = hp[0], y = hp[1], z = hp[2], vx = v[0], vy = v[1], vz = v[2], n = 0;
      for (let i = 0; i < 90 && n < this.arcN; i++) {
        vy -= C.GRAV * step; vx *= dampK; vy *= dampK; vz *= dampK;
        x += vx * step; y += vy * step; z += vz * step;
        if (y < C.BALL_R) break;
        if (i % 2 === 1) { this._m.makeTranslation(x, y, z); this.arc.setMatrixAt(n++, this._m); }
      }
      this.arc.count = n; this.arc.instanceMatrix.needsUpdate = true; this.arc.visible = n > 0;
    }

    // ---- particles
    const pp = this.pPos, pv = this.pVel;
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { pp[i * 3 + 1] = -50; continue; }
      pv[i * 3 + 1] -= 3.5 * dt;
      pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] = Math.max(0.05, pp[i * 3 + 1] + pv[i * 3 + 1] * dt); pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
      pv[i * 3] *= 0.96; pv[i * 3 + 2] *= 0.96;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  _camera(dt, ctx, B) {
    const cam = this.camera;
    let tgt = ctx.me, fpp = ctx.fpp;
    const myRow = B.p.find((r) => r[P.ID] === ctx.myId);
    const dead = !myRow || !(myRow[P.FLAGS] & 1);
    if (dead || !ctx.me) {
      // spectate a living team-mate (or anyone alive)
      const pick = B.p.find((r) => (r[P.FLAGS] & 1) && myRow && r[P.TEAM] === myRow[P.TEAM]) || B.p.find((r) => r[P.FLAGS] & 1) || B.p[0];
      const d = pick && this.disp.get(pick[P.ID]);
      tgt = d ? { x: d.x, y: d.y, z: d.z, yaw: ctx.me ? ctx.me.yaw : d.yaw, pitch: ctx.me ? ctx.me.pitch : -0.2 } : { x: 0, y: 0, z: 8, yaw: 0, pitch: -0.2 };
      fpp = false;
    }
    const sy = Math.sin(tgt.yaw), cy = Math.cos(tgt.yaw), cp = Math.cos(tgt.pitch), sp = Math.sin(tgt.pitch);
    if (fpp) {
      cam.position.set(tgt.x - sy * 0.1, tgt.y + 1.3, tgt.z - cy * 0.1);
    } else {
      const dist = dead ? 5 : 3.5;
      const px = tgt.x, py = tgt.y + 1.32, pz = tgt.z;
      cam.position.set(px + sy * cp * dist + cy * 0.6, Math.max(0.35, py - sp * dist + 0.3), pz + cy * cp * dist - sy * 0.6);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.rotation.set(tgt.pitch, tgt.yaw, 0, 'YXZ');
    const fov = fpp ? 72 : 62;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 8)); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
  }
}
