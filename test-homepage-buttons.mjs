import puppeteer from 'puppeteer';

async function testHomepageButtons() {
  console.log('🚀 Running Comprehensive Test for Homepage Buttons and Accessibility...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('  [Browser Error]:', msg.text());
    }
  });

  try {
    console.log('1. Navigating to http://localhost:3005/...');
    await page.goto('http://localhost:3005/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    // Verify elements exist in DOM
    const buttons = await page.evaluate(() => {
      const ids = [
        'home-btn-logo',
        'home-btn-nav-home',
        'home-btn-nav-report',
        'home-btn-nav-explore',
        'home-btn-nav-dashboard',
        'home-btn-nav-about',
        'home-btn-hero-report',
        'home-btn-hero-explore',
      ];
      return ids.map((id) => {
        const el = document.getElementById(id);
        const rect = el ? el.getBoundingClientRect() : null;
        return {
          id,
          exists: Boolean(el),
          rect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), left: Math.round(rect.left) } : null,
          ariaLabel: el ? el.getAttribute('aria-label') : null,
          role: el ? el.getAttribute('role') || el.tagName.toLowerCase() : null,
        };
      });
    });

    console.log('   ✓ Detected homepage interactive buttons:');
    buttons.forEach((b) => {
      if (!b.exists) throw new Error(`Button #${b.id} missing in DOM!`);
      console.log(`     - #${b.id}: "${b.ariaLabel}" [${b.rect.width}x${b.rect.height}px at (${b.rect.left}, ${b.rect.top})]`);
    });

    // ----------------------------------------------------
    // TEST 1: Hero "Report an Issue" button click
    // ----------------------------------------------------
    console.log('\n2. Testing Hero "Report an Issue" button (#home-btn-hero-report)...');
    await page.click('#home-btn-hero-report');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.civicproof-modal-overlay');
      return modal && modal.style.display === 'flex';
    }, { timeout: 5000 });
    console.log('   ✓ Report modal opened successfully from Hero CTA');

    // Close modal
    await page.click('.btn-close');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.civicproof-modal-overlay');
      return modal && modal.style.display === 'none';
    }, { timeout: 5000 });
    console.log('   ✓ Modal closed');

    // ----------------------------------------------------
    // TEST 2: Nav "Report" button click
    // ----------------------------------------------------
    console.log('\n4. Testing Nav "Report" button (#home-btn-nav-report)...');
    await page.click('#home-btn-nav-report');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.civicproof-modal-overlay');
      return modal && modal.style.display === 'flex';
    }, { timeout: 5000 });
    console.log('   ✓ Report modal opened successfully from Nav "Report"');

    await page.click('.btn-close');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.civicproof-modal-overlay');
      return modal && modal.style.display === 'none';
    }, { timeout: 5000 });
    console.log('   ✓ Modal closed');

    // ----------------------------------------------------
    // TEST 4: Nav "Dashboard" button click
    // ----------------------------------------------------
    console.log('\n5. Testing Nav "Dashboard" button (#home-btn-nav-dashboard)...');
    await page.click('#home-btn-nav-dashboard');
    await page.waitForFunction(() => {
      const modal = document.getElementById('dashboard-modal');
      return modal && modal.style.display === 'flex';
    }, { timeout: 5000 });
    console.log('   ✓ GCC Civic Intelligence Dashboard modal opened successfully');

    await page.click('#btn-close-dashboard');
    await page.waitForFunction(() => {
      const modal = document.getElementById('dashboard-modal');
      return modal && modal.style.display === 'none';
    }, { timeout: 5000 });
    console.log('   ✓ Dashboard modal closed');

    // ----------------------------------------------------
    // TEST 5: Nav "About" button click
    // ----------------------------------------------------
    console.log('\n6. Testing Nav "About" button (#home-btn-nav-about)...');
    await page.click('#home-btn-nav-about');
    await page.waitForFunction(() => {
      const modal = document.getElementById('about-modal');
      return modal && modal.style.display === 'flex';
    }, { timeout: 5000 });
    console.log('   ✓ About NAMMA OORU modal opened successfully');

    await page.click('#btn-close-about');
    await page.waitForFunction(() => {
      const modal = document.getElementById('about-modal');
      return modal && modal.style.display === 'none';
    }, { timeout: 5000 });
    console.log('   ✓ About modal closed');

    // ----------------------------------------------------
    // TEST 6: Hero "Explore the Map" button click
    // ----------------------------------------------------
    console.log('\n7. Testing Hero "Explore the Map" button (#home-btn-hero-explore)...');
    await page.click('#home-btn-hero-explore');
    
    // Wait for scroll transition to bottom
    await page.waitForFunction(() => {
      const shell = document.getElementById('app-shell');
      return window.scrollY > 4000 && shell && shell.style.opacity === '1';
    }, { timeout: 8000 });

    const mapState = await page.evaluate(() => ({
      scrollY: window.scrollY,
      appShellOpacity: document.getElementById('app-shell')?.style.opacity,
      cinematicOpacity: document.getElementById('cinematic-container')?.style.opacity,
      isMapRevealed: window.scrollAnimation?.isMapRevealed,
    }));
    console.log('   ✓ Smoothly scrolled down to map:', mapState);

    // Return to home page overview
    console.log('   Returning to top welcome screen via Header Overview button...');
    await page.click('#btn-return-welcome');
    await page.waitForFunction(() => window.scrollY < 100, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 800));
    console.log('   ✓ Successfully returned to home page (scrollY: ' + await page.evaluate(() => window.scrollY) + ')');

    // ----------------------------------------------------
    // TEST 7: Mobile Viewport (iPhone 14) and Floating Mobile Bar
    // ----------------------------------------------------
    console.log('\n8. Testing Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('resize'));
    });
    await new Promise((r) => setTimeout(r, 600));

    const mobileCheck = await page.evaluate(() => {
      const bar = document.querySelector('.home-mobile-actions');
      const repBtn = document.getElementById('home-btn-mobile-report');
      const expBtn = document.getElementById('home-btn-mobile-explore');
      const navAbout = document.getElementById('home-btn-nav-about');
      return {
        barVisible: bar && getComputedStyle(bar).display !== 'none',
        repBtnVisible: Boolean(repBtn),
        expBtnVisible: Boolean(expBtn),
        navAboutVisible: Boolean(navAbout),
      };
    });
    console.log('   ✓ Mobile Quick Action Bar active:', mobileCheck);
    if (!mobileCheck.barVisible) throw new Error('Mobile action bar not visible on mobile viewport!');

    // Click mobile report button
    console.log('   Testing Mobile "Report Issue" button click...');
    await page.click('#home-btn-mobile-report');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.civicproof-modal-overlay');
      return modal && modal.style.display === 'flex';
    }, { timeout: 5000 });
    console.log('   ✓ Mobile Report button opened modal');
    await page.click('.btn-close');
    await page.waitForFunction(() => {
      const modal = document.querySelector('.civicproof-modal-overlay');
      return modal && modal.style.display === 'none';
    }, { timeout: 5000 });

    // ----------------------------------------------------
    // TEST 8: Keyboard Focus Accessibility
    // ----------------------------------------------------
    console.log('\n9. Testing Keyboard Tab Focus Navigation & Focus-Visible rings...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('resize'));
    });
    await new Promise((r) => setTimeout(r, 500));

    // Tab through buttons
    const focusedIds = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      const activeId = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);
      if (activeId && !focusedIds.includes(activeId)) {
        focusedIds.push(activeId);
      }
    }
    console.log('   ✓ Keyboard Tab navigation traversed buttons:', focusedIds);
    if (focusedIds.length < 5) {
      throw new Error('Keyboard tab focus did not traverse expected interactive buttons!');
    }

    console.log('\n🎉 ALL HOMEPAGE BUTTON ACCESSIBILITY TESTS PASSED!\n');
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

testHomepageButtons();
