import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';
import {
  OPENFREEMAP_STYLE_URL,
  CHENNAI_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  MIN_ZOOM,
  MAX_ZOOM,
  MAX_PITCH,
  LAYER_3D_BUILDINGS,
} from './style-config.js';

/**
 * Initializes a MapLibre GL map instance inside a given parent container.
 * Aligns layout, controls, and attribution with the NAMMA OORU citizen UI.
 *
 * @param {HTMLElement | string} container - Target DOM element or selector
 * @param {Object} [options={}] - Optional map configuration
 * @param {string} [options.style] - Map style JSON URL (defaults to OpenFreeMap Liberty)
 * @param {number[]} [options.center] - Initial [lng, lat] (defaults to Chennai [80.2707, 13.0827])
 * @param {number} [options.zoom] - Initial zoom level (defaults to 14.5)
 * @param {number} [options.pitch] - Initial tilt in degrees (defaults to 58)
 * @param {number} [options.bearing] - Initial rotation in degrees (defaults to -20)
 * @param {string} [options.navControlPosition='bottom-right'] - Position of zoom controls
 * @param {boolean} [options.showCompass=true] - Whether to show compass icon in nav controls
 * @returns {Object} { map, resize, destroy, isDestroyed }
 */
export function initMap(container, options = {}) {
  const targetElement = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!targetElement || !(targetElement instanceof HTMLElement)) {
    throw new Error('[NAMMA OORU Map] Invalid container. An existing HTMLElement or valid selector is required.');
  }

  // Ensure target container has non-static positioning for MapLibre canvas layout
  const computedStyle = window.getComputedStyle(targetElement);
  if (computedStyle.position === 'static') {
    targetElement.style.position = 'relative';
  }

  // Apply NAMMA OORU theme class
  targetElement.classList.add('civicproof-map-container');

  let destroyed = false;

  const map = new maplibregl.Map({
    container: targetElement,
    style: options.style || OPENFREEMAP_STYLE_URL,
    center: options.center || CHENNAI_CENTER,
    zoom: typeof options.zoom === 'number' ? options.zoom : DEFAULT_ZOOM,
    minZoom: options.minZoom ?? MIN_ZOOM,
    maxZoom: options.maxZoom ?? MAX_ZOOM,
    pitch: typeof options.pitch === 'number' ? options.pitch : DEFAULT_PITCH,
    bearing: typeof options.bearing === 'number' ? options.bearing : DEFAULT_BEARING,
    maxPitch: options.maxPitch ?? MAX_PITCH,
    pitchWithRotate: true,
    dragRotate: true,
    touchPitch: true,
    attributionControl: false, // Replaced below with explicit visible control
  });

  // Apply pale white & light-grey GIS aesthetic and 3D buildings on style load
  map.on('style.load', () => {
    applyPaleGISAesthetic(map);
    add3DBuildingsLayer(map);
  });
  map.on('load', () => {
    applyPaleGISAesthetic(map);
    add3DBuildingsLayer(map);
  });

  // Navigation controls (Zoom In, Zoom Out, Compass with tilt visualizer) positioned at bottom-right
  const navControlPosition = options.navControlPosition || 'bottom-right';
  const navControl = new maplibregl.NavigationControl({
    showCompass: options.showCompass ?? true,
    showZoom: true,
    visualizePitch: true,
  });
  map.addControl(navControl, navControlPosition);

  // Attribution control placed at bottom-left to prevent overlap with zoom controls
  const attributionControl = new maplibregl.AttributionControl({
    compact: false,
    customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> | <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  });
  map.addControl(attributionControl, 'bottom-left');

  // Responsive container observer without relying on MapLibre internal properties
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!destroyed) {
        map.resize();
      }
    });
    resizeObserver.observe(targetElement);
  }

  const handleWindowResize = () => {
    if (!destroyed) {
      map.resize();
    }
  };
  window.addEventListener('resize', handleWindowResize);

  const resize = () => {
    if (destroyed) return;
    map.resize();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    window.removeEventListener('resize', handleWindowResize);
    targetElement.classList.remove('civicproof-map-container');
    map.remove();
  };

  const isDestroyed = () => destroyed;

  return {
    map,
    resize,
    destroy,
    isDestroyed,
  };
}

