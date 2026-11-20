import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RaceAudioEngine } from './audio';
import { createCarMesh, type CarVisualHandle } from './carMesh';
import { DriftEffectsManager } from './particles';
import { PodiumCeremony } from './podium';
import { WeatherSystem } from './weather';
import {
  computeAiControl,
  createCarPhysicsState,
  stepCarPhysics,
  type CarPhysicsState,
  type ControlInput,
} from './physics';
import { createMaterialLibrary, type MaterialLibrary } from './materials';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { buildTrack, type BuiltTrack } from './tracks';
import { triggerHaptic } from '../utils/haptics';
import {
  applyCarUpgrades,
  CAR_SPECS,
  DEFAULT_UPGRADES,
  DRIVER_ROSTER_NAMES,
  LEVEL_SPECS,
  type CameraMode,
  type CarId,
  type CarUpgrades,
  type GamePhase,
  type PodiumDriverInfo,
  type RaceTelemetry,
  type TrackId,
} from './types';

export interface EngineCallbacks {
  onTelemetry: (t: RaceTelemetry) => void;
  onPhaseChange: (phase: GamePhase) => void;
}

interface AiRacer {
  physics: CarPhysicsState;
  visual: CarVisualHandle;
  laneOffset: number;
  skill: number;
  driverName: string;
}

const CAMERA_MODES: CameraMode[] = ['chase', 'drift', 'hood', 'aerial'];

