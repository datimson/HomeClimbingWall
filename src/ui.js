// --- Orbit controls ---
let isDragging = false;
let dragMode = 'orbit';
let lastX = 0, lastY = 0;
let theta = 0.9, phi = 0.55, radius = 12;
const ORBIT_MIN_POLAR = 0.05;
const ORBIT_MAX_POLAR = Math.PI - 0.05;
let targetX = 2, targetY = 1.7, targetZ = 1.5;
const DESKTOP_MOVE_SPEED_MPS = 2.2;
const DESKTOP_MOVE_RUN_MULT = 1.7;
const desktopMoveKeys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  fast: false,
};
const desktopForward = new THREE.Vector3();
const desktopRight = new THREE.Vector3();
const desktopMoveDelta = new THREE.Vector3();
const desktopUp = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();
const hoverMouse = new THREE.Vector2();
const hoverInfoEl = document.getElementById('hoverInfo');
const saveStatusEl = document.getElementById('saveStatus');
const reactivateCameraBtn = document.getElementById('reactivateCameraBtn');
const enterVrBtn = document.getElementById('enterVrBtn');
let activeHoverMesh = null;
let dimsAreFaded = false;
let sceneIsFaded = false;
let focusedMaterialEntries = [];
let activeFocusMesh = null;
let measurementTool = null;
const personLookAtTarget = new THREE.Vector3();
const xrRig = new THREE.Group();
xrRig.name = 'xrRig';
scene.add(xrRig);
xrRig.add(camera);

const initialCameraState = (typeof loadCameraState === 'function') ? loadCameraState() : null;
if (initialCameraState) {
  theta = initialCameraState.theta;
  phi = initialCameraState.phi;
  radius = initialCameraState.radius;
  targetX = initialCameraState.targetX;
  targetY = initialCameraState.targetY;
  targetZ = initialCameraState.targetZ;
}

function getCurrentCameraState() {
  return {theta, phi, radius, targetX, targetY, targetZ};
}

function persistCurrentCameraState() {
  if (typeof saveCameraState !== 'function') return false;
  return saveCameraState(getCurrentCameraState());
}

const CAMERA_CONTROLS_MODULE = (
  typeof window !== 'undefined' &&
  window.ClimbingWallCameraControls
) ? window.ClimbingWallCameraControls : null;
const cameraControlsUtils = (
  CAMERA_CONTROLS_MODULE &&
  typeof CAMERA_CONTROLS_MODULE.createCameraControlsUtils === 'function'
) ? CAMERA_CONTROLS_MODULE.createCameraControlsUtils({THREE}) : null;

const REBUILD_SCHEDULER_MODULE = (
  typeof window !== 'undefined' &&
  window.ClimbingWallRebuildScheduler
) ? window.ClimbingWallRebuildScheduler : null;
const rebuildScheduler = (
  REBUILD_SCHEDULER_MODULE &&
  typeof REBUILD_SCHEDULER_MODULE.createRebuildScheduler === 'function'
) ? REBUILD_SCHEDULER_MODULE.createRebuildScheduler({
  rebuildFn: (typeof rebuild === 'function') ? rebuild : null,
  invalidateFn: (typeof invalidateRebuildStages === 'function') ? invalidateRebuildStages : null,
  syncFn: (typeof window?.syncAppStateFromCore === 'function') ? window.syncAppStateFromCore : null,
  throttleMs: 40,
}) : null;
const UI_REBUILD_STAGE = Object.freeze(
  (rebuildScheduler && rebuildScheduler.stages) || {
    GEOMETRY: (typeof REBUILD_STAGE !== 'undefined' && REBUILD_STAGE?.GEOMETRY) ? REBUILD_STAGE.GEOMETRY : 'geometry',
    ANNOTATIONS: (typeof REBUILD_STAGE !== 'undefined' && REBUILD_STAGE?.ANNOTATIONS) ? REBUILD_STAGE.ANNOTATIONS : 'annotations',
    CRASH_MATS: (typeof REBUILD_STAGE !== 'undefined' && REBUILD_STAGE?.CRASH_MATS) ? REBUILD_STAGE.CRASH_MATS : 'crashMats',
  }
);
function requestRebuild(options={}) {
  if (rebuildScheduler && typeof rebuildScheduler.request === 'function') {
    rebuildScheduler.request(options);
    return;
  }
  if (typeof rebuild !== 'function') return;
  if (typeof invalidateRebuildStages === 'function') {
    const stages = Array.isArray(options?.stages) ? options.stages : null;
    if (stages && stages.length) invalidateRebuildStages(stages);
    else invalidateRebuildStages();
    rebuild({useDirty: true});
    return;
  }
  rebuild();
}

const DESIGN_SWITCHER = (
  typeof window !== 'undefined' &&
  window.ClimbingWallDesignSwitcher
) ? window.ClimbingWallDesignSwitcher : null;
const RUNTIME_DESIGN_SYSTEM = (
  DESIGN_SWITCHER &&
  typeof DESIGN_SWITCHER.getRuntimeDesignSystem === 'function'
) ? DESIGN_SWITCHER.getRuntimeDesignSystem() : (
  typeof window !== 'undefined' &&
  window.ClimbingWallDesignSystem
) ? window.ClimbingWallDesignSystem : null;

function getAvailableDesignDefs() {
  if (DESIGN_SWITCHER && typeof DESIGN_SWITCHER.getAvailableDesignDefs === 'function') {
    return DESIGN_SWITCHER.getAvailableDesignDefs();
  }
  if (!RUNTIME_DESIGN_SYSTEM || typeof RUNTIME_DESIGN_SYSTEM.listDesigns !== 'function') return [];
  const defs = RUNTIME_DESIGN_SYSTEM.listDesigns();
  return Array.isArray(defs) ? defs : [];
}

function getActiveDesignIdSafe() {
  if (DESIGN_SWITCHER && typeof DESIGN_SWITCHER.getActiveDesignIdSafe === 'function') {
    return DESIGN_SWITCHER.getActiveDesignIdSafe();
  }
  if (!RUNTIME_DESIGN_SYSTEM || typeof RUNTIME_DESIGN_SYSTEM.getActiveDesignId !== 'function') return 'classic';
  const id = RUNTIME_DESIGN_SYSTEM.getActiveDesignId();
  return (typeof id === 'string' && id) ? id : 'classic';
}

function switchDesignAndReload(designId) {
  if (DESIGN_SWITCHER && typeof DESIGN_SWITCHER.switchDesignAndReload === 'function') {
    return DESIGN_SWITCHER.switchDesignAndReload(designId, {
      syncAppStateFromCore: window?.syncAppStateFromCore,
      reloadDelayMs: 30,
    });
  }
  if (!RUNTIME_DESIGN_SYSTEM || typeof RUNTIME_DESIGN_SYSTEM.setActiveDesignId !== 'function') return false;
  const next = String(designId || '').trim();
  if (!next) return false;
  if (next === getActiveDesignIdSafe()) return true;
  const ok = RUNTIME_DESIGN_SYSTEM.setActiveDesignId(next);
  if (!ok) return false;
  if (typeof window?.syncAppStateFromCore === 'function') {
    window.syncAppStateFromCore('ui:design:switch');
  }
  window.setTimeout(() => window.location.reload(), 30);
  return true;
}

const MEASUREMENT_TOOL_MODULE = (
  typeof window !== 'undefined' &&
  window.ClimbingWallMeasurementTool
) ? window.ClimbingWallMeasurementTool : null;

if (MEASUREMENT_TOOL_MODULE && typeof MEASUREMENT_TOOL_MODULE.createMeasurementTool === 'function') {
  measurementTool = MEASUREMENT_TOOL_MODULE.createMeasurementTool({
    THREE,
    scene,
    renderer,
    camera,
    addDim,
    dimLine3,
    designSystem: RUNTIME_DESIGN_SYSTEM,
    getActiveDesignIdSafe,
    appState: window?.ClimbingWallAppState,
    getRoots: () => {
      const roots = [];
      if (wallGroup) roots.push(wallGroup);
      if (crashMatsGroup?.visible) roots.push(crashMatsGroup);
      if (environmentGroup?.visible) roots.push(environmentGroup);
      return roots;
    },
  });
}

const VR_MENU_MODULE = (
  typeof window !== 'undefined' &&
  window.ClimbingWallVrMenu
) ? window.ClimbingWallVrMenu : null;
const vrMenuToolkit = (
  VR_MENU_MODULE &&
  typeof VR_MENU_MODULE.createVrMenuToolkit === 'function'
) ? VR_MENU_MODULE.createVrMenuToolkit({THREE}) : null;

const XR_FLOOR_EYE_HEIGHT = 1.72;
const XR_MIN_EYE_HEIGHT = 1.20;
const XR_MAX_EYE_HEIGHT = 2.25;
const XR_USER_HEIGHT_STORAGE_KEY = 'climbingWall.vrUserHeight.v1';
const XR_MOVE_SPEED_MPS = 1.9;
const XR_FLY_SPEED_MPS = 1.7;
const XR_CONTROLLER_VISUAL_OPACITY = 0.42;
const XR_STICK_DEADZONE = 0.16;
const XR_STICK_CLICK_BUTTON_INDEX = 3;
const XR_MENU_BUTTON_INDICES = Object.freeze([5, 4]);
const XR_TELEPORT_MAX_DISTANCE = 20;
const XR_TELEPORT_SURFACE_EPS = 0.012;
const XR_FLOOR_SWITCH_HYSTERESIS = 0.06;
const XR_RAY_COLOR_IDLE = 0xb8dfff;
const XR_RAY_COLOR_TELEPORT = 0x4dc7ff;
const XR_RAY_COLOR_INTERACTIVE = 0xffc86a;
const XR_MOVE_MODE = Object.freeze({
  GROUNDED: 'grounded',
  FLY: 'fly',
});
const XR_SESSION_OPTIONS = Object.freeze({
  optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
});
let xrSessionActive = false;
let xrRestoreCameraState = null;
let xrEntryStartPos = null;
let xrEntryForward = null;
let xrNeedsYawAlignment = false;
let xrSupportChecked = false;
let xrSupported = false;
let xrSessionRequestInFlight = false;
let xrMoveMode = XR_MOVE_MODE.GROUNDED;
let xrGroundFloorY = 0;
let xrActiveControllerIndex = 0;
let xrNeedsGroundSnap = false;
let xrStandingEyeHeight = loadStoredVrUserHeight();
const xrControllers = [];
let xrControllersReady = false;
const xrForward = new THREE.Vector3();
const xrRight = new THREE.Vector3();
const xrMoveDelta = new THREE.Vector3();
const xrUp = new THREE.Vector3(0, 1, 0);
const xrRayOrigin = new THREE.Vector3();
const xrRayDir = new THREE.Vector3();
const xrRaycastHit = new THREE.Vector3();
const xrHeadWorld = new THREE.Vector3();
const xrHeadLocal = new THREE.Vector3();
const xrRayPlane = new THREE.Plane();
const xrRay = new THREE.Ray();
const xrRayMatrix = new THREE.Matrix4();
const xrRigInvMatrix = new THREE.Matrix4();
const xrRaycaster = new THREE.Raycaster();
const xrStartWorld = new THREE.Vector3();
const xrDesktopForward = new THREE.Vector3();
const xrCurrentForward = new THREE.Vector3();
const xrMenuRaycaster = new THREE.Raycaster();
const XR_QUEST_CONTROLLER_URLS = Object.freeze({
  left: 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/oculus-touch-v3/left.glb',
  right: 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/oculus-touch-v3/right.glb',
});
const XRControllerModelFactoryCtor = (
  (typeof THREE !== 'undefined' && typeof THREE.XRControllerModelFactory === 'function')
    ? THREE.XRControllerModelFactory
    : ((typeof window !== 'undefined' && typeof window.XRControllerModelFactory === 'function')
      ? window.XRControllerModelFactory
      : null)
);
const xrControllerModelFactory = XRControllerModelFactoryCtor ? new XRControllerModelFactoryCtor() : null;
const GLTFLoaderCtor = (
  (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader === 'function')
    ? THREE.GLTFLoader
    : ((typeof window !== 'undefined' && typeof window.GLTFLoader === 'function')
      ? window.GLTFLoader
      : null)
);
const xrControllerGltfLoader = GLTFLoaderCtor ? new GLTFLoaderCtor() : null;
const xrQuestControllerModelTemplates = {left: null, right: null};
const xrQuestControllerModelPromises = {left: null, right: null};
const eSweepAnim = {
  active: false,
  speedDegPerSec: 16,
  dir: 1,
  minDeg: -5,
  maxDeg: 60,
};
const rigToggleAnim = {
  targetDeg: null,
  speedDegPerSec: 150,
  rebuildStepDeg: 0.8,
  lastRebuildDeg: NaN,
};
const xrTeleportMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.14, 0.20, 40),
  new THREE.MeshBasicMaterial({
    color: 0x4dc7ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
  })
);
xrTeleportMarker.rotation.x = -Math.PI * 0.5;
xrTeleportMarker.visible = false;
scene.add(xrTeleportMarker);

const VR_MENU_SLIDERS = Object.freeze({
  roomWidth: {label: 'Width', step: 0.05, min: WALL_GEOMETRY_STATE_LIMITS.width[0], max: WALL_GEOMETRY_STATE_LIMITS.width[1], fmt: v => `${v.toFixed(2)}m`},
  roomDepth: {label: 'Depth', step: 0.05, min: WALL_GEOMETRY_STATE_LIMITS.depth[0], max: WALL_GEOMETRY_STATE_LIMITS.depth[1], fmt: v => `${v.toFixed(2)}m`},
  fixedHeight: {label: 'Fixed H', step: 0.05, min: WALL_GEOMETRY_STATE_LIMITS.fixedHeight[0], max: WALL_GEOMETRY_STATE_LIMITS.fixedHeight[1], fmt: v => `${v.toFixed(2)}m`},
  adjHeight: {label: 'Adj H', step: 0.05, min: WALL_GEOMETRY_STATE_LIMITS.adjustableHeight[0], max: WALL_GEOMETRY_STATE_LIMITS.adjustableHeight[1], fmt: v => `${v.toFixed(2)}m`},
  userHeight: {label: 'User H', step: 0.01, min: XR_MIN_EYE_HEIGHT, max: XR_MAX_EYE_HEIGHT, fmt: v => `${v.toFixed(2)}m`},
  aAngle: {label: 'A Angle', step: 1, min: 0, max: 60, fmt: v => `${Math.round(v)}°`},
  aWidth: {label: 'A Width', step: 0.05, min: 0.3, max: 2.5, fmt: v => `${v.toFixed(2)}m`},
  bAngle: {label: 'B Angle', step: 1, min: 0, max: 60, fmt: v => `${Math.round(v)}°`},
  bWidth: {label: 'B Width', step: 0.05, min: 0.3, max: 2.5, fmt: v => `${v.toFixed(2)}m`},
  cAngle: {label: 'C Angle', step: 1, min: 0, max: 60, fmt: v => `${Math.round(v)}°`},
  cWidth: {label: 'C Width', step: 0.05, min: 0.3, max: 2.5, fmt: v => `${v.toFixed(2)}m`},
  dAngle: {label: 'D1 Angle', step: 1, min: 0, max: 60, fmt: v => `${Math.round(v)}°`},
  d1Height: {label: 'D1 Height', step: 0.05, min: 0.5, max: 2.7, fmt: v => `${v.toFixed(2)}m`},
  d2Angle: {label: 'D2 Angle', step: 1, min: 0, max: 75, fmt: v => `${Math.round(v)}°`},
  eAngle: {label: 'E Angle', step: 1, min: -5, max: 60, fmt: v => `${Math.round(v)}°`},
  f1Angle: {label: 'F1 Angle', step: 1, min: 0, max: 40, fmt: v => `${Math.round(v)}°`},
  f1Height: {label: 'F1 Height', step: 0.05, min: 2.0, max: 2.7, fmt: v => `${v.toFixed(2)}m`},
  f1Width: {label: 'F1 Width', step: 0.05, min: 0.1, max: WALL_STATE_LIMITS.f1Width[1], fmt: v => `${v.toFixed(2)}m`},
  f2Angle: {label: 'F2 Angle', step: 1, min: 0, max: 75, fmt: v => `${Math.round(v)}°`},
  f2WidthTop: {label: 'F2 Width', step: 0.05, min: 0.3, max: W, fmt: v => `${v.toFixed(2)}m`},
  rigOpen: {label: 'Rig Open', step: 5, min: 0, max: 180, fmt: v => `${Math.round(v)}°`},
});

const VR_MENU_TARGET_KEYS = Object.freeze({
  S: ['roomWidth', 'roomDepth', 'fixedHeight', 'adjHeight', 'userHeight'],
  A: ['aAngle', 'aWidth'],
  B: ['bAngle', 'bWidth'],
  C: ['cAngle', 'cWidth'],
  D: ['dAngle', 'd1Height', 'd2Angle'],
  E: ['eAngle'],
  F: ['f1Angle', 'f1Height', 'f1Width', 'f2Angle', 'f2WidthTop'],
  R: ['rigOpen'],
  G: [],
});

const VR_GEOMETRY_KEY_MAP = Object.freeze({
  roomWidth: 'width',
  roomDepth: 'depth',
  fixedHeight: 'fixedHeight',
  adjHeight: 'adjustableHeight',
});

