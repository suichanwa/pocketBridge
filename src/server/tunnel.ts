import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

let activeTunnelUrl: string | undefined;
let tunnelProcess: ChildProcess | null = null;
const TUNNEL_FILE = path.resolve(process.cwd(), '.tunnel-url');

export function getTunnelUrl(): string | undefined {
  if (activeTunnelUrl) return activeTunnelUrl;
  if (fs.existsSync(TUNNEL_FILE)) {
    try {
      const saved = fs.readFileSync(TUNNEL_FILE, 'utf-8').trim();
      if (saved.startsWith('https://')) {
        activeTunnelUrl = saved;
        return activeTunnelUrl;
      }
    } catch {}
  }
  return undefined;
}

function findCloudflaredBinary(): string | null {
  const localBin = path.resolve(process.cwd(), 'bin/cloudflared');
  if (fs.existsSync(localBin)) return localBin;

  const possiblePaths = [
    '/usr/local/bin/cloudflared',
    '/opt/homebrew/bin/cloudflared',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function startTunnel(port: number, onUrlReady?: (url: string) => void): Promise<string> {
  const binPath = findCloudflaredBinary();
  if (!binPath) {
    console.warn('[Tunnel] cloudflared binary not found; skipping embedded tunnel.');
    return '';
  }

  if (activeTunnelUrl) {
    onUrlReady?.(activeTunnelUrl);
    return activeTunnelUrl;
  }

  return new Promise<string>((resolve) => {
    let resolved = false;

    const launch = () => {
      const proc = spawn(binPath, ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      tunnelProcess = proc;

      const onData = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          activeTunnelUrl = match[0];
          try {
            fs.writeFileSync(TUNNEL_FILE, activeTunnelUrl, 'utf-8');
          } catch {}
          onUrlReady?.(activeTunnelUrl);
          resolve(activeTunnelUrl);
        }
      };

      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);

      proc.on('close', (code) => {
        tunnelProcess = null;
        if (!resolved) {
          resolve('');
        }
      });
    };

    launch();
  });
}
