# Multi-stage production Dockerfile for Typosaurus Enterprise Backend
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Copy server files
COPY server/package.json ./package.json
COPY server/src ./src

# Expose HTTP and WebSocket port
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start using Node 24 native TypeScript execution
CMD ["node", "--experimental-strip-types", "src/index.ts"]
