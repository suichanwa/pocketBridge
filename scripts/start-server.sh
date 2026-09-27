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
echo "   - Prevents system, disk, and idle sleep"
echo "========================================================"

# caffeinate -ims: prevents system sleep, disk sleep, and idle sleep while running
exec caffeinate -ims npx tsx src/server/index.ts
