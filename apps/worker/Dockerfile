FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/

# Install all dependencies (including dev for build)
RUN npm ci --workspace=@tag-relay/worker

# Copy source code
COPY apps/worker apps/worker

# Build application
RUN npm run -w @tag-relay/worker build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install AWS CLI and jq for secrets loading
RUN apk add --no-cache aws-cli jq

# Copy package files
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/

# Install production dependencies only
RUN npm ci --workspace=@tag-relay/worker --omit=dev

# Copy built application from builder
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Copy scripts
COPY scripts/load-secrets.sh ./scripts/
RUN chmod +x ./scripts/load-secrets.sh

# Use secrets loading script as entrypoint
ENTRYPOINT ["./scripts/load-secrets.sh"]

# Start application
CMD ["node", "apps/worker/dist/index.js"]
