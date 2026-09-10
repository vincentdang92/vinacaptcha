# ==========================================================
# Backend API Multi-Stage Dockerfile (NestJS + Fastify)
# ==========================================================

# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency definition files
COPY package*.json ./
RUN npm ci

# Copy source and config files
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Prune dev dependencies for lean production image
RUN npm prune --production

# ── Stage 2: Production Runner ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dumb-init to handle PID 1 & signal terminations cleanly
RUN apk add --no-cache dumb-init

# Use unprivileged node user for security
USER node

# Copy node_modules & dist from builder
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
