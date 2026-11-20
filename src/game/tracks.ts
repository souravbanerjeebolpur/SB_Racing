import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';
import type { TrackId, TrackSpec } from './types';
import { TRACK_SPECS } from './types';

export interface TrackSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  progress: number;
  curvature: number;
}

export interface ClosestTrackInfo {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  lateralOffset: number;
  distanceFromCenter: number;
  progress: number;
  sampleIndex: number;
  curvature: number;
}

export interface BuiltTrack {
  spec: TrackSpec;
  group: THREE.Group;
  samples: TrackSample[];
  totalLength: number;
  minimapPoints: { x: number; y: number }[];
  mapBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  gantryLights: THREE.Mesh[];
  getClosestPoint: (x: number, z: number, hintIdx?: number) => ClosestTrackInfo;
  getSampleAtProgress: (t: number) => TrackSample;
  projectToMinimap: (x: number, z: number) => { x: number; y: number };
  update?: (dt: number) => void;
  dispose: () => void;
}

const TRACK_WAYPOINTS: Record<TrackId, [number, number, number][]> = {
  'apex-circuit': [
    [0, 0, -120],
    [0, 0, 60],
    [0, 0.8, 220],
    [110, 4.0, 340],
    [285, 6.0, 320],
    [395, 3.5, 150],
    [395, 0.8, -110],
    [310, 1.5, -310],
    [135, 1.5, -365],
    [0, 0, -285],
  ],
  'harbor-touge': [
    [0, 1, -155],
    [0, 1, -10],
    [0, 2, 115],
    [70, 5.0, 220],
    [205, 9.5, 250],
    [315, 11.5, 165],
    [265, 9.0, 48],
    [145, 5.5, 35],
    [135, 3.5, -70],
    [255, 1.5, -135],
    [290, 0.0, -255],
    [175, 0.0, -330],
    [65, 1.0, -275],
    [12, 1.0, -215],
  ],
  'palm-causeway': [
    [0, 2.2, -155],
    [0, 2.2, 0],
    [0, 2.6, 135],
    [65, 4.0, 240],
    [195, 5.2, 265],
    [320, 4.0, 185],
    [345, 2.4, 55],
    [295, 2.2, -45],
    [355, 3.0, -155],
    [310, 4.2, -280],
    [175, 3.2, -320],
    [65, 2.2, -255],
  ],
};

/**
 * Builds composite 3-part procedural Coconut Palm Tree geometries (curved ringed trunk,
 * coconut cluster, and 9 arched feather palm fronds) anchored at bottom-center (0, 0, 0).
 */
