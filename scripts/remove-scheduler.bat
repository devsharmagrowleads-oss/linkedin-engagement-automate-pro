@echo off
echo Removing LinkedIn Auto-React scheduled tasks...

schtasks /delete /tn "LinkedInAutoReact_Morning" /f 2>nul
schtasks /delete /tn "LinkedInAutoReact_Afternoon" /f 2>nul
schtasks /delete /tn "LinkedInAutoReact_Evening" /f 2>nul

echo Done. All scheduled tasks removed.
pause
