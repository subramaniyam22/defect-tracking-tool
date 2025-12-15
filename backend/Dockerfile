# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy ALL necessary files first
COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY prisma ./prisma/
COPY src ./src/

# Install all dependencies (including dev)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Debug: Show what we have
RUN echo "=== Source files ===" && find src -name "*.ts" | head -20

# Build the application
RUN npm run build && echo "Build completed"

# Debug: Show build output
RUN echo "=== Dist contents ===" && find dist -type f | head -20

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Copy package files AND prisma folder
COPY package.json ./
COPY prisma ./prisma/

# Install production dependencies
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Debug: Verify main.js exists
RUN ls -la dist/ && ls -la dist/src/ || echo "dist/src not found"

# Expose port
EXPOSE 3000

ENV NODE_ENV=production

# Start command - try both possible locations
CMD ["sh", "-c", "if [ -f dist/main.js ]; then node dist/main.js; elif [ -f dist/src/main.js ]; then node dist/src/main.js; else echo 'main.js not found' && ls -R dist/; fi"]
