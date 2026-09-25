import { execa } from 'execa';

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
