@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show('Install Node.js first / Installer Node.js: https://nodejs.org/en/download','ForgeShare')"
) else (
  node "%~dp0ForgeShare.mjs" --gui
)
pause
