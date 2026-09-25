import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';

const CAPTURES_DIR = path.resolve(process.cwd(), 'captures');

export interface ScreenshotResult {
  filename: string;
  filePath: string;
  publicUrl: string;
  timestamp: number;
  width?: number;
  height?: number;
}

export async function ensureCapturesDir(): Promise<void> {
  await fs.mkdir(CAPTURES_DIR, { recursive: true });
}

/**
 * Captures the Mac desktop or active window using macOS native `screencapture`.
 * -x: silent (no click sound)
 * -C: capture cursor
 * -T: delay in seconds (optional)
 */
export async function takeMacScreenshot(options: {
  includeCursor?: boolean;
  windowOnly?: boolean;
} = {}): Promise<ScreenshotResult> {
  await ensureCapturesDir();
  const timestamp = Date.now();
  const filename = `shot-${timestamp}.png`;
  const filePath = path.join(CAPTURES_DIR, filename);

  const args: string[] = ['-x'];
  if (options.includeCursor !== false) {
    args.push('-C');
  }
  if (options.windowOnly) {
    args.push('-w');
  }
  args.push(filePath);

  try {
    await execa('/usr/sbin/screencapture', args);
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      throw new Error('Screenshot file created but is 0 bytes (screen might be locked or sleeping)');
    }

    return {
      filename,
      filePath,
      publicUrl: `/captures/${filename}`,
      timestamp,
    };
  } catch (error: any) {
    // If screencapture failed, check if screen recording permission is needed
    if (error?.message?.includes('permission') || error?.code === 1) {
      throw new Error(
        'macOS screencapture failed. Please make sure Terminal/Node has "Screen Recording" permission in System Settings > Privacy & Security > Screen Recording.'
      );
    }
    throw error;
  }
}
