import { spawn } from 'node:child_process';
import os from 'node:os';

export interface AgyTaskOptions {
  prompt: string;
  model?: string;
  cwd?: string;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  continueSession?: boolean;
  conversationId?: string;
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
 *
 * Implements an activity-based heartbeat timer so active tasks (running builds,
 * tests, git operations, or streaming reasoning) will never time out as long
 * as progress/output continues.
 */
export async function runAgyTask(options: AgyTaskOptions): Promise<AgyTaskResult> {
  const model = options.model || 'gemini-3.8-flash-high';
  const cwd = options.cwd || process.env.WORKSPACE_ROOT || process.cwd();
  // 30 min maximum wall-clock ceiling (or configured via AGY_MAX_TIMEOUT_MS, 0 = unlimited)
  const maxTimeoutMs =
    options.timeoutMs !== undefined
      ? options.timeoutMs
      : Number(process.env.AGY_MAX_TIMEOUT_MS) || 1_800_000;
  // 5 min sliding inactivity timeout (only triggers if total silence with no output)
  const idleTimeoutMs =
    options.idleTimeoutMs !== undefined
      ? options.idleTimeoutMs
      : Number(process.env.AGY_IDLE_TIMEOUT_MS) || 300_000;

  const startTime = Date.now();

  const args = [
    '--model',
    model,
    '--dangerously-skip-permissions',
  ];

  if (options.conversationId) {
    args.push('--conversation', options.conversationId);
  } else if (options.continueSession) {
    args.push('-c');
  }

  args.push('-p', options.prompt);

  let combinedOutput = '';

  return new Promise((resolve) => {
    let idleTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;
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
      if (idleTimer) clearTimeout(idleTimer);
      if (maxTimer) clearTimeout(maxTimer);

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

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (idleTimeoutMs > 0 && !finished) {
        idleTimer = setTimeout(() => {
          try {
            child.kill('SIGTERM');
            setTimeout(() => {
              try { child.kill('SIGKILL'); } catch {}
            }, 3000);
          } catch {}
          finish(
            124,
            `\n[AGY] Task hung (no output for ${Math.round(idleTimeoutMs / 1000)} seconds). Terminated.`
          );
        }, idleTimeoutMs);
      }
    };

    // Start initial idle timer
    resetIdleTimer();

    // Start maximum execution ceiling timer if configured
    if (maxTimeoutMs > 0) {
      maxTimer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
          }, 3000);
        } catch {}
        finish(
          124,
          `\n[AGY] Task reached maximum execution limit of ${Math.round(maxTimeoutMs / 1000)} seconds.`
        );
      }, maxTimeoutMs);
    }

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      combinedOutput += text;
      resetIdleTimer();
      if (options.onChunk) {
        options.onChunk(text);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      combinedOutput += text;
      resetIdleTimer();
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