const VR_MENU_CONSTANTS = (
  vrMenuToolkit &&
  vrMenuToolkit.constants
) ? vrMenuToolkit.constants : Object.freeze({
  BG_COLOR: 0xd7dce2,
  TEXT_COLOR: '#2f3338',
  TEXT_DARK_COLOR: '#21262b',
  TRACK_COLOR: 0x9aa5b0,
  FILL_COLOR: 0x5f7183,
  KNOB_COLOR: 0x2f3338,
  CLOSE_COLOR: 0xbac2ca,
  CLOSE_HOVER_COLOR: 0x90a4b9,
  TRACK_HOVER_COLOR: 0xb8a17c,
  FILL_HOVER_COLOR: 0x8f7450,
  KNOB_HOVER_COLOR: 0xf0cf98,
  NUDGE_COLOR: 0xb7c0c9,
  CURSOR_COLOR: 0x000000,
  CURSOR_RADIUS: 0.003,
  CURSOR_OFFSET: 0.008,
  GRAB_RADIUS_SPEED: 1.20,
  DISTANCE: 0.52,
  SIDE_OFFSET: 0.18,
  DOWN_OFFSET: -0.18,
  SCALE: 0.66,
  BASE_WIDTH: 0.90,
  ROW_HEIGHT: 0.095,
  PADDING_X: 0.08,
  PADDING_Y: 0.05,
  RENDER_ORDER_BUMP: 100000,
});
const VR_MENU_BG_COLOR = VR_MENU_CONSTANTS.BG_COLOR;
const VR_MENU_TEXT_COLOR = VR_MENU_CONSTANTS.TEXT_COLOR;
const VR_MENU_TEXT_DARK_COLOR = VR_MENU_CONSTANTS.TEXT_DARK_COLOR;
const VR_MENU_TRACK_COLOR = VR_MENU_CONSTANTS.TRACK_COLOR;
const VR_MENU_FILL_COLOR = VR_MENU_CONSTANTS.FILL_COLOR;
const VR_MENU_KNOB_COLOR = VR_MENU_CONSTANTS.KNOB_COLOR;
const VR_MENU_CLOSE_COLOR = VR_MENU_CONSTANTS.CLOSE_COLOR;
const VR_MENU_CLOSE_HOVER_COLOR = VR_MENU_CONSTANTS.CLOSE_HOVER_COLOR;
const VR_MENU_TRACK_HOVER_COLOR = VR_MENU_CONSTANTS.TRACK_HOVER_COLOR;
const VR_MENU_FILL_HOVER_COLOR = VR_MENU_CONSTANTS.FILL_HOVER_COLOR;
const VR_MENU_KNOB_HOVER_COLOR = VR_MENU_CONSTANTS.KNOB_HOVER_COLOR;
const VR_MENU_NUDGE_COLOR = VR_MENU_CONSTANTS.NUDGE_COLOR;
const VR_MENU_CURSOR_COLOR = VR_MENU_CONSTANTS.CURSOR_COLOR;
const VR_MENU_CURSOR_RADIUS = VR_MENU_CONSTANTS.CURSOR_RADIUS;
const VR_MENU_CURSOR_OFFSET = VR_MENU_CONSTANTS.CURSOR_OFFSET;
const VR_MENU_GRAB_RADIUS_SPEED = VR_MENU_CONSTANTS.GRAB_RADIUS_SPEED;
const VR_MENU_DISTANCE = VR_MENU_CONSTANTS.DISTANCE;
const VR_MENU_SIDE_OFFSET = VR_MENU_CONSTANTS.SIDE_OFFSET;
const VR_MENU_DOWN_OFFSET = VR_MENU_CONSTANTS.DOWN_OFFSET;
const VR_MENU_SCALE = VR_MENU_CONSTANTS.SCALE;
const VR_MENU_BASE_WIDTH = VR_MENU_CONSTANTS.BASE_WIDTH;
const VR_MENU_ROW_HEIGHT = VR_MENU_CONSTANTS.ROW_HEIGHT;
const VR_MENU_PADDING_X = VR_MENU_CONSTANTS.PADDING_X;
const VR_MENU_PADDING_Y = VR_MENU_CONSTANTS.PADDING_Y;
const VR_MENU_RENDER_ORDER_BUMP = VR_MENU_CONSTANTS.RENDER_ORDER_BUMP;
const XR_MENU_WORLD_CLICK_SUPPRESS_MS = 260;

const vrQuickMenu = {
  group: null,
  target: null,
  closeBtn: null,
  interactive: [],
  slidersByKey: {},
  hoveredKey: null,
  closeHovered: false,
  open: false,
};
const vrMenuDrag = {
  active: false,
  controllerIndex: -1,
  key: null,
};
const vrMenuMove = {
  active: false,
  controllerIndex: -1,
  hitDistance: VR_MENU_DISTANCE,
  orbitRadius: VR_MENU_DISTANCE,
  orbitHeightOffset: VR_MENU_DOWN_OFFSET,
  grabPointY: 0,
};
const vrMenuMoveWorldPoint = new THREE.Vector3();
const vrMenuMoveHeadPos = new THREE.Vector3();
const vrMenuMoveHoriz = new THREE.Vector3();
const vrMenuCursorToHead = new THREE.Vector3();
const vrMenuFaceDir = new THREE.Vector3();
const vrMenuFaceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const vrMenuCursorOverlayGroup = new THREE.Group();
vrMenuCursorOverlayGroup.renderOrder = VR_MENU_RENDER_ORDER_BUMP + 950000;
scene.add(vrMenuCursorOverlayGroup);
const vrMenuManager = (
  VR_MENU_MODULE &&
  typeof VR_MENU_MODULE.createVrMenuManager === 'function'
) ? VR_MENU_MODULE.createVrMenuManager({
  THREE,
  scene,
  renderer,
  camera,
  toolkit: vrMenuToolkit,
  constants: VR_MENU_CONSTANTS,
  sliderDefs: VR_MENU_SLIDERS,
  targetKeys: VR_MENU_TARGET_KEYS,
  geometryKeyMap: VR_GEOMETRY_KEY_MAP,
  quickMenuState: vrQuickMenu,
  menuDragState: vrMenuDrag,
  menuMoveState: vrMenuMove,
  getWallState: () => wallState,
  getWallGeometryState: () => wallGeometryState,
  getAvailableDesignDefs: () => getAvailableDesignDefs(),
  getActiveDesignIdSafe: () => getActiveDesignIdSafe(),
  switchDesignAndReload: (designId) => switchDesignAndReload(designId),
  setWallGeometryValue: (key, value, opts) => setWallGeometryValue(key, value, opts),
  syncGeometrySlidersFromState: () => syncGeometrySlidersFromState(),
  syncSlidersFromState: () => syncSlidersFromState(),
  clampWallStateValue: (key, value) => clampWallStateValue(key, value),
  setAdjAngle: (value) => setAdjAngle(value),
  setEAngleValue: (value) => setEAngleValue(value),
  setRigOpenValue: (value, rebuildNow=true) => setRigOpenValue(value, rebuildNow),
  requestRebuild: (opts) => requestRebuild(opts),
  rebuildStageGeometry: UI_REBUILD_STAGE.GEOMETRY,
  stopESweep: () => { eSweepAnim.active = false; },
  resetRigToggle: () => {
    rigToggleAnim.targetDeg = null;
    rigToggleAnim.lastRebuildDeg = NaN;
  },
  syncAppState: (reason) => {
    if (typeof window?.syncAppStateFromCore === 'function') {
      window.syncAppStateFromCore(reason);
    }
  },
  getXrStandingEyeHeight: () => getXrStandingEyeHeight(),
  setXrStandingEyeHeight: (value, opts) => setXrStandingEyeHeight(value, opts),
  recalcXrStandingEyeHeightFromHead: () => recalcXrStandingEyeHeightFromHead(),
  getMeasurementSettings: () => (
    measurementTool && typeof measurementTool.getSettings === 'function'
      ? measurementTool.getSettings()
      : null
  ),
  setMeasurementSetting: (key, value) => {
    if (!measurementTool || typeof measurementTool.setSetting !== 'function') return;
    measurementTool.setSetting(key, value);
  },
  clearMeasurements: (opts) => {
    if (!measurementTool || typeof measurementTool.clearAll !== 'function') return;
    measurementTool.clearAll(opts);
  },
  syncMeasureUi: () => syncMeasureToggleUi(),
  readControllerWorldRay: (controller) => readControllerWorldRay(controller),
  getRayOrigin: () => xrRayOrigin,
  getRayDirection: () => xrRayDir,
  getControllers: () => xrControllers,
  readPrimaryStick: (inputSource) => readPrimaryStick(inputSource),
  applyStickDeadzone: (value) => applyStickDeadzone(value),
  teleportMaxDistance: XR_TELEPORT_MAX_DISTANCE,
  menuWorldClickSuppressMs: XR_MENU_WORLD_CLICK_SUPPRESS_MS,
  menuButtonIndices: XR_MENU_BUTTON_INDICES,
  upVector: xrUp,
}) : null;
const vrMenuInteractionController = (
  VR_MENU_MODULE &&
  typeof VR_MENU_MODULE.createVrMenuController === 'function'
) ? VR_MENU_MODULE.createVrMenuController({
  getControllers: () => xrControllers,
  isSessionActive: () => xrSessionActive,
  setActiveControllerIndex: (index) => { xrActiveControllerIndex = index; },
  readControllerWorldRay: (controller) => readControllerWorldRay(controller),
  isMenuOpen: () => !!vrQuickMenu.open,
  getMenuInteractiveHit: () => getVrMenuInteractiveHit(),
  handleMenuSelect: (hit, controllerIndex, preferDrag) => handleVrMenuSelect(hit, controllerIndex, preferDrag),
  suppressWorldSelectOnce: (state) => suppressVrWorldSelectOnce(state),
  endMenuDrag: (controllerIndex) => endVrMenuDrag(controllerIndex),
  beginMenuMove: (controllerIndex, hitPoint, hitDistance) => beginVrMenuMove(controllerIndex, hitPoint, hitDistance),
  endMenuMove: (controllerIndex) => endVrMenuMove(controllerIndex),
  isMenuMoveOwnedBy: (controllerIndex) => (
    vrMenuManager && typeof vrMenuManager.isMoveOwnedBy === 'function'
      ? !!vrMenuManager.isMoveOwnedBy(controllerIndex)
      : !!(vrMenuMove.active && vrMenuMove.controllerIndex === controllerIndex)
  ),
  cancelMenuDragIfInactive: () => {
    if (vrMenuManager && typeof vrMenuManager.cancelDragIfInactive === 'function') {
      return !!vrMenuManager.cancelDragIfInactive();
    }
    if (!vrMenuDrag.active) return false;
    const state = xrControllers.find(s => s.index === vrMenuDrag.controllerIndex);
    if (!state?.connected) {
      endVrMenuDrag();
      return true;
    }
    return false;
  },
  cancelMenuMoveIfInactive: () => {
    if (vrMenuManager && typeof vrMenuManager.cancelMoveIfInactive === 'function') {
      return !!vrMenuManager.cancelMoveIfInactive();
    }
    if (!vrMenuMove.active) return false;
    if (!vrQuickMenu.open || !vrQuickMenu.group) {
      endVrMenuMove();
      return true;
    }
    const state = xrControllers.find(s => s.index === vrMenuMove.controllerIndex);
    if (!state?.connected) {
      endVrMenuMove();
      return true;
    }
    return false;
  },
  consumeWorldSelectSuppression: (state) => (
    vrMenuManager && typeof vrMenuManager.consumeWorldSelectSuppression === 'function'
      ? !!vrMenuManager.consumeWorldSelectSuppression(state)
      : consumeVrWorldSelectSuppression(state)
  ),
  readMenuButtonPressed: (state) => {
    if (vrMenuManager && typeof vrMenuManager.readMenuButtonPressed === 'function') {
      return !!vrMenuManager.readMenuButtonPressed(state);
    }
    if (!state?.connected || state.handedness !== 'left') return false;
    const buttons = state.inputSource?.gamepad?.buttons;
    if (!buttons?.length) return false;
    for (let i = 0; i < XR_MENU_BUTTON_INDICES.length; i++) {
      const idx = XR_MENU_BUTTON_INDICES[i];
      if (buttons[idx]?.pressed) return true;
    }
    return false;
  },
  clearMenu: () => (
    vrMenuManager && typeof vrMenuManager.clear === 'function'
      ? vrMenuManager.clear()
      : clearVrQuickMenu()
  ),
  buildMenu: (target) => (
    vrMenuManager && typeof vrMenuManager.build === 'function'
      ? !!vrMenuManager.build(target)
      : buildVrQuickMenu(target)
  ),
}) : null;

function makeVrTextPlane(text, width=0.46, height=0.11, style={}) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.makeTextPlane !== 'function') return null;
  return vrMenuToolkit.makeTextPlane(text, width, height, style);
}

function updateVrTextPlane(mesh, text) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.updateTextPlane !== 'function') return;
  vrMenuToolkit.updateTextPlane(mesh, text);
}

function makeVrMenuButton(label, width=0.17, height=0.08, color=0xbec5cc) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.makeButton !== 'function') return null;
  return vrMenuToolkit.makeButton(label, width, height, color);
}

function makeVrMenuCursor() {
  if (!vrMenuToolkit || typeof vrMenuToolkit.makeCursor !== 'function') return new THREE.Group();
  return vrMenuToolkit.makeCursor();
}

function enforceVrMenuOverlay(root) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.enforceOverlay !== 'function') return;
  vrMenuToolkit.enforceOverlay(root);
}

function setVrMenuSliderHoverKey(key=null) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.setSliderHoverKey !== 'function') return;
  vrMenuToolkit.setSliderHoverKey(vrQuickMenu, key);
}

function setVrMenuCloseHover(active=false) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.setCloseHover !== 'function') return;
  vrMenuToolkit.setCloseHover(vrQuickMenu, active);
}

function orientVrMenuTowardWorldPoint(worldPoint) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.orientTowardWorldPoint !== 'function') return;
  vrMenuToolkit.orientTowardWorldPoint(vrQuickMenu, worldPoint, vrMenuFaceDir, vrMenuFaceEuler);
}

function quantizeVrSliderValue(def, value) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.quantizeSliderValue !== 'function') {
    const min = Number(def?.min) || 0;
    const max = Number(def?.max) || min;
    return THREE.MathUtils.clamp(Number(value) || min, min, max);
  }
  return vrMenuToolkit.quantizeSliderValue(def, value);
}

function updateVrMenuSliderVisual(slider, value) {
  if (!vrMenuToolkit || typeof vrMenuToolkit.updateSliderVisual !== 'function') return;
  vrMenuToolkit.updateSliderVisual(slider, value);
}

function getVrMenuCurrentValue(key, def) {
  if (vrMenuManager && typeof vrMenuManager.getCurrentValue === 'function') {
    return vrMenuManager.getCurrentValue(key, def);
  }
  const geometryKey = VR_GEOMETRY_KEY_MAP[key];
  if (geometryKey) {
    const raw = Number(wallGeometryState[geometryKey]);
    return Number.isFinite(raw) ? raw : def.min;
  }
  if (key === 'userHeight') return getXrStandingEyeHeight();
  const raw = Number(wallState[key]);
  return Number.isFinite(raw) ? raw : def.min;
}

function refreshVrQuickMenuValues() {
  if (vrMenuManager && typeof vrMenuManager.refreshValues === 'function') {
    vrMenuManager.refreshValues();
    return;
  }
  if (!vrQuickMenu.open) return;
  Object.keys(vrQuickMenu.slidersByKey || {}).forEach(key => {
    const slider = vrQuickMenu.slidersByKey[key];
    if (!slider) return;
    updateVrMenuSliderVisual(slider, getVrMenuCurrentValue(key, slider.def));
  });
}

function clearVrQuickMenu() {
  if (vrMenuManager && typeof vrMenuManager.clear === 'function') {
    vrMenuManager.clear();
    return;
  }
  vrMenuDrag.active = false;
  vrMenuDrag.controllerIndex = -1;
  vrMenuDrag.key = null;
  vrMenuMove.active = false;
  vrMenuMove.controllerIndex = -1;
  vrMenuMove.hitDistance = VR_MENU_DISTANCE;
  vrMenuMove.orbitRadius = VR_MENU_DISTANCE;
  vrMenuMove.orbitHeightOffset = VR_MENU_DOWN_OFFSET;
  vrMenuMove.grabPointY = 0;
  if (!vrQuickMenu.group) {
    vrQuickMenu.closeBtn = null;
    vrQuickMenu.interactive = [];
    vrQuickMenu.slidersByKey = {};
    vrQuickMenu.hoveredKey = null;
    vrQuickMenu.closeHovered = false;
    vrQuickMenu.target = null;
    vrQuickMenu.open = false;
    return;
  }
  if (vrQuickMenu.group.parent) vrQuickMenu.group.parent.remove(vrQuickMenu.group);
  else scene.remove(vrQuickMenu.group);
  vrQuickMenu.group.traverse(obj => {
    if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    mats.forEach(mat => {
      if (!mat) return;
      if (mat.map && typeof mat.map.dispose === 'function') mat.map.dispose();
      if (typeof mat.dispose === 'function') mat.dispose();
    });
  });
  vrQuickMenu.group = null;
  vrQuickMenu.closeBtn = null;
  vrQuickMenu.interactive = [];
  vrQuickMenu.slidersByKey = {};
  vrQuickMenu.hoveredKey = null;
  vrQuickMenu.closeHovered = false;
  vrQuickMenu.target = null;
  vrQuickMenu.open = false;
}

function resolveVrMenuTarget(info) {
  if (vrMenuManager && typeof vrMenuManager.resolveTarget === 'function') {
    return vrMenuManager.resolveTarget(info);
  }
  if (!info) return null;
  if (info.hoverKind === 'trainingRig' || info.wall === 'R') return 'R';
  const id = String(info.wall || '').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(VR_MENU_TARGET_KEYS, id)) return id;
  return null;
}

function vrMenuTitleForTarget(target) {
  if (vrMenuManager && typeof vrMenuManager.titleForTarget === 'function') {
    return vrMenuManager.titleForTarget(target);
  }
  if (target === 'S') return 'Wall Size';
  if (target === 'R') return 'Training Rig';
  return `Wall ${target}`;
}

function getVrMenuDesignDefs() {
  if (vrMenuManager && typeof vrMenuManager.getDesignDefs === 'function') {
    return vrMenuManager.getDesignDefs();
  }
  const defs = getAvailableDesignDefs();
  if (defs.length) return defs;
  return [{id: getActiveDesignIdSafe(), label: getActiveDesignIdSafe(), status: 'active'}];
}

