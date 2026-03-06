// --- Three.js Scene ---
const canvas = document.getElementById('c');
const wrap = document.getElementById('canvas-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.setClearColor(0xffffff);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 20, 40);

const SCENE_CLEAR_ENV_HEX = 0xffffff;
const SCENE_CLEAR_PLAIN_HEX = 0x111111;
const SCENE_BG_ENV_HEX = 0x9fc5e8;
const SCENE_BG_PLAIN_HEX = 0x111111;
const GRID_ENV_MAJOR_HEX = 0x2f4a2a;
const GRID_ENV_MINOR_HEX = 0x1f321c;
const GRID_PLAIN_MAJOR_HEX = 0x333333;
const GRID_PLAIN_MINOR_HEX = 0x2a2a2a;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(8, 5.6, 9);
camera.lookAt(2, 1.8, 1.5);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(6, 10, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.00008;
sun.shadow.normalBias = 0.02;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -4;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc0d0ff, 0.3);
fill.position.set(-5, 3, -3);
scene.add(fill);

// Grid floor
const grid = new THREE.GridHelper(12, 24, GRID_ENV_MAJOR_HEX, GRID_ENV_MINOR_HEX);
grid.position.set(2, 0, 1.75);
scene.add(grid);

// Dimensions (in metres) - runtime adjustable via UI/VR.
let W = 4.5;       // x axis (back wall width)
let D = 3.5;       // z axis (room depth)
let H_fixed = 3.5; // fixed wall height
let H_adj = 4.0;   // adjustable panel total height
grid.position.set(W * 0.5, 0, D * 0.5);

// Site layout controls (metres). Update these to reposition wall/fence/house context globally.
const SITE_LAYOUT = Object.freeze({
  fenceOffsetFromOrigin: 0.70,      // fence lines are at x/z = -0.70
  fenceHeight: 1.80,                // boundary fence height
  fenceLength: 20.00,               // fence run length from corner on each side
  wallClearanceToFenceX: 0.80,      // target wall clearance to fence on x side
  wallClearanceToFenceZ: 0.80,      // target wall clearance to fence on z side

  houseBackOffsetX: 6.70,           // house roof footprint offset from back boundary
  houseSideOffsetZ: 2.00,           // house roof footprint offset from side boundary
  houseLengthZ: 16.40,              // roof footprint length along z
  houseDepthX: 9.00,                // roof footprint depth along x
  houseWallHeight: 2.40,            // wall height to roof start
  houseRoofStartCap: 0.20,          // thin cap marker at roof-start level
  houseRoofRise: 1.80,              // approximate hip roof rise above roof-start level
  houseRoofOverhang: 0.25,          // roof overhang beyond roof footprint
  houseEaveInset: 0.60,             // wall inset from roof footprint (eave depth)
  houseBackWallProjectLen: 3.34,    // rear wall segment projected to eave line from corner

  housePathWidth: 0.60,             // concrete path width around house
  housePathThickness: 0.038,        // concrete path thickness

  outdoorSlabHeight: 0.10,          // outdoor slab thickness
  outdoorSlabProjectionX: 6.20,     // slab projection from back wall direction
  outdoorSlabWidthZ: 4.94,          // slab width
  outdoorSlabStartAlongProjection: 0.27, // slab start from non-corner end of projection

  // Neighbor house (side boundary): update neighborFenceSetback as measured.
  neighborLengthX: 18.00,           // roof footprint length
  neighborWidthZ: 8.60,             // roof footprint width
  // Shifted back so the rear-most window edge aligns with the back fence line.
  // rear window edge x = roofX0 + neighborEaveInset + neighborWindowBackOffset = -fenceOffset
  neighborBackOffsetX: -2.30,       // roof footprint offset from back boundary (x=0)
  neighborFenceSetback: 1.25,       // nearest roof edge setback from side fence line (z=-0.7)
  neighborWallHeight: 5.40,         // two-storey wall height to roof start
  neighborRoofStartCap: 0.20,       // thin cap marker at roof-start level
  neighborRoofRise: 1.50,           // lower peak than main house
  neighborRoofOverhang: 0.25,       // roof overhang beyond roof footprint
  neighborEaveInset: 0.60,          // wall inset from roof footprint (eaves)
  neighborWindowCount: 4,           // side windows on face toward this property
  neighborWindowBottomY: 3.20,      // sill height from ground
  neighborWindowWidth: 1.20,        // window width
  neighborWindowFrontOffset: 3.00,  // from front end to nearest window edge
  neighborWindowBackOffset: 1.00,   // from back end to nearest window edge
});

const FENCE_OFFSET_FROM_ORIGIN = SITE_LAYOUT.fenceOffsetFromOrigin;
const FENCE_HEIGHT = SITE_LAYOUT.fenceHeight;
const FENCE_LENGTH = SITE_LAYOUT.fenceLength;
const WALL_CLEARANCE_TO_FENCE_X = SITE_LAYOUT.wallClearanceToFenceX;
const WALL_CLEARANCE_TO_FENCE_Z = SITE_LAYOUT.wallClearanceToFenceZ;
const WALL_ORIGIN_X = WALL_CLEARANCE_TO_FENCE_X - FENCE_OFFSET_FROM_ORIGIN;
const WALL_ORIGIN_Z = WALL_CLEARANCE_TO_FENCE_Z - FENCE_OFFSET_FROM_ORIGIN;

const HOUSE_BACK_OFFSET_X = SITE_LAYOUT.houseBackOffsetX;
const HOUSE_SIDE_OFFSET_Z = SITE_LAYOUT.houseSideOffsetZ;
const HOUSE_LENGTH_Z = SITE_LAYOUT.houseLengthZ;
const HOUSE_DEPTH_X = SITE_LAYOUT.houseDepthX;
const HOUSE_WALL_HEIGHT = SITE_LAYOUT.houseWallHeight;
const HOUSE_ROOF_START_CAP = SITE_LAYOUT.houseRoofStartCap;
const HOUSE_ROOF_RISE = SITE_LAYOUT.houseRoofRise;
const HOUSE_ROOF_OVERHANG = SITE_LAYOUT.houseRoofOverhang;
const HOUSE_EAVE_INSET = SITE_LAYOUT.houseEaveInset;
const HOUSE_BACK_WALL_PROJECT_LEN = SITE_LAYOUT.houseBackWallProjectLen;
const HOUSE_PATH_WIDTH = SITE_LAYOUT.housePathWidth;
const HOUSE_PATH_THICKNESS = SITE_LAYOUT.housePathThickness;
const OUTDOOR_SLAB_HEIGHT = SITE_LAYOUT.outdoorSlabHeight;
const OUTDOOR_SLAB_PROJECTION_X = SITE_LAYOUT.outdoorSlabProjectionX;
const OUTDOOR_SLAB_WIDTH_Z = SITE_LAYOUT.outdoorSlabWidthZ;
const OUTDOOR_SLAB_START_ALONG_PROJECTION = SITE_LAYOUT.outdoorSlabStartAlongProjection;
const NEIGHBOR_LENGTH_X = SITE_LAYOUT.neighborLengthX;
const NEIGHBOR_WIDTH_Z = SITE_LAYOUT.neighborWidthZ;
const NEIGHBOR_BACK_OFFSET_X = SITE_LAYOUT.neighborBackOffsetX;
const NEIGHBOR_FENCE_SETBACK = SITE_LAYOUT.neighborFenceSetback;
const NEIGHBOR_WALL_HEIGHT = SITE_LAYOUT.neighborWallHeight;
const NEIGHBOR_ROOF_START_CAP = SITE_LAYOUT.neighborRoofStartCap;
const NEIGHBOR_ROOF_RISE = SITE_LAYOUT.neighborRoofRise;
const NEIGHBOR_ROOF_OVERHANG = SITE_LAYOUT.neighborRoofOverhang;
const NEIGHBOR_EAVE_INSET = SITE_LAYOUT.neighborEaveInset;
const NEIGHBOR_WINDOW_COUNT = SITE_LAYOUT.neighborWindowCount;
const NEIGHBOR_WINDOW_BOTTOM_Y = SITE_LAYOUT.neighborWindowBottomY;
const NEIGHBOR_WINDOW_WIDTH = SITE_LAYOUT.neighborWindowWidth;
const NEIGHBOR_WINDOW_FRONT_OFFSET = SITE_LAYOUT.neighborWindowFrontOffset;
const NEIGHBOR_WINDOW_BACK_OFFSET = SITE_LAYOUT.neighborWindowBackOffset;

const thick = 0.08;
const KICK = 0.7;    // vertical kick height at base of all walls
const ROOF_PITCH_DEG = 5;
const ROOF_PITCH_TAN = Math.tan(THREE.MathUtils.degToRad(ROOF_PITCH_DEG));
const ROOF_CLADDING_THICKNESS = 0.06;
const CEILING_PLY_THICKNESS = 0.017;
const POLY_ROOF_THICKNESS = 0.012;
const POLY_ROOF_CLEARANCE = 0.05; // raised poly roof by 0.10m from previous setting
const E_SUPPORT_POST_SIZE = 0.10;
const E_SUPPORT_POST_CLEARANCE = 0.01;
const TRAINING_PULLUP_BAR_HEIGHT = 2.65;
const TRAINING_HANGBOARD_TOP_HEIGHT = 2.55;
const SON_HEIGHT = 1.33;
const CRASH_MAT_THICKNESS = 0.30;

const WALL_STATE_STORAGE_KEY = 'climbingWall.wallState.v1';
const WALL_DEFAULT_STATE_STORAGE_KEY = 'climbingWall.defaultState.v1';
const CAMERA_STATE_STORAGE_KEY = 'climbingWall.cameraState.v1';
const CRASH_MATS_STORAGE_KEY = 'climbingWall.crashMats.v1';
const POLY_ROOF_STORAGE_KEY = 'climbingWall.polyRoof.v1';
const TRAINING_RIG_STORAGE_KEY = 'climbingWall.trainingRig.v1';
const TRAINING_CABINET_STORAGE_KEY = 'climbingWall.trainingCabinet.v1';
const CAMPUS_BOARD_STORAGE_KEY = 'climbingWall.campusBoard.v1';
const CONCEPT_VOLUMES_STORAGE_KEY = 'climbingWall.conceptVolumes.v1';
const WALL_TEXTURES_STORAGE_KEY = 'climbingWall.wallTextures.v1';
const CLIMBING_HOLDS_STORAGE_KEY = 'climbingWall.climbingHolds.v1';
const CRASH_MAT_TEXTURE_STORAGE_KEY = 'climbingWall.crashMatTexture.v1';
const TEXTURES_STORAGE_KEY = 'climbingWall.textures.v1';
const ENVIRONMENT_STORAGE_KEY = 'climbingWall.environment.v1';
const WALL_GEOMETRY_STATE_STORAGE_KEY = 'climbingWall.geometryState.v1';
const WALL_GEOMETRY_DEFAULT_STATE_STORAGE_KEY = 'climbingWall.geometryDefaultState.v1';

const WALL_GEOMETRY_STATE_LIMITS = Object.freeze({
  width: [3.0, 7.0],
  depth: [2.5, 6.0],
  fixedHeight: [2.8, 4.5],
  adjustableHeight: [3.0, 5.5],
});

const BUILTIN_WALL_GEOMETRY_STATE = Object.freeze({
  width: 4.5,
  depth: 3.5,
  fixedHeight: 3.5,
  adjustableHeight: 4.0,
});
const WALL_STATE_LIMITS = {
  aAngle: [0, 60], aWidth: [0.3, 2.5],
  bAngle: [0, 60], bWidth: [0.3, 2.5],
  cAngle: [0, 60], cWidth: [0.3, 2.5],
  dAngle: [0, 60], d1Height: [0.5, 2.7], d2Angle: [0, 75],
  eAngle: [-5, 60],
  f1Angle: [0, 40], f1Height: [2.0, 2.7], f1Width: [0.1, 1.0],
  f2Angle: [0, 75], f2WidthTop: [0.3, W],
  rigOpen: [0, 180],
};

const BUILTIN_DEFAULT_WALL_STATE = Object.freeze({
  aAngle: 10, aWidth: 1.35,
  bAngle: 10,  bWidth: 1.35,
  cAngle: 10, cWidth: 1.3,
  dAngle: 15,
  d1Height: 2.2,
  d2Angle: 15,
  eAngle: 5,
  f1Angle: 10, f1Height: 2.2, f1Width: 1.0,
  f2Angle: 25, f2WidthTop: 1.35,
  rigOpen: 0,
});

const BUILTIN_CAMERA_STATE = Object.freeze({
  theta: 1.6149999999999223,
  phi: 1.5549999999999955,
  radius: 8,
  targetX: 1.5855297326831634,
  targetY: 1.8377161702177802,
  targetZ: 1.9091334261437647,
});

function clampWallStateValue(key, value) {
  const limits = WALL_STATE_LIMITS[key];
  if (!limits) return value;
  return Math.max(limits[0], Math.min(limits[1], value));
}

function normalizeWallState(seed, source) {
  const state = {...seed};
  if (!source || typeof source !== 'object') return state;
  Object.keys(seed).forEach(key => {
    const v = Number(source[key]);
    if (Number.isFinite(v)) state[key] = clampWallStateValue(key, v);
  });
  return state;
}

function readStoredWallState(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function persistWallState(key, state) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch (_) {
    return false;
  }
}

function readStoredBool(key, fallback=false) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  } catch (_) {
    return fallback;
  }
}

