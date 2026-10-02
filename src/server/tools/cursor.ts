import { execa } from 'execa';
import { Type } from '@google/genai';
import type { AgentTool } from './registry.js';

export interface DisplayDimensions {
  width: number;
  height: number;
  scale: number;
}

let cachedDimensions: DisplayDimensions | null = null;

/**
 * Returns the current main screen resolution in logical points (for mouse positioning)
 * and retina scale factor.
 */
export async function getDisplayDimensions(): Promise<DisplayDimensions> {
  if (cachedDimensions) return cachedDimensions;

  try {
    const { stdout } = await execa('osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit"); const f = $.NSScreen.mainScreen.frame; JSON.stringify({ width: f.size.width, height: f.size.height })',
    ]);
    const parsed = JSON.parse(stdout.trim());
    // Retina screens on MacBooks have a 2.0 scale factor
    cachedDimensions = {
      width: Math.round(parsed.width || 1440),
      height: Math.round(parsed.height || 900),
      scale: 2.0,
    };
  } catch {
    cachedDimensions = { width: 1440, height: 900, scale: 2.0 };
  }
  return cachedDimensions;
}

/**
 * Normalizes coordinates in case caller passed raw Retina pixel coordinates (e.g. 2880x1800)
 * rather than logical points (1440x900).
 */
async function normalizeCoordinates(x: number, y: number): Promise<{ x: number; y: number }> {
  const dims = await getDisplayDimensions();
  let nx = Math.round(x);
  let ny = Math.round(y);

  // If x or y exceeds logical bounds by scale, downscale
  if (nx > dims.width && dims.scale > 1) {
    nx = Math.round(nx / dims.scale);
  }
  if (ny > dims.height && dims.scale > 1) {
    ny = Math.round(ny / dims.scale);
  }

  // Clamp within bounds
  nx = Math.max(0, Math.min(dims.width - 1, nx));
  ny = Math.max(0, Math.min(dims.height - 1, ny));

  return { x: nx, y: ny };
}

export interface MouseClickOptions {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  doubleClick?: boolean;
}

/**
 * Emulates a mouse click at specified coordinates.
 */
export async function mouseClick(opts: MouseClickOptions): Promise<{ x: number; y: number; button: string }> {
  const { x, y } = await normalizeCoordinates(opts.x, opts.y);
  let cmd = `c:${x},${y}`;

  if (opts.button === 'right') {
    cmd = `rc:${x},${y}`;
  } else if (opts.doubleClick) {
    cmd = `dc:${x},${y}`;
  }

  await execa('cliclick', [cmd]);
  return { x, y, button: opts.button || (opts.doubleClick ? 'double-left' : 'left') };
}

/**
 * Moves cursor to specified coordinates.
 */
export async function mouseMove(x: number, y: number): Promise<{ x: number; y: number }> {
  const norm = await normalizeCoordinates(x, y);
  await execa('cliclick', [`m:${norm.x},${norm.y}`]);
  return norm;
}

/**
 * Emulates click-and-drag from start to end coordinates.
 */
export async function mouseDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Promise<{ startX: number; startY: number; endX: number; endY: number }> {
  const start = await normalizeCoordinates(startX, startY);
  const end = await normalizeCoordinates(endX, endY);

  await execa('cliclick', [
    `dd:${start.x},${start.y}`,
    `m:${end.x},${end.y}`,
    `du:${end.x},${end.y}`,
  ]);

  return { startX: start.x, startY: start.y, endX: end.x, endY: end.y };
}

/**
 * Types text into the focused window/input.
 */
export async function typeText(text: string): Promise<{ text: string }> {
  if (!text) return { text: '' };

  // Use cliclick type command
  try {
    await execa('cliclick', [`t:${text}`]);
  } catch {
    // Fallback using osascript for complex strings
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await execa('osascript', ['-e', `tell application "System Events" to keystroke "${escaped}"`]);
  }

  return { text };
}

/**
 * Emulates pressing a single special key (e.g. enter, space, tab, esc, arrow-down).
 */
export async function pressKey(keyName: string): Promise<{ key: string }> {
  const cleanKey = keyName.toLowerCase().trim();
  const modifiers = ['shift', 'cmd', 'ctrl', 'alt', 'fn'];

  if (modifiers.includes(cleanKey)) {
    await execa('cliclick', [`kd:${cleanKey}`, `ku:${cleanKey}`]);
    return { key: cleanKey };
  }

  const keyMap: Record<string, string> = {
    enter: 'enter',
    return: 'return',
    esc: 'esc',
    escape: 'esc',
    space: 'space',
    tab: 'tab',
    backspace: 'delete',
    delete: 'delete',
    up: 'arrow-up',
    down: 'arrow-down',
    left: 'arrow-left',
    right: 'arrow-right',
    'arrow-up': 'arrow-up',
    'arrow-down': 'arrow-down',
    'arrow-left': 'arrow-left',
    'arrow-right': 'arrow-right',
  };

  const cliclickKey = keyMap[cleanKey] || cleanKey;
  await execa('cliclick', [`kp:${cliclickKey}`]);
  return { key: cliclickKey };
}

/**
 * Triggers a keyboard shortcut (e.g. 'cmd+space', 'cmd+c', 'cmd+v', 'cmd+w', 'cmd+t', 'cmd+tab').
 */
