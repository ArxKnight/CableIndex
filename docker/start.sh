#!/bin/sh

# Cable Manager Docker Startup Script
echo "🚀 Starting Cable Manager..."

# Set default values
export PORT=${PORT:-3000}
export NODE_ENV=${NODE_ENV:-production}
export DATABASE_PATH=${DATABASE_PATH:-/app/data/cable-manager.db}
export UPLOADS_PATH=${UPLOADS_PATH:-/app/uploads}

# Create directories if they don't exist
mkdir -p "$(dirname "$DATABASE_PATH")"
mkdir -p "$UPLOADS_PATH"

# Set JWT secret if not provided
if [ -z "$JWT_SECRET" ]; then
  export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "⚠️  Generated JWT_SECRET. For production, set a persistent JWT_SECRET environment variable."
fi

# Print configuration
echo "📋 Configuration:"
echo "   Port: $PORT"
echo "   Environment: $NODE_ENV"
echo "   Database: $DATABASE_PATH"
echo "   Uploads: $UPLOADS_PATH"

# Start the backend server
echo "🔄 Starting backend server..."
cd /app/backend && node dist/app.js