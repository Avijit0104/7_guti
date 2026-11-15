// Sound effects generated with WebAudio (no audio files).
let ctx = null, master = null, noiseBuf = null;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, freq, q, vol = 0.4, delay = 0, type = 'bandpass') {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  throw() { noise(0.22, 1400, 0.8, 0.25); },
  bounce(v = 0.5) { tone(170, 0.09, 'sine', 0.12 + v * 0.25, -90); },
  scatter() { for (let i = 0; i < 6; i++) noise(0.07, 1800 + Math.random() * 2600, 4, 0.5, i * 0.045 + Math.random() * 0.03); tone(120, 0.2, 'triangle', 0.4, -60); },
  pick() { noise(0.05, 2600, 5, 0.3); },
  place() { noise(0.06, 2100, 6, 0.5); tone(620, 0.1, 'triangle', 0.2, 200, 0.03); },
  out() { tone(220, 0.25, 'sawtooth', 0.22, -150); noise(0.15, 500, 1, 0.4); },
  catch() { noise(0.05, 900, 2, 0.3); },
  miss() { tone(300, 0.25, 'triangle', 0.2, -140); },
  whistle() { tone(2100, 0.32, 'square', 0.1, 120); tone(2140, 0.32, 'square', 0.08, 120, 0.01); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.28, 0, i * 0.12)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.25, 0, i * 0.16)); },
};
