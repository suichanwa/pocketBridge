import { GoogleGenAI, Type } from '@google/genai';
import { takeMacScreenshot } from './tools/screenshot.js';
import { takeCameraPhoto } from './tools/camera.js';
import { executeShellCommand } from './tools/shell.js';
import { searchWeb } from './tools/search.js';
import { sendTelegramMessage } from './tools/telegram.js';
import { speakAloud } from './tools/speech.js';
import { runAgyTask } from './tools/agy.js';
import {
  mouseClick,
  mouseMove,
  mouseDrag,
  typeText,
  pressKey,
  hotkey,
  openApp,
  getDisplayDimensions,
} from './tools/cursor.js';
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
    name: 'mouse_click',
    description: 'Clicks the mouse at specific screen coordinates (x, y). The main MacBook display resolution is 1440 x 900 points.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate in points (0 to 1440)' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate in points (0 to 900)' },
        button: { type: Type.STRING, enum: ['left', 'right'], description: 'Mouse button to click (default left)' },
        doubleClick: { type: Type.BOOLEAN, description: 'Set true to double-click' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'mouse_move',
    description: 'Moves the mouse cursor to specific coordinates (x, y) without clicking.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Horizontal coordinate in points (0 to 1440)' },
        y: { type: Type.NUMBER, description: 'Vertical coordinate in points (0 to 900)' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'mouse_drag',
    description: 'Clicks and drags the mouse from (startX, startY) to (endX, endY).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startX: { type: Type.NUMBER, description: 'Start X coordinate in points' },
        startY: { type: Type.NUMBER, description: 'Start Y coordinate in points' },
        endX: { type: Type.NUMBER, description: 'End X coordinate in points' },
        endY: { type: Type.NUMBER, description: 'End Y coordinate in points' },
      },
      required: ['startX', 'startY', 'endX', 'endY'],
    },
  },
  {
    name: 'type_text',
    description: 'Types text into the currently active/focused window, app, or input field on the Mac.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: 'The text string to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'press_key',
    description: 'Presses a special keyboard key like enter, return, tab, esc, space, delete, arrow-down, arrow-up, arrow-left, arrow-right.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: 'Key name (e.g. enter, esc, space, tab, delete, arrow-down)' },
      },
      required: ['key'],
    },
  },
  {
    name: 'hotkey',
    description: 'Triggers a keyboard shortcut combination on macOS (e.g. "cmd+space" for Spotlight, "cmd+c" to copy, "cmd+v" to paste, "cmd+w" to close window/tab, "cmd+t" for new tab, "cmd+q" to quit).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        combination: { type: Type.STRING, description: 'Shortcut combination like "cmd+space", "cmd+c", "cmd+v", "cmd+w"' },
      },
      required: ['combination'],
    },
  },
  {
    name: 'open_app',
    description: 'Opens or switches to any macOS application by name (e.g. "Safari", "Notes", "Spotify", "Terminal", "Google Chrome", "Calculator", "System Settings").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'Name of the macOS application to open' },
      },
      required: ['appName'],
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
    description: 'Sends a Telegram message (or real photo files) to a person, group, or to "me" (Saved Messages). When sending a screenshot or camera photo, provide the URL or path in mediaPath or mediaPaths to deliver it as an actual photo directly on Telegram!',
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient: {
          type: Type.STRING,
          description: 'Username (@username), phone number, or "me" for your personal Saved Messages',
        },
        message: {
          type: Type.STRING,
          description: 'The message text or photo caption',
        },
        mediaPath: {
          type: Type.STRING,
          description: 'Optional path or URL of an image/photo to send as an actual photo file (e.g. "/captures/shot-xxx.png" or "/captures/camera-xxx.jpg")',
        },
        mediaPaths: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Optional list of multiple image paths/URLs to send as actual photo files to Telegram',
        },
        isVoiceNote: {
          type: Type.BOOLEAN,
          description: 'Set true to synthesize and deliver this message as an authentic Telegram voice note audio recording instead of text',
        },
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'speak_aloud',
    description: 'Speaks text out loud through the Mac laptop built-in speakers using macOS speech synthesis.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: 'The text message to speak out loud' },
        voice: { type: Type.STRING, description: 'Optional voice name (e.g. "Samantha", "Daniel", "Fred", "Victoria")' },
      },
      required: ['text'],
    },
  },
  {
    name: 'run_agy_task',
    description:
      'Delegates complex, heavy, deep-thinking, coding, refactoring, bug-fixing, multi-file editing, or system engineering tasks to Google Antigravity CLI (agy) running Gemini 3.8 Flash High with full autonomous capabilities and auto-approved permissions (--dangerously-skip-permissions). Use this whenever a task is hard, requires deep code understanding, multi-step problem solving, or modifying project files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: 'The exact high-level instruction, bug description, or complex goal to delegate to Antigravity (agy).',
        },
        model: {
          type: Type.STRING,
          description: 'Optional model to use in agy (defaults to "gemini-3.8-flash-high", can also use "claude-sonnet-4-6" or "gemini-3.1-pro-high")',
        },
      },
      required: ['prompt'],
    },
  },
];

