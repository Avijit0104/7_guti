// Portraits for the character picker: each character is rendered once, off screen, with the game's own
// renderer and kept as an image. No image files are needed.
import * as THREE from '../vendor/three.module.min.js';
import { Kid, KID_COUNT } from './kid.js';

let cache = null;

export function characterPortraits(renderer, w = 168, h = 224) {
  if (cache) return cache;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x8a7550, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.position.set(1.5, 3, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 20);
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const px = new Uint8Array(w * h * 4);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  const img = g.createImageData(w, h);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);

  cache = [];
  for (let i = 0; i < KID_COUNT; i++) {
    const kid = new Kid({ outfit: i, shirt: 0xffc14d, name: '' });
    kid.label.visible = false; kid.glow.visible = false;
    kid.group.rotation.y = Math.PI - 0.32; // turn to face the camera, slightly to one side
    for (let f = 0; f < 3; f++) kid.update(1 / 60, { mv: 0, air: false, carry: false, ball: false, alive: true, thr: 0, pitch: 0 });
    scene.add(kid.group);
    const top = 1.4 * kid.scale;
    cam.position.set(0, top * 0.6, 4.6);
    cam.lookAt(0, top * 0.5, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip rows
    g.putImageData(img, 0, 0);
    cache.push(canvas.toDataURL('image/png'));
    scene.remove(kid.group);
    kid.dispose();
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return cache;
}
