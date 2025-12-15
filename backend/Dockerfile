# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

# Install dependencies
RUN npm install

# Copy Prisma and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Build - show what we're building
RUN echo "=== Source files ===" && ls -la src/
RUN echo "=== Building NestJS ===" && npm run build 2>&1
RUN echo "=== Build output ===" && ls -la dist/ && ls -la dist/src/ 2>/dev/null || echo "No dist/src/"

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

# Copy package.json and install prod deps
COPY package.json ./
COPY prisma ./prisma/

# Install without postinstall to avoid prisma generate issues
RUN npm install --omit=dev --ignore-scripts
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Verify dist contents
RUN echo "=== Final dist ===" && ls -la dist/ && find dist -name "main.js" 2>/dev/null || echo "main.js not found"

EXPOSE 3000
ENV NODE_ENV=production

# Try to find and run main.js
CMD ["sh", "-c", "MAIN=$(find dist -name 'main.js' | head -1); if [ -n \"$MAIN\" ]; then echo \"Starting: $MAIN\" && node $MAIN; else echo 'ERROR: main.js not found' && find dist -type f && exit 1; fi"]
