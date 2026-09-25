import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';

const CAPTURES_DIR = path.resolve(process.cwd(), 'captures');

export interface CameraPhotoResult {
  filename: string;
  filePath: string;
  publicUrl: string;
  timestamp: number;
}

/**
 * Snaps a photo using the Mac's built-in FaceTime HD Camera via imagesnap.
 * -w 1.0: Warmup 1.0 second so camera auto-exposure and white balance settle.
 */
export async function takeCameraPhoto(options: { warmupSeconds?: number } = {}): Promise<CameraPhotoResult> {
  await fs.mkdir(CAPTURES_DIR, { recursive: true });
  const timestamp = Date.now();
  const filename = `camera-${timestamp}.jpg`;
  const filePath = path.join(CAPTURES_DIR, filename);
  const warmup = options.warmupSeconds ?? 1.0;

  try {
    // Run imagesnap with warmup
    await execa('/usr/local/bin/imagesnap', ['-w', warmup.toString(), filePath]);

    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      throw new Error('Camera photo created but file is empty.');
    }

    return {
      filename,
      filePath,
      publicUrl: `/captures/${filename}`,
      timestamp,
    };
  } catch (error: any) {
    if (error?.message?.includes('permission') || error?.code === 1) {
      throw new Error(
        'macOS Camera permission required. Please check System Settings > Privacy & Security > Camera and ensure your terminal is allowed.'
      );
    }
    throw error;
  }
}
