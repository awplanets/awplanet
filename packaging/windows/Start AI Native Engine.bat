@echo off
setlocal
cd /d "%~dp0"

echo Starting AI Native Engine...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-server.ps1"

echo.
echo Server stopped. You can close this window.
pause
