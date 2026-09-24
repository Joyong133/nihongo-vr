// A flat canvas-textured panel in 3D space, with per-pointer hover quads.
import * as THREE from 'three';
import { UI } from './ui.js';

const hlVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const hlFrag = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = sdRound(p, uSize * 0.5, uRadius);
  float px = fwidth(d);
  float inside = 1.0 - smoothstep(-px, px, d);
  float border = inside * (1.0 - smoothstep(-px, px, d + uSize.y * 0.045));
  float a = inside * 0.14 + border * 0.95;
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;

function makeHighlight() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 0.02 },
      uColor: { value: new THREE.Color('#ffe7a8') },
      uOpacity: { value: 1 },
    },
    vertexShader: hlVert,
    fragmentShader: hlFrag,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.visible = false;
  m.renderOrder = 2;
  return m;
}

export class Panel {
  constructor(renderer, { w = 2048, h = 1280, meters = 2.0 } = {}) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.generateMipmaps = true;
    this.scale = meters / w;
    this.meters = meters;
    const geo = new THREE.PlaneGeometry(meters, h * this.scale);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.panel = this;
    this.mesh.renderOrder = 1;
    this.highlights = [makeHighlight(), makeHighlight()];
    for (const hl of this.highlights) this.mesh.add(hl);
    this.ui = new UI(this);
  }

  resizeMeters(meters) {
    const s = meters / this.meters;
    this.mesh.scale.setScalar(s);
  }

  commit() {
    this.tex.needsUpdate = true;
  }

  // uv (0..1, y up) → canvas px
  uvToPx(uv) {
    return { x: uv.x * this.w, y: (1 - uv.y) * this.h };
  }

  hitAt(x, y) {
    const hits = this.ui.hits;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  }

  showHighlight(slot, hit) {
    const hl = this.highlights[slot];
    if (!hit) {
      hl.visible = false;
      return;
    }
    const s = this.scale;
    const pad = 4;
    const w = (hit.w + pad * 2) * s;
    const h = (hit.h + pad * 2) * s;
    hl.scale.set(w, h, 1);
    hl.position.set((hit.x + hit.w / 2 - this.w / 2) * s, (this.h / 2 - (hit.y + hit.h / 2)) * s, 0.003);
    hl.material.uniforms.uSize.value.set(w, h);
    hl.material.uniforms.uRadius.value = Math.min(((hit.r ?? 18) + pad) * s, Math.min(w, h) / 2);
    hl.visible = true;
  }
}
