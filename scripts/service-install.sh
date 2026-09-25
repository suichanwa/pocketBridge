#!/usr/bin/env bash
set -e
PLIST="$HOME/Library/LaunchAgents/com.pocketbridge.daemon.plist"
echo "Installing PocketBridge LaunchAgent: $PLIST..."
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"
echo "✅ PocketBridge LaunchAgent loaded! It will now auto-start on macOS login."
