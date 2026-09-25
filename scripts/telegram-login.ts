import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log('========================================================');
  console.log('📱 PocketBridge Telegram One-Time Login Setup');
  console.log('========================================================');
  console.log('This links your Telegram account so PocketBridge can:');
  console.log('  1. Send messages to YOU (via "Saved Messages")');
  console.log('  2. Send messages to your contacts or groups (@username or phone)');
  console.log('========================================================\n');

  let apiId = process.env.TELEGRAM_API_ID?.trim();
  let apiHash = process.env.TELEGRAM_API_HASH?.trim();

  if (!apiId) {
    console.log('Step 1: Get free API credentials from https://my.telegram.org (App Configuration)');
    apiId = await rl.question('Enter your Telegram API ID: ');
  } else {
    console.log(`Using existing API ID: ${apiId}`);
  }

  if (!apiHash) {
    apiHash = await rl.question('Enter your Telegram API Hash: ');
  } else {
    console.log('Using existing API Hash.');
  }

  const stringSession = new StringSession(process.env.TELEGRAM_SESSION || '');
  const client = new TelegramClient(stringSession, Number(apiId.trim()), apiHash.trim(), {
    connectionRetries: 5,
  });

  console.log('\nConnecting to Telegram servers...');
  await client.start({
    phoneNumber: async () => await rl.question('\nEnter your Telegram phone number with country code (e.g. +1234567890): '),
    password: async () => await rl.question('Enter your 2FA Cloud Password (press Enter if you do not have 2FA): '),
    phoneCode: async () => await rl.question('Enter the verification code sent to your Telegram app: '),
    onError: (err) => console.error('Telegram error:', err),
  });

  console.log('\n🎉 Successfully logged in to Telegram!');

  const me: any = await client.getMe();
  console.log(`Connected Account: ${me?.firstName || ''} ${me?.lastName || ''} (@${me?.username || 'no-username'})`);

  const sessionString = client.session.save() as unknown as string;

  // Persist into .env
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

  updateEnvKey('TELEGRAM_API_ID', apiId.trim());
  updateEnvKey('TELEGRAM_API_HASH', apiHash.trim());
  updateEnvKey('TELEGRAM_SESSION', sessionString);

  await fs.writeFile(envPath, envContent.trim() + '\n', 'utf-8');
  console.log('✅ Saved TELEGRAM_SESSION to .env!');
  console.log('\nYou are all set! You can now use:');
  console.log('  - PocketBridge Chat: "/tg me Hello from my Mac!"');
  console.log('  - PocketBridge Chat: "/tg @contact Hey!"');
  console.log('  - AI Prompts: "Send a Telegram message to @alice saying I\'ll be there in 5 min"\n');

  rl.close();
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Telegram setup error:', err);
  process.exit(1);
});
