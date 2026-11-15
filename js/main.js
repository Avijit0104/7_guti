// Start-up, menu flow and the main loop.
import * as THREE from '../vendor/three.module.min.js';
import { C, TEAMS, stepLocal, aimDir } from './config.js';
import { buildWorld } from './world.js';
import { View, P } from './view.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Sim } from './sim.js';
import { HostNet, GuestNet, makeCode } from './net.js';
import { sfx, unlockAudio, toggleMute } from './audio.js';
import { loadRiggedModels } from './rigged.js';

const $ = (id) => document.getElementById(id);
const input = new Input();
const hud = new Hud();
document.body.classList.toggle('touch', input.isTouch);

// ---------- renderer ----------
const quality = { shadows: true, shadowSize: input.isTouch ? 1024 : 2048, low: input.isTouch, maxPR: input.isTouch ? 1.5 : 2 };
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.isTouch, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, quality.maxPR);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 900);
const world = buildWorld(scene, quality);
const view = new View(scene, camera);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- state ----------
let mode = 'menu';          // menu | solo | host | guest
let sim = null, hostNet = null, guestNet = null;
let myId = -1, snap = null, teamSize = 3;
let fpp = false, charge = 0, chargeDir = 1, charging = false, netAcc = 0, sendAcc = 0, time = 0;
let wasMatchEnd = false;
const me = { x: 0, y: 0, z: 9, vy: 0, yaw: 0, pitch: -0.12, mv: 0, tp: -1 };
const aimVel = [0, 0, 0];
const events = [];

function nameOf(id) {
  const r = snap && snap.p.find((x) => x[P.ID] === id);
  if (r) return r[P.NAME];
  return sim && sim.players[id] ? sim.players[id].name : 'Player';
}
function teamOf(id) {
  const r = snap && snap.p.find((x) => x[P.ID] === id);
  return r ? r[P.TEAM] : (sim && sim.players[id] ? sim.players[id].team : 0);
}
const tag = (id) => `<b style="color:${TEAMS[teamOf(id)].css}">${String(nameOf(id)).replace(/[&<>]/g, '')}</b>`;
const tname = (t) => `<span style="color:${TEAMS[t].css}">${TEAMS[t].name}</span>`;

// ---------- events (sounds, banners, feed) ----------
function handleEvent(e) {
  view.onEvent(e);
  if (mode === 'menu') return; // the menu background match stays silent
  const mine = e.id === myId;
  switch (e.k) {
    case 'round': sfx.whistle(); hud.banner(`Round ${e.n}<small>${tname(e.at)} attacks</small>`); break;
    case 'turn': if (mine) hud.banner('Your throw!<small>Hold THROW, aim, release when the power is right</small>', 2.6); else hud.feed(`${tag(e.id)} steps up to throw`); break;
    case 'throw': sfx.throw(); break;
    case 'bounce': sfx.bounce(e.v); break;
    case 'miss': sfx.miss(); hud.feed(`${tag(e.id)} missed the stack`); break;
    case 'scatter': {
      sfx.scatter();
      const att = teamOf(myId) === (snap ? snap.at : 0);
      const head = e.n >= 7 ? 'Smashed! All 7 stones down' : e.n === 1 ? 'Soft hit — 1 stone down' : `${e.n} stones down`;
      hud.banner(`${head}<small>${att ? 'Rebuild it — biggest stone first' : 'Get the ball and hit the runners'}</small>`, 2.6);
      break;
    }
    case 'pick': sfx.pick(); break;
    case 'catch': sfx.catch(); break;
    case 'place': sfx.place(); hud.feed(`${tag(e.id)} placed stone ${e.i + 1} of 7`); break;
    case 'out': sfx.out(); if (mine) hud.banner('You are out!<small>Hit by the ball</small>'); else hud.feed(`${tag(e.id)} is out${e.by >= 0 ? ' — hit by ' + tag(e.by) : ''}`); break;
    case 'roundEnd': {
      const txt = { built: 'Stack rebuilt!', out: 'All attackers out!', time: 'Time is up!', allmiss: 'Every throw missed' }[e.why] || '';
      hud.banner(`${txt}<small>${e.w >= 0 ? '+' + e.pts + (e.pts === 1 ? ' point to ' : ' points to ') + tname(e.w) : 'No points — teams swap'}</small>`, 3.6);
      if (e.w >= 0) (e.w === teamOf(myId) ? sfx.win : sfx.lose)();
      break;
    }
    case 'match': hud.result(e.w, e.sc, teamOf(myId), mode !== 'guest'); (e.w === teamOf(myId) ? sfx.win : sfx.lose)(); break;
    case 'join': hud.feed(`${String(e.name).replace(/[&<>]/g, '')} joined`); break;
    case 'leave': hud.feed(`${String(e.name).replace(/[&<>]/g, '')} left (a bot took over)`); break;
  }
}
function onSimEvent(e) { events.push(e); if (hostNet) hostNet.broadcast(e); }

