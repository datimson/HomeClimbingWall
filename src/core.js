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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
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
const sunTarget = new THREE.Object3D();
sunTarget.position.set(2, 1.6, 1.75);
scene.add(sunTarget);
sun.target = sunTarget;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc0d0ff, 0.3);
fill.position.set(-5, 3, -3);
scene.add(fill);
const giLightRig = new THREE.Group();
giLightRig.visible = false;
scene.add(giLightRig);
const giHemiLight = new THREE.HemisphereLight(0xdde8ff, 0x8f775f, 0.0);
giLightRig.add(giHemiLight);
const giWarmBounce = new THREE.DirectionalLight(0xffe7c8, 0.0);
giWarmBounce.castShadow = false;
giLightRig.add(giWarmBounce);
const giCoolBounce = new THREE.DirectionalLight(0xbfd2ff, 0.0);
giCoolBounce.castShadow = false;
giLightRig.add(giCoolBounce);
const giRearBounce = new THREE.DirectionalLight(0xfff0df, 0.0);
giRearBounce.castShadow = false;
giLightRig.add(giRearBounce);
const GI_QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    captureResolution: 16,
    desktopUpdateMs: 700,
    xrUpdateMs: 1400,
    intensityScale: 0.92,
  }),
  medium: Object.freeze({
    captureResolution: 24,
    desktopUpdateMs: 360,
    xrUpdateMs: 900,
    intensityScale: 1.0,
  }),
  high: Object.freeze({
    captureResolution: 40,
    desktopUpdateMs: 180,
    xrUpdateMs: 560,
    intensityScale: 1.08,
  }),
});
const GI_QUALITY_FALLBACK = 'medium';
const giState = {
  mode: 'off', // off | probe | fallback
  supported: !!(THREE?.LightProbe && THREE?.LightProbeGenerator && THREE?.CubeCamera && THREE?.WebGLCubeRenderTarget),
  dirty: true,
  updating: false,
  lastUpdateMs: 0,
  qualityKey: GI_QUALITY_FALLBACK,
  captureResolution: 0,
  probe: null,
  cubeCamera: null,
  cubeRenderTarget: null,
};
const giProbeFocus = new THREE.Vector3();
const giHiddenDuringCapture = [];
const solarSunMarker = new THREE.Sprite(
  new THREE.SpriteMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthTest: false,
    depthWrite: false,
    fog: false,
  })
);
solarSunMarker.scale.set(2.4, 2.4, 1.0);
solarSunMarker.visible = false;
solarSunMarker.renderOrder = 2500;
solarSunMarker.frustumCulled = false;
scene.add(solarSunMarker);
const solarPathPreviewLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
    fog: false,
  })
);
solarPathPreviewLine.visible = false;
solarPathPreviewLine.renderOrder = 2490;
solarPathPreviewLine.frustumCulled = false;
scene.add(solarPathPreviewLine);
const solarPathPreviewState = {
  requestedVisible: false,
  hasGeometry: false,
  dirty: true,
  lastDate: '',
  sampleCount: 96,
  sampleDistance: 56,
};
const solarPathDirTmp = new THREE.Vector3();

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
  // 21.19m keeps street-side boundary ~9.92m from outdoor slab (current house/slab layout).
  fenceLength: 21.19,               // fence run length from corner on each side
  wallClearanceToFenceX: 1.00,      // target wall clearance to fence on x side (to outer rear shell)
  wallClearanceToFenceZ: 1.00,      // target wall clearance to fence on z side (to outer rear shell)
  wallShellDepth: 0.10,             // rear/side shell build depth behind kick boards

  houseBackOffsetX: 6.00,           // house roof footprint offset from back boundary
  // Keeps nearest house wall 2.0m from side fence line (excluding roof/eave overhang).
  houseSideOffsetZ: 0.70,           // house roof footprint offset from side boundary
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
  outdoorSlabProjectionX: 4.94,     // slab projection from back wall direction
  outdoorSlabWidthZ: 6.20,          // slab width (runs with the house)
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

  // Office building (rear yard): 3m x 3m with skillion roof.
  officeWidthX: 3.00,
  officeDepthZ: 3.00,
  officeRearSetbackX: 1.00,         // from rear/back boundary
  officeStreetSetbackZ: 6.00,       // from street-side boundary
  officeRoofHighY: 2.70,            // high side (nearest outdoor slab)
  officeRoofLowY: 2.40,             // low side (nearest street boundary)
  officePartitionFromStreetZ: 0.80, // internal wall offset from street-side wall
});

// Site orientation:
// - Scene +X is the house front direction.
// - House front is 30° west of true north (azimuth -30° where east=+90°).
// For our solar EN->scene rotation, this corresponds to northYawDeg = 90 - azimuth.
const SITE_HOUSE_FRONT_AZIMUTH_DEG = -30;
const SITE_NORTH_YAW_DEG = 90 - SITE_HOUSE_FRONT_AZIMUTH_DEG;

const SOLAR_SITE = Object.freeze({
  label: '51 Station Rd, Deagon QLD',
  latitudeDeg: -27.3253195,
  longitudeDeg: 153.0679917,
  utcOffsetMinutes: 10 * 60, // AEST (Queensland, no DST)
  // 0 means world +Z is north and +X is east.
  northYawDeg: SITE_NORTH_YAW_DEG,
});

const FENCE_OFFSET_FROM_ORIGIN = SITE_LAYOUT.fenceOffsetFromOrigin;
const FENCE_HEIGHT = SITE_LAYOUT.fenceHeight;
const FENCE_LENGTH = SITE_LAYOUT.fenceLength;
const WALL_CLEARANCE_TO_FENCE_X = SITE_LAYOUT.wallClearanceToFenceX;
const WALL_CLEARANCE_TO_FENCE_Z = SITE_LAYOUT.wallClearanceToFenceZ;
const WALL_SHELL_DEPTH = SITE_LAYOUT.wallShellDepth;
const WALL_ORIGIN_X = WALL_CLEARANCE_TO_FENCE_X - FENCE_OFFSET_FROM_ORIGIN + WALL_SHELL_DEPTH;
const WALL_ORIGIN_Z = WALL_CLEARANCE_TO_FENCE_Z - FENCE_OFFSET_FROM_ORIGIN + WALL_SHELL_DEPTH;

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
const OFFICE_WIDTH_X = SITE_LAYOUT.officeWidthX;
const OFFICE_DEPTH_Z = SITE_LAYOUT.officeDepthZ;
const OFFICE_REAR_SETBACK_X = SITE_LAYOUT.officeRearSetbackX;
const OFFICE_STREET_SETBACK_Z = SITE_LAYOUT.officeStreetSetbackZ;
const OFFICE_ROOF_HIGH_Y = SITE_LAYOUT.officeRoofHighY;
const OFFICE_ROOF_LOW_Y = SITE_LAYOUT.officeRoofLowY;
const OFFICE_PARTITION_FROM_STREET_Z = SITE_LAYOUT.officePartitionFromStreetZ;

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

const DESIGN_SYSTEM = (
  typeof window !== 'undefined' &&
  window.ClimbingWallDesignSystem
) ? window.ClimbingWallDesignSystem : null;
const APP_STATE = (
  typeof window !== 'undefined' &&
  window.ClimbingWallAppState
) ? window.ClimbingWallAppState : null;
const ACTIVE_DESIGN_ID = (
  DESIGN_SYSTEM &&
  typeof DESIGN_SYSTEM.getActiveDesignId === 'function'
) ? DESIGN_SYSTEM.getActiveDesignId() : 'classic';
const ACTIVE_DESIGN_DEF = (
  DESIGN_SYSTEM &&
  typeof DESIGN_SYSTEM.getDesignDefinition === 'function'
) ? DESIGN_SYSTEM.getDesignDefinition(ACTIVE_DESIGN_ID) : null;
const ACTIVE_STORAGE_KEYS = (
  DESIGN_SYSTEM &&
  typeof DESIGN_SYSTEM.getStorageKeysForDesign === 'function'
) ? DESIGN_SYSTEM.getStorageKeysForDesign(ACTIVE_DESIGN_ID) : null;
const ACTIVE_TEXTURE_CONFIG = (
  DESIGN_SYSTEM &&
  typeof DESIGN_SYSTEM.getTextureConfigForDesign === 'function'
) ? DESIGN_SYSTEM.getTextureConfigForDesign(ACTIVE_DESIGN_ID) : null;

