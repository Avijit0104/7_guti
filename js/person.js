// Human characters from models/chars (built by tools/blender/build_characters.py from Quaternius' CC0
// Universal Base Characters, animated with the CC0 Universal Animation Library).
// Same interface as the other character classes (group, label, handWorld, update, dispose, carryY, carryF).
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';
import { makeLabel } from './character.js';
import { addTeamGlow, makeGroundGlow } from './glow.js';
import { CAST } from './cast.js';

const CLIPS = { idle: 'Idle_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', jump: 'Jump_Loop', death: 'Death01', throw: 'Spell_Simple_Shoot',
  carry: 'Push_Loop', ball: 'Idle_Torch_Loop' };
const LOWER = /^(root|pelvis|thigh|calf|foot|ball)/;
const THROW_SPEED = 1.6;
const SKIN_BRIGHT = 1.8; // how much lighter than the raw texture skin is drawn (fair complexions)
const ARM_AXIS = new THREE.Vector3(0, 0, 1); // bone-local axis that swings an upper arm out to the side

let lib = null; // { female: gltf, male: gltf, clips: { key: {L, U, dur} }, heights }

function prepClip(clip) {
  // keep rotations everywhere and the pelvis' movement; drop other bones' positions (body proportions
  // differ slightly between the animation rig and the characters) and all scale tracks
  const tracks = clip.tracks.filter((t) => {
    const [bone, prop] = t.name.split('.');
    if (prop === 'scale') return false;
    if (prop === 'position') return bone === 'pelvis';
    return true;
  });
  const L = [], U = [];
  for (const t of tracks) (LOWER.test(t.name.split('.')[0]) ? L : U).push(t);
  return { L: new THREE.AnimationClip(clip.name + '_L', clip.duration, L), U: new THREE.AnimationClip(clip.name + '_U', clip.duration, U), dur: clip.duration };
}

export function loadPeople(base = 'models/chars/') {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // kanu.glb is Kanu's own reshaped body and outfit (see tools/blender/build_characters.py)
  return Promise.all(['female', 'male', 'kanu', 'anims'].map((f) => loader.loadAsync(base + f + '.glb'))).then(([female, male, kanu, anims]) => {
    const clips = {};
    for (const k in CLIPS) {
      const c = THREE.AnimationClip.findByName(anims.animations, CLIPS[k]);
      if (!c) throw new Error('missing clip ' + CLIPS[k]);
      clips[k] = prepClip(c);
    }
    const heights = {};
    for (const [k, g] of [['female', female], ['male', male], ['kanu', kanu]]) {
      g.scene.updateMatrixWorld(true);
      const body = g.scene.getObjectByName('Body');
      body.geometry.computeBoundingBox();
      heights[k] = body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y || 1.77;
    }
    lib = { female, male, kanu, clips, heights };
    return true;
  }).catch((err) => { console.warn('Character models unavailable, using the built-in figures:', err); return false; });
}

export const peopleReady = () => !!lib;