function applyVrMenuStateKey(key, nextValue) {
  if (vrMenuManager && typeof vrMenuManager.applyStateKey === 'function') {
    vrMenuManager.applyStateKey(key, nextValue);
    return;
  }
  const def = VR_MENU_SLIDERS[key];
  if (!def) return;
  const clamped = quantizeVrSliderValue(def, nextValue);
  const geometryKey = VR_GEOMETRY_KEY_MAP[key];
  const current = quantizeVrSliderValue(def, getVrMenuCurrentValue(key, def));
  if (Math.abs(clamped - current) < Math.max(1e-6, (Number(def.step) || 0) * 0.25)) return;

  if (geometryKey) {
    setWallGeometryValue(geometryKey, clamped, {rebuildScene: true, persistState: true});
    syncGeometrySlidersFromState();
    syncSlidersFromState();
    refreshVrQuickMenuValues();
    return;
  }

  if (key === 'userHeight') {
    setXrStandingEyeHeight(clamped, {persist: true, applyGroundSnap: true});
    refreshVrQuickMenuValues();
    return;
  }

  if (key === 'eAngle') {
    eSweepAnim.active = false;
    setEAngleValue(clamped);
    requestRebuild({stages: [UI_REBUILD_STAGE.GEOMETRY]});
    return;
  }

  if (key === 'rigOpen') {
    rigToggleAnim.targetDeg = null;
    rigToggleAnim.lastRebuildDeg = NaN;
    setRigOpenValue(clamped, true);
    if (typeof window?.syncAppStateFromCore === 'function') {
      window.syncAppStateFromCore('ui:vr:rigOpen');
    }
    refreshVrQuickMenuValues();
    return;
  }

  wallState[key] = (typeof clampWallStateValue === 'function') ? clampWallStateValue(key, clamped) : clamped;
  if (key === 'eAngle' && typeof setAdjAngle === 'function') setAdjAngle(wallState.eAngle);
  syncSlidersFromState();
  requestRebuild({stages: [UI_REBUILD_STAGE.GEOMETRY]});
  refreshVrQuickMenuValues();
}

function placeVrQuickMenuDashboard() {
  if (vrMenuManager && typeof vrMenuManager.placeDashboard === 'function') {
    vrMenuManager.placeDashboard();
    return;
  }
  if (!vrQuickMenu.group) return;
  const xrCam = renderer.xr.getCamera(camera);
  if (!xrCam) return;
  xrCam.updateMatrixWorld(true);

  const camPos = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
  const fwd = new THREE.Vector3();
  xrCam.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
  else fwd.normalize();

  const right = new THREE.Vector3().crossVectors(fwd, xrUp);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();

  const pos = camPos.clone()
    .add(fwd.multiplyScalar(VR_MENU_DISTANCE))
    .add(right.multiplyScalar(VR_MENU_SIDE_OFFSET));
  pos.y += VR_MENU_DOWN_OFFSET;

  if (vrQuickMenu.group.parent !== scene) {
    if (vrQuickMenu.group.parent) vrQuickMenu.group.parent.remove(vrQuickMenu.group);
    scene.add(vrQuickMenu.group);
  }
  vrQuickMenu.group.position.copy(pos);
  orientVrMenuTowardWorldPoint(camPos);
  vrQuickMenu.group.scale.set(VR_MENU_SCALE, VR_MENU_SCALE, VR_MENU_SCALE);
  vrQuickMenu.group.updateMatrixWorld(true);
}

function buildVrQuickMenu(target) {
  if (vrMenuManager && typeof vrMenuManager.build === 'function') {
    return !!vrMenuManager.build(target);
  }
  const keys = VR_MENU_TARGET_KEYS[target];
  if (!keys) return false;
  clearVrQuickMenu();

  const width = VR_MENU_BASE_WIDTH;
  const rowH = VR_MENU_ROW_HEIGHT;
  const hasHeightRecalc = target === 'S';
  const hasMeasureControls = target === 'S' && !!measurementTool;
  const designDefs = target === 'S' ? getVrMenuDesignDefs().filter(def => !!def?.id) : [];
  const hasDesignSwitcher = target === 'S' && designDefs.length > 1;
  const sliderRows = keys.length;
  const extraRows = (hasHeightRecalc ? 1 : 0) + (hasDesignSwitcher ? 1 : 0) + (hasMeasureControls ? 1 : 0);
  const hasRows = (sliderRows + extraRows) > 0;
  const height = hasRows ? (0.20 + (sliderRows + extraRows) * rowH) : 0.28;
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const innerLeft = -halfW + VR_MENU_PADDING_X;
  const innerRight = halfW - VR_MENU_PADDING_X;
  const innerWidth = Math.max(0.25, innerRight - innerLeft);
  const closeW = 0.13;
  const closeH = 0.058;
  const closeGap = 0.03;

  const group = new THREE.Group();
  group.renderOrder = 2090;
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color: VR_MENU_BG_COLOR,
      transparent: false,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  bg.renderOrder = 2090;
  bg.userData.vrMenuAction = {type: 'block'};
  group.add(bg);

  const titleWidth = Math.max(0.22, innerWidth - closeW - closeGap);
  const title = makeVrTextPlane(vrMenuTitleForTarget(target), titleWidth, 0.09, {
    color: VR_MENU_TEXT_DARK_COLOR,
    fontPx: 48,
    fontWeight: '700',
    align: 'left',
    padding: 20,
  });
  title.position.set(innerLeft + (titleWidth * 0.5), halfH - VR_MENU_PADDING_Y - 0.02, 0.004);
  group.add(title);

  const closeBtn = makeVrMenuButton('Close', closeW, closeH, VR_MENU_CLOSE_COLOR);
  closeBtn.position.set(innerRight - (closeW * 0.5), halfH - VR_MENU_PADDING_Y - 0.02, 0.003);
  closeBtn.userData.vrMenuAction = {type: 'close'};
  group.add(closeBtn);

  const interactive = [bg, closeBtn];
  const slidersByKey = {};
  if (hasRows) {
    const labelW = Math.max(0.18, Math.min(0.24, innerWidth * 0.33));
    const valueW = Math.max(0.13, Math.min(0.17, innerWidth * 0.22));
    const nudgeW = 0.055;
    const nudgeH = 0.052;
    const gapA = 0.018;
    const gapB = 0.012;
    const gapC = 0.012;
    const gapD = 0.018;
    const trackW = Math.max(0.14, innerWidth - labelW - valueW - nudgeW - nudgeW - gapA - gapB - gapC - gapD);
    const trackH = 0.032;
    const leftLabelX = innerLeft + labelW * 0.5;
    const minusX = innerLeft + labelW + gapA + nudgeW * 0.5;
    const trackCenterX = innerLeft + labelW + gapA + nudgeW + gapB + trackW * 0.5;
    const plusX = innerLeft + labelW + gapA + nudgeW + gapB + trackW + gapC + nudgeW * 0.5;
    const valueX = innerLeft + labelW + gapA + nudgeW + gapB + trackW + gapC + nudgeW + gapD + valueW * 0.5;
    let rowCursor = 0;

    if (hasDesignSwitcher) {
      const y = halfH - 0.155 - rowCursor * rowH;
      rowCursor += 1;
      const activeDesignId = getActiveDesignIdSafe();
      const label = makeVrTextPlane('Design', labelW, 0.07, {
        color: VR_MENU_TEXT_DARK_COLOR,
        fontPx: 50,
        fontWeight: '700',
        align: 'left',
        padding: 18,
      });
      label.position.set(leftLabelX, y, 0.004);
      group.add(label);

      const switchAreaLeft = innerLeft + labelW + gapA;
      const switchAreaWidth = innerWidth - labelW - gapA;
      const btnGap = 0.014;
      const btnCount = designDefs.length;
      const btnW = Math.max(0.10, (switchAreaWidth - (btnGap * (btnCount - 1))) / btnCount);
      const btnH = 0.058;
      designDefs.forEach((def, idx) => {
        const designId = String(def.id);
        const labelText = String(def.label || designId)
          .replace(/\s*\(.+?\)\s*$/, '')
          .trim()
          .replace(/^Current\s+/i, '');
        const x = switchAreaLeft + (btnW * 0.5) + idx * (btnW + btnGap);
        const color = designId === activeDesignId ? 0x8ca974 : VR_MENU_NUDGE_COLOR;
        const btn = makeVrMenuButton(labelText || designId, btnW, btnH, color);
        btn.position.set(x, y, 0.003);
        btn.userData.vrMenuAction = {type: 'setDesign', designId};
        group.add(btn);
        interactive.push(btn);
      });
    }

    keys.forEach((key, idx) => {
      const def = VR_MENU_SLIDERS[key];
      if (!def) return;
      const v = quantizeVrSliderValue(def, getVrMenuCurrentValue(key, def));
      const y = halfH - 0.155 - (idx + rowCursor) * rowH;

      const label = makeVrTextPlane(def.label, labelW, 0.07, {
        color: VR_MENU_TEXT_DARK_COLOR,
        fontPx: 50,
        fontWeight: '700',
        align: 'left',
        padding: 18,
      });
      label.position.set(leftLabelX, y, 0.004);
      group.add(label);

      const track = new THREE.Mesh(
        new THREE.PlaneGeometry(trackW, trackH),
        new THREE.MeshBasicMaterial({
          color: VR_MENU_TRACK_COLOR,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        })
      );
      track.renderOrder = 2120;
      track.position.set(trackCenterX, y, 0.003);
      track.userData.vrMenuAction = {type: 'sliderTrack', key};
      group.add(track);

      const minusBtn = makeVrMenuButton('−', nudgeW, nudgeH, VR_MENU_NUDGE_COLOR);
      minusBtn.position.set(minusX, y, 0.003);
      minusBtn.userData.vrMenuAction = {type: 'sliderNudge', key, delta: -1};
      group.add(minusBtn);

      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(trackW, trackH * 0.78),
        new THREE.MeshBasicMaterial({
          color: VR_MENU_FILL_COLOR,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        })
      );
      fill.renderOrder = 2121;
      fill.position.set(trackCenterX - trackW * 0.5, y, 0.004);
      fill.scale.x = 0.0001;
      group.add(fill);

      const knob = new THREE.Mesh(
        new THREE.PlaneGeometry(0.028, 0.062),
        new THREE.MeshBasicMaterial({
          color: VR_MENU_KNOB_COLOR,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        })
      );
      knob.renderOrder = 2122;
      knob.position.set(trackCenterX - trackW * 0.5, y, 0.005);
      knob.userData.vrMenuAction = {type: 'sliderTrack', key};
      group.add(knob);

      const plusBtn = makeVrMenuButton('+', nudgeW, nudgeH, VR_MENU_NUDGE_COLOR);
      plusBtn.position.set(plusX, y, 0.003);
      plusBtn.userData.vrMenuAction = {type: 'sliderNudge', key, delta: 1};
      group.add(plusBtn);

      const valueLabel = makeVrTextPlane(def.fmt(v), valueW, 0.07, {
        color: VR_MENU_TEXT_DARK_COLOR,
        fontPx: 49,
        fontWeight: '700',
        align: 'right',
        padding: 18,
      });
      valueLabel.position.set(valueX, y, 0.004);
      group.add(valueLabel);

      const slider = {
        key,
        def,
        track,
        fill,
        knob,
        valueLabel,
        minusBtn,
        plusBtn,
        trackWidth: trackW,
        trackCenterX
      };
      slidersByKey[key] = slider;
      updateVrMenuSliderVisual(slider, v);

      interactive.push(minusBtn);
      interactive.push(track);
      interactive.push(knob);
      interactive.push(plusBtn);
    });
    if (hasHeightRecalc) {
      const y = halfH - 0.155 - (keys.length + rowCursor) * rowH;
      const autoBtn = makeVrMenuButton('Auto Height', 0.30, 0.07, 0xbac2ca);
      autoBtn.position.set(0, y, 0.003);
      autoBtn.userData.vrMenuAction = {type: 'recalcHeight'};
      group.add(autoBtn);
      interactive.push(autoBtn);
    }
    if (hasMeasureControls) {
      const measureOffset = keys.length + rowCursor + (hasHeightRecalc ? 1 : 0);
      const y = halfH - 0.155 - measureOffset * rowH;
      const settings = (measurementTool && typeof measurementTool.getSettings === 'function')
        ? (measurementTool.getSettings() || {})
        : {};

      const label = makeVrTextPlane('Measure', labelW, 0.07, {
        color: VR_MENU_TEXT_DARK_COLOR,
        fontPx: 50,
        fontWeight: '700',
        align: 'left',
        padding: 18,
      });
      label.position.set(leftLabelX, y, 0.004);
      group.add(label);

      const areaLeft = innerLeft + labelW + gapA;
      const areaWidth = innerWidth - labelW - gapA;
      const btnGap = 0.012;
      const btnW = Math.max(0.07, (areaWidth - (btnGap * 4)) / 5);
      const btnH = 0.058;
      const defs = [
        {label: settings.enabled ? 'On' : 'Off', action: {type: 'measureToggle', key: 'enabled'}, active: !!settings.enabled},
        {label: 'Surf', action: {type: 'measureToggle', key: 'snapToSurfaces'}, active: !!settings.snapToSurfaces},
        {label: 'Edge', action: {type: 'measureToggle', key: 'snapToEdges'}, active: !!settings.snapToEdges},
        {label: 'Vert', action: {type: 'measureToggle', key: 'snapToVertices'}, active: !!settings.snapToVertices},
        {label: 'Clear', action: {type: 'measureClear'}, active: false},
      ];
      defs.forEach((def, idx) => {
        const x = areaLeft + (btnW * 0.5) + idx * (btnW + btnGap);
        const color = def.label === 'Clear'
          ? 0xc8a9a9
          : (def.active ? 0x8ca974 : VR_MENU_NUDGE_COLOR);
        const btn = makeVrMenuButton(def.label, btnW, btnH, color);
        btn.position.set(x, y, 0.003);
        btn.userData.vrMenuAction = def.action;
        group.add(btn);
        interactive.push(btn);
      });
    }
  } else {
    const msg = makeVrTextPlane('No adjustable sliders', 0.58, 0.10, {
      color: VR_MENU_TEXT_DARK_COLOR,
      fontPx: 60,
      fontWeight: '700',
    });
    msg.position.set(0, -0.02, 0.004);
    group.add(msg);
  }

  scene.add(group);
  vrQuickMenu.group = group;
  vrQuickMenu.target = target;
  vrQuickMenu.closeBtn = closeBtn;
  vrQuickMenu.interactive = interactive;
  vrQuickMenu.slidersByKey = slidersByKey;
  vrQuickMenu.hoveredKey = null;
  vrQuickMenu.closeHovered = false;
  vrQuickMenu.open = true;
  setVrMenuSliderHoverKey(null);
  setVrMenuCloseHover(false);
  enforceVrMenuOverlay(group);
  placeVrQuickMenuDashboard();
  return true;
}

function openVrQuickMenuForInfo(info) {
  if (vrMenuManager && typeof vrMenuManager.openForInfo === 'function') {
    return !!vrMenuManager.openForInfo(info);
  }
  const target = resolveVrMenuTarget(info);
  if (!target) return false;
  return buildVrQuickMenu(target);
}

function getVrMenuInteractiveHit() {
  if (vrMenuManager && typeof vrMenuManager.getInteractiveHit === 'function') {
    return vrMenuManager.getInteractiveHit();
  }
  if (!vrQuickMenu.open || !vrQuickMenu.interactive.length) return null;
  xrMenuRaycaster.far = XR_TELEPORT_MAX_DISTANCE;
  xrMenuRaycaster.set(xrRayOrigin, xrRayDir);
  const hits = xrMenuRaycaster.intersectObjects(vrQuickMenu.interactive, false);
  return hits.length ? hits[0] : null;
}

function setVrMenuSliderFromHit(slider, hitPoint) {
  if (vrMenuManager && typeof vrMenuManager.setSliderFromHit === 'function') {
    return !!vrMenuManager.setSliderFromHit(slider, hitPoint);
  }
  if (!slider?.track || !hitPoint) return false;
  const local = slider.track.worldToLocal(hitPoint.clone());
  const t = THREE.MathUtils.clamp((local.x / slider.trackWidth) + 0.5, 0, 1);
  const raw = slider.def.min + t * (slider.def.max - slider.def.min);
  const next = quantizeVrSliderValue(slider.def, raw);
  const curr = quantizeVrSliderValue(slider.def, getVrMenuCurrentValue(slider.key, slider.def));
  if (Math.abs(next - curr) < 1e-6) return false;
  applyVrMenuStateKey(slider.key, next);
  updateVrMenuSliderVisual(slider, next);
  return true;
}

function beginVrMenuDrag(controllerIndex, key, hitPoint=null) {
  if (vrMenuManager && typeof vrMenuManager.beginDrag === 'function') {
    return !!vrMenuManager.beginDrag(controllerIndex, key, hitPoint);
  }
  const slider = vrQuickMenu.slidersByKey?.[key];
  if (!slider) return false;
  vrMenuDrag.active = true;
  vrMenuDrag.controllerIndex = controllerIndex;
  vrMenuDrag.key = key;
  if (hitPoint) setVrMenuSliderFromHit(slider, hitPoint);
  return true;
}

function endVrMenuDrag(controllerIndex=null) {
  if (vrMenuManager && typeof vrMenuManager.endDrag === 'function') {
    return !!vrMenuManager.endDrag(controllerIndex);
  }
  if (!vrMenuDrag.active) return false;
  if (Number.isInteger(controllerIndex) && vrMenuDrag.controllerIndex !== controllerIndex) return false;
  vrMenuDrag.active = false;
  vrMenuDrag.controllerIndex = -1;
  vrMenuDrag.key = null;
  return true;
}

function beginVrMenuMove(controllerIndex, hitPoint=null, hitDistance=VR_MENU_DISTANCE) {
  if (vrMenuManager && typeof vrMenuManager.beginMove === 'function') {
    return !!vrMenuManager.beginMove(controllerIndex, hitPoint, hitDistance);
  }
  if (!vrQuickMenu.open || !vrQuickMenu.group) return false;
  if (!Number.isInteger(controllerIndex) || controllerIndex < 0) return false;
  endVrMenuDrag(controllerIndex);
  const xrCam = renderer.xr.getCamera(camera);
  if (!xrCam) return false;
  xrCam.updateMatrixWorld(true);
  vrMenuMoveHeadPos.setFromMatrixPosition(xrCam.matrixWorld);
  const dx = vrQuickMenu.group.position.x - vrMenuMoveHeadPos.x;
  const dz = vrQuickMenu.group.position.z - vrMenuMoveHeadPos.z;
  vrMenuMove.active = true;
  vrMenuMove.controllerIndex = controllerIndex;
  vrMenuMove.hitDistance = THREE.MathUtils.clamp(Number(hitDistance) || VR_MENU_DISTANCE, 0.18, XR_TELEPORT_MAX_DISTANCE);
  vrMenuMove.orbitRadius = THREE.MathUtils.clamp(Math.hypot(dx, dz), 0.24, 2.2);
  vrMenuMove.orbitHeightOffset = vrQuickMenu.group.position.y - vrMenuMoveHeadPos.y;
  vrMenuMove.grabPointY = Number.isFinite(hitPoint?.y) ? hitPoint.y : vrQuickMenu.group.position.y;
  return true;
}

