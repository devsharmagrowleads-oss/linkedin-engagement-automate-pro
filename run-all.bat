@echo off
title Growleads - Run All Accounts
echo.
echo  Running sessions for all accounts...
echo  Each account runs one at a time.
echo.

cd /d "%~dp0"
node scripts/run-all.js

echo.
pause
