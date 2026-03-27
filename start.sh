#!/bin/bash
echo ""
echo "  Starting Growleads Dashboard..."
echo "  Press Ctrl+C to stop."
echo ""

cd "$(dirname "$0")"
node scripts/start-dashboard.js
