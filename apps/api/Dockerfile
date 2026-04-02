FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/

# Install all dependencies (including dev for build)
RUN npm ci --workspace=@tag-relay/api

# Copy source code
COPY apps/api apps/api

# Build application
RUN npm run -w @tag-relay/api build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install AWS CLI and jq for secrets loading
RUN apk add --no-cache aws-cli jq curl

# Copy package files
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/

# Install production dependencies only
RUN npm ci --workspace=@tag-relay/api --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy scripts
COPY scripts/load-secrets.sh ./scripts/
RUN chmod +x ./scripts/load-secrets.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3001}/health || exit 1

# Use secrets loading script as entrypoint
ENTRYPOINT ["./scripts/load-secrets.sh"]

# Start application
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
