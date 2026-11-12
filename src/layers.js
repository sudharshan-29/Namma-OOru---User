import {
  SOURCE_ROADS,
  SOURCE_FALLBACK,
  SOURCE_MARKERS,
  SOURCE_TEMP_PICK_ROAD,
  LAYER_COMPLAINT_HEATMAP,
  LAYER_ROADS_GLOW,
  LAYER_ROADS_CASING,
  LAYER_ROADS_HIGHLIGHT,
  LAYER_ROADS_HITBOX,
  LAYER_ROAD_MARKERS,
  LAYER_ROAD_MARKERS_HALO,
  LAYER_ROAD_MARKERS_PULSE,
  LAYER_FALLBACK_HALO,
  LAYER_FALLBACK_POINTS,
  LAYER_TEMP_PICK_CASING,
  LAYER_TEMP_PICK_LINE,
  STATUS_COLORS,
} from './style-config.js';

/**
 * Empty GeoJSON FeatureCollection template
 */
const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Attaches the GeoJSON road line and marker sources and MapLibre layers to the map.
 * Defensively manages sources and layers to avoid duplicates.
 *
 * Professional Map Overlay Visual Rules:
 * 1. Road Geometry Overlays:
 *    - Clean, crisp, saturated highlight ribbon (LAYER_ROADS_HIGHLIGHT) hugging real street lines.
 *    - Flat perpendicular ends ('line-cap': 'butt') matching reference photo.
 *    - Soft translucent ambient outer glow underneath (LAYER_ROADS_GLOW).
 *
 * 2. Complaint Density & Heatmap:
 *    - Smooth color transitions and subtle translucent glows around dense complaint clusters (LAYER_COMPLAINT_HEATMAP).
 *
 * 3. Markers:
 *    - Active work (status: in_progress): ▲ Yellow Triangle Marker at coordinates.
 *    - Other complaints: Compact, professional GIS pins.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Object} collections - { roadCollection, fallbackCollection, markerCollection }
 */
