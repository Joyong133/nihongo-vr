// 벚꽃 마을: a walkable Japanese village (built in Blender by tools/vr_village.py)
// for the Quest browser. Quest: left stick walks, right stick snap-turns, grip runs.
// Desktop: click to look around, WASD / arrow keys to walk, Shift to run.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const BASE = './';
// Blender is Z-up and glTF is Y-up: Blender (x, y, z) arrives as (x, z, -y).
// The village entrance at Blender (0, -36) is therefore (0, 36) here, facing -Z (north).
const SPAWN = new THREE.Vector3(0, 0, 36);
const EYE = 1.65;
const WALK = 1.8;
const RUN = 4.0;
const RADIUS = 0.3;
const STEP = 0.5; // highest ledge you can walk up (shrine stairs are 0.3)
const SNAP = THREE.MathUtils.degToRad(30);
const SKY = { top: '#6fa8e0', horizon: '#f4dbe3', bottom: '#cfd9c0' };

// Material names come from Blender. Walk through foliage, water and rice; stand on anything but clouds.
const NO_GROUND = /Cloud/;
const NO_WALL = /Cloud|Petals|Water|Rice|Grass|Dirt|Gravel|Sakura|Pine|Leaf|Noren|Lantern$/;

const $ = (id) => document.getElementById(id);
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