// ---------- starting / leaving ----------
function resetLocal() { me.tp = -1; me.vy = 0; me.pitch = -0.12; charge = 0; charging = false; snap = null; view.A = view.B = null; }
function playerName() {
  const n = ($('inName').value || '').trim().slice(0, 14) || 'Player';
  try { localStorage.setItem('sg_name', n); } catch (_) { /* private mode */ }
  return n;
}
function startBackground() {
  // bots play a match behind the menu
  sim = new Sim({ teamSize: 3, onEvent: (e) => events.push(e) });
  sim.startMatch();
  myId = -1; mode = 'menu';
}
function startSolo() {
  unlockAudio(); resetLocal();
  sim = new Sim({ teamSize, onEvent: onSimEvent });
  myId = sim.addHuman(playerName(), 'local').id;
  mode = 'solo';
  hud.show('game'); input.enabled = true;
  sim.startMatch();
}
function createRoom() {
  unlockAudio();
  const code = makeCode();
  $('menuMsg').textContent = 'Creating room…';
  const name = playerName();
  let net;
  try {
    net = new HostNet(code, {
      onOpen: () => {
        resetLocal();
        hostNet = net;
        sim = new Sim({ teamSize, onEvent: onSimEvent });
        myId = sim.addHuman(name, 'local').id;
        mode = 'host';
        $('lobCode').textContent = code; $('menuMsg').textContent = '';
        hud.show('lobby');
      },
      onData: (conn, m) => {
        if (!sim || !m || typeof m !== 'object') return;
        if (m.t === 'hi') {
          if (conn.pid !== undefined) return;
          const slot = sim.addHuman(m.name, conn.peer);
          if (!slot) { net.sendTo(conn, { t: 'full' }); return; }
          conn.pid = slot.id;
          net.sendTo(conn, { t: 'w', id: slot.id, code });
        } else if (conn.pid === undefined) return;
        else if (m.t === 'i') sim.setHumanState(conn.pid, m);
        else if (m.t === 'a') sim.action(conn.pid, m);
      },
      onLeave: (conn) => { if (sim && conn.pid !== undefined) sim.removeHuman(conn.pid); },
      onError: (txt) => { if (mode === 'menu') $('menuMsg').textContent = txt; else hud.feed(txt); },
    });
  } catch (err) { $('menuMsg').textContent = 'Multiplayer is unavailable: ' + err.message; }
}
function joinRoom(codeRaw) {
  unlockAudio();
  const code = String(codeRaw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 5) { $('menuMsg').textContent = 'Enter the 5-letter room code.'; return; }
  $('menuMsg').textContent = 'Joining ' + code + '…';
  const name = playerName();
  let net;
  try {
    net = new GuestNet(code, {
      onOpen: () => net.send({ t: 'hi', name }),
      onData: (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'w') {
          sim = null; resetLocal();
          guestNet = net; myId = m.id; mode = 'guest';
          $('lobCode').textContent = code; $('menuMsg').textContent = '';
          hud.show('lobby');
        } else if (m.t === 'full') { $('menuMsg').textContent = 'That room is full.'; net.close(); }
        else if (mode !== 'guest') return;
        else if (m.t === 's') { if (!snap || m.n > snap.n) { snap = m; view.push(m, false); } }
        else if (m.t === 'e') events.push(m);
      },
      onClose: () => { if (mode === 'guest') leave('The host left the game.'); },
      onError: (txt) => { if (mode === 'guest') leave(txt); else $('menuMsg').textContent = txt; },
    });
  } catch (err) { $('menuMsg').textContent = 'Multiplayer is unavailable: ' + err.message; }
}
function leave(msg) {
  if (hostNet) hostNet.close();
  if (guestNet) guestNet.close();
  hostNet = guestNet = null;
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  resetLocal();
  startBackground();
  hud.show('menu');
  $('menuMsg').textContent = msg || '';
}

