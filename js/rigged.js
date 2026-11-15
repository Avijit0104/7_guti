// Rigged, skinned characters (KayKit Adventurers, CC0) with their own animation clips.
// Same interface as the code-built Human in character.js, so the view can use either.
// Lower body (legs, hips) and upper body (spine, arms, head) are animated as separate layers,
// so a player can run while holding the ball, carrying a stone or throwing.
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';
import { makeLabel } from './character.js';

const FILES = ['Rogue', 'Barbarian', 'Knight', 'Mage', 'Rogue_Hooded'];
const CLIPS = { idle: 'Idle', run: 'Running_A', jump: 'Jump_Idle', death: 'Death_A', throw: 'Throw', carry: '2H_Melee_Idle' };
const LOWER = /^(root|hips|upperleg|lowerleg|foot|toes|knee|heel|IK-|control-)/;
const HEIGHT = 1.75;      // metres, same as the collision size used by the game
const THROW_START = 0.35; // skip the wind-up: in the game the ball leaves the hand right away
const THROW_SPEED = 1.5;

let library = null;       // [{ scene, clips: { idle: {L, U}, ... }, scale }]

function split(clip) {
  const L = [], U = [];
  for (const t of clip.tracks) (LOWER.test(t.name.split('.')[0]) ? L : U).push(t);
  return { L: new THREE.AnimationClip(clip.name + '_L', clip.duration, L), U: new THREE.AnimationClip(clip.name + '_U', clip.duration, U) };
}

// Loads every model. Resolves to true when all of them are ready, false if any failed
// (the game then simply keeps the code-built figures).
export function loadRiggedModels(base = 'models/') {
  const loader = new GLTFLoader();
  return Promise.all(FILES.map((f) => loader.loadAsync(base + f + '.glb').then((g) => {
    const clips = {};
    for (const key in CLIPS) {
      const c = THREE.AnimationClip.findByName(g.animations, CLIPS[key]);
      if (!c) throw new Error('missing clip ' + CLIPS[key] + ' in ' + f);
      clips[key] = split(c);
    }
    const box = new THREE.Box3();
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      // hide the weapons and shields that sit in the hand slots
      if (o.parent && /^handslot/.test(o.parent.name)) { o.visible = false; return; }
      if (o.isSkinnedMesh) box.expandByObject(o);
    });
    const h = box.max.y - box.min.y;
    return { scene: g.scene, clips, scale: h > 0.5 ? HEIGHT / h : 0.8 };
  }))).then((list) => { library = list; return true; }).catch((err) => { console.warn('Rigged models unavailable, using built-in figures:', err.message); return false; });
}

export const riggedReady = () => !!library;

export class RigHuman {
  constructor({ id = 0, shirt = 0xe2483d, name = '', labelCss = '#fff' }) {
    const src = library[id % library.length];
    this.group = new THREE.Group();
    const model = this.model = cloneSkinned(src.scene);
    model.scale.setScalar(src.scale);
    model.rotation.y = Math.PI; // the pack faces +Z, the game faces -Z
    this.group.add(model);

    // team colour: tint the outfit and put a ring at the feet
    const team = new THREE.Color(shirt);
    this.mats = [];
    const seen = new Map();
    model.traverse((o) => {
      if (o.name === 'handslotr' || o.name === 'handslot.r') this.hand = o; // the loader strips dots from bone names
      if (!o.isMesh) return;
      if (!seen.has(o.material)) {
        const m = o.material.clone();
        m.color.set(0xffffff).lerp(team, 0.22);
        if ('metalness' in m) { m.metalness = 0; m.roughness = 0.85; }
        seen.set(o.material, m); this.mats.push(m);
      }
      o.material = seen.get(o.material);
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: shirt, transparent: true, opacity: 0.8, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 24), ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.035;
    this.group.add(this.ring);
    this.mats.push(ringMat);

    this.label = makeLabel(name, labelCss);
    this.label.position.y = 2.05;
    this.group.add(this.label);

    // every clip plays all the time; we only move the weights
    const mixer = this.mixer = new THREE.AnimationMixer(model);
    this.act = {};
    for (const key in src.clips) {
      const L = mixer.clipAction(src.clips[key].L), U = mixer.clipAction(src.clips[key].U);
      for (const a of [L, U]) {
        if (key === 'death' || key === 'throw') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        a.play(); a.setEffectiveWeight(0);
      }
      this.act[key] = { L, U, wL: 0, wU: 0 };
    }
    this.act.idle.wL = this.act.idle.wU = 1;
    this.act.run.L.time = this.act.run.U.time = (id * 0.23) % 0.8; // not everyone in step
    this.throwDur = (src.clips.throw.U.duration - THROW_START) / THROW_SPEED;
    this.throwT = 9; this.lastThr = -1; this.dead = false; this.deadT = 0;
    this.carryY = 0.8; this.carryF = 0.5; // where a carried stone sits (these figures have big heads)
  }

  handWorld(out) { return this.hand ? this.hand.getWorldPosition(out) : out.copy(this.group.position).setY(this.group.position.y + 1.4); }

  // s: { mv 0..1, air, carry, ball, alive, thr, pitch }
  update(dt, s) {
    const A = this.act;
    if (this.lastThr < 0) this.lastThr = s.thr;
    if (s.thr !== this.lastThr) {
      this.lastThr = s.thr; this.throwT = 0;
      A.throw.U.reset(); A.throw.U.time = THROW_START; A.throw.U.play();
    }
    this.throwT += dt;

    if (!s.alive) {
      if (!this.dead) {
        this.dead = true; this.deadT = 0;
        for (const p of ['L', 'U']) { A.death[p].reset(); A.death[p].play(); }
      }
      this.deadT += dt;
      for (const k in A) { const w = k === 'death' ? 1 : 0; A[k].L.setEffectiveWeight(w); A[k].U.setEffectiveWeight(w); A[k].wL = A[k].wU = w; }
      this.mixer.update(dt);
      this.group.visible = this.deadT < 3;
      this.label.visible = this.ring.visible = false;
      return;
    }
    if (this.dead) { this.dead = false; this.ring.visible = true; A.idle.wL = A.idle.wU = 1; }
    this.group.visible = true;

    const k = 1 - Math.exp(-12 * dt);
    const loco = s.air ? 'jump' : s.mv > 0.1 ? 'run' : 'idle';
    // Holding the ball = the throw clip frozen at its wind-up, so the throw continues straight from that pose.
    const throwing = this.throwT < this.throwDur;
    const over = throwing || s.ball ? 'throw' : s.carry ? 'carry' : null;
    if (throwing) A.throw.U.setEffectiveTimeScale(THROW_SPEED);
    else { A.throw.U.paused = false; A.throw.U.time = THROW_START; A.throw.U.setEffectiveTimeScale(0); }
    for (const key in A) {
      const a = A[key];
      const tL = key === loco ? 1 : 0;
      const tU = over ? (key === over ? 1 : 0) : tL;
      a.wL += (tL - a.wL) * k;
      a.wU += (tU - a.wU) * (key === 'throw' || over === 'throw' ? Math.min(1, k * 2.5) : k);
      a.L.setEffectiveWeight(a.wL); a.U.setEffectiveWeight(a.wU);
    }
    const rate = 0.55 + 0.6 * s.mv;
    A.run.L.setEffectiveTimeScale(rate); A.run.U.setEffectiveTimeScale(rate);
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
    this.ring.geometry.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
