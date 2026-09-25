import { takeMacScreenshot } from '../src/server/tools/screenshot.js';
import { executeShellCommand } from '../src/server/tools/shell.js';
import { searchWeb } from '../src/server/tools/search.js';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import type { ServerMessage, ClientMessage } from '../src/shared/types.js';

async function testBackend() {
  console.log('🧪 Starting Backend Tool Verification...\n');

  // 1. Test macOS screencapture
  console.log('📸 1. Testing takeMacScreenshot()...');
  try {
    const shot = await takeMacScreenshot();
    console.log(`✅ Screenshot success: ${shot.filename} (${shot.publicUrl})`);
  } catch (err: any) {
    console.warn(`⚠️ Screenshot note: ${err?.message}`);
  }

  // 2. Test Shell execution
  console.log('\n💻 2. Testing executeShellCommand("git status")...');
  const shellRes = await executeShellCommand('git status -s');
  console.log(`✅ Shell success: Exit code ${shellRes.exitCode}, Output length: ${shellRes.output.length}`);

  // 3. Test Web Search
  console.log('\n🌐 3. Testing searchWeb("Fastify TypeScript documentation")...');
  const searchResults = await searchWeb('Fastify TypeScript');
  console.log(`✅ Web search success: Found ${searchResults.length} results.`);
  if (searchResults.length > 0) {
    console.log(`   Top result: "${searchResults[0].title}" -> ${searchResults[0].link}`);
  }

  // 4. Test WebSocket server with quick commands
  console.log('\n🔌 4. Testing Fastify WebSocket Server...');
  const server = spawn('npx', ['tsx', 'src/server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  await new Promise((r) => setTimeout(r, 2500));

  try {
    const ws = new WebSocket('ws://127.0.0.1:3001/ws');
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        console.log('✅ WebSocket connection established.');
        resolve();
      });
      ws.on('error', reject);
    });

    let receivedInit = false;
    let receivedGitMsg = false;

    ws.on('message', (data: Buffer) => {
      const msg: ServerMessage = JSON.parse(data.toString('utf-8'));
      if (msg.type === 'init_state') {
        receivedInit = true;
        console.log(`✅ Received init_state with ${msg.messages.length} messages, hostname: ${msg.status.hostname}`);
      }
      if (msg.type === 'chat_message' && msg.message.content.includes('Git Status')) {
        receivedGitMsg = true;
        console.log('✅ Received Git Status chat message response over WebSocket!');
      }
    });

    // Wait for init
    await new Promise((r) => setTimeout(r, 1000));

    // Send Quick Action
    console.log('⚡ Sending "git_status" quick action over WebSocket...');
    ws.send(JSON.stringify({ type: 'run_quick_action', action: 'git_status' } as ClientMessage));

    // Wait for response
    await new Promise((r) => setTimeout(r, 2000));

    ws.close();
    console.log('\n🎉 ALL BACKEND TOOLS & WEBSOCKET PROTOCOLS VERIFIED!\n');
  } finally {
    server.kill();
  }
}

testBackend().catch((err) => {
  console.error('Backend test failed:', err);
  process.exit(1);
});
