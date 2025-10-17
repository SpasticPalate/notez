# Notez Deployment Guide

Complete guide for deploying Notez to production using Docker and Portainer.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Docker Compose)](#quick-start-docker-compose)
- [Production Deployment](#production-deployment)
- [Portainer Deployment](#portainer-deployment)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Updating](#updating)
- [Backup and Restore](#backup-and-restore)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Docker 20.10 or later
- Docker Compose 2.0 or later (for local development)
- PostgreSQL 16 (included in Docker Compose)

---

## Quick Start (Docker Compose)

The fastest way to get Notez running locally:

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/notez.git
cd notez
```

### 2. Create environment file

```bash
cp .env.example .env
```

### 3. Generate secure secrets

**On Linux/Mac:**
```bash
openssl rand -base64 48
```

**On Windows (PowerShell):**
```powershell
-join ((48..122) | Get-Random -Count 48 | % {[char]$_})
```

Update the following in `.env`:
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `COOKIE_SECRET`
- `ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`

### 4. Start the application

```bash
docker-compose up -d
```

### 5. Access Notez

Open your browser to: **http://localhost:3000**

The first time you access Notez, you'll be prompted to create an admin account.

---

## Production Deployment

### Option 1: Using Pre-built Image from GHCR

```bash
docker pull ghcr.io/yourusername/notez:latest
```

### Option 2: Build from Source

```bash
docker build -t notez:latest .
```

### Run Production Container

**⚠️ SECURITY WARNING:** Never pass secrets directly on the command line, as they will be visible in shell history and process listings.

**Recommended: Use environment file:**

```bash
# Create a secure .env file
cat > notez.env <<EOF
DATABASE_URL=postgresql://user:pass@host:5432/notez
JWT_ACCESS_SECRET=your-secure-secret
JWT_REFRESH_SECRET=your-secure-secret
COOKIE_SECRET=your-secure-secret
ENCRYPTION_KEY=your-secure-encryption-key-32-chars
CORS_ORIGIN=https://your-domain.com
EOF

# Set restrictive permissions
chmod 600 notez.env

# Run container with env file
docker run -d \
  --name notez \
  -p 3000:3000 \
  --env-file notez.env \
  --restart unless-stopped \
  ghcr.io/yourusername/notez:latest
```

**Alternative: Use Docker secrets (Swarm mode):**

```bash
# Create secrets
echo "your-jwt-access-secret" | docker secret create jwt_access_secret -
echo "your-jwt-refresh-secret" | docker secret create jwt_refresh_secret -
echo "your-cookie-secret" | docker secret create cookie_secret -
echo "your-encryption-key" | docker secret create encryption_key -

# Run with secrets
docker service create \
  --name notez \
  -p 3000:3000 \
  --secret jwt_access_secret \
  --secret jwt_refresh_secret \
  --secret cookie_secret \
  --secret encryption_key \
  --restart-condition any \
  ghcr.io/yourusername/notez:latest
```

---

## Portainer Deployment

### Method 1: Portainer Stacks (Recommended)

1. **Log in to Portainer**
2. **Navigate to Stacks**
3. **Click "Add Stack"**
4. **Name your stack:** `notez`
5. **Choose "Web editor"**
6. **Paste the docker-compose.yml content**
7. **Add Environment Variables:**

```env
POSTGRES_DB=notez
POSTGRES_USER=notez
POSTGRES_PASSWORD=<generate-secure-password>
JWT_ACCESS_SECRET=<generate-secure-secret>
JWT_REFRESH_SECRET=<generate-secure-secret>
COOKIE_SECRET=<generate-secure-secret>
ENCRYPTION_KEY=<generate-secure-key-32-chars>
CORS_ORIGIN=https://your-domain.com
APP_PORT=3000
```

8. **Click "Deploy the stack"**
9. **Wait for containers to start** (check health status)
10. **Access Notez** at `http://your-server:3000`

### Method 2: Portainer Container Creation

1. **Navigate to Containers**
2. **Click "Add container"**
3. **Configure:**
   - **Name:** `notez`
   - **Image:** `ghcr.io/yourusername/notez:latest`
   - **Port mapping:** `3000:3000`
   - **Network:** Bridge or custom network with PostgreSQL
   - **Environment variables:** (see above)
   - **Restart policy:** Unless stopped
4. **Click "Deploy the container"**

### Portainer Webhook (Auto-Update)

To automatically update Notez when new images are pushed:

1. **Go to your Notez container in Portainer**
2. **Click "Duplicate/Edit"**
3. **Scroll to "Webhook"**
4. **Enable webhook**
5. **Copy the webhook URL**
6. **Add to GitHub Actions** (optional):

```yaml
- name: Trigger Portainer Webhook
  if: github.ref == 'refs/heads/main'
  run: |
    curl -X POST ${{ secrets.PORTAINER_WEBHOOK_URL }}
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://notez:password@postgres:5432/notez` |
| `JWT_ACCESS_SECRET` | JWT access token secret (32+ chars) | `your-random-secret-here` |
| `JWT_REFRESH_SECRET` | JWT refresh token secret (32+ chars) | `your-random-secret-here` |
| `COOKIE_SECRET` | Cookie signing secret (32+ chars) | `your-random-secret-here` |
| `ENCRYPTION_KEY` | Encryption key for AI keys (32+ chars) | `your-random-key-here` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | `3000` |
| `HOST` | Host address | `0.0.0.0` |
| `NODE_ENV` | Node environment | `production` |
| `LOG_LEVEL` | Logging level | `info` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |

### Security Best Practices

⚠️ **NEVER use default secrets in production!**

1. **Generate unique secrets** for each deployment
2. **Store secrets securely** (Portainer secrets, environment variables)
3. **Use different secrets** for each environment (dev, staging, prod)
4. **Rotate secrets periodically** (every 90 days recommended)
5. **Never commit secrets** to version control

---

## Database Migrations

Migrations run automatically when the container starts. To run manually:

```bash
# Enter the container
docker exec -it notez sh

# Run migrations
cd backend
npx prisma migrate deploy
```

### Manual Migration

If you need to run migrations before starting:

```bash
# Using env file (recommended)
docker run --rm \
  --env-file notez.env \
  ghcr.io/yourusername/notez:latest \
  sh -c "cd backend && npx prisma migrate deploy"

# Or set DATABASE_URL from file
docker run --rm \
  -e DATABASE_URL="$(cat database-url.txt)" \
  ghcr.io/yourusername/notez:latest \
  sh -c "cd backend && npx prisma migrate deploy"
```

---

## Updating

### Docker Compose

```bash
# Pull latest images
docker-compose pull

# Restart containers
docker-compose up -d

# View logs
docker-compose logs -f notez
```

### Portainer

1. **Go to your Notez container**
2. **Click "Recreate"**
3. **Enable "Pull latest image"**
4. **Click "Recreate"**

### Manual Update

```bash
# Pull latest image
docker pull ghcr.io/yourusername/notez:latest

# Stop and remove old container
docker stop notez
docker rm notez

# Start new container with same configuration
docker run -d ... (same command as before)
```

---

## Backup and Restore

### Backup Database

```bash
# Using docker-compose
docker-compose exec postgres pg_dump -U notez notez > notez-backup-$(date +%Y%m%d).sql

# Using docker
docker exec notez-postgres pg_dump -U notez notez > notez-backup-$(date +%Y%m%d).sql
```

### Restore Database

```bash
# Using docker-compose
docker-compose exec -T postgres psql -U notez notez < notez-backup.sql

# Using docker
docker exec -i notez-postgres psql -U notez notez < notez-backup.sql
```

### Automated Backups

Create a cron job for daily backups:

```bash
0 2 * * * docker exec notez-postgres pg_dump -U notez notez | gzip > /backups/notez-$(date +\%Y\%m\%d).sql.gz
```

---

## Troubleshooting

### Container won't start

**Check logs:**
```bash
docker logs notez
```

**Common issues:**
- Database connection failed (check `DATABASE_URL`)
- Missing environment variables
- Port already in use (change `APP_PORT`)

### Database connection failed

1. **Verify PostgreSQL is running:**
   ```bash
   docker ps | grep postgres
   ```

2. **Test connection:**
   ```bash
   docker exec -it notez-postgres psql -U notez -d notez
   ```

3. **Check DATABASE_URL format:**
   ```
   postgresql://username:password@host:port/database
   ```

### Can't access the application

1. **Check container is running:**
   ```bash
   docker ps | grep notez
   ```

2. **Check health status:**
   ```bash
   docker inspect notez | grep Health -A 10
   ```

3. **Check port mapping:**
   ```bash
   docker port notez
   ```

4. **Check firewall rules** (if remote access)

### Migrations failed

1. **Run migrations manually:**
   ```bash
   docker exec -it notez sh -c "cd backend && npx prisma migrate deploy"
   ```

2. **Check migration status:**
   ```bash
   docker exec -it notez sh -c "cd backend && npx prisma migrate status"
   ```

3. **Reset database** (⚠️ DESTROYS ALL DATA):
   ```bash
   docker exec -it notez sh -c "cd backend && npx prisma migrate reset"
   ```

### Health check failing

**View health check logs:**
```bash
docker inspect notez --format='{{json .State.Health}}' | jq
```

**Test health endpoint manually:**
```bash
curl http://localhost:3000/health
```

### Performance issues

1. **Check resource usage:**
   ```bash
   docker stats notez
   ```

2. **Increase container resources** (if using Portainer)
3. **Check PostgreSQL performance:**
   ```bash
   docker exec -it notez-postgres psql -U notez -d notez -c "SELECT * FROM pg_stat_activity;"
   ```

---

## Additional Resources

- **GitHub Repository:** https://github.com/yourusername/notez
- **Issues:** https://github.com/yourusername/notez/issues
- **Docker Hub:** https://ghcr.io/yourusername/notez

---

## Support

If you encounter issues:

1. **Check logs:** `docker logs notez`
2. **Review this guide** thoroughly
3. **Search existing issues** on GitHub
4. **Create a new issue** with:
   - Docker version
   - Error logs
   - Environment details (redact secrets!)
   - Steps to reproduce

---

**Happy note-taking! 📝**
