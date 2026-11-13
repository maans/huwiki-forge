#!/bin/sh
# Only launch the adjacent reviewed script. Never download or evaluate remote code.
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  /usr/bin/osascript -e 'display dialog "Install Node.js first / Installer først Node.js:\nhttps://nodejs.org/en/download" with title "ForgeShare" buttons {"OK"}'
else
  node ./ForgeShare.mjs --gui
fi
printf '%s\n' 'Press Enter to close / Tryk Enter for at lukke.'
read -r answer
