#!/bin/sh

# CableIndex Docker Startup Script
echo "🚀 Starting CableIndex..."

# Load .env file if it exists
if [ -f /app/.env ]; then
  set -a
  . /app/.env
  set +a
  echo "📋 Loaded configuration from /app/.env"
fi

# Set default values
export PORT=${PORT:-3000}
export NODE_ENV=${NODE_ENV:-production}
export DATABASE_PATH=${DATABASE_PATH:-/app/data/cableindex.db}
export UPLOADS_PATH=${UPLOADS_PATH:-/app/uploads}

# Create directories if they don't exist
mkdir -p "$(dirname "$DATABASE_PATH")" 2>/dev/null || true
mkdir -p "$UPLOADS_PATH" 2>/dev/null || true
mkdir -p /app/data 2>/dev/null || true

# Set JWT secret if not provided
if [ -z "$JWT_SECRET" ]; then
  export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "⚠️  Generated JWT_SECRET. For production, set a persistent JWT_SECRET environment variable."
fi

# Print configuration
echo "📋 Configuration:"
echo "   Port: $PORT"
echo "   Environment: $NODE_ENV"

# Log database configuration
if [ "$DB_TYPE" = "mysql" ] || [ -n "$MYSQL_HOST" ]; then
  echo "   Database Type: MySQL"
  echo "   MySQL Host: ${MYSQL_HOST:-localhost}"
  echo "   MySQL Port: ${MYSQL_PORT:-3306}"
  echo "   MySQL Database: ${MYSQL_DATABASE:-cableindex}"
  echo "   MySQL User: ${MYSQL_USER:-root}"
else
  echo "   Database Type: SQLite"
  echo "   Database: $DATABASE_PATH"
fi

echo "   Uploads: $UPLOADS_PATH"

# Start the backend server
echo "🔄 Starting backend server..."
cd /app/backend && node dist/app.js