import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

let clientInstance: TelegramClient | null = null;

export interface SendTelegramParams {
  recipient: string; // phone number, username (@example), or chat ID
  message: string;
}

export interface TelegramStatus {
  isConfigured: boolean;
  isConnected: boolean;
  connectedUser?: string;
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

  if (!finalApiId || !finalApiHash) {
    return null;
  }

  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  const stringSession = new StringSession(finalSession);
  const client = new TelegramClient(stringSession, Number(finalApiId), finalApiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  clientInstance = client;
  return clientInstance;
}

/**
 * Sends a message to a Telegram recipient.
 */
export async function sendTelegramMessage(params: SendTelegramParams): Promise<{
  success: boolean;
  recipient: string;
  messageId?: number;
  error?: string;
}> {
  const client = await getTelegramClient();

  if (!client) {
    return {
      success: false,
      recipient: params.recipient,
      error:
        'Telegram is not configured yet. Please provide TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_SESSION in .env or the Settings panel.',
    };
  }

  try {
    const result = await client.sendMessage(params.recipient, {
      message: params.message,
    });

    return {
      success: true,
      recipient: params.recipient,
      messageId: result.id,
    };
  } catch (error: any) {
    return {
      success: false,
      recipient: params.recipient,
      error: error?.message || 'Failed to send Telegram message',
    };
  }
}