function persistStoredBool(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
    return true;
  } catch (_) {
    return false;
  }
}

function clampWallGeometryStateValue(key, value) {
  const limits = WALL_GEOMETRY_STATE_LIMITS[key];
  if (!limits) return value;
  return Math.max(limits[0], Math.min(limits[1], value));
}

function normalizeWallGeometryState(seed, source) {
  const state = {...seed};
  if (!source || typeof source !== 'object') return state;
  Object.keys(seed).forEach(key => {
    const v = Number(source[key]);
    if (!Number.isFinite(v)) return;
    state[key] = clampWallGeometryStateValue(key, v);
  });
  return state;
}

function refreshWallStateLimitsForGeometry() {
  WALL_STATE_LIMITS.f2WidthTop[1] = Math.max(WALL_STATE_LIMITS.f2WidthTop[0], W);
  WALL_STATE_LIMITS.aWidth[1] = Math.max(WALL_STATE_LIMITS.aWidth[0], D);
  const hAvail = Math.max(0.6, H_fixed - KICK - 0.1);
  WALL_STATE_LIMITS.d1Height[1] = Math.max(WALL_STATE_LIMITS.d1Height[0], hAvail);
  WALL_STATE_LIMITS.f1Height[1] = Math.max(WALL_STATE_LIMITS.f1Height[0], hAvail);
}

function loadDefaultWallGeometryState() {
  const fallback = {...BUILTIN_WALL_GEOMETRY_STATE};
  const explicitDefaults = readStoredWallState(WALL_GEOMETRY_DEFAULT_STATE_STORAGE_KEY);
  if (explicitDefaults) return normalizeWallGeometryState(fallback, explicitDefaults);

  const savedState = readStoredWallState(WALL_GEOMETRY_STATE_STORAGE_KEY);
  if (!savedState) return fallback;
  const migratedDefaults = normalizeWallGeometryState(fallback, savedState);
  persistWallState(WALL_GEOMETRY_DEFAULT_STATE_STORAGE_KEY, migratedDefaults);
  return migratedDefaults;
}

