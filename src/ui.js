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
const measureRaycaster = new THREE.Raycaster();
const measureMouse = new THREE.Vector2();
const measureScratchVec = new THREE.Vector3();
const measureScratchA = new THREE.Vector3();
const measureScratchB = new THREE.Vector3();
const measureScratchC = new THREE.Vector3();
const measureOverlayGroup = new THREE.Group();
measureOverlayGroup.name = 'measureOverlay';
scene.add(measureOverlayGroup);
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

const REBUILD_THROTTLE_MS = 40;
let queuedRebuildTimer = 0;
let lastRebuildAt = 0;
const UI_REBUILD_STAGE = Object.freeze({
  GEOMETRY: (typeof REBUILD_STAGE !== 'undefined' && REBUILD_STAGE?.GEOMETRY) ? REBUILD_STAGE.GEOMETRY : 'geometry',
  ANNOTATIONS: (typeof REBUILD_STAGE !== 'undefined' && REBUILD_STAGE?.ANNOTATIONS) ? REBUILD_STAGE.ANNOTATIONS : 'annotations',
  CRASH_MATS: (typeof REBUILD_STAGE !== 'undefined' && REBUILD_STAGE?.CRASH_MATS) ? REBUILD_STAGE.CRASH_MATS : 'crashMats',
});
function requestRebuild({immediate=false, stages=null} = {}) {
  if (typeof rebuild !== 'function') return;
  if (typeof invalidateRebuildStages === 'function') {
    if (Array.isArray(stages) && stages.length) invalidateRebuildStages(stages);
    else invalidateRebuildStages();
  }
  const run = () => {
    lastRebuildAt = performance.now();
    if (typeof window?.syncAppStateFromCore === 'function') {
      window.syncAppStateFromCore('ui:requestRebuild');
    }
    rebuild({useDirty: true});
  };
  if (immediate) {
    if (queuedRebuildTimer) {
      clearTimeout(queuedRebuildTimer);
      queuedRebuildTimer = 0;
    }
    run();
    return;
  }
  if (queuedRebuildTimer) return;
  const elapsed = performance.now() - lastRebuildAt;
  const wait = Math.max(0, REBUILD_THROTTLE_MS - elapsed);
  queuedRebuildTimer = setTimeout(() => {
    queuedRebuildTimer = 0;
    run();
  }, wait);
}

const RUNTIME_DESIGN_SYSTEM = (
  typeof window !== 'undefined' &&
  window.ClimbingWallDesignSystem
) ? window.ClimbingWallDesignSystem : null;

function getAvailableDesignDefs() {
  if (!RUNTIME_DESIGN_SYSTEM || typeof RUNTIME_DESIGN_SYSTEM.listDesigns !== 'function') return [];
  const defs = RUNTIME_DESIGN_SYSTEM.listDesigns();
  return Array.isArray(defs) ? defs : [];
}

function getActiveDesignIdSafe() {
  if (!RUNTIME_DESIGN_SYSTEM || typeof RUNTIME_DESIGN_SYSTEM.getActiveDesignId !== 'function') return 'classic';
  const id = RUNTIME_DESIGN_SYSTEM.getActiveDesignId();
  return (typeof id === 'string' && id) ? id : 'classic';
}

