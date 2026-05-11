# STAGE 1: Dependencies Install
FROM node:18 AS dependencies

WORKDIR /app

# Pehle sirf package files copy karo (Code change hone par cache reuse hoga)
COPY package.json package-lock.json ./

# Sirf production dependencies install karo
RUN npm ci --only=production --legacy-peer-deps

# STAGE 2: Final Production Image
FROM node:18-alpine AS production

# Security: Root user mat use karo
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Dependencies pichle stage se copy karo
COPY --from=dependencies /app/node_modules ./node_modules

# Baaki code copy karo
COPY . .

# .env file ki zaroorat nahi - Jenkins environment variables dega
# Sirf required port expose karo
EXPOSE 8000

# appuser ke roop mein chalao
USER appuser

# Health check: Container theek chal raha hai ya nahi
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD wget -qO- http://localhost:8000/health || exit 1

# App start karo
CMD ["node", "index.js"]