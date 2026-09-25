import { GoogleGenAI, Type } from '@google/genai';
import { takeMacScreenshot } from './tools/screenshot.js';
import { takeCameraPhoto } from './tools/camera.js';
import { executeShellCommand } from './tools/shell.js';
import { searchWeb } from './tools/search.js';
import { sendTelegramMessage } from './tools/telegram.js';
import type { ChatMessage, ToolCallRecord, TerminalLog } from '../shared/types.js';

export interface AgentCallbacks {
  onUpdateMessage: (messageId: string, partial: Partial<ChatMessage>) => void;
  onTerminalLog: (log: TerminalLog) => void;
  onTerminalChunk: (logId: string, chunk: string, exitCode?: number) => void;
  onScreenshotReady: (url: string) => void;
}

// Function declarations for Gemini Tool Calling
const agentToolDeclarations = [
  {
    name: 'take_screenshot',
    description: 'Takes a real-time screenshot of the Mac screen/running apps and returns the image URL so the user can view it on their phone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        windowOnly: {
          type: Type.BOOLEAN,
          description: 'If true, captures the active frontmost window instead of the entire screen.',
        },
      },
    },
  },
  {
    name: 'take_camera_photo',
    description: "Snaps a real photo using the Mac's FaceTime HD / webcam camera so the user can see what is in front of the laptop.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'execute_command',
    description: 'Runs a zsh shell command on the Mac. Use this to run git commands (git status, pull, diff, commit), test apps (npm test, pytest), check files, or control processes.',
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
  },
  {
    name: 'search_web',
    description: 'Searches Google / the web for information, documentation, error solutions, or current news.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query string',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_telegram_message',
    description: 'Sends a Telegram message to a person or group using your Telegram credentials.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient: {
          type: Type.STRING,
          description: 'Username (@username), phone number, or chat ID',
        },
        message: {
          type: Type.STRING,
          description: 'The message text to send',
        },
      },
      required: ['recipient', 'message'],
    },
  },
];

