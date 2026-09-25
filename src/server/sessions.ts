import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ChatMessage, TerminalLog, ChatSession, ChatSessionMeta } from '../shared/types.js';

const SESSIONS_DIR = path.resolve(process.cwd(), 'sessions');

// Location of local Google Antigravity / Gemini Brain transcripts on Mac
const BRAIN_DIR = fsSync.existsSync('/Users/suiseika/.gemini/antigravity-cli/brain')
  ? '/Users/suiseika/.gemini/antigravity-cli/brain'
  : path.join(os.homedir(), '.gemini/antigravity-cli/brain');

export async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

/**
 * Lists saved PocketBridge sessions from local disk.
 */
export async function listPocketSessions(): Promise<ChatSessionMeta[]> {
  await ensureSessionsDir();
  const files = await fs.readdir(SESSIONS_DIR);
  const sessions: ChatSessionMeta[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = path.join(SESSIONS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as ChatSession;
      sessions.push({
        id: session.id,
        title: session.title,
        preview: session.preview,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages?.length || 0,
        isExternalAgy: session.isExternalAgy,
        agyConversationId: session.agyConversationId,
      });
    } catch (err) {
      console.error(`Failed to read session file ${file}:`, err);
    }
  }

  // Sort by latest updated first
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return sessions;
}

/**
 * Loads a single PocketBridge session by ID.
 */
export async function loadPocketSession(id: string): Promise<ChatSession | null> {
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  if (!fsSync.existsSync(filePath)) {
    return null;
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ChatSession;
  } catch (err) {
    console.error(`Failed to load session ${id}:`, err);
    return null;
  }
}

/**
 * Saves a PocketBridge session to local disk.
 */
export async function savePocketSession(session: ChatSession): Promise<void> {
  await ensureSessionsDir();
  
  // Auto-generate title from first user message if title is generic
  if ((!session.title || session.title === 'New Conversation') && session.messages?.length > 0) {
    const firstUserMsg = session.messages.find((m) => m.role === 'user');
    if (firstUserMsg && firstUserMsg.content) {
      const clean = firstUserMsg.content.trim().split('\n')[0].replace(/^[/#]/, '').trim();
      if (clean) {
        session.title = clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
      }
    }
  }

  // Set latest preview
  const lastMsg = session.messages[session.messages.length - 1];
  if (lastMsg) {
    const raw = lastMsg.content.replace(/\n+/g, ' ').trim();
    session.preview = raw.length > 80 ? `${raw.slice(0, 80)}...` : raw;
  }

  session.messageCount = session.messages.length;
  session.updatedAt = Date.now();

  const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Creates a brand new PocketBridge session.
 */
export async function createPocketSession(title = 'New Conversation'): Promise<ChatSession> {
  await ensureSessionsDir();
  const id = `pb-${Date.now()}`;
  const now = Date.now();
  const session: ChatSession = {
    id,
    title,
    preview: 'Empty conversation',
    createdAt: now,
    updatedAt: now,
    messageCount: 1,
    messages: [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content:
          '**Welcome to PocketBridge!**\n\nI am your Mac\'s autonomous AI bridge. From your phone or remote browser, you can command me to:\n- **Take screenshots** and inspect running apps\n- **Run shell commands & tests** (`git`, `npm test`, `pytest`)\n- **Search Google / the web** for docs and answers\n- **Send Telegram messages**\n\nTap a quick action below or type a request!',
        timestamp: now,
        status: 'done',
      },
    ],
    terminalLogs: [],
  };

  await savePocketSession(session);
  return session;
}

/**
 * Deletes a PocketBridge session from local disk.
 */
export async function deletePocketSession(id: string): Promise<boolean> {
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  if (!fsSync.existsSync(filePath)) return false;
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    console.error(`Failed to delete session ${id}:`, err);
    return false;
  }
}

/**
 * Scans local Mac Antigravity/Gemini CLI conversation directory (~/.gemini/antigravity-cli/brain).
 * Returns metadata so user can inspect and /resume any local conversation.
 */
export async function listLocalAgySessions(): Promise<ChatSessionMeta[]> {
  if (!fsSync.existsSync(BRAIN_DIR)) {
    return [];
  }

  try {
    const entries = await fs.readdir(BRAIN_DIR, { withFileTypes: true });
    const agySessions: ChatSessionMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const convId = entry.name;
      const convPath = path.join(BRAIN_DIR, convId);
      const transcriptPath = path.join(convPath, '.system_generated', 'logs', 'transcript.jsonl');

      if (!fsSync.existsSync(transcriptPath)) continue;

      try {
        const stat = await fs.stat(convPath);
        const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
        const lines = transcriptContent.trim().split('\n').filter(Boolean);
        if (lines.length === 0) continue;

        let title = `Conversation ${convId.slice(0, 8)}`;
        let preview = '';
        let firstTimestamp = stat.mtimeMs;

        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            if (item.type === 'USER_INPUT' && item.content) {
              const match = item.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
              const clean = match ? match[1].trim() : item.content.trim();
              const firstLine = clean.split('\n')[0].trim();
              if (firstLine) {
                title = firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine;
                preview = clean.slice(0, 100);
              }
              if (item.created_at) {
                firstTimestamp = new Date(item.created_at).getTime() || stat.mtimeMs;
              }
              break;
            }
          } catch {}
        }

        agySessions.push({
          id: convId,
          title,
          preview,
          createdAt: firstTimestamp,
          updatedAt: stat.mtimeMs,
          messageCount: lines.length,
          isExternalAgy: true,
          agyConversationId: convId,
        });
      } catch (err) {
        // Skip unreadable or corrupted transcript
      }
    }

    // Sort latest updated first
    agySessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return agySessions.slice(0, 40);
  } catch (err) {
    console.error('Error scanning local AGY brain sessions:', err);
    return [];
  }
}

