import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle0' });
  
  const rect = await page.evaluate(() => {
    const el = document.getElementById('welcome-screen');
    const bounds = el.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, top: bounds.top, left: bounds.left };
  });
  console.log('Welcome Screen Bounds:', rect);
  
  await browser.close();
})();
