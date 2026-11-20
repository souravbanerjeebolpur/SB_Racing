import * as THREE from 'three';
import { createCarMesh, type CarVisualHandle } from './carMesh';
import type { MaterialLibrary } from './materials';
import type { CarSpec, PodiumDriverInfo } from './types';

interface DriverFigure {
  root: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  headGroup: THREE.Group;
  trophyAnchor: THREE.Vector3;
}

export interface CeremonyUpdateResult {
  step: number; // 1 = 3rd, 2 = 2nd, 3 = 1st, 4 = full podium celebration
  headline: string;
  subtext: string;
  cameraPos: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  newlyPresentedPlace: 1 | 2 | 3 | null;
}

const _tmpMat4 = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpScale = new THREE.Vector3(1, 1, 1);

function createNumberPlaqueTexture(num: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.fillStyle = accentHex;
  ctx.font = 'bold 74px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTrophyMesh(
  metalHex: number,
  regGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  regMat: <T extends THREE.Material>(m: T) => T
): THREE.Group {
  const group = new THREE.Group();

  const plinthMat = regMat(
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.25 })
  );
  const metalMat = regMat(
    new THREE.MeshStandardMaterial({
      color: metalHex,
      metalness: 0.94,
      roughness: 0.14,
      emissive: metalHex,
      emissiveIntensity: 0.12,
    })
  );

  // Dark stepped plinth
  const base = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.14, 0.17, 0.12, 16)), plinthMat);
  base.position.y = 0.06;
  group.add(base);

  // Lathe chalice silhouette
  const profile = [
    new THREE.Vector2(0.0, 0.12),
    new THREE.Vector2(0.11, 0.13),
    new THREE.Vector2(0.04, 0.18),
    new THREE.Vector2(0.035, 0.30),
    new THREE.Vector2(0.08, 0.34),
    new THREE.Vector2(0.17, 0.48),
    new THREE.Vector2(0.19, 0.62),
    new THREE.Vector2(0.16, 0.62),
    new THREE.Vector2(0.13, 0.44),
    new THREE.Vector2(0.0, 0.38),
  ];
  const cupGeo = regGeo(new THREE.LatheGeometry(profile, 20));
  const cup = new THREE.Mesh(cupGeo, metalMat);
  cup.castShadow = true;
  group.add(cup);

  // Twin side handles
  const handleGeo = regGeo(new THREE.TorusGeometry(0.085, 0.018, 8, 16, Math.PI * 1.15));
  const handleL = new THREE.Mesh(handleGeo, metalMat);
  handleL.position.set(0.16, 0.5, 0);
  handleL.rotation.z = -Math.PI * 0.55;
  const handleR = new THREE.Mesh(handleGeo, metalMat);
  handleR.position.set(-0.16, 0.5, 0);
  handleR.rotation.z = Math.PI * 0.45;
  group.add(handleL, handleR);

  return group;
}

