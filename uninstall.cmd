@echo off
rem Removes A.R.T. Desktop from the Startup folder, closes it and brings the Windows taskbar back.
rem Your settings in %USERPROFILE%\.config\art-desktop stay; delete that folder too if you want them gone.
cd /d "%~dp0"
call "%~dp0install-startup.cmd" remove
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? CommandLine -match [regex]::Escape('%~dp0') | %% { Stop-Process -Id $_.ProcessId -Force }"
powershell -NoProfile -File "%~dp0electron\taskbar.ps1" Show >nul
echo A.R.T. Desktop removed from startup and closed. Delete this folder to remove it completely.
pause
