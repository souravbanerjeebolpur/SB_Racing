import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltColor: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  curbColor: THREE.CanvasTexture;
  carbonColor: THREE.CanvasTexture;
  tireTread: THREE.CanvasTexture;
  skidmarkAlpha: THREE.CanvasTexture;
  smokeParticle: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  terrainGrass: THREE.CanvasTexture;
  oceanRipple: THREE.CanvasTexture;
  startFinishBanner: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.max(1, Math.min(maxAnisotropy, 16));

  // 1. Asphalt Road Color Texture (with subtle aggregate, lane shoulders, center dashed line)
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const actx = asphaltCanvas.getContext('2d')!;
  actx.fillStyle = '#25282e';
  actx.fillRect(0, 0, 512, 512);

  // Subtle aggregate grain
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 28 + Math.floor(Math.random() * 24);
    actx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
    actx.fillRect(x, y, 2, 2);
  }
  // Darker tire racing-line groove strips
  const grooveGrad1 = actx.createLinearGradient(110, 0, 210, 0);
  grooveGrad1.addColorStop(0, 'rgba(12,13,16,0)');
  grooveGrad1.addColorStop(0.5, 'rgba(12,13,16,0.28)');
  grooveGrad1.addColorStop(1, 'rgba(12,13,16,0)');
  actx.fillStyle = grooveGrad1;
  actx.fillRect(110, 0, 100, 512);

  const grooveGrad2 = actx.createLinearGradient(302, 0, 402, 0);
  grooveGrad2.addColorStop(0, 'rgba(12,13,16,0)');
  grooveGrad2.addColorStop(0.5, 'rgba(12,13,16,0.28)');
  grooveGrad2.addColorStop(1, 'rgba(12,13,16,0)');
  actx.fillStyle = grooveGrad2;
  actx.fillRect(302, 0, 100, 512);

  // Outer crisp white edge lines
  actx.fillStyle = '#e5e7eb';
  actx.fillRect(16, 0, 10, 512);
  actx.fillRect(486, 0, 10, 512);

  // Subtle center dashed line
  actx.fillStyle = 'rgba(248, 250, 252, 0.55)';
  for (let y = 16; y < 512; y += 128) {
    actx.fillRect(253, y, 6, 68);
  }

  const asphaltColor = new THREE.CanvasTexture(asphaltCanvas);
  asphaltColor.colorSpace = THREE.SRGBColorSpace;
  asphaltColor.wrapS = THREE.ClampToEdgeWrapping;
  asphaltColor.wrapT = THREE.RepeatWrapping;
  asphaltColor.anisotropy = aniso;

  // 2. Asphalt Roughness Texture (linear space)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 165 + Math.floor(Math.random() * 65);
    rctx.fillStyle = `rgb(${v},${v},${v})`;
    rctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const asphaltRoughness = new THREE.CanvasTexture(roughCanvas);
  asphaltRoughness.wrapS = THREE.RepeatWrapping;
  asphaltRoughness.wrapT = THREE.RepeatWrapping;
  asphaltRoughness.anisotropy = aniso;

  // 3. FIA Red/White Apex Curb Texture
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 128;
  curbCanvas.height = 256;
  const cctx = curbCanvas.getContext('2d')!;
  cctx.fillStyle = '#e11d48';
  cctx.fillRect(0, 0, 128, 128);
  cctx.fillStyle = '#f8fafc';
  cctx.fillRect(0, 128, 128, 128);
  // Subtle weathering
  for (let i = 0; i < 1200; i++) {
    cctx.fillStyle = 'rgba(15,23,42,0.12)';
    cctx.fillRect(Math.random() * 128, Math.random() * 256, 3, 3);
  }
  const curbColor = new THREE.CanvasTexture(curbCanvas);
  curbColor.colorSpace = THREE.SRGBColorSpace;
  curbColor.wrapS = THREE.RepeatWrapping;
  curbColor.wrapT = THREE.RepeatWrapping;
  curbColor.anisotropy = aniso;

  // 4. Carbon Fiber Weave Texture
  const carbonCanvas = document.createElement('canvas');
  carbonCanvas.width = 64;
  carbonCanvas.height = 64;
  const cfctx = carbonCanvas.getContext('2d')!;
  cfctx.fillStyle = '#14161a';
  cfctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      cfctx.fillStyle = (x + y) % 16 === 0 ? '#22262e' : '#181b20';
      cfctx.fillRect(x, y, 4, 4);
      cfctx.fillRect(x + 4, y + 4, 4, 4);
    }
  }
  const carbonColor = new THREE.CanvasTexture(carbonCanvas);
  carbonColor.colorSpace = THREE.SRGBColorSpace;
  carbonColor.wrapS = THREE.RepeatWrapping;
  carbonColor.wrapT = THREE.RepeatWrapping;
  carbonColor.repeat.set(6, 6);

  // 5. Tire Tread Texture
  const tireCanvas = document.createElement('canvas');
  tireCanvas.width = 128;
  tireCanvas.height = 256;
  const tctx = tireCanvas.getContext('2d')!;
  tctx.fillStyle = '#16181c';
  tctx.fillRect(0, 0, 128, 256);
  tctx.fillStyle = '#0c0d10';
  for (let y = 0; y < 256; y += 16) {
    tctx.fillRect(14, y, 24, 6);
    tctx.fillRect(52, y + 4, 24, 6);
    tctx.fillRect(90, y, 24, 6);
  }
  const tireTread = new THREE.CanvasTexture(tireCanvas);
  tireTread.colorSpace = THREE.SRGBColorSpace;
  tireTread.wrapS = THREE.RepeatWrapping;
  tireTread.wrapT = THREE.RepeatWrapping;

  // 6. Skidmark Alpha Texture
  const skidCanvas = document.createElement('canvas');
  skidCanvas.width = 64;
  skidCanvas.height = 64;
  const skctx = skidCanvas.getContext('2d')!;
  const skGrad = skctx.createLinearGradient(0, 0, 64, 0);
  skGrad.addColorStop(0, 'rgba(10,10,12,0)');
  skGrad.addColorStop(0.2, 'rgba(10,10,12,0.85)');
  skGrad.addColorStop(0.5, 'rgba(10,10,12,0.65)');
  skGrad.addColorStop(0.8, 'rgba(10,10,12,0.85)');
  skGrad.addColorStop(1, 'rgba(10,10,12,0)');
  skctx.fillStyle = skGrad;
  skctx.fillRect(0, 0, 64, 64);
  const skidmarkAlpha = new THREE.CanvasTexture(skidCanvas);
  skidmarkAlpha.colorSpace = THREE.SRGBColorSpace;

  // 7. Radial Smoke Puff Texture
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 128;
  smokeCanvas.height = 128;
  const smctx = smokeCanvas.getContext('2d')!;
  const smGrad = smctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  smGrad.addColorStop(0, 'rgba(241, 245, 249, 0.72)');
  smGrad.addColorStop(0.45, 'rgba(226, 232, 240, 0.42)');
  smGrad.addColorStop(1, 'rgba(226, 232, 240, 0)');
  smctx.fillStyle = smGrad;
  smctx.fillRect(0, 0, 128, 128);
  const smokeParticle = new THREE.CanvasTexture(smokeCanvas);
  smokeParticle.colorSpace = THREE.SRGBColorSpace;

  // 8. Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shctx = shadowCanvas.getContext('2d')!;
  const shGrad = shctx.createRadialGradient(64, 64, 14, 64, 64, 60);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.45)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shctx.fillStyle = shGrad;
  shctx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  // 9. Procedural Terrain Texture
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = 256;
  terrainCanvas.height = 256;
  const trctx = terrainCanvas.getContext('2d')!;
  trctx.fillStyle = '#2d3b28';
  trctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const g = 46 + Math.floor(Math.random() * 28);
    trctx.fillStyle = `rgb(${Math.floor(g * 0.78)}, ${g}, ${Math.floor(g * 0.62)})`;
    trctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const terrainGrass = new THREE.CanvasTexture(terrainCanvas);
  terrainGrass.colorSpace = THREE.SRGBColorSpace;
  terrainGrass.wrapS = THREE.RepeatWrapping;
  terrainGrass.wrapT = THREE.RepeatWrapping;
  terrainGrass.repeat.set(60, 60);
  terrainGrass.anisotropy = aniso;

  // 10. Procedural Tropical Ocean Ripple Texture
  const oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = 256;
  oceanCanvas.height = 256;
  const octx = oceanCanvas.getContext('2d')!;
  octx.fillStyle = '#0c7fa6';
  octx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const wx = Math.random() * 256;
    const wy = Math.random() * 256;
    const len = 12 + Math.random() * 26;
    octx.fillStyle = i % 3 === 0 ? 'rgba(125, 211, 252, 0.24)' : 'rgba(6, 78, 108, 0.28)';
    octx.fillRect(wx, wy, len, 2);
  }
  const oceanRipple = new THREE.CanvasTexture(oceanCanvas);
  oceanRipple.colorSpace = THREE.SRGBColorSpace;
  oceanRipple.wrapS = THREE.RepeatWrapping;
  oceanRipple.wrapT = THREE.RepeatWrapping;
  oceanRipple.repeat.set(68, 68);
  oceanRipple.anisotropy = aniso;

  // 11. Start/Finish Gantry Banner Texture
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1024;
  bannerCanvas.height = 192;
  const bctx = bannerCanvas.getContext('2d')!;
  bctx.fillStyle = '#090b10';
  bctx.fillRect(0, 0, 1024, 192);
  // Checkered edges
  const sq = 24;
  for (let y = 0; y < 192; y += sq) {
    for (let x = 0; x < 144; x += sq) {
      bctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#f8fafc' : '#111827';
      bctx.fillRect(x, y, sq, sq);
      bctx.fillRect(1024 - 144 + x, y, sq, sq);
    }
  }
  bctx.fillStyle = '#ef4444';
  bctx.fillRect(156, 18, 712, 8);
  bctx.fillRect(156, 166, 712, 8);
  bctx.fillStyle = '#f8fafc';
  bctx.font = 'bold 68px Rajdhani, sans-serif';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('SB RACING 2026', 512, 96);
  const startFinishBanner = new THREE.CanvasTexture(bannerCanvas);
  startFinishBanner.colorSpace = THREE.SRGBColorSpace;
  startFinishBanner.anisotropy = aniso;

  return {
    asphaltColor,
    asphaltRoughness,
    curbColor,
    carbonColor,
    tireTread,
    skidmarkAlpha,
    smokeParticle,
    contactShadow,
    terrainGrass,
    oceanRipple,
    startFinishBanner,
    dispose: () => {
      asphaltColor.dispose();
      asphaltRoughness.dispose();
      curbColor.dispose();
      carbonColor.dispose();
      tireTread.dispose();
      skidmarkAlpha.dispose();
      smokeParticle.dispose();
      contactShadow.dispose();
      terrainGrass.dispose();
      oceanRipple.dispose();
      startFinishBanner.dispose();
    },
  };
}
