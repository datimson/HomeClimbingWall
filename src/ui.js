// --- Orbit controls ---
let isDragging = false;
let dragMode = 'orbit';
let lastX = 0, lastY = 0;
let theta = 0.9, phi = 0.55, radius = 12;
const ORBIT_MIN_POLAR = 0.05;
const ORBIT_MAX_POLAR = Math.PI - 0.05;
let targetX = 2, targetY = 1.7, targetZ = 1.5;
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

const XR_FLOOR_EYE_HEIGHT = 1.72;
const XR_MOVE_SPEED_MPS = 1.9;
const XR_FLY_SPEED_MPS = 1.7;
const XR_STICK_DEADZONE = 0.16;
const XR_STICK_CLICK_BUTTON_INDEX = 3;
const XR_TELEPORT_MAX_DISTANCE = 20;
const XR_TELEPORT_SURFACE_EPS = 0.012;
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
let xrSupportChecked = false;
let xrSupported = false;
let xrSessionRequestInFlight = false;
let xrMoveMode = XR_MOVE_MODE.GROUNDED;
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
const xrRayPlane = new THREE.Plane();
const xrRay = new THREE.Ray();
const xrRayMatrix = new THREE.Matrix4();
const xrRaycaster = new THREE.Raycaster();
const xrStartWorld = new THREE.Vector3();
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

