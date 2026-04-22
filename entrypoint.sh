#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting ai-summary app..."
node /app/dist/main
