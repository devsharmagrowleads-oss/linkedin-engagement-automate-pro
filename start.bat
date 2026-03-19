@echo off
title LinkedIn Auto-React Dashboard
echo.
echo  Starting LinkedIn Auto-React Dashboard...
echo  The dashboard will open in your browser automatically.
echo.
echo  Close this window to stop the dashboard.
echo.

cd /d "%~dp0"

REM Wait a moment then open browser
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

REM Start the dashboard server
node src/server/server.js
