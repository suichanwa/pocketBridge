#!/usr/bin/env bash
PLIST="$HOME/Library/LaunchAgents/com.pocketbridge.daemon.plist"
echo "Unloading PocketBridge LaunchAgent..."
launchctl unload "$PLIST" 2>/dev/null || true
echo "✅ PocketBridge LaunchAgent unloaded."