let defaultWallGeometryState = loadDefaultWallGeometryState();

function loadWallGeometryState() {
  const state = {...defaultWallGeometryState};
  const savedState = readStoredWallState(WALL_GEOMETRY_STATE_STORAGE_KEY);
  return normalizeWallGeometryState(state, savedState);
}

let wallGeometryState = loadWallGeometryState();
W = wallGeometryState.width;
D = wallGeometryState.depth;
H_fixed = wallGeometryState.fixedHeight;
H_adj = wallGeometryState.adjustableHeight;
grid.position.set(W * 0.5, 0, D * 0.5);
refreshWallStateLimitsForGeometry();

function syncWallGeometryAnchors() {
  grid.position.set(W * 0.5, 0, D * 0.5);
  if (typeof WALL_TEXTURE_ROOM_CENTER !== 'undefined' && WALL_TEXTURE_ROOM_CENTER?.set) {
    WALL_TEXTURE_ROOM_CENTER.set(
      WALL_ORIGIN_X + (W * 0.5),
      H_fixed * 0.52,
      WALL_ORIGIN_Z + (D * 0.5)
    );
  }
}

function applyWallGeometryState(nextState, {rebuildScene=true, persistState=true, persistDefaults=false}={}) {
  const normalized = normalizeWallGeometryState(defaultWallGeometryState, nextState);
  wallGeometryState = {...normalized};
  W = wallGeometryState.width;
  D = wallGeometryState.depth;
  H_fixed = wallGeometryState.fixedHeight;
  H_adj = wallGeometryState.adjustableHeight;
  refreshWallStateLimitsForGeometry();
  syncWallGeometryAnchors();

  if (typeof wallState !== 'undefined' && wallState) {
    Object.keys(wallState).forEach(key => {
      const current = Number(wallState[key]);
      if (!Number.isFinite(current)) return;
      wallState[key] = clampWallStateValue(key, current);
    });
  }

  if (persistState) persistWallState(WALL_GEOMETRY_STATE_STORAGE_KEY, wallGeometryState);
  if (persistDefaults) {
    defaultWallGeometryState = {...wallGeometryState};
    persistWallState(WALL_GEOMETRY_DEFAULT_STATE_STORAGE_KEY, defaultWallGeometryState);
  }

  if (typeof rebuildFloorSlab === 'function') rebuildFloorSlab();
  if (typeof updateEnvironmentAnchors === 'function') updateEnvironmentAnchors();
  if (rebuildScene && typeof rebuild === 'function') rebuild();
  return wallGeometryState;
}

function saveWallGeometryState(updateDefaults=true) {
  const stateToSave = normalizeWallGeometryState(defaultWallGeometryState, wallGeometryState);
  const okState = persistWallState(WALL_GEOMETRY_STATE_STORAGE_KEY, stateToSave);
  if (!updateDefaults) return okState;
  defaultWallGeometryState = {...stateToSave};
  const okDefaults = persistWallState(WALL_GEOMETRY_DEFAULT_STATE_STORAGE_KEY, defaultWallGeometryState);
  return okState && okDefaults;
}

function resetWallGeometryState() {
  applyWallGeometryState(defaultWallGeometryState, {rebuildScene:false, persistState:true, persistDefaults:false});
}

function setWallGeometryValue(key, value, {rebuildScene=true, persistState=true}={}) {
  if (!Object.prototype.hasOwnProperty.call(BUILTIN_WALL_GEOMETRY_STATE, key)) return false;
  const next = {...wallGeometryState};
  next[key] = clampWallGeometryStateValue(key, Number(value) || BUILTIN_WALL_GEOMETRY_STATE[key]);
  applyWallGeometryState(next, {rebuildScene, persistState, persistDefaults:false});
  return true;
}

function clampCameraStateValue(key, value) {
  switch (key) {
    case 'phi': return Math.max(0.05, Math.min(Math.PI - 0.05, value));
    case 'radius': return Math.max(3, Math.min(25, value));
    case 'theta':
    case 'targetX':
    case 'targetY':
    case 'targetZ':
      return value;
    default:
      return value;
  }
}

function normalizeCameraState(source, fallback=BUILTIN_CAMERA_STATE) {
  const state = {...fallback};
  if (!source || typeof source !== 'object') return state;
  Object.keys(state).forEach(key => {
    const v = Number(source[key]);
    if (!Number.isFinite(v)) return;
    state[key] = clampCameraStateValue(key, v);
  });
  return state;
}

function loadCameraState() {
  const saved = readStoredWallState(CAMERA_STATE_STORAGE_KEY);
  return normalizeCameraState(saved, BUILTIN_CAMERA_STATE);
}

function saveCameraState(cameraState) {
  const normalized = normalizeCameraState(cameraState, BUILTIN_CAMERA_STATE);
  return persistWallState(CAMERA_STATE_STORAGE_KEY, normalized);
}

function loadDefaultWallState() {
  const fallback = {...BUILTIN_DEFAULT_WALL_STATE};
  const explicitDefaults = readStoredWallState(WALL_DEFAULT_STATE_STORAGE_KEY);
  if (explicitDefaults) return normalizeWallState(fallback, explicitDefaults);

  // Migration: if only saved measurements exist, promote them to defaults once.
  const savedState = readStoredWallState(WALL_STATE_STORAGE_KEY);
  if (!savedState) return fallback;
  const migratedDefaults = normalizeWallState(fallback, savedState);
  persistWallState(WALL_DEFAULT_STATE_STORAGE_KEY, migratedDefaults);
  return migratedDefaults;
}

let defaultWallState = loadDefaultWallState();

function loadWallState() {
  const state = {...defaultWallState};
  const savedState = readStoredWallState(WALL_STATE_STORAGE_KEY);
  return normalizeWallState(state, savedState);
}

function saveWallState(updateDefaults=true) {
  const stateToSave = normalizeWallState(defaultWallState, wallState);
  const okState = persistWallState(WALL_STATE_STORAGE_KEY, stateToSave);
  if (!updateDefaults) return okState;

  defaultWallState = {...stateToSave};
  const okDefaults = persistWallState(WALL_DEFAULT_STATE_STORAGE_KEY, defaultWallState);
  return okState && okDefaults;
}

function resetWallState() {
  Object.keys(defaultWallState).forEach(key => {
    wallState[key] = defaultWallState[key];
  });
  persistWallState(WALL_STATE_STORAGE_KEY, wallState);
}

// Wall state — angles and widths, all adjustable
const wallState = loadWallState();

