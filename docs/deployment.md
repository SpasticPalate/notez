# Production Deployment Guide

This guide covers deploying Notez to a self-hosted Docker environment with automatic deployments via GitHub Actions and a self-hosted runner.

## Prerequisites

- Docker host with Docker Compose v2
- GitHub Actions self-hosted runner on the Docker host (with Docker socket access)
- Access to ghcr.io/spasticpalate/notez container registry

## Compose Files

| File | Purpose |
|------|---------|
| `compose.prod.yml` | **Production deployment** |
| `compose.yml` | Local development (builds from source) |
| `compose.local.yml` | Local environment variants |
| `compose.test.yml` | Test environment |

## How Deployments Work

```
Merge to main → GitHub Actions builds image → Pushes to GHCR → Self-hosted runner pulls image → docker compose up -d → Live
```

1. Code is merged to `main` on GitHub
2. GitHub Actions (cloud runner) builds a Docker image and pushes to `ghcr.io/spasticpalate/notez:main`
3. The deploy job runs on the **self-hosted runner** on the Docker host
4. Runner checks out the repo, pulls the new image, and runs `docker compose up -d`
5. The `docker-entrypoint.sh` runs database migrations before starting the app
6. Application is live with the new version

No manual interaction required.

## Initial Setup

### 1. Self-Hosted Runner

The runner must be on the same host as the Docker deployment, with the Docker socket mounted so it can run `docker compose` commands.

Required runner labels: `self-hosted`, `your-server`

### 2. GitHub Secrets

All secrets are stored in GitHub Actions (Settings → Secrets and variables → Actions). The deploy workflow injects them as environment variables for compose interpolation.

#### Required Secrets

Generate secure values with: `openssl rand -hex 32`

| Secret | Description |
|--------|-------------|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_ACCESS_SECRET` | 64-char secret for access tokens |
| `JWT_REFRESH_SECRET` | 64-char secret for refresh tokens |
| `COOKIE_SECRET` | 64-char secret for cookie signing |
| `ENCRYPTION_KEY` | 32-char secret for data encryption |
| `MINIO_SECRET_KEY` | MinIO storage password |
| `CORS_ORIGIN` | Your Notez URL (e.g., `https://notez.example.com`) |
| `APP_URL` | Public URL for email links (e.g., `https://notez.example.com`) |

#### Optional

| Secret | Description |
|--------|-------------|
| `RESEND_API_KEY` | Resend.com API key for password reset emails |

### 3. Host Directories

Create the bind mount directories on the Docker host:

```bash
mkdir -p /opt/notez/data/postgres
mkdir -p /opt/notez/data/minio
```

## Architecture

```
compose.prod.yml defines three services:

notez-db       (postgres:16-alpine)   - PostgreSQL database with healthcheck
notez-minio    (minio/minio:latest)   - S3-compatible object storage for images
notez-backend  (ghcr.io/.../notez)    - Backend API + frontend static files
```

The backend container:
- Runs `prisma migrate deploy` on startup (via entrypoint)
- Serves the Fastify API on port 3000
- Serves the Vite-built frontend as static files
- Exposes port 5173 externally (mapped to internal 3000)

### Volume Configuration

Both data volumes use named volumes with bind mounts to host paths:

```yaml
volumes:
  notez_data:
    name: notez_data          # Explicit name prevents project-name prefix issues
    device: /opt/notez/data/postgres
  notez_minio:
    name: notez_minio
    device: /opt/notez/data/minio
```

The explicit `name:` ensures volumes are reused regardless of the compose project name.

## Database Backups

PostgreSQL data is stored at `/opt/notez/data/postgres` via a bind mount.

```bash
# Create backup
docker exec notez-db pg_dump -U notez notez > backup.sql

# Restore backup
docker exec -i notez-db psql -U notez notez < backup.sql
```

## Troubleshooting

### Container won't start
- Check logs: `docker logs notez-backend`
- Verify all required GitHub secrets are set
- Ensure PostgreSQL is healthy before backend starts

### Database connection errors
- Confirm `POSTGRES_PASSWORD` GitHub secret matches the database
- Check that `notez-db` container is running: `docker ps`

### CORS errors in browser
- Verify `CORS_ORIGIN` exactly matches your frontend URL
- Include protocol (`https://`) and exclude trailing slash

### Deployment not triggering
- Check GitHub Actions logs for the deploy job
- Verify the self-hosted runner is online: `docker ps | grep github-runner`
- Runner must have Docker socket mounted and `your-server` label
