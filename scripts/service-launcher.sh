#!/usr/bin/env bash
set -e

# Load macOS environment & fnm/nvm/homebrew node if present
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.cargo/bin:$PATH"

if [ -x "/usr/local/bin/fnm" ]; then
  eval "$(/usr/local/bin/fnm env --shell bash)"
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

mkdir -p "$HOME/Library/Logs"

echo "[$(date)] Starting PocketBridge Service..." >> "$HOME/Library/Logs/pocketbridge-service.log"

# Start Cloudflare tunnel in background with auto-reconnect
npx tsx scripts/tunnel.ts >> "$HOME/Library/Logs/pocketbridge-tunnel.log" 2>&1 &
TUNNEL_PID=$!

# Trap signals for graceful shutdown
cleanup() {
  echo "[$(date)] Stopping PocketBridge Service (PID $$)..." >> "$HOME/Library/Logs/pocketbridge-service.log"
  kill -TERM "$TUNNEL_PID" 2>/dev/null || true
  kill -TERM "$SERVER_PID" 2>/dev/null || true
  pkill -P $$ 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM SIGHUP

# Run server with caffeinate -ims (prevents system sleep, disk sleep, and idle sleep)
caffeinate -ims npx tsx src/server/index.ts >> "$HOME/Library/Logs/pocketbridge-service.log" 2>&1 &
SERVER_PID=$!

wait "$SERVER_PID"
