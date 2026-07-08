# ExtensionShield Dockerfile
# Multi-stage build: Node.js for frontend, Python for backend

# =============================================================================
# Stage 1: Build React Frontend
# =============================================================================
FROM node:20-alpine AS frontend-builder

# Accept build arguments for Vite environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE_URL
ARG VITE_AUTH_ENABLED

WORKDIR /app/frontend

# Install build dependencies for node-gyp and native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY frontend/package*.json ./

# Install dependencies with increased memory for production builds
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Try npm ci first (faster, more reliable), fallback to npm install if lock file is out of sync
RUN npm ci || (echo "npm ci failed, regenerating lock file..." && npm install --package-lock-only && npm ci)

# Copy frontend source
COPY frontend/ ./

# Set Vite environment variables for build
# Use default empty values if not provided (Railway should pass these as build args)
# VITE_API_URL is used by frontend (constants.js, services); VITE_API_BASE_URL is alias
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL:-}
ENV VITE_API_URL=${VITE_API_BASE_URL:-}
ENV VITE_AUTH_ENABLED=${VITE_AUTH_ENABLED:-true}

# Do not echo build-arg values (they may contain URLs/keys). Log only set/unset.
RUN if [ -n "$VITE_SUPABASE_URL" ]; then echo "VITE_SUPABASE_URL=set"; else echo "VITE_SUPABASE_URL=unset"; fi

# Build production bundle
RUN npm run build

# =============================================================================
# Stage 2: Python Backend with Frontend Static Files
# =============================================================================
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

# Install system dependencies
# - git: required by some Python packages and semgrep
# - curl: for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files and README (required by pyproject.toml)
COPY pyproject.toml uv.lock README.md ./

# Copy application source code (needed for package build)
COPY src/ ./src/
COPY scripts/ ./scripts/

# docs/ is gitignored so not in build context; create empty dir (code only references it in error messages)
RUN mkdir -p docs

# Install Python dependencies and build the project
RUN uv sync --frozen --no-dev

# Prefer running the installed venv entrypoints directly (faster startup than `uv run`)
ENV PATH="/app/.venv/bin:$PATH"

# Copy frontend build from stage 1
COPY --from=frontend-builder /app/frontend/dist ./static

# Create necessary directories and non-root user
RUN mkdir -p extensions_storage data && \
    addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser && \
    chown -R appuser:appgroup /app

# Drop root privileges
USER appuser

# Set default environment variables
ENV EXTENSION_STORAGE_PATH=/app/extensions_storage \
    DATABASE_PATH=/app/data/extension-shield.db \
    LLM_PROVIDER=openai

# Default port (Railway will override with PORT env var)
ENV PORT=8007

# Expose the API port
EXPOSE 8007

# Health check - uses PORT env var that Railway injects
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:${PORT:-8007}/health || exit 1

# Run the application with migrations (Supabase only)
CMD ["sh", "/app/scripts/start_api.sh"]
