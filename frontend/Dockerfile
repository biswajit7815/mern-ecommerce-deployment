# STAGE 1: React App Build Karo
FROM node:18 AS builder

WORKDIR /app

# Package files pehle copy karo (cache optimization)
COPY package.json package-lock.json ./

# Saari dependencies install karo (dev bhi, build ke liye zaroori)
RUN npm ci --legacy-peer-deps

# Source code copy karo
COPY . .

# Build time environment variable (Jenkins pipeline mein EC2 IP se override hoga)
ARG REACT_APP_BASE_URL
ENV REACT_APP_BASE_URL=$REACT_APP_BASE_URL

# Production build banao (Output: /app/build/)
RUN npm run build

# STAGE 2: Nginx se Serve Karo
FROM nginx:1.25-alpine AS production

# Security: Default nginx user theek hai alpine mein

# Custom nginx config copy karo
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# React build files copy karo
COPY --from=builder /app/build /usr/share/nginx/html

# Port 80 expose karo
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget -qO- http://localhost/health || exit 1

# Nginx foreground mein chalao (daemon off - Docker ke liye zaroori)
CMD ["nginx", "-g", "daemon off;"]
