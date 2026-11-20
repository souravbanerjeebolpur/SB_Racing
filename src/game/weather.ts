import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';
import type { WeatherType } from './types';

const RAIN_COUNT = 420;
const MIST_COUNT = 18;
const RAIN_BOX_XZ = 52;
const RAIN_BOX_Y = 24;
const MIST_BOX_XZ = 115;

const _dummy = new THREE.Object3D();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

function wrapCoord(val: number, center: number, span: number): number {
  const half = span * 0.5;
  let rel = val - center;
  rel = ((rel + half) % span + span) % span - half;
  return center + rel;
}

export class WeatherSystem {
  public readonly group = new THREE.Group();

  public activeWeather: WeatherType = 'clear';
  public targetWeather: WeatherType = 'clear';
  public rainIntensity = 0; // 0..1
  public fogIntensity = 0;  // 0..1
  public wetness = 0;       // 0..1 road surface wetness
  public roadGripMult = 1.0;

  private shiftScheduled = false;
  private shiftTimer = 0;
  private hasShiftedThisRace = false;

  // Rain streaks instanced pool
  private rainGeo: THREE.BoxGeometry;
  private rainMat: THREE.MeshBasicMaterial;
  private rainMesh: THREE.InstancedMesh;
  private rainX = new Float32Array(RAIN_COUNT);
  private rainY = new Float32Array(RAIN_COUNT);
  private rainZ = new Float32Array(RAIN_COUNT);
  private rainSpeed = new Float32Array(RAIN_COUNT);

  // Volumetric drifting fog wisps
  private mistGeo: THREE.PlaneGeometry;
  private mistMat: THREE.MeshBasicMaterial;
  private mistMesh: THREE.InstancedMesh;
  private mistX = new Float32Array(MIST_COUNT);
  private mistY = new Float32Array(MIST_COUNT);
  private mistZ = new Float32Array(MIST_COUNT);
  private mistDriftX = new Float32Array(MIST_COUNT);
  private mistDriftZ = new Float32Array(MIST_COUNT);
  private mistScale = new Float32Array(MIST_COUNT);

  constructor(textures: ProceduralTextureSet) {
    // 1. Rain Streak InstancedMesh
    this.rainGeo = new THREE.BoxGeometry(0.022, 1.35, 0.022);
    this.rainMat = new THREE.MeshBasicMaterial({
      color: 0xd8eeff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      fog: false,
    });
    this.rainMesh = new THREE.InstancedMesh(this.rainGeo, this.rainMat, RAIN_COUNT);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainMesh.visible = false;

    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainX[i] = (Math.random() - 0.5) * RAIN_BOX_XZ;
      this.rainY[i] = Math.random() * RAIN_BOX_Y;
      this.rainZ[i] = (Math.random() - 0.5) * RAIN_BOX_XZ;
      this.rainSpeed[i] = 24 + Math.random() * 10;
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.group.add(this.rainMesh);

    // 2. Volumetric Coastal Fog Wisps
    this.mistGeo = new THREE.PlaneGeometry(22, 8);
    this.mistMat = new THREE.MeshBasicMaterial({
      map: textures.smokeParticle,
      color: 0x9fb3c8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      fog: true,
    });
    this.mistMesh = new THREE.InstancedMesh(this.mistGeo, this.mistMat, MIST_COUNT);
    this.mistMesh.frustumCulled = false;
    this.mistMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mistMesh.visible = false;

    for (let i = 0; i < MIST_COUNT; i++) {
      this.mistX[i] = (Math.random() - 0.5) * MIST_BOX_XZ;
      this.mistY[i] = 2.8 + Math.random() * 4.8;
      this.mistZ[i] = (Math.random() - 0.5) * MIST_BOX_XZ;
      this.mistDriftX[i] = (Math.random() - 0.5) * 2.2;
      this.mistDriftZ[i] = (Math.random() - 0.5) * 2.2;
      this.mistScale[i] = 0.8 + Math.random() * 0.7;
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.mistMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.group.add(this.mistMesh);
  }

  private pickRandomWeather(weights: [number, number, number]): WeatherType {
    const [wClear, wRain] = weights;
    const r = Math.random();
    if (r < wClear) return 'clear';
    if (r < wClear + wRain) return 'rain';
    return 'fog';
  }

  private snapToWeather(w: WeatherType): void {
    this.activeWeather = w;
    this.targetWeather = w;
    this.rainIntensity = w === 'rain' ? 1 : 0;
    this.fogIntensity = w === 'fog' ? 1 : w === 'rain' ? 0.28 : 0;
    this.wetness = w === 'rain' ? 1 : w === 'fog' ? 0.36 : 0;
    this.recomputeGrip();
  }

  public rollPreviewWeather(): void {
    const picked = this.pickRandomWeather([0.75, 0.25, 0.0]);
    this.shiftScheduled = false;
    this.hasShiftedThisRace = false;
    this.snapToWeather(picked);
  }

  public rollRaceWeather(): void {
    const picked = this.pickRandomWeather([0.40, 0.36, 0.24]);
    this.snapToWeather(picked);
    this.shiftScheduled = true;
    this.hasShiftedThisRace = false;
    // Dynamic mid-race weather shift occurs 15-26 seconds after green flag
    this.shiftTimer = 15 + Math.random() * 11;
  }

  public clearWeather(): void {
    this.shiftScheduled = false;
    this.snapToWeather('clear');
  }

  private recomputeGrip(): void {
    // Wet rain lowers grip up to -22%; coastal fog dampens road up to -12%
    const rainPenalty = this.wetness * 0.22;
    const fogPenalty = Math.max(0, this.fogIntensity - this.rainIntensity * 0.28) * 0.12;
    this.roadGripMult = THREE.MathUtils.clamp(1.0 - rainPenalty - fogPenalty, 0.78, 1.0);
  }

  public update(
    dt: number,
    focusX: number,
    focusY: number,
    focusZ: number,
    carVx: number,
    carVz: number,
    cameraQuat: THREE.Quaternion,
    raceActive: boolean
  ): { shiftedTo: WeatherType | null } {
    let shiftedTo: WeatherType | null = null;

    if (raceActive && this.shiftScheduled && !this.hasShiftedThisRace) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) {
        this.hasShiftedThisRace = true;
        const options: WeatherType[] = (['clear', 'rain', 'fog'] as WeatherType[]).filter(
          (w) => w !== this.targetWeather
        );
        // Strongly prefer rain or fog when transitioning away from clear
        if (this.targetWeather === 'clear') {
          this.targetWeather = Math.random() < 0.55 ? 'rain' : 'fog';
        } else {
          this.targetWeather = options[Math.floor(Math.random() * options.length)];
        }
        shiftedTo = this.targetWeather;
      }
    }

