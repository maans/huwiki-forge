#!/bin/sh
cd "$(dirname "$0")" || exit 1
case "${LANGUAGE:-${LC_ALL:-${LC_MESSAGES:-${LANG:-en}}}}" in
  da*) export FORGESHARE_LANGUAGE=da; missing_zenity='Installer Zenity via din programbutik.'; missing_node='Installer først Node.js: https://nodejs.org/en/download' ;;
  *) export FORGESHARE_LANGUAGE=en; missing_zenity='Install Zenity using your software manager.'; missing_node='Install Node.js first: https://nodejs.org/en/download' ;;
esac
if ! command -v zenity >/dev/null 2>&1; then
  printf '%s\n' "$missing_zenity"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  zenity --info --title=ForgeShare --text="$missing_node"
else
  node ./ForgeShare.mjs --gui --library menu
fi