export class PocketAgent {
  private apiKey: string;
  private modelTier: 'flash' | 'pro';

  constructor(apiKey?: string, modelTier: 'flash' | 'pro' = 'flash') {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.modelTier = (process.env.MODEL_TIER as any) === 'pro' ? 'pro' : modelTier;
  }

  public updateApiKey(key: string) {
    this.apiKey = key;
  }

  public setModelTier(tier: 'flash' | 'pro') {
    this.modelTier = tier;
  }

  public getModelTier(): 'flash' | 'pro' {
    return this.modelTier;
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
    if (trimmed.startsWith('/agy ') || trimmed.startsWith('/antigravity ')) {
      const cmdPrefix = trimmed.startsWith('/agy ') ? '/agy ' : '/antigravity ';
      const agyPrompt = trimmed.substring(cmdPrefix.length).trim();
      if (!agyPrompt) {
        const msg = '⚠️ Usage: `/agy <task>` (e.g. `/agy fix tests in server.ts`)';
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }

      const logId = `term-${Date.now()}`;
      callbacks.onTerminalLog({
        id: logId,
        command: `agy --model gemini-3.8-flash-high --dangerously-skip-permissions -p "${agyPrompt.replace(/"/g, '\\"')}"`,
        output: '',
        status: 'running',
        timestamp: Date.now(),
      });

      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'thinking',
        content: `⚡ **Delegating to Antigravity CLI (Gemini 3.8 Flash High)**...\n> "${agyPrompt}"\n\n*Running autonomously with \`--dangerously-skip-permissions\`...*`,
      });

      const res = await runAgyTask({
        prompt: agyPrompt,
        onChunk: (chunk) => callbacks.onTerminalChunk(logId, chunk),
      });

