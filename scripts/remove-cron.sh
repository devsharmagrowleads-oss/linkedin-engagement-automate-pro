#!/bin/bash
echo "Removing LinkedIn Auto-React cron jobs..."

crontab -l 2>/dev/null | grep -v "LinkedInAutoReact" | crontab -

echo "Done. All LinkedIn Auto-React scheduled tasks removed."