function endVrMenuMove(controllerIndex=null) {
  if (vrMenuManager && typeof vrMenuManager.endMove === 'function') {
    return !!vrMenuManager.endMove(controllerIndex);
  }
  if (!vrMenuMove.active) return false;
  if (Number.isInteger(controllerIndex) && vrMenuMove.controllerIndex !== controllerIndex) return false;
  vrMenuMove.active = false;
  vrMenuMove.controllerIndex = -1;
  vrMenuMove.hitDistance = VR_MENU_DISTANCE;
  vrMenuMove.orbitRadius = VR_MENU_DISTANCE;
  vrMenuMove.orbitHeightOffset = VR_MENU_DOWN_OFFSET;
  vrMenuMove.grabPointY = 0;
  return true;
}

function updateVrMenuDrag() {
  if (vrMenuManager && typeof vrMenuManager.updateDrag === 'function') {
    vrMenuManager.updateDrag();
    return;
  }
  if (!vrMenuDrag.active || !vrQuickMenu.open) return;
  const state = xrControllers.find(s => s.index === vrMenuDrag.controllerIndex);
  if (!state?.connected || !state.controller) {
    endVrMenuDrag();
    return;
  }
  const slider = vrQuickMenu.slidersByKey?.[vrMenuDrag.key];
  if (!slider) {
    endVrMenuDrag();
    return;
  }
  if (!readControllerWorldRay(state.controller)) return;
  xrMenuRaycaster.far = XR_TELEPORT_MAX_DISTANCE;
  xrMenuRaycaster.set(xrRayOrigin, xrRayDir);
  const hits = xrMenuRaycaster.intersectObject(slider.track, false);
  if (!hits.length) return;
  setVrMenuSliderFromHit(slider, hits[0].point);
}

function updateVrMenuMove(dtSeconds=(1/60)) {
  if (vrMenuManager && typeof vrMenuManager.updateMove === 'function') {
    vrMenuManager.updateMove(dtSeconds);
    return;
  }
  if (!vrMenuMove.active || !vrQuickMenu.open || !vrQuickMenu.group) return;
  const state = xrControllers.find(s => s.index === vrMenuMove.controllerIndex);
  if (!state?.connected || !state.controller) {
    endVrMenuMove();
    return;
  }
  if (!readControllerWorldRay(state.controller)) return;
  const dt = THREE.MathUtils.clamp(Number(dtSeconds) || (1 / 60), 0.001, 0.05);
  const xrCam = renderer.xr.getCamera(camera);
  if (!xrCam) return;
  xrCam.updateMatrixWorld(true);
  vrMenuMoveHeadPos.setFromMatrixPosition(xrCam.matrixWorld);

  const stick = readPrimaryStick(state.inputSource);
  const stickY = applyStickDeadzone(stick.y);
  if (Math.abs(stickY) > 1e-4) {
    vrMenuMove.orbitRadius = THREE.MathUtils.clamp(
      vrMenuMove.orbitRadius + (-stickY * VR_MENU_GRAB_RADIUS_SPEED * dt),
      0.24,
      2.8
    );
  }

  vrMenuMoveWorldPoint.copy(xrRayOrigin).addScaledVector(xrRayDir, vrMenuMove.hitDistance);
  vrMenuMoveHoriz.set(
    vrMenuMoveWorldPoint.x - vrMenuMoveHeadPos.x,
    0,
    vrMenuMoveWorldPoint.z - vrMenuMoveHeadPos.z
  );
  if (vrMenuMoveHoriz.lengthSq() < 1e-8) {
    vrMenuMoveHoriz.set(
      vrQuickMenu.group.position.x - vrMenuMoveHeadPos.x,
      0,
      vrQuickMenu.group.position.z - vrMenuMoveHeadPos.z
    );
    if (vrMenuMoveHoriz.lengthSq() < 1e-8) vrMenuMoveHoriz.set(0, 0, -1);
  }
  vrMenuMoveHoriz.normalize().multiplyScalar(vrMenuMove.orbitRadius);
  vrQuickMenu.group.position.x = vrMenuMoveHeadPos.x + vrMenuMoveHoriz.x;
  vrQuickMenu.group.position.z = vrMenuMoveHeadPos.z + vrMenuMoveHoriz.z;

  const yDelta = vrMenuMoveWorldPoint.y - vrMenuMove.grabPointY;
  const nextYOffset = THREE.MathUtils.clamp(vrMenuMove.orbitHeightOffset + yDelta, -0.75, 0.45);
  vrQuickMenu.group.position.y = vrMenuMoveHeadPos.y + nextYOffset;

  orientVrMenuTowardWorldPoint(vrMenuMoveHeadPos);
  vrQuickMenu.group.updateMatrixWorld(true);
}

function handleVrMenuSelect(hitOverride=null, controllerIndex=null, preferDrag=false) {
  if (vrMenuManager && typeof vrMenuManager.handleSelect === 'function') {
    return !!vrMenuManager.handleSelect(hitOverride, controllerIndex, preferDrag);
  }
  const hit = hitOverride || getVrMenuInteractiveHit();
  const action = hit?.object?.userData?.vrMenuAction;
  if (!action) return false;
  if (action.type === 'block') return true;
  if (action.type === 'recalcHeight') {
    const ok = recalcXrStandingEyeHeightFromHead();
    if (ok) refreshVrQuickMenuValues();
    return true;
  }
  if (action.type === 'close') {
    clearVrQuickMenu();
    return true;
  }
  if (action.type === 'measureClear') {
    if (measurementTool && typeof measurementTool.clearAll === 'function') {
      measurementTool.clearAll({segments: true, active: true});
    }
    return true;
  }
  if (action.type === 'measureToggle' && action.key) {
    if (!measurementTool || typeof measurementTool.setSetting !== 'function') return false;
    const settings = (typeof measurementTool.getSettings === 'function')
      ? (measurementTool.getSettings() || {})
      : {};
    measurementTool.setSetting(action.key, !settings[action.key]);
    syncMeasureToggleUi();
    if (vrQuickMenu.target === 'S') buildVrQuickMenu('S');
    return true;
  }
  if (action.type === 'setDesign' && action.designId) {
    return switchDesignAndReload(action.designId);
  }
  if (action.type === 'sliderNudge' && action.key) {
    const def = VR_MENU_SLIDERS[action.key];
    if (!def) return false;
    const curr = quantizeVrSliderValue(def, getVrMenuCurrentValue(action.key, def));
    const dir = Math.sign(Number(action.delta) || 0);
    if (!Number.isFinite(curr) || !dir) return false;
    const step = Number(def.step) || 1;
    const next = curr + (dir * step);
    applyVrMenuStateKey(action.key, next);
    return true;
  }
  if (action.type === 'sliderTrack' && action.key) {
    if (preferDrag && Number.isInteger(controllerIndex)) {
      return beginVrMenuDrag(controllerIndex, action.key, hit?.point || null);
    }
    const slider = vrQuickMenu.slidersByKey?.[action.key];
    if (!slider || !hit?.point) return false;
    return setVrMenuSliderFromHit(slider, hit.point);
  }
  return false;
}

function suppressVrWorldSelectOnce(state) {
  if (vrMenuManager && typeof vrMenuManager.suppressWorldSelectOnce === 'function') {
    vrMenuManager.suppressWorldSelectOnce(state);
    return;
  }
  if (!state) return;
  state.suppressWorldSelectUntil = performance.now() + XR_MENU_WORLD_CLICK_SUPPRESS_MS;
}

function consumeVrWorldSelectSuppression(state) {
  if (vrMenuManager && typeof vrMenuManager.consumeWorldSelectSuppression === 'function') {
    return !!vrMenuManager.consumeWorldSelectSuppression(state);
  }
  if (!state) return false;
  const until = Number(state.suppressWorldSelectUntil) || 0;
  if (until <= 0) return false;
  state.suppressWorldSelectUntil = 0;
  return performance.now() <= until;
}

function onVrControllerSelectStart(event) {
  if (vrMenuInteractionController) {
    vrMenuInteractionController.onControllerSelectStart(event);
    return;
  }
  if (!xrSessionActive) return;
  const state = xrControllers.find(s => s.controller === event?.target);
  if (state) xrActiveControllerIndex = state.index;
  const controller = state?.controller || event?.target;
  if (!controller || !readControllerWorldRay(controller)) return;
  if (!vrQuickMenu.open) return;
  const hit = getVrMenuInteractiveHit();
  if (handleVrMenuSelect(hit, state?.index ?? null, true)) {
    suppressVrWorldSelectOnce(state);
    event?.stopPropagation?.();
  }
}

function onVrControllerSelectCancel(event) {
  if (vrMenuInteractionController) {
    vrMenuInteractionController.onControllerSelectCancel(event);
    return;
  }
  const state = xrControllers.find(s => s.controller === event?.target);
  if (!state) return;
  state.suppressWorldSelectUntil = 0;
  endVrMenuDrag(state.index);
}

function onVrControllerSqueezeStart(event) {
  if (vrMenuInteractionController) {
    vrMenuInteractionController.onControllerSqueezeStart(event);
    return;
  }
  if (!xrSessionActive || !vrQuickMenu.open) return;
  const state = xrControllers.find(s => s.controller === event?.target);
  if (state) xrActiveControllerIndex = state.index;
  const controller = state?.controller || event?.target;
  if (!controller || !readControllerWorldRay(controller)) return;
  const hit = getVrMenuInteractiveHit();
  if (!hit) return;
  if (beginVrMenuMove(state?.index ?? -1, hit.point || null, hit.distance)) {
    event?.stopPropagation?.();
  }
}

function onVrControllerSqueezeEnd(event) {
  if (vrMenuInteractionController) {
    vrMenuInteractionController.onControllerSqueezeEnd(event);
    return;
  }
  const state = xrControllers.find(s => s.controller === event?.target);
  if (!state) return;
  endVrMenuMove(state.index);
}

function cancelVrMenuDragIfInactive() {
  if (vrMenuManager && typeof vrMenuManager.cancelDragIfInactive === 'function') {
    return !!vrMenuManager.cancelDragIfInactive();
  }
  if (vrMenuInteractionController) {
    return !!vrMenuInteractionController.cancelDragIfInactive();
  }
  if (!vrMenuDrag.active) return;
  const state = xrControllers.find(s => s.index === vrMenuDrag.controllerIndex);
  if (!state?.connected) {
    endVrMenuDrag();
    return true;
  }
  return false;
}

function cancelVrMenuMoveIfInactive() {
  if (vrMenuManager && typeof vrMenuManager.cancelMoveIfInactive === 'function') {
    return !!vrMenuManager.cancelMoveIfInactive();
  }
  if (vrMenuInteractionController) {
    return !!vrMenuInteractionController.cancelMoveIfInactive();
  }
  if (!vrMenuMove.active) return false;
  if (!vrQuickMenu.open || !vrQuickMenu.group) {
    endVrMenuMove();
    return true;
  }
  const state = xrControllers.find(s => s.index === vrMenuMove.controllerIndex);
  if (!state?.connected) {
    endVrMenuMove();
    return true;
  }
  return false;
}

function setVrButtonState() {
  if (!enterVrBtn) return;
  const show = xrSupportChecked && xrSupported;
  enterVrBtn.classList.toggle('is-hidden', !show);
  enterVrBtn.disabled = !!xrSessionRequestInFlight;
  enterVrBtn.textContent = xrSessionActive ? 'Exit VR' : 'Enter VR';
}

async function detectVrSupport() {
  if (!enterVrBtn) return false;
  if (!renderer?.xr || !('xr' in navigator) || !navigator.xr?.requestSession) {
    xrSupportChecked = true;
    xrSupported = false;
    setVrButtonState();
    return false;
  }
  if (!navigator.xr.isSessionSupported) {
    xrSupportChecked = true;
    xrSupported = true;
    setVrButtonState();
    return true;
  }
  try {
    xrSupported = await navigator.xr.isSessionSupported('immersive-vr');
  } catch (_) {
    xrSupported = false;
  }
  xrSupportChecked = true;
  setVrButtonState();
  return xrSupported;
}

function applyStickDeadzone(value) {
  const v = Number(value) || 0;
  const a = Math.abs(v);
  if (a <= XR_STICK_DEADZONE) return 0;
  const scaled = (a - XR_STICK_DEADZONE) / (1 - XR_STICK_DEADZONE);
  return Math.sign(v) * THREE.MathUtils.clamp(scaled, 0, 1);
}

function readPrimaryStick(inputSource) {
  const axes = inputSource?.gamepad?.axes;
  if (!axes || axes.length < 2) return {x: 0, y: 0};
  if (axes.length >= 4) {
    const magA = Math.hypot(axes[0] || 0, axes[1] || 0);
    const magB = Math.hypot(axes[2] || 0, axes[3] || 0);
    if (magB > magA) return {x: axes[2] || 0, y: axes[3] || 0};
  }
  return {x: axes[0] || 0, y: axes[1] || 0};
}

function getVrMoveAxes(session, excludedInputSource=null) {
  if (!session?.inputSources) return {x: 0, y: 0};
  let leftStick = null;
  let fallback = null;
  let fallbackMag = 0;
  for (const source of session.inputSources) {
    if (excludedInputSource && source === excludedInputSource) continue;
    if (!source?.gamepad) continue;
    const stick = readPrimaryStick(source);
    const mag = Math.hypot(stick.x, stick.y);
    if (source.handedness === 'left') {
      leftStick = {x: stick.x, y: stick.y, mag};
      continue;
    }
    if (mag > fallbackMag) {
      fallback = stick;
      fallbackMag = mag;
    }
  }
  if (leftStick && leftStick.mag > XR_STICK_DEADZONE * 0.45) {
    return {x: leftStick.x, y: leftStick.y};
  }
  return fallback || {x: 0, y: 0};
}

function makeVrControllerRay() {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const mat = new THREE.LineBasicMaterial({
    color: XR_RAY_COLOR_IDLE,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geom, mat);
  line.name = 'xrRay';
  line.visible = false;
  line.scale.z = XR_TELEPORT_MAX_DISTANCE;
  line.renderOrder = 999;
  line.frustumCulled = false;
  return line;
}

function setVrControllerRayStyle(state, distance, colorHex) {
  if (!state?.rayLine) return;
  const d = THREE.MathUtils.clamp(Number(distance) || XR_TELEPORT_MAX_DISTANCE, 0.06, XR_TELEPORT_MAX_DISTANCE);
  state.rayLine.scale.z = d;
  if (state.rayLine.material?.color) state.rayLine.material.color.setHex(colorHex);
  state.rayLine.visible = xrSessionActive && !!state.connected;
}

function applyControllerVisualOpacity(root, alpha=XR_CONTROLLER_VISUAL_OPACITY) {
  if (!root) return false;
  let foundMesh = false;
  root.traverse(obj => {
    if (!obj?.isMesh || !obj.material) return;
    foundMesh = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (!mat) return;
      mat.transparent = true;
      mat.opacity = alpha;
      mat.depthWrite = true;
      mat.needsUpdate = true;
    });
  });
  return foundMesh;
}

function getXrStandingEyeHeight() {
  return THREE.MathUtils.clamp(Number(xrStandingEyeHeight) || XR_FLOOR_EYE_HEIGHT, XR_MIN_EYE_HEIGHT, XR_MAX_EYE_HEIGHT);
}

function loadStoredVrUserHeight() {
  if (typeof localStorage === 'undefined') return XR_FLOOR_EYE_HEIGHT;
  try {
    const raw = localStorage.getItem(XR_USER_HEIGHT_STORAGE_KEY);
    if (raw === null) return XR_FLOOR_EYE_HEIGHT;
    const v = Number(raw);
    if (!Number.isFinite(v)) return XR_FLOOR_EYE_HEIGHT;
    return THREE.MathUtils.clamp(v, XR_MIN_EYE_HEIGHT, XR_MAX_EYE_HEIGHT);
  } catch (_) {
    return XR_FLOOR_EYE_HEIGHT;
  }
}

function persistVrUserHeight(value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(XR_USER_HEIGHT_STORAGE_KEY, String(value));
    return true;
  } catch (_) {
    return false;
  }
}

function setXrStandingEyeHeight(value, {persist=true, applyGroundSnap=true} = {}) {
  xrStandingEyeHeight = THREE.MathUtils.clamp(Number(value) || XR_FLOOR_EYE_HEIGHT, XR_MIN_EYE_HEIGHT, XR_MAX_EYE_HEIGHT);
  if (persist) persistVrUserHeight(xrStandingEyeHeight);
  if (!applyGroundSnap || !xrSessionActive || xrMoveMode !== XR_MOVE_MODE.GROUNDED) return;
  const xrCam = renderer.xr.getCamera(camera);
  xrNeedsGroundSnap = true;
  updateGroundFloorFromHead(xrCam, true);
  targetY = xrRig.position.y;
}

function recalcXrStandingEyeHeightFromHead() {
  if (!xrSessionActive) return false;
  const xrCam = renderer.xr.getCamera(camera);
  if (!xrCam) return false;
  xrCam.updateMatrixWorld(true);
  xrRig.updateMatrixWorld(true);
  xrHeadWorld.setFromMatrixPosition(xrCam.matrixWorld);
  xrRigInvMatrix.copy(xrRig.matrixWorld).invert();
  xrHeadLocal.copy(xrHeadWorld).applyMatrix4(xrRigInvMatrix);
  const measured = xrHeadLocal.y;
  if (!Number.isFinite(measured)) return false;
  setXrStandingEyeHeight(measured, {persist: true, applyGroundSnap: false});
  xrNeedsGroundSnap = true;
  updateGroundFloorFromHead(xrCam, true);
  targetY = xrRig.position.y;
  return true;
}

