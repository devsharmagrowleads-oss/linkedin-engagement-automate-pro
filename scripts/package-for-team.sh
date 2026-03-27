#!/bin/bash
# Creates a clean ZIP for team members (excludes admin, sensitive files, etc.)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="$PROJECT_DIR/growleads-team.zip"

cd "$PROJECT_DIR"

# Remove old package if exists
rm -f "$OUTPUT"

# Create zip excluding admin, sensitive, and unnecessary files
zip -r "$OUTPUT" \
  .env.example \
  .gitignore \
  package.json \
  package-lock.json \
  favicon.png \
  start.bat \
  start.sh \
  TEAM-SETUP.md \
  config/ \
  scripts/setup-cron.sh \
  scripts/setup-scheduler.bat \
  src/ \
  -x "src/debug*" "src/diagnose*" "src/verify*"

echo ""
echo "=== Team package created ==="
echo "File: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
echo ""
echo "Share this ZIP with your team members."
echo "They should follow TEAM-SETUP.md inside the ZIP."
