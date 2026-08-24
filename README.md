# PP Aqua

PP Aqua is a small interactive aquarium for children. A child colours a printed fish sheet, photographs it with a phone, and the fish appears in a 3D aquarium on a larger screen.

```text
A4 colouring sheet → phone photo → captured texture → 3D fish
```

The project is intentionally lightweight: a plain Node.js server with no application dependencies, browser JavaScript, three.js, SVG colouring sheets, and JSON manifests. Everything created by users lives under `data/`.

## What it does

- Print an A4 fish colouring sheet.
- Colour it with markers.
- Photograph the whole sheet with a phone.
- Detect the four corner markers and correct perspective.
- Extract the drawing using the fish contour in the manifest.
- Apply the drawing as a texture to the corresponding 3D fish.
- Let fish swim in a three.js aquarium.
- Feed fish, change backgrounds, remove fish, and manage aquariums.
- Open an aquarium on another screen with a QR code, link, or temporary TV PIN.
- Offer a public showcase aquarium when `AQUA_DEMO_TANK` is configured.

## How it works

### The colouring sheet

Each sheet has four black 6×6 markers. Their 16 inner cells encode the fish species and corner orientation. The markers must remain uncoloured. The fish outline is printed as a thin grey line and fin areas use a pale dashed line so the child can colour the fish without mistaking the guide marks for part of the drawing.

### Capture

`assets/capture.js` searches brightness thresholds for the four markers, corrects the sheet perspective, extracts the drawing using the species contour in `manifest.json`, and trims the printed outline so it does not remain as a dark edge on the captured fish.

The resulting image is mapped onto the 3D model through a planar unwrap of its side silhouette.

### Aquarium

`demos/realistic-tank.html` contains the main three.js scene. Fish swim inside a volume derived from the camera frustum rather than a simple box. `assets/fish-frame.js` determines model orientation from animation so different fish can share the same swimming system.

### Menu and second-screen mode

A tap in the aquarium opens the menu. It provides capture, ready-made fish, feeding, colouring sheets, backgrounds, fish removal, and second-screen controls.

Second-screen mode provides a QR code, a share link, and a temporary five-digit TV PIN. A screen opened with the PIN is a viewing screen. The phone remains the control surface.

### Showcase mode

Set `AQUA_DEMO_TANK` to an aquarium code to make that aquarium a public showcase. The home page can offer newcomers a live-aquarium preview, while the showcase menu is intentionally limited.

## Languages

The interface supports **English and Polish**.

The localization system is centralized in `assets/i18n.js`. Language selection is stored in `localStorage`, and English is the fallback. The same localization system is used by the aquarium UI, capture screen, management UI, and printable-sheet page.

Printable sheets have English and Polish versions. The corner markers are identical in both versions, so either language can be recognized by the capture system.

## Running locally

Requirements:

- Node.js 18 or newer.
- No `npm install` is required for the main application.
- three.js is included under `vendor/`.

Start the server:

```bash
node server.js
```

Open:

```text
http://localhost:8000
```

The server also prints LAN addresses so a phone or TV on the same Wi-Fi can open the aquarium.

## Access model

There are no user accounts.

| Action | Aquarium code | Password |
|---|:---:|:---:|
| Watch aquarium | ✓ | |
| Add a fish | ✓ | |
| Feed fish | ✓ | |
| Change background | ✓ | |
| Remove fish | | ✓ |
| Delete aquarium | | ✓ |
| Rename aquarium | | ✓ |
| Change password | | ✓ |

The long aquarium code is deliberate. The identifier uses 31 characters and 10 positions, giving about 8×10^14 possible combinations. The temporary five-digit TV PIN is not an authentication credential. It only grants the same access as the aquarium link and expires after five minutes.