// ---------- menu wiring ----------
try { $('inName').value = localStorage.getItem('sg_name') || ''; } catch (_) { /* private mode */ }
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) $('inCode').value = roomParam.toUpperCase().slice(0, 5);
$('sizes').addEventListener('click', (e) => {
  const n = +e.target.dataset.n;
  if (!n) return;
  teamSize = n;
  for (const b of $('sizes').children) b.classList.toggle('on', b === e.target);
});
$('btnSolo').onclick = startSolo;
$('btnCreate').onclick = createRoom;
$('btnJoin').onclick = () => joinRoom($('inCode').value);
$('inCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('inCode').value); });
$('btnStart').onclick = () => { if (sim && mode === 'host') { hud.show('game'); input.enabled = true; sim.startMatch(); } };
$('btnAgain').onclick = () => { if (sim && mode !== 'guest') { hud.show('game'); sim.startMatch(); } };
$('btnLeaveLobby').onclick = $('btnLeaveRes').onclick = $('btnMenu').onclick = () => leave('');
$('btnMute').onclick = () => {
  const m = toggleMute();
  $('btnMute').textContent = m ? '🔇' : '🔊';
  $('btnMute').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
};
$('btnCopy').onclick = async () => {
  const url = location.origin + location.pathname + '?room=' + $('lobCode').textContent;
  try { await navigator.clipboard.writeText(url); $('btnCopy').textContent = 'Link copied!'; }
  catch (_) { $('btnCopy').textContent = url; }
  setTimeout(() => { $('btnCopy').textContent = 'Copy invite link'; }, 2500);
};
addEventListener('pointerdown', unlockAudio, { once: true });

// ---------- local player ----------
function doAction(a) {
  if (sim) sim.action(myId, a);
  else if (guestNet) guestNet.send(Object.assign({ t: 'a' }, a));
}
function controlLocal(dt) {
  const inp = input.read();
  const row = snap.p.find((r) => r[P.ID] === myId);
  if (!row) return;
  if (row[P.TP] !== me.tp) { // the host moved us (new round, our turn to throw...)
    me.tp = row[P.TP]; me.x = row[P.X]; me.y = row[P.Y]; me.z = row[P.Z]; me.yaw = row[P.YAW]; me.pitch = -0.1; me.vy = 0;
  }
  me.yaw += inp.lookX;
  me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch + inp.lookY));
  const alive = !!(row[P.FLAGS] & 1);
  const ph = snap.ph;
  const hasBall = snap.b[3] === myId;
  const mult = hasBall && ph === 'scramble' ? C.BALL_MULT : row[P.CARRY] >= 0 ? C.STONE_MULT : 1;
  stepLocal(me, inp.mx, inp.my, inp.jump, dt, {
    mult, frozen: !alive || ph === 'lobby' || ph === 'matchEnd', zone: ph === 'throw' && snap.th === myId,
  });

  if (hasBall && alive) {
    if (inp.throwHeld) { // the power bar swings up and down: let go at the strength you want
      if (!charging) { charging = true; charge = 0; chargeDir = 1; }
      charge += chargeDir * dt / C.CHARGE_TIME;
      if (charge >= 1) { charge = 1; chargeDir = -1; } else if (charge <= 0.05) { charge = 0.05; chargeDir = 1; }
    }
    if (inp.release && charging) { doAction({ k: 'throw', d: aimDir(me.yaw, me.pitch), p: charge }); charging = false; charge = 0; }
    const d = aimDir(me.yaw, me.pitch), sp = C.THROW_MIN + (C.THROW_MAX - C.THROW_MIN) * charge;
    aimVel[0] = d[0] * sp; aimVel[1] = d[1] * sp; aimVel[2] = d[2] * sp;
  } else { charging = false; charge = 0; }
  if (inp.act && alive) doAction({ k: 'act' });
  if (inp.cam) fpp = !fpp;

  if (guestNet) {
    sendAcc += dt;
    if (sendAcc >= 1 / 30) {
      sendAcc = 0;
      guestNet.send({ t: 'i', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), mv: +me.mv.toFixed(2), tp: me.tp });
    }
  }
}

