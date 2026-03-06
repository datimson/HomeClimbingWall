@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atlas-to-individual.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo atlas-to-individual failed with exit code %EXIT_CODE%.
  echo Common cause: the atlas or output texture files are open in another app.
  pause
)
exit /b %EXIT_CODE%
