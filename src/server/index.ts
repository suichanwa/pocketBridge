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
  ChatSession,
} from '../shared/types.js';
import {
  ensureSessionsDir,
  listPocketSessions,
  loadPocketSession,
  savePocketSession,
  createPocketSession,
  deletePocketSession,
  listLocalAgySessions,
  importOrResumeAgySession,
} from './sessions.js';

// Load .env
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CAPTURES_DIR = path.resolve(process.cwd(), 'captures');
const CLIENT_DIST_DIR = path.resolve(process.cwd(), 'dist/client');

// Initialize PocketAgent
const agent = new PocketAgent(process.env.GEMINI_API_KEY);

// Active Chat Session state (persisted to disk in sessions/)
let activeSession: ChatSession = {
  id: 'pb-default',
  title: 'Default Conversation',
  preview: 'Ready for commands',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messageCount: 1,
  messages: [
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        "**Welcome to PocketBridge!**\n\nI am your Mac's autonomous AI bridge. From your phone or remote browser, you can command me to:\n- **Take screenshots** and inspect running apps\n- **Run shell commands & tests** (`git`, `npm test`, `pytest`)\n- **Search Google / the web** for docs and answers\n- **Send Telegram messages**\n\nTap a quick action below or type a request!",
      timestamp: Date.now(),
      status: 'done',
    },
  ],
  terminalLogs: [],
};
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
      if (!info.internal && info.family === 'IPv4' && !info.address.startsWith('100.')) {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Resolves the Tailscale IPv4 address if Tailscale is active (100.x.y.z).
 */
function getTailscaleIp(): string | undefined {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (!info.internal && info.family === 'IPv4' && info.address.startsWith('100.')) {
        return info.address;
      }
    }
  }
  return undefined;
}

/**
 * Gathers live system status metrics.
 */
async function getLiveSystemStatus(): Promise<SystemStatus> {
  const localIp = getPrimaryLocalIp();
  const tailscaleIp = getTailscaleIp();
  const rawHostname = os.hostname();
  const cleanHostname = rawHostname.replace(/\.local$/, '');
  const memory = await getMacMemoryStats();
  const battery = await getMacBattery();

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Apple Silicon / Intel';

  return {
    hostname: rawHostname,
    localIp,
    tailscaleIp,
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
    modelTier: agent.getModelTier(),
    activeModel: agent.getActiveModel(),
  };
}