function createDriverFigure(
  suitColorHex: string,
  accentHex: string,
  isPresenter: boolean,
  regGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  regMat: <T extends THREE.Material>(m: T) => T
): DriverFigure {
  const root = new THREE.Group();

  const suitMat = regMat(
    new THREE.MeshStandardMaterial({
      color: isPresenter ? 0x1e293b : new THREE.Color(suitColorHex),
      roughness: 0.65,
      metalness: 0.12,
    })
  );
  const accentMat = regMat(
    new THREE.MeshStandardMaterial({
      color: isPresenter ? 0xfbbf24 : new THREE.Color(accentHex),
      roughness: 0.4,
      metalness: 0.35,
    })
  );
  const darkMat = regMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 })
  );
  const visorMat = regMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x090d16,
      metalness: 0.25,
      roughness: 0.08,
      clearcoat: 1.0,
    })
  );
  const skinMat = regMat(
    new THREE.MeshStandardMaterial({ color: 0xe2b191, roughness: 0.72 })
  );

  // Boots + Legs
  const legGeo = regGeo(new THREE.CapsuleGeometry(0.085, 0.52, 4, 8));
  const bootGeo = regGeo(new THREE.BoxGeometry(0.14, 0.1, 0.24));
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, suitMat);
    leg.position.set(side * 0.12, 0.44, 0);
    leg.castShadow = true;
    const boot = new THREE.Mesh(bootGeo, darkMat);
    boot.position.set(side * 0.12, 0.05, 0.04);
    root.add(leg, boot);
  }

  // Torso + Racing Belt/Sash
  const torso = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.42, 0.56, 0.24)), suitMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  root.add(torso);

  const chestStripe = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.43, 0.12, 0.25)),
    accentMat
  );
  chestStripe.position.y = 1.12;
  root.add(chestStripe);

  // Head / Helmet
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.52, 0);
  if (isPresenter) {
    const head = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.145, 14, 12)), skinMat);
    const cap = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.15, 0.155, 0.09, 14)), darkMat);
    cap.position.y = 0.09;
    const brim = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.24, 0.025, 0.14)), accentMat);
    brim.position.set(0, 0.06, 0.13);
    headGroup.add(head, cap, brim);
  } else {
    const helmet = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.165, 16, 14)), accentMat);
    helmet.castShadow = true;
    const visor = new THREE.Mesh(
      regGeo(new THREE.CylinderGeometry(0.168, 0.168, 0.095, 14, 1, false, -0.75, 1.5)),
      visorMat
    );
    visor.position.y = 0.01;
    headGroup.add(helmet, visor);
  }
  root.add(headGroup);

  // Articulated Arms
  const armGeo = regGeo(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8));
  const gloveGeo = regGeo(new THREE.SphereGeometry(0.072, 10, 8));

  const createArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.27, 1.29, 0);
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.y = -0.22;
    arm.castShadow = true;
    const glove = new THREE.Mesh(gloveGeo, darkMat);
    glove.position.y = -0.46;
    pivot.add(arm, glove);
    root.add(pivot);
    return pivot;
  };

  const leftArmPivot = createArm(1);
  const rightArmPivot = createArm(-1);

  return {
    root,
    leftArmPivot,
    rightArmPivot,
    headGroup,
    trophyAnchor: new THREE.Vector3(),
  };
}

export class PodiumCeremony {
  public readonly group = new THREE.Group();
  private disposableGeos: THREE.BufferGeometry[] = [];
  private disposableMats: THREE.Material[] = [];
  private disposableTexs: THREE.Texture[] = [];
  private carHandles: CarVisualHandle[] = [];

  private drivers: DriverFigure[] = []; // index 0 = 1st, 1 = 2nd, 2 = 3rd
  private presenter!: DriverFigure;
  private trophies: THREE.Group[] = []; // index 0 = Gold, 1 = Silver, 2 = Bronze
  private top3: PodiumDriverInfo[] = [];

  private confettiInst!: THREE.InstancedMesh;
  private confettiCount = 140;
  private confettiPos: Float32Array;
  private confettiVel: Float32Array;
  private confettiPhase: Float32Array;
  private confettiActive = false;

  private elapsed = 0;
  private awardedPlaces = new Set<number>();

  private camPosWorld = new THREE.Vector3();
  private camLookWorld = new THREE.Vector3();
  private localCamPos = new THREE.Vector3();
  private localCamLook = new THREE.Vector3();

  // Podium pedestal local targets: [x, topY, z]
  private readonly pedestalTops: [number, number, number][] = [
    [0, 1.18, -0.1],    // 1st
    [-2.05, 0.80, -0.1], // 2nd
    [2.05, 0.54, -0.1],  // 3rd
  ];

  constructor() {
    this.group.visible = false;
    this.confettiPos = new Float32Array(this.confettiCount * 3);
    this.confettiVel = new Float32Array(this.confettiCount * 3);
    this.confettiPhase = new Float32Array(this.confettiCount);
  }

