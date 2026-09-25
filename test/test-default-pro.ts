import { PocketAgent } from '../src/server/agent.js';
import dotenv from 'dotenv';
dotenv.config();

const agent = new PocketAgent();

async function run() {
  console.log(`Agent model tier is: ${agent.getModelTier()}`);
  const res = await agent.handleUserMessage(
    'State in 1 sentence which model you are running on right now.',
    [],
    'test-default',
    {
      onUpdateMessage: (id, partial) => {
        console.log(`[Status: ${partial.status}]`, partial.content?.slice(0, 70));
      },
      onTerminalLog: (log) => {
        console.log(`[Terminal]`, log.command);
      },
      onTerminalChunk: (id, chunk) => {
        process.stdout.write(chunk);
      },
      onScreenshotReady: () => {},
    }
  );

  console.log('\n[Result]:', res);
}

run();
