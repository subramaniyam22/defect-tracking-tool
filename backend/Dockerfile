# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package files AND prisma folder FIRST (before npm install)
COPY package.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Copy package files AND prisma folder FIRST (needed for postinstall script)
COPY package.json ./
COPY prisma ./prisma/

# Install production dependencies (postinstall will run prisma generate)
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Run migrations and start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