function createCoconutPalmGeometries(
  regGeo: <T extends THREE.BufferGeometry>(g: T) => T
): {
  trunkGeo: THREE.BufferGeometry;
  coconutGeo: THREE.BufferGeometry;
  frondGeo: THREE.BufferGeometry;
} {
  // 1. Curved tapered palm trunk leaning toward +X
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18, 2.4, 0.04),
    new THREE.Vector3(0.55, 5.3, 0.08),
    new THREE.Vector3(0.95, 8.2, 0.12),
  ]);

  const rings = 12;
  const radSegs = 8;
  const trunkPositions: number[] = [];
  const trunkIndices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const center = trunkCurve.getPointAt(t);
    const tangent = trunkCurve.getTangentAt(t).normalize();
    const basisX = new THREE.Vector3(1, 0, 0);
    const binormal = new THREE.Vector3().crossVectors(tangent, basisX).normalize();
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    const baseRad = THREE.MathUtils.lerp(0.36, 0.16, t);
    const ringNotch = r % 2 === 0 ? 1.0 : 0.92;
    const radius = baseRad * ringNotch;

    for (let s = 0; s < radSegs; s++) {
      const theta = (s / radSegs) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const vx = center.x + (normal.x * cos + binormal.x * sin) * radius;
      const vy = center.y + (normal.y * cos + binormal.y * sin) * radius;
      const vz = center.z + (normal.z * cos + binormal.z * sin) * radius;
      trunkPositions.push(vx, vy, vz);
    }

    if (r < rings) {
      const rowA = r * radSegs;
      const rowB = (r + 1) * radSegs;
      for (let s = 0; s < radSegs; s++) {
        const nextS = (s + 1) % radSegs;
        trunkIndices.push(rowA + s, rowB + s, rowB + nextS);
        trunkIndices.push(rowA + s, rowB + nextS, rowA + nextS);
      }
    }
  }

  const trunkGeo = regGeo(new THREE.BufferGeometry());
  trunkGeo.setAttribute('position', new THREE.Float32BufferAttribute(trunkPositions, 3));
  trunkGeo.setIndex(trunkIndices);
  trunkGeo.computeVertexNormals();

  // 2. Coconut Cluster nestled below the crown
  const crownTop = new THREE.Vector3(0.95, 8.2, 0.12);
  const cocoParts: THREE.BufferGeometry[] = [];
  const cocoOffsets: [number, number, number][] = [
    [0.24, -0.34, 0.16],
    [-0.22, -0.36, 0.18],
    [0.05, -0.38, -0.24],
    [0.2, -0.52, -0.14],
  ];
  for (const [ox, oy, oz] of cocoOffsets) {
    const sph = new THREE.SphereGeometry(0.22, 8, 7).toNonIndexed();
    sph.deleteAttribute('uv');
    sph.translate(crownTop.x + ox, crownTop.y + oy, crownTop.z + oz);
    cocoParts.push(sph);
  }
  const coconutGeo = regGeo(mergeGeometries(cocoParts, false));
  cocoParts.forEach((p) => p.dispose());
  coconutGeo.computeVertexNormals();

  // 3. Arched 9-Frond Tropical Palm Crown
  const buildFrondBlade = (yaw: number, pitch: number, length: number): THREE.BufferGeometry => {
    const segs = 7;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const z = t * length;
      // Arches slightly up first, then droops smoothly downward
      const y = Math.sin(t * Math.PI * 0.75) * 0.65 - t * t * 1.45;
      const halfW = Math.sin(Math.pow(t, 0.65) * Math.PI) * 0.46 + (1 - t) * 0.08;
      const foldDrop = halfW * 0.34;
      // Left edge, midrib spine, right edge
      verts.push(
        -halfW, y - foldDrop, z,
        0, y, z,
        halfW, y - foldDrop, z
      );
      if (i < segs) {
        const r0 = i * 3;
        const r1 = (i + 1) * 3;
        idx.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
        idx.push(r0 + 1, r1 + 1, r0 + 2, r0 + 2, r1 + 1, r1 + 2);
      }
    }
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    raw.setIndex(idx);
    const g = raw.toNonIndexed();
    raw.dispose();
    g.rotateX(-pitch);
    g.rotateY(yaw);
    g.translate(crownTop.x, crownTop.y + 0.05, crownTop.z);
    g.computeVertexNormals();
    return g;
  };

  const frondParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 6; f++) {
    const yaw = (f / 6) * Math.PI * 2 + 0.2;
    frondParts.push(buildFrondBlade(yaw, 0.14, 3.45));
  }
  for (let f = 0; f < 4; f++) {
    const yaw = (f / 4) * Math.PI * 2 + 0.55;
    frondParts.push(buildFrondBlade(yaw, 0.42, 2.75));
  }
  const frondGeo = regGeo(mergeGeometries(frondParts, false));
  frondParts.forEach((p) => p.dispose());
  frondGeo.computeVertexNormals();

  return { trunkGeo, coconutGeo, frondGeo };
}