// ── Scene groups that get rebuilt on each change ──
let wallGroup = new THREE.Group();
wallGroup.position.set(WALL_ORIGIN_X, 0, WALL_ORIGIN_Z);
scene.add(wallGroup);
let dimGroup  = new THREE.Group();
dimGroup.position.set(WALL_ORIGIN_X, 0, WALL_ORIGIN_Z);
scene.add(dimGroup);
let labelGroup = new THREE.Group();
labelGroup.position.set(WALL_ORIGIN_X, 0, WALL_ORIGIN_Z);
scene.add(labelGroup);
let hoverDimGroup = new THREE.Group();
hoverDimGroup.position.set(WALL_ORIGIN_X, 0, WALL_ORIGIN_Z);
scene.add(hoverDimGroup);
let hoverTargets = [];
let scalePersonBillboard = null;
let scalePersonMesh = null;
let scalePersonCompanionBillboard = null;
let scalePersonCompanionMesh = null;
let crashMatsGroup = null;
let environmentGroup = null;
let crashMatsEnabled = readStoredBool(CRASH_MATS_STORAGE_KEY, true);
let polyRoofEnabled = readStoredBool(POLY_ROOF_STORAGE_KEY, true);
let trainingRigEnabled = readStoredBool(TRAINING_RIG_STORAGE_KEY, true);
let trainingCabinetEnabled = readStoredBool(TRAINING_CABINET_STORAGE_KEY, true);
let campusBoardEnabled = readStoredBool(CAMPUS_BOARD_STORAGE_KEY, true);
let conceptVolumesEnabled = readStoredBool(CONCEPT_VOLUMES_STORAGE_KEY, true);
let texturedWallsEnabled = readStoredBool(WALL_TEXTURES_STORAGE_KEY, true);
let climbingHoldsEnabled = readStoredBool(CLIMBING_HOLDS_STORAGE_KEY, true);
let crashMatTextureEnabled = readStoredBool(CRASH_MAT_TEXTURE_STORAGE_KEY, true);
let environmentEnabled = readStoredBool(ENVIRONMENT_STORAGE_KEY, false);
let texturesEnabled = (() => {
  if (typeof localStorage === 'undefined') {
    return texturedWallsEnabled && crashMatTextureEnabled;
  }
  try {
    const raw = localStorage.getItem(TEXTURES_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch (_) {
    // fall through to legacy composite default
  }
  return texturedWallsEnabled && crashMatTextureEnabled;
})();
texturedWallsEnabled = texturesEnabled;
crashMatTextureEnabled = texturesEnabled;

function setGridColors(centerHex, gridHex) {
  if (typeof grid?.setColors === 'function') {
    grid.setColors(centerHex, gridHex);
    return;
  }
  const mats = Array.isArray(grid?.material) ? grid.material : [grid?.material];
  if (mats[0]?.color) mats[0].color.setHex(centerHex);
  if (mats[1]?.color) mats[1].color.setHex(gridHex);
}

function applyEnvironmentVisualState() {
  const clearHex = environmentEnabled ? SCENE_CLEAR_ENV_HEX : SCENE_CLEAR_PLAIN_HEX;
  const bgHex = environmentEnabled ? SCENE_BG_ENV_HEX : SCENE_BG_PLAIN_HEX;
  renderer.setClearColor(clearHex);
  if (scene.fog?.color) scene.fog.color.setHex(clearHex);
  if (scene.background && scene.background.isColor) scene.background.setHex(bgHex);
  else scene.background = new THREE.Color(bgHex);
  if (grid) grid.visible = !environmentEnabled;
  setGridColors(
    environmentEnabled ? GRID_ENV_MAJOR_HEX : GRID_PLAIN_MAJOR_HEX,
    environmentEnabled ? GRID_ENV_MINOR_HEX : GRID_PLAIN_MINOR_HEX
  );
  if (environmentGroup) environmentGroup.visible = environmentEnabled;
}

applyEnvironmentVisualState();

function isPointOnCrashMat(x, z, margin=0) {
  if (!crashMatsEnabled) return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return true;
  const localX = x - WALL_ORIGIN_X;
  const localZ = z - WALL_ORIGIN_Z;

  const seam = 0.02;
  const matW = (W - seam) * 0.5;
  const edgeExtension = 0.50;
  const f1Width = THREE.MathUtils.clamp(Number(wallState?.f1Width) || 0, 0, W);
  const frontStopX = THREE.MathUtils.clamp(W - f1Width, 0, W);
  const m = Number(margin) || 0;
  const eps = 1e-4 + Math.abs(m);

  // Main interior 4-pad area.
  if (localX >= (-eps - m) && localX <= (W + eps + m) && localZ >= (-eps - m) && localZ <= (D + eps + m)) return true;

  // Front 50 cm extensions.
  if (localX >= (-eps - m) && localX <= (matW + eps + m) && localZ >= (D - eps - m) && localZ <= (D + edgeExtension + eps + m)) return true;
  if (localX >= ((matW + seam) - eps - m) && localX <= (frontStopX + eps + m) && localZ >= (D - eps - m) && localZ <= (D + edgeExtension + eps + m)) return true;

  // Side 50 cm extensions.
  if (localX >= (W - eps - m) && localX <= (W + edgeExtension + eps + m) && localZ >= (-eps - m) && localZ <= (D + eps + m)) return true;

  return false;
}

function getActiveFloorY(x=null, z=null) {
  if (!crashMatsEnabled) return 0;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return CRASH_MAT_THICKNESS;
  return isPointOnCrashMat(x, z) ? CRASH_MAT_THICKNESS : 0;
}

function updateScalePersonFloorOffset() {
  const people = [scalePersonMesh, scalePersonCompanionMesh];
  people.forEach(person => {
    if (!person || !person.position) return;
    const yOffset = Number(person.userData?.personYOffset);
    if (!Number.isFinite(yOffset)) return;
    person.position.y = getActiveFloorY(person.position.x, person.position.z) + yOffset;
  });
}

function setCrashMatsEnabled(enabled) {
  crashMatsEnabled = !!enabled;
  if (crashMatsGroup) crashMatsGroup.visible = crashMatsEnabled;
  updateScalePersonFloorOffset();
  persistStoredBool(CRASH_MATS_STORAGE_KEY, crashMatsEnabled);
}

function setCrashMatTextureEnabled(enabled) {
  crashMatTextureEnabled = !!enabled;
  persistStoredBool(CRASH_MAT_TEXTURE_STORAGE_KEY, crashMatTextureEnabled);
  texturesEnabled = texturedWallsEnabled && crashMatTextureEnabled;
  persistStoredBool(TEXTURES_STORAGE_KEY, texturesEnabled);
  if (typeof rebuildCrashMatsGeometry === 'function') rebuildCrashMatsGeometry();
}

function setPolyRoofEnabled(enabled) {
  polyRoofEnabled = !!enabled;
  persistStoredBool(POLY_ROOF_STORAGE_KEY, polyRoofEnabled);
  if (typeof rebuild === 'function') rebuild();
}

function setTrainingRigEnabled(enabled) {
  trainingRigEnabled = !!enabled;
  persistStoredBool(TRAINING_RIG_STORAGE_KEY, trainingRigEnabled);
  if (typeof rebuild === 'function') rebuild();
}

function setTrainingCabinetEnabled(enabled) {
  trainingCabinetEnabled = !!enabled;
  persistStoredBool(TRAINING_CABINET_STORAGE_KEY, trainingCabinetEnabled);
  if (typeof rebuild === 'function') rebuild();
}

function setCampusBoardEnabled(enabled) {
  campusBoardEnabled = !!enabled;
  persistStoredBool(CAMPUS_BOARD_STORAGE_KEY, campusBoardEnabled);
  if (typeof rebuild === 'function') rebuild();
}

function setConceptVolumesEnabled(enabled) {
  conceptVolumesEnabled = !!enabled;
  persistStoredBool(CONCEPT_VOLUMES_STORAGE_KEY, conceptVolumesEnabled);
  if (typeof rebuild === 'function') rebuild();
}

function setTexturedWallsEnabled(enabled) {
  texturedWallsEnabled = !!enabled;
  persistStoredBool(WALL_TEXTURES_STORAGE_KEY, texturedWallsEnabled);
  texturesEnabled = texturedWallsEnabled && crashMatTextureEnabled;
  persistStoredBool(TEXTURES_STORAGE_KEY, texturesEnabled);
  updateAllWallMaterials();
  applyConceptVolumeMaterialStyle();
}

function setTexturesEnabled(enabled) {
  texturesEnabled = !!enabled;
  texturedWallsEnabled = texturesEnabled;
  crashMatTextureEnabled = texturesEnabled;
  persistStoredBool(TEXTURES_STORAGE_KEY, texturesEnabled);
  persistStoredBool(WALL_TEXTURES_STORAGE_KEY, texturedWallsEnabled);
  persistStoredBool(CRASH_MAT_TEXTURE_STORAGE_KEY, crashMatTextureEnabled);
  updateAllWallMaterials();
  applyConceptVolumeMaterialStyle();
  if (typeof rebuildCrashMatsGeometry === 'function') rebuildCrashMatsGeometry();
}

function setClimbingHoldsEnabled(enabled) {
  climbingHoldsEnabled = !!enabled;
  persistStoredBool(CLIMBING_HOLDS_STORAGE_KEY, climbingHoldsEnabled);
  if (typeof rebuild === 'function') rebuild();
}

function setEnvironmentEnabled(enabled) {
  environmentEnabled = !!enabled;
  persistStoredBool(ENVIRONMENT_STORAGE_KEY, environmentEnabled);
  applyEnvironmentVisualState();
}

// ── Materials ──
const claddingMat = new THREE.MeshStandardMaterial({
  color: 0x4a4d52,
  side: THREE.DoubleSide,
  roughness: 0.78,
  metalness: 0.30
});
const polyRoofMat = new THREE.MeshLambertMaterial({
  color: 0xbfd6ea,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.42
});
const polyRoofPostMat = new THREE.MeshLambertMaterial({ color: 0x7a8088, side: THREE.DoubleSide });
const trainingFrameMat = new THREE.MeshLambertMaterial({ color: 0x6d737b, side: THREE.DoubleSide });
const pullupBarMat = new THREE.MeshLambertMaterial({ color: 0xadb4bc, side: THREE.DoubleSide });
const hangboardMat = new THREE.MeshLambertMaterial({ color: 0xc9b58b, side: THREE.DoubleSide });
const hangboardSlotMat = new THREE.MeshLambertMaterial({ color: 0x8d7b59, side: THREE.DoubleSide });
const campusRungMat = new THREE.MeshLambertMaterial({ color: 0xc6a476, side: THREE.DoubleSide });
const campusRungEdgeMat = new THREE.LineBasicMaterial({color: 0x8d6f47});
const conceptVolumeEdgeMat = new THREE.LineBasicMaterial({color: 0x7e5f3f});

function box(w, h, d, mat, rx=0,ry=0,rz=0, px=0,py=0,pz=0) {
  const g = new THREE.BoxGeometry(w,h,d), m = new THREE.Mesh(g,mat);
  m.rotation.set(rx,ry,rz); m.position.set(px,py,pz);
  m.castShadow=true; m.receiveShadow=true; return m;
}

// ── Per-wall clippable materials (one instance per wall) ──
const WALL_COLORS = {A:0x4a6741,B:0x4a6741,C:0x4a6741,D:0x4a6741,E:0xc87941,F:0x6a4174,G:0x2f76d2};
const TEXTURED_WALL_IDS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
const HOLD_COLORS = [0xd06b46, 0xd6b24a, 0x5f9dce, 0x8eb668, 0xcfd3d8, 0xaf70bc];
let wallTexturePack = null;
let crashMatTexturePack = null;
let roofTexturePack = null;
let holdBumpTexture = null;
let holdMaterials = null;
let wallMats = {};
let wallMatBuckets = {};
const WALL_TEXTURE_ROOM_CENTER = new THREE.Vector3(
  WALL_ORIGIN_X + (W * 0.5),
  H_fixed * 0.52,
  WALL_ORIGIN_Z + (D * 0.5)
);
const CUSTOM_WALL_TEXTURE_DIR = 'textures/walls';
const DEFAULT_PLYWOOD_PREVIEW_DIR = 'textures/sources/plywood04517';
const DEFAULT_PLYWOOD_REPEAT_X = 2.0;
const DEFAULT_PLYWOOD_REPEAT_Y = 1.9;
let wallCustomTextureEntries = {};
let wallTextureLoader = null;
const CONCEPT_VOLUME_TEXTURE_IDS = ['default', 'cornerAB', 'ceilingG', 'dartC', 'dartB'];
const CONCEPT_VOLUME_TEXTURE_DIR = 'textures/volumes';
let conceptVolumeMats = {};
let volumeCustomTextureEntries = {};
let volumeTextureLoader = null;
let customTextureCompositeCache = new Map();

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let v = Math.imul(t ^ (t >>> 15), t | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(canvas, repeatX=1, repeatY=1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  tex.needsUpdate = true;
  return tex;
}

function configureLoadedWallTexture(tex) {
  if (!tex) return tex;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  tex.needsUpdate = true;
  return tex;
}

function configureLoadedTiledTexture(tex, repeatX=1, repeatY=1) {
  if (!tex) return tex;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  tex.needsUpdate = true;
  return tex;
}

function getTextureImageSize(tex) {
  const img = tex?.image;
  if (!img) return null;
  const w = Number(img.videoWidth || img.naturalWidth || img.width || 0);
  const h = Number(img.videoHeight || img.naturalHeight || img.height || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return {w, h, img};
}

function getCompositedOverlayTexture(overlayTex, baseTex) {
  if (!overlayTex) return null;
  const overlayInfo = getTextureImageSize(overlayTex);
  if (!overlayInfo) return overlayTex;
  const baseInfo = getTextureImageSize(baseTex);
  if (!baseInfo) return overlayTex;

  const repX = Math.max(0.0001, Math.abs(Number(baseTex?.repeat?.x) || 1));
  const repY = Math.max(0.0001, Math.abs(Number(baseTex?.repeat?.y) || 1));
  const key = `${overlayTex.uuid}|${baseTex.uuid}|${repX.toFixed(4)}|${repY.toFixed(4)}|${overlayInfo.w}x${overlayInfo.h}`;
  const cached = customTextureCompositeCache.get(key);
  if (cached) return cached;

  const cv = document.createElement('canvas');
  cv.width = overlayInfo.w;
  cv.height = overlayInfo.h;
  const ctx = cv.getContext('2d');
  if (!ctx) return overlayTex;

  const tileW = cv.width / repX;
  const tileH = cv.height / repY;
  for (let y = 0; y < cv.height; y += tileH) {
    for (let x = 0; x < cv.width; x += tileW) {
      ctx.drawImage(baseInfo.img, x, y, tileW, tileH);
    }
  }

  // Overlay keeps its alpha, revealing base plywood in transparent regions.
  ctx.drawImage(overlayInfo.img, 0, 0, cv.width, cv.height);
  const composed = configureLoadedWallTexture(new THREE.CanvasTexture(cv));
  customTextureCompositeCache.set(key, composed);
  return composed;
}

function getWallCustomTextureEntry(textureKey) {
  if (!textureKey || typeof textureKey !== 'string') return null;
  if (!wallCustomTextureEntries[textureKey]) {
    wallCustomTextureEntries[textureKey] = {
      front: null,
      bump: null,
      frontAttempted: false,
      bumpAttempted: false,
      frontLoading: false,
      bumpLoading: false,
    };
  }
  const entry = wallCustomTextureEntries[textureKey];
  if (!wallTextureLoader) wallTextureLoader = new THREE.TextureLoader();

  if (!entry.frontAttempted && !entry.frontLoading) {
    entry.frontLoading = true;
    const frontPath = `${CUSTOM_WALL_TEXTURE_DIR}/${textureKey}.png`;
    wallTextureLoader.load(
      frontPath,
      tex => {
        entry.front = configureLoadedWallTexture(tex);
        entry.frontAttempted = true;
        entry.frontLoading = false;
        updateAllWallMaterials();
      },
      undefined,
      () => {
        entry.front = null;
        entry.frontAttempted = true;
        entry.frontLoading = false;
      }
    );
  }

  if (!entry.bumpAttempted && !entry.bumpLoading) {
    entry.bumpLoading = true;
    const bumpPath = `${CUSTOM_WALL_TEXTURE_DIR}/${textureKey}-bump.png`;
    wallTextureLoader.load(
      bumpPath,
      tex => {
        entry.bump = configureLoadedWallTexture(tex);
        entry.bumpAttempted = true;
        entry.bumpLoading = false;
        updateAllWallMaterials();
      },
      undefined,
      () => {
        entry.bump = null;
        entry.bumpAttempted = true;
        entry.bumpLoading = false;
      }
    );
  }

  return entry;
}

function getCustomWallFrontTexture(id, sectionId='main') {
  const section = normalizeWallSectionId(sectionId);
  const keys = section === 'main' ? [id] : [`${id}-${section}`, id];
  for (const key of keys) {
    const entry = getWallCustomTextureEntry(key);
    if (entry?.front) return entry.front;
  }
  return null;
}

function getCustomWallBumpTexture(id, sectionId='main') {
  const section = normalizeWallSectionId(sectionId);
  const keys = section === 'main' ? [id] : [`${id}-${section}`, id];
  for (const key of keys) {
    const entry = getWallCustomTextureEntry(key);
    if (entry?.bump) return entry.bump;
  }
  return null;
}

function getVolumeCustomTextureEntry(id) {
  if (!CONCEPT_VOLUME_TEXTURE_IDS.includes(id)) return null;
  if (!volumeCustomTextureEntries[id]) {
    volumeCustomTextureEntries[id] = {
      front: null,
      bump: null,
      frontAttempted: false,
      bumpAttempted: false,
      frontLoading: false,
      bumpLoading: false,
    };
  }
  const entry = volumeCustomTextureEntries[id];
  if (!volumeTextureLoader) volumeTextureLoader = new THREE.TextureLoader();

  if (!entry.frontAttempted && !entry.frontLoading) {
    entry.frontLoading = true;
    const frontPath = `${CONCEPT_VOLUME_TEXTURE_DIR}/${id}.png`;
    volumeTextureLoader.load(
      frontPath,
      tex => {
        entry.front = configureLoadedWallTexture(tex);
        entry.frontAttempted = true;
        entry.frontLoading = false;
        applyConceptVolumeMaterialStyle(id);
      },
      undefined,
      () => {
        entry.front = null;
        entry.frontAttempted = true;
        entry.frontLoading = false;
      }
    );
  }

  if (!entry.bumpAttempted && !entry.bumpLoading) {
    entry.bumpLoading = true;
    const bumpPath = `${CONCEPT_VOLUME_TEXTURE_DIR}/${id}-bump.png`;
    volumeTextureLoader.load(
      bumpPath,
      tex => {
        entry.bump = configureLoadedWallTexture(tex);
        entry.bumpAttempted = true;
        entry.bumpLoading = false;
        applyConceptVolumeMaterialStyle(id);
      },
      undefined,
      () => {
        entry.bump = null;
        entry.bumpAttempted = true;
        entry.bumpLoading = false;
      }
    );
  }

  return entry;
}

function getCustomVolumeFrontTexture(id) {
  const entry = getVolumeCustomTextureEntry(id);
  return entry?.front || null;
}

function getCustomVolumeBumpTexture(id) {
  const entry = getVolumeCustomTextureEntry(id);
  return entry?.bump || null;
}

function loadDefaultPlywoodPreviewTextures(pack) {
  if (!pack || pack._plyPreviewLoadRequested) return;
  pack._plyPreviewLoadRequested = true;
  if (!wallTextureLoader) wallTextureLoader = new THREE.TextureLoader();

  const applyLoaded = () => {
    updateAllWallMaterials();
    applyConceptVolumeMaterialStyle();
  };

  wallTextureLoader.load(
    `${DEFAULT_PLYWOOD_PREVIEW_DIR}/color.jpg`,
    tex => {
      const t = configureLoadedTiledTexture(tex, DEFAULT_PLYWOOD_REPEAT_X, DEFAULT_PLYWOOD_REPEAT_Y);
      pack.map = t;
      pack.backMap = t;
      applyLoaded();
    },
    undefined,
    () => {}
  );

  wallTextureLoader.load(
    `${DEFAULT_PLYWOOD_PREVIEW_DIR}/height.jpg`,
    tex => {
      pack.bumpMap = configureLoadedTiledTexture(tex, DEFAULT_PLYWOOD_REPEAT_X, DEFAULT_PLYWOOD_REPEAT_Y);
      applyLoaded();
    },
    undefined,
    () => {}
  );

  wallTextureLoader.load(
    `${DEFAULT_PLYWOOD_PREVIEW_DIR}/normal.jpg`,
    tex => {
      pack.normalMap = configureLoadedTiledTexture(tex, DEFAULT_PLYWOOD_REPEAT_X, DEFAULT_PLYWOOD_REPEAT_Y);
      applyLoaded();
    },
    undefined,
    () => {}
  );
}

function makeWallTexturePack() {
  const size = 1024;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const grainRand = seededRandom(hashString('wall-finish-color-geo'));

  colorCtx.fillStyle = '#c8a477';
  colorCtx.fillRect(0, 0, size, size);

  // Plywood grain.
  for (let band = 0; band < 280; band++) {
    const xBase = (band / 279) * size;
    const wobble = 8 + grainRand() * 8;
    const alpha = 0.10 + grainRand() * 0.08;
    const r = 144 + Math.floor(grainRand() * 30);
    const g = 108 + Math.floor(grainRand() * 24);
    const b = 74 + Math.floor(grainRand() * 18);
    colorCtx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    colorCtx.lineWidth = 1 + grainRand() * 1.6;
    colorCtx.beginPath();
    for (let y = 0; y <= size; y += 24) {
      const n = Math.sin((band * 0.23) + (y * 0.019)) * wobble;
      const x = xBase + n;
      if (y === 0) colorCtx.moveTo(x, y);
      else colorCtx.lineTo(x, y);
    }
    colorCtx.stroke();
  }

  // Capture pure ply layer for wall backs.
  const plyCanvas = document.createElement('canvas');
  plyCanvas.width = size;
  plyCanvas.height = size;
  const plyCtx = plyCanvas.getContext('2d');
  plyCtx.drawImage(colorCanvas, 0, 0);

  // Painted sections disabled for now (plywood only).
  const paintMask = document.createElement('canvas');
  paintMask.width = size;
  paintMask.height = size;
  const maskCtx = paintMask.getContext('2d');
  // Keep mask empty so no paint is drawn.

  const maskData = maskCtx.getImageData(0, 0, size, size).data;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');
  const bumpImage = bumpCtx.createImageData(size, size);
  const bumpData = bumpImage.data;
  const bumpRand = seededRandom(hashString('wall-finish-bump-geo'));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const gx = x / size;
      const gy = y / size;
      const isPaint = maskData[i + 3] > 10;
      const plyGrain =
        Math.sin((gx * 96) + Math.sin(gy * 18) * 3.2) * 16 +
        Math.sin((gx * 270) + gy * 14) * 5;
      const paintRoller =
        Math.sin((gy * 150) + Math.sin(gx * 10) * 1.4) * 5;
      const v = isPaint
        ? 136 + paintRoller + (bumpRand() - 0.5) * 7
        : 122 + plyGrain + (bumpRand() - 0.5) * 10;
      const c = Math.max(0, Math.min(255, v | 0));
      bumpData[i] = c;
      bumpData[i + 1] = c;
      bumpData[i + 2] = c;
      bumpData[i + 3] = 255;
    }
  }
  bumpCtx.putImageData(bumpImage, 0, 0);

  return {
    map: makeCanvasTexture(colorCanvas, 2.0, 1.9),
    backMap: makeCanvasTexture(plyCanvas, 2.0, 1.9),
    bumpMap: makeCanvasTexture(bumpCanvas, 2.0, 1.9),
    normalMap: null,
  };
}

function getWallTexturePack() {
  if (!wallTexturePack) {
    wallTexturePack = makeWallTexturePack();
    loadDefaultPlywoodPreviewTextures(wallTexturePack);
  }
  return wallTexturePack;
}

function makeRoofTexturePack() {
  const w = 1024;
  const h = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const colorCtx = colorCanvas.getContext('2d');
  const rand = seededRandom(hashString('roof-corrugated-color'));

  colorCtx.fillStyle = '#3f4349';
  colorCtx.fillRect(0, 0, w, h);

  // Corrugation shading: variation in X gives ribs that run along roof depth.
  for (let x = 0; x < w; x++) {
    const t = (x / w) * Math.PI * 2 * 40;
    const wave = Math.sin(t);
    const highlight = Math.max(0, wave) * 22;
    const shadow = Math.max(0, -wave) * 18;
    const base = 72 + highlight - shadow + (rand() - 0.5) * 3;
    const c = Math.max(40, Math.min(140, base | 0));
    colorCtx.fillStyle = `rgb(${c},${c + 2},${c + 5})`;
    colorCtx.fillRect(x, 0, 1, h);
  }

  // Sheet seams.
  for (let sx = 96; sx < w; sx += 192) {
    colorCtx.fillStyle = 'rgba(22,24,28,0.45)';
    colorCtx.fillRect(sx, 0, 2, h);
    colorCtx.fillStyle = 'rgba(180,186,194,0.10)';
    colorCtx.fillRect(sx + 2, 0, 1, h);
  }

  // Light weathering.
  for (let i = 0; i < 2400; i++) {
    const x = (rand() * w) | 0;
    const y = (rand() * h) | 0;
    const tone = 86 + (rand() * 26) | 0;
    const a = 0.04 + rand() * 0.08;
    colorCtx.fillStyle = `rgba(${tone},${tone + 3},${tone + 6},${a.toFixed(3)})`;
    colorCtx.fillRect(x, y, 1, 1);
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bumpCtx = bumpCanvas.getContext('2d');
  const bumpImage = bumpCtx.createImageData(w, h);
  const bumpData = bumpImage.data;
  const bumpRand = seededRandom(hashString('roof-corrugated-bump'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const t = (x / w) * Math.PI * 2 * 40;
      const corr = Math.sin(t) * 32;
      const micro = Math.sin((x / w) * Math.PI * 2 * 160) * 5;
      const grain = (bumpRand() - 0.5) * 5;
      const v = 128 + corr + micro + grain;
      const c = Math.max(0, Math.min(255, v | 0));
      bumpData[idx] = c;
      bumpData[idx + 1] = c;
      bumpData[idx + 2] = c;
      bumpData[idx + 3] = 255;
    }
  }
  bumpCtx.putImageData(bumpImage, 0, 0);
  return {
    map: makeCanvasTexture(colorCanvas, 1.6, 1.6),
    bumpMap: makeCanvasTexture(bumpCanvas, 1.6, 1.6),
  };
}

function getRoofTexturePack() {
  if (!roofTexturePack) roofTexturePack = makeRoofTexturePack();
  return roofTexturePack;
}

function makeCrashMatTexturePack() {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const rand = seededRandom(hashString('mats-color'));

  colorCtx.fillStyle = '#303338';
  colorCtx.fillRect(0, 0, size, size);

  // Subtle carpet weave passes.
  for (let y = 0; y < size; y += 3) {
    const tone = 44 + Math.floor(rand() * 20);
    colorCtx.strokeStyle = `rgba(${tone},${tone + 2},${tone + 5},0.30)`;
    colorCtx.lineWidth = 1;
    colorCtx.beginPath();
    colorCtx.moveTo(0, y + (rand() - 0.5));
    colorCtx.lineTo(size, y + (rand() - 0.5));
    colorCtx.stroke();
  }
  for (let x = 0; x < size; x += 4) {
    const tone = 35 + Math.floor(rand() * 16);
    colorCtx.strokeStyle = `rgba(${tone},${tone + 1},${tone + 3},0.24)`;
    colorCtx.lineWidth = 1;
    colorCtx.beginPath();
    colorCtx.moveTo(x + (rand() - 0.5), 0);
    colorCtx.lineTo(x + (rand() - 0.5), size);
    colorCtx.stroke();
  }

  // Fleck noise to avoid a flat synthetic look.
  for (let i = 0; i < 6800; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const w = 1 + Math.floor(rand() * 2);
    const h = 1 + Math.floor(rand() * 2);
    const tone = 30 + Math.floor(rand() * 36);
    const alpha = 0.10 + rand() * 0.22;
    colorCtx.fillStyle = `rgba(${tone},${tone + 1},${tone + 3},${alpha.toFixed(3)})`;
    colorCtx.fillRect(x, y, w, h);
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');
  const bumpImage = bumpCtx.createImageData(size, size);
  const bumpData = bumpImage.data;
  const bumpRand = seededRandom(hashString('mats-bump'));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;
      const weaveMajor = Math.sin(nx * 130) * 12 + Math.sin(ny * 118) * 12;
      const weaveMinor = Math.sin(nx * 250 + ny * 45) * 4 + Math.sin(ny * 230 - nx * 40) * 4;
      const grain = (bumpRand() - 0.5) * 24;
      const v = 128 + weaveMajor + weaveMinor + grain;
      const c = Math.max(0, Math.min(255, v | 0));
      bumpData[idx] = c;
      bumpData[idx + 1] = c;
      bumpData[idx + 2] = c;
      bumpData[idx + 3] = 255;
    }
  }
  bumpCtx.putImageData(bumpImage, 0, 0);

  return {
    map: makeCanvasTexture(colorCanvas, 2.4, 2.4),
    bumpMap: makeCanvasTexture(bumpCanvas, 2.4, 2.4),
  };
}

function getCrashMatTexturePack() {
  if (!crashMatTexturePack) crashMatTexturePack = makeCrashMatTexturePack();
  return crashMatTexturePack;
}

function makeHoldBumpTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = seededRandom(hashString('hold-bump'));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;
      const micro =
        Math.sin(nx * 52 + ny * 19) * 11 +
        Math.sin(nx * 141 - ny * 57) * 7 +
        (rand() - 0.5) * 18;
      const pits = Math.sin((nx * 12) * (ny * 14)) * 7;
      const v = 128 + micro + pits;
      const c = Math.max(0, Math.min(255, v | 0));
      data[idx] = c;
      data[idx + 1] = c;
      data[idx + 2] = c;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return makeCanvasTexture(canvas, 1, 1);
}

function getHoldMaterials() {
  if (holdMaterials) return holdMaterials;
  if (!holdBumpTexture) holdBumpTexture = makeHoldBumpTexture();
  holdMaterials = HOLD_COLORS.map((hex, idx) => new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.74,
    metalness: 0.02,
    bumpMap: holdBumpTexture,
    bumpScale: 0.020 + (idx % 3) * 0.0055,
  }));
  return holdMaterials;
}