const LEGACY_STORAGE_KEYS = Object.freeze({
  wallState: 'climbingWall.wallState.v1',
  wallDefaults: 'climbingWall.defaultState.v1',
  cameraState: 'climbingWall.cameraState.v1',
  crashMats: 'climbingWall.crashMats.v1',
  polyRoof: 'climbingWall.polyRoof.v1',
  trainingRig: 'climbingWall.trainingRig.v1',
  trainingCabinet: 'climbingWall.trainingCabinet.v1',
  campusBoard: 'climbingWall.campusBoard.v1',
  conceptVolumes: 'climbingWall.conceptVolumes.v1',
  office: 'climbingWall.office.v1',
  sauna: 'climbingWall.sauna.v1',
  outdoorKitchen: 'climbingWall.outdoorKitchen.v1',
  wallTextures: 'climbingWall.wallTextures.v1',
  climbingHolds: 'climbingWall.climbingHolds.v1',
  crashMatTexture: 'climbingWall.crashMatTexture.v1',
  textures: 'climbingWall.textures.v1',
  environment: 'climbingWall.environment.v1',
  globalIllumination: 'climbingWall.globalIllumination.v1',
  globalIlluminationQuality: 'climbingWall.globalIlluminationQuality.v1',
  solarState: 'climbingWall.solarState.v1',
  geometryState: 'climbingWall.geometryState.v1',
  geometryDefaults: 'climbingWall.geometryDefaultState.v1',
});

const STORAGE_KEYS = ACTIVE_STORAGE_KEYS || LEGACY_STORAGE_KEYS;
const WALL_STATE_STORAGE_KEY = STORAGE_KEYS.wallState;
const WALL_DEFAULT_STATE_STORAGE_KEY = STORAGE_KEYS.wallDefaults;
const CAMERA_STATE_STORAGE_KEY = STORAGE_KEYS.cameraState;
const CRASH_MATS_STORAGE_KEY = STORAGE_KEYS.crashMats;
const POLY_ROOF_STORAGE_KEY = STORAGE_KEYS.polyRoof;
const TRAINING_RIG_STORAGE_KEY = STORAGE_KEYS.trainingRig;
const TRAINING_CABINET_STORAGE_KEY = STORAGE_KEYS.trainingCabinet;
const CAMPUS_BOARD_STORAGE_KEY = STORAGE_KEYS.campusBoard;
const CONCEPT_VOLUMES_STORAGE_KEY = STORAGE_KEYS.conceptVolumes;
const OFFICE_STORAGE_KEY = STORAGE_KEYS.office || LEGACY_STORAGE_KEYS.office;
const SAUNA_STORAGE_KEY = STORAGE_KEYS.sauna || LEGACY_STORAGE_KEYS.sauna;
const OUTDOOR_KITCHEN_STORAGE_KEY = STORAGE_KEYS.outdoorKitchen || LEGACY_STORAGE_KEYS.outdoorKitchen;
const WALL_TEXTURES_STORAGE_KEY = STORAGE_KEYS.wallTextures;
const CLIMBING_HOLDS_STORAGE_KEY = STORAGE_KEYS.climbingHolds;
const CRASH_MAT_TEXTURE_STORAGE_KEY = STORAGE_KEYS.crashMatTexture;
const TEXTURES_STORAGE_KEY = STORAGE_KEYS.textures;
const ENVIRONMENT_STORAGE_KEY = STORAGE_KEYS.environment;
const GLOBAL_ILLUMINATION_STORAGE_KEY = STORAGE_KEYS.globalIllumination || LEGACY_STORAGE_KEYS.globalIllumination;
const GLOBAL_ILLUMINATION_QUALITY_STORAGE_KEY = STORAGE_KEYS.globalIlluminationQuality || LEGACY_STORAGE_KEYS.globalIlluminationQuality;
const SOLAR_STATE_STORAGE_KEY = STORAGE_KEYS.solarState || LEGACY_STORAGE_KEYS.solarState;
const WALL_GEOMETRY_STATE_STORAGE_KEY = STORAGE_KEYS.geometryState;
const WALL_GEOMETRY_DEFAULT_STATE_STORAGE_KEY = STORAGE_KEYS.geometryDefaults;

function cloneLimitMap(source, fallback) {
  const out = {};
  const src = (source && typeof source === 'object') ? source : {};
  Object.keys(fallback).forEach(key => {
    const fallbackPair = Array.isArray(fallback[key]) ? fallback[key] : [0, 1];
    const srcPair = Array.isArray(src[key]) ? src[key] : fallbackPair;
    const min = Number(srcPair[0]);
    const max = Number(srcPair[1]);
    out[key] = [
      Number.isFinite(min) ? min : fallbackPair[0],
      Number.isFinite(max) ? max : fallbackPair[1],
    ];
  });
  return out;
}

function cloneNumericSeed(source, fallback) {
  const out = {};
  const src = (source && typeof source === 'object') ? source : {};
  Object.keys(fallback).forEach(key => {
    const v = Number(src[key]);
    out[key] = Number.isFinite(v) ? v : fallback[key];
  });
  return out;
}

const LEGACY_WALL_GEOMETRY_STATE_LIMITS = Object.freeze({
  width: [3.0, 7.0],
  depth: [2.5, 6.0],
  fixedHeight: [2.8, 4.5],
  adjustableHeight: [3.0, 5.5],
});
const WALL_GEOMETRY_STATE_LIMITS = Object.freeze(
  cloneLimitMap(ACTIVE_DESIGN_DEF?.geometryLimits, LEGACY_WALL_GEOMETRY_STATE_LIMITS)
);

const LEGACY_BUILTIN_WALL_GEOMETRY_STATE = Object.freeze({
  width: 4.5,
  depth: 3.5,
  fixedHeight: 3.5,
  adjustableHeight: 4.5,
});
const BUILTIN_WALL_GEOMETRY_STATE = Object.freeze(
  cloneNumericSeed(ACTIVE_DESIGN_DEF?.geometryDefaults, LEGACY_BUILTIN_WALL_GEOMETRY_STATE)
);

const LEGACY_WALL_STATE_LIMITS = Object.freeze({
  aAngle: [0, 60], aWidth: [0.3, 2.5],
  bAngle: [0, 60], bWidth: [0.3, 2.5],
  cAngle: [0, 60], cWidth: [0.3, 2.5],
  dAngle: [0, 60], d1Height: [0.5, 2.7], d2Angle: [0, 75],
  eAngle: [-5, 60],
  f1Angle: [0, 40], f1Height: [2.0, 2.7], f1Width: [0.1, 2.0],
  f2Angle: [0, 75], f2WidthTop: [0.3, W],
  rigOpen: [0, 180],
});
const WALL_STATE_LIMITS = cloneLimitMap(ACTIVE_DESIGN_DEF?.wallStateLimits, LEGACY_WALL_STATE_LIMITS);

const LEGACY_BUILTIN_DEFAULT_WALL_STATE = Object.freeze({
  aAngle: 10, aWidth: 1.35,
  bAngle: 10,  bWidth: 1.3,
  cAngle: 10, cWidth: 1.3,
  dAngle: 15,
  d1Height: 3,
  d2Angle: 15,
  eAngle: 5,
  f1Angle: 10, f1Height: 2.2, f1Width: 1.0,
  f2Angle: 10, f2WidthTop: 1.45,
  rigOpen: 0,
});
const BUILTIN_DEFAULT_WALL_STATE = Object.freeze(
  cloneNumericSeed(ACTIVE_DESIGN_DEF?.wallStateDefaults, LEGACY_BUILTIN_DEFAULT_WALL_STATE)
);

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

function readStoredString(key, fallback='') {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return (typeof raw === 'string' && raw.length > 0) ? raw : fallback;
  } catch (_) {
    return fallback;
  }
}

function persistStoredString(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, String(value));
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
  WALL_STATE_LIMITS.f1Width[1] = Math.max(
    WALL_STATE_LIMITS.f1Width[0],
    Math.min(2.0, W)
  );
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

const CORE_REBUILD_STAGE = Object.freeze({
  GEOMETRY: 'geometry',
  ANNOTATIONS: 'annotations',
  CRASH_MATS: 'crashMats',
});

