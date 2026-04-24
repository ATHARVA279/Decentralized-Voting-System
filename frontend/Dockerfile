# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build Angular application
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Cache npm install layer separately
COPY package.json package-lock.json* ./
RUN npm install --silent

# Copy source and build for production
COPY . .
RUN npm run build:prod

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Serve with NGINX
# ──────────────────────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built Angular app
COPY --from=builder /app/dist/voting-frontend/browser /usr/share/nginx/html

# Non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
