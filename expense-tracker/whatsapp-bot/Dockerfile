FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Create auth directory for session persistence
RUN mkdir -p /app/auth_info

CMD ["npm", "start"]