// ---------- main loop ----------
let last = performance.now(), slowT = 0, fastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; time += dt;

  if (mode !== 'menu' && snap) controlLocal(dt); else input.read();

  if (sim) {
    if (mode !== 'menu' && myId >= 0) sim.setHumanState(myId, me);
    sim.tick(dt);
    if (mode === 'menu' && sim.phase === 'matchEnd') sim.startMatch();
    snap = sim.snapshot();
    view.push(snap, true);
    if (hostNet) {
      netAcc += dt;
      if (netAcc >= 1 / C.SNAP_HZ) { netAcc = 0; hostNet.broadcast(snap); }
    }
  }
  while (events.length) handleEvent(events.shift());

  if (snap) {
    const inLobby = snap.ph === 'lobby';
    if (mode === 'guest' || mode === 'host') {
      if (inLobby && hud.screen !== 'lobby') { hud.show('lobby'); input.enabled = false; }
      if (inLobby) hud.lobby(snap, myId, mode === 'host');
      if (!inLobby && hud.screen === 'lobby') { hud.show('game'); input.enabled = true; }
    }
    if (mode !== 'menu') {
      if (wasMatchEnd && snap.ph !== 'matchEnd' && hud.screen === 'result') hud.show('game');
      wasMatchEnd = snap.ph === 'matchEnd';
      hud.update(snap, myId, { fpp, charging, charge });
    }
    const orbit = mode === 'menu' || inLobby;
    view.update(dt, { myId, me: mode === 'menu' ? null : me, fpp, aiming: charging, aimVel, time });
    if (orbit) {
      const a = time * 0.12;
      camera.position.set(Math.sin(a) * 15, 5.5, Math.cos(a) * 15);
      camera.lookAt(0, 1, 0);
    }
  }
  if (window.__g.cam) window.__g.cam(camera); // debugging: override the camera from the console
  renderer.render(scene, camera);

  // keep it smooth: drop the render resolution if the device struggles, then shadows
  if (dt > 1 / 42) { slowT += dt; fastT = 0; } else { fastT += dt; if (fastT > 2) slowT = 0; }
  if (slowT > 2.5) {
    slowT = 0;
    if (pixelRatio > 0.8) { pixelRatio = Math.max(0.75, pixelRatio - 0.2); renderer.setPixelRatio(pixelRatio); resize(); }
    else if (world.sun.castShadow) { world.sun.castShadow = false; }
  }
}

// A background tab stops animation frames, which would freeze the match for every guest.
// A worker timer is not throttled, so the host keeps the game running (without drawing) while hidden.
function hostHeartbeat() {
  if (!sim || !hostNet) return;
  const now = performance.now();
  let gap = (now - last) / 1000;
  if (gap < 0.2) return; // frames are flowing normally
  gap = Math.min(gap, 1.5);
  last = now;
  if (myId >= 0) sim.setHumanState(myId, me);
  for (let t = 0; t < gap; t += 1 / 30) sim.tick(Math.min(1 / 30, gap - t));
  snap = sim.snapshot();
  view.push(snap, true);
  hostNet.broadcast(snap);
}
try {
  const src = 'setInterval(function(){postMessage(0)},50)';
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  w.onmessage = hostHeartbeat;
} catch (_) { setInterval(hostHeartbeat, 100); }

startBackground();
hud.show('menu');
// The rigged characters load in the background; the game is playable with the built-in figures meanwhile.
if (new URLSearchParams(location.search).get('models') !== '0') loadRiggedModels().then((ok) => { if (ok) view.rebuildCharacters(); });
requestAnimationFrame(frame);

// for debugging in the browser console
window.__g = { get sim() { return sim; }, get snap() { return snap; }, me, input, view, get mode() { return mode; }, get myId() { return myId; }, renderer };
