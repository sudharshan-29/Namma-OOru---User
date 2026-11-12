import maplibregl from 'maplibre-gl';
import {
  LAYER_ROADS_HIGHLIGHT,
  LAYER_ROADS_HITBOX,
  LAYER_ROAD_MARKERS,
  LAYER_FALLBACK_POINTS,
  STATUS_CONFIG,
  CATEGORY_CONFIG,
  normalizeCategory,
} from './style-config.js';
import { getDamageRiskTier, getRiskStyle } from './damage-risk-scorer.js';


/**
 * Builds safe DOM element for the complaint popup using textContent.
 * Absolutely NO innerHTML with user or feature data to ensure XSS immunity.
 *
 * Supports multi-complaint switcher when multiple complaints overlap
 * on the same road segment.
 *
 * @param {Object} props - Complaint properties
 * @returns {HTMLElement} Safe DOM element
 */
export function buildComplaintPopupContent(props) {
  // Parse overlapping complaints if present
  let complaintList = [props];
  if (props.allComplaintsJson) {
    try {
      const parsed = JSON.parse(props.allComplaintsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        complaintList = parsed;
      }
    } catch {
      complaintList = [props];
    }
  }

  let activeIndex = 0;

  const container = document.createElement('div');
  container.className = 'civicproof-popup-content';
  container.style.cssText =
    'padding: 14px 16px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #0F172A; min-width: 270px; max-width: 340px;';

  // 1. Prominent Fictional Demo Disclaimer Badge
  const disclaimerBox = document.createElement('div');
  disclaimerBox.className = 'civicproof-disclaimer-badge';
  disclaimerBox.style.cssText =
    'background: rgba(254, 243, 199, 0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(252, 211, 77, 0.6); color: #92400E; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 8px; border-radius: 6px; margin-bottom: 9px; display: flex; align-items: center; gap: 5px;';

  const disclaimerIcon = document.createElement('span');
  disclaimerIcon.textContent = '⚠️';
  const disclaimerText = document.createElement('span');
  disclaimerText.textContent = 'DEMO DATA — NOT A LIVE GOVERNMENT RECORD';
  disclaimerBox.appendChild(disclaimerIcon);
  if (props.demo) {
    container.appendChild(disclaimerBox);
  }

  // 2. Street/Road Location Header
  const roadBanner = document.createElement('div');
  roadBanner.className = 'civicproof-road-banner';
  roadBanner.style.cssText =
    'background: rgba(241, 245, 249, 0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.7); padding: 6px 10px; border-radius: 8px; margin-bottom: 9px; display: flex; align-items: center; justify-content: space-between; gap: 6px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);';

  const roadNameBox = document.createElement('div');
  roadNameBox.style.cssText =
    'display: flex; align-items: center; gap: 6px; overflow: hidden; font-weight: 600; font-size: 12.5px; color: #1E293B;';
  const roadIcon = document.createElement('span');
  roadIcon.textContent = props.isFallback ? '📍' : '🛣️';
  const roadTitle = document.createElement('span');
  roadTitle.style.cssText =
    'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;';
  roadTitle.textContent = props.roadName || (props.isFallback ? 'Off-road Location' : 'Chennai Street');
  roadNameBox.appendChild(roadIcon);
  roadNameBox.appendChild(roadTitle);
  roadBanner.appendChild(roadNameBox);

  // If road is highlighted vs fallback point
  if (!props.isFallback) {
    const highlightTag = document.createElement('span');
    highlightTag.style.cssText =
      'background: rgba(220, 252, 231, 0.85); color: #15803D; border: 1px solid rgba(134, 239, 172, 0.6); font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; white-space: nowrap;';
    highlightTag.textContent = 'Road Segment';
    roadBanner.appendChild(highlightTag);
  } else {
    const fallbackTag = document.createElement('span');
    fallbackTag.style.cssText =
      'background: rgba(241, 245, 249, 0.85); color: #475569; border: 1px solid rgba(203, 213, 225, 0.6); font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; white-space: nowrap;';
    fallbackTag.textContent = 'Off-Road Point';
    roadBanner.appendChild(fallbackTag);
  }
  container.appendChild(roadBanner);

  // Geometry status notice (transparently explains real road geometry vs fallback limitation)
  if (props.isFallback) {
    const limitationNotice = document.createElement('div');
    limitationNotice.style.cssText =
      'background: rgba(248, 250, 252, 0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px dashed rgba(203, 213, 225, 0.8); border-radius: 8px; padding: 6px 10px; font-size: 11px; color: #475569; margin-bottom: 9px; display: flex; align-items: flex-start; gap: 6px; line-height: 1.35;';
    const limitIcon = document.createElement('span');
    limitIcon.textContent = 'ℹ️';
    const limitText = document.createElement('span');
    limitText.textContent =
      'Geometry Notice: Off-road location (e.g. park or promenade). No vector street centerline was found within 80m. Rendered as a point marker to avoid drawing misleading lines.';
    limitationNotice.appendChild(limitIcon);
    limitationNotice.appendChild(limitText);
    container.appendChild(limitationNotice);
  } else {
    const geomNotice = document.createElement('div');
    geomNotice.style.cssText =
      'background: rgba(240, 253, 244, 0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid rgba(187, 247, 208, 0.7); border-radius: 8px; padding: 5px 10px; font-size: 10.5px; color: #166534; margin-bottom: 9px; display: flex; align-items: center; gap: 6px;';
    const checkIcon = document.createElement('span');
    checkIcon.textContent = '✓';
    const checkText = document.createElement('span');
    checkText.textContent =
      'Real Road Geometry: Highlight follows municipal street vector centerline.';
    geomNotice.appendChild(checkIcon);
    geomNotice.appendChild(checkText);
    container.appendChild(geomNotice);
  }

  // 3. Comparative Road Damage Risk Section (Frosted Glass Panel)
  if (props.damagePercentage !== undefined) {
    const damagePct = typeof props.damagePercentage === 'number'
      ? props.damagePercentage
      : parseInt(props.damagePercentage, 10) || 0;
    const style = getRiskStyle(damagePct);

    const riskBox = document.createElement('div');
    riskBox.className = 'civicproof-damage-risk-box';
    riskBox.style.cssText =
      `background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid ${style.badgeBorder}; border-radius: 10px; padding: 10px 12px; margin-bottom: 9px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);`;

    const riskHeader = document.createElement('div');
    riskHeader.style.cssText =
      `display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 12.5px; color: ${style.textColor}; margin-bottom: 5px;`;
    const riskTitle = document.createElement('span');
    riskTitle.textContent = `Road Damage Risk: ${damagePct}% — ${style.riskLabel}`;
    const riskBadge = document.createElement('span');
    riskBadge.style.cssText =
      `font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 6px; background: rgba(255, 255, 255, 0.85); border: 1px solid ${style.badgeBorder}; color: ${style.textColor};`;
    riskBadge.textContent = `${damagePct}%`;
    riskHeader.appendChild(riskTitle);
    riskHeader.appendChild(riskBadge);
    riskBox.appendChild(riskHeader);

    // Progress bar
    const pTrack = document.createElement('div');
    pTrack.style.cssText =
      'width: 100%; height: 5px; background: rgba(226, 232, 240, 0.7); border-radius: 3px; overflow: hidden; margin-bottom: 6px;';
    const pFill = document.createElement('div');
    pFill.style.cssText =
      `width: ${damagePct}%; height: 100%; background-color: ${style.markerColor}; border-radius: 3px; transition: width 0.4s ease;`;
    pTrack.appendChild(pFill);
    riskBox.appendChild(pTrack);

    // Prediction Text (synchronized color)
    const predictionLine = document.createElement('div');
    predictionLine.style.cssText =
      `font-size: 11px; font-weight: 600; color: ${style.textColor}; margin-bottom: 5px; line-height: 1.35;`;
    predictionLine.textContent = `Prediction: ${style.predictionText}`;
    riskBox.appendChild(predictionLine);

    // Telemetry Factors Line
    const telemetryRow = document.createElement('div');
    telemetryRow.style.cssText =
      'font-size: 10px; color: #64748B; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;';
    const highestSev = props.highestSeverity || (damagePct >= 67 ? 'High' : damagePct >= 34 ? 'Medium' : 'Low');
    const dens = props.densityFactor ? `${props.densityFactor}x` : '1.0x';
    telemetryRow.textContent = `Reports: ${complaintList.length} • Max Severity: ${highestSev} • Density: ${dens}`;
    riskBox.appendChild(telemetryRow);

    // Relative Risk Explanation
    const riskExpl = document.createElement('div');
    riskExpl.style.cssText = 'font-size: 10px; color: #64748B; line-height: 1.35; border-top: 1px dashed rgba(226, 232, 240, 0.8); padding-top: 5px;';
    riskExpl.textContent = 'Note: This percentage represents relative complaint-based road risk compared with other damaged roads on the map, not physical road damage.';
    riskBox.appendChild(riskExpl);

    container.appendChild(riskBox);
  }

  // 4. Multi-Complaint Overlap Navigation (if 2+ complaints on this road segment)
  let updateCardContent = null;

  if (complaintList.length > 1) {
    const multiBar = document.createElement('div');
    multiBar.style.cssText =
      'background-color: #EFF6FF; border: 1px solid #BFDBFE; color: #1E40AF; padding: 4px 8px; border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;';

    const countLabel = document.createElement('span');
    countLabel.style.fontWeight = '600';
    countLabel.textContent = `${complaintList.length} complaints on this street`;

    const navBtns = document.createElement('div');
    navBtns.style.cssText = 'display: flex; align-items: center; gap: 4px;';

    const counterSpan = document.createElement('span');
    counterSpan.style.cssText = 'font-weight: 700; margin: 0 4px; font-family: monospace;';
    counterSpan.textContent = `1 of ${complaintList.length}`;

    const btnPrev = document.createElement('button');
    btnPrev.type = 'button';
    btnPrev.textContent = '◀';
    btnPrev.style.cssText =
      'background: #DBEAFE; border: 1px solid #93C5FD; color: #1E40AF; border-radius: 4px; cursor: pointer; padding: 2px 6px; font-size: 10px; line-height: 1;';

    const btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.textContent = '▶';
    btnNext.style.cssText =
      'background: #DBEAFE; border: 1px solid #93C5FD; color: #1E40AF; border-radius: 4px; cursor: pointer; padding: 2px 6px; font-size: 10px; line-height: 1;';

    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      activeIndex = (activeIndex - 1 + complaintList.length) % complaintList.length;
      counterSpan.textContent = `${activeIndex + 1} of ${complaintList.length}`;
      if (updateCardContent) updateCardContent(complaintList[activeIndex]);
    });

    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      activeIndex = (activeIndex + 1) % complaintList.length;
      counterSpan.textContent = `${activeIndex + 1} of ${complaintList.length}`;
      if (updateCardContent) updateCardContent(complaintList[activeIndex]);
    });

    navBtns.appendChild(btnPrev);
    navBtns.appendChild(counterSpan);
    navBtns.appendChild(btnNext);

    multiBar.appendChild(countLabel);
    multiBar.appendChild(navBtns);
    container.appendChild(multiBar);
  }

  // 4. Dynamic Complaint Card Container
  const cardBody = document.createElement('div');
  cardBody.className = 'civicproof-card-body';
  container.appendChild(cardBody);

  updateCardContent = (item) => {
    while (cardBody.firstChild) {
      cardBody.removeChild(cardBody.firstChild);
    }

    // Header Row: Category Badge + Status Pill + Risk/Recurring
    const headerRow = document.createElement('div');
    headerRow.style.cssText =
      'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;';

    const badgesContainer = document.createElement('div');
    badgesContainer.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

    const normCat = normalizeCategory(item.category);
    const catCfg = CATEGORY_CONFIG[normCat] || CATEGORY_CONFIG.other;
    const categoryPill = document.createElement('span');
    categoryPill.style.cssText = `background-color: ${catCfg.accentColor}18; color: ${catCfg.accentColor}; border: 1px solid ${catCfg.accentColor}35; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; display: inline-flex; align-items: center; gap: 4px;`;
    categoryPill.textContent = `${catCfg.icon} ${catCfg.label}`;
    badgesContainer.appendChild(categoryPill);

    const isActWork = String(item.status || '').toLowerCase().replace(/[-_ ]/g, '') === 'inprogress';
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
    const statusPill = document.createElement('span');
    statusPill.style.cssText = `background-color: ${statusCfg.bgColor}; color: ${statusCfg.color}; border: 1px solid ${statusCfg.borderColor}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; display: inline-flex; align-items: center; gap: 4px;`;
    if (isActWork) {
      statusPill.style.backgroundColor = '#FEF3C7';
      statusPill.style.color = '#92400E';
      statusPill.style.borderColor = '#F59E0B';
      const tri = document.createElement('span');
      tri.style.color = '#D97706';
      tri.textContent = '▲';
      const txt = document.createElement('span');
      txt.textContent = 'In Progress (Active Work)';
      statusPill.appendChild(tri);
      statusPill.appendChild(txt);
    } else if (item.status === 'flagged') {
      statusPill.style.backgroundColor = '#FEF2F2';
      statusPill.style.color = '#B91C1C';
      statusPill.style.borderColor = '#FECACA';
      statusPill.textContent = 'AI Flagged';
    } else {
      statusPill.textContent = statusCfg.label;
    }
    badgesContainer.appendChild(statusPill);

    headerRow.appendChild(badgesContainer);

    const sideBadges = document.createElement('div');
    sideBadges.style.cssText = 'display: flex; gap: 6px; flex-direction: column; align-items: flex-end;';

    if (item.riskLevel) {
      const riskColors = { 'Low': '#10B981', 'Medium': '#F59E0B', 'High': '#EF4444', 'Critical': '#7F1D1D' };
      const rColor = riskColors[item.riskLevel] || '#64748B';
      const riskBadge = document.createElement('span');
      riskBadge.style.cssText = `font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid ${rColor}; color: ${rColor}; background: transparent;`;
      riskBadge.textContent = `${item.riskLevel} Priority (${item.riskScore})`;
      sideBadges.appendChild(riskBadge);
    }

    if (item.isRecurring) {
      const recBadge = document.createElement('span');
      recBadge.style.cssText = `font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid #8B5CF6; color: #7C3AED; background: #EDE9FE; display: flex; align-items: center; gap: 4px;`;
      recBadge.textContent = `🔁 Recurring Issue (${item.recurringCount}x)`;
      sideBadges.appendChild(recBadge);
    }
    
    headerRow.appendChild(sideBadges);
    cardBody.appendChild(headerRow);

    // AI Flags Warning Box
    let parsedAiFlags = null;
    if (item.aiFlags) {
      try {
        parsedAiFlags = typeof item.aiFlags === 'string' ? JSON.parse(item.aiFlags) : item.aiFlags;
      } catch {
        parsedAiFlags = [item.aiFlags];
      }
    }
    
    if (parsedAiFlags && parsedAiFlags.length > 0) {
      const aiWarning = document.createElement('div');
      aiWarning.style.cssText = 'background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 8px; margin-bottom: 8px;';
      const aiTitle = document.createElement('div');
      aiTitle.style.cssText = 'color: #B91C1C; font-size: 11px; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;';
      aiTitle.innerHTML = '🤖 AI Evidence Authenticity Warning';
      aiWarning.appendChild(aiTitle);
      
      const aiList = document.createElement('ul');
      aiList.style.cssText = 'margin: 0; padding-left: 16px; color: #991B1B; font-size: 10.5px; line-height: 1.4;';
      parsedAiFlags.forEach(flag => {
        const li = document.createElement('li');
        li.textContent = flag;
        aiList.appendChild(li);
      });
      aiWarning.appendChild(aiList);
      cardBody.appendChild(aiWarning);
    }

    // Complaint ID
    const idRow = document.createElement('div');
    idRow.style.cssText =
      'font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 3px; letter-spacing: -0.01em;';
    idRow.textContent = String(item.id || 'DEMO-RECORD');
    cardBody.appendChild(idRow);

    // Reported Date
    const dateRow = document.createElement('div');
    dateRow.style.cssText = 'font-size: 11px; color: #64748B; margin-bottom: 8px;';
    let dateFormatted = 'Date not recorded';
    if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        dateFormatted = d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      } catch {
        dateFormatted = String(item.createdAt);
      }
    }
    dateRow.textContent = `Reported: ${dateFormatted}`;
    cardBody.appendChild(dateRow);

    // Optional Photo Indicator with Geotag Information
    if (item.photo) {
      let photoObj = item.photo;
      if (typeof photoObj === 'string' && photoObj.trim().startsWith('{')) {
        try {
          photoObj = JSON.parse(photoObj);
        } catch {
          photoObj = item.photo;
        }
      }
      const isObj = typeof photoObj === 'object' && photoObj !== null;
      const photoUrl = isObj ? photoObj.url : photoObj;

      if (photoUrl) {
        const photoWrapper = document.createElement('div');
        photoWrapper.className = 'civicproof-photo-card';
        photoWrapper.style.cssText =
          'margin-bottom: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0; background: #0F172A;';

        const img = document.createElement('img');
        img.src = photoUrl;
        img.alt = 'Attached complaint photo';
        img.style.cssText = 'width: 100%; height: auto; display: block; max-height: 140px; object-fit: cover;';
        photoWrapper.appendChild(img);

        // Geotag & Origin Metadata Badge
        if (isObj && (photoObj.captureMethod || photoObj.location)) {
          const metaBar = document.createElement('div');
          metaBar.style.cssText =
            'padding: 5px 8px; font-size: 10px; color: #CBD5E1; background: #0F172A; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid #1E293B;';

          const topRow = document.createElement('div');
          topRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 6px;';

          const methodTag = document.createElement('span');
          methodTag.style.cssText = 'font-weight: 600; color: #38BDF8; display: flex; align-items: center; gap: 4px;';
          methodTag.textContent =
            photoObj.captureMethod === 'camera' ? '📷 Camera Photo' : '🖼️ Gallery Image';
          topRow.appendChild(methodTag);

          if (photoObj.capturedAt) {
            const timeTag = document.createElement('span');
            try {
              const dt = new Date(photoObj.capturedAt);
              timeTag.textContent = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            } catch {
              timeTag.textContent = String(photoObj.capturedAt);
            }
            topRow.appendChild(timeTag);
          }
          metaBar.appendChild(topRow);

          if (photoObj.location) {
            const locInfo = photoObj.location;
            const locRow = document.createElement('div');
            locRow.style.cssText = 'color: #94A3B8; font-family: monospace; font-size: 9.5px;';

            let sourceLabel = 'Location recorded';
            if (locInfo.source === 'device_gps') {
              sourceLabel = `📍 Live Device GPS (±${locInfo.accuracyMeters || 10}m accuracy)`;
            } else if (locInfo.source === 'exif_gps') {
              sourceLabel = '🧭 Photo EXIF GPS (Embedded in original file)';
            } else if (locInfo.source === 'device_gps_at_upload') {
              sourceLabel = `📍 Device GPS at Upload Time (±${locInfo.accuracyMeters || 10}m)`;
            } else if (locInfo.source === 'map_selected') {
              sourceLabel = '🗺️ Map Confirmed Location';
            }

            locRow.textContent = `${sourceLabel} • [${Number(locInfo.latitude).toFixed(4)}, ${Number(locInfo.longitude).toFixed(4)}]`;
            metaBar.appendChild(locRow);
          }

          photoWrapper.appendChild(metaBar);
        }

        cardBody.appendChild(photoWrapper);
      }
    }

    // Description Block (Strictly DOM textContent, Frosted Glass Card)
    const descBlock = document.createElement('div');
    descBlock.style.cssText =
      'font-size: 12px; line-height: 1.5; color: #1E293B; background: rgba(248, 250, 252, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(226, 232, 240, 0.8); padding: 9px 12px; border-radius: 8px; word-break: break-word;';
    descBlock.textContent = String(item.description || 'No description provided.');
    cardBody.appendChild(descBlock);
  };

  // Initial render of first complaint
  updateCardContent(complaintList[0]);

  return container;
}

