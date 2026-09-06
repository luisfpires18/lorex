@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Lorex.ps1" %*
set "LOREX_EXIT=%ERRORLEVEL%"
if not "%LOREX_EXIT%"=="0" (
  echo.
  echo Lorex failed to start. See .lorex\logs for details.
  pause
)
endlocal & exit /b %LOREX_EXIT%
