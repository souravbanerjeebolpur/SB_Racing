import * as THREE from 'three';
import type { BuiltTrack, ClosestTrackInfo } from './tracks';
import type { CarSpec } from './types';

export interface ControlInput {
  throttle: number;  // 0..1
  brake: number;     // 0..1
  steer: number;     // -1 (right) .. +1 (left)
  handbrake: boolean;
  nitro: boolean;
}

export interface PhysicsEvents {
  impactIntensity: number; // 0..1
  impactWorldPos: THREE.Vector3 | null;
  driftBankedPoints: number;
  lapCompleted: boolean;
  isNewBestLap: boolean;
  raceFinished: boolean;
}

export interface CarPhysicsState {
  spec: CarSpec;
  x: number;
  y: number;
  z: number;
  yaw: number;          // radians, 0 = +Z, +yaw = turn left (+X)
  vx: number;
  vz: number;
  yawRate: number;
  steerAngle: number;
  wheelSpinAngle: number;
  bodyRoll: number;
  bodyPitch: number;
  speedMs: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  nitro: number;        // 0..100
  isBoosting: boolean;
  isBraking: boolean;
  isDrifting: boolean;
  slipAngleDeg: number;
  activeDriftPoints: number;
  driftMultiplier: number;
  driftComboTimer: number;
  totalDriftScore: number;
  sampleIndex: number;
  lapProgress: number;  // 0..1
  unwrappedProgress: number; // continuous progress starting slightly negative behind start line
  lap: number;          // 1..totalLaps
  totalDistanceProgress: number; // continuous progress or finish-time score
  currentLapMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  totalRaceMs: number;
  maxSpeedKmh: number;
  wrongWay: boolean;
  finished: boolean;
  lastTrackInfo: ClosestTrackInfo;
  // Internal lap gate checkpoints (must cross 0.25, 0.5, 0.75 before counting finish line)
  checkpointsPassed: number;
}

export function createCarPhysicsState(
  spec: CarSpec,
  track: BuiltTrack,
  gridProgress: number,
  lateralOffset: number
): CarPhysicsState {
  const sample = track.getSampleAtProgress(gridProgress);
  const px = sample.point.x + sample.right.x * lateralOffset;
  const pz = sample.point.z + sample.right.z * lateralOffset;
  const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
  const info = track.getClosestPoint(px, pz);

  return {
    spec,
    x: px,
    y: sample.point.y,
    z: pz,
    yaw,
    vx: 0,
    vz: 0,
    yawRate: 0,
    steerAngle: 0,
    wheelSpinAngle: 0,
    bodyRoll: 0,
    bodyPitch: 0,
    speedMs: 0,
    speedKmh: 0,
    rpm: 950,
    gear: 1,
    nitro: 100,
    isBoosting: false,
    isBraking: false,
    isDrifting: false,
    slipAngleDeg: 0,
    activeDriftPoints: 0,
    driftMultiplier: 1,
    driftComboTimer: 0,
    totalDriftScore: 0,
    sampleIndex: info.sampleIndex,
    lapProgress: info.progress,
    unwrappedProgress: info.progress > 0.5 ? info.progress - 1 : info.progress,
    lap: 1,
    totalDistanceProgress: info.progress > 0.5 ? info.progress - 1 : info.progress,
    currentLapMs: 0,
    bestLapMs: null,
    lastLapMs: null,
    totalRaceMs: 0,
    maxSpeedKmh: 0,
    wrongWay: false,
    finished: false,
    lastTrackInfo: info,
    checkpointsPassed: 0,
  };
}

/**
 * Pacejka-inspired lateral tire curve: peaks around ~10-12 deg slip,
 * then smoothly transitions into controllable sliding friction.
 */
function lateralTireCurve(slipRad: number, gripPeak: number): number {
  const clamped = THREE.MathUtils.clamp(slipRad, -1.25, 1.25);
  const B = 5.4;
  const C = 1.34;
  return gripPeak * Math.sin(C * Math.atan(B * clamped));
}

const _impactPos = new THREE.Vector3();