function requestCoreRebuild(stages=null) {
  if (typeof invalidateRebuildStages === 'function') {
    if (Array.isArray(stages) && stages.length) invalidateRebuildStages(stages);
    else invalidateRebuildStages();
  }
  if (typeof rebuild !== 'function') return;
  if (typeof invalidateRebuildStages === 'function') {
    rebuild({useDirty: true});
  } else {
    rebuild();
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
  markSolarPathPreviewDirty();
  applySolarLightingState({persist:false, emit:false});
  if (rebuildScene) requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('geometry:update');
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
  const ok = persistWallState(CAMERA_STATE_STORAGE_KEY, normalized);
  if (ok) syncAppStateFromCore('camera:save');
  return ok;
}

function formatIsoDate(y, m, d) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function getSiteTodayIsoDate(now=new Date()) {
  const siteMs = now.getTime() + (SOLAR_SITE.utcOffsetMinutes * 60000);
  const siteNow = new Date(siteMs);
  return formatIsoDate(siteNow.getUTCFullYear(), siteNow.getUTCMonth() + 1, siteNow.getUTCDate());
}

const BUILTIN_SOLAR_STATE = Object.freeze({
  date: getSiteTodayIsoDate(),
  minutes: 14 * 60,
});

function clampSolarMinutes(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return BUILTIN_SOLAR_STATE.minutes;
  let wrapped = Math.round(v) % 1440;
  if (wrapped < 0) wrapped += 1440;
  return wrapped;
}

function normalizeSolarDate(raw, fallbackDate=getSiteTodayIsoDate()) {
  if (typeof raw !== 'string') return fallbackDate;
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return fallbackDate;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return fallbackDate;
  if (m < 1 || m > 12 || d < 1 || d > 31) return fallbackDate;
  return formatIsoDate(y, m, d);
}

function normalizeSolarState(source, fallback=BUILTIN_SOLAR_STATE) {
  const seed = (fallback && typeof fallback === 'object') ? fallback : BUILTIN_SOLAR_STATE;
  return {
    date: normalizeSolarDate(source?.date, seed.date || getSiteTodayIsoDate()),
    minutes: clampSolarMinutes(source?.minutes),
  };
}

function loadSolarState() {
  const fallback = {
    ...BUILTIN_SOLAR_STATE,
    date: getSiteTodayIsoDate(),
  };
  const saved = readStoredWallState(SOLAR_STATE_STORAGE_KEY);
  return normalizeSolarState(saved, fallback);
}

let solarState = loadSolarState();

const SOLAR_RAD = Math.PI / 180;
const SOLAR_DAY_MS = 86400000;
const SOLAR_J1970 = 2440588;
const SOLAR_J2000 = 2451545;
const SOLAR_EARTH_TILT = SOLAR_RAD * 23.4397;
const solarVecFocus = new THREE.Vector3();
const solarVecDir = new THREE.Vector3();
const solarSkyTopColor = new THREE.Color();
const solarSkyBottomColor = new THREE.Color();
const solarColorDayTop = new THREE.Color(0x4f9be6);
const solarColorDayBottom = new THREE.Color(0xffffff);
const solarColorDuskTop = new THREE.Color(0xff9a5e);
const solarColorDuskBottom = new THREE.Color(0xffd8be);
const solarColorNightTop = new THREE.Color(0x070b18);
const solarColorNightBottom = new THREE.Color(0x141b2d);
const solarSunColorDay = new THREE.Color(0xfff2da);
const solarSunColorDusk = new THREE.Color(0xffbb84);
const solarSunColorNight = new THREE.Color(0x6a7da6);
const solarFillColorDay = new THREE.Color(0xc0d0ff);
const solarFillColorDusk = new THREE.Color(0xffb88d);
const solarFillColorNight = new THREE.Color(0x2c3b5a);
const defaultSunPos = sun.position.clone();
const defaultFillPos = fill.position.clone();
const solarFallbackDir = new THREE.Vector3(0.42, 0.72, 0.55).normalize();
let solarDaylightFactor = 1;
const GI_QUALITY_LABELS = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
});

function normalizeGlobalIlluminationQuality(raw) {
  const key = (typeof raw === 'string') ? raw.trim().toLowerCase() : '';
  if (Object.prototype.hasOwnProperty.call(GI_QUALITY_PRESETS, key)) return key;
  return GI_QUALITY_FALLBACK;
}

function getGlobalIlluminationPreset() {
  const key = normalizeGlobalIlluminationQuality(globalIlluminationQuality);
  return GI_QUALITY_PRESETS[key] || GI_QUALITY_PRESETS[GI_QUALITY_FALLBACK];
}

function toSolarJulian(dateUtc) {
  return (dateUtc.valueOf() / SOLAR_DAY_MS) - 0.5 + SOLAR_J1970;
}

function toSolarDays(dateUtc) {
  return toSolarJulian(dateUtc) - SOLAR_J2000;
}

function getSolarSunCoords(daysFromJ2000) {
  const M = SOLAR_RAD * (357.5291 + (0.98560028 * daysFromJ2000));
  const C = SOLAR_RAD * ((1.9148 * Math.sin(M)) + (0.02 * Math.sin(2 * M)) + (0.0003 * Math.sin(3 * M)));
  const P = SOLAR_RAD * 102.9372;
  const L = M + C + P + Math.PI;
  return {
    dec: Math.asin(Math.sin(L) * Math.sin(SOLAR_EARTH_TILT)),
    ra: Math.atan2(Math.sin(L) * Math.cos(SOLAR_EARTH_TILT), Math.cos(L)),
  };
}

function getSolarDateUtcFromState(state=solarState) {
  const normalized = normalizeSolarState(state, {
    ...BUILTIN_SOLAR_STATE,
    date: getSiteTodayIsoDate(),
  });
  const [yRaw, mRaw, dRaw] = normalized.date.split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  const hh = Math.floor(normalized.minutes / 60);
  const mm = normalized.minutes % 60;
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0) - (SOLAR_SITE.utcOffsetMinutes * 60000);
  return new Date(utcMs);
}

function getSolarPosition(dateUtc, latDeg, lonDeg) {
  const lw = -lonDeg * SOLAR_RAD;
  const phi = latDeg * SOLAR_RAD;
  const d = toSolarDays(dateUtc);
  const c = getSolarSunCoords(d);
  const H = (SOLAR_RAD * (280.16 + (360.9856235 * d))) - lw - c.ra;
  const altitude = Math.asin(
    (Math.sin(phi) * Math.sin(c.dec)) +
    (Math.cos(phi) * Math.cos(c.dec) * Math.cos(H))
  );
  const azimuthSouth = Math.atan2(
    Math.sin(H),
    (Math.cos(H) * Math.sin(phi)) - (Math.tan(c.dec) * Math.cos(phi))
  );
  return { altitude, azimuthSouth };
}

function getSolarDirectionForPosition(pos, out=solarPathDirTmp) {
  const azNorth = pos.azimuthSouth + Math.PI;
  const cosAlt = Math.max(0.00001, Math.cos(pos.altitude));
  const east = Math.sin(azNorth) * cosAlt;
  const north = Math.cos(azNorth) * cosAlt;
  const up = Math.sin(pos.altitude);
  const yaw = THREE.MathUtils.degToRad(SOLAR_SITE.northYawDeg);
  const dirX = (east * Math.cos(yaw)) + (north * Math.sin(yaw));
  const dirZ = (north * Math.cos(yaw)) - (east * Math.sin(yaw));
  return out.set(dirX, up, dirZ).normalize();
}

function getSolarFocusPoint() {
  solarVecFocus.set(
    WALL_ORIGIN_X + (W * 0.5),
    Math.max(1.5, H_fixed * 0.45),
    WALL_ORIGIN_Z + (D * 0.5)
  );
  return solarVecFocus;
}

function getSolarMonth(state=solarState) {
  const normalized = normalizeSolarState(state, {
    ...BUILTIN_SOLAR_STATE,
    date: getSiteTodayIsoDate(),
  });
  const month = Number(String(normalized.date).split('-')[1]);
  if (!Number.isFinite(month)) return 1;
  return THREE.MathUtils.clamp(Math.round(month), 1, 12);
}

function getDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 31;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function setSolarMonth(month, {persist=true, emit=true}={}) {
  const normalized = normalizeSolarState(solarState, {
    ...BUILTIN_SOLAR_STATE,
    date: getSiteTodayIsoDate(),
  });
  const [yRaw, , dRaw] = String(normalized.date).split('-');
  const year = Number(yRaw);
  const targetMonth = THREE.MathUtils.clamp(Math.round(Number(month) || 1), 1, 12);
  const daySeed = Number(dRaw);
  const maxDay = getDaysInMonth(year, targetMonth);
  const day = THREE.MathUtils.clamp(Math.round(Number.isFinite(daySeed) ? daySeed : 1), 1, maxDay);
  const nextDate = formatIsoDate(year, targetMonth, day);
  return setSolarState({...solarState, date: nextDate}, {persist, emit});
}

function markSolarPathPreviewDirty() {
  solarPathPreviewState.dirty = true;
}

function updateSolarPathPreviewVisibility() {
  solarPathPreviewLine.visible = !!(
    environmentEnabled &&
    solarPathPreviewState.requestedVisible &&
    solarPathPreviewState.hasGeometry
  );
}

function rebuildSolarPathPreviewGeometry() {
  const sampleCount = Math.max(16, Math.round(Number(solarPathPreviewState.sampleCount) || 96));
  const sampleDistance = Math.max(8, Number(solarPathPreviewState.sampleDistance) || 56);
  const date = normalizeSolarDate(solarState?.date, getSiteTodayIsoDate());
  const focus = getSolarFocusPoint();
  const points = [];
  const minVisibleAltitudeRad = THREE.MathUtils.degToRad(-6);

  for (let i = 0; i <= sampleCount; i++) {
    const minutes = Math.round((i / sampleCount) * 1439);
    const whenUtc = getSolarDateUtcFromState({date, minutes});
    const pos = getSolarPosition(whenUtc, SOLAR_SITE.latitudeDeg, SOLAR_SITE.longitudeDeg);
    if (!pos || pos.altitude < minVisibleAltitudeRad) continue;
    const dir = getSolarDirectionForPosition(pos, solarPathDirTmp);
    points.push(new THREE.Vector3(
      focus.x + (dir.x * sampleDistance),
      focus.y + (dir.y * sampleDistance),
      focus.z + (dir.z * sampleDistance)
    ));
  }

  if (solarPathPreviewLine.geometry && typeof solarPathPreviewLine.geometry.dispose === 'function') {
    solarPathPreviewLine.geometry.dispose();
  }
  solarPathPreviewLine.geometry = new THREE.BufferGeometry();
  if (points.length >= 2) {
    solarPathPreviewLine.geometry.setFromPoints(points);
    solarPathPreviewState.hasGeometry = true;
  } else {
    solarPathPreviewState.hasGeometry = false;
  }
  solarPathPreviewState.lastDate = date;
  solarPathPreviewState.dirty = false;
  updateSolarPathPreviewVisibility();
}

function setSolarPathPreviewVisible(visible) {
  solarPathPreviewState.requestedVisible = !!visible;
  if (solarPathPreviewState.requestedVisible && (solarPathPreviewState.dirty || solarPathPreviewState.lastDate !== normalizeSolarDate(solarState?.date, getSiteTodayIsoDate()))) {
    rebuildSolarPathPreviewGeometry();
  }
  updateSolarPathPreviewVisibility();
}

function setGiFallbackIntensity(intensity, focus, dir) {
  const v = Math.max(0, Number(intensity) || 0);
  giLightRig.visible = v > 0.0001;
  giHemiLight.position.copy(focus).add(new THREE.Vector3(0, 3.0, 0));
  giWarmBounce.position.copy(focus).addScaledVector(dir, -12).add(new THREE.Vector3(5.5, 3.0, -3.8));
  giCoolBounce.position.copy(focus).addScaledVector(dir, -9).add(new THREE.Vector3(-4.4, 2.6, 4.6));
  giRearBounce.position.copy(focus).add(new THREE.Vector3(0.0, 2.8, 7.5));
  giHemiLight.intensity = v * 0.48;
  giWarmBounce.intensity = v * 0.34;
  giCoolBounce.intensity = v * 0.24;
  giRearBounce.intensity = v * 0.16;
}

function disposeGlobalIlluminationProbe() {
  if (giState.probe) {
    scene.remove(giState.probe);
  }
  if (giState.cubeRenderTarget && typeof giState.cubeRenderTarget.dispose === 'function') {
    giState.cubeRenderTarget.dispose();
  }
  giState.probe = null;
  giState.cubeCamera = null;
  giState.cubeRenderTarget = null;
  giState.captureResolution = 0;
}

