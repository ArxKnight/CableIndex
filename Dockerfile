# Multi-stage build for WireIndex
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci

# Build frontend
FROM base AS frontend-builder
WORKDIR /app
COPY frontend/ ./frontend/
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
RUN cd frontend && npm run build

# Build backend
FROM base AS backend-builder
WORKDIR /app
COPY backend/ ./backend/
COPY --from=deps /app/backend/node_modules ./backend/node_modules
RUN cd backend && npm run build

# Production image
FROM node:18-alpine AS runner
WORKDIR /app

# Create app user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 wireindex

# Install production dependencies
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package.json ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy startup script
COPY docker/start.sh ./
RUN chmod +x start.sh

# Create data directory for database and uploads
RUN mkdir -p /app/data && chown -R wireindex:nodejs /app/data
RUN mkdir -p /app/uploads && chown -R wireindex:nodejs /app/uploads

# Switch to non-root user
USER wireindex

# Expose port (configurable via environment)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["./start.sh"]