(function attachClimbingWallAppState(global) {
  const listeners = new Set();
  const legacyAdapters = new Map();

  const baseState = {
    meta: {
      version: 'phase2',
      activeDesignId: 'classic',
      updatedAt: Date.now(),
    },
    geometry: {},
    walls: {},
    camera: {},
    site: {},
    toggles: {},
    tools: {},
  };

  const state = JSON.parse(JSON.stringify(baseState));

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepMerge(target, patch) {
    if (!isObject(target) || !isObject(patch)) return target;
    Object.keys(patch).forEach(key => {
      const next = patch[key];
      if (next === undefined) return;
      if (Array.isArray(next)) {
        target[key] = next.slice();
        return;
      }
      if (isObject(next)) {
        if (!isObject(target[key])) target[key] = {};
        deepMerge(target[key], next);
        return;
      }
      target[key] = next;
    });
    return target;
  }

  function cloneState(value=state) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function emitChange(meta={}) {
    const snapshot = cloneState();
    listeners.forEach(listener => {
      try {
        listener(snapshot, meta);
      } catch (_) {
        // Listener isolation by design.
      }
    });
  }

  function patchState(patch, options={}) {
    const emit = options.emit !== false;
    const source = options.source || 'unknown';
    if (!isObject(patch)) return cloneState();
    deepMerge(state, patch);
    if (!isObject(state.meta)) state.meta = {};
    state.meta.updatedAt = Date.now();
    if (patch.meta && patch.meta.activeDesignId) {
      state.meta.activeDesignId = patch.meta.activeDesignId;
    }
    if (emit) emitChange({source});
    return cloneState();
  }

  function replaceState(next, options={}) {
    const emit = options.emit !== false;
    const source = options.source || 'replace';
    Object.keys(state).forEach(key => delete state[key]);
    const seed = isObject(next) ? next : baseState;
    deepMerge(state, cloneState(seed));
    if (!isObject(state.meta)) state.meta = {};
    state.meta.updatedAt = Date.now();
    if (!state.meta.version) state.meta.version = baseState.meta.version;
    if (emit) emitChange({source});
    return cloneState();
  }

  function getState() {
    return cloneState();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function registerLegacyAdapter(name, adapter) {
    if (!name || !isObject(adapter)) return false;
    legacyAdapters.set(name, adapter);
    return true;
  }

  function pullFromLegacy(name, options={}) {
    const adapter = legacyAdapters.get(name);
    if (!adapter || typeof adapter.getSnapshot !== 'function') return null;
    const snap = adapter.getSnapshot();
    if (!isObject(snap)) return null;
    return patchState(snap, {
      emit: options.emit !== false,
      source: options.source || `legacy:${name}:pull`,
    });
  }

  function pushToLegacy(name, options={}) {
    const adapter = legacyAdapters.get(name);
    if (!adapter || typeof adapter.applySnapshot !== 'function') return false;
    try {
      adapter.applySnapshot(getState(), options);
      return true;
    } catch (_) {
      return false;
    }
  }

  global.ClimbingWallAppState = Object.freeze({
    getState,
    patchState,
    replaceState,
    subscribe,
    registerLegacyAdapter,
    pullFromLegacy,
    pushToLegacy,
  });
})(window);