export function addComplaintLayers(map, { roadCollection, fallbackCollection, markerCollection }) {
  const roadsData = roadCollection || EMPTY_FEATURE_COLLECTION;
  const fallbackData = fallbackCollection || EMPTY_FEATURE_COLLECTION;
  const markersData = markerCollection || EMPTY_FEATURE_COLLECTION;

  // 1. Manage GeoJSON Road Line Source
  const existingRoadSource = map.getSource(SOURCE_ROADS);
  if (existingRoadSource) {
    existingRoadSource.setData(roadsData);
  } else {
    map.addSource(SOURCE_ROADS, {
      type: 'geojson',
      data: roadsData,
    });
  }

  // 2. Manage GeoJSON Fallback Points Source
  const existingFallbackSource = map.getSource(SOURCE_FALLBACK);
  if (existingFallbackSource) {
    existingFallbackSource.setData(fallbackData);
  } else {
    map.addSource(SOURCE_FALLBACK, {
      type: 'geojson',
      data: fallbackData,
    });
  }

  // 3. Manage GeoJSON Road Complaint Markers Source
  const existingMarkerSource = map.getSource(SOURCE_MARKERS);
  if (existingMarkerSource) {
    existingMarkerSource.setData(markersData);
  } else {
    map.addSource(SOURCE_MARKERS, {
      type: 'geojson',
      data: markersData,
    });
  }

  // 4. Manage Temporary Location Pick Road Source
  const existingPickSource = map.getSource(SOURCE_TEMP_PICK_ROAD);
  if (!existingPickSource) {
    map.addSource(SOURCE_TEMP_PICK_ROAD, {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });
  }

  // Clean up legacy casing layers
  if (map.getLayer('civic-complaints-roads-core')) {
    map.removeLayer('civic-complaints-roads-core');
  }
  if (map.getLayer(LAYER_ROADS_CASING)) {
    map.removeLayer(LAYER_ROADS_CASING);
  }

  // 3.1 Density / Heatmap Concentration Glow Layer (Underneath roads)
  // Renders smooth color transitions and subtle translucent glows around areas with many complaints
  if (map.getLayer(LAYER_COMPLAINT_HEATMAP)) {
    map.removeLayer(LAYER_COMPLAINT_HEATMAP);
  }
  map.addLayer({
    id: LAYER_COMPLAINT_HEATMAP,
    type: 'heatmap',
    source: SOURCE_MARKERS,
    maxzoom: 16,
    paint: {
      'heatmap-weight': [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'densityCount'], 1],
        1, 0.35,
        2, 0.65,
        3, 1.0,
      ],
      'heatmap-intensity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        9, 0.45,
        11, 0.70,
        14, 1.0,
      ],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(34, 197, 94, 0)',
        0.2, 'rgba(34, 197, 94, 0.10)',
        0.45, 'rgba(234, 179, 8, 0.20)',
        0.75, 'rgba(249, 115, 22, 0.32)',
        1.0, 'rgba(239, 68, 68, 0.44)',
      ],
      'heatmap-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        9, 18,
        11, 28,
        13, 40,
        15, 54,
      ],
      'heatmap-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        11, 0.60,
        14, 0.35,
        16, 0.10,
      ],
    },
  });

  // 3.2 Road Ambient Glow Layer (Underneath ribbon: subtle risk glow matching reference photo)
  if (map.getLayer(LAYER_ROADS_GLOW)) {
    map.removeLayer(LAYER_ROADS_GLOW);
  }
  map.addLayer({
    id: LAYER_ROADS_GLOW,
    type: 'line',
    source: SOURCE_ROADS,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-width': [
        'interpolate',
        ['exponential', 1.2],
        ['zoom'],
        9, 7.0,
        10, 9.5,
        11, 12.5,
        12, 16.0,
        13, 20.0,
        14, 24.0,
        15, 29.0,
        16, 35.0,
        17, 42.0,
        18, 48.0,
      ],
      'line-color': [
        'case',
        ['has', 'roadColor'], ['get', 'roadColor'],
        ['has', 'riskColor'], ['get', 'riskColor'],
        ['match',
          ['get', 'damageRiskTier'],
          'high', '#EF4444',
          'medium', '#EAB308',
          'minimal', '#22C55E',
          '#22C55E',
        ],
      ],
      'line-opacity': [
        'case',
        ['==', ['get', 'damageRiskTier'], 'high'], 0.35,
        ['==', ['get', 'damageRiskTier'], 'medium'], 0.28,
        0.20,
      ],
      'line-blur': 4.0,
    },
  });

  // 4. Road Highlight Line Layer (Clean, crisp, colored ribbon following actual street geometry)
  if (map.getLayer(LAYER_ROADS_HIGHLIGHT)) {
    map.removeLayer(LAYER_ROADS_HIGHLIGHT);
  }
  map.addLayer({
    id: LAYER_ROADS_HIGHLIGHT,
    type: 'line',
    source: SOURCE_ROADS,
    layout: {
      'line-cap': 'round',  // Smooth round ends and junctions matching Style Reference
      'line-join': 'round',
    },
    paint: {
      'line-width': [
        'interpolate',
        ['exponential', 1.2],
        ['zoom'],
        9, 3.5,
        10, 4.5,
        11, 5.8,
        12, 7.2,
        13, 8.8,
        14, 10.5,
        15, 12.0,
        16, 14.5,
        17, 17.5,
        18, 20.5,
      ],
      'line-color': [
        'case',
        ['has', 'roadColor'], ['get', 'roadColor'],
        ['has', 'riskColor'], ['get', 'riskColor'],
        ['match',
          ['get', 'damageRiskTier'],
          'high', '#EF4444',    // Unified Traffic Red
          'medium', '#EAB308',  // Unified Traffic Yellow
          'minimal', '#22C55E', // Unified Traffic Green
          '#22C55E',
        ],
      ],
      'line-opacity': 0.92,
      'line-blur': 0.2,
    },
  });

  // 5. Road Complaint Markers Outer Beacon Halo (Replaced by live radar-style wave animation)
  if (map.getLayer(LAYER_ROAD_MARKERS_HALO)) {
    map.removeLayer(LAYER_ROAD_MARKERS_HALO);
  }
  map.addLayer({
    id: LAYER_ROAD_MARKERS_HALO,
    type: 'circle',
    source: SOURCE_MARKERS,
    paint: {
      'circle-radius': 1,
      'circle-opacity': 0,
    },
  });

  // 6. Road Complaint Markers Inner Pulse Ring (Zeroed to avoid stepped bullseye)
  if (map.getLayer(LAYER_ROAD_MARKERS_PULSE)) {
    map.removeLayer(LAYER_ROAD_MARKERS_PULSE);
  }
  map.addLayer({
    id: LAYER_ROAD_MARKERS_PULSE,
    type: 'circle',
    source: SOURCE_MARKERS,
    paint: {
      'circle-radius': 1,
      'circle-opacity': 0,
    },
  });

  // 7. Road Complaint Markers Core Layer (Maintained as hit target; visual rendered via HTML ripple marker)
  if (map.getLayer(LAYER_ROAD_MARKERS)) {
    map.removeLayer(LAYER_ROAD_MARKERS);
  }
  map.addLayer({
    id: LAYER_ROAD_MARKERS,
    type: 'circle',
    source: SOURCE_MARKERS,
    paint: {
      'circle-radius': [
        'interpolate',
        ['exponential', 1.2],
        ['zoom'],
        9, 6.0,
        11, 7.5,
        13, 9.5,
        15, 12.0,
        17, 15.0,
      ],
      'circle-color': [
        'case',
        ['has', 'markerColor'], ['get', 'markerColor'],
        ['match',
          ['get', 'damageRiskTier'],
          'high', '#D71920',
          'medium', '#F59E0B',
          'minimal', '#16A34A',
          '#D71920',
        ],
      ],
      'circle-opacity': 0,
      'circle-stroke-width': 0,
    },
  });

  // 8. Road Hitbox Layer (Enlarged transparent line for easy desktop & mobile clicking)
  if (map.getLayer(LAYER_ROADS_HITBOX)) {
    map.removeLayer(LAYER_ROADS_HITBOX);
  }
  map.addLayer({
    id: LAYER_ROADS_HITBOX,
    type: 'line',
    source: SOURCE_ROADS,
    layout: {
      'line-cap': 'butt',
      'line-join': 'round',
    },
    paint: {
      'line-width': 24,
      'line-color': 'transparent',
      'line-opacity': 0,
    },
  });

  // 11. Fallback Points Halo Layer (Replaced by live radar-style wave animation)
  if (!map.getLayer(LAYER_FALLBACK_HALO)) {
    map.addLayer({
      id: LAYER_FALLBACK_HALO,
      type: 'circle',
      source: SOURCE_FALLBACK,
      paint: {
        'circle-radius': 1,
        'circle-opacity': 0,
      },
    });
  }

  // 12. Fallback Points Layer (Maintained as hit target; visual rendered via HTML ripple marker)
  if (!map.getLayer(LAYER_FALLBACK_POINTS)) {
    map.addLayer({
      id: LAYER_FALLBACK_POINTS,
      type: 'circle',
      source: SOURCE_FALLBACK,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, 5.0,
          11, 6.5,
          13, 8.0,
          15, 10.0,
        ],
        'circle-color': '#64748B',
        'circle-opacity': 0,
        'circle-stroke-width': 0,
      },
    });
  }

  // 10. Temp Location Pick Casing Layer
  if (!map.getLayer(LAYER_TEMP_PICK_CASING)) {
    map.addLayer({
      id: LAYER_TEMP_PICK_CASING,
      type: 'line',
      source: SOURCE_TEMP_PICK_ROAD,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 5.8,
          12, 7.5,
          14, 9.6,
          16, 12.2,
        ],
        'line-color': '#047857',
        'line-opacity': 0.95,
      },
    });
  }

  // 11. Temp Location Pick Road Line Layer
  if (!map.getLayer(LAYER_TEMP_PICK_LINE)) {
    map.addLayer({
      id: LAYER_TEMP_PICK_LINE,
      type: 'line',
      source: SOURCE_TEMP_PICK_ROAD,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 4.2,
          12, 5.5,
          14, 7.2,
          16, 9.5,
        ],
        'line-color': '#10B981',
        'line-opacity': 0.94,
      },
    });
  }
}

