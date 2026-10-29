@echo off
rem Adds (or with "remove", deletes) the A.R.T. Desktop shortcut in the Windows Startup folder.
rem Run it from Explorer: started from the Claude app, AppData writes land in a sandbox instead of the real folder.
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\A.R.T. Desktop.lnk"
if /i "%~1"=="remove" (del "%LNK%" 2>nul & exit /b)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath='%~dp0node_modules\electron\dist\electron.exe'; $s.Arguments='\"%~dp0.\"'; $s.WorkingDirectory='%~dp0'; $s.Description='A.R.T. Desktop (notch, panel, docks)'; $s.Save()"
