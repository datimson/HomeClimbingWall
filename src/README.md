# Climbing Wall App Modules

- `design-system.js`: Design registry + active design selection + scoped storage keys. Also contains planning metadata for the upcoming interactive measuring tool (snap to points/edges/surfaces).
- `app-state.js`: Central app state store with subscribe/patch APIs and legacy adapter hooks for gradual migration off globals.
- `design-switcher.js`: Design switch helper for desktop/VR menu flows, including selector population and reload behavior.
- `core.js`: Three.js scene/camera/renderer setup, global dimensions/state, shared materials, and utility mesh factory.
- `walls.js`: Wall geometry builders, collision clipping, roof/cap geometry, and adjustable panel construction.
- `annotations.js`: Label sprite and dimension drawing helpers used by both wall and rebuild logic.
- `rebuild.js`: Full scene regeneration pipeline (`rebuild()`), dimension placement, static slab/axis helpers, and initial render build.
- `ui.js`: Orbit/touch camera controls, slider bindings, VR interaction, measurement tool interactions, resize handling, and animation loop.

Load order matters and is defined in `index.html`.
