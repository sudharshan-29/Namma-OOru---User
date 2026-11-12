import puppeteer from '../../Namma OOru/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import path from 'path';

const ARTIFACT_DIR = '/Users/blue/.gemini/antigravity-ide/brain/5c4924cb-e28c-4e1a-9406-87a7bfee1271';

async function captureModals() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });

  await page.waitForFunction(
    () => window.complaintMap && typeof window.complaintMap.whenReady === 'function',
    { timeout: 15000 }
  );
  await page.evaluate(async () => {
    await window.complaintMap.whenReady();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Click Dashboard Button and capture
  await page.click('#btn-open-dashboard');
  await new Promise(r => setTimeout(r, 600));
  const dashScreenshotPath = path.join(ARTIFACT_DIR, 'dashboard_modal_opened.png');
  await page.screenshot({ path: dashScreenshotPath });
  console.log(`Saved Dashboard modal screenshot to: ${dashScreenshotPath}`);

  // Close dashboard
  await page.click('#btn-close-dashboard');
  await new Promise(r => setTimeout(r, 400));

  // 2. Click Report Issue Button and capture
  await page.click('#btn-report-header');
  await new Promise(r => setTimeout(r, 600));
  const reportScreenshotPath = path.join(ARTIFACT_DIR, 'report_modal_opened.png');
  await page.screenshot({ path: reportScreenshotPath });
  console.log(`Saved Report Issue modal screenshot to: ${reportScreenshotPath}`);

  await browser.close();
}

captureModals().catch(console.error);
