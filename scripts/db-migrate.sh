#!/bin/bash
# Database migration script for Coolify deployment
# Run this after container starts to apply Drizzle migrations

set -e

echo "🔧 Applying database migrations..."

npm run db:migrate

echo "✅ Migrations completed successfully"
