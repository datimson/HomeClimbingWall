(function attachClimbingWallRebuildScheduler(global) {
  function getStageConstants() {
    const stage = global?.REBUILD_STAGE;
    return Object.freeze({
      GEOMETRY: stage?.GEOMETRY || 'geometry',
      ANNOTATIONS: stage?.ANNOTATIONS || 'annotations',
      CRASH_MATS: stage?.CRASH_MATS || 'crashMats',
    });
  }

  function createRebuildScheduler(options={}) {
    const rebuildFn = (typeof options.rebuildFn === 'function') ? options.rebuildFn : null;
    const invalidateFn = (typeof options.invalidateFn === 'function') ? options.invalidateFn : null;
    const syncFn = (typeof options.syncFn === 'function') ? options.syncFn : null;
    const throttleMs = Math.max(0, Number(options.throttleMs) || 40);
    const stages = getStageConstants();
    let queuedTimer = 0;
    let lastRebuildAt = 0;

    function request(args={}) {
      if (!rebuildFn) return;
      const immediate = !!args.immediate;
      const stageList = Array.isArray(args.stages) ? args.stages : null;
      if (invalidateFn) {
        if (stageList && stageList.length) invalidateFn(stageList);
        else invalidateFn();
      }

      const run = () => {
        lastRebuildAt = (
          typeof performance !== 'undefined' && typeof performance.now === 'function'
        ) ? performance.now() : Date.now();
        if (syncFn) {
          try {
            syncFn('ui:requestRebuild');
          } catch (_) {
            // best effort sync
          }
        }
        if (invalidateFn) rebuildFn({useDirty: true});
        else rebuildFn();
      };

      if (immediate) {
        if (queuedTimer) {
          clearTimeout(queuedTimer);
          queuedTimer = 0;
        }
        run();
        return;
      }

      if (queuedTimer) return;
      const now = (
        typeof performance !== 'undefined' && typeof performance.now === 'function'
      ) ? performance.now() : Date.now();
      const elapsed = now - lastRebuildAt;
      const wait = Math.max(0, throttleMs - elapsed);
      queuedTimer = setTimeout(() => {
        queuedTimer = 0;
        run();
      }, wait);
    }

    return Object.freeze({
      request,
      stages,
    });
  }

  global.ClimbingWallRebuildScheduler = Object.freeze({
    createRebuildScheduler,
    getStageConstants,
  });
})(window);
