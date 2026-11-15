// A human figure built from simple shapes, with joints (hips, knees, shoulders, elbows, spine, head)
// animated in code: idle, run, jump, carry a stone, hold / throw the ball, fall when eliminated.
// Facing direction is -Z (same as the camera convention).
import * as THREE from '../vendor/three.module.min.js';

const SKINS = [0x8d5a3b, 0xa56c43, 0xc48a5c, 0x7a4a2e, 0xb97a4e, 0x9b6540];
const HAIRS = [0x15100c, 0x1f1611, 0x0c0c0c, 0x2a1a10];
const SHORTS = [0x2b2f3a, 0x3b3226, 0x26323a, 0x40342c];

const geoCache = new Map();
function capsule(r, len) {
  const key = r + '_' + len;
  if (!geoCache.has(key)) {
    const g = new THREE.CapsuleGeometry(r, len, 3, 8);
    g.translate(0, -len / 2, 0); // hang down from the joint
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}
const SPHERE = new THREE.SphereGeometry(1, 14, 10);
const HAIR_GEO = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const FOOT_GEO = new THREE.BoxGeometry(0.095, 0.06, 0.25);

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function makeLabel(text, css) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, 128, 34);
  g.fillStyle = css;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.5, 0.375, 1);
  sp.position.y = 2.08;
  return sp;
}

const damp = (cur, target, k) => cur + (target - cur) * k;

