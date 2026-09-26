#!/usr/bin/env npx tsx
import 'dotenv/config';
import { sendTelegramMessage } from '../src/server/tools/telegram.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/send-telegram.ts <recipient> <message> [mediaPath1] [mediaPath2]...');
    console.error('Examples:');
    console.error('  npx tsx scripts/send-telegram.ts @victormicu "Hello from Mac!"');
    console.error('  npx tsx scripts/send-telegram.ts me "Screen snapshot" captures/shot-123.png');
    process.exit(1);
  }

  const recipient = args[0].trim();
  const message = args[1].trim();
  const mediaPaths = args.slice(2);

  try {
    const res = await sendTelegramMessage({
      recipient,
      message,
      mediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    });

    if (res.success) {
      console.log(`Telegram message sent successfully to ${res.recipient}!`);
      if (res.messageId) console.log(`Message ID: ${res.messageId}`);
      if (mediaPaths.length > 0) console.log(`Attachments: ${mediaPaths.join(', ')}`);
      process.exit(0);
    } else {
      console.error(`Failed to send Telegram message: ${res.error}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Telegram error:`, err?.message || err);
    process.exit(1);
  }
}

main();
