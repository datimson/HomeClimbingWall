(function attachClimbingWallCameraControls(global) {
  function createCameraControlsUtils(options={}) {
    const THREE = options.THREE || global.THREE;
    if (!THREE) return null;

    function panCamera(state, camera, dx, dy, verticalPan=false) {
      if (!state || !camera) return false;
      const radius = Number(state.radius) || 1;
      const panScale = Math.max(0.004, radius * 0.0017);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward).normalize();

      const panU = new THREE.Vector3().copy(right).multiplyScalar(-dx * panScale);
      const panV = new THREE.Vector3()
        .copy(verticalPan ? forward : up)
        .multiplyScalar(dy * panScale);
      const pan = panU.add(panV);

      state.targetX = (Number(state.targetX) || 0) + pan.x;
      state.targetY = (Number(state.targetY) || 0) + pan.y;
      state.targetZ = (Number(state.targetZ) || 0) + pan.z;
      return true;
    }

    function shouldIgnoreDesktopMoveEvent(e, xrSessionActive=false) {
      if (xrSessionActive) return true;
      if (!e) return false;
      if (e.metaKey || e.ctrlKey || e.altKey) return true;
      const target = e.target;
      if (!target) return false;
      const tag = String(target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) return true;
      return false;
    }

    function setDesktopMoveKeyState(keys, e, pressed, xrSessionActive=false) {
      if (!keys || shouldIgnoreDesktopMoveEvent(e, xrSessionActive)) return false;
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
      keys[key] = !!pressed;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return true;
    }

    function clearDesktopMoveKeys(keys) {
      if (!keys) return;
      keys.forward = false;
      keys.back = false;
      keys.left = false;
      keys.right = false;
      keys.fast = false;
    }

    function updateDesktopKeyboardMove(state, camera, keys, dt, config={}) {
      if (!state || !camera || !keys) return false;
      const hasMove = !!(keys.forward || keys.back || keys.left || keys.right);
      if (!hasMove) return false;

      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      const moveDelta = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) return false;
      forward.normalize();
      right.crossVectors(forward, up).normalize();

      if (keys.forward) moveDelta.add(forward);
      if (keys.back) moveDelta.sub(forward);
      if (keys.right) moveDelta.add(right);
      if (keys.left) moveDelta.sub(right);
      if (moveDelta.lengthSq() < 1e-6) return false;

      const speedBase = Number(config.moveSpeedMps) || 2.2;
      const runMult = Number(config.moveRunMultiplier) || 1.7;
      const speed = speedBase * (keys.fast ? runMult : 1);
      moveDelta.normalize().multiplyScalar(speed * dt);

      state.targetX = (Number(state.targetX) || 0) + moveDelta.x;
      state.targetZ = (Number(state.targetZ) || 0) + moveDelta.z;
      return true;
    }

    function applyOrbitCamera(state, camera) {
      if (!state || !camera) return false;
      const theta = Number(state.theta) || 0;
      const phi = Number(state.phi) || 0;
      const radius = Number(state.radius) || 1;
      const tx = Number(state.targetX) || 0;
      const ty = Number(state.targetY) || 0;
      const tz = Number(state.targetZ) || 0;
      camera.position.x = tx + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = ty + radius * Math.cos(phi);
      camera.position.z = tz + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(tx, ty, tz);
      return true;
    }

    return Object.freeze({
      panCamera,
      shouldIgnoreDesktopMoveEvent,
      setDesktopMoveKeyState,
      clearDesktopMoveKeys,
      updateDesktopKeyboardMove,
      applyOrbitCamera,
    });
  }

  global.ClimbingWallCameraControls = Object.freeze({
    createCameraControlsUtils,
  });
})(window);
