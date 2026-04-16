FROM node:22-alpine

WORKDIR /app

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

COPY package*.json ./
RUN npm install

COPY . .

# Create workspace directory for Claude Code operations
RUN mkdir -p /workspace

EXPOSE 3100

CMD ["npm", "start"]
