# PocketBridge 🌉

**PocketBridge** transforms your Mac laptop into a remote-controlled AI agent server. Connect from your mobile phone over local Wi-Fi to send commands to Gemini, test apps, execute git workflows, search the web, send Telegram messages, and inspect real-time screenshots of your Mac display.

---

## 📱 Connecting From Your Phone

Make sure your phone is connected to the same Wi-Fi network as your Mac:

1. Open **Safari** (iOS) or **Chrome** (Android) on your phone.
2. Go to:
   ```
   http://suiseikas-MacBook-Pro.local:3000
   ```
   *or via your local IP address:*
   ```
   http://192.168.1.8:3000
   ```
3. **Turn into a Native Mobile App (PWA)**:
   * **iOS Safari**: Tap **Share (⬆️) → Add to Home Screen**.
   * **Android Chrome**: Tap **Options (⋮) → Add to Home screen** / **Install app**.
   * It will open full-screen with no browser address bars, looking and feeling like a native app.

---

## ⚡ Key Capabilities

* **📸 Live Mac Screen Capture**: Instant screenshot tool (`screencapture -x`) with in-line chat previews, thumbnail gallery, and full-resolution pinch-to-zoom modal.
* **🤖 Autonomous Gemini Agent**: Equipped with function/tool calling to execute shell commands, take screenshots when asked, query the web, and message Telegram contacts.
* **💻 Real-Time Terminal & Test Output**: Live streaming monospace console for `git status`, `git pull`, `npm test`, `pytest`, and build jobs.
* **🌐 Web Search**: Fast web search tool for checking documentation, bug solutions, and live information.
* **📱 Telegram Integration**: Built-in GramJS (MTProto) client for sending messages to Telegram contacts.
* **🔋 Mac System Telemetry**: Live battery percentage, charging state, RAM usage, CPU model, and system uptime.
* **🔒 Local Security**: Optional PIN protection to keep other devices on your Wi-Fi from executing actions.
* **🌙 Smart Sleep Management**: Runs with macOS `caffeinate -i` so it stays awake while the lid is open, and automatically sleeps/hibernates when you close the lid.

---

## 🛠️ Tech Stack

* **Runtime**: Node.js 24 LTS (managed via `fnm`)
* **Backend**: Fastify v5, `@fastify/websocket`, `@fastify/static`, `execa`, `dotenv`
* **AI Engine**: Google GenAI SDK (`@google/genai`) with Gemini 2.5 Flash Function Calling
* **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, **shadcn/ui** components (Radix UI primitives)
* **Testing**: Automated multi-device responsive tests via Puppeteer

---

## 🚀 Quick Start

### 1. Install & Build
```bash
npm install
npm run build
```

### 2. Configure Environment (`.env`)
You can edit `.env` directly or use the in-app **Settings (⚙️)** modal from your phone:
```env
PORT=3000
HOST=0.0.0.0

# Get your free key from https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: PIN lock for Wi-Fi access (leave blank for open access)
ACCESS_PIN=

# Optional: Telegram credentials (from https://my.telegram.org)
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=
```

### 3. Start the Server
```bash
./scripts/start-server.sh
```
*Or via npm:*
```bash
npm start
```

---

## 🧪 Testing & Verification

Run the automated test suites:

* **Multi-Device Responsive Test** (tests Phone, 16:10 Laptop, and 27-inch 2K Monitor):
  ```bash
  npm run test:responsive
  ```
  *Screenshots saved to `test-output/`.*

* **Backend & Tool Protocol Verification**:
  ```bash
  npx tsx test/test-backend.ts
  ```

---

## ⌨️ Direct Slash Commands

Even without an LLM key configured, you can send instant direct commands in the chat:
* `/screenshot` — Takes a screenshot and displays it in the chat and Screen tab.
* `/git [args]` — Runs `git [args]` (e.g. `/git status`, `/git diff`, `/git log -n 5`).
* `/sh [command]` — Runs any shell command on your Mac and streams the output to the Terminal tab.

---

## 📄 License
ISC