export class PocketAgent {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
  }

  public updateApiKey(key: string) {
    this.apiKey = key;
  }

  public hasKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Main entry point to process a user prompt.
   */
  public async handleUserMessage(
    userText: string,
    history: ChatMessage[],
    assistantMessageId: string,
    callbacks: AgentCallbacks
  ): Promise<string> {
    const trimmed = userText.trim();

    // 1. Check for quick slash commands (for instant offline responses / shortcuts)
    if (trimmed.startsWith('/screenshot')) {
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'thinking',
        content: 'Capturing Mac screen...',
      });
      const shot = await takeMacScreenshot();
      callbacks.onScreenshotReady(shot.publicUrl);
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: `Captured Mac screen at ${new Date(shot.timestamp).toLocaleTimeString()}.`,
        screenshotUrl: shot.publicUrl,
      });
      return `Captured Mac screen: ${shot.publicUrl}`;
    }

    if (trimmed.startsWith('/camera') || trimmed.startsWith('/photo')) {
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'thinking',
        content: 'Snapping photo from Mac FaceTime camera...',
      });
      const photo = await takeCameraPhoto();
      callbacks.onScreenshotReady(photo.publicUrl);
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: `📸 **Captured photo from Mac camera** at ${new Date(photo.timestamp).toLocaleTimeString()}:`,
        screenshotUrl: photo.publicUrl,
      });
      return `Captured photo from Mac camera: ${photo.publicUrl}`;
    }

    if (trimmed.startsWith('/git')) {
      const gitCmd = trimmed.replace(/^\/git\s*/, '') || 'status';
      const logId = `term-${Date.now()}`;
      callbacks.onTerminalLog({
        id: logId,
        command: `git ${gitCmd}`,
        output: '',
        status: 'running',
        timestamp: Date.now(),
      });
      const res = await executeShellCommand(`git ${gitCmd}`, {
        onChunk: (chunk) => callbacks.onTerminalChunk(logId, chunk),
      });
      callbacks.onTerminalChunk(logId, '', res.exitCode);
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: `Executed \`git ${gitCmd}\` (exit code ${res.exitCode}):\n\`\`\`bash\n${res.output.trim()}\n\`\`\``,
      });
      return res.output;
    }

    if (trimmed.startsWith('/sh ')) {
      const cmd = trimmed.substring(4);
      const logId = `term-${Date.now()}`;
      callbacks.onTerminalLog({
        id: logId,
        command: cmd,
        output: '',
        status: 'running',
        timestamp: Date.now(),
      });
      const res = await executeShellCommand(cmd, {
        onChunk: (chunk) => callbacks.onTerminalChunk(logId, chunk),
      });
      callbacks.onTerminalChunk(logId, '', res.exitCode);
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: `Executed \`${cmd}\` (exit code ${res.exitCode}):\n\`\`\`bash\n${res.output.trim()}\n\`\`\``,
      });
      return res.output;
    }

    if (trimmed === '/system' || trimmed === '/sys') {
      const res = await executeShellCommand('pmset -g batt; uptime');
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: `💻 **Mac System Status**:\n\`\`\`bash\n${res.output.trim()}\n\`\`\``,
      });
      return res.output;
    }

    // 2. If no Gemini API Key is configured yet, guide the user
    if (!this.hasKey()) {
      const msg =
        "🔑 **PocketBridge is ready!**\n\nTo enable full autonomous AI actions (natural language tool execution, testing apps, web searches, and auto-screenshots), please enter your **Gemini API Key** in the **Settings** modal.\n\n*In the meantime, you can test immediate direct commands:*\n- `/screenshot` — Grab live desktop screenshot\n- `/git status` — Run git commands\n- `/sh <command>` — Run any terminal command directly";
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: msg,
      });
      return msg;
    }

    // 3. Run Gemini 2.5 Flash with tool calling loop
    callbacks.onUpdateMessage(assistantMessageId, {
      status: 'thinking',
      content: 'Thinking...',
    });

    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const model = 'gemini-flash-latest';

      // Build conversation contents for Gemini
      const conversationContents: any[] = [];

      // Add recent history context (up to last 10 messages)
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === 'user') {
          conversationContents.push({
            role: 'user',
            parts: [{ text: msg.content }],
          });
        } else if (msg.role === 'assistant' && msg.content) {
          conversationContents.push({
            role: 'model',
            parts: [{ text: msg.content }],
          });
        }
      }

      // Add current user prompt
      conversationContents.push({
        role: 'user',
        parts: [{ text: userText }],
      });

      const systemInstruction = `You are PocketBridge, the autonomous AI assistant running on this Mac laptop.
The user is controlling you from their mobile phone or remote computer.
Your job is to assist them with:
- Testing and running apps (using execute_command)
- Taking screenshots of the desktop or apps and returning them so the user can inspect them on their phone (using take_screenshot)
- Checking and using GitHub (git status, commit, pull, branch, etc. using execute_command)
- Searching the web for documentation, solutions, and updates (using search_web)
- Sending Telegram messages to other people (using send_telegram_message)

Guidelines:
1. Always be concise, helpful, and direct.
2. Whenever the user asks to "show me", "check the screen", "see what is running", or after launching a GUI app, call take_screenshot!
3. Format output cleanly in Markdown.
4. Execute tests and check exit codes carefully.
`;

      const candidateModels = ['gemini-flash-latest', 'gemini-3.7-flash', 'gemini-3.8-flash'];

      const generateWithFallback = async (contents: any[]) => {
        let lastErr: any = null;
        for (const m of candidateModels) {
          try {
            return await ai.models.generateContent({
              model: m,
              contents,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations: agentToolDeclarations as any }],
              },
            });
          } catch (err: any) {
            lastErr = err;
            if (err?.status === 503 || err?.status === 429 || err?.status === 404) {
              console.warn(`Model ${m} returned ${err.status}, trying fallback model...`);
              continue;
            }
            throw err;
          }
        }
        throw lastErr;
      };

      const toolRecords: ToolCallRecord[] = [];
      let latestScreenshotUrl: string | undefined = undefined;

      // Iterative function execution loop (up to 5 turns)
      let currentIteration = 0;
      const MAX_ITERATIONS = 5;

      while (currentIteration < MAX_ITERATIONS) {
        currentIteration++;

        const response = await generateWithFallback(conversationContents);

        const candidate = response.candidates?.[0];
        const functionCalls = candidate?.content?.parts?.filter(
          (part: any) => part.functionCall
        );

        // If there are no function calls, we have the final assistant answer!
        if (!functionCalls || functionCalls.length === 0) {
          const finalText = response.text || 'Done.';
          callbacks.onUpdateMessage(assistantMessageId, {
            status: 'done',
            content: finalText,
            toolCalls: toolRecords.length > 0 ? toolRecords : undefined,
            screenshotUrl: latestScreenshotUrl,
          });
          return finalText;
        }

        // Add model's functionCall turn to contents
        conversationContents.push(candidate.content);

        // Execute each function call
        const functionResponseParts: any[] = [];

        for (const part of functionCalls) {
          const call = part.functionCall;
          const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const record: ToolCallRecord = {
            id: callId,
            name: call.name,
            args: call.args || {},
            status: 'running',
            startedAt: Date.now(),
          };
          toolRecords.push(record);

          callbacks.onUpdateMessage(assistantMessageId, {
            status: 'thinking',
            content: `Running tool: **${call.name}**...`,
            toolCalls: [...toolRecords],
          });

          let functionResult: any;

          try {
            if (call.name === 'take_screenshot') {
              const shot = await takeMacScreenshot({
                windowOnly: Boolean(call.args?.windowOnly),
              });
              latestScreenshotUrl = shot.publicUrl;
              callbacks.onScreenshotReady(shot.publicUrl);
              functionResult = {
                status: 'success',
                message: 'Screenshot captured successfully',
                url: shot.publicUrl,
                timestamp: shot.timestamp,
              };
            } else if (call.name === 'take_camera_photo') {
              const photo = await takeCameraPhoto();
              latestScreenshotUrl = photo.publicUrl;
              callbacks.onScreenshotReady(photo.publicUrl);
              functionResult = {
                status: 'success',
                message: 'Camera photo snapped successfully',
                url: photo.publicUrl,
                timestamp: photo.timestamp,
              };
            } else if (call.name === 'execute_command') {
              const cmd = String(call.args?.command || '');
              const cwd = call.args?.cwd ? String(call.args.cwd) : undefined;
              const logId = `term-${Date.now()}`;

              callbacks.onTerminalLog({
                id: logId,
                command: cmd,
                output: '',
                status: 'running',
                timestamp: Date.now(),
              });

              const res = await executeShellCommand(cmd, {
                cwd,
                onChunk: (chunk) => callbacks.onTerminalChunk(logId, chunk),
              });

              callbacks.onTerminalChunk(logId, '', res.exitCode);
              functionResult = {
                command: cmd,
                exitCode: res.exitCode,
                output: res.output,
                durationMs: res.durationMs,
              };
            } else if (call.name === 'search_web') {
              const query = String(call.args?.query || '');
              const searchResults = await searchWeb(query);
              functionResult = {
                query,
                results: searchResults,
              };
            } else if (call.name === 'send_telegram_message') {
              const recipient = String(call.args?.recipient || '');
              const message = String(call.args?.message || '');
              const tgRes = await sendTelegramMessage({ recipient, message });
              functionResult = tgRes;
            } else {
              functionResult = { error: `Unknown tool: ${call.name}` };
            }

            record.status = 'success';
            record.result = functionResult;
            record.completedAt = Date.now();
          } catch (toolError: any) {
            record.status = 'failed';
            record.error = toolError?.message || 'Tool execution failed';
            record.completedAt = Date.now();
            functionResult = { error: record.error };
          }

          functionResponseParts.push({
            functionResponse: {
              name: call.name,
              response: { output: functionResult },
            },
          });
        }

        // Push tool execution results back to conversation
        conversationContents.push({
          role: 'user',
          parts: functionResponseParts,
        });

        callbacks.onUpdateMessage(assistantMessageId, {
          toolCalls: [...toolRecords],
          screenshotUrl: latestScreenshotUrl,
        });
      }

      const finalFallback = 'Completed all requested tool actions.';
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: finalFallback,
        toolCalls: toolRecords,
        screenshotUrl: latestScreenshotUrl,
      });
      return finalFallback;
    } catch (err: any) {
      console.error('Gemini Agent Error:', err);
      const errMessage = `⚠️ Error during agent execution: ${err?.message || 'Unknown error'}`;
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'error',
        content: errMessage,
      });
      return errMessage;
    }
  }
}