function getHoldMaterial(index=0) {
  const mats = getHoldMaterials();
  const i = Math.abs(Math.floor(index)) % mats.length;
  return mats[i];
}

function getConceptVolumeMaterial(volumeId='default') {
  const id = CONCEPT_VOLUME_TEXTURE_IDS.includes(volumeId) ? volumeId : 'default';
  if (!conceptVolumeMats[id]) {
    conceptVolumeMats[id] = new THREE.MeshLambertMaterial({ color: 0xb88f63, side: THREE.DoubleSide });
  }
  applyConceptVolumeMaterialStyle(id);
  return conceptVolumeMats[id];
}

const conceptVolumeMat = getConceptVolumeMaterial('default');

function applyConceptVolumeMaterialStyle(volumeId=null) {
  const targetIds = volumeId
    ? [volumeId]
    : Object.keys(conceptVolumeMats);
  if (!targetIds.length) targetIds.push('default');

  targetIds.forEach(id => {
    const mat = conceptVolumeMats[id];
    if (!mat) return;
    if (!texturedWallsEnabled) {
      mat.color.setHex(0xb88f63);
      mat.map = null;
      mat.bumpMap = null;
      mat.normalMap = null;
      mat.bumpScale = 0;
      mat.needsUpdate = true;
      return;
    }

    const texturePack = getWallTexturePack();
    const customFrontRaw = getCustomVolumeFrontTexture(id);
    const customFront = customFrontRaw
      ? getCompositedOverlayTexture(customFrontRaw, texturePack.map)
      : null;
    const customBump = getCustomVolumeBumpTexture(id);
    mat.color.setHex(0xffffff);
    mat.map = customFront || texturePack.map || null;
    if (customBump) {
      mat.bumpMap = customBump;
      mat.bumpScale = 0.022;
    } else {
      mat.bumpMap = texturePack.bumpMap || null;
      mat.bumpScale = mat.bumpMap ? 0.018 : 0;
    }
    mat.normalMap = texturePack.normalMap || null;
    if (mat.normalMap) {
      if (!mat.normalScale) mat.normalScale = new THREE.Vector2(0.62, 0.62);
      else mat.normalScale.set(0.62, 0.62);
    }
    mat.needsUpdate = true;
  });
}

