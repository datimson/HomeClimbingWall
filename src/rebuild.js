let floorSlab = null;
let environmentSkyDome = null;
let environmentGrass = null;
let houseBrickTexturePack = null;
let neighborWeatherboardTexturePack = null;
const HOUSE_BRICK_BASE_COLOR = 0xab6e48;
const HOUSE_BRICK_TEX_METERS = 1.2;
const NEIGHBOR_BRICK_BASE_COLOR = 0x4a4d52; // Monument-painted brick
const WEATHERBOARD_BASE_COLOR = 0xf1eee7;
const WEATHERBOARD_BOARD_SPACING_M = 0.22;
const WEATHERBOARD_BOARDS_PER_TILE = 8;
const HOUSE_BRICK_TEXTURE_PATHS = Object.freeze({
  map: 'textures/sources/house-brick/brick_wall_003_diffuse_2k.jpg',
  normalMap: 'textures/sources/house-brick/brick_wall_003_nor_gl_2k.jpg',
  roughnessMap: 'textures/sources/house-brick/brick_wall_003_rough_2k.jpg',
  aoMap: 'textures/sources/house-brick/brick_wall_003_ao_2k.jpg',
});

function configureHouseBrickTexture(tex, repeatX=1, repeatY=1, isColor=false) {
  if (!tex) return null;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor && typeof THREE.sRGBEncoding !== 'undefined') tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  tex.needsUpdate = true;
  return tex;
}

function applyWorldBoxUv(geometry, metersPerTile=1.2) {
  if (!geometry?.attributes?.position || !geometry?.attributes?.normal) return;
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  const scale = Math.max(0.05, Number(metersPerTile) || 1.2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u = 0;
    let v = 0;
    if (ny >= nx && ny >= nz) {
      // top/bottom
      u = x / scale;
      v = z / scale;
    } else if (nx >= ny && nx >= nz) {
      // +/-X faces
      u = z / scale;
      v = y / scale;
    } else {
      // +/-Z faces
      u = x / scale;
      v = y / scale;
    }
    uv.setXY(i, u, v);
  }
  geometry.setAttribute('uv', uv);
  geometry.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
  uv.needsUpdate = true;
  geometry.attributes.uv2.needsUpdate = true;
}

