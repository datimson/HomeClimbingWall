@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0individual-to-atlas.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo individual-to-atlas failed with exit code %EXIT_CODE%.
  echo Common cause: texture-atlas.png is open in another app.
  pause
)
exit /b %EXIT_CODE%
