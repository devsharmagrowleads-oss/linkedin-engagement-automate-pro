@echo off
title Growleads Dashboard
echo.
echo  Starting Growleads Dashboard...
echo  Close this window to stop the dashboard.
echo.

cd /d "%~dp0"

REM Use Node to find the right port and start the server
node -e "const p=process.env.PORT||require('./src/config').port||3000;console.log('PORT='+p)" 2>nul
node scripts/start-dashboard.js
pause
