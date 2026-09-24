// Scene, WebXR session, pointer input (controllers, hands, mouse, touch),
// the study panel, and the screen stack.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { Panel } from './ui/panel.js';
import { C, font } from './ui/theme.js';
import { Environment, STAGE_SEASON } from './env.js';
import { Mascot } from './mascot.js';
import { store } from './core/store.js';

const KEYMAP = {
  Digit1: 'opt1', Digit2: 'opt2', Digit3: 'opt3', Digit4: 'opt4',
  Numpad1: 'opt1', Numpad2: 'opt2', Numpad3: 'opt3', Numpad4: 'opt4',
  Enter: 'next', Space: 'next', Backspace: 'back', Escape: 'back',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyR: 'audio', KeyF: 'furigana',
};

export class App {
  constructor(container, sound) {
    this.container = container;
    this.sound = sound;
    this.stack = [];
    this.needsDraw = true;
    this.toastMsg = null;
    this.toastUntil = 0;
    this.mode = 'idle';
    this.lastT = performance.now();
    this.pointers = [];
    this.bursts = [];
  }

  init() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 900);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.env = new Environment(this.scene);
    this.applySeason();

    // study panel group (panel + mascot shelf)
    this.panelGroup = new THREE.Group();
    this.panel = new Panel(renderer, { w: 2048, h: 1280, meters: 2.0 });
    this.panelGroup.add(this.panel.mesh);
    this.mascot = new Mascot();
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.32), new THREE.MeshLambertMaterial({ color: '#6b4428' }));
    shelf.position.set(-1.28, -0.66, 0.12);
    this.mascot.root.position.set(-1.28, -0.64, 0.12);
    this.mascot.root.rotation.y = 0.35;
    this.panelGroup.add(shelf, this.mascot.root);
    this.scene.add(this.panelGroup);
    this.applyPanelSettings();
    this.placePanelDesktop();

    this.raycaster = new THREE.Raycaster();
    this.setupControllers();
    this.setupMouse();
    this.setupKeys();
    this.setupBurst();

    window.addEventListener('resize', () => this.onResize());
    renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
  }

  applySeason() {
    const s = store.d.settings.season;
    this.env.setSeason(s && s !== 'auto' ? s : STAGE_SEASON[store.d.stage] || 'spring');
  }

  applyPanelSettings() {
    const s = store.d.settings;
    this.panel.resizeMeters(s.panelSize || 2.0);
    const k = (s.panelSize || 2.0) / 2.0;
    this.mascot.root.scale.setScalar(1);
    this.panelGroup.children.forEach((c) => {
      if (c !== this.panel.mesh) {
        c.userData.base = c.userData.base || c.position.clone();
        c.position.copy(c.userData.base).multiply(new THREE.Vector3(k, k, 1));
      }
    });
  }

  // ------------------------------------------------------------ placement
  placePanelDesktop() {
    this.panelGroup.position.set(0, 1.45, -1.6);
    this.panelGroup.rotation.set(0, 0, 0);
    this.fitDesktopCamera();
  }

  fitDesktopCamera() {
    if (this.renderer.xr.isPresenting) return;
    const a = window.innerWidth / window.innerHeight;
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const s = store.d.settings.panelSize || 2.0;
    const ph = (s * 1280) / 2048;
    const dh = ((ph / 2) * 1.12) / Math.tan(half);
    const dw = ((s / 2) * 1.2) / (Math.tan(half) * a);
    const d = Math.max(dh, dw);
    this.camera.position.set(0, 1.45 - ph * 0.03, -1.6 + d);
    this.camera.lookAt(0, 1.45 - ph * 0.03, -1.6);
  }

  recenter() {
    if (!this.renderer.xr.isPresenting) return;
    const cam = this.renderer.xr.getCamera();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    cam.getWorldPosition(p);
    cam.getWorldQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const dist = store.d.settings.panelDist || 1.55;
    const y = Math.max(0.9, p.y - 0.12);
    this.panelGroup.position.set(p.x + fwd.x * dist, y, p.z + fwd.z * dist);
    this.panelGroup.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
    this.panelGroup.rotateX(-0.06);
  }

  // ------------------------------------------------------------ input
  setupControllers() {
    const r = this.renderer;
    const cmf = new XRControllerModelFactory();
    const hmf = new XRHandModelFactory();
    const rayGeo = new THREE.BoxGeometry(0.003, 0.003, 1).translate(0, 0, -0.5);
    for (let i = 0; i < 2; i++) {
      const ctrl = r.xr.getController(i);
      const grip = r.xr.getControllerGrip(i);
      const hand = r.xr.getHand(i);
      const ray = new THREE.Mesh(rayGeo, new THREE.MeshBasicMaterial({ color: '#ffe7a8', transparent: true, opacity: 0.55, depthWrite: false }));
      ray.visible = false;
      ctrl.add(ray);
      const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.011, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }));
      cursor.renderOrder = 5;
      cursor.visible = false;
      this.scene.add(cursor);
      try {
        grip.add(cmf.createControllerModel(grip));
        hand.add(hmf.createHandModel(hand, 'mesh'));
      } catch (e) {
        /* models are optional */
      }
      this.rig.add(ctrl, grip, hand);
      const P = { i, ctrl, ray, cursor, source: null, hover: null, prev: [], axes: [0, 0], stickLatch: false, stickLatchY: false };
      ctrl.addEventListener('connected', (e) => {
        P.source = e.data;
        ray.visible = true;
      });
      ctrl.addEventListener('disconnected', () => {
        P.source = null;
        ray.visible = false;
        cursor.visible = false;
        this.panel.showHighlight(i, null);
      });
      ctrl.addEventListener('select', () => {
        this.activePointer = i;
        if (P.hover) this.activate(P.hover);
      });
      this.pointers.push(P);
    }
  }

  setupMouse() {
    const dom = this.renderer.domElement;
    const ndc = new THREE.Vector2();
    this.mouse = { hover: null, x: 0, y: 0, active: false };
    const update = (e) => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycastPanel();
      const h = hit ? this.panel.hitAt(hit.x, hit.y) : null;
      this.mouse.hover = h;
      this.panel.showHighlight(0, h);
      dom.style.cursor = h ? 'pointer' : 'default';
      return h;
    };
    dom.addEventListener('pointermove', (e) => {
      if (this.renderer.xr.isPresenting) return;
      update(e);
    });
    dom.addEventListener('pointerdown', (e) => {
      if (this.renderer.xr.isPresenting) return;
      this.sound.unlock();
      this.downHit = update(e);
    });
    dom.addEventListener('pointerup', (e) => {
      if (this.renderer.xr.isPresenting) return;
      const h = update(e);
      const d = this.downHit;
      if (h && d && h.x === d.x && h.y === d.y && h.w === d.w) this.activate(h);
      this.downHit = null;
      if (e.pointerType === 'touch') this.panel.showHighlight(0, null);
    });
    dom.addEventListener('wheel', (e) => {
      if (this.renderer.xr.isPresenting) return;
      this.key(e.deltaY > 0 ? 'down' : 'up');
    }, { passive: true });
  }

  setupKeys() {
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'idle') return;
      const k = KEYMAP[e.code];
      if (!k) return;
      e.preventDefault();
      this.sound.unlock();
      this.key(k);
    });
  }

  raycastPanel() {
    const hits = this.raycaster.intersectObject(this.panel.mesh, false);
    if (!hits.length || !hits[0].uv) return null;
    const px = this.panel.uvToPx(hits[0].uv);
    return { ...px, point: hits[0].point, face: hits[0].face };
  }

  activate(hit) {
    if (!hit?.onClick) return;
    this.sound.sfx(hit.sfx || 'click');
    const p = this.pointers[this.activePointer ?? 1];
    const hand = p?.source?.handedness;
    this.haptic(hand, 0.25, 25);
    hit.onClick();
    this.redraw();
  }

  // test / automation helper: click the first hit whose label contains text
  clickLabel(text) {
    if (this.needsDraw) {
      this.needsDraw = false;
      this.draw();
    }
    const h = this.panel.ui.hits.find((x) => x.label && String(x.label).includes(text));
    if (h) this.activate(h);
    return !!h;
  }

  key(k) {
    // make sure hit regions belong to the current state before matching keys
    if (this.needsDraw) {
      this.needsDraw = false;
      this.draw();
    }
    const s = this.screen;
    if (s?.onKey && s.onKey(k)) {
      this.redraw();
      return;
    }
    const h = this.panel.ui.hits.find((x) => x.key === k);
    if (h) {
      this.activate(h);
      return;
    }
    if (k === 'back' && this.stack.length > 1) this.back();
  }

  haptic(hand, v, ms) {
    for (const P of this.pointers) {
      if (hand && P.source?.handedness !== hand) continue;
      const act = P.source?.gamepad?.hapticActuators?.[0];
      try {
        act?.pulse?.(v, ms);
      } catch (e) {
        /* no haptics */
      }
    }
  }

  pollGamepads() {
    for (const P of this.pointers) {
      const gp = P.source?.gamepad;
      if (!gp) continue;
      const b = gp.buttons.map((x) => !!x?.pressed);
      const was = (i) => P.prev[i];
      const now = (i) => b[i] && !was(i);
      if (now(4)) this.key('next'); // A / X
      if (now(5)) this.key('back'); // B / Y
      if (now(3) || now(1)) this.recenter(); // stick press / grip
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      if (!P.stickLatch && Math.abs(ax) > 0.75) {
        P.stickLatch = true;
        this.key(ax > 0 ? 'right' : 'left');
      } else if (Math.abs(ax) < 0.3) P.stickLatch = false;
      if (!P.stickLatchY && Math.abs(ay) > 0.75) {
        P.stickLatchY = true;
        this.key(ay > 0 ? 'down' : 'up');
      } else if (Math.abs(ay) < 0.3) P.stickLatchY = false;
      P.prev = b;
    }
  }

  updatePointers() {
    const m = new THREE.Matrix4();
    for (const P of this.pointers) {
      if (!P.source || !this.renderer.xr.isPresenting) continue;
      m.identity().extractRotation(P.ctrl.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(P.ctrl.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
      const hit = this.raycastPanel();
      let h = null;
      if (hit) {
        h = this.panel.hitAt(hit.x, hit.y);
        const d = this.raycaster.ray.origin.distanceTo(hit.point);
        P.ray.scale.z = d;
        P.cursor.visible = true;
        P.cursor.position.copy(hit.point);
        P.cursor.quaternion.copy(this.panelGroup.quaternion);
        P.cursor.material.color.set(h ? C.accent2 : '#ffffff');
      } else {
        P.ray.scale.z = 0.6;
        P.cursor.visible = false;
      }
      if (h !== P.hover) {
        P.hover = h;
        if (h) this.haptic(P.source.handedness, 0.08, 12);
      }
      this.panel.showHighlight(P.i, h);
    }
  }

  // ------------------------------------------------------------ screens
  get screen() {
    return this.stack[this.stack.length - 1];
  }

  go(s) {
    this.screen?.pause?.();
    this.stack.push(s);
    s.enter?.();
    this.redraw();
  }

  replace(s) {
    const old = this.stack.pop();
    old?.exit?.();
    this.stack.push(s);
    s.enter?.();
    this.redraw();
  }

  back() {
    if (this.stack.length <= 1) return;
    const old = this.stack.pop();
    old.exit?.();
    this.sound.stop();
    this.screen.resume?.();
    this.redraw();
  }

  home() {
    while (this.stack.length > 1) this.stack.pop().exit?.();
    this.sound.stop();
    this.screen.resume?.();
    this.redraw();
  }

  redraw() {
    this.needsDraw = true;
  }

  toast(msg, ms = 2200) {
    this.toastMsg = msg;
    this.toastUntil = performance.now() + ms;
    this.redraw();
  }

  draw() {
    const ui = this.panel.ui;
    ui.furigana = store.d.settings.furigana !== 'off';
    ui.begin();
    try {
      this.screen?.draw(ui);
    } catch (e) {
      console.error(e);
      ui.text(`오류: ${e.message}`, 60, 640, { size: 34, color: C.ng });
      ui.button(60, 700, 300, 90, '홈으로', () => this.home());
    }
    if (this.toastMsg && performance.now() < this.toastUntil) {
      const w = Math.min(1500, ui.measure(this.toastMsg, 36, 600) + 90);
      ui.rect((ui.w - w) / 2, 128, w, 86, 43, 'rgba(10,12,20,0.94)', C.accent2, 3);
      ui.text(this.toastMsg, ui.w / 2, 172, { size: 36, weight: 600, align: 'center', maxW: w - 60 });
    }
    this.panel.commit();
    // hover targets changed
    for (const P of this.pointers) P.hover = null;
    if (this.mouse?.hover) {
      this.mouse.hover = null;
      this.panel.showHighlight(0, null);
    }
  }

  // ------------------------------------------------------------ celebration burst
  setupBurst() {
    const N = 160;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false });
    this.burstPts = new THREE.Points(geo, mat);
    this.burstPts.frustumCulled = false;
    this.burstPts.visible = false;
    this.panelGroup.add(this.burstPts);
    this.burstVel = new Float32Array(N * 3);
    this.burstT = 0;
  }

  burst(big = false) {
    const pos = this.burstPts.geometry.attributes.position;
    const col = this.burstPts.geometry.attributes.color;
    const cols = [C.accent, C.accent2, '#ffffff', C.kana, C.ok].map((c) => new THREE.Color(c));
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (Math.random() - 0.5) * 0.3, 0.55 + Math.random() * 0.1, 0.15);
      const a = Math.random() * Math.PI * 2;
      const sp = (big ? 1.6 : 0.9) * (0.4 + Math.random());
      this.burstVel[i * 3] = Math.cos(a) * sp;
      this.burstVel[i * 3 + 1] = Math.abs(Math.sin(a)) * sp + 0.6;
      this.burstVel[i * 3 + 2] = (Math.random() * 0.6 + 0.2) * sp;
      const c = cols[i % cols.length];
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.burstPts.visible = true;
    this.burstPts.material.opacity = 1;
    this.burstT = big ? 2.4 : 1.4;
  }

  updateBurst(dt) {
    if (this.burstT <= 0) return;
    this.burstT -= dt;
    const pos = this.burstPts.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      this.burstVel[i * 3 + 1] -= 2.2 * dt;
      pos.setXYZ(i, pos.getX(i) + this.burstVel[i * 3] * dt, pos.getY(i) + this.burstVel[i * 3 + 1] * dt, pos.getZ(i) + this.burstVel[i * 3 + 2] * dt);
    }
    pos.needsUpdate = true;
    this.burstPts.material.opacity = Math.min(1, this.burstT);
    if (this.burstT <= 0) this.burstPts.visible = false;
  }

  // ------------------------------------------------------------ session
  async startVR() {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.xr.setFramebufferScaleFactor(1.25);
    await this.renderer.xr.setSession(session);
    try {
      this.renderer.xr.setFoveation(0.2);
    } catch (e) {
      /* foveation unsupported */
    }
    this.mode = 'vr';
    this.sound.unlock();
    this.needRecenter = 3;
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    const ref = this.renderer.xr.getReferenceSpace();
    ref?.addEventListener?.('reset', () => {
      this.needRecenter = 2;
    });
    session.addEventListener('end', () => {
      this.mode = 'flat';
      this.placePanelDesktop();
      for (const P of this.pointers) {
        P.cursor.visible = false;
        this.panel.showHighlight(P.i, null);
      }
      this.onExitVR?.();
    });
    this.redraw();
  }

  startFlat() {
    this.mode = 'flat';
    this.sound.unlock();
    this.placePanelDesktop();
    this.redraw();
  }

  onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.fitDesktopCamera();
  }

  loop() {
    const t = performance.now();
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    const xr = this.renderer.xr.isPresenting;
    if (xr && this.needRecenter) {
      this.needRecenter--;
      if (this.needRecenter === 0) this.recenter();
    }
    if (xr) {
      this.pollGamepads();
      this.updatePointers();
    }
    this.screen?.tick?.(dt);
    if (this.toastMsg && performance.now() >= this.toastUntil) {
      this.toastMsg = null;
      this.redraw();
    }
    if (this.needsDraw) {
      this.needsDraw = false;
      this.draw();
    }
    const px = xr ? 1400 : this.renderer.domElement.height * 0.9;
    this.env.update(dt, px);
    this.mascot.update(dt);
    this.updateBurst(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

export { font };
