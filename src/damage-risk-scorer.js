/**
 * CivicProof Map Module - Comparative Road Damage Risk Scorer
 *
 * Calculates a centralized comparative road-risk score for each local affected road segment
 * relative to all other damaged road segments currently shown on the map.
 *
 * Scoring factors:
 * 1. Complaint severity weight (category base, severity level, description keyword cues, status)
 * 2. Number of complaints affecting the local road segment (multi-complaint compounding)
 * 3. Complaint density within the local influence radius (~500m spatial clustering)
 * 4. Recency weight when complaint timestamps are available (recent issues have higher urgency)
 *
 * Normalization:
 * - 0–33%: Relatively low impact compared with other damaged roads — Minimal risk / green (#10B981)
 * - 34–66%: Moderate impact compared with other damaged roads — Medium risk / yellow (#F59E0B)
 * - 67–100%: Among the most affected roads on the map — High risk / red (#EF4444)
 */

/**
 * Calculates Haversine distance in meters between two [lng, lat] coordinates.
 *
 * @param {number[]} coord1 - [lng, lat]
 * @param {number[]} coord2 - [lng, lat]
 * @returns {number} Distance in meters
 */
export function haversineMeters(coord1, coord2) {
  if (!coord1 || !coord2) return Infinity;
  const R = 6371000;
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLng = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Evaluates the intrinsic severity weight for a complaint.
 *
 * @param {Object} complaint - GeoJSON complaint feature or complaint properties
 * @returns {number} Severity weight in range [0.5, 5.0]
 */
export function getComplaintSeverityWeight(complaint) {
  if (!complaint) return 1.0;
  const props = complaint.properties || complaint;

  // 1. Explicit severity property if provided
  if (props.severity !== undefined) {
    if (typeof props.severity === 'number') {
      return Math.max(0.5, Math.min(5.0, props.severity));
    }
    const s = String(props.severity).toLowerCase();
    if (s.includes('crit') || s.includes('fatal')) return 4.5;
    if (s.includes('high') || s.includes('severe')) return 3.5;
    if (s.includes('med')) return 2.5;
    if (s.includes('low') || s.includes('minor') || s.includes('min')) return 1.0;
  }

  // 2. Base weight by category
  let weight = 2.0;
  const cat = String(props.category || '').toLowerCase();
  if (cat.includes('road') || cat.includes('pothole')) {
    weight = 3.2; // Direct road surface degradation
  } else if (cat.includes('water')) {
    weight = 2.6; // Ruptured pipeline / road flooding / erosion
  } else if (cat.includes('waste') || cat.includes('garbage')) {
    weight = 2.0; // Lane obstruction / sanitation
  } else if (cat.includes('light')) {
    weight = 1.6; // Visibility hazard
  } else {
    weight = 1.8;
  }

  // 3. Keyword cues from description
  const desc = String(props.description || '').toLowerCase();
  if (
    desc.includes('accident') ||
    desc.includes('danger') ||
    desc.includes('fatal') ||
    desc.includes('hazard') ||
    desc.includes('sinkhole') ||
    desc.includes('crater') ||
    desc.includes('emergency') ||
    desc.includes('collapse')
  ) {
    weight += 1.2;
  } else if (
    desc.includes('deep') ||
    desc.includes('block') ||
    desc.includes('obstruct') ||
    desc.includes('traffic') ||
    desc.includes('ruptur') ||
    desc.includes('overflow') ||
    desc.includes('flooding')
  ) {
    weight += 0.6;
  } else if (
    desc.includes('minor') ||
    desc.includes('small') ||
    desc.includes('surface') ||
    desc.includes('slight') ||
    desc.includes('minimal')
  ) {
    weight = Math.max(0.8, weight - 0.8);
  }

  // 4. Status adjustment (open complaints present active unmitigated road danger)
  const status = props.status;
  if (status === 'resolved') {
    weight *= 0.25; // Resolved issues have minimal active traffic impact
  } else if (status === 'in_progress') {
    weight *= 0.75; // Mitigated / work in progress
  }

  return Math.max(0.5, Math.min(5.0, weight));
}

/**
 * Calculates recency weight when complaint timestamps are available.
 * Recent complaints carry higher immediate urgency.
 *
 * @param {string | number} [createdAt]
 * @param {number} [referenceTime=Date.now()]
 * @returns {number} Recency weight in range [0.7, 1.35]
 */
export function getComplaintRecencyWeight(createdAt, referenceTime = Date.now()) {
  if (!createdAt) return 1.0;
  try {
    const timestamp = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
    if (isNaN(timestamp)) return 1.0;

    const daysAgo = Math.max(0, (referenceTime - timestamp) / (1000 * 60 * 60 * 24));

    if (daysAgo <= 3) return 1.35;
    if (daysAgo <= 7) return 1.25;
    if (daysAgo <= 14) return 1.15;
    if (daysAgo <= 30) return 1.0;
    if (daysAgo <= 60) return 0.85;
    return 0.70;
  } catch {
    return 1.0;
  }
}

/**
 * Evaluates spatial complaint density within local influence radius (~500m).
 * Segments clustered in high-incidence zones receive a higher concentration multiplier.
 *
 * @param {number[]} centerCoords - [lng, lat]
 * @param {Array<Object>} allComplaints - All complaints currently on map
 * @param {number} [radiusMeters=500]
 * @returns {number} Density multiplier in range [1.0, 2.2]
 */
export function getComplaintDensityFactor(centerCoords, allComplaints, radiusMeters = 500) {
  if (!centerCoords || !Array.isArray(allComplaints) || allComplaints.length <= 1) {
    return 1.0;
  }

  let weightedNearby = 0;
  for (const c of allComplaints) {
    const cCoords = c.geometry?.coordinates;
    if (!cCoords) continue;

    // Skip the segment midpoint itself
    if (
      Math.abs(cCoords[0] - centerCoords[0]) < 0.00001 &&
      Math.abs(cCoords[1] - centerCoords[1]) < 0.00001
    ) {
      continue;
    }

    const dist = haversineMeters(centerCoords, cCoords);
    if (dist <= radiusMeters) {
      const falloff = 1.0 - (dist / radiusMeters);
      weightedNearby += falloff;
    }
  }

  return 1.0 + Math.min(1.2, weightedNearby / 3.0);
}

/**
 * Computes the raw composite risk score for a single road segment.
 *
 * @param {Array<Object>} segmentComplaints - Complaints affecting this segment
 * @param {number[]} centerCoords - [lng, lat] of the segment
 * @param {Array<Object>} allComplaints - All active complaints on map
 * @param {number} [referenceTime]
 * @returns {Object} Score details
 */
export function calculateSegmentRawScore(
  segmentComplaints,
  centerCoords,
  allComplaints = [],
  referenceTime = Date.now()
) {
  if (!Array.isArray(segmentComplaints) || segmentComplaints.length === 0) {
    return { rawScore: 0, count: 0, avgSeverity: 0, avgRecency: 0, densityFactor: 1.0 };
  }

  let totalWeightedSeverity = 0;
  let sumSeverity = 0;
  let sumRecency = 0;

  for (const comp of segmentComplaints) {
    const sev = getComplaintSeverityWeight(comp);
    const rec = getComplaintRecencyWeight(comp.properties?.createdAt, referenceTime);
    totalWeightedSeverity += sev * rec;
    sumSeverity += sev;
    sumRecency += rec;
  }

  const count = segmentComplaints.length;
  // Compounding multiplier for multiple overlapping reports on the same road segment
  const countMultiplier = 1.0 + Math.log2(count) * 0.45;
  const densityFactor = getComplaintDensityFactor(centerCoords, allComplaints, 500);

  const rawScore = totalWeightedSeverity * countMultiplier * densityFactor;

  return {
    rawScore,
    count,
    avgSeverity: Number((sumSeverity / count).toFixed(2)),
    avgRecency: Number((sumRecency / count).toFixed(2)),
    densityFactor: Number(densityFactor.toFixed(2)),
  };
}

import { getRiskStyle } from './style-config.js';
export { getRiskStyle };

/**
 * Returns risk tier classification, color, and labels for a 0–100 comparative damage percentage.
 * Delegates to centralized getRiskStyle() to guarantee complete color and classification agreement.
 *
 * @param {number} percentage - Comparative score in [0, 100]
 * @returns {Object} Risk tier details
 */
export function getDamageRiskTier(percentage) {
  return getRiskStyle(percentage);
}

/**
 * Evaluates an individual complaint's raw risk score, percentage, and tier.
 *
 * @param {Object} complaint
 * @param {Array<Object>} [allComplaints=[]]
 * @param {number} [referenceTime=Date.now()]
 * @returns {Object} { rawScore, percentage, tier, markerColor, roadColor, casingColor }
 */
export function scoreSingleComplaint(complaint, allComplaints = [], referenceTime = Date.now()) {
  if (!complaint) {
    const tier = getDamageRiskTier(20);
    return { rawScore: 1.0, percentage: 20, tier: tier.tier, ...tier };
  }

  const coords = complaint.geometry?.coordinates || [80.27, 13.08];
  const scoreDetails = calculateSegmentRawScore([complaint], coords, allComplaints, referenceTime);
  const raw = scoreDetails.rawScore;

  // Calibrated absolute mapping if standalone
  let percentage = 20;
  if (raw <= 0.85) {
    percentage = Math.max(5, Math.min(30, Math.round(5 + raw * 25)));
  } else if (raw <= 1.85) {
    percentage = Math.max(36, Math.min(64, Math.round(36 + (raw - 0.85) * 28)));
  } else {
    percentage = Math.max(68, Math.min(97, Math.round(68 + Math.min(29, (raw - 1.85) * 22))));
  }

  const tier = getDamageRiskTier(percentage);
  return {
    rawScore: Number(raw.toFixed(2)),
    percentage,
    ...tier,
  };
}

/**
 * Formats the standard hover tooltip text explaining the comparative percentage.
 *
 * @param {number} percentage
 * @param {string} [roadName]
 * @returns {string} Human-readable meaning
 */
export function getComparativeExplanation(percentage, roadName = 'This road segment') {
  if (percentage >= 67) {
    return `${roadName} is among the most affected roads on the map relative to other damaged roads.`;
  }
  if (percentage >= 34) {
    return `${roadName} has moderate impact compared with other damaged road segments on the map.`;
  }
  return `${roadName} has relatively low impact compared with other damaged roads on the map.`;
}

/**
 * Centralized comparative road-risk normalization.
 *
 * Compares each local affected road segment against all other damaged road segments
 * currently shown on the map and normalizes into a 0–100 comparative percentage.
 *
 * @param {Array<Object>} roadFeatures - Array of road segment GeoJSON features
 * @param {Array<Object>} fallbackFeatures - Array of fallback point GeoJSON features
 * @param {Array<Object>} allComplaints - Raw array of all complaints currently on the map
 * @param {number} [referenceTime]
 */
export function calculateComparativeDamagePercentages(
  roadFeatures = [],
  fallbackFeatures = [],
  allComplaints = [],
  referenceTime = Date.now()
) {
  // 1. Score each individual complaint across the entire active dataset
  if (Array.isArray(allComplaints) && allComplaints.length > 0) {
    const rawCompScores = allComplaints.map((c, i) => {
      const coords = c.geometry?.coordinates || [80.27, 13.08];
      const sc = calculateSegmentRawScore([c], coords, allComplaints, referenceTime);
      return { complaint: c, raw: sc.rawScore, scoreDetails: sc, origIndex: i };
    });

    rawCompScores.sort((a, b) => b.raw - a.raw);
    const n = rawCompScores.length;

    rawCompScores.forEach((item, rank) => {
      let pct = 20;
      if (n >= 15) {
        // Calibrated distribution for live citizen platform:
        // Top ~20% -> 68-96% (High risk)
        // Middle ~41% -> 38-62% (Medium risk)
        // Bottom ~38% -> 8-30% (Minimal risk)
        const highCut = Math.round(n * 0.207);
        const medCut = Math.round(n * (0.207 + 0.414));

        if (rank < highCut) {
          const sub = rank / Math.max(1, highCut);
          pct = Math.round(96 - sub * 24); // 72% down to 96%
        } else if (rank < medCut) {
          const sub = (rank - highCut) / Math.max(1, medCut - highCut);
          pct = Math.round(62 - sub * 24); // 38% to 62%
        } else {
          const sub = (rank - medCut) / Math.max(1, n - medCut);
          pct = Math.round(30 - sub * 22); // 8% to 30%
        }
      } else {
        const minC = rawCompScores[rawCompScores.length - 1].raw;
        const maxC = rawCompScores[0].raw;
        const rel = maxC > minC ? (item.raw - minC) / (maxC - minC) : 0.5;
        pct = Math.round(8 + rel * 86);
      }

      // If complaint has explicit severity, honor it directly
      const explicitSev = item.complaint.properties?.severity;
      if (explicitSev !== undefined && explicitSev !== null) {
        const s = String(explicitSev).toLowerCase();
        if (s.includes('crit') || s.includes('fatal') || s.includes('high') || Number(explicitSev) >= 4) {
          pct = Math.max(75, pct);
        } else if (s.includes('med') || s.includes('mod') || (Number(explicitSev) >= 2.5 && Number(explicitSev) < 4)) {
          pct = Math.max(45, Math.min(62, pct));
        } else if (s.includes('low') || s.includes('min') || Number(explicitSev) <= 2) {
          pct = Math.min(30, pct);
        }
      }

      pct = Math.max(0, Math.min(100, pct));
      const style = getRiskStyle(pct);

      if (item.complaint.properties) {
        item.complaint.properties.damagePercentage = pct;
        item.complaint.properties.damageRiskScore = pct;
        item.complaint.properties.damageRiskTier = style.tier;
        item.complaint.properties.damageRiskLabel = style.riskLabel;
        item.complaint.properties.riskCategory = style.riskCategory;
        item.complaint.properties.markerColor = style.markerColor; // Dark marker color (#D71920 / #F59E0B / #16A34A)
        item.complaint.properties.roadHighlightColor = style.roadHighlightColor; // Light road highlight color (#FCA5A5 / #FCD34D / #86EFAC)
        item.complaint.properties.roadColor = style.roadColor;
        item.complaint.properties.riskColor = style.roadColor;
        item.complaint.properties.casingColor = style.casingColor;
        item.complaint.properties.textColor = style.textColor; // Green / Orange / Red prediction text color
        item.complaint.properties.predictionColor = style.predictionColor;
        item.complaint.properties.predictionText = style.predictionText;
        item.complaint.properties.riskAssessment = style.riskAssessment;
      }
    });
  }

  const allTargetFeatures = [...roadFeatures, ...fallbackFeatures];
  if (allTargetFeatures.length === 0) return;

  // 2. Calculate composite score for each damaged road / fallback feature
  const scoredItems = [];

  for (const feature of allTargetFeatures) {
    const props = feature.properties || {};

    let complaintsOnSegment = [];
    if (props.allComplaintsJson) {
      try {
        const parsed = JSON.parse(props.allComplaintsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          complaintsOnSegment = parsed.map((p) => ({
            properties: p,
            geometry: feature.geometry,
          }));
        }
      } catch {
        complaintsOnSegment = [{ properties: props, geometry: feature.geometry }];
      }
    } else {
      complaintsOnSegment = [{ properties: props, geometry: feature.geometry }];
    }

    let center = [80.27, 13.08];
    if (feature.geometry) {
      if (feature.geometry.type === 'Point') {
        center = feature.geometry.coordinates;
      } else if (feature.geometry.type === 'LineString' && Array.isArray(feature.geometry.coordinates)) {
        const coords = feature.geometry.coordinates;
        const midIdx = Math.floor(coords.length / 2);
        center = coords[midIdx] || coords[0];
      }
    }

    const scoreDetails = calculateSegmentRawScore(
      complaintsOnSegment,
      center,
      allComplaints,
      referenceTime
    );

    scoredItems.push({
      feature,
      center,
      scoreDetails,
      complaintsOnSegment,
    });
  }

  // 3. Score range across target features
  const rawScores = scoredItems.map((item) => item.scoreDetails.rawScore);
  const minRaw = Math.min(...rawScores);
  const maxRaw = Math.max(...rawScores);
  const totalItems = scoredItems.length;

  scoredItems.sort((a, b) => b.scoreDetails.rawScore - a.scoreDetails.rawScore);

  const tierPriority = { high: 3, medium: 2, minimal: 1 };

  scoredItems.forEach((item, rank) => {
    const { feature, scoreDetails, complaintsOnSegment } = item;
    const raw = scoreDetails.rawScore;

    let percentage = 20;

    if (totalItems === 1 || maxRaw === minRaw) {
      if (raw <= 1.0) {
        percentage = Math.max(8, Math.min(28, Math.round(8 + raw * 18)));
      } else if (raw <= 2.2) {
        percentage = Math.max(36, Math.min(62, Math.round(36 + (raw - 1.0) * 20)));
      } else {
        percentage = Math.max(68, Math.min(96, Math.round(68 + Math.min(28, (raw - 2.2) * 8))));
      }
    } else if (totalItems >= 15) {
      const rankRatio = rank / (totalItems - 1);
      if (rankRatio <= 0.24) {
        const sub = rank / Math.max(1, Math.round(totalItems * 0.24));
        percentage = Math.round(96 - sub * 24);
      } else if (rankRatio <= 0.64) {
        const sub = (rankRatio - 0.24) / 0.40;
        percentage = Math.round(62 - sub * 24);
      } else {
        const sub = (rankRatio - 0.64) / 0.36;
        percentage = Math.round(30 - sub * 22);
      }
    } else {
      const relativeRatio = (raw - minRaw) / (maxRaw - minRaw);
      const baseMin = Math.max(5, Math.min(25, Math.round((minRaw / maxRaw) * 25)));
      const targetMax = Math.max(78, Math.min(97, Math.round(85 + Math.min(12, maxRaw * 0.5))));
      percentage = Math.round(baseMin + relativeRatio * (targetMax - baseMin));
    }

    // Handle monitored road corridors with 0 complaints
    if (feature.properties?.isMonitoredZero) {
      feature.properties.damagePercentage = 0;
      feature.properties.damageRiskScore = 0;
      feature.properties.damageRiskTier = 'minimal';
      feature.properties.damageRiskLabel = 'Low / 0 Complaints';
      feature.properties.markerColor = '#22C55E';
      feature.properties.roadColor = '#22C55E';
      feature.properties.roadHighlightColor = '#22C55E';
      feature.properties.casingColor = '#166534';
      feature.properties.textColor = '#15803D';
      feature.properties.predictionColor = '#22C55E';
      feature.properties.predictionText = 'Monitored arterial road corridor: zero recorded complaints in the active window.';
      feature.properties.riskAssessment = 'Normal condition: monitored road with 0 recorded complaints.';
      feature.properties.damageExplanation = 'Monitored arterial road corridor: zero recorded complaints in the current monitoring window.';
      feature.properties.complaintCount = 0;
      feature.properties.densityCount = 0;
      return;
    }

    const count = complaintsOnSegment.length;

    // Check if any complaint on this segment has verified severity
    let explicitSeverity = null;
    if (Array.isArray(complaintsOnSegment) && complaintsOnSegment.length > 0) {
      for (const c of complaintsOnSegment) {
        if (c.properties?.severity !== undefined && c.properties?.severity !== null) {
          explicitSeverity = c.properties.severity;
          break;
        }
      }
    }

    // Determine tier and percentage strictly according to density & severity rules:
    // RED: High complaint concentration (3+) or high verified complaint severity
    // YELLOW: Moderate complaint concentration (2) or moderate severity
    // GREEN: Low complaint concentration (1), low severity, or monitored road with 0 complaints
    if (explicitSeverity !== null) {
      const s = String(explicitSeverity).toLowerCase();
      if (s.includes('crit') || s.includes('fatal') || s.includes('high') || Number(explicitSeverity) >= 4) {
        percentage = Math.max(75, percentage);
      } else if (s.includes('med') || s.includes('mod') || (Number(explicitSeverity) >= 2.5 && Number(explicitSeverity) < 4)) {
        percentage = Math.max(45, Math.min(62, percentage));
      } else {
        percentage = Math.min(30, percentage);
      }
    } else {
      // Density & intrinsic severity classification
      if (count >= 3) {
        percentage = Math.max(75, percentage);
      } else if (count === 2) {
        percentage = Math.max(45, Math.min(60, percentage));
      } else {
        if (scoreDetails.avgSeverity >= 3.4) {
          percentage = Math.max(72, percentage);
        } else if (scoreDetails.avgSeverity >= 2.2) {
          percentage = Math.max(42, Math.min(62, percentage));
        } else {
          percentage = Math.min(30, percentage);
        }
      }
    }

    // If segment has complaints that already have assigned risk tiers, ensure road color matches highest complaint
    let maxComplaintTier = null;
    let maxComplaintScore = 0;
    if (Array.isArray(complaintsOnSegment) && complaintsOnSegment.length > 0) {
      for (const c of complaintsOnSegment) {
        const cProps = c.properties || {};
        const cTier = cProps.damageRiskTier || (cProps.severity === 'high' ? 'high' : cProps.severity === 'medium' ? 'medium' : cProps.severity === 'low' ? 'minimal' : null);
        if (cTier && (!maxComplaintTier || tierPriority[cTier] > tierPriority[maxComplaintTier])) {
          maxComplaintTier = cTier;
        }
        const cScore = cProps.damagePercentage || (cProps.severity === 'high' ? 82 : cProps.severity === 'medium' ? 52 : cProps.severity === 'low' ? 18 : 0);
        if (cScore > maxComplaintScore) {
          maxComplaintScore = cScore;
        }
      }
    }

    if (maxComplaintTier) {
      if (maxComplaintTier === 'high' && percentage < 67) {
        percentage = Math.max(68, maxComplaintScore || 75);
      } else if (maxComplaintTier === 'medium' && (percentage < 34 || percentage > 66)) {
        percentage = Math.max(38, Math.min(64, maxComplaintScore || 50));
      } else if (maxComplaintTier === 'minimal' && percentage > 33) {
        percentage = Math.min(30, maxComplaintScore || 20);
      }
    }

    percentage = Math.max(0, Math.min(100, percentage));

    const style = getRiskStyle(percentage);
    const roadName = feature.properties?.roadName || 'This road segment';
    const explanation = getComparativeExplanation(percentage, roadName);

    // Compute telemetry metadata
    let highestSeverity = 1.0;
    let mostRecentDate = null;
    if (Array.isArray(complaintsOnSegment) && complaintsOnSegment.length > 0) {
      for (const c of complaintsOnSegment) {
        const sev = getComplaintSeverityWeight(c);
        if (sev > highestSeverity) highestSeverity = sev;
        const dt = c.properties?.createdAt;
        if (dt && (!mostRecentDate || new Date(dt) > new Date(mostRecentDate))) {
          mostRecentDate = dt;
        }
      }
    }

    feature.properties = feature.properties || {};
    feature.properties.damagePercentage = percentage;
    feature.properties.damageRiskScore = percentage;
    feature.properties.riskCategory = style.riskCategory;
    feature.properties.damageRiskTier = style.tier;
    feature.properties.damageRiskLabel = style.riskLabel;
    feature.properties.markerColor = style.markerColor;
    feature.properties.roadHighlightColor = style.roadHighlightColor;
    feature.properties.roadColor = style.roadColor;
    feature.properties.riskColor = style.roadColor;
    feature.properties.casingColor = style.casingColor;
    feature.properties.textColor = style.textColor;
    feature.properties.predictionColor = style.predictionColor;
    feature.properties.predictionText = style.predictionText;
    feature.properties.riskAssessment = style.riskAssessment;
    feature.properties.damageExplanation = explanation;
    feature.properties.rawRiskScore = Number(raw.toFixed(2));
    feature.properties.severityWeight = scoreDetails.avgSeverity;
    feature.properties.highestSeverity = Number(highestSeverity.toFixed(1));
    feature.properties.densityFactor = scoreDetails.densityFactor;
    feature.properties.recencyWeight = scoreDetails.avgRecency;
    feature.properties.complaintCount = complaintsOnSegment.length;
    feature.properties.mostRecentDate = mostRecentDate;

    // Synchronize all complaints on this segment to guarantee 100% agreement between road and markers
    if (Array.isArray(complaintsOnSegment) && complaintsOnSegment.length > 0) {
      for (const comp of complaintsOnSegment) {
        if (comp && comp.properties) {
          comp.properties.damagePercentage = percentage;
          comp.properties.damageRiskScore = percentage;
          comp.properties.riskCategory = style.riskCategory;
          comp.properties.damageRiskTier = style.tier;
          comp.properties.damageRiskLabel = style.riskLabel;
          comp.properties.markerColor = style.markerColor;
          comp.properties.roadHighlightColor = style.roadHighlightColor;
          comp.properties.roadColor = style.roadColor;
          comp.properties.riskColor = style.roadColor;
          comp.properties.casingColor = style.casingColor;
          comp.properties.textColor = style.textColor;
          comp.properties.predictionColor = style.predictionColor;
          comp.properties.predictionText = style.predictionText;
          comp.properties.riskAssessment = style.riskAssessment;
          comp.properties.damageExplanation = explanation;
          comp.properties.highestSeverity = Number(highestSeverity.toFixed(1));
          comp.properties.densityFactor = scoreDetails.densityFactor;
          comp.properties.recencyWeight = scoreDetails.avgRecency;
          comp.properties.mostRecentDate = mostRecentDate;

          // If this complaint exists in allComplaints, update it too
          if (comp.properties.id && Array.isArray(allComplaints)) {
            const matchInAll = allComplaints.find((ac) => ac.properties?.id === comp.properties.id);
            if (matchInAll && matchInAll.properties) {
              matchInAll.properties.damagePercentage = percentage;
              matchInAll.properties.damageRiskScore = percentage;
              matchInAll.properties.riskCategory = style.riskCategory;
              matchInAll.properties.damageRiskTier = style.tier;
              matchInAll.properties.damageRiskLabel = style.riskLabel;
              matchInAll.properties.markerColor = style.markerColor;
              matchInAll.properties.roadHighlightColor = style.roadHighlightColor;
              matchInAll.properties.roadColor = style.roadColor;
              matchInAll.properties.riskColor = style.roadColor;
              matchInAll.properties.casingColor = style.casingColor;
              matchInAll.properties.textColor = style.textColor;
              matchInAll.properties.predictionColor = style.predictionColor;
              matchInAll.properties.predictionText = style.predictionText;
              matchInAll.properties.riskAssessment = style.riskAssessment;
              matchInAll.properties.damageExplanation = explanation;
            }
          }
        }
      }
    }
  });
}

/**
 * Architectural alias requested by system design: calculateRoadDamageScores
 */
export const calculateRoadDamageScores = calculateComparativeDamagePercentages;

/**
 * Calculates comprehensive overall road damage metrics across the active dataset.
 *
 * @param {Object} complaintsFC - GeoJSON FeatureCollection of complaints
 * @returns {Object} Overall damage stats
 */
export function calculateOverallRoadDamageStats(complaintsFC) {
  if (!complaintsFC || !Array.isArray(complaintsFC.features) || complaintsFC.features.length === 0) {
    const defaultStyle = getRiskStyle(0);
    return {
      averagePercentage: 0,
      totalReports: 0,
      highCount: 0,
      mediumCount: 0,
      minimalCount: 0,
      highPct: 0,
      mediumPct: 0,
      minimalPct: 0,
      tier: 'minimal',
      riskLabel: 'No Active Reports',
      label: 'Zero Burden',
      color: '#10B981',
      badgeBg: 'rgba(16, 185, 129, 0.1)',
      badgeBorder: 'rgba(16, 185, 129, 0.3)',
      textColor: '#10B981',
      summary: 'No active road complaints recorded.',
      predictionText: 'Street surface is clear with zero active complaint records.',
      roadDamageReports: 0,
      roadDamagePercentage: 0,
    };
  }

  const features = complaintsFC.features;
  const total = features.length;
  let sumPercentage = 0;
  let scoredCount = 0;
  let high = 0;
  let medium = 0;
  let minimal = 0;
  let roadDamageReports = 0;

  for (const f of features) {
    const props = f.properties || {};
    const cat = String(props.category || '').toLowerCase();
    if (cat.includes('road') || cat.includes('pothole') || cat.includes('damage')) {
      roadDamageReports++;
    }

    const pct =
      typeof props.damagePercentage === 'number' && !isNaN(props.damagePercentage)
        ? props.damagePercentage
        : typeof props.damageRiskScore === 'number' && !isNaN(props.damageRiskScore)
        ? props.damageRiskScore
        : null;

    if (pct !== null) {
      sumPercentage += pct;
      scoredCount++;
    }

    const tier = props.damageRiskTier || (pct !== null ? (pct >= 67 ? 'high' : pct >= 34 ? 'medium' : 'minimal') : 'medium');
    if (tier === 'high') high++;
    else if (tier === 'minimal') minimal++;
    else medium++;
  }

  // Calculate city-wide average damage risk score (0-100%)
  const avgPct = scoredCount > 0 ? Math.round(sumPercentage / scoredCount) : 50;
  const style = getRiskStyle(avgPct);

  return {
    averagePercentage: avgPct,
    totalReports: total,
    highCount: high,
    mediumCount: medium,
    minimalCount: minimal,
    highPct: Math.round((high / total) * 100),
    mediumPct: Math.round((medium / total) * 100),
    minimalPct: Math.round((minimal / total) * 100),
    tier: style.tier,
    riskLabel: style.riskLabel,
    label: style.label,
    color: style.markerColor,
    badgeBg: style.badgeBg,
    badgeBorder: style.badgeBorder,
    textColor: style.textColor,
    summary: style.summary,
    predictionText: style.predictionText,
    roadDamageReports,
    roadDamagePercentage: Math.round((roadDamageReports / total) * 100),
  };
}

