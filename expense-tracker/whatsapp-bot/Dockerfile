FROM node:22-alpine

WORKDIR /app

# Install git (required by some npm packages)
RUN apk add --no-cache git

COPY package*.json ./
RUN npm install

COPY . .

# Create auth directory for session persistence
RUN mkdir -p /app/auth_info

CMD ["npm", "start"]