function ensureWallTextureShader(mat) {
  if (!mat || mat.userData.wallTextureShaderPatched) return;
  mat.userData.wallTextureShaderPatched = true;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uBackMap = {value: mat.userData.backMap || mat.map || null};
    shader.uniforms.uRoomCenter = {value: WALL_TEXTURE_ROOM_CENTER};
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWallWorldPos;\nvarying vec3 vWallWorldNormal;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWallWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvWallWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D uBackMap;\nuniform vec3 uRoomCenter;\nvarying vec3 vWallWorldPos;\nvarying vec3 vWallWorldNormal;'
      )
      .replace(
        '#include <map_fragment>',
        [
          '#ifdef USE_MAP',
          '  vec3 wallToRoom = normalize( uRoomCenter - vWallWorldPos );',
          '  vec3 wallNormal = normalize( vWallWorldNormal );',
          '  if ( !gl_FrontFacing ) wallNormal *= -1.0;',
          '  float interiorSide = dot( wallNormal, wallToRoom );',
          '  vec4 texelColorFront = texture2D( map, vUv );',
          '  vec4 texelColorBack = texture2D( uBackMap, vUv );',
          '  vec4 texelColor = ( interiorSide > 0.0 ) ? texelColorFront : texelColorBack;',
          '  texelColor = mapTexelToLinear( texelColor );',
          '  diffuseColor *= texelColor;',
          '#endif',
        ].join('\n')
      );
  };
  mat.customProgramCacheKey = () => 'wall-texture-interior-v1';
}