function getVrMoveAxes(session) {
  if (!session?.inputSources) return {x: 0, y: 0};
  let leftStick = null;
  let fallback = null;
  let fallbackMag = 0;
  for (const source of session.inputSources) {
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

function updateVrControllerConnection(state, connected, data=null) {
  if (!state) return;
  state.connected = !!connected;
  state.handedness = data?.handedness || 'none';
  state.inputSource = data || null;
  state.interactiveHit = null;
  state.floorHit = null;
  state.stickPressedLast = false;
  if (state.rayLine) state.rayLine.visible = xrSessionActive && state.connected;
}

function ensureVrControllers() {
  if (xrControllersReady || !renderer?.xr) return;
  xrControllersReady = true;
  const makeState = index => {
    const controller = renderer.xr.getController(index);
    const rayLine = makeVrControllerRay();
    controller.add(rayLine);
    const state = {
      index,
      controller,
      rayLine,
      connected: false,
      handedness: 'none',
      inputSource: null,
      interactiveHit: null,
      floorHit: null,
      stickPressedLast: false,
    };
    controller.addEventListener('connected', ev => {
      updateVrControllerConnection(state, true, ev?.data || null);
    });
    controller.addEventListener('disconnected', () => {
      updateVrControllerConnection(state, false, null);
    });
    controller.addEventListener('selectend', onVrControllerSelectEnd);
    xrRig.add(controller);
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
  const xrCam = renderer.xr.getCamera(camera);
  xrCam.updateMatrixWorld(true);
  xrHeadWorld.setFromMatrixPosition(xrCam.matrixWorld);
  const floorY = getActiveFloorY(targetPoint.x, targetPoint.z);
  const desiredHeadY = floorY + XR_FLOOR_EYE_HEIGHT;
  xrRig.position.x += targetPoint.x - xrHeadWorld.x;
  xrRig.position.z += targetPoint.z - xrHeadWorld.z;
  xrRig.position.y += desiredHeadY - xrHeadWorld.y;
  targetX = xrRig.position.x;
  targetY = xrRig.position.y;
  targetZ = xrRig.position.z;
  return true;
}

function captureVrStartPosition() {
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(xrStartWorld);
  xrEntryStartPos = {
    x: xrStartWorld.x,
    z: xrStartWorld.z,
  };
}

function toggleVrMoveMode() {
  xrMoveMode = (xrMoveMode === XR_MOVE_MODE.GROUNDED) ? XR_MOVE_MODE.FLY : XR_MOVE_MODE.GROUNDED;
  if (xrMoveMode !== XR_MOVE_MODE.GROUNDED || !xrSessionActive) return;
  const xrCam = renderer.xr.getCamera(camera);
  xrCam.updateMatrixWorld(true);
  xrHeadWorld.setFromMatrixPosition(xrCam.matrixWorld);
  const floorY = getActiveFloorY(xrHeadWorld.x, xrHeadWorld.z);
  const desiredHeadY = floorY + XR_FLOOR_EYE_HEIGHT;
  xrRig.position.y += desiredHeadY - xrHeadWorld.y;
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

function snapVrRigToFloor(xrCam) {
  if (!xrCam) return;
  xrCam.updateMatrixWorld(true);
  xrHeadWorld.setFromMatrixPosition(xrCam.matrixWorld);
  const floorY = getActiveFloorY(xrHeadWorld.x, xrHeadWorld.z);
  const desiredHeadY = floorY + XR_FLOOR_EYE_HEIGHT;
  if (Math.abs(desiredHeadY - xrHeadWorld.y) > 1e-4) {
    xrRig.position.y += desiredHeadY - xrHeadWorld.y;
  }
}

function toggleEWallSweep() {
  const curr = THREE.MathUtils.clamp(Number(wallState.eAngle) || 0, eSweepAnim.minDeg, eSweepAnim.maxDeg);
  if (curr >= eSweepAnim.maxDeg - 0.05) eSweepAnim.dir = -1;
  else if (curr <= eSweepAnim.minDeg + 0.05) eSweepAnim.dir = 1;
  eSweepAnim.active = !eSweepAnim.active;
}

function toggleTrainingRigOpenClose() {
  const basis = Number.isFinite(rigToggleAnim.targetDeg)
    ? rigToggleAnim.targetDeg
    : THREE.MathUtils.clamp(Number(wallState.rigOpen) || 0, 0, 180);
  rigToggleAnim.targetDeg = basis >= 90 ? 0 : 180;
  rigToggleAnim.lastRebuildDeg = NaN;
}

function handleVrInteractiveClick(hit) {
  const info = hit?.object?.userData?.sectionInfo;
  if (!info) return false;
  if (info.wall === 'E') {
    toggleEWallSweep();
    return true;
  }
  if (info.hoverKind === 'trainingRig' || info.wall === 'R') {
    toggleTrainingRigOpenClose();
    return true;
  }
  return false;
}

function onVrControllerSelectEnd(event) {
  if (!xrSessionActive) return;
  const state = xrControllers.find(s => s.controller === event?.target);
  const controller = state?.controller || event?.target;
  if (!controller || !readControllerWorldRay(controller)) return;
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
    });
    return;
  }

  let bestTeleport = null;
  let bestTeleportDist = Infinity;
  xrControllers.forEach(state => {
    if (!state?.controller || !state?.rayLine || !state.connected || !readControllerWorldRay(state.controller)) {
      if (state?.rayLine) state.rayLine.visible = false;
      return;
    }
    const interactiveHit = getVrInteractiveHit();
    const maxFloorDist = interactiveHit ? Math.max(0.06, interactiveHit.distance - 0.02) : XR_TELEPORT_MAX_DISTANCE;
    const floorHit = getVrFloorHit(maxFloorDist);
    state.interactiveHit = interactiveHit;
    state.floorHit = floorHit;

    let color = XR_RAY_COLOR_IDLE;
    let lineDistance = XR_TELEPORT_MAX_DISTANCE;
    if (interactiveHit) {
      color = XR_RAY_COLOR_INTERACTIVE;
      lineDistance = interactiveHit.distance;
    } else if (floorHit) {
      color = XR_RAY_COLOR_TELEPORT;
      lineDistance = floorHit.distance;
      if (floorHit.distance < bestTeleportDist) {
        bestTeleportDist = floorHit.distance;
        bestTeleport = floorHit.point;
      }
    }
    setVrControllerRayStyle(state, lineDistance, color);
  });

  if (bestTeleport) {
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
  targetY = startFloorY + XR_FLOOR_EYE_HEIGHT;
  targetZ = startZ;
  xrRig.position.set(targetX, targetY, targetZ);
  xrRig.rotation.set(0, 0, 0);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  xrMoveMode = XR_MOVE_MODE.GROUNDED;
  xrEntryStartPos = null;
  eSweepAnim.active = false;
  rigToggleAnim.targetDeg = null;
  rigToggleAnim.lastRebuildDeg = NaN;
  xrTeleportMarker.visible = false;
  xrControllers.forEach(state => {
    state.interactiveHit = null;
    state.floorHit = null;
    state.stickPressedLast = false;
    if (state.rayLine) state.rayLine.visible = !!state.connected;
  });
}

function endVrSession() {
  hideHoverInfo();
  xrTeleportMarker.visible = false;
  xrControllers.forEach(state => {
    state.interactiveHit = null;
    state.floorHit = null;
    state.stickPressedLast = false;
    if (state.rayLine) state.rayLine.visible = false;
  });
  eSweepAnim.active = false;
  rigToggleAnim.targetDeg = null;
  rigToggleAnim.lastRebuildDeg = NaN;
  xrMoveMode = XR_MOVE_MODE.GROUNDED;
  xrEntryStartPos = null;
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

  updateVrMoveModeToggle();
  if (xrMoveMode === XR_MOVE_MODE.GROUNDED) snapVrRigToFloor(xrCam);

  const axes = getVrMoveAxes(session);
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
  if (xrMoveMode === XR_MOVE_MODE.GROUNDED) snapVrRigToFloor(xrCam);
  targetX = xrRig.position.x;
  targetY = xrRig.position.y;
  targetZ = xrRig.position.z;
}

const INTRO_DELAY_MS = 1300;
const INTRO_TOTAL_MS = 25000;
const INTRO_END_EASE_WINDOW = 0.14; // final 14% of timeline eases to a stop
const INTRO_RIG_REBUILD_STEP_DEG = 0.8;

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
  if (doRebuild) rebuild();
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
  if (!Number.isFinite(introAnim.lastRigOpen) || Math.abs(rigOpen - introAnim.lastRigOpen) >= INTRO_RIG_REBUILD_STEP_DEG) {
    setRigOpenValue(rigOpen, true);
    introAnim.lastRigOpen = rigOpen;
  }

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
  isDragging = true;
  dragMode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
  lastX = e.clientX; lastY = e.clientY;
});
wrap.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('mouseup', () => {
  isDragging = false;
  dragMode = 'orbit';
});
window.addEventListener('mousemove', e => {
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
wrap.addEventListener('mousemove', e => updateHover(e.clientX, e.clientY));
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

// ── Slider wiring ──
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
    wallState[stateKey] = v;
    if (stateKey === 'eAngle') eSweepAnim.active = false;
    if (stateKey === 'rigOpen') {
      rigToggleAnim.targetDeg = null;
      rigToggleAnim.lastRebuildDeg = NaN;
    }
    if (lbl) lbl.textContent = fmt(v);
    if (triggerRebuild) rebuild();
    else setAdjAngle(wallState.eAngle);
  });
}