export function buildTrack(
  trackId: TrackId,
  materials: MaterialLibrary,
  isSoftwareGl: boolean
): BuiltTrack {
  const spec = TRACK_SPECS.find((t) => t.id === trackId) ?? TRACK_SPECS[0];
  const rawPoints = TRACK_WAYPOINTS[spec.id];
  const controlVectors = rawPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(controlVectors, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();

  const SAMPLE_COUNT = 720;
  const samples: TrackSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    // Horizontal right vector relative to forward tangent
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    samples.push({
      point,
      tangent,
      right,
      progress: t,
      curvature: 0,
    });
  }

  // Compute signed curvature per sample
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const prev = samples[(i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const next = samples[(i + 2) % SAMPLE_COUNT];
    const dTan = new THREE.Vector3().subVectors(next.tangent, prev.tangent);
    samples[i].curvature = dTan.dot(samples[i].right);
  }

  // Compute bounding box for terrain & minimap
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    if (s.point.x < minX) minX = s.point.x;
    if (s.point.x > maxX) maxX = s.point.x;
    if (s.point.z < minZ) minZ = s.point.z;
    if (s.point.z > maxZ) maxZ = s.point.z;
  }
  const pad = 28;
  const mapBounds = {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  };

  const projectToMinimap = (x: number, z: number) => {
    const spanX = Math.max(1, mapBounds.maxX - mapBounds.minX);
    const spanZ = Math.max(1, mapBounds.maxZ - mapBounds.minZ);
    const span = Math.max(spanX, spanZ);
    const offsetX = (span - spanX) * 0.5;
    const offsetZ = (span - spanZ) * 0.5;
    return {
      x: (x - mapBounds.minX + offsetX) / span,
      y: 1 - (z - mapBounds.minZ + offsetZ) / span,
    };
  };

  const minimapPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 6) {
    minimapPoints.push(projectToMinimap(samples[i].point.x, samples[i].point.z));
  }

  const group = new THREE.Group();
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const regGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const regMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  const roadHalfW = spec.roadHalfWidth;
  const curbW = 1.65;
  const wallOffset = roadHalfW + curbW + 1.1;
  const isOceanCauseway = spec.id === 'palm-causeway';

  // --- 1. Road Ribbon Mesh ---
  const roadPos: number[] = [];
  const roadNorm: number[] = [];
  const roadUvs: number[] = [];
  const roadIdx: number[] = [];

  const curbPos: number[] = [];
  const curbNorm: number[] = [];
  const curbUvs: number[] = [];
  const curbIdx: number[] = [];

  const barrierPos: number[] = [];
  const barrierNorm: number[] = [];
  const barrierUvs: number[] = [];
  const barrierIdx: number[] = [];

  const uvRepeatLength = 18; // meters per texture tile

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const s = samples[i % SAMPLE_COUNT];
    const dist = (i / SAMPLE_COUNT) * totalLength;
    const vCoord = dist / uvRepeatLength;

    // Road left & right edge
    const pL = s.point.clone().addScaledVector(s.right, -roadHalfW);
    const pR = s.point.clone().addScaledVector(s.right, roadHalfW);
    roadPos.push(pL.x, pL.y + 0.02, pL.z, pR.x, pR.y + 0.02, pR.z);
    roadNorm.push(0, 1, 0, 0, 1, 0);
    roadUvs.push(0, vCoord, 1, vCoord);

    // Left & Right Curbs (slightly raised outer edge)
    const cLIn = s.point.clone().addScaledVector(s.right, -roadHalfW);
    const cLOut = s.point.clone().addScaledVector(s.right, -(roadHalfW + curbW));
    const cRIn = s.point.clone().addScaledVector(s.right, roadHalfW);
    const cROut = s.point.clone().addScaledVector(s.right, roadHalfW + curbW);
    curbPos.push(
      cLOut.x, cLOut.y + 0.07, cLOut.z,
      cLIn.x, cLIn.y + 0.025, cLIn.z,
      cRIn.x, cRIn.y + 0.025, cRIn.z,
      cROut.x, cROut.y + 0.07, cROut.z
    );
    curbNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    const curbV = dist / 4.0;
    curbUvs.push(0, curbV, 1, curbV, 0, curbV, 1, curbV);

    // Armco Metal Guardrail Ribbons (left & right vertical bands)
    const bLBot = s.point.clone().addScaledVector(s.right, -wallOffset);
    const bLTop = bLBot.clone();
    bLBot.y += 0.25;
    bLTop.y += 0.92;

    const bRBot = s.point.clone().addScaledVector(s.right, wallOffset);
    const bRTop = bRBot.clone();
    bRBot.y += 0.25;
    bRTop.y += 0.92;

    barrierPos.push(
      bLBot.x, bLBot.y, bLBot.z,
      bLTop.x, bLTop.y, bLTop.z,
      bRBot.x, bRBot.y, bRBot.z,
      bRTop.x, bRTop.y, bRTop.z
    );
    barrierNorm.push(
      s.right.x, 0, s.right.z,
      s.right.x, 0, s.right.z,
      -s.right.x, 0, -s.right.z,
      -s.right.x, 0, -s.right.z
    );
    barrierUvs.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

    if (i < SAMPLE_COUNT) {
      const r0 = i * 2;
      roadIdx.push(r0, r0 + 1, r0 + 2, r0 + 1, r0 + 3, r0 + 2);

      const c0 = i * 4;
      curbIdx.push(c0, c0 + 1, c0 + 4, c0 + 1, c0 + 5, c0 + 4);
      curbIdx.push(c0 + 2, c0 + 3, c0 + 6, c0 + 3, c0 + 7, c0 + 6);

      const b0 = i * 4;
      barrierIdx.push(b0, b0 + 4, b0 + 1, b0 + 1, b0 + 4, b0 + 5);
      barrierIdx.push(b0 + 2, b0 + 3, b0 + 6, b0 + 3, b0 + 7, b0 + 6);
    }
  }

  const roadGeo = regGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNorm, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIdx);
  const roadMesh = new THREE.Mesh(roadGeo, materials.asphalt);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const curbGeo = regGeo(new THREE.BufferGeometry());
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
  curbGeo.setAttribute('normal', new THREE.Float32BufferAttribute(curbNorm, 3));
  curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(curbUvs, 2));
  curbGeo.setIndex(curbIdx);
  const curbMesh = new THREE.Mesh(curbGeo, materials.curb);
  curbMesh.receiveShadow = true;
  group.add(curbMesh);

  const barrierGeo = regGeo(new THREE.BufferGeometry());
  barrierGeo.setAttribute('position', new THREE.Float32BufferAttribute(barrierPos, 3));
  barrierGeo.setAttribute('normal', new THREE.Float32BufferAttribute(barrierNorm, 3));
  barrierGeo.setAttribute('uv', new THREE.Float32BufferAttribute(barrierUvs, 2));
  barrierGeo.setIndex(barrierIdx);
  const barrierMatDouble = regMat(materials.barrierMetal.clone());
  barrierMatDouble.side = THREE.DoubleSide;
  const barrierMesh = new THREE.Mesh(barrierGeo, barrierMatDouble);
  barrierMesh.castShadow = true;
  barrierMesh.receiveShadow = true;
  group.add(barrierMesh);

  // --- 2. Instanced Guardrail Posts ---
  const postStep = 6;
  const postCount = Math.floor(SAMPLE_COUNT / postStep) * 2;
  const postGeo = regGeo(new THREE.BoxGeometry(0.18, 1.0, 0.18));
  const postInstanced = new THREE.InstancedMesh(postGeo, materials.gantrySteel, postCount);
  postInstanced.castShadow = true;
  const dummy = new THREE.Object3D();
  let pIdx = 0;
  for (let i = 0; i < SAMPLE_COUNT && pIdx + 1 < postCount; i += postStep) {
    const s = samples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    for (const side of [-1, 1]) {
      dummy.position.copy(s.point).addScaledVector(s.right, side * (wallOffset + 0.14));
      dummy.position.y += 0.45;
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInstanced.setMatrixAt(pIdx++, dummy.matrix);
    }
  }
  postInstanced.count = pIdx;
  postInstanced.instanceMatrix.needsUpdate = true;
  postInstanced.computeBoundingSphere();
  group.add(postInstanced);

  const centerX = (mapBounds.minX + mapBounds.maxX) * 0.5;
  const centerZ = (mapBounds.minZ + mapBounds.maxZ) * 0.5;

  // --- 3. Terrain Grounding & Ocean ---
  if (isOceanCauseway) {
    // Causeway Sandy-Turf Coastal Embankment sloping into the ocean on BOTH sides of the road
    const embPos: number[] = [];
    const embCol: number[] = [];
    const embIdx: number[] = [];

    const cWetSand = new THREE.Color(0xa68c5e);
    const cDrySand = new THREE.Color(0xe6cb97);
    const cVergeSand = new THREE.Color(0xd5be85);
    const cTurf = new THREE.Color(0x4b803d);

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const s = samples[i % SAMPLE_COUNT];
      const offsets: [number, number, THREE.Color][] = [
        [-(wallOffset + 12.2), -2.5, cWetSand],
        [-(wallOffset + 7.8), -0.55, cDrySand],
        [-(wallOffset + 4.8), s.point.y - 0.09, cVergeSand],
        [-(wallOffset - 0.6), s.point.y - 0.04, cTurf],
        [wallOffset - 0.6, s.point.y - 0.04, cTurf],
        [wallOffset + 4.8, s.point.y - 0.09, cVergeSand],
        [wallOffset + 7.8, -0.55, cDrySand],
        [wallOffset + 12.2, -2.5, cWetSand],
      ];

      for (const [lat, py, col] of offsets) {
        embPos.push(
          s.point.x + s.right.x * lat,
          py,
          s.point.z + s.right.z * lat
        );
        embCol.push(col.r, col.g, col.b);
      }

      if (i < SAMPLE_COUNT) {
        const baseA = i * 8;
        const baseB = (i + 1) * 8;
        for (let k = 0; k < 7; k++) {
          embIdx.push(baseA + k, baseA + k + 1, baseB + k);
          embIdx.push(baseA + k + 1, baseB + k + 1, baseB + k);
        }
      }
    }

    const embGeo = regGeo(new THREE.BufferGeometry());
    embGeo.setAttribute('position', new THREE.Float32BufferAttribute(embPos, 3));
    embGeo.setAttribute('color', new THREE.Float32BufferAttribute(embCol, 3));
    embGeo.setIndex(embIdx);
    embGeo.computeVertexNormals();
    const embMat = regMat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    const embMesh = new THREE.Mesh(embGeo, embMat);
    embMesh.receiveShadow = true;
    group.add(embMesh);

    // Wide Tropical Ocean spanning BOTH sides of the entire road and horizon
    const waterGeo = regGeo(new THREE.PlaneGeometry(3600, 3600));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMesh = new THREE.Mesh(waterGeo, materials.oceanWater);
    waterMesh.position.set(centerX, -1.2, centerZ);
    waterMesh.receiveShadow = true;
    group.add(waterMesh);
  } else {
    // Continuous Terrain Grounding for mountain/coastal hill circuits
    const terrainSize = 1800;
    const terrainSegs = 96;
    const terrainGeo = regGeo(new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs));
    terrainGeo.rotateX(-Math.PI / 2);
    const tPos = terrainGeo.attributes.position;
    terrainGeo.translate(centerX, 0, centerZ);

    for (let vi = 0; vi < tPos.count; vi++) {
      const vx = tPos.getX(vi);
      const vz = tPos.getZ(vi);
      let bestD2 = Infinity;
      let bestY = 0;
      for (let si = 0; si < SAMPLE_COUNT; si += 6) {
        const sp = samples[si].point;
        const dx = vx - sp.x;
        const dz = vz - sp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestY = sp.y;
        }
      }
      const dist = Math.sqrt(bestD2);
      let y = bestY - 0.18;
      if (dist > wallOffset + 4) {
        const hillBlend = THREE.MathUtils.clamp((dist - (wallOffset + 4)) / 55, 0, 1);
        const ridge =
          Math.sin(vx * 0.015) * Math.cos(vz * 0.014) * 14 +
          Math.sin(vx * 0.032 + vz * 0.021) * 5.5;
        const coastalDrop = spec.id === 'apex-circuit' && vx > 450 ? -10 * hillBlend : 0;
        y = bestY - 0.18 + hillBlend * (Math.max(-2.5, ridge + 4) + coastalDrop);
      }
      tPos.setY(vi, y);
    }
    terrainGeo.computeVertexNormals();
    const terrainMat = regMat(materials.terrain.clone());
    if (spec.id === 'harbor-touge') {
      terrainMat.color.setHex(0x28303b);
    }
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);

    const waterGeo = regGeo(new THREE.PlaneGeometry(3600, 3600));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = regMat(
      new THREE.MeshStandardMaterial({
        color: spec.atmosphere === 'sunset' ? 0x0f3b57 : 0x071426,
        roughness: 0.14,
        metalness: 0.72,
      })
    );
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(centerX, -4.2, centerZ);
    group.add(waterMesh);
  }

  // --- 4. Start / Finish Gantry + Racing Lights + Checkered Line ---
  const s0 = samples[0];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(s0.point);
  gantryGroup.rotation.y = Math.atan2(s0.tangent.x, s0.tangent.z);

  const gantrySpan = roadHalfW * 2 + 4.4;
  const legGeo = regGeo(new THREE.CylinderGeometry(0.32, 0.38, 8.2, 12));
  const legL = new THREE.Mesh(legGeo, materials.gantrySteel);
  legL.position.set(-gantrySpan * 0.5, 4.1, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, materials.gantrySteel);
  legR.position.set(gantrySpan * 0.5, 4.1, 0);
  legR.castShadow = true;
  gantryGroup.add(legL, legR);

  const truss = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(gantrySpan + 1.2, 2.3, 1.1)),
    materials.gantrySteel
  );
  truss.position.set(0, 7.6, 0);
  truss.castShadow = true;
  gantryGroup.add(truss);

  const bannerFront = new THREE.Mesh(
    regGeo(new THREE.PlaneGeometry(gantrySpan - 1.2, 1.95)),
    materials.gantryBanner
  );
  bannerFront.position.set(0, 7.6, -0.57);
  bannerFront.rotation.y = Math.PI;
  const bannerBack = new THREE.Mesh(
    regGeo(new THREE.PlaneGeometry(gantrySpan - 1.2, 1.95)),
    materials.gantryBanner
  );
  bannerBack.position.set(0, 7.6, 0.57);
  gantryGroup.add(bannerFront, bannerBack);

  const gantryLights: THREE.Mesh[] = [];
  const podGeo = regGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 16));
  podGeo.rotateX(Math.PI / 2);
  for (let li = -1; li <= 1; li++) {
    const podMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0xef4444,
        emissiveIntensity: 0.2,
        roughness: 0.2,
      })
    );
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.set(li * 1.15, 6.1, -0.45);
    gantryGroup.add(pod);
    gantryLights.push(pod);
  }

  const lineStrip = new THREE.Mesh(
    regGeo(new THREE.PlaneGeometry(roadHalfW * 1.92, 2.2)),
    regMat(
      new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      })
    )
  );
  lineStrip.rotation.x = -Math.PI / 2;
  lineStrip.position.y = 0.035;
  gantryGroup.add(lineStrip);
  group.add(gantryGroup);

  // --- 5. Instanced Roadside Light Poles ---
  const poleCount = isOceanCauseway ? 36 : 40;
  const poleShaftGeo = regGeo(new THREE.CylinderGeometry(0.11, 0.16, 7.2, 8));
  const poleHeadGeo = regGeo(new THREE.BoxGeometry(1.5, 0.22, 0.55));
  const poleInst = new THREE.InstancedMesh(poleShaftGeo, materials.gantrySteel, poleCount);
  const lampHeadMat = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: spec.atmosphere === 'twilight' ? 0xfbbf24 : 0xfef08a,
      emissiveIntensity: spec.atmosphere === 'twilight' ? 2.8 : 1.1,
      roughness: 0.3,
    })
  );
  const lampInst = new THREE.InstancedMesh(poleHeadGeo, lampHeadMat, poleCount);
  for (let i = 0; i < poleCount; i++) {
    const s = samples[Math.floor((i / poleCount) * SAMPLE_COUNT)];
    const side = i % 2 === 0 ? 1 : -1;
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    dummy.position.copy(s.point).addScaledVector(s.right, side * (wallOffset + 1.15));
    dummy.position.y += 3.6;
    dummy.rotation.set(0, yaw + (side === 1 ? Math.PI / 2 : -Math.PI / 2), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.y += 3.55;
    dummy.position.addScaledVector(s.right, -side * 0.7);
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  lampInst.instanceMatrix.needsUpdate = true;
  poleInst.computeBoundingSphere();
  lampInst.computeBoundingSphere();
  group.add(poleInst, lampInst);

  // --- 6. Roadside Trees (Coconut Palms along both sides for Palm Oceanway, Pine Groves for others) ---
  if (isOceanCauseway) {
    const { trunkGeo, coconutGeo, frondGeo } = createCoconutPalmGeometries(regGeo);
    const palmTrunkMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c583a,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    const coconutMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0x5c4224,
        roughness: 0.65,
        metalness: 0.04,
      })
    );
    const palmFrondMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0x3a9442,
        roughness: 0.58,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    );

    const maxPalms = 220;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, palmTrunkMat, maxPalms);
    const cocoInst = new THREE.InstancedMesh(coconutGeo, coconutMat, maxPalms);
    const frondInst = new THREE.InstancedMesh(frondGeo, palmFrondMat, maxPalms);
    if (!isSoftwareGl) {
      trunkInst.castShadow = true;
      frondInst.castShadow = true;
    }

    let palmIdx = 0;
    const frondTint = new THREE.Color();

    // Place coconut trees along BOTH sides of the road in the coastal verge between barrier and ocean
    const sampleStep = 8;
    for (let i = 0; i < SAMPLE_COUNT && palmIdx < maxPalms - 24; i += sampleStep) {
      const s = samples[i];
      const roadYaw = Math.atan2(s.tangent.x, s.tangent.z);

      for (const side of [-1, 1]) {
        // Keep clear of the start/finish grandstand footprint
        if (side === -1 && (i < 18 || i > SAMPLE_COUNT - 18)) continue;

        const vergeLat = wallOffset + 2.55 + ((i * 7 + (side > 0 ? 3 : 0)) % 9) * 0.14;
        const px = s.point.x + s.right.x * side * vergeLat;
        const pz = s.point.z + s.right.z * side * vergeLat;

        // Verify clearance from any other part of the loop
        let tooClose = false;
        for (let si = 0; si < SAMPLE_COUNT; si += 12) {
          const sp = samples[si].point;
          const d2 = (px - sp.x) ** 2 + (pz - sp.z) ** 2;
          if (d2 < (wallOffset + 1.2) ** 2) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const sc = 0.88 + (((i * 13 + (side > 0 ? 5 : 11)) % 30) / 100);
        // Lean naturally outward toward the ocean
        const leanYaw = roadYaw + (side === 1 ? -Math.PI / 2 : Math.PI / 2) + (((i % 5) - 2) * 0.18);

        dummy.position.set(px, s.point.y - 0.08, pz);
        dummy.rotation.set(0, leanYaw, 0);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();

        trunkInst.setMatrixAt(palmIdx, dummy.matrix);
        cocoInst.setMatrixAt(palmIdx, dummy.matrix);
        frondInst.setMatrixAt(palmIdx, dummy.matrix);
        frondTint.setHSL(0.30 + ((i % 5) - 2) * 0.014, 0.56, 0.36 + (i % 3) * 0.03);
        frondInst.setColorAt(palmIdx, frondTint);
        palmIdx++;
      }
    }

    // Add 3 small tropical sandy islets in the turquoise lagoon with coconut palm clusters
    const isletCenters: [number, number, number][] = [
      [145, -15, 18],
      [210, 115, 16],
      [185, -175, 20],
    ];
    const isletMat = regMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6cb97,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    for (let k = 0; k < isletCenters.length; k++) {
      const [ix, iz, ir] = isletCenters[k];
      const moundGeo = regGeo(new THREE.CylinderGeometry(ir * 0.65, ir, 2.6, 18));
      const mound = new THREE.Mesh(moundGeo, isletMat);
      mound.position.set(ix, -1.1, iz);
      mound.receiveShadow = true;
      group.add(mound);

      for (let p = 0; p < 5 && palmIdx < maxPalms; p++) {
        const ang = (p / 5) * Math.PI * 2 + k * 0.7;
        const distR = ir * 0.32;
        const sc = 0.92 + (p % 3) * 0.11;
        dummy.position.set(ix + Math.cos(ang) * distR, 0.15, iz + Math.sin(ang) * distR);
        dummy.rotation.set(0, ang, 0);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();

        trunkInst.setMatrixAt(palmIdx, dummy.matrix);
        cocoInst.setMatrixAt(palmIdx, dummy.matrix);
        frondInst.setMatrixAt(palmIdx, dummy.matrix);
        frondTint.setHSL(0.31, 0.58, 0.38);
        frondInst.setColorAt(palmIdx, frondTint);
        palmIdx++;
      }
    }

    trunkInst.count = palmIdx;
    cocoInst.count = palmIdx;
    frondInst.count = palmIdx;
    trunkInst.instanceMatrix.needsUpdate = true;
    cocoInst.instanceMatrix.needsUpdate = true;
    frondInst.instanceMatrix.needsUpdate = true;
    if (frondInst.instanceColor) frondInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    cocoInst.computeBoundingSphere();
    frondInst.computeBoundingSphere();
    group.add(trunkInst, cocoInst, frondInst);
  } else {
    // Scenic Instanced Pine Trees outside hill circuits
    const treeCount = 130;
    const trunkGeo = regGeo(new THREE.CylinderGeometry(0.28, 0.42, 3.2, 7));
    const canopyGeo = regGeo(new THREE.ConeGeometry(2.1, 6.4, 8));
    const trunkMat = regMat(new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.92 }));
    const canopyMat = regMat(
      new THREE.MeshStandardMaterial({
        color: spec.atmosphere === 'sunset' ? 0x2d5a36 : 0x1e3a2f,
        roughness: 0.85,
      })
    );
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    if (!isSoftwareGl) {
      canopyInst.castShadow = true;
    }

    let tPlaced = 0;
    let attempts = 0;
    const treeColor = new THREE.Color();
    while (tPlaced < treeCount && attempts < 900) {
      attempts++;
      const sample = samples[Math.floor((attempts * 37) % SAMPLE_COUNT)];
      const side = attempts % 2 === 0 ? 1 : -1;
      const radialDist = wallOffset + 12 + ((attempts * 19) % 75);
      const candX = sample.point.x + sample.right.x * side * radialDist;
      const candZ = sample.point.z + sample.right.z * side * radialDist;

      let tooClose = false;
      let nearestY = sample.point.y;
      let minD2 = Infinity;
      for (let si = 0; si < SAMPLE_COUNT; si += 8) {
        const sp = samples[si].point;
        const d2 = (candX - sp.x) ** 2 + (candZ - sp.z) ** 2;
        if (d2 < minD2) {
          minD2 = d2;
          nearestY = sp.y;
        }
        if (d2 < (wallOffset + 8) ** 2) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const sc = 0.85 + ((attempts * 13) % 35) / 100;
      const baseY = nearestY - 0.15;
      dummy.position.set(candX, baseY + 1.6 * sc, candZ);
      dummy.rotation.set(0, (attempts * 1.3) % (Math.PI * 2), 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(tPlaced, dummy.matrix);

      dummy.position.set(candX, baseY + 5.2 * sc, candZ);
      dummy.updateMatrix();
      canopyInst.setMatrixAt(tPlaced, dummy.matrix);
      treeColor.setHSL(0.34 + ((attempts % 7) - 3) * 0.015, 0.38, spec.atmosphere === 'sunset' ? 0.28 : 0.2);
      canopyInst.setColorAt(tPlaced, treeColor);
      tPlaced++;
    }
    trunkInst.count = tPlaced;
    canopyInst.count = tPlaced;
    trunkInst.instanceMatrix.needsUpdate = true;
    canopyInst.instanceMatrix.needsUpdate = true;
    if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    canopyInst.computeBoundingSphere();
    group.add(trunkInst, canopyInst);
  }

  // Grandstand beside start/finish straight (with grounded pier base on ocean causeway)
  const standGroup = new THREE.Group();
  standGroup.position.copy(s0.point).addScaledVector(s0.right, -(wallOffset + 12));
  standGroup.position.z += 15;
  standGroup.rotation.y = Math.atan2(s0.tangent.x, s0.tangent.z);
  if (isOceanCauseway) {
    const pierDeck = new THREE.Mesh(
      regGeo(new THREE.BoxGeometry(16, 4.2, 48)),
      regMat(new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 0.9 }))
    );
    pierDeck.position.set(0, -2.1, 0);
    pierDeck.receiveShadow = true;
    standGroup.add(pierDeck);
  }
  const standBase = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(10, 6.5, 42)),
    regMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 }))
  );
  standBase.position.y = 3.25;
  standBase.castShadow = true;
  standBase.receiveShadow = true;
  const standRoof = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(13, 0.6, 44)),
    materials.barrierAccent
  );
  standRoof.position.set(1.5, 8.8, 0);
  standRoof.rotation.z = -0.15;
  standRoof.castShadow = true;
  standGroup.add(standBase, standRoof);
  group.add(standGroup);

  // --- Closest Point Query (with optional hint for O(1) fast lookup) ---
  const _tmpVec = new THREE.Vector3();
  const getClosestPoint = (x: number, z: number, hintIdx?: number): ClosestTrackInfo => {
    let bestIdx = 0;
    let bestD2 = Infinity;

    if (hintIdx !== undefined && hintIdx >= 0 && hintIdx < SAMPLE_COUNT) {
      const windowRadius = 26;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (hintIdx + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
        const sp = samples[idx].point;
        const dx = x - sp.x;
        const dz = z - sp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    }

    if (bestD2 > 45 * 45) {
      bestD2 = Infinity;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const sp = samples[i].point;
        const dx = x - sp.x;
        const dz = z - sp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
    }

    const curr = samples[bestIdx];
    const next = samples[(bestIdx + 1) % SAMPLE_COUNT];
    const prev = samples[(bestIdx - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];

    _tmpVec.set(x - curr.point.x, 0, z - curr.point.z);
    const segLen = curr.point.distanceTo(next.point);
    const projT = segLen > 0.001 ? THREE.MathUtils.clamp(_tmpVec.dot(curr.tangent) / segLen, -0.5, 0.5) : 0;
    const interpPoint = curr.point.clone();
    if (projT >= 0) {
      interpPoint.lerp(next.point, projT);
    } else {
      interpPoint.lerp(prev.point, -projT);
    }

    const dx = x - interpPoint.x;
    const dz = z - interpPoint.z;
    const lateralOffset = dx * curr.right.x + dz * curr.right.z;

    return {
      point: interpPoint,
      tangent: curr.tangent,
      right: curr.right,
      lateralOffset,
      distanceFromCenter: Math.abs(lateralOffset),
      progress: ((bestIdx + projT + SAMPLE_COUNT) % SAMPLE_COUNT) / SAMPLE_COUNT,
      sampleIndex: bestIdx,
      curvature: curr.curvature,
    };
  };

  const getSampleAtProgress = (t: number): TrackSample => {
    const wrapped = ((t % 1) + 1) % 1;
    const idx = Math.floor(wrapped * SAMPLE_COUNT) % SAMPLE_COUNT;
    return samples[idx];
  };

  const update = isOceanCauseway
    ? (dt: number) => {
        if (materials.oceanWater.map) {
          materials.oceanWater.map.offset.x = (materials.oceanWater.map.offset.x + dt * 0.028) % 1;
          materials.oceanWater.map.offset.y = (materials.oceanWater.map.offset.y + dt * 0.016) % 1;
        }
      }
    : undefined;

  return {
    spec,
    group,
    samples,
    totalLength,
    minimapPoints,
    mapBounds,
    gantryLights,
    getClosestPoint,
    getSampleAtProgress,
    projectToMinimap,
    update,
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
    },
  };
}
