/**
 * NAMMA OORU Map Module - Style & Configuration Constants
 * 
 * Note on OpenFreeMap:
 * Base style uses OpenFreeMap Liberty (keyless, free vector tiles).
 * Current usage terms and availability should be periodically re-checked at https://openfreemap.org.
 */

// Keyless OpenFreeMap style URL (Positron: clean, professional pale white & light-grey GIS aesthetic)
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Default map coordinates: Chennai, Tamil Nadu, India [longitude, latitude]
export const CHENNAI_CENTER = [80.2707, 13.0827];
export const DEFAULT_ZOOM = 14.5;
export const DEFAULT_PITCH = 58;
export const DEFAULT_BEARING = -20;
export const MIN_ZOOM = 9;
export const MAX_ZOOM = 19;
export const MAX_PITCH = 85;

// Global Demo Data Toggle (Enabled for simulated Chennai prototype demonstration)
export let ENABLE_DEMO_DATA = true;

export function isDemoDataEnabled() {
  return ENABLE_DEMO_DATA;
}

export function setDemoDataEnabled(enabled) {
  ENABLE_DEMO_DATA = Boolean(enabled);
}

// Active Work configuration (▲ Yellow Triangle Marker)
export const ACTIVE_WORK_CONFIG = {
  status: 'in_progress',
  color: '#FBBF24',      // Crisp Traffic Yellow
  borderColor: '#0F172A',// Dark contrast casing
  symbol: '▲',
  label: 'Work in progress',
};

/**
 * Checks whether a complaint status qualifies as active work.
 * Strictly maps only in-progress work undergoing active municipal response.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isActiveWork(status) {
  if (!status) return false;
  const s = String(status).toLowerCase().trim().replace(/[-_ ]/g, '');
  return s === 'inprogress';
}

// Density and Severity Road Colors (Aligned with Traffic GIS aesthetic)
// RED: High complaint concentration (3+) or high verified severity
// YELLOW: Moderate complaint concentration (2) or moderate severity
// GREEN: Low complaint concentration (1) or monitored segments with 0 recorded complaints
export const DENSITY_SEVERITY_COLORS = {
  high: {
    code: 'high',
    color: '#EF4444',     // Clean saturated Red
    casing: '#991B1B',
    halo: 'rgba(239, 68, 68, 0.28)',
    label: 'High concentration (3+) or high severity',
    threshold: '≥ 3 complaints',
  },
  moderate: {
    code: 'moderate',
    color: '#EAB308',     // Traffic Yellow / Amber
    casing: '#854D0E',
    halo: 'rgba(234, 179, 8, 0.24)',
    label: 'Moderate concentration (2) or moderate severity',
    threshold: '2 complaints',
  },
  low: {
    code: 'low',
    color: '#22C55E',     // Clean Traffic Green
    casing: '#166534',
    halo: 'rgba(34, 197, 94, 0.20)',
    label: 'Low concentration (1) or 0 recorded complaints',
    threshold: '0–1 complaints',
  },
};

// Status colors (for status badges and modal views)
export const STATUS_COLORS = {
  open: '#EF4444',        // Red
  in_progress: '#FBBF24', // Traffic Yellow ▲
  resolved: '#22C55E',    // Green
};

// Single Unified Game-Style Road Risk Colors
export const RISK_COLORS = {
  high: {
    marker: '#EF4444',
    highlight: '#EF4444',
    road: '#EF4444',
    casing: '#EF4444',
    lightCasing: '#EF4444',
    halo: 'rgba(239, 68, 68, 0.28)',
    label: 'High concentration',
    range: '≥ 3 complaints',
  },
  medium: {
    marker: '#EAB308',
    highlight: '#EAB308',
    road: '#EAB308',
    casing: '#EAB308',
    lightCasing: '#EAB308',
    halo: 'rgba(234, 179, 8, 0.28)',
    label: 'Moderate concentration',
    range: '2 complaints',
  },
  minimal: {
    marker: '#22C55E',
    highlight: '#22C55E',
    road: '#22C55E',
    casing: '#22C55E',
    lightCasing: '#22C55E',
    halo: 'rgba(34, 197, 94, 0.28)',
    label: 'Low / zero complaints',
    range: '0–1 complaints',
  },
};

// Comparative Road Damage Risk Tiers (0-100%)
export const DAMAGE_RISK_TIERS = {
  minimal: {
    min: 0,
    max: 33,
    label: 'Low concentration / Minimal risk',
    markerColor: '#22C55E', // Unified Traffic Green
    roadColor: '#22C55E',   // Unified Traffic Green
    color: '#22C55E',
    casingColor: '#166534',
    textColor: '#15803D',
    bgColor: '#F0FDF4',
    borderColor: '#22C55E',
    summary: 'Low complaint burden (0–1 recorded issues)',
  },
  medium: {
    min: 34,
    max: 66,
    label: 'Moderate concentration / Medium risk',
    markerColor: '#EAB308', // Unified Traffic Yellow
    roadColor: '#EAB308',   // Unified Traffic Yellow
    color: '#EAB308',
    casingColor: '#854D0E',
    textColor: '#A16207',
    bgColor: '#FEFCE8',
    borderColor: '#EAB308',
    summary: 'Moderate complaint concentration (2 recorded issues)',
  },
  high: {
    min: 67,
    max: 100,
    label: 'High concentration / High risk',
    markerColor: '#EF4444', // Unified Traffic Red
    roadColor: '#EF4444',   // Unified Traffic Red
    color: '#EF4444',
    casingColor: '#991B1B',
    textColor: '#B91C1C',
    bgColor: '#FEF2F2',
    borderColor: '#EF4444',
    summary: 'High complaint concentration (3+ issues) or severe disruption',
  },
};

/**
 * Classifies a road segment based on:
 * 1. Verified severity if available (high -> red, moderate -> yellow, low -> green)
 * 2. If severity not collected: complaint density (3+ -> red, 2 -> yellow, 1 -> green, 0 -> green on monitored segments)
 *
 * @param {Object} params
 * @param {number} params.complaintCount - Number of complaints on this segment
 * @param {string|number|null} [params.severity] - Explicit verified severity if present
 * @param {boolean} [params.isMonitoredZero] - Whether segment is a monitored segment with 0 complaints
 * @returns {Object} { tier, color, casing, halo, label, type }
 */
