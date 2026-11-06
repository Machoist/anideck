@echo off
setlocal
if not exist "%~dp0package.json" (
  echo This launcher must stay inside the AniDeck project folder.
  echo Open the AniDeck Development desktop shortcut instead of downloading this file.
  pause
  exit /b 1
)
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo AniDeck's development runtime is missing. Run npm ci in this folder first.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE="
start "AniDeck Development" /D "%~dp0" "%~dp0node_modules\electron\dist\electron.exe" .