function loadQuestControllerModelTemplate(side) {
  if (side !== 'left' && side !== 'right') return Promise.resolve(null);
  if (!xrControllerGltfLoader) return Promise.resolve(null);
  if (xrQuestControllerModelTemplates[side]) return Promise.resolve(xrQuestControllerModelTemplates[side]);
  if (xrQuestControllerModelPromises[side]) return xrQuestControllerModelPromises[side];

  const url = XR_QUEST_CONTROLLER_URLS[side];
  xrQuestControllerModelPromises[side] = new Promise(resolve => {
    xrControllerGltfLoader.load(
      url,
      gltf => {
        xrQuestControllerModelTemplates[side] = gltf?.scene || null;
        resolve(xrQuestControllerModelTemplates[side]);
      },
      undefined,
      err => {
        console.warn(`Quest controller model load failed (${side}):`, err);
        resolve(null);
      }
    );
  });
  return xrQuestControllerModelPromises[side];
}

function ensureQuestControllerModel(state) {
  if (!state?.controllerGrip || !xrControllerGltfLoader) return;
  const side = (state.handedness === 'left' || state.handedness === 'right') ? state.handedness : null;
  if (!side) return;
  if (state.modelKind === 'quest' && state.modelSide === side) return;
  if (state.loadingModelSide === side) return;

  state.loadingModelSide = side;
  loadQuestControllerModelTemplate(side).then(template => {
    state.loadingModelSide = null;
    if (!template || !state.connected || !state.controllerGrip) return;
    if (state.modelKind === 'quest' && state.modelSide === side) return;

    const clone = template.clone(true);
    clone.name = `quest-controller-${side}`;
    if (state.controllerVisual?.parent === state.controllerGrip) {
      state.controllerGrip.remove(state.controllerVisual);
    }
    state.controllerVisual = clone;
    state.modelKind = 'quest';
    state.modelSide = side;
    state.visualReady = false;
    state.controllerGrip.add(clone);
  });
}

function makeFallbackControllerVisual() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.020, 0.13, 18),
    new THREE.MeshStandardMaterial({
      color: 0xb8c4d6,
      metalness: 0.12,
      roughness: 0.68,
      transparent: true,
      opacity: XR_CONTROLLER_VISUAL_OPACITY,
    })
  );
  shell.rotation.x = Math.PI * 0.5;
  shell.position.z = -0.03;
  g.add(shell);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.038, 0.008, 12, 24, Math.PI * 1.65),
    new THREE.MeshStandardMaterial({
      color: 0xd3deed,
      metalness: 0.08,
      roughness: 0.75,
      transparent: true,
      opacity: XR_CONTROLLER_VISUAL_OPACITY * 0.9,
    })
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.position.set(0, 0.02, -0.07);
  g.add(ring);
  g.userData.isFallbackControllerVisual = true;
  return g;
}

function readAnyButtonPressed(inputSource) {
  const buttons = inputSource?.gamepad?.buttons;
  if (!buttons || !buttons.length) return false;
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i]?.pressed) return true;
  }
  return false;
}

function updateActiveControllerFromButtons() {
  xrControllers.forEach(state => {
    const pressed = readAnyButtonPressed(state.inputSource);
    if (pressed && !state.anyPressedLast) xrActiveControllerIndex = state.index;
    state.anyPressedLast = pressed;
  });
}

function updateVrControllerConnection(state, connected, data=null) {
  if (!state) return;
  state.connected = !!connected;
  state.handedness = data?.handedness || 'none';
  state.inputSource = data || null;
  state.interactiveHit = null;
  state.floorHit = null;
  state.stickPressedLast = false;
  state.menuPressedLast = false;
  state.anyPressedLast = false;
  state.suppressWorldSelectUntil = 0;
  state.visualReady = false;
  state.loadingModelSide = null;
  if (state.menuCursor) state.menuCursor.visible = false;
  if (state.rayLine) state.rayLine.visible = xrSessionActive && state.connected;
  if (state.controllerGrip) state.controllerGrip.visible = xrSessionActive && state.connected;
  if (state.connected) {
    xrActiveControllerIndex = state.index;
    ensureQuestControllerModel(state);
  }
}

function ensureVrControllers() {
  if (xrControllersReady || !renderer?.xr) return;
  xrControllersReady = true;
  const makeState = index => {
    const controller = renderer.xr.getController(index);
    const controllerGrip = renderer.xr.getControllerGrip(index);
    const rayLine = makeVrControllerRay();
    const menuCursor = makeVrMenuCursor();
    controller.add(rayLine);
    vrMenuCursorOverlayGroup.add(menuCursor);
    let controllerVisual = null;
    if (xrControllerModelFactory) {
      controllerVisual = xrControllerModelFactory.createControllerModel(controllerGrip);
      controllerGrip.add(controllerVisual);
    } else {
      controllerVisual = makeFallbackControllerVisual();
      controllerGrip.add(controllerVisual);
    }
    controllerGrip.visible = false;
    const state = {
      index,
      controller,
      controllerGrip,
      controllerVisual,
      modelKind: xrControllerModelFactory ? 'factory' : 'fallback',
      modelSide: null,
      loadingModelSide: null,
      visualReady: false,
      rayLine,
      menuCursor,
      connected: false,
      handedness: 'none',
      inputSource: null,
      interactiveHit: null,
      floorHit: null,
      stickPressedLast: false,
      menuPressedLast: false,
      anyPressedLast: false,
      suppressWorldSelectUntil: 0,
    };
    controller.addEventListener('connected', ev => {
      updateVrControllerConnection(state, true, ev?.data || null);
    });
    controller.addEventListener('disconnected', () => {
      endVrMenuDrag(state.index);
      endVrMenuMove(state.index);
      updateVrControllerConnection(state, false, null);
    });
    controller.addEventListener('selectstart', onVrControllerSelectStart);
    controller.addEventListener('selectend', onVrControllerSelectEnd);
    controller.addEventListener('selectcancel', onVrControllerSelectCancel);
    controller.addEventListener('squeezestart', onVrControllerSqueezeStart);
    controller.addEventListener('squeezeend', onVrControllerSqueezeEnd);
    xrRig.add(controller);
    xrRig.add(controllerGrip);
    xrControllers.push(state);
  };
  makeState(0);
  makeState(1);
}

function readControllerWorldRay(controller) {
  if (!controller) return false;
  controller.updateMatrixWorld(true);
  xrRayOrigin.setFromMatrixPosition(controller.matrixWorld);
  xrRayMatrix.extractRotation(controller.matrixWorld);
  xrRayDir.set(0, 0, -1).applyMatrix4(xrRayMatrix).normalize();
  return Number.isFinite(xrRayDir.x) && Number.isFinite(xrRayDir.y) && Number.isFinite(xrRayDir.z);
}

function getVrInteractiveHit() {
  if (!Array.isArray(hoverTargets) || !hoverTargets.length) return null;
  xrRaycaster.far = XR_TELEPORT_MAX_DISTANCE;
  xrRaycaster.set(xrRayOrigin, xrRayDir);
  const hits = xrRaycaster.intersectObjects(hoverTargets, false);
  return hits.find(h => h?.object?.userData?.sectionInfo) || null;
}

function getVrFloorHit(maxDistance=XR_TELEPORT_MAX_DISTANCE) {
  const maxDist = THREE.MathUtils.clamp(Number(maxDistance) || XR_TELEPORT_MAX_DISTANCE, 0.06, XR_TELEPORT_MAX_DISTANCE);
  // Intersect a base horizontal plane; final standing height is resolved from x/z.
  xrRayPlane.set(xrUp, 0);
  xrRay.origin.copy(xrRayOrigin);
  xrRay.direction.copy(xrRayDir);
  const hit = xrRay.intersectPlane(xrRayPlane, xrRaycastHit);
  if (!hit) return null;
  const distance = xrRayOrigin.distanceTo(hit);
  if (!Number.isFinite(distance) || distance < 0.06 || distance > maxDist) return null;
  return {point: hit.clone(), distance};
}

function teleportVrTo(targetPoint) {
  if (!xrSessionActive || !targetPoint) return false;
  clearVrQuickMenu();
  const xrCam = renderer.xr.getCamera(camera);
  xrCam.updateMatrixWorld(true);
  xrHeadWorld.setFromMatrixPosition(xrCam.matrixWorld);
  const floorY = getActiveFloorY(targetPoint.x, targetPoint.z);
  xrRig.position.x += targetPoint.x - xrHeadWorld.x;
  xrRig.position.z += targetPoint.z - xrHeadWorld.z;
  const desiredHeadY = floorY + getXrStandingEyeHeight();
  xrRig.position.y += desiredHeadY - xrHeadWorld.y;
  xrGroundFloorY = floorY;
  xrNeedsGroundSnap = false;
  targetX = xrRig.position.x;
  targetY = xrRig.position.y;
  targetZ = xrRig.position.z;
  return true;
}

function captureVrStartPosition() {
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(xrStartWorld);
  camera.getWorldDirection(xrDesktopForward);
  xrDesktopForward.y = 0;
  if (xrDesktopForward.lengthSq() > 1e-8) xrDesktopForward.normalize();
  xrEntryStartPos = {
    x: xrStartWorld.x,
    z: xrStartWorld.z,
  };
  xrEntryForward = (xrDesktopForward.lengthSq() > 1e-8)
    ? {x: xrDesktopForward.x, z: xrDesktopForward.z}
    : null;
}

function getStickyGroundFloorY(x, z) {
  if (typeof isPointOnCrashMat === 'function' && crashMatsEnabled) {
    const preferMats = xrGroundFloorY > 0.01;
    const margin = preferMats ? XR_FLOOR_SWITCH_HYSTERESIS : -XR_FLOOR_SWITCH_HYSTERESIS;
    return isPointOnCrashMat(x, z, margin) ? CRASH_MAT_THICKNESS : 0;
  }
  return getActiveFloorY(x, z);
}

function updateGroundFloorFromHead(xrCam, sticky=true) {
  if (!xrCam) return xrGroundFloorY;
  xrCam.updateMatrixWorld(true);
  xrHeadWorld.setFromMatrixPosition(xrCam.matrixWorld);
  const nextFloorY = sticky ? getStickyGroundFloorY(xrHeadWorld.x, xrHeadWorld.z) : getActiveFloorY(xrHeadWorld.x, xrHeadWorld.z);
  const floorChanged = Math.abs(nextFloorY - xrGroundFloorY) > 1e-5;
  if (floorChanged || xrNeedsGroundSnap) {
    const desiredHeadY = nextFloorY + getXrStandingEyeHeight();
    const headDelta = desiredHeadY - xrHeadWorld.y;
    if (Math.abs(headDelta) > 1e-5) xrRig.position.y += headDelta;
    xrGroundFloorY = nextFloorY;
    xrNeedsGroundSnap = false;
  }
  return xrGroundFloorY;
}

function alignVrYawToDesktop(xrCam) {
  if (!xrNeedsYawAlignment || !xrCam || !xrEntryForward) return;
  xrCam.updateMatrixWorld(true);
  xrCam.getWorldDirection(xrCurrentForward);
  xrCurrentForward.y = 0;
  if (xrCurrentForward.lengthSq() < 1e-8) return;
  xrCurrentForward.normalize();

  xrDesktopForward.set(xrEntryForward.x, 0, xrEntryForward.z).normalize();
  const currentYaw = Math.atan2(xrCurrentForward.x, xrCurrentForward.z);
  const targetYaw = Math.atan2(xrDesktopForward.x, xrDesktopForward.z);
  const deltaYaw = THREE.MathUtils.euclideanModulo((targetYaw - currentYaw) + Math.PI, Math.PI * 2) - Math.PI;
  if (!Number.isFinite(deltaYaw)) return;
  xrRig.rotation.y += deltaYaw;
  xrNeedsYawAlignment = false;
  xrEntryForward = null;
}

function toggleVrMoveMode() {
  xrMoveMode = (xrMoveMode === XR_MOVE_MODE.GROUNDED) ? XR_MOVE_MODE.FLY : XR_MOVE_MODE.GROUNDED;
  if (xrMoveMode !== XR_MOVE_MODE.GROUNDED || !xrSessionActive) return;
  const xrCam = renderer.xr.getCamera(camera);
  xrNeedsGroundSnap = true;
  updateGroundFloorFromHead(xrCam, false);
}

function updateVrMoveModeToggle() {
  let toggleRequested = false;
  xrControllers.forEach(state => {
    const pressed = !!state?.inputSource?.gamepad?.buttons?.[XR_STICK_CLICK_BUTTON_INDEX]?.pressed;
    if (pressed && !state.stickPressedLast) toggleRequested = true;
    state.stickPressedLast = pressed;
  });
  if (toggleRequested) toggleVrMoveMode();
}

function readVrMenuButtonPressed(state) {
  if (vrMenuInteractionController && typeof vrMenuInteractionController.readMenuButtonPressed === 'function') {
    return !!vrMenuInteractionController.readMenuButtonPressed(state);
  }
  if (!state?.connected || state.handedness !== 'left') return false;
  const buttons = state.inputSource?.gamepad?.buttons;
  if (!buttons?.length) return false;
  for (let i = 0; i < XR_MENU_BUTTON_INDICES.length; i++) {
    const idx = XR_MENU_BUTTON_INDICES[i];
    if (buttons[idx]?.pressed) return true;
  }
  return false;
}

function updateVrMenuButtonToggle() {
  if (vrMenuInteractionController) {
    vrMenuInteractionController.updateMenuButtonToggle();
    return;
  }
  let toggleRequested = false;
  xrControllers.forEach(state => {
    const pressed = readVrMenuButtonPressed(state);
    if (pressed && !state.menuPressedLast) toggleRequested = true;
    state.menuPressedLast = pressed;
  });
  if (!toggleRequested) return;
  if (vrQuickMenu.open) {
    clearVrQuickMenu();
    return;
  }
  buildVrQuickMenu('S');
}

function handleVrInteractiveClick(hit) {
  const info = hit?.object?.userData?.sectionInfo;
  if (!info) return false;
  return openVrQuickMenuForInfo(info);
}

function onVrControllerSelectEnd(event) {
  if (!xrSessionActive) return;
  const state = xrControllers.find(s => s.controller === event?.target);
  if (state) xrActiveControllerIndex = state.index;
  if (vrMenuInteractionController && state) {
    if (vrMenuInteractionController.shouldIgnoreWorldSelectForState(state)) return;
  } else {
    if (state && vrMenuMove.active && vrMenuMove.controllerIndex === state.index) return;
    if (state && endVrMenuDrag(state.index)) {
      state.suppressWorldSelectUntil = 0;
      return;
    }
    if (state && consumeVrWorldSelectSuppression(state)) return;
  }
  const controller = state?.controller || event?.target;
  if (!controller || !readControllerWorldRay(controller)) return;
  if (vrQuickMenu.open) {
    const menuHit = getVrMenuInteractiveHit();
    if (handleVrMenuSelect(menuHit, state?.index ?? null, false)) return;
  }
  const interactiveHit = getVrInteractiveHit();
  if (
    interactiveHit &&
    !vrQuickMenu.open &&
    measurementTool &&
    typeof measurementTool.isEnabled === 'function' &&
    measurementTool.isEnabled() &&
    typeof measurementTool.raySelectFromHit === 'function'
  ) {
    if (measurementTool.raySelectFromHit(interactiveHit)) return;
  }
  if (handleVrInteractiveClick(interactiveHit)) return;
  const maxFloorDist = interactiveHit ? Math.max(0.06, interactiveHit.distance - 0.02) : XR_TELEPORT_MAX_DISTANCE;
  const floorHit = getVrFloorHit(maxFloorDist);
  if (floorHit) teleportVrTo(floorHit.point);
}

