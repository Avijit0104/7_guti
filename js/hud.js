// Everything drawn with HTML on top of the 3D view: score, timer, hints, banners, lobby and result screens.
import { TEAMS } from './config.js';
import { P } from './view.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), scA: $('scA'), scB: $('scB'), timer: $('timer'), pips: [...$('pips').children], role: $('role'),
      banner: $('banner'), feed: $('feed'), charge: $('charge'), fill: $('chargeFill'), cross: $('cross'),
      bThrow: $('btnThrow'), bAct: $('btnAct'), bCam: $('btnCam'), sides: [...document.querySelectorAll('#top .side')],
      menu: $('menu'), lobby: $('lobby'), result: $('result'), lobA: $('lobA'), lobB: $('lobB'),
    };
    this.cache = {};
    this.bannerT = 0;
  }

  _set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }

  show(name) { // 'menu' | 'lobby' | 'game' | 'result'
    const e = this.el;
    e.menu.classList.toggle('hidden', name !== 'menu');
    e.lobby.classList.toggle('hidden', name !== 'lobby');
    e.result.classList.toggle('hidden', name !== 'result');
    e.hud.classList.toggle('hidden', name !== 'game' && name !== 'result');
    document.body.classList.toggle('playing', name === 'game');
    this.screen = name;
  }

  banner(html, secs = 2.2) {
    const b = this.el.banner;
    b.innerHTML = html; b.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('on'), secs * 1000);
  }

  feed(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  lobby(snap, myId, isHost) {
    const key = snap.p.map((r) => r[P.NAME] + (r[P.FLAGS] & 2)).join('|') + myId;
    this._set('lobby', key, () => {
      const li = (r) => `<li class="${r[P.FLAGS] & 2 ? 'bot' : ''} ${r[P.ID] === myId ? 'me' : ''}">${esc(r[P.NAME])}${r[P.FLAGS] & 2 ? ' (bot)' : ''}${r[P.ID] === myId ? ' (you)' : ''}</li>`;
      this.el.lobA.innerHTML = snap.p.filter((r) => r[P.TEAM] === 0).map(li).join('');
      this.el.lobB.innerHTML = snap.p.filter((r) => r[P.TEAM] === 1).map(li).join('');
    });
    $('btnStart').classList.toggle('hidden', !isHost);
    $('lobWait').classList.toggle('hidden', isHost);
  }

  result(winner, sc, myTeam, isHost) {
    $('resTitle').innerHTML = `<span style="color:${TEAMS[winner].css}">${TEAMS[winner].name}</span> wins${winner === myTeam ? ' — well played!' : ''}`;
    $('resScore').textContent = `${sc[0]} : ${sc[1]}`;
    $('btnAgain').classList.toggle('hidden', !isHost);
    $('resWait').classList.toggle('hidden', isHost);
    this.show('result');
  }

  // called every frame while in a game
  update(snap, myId, st) {
    const e = this.el;
    const me = snap.p.find((r) => r[P.ID] === myId);
    this._set('scA', snap.sc[0], (v) => { e.scA.textContent = v; });
    this._set('scB', snap.sc[1], (v) => { e.scB.textContent = v; });
    this._set('at', snap.ph === 'lobby' ? -1 : snap.at, (v) => e.sides.forEach((s, i) => s.classList.toggle('attack', i === v)));
    const showTime = snap.ph === 'scramble' || (snap.ph === 'throw' && !snap.fl);
    this._set('tm', showTime ? snap.tm : '–', (v) => { e.timer.textContent = v; e.timer.classList.toggle('low', v !== '–' && v <= 10 && snap.ph === 'scramble'); });
    this._set('pc', snap.ph === 'scramble' || snap.ph === 'roundEnd' ? snap.pc : 0, (v) => e.pips.forEach((p, i) => p.classList.toggle('on', i < v)));

    let role = '';
    const hasBall = !!me && snap.b[3] === myId;
    const alive = !!me && !!(me[P.FLAGS] & 1);
    const attack = !!me && me[P.TEAM] === snap.at;
    if (me) {
      if (snap.ph === 'throw') {
        if (snap.th === myId) role = hasBall ? 'Your throw! Harder hit = more stones down = more points' : 'Good throw?';
        else role = attack ? 'Your team-mate is throwing' : 'Defend: be ready to chase the ball';
      } else if (snap.ph === 'scramble') {
        if (!alive) role = 'You are out — watching your team';
        else if (attack) {
          const c = me[P.CARRY];
          if (c < 0) role = `Grab stone ${snap.pc + 1} (yellow arrow) — dodge the ball!`;
          else if (c === snap.pc) role = `Run stone ${c + 1} into the base circle!`;
          else role = `You hold stone ${c + 1}, but stone ${snap.pc + 1} goes first — GRAB drops it`;
        } else role = hasBall ? 'You have the ball — throw it at an attacker!' : 'Get the ball!';
      }
    }
    this._set('role', role, (v) => { e.role.textContent = v; });

    this._set('throwBtn', hasBall ? (st.charging ? 2 : 1) : 0, (v) => { e.bThrow.classList.toggle('off', v === 0); e.bThrow.classList.toggle('hot', v > 0); });
    const canAct = alive && attack && snap.ph === 'scramble';
    this._set('actBtn', canAct ? (me[P.CARRY] >= 0 ? 2 : 1) : 0, (v) => { e.bAct.classList.toggle('off', v === 0); e.bAct.classList.toggle('go', v === 1); e.bAct.textContent = v === 2 ? 'DROP' : 'GRAB'; });
    this._set('cam', st.fpp, (v) => { e.bCam.textContent = v ? 'FPP' : 'TPP'; });
    this._set('chg', st.charging, (v) => e.charge.classList.toggle('on', v));
    if (st.charging) e.fill.style.width = Math.round(st.charge * 100) + '%';
  }
}
