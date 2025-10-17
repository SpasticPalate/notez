# Multi-stage Dockerfile for Notez
# Builds frontend and backend into a single optimized image

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy backend source
COPY backend/ ./

# Generate Prisma Client
RUN npx prisma generate

# Build backend TypeScript
RUN npm run build

# Remove devDependencies
RUN npm prune --production

# Stage 3: Production Image
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S notez && \
    adduser -S notez -u 1001

# Copy backend build and dependencies
COPY --from=backend-builder --chown=notez:notez /app/backend/dist ./backend/dist
COPY --from=backend-builder --chown=notez:notez /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder --chown=notez:notez /app/backend/package.json ./backend/package.json

# Copy Prisma schema and migrations
COPY --from=backend-builder --chown=notez:notez /app/backend/prisma ./backend/prisma

# Copy frontend build
COPY --from=frontend-builder --chown=notez:notez /app/frontend/dist ./frontend/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Switch to non-root user
USER notez

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "backend/dist/index.js"]
