import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Type } from '@google/genai';
import type { AgentTool } from './registry.js';

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

export const speakAloudTool: AgentTool<{ text: string; voice?: string }, { success: boolean; text: string }> = {
  name: 'speak_aloud',
  description: "Speaks text out loud through the Mac laptop built-in speakers using macOS speech synthesis.",
  category: 'system',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The text message to speak out loud' },
      voice: { type: Type.STRING, description: 'Optional voice name (e.g. "Samantha", "Daniel", "Fred", "Victoria")' },
    },
    required: ['text'],
  },
  execute: async (args) => {
    const text = String(args?.text || '');
    const voice = args?.voice ? String(args.voice) : undefined;
    return await speakAloud(text, voice);
  },
};
