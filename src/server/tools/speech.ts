import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Speaks text out loud through the Mac's built-in speakers.
 */
export async function speakAloud(text: string, voice?: string): Promise<{ success: boolean; text: string }> {
  const clean = text.trim();
  if (!clean) return { success: false, text: '' };

  const args: string[] = [];
  if (voice && voice.trim().length > 0) {
    args.push('-v', voice.trim());
  }
  args.push(clean);

  await execa('/usr/bin/say', args);
  return { success: true, text: clean };
}

/**
 * Synthesizes speech to an AAC/m4a audio file suitable for Telegram voice notes.
 */
export async function synthesizeVoiceNote(text: string, filename?: string): Promise<string> {
  const name = filename || `voice-${Date.now()}.m4a`;
  const capturesDir = path.resolve(process.cwd(), 'captures');
  await fs.mkdir(capturesDir, { recursive: true });
  const outPath = path.resolve(capturesDir, name);

  await execa('/usr/bin/say', ['-o', outPath, '--data-format=aac', text]);
  return outPath;
}
