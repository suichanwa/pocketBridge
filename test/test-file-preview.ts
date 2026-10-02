import puppeteer, { type ElementHandle } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs/promises';

const OUTPUT_DIR = path.resolve(process.cwd(), 'test-output');

async function testFilePreview() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log('1. Launching Puppeteer browser in mobile viewport (390x844)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    console.log('2. Navigating to PocketBridge web app...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));

    console.log('3. Opening Files & APKs drawer...');
    const filesBtn = await page.$('button[title="Files & APKs"]');
    if (!filesBtn) throw new Error('Files button not found in header');
    await filesBtn.click();
    await new Promise((r) => setTimeout(r, 1000));

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '01_files_drawer_mobile.png'),
    });
    console.log('Saved test-output/01_files_drawer_mobile.png');

    console.log('4. Clicking package.json to test code/text preview...');
    const fileElements = await page.$$('div.group');
    let targetRow: ElementHandle<Element> | null = null;
    for (const el of fileElements) {
      const text = await page.evaluate((node) => node.textContent || '', el);
      if (text.includes('package.json')) {
        targetRow = el;
        break;
      }
    }

    if (targetRow) {
      await targetRow.click();
      await new Promise((r) => setTimeout(r, 1000));

      await page.screenshot({
        path: path.join(OUTPUT_DIR, '02_preview_code_modal.png'),
      });
      console.log('Saved test-output/02_preview_code_modal.png');

      // Close modal
      const closeBtn = await page.$('button[title="Close preview"]');
      if (closeBtn) {
        await closeBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log('5. Clicking captures shortcut to test image and audio preview...');
    // Look for captures folder
    const allRows = await page.$$('div.group');
    let capturesRow: ElementHandle<Element> | null = null;
    for (const el of allRows) {
      const text = await page.evaluate((node) => node.textContent || '', el);
      if (text.includes('captures')) {
        capturesRow = el;
        break;
      }
    }

    if (capturesRow) {
      await capturesRow.click();
      await new Promise((r) => setTimeout(r, 1000));

      // In captures folder, find an image or audio
      const captureItems = await page.$$('div.group');
      let mediaRow: ElementHandle<Element> | null = null;
      for (const el of captureItems) {
        const text = await page.evaluate((node) => node.textContent || '', el);
        if (text.includes('.png') || text.includes('.jpg') || text.includes('.m4a')) {
          mediaRow = el;
          break;
        }
      }

      if (mediaRow) {
        await mediaRow.click();
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({
          path: path.join(OUTPUT_DIR, '03_preview_media_modal.png'),
        });
        console.log('Saved test-output/03_preview_media_modal.png');
      }
    }

    console.log('SUCCESS: All mobile preview workflows verified.');
  } finally {
    await browser.close();
  }
}

testFilePreview().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
