import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import qrcode from 'qrcode-terminal';

const binPath = path.resolve(process.cwd(), 'bin/cloudflared');

if (!fs.existsSync(binPath)) {
  console.error('Error: cloudflared binary not found at ./bin/cloudflared.');
  process.exit(1);
}

let activeProc: ReturnType<typeof spawn> | null = null;
let isShuttingDown = false;

function launchTunnel() {
  if (isShuttingDown) return;

  console.log('Starting secure Cloudflare HTTPS Tunnel for PocketBridge (port 3000)...');
  let urlFound = false;

  const proc = spawn(binPath, ['tunnel', '--url', 'http://localhost:3000'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeProc = proc;

  const onData = (data: Buffer) => {
    const text = data.toString();
    if (!urlFound) {
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        urlFound = true;
        const tunnelUrl = match[0];
        try {
          fs.writeFileSync(path.resolve(process.cwd(), '.tunnel-url'), tunnelUrl, 'utf-8');
        } catch {
          // ignore write errors
        }
        console.log('\n========================================================');
        console.log('TRUSTED HTTPS LINK READY');
        console.log(`Secure URL: ${tunnelUrl}`);
        console.log('========================================================');
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
    activeProc = null;
    if (!isShuttingDown) {
      console.log('Reconnecting Cloudflare tunnel in 5 seconds...');
      setTimeout(launchTunnel, 5000);
    }
  });
}

launchTunnel();

process.on('SIGINT', () => {
  isShuttingDown = true;
  activeProc?.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  isShuttingDown = true;
  activeProc?.kill('SIGTERM');
  process.exit(0);
});