function syncSlidersFromState() {
  const defs = [
    ['angleSlider', 'angleLabel', 'eAngle', v => v + '°'],
    ['aAngle', 'aAngleLabel', 'aAngle', v => v + '°'],
    ['aWidth', 'aWidthLabel', 'aWidth', v => v.toFixed(2) + 'm'],
    ['bAngle', 'bAngleLabel', 'bAngle', v => v + '°'],
    ['bWidth', 'bWidthLabel', 'bWidth', v => v.toFixed(2) + 'm'],
    ['cAngle', 'cAngleLabel', 'cAngle', v => v + '°'],
    ['cWidth', 'cWidthLabel', 'cWidth', v => v.toFixed(2) + 'm'],
    ['dAngle', 'dAngleLabel', 'dAngle', v => v + '°'],
    ['d1Height', 'd1HeightLabel', 'd1Height', v => v.toFixed(2) + 'm'],
    ['d2Angle', 'd2AngleLabel', 'd2Angle', v => v + '°'],
    ['f1Angle', 'f1AngleLabel', 'f1Angle', v => v + '°'],
    ['f1Height', 'f1HeightLabel', 'f1Height', v => v.toFixed(2) + 'm'],
    ['f1Width', 'f1WidthLabel', 'f1Width', v => v.toFixed(2) + 'm'],
    ['f2Angle', 'f2AngleLabel', 'f2Angle', v => v + '°'],
    ['f2WidthTop', 'f2WidthTopLabel', 'f2WidthTop', v => v.toFixed(2) + 'm'],
    ['rigOpen', 'rigOpenLabel', 'rigOpen', v => Math.round(v) + '°'],
  ];
  defs.forEach(([id, labelId, key, fmt]) => {
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    if (!el || !Number.isFinite(wallState[key])) return;
    el.value = String(wallState[key]);
    if (lbl) lbl.textContent = fmt(wallState[key]);
  });
}

