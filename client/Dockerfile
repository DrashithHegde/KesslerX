FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

EXPOSE 5173

# Start the Vite development server and expose on all interfaces
CMD ["npm", "run", "dev", "--", "--host"]
