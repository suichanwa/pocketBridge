import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import qrcode from 'qrcode-terminal';

const binPath = path.resolve(process.cwd(), 'bin/cloudflared');

if (!fs.existsSync(binPath)) {
  console.error('Error: cloudflared binary not found at ./bin/cloudflared.');
  process.exit(1);
}

console.log('Starting secure Cloudflare HTTPS Tunnel for PocketBridge (port 3000)...');

const proc = spawn(binPath, ['tunnel', '--url', 'http://localhost:3000'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let urlFound = false;

const onData = (data: Buffer) => {
  const text = data.toString();
  if (!urlFound) {
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      urlFound = true;
      const tunnelUrl = match[0];
      console.log('\n========================================================');
      console.log('TRUSTED HTTPS LINK READY');
      console.log(`Secure URL: ${tunnelUrl}`);
      console.log('========================================================');
      console.log('Scan with your Phone Camera to open:');
      qrcode.generate(tunnelUrl, { small: true });
      console.log('========================================================');
      console.log('- Trusted SSL Padlock enabled');
      console.log('- Phone Microphone & Voice Input enabled');
      console.log('- Works from anywhere on Wi-Fi or Cellular');
      console.log('========================================================\n');
    }
  }
};

proc.stdout?.on('data', onData);
proc.stderr?.on('data', onData);

proc.on('close', (code) => {
  console.log(`Cloudflare tunnel closed (exit code ${code}).`);
});

process.on('SIGINT', () => {
  proc.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  proc.kill('SIGTERM');
  process.exit(0);
});