bindSlider('angleSlider', 'angleLabel', 'eAngle', v => v + '°', true);
bindSlider('aAngle', 'aAngleLabel', 'aAngle', v => v + '°', true);
bindSlider('aWidth', 'aWidthLabel', 'aWidth', v => v.toFixed(2) + 'm', true);
bindSlider('bAngle', 'bAngleLabel', 'bAngle', v => v + '°', true);
bindSlider('bWidth', 'bWidthLabel', 'bWidth', v => v.toFixed(2) + 'm', true);
bindSlider('cAngle', 'cAngleLabel', 'cAngle', v => v + '°', true);
bindSlider('cWidth', 'cWidthLabel', 'cWidth', v => v.toFixed(2) + 'm', true);
bindSlider('dAngle', 'dAngleLabel', 'dAngle', v => v + '°', true);
bindSlider('d1Height', 'd1HeightLabel', 'd1Height', v => v.toFixed(2) + 'm', true);
bindSlider('d2Angle', 'd2AngleLabel', 'd2Angle', v => v + '°', true);
bindSlider('f1Angle', 'f1AngleLabel', 'f1Angle', v => v + '°', true);
bindSlider('f1Height', 'f1HeightLabel', 'f1Height', v => v.toFixed(2) + 'm', true);
bindSlider('f1Width', 'f1WidthLabel', 'f1Width', v => v.toFixed(2) + 'm', true);
bindSlider('f2Angle', 'f2AngleLabel', 'f2Angle', v => v + '°', true);
bindSlider('f2WidthTop', 'f2WidthTopLabel', 'f2WidthTop', v => v.toFixed(2) + 'm', true);
bindSlider('rigOpen', 'rigOpenLabel', 'rigOpen', v => Math.round(v) + '°', true);
syncSlidersFromState();

const wallControlsDetails = document.getElementById('wallControlsDetails');
if (wallControlsDetails && window.matchMedia && window.matchMedia('(max-width: 980px)').matches) {
  wallControlsDetails.removeAttribute('open');
}

const saveConfigBtn = document.getElementById('saveConfigBtn');
if (saveConfigBtn) {
  saveConfigBtn.addEventListener('click', () => {
    const okWalls = saveWallState(true);
    const okCamera = persistCurrentCameraState();
    const ok = okWalls && okCamera;
    showSaveStatus(ok ? 'Saved as defaults' : 'Save failed', !ok);
  });
}

const resetConfigBtn = document.getElementById('resetConfigBtn');
if (resetConfigBtn) {
  resetConfigBtn.addEventListener('click', () => {
    resetWallState();
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
    rebuild();
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
    updateVrControllerPointers();
  } else {
    updateIntroAnimation(ts);
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
setupWebXR();
startIntroAnimation(true);
renderer.setAnimationLoop(animate);
