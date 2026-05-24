# ─────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────
FROM node:20-alpine AS builder

# Install OpenSSL — required by Prisma's native query engine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy root package configuration
COPY package*.json ./
COPY tsconfig.json ./

# Copy backend configuration and source
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/prisma ./apps/backend/prisma

# Install all dependencies (including devDependencies for build)
RUN npm install

# Generate Prisma Client (must run before tsc)
RUN npm run db:generate

# Compile TypeScript → dist/
RUN npm run build --workspace=apps/backend

# ─────────────────────────────────────────
# Stage 2: Runner
# ─────────────────────────────────────────
FROM node:20-alpine AS runner

# Install OpenSSL — required by Prisma's native query engine at runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Copy root package configuration
COPY package*.json ./

# Copy backend package configuration
COPY apps/backend/package*.json ./apps/backend/

# Copy Prisma schema for client generation in runner
COPY apps/backend/prisma ./apps/backend/prisma

# Install production dependencies only
RUN npm install --omit=dev

# Re-generate Prisma Client against production node_modules
RUN npm run db:generate

# Copy compiled output from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

EXPOSE 3000

WORKDIR /app/apps/backend

CMD ["node", "dist/index.js"]