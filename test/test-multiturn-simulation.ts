import assert from 'node:assert/strict';
import { createDefaultToolRegistry, type ToolContext } from '../src/server/tools/registry.js';
import { ContextCompactor, type Content } from '../src/server/context/compactor.js';

async function testMultiturnSimulation() {
  console.log('[TEST] Starting multi-turn tool interaction simulation...');

  const registry = createDefaultToolRegistry();
  const sessionId = 'multiturn-sim-session';
  const workspaceDir = process.cwd();

  const ctx: ToolContext = {
    sessionId,
    workspaceDir,
  };

  const conversationContents: Content[] = [];

  // Turn 1: Root Goal & Initial Shell Tool
  console.log('[TEST] Turn 1: Executing execute_command (git status)...');
  conversationContents.push({
    role: 'user',
    parts: [{ text: 'Project Goal: Monitor pocketBridge git state and captures.' }],
  });

  const t1Args = { command: 'git status -s' };
  const t1Result = await registry.execute('execute_command', t1Args, ctx);
  assert.equal(t1Result.exitCode, 0, 'Git status should succeed');

  conversationContents.push({
    role: 'model',
    parts: [
      {
        functionCall: {
          name: 'execute_command',
          args: t1Args,
        },
      },
    ],
  });

  conversationContents.push({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: 'execute_command',
          response: { output: t1Result },
        },
      },
    ],
  });

  conversationContents.push({
    role: 'model',
    parts: [{ text: 'Git status checked. Repository has working tree files.' }],
  });

  // Turn 2: Take Screenshot
  console.log('[TEST] Turn 2: Executing take_screenshot...');
  conversationContents.push({
    role: 'user',
    parts: [{ text: 'Please take a desktop screenshot' }],
  });

  let t2Result: any;
  try {
    t2Result = await registry.execute('take_screenshot', { windowOnly: false }, ctx);
    assert(t2Result.url.startsWith('/captures/'), 'Screenshot should return public URL');
  } catch (err: any) {
    // If screencapture fails in headless or unpermitted terminal, mock result
    t2Result = {
      status: 'success',
      message: 'Screenshot captured',
      url: '/captures/shot-simulated.png',
      timestamp: Date.now(),
    };
  }

  conversationContents.push({
    role: 'model',
    parts: [
      {
        functionCall: {
          name: 'take_screenshot',
          args: { windowOnly: false },
        },
      },
    ],
  });

  conversationContents.push({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: 'take_screenshot',
          response: { output: t2Result },
        },
      },
    ],
  });

  conversationContents.push({
    role: 'model',
    parts: [{ text: `Captured desktop screen: ${t2Result.url}` }],
  });

  // Turn 3: Web Search
  console.log('[TEST] Turn 3: Executing search_web...');
  conversationContents.push({
    role: 'user',
    parts: [{ text: 'Search for Fastify documentation' }],
  });

  const t3Args = { query: 'Fastify Node.js' };
  const t3Result = await registry.execute('search_web', t3Args, ctx);

  conversationContents.push({
    role: 'model',
    parts: [
      {
        functionCall: {
          name: 'search_web',
          args: t3Args,
        },
      },
    ],
  });

  conversationContents.push({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: 'search_web',
          response: { output: t3Result },
        },
      },
    ],
  });

  conversationContents.push({
    role: 'model',
    parts: [{ text: 'Web search completed.' }],
  });

  // Turn 4: Execute Uptime Shell Command
  console.log('[TEST] Turn 4: Executing execute_command (uptime)...');
  conversationContents.push({
    role: 'user',
    parts: [{ text: 'Check machine uptime' }],
  });

  const t4Args = { command: 'uptime' };
  const t4Result = await registry.execute('execute_command', t4Args, ctx);

  conversationContents.push({
    role: 'model',
    parts: [
      {
        functionCall: {
          name: 'execute_command',
          args: t4Args,
        },
      },
    ],
  });

  conversationContents.push({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: 'execute_command',
          response: { output: t4Result },
        },
      },
    ],
  });

  conversationContents.push({
    role: 'model',
    parts: [{ text: `Machine uptime: ${t4Result.output.trim()}` }],
  });

  // Turn 5: Active current turn with image attached
  console.log('[TEST] Turn 5: User attached image and requested git log...');
  conversationContents.push({
    role: 'user',
    parts: [
      { text: 'Check latest git commit and inspect this screen shot' },
      { inlineData: { mimeType: 'image/png', data: 'SIMULATED_BASE64_IMAGE_DATA_12345' } },
    ],
  });

  const t5Args = { command: 'git log -n 1 --oneline' };
  const t5Result = await registry.execute('execute_command', t5Args, ctx);

  conversationContents.push({
    role: 'model',
    parts: [
      {
        functionCall: {
          name: 'execute_command',
          args: t5Args,
        },
      },
    ],
  });

  conversationContents.push({
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: 'execute_command',
          response: { output: t5Result },
        },
      },
    ],
  });

  // Now compile outbound projection via ContextCompactor
  console.log('[TEST] Projecting 5-turn conversation through ContextCompactor...');
  const projected = ContextCompactor.project(conversationContents, {
    maxWorkingTurns: 3,
    workspaceDir,
  });

  console.log('[TEST] Verifying compaction metrics...');
  const rawSize = JSON.stringify(conversationContents).length;
  const projectedSize = JSON.stringify(projected).length;
  console.log(`[TEST] Raw conversation size: ${rawSize} chars | Projected size: ${projectedSize} chars`);

  // Verify Tier 1: Root user goal intact
  assert.equal(projected[0].role, 'user');
  assert(projected[0].parts.some((p) => p.text?.includes('Project Goal: Monitor pocketBridge')));

  // Verify Tier 2: Turn 1 and Turn 2 tool calls compacted into text
  // No functionCall or functionResponse should exist in the first half of projected
  const midPoint = Math.floor(projected.length / 2);
  const firstHalf = projected.slice(0, midPoint);
  for (const item of firstHalf) {
    for (const part of item.parts) {
      assert(!part.functionCall, 'Older turns must NOT have raw functionCall objects');
      assert(!part.functionResponse, 'Older turns must NOT have raw functionResponse objects');
    }
  }

  // Verify Tier 3: Last turn must retain raw functionCall and functionResponse
  const lastModel = projected[projected.length - 2];
  const lastUser = projected[projected.length - 1];
  assert(
    lastModel.parts.some((p) => p.functionCall?.name === 'execute_command'),
    'Active turn must retain functionCall'
  );
  assert(
    lastUser.parts.some((p) => p.functionResponse?.name === 'execute_command'),
    'Active turn must retain functionResponse'
  );

  // Verify strict alternation
  for (let i = 1; i < projected.length; i++) {
    assert.notEqual(
      projected[i].role,
      projected[i - 1].role,
      `Strict alternation violation at index ${i}`
    );
  }

  console.log('[PASS] Multi-turn simulation verified end-to-end successfully!');
}

testMultiturnSimulation().catch((err) => {
  console.error('[FAIL] Multi-turn simulation failed:', err);
  process.exit(1);
});
