# 1. Use a lightweight Node.js base image
FROM node:18-alpine

# 2. Set working directory
WORKDIR /app

# 3. Copy package files first for caching
COPY package*.json ./

# 4. Install dependencies
RUN npm install --production

# 5. Copy the worker code
COPY . .

# 6. Command to start the Redis worker
CMD ["node", "worker.js"]
