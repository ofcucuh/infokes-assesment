# Stage 1: Build the Vue 3 application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations
COPY package*.json ./
COPY tsconfig.json ./

# Copy frontend configurations and source
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/frontend/tsconfig.json ./apps/frontend/
COPY apps/frontend/vite.config.ts ./apps/frontend/
COPY apps/frontend/postcss.config.js ./apps/frontend/
COPY apps/frontend/tailwind.config.js ./apps/frontend/
COPY apps/frontend/index.html ./apps/frontend/
COPY apps/frontend/src ./apps/frontend/src

# Install dependencies and build
RUN npm install
RUN npm run build --workspace=apps/frontend

# Stage 2: Serve the compiled SPA via Nginx Alpine
FROM nginx:alpine

# Copy nginx server configuration
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output to Nginx HTML root directory
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
