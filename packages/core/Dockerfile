# Use official Node.js image
FROM node:18-alpine

# Install Playwright dependencies and native build libraries for canvas/opencv
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++ \
    gcc \
    pixman-dev \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    libpng-dev \
    cmake \
    libc6-compat

# Set Playwright to use installed Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create directories for tests and reports
RUN mkdir -p /app/tests /app/reports

# Run as non-root user
RUN addgroup -g 1001 -S autoqa && \
    adduser -S autoqa -u 1001 && \
    chown -R autoqa:autoqa /app

USER autoqa

# Default command
CMD ["node", "dist/index.js"]