function updateVrControllerPointers() {
  if (!xrSessionActive) {
    xrTeleportMarker.visible = false;
    xrControllers.forEach(state => {
      if (state?.rayLine) state.rayLine.visible = false;
      if (state?.controllerGrip) state.controllerGrip.visible = false;
      if (state?.menuCursor) state.menuCursor.visible = false;
    });
    if (measurementTool && typeof measurementTool.rayClearPreview === 'function') {
      measurementTool.rayClearPreview();
    }
    setVrMenuSliderHoverKey(null);
    setVrMenuCloseHover(false);
    return;
  }

  updateActiveControllerFromButtons();
  const xrCam = renderer.xr.getCamera(camera);
  if (xrCam) xrCam.updateMatrixWorld(true);
  let hoveredSliderKey = null;
  let hoveredFromActive = false;
  let closeHovered = false;
  let closeHoveredFromActive = false;

  xrControllers.forEach(state => {
    if (!state?.controller || !state?.rayLine || !state.connected || !readControllerWorldRay(state.controller)) {
      if (state?.rayLine) state.rayLine.visible = false;
      if (state?.controllerGrip) state.controllerGrip.visible = false;
      if (state?.menuCursor) state.menuCursor.visible = false;
      return;
    }
    if (state.controllerGrip) {
      state.controllerGrip.visible = true;
      ensureQuestControllerModel(state);
      if (!state.visualReady && state.controllerVisual) {
        state.visualReady = applyControllerVisualOpacity(state.controllerVisual);
      }
    }
    const menuHit = getVrMenuInteractiveHit();
    const interactiveHit = menuHit ? null : getVrInteractiveHit();
    const maxFloorDist = (menuHit || interactiveHit)
      ? Math.max(0.06, (menuHit || interactiveHit).distance - 0.02)
      : XR_TELEPORT_MAX_DISTANCE;
    const floorHit = menuHit ? null : getVrFloorHit(maxFloorDist);
    state.interactiveHit = interactiveHit;
    state.floorHit = floorHit;

    if (state.menuCursor) {
      if (menuHit && vrQuickMenu.open && vrQuickMenu.group) {
        state.menuCursor.visible = true;
        if (xrCam) {
          vrMenuMoveHeadPos.setFromMatrixPosition(xrCam.matrixWorld);
          vrMenuCursorToHead.copy(vrMenuMoveHeadPos).sub(menuHit.point);
          if (vrMenuCursorToHead.lengthSq() < 1e-10) vrMenuCursorToHead.copy(xrRayDir).multiplyScalar(-1);
          else vrMenuCursorToHead.normalize();
          state.menuCursor.position.copy(menuHit.point).addScaledVector(vrMenuCursorToHead, VR_MENU_CURSOR_OFFSET);
        } else {
          state.menuCursor.position.copy(menuHit.point).addScaledVector(xrRayDir, -VR_MENU_CURSOR_OFFSET);
        }
        state.menuCursor.quaternion.copy(vrQuickMenu.group.quaternion);
      } else {
        state.menuCursor.visible = false;
      }
    }

    const menuAction = menuHit?.object?.userData?.vrMenuAction;
    if (menuAction?.type === 'sliderTrack' && menuAction.key) {
      if (!hoveredSliderKey || (state.index === xrActiveControllerIndex && !hoveredFromActive)) {
        hoveredSliderKey = menuAction.key;
        hoveredFromActive = state.index === xrActiveControllerIndex;
      }
    } else if (menuAction?.type === 'close') {
      if (!closeHovered || (state.index === xrActiveControllerIndex && !closeHoveredFromActive)) {
        closeHovered = true;
        closeHoveredFromActive = state.index === xrActiveControllerIndex;
      }
    }

    let color = XR_RAY_COLOR_IDLE;
    let lineDistance = XR_TELEPORT_MAX_DISTANCE;
    if (menuHit) {
      color = XR_RAY_COLOR_INTERACTIVE;
      lineDistance = menuHit.distance;
    } else if (interactiveHit) {
      color = XR_RAY_COLOR_INTERACTIVE;
      lineDistance = interactiveHit.distance;
    } else if (floorHit) {
      color = XR_RAY_COLOR_TELEPORT;
      lineDistance = floorHit.distance;
    }
    setVrControllerRayStyle(state, lineDistance, color);
  });

  if (
    !vrQuickMenu.open &&
    measurementTool &&
    typeof measurementTool.isEnabled === 'function' &&
    measurementTool.isEnabled() &&
    typeof measurementTool.rayPreviewFromHit === 'function'
  ) {
    const previewState = xrControllers.find(state =>
      state &&
      state.index === xrActiveControllerIndex &&
      state.connected
    ) || xrControllers.find(state => state?.connected) || null;
    const previewHit = previewState?.interactiveHit || null;
    if (previewHit) measurementTool.rayPreviewFromHit(previewHit);
    else if (typeof measurementTool.rayClearPreview === 'function') measurementTool.rayClearPreview();
  }

  setVrMenuSliderHoverKey(hoveredSliderKey);
  setVrMenuCloseHover(closeHovered);

  const activeState = xrControllers.find(state =>
    state &&
    state.index === xrActiveControllerIndex &&
    state.connected &&
    !!state.floorHit
  ) || null;
  const markerState = activeState || xrControllers.find(state => state?.connected && !!state.floorHit) || null;
  if (markerState?.floorHit?.point) {
    const bestTeleport = markerState.floorHit.point;
    xrTeleportMarker.visible = true;
    xrTeleportMarker.position.copy(bestTeleport);
    xrTeleportMarker.position.y = getActiveFloorY(bestTeleport.x, bestTeleport.z) + XR_TELEPORT_SURFACE_EPS;
  } else {
    xrTeleportMarker.visible = false;
  }
}

function beginVrSession() {
  stopIntroAnimation({restoreStart: false});
  hideHoverInfo();
  clearVrQuickMenu();
  if (!xrRestoreCameraState) xrRestoreCameraState = {...getCurrentCameraState()};

  let startX = W * 0.5;
  let startZ = D * 0.72;
  if (xrEntryStartPos && Number.isFinite(xrEntryStartPos.x) && Number.isFinite(xrEntryStartPos.z)) {
    startX = xrEntryStartPos.x;
    startZ = xrEntryStartPos.z;
  } else {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(xrStartWorld);
    if (Number.isFinite(xrStartWorld.x)) startX = xrStartWorld.x;
    if (Number.isFinite(xrStartWorld.z)) startZ = xrStartWorld.z;
  }
  const startFloorY = getActiveFloorY(startX, startZ);

  theta = 0;
  phi = Math.PI * 0.5;
  radius = 0.001;
  targetX = startX;
  targetY = startFloorY;
  targetZ = startZ;
  xrRig.position.set(targetX, targetY, targetZ);
  xrRig.rotation.set(0, 0, 0);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  xrMoveMode = XR_MOVE_MODE.GROUNDED;
  xrGroundFloorY = startFloorY;
  xrNeedsGroundSnap = true;
  xrStandingEyeHeight = loadStoredVrUserHeight();
  xrNeedsYawAlignment = !!xrEntryForward;
  xrActiveControllerIndex = 0;
  xrEntryStartPos = null;
  eSweepAnim.active = false;
  rigToggleAnim.targetDeg = null;
  rigToggleAnim.lastRebuildDeg = NaN;
  xrTeleportMarker.visible = false;
  xrControllers.forEach(state => {
    state.interactiveHit = null;
    state.floorHit = null;
    state.stickPressedLast = false;
    state.menuPressedLast = false;
    state.anyPressedLast = false;
    state.visualReady = false;
    if (state.rayLine) state.rayLine.visible = !!state.connected;
    if (state.controllerGrip) state.controllerGrip.visible = !!state.connected;
    if (state.menuCursor) state.menuCursor.visible = false;
  });
}

function endVrSession() {
  hideHoverInfo();
  clearVrQuickMenu();
  xrTeleportMarker.visible = false;
  xrControllers.forEach(state => {
    state.interactiveHit = null;
    state.floorHit = null;
    state.stickPressedLast = false;
    state.menuPressedLast = false;
    state.anyPressedLast = false;
    state.visualReady = false;
    if (state.rayLine) state.rayLine.visible = false;
    if (state.controllerGrip) state.controllerGrip.visible = false;
    if (state.menuCursor) state.menuCursor.visible = false;
  });
  eSweepAnim.active = false;
  rigToggleAnim.targetDeg = null;
  rigToggleAnim.lastRebuildDeg = NaN;
  xrMoveMode = XR_MOVE_MODE.GROUNDED;
  xrGroundFloorY = 0;
  xrNeedsGroundSnap = false;
  xrStandingEyeHeight = loadStoredVrUserHeight();
  xrNeedsYawAlignment = false;
  xrActiveControllerIndex = 0;
  xrEntryStartPos = null;
  xrEntryForward = null;
  xrRig.position.set(0, 0, 0);
  xrRig.rotation.set(0, 0, 0);
  if (xrRestoreCameraState) {
    applyCameraState(xrRestoreCameraState);
    xrRestoreCameraState = null;
  }
}

function setupWebXR() {
  if (!renderer?.xr) return;
  renderer.xr.enabled = true;
  ensureVrControllers();
  renderer.xr.addEventListener('sessionstart', () => {
    xrSessionActive = true;
    beginVrSession();
    setVrButtonState();
  });
  renderer.xr.addEventListener('sessionend', () => {
    xrSessionActive = false;
    endVrSession();
    setVrButtonState();
  });
  detectVrSupport();
  if (!enterVrBtn) return;
  enterVrBtn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    if (!xrSupportChecked) await detectVrSupport();
    if (!xrSupported || xrSessionRequestInFlight) return;
    try {
      xrSessionRequestInFlight = true;
      setVrButtonState();
      if (xrSessionActive) {
        const active = renderer.xr.getSession();
        if (active) await active.end();
        return;
      }
      captureVrStartPosition();
      const session = await navigator.xr.requestSession('immersive-vr', XR_SESSION_OPTIONS);
      await renderer.xr.setSession(session);
    } catch (err) {
      console.warn('VR session request failed:', err);
    } finally {
      xrSessionRequestInFlight = false;
      setVrButtonState();
    }
  });
}

function updateVrLocomotion(dtSeconds) {
  if (!xrSessionActive) return;
  const session = renderer.xr.getSession();
  if (!session) return;
  const dt = THREE.MathUtils.clamp(Number(dtSeconds) || (1 / 60), 0.001, 0.05);
  const xrCam = renderer.xr.getCamera(camera);
  alignVrYawToDesktop(xrCam);

  updateVrMoveModeToggle();
  updateVrMenuButtonToggle();
  if (xrMoveMode === XR_MOVE_MODE.GROUNDED) updateGroundFloorFromHead(xrCam, true);
  const blockedSource = vrMenuMove.active
    ? (xrControllers.find(s => s.index === vrMenuMove.controllerIndex)?.inputSource || null)
    : null;
  const axes = getVrMoveAxes(session, blockedSource);
  const moveX = applyStickDeadzone(axes.x);
  const moveY = applyStickDeadzone(axes.y);
  if (Math.abs(moveX) < 1e-4 && Math.abs(moveY) < 1e-4) {
    targetX = xrRig.position.x;
    targetY = xrRig.position.y;
    targetZ = xrRig.position.z;
    return;
  }

  xrCam.getWorldDirection(xrForward);
  if (xrMoveMode === XR_MOVE_MODE.GROUNDED) {
    xrForward.y = 0;
    if (xrForward.lengthSq() < 1e-8) xrForward.set(0, 0, -1);
    else xrForward.normalize();
    xrRight.crossVectors(xrForward, xrUp);
    if (xrRight.lengthSq() < 1e-8) xrRight.set(1, 0, 0);
    else xrRight.normalize();
  } else {
    if (xrForward.lengthSq() < 1e-8) xrForward.set(0, 0, -1);
    else xrForward.normalize();
    xrRight.setFromMatrixColumn(xrCam.matrixWorld, 0);
    if (xrRight.lengthSq() < 1e-8) xrRight.set(1, 0, 0);
    else xrRight.normalize();
  }

  xrMoveDelta.set(0, 0, 0);
  xrMoveDelta.addScaledVector(xrRight, moveX);
  xrMoveDelta.addScaledVector(xrForward, -moveY);
  const moveLen = xrMoveDelta.length();
  if (moveLen > 1) xrMoveDelta.multiplyScalar(1 / moveLen);
  const moveSpeed = (xrMoveMode === XR_MOVE_MODE.FLY) ? XR_FLY_SPEED_MPS : XR_MOVE_SPEED_MPS;
  xrMoveDelta.multiplyScalar(moveSpeed * dt);

  xrRig.position.x += xrMoveDelta.x;
  if (xrMoveMode === XR_MOVE_MODE.FLY) {
    xrRig.position.y += xrMoveDelta.y;
  }
  xrRig.position.z += xrMoveDelta.z;
  if (xrMoveMode === XR_MOVE_MODE.GROUNDED) updateGroundFloorFromHead(xrCam, true);
  targetX = xrRig.position.x;
  targetY = xrRig.position.y;
  targetZ = xrRig.position.z;
}

const INTRO_DELAY_MS = 1300;
const INTRO_TOTAL_MS = 25000;
const INTRO_END_EASE_WINDOW = 0.14; // final 14% of timeline eases to a stop

// User-provided camera keyframes (plus return to start).
// t values are normalized [0..1] over INTRO_TOTAL_MS.
const INTRO_KEYFRAMES = Object.freeze([
  { // 1
    t: 0.00,
    state: {theta: 1.615, phi: 1.555, radius: 8, targetX: 1.58553, targetY: 1.837716, targetZ: 1.909133},
    rigOpen: 0,
    eAngle: 5,
  },
  { // 2
    t: 0.20,
    state: {theta: 0.48, phi: 1.55, radius: 8, targetX: 1.58553, targetY: 1.837716, targetZ: 1.909133},
    rigOpen: 180,
    eAngle: 5,
  },
  { // 3
    t: 0.45,
    state: {theta: -0.325, phi: 1.65, radius: 8, targetX: 1.567144, targetY: 2.054634, targetZ: 1.921106},
    rigOpen: 180,
    eAngle: 40,
  },
  { // 4
    t: 0.68,
    state: {theta: -0.5, phi: 1.02, radius: 8, targetX: 1.396702, targetY: 1.875792, targetZ: 2.18587},
    rigOpen: 90,
    eAngle: 20,
  },
  { // 5
    t: 0.84,
    state: {theta: 1.2, phi: 0.92, radius: 8, targetX: 1.396702, targetY: 1.875792, targetZ: 2.18587},
    rigOpen: 0,
    eAngle: 5,
  },
  { // return to start
    t: 1.00,
    state: {theta: 1.615, phi: 1.555, radius: 8, targetX: 1.58553, targetY: 1.837716, targetZ: 1.909133},
    rigOpen: 0,
    eAngle: 5,
  },
]);

const INTRO_TRACKS = Object.freeze({
  theta: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.state.theta})),
  phi: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.state.phi})),
  radius: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.state.radius})),
  targetX: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.state.targetX})),
  targetY: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.state.targetY})),
  targetZ: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.state.targetZ})),
  rigOpen: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.rigOpen})),
  eAngle: INTRO_KEYFRAMES.map(k => ({t: k.t, v: k.eAngle})),
});

const introAnim = {
  active: false,
  startTs: 0,
  startCam: null,
  startRigOpen: 0,
  startEAngle: 0,
  lastRigOpen: NaN,
};

function applyCameraState(state) {
  if (!state) return;
  theta = state.theta;
  phi = state.phi;
  radius = state.radius;
  targetX = state.targetX;
  targetY = state.targetY;
  targetZ = state.targetZ;
}

function setIntroButtonVisible(visible) {
  if (!reactivateCameraBtn) return;
  reactivateCameraBtn.classList.toggle('is-hidden', !visible);
}

function setRigOpenValue(deg, doRebuild=false) {
  const clamped = THREE.MathUtils.clamp(Number(deg) || 0, 0, 180);
  wallState.rigOpen = clamped;
  const rigSlider = document.getElementById('rigOpen');
  const rigLabel = document.getElementById('rigOpenLabel');
  if (rigSlider) rigSlider.value = String(clamped);
  if (rigLabel) rigLabel.textContent = `${Math.round(clamped)}°`;
  const didFastApply = (typeof setTrainingRigOpenAngle === 'function')
    ? setTrainingRigOpenAngle(clamped)
    : false;
  if (
    didFastApply &&
    activeHoverMesh?.userData?.sectionInfo?.hoverKind === 'trainingRig' &&
    typeof drawHoverSectionDimensions === 'function'
  ) {
    drawHoverSectionDimensions(activeHoverMesh, activeHoverMesh.userData.sectionInfo);
  }
  if (doRebuild && !didFastApply && trainingRigEnabled) {
    requestRebuild({stages: [UI_REBUILD_STAGE.GEOMETRY]});
  }
  return clamped;
}

function setEAngleValue(deg) {
  const clamped = THREE.MathUtils.clamp(Number(deg) || 0, -5, 60);
  wallState.eAngle = clamped;
  const eSlider = document.getElementById('angleSlider');
  const eLabel = document.getElementById('angleLabel');
  if (eSlider) eSlider.value = String(clamped);
  if (eLabel) eLabel.textContent = `${Math.round(clamped)}°`;
  if (typeof setAdjAngle === 'function') setAdjAngle(clamped);
  return clamped;
}

function updateInteractiveAnimations(dtSeconds) {
  if (introAnim.active) return;
  const dt = THREE.MathUtils.clamp(Number(dtSeconds) || 0, 0, 0.08);
  if (dt <= 0) return;

  if (eSweepAnim.active) {
    let next = (Number(wallState.eAngle) || 0) + (eSweepAnim.dir * eSweepAnim.speedDegPerSec * dt);
    if (next >= eSweepAnim.maxDeg) {
      next = eSweepAnim.maxDeg;
      eSweepAnim.dir = -1;
    } else if (next <= eSweepAnim.minDeg) {
      next = eSweepAnim.minDeg;
      eSweepAnim.dir = 1;
    }
    setEAngleValue(next);
  }

  if (Number.isFinite(rigToggleAnim.targetDeg)) {
    const current = THREE.MathUtils.clamp(Number(wallState.rigOpen) || 0, 0, 180);
    const target = THREE.MathUtils.clamp(Number(rigToggleAnim.targetDeg) || 0, 0, 180);
    const delta = target - current;
    if (Math.abs(delta) <= 0.15) {
      setRigOpenValue(target, true);
      rigToggleAnim.targetDeg = null;
      rigToggleAnim.lastRebuildDeg = NaN;
    } else {
      const step = Math.sign(delta) * Math.min(Math.abs(delta), rigToggleAnim.speedDegPerSec * dt);
      const next = current + step;
      const nearTarget = Math.abs(target - next) <= 0.15;
      const needsRebuild = (
        !Number.isFinite(rigToggleAnim.lastRebuildDeg) ||
        Math.abs(next - rigToggleAnim.lastRebuildDeg) >= rigToggleAnim.rebuildStepDeg ||
        nearTarget
      );
      setRigOpenValue(next, needsRebuild);
      if (needsRebuild) rigToggleAnim.lastRebuildDeg = next;
    }
  }
}

function stopIntroAnimation({restoreStart=false} = {}) {
  if (!introAnim.active) return;
  introAnim.active = false;
  if (restoreStart && introAnim.startCam) {
    applyCameraState(introAnim.startCam);
    setRigOpenValue(introAnim.startRigOpen, true);
    setEAngleValue(introAnim.startEAngle);
  }
  setIntroButtonVisible(true);
}

function sampleSmoothKeyframes(keys, t) {
  if (!Array.isArray(keys) || keys.length === 0) return 0;
  if (keys.length === 1) return Number(keys[0].v) || 0;

  const tt = THREE.MathUtils.clamp(t, keys[0].t, keys[keys.length - 1].t);
  if (tt <= keys[0].t) return keys[0].v;
  if (tt >= keys[keys.length - 1].t) return keys[keys.length - 1].v;

  let i = 0;
  while (i < keys.length - 1 && tt > keys[i + 1].t) i++;

  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];

  const t1 = k1.t;
  const t2 = k2.t;
  const span = Math.max(1e-6, t2 - t1);
  const s = (tt - t1) / span;
  const s2 = s * s;
  const s3 = s2 * s;

  const m1 = (k2.v - k0.v) / Math.max(1e-6, k2.t - k0.t);
  const m2 = (k3.v - k1.v) / Math.max(1e-6, k3.t - k1.t);

  const h00 = (2 * s3) - (3 * s2) + 1;
  const h10 = s3 - (2 * s2) + s;
  const h01 = (-2 * s3) + (3 * s2);
  const h11 = s3 - s2;

  return (h00 * k1.v) + (h10 * m1 * span) + (h01 * k2.v) + (h11 * m2 * span);
}

