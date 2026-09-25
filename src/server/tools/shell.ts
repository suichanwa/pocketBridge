import { execa } from 'execa';
import os from 'node:os';

export interface ShellExecOptions {
  cwd?: string;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
}

export interface ShellExecResult {
  command: string;
  output: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Runs a zsh command on macOS, streaming chunks to onChunk if provided.
 */
export async function executeShellCommand(
  command: string,
  options: ShellExecOptions = {}
): Promise<ShellExecResult> {
  const cwd = options.cwd || os.homedir();
  const timeoutMs = options.timeoutMs || 120_000; // 2 min default timeout
  const startTime = Date.now();

  let combinedOutput = '';

  try {
    // Run using macOS zsh login shell to ensure user's environment/paths (PATH, nvm/fnm, git) are loaded
    const subprocess = execa('/bin/zsh', ['-l', '-c', command], {
      cwd,
      timeout: timeoutMs,
      all: true,
      env: {
        ...process.env,
        PAGER: 'cat',
        FORCE_COLOR: '0',
      },
    });

    if (subprocess.all) {
      subprocess.all.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        combinedOutput += text;
        if (options.onChunk) {
          options.onChunk(text);
        }
      });
    }

    const result = await subprocess;
    const durationMs = Date.now() - startTime;

    return {
      command,
      output: combinedOutput || result.all || '',
      exitCode: result.exitCode ?? 0,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const finalOutput = combinedOutput || error?.all || error?.message || 'Command execution failed';
    return {
      command,
      output: finalOutput,
      exitCode: error?.exitCode ?? 1,
      durationMs,
    };
  }
}
