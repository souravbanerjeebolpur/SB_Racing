import * as THREE from 'three';
import type { MaterialLibrary } from './materials';
import type { ProceduralTextureSet } from './textures';

interface SmokeItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
}

interface SparkItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

const MAX_SMOKE = 260;
const MAX_SPARKS = 90;
const MAX_SKIDMARKS = 900;

const _dummy = new THREE.Object3D();
const _quat = new THREE.Quaternion();
const _camQuat = new THREE.Quaternion();
const _color = new THREE.Color();

export class DriftEffectsManager {
  public readonly group = new THREE.Group();

  private smokeMesh: THREE.InstancedMesh;
  private smokeGeo: THREE.PlaneGeometry;
  private smokeMat: THREE.MeshBasicMaterial;
  private smokePool: SmokeItem[] = [];
  private smokeCursor = 0;

  private sparkMesh: THREE.InstancedMesh;
  private sparkGeo: THREE.BoxGeometry;
  private sparkMat: THREE.MeshBasicMaterial;
  private sparkPool: SparkItem[] = [];
  private sparkCursor = 0;

  private skidMesh: THREE.InstancedMesh;
  private skidGeo: THREE.PlaneGeometry;
  private skidCursor = 0;
  private skidTimer = 0;

  constructor(textures: ProceduralTextureSet, materials: MaterialLibrary) {
    // 1. Pooled Billboard Tire Smoke
    this.smokeGeo = new THREE.PlaneGeometry(1, 1);
    this.smokeMat = new THREE.MeshBasicMaterial({
      map: textures.smokeParticle,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(this.smokeGeo, this.smokeMat, MAX_SMOKE);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < MAX_SMOKE; i++) {
      this.smokePool.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        size: 1,
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _dummy.matrix);
      this.smokeMesh.setColorAt(i, _color.setHex(0xe2e8f0));
    }
    this.group.add(this.smokeMesh);

    // 2. Pooled Sparks
    this.sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.45);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
    });
    this.sparkMesh = new THREE.InstancedMesh(this.sparkGeo, this.sparkMat, MAX_SPARKS);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparkPool.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 0.4,
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.group.add(this.sparkMesh);

    // 3. Ring-Buffered Tire Skidmarks
    this.skidGeo = new THREE.PlaneGeometry(0.38, 1.45);
    this.skidGeo.rotateX(-Math.PI / 2);
    this.skidMesh = new THREE.InstancedMesh(this.skidGeo, materials.skidmark, MAX_SKIDMARKS);
    this.skidMesh.frustumCulled = false;
    for (let i = 0; i < MAX_SKIDMARKS; i++) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.group.add(this.skidMesh);
  }

  public emitTireSmoke(
    x: number,
    y: number,
    z: number,
    vx: number,
    vz: number,
    intensity: number,
    isWetSpray = false
  ): void {
    const idx = this.smokeCursor;
    const item = this.smokePool[idx];
    this.smokeCursor = (idx + 1) % MAX_SMOKE;
    item.active = true;
    item.x = x + (Math.random() - 0.5) * 0.28;
    item.y = y + (isWetSpray ? 0.24 : 0.16);
    item.z = z + (Math.random() - 0.5) * 0.28;
    item.vx = vx * (isWetSpray ? 0.28 : 0.18) + (Math.random() - 0.5) * 1.6;
    item.vy = (isWetSpray ? 1.2 : 0.8) + Math.random() * 1.2 + intensity * 0.8;
    item.vz = vz * (isWetSpray ? 0.28 : 0.18) + (Math.random() - 0.5) * 1.6;
    item.age = 0;
    item.life = isWetSpray ? 0.35 + Math.random() * 0.25 : 0.65 + Math.random() * 0.55;
    item.size = (isWetSpray ? 0.45 : 0.65) + intensity * 0.75;
    this.smokeMesh.setColorAt(idx, _color.setHex(isWetSpray ? 0xcbe7ff : 0xe2e8f0));
    if (this.smokeMesh.instanceColor) {
      this.smokeMesh.instanceColor.needsUpdate = true;
    }
  }

  public emitSparks(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const item = this.sparkPool[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      item.active = true;
      item.x = x;
      item.y = y;
      item.z = z;
      const angle = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 10;
      item.vx = Math.cos(angle) * spd;
      item.vy = 2.5 + Math.random() * 5.5;
      item.vz = Math.sin(angle) * spd;
      item.age = 0;
      item.life = 0.25 + Math.random() * 0.25;
    }
  }

  public stampSkidmark(x: number, y: number, z: number, yaw: number): void {
    const idx = this.skidCursor;
    this.skidCursor = (this.skidCursor + 1) % MAX_SKIDMARKS;
    _dummy.position.set(x, y + 0.032, z);
    _dummy.rotation.set(0, yaw, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    this.skidMesh.setMatrixAt(idx, _dummy.matrix);
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  public emitCarDrift(
    x: number,
    y: number,
    z: number,
    yaw: number,
    vx: number,
    vz: number,
    slipAngleDeg: number,
    isBraking: boolean,
    speedKmh: number,
    dt: number,
    wetness = 0
  ): void {
    const absSlip = Math.abs(slipAngleDeg);
    const shouldSkid = (absSlip > 11 && speedKmh > 34) || (isBraking && speedKmh > 70);
    const shouldSpray = wetness > 0.28 && speedKmh > 62;
    if (!shouldSkid && !shouldSpray) return;

    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);

    // Rear wheel world positions (-1.36 forward, +/- 0.96 lateral)
    const rlx = x - fx * 1.36 + lx * 0.96;
    const rlz = z - fz * 1.36 + lz * 0.96;
    const rrx = x - fx * 1.36 - lx * 0.96;
    const rrz = z - fz * 1.36 - lz * 0.96;

    this.skidTimer += dt;
    if (this.skidTimer >= 0.024) {
      this.skidTimer = 0;
      if (shouldSkid) {
        if (wetness < 0.65) {
          const moveYaw = Math.atan2(vx, vz);
          this.stampSkidmark(rlx, y, rlz, moveYaw);
          this.stampSkidmark(rrx, y, rrz, moveYaw);
        }
        const intensity = THREE.MathUtils.clamp((absSlip - 10) / 35, 0.25, 1.0);
        const wetSpray = wetness > 0.4;
        this.emitTireSmoke(rlx, y, rlz, vx, vz, intensity, wetSpray);
        this.emitTireSmoke(rrx, y, rrz, vx, vz, intensity, wetSpray);
      } else if (shouldSpray && Math.random() < wetness * 0.7) {
        const sprayInt = THREE.MathUtils.clamp((speedKmh - 60) / 190, 0.15, 0.75) * wetness;
        this.emitTireSmoke(rlx, y, rlz, vx, vz, sprayInt, true);
        this.emitTireSmoke(rrx, y, rrz, vx, vz, sprayInt, true);
      }
    }
  }

  public update(dt: number, camera: THREE.Camera): void {
    _camQuat.copy(camera.quaternion);

    // Update Smoke
    let smokeDirty = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      const s = this.smokePool[i];
      if (!s.active) continue;
      smokeDirty = true;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      const t = s.age / s.life;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vx *= Math.max(0, 1 - 2.2 * dt);
      s.vz *= Math.max(0, 1 - 2.2 * dt);

      const scale = s.size * (0.65 + t * 2.4) * (1 - t * 0.25);
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.quaternion.copy(_camQuat);
      _dummy.scale.set(scale, scale, scale);
      _dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (smokeDirty) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }

    // Update Sparks
    let sparkDirty = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const sp = this.sparkPool[i];
      if (!sp.active) continue;
      sparkDirty = true;
      sp.age += dt;
      if (sp.age >= sp.life) {
        sp.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      sp.vy -= 18 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      const scale = 1 - sp.age / sp.life;
      _dummy.position.set(sp.x, sp.y, sp.z);
      _quat.setFromEuler(_dummy.rotation.set(0, Math.atan2(sp.vx, sp.vz), 0));
      _dummy.quaternion.copy(_quat);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (sparkDirty) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public clearSkidmarks(): void {
    for (let i = 0; i < MAX_SKIDMARKS; i++) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.skidMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidCursor = 0;
  }

  public dispose(): void {
    this.smokeGeo.dispose();
    this.smokeMat.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.skidGeo.dispose();
  }
}
