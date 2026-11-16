@echo off
setlocal
cd /d "%~dp0"
set "FORGESHARE_APP=%~f0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ForgeShare requires Node.js 20 or later. / ForgeShare kraever Node.js 20 eller nyere.
  echo https://nodejs.org/en/download
  pause
  exit /b 1
)
node "ForgeShare.mjs" --gui --library menu
if errorlevel 1 (
  echo ForgeShare stopped with an error. / ForgeShare blev stoppet med en fejl.
  pause
)
endlocal
