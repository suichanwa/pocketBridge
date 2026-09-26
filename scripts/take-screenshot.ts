#!/usr/bin/env npx tsx
import { takeMacScreenshot } from '../src/server/tools/screenshot.js';

async function main() {
  try {
    const windowOnly = process.argv.includes('--window');
    const shot = await takeMacScreenshot({ windowOnly });
    console.log(`Screenshot captured successfully!`);
    console.log(`URL: ${shot.publicUrl}`);
    console.log(`Path: ${shot.filePath}`);
    console.log(JSON.stringify(shot));
    process.exit(0);
  } catch (err: any) {
    console.error(`Screenshot error:`, err?.message || err);
    process.exit(1);
  }
}

main();
