import { PocketAgent } from '../src/server/agent.js';
import dotenv from 'dotenv';
dotenv.config();

const agent = new PocketAgent();

async function run() {
  console.log('Testing /agy slash command through PocketAgent...');
  const res = await agent.handleUserMessage(
    '/agy Calculate 123 * 456. Output only the numerical answer.',
    [],
    'test-msg-1',
    {
      onUpdateMessage: (id, partial) => {
        console.log(`[Message Update] ${partial.status}: ${partial.content?.slice(0, 60)}`);
      },
      onTerminalLog: (log) => {
        console.log(`[Terminal Start] ${log.command}`);
      },
      onTerminalChunk: (id, chunk) => {
        process.stdout.write(chunk);
      },
      onScreenshotReady: () => {},
    }
  );

  console.log('\n[Finished Result]:', res);
}

run();
