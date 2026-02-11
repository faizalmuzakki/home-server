FROM node:22-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3 and wget for healthcheck
RUN apk add --no-cache python3 make g++ wget

COPY package*.json ./
RUN npm install

COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