// Remap timeline so only the tail decelerates and reaches zero velocity at the end.
function remapProgressForEndEase(p) {
  const pp = THREE.MathUtils.clamp(p, 0, 1);
  const w = THREE.MathUtils.clamp(INTRO_END_EASE_WINDOW, 0.01, 0.5);
  const t0 = 1 - w;
  if (pp <= t0) return pp;
  const u = (pp - t0) / w;
  // Cubic Hermite: p(0)=0, p'(0)=1, p(1)=1, p'(1)=0
  const h = (-u * u * u) + (u * u) + u;
  return t0 + (h * w);
}

function updateIntroAnimation(now) {
  if (!introAnim.active || !introAnim.startCam) return;
  if (now < introAnim.startTs) return;
  const elapsed = now - introAnim.startTs;
  if (elapsed >= INTRO_TOTAL_MS) {
    stopIntroAnimation({restoreStart: true});
    return;
  }

  const pRaw = THREE.MathUtils.clamp(elapsed / INTRO_TOTAL_MS, 0, 1);
  const p = remapProgressForEndEase(pRaw);
  const nextState = {
    theta: sampleSmoothKeyframes(INTRO_TRACKS.theta, p),
    phi: THREE.MathUtils.clamp(sampleSmoothKeyframes(INTRO_TRACKS.phi, p), ORBIT_MIN_POLAR, ORBIT_MAX_POLAR),
    radius: sampleSmoothKeyframes(INTRO_TRACKS.radius, p),
    targetX: sampleSmoothKeyframes(INTRO_TRACKS.targetX, p),
    targetY: sampleSmoothKeyframes(INTRO_TRACKS.targetY, p),
    targetZ: sampleSmoothKeyframes(INTRO_TRACKS.targetZ, p),
  };
  applyCameraState(nextState);

  const rigOpen = THREE.MathUtils.clamp(sampleSmoothKeyframes(INTRO_TRACKS.rigOpen, p), 0, 180);
  setRigOpenValue(rigOpen, false);
  introAnim.lastRigOpen = rigOpen;

  const eAngle = THREE.MathUtils.clamp(sampleSmoothKeyframes(INTRO_TRACKS.eAngle, p), -5, 60);
  setEAngleValue(eAngle);
}

function startIntroAnimation(fromSavedState=true) {
  eSweepAnim.active = false;
  rigToggleAnim.targetDeg = null;
  rigToggleAnim.lastRebuildDeg = NaN;
  const startKeyframe = INTRO_KEYFRAMES[0];
  const startCam = startKeyframe?.state || (
    fromSavedState && typeof loadCameraState === 'function'
      ? loadCameraState()
      : getCurrentCameraState()
  ) || getCurrentCameraState();
  applyCameraState(startCam);
  introAnim.startCam = {...startCam};
  introAnim.startRigOpen = startKeyframe ? THREE.MathUtils.clamp(Number(startKeyframe.rigOpen) || 0, 0, 180) : THREE.MathUtils.clamp(Number(wallState.rigOpen) || 0, 0, 180);
  introAnim.startEAngle = startKeyframe ? THREE.MathUtils.clamp(Number(startKeyframe.eAngle) || 0, -5, 60) : THREE.MathUtils.clamp(Number(wallState.eAngle) || 0, -5, 60);
  introAnim.startTs = performance.now() + INTRO_DELAY_MS;
  introAnim.lastRigOpen = NaN;
  introAnim.active = true;
  setIntroButtonVisible(false);
  setRigOpenValue(introAnim.startRigOpen, true);
  setEAngleValue(introAnim.startEAngle);
}

function panCamera(dx, dy, verticalPan=false) {
  if (cameraControlsUtils && typeof cameraControlsUtils.panCamera === 'function') {
    const next = {radius, targetX, targetY, targetZ};
    if (cameraControlsUtils.panCamera(next, camera, dx, dy, verticalPan)) {
      targetX = next.targetX;
      targetY = next.targetY;
      targetZ = next.targetZ;
      return;
    }
  }

  const panScale = Math.max(0.004, radius * 0.0017);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward).normalize();

  // Screen-space pan: left/right always follows camera-right, up/down follows camera-up.
  // Optional Alt/Ctrl mode keeps prior behavior of panning in view depth instead of camera-up.
  const panU = new THREE.Vector3().copy(right).multiplyScalar(-dx * panScale);
  const panV = new THREE.Vector3()
    .copy(verticalPan ? forward : up)
    .multiplyScalar(dy * panScale);
  const pan = panU.add(panV);

  targetX += pan.x;
  targetY += pan.y;
  targetZ += pan.z;
}

function shouldIgnoreDesktopMoveEvent(e) {
  if (cameraControlsUtils && typeof cameraControlsUtils.shouldIgnoreDesktopMoveEvent === 'function') {
    return cameraControlsUtils.shouldIgnoreDesktopMoveEvent(e, xrSessionActive);
  }
  if (xrSessionActive) return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target;
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return true;
  return false;
}

function setDesktopMoveKeyState(e, pressed) {
  if (cameraControlsUtils && typeof cameraControlsUtils.setDesktopMoveKeyState === 'function') {
    const handled = cameraControlsUtils.setDesktopMoveKeyState(desktopMoveKeys, e, pressed, xrSessionActive);
    if (!handled) return false;
    if (pressed && introAnim.active) stopIntroAnimation({restoreStart: false});
    return true;
  }

  if (shouldIgnoreDesktopMoveEvent(e)) return false;
  let key = null;
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      key = 'forward';
      break;
    case 'ArrowDown':
    case 'KeyS':
      key = 'back';
      break;
    case 'ArrowLeft':
    case 'KeyA':
      key = 'left';
      break;
    case 'ArrowRight':
    case 'KeyD':
      key = 'right';
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      key = 'fast';
      break;
    default:
      break;
  }
  if (!key) return false;
  desktopMoveKeys[key] = pressed;
  e.preventDefault();
  if (pressed && introAnim.active) stopIntroAnimation({restoreStart: false});
  return true;
}

function clearDesktopMoveKeys() {
  if (cameraControlsUtils && typeof cameraControlsUtils.clearDesktopMoveKeys === 'function') {
    cameraControlsUtils.clearDesktopMoveKeys(desktopMoveKeys);
    return;
  }
  desktopMoveKeys.forward = false;
  desktopMoveKeys.back = false;
  desktopMoveKeys.left = false;
  desktopMoveKeys.right = false;
  desktopMoveKeys.fast = false;
}

function updateDesktopKeyboardMove(dt) {
  if (xrSessionActive || introAnim.active) return;
  if (cameraControlsUtils && typeof cameraControlsUtils.updateDesktopKeyboardMove === 'function') {
    const next = {targetX, targetZ};
    const moved = cameraControlsUtils.updateDesktopKeyboardMove(
      next,
      camera,
      desktopMoveKeys,
      dt,
      {moveSpeedMps: DESKTOP_MOVE_SPEED_MPS, moveRunMultiplier: DESKTOP_MOVE_RUN_MULT}
    );
    if (moved) {
      targetX = next.targetX;
      targetZ = next.targetZ;
    }
    return;
  }

  const hasMove =
    desktopMoveKeys.forward ||
    desktopMoveKeys.back ||
    desktopMoveKeys.left ||
    desktopMoveKeys.right;
  if (!hasMove) return;

  camera.getWorldDirection(desktopForward);
  desktopForward.y = 0;
  if (desktopForward.lengthSq() < 1e-6) return;
  desktopForward.normalize();
  desktopRight.crossVectors(desktopForward, desktopUp).normalize();

  desktopMoveDelta.set(0, 0, 0);
  if (desktopMoveKeys.forward) desktopMoveDelta.add(desktopForward);
  if (desktopMoveKeys.back) desktopMoveDelta.sub(desktopForward);
  if (desktopMoveKeys.right) desktopMoveDelta.add(desktopRight);
  if (desktopMoveKeys.left) desktopMoveDelta.sub(desktopRight);
  if (desktopMoveDelta.lengthSq() < 1e-6) return;

  const speed = DESKTOP_MOVE_SPEED_MPS * (desktopMoveKeys.fast ? DESKTOP_MOVE_RUN_MULT : 1);
  desktopMoveDelta.normalize().multiplyScalar(speed * dt);
  targetX += desktopMoveDelta.x;
  targetZ += desktopMoveDelta.z;
}

function setGroupOpacity(group, alpha) {
  if (!group) return;
  group.traverse(obj => {
    if (!obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach(mat => {
      if (!mat) return;
      if (typeof mat.userData.baseOpacity !== 'number') {
        mat.userData.baseOpacity = Number.isFinite(mat.opacity) ? mat.opacity : 1;
      }
      mat.transparent = true;
      mat.opacity = mat.userData.baseOpacity * alpha;
      mat.needsUpdate = true;
    });
  });
}

function cloneFocusedMaterial(mat) {
  if (!mat) return mat;
  const c = mat.clone();
  const baseOpacity = typeof mat.userData.baseOpacity === 'number'
    ? mat.userData.baseOpacity
    : (Number.isFinite(mat.opacity) ? mat.opacity : 1);
  c.transparent = true;
  c.opacity = baseOpacity;
  c.needsUpdate = true;
  return c;
}

function clearFocusedMaterials() {
  focusedMaterialEntries.forEach(entry => {
    if (!entry.obj) return;
    entry.obj.material = entry.original;
    const clones = Array.isArray(entry.clone) ? entry.clone : [entry.clone];
    clones.forEach(c => {
      if (c && typeof c.dispose === 'function') c.dispose();
    });
  });
  focusedMaterialEntries = [];
  activeFocusMesh = null;
}

function applyFocusedMeshMaterial(mesh) {
  if (!mesh) return;
  mesh.traverse(obj => {
    if (!obj.material) return;
    const original = obj.material;
    const clone = Array.isArray(original)
      ? original.map(m => cloneFocusedMaterial(m))
      : cloneFocusedMaterial(original);
    focusedMaterialEntries.push({obj, original, clone});
    obj.material = clone;
  });
  activeFocusMesh = mesh;
}

function setSceneFaded(faded, focusMesh=null) {
  if (!faded) {
    clearFocusedMaterials();
    setGroupOpacity(wallGroup, 1.0);
    setGroupOpacity(labelGroup, 1.0);
    sceneIsFaded = false;
    return;
  }

  const focusChanged = activeFocusMesh !== focusMesh;
  if (!sceneIsFaded || focusChanged) {
    clearFocusedMaterials();
    setGroupOpacity(wallGroup, 0.3);
    setGroupOpacity(labelGroup, 0.3);
    if (focusMesh) applyFocusedMeshMaterial(focusMesh);
    sceneIsFaded = true;
  }
}

function setDimGroupOpacity(alpha) {
  setGroupOpacity(dimGroup, alpha);
}

function setDimensionsFaded(faded) {
  if (dimsAreFaded === faded) return;
  setDimGroupOpacity(faded ? 0.3 : 1.0);
  dimsAreFaded = faded;
}

function hideHoverInfo() {
  if (hoverInfoEl) hoverInfoEl.style.display = 'none';
  clearHoverSectionDimensions();
  setDimensionsFaded(false);
  setSceneFaded(false);
  activeHoverMesh = null;
}

function updateHover(clientX, clientY) {
  if (isDragging || !hoverTargets.length) {
    clearHoverSectionDimensions();
    setDimensionsFaded(false);
    setSceneFaded(false);
    activeHoverMesh = null;
    if (hoverInfoEl) hoverInfoEl.style.display = 'none';
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    clearHoverSectionDimensions();
    setDimensionsFaded(false);
    setSceneFaded(false);
    activeHoverMesh = null;
    if (hoverInfoEl) hoverInfoEl.style.display = 'none';
    return;
  }

  hoverMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  hoverMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(hoverMouse, camera);

  const hits = raycaster.intersectObjects(hoverTargets, false);
  const hit = hits.find(h => h.object.userData.sectionInfo);
  if (!hit) {
    clearHoverSectionDimensions();
    setDimensionsFaded(false);
    setSceneFaded(false);
    activeHoverMesh = null;
    if (hoverInfoEl) hoverInfoEl.style.display = 'none';
    return;
  }

  const mesh = hit.object;
  const info = mesh.userData.sectionInfo;
  setDimensionsFaded(true);
  setSceneFaded(true, mesh);
  if (mesh !== activeHoverMesh) {
    drawHoverSectionDimensions(mesh, info);
    activeHoverMesh = mesh;
  }
  if (hoverInfoEl) hoverInfoEl.style.display = 'none';
}

function showSaveStatus(text, isError=false) {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = text;
  saveStatusEl.classList.toggle('is-error', isError);
  if (showSaveStatus.timer) clearTimeout(showSaveStatus.timer);
  showSaveStatus.timer = setTimeout(() => {
    saveStatusEl.textContent = '';
    saveStatusEl.classList.remove('is-error');
  }, 1600);
}
showSaveStatus.timer = null;

function handleIntroCancelInteraction(e) {
  if (!introAnim.active) return;
  if (reactivateCameraBtn && (e.target === reactivateCameraBtn || reactivateCameraBtn.contains(e.target))) return;
  stopIntroAnimation({restoreStart: false});
}

document.addEventListener('pointerdown', handleIntroCancelInteraction, {capture: true});
document.addEventListener('mousedown', handleIntroCancelInteraction, {capture: true});
document.addEventListener('touchstart', handleIntroCancelInteraction, {capture: true, passive: true});

if (reactivateCameraBtn) {
  reactivateCameraBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    startIntroAnimation(true);
  });
}

wrap.addEventListener('mousedown', e => {
  hideHoverInfo();
  if (measurementTool && measurementTool.pointerDown(e)) {
    isDragging = false;
    dragMode = 'orbit';
    lastX = e.clientX;
    lastY = e.clientY;
    return;
  }
  isDragging = true;
  dragMode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
  lastX = e.clientX; lastY = e.clientY;
});
wrap.addEventListener('contextmenu', e => {
  if (measurementTool && measurementTool.cancelActive()) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
});
window.addEventListener('mouseup', e => {
  if (measurementTool) measurementTool.pointerUp(e);
  isDragging = false;
  dragMode = 'orbit';
});
window.addEventListener('mousemove', e => {
  if (measurementTool && measurementTool.isEnabled() && measurementTool.isDragging()) {
    measurementTool.pointerMove(e.clientX, e.clientY);
    return;
  }
  if (!isDragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (dragMode === 'pan') {
    panCamera(dx, dy, e.altKey || e.ctrlKey);
  } else {
    theta -= dx * 0.005;
    phi = Math.max(ORBIT_MIN_POLAR, Math.min(ORBIT_MAX_POLAR, phi - dy * 0.005));
  }
});
wrap.addEventListener('mousemove', e => {
  if (measurementTool && measurementTool.pointerMove(e.clientX, e.clientY)) return;
  updateHover(e.clientX, e.clientY);
});
wrap.addEventListener('mouseleave', hideHoverInfo);
wrap.addEventListener('wheel', e => {
  radius = Math.max(3, Math.min(25, radius + e.deltaY * 0.01));
});

// Touch support
let lastTouchDist = null;
let lastTouchMidX = null;
let lastTouchMidY = null;
wrap.addEventListener('touchstart', e => {
  hideHoverInfo();
  if (e.touches.length === 1) {
    isDragging = true;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    lastTouchDist = null;
    lastTouchMidX = null;
    lastTouchMidY = null;
  } else if (e.touches.length === 2) {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    lastTouchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    lastTouchMidX = (t0.clientX + t1.clientX) * 0.5;
    lastTouchMidY = (t0.clientY + t1.clientY) * 0.5;
    isDragging = false;
  }
});
wrap.addEventListener('touchend', e => {
  if (e.touches.length === 1) {
    isDragging = true;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    lastTouchDist = null;
    lastTouchMidX = null;
    lastTouchMidY = null;
    return;
  }
  isDragging = false;
  lastTouchDist = null;
  lastTouchMidX = null;
  lastTouchMidY = null;
});
wrap.addEventListener('touchcancel', () => {
  isDragging = false;
  lastTouchDist = null;
  lastTouchMidX = null;
  lastTouchMidY = null;
});
wrap.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    theta -= dx * 0.005;
    phi = Math.max(ORBIT_MIN_POLAR, Math.min(ORBIT_MAX_POLAR, phi - dy * 0.005));
    return;
  }
  if (e.touches.length === 2) {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    const midX = (t0.clientX + t1.clientX) * 0.5;
    const midY = (t0.clientY + t1.clientY) * 0.5;

    if (lastTouchDist !== null) {
      radius = Math.max(3, Math.min(25, radius - (dist - lastTouchDist) * 0.02));
    }
    if (lastTouchMidX !== null && lastTouchMidY !== null) {
      const dx = midX - lastTouchMidX;
      const dy = midY - lastTouchMidY;
      panCamera(dx, dy, false);
    }

    lastTouchDist = dist;
    lastTouchMidX = midX;
    lastTouchMidY = midY;
  }
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && measurementTool && measurementTool.cancelActive()) {
    e.preventDefault();
    return;
  }
  setDesktopMoveKeyState(e, true);
});
window.addEventListener('keyup', e => {
  setDesktopMoveKeyState(e, false);
});
window.addEventListener('blur', clearDesktopMoveKeys);

