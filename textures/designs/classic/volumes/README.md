# Volume Texture Overrides

Drop custom volume textures in this folder to override the built-in volume finish.

## File names

- `cornerAB.png` for the A/B/ceiling corner volume
- `ceilingG.png` for the hanging ceiling volume
- `dartC.png` for the small C wall volume
- `dartB.png` for the small B wall volume

Optional bump maps:

- `cornerAB-bump.png`
- `ceilingG-bump.png`
- `dartC-bump.png`
- `dartB-bump.png`

## Notes

- Recommended size: `2048x2048` or `1024x1024`.
- If a file is missing, the model falls back to the procedural wall texture.
- These textures follow the shared `Textures` toggle in the UI.
