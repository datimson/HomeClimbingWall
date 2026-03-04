// --- Orbit controls ---
let isDragging = false, isRightDrag = false;
let lastX = 0, lastY = 0;
let theta = 0.9, phi = 0.55, radius = 12;
const ORBIT_MIN_POLAR = 0.05;
const ORBIT_MAX_POLAR = Math.PI - 0.05;
let targetX = 2, targetY = 1.5, targetZ = 1.5;
const raycaster = new THREE.Raycaster();
const hoverMouse = new THREE.Vector2();
const hoverInfoEl = document.getElementById('hoverInfo');
const saveStatusEl = document.getElementById('saveStatus');
let activeHoverMesh = null;
let dimsAreFaded = false;
let sceneIsFaded = false;
let focusedMaterialEntries = [];
let activeFocusMesh = null;
const personLookAtTarget = new THREE.Vector3();

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

wrap.addEventListener('mousedown', e => {
  hideHoverInfo();
  isDragging = true;
  isRightDrag = e.button === 2;
  lastX = e.clientX; lastY = e.clientY;
});
wrap.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (isRightDrag) {
    targetX -= dx * 0.01; targetY += dy * 0.01;
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
wrap.addEventListener('touchstart', e => {
  hideHoverInfo();
  if (e.touches.length === 1) { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
  if (e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
});
wrap.addEventListener('touchend', () => { isDragging = false; lastTouchDist = null; });
wrap.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    theta -= dx * 0.005;
    phi = Math.max(ORBIT_MIN_POLAR, Math.min(ORBIT_MAX_POLAR, phi - dy * 0.005));
  }
  if (e.touches.length === 2 && lastTouchDist !== null) {
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    radius = Math.max(3, Math.min(25, radius - (dist - lastTouchDist) * 0.02));
    lastTouchDist = dist;
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
syncSlidersFromState();

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
function animate() {
  requestAnimationFrame(animate);
  camera.position.x = targetX + radius * Math.sin(phi) * Math.sin(theta);
  camera.position.y = targetY + radius * Math.cos(phi);
  camera.position.z = targetZ + radius * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(targetX, targetY, targetZ);
  if (scalePersonBillboard) {
    if (!scalePersonBillboard.parent) scalePersonBillboard = null;
    else {
      personLookAtTarget.copy(camera.position);
      personLookAtTarget.y = scalePersonBillboard.position.y;
      scalePersonBillboard.lookAt(personLookAtTarget);
    }
  }
  renderer.render(scene, camera);
}
animate();
