#!/bin/sh
# Entrypoint script to handle volume permissions before starting app

echo "🔧 Fixing volume permissions..."

# Fix ownership and permissions for mounted volumes
# This runs as root and ensures the wireindex user can write to these directories
chown -R wireindex:nodejs /app/data 2>/dev/null || chmod -R 777 /app/data 2>/dev/null || echo "⚠️  Could not fix /app/data permissions"
chown -R wireindex:nodejs /app/uploads 2>/dev/null || chmod -R 777 /app/uploads 2>/dev/null || echo "⚠️  Could not fix /app/uploads permissions"
chown wireindex:nodejs /app/.env 2>/dev/null || chmod 666 /app/.env 2>/dev/null || echo "⚠️  Could not fix /app/.env permissions"

# Verify directories are writable
if [ -w /app/data ]; then
  echo "✅ /app/data is writable"
else
  echo "⚠️  Warning: /app/data may not be writable"
fi

# Switch to wireindex user and execute the command
echo "🔄 Starting as wireindex user..."
exec su-exec wireindex "$@"
