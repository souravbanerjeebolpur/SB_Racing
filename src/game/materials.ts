import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';

export interface MaterialLibrary {
  asphalt: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  barrierMetal: THREE.MeshStandardMaterial;
  barrierAccent: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  alloyRim: THREE.MeshStandardMaterial;
  brakeDisc: THREE.MeshStandardMaterial;
  brakeCaliper: THREE.MeshStandardMaterial;
  windshieldGlass: THREE.MeshPhysicalMaterial;
  headlightEmissive: THREE.MeshStandardMaterial;
  taillightIdle: THREE.MeshStandardMaterial;
  gantrySteel: THREE.MeshStandardMaterial;
  gantryBanner: THREE.MeshStandardMaterial;
  terrain: THREE.MeshStandardMaterial;
  oceanWater: THREE.MeshStandardMaterial;
  skidmark: THREE.MeshBasicMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  createCarPaint: (colorHex: number) => THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

export function createMaterialLibrary(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): MaterialLibrary {
  const disposable: THREE.Material[] = [];
  const reg = <T extends THREE.Material>(m: T): T => {
    disposable.push(m);
    return m;
  };

  const asphalt = reg(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltColor,
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.86,
      metalness: 0.04,
      envMapIntensity: 0.42,
    })
  );

  const curb = reg(
    new THREE.MeshStandardMaterial({
      map: textures.curbColor,
      roughness: 0.76,
      metalness: 0.03,
      envMapIntensity: 0.45,
    })
  );

  const barrierMetal = reg(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.75,
      roughness: 0.42,
      envMapIntensity: 0.62,
    })
  );

  const barrierAccent = reg(
    new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      metalness: 0.15,
      roughness: 0.52,
    })
  );

  const carbon = reg(
    new THREE.MeshStandardMaterial({
      map: textures.carbonColor,
      roughness: 0.62,
      metalness: 0.22,
    })
  );

  const rubber = reg(
    new THREE.MeshStandardMaterial({
      map: textures.tireTread,
      color: 0x202226,
      roughness: 0.88,
      metalness: 0.04,
    })
  );

  const alloyRim = reg(
    new THREE.MeshStandardMaterial({
      color: 0xd4d8e0,
      metalness: 0.92,
      roughness: 0.18,
    })
  );

  const brakeDisc = reg(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.9,
      roughness: 0.28,
    })
  );

  const brakeCaliper = reg(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      metalness: 0.4,
      roughness: 0.35,
    })
  );

  const windshieldGlass = reg(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1220,
      metalness: 0.1,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      ior: 1.52,
      transparent: true,
      opacity: isSoftwareGl ? 0.85 : 0.9,
    })
  );

  const headlightEmissive = reg(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      emissive: 0xe0f2fe,
      emissiveIntensity: 1.9,
      roughness: 0.2,
    })
  );

  const taillightIdle = reg(
    new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      emissive: 0xef4444,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    })
  );

  const gantrySteel = reg(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.32,
    })
  );

  const gantryBanner = reg(
    new THREE.MeshStandardMaterial({
      map: textures.startFinishBanner,
      roughness: 0.45,
      metalness: 0.1,
      emissive: 0x111827,
      emissiveIntensity: 0.35,
    })
  );

  const terrain = reg(
    new THREE.MeshStandardMaterial({
      map: textures.terrainGrass,
      roughness: 0.95,
      metalness: 0.0,
    })
  );

  const oceanWater = reg(
    new THREE.MeshStandardMaterial({
      map: textures.oceanRipple,
      color: 0x1cb5d8,
      roughness: 0.22,
      metalness: 0.42,
      envMapIntensity: 0.55,
    })
  );

  const skidmark = reg(
    new THREE.MeshBasicMaterial({
      map: textures.skidmarkAlpha,
      color: 0x090a0c,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );

  const contactShadow = reg(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    })
  );

  const createCarPaint = (colorHex: number): THREE.MeshPhysicalMaterial => {
    return reg(
      new THREE.MeshPhysicalMaterial({
        color: colorHex,
        metalness: 0.72,
        roughness: 0.28,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0.92,
      })
    );
  };

  return {
    asphalt,
    curb,
    barrierMetal,
    barrierAccent,
    carbon,
    rubber,
    alloyRim,
    brakeDisc,
    brakeCaliper,
    windshieldGlass,
    headlightEmissive,
    taillightIdle,
    gantrySteel,
    gantryBanner,
    terrain,
    oceanWater,
    skidmark,
    contactShadow,
    createCarPaint,
    dispose: () => {
      disposable.forEach((m) => m.dispose());
    },
  };
}
