#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.cargo/bin:$PATH"
if [ -x "/usr/local/bin/fnm" ]; then
  eval "$(/usr/local/bin/fnm env --shell bash)"
fi

echo "========================================================"
echo "Launching PocketBridge with macOS Awake Management"
echo "   - Keeps your Mac awake while the lid is open"
echo "   - Naturally sleeps/hibernates when you close the lid"
echo "========================================================"

# caffeinate -i: prevents system idle sleep while script runs
exec caffeinate -i npx tsx src/server/index.ts
