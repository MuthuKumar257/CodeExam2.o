# ==============================================================================
# CodeExam Production Dockerfile
# Multi-Language Compiler & Assessment Execution Environment
# Supported Toolchains: C, C++, Java, Python 3, Node.js, TypeScript, Go, Rust
# ==============================================================================

FROM node:22-bookworm-slim

# Avoid interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install all compiler and runtime toolchains
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    openjdk-17-jdk-headless \
    python3 \
    python3-pip \
    golang-go \
    rustc \
    ca-certificates \
    curl \
    git \
    procps \
    && npm install -g typescript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set standard environment variables
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="/usr/lib/jvm/java-17-openjdk-amd64/bin:${PATH}"
ENV NODE_ENV=production
ENV PORT=3000

# Set working directory
WORKDIR /app

# Copy dependency manifests first for optimal Docker layer caching
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install backend dependencies
RUN npm --prefix backend install --omit=dev

# Copy all application code
COPY . .

# Ensure non-root executable permissions on working directory
RUN chmod -R 755 /app

# Expose backend port
EXPOSE 3000

# Health check using compiler and database audit endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Start CodeExam backend server
CMD ["node", "backend/server.js"]