  private regGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    this.disposableGeos.push(g);
    return g;
  };

  private regMat = <T extends THREE.Material>(m: T): T => {
    this.disposableMats.push(m);
    return m;
  };

  private clearStage(): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.carHandles.forEach((c) => c.dispose());
    this.carHandles = [];
    this.disposableGeos.forEach((g) => g.dispose());
    this.disposableGeos = [];
    this.disposableMats.forEach((m) => m.dispose());
    this.disposableMats = [];
    this.disposableTexs.forEach((t) => t.dispose());
    this.disposableTexs = [];
    this.drivers = [];
    this.trophies = [];
    this.awardedPlaces.clear();
  }

  public start(
    top3: PodiumDriverInfo[],
    worldCenter: THREE.Vector3,
    yaw: number,
    materials: MaterialLibrary,
    carSpecs: CarSpec[]
  ): void {
    this.clearStage();
    this.top3 = top3;
    this.elapsed = 0;
    this.confettiActive = false;

    this.group.position.copy(worldCenter);
    this.group.rotation.set(0, yaw, 0);
    this.group.visible = true;
    this.group.updateMatrixWorld(true);

    // 1. Main Illuminated Stage Deck
    const stageMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.3 })
    );
    const deck = new THREE.Mesh(this.regGeo(new THREE.BoxGeometry(8.6, 0.22, 4.4)), stageMat);
    deck.position.set(0, 0.11, 0.3);
    deck.receiveShadow = true;
    this.group.add(deck);

    // Glowing front stage rim
    const rimMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.8,
        roughness: 0.2,
      })
    );
    const frontRim = new THREE.Mesh(this.regGeo(new THREE.BoxGeometry(8.64, 0.08, 0.08)), rimMat);
    frontRim.position.set(0, 0.19, 2.5);
    this.group.add(frontRim);

    // 2. Stepped 1st / 2nd / 3rd Podium Blocks
    const podiumColors = ['#fbbf24', '#e2e8f0', '#d97706'];
    const podiumNums = ['1', '2', '3'];
    this.pedestalTops.forEach(([px, topY, pz], idx) => {
      const h = topY - 0.22;
      const block = new THREE.Mesh(
        this.regGeo(new THREE.BoxGeometry(1.78, h, 1.5)),
        this.regMat(
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.35 })
        )
      );
      block.position.set(px, 0.22 + h * 0.5, pz);
      block.castShadow = true;
      block.receiveShadow = true;
      this.group.add(block);

      const trim = new THREE.Mesh(
        this.regGeo(new THREE.BoxGeometry(1.84, 0.07, 1.56)),
        this.regMat(
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(podiumColors[idx]),
            metalness: 0.85,
            roughness: 0.2,
          })
        )
      );
      trim.position.set(px, topY - 0.03, pz);
      this.group.add(trim);

      const tex = createNumberPlaqueTexture(podiumNums[idx], podiumColors[idx]);
      this.disposableTexs.push(tex);
      const plaque = new THREE.Mesh(
        this.regGeo(new THREE.PlaneGeometry(0.54, 0.54)),
        this.regMat(new THREE.MeshBasicMaterial({ map: tex }))
      );
      plaque.position.set(px, 0.22 + h * 0.52, pz + 0.76);
      this.group.add(plaque);
    });

    // 3. Championship Backdrop Wall
    const wall = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(8.2, 3.2, 0.24)),
      stageMat
    );
    wall.position.set(0, 1.8, -1.55);
    wall.castShadow = true;
    this.group.add(wall);

    const banner = new THREE.Mesh(
      this.regGeo(new THREE.PlaneGeometry(7.6, 1.45)),
      materials.gantryBanner
    );
    banner.position.set(0, 2.35, -1.41);
    this.group.add(banner);

    // 4. Trophy Table (front-left) + 3 Gleaming Championship Trophies
    const table = new THREE.Mesh(
      this.regGeo(new THREE.BoxGeometry(1.5, 0.72, 0.65)),
      stageMat
    );
    table.position.set(-2.95, 0.58, 1.65);
    table.castShadow = true;
    this.group.add(table);

    const trophyMetals = [0xfbbf24, 0xe2e8f0, 0xd97706];
    for (let i = 0; i < 3; i++) {
      const trophy = createTrophyMesh(trophyMetals[i], this.regGeo, this.regMat);
      const scale = i === 0 ? 1.18 : i === 1 ? 1.0 : 0.9;
      trophy.scale.setScalar(scale);
      // Initial resting spots on the presentation table
      trophy.position.set(-3.35 + i * 0.4, 0.94, 1.65);
      this.group.add(trophy);
      this.trophies.push(trophy);
    }

    // 5. Presenter Official Figure
    this.presenter = createDriverFigure('#1e293b', '#fbbf24', true, this.regGeo, this.regMat);
    this.presenter.root.position.set(-2.2, 0.22, 1.55);
    this.group.add(this.presenter.root);

    // 6. Top 3 Driver Figures (start waiting near front stage ramp)
    const startPositions: [number, number, number][] = [
      [0.0, 0.22, 2.45],
      [-2.05, 0.22, 2.35],
      [2.05, 0.22, 2.35],
    ];
    for (let i = 0; i < 3; i++) {
      const info = top3[i] ?? {
        place: (i + 1) as 1 | 2 | 3,
        driverName: `DRIVER ${i + 1}`,
        carId: 'sb-01-apex',
        carName: 'SB-01 APEX GT',
        hexPrimary: '#e11d48',
        hexAccent: '#f8fafc',
        isPlayer: false,
        finishTimeMs: 90000,
      };
      const fig = createDriverFigure(
        info.hexPrimary,
        info.hexAccent,
        false,
        this.regGeo,
        this.regMat
      );
      fig.root.position.set(...startPositions[i]);
      this.group.add(fig.root);
      this.drivers.push(fig);
    }

    // 7. Top 3 Race Cars Parked in Hero V-Formation flanking the Podium
    const carSlots: [number, number, number, number][] = [
      [0, 0.02, -4.5, 0.12],
      [-5.1, 0.02, 1.8, 0.45],
      [5.1, 0.02, 1.8, -0.45],
    ];
    for (let i = 0; i < 3; i++) {
      const info = top3[i];
      if (!info) continue;
      const spec = carSpecs.find((c) => c.id === info.carId) ?? carSpecs[0];
      const carVis = createCarMesh(spec, materials);
      const [cx, cy, cz, cyaw] = carSlots[i];
      carVis.root.position.set(cx, cy, cz);
      carVis.root.rotation.set(0, cyaw, 0);
      this.group.add(carVis.root);
      this.carHandles.push(carVis);
    }

    // 8. Instanced Confetti Burst Pool
    const confGeo = this.regGeo(new THREE.PlaneGeometry(0.16, 0.08));
    const confMat = this.regMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      })
    );
    this.confettiInst = new THREE.InstancedMesh(confGeo, confMat, this.confettiCount);
    this.confettiInst.frustumCulled = false;
    const confPalette = [0xfbbf24, 0xf43f5e, 0x38bdf8, 0x34d399, 0xf8fafc];
    const tmpCol = new THREE.Color();
    for (let i = 0; i < this.confettiCount; i++) {
      tmpCol.setHex(confPalette[i % confPalette.length]);
      this.confettiInst.setColorAt(i, tmpCol);
      this.confettiPos[i * 3 + 1] = -99; // hidden until champion burst
    }
    if (this.confettiInst.instanceColor) this.confettiInst.instanceColor.needsUpdate = true;
    this.group.add(this.confettiInst);
  }

  private triggerConfettiBurst(): void {
    if (this.confettiActive) return;
    this.confettiActive = true;
    for (let i = 0; i < this.confettiCount; i++) {
      this.confettiPos[i * 3] = (Math.random() - 0.5) * 4.2;
      this.confettiPos[i * 3 + 1] = 1.6 + Math.random() * 1.4;
      this.confettiPos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;

      this.confettiVel[i * 3] = (Math.random() - 0.5) * 4.5;
      this.confettiVel[i * 3 + 1] = 3.5 + Math.random() * 4.8;
      this.confettiVel[i * 3 + 2] = (Math.random() - 0.5) * 4.2;
      this.confettiPhase[i] = Math.random() * Math.PI * 2;
    }
  }

  public update(dt: number): CeremonyUpdateResult {
    this.elapsed += dt;
    const t = this.elapsed;

    // Step timing:
    // 0.0 - 2.4: 3rd Place walks up & receives Bronze Trophy
    // 2.4 - 4.8: 2nd Place walks up & receives Silver Trophy
    // 4.8 - 8.0: 1st Place Champion walks up & receives Gold Trophy + Confetti
    // 8.0+: Full Podium Hero Celebration Orbit
    let step = 4;
    let headline = 'CHAMPIONSHIP PODIUM';
    let subtext = 'TOP 3 FINISHERS CROWNED';
    let newlyPresentedPlace: 1 | 2 | 3 | null = null;

    if (t < 2.4) {
      step = 1;
      const d3 = this.top3[2];
      headline = '3RD PLACE · BRONZE TROPHY';
      subtext = d3 ? `${d3.driverName} · ${d3.carName}` : '3RD PLACE FINISHER';
    } else if (t < 4.8) {
      step = 2;
      const d2 = this.top3[1];
      headline = '2ND PLACE · SILVER TROPHY';
      subtext = d2 ? `${d2.driverName} · ${d2.carName}` : '2ND PLACE FINISHER';
    } else if (t < 8.0) {
      step = 3;
      const d1 = this.top3[0];
      headline = '1ST PLACE · CHAMPIONSHIP CUP';
      subtext = d1 ? `${d1.driverName} · ${d1.carName}` : 'RACE CHAMPION';
    } else {
      step = 4;
      const d1 = this.top3[0];
      headline = d1 ? `CHAMPION: ${d1.driverName}` : 'CEREMONY COMPLETE';
      subtext = 'PRESENTATION CEREMONY COMPLETE';
    }

    // Helper to animate a driver stepping onto their pedestal and holding trophy
    const animateDriver = (
      driverIdx: number, // 0=1st, 1=2nd, 2=3rd
      startSec: number,
      awardSec: number
    ) => {
      const fig = this.drivers[driverIdx];
      const trophy = this.trophies[driverIdx];
      const [px, topY, pz] = this.pedestalTops[driverIdx];
      const startZ = driverIdx === 0 ? 2.45 : 2.35;

      if (t < startSec) {
        // Waiting cleanly in front of stage
        fig.root.position.set(px, 0.22, startZ);
        fig.root.rotation.y = Math.PI; // facing podium initially or stage
        fig.leftArmPivot.rotation.x = THREE.MathUtils.damp(fig.leftArmPivot.rotation.x, 0, 8, dt);
        fig.rightArmPivot.rotation.x = THREE.MathUtils.damp(fig.rightArmPivot.rotation.x, 0, 8, dt);
        return;
      }

      const walkDur = 0.95;
      const walkProgress = THREE.MathUtils.clamp((t - startSec) / walkDur, 0, 1);
      const smoothWalk = walkProgress * walkProgress * (3 - 2 * walkProgress);

      // Step up onto pedestal cleanly in second half of walk
      const stepUp = THREE.MathUtils.clamp((walkProgress - 0.45) / 0.55, 0, 1);
      const stepBounce = walkProgress < 1 ? Math.abs(Math.sin(walkProgress * Math.PI * 4)) * 0.08 : 0;

      fig.root.position.set(
        px,
        THREE.MathUtils.lerp(0.22, topY, stepUp) + stepBounce,
        THREE.MathUtils.lerp(startZ, pz, smoothWalk)
      );
      // Turn to face forward (+Z) once on pedestal
      fig.root.rotation.y = walkProgress < 0.8 ? Math.sin(walkProgress * Math.PI) * 0.35 : 0;

      if (walkProgress < 1) {
        const swing = Math.sin(t * 11) * 0.55;
        fig.leftArmPivot.rotation.x = swing;
        fig.rightArmPivot.rotation.x = -swing;
      } else if (t >= awardSec) {
        // Trophy received! Raise right arm high in celebration
        const place = (driverIdx + 1) as 1 | 2 | 3;
        if (!this.awardedPlaces.has(place)) {
          this.awardedPlaces.add(place);
          newlyPresentedPlace = place;
          if (place === 1) {
            this.triggerConfettiBurst();
          }
        }
        const wave = Math.sin((t - awardSec) * 4.5) * 0.14;
        fig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
          fig.rightArmPivot.rotation.x,
          -2.45 + wave,
          7,
          dt
        );
        fig.rightArmPivot.rotation.z = THREE.MathUtils.damp(fig.rightArmPivot.rotation.z, -0.22, 7, dt);
        fig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
          fig.leftArmPivot.rotation.x,
          driverIdx === 0 ? -2.1 - wave : -0.45,
          7,
          dt
        );

        // Position trophy cleanly in raised right hand
        trophy.position.set(
          px + 0.32,
          topY + 1.82 + Math.sin((t - awardSec) * 4.5) * 0.04,
          pz + 0.14
        );
        trophy.rotation.y = (t - awardSec) * 0.8;
      } else {
        // Reaching forward to accept trophy from presenter
        fig.rightArmPivot.rotation.x = THREE.MathUtils.damp(fig.rightArmPivot.rotation.x, -1.15, 8, dt);
        fig.leftArmPivot.rotation.x = THREE.MathUtils.damp(fig.leftArmPivot.rotation.x, -0.4, 8, dt);
      }
    };

    // Animate in ceremonial order: 3rd -> 2nd -> 1st
    animateDriver(2, 0.1, 1.35);
    animateDriver(1, 2.4, 3.65);
    animateDriver(0, 4.8, 6.25);

    // Animate Presenter Official moving between podium stations
    let presTargetX = -2.2;
    let presTargetZ = 1.45;
    let presRotY = 0.3;
    let presArmPitch = -0.3;
    let activeTrophyIdx = -1;

    if (t < 2.35) {
      presTargetX = 1.35;
      presTargetZ = 1.05;
      presRotY = 2.6;
      presArmPitch = t > 0.7 && t < 1.4 ? -1.3 : -0.3;
      if (t < 1.35) activeTrophyIdx = 2;
    } else if (t < 4.75) {
      presTargetX = -1.35;
      presTargetZ = 1.05;
      presRotY = -2.6;
      presArmPitch = t > 3.0 && t < 3.7 ? -1.3 : -0.3;
      if (t < 3.65) activeTrophyIdx = 1;
    } else if (t < 7.95) {
      presTargetX = 0.0;
      presTargetZ = 1.25;
      presRotY = Math.PI;
      presArmPitch = t > 5.4 && t < 6.3 ? -1.35 : -0.3;
      if (t < 6.25) activeTrophyIdx = 0;
    } else {
      presTargetX = -3.3;
      presTargetZ = 1.1;
      presRotY = 0.6;
      presArmPitch = -0.2;
    }

    this.presenter.root.position.x = THREE.MathUtils.damp(this.presenter.root.position.x, presTargetX, 4.2, dt);
    this.presenter.root.position.z = THREE.MathUtils.damp(this.presenter.root.position.z, presTargetZ, 4.2, dt);
    this.presenter.root.rotation.y = THREE.MathUtils.damp(this.presenter.root.rotation.y, presRotY, 6, dt);
    this.presenter.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.presenter.rightArmPivot.rotation.x, presArmPitch, 7, dt);
    this.presenter.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.presenter.leftArmPivot.rotation.x, presArmPitch * 0.7, 7, dt);

    // Move active trophy smoothly with presenter until handed to driver
    if (activeTrophyIdx >= 0 && this.trophies[activeTrophyIdx]) {
      const tr = this.trophies[activeTrophyIdx];
      const holdX = this.presenter.root.position.x + Math.sin(this.presenter.root.rotation.y) * 0.48;
      const holdZ = this.presenter.root.position.z + Math.cos(this.presenter.root.rotation.y) * 0.48;
      tr.position.x = THREE.MathUtils.damp(tr.position.x, holdX, 8, dt);
      tr.position.y = THREE.MathUtils.damp(tr.position.y, 1.18, 8, dt);
      tr.position.z = THREE.MathUtils.damp(tr.position.z, holdZ, 8, dt);
    }

    // Update Confetti physics
    if (this.confettiActive) {
      for (let i = 0; i < this.confettiCount; i++) {
        const idx = i * 3;
        this.confettiVel[idx + 1] -= 4.2 * dt; // gentle gravity
        this.confettiVel[idx] *= Math.max(0, 1 - 1.2 * dt);
        this.confettiVel[idx + 2] *= Math.max(0, 1 - 1.2 * dt);

        this.confettiPos[idx] += (this.confettiVel[idx] + Math.sin(t * 4 + this.confettiPhase[i]) * 0.7) * dt;
        this.confettiPos[idx + 1] += this.confettiVel[idx + 1] * dt;
        this.confettiPos[idx + 2] += (this.confettiVel[idx + 2] + Math.cos(t * 3.5 + this.confettiPhase[i]) * 0.7) * dt;

        if (this.confettiPos[idx + 1] < 0.25) {
          this.confettiPos[idx + 1] = 4.2 + Math.random() * 1.4;
          this.confettiPos[idx] = (Math.random() - 0.5) * 6.5;
          this.confettiPos[idx + 2] = (Math.random() - 0.5) * 3.2;
          this.confettiVel[idx + 1] = -0.6 - Math.random() * 1.2;
        }

        _tmpPos.set(this.confettiPos[idx], this.confettiPos[idx + 1], this.confettiPos[idx + 2]);
        _tmpEuler.set(t * 5 + i, t * 3 + i, t * 4);
        _tmpQuat.setFromEuler(_tmpEuler);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
        this.confettiInst.setMatrixAt(i, _tmpMat4);
      }
      this.confettiInst.instanceMatrix.needsUpdate = true;
    } else {
      for (let i = 0; i < this.confettiCount; i++) {
        _tmpPos.set(0, -100, 0);
        _tmpQuat.identity();
        _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
        this.confettiInst.setMatrixAt(i, _tmpMat4);
      }
      this.confettiInst.instanceMatrix.needsUpdate = true;
    }

    // Cinematic Ceremony Camera Framing (Local -> World)
    if (step === 1) {
      this.localCamPos.set(3.2, 2.2, 5.2);
      this.localCamLook.set(1.6, 1.35, 0.2);
    } else if (step === 2) {
      this.localCamPos.set(-3.2, 2.35, 5.3);
      this.localCamLook.set(-1.6, 1.55, 0.2);
    } else if (step === 3) {
      this.localCamPos.set(0.4, 2.55, 6.2);
      this.localCamLook.set(0.0, 1.85, 0.0);
    } else {
      const orbitAng = (t - 8.0) * 0.28;
      this.localCamPos.set(Math.sin(orbitAng) * 7.8, 3.15, Math.cos(orbitAng) * 7.8 + 1.4);
      this.localCamLook.set(0, 1.55, -0.3);
    }

    this.camPosWorld.copy(this.localCamPos).applyMatrix4(this.group.matrixWorld);
    this.camLookWorld.copy(this.localCamLook).applyMatrix4(this.group.matrixWorld);

    return {
      step,
      headline,
      subtext,
      cameraPos: this.camPosWorld,
      cameraLookAt: this.camLookWorld,
      newlyPresentedPlace,
    };
  }

  public hide(): void {
    this.group.visible = false;
  }

  public dispose(): void {
    this.clearStage();
  }
}
