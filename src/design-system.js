(function attachClimbingWallDesignSystem(global) {
  const ACTIVE_DESIGN_STORAGE_KEY = 'climbingWall.activeDesign.v1';
  const DESIGN_IDS = Object.freeze({
    CLASSIC: 'classic',
    VARIANT_B: 'variantB',
  });
  const DEFAULT_DESIGN_ID = DESIGN_IDS.CLASSIC;

  const LEGACY_STORAGE_KEYS = Object.freeze({
    wallState: 'climbingWall.wallState.v1',
    wallDefaults: 'climbingWall.defaultState.v1',
    geometryState: 'climbingWall.geometryState.v1',
    geometryDefaults: 'climbingWall.geometryDefaultState.v1',
    cameraState: 'climbingWall.cameraState.v1',
    crashMats: 'climbingWall.crashMats.v1',
    polyRoof: 'climbingWall.polyRoof.v1',
    trainingRig: 'climbingWall.trainingRig.v1',
    trainingCabinet: 'climbingWall.trainingCabinet.v1',
    campusBoard: 'climbingWall.campusBoard.v1',
    conceptVolumes: 'climbingWall.conceptVolumes.v1',
    office: 'climbingWall.office.v1',
    sauna: 'climbingWall.sauna.v1',
    outdoorKitchen: 'climbingWall.outdoorKitchen.v1',
    wallTextures: 'climbingWall.wallTextures.v1',
    climbingHolds: 'climbingWall.climbingHolds.v1',
    crashMatTexture: 'climbingWall.crashMatTexture.v1',
    textures: 'climbingWall.textures.v1',
    environment: 'climbingWall.environment.v1',
    globalIllumination: 'climbingWall.globalIllumination.v1',
    globalIlluminationQuality: 'climbingWall.globalIlluminationQuality.v1',
    solarState: 'climbingWall.solarState.v1',
  });

  const CLASSIC_GEOMETRY_DEFAULTS = Object.freeze({
    width: 4.5,
    depth: 3.5,
    fixedHeight: 3.5,
    adjustableHeight: 4.0,
  });

  const CLASSIC_GEOMETRY_LIMITS = Object.freeze({
    width: [3.0, 7.0],
    depth: [2.5, 6.0],
    fixedHeight: [2.8, 4.5],
    adjustableHeight: [3.0, 5.5],
  });

  const CLASSIC_WALL_DEFAULTS = Object.freeze({
    aAngle: 10,
    aWidth: 1.35,
    bAngle: 10,
    bWidth: 1.35,
    cAngle: 10,
    cWidth: 1.3,
    dAngle: 15,
    d1Height: 2.2,
    d2Angle: 15,
    eAngle: 5,
    f1Angle: 10,
    f1Height: 2.2,
    f1Width: 1.0,
    f2Angle: 25,
    f2WidthTop: 1.35,
    rigOpen: 0,
  });

  const CLASSIC_WALL_LIMITS = Object.freeze({
    aAngle: [0, 60],
    aWidth: [0.3, 2.5],
    bAngle: [0, 60],
    bWidth: [0.3, 2.5],
    cAngle: [0, 60],
    cWidth: [0.3, 2.5],
    dAngle: [0, 60],
    d1Height: [0.5, 2.7],
    d2Angle: [0, 75],
    eAngle: [-5, 60],
    f1Angle: [0, 40],
    f1Height: [2.0, 2.7],
    f1Width: [0.1, 2.0],
    f2Angle: [0, 75],
    f2WidthTop: [0.3, 4.5],
    rigOpen: [0, 180],
  });

  const VARIANT_B_GEOMETRY_DEFAULTS = Object.freeze({
    width: 4.8,
    depth: 3.6,
    fixedHeight: 3.6,
    adjustableHeight: 4.1,
  });

  const VARIANT_B_WALL_DEFAULTS = Object.freeze({
    aAngle: 18,
    aWidth: 1.10,
    bAngle: 18,
    bWidth: 1.10,
    cAngle: 14,
    cWidth: 1.25,
    dAngle: 20,
    d1Height: 2.10,
    d2Angle: 18,
    eAngle: 14,
    f1Angle: 18,
    f1Height: 2.30,
    f1Width: 1.20,
    f2Angle: 36,
    f2WidthTop: 1.55,
    rigOpen: 0,
  });

  const CLASSIC_PANEL_SCHEMA = Object.freeze({
    geometry: Object.freeze([
      {id: 'roomWidth', stateKey: 'width', labelId: 'roomWidthLabel', fmt: 'm2'},
      {id: 'roomDepth', stateKey: 'depth', labelId: 'roomDepthLabel', fmt: 'm2'},
      {id: 'fixedHeight', stateKey: 'fixedHeight', labelId: 'fixedHeightLabel', fmt: 'm2'},
      {id: 'adjHeight', stateKey: 'adjustableHeight', labelId: 'adjHeightLabel', fmt: 'm2'},
    ]),
    walls: Object.freeze([
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
    ]),
  });

  // Planning metadata only for now; interactive measuring is not implemented in this phase.
  const MEASUREMENT_TOOL_PLAN = Object.freeze({
    id: 'interactiveMeasure',
    storageKey: 'climbingWall.measureTool.v1',
    defaults: Object.freeze({
      enabled: false,
      snapToVertices: true,
      snapToEdges: true,
      snapToSurfaces: true,
      showDeltaAxes: true,
      units: 'metric',
    }),
    plannedModules: Object.freeze([
      'MeasureInteractionController',
      'MeasureSnapResolver',
      'MeasureOverlayRenderer',
      'MeasureSessionStore',
    ]),
    interactionModel: Object.freeze([
      'Click/trigger once to set start point',
      'Move pointer to preview line and delta dimensions',
      'Click/trigger again to commit endpoint',
      'Esc/secondary click cancels active preview',
    ]),
  });

  const DESIGN_DEFINITIONS = Object.freeze({
    [DESIGN_IDS.CLASSIC]: Object.freeze({
      id: DESIGN_IDS.CLASSIC,
      label: 'Current Wall (A)',
      status: 'active',
      textureNamespace: 'classic',
      geometryDefaults: CLASSIC_GEOMETRY_DEFAULTS,
      geometryLimits: CLASSIC_GEOMETRY_LIMITS,
      wallStateDefaults: CLASSIC_WALL_DEFAULTS,
      wallStateLimits: CLASSIC_WALL_LIMITS,
      panelSchema: CLASSIC_PANEL_SCHEMA,
    }),
    [DESIGN_IDS.VARIANT_B]: Object.freeze({
      id: DESIGN_IDS.VARIANT_B,
      label: 'Alternative Wall (B)',
      status: 'prototype',
      textureNamespace: 'variantB',
      geometryDefaults: VARIANT_B_GEOMETRY_DEFAULTS,
      geometryLimits: CLASSIC_GEOMETRY_LIMITS,
      wallStateDefaults: VARIANT_B_WALL_DEFAULTS,
      wallStateLimits: CLASSIC_WALL_LIMITS,
      panelSchema: CLASSIC_PANEL_SCHEMA,
    }),
  });

  function readStorageValue(key) {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeStorageValue(key, value) {
    if (typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function isKnownDesignId(designId) {
    return !!(designId && Object.prototype.hasOwnProperty.call(DESIGN_DEFINITIONS, designId));
  }

  function getActiveDesignId() {
    const raw = readStorageValue(ACTIVE_DESIGN_STORAGE_KEY);
    if (isKnownDesignId(raw)) return raw;
    return DEFAULT_DESIGN_ID;
  }

  function setActiveDesignId(designId) {
    if (!isKnownDesignId(designId)) return false;
    return writeStorageValue(ACTIVE_DESIGN_STORAGE_KEY, designId);
  }

  function getDesignDefinition(designId=getActiveDesignId()) {
    return DESIGN_DEFINITIONS[designId] || DESIGN_DEFINITIONS[DEFAULT_DESIGN_ID];
  }

  function listDesigns() {
    return Object.keys(DESIGN_DEFINITIONS).map(id => DESIGN_DEFINITIONS[id]);
  }

  function buildScopedStorageKey(designId, legacyKey) {
    if (!designId || designId === DEFAULT_DESIGN_ID) return legacyKey;
    const parts = legacyKey.split('.');
    const tail = parts.slice(1).join('.');
    return `climbingWall.${designId}.${tail}`;
  }

  function getStorageKeysForDesign(designId=getActiveDesignId()) {
    if (!designId || designId === DEFAULT_DESIGN_ID) return LEGACY_STORAGE_KEYS;
    return {
      wallState: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.wallState),
      wallDefaults: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.wallDefaults),
      geometryState: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.geometryState),
      geometryDefaults: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.geometryDefaults),
      cameraState: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.cameraState),
      crashMats: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.crashMats),
      polyRoof: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.polyRoof),
      trainingRig: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.trainingRig),
      trainingCabinet: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.trainingCabinet),
      campusBoard: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.campusBoard),
      conceptVolumes: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.conceptVolumes),
      office: LEGACY_STORAGE_KEYS.office,
      sauna: LEGACY_STORAGE_KEYS.sauna,
      outdoorKitchen: LEGACY_STORAGE_KEYS.outdoorKitchen,
      wallTextures: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.wallTextures),
      climbingHolds: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.climbingHolds),
      crashMatTexture: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.crashMatTexture),
      textures: buildScopedStorageKey(designId, LEGACY_STORAGE_KEYS.textures),
      environment: LEGACY_STORAGE_KEYS.environment,
      globalIllumination: LEGACY_STORAGE_KEYS.globalIllumination,
      globalIlluminationQuality: LEGACY_STORAGE_KEYS.globalIlluminationQuality,
      solarState: LEGACY_STORAGE_KEYS.solarState,
    };
  }

  function getMeasurementStorageKey(designId=getActiveDesignId()) {
    return buildScopedStorageKey(designId, MEASUREMENT_TOOL_PLAN.storageKey);
  }

  function dedupePaths(paths) {
    const seen = new Set();
    const out = [];
    (paths || []).forEach(path => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      out.push(path);
    });
    return out;
  }

  function getTextureConfigForDesign(designId=getActiveDesignId()) {
    const def = getDesignDefinition(designId);
    const ns = (def && typeof def.textureNamespace === 'string' && def.textureNamespace.trim())
      ? def.textureNamespace.trim()
      : designId;
    const designRoot = `textures/designs/${ns}`;
    const legacyRoot = 'textures';
    return Object.freeze({
      designId,
      namespace: ns,
      root: designRoot,
      wallDirs: dedupePaths([`${designRoot}/walls`, `${legacyRoot}/walls`]),
      volumeDirs: dedupePaths([`${designRoot}/volumes`, `${legacyRoot}/volumes`]),
      atlasPath: `${designRoot}/texture-atlas.png`,
      manifestPath: `${designRoot}/texture-atlas.manifest.json`,
      legacyAtlasPath: `${legacyRoot}/texture-atlas.png`,
      legacyManifestPath: `${legacyRoot}/texture-atlas.manifest.json`,
    });
  }

  global.ClimbingWallDesignSystem = Object.freeze({
    version: 'phase1',
    defaultDesignId: DEFAULT_DESIGN_ID,
    designIds: DESIGN_IDS,
    legacyStorageKeys: LEGACY_STORAGE_KEYS,
    measurementToolPlan: MEASUREMENT_TOOL_PLAN,
    getActiveDesignId,
    setActiveDesignId,
    getDesignDefinition,
    listDesigns,
    getStorageKeysForDesign,
    getMeasurementStorageKey,
    getTextureConfigForDesign,
  });
})(window);