// ── Slider wiring ──
const UI_DESIGN_SYSTEM = RUNTIME_DESIGN_SYSTEM;
const UI_ACTIVE_DESIGN_DEF = (
  UI_DESIGN_SYSTEM &&
  typeof UI_DESIGN_SYSTEM.getDesignDefinition === 'function'
) ? UI_DESIGN_SYSTEM.getDesignDefinition(getActiveDesignIdSafe()) : null;
const FALLBACK_GEOMETRY_SLIDER_SCHEMA = Object.freeze([
  {id: 'roomWidth', stateKey: 'width', labelId: 'roomWidthLabel', fmt: 'm2'},
  {id: 'roomDepth', stateKey: 'depth', labelId: 'roomDepthLabel', fmt: 'm2'},
  {id: 'fixedHeight', stateKey: 'fixedHeight', labelId: 'fixedHeightLabel', fmt: 'm2'},
  {id: 'adjHeight', stateKey: 'adjustableHeight', labelId: 'adjHeightLabel', fmt: 'm2'},
]);
const FALLBACK_WALL_SLIDER_SCHEMA = Object.freeze([
  {id: 'angleSlider', stateKey: 'eAngle', labelId: 'angleLabel', fmt: 'deg', rebuild: true},
  {id: 'aAngle', stateKey: 'aAngle', labelId: 'aAngleLabel', fmt: 'deg', rebuild: true},
  {id: 'aWidth', stateKey: 'aWidth', labelId: 'aWidthLabel', fmt: 'm2', rebuild: true},
  {id: 'bAngle', stateKey: 'bAngle', labelId: 'bAngleLabel', fmt: 'deg', rebuild: true},
  {id: 'bWidth', stateKey: 'bWidth', labelId: 'bWidthLabel', fmt: 'm2', rebuild: true},
  {id: 'cAngle', stateKey: 'cAngle', labelId: 'cAngleLabel', fmt: 'deg', rebuild: true},
  {id: 'cWidth', stateKey: 'cWidth', labelId: 'cWidthLabel', fmt: 'm2', rebuild: true},
  {id: 'dAngle', stateKey: 'dAngle', labelId: 'dAngleLabel', fmt: 'deg', rebuild: true},
  {id: 'd1Height', stateKey: 'd1Height', labelId: 'd1HeightLabel', fmt: 'm2', rebuild: true},
  {id: 'd2Angle', stateKey: 'd2Angle', labelId: 'd2AngleLabel', fmt: 'deg', rebuild: true},
  {id: 'f1Angle', stateKey: 'f1Angle', labelId: 'f1AngleLabel', fmt: 'deg', rebuild: true},
  {id: 'f1Height', stateKey: 'f1Height', labelId: 'f1HeightLabel', fmt: 'm2', rebuild: true},
  {id: 'f1Width', stateKey: 'f1Width', labelId: 'f1WidthLabel', fmt: 'm2', rebuild: true},
  {id: 'f2Angle', stateKey: 'f2Angle', labelId: 'f2AngleLabel', fmt: 'deg', rebuild: true},
  {id: 'f2WidthTop', stateKey: 'f2WidthTop', labelId: 'f2WidthTopLabel', fmt: 'm2', rebuild: true},
  {id: 'rigOpen', stateKey: 'rigOpen', labelId: 'rigOpenLabel', fmt: 'degRound', rebuild: true},
]);
const PANEL_GEOMETRY_SLIDER_SCHEMA = (
  Array.isArray(UI_ACTIVE_DESIGN_DEF?.panelSchema?.geometry) &&
  UI_ACTIVE_DESIGN_DEF.panelSchema.geometry.length
) ? UI_ACTIVE_DESIGN_DEF.panelSchema.geometry : FALLBACK_GEOMETRY_SLIDER_SCHEMA;
const PANEL_WALL_SLIDER_SCHEMA = (
  Array.isArray(UI_ACTIVE_DESIGN_DEF?.panelSchema?.walls) &&
  UI_ACTIVE_DESIGN_DEF.panelSchema.walls.length
) ? UI_ACTIVE_DESIGN_DEF.panelSchema.walls : FALLBACK_WALL_SLIDER_SCHEMA;

function formatSliderValueByToken(value, fmt) {
  switch (fmt) {
    case 'deg':
      return `${value}°`;
    case 'degRound':
      return `${Math.round(value)}°`;
    case 'm2':
      return `${value.toFixed(2)}m`;
    default:
      return String(value);
  }
}

function syncDynamicSliderBounds() {
  const clampInputToRange = (id, min, max) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.min = String(min);
    el.max = String(max);
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    const clamped = THREE.MathUtils.clamp(v, min, max);
    if (Math.abs(clamped - v) > 1e-6) el.value = String(clamped);
  };

  const dynamicKeys = ['aWidth', 'd1Height', 'f1Height', 'f1Width', 'f2WidthTop'];
  dynamicKeys.forEach(key => {
    const current = Number(wallState[key]);
    if (!Number.isFinite(current)) return;
    wallState[key] = clampWallStateValue(key, current);
  });

  if (VR_MENU_SLIDERS?.aWidth) VR_MENU_SLIDERS.aWidth.max = WALL_STATE_LIMITS.aWidth[1];
  if (VR_MENU_SLIDERS?.d1Height) VR_MENU_SLIDERS.d1Height.max = WALL_STATE_LIMITS.d1Height[1];
  if (VR_MENU_SLIDERS?.f1Height) VR_MENU_SLIDERS.f1Height.max = WALL_STATE_LIMITS.f1Height[1];
  if (VR_MENU_SLIDERS?.f1Width) VR_MENU_SLIDERS.f1Width.max = WALL_STATE_LIMITS.f1Width[1];
  if (VR_MENU_SLIDERS?.f2WidthTop) VR_MENU_SLIDERS.f2WidthTop.max = WALL_STATE_LIMITS.f2WidthTop[1];

  clampInputToRange('aWidth', WALL_STATE_LIMITS.aWidth[0], WALL_STATE_LIMITS.aWidth[1]);
  clampInputToRange('d1Height', WALL_STATE_LIMITS.d1Height[0], WALL_STATE_LIMITS.d1Height[1]);
  clampInputToRange('f1Height', WALL_STATE_LIMITS.f1Height[0], WALL_STATE_LIMITS.f1Height[1]);
  clampInputToRange('f1Width', WALL_STATE_LIMITS.f1Width[0], WALL_STATE_LIMITS.f1Width[1]);
  clampInputToRange('f2WidthTop', WALL_STATE_LIMITS.f2WidthTop[0], WALL_STATE_LIMITS.f2WidthTop[1]);
}

function syncGeometryCards() {
  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${v.toFixed(2)} m`;
  };
  setText('roomWidthCard', wallGeometryState.width);
  setText('roomDepthCard', wallGeometryState.depth);
  setText('fixedHeightCard', wallGeometryState.fixedHeight);
  setText('adjHeightCard', wallGeometryState.adjustableHeight);
}

function bindGeometrySlider(id, labelId, geometryKey, fmt) {
  const el = document.getElementById(id);
  const lbl = document.getElementById(labelId);
  if (!el || !Object.prototype.hasOwnProperty.call(wallGeometryState, geometryKey)) return;
  const initial = Number(wallGeometryState[geometryKey]);
  if (Number.isFinite(initial)) {
    el.value = String(initial);
    if (lbl) lbl.textContent = fmt(initial);
  }
  el.addEventListener('input', () => {
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    setWallGeometryValue(geometryKey, v, {rebuildScene: true, persistState: true});
    syncDynamicSliderBounds();
    syncSlidersFromState();
    syncGeometrySlidersFromState();
    syncGeometryCards();
    refreshVrQuickMenuValues();
  });
}

function syncGeometrySlidersFromState() {
  PANEL_GEOMETRY_SLIDER_SCHEMA.forEach(def => {
    const id = def.id;
    const labelId = def.labelId;
    const key = def.stateKey;
    const fmt = def.fmt;
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    const v = Number(wallGeometryState[key]);
    if (!el || !Number.isFinite(v)) return;
    el.value = String(v);
    if (lbl) lbl.textContent = formatSliderValueByToken(v, fmt);
  });
  syncDynamicSliderBounds();
  syncGeometryCards();
}

function bindSlider(id, labelId, stateKey, fmt, triggerRebuild) {
  const el = document.getElementById(id);
  const lbl = document.getElementById(labelId);
  if (!el) return;
  if (Number.isFinite(wallState[stateKey])) {
    el.value = String(wallState[stateKey]);
    if (lbl) lbl.textContent = fmt(wallState[stateKey]);
  }
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (stateKey === 'rigOpen') {
      rigToggleAnim.targetDeg = null;
      rigToggleAnim.lastRebuildDeg = NaN;
      if (lbl) lbl.textContent = fmt(v);
      setRigOpenValue(v, true);
      if (typeof window?.syncAppStateFromCore === 'function') {
        window.syncAppStateFromCore('ui:slider:rigOpen');
      }
      return;
    }
    wallState[stateKey] = v;
    if (stateKey === 'eAngle') eSweepAnim.active = false;
    if (lbl) lbl.textContent = fmt(v);
    if (triggerRebuild) {
      if (stateKey === 'eAngle' && typeof setAdjAngle === 'function') setAdjAngle(v);
      requestRebuild({stages: [UI_REBUILD_STAGE.GEOMETRY]});
    }
    else {
      setAdjAngle(wallState.eAngle);
      if (typeof window?.syncAppStateFromCore === 'function') {
        window.syncAppStateFromCore('ui:slider:noRebuild');
      }
    }
  });
}

function syncSlidersFromState() {
  syncDynamicSliderBounds();
  PANEL_WALL_SLIDER_SCHEMA.forEach(def => {
    const id = def.id;
    const labelId = def.labelId;
    const key = def.stateKey;
    const fmt = def.fmt;
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    if (!el || !Number.isFinite(wallState[key])) return;
    el.value = String(wallState[key]);
    if (lbl) lbl.textContent = formatSliderValueByToken(wallState[key], fmt);
  });
}

PANEL_WALL_SLIDER_SCHEMA.forEach(def => {
  bindSlider(
    def.id,
    def.labelId,
    def.stateKey,
    v => formatSliderValueByToken(v, def.fmt),
    def.rebuild !== false
  );
});
PANEL_GEOMETRY_SLIDER_SCHEMA.forEach(def => {
  bindGeometrySlider(
    def.id,
    def.labelId,
    def.stateKey,
    v => formatSliderValueByToken(v, def.fmt)
  );
});
syncSlidersFromState();
syncGeometrySlidersFromState();

if (DESIGN_SWITCHER && typeof DESIGN_SWITCHER.initDesignSelector === 'function') {
  DESIGN_SWITCHER.initDesignSelector({
    selectId: 'designSelect',
    syncAppStateFromCore: window?.syncAppStateFromCore,
    onStatus: (text, isError=false) => showSaveStatus(text, isError),
    reloadDelayMs: 30,
  });
}

const wallControlsDetails = document.getElementById('wallControlsDetails');
if (wallControlsDetails && window.matchMedia && window.matchMedia('(max-width: 980px)').matches) {
  wallControlsDetails.removeAttribute('open');
}

const saveConfigBtn = document.getElementById('saveConfigBtn');
if (saveConfigBtn) {
  saveConfigBtn.addEventListener('click', () => {
    const okWalls = saveWallState(true);
    const okGeom = saveWallGeometryState(true);
    const okCamera = persistCurrentCameraState();
    const ok = okWalls && okGeom && okCamera;
    showSaveStatus(ok ? 'Saved as defaults' : 'Save failed', !ok);
  });
}

const resetConfigBtn = document.getElementById('resetConfigBtn');
if (resetConfigBtn) {
  resetConfigBtn.addEventListener('click', () => {
    resetWallGeometryState();
    resetWallState();
    syncGeometrySlidersFromState();
    syncSlidersFromState();
    const savedCam = (typeof loadCameraState === 'function') ? loadCameraState() : null;
    if (savedCam) {
      theta = savedCam.theta;
      phi = savedCam.phi;
      radius = savedCam.radius;
      targetX = savedCam.targetX;
      targetY = savedCam.targetY;
      targetZ = savedCam.targetZ;
    }
    requestRebuild({immediate: true, stages: [UI_REBUILD_STAGE.GEOMETRY]});
    showSaveStatus('Reset to saved defaults');
  });
}

const crashMatsToggle = document.getElementById('crashMatsToggle');
if (crashMatsToggle) {
  crashMatsToggle.checked = crashMatsEnabled;
  crashMatsToggle.addEventListener('change', () => {
    setCrashMatsEnabled(crashMatsToggle.checked);
  });
}

const texturesToggle = document.getElementById('texturesToggle');
if (texturesToggle) {
  texturesToggle.checked = texturesEnabled;
  texturesToggle.addEventListener('change', () => {
    setTexturesEnabled(texturesToggle.checked);
  });
}

const environmentToggle = document.getElementById('environmentToggle');
if (environmentToggle) {
  environmentToggle.checked = environmentEnabled;
  environmentToggle.addEventListener('change', () => {
    setEnvironmentEnabled(environmentToggle.checked);
  });
}

const polyRoofToggle = document.getElementById('polyRoofToggle');
if (polyRoofToggle) {
  polyRoofToggle.checked = polyRoofEnabled;
  polyRoofToggle.addEventListener('change', () => {
    setPolyRoofEnabled(polyRoofToggle.checked);
  });
}

const trainingRigToggle = document.getElementById('trainingRigToggle');
if (trainingRigToggle) {
  trainingRigToggle.checked = trainingRigEnabled;
  trainingRigToggle.addEventListener('change', () => {
    setTrainingRigEnabled(trainingRigToggle.checked);
  });
}

const trainingCabinetToggle = document.getElementById('trainingCabinetToggle');
if (trainingCabinetToggle) {
  trainingCabinetToggle.checked = trainingCabinetEnabled;
  trainingCabinetToggle.addEventListener('change', () => {
    setTrainingCabinetEnabled(trainingCabinetToggle.checked);
  });
}

const campusBoardToggle = document.getElementById('campusBoardToggle');
if (campusBoardToggle) {
  campusBoardToggle.checked = campusBoardEnabled;
  campusBoardToggle.addEventListener('change', () => {
    setCampusBoardEnabled(campusBoardToggle.checked);
  });
}

const conceptVolumesToggle = document.getElementById('conceptVolumesToggle');
if (conceptVolumesToggle) {
  conceptVolumesToggle.checked = conceptVolumesEnabled;
  conceptVolumesToggle.addEventListener('change', () => {
    setConceptVolumesEnabled(conceptVolumesToggle.checked);
  });
}

const climbingHoldsToggle = document.getElementById('climbingHoldsToggle');
if (climbingHoldsToggle) {
  climbingHoldsToggle.checked = climbingHoldsEnabled;
  climbingHoldsToggle.addEventListener('change', () => {
    setClimbingHoldsEnabled(climbingHoldsToggle.checked);
  });
}

const measureToolToggle = document.getElementById('measureToolToggle');
const measureSnapSurfaceToggle = document.getElementById('measureSnapSurfaceToggle');
const measureSnapEdgeToggle = document.getElementById('measureSnapEdgeToggle');
const measureSnapPointToggle = document.getElementById('measureSnapPointToggle');
const measureClearBtn = document.getElementById('measureClearBtn');

function syncMeasureToggleUi() {
  const settings = measurementTool?.getSettings?.() || null;
  if (measureToolToggle) measureToolToggle.checked = !!settings?.enabled;
  if (measureSnapSurfaceToggle) measureSnapSurfaceToggle.checked = !!settings?.snapToSurfaces;
  if (measureSnapEdgeToggle) measureSnapEdgeToggle.checked = !!settings?.snapToEdges;
  if (measureSnapPointToggle) measureSnapPointToggle.checked = !!settings?.snapToVertices;
}

function updateMeasurementSetting(key, value) {
  if (!measurementTool || typeof measurementTool.setSetting !== 'function') return;
  measurementTool.setSetting(key, value);
  syncMeasureToggleUi();
}

if (measureToolToggle) {
  measureToolToggle.addEventListener('change', () => {
    updateMeasurementSetting('enabled', !!measureToolToggle.checked);
  });
}
if (measureSnapSurfaceToggle) {
  measureSnapSurfaceToggle.addEventListener('change', () => {
    updateMeasurementSetting('snapToSurfaces', !!measureSnapSurfaceToggle.checked);
  });
}
if (measureSnapEdgeToggle) {
  measureSnapEdgeToggle.addEventListener('change', () => {
    updateMeasurementSetting('snapToEdges', !!measureSnapEdgeToggle.checked);
  });
}
if (measureSnapPointToggle) {
  measureSnapPointToggle.addEventListener('change', () => {
    updateMeasurementSetting('snapToVertices', !!measureSnapPointToggle.checked);
  });
}
if (measureClearBtn) {
  measureClearBtn.addEventListener('click', () => {
    if (measurementTool && typeof measurementTool.clearAll === 'function') {
      measurementTool.clearAll({segments: true, active: true});
    }
  });
}
syncMeasureToggleUi();
if (measurementTool && typeof measurementTool.render === 'function') measurementTool.render();
if (measurementTool && typeof measurementTool.syncState === 'function') {
  measurementTool.syncState('ui:measure:init');
}

// Resize
function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Animate
let lastAnimateTs = 0;
function animate(now) {
  const ts = Number.isFinite(now) ? now : performance.now();
  const dt = lastAnimateTs > 0
    ? THREE.MathUtils.clamp((ts - lastAnimateTs) / 1000, 0.001, 0.05)
    : (1 / 60);
  lastAnimateTs = ts;

  if (xrSessionActive) {
    updateVrLocomotion(dt);
    updateVrMenuMove(dt);
    updateVrMenuDrag();
    cancelVrMenuMoveIfInactive();
    cancelVrMenuDragIfInactive();
    updateVrControllerPointers();
  } else {
    updateIntroAnimation(ts);
    updateDesktopKeyboardMove(dt);
    if (cameraControlsUtils && typeof cameraControlsUtils.applyOrbitCamera === 'function') {
      cameraControlsUtils.applyOrbitCamera({theta, phi, radius, targetX, targetY, targetZ}, camera);
    } else {
      camera.position.x = targetX + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = targetY + radius * Math.cos(phi);
      camera.position.z = targetZ + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(targetX, targetY, targetZ);
    }
  }
  updateInteractiveAnimations(dt);

  const activeCamera = xrSessionActive ? renderer.xr.getCamera(camera) : camera;
  [scalePersonBillboard, scalePersonCompanionBillboard].forEach((billboard, idx) => {
    if (!billboard) return;
    if (!billboard.parent) {
      if (idx === 0) scalePersonBillboard = null;
      else scalePersonCompanionBillboard = null;
      return;
    }
    personLookAtTarget.copy(activeCamera.position);
    personLookAtTarget.y = billboard.position.y;
    billboard.lookAt(personLookAtTarget);
  });
  renderer.render(scene, camera);
}

async function initExperience() {
  setIntroButtonVisible(false);
  setupWebXR();
  let shouldPlayIntro = true;
  try {
    shouldPlayIntro = !(await detectVrSupport());
  } catch (_) {
    shouldPlayIntro = true;
  }
  if (shouldPlayIntro) startIntroAnimation(true);
  else setIntroButtonVisible(false);
}

initExperience();
renderer.setAnimationLoop(animate);