/**
 * Builds safe DOM element for the floating hover tooltip.
 * Displays comparative road-risk score, risk tier, progress bar, and comparative explanation.
 *
 * @param {Object} props - Road segment properties
 * @returns {HTMLElement} Safe DOM element
 */
export function buildRoadHoverTooltipContent(props) {
  const container = document.createElement('div');
  container.className = 'civicproof-hover-tooltip-content';
  container.style.cssText =
    'padding: 12px 14px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #0F172A; min-width: 260px; max-width: 320px; line-height: 1.4;';

  const damagePct =
    typeof props.damagePercentage === 'number'
      ? props.damagePercentage
      : props.damagePercentage !== undefined
      ? parseInt(props.damagePercentage, 10)
      : 50;

  const style = getRiskStyle(damagePct);
  const roadName = props.roadName || (props.isFallback ? 'Off-road Location' : 'Chennai Street');
  const count = props.overlapCount || 1;

  // Header: Road Name + Count Pill
  const header = document.createElement('div');
  header.style.cssText =
    'display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 7px;';

  const roadTitle = document.createElement('div');
  roadTitle.style.cssText =
    'font-weight: 700; font-size: 13px; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 195px;';
  roadTitle.textContent = (props.isFallback ? '📍 ' : '🛣️ ') + roadName;
  header.appendChild(roadTitle);

  const countTag = document.createElement('span');
  countTag.style.cssText =
    'font-size: 10px; font-weight: 600; color: #475569; background: rgba(241, 245, 249, 0.8); border: 1px solid rgba(226, 232, 240, 0.8); padding: 2px 7px; border-radius: 6px; white-space: nowrap;';
  countTag.textContent = `${count} ${count === 1 ? 'report' : 'reports'}`;
  header.appendChild(countTag);
  container.appendChild(header);

  // Main Comparative Risk Line: "Road Damage Risk: 82% — High Risk"
  const riskLine = document.createElement('div');
  riskLine.style.cssText =
    `font-size: 13px; font-weight: 700; color: ${style.textColor}; display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;`;

  const riskLabelSpan = document.createElement('span');
  riskLabelSpan.textContent = `Road Damage Risk: ${damagePct}% — ${style.riskLabel}`;
  riskLine.appendChild(riskLabelSpan);

  const tierBadge = document.createElement('span');
  tierBadge.style.cssText =
    `font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 6px; background: rgba(255, 255, 255, 0.9); border: 1px solid ${style.badgeBorder}; color: ${style.textColor};`;
  tierBadge.textContent = `${damagePct}%`;
  riskLine.appendChild(tierBadge);
  container.appendChild(riskLine);

  // Visual Risk Progress Bar (0–100%)
  const meterTrack = document.createElement('div');
  meterTrack.style.cssText =
    'width: 100%; height: 6px; background: rgba(226, 232, 240, 0.8); border-radius: 3px; overflow: hidden; margin-bottom: 7px;';
  const meterFill = document.createElement('div');
  meterFill.style.cssText =
    `width: ${damagePct}%; height: 100%; background-color: ${style.markerColor}; border-radius: 3px;`;
  meterTrack.appendChild(meterFill);
  container.appendChild(meterTrack);

  // Prediction Assessment Line (synchronized color)
  const predLine = document.createElement('div');
  predLine.style.cssText =
    `font-size: 11px; font-weight: 600; color: ${style.textColor}; margin-bottom: 5px; line-height: 1.35;`;
  predLine.textContent = `Prediction: ${style.predictionText}`;
  container.appendChild(predLine);

  // Meaning explanation:
  const explanation = document.createElement('div');
  explanation.style.cssText =
    'font-size: 10.5px; color: #475569; margin-bottom: 6px; line-height: 1.35;';
  explanation.textContent = `${damagePct}% represents relative complaint-based road risk compared with other damaged roads on the map, not physical road damage.`;
  container.appendChild(explanation);

  // Footer: factors weighting notice
  const footer = document.createElement('div');
  footer.style.cssText =
    'font-size: 10px; color: #64748B; border-top: 1px solid rgba(226, 232, 240, 0.7); padding-top: 6px; margin-top: 5px; display: flex; align-items: center; justify-content: space-between;';
  const highestSev = props.highestSeverity || (damagePct >= 67 ? 'High' : damagePct >= 34 ? 'Medium' : 'Low');
  const dens = props.densityFactor ? `${props.densityFactor}x` : '1.0x';
  footer.textContent = `Severity: ${highestSev} • Density: ${dens}`;

  const hintSpan = document.createElement('span');
  hintSpan.style.cssText = 'color: #94A3B8; font-style: italic;';
  hintSpan.textContent = 'Click to inspect';
  footer.appendChild(hintSpan);
  container.appendChild(footer);

  return container;
}

