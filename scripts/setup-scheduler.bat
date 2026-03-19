@echo off
echo ========================================
echo  LinkedIn Auto-React - Scheduler Setup
echo ========================================
echo.

REM Get the project directory (parent of scripts folder)
set "PROJECT_DIR=%~dp0.."
set "NODE_PATH=node"
set "SCRIPT_PATH=%PROJECT_DIR%\src\index.js"

echo Project directory: %PROJECT_DIR%
echo Script path: %SCRIPT_PATH%
echo.

REM Delete existing tasks if they exist
schtasks /delete /tn "LinkedInAutoReact_Morning" /f >nul 2>&1
schtasks /delete /tn "LinkedInAutoReact_Afternoon" /f >nul 2>&1
schtasks /delete /tn "LinkedInAutoReact_Evening" /f >nul 2>&1

echo Creating scheduled tasks...
echo.

REM Morning session (9:00 AM)
schtasks /create /tn "LinkedInAutoReact_Morning" /tr "cmd /c cd /d \"%PROJECT_DIR%\" && %NODE_PATH% \"%SCRIPT_PATH%\"" /sc daily /st 09:00
echo.

REM Afternoon session (13:00 / 1:00 PM)
schtasks /create /tn "LinkedInAutoReact_Afternoon" /tr "cmd /c cd /d \"%PROJECT_DIR%\" && %NODE_PATH% \"%SCRIPT_PATH%\"" /sc daily /st 13:00
echo.

REM Evening session (18:00 / 6:00 PM)
schtasks /create /tn "LinkedInAutoReact_Evening" /tr "cmd /c cd /d \"%PROJECT_DIR%\" && %NODE_PATH% \"%SCRIPT_PATH%\"" /sc daily /st 18:00
echo.

echo ========================================
echo  Setup complete! 3 daily tasks created:
echo    - Morning:   09:00 AM
echo    - Afternoon: 01:00 PM
echo    - Evening:   06:00 PM
echo.
echo  Note: Each session adds random jitter
echo  (0-30 min) before starting.
echo.
echo  To remove tasks, run:
echo    scripts\remove-scheduler.bat
echo ========================================

pause
