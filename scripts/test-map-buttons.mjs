import puppeteer from '../../Namma OOru/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

async function testButtons() {
  console.log('Testing Map Layout Action Buttons...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('  [Browser Log]:', msg.text()));
  page.on('pageerror', err => console.log('  [Browser Error]:', err.message));

  console.log('Navigating to http://localhost:3001...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' });

  // Scroll down so map is in full view
  console.log('Scrolling to map...');
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });

  // Wait for complaintMap ready state
  await page.waitForFunction(
    () => window.complaintMap && typeof window.complaintMap.whenReady === 'function',
    { timeout: 15000 }
  );
  await page.evaluate(async () => {
    await window.complaintMap.whenReady();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Hit test on all 3 buttons
  const hitTest = await page.evaluate(() => {
    function testEl(id) {
      const el = document.getElementById(id);
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        found: true,
        id,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        hitTag: hit?.tagName,
        hitId: hit?.id,
        hitClass: hit?.className,
        isSameOrChild: el.contains(hit),
      };
    }
    return {
      reportBtn: testEl('btn-report-header'),
      dashboardBtn: testEl('btn-open-dashboard'),
      homeBtn: testEl('btn-return-welcome'),
    };
  });

  console.log('\n--- BUTTON HIT TEST RESULTS ---');
  console.log('Report Issue Button:', hitTest.reportBtn);
  console.log('Dashboard Button:   ', hitTest.dashboardBtn);
  console.log('Home Button:        ', hitTest.homeBtn);

  if (!hitTest.reportBtn.isSameOrChild) {
    throw new Error(`Report button blocked by ${hitTest.reportBtn.hitTag}.${hitTest.reportBtn.hitClass}`);
  }
  if (!hitTest.dashboardBtn.isSameOrChild) {
    throw new Error(`Dashboard button blocked by ${hitTest.dashboardBtn.hitTag}.${hitTest.dashboardBtn.hitClass}`);
  }
  if (!hitTest.homeBtn.isSameOrChild) {
    throw new Error(`Home button blocked by ${hitTest.homeBtn.hitTag}.${hitTest.homeBtn.hitClass}`);
  }

  // 2. Test clicking [ 📊 Dashboard ]
  console.log('\nClicking [ 📊 Dashboard ]...');
  await page.click('#btn-open-dashboard');
  await new Promise(r => setTimeout(r, 500));

  const dashState = await page.evaluate(() => {
    const m = document.getElementById('dashboard-modal');
    return {
      display: m?.style.display,
      computedDisplay: m ? window.getComputedStyle(m).display : 'none',
      ariaHidden: m?.getAttribute('aria-hidden'),
    };
  });
  console.log('Dashboard modal state:', dashState);
  if (dashState.computedDisplay !== 'flex') {
    throw new Error(`Expected dashboard modal display to be flex, got ${dashState.computedDisplay}`);
  }

  // Close dashboard modal
  await page.click('#btn-close-dashboard');
  await new Promise(r => setTimeout(r, 400));

  // 3. Test clicking [ 📍 Report Issue ]
  console.log('\nClicking [ 📍 Report Issue ]...');
  await page.click('#btn-report-header');
  await new Promise(r => setTimeout(r, 500));

  const reportState = await page.evaluate(() => {
    const overlay = document.querySelector('.civicproof-modal-overlay');
    return {
      found: Boolean(overlay),
      display: overlay?.style.display,
      computedDisplay: overlay ? window.getComputedStyle(overlay).display : 'none',
    };
  });
  console.log('Report modal state:', reportState);
  if (reportState.computedDisplay !== 'flex') {
    throw new Error(`Expected report modal display to be flex, got ${reportState.computedDisplay}`);
  }

  // Close report modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.civicproof-modal-overlay .btn-close');
    if (closeBtn) closeBtn.click();
    else if (window.reportModal) window.reportModal.close();
  });
  await new Promise(r => setTimeout(r, 400));

  // 4. Test clicking [ 🏠 ] Home Button
  console.log('\nClicking [ 🏠 ] Home Button...');
  const beforeScrollY = await page.evaluate(() => window.scrollY);
  console.log(`ScrollY before home button click: ${beforeScrollY}`);

  await page.click('#btn-return-welcome');
  // Wait for smooth scroll animation to finish
  await new Promise(r => setTimeout(r, 1200));

  const afterScrollY = await page.evaluate(() => window.scrollY);
  console.log(`ScrollY after home button click: ${afterScrollY}`);

  if (afterScrollY > 100) {
    throw new Error(`Expected scrollY to return near 0, but was ${afterScrollY}`);
  }

  console.log('\n✓ ALL 3 MAP LAYOUT ACTION BUTTONS ARE WORKING 100% PERFECTLY!');
  await browser.close();
}

testButtons().catch(err => {
  console.error('\n❌ BUTTON TEST FAILED:', err.message);
  process.exit(1);
});