    // Smoothly damp target weather intensities (takes ~4-5 seconds to transition)
    const goalRain = this.targetWeather === 'rain' ? 1.0 : 0.0;
    const goalFog = this.targetWeather === 'fog' ? 1.0 : this.targetWeather === 'rain' ? 0.28 : 0.0;
    const goalWet = this.targetWeather === 'rain' ? 1.0 : this.targetWeather === 'fog' ? 0.36 : 0.0;

    this.rainIntensity = THREE.MathUtils.damp(this.rainIntensity, goalRain, 0.65, dt);
    this.fogIntensity = THREE.MathUtils.damp(this.fogIntensity, goalFog, 0.55, dt);
    const wetRate = goalWet > this.wetness ? 0.48 : 0.22;
    this.wetness = THREE.MathUtils.damp(this.wetness, goalWet, wetRate, dt);
    this.recomputeGrip();

    if (this.rainIntensity > 0.45) {
      this.activeWeather = 'rain';
    } else if (this.fogIntensity > 0.45) {
      this.activeWeather = 'fog';
    } else {
      this.activeWeather = 'clear';
    }

    // Update 3D Rain Streaks around focus position
    if (this.rainIntensity > 0.02) {
      this.rainMesh.visible = true;
      this.rainMat.opacity = 0.44 * this.rainIntensity;
      const visibleCount = Math.max(1, Math.round(RAIN_COUNT * this.rainIntensity));

      // Tilt streaks opposite car motion for high-speed wind shear feel
      const windX = THREE.MathUtils.clamp(-carVx * 0.22, -7.5, 7.5) + 1.8;
      const windZ = THREE.MathUtils.clamp(-carVz * 0.22, -7.5, 7.5) + 1.2;
      const tiltZ = THREE.MathUtils.clamp(-windX * 0.022, -0.22, 0.22);
      const tiltX = THREE.MathUtils.clamp(windZ * 0.022, -0.22, 0.22);
      _euler.set(tiltX, 0, tiltZ);
      _quat.setFromEuler(_euler);

      for (let i = 0; i < RAIN_COUNT; i++) {
        if (i >= visibleCount) {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          this.rainMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }

        const spd = this.rainSpeed[i];
        this.rainX[i] = wrapCoord(this.rainX[i] + windX * dt, focusX, RAIN_BOX_XZ);
        this.rainZ[i] = wrapCoord(this.rainZ[i] + windZ * dt, focusZ, RAIN_BOX_XZ);
        this.rainY[i] -= spd * dt;
        const minY = focusY - 1.5;
        if (this.rainY[i] < minY || this.rainY[i] > focusY + RAIN_BOX_Y) {
          this.rainY[i] = focusY + RAIN_BOX_Y - Math.random() * 4;
        }

        _dummy.position.set(this.rainX[i], this.rainY[i], this.rainZ[i]);
        _dummy.quaternion.copy(_quat);
        _dummy.scale.set(1, 0.85 + this.rainIntensity * 0.35, 1);
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.rainMesh.visible = false;
    }

    // Update Volumetric Drifting Mist Wisps in Fog
    const mistStrength = Math.max(0, (this.fogIntensity - 0.12) / 0.88);
    if (mistStrength > 0.03) {
      this.mistMesh.visible = true;
      this.mistMat.opacity = 0.055 * mistStrength;
      for (let i = 0; i < MIST_COUNT; i++) {
        this.mistX[i] = wrapCoord(this.mistX[i] + this.mistDriftX[i] * dt, focusX, MIST_BOX_XZ);
        this.mistZ[i] = wrapCoord(this.mistZ[i] + this.mistDriftZ[i] * dt, focusZ, MIST_BOX_XZ);
        const dx = this.mistX[i] - focusX;
        const dz = this.mistZ[i] - focusZ;
        const nearCarFade = dx * dx + dz * dz < 22 * 22 ? 0.001 : 1.0;
        const s = this.mistScale[i] * (0.75 + mistStrength * 0.45) * nearCarFade;
        _dummy.position.set(this.mistX[i], focusY + this.mistY[i], this.mistZ[i]);
        _dummy.quaternion.copy(cameraQuat);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        this.mistMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.mistMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.mistMesh.visible = false;
    }

    return { shiftedTo };
  }

  public dispose(): void {
    this.rainGeo.dispose();
    this.rainMat.dispose();
    this.mistGeo.dispose();
    this.mistMat.dispose();
  }
}
