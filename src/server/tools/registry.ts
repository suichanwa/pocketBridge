import type { FunctionDeclaration } from '@google/genai';
import { executeCommandTool } from './shell.js';
import { takeScreenshotTool } from './screenshot.js';
import { takeCameraPhotoTool } from './camera.js';
import { cursorTools } from './cursor.js';
import { searchWebTool } from './search.js';
import { speakAloudTool } from './speech.js';
import { sendTelegramTool } from './telegram.js';
import { runAgyTaskTool } from './agy.js';

export interface ToolContext {
  sessionId: string;
  workspaceDir: string;
  abortSignal?: AbortSignal;
  onStreamChunk?: (chunk: string) => void;
  conversationId?: string;
  onConversationId?: (id: string) => void;
}

export interface AgentTool<TArgs = any, TResult = any> {
  name: string;
  description: string;
  category: 'gui' | 'shell' | 'system' | 'delegation' | 'network';
  parameters: FunctionDeclaration['parameters'];
  execute: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}

export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  public register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  public registerAll(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  public get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  public getDeclarations(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  public async execute(name: string, args: any, ctx: ToolContext): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found in registry: "${name}"`);
    }

    const timeoutMs = Number(process.env.TOOL_TIMEOUT_MS) || 600_000;
    const startTime = Date.now();
    let timer: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Tool "${name}" execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const abortPromise = ctx.abortSignal
        ? new Promise<never>((_, reject) => {
            if (ctx.abortSignal?.aborted) {
              reject(new Error(`Tool "${name}" execution was aborted`));
              return;
            }
            abortListener = () => {
              reject(new Error(`Tool "${name}" execution was aborted`));
            };
            ctx.abortSignal?.addEventListener('abort', abortListener, { once: true });
          })
        : null;

      const races: Promise<any>[] = [tool.execute(args, ctx), timeoutPromise];
      if (abortPromise) {
        races.push(abortPromise);
      }

      return await Promise.race(races);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(`Tool execution error for "${name}" (${durationMs}ms):`, error?.message || error);
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      if (abortListener && ctx.abortSignal) {
        ctx.abortSignal.removeEventListener('abort', abortListener);
      }
    }
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(takeScreenshotTool);
  registry.register(takeCameraPhotoTool);
  registry.registerAll(cursorTools);
  registry.register(executeCommandTool);
  registry.register(searchWebTool);
  registry.register(sendTelegramTool);
  registry.register(speakAloudTool);
  registry.register(runAgyTaskTool);
  return registry;
}
