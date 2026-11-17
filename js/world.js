// The scenery: sky, ground, playing field markings, village huts, trees, fence, lights.
// Everything is generated in code, so there are no image or model files to load.
import * as THREE from '../vendor/three.module.min.js';
import { C, OBSTACLES } from './config.js';

function rng(seed) { // small deterministic random so the village looks the same for everyone
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

function grassTexture() {
  const r = rng(7);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f9a3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      g.fillStyle = v < 0.4 ? 'rgba(52,110,40,0.5)' : v < 0.8 ? 'rgba(126,170,70,0.45)' : 'rgba(150,140,80,0.35)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 4);
    }
  }, 48);
}

function fieldTexture(W, H) {
  const ppm = 15, w = Math.round(W * ppm), h = Math.round(H * ppm); // 15 px per metre keeps the big field texture phone-friendly
  const r = rng(11);
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#b08a5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? 'rgba(140,105,65,0.35)' : v < 0.85 ? 'rgba(196,160,112,0.35)' : 'rgba(96,120,60,0.3)';
      const s = 1 + r() * 3;
      g.fillRect(r() * w, r() * h, s, s);
    }
    for (let i = 0; i < 60; i++) { // worn patches
      g.fillStyle = `rgba(${150 + r() * 40 | 0},${115 + r() * 30 | 0},${75 + r() * 20 | 0},0.18)`;
      g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 70, 14 + r() * 40, r() * 3, 0, 7); g.fill();
    }
    // chalk lines
    const X = (x) => (x + W / 2) * ppm, Z = (z) => (z + H / 2) * ppm;
    g.strokeStyle = 'rgba(255,252,240,0.85)'; g.lineWidth = 4; g.lineCap = 'round';
    g.strokeRect(X(-C.FIELD_X), Z(-C.FIELD_Z), C.FIELD_X * 2 * ppm, C.FIELD_Z * 2 * ppm);
    // throw line (attackers) and defence line (defenders) run the full width: nobody crosses them until the stack is hit
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(X(-C.FIELD_X), Z(C.THROW_Z)); g.lineTo(X(C.FIELD_X), Z(C.THROW_Z)); g.stroke();
    g.beginPath(); g.moveTo(X(-C.FIELD_X), Z(-C.DEF_LINE)); g.lineTo(X(C.FIELD_X), Z(-C.DEF_LINE)); g.stroke();
    g.lineWidth = 4;
    g.lineWidth = 3; g.setLineDash([10, 9]);
    g.beginPath(); g.arc(X(0), Z(0), C.BASE_R * ppm, 0, 7); g.stroke();
    g.setLineDash([]);
    // soft edge so the dirt blends into the grass
    g.globalCompositeOperation = 'destination-in';
    const m = 46;
    let gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(m / h, '#000'); gr.addColorStop(1 - m / h, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(m / w, '#000'); gr.addColorStop(1 - m / w, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function sky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f7fd6) }, mid: { value: new THREE.Color(0x9fd0f2) },
      hor: { value: new THREE.Color(0xf6e3bd) }, sun: { value: new THREE.Vector3(-0.5, 0.62, 0.3).normalize() },
    },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun;
      void main(){ float h = max(d.y, 0.0);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(d), sun), 0.0);
        c += vec3(1.0,0.85,0.55) * (pow(s, 600.0) * 2.0 + pow(s, 24.0) * 0.28);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), mat);
  m.frustumCulled = false;
  return m;
}

