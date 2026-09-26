#!/usr/bin/env npx tsx
import { takeCameraPhoto } from '../src/server/tools/camera.js';

async function main() {
  try {
    const warmup = process.argv.includes('--fast') ? 0.3 : 0.8;
    const photo = await takeCameraPhoto({ warmupSeconds: warmup });
    console.log(`Photo captured successfully!`);
    console.log(`URL: ${photo.publicUrl}`);
    console.log(`Path: ${photo.filePath}`);
    console.log(JSON.stringify(photo));
    process.exit(0);
  } catch (err: any) {
    console.error(`Camera error:`, err?.message || err);
    process.exit(1);
  }
}

main();
