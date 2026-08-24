# PP Aqua deployment

PP Aqua runs as a single Node.js container behind a reverse proxy. The container listens on port 8000 inside the Docker network. HTTPS, the public domain, and certificates are handled by the reverse proxy.

## Requirements

- Linux server with Docker and Docker Compose.
- At least 1 CPU core, 1 GB RAM, and 20 GB disk for a small family deployment.
- An external Docker network named `web` shared with the reverse proxy.
- A domain with an A record pointing to the server.
- The purchased fish model pack, converted on Windows and copied to the server.

## First deployment

Clone this repository wherever you keep your application sources, then configure `.env` from `.env.example`.

```bash
cp .env.example .env
nano .env
```

Set `DOMAIN` to the domain you control.

### Fish pack

Build the purchased pack on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools\convert-pack.ps1
```

Copy the resulting `assets/models/pack/` directory to the server as `pack/` beside the repository's `data/` directory.

### Data directory

The container does not run as root. Make sure the mounted data directory is writable by UID 1000:

```bash
mkdir -p data
chown -R 1000:1000 data
```

### Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f aqua
```

## Updating

```bash
git fetch --all --prune
git checkout main
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps
```

The `data/` and `pack/` directories are mounted from the host, so rebuilding the image does not remove them.

## Backup

The most important directory is `data/` because it contains aquarium metadata and children's drawings.

A simple daily backup is:

```bash
tar czf /var/backups/aqua-$(date +%F).tgz -C /path/to/pp-aqua data
```

Keep copies on a different disk or machine. A backup stored on the same disk is not a disaster-recovery backup.

## Reverse proxy

The supplied Compose configuration expects an external Docker network called `web` and a reverse proxy that terminates HTTPS.

```bash
docker network create web
```

The proxy should route the configured domain to the `aqua` service on port 8000 and provide TLS.

## Public deployment considerations

The aquarium link grants the ability to watch, feed, add fish, and upload backgrounds. This is deliberate because the phone capture workflow is designed to be easy for a child to use.

For a public deployment:

- Keep HTTPS mandatory.
- Keep all upload and storage limits enabled.
- Review proxy access logs and retention.
- Back up `data/` separately from the application image.
- Consider proxy-level authentication if the aquarium should be private to a family.

## Troubleshooting

| Symptom | Check |
|---|---|
| 404 from the proxy | Container status and membership in the `web` network |
| TLS certificate failure | DNS A record and reverse-proxy logs |
| Empty aquarium | Verify that `pack/` exists and `/api/pack` returns models |
| Aquarium data does not save | Check ownership of `data/` and UID 1000 permissions |
| Disk full | Inspect `data/`, the trash directory, and `AQUA_MAX_DATA_MB` |
| Site says the server is unavailable | `docker compose logs aqua` |

## Notes

This fork intentionally avoids upstream-specific domains, usernames, deployment paths, and contact links. Replace the generic deployment placeholders with your own infrastructure before publishing.
