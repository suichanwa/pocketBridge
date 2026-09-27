import { spawn } from 'node:child_process';

export interface AgyTaskOptions {
  prompt: string;
  model?: string;
  cwd?: string;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  conversationId?: string;
  onChunk?: (chunk: string) => void;
  onConversationId?: (conversationId: string) => void;
}

export interface AgyTaskResult {
  prompt: string;
  model: string;
  output: string;
  exitCode: number;
  durationMs: number;
  conversationId?: string;
}

/**
 * Runs an autonomous task via Google Antigravity CLI (`agy`) with
 * auto-approved tool permissions (--dangerously-skip-permissions)
 * using streaming JSON (--output-format stream-json).
 *
 * Implements an activity-based heartbeat timer so active tasks will
 * never time out as long as progress/output continues.
 *
 * NOTE: Never pass `-c`. `-c` resumes stale global sessions which can
 * have thousands of messages and cause extreme hangs/timeouts.
 * Instead, pass an explicit `--conversation <id>` or start fresh.
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
    '--output-format',
    'stream-json',
  ];

  if (options.conversationId) {
    args.push('--conversation', options.conversationId);
  }

  args.push('-p', options.prompt);

  return new Promise((resolve) => {
    let idleTimer: NodeJS.Timeout | null = null;
    let maxTimer: NodeJS.Timeout | null = null;
    let finished = false;

    let stdoutBuffer = '';
    let capturedConversationId: string | undefined = options.conversationId;
    let finalResponse = '';
    let rawOutputFallback = '';
    let combinedErrorOutput = '';

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

      if (stdoutBuffer.trim()) {
        processLine(stdoutBuffer);
        stdoutBuffer = '';
      }

      let output = (finalResponse || rawOutputFallback).trim();
      if (!output && combinedErrorOutput.trim()) {
        output = combinedErrorOutput.trim();
      }
      if (errorMsg) {
        output += (output ? '\n' : '') + errorMsg;
      }

      const durationMs = Date.now() - startTime;
      resolve({
        prompt: options.prompt,
        model,
        output: output || '(No output produced)',
        exitCode,
        durationMs,
        conversationId: capturedConversationId,
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

    const processLine = (line: string) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      try {
        const parsed = JSON.parse(trimmedLine);
        const convId = parsed.conversation_id || parsed.init?.conversation_id || parsed.result?.conversation_id;
        if (convId && !capturedConversationId) {
          capturedConversationId = convId;
          if (options.onConversationId) {
            options.onConversationId(convId);
          }
        }

        if (parsed.event === 'step_update') {
          const update = parsed.step_update;
          if (update?.text_delta) {
            finalResponse += update.text_delta;
            if (options.onChunk) {
              options.onChunk(update.text_delta);
            }
          } else if (update?.step_type === 'tool' && update?.state === 'ACTIVE') {
            const toolName = update.tool_name || update.tool_info?.name || 'tool';
            const toolNotice = `\n[Executing ${toolName}...]\n`;
            if (options.onChunk) {
              options.onChunk(toolNotice);
            }
          }
        } else if (parsed.event === 'result') {
          const result = parsed.result;
          if (result?.response) {
            finalResponse = result.response;
          }
          if (result?.conversation_id && !capturedConversationId) {
            capturedConversationId = result.conversation_id;
            if (options.onConversationId) {
              options.onConversationId(result.conversation_id);
            }
          }
        }
      } catch {
        // Plain text fallback (e.g. non-JSON logs, warnings)
        rawOutputFallback += trimmedLine + '\n';
        if (options.onChunk) {
          options.onChunk(trimmedLine + '\n');
        }
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      resetIdleTimer();
      stdoutBuffer += text;

      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      resetIdleTimer();
      // Only capture if not an informational warning
      if (!text.includes('warning: conversation')) {
        combinedErrorOutput += text;
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
