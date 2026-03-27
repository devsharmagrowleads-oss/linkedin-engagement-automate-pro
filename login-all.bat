@echo off
title Growleads - Login All Accounts
echo.
echo  Logging into LinkedIn for all accounts...
echo  Already logged-in accounts will be skipped.
echo.

cd /d "%~dp0"
node scripts/login-all.js

echo.
pause
