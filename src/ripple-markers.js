import maplibregl from 'maplibre-gl';
import {
  getRiskStyle,
  isActiveWork,
  ACTIVE_WORK_CONFIG,
  DENSITY_SEVERITY_COLORS,
} from './style-config.js';

/**
 * Derives CSS color tokens for standard complaint markers
 * adhering to the unified traffic GIS palette.
 *
 * @param {Object} properties
 * @returns {Object} CSS variable key-value pairs
 */
export function getRippleColorTokens(properties = {}) {
  let percentage = null;
  if (typeof properties.damagePercentage === 'number' && !isNaN(properties.damagePercentage)) {
    percentage = properties.damagePercentage;
  } else if (properties.damagePercentage !== undefined && properties.damagePercentage !== null) {
    const parsed = parseInt(properties.damagePercentage, 10);
    if (!isNaN(parsed)) {
      percentage = parsed;
    }
  } else if (typeof properties.damageRiskScore === 'number' && !isNaN(properties.damageRiskScore)) {
    percentage = properties.damageRiskScore;
  }

  let riskTier = properties.damageRiskTier || '';
  let markerColor = (properties.markerColor || '').toUpperCase();

  if (percentage !== null) {
    const riskStyle = getRiskStyle(percentage);
    riskTier = riskStyle.tier;
    markerColor = riskStyle.markerColor.toUpperCase();
  }

  // 1. High Risk / Red
  if (
    riskTier === 'high' ||
    markerColor === '#EF4444' ||
    markerColor === '#D71920'
  ) {
    return {
      coreColor: '#EF4444',
      fillInner: 'rgba(239, 68, 68, 0.28)',
      fillOuter: 'rgba(239, 68, 68, 0.08)',
      border: 'rgba(239, 68, 68, 0.45)',
      glow: 'rgba(239, 68, 68, 0.35)',
    };
  }

  // 2. Medium Risk / Yellow / Amber
  if (
    riskTier === 'medium' ||
    markerColor === '#EAB308' ||
    markerColor === '#F59E0B'
  ) {
    return {
      coreColor: '#EAB308',
      fillInner: 'rgba(234, 179, 8, 0.28)',
      fillOuter: 'rgba(234, 179, 8, 0.08)',
      border: 'rgba(234, 179, 8, 0.45)',
      glow: 'rgba(234, 179, 8, 0.35)',
    };
  }

  // 3. Minimal Risk / Green
  if (
    riskTier === 'minimal' ||
    markerColor === '#22C55E' ||
    markerColor === '#16A34A'
  ) {
    return {
      coreColor: '#22C55E',
      fillInner: 'rgba(34, 197, 94, 0.28)',
      fillOuter: 'rgba(34, 197, 94, 0.08)',
      border: 'rgba(34, 197, 94, 0.45)',
      glow: 'rgba(34, 197, 94, 0.35)',
    };
  }

  // 4. Status Fallback
  const status = properties.status || '';
  if (status === 'resolved') {
    return {
      coreColor: '#22C55E',
      fillInner: 'rgba(34, 197, 94, 0.28)',
      fillOuter: 'rgba(34, 197, 94, 0.08)',
      border: 'rgba(34, 197, 94, 0.45)',
      glow: 'rgba(34, 197, 94, 0.35)',
    };
  }
  if (status === 'in_progress') {
    return {
      coreColor: '#FBBF24',
      fillInner: 'rgba(251, 191, 36, 0.30)',
      fillOuter: 'rgba(251, 191, 36, 0.10)',
      border: 'rgba(251, 191, 36, 0.50)',
      glow: 'rgba(251, 191, 36, 0.40)',
    };
  }

  // Default Red
  return {
    coreColor: '#EF4444',
    fillInner: 'rgba(239, 68, 68, 0.28)',
    fillOuter: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.45)',
    glow: 'rgba(239, 68, 68, 0.35)',
  };
}

/**
 * Creates the DOM element for either:
 * 1. An Active-Work Yellow Triangle Marker (▲) if the complaint is undergoing work (status: in_progress)
 * 2. A clean, compact circular GIS pin marker for other complaints (open, resolved)
 *
 * @param {Object} feature - GeoJSON feature
 * @param {Object} [handlers={}] - Click and hover handlers
 * @returns {HTMLElement} Marker container DOM element
 */