function applyRoofMaterialStyle() {
  if (!claddingMat) return;
  const texturePack = getRoofTexturePack();
  claddingMat.color.setHex(0xffffff);
  claddingMat.map = texturePack.map;
  claddingMat.bumpMap = texturePack.bumpMap;
  claddingMat.bumpScale = 0.030;
  claddingMat.needsUpdate = true;
}

function normalizeWallSectionId(sectionId) {
  if (sectionId === 'kick' || sectionId === 's1' || sectionId === 's2') return sectionId;
  return 'main';
}

function applyWallMaterialStyle(id, mat, sectionId='main') {
  if (!mat) return;
  const section = normalizeWallSectionId(sectionId);
  const baseColor = WALL_COLORS[id] || 0x4a6741;
  ensureWallTextureShader(mat);
  if (!TEXTURED_WALL_IDS.has(id) || !texturedWallsEnabled) {
    mat.color.setHex(baseColor);
    mat.map = null;
    mat.bumpMap = null;
    mat.normalMap = null;
    mat.userData.backMap = null;
    if (mat.userData.shader?.uniforms?.uBackMap) {
      mat.userData.shader.uniforms.uBackMap.value = null;
    }
    mat.bumpScale = 0;
    mat.needsUpdate = true;
    return;
  }
  const texturePack = getWallTexturePack();
  const customFrontRaw = getCustomWallFrontTexture(id, section);
  const customFront = customFrontRaw
    ? getCompositedOverlayTexture(customFrontRaw, texturePack.map)
    : null;
  const customBump = getCustomWallBumpTexture(id, section);
  mat.color.setHex(0xffffff);
  mat.map = customFront || texturePack.map || null;
  if (customBump) {
    mat.bumpMap = customBump;
    mat.bumpScale = id === 'E' ? 0.015 : 0.020;
  } else {
    mat.bumpMap = texturePack.bumpMap || null;
    mat.bumpScale = id === 'E' ? 0.010 : 0.014;
  }
  mat.normalMap = texturePack.normalMap || null;
  if (mat.normalMap) {
    if (!mat.normalScale) mat.normalScale = new THREE.Vector2(0.60, 0.60);
    else mat.normalScale.set(0.60, 0.60);
  }
  mat.userData.backMap = texturePack.backMap || texturePack.map || null;
  if (mat.userData.shader?.uniforms?.uBackMap) {
    mat.userData.shader.uniforms.uBackMap.value = mat.userData.backMap;
  }
  mat.needsUpdate = true;
}

