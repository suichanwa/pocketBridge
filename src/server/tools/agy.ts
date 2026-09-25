import { spawn } from 'node:child_process';
import os from 'node:os';

export interface AgyTaskOptions {
  prompt: string;
  model?: string;
  cwd?: string;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
}

export interface AgyTaskResult {
  prompt: string;
  model: string;
  output: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Runs an autonomous task via Google Antigravity CLI (`agy`) with
 * auto-approved tool permissions (--dangerously-skip-permissions)
 * and cutting-edge Gemini 3.8 Flash High (or other selected model).
 */
export async function runAgyTask(options: AgyTaskOptions): Promise<AgyTaskResult> {
  const model = options.model || 'gemini-3.8-flash-high';
  const cwd = options.cwd || process.env.WORKSPACE_ROOT || os.homedir();
  const timeoutMs = options.timeoutMs || 300_000; // 5 min default timeout for deep tasks
  const startTime = Date.now();

  const args = [
    '--model',
    model,
    '--dangerously-skip-permissions',
    '-p',
    options.prompt,
  ];

  let combinedOutput = '';

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    let finished = false;

    const child = spawn('agy', args, {
      cwd,
      env: {
        ...process.env,
        PAGER: 'cat',
        FORCE_COLOR: '0',
      },
    });

    const finish = (exitCode: number, errorMsg?: string) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);

      if (errorMsg) {
        combinedOutput += (combinedOutput ? '\n' : '') + errorMsg;
      }

      const durationMs = Date.now() - startTime;
      resolve({
        prompt: options.prompt,
        model,
        output: combinedOutput.trim(),
        exitCode,
        durationMs,
      });
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(124, `\n[AGY] Task timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }, timeoutMs);
    }

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      combinedOutput += text;
      if (options.onChunk) {
        options.onChunk(text);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      // Some progress spinners or status logs go to stderr; capture if not pure ANSI noise
      combinedOutput += text;
      if (options.onChunk) {
        options.onChunk(text);
      }
    });

    child.on('error', (err: Error) => {
      finish(1, `[AGY] Failed to spawn agy process: ${err.message}`);
    });

    child.on('close', (code: number | null) => {
      finish(code ?? 0);
    });
  });
}
