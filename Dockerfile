# Based on https://docs.docker.com/guides/nodejs/containerize/
ARG NODE_VERSION=26.13.0-alpine
FROM node:${NODE_VERSION} AS base

# Set working directory
WORKDIR /app

# ========================================
# Dependencies Stage
# ========================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install production dependencies. --ignore-scripts: no dependency gets to run
# install-time code in the build (none of the production dependencies need it).
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# ========================================
# Build Dependencies Stage
# ========================================
FROM base AS build-deps

# Copy package files
COPY package*.json ./

# Install all dependencies with build optimizations. --ignore-scripts also skips
# dev-only postinstalls (e.g. electron's binary download) that the build never uses.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund --ignore-scripts && \
    npm cache clean --force

# ========================================
# Build Stage
# ========================================
FROM build-deps AS build

# Copy only necessary files for building (respects .dockerignore)
COPY . .

# Build the application
RUN npm run build

# ========================================
# Production Stage
# ========================================
ARG NODE_VERSION=26.13.0-alpine
FROM node:${NODE_VERSION} AS production

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# The runtime only needs node. Drop the package managers: they are never run,
# and their bundled dependencies are a steady source of image CVEs.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

# Set optimized environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=256 --no-warnings" \
    NPM_CONFIG_LOGLEVEL=silent

# Set locale environment variables
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=America/New_York

# Application code stays root-owned (read-only to the nodejs user), so a
# compromised process cannot rewrite its own code or dependencies.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=build /app/dist ./dist

# The one runtime write under /app: src/logger.js logs to dist/playball.log.
# Pre-create just that file for nodejs rather than opening the directory.
RUN touch dist/playball.log && chown nodejs:nodejs dist/playball.log

# Switch to non-root user for security
USER nodejs

CMD ["node", "dist/cli.js"]
