# Builder stage
FROM node:20-alpine AS build-stage

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and build application
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install PostgreSQL client for health checks
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application and Prisma client from builder
COPY --from=build-stage /app/dist ./dist
COPY --from=build-stage /app/node_modules/.prisma ./node_modules/.prisma

# Expose port and define runtime command
EXPOSE 3004
CMD ["node", "dist/main.js"]