async function startServer() {
  await fs.mkdir(CAPTURES_DIR, { recursive: true });
  await ensureSessionsDir();

  // Load latest active session or create initial session
  try {
    const existing = await listPocketSessions();
    if (existing.length > 0) {
      const loaded = await loadPocketSession(existing[0].id);
      if (loaded) {
        activeSession = loaded;
      } else {
        activeSession = await createPocketSession();
      }
    } else {
      activeSession = await createPocketSession();
    }
  } catch (err) {
    console.error('Error initializing active session:', err);
  }

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

  app.delete('/api/captures/:filename', async (req, reply) => {
    try {
      const { filename } = req.params as { filename: string };
      const safeFilename = path.basename(filename);
      const filePath = path.join(CAPTURES_DIR, safeFilename);
      await fs.unlink(filePath).catch(() => {});
      return { success: true, filename: safeFilename };
    } catch (err: any) {
      reply.status(500);
      return { success: false, error: err?.message };
    }
  });

  app.delete('/api/captures', async (req, reply) => {
    try {
      const files = await fs.readdir(CAPTURES_DIR);
      for (const f of files) {
        if (f.endsWith('.png') || f.endsWith('.jpg')) {
          await fs.unlink(path.join(CAPTURES_DIR, f)).catch(() => {});
        }
      }
      return { success: true };
    } catch (err: any) {
      reply.status(500);
      return { success: false, error: err?.message };
    }
  });

  // Chat Session Routes
  app.get('/api/sessions', async () => {
    const sessions = await listPocketSessions();
    const agySessions = await listLocalAgySessions();
    return {
      sessions,
      agySessions,
      activeSessionId: activeSession.id,
    };
  });

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await loadPocketSession(id);
    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }
    return { session };
  });

  app.post('/api/sessions', async (req) => {
    const body = (req.body as { title?: string } | undefined) || {};
    activeSession = await createPocketSession(body.title);
    const sessions = await listPocketSessions();
    const agySessions = await listLocalAgySessions();
    broadcast({
      type: 'session_loaded',
      session: activeSession,
      sessions,
      agySessions,
    });
    return { session: activeSession };
  });

  app.delete('/api/sessions/:id', async (req) => {
    const { id } = req.params as { id: string };
    await deletePocketSession(id);
    if (activeSession.id === id) {
      const remaining = await listPocketSessions();
      if (remaining.length > 0) {
        activeSession = (await loadPocketSession(remaining[0].id)) || (await createPocketSession());
      } else {
        activeSession = await createPocketSession();
      }
    }
    const sessions = await listPocketSessions();
    const agySessions = await listLocalAgySessions();
    broadcast({
      type: 'session_loaded',
      session: activeSession,
      sessions,
      agySessions,
    });
    return { success: true };
  });

  app.post('/api/sessions/resume-agy/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      activeSession = await importOrResumeAgySession(id);
      const sessions = await listPocketSessions();
      const agySessions = await listLocalAgySessions();
      broadcast({
        type: 'session_loaded',
        session: activeSession,
        sessions,
        agySessions,
      });
      return { session: activeSession };
    } catch (err: any) {
      reply.status(500);
      return { error: err?.message };
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
    if (body.modelTier !== undefined) {
      process.env.MODEL_TIER = body.modelTier;
      agent.setModelTier(body.modelTier);
    }
    if (body.activeModel !== undefined) {
      process.env.ACTIVE_MODEL = body.activeModel;
      agent.setCustomAgyModel(body.activeModel);
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
MODEL_TIER=${process.env.MODEL_TIER || 'pro'}
ACTIVE_MODEL=${process.env.ACTIVE_MODEL || 'gemini-3.8-flash-high'}
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
    const sessions = await listPocketSessions();
    const agySessions = await listLocalAgySessions();
    const initMsg: ServerMessage = {
      type: 'init_state',
      messages: activeSession.messages,
      terminalLogs: (activeSession.terminalLogs || []).slice(-20),
      status: currentStatus,
      sessions,
      agySessions,
      activeSessionId: activeSession.id,
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

        if (clientMsg.type === 'get_sessions') {
          const sessions = await listPocketSessions();
          const agySessions = await listLocalAgySessions();
          socket.send(
            JSON.stringify({
              type: 'sessions_list',
              sessions,
              agySessions,
              activeSessionId: activeSession.id,
            } as ServerMessage)
          );
          return;
        }

        if (clientMsg.type === 'switch_session') {
          const loaded = await loadPocketSession(clientMsg.sessionId);
          if (loaded) {
            activeSession = loaded;
            const sessions = await listPocketSessions();
            const agySessions = await listLocalAgySessions();
            broadcast({
              type: 'session_loaded',
              session: activeSession,
              sessions,
              agySessions,
            });
          }
          return;
        }

        if (clientMsg.type === 'new_session') {
          activeSession = await createPocketSession(clientMsg.title || 'New Conversation');
          const sessions = await listPocketSessions();
          const agySessions = await listLocalAgySessions();
          broadcast({
            type: 'session_loaded',
            session: activeSession,
            sessions,
            agySessions,
          });
          return;
        }

        if (clientMsg.type === 'delete_session') {
          await deletePocketSession(clientMsg.sessionId);
          if (activeSession.id === clientMsg.sessionId) {
            const remaining = await listPocketSessions();
            if (remaining.length > 0) {
              activeSession = (await loadPocketSession(remaining[0].id)) || (await createPocketSession());
            } else {
              activeSession = await createPocketSession();
            }
          }
          const sessions = await listPocketSessions();
          const agySessions = await listLocalAgySessions();
          broadcast({
            type: 'session_loaded',
            session: activeSession,
            sessions,
            agySessions,
          });
          return;
        }

        if (clientMsg.type === 'resume_agy_session') {
          try {
            activeSession = await importOrResumeAgySession(clientMsg.conversationId);
            const sessions = await listPocketSessions();
            const agySessions = await listLocalAgySessions();
            broadcast({
              type: 'session_loaded',
              session: activeSession,
              sessions,
              agySessions,
            });
          } catch (err: any) {
            socket.send(
              JSON.stringify({
                type: 'error',
                message: err?.message || 'Failed to resume local AGY session',
              } as ServerMessage)
            );
          }
          return;
        }

        if (clientMsg.type === 'chat_clear') {
          activeSession.messages = [];
          activeSession.terminalLogs = [];
          await savePocketSession(activeSession);
          broadcast({ type: 'chat_cleared' });
          return;
        }

        if (clientMsg.type === 'chat_send') {
          const rawText = String(clientMsg.text || '').trim();
          const lower = rawText.toLowerCase();

          // Fast direct /clear command (handles /clear, clear, /cls, /clean, /reset, /clear all)
          if (
            lower === '/clear' ||
            lower === 'clear' ||
            lower === '/cls' ||
            lower === '/clean' ||
            lower === '/reset' ||
            lower.startsWith('/clear ')
          ) {
            activeSession.messages = [];
            activeSession.terminalLogs = [];
            await savePocketSession(activeSession);
            broadcast({ type: 'chat_cleared' });
            return;
          }

          const userText = rawText;

          const userMsgId = `user-${Date.now()}`;
          const assistantMsgId = `asst-${Date.now() + 1}`;

          const userMsg: ChatMessage = {
            id: userMsgId,
            role: 'user',
            content: userText,
            timestamp: Date.now(),
            status: 'done',
          };
          activeSession.messages.push(userMsg);
          broadcast({ type: 'chat_message', message: userMsg });

          const assistantMsg: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            status: 'thinking',
          };
          activeSession.messages.push(assistantMsg);
          broadcast({ type: 'chat_message', message: assistantMsg });
          savePocketSession(activeSession).catch(console.error);

          // Run Agent asynchronously
          agent.handleUserMessage(
            userText,
            activeSession.messages,
            assistantMsgId,
            {
              onUpdateMessage: (msgId, partial) => {
                const target = activeSession.messages.find((m) => m.id === msgId);
                if (target) {
                  Object.assign(target, partial);
                }
                broadcast({ type: 'chat_update', messageId: msgId, partial });
                if (partial.status === 'done' || partial.status === 'error') {
                  savePocketSession(activeSession).catch(console.error);
                }
              },
              onTerminalLog: (log) => {
                activeSession.terminalLogs = activeSession.terminalLogs || [];
                activeSession.terminalLogs.push(log);
                broadcast({ type: 'terminal_log', log });
                savePocketSession(activeSession).catch(console.error);
              },
              onTerminalChunk: (logId, chunk, exitCode) => {
                activeSession.terminalLogs = activeSession.terminalLogs || [];
                const log = activeSession.terminalLogs.find((l) => l.id === logId);
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
                if (exitCode !== undefined) {
                  savePocketSession(activeSession).catch(console.error);
                }
              },
              onScreenshotReady: (url) => {
                broadcast({
                  type: 'screenshot_ready',
                  url,
                  timestamp: Date.now(),
                });
              },
              onStatusChange: async (tier, activeModel) => {
                process.env.MODEL_TIER = tier;
                process.env.ACTIVE_MODEL = activeModel;
                try {
                  const envPath = path.resolve(process.cwd(), '.env');
                  let envContent = '';
                  try {
                    envContent = await fs.readFile(envPath, 'utf-8');
                  } catch {}
                  const updateEnvKey = (key: string, val: string) => {
                    const regex = new RegExp(`^${key}=.*$`, 'm');
                    if (regex.test(envContent)) {
                      envContent = envContent.replace(regex, `${key}=${val}`);
                    } else {
                      envContent += `\n${key}=${val}`;
                    }
                  };
                  updateEnvKey('MODEL_TIER', tier);
                  updateEnvKey('ACTIVE_MODEL', activeModel);
                  await fs.writeFile(envPath, envContent.trim() + '\n', 'utf-8');
                } catch (err) {
                  console.error('Error persisting model change to .env:', err);
                }
                const updatedStatus = await getLiveSystemStatus();
                broadcast({ type: 'system_status', status: updatedStatus });
              },
            },
            activeSession.agyConversationId
          );
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
              content: `**Screenshot captured** at ${new Date(shot.timestamp).toLocaleTimeString()}`,
              screenshotUrl: shot.publicUrl,
              timestamp: shot.timestamp,
              status: 'done',
            };
            activeSession.messages.push(shotMsg);
            savePocketSession(activeSession).catch(console.error);
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
              content: `**Webcam photo captured** at ${new Date(photo.timestamp).toLocaleTimeString()}`,
              screenshotUrl: photo.publicUrl,
              timestamp: photo.timestamp,
              status: 'done',
            };
            activeSession.messages.push(photoMsg);
            savePocketSession(activeSession).catch(console.error);
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
            activeSession.terminalLogs = activeSession.terminalLogs || [];
            activeSession.terminalLogs.push(log);
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
              content: `**Git Status**:\n\`\`\`bash\n${res.output.trim() || 'Clean working tree.'}\n\`\`\``,
              timestamp: Date.now(),
              status: 'done',
            };
            activeSession.messages.push(gitMsg);
            savePocketSession(activeSession).catch(console.error);
            broadcast({ type: 'chat_message', message: gitMsg });
          } else if (clientMsg.action === 'system_info') {
            const status = await getLiveSystemStatus();
            const sysMsg: ChatMessage = {
              id: `sys-${Date.now()}`,
              role: 'assistant',
              content: `**Mac System Info**\n- **Host**: \`${status.bonjourHost}\` (${status.localIp})\n- **CPU**: ${status.cpuModel}\n- **RAM**: ${status.memory.freeGb} GB free / ${status.memory.totalGb} GB (${status.memory.usedPercent}% used)\n- **Battery**: ${status.battery ? `${status.battery.percent}% (${status.battery.isCharging ? 'Charging' : 'On Battery'})` : 'Desktop/Plugged in'}\n- **Uptime**: ${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`,
              timestamp: Date.now(),
              status: 'done',
            };
            activeSession.messages.push(sysMsg);
            savePocketSession(activeSession).catch(console.error);
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
  const tailscaleIp = getTailscaleIp();
  const bonjourHost = os.hostname().replace(/\.local$/, '');

  console.log(`\n========================================================`);
  console.log(`PocketBridge Server is Running!`);
  console.log(`Local Wi-Fi URL:  http://${localIp}:${PORT}`);
  if (tailscaleIp) {
    console.log(`Tailscale Remote URL: http://${tailscaleIp}:${PORT}`);
  }
  console.log(`Bonjour/mDNS URL: http://${bonjourHost}.local:${PORT}`);
  console.log(`========================================================\n`);
}

startServer().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
