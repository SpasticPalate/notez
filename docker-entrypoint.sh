#!/bin/sh
set -e

echo "==================================="
echo "Notez - Starting initialization..."
echo "==================================="

# Run database migrations
echo "Running database migrations..."
cd /app/backend
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "✓ Database migrations completed successfully"
else
  echo "✗ Database migrations failed"
  exit 1
fi

# Start the application
echo "Starting Notez application..."
cd /app
exec "$@"
