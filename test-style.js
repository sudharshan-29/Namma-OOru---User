import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle0' });
  
  const display = await page.evaluate(() => {
    const el = document.getElementById('welcome-screen');
    const style = window.getComputedStyle(el);
    return {
      display: style.display,
      opacity: style.opacity,
      visibility: style.visibility,
      transform: style.transform,
      zIndex: style.zIndex,
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor
    };
  });
  console.log('Welcome Screen Style:', display);
  
  await browser.close();
})();