export function stepCarPhysics(
  state: CarPhysicsState,
  input: ControlInput,
  track: BuiltTrack,
  dt: number,
  raceActive: boolean,
  weatherGripMult = 1.0
): PhysicsEvents {
  const events: PhysicsEvents = {
    impactIntensity: 0,
    impactWorldPos: null,
    driftBankedPoints: 0,
    lapCompleted: false,
    isNewBestLap: false,
    raceFinished: false,
  };

  if (!raceActive) {
    // Allow idle revving during countdown
    const targetRpm = 950 + input.throttle * 5800;
    state.rpm = THREE.MathUtils.damp(state.rpm, targetRpm, 9, dt);
    return events;
  }

  if (!state.finished) {
    state.currentLapMs += dt * 1000;
    state.totalRaceMs += dt * 1000;
  }

  const { spec } = state;
  const fx = Math.sin(state.yaw);
  const fz = Math.cos(state.yaw);
  const lx = Math.cos(state.yaw);
  const lz = -Math.sin(state.yaw);

  let vLong = state.vx * fx + state.vz * fz;
  let vLat = state.vx * lx + state.vz * lz;
  const speed = Math.hypot(vLong, vLat);
  const speedKmh = speed * 3.6;

  // Speed-sensitive max steering angle (smooth & progressive across all speeds)
  const maxSteer = THREE.MathUtils.lerp(0.50, 0.19, THREE.MathUtils.clamp(speedKmh / 245, 0, 1));
  // Gentle counter-steer assist toward velocity direction when sliding
  const velocitySlip = speed > 7 ? Math.atan2(-vLat, Math.abs(vLong) + 2.5) : 0;
  const targetSteer = input.steer * maxSteer * spec.steerResponse + velocitySlip * 0.16;
  const steerRate = Math.abs(input.steer) > 0.05 ? 7.2 : 10.5;
  state.steerAngle = THREE.MathUtils.damp(state.steerAngle, THREE.MathUtils.clamp(targetSteer, -0.58, 0.58), steerRate, dt);

  // Track surface grip multiplier combined with dynamic weather road grip
  const info = track.getClosestPoint(state.x, state.z, state.sampleIndex);
  state.lastTrackInfo = info;
  state.sampleIndex = info.sampleIndex;

  const roadW = track.spec.roadHalfWidth;
  let trackSurfaceGrip = 1.0;
  let extraDrag = 0;
  if (info.distanceFromCenter > roadW + 1.65) {
    trackSurfaceGrip = 0.70;
    extraDrag = 2.1;
  } else if (info.distanceFromCenter > roadW) {
    trackSurfaceGrip = 0.94;
  }
  const weatherGrip = THREE.MathUtils.clamp(weatherGripMult, 0.72, 1.0);
  const surfaceGrip = trackSurfaceGrip * weatherGrip;

  // Nitro Boost
  const nitroMult = spec.nitroPowerMult ?? 1.0;
  const minNitroToEngage = state.isBoosting ? 0.5 : 5.0;
  const canBoost = input.nitro && state.nitro > minNitroToEngage && input.throttle > 0.1;
  state.isBoosting = canBoost;
  if (canBoost) {
    state.nitro = Math.max(0, state.nitro - 25 * dt);
  } else {
    state.nitro = Math.min(100, state.nitro + (state.isDrifting ? 15 : 3.2) * nitroMult * dt);
  }

  // Longitudinal engine / brake forces
  const topSpeedMs = (spec.topSpeedKmh * (canBoost ? 1.15 * Math.min(1.08, nitroMult) : 1.0)) / 3.6;
  const speedRatio = THREE.MathUtils.clamp(Math.abs(vLong) / topSpeedMs, 0, 1.15);
  const torqueCurve = Math.max(0.15, 1.0 - Math.pow(speedRatio, 1.75) * 0.85);

  let longForce = 0;
  let brakingNow = false;
  if (input.throttle > 0.01) {
    const boostMult = canBoost ? 1.48 * nitroMult : 1.0;
    longForce += input.throttle * spec.engineForce * torqueCurve * boostMult * surfaceGrip;
  }
  if (input.brake > 0.01) {
    if (vLong > 1.5) {
      longForce -= input.brake * 19500 * surfaceGrip;
      brakingNow = true;
    } else {
      // Reverse gear
      longForce -= input.brake * 6800 * surfaceGrip;
    }
  }
  if (input.handbrake && speed > 1.5) {
    longForce -= Math.sign(vLong) * 3200;
    brakingNow = true;
  }
  state.isBraking = brakingNow;

  // Aerodynamic drag + rolling resistance
  const aeroDrag = 0.58 * vLong * Math.abs(vLong);
  const rollingRes = (220 + extraDrag * 450) * vLong;
  const aLong = (longForce - aeroDrag - rollingRes) / spec.mass;

  // Dynamic longitudinal weight transfer (m*g*ratio +/- accel*h/L)
  const g = 9.81;
  const weightTransfer = THREE.MathUtils.clamp((aLong * 0.48) / 2.74, -0.26, 0.26);
  const frontLoadFrac = 0.52 - weightTransfer;
  const rearLoadFrac = 0.48 + weightTransfer;
  const totalWeightN = spec.mass * g;

  // Tire slip angles (front and rear)
  const lf = 1.38;
  const lr = 1.36;
  let fLatFront = 0;
  let fLatRear = 0;

  if (speed > 0.7) {
    const denom = Math.abs(vLong) + 2.2;
    const forwardSign = vLong >= -0.5 ? 1 : -1;
    const slipFront = Math.atan2(vLat + state.yawRate * lf, denom) - state.steerAngle * forwardSign;
    const slipRear = Math.atan2(vLat - state.yawRate * lr, denom);

    // Handbrake, heavy throttle, and wet asphalt modulate rear lateral grip
    const throttleOversteer = input.throttle > 0.65 && Math.abs(slipRear) > 0.14 ? 0.86 : 1.0;
    const wetThrottleSlide =
      weatherGrip < 0.88 && input.throttle > 0.8 ? 0.92 : 1.0;
    const hbFactor = input.handbrake ? 0.44 : 1.0;

    const muFront = 1.32 * surfaceGrip;
    const muRear =
      1.30 *
      spec.driftBalance *
      1.18 *
      surfaceGrip *
      hbFactor *
      throttleOversteer *
      wetThrottleSlide;

    // Note negative sign: positive slip angle (+vLat) produces restoring force in -X
    fLatFront = -lateralTireCurve(slipFront, muFront * frontLoadFrac * totalWeightN);
    fLatRear = -lateralTireCurve(slipRear, muRear * rearLoadFrac * totalWeightN);
  } else {
    // Low-speed settle damping
    vLat *= Math.max(0, 1 - 10 * dt);
    state.yawRate *= Math.max(0, 1 - 12 * dt);
  }

  // Integrate local velocities & yaw rate
  const yawInertia = spec.mass * 1.95;
  const lateralAccel = (fLatFront + fLatRear) / spec.mass - state.yawRate * vLong;
  const yawTorque = fLatFront * lf - fLatRear * lr;
  // Yaw damping keeps high-speed drifts controllable without spinning out uncontrollably
  const yawDamping = -state.yawRate * (4200 + (input.handbrake ? 800 : 2200));

  vLong += aLong * dt;
  vLat += lateralAccel * dt;
  // Add gentle lateral drift stabilization
  vLat *= Math.max(0, 1 - 0.32 * dt);
  state.yawRate += ((yawTorque + yawDamping) / yawInertia) * dt;
  state.yawRate = THREE.MathUtils.clamp(state.yawRate, -3.6, 3.6);

  // Stop creep at near-zero input
  if (Math.abs(vLong) < 0.25 && Math.abs(vLat) < 0.25 && input.throttle < 0.05 && input.brake < 0.05) {
    vLong = 0;
    vLat = 0;
    state.yawRate = 0;
  }

  state.yaw += state.yawRate * dt;
  const nfx = Math.sin(state.yaw);
  const nfz = Math.cos(state.yaw);
  const nlx = Math.cos(state.yaw);
  const nlz = -Math.sin(state.yaw);

  state.vx = vLong * nfx + vLat * nlx;
  state.vz = vLong * nfz + vLat * nlz;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // Barrier Wall Collision Check
  const postInfo = track.getClosestPoint(state.x, state.z, state.sampleIndex);
  state.lastTrackInfo = postInfo;
  state.sampleIndex = postInfo.sampleIndex;
  state.y = THREE.MathUtils.damp(state.y, postInfo.point.y, 24, dt);

  const wallLimit = roadW + 1.65 + 1.1 - 1.15; // road + curb + barrier offset - car half-width
  if (Math.abs(postInfo.lateralOffset) > wallLimit) {
    const sign = Math.sign(postInfo.lateralOffset);
    const excess = Math.abs(postInfo.lateralOffset) - wallLimit;
    // Push car inside barrier
    state.x -= postInfo.right.x * sign * excess;
    state.z -= postInfo.right.z * sign * excess;

    // Velocity along outward normal
    const vn = state.vx * postInfo.right.x * sign + state.vz * postInfo.right.z * sign;
    if (vn > 0) {
      const restitution = 0.32;
      state.vx -= (1 + restitution) * vn * postInfo.right.x * sign;
      state.vz -= (1 + restitution) * vn * postInfo.right.z * sign;
      // Friction scrub along wall
      state.vx *= 0.86;
      state.vz *= 0.86;
      state.yawRate *= 0.4;

      if (vn > 3.8) {
        events.impactIntensity = THREE.MathUtils.clamp((vn - 3.8) / 22, 0.15, 1.0);
        _impactPos.set(
          state.x + postInfo.right.x * sign * 0.9,
          state.y + 0.55,
          state.z + postInfo.right.z * sign * 0.9
        );
        events.impactWorldPos = _impactPos;
        // Heavy wall hit cancels active drift combo!
        if (vn > 8.5 && state.activeDriftPoints > 0) {
          state.activeDriftPoints = 0;
          state.driftMultiplier = 1;
          state.driftComboTimer = 0;
        }
      }
    }
  }

  // Recompute telemetry values
  state.speedMs = Math.hypot(state.vx, state.vz);
  state.speedKmh = state.speedMs * 3.6;
  if (state.speedKmh > state.maxSpeedKmh) {
    state.maxSpeedKmh = state.speedKmh;
  }

  // Visual wheel spin & suspension roll/pitch
  state.wheelSpinAngle += (vLong / 0.36) * dt;
  const targetRoll = THREE.MathUtils.clamp(-lateralAccel * 0.0045, -0.075, 0.075);
  const targetPitch = THREE.MathUtils.clamp(-aLong * 0.003, -0.045, 0.045);
  state.bodyRoll = THREE.MathUtils.damp(state.bodyRoll, targetRoll, 11, dt);
  state.bodyPitch = THREE.MathUtils.damp(state.bodyPitch, targetPitch, 11, dt);

  // Automatic 6-speed gearbox & RPM curve
  const gearTopSpeeds = [0, 58, 108, 158, 210, 258, 340];
  let gIdx = 1;
  while (gIdx < 6 && state.speedKmh > gearTopSpeeds[gIdx]) {
    gIdx++;
  }
  state.gear = vLong < -1 ? 0 : gIdx; // 0 = R
  const gearMin = gearTopSpeeds[Math.max(0, gIdx - 1)] * 0.68;
  const gearMax = gearTopSpeeds[gIdx];
  const gearFrac = THREE.MathUtils.clamp((state.speedKmh - gearMin) / Math.max(10, gearMax - gearMin), 0, 1);
  const wheelSpinBonus = state.isDrifting ? 950 : 0;
  const targetRpm = Math.min(8200, 1100 + gearFrac * 6200 + input.throttle * 650 + wheelSpinBonus);
  state.rpm = THREE.MathUtils.damp(state.rpm, targetRpm, 12, dt);

  // Slip Angle & Drift Scoring
  if (state.speedKmh > 18) {
    const moveYaw = Math.atan2(state.vx, state.vz);
    let diff = moveYaw - state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.slipAngleDeg = THREE.MathUtils.radToDeg(diff);
  } else {
    state.slipAngleDeg = 0;
  }

  const absSlip = Math.abs(state.slipAngleDeg);
  const driftNow =
    state.speedKmh > 38 &&
    absSlip > 11.5 &&
    absSlip < 88 &&
    vLong > 4 &&
    postInfo.distanceFromCenter <= roadW + 2.5;

  state.isDrifting = driftNow;

  if (driftNow) {
    const angleBonus = Math.sin(THREE.MathUtils.degToRad(Math.min(absSlip, 55)));
    const wetBonus = weatherGrip < 0.94 ? 1.15 : 1.0;
    const rate = state.speedKmh * 1.45 * angleBonus * wetBonus * state.driftMultiplier;
    state.activeDriftPoints += rate * dt;
    state.driftComboTimer = 1.45; // 1.45s link window between transitions!
    if (state.activeDriftPoints > 3500) state.driftMultiplier = 5;
    else if (state.activeDriftPoints > 1800) state.driftMultiplier = 4;
    else if (state.activeDriftPoints > 800) state.driftMultiplier = 3;
    else if (state.activeDriftPoints > 250) state.driftMultiplier = 2;
  } else if (state.activeDriftPoints > 0) {
    state.driftComboTimer -= dt;
    if (state.driftComboTimer <= 0) {
      const banked = Math.round(state.activeDriftPoints);
      state.totalDriftScore += banked;
      events.driftBankedPoints = banked;
      state.activeDriftPoints = 0;
      state.driftMultiplier = 1;
      state.driftComboTimer = 0;
    }
  }

  // Wrong-Way detection
  const headingDot = nfx * postInfo.tangent.x + nfz * postInfo.tangent.z;
  state.wrongWay = state.speedKmh > 20 && headingDot < -0.35;

  // Lap, Continuous Unwrapped Progress & Checkpoint Tracking
  const prevProg = state.lapProgress;
  const currProg = postInfo.progress;
  let deltaProg = currProg - prevProg;
  if (deltaProg > 0.5) deltaProg -= 1;
  if (deltaProg < -0.5) deltaProg += 1;
  state.unwrappedProgress += deltaProg;
  state.lapProgress = currProg;

  if (currProg > 0.2 && currProg < 0.45 && state.checkpointsPassed === 0) {
    state.checkpointsPassed = 1;
  } else if (currProg > 0.45 && currProg < 0.72 && state.checkpointsPassed === 1) {
    state.checkpointsPassed = 2;
  } else if (currProg > 0.72 && state.checkpointsPassed === 2) {
    state.checkpointsPassed = 3;
  }

  // Crossed start/finish line forward (from >0.85 to <0.15)
  if (
    prevProg > 0.85 &&
    currProg < 0.15 &&
    state.checkpointsPassed >= 3 &&
    state.unwrappedProgress >= state.lap - 0.15 &&
    !state.finished
  ) {
    const lapTime = state.currentLapMs;
    state.lastLapMs = lapTime;
    if (state.bestLapMs === null || lapTime < state.bestLapMs) {
      state.bestLapMs = lapTime;
      events.isNewBestLap = true;
    }
    events.lapCompleted = true;
    state.checkpointsPassed = 0;

    if (state.lap >= track.spec.totalLaps) {
      state.finished = true;
      events.raceFinished = true;
      // Bank any active drift on finish
      if (state.activeDriftPoints > 0) {
        const banked = Math.round(state.activeDriftPoints);
        state.totalDriftScore += banked;
        events.driftBankedPoints = banked;
        state.activeDriftPoints = 0;
      }
    } else {
      state.lap += 1;
      state.currentLapMs = 0;
    }
  }

  // Continuous total progress for live race standings
  if (state.finished) {
    state.totalDistanceProgress =
      track.spec.totalLaps + 100 - state.totalRaceMs * 0.00001;
  } else {
    state.totalDistanceProgress = state.unwrappedProgress;
  }

  return events;
}

