#!/bin/bash
echo ""
echo "  Starting LinkedIn Auto-React Dashboard..."
echo "  Open http://localhost:3000 in your browser."
echo ""
echo "  Press Ctrl+C to stop."
echo ""

cd "$(dirname "$0")"

# Open browser after 2 seconds (background)
(sleep 2 && open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) &

# Start the dashboard server
node src/server/server.js