function applyRoofWorldUv(geometry, spanX=Math.max(0.001, W), spanZ=Math.max(0.001, D)) {
  if (!geometry?.attributes?.position) return;
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const sx = Math.max(0.001, Number(spanX) || 1);
  const sz = Math.max(0.001, Number(spanZ) || 1);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv[i * 2] = x / sx;
    uv[i * 2 + 1] = z / sz;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function applyHouseBrickTintShader(mat) {
  if (!mat || mat.userData?.houseBrickTintShader) return;
  mat.userData.houseBrickTintShader = true;
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
#ifdef USE_MAP
  vec4 texelColor = texture2D( map, vUv );
  texelColor = mapTexelToLinear( texelColor );
  float luma = dot(texelColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 detail = mix(texelColor.rgb, vec3(luma), 0.88);
  diffuseColor.rgb *= detail;
  diffuseColor.a *= texelColor.a;
#endif
      `
    );
  };
  mat.needsUpdate = true;
}

function getHouseBrickTexturePack() {
  if (houseBrickTexturePack) return houseBrickTexturePack;
  const loader = new THREE.TextureLoader();
  const map = configureHouseBrickTexture(loader.load(HOUSE_BRICK_TEXTURE_PATHS.map), 1, 1, true);
  const normalMap = configureHouseBrickTexture(loader.load(HOUSE_BRICK_TEXTURE_PATHS.normalMap), 1, 1, false);
  const roughnessMap = configureHouseBrickTexture(loader.load(HOUSE_BRICK_TEXTURE_PATHS.roughnessMap), 1, 1, false);
  const aoMap = configureHouseBrickTexture(loader.load(HOUSE_BRICK_TEXTURE_PATHS.aoMap), 1, 1, false);
  houseBrickTexturePack = { map, normalMap, roughnessMap, aoMap };
  return houseBrickTexturePack;
}

function getNeighborWeatherboardTexturePack() {
  if (neighborWeatherboardTexturePack) return neighborWeatherboardTexturePack;
  const size = 1024;
  const boardPitch = Math.max(32, Math.round(size / WEATHERBOARD_BOARDS_PER_TILE));
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  if (!colorCtx) return null;
  colorCtx.fillStyle = '#ece9e2';
  colorCtx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += boardPitch) {
    const odd = ((y / boardPitch) % 2) === 1;
    colorCtx.fillStyle = odd ? '#efede7' : '#e8e5de';
    colorCtx.fillRect(0, y, size, boardPitch);
    // shadow groove
    colorCtx.fillStyle = 'rgba(0,0,0,0.18)';
    colorCtx.fillRect(0, y, size, 2);
    // highlight lip
    colorCtx.fillStyle = 'rgba(255,255,255,0.35)';
    colorCtx.fillRect(0, y + 2, size, 1);
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');
  if (!bumpCtx) return null;
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += boardPitch) {
    bumpCtx.fillStyle = '#5e5e5e';
    bumpCtx.fillRect(0, y, size, 2);
    bumpCtx.fillStyle = '#b9b9b9';
    bumpCtx.fillRect(0, y + 2, size, 1);
  }

  neighborWeatherboardTexturePack = {
    map: makeCanvasTexture(colorCanvas, 1, 1),
    bumpMap: makeCanvasTexture(bumpCanvas, 1, 1),
  };
  return neighborWeatherboardTexturePack;
}

function rebuildFloorSlab() {
  if (floorSlab) {
    scene.remove(floorSlab);
    if (floorSlab.geometry && typeof floorSlab.geometry.dispose === 'function') floorSlab.geometry.dispose();
  }
  floorSlab = box(
    W,
    0.05,
    D,
    new THREE.MeshLambertMaterial({color:0x222222}),
    0, 0, 0,
    WALL_ORIGIN_X + (W * 0.5),
    -0.025,
    WALL_ORIGIN_Z + (D * 0.5)
  );
  scene.add(floorSlab);
}

function updateEnvironmentAnchors() {
  if (environmentSkyDome) environmentSkyDome.position.set(W * 0.5, 8.0, D * 0.5);
  if (environmentGrass) environmentGrass.position.set(W * 0.5, -0.051, D * 0.5);
}

const REBUILD_STAGE = Object.freeze({
  GEOMETRY: 'geometry',
  ANNOTATIONS: 'annotations',
  CRASH_MATS: 'crashMats',
});
const REBUILD_ALL_STAGES = Object.freeze([
  REBUILD_STAGE.GEOMETRY,
  REBUILD_STAGE.ANNOTATIONS,
  REBUILD_STAGE.CRASH_MATS,
]);
let rebuildDirtyStages = new Set(REBUILD_ALL_STAGES);

function normalizeRebuildStages(stages) {
  if (!Array.isArray(stages)) return [];
  const valid = new Set(REBUILD_ALL_STAGES);
  return stages.filter(stage => valid.has(stage));
}

function invalidateRebuildStages(stages=REBUILD_ALL_STAGES) {
  normalizeRebuildStages(stages).forEach(stage => rebuildDirtyStages.add(stage));
}

function resolveRebuildPlan(options={}) {
  const useDirty = !!options.useDirty;
  let stages = [];
  if (Array.isArray(options.stages) && options.stages.length) {
    stages = normalizeRebuildStages(options.stages);
  } else if (useDirty) {
    stages = normalizeRebuildStages(Array.from(rebuildDirtyStages));
  } else {
    stages = REBUILD_ALL_STAGES.slice();
  }
  if (!stages.length) {
    return {geometry: false, annotations: false, crashMats: false, stages: []};
  }

  const stageSet = new Set(stages);
  // Geometry changes invalidate all dependent stages.
  if (stageSet.has(REBUILD_STAGE.GEOMETRY)) {
    stageSet.add(REBUILD_STAGE.ANNOTATIONS);
    stageSet.add(REBUILD_STAGE.CRASH_MATS);
  }
  // Annotation changes should clear hover overlays too.
  if (stageSet.has(REBUILD_STAGE.ANNOTATIONS)) {
    stageSet.add(REBUILD_STAGE.CRASH_MATS);
  }
  return {
    geometry: stageSet.has(REBUILD_STAGE.GEOMETRY),
    annotations: stageSet.has(REBUILD_STAGE.ANNOTATIONS),
    crashMats: stageSet.has(REBUILD_STAGE.CRASH_MATS),
    stages: Array.from(stageSet),
  };
}

if (typeof window !== 'undefined') {
  window.REBUILD_STAGE = REBUILD_STAGE;
  window.invalidateRebuildStages = invalidateRebuildStages;
}

// ── Main rebuild ──
function rebuild(options={}) {
  const plan = resolveRebuildPlan(options);
  if (!plan.geometry && !plan.annotations && !plan.crashMats) return;

  if (plan.geometry) {
    while(wallGroup.children.length) wallGroup.remove(wallGroup.children[0]);
    while(dimGroup.children.length)  dimGroup.remove(dimGroup.children[0]);
    while(labelGroup.children.length) labelGroup.remove(labelGroup.children[0]);
    while(hoverDimGroup.children.length) hoverDimGroup.remove(hoverDimGroup.children[0]);
    hoverTargets.length = 0;
    adjPivot = null;
  } else if (plan.annotations) {
    while(dimGroup.children.length)  dimGroup.remove(dimGroup.children[0]);
    while(labelGroup.children.length) labelGroup.remove(labelGroup.children[0]);
    while(hoverDimGroup.children.length) hoverDimGroup.remove(hoverDimGroup.children[0]);
  }

  if (options.useDirty) {
    plan.stages.forEach(stage => rebuildDirtyStages.delete(stage));
  }

  if (!plan.geometry && !plan.annotations) {
    if (plan.crashMats) rebuildCrashMatsGeometry();
    return;
  }

  const s = wallState;
  const dWidth = Math.max(0.1, W - s.bWidth - s.cWidth); // D fills remainder
  const fixedSideLen = s.aWidth;
  const adjLen = D - fixedSideLen;
  const eSupportSize = (typeof E_SUPPORT_POST_SIZE === 'number') ? E_SUPPORT_POST_SIZE : 0.10;
  const eSupportClearance = (typeof E_SUPPORT_POST_CLEARANCE === 'number') ? E_SUPPORT_POST_CLEARANCE : 0.01;
  const eInset = (eSupportSize * 0.5) + 0.005;
  const eSupportCenterZ = D - eInset;
  const eUsableEndZ = Math.max(fixedSideLen + 0.2, eSupportCenterZ - (eSupportSize * 0.5) - eSupportClearance);
  const eAdjLen = THREE.MathUtils.clamp(
    Math.min(adjLen, eUsableEndZ - fixedSideLen),
    0.05,
    Math.max(0.05, adjLen)
  );
  const HAvail = H_fixed - KICK;
  const roofBaseAvail = (H_fixed + 0.001) - KICK;
  const shellDepth = (typeof WALL_KICK_STRUCTURAL_DEPTH === 'number') ? WALL_KICK_STRUCTURAL_DEPTH : 0;
  const xMin = -shellDepth;
  const xMax = W;
  const zMin = -shellDepth;
  const zMax = D + shellDepth;

  // Top-edge depths used for the D↔F ceiling infill panel.
  const d1H = Math.max(0.1, Math.min(HAvail - 0.1, s.d1Height));
  const dTan1 = Math.tan(THREE.MathUtils.degToRad(s.dAngle));
  const dTan2 = Math.tan(THREE.MathUtils.degToRad(s.d2Angle));
  const dDen = Math.max(0.05, 1 - ROOF_PITCH_TAN * dTan2);
  const dRoofZRaw = (d1H * dTan1) + ((roofBaseAvail - d1H) * dTan2);
  const dRoofZ = THREE.MathUtils.clamp(
    dRoofZRaw / dDen,
    0,
    D
  );

  const f1H = Math.max(2.0, Math.min(HAvail - 0.1, s.f1Height));
  const fTan1 = Math.tan(THREE.MathUtils.degToRad(s.f1Angle));
  const fTan2 = Math.tan(THREE.MathUtils.degToRad(s.f2Angle));
  const fDen = Math.max(0.05, 1 + ROOF_PITCH_TAN * fTan2);
  const fRoofZRaw = D - (f1H * fTan1) - ((roofBaseAvail - f1H) * fTan2);
  const fRoofZ = THREE.MathUtils.clamp(
    fRoofZRaw / fDen,
    0,
    D
  );

  if (plan.geometry) {
    // ── Fixed walls ──
    buildBackSection(wallGroup, s.bWidth, s.bAngle, s.bWidth/2,                       fixedSideLen, 'B');
    buildBackSection(wallGroup, s.cWidth, s.cAngle, s.bWidth + s.cWidth/2,            fixedSideLen, 'C');
    buildBackSectionTwoStage(wallGroup, dWidth, s.dAngle, s.d2Angle, s.bWidth + s.cWidth + dWidth/2, s.d1Height, 'D');
    buildSideSection(wallGroup, fixedSideLen, s.aAngle, fixedSideLen, 'A');
    buildFWall(wallGroup, s.f1Width, s.f1Angle, s.f2Angle, s.f2WidthTop, s.f1Height);
    buildRearABCornerShellCap(wallGroup);
    buildTrainingRig(wallGroup, s);
    buildCampusBoardOnD(wallGroup, s);
    buildConceptVolumes(wallGroup, s);

    // Apply collision clipping
    applyClipping(s);

    // ── L-shaped roof cap ──
    buildLRoof(wallGroup, fixedSideLen, dWidth, s.f2WidthTop, dRoofZ, fRoofZ);
    buildESupportPost(wallGroup, fixedSideLen);
    buildPolyRoofExtension(wallGroup, fixedSideLen, s.f2WidthTop);
    buildCeilingPanelHolds(wallGroup);

    // ── Adjustable panel ──
    buildAdjPanel(wallGroup, adjLen, fixedSideLen);
    buildClimbingHolds(wallGroup, s);
    buildABCornerGuide(wallGroup, s, fixedSideLen);
  }

  if (plan.annotations) {
  // ── Labels ──
  function findWallLabelMesh(wallId) {
    const matches = hoverTargets.filter(m => m.userData?.sectionInfo?.wall === wallId);
    if (!matches.length) return null;
    return (
      matches.find(m => m.userData.sectionInfo.section === 'Section 1') ||
      matches.find(m => m.userData.sectionInfo.section === 'Section 2') ||
      matches.find(m => m.userData.sectionInfo.section === 'Kick') ||
      null
    );
  }
  const findGapMesh = () => {
    let found = null;
    wallGroup.traverse(obj => {
      if (found) return;
      if (obj?.isMesh && obj.userData?.labelWall === 'G') found = obj;
    });
    return found;
  };
  const labelDefs = [
    {id:'A', sub:s.aAngle+'°', normal:{x:0,y:0,z:-1}, up:{x:0,y:1,z:0}, width:0.56},
    {id:'B', sub:s.bAngle+'°', normal:{x:0,y:0,z:1},  up:{x:0,y:1,z:0}, width:0.56},
    {id:'C', sub:s.cAngle+'°', normal:{x:0,y:0,z:1},  up:{x:0,y:1,z:0}, width:0.56},
    {id:'D', sub:s.dAngle+'°/'+s.d2Angle+'°', normal:{x:0,y:0,z:1}, up:{x:0,y:1,z:0}, width:0.56},
  ];
  labelDefs.forEach(def => {
    const mesh = findWallLabelMesh(def.id);
    if (!mesh) return;
    addLocalFaceLabel(mesh, def.id, def.sub, {
      normalLocal: def.normal,
      upLocal: def.up,
      useFaceSlope: !!def.useFaceSlope,
      width: def.width,
      height: 0.28,
      normalOffset: 0.012,
    });
  });
  const fMesh = findWallLabelMesh('F');
  if (fMesh) {
    const fInfo = fMesh.userData.sectionInfo;
    placeFaceLabel(labelGroup, fMesh, fInfo, 'F', s.f1Angle+'°/'+s.f2Angle+'°', {
      width: 0.62,
      height: 0.28,
      alongFace: 0.52,
      normalOffset: 0.014,
      normalSign: -1,
    });
  }
  const gapMesh = findGapMesh();
  if (gapMesh) {
    addLocalFaceLabel(gapMesh, 'G', 'ply 17mm', {
      // Match roof pitch so label lies on the sloped ceiling surface.
      normalLocal: {x:0, y:-1, z:ROOF_PITCH_TAN},
      upLocal: {x:0, y:ROOF_PITCH_TAN, z:1},
      width: 0.58,
      height: 0.26,
      normalOffset: 0.0016,
      useExactSurface: true,
      // Move toward the panel edge with an absolute in-plane distance.
      alongUpDist: 0.65,
    });
  }

  // ── Dimensions ──
  const off=0.35;
  // Floor overall width/depth use current outer shell extents.
  addDim(
    dimGroup,
    new THREE.Vector3(xMin, -0.05, zMax + off),
    new THREE.Vector3(xMax, -0.05, zMax + off),
    `${(xMax - xMin).toFixed(1)}m`,
    0xddcc88
  );
  addDim(
    dimGroup,
    new THREE.Vector3(xMin - off, -0.05, zMin),
    new THREE.Vector3(xMin - off, -0.05, zMax),
    `${(zMax - zMin).toFixed(1)}m`,
    0xddcc88
  );
  // Kick height (along Y) — moved beside total height at wall D side
  addDim(dimGroup, new THREE.Vector3(W+off, 0, 0.45), new THREE.Vector3(W+off, KICK, 0.45), KICK.toFixed(2)+'m', 0xaaaaaa);
  // E reach dims — moved to front perimeter
  // E pivots at x=0, swings toward +X. Wall A occupies x=0 up to z=fixedSideLen.
  const ePanelH = H_adj - KICK;
  const eHorizReach = ePanelH * Math.sin(s.eAngle * Math.PI/180);
  const eTipX = Math.min(eHorizReach, W);
  const eGap = Math.max(0, W - eHorizReach);
  const ez = D + off + 0.45;
  // Blue: x=0 → E's tip (E's horizontal reach from its base)
  // Orange: E's tip → W (remaining gap to far wall)
  addDim(dimGroup, new THREE.Vector3(0,-0.05,ez), new THREE.Vector3(eTipX,-0.05,ez),
    eHorizReach.toFixed(2)+'m E', 0x55aaff);
  if (eGap > 0.01) {
    addDim(dimGroup, new THREE.Vector3(eTipX,-0.05,ez), new THREE.Vector3(W,-0.05,ez),
      eGap.toFixed(2)+'m', 0xffaa55);
  }
  // Cap W (outer shell width)
  addDim(
    dimGroup,
    new THREE.Vector3(xMin, H_fixed+0.1, zMin - off),
    new THREE.Vector3(xMax, H_fixed+0.1, zMin - off),
    `${(xMax - xMin).toFixed(1)}m`,
    0x88bbdd
  );
  // Cap D (fixedSideLen) — moved to opposite roof end
  addDim(
    dimGroup,
    new THREE.Vector3(xMin - off, H_fixed+0.1, zMin),
    new THREE.Vector3(xMin - off, H_fixed+0.1, fixedSideLen),
    (fixedSideLen - zMin).toFixed(2)+'m',
    0x88bbdd
  );
  // Ceiling infill wall (between D and F on the roof plane)
  const zNearMain = Math.min(dRoofZ, fRoofZ);
  const zFar = Math.max(dRoofZ, fRoofZ);
  const zNear = Math.min(zNearMain, fixedSideLen);
  const zGap = zFar - zNear;
  if (zGap > 0.01) {
    const yRoofDim = H_fixed + 0.22;
    addDim(dimGroup,
      new THREE.Vector3(W + 0.16, yRoofDim, zNear),
      new THREE.Vector3(W + 0.16, yRoofDim, zFar),
      zGap.toFixed(2)+'m G',
      0x5aaeff
    );
  }
  // Wall widths on floor (A, B, C, D)
  const wY = -0.05;
  addDim(dimGroup, new THREE.Vector3(0,wY,0.14), new THREE.Vector3(s.bWidth,wY,0.14),
    s.bWidth.toFixed(2)+'m', 0x88cc88);
  addDim(dimGroup, new THREE.Vector3(s.bWidth,wY,0.26), new THREE.Vector3(s.bWidth+s.cWidth,wY,0.26),
    s.cWidth.toFixed(2)+'m', 0x88cc88);
  addDim(dimGroup, new THREE.Vector3(s.bWidth+s.cWidth,wY,0.38), new THREE.Vector3(W,wY,0.38),
    dWidth.toFixed(2)+'m', 0x88cc88);
  addDim(dimGroup, new THREE.Vector3(0.14,wY,0), new THREE.Vector3(0.14,wY,fixedSideLen),
    fixedSideLen.toFixed(2)+'m', 0x88cc88);
  // Wall height (vertical)
  addDim(dimGroup, new THREE.Vector3(W+off, 0, 0), new THREE.Vector3(W+off, H_fixed, 0), H_fixed.toFixed(1)+'m', 0xdd88bb);
  // Height to high side of F (outer shell at z = zMax).
  const fHighY = roofUnderY(zMax);
  addDim(
    dimGroup,
    new THREE.Vector3(W + off + 0.22, 0, zMax),
    new THREE.Vector3(W + off + 0.22, fHighY, zMax),
    `${fHighY.toFixed(2)}m F high`,
    0xb78cff
  );

  // Poly roof clearance above main roof (at the overlap start, z=z0).
  if (polyRoofEnabled) {
    const overlap = 0.20;
    const z0Poly = THREE.MathUtils.clamp(fixedSideLen - overlap, 0, D);
    const roofTopYAtZ = z => (H_fixed + 0.001 + z * ROOF_PITCH_TAN + ROOF_CLADDING_THICKNESS);
    const roofTopAtZ0 = roofTopYAtZ(z0Poly);
    const polyBottom0 = Math.max(H_adj + POLY_ROOF_CLEARANCE, roofTopAtZ0 + 0.04);
    const polyGap = Math.max(0, polyBottom0 - roofTopAtZ0);
    addDim(
      dimGroup,
      new THREE.Vector3(0.34, roofTopAtZ0, z0Poly + 0.06),
      new THREE.Vector3(0.34, polyBottom0, z0Poly + 0.06),
      `${polyGap.toFixed(2)}m poly gap`,
      0x95cfee
    );
  }
  // F widths moved to floor / ceiling like other width dimensions
  // F section 1 width (floor)
  addDim(
    dimGroup,
    new THREE.Vector3(W - s.f1Width, -0.05, zMax + off),
    new THREE.Vector3(W, -0.05, zMax + off),
    s.f1Width.toFixed(2)+'m F↓',
    0x9a5faa
  );
  // F section 2 top width (ceiling)
  addDim(
    dimGroup,
    new THREE.Vector3(W - s.f2WidthTop, H_fixed + 0.1, zMax + off),
    new THREE.Vector3(W, H_fixed + 0.1, zMax + off),
    s.f2WidthTop.toFixed(2)+'m F↑',
    0xcc99ff
  );
  // E width (inside room)
  addDim(dimGroup, new THREE.Vector3(0.22,0,fixedSideLen), new THREE.Vector3(0.22,0,fixedSideLen + eAdjLen),
    eAdjLen.toFixed(2)+'m', 0xdd9944);

  // Site layout offsets (perimeter): fence->wall and wall->house/outdoor.
  const siteDimColorFence = 0x7dbf9f;
  const siteDimColorHouse = 0x86aee6;
  const floorDimY = -0.05;

  // Fence clearances from the climbing wall outer shell planes.
  addDim(
    dimGroup,
    new THREE.Vector3(-WALL_CLEARANCE_TO_FENCE_X, floorDimY, -0.95),
    new THREE.Vector3(xMin, floorDimY, -0.95),
    `${Math.max(0, xMin + WALL_CLEARANCE_TO_FENCE_X).toFixed(2)}m fence`,
    siteDimColorFence
  );
  addDim(
    dimGroup,
    new THREE.Vector3(-0.95, floorDimY, -WALL_CLEARANCE_TO_FENCE_Z),
    new THREE.Vector3(-0.95, floorDimY, zMin),
    `${Math.max(0, zMin + WALL_CLEARANCE_TO_FENCE_Z).toFixed(2)}m fence`,
    siteDimColorFence
  );

  // Convert site positions (scene/world) to dimGroup local space.
  const toDimLocalX = x => x - WALL_ORIGIN_X;
  const toDimLocalZ = z => z - WALL_ORIGIN_Z;

  // Shortest plan gaps from F:
  // 1) back of F shell (z=zMax) -> outdoor slab nearest edge (z=slabZ0)
  // 2) outer edge of F (x=W) -> house nearest face (x=houseBackOffsetX projection/eave)
  const houseWallZ0Scene = HOUSE_SIDE_OFFSET_Z + HOUSE_EAVE_INSET;
  const houseWallZ1Scene = HOUSE_SIDE_OFFSET_Z + HOUSE_LENGTH_Z - HOUSE_EAVE_INSET;
  const backProjectZ1Scene = THREE.MathUtils.clamp(
    houseWallZ0Scene + HOUSE_BACK_WALL_PROJECT_LEN,
    houseWallZ0Scene,
    houseWallZ1Scene
  );
  const slabNearZScene = backProjectZ1Scene - OUTDOOR_SLAB_START_ALONG_PROJECTION;
  const slabNearZ = toDimLocalZ(slabNearZScene);
  const houseNearX = toDimLocalX(HOUSE_BACK_OFFSET_X);

  const fBackToOutdoor = Math.max(0, slabNearZ - zMax);
  const fEdgeToHouse = Math.max(0, houseNearX - W);

  const fBackDimX = W - Math.max(0.18, Math.min(0.45, s.f1Width * 0.5));
  if (fBackToOutdoor > 0.01) {
    addDim(
      dimGroup,
      new THREE.Vector3(fBackDimX, floorDimY, zMax),
      new THREE.Vector3(fBackDimX, floorDimY, slabNearZ),
      `${fBackToOutdoor.toFixed(2)}m F->Slab`,
      siteDimColorHouse
    );
  }
  if (fEdgeToHouse > 0.01) {
    const fHouseDimZ = zMax + off + 0.62;
    addDim(
      dimGroup,
      new THREE.Vector3(W, floorDimY, fHouseDimZ),
      new THREE.Vector3(houseNearX, floorDimY, fHouseDimZ),
      `${fEdgeToHouse.toFixed(2)}m F->House`,
      siteDimColorHouse
    );
  }

  // E adjustability arc
  const arcMin = -5;
  const arcMax = 60;
  const arcR = 0.95;
  const arcZ = fixedSideLen + Math.max(0.2, eAdjLen - 0.08);
  const arcStart = THREE.MathUtils.degToRad(90 - arcMax);
  const arcEnd = THREE.MathUtils.degToRad(90 - arcMin);
  const arcCurve = new THREE.EllipseCurve(0, KICK, arcR, arcR, arcStart, arcEnd, false, 0);
  const arcPts = arcCurve.getPoints(72).map(p => new THREE.Vector3(p.x, p.y, arcZ));
  const arcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineBasicMaterial({color:0xffaa55, depthTest:false})
  );
  arcLine.renderOrder = 2;
  dimGroup.add(arcLine);

  const rayMat = new THREE.LineBasicMaterial({color:0xffaa55, depthTest:false});
  const eArcPt = deg => {
    const rad = THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(arcR * Math.sin(rad), KICK + arcR * Math.cos(rad), arcZ);
  };
  [arcMin, arcMax].forEach(deg => {
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, KICK, arcZ), eArcPt(deg)]),
      rayMat
    );
    ray.renderOrder = 2;
    dimGroup.add(ray);
  });

  const arcText = dimTextSprite('E -5°..60°');
  arcText.scale.set(0.50, 0.125, 1);
  arcText.position.copy(eArcPt((arcMin + arcMax) / 2)).add(new THREE.Vector3(0.28, 0.18, 0));
  dimGroup.add(arcText);
  }

  if (plan.crashMats) rebuildCrashMatsGeometry();
}

// Initial build
rebuild();
rebuildFloorSlab();

// ── Outdoor context (static): sky, grass, and boundary fences ──
(function() {
  if (environmentGroup) {
    scene.remove(environmentGroup);
  }
  environmentGroup = new THREE.Group();
  scene.add(environmentGroup);

  // Sky dome gradient.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4f9be6) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        exponent: { value: 0.95 },
      },
      vertexShader: `
        varying float vMix;
        void main() {
          vec3 n = normalize(position);
          vMix = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vMix;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float exponent;
        void main() {
          float h = pow(vMix, exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  skyDome.position.set(W * 0.5, 8.0, D * 0.5);
  skyDome.frustumCulled = false;
  environmentGroup.add(skyDome);
  environmentSkyDome = skyDome;

  // Grass plane around the wall footprint.
  const createGrassGradientTexture = () => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;

    const cx = cv.width * 0.5;
    const cy = cv.height * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, cv.width * 0.12, cx, cy, cv.width * 0.6);
    grad.addColorStop(0.0, '#9ab541');
    grad.addColorStop(1.0, '#5f7726');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);

    return makeCanvasTexture(cv, 1, 1);
  };
  const grassMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: createGrassGradientTexture(),
  });
  grassMat.fog = false; // keep grass fading to darker green rather than scene fog white
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    grassMat
  );
  grass.rotation.x = -Math.PI * 0.5;
  grass.position.set(W * 0.5, -0.051, D * 0.5);
  grass.receiveShadow = true;
  environmentGroup.add(grass);
  environmentGrass = grass;

  // Timber paling fence: 1.8m high, butted palings, monument color.
  const fenceHeight = FENCE_HEIGHT;
  const fenceLength = FENCE_LENGTH;
  const fenceOffset = FENCE_OFFSET_FROM_ORIGIN;
  const palingWidth = 0.10;   // 20m / 0.1m = 200 palings
  const palingThick = 0.018;
  const fenceColor = 0x3a3f46; // Monument-like charcoal
  const createFenceBumpTexture = () => {
    const w = 256;
    const h = 512;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;

    // Neutral gray base keeps the effect subtle.
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);

    // Local deterministic RNG; avoids dependency on shared hash helpers.
    let seed = 0x6f1d2b3c;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Vertical timber grain streaks.
    for (let i = 0; i < 700; i++) {
      const x = Math.floor(rand() * w);
      const alpha = 0.03 + (rand() * 0.11);
      const light = Math.floor(90 + (rand() * 100));
      ctx.fillStyle = `rgba(${light},${light},${light},${alpha})`;
      ctx.fillRect(x, 0, 1, h);
    }

    // Occasional soft bands and knots so palings are not uniformly flat.
    for (let i = 0; i < 44; i++) {
      const y = Math.floor(rand() * h);
      const alpha = 0.02 + (rand() * 0.05);
      const light = Math.floor(96 + (rand() * 90));
      ctx.fillStyle = `rgba(${light},${light},${light},${alpha})`;
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 28; i++) {
      const x = Math.floor(rand() * w);
      const y = Math.floor(rand() * h);
      const r = 3 + Math.floor(rand() * 7);
      const knot = Math.floor(92 + (rand() * 84));
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.55 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${knot},${knot},${knot},0.15)`;
      ctx.fill();
    }

    return makeCanvasTexture(cv, 1, 2.2);
  };

  const fenceBump = createFenceBumpTexture();
  const fenceMat = new THREE.MeshLambertMaterial({
    color: fenceColor,
    bumpMap: fenceBump,
    bumpScale: 0.095,
  });
  const count = Math.round(fenceLength / palingWidth);
  const dummy = new THREE.Object3D();
  const yCenter = fenceHeight * 0.5;
  const start = -fenceOffset;

  // Side along +X at z = -0.7.
  const fenceX = new THREE.InstancedMesh(
    new THREE.BoxGeometry(palingWidth, fenceHeight, palingThick),
    fenceMat,
    count
  );
  fenceX.castShadow = true;
  fenceX.receiveShadow = true;
  for (let i = 0; i < count; i++) {
    const x = start + (palingWidth * 0.5) + (i * palingWidth);
    dummy.position.set(x, yCenter, -fenceOffset);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fenceX.setMatrixAt(i, dummy.matrix);
  }
  fenceX.instanceMatrix.needsUpdate = true;
  environmentGroup.add(fenceX);

  // Side along +Z at x = -0.7.
  const fenceZ = new THREE.InstancedMesh(
    new THREE.BoxGeometry(palingThick, fenceHeight, palingWidth),
    fenceMat,
    count
  );
  fenceZ.castShadow = true;
  fenceZ.receiveShadow = true;
  for (let i = 0; i < count; i++) {
    const z = start + (palingWidth * 0.5) + (i * palingWidth);
    dummy.position.set(-fenceOffset, yCenter, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fenceZ.setMatrixAt(i, dummy.matrix);
  }
  fenceZ.instanceMatrix.needsUpdate = true;
  environmentGroup.add(fenceZ);

  // Subtle seam lines make individual palings readable without adding spacing.
  const seamMat = new THREE.LineBasicMaterial({
    color: 0x2a3036,
    transparent: true,
    opacity: 0.6,
  });
  const seamPointsX = [];
  const seamPointsZ = [];
  for (let i = 1; i < count; i++) {
    const x = start + (i * palingWidth);
    const z = start + (i * palingWidth);
    seamPointsX.push(
      new THREE.Vector3(x, 0, -fenceOffset + (palingThick * 0.5) + 0.0012),
      new THREE.Vector3(x, fenceHeight, -fenceOffset + (palingThick * 0.5) + 0.0012)
    );
    seamPointsZ.push(
      new THREE.Vector3(-fenceOffset + (palingThick * 0.5) + 0.0012, 0, z),
      new THREE.Vector3(-fenceOffset + (palingThick * 0.5) + 0.0012, fenceHeight, z)
    );
  }
  const seamsX = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seamPointsX), seamMat);
  const seamsZ = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seamPointsZ), seamMat);
  environmentGroup.add(seamsX);
  environmentGroup.add(seamsZ);

  // House massing (initial): rectangular footprint from measured offsets.
  // Boundary mapping:
  // - Back boundary is the A/E side wall line (x = 0).
  // - Side boundary is the A-B-C-D back wall line (z = 0).
  const houseBackOffsetX = HOUSE_BACK_OFFSET_X;
  const houseSideOffsetZ = HOUSE_SIDE_OFFSET_Z;
  const houseLengthZ = HOUSE_LENGTH_Z;
  const houseDepthX = HOUSE_DEPTH_X;
  const houseWallHeight = HOUSE_WALL_HEIGHT;
  const houseRoofStartCap = HOUSE_ROOF_START_CAP;
  const houseEaveInset = HOUSE_EAVE_INSET;
  const houseBackWallProjectLen = HOUSE_BACK_WALL_PROJECT_LEN;

  const createBrickFallbackTexture = () => {
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 384;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#d8d2c7';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const brickW = 76;
    const brickH = 34;
    const mortar = 3;
    for (let row = 0; row < Math.ceil(cv.height / brickH) + 1; row++) {
      const y = row * brickH;
      const offset = (row % 2) ? (brickW * 0.5) : 0;
      for (let x = -brickW; x < cv.width + brickW; x += brickW) {
        const bx = Math.round(x + offset);
        const hueShift = ((row + (bx / brickW)) % 3) * 4;
        const r = 224 - hueShift;
        const g = 218 - hueShift;
        const b = 208 - hueShift;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(bx + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2);
      }
    }
    return makeCanvasTexture(cv, 1.25, 1.35);
  };
  const createAxonTexture = () => {
    const cv = document.createElement('canvas');
    cv.width = 960;
    cv.height = 960;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#43484f';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const groove = 48;
    for (let x = 0; x < cv.width; x += groove) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, 0, 2, cv.height);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(x + 3, 0, 2, cv.height);
    }
    return makeCanvasTexture(cv, 1.0, 1.3);
  };
  const hardieGrooveSpacingM = 0.12;
  const axonRefHeight = 2.40;
  const makeAxonFaceMaterial = (faceWidth, faceHeight) => {
    if (typeof makeMonumentAxonMaterial === 'function') {
      return makeMonumentAxonMaterial(faceWidth, faceHeight, {
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    }
    const tex = createAxonTexture();
    if (tex) {
      const groovesPerTile = 960 / 48;
      const repX = Math.max(0.08, faceWidth / (hardieGrooveSpacingM * groovesPerTile));
      const repY = Math.max(0.15, 1.3 * (faceHeight / axonRefHeight));
      tex.repeat.set(repX, repY);
      tex.needsUpdate = true;
    }
    return new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: tex,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  };

  const brickPack = getHouseBrickTexturePack();
  const houseBrickMat = new THREE.MeshStandardMaterial({
    color: HOUSE_BRICK_BASE_COLOR,
    // Tint-driven brick color: keep depth/detail from PBR maps, but no photo albedo map.
    map: null,
    normalMap: brickPack?.normalMap || null,
    roughnessMap: brickPack?.roughnessMap || null,
    aoMap: brickPack?.aoMap || null,
    roughness: brickPack?.roughnessMap ? 1.0 : 0.92,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  houseBrickMat.userData.worldBoxUvScale = HOUSE_BRICK_TEX_METERS;
  if (houseBrickMat.normalMap) houseBrickMat.normalScale = new THREE.Vector2(0.65, 0.65);
  const houseProjectionMat = new THREE.MeshLambertMaterial({
    color: 0x43484f,
    side: THREE.DoubleSide,
  });
  const houseRoofStartMat = new THREE.MeshLambertMaterial({
    color: 0xb6b3aa,
    side: THREE.DoubleSide,
  });
  const houseProjectionCapMat = new THREE.MeshLambertMaterial({
    color: 0x565c64,
    side: THREE.DoubleSide,
  });
  const houseRoofMat = (typeof claddingMat !== 'undefined' && claddingMat)
    ? claddingMat
    : new THREE.MeshLambertMaterial({ color: 0x4a4d52, side: THREE.DoubleSide });
  const houseOutlineMat = new THREE.LineBasicMaterial({
    color: 0x8f8b82,
    transparent: true,
    opacity: 0.75,
  });

  const wallX0 = houseBackOffsetX + houseEaveInset;
  const wallX1 = houseBackOffsetX + houseDepthX - houseEaveInset;
  const wallZ0 = houseSideOffsetZ + houseEaveInset;
  const wallZ1 = houseSideOffsetZ + houseLengthZ - houseEaveInset;
  const backProjectZ1 = THREE.MathUtils.clamp(
    wallZ0 + houseBackWallProjectLen,
    wallZ0,
    wallZ1
  );
  const projectionDepthX = Math.max(0, wallX0 - houseBackOffsetX);
  const projectionLenZ = Math.max(0, backProjectZ1 - wallZ0);

  const addHouseMassBox = (w, h, d, cx, cy, cz, mat) => {
    if (w <= 0.02 || h <= 0.02 || d <= 0.02) return;
    const mesh = box(w, h, d, mat, 0, 0, 0, cx, cy, cz);
    const uvScale = Number(mat?.userData?.worldBoxUvScale);
    if (mesh?.geometry && Number.isFinite(uvScale) && uvScale > 0) {
      applyWorldBoxUv(mesh.geometry, uvScale);
    }
    mesh.userData.context = 'house';
    environmentGroup.add(mesh);
  };

  // Main wall mass inset from roof edges by 0.6m.
  addHouseMassBox(
    wallX1 - wallX0,
    houseWallHeight,
    wallZ1 - wallZ0,
    (wallX0 + wallX1) * 0.5,
    houseWallHeight * 0.5,
    (wallZ0 + wallZ1) * 0.5,
    houseBrickMat
  );

  // Rear corner projection: back wall sits at eave line for 3.34m.
  addHouseMassBox(
    projectionDepthX,
    houseWallHeight,
    projectionLenZ,
    (houseBackOffsetX + wallX0) * 0.5,
    houseWallHeight * 0.5,
    (wallZ0 + backProjectZ1) * 0.5,
    houseProjectionMat
  );
  // Apply Axon cladding as world-scaled planes so short and long faces keep
  // consistent board spacing (no UV squash on the perpendicular return).
  if (projectionDepthX > 0.02 && projectionLenZ > 0.02) {
    const claddingOffset = 0.006;

    const longFace = new THREE.Mesh(
      new THREE.PlaneGeometry(projectionLenZ, houseWallHeight),
      makeAxonFaceMaterial(projectionLenZ, houseWallHeight)
    );
    longFace.rotation.y = -Math.PI * 0.5;
    longFace.position.set(
      houseBackOffsetX - claddingOffset,
      houseWallHeight * 0.5,
      (wallZ0 + backProjectZ1) * 0.5
    );
    longFace.userData.context = 'house';
    longFace.castShadow = true;
    longFace.receiveShadow = true;
    environmentGroup.add(longFace);

    const shortFace = new THREE.Mesh(
      new THREE.PlaneGeometry(projectionDepthX, houseWallHeight),
      makeAxonFaceMaterial(projectionDepthX, houseWallHeight)
    );
    shortFace.position.set(
      (houseBackOffsetX + wallX0) * 0.5,
      houseWallHeight * 0.5,
      backProjectZ1 + claddingOffset
    );
    shortFace.userData.context = 'house';
    shortFace.castShadow = true;
    shortFace.receiveShadow = true;
    environmentGroup.add(shortFace);
  }

  // Thin cap to indicate "roof starts here" level on top of wall footprint.
  addHouseMassBox(
    wallX1 - wallX0,
    houseRoofStartCap,
    wallZ1 - wallZ0,
    (wallX0 + wallX1) * 0.5,
    houseWallHeight + (houseRoofStartCap * 0.5),
    (wallZ0 + wallZ1) * 0.5,
    houseRoofStartMat
  );
  addHouseMassBox(
    wallX0 - houseBackOffsetX,
    houseRoofStartCap,
    backProjectZ1 - wallZ0,
    (houseBackOffsetX + wallX0) * 0.5,
    houseWallHeight + (houseRoofStartCap * 0.5),
    (wallZ0 + backProjectZ1) * 0.5,
    houseProjectionCapMat
  );

  // Simple hip roof (approx): rises ~2.0m above roof-start level.
  const houseRoofRise = HOUSE_ROOF_RISE;
  const houseRoofOverhang = HOUSE_ROOF_OVERHANG;
  const roofBaseY = houseWallHeight + houseRoofStartCap;
  const roofPeakY = roofBaseY + houseRoofRise;
  const x0 = houseBackOffsetX - houseRoofOverhang;
  const x1 = houseBackOffsetX + houseDepthX + houseRoofOverhang;
  const z0 = houseSideOffsetZ - houseRoofOverhang;
  const z1 = houseSideOffsetZ + houseLengthZ + houseRoofOverhang;
  const xCenter = (x0 + x1) * 0.5;
  const hipRun = Math.min((x1 - x0) * 0.5, (z1 - z0) * 0.5 - 0.05);

  const e00 = new THREE.Vector3(x0, roofBaseY, z0);
  const e10 = new THREE.Vector3(x1, roofBaseY, z0);
  const e11 = new THREE.Vector3(x1, roofBaseY, z1);
  const e01 = new THREE.Vector3(x0, roofBaseY, z1);
  const ridge0 = new THREE.Vector3(xCenter, roofPeakY, z0 + hipRun);
  const ridge1 = new THREE.Vector3(xCenter, roofPeakY, z1 - hipRun);

  const roofVerts = [];
  const pushTri = (a, b, c) => {
    roofVerts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  // Left and right roof planes.
  pushTri(e00, e01, ridge1);
  pushTri(e00, ridge1, ridge0);
  pushTri(e10, ridge0, ridge1);
  pushTri(e10, ridge1, e11);
  // Hip triangles at each end.
  pushTri(e00, e10, ridge0);
  pushTri(e01, ridge1, e11);

  const houseRoofGeo = new THREE.BufferGeometry();
  houseRoofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts, 3));
  applyRoofWorldUv(houseRoofGeo, Math.max(0.001, W), Math.max(0.001, D));
  houseRoofGeo.computeVertexNormals();
  const houseRoof = new THREE.Mesh(houseRoofGeo, houseRoofMat);
  houseRoof.castShadow = true;
  houseRoof.receiveShadow = true;
  houseRoof.userData.context = 'house';
  environmentGroup.add(houseRoof);
  houseRoof.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(houseRoofGeo),
    new THREE.LineBasicMaterial({color: 0x555a61, transparent: true, opacity: 0.7})
  ));

  // Flat underside (soffit) under the main house roof geometry.
  const houseSoffitT = 0.017;
  const houseRoofSoffit = box(
    x1 - x0,
    houseSoffitT,
    z1 - z0,
    new THREE.MeshLambertMaterial({ color: 0x6f757d, side: THREE.DoubleSide }),
    0, 0, 0,
    (x0 + x1) * 0.5,
    roofBaseY - (houseSoffitT * 0.5),
    (z0 + z1) * 0.5
  );
  houseRoofSoffit.castShadow = true;
  houseRoofSoffit.receiveShadow = true;
  houseRoofSoffit.userData.context = 'house';
  houseRoofSoffit.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(houseRoofSoffit.geometry),
    new THREE.LineBasicMaterial({color: 0x555a61, transparent: true, opacity: 0.65})
  ));
  environmentGroup.add(houseRoofSoffit);

  // Neighbor house (side boundary): two-storey rectangular massing.
  // Roof footprint values are configurable in SITE_LAYOUT.
  const neighborRoofX0 = NEIGHBOR_BACK_OFFSET_X;
  const neighborRoofX1 = neighborRoofX0 + NEIGHBOR_LENGTH_X;
  const neighborRoofZNear = -fenceOffset - NEIGHBOR_FENCE_SETBACK;
  const neighborRoofZFar = neighborRoofZNear - NEIGHBOR_WIDTH_Z;

  const neighborWallX0 = neighborRoofX0 + NEIGHBOR_EAVE_INSET;
  const neighborWallX1 = neighborRoofX1 - NEIGHBOR_EAVE_INSET;
  const neighborWallZFar = neighborRoofZFar + NEIGHBOR_EAVE_INSET;
  const neighborWallZNear = neighborRoofZNear - NEIGHBOR_EAVE_INSET;

  const neighborBrickMat = new THREE.MeshStandardMaterial({
    color: NEIGHBOR_BRICK_BASE_COLOR,
    map: null,
    normalMap: brickPack?.normalMap || null,
    roughnessMap: brickPack?.roughnessMap || null,
    aoMap: brickPack?.aoMap || null,
    roughness: brickPack?.roughnessMap ? 1.0 : 0.92,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  neighborBrickMat.userData.worldBoxUvScale = HOUSE_BRICK_TEX_METERS;
  if (neighborBrickMat.normalMap) neighborBrickMat.normalScale = new THREE.Vector2(0.65, 0.65);

  const weatherboardPack = getNeighborWeatherboardTexturePack();
  const neighborWeatherboardMat = new THREE.MeshStandardMaterial({
    color: WEATHERBOARD_BASE_COLOR,
    map: weatherboardPack?.map || null,
    bumpMap: weatherboardPack?.bumpMap || null,
    bumpScale: weatherboardPack?.bumpMap ? 0.022 : 0,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  neighborWeatherboardMat.userData.worldBoxUvScale = WEATHERBOARD_BOARD_SPACING_M * WEATHERBOARD_BOARDS_PER_TILE;

  const neighborRoofMat = new THREE.MeshLambertMaterial({
    color: 0x646a72,
    side: THREE.DoubleSide,
  });

  if (
    neighborWallX1 > neighborWallX0 + 0.05 &&
    neighborWallZNear > neighborWallZFar + 0.05
  ) {
    const neighborLowerH = NEIGHBOR_WALL_HEIGHT * 0.5;
    const neighborUpperH = Math.max(0.2, NEIGHBOR_WALL_HEIGHT - neighborLowerH);
    addHouseMassBox(
      neighborWallX1 - neighborWallX0,
      neighborLowerH,
      neighborWallZNear - neighborWallZFar,
      (neighborWallX0 + neighborWallX1) * 0.5,
      neighborLowerH * 0.5,
      (neighborWallZFar + neighborWallZNear) * 0.5,
      neighborBrickMat
    );
    addHouseMassBox(
      neighborWallX1 - neighborWallX0,
      neighborUpperH,
      neighborWallZNear - neighborWallZFar,
      (neighborWallX0 + neighborWallX1) * 0.5,
      neighborLowerH + (neighborUpperH * 0.5),
      (neighborWallZFar + neighborWallZNear) * 0.5,
      neighborWeatherboardMat
    );
    addHouseMassBox(
      neighborWallX1 - neighborWallX0,
      NEIGHBOR_ROOF_START_CAP,
      neighborWallZNear - neighborWallZFar,
      (neighborWallX0 + neighborWallX1) * 0.5,
      NEIGHBOR_WALL_HEIGHT + (NEIGHBOR_ROOF_START_CAP * 0.5),
      (neighborWallZFar + neighborWallZNear) * 0.5,
      houseRoofStartMat
    );

    const nRoofBaseY = NEIGHBOR_WALL_HEIGHT + NEIGHBOR_ROOF_START_CAP;
    const nRoofPeakY = nRoofBaseY + NEIGHBOR_ROOF_RISE;
    const nx0 = neighborRoofX0 - NEIGHBOR_ROOF_OVERHANG;
    const nx1 = neighborRoofX1 + NEIGHBOR_ROOF_OVERHANG;
    const nz0 = neighborRoofZFar - NEIGHBOR_ROOF_OVERHANG;
    const nz1 = neighborRoofZNear + NEIGHBOR_ROOF_OVERHANG;
    const nxCenter = (nx0 + nx1) * 0.5;
    const nHipRun = Math.min((nx1 - nx0) * 0.5, (nz1 - nz0) * 0.5 - 0.05);

    const ne00 = new THREE.Vector3(nx0, nRoofBaseY, nz0);
    const ne10 = new THREE.Vector3(nx1, nRoofBaseY, nz0);
    const ne11 = new THREE.Vector3(nx1, nRoofBaseY, nz1);
    const ne01 = new THREE.Vector3(nx0, nRoofBaseY, nz1);
    const nRidge0 = new THREE.Vector3(nxCenter, nRoofPeakY, nz0 + nHipRun);
    const nRidge1 = new THREE.Vector3(nxCenter, nRoofPeakY, nz1 - nHipRun);

    const neighborRoofVerts = [];
    const pushNeighborTri = (a, b, c) => {
      neighborRoofVerts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    pushNeighborTri(ne00, ne01, nRidge1);
    pushNeighborTri(ne00, nRidge1, nRidge0);
    pushNeighborTri(ne10, nRidge0, nRidge1);
    pushNeighborTri(ne10, nRidge1, ne11);
    pushNeighborTri(ne00, ne10, nRidge0);
    pushNeighborTri(ne01, nRidge1, ne11);

    const neighborRoofGeo = new THREE.BufferGeometry();
    neighborRoofGeo.setAttribute('position', new THREE.Float32BufferAttribute(neighborRoofVerts, 3));
    neighborRoofGeo.computeVertexNormals();

    const neighborRoof = new THREE.Mesh(neighborRoofGeo, neighborRoofMat);
    neighborRoof.castShadow = true;
    neighborRoof.receiveShadow = true;
    neighborRoof.userData.context = 'house';
    neighborRoof.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(neighborRoofGeo),
      new THREE.LineBasicMaterial({color: 0x4f545b, transparent: true, opacity: 0.65})
    ));
    environmentGroup.add(neighborRoof);

    const neighborSoffitT = 0.017;
    const neighborRoofSoffit = box(
      nx1 - nx0,
      neighborSoffitT,
      nz1 - nz0,
      new THREE.MeshLambertMaterial({ color: 0x666d75, side: THREE.DoubleSide }),
      0, 0, 0,
      (nx0 + nx1) * 0.5,
      nRoofBaseY - (neighborSoffitT * 0.5),
      (nz0 + nz1) * 0.5
    );
    neighborRoofSoffit.castShadow = true;
    neighborRoofSoffit.receiveShadow = true;
    neighborRoofSoffit.userData.context = 'house';
    environmentGroup.add(neighborRoofSoffit);

    // Windows on the side facing this property (+Z side).
    const winCount = Math.max(1, Math.round(Number(NEIGHBOR_WINDOW_COUNT) || 4));
    const winW = Math.min(NEIGHBOR_WINDOW_WIDTH, Math.max(0.25, (neighborWallX1 - neighborWallX0) * 0.22));
    const winBottomY = THREE.MathUtils.clamp(
      Number(NEIGHBOR_WINDOW_BOTTOM_Y) || 3.2,
      0.4,
      nRoofBaseY - 0.5
    );
    const winTopY = nRoofBaseY - 0.02;
    const winH = Math.max(0.35, winTopY - winBottomY);
    const winFrontOffset = Math.max(0, Number(NEIGHBOR_WINDOW_FRONT_OFFSET) || 0);
    const winBackOffset = Math.max(0, Number(NEIGHBOR_WINDOW_BACK_OFFSET) || 0);
    const winXFirst = neighborWallX0 + winBackOffset + (winW * 0.5);
    const winXLast = neighborWallX1 - winFrontOffset - (winW * 0.5);

    const windowMat = new THREE.MeshPhongMaterial({
      color: 0x9dafbf,
      emissive: 0x1b2a35,
      emissiveIntensity: 0.10,
      opacity: 0.58,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const windowFrameMat = new THREE.LineBasicMaterial({
      color: 0x3f454b,
      transparent: true,
      opacity: 0.85,
    });
    const winDepth = 0.05;
    for (let i = 0; i < winCount; i++) {
      const t = (winCount <= 1) ? 0.5 : (i / (winCount - 1));
      const winX = (winXLast > winXFirst)
        ? THREE.MathUtils.lerp(winXFirst, winXLast, t)
        : THREE.MathUtils.lerp(neighborWallX0 + winW, neighborWallX1 - winW, t);
      const win = box(
        winW,
        winH,
        winDepth,
        windowMat,
        0, 0, 0,
        winX,
        winBottomY + (winH * 0.5),
        neighborWallZNear + (winDepth * 0.5) + 0.004
      );
      win.userData.context = 'house';
      win.castShadow = true;
      win.receiveShadow = true;
      win.add(new THREE.LineSegments(new THREE.EdgesGeometry(win.geometry), windowFrameMat));
      environmentGroup.add(win);
    }
  }

  // Top-perimeter line for the inset wall footprint + rear corner projection.
  const hy = houseWallHeight + houseRoofStartCap + 0.002;
  const houseTopLoop = [
    new THREE.Vector3(houseBackOffsetX, hy, wallZ0),
    new THREE.Vector3(wallX0, hy, wallZ0),
    new THREE.Vector3(wallX1, hy, wallZ0),
    new THREE.Vector3(wallX1, hy, wallZ1),
    new THREE.Vector3(wallX0, hy, wallZ1),
    new THREE.Vector3(wallX0, hy, backProjectZ1),
    new THREE.Vector3(houseBackOffsetX, hy, backProjectZ1),
    new THREE.Vector3(houseBackOffsetX, hy, wallZ0),
  ];
  environmentGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(houseTopLoop), houseOutlineMat));

  // Rear openings facing outdoor area:
  // - French door: 1.8m wide x 2.0m high, starts 0.5m from projection edge.
  // - Window: 1.5m wide x 1.2m high, starts 1.4m after door.
  // - Projection window: 1.2m wide x 0.6m high, sill 1.04m, starts 1.04m from rear corner.
  const openingFrameMat = new THREE.MeshLambertMaterial({ color: 0xe9ecef, side: THREE.DoubleSide });
  const openingGlassMat = new THREE.MeshPhongMaterial({
    color: 0x97aabc,
    emissive: 0x1b2a35,
    emissiveIntensity: 0.12,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
  });
  const openingEdgeMat = new THREE.LineBasicMaterial({ color: 0x50565e, transparent: true, opacity: 0.72 });
  const openingDepth = 0.04;
  const rearFaceX = wallX0 - 0.002;

  const addRearOpeningFrame = (widthZ, heightY, bottomY, centerZ, withMullion=false) => {
    const frame = box(
      openingDepth,
      heightY,
      widthZ,
      openingFrameMat,
      0, 0, 0,
      rearFaceX - (openingDepth * 0.5),
      bottomY + (heightY * 0.5),
      centerZ
    );
    frame.userData.context = 'houseOpening';
    frame.castShadow = true;
    frame.receiveShadow = true;
    frame.add(new THREE.LineSegments(new THREE.EdgesGeometry(frame.geometry), openingEdgeMat));
    environmentGroup.add(frame);
    if (!withMullion) return frame;
    const mullion = box(
      openingDepth * 0.9,
      heightY - 0.06,
      0.05,
      openingFrameMat,
      0, 0, 0,
      rearFaceX - (openingDepth * 0.45),
      bottomY + (heightY * 0.5),
      centerZ
    );
    mullion.userData.context = 'houseOpening';
    mullion.castShadow = true;
    mullion.receiveShadow = true;
    environmentGroup.add(mullion);
    return frame;
  };

  const addRearGlass = (widthZ, heightY, bottomY, centerZ) => {
    const glass = box(
      openingDepth * 0.42,
      heightY,
      widthZ,
      openingGlassMat,
      0, 0, 0,
      rearFaceX - 0.006,
      bottomY + (heightY * 0.5),
      centerZ
    );
    glass.userData.context = 'houseOpening';
    glass.castShadow = true;
    glass.receiveShadow = true;
    environmentGroup.add(glass);
    return glass;
  };

  const outdoorSlabTopYForOpenings = OUTDOOR_SLAB_HEIGHT;
  const frenchDoorW = 1.8;
  const frenchDoorH = 2.0;
  // Door starts 20mm above the outdoor slab top.
  const frenchDoorBottomY = outdoorSlabTopYForOpenings + 0.02;
  const frenchDoorOffsetFromProjection = 0.5;
  const doorZ0 = THREE.MathUtils.clamp(
    backProjectZ1 + frenchDoorOffsetFromProjection,
    wallZ0 + 0.05,
    wallZ1 - frenchDoorW - 0.05
  );
  const doorZ1 = doorZ0 + frenchDoorW;
  const doorZc = (doorZ0 + doorZ1) * 0.5;
  addRearOpeningFrame(frenchDoorW, frenchDoorH, frenchDoorBottomY, doorZc, true);
  const frenchInset = 0.09;
  const frenchLeafW = (frenchDoorW - (frenchInset * 3)) * 0.5;
  const frenchGlassH = frenchDoorH - 0.22;
  const frenchGlassBottom = frenchDoorBottomY + 0.10;
  addRearGlass(frenchLeafW, frenchGlassH, frenchGlassBottom, doorZ0 + frenchInset + (frenchLeafW * 0.5));
  addRearGlass(frenchLeafW, frenchGlassH, frenchGlassBottom, doorZ1 - frenchInset - (frenchLeafW * 0.5));

  const rearWinGapFromDoor = 1.4;
  const rearWinW = 1.5;
  const rearWinH = 1.2;
  // Rear window sill height measured from outdoor slab level.
  const rearWinBottomY = outdoorSlabTopYForOpenings + 1.0;
  const rearWinZ0 = THREE.MathUtils.clamp(
    doorZ1 + rearWinGapFromDoor,
    wallZ0 + 0.05,
    wallZ1 - rearWinW - 0.05
  );
  const rearWinZc = rearWinZ0 + (rearWinW * 0.5);
  addRearOpeningFrame(rearWinW, rearWinH, rearWinBottomY, rearWinZc, false);
  addRearGlass(rearWinW - 0.12, rearWinH - 0.14, rearWinBottomY + 0.07, rearWinZc);

  const projWinW = 1.2;
  const projWinH = 0.6;
  const projWinBottomY = 1.04;
  const projWinOffsetFromBack = 1.04;
  const projFaceX = houseBackOffsetX - 0.002;
  const projWinZ0 = THREE.MathUtils.clamp(
    wallZ0 + projWinOffsetFromBack,
    wallZ0 + 0.05,
    backProjectZ1 - projWinW - 0.05
  );
  const projWinZc = projWinZ0 + (projWinW * 0.5);
  const projFrame = box(
    openingDepth,
    projWinH,
    projWinW,
    openingFrameMat,
    0, 0, 0,
    projFaceX - (openingDepth * 0.5),
    projWinBottomY + (projWinH * 0.5),
    projWinZc
  );
  projFrame.userData.context = 'houseOpening';
  projFrame.castShadow = true;
  projFrame.receiveShadow = true;
  projFrame.add(new THREE.LineSegments(new THREE.EdgesGeometry(projFrame.geometry), openingEdgeMat));
  environmentGroup.add(projFrame);
  const projGlass = box(
    openingDepth * 0.42,
    projWinH - 0.12,
    projWinW - 0.12,
    openingGlassMat,
    0, 0, 0,
    projFaceX - 0.006,
    projWinBottomY + (projWinH * 0.5),
    projWinZc
  );
  projGlass.userData.context = 'houseOpening';
  projGlass.castShadow = true;
  projGlass.receiveShadow = true;
  environmentGroup.add(projGlass);

  // Concrete path: 0.6m wide around full house footprint (including rear projection).
  const pathW = HOUSE_PATH_WIDTH;
  const pathT = HOUSE_PATH_THICKNESS;
  const pathY = -0.051 + (pathT * 0.5) + 0.001;
  const pathMat = new THREE.MeshLambertMaterial({ color: 0xb7b8b3, side: THREE.DoubleSide });
  const pathEdgeMat = new THREE.LineBasicMaterial({ color: 0x8e8f8a, transparent: true, opacity: 0.7 });
  const outerPathPts = [
    new THREE.Vector2(houseBackOffsetX - pathW, wallZ0 - pathW),
    new THREE.Vector2(wallX1 + pathW, wallZ0 - pathW),
    new THREE.Vector2(wallX1 + pathW, wallZ1 + pathW),
    new THREE.Vector2(wallX0 - pathW, wallZ1 + pathW),
    new THREE.Vector2(wallX0 - pathW, backProjectZ1 + pathW),
    new THREE.Vector2(houseBackOffsetX - pathW, backProjectZ1 + pathW),
  ];
  const innerPathPts = [
    new THREE.Vector2(houseBackOffsetX, wallZ0),
    new THREE.Vector2(wallX1, wallZ0),
    new THREE.Vector2(wallX1, wallZ1),
    new THREE.Vector2(wallX0, wallZ1),
    new THREE.Vector2(wallX0, backProjectZ1),
    new THREE.Vector2(houseBackOffsetX, backProjectZ1),
  ];
  if (THREE.ShapeUtils.isClockWise(outerPathPts)) outerPathPts.reverse();
  if (!THREE.ShapeUtils.isClockWise(innerPathPts)) innerPathPts.reverse();

  const pathShape = new THREE.Shape(outerPathPts);
  pathShape.holes.push(new THREE.Path(innerPathPts));
  const pathGeo = new THREE.ExtrudeGeometry(pathShape, {
    depth: pathT,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  // Extrude in +Y and lay the ring out across X/Z.
  pathGeo.rotateX(Math.PI * 0.5);

  const housePath = new THREE.Mesh(pathGeo, pathMat);
  housePath.castShadow = true;
  housePath.receiveShadow = true;
  housePath.position.y = pathY + (pathT * 0.5);
  housePath.userData.context = 'housePath';
  housePath.add(new THREE.LineSegments(new THREE.EdgesGeometry(pathGeo), pathEdgeMat));
  environmentGroup.add(housePath);
  const pathTopY = housePath.position.y;

  // Outdoor area slab (concrete):
  // - 100mm high
  // - 6200mm out from back wall
  // - 4940mm wide
  // - starts 270mm from the non-corner end of the projected back wall segment
  const outdoorSlabH = OUTDOOR_SLAB_HEIGHT;
  const outdoorSlabOutX = OUTDOOR_SLAB_PROJECTION_X;
  const outdoorSlabW = OUTDOOR_SLAB_WIDTH_Z;
  const outdoorStartAlongProj = OUTDOOR_SLAB_START_ALONG_PROJECTION;
  // Pull slab in to meet the regular wall line (inset 0.6m from eave/back line).
  const slabX1 = wallX0;
  const slabX0 = slabX1 - outdoorSlabOutX;
  const slabZ0 = (backProjectZ1 - outdoorStartAlongProj);
  const slabZ1 = slabZ0 + outdoorSlabW;
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xc5c2bb, side: THREE.DoubleSide });
  const slabEdgeMat = new THREE.LineBasicMaterial({ color: 0x97938b, transparent: true, opacity: 0.75 });
  const outdoorSlab = box(
    slabX1 - slabX0,
    outdoorSlabH,
    slabZ1 - slabZ0,
    slabMat,
    0, 0, 0,
    (slabX0 + slabX1) * 0.5,
    outdoorSlabH * 0.5,
    (slabZ0 + slabZ1) * 0.5
  );
  outdoorSlab.userData.context = 'outdoorSlab';
  outdoorSlab.add(new THREE.LineSegments(new THREE.EdgesGeometry(outdoorSlab.geometry), slabEdgeMat));
  environmentGroup.add(outdoorSlab);

  // Storage bench box on the projected 600mm wall segment:
  // from the slab edge to 600mm from the house end along that wall.
  const benchInsetFromHouseEnd = 0.60;
  const benchWallGap = 0.03;
  const benchDepth = 0.46;
  const benchHeight = 0.46;

  const projectedWallX = houseBackOffsetX;
  const benchRunStartZ = THREE.MathUtils.clamp(slabZ0, wallZ0, backProjectZ1);
  const benchRunEndZ = THREE.MathUtils.clamp(wallZ0 + benchInsetFromHouseEnd, wallZ0, backProjectZ1);
  const benchZ0 = Math.min(benchRunStartZ, benchRunEndZ);
  const benchZ1 = Math.max(benchRunStartZ, benchRunEndZ);
  const benchLen = benchZ1 - benchZ0;

  if (benchLen > 0.15) {
    const benchMat = new THREE.MeshLambertMaterial({ color: 0xb18c61, side: THREE.DoubleSide });
    const benchEdgeMat = new THREE.LineBasicMaterial({ color: 0x5e4a37, transparent: true, opacity: 0.65 });
    const benchBox = box(
      benchDepth,
      benchHeight,
      benchLen,
      benchMat,
      0, 0, 0,
      projectedWallX - benchWallGap - (benchDepth * 0.5),
      pathTopY + (benchHeight * 0.5),
      (benchZ0 + benchZ1) * 0.5
    );
    benchBox.userData.context = 'outdoorBench';
    benchBox.castShadow = true;
    benchBox.receiveShadow = true;
    benchBox.add(new THREE.LineSegments(new THREE.EdgesGeometry(benchBox.geometry), benchEdgeMat));
    environmentGroup.add(benchBox);
  }

  // Outdoor area roof + post set.
  // Two tall slab posts: 115x115 timber, 2480mm high.
  // Three house-side posts: extend 400mm above house roof, and roof slopes down to slab posts.
  const roofPostSize = 0.115;
  const tallPostHeight = 2.48;
  const housePostAboveRoof = 0.40;
  const housePostRoofPenetration = 0.08; // extends slightly through house roof
  const tallInsetFromSlabEnd = 0.60;
  const tallInsetBackSide = 0.30;  // post nearest back corner
  const tallInsetFrontSide = 0.50; // opposite side
  const roofThickness = 0.06;
  const roofSideOverhang = 0.30;
  const roofHouseEndOverhang = 0.10;

  const roofPostMat = new THREE.MeshLambertMaterial({ color: 0x9f7b58, side: THREE.DoubleSide });
  const outdoorRoofMat = new THREE.MeshLambertMaterial({ color: 0x6c7279, side: THREE.DoubleSide });
  const outdoorRoofEdgeMat = new THREE.LineBasicMaterial({ color: 0x52575f, transparent: true, opacity: 0.75 });

  const addTimberPost = (x, z, bottomY, height, contextTag='outdoorRoofPost') => {
    if (height <= 0.01) return;
    const post = box(
      roofPostSize,
      height,
      roofPostSize,
      roofPostMat,
      0, 0, 0,
      x, bottomY + (height * 0.5), z
    );
    post.userData.context = contextTag;
    post.add(new THREE.LineSegments(new THREE.EdgesGeometry(post.geometry), new THREE.LineBasicMaterial({
      color: 0x7f5d3f,
      transparent: true,
      opacity: 0.6,
    })));
    environmentGroup.add(post);
  };

  const slabTopY = outdoorSlabH;
  const tallPostX = slabX0 + tallInsetFromSlabEnd;
  const tallPostZA = slabZ0 + tallInsetBackSide;
  const tallPostZB = slabZ1 - tallInsetFrontSide;
  const tallPostTopY = slabTopY + tallPostHeight;

  // 2 tall posts near slab outer end.
  addTimberPost(tallPostX, tallPostZA, slabTopY, tallPostHeight, 'outdoorRoofPostTall');
  addTimberPost(tallPostX, tallPostZB, slabTopY, tallPostHeight, 'outdoorRoofPostTall');

  // Roof footprint: spans to slab end and keeps a small overhang toward the house.
  // The 3 short posts remain on the house wall line and extend through the house roof.
  const roofX0 = slabX0;
  const roofX1 = slabX1 + roofHouseEndOverhang;
  const roofZ0 = slabZ0;
  const roofZ1 = slabZ1;

  // 3 house-side posts, evenly spaced across z, anchored on the house wall line.
  const housePostX = slabX1;
  const housePostZMin = roofZ0 + roofSideOverhang;
  const housePostZMax = roofZ1 - roofSideOverhang;
  const housePostStep = (housePostZMax - housePostZMin) / 2;
  const housePostZMid = housePostZMin + housePostStep;

  const roofProbe = new THREE.Raycaster();
  const roofProbeDir = new THREE.Vector3(0, -1, 0);
  const roofProbeOrigin = new THREE.Vector3();
  const sampleHouseRoofYAt = (x, z) => {
    roofProbeOrigin.set(x, roofPeakY + houseRoofRise + 2.0, z);
    roofProbe.set(roofProbeOrigin, roofProbeDir);
    const hit = roofProbe.intersectObject(houseRoof, false);
    return hit.length ? hit[0].point.y : roofPeakY;
  };

  // House-side post tops: 400mm above house roof at each post location.
  const housePostTopY0 = sampleHouseRoofYAt(housePostX, housePostZMin) + housePostAboveRoof;
  const housePostTopY1 = sampleHouseRoofYAt(housePostX, housePostZMid) + housePostAboveRoof;
  const housePostTopY2 = sampleHouseRoofYAt(housePostX, housePostZMax) + housePostAboveRoof;

  // Add the 3 short posts through house roof.
  const addHousePost = (z, topY) => {
    const roofY = sampleHouseRoofYAt(housePostX, z);
    const bottomY = roofY - housePostRoofPenetration;
    const height = (topY - roofY) + housePostRoofPenetration;
    addTimberPost(housePostX, z, bottomY, height, 'outdoorRoofPostShort');
  };
  addHousePost(housePostZMin, housePostTopY0);
  addHousePost(housePostZMid, housePostTopY1);
  addHousePost(housePostZMax, housePostTopY2);

  // High-edge roof top line from house posts (linear through first/last post).
  const highTopZ0 = housePostTopY0;
  const highTopZ1 = housePostTopY2;

  // Solve low-edge top so roof passes through tall-post top at x=tallPostX.
  const tTall = THREE.MathUtils.clamp(
    (tallPostX - roofX0) / Math.max(1e-6, (roofX1 - roofX0)),
    0.0,
    1.0
  );
  const solveLowTopY = (highY, targetY) => {
    const denom = Math.max(1e-6, 1.0 - tTall);
    return (targetY - (highY * tTall)) / denom;
  };
  const lowTopZ0 = solveLowTopY(highTopZ0, tallPostTopY);
  const lowTopZ1 = solveLowTopY(highTopZ1, tallPostTopY);

  // Sloped roof slab geometry (wedge) from house side down to slab posts.
  const rt00 = new THREE.Vector3(roofX0, lowTopZ0, roofZ0);
  const rt10 = new THREE.Vector3(roofX1, highTopZ0, roofZ0);
  const rt11 = new THREE.Vector3(roofX1, highTopZ1, roofZ1);
  const rt01 = new THREE.Vector3(roofX0, lowTopZ1, roofZ1);
  const rb00 = new THREE.Vector3(roofX0, lowTopZ0 - roofThickness, roofZ0);
  const rb10 = new THREE.Vector3(roofX1, highTopZ0 - roofThickness, roofZ0);
  const rb11 = new THREE.Vector3(roofX1, highTopZ1 - roofThickness, roofZ1);
  const rb01 = new THREE.Vector3(roofX0, lowTopZ1 - roofThickness, roofZ1);

  const outdoorRoofVerts = [
    rt00.x, rt00.y, rt00.z,
    rt10.x, rt10.y, rt10.z,
    rt11.x, rt11.y, rt11.z,
    rt01.x, rt01.y, rt01.z,
    rb00.x, rb00.y, rb00.z,
    rb10.x, rb10.y, rb10.z,
    rb11.x, rb11.y, rb11.z,
    rb01.x, rb01.y, rb01.z,
  ];
  const outdoorRoofIdx = [
    0, 1, 2, 0, 2, 3, // top
    6, 5, 4, 7, 6, 4, // bottom
    4, 5, 1, 4, 1, 0, // z0 side
    5, 6, 2, 5, 2, 1, // x1 side
    6, 7, 3, 6, 3, 2, // z1 side
    7, 4, 0, 7, 0, 3, // x0 side
  ];
  const outdoorRoofGeo = new THREE.BufferGeometry();
  outdoorRoofGeo.setAttribute('position', new THREE.Float32BufferAttribute(outdoorRoofVerts, 3));
  outdoorRoofGeo.setIndex(outdoorRoofIdx);
  outdoorRoofGeo.computeVertexNormals();
  const outdoorRoof = new THREE.Mesh(outdoorRoofGeo, outdoorRoofMat);
  outdoorRoof.castShadow = true;
  outdoorRoof.receiveShadow = true;
  outdoorRoof.userData.context = 'outdoorRoof';
  outdoorRoof.add(new THREE.LineSegments(new THREE.EdgesGeometry(outdoorRoofGeo), outdoorRoofEdgeMat));
  environmentGroup.add(outdoorRoof);

  updateEnvironmentAnchors();
  if (typeof applyEnvironmentVisualState === 'function') applyEnvironmentVisualState();
})();

function clearGroupChildren(group) {
  while (group.children.length) {
    const child = group.children.pop();
    group.remove(child);
    child.traverse(obj => {
      if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
    });
  }
}

function rebuildCrashMatsGeometry() {
  if (!crashMatsGroup) return;
  clearGroupChildren(crashMatsGroup);

  const seam = 0.02;
  const matW = (W - seam) * 0.5;
  const matD = (D - seam) * 0.5;
  const edgeExtension = 0.50;
  const padShrink = 0.012; // small inset to avoid coplanar z-fighting against wall kick faces
  const matY = CRASH_MAT_THICKNESS * 0.5;

  const f1Width = THREE.MathUtils.clamp(Number(wallState.f1Width) || 0, 0, W);
  const frontStopX = THREE.MathUtils.clamp(W - f1Width, 0, W);

  const matTexturePack = (
    crashMatTextureEnabled &&
    typeof getCrashMatTexturePack === 'function'
  ) ? getCrashMatTexturePack() : null;
  if (!crashMatsGroup.userData.matMaterial) {
    crashMatsGroup.userData.matMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: matTexturePack ? matTexturePack.map : null,
      bumpMap: matTexturePack ? matTexturePack.bumpMap : null,
      bumpScale: matTexturePack ? 0.036 : 0.0,
      transparent: false,
      opacity: 1.0
    });
    crashMatsGroup.userData.edgeMaterial = new THREE.LineBasicMaterial({color: 0x4f575f});
  }
  const matMaterial = crashMatsGroup.userData.matMaterial;
  if (matTexturePack) {
    matMaterial.color.setHex(0xffffff);
    matMaterial.map = matTexturePack.map;
    matMaterial.bumpMap = matTexturePack.bumpMap;
    matMaterial.bumpScale = 0.036;
  } else {
    matMaterial.color.setHex(0x3f5f7f);
    matMaterial.map = null;
    matMaterial.bumpMap = null;
    matMaterial.bumpScale = 0.0;
  }
  matMaterial.needsUpdate = true;
  const edgeMaterial = crashMatsGroup.userData.edgeMaterial;

  const addPad = (w, d, cx, cz) => {
    const wInset = w - padShrink;
    const dInset = d - padShrink;
    if (wInset <= 0.01 || dInset <= 0.01) return;
    const pad = box(wInset, CRASH_MAT_THICKNESS, dInset, matMaterial, 0, 0, 0, cx, matY, cz);
    pad.add(new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), edgeMaterial));
    crashMatsGroup.add(pad);
  };

  // 4 main pads inside room.
  for (let ix = 0; ix < 2; ix++) {
    for (let iz = 0; iz < 2; iz++) {
      const cx = matW * 0.5 + ix * (matW + seam);
      const cz = matD * 0.5 + iz * (matD + seam);
      addPad(matW, matD, cx, cz);
    }
  }

  // Front 50cm sections on E-F edge (z = D ... D+0.5).
  // Right section is shortened to stop at the inside face of F: x = W - f1Width.
  const leftFrontStart = 0;
  const leftFrontEnd = matW;
  const rightFrontStart = matW + seam;
  const rightFrontEnd = Math.min(W, frontStopX);
  if (leftFrontEnd > leftFrontStart) {
    addPad(leftFrontEnd - leftFrontStart, edgeExtension, (leftFrontStart + leftFrontEnd) * 0.5, D + edgeExtension * 0.5);
  }
  if (rightFrontEnd > rightFrontStart) {
    addPad(rightFrontEnd - rightFrontStart, edgeExtension, (rightFrontStart + rightFrontEnd) * 0.5, D + edgeExtension * 0.5);
  }

  // Side 50cm sections on F-D edge (x = W ... W+0.5), limited to z <= D.
  for (let iz = 0; iz < 2; iz++) {
    const cx = W + edgeExtension * 0.5;
    const cz = matD * 0.5 + iz * (matD + seam);
    addPad(edgeExtension, matD, cx, cz);
  }
}

// ── Crash mats (toggleable) ──
(function() {
  crashMatsGroup = new THREE.Group();
  crashMatsGroup.position.set(WALL_ORIGIN_X, 0, WALL_ORIGIN_Z);
  rebuildCrashMatsGeometry();
  crashMatsGroup.visible = crashMatsEnabled;
  scene.add(crashMatsGroup);
})();

// ── Human scale references (adult + child using man.png silhouette) ──
(function() {
  const adultH = 1.73;
  const childH = SON_HEIGHT;
  const personOpacity = 0.5;
  const baseZ = WALL_ORIGIN_Z + (D * 0.5);
  const adultBaseX = WALL_ORIGIN_X + (W * 0.5) - 0.22;
  const childBaseX = adultBaseX + 0.04;
  const childBaseZ = baseZ + 0.55;
  const facingY = -0.35;

  function setPrimary(mesh, isBillboard) {
    scalePersonMesh = mesh;
    scalePersonBillboard = isBillboard ? mesh : null;
  }

  function setCompanion(mesh, isBillboard) {
    scalePersonCompanionMesh = mesh;
    scalePersonCompanionBillboard = isBillboard ? mesh : null;
  }

  function addFallback() {
    const createFallback = (height, baseX, baseZPos) => {
      const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.12 * (height / adultH), Math.max(0.20, height - 0.24), 6, 12),
        new THREE.MeshLambertMaterial({
          color:0x111111,
          transparent:true,
          opacity:personOpacity,
          depthWrite:false
        })
      );
      m.userData.personYOffset = height * 0.5;
      m.position.set(baseX, getActiveFloorY(baseX, baseZPos) + m.userData.personYOffset, baseZPos);
      m.rotation.y = facingY;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };

    setPrimary(createFallback(adultH, adultBaseX, baseZ), false);
    setCompanion(createFallback(childH, childBaseX, childBaseZ), false);
  }

  const embeddedManImage = (
    (typeof MAN_PNG_DATA_URL === 'string' && MAN_PNG_DATA_URL.length > 64)
      ? MAN_PNG_DATA_URL
      : (
          typeof window !== 'undefined' &&
          typeof window.MAN_PNG_DATA_URL === 'string' &&
          window.MAN_PNG_DATA_URL.length > 64
        )
          ? window.MAN_PNG_DATA_URL
          : null
  );
  const manImageUrl = (typeof embeddedManImage === 'string' && embeddedManImage.startsWith('data:image/'))
    ? embeddedManImage
    : null;
  if (!manImageUrl) {
    addFallback();
    return;
  }
  new THREE.TextureLoader().load(
    manImageUrl,
    tex => {
      const img = tex.image;
      if (!img || !img.width || !img.height) {
        addFallback();
        return;
      }

      const w = img.width;
      const h = img.height;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const src = ctx.getImageData(0, 0, w, h);
      const dst = ctx.createImageData(w, h);

      let hasTransparency = false;
      for (let i = 3; i < src.data.length; i += 4) {
        if (src.data[i] < 250) { hasTransparency = true; break; }
      }
      const cornerIdx = [
        0,
        ((w - 1) * 4),
        (((h - 1) * w) * 4),
        (((h - 1) * w + (w - 1)) * 4),
      ];
      let bgR = 0, bgG = 0, bgB = 0;
      cornerIdx.forEach(ci => {
        bgR += src.data[ci];
        bgG += src.data[ci + 1];
        bgB += src.data[ci + 2];
      });
      bgR /= 4; bgG /= 4; bgB /= 4;
      let maxColorDist = 0;
      if (!hasTransparency) {
        for (let i = 0; i < src.data.length; i += 4) {
          const r = src.data[i];
          const g = src.data[i + 1];
          const b = src.data[i + 2];
          const d = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          if (d > maxColorDist) maxColorDist = d;
        }
      }
      const adaptiveDistThresh = Math.max(3, maxColorDist * 0.18);

      let minX = w, minY = h, maxX = -1, maxY = -1;
      let keepCount = 0;
      for (let i = 0; i < src.data.length; i += 4) {
        const r = src.data[i];
        const g = src.data[i + 1];
        const b = src.data[i + 2];
        const a = src.data[i + 3];
        const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        let keep = false;
        if (hasTransparency) keep = a > 16;
        else keep = colorDist > adaptiveDistThresh;
        const di = i;
        if (keep) {
          dst.data[di] = 14;
          dst.data[di + 1] = 14;
          dst.data[di + 2] = 14;
          dst.data[di + 3] = 255;
          keepCount++;
          const px = ((i / 4) % w) | 0;
          const py = ((i / 4) / w) | 0;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        } else {
          dst.data[di] = 0;
          dst.data[di + 1] = 0;
          dst.data[di + 2] = 0;
          dst.data[di + 3] = 0;
        }
      }
      const contentHRaw = (maxY >= minY) ? (maxY - minY + 1) : 0;
      const contentWRaw = (maxX >= minX) ? (maxX - minX + 1) : 0;
      if (keepCount < 64 || contentHRaw < h * 0.2 || contentWRaw < w * 0.1) {
        addFallback();
        return;
      }
      ctx.putImageData(dst, 0, 0);

      const silhouetteTex = new THREE.CanvasTexture(c);
      silhouetteTex.needsUpdate = true;
      silhouetteTex.minFilter = THREE.LinearFilter;
      silhouetteTex.magFilter = THREE.LinearFilter;
      if (renderer?.capabilities?.getMaxAnisotropy) {
        silhouetteTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }

      const contentH = contentHRaw;
      const bottomMargin = (h - 1) - maxY;
      const contentCenterX = (minX + maxX + 1) * 0.5;
      const xPixelOffset = contentCenterX - (w * 0.5);

      const createBillboard = (height, baseX, baseZPos) => {
        const planeH = height * (h / contentH);
        const planeW = planeH * (w / h);
        const yCenter = planeH * 0.5 - (bottomMargin / h) * planeH;
        const xCenterOffset = -(xPixelOffset / w) * planeW;
        const billboard = new THREE.Mesh(
          new THREE.PlaneGeometry(planeW, planeH),
          new THREE.MeshBasicMaterial({
            map: silhouetteTex,
            transparent: true,
            opacity: personOpacity,
            alphaTest: 0.4,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        );
        billboard.userData.personYOffset = yCenter;
        billboard.position.set(
          baseX + xCenterOffset,
          getActiveFloorY(baseX + xCenterOffset, baseZPos) + yCenter,
          baseZPos
        );
        billboard.rotation.y = facingY;
        scene.add(billboard);
        return billboard;
      };

      setPrimary(createBillboard(adultH, adultBaseX, baseZ), true);
      setCompanion(createBillboard(childH, childBaseX, childBaseZ), true);
      tex.dispose();
    },
    undefined,
    () => addFallback()
  );
})();

// ── Axis indicator (static, bottom-left corner area) ──
(function() {
  const origin = new THREE.Vector3(WALL_ORIGIN_X - 0.6, 0.1, WALL_ORIGIN_Z + D + 0.6);
  const len = 0.22;
  const axes = [
    { dir: new THREE.Vector3(1,0,0), color: 0xff4444, label: '+X (width)' },
    { dir: new THREE.Vector3(0,1,0), color: 0x44ff44, label: '+Y (height)' },
    { dir: new THREE.Vector3(0,0,-1), color: 0x4488ff, label: '-Z (depth)' },
  ];
  axes.forEach(({dir, color, label}) => {
    const end = origin.clone().addScaledVector(dir, len);
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({color, depthTest:false})));
    // Arrowhead cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.075, 6),
      new THREE.MeshBasicMaterial({color, depthTest:false})
    );
    cone.position.copy(end);
    // Orient cone along dir
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    scene.add(cone);
    // Label
    const cw=180,ch=52;
    const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,0)';
    ctx.fillRect(0,0,cw,ch);
    ctx.fillStyle = '#'+color.toString(16).padStart(6,'0');
    ctx.font='bold 20px monospace';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(label, 4, ch/2);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
    spr.scale.set(0.48,0.15,1);
    spr.position.copy(end).addScaledVector(dir, 0.16);
    scene.add(spr);
  });
})();