      callbacks.onTerminalChunk(logId, '', res.exitCode);
      const msg = `⚡ **Antigravity Result** (Gemini 3.8 Flash High):\n\n${res.output}`;
      callbacks.onUpdateMessage(assistantMessageId, {
        status: res.exitCode === 0 ? 'done' : 'error',
        content: msg,
      });
      return res.output;
    }

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

    if (trimmed.startsWith('/open ')) {
      const appName = trimmed.substring(6).trim();
      try {
        const res = await openApp(appName);
        const msg = `🚀 **Opened Mac app**: \`${res.appName}\``;
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      } catch (err: any) {
        const msg = `⚠️ ${err.message}`;
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
    }

    if (trimmed.startsWith('/click ')) {
      const parts = trimmed.substring(7).trim().split(/\s+/);
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (isNaN(x) || isNaN(y)) {
        const msg = '⚠️ Usage: `/click <x> <y>` (e.g. `/click 500 400`)';
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
      const res = await mouseClick({ x, y });
      const msg = `🖱️ **Clicked mouse** at (${res.x}, ${res.y}) [${res.button}]`;
      callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
      return msg;
    }

    if (trimmed.startsWith('/type ')) {
      const text = trimmed.substring(6);
      await typeText(text);
      const msg = `⌨️ **Typed into Mac**: "${text}"`;
      callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
      return msg;
    }

    if (trimmed.startsWith('/key ')) {
      const keyName = trimmed.substring(5).trim();
      const res = await pressKey(keyName);
      const msg = `⌨️ **Pressed key**: \`${res.key}\``;
      callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
      return msg;
    }

    if (trimmed.startsWith('/hotkey ')) {
      const combo = trimmed.substring(8).trim();
      const res = await hotkey(combo);
      const msg = `⌨️ **Executed shortcut**: \`${res.combination}\``;
      callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
      return msg;
    }

    if (trimmed.startsWith('/tg ')) {
      const rest = trimmed.substring(4).trim();
      const firstSpace = rest.indexOf(' ');
      if (firstSpace === -1) {
        const msg = '⚠️ Usage: `/tg <recipient> <message>`\n*Examples:*\n- `/tg me Hello from my Mac!`\n- `/tg @username Hey, how are you?`\n- `/tg +1234567890 Meeting in 5 minutes`';
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
      const recipient = rest.substring(0, firstSpace).trim();
      const message = rest.substring(firstSpace + 1).trim();

      const res = await sendTelegramMessage({ recipient, message });
      if (res.success) {
        const msg = `✈️ **Telegram message sent** to \`${res.recipient}\`:\n> ${message}`;
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      } else {
        const msg = `⚠️ **Failed to send Telegram message**: ${res.error}`;
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
    }

    if (trimmed.startsWith('/say ')) {
      const textToSpeak = trimmed.substring(5).trim();
      if (!textToSpeak) {
        const msg = '⚠️ Usage: `/say <text>` (e.g. `/say Hello from my phone!`)';
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'thinking',
        content: `Speaking on Mac speakers: "${textToSpeak}"...`,
      });
      await speakAloud(textToSpeak);
      const msg = `🗣️ **Spoke aloud on Mac speakers**:\n> "${textToSpeak}"`;
      callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
      return msg;
    }

    if (trimmed.startsWith('/tgvoice ') || trimmed.startsWith('/voice ')) {
      const cmdPrefix = trimmed.startsWith('/tgvoice ') ? '/tgvoice ' : '/voice ';
      const rest = trimmed.substring(cmdPrefix.length).trim();
      const firstSpace = rest.indexOf(' ');
      if (firstSpace === -1) {
        const msg = '⚠️ Usage: `/tgvoice <recipient> <message>`\n*Examples:*\n- `/tgvoice me Hello from my Mac voice note!`\n- `/tgvoice @username Hey, listen to this!`';
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
      const recipient = rest.substring(0, firstSpace).trim();
      const message = rest.substring(firstSpace + 1).trim();

      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'thinking',
        content: `Synthesizing and sending Telegram voice note to \`${recipient}\`...`,
      });

      const res = await sendTelegramMessage({ recipient, message, isVoiceNote: true });
      if (res.success) {
        const msg = `🎙️ **Telegram Voice Note delivered** to \`${res.recipient}\`:\n> "${message}"`;
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      } else {
        const msg = `⚠️ **Failed to send Telegram voice note**: ${res.error}`;
        callbacks.onUpdateMessage(assistantMessageId, { status: 'done', content: msg });
        return msg;
      }
    }

    if (trimmed === '/system' || trimmed === '/sys') {
      const res = await executeShellCommand('pmset -g batt; uptime');
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: `💻 **Mac System Status**:\n\`\`\`bash\n${res.output.trim()}\n\`\`\``,
      });
      return res.output;
    }

    if (trimmed.toLowerCase() === '/clear' || trimmed.toLowerCase() === 'clear') {
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: '🧹 Chat cleared.',
      });
      return 'Chat cleared.';
    }

    // 2. If no Gemini API Key is configured yet, guide the user
    if (!this.hasKey()) {
      const msg =
        "🔑 **PocketBridge is ready!**\n\nTo enable full autonomous AI actions (natural language tool execution, testing apps, web searches, and auto-screenshots), please enter your **Gemini API Key** in the **Settings** modal.\n\n*In the meantime, you can test immediate direct commands:*\n- `/screenshot` — Grab live desktop screenshot\n- `/open <app>` — Open any Mac app (e.g. /open Safari)\n- `/click <x> <y>` — Click coordinates on Mac screen\n- `/type <text>` — Type text into active window\n- `/key <key>` — Press key (enter, space, esc, tab)\n- `/hotkey <combo>` — Shortcut (e.g. /hotkey cmd+space)\n- `/git status` — Run git commands\n- `/sh <command>` — Run any terminal command directly";
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
- Autonomously controlling and navigating the Mac GUI ("Computer Use"):
  * Open apps with open_app (e.g. open_app('Safari'), open_app('Notes'), open_app('Spotify'))
  * Search and spotlight with hotkey('cmd+space'), type_text, and press_key('enter')
  * Move the cursor and click buttons/elements with mouse_click(x, y)
  * Drag or select with mouse_drag(startX, startY, endX, endY)
  * Type text into inputs or active windows with type_text(text)
  * Press keys with press_key(key) (enter, space, tab, esc, arrow-down, etc.)
  * Trigger shortcuts with hotkey(combination) (cmd+c, cmd+v, cmd+w, cmd+t, cmd+q)
- Screen display resolution: The Mac display is 1440 x 900 points.
- Before clicking or typing if you need to locate a UI element, call take_screenshot!
- After completing an interaction or opening an app, call take_screenshot so the user can verify the result on their phone!
- Testing and running apps (using execute_command)
- Checking and using GitHub (git status, commit, pull, branch, etc. using execute_command)
- Searching the web for documentation, solutions, and updates (using search_web)
- Sending Telegram messages or circular voice notes to other people or to "me" (using send_telegram_message; set isVoiceNote: true when asked to send a voice note/message)
- Speaking out loud through the Mac's speakers (using speak_aloud) when asked to speak, announce, say something, or talk
- DELEGATING HARD / COMPLEX TASKS TO ANTIGRAVITY (AGY):
  * You have access to the powerful tool: run_agy_task(prompt, model)!
  * Whenever the user asks you to write complex code, refactor repositories, fix bugs, inspect large codebases, execute multi-step developer workflows, or do hard engineering, DO NOT try to write brittle bash scripts or do guesswork!
  * Delegate the task immediately using run_agy_task!
  * Antigravity runs Gemini 3.8 Flash High with --dangerously-skip-permissions and full autonomous agent capabilities.

Guidelines:
1. Always be concise, helpful, and direct.
2. Whenever the user asks to "show me", "check the screen", "open [app]", or interact with GUI elements, call take_screenshot to confirm!
3. When asked to send a voice note on Telegram, call send_telegram_message with isVoiceNote: true!
4. Format output cleanly in Markdown.
5. Execute tests and check exit codes carefully.
6. If a task requires deep code editing, project building, fixing tricky bugs, or writing files across repositories, delegate it via run_agy_task!
`;

      const candidateModels =
        this.modelTier === 'pro'
          ? [
              'gemini-pro-latest',
              'gemini-flash-latest',
              'gemini-flash-lite-latest',
            ]
          : [
              'gemini-flash-latest',
              'gemini-flash-lite-latest',
            ];

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
              console.warn(`Model ${m} returned ${err.status}, waiting and trying fallback model...`);
              await new Promise((resolve) => setTimeout(resolve, 600));
              continue;
            }
            throw err;
          }
        }
        throw lastErr;
      };

      const toolRecords: ToolCallRecord[] = [];
      const capturedMediaUrls: string[] = [];
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
        if (!candidate || !functionCalls || functionCalls.length === 0) {
          const finalText = response.text || 'Done.';
          callbacks.onUpdateMessage(assistantMessageId, {
            status: 'done',
            content: finalText,
            toolCalls: toolRecords.length > 0 ? toolRecords : undefined,
            screenshotUrl: latestScreenshotUrl,
            mediaUrls: capturedMediaUrls.length > 0 ? [...capturedMediaUrls] : undefined,
          });
          return finalText;
        }

        // Add model's functionCall turn to contents
        conversationContents.push(candidate.content);

        // Execute each function call
        const functionResponseParts: any[] = [];

        for (const part of functionCalls) {
          const call = part.functionCall;
          if (!call || !call.name) continue;
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
              capturedMediaUrls.push(shot.publicUrl);
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
              capturedMediaUrls.push(photo.publicUrl);
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
            } else if (call.name === 'mouse_click') {
              const x = Number(call.args?.x || 0);
              const y = Number(call.args?.y || 0);
              const button = call.args?.button === 'right' ? 'right' : 'left';
              const doubleClick = Boolean(call.args?.doubleClick);
              const clickRes = await mouseClick({ x, y, button, doubleClick });
              functionResult = clickRes;
            } else if (call.name === 'mouse_move') {
              const x = Number(call.args?.x || 0);
              const y = Number(call.args?.y || 0);
              const moveRes = await mouseMove(x, y);
              functionResult = moveRes;
            } else if (call.name === 'mouse_drag') {
              const startX = Number(call.args?.startX || 0);
              const startY = Number(call.args?.startY || 0);
              const endX = Number(call.args?.endX || 0);
              const endY = Number(call.args?.endY || 0);
              const dragRes = await mouseDrag(startX, startY, endX, endY);
              functionResult = dragRes;
            } else if (call.name === 'type_text') {
              const text = String(call.args?.text || '');
              const typeRes = await typeText(text);
              functionResult = typeRes;
            } else if (call.name === 'press_key') {
              const key = String(call.args?.key || '');
              const keyRes = await pressKey(key);
              functionResult = keyRes;
            } else if (call.name === 'hotkey') {
              const combination = String(call.args?.combination || '');
              const hkRes = await hotkey(combination);
              functionResult = hkRes;
            } else if (call.name === 'open_app') {
              const appName = String(call.args?.appName || '');
              const openRes = await openApp(appName);
              functionResult = openRes;
            } else if (call.name === 'speak_aloud') {
              const text = String(call.args?.text || '');
              const voice = call.args?.voice ? String(call.args.voice) : undefined;
              const speakRes = await speakAloud(text, voice);
              functionResult = speakRes;
            } else if (call.name === 'send_telegram_message') {
              const recipient = String(call.args?.recipient || '');
              const message = String(call.args?.message || '');
              const mediaPath = call.args?.mediaPath ? String(call.args.mediaPath) : undefined;
              const mediaPaths = Array.isArray(call.args?.mediaPaths)
                ? call.args.mediaPaths.map(String)
                : (capturedMediaUrls.length > 0 ? [...capturedMediaUrls] : undefined);
              const isVoiceNote = Boolean(call.args?.isVoiceNote);

              const tgRes = await sendTelegramMessage({ recipient, message, mediaPath, mediaPaths, isVoiceNote });
              functionResult = tgRes;
            } else if (call.name === 'run_agy_task') {
              const prompt = String(call.args?.prompt || '');
              const model = call.args?.model ? String(call.args.model) : 'gemini-3.8-flash-high';
              const logId = `term-${Date.now()}`;

              callbacks.onTerminalLog({
                id: logId,
                command: `agy --model ${model} --dangerously-skip-permissions -p "${prompt.replace(/"/g, '\\"')}"`,
                output: '',
                status: 'running',
                timestamp: Date.now(),
              });

              callbacks.onUpdateMessage(assistantMessageId, {
                status: 'thinking',
                content: `⚡ **Delegating to Antigravity (${model})**...\n> "${prompt}"`,
                toolCalls: [...toolRecords],
              });

              const agyRes = await runAgyTask({
                prompt,
                model,
                onChunk: (chunk) => callbacks.onTerminalChunk(logId, chunk),
              });

              callbacks.onTerminalChunk(logId, '', agyRes.exitCode);
              functionResult = {
                status: agyRes.exitCode === 0 ? 'success' : 'failed',
                model: agyRes.model,
                output: agyRes.output,
                exitCode: agyRes.exitCode,
                durationMs: agyRes.durationMs,
              };
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
          mediaUrls: capturedMediaUrls.length > 0 ? [...capturedMediaUrls] : undefined,
        });
      }

      const finalFallback = 'Completed all requested tool actions.';
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'done',
        content: finalFallback,
        toolCalls: toolRecords,
        screenshotUrl: latestScreenshotUrl,
        mediaUrls: capturedMediaUrls.length > 0 ? [...capturedMediaUrls] : undefined,
      });
      return finalFallback;
    } catch (err: any) {
      console.error('Gemini Agent Error:', err);
      let errMessage = `⚠️ Error during agent execution: ${err?.message || 'Unknown error'}`;
      if (err?.status === 503 || err?.message?.includes('503') || err?.message?.includes('high demand')) {
        errMessage = `⚠️ **Google AI temporary capacity spike (503)**:\nThe AI model is temporarily experiencing high global demand. Please try sending your request again in a few moments, or use direct commands:\n- \`/screenshot\` — Grab live desktop screenshot\n- \`/camera\` — Snap webcam photo\n- \`/git <command>\` — Run git command\n- \`/sh <command>\` — Run terminal command\n- \`/system\` — View battery & memory info`;
      } else if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
        errMessage = `⚠️ **Google AI Quota Limit (429)**:\nYour API key reached its rate limit or quota. If using Pro models, ensure your key is linked to a billing account or switch Model Tier to 'Flash' in Settings.\n\n*Direct slash commands remain operational:* \`/screenshot\`, \`/camera\`, \`/sh\`, \`/git\`.`;
      }
      callbacks.onUpdateMessage(assistantMessageId, {
        status: 'error',
        content: errMessage,
      });
      return errMessage;
    }
  }
}
