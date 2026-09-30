FROM node:22-alpine

WORKDIR /app

# Install Claude Code CLI globally. The ADD busts the layer cache whenever npm
# publishes a new CLI — otherwise a rebuild reuses the old one, and with it the
# old model behind the `sonnet` alias palu-gada-bot asks for.
ADD https://registry.npmjs.org/@anthropic-ai/claude-code/latest /tmp/claude-code-latest.json
RUN npm install -g @anthropic-ai/claude-code

COPY package*.json ./
RUN npm install

COPY . .

# Create workspace directory for Claude Code operations
RUN mkdir -p /workspace

EXPOSE 3100

CMD ["node", "src/index.js"]
