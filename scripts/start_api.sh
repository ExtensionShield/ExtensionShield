#!/bin/sh
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Activate virtual environment if it exists
if [ -f ".venv/bin/activate" ]; then
  . .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
  . venv/bin/activate
fi

echo "🚀 Starting ExtensionShield API..."

# Try to load .env file values for display (Python will load it properly)
if [ -f ".env" ]; then
  # Source .env to get values (but don't export, Python will load it)
  set -a
  . .env 2>/dev/null || true
  set +a
fi

echo "PORT: ${PORT:-8007}"
# Redact Supabase URL (project ref) in logs for security
if [ -n "${SUPABASE_URL:-}" ]; then
  echo "SUPABASE_URL: set (https://***.supabase.co)"
else
  echo "SUPABASE_URL: not set"
fi
echo "LLM_PROVIDER: ${LLM_PROVIDER:-ollama (from .env)}"
# Do not echo LLM_FALLBACK_CHAIN value (may contain provider names; avoid accidental leak)
if [ -n "${LLM_FALLBACK_CHAIN:-}" ]; then
  echo "LLM_FALLBACK_CHAIN: set"
else
  echo "LLM_FALLBACK_CHAIN: not set"
fi

has_supabase_db_connection() {
  supabase_host=""
  if [ -n "${SUPABASE_URL:-}" ]; then
    supabase_host="${SUPABASE_URL#https://}"
    supabase_host="${supabase_host#http://}"
    supabase_host="${supabase_host%%/*}"
  fi

  if [ -n "${DATABASE_URL:-}" ]; then
    case "${DATABASE_URL}" in
      *@${supabase_host}:*|*@${supabase_host}/*)
        return 1
        ;;
    esac
  fi

  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    case "${SUPABASE_DB_URL}" in
      *@${supabase_host}:*|*@${supabase_host}/*)
        return 1
        ;;
    esac
  fi

  if [ -n "${DATABASE_URL:-}" ] || [ -n "${SUPABASE_DB_URL:-}" ]; then
    return 0
  fi

  if [ -n "${supabase_host}" ] && [ "${PGHOST:-}" = "${supabase_host}" ]; then
    return 1
  fi

  if [ -n "${PGHOST:-}" ] && [ -n "${PGPORT:-}" ] && [ -n "${PGDATABASE:-}" ] && [ -n "${PGUSER:-}" ] && [ -n "${PGPASSWORD:-}" ]; then
    return 0
  fi

  return 1
}

# SQLite (the OSS default) creates its schema automatically — no migration step.
# Supabase migrations are a Cloud-only feature and are NOT bundled in the OSS
# distribution; manage the Supabase schema out-of-band (e.g. the Supabase CLI).
if [ -n "${DB_BACKEND:-}" ] && [ "${DB_BACKEND:-}" != "supabase" ]; then
  echo "⏭️  Skipping migrations: DB_BACKEND=${DB_BACKEND} (SQLite manages its own schema)"
else
  echo "⏭️  Skipping Supabase migrations: not bundled in the OSS build (manage the Supabase schema via the Supabase CLI)"
fi

echo "✅ Starting uvicorn server on port ${PORT:-8007}..."
exec uvicorn extension_shield.api.main:app --host 0.0.0.0 --port "${PORT:-8007}" --forwarded-allow-ips="*"
