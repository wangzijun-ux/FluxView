@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "APP_DIR=%ROOT_DIR%UI Design from PRD"

if not exist "%APP_DIR%\package.json" (
  echo [ERROR] package.json not found: "%APP_DIR%"
  pause
  exit /b 1
)

cd /d "%APP_DIR%"

echo Starting FluxView dev server...
echo App directory: %APP_DIR%
echo URL: http://127.0.0.1:5173/
echo.

npm run dev -- --host 127.0.0.1

endlocal
