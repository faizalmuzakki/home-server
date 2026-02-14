# Build stage
FROM node:22-slim AS builder

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the bot
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Runtime stage
FROM node:22-slim AS runner

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 botuser && \
    useradd -u 1001 -g botuser -s /bin/bash -m botuser

# Copy necessary files from builder
COPY --from=builder --chown=botuser:botuser /app/package*.json ./
COPY --from=builder --chown=botuser:botuser /app/node_modules ./node_modules
COPY --from=builder --chown=botuser:botuser /app/dist ./dist
COPY --from=builder --chown=botuser:botuser /app/root-manifest.json ./

# Create data directory and ensure /app is owned by botuser
RUN mkdir -p /app/data && chown -R botuser:botuser /app

USER botuser

# Environment variables
ENV NODE_ENV=production

# Start the bot
CMD ["npm", "run", "bot"]
