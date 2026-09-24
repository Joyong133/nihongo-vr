// A small Japanese garden around the study deck. The season follows the
// learner's stage: 문자·N5 spring → N4 summer → N3 autumn → N2 winter → N1 night.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SEASONS = {
  spring: {
    name: '봄', top: '#6fa8e0', horizon: '#f7dbe4', ground: '#86b066', ground2: '#6f9c55', canopy: ['#f7c6d9', '#f2a7c3', '#fbd9e6', '#f5b8cf'],
    particle: { color: '#ffc4d8', size: 0.07, speed: 0.35, count: 420, kind: 0 }, sun: '#fff1e0', hemi: 0.95, lanterns: 0.2,
  },
  summer: {
    name: '여름', top: '#3f86d6', horizon: '#d4ecf8', ground: '#5d9e46', ground2: '#4d8a3a', canopy: ['#4f9a45', '#62ad4f', '#3f8a3c', '#73b95a'],
    particle: { color: '#fff7c0', size: 0.04, speed: 0.05, count: 160, kind: 1 }, sun: '#ffffff', hemi: 1.0, lanterns: 0.2,
  },
  autumn: {
    name: '가을', top: '#628fc4', horizon: '#f4d3a4', ground: '#a8995a', ground2: '#8e7f45', canopy: ['#d9542b', '#e8812f', '#c9412f', '#f0b13d'],
    particle: { color: '#ec7a33', size: 0.08, speed: 0.45, count: 300, kind: 0 }, sun: '#ffe2bb', hemi: 0.9, lanterns: 0.3,
  },
  winter: {
    name: '겨울', top: '#8ea8c6', horizon: '#e9eef5', ground: '#eef2f6', ground2: '#dfe6ee', canopy: ['#f4f7fa', '#e3e9ef', '#d7dfe8', '#ffffff'],
    particle: { color: '#ffffff', size: 0.05, speed: 0.6, count: 700, kind: 2 }, sun: '#f4f7ff', hemi: 1.0, lanterns: 0.35,
  },
  night: {
    name: '밤', top: '#070d24', horizon: '#26365f', ground: '#1f2d2a', ground2: '#18241f', canopy: ['#9a6079', '#b0708a', '#86506a', '#c287a0'],
    particle: { color: '#d8ff8a', size: 0.05, speed: 0.04, count: 220, kind: 1 }, sun: '#9fb4ff', hemi: 0.4, lanterns: 1.0, stars: true,
  },
  gold: {
    name: '노을', top: '#4d5aa8', horizon: '#ffc27a', ground: '#9c8a50', ground2: '#857340', canopy: ['#f7c6d9', '#f2a7c3', '#ffd7a8', '#f5b8cf'],
    particle: { color: '#ffd28a', size: 0.06, speed: 0.3, count: 380, kind: 0 }, sun: '#ffb870', hemi: 0.85, lanterns: 0.8,
  },
};
export const STAGE_SEASON = { kana: 'spring', n5: 'spring', n4: 'summer', n3: 'autumn', n2: 'winter', n1: 'night', done: 'gold' };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function colored(geo, color) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  const r = rng(7);
  for (let i = 0; i < 8; i++) {
    const base = 120 + r() * 30;
    g.fillStyle = `rgb(${base + 40},${base - 5},${base - 50})`;
    g.fillRect(0, i * 64, 512, 64);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(60,35,15,${0.05 + r() * 0.08})`;
      g.beginPath();
      const y = i * 64 + r() * 64;
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + r() * 6 - 3, 340, y + r() * 6 - 3, 512, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(40,20,10,0.55)';
    g.fillRect(0, i * 64, 512, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
  col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.2, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(s, 900.0) * 1.2 + pow(s, 12.0) * 0.18);
  if (uStars > 0.0) {
    vec3 q = floor(d * 220.0);
    float st = step(0.9965, hash(q)) * smoothstep(0.05, 0.4, h);
    col += vec3(st) * uStars;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const partVert = /* glsl */ `
uniform float uTime; uniform float uSize; uniform float uSpeed; uniform float uKind; uniform float uPixel;
attribute vec4 seed;
varying float vAlpha; varying float vRot;
void main() {
  vec3 p = position;
  float t = uTime * uSpeed + seed.x * 40.0;
  if (uKind < 0.5) {            // falling petals / leaves: sway
    p.y = mod(p.y - t, 12.0) - 1.0;
    p.x += sin(t * 1.3 + seed.y * 6.28) * 0.6;
    p.z += cos(t * 0.9 + seed.z * 6.28) * 0.6;
  } else if (uKind < 1.5) {     // fireflies: wander
    p.x += sin(uTime * 0.3 + seed.y * 20.0) * 1.2;
    p.y = 0.4 + mod(p.y, 3.0) + sin(uTime * 0.7 + seed.z * 12.0) * 0.4;
    p.z += cos(uTime * 0.25 + seed.x * 20.0) * 1.2;
  } else {                      // snow: straight down, light drift
    p.y = mod(p.y - t * 1.6, 12.0) - 1.0;
    p.x += sin(t * 0.7 + seed.y * 6.28) * 0.25;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixel / -mv.z;
  vAlpha = uKind > 0.5 && uKind < 1.5 ? 0.35 + 0.65 * abs(sin(uTime * 1.7 + seed.w * 30.0)) : 0.9;
  vRot = seed.w * 6.28 + uTime * (seed.y - 0.5);
}`;
const partFrag = /* glsl */ `
uniform vec3 uColor; uniform float uKind;
varying float vAlpha; varying float vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (uKind < 0.5) {
    float cs = cos(vRot), sn = sin(vRot);
    c = mat2(cs, -sn, sn, cs) * c;
    a = 1.0 - smoothstep(0.18, 0.24, length(c * vec2(1.0, 2.1)));
  } else {
    a = 1.0 - smoothstep(0.0, 0.5, length(c));
    a *= a;
  }
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a * vAlpha);
}`;

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.time = 0;
    this.buildSky();
    this.buildGround();
    this.buildDeck();
    this.buildScenery();
    this.buildTrees();
    this.buildParticles();
    this.hemi = new THREE.HemisphereLight('#ffffff', '#445533', 1.0);
    this.sunLight = new THREE.DirectionalLight('#ffffff', 1.4);
    this.sunLight.position.set(-30, 50, 20);
    scene.add(this.hemi, this.sunLight);
    scene.fog = new THREE.Fog('#ffffff', 35, 190);
    this.season = null;
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(-0.5, 0.35, -0.6) },
        uStars: { value: 0 },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.root.add(sky);
    // moon (night only)
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false }));
    this.moon.position.set(-160, 120, -200);
    this.moon.lookAt(0, 0, 0);
    this.root.add(this.moon);
  }

  buildGround() {
    const geo = new THREE.CircleGeometry(260, 64, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    this.groundMat = new THREE.MeshLambertMaterial({ color: '#86b066' });
    const g = new THREE.Mesh(geo, this.groundMat);
    g.position.y = -0.02;
    this.root.add(g);
    // gravel path & raked sand ring around the deck
    const sand = new THREE.Mesh(new THREE.RingGeometry(3.6, 5.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d8d0bd' }));
    sand.position.y = 0.0;
    this.sandMat = sand.material;
    this.root.add(sand);
  }

  buildDeck() {
    const tex = plankTexture();
    tex.repeat.set(1, 2);
    const wood = new THREE.MeshLambertMaterial({ map: tex });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.16, 6), wood);
    deck.position.y = -0.08;
    this.root.add(deck);
    const dark = new THREE.MeshLambertMaterial({ color: '#4a2f1d' });
    const parts = [];
    // posts and a low rail on three sides (open towards the panel)
    for (const [x, z] of [[-2.9, 2.9], [2.9, 2.9], [-2.9, -2.9], [2.9, -2.9], [-2.9, 0], [2.9, 0]]) {
      parts.push(new THREE.BoxGeometry(0.14, 0.9, 0.14).translate(x, 0.45, z));
    }
    parts.push(new THREE.BoxGeometry(5.9, 0.08, 0.1).translate(0, 0.72, 2.9));
    parts.push(new THREE.BoxGeometry(0.1, 0.08, 5.9).translate(-2.9, 0.72, 0));
    parts.push(new THREE.BoxGeometry(0.1, 0.08, 5.9).translate(2.9, 0.72, 0));
    const rail = new THREE.Mesh(mergeGeometries(parts), dark);
    this.root.add(rail);
    // zabuton cushion
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: '#8c2f39' }));
    cushion.position.set(0, 0.05, 0.25);
    this.root.add(cushion);
  }

  buildScenery() {
    const r = rng(42);
    // distant mountain ring
    const mountains = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.1;
      const d = 190 + r() * 40;
      const h = 22 + r() * 30;
      const rad = 30 + r() * 25;
      mountains.push(colored(new THREE.ConeGeometry(rad, h, 7).translate(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d), '#7f93ad'));
    }
    this.mountains = new THREE.Mesh(mergeGeometries(mountains), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.root.add(this.mountains);
    // Mt. Fuji, front-left
    const fuji = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 75, 48, 40, 1, true), new THREE.MeshLambertMaterial({ color: '#5f7597' }));
    body.position.y = 22;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 26, 15, 40, 1, false), new THREE.MeshLambertMaterial({ color: '#f4f6fb' }));
    cap.position.y = 38.5;
    fuji.add(body, cap);
    fuji.position.set(-120, -2, -135);
    this.fujiBody = body.material;
    this.root.add(fuji);

    // torii
    const red = new THREE.MeshLambertMaterial({ color: '#d0402a' });
    const black = new THREE.MeshLambertMaterial({ color: '#241c1a' });
    const torii = new THREE.Group();
    const pillarGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.22, 0.26, 5, 12).translate(-2, 2.5, 0),
      new THREE.CylinderGeometry(0.22, 0.26, 5, 12).translate(2, 2.5, 0),
      new THREE.BoxGeometry(5.2, 0.3, 0.35).translate(0, 4.1, 0),
      new THREE.BoxGeometry(0.2, 0.7, 0.2).translate(0, 4.6, 0),
    ]);
    torii.add(new THREE.Mesh(pillarGeo, red));
    const top = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.35, 0.55), black);
    top.position.y = 5.12;
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.25, 0.45), red);
    top2.position.y = 4.88;
    torii.add(top, top2);
    torii.position.set(9, 0, -16);
    torii.rotation.y = -0.45;
    this.root.add(torii);

    // stone lanterns (tōrō)
    const stone = new THREE.MeshLambertMaterial({ color: '#8a8d8f', flatShading: true });
    this.lanternGlow = new THREE.MeshBasicMaterial({ color: '#ffcf7a' });
    const toroGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.35, 0.45, 0.2, 6).translate(0, 0.1, 0),
      new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8).translate(0, 0.6, 0),
      new THREE.CylinderGeometry(0.34, 0.24, 0.14, 6).translate(0, 1.07, 0),
      new THREE.ConeGeometry(0.55, 0.35, 6).translate(0, 1.62, 0),
      new THREE.SphereGeometry(0.1, 8, 6).translate(0, 1.84, 0),
    ]);
    for (const [x, z] of [[-4.4, -3.6], [4.4, -3.6], [-4.6, 3.8]]) {
      const t = new THREE.Mesh(toroGeo, stone);
      t.position.set(x, 0, z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), this.lanternGlow);
      box.position.set(x, 1.3, z);
      this.root.add(t, box);
    }

    // pond
    this.pond = new THREE.Mesh(new THREE.CircleGeometry(4, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#3f7fa8', shininess: 90, specular: '#ffffff' }));
    this.pond.position.set(-8, 0.02, -7);
    this.root.add(this.pond);
    const rocks = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rocks.push(colored(new THREE.DodecahedronGeometry(0.35 + r() * 0.3, 0).translate(-8 + Math.cos(a) * 4.2, 0.1, -7 + Math.sin(a) * 4.2), '#7d7f7c'));
    }
    this.root.add(new THREE.Mesh(mergeGeometries(rocks), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

    // paper lanterns (chōchin) hanging over the deck edge
    this.chochinMat = new THREE.MeshBasicMaterial({ color: '#ff7a55' });
    const ch = [];
    for (let i = 0; i < 5; i++) {
      const x = -2.4 + i * 1.2;
      ch.push(new THREE.SphereGeometry(0.16, 12, 10).scale(1, 1.35, 1).translate(x, 2.55, 2.9));
    }
    this.root.add(new THREE.Mesh(mergeGeometries(ch), this.chochinMat));
    const rope = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.015, 0.015), black);
    rope.position.set(0, 2.8, 2.9);
    this.root.add(rope);
    for (const x of [-2.9, 2.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), new THREE.MeshLambertMaterial({ color: '#4a2f1d' }));
      post.position.set(x, 1.85, 2.9);
      this.root.add(post);
    }
  }

  buildTrees() {
    const r = rng(1234);
    const trunks = [];
    const blobs = [];
    this.blobInfo = [];
    const spots = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + r() * 0.2;
      const d = 9 + r() * 14;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x + 8) < 5 && Math.abs(z + 7) < 5) continue; // pond
      spots.push([x, z]);
    }
    for (const [x, z] of spots) {
      const h = 2.4 + r() * 1.4;
      trunks.push(colored(new THREE.CylinderGeometry(0.14, 0.26, h, 7).translate(x, h / 2, z), '#5a3b26'));
      const n = 4 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const s = 1.0 + r() * 0.8;
        const g = new THREE.IcosahedronGeometry(s, 1).translate(x + (r() - 0.5) * 2.2, h + (r() - 0.2) * 1.2, z + (r() - 0.5) * 2.2);
        blobs.push(g);
        this.blobInfo.push({ count: blobs[blobs.length - 1].attributes.position.count, shade: r() });
      }
    }
    this.root.add(new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    const geo = mergeGeometries(blobs.map((g) => {
      if (g.attributes.uv) g.deleteAttribute('uv');
      return g;
    }));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.canopy = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.root.add(this.canopy);
  }

  buildParticles() {
    const N = 800;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 4);
    const r = rng(99);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (r() - 0.5) * 34;
      pos[i * 3 + 1] = r() * 12;
      pos[i * 3 + 2] = (r() - 0.5) * 34;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.partMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSize: { value: 0.07 }, uSpeed: { value: 0.3 }, uKind: { value: 0 },
        uColor: { value: new THREE.Color('#ffc4d8') }, uPixel: { value: 900 },
      },
      vertexShader: partVert,
      fragmentShader: partFrag,
      transparent: true,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geo, this.partMat);
    this.particles.frustumCulled = false;
    this.root.add(this.particles);
  }

  setSeason(name) {
    const S = SEASONS[name] || SEASONS.spring;
    if (this.season === name) return;
    this.season = name;
    const u = this.skyMat.uniforms;
    u.uTop.value.set(S.top);
    u.uHorizon.value.set(S.horizon);
    u.uSun.value.set(S.sun);
    u.uStars.value = S.stars ? 0.9 : 0;
    this.moon.visible = !!S.stars;
    this.scene.fog.color.set(S.horizon);
    this.groundMat.color.set(S.ground);
    this.sandMat.color.set(name === 'winter' ? '#f4f6f9' : name === 'night' ? '#5c5d66' : '#d8d0bd');
    this.hemi.intensity = S.hemi;
    this.hemi.color.set(name === 'night' ? '#8da0ff' : '#ffffff');
    this.hemi.groundColor.set(S.ground2);
    this.sunLight.intensity = name === 'night' ? 0.25 : 1.4;
    this.sunLight.color.set(S.sun);
    const mcol = new THREE.Color(name === 'night' ? '#1f2a44' : name === 'winter' ? '#b8c6d8' : '#7f93ad');
    const mc = this.mountains.geometry.attributes.color;
    for (let i = 0; i < mc.count; i++) mc.setXYZ(i, mcol.r, mcol.g, mcol.b);
    mc.needsUpdate = true;
    this.fujiBody.color.set(name === 'night' ? '#1c2742' : '#5f7597');
    // canopy colours
    const col = this.canopy.geometry.attributes.color;
    const palette = S.canopy.map((c) => new THREE.Color(c));
    let v = 0;
    for (const b of this.blobInfo) {
      const c = palette[Math.floor(b.shade * palette.length) % palette.length];
      for (let i = 0; i < b.count; i++, v++) col.setXYZ(v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    const P = S.particle;
    const pu = this.partMat.uniforms;
    pu.uColor.value.set(P.color);
    pu.uSize.value = P.size;
    pu.uSpeed.value = P.speed;
    pu.uKind.value = P.kind;
    this.particles.geometry.setDrawRange(0, P.count);
    this.partMat.blending = P.kind === 1 ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.partMat.needsUpdate = true;
    const glow = 0.35 + S.lanterns * 0.65;
    this.lanternGlow.color.setRGB(1.0 * glow, 0.81 * glow, 0.48 * glow);
    this.chochinMat.color.set(S.lanterns > 0.6 ? '#ff8a5c' : '#d9573c');
    this.pond.material.color.set(name === 'night' ? '#16294a' : name === 'winter' ? '#9fc0d8' : '#3f7fa8');
  }

  update(dt, pixelScale) {
    this.time += dt;
    this.partMat.uniforms.uTime.value = this.time;
    if (pixelScale) this.partMat.uniforms.uPixel.value = pixelScale;
  }
}
