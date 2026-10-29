@echo off
rem A.R.T. Desktop for Windows: installs the packages, builds the app, adds it to the Startup folder and starts it.
rem Run it from Explorer (double-click). Needs Node.js 20 or newer. Run it again any time to update after a git pull.
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org or with:
  echo   winget install OpenJS.NodeJS.LTS
  echo then run install.cmd again.
  pause & exit /b 1
)
echo Installing packages...
call npm install --no-fund --no-audit || (echo npm install failed. & pause & exit /b 1)
rem newer npm versions skip install scripts: fetch Electron's runtime if that happened
if not exist "node_modules\electron\dist\electron.exe" node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" (echo Electron could not be downloaded. & pause & exit /b 1)
echo Building...
call npm run build || (echo Build failed. & pause & exit /b 1)
rem settings: an example house file on first install (the Home Assistant token goes in ha.json, which you create)
set "CFG=%USERPROFILE%\.config\art-desktop"
if not exist "%CFG%" mkdir "%CFG%"
if not exist "%CFG%\house.json" copy /y "config\house.example.json" "%CFG%\house.json" >nul
call "%~dp0install-startup.cmd"
echo.
echo Done. A.R.T. Desktop starts with Windows.
echo Settings: %CFG%\house.json  (Home Assistant: %CFG%\ha.json, see README)
rem "install.cmd nostart" leaves starting to the caller (a setup that adds its own settings first)
if /i not "%~1"=="nostart" start "" "%~dp0start-notch.cmd"