export function getDensityOrSeverityClassification({ complaintCount = 1, severity = null, isMonitoredZero = false } = {}) {
  // 1. If explicit verified severity exists, honor it
  if (severity !== null && severity !== undefined) {
    const s = String(severity).toLowerCase().trim();
    if (s.includes('crit') || s.includes('fatal') || s.includes('high') || s.includes('severe') || Number(severity) >= 4) {
      return {
        tier: 'high',
        color: DENSITY_SEVERITY_COLORS.high.color,
        casing: DENSITY_SEVERITY_COLORS.high.casing,
        halo: DENSITY_SEVERITY_COLORS.high.halo,
        label: 'High verified severity',
        type: 'severity',
      };
    }
    if (s.includes('med') || s.includes('mod') || (Number(severity) >= 2.5 && Number(severity) < 4)) {
      return {
        tier: 'moderate',
        color: DENSITY_SEVERITY_COLORS.moderate.color,
        casing: DENSITY_SEVERITY_COLORS.moderate.casing,
        halo: DENSITY_SEVERITY_COLORS.moderate.halo,
        label: 'Moderate verified severity',
        type: 'severity',
      };
    }
    if (s.includes('low') || s.includes('minor') || Number(severity) < 2.5) {
      return {
        tier: 'low',
        color: DENSITY_SEVERITY_COLORS.low.color,
        casing: DENSITY_SEVERITY_COLORS.low.casing,
        halo: DENSITY_SEVERITY_COLORS.low.halo,
        label: 'Low verified severity',
        type: 'severity',
      };
    }
  }

  // 2. If severity is not collected: strictly use complaint density
  if (isMonitoredZero || complaintCount === 0) {
    return {
      tier: 'low',
      color: DENSITY_SEVERITY_COLORS.low.color,
      casing: DENSITY_SEVERITY_COLORS.low.casing,
      halo: DENSITY_SEVERITY_COLORS.low.halo,
      label: 'Zero recorded complaints (Monitored)',
      type: 'density',
    };
  }

  if (complaintCount >= 3) {
    return {
      tier: 'high',
      color: DENSITY_SEVERITY_COLORS.high.color,
      casing: DENSITY_SEVERITY_COLORS.high.casing,
      halo: DENSITY_SEVERITY_COLORS.high.halo,
      label: `High concentration (${complaintCount} reports)`,
      type: 'density',
    };
  }

  if (complaintCount === 2) {
    return {
      tier: 'moderate',
      color: DENSITY_SEVERITY_COLORS.moderate.color,
      casing: DENSITY_SEVERITY_COLORS.moderate.casing,
      halo: DENSITY_SEVERITY_COLORS.moderate.halo,
      label: 'Moderate concentration (2 reports)',
      type: 'density',
    };
  }

  // 1 complaint = low concentration
  return {
    tier: 'low',
    color: DENSITY_SEVERITY_COLORS.low.color,
    casing: DENSITY_SEVERITY_COLORS.low.casing,
    halo: DENSITY_SEVERITY_COLORS.low.halo,
    label: 'Low concentration (1 report)',
    type: 'density',
  };
}

