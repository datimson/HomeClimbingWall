// --- Three.js Scene ---
const canvas = document.getElementById('c');
const wrap = document.getElementById('canvas-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x111111);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x111111, 20, 40);

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
const grid = new THREE.GridHelper(12, 24, 0x333333, 0x2a2a2a);
grid.position.set(2, 0, 1.75);
scene.add(grid);

// Dimensions (in metres)
const W = 4.0;       // x axis (back wall width)
const D = 3.5;       // z axis (room depth)
const H_fixed = 3.5; // fixed wall height
const H_adj = 4.0;   // adjustable panel total height
const thick = 0.08;
const KICK = 0.7;    // vertical kick height at base of all walls
const ROOF_PITCH_DEG = 5;
const ROOF_PITCH_TAN = Math.tan(THREE.MathUtils.degToRad(ROOF_PITCH_DEG));
const ROOF_CLADDING_THICKNESS = 0.06;
const CEILING_PLY_THICKNESS = 0.017;
const POLY_ROOF_THICKNESS = 0.012;
const POLY_ROOF_CLEARANCE = 0.15;
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
const WALL_STATE_LIMITS = {
  aAngle: [0, 60], aWidth: [0.3, 2.5],
  bAngle: [0, 60], bWidth: [0.3, 2.5],
  cAngle: [0, 60], cWidth: [0.3, 2.5],
  dAngle: [0, 60], d1Height: [0.5, 2.7], d2Angle: [0, 75],
  eAngle: [-5, 60],
  f1Angle: [0, 40], f1Height: [2.0, 2.7], f1Width: [0.1, 1.0],
  f2Angle: [0, 75], f2WidthTop: [0.3, 4.0],
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
scene.add(wallGroup);
let dimGroup  = new THREE.Group();
scene.add(dimGroup);
let labelGroup = new THREE.Group();
scene.add(labelGroup);
let hoverDimGroup = new THREE.Group();
scene.add(hoverDimGroup);
let hoverTargets = [];
let scalePersonBillboard = null;
let scalePersonMesh = null;
let scalePersonCompanionBillboard = null;
let scalePersonCompanionMesh = null;
let crashMatsGroup = null;
let crashMatsEnabled = readStoredBool(CRASH_MATS_STORAGE_KEY, true);
let polyRoofEnabled = readStoredBool(POLY_ROOF_STORAGE_KEY, true);
let trainingRigEnabled = readStoredBool(TRAINING_RIG_STORAGE_KEY, true);
let trainingCabinetEnabled = readStoredBool(TRAINING_CABINET_STORAGE_KEY, true);
let campusBoardEnabled = readStoredBool(CAMPUS_BOARD_STORAGE_KEY, true);
let conceptVolumesEnabled = readStoredBool(CONCEPT_VOLUMES_STORAGE_KEY, true);

function getActiveFloorY() {
  return crashMatsEnabled ? CRASH_MAT_THICKNESS : 0;
}

function updateScalePersonFloorOffset() {
  const people = [scalePersonMesh, scalePersonCompanionMesh];
  people.forEach(person => {
    if (!person || !person.position) return;
    const yOffset = Number(person.userData?.personYOffset);
    if (!Number.isFinite(yOffset)) return;
    person.position.y = getActiveFloorY() + yOffset;
  });
}

function setCrashMatsEnabled(enabled) {
  crashMatsEnabled = !!enabled;
  if (crashMatsGroup) crashMatsGroup.visible = crashMatsEnabled;
  updateScalePersonFloorOffset();
  persistStoredBool(CRASH_MATS_STORAGE_KEY, crashMatsEnabled);
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

// ── Materials ──
const claddingMat = new THREE.MeshLambertMaterial({ color: 0x3d3d3d, side: THREE.DoubleSide });
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
const conceptVolumeMat = new THREE.MeshLambertMaterial({ color: 0xb88f63, side: THREE.DoubleSide });
const conceptVolumeEdgeMat = new THREE.LineBasicMaterial({color: 0x7e5f3f});

function box(w, h, d, mat, rx=0,ry=0,rz=0, px=0,py=0,pz=0) {
  const g = new THREE.BoxGeometry(w,h,d), m = new THREE.Mesh(g,mat);
  m.rotation.set(rx,ry,rz); m.position.set(px,py,pz);
  m.castShadow=true; m.receiveShadow=true; return m;
}

// ── Per-wall clippable materials (one instance per wall) ──
const WALL_COLORS = {A:0x4a6741,B:0x4a6741,C:0x4a6741,D:0x4a6741,E:0xc87941,F:0x6a4174,G:0x2f76d2};
let wallMats = {};
function getWallMat(id) {
  if (!wallMats[id]) wallMats[id] = new THREE.MeshLambertMaterial({
    color: WALL_COLORS[id]||0x4a6741, side: THREE.DoubleSide,
    clippingPlanes:[], clipIntersection:false
  });
  return wallMats[id];
}
const ceilingGapMat = getWallMat('G');
// legacy aliases used by adj panel
const adjMat = getWallMat('E');

// ── Collision precedence ──
let precedence = ['A','B','C','D','E'];
