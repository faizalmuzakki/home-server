FROM node:20-slim

# Install ffmpeg, docker CLI, git, and other dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    build-essential \
    git \
    curl \
    ca-certificates \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Install dependencies with network resilience
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --only=production

# Copy source code
COPY . .

# Create non-root user for security
# uid 1000 matches the host owner of the bind-mounted ./data and /host-repo;
# node:20-slim already holds 1000 for its `node` user, so drop that one first.
# Add to docker group (GID 999 typically, will be overridden by socket's group at runtime)
RUN groupadd -g 999 docker || true && \
    userdel -r node 2>/dev/null || true && \
    useradd -u 1000 -m -s /bin/bash botuser && \
    usermod -aG docker botuser && \
    mkdir -p /app/data && \
    chown -R botuser:botuser /app

USER botuser

# Start the bot
CMD ["node", "src/index.js"]
