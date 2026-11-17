// Team glow: a coloured rim of light around a character's silhouette (red team red, blue team blue),
// plus a soft glowing disc on the ground under their feet. Both are cheap: the rim is a few lines added
// to the character's own material, the disc is one small additive quad.
import * as THREE from '../vendor/three.module.min.js';

export const glowPulse = { value: 1 }; // shared by every character; main loop animates it gently

// Adds the rim glow to a MeshLambertMaterial or MeshStandardMaterial.
export function addTeamGlow(mat, color, strength = 0.9) {
  const uColor = { value: new THREE.Color(color) };
  const uStrength = { value: strength };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowColor = uColor;
    sh.uniforms.uGlowStrength = uStrength;
    sh.uniforms.uGlowPulse = glowPulse;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlowColor;\nuniform float uGlowStrength;\nuniform float uGlowPulse;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 3.4);
    totalEmissiveRadiance += uGlowColor * rim * 1.9 * uGlowStrength * uGlowPulse;
  }`);
  };
  mat.customProgramCacheKey = () => 'teamglow';
  mat.userData.glow = { color: uColor, strength: uStrength };
  return mat;
}

let discTex = null;
function discTexture() {
  if (discTex) return discTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  discTex = new THREE.CanvasTexture(c);
  return discTex;
}
const DISC_GEO = new THREE.PlaneGeometry(1, 1);

// Glowing disc under a character's feet, in the team colour.
export function makeGroundGlow(color, size = 1.5) {
  const m = new THREE.Mesh(DISC_GEO, new THREE.MeshBasicMaterial({
    map: discTexture(), color, transparent: true, opacity: 0.7, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.scale.set(size, size, 1);
  m.renderOrder = 1;
  return m;
}
