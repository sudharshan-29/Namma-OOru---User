import { CATEGORY_CONFIG } from './style-config.js';
import { extractExifGps } from './exif-reader.js';

/**
 * Initializes the citizen complaint submission modal with support for
 * GPS-geotagged complaint photos, device camera capture, gallery EXIF extraction,
 * and street-level road snapping.
 *
 * @param {Object} config
 * @param {Object} config.complaintMap - Instance returned by createComplaintMap()
 * @param {HTMLElement} [config.mountContainer=document.body] - Container to mount modal
 * @param {Function} [config.onSubmitted] - Optional callback after successful submission
 * @returns {Object} { open, close, reset, destroy }
 */
export function initReportModal({ complaintMap, mountContainer = document.body, onSubmitted }) {
  // State
  let selectedCategory = 'road_damage';
  let selectedCoords = null; // { lng, lat }
  let selectedAccuracy = null; // in meters
  let locationSource = 'map_selected'; // 'device_gps' | 'exif_gps' | 'device_gps_at_upload' | 'map_selected'
  let selectedRoadName = null;
  let selectedRoadGeometry = null;
  let isRoadSnapped = false;
  let isAnonymous = false;
  let isPickingLocation = false;
  let isAcquiringGps = false;

  // Photo state
  // Structure: { url, captureMethod: 'camera'|'gallery', capturedAt, location: { latitude, longitude, accuracyMeters, source } }
  let photoData = null;

  // Create Modal DOM Elements
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'civicproof-modal-overlay';
  modalOverlay.style.display = 'none';

  modalOverlay.innerHTML = `
    <div class="civicproof-modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-brand">
          <div class="header-icon">
            <img src="/lighthouse-logo.png" alt="NAMMA OORU Logo" />
          </div>
          <div>
            <h2 id="modal-title" class="modal-title">Report an Issue</h2>
            <p class="modal-subtitle">Help make Chennai roads cleaner and safer</p>
          </div>
        </div>
        <button type="button" class="btn-close" aria-label="Close modal">&times;</button>
      </div>

      <!-- Scrollable Form Body -->
      <form id="report-form" class="modal-body">
        <!-- Error Alert Banner -->
        <div id="form-error-banner" class="alert-banner alert-error" style="display: none;"></div>

        <!-- 1. Category Selection -->
        <div class="form-group">
          <label class="form-label" for="category-select">Issue Type <span class="required">*</span></label>
          <div class="category-grid" id="category-grid">
            <button type="button" class="cat-card active" data-cat="road_damage">
              <span class="cat-icon">⚠️</span>
              <span class="cat-name">Road Damage</span>
            </button>
            <button type="button" class="cat-card" data-cat="waste_disposal">
              <span class="cat-icon">🗑️</span>
              <span class="cat-name">Waste Disposal</span>
            </button>
            <button type="button" class="cat-card" data-cat="water_leakage">
              <span class="cat-icon">💧</span>
              <span class="cat-name">Water Leakage</span>
            </button>
            <button type="button" class="cat-card" data-cat="street_light">
              <span class="cat-icon">💡</span>
              <span class="cat-name">Street Light</span>
            </button>
            <button type="button" class="cat-card" data-cat="other">
              <span class="cat-icon">📌</span>
              <span class="cat-name">Other</span>
            </button>
          </div>
          <select id="category-select" class="form-select visually-hidden" aria-label="Issue Type">
            <option value="road_damage" selected>Road Damage</option>
            <option value="waste_disposal">Waste Disposal</option>
            <option value="water_leakage">Water Leakage</option>
            <option value="street_light">Street Light</option>
            <option value="other">Other</option>
          </select>
        </div>

        <!-- 2. Description Field -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label" for="report-desc">What is the complaint? <span class="required">*</span></label>
            <span id="char-counter" class="char-counter">0 / 500</span>
          </div>
          <textarea
            id="report-desc"
            class="form-textarea"
            maxlength="500"
            rows="3"
            placeholder="Describe the issue in detail (e.g. depth of pothole, road junction landmarks, hazard to pedestrians)..."
            required
          ></textarea>
        </div>

        <!-- 3. Photo Capture & Upload (GPS-Geotagged) -->
        <div class="form-group">
          <label class="form-label">
            Complaint Photo & GPS Geotag <span class="optional">(optional, max 5 MB)</span>
          </label>

          <!-- Hidden File Inputs -->
          <input
            type="file"
            id="camera-input"
            accept="image/*"
            capture="environment"
            style="display: none;"
          />
          <input
            type="file"
            id="gallery-input"
            accept="image/jpeg,image/png,image/webp,image/*"
            style="display: none;"
          />

          <!-- Action Buttons (Shown when no photo selected) -->
          <div id="photo-choice-box" class="photo-capture-options">
            <button type="button" id="btn-take-photo" class="btn-photo-capture btn-photo-camera">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Take Photo
            </button>
            <button type="button" id="btn-upload-gallery" class="btn-photo-capture" title="Upload a photo with embedded GPS geotag">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Upload Geotagged Photo
            </button>
          </div>

          <!-- Camera Viewfinder Box (Hidden by default) -->
          <div id="camera-viewfinder-box" class="camera-viewfinder-box" style="display: none;">
            <video id="camera-video" class="camera-video" autoplay playsinline muted></video>

            <!-- Loading Indicator Overlay -->
            <div id="camera-loading-indicator" class="camera-loading-overlay" style="display: none;">
              <div class="camera-spinner"></div>
              <span>Connecting to camera hardware...</span>
            </div>

            <!-- Framing Reticle Overlay -->
            <div class="camera-viewfinder-reticle" aria-hidden="true">
              <div class="reticle-corner top-left"></div>
              <div class="reticle-corner top-right"></div>
              <div class="reticle-corner bottom-left"></div>
              <div class="reticle-corner bottom-right"></div>
              <div class="reticle-crosshair"></div>
            </div>

            <!-- Viewfinder Header -->
            <div class="camera-top-bar">
              <span id="camera-mode-badge" class="camera-mode-badge">
                <span class="camera-live-pulse"></span>
                <span id="camera-mode-text">Live Camera</span>
              </span>
              <button type="button" id="btn-camera-close" class="btn-camera-close" title="Close Camera" aria-label="Close Camera">✕</button>
            </div>

            <!-- Viewfinder Shutter & Switching Controls -->
            <div class="camera-overlay-controls">
              <div class="camera-ctrl-slot left"></div>
              <div class="camera-ctrl-slot center">
                <button type="button" id="btn-camera-capture" class="btn-camera-capture" title="Take Photo" aria-label="Take Photo">
                  <span class="capture-inner-ring"></span>
                </button>
              </div>
              <div class="camera-ctrl-slot right">
                <button type="button" id="btn-camera-switch" class="btn-camera-switch" title="Switch Camera" aria-label="Switch Camera">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8c0 2.21 1.004 4.195 2.585 5.586"/>
                    <path d="M4 14c0 4.418 3.582 8 8 8s8-3.582 8-8c0-2.21-1.004-4.195-2.585-5.586"/>
                    <polyline points="20 4 20 10 14 10"/>
                    <polyline points="4 20 4 14 10 14"/>
                  </svg>
                </button>
              </div>
            </div>

            <div id="camera-shutter-flash" class="camera-shutter-flash"></div>
            <canvas id="camera-canvas" style="display: none;"></canvas>
          </div>

          <!-- Camera Error & Permission Guidance Card -->
          <div id="camera-error-card" class="camera-error-card" style="display: none;">
            <div class="cam-err-header">
              <span class="cam-err-icon">📷</span>
              <span id="cam-err-title" class="cam-err-title">Camera Permission Required</span>
              <button type="button" id="btn-close-cam-err" class="btn-close-diag" title="Dismiss error">✕</button>
            </div>
            <p id="cam-err-body" class="cam-err-body">
              Camera access was denied or is unavailable. Please check your browser permissions or upload an image from your files.
            </p>
            <div class="cam-err-actions">
              <button type="button" id="btn-cam-err-retry" class="btn-diag-action primary">🔄 Retry Camera</button>
              <button type="button" id="btn-cam-err-gallery" class="btn-diag-action">🖼️ Upload from Gallery</button>
            </div>
          </div>

          <!-- Camera note for desktop / browser differences -->
          <div class="photo-hint-row">
            <span class="photo-hint-text">
              📸 <strong>Device Camera:</strong> Automatically captures and links your current device location.<br />
              🖼️ <strong>Upload Photo:</strong> Only photos with embedded GPS geotags are accepted.
            </span>
          </div>

          <!-- Photo Preview & Geotag Status Card (Shown when photo selected) -->
          <div id="photo-preview-container" class="photo-preview-container" style="display: none;">
            <div class="photo-preview-wrap">
              <img id="photo-preview-img" class="photo-preview-img" alt="Captured complaint preview" />
            </div>

            <!-- Toolbar: Retake / Replace / Remove -->
            <div class="photo-preview-toolbar">
              <button type="button" id="btn-retake-photo" class="btn-photo-pill" title="Retake with camera">
                📷 Retake
              </button>
              <button type="button" id="btn-replace-gallery" class="btn-photo-pill" title="Choose another image">
                🖼️ Replace
              </button>
              <button type="button" id="btn-remove-photo" class="btn-photo-pill danger" title="Remove photo">
                ✕ Remove
              </button>
            </div>

            <!-- Dynamic Photo Geotag Feedback Card -->
            <div id="photo-geotag-status" class="photo-geotag-card info">
              <div class="geotag-card-header">
                <span id="geotag-title">Photo Attached</span>
                <span id="geotag-badge" class="geotag-source-tag camera">Camera</span>
              </div>
              <div id="geotag-desc" class="geotag-desc">Checking location metadata...</div>
              <div id="geotag-actions" class="geotag-actions-row" style="display: none;"></div>
            </div>
          </div>
        </div>

        <!-- 4. Location Picker with Street Highlighting & Snapping -->
        <div class="form-group">
          <label class="form-label">
            Complaint Location on Map <span class="required">*</span>
          </label>
          <div class="location-picker-box">
            <div class="location-status-row">
              <span id="loc-pin-icon" class="loc-pin-icon">📍</span>
              <div class="location-text-col">
                <span id="location-text" class="location-text muted">No location selected yet</span>
                <span id="location-source-badge" class="location-source-badge" style="display: none;"></span>
              </div>
            </div>
            <div class="location-btn-group">
              <button type="button" id="btn-pick-map" class="btn-loc btn-loc-map" title="Click anywhere on the map to pinpoint location">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
                </svg>
                Choose on map
              </button>
              <button type="button" id="btn-gps" class="btn-loc btn-loc-gps" title="Query current device GPS location">
                📍 Use Device GPS
              </button>
            </div>
          </div>

          <!-- Street Snap / Road Feedback Hint -->
          <div id="road-snap-hint" class="road-snap-hint" style="display: none;">
            <span id="snap-badge" class="snap-badge">🛣️ Road Snapped</span>
            <span id="snap-road-name" class="snap-road-text">Affected road segment will be highlighted</span>
          </div>

          <!-- GPS Permission / Diagnostic Troubleshooting Box -->
          <div id="gps-diagnostic-card" class="gps-diagnostic-card" style="display: none;">
            <div class="gps-diag-header">
              <span id="gps-diag-title">⚠️ Location Access Guidance</span>
              <button type="button" id="btn-close-gps-diag" class="btn-close-diag" title="Dismiss guide">✕</button>
            </div>
            <div id="gps-diag-body" class="gps-diag-body"></div>
            <div class="gps-diag-actions">
              <button type="button" id="btn-diag-retry" class="btn-diag-action primary">🔄 Retry GPS</button>
              <button type="button" id="btn-diag-pick" class="btn-diag-action">🗺️ Choose on Map (Recommended)</button>
              <a id="link-open-tab" class="btn-diag-action outline" target="_blank" rel="noopener noreferrer" style="display: none;">↗️ Open in New Tab</a>
            </div>
          </div>

          <div class="privacy-notice">
            🔒 Location access is queried securely via your browser to accurately position civic reports on Chennai maps. Never uses simulated coordinates.
          </div>
        </div>

        <!-- 5. Anonymous Reporting Checkbox -->
        <div class="form-group-checkbox">
          <label class="checkbox-container">
            <input type="checkbox" id="check-anonymous" />
            <span class="checkbox-label">
              <strong>Report Anonymously</strong>
              <small class="checkbox-desc">Your personal details will not be attached to this complaint</small>
            </span>
          </label>
        </div>

        <!-- 6. Modal Actions -->
        <div class="modal-actions">
          <button type="button" id="btn-cancel" class="btn-secondary">Cancel</button>
          <button type="submit" id="btn-submit" class="btn-primary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
            Submit Report
          </button>
        </div>
      </form>
    </div>
  `;

  // Floating map pick guidance banner
  const pickBanner = document.createElement('div');
  pickBanner.className = 'location-pick-banner';
  pickBanner.style.display = 'none';
  pickBanner.innerHTML = `
    <div class="pick-banner-content">
      <span class="pick-pulse-dot"></span>
      <span><strong>Select Street on Map:</strong> Click on a road to snap and highlight the affected street segment</span>
      <button type="button" id="btn-cancel-pick" class="btn-cancel-pick">Cancel</button>
    </div>
  `;

  // Mount to DOM
  mountContainer.appendChild(modalOverlay);
  mountContainer.appendChild(pickBanner);

  // Cached Elements
  const form = modalOverlay.querySelector('#report-form');
  const btnClose = modalOverlay.querySelector('.btn-close');
  const btnCancel = modalOverlay.querySelector('#btn-cancel');
  const errorBanner = modalOverlay.querySelector('#form-error-banner');
  const categoryGrid = modalOverlay.querySelector('#category-grid');
  const categorySelect = modalOverlay.querySelector('#category-select');
  const descInput = modalOverlay.querySelector('#report-desc');
  const charCounter = modalOverlay.querySelector('#char-counter');

  // Photo Elements
  const cameraInput = modalOverlay.querySelector('#camera-input');
  const galleryInput = modalOverlay.querySelector('#gallery-input');
  const photoChoiceBox = modalOverlay.querySelector('#photo-choice-box');
  const btnTakePhoto = modalOverlay.querySelector('#btn-take-photo');
  const btnUploadGallery = modalOverlay.querySelector('#btn-upload-gallery');
  const photoPreviewContainer = modalOverlay.querySelector('#photo-preview-container');
  const photoPreviewImg = modalOverlay.querySelector('#photo-preview-img');
  const btnRetakePhoto = modalOverlay.querySelector('#btn-retake-photo');
  const btnReplaceGallery = modalOverlay.querySelector('#btn-replace-gallery');
  const btnRemovePhoto = modalOverlay.querySelector('#btn-remove-photo');
  const photoGeotagStatus = modalOverlay.querySelector('#photo-geotag-status');
  const geotagTitle = modalOverlay.querySelector('#geotag-title');
  const geotagBadge = modalOverlay.querySelector('#geotag-badge');
  const geotagDesc = modalOverlay.querySelector('#geotag-desc');
  const geotagActions = modalOverlay.querySelector('#geotag-actions');

  // Camera Elements
  const cameraViewfinderBox = modalOverlay.querySelector('#camera-viewfinder-box');
  const cameraVideo = modalOverlay.querySelector('#camera-video');
  const cameraCanvas = modalOverlay.querySelector('#camera-canvas');
  const btnCameraClose = modalOverlay.querySelector('#btn-camera-close');
  const btnCameraCapture = modalOverlay.querySelector('#btn-camera-capture');
  const btnCameraSwitch = modalOverlay.querySelector('#btn-camera-switch');
  const cameraLoadingIndicator = modalOverlay.querySelector('#camera-loading-indicator');
  const cameraShutterFlash = modalOverlay.querySelector('#camera-shutter-flash');
  const cameraModeBadge = modalOverlay.querySelector('#camera-mode-badge');
  const cameraModeText = modalOverlay.querySelector('#camera-mode-text');
  const cameraErrorCard = modalOverlay.querySelector('#camera-error-card');
  const camErrTitle = modalOverlay.querySelector('#cam-err-title');
  const camErrBody = modalOverlay.querySelector('#cam-err-body');
  const btnCloseCamErr = modalOverlay.querySelector('#btn-close-cam-err');
  const btnCamErrRetry = modalOverlay.querySelector('#btn-cam-err-retry');
  const btnCamErrGallery = modalOverlay.querySelector('#btn-cam-err-gallery');

  let currentStream = null;
  let currentFacingMode = 'environment';

  // Camera error card button actions
  if (btnCloseCamErr) {
    btnCloseCamErr.addEventListener('click', () => {
      cameraErrorCard.style.display = 'none';
    });
  }
  if (btnCamErrRetry) {
    btnCamErrRetry.addEventListener('click', () => {
      cameraErrorCard.style.display = 'none';
      startCamera(currentFacingMode);
    });
  }
  if (btnCamErrGallery) {
    btnCamErrGallery.addEventListener('click', () => {
      cameraErrorCard.style.display = 'none';
      galleryInput.click();
    });
  }

  // Location Elements
  const btnPickMap = modalOverlay.querySelector('#btn-pick-map');
  const btnGps = modalOverlay.querySelector('#btn-gps');
  const locationText = modalOverlay.querySelector('#location-text');
  const locationSourceBadge = modalOverlay.querySelector('#location-source-badge');
  const locPinIcon = modalOverlay.querySelector('#loc-pin-icon');
  const roadSnapHint = modalOverlay.querySelector('#road-snap-hint');
  const snapBadge = modalOverlay.querySelector('#snap-badge');
  const snapRoadName = modalOverlay.querySelector('#snap-road-name');
  const gpsDiagnosticCard = modalOverlay.querySelector('#gps-diagnostic-card');
  const gpsDiagTitle = modalOverlay.querySelector('#gps-diag-title');
  const gpsDiagBody = modalOverlay.querySelector('#gps-diag-body');
  const btnCloseGpsDiag = modalOverlay.querySelector('#btn-close-gps-diag');
  const btnDiagRetry = modalOverlay.querySelector('#btn-diag-retry');
  const btnDiagPick = modalOverlay.querySelector('#btn-diag-pick');
  const linkOpenTab = modalOverlay.querySelector('#link-open-tab');
  const btnCancelPick = pickBanner.querySelector('#btn-cancel-pick');
  const checkAnonymous = modalOverlay.querySelector('#check-anonymous');

  // Configure diagnostic link with current app URL
  if (linkOpenTab) {
    linkOpenTab.href = window.location.href;
  }

  // Close diagnostic box
  btnCloseGpsDiag.addEventListener('click', () => {
    gpsDiagnosticCard.style.display = 'none';
  });

  // Retry from diag card
  btnDiagRetry.addEventListener('click', () => {
    gpsDiagnosticCard.style.display = 'none';
    btnGps.click();
  });

  // Pick map from diag card
  btnDiagPick.addEventListener('click', () => {
    gpsDiagnosticCard.style.display = 'none';
    btnPickMap.click();
  });

  // =========================================================
  // LOCATION UPDATES & ROAD SNAPPING
  // =========================================================

  /**
   * Updates coordinates, triggers road matching, and refreshes UI
   *
   * @param {Object} coords - { lng, lat }
   * @param {string} source - 'device_gps' | 'exif_gps' | 'device_gps_at_upload' | 'map_selected'
   * @param {number|null} [accuracy=null] - Accuracy in meters
   * @param {Object|null} [explicitRoad=null] - Optional pre-resolved road geometry
   */
  function setLocation(coords, source, accuracy = null, explicitRoad = null) {
    if (!coords || typeof coords.lng !== 'number' || typeof coords.lat !== 'number') return;

    selectedCoords = {
      lng: Number(coords.lng.toFixed(6)),
      lat: Number(coords.lat.toFixed(6)),
    };
    selectedAccuracy = accuracy !== null && !Number.isNaN(accuracy) ? Math.round(accuracy) : null;
    locationSource = source;

    // Hide any previous diagnostic warning on valid location set
    gpsDiagnosticCard.style.display = 'none';

    // Update location source badge
    if (locationSourceBadge) {
      locationSourceBadge.style.display = 'inline-block';
      if (source === 'device_gps') {
        locationSourceBadge.textContent = selectedAccuracy ? `GPS (±${selectedAccuracy}m)` : 'Device GPS';
        locationSourceBadge.className = 'location-source-badge gps';
      } else if (source === 'map_selected') {
        locationSourceBadge.textContent = 'Manually Selected on Map';
        locationSourceBadge.className = 'location-source-badge manual';
      } else if (source === 'exif_gps') {
        locationSourceBadge.textContent = 'Photo EXIF GPS';
        locationSourceBadge.className = 'location-source-badge exif';
      } else if (source === 'device_gps_at_upload') {
        locationSourceBadge.textContent = 'Upload Device GPS';
        locationSourceBadge.className = 'location-source-badge upload';
      }
    }

    // Check road resolution
    let road = explicitRoad;
    if (!road && typeof complaintMap.resolveRoadForCoords === 'function') {
      road = complaintMap.resolveRoadForCoords(selectedCoords.lng, selectedCoords.lat);
    }

    if (road && road.roadGeometry) {
      selectedRoadGeometry = road.roadGeometry;
      selectedRoadName = road.roadName || 'Chennai Street';
      isRoadSnapped = true;

      // Snap coordinates to road centerline if available
      if (Array.isArray(road.snappedCoords) && road.snappedCoords.length >= 2) {
        selectedCoords.lng = Number(road.snappedCoords[0].toFixed(6));
        selectedCoords.lat = Number(road.snappedCoords[1].toFixed(6));
      }

      locPinIcon.textContent = '🛣️';
      locationText.textContent = `[${selectedCoords.lat.toFixed(4)}° N, ${selectedCoords.lng.toFixed(4)}° E]`;
      locationText.className = 'location-text active road-snapped';
      snapBadge.textContent = '🛣️ Road Snapped';
      snapBadge.className = 'snap-badge';
      snapRoadName.textContent = `${selectedRoadName} (Street segment will be highlighted)`;
      roadSnapHint.style.display = 'flex';
    } else {
      selectedRoadGeometry = null;
      selectedRoadName = null;
      isRoadSnapped = false;

      locPinIcon.textContent = '📍';
      locationText.textContent = `[${selectedCoords.lat.toFixed(4)}° N, ${selectedCoords.lng.toFixed(4)}° E]`;
      locationText.className = 'location-text active';
      snapBadge.textContent = '📍 Off-Road';
      snapBadge.className = 'snap-badge off-road';
      snapRoadName.textContent = 'No municipal road centerline within 80m (Point marker will be shown)';
      roadSnapHint.style.display = 'flex';
    }

    // Pan map to location
    if (typeof complaintMap.flyToLocation === 'function') {
      complaintMap.flyToLocation(selectedCoords.lng, selectedCoords.lat, 14.5);
    }

    // Visually display detected location marker and road highlight on map before submission
    if (typeof complaintMap.showPreviewLocation === 'function') {
      complaintMap.showPreviewLocation(
        selectedCoords.lng,
        selectedCoords.lat,
        selectedRoadGeometry,
        isRoadSnapped
      );
    }

    // Associate location with photo data if photo is active
    if (photoData) {
      photoData.location = {
        latitude: selectedCoords.lat,
        longitude: selectedCoords.lng,
        accuracyMeters: selectedAccuracy,
        source: locationSource,
      };
    }
  }

  /**
   * Diagnostic helper to inspect if current window is inside an iframe
   * where permission policy (Feature Policy) might disallow camera/geolocation.
   */
  function isRunningInRestrictedIframe() {
    try {
      return window.self !== window.top;
    } catch {
      return true; // Cross-origin top window access blocked -> definitely in iframe
    }
  }

  /**
   * Inspects permissions API state safely if supported.
   *
   * @returns {Promise<'granted'|'prompt'|'denied'|'unknown'>}
   */
  async function checkGeolocationPermissionState() {
    if (!navigator || !navigator.permissions || typeof navigator.permissions.query !== 'function') {
      return 'unknown';
    }
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state;
    } catch {
      // Browsers may reject permission query for various reason
      return 'unknown';
    }
  }

  /**
   * Displays the detailed GPS Diagnostic and Recovery Guidance Card
   *
   * @param {string} errorCategory - 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'INSECURE_CONTEXT'
   * @param {string} technicalMessage
   */
  async function showGpsDiagnosticGuide(errorCategory, technicalMessage) {
    const origin = window.location.origin;
    const inIframe = isRunningInRestrictedIframe();
    const permState = await checkGeolocationPermissionState();

    gpsDiagnosticCard.style.display = 'block';

    if (errorCategory === 'PERMISSION_DENIED') {
      gpsDiagTitle.textContent = inIframe
        ? '⚠️ Location Permission Denied (AI Studio Preview Iframe)'
        : '⚠️ Location Permission Denied in Browser';

      let html = `<p class="diag-p"><strong>Diagnosis:</strong> The browser reported <code>PERMISSION_DENIED</code> (code 1). Permission state is <code>${permState}</code>.</p>`;

      if (inIframe) {
        html += `
          <div class="diag-callout warning">
            <strong>Preview Environment Restriction:</strong> Google AI Studio Preview renders applications within an embedded sandboxed <code>&lt;iframe&gt;</code>. Standard browser security and W3C Permissions Policy prevent iframes from accessing device GPS hardware unless the parent frame explicitly delegates it.
          </div>
          <div class="diag-steps">
            <strong>Recommended Solutions:</strong>
            <ol>
              <li><strong>Click "Choose on Map" (Fastest):</strong> You can click any street in Chennai to accurately position and highlight your complaint without requiring device GPS permissions.</li>
              <li><strong>Test in Standalone Secure Tab:</strong> Open the app directly at its published HTTPS origin (<code>${origin}</code>) in a new browser tab or mobile browser, where hardware permissions can be granted directly.</li>
            </ol>
          </div>
        `;
        if (linkOpenTab) linkOpenTab.style.display = 'inline-flex';
      } else {
        html += `
          <div class="diag-steps">
            <strong>How to enable location for ${origin}:</strong>
            <ol>
              <li>Click the <strong>Lock / Site Settings icon (🔒)</strong> on the left side of your browser's address bar.</li>
              <li>Toggle <strong>Location</strong> to <strong>Allow</strong>.</li>
              <li>Refresh the page or click <strong>"🔄 Retry GPS"</strong> below.</li>
              <li>Or click <strong>"🗺️ Choose on Map"</strong> to select the street manually.</li>
            </ol>
          </div>
        `;
        if (linkOpenTab) linkOpenTab.style.display = 'none';
      }

      gpsDiagBody.innerHTML = html;
    } else if (errorCategory === 'INSECURE_CONTEXT') {
      gpsDiagTitle.textContent = '⚠️ Insecure Context (HTTPS Required)';
      gpsDiagBody.innerHTML = `
        <p class="diag-p">The Geolocation API requires a Secure Context (<code>https://</code> or <code>localhost</code>). The current protocol is <code>${window.location.protocol}</code>.</p>
        <p class="diag-p">Please access the application over HTTPS or click <strong>"Choose on Map"</strong>.</p>
      `;
      if (linkOpenTab) linkOpenTab.style.display = 'none';
    } else if (errorCategory === 'POSITION_UNAVAILABLE') {
      gpsDiagTitle.textContent = '⚠️ GPS Position Unavailable (Code 2)';
      gpsDiagBody.innerHTML = `
        <p class="diag-p"><strong>Diagnosis:</strong> The browser could not obtain a GPS fix from internal hardware or network location services.</p>
        <div class="diag-steps">
          <strong>Steps to resolve:</strong>
          <ul>
            <li>Ensure device Location Services are turned on in system settings.</li>
            <li>If indoors, move closer to a window or retry outdoors for satellite lock.</li>
            <li>Use <strong>"Choose on Map"</strong> to pinpoint the affected Chennai street immediately.</li>
          </ul>
        </div>
      `;
      if (linkOpenTab) linkOpenTab.style.display = 'none';
    } else if (errorCategory === 'TIMEOUT') {
      gpsDiagTitle.textContent = '⚠️ GPS Request Timed Out (Code 3)';
      gpsDiagBody.innerHTML = `
        <p class="diag-p"><strong>Diagnosis:</strong> GPS satellite acquisition did not resolve within 15 seconds (High-Accuracy mode enabled).</p>
        <div class="diag-steps">
          <strong>Steps to resolve:</strong>
          <ul>
            <li>Click <strong>"🔄 Retry GPS"</strong> to attempt a fresh satellite query.</li>
            <li>Or click <strong>"Choose on Map"</strong> to locate the street instantly.</li>
          </ul>
        </div>
      `;
      if (linkOpenTab) linkOpenTab.style.display = 'none';
    } else {
      gpsDiagTitle.textContent = '⚠️ Geolocation Unsupported';
      gpsDiagBody.innerHTML = `
        <p class="diag-p">${technicalMessage}</p>
        <p class="diag-p">Please click <strong>"Choose on Map"</strong> to place your civic issue on the map.</p>
      `;
      if (linkOpenTab) linkOpenTab.style.display = 'none';
    }
  }

  /**
   * Helper to request browser device geolocation with precise diagnostic error handling.
   *
   * @param {string} source - 'device_gps' | 'device_gps_at_upload'
   * @returns {Promise<{ latitude: number, longitude: number, accuracyMeters: number, capturedAt: string, source: string }>}
   */
  function acquireBrowserLocation(source = 'device_gps') {
    return new Promise((resolve, reject) => {
      // 1. Check secure context
      if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
        showGpsDiagnosticGuide('INSECURE_CONTEXT', 'Geolocation requires HTTPS.');
        reject(new Error('Geolocation requires a secure HTTPS context.'));
        return;
      }

      // 2. Check if geolocation API exists in browser
      if (!navigator || !navigator.geolocation) {
        showGpsDiagnosticGuide('UNSUPPORTED', 'Geolocation API is not supported by this browser.');
        reject(
          new Error(
            'Geolocation is not supported by your browser. Please use "Choose on map" to mark the complaint location.'
          )
        );
        return;
      }

      // 3. Request current position directly from user interaction
      // Explicit parameters: enableHighAccuracy: true, timeout: 15000, maximumAge: 0
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!pos || !pos.coords) {
            reject(new Error('Received invalid location payload from device GPS.'));
            return;
          }
          // Valid coordinate check
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
            reject(new Error('Invalid GPS coordinates received from device.'));
            return;
          }

          resolve({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            accuracyMeters: Math.round(pos.coords.accuracy || 10),
            capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
            source,
          });
        },
        (err) => {
          let category = 'UNKNOWN';
          let message = 'Unable to access device location.';
          const inIframe = isRunningInRestrictedIframe();

          if (err.code === 1) {
            category = 'PERMISSION_DENIED';
            if (inIframe) {
              message =
                'Location permission was denied or blocked by iframe permissions policy in AI Studio Preview. See guidance card below or click "Choose on map".';
            } else {
              message =
                'Location access permission was denied. See steps below to allow access in your browser or click "Choose on map".';
            }
          } else if (err.code === 2) {
            category = 'POSITION_UNAVAILABLE';
            message =
              'GPS location is currently unavailable (no GPS satellite fix or network location provider error). Please verify device location services or choose on map.';
          } else if (err.code === 3) {
            category = 'TIMEOUT';
            message =
              'GPS location query timed out after 15 seconds. Please retry or click "Choose on map".';
          } else {
            message = `Location request failed: ${err.message || 'Unknown error'}. Please choose location on map.`;
          }

          // Show diagnostic recovery guide
          showGpsDiagnosticGuide(category, err.message);

          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }

  // =========================================================
  // PHOTO HANDLING & GEOTAG LOGIC
  // =========================================================

  function showCameraErrorCard(title, body) {
    if (cameraErrorCard) {
      camErrTitle.textContent = title;
      camErrBody.textContent = body;
      cameraErrorCard.style.display = 'block';
      cameraErrorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      showError(`${title}: ${body}`);
    }
  }

  function handleCameraError(err) {
    stopCamera();
    photoChoiceBox.style.display = 'flex';

    let title = 'Camera Access Failed';
    let message = 'Unable to access your device camera.';

    if (!err) {
      message = 'Could not initialize camera stream.';
    } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      title = 'Camera Permission Denied';
      message =
        'Camera permission was blocked by your browser settings. To take photos inside the app, click the lock (🔒) icon in your browser address bar, set Camera to "Allow", and retry. Alternatively, use "Upload from Gallery".';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      title = 'No Camera Detected';
      message =
        'No camera or webcam was found on this device. Please connect a camera or upload a photo from your device files using the gallery button.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      title = 'Camera Currently In Use';
      message =
        'Your camera is currently in use by another application (e.g. Zoom, Google Meet, or another browser tab). Please close other camera apps and retry, or use "Upload from Gallery".';
    } else if (err.name === 'OverconstrainedError') {
      title = 'Camera Constraints Mismatch';
      message =
        'Your device camera does not support the requested video resolution or mode. You can retry with basic webcam settings or use gallery upload.';
    } else {
      message = `Camera error: ${err.message || 'Unknown error'}. You can still upload a photo from your gallery or files.`;
    }

    showCameraErrorCard(title, message);
  }

  async function updateCameraSwitchVisibility() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices || !btnCameraSwitch) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      if (videoDevices.length > 1) {
        btnCameraSwitch.style.display = 'flex';
        btnCameraSwitch.title =
          currentFacingMode === 'environment'
            ? 'Switch to Front Camera / Webcam'
            : 'Switch to Rear Camera';
      } else {
        btnCameraSwitch.style.display = 'none';
      }
    } catch {
      // Keep switch visible if enumeration is not permitted before first user gesture
    }
  }

  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('[Camera] Track stop error:', e);
        }
      });
      currentStream = null;
    }
    if (cameraVideo) {
      cameraVideo.srcObject = null;
    }
    if (cameraViewfinderBox) {
      cameraViewfinderBox.style.display = 'none';
    }
    if (cameraLoadingIndicator) {
      cameraLoadingIndicator.style.display = 'none';
    }
  }

  async function startCamera(facingMode = 'environment') {
    stopCamera(); // Cleanly stop any existing stream
    currentFacingMode = facingMode;
    clearErrors();
    if (cameraErrorCard) cameraErrorCard.style.display = 'none';

    // 1. Check secure context (HTTPS / localhost required for MediaDevices)
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      showCameraErrorCard(
        'HTTPS Required for Camera',
        'In-app camera capture requires a secure HTTPS connection (or localhost). Please access the website over HTTPS or use "Upload from Gallery".'
      );
      photoChoiceBox.style.display = 'flex';
      return;
    }

    // 2. Check getUserMedia availability
    if (!navigator || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      showCameraErrorCard(
        'Camera API Unsupported',
        'Your browser does not support in-app camera streaming (getUserMedia). Please use "Upload from Gallery" or file selection.'
      );
      photoChoiceBox.style.display = 'flex';
      return;
    }

    // Show viewfinder box with loading indicator
    photoChoiceBox.style.display = 'none';
    cameraViewfinderBox.style.display = 'block';
    if (cameraLoadingIndicator) cameraLoadingIndicator.style.display = 'flex';
    if (cameraModeText) {
      cameraModeText.textContent =
        currentFacingMode === 'environment' ? 'Rear Camera (Chennai Field)' : 'Front Camera / Webcam';
    }

    // Prepare video attributes for iOS Safari & Android inline playback
    cameraVideo.setAttribute('autoplay', '');
    cameraVideo.setAttribute('muted', '');
    cameraVideo.setAttribute('playsinline', '');
    cameraVideo.setAttribute('webkit-playsinline', '');
    cameraVideo.playsInline = true;
    cameraVideo.muted = true;

    // Progressive constraint tiers:
    // 1. High resolution with ideal facingMode (prefers rear on mobile)
    // 2. Ideal facingMode without resolution bounds
    // 3. Fallback to basic { video: true } (guaranteed laptop webcam compatibility)
    const constraintTiers = [
      {
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: currentFacingMode },
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of constraintTiers) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        lastError = err;
        // Stop retrying if user explicitly denied permission
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          break;
        }
      }
    }

    if (!stream) {
      handleCameraError(lastError);
      return;
    }

    currentStream = stream;
    cameraVideo.srcObject = stream;

    try {
      await cameraVideo.play();
    } catch (playErr) {
      console.warn('[Camera] Video play notice:', playErr);
    }

    if (cameraLoadingIndicator) cameraLoadingIndicator.style.display = 'none';
    updateCameraSwitchVisibility();
  }

  // 1. Take Photo Button Click -> opens in-app camera
  btnTakePhoto.addEventListener('click', () => {
    clearErrors();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      startCamera('environment');
    } else {
      // Mobile fallback if getUserMedia not available
      cameraInput.click();
    }
  });

  btnCameraClose.addEventListener('click', () => {
    stopCamera();
    photoChoiceBox.style.display = 'flex';
  });

  btnCameraSwitch.addEventListener('click', () => {
    const nextMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(nextMode);
  });

  btnCameraCapture.addEventListener('click', async () => {
    if (!currentStream) return;

    // Ensure video is playing and has rendered frames
    if (cameraVideo.readyState < 2) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 500);
        const onReady = () => {
          clearTimeout(timeout);
          resolve();
        };
        cameraVideo.addEventListener('loadeddata', onReady, { once: true });
        cameraVideo.addEventListener('canplay', onReady, { once: true });
      });
    }

    const vw = cameraVideo.videoWidth || 1280;
    const vh = cameraVideo.videoHeight || 720;

    // Visual shutter flash effect
    if (cameraShutterFlash) {
      cameraShutterFlash.classList.add('flash-active');
      setTimeout(() => {
        if (cameraShutterFlash) cameraShutterFlash.classList.remove('flash-active');
      }, 250);
    }

    cameraCanvas.width = vw;
    cameraCanvas.height = vh;
    const ctx = cameraCanvas.getContext('2d');

    // Draw video frame to canvas
    try {
      if (currentFacingMode === 'user') {
        ctx.translate(vw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(cameraVideo, 0, 0, vw, vh);
    } catch (drawErr) {
      console.warn('[Camera] drawImage fallback:', drawErr);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('NAMMA OORU Camera Photo', 40, 80);
    }

    cameraCanvas.toBlob(
      (blob) => {
        stopCamera();
        if (!blob) {
          showError('Failed to capture photo from camera. Please retry.');
          photoChoiceBox.style.display = 'flex';
          return;
        }
        const file = new File([blob], `namma-ooru-camera-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        handlePhotoFile(file, 'camera');
      },
      'image/jpeg',
      0.92
    );
  });

  // 2. Upload Gallery Button Click -> triggers gallery input
  btnUploadGallery.addEventListener('click', () => {
    clearErrors();
    galleryInput.click();
  });

  // Retake & Replace
  btnRetakePhoto.addEventListener('click', () => {
    clearErrors();
    photoPreviewContainer.style.display = 'none';
    btnTakePhoto.click();
  });

  btnReplaceGallery.addEventListener('click', () => {
    clearErrors();
    galleryInput.click();
  });

  // 3. Remove Photo
  btnRemovePhoto.addEventListener('click', () => {
    photoData = null;
    cameraInput.value = '';
    galleryInput.value = '';
    photoPreviewImg.src = '';
    photoPreviewContainer.style.display = 'none';
    photoChoiceBox.style.display = 'flex';
  });

  /**
   * Process a captured or selected photo file
   *
   * @param {File} file
   * @param {'camera'|'gallery'} method
   */
  async function handlePhotoFile(file, method) {
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      showError('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }

    // Validate size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('Photo size exceeds 5 MB. Please capture or choose a smaller file.');
      return;
    }

    clearErrors();

    // 1. GALLERY UPLOAD WORKFLOW:
    // REQUIREMENT: "only allow the geotag photos while upload"
    if (method === 'gallery') {
      const exifGps = await extractExifGps(file);

      if (!exifGps || typeof exifGps.latitude !== 'number' || typeof exifGps.longitude !== 'number') {
        // Strictly reject photos without embedded GPS geotags
        showError(
          'Upload Rejected: Only geotagged photos are allowed for upload. The selected photo does not contain embedded GPS coordinates. Please upload an original photo with GPS geotagging enabled, or use "Take Photo" to capture directly using your device camera.'
        );
        galleryInput.value = '';
        if (!photoData) {
          photoPreviewContainer.style.display = 'none';
          photoChoiceBox.style.display = 'flex';
        }
        return;
      }

      // Valid geotagged photo: read and display preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        photoPreviewImg.src = dataUrl;
        photoChoiceBox.style.display = 'none';
        photoPreviewContainer.style.display = 'flex';

        photoData = {
          url: dataUrl,
          captureMethod: 'gallery',
          capturedAt: exifGps.timestamp || new Date().toISOString(),
          location: {
            latitude: exifGps.latitude,
            longitude: exifGps.longitude,
            accuracyMeters: null,
            source: 'exif_gps',
          },
        };

        // Automatically map coordinates from photo geotag
        setLocation(
          { lng: exifGps.longitude, lat: exifGps.latitude },
          'exif_gps',
          null
        );

        geotagTitle.textContent = 'Geotagged Photo Verified';
        geotagBadge.textContent = 'Photo EXIF GPS';
        geotagBadge.className = 'geotag-source-tag exif';
        geotagDesc.textContent = `Embedded GPS coordinates [${exifGps.latitude.toFixed(4)}° N, ${exifGps.longitude.toFixed(4)}° E] verified from photo metadata. Location mapped automatically.`;
        photoGeotagStatus.className = 'photo-geotag-card success';

        geotagActions.innerHTML = '';
        const btnAdjust = document.createElement('button');
        btnAdjust.type = 'button';
        btnAdjust.className = 'btn-geotag-action';
        btnAdjust.textContent = '🗺️ Adjust on Map';
        btnAdjust.addEventListener('click', () => btnPickMap.click());
        geotagActions.appendChild(btnAdjust);
        geotagActions.style.display = 'flex';
      };
      reader.readAsDataURL(file);
      return;
    }

    // 2. DEVICE CAMERA WORKFLOW:
    // REQUIREMENT: "just use the current location if the photo is taken via device"
    if (method === 'camera') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        photoPreviewImg.src = dataUrl;
        photoChoiceBox.style.display = 'none';
        photoPreviewContainer.style.display = 'flex';

        photoData = {
          url: dataUrl,
          captureMethod: 'camera',
          capturedAt: new Date().toISOString(),
          location: null,
        };

        geotagTitle.textContent = 'Device Camera Photo';
        geotagBadge.textContent = 'Current Location';
        geotagBadge.className = 'geotag-source-tag camera';
        geotagDesc.textContent = 'Acquiring current device location...';
        photoGeotagStatus.className = 'photo-geotag-card loading';
        geotagActions.style.display = 'none';

        isAcquiringGps = true;
        try {
          const gps = await acquireBrowserLocation('device_gps');
          isAcquiringGps = false;

          // Directly apply current device location
          setLocation(
            { lng: gps.longitude, lat: gps.latitude },
            'device_gps',
            gps.accuracyMeters
          );

          geotagTitle.textContent = 'Current Location Applied';
          geotagBadge.textContent = 'Current GPS';
          geotagBadge.className = 'geotag-source-tag camera';
          geotagDesc.textContent = `Captured at current location [${gps.latitude.toFixed(4)}° N, ${gps.longitude.toFixed(4)}° E] (±${gps.accuracyMeters}m). Linked to this complaint.`;
          photoGeotagStatus.className = 'photo-geotag-card success';
          geotagActions.style.display = 'none';
        } catch (err) {
          isAcquiringGps = false;
          geotagTitle.textContent = 'Location Permission Required';
          geotagBadge.textContent = 'No Location';
          geotagBadge.className = 'geotag-source-tag warning';
          geotagDesc.textContent = `${err.message} Device location could not be determined. Please enable location permissions or select on map.`;
          photoGeotagStatus.className = 'photo-geotag-card warning';

          geotagActions.innerHTML = '';
          const btnRetry = document.createElement('button');
          btnRetry.type = 'button';
          btnRetry.className = 'btn-geotag-action';
          btnRetry.textContent = '🔄 Retry Location';
          btnRetry.addEventListener('click', () => handlePhotoFile(file, 'camera'));

          const btnPick = document.createElement('button');
          btnPick.type = 'button';
          btnPick.className = 'btn-geotag-action';
          btnPick.textContent = '🗺️ Choose on Map';
          btnPick.addEventListener('click', () => btnPickMap.click());

          geotagActions.appendChild(btnRetry);
          geotagActions.appendChild(btnPick);
          geotagActions.style.display = 'flex';
        }
      };
      reader.readAsDataURL(file);
    }
  }

  // Camera file selected or cancelled
  cameraInput.addEventListener('change', () => {
    const file = cameraInput.files && cameraInput.files[0];
    if (file) {
      handlePhotoFile(file, 'camera');
    }
  });

  // Handle cancellation on camera file picker
  cameraInput.addEventListener('cancel', () => {
    // When citizen cancels camera/file dialog without selecting a photo,
    // do not throw or corrupt previous photo/location state
    if (!photoData) {
      photoPreviewContainer.style.display = 'none';
      photoChoiceBox.style.display = 'flex';
    }
  });

  // Gallery file selected or cancelled
  galleryInput.addEventListener('change', () => {
    const file = galleryInput.files && galleryInput.files[0];
    if (file) {
      handlePhotoFile(file, 'gallery');
    }
  });

  // Handle cancellation on gallery file picker
  galleryInput.addEventListener('cancel', () => {
    if (!photoData) {
      photoPreviewContainer.style.display = 'none';
      photoChoiceBox.style.display = 'flex';
    }
  });

  // =========================================================
  // MAP PICKING & LOCATION ACTIONS
  // =========================================================

  // Click on "Choose on map"
  btnPickMap.addEventListener('click', () => {
    isPickingLocation = true;
    modalOverlay.style.display = 'none';
    pickBanner.style.display = 'flex';

    if (window.scrollY < 200) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    }

    complaintMap.enableLocationPick({
      onSelect: (result) => {
        const { lng, lat, roadName, roadGeometry, isRoadSnapped: snapped } = result;
        setLocation(
          { lng, lat },
          'map_selected',
          null,
          snapped && roadGeometry ? { roadName, roadGeometry, snappedCoords: [lng, lat] } : null
        );

        isPickingLocation = false;
        pickBanner.style.display = 'none';
        modalOverlay.style.display = 'flex';
        clearErrors();
      },
      onCancel: () => {
        isPickingLocation = false;
        pickBanner.style.display = 'none';
        modalOverlay.style.display = 'flex';
      },
    });
  });

  btnCancelPick.addEventListener('click', () => {
    complaintMap.cancelLocationPick();
    isPickingLocation = false;
    pickBanner.style.display = 'none';
    modalOverlay.style.display = 'flex';
  });

  // Standalone "Use Device GPS" button
  btnGps.addEventListener('click', async () => {
    clearErrors();
    const prevText = locationText.textContent;
    locationText.textContent = 'Querying device GPS...';
    btnGps.disabled = true;
    btnGps.style.opacity = '0.6';
    try {
      const gps = await acquireBrowserLocation('device_gps');
      setLocation(
        { lng: gps.longitude, lat: gps.latitude },
        'device_gps',
        gps.accuracyMeters
      );
    } catch (err) {
      showError(err.message);
      locationText.textContent = selectedCoords
        ? `[${selectedCoords.lat.toFixed(4)}° N, ${selectedCoords.lng.toFixed(4)}° E]`
        : prevText || 'No location selected yet';
    } finally {
      btnGps.disabled = false;
      btnGps.style.opacity = '1';
    }
  });

  // =========================================================
  // CATEGORIES & DESCRIPTION
  // =========================================================

  categoryGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.cat-card');
    if (!card) return;
    const cat = card.dataset.cat;
    selectedCategory = cat;
    categorySelect.value = cat;
    categoryGrid.querySelectorAll('.cat-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
  });

  categorySelect.addEventListener('change', (e) => {
    selectedCategory = e.target.value;
    categoryGrid.querySelectorAll('.cat-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.cat === selectedCategory);
    });
  });

  descInput.addEventListener('input', () => {
    const len = descInput.value.length;
    charCounter.textContent = `${len} / 500`;
    charCounter.style.color = len >= 490 ? '#EF4444' : '#64748B';
  });

  // =========================================================
  // FORM SUBMISSION
  // =========================================================

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    const desc = descInput.value.trim();
    if (!desc) {
      showError('Please describe the civic issue in the complaint field.');
      descInput.focus();
      return;
    }

    if (!selectedCoords) {
      showError('Please set the complaint location on the map (via photo GPS or "Choose on map").');
      btnPickMap.focus();
      return;
    }

    if (photoData && photoData.captureMethod === 'gallery' && (!photoData.location || photoData.location.source !== 'exif_gps')) {
      showError('Upload Rejected: Only geotagged photos are allowed for upload. Please select a photo with embedded GPS metadata or take a photo with your device.');
      return;
    }

    // Generate unique ID
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newId = `DEMO-2026-${randomSuffix}`;

    // Standardized photo and location data structure
    const photoObject = photoData
      ? {
          url: photoData.url,
          captureMethod: photoData.captureMethod,
          capturedAt: photoData.capturedAt,
          location: {
            latitude: selectedCoords.lat,
            longitude: selectedCoords.lng,
            accuracyMeters: selectedAccuracy,
            source: locationSource,
          },
        }
      : null;

    const newFeature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [selectedCoords.lng, selectedCoords.lat],
      },
      properties: {
        id: newId,
        category: selectedCategory,
        status: 'open',
        description: desc,
        createdAt: new Date().toISOString(),
        anonymous: checkAnonymous.checked,
        photo: photoObject,
        roadName: selectedRoadName || 'Chennai Street',
        roadGeometry: selectedRoadGeometry || null,
        demo: true,
      },
    };

    // Add complaint via existing map API
    const added = complaintMap.addComplaint(newFeature);

    // Pan map to new complaint
    if (typeof complaintMap.flyToLocation === 'function') {
      complaintMap.flyToLocation(selectedCoords.lng, selectedCoords.lat, 14.5);
    }

    // Success notification
    showSuccessToast(newId, selectedCategory, isRoadSnapped, Boolean(photoObject));

    if (typeof onSubmitted === 'function') {
      onSubmitted(added);
    }

    // Reset and close
    resetForm();
    closeModal();
  });

  // Modal Open/Close/Reset Methods
  function openModal() {
    isPickingLocation = false;
    pickBanner.style.display = 'none';
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    descInput.focus();
  }

  function closeModal() {
    stopCamera();
    if (typeof complaintMap.clearPreviewLocation === 'function') {
      complaintMap.clearPreviewLocation();
    }
    modalOverlay.style.display = 'none';
    document.body.style.overflow = '';
    clearErrors();
  }

  function resetForm() {
    selectedCategory = 'road_damage';
    selectedCoords = null;
    selectedAccuracy = null;
    locationSource = 'map_selected';
    selectedRoadName = null;
    selectedRoadGeometry = null;
    isRoadSnapped = false;
    isAnonymous = false;
    photoData = null;

    if (typeof complaintMap.clearPreviewLocation === 'function') {
      complaintMap.clearPreviewLocation();
    }

    categoryGrid.querySelectorAll('.cat-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.cat === 'road_damage');
    });
    categorySelect.value = 'road_damage';

    descInput.value = '';
    charCounter.textContent = '0 / 500';
    charCounter.style.color = '#64748B';

    cameraInput.value = '';
    galleryInput.value = '';
    photoPreviewImg.src = '';
    photoPreviewContainer.style.display = 'none';
    stopCamera();
    photoChoiceBox.style.display = 'flex';

    locationText.textContent = 'No location selected yet';
    locationText.className = 'location-text muted';
    locPinIcon.textContent = '📍';
    roadSnapHint.style.display = 'none';

    checkAnonymous.checked = false;
    clearErrors();
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearErrors() {
    errorBanner.textContent = '';
    errorBanner.style.display = 'none';
    if (cameraErrorCard) cameraErrorCard.style.display = 'none';
  }

  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.style.display === 'flex') {
      closeModal();
    }
  });

  window.addEventListener('beforeunload', stopCamera);
  window.addEventListener('pagehide', stopCamera);

  modalOverlay.querySelector('.civicproof-modal-card').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  return {
    open: openModal,
    close: closeModal,
    reset: resetForm,
    destroy() {
      stopCamera();
      window.removeEventListener('beforeunload', stopCamera);
      window.removeEventListener('pagehide', stopCamera);
      if (typeof complaintMap.clearPreviewLocation === 'function') {
        complaintMap.clearPreviewLocation();
      }
      if (isPickingLocation) complaintMap.cancelLocationPick();
      modalOverlay.remove();
      pickBanner.remove();
    },
  };
}

/**
 * Toast Notification for Submission Success
 */
function showSuccessToast(id, category, isRoadSnapped, hasGeotaggedPhoto) {
  const toast = document.createElement('div');
  toast.className = 'civicproof-toast';
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">✅</span>
      <div>
        <strong>Report Submitted Successfully!</strong>
        <p>Issue #${id} added to citizen map as Open ${isRoadSnapped ? '(Street Segment Highlighted)' : '(Off-Road Point)'}.${hasGeotaggedPhoto ? ' 📸 GPS-Geotagged photo attached.' : ''} (Fictional Demo Prototype)</p>
      </div>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}