/**
 * Single centralized function that determines the risk category, marker color,
 * short road highlight color, prediction text color, and styling tokens from final damagePercentage.
 *
 * Single Unified Colors:
 * - 0–33%: Minimal risk / Low concentration | Green (#22C55E)
 * - 34–66%: Medium risk / Moderate concentration | Yellow (#EAB308)
 * - 67–100%: High risk / High concentration | Red (#EF4444)
 *
 * @param {number} damagePercentage - Comparative road-risk percentage [0, 100]
 * @returns {Object} Consistent styling and classification tokens
 */
export function getRiskStyle(damagePercentage) {
  const p = Math.max(0, Math.min(100, Math.round(Number(damagePercentage) || 0)));

  if (p <= 33) {
    return {
      damagePercentage: p,
      riskCategory: 'minimal',
      tier: 'minimal',
      label: 'Minimal risk',
      riskLabel: 'Minimal Risk',
      markerColor: '#22C55E',         // Single Unified Green
      roadHighlightColor: '#22C55E',  // Single Unified Green
      roadColor: '#22C55E',
      color: '#22C55E',
      casingColor: '#166534',
      textColor: '#15803D',           // Single Unified Green text
      predictionColor: '#22C55E',
      badgeBg: '#F0FDF4',
      badgeBorder: '#22C55E',
      haloColor: 'rgba(34, 197, 94, 0.28)',
      summary: 'Low complaint burden (0–1 recorded issues)',
      predictionText: 'Low concentration — street surface is relatively stable with minimal traffic impediment.',
      riskAssessment: 'Low complaint burden: normal road conditions with low disruption.',
    };
  }

  if (p <= 66) {
    return {
      damagePercentage: p,
      riskCategory: 'medium',
      tier: 'medium',
      label: 'Medium risk',
      riskLabel: 'Medium Risk',
      markerColor: '#EAB308',         // Single Unified Yellow
      roadHighlightColor: '#EAB308',  // Single Unified Yellow
      roadColor: '#EAB308',
      color: '#EAB308',
      casingColor: '#854D0E',
      textColor: '#A16207',           // Single Unified Yellow text
      predictionColor: '#EAB308',
      badgeBg: '#FEFCE8',
      badgeBorder: '#EAB308',
      haloColor: 'rgba(234, 179, 8, 0.28)',
      summary: 'Moderate complaint burden (2 recorded issues)',
      predictionText: 'Moderate concentration — roadway deterioration with potential hazard during peak hours.',
      riskAssessment: 'Moderate complaint concentration requiring monitoring and scheduling.',
    };
  }

  return {
    damagePercentage: p,
    riskCategory: 'high',
    tier: 'high',
    label: 'High risk',
    riskLabel: 'High Risk',
    markerColor: '#EF4444',         // Single Unified Red
    roadHighlightColor: '#EF4444',  // Single Unified Red
    roadColor: '#EF4444',
    color: '#EF4444',
    casingColor: '#991B1B',
    textColor: '#B91C1C',           // Single Unified Red text
    predictionColor: '#EF4444',
    badgeBg: '#FEF2F2',
    badgeBorder: '#EF4444',
    haloColor: 'rgba(239, 68, 68, 0.28)',
    summary: 'High complaint concentration (3+ issues) or severe disruption',
    predictionText: 'High concentration — severe roadway obstruction requiring immediate municipal intervention.',
    riskAssessment: 'High concentration: critical cluster presenting acute roadway hazard.',
  };
}


