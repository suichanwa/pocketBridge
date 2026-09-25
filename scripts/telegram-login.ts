import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import qrcode from 'qrcode-terminal';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log('========================================================');
  console.log('📱 PocketBridge Telegram Login Setup');
  console.log('========================================================');
  console.log('Choose your preferred login method:');
  console.log('  [1] 📷 QR Code (Fastest — scan with Telegram app on phone)');
  console.log('  [2] 📱 Phone Number & SMS/Telegram Code');
  console.log('========================================================');

  const choice = (await rl.question('Select [1 or 2] (default: 1): ')).trim() || '1';

  const apiId = process.env.TELEGRAM_API_ID?.trim() || '25155888';
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() || '484b1cea80205261e606b913bd88c339';

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, Number(apiId), apiHash, {
    connectionRetries: 5,
    deviceModel: 'MacBook Pro',
    systemVersion: 'macOS Sequoia',
    appVersion: '1.0.0',
  });

  await client.connect();

  const envPath = path.resolve(process.cwd(), '.env');
  const saveSession = async (sessionStr: string) => {
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

    updateEnvKey('TELEGRAM_API_ID', apiId);
    updateEnvKey('TELEGRAM_API_HASH', apiHash);
    updateEnvKey('TELEGRAM_SESSION', sessionStr);

    await fs.writeFile(envPath, envContent.trim() + '\n', 'utf-8');
    console.log('\n✅ Saved TELEGRAM_SESSION securely to .env!');
  };

  if (choice === '1') {
    console.log('\n========================================================');
    console.log('📷 Scan the QR code below using Telegram on your phone:');
    console.log('👉 Open Telegram ➔ Settings ➔ Devices ➔ Link Desktop Device');
    console.log('========================================================\n');

    try {
      const user = await client.signInUserWithQrCode(
        { apiId: Number(apiId), apiHash },
        {
          qrCode: async ({ token }) => {
            const base64Url = Buffer.from(token).toString('base64url');
            const loginUrl = `tg://login?token=${base64Url}`;
            console.log('\nScan this QR code:');
            qrcode.generate(loginUrl, { small: true });
            console.log('(Scan with Telegram: Settings ➔ Devices ➔ Link Desktop Device)\n');
          },
          password: async () => {
            return await rl.question('Enter your Telegram 2FA Cloud Password: ');
          },
          onError: async (err) => {
            console.error('QR Login error:', err?.message || err);
            return false;
          },
        }
      );

      console.log(`\n🎉 Logged in successfully as: ${(user as any)?.firstName || 'Telegram User'} (@${(user as any)?.username || 'no-username'})!`);
      const sessionString = client.session.save() as unknown as string;
      await saveSession(sessionString);
    } catch (err: any) {
      console.error('\n❌ QR Login failed:', err?.message || err);
      rl.close();
      await client.disconnect();
      process.exit(1);
    }
  } else {
    try {
      await client.start({
        phoneNumber: async () => await rl.question('\nEnter your Telegram phone number (e.g. +37368627780): '),
        password: async () => await rl.question('Enter your Telegram 2FA password (leave empty if none): '),
        phoneCode: async () => await rl.question('Enter the 5-digit verification code sent to your Telegram app: '),
        onError: (err) => console.error('Telegram error:', err),
      });

      const me: any = await client.getMe();
      console.log(`\n🎉 Logged in successfully as: ${me?.firstName || ''} (@${me?.username || 'no-username'})!`);
      const sessionString = client.session.save() as unknown as string;
      await saveSession(sessionString);
    } catch (err: any) {
      console.error('\n❌ Phone Login failed:', err?.message || err);
      rl.close();
      await client.disconnect();
      process.exit(1);
    }
  }

  console.log('\nPocketBridge is now connected to Telegram!');
  console.log('Try sending:');
  console.log('  - In PocketBridge: /tg me Hello from my Mac!');
  console.log('  - In PocketBridge: /tg @Jhominamssz test\n');

  rl.close();
  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err);
  process.exit(1);
});
