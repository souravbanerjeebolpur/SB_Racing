import * as THREE from 'three';
import type { MaterialLibrary } from './materials';
import type { CarSpec } from './types';

export interface CarVisualHandle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheelFL: THREE.Group;
  wheelFR: THREE.Group;
  wheelRL: THREE.Group;
  wheelRR: THREE.Group;
  wheelSpinGroups: THREE.Group[];
  taillightMat: THREE.MeshStandardMaterial;
  nitroFlames: THREE.Mesh[];
  paintMat: THREE.MeshPhysicalMaterial;
  updateVisuals: (params: {
    wheelSpinAngle: number;
    steerAngle: number;
    bodyRoll: number;
    bodyPitch: number;
    isBraking: boolean;
    isBoosting: boolean;
    speedKmh: number;
  }) => void;
  dispose: () => void;
}

/**
 * Builds a composite 10+ part procedural racing coupe in Three.js.
 * Local space convention:
 *   +Z = Forward (front nose)
 *   -Z = Rear (diffuser / GT wing / exhaust)
 *   +X = Left side
 *   -X = Right side
 *   +Y = Up (ground contact at y = 0)
 */
export function createCarMesh(
  spec: CarSpec,
  materials: MaterialLibrary,
  colorOverride?: number
): CarVisualHandle {
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const regGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const paintMat = materials.createCarPaint(colorOverride ?? spec.primaryColor);
  const accentMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor,
    metalness: 0.45,
    roughness: 0.3,
  });
  disposableMats.push(accentMat);

  const taillightMat = materials.taillightIdle.clone();
  disposableMats.push(taillightMat);

  // 1. Contact shadow grounded at y = 0.025
  const shadowPlane = new THREE.Mesh(
    regGeo(new THREE.PlaneGeometry(2.75, 5.15)),
    materials.contactShadow
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  // 2. Sculpted side-profile extruded chassis (Primary silhouette)
  // Extrude along X from -0.92 to +0.92 (centered)
  const chassisShape = new THREE.Shape();
  chassisShape.moveTo(-2.18, 0.24); // rear diffuser bottom
  chassisShape.lineTo(2.22, 0.20);  // front splitter bottom
  chassisShape.lineTo(2.28, 0.44);  // front nose tip
  chassisShape.lineTo(1.75, 0.68);  // hood front
  chassisShape.lineTo(0.82, 0.80);  // windshield base
  chassisShape.lineTo(0.18, 1.18);  // roof front
  chassisShape.lineTo(-0.78, 1.16); // roof rear
  chassisShape.lineTo(-1.75, 0.88); // fastback deck
  chassisShape.lineTo(-2.16, 0.80); // rear tail lip
  chassisShape.lineTo(-2.22, 0.40); // rear bumper
  chassisShape.closePath();

  const bodyExtrude = regGeo(
    new THREE.ExtrudeGeometry(chassisShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.08,
      bevelSegments: 3,
      steps: 1,
    })
  );
  // Rotate so shape's X maps to +Z (front), shape's Y maps to +Y, extrude depth maps to X
  bodyExtrude.rotateY(-Math.PI / 2);
  bodyExtrude.translate(0.86, 0, 0);
  bodyExtrude.computeVertexNormals();

  const mainBody = new THREE.Mesh(bodyExtrude, paintMat);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  bodyGroup.add(mainBody);

  // 3. Racing hood/roof accent stripe
  const stripeGeo = regGeo(new THREE.BoxGeometry(0.46, 0.03, 2.85));
  const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
  stripeMesh.position.set(0, 0.81, 0.65);
  stripeMesh.rotation.x = 0.08;
  bodyGroup.add(stripeMesh);

  // 4. Aerodynamic tinted greenhouse / cockpit canopy
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(0.86, 0.78);
  canopyShape.lineTo(0.22, 1.17);
  canopyShape.lineTo(-0.74, 1.15);
  canopyShape.lineTo(-1.54, 0.88);
  canopyShape.closePath();

  const canopyGeo = regGeo(
    new THREE.ExtrudeGeometry(canopyShape, {
      depth: 1.38,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    })
  );
  canopyGeo.rotateY(-Math.PI / 2);
  canopyGeo.translate(0.69, 0.02, 0);
  const canopyMesh = new THREE.Mesh(canopyGeo, materials.windshieldGlass);
  canopyMesh.castShadow = true;
  bodyGroup.add(canopyMesh);

  // 5. Widebody Fender Flares (4 corners)
  const flareGeo = regGeo(new THREE.BoxGeometry(0.22, 0.36, 0.94));
  const flarePositions: [number, number, number][] = [
    [0.95, 0.44, 1.38],
    [-0.95, 0.44, 1.38],
    [0.97, 0.46, -1.36],
    [-0.97, 0.46, -1.36],
  ];
  flarePositions.forEach(([fx, fy, fz]) => {
    const flare = new THREE.Mesh(flareGeo, paintMat);
    flare.position.set(fx, fy, fz);
    flare.castShadow = true;
    bodyGroup.add(flare);
  });

  // 6. Carbon Fiber Front Splitter, Side Skirts & Rear Diffuser
  const splitter = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.98, 0.06, 0.56)),
    materials.carbon
  );
  splitter.position.set(0, 0.21, 2.12);
  splitter.castShadow = true;
  bodyGroup.add(splitter);

  const skirtGeo = regGeo(new THREE.BoxGeometry(0.14, 0.08, 2.1));
  const skirtL = new THREE.Mesh(skirtGeo, materials.carbon);
  skirtL.position.set(0.96, 0.22, 0);
  const skirtR = new THREE.Mesh(skirtGeo, materials.carbon);
  skirtR.position.set(-0.96, 0.22, 0);
  bodyGroup.add(skirtL, skirtR);

  const diffuser = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.76, 0.16, 0.36)),
    materials.carbon
  );
  diffuser.position.set(0, 0.27, -2.14);
  bodyGroup.add(diffuser);

  // 7. GT Rear Spoiler Wing + Twin Anodized Pylons (Enhanced per CarBodyStyle)
  const wingHeight = spec.bodyStyle === 'prototype' || spec.bodyStyle === 'lemans' ? 1.24 : 1.14;
  const wingBlade = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.02, 0.055, 0.36)),
    materials.carbon
  );
  wingBlade.position.set(0, wingHeight, -2.06);
  wingBlade.rotation.x = 0.14;
  wingBlade.castShadow = true;
  bodyGroup.add(wingBlade);

  if (spec.bodyStyle === 'prototype' || spec.bodyStyle === 'lemans' || spec.bodyStyle === 'hyper') {
    const upperWing = new THREE.Mesh(
      regGeo(new THREE.BoxGeometry(1.94, 0.04, 0.22)),
      accentMat
    );
    upperWing.position.set(0, wingHeight + 0.12, -2.14);
    upperWing.rotation.x = 0.2;
    bodyGroup.add(upperWing);
  }

  const endplateGeo = regGeo(new THREE.BoxGeometry(0.04, 0.26, 0.44));
  const endplateL = new THREE.Mesh(endplateGeo, paintMat);
  endplateL.position.set(1.01, wingHeight - 0.01, -2.06);
  const endplateR = new THREE.Mesh(endplateGeo, paintMat);
  endplateR.position.set(-1.01, wingHeight - 0.01, -2.06);
  bodyGroup.add(endplateL, endplateR);

  const pylonH = wingHeight - 0.8;
  const pylonGeo = regGeo(new THREE.BoxGeometry(0.05, pylonH, 0.18));
  const pylonL = new THREE.Mesh(pylonGeo, materials.alloyRim);
  pylonL.position.set(0.46, 0.78 + pylonH * 0.5, -2.02);
  pylonL.rotation.x = -0.22;
  const pylonR = new THREE.Mesh(pylonGeo, materials.alloyRim);
  pylonR.position.set(-0.46, 0.78 + pylonH * 0.5, -2.02);
  pylonR.rotation.x = -0.22;
  bodyGroup.add(pylonL, pylonR);

  // Stylish Body-Kit Aero Parts by CarBodyStyle
  if (spec.bodyStyle === 'lemans' || spec.bodyStyle === 'prototype') {
    // Dorsal Aerodynamic Shark Fin + Roof Intake Scoop
    const sharkFinShape = new THREE.Shape();
    sharkFinShape.moveTo(-0.72, 1.15);
    sharkFinShape.lineTo(-1.95, 1.12);
    sharkFinShape.lineTo(-1.95, 0.86);
    sharkFinShape.lineTo(-0.72, 0.96);
    sharkFinShape.closePath();
    const sharkGeo = regGeo(
      new THREE.ExtrudeGeometry(sharkFinShape, { depth: 0.04, bevelEnabled: false })
    );
    sharkGeo.rotateY(-Math.PI / 2);
    sharkGeo.translate(0.02, 0, 0);
    const sharkMesh = new THREE.Mesh(sharkGeo, accentMat);
    sharkMesh.castShadow = true;
    bodyGroup.add(sharkMesh);

    const roofScoop = new THREE.Mesh(
      regGeo(new THREE.BoxGeometry(0.38, 0.16, 0.65)),
      materials.carbon
    );
    roofScoop.position.set(0, 1.24, -0.22);
    bodyGroup.add(roofScoop);
  }

  if (spec.bodyStyle === 'widebody' || spec.bodyStyle === 'hyper' || spec.bodyStyle === 'prototype') {
    // Front Dive-Plane Canards + Hood Vents
    const canardGeo = regGeo(new THREE.BoxGeometry(0.24, 0.035, 0.36));
    const canardL = new THREE.Mesh(canardGeo, accentMat);
    canardL.position.set(0.98, 0.36, 1.98);
    canardL.rotation.z = 0.18;
    const canardR = new THREE.Mesh(canardGeo, accentMat);
    canardR.position.set(-0.98, 0.36, 1.98);
    canardR.rotation.z = -0.18;
    bodyGroup.add(canardL, canardR);

    const ventGeo = regGeo(new THREE.BoxGeometry(0.32, 0.03, 0.44));
    const ventL = new THREE.Mesh(ventGeo, materials.carbon);
    ventL.position.set(0.42, 0.77, 1.28);
    ventL.rotation.x = 0.12;
    const ventR = new THREE.Mesh(ventGeo, materials.carbon);
    ventR.position.set(-0.42, 0.77, 1.28);
    ventR.rotation.x = 0.12;
    bodyGroup.add(ventL, ventR);
  }

  if (spec.bodyStyle === 'cyber' || spec.bodyStyle === 'prototype') {
    // Glowing Neon Side Skirt Trim Blades
    const neonTrimMat = new THREE.MeshStandardMaterial({
      color: spec.accentColor,
      emissive: spec.accentColor,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    });
    disposableMats.push(neonTrimMat);
    const bladeGeo = regGeo(new THREE.BoxGeometry(0.05, 0.05, 2.04));
    const bladeL = new THREE.Mesh(bladeGeo, neonTrimMat);
    bladeL.position.set(1.03, 0.25, 0);
    const bladeR = new THREE.Mesh(bladeGeo, neonTrimMat);
    bladeR.position.set(-1.03, 0.25, 0);
    bodyGroup.add(bladeL, bladeR);
  }

  // 8. LED Headlight Blades & Wraparound Tail-Light Bar
  const headlightGeo = regGeo(new THREE.BoxGeometry(0.44, 0.08, 0.12));
  const hlLeft = new THREE.Mesh(headlightGeo, materials.headlightEmissive);
  hlLeft.position.set(0.62, 0.56, 2.22);
  hlLeft.rotation.y = 0.16;
  const hlRight = new THREE.Mesh(headlightGeo, materials.headlightEmissive);
  hlRight.position.set(-0.62, 0.56, 2.22);
  hlRight.rotation.y = -0.16;
  bodyGroup.add(hlLeft, hlRight);

  const tailBar = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.66, 0.09, 0.08)),
    taillightMat
  );
  tailBar.position.set(0, 0.68, -2.21);
  bodyGroup.add(tailBar);

  // 9. Twin Exhaust Pipes & Nitro Flame Cones
  const exhaustGeo = regGeo(new THREE.CylinderGeometry(0.065, 0.075, 0.22, 16));
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, materials.alloyRim);
  exL.position.set(0.52, 0.28, -2.24);
  const exR = new THREE.Mesh(exhaustGeo, materials.alloyRim);
  exR.position.set(-0.52, 0.28, -2.24);
  bodyGroup.add(exL, exR);

  const flameGeo = regGeo(new THREE.ConeGeometry(0.085, 0.65, 12));
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });
  disposableMats.push(flameMat);

  const flameL = new THREE.Mesh(flameGeo, flameMat);
  flameL.position.set(0.52, 0.28, -2.62);
  flameL.visible = false;
  const flameR = new THREE.Mesh(flameGeo, flameMat);
  flameR.position.set(-0.52, 0.28, -2.62);
  flameR.visible = false;
  bodyGroup.add(flameL, flameR);

  // 10. Four Articulated Multi-Part Wheels (Tire + 5-Spoke Rim + Brake Disc + Caliper)
  const wheelRadius = 0.36;
  const wheelWidth = 0.30;
  const tireGeo = regGeo(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 28));
  tireGeo.rotateZ(Math.PI / 2);

  const rimGeo = regGeo(new THREE.CylinderGeometry(0.24, 0.24, wheelWidth + 0.015, 20));
  rimGeo.rotateZ(Math.PI / 2);

  const spokeGeo = regGeo(new THREE.BoxGeometry(wheelWidth + 0.025, 0.42, 0.055));
  const rotorGeo = regGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 18));
  rotorGeo.rotateZ(Math.PI / 2);
  const caliperGeo = regGeo(new THREE.BoxGeometry(0.08, 0.13, 0.11));

  const wheelSpinGroups: THREE.Group[] = [];

  const createWheel = (isLeft: boolean, x: number, z: number): THREE.Group => {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(x, wheelRadius, z);

    const spinGroup = new THREE.Group();
    steerPivot.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    const tire = new THREE.Mesh(tireGeo, materials.rubber);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(rimGeo, materials.alloyRim);
    spinGroup.add(rim);

    // 3 cross spokes for crisp visual rotation read
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeo, materials.carbon);
      spoke.rotation.x = (s * Math.PI) / 3;
      spinGroup.add(spoke);
    }

    const rotor = new THREE.Mesh(rotorGeo, materials.brakeDisc);
    rotor.position.x = isLeft ? -0.04 : 0.04;
    spinGroup.add(rotor);

    // Non-spinning brake caliper attached to steerPivot
    const caliper = new THREE.Mesh(caliperGeo, materials.brakeCaliper);
    caliper.position.set(isLeft ? 0.06 : -0.06, 0.06, -0.11);
    steerPivot.add(caliper);

    root.add(steerPivot);
    return steerPivot;
  };

  const wheelFL = createWheel(true, 0.94, 1.38);
  const wheelFR = createWheel(false, -0.94, 1.38);
  const wheelRL = createWheel(true, 0.96, -1.36);
  const wheelRR = createWheel(false, -0.96, -1.36);

  return {
    root,
    bodyGroup,
    wheelFL,
    wheelFR,
    wheelRL,
    wheelRR,
    wheelSpinGroups,
    taillightMat,
    nitroFlames: [flameL, flameR],
    paintMat,
    updateVisuals: ({
      wheelSpinAngle,
      steerAngle,
      bodyRoll,
      bodyPitch,
      isBraking,
      isBoosting,
      speedKmh,
    }) => {
      wheelFL.rotation.y = steerAngle;
      wheelFR.rotation.y = steerAngle;
      for (let i = 0; i < wheelSpinGroups.length; i++) {
        wheelSpinGroups[i].rotation.x = wheelSpinAngle;
      }
      // Subtle suspension bounce + roll + pitch
      const bounce = Math.sin(wheelSpinAngle * 0.5) * Math.min(speedKmh / 240, 1) * 0.008;
      bodyGroup.position.y = bounce;
      bodyGroup.rotation.z = bodyRoll;
      bodyGroup.rotation.x = bodyPitch;

      taillightMat.emissiveIntensity = isBraking ? 6.5 : 1.9;
      flameL.visible = isBoosting;
      flameR.visible = isBoosting;
      if (isBoosting) {
        const flicker = 0.85 + Math.random() * 0.45;
        flameL.scale.set(1, 1, flicker);
        flameR.scale.set(1, 1, flicker);
      }
    },
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
    },
  };
}
