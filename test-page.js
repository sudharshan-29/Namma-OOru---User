import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  
  console.log('Navigating to http://localhost:3003/');
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle0' });
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'public/screenshot-test.png' });
  
  console.log('Clicking the welcome screen...');
  await page.click('#welcome-screen');
  
  await new Promise(r => setTimeout(r, 1000));
  console.log('Taking second screenshot...');
  await page.screenshot({ path: 'public/screenshot-test2.png' });
  
  await browser.close();
})();