/**
 * Simple AI lookahead driver controller for rival racers on track.
 */
export function computeAiControl(
  ai: CarPhysicsState,
  track: BuiltTrack,
  laneOffset: number,
  skillFactor: number,
  weatherGripMult = 1.0
): ControlInput {
  const sampleCount = track.samples.length;
  const lookAheadSteps = Math.round(THREE.MathUtils.clamp(ai.speedKmh / 14, 7, 22));
  const targetSample = track.samples[(ai.sampleIndex + lookAheadSteps) % sampleCount];
  const farSample = track.samples[(ai.sampleIndex + lookAheadSteps * 2) % sampleCount];

  const tx = targetSample.point.x + targetSample.right.x * laneOffset;
  const tz = targetSample.point.z + targetSample.right.z * laneOffset;
  const desiredYaw = Math.atan2(tx - ai.x, tz - ai.z);

  let yawErr = desiredYaw - ai.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;

  const steer = THREE.MathUtils.clamp(yawErr * 2.2, -1, 1);

  const cornerCurv = Math.max(Math.abs(targetSample.curvature), Math.abs(farSample.curvature));
  const gripCornerScale = THREE.MathUtils.lerp(
    0.84,
    1.0,
    THREE.MathUtils.clamp((weatherGripMult - 0.75) / 0.25, 0, 1)
  );
  const baseCornerSpeed = THREE.MathUtils.clamp(255 - cornerCurv * 680, 95, 255) * gripCornerScale;
  const targetCornerSpeed = baseCornerSpeed * THREE.MathUtils.clamp(skillFactor, 0.55, 1.15);

  let throttle = THREE.MathUtils.clamp(0.92 * skillFactor, 0.55, 1.0);
  let brake = 0;
  if (ai.speedKmh > targetCornerSpeed + 18) {
    throttle = 0.08;
    brake = 0.72;
  } else if (ai.speedKmh > targetCornerSpeed) {
    throttle = 0.42;
  }

  const useNitro =
    skillFactor > 0.78 &&
    cornerCurv < 0.055 &&
    ai.speedKmh < (skillFactor > 0.96 ? 275 : 225) &&
    ai.nitro > (skillFactor > 0.96 ? 20 : 45);

  return {
    throttle,
    brake,
    steer,
    handbrake: false,
    nitro: useNitro,
  };
}
