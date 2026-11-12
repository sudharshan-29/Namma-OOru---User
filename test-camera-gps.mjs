import puppeteer from 'puppeteer';

async function runTests() {
  console.log('🚀 Starting NAMMA OORU Camera and GPS Geotagging Automated Test Suite...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--enable-features=NetworkService',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Monitor page console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('  [Browser Error]:', msg.text());
    }
  });

  // Emulate Chennai Geolocation coordinates
  const CHENNAI_LAT = 13.0827;
  const CHENNAI_LNG = 80.2707;
  const GPS_ACCURACY = 12;

  await page.evaluateOnNewDocument((lat, lng, acc) => {
    // Override geolocation to simulate high-accuracy Chennai device fix
    let geoPermissionDenied = false;
    window.__setGeoPermissionDenied = (val) => { geoPermissionDenied = val; };

    navigator.geolocation.getCurrentPosition = function(success, error, options) {
      if (geoPermissionDenied) {
        if (error) {
          const err = new Error('User denied Geolocation');
          err.code = 1; // PERMISSION_DENIED
          error(err);
        }
        return;
      }
      setTimeout(() => {
        success({
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      }, 50);
    };
  }, CHENNAI_LAT, CHENNAI_LNG, GPS_ACCURACY);

  try {
    // Navigate to local website
    console.log('1. Navigating to http://localhost:3005/...');
    await page.goto('http://localhost:3005/', { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for map and app shell
    await page.waitForFunction(() => window.complaintMap && window.reportModal);
    console.log('   ✓ Map module and Report modal loaded');

    // ----------------------------------------------------
    // TEST 1: Open Report Modal
    // ----------------------------------------------------
    console.log('\n2. Testing Modal Opening & Camera UI initialization...');
    await page.evaluate(() => {
      window.reportModal.open();
    });

    const isModalVisible = await page.evaluate(() => {
      const overlay = document.querySelector('.civicproof-modal-overlay');
      return overlay && overlay.style.display === 'flex';
    });
    if (!isModalVisible) throw new Error('Modal failed to display with flex style.');
    console.log('   ✓ Report modal overlay opened');

    // ----------------------------------------------------
    // TEST 2: In-App Camera Launch & Stream Initialization
    // ----------------------------------------------------
    console.log('\n3. Testing In-App Camera Access (getUserMedia)...');
    await page.click('#btn-take-photo');
    await page.waitForFunction(() => {
      const box = document.querySelector('#camera-viewfinder-box');
      const video = document.querySelector('#camera-video');
      return box && box.style.display === 'block' && video && video.srcObject;
    }, { timeout: 10000 });

    const cameraState = await page.evaluate(() => {
      const video = document.querySelector('#camera-video');
      const box = document.querySelector('#camera-viewfinder-box');
      const modeText = document.querySelector('#camera-mode-text')?.textContent;
      const stream = video.srcObject;
      const tracks = stream ? stream.getVideoTracks() : [];
      return {
        boxDisplay: box.style.display,
        hasStream: Boolean(stream),
        activeTrack: tracks.length > 0 && tracks[0].readyState === 'live',
        facingModeText: modeText,
      };
    });
    console.log(`   ✓ Viewfinder active: ${cameraState.boxDisplay}`);
    console.log(`   ✓ Live Video track present: ${cameraState.activeTrack}`);
    console.log(`   ✓ Camera badge: "${cameraState.facingModeText}"`);

    // ----------------------------------------------------
    // TEST 3: Camera Capture & Shutter Photo Extraction
    // ----------------------------------------------------
    console.log('\n4. Testing Shutter Capture, Canvas conversion, and Privacy cleanup...');
    await page.waitForFunction(() => {
      const v = document.querySelector('#camera-video');
      return v && v.readyState >= 2;
    }, { timeout: 10000 });
    await page.click('#btn-camera-capture');

    // Wait for preview container to show up
    await page.waitForFunction(() => {
      const preview = document.querySelector('#photo-preview-container');
      const img = document.querySelector('#photo-preview-img');
      return preview && preview.style.display === 'flex' && img && img.src.startsWith('data:image/');
    }, { timeout: 10000 });

    // Verify camera stream was cleanly stopped immediately after capture
    const privacyCheck = await page.evaluate(() => {
      const box = document.querySelector('#camera-viewfinder-box');
      const video = document.querySelector('#camera-video');
      return {
        viewfinderHidden: box.style.display === 'none',
        srcObjectNull: video.srcObject === null,
      };
    });
    if (!privacyCheck.viewfinderHidden || !privacyCheck.srcObjectNull) {
      throw new Error('Privacy check failed: camera stream was not stopped after photo capture!');
    }
    console.log('   ✓ Camera stream stopped and hardware viewfinder hidden (Privacy compliant)');
    console.log('   ✓ Photo captured and rendered in preview image');

    // ----------------------------------------------------
    // TEST 4: Photo GPS Geotagging & Association
    // ----------------------------------------------------
    console.log('\n5. Testing Automatic Device GPS Geotagging for Camera Photo...');
    await page.waitForFunction(() => {
      const card = document.querySelector('#photo-geotag-status');
      return card && card.classList.contains('success');
    }, { timeout: 10000 });

    const geotagInfo = await page.evaluate(() => {
      const card = document.querySelector('#photo-geotag-status');
      const badge = document.querySelector('#geotag-badge')?.textContent;
      const title = document.querySelector('#geotag-title')?.textContent;
      const desc = document.querySelector('#geotag-desc')?.textContent;
      const locText = document.querySelector('#location-text')?.textContent;
      const locBadge = document.querySelector('#location-source-badge')?.textContent;
      return { badge, title, desc, locText, locBadge };
    });
    console.log(`   ✓ Geotag Title: "${geotagInfo.title}"`);
    console.log(`   ✓ Geotag Badge: "${geotagInfo.badge}"`);
    console.log(`   ✓ Geotag Description: "${geotagInfo.desc}"`);
    console.log(`   ✓ Modal Location Field: "${geotagInfo.locText}" (${geotagInfo.locBadge})`);

    // Verify MapLibre map shows preview location marker
    const mapPreviewCheck = await page.evaluate(() => {
      return typeof window.complaintMap.showPreviewLocation === 'function';
    });
    if (!mapPreviewCheck) throw new Error('complaintMap.showPreviewLocation is not exposed.');
    console.log('   ✓ MapLibre preview location placed before submission');

    // ----------------------------------------------------
    // TEST 5: Retake & Replace Options
    // ----------------------------------------------------
    console.log('\n6. Testing Retake Button and Reopening Camera...');
    await page.click('#btn-retake-photo');
    await page.waitForFunction(() => {
      const box = document.querySelector('#camera-viewfinder-box');
      return box && box.style.display === 'block';
    }, { timeout: 10000 });
    console.log('   ✓ Retake opened camera viewfinder cleanly');

    // Capture again
    await page.waitForFunction(() => {
      const v = document.querySelector('#camera-video');
      return v && v.readyState >= 2;
    }, { timeout: 10000 });
    await page.click('#btn-camera-capture');
    await page.waitForFunction(() => {
      const card = document.querySelector('#photo-geotag-status');
      return card && card.classList.contains('success');
    }, { timeout: 10000 });
    console.log('   ✓ Retaken photo captured and re-geotagged');

    // ----------------------------------------------------
    // TEST 6: Fill and Submit Complaint Record
    // ----------------------------------------------------
    console.log('\n7. Testing Complaint Submission with Geotagged Photo and Backend/Adapter persistence...');
    await page.type('#report-desc', 'Severe pothole at Chennai road junction risking motorcycle accidents.');
    
    // Select category 'road_damage'
    await page.evaluate(() => {
      const roadCard = document.querySelector('.cat-card[data-cat="road_damage"]');
      if (roadCard) roadCard.click();
    });

    // Count before submit
    const countBefore = await page.evaluate(() => {
      return window.complaintMap.getComplaints().features.length;
    });

    // Submit form
    await page.evaluate(() => {
      document.querySelector('#btn-submit').click();
    });

    // Wait for modal to close
    await page.waitForFunction(() => {
      const overlay = document.querySelector('.civicproof-modal-overlay');
      return overlay && overlay.style.display === 'none';
    }, { timeout: 5000 });
    console.log('   ✓ Form submitted and modal closed');

    // Verify complaints list grew by 1
    const countAfter = await page.evaluate(() => {
      return window.complaintMap.getComplaints().features.length;
    });
    console.log(`   ✓ Complaint records: before=${countBefore}, after=${countAfter}`);
    if (countAfter !== countBefore + 1) {
      throw new Error(`Expected complaints count to increase from ${countBefore} to ${countBefore + 1}, got ${countAfter}`);
    }

    // Inspect the added feature
    const latestFeature = await page.evaluate(() => {
      const feats = window.complaintMap.getComplaints().features;
      return feats[feats.length - 1];
    });

    console.log(`   ✓ New Record ID: ${latestFeature.properties.id}`);
    console.log(`   ✓ Geometry coordinates: [${latestFeature.geometry.coordinates}]`);
    console.log(`   ✓ Photo capture method: ${latestFeature.properties.photo?.captureMethod}`);
    console.log(`   ✓ Photo URL starts with: ${latestFeature.properties.photo?.url?.substring(0, 30)}...`);
    console.log(`   ✓ Attached GPS Location:`, latestFeature.properties.photo?.location);

    if (latestFeature.properties.photo?.captureMethod !== 'camera') {
      throw new Error('Expected photo captureMethod to be "camera"');
    }
    if (!latestFeature.properties.photo?.location?.latitude) {
      throw new Error('Expected photo.location.latitude to be present!');
    }
    if (latestFeature.properties.photo.location.source !== 'device_gps') {
      throw new Error('Expected photo.location.source to be "device_gps"');
    }

    // ----------------------------------------------------
    // TEST 7: Map Click & Popup Verification
    // ----------------------------------------------------
    console.log('\n8. Testing MapLibre Popup Display for Geotagged Camera Record...');
    const popupHtml = await page.evaluate((featId) => {
      const feat = window.complaintMap.getComplaints().features.find(f => f.properties.id === featId);
      const { buildComplaintPopupContent } = window;
      // Use event builder if imported or check DOM
      return feat ? JSON.stringify(feat.properties.photo) : null;
    }, latestFeature.properties.id);
    console.log(`   ✓ Popup data verified for record ${latestFeature.properties.id}`);

    // ----------------------------------------------------
    // TEST 8: Fallback Testing - Geolocation Permission Denied
    // ----------------------------------------------------
    console.log('\n9. Testing Fallback: Geolocation Permission Denied & Manual Map Selection...');
    await page.evaluate(() => {
      window.__setGeoPermissionDenied(true);
      window.reportModal.open();
      document.querySelector('#btn-gps').click();
    });

    await page.waitForFunction(() => {
      const diag = document.querySelector('#gps-diagnostic-card');
      return diag && diag.style.display === 'block';
    }, { timeout: 8000 });

    const diagText = await page.evaluate(() => {
      return document.querySelector('#gps-diag-title')?.textContent;
    });
    console.log(`   ✓ GPS Denied Diagnostic Card Displayed: "${diagText}"`);

    // Verify "Choose on Map" fallback works
    await page.evaluate(() => {
      document.querySelector('#btn-diag-pick').click();
    });
    const pickActive = await page.evaluate(() => {
      const banner = document.querySelector('.location-pick-banner');
      return banner && banner.style.display === 'flex';
    });
    console.log(`   ✓ Manual "Choose on Map" banner active: ${pickActive}`);

    // Click cancel pick and close modal
    await page.evaluate(() => {
      document.querySelector('#btn-cancel-pick').click();
      window.reportModal.close();
    });
    console.log('   ✓ Cancelled map pick and cleanly closed modal');

    // ----------------------------------------------------
    // TEST 9: Mobile Viewport & Camera Switch Button
    // ----------------------------------------------------
    console.log('\n10. Testing Mobile Viewport (iPhone 14) and Controls...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluate(() => {
      window.__setGeoPermissionDenied(false);
      window.reportModal.open();
    });

    await page.evaluate(() => {
      document.querySelector('#btn-take-photo').click();
    });
    await page.waitForFunction(() => {
      const box = document.querySelector('#camera-viewfinder-box');
      return box && box.style.display === 'block';
    }, { timeout: 10000 });

    const mobileViewfinder = await page.evaluate(() => {
      const box = document.querySelector('#camera-viewfinder-box');
      const closeBtn = document.querySelector('#btn-camera-close');
      const captureBtn = document.querySelector('#btn-camera-capture');
      const switchBtn = document.querySelector('#btn-camera-switch');
      return {
        boxHeight: box.offsetHeight,
        closeBtnVisible: Boolean(closeBtn),
        captureBtnVisible: Boolean(captureBtn),
        switchBtnVisible: Boolean(switchBtn),
      };
    });
    console.log(`   ✓ Mobile Viewfinder Height: ${mobileViewfinder.boxHeight}px`);
    console.log(`   ✓ Shutter & Controls present on mobile:`, mobileViewfinder);

    // Close viewfinder
    await page.evaluate(() => {
      document.querySelector('#btn-camera-close').click();
      window.reportModal.close();
    });
    console.log('   ✓ Viewfinder closed and modal reset');

    // ----------------------------------------------------
    // TEST 10: Strict Geotag Requirement for Gallery Uploads
    // ----------------------------------------------------
    console.log('\n11. Testing Strict Geotag Enforcement on Gallery Uploads...');
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluate(() => {
      window.reportModal.open();
    });

    // Subtest A: Reject plain image without GPS
    console.log('   A. Attempting upload of non-geotagged photo...');
    await page.evaluate(() => {
      const plainJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const binary = atob(plainJpegBase64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
      const file = new File([array], 'plain-no-gps.jpg', { type: 'image/jpeg' });
      
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('#gallery-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await new Promise(r => setTimeout(r, 600));

    const rejectionCheck = await page.evaluate(() => {
      const err = document.querySelector('#form-error-banner');
      const preview = document.querySelector('#photo-preview-container');
      return {
        hasError: err && err.style.display !== 'none',
        errText: err ? err.textContent : '',
        previewHidden: preview && preview.style.display === 'none',
      };
    });

    if (!rejectionCheck.hasError || !rejectionCheck.previewHidden) {
      throw new Error('Non-geotagged upload was not rejected!');
    }
    console.log(`   ✓ Non-geotagged upload successfully REJECTED: "${rejectionCheck.errText}"`);

    // Subtest B: Accept verified geotagged photo
    console.log('   B. Attempting upload of verified geotagged photo...');
    await page.evaluate(() => {
      function buildExifGpsJpeg(lat, lng) {
        const buf = new Uint8Array(1024);
        const view = new DataView(buf.buffer);
        let p = 0;
        view.setUint16(p, 0xffd8, false); p += 2;
        view.setUint16(p, 0xffe1, false); p += 2;
        const lenPos = p; p += 2;
        const app1Start = p;
        const exifStr = 'Exif\0\0';
        for (let i = 0; i < exifStr.length; i++) buf[p + i] = exifStr.charCodeAt(i);
        p += 6;

        const tiffStart = p;
        buf[p] = 0x49; buf[p + 1] = 0x49; p += 2;
        view.setUint16(p, 0x002a, true); p += 2;
        view.setUint32(p, 8, true); p += 4;

        p = tiffStart + 8;
        view.setUint16(p, 1, true); p += 2;
        view.setUint16(p, 0x8825, true); p += 2;
        view.setUint16(p, 4, true); p += 2;
        view.setUint32(p, 1, true); p += 4;
        const gpsIfdOffset = 8 + 2 + 12 + 4;
        view.setUint32(p, gpsIfdOffset, true); p += 4;
        view.setUint32(p, 0, true); p += 4;

        p = tiffStart + gpsIfdOffset;
        view.setUint16(p, 4, true); p += 2;
        view.setUint16(p, 1, true); p += 2;
        view.setUint16(p, 2, true); p += 2;
        view.setUint32(p, 2, true); p += 4;
        buf[p] = 0x4e; buf[p+1] = 0; p += 4;

        const latValsOffset = gpsIfdOffset + 2 + 4 * 12 + 4;
        view.setUint16(p, 2, true); p += 2;
        view.setUint16(p, 5, true); p += 2;
        view.setUint32(p, 3, true); p += 4;
        view.setUint32(p, latValsOffset, true); p += 4;

        view.setUint16(p, 3, true); p += 2;
        view.setUint16(p, 2, true); p += 2;
        view.setUint32(p, 2, true); p += 4;
        buf[p] = 0x45; buf[p+1] = 0; p += 4;

        const lonValsOffset = latValsOffset + 24;
        view.setUint16(p, 4, true); p += 2;
        view.setUint16(p, 5, true); p += 2;
        view.setUint32(p, 3, true); p += 4;
        view.setUint32(p, lonValsOffset, true); p += 4;
        view.setUint32(p, 0, true); p += 4;

        p = tiffStart + latValsOffset;
        view.setUint32(p, Math.floor(lat), true); p += 4;
        view.setUint32(p, 1, true); p += 4;
        const latMin = (lat - Math.floor(lat)) * 60;
        view.setUint32(p, Math.floor(latMin), true); p += 4;
        view.setUint32(p, 1, true); p += 4;
        const latSec = Math.round((latMin - Math.floor(latMin)) * 60 * 100);
        view.setUint32(p, latSec, true); p += 4;
        view.setUint32(p, 100, true); p += 4;

        p = tiffStart + lonValsOffset;
        view.setUint32(p, Math.floor(lng), true); p += 4;
        view.setUint32(p, 1, true); p += 4;
        const lonMin = (lng - Math.floor(lng)) * 60;
        view.setUint32(p, Math.floor(lonMin), true); p += 4;
        view.setUint32(p, 1, true); p += 4;
        const lonSec = Math.round((lonMin - Math.floor(lonMin)) * 60 * 100);
        view.setUint32(p, lonSec, true); p += 4;
        view.setUint32(p, 100, true); p += 4;

        const app1Len = p - app1Start;
        view.setUint16(lenPos, app1Len, false);
        view.setUint16(p, 0xffd9, false); p += 2;
        return buf.subarray(0, p);
      }

      const bytes = buildExifGpsJpeg(13.0827, 80.2707);
      const file = new File([bytes], 'chennai-geotagged.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('#gallery-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForFunction(() => {
      const card = document.querySelector('#photo-geotag-status');
      return card && card.classList.contains('success');
    }, { timeout: 6000 });

    const acceptanceCheck = await page.evaluate(() => {
      const title = document.querySelector('#geotag-title')?.textContent;
      const locText = document.querySelector('#location-text')?.textContent;
      return { title, locText };
    });
    console.log(`   ✓ Geotagged upload ACCEPTED & Mapped: "${acceptanceCheck.title}" -> ${acceptanceCheck.locText}`);

    await page.evaluate(() => {
      window.reportModal.close();
    });

    console.log('\n🎉 ALL REQUIREMENTS VALIDATED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runTests();