// Pre-allocated math helpers (Zero GC in render loop)
const _desiredCamPos = new THREE.Vector3();
const _desiredLookAt = new THREE.Vector3();
const _currentCamPos = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3();
const _tmpColorA = new THREE.Color();
const _tmpColorB = new THREE.Color();
const _rainSkyTop = new THREE.Color(0x283548);
const _rainSkyMid = new THREE.Color(0x475970);
const _rainSkyBot = new THREE.Color(0x64778d);
const _fogDayTop = new THREE.Color(0x8899ad);
const _fogDayMid = new THREE.Color(0xb1c0cf);
const _fogDayBot = new THREE.Color(0xcfdbe6);
const _fogNightTop = new THREE.Color(0x182336);
const _fogNightMid = new THREE.Color(0x2c3c54);
const _fogNightBot = new THREE.Color(0x435670);
const _dryAsphaltColor = new THREE.Color(0xffffff);
const _wetAsphaltColor = new THREE.Color(0x9fb0c4);

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createSkyDome(atmosphere: 'sunset' | 'twilight' | 'tropical'): THREE.Mesh {
  const geo = new THREE.SphereGeometry(2200, 32, 20);
  const topColor =
    atmosphere === 'tropical'
      ? new THREE.Color(0x0369a1)
      : atmosphere === 'sunset'
        ? new THREE.Color(0x1e2952)
        : new THREE.Color(0x050914);
  const midColor =
    atmosphere === 'tropical'
      ? new THREE.Color(0x38bdf8)
      : atmosphere === 'sunset'
        ? new THREE.Color(0xc2594b)
        : new THREE.Color(0x172544);
  const botColor =
    atmosphere === 'tropical'
      ? new THREE.Color(0xdcf2f8)
      : atmosphere === 'sunset'
        ? new THREE.Color(0xf4a261)
        : new THREE.Color(0x1e293b);

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: topColor },
      uMid: { value: midColor },
      uBot: { value: botColor },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBot;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(uBot, uMid, smoothstep(-0.02, 0.16, h));
        col = mix(col, uTop, smoothstep(0.16, 0.65, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private clock = new THREE.Clock();

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private skyDome: THREE.Mesh | null = null;

  private textures: ProceduralTextureSet;
  private materials: MaterialLibrary;
  private effects: DriftEffectsManager;
  private weather: WeatherSystem;
  private podium = new PodiumCeremony();
  public readonly audio = new RaceAudioEngine();

  private baseAtmosphere: 'sunset' | 'twilight' | 'tropical' = 'sunset';
  private baseFogColor = new THREE.Color(0xd88868);
  private baseFogDensity = 0.00145;
  private baseSkyTop = new THREE.Color(0x1e2952);
  private baseSkyMid = new THREE.Color(0xc2594b);
  private baseSkyBot = new THREE.Color(0xf4a261);
  private baseKeyIntensity = 2.3;
  private baseHemiIntensity = 0.72;

  private currentTrackId: TrackId = 'apex-circuit';
  private currentCarId: CarId = 'sb-01-apex';
  private currentRacerCount = 8;
  private currentLevel = 1;
  private currentUpgrades: CarUpgrades = { ...DEFAULT_UPGRADES };
  private playerDriverName = 'DRIVER 01';
  private track!: BuiltTrack;
  private playerPhysics!: CarPhysicsState;
  private playerVisual!: CarVisualHandle;
  private aiRacers: AiRacer[] = [];

  private phase: GamePhase = 'title';
  private lockedFinishPosition: number | null = null;
  private podiumTop3: PodiumDriverInfo[] = [];
  private ceremonyStep = 1;
  private ceremonyHeadline = '';
  private ceremonySubtext = '';
  private ceremonyCamPos = new THREE.Vector3();
  private ceremonyCamLook = new THREE.Vector3();

  private cameraMode: CameraMode = 'chase';
  private countdownTimer = 0;
  private lastCountdownBeep = 4;
  private titleOrbitAngle = 0.6;
  private cameraShake = 0;
  private hitstopTimer = 0;
  private bannerMessage: string | null = null;
  private bannerTimer = 0;

  private heldKeys = new Set<string>();
  private touchControls: ControlInput = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false,
  };
  private smoothSteer = 0;
  private telemetryAccum = 0;

  private frameId = 0;
  private destroyed = false;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.25, 3200);

    // Studio Environment Reflections (RoomEnvironment) on all devices
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3-Point Outdoor Lighting Rig (Bright & crisp without harsh specular glare)
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x3f2e21, 0.88);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffdca8, 1.85);
    this.keyLight.position.set(60, 95, -35);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 220;
    const d = 42;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.42);
    this.rimLight.position.set(-50, 35, 60);
    this.scene.add(this.rimLight);

    // Procedural Textures, Materials, Effects
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.materials = createMaterialLibrary(this.textures, this.isSoftwareGl);
    this.effects = new DriftEffectsManager(this.textures, this.materials);
    this.weather = new WeatherSystem(this.textures);
    this.scene.add(this.effects.group);
    this.scene.add(this.weather.group);
    this.scene.add(this.podium.group);

    // Build initial circuit & grid
    this.loadTrackAndVehicles(this.currentTrackId, this.currentCarId, this.currentRacerCount);

    // GPU Post-Processing (high threshold so only emissive lights softly glow, no white surface glare)
    if (!this.isSoftwareGl) {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.14, 0.25, 1.45);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
      this.bloomPass = bloom;
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitTelemetry();
    this.startLoop();
  }

  private loadTrackAndVehicles(trackId: TrackId, carId: CarId, racerCount = 8): void {
    const trackChanged = !this.track || trackId !== this.currentTrackId;
    this.currentTrackId = trackId;
    this.currentCarId = carId;
    this.currentRacerCount = THREE.MathUtils.clamp(Math.round(racerCount), 2, 8);
    this.lockedFinishPosition = null;
    this.podiumTop3 = [];
    this.podium.hide();

    // Cleanup previous track & cars
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
    }
    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      (this.skyDome.material as THREE.Material).dispose();
    }
    if (this.playerVisual) {
      this.scene.remove(this.playerVisual.root);
      this.playerVisual.dispose();
    }
    for (const ai of this.aiRacers) {
      this.scene.remove(ai.visual.root);
      ai.visual.dispose();
    }
    this.aiRacers = [];
    this.effects.clearSkidmarks();

    // Build Track & apply level lap count without mutating shared spec
    const levelSpec =
      LEVEL_SPECS.find((l) => l.level === this.currentLevel) ?? LEVEL_SPECS[0];
    this.track = buildTrack(trackId, this.materials, this.isSoftwareGl);
    this.track.spec = { ...this.track.spec, totalLaps: levelSpec.laps };
    this.scene.add(this.track.group);

    // Atmosphere & Horizon Fog matching sky dome
    const atmos = this.track.spec.atmosphere;
    this.baseAtmosphere = atmos;
    this.skyDome = createSkyDome(atmos);
    this.scene.add(this.skyDome);

    const skyMat = this.skyDome.material as THREE.ShaderMaterial;
    this.baseSkyTop.copy(skyMat.uniforms.uTop.value as THREE.Color);
    this.baseSkyMid.copy(skyMat.uniforms.uMid.value as THREE.Color);
    this.baseSkyBot.copy(skyMat.uniforms.uBot.value as THREE.Color);

    const fogColor =
      atmos === 'tropical' ? 0xbbe8f5 : atmos === 'sunset' ? 0xd88868 : 0x162035;
    const fogDensity =
      atmos === 'tropical' ? 0.00058 : atmos === 'sunset' ? 0.00095 : 0.00125;
    this.baseFogColor.setHex(fogColor);
    this.baseFogDensity = fogDensity;
    this.scene.background = new THREE.Color(fogColor);
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);

    this.keyLight.color.setHex(
      atmos === 'tropical' ? 0xfff3d1 : atmos === 'sunset' ? 0xffd199 : 0x93c5fd
    );
    this.baseKeyIntensity = atmos === 'tropical' ? 1.9 : atmos === 'sunset' ? 1.85 : 1.45;
    this.keyLight.intensity = this.baseKeyIntensity;
    this.hemiLight.color.setHex(
      atmos === 'tropical' ? 0xbae6fd : atmos === 'sunset' ? 0x93c5fd : 0x60a5fa
    );
    this.hemiLight.groundColor.setHex(
      atmos === 'tropical' ? 0x7a6a4d : atmos === 'sunset' ? 0x4b382b : 0x1e293b
    );
    this.baseHemiIntensity = atmos === 'tropical' ? 0.96 : atmos === 'sunset' ? 0.90 : 0.84;
    this.hemiLight.intensity = this.baseHemiIntensity;

    if (this.phase === 'title' && trackChanged && this.track) {
      this.weather.rollPreviewWeather();
    }
    this.applyWeatherAtmosphere();

    // Staggered 2-column F1 Starting Grid for up to 8 cars behind start/finish line
    const gridOrder: [number, number, number][] = [
      [0.988, 3.4, 2.8],   // P1
      [0.982, -3.4, -2.8], // P2
      [0.976, 3.4, 3.4],   // P3
      [0.970, -3.4, -3.4], // P4
      [0.964, 3.4, 1.4],   // P5
      [0.958, -3.4, -1.4], // P6
      [0.952, 3.4, 4.0],   // P7
      [0.946, -3.4, -4.0], // P8
    ];

    const playerSlotIdx = this.currentRacerCount - 1;
    const [playerProg, playerLat] = gridOrder[playerSlotIdx];

    const basePlayerSpec = CAR_SPECS.find((c) => c.id === carId) ?? CAR_SPECS[0];
    const upgradedPlayerSpec = applyCarUpgrades(basePlayerSpec, this.currentUpgrades);
    this.playerPhysics = createCarPhysicsState(upgradedPlayerSpec, this.track, playerProg, playerLat);
    this.playerVisual = createCarMesh(upgradedPlayerSpec, this.materials);
    this.scene.add(this.playerVisual.root);
    this.syncCarVisual(this.playerPhysics, this.playerVisual);

    // Prioritize featured stylish cars for this level, then fill remaining grid slots
    const featuredSpecs = levelSpec.featuredAiCars
      .map((id) => CAR_SPECS.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .filter((c) => c.id !== basePlayerSpec.id);
    const otherSpecs = CAR_SPECS.filter(
      (c) =>
        c.id !== basePlayerSpec.id &&
        !featuredSpecs.some((f) => f.id === c.id)
    );
    const rivalPool = [...featuredSpecs, ...otherSpecs];

    for (let idx = 0; idx < playerSlotIdx; idx++) {
      const [prog, lat, lane] = gridOrder[idx];
      const spec = rivalPool[idx % rivalPool.length];
      // P1 gets highest skill for this level, tapering smoothly to P7
      const slotFrac = playerSlotIdx > 1 ? 1 - idx / (playerSlotIdx - 1) : 1;
      const skill = THREE.MathUtils.lerp(levelSpec.aiSkillMin, levelSpec.aiSkillMax, slotFrac);
      const driverName = DRIVER_ROSTER_NAMES[idx % DRIVER_ROSTER_NAMES.length];
      const phys = createCarPhysicsState(spec, this.track, prog, lat);
      const vis = createCarMesh(spec, this.materials);
      this.scene.add(vis.root);
      this.syncCarVisual(phys, vis);
      this.aiRacers.push({ physics: phys, visual: vis, laneOffset: lane, skill, driverName });
    }

    // Snap camera immediately for crisp initial frame
    this.snapCameraToHero();
  }

  private snapCameraToHero(): void {
    const p = this.playerPhysics;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    _currentCamPos.set(p.x - fx * 8.5, p.y + 3.2, p.z - fz * 8.5);
    _currentLookAt.set(p.x + fx * 6, p.y + 1.1, p.z + fz * 6);
    this.camera.position.copy(_currentCamPos);
    this.camera.lookAt(_currentLookAt);
  }

  public selectSetup(
    trackId: TrackId,
    carId: CarId,
    racerCount = 8,
    level = 1,
    upgrades: CarUpgrades = DEFAULT_UPGRADES,
    driverName = 'DRIVER 01'
  ): void {
    this.playerDriverName = driverName.trim() || 'DRIVER 01';
    if (this.phase !== 'title') return;
    const clampedCount = THREE.MathUtils.clamp(Math.round(racerCount), 2, 8);
    const clampedLevel = THREE.MathUtils.clamp(Math.round(level), 1, 10);
    const upgradesChanged =
      upgrades.engine !== this.currentUpgrades.engine ||
      upgrades.nitro !== this.currentUpgrades.nitro ||
      upgrades.handling !== this.currentUpgrades.handling ||
      upgrades.aero !== this.currentUpgrades.aero;

    if (
      trackId !== this.currentTrackId ||
      carId !== this.currentCarId ||
      clampedCount !== this.currentRacerCount ||
      clampedLevel !== this.currentLevel ||
      upgradesChanged
    ) {
      this.currentLevel = clampedLevel;
      this.currentUpgrades = { ...upgrades };
      this.loadTrackAndVehicles(trackId, carId, clampedCount);
      this.emitTelemetry();
    }
  }

  public startRace(): void {
    this.audio.unlock();
    this.audio.stopIntroMusic();
    this.smoothSteer = 0;
    this.loadTrackAndVehicles(this.currentTrackId, this.currentCarId, this.currentRacerCount);
    this.weather.rollRaceWeather();
    this.applyWeatherAtmosphere();
    this.phase = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownBeep = 4;
    this.bannerMessage = null;
    this.bannerTimer = 0;
    this.snapCameraToHero();
    this.emitTelemetry();
    this.callbacks.onPhaseChange('countdown');
  }

  public startRaceWithSetup(
    trackId: TrackId,
    carId: CarId,
    racerCount = 8,
    level = 1,
    upgrades: CarUpgrades = DEFAULT_UPGRADES,
    driverName = 'DRIVER 01'
  ): void {
    this.currentTrackId = trackId;
    this.currentCarId = carId;
    this.currentRacerCount = THREE.MathUtils.clamp(Math.round(racerCount), 2, 8);
    this.currentLevel = THREE.MathUtils.clamp(Math.round(level), 1, 10);
    this.currentUpgrades = { ...upgrades };
    this.playerDriverName = driverName.trim() || 'DRIVER 01';
    this.startRace();
  }

  public finishCeremony(): void {
    if (this.phase !== 'ceremony') return;
    this.podium.hide();
    if (this.playerVisual) this.playerVisual.root.visible = true;
    for (const ai of this.aiRacers) ai.visual.root.visible = true;
    this.phase = 'finished';
    this.callbacks.onPhaseChange('finished');
    this.emitTelemetry();
  }

  public togglePause(): void {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.phase = 'paused';
      this.audio.updateContinuous({
        active: false,
        rpm: 900,
        throttle: 0,
        slipAngleDeg: 0,
        speedKmh: 0,
        isBoosting: false,
        rainIntensity: 0,
      });
      this.callbacks.onPhaseChange('paused');
    } else if (this.phase === 'paused') {
      this.phase = this.countdownTimer > 0 ? 'countdown' : 'racing';
      this.callbacks.onPhaseChange(this.phase);
    }
  }

  public returnToTitle(): void {
    this.phase = 'title';
    this.smoothSteer = 0;
    this.podium.hide();
    this.loadTrackAndVehicles(this.currentTrackId, this.currentCarId, this.currentRacerCount);
    this.weather.rollPreviewWeather();
    this.applyWeatherAtmosphere();
    this.audio.updateContinuous({
      active: false,
      rpm: 900,
      throttle: 0,
      slipAngleDeg: 0,
      speedKmh: 0,
      isBoosting: false,
    });
    void this.audio.tryPlayIntroMusic();
    this.callbacks.onPhaseChange('title');
    this.emitTelemetry();
  }

  public cycleCamera(): void {
    const idx = CAMERA_MODES.indexOf(this.cameraMode);
    this.cameraMode = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
    this.emitTelemetry();
  }

  public respawnOnTrack(): void {
    if (this.phase !== 'racing') return;
    const p = this.playerPhysics;
    const sample = this.track.samples[p.sampleIndex];
    p.x = sample.point.x;
    p.y = sample.point.y;
    p.z = sample.point.z;
    p.yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    p.vx = 0;
    p.vz = 0;
    p.yawRate = 0;
    p.activeDriftPoints = 0;
    p.driftMultiplier = 1;
    this.showBanner('RECOVERED TO TRACK', 1.4);
  }

  public setTouchInput(partial: Partial<ControlInput>): void {
    this.audio.unlock();
    Object.assign(this.touchControls, partial);
  }

  private showBanner(msg: string, duration = 2.0): void {
    this.bannerMessage = msg;
    this.bannerTimer = duration;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Ignore typing in driver name input
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (!this.heldKeys.has(e.code)) {
      if (e.code === 'KeyC' && (this.phase === 'racing' || this.phase === 'countdown')) {
        this.cycleCamera();
      } else if (e.code === 'Escape' && (this.phase === 'racing' || this.phase === 'countdown' || this.phase === 'paused')) {
        this.togglePause();
      } else if (e.code === 'KeyR' && this.phase === 'racing') {
        this.respawnOnTrack();
      }
    }
    this.heldKeys.add(e.code);
    this.audio.unlock();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private onBlur = (): void => {
    this.heldKeys.clear();
    this.touchControls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
  };

  private onResize = (): void => {
    if (this.destroyed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
  }

  private readPlayerInput(dt: number): ControlInput {
    const k = this.heldKeys;
    const throttle =
      k.has('KeyW') || k.has('ArrowUp') ? 1 : this.touchControls.throttle;
    const brake =
      k.has('KeyS') || k.has('ArrowDown') ? 1 : this.touchControls.brake;
    const left = k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0;
    const right = k.has('KeyD') || k.has('ArrowRight') ? 1 : 0;
    const rawSteer = left - right + this.touchControls.steer;
    const clampedSteer = THREE.MathUtils.clamp(rawSteer, -1, 1);

    // Smooth progressive steering ramp (gentler turn-in, crisp self-centering)
    const steerLambda = Math.abs(clampedSteer) > 0.05 ? 6.2 : 8.5;
    this.smoothSteer = THREE.MathUtils.damp(this.smoothSteer, clampedSteer, steerLambda, dt);
    const shapedSteer =
      Math.sign(this.smoothSteer) * Math.pow(Math.abs(this.smoothSteer), 1.35);

    return {
      throttle,
      brake,
      steer: shapedSteer,
      handbrake: k.has('Space') || this.touchControls.handbrake,
      nitro: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchControls.nitro,
    };
  }

  private resolveCarCollisions(): void {
    const allCars: CarPhysicsState[] = [this.playerPhysics, ...this.aiRacers.map((a) => a.physics)];
    const minDist = 2.45;
    for (let i = 0; i < allCars.length; i++) {
      for (let j = i + 1; j < allCars.length; j++) {
        const a = allCars[i];
        const b = allCars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.001 && dist < minDist) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.5;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;

          const rvx = b.vx - a.vx;
          const rvz = b.vz - a.vz;
          const velAlongNormal = rvx * nx + rvz * nz;
          if (velAlongNormal < 0) {
            const impulse = -(1 + 0.35) * velAlongNormal * 0.5;
            a.vx -= impulse * nx;
            a.vz -= impulse * nz;
            b.vx += impulse * nx;
            b.vz += impulse * nz;

            if (i === 0 && Math.abs(velAlongNormal) > 4.5) {
              const intensity = Math.min(1, Math.abs(velAlongNormal) / 20);
              this.cameraShake = Math.max(this.cameraShake, Math.min(0.45, Math.abs(velAlongNormal) * 0.025));
              this.audio.playImpact(intensity);
              triggerHaptic(Math.round(20 + intensity * 35));
            }
          }
        }
      }
    }
  }

  private syncCarVisual(phys: CarPhysicsState, vis: CarVisualHandle): void {
    vis.root.position.set(phys.x, phys.y, phys.z);
    vis.root.rotation.set(0, phys.yaw, 0);
    vis.updateVisuals({
      wheelSpinAngle: phys.wheelSpinAngle,
      steerAngle: phys.steerAngle,
      bodyRoll: phys.bodyRoll,
      bodyPitch: phys.bodyPitch,
      isBraking: phys.isBraking,
      isBoosting: phys.isBoosting,
      speedKmh: phys.speedKmh,
    });
  }

  private updateGantryLights(countVal: number): void {
    const lights = this.track.gantryLights;
    for (let i = 0; i < lights.length; i++) {
      const mat = lights[i].material as THREE.MeshStandardMaterial;
      if (this.phase === 'countdown') {
        if (countVal <= 0) {
          mat.emissive.setHex(0x22c55e);
          mat.emissiveIntensity = 4.5;
        } else {
          const lit = 3 - countVal >= i;
          mat.emissive.setHex(0xef4444);
          mat.emissiveIntensity = lit ? 4.2 : 0.2;
        }
      } else if (this.phase === 'racing') {
        mat.emissive.setHex(0x22c55e);
        mat.emissiveIntensity = 2.0;
      } else {
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = 0.2;
      }
    }
  }

  private updateCamera(dt: number): void {
    const p = this.playerPhysics;

    if (this.phase === 'title') {
      this.titleOrbitAngle += dt * 0.22;
      const radius = 7.4;
      _desiredCamPos.set(
        p.x + Math.sin(this.titleOrbitAngle) * radius,
        p.y + 2.35 + Math.sin(this.titleOrbitAngle * 0.6) * 0.45,
        p.z + Math.cos(this.titleOrbitAngle) * radius
      );
      _desiredLookAt.set(p.x, p.y + 0.82, p.z);
      _currentCamPos.lerp(_desiredCamPos, 1 - Math.exp(-5 * dt));
      _currentLookAt.lerp(_desiredLookAt, 1 - Math.exp(-6 * dt));
      this.camera.position.copy(_currentCamPos);
      this.camera.lookAt(_currentLookAt);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 5, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.phase === 'ceremony') {
      _currentCamPos.x = THREE.MathUtils.damp(_currentCamPos.x, this.ceremonyCamPos.x, 4.2, dt);
      _currentCamPos.y = THREE.MathUtils.damp(_currentCamPos.y, this.ceremonyCamPos.y, 4.2, dt);
      _currentCamPos.z = THREE.MathUtils.damp(_currentCamPos.z, this.ceremonyCamPos.z, 4.2, dt);
      _currentLookAt.x = THREE.MathUtils.damp(_currentLookAt.x, this.ceremonyCamLook.x, 5.2, dt);
      _currentLookAt.y = THREE.MathUtils.damp(_currentLookAt.y, this.ceremonyCamLook.y, 5.2, dt);
      _currentLookAt.z = THREE.MathUtils.damp(_currentLookAt.z, this.ceremonyCamLook.z, 5.2, dt);
      this.camera.position.copy(_currentCamPos);
      this.camera.lookAt(_currentLookAt);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 50, 4, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const lx = Math.cos(p.yaw);
    const lz = -Math.sin(p.yaw);

    // Direction of travel (for drift camera lookahead!)
    let camYaw = p.yaw;
    if (p.speedKmh > 25 && (this.cameraMode === 'chase' || this.cameraMode === 'drift')) {
      const moveYaw = Math.atan2(p.vx, p.vz);
      let diff = moveYaw - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const blend = this.cameraMode === 'drift' ? 0.48 : 0.26;
      camYaw = p.yaw + diff * blend;
    }

    const cfx = Math.sin(camYaw);
    const cfz = Math.cos(camYaw);

    if (this.cameraMode === 'hood') {
      _desiredCamPos.set(p.x + fx * 0.45, p.y + 1.38, p.z + fz * 0.45);
      _desiredLookAt.set(p.x + fx * 22, p.y + 1.15, p.z + fz * 22);
      _currentCamPos.copy(_desiredCamPos);
      _currentLookAt.copy(_desiredLookAt);
    } else if (this.cameraMode === 'aerial') {
      _desiredCamPos.set(p.x - cfx * 13.5, p.y + 11.5, p.z - cfz * 13.5);
      _desiredLookAt.set(p.x + fx * 6, p.y + 0.8, p.z + fz * 6);
      _currentCamPos.x = THREE.MathUtils.damp(_currentCamPos.x, _desiredCamPos.x, 7, dt);
      _currentCamPos.y = THREE.MathUtils.damp(_currentCamPos.y, _desiredCamPos.y, 7, dt);
      _currentCamPos.z = THREE.MathUtils.damp(_currentCamPos.z, _desiredCamPos.z, 7, dt);
      _currentLookAt.x = THREE.MathUtils.damp(_currentLookAt.x, _desiredLookAt.x, 9, dt);
      _currentLookAt.y = THREE.MathUtils.damp(_currentLookAt.y, _desiredLookAt.y, 9, dt);
      _currentLookAt.z = THREE.MathUtils.damp(_currentLookAt.z, _desiredLookAt.z, 9, dt);
    } else {
      const dist = this.cameraMode === 'drift' ? 6.6 : 7.6;
      const height = this.cameraMode === 'drift' ? 2.45 : 2.85;
      _desiredCamPos.set(
        p.x - cfx * dist + lx * 0.0,
        p.y + height,
        p.z - cfz * dist + lz * 0.0
      );
      _desiredLookAt.set(p.x + fx * 5.2, p.y + 1.15, p.z + fz * 5.2);

      const posLambda = this.cameraMode === 'drift' ? 9.5 : 11.0;
      _currentCamPos.x = THREE.MathUtils.damp(_currentCamPos.x, _desiredCamPos.x, posLambda, dt);
      _currentCamPos.y = THREE.MathUtils.damp(_currentCamPos.y, _desiredCamPos.y, 8.5, dt);
      _currentCamPos.z = THREE.MathUtils.damp(_currentCamPos.z, _desiredCamPos.z, posLambda, dt);
      _currentLookAt.x = THREE.MathUtils.damp(_currentLookAt.x, _desiredLookAt.x, 14, dt);
      _currentLookAt.y = THREE.MathUtils.damp(_currentLookAt.y, _desiredLookAt.y, 14, dt);
      _currentLookAt.z = THREE.MathUtils.damp(_currentLookAt.z, _desiredLookAt.z, 14, dt);
    }

    // Decaying Camera Shake on wall/curb hits
    if (this.cameraShake > 0.001) {
      const shakeAmt = this.cameraShake;
      this.camera.position.set(
        _currentCamPos.x + (Math.random() - 0.5) * shakeAmt,
        _currentCamPos.y + (Math.random() - 0.5) * shakeAmt * 0.7,
        _currentCamPos.z + (Math.random() - 0.5) * shakeAmt
      );
      this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 12, dt);
    } else {
      this.camera.position.copy(_currentCamPos);
    }
    this.camera.lookAt(_currentLookAt);

    // Dynamic Speed & Boost FOV
    const baseFov = this.cameraMode === 'hood' ? 68 : 60;
    const speedFov = Math.min(16, (p.speedKmh / 280) * 14) + (p.isBoosting ? 5.5 : 0);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, baseFov + speedFov, 7, dt);
    this.camera.updateProjectionMatrix();
  }

  private computeCurrentPosition(): number {
    if (this.lockedFinishPosition !== null) {
      return this.lockedFinishPosition;
    }
    const p = this.playerPhysics;
    let position = 1;
    for (const ai of this.aiRacers) {
      if (ai.physics.totalDistanceProgress > p.totalDistanceProgress) {
        position++;
      }
    }
    return position;
  }

  private emitTelemetry(): void {
    const p = this.playerPhysics;
    const position = this.computeCurrentPosition();

    const minimapNorm = [
      { ...this.track.projectToMinimap(p.x, p.z), heading: p.yaw },
      ...this.aiRacers.map((a) => ({
        ...this.track.projectToMinimap(a.physics.x, a.physics.z),
        heading: a.physics.yaw,
      })),
    ];

    this.callbacks.onTelemetry({
      speedKmh: Math.round(p.speedKmh),
      rpm: Math.round(p.rpm),
      maxRpm: 8200,
      gear: p.gear,
      nitro: Math.round(p.nitro),
      isBoosting: p.isBoosting,
      isDrifting: p.isDrifting,
      slipAngleDeg: Math.round(p.slipAngleDeg),
      activeDriftPoints: Math.round(p.activeDriftPoints),
      driftMultiplier: p.driftMultiplier,
      totalDriftScore: Math.round(p.totalDriftScore),
      lap: p.lap,
      totalLaps: this.track.spec.totalLaps,
      position,
      totalRacers: 1 + this.aiRacers.length,
      level: this.currentLevel,
      currentLapMs: p.currentLapMs,
      bestLapMs: p.bestLapMs,
      totalRaceMs: p.totalRaceMs,
      lastLapMs: p.lastLapMs,
      wrongWay: p.wrongWay,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      maxSpeedKmh: Math.round(p.maxSpeedKmh),
      cameraMode: this.cameraMode,
      minimapNorm,
      playerProgress: p.lapProgress,
      bannerMessage: this.bannerMessage,
      weather: this.weather.activeWeather,
      weatherTarget: this.weather.targetWeather,
      rainIntensity: Number(this.weather.rainIntensity.toFixed(2)),
      fogIntensity: Number(this.weather.fogIntensity.toFixed(2)),
      roadGripPct: Math.round(this.weather.roadGripMult * 100),
      podiumTop3: this.podiumTop3.length > 0 ? this.podiumTop3 : undefined,
      ceremonyStep: this.phase === 'ceremony' ? this.ceremonyStep : undefined,
      ceremonyHeadline: this.phase === 'ceremony' ? this.ceremonyHeadline : undefined,
      ceremonySubtext: this.phase === 'ceremony' ? this.ceremonySubtext : undefined,
    });
  }

  private applyWeatherAtmosphere(): void {
    const rain = this.weather.rainIntensity;
    const fog = this.weather.fogIntensity;
    const wet = this.weather.wetness;
    const isNight = this.baseAtmosphere === 'twilight';

    const fogTargetTop = isNight ? _fogNightTop : _fogDayTop;
    const fogTargetMid = isNight ? _fogNightMid : _fogDayMid;
    const fogTargetBot = isNight ? _fogNightBot : _fogDayBot;

    const rainBlend = rain * (isNight ? 0.35 : 0.56);
    const fogBlend = Math.min(0.60, fog * 0.58);

    if (this.skyDome) {
      const skyMat = this.skyDome.material as THREE.ShaderMaterial;
      _tmpColorA.copy(this.baseSkyTop).lerp(_rainSkyTop, rainBlend).lerp(fogTargetTop, fogBlend);
      (skyMat.uniforms.uTop.value as THREE.Color).copy(_tmpColorA);

      _tmpColorA.copy(this.baseSkyMid).lerp(_rainSkyMid, rainBlend).lerp(fogTargetMid, fogBlend);
      (skyMat.uniforms.uMid.value as THREE.Color).copy(_tmpColorA);

      _tmpColorA.copy(this.baseSkyBot).lerp(_rainSkyBot, rainBlend).lerp(fogTargetBot, fogBlend);
      (skyMat.uniforms.uBot.value as THREE.Color).copy(_tmpColorA);
    }

    _tmpColorB.copy(this.baseFogColor).lerp(_rainSkyBot, rainBlend * 0.85).lerp(fogTargetBot, fogBlend);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(_tmpColorB);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_tmpColorB);
      const pureFogStrength = Math.max(0, fog - rain * 0.28);
      this.scene.fog.density =
        this.baseFogDensity + rain * 0.0016 + pureFogStrength * 0.0048;
    }

    const dimFactor = 1 - Math.max(rain * 0.42, fog * 0.44);
    this.keyLight.intensity = this.baseKeyIntensity * dimFactor;
    this.hemiLight.intensity = this.baseHemiIntensity * (1 + fog * 0.14 - rain * 0.12);

    // Road surface wetness -> subtle damp sheen without blinding white specular reflection
    this.materials.asphalt.roughness = THREE.MathUtils.lerp(0.86, 0.44, wet);
    this.materials.asphalt.metalness = THREE.MathUtils.lerp(0.04, 0.10, wet);
    this.materials.asphalt.envMapIntensity = THREE.MathUtils.lerp(0.42, 0.68, wet);
    this.materials.asphalt.color.copy(_dryAsphaltColor).lerp(_wetAsphaltColor, wet);
    this.materials.curb.roughness = THREE.MathUtils.lerp(0.76, 0.50, wet);
  }

  private tick = (): void => {
    if (this.destroyed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerMessage = null;
      }
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const countStep = Math.ceil(this.countdownTimer);
      if (countStep < this.lastCountdownBeep && countStep >= 1) {
        this.lastCountdownBeep = countStep;
        this.audio.playCountdownTone(false);
        triggerHaptic(16);
      }
      this.updateGantryLights(countStep);

      const input = this.readPlayerInput(dt);
      stepCarPhysics(this.playerPhysics, input, this.track, dt, false);
      this.audio.updateContinuous({
        active: true,
        rpm: this.playerPhysics.rpm,
        throttle: input.throttle,
        slipAngleDeg: 0,
        speedKmh: 0,
        isBoosting: false,
        rainIntensity: this.weather.rainIntensity,
      });

      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        this.audio.playCountdownTone(true);
        triggerHaptic([30, 40, 65]);
        this.showBanner('GO!', 1.2);
        this.updateGantryLights(0);
        this.callbacks.onPhaseChange('racing');
        this.emitTelemetry();
      }
    } else if (this.phase === 'racing') {
      // Hitstop pause for crisp impact weight (35-60ms)
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        const input = this.readPlayerInput(dt);
        const gripMult = this.weather.roadGripMult;
        const events = stepCarPhysics(this.playerPhysics, input, this.track, dt, true, gripMult);

        for (const ai of this.aiRacers) {
          const aiInput = computeAiControl(ai.physics, this.track, ai.laneOffset, ai.skill, gripMult);
          stepCarPhysics(ai.physics, aiInput, this.track, dt, true, gripMult);
        }

        this.resolveCarCollisions();

        // Sync visuals & tire smoke / wet road water spray
        const wetness = this.weather.wetness;
        this.syncCarVisual(this.playerPhysics, this.playerVisual);
        this.effects.emitCarDrift(
          this.playerPhysics.x,
          this.playerPhysics.y,
          this.playerPhysics.z,
          this.playerPhysics.yaw,
          this.playerPhysics.vx,
          this.playerPhysics.vz,
          this.playerPhysics.slipAngleDeg,
          this.playerPhysics.isBraking,
          this.playerPhysics.speedKmh,
          dt,
          wetness
        );

        for (const ai of this.aiRacers) {
          this.syncCarVisual(ai.physics, ai.visual);
          this.effects.emitCarDrift(
            ai.physics.x,
            ai.physics.y,
            ai.physics.z,
            ai.physics.yaw,
            ai.physics.vx,
            ai.physics.vz,
            ai.physics.slipAngleDeg,
            ai.physics.isBraking,
            ai.physics.speedKmh,
            dt,
            wetness
          );
        }

        // Handle feedback events
        if (events.impactIntensity > 0 && events.impactWorldPos) {
          this.hitstopTimer = 0.045;
          this.cameraShake = Math.max(this.cameraShake, events.impactIntensity * 0.65);
          this.effects.emitSparks(
            events.impactWorldPos.x,
            events.impactWorldPos.y,
            events.impactWorldPos.z,
            14
          );
          this.audio.playImpact(events.impactIntensity);
          triggerHaptic(Math.round(22 + events.impactIntensity * 38));
        }
        if (events.driftBankedPoints > 50) {
          this.audio.playChime('drift');
          this.showBanner(`+${events.driftBankedPoints.toLocaleString()} DRIFT BANKED`, 1.4);
        }
        if (events.lapCompleted && !events.raceFinished) {
          this.audio.playChime('lap');
          this.showBanner(
            events.isNewBestLap ? `LAP ${this.playerPhysics.lap} · NEW BEST!` : `LAP ${this.playerPhysics.lap}`,
            2.2
          );
        }
        if (events.raceFinished) {
          this.lockedFinishPosition = this.computeCurrentPosition();
          this.audio.playChime('finish');
          triggerHaptic([35, 50, 75]);
          this.audio.updateContinuous({
            active: false,
            rpm: 950,
            throttle: 0,
            slipAngleDeg: 0,
            speedKmh: 0,
            isBoosting: false,
            rainIntensity: this.weather.rainIntensity,
          });

          // Build Top 3 Podium Standings across Player + AI Racers
          const allStandings = [
            {
              driverName: this.playerDriverName,
              physics: this.playerPhysics,
              isPlayer: true,
            },
            ...this.aiRacers.map((ai) => ({
              driverName: ai.driverName,
              physics: ai.physics,
              isPlayer: false,
            })),
          ].sort((a, b) => b.physics.totalDistanceProgress - a.physics.totalDistanceProgress);

          this.podiumTop3 = allStandings.slice(0, 3).map((entry, idx) => {
            const estTime = entry.physics.finished
              ? entry.physics.totalRaceMs
              : this.playerPhysics.totalRaceMs +
                Math.max(
                  350,
                  (this.playerPhysics.totalDistanceProgress -
                    entry.physics.totalDistanceProgress) *
                    32000
                );
            return {
              place: (idx + 1) as 1 | 2 | 3,
              driverName: entry.driverName,
              carId: entry.physics.spec.id,
              carName: entry.physics.spec.name,
              hexPrimary: entry.physics.spec.hexPrimary,
              hexAccent: entry.physics.spec.hexAccent,
              isPlayer: entry.isPlayer,
              finishTimeMs: Math.round(estTime),
            };
          });

          // Launch 3D Podium Trophy Presentation Ceremony
          const stageSample = this.track.getSampleAtProgress(0.015);
          const stageYaw = Math.atan2(stageSample.tangent.x, stageSample.tangent.z) + Math.PI;
          this.playerVisual.root.visible = false;
          for (const ai of this.aiRacers) ai.visual.root.visible = false;
          this.podium.start(
            this.podiumTop3,
            stageSample.point,
            stageYaw,
            this.materials,
            CAR_SPECS
          );
          const initRes = this.podium.update(0);
          this.ceremonyStep = initRes.step;
          this.ceremonyHeadline = initRes.headline;
          this.ceremonySubtext = initRes.subtext;
          this.ceremonyCamPos.copy(initRes.cameraPos);
          this.ceremonyCamLook.copy(initRes.cameraLookAt);

          this.phase = 'ceremony';
          this.emitTelemetry();
          this.callbacks.onPhaseChange('ceremony');
        }

        this.audio.updateContinuous({
          active: this.phase === 'racing',
          rpm: this.playerPhysics.rpm,
          throttle: input.throttle,
          slipAngleDeg: this.playerPhysics.slipAngleDeg,
          speedKmh: this.playerPhysics.speedKmh,
          isBoosting: this.playerPhysics.isBoosting,
          rainIntensity: this.weather.rainIntensity,
        });
      }
    } else if (this.phase === 'ceremony') {
      const res = this.podium.update(dt);
      this.ceremonyStep = res.step;
      this.ceremonyHeadline = res.headline;
      this.ceremonySubtext = res.subtext;
      this.ceremonyCamPos.copy(res.cameraPos);
      this.ceremonyCamLook.copy(res.cameraLookAt);
      if (res.newlyPresentedPlace) {
        this.audio.playTrophyChime(res.newlyPresentedPlace);
        this.emitTelemetry();
      }
    } else if (this.phase === 'title') {
      this.audio.updateContinuous({
        active: false,
        rpm: 950,
        throttle: 0,
        slipAngleDeg: 0,
        speedKmh: 0,
        isBoosting: false,
        rainIntensity: this.weather.rainIntensity,
      });
    }

    // Update Shadow Key Light to track player car (or podium during ceremony)
    const p = this.playerPhysics;
    const focusPos = this.phase === 'ceremony' ? this.podium.group.position : p;
    this.keyLight.position.set(focusPos.x + 42, focusPos.y + 72, focusPos.z - 32);
    this.keyLight.target.position.set(focusPos.x, focusPos.y, focusPos.z);
    if (this.skyDome) {
      this.skyDome.position.set(focusPos.x, focusPos.y, focusPos.z);
    }

    // Dynamic Weather Simulation & Atmosphere Blending
    const weatherUpdate = this.weather.update(
      dt,
      focusPos.x,
      focusPos.y,
      focusPos.z,
      this.phase === 'racing' ? p.vx : 0,
      this.phase === 'racing' ? p.vz : 0,
      this.camera.quaternion,
      this.phase === 'racing'
    );
    if (weatherUpdate.shiftedTo) {
      const msg =
        weatherUpdate.shiftedTo === 'rain'
          ? 'WEATHER SHIFT · LIGHT RAIN — REDUCED GRIP'
          : weatherUpdate.shiftedTo === 'fog'
            ? 'WEATHER SHIFT · COASTAL FOG — LOW VISIBILITY'
            : 'WEATHER SHIFT · SKIES CLEARING — GRIP RISING';
      this.showBanner(msg, 3.2);
      this.emitTelemetry();
    }
    this.applyWeatherAtmosphere();

    this.track.update?.(dt);
    this.effects.update(dt, this.camera);
    this.updateCamera(dt);

    // Emit HUD telemetry at ~24Hz
    this.telemetryAccum += dt;
    if (this.telemetryAccum >= 0.042) {
      this.telemetryAccum = 0;
      this.emitTelemetry();
    }

    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    this.clock.start();
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  public getTrackMinimapPoints(): { x: number; y: number }[] {
    return this.track.minimapPoints;
  }

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);

    this.audio.dispose();
    this.podium.dispose();
    this.weather.dispose();
    this.effects.dispose();
    this.track?.dispose();
    this.playerVisual?.dispose();
    for (const ai of this.aiRacers) {
      ai.visual.dispose();
    }
    this.skyDome?.geometry.dispose();
    (this.skyDome?.material as THREE.Material | undefined)?.dispose();
    this.materials.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
