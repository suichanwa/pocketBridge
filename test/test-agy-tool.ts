import { PocketAgent } from '../src/server/agent.js';
import dotenv from 'dotenv';
dotenv.config();

const agent = new PocketAgent();

async function run() {
  console.log('Testing autonomous delegation to run_agy_task...');
  const res = await agent.handleUserMessage(
    'Please delegate this hard task to Antigravity (agy): inspect the git commit log in /Users/suiseika/pocketBridge and summarize the latest 2 commits.',
    [],
    'test-msg-2',
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
