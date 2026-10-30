FROM node:24-slim

# ca-certificates and curl are required for the host-mounted `agy` ELF binary
# (Go TLS reads /etc/ssl/certs/ca-certificates.crt) and web browsing / fetch tools.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Claude Code CLI globally. The ADD busts the layer cache whenever npm
# publishes a new CLI — otherwise a rebuild reuses the old one, and with it the
# old model behind the `sonnet` alias palu-gada-bot asks for.
ADD https://registry.npmjs.org/@anthropic-ai/claude-code/latest /tmp/claude-code-latest.json
RUN npm install -g @anthropic-ai/claude-code \
    && rm -f /tmp/claude-code-latest.json

COPY package*.json ./
RUN npm install

COPY . .

# Run as uid/gid 1000 (`node` in node:24-slim) to match `solork` on home-server
# so OAuth token refreshes written into bind-mounted ~/.claude and
# ~/.gemini/antigravity-cli stay owned by 1000:1000 instead of root.
RUN mkdir -p /workspace /home/claude/.gemini \
    && chown -R 1000:1000 /app /workspace /home/claude

USER 1000:1000

EXPOSE 3100

CMD ["node", "src/index.js"]