export class Human {
  constructor({ id = 0, shirt = 0xe2483d, name = '', labelCss = '#fff' }) {
    this.group = new THREE.Group();
    this.body = joint(this.group, 0, 0, 0); // tips over when eliminated
    const skin = new THREE.MeshLambertMaterial({ color: SKINS[id % SKINS.length] });
    const shirtM = new THREE.MeshLambertMaterial({ color: shirt });
    const shortsM = new THREE.MeshLambertMaterial({ color: SHORTS[id % SHORTS.length] });
    const hairM = new THREE.MeshLambertMaterial({ color: HAIRS[id % HAIRS.length] });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1612 });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
    this.mats = [skin, shirtM, shortsM, hairM, dark, white];

    // pelvis + legs
    const pelvis = this.pelvis = joint(this.body, 0, 0.9, 0);
    mesh(SPHERE, shortsM, pelvis, 0, 0.03, 0, 0.175, 0.13, 0.125);
    const leg = (side) => {
      const hip = joint(pelvis, side * 0.092, 0, 0);
      mesh(capsule(0.072, 0.42), skin, hip);
      mesh(capsule(0.086, 0.17), shortsM, hip);
      const knee = joint(hip, 0, -0.42, 0);
      mesh(capsule(0.056, 0.4), skin, knee);
      mesh(FOOT_GEO, dark, knee, 0, -0.43, -0.055);
      return { hip, knee };
    };
    this.legL = leg(-1); this.legR = leg(1);

    // spine, torso, head
    const spine = this.spine = joint(pelvis, 0, 0.06, 0);
    mesh(capsule(0.15, 0.3), shirtM, spine, 0, 0.44, 0, 1.14, 1, 0.74);
    mesh(capsule(0.045, 0.08), skin, spine, 0, 0.6, 0);
    const head = this.head = joint(spine, 0, 0.6, 0);
    mesh(SPHERE, skin, head, 0, 0.085, 0, 0.115, 0.128, 0.122);
    const hair = mesh(HAIR_GEO, hairM, head, 0, 0.092, 0.008, 0.124, 0.135, 0.131);
    hair.rotation.x = 0.28;
    mesh(SPHERE, white, head, -0.043, 0.098, -0.103, 0.022, 0.016, 0.012).castShadow = false;
    mesh(SPHERE, white, head, 0.043, 0.098, -0.103, 0.022, 0.016, 0.012).castShadow = false;
    mesh(SPHERE, dark, head, -0.043, 0.098, -0.112, 0.011, 0.012, 0.006).castShadow = false;
    mesh(SPHERE, dark, head, 0.043, 0.098, -0.112, 0.011, 0.012, 0.006).castShadow = false;
    mesh(SPHERE, skin, head, 0, 0.066, -0.118, 0.016, 0.022, 0.018).castShadow = false; // nose
    mesh(SPHERE, dark, head, 0, 0.028, -0.106, 0.03, 0.006, 0.008).castShadow = false; // mouth
    mesh(SPHERE, skin, head, -0.115, 0.085, 0, 0.018, 0.03, 0.022).castShadow = false; // ears
    mesh(SPHERE, skin, head, 0.115, 0.085, 0, 0.018, 0.03, 0.022).castShadow = false;

    // arms
    const arm = (side) => {
      const sh = joint(spine, side * 0.225, 0.45, 0);
      mesh(capsule(0.046, 0.26), skin, sh);
      mesh(capsule(0.06, 0.11), shirtM, sh);
      const el = joint(sh, 0, -0.26, 0);
      mesh(capsule(0.04, 0.24), skin, el);
      const hand = mesh(SPHERE, skin, el, 0, -0.275, 0, 0.045, 0.055, 0.045);
      return { sh, el, hand };
    };
    this.armL = arm(-1); this.armR = arm(1);

    this.label = makeLabel(name, labelCss);
    this.group.add(this.label);

    this.phase = id * 1.7;
    this.t = id;
    this.throwT = 9;
    this.lastThr = -1;
    this.fall = 0;
    this.deadT = 0;
    this.carryY = 1.08; this.carryF = 0.42; // where a carried stone sits
    this._v = new THREE.Vector3();
  }

  handWorld(out) { return this.armR.hand.getWorldPosition(out); }

  // s: { mv 0..1, air bool, carry bool, ball bool, alive bool, thr counter, pitch }
  update(dt, s) {
    this.t += dt;
    const k = 1 - Math.exp(-14 * dt);
    if (this.lastThr < 0) this.lastThr = s.thr;
    if (s.thr !== this.lastThr) { this.lastThr = s.thr; this.throwT = 0; }
    this.throwT += dt;

    if (!s.alive) {
      this.deadT += dt;
      this.fall = Math.min(1, this.fall + dt * 2.6);
      const e = this.fall * this.fall * (3 - 2 * this.fall);
      this.body.rotation.x = e * 1.5;
      this.body.position.y = e * 0.13;
      this._pose(k, 0.5, 0.4, -0.5, -0.3, -0.4, 0.3, 0.3, 0.5, 0, 0, 0.35, 0.35);
      this.group.visible = this.deadT < 3;
      this.label.visible = false;
      return;
    }
    if (this.fall > 0) { this.fall = 0; this.deadT = 0; this.body.rotation.x = 0; this.label.visible = true; }
    this.group.visible = true;

    const mv = s.mv;
    this.phase += dt * (3.5 + 9.5 * mv);
    const ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph);
    const br = Math.sin(this.t * 1.6) * 0.03;

    let hipL = sw * 0.95 * mv, hipR = -sw * 0.95 * mv;
    let kneeL = -(0.2 + 1.05 * Math.max(0, cw)) * mv, kneeR = -(0.2 + 1.05 * Math.max(0, -cw)) * mv;
    let shL = -sw * 0.9 * mv + br, shR = sw * 0.9 * mv - br;
    let elL = 0.22 + 1.1 * mv, elR = 0.22 + 1.1 * mv;
    let lean = -0.15 * mv, twist = sw * 0.14 * mv;
    let spreadL = 0.06, spreadR = 0.06;

    if (s.air) { hipL = 0.55; hipR = 0.25; kneeL = -1.1; kneeR = -0.7; shL = -0.6; shR = -0.6; spreadL = spreadR = 0.5; }
    if (s.carry) { shL = shR = 0.85; elL = elR = 0.75; spreadL = spreadR = -0.12; lean -= 0.05; }
    if (s.ball) { shR = 2.55 + br; elR = 0.55; twist += 0.25; spreadR = 0.15; }

    let kR = k;
    if (this.throwT < 0.42) { // throw: wind back, whip forward, follow through
      const u = this.throwT / 0.42, e = 1 - (1 - u) * (1 - u);
      shR = 3.5 - 3.2 * e; elR = 0.9 - 0.8 * e; twist = 0.5 - 1.0 * e; lean = -0.1 - 0.3 * e;
      kR = 1;
    }

    this.body.position.y = s.air ? 0 : Math.abs(sw) * 0.055 * mv;
    this.body.rotation.x = 0;
    this._pose(k, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, lean, twist, spreadL, spreadR, kR);
    this.head.rotation.x = damp(this.head.rotation.x, (s.pitch || 0) * 0.5 - lean, k);
  }

  _pose(k, hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, lean, twist, spreadL, spreadR, kR = k) {
    const L = this.legL, R = this.legR, aL = this.armL, aR = this.armR;
    L.hip.rotation.x = damp(L.hip.rotation.x, hipL, k);
    R.hip.rotation.x = damp(R.hip.rotation.x, hipR, k);
    L.knee.rotation.x = damp(L.knee.rotation.x, kneeL, k);
    R.knee.rotation.x = damp(R.knee.rotation.x, kneeR, k);
    aL.sh.rotation.x = damp(aL.sh.rotation.x, shL, k);
    aR.sh.rotation.x = damp(aR.sh.rotation.x, shR, kR);
    aL.sh.rotation.z = damp(aL.sh.rotation.z, -spreadL, k);
    aR.sh.rotation.z = damp(aR.sh.rotation.z, spreadR, k);
    aL.el.rotation.x = damp(aL.el.rotation.x, elL, k);
    aR.el.rotation.x = damp(aR.el.rotation.x, elR, kR);
    this.spine.rotation.x = damp(this.spine.rotation.x, lean, k);
    this.spine.rotation.y = damp(this.spine.rotation.y, twist, kR);
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
