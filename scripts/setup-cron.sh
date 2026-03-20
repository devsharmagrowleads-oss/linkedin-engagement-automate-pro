#!/bin/bash
echo "========================================"
echo " LinkedIn Auto-React - Cron Setup"
echo "========================================"
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(which node)"

if [ -z "$NODE_PATH" ]; then
  echo "ERROR: Node.js not found. Install it first."
  exit 1
fi

echo "Project directory: $PROJECT_DIR"
echo "Node.js path: $NODE_PATH"
echo ""

# Remove existing entries first
crontab -l 2>/dev/null | grep -v "LinkedInAutoReact" > /tmp/cron_clean

# Add new entries
cat >> /tmp/cron_clean << EOF
# LinkedInAutoReact - Morning session (9:00 AM)
0 9 * * * cd "$PROJECT_DIR" && $NODE_PATH src/index.js >> "$PROJECT_DIR/data/cron.log" 2>&1 # LinkedInAutoReact
# LinkedInAutoReact - Afternoon session (1:00 PM)
0 13 * * * cd "$PROJECT_DIR" && $NODE_PATH src/index.js >> "$PROJECT_DIR/data/cron.log" 2>&1 # LinkedInAutoReact
# LinkedInAutoReact - Evening session (6:00 PM)
0 18 * * * cd "$PROJECT_DIR" && $NODE_PATH src/index.js >> "$PROJECT_DIR/data/cron.log" 2>&1 # LinkedInAutoReact
EOF

crontab /tmp/cron_clean
rm /tmp/cron_clean

echo "========================================"
echo " Setup complete! 3 daily tasks created:"
echo "   - Morning:   09:00 AM"
echo "   - Afternoon: 01:00 PM"
echo "   - Evening:   06:00 PM"
echo ""
echo " Each session adds random jitter"
echo " (0-10 min) before starting."
echo ""
echo " To remove tasks, run:"
echo "   ./scripts/remove-cron.sh"
echo "========================================"
