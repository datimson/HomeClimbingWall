(function attachClimbingWallDesignSwitcher(global) {
  function getRuntimeDesignSystem() {
    if (!global || typeof global !== 'object') return null;
    const ds = global.ClimbingWallDesignSystem;
    if (!ds || typeof ds !== 'object') return null;
    return ds;
  }

  function getAvailableDesignDefs() {
    const ds = getRuntimeDesignSystem();
    if (!ds || typeof ds.listDesigns !== 'function') return [];
    const defs = ds.listDesigns();
    return Array.isArray(defs) ? defs : [];
  }

  function getActiveDesignIdSafe() {
    const ds = getRuntimeDesignSystem();
    if (!ds || typeof ds.getActiveDesignId !== 'function') return 'classic';
    const id = ds.getActiveDesignId();
    return (typeof id === 'string' && id) ? id : 'classic';
  }

  function switchDesignAndReload(designId, options={}) {
    const ds = getRuntimeDesignSystem();
    if (!ds || typeof ds.setActiveDesignId !== 'function') return false;
    const next = String(designId || '').trim();
    if (!next) return false;
    if (next === getActiveDesignIdSafe()) return true;

    const ok = ds.setActiveDesignId(next);
    if (!ok) return false;

    const syncFn = (typeof options.syncAppStateFromCore === 'function')
      ? options.syncAppStateFromCore
      : null;
    if (syncFn) {
      try {
        syncFn('ui:design:switch');
      } catch (_) {
        // best effort sync only
      }
    }

    const reloadDelayMs = Number.isFinite(options.reloadDelayMs)
      ? Math.max(0, options.reloadDelayMs)
      : 30;
    global.setTimeout(() => global.location.reload(), reloadDelayMs);
    return true;
  }

  function initDesignSelector(options={}) {
    const select = options.selectElement
      || document.getElementById(options.selectId || 'designSelect');
    if (!select) return false;

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
      opt.textContent = (status && status !== 'active') ? `${label} (${status})` : label;
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
      const ok = switchDesignAndReload(next, {
        syncAppStateFromCore: options.syncAppStateFromCore,
        reloadDelayMs: options.reloadDelayMs,
      });
      if (!ok) {
        select.value = activeId;
        if (typeof options.onStatus === 'function') options.onStatus('Design switch failed', true);
        return;
      }
      if (typeof options.onStatus === 'function') options.onStatus('Switching design...');
    });
    return true;
  }

  global.ClimbingWallDesignSwitcher = Object.freeze({
    getRuntimeDesignSystem,
    getAvailableDesignDefs,
    getActiveDesignIdSafe,
    switchDesignAndReload,
    initDesignSelector,
  });
})(window);
