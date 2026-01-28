#!/bin/sh
# Entrypoint script to handle volume permissions before starting app

echo "🔧 Fixing volume permissions..."

# Fix ownership and permissions for mounted volumes
# This runs as root and ensures the cableindex user can write to these directories
chown -R cableindex:nodejs /app/data 2>/dev/null || chmod -R 777 /app/data 2>/dev/null || echo "⚠️  Could not fix /app/data permissions"
chown -R cableindex:nodejs /app/uploads 2>/dev/null || chmod -R 777 /app/uploads 2>/dev/null || echo "⚠️  Could not fix /app/uploads permissions"
chown cableindex:nodejs /app/.env 2>/dev/null || chmod 666 /app/.env 2>/dev/null || echo "⚠️  Could not fix /app/.env permissions"

# Verify directories are writable
if [ -w /app/data ]; then
  echo "✅ /app/data is writable"
else
  echo "⚠️  Warning: /app/data may not be writable"
fi

# Switch to cableindex user and execute the command
echo "🔄 Starting as cableindex user..."
exec su-exec cableindex "$@"
