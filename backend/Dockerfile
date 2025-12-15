# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package files AND prisma FIRST (before npm install, needed for postinstall)
COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY prisma ./prisma/

# Install dependencies (postinstall will run prisma generate)
RUN npm install

# Copy source code AFTER npm install
COPY src ./src/

# Build NestJS
RUN echo "=== Building ===" && npm run build 2>&1

# Show build output
RUN echo "=== Dist contents ===" && find dist -type f | head -30

# Production stage  
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

# Copy package.json and prisma first
COPY package.json ./
COPY prisma ./prisma/

# Install prod deps (postinstall will run prisma generate)
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Show what we have
RUN echo "=== Final dist ===" && find dist -name "*.js" | head -20

EXPOSE 3000
ENV NODE_ENV=production

# Start the app
CMD ["node", "dist/main.js"]
