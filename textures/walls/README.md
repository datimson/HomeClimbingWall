# Wall Texture Overrides

Drop custom wall textures in this folder to override the built-in procedural finish.

## File names

Whole-wall fallback files:

- `A.png` ... `G.png`

Section files (override a specific panel only):

- `A-kick.png`, `A-s1.png`, `A-s2.png`
- `B-kick.png`, `B-s1.png`, `B-s2.png`
- `C-kick.png`, `C-s1.png`, `C-s2.png`
- `D-kick.png`, `D-s1.png`, `D-s2.png`
- `E-kick.png`, `E-s1.png`
- `F-kick.png`, `F-s1.png`, `F-s2.png`

Optional bump maps:

- Whole wall: `A-bump.png` ... `G-bump.png`
- Per section: `<Wall>-<section>-bump.png` (for example `D-s2-bump.png`)

## Notes

- Recommended size: `2048x2048` or `1024x1024`.
- PNGs are mapped once per panel material (no repeat).
- Lookup order is: section texture first, then whole-wall fallback.
- If no override is found, the app falls back to the bundled plywood preview maps in `textures/sources/plywood04517`.
- Backs of walls still use plywood-only fallback, so painted fronts do not bleed through.
- If a file is missing, the app falls back to generated textures automatically.
- For reliable custom image loading, serve via `http://` (not `file://`) in browsers that block local texture reads.
