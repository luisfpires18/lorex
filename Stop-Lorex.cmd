@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-Lorex.ps1" %*
endlocal & exit /b %ERRORLEVEL%
