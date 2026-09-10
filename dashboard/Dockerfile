# ==========================================================
# Admin Dashboard Multi-Stage Dockerfile (React 19 + Vite)
# ==========================================================

# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL="/admin/v1"
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Production Nginx Server ──
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
