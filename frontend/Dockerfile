# Frontend Dockerfile - React (Multi-stage build)

# Stage 1: Build - Using Node 20 for react-router-dom compatibility
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json first
COPY package.json ./

# Install dependencies
RUN yarn install --no-immutable --network-timeout 100000

# Copy source code
COPY . .

# Build argument for API URL
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Build the application
RUN yarn build

# Stage 2: Production with Nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
