# Refactor Plan: Multi-Design Architecture

## Goals
- Support at least two climbing wall designs and switch between them for comparison.
- Reuse shared systems: dimensions, wall controls, site positioning, textures/materials, VR controls.
- Keep current behavior stable while refactoring in small, reversible steps.

## Phase 1 (Implemented)
- Add a design registry module (`src/design-system.js`):
  - Active design id persistence.
  - Per-design storage key scoping (legacy keys kept for `classic`).
  - Per-design defaults and limits for geometry and wall state.
  - Shared panel control schema for UI/VR generation.
- Wire `src/core.js` to consume registry defaults/limits/storage keys with legacy fallback.

## Phase 2
- Extract app state into a central store API:
  - `state.geometry`, `state.design`, `state.toggles`, `state.camera`.
  - Evented updates (`onStateChanged`) so UI/rebuild/VR read one source of truth.
- Keep compatibility adapters so existing globals still work during migration.
- Scope texture assets per design:
  - Runtime resolves from `textures/designs/<designId>/{walls,volumes}` first, then legacy paths.
  - Atlas pack/unpack scripts support `-DesignId` and write/read per-design atlas + manifest.

## Phase 3
- Split rebuild pipeline into deterministic stages:
  - `buildDesignGeometry`
  - `buildSharedFeatures` (mats, rig, volumes, holds)
  - `buildEnvironment`
  - `buildDimensionsAndLabels`
- Add invalidation flags to avoid full rebuild when only one subsystem changes.

## Phase 4
- Move UI/VR controls to schema-driven generation from the active design definition.
- Add design switch UI + compare workflow (A/B swap initially; split view later if needed).

## Measurement Tool Planning (Not Implemented Yet)
- Planned modules:
  - `MeasureInteractionController` (click/drag workflow)
  - `MeasureSnapResolver` (vertex/edge/surface snap)
  - `MeasureOverlayRenderer` (line, label, delta axes)
  - `MeasureSessionStore` (persisted settings/history)
- Planned interactions:
  - Click start point, drag, click end point.
  - Snap toggles: points, edges, surfaces.
  - Optional delta readouts (`dx`, `dy`, `dz`) and total distance.

## Validation Checklist Per Phase
- Desktop camera, first-person movement, and hover dimensions.
- VR locomotion, teleport, quick menu, and slider responsiveness.
- Persistence load/save across reloads.
- No geometry gaps/regressions at wall seams and roof joins.