// Status visual configurations
export const STATUS_CONFIG = {
  open: {
    label: 'Open',
    color: '#EF4444',
    bgColor: '#FEF2F2',
    borderColor: '#F87171',
    radius: 7.5,
    opacity: 1.0,
    strokeWidth: 2.0,
  },
  in_progress: {
    label: 'In Progress',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FCD34D',
    radius: 8.5,
    opacity: 1.0,
    strokeWidth: 2.5,
  },
  resolved: {
    label: 'Resolved',
    color: '#059669',
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    radius: 6.5,
    opacity: 0.65,
    strokeWidth: 1.5,
  },
};

// Category configurations: labels and visual accents
export const CATEGORY_CONFIG = {
  road_damage: {
    label: 'Road Damage',
    accentColor: '#DC2626',
    icon: '⚠️',
  },
  waste_disposal: {
    label: 'Waste Disposal',
    accentColor: '#059669',
    icon: '🗑️',
  },
  water_leakage: {
    label: 'Water Leakage',
    accentColor: '#2563EB',
    icon: '💧',
  },
  street_light: {
    label: 'Street Light',
    accentColor: '#D97706',
    icon: '💡',
  },
  other: {
    label: 'Other',
    accentColor: '#475569',
    icon: '📌',
  },
  // Aliases for backward compatibility
  pothole: {
    label: 'Road Damage',
    accentColor: '#DC2626',
    icon: '⚠️',
  },
  garbage: {
    label: 'Waste Disposal',
    accentColor: '#059669',
    icon: '🗑️',
  },
  water_leak: {
    label: 'Water Leakage',
    accentColor: '#2563EB',
    icon: '💧',
  },
};

// Normalizes category strings
export function normalizeCategory(cat) {
  if (!cat) return 'other';
  const c = String(cat).toLowerCase().trim();
  if (c === 'pothole' || c === 'road_damage' || c === 'road damage') return 'road_damage';
  if (c === 'garbage' || c === 'waste_disposal' || c === 'waste disposal') return 'waste_disposal';
  if (c === 'water_leak' || c === 'water_leakage' || c === 'water leakage') return 'water_leakage';
  if (c === 'street_light' || c === 'street light') return 'street_light';
  return 'other';
}

// Map layer & source IDs for Street-Level Highlighting
export const SOURCE_ROADS = 'civic-complaints-roads';
export const SOURCE_FALLBACK = 'civic-complaints-fallback';
export const SOURCE_MARKERS = 'civic-complaints-markers';
export const SOURCE_TEMP_PICK_ROAD = 'civic-temp-pick-road';

export const LAYER_3D_BUILDINGS = 'civic-3d-buildings';
export const LAYER_COMPLAINT_HEATMAP = 'civic-complaint-density-heat';
export const LAYER_COMPLAINT_HEATMAP_GLOW = 'civic-complaint-density-glow';
export const LAYER_ROADS_GLOW = 'civic-complaints-roads-glow';
export const LAYER_ROADS_CASING = 'civic-complaints-roads-casing';
export const LAYER_ROADS_HIGHLIGHT = 'civic-complaints-roads-highlight';
export const LAYER_ROADS_CORE = 'civic-complaints-roads-core';
export const LAYER_ROADS_HITBOX = 'civic-complaints-roads-hitbox';
export const LAYER_ROAD_MARKERS = 'civic-complaints-road-markers';
export const LAYER_ROAD_MARKERS_HALO = 'civic-complaints-road-markers-halo';
export const LAYER_ROAD_MARKERS_PULSE = 'civic-complaints-road-markers-pulse';

export const LAYER_FALLBACK_HALO = 'civic-complaints-fallback-halo';
export const LAYER_FALLBACK_POINTS = 'civic-complaints-fallback-points';

export const LAYER_TEMP_PICK_CASING = 'civic-temp-pick-casing';
export const LAYER_TEMP_PICK_LINE = 'civic-temp-pick-line';

// Legacy compatibility IDs
export const SOURCE_ID = SOURCE_ROADS;
export const LAYER_POINTS = LAYER_ROADS_HIGHLIGHT;
export const LAYER_POINTS_HITBOX = LAYER_ROADS_HITBOX;
export const LAYER_STATUS_RING = LAYER_ROADS_CASING;