/**
 * Attaches interactive click, hover, and popup handlers to road highlight and fallback layers.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Object} [options={}]
 * @param {Function} [options.onComplaintClick]
 * @param {Function} [options.isLocationPickActive]
 * @returns {Object} { destroy, closePopup }
 */
export function setupMapEvents(map, options = {}) {
  let activePopup = null;
  let activeHoverPopup = null;
  let hoveredFeatureId = null;

  const closePopup = () => {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  };

  const closeHoverTooltip = () => {
    if (activeHoverPopup) {
      activeHoverPopup.remove();
      activeHoverPopup = null;
    }
    hoveredFeatureId = null;
  };

  const interactiveLayers = [
    LAYER_ROAD_MARKERS,
    LAYER_FALLBACK_POINTS,
    LAYER_ROADS_HIGHLIGHT,
    LAYER_ROADS_HITBOX,
  ];

  const handleMouseEnter = () => {
    if (options.isLocationPickActive && options.isLocationPickActive()) return;
    map.getCanvas().style.cursor = 'pointer';
  };

  const handleMouseLeave = () => {
    closeHoverTooltip();
    if (options.isLocationPickActive && options.isLocationPickActive()) return;
    map.getCanvas().style.cursor = '';
  };

  const handleMouseMove = (event) => {
    if (options.isLocationPickActive && options.isLocationPickActive()) {
      closeHoverTooltip();
      return;
    }

    if (!event.features || event.features.length === 0) {
      closeHoverTooltip();
      return;
    }

    // Prioritize complaint marker points if mouse is directly hovering over or near a dot
    const markerFeat = event.features.find((f) => f.layer?.id === LAYER_ROAD_MARKERS || f.layer?.id === LAYER_FALLBACK_POINTS);
    const feature = markerFeat || event.features[0];
    const properties = feature.properties || {};
    const featureId = properties.id || properties.roadName || 'feature';

    // Build or update hover tooltip content
    if (featureId !== hoveredFeatureId || !activeHoverPopup) {
      hoveredFeatureId = featureId;
      if (activeHoverPopup) activeHoverPopup.remove();

      const tooltipContent = buildRoadHoverTooltipContent(properties);

      activeHoverPopup = new maplibregl.Popup({
        offset: [0, -10],
        closeButton: false,
        closeOnClick: false,
        maxWidth: '320px',
        className: 'civicproof-hover-tooltip',
      })
        .setLngLat(event.lngLat)
        .setDOMContent(tooltipContent)
        .addTo(map);
    } else if (activeHoverPopup) {
      activeHoverPopup.setLngLat(event.lngLat);
    }
  };

  const handleFeatureClick = (event) => {
    // Suppress popups during location-pick mode
    if (options.isLocationPickActive && options.isLocationPickActive()) {
      return;
    }

    closeHoverTooltip();

    if (!event.features || event.features.length === 0) return;

    // Prioritize complaint marker points if clicked directly on a dot
    const markerFeat = event.features.find((f) => f.layer?.id === LAYER_ROAD_MARKERS || f.layer?.id === LAYER_FALLBACK_POINTS);
    const feature = markerFeat || event.features[0];
    const properties = feature.properties || {};

    // For line strings, anchor popup at exact clicked location on the street
    let popupCoordinates = [event.lngLat.lng, event.lngLat.lat];
    if (feature.geometry && feature.geometry.type === 'Point') {
      popupCoordinates = feature.geometry.coordinates.slice();
    }

    // Handle map coordinate wrapping
    while (Math.abs(event.lngLat.lng - popupCoordinates[0]) > 180) {
      popupCoordinates[0] += event.lngLat.lng > popupCoordinates[0] ? 360 : -360;
    }

    // Close any previous popup
    closePopup();

    // Safely generate DOM content
    const popupContent = buildComplaintPopupContent(properties);

    activePopup = new maplibregl.Popup({
      offset: [0, -6],
      closeButton: true,
      closeOnClick: true,
      maxWidth: '350px',
      className: 'civicproof-map-popup',
    })
      .setLngLat(popupCoordinates)
      .setDOMContent(popupContent)
      .addTo(map);

    if (typeof options.onComplaintClick === 'function') {
      options.onComplaintClick({
        properties,
        geometry: feature.geometry,
        coordinates: popupCoordinates,
      });
    }
  };

  // Register listeners on all interactive layers
  for (const layerId of interactiveLayers) {
    if (map.getLayer(layerId)) {
      map.on('mouseenter', layerId, handleMouseEnter);
      map.on('mousemove', layerId, handleMouseMove);
      map.on('mouseleave', layerId, handleMouseLeave);
      map.on('click', layerId, handleFeatureClick);
    }
  }

  const openComplaintPopup = (properties, coordinates) => {
    if (options.isLocationPickActive && options.isLocationPickActive()) {
      return;
    }
    closeHoverTooltip();
    closePopup();

    let popupCoordinates = coordinates ? coordinates.slice() : [0, 0];
    if (properties.snappedCoords && (!coordinates || coordinates.length < 2)) {
      popupCoordinates = properties.snappedCoords.slice();
    }

    // Safely generate DOM content
    const popupContent = buildComplaintPopupContent(properties);

    activePopup = new maplibregl.Popup({
      offset: [0, -8],
      closeButton: true,
      closeOnClick: true,
      maxWidth: '350px',
      className: 'civicproof-map-popup',
    })
      .setLngLat(popupCoordinates)
      .setDOMContent(popupContent)
      .addTo(map);

    if (typeof options.onComplaintClick === 'function') {
      options.onComplaintClick({
        properties,
        coordinates: popupCoordinates,
      });
    }
  };

  const showHoverTooltip = (properties, coordinates) => {
    if (options.isLocationPickActive && options.isLocationPickActive()) {
      closeHoverTooltip();
      return;
    }
    const featureId = properties.id || properties.roadName || 'feature';
    if (featureId !== hoveredFeatureId || !activeHoverPopup) {
      hoveredFeatureId = featureId;
      if (activeHoverPopup) activeHoverPopup.remove();

      const tooltipContent = buildRoadHoverTooltipContent(properties);
      activeHoverPopup = new maplibregl.Popup({
        offset: [0, -12],
        closeButton: false,
        closeOnClick: false,
        maxWidth: '320px',
        className: 'civicproof-hover-tooltip',
      })
        .setLngLat(coordinates)
        .setDOMContent(tooltipContent)
        .addTo(map);
    }
  };

  const destroy = () => {
    closePopup();
    closeHoverTooltip();
    for (const layerId of interactiveLayers) {
      if (map.getLayer(layerId)) {
        map.off('mouseenter', layerId, handleMouseEnter);
        map.off('mousemove', layerId, handleMouseMove);
        map.off('mouseleave', layerId, handleMouseLeave);
        map.off('click', layerId, handleFeatureClick);
      }
    }
  };

  return {
    closePopup,
    closeHoverTooltip,
    openComplaintPopup,
    showHoverTooltip,
    destroy,
  };
}