export function createRippleMarkerElement(feature, handlers = {}) {
  const props = feature.properties || {};
  const id = props.id || `${feature.geometry.coordinates[0]}_${feature.geometry.coordinates[1]}`;
  const isWorkUnderway = isActiveWork(props.status);

  // =========================================================================
  // CASE 1: ACTIVE-WORK MARKER (▲ Tiny clearly visible yellow triangular marker)
  // Strictly mapped ONLY to complaints undergoing active municipal work
  // =========================================================================
  if (isWorkUnderway) {
    const container = document.createElement('div');
    container.className = 'civicproof-active-work-marker';
    container.dataset.complaintId = id;
    container.setAttribute('role', 'button');
    container.setAttribute('tabindex', '0');
    container.setAttribute(
      'aria-label',
      `Work in progress: ${props.roadName || 'Complaint'} (${props.category || 'Civic Issue'})`
    );
    container.title = `▲ Work in progress: ${props.roadName || 'Complaint'} (Status: In Progress)`;

    // Soft pulsating ambient halo behind triangle
    const pulse = document.createElement('div');
    pulse.className = 'active-work-pulse';
    container.appendChild(pulse);

    // SVG equilateral yellow triangle with high-contrast dark casing
    const triangleWrap = document.createElement('div');
    triangleWrap.className = 'active-work-triangle-wrap';
    triangleWrap.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" class="active-work-triangle-svg" aria-hidden="true">
        <polygon points="12,2 22,20 2,20" fill="#FBBF24" stroke="#0F172A" stroke-width="2.2" stroke-linejoin="round" />
        <line x1="12" y1="8" x2="12" y2="13" stroke="#0F172A" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="12" cy="16.5" r="1.1" fill="#0F172A" />
      </svg>
    `;
    container.appendChild(triangleWrap);

    // Interactive events with ID delegation to access latest synchronized properties
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof handlers.onClick === 'function') {
        handlers.onClick(id, props, feature.geometry.coordinates);
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof handlers.onClick === 'function') {
          handlers.onClick(id, props, feature.geometry.coordinates);
        }
      }
    });

    container.addEventListener('mouseenter', (e) => {
      if (typeof handlers.onHover === 'function') {
        handlers.onHover(id, props, feature.geometry.coordinates, e);
      }
    });

    container.addEventListener('mouseleave', () => {
      if (typeof handlers.onLeave === 'function') {
        handlers.onLeave();
      }
    });

    return container;
  }

  // =========================================================================
  // CASE 2: REGULAR COMPLAINT PIN (Open / Resolved)
  // Clean, compact, professional GIS dot marker that doesn't clutter road shapes
  // =========================================================================
  const tokens = getRippleColorTokens(props);

  const container = document.createElement('div');
  container.className = 'civicproof-ripple-marker';
  container.dataset.complaintId = id;

  // Apply dynamic color tokens
  container.style.setProperty('--marker-core-color', tokens.coreColor);
  container.style.setProperty('--ripple-fill-inner', tokens.fillInner);
  container.style.setProperty('--ripple-fill-outer', tokens.fillOuter);
  container.style.setProperty('--ripple-border', tokens.border);
  container.style.setProperty('--ripple-glow', tokens.glow);

  // Subtle ambient pulse wave
  const wave = document.createElement('div');
  wave.className = 'ripple-wave wave-1';
  container.appendChild(wave);

  // Center solid marker dot
  const core = document.createElement('div');
  core.className = 'ripple-core';
  core.setAttribute('role', 'button');
  core.setAttribute('tabindex', '0');
  core.setAttribute(
    'aria-label',
    `Complaint ${props.id || ''}: ${props.roadName || 'Civic Issue'}`
  );
  if (props.isFallback) {
    container.classList.add('is-fallback');
    core.title = `[Point Density / Unmatched to Road] ${props.roadName || 'Off-Road Location'} (${props.status || 'Active'})`;
  } else {
    core.title = `${props.roadName || 'Complaint'} (${props.status || 'Active'})`;
  }

  // Attach interactive events
  core.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof handlers.onClick === 'function') {
      handlers.onClick(id, props, feature.geometry.coordinates);
    }
  });

  core.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof handlers.onClick === 'function') {
        handlers.onClick(id, props, feature.geometry.coordinates);
      }
    }
  });

  core.addEventListener('mouseenter', (e) => {
    if (typeof handlers.onHover === 'function') {
      handlers.onHover(id, props, feature.geometry.coordinates, e);
    }
  });

  core.addEventListener('mouseleave', () => {
    if (typeof handlers.onLeave === 'function') {
      handlers.onLeave();
    }
  });

  container.appendChild(core);
  return container;
}

/**
 * Initializes and manages complaint markers on the map, including active-work
 * yellow triangles and regular complaint dots. Synchronizes seamlessly with
 * MapLibre GL pan, zoom, pitch, and data updates.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Object} [options={}]
 * @param {Function} [options.onMarkerClick]
 * @param {Function} [options.onMarkerHover]
 * @param {Function} [options.onMarkerLeave]
 * @returns {Object} { sync, clear, destroy }
 */
export function initRippleMarkers(map, options = {}) {
  // Map of active markers: Map<string, { marker: maplibregl.Marker, element: HTMLElement, coordinates: number[], props: Object, isActiveWork: boolean }>
  const activeMarkers = new Map();

  const handlers = {
    onClick: (id, fallbackProps, fallbackCoords) => {
      if (typeof options.onMarkerClick === 'function') {
        const item = activeMarkers.get(id);
        const currentProps = item ? item.props : fallbackProps;
        const currentCoords = item ? item.coordinates : fallbackCoords;
        options.onMarkerClick(currentProps, currentCoords);
      }
    },
    onHover: (id, fallbackProps, fallbackCoords, event) => {
      if (typeof options.onMarkerHover === 'function') {
        const item = activeMarkers.get(id);
        const currentProps = item ? item.props : fallbackProps;
        const currentCoords = item ? item.coordinates : fallbackCoords;
        options.onMarkerHover(currentProps, currentCoords, event);
      }
    },
    onLeave: () => {
      if (typeof options.onMarkerLeave === 'function') {
        options.onMarkerLeave();
      }
    },
  };

  /**
   * Synchronizes markers with latest collections
   * @param {Object} collections - { markerCollection, fallbackCollection }
   */
  const sync = (collections = {}) => {
    if (!map) return;

    const markerFeatures = collections.markerCollection?.features || [];
    const fallbackFeatures = collections.fallbackCollection?.features || [];
    const allFeatures = [...markerFeatures, ...fallbackFeatures];

    const currentIds = new Set();

    for (const feat of allFeatures) {
      if (!feat || !feat.geometry || !feat.geometry.coordinates) continue;
      const props = feat.properties || {};
      const id = props.id || `${feat.geometry.coordinates[0]}_${feat.geometry.coordinates[1]}`;
      currentIds.add(id);

      const coords = feat.geometry.coordinates;
      const isNowActive = isActiveWork(props.status);

      if (activeMarkers.has(id)) {
        const item = activeMarkers.get(id);
        const wasActive = Boolean(item.isActiveWork);

        // If complaint transitioned to or from active work, rebuild the marker element
        if (wasActive !== isNowActive) {
          item.marker.remove();
          const el = createRippleMarkerElement(feat, handlers);
          const marker = new maplibregl.Marker({
            element: el,
            anchor: 'center',
          })
            .setLngLat(coords)
            .addTo(map);

          activeMarkers.set(id, {
            marker,
            element: el,
            coordinates: coords,
            props,
            isActiveWork: isNowActive,
          });
          continue;
        }

        // Update position if moved
        item.props = props;
        const [prevLng, prevLat] = item.coordinates;
        if (prevLng !== coords[0] || prevLat !== coords[1]) {
          item.marker.setLngLat(coords);
          item.coordinates = coords;
        }

        // Update color tokens if regular marker
        if (!isNowActive) {
          const tokens = getRippleColorTokens(props);
          item.element.style.setProperty('--marker-core-color', tokens.coreColor);
          item.element.style.setProperty('--ripple-fill-inner', tokens.fillInner);
          item.element.style.setProperty('--ripple-fill-outer', tokens.fillOuter);
          item.element.style.setProperty('--ripple-border', tokens.border);
          item.element.style.setProperty('--ripple-glow', tokens.glow);

          const coreEl = item.element.querySelector('.ripple-core');
          if (coreEl) {
            coreEl.title = `${props.roadName || 'Complaint'} (${props.status || 'Active'})`;
          }
        }
      } else {
        // Create new HTML marker
        const el = createRippleMarkerElement(feat, handlers);
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat(coords)
          .addTo(map);

        activeMarkers.set(id, {
          marker,
          element: el,
          coordinates: coords,
          props,
          isActiveWork: isNowActive,
        });
      }
    }

    // Remove markers that are no longer in the dataset
    for (const [id, item] of activeMarkers.entries()) {
      if (!currentIds.has(id)) {
        item.marker.remove();
        activeMarkers.delete(id);
      }
    }
  };

  const clear = () => {
    for (const item of activeMarkers.values()) {
      item.marker.remove();
    }
    activeMarkers.clear();
  };

  const destroy = () => {
    clear();
  };

  return {
    sync,
    clear,
    destroy,
    getActiveCount: () => activeMarkers.size,
  };
}
