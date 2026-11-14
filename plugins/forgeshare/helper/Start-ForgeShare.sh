#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v zenity >/dev/null 2>&1; then
  printf '%s\n' 'Install Zenity using your software manager / Installer Zenity via din programbutik.'
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  zenity --info --title=ForgeShare --text='Install Node.js first / Installer først Node.js: https://nodejs.org/en/download'
else
  node ./ForgeShare.mjs --gui --library menu
fi
printf '%s\n' 'Press Enter to close / Tryk Enter for at lukke.'
read -r answer
