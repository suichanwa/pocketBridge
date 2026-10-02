# PocketBridge & Porfoliooo Session Handover Brief

This document captures the complete operational history, architectural decisions, recent bug fixes, and active configuration from the previous extended session (`ffb1180d-fabc-42f6-bd7a-c936d5525367`) for seamless continuation in new conversations without context loss or unnecessary token consumption.

---

## 1. Machine Environment & System Constraints
- **Host**: suiseika's MacBook Pro (`Darwin 24.6.0 x64`, Intel Core i5).
- **Node Management**: `fnm` (Fast Node Manager) at `/usr/local/bin/fnm`.
  - Installed versions: Node 20 (`v20.20.2`), Node 22 (`v22.23.3`), Node 24 (`v24.20.0`).
  - PocketBridge daemon runs on Node 24 (`v24.20.0`).
  - Porfoliooo runs on Node 22 (`v22.23.3`) via `.node-version`.
- **Global Rules**:
  - Strictly **ZERO EMOJIS** across all code, git commits, comments, and messages.
  - `--dangerously-skip-permissions` is pre-approved for terminal and hardware automation.
  - Pre-built CLI scripts in `/Users/suiseika/pocketBridge/scripts/`:
    - `take-photo.ts` (FaceTime HD camera via imagesnap).
    - `take-screenshot.ts` (screencapture).
    - `send-telegram.ts` (GramJS MTProto message and photo dispatch).
  - Caveman mode `/caveman` reduces token consumption when requested.

---

## 2. Active Projects & Current State

### A. PocketBridge (`/Users/suiseika/pocketBridge`)
- **Git Remote**: `https://github.com/suichanwa/pocketBridge.git` (Branch: `main`, clean tree).
- **Daemon Process**: Managed by macOS `launchd` as `com.pocketbridge.daemon` via `/Users/suiseika/pocketBridge/scripts/service-launcher.sh`.
- **Endpoints**:
  - Local Wi-Fi: `http://192.168.1.8:3000`
  - Tailscale VPN: `http://100.107.48.87:3000`
  - Bonjour / mDNS: `http://suiseikas-MacBook-Pro.local:3000`
  - Cloudflare Tunnel: Auto-spawned via `bin/cloudflared` for remote HTTPS & mic access.

#### Recent Fixes & Completed Work:
1. **Eliminated AGY Resume Timeout / Hang**:
   - Problem: `agy.ts` and `agent.ts` previously used global `-c` session resume which caused commands to hang or time out after 300s.
   - Fix: Switched to `--output-format stream-json`, per-session conversation isolation, and streaming JSON response parsing.
2. **Sequential Session Message Queue**:
   - Problem: When users sent multiple prompts in rapid succession into the same session, multiple concurrent agents ran and stepped on each other.
   - Fix: Built `drainSessionQueue()`, `sessionQueues` Map, and `activeProcessingSessions` Set in `src/server/index.ts` (commit `1b1528b`).
3. **Mobile Tab Sleep & "Failed to Fetch" Resolution**:
   - Problem: Mobile browsers (Chrome/Safari) freeze tabs in background and drop the Tailscale WireGuard socket. On return, `WebSocket.readyState` remained `1` (zombie socket), and immediate HTTP requests failed during Tailscale wake-up handshake.
   - Fix (commit `777b800`):
     - `src/client/lib/fetchWithRetry.ts`: 3 exponential backoff retries (400ms, 800ms, 1600ms) with friendly network error mapping.
     - `src/client/hooks/useAgentSocket.ts`: Tab sleep detection via `hiddenTimeRef`. If backgrounded > 2s, cleanly tears down the zombie socket and reconnects with 250ms wake-up buffer.
     - Bidirectional WebSocket ping/pong heartbeat every 15s with 8s timeout.
     - `src/server/index.ts`: WebSocket listeners attached synchronously upon connection (preventing dropped messages during async status loading).
     - `scripts/service-launcher.sh`: Fixed trap cleanup to kill both tunnel and server process on restart.

---

### B. Porfoliooo (`/Users/suiseika/porfoliooo`)
- **Git Remote**: `https://github.com/suichanwa/porfoliooo.git` (Branch: `main`).
- **Live URL**: `https://porfoliooo.web.app/` (Firebase Hosting).
- **Framework**: Astro v7.2.10 + React 19 + Tailwind CSS + DaisyUI + Three.js / React Three Fiber.

#### Recent Fixes & Completed Work:
1. **GitHub Actions Node 22 Parity**:
   - Upgraded `.github/workflows/firebase-hosting-merge.yml` and pull-request workflow to use `.node-version` (`22`).
   - Resolved Astro v7 build failure on GitHub Actions. Automatic deployment on push to `main` is fully functional.
2. **Mobile Layout & Line Alignment**:
   - Resolved mobile broken bar/line under TypeWriter and adjusted mobile planetarium UI layout.
   - Verified via Puppeteer headless tests; built cleanly and deployed to production (commits `5b595a3`, `5bc9823`, `72a47a2`, `fa06209`).

---

## 3. Key Architectural Files in PocketBridge

| File | Purpose |
|---|---|
| [`src/server/index.ts`](file:///Users/suiseika/pocketBridge/src/server/index.ts) | Fastify HTTP + WebSocket server, session queue, capture routes |
| [`src/server/agent.ts`](file:///Users/suiseika/pocketBridge/src/server/agent.ts) | Gemini function-calling agent loop, tool dispatch, slash commands |
| [`src/server/sessions.ts`](file:///Users/suiseika/pocketBridge/src/server/sessions.ts) | Session persistence in `sessions/*.json` and AGY import |
| [`src/server/tools/agy.ts`](file:///Users/suiseika/pocketBridge/src/server/tools/agy.ts) | Antigravity CLI runner with stream-json parsing |
| [`src/client/hooks/useAgentSocket.ts`](file:///Users/suiseika/pocketBridge/src/client/hooks/useAgentSocket.ts) | Resilient WebSocket hook, ping/pong, mobile tab wake-up |
| [`src/client/lib/fetchWithRetry.ts`](file:///Users/suiseika/pocketBridge/src/client/lib/fetchWithRetry.ts) | Fetch wrapper with exponential backoff for mobile/Tailscale |
| [`src/client/components/ChatFeed.tsx`](file:///Users/suiseika/pocketBridge/src/client/components/ChatFeed.tsx) | Main responsive chat interface, tool outputs, autocomplete |
| [`src/client/App.tsx`](file:///Users/suiseika/pocketBridge/src/client/App.tsx) | App layout, mobile tabs (Chat / Screen / Terminal), PIN auth |

---

## 4. Quick Verification Commands
```bash
# Check running service status
npm run service:status

# Test server health endpoint
curl -s http://localhost:3000/api/status

# Test client build and server typecheck
npm run build

# Restart daemon cleanly
launchctl kickstart -k gui/$(id -u)/com.pocketbridge.daemon
```
