# =====================================================
# STYLE E-Fashion House - Production Dockerfile
# Multi-stage build for optimal image size
# =====================================================

# =====================================================
# Stage 1: Build Client (React/Vite Frontend)
# =====================================================
FROM node:18-alpine AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy client source
COPY client/ ./

# Build the client for production
RUN npm run build

# =====================================================
# Stage 2: Build Server Dependencies
# =====================================================
FROM node:18-alpine AS server-builder

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# =====================================================
# Stage 3: Final Production Image
# =====================================================
FROM node:18-alpine

# Set environment to production
ENV NODE_ENV=production

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Create app user for security (non-root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy server dependencies from builder
COPY --from=server-builder --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules

# Copy server source code
COPY --chown=nodejs:nodejs server/ ./server/

# Copy client build from client-builder
COPY --from=client-builder --chown=nodejs:nodejs /app/client/dist ./client/dist

# Copy root package.json if needed for scripts
COPY --chown=nodejs:nodejs package*.json ./

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Change working directory to server
WORKDIR /app/server

# Use dumb-init to handle signals and start the server
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
