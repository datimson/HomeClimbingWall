# Repository Guidelines

## Project Structure & Module Organization
This repository is a lightweight static web project. The main application lives in `index.html`, which currently contains layout, styling, and Three.js scene logic in one file. `index.html.bak` is a local backup snapshot.

If the project grows, split concerns incrementally:
- `src/` for JavaScript modules
- `styles/` for CSS
- `assets/` for images/material references
- `tests/` for automated tests

Keep `index.html` as the entry point.

## Build, Test, and Development Commands
There is no build pipeline today. Use a local static server for development:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

Optional (Node installed):

```bash
npx serve .
```

Use browser DevTools for runtime checks (console errors, FPS/perf, layout responsiveness).

## Coding Style & Naming Conventions
- Use 2-space indentation in HTML, CSS, and JavaScript.
- Use semicolons and single quotes in JavaScript.
- Use `camelCase` for variables/functions (`wallState`, `rebuildWalls`).
- Use `UPPER_SNAKE_CASE` for fixed constants (`W`, `D`, `H_fixed` style may be migrated to `H_FIXED` in new code).
- Use lowercase kebab-case for CSS classes/IDs (`canvas-wrap`, `angle-slider`).

Prefer small, focused functions for geometry updates and keep wall parameters centralized in one state object.

## Testing Guidelines
No automated test suite is configured yet. For each change, run a manual smoke test:
- Confirm sliders update labels and geometry correctly.
- Confirm drag/zoom/pan interactions still work.
- Confirm window resize keeps canvas and panel layout stable.
- Check the browser console for warnings/errors.

When reusable logic is extracted into modules, add unit tests under `tests/` with clear names like `wall-geometry.test.js`.

## Commit & Pull Request Guidelines
Git history is not available in this workspace, so use this convention:
- Commit format: `<type>: <imperative summary>` (example: `fix: clamp adjustable wall angle`).
- Keep commits scoped to one logical change.

PRs should include:
- What changed and why
- Before/after screenshot or short recording for UI changes
- Manual test steps performed
- Linked issue/task (if applicable)

## Security & Configuration Tips
- Keep external CDN dependencies pinned to explicit versions (e.g., Three.js `r128`).
- Do not commit secrets or private URLs; this project should remain static-client safe.
