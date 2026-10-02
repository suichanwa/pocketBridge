import { execa } from 'execa';
import os from 'node:os';
import { Type } from '@google/genai';
import type { AgentTool } from './registry.js';

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
  const timeoutMs =
    options.timeoutMs !== undefined
      ? options.timeoutMs
      : Number(process.env.SHELL_TIMEOUT_MS) || 600_000; // 10 min default timeout for builds/tests
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

export const executeCommandTool: AgentTool<{ command: string; cwd?: string }, ShellExecResult> = {
  name: 'execute_command',
  description:
    'Runs a zsh shell command on the Mac. Use this to run git commands (git status, pull, diff, commit), test apps (npm test, pytest), check files, or control processes.',
  category: 'shell',
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: {
        type: Type.STRING,
        description: 'The shell command to run (e.g. "git status", "npm test", "curl ...")',
      },
      cwd: {
        type: Type.STRING,
        description: 'Working directory to run the command in. Defaults to the user workspace or home.',
      },
    },
    required: ['command'],
  },
  execute: async (args, ctx) => {
    const cmd = String(args?.command || '');
    const cwd = args?.cwd ? String(args.cwd) : ctx.workspaceDir;
    return await executeShellCommand(cmd, {
      cwd,
      onChunk: ctx.onStreamChunk,
    });
  },
};
