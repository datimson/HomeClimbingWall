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

  global.ClimbingWallVrMenu = Object.freeze({
    createVrMenuToolkit,
  });
})(window);
