#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.pocketbridge.daemon.plist"
SERVICE_LOG="$HOME/Library/Logs/pocketbridge-service.log"
TUNNEL_LOG="$HOME/Library/Logs/pocketbridge-tunnel.log"

# Zero emojis in output - clean, robust formatting
get_local_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1"
}

get_tailscale_ip() {
  if command -v tailscale >/dev/null 2>&1; then
    tailscale ip -4 2>/dev/null || true
  fi
}

is_running() {
  lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1
}

start_service() {
  if is_running; then
    echo "PocketBridge is already running in the background."
  else
    echo "Starting PocketBridge background service via macOS LaunchAgent..."
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

    # Ensure plist is up-to-date
    cp "$DIR/scripts/com.pocketbridge.daemon.plist" "$PLIST" 2>/dev/null || true

    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load -w "$PLIST"

    # Wait for server to respond (up to 5 seconds)
    local waited=0
    while ! is_running && [ "$waited" -lt 5 ]; do
      sleep 1
      waited=$((waited + 1))
    done

    if is_running; then
      echo "PocketBridge successfully started in the background."
    else
      echo "Service launched. Waiting for port 3000..."
    fi
  fi

  local_ip=$(get_local_ip)
  ts_ip=$(get_tailscale_ip)
  host_name=$(hostname -s)

  echo ""
  echo "Access URLs:"
  echo "  - Local Wi-Fi:      http://${local_ip}:3000"
  if [ -n "$ts_ip" ]; then
    echo "  - Tailscale Remote: http://${ts_ip}:3000"
  fi
  echo "  - Bonjour / mDNS:   http://${host_name}.local:3000"
  echo ""
  echo "Useful commands:"
  echo "  pb status     Check live metrics & connection status"
  echo "  pb logs       Stream live service logs"
  echo "  pb stop       Stop the background service"
  echo "  pb restart    Restart the background service"
  echo "  pb open       Open web app in browser"
}

stop_service() {
  echo "Stopping PocketBridge background service..."
  launchctl unload "$PLIST" 2>/dev/null || true

  # Terminate any remaining processes on port 3000
  local pids
  pids=$(lsof -ti:3000 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi

  # Terminate any orphaned tunnel processes
  pkill -f "scripts/tunnel.ts" 2>/dev/null || true

  echo "PocketBridge service stopped."
}

status_service() {
  if is_running; then
    echo "Status: RUNNING (Active on port 3000)"
    echo ""
    local_ip=$(get_local_ip)
    ts_ip=$(get_tailscale_ip)
    host_name=$(hostname -s)

    echo "URLs:"
    echo "  - Local Wi-Fi:      http://${local_ip}:3000"
    if [ -n "$ts_ip" ]; then
      echo "  - Tailscale Remote: http://${ts_ip}:3000"
    fi
    echo "  - Bonjour / mDNS:   http://${host_name}.local:3000"
    echo ""

    # Fetch live JSON status from server
    if command -v curl >/dev/null 2>&1; then
      local status_json
      status_json=$(curl -s --connect-timeout 2 http://127.0.0.1:3000/api/status || true)
      if [ -n "$status_json" ] && command -v jq >/dev/null 2>&1; then
        echo "Live Telemetry:"
        echo "  - Model Tier:   $(echo "$status_json" | jq -r '.modelTier // "pro"')"
        echo "  - Active Model: $(echo "$status_json" | jq -r '.activeModel // "gemini-3.8-flash-high"')"
        echo "  - RAM Used:     $(echo "$status_json" | jq -r '.memory.usedPercent // "N/A"')%"
        echo "  - Battery:      $(echo "$status_json" | jq -r '.battery.percent // "N/A"')% ($(echo "$status_json" | jq -r 'if .battery.isCharging then "Charging" else "On Battery" end'))"
        echo "  - Gemini Key:   $(echo "$status_json" | jq -r 'if .hasGeminiKey then "Configured" else "Missing" end')"
      fi
    fi
  else
    echo "Status: STOPPED (Port 3000 is inactive)"
    echo "Run 'pb start' to launch PocketBridge in the background."
  fi
}

show_logs() {
  if [ -f "$SERVICE_LOG" ]; then
    echo "Streaming logs from $SERVICE_LOG (Press Ctrl+C to exit)..."
    tail -n 40 -f "$SERVICE_LOG"
  else
    echo "No log file found at $SERVICE_LOG. Start the service first using 'pb start'."
  fi
}

show_tunnel_logs() {
  if [ -f "$TUNNEL_LOG" ]; then
    echo "Streaming tunnel logs from $TUNNEL_LOG (Press Ctrl+C to exit)..."
    tail -n 40 -f "$TUNNEL_LOG"
  else
    echo "No tunnel log file found at $TUNNEL_LOG."
  fi
}

open_browser() {
  local_ip=$(get_local_ip)
  echo "Opening http://${local_ip}:3000 in your default browser..."
  open "http://${local_ip}:3000"
}

case "${1:-start}" in
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    sleep 1
    start_service
    ;;
  status)
    status_service
    ;;
  logs|log)
    show_logs
    ;;
  tunnel|tunnel-logs)
    show_tunnel_logs
    ;;
  open)
    open_browser
    ;;
  monitor|hw)
    echo "Launching Stats hardware monitor in background..."
    open -g -a "Stats" 2>/dev/null || open -a "Stats"
    ;;
  help|-h|--help)
    echo "PocketBridge CLI Manager"
    echo ""
    echo "Usage:"
    echo "  pb [command]"
    echo ""
    echo "Commands:"
    echo "  start       Start PocketBridge as a background service (default)"
    echo "  stop        Stop the background service"
    echo "  restart     Restart the background service"
    echo "  status      Check current service status & system telemetry"
    echo "  logs        Follow live service log output"
    echo "  tunnel      Follow Cloudflare tunnel log output"
    echo "  open        Open the web interface in your default browser"
    echo "  monitor     Launch Stats hardware monitor in the menu bar"
    echo "  help        Display this help message"
    ;;
  *)
    echo "Unknown command: $1"
    echo "Run 'pb help' for a list of available commands."
    exit 1
    ;;
esac
