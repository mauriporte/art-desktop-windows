@echo off
rem Starts the A.R.T. notch detached from whatever launched it (run via explorer.exe)
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
