// --- Three.js Scene ---
const canvas = document.getElementById('c');
const wrap = document.getElementById('canvas-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x111111);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x111111, 20, 40);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(8, 5, 9);
camera.lookAt(2, 1.5, 1.5);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(6, 10, 6);
sun.castShadow = true;
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
const CRASH_MAT_THICKNESS = 0.30;

const WALL_STATE_STORAGE_KEY = 'climbingWall.wallState.v1';
const WALL_DEFAULT_STATE_STORAGE_KEY = 'climbingWall.defaultState.v1';
const CAMERA_STATE_STORAGE_KEY = 'climbingWall.cameraState.v1';
const CRASH_MATS_STORAGE_KEY = 'climbingWall.crashMats.v1';
const WALL_STATE_LIMITS = {
  aAngle: [0, 60], aWidth: [0.3, 2.5],
  bAngle: [0, 60], bWidth: [0.3, 2.5],
  cAngle: [0, 60], cWidth: [0.3, 2.5],
  dAngle: [0, 60], d1Height: [0.5, 2.7], d2Angle: [0, 75],
  eAngle: [-5, 60],
  f1Angle: [0, 40], f1Height: [2.0, 2.7], f1Width: [0.1, 1.0],
  f2Angle: [0, 75], f2WidthTop: [0.3, 4.0],
};

const BUILTIN_DEFAULT_WALL_STATE = Object.freeze({
  aAngle: 20, aWidth: 1.5,
  bAngle: 20,  bWidth: 1.1,
  cAngle: 20, cWidth: 1.6,
  dAngle: 10,
  d1Height: 2.0,
  d2Angle: 10,
  eAngle: 10,
  f1Angle: 20, f1Height: 2.0, f1Width: 1.0,
  f2Angle: 50, f2WidthTop: 1.3,
});

const BUILTIN_CAMERA_STATE = Object.freeze({
  theta: 0.9,
  phi: 0.55,
  radius: 12,
  targetX: 2,
  targetY: 1.5,
  targetZ: 1.5,
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
let crashMatsGroup = null;
let crashMatsEnabled = readStoredBool(CRASH_MATS_STORAGE_KEY, false);

function getActiveFloorY() {
  return crashMatsEnabled ? CRASH_MAT_THICKNESS : 0;
}

function updateScalePersonFloorOffset() {
  if (!scalePersonMesh || !scalePersonMesh.position) return;
  const yOffset = Number(scalePersonMesh.userData?.personYOffset);
  if (!Number.isFinite(yOffset)) return;
  scalePersonMesh.position.y = getActiveFloorY() + yOffset;
}

function setCrashMatsEnabled(enabled) {
  crashMatsEnabled = !!enabled;
  if (crashMatsGroup) crashMatsGroup.visible = crashMatsEnabled;
  updateScalePersonFloorOffset();
  persistStoredBool(CRASH_MATS_STORAGE_KEY, crashMatsEnabled);
}

// ── Materials ──
const claddingMat = new THREE.MeshLambertMaterial({ color: 0x3d3d3d, side: THREE.DoubleSide });

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
