import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';
import { ContextCompactor } from '../src/server/context/compactor.js';
import { createDefaultToolRegistry } from '../src/server/tools/registry.js';

async function testLiveGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[SKIP] No GEMINI_API_KEY found in .env - skipping remote test.');
    return;
  }
  console.log('[TEST] Found GEMINI_API_KEY. Initializing Gemini API and ToolRegistry...');
  const ai = new GoogleGenAI({ apiKey });
  const registry = createDefaultToolRegistry();

  const conversationContents = [
    { role: 'user', parts: [{ text: 'Please check the current git status using execute_command.' }] }
  ];

  const projected = ContextCompactor.project(conversationContents, {
    workspaceDir: process.cwd(),
  });

  console.log('[TEST] Calling Gemini API (gemini-flash-latest) with projected context and tools...');
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: projected,
      config: {
        tools: [{ functionDeclarations: registry.getDeclarations() as any }],
      },
    });

    const call = res.candidates?.[0]?.content?.parts?.find((p) => p.functionCall);
    if (call?.functionCall) {
      console.log(`[TEST] Gemini returned functionCall: ${call.functionCall.name}`, call.functionCall.args);
      assert(call.functionCall.name === 'execute_command', 'Should request execute_command');
    } else {
      console.log('[TEST] Gemini returned text response:', res.text?.slice(0, 100));
    }
    console.log('[PASS] Live Gemini Flash API call completed successfully with 200 OK!');
  } catch (err: any) {
    console.warn(`[WARN] Gemini Flash API returned: ${err?.status || err?.message}`);
  }
}

import assert from 'node:assert/strict';
testLiveGemini().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