class Village {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = !new URLSearchParams(location.search).has('noshadow');
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.horizon, 90, 480);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1200);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.ground = [];
    this.walls = [];
    this.rayGround = new THREE.Raycaster();
    this.rayWall = new THREE.Raycaster();
    this.rayGround.firstHitOnly = true;
    this.rayWall.firstHitOnly = true;
    this.head = new THREE.Vector3();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.turnLatch = false;
    this.lastT = performance.now();

    this.setupSky();
    this.setupLights();
    this.setupPetals();
    this.setupControllers();
    this.setupDesktop();
    this.resetPosition();
    window.addEventListener('resize', () => this.onResize());
    renderer.setAnimationLoop(() => this.loop());
  }

  // ------------------------------------------------------------ world
  async load(onProgress) {
    const gltf = await new GLTFLoader().loadAsync(`${BASE}models/village_vr.glb`, (e) => {
      if (e.total) onProgress(e.loaded / e.total);
    });
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material.name || '';
      o.geometry.computeBoundsTree();
      // no environment map here, so fully metallic surfaces (gold) would render black
      if (o.material.metalness > 0.5) o.material.metalness = 0.35;
      o.castShadow = !/Cloud|Mountain|Snow|Grass|Water|Petals/.test(name);
      o.receiveShadow = !/Cloud|Mountain|Snow/.test(name);
      if (!NO_GROUND.test(name)) this.ground.push(o);
      if (!NO_WALL.test(name)) this.walls.push(o);
    });
    this.scene.add(gltf.scene);
    this.addSign();
    this.resetPosition();
  }

  setupSky() {
    const uniforms = {
      top: { value: new THREE.Color(SKY.top) },
      horizon: { value: new THREE.Color(SKY.horizon) },
      bottom: { value: new THREE.Color(SKY.bottom) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, min(1.0, -h * 4.0));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight('#d8e8ff', '#a39a88', 1.2));
    const sun = new THREE.DirectionalLight('#fff1e0', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -35;
    s.right = s.top = 35;
    s.near = 1;
    s.far = 160;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    this.sunOffset = new THREE.Vector3(30, 55, 40);
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  setupPetals() {
    const N = 600;
    const pos = new Float32Array(N * 3);
    this.petalSeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 36;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
      this.petalSeed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(16, 16, 15, 9, 0.6, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.PointsMaterial({ color: '#ffc4d8', size: 0.07, map: tex, transparent: true, depthWrite: false, alphaTest: 0.05 });
    this.petals = new THREE.Points(geo, mat);
    this.petals.frustumCulled = false;
    this.scene.add(this.petals);
  }

  addSign() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#6b4428';
    g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#3a2414';
    g.lineWidth = 18;
    g.strokeRect(9, 9, 1006, 622);
    g.fillStyle = '#f6ead2';
    g.textAlign = 'center';
    g.font = "700 92px 'NJP', 'NKR', sans-serif";
    g.fillText('桜の村', 512, 130);
    g.font = "600 46px 'NKR', 'NJP', sans-serif";
    g.fillText('벚꽃 마을에 오신 걸 환영합니다', 512, 205);
    g.textAlign = 'left';
    g.font = "500 40px 'NKR', 'NJP', sans-serif";
    const lines = ['왼쪽 스틱  걷기  (그립을 쥐면 달리기)', '오른쪽 스틱  좌우로 30° 회전', 'A 버튼  입구로 돌아가기', '큰길 끝 다리를 건너면 신사와 5층탑'];
    lines.forEach((t, i) => g.fillText(t, 90, 310 + i * 78));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sign = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.875), new THREE.MeshLambertMaterial({ map: tex }));
    board.position.y = 1.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.95, 0.05), new THREE.MeshLambertMaterial({ color: '#3a2414' }));
    back.position.set(0, 1.45, -0.03);
    const postGeo = new THREE.BoxGeometry(0.08, 1.5, 0.08);
    const postMat = new THREE.MeshLambertMaterial({ color: '#3a2414' });
    for (const x of [-0.6, 0.6]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 0.75, -0.07);
      sign.add(post);
    }
    sign.add(board, back);
    sign.traverse((o) => (o.castShadow = true));
    const y = this.groundAt(2.4, 33.2, 2) ?? 0;
    sign.position.set(2.4, y, 33.2);
    sign.rotation.y = -0.45;
    this.scene.add(sign);
  }

  // ------------------------------------------------------------ input
  setupControllers() {
    const cmf = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const grip = this.renderer.xr.getControllerGrip(i);
      try {
        grip.add(cmf.createControllerModel(grip));
      } catch (e) {
        /* models are optional */
      }
      this.rig.add(grip);
    }
    this.prevA = false;
  }

  setupDesktop() {
    const dom = this.renderer.domElement;
    dom.addEventListener('click', () => {
      if (!this.renderer.xr.isPresenting && this.started && dom.requestPointerLock) dom.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.look(e.movementX, e.movementY);
    });
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.resetPosition();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // touch: drag to look, hold still to walk forward
    let touch = null;
    dom.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touch = { x: t.clientX, y: t.clientY, t0: performance.now(), moved: false };
    });
    dom.addEventListener('touchmove', (e) => {
      if (!touch) return;
      const t = e.touches[0];
      const dx = t.clientX - touch.x;
      const dy = t.clientY - touch.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) touch.moved = true;
      this.look(dx * 2, dy * 2);
      touch.x = t.clientX;
      touch.y = t.clientY;
    });
    dom.addEventListener('touchend', () => (touch = null));
    this.touchWalk = () => touch && !touch.moved && performance.now() - touch.t0 > 350;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.4, 1.4);
  }

  // ------------------------------------------------------------ movement
  groundAt(x, z, fromY) {
    if (!this.ground.length) return 0;
    this.rayGround.set(new THREE.Vector3(x, fromY + STEP, z), DOWN);
    this.rayGround.far = STEP + 40;
    const hit = this.rayGround.intersectObjects(this.ground, false)[0];
    return hit ? hit.point.y : null;
  }

  blocked(x, y, z, dir, dist) {
    for (const h of [0.45, 1.2]) {
      this.rayWall.set(new THREE.Vector3(x, y + h, z), dir);
      this.rayWall.far = dist + RADIUS;
      if (this.rayWall.intersectObjects(this.walls, false).length) return true;
    }
    return false;
  }

  move(dx, dz) {
    const p = this.rig.position;
    const h = this.head;
    for (const [mx, mz] of [
      [dx, 0],
      [0, dz],
    ]) {
      const len = Math.hypot(mx, mz);
      if (len < 1e-6) continue;
      const dir = new THREE.Vector3(mx / len, 0, mz / len);
      if (this.blocked(h.x, p.y, h.z, dir, len)) continue;
      if (this.groundAt(h.x + mx, h.z + mz, p.y) === null) continue; // edge of the world
      p.x += mx;
      p.z += mz;
      h.x += mx;
      h.z += mz;
    }
  }

  followGround(dt) {
    const p = this.rig.position;
    const g = this.groundAt(this.head.x, this.head.z, p.y);
    if (g === null) return;
    p.y = g > p.y ? g : p.y + (g - p.y) * Math.min(1, dt * 10);
  }

  snapTurn(a) {
    const h = this.head;
    const p = this.rig.position;
    const off = new THREE.Vector3(p.x - h.x, 0, p.z - h.z).applyAxisAngle(UP, a);
    p.x = h.x + off.x;
    p.z = h.z + off.z;
    this.rig.rotation.y += a;
  }

  resetPosition() {
    this.rig.position.set(SPAWN.x, this.groundAt(SPAWN.x, SPAWN.z, 5) ?? 0, SPAWN.z);
    this.rig.rotation.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
  }

  readXR() {
    const session = this.renderer.xr.getSession();
    const out = { x: 0, y: 0, run: false, turn: 0, home: false };
    if (!session) return out;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      if (src.handedness === 'left') {
        out.x = Math.abs(ax) > 0.15 ? ax : 0;
        out.y = Math.abs(ay) > 0.15 ? ay : 0;
        out.run = out.run || !!gp.buttons[1]?.pressed;
      } else {
        if (!this.turnLatch && Math.abs(ax) > 0.7) {
          this.turnLatch = true;
          out.turn = ax > 0 ? -SNAP : SNAP;
        } else if (Math.abs(ax) < 0.3) this.turnLatch = false;
        out.run = out.run || !!gp.buttons[1]?.pressed;
        const a = !!gp.buttons[4]?.pressed;
        out.home = a && !this.prevA;
        this.prevA = a;
      }
    }
    return out;
  }

  readDesktop() {
    const k = (...c) => c.some((x) => this.keys.has(x));
    return {
      x: (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
      y: (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0) - (this.touchWalk() ? 1 : 0),
      run: k('ShiftLeft', 'ShiftRight'),
      turn: 0,
      home: false,
    };
  }

  // ------------------------------------------------------------ session
  async startVR() {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    this.renderer.xr.setReferenceSpaceType('local-floor');
    await this.renderer.xr.setSession(session);
    try {
      this.renderer.xr.setFoveation(0.4);
    } catch (e) {
      /* foveation unsupported */
    }
    this.started = true;
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.resetPosition();
    session.addEventListener('end', () => {
      this.startFlat();
      this.onExitVR?.();
    });
  }

  startFlat() {
    this.started = true;
    this.camera.position.set(0, EYE, 0);
    this.onResize();
  }

  onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updatePetals(dt, t) {
    const pos = this.petals.geometry.attributes.position;
    const h = this.head;
    for (let i = 0; i < pos.count; i++) {
      const s = this.petalSeed[i];
      let x = pos.getX(i) + (Math.sin(t * 0.7 + s) * 0.35 + 0.25) * dt;
      let y = pos.getY(i) - (0.35 + (s % 1) * 0.25) * dt;
      let z = pos.getZ(i) + Math.cos(t * 0.5 + s) * 0.3 * dt;
      // keep the petals in a 36 m box around the viewer
      if (x - h.x > 18) x -= 36;
      if (x - h.x < -18) x += 36;
      if (z - h.z > 18) z -= 36;
      if (z - h.z < -18) z += 36;
      if (y < h.y - 2) y += 12;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const xr = this.renderer.xr.isPresenting;
    // In VR three.js copies the headset pose into this camera (relative to the rig) every frame
    const cam = this.camera;

    if (!xr) {
      this.rig.rotation.y = this.yaw;
      this.camera.rotation.set(this.pitch, 0, 0);
    }
    this.rig.updateMatrixWorld(true);
    cam.getWorldPosition(this.head);

    if (this.started && this.ground.length) {
      const input = xr ? this.readXR() : this.readDesktop();
      if (input.home) this.resetPosition();
      if (input.turn) this.snapTurn(input.turn);
      if (input.x || input.y) {
        const q = new THREE.Quaternion();
        cam.getWorldQuaternion(q);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
        fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, UP);
        const speed = (input.run ? RUN : WALK) * dt;
        const mag = Math.min(1, Math.hypot(input.x, input.y));
        const dir = right.multiplyScalar(input.x).addScaledVector(fwd, -input.y);
        if (dir.lengthSq() > 0) {
          dir.normalize().multiplyScalar(speed * mag);
          this.move(dir.x, dir.z);
        }
      }
      this.followGround(dt);
    }

    this.sky.position.copy(this.head);
    this.sun.position.copy(this.head).add(this.sunOffset);
    this.sun.target.position.copy(this.head);
    this.updatePetals(dt, now / 1000);
    this.renderer.render(this.scene, this.camera);
  }
}