export function buildWorld(scene, quality) {
  const r = rng(2024);
  scene.background = new THREE.Color(0xf6e3bd);
  scene.fog = new THREE.Fog(0xeedfc0, 80, 380);
  scene.add(sky());

  // lights
  const hemi = new THREE.HemisphereLight(0xd4e8ff, 0x80704c, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
  sun.position.set(-26, 36, 16);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const sc = sun.shadow.camera;
  sc.left = -(C.FIELD_X + 10); sc.right = C.FIELD_X + 10; sc.top = C.FIELD_Z + 12; sc.bottom = -(C.FIELD_Z + 12); sc.near = 1; sc.far = 110;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  // ground
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: grassTexture() }));
  grass.material.map.repeat.set(160, 160);
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true;
  scene.add(grass);
  const FW = C.FIELD_X * 2 + 7, FH = C.FIELD_Z * 2 + 7;
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH),
    new THREE.MeshLambertMaterial({ map: fieldTexture(FW, FH), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  field.rotation.x = -Math.PI / 2; field.position.y = 0.01; field.receiveShadow = true;
  scene.add(field);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  const col = new THREE.Color();
  const set = (im, i, x, y, z, rx, ry, rz, sx, sy, sz) => {
    Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')); M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz)); im.setMatrixAt(i, M);
  };

  // bamboo fence around the field
  const fx = C.FIELD_X + 2.6, fz = C.FIELD_Z + 2.6;
  const posts = [];
  for (let x = -fx; x <= fx + 0.01; x += 2.08) { posts.push([x, -fz], [x, fz]); }
  for (let z = -fz + 2.08; z < fz - 0.01; z += 2.08) { posts.push([-fx, z], [fx, z]); }
  const bamboo = new THREE.MeshLambertMaterial({ color: 0xc2a25a });
  const postIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.065, 1.25, 6), bamboo, posts.length);
  posts.forEach(([x, z], i) => set(postIM, i, x, 0.62, z, (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08, 1, 0.9 + r() * 0.2, 1));
  postIM.castShadow = true;
  scene.add(postIM);
  const railIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), bamboo, 8);
  let ri = 0;
  for (const y of [0.45, 0.95]) {
    set(railIM, ri++, 0, y, -fz, 0, 0, Math.PI / 2, 1, fx * 2, 1);
    set(railIM, ri++, 0, y, fz, 0, 0, Math.PI / 2, 1, fx * 2, 1);
    set(railIM, ri++, -fx, y, 0, Math.PI / 2, 0, 0, 1, fz * 2, 1);
    set(railIM, ri++, fx, y, 0, Math.PI / 2, 0, 0, 1, fz * 2, 1);
  }
  scene.add(railIM);

  // trees
  const spots = [];
  const tryPlace = (minR, maxR, n) => {
    for (let i = 0, guard = 0; i < n && guard < 400; guard++) {
      const a = r() * Math.PI * 2, d = minR + r() * (maxR - minR);
      const x = Math.cos(a) * d * 1.25, z = Math.sin(a) * d;
      if (Math.abs(x) < fx + 3 && Math.abs(z) < fz + 3) continue;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 5)) continue;
      spots.push([x, z]); i++;
    }
  };
  const nPalm = quality.low ? 9 : 16, nTree = quality.low ? 12 : 22;
  tryPlace(C.FIELD_X + 6, C.FIELD_X + 50, nPalm);
  const palms = spots.slice();
  tryPlace(C.FIELD_X + 8, C.FIELD_X + 75, nTree);
  const trees = spots.slice(palms.length);

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const palmTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.24, 1, 6), trunkMat, palms.length);
  const leafGeo = new THREE.ConeGeometry(0.55, 3.6, 4);
  leafGeo.translate(0, 1.8, 0);
  const palmLeaf = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x3f8a36 }), palms.length * 9);
  palms.forEach(([x, z], i) => {
    const h = 7 + r() * 4, tx = (r() - 0.5) * 0.16, tz = (r() - 0.5) * 0.16;
    set(palmTrunk, i, x + tx * h * 0.5, h / 2, z + tz * h * 0.5, tz, 0, -tx, 1, h, 1);
    const cx = x + tx * h, cz = z + tz * h;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + r() * 0.4;
      set(palmLeaf, i * 9 + k, cx, h - 0.1, cz, 0, a, -(1.15 + r() * 0.65), 1, 0.85 + r() * 0.4, 0.16);
      palmLeaf.setColorAt(i * 9 + k, col.setHSL(0.3 + r() * 0.04, 0.5, 0.3 + r() * 0.1));
    }
  });
  palmTrunk.castShadow = palmLeaf.castShadow = true;
  scene.add(palmTrunk, palmLeaf);

  const treeTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.42, 1, 7), trunkMat, trees.length);
  const blob = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length * 4);
  trees.forEach(([x, z], i) => {
    const h = 3 + r() * 2.2, s = 2.2 + r() * 1.6;
    set(treeTrunk, i, x, h / 2, z, 0, r() * 3, 0, 1, h, 1);
    for (let k = 0; k < 4; k++) {
      const a = r() * 6.3, d = k === 0 ? 0 : s * 0.55;
      set(blob, i * 4 + k, x + Math.cos(a) * d, h + s * (k === 0 ? 0.55 : 0.2 + r() * 0.3), z + Math.sin(a) * d, r(), r() * 6, r(), s * (0.75 + r() * 0.3), s * (0.6 + r() * 0.25), s * (0.75 + r() * 0.3));
      blob.setColorAt(i * 4 + k, col.setHSL(0.27 + r() * 0.07, 0.48 + r() * 0.15, 0.24 + r() * 0.1));
    }
  });
  treeTrunk.castShadow = blob.castShadow = true;
  scene.add(treeTrunk, blob);

  // mud huts with thatched roofs
  const mud = new THREE.MeshLambertMaterial({ color: 0xb98a5c });
  const thatch = new THREE.MeshLambertMaterial({ color: 0xc9a44e, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
  const hut = (x, z, ry, w, d) => {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), mud);
    walls.position.y = 1.2; walls.castShadow = walls.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.9, 4), thatch);
    roof.rotation.y = Math.PI / 4; roof.scale.set(w * 0.86, 1, d * 0.86); roof.position.y = 3.3; roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), dark);
    door.position.set(0, 0.86, d / 2 + 0.01);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), dark);
    win.position.set(w * 0.3, 1.5, d / 2 + 0.01);
    g.add(walls, roof, door, win);
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
  };
  hut(-(fx + 5), -(fz + 4), 0.7, 5, 3.6); hut(-(fx + 8), -8, 1.2, 4.2, 3.4); hut(fx + 5, -(fz + 4), -0.6, 5.2, 3.8);
  hut(fx + 7, fz - 2, -2.4, 4.4, 3.4); hut(-(fx + 5), fz + 3, 2.5, 4.8, 3.6);

  // haystacks, clay pots
  const hay = new THREE.MeshLambertMaterial({ color: 0xd8b85a, flatShading: true });
  for (const [x, z, s] of [[-(fx + 3.5), -15, 1.5], [fx + 3.5, 8, 1.8], [fx + 4, -14, 1.3]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6, 0, 7, 0, Math.PI * 0.6), hay);
    m.scale.set(s, s * 1.5, s); m.position.set(x, 0, z); m.castShadow = true; scene.add(m);
  }
  const clay = new THREE.MeshLambertMaterial({ color: 0xa5532e });
  for (const [x, z] of [[-(fx + 2.2), -(fz + 1.6)], [-(fx + 1.6), -(fz + 0.9)], [fx + 2.4, -(fz + 1.5)]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), clay);
    m.scale.y = 1.1; m.position.set(x, 0.34, z); m.castShadow = true; scene.add(m);
  }

  // pond
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshPhongMaterial({ color: 0x3f93ad, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.92 }));
  pond.rotation.x = -Math.PI / 2; pond.scale.set(11, 7, 1); pond.position.set(8, 0.03, -(fz + 13));
  scene.add(pond);

  // obstacles on the field (positions and sizes come from config.OBSTACLES, the physics uses the same list)
  const stone = new THREE.MeshLambertMaterial({ color: 0x9b8f84, flatShading: true });
  const water = new THREE.MeshLambertMaterial({ color: 0x2f6f86 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x3f8a3a, flatShading: true });
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  for (const o of OBSTACLES) {
    if (o.kind === 'hay') {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 1.04, o.h * 0.72, 14), hay));
      body.position.set(o.x, o.h * 0.36, o.z);
      const top = add(new THREE.Mesh(new THREE.SphereGeometry(o.r, 14, 6, 0, 7, 0, Math.PI / 2), hay));
      top.scale.y = (o.h * 0.28) / o.r; top.position.set(o.x, o.h * 0.72, o.z);
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.02, o.r * 1.05, 0.08, 14), wood), false);
      band.position.set(o.x, o.h * 0.4, o.z);
    } else if (o.kind === 'well') {
      const wall = add(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 1.05, o.h, 12, 1, true), stone.clone()));
      wall.material.side = THREE.DoubleSide; wall.position.set(o.x, o.h / 2, o.z);
      const rim = add(new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.94, 0.1, 6, 14), stone));
      rim.rotation.x = Math.PI / 2; rim.position.set(o.x, o.h, o.z);
      const w = add(new THREE.Mesh(new THREE.CircleGeometry(o.r * 0.9, 14), water), false);
      w.rotation.x = -Math.PI / 2; w.position.set(o.x, o.h * 0.7, o.z);
    } else if (o.kind === 'pots') {
      const big = add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 9), clay));
      big.scale.y = o.h / 1.0; big.position.set(o.x - 0.22, o.h * 0.5, o.z + 0.1);
      const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.16, 10), clay), false);
      neck.position.set(o.x - 0.22, o.h + 0.03, o.z + 0.1);
      const p2 = add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), clay));
      p2.position.set(o.x + 0.42, 0.36, o.z - 0.25);
      const p3 = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), clay));
      p3.position.set(o.x + 0.3, 0.3, o.z + 0.48);
    } else { // tree: the trunk blocks, the crown is high above the players
      const trunk = add(new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.8, o.r, o.h * 0.7, 8), trunkMat));
      trunk.position.set(o.x, o.h * 0.35, o.z);
      for (let k = 0; k < 3; k++) {
        const b = add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 + r() * 0.7, 1), leaf));
        b.position.set(o.x + (k - 1) * 1.3, o.h * 0.75 + (k === 1 ? 0.9 : 0), o.z + (r() - 0.5) * 1.6);
        b.scale.y = 0.8;
      }
    }
  }

  // far hills and clouds
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x5d8a55, flatShading: true });
  const hills = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), hillMat, 16);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.2, d = 190 + r() * 60;
    set(hills, i, Math.cos(a) * d, -6, Math.sin(a) * d, 0, r() * 6, 0, 50 + r() * 45, 16 + r() * 22, 40 + r() * 30);
  }
  scene.add(hills);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), cloudMat, 18);
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.3, d = 120 + r() * 140, y = 70 + r() * 40;
    for (let k = 0; k < 3; k++) set(clouds, i * 3 + k, Math.cos(a) * d + (k - 1) * 14, y + (k === 1 ? 3 : 0), Math.sin(a) * d + r() * 6, 0, 0, 0, 14 + r() * 8, 5 + r() * 2, 9 + r() * 4);
  }
  scene.add(clouds);

  return { sun, clouds };
}