/**
 * Updates the GeoJSON road, marker, and fallback sources with fresh data
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Object} collections - { roadCollection, fallbackCollection, markerCollection }
 */
export function updateComplaintSourceData(map, { roadCollection, fallbackCollection, markerCollection }) {
  const roadSource = map.getSource(SOURCE_ROADS);
  if (roadSource && roadCollection) {
    roadSource.setData(roadCollection);
  }

  const fallbackSource = map.getSource(SOURCE_FALLBACK);
  if (fallbackSource && fallbackCollection) {
    fallbackSource.setData(fallbackCollection);
  }

  const markerSource = map.getSource(SOURCE_MARKERS);
  if (markerSource && markerCollection) {
    markerSource.setData(markerCollection);
  }
}

/**
 * Updates the temporary road pick preview layer
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Object | null} roadGeometry - GeoJSON LineString geometry or null
 */
export function updateTempPickRoad(map, roadGeometry) {
  const source = map.getSource(SOURCE_TEMP_PICK_ROAD);
  if (!source) return;

  if (roadGeometry && roadGeometry.type === 'LineString') {
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: roadGeometry,
          properties: {},
        },
      ],
    });
  } else {
    source.setData(EMPTY_FEATURE_COLLECTION);
  }
}

/**
 * Safely removes all complaint layers and sources from the map
 *
 * @param {import('maplibre-gl').Map} map
 */
export function removeComplaintLayers(map) {
  const layerIds = [
    LAYER_TEMP_PICK_LINE,
    LAYER_TEMP_PICK_CASING,
    LAYER_FALLBACK_POINTS,
    LAYER_FALLBACK_HALO,
    LAYER_ROAD_MARKERS,
    LAYER_ROAD_MARKERS_PULSE,
    LAYER_ROAD_MARKERS_HALO,
    LAYER_ROADS_HITBOX,
    LAYER_ROADS_HIGHLIGHT,
    LAYER_ROADS_CASING,
    LAYER_ROADS_GLOW,
    LAYER_COMPLAINT_HEATMAP,
    'civic-complaints-roads-core',
  ];

  for (const lid of layerIds) {
    if (map.getLayer(lid)) {
      map.removeLayer(lid);
    }
  }

  const sourceIds = [
    SOURCE_TEMP_PICK_ROAD,
    SOURCE_MARKERS,
    SOURCE_FALLBACK,
    SOURCE_ROADS,
  ];

  for (const sid of sourceIds) {
    if (map.getSource(sid)) {
      map.removeSource(sid);
    }
  }
}
