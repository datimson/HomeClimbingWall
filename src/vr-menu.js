(function attachClimbingWallVrMenu(global) {
  function createVrMenuToolkit(options={}) {
    const THREE = options.THREE || global.THREE;
    if (!THREE) return null;

    const constants = Object.freeze({
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
      TEXT_CANVAS_WIDTH: 256,
      TEXT_CANVAS_HEIGHT: 96,
      RENDER_ORDER_BUMP: 100000,
    });

    function updateTextPlane(mesh, text) {
      if (!mesh?.userData?.textCanvas || !mesh?.userData?.textContext || !mesh?.userData?.textTexture) return;
      const canvas = mesh.userData.textCanvas;
      const ctx = mesh.userData.textContext;
      const style = mesh.userData.textStyle || {};
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (style.bg) {
        ctx.fillStyle = style.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.fillStyle = style.color || constants.TEXT_COLOR;
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

    function makeTextPlane(text, width=0.46, height=0.11, style={}) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(64, Math.round(Number(style.canvasWidth) || constants.TEXT_CANVAS_WIDTH));
      canvas.height = Math.max(32, Math.round(Number(style.canvasHeight) || constants.TEXT_CANVAS_HEIGHT));
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
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
        color: style.color || constants.TEXT_COLOR,
        bg: style.bg || null,
        fontPx: Number(style.fontPx) || 46,
        fontWeight: style.fontWeight || '700',
        align: style.align || 'center',
        padding: Number(style.padding) || 26,
      };
      updateTextPlane(mesh, text);
      return mesh;
    }

    function makeButton(label, width=0.17, height=0.08, color=0xbec5cc) {
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
      const txt = makeTextPlane(label, width * 0.82, height * 0.60, {
        color: constants.TEXT_DARK_COLOR,
        fontPx: 77,
        fontWeight: '700',
      });
      txt.position.z = 0.004;
      m.add(txt);
      return m;
    }

    function makeCursor() {
      const cursor = new THREE.Mesh(
        new THREE.CircleGeometry(constants.CURSOR_RADIUS, 18),
        new THREE.MeshBasicMaterial({
          color: constants.CURSOR_COLOR,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        })
      );
      const border = new THREE.Mesh(
        new THREE.RingGeometry(constants.CURSOR_RADIUS * 1.18, constants.CURSOR_RADIUS * 1.72, 20),
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
      border.renderOrder = constants.RENDER_ORDER_BUMP + 899999;
      border.frustumCulled = false;
      cursor.add(border);
      cursor.visible = false;
      cursor.renderOrder = constants.RENDER_ORDER_BUMP + 900000;
      cursor.frustumCulled = false;
      return cursor;
    }

    function enforceOverlay(root) {
      if (!root) return;
      root.traverse(obj => {
        obj.frustumCulled = false;
        const currentOrder = Number(obj.renderOrder);
        const base = Number.isFinite(currentOrder) ? currentOrder : 0;
        obj.renderOrder = base + constants.RENDER_ORDER_BUMP;
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

    function setSliderHoverKey(quickMenu, key=null) {
      const hoverKey = key || null;
      Object.keys(quickMenu?.slidersByKey || {}).forEach(sliderKey => {
        const slider = quickMenu.slidersByKey[sliderKey];
        if (!slider) return;
        const isHover = hoverKey === sliderKey;
        if (slider.track?.material?.color) slider.track.material.color.setHex(isHover ? constants.TRACK_HOVER_COLOR : constants.TRACK_COLOR);
        if (slider.fill?.material?.color) slider.fill.material.color.setHex(isHover ? constants.FILL_HOVER_COLOR : constants.FILL_COLOR);
        if (slider.knob?.material?.color) slider.knob.material.color.setHex(isHover ? constants.KNOB_HOVER_COLOR : constants.KNOB_COLOR);
      });
      if (quickMenu) quickMenu.hoveredKey = hoverKey;
    }

    function setCloseHover(quickMenu, active=false) {
      if (!quickMenu) return;
      const hovered = !!active;
      if (quickMenu.closeHovered === hovered) return;
      quickMenu.closeHovered = hovered;
      const mat = quickMenu.closeBtn?.material;
      if (mat?.color) mat.color.setHex(hovered ? constants.CLOSE_HOVER_COLOR : constants.CLOSE_COLOR);
    }

    function orientTowardWorldPoint(quickMenu, worldPoint, tmpDir, tmpEuler) {
      if (!quickMenu?.group || !worldPoint || !tmpDir || !tmpEuler) return;
      tmpDir.copy(worldPoint).sub(quickMenu.group.position);
      if (tmpDir.lengthSq() < 1e-10) return;
      tmpDir.normalize();
      const yaw = Math.atan2(tmpDir.x, tmpDir.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(tmpDir.y, -1, 1));
      tmpEuler.set(-pitch, yaw, 0, 'YXZ');
      quickMenu.group.quaternion.setFromEuler(tmpEuler);
    }

    function quantizeSliderValue(def, value) {
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

    function updateSliderVisual(slider, value) {
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
      if (slider.valueLabel) updateTextPlane(slider.valueLabel, def.fmt(v));
    }

    return Object.freeze({
      constants,
      makeTextPlane,
      updateTextPlane,
      makeButton,
      makeCursor,
      enforceOverlay,
      setSliderHoverKey,
      setCloseHover,
      orientTowardWorldPoint,
      quantizeSliderValue,
      updateSliderVisual,
    });
  }

  function createVrMenuController(options={}) {
    const getControllers = (typeof options.getControllers === 'function') ? options.getControllers : (() => []);
    const isSessionActive = (typeof options.isSessionActive === 'function') ? options.isSessionActive : (() => false);
    const setActiveControllerIndex = (typeof options.setActiveControllerIndex === 'function') ? options.setActiveControllerIndex : null;
    const readControllerWorldRay = (typeof options.readControllerWorldRay === 'function') ? options.readControllerWorldRay : null;
    const isMenuOpen = (typeof options.isMenuOpen === 'function') ? options.isMenuOpen : (() => false);
    const getMenuInteractiveHit = (typeof options.getMenuInteractiveHit === 'function') ? options.getMenuInteractiveHit : (() => null);
    const handleMenuSelect = (typeof options.handleMenuSelect === 'function') ? options.handleMenuSelect : null;
    const suppressWorldSelectOnce = (typeof options.suppressWorldSelectOnce === 'function') ? options.suppressWorldSelectOnce : null;
    const endMenuDrag = (typeof options.endMenuDrag === 'function') ? options.endMenuDrag : null;
    const beginMenuMove = (typeof options.beginMenuMove === 'function') ? options.beginMenuMove : null;
    const endMenuMove = (typeof options.endMenuMove === 'function') ? options.endMenuMove : null;
    const isMenuMoveOwnedBy = (typeof options.isMenuMoveOwnedBy === 'function') ? options.isMenuMoveOwnedBy : (() => false);
    const cancelMenuDragIfInactive = (typeof options.cancelMenuDragIfInactive === 'function')
      ? options.cancelMenuDragIfInactive
      : (() => false);
    const cancelMenuMoveIfInactive = (typeof options.cancelMenuMoveIfInactive === 'function')
      ? options.cancelMenuMoveIfInactive
      : (() => false);
    const consumeWorldSelectSuppression = (typeof options.consumeWorldSelectSuppression === 'function')
      ? options.consumeWorldSelectSuppression
      : (() => false);
    const readMenuButtonPressed = (typeof options.readMenuButtonPressed === 'function') ? options.readMenuButtonPressed : null;
    const clearMenu = (typeof options.clearMenu === 'function') ? options.clearMenu : null;
    const buildMenu = (typeof options.buildMenu === 'function') ? options.buildMenu : null;
    const menuToggleCooldownMs = Math.max(0, Number(options.menuToggleCooldownMs) || 280);
    let menuToggleCooldownUntil = 0;

    function findStateByController(controllerObj) {
      return getControllers().find(s => s?.controller === controllerObj) || null;
    }

    function onControllerSelectStart(event) {
      if (!isSessionActive()) return false;
      const state = findStateByController(event?.target);
      if (state && setActiveControllerIndex) setActiveControllerIndex(state.index);
      const controller = state?.controller || event?.target;
      if (!controller || !readControllerWorldRay || !readControllerWorldRay(controller)) return false;
      if (!isMenuOpen()) return false;
      const hit = getMenuInteractiveHit ? getMenuInteractiveHit() : null;
      if (!handleMenuSelect || !handleMenuSelect(hit, state?.index ?? null, true)) return false;
      if (suppressWorldSelectOnce) suppressWorldSelectOnce(state);
      event?.stopPropagation?.();
      return true;
    }

    function onControllerSelectCancel(event) {
      const state = findStateByController(event?.target);
      if (!state) return false;
      state.suppressWorldSelectUntil = 0;
      if (endMenuDrag) endMenuDrag(state.index);
      return true;
    }

    function onControllerSqueezeStart(event) {
      if (!isSessionActive() || !isMenuOpen()) return false;
      const state = findStateByController(event?.target);
      if (state && setActiveControllerIndex) setActiveControllerIndex(state.index);
      const controller = state?.controller || event?.target;
      if (!controller || !readControllerWorldRay || !readControllerWorldRay(controller)) return false;
      const hit = getMenuInteractiveHit ? getMenuInteractiveHit() : null;
      if (!hit || !beginMenuMove || !beginMenuMove(state?.index ?? -1, hit.point || null, hit.distance)) return false;
      event?.stopPropagation?.();
      return true;
    }

    function onControllerSqueezeEnd(event) {
      const state = findStateByController(event?.target);
      if (!state || !endMenuMove) return false;
      endMenuMove(state.index);
      return true;
    }

    function cancelDragIfInactive() {
      return cancelMenuDragIfInactive ? !!cancelMenuDragIfInactive() : false;
    }

    function cancelMoveIfInactive() {
      return cancelMenuMoveIfInactive ? !!cancelMenuMoveIfInactive() : false;
    }

    function updateMenuButtonToggle() {
      if (!readMenuButtonPressed) return false;
      const now = performance.now();
      if (now < menuToggleCooldownUntil) return false;
      let toggleRequested = false;
      getControllers().forEach(state => {
        const pressed = readMenuButtonPressed(state);
        if (pressed && !state.menuPressedLast) toggleRequested = true;
        state.menuPressedLast = pressed;
      });
      if (!toggleRequested) return false;
      menuToggleCooldownUntil = now + menuToggleCooldownMs;
      if (isMenuOpen()) {
        if (clearMenu) {
          try {
            clearMenu();
          } catch (err) {
            console.error('VR menu clear failed:', err);
          }
        }
        return true;
      }
      if (buildMenu) {
        try {
          return !!buildMenu('S');
        } catch (err) {
          console.error('VR menu toggle build failed:', err);
          return false;
        }
      }
      return false;
    }

    function shouldIgnoreWorldSelectForState(state) {
      if (!state) return false;
      if (isMenuMoveOwnedBy(state.index)) return true;
      if (endMenuDrag && endMenuDrag(state.index)) {
        state.suppressWorldSelectUntil = 0;
        return true;
      }
      if (consumeWorldSelectSuppression && consumeWorldSelectSuppression(state)) return true;
      return false;
    }

    return Object.freeze({
      onControllerSelectStart,
      onControllerSelectCancel,
      onControllerSqueezeStart,
      onControllerSqueezeEnd,
      cancelDragIfInactive,
      cancelMoveIfInactive,
      readMenuButtonPressed,
      updateMenuButtonToggle,
      shouldIgnoreWorldSelectForState,
    });
  }

  function createVrMenuManager(options={}) {
    const THREE = options.THREE || global.THREE;
    const scene = options.scene || null;
    const renderer = options.renderer || null;
    const camera = options.camera || null;
    const toolkit = options.toolkit || createVrMenuToolkit({THREE});
    if (!THREE || !scene || !renderer || !camera || !toolkit) return null;

    const C = options.constants || toolkit.constants;
    const sliderDefs = options.sliderDefs || {};
    const targetKeys = options.targetKeys || {};
    const geometryKeyMap = options.geometryKeyMap || {};
    const quickMenu = options.quickMenuState || {
      group: null,
      target: null,
      closeBtn: null,
      interactive: [],
      slidersByKey: {},
      hoveredKey: null,
      closeHovered: false,
      open: false,
    };
    const menuDrag = options.menuDragState || {active: false, controllerIndex: -1, key: null};
    const menuMove = options.menuMoveState || {
      active: false,
      controllerIndex: -1,
      hitDistance: C.DISTANCE,
      orbitRadius: C.DISTANCE,
      orbitHeightOffset: C.DOWN_OFFSET,
      grabPointY: 0,
    };

    const getWallState = (typeof options.getWallState === 'function') ? options.getWallState : (() => null);
    const getWallGeometryState = (typeof options.getWallGeometryState === 'function') ? options.getWallGeometryState : (() => null);
    const getAvailableDesignDefs = (typeof options.getAvailableDesignDefs === 'function') ? options.getAvailableDesignDefs : (() => []);
    const getActiveDesignIdSafe = (typeof options.getActiveDesignIdSafe === 'function') ? options.getActiveDesignIdSafe : (() => 'classic');
    const switchDesignAndReload = (typeof options.switchDesignAndReload === 'function') ? options.switchDesignAndReload : null;
    const setWallGeometryValue = (typeof options.setWallGeometryValue === 'function') ? options.setWallGeometryValue : null;
    const syncGeometrySlidersFromState = (typeof options.syncGeometrySlidersFromState === 'function') ? options.syncGeometrySlidersFromState : null;
    const syncSlidersFromState = (typeof options.syncSlidersFromState === 'function') ? options.syncSlidersFromState : null;
    const clampWallStateValue = (typeof options.clampWallStateValue === 'function') ? options.clampWallStateValue : null;
    const setAdjAngle = (typeof options.setAdjAngle === 'function') ? options.setAdjAngle : null;
    const setEAngleValue = (typeof options.setEAngleValue === 'function') ? options.setEAngleValue : null;
    const setRigOpenValue = (typeof options.setRigOpenValue === 'function') ? options.setRigOpenValue : null;
    const requestRebuild = (typeof options.requestRebuild === 'function') ? options.requestRebuild : null;
    const rebuildStageGeometry = options.rebuildStageGeometry || 'geometry';
    const stopESweep = (typeof options.stopESweep === 'function') ? options.stopESweep : null;
    const resetRigToggle = (typeof options.resetRigToggle === 'function') ? options.resetRigToggle : null;
    const syncAppState = (typeof options.syncAppState === 'function') ? options.syncAppState : null;
    const getXrStandingEyeHeight = (typeof options.getXrStandingEyeHeight === 'function') ? options.getXrStandingEyeHeight : (() => 1.72);
    const setXrStandingEyeHeight = (typeof options.setXrStandingEyeHeight === 'function') ? options.setXrStandingEyeHeight : null;
    const recalcXrStandingEyeHeightFromHead = (typeof options.recalcXrStandingEyeHeightFromHead === 'function')
      ? options.recalcXrStandingEyeHeightFromHead
      : null;
    const getSolarMonth = (typeof options.getSolarMonth === 'function') ? options.getSolarMonth : (() => 1);
    const setSolarMonth = (typeof options.setSolarMonth === 'function') ? options.setSolarMonth : null;
    const getMeasurementSettings = (typeof options.getMeasurementSettings === 'function') ? options.getMeasurementSettings : (() => null);
    const setMeasurementSetting = (typeof options.setMeasurementSetting === 'function') ? options.setMeasurementSetting : null;
    const clearMeasurements = (typeof options.clearMeasurements === 'function') ? options.clearMeasurements : null;
    const syncMeasureUi = (typeof options.syncMeasureUi === 'function') ? options.syncMeasureUi : null;
    const getSceneToggleStates = (typeof options.getSceneToggleStates === 'function')
      ? options.getSceneToggleStates
      : (() => null);
    const setSceneToggle = (typeof options.setSceneToggle === 'function') ? options.setSceneToggle : null;
    const readControllerWorldRay = (typeof options.readControllerWorldRay === 'function') ? options.readControllerWorldRay : null;
    const getRayOrigin = (typeof options.getRayOrigin === 'function') ? options.getRayOrigin : null;
    const getRayDirection = (typeof options.getRayDirection === 'function') ? options.getRayDirection : null;
    const getControllers = (typeof options.getControllers === 'function') ? options.getControllers : (() => []);
    const readPrimaryStick = (typeof options.readPrimaryStick === 'function') ? options.readPrimaryStick : (() => ({x: 0, y: 0}));
    const applyStickDeadzone = (typeof options.applyStickDeadzone === 'function') ? options.applyStickDeadzone : (v => Number(v) || 0);
    const teleportMaxDistance = Number(options.teleportMaxDistance) || 20;
    const menuWorldClickSuppressMs = Number(options.menuWorldClickSuppressMs) || 260;
    const menuButtonIndices = Array.isArray(options.menuButtonIndices) ? options.menuButtonIndices : [4];
    const menuToggleCooldownMs = Math.max(0, Number(options.menuToggleCooldownMs) || 280);
    let menuToggleCooldownUntil = 0;
    const upVector = options.upVector || new THREE.Vector3(0, 1, 0);

    const menuRaycaster = new THREE.Raycaster();
    const menuMoveWorldPoint = new THREE.Vector3();
    const menuMoveHeadPos = new THREE.Vector3();
    const menuMoveHoriz = new THREE.Vector3();
    const menuFaceDir = new THREE.Vector3();
    const menuFaceEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    function getXrCamera() {
      return renderer?.xr?.getCamera ? renderer.xr.getCamera(camera) : null;
    }

    function getMenuCurrentValue(key, def) {
      const geometryKey = geometryKeyMap[key];
      if (geometryKey) {
        const raw = Number(getWallGeometryState()?.[geometryKey]);
        return Number.isFinite(raw) ? raw : def.min;
      }
      if (key === 'userHeight') return getXrStandingEyeHeight();
      if (key === 'solarMonth') return getSolarMonth();
      const raw = Number(getWallState()?.[key]);
      return Number.isFinite(raw) ? raw : def.min;
    }

    function refreshValues() {
      if (!quickMenu.open) return;
      Object.keys(quickMenu.slidersByKey || {}).forEach(key => {
        const slider = quickMenu.slidersByKey[key];
        if (!slider) return;
        toolkit.updateSliderVisual(slider, getMenuCurrentValue(key, slider.def));
      });
    }

    function clear() {
      menuDrag.active = false;
      menuDrag.controllerIndex = -1;
      menuDrag.key = null;
      menuMove.active = false;
      menuMove.controllerIndex = -1;
      menuMove.hitDistance = C.DISTANCE;
      menuMove.orbitRadius = C.DISTANCE;
      menuMove.orbitHeightOffset = C.DOWN_OFFSET;
      menuMove.grabPointY = 0;
      if (!quickMenu.group) {
        quickMenu.closeBtn = null;
        quickMenu.interactive = [];
        quickMenu.slidersByKey = {};
        quickMenu.hoveredKey = null;
        quickMenu.closeHovered = false;
        quickMenu.target = null;
        quickMenu.open = false;
        return;
      }
      if (quickMenu.group.parent) quickMenu.group.parent.remove(quickMenu.group);
      else scene.remove(quickMenu.group);
      quickMenu.group.traverse(obj => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach(mat => {
          if (!mat) return;
          if (mat.map && typeof mat.map.dispose === 'function') mat.map.dispose();
          if (typeof mat.dispose === 'function') mat.dispose();
        });
      });
      quickMenu.group = null;
      quickMenu.closeBtn = null;
      quickMenu.interactive = [];
      quickMenu.slidersByKey = {};
      quickMenu.hoveredKey = null;
      quickMenu.closeHovered = false;
      quickMenu.target = null;
      quickMenu.open = false;
    }

    function resolveTarget(info) {
      if (!info) return null;
      if (info.hoverKind === 'trainingRig' || info.wall === 'R') return 'R';
      const id = String(info.wall || '').toUpperCase();
      if (Object.prototype.hasOwnProperty.call(targetKeys, id)) return id;
      return null;
    }

    function titleForTarget(target) {
      if (target === 'S') return 'Wall Size';
      if (target === 'R') return 'Training Rig';
      return `Wall ${target}`;
    }

    function getDesignDefs() {
      const defs = getAvailableDesignDefs();
      if (defs.length) return defs;
      const id = getActiveDesignIdSafe();
      return [{id, label: id, status: 'active'}];
    }

    function applyStateKey(key, nextValue) {
      const def = sliderDefs[key];
      if (!def) return;
      const clamped = toolkit.quantizeSliderValue(def, nextValue);
      const geometryKey = geometryKeyMap[key];
      const current = toolkit.quantizeSliderValue(def, getMenuCurrentValue(key, def));
      if (Math.abs(clamped - current) < Math.max(1e-6, (Number(def.step) || 0) * 0.25)) return;

      if (geometryKey) {
        if (setWallGeometryValue) setWallGeometryValue(geometryKey, clamped, {rebuildScene: true, persistState: true});
        if (syncGeometrySlidersFromState) syncGeometrySlidersFromState();
        if (syncSlidersFromState) syncSlidersFromState();
        refreshValues();
        return;
      }
      if (key === 'userHeight') {
        if (setXrStandingEyeHeight) setXrStandingEyeHeight(clamped, {persist: true, applyGroundSnap: true});
        refreshValues();
        return;
      }
      if (key === 'solarMonth') {
        if (setSolarMonth) setSolarMonth(clamped, {persist: true});
        refreshValues();
        return;
      }
      if (key === 'eAngle') {
        if (stopESweep) stopESweep();
        if (setEAngleValue) setEAngleValue(clamped);
        if (requestRebuild) requestRebuild({stages: [rebuildStageGeometry]});
        return;
      }
      if (key === 'rigOpen') {
        if (resetRigToggle) resetRigToggle();
        if (setRigOpenValue) setRigOpenValue(clamped, true);
        if (syncAppState) syncAppState('ui:vr:rigOpen');
        refreshValues();
        return;
      }
      const wallState = getWallState();
      if (!wallState) return;
      wallState[key] = clampWallStateValue ? clampWallStateValue(key, clamped) : clamped;
      if (key === 'eAngle' && setAdjAngle) setAdjAngle(wallState.eAngle);
      if (syncSlidersFromState) syncSlidersFromState();
      if (requestRebuild) requestRebuild({stages: [rebuildStageGeometry]});
      refreshValues();
    }

    function placeDashboard() {
      if (!quickMenu.group) return;
      const xrCam = getXrCamera();
      if (!xrCam) return;
      xrCam.updateMatrixWorld(true);
      const camPos = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
      const fwd = new THREE.Vector3();
      xrCam.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
      else fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, upVector);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      else right.normalize();
      const pos = camPos.clone().add(fwd.multiplyScalar(C.DISTANCE)).add(right.multiplyScalar(C.SIDE_OFFSET));
      pos.y += C.DOWN_OFFSET;
      if (quickMenu.group.parent !== scene) {
        if (quickMenu.group.parent) quickMenu.group.parent.remove(quickMenu.group);
        scene.add(quickMenu.group);
      }
      quickMenu.group.position.copy(pos);
      toolkit.orientTowardWorldPoint(quickMenu, camPos, menuFaceDir, menuFaceEuler);
      quickMenu.group.scale.set(C.SCALE, C.SCALE, C.SCALE);
      quickMenu.group.updateMatrixWorld(true);
    }

    function _copyRay() {
      const origin = getRayOrigin ? getRayOrigin() : null;
      const dir = getRayDirection ? getRayDirection() : null;
      if (!origin || !dir) return null;
      return {origin, dir};
    }

    function build(target) {
      try {
      const keys = targetKeys[target];
      if (!keys) return false;
      clear();

      const width = C.BASE_WIDTH;
      const rowH = C.ROW_HEIGHT;
      const hasHeightRecalc = target === 'S';
      const designDefs = target === 'S' ? getDesignDefs().filter(def => !!def?.id) : [];
      const hasDesignSwitcher = target === 'S' && designDefs.length > 1;
      const measurementSettings = getMeasurementSettings();
      const hasMeasureControls = target === 'S'
        && !!measurementSettings
        && (typeof setMeasurementSetting === 'function' || typeof clearMeasurements === 'function');
      const sceneToggleStates = getSceneToggleStates();
      const sceneToggleDefs = [];
      if (sceneToggleStates && typeof setSceneToggle === 'function') {
        if (Object.prototype.hasOwnProperty.call(sceneToggleStates, 'officeEnabled')) {
          sceneToggleDefs.push({ key: 'officeEnabled', label: 'Office' });
        }
        if (Object.prototype.hasOwnProperty.call(sceneToggleStates, 'saunaEnabled')) {
          sceneToggleDefs.push({ key: 'saunaEnabled', label: 'Sauna' });
        }
        if (Object.prototype.hasOwnProperty.call(sceneToggleStates, 'outdoorKitchenEnabled')) {
          sceneToggleDefs.push({ key: 'outdoorKitchenEnabled', label: 'Kitchen' });
        }
        if (Object.prototype.hasOwnProperty.call(sceneToggleStates, 'globalIlluminationEnabled')) {
          sceneToggleDefs.push({ key: 'globalIlluminationEnabled', label: 'GI' });
        }
      }
      const hasSceneToggleControls = target === 'S'
        && sceneToggleDefs.length > 0;
      const sliderRows = keys.length;
      const extraRows = (hasHeightRecalc ? 1 : 0)
        + (hasDesignSwitcher ? 1 : 0)
        + (hasMeasureControls ? 1 : 0)
        + (hasSceneToggleControls ? 1 : 0);
      const hasRows = (sliderRows + extraRows) > 0;
      const height = hasRows ? (0.20 + (sliderRows + extraRows) * rowH) : 0.28;
      const halfW = width * 0.5;
      const halfH = height * 0.5;
      const innerLeft = -halfW + C.PADDING_X;
      const innerRight = halfW - C.PADDING_X;
      const innerWidth = Math.max(0.25, innerRight - innerLeft);
      const closeW = 0.13;
      const closeH = 0.058;
      const closeGap = 0.03;

      const group = new THREE.Group();
      group.renderOrder = 2090;
      const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
          color: C.BG_COLOR,
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
      const title = toolkit.makeTextPlane(titleForTarget(target), titleWidth, 0.09, {
        color: C.TEXT_DARK_COLOR,
        fontPx: 48,
        fontWeight: '700',
        align: 'left',
        padding: 20,
      });
      title.position.set(innerLeft + (titleWidth * 0.5), halfH - C.PADDING_Y - 0.02, 0.004);
      group.add(title);

      const closeBtn = toolkit.makeButton('Close', closeW, closeH, C.CLOSE_COLOR);
      closeBtn.position.set(innerRight - (closeW * 0.5), halfH - C.PADDING_Y - 0.02, 0.003);
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
          const label = toolkit.makeTextPlane('Design', labelW, 0.07, {
            color: C.TEXT_DARK_COLOR,
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
            const color = designId === activeDesignId ? 0x8ca974 : C.NUDGE_COLOR;
            const btn = toolkit.makeButton(labelText || designId, btnW, btnH, color);
            btn.position.set(x, y, 0.003);
            btn.userData.vrMenuAction = {type: 'setDesign', designId};
            group.add(btn);
            interactive.push(btn);
          });
        }

        keys.forEach((key, idx) => {
          const def = sliderDefs[key];
          if (!def) return;
          const v = toolkit.quantizeSliderValue(def, getMenuCurrentValue(key, def));
          const y = halfH - 0.155 - (idx + rowCursor) * rowH;

          const label = toolkit.makeTextPlane(def.label, labelW, 0.07, {
            color: C.TEXT_DARK_COLOR,
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
              color: C.TRACK_COLOR,
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

          const minusBtn = toolkit.makeButton('−', nudgeW, nudgeH, C.NUDGE_COLOR);
          minusBtn.position.set(minusX, y, 0.003);
          minusBtn.userData.vrMenuAction = {type: 'sliderNudge', key, delta: -1};
          group.add(minusBtn);

          const fill = new THREE.Mesh(
            new THREE.PlaneGeometry(trackW, trackH * 0.78),
            new THREE.MeshBasicMaterial({
              color: C.FILL_COLOR,
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
              color: C.KNOB_COLOR,
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

          const plusBtn = toolkit.makeButton('+', nudgeW, nudgeH, C.NUDGE_COLOR);
          plusBtn.position.set(plusX, y, 0.003);
          plusBtn.userData.vrMenuAction = {type: 'sliderNudge', key, delta: 1};
          group.add(plusBtn);

          const valueLabel = toolkit.makeTextPlane(def.fmt(v), valueW, 0.07, {
            color: C.TEXT_DARK_COLOR,
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
            trackCenterX,
          };
          slidersByKey[key] = slider;
          toolkit.updateSliderVisual(slider, v);
          interactive.push(minusBtn, track, knob, plusBtn);
        });

        if (hasHeightRecalc) {
          const y = halfH - 0.155 - (keys.length + rowCursor) * rowH;
          const autoBtn = toolkit.makeButton('Auto Height', 0.30, 0.07, 0xbac2ca);
          autoBtn.position.set(0, y, 0.003);
          autoBtn.userData.vrMenuAction = {type: 'recalcHeight'};
          group.add(autoBtn);
          interactive.push(autoBtn);
        }

        if (hasMeasureControls) {
          const measureOffset = keys.length + rowCursor + (hasHeightRecalc ? 1 : 0);
          const y = halfH - 0.155 - measureOffset * rowH;
          const settings = measurementSettings || {};
          const label = toolkit.makeTextPlane('Measure', labelW, 0.07, {
            color: C.TEXT_DARK_COLOR,
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
            const color = def.label === 'Clear' ? 0xc8a9a9 : (def.active ? 0x8ca974 : C.NUDGE_COLOR);
            const btn = toolkit.makeButton(def.label, btnW, btnH, color);
            btn.position.set(x, y, 0.003);
            btn.userData.vrMenuAction = def.action;
            group.add(btn);
            interactive.push(btn);
          });
        }

        if (hasSceneToggleControls) {
          const sceneOffset = keys.length
            + rowCursor
            + (hasHeightRecalc ? 1 : 0)
            + (hasMeasureControls ? 1 : 0);
          const y = halfH - 0.155 - sceneOffset * rowH;
          const label = toolkit.makeTextPlane('Scene', labelW, 0.07, {
            color: C.TEXT_DARK_COLOR,
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
          const btnCount = Math.max(1, sceneToggleDefs.length);
          const btnW = Math.max(0.12, (areaWidth - (btnGap * Math.max(0, btnCount - 1))) / btnCount);
          const btnH = 0.058;
          sceneToggleDefs.forEach((def, idx) => {
            const active = !!sceneToggleStates[def.key];
            const btnLabel = active ? `${def.label} On` : `${def.label} Off`;
            const btnColor = active ? 0x8ca974 : C.NUDGE_COLOR;
            const x = areaLeft + (btnW * 0.5) + idx * (btnW + btnGap);
            const btn = toolkit.makeButton(btnLabel, btnW, btnH, btnColor);
            btn.position.set(x, y, 0.003);
            btn.userData.vrMenuAction = {type: 'sceneToggle', key: def.key};
            group.add(btn);
            interactive.push(btn);
          });
        }
      } else {
        const msg = toolkit.makeTextPlane('No adjustable sliders', 0.58, 0.10, {
          color: C.TEXT_DARK_COLOR,
          fontPx: 60,
          fontWeight: '700',
        });
        msg.position.set(0, -0.02, 0.004);
        group.add(msg);
      }

      scene.add(group);
      quickMenu.group = group;
      quickMenu.target = target;
      quickMenu.closeBtn = closeBtn;
      quickMenu.interactive = interactive;
      quickMenu.slidersByKey = slidersByKey;
      quickMenu.hoveredKey = null;
      quickMenu.closeHovered = false;
      quickMenu.open = true;
      toolkit.setSliderHoverKey(quickMenu, null);
      toolkit.setCloseHover(quickMenu, false);
      toolkit.enforceOverlay(group);
      placeDashboard();
      return true;
      } catch (err) {
        console.error('VR menu build failed:', err);
        try {
          clear();
        } catch (clearErr) {
          console.error('VR menu clear-after-build-failure failed:', clearErr);
        }
        return false;
      }
    }

    function openForInfo(info) {
      const target = resolveTarget(info);
      if (!target) return false;
      return build(target);
    }

    function getInteractiveHit() {
      if (!quickMenu.open || !quickMenu.interactive.length) return null;
      const ray = _copyRay();
      if (!ray) return null;
      menuRaycaster.far = teleportMaxDistance;
      menuRaycaster.set(ray.origin, ray.dir);
      const hits = menuRaycaster.intersectObjects(quickMenu.interactive, false);
      return hits.length ? hits[0] : null;
    }

    function setSliderFromHit(slider, hitPoint) {
      if (!slider?.track || !hitPoint) return false;
      const local = slider.track.worldToLocal(hitPoint.clone());
      const t = THREE.MathUtils.clamp((local.x / slider.trackWidth) + 0.5, 0, 1);
      const raw = slider.def.min + t * (slider.def.max - slider.def.min);
      const next = toolkit.quantizeSliderValue(slider.def, raw);
      const curr = toolkit.quantizeSliderValue(slider.def, getMenuCurrentValue(slider.key, slider.def));
      if (Math.abs(next - curr) < 1e-6) return false;
      applyStateKey(slider.key, next);
      toolkit.updateSliderVisual(slider, next);
      return true;
    }

    function beginDrag(controllerIndex, key, hitPoint=null) {
      const slider = quickMenu.slidersByKey?.[key];
      if (!slider) return false;
      menuDrag.active = true;
      menuDrag.controllerIndex = controllerIndex;
      menuDrag.key = key;
      if (hitPoint) setSliderFromHit(slider, hitPoint);
      return true;
    }

    function endDrag(controllerIndex=null) {
      if (!menuDrag.active) return false;
      if (Number.isInteger(controllerIndex) && menuDrag.controllerIndex !== controllerIndex) return false;
      menuDrag.active = false;
      menuDrag.controllerIndex = -1;
      menuDrag.key = null;
      return true;
    }

    function beginMove(controllerIndex, hitPoint=null, hitDistance=C.DISTANCE) {
      if (!quickMenu.open || !quickMenu.group) return false;
      if (!Number.isInteger(controllerIndex) || controllerIndex < 0) return false;
      endDrag(controllerIndex);
      const xrCam = getXrCamera();
      if (!xrCam) return false;
      xrCam.updateMatrixWorld(true);
      menuMoveHeadPos.setFromMatrixPosition(xrCam.matrixWorld);
      const dx = quickMenu.group.position.x - menuMoveHeadPos.x;
      const dz = quickMenu.group.position.z - menuMoveHeadPos.z;
      menuMove.active = true;
      menuMove.controllerIndex = controllerIndex;
      menuMove.hitDistance = THREE.MathUtils.clamp(Number(hitDistance) || C.DISTANCE, 0.18, teleportMaxDistance);
      menuMove.orbitRadius = THREE.MathUtils.clamp(Math.hypot(dx, dz), 0.24, 2.2);
      menuMove.orbitHeightOffset = quickMenu.group.position.y - menuMoveHeadPos.y;
      menuMove.grabPointY = Number.isFinite(hitPoint?.y) ? hitPoint.y : quickMenu.group.position.y;
      return true;
    }

    function endMove(controllerIndex=null) {
      if (!menuMove.active) return false;
      if (Number.isInteger(controllerIndex) && menuMove.controllerIndex !== controllerIndex) return false;
      menuMove.active = false;
      menuMove.controllerIndex = -1;
      menuMove.hitDistance = C.DISTANCE;
      menuMove.orbitRadius = C.DISTANCE;
      menuMove.orbitHeightOffset = C.DOWN_OFFSET;
      menuMove.grabPointY = 0;
      return true;
    }

    function updateDrag() {
      if (!menuDrag.active || !quickMenu.open) return;
      const state = getControllers().find(s => s.index === menuDrag.controllerIndex);
      if (!state?.connected || !state.controller) {
        endDrag();
        return;
      }
      const slider = quickMenu.slidersByKey?.[menuDrag.key];
      if (!slider) {
        endDrag();
        return;
      }
      if (!readControllerWorldRay || !readControllerWorldRay(state.controller)) return;
      const ray = _copyRay();
      if (!ray) return;
      menuRaycaster.far = teleportMaxDistance;
      menuRaycaster.set(ray.origin, ray.dir);
      const hits = menuRaycaster.intersectObject(slider.track, false);
      if (!hits.length) return;
      setSliderFromHit(slider, hits[0].point);
    }

    function updateMove(dtSeconds=(1/60)) {
      if (!menuMove.active || !quickMenu.open || !quickMenu.group) return;
      const state = getControllers().find(s => s.index === menuMove.controllerIndex);
      if (!state?.connected || !state.controller) {
        endMove();
        return;
      }
      if (!readControllerWorldRay || !readControllerWorldRay(state.controller)) return;
      const ray = _copyRay();
      if (!ray) return;

      const dt = THREE.MathUtils.clamp(Number(dtSeconds) || (1 / 60), 0.001, 0.05);
      const xrCam = getXrCamera();
      if (!xrCam) return;
      xrCam.updateMatrixWorld(true);
      menuMoveHeadPos.setFromMatrixPosition(xrCam.matrixWorld);

      const stick = readPrimaryStick(state.inputSource);
      const stickY = applyStickDeadzone(stick.y);
      if (Math.abs(stickY) > 1e-4) {
        menuMove.orbitRadius = THREE.MathUtils.clamp(
          menuMove.orbitRadius + (-stickY * C.GRAB_RADIUS_SPEED * dt),
          0.24,
          2.8
        );
      }

      menuMoveWorldPoint.copy(ray.origin).addScaledVector(ray.dir, menuMove.hitDistance);
      menuMoveHoriz.set(
        menuMoveWorldPoint.x - menuMoveHeadPos.x,
        0,
        menuMoveWorldPoint.z - menuMoveHeadPos.z
      );
      if (menuMoveHoriz.lengthSq() < 1e-8) {
        menuMoveHoriz.set(
          quickMenu.group.position.x - menuMoveHeadPos.x,
          0,
          quickMenu.group.position.z - menuMoveHeadPos.z
        );
        if (menuMoveHoriz.lengthSq() < 1e-8) menuMoveHoriz.set(0, 0, -1);
      }
      menuMoveHoriz.normalize().multiplyScalar(menuMove.orbitRadius);
      quickMenu.group.position.x = menuMoveHeadPos.x + menuMoveHoriz.x;
      quickMenu.group.position.z = menuMoveHeadPos.z + menuMoveHoriz.z;

      const yDelta = menuMoveWorldPoint.y - menuMove.grabPointY;
      const nextYOffset = THREE.MathUtils.clamp(menuMove.orbitHeightOffset + yDelta, -0.75, 0.45);
      quickMenu.group.position.y = menuMoveHeadPos.y + nextYOffset;

      toolkit.orientTowardWorldPoint(quickMenu, menuMoveHeadPos, menuFaceDir, menuFaceEuler);
      quickMenu.group.updateMatrixWorld(true);
    }

    function handleSelect(hitOverride=null, controllerIndex=null, preferDrag=false) {
      const hit = hitOverride || getInteractiveHit();
      const action = hit?.object?.userData?.vrMenuAction;
      if (!action) return false;
      if (action.type === 'block') return true;
      if (action.type === 'recalcHeight') {
        const ok = recalcXrStandingEyeHeightFromHead ? !!recalcXrStandingEyeHeightFromHead() : false;
        if (ok) refreshValues();
        return true;
      }
      if (action.type === 'close') {
        clear();
        return true;
      }
      if (action.type === 'measureClear') {
        if (clearMeasurements) clearMeasurements({segments: true, active: true});
        return true;
      }
      if (action.type === 'measureToggle' && action.key) {
        if (!setMeasurementSetting) return false;
        const settings = getMeasurementSettings() || {};
        setMeasurementSetting(action.key, !settings[action.key]);
        if (syncMeasureUi) syncMeasureUi();
        if (quickMenu.target === 'S') build('S');
        return true;
      }
      if (action.type === 'sceneToggle' && action.key) {
        if (!setSceneToggle || !getSceneToggleStates) return false;
        const toggles = getSceneToggleStates() || {};
        const curr = !!toggles[action.key];
        const ok = setSceneToggle(action.key, !curr) !== false;
        if (ok && quickMenu.target === 'S') build('S');
        return ok;
      }
      if (action.type === 'setDesign' && action.designId) {
        return switchDesignAndReload ? !!switchDesignAndReload(action.designId) : false;
      }
      if (action.type === 'sliderNudge' && action.key) {
        const def = sliderDefs[action.key];
        if (!def) return false;
        const curr = toolkit.quantizeSliderValue(def, getMenuCurrentValue(action.key, def));
        const dir = Math.sign(Number(action.delta) || 0);
        if (!Number.isFinite(curr) || !dir) return false;
        const step = Number(def.step) || 1;
        const next = curr + (dir * step);
        applyStateKey(action.key, next);
        return true;
      }
      if (action.type === 'sliderTrack' && action.key) {
        if (preferDrag && Number.isInteger(controllerIndex)) {
          return beginDrag(controllerIndex, action.key, hit?.point || null);
        }
        const slider = quickMenu.slidersByKey?.[action.key];
        if (!slider || !hit?.point) return false;
        return setSliderFromHit(slider, hit.point);
      }
      return false;
    }

    function suppressWorldSelectOnce(state) {
      if (!state) return;
      state.suppressWorldSelectUntil = performance.now() + menuWorldClickSuppressMs;
    }

    function consumeWorldSelectSuppression(state) {
      if (!state) return false;
      const until = Number(state.suppressWorldSelectUntil) || 0;
      if (until <= 0) return false;
      state.suppressWorldSelectUntil = 0;
      return performance.now() <= until;
    }

    function isMoveOwnedBy(controllerIndex) {
      return !!(menuMove.active && menuMove.controllerIndex === controllerIndex);
    }

    function cancelDragIfInactive() {
      if (!menuDrag.active) return false;
      const state = getControllers().find(s => s.index === menuDrag.controllerIndex);
      if (!state?.connected) {
        endDrag();
        return true;
      }
      return false;
    }

    function cancelMoveIfInactive() {
      if (!menuMove.active) return false;
      if (!quickMenu.open || !quickMenu.group) {
        endMove();
        return true;
      }
      const state = getControllers().find(s => s.index === menuMove.controllerIndex);
      if (!state?.connected) {
        endMove();
        return true;
      }
      return false;
    }

    function readMenuButtonPressed(state) {
      if (!state?.connected || state.handedness !== 'left') return false;
      const buttons = state.inputSource?.gamepad?.buttons;
      if (!buttons?.length) return false;
      for (let i = 0; i < menuButtonIndices.length; i++) {
        const idx = menuButtonIndices[i];
        if (buttons[idx]?.pressed) return true;
      }
      return false;
    }

    function updateMenuButtonToggle() {
      const now = performance.now();
      if (now < menuToggleCooldownUntil) return false;
      let toggleRequested = false;
      getControllers().forEach(state => {
        const pressed = readMenuButtonPressed(state);
        if (pressed && !state.menuPressedLast) toggleRequested = true;
        state.menuPressedLast = pressed;
      });
      if (!toggleRequested) return false;
      menuToggleCooldownUntil = now + menuToggleCooldownMs;
      if (quickMenu.open) {
        clear();
        return true;
      }
      return build('S');
    }

    return Object.freeze({
      getCurrentValue: getMenuCurrentValue,
      refreshValues,
      clear,
      resolveTarget,
      titleForTarget,
      getDesignDefs,
      applyStateKey,
      placeDashboard,
      build,
      openForInfo,
      getInteractiveHit,
      setSliderFromHit,
      beginDrag,
      endDrag,
      beginMove,
      endMove,
      updateDrag,
      updateMove,
      handleSelect,
      suppressWorldSelectOnce,
      consumeWorldSelectSuppression,
      isMoveOwnedBy,
      cancelDragIfInactive,
      cancelMoveIfInactive,
      readMenuButtonPressed,
      updateMenuButtonToggle,
    });
  }

  global.ClimbingWallVrMenu = Object.freeze({
    createVrMenuToolkit,
    createVrMenuController,
    createVrMenuManager,
  });
})(window);
