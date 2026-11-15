// Touch (virtual joystick + drag-to-look + buttons), keyboard and mouse.
// Uses Pointer Events so the same code handles fingers and the mouse.

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };      // x = strafe right, y = forward
    this.lookX = 0; this.lookY = 0;  // accumulated since last read (radians)
    this.throwHeld = false;
    this._edges = { jump: false, act: false, cam: false, release: false };
    this.keys = {};
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = false;

    const $ = (id) => document.getElementById(id);
    this.joyZone = $('joyZone'); this.lookZone = $('lookZone');
    this.joyBase = $('joyBase'); this.joyKnob = $('joyKnob');

    // joystick
    this.joyZone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null) return;
      this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY;
      this.joyZone.setPointerCapture(e.pointerId);
      this.joyBase.style.left = e.clientX + 'px'; this.joyBase.style.top = e.clientY + 'px';
      this.joyBase.classList.add('on');
      this._joyMove(e);
    });
    this.joyZone.addEventListener('pointermove', (e) => { if (e.pointerId === this.joy.id) this._joyMove(e); });
    const joyEnd = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null; this.joy.x = this.joy.y = 0;
      this.joyBase.classList.remove('on');
      this.joyKnob.style.transform = 'translate(-50%,-50%)';
    };
    this.joyZone.addEventListener('pointerup', joyEnd);
    this.joyZone.addEventListener('pointercancel', joyEnd);

    // look
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && !this.isTouch) {
        if (document.pointerLockElement !== this.lookZone) { try { const p = this.lookZone.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* no pointer lock */ } }
        else if (e.button === 0) this.throwHeld = true;
      }
      if (this.look.id !== null) return;
      this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY;
      try { this.lookZone.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    this.lookZone.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement === this.lookZone) {
        this.lookX -= e.movementX * 0.0023; this.lookY -= e.movementY * 0.0023;
        return;
      }
      if (e.pointerId !== this.look.id) return;
      const k = e.pointerType === 'mouse' ? 0.004 : 0.0055;
      this.lookX -= (e.clientX - this.look.x) * k; this.lookY -= (e.clientY - this.look.y) * k;
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    const lookEnd = (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.throwHeld && document.pointerLockElement === this.lookZone) { this.throwHeld = false; this._edges.release = true; }
      if (e.pointerId === this.look.id) this.look.id = null;
    };
    this.lookZone.addEventListener('pointerup', lookEnd);
    this.lookZone.addEventListener('pointercancel', lookEnd);

    // buttons
    const tap = (id, edge) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); this._edges[edge] = true; });
    tap('btnJump', 'jump'); tap('btnAct', 'act'); tap('btnCam', 'cam');
    const bt = $('btnThrow');
    // holding THROW also aims: drag the same thumb to look around while charging
    let bx = 0, by = 0;
    bt.addEventListener('pointerdown', (e) => { e.preventDefault(); this.throwHeld = true; bx = e.clientX; by = e.clientY; bt.setPointerCapture(e.pointerId); });
    bt.addEventListener('pointermove', (e) => {
      if (!this.throwHeld) return;
      this.lookX -= (e.clientX - bx) * 0.0045; this.lookY -= (e.clientY - by) * 0.0045;
      bx = e.clientX; by = e.clientY;
    });
    const btEnd = () => { if (this.throwHeld) { this.throwHeld = false; this._edges.release = true; } };
    bt.addEventListener('pointerup', btEnd);
    bt.addEventListener('pointercancel', btEnd);

    // keyboard
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      if (e.target && (e.target.tagName === 'INPUT')) return;
      this.keys[e.code] = true;
      if (e.code === 'Space') { this._edges.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE') this._edges.act = true;
      if (e.code === 'KeyV') this._edges.cam = true;
      if (e.code === 'KeyF') this.throwHeld = true;
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyF' && this.throwHeld) { this.throwHeld = false; this._edges.release = true; }
    });
    addEventListener('blur', () => { this.keys = {}; this.throwHeld = false; });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
  }

  _joyMove(e) {
    const R = 52;
    let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.joy.x = dx / R; this.joy.y = -dy / R;
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  // call once per frame
  read() {
    const k = this.keys;
    let x = this.joy.x, y = this.joy.y;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    const dead = Math.hypot(x, y) < 0.12;
    this.move.x = dead ? 0 : Math.max(-1, Math.min(1, x));
    this.move.y = dead ? 0 : Math.max(-1, Math.min(1, y));
    const out = { mx: this.move.x, my: this.move.y, lookX: this.lookX, lookY: this.lookY, throwHeld: this.throwHeld, ...this._edges };
    this.lookX = this.lookY = 0;
    this._edges.jump = this._edges.act = this._edges.cam = this._edges.release = false;
    return out;
  }
}
