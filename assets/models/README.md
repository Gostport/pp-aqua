# Fish models

The game uses a purchased fish model pack. The converted files live under `assets/models/pack/`, which is intentionally excluded from git because the model licence does not permit redistribution.

The species list is defined by `assets/coloring/manifest.json`. The same manifest connects printable colouring sheets to the corresponding 3D models.

Model orientation is determined by `assets/fish-frame.js` from the animation. `assets/fish-glb.js` provides a fallback for models without animation.

## Where to find models

| Source | Account | Licence | Download |
|---|---|---|---|
| [Poly Pizza](https://poly.pizza/search/fish) | Not required | Check each asset | Download GLB |
| [Sketchfab](https://sketchfab.com/search?features=downloadable&type=models&q=fish) | Free account may be required | Prefer CC0 or CC-BY | Download glTF Binary (.glb) |
| [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Models.md) | Not required | CC0 for the applicable samples | Download GLB |

Useful search terms include `clownfish`, `angelfish`, `koi carp`, `betta fish`, `yellow tang`, `guppy`, `goldfish`, `reef fish`, and `tropical fish rigged`.

For Sketchfab, prefer **Downloadable** and **Animated** models so the aquarium can use the supplied swimming animation.

## File requirements

- `.glb` is preferred because it keeps geometry and textures together. `.gltf` with its texture files also works when all files are kept together.
- Keep individual models reasonably small. Around 15 MB or less is a good target for browser loading.
- One fish per model, without an unrelated scene around it.
- Draco geometry compression is supported.
- KTX2/Basis textures are not supported by the current runtime.
- Model orientation does not need to be standardized. The scene estimates the long axis, head, and back.
- If a skeletal animation exists, the first animation clip is used. Without a skeleton, the runtime can fall back to procedural body movement.
- If textures exist, they are used. Models without textures can use the runtime's procedural material handling.

## Adding a species

A species enters the game together with its colouring sheet.

1. Open `/tools/silhouettes.html` and generate `contours.json`.
2. Add the species to `tools/make-coloring.js` with its model folder, English and Polish names, and scene length.
3. Run `node tools/make-coloring.js` to rebuild the SVG sheets and manifest.
4. Run `/tools/test-capture.html` and verify every sheet passes recognition tests under skew, rotation, and noise.

Marker codes are deterministic for a fixed species list. Adding a species can change the code assignment, so previously printed sheets may need to be regenerated.

## Inspecting a GLB

For a standard glTF binary, a quick inspection can be done with a glTF-aware tool. The exact container layout can vary between exporters, so use a dedicated glTF inspector when a model behaves unexpectedly.

## Converting OBJ to GLB

OBJ packages commonly contain an `.obj`, `.mtl`, and one or more image files. A convenient conversion route is:

```bash
npx -y obj2gltf@3 -i fish.obj -o fish.glb
```

Two common problems are absolute texture paths in the MTL file and unexpected coordinate systems. Keep textures beside the OBJ and use relative paths. The aquarium scene determines model orientation at runtime.

## Current purchased pack

The intended pack is **Coral Reef Fish Collection animated — Game Ready pack 8** by JosKata on CGTrader. It contains 30 reef fish with skeletal animation and is licensed separately from this repository.

Only models that are present in the converted pack and represented by the colouring manifest appear in the ready-made fish picker.

## Licensing

The application source is MIT licensed. Fish model files are not part of that licence. Every external model must be used according to its own licence, and purchased or restricted model files must not be committed to this repository.
