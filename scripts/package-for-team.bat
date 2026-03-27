@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  Packaging Growleads for Team Distribution
echo ========================================
echo.

cd /d "%~dp0.."

REM Remove old package if exists
if exist "growleads-team.zip" del "growleads-team.zip"

REM Check if PowerShell is available (Windows 10+ always has it)
where powershell >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell not found. Please install PowerShell or use 7-Zip manually.
    pause
    exit /b 1
)

REM Create a temporary staging folder
set "STAGE=%TEMP%\growleads-package-%RANDOM%"
mkdir "%STAGE%\growleads" 2>nul

echo Copying files...

REM Copy root files
copy ".env.example" "%STAGE%\growleads\" >nul
copy ".gitignore" "%STAGE%\growleads\" >nul
copy "package.json" "%STAGE%\growleads\" >nul
if exist "package-lock.json" copy "package-lock.json" "%STAGE%\growleads\" >nul
copy "start.bat" "%STAGE%\growleads\" >nul
copy "start.sh" "%STAGE%\growleads\" >nul
copy "TEAM-SETUP.md" "%STAGE%\growleads\" >nul
if exist ".nvmrc" copy ".nvmrc" "%STAGE%\growleads\" >nul

REM Copy config folder
xcopy "config" "%STAGE%\growleads\config\" /E /I /Q >nul

REM Copy scripts (only the ones team members need)
mkdir "%STAGE%\growleads\scripts" 2>nul
copy "scripts\setup.js" "%STAGE%\growleads\scripts\" >nul
if exist "scripts\setup-scheduler.bat" copy "scripts\setup-scheduler.bat" "%STAGE%\growleads\scripts\" >nul
if exist "scripts\remove-scheduler.bat" copy "scripts\remove-scheduler.bat" "%STAGE%\growleads\scripts\" >nul
if exist "scripts\setup-cron.sh" copy "scripts\setup-cron.sh" "%STAGE%\growleads\scripts\" >nul
if exist "scripts\remove-cron.sh" copy "scripts\remove-cron.sh" "%STAGE%\growleads\scripts\" >nul

REM Copy src folder (excluding debug/diagnose/verify files)
xcopy "src" "%STAGE%\growleads\src\" /E /I /Q >nul
for %%f in ("%STAGE%\growleads\src\debug*" "%STAGE%\growleads\src\diagnose*" "%STAGE%\growleads\src\verify*") do (
    if exist "%%f" del "%%f"
)

REM Copy docs
if exist "docs" xcopy "docs" "%STAGE%\growleads\docs\" /E /I /Q >nul

echo Creating ZIP...

REM Use PowerShell to create the ZIP
powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%\growleads' -DestinationPath '%CD%\growleads-team.zip' -Force"

REM Clean up staging folder
rmdir /s /q "%STAGE%" 2>nul

if exist "growleads-team.zip" (
    echo.
    echo ========================================
    echo  Package created: growleads-team.zip
    echo.
    echo  Share this ZIP with your team members.
    echo  They should follow TEAM-SETUP.md inside.
    echo ========================================
) else (
    echo.
    echo ERROR: Failed to create ZIP.
    echo Try installing 7-Zip and packaging manually.
)

echo.
pause
