import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { execa } from 'execa';
import { PocketAgent } from './agent.js';
import { takeMacScreenshot } from './tools/screenshot.js';
import { takeCameraPhoto } from './tools/camera.js';
import { executeShellCommand } from './tools/shell.js';
import type {
  ChatMessage,
  TerminalLog,
  SystemStatus,
  ClientMessage,
  ServerMessage,
  ConfigSettings,
} from '../shared/types.js';

// Load .env
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CAPTURES_DIR = path.resolve(process.cwd(), 'captures');
const CLIENT_DIST_DIR = path.resolve(process.cwd(), 'dist/client');

// Initialize PocketAgent
const agent = new PocketAgent(process.env.GEMINI_API_KEY);

// In-Memory state
const messages: ChatMessage[] = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content:
      "👋 **Welcome to PocketBridge!**\n\nI am your Mac's autonomous AI bridge. From your phone or remote browser, you can command me to:\n- 📸 **Take screenshots** and inspect running apps\n- 💻 **Run shell commands & tests** (`git`, `npm test`, `pytest`)\n- 🌐 **Search Google / the web** for docs and answers\n- 📱 **Send Telegram messages**\n\nTap a quick action below or type a request!",
    timestamp: Date.now(),
    status: 'done',
  },
];
const terminalLogs: TerminalLog[] = [];
const connectedClients = new Set<any>();

/**
 * Broadcasts a typed message to all active WebSocket clients.
 */
function broadcast(msg: ServerMessage) {
  const payload = JSON.stringify(msg);
  for (const client of connectedClients) {
    if (client.readyState === 1 /* OPEN */) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('Failed to send to client:', err);
      }
    }
  }
}

/**
 * Reads macOS battery status via `pmset -g batt`.
 */
async function getMacBattery(): Promise<{ percent: number; isCharging: boolean } | undefined> {
  try {
    const { stdout } = await execa('/usr/bin/pmset', ['-g', 'batt']);
    const percentMatch = stdout.match(/(\d+)%/);
    const isDischarging = stdout.includes('discharging');
    const isCharging = !isDischarging && (stdout.includes('; charging;') || stdout.includes('AC Power'));
    if (percentMatch) {
      return {
        percent: parseInt(percentMatch[1], 10),
        isCharging,
      };
    }
  } catch {
    // Battery check is optional
  }
  return undefined;
}

/**
 * Calculates accurate macOS memory usage via vm_stat and sysctl.
 * Node's os.freemem() only accounts for completely unallocated memory,
 * ignoring inactive cache pages that macOS reclaims dynamically.
 */
async function getMacMemoryStats(): Promise<{ totalGb: string; freeGb: string; usedPercent: number }> {
  try {
    const { stdout: vmOut } = await execa('/usr/bin/vm_stat');
    const pageSizeMatch = vmOut.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;

    const getVal = (key: string) => {
      const m = vmOut.match(new RegExp(key + ':\\s+(\\d+)'));
      return m ? parseInt(m[1], 10) * pageSize : 0;
    };

    const active = getVal('Pages active');
    const wired = getVal('Pages wired down');
    const compressor = getVal('Pages occupied by compressor');

    const { stdout: totalOut } = await execa('/usr/sbin/sysctl', ['-n', 'hw.memsize']);
    const totalMem = parseInt(totalOut.trim(), 10) || os.totalmem();

    const usedMem = active + wired + compressor;
    const availableMem = Math.max(0, totalMem - usedMem);
    const usedPercent = Math.min(100, Math.max(0, Math.round((usedMem / totalMem) * 100)));

    return {
      totalGb: (totalMem / 1024 / 1024 / 1024).toFixed(1),
      freeGb: (availableMem / 1024 / 1024 / 1024).toFixed(1),
      usedPercent,
    };
  } catch {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      totalGb: (totalMem / 1024 / 1024 / 1024).toFixed(1),
      freeGb: (freeMem / 1024 / 1024 / 1024).toFixed(1),
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    };
  }
}

/**
 * Resolves the primary local IPv4 address.
 */
function getPrimaryLocalIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (!info.internal && info.family === 'IPv4') {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Gathers live system status metrics.
 */
async function getLiveSystemStatus(): Promise<SystemStatus> {
  const localIp = getPrimaryLocalIp();
  const rawHostname = os.hostname();
  const cleanHostname = rawHostname.replace(/\.local$/, '');
  const memory = await getMacMemoryStats();
  const battery = await getMacBattery();

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Apple Silicon / Intel';

  return {
    hostname: rawHostname,
    localIp,
    bonjourHost: `${cleanHostname}.local`,
    port: PORT,
    uptime: Math.round(os.uptime()),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuModel,
    memory,
    battery,
    hasGeminiKey: agent.hasKey(),
    hasTelegramConfig: Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
    pinRequired: Boolean(process.env.ACCESS_PIN && process.env.ACCESS_PIN.trim().length > 0),
  };
}

async function startServer() {
  await fs.mkdir(CAPTURES_DIR, { recursive: true });

  const app = Fastify({
    logger: false,
  });

  await app.register(fastifyCors, {
    origin: true,
  });

  await app.register(fastifyWebsocket);

  // Serve captured screenshots at /captures/*
  await app.register(fastifyStatic, {
    root: CAPTURES_DIR,
    prefix: '/captures/',
    decorateReply: false,
  });

  // Serve built client if dist exists
  if (existsSync(CLIENT_DIST_DIR)) {
    await app.register(fastifyStatic, {
      root: CLIENT_DIST_DIR,
      prefix: '/',
      decorateReply: true,
    });

    // SPA fallback
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && !req.raw.url.startsWith('/api') && !req.raw.url.startsWith('/ws') && !req.raw.url.startsWith('/captures')) {
        return reply.sendFile('index.html');
      }
      reply.status(404).send({ error: 'Not Found' });
    });
  }

  // REST API Routes
  app.get('/api/status', async () => {
    return await getLiveSystemStatus();
  });

  app.get('/api/captures', async () => {
    try {
      const files = await fs.readdir(CAPTURES_DIR);
      const images = files
        .filter((f) => f.endsWith('.png') || f.endsWith('.jpg'))
        .map((f) => ({
          filename: f,
          url: `/captures/${f}`,
        }))
        .reverse();
      return { captures: images };
    } catch {
      return { captures: [] };
    }
  });

  app.post('/api/action/screenshot', async (req, reply) => {
    try {
      const shot = await takeMacScreenshot();
      broadcast({
        type: 'screenshot_ready',
        url: shot.publicUrl,
        timestamp: shot.timestamp,
      });
      return { success: true, url: shot.publicUrl };
    } catch (err: any) {
      reply.status(500);
      return { success: false, error: err?.message };
    }
  });

  app.post('/api/action/camera', async (req, reply) => {
    try {
      const photo = await takeCameraPhoto();
      broadcast({
        type: 'screenshot_ready',
        url: photo.publicUrl,
        timestamp: photo.timestamp,
      });
      return { success: true, url: photo.publicUrl };
    } catch (err: any) {
      reply.status(500);
      return { success: false, error: err?.message };
    }
  });

  app.post('/api/settings', async (req, reply) => {
    const body = req.body as ConfigSettings;
    if (body.geminiApiKey !== undefined) {
      process.env.GEMINI_API_KEY = body.geminiApiKey;
      agent.updateApiKey(body.geminiApiKey);
    }
    if (body.accessPin !== undefined) {
      process.env.ACCESS_PIN = body.accessPin;
    }
    if (body.telegramApiId !== undefined) {
      process.env.TELEGRAM_API_ID = body.telegramApiId;
    }
    if (body.telegramApiHash !== undefined) {
      process.env.TELEGRAM_API_HASH = body.telegramApiHash;
    }

    // Persist to .env
    try {
      const envContent = `# PocketBridge Configuration
PORT=${PORT}
HOST=${HOST}
GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}
ACCESS_PIN=${process.env.ACCESS_PIN || ''}
TELEGRAM_API_ID=${process.env.TELEGRAM_API_ID || ''}
TELEGRAM_API_HASH=${process.env.TELEGRAM_API_HASH || ''}
TELEGRAM_SESSION=${process.env.TELEGRAM_SESSION || ''}
`;
      await fs.writeFile(path.resolve(process.cwd(), '.env'), envContent, 'utf-8');
    } catch (err) {
      console.error('Error saving .env file:', err);
    }

    const updatedStatus = await getLiveSystemStatus();
    broadcast({ type: 'system_status', status: updatedStatus });
    return { success: true, status: updatedStatus };
  });

  // WebSocket route for real-time interaction
  app.get('/ws', { websocket: true }, async (socket, req) => {
    connectedClients.add(socket);

    // Send initial state on connection
    const currentStatus = await getLiveSystemStatus();
    const initMsg: ServerMessage = {
      type: 'init_state',
      messages,
      terminalLogs: terminalLogs.slice(-20),
      status: currentStatus,
    };
    socket.send(JSON.stringify(initMsg));

    socket.on('message', async (raw: Buffer) => {
      try {
        const clientMsg: ClientMessage = JSON.parse(raw.toString('utf-8'));

        // Check PIN security if configured
        const currentPin = process.env.ACCESS_PIN?.trim();
        if (currentPin && currentPin.length > 0) {
          if (clientMsg.type === 'verify_pin') {
            const isMatch = clientMsg.pin === currentPin;
            socket.send(
              JSON.stringify({
                type: 'auth_result',
                success: isMatch,
                message: isMatch ? 'Authenticated' : 'Invalid PIN',
              } as ServerMessage)
            );
            return;
          }
          if ('pin' in clientMsg && clientMsg.pin !== currentPin) {
            socket.send(
              JSON.stringify({
                type: 'auth_result',
                success: false,
                message: 'Invalid or missing PIN',
              } as ServerMessage)
            );
            return;
          }
        }

        if (clientMsg.type === 'chat_send') {
          const userText = clientMsg.text;
          const userMsgId = `user-${Date.now()}`;
          const assistantMsgId = `asst-${Date.now() + 1}`;

          const userMsg: ChatMessage = {
            id: userMsgId,
            role: 'user',
            content: userText,
            timestamp: Date.now(),
            status: 'done',
          };
          messages.push(userMsg);
          broadcast({ type: 'chat_message', message: userMsg });

          const assistantMsg: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            status: 'thinking',
          };
          messages.push(assistantMsg);
          broadcast({ type: 'chat_message', message: assistantMsg });

          // Run Agent asynchronously
          agent.handleUserMessage(userText, messages, assistantMsgId, {
            onUpdateMessage: (msgId, partial) => {
              const target = messages.find((m) => m.id === msgId);
              if (target) {
                Object.assign(target, partial);
              }
              broadcast({ type: 'chat_update', messageId: msgId, partial });
            },
            onTerminalLog: (log) => {
              terminalLogs.push(log);
              broadcast({ type: 'terminal_log', log });
            },
            onTerminalChunk: (logId, chunk, exitCode) => {
              const log = terminalLogs.find((l) => l.id === logId);
              if (log) {
                log.output += chunk;
                if (exitCode !== undefined) {
                  log.exitCode = exitCode;
                  log.status = exitCode === 0 ? 'completed' : 'failed';
                }
              }
              broadcast({
                type: 'terminal_log_update',
                logId,
                chunk,
                exitCode,
                status: exitCode !== undefined ? (exitCode === 0 ? 'completed' : 'failed') : undefined,
              });
            },
            onScreenshotReady: (url) => {
              broadcast({
                type: 'screenshot_ready',
                url,
                timestamp: Date.now(),
              });
            },
          });
        } else if (clientMsg.type === 'run_quick_action') {
          if (clientMsg.action === 'screenshot') {
            const shot = await takeMacScreenshot();
            broadcast({
              type: 'screenshot_ready',
              url: shot.publicUrl,
              timestamp: shot.timestamp,
            });
            const shotMsg: ChatMessage = {
              id: `shot-${Date.now()}`,
              role: 'assistant',
              content: `📸 **Screenshot captured** at ${new Date(shot.timestamp).toLocaleTimeString()}`,
              screenshotUrl: shot.publicUrl,
              timestamp: shot.timestamp,
              status: 'done',
            };
            messages.push(shotMsg);
            broadcast({ type: 'chat_message', message: shotMsg });
          } else if (clientMsg.action === 'camera') {
            const photo = await takeCameraPhoto();
            broadcast({
              type: 'screenshot_ready',
              url: photo.publicUrl,
              timestamp: photo.timestamp,
            });
            const photoMsg: ChatMessage = {
              id: `camera-${Date.now()}`,
              role: 'assistant',
              content: `📸 **Webcam photo captured** at ${new Date(photo.timestamp).toLocaleTimeString()}`,
              screenshotUrl: photo.publicUrl,
              timestamp: photo.timestamp,
              status: 'done',
            };
            messages.push(photoMsg);
            broadcast({ type: 'chat_message', message: photoMsg });
          } else if (clientMsg.action === 'git_status') {
            const logId = `term-${Date.now()}`;
            const log: TerminalLog = {
              id: logId,
              command: 'git status -s',
              output: '',
              status: 'running',
              timestamp: Date.now(),
            };
            terminalLogs.push(log);
            broadcast({ type: 'terminal_log', log });

            const res = await executeShellCommand('git status -s', {
              cwd: process.cwd(),
              onChunk: (chunk) => {
                log.output += chunk;
                broadcast({ type: 'terminal_log_update', logId, chunk });
              },
            });
            log.exitCode = res.exitCode;
            log.status = res.exitCode === 0 ? 'completed' : 'failed';
            broadcast({
              type: 'terminal_log_update',
              logId,
              chunk: '',
              exitCode: res.exitCode,
              status: log.status,
            });

            const gitMsg: ChatMessage = {
              id: `git-${Date.now()}`,
              role: 'assistant',
              content: `📊 **Git Status**:\n\`\`\`bash\n${res.output.trim() || 'Clean working tree.'}\n\`\`\``,
              timestamp: Date.now(),
              status: 'done',
            };
            messages.push(gitMsg);
            broadcast({ type: 'chat_message', message: gitMsg });
          } else if (clientMsg.action === 'system_info') {
            const status = await getLiveSystemStatus();
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}`,
              role: 'assistant',
              content: `💻 **Mac System Info**\n- **Host**: \`${status.bonjourHost}\` (${status.localIp})\n- **CPU**: ${status.cpuModel}\n- **RAM**: ${status.memory.freeGb} GB free / ${status.memory.totalGb} GB (${status.memory.usedPercent}% used)\n- **Battery**: ${status.battery ? `${status.battery.percent}% (${status.battery.isCharging ? 'Charging' : 'On Battery'})` : 'Desktop/Plugged in'}\n- **Uptime**: ${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`,
              timestamp: Date.now(),
              status: 'done',
            };
            messages.push(sysMsg);
            broadcast({ type: 'chat_message', message: sysMsg });
          }
        } else if (clientMsg.type === 'get_status') {
          const status = await getLiveSystemStatus();
          socket.send(JSON.stringify({ type: 'system_status', status } as ServerMessage));
        }
      } catch (err: any) {
        console.error('WebSocket message handling error:', err);
        socket.send(JSON.stringify({ type: 'error', message: err?.message || 'Invalid message' }));
      }
    });

    socket.on('close', () => {
      connectedClients.delete(socket);
    });

    socket.on('error', (err: any) => {
      console.error('Socket error:', err);
      connectedClients.delete(socket);
    });
  });

  await app.listen({ port: PORT, host: HOST });
  const localIp = getPrimaryLocalIp();
  const bonjourHost = os.hostname().replace(/\.local$/, '');

  console.log(`\n========================================================`);
  console.log(`🚀 PocketBridge Server is Running!`);
  console.log(`📍 Local Wi-Fi URL:  http://${localIp}:${PORT}`);
  console.log(`🍎 Bonjour/mDNS URL: http://${bonjourHost}.local:${PORT}`);
  console.log(`========================================================\n`);
}

startServer().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