/**
 * Customizes base vector style layers to achieve the clean, pale white and light-grey
 * professional GIS aesthetic matching the user's reference traffic dashboard.
 *
 * @param {import('maplibre-gl').Map} map
 */
export function applyPaleGISAesthetic(map) {
  if (!map || typeof map.getStyle !== 'function' || !map.isStyleLoaded()) return;

  // 1. Pale white / light-grey background (#f8fafc)
  if (map.getLayer('background')) {
    try {
      map.setPaintProperty('background', 'background-color', '#f8fafc');
    } catch {}
  }

  // 2. Soft pale water tone
  const waterFillLayers = ['water', 'water_shadow', 'waterway', 'water-fill'];
  waterFillLayers.forEach((id) => {
    if (map.getLayer(id)) {
      try {
        map.setPaintProperty(id, 'fill-color', '#e2e8f0');
        map.setPaintProperty(id, 'fill-opacity', 0.85);
      } catch {}
    }
  });

  // 3. 2D base building footprints: clean architectural tone that gracefully hands off to 3D extrusions
  const buildingLayers = ['building', 'building-top', 'building-extrusion', 'building_casing'];
  buildingLayers.forEach((id) => {
    if (map.getLayer(id) && id !== LAYER_3D_BUILDINGS) {
      try {
        map.setPaintProperty(id, 'fill-color', '#E2E8F0');
        map.setPaintProperty(id, 'fill-outline-color', '#CBD5E1');
        map.setPaintProperty(id, 'fill-opacity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          12.0, 0.85,
          13.8, 0,
        ]);
      } catch {}
    }
  });

  // 4. Subtle, fine base road outlines
  const style = map.getStyle();
  if (style && Array.isArray(style.layers)) {
    style.layers.forEach((l) => {
      const lid = (l.id || '').toLowerCase();
      if (
        l.type === 'line' &&
        (lid.includes('minor') || lid.includes('path') || lid.includes('service') || lid.includes('residential'))
      ) {
        try {
          map.setPaintProperty(l.id, 'line-color', '#e2e8f0');
          map.setPaintProperty(l.id, 'line-opacity', 0.7);
        } catch {}
      }
    });
  }
}

/**
 * Adds 3D building extrusions layer with realistic heights, directional shading,
 * and clean architectural light-grey palette matching the user's reference image.
 *
 * @param {import('maplibre-gl').Map} map
 */
export function add3DBuildingsLayer(map) {
  if (!map || typeof map.getStyle !== 'function' || !map.isStyleLoaded()) return;
  if (map.getLayer(LAYER_3D_BUILDINGS)) return;

  // 1. Directional 3D lighting for crisp architectural face shading
  try {
    map.setLight({
      anchor: 'viewport',
      color: '#FFFFFF',
      intensity: 0.44,
      position: [1.15, 215, 30], // Directional sunlight from upper-left
    });
  } catch (err) {
    console.warn('[NAMMA OORU] Unable to set map light:', err);
  }

  // 2. Identify first symbol layer so 3D buildings are placed below street names and POI labels
  const styleLayers = map.getStyle()?.layers || [];
  let labelLayerId = null;
  for (const l of styleLayers) {
    if (l.type === 'symbol') {
      labelLayerId = l.id;
      break;
    }
  }

  // 3. Add 3D fill-extrusion layer
  try {
    map.addLayer(
      {
        id: LAYER_3D_BUILDINGS,
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 12.5,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, '#E6ECEF',
            15, '#DFE5EA',
            17, '#D5DDE4',
          ],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12.5, 0,
            14, [
              'case',
              ['>', ['coalesce', ['get', 'render_height'], 0], 0],
              ['get', 'render_height'],
              ['>', ['coalesce', ['get', 'height'], 0], 0],
              ['get', 'height'],
              ['>', ['coalesce', ['get', 'levels'], 0], 0],
              ['*', ['get', 'levels'], 3.6],
              12, // Realistic default 3D block height for Chennai city structures
            ],
          ],
          'fill-extrusion-base': [
            'case',
            ['>', ['coalesce', ['get', 'render_min_height'], 0], 0],
            ['get', 'render_min_height'],
            ['>', ['coalesce', ['get', 'min_height'], 0], 0],
            ['get', 'min_height'],
            0,
          ],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId || undefined
    );
  } catch (err) {
    console.warn('[NAMMA OORU] Unable to add 3D buildings layer:', err);
  }
}