export class Person {
  constructor({ id = 0, outfit = -1, shirt = 0xe2483d, name = '', labelCss = '#fff' }) {
    const ci = outfit >= 0 ? outfit % CAST.length : id % CAST.length, c = CAST[ci];
    this.outfit = ci;
    const src = lib[c.base];
    this.group = new THREE.Group();
    const model = this.model = cloneSkinned(src.scene);
    const scale = this.scale = c.h / lib.heights[c.base];
    model.scale.setScalar(scale);
    model.rotation.y = Math.PI; // the files face +Z, the game faces -Z
    this.group.add(model);

    // keep only this character's pieces; give each its colour and the team glow
    const bodyName = c.body || 'Body'; // saree / skirt wearers use a body without the skin hidden under the cloth
    const show = new Set([bodyName, 'Eyes', 'Brows', c.hair[0], ...Object.keys(c.pieces)]);
    const drop = [];
    this.mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      const key = o.name.replace(/_\d+$/, '').replace(/\.\d+$/, '');
      if (!show.has(key)) { drop.push(o); return; }
      const m = o.material.clone();
      // skin: the scene's lighting and tone mapping darken mid-tones, so the skin texture is brightened past 1
      if (key === bodyName) m.color.setHex(c.skin).multiplyScalar(SKIN_BRIGHT);
      else if (key === c.hair[0]) m.color.setHex(c.hair[1]);
      else if (key === 'Brows') m.color.setHex(c.brows);
      else if (c.pieces[key] != null) m.color.setHex(c.pieces[key]);
      if (m.map) m.map.anisotropy = 4;
      // a softer rim on skin and hair so faces stay readable; clothes carry most of the team colour
      addTeamGlow(m, shirt, key === 'Eyes' ? 0 : (key === bodyName || key === 'Brows' || key === c.hair[0]) ? 0.28 : 0.55);
      o.material = m;
      o.castShadow = true;
      o.frustumCulled = false;
      this.mats.push(m);
    });
    for (const o of drop) o.parent.remove(o);
    this.hand = model.getObjectByName('hand_r');
    // long skirts: hold the arms a little away from the body so the hands do not pass through the cloth
    this.armOut = c.pieces.Saree !== undefined || c.pieces.Skirt !== undefined ? 0.2 : 0.06;
    this.upper = [model.getObjectByName('upperarm_l'), model.getObjectByName('upperarm_r')];
    // a saree allows only short steps: pull the legs part of the way back towards standing
    this.stride = c.pieces.Saree !== undefined ? 0.45 : 1;
    this.legs = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r'].map((n) => model.getObjectByName(n)).filter(Boolean);
    this.legRest = this.legs.map((b) => b.quaternion.clone());

    this.glow = makeGroundGlow(shirt, 1.45);
    this.group.add(this.glow);
    this.label = makeLabel(name, labelCss);
    this.label.position.y = c.h + 0.3;
    this.group.add(this.label);

    // every clip plays all the time; the weights decide what shows
    const mixer = this.mixer = new THREE.AnimationMixer(model);
    this.act = {};
    for (const k in lib.clips) {
      const L = mixer.clipAction(lib.clips[k].L), U = mixer.clipAction(lib.clips[k].U);
      for (const a of [L, U]) {
        if (k === 'death' || k === 'throw') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        a.play(); a.setEffectiveWeight(0);
      }
      this.act[k] = { L, U, wL: 0, wU: 0 };
    }
    this.act.idle.wL = this.act.idle.wU = 1;
    const off = (id * 0.37) % 1;
    this.act.run.L.time = this.act.run.U.time = off * lib.clips.run.dur;
    this.act.sprint.L.time = this.act.sprint.U.time = off * lib.clips.sprint.dur;
    this.act.idle.L.time = this.act.idle.U.time = off * lib.clips.idle.dur;
    this.throwDur = lib.clips.throw.dur / THROW_SPEED;
    this.throwT = 9; this.lastThr = -1; this.dead = false; this.deadT = 0;
    this.carryY = 0.62 * c.h; this.carryF = 0.36;
    this._v = new THREE.Vector3();
  }

  handWorld(out) {
    if (this.hand) return this.hand.getWorldPosition(out);
    return out.copy(this.group.position).setY(this.group.position.y + 1.3);
  }

  // s: { mv 0..1, air, carry, ball, alive, thr, pitch }
  update(dt, s) {
    const A = this.act;
    // undo last frame's arm/leg adjustments first: the mixer only rewrites a bone when its animated value
    // changes, so adjustments left in place would pile up frame after frame
    if (this._saved) { for (const [b, q] of this._saved) b.quaternion.copy(q); this._saved = null; }
    if (this.lastThr < 0) this.lastThr = s.thr;
    if (s.thr !== this.lastThr) {
      this.lastThr = s.thr; this.throwT = 0;
      A.throw.U.reset(); A.throw.U.setEffectiveTimeScale(THROW_SPEED); A.throw.U.play();
    }
    this.throwT += dt;

    if (!s.alive) {
      if (!this.dead) { this.dead = true; this.deadT = 0; for (const p of ['L', 'U']) { A.death[p].reset(); A.death[p].play(); } }
      this.deadT += dt;
      for (const k in A) { const w = k === 'death' ? 1 : 0; A[k].L.setEffectiveWeight(w); A[k].U.setEffectiveWeight(w); A[k].wL = A[k].wU = w; }
      this.mixer.update(dt);
      this.group.visible = this.deadT < 3;
      this.label.visible = this.glow.visible = false;
      return;
    }
    if (this.dead) { this.dead = false; this.glow.visible = true; A.idle.wL = A.idle.wU = 1; }
    this.group.visible = true;

    const k = 1 - Math.exp(-12 * dt);
    // ground speed decides the gait: idle, jog, or a full sprint (the game's top speed is a sprint, 6.2 m/s)
    const sp = s.speed !== undefined ? s.speed : s.mv * 6.2;
    const loco = s.air ? 'jump' : sp > 0.6 ? (sp > 4.3 ? 'sprint' : 'run') : 'idle';
    const throwing = this.throwT < this.throwDur;
    const over = throwing ? 'throw' : s.ball ? 'ball' : s.carry ? 'carry' : null;
    for (const key in A) {
      const a = A[key];
      const tL = key === loco ? 1 : 0;
      const tU = over ? (key === over ? 1 : 0) : tL;
      a.wL += (tL - a.wL) * k;
      a.wU += (tU - a.wU) * (over === 'throw' ? Math.min(1, k * 3) : k);
      a.L.setEffectiveWeight(a.wL); a.U.setEffectiveWeight(a.wU);
    }
    // play the cycle as fast as the body travels, so the feet do not slide
    const jog = Math.max(0.75, Math.min(1.5, sp / 3.2)), spr = Math.max(0.8, Math.min(1.25, sp / 6.2));
    A.run.L.setEffectiveTimeScale(jog); A.run.U.setEffectiveTimeScale(jog);
    A.sprint.L.setEffectiveTimeScale(spr); A.sprint.U.setEffectiveTimeScale(spr);
    this.mixer.update(dt);
    this._saved = [...this.legs, ...this.upper].filter(Boolean).map((b) => [b, b.quaternion.clone()]);
    if (this.stride < 1) this.legs.forEach((b, i) => b.quaternion.slerp(this.legRest[i], 1 - this.stride));
    // after the clips: swing both upper arms outwards a little (less while throwing or carrying)
    const out = this.armOut * (1 - Math.max(A.throw.wU, A.carry.wU, A.ball.wU));
    if (out > 0.001) {
      const ax = window.__armAxis || ARM_AXIS;
      if (this.upper[0]) this.upper[0].rotateOnAxis(ax, out);
      if (this.upper[1]) this.upper[1].rotateOnAxis(ax, -out);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
    this.glow.material.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
