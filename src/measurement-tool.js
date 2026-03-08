(function attachClimbingWallMeasurementTool(global) {
  function resolveMeasurementStorageKey(designSystem, getActiveDesignIdSafe) {
    if (designSystem && typeof designSystem.getMeasurementStorageKey === 'function') {
      return designSystem.getMeasurementStorageKey(getActiveDesignIdSafe());
    }
    const active = getActiveDesignIdSafe();
    if (active === 'classic') return 'climbingWall.measureTool.v1';
    return `climbingWall.${active}.measureTool.v1`;
  }

  function resolveMeasurementDefaults(designSystem) {
    const fallback = {
      enabled: false,
      snapToVertices: true,
      snapToEdges: true,
      snapToSurfaces: true,
      showDeltaAxes: true,
      units: 'metric',
    };
    const planned = designSystem?.measurementToolPlan?.defaults;
    if (!planned || typeof planned !== 'object') return fallback;
    return {
      ...fallback,
      ...planned,
    };
  }

  function loadMeasurementSettings(storageKey, defaults) {
    const out = {...defaults};
    if (typeof localStorage === 'undefined') return out;
    try {
      const raw = localStorage.getItem(storageKey);
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

  function saveMeasurementSettings(storageKey, settings) {
    if (typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      return true;
    } catch (_) {
      return false;
    }
  }

  function createMeasurementTool(options={}) {
    const THREE = options.THREE || global.THREE;
    const scene = options.scene || null;
    const renderer = options.renderer || null;
    const camera = options.camera || null;
    const addDim = options.addDim || null;
    const dimLine3 = options.dimLine3 || null;
    const getRoots = (typeof options.getRoots === 'function') ? options.getRoots : (() => []);
    const getActiveDesignIdSafe = (typeof options.getActiveDesignIdSafe === 'function')
      ? options.getActiveDesignIdSafe
      : (() => 'classic');
    const designSystem = options.designSystem || global.ClimbingWallDesignSystem || null;
    const appState = options.appState || global.ClimbingWallAppState || null;

    if (!THREE || !scene || !renderer || !camera || typeof addDim !== 'function' || typeof dimLine3 !== 'function') {
      return null;
    }

    const storageKey = resolveMeasurementStorageKey(designSystem, getActiveDesignIdSafe);
    const defaults = resolveMeasurementDefaults(designSystem);

    const state = {
      settings: loadMeasurementSettings(storageKey, defaults),
      start: null,
      preview: null,
      dragging: false,
      hasDragged: false,
      startMeta: null,
      previewMeta: null,
      segments: [],
      runtimeEnabledOverride: null,
    };

    const overlayGroup = new THREE.Group();
    overlayGroup.name = 'measureOverlay';
    scene.add(overlayGroup);

    const measureRaycaster = new THREE.Raycaster();
    const measureMouse = new THREE.Vector2();
    const measureScratchVec = new THREE.Vector3();
    const measureScratchA = new THREE.Vector3();
    const measureScratchB = new THREE.Vector3();

    function syncToAppState(source='ui:measure') {
      if (!appState || typeof appState.patchState !== 'function') return;
      appState.patchState({
        tools: {
          measurement: {
            ...state.settings,
            active: !!state.start,
            segmentCount: state.segments.length,
          },
        },
      }, {source, emit: true});
    }

    function clearOverlayGroup() {
      while (overlayGroup.children.length) {
        const child = overlayGroup.children.pop();
        overlayGroup.remove(child);
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

    function isRuntimeEnabled() {
      if (typeof state.runtimeEnabledOverride === 'boolean') return state.runtimeEnabledOverride;
      return !!state.settings.enabled;
    }

    function drawMeasureMarker(point, color=0xffaa55, size=0.05) {
      if (!point) return;
      const sx = size;
      const sy = size;
      const sz = size;
      overlayGroup.add(dimLine3(
        new THREE.Vector3(point.x - sx, point.y, point.z),
        new THREE.Vector3(point.x + sx, point.y, point.z),
        color
      ));
      overlayGroup.add(dimLine3(
        new THREE.Vector3(point.x, point.y - sy, point.z),
        new THREE.Vector3(point.x, point.y + sy, point.z),
        color
      ));
      overlayGroup.add(dimLine3(
        new THREE.Vector3(point.x, point.y, point.z - sz),
        new THREE.Vector3(point.x, point.y, point.z + sz),
        color
      ));
    }

    function drawMeasureAxes(start, end) {
      if (!state.settings.showDeltaAxes) return;
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      const dz = Math.abs(end.z - start.z);
      const pX = new THREE.Vector3(end.x, start.y, start.z);
      const pY = new THREE.Vector3(end.x, end.y, start.z);
      if (dx > 0.01) addDim(overlayGroup, start, pX, `dx ${dx.toFixed(2)}m`, 0xe38585);
      if (dy > 0.01) addDim(overlayGroup, pX, pY, `dy ${dy.toFixed(2)}m`, 0x8ccf8c);
      if (dz > 0.01) addDim(overlayGroup, pY, end, `dz ${dz.toFixed(2)}m`, 0x86b7e6);
    }

    function render() {
      clearOverlayGroup();
      state.segments.forEach(seg => {
        addDim(overlayGroup, seg.start, seg.end, formatMeasureLabel(seg.start, seg.end), 0xf4d072);
        drawMeasureAxes(seg.start, seg.end);
        drawMeasureMarker(seg.start, 0xf4d072, 0.035);
        drawMeasureMarker(seg.end, 0xf4d072, 0.035);
      });
      if (state.start && state.preview) {
        addDim(overlayGroup, state.start, state.preview, formatMeasureLabel(state.start, state.preview), 0xffb84d);
        drawMeasureAxes(state.start, state.preview);
        drawMeasureMarker(state.start, 0xffb84d, 0.045);
        drawMeasureMarker(state.preview, 0xffb84d, 0.04);
      } else if (state.start) {
        drawMeasureMarker(state.start, 0xffb84d, 0.045);
      }
    }

    function clearAll({segments=true, active=true} = {}) {
      if (segments) state.segments.length = 0;
      if (active) {
        state.start = null;
        state.preview = null;
        state.startMeta = null;
        state.previewMeta = null;
        state.dragging = false;
        state.hasDragged = false;
      }
      render();
      syncToAppState('ui:measure:clear');
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
      const roots = getRoots().filter(Boolean);
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

      if (triVerts && state.settings.snapToVertices) {
        triVerts.forEach(v => {
          const d = v.distanceTo(basePoint);
          if (d <= snapDist && d < bestDist) {
            bestDist = d;
            snapped = v.clone();
            snapType = 'vertex';
          }
        });
      }

      if (triVerts && state.settings.snapToEdges) {
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

      if (!snapped && !state.settings.snapToSurfaces) return null;
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

    function commitSegment(start, end, meta={}) {
      if (!start || !end) return false;
      if (start.distanceTo(end) < 0.01) return false;
      state.segments.push({
        start: start.clone(),
        end: end.clone(),
        meta: {...meta},
      });
      if (state.segments.length > 16) state.segments.shift();
      return true;
    }

    function pointerMove(clientX, clientY) {
      if (!isRuntimeEnabled() || !state.start) return false;
      const snap = pickMeasurementPoint(clientX, clientY);
      if (!snap) return true;
      state.preview = snap.point.clone();
      state.previewMeta = snap;
      if (state.start.distanceTo(state.preview) > 0.005) {
        state.hasDragged = true;
      }
      render();
      return true;
    }

    function rayPreviewFromHit(hit) {
      if (!isRuntimeEnabled() || !state.start) return false;
      const snap = resolveMeasurementSnap(hit);
      if (!snap) return false;
      state.preview = snap.point.clone();
      state.previewMeta = snap;
      render();
      return true;
    }

    function rayClearPreview() {
      if (!state.start && !state.preview) return false;
      if (!state.start) return false;
      state.preview = null;
      state.previewMeta = null;
      render();
      return true;
    }

    function raySelectFromHit(hit) {
      if (!isRuntimeEnabled()) return false;
      const snap = resolveMeasurementSnap(hit);
      if (!snap) return false;

      if (!state.start) {
        state.start = snap.point.clone();
        state.startMeta = snap;
        state.preview = null;
        state.previewMeta = null;
        render();
        syncToAppState('ui:measure:vr:start');
        return true;
      }

      state.preview = snap.point.clone();
      state.previewMeta = snap;
      const committed = commitSegment(state.start, state.preview, {
        startType: state.startMeta?.type || 'surface',
        endType: state.previewMeta?.type || 'surface',
      });
      if (committed) {
        state.start = null;
        state.preview = null;
        state.startMeta = null;
        state.previewMeta = null;
        render();
        syncToAppState('ui:measure:vr:commit');
        return true;
      }
      render();
      return false;
    }

    function pointerDown(eventLike) {
      if (!isRuntimeEnabled()) return false;
      if (eventLike?.button !== 0) return false;
      const clientX = Number(eventLike?.clientX);
      const clientY = Number(eventLike?.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      const snap = pickMeasurementPoint(clientX, clientY);
      if (!snap) return false;
      if (!state.start) {
        state.start = snap.point.clone();
        state.startMeta = snap;
      } else {
        state.preview = snap.point.clone();
        state.previewMeta = snap;
      }
      state.dragging = true;
      state.hasDragged = false;
      render();
      if (typeof eventLike?.preventDefault === 'function') eventLike.preventDefault();
      return true;
    }

    function pointerUp(eventLike) {
      if (!isRuntimeEnabled() || !state.dragging) return false;
      if (eventLike?.button !== 0) return false;
      state.dragging = false;
      if (!state.start || !state.preview) return true;
      const shouldCommit = state.hasDragged || state.start.distanceTo(state.preview) > 0.05;
      if (shouldCommit && commitSegment(state.start, state.preview, {
        startType: state.startMeta?.type || 'surface',
        endType: state.previewMeta?.type || 'surface',
      })) {
        state.start = null;
        state.preview = null;
        state.startMeta = null;
        state.previewMeta = null;
        syncToAppState('ui:measure:commit');
      }
      render();
      return true;
    }

    function cancelActive() {
      if (!state.start && !state.dragging) return false;
      state.start = null;
      state.preview = null;
      state.startMeta = null;
      state.previewMeta = null;
      state.dragging = false;
      state.hasDragged = false;
      render();
      syncToAppState('ui:measure:cancel');
      return true;
    }

    function setSetting(key, value) {
      if (!Object.prototype.hasOwnProperty.call(state.settings, key)) return false;
      state.settings[key] = value;
      saveMeasurementSettings(storageKey, state.settings);
      if (!state.settings.enabled) cancelActive();
      render();
      syncToAppState(`ui:measure:${key}`);
      return true;
    }

    function setRuntimeEnabled(enabledOrNull) {
      if (enabledOrNull === null || typeof enabledOrNull === 'undefined') {
        state.runtimeEnabledOverride = null;
      } else {
        state.runtimeEnabledOverride = !!enabledOrNull;
      }
      if (!isRuntimeEnabled()) {
        state.preview = null;
        state.previewMeta = null;
      }
      render();
      syncToAppState('ui:measure:runtimeEnabled');
      return true;
    }

    function getSettings() {
      return {...state.settings};
    }

    return Object.freeze({
      pointerDown,
      pointerMove,
      pointerUp,
      rayPreviewFromHit,
      rayClearPreview,
      raySelectFromHit,
      cancelActive,
      clearAll,
      setSetting,
      setRuntimeEnabled,
      getSettings,
      isEnabled: () => isRuntimeEnabled(),
      isDragging: () => !!state.dragging,
      render,
      syncState: syncToAppState,
      getOverlayGroup: () => overlayGroup,
    });
  }

  global.ClimbingWallMeasurementTool = Object.freeze({
    createMeasurementTool,
  });
})(window);
