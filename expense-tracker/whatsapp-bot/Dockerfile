FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Create auth directory for session persistence
RUN mkdir -p /app/auth_info

CMD ["npm", "start"]