function ensureGlobalIlluminationProbe() {
  if (!giState.supported) return false;
  const preset = getGlobalIlluminationPreset();
  const desiredResolution = Math.max(8, Math.round(Number(preset.captureResolution) || 24));
  if (
    giState.cubeRenderTarget &&
    giState.captureResolution > 0 &&
    giState.captureResolution !== desiredResolution
  ) {
    disposeGlobalIlluminationProbe();
  }
  if (giState.probe && giState.cubeCamera && giState.cubeRenderTarget) return true;
  try {
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(desiredResolution, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      encoding: renderer.outputEncoding || THREE.LinearEncoding,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    const cubeCamera = new THREE.CubeCamera(0.1, 70, cubeRenderTarget);
    const probe = new THREE.LightProbe();
    probe.intensity = 0;
    scene.add(probe);
    giState.probe = probe;
    giState.cubeCamera = cubeCamera;
    giState.cubeRenderTarget = cubeRenderTarget;
    giState.captureResolution = desiredResolution;
    giState.qualityKey = normalizeGlobalIlluminationQuality(globalIlluminationQuality);
    giState.dirty = true;
    return true;
  } catch (err) {
    console.warn('[gi] failed to initialize probe GI, using fallback rig', err);
    giState.supported = false;
    disposeGlobalIlluminationProbe();
    return false;
  }
}

function hideForGiCapture(obj) {
  if (!obj || !obj.visible) return;
  giHiddenDuringCapture.push(obj);
  obj.visible = false;
}

function restoreAfterGiCapture() {
  while (giHiddenDuringCapture.length) {
    const obj = giHiddenDuringCapture.pop();
    if (!obj) continue;
    obj.visible = true;
  }
}

function markGlobalIlluminationDirty() {
  giState.dirty = true;
}

function applyGlobalIlluminationState() {
  const on = !!globalIlluminationEnabled;
  const focus = getSolarFocusPoint();
  const day = THREE.MathUtils.clamp(Number(solarDaylightFactor) || 0, 0, 1);
  const dir = (solarVecDir.lengthSq() > 1e-8) ? solarVecDir : solarFallbackDir;
  const preset = getGlobalIlluminationPreset();
  const intensityScale = Math.max(0.2, Number(preset.intensityScale) || 1);
  giState.qualityKey = normalizeGlobalIlluminationQuality(globalIlluminationQuality);

  if (!on) {
    giState.mode = 'off';
    if (giState.probe) giState.probe.intensity = 0;
    setGiFallbackIntensity(0, focus, dir);
    return;
  }

  if (ensureGlobalIlluminationProbe()) {
    giState.mode = 'probe';
    if (giState.probe) giState.probe.intensity = (0.18 + (0.72 * day)) * intensityScale;
    setGiFallbackIntensity(0, focus, dir);
    markGlobalIlluminationDirty();
    return;
  }

  giState.mode = 'fallback';
  if (giState.probe) giState.probe.intensity = 0;
  setGiFallbackIntensity((0.18 + (0.58 * day)) * intensityScale, focus, dir);
}

function updateGlobalIlluminationFrame(nowMs) {
  if (!globalIlluminationEnabled) return;
  if (giState.mode !== 'probe') return;
  if (!giState.probe || !giState.cubeCamera || !giState.cubeRenderTarget) return;
  if (!THREE.LightProbeGenerator || !THREE.LightProbeGenerator.fromCubeRenderTarget) return;

  const now = Number.isFinite(nowMs) ? nowMs : (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  );
  const preset = getGlobalIlluminationPreset();
  const minInterval = (renderer.xr && renderer.xr.isPresenting)
    ? Math.max(40, Number(preset.xrUpdateMs) || 900)
    : Math.max(20, Number(preset.desktopUpdateMs) || 360);
  if (!giState.dirty && (now - giState.lastUpdateMs) < minInterval) return;
  if (giState.updating) return;
  giState.updating = true;
  giState.lastUpdateMs = now;

  try {
    const focus = getSolarFocusPoint();
    giProbeFocus.copy(focus);
    giProbeFocus.y = Math.min(H_adj + 0.8, Math.max(1.1, focus.y + (H_fixed * 0.12)));
    giState.cubeCamera.position.copy(giProbeFocus);

    hideForGiCapture(solarSunMarker);
    hideForGiCapture(solarPathPreviewLine);
    hideForGiCapture(dimGroup);
    hideForGiCapture(keyDimGroup);
    hideForGiCapture(labelGroup);
    hideForGiCapture(hoverDimGroup);
    hideForGiCapture(giLightRig);

    giState.cubeCamera.update(renderer, scene);
    const probeSample = THREE.LightProbeGenerator.fromCubeRenderTarget(renderer, giState.cubeRenderTarget);
    if (probeSample && probeSample.sh && giState.probe?.sh) {
      giState.probe.sh.copy(probeSample.sh);
    }
    giState.dirty = false;
  } catch (err) {
    console.warn('[gi] probe update failed, falling back to light rig', err);
    giState.mode = 'fallback';
    giState.supported = false;
    const dir = (solarVecDir.lengthSq() > 1e-8) ? solarVecDir : solarFallbackDir;
    setGiFallbackIntensity(
      (0.18 + (0.58 * THREE.MathUtils.clamp(Number(solarDaylightFactor) || 0, 0, 1))) *
        (Math.max(0.2, Number(preset.intensityScale) || 1)),
      getSolarFocusPoint(),
      dir
    );
    if (giState.probe) giState.probe.intensity = 0;
  } finally {
    restoreAfterGiCapture();
    giState.updating = false;
  }
}

function saveSolarState(nextSolarState, {emit=true}={}) {
  const normalized = normalizeSolarState(nextSolarState, {
    ...BUILTIN_SOLAR_STATE,
    date: getSiteTodayIsoDate(),
  });
  const ok = persistWallState(SOLAR_STATE_STORAGE_KEY, normalized);
  if (ok) solarState = normalized;
  if (ok && emit) syncAppStateFromCore('solar:save');
  return ok;
}

function applySolarLightingState({persist=false, emit=false}={}) {
  if (!environmentEnabled) {
    ambientLight.intensity = 0.30;
    sun.intensity = 0.95;
    sun.color.copy(solarSunColorDay);
    sun.position.copy(defaultSunPos);
    fill.intensity = 0.22;
    fill.color.copy(solarFillColorDay);
    fill.position.copy(defaultFillPos);
    const focus = getSolarFocusPoint();
    sunTarget.position.copy(focus);
    sun.castShadow = true;
    solarSunMarker.visible = false;
    solarDaylightFactor = 1;
    solarVecDir.copy(solarFallbackDir);
    applyGlobalIlluminationState();
    updateSolarPathPreviewVisibility();
    return;
  }

  const whenUtc = getSolarDateUtcFromState(solarState);
  const pos = getSolarPosition(whenUtc, SOLAR_SITE.latitudeDeg, SOLAR_SITE.longitudeDeg);
  const altDeg = THREE.MathUtils.radToDeg(pos.altitude);
  getSolarDirectionForPosition(pos, solarVecDir);

  const daylight = THREE.MathUtils.clamp((altDeg + 6) / 18, 0, 1);
  const twilight = THREE.MathUtils.clamp(1 - Math.abs((altDeg - 2) / 14), 0, 1) * (1 - (daylight * 0.65));
  const night = 1 - THREE.MathUtils.clamp((altDeg + 10) / 20, 0, 1);

  const focus = getSolarFocusPoint();
  sunTarget.position.copy(focus);
  sun.position.copy(focus).addScaledVector(solarVecDir, 38);
  sun.intensity = 1.10 * daylight;
  sun.castShadow = daylight > 0.08;
  sun.color.copy(solarSunColorNight).lerp(solarSunColorDusk, twilight).lerp(solarSunColorDay, daylight);

  fill.intensity = 0.01 + (0.17 * daylight) + (0.03 * twilight);
  fill.color.copy(solarFillColorNight).lerp(solarFillColorDusk, twilight).lerp(solarFillColorDay, daylight);
  fill.position.copy(focus).addScaledVector(solarVecDir, -22).add(new THREE.Vector3(0, 4.5, 0));

  ambientLight.intensity = 0.025 + (0.25 * daylight) + (0.02 * (1 - night));
  solarDaylightFactor = daylight;

  const sunMarkerOpacity = THREE.MathUtils.clamp((altDeg + 6) / 18, 0, 1);
  solarSunMarker.position.copy(focus).addScaledVector(solarVecDir, 56);
  solarSunMarker.visible = sunMarkerOpacity > 0.01;
  if (solarSunMarker.material) {
    solarSunMarker.material.opacity = 0.3 + (0.7 * sunMarkerOpacity);
    solarSunMarker.material.needsUpdate = true;
  }

  solarSkyTopColor.copy(solarColorNightTop).lerp(solarColorDayTop, daylight).lerp(solarColorDuskTop, twilight * 0.85);
  solarSkyBottomColor.copy(solarColorNightBottom).lerp(solarColorDayBottom, daylight).lerp(solarColorDuskBottom, twilight * 0.75);

  renderer.setClearColor(solarSkyBottomColor);
  if (scene.background && scene.background.isColor) scene.background.copy(solarSkyBottomColor);
  else scene.background = solarSkyBottomColor.clone();
  if (scene.fog?.color) scene.fog.color.copy(solarSkyBottomColor);

  const skyUniforms = (
    typeof environmentSkyDome !== 'undefined' &&
    environmentSkyDome?.material?.uniforms
  ) ? environmentSkyDome.material.uniforms : null;
  if (skyUniforms?.topColor?.value && skyUniforms?.bottomColor?.value) {
    skyUniforms.topColor.value.copy(solarSkyTopColor);
    skyUniforms.bottomColor.value.copy(solarSkyBottomColor);
    if (skyUniforms.exponent?.value !== undefined) {
      skyUniforms.exponent.value = THREE.MathUtils.lerp(1.28, 0.92, daylight);
    }
  }

  applyGlobalIlluminationState();
  const normalizedDate = normalizeSolarDate(solarState?.date, getSiteTodayIsoDate());
  if (solarPathPreviewState.dirty || solarPathPreviewState.lastDate !== normalizedDate) {
    rebuildSolarPathPreviewGeometry();
  } else {
    updateSolarPathPreviewVisibility();
  }

  if (persist) saveSolarState(solarState, {emit});
}

function setSolarState(nextSolarState, {persist=false, emit=true}={}) {
  const prevDate = normalizeSolarDate(solarState?.date, getSiteTodayIsoDate());
  solarState = normalizeSolarState(nextSolarState, {
    ...BUILTIN_SOLAR_STATE,
    date: getSiteTodayIsoDate(),
  });
  const nextDate = normalizeSolarDate(solarState?.date, getSiteTodayIsoDate());
  if (nextDate !== prevDate) markSolarPathPreviewDirty();
  applySolarLightingState({persist, emit:false});
  if (persist) saveSolarState(solarState, {emit});
  else if (emit) syncAppStateFromCore('solar:update');
  return {...solarState};
}

function setSolarTimeMinutes(minutes, options={}) {
  return setSolarState({...solarState, minutes}, options);
}

function getSolarState() {
  return {...solarState};
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
  syncAppStateFromCore('walls:reset');
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
let keyDimGroup = new THREE.Group();
keyDimGroup.position.set(WALL_ORIGIN_X, 0, WALL_ORIGIN_Z);
scene.add(keyDimGroup);
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
let officeEnabled = readStoredBool(OFFICE_STORAGE_KEY, true);
let saunaEnabled = readStoredBool(SAUNA_STORAGE_KEY, true);
let outdoorKitchenEnabled = readStoredBool(OUTDOOR_KITCHEN_STORAGE_KEY, true);
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
let globalIlluminationEnabled = readStoredBool(GLOBAL_ILLUMINATION_STORAGE_KEY, false);
let globalIlluminationQuality = normalizeGlobalIlluminationQuality(
  readStoredString(GLOBAL_ILLUMINATION_QUALITY_STORAGE_KEY, GI_QUALITY_FALLBACK)
);

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
  applySolarLightingState({persist:false, emit:false});
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
  markGlobalIlluminationDirty();
  syncAppStateFromCore('toggle:crashMats');
}

function setCrashMatTextureEnabled(enabled) {
  crashMatTextureEnabled = !!enabled;
  persistStoredBool(CRASH_MAT_TEXTURE_STORAGE_KEY, crashMatTextureEnabled);
  texturesEnabled = texturedWallsEnabled && crashMatTextureEnabled;
  persistStoredBool(TEXTURES_STORAGE_KEY, texturesEnabled);
  if (typeof rebuildCrashMatsGeometry === 'function') rebuildCrashMatsGeometry();
  markGlobalIlluminationDirty();
  syncAppStateFromCore('toggle:crashMatTexture');
}

function setPolyRoofEnabled(enabled) {
  polyRoofEnabled = !!enabled;
  persistStoredBool(POLY_ROOF_STORAGE_KEY, polyRoofEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:polyRoof');
}

function setTrainingRigEnabled(enabled) {
  trainingRigEnabled = !!enabled;
  persistStoredBool(TRAINING_RIG_STORAGE_KEY, trainingRigEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:trainingRig');
}

function setTrainingCabinetEnabled(enabled) {
  trainingCabinetEnabled = !!enabled;
  persistStoredBool(TRAINING_CABINET_STORAGE_KEY, trainingCabinetEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:trainingCabinet');
}

function setCampusBoardEnabled(enabled) {
  campusBoardEnabled = !!enabled;
  persistStoredBool(CAMPUS_BOARD_STORAGE_KEY, campusBoardEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:campusBoard');
}

function setConceptVolumesEnabled(enabled) {
  conceptVolumesEnabled = !!enabled;
  persistStoredBool(CONCEPT_VOLUMES_STORAGE_KEY, conceptVolumesEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:conceptVolumes');
}

function setOfficeEnabled(enabled) {
  officeEnabled = !!enabled;
  persistStoredBool(OFFICE_STORAGE_KEY, officeEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:office');
}

function setSaunaEnabled(enabled) {
  saunaEnabled = !!enabled;
  persistStoredBool(SAUNA_STORAGE_KEY, saunaEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:sauna');
}

function setOutdoorKitchenEnabled(enabled) {
  outdoorKitchenEnabled = !!enabled;
  persistStoredBool(OUTDOOR_KITCHEN_STORAGE_KEY, outdoorKitchenEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:outdoorKitchen');
}

function setTexturedWallsEnabled(enabled) {
  texturedWallsEnabled = !!enabled;
  persistStoredBool(WALL_TEXTURES_STORAGE_KEY, texturedWallsEnabled);
  texturesEnabled = texturedWallsEnabled && crashMatTextureEnabled;
  persistStoredBool(TEXTURES_STORAGE_KEY, texturesEnabled);
  updateAllWallMaterials();
  applyConceptVolumeMaterialStyle();
  markGlobalIlluminationDirty();
  syncAppStateFromCore('toggle:texturedWalls');
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
  markGlobalIlluminationDirty();
  syncAppStateFromCore('toggle:textures');
}

function setClimbingHoldsEnabled(enabled) {
  climbingHoldsEnabled = !!enabled;
  persistStoredBool(CLIMBING_HOLDS_STORAGE_KEY, climbingHoldsEnabled);
  requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  syncAppStateFromCore('toggle:climbingHolds');
}

function setEnvironmentEnabled(enabled) {
  environmentEnabled = !!enabled;
  persistStoredBool(ENVIRONMENT_STORAGE_KEY, environmentEnabled);
  applyEnvironmentVisualState();
  markGlobalIlluminationDirty();
  syncAppStateFromCore('toggle:environment');
}

function setGlobalIlluminationEnabled(enabled, {emit=true}={}) {
  globalIlluminationEnabled = !!enabled;
  persistStoredBool(GLOBAL_ILLUMINATION_STORAGE_KEY, globalIlluminationEnabled);
  if (globalIlluminationEnabled) markGlobalIlluminationDirty();
  applyGlobalIlluminationState();
  if (emit) syncAppStateFromCore('toggle:globalIllumination');
}

function setGlobalIlluminationQuality(quality, {emit=true}={}) {
  const normalized = normalizeGlobalIlluminationQuality(quality);
  globalIlluminationQuality = normalized;
  persistStoredString(GLOBAL_ILLUMINATION_QUALITY_STORAGE_KEY, globalIlluminationQuality);
  disposeGlobalIlluminationProbe();
  markGlobalIlluminationDirty();
  applyGlobalIlluminationState();
  if (emit) syncAppStateFromCore('toggle:globalIlluminationQuality');
}

// ── Materials ──
const claddingMat = new THREE.MeshPhysicalMaterial({
  color: 0x4a4d52,
  side: THREE.DoubleSide,
  roughness: 0.80,
  metalness: 0.08,
  clearcoat: 0.10,
  clearcoatRoughness: 0.74,
  reflectivity: 0.35,
});
function makeMonumentAxonTexture() {
  const HARDIE_GROOVE_SPACING_M = 0.12;
  const HARDIE_REF_HEIGHT_M = 2.40;
  const HARDIE_REF_V_REPEAT = 1.30;
  const cv = document.createElement('canvas');
  cv.width = 960;
  cv.height = 960;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#43484f';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const groovePitchPx = 48; // 20 grooves across 960px tile
  for (let x = 0; x < cv.width; x += groovePitchPx) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, 0, 2, cv.height);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(x + 3, 0, 2, cv.height);
  }
  const groovesPerTile = cv.width / groovePitchPx;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const spanU = 2.4;
  const spanV = HARDIE_REF_HEIGHT_M;
  tex.repeat.set(
    Math.max(0.05, spanU / (HARDIE_GROOVE_SPACING_M * groovesPerTile)),
    Math.max(0.12, HARDIE_REF_V_REPEAT * (spanV / HARDIE_REF_HEIGHT_M))
  );
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  tex.needsUpdate = true;
  return tex;
}
function makeMonumentAxonMaterial(spanU=2.4, spanV=2.4, opts={}) {
  const HARDIE_GROOVE_SPACING_M = 0.12;
  const HARDIE_REF_HEIGHT_M = 2.40;
  const HARDIE_REF_V_REPEAT = 1.30;
  const tex = makeMonumentAxonTexture();
  if (tex) {
    const groovePitchPx = 48;
    const groovesPerTile = 960 / groovePitchPx;
    tex.repeat.set(
      Math.max(0.05, spanU / (HARDIE_GROOVE_SPACING_M * groovesPerTile)),
      Math.max(0.12, HARDIE_REF_V_REPEAT * (spanV / HARDIE_REF_HEIGHT_M))
    );
    tex.needsUpdate = true;
  }
  return new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: tex,
    side: THREE.DoubleSide,
    ...opts,
  });
}
const rearWallCladdingMat = makeMonumentAxonMaterial(2.4, 2.4);
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
const CUSTOM_WALL_TEXTURE_DIRS = (
  Array.isArray(ACTIVE_TEXTURE_CONFIG?.wallDirs) &&
  ACTIVE_TEXTURE_CONFIG.wallDirs.length
) ? ACTIVE_TEXTURE_CONFIG.wallDirs.slice() : ['textures/walls'];
const CUSTOM_WALL_TEXTURE_DIR = CUSTOM_WALL_TEXTURE_DIRS[0];
const DEFAULT_PLYWOOD_PREVIEW_DIR = 'textures/sources/plywood04517';
const DEFAULT_PLYWOOD_REPEAT_X = 2.0;
const DEFAULT_PLYWOOD_REPEAT_Y = 1.9;
let wallCustomTextureEntries = {};
let wallTextureLoader = null;
const CONCEPT_VOLUME_TEXTURE_IDS = ['default', 'cornerAB', 'ceilingG', 'dartC', 'dartB'];
const CONCEPT_VOLUME_TEXTURE_DIRS = (
  Array.isArray(ACTIVE_TEXTURE_CONFIG?.volumeDirs) &&
  ACTIVE_TEXTURE_CONFIG.volumeDirs.length
) ? ACTIVE_TEXTURE_CONFIG.volumeDirs.slice() : ['textures/volumes'];
const CONCEPT_VOLUME_TEXTURE_DIR = CONCEPT_VOLUME_TEXTURE_DIRS[0];
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

function dedupePathList(paths) {
  const seen = new Set();
  const out = [];
  (paths || []).forEach(path => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    out.push(path);
  });
  return out;
}

function loadTextureFromCandidates(loader, candidates, onLoad, onAllFailed) {
  const list = dedupePathList(candidates);
  if (!loader || !list.length) {
    if (typeof onAllFailed === 'function') onAllFailed();
    return;
  }
  let idx = 0;
  const tryNext = () => {
    if (idx >= list.length) {
      if (typeof onAllFailed === 'function') onAllFailed();
      return;
    }
    const path = list[idx++];
    loader.load(
      path,
      tex => {
        if (typeof onLoad === 'function') onLoad(tex, path);
      },
      undefined,
      () => tryNext()
    );
  };
  tryNext();
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
    const frontCandidates = CUSTOM_WALL_TEXTURE_DIRS.map(dir => `${dir}/${textureKey}.png`);
    loadTextureFromCandidates(
      wallTextureLoader,
      frontCandidates,
      tex => {
        entry.front = configureLoadedWallTexture(tex);
        entry.frontAttempted = true;
        entry.frontLoading = false;
        updateAllWallMaterials();
      },
      () => {
        entry.front = null;
        entry.frontAttempted = true;
        entry.frontLoading = false;
      }
    );
  }

  if (!entry.bumpAttempted && !entry.bumpLoading) {
    entry.bumpLoading = true;
    const bumpCandidates = CUSTOM_WALL_TEXTURE_DIRS.map(dir => `${dir}/${textureKey}-bump.png`);
    loadTextureFromCandidates(
      wallTextureLoader,
      bumpCandidates,
      tex => {
        entry.bump = configureLoadedWallTexture(tex);
        entry.bumpAttempted = true;
        entry.bumpLoading = false;
        updateAllWallMaterials();
      },
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
    const frontCandidates = CONCEPT_VOLUME_TEXTURE_DIRS.map(dir => `${dir}/${id}.png`);
    loadTextureFromCandidates(
      volumeTextureLoader,
      frontCandidates,
      tex => {
        entry.front = configureLoadedWallTexture(tex);
        entry.frontAttempted = true;
        entry.frontLoading = false;
        applyConceptVolumeMaterialStyle(id);
      },
      () => {
        entry.front = null;
        entry.frontAttempted = true;
        entry.frontLoading = false;
      }
    );
  }

  if (!entry.bumpAttempted && !entry.bumpLoading) {
    entry.bumpLoading = true;
    const bumpCandidates = CONCEPT_VOLUME_TEXTURE_DIRS.map(dir => `${dir}/${id}-bump.png`);
    loadTextureFromCandidates(
      volumeTextureLoader,
      bumpCandidates,
      tex => {
        entry.bump = configureLoadedWallTexture(tex);
        entry.bumpAttempted = true;
        entry.bumpLoading = false;
        applyConceptVolumeMaterialStyle(id);
      },
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
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = w;
  normalCanvas.height = h;
  const normalCtx = normalCanvas.getContext('2d');
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = w;
  roughCanvas.height = h;
  const roughCtx = roughCanvas.getContext('2d');
  const metalCanvas = document.createElement('canvas');
  metalCanvas.width = w;
  metalCanvas.height = h;
  const metalCtx = metalCanvas.getContext('2d');
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bumpCtx = bumpCanvas.getContext('2d');
  if (!colorCtx || !normalCtx || !roughCtx || !metalCtx || !bumpCtx) {
    return {
      map: null,
      bumpMap: null,
      normalMap: null,
      roughnessMap: null,
      metalnessMap: null,
    };
  }

  const tau = Math.PI * 2;
  const ribsPerTile = 46;
  const ribPhase = 0.18;
  const seamPeriodPx = 192;
  const seamWidthPx = 3.5;
  const colorRand = seededRandom(hashString('roof-corrugated-color-v2'));
  const weatherRand = seededRandom(hashString('roof-corrugated-weather-v2'));

  const heightField = new Float32Array(w * h);
  const profileAt = (xNorm, yNorm) => {
    const t = (xNorm * tau * ribsPerTile) + ribPhase;
    const base = Math.sin(t);
    const harmonic = Math.sin((t * 3.0) + 0.32) * 0.16;
    const micro = Math.sin((t * 9.0) - 0.42) * 0.04;
    const flattened = Math.sign(base) * Math.pow(Math.abs(base), 0.82);
    const oilCan = Math.sin((yNorm * tau * 2.2) + (xNorm * tau * 0.35)) * 0.020;
    const c = THREE.MathUtils.clamp((flattened * 0.84) + harmonic + micro + oilCan, -1, 1);
    return 0.5 + (c * 0.44);
  };
  const seamMaskAt = x => {
    const m = x % seamPeriodPx;
    const d = Math.min(Math.abs(m), Math.abs(m - seamPeriodPx));
    if (d >= seamWidthPx) return 0;
    return 1 - (d / seamWidthPx);
  };

  for (let y = 0; y < h; y++) {
    const yNorm = y / h;
    for (let x = 0; x < w; x++) {
      const idx = (y * w) + x;
      const xNorm = x / w;
      heightField[idx] = profileAt(xNorm, yNorm);
    }
  }

  const colorImage = colorCtx.createImageData(w, h);
  const normalImage = normalCtx.createImageData(w, h);
  const roughImage = roughCtx.createImageData(w, h);
  const metalImage = metalCtx.createImageData(w, h);
  const bumpImage = bumpCtx.createImageData(w, h);
  const colorData = colorImage.data;
  const normalData = normalImage.data;
  const roughData = roughImage.data;
  const metalData = metalImage.data;
  const bumpData = bumpImage.data;

  for (let y = 0; y < h; y++) {
    const yNorm = y / h;
    for (let x = 0; x < w; x++) {
      const idx = (y * w) + x;
      const px = idx * 4;
      const hC = heightField[idx];
      const hL = heightField[(y * w) + ((x - 1 + w) % w)];
      const hR = heightField[(y * w) + ((x + 1) % w)];
      const hD = heightField[((y - 1 + h) % h) * w + x];
      const hU = heightField[((y + 1) % h) * w + x];
      const seamMask = seamMaskAt(x);
      const ridge = (hC - 0.5) * 2.0;
      const valleyMask = THREE.MathUtils.clamp(-ridge, 0, 1);

      const streak = Math.sin((yNorm * tau * 1.5) + (x / w) * tau * 0.16) * 1.6;
      const grain = (colorRand() - 0.5) * 2.6;
      const ridgeShade = ridge * 13;
      const seamShadow = seamMask * 6;
      const seamHighlight = seamMask * 3;

      let r = 94 + ridgeShade + streak + grain - seamShadow;
      let g = 98 + ridgeShade + (streak * 1.03) + grain - seamShadow + seamHighlight;
      let b = 104 + ridgeShade + (streak * 1.08) + grain - (seamShadow * 0.90) + seamHighlight;

      if (weatherRand() > 0.9975) {
        const fleck = 10 + (weatherRand() * 16);
        r += fleck;
        g += fleck;
        b += fleck;
      }

      colorData[px] = THREE.MathUtils.clamp(r | 0, 62, 176);
      colorData[px + 1] = THREE.MathUtils.clamp(g | 0, 66, 180);
      colorData[px + 2] = THREE.MathUtils.clamp(b | 0, 72, 188);
      colorData[px + 3] = 255;

      const dx = (hR - hL) * 2.2;
      const dy = (hU - hD) * 0.85;
      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const nLen = Math.sqrt((nx * nx) + (ny * ny) + (nz * nz)) || 1;
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;
      normalData[px] = ((nx * 0.5 + 0.5) * 255) | 0;
      normalData[px + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      normalData[px + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
      normalData[px + 3] = 255;

      const roughNoise = (weatherRand() - 0.5) * 0.06;
      const rough = THREE.MathUtils.clamp(
        0.70 + (valleyMask * 0.16) + (seamMask * 0.08) + roughNoise,
        0.52,
        0.95
      );
      const roughByte = (rough * 255) | 0;
      roughData[px] = roughByte;
      roughData[px + 1] = roughByte;
      roughData[px + 2] = roughByte;
      roughData[px + 3] = 255;

      const metalNoise = (weatherRand() - 0.5) * 0.04;
      const metal = THREE.MathUtils.clamp(
        0.16 - (valleyMask * 0.05) - (seamMask * 0.03) + metalNoise,
        0.04,
        0.32
      );
      const metalByte = (metal * 255) | 0;
      metalData[px] = metalByte;
      metalData[px + 1] = metalByte;
      metalData[px + 2] = metalByte;
      metalData[px + 3] = 255;

      const bump = THREE.MathUtils.clamp((hC * 255) | 0, 0, 255);
      bumpData[px] = bump;
      bumpData[px + 1] = bump;
      bumpData[px + 2] = bump;
      bumpData[px + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);
  metalCtx.putImageData(metalImage, 0, 0);
  bumpCtx.putImageData(bumpImage, 0, 0);

  const repeatU = 1.85;
  const repeatV = 2.10;
  const map = makeCanvasTexture(colorCanvas, repeatU, repeatV);
  if (map && typeof THREE.sRGBEncoding !== 'undefined') map.encoding = THREE.sRGBEncoding;
  return {
    map,
    bumpMap: makeCanvasTexture(bumpCanvas, repeatU, repeatV),
    normalMap: makeCanvasTexture(normalCanvas, repeatU, repeatV),
    roughnessMap: makeCanvasTexture(roughCanvas, repeatU, repeatV),
    metalnessMap: makeCanvasTexture(metalCanvas, repeatU, repeatV),
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
  claddingMat.map = texturePack.map || null;
  claddingMat.normalMap = texturePack.normalMap || null;
  if (claddingMat.normalMap) {
    if (!claddingMat.normalScale) claddingMat.normalScale = new THREE.Vector2(0.62, 0.22);
    else claddingMat.normalScale.set(0.62, 0.22);
  }
  claddingMat.roughnessMap = texturePack.roughnessMap || null;
  claddingMat.metalnessMap = texturePack.metalnessMap || null;
  claddingMat.bumpMap = texturePack.bumpMap || null;
  claddingMat.bumpScale = claddingMat.normalMap ? 0.004 : 0.016;
  claddingMat.roughness = 0.82;
  claddingMat.metalness = 0.08;
  if (typeof claddingMat.clearcoat === 'number') claddingMat.clearcoat = 0.10;
  if (typeof claddingMat.clearcoatRoughness === 'number') claddingMat.clearcoatRoughness = 0.74;
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

function buildCoreAppStateSnapshot() {
  return {
    meta: {
      activeDesignId: ACTIVE_DESIGN_ID,
    },
    geometry: {
      ...wallGeometryState,
    },
    walls: {
      ...wallState,
    },
    camera: loadCameraState(),
    solar: {
      ...solarState,
      site: {...SOLAR_SITE},
    },
    site: {
      ...SITE_LAYOUT,
      wallOriginX: WALL_ORIGIN_X,
      wallOriginZ: WALL_ORIGIN_Z,
    },
    toggles: {
      crashMatsEnabled,
      polyRoofEnabled,
      trainingRigEnabled,
      trainingCabinetEnabled,
      campusBoardEnabled,
      conceptVolumesEnabled,
      officeEnabled,
      saunaEnabled,
      outdoorKitchenEnabled,
      texturedWallsEnabled,
      climbingHoldsEnabled,
      crashMatTextureEnabled,
      texturesEnabled,
      environmentEnabled,
      globalIlluminationEnabled,
      globalIlluminationQuality,
    },
    tools: {
      measurement: (
        DESIGN_SYSTEM &&
        DESIGN_SYSTEM.measurementToolPlan &&
        DESIGN_SYSTEM.measurementToolPlan.defaults
      ) ? {...DESIGN_SYSTEM.measurementToolPlan.defaults} : null,
    },
  };
}

function applyCoreSnapshotToLegacy(nextState, options={}) {
  if (!nextState || typeof nextState !== 'object') return false;
  const rebuildScene = options.rebuildScene !== false;
  let needsRebuild = false;

  if (nextState.geometry && typeof nextState.geometry === 'object') {
    applyWallGeometryState(nextState.geometry, {
      rebuildScene: false,
      persistState: true,
      persistDefaults: false,
    });
    needsRebuild = true;
  }
  if (nextState.walls && typeof nextState.walls === 'object') {
    Object.keys(wallState).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(nextState.walls, key)) return;
      const raw = Number(nextState.walls[key]);
      if (!Number.isFinite(raw)) return;
      wallState[key] = clampWallStateValue(key, raw);
    });
    persistWallState(WALL_STATE_STORAGE_KEY, wallState);
    needsRebuild = true;
  }
  if (nextState.solar && typeof nextState.solar === 'object') {
    setSolarState(nextState.solar, {persist:true, emit:false});
  }
  if (nextState.toggles && typeof nextState.toggles === 'object') {
    const t = nextState.toggles;
    if (typeof t.crashMatsEnabled === 'boolean') setCrashMatsEnabled(t.crashMatsEnabled);
    if (typeof t.polyRoofEnabled === 'boolean') setPolyRoofEnabled(t.polyRoofEnabled);
    if (typeof t.trainingRigEnabled === 'boolean') setTrainingRigEnabled(t.trainingRigEnabled);
    if (typeof t.trainingCabinetEnabled === 'boolean') setTrainingCabinetEnabled(t.trainingCabinetEnabled);
    if (typeof t.campusBoardEnabled === 'boolean') setCampusBoardEnabled(t.campusBoardEnabled);
    if (typeof t.conceptVolumesEnabled === 'boolean') setConceptVolumesEnabled(t.conceptVolumesEnabled);
    if (typeof t.officeEnabled === 'boolean') setOfficeEnabled(t.officeEnabled);
    if (typeof t.saunaEnabled === 'boolean') setSaunaEnabled(t.saunaEnabled);
    if (typeof t.outdoorKitchenEnabled === 'boolean') setOutdoorKitchenEnabled(t.outdoorKitchenEnabled);
    if (typeof t.texturesEnabled === 'boolean') setTexturesEnabled(t.texturesEnabled);
    if (typeof t.climbingHoldsEnabled === 'boolean') setClimbingHoldsEnabled(t.climbingHoldsEnabled);
    if (typeof t.environmentEnabled === 'boolean') setEnvironmentEnabled(t.environmentEnabled);
    if (typeof t.globalIlluminationQuality === 'string') {
      setGlobalIlluminationQuality(t.globalIlluminationQuality, {emit:false});
    }
    if (typeof t.globalIlluminationEnabled === 'boolean') {
      setGlobalIlluminationEnabled(t.globalIlluminationEnabled, {emit:false});
    }
  }
  if (nextState.camera && typeof saveCameraState === 'function') {
    saveCameraState(nextState.camera);
  }
  if (needsRebuild && rebuildScene) requestCoreRebuild([CORE_REBUILD_STAGE.GEOMETRY]);
  return true;
}

function syncAppStateFromCore(source='core') {
  if (!APP_STATE || typeof APP_STATE.patchState !== 'function') return false;
  APP_STATE.patchState(buildCoreAppStateSnapshot(), {emit: true, source});
  return true;
}

if (APP_STATE && typeof APP_STATE.registerLegacyAdapter === 'function') {
  APP_STATE.registerLegacyAdapter('core', {
    getSnapshot: buildCoreAppStateSnapshot,
    applySnapshot: applyCoreSnapshotToLegacy,
  });
}
if (APP_STATE && typeof APP_STATE.patchState === 'function') {
  APP_STATE.patchState(buildCoreAppStateSnapshot(), {emit: false, source: 'core:init'});
}
if (typeof window !== 'undefined') {
  window.syncAppStateFromCore = syncAppStateFromCore;
  window.getSolarState = getSolarState;
  window.setSolarState = setSolarState;
  window.setSolarTimeMinutes = setSolarTimeMinutes;
  window.saveSolarState = () => saveSolarState(solarState, {emit:true});
  window.applySolarLightingState = applySolarLightingState;
  window.getSolarMonth = () => getSolarMonth(solarState);
  window.setSolarMonth = setSolarMonth;
  window.setSolarPathPreviewVisible = setSolarPathPreviewVisible;
  window.setGlobalIlluminationEnabled = setGlobalIlluminationEnabled;
  window.setGlobalIlluminationQuality = setGlobalIlluminationQuality;
  window.getGlobalIlluminationQuality = () => globalIlluminationQuality;
  window.getGlobalIlluminationQualityLabels = () => ({...GI_QUALITY_LABELS});
  window.updateGlobalIlluminationFrame = updateGlobalIlluminationFrame;
  window.markGlobalIlluminationDirty = markGlobalIlluminationDirty;
}