function updateAllWallMaterials() {
  Object.keys(wallMats).forEach(key => {
    const mat = wallMats[key];
    if (!mat) return;
    const wallId = mat.userData?.wallId || 'A';
    const sectionId = normalizeWallSectionId(mat.userData?.sectionId || 'main');
    applyWallMaterialStyle(wallId, mat, sectionId);
  });
}

function getWallMat(id, sectionId='main') {
  const section = normalizeWallSectionId(sectionId);
  const key = `${id}:${section}`;
  if (!wallMats[key]) {
    const mat = new THREE.MeshLambertMaterial({
      color: WALL_COLORS[id] || 0x4a6741,
      side: THREE.DoubleSide,
      clippingPlanes: [],
      clipIntersection: false
    });
    mat.userData.wallId = id;
    mat.userData.sectionId = section;
    wallMats[key] = mat;
    ensureWallTextureShader(wallMats[key]);

    if (!wallMatBuckets[id]) wallMatBuckets[id] = [];
    wallMatBuckets[id].push(wallMats[key]);
  }
  applyWallMaterialStyle(id, wallMats[key], section);
  return wallMats[key];
}

function setWallClipPlanes(id, planes) {
  const mats = wallMatBuckets[id];
  if (!Array.isArray(mats)) return;
  mats.forEach(mat => {
    if (!mat) return;
    mat.clippingPlanes = planes;
  });
}
const ceilingGapMat = getWallMat('G');
// legacy aliases used by adj panel
const adjMat = getWallMat('E', 's1');
applyConceptVolumeMaterialStyle();
applyRoofMaterialStyle();

// ── Collision precedence ──
let precedence = ['A','B','C','D','E'];
