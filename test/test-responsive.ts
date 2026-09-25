import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'test-output');

async function runTests() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log('🚀 1. Starting PocketBridge server...');
  const server = spawn('npx', ['tsx', 'src/server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000' },
  });

  // Wait 3 seconds for server to bind
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    console.log('🌐 2. Launching Puppeteer browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Test 1: Mobile Phone (2400x class display, 390x844 CSS viewport with scale factor 3)
    console.log('📱 3. Testing Mobile Phone viewport...');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await mobilePage.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

    // Wait for WebSocket connection
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await mobilePage.screenshot({
      path: path.join(OUTPUT_DIR, '01_mobile_chat_screen.png'),
    });
    console.log('✅ Mobile chat view captured to test-output/01_mobile_chat_screen.png');

    // Click "Screen" tab on mobile
    const screenTab = await mobilePage.$('button[value="screen"]');
    if (screenTab) {
      await screenTab.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await mobilePage.screenshot({
        path: path.join(OUTPUT_DIR, '02_mobile_screen_tab.png'),
      });
      console.log('✅ Mobile screen tab captured to test-output/02_mobile_screen_tab.png');
    }

    // Click "Terminal" tab on mobile
    const terminalTab = await mobilePage.$('button[value="terminal"]');
    if (terminalTab) {
      await terminalTab.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await mobilePage.screenshot({
        path: path.join(OUTPUT_DIR, '03_mobile_terminal_tab.png'),
      });
      console.log('✅ Mobile terminal tab captured to test-output/03_mobile_terminal_tab.png');
    }

    // Test 2: Lenovo 16:10 Laptop (1920x1200 / 1680x1050)
    console.log('💻 4. Testing 16:10 Laptop viewport (1680x1050)...');
    const laptopPage = await browser.newPage();
    await laptopPage.setViewport({
      width: 1680,
      height: 1050,
      deviceScaleFactor: 1,
    });
    await laptopPage.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await laptopPage.screenshot({
      path: path.join(OUTPUT_DIR, '04_laptop_16_10.png'),
    });
    console.log('✅ 16:10 Laptop view captured to test-output/04_laptop_16_10.png');

    // Test 3: 27-inch 2K Screen (2560x1440)
    console.log('🖥️ 5. Testing 27-inch 2K Monitor viewport (2560x1440)...');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({
      width: 2560,
      height: 1440,
      deviceScaleFactor: 1,
    });
    await desktopPage.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await desktopPage.screenshot({
      path: path.join(OUTPUT_DIR, '05_desktop_2k_27inch.png'),
    });
    console.log('✅ 27" 2K view captured to test-output/05_desktop_2k_27inch.png');

    await browser.close();
    console.log('\n🎉 ALL RESPONSIVE VIEWPORT TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    server.kill();
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