Password attempts are throttled after repeated failures. Passwords are stored on the server only as salted scrypt hashes.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `8000` | HTTP listening port |
| `AQUA_MAX_TANKS` | `200` | Maximum aquariums on the server |
| `AQUA_TANKS_PER_HOUR` | `5` | New aquariums allowed per client address per hour |
| `AQUA_MAX_FISH` | `40` | Maximum fish in one aquarium |
| `AQUA_MAX_BG` | `8` | Maximum custom backgrounds in one aquarium |
| `AQUA_MAX_DATA_MB` | `2048` | Maximum size of the `data/` directory |
| `AQUA_TRASH_DAYS` | `30` | Retention period for deleted content |
| `AQUA_DEMO_TANK` | empty | Aquarium code used for the public showcase |

Image limits are 3 MB per fish, 6 MB per background, and 12 MB per request body.

## Data model

Each aquarium lives under:

```text
data/tanks/<10-character-code>/
├── meta.json
├── settings.json
├── preview.jpg
├── fish/
├── backgrounds/
└── trash/
```

Deleted aquariums move to `data/trash-tanks/`. Deleted drawings stay recoverable for `AQUA_TRASH_DAYS` days before permanent removal.

The `data/` directory is not part of the repository. A backup of the application data is a backup of that directory.

## Deployment

The production setup uses one Node container behind an external reverse proxy. The repository includes `Dockerfile`, `docker-compose.prod.yml`, and `.env.example`.

The container exposes port 8000 only to the Docker network. HTTPS, the domain, and certificates are handled by the reverse proxy.

See `DEPLOY.md` for deployment, backups, proxy configuration, and troubleshooting.

## Public deployment security

The application is designed first for a trusted home network. If it is exposed to the public internet:

- HTTPS is mandatory because the aquarium password is sent in the `X-Tank-Pass` request header.
- Keep the reverse proxy in front of the application.
- Keep upload and storage limits enabled.
- Review reverse-proxy access logging and retention.
- Back up `data/` separately from the application image.

The server deliberately allows adding fish and backgrounds with the aquarium link because the intended capture workflow is phone-first and child-friendly. Irreversible actions remain password protected.

## Fish model pack

The 3D fish models are not included in this repository. They come from a separately purchased model pack whose licence does not permit redistribution.

The conversion tool expects the purchased FBX files under `purchased-fish/fbx/`.

```powershell
npm install --no-save fbx2gltf
$env:FBX2GLTF = (Get-ChildItem node_modules -Recurse -Filter FBX2glTF.exe)[0].FullName
powershell -ExecutionPolicy Bypass -File tools\convert-pack.ps1
```

The conversion process produces glTF files under `assets/models/pack/`. Textures are reduced to 1024 px JPEGs and model metadata is written to `pack.json`.

The exact model pack is not a hard runtime requirement. Other `.glb` or `.gltf` models can be added manually, but printable sheets must be rebuilt if the species set changes.

## Coloring-sheet tools

| Tool | Purpose |
|---|---|
| `tools/silhouettes.html` | Inspect model silhouettes and create contour data |
| `tools/make-coloring.js` | Generate printable sheets and the manifest |
| `tools/test-capture.html` | Test marker recognition under skew, rotation, and noise |
| `tools/convert-pack.ps1` | Convert purchased FBX models to glTF |

The marker generator keeps sufficient Hamming distance between species codes so a single misread cell does not silently turn one fish into another.

## Other models

The runtime can also use your own `.glb` or `.gltf` models under `assets/models/pack/`. Each species needs its own directory and an entry in `pack.json`.

If the species set changes, rebuild the colouring sheets and manifest so the printed contours, marker codes, and model list remain synchronized.

## License

The application code is MIT licensed.

The aquarium background assets included in `assets/backgrounds/` are part of the project. The purchased fish models are not part of the repository and remain subject to their own licence.

The colouring-sheet silhouettes and manifests are derived from the purchased models and should be rebuilt if a different model set is used.

## Fork status

This repository is a maintained fork. Repository-specific names, links, deployment paths, and contact references from the upstream project are intentionally not carried forward.
