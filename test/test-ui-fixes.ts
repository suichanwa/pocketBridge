import puppeteer from 'puppeteer';
import path from 'node:path';

async function testUi() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

  // Type '/' into the input
  const input = await page.$('input[placeholder*="commands"]');
  if (input) {
    await input.type('/');
    await new Promise((r) => setTimeout(r, 600));

    // Capture autocomplete popup
    await page.screenshot({ path: path.resolve(process.cwd(), 'test-output/autocomplete_test.png') });
    console.log('✅ Captured autocomplete popup to test-output/autocomplete_test.png');
  }

  await browser.close();
}

testUi().catch(console.error);
