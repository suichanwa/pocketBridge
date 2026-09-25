import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import path from 'node:path';
import fs from 'node:fs';

let clientInstance: TelegramClient | null = null;

export interface SendTelegramParams {
  recipient: string; // 'me' (Saved Messages), username (@example), phone number (+1...), or chat ID
  message: string;
  mediaPath?: string;
  mediaPaths?: string[];
}

export interface TelegramStatus {
  isConfigured: boolean;
  mode: 'userbot' | 'bot' | 'none';
  connectedUser?: string;
}

/**
 * Checks whether Telegram messaging is configured via user session or bot token.
 */
export function isTelegramConfigured(): boolean {
  const hasUserSession = Boolean(
    process.env.TELEGRAM_API_ID &&
    process.env.TELEGRAM_API_HASH &&
    process.env.TELEGRAM_SESSION
  );
  const hasBot = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return hasUserSession || hasBot;
}

/**
 * Initializes and returns the GramJS Telegram client instance.
 */
export async function getTelegramClient(
  apiId?: string,
  apiHash?: string,
  sessionString?: string
): Promise<TelegramClient | null> {
  const finalApiId = apiId || process.env.TELEGRAM_API_ID;
  const finalApiHash = apiHash || process.env.TELEGRAM_API_HASH;
  const finalSession = sessionString || process.env.TELEGRAM_SESSION || '';

  if (!finalApiId || !finalApiHash || !finalSession) {
    return null;
  }

  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  const stringSession = new StringSession(finalSession);
  const client = new TelegramClient(stringSession, Number(finalApiId), finalApiHash, {
    connectionRetries: 5,
    deviceModel: 'MacBook Pro',
    systemVersion: 'macOS Sequoia',
    appVersion: '1.0.0',
  });

  await client.connect();
  clientInstance = client;
  return clientInstance;
}

/**
 * Helper to resolve relative capture URLs like '/captures/shot-123.png' to absolute file paths on disk.
 */
function resolveCapturePath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;
  const clean = urlOrPath.trim();
  if (fs.existsSync(clean)) return clean;
  const basename = path.basename(clean);
  const fullPath = path.resolve(process.cwd(), 'captures', basename);
  if (fs.existsSync(fullPath)) return fullPath;
  return null;
}

/**
 * Sends a message or actual photo media to a Telegram recipient.
 * Supports:
 *  - 'me' or 'self' -> Your personal "Saved Messages"
 *  - '@username' -> Any Telegram contact or user
 *  - Phone number with country code -> Any contact
 *  - Actual photo attachments when mediaPath/mediaPaths or /captures/... URLs are present
 */
export async function sendTelegramMessage(params: SendTelegramParams): Promise<{
  success: boolean;
  recipient: string;
  messageId?: number;
  error?: string;
}> {
  const targetRecipient =
    params.recipient.toLowerCase() === 'self' || params.recipient.toLowerCase() === 'me'
      ? 'me'
      : params.recipient.trim();

  // Find all photos/files to deliver
  const filesToSend: string[] = [];

  if (params.mediaPath) {
    const resolved = resolveCapturePath(params.mediaPath);
    if (resolved && !filesToSend.includes(resolved)) filesToSend.push(resolved);
  }

  if (params.mediaPaths && Array.isArray(params.mediaPaths)) {
    for (const p of params.mediaPaths) {
      const resolved = resolveCapturePath(p);
      if (resolved && !filesToSend.includes(resolved)) filesToSend.push(resolved);
    }
  }

  // Auto-detect any /captures/ image paths inside the message text
  const captureRegex = /(?:\/)?captures\/[a-zA-Z0-9_\-.]+\.(?:png|jpg|jpeg|webp)/gi;
  let match;
  while ((match = captureRegex.exec(params.message)) !== null) {
    const resolved = resolveCapturePath(match[0]);
    if (resolved && !filesToSend.includes(resolved)) {
      filesToSend.push(resolved);
    }
  }

  // 1. Try MTProto user account first (enables personal contacts & Saved Messages)
  const client = await getTelegramClient();
  if (client) {
    try {
      if (filesToSend.length > 0) {
        let lastId: number | undefined;
        for (let i = 0; i < filesToSend.length; i++) {
          const file = filesToSend[i];
          const isFirst = i === 0;
          const result: any = await client.sendFile(targetRecipient, {
            file,
            caption: isFirst ? params.message : undefined,
          });
          lastId = result.id;
        }

        return {
          success: true,
          recipient: targetRecipient,
          messageId: lastId,
        };
      } else {
        const result = await client.sendMessage(targetRecipient, {
          message: params.message,
        });

        return {
          success: true,
          recipient: targetRecipient,
          messageId: result.id,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        recipient: targetRecipient,
        error: error?.message || 'Failed to send Telegram message via account',
      };
    }
  }

  // 2. Try Telegram Bot API if TELEGRAM_BOT_TOKEN is configured
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const defaultChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const chatId = targetRecipient === 'me' ? defaultChatId : targetRecipient;

  if (botToken && chatId) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: params.message,
        }),
      });
      const data = (await response.json()) as any;
      if (data.ok) {
        return {
          success: true,
          recipient: chatId,
          messageId: data.result?.message_id,
        };
      } else {
        return {
          success: false,
          recipient: chatId,
          error: data.description || 'Telegram Bot API error',
        };
      }
    } catch (botErr: any) {
      return {
        success: false,
        recipient: chatId,
        error: botErr?.message || 'Failed to reach Telegram Bot API',
      };
    }
  }

  // 3. Neither is configured
  return {
    success: false,
    recipient: targetRecipient,
    error:
      'Telegram is not connected yet. Run `npm run telegram:login` on your Mac terminal to link your personal Telegram account, or enter TELEGRAM_BOT_TOKEN in .env.',
  };
}