async function loadFonts() {
  const faces = [
    new FontFace('NJP', `url(${BASE}fonts/njp.woff2)`, { weight: '100 900' }),
    new FontFace('NKR', `url(${BASE}fonts/nkr.woff2)`, { weight: '100 900' }),
  ];
  const loads = Promise.all(
    faces.map(async (f) => {
      try {
        await f.load();
        document.fonts.add(f);
      } catch (e) {
        console.warn('font load failed, using system font', e);
      }
    })
  );
  // a font that never answers must not hold the page: fall back to system fonts after 8 s
  await Promise.race([loads, new Promise((r) => setTimeout(r, 8000))]);
}

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('iwer')) {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const dev = new XRDevice(metaQuest3);
    dev.installRuntime({ forceInstall: true });
    window.__xrDevice = dev;
  }
  const fill = $('load-fill');
  const msg = $('load-msg');
  let step = '글꼴을 불러오는 중…';
  msg.textContent = step;
  const slow = setTimeout(() => (msg.textContent = `${step} (오래 걸리면 새로고침해 주세요)`), 25000);
  await loadFonts();
  step = '마을을 불러오는 중…';
  msg.textContent = step;
  const village = new Village($('app'));
  window.__village = village;
  await village.load((p) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    msg.textContent = `마을을 불러오는 중… ${Math.round(p * 100)}%`;
  });
  clearTimeout(slow);
  fill.style.width = '100%';
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');

  const btnVR = $('btn-vr');
  const note = $('vr-note');
  let vrOK = false;
  try {
    vrOK = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
  } catch (e) {
    vrOK = false;
  }
  if (vrOK) {
    btnVR.disabled = false;
    note.textContent = '헤드셋을 쓰고 눌러 주세요';
  } else if (!window.isSecureContext) {
    note.textContent = 'VR은 HTTPS 주소에서만 동작합니다';
  }

  const title = $('title-screen');
  btnVR.addEventListener('click', async () => {
    try {
      await village.startVR();
      title.classList.add('hidden');
    } catch (e) {
      console.error(e);
      note.textContent = `VR 시작 실패: ${e.message || e}`;
    }
  });
  $('btn-flat').addEventListener('click', () => {
    village.startFlat();
    title.classList.add('hidden');
  });
  village.onExitVR = () => title.classList.remove('hidden');
  msg.textContent = '';
}

boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = `오류: ${e.message || e}`;
});
