# Replacement fish models

PP Aqua no longer depends on the original purchased fish pack.

## Recommended source

The replacement pack is the **Quaternius Animated Fish Bundle** on Poly Pizza. It contains more than 50 animated fish models in FBX and GLB formats and is published as **CC0**. The bundle includes Coral Grouper, Clownfish, Blue Tang, Butterfly Fish, Cardinal Fish, Lionfish, Mandarin Fish, Moorish Idol, Koi, Puffer, Yellow Tang, and many others.

Source: https://poly.pizza/bundle/Animated-Fish-Bundle-44zhHN1UbT

## Install

1. Download the **GLTF** version of the bundle from the source page.
2. Save the downloaded ZIP somewhere outside the repository, for example:

   `C:\Users\gostp\Downloads\Animated-Fish-Bundle.zip`

3. From the PP Aqua project root, run:

   `powershell -ExecutionPolicy Bypass -File .\tools\install-replacement-fish-pack.ps1 -Source "C:\Users\gostp\Downloads\Animated-Fish-Bundle.zip"`

The installer reads `assets/coloring/manifest.json`, matches each coloring species to a same-named GLB, copies only the models PP Aqua actually needs, and generates `assets/models/pack/pack.json`.

## Why this approach

The coloring manifest remains the source of truth for fish species. The replacement installer does not create fake matches or silently rename unrelated fish. If a species cannot be matched, it reports that species and leaves it out of the generated pack.

GLB is used directly, so no FBX converter is required for the replacement pack.

## License

The Quaternius bundle is listed as CC0/Public Domain on Poly Pizza. Keep the source URL and this note with the project so the asset provenance remains clear.