export async function hotkey(combination: string): Promise<{ combination: string }> {
  const parts = combination
    .toLowerCase()
    .split(/[\s+-]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const modifiers: string[] = [];
  let mainKey = '';

  for (const part of parts) {
    if (['cmd', 'command'].includes(part)) {
      modifiers.push('cmd');
    } else if (['ctrl', 'control'].includes(part)) {
      modifiers.push('ctrl');
    } else if (['alt', 'opt', 'option'].includes(part)) {
      modifiers.push('alt');
    } else if (['shift'].includes(part)) {
      modifiers.push('shift');
    } else {
      mainKey = part;
    }
  }

  if (modifiers.length > 0 && mainKey) {
    const kd = `kd:${modifiers.join(',')}`;
    const ku = `ku:${modifiers.join(',')}`;

    const specialKeys: Record<string, string> = {
      space: 'space',
      enter: 'enter',
      return: 'enter',
      tab: 'tab',
      esc: 'esc',
      escape: 'esc',
      delete: 'delete',
      backspace: 'delete',
    };

    if (specialKeys[mainKey]) {
      await execa('cliclick', [kd, `kp:${specialKeys[mainKey]}`, ku]);
    } else {
      await execa('cliclick', [kd, `t:${mainKey}`, ku]);
    }
  } else if (mainKey) {
    await pressKey(mainKey);
  }

  return { combination };
}

/**
 * Launches or focuses a native macOS application by name.
 */
export async function openApp(appName: string): Promise<{ appName: string; success: boolean }> {
  try {
    await execa('open', ['-a', appName.trim()]);
    return { appName, success: true };
  } catch (err: any) {
    throw new Error(`Failed to open application "${appName}": ${err?.message || 'Application not found'}`);
  }
}

export const mouseClickTool: AgentTool<
  { x: number; y: number; button?: 'left' | 'right'; doubleClick?: boolean },
  { x: number; y: number; button: string }
> = {
  name: 'mouse_click',
  description:
    'Clicks the mouse at specific screen coordinates (x, y). The main MacBook display resolution is 1440 x 900 points.',
  category: 'gui',
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
  execute: async (args) => {
    const x = Number(args?.x || 0);
    const y = Number(args?.y || 0);
    const button = args?.button === 'right' ? 'right' : 'left';
    const doubleClick = Boolean(args?.doubleClick);
    return await mouseClick({ x, y, button, doubleClick });
  },
};

export const mouseMoveTool: AgentTool<{ x: number; y: number }, { x: number; y: number }> = {
  name: 'mouse_move',
  description: 'Moves the mouse cursor to specific coordinates (x, y) without clicking.',
  category: 'gui',
  parameters: {
    type: Type.OBJECT,
    properties: {
      x: { type: Type.NUMBER, description: 'Horizontal coordinate in points (0 to 1440)' },
      y: { type: Type.NUMBER, description: 'Vertical coordinate in points (0 to 900)' },
    },
    required: ['x', 'y'],
  },
  execute: async (args) => {
    const x = Number(args?.x || 0);
    const y = Number(args?.y || 0);
    return await mouseMove(x, y);
  },
};

export const mouseDragTool: AgentTool<
  { startX: number; startY: number; endX: number; endY: number },
  { startX: number; startY: number; endX: number; endY: number }
> = {
  name: 'mouse_drag',
  description: 'Clicks and drags the mouse from (startX, startY) to (endX, endY).',
  category: 'gui',
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
  execute: async (args) => {
    const startX = Number(args?.startX || 0);
    const startY = Number(args?.startY || 0);
    const endX = Number(args?.endX || 0);
    const endY = Number(args?.endY || 0);
    return await mouseDrag(startX, startY, endX, endY);
  },
};

export const typeTextTool: AgentTool<{ text: string }, { text: string }> = {
  name: 'type_text',
  description: 'Types text into the currently active/focused window, app, or input field on the Mac.',
  category: 'gui',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The text string to type' },
    },
    required: ['text'],
  },
  execute: async (args) => {
    const text = String(args?.text || '');
    return await typeText(text);
  },
};

export const pressKeyTool: AgentTool<{ key: string }, { key: string }> = {
  name: 'press_key',
  description:
    'Presses a special keyboard key like enter, return, tab, esc, space, delete, arrow-down, arrow-up, arrow-left, arrow-right.',
  category: 'gui',
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING, description: 'Key name (e.g. enter, esc, space, tab, delete, arrow-down)' },
    },
    required: ['key'],
  },
  execute: async (args) => {
    const key = String(args?.key || '');
    return await pressKey(key);
  },
};

export const hotkeyTool: AgentTool<{ combination: string }, { combination: string }> = {
  name: 'hotkey',
  description:
    'Triggers a keyboard shortcut combination on macOS (e.g. "cmd+space" for Spotlight, "cmd+c" to copy, "cmd+v" to paste, "cmd+w" to close window/tab, "cmd+t" for new tab, "cmd+q" to quit).',
  category: 'gui',
  parameters: {
    type: Type.OBJECT,
    properties: {
      combination: {
        type: Type.STRING,
        description: 'Shortcut combination like "cmd+space", "cmd+c", "cmd+v", "cmd+w"',
      },
    },
    required: ['combination'],
  },
  execute: async (args) => {
    const combination = String(args?.combination || '');
    return await hotkey(combination);
  },
};

export const openAppTool: AgentTool<{ appName: string }, { appName: string; success: boolean }> = {
  name: 'open_app',
  description:
    'Opens or switches to any macOS application by name (e.g. "Safari", "Notes", "Spotify", "Terminal", "Google Chrome", "Calculator", "System Settings").',
  category: 'gui',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appName: { type: Type.STRING, description: 'Name of the macOS application to open' },
    },
    required: ['appName'],
  },
  execute: async (args) => {
    const appName = String(args?.appName || '');
    return await openApp(appName);
  },
};

export const cursorTools: AgentTool[] = [
  mouseClickTool,
  mouseMoveTool,
  mouseDragTool,
  typeTextTool,
  pressKeyTool,
  hotkeyTool,
  openAppTool,
];