/**
 * Resumes and imports a local Mac Gemini / Antigravity CLI conversation transcript
 * into PocketBridge, allowing the user to view history and continue chatting via `--conversation <id>`.
 */
export async function importOrResumeAgySession(conversationId: string): Promise<ChatSession> {
  await ensureSessionsDir();
  const sessionId = `agy-${conversationId}`;

  // If already imported and cached in sessions/, load it
  const existing = await loadPocketSession(sessionId);
  if (existing) {
    return existing;
  }

  const convPath = path.join(BRAIN_DIR, conversationId);
  const transcriptPath = path.join(convPath, '.system_generated', 'logs', 'transcript.jsonl');

  if (!fsSync.existsSync(transcriptPath)) {
    throw new Error(`Local conversation transcript not found at ${transcriptPath}`);
  }

  const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
  const lines = transcriptContent.trim().split('\n').filter(Boolean);
  const messages: ChatMessage[] = [];
  let title = `AGY Session ${conversationId.slice(0, 8)}`;
  let createdAt = Date.now();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const timestamp = entry.created_at ? new Date(entry.created_at).getTime() : Date.now();

      if (entry.type === 'USER_INPUT' && entry.content) {
        const match = entry.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        const text = match ? match[1].trim() : entry.content.trim();
        if (messages.length === 0 && text) {
          const firstLine = text.split('\n')[0].trim();
          title = firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine;
          createdAt = timestamp;
        }
        messages.push({
          id: `user-${entry.step_index || messages.length}`,
          role: 'user',
          content: text,
          timestamp,
          status: 'done',
        });
      } else if (entry.type === 'PLANNER_RESPONSE' && entry.content && entry.content.trim()) {
        messages.push({
          id: `asst-${entry.step_index || messages.length}`,
          role: 'assistant',
          content: entry.content.trim(),
          timestamp,
          status: 'done',
        });
      }
    } catch {}
  }

  const session: ChatSession = {
    id: sessionId,
    title,
    preview: messages[messages.length - 1]?.content.slice(0, 80) || 'Imported AGY Conversation',
    createdAt,
    updatedAt: Date.now(),
    messageCount: messages.length,
    isExternalAgy: true,
    agyConversationId: conversationId,
    messages,
    terminalLogs: [],
  };

  await savePocketSession(session);
  return session;
}