function switchDesignAndReload(designId) {
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

function getMeasurementStorageKey() {
  if (RUNTIME_DESIGN_SYSTEM && typeof RUNTIME_DESIGN_SYSTEM.getMeasurementStorageKey === 'function') {
    return RUNTIME_DESIGN_SYSTEM.getMeasurementStorageKey(getActiveDesignIdSafe());
  }
  const active = getActiveDesignIdSafe();
  if (active === 'classic') return 'climbingWall.measureTool.v1';
  return `climbingWall.${active}.measureTool.v1`;
}

function getMeasurementDefaults() {
  const fallback = {
    enabled: false,
    snapToVertices: true,
    snapToEdges: true,
    snapToSurfaces: true,
    showDeltaAxes: true,
    units: 'metric',
  };
  const planned = RUNTIME_DESIGN_SYSTEM?.measurementToolPlan?.defaults;
  if (!planned || typeof planned !== 'object') return fallback;
  return {
    ...fallback,
    ...planned,
  };
}

const MEASUREMENT_STORAGE_KEY = getMeasurementStorageKey();
const MEASUREMENT_DEFAULTS = getMeasurementDefaults();

function loadMeasurementSettings() {
  const out = {...MEASUREMENT_DEFAULTS};
  if (typeof localStorage === 'undefined') return out;
  try {
    const raw = localStorage.getItem(MEASUREMENT_STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    if (typeof parsed.enabled === 'boolean') out.enabled = parsed.enabled;
    if (typeof parsed.snapToVertices === 'boolean') out.snapToVertices = parsed.snapToVertices;
    if (typeof parsed.snapToEdges === 'boolean') out.snapToEdges = parsed.snapToEdges;
    if (typeof parsed.snapToSurfaces === 'boolean') out.snapToSurfaces = parsed.snapToSurfaces;
    if (typeof parsed.showDeltaAxes === 'boolean') out.showDeltaAxes = parsed.showDeltaAxes;
    if (typeof parsed.units === 'string' && parsed.units) out.units = parsed.units;
    return out;
  } catch (_) {
    return out;
  }
}

function saveMeasurementSettings(settings) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(MEASUREMENT_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (_) {
    return false;
  }
}

const measureTool = {
  settings: loadMeasurementSettings(),
  start: null,
  preview: null,
  dragging: false,
  hasDragged: false,
  startMeta: null,
  previewMeta: null,
  segments: [],
};

function syncMeasurementToAppState(source='ui:measure') {
  const app = window?.ClimbingWallAppState;
  if (!app || typeof app.patchState !== 'function') return;
  app.patchState({
    tools: {
      measurement: {
        ...measureTool.settings,
        active: !!measureTool.start,
        segmentCount: measureTool.segments.length,
      },
    },
  }, {source, emit: true});
}

function clearMeasureOverlayGroup() {
  while (measureOverlayGroup.children.length) {
    const child = measureOverlayGroup.children.pop();
    measureOverlayGroup.remove(child);
    child.traverse(obj => {
      if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(mat => {
        if (!mat) return;
        if (mat.map && typeof mat.map.dispose === 'function') mat.map.dispose();
        if (typeof mat.dispose === 'function') mat.dispose();
      });
    });
  }
}

function formatMeasureLabel(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const dist = Math.hypot(dx, dy, dz);
  return `${dist.toFixed(3)}m`;
}

function drawMeasureMarker(point, color=0xffaa55, size=0.05) {
  if (!point) return;
  const sx = size;
  const sy = size;
  const sz = size;
  measureOverlayGroup.add(dimLine3(
    new THREE.Vector3(point.x - sx, point.y, point.z),
    new THREE.Vector3(point.x + sx, point.y, point.z),
    color
  ));
  measureOverlayGroup.add(dimLine3(
    new THREE.Vector3(point.x, point.y - sy, point.z),
    new THREE.Vector3(point.x, point.y + sy, point.z),
    color
  ));
  measureOverlayGroup.add(dimLine3(
    new THREE.Vector3(point.x, point.y, point.z - sz),
    new THREE.Vector3(point.x, point.y, point.z + sz),
    color
  ));
}

function drawMeasureAxes(start, end) {
  if (!measureTool.settings.showDeltaAxes) return;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const dz = Math.abs(end.z - start.z);
  const pX = new THREE.Vector3(end.x, start.y, start.z);
  const pY = new THREE.Vector3(end.x, end.y, start.z);
  if (dx > 0.01) addDim(measureOverlayGroup, start, pX, `dx ${dx.toFixed(2)}m`, 0xe38585);
  if (dy > 0.01) addDim(measureOverlayGroup, pX, pY, `dy ${dy.toFixed(2)}m`, 0x8ccf8c);
  if (dz > 0.01) addDim(measureOverlayGroup, pY, end, `dz ${dz.toFixed(2)}m`, 0x86b7e6);
}

function renderMeasureOverlay() {
  clearMeasureOverlayGroup();
  measureTool.segments.forEach(seg => {
    addDim(measureOverlayGroup, seg.start, seg.end, formatMeasureLabel(seg.start, seg.end), 0xf4d072);
    drawMeasureAxes(seg.start, seg.end);
    drawMeasureMarker(seg.start, 0xf4d072, 0.035);
    drawMeasureMarker(seg.end, 0xf4d072, 0.035);
  });
  if (measureTool.start && measureTool.preview) {
    addDim(measureOverlayGroup, measureTool.start, measureTool.preview, formatMeasureLabel(measureTool.start, measureTool.preview), 0xffb84d);
    drawMeasureAxes(measureTool.start, measureTool.preview);
    drawMeasureMarker(measureTool.start, 0xffb84d, 0.045);
    drawMeasureMarker(measureTool.preview, 0xffb84d, 0.04);
  } else if (measureTool.start) {
    drawMeasureMarker(measureTool.start, 0xffb84d, 0.045);
  }
}

function clearMeasurements({segments=true, active=true} = {}) {
  if (segments) measureTool.segments.length = 0;
  if (active) {
    measureTool.start = null;
    measureTool.preview = null;
    measureTool.startMeta = null;
    measureTool.previewMeta = null;
    measureTool.dragging = false;
    measureTool.hasDragged = false;
  }
  renderMeasureOverlay();
  syncMeasurementToAppState('ui:measure:clear');
}

function isMeasurementTargetMesh(obj) {
  if (!obj?.isMesh || !obj.visible || !obj.geometry) return false;
  if (obj.userData?.isHold) return false;
  if (obj.userData?.vrMenuAction) return false;
  if (obj.userData?.sectionInfo || obj.userData?.isCeilingPanel || obj.userData?.context || obj.userData?.isConceptVolume) return true;
  const box = obj.geometry.boundingBox;
  if (!box) {
    obj.geometry.computeBoundingBox();
  }
  const bb = obj.geometry.boundingBox;
  if (!bb) return false;
  const size = measureScratchVec.copy(bb.max).sub(bb.min);
  return Math.max(size.x, size.y, size.z) >= 0.12;
}

function getMeasurementHit(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  measureMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  measureMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  measureRaycaster.setFromCamera(measureMouse, camera);
  const roots = [];
  if (wallGroup) roots.push(wallGroup);
  if (crashMatsGroup?.visible) roots.push(crashMatsGroup);
  if (environmentGroup?.visible) roots.push(environmentGroup);
  if (!roots.length) return null;
  const hits = measureRaycaster.intersectObjects(roots, true);
  return hits.find(hit => isMeasurementTargetMesh(hit.object)) || null;
}

function getHitTriangleVerticesWorld(hit) {
  const obj = hit?.object;
  const geo = obj?.geometry;
  const pos = geo?.attributes?.position;
  if (!obj || !geo || !pos) return null;
  const index = geo.index;
  const faceIndex = Number(hit.faceIndex);
  if (!Number.isFinite(faceIndex) || faceIndex < 0) return null;
  let i0 = 0;
  let i1 = 1;
  let i2 = 2;
  if (index) {
    i0 = index.getX(faceIndex * 3);
    i1 = index.getX(faceIndex * 3 + 1);
    i2 = index.getX(faceIndex * 3 + 2);
  } else {
    i0 = faceIndex * 3;
    i1 = faceIndex * 3 + 1;
    i2 = faceIndex * 3 + 2;
  }
  if (i2 >= pos.count) return null;
  const a = new THREE.Vector3().fromBufferAttribute(pos, i0);
  const b = new THREE.Vector3().fromBufferAttribute(pos, i1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, i2);
  obj.localToWorld(a);
  obj.localToWorld(b);
  obj.localToWorld(c);
  return [a, b, c];
}

function closestPointOnSegment(point, a, b, outVec) {
  const ab = measureScratchA.copy(b).sub(a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-10) return outVec.copy(a);
  const t = THREE.MathUtils.clamp(measureScratchB.copy(point).sub(a).dot(ab) / lenSq, 0, 1);
  return outVec.copy(a).addScaledVector(ab, t);
}

function resolveMeasurementSnap(hit) {
  if (!hit?.point) return null;
  const basePoint = hit.point.clone();
  const camDist = camera.position.distanceTo(basePoint);
  const snapDist = Math.max(0.025, camDist * 0.016);
  const triVerts = getHitTriangleVerticesWorld(hit);
  let snapped = null;
  let snapType = null;
  let bestDist = Infinity;

  if (triVerts && measureTool.settings.snapToVertices) {
    triVerts.forEach(v => {
      const d = v.distanceTo(basePoint);
      if (d <= snapDist && d < bestDist) {
        bestDist = d;
        snapped = v.clone();
        snapType = 'vertex';
      }
    });
  }

  if (triVerts && measureTool.settings.snapToEdges) {
    const edges = [
      [triVerts[0], triVerts[1]],
      [triVerts[1], triVerts[2]],
      [triVerts[2], triVerts[0]],
    ];
    edges.forEach(([a, b]) => {
      const p = closestPointOnSegment(basePoint, a, b, new THREE.Vector3());
      const d = p.distanceTo(basePoint);
      if (d <= snapDist * 1.15 && d < bestDist) {
        bestDist = d;
        snapped = p.clone();
        snapType = 'edge';
      }
    });
  }

  if (!snapped && !measureTool.settings.snapToSurfaces) return null;
  if (!snapped) {
    snapped = basePoint.clone();
    snapType = 'surface';
  }

  return {
    point: snapped,
    type: snapType,
    object: hit.object,
  };
}

function pickMeasurementPoint(clientX, clientY) {
  const hit = getMeasurementHit(clientX, clientY);
  if (!hit) return null;
  return resolveMeasurementSnap(hit);
}

function commitMeasurementSegment(start, end, meta={}) {
  if (!start || !end) return false;
  if (start.distanceTo(end) < 0.01) return false;
  measureTool.segments.push({
    start: start.clone(),
    end: end.clone(),
    meta: {...meta},
  });
  if (measureTool.segments.length > 16) measureTool.segments.shift();
  return true;
}

function updateMeasurePointerMove(clientX, clientY) {
  if (!measureTool.settings.enabled || !measureTool.start) return false;
  const snap = pickMeasurementPoint(clientX, clientY);
  if (!snap) return true;
  measureTool.preview = snap.point.clone();
  measureTool.previewMeta = snap;
  if (measureTool.start.distanceTo(measureTool.preview) > 0.005) {
    measureTool.hasDragged = true;
  }
  renderMeasureOverlay();
  return true;
}

function handleMeasureMouseDown(e) {
  if (!measureTool.settings.enabled) return false;
  if (e.button !== 0) return false;
  const snap = pickMeasurementPoint(e.clientX, e.clientY);
  if (!snap) return false;
  if (!measureTool.start) {
    measureTool.start = snap.point.clone();
    measureTool.startMeta = snap;
  } else {
    measureTool.preview = snap.point.clone();
    measureTool.previewMeta = snap;
  }
  measureTool.dragging = true;
  measureTool.hasDragged = false;
  renderMeasureOverlay();
  e.preventDefault();
  return true;
}

function handleMeasureMouseUp(e) {
  if (!measureTool.settings.enabled || !measureTool.dragging) return false;
  if (e.button !== 0) return false;
  measureTool.dragging = false;
  if (!measureTool.start || !measureTool.preview) return true;
  const shouldCommit = measureTool.hasDragged || measureTool.start.distanceTo(measureTool.preview) > 0.05;
  if (shouldCommit && commitMeasurementSegment(measureTool.start, measureTool.preview, {
    startType: measureTool.startMeta?.type || 'surface',
    endType: measureTool.previewMeta?.type || 'surface',
  })) {
    measureTool.start = null;
    measureTool.preview = null;
    measureTool.startMeta = null;
    measureTool.previewMeta = null;
    syncMeasurementToAppState('ui:measure:commit');
  }
  renderMeasureOverlay();
  return true;
}

function cancelActiveMeasurement() {
  if (!measureTool.start && !measureTool.dragging) return false;
  measureTool.start = null;
  measureTool.preview = null;
  measureTool.startMeta = null;
  measureTool.previewMeta = null;
  measureTool.dragging = false;
  measureTool.hasDragged = false;
  renderMeasureOverlay();
  syncMeasurementToAppState('ui:measure:cancel');
  return true;
}

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

const VR_MENU_BG_COLOR = 0xd7dce2;
const VR_MENU_TEXT_COLOR = '#2f3338';
const VR_MENU_TEXT_DARK_COLOR = '#21262b';
const VR_MENU_TRACK_COLOR = 0x9aa5b0;
const VR_MENU_FILL_COLOR = 0x5f7183;
const VR_MENU_KNOB_COLOR = 0x2f3338;
const VR_MENU_CLOSE_COLOR = 0xbac2ca;
const VR_MENU_CLOSE_HOVER_COLOR = 0x90a4b9;
const VR_MENU_TRACK_HOVER_COLOR = 0xb8a17c;
const VR_MENU_FILL_HOVER_COLOR = 0x8f7450;
const VR_MENU_KNOB_HOVER_COLOR = 0xf0cf98;
const VR_MENU_NUDGE_COLOR = 0xb7c0c9;
const VR_MENU_CURSOR_COLOR = 0x000000;
const VR_MENU_CURSOR_RADIUS = 0.003;
const VR_MENU_CURSOR_OFFSET = 0.008;
const VR_MENU_GRAB_RADIUS_SPEED = 1.20;
const VR_MENU_DISTANCE = 0.52;
const VR_MENU_SIDE_OFFSET = 0.18;
const VR_MENU_DOWN_OFFSET = -0.18;
const VR_MENU_SCALE = 0.66;
const VR_MENU_BASE_WIDTH = 0.90;
const VR_MENU_ROW_HEIGHT = 0.095;
const VR_MENU_PADDING_X = 0.08;
const VR_MENU_PADDING_Y = 0.05;
const VR_MENU_RENDER_ORDER_BUMP = 100000;
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

function makeVrTextPlane(text, width=0.46, height=0.11, style={}) {
  const canvas = document.createElement('canvas');
  canvas.width = style.canvasWidth || 512;
  canvas.height = style.canvasHeight || 128;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = 2140;
  mesh.userData.textCanvas = canvas;
  mesh.userData.textContext = ctx;
  mesh.userData.textTexture = tex;
  mesh.userData.textStyle = {
    color: style.color || VR_MENU_TEXT_COLOR,
    bg: style.bg || null,
    fontPx: Number(style.fontPx) || 46,
    fontWeight: style.fontWeight || '700',
    align: style.align || 'center',
    padding: Number(style.padding) || 26,
  };
  updateVrTextPlane(mesh, text);
  return mesh;
}

function updateVrTextPlane(mesh, text) {
  if (!mesh?.userData?.textCanvas || !mesh?.userData?.textContext || !mesh?.userData?.textTexture) return;
  const canvas = mesh.userData.textCanvas;
  const ctx = mesh.userData.textContext;
  const style = mesh.userData.textStyle || {};
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (style.bg) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = style.color || VR_MENU_TEXT_COLOR;
  ctx.font = `${style.fontWeight || '700'} ${style.fontPx || 46}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = style.align || 'center';
  const pad = Number(style.padding) || 26;
  let x = canvas.width * 0.5;
  if (ctx.textAlign === 'left') x = pad;
  else if (ctx.textAlign === 'right') x = canvas.width - pad;
  ctx.fillText(String(text), x, canvas.height * 0.5);
  mesh.userData.textTexture.needsUpdate = true;
}

function makeVrMenuButton(label, width=0.17, height=0.08, color=0xbec5cc) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      transparent: false,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  m.renderOrder = 2100;
  const txt = makeVrTextPlane(label, width * 0.82, height * 0.60, {
    color: VR_MENU_TEXT_DARK_COLOR,
    fontPx: 77,
    fontWeight: '700',
  });
  txt.position.z = 0.004;
  m.add(txt);
  return m;
}

function makeVrMenuCursor() {
  const cursor = new THREE.Mesh(
    new THREE.CircleGeometry(VR_MENU_CURSOR_RADIUS, 18),
    new THREE.MeshBasicMaterial({
      color: VR_MENU_CURSOR_COLOR,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  const border = new THREE.Mesh(
    new THREE.RingGeometry(VR_MENU_CURSOR_RADIUS * 1.18, VR_MENU_CURSOR_RADIUS * 1.72, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  border.position.z = -0.0004;
  border.renderOrder = VR_MENU_RENDER_ORDER_BUMP + 899999;
  border.frustumCulled = false;
  cursor.add(border);
  cursor.visible = false;
  cursor.renderOrder = VR_MENU_RENDER_ORDER_BUMP + 900000;
  cursor.frustumCulled = false;
  return cursor;
}

function enforceVrMenuOverlay(root) {
  if (!root) return;
  root.traverse(obj => {
    obj.frustumCulled = false;
    const currentOrder = Number(obj.renderOrder);
    const base = Number.isFinite(currentOrder) ? currentOrder : 0;
    obj.renderOrder = base + VR_MENU_RENDER_ORDER_BUMP;
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if (!mat) return;
      mat.transparent = true;
      if (!Number.isFinite(mat.opacity)) mat.opacity = 1.0;
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.fog = false;
      mat.needsUpdate = true;
    });
  });
}

function setVrMenuSliderHoverKey(key=null) {
  const hoverKey = key || null;
  Object.keys(vrQuickMenu.slidersByKey || {}).forEach(sliderKey => {
    const slider = vrQuickMenu.slidersByKey[sliderKey];
    if (!slider) return;
    const isHover = hoverKey === sliderKey;
    if (slider.track?.material?.color) {
      slider.track.material.color.setHex(isHover ? VR_MENU_TRACK_HOVER_COLOR : VR_MENU_TRACK_COLOR);
    }
    if (slider.fill?.material?.color) {
      slider.fill.material.color.setHex(isHover ? VR_MENU_FILL_HOVER_COLOR : VR_MENU_FILL_COLOR);
    }
    if (slider.knob?.material?.color) {
      slider.knob.material.color.setHex(isHover ? VR_MENU_KNOB_HOVER_COLOR : VR_MENU_KNOB_COLOR);
    }
  });
  vrQuickMenu.hoveredKey = hoverKey;
}

function setVrMenuCloseHover(active=false) {
  const hovered = !!active;
  if (vrQuickMenu.closeHovered === hovered) return;
  vrQuickMenu.closeHovered = hovered;
  const closeBtn = vrQuickMenu.closeBtn;
  const mat = closeBtn?.material;
  if (mat?.color) mat.color.setHex(hovered ? VR_MENU_CLOSE_HOVER_COLOR : VR_MENU_CLOSE_COLOR);
}

function orientVrMenuTowardWorldPoint(worldPoint) {
  if (!vrQuickMenu.group || !worldPoint) return;
  vrMenuFaceDir.copy(worldPoint).sub(vrQuickMenu.group.position);
  if (vrMenuFaceDir.lengthSq() < 1e-10) return;
  vrMenuFaceDir.normalize();
  const yaw = Math.atan2(vrMenuFaceDir.x, vrMenuFaceDir.z);
  const pitch = Math.asin(THREE.MathUtils.clamp(vrMenuFaceDir.y, -1, 1));
  vrMenuFaceEuler.set(-pitch, yaw, 0, 'YXZ');
  vrQuickMenu.group.quaternion.setFromEuler(vrMenuFaceEuler);
}

function quantizeVrSliderValue(def, value) {
  const min = Number(def?.min) || 0;
  const max = Number(def?.max) || min;
  let v = THREE.MathUtils.clamp(Number(value) || min, min, max);
  const step = Math.abs(Number(def?.step) || 0);
  if (step > 0) {
    const n = Math.round((v - min) / step);
    v = min + n * step;
    const stepStr = String(step);
    const fracLen = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
    if (fracLen > 0) v = Number(v.toFixed(Math.min(6, fracLen + 1)));
    v = THREE.MathUtils.clamp(v, min, max);
  }
  return v;
}

function updateVrMenuSliderVisual(slider, value) {
  if (!slider) return;
  const def = slider.def;
  const min = Number(def.min) || 0;
  const max = Number(def.max) || min;
  const span = Math.max(1e-6, max - min);
  const v = THREE.MathUtils.clamp(Number(value) || min, min, max);
  const t = THREE.MathUtils.clamp((v - min) / span, 0, 1);
  const trackW = slider.trackWidth;
  const left = slider.trackCenterX - trackW * 0.5;
  slider.fill.scale.x = Math.max(0.0001, t);
  slider.fill.position.x = left + (trackW * t * 0.5);
  slider.knob.position.x = left + trackW * t;
  if (slider.valueLabel) updateVrTextPlane(slider.valueLabel, def.fmt(v));
}

function getVrMenuCurrentValue(key, def) {
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
  if (!vrQuickMenu.open) return;
  Object.keys(vrQuickMenu.slidersByKey || {}).forEach(key => {
    const slider = vrQuickMenu.slidersByKey[key];
    if (!slider) return;
    updateVrMenuSliderVisual(slider, getVrMenuCurrentValue(key, slider.def));
  });
}

function clearVrQuickMenu() {
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
  if (!info) return null;
  if (info.hoverKind === 'trainingRig' || info.wall === 'R') return 'R';
  const id = String(info.wall || '').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(VR_MENU_TARGET_KEYS, id)) return id;
  return null;
}

function vrMenuTitleForTarget(target) {
  if (target === 'S') return 'Wall Size';
  if (target === 'R') return 'Training Rig';
  return `Wall ${target}`;
}

function getVrMenuDesignDefs() {
  const defs = getAvailableDesignDefs();
  if (defs.length) return defs;
  return [{id: getActiveDesignIdSafe(), label: getActiveDesignIdSafe(), status: 'active'}];
}

function applyVrMenuStateKey(key, nextValue) {
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
  const keys = VR_MENU_TARGET_KEYS[target];
  if (!keys) return false;
  clearVrQuickMenu();

  const width = VR_MENU_BASE_WIDTH;
  const rowH = VR_MENU_ROW_HEIGHT;
  const hasHeightRecalc = target === 'S';
  const designDefs = target === 'S' ? getVrMenuDesignDefs().filter(def => !!def?.id) : [];
  const hasDesignSwitcher = target === 'S' && designDefs.length > 1;
  const sliderRows = keys.length;
  const extraRows = (hasHeightRecalc ? 1 : 0) + (hasDesignSwitcher ? 1 : 0);
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
  const target = resolveVrMenuTarget(info);
  if (!target) return false;
  return buildVrQuickMenu(target);
}

function getVrMenuInteractiveHit() {
  if (!vrQuickMenu.open || !vrQuickMenu.interactive.length) return null;
  xrMenuRaycaster.far = XR_TELEPORT_MAX_DISTANCE;
  xrMenuRaycaster.set(xrRayOrigin, xrRayDir);
  const hits = xrMenuRaycaster.intersectObjects(vrQuickMenu.interactive, false);
  return hits.length ? hits[0] : null;
}

function setVrMenuSliderFromHit(slider, hitPoint) {
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
  const slider = vrQuickMenu.slidersByKey?.[key];
  if (!slider) return false;
  vrMenuDrag.active = true;
  vrMenuDrag.controllerIndex = controllerIndex;
  vrMenuDrag.key = key;
  if (hitPoint) setVrMenuSliderFromHit(slider, hitPoint);
  return true;
}

function endVrMenuDrag(controllerIndex=null) {
  if (!vrMenuDrag.active) return false;
  if (Number.isInteger(controllerIndex) && vrMenuDrag.controllerIndex !== controllerIndex) return false;
  vrMenuDrag.active = false;
  vrMenuDrag.controllerIndex = -1;
  vrMenuDrag.key = null;
  return true;
}

function beginVrMenuMove(controllerIndex, hitPoint=null, hitDistance=VR_MENU_DISTANCE) {
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
  if (!state) return;
  state.suppressWorldSelectUntil = performance.now() + XR_MENU_WORLD_CLICK_SUPPRESS_MS;
}

function consumeVrWorldSelectSuppression(state) {
  if (!state) return false;
  const until = Number(state.suppressWorldSelectUntil) || 0;
  if (until <= 0) return false;
  state.suppressWorldSelectUntil = 0;
  return performance.now() <= until;
}

function onVrControllerSelectStart(event) {
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
  const state = xrControllers.find(s => s.controller === event?.target);
  if (!state) return;
  state.suppressWorldSelectUntil = 0;
  endVrMenuDrag(state.index);
}

function onVrControllerSqueezeStart(event) {
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
  const state = xrControllers.find(s => s.controller === event?.target);
  if (!state) return;
  endVrMenuMove(state.index);
}

function cancelVrMenuDragIfInactive() {
  if (!vrMenuDrag.active) return;
  const state = xrControllers.find(s => s.index === vrMenuDrag.controllerIndex);
  if (!state?.connected) {
    endVrMenuDrag();
    return true;
  }
  return false;
}

function cancelVrMenuMoveIfInactive() {
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
  if (state && vrMenuMove.active && vrMenuMove.controllerIndex === state.index) return;
  if (state && endVrMenuDrag(state.index)) {
    state.suppressWorldSelectUntil = 0;
    return;
  }
  if (state && consumeVrWorldSelectSuppression(state)) return;
  const controller = state?.controller || event?.target;
  if (!controller || !readControllerWorldRay(controller)) return;
  if (vrQuickMenu.open) {
    const menuHit = getVrMenuInteractiveHit();
    if (handleVrMenuSelect(menuHit, state?.index ?? null, false)) return;
  }
  const interactiveHit = getVrInteractiveHit();
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
  if (xrSessionActive) return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target;
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return true;
  return false;
}

function setDesktopMoveKeyState(e, pressed) {
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
  desktopMoveKeys.forward = false;
  desktopMoveKeys.back = false;
  desktopMoveKeys.left = false;
  desktopMoveKeys.right = false;
  desktopMoveKeys.fast = false;
}

function updateDesktopKeyboardMove(dt) {
  if (xrSessionActive || introAnim.active) return;
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
  if (handleMeasureMouseDown(e)) {
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
  if (cancelActiveMeasurement()) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
});
window.addEventListener('mouseup', e => {
  handleMeasureMouseUp(e);
  isDragging = false;
  dragMode = 'orbit';
});
window.addEventListener('mousemove', e => {
  if (measureTool.settings.enabled && measureTool.dragging) {
    updateMeasurePointerMove(e.clientX, e.clientY);
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
  if (updateMeasurePointerMove(e.clientX, e.clientY)) return;
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
  if (e.code === 'Escape' && cancelActiveMeasurement()) {
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

function initDesignSelector() {
  const select = document.getElementById('designSelect');
  if (!select) return;
  const defs = getAvailableDesignDefs();
  const activeId = getActiveDesignIdSafe();
  select.innerHTML = '';
  defs.forEach(def => {
    const id = String(def?.id || '').trim();
    if (!id) return;
    const opt = document.createElement('option');
    opt.value = id;
    const label = String(def?.label || id);
    const status = String(def?.status || '').trim();
    opt.textContent = status && status !== 'active' ? `${label} (${status})` : label;
    if (id === activeId) opt.selected = true;
    select.appendChild(opt);
  });
  if (!select.options.length) {
    const fallback = document.createElement('option');
    fallback.value = activeId;
    fallback.textContent = activeId;
    fallback.selected = true;
    select.appendChild(fallback);
  }
  select.value = activeId;
  select.addEventListener('change', () => {
    const next = String(select.value || '').trim();
    if (!next || next === activeId) return;
    const ok = switchDesignAndReload(next);
    if (!ok) {
      select.value = activeId;
      showSaveStatus('Design switch failed', true);
      return;
    }
    showSaveStatus('Switching design...');
  });
}

initDesignSelector();

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
  if (measureToolToggle) measureToolToggle.checked = !!measureTool.settings.enabled;
  if (measureSnapSurfaceToggle) measureSnapSurfaceToggle.checked = !!measureTool.settings.snapToSurfaces;
  if (measureSnapEdgeToggle) measureSnapEdgeToggle.checked = !!measureTool.settings.snapToEdges;
  if (measureSnapPointToggle) measureSnapPointToggle.checked = !!measureTool.settings.snapToVertices;
}

function updateMeasurementSetting(key, value) {
  if (!Object.prototype.hasOwnProperty.call(measureTool.settings, key)) return;
  measureTool.settings[key] = value;
  saveMeasurementSettings(measureTool.settings);
  if (!measureTool.settings.enabled) cancelActiveMeasurement();
  syncMeasureToggleUi();
  renderMeasureOverlay();
  syncMeasurementToAppState(`ui:measure:${key}`);
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
    clearMeasurements({segments: true, active: true});
  });
}
syncMeasureToggleUi();
renderMeasureOverlay();
syncMeasurementToAppState('ui:measure:init');

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
    camera.position.x = targetX + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = targetY + radius * Math.cos(phi);
    camera.position.z = targetZ + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(targetX, targetY, targetZ);
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
