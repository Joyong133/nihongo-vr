// "냥코 선생" — a maneki-neko who cheers you on beside the panel.
import * as THREE from 'three';

export class Mascot {
  constructor() {
    this.root = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: '#fbf7ef' });
    const red = new THREE.MeshLambertMaterial({ color: '#d63a2f' });
    const gold = new THREE.MeshLambertMaterial({ color: '#f2c14e', emissive: '#4a3308' });
    const black = new THREE.MeshBasicMaterial({ color: '#2a2320' });
    const pink = new THREE.MeshBasicMaterial({ color: '#f39bb0' });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), white);
    body.scale.set(1, 1.1, 0.9);
    body.position.y = 0.16;
    this.body = body;
    const head = new THREE.Group();
    head.position.y = 0.4;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), white);
    skull.scale.set(1.15, 1, 1);
    head.add(skull);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 4), white);
      ear.position.set(0.085 * s, 0.13, 0);
      ear.rotation.z = -0.35 * s;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), pink);
      inner.position.set(0.085 * s, 0.125, 0.016);
      inner.rotation.z = -0.35 * s;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), black);
      eye.scale.set(1, 0.55, 0.5);
      eye.position.set(0.055 * s, 0.02, 0.13);
      const whisk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.003), black);
      whisk.position.set(0.11 * s, -0.03, 0.12);
      whisk.rotation.z = 0.15 * s;
      head.add(ear, inner, eye, whisk);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pink);
    nose.position.set(0, -0.015, 0.145);
    head.add(nose);
    this.head = head;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 8, 24), red);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.29;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), gold);
    bell.position.set(0, 0.26, 0.11);
    const koban = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), gold);
    koban.scale.set(0.75, 1, 1.2);
    koban.rotation.x = Math.PI / 2;
    koban.position.set(0.05, 0.14, 0.145);
    // raised beckoning paw
    this.arm = new THREE.Group();
    this.arm.position.set(-0.12, 0.3, 0.04);
    const paw = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 10), white);
    paw.position.y = 0.06;
    this.arm.add(paw);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.04, 24), red);
    base.position.y = 0.0;
    this.root.add(base, body, head, collar, bell, koban, this.arm);
    this.t = 0;
    this.hop = 0;
    this.tilt = 0;
    this.wave = 0;
  }

  cheer() {
    this.hop = 1;
    this.wave = 1.5;
  }

  sad() {
    this.tilt = 1;
  }

  update(dt) {
    this.t += dt;
    this.hop = Math.max(0, this.hop - dt * 2.2);
    this.tilt = Math.max(0, this.tilt - dt * 0.9);
    this.wave = Math.max(0, this.wave - dt);
    const h = Math.sin(this.hop * Math.PI) * 0.08;
    this.body.position.y = 0.16 + h;
    this.head.position.y = 0.4 + h + Math.sin(this.t * 2) * 0.004;
    this.head.rotation.z = Math.sin(this.tilt * Math.PI) * 0.35;
    const beck = Math.sin(this.t * (this.wave > 0 ? 12 : 2.2)) * (this.wave > 0 ? 0.6 : 0.35);
    this.arm.rotation.x = -0.2 + beck;
    this.arm.position.y = 0.3 + h;
  }
}
