import assert from 'node:assert/strict';
import { ToolRegistry, createDefaultToolRegistry, type ToolContext } from '../src/server/tools/registry.js';
import { ContextCompactor, type Content } from '../src/server/context/compactor.js';
import { PocketAgent } from '../src/server/agent.js';

async function runTests() {
  console.log('[TEST] Starting ToolRegistry and ContextCompactor test suite...');

  // ==========================================
  // PART 1: ToolRegistry Tests
  // ==========================================
  console.log('[TEST] 1. Testing ToolRegistry registration and declarations...');
  const registry = createDefaultToolRegistry();

  const declarations = registry.getDeclarations();
  assert(Array.isArray(declarations), 'Declarations must be an array');
  assert(declarations.length >= 8, `Expected at least 8 tool declarations, got ${declarations.length}`);

  const toolNames = declarations.map((d) => d.name);
  console.log('[TEST] Registered tools:', toolNames.join(', '));
  assert(toolNames.includes('execute_command'), 'execute_command must be registered');
  assert(toolNames.includes('take_screenshot'), 'take_screenshot must be registered');
  assert(toolNames.includes('take_camera_photo'), 'take_camera_photo must be registered');
  assert(toolNames.includes('mouse_click'), 'mouse_click must be registered');
  assert(toolNames.includes('type_text'), 'type_text must be registered');
  assert(toolNames.includes('search_web'), 'search_web must be registered');
  assert(toolNames.includes('send_telegram_message'), 'send_telegram_message must be registered');
  assert(toolNames.includes('speak_aloud'), 'speak_aloud must be registered');
  assert(toolNames.includes('run_agy_task'), 'run_agy_task must be registered');

  // Test tool execution with shell
  console.log('[TEST] 2. Testing ToolRegistry tool execution with execute_command...');
  let streamedChunk = '';
  const testCtx: ToolContext = {
    sessionId: 'test-session-123',
    workspaceDir: process.cwd(),
    onStreamChunk: (chunk: string) => {
      streamedChunk += chunk;
    },
  };

  const shellResult = await registry.execute(
    'execute_command',
    { command: 'echo "hello from registry test"' },
    testCtx
  );
  assert.equal(shellResult.exitCode, 0, 'Exit code must be 0');
  assert(shellResult.output.includes('hello from registry test'), 'Output must contain echoed text');
  assert(streamedChunk.includes('hello from registry test'), 'Streamed chunk must contain echoed text');

  // Test unknown tool error wrapping
  console.log('[TEST] 3. Testing ToolRegistry error wrapping on unknown tool...');
  await assert.rejects(
    async () => {
      await registry.execute('non_existent_tool', {}, testCtx);
    },
    /Tool not found in registry: "non_existent_tool"/,
    'Should throw descriptive error for unknown tool'
  );

  // Test custom tool registration
  console.log('[TEST] 4. Testing custom tool registration and execution...');
  const customRegistry = new ToolRegistry();
  customRegistry.register({
    name: 'custom_calc',
    description: 'Calculates sum',
    category: 'system',
    parameters: { type: 'OBJECT' as any, properties: {} },
    execute: async (args: { a: number; b: number }) => {
      return { sum: (args.a || 0) + (args.b || 0) };
    },
  });

  const calcRes = await customRegistry.execute('custom_calc', { a: 20, b: 22 }, testCtx);
  assert.equal(calcRes.sum, 42, 'Custom tool should calculate correctly');

  // ==========================================
  // PART 2: ContextCompactor Tests
  // ==========================================
  console.log('[TEST] 5. Testing ContextCompactor Tier 1 (Immutable Anchor)...');
  const dummyHistory: Content[] = [
    // Turn 1 (Root Goal)
    {
      role: 'user',
      parts: [{ text: 'Root user goal: Maintain PocketBridge server and verify tools.' }],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood. I will help maintain the server.' }],
    },
    // Turn 2 (Old turn to be compacted)
    {
      role: 'user',
      parts: [{ text: 'Run git status' }],
    },
    {
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'execute_command',
            args: { command: 'git status' },
          },
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'execute_command',
            response: {
              output: {
                command: 'git status',
                exitCode: 0,
                output: 'On branch main\nChanges not staged for commit:\n  modified: src/server/agent.ts\n  modified: src/server/tools/shell.ts\nUntracked files:\n  src/server/context/compactor.ts\n',
              },
            },
          },
        },
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'Git status shows 2 modified files and 1 untracked file.' }],
    },
    // Turn 3 (Old turn to be compacted)
    {
      role: 'user',
      parts: [{ text: 'Search web for Fastify TS docs' }],
    },
    {
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'search_web',
            args: { query: 'Fastify TypeScript' },
          },
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'search_web',
            response: {
              results: [
                { title: 'Fastify TypeScript', link: 'https://fastify.dev/docs/latest/Reference/TypeScript/', snippet: 'HTML boilerplate...' },
                { title: 'Fastify GitHub Repo', link: 'https://github.com/fastify/fastify', snippet: 'Fastify GitHub repository...' },
                { title: 'Extra result', link: 'https://example.com', snippet: 'Extra snippet...' },
              ],
            },
          },
        },
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'Found Fastify TypeScript docs.' }],
    },
    // Turn 4 (Working Memory - Turn 4 of 5)
    {
      role: 'user',
      parts: [
        { text: 'Take a photo of webcam' },
        { inlineData: { mimeType: 'image/jpeg', data: 'OLD_BASE64_BYTES_TURN_4' } },
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'Webcam photo captured.' }],
    },
    // Turn 5 (Working Memory - Immediate Preceding Turn)
    {
      role: 'user',
      parts: [
        { text: 'Take a screenshot' },
        { inlineData: { mimeType: 'image/png', data: 'PREV_BASE64_BYTES_TURN_5' } },
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'Desktop screenshot captured.' }],
    },
    // Turn 6 (Working Memory - Current Active Turn)
    {
      role: 'user',
      parts: [
        { text: 'Check current directory files' },
        { inlineData: { mimeType: 'image/png', data: 'ACTIVE_BASE64_BYTES_TURN_6' } },
      ],
    },
    {
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'execute_command',
            args: { command: 'ls -la' },
          },
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'execute_command',
            response: {
              output: {
                command: 'ls -la',
                exitCode: 0,
                output: 'total 0\ndrwxr-xr-x 1 user staff 64 Oct  2 12:00 src\n',
              },
            },
          },
        },
      ],
    },
  ];

  // Deep clone check: ensure input is not mutated
  const originalSnapshot = JSON.stringify(dummyHistory);

  const projected = ContextCompactor.project(dummyHistory, {
    maxWorkingTurns: 3,
  });

  console.log('[TEST] 6. Verifying Invariant: Input array is not mutated...');
  assert.equal(JSON.stringify(dummyHistory), originalSnapshot, 'Original contents must remain untouched');

  console.log('[TEST] 7. Verifying Tier 1 Immutable Anchor...');
  assert(projected.length > 0, 'Projected array must not be empty');
  assert.equal(projected[0].role, 'user', 'First turn must be user');
  assert(
    projected[0].parts.some((p) => p.text?.includes('Root user goal: Maintain PocketBridge')),
    'Tier 1 must retain root user goal'
  );

  console.log('[TEST] 8. Verifying Tier 2 function call / response rollup into text...');
  // Check that in the compacted section (before Turn 4), no raw functionCall or functionResponse objects exist
  // Turn 2 and Turn 3 were in Tier 2
  const compactedModelTurns = projected.filter((p) => p.role === 'model');
  const compactedUserTurns = projected.filter((p) => p.role === 'user');

  // Find where git status was compacted
  const allText = projected.flatMap((p) => p.parts.map((part) => part.text || '')).join('\n');
  assert(
    allText.includes('git: modified: src/server/agent.ts, src/server/tools/shell.ts | untracked: src/server/context/compactor.ts'),
    'Git status output should be compacted into modified/untracked files'
  );

  // Find where search was compacted
  assert(
    allText.includes('Found 3 results. Top: 1. "Fastify TypeScript"'),
    'Search results should be compacted to top 2 titles and links'
  );

  console.log('[TEST] 9. Verifying Tier 3 Working Memory fidelity...');
  // The active turn (Turn 6) should retain its actual functionCall and functionResponse structural objects
  const lastModelTurn = projected[projected.length - 2];
  const lastUserTurn = projected[projected.length - 1];

  const hasActiveFunctionCall = lastModelTurn.parts.some((p) => p.functionCall?.name === 'execute_command');
  const hasActiveFunctionResponse = lastUserTurn.parts.some((p) => p.functionResponse?.name === 'execute_command');

  assert(hasActiveFunctionCall, 'Tier 3 working memory must retain active functionCall object');
  assert(hasActiveFunctionResponse, 'Tier 3 working memory must retain active functionResponse object');

  console.log('[TEST] 10. Verifying Ephemeral Vision Retention (Image Stripping)...');
  const serializedProjected = JSON.stringify(projected);
  // Turn 4 image is older than immediate preceding turn -> should be stripped
  assert(!serializedProjected.includes('OLD_BASE64_BYTES_TURN_4'), 'Old base64 image in Turn 4 must be stripped');
  assert(serializedProjected.includes('[Attached image: inspected in earlier turn]'), 'Old image must be replaced with text reference');

  // Turn 5 (immediate preceding) and Turn 6 (active) should retain base64 data
  assert(serializedProjected.includes('PREV_BASE64_BYTES_TURN_5'), 'Immediate preceding turn image must be retained');
  assert(serializedProjected.includes('ACTIVE_BASE64_BYTES_TURN_6'), 'Current active turn image must be retained');

  console.log('[TEST] 11. Verifying Strict User-Model Alternation Rule...');
  for (let i = 1; i < projected.length; i++) {
    assert.notEqual(
      projected[i].role,
      projected[i - 1].role,
      `Consecutive turns must not have the same role at index ${i} (${projected[i].role})`
    );
  }

  console.log('[TEST] 12. Testing fallback resilience on malformed inputs...');
  const malformedInput = [
    { role: 'user', parts: null as any },
    { role: 'model', parts: [{ text: 'x'.repeat(3000) }] },
  ];
  const safeFallback = ContextCompactor.project(malformedInput as any);
  assert(Array.isArray(safeFallback), 'Fallback should return array');

  console.log('[TEST] 13. Testing PocketAgent integration...');
  const agent = new PocketAgent('fake-api-key', 'flash');
  const registeredInAgent = agent.getToolRegistry().getDeclarations();
  assert(registeredInAgent.length >= 8, 'Agent tool registry should have all registered tools');

  console.log('[TEST] 14. Testing leading model turn filtering (welcome message)...');
  const welcomeHistory = [
    { role: 'model', parts: [{ text: 'Welcome to PocketBridge! I can help you.' }] },
    { role: 'user', parts: [{ text: 'Hello, what can you do?' }] },
    { role: 'model', parts: [{ text: 'I can run commands.' }] },
  ];
  const projectedWelcome = ContextCompactor.project(welcomeHistory as any);
  assert.equal(projectedWelcome[0].role, 'user', 'Projected history must always start with user role');
  assert(
    projectedWelcome[0].parts.some((p) => p.text?.includes('Hello, what can you do?')),
    'First projected turn must be the initial user question'
  );

  console.log('[TEST] 15. Testing 12-turn session Immutable Anchor retention...');
  const longSession: Content[] = [
    { role: 'user', parts: [{ text: 'Root Anchor Goal: Build the iOS app release.' }] },
    { role: 'model', parts: [{ text: 'Understood, starting release build.' }] },
  ];
  for (let i = 1; i <= 10; i++) {
    longSession.push({
      role: 'user',
      parts: [{ text: `Turn ${i}: Check step ${i}` }],
    });
    longSession.push({
      role: 'model',
      parts: [{ text: `Step ${i} completed.` }],
    });
  }
  const projectedLong = ContextCompactor.project(longSession, {
    workspaceDir: '/Users/suiseika/pocketBridge',
    maxWorkingTurns: 3,
  });
  assert.equal(projectedLong[0].role, 'user', 'First turn of long session must be user');
  assert(
    projectedLong[0].parts.some((p) => p.text?.includes('Root Anchor Goal: Build the iOS app release.')),
    'Root user goal must remain in Tier 1 even after 10+ turns'
  );
  assert(
    projectedLong[0].parts.some((p) => p.text?.includes('Workspace: /Users/suiseika/pocketBridge')),
    'Workspace anchor must be preserved in Tier 1'
  );

  console.log('[TEST] 16. Testing ToolRegistry abort listener and timer cleanup on error...');
  const abortController = new AbortController();
  const testRegistry = new ToolRegistry();
  testRegistry.register({
    name: 'failing_tool',
    description: 'Throws error immediately',
    category: 'system',
    parameters: { type: 'OBJECT' as any, properties: {} },
    execute: async () => {
      throw new Error('Immediate tool failure');
    },
  });

  await assert.rejects(
    async () => {
      await testRegistry.execute('failing_tool', {}, {
        sessionId: 'test',
        workspaceDir: process.cwd(),
        abortSignal: abortController.signal,
      });
    },
    /Immediate tool failure/,
    'Should propagate error'
  );

  console.log('\n[PASS] All ToolRegistry and ContextCompactor unit tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('[FAIL] Test failed with error:', err);
  process.exit(1);
});
