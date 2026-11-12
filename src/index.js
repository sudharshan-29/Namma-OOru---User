import maplibregl from 'maplibre-gl';
import { initMap } from './map-init.js';
import {
  CHENNAI_CENTER,
  DEFAULT_ZOOM,
  OPENFREEMAP_STYLE_URL,
  STATUS_COLORS,
  STATUS_CONFIG,
  CATEGORY_CONFIG,
  ACTIVE_WORK_CONFIG,
  DENSITY_SEVERITY_COLORS,
  isActiveWork,
  setDemoDataEnabled,
} from './style-config.js';
import { demoAdapter } from './adapters/demo-adapter.js';
import { firestoreAdapter, createFirestoreAdapter } from './adapters/firestore-adapter.js';
import {
  addComplaintLayers,
  updateComplaintSourceData,
  updateTempPickRoad,
  removeComplaintLayers,
} from './layers.js';
import { setupMapEvents } from './events.js';
import {
  buildRoadHighlightCollections,
  findNearestRoadSegment,
} from './road-resolver.js';
import { initRippleMarkers } from './ripple-markers.js';
import { calculateOverallRoadDamageStats } from './damage-risk-scorer.js';

/**
 * Public factory function to create a NAMMA OORU Complaint Map instance.
 *
 * @param {HTMLElement | string} container - Host DOM element or selector
 * @param {Object} [options={}] - Configuration options
 * @param {Object} [options.adapter] - Data adapter exposing load(), addComplaint(), updateComplaint(), removeComplaint()
 * @param {Object} [options.complaints] - Direct initial GeoJSON FeatureCollection
 * @param {string} [options.style] - Map style URL (defaults to OpenFreeMap Liberty)
 * @param {number[]} [options.center] - Initial [lng, lat] (defaults to Chennai [80.2707, 13.0827])
 * @param {number} [options.zoom] - Initial zoom (defaults to 11)
 * @param {string} [options.navControlPosition='bottom-right'] - Zoom controls placement
 * @param {boolean} [options.showCompass=false] - Whether to show compass button
 * @returns {Object} Public controller API for the map module
 */
export function createComplaintMap(container, options = {}) {
  const { map, resize, destroy, isDestroyed } = initMap(container, options);

  const activeAdapter = options.adapter || firestoreAdapter;
  let currentComplaints = null;
  let eventTeardown = null;
  let rippleMarkers = null;
  let isSettled = false;
  let rejectPending = null;
  let unsubscribeAdapter = null;

  // In-memory cache for resolved road geometries
  const roadCache = new Map();

  // Location picking state
  let locationPickActive = false;
  let locationPickCleanup = null;
  let tempPickMarker = null;

  // Event bus for 'complaint:click', 'location:selected', etc.
  const eventListeners = new Map();

  const emit = (eventName, data) => {
    const handlers = eventListeners.get(eventName);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(data);
        } catch (err) {
          console.error(`[NAMMA OORU Map] Error in '${eventName}' listener:`, err);
        }
      });
    }
  };

  // Continuous real-time animated ripple markers manager
  rippleMarkers = initRippleMarkers(map, {
    onMarkerClick: (properties, coordinates) => {
      if (locationPickActive) return;
      if (eventTeardown?.openComplaintPopup) {
        eventTeardown.openComplaintPopup(properties, coordinates);
      }
      emit('complaint:click', {
        properties,
        coordinates,
      });
    },
    onMarkerHover: (properties, coordinates) => {
      if (locationPickActive) return;
      if (eventTeardown?.showHoverTooltip) {
        eventTeardown.showHoverTooltip(properties, coordinates);
      }
    },
    onMarkerLeave: () => {
      if (eventTeardown?.closeHoverTooltip) {
        eventTeardown.closeHoverTooltip();
      }
    },
  });

  /**
   * Refreshes the map source with the latest complaint data,
   * resolving road highlights and fallback points.
   */
  const syncSource = () => {
    if (!isDestroyed() && map.isStyleLoaded() && currentComplaints) {
      const collections = buildRoadHighlightCollections(map, currentComplaints, roadCache);
      updateComplaintSourceData(map, collections);
      if (rippleMarkers) {
        rippleMarkers.sync(collections);
      }
    }
  };

  // Ready promise resolving when map style is loaded and complaints layers are mounted
  const readyPromise = new Promise((resolve, reject) => {
    rejectPending = reject;

    const setupDataAndLayers = async () => {
      try {
        if (isDestroyed()) return;

        // 1. Resolve initial complaints data
        const initialData = options.complaints || (await activeAdapter.load());
        currentComplaints = validateFeatureCollection(initialData);

        // 2. Pre-populate road cache from existing properties if available
        if (currentComplaints && Array.isArray(currentComplaints.features)) {
          for (const f of currentComplaints.features) {
            if (f && f.properties && f.properties.id && f.properties.roadGeometry) {
              roadCache.set(f.properties.id, {
                roadGeometry: f.properties.roadGeometry,
                roadName: f.properties.roadName || 'Chennai Street',
                snappedCoords: f.geometry.coordinates,
                resolvedZoom: 11,
              });
            }
          }
        }

        // 3. Build highlighted road LineStrings and fallback collections
        const collections = buildRoadHighlightCollections(map, currentComplaints, roadCache);

        // 4. Attach road highlight and fallback layers to map
        addComplaintLayers(map, collections);

        // 4.5. Initialize real-time animated markers on map
        if (rippleMarkers) {
          rippleMarkers.sync(collections);
        }

        // 4.6. Wire real-time adapter subscription to handle live updates without duplicate listeners
        if (typeof activeAdapter.subscribe === 'function') {
          unsubscribeAdapter = activeAdapter.subscribe((updatedFC) => {
            if (updatedFC && Array.isArray(updatedFC.features) && map.isStyleLoaded()) {
              currentComplaints = validateFeatureCollection(updatedFC);
              syncSource();
              emit('complaints:updated', currentComplaints);
            }
          });
        }

        // 5. Attach click and hover events with locationPick check
        eventTeardown = setupMapEvents(map, {
          onComplaintClick: (payload) => {
            emit('complaint:click', payload);
          },
          isLocationPickActive: () => locationPickActive,
        });

        // 6. As new vector tiles stream in on pan/zoom, dynamically resolve and refine road alignments
        map.on('idle', () => {
          if (isDestroyed() || !currentComplaints || !map.isStyleLoaded()) return;
          const currentZoom = map.getZoom();
          let newlyResolved = false;

          for (const f of currentComplaints.features) {
            const cached = roadCache.get(f.properties.id);
            const needsResolution = !f.properties.roadGeometry || !cached;
            const canRefineAtHigherZoom =
              cached &&
              typeof cached.resolvedZoom === 'number' &&
              currentZoom >= 13.5 &&
              currentZoom - cached.resolvedZoom >= 1.5;

            if (needsResolution || canRefineAtHigherZoom) {
              const res = findNearestRoadSegment(map, f.geometry.coordinates);
              if (res && res.roadGeometry) {
                res.resolvedZoom = currentZoom;
                f.properties.roadGeometry = res.roadGeometry;
                f.properties.roadName = res.roadName;
                f.properties.snappedCoords = res.snappedCoords;
                roadCache.set(f.properties.id, res);
                newlyResolved = true;
              }
            }
          }
          if (newlyResolved) {
            syncSource();
          }
        });

        isSettled = true;
        map.off('error', onError);
        resolve();
      } catch (err) {
        if (isSettled) return;
        isSettled = true;
        map.off('error', onError);
        reject(err);
      }
    };

    const onError = (event) => {
      if (isSettled) return;
      // If the style is already loaded, ignore benign runtime tile/symbol errors
      if (map.isStyleLoaded()) {
        console.warn('[NAMMA OORU Map] Runtime map warning:', event?.error || event?.message);
        return;
      }

      const errorObj =
        event && event.error
          ? event.error
          : new Error(event?.message || 'Failed to load map style');

      isSettled = true;
      map.off('error', onError);
      reject(errorObj);
    };

    map.on('error', onError);

    if (map.isStyleLoaded()) {
      setupDataAndLayers();
    } else {
      map.once('load', () => {
        setupDataAndLayers();
      });
    }
  });

  /**
   * Cleans up location picking listeners, temporary line preview, and marker
   */
  const cancelLocationPick = () => {
    if (locationPickCleanup) {
      locationPickCleanup();
      locationPickCleanup = null;
    }
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    updateTempPickRoad(map, null);
    locationPickActive = false;
    map.getCanvas().style.cursor = '';
  };

  /**
   * Displays temporary preview marker and road highlight on map
   */
  const showPreviewLocation = (lng, lat, roadGeometry = null, isRoadSnapped = false) => {
    if (isDestroyed()) return;
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    if (roadGeometry && isRoadSnapped) {
      updateTempPickRoad(map, roadGeometry);
      tempPickMarker = new maplibregl.Marker({ color: '#059669' })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      updateTempPickRoad(map, null);
      tempPickMarker = new maplibregl.Marker({ color: '#D97706' })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  };

  /**
   * Clears temporary preview marker and road highlight
   */
  const clearPreviewLocation = () => {
    if (isDestroyed()) return;
    if (tempPickMarker) {
      tempPickMarker.remove();
      tempPickMarker = null;
    }
    updateTempPickRoad(map, null);
  };

  return {
    /**
     * Get the underlying MapLibre GL map instance
     * @returns {import('maplibre-gl').Map}
     */
    getMap() {
      return map;
    },

    /**
     * Promise that resolves when map and complaint layers have initialized
     * @returns {Promise<void>}
     */
    whenReady() {
      return readyPromise;
    },

    /**
     * Get the current GeoJSON FeatureCollection
     * @returns {Object | null}
     */
    getComplaints() {
      return currentComplaints;
    },

    /**
     * Replaces the currently displayed complaints with a new FeatureCollection.
     * Updates GeoJSON sources directly without recreating the map.
     *
     * @param {Object} featureCollection
     */
    setComplaints(featureCollection) {
      if (isDestroyed()) return;
      const validated = validateFeatureCollection(featureCollection);
      currentComplaints = validated;
      syncSource();
    },

    /**
     * Adds a single complaint to the store and refreshes the map source.
     * Automatically resolves road geometry if not already provided.
     *
     * @param {Object} feature - GeoJSON feature
     * @returns {Object} Added feature
     */
    addComplaint(feature) {
      if (isDestroyed()) return null;
      let added = null;

      // Auto-resolve road geometry if missing
      if (feature && feature.geometry && !feature.properties?.roadGeometry && map.isStyleLoaded()) {
        const resolved = findNearestRoadSegment(map, feature.geometry.coordinates);
        if (resolved) {
          feature.properties = feature.properties || {};
          feature.properties.roadGeometry = resolved.roadGeometry;
          feature.properties.roadName = resolved.roadName;
          if (feature.properties.id) {
            roadCache.set(feature.properties.id, resolved);
          }
        }
      }

      if (typeof activeAdapter.addComplaint === 'function') {
        added = activeAdapter.addComplaint(feature);
        currentComplaints = validateFeatureCollection(activeAdapter.getCollection());
      } else {
        const validated = validateFeatureCollection(currentComplaints);
        validated.features.push(feature);
        currentComplaints = validated;
        added = feature;
      }

      clearPreviewLocation();
      syncSource();
      return added;
    },

    /**
     * Updates an existing complaint by ID and refreshes the map source.
     *
     * @param {string} id - Complaint ID
     * @param {Object} patch - Property patch
     * @returns {Object | null} Updated feature
     */
    updateComplaint(id, patch) {
      if (isDestroyed()) return null;
      let updated = null;
      if (typeof activeAdapter.updateComplaint === 'function') {
        updated = activeAdapter.updateComplaint(id, patch);
        currentComplaints = validateFeatureCollection(activeAdapter.getCollection());
      } else if (currentComplaints && Array.isArray(currentComplaints.features)) {
        const target = currentComplaints.features.find(
          (f) => f.properties && f.properties.id === id
        );
        if (target) {
          target.properties = { ...target.properties, ...patch };
          delete target.properties.id; // protect ID
          target.properties.id = id;
          updated = target;
        }
      }
      syncSource();
      return updated;
    },

    /**
     * Removes a complaint by ID and refreshes the map source.
     *
     * @param {string} id - Complaint ID
     * @returns {boolean} True if removed
     */
    removeComplaint(id) {
      if (isDestroyed()) return false;
      let removed = false;
      roadCache.delete(id);
      if (typeof activeAdapter.removeComplaint === 'function') {
        removed = activeAdapter.removeComplaint(id);
        currentComplaints = validateFeatureCollection(activeAdapter.getCollection());
      } else if (currentComplaints && Array.isArray(currentComplaints.features)) {
        const initialLen = currentComplaints.features.length;
        currentComplaints.features = currentComplaints.features.filter(
          (f) => f.properties && f.properties.id !== id
        );
        removed = currentComplaints.features.length < initialLen;
      }
      syncSource();
      return removed;
    },

    /**
     * Recalculates the visualization when the selected time range or relevant complaint data changes.
     */
    recalculateVisualization() {
      if (isDestroyed()) return;
      syncSource();
    },

    /**
     * Reloads complaint collection from the active adapter
     */
    async refresh() {
      if (isDestroyed()) return;
      roadCache.clear();
      const data = await activeAdapter.load();
      currentComplaints = validateFeatureCollection(data);
      syncSource();
    },

    /**
     * Flies to a specific complaint by ID.
     * If road geometry is resolved, centers on the road segment midpoint.
     *
     * @param {string} id
     */
    flyToComplaint(id) {
      if (isDestroyed() || !currentComplaints) return;
      const feature = currentComplaints.features.find(
        (f) => f.properties && f.properties.id === id
      );
      if (!feature) return;

      let center = feature.geometry.coordinates;
      if (feature.properties?.roadGeometry?.coordinates) {
        const coords = feature.properties.roadGeometry.coordinates;
        const midIdx = Math.floor(coords.length / 2);
        center = coords[midIdx];
      }

      if (center) {
        map.flyTo({
          center,
          zoom: 15.5,
          pitch: 58,
          bearing: -20,
          speed: 1.2,
        });
      }
    },

    /**
     * Flies to specific coordinates with 3D perspective
     * @param {number} lng
     * @param {number} lat
     * @param {number} [zoom=15.5]
     * @param {number} [pitch=58]
     * @param {number} [bearing=-20]
     */
    flyToLocation(lng, lat, zoom = 15.5, pitch = 58, bearing = -20) {
      if (isDestroyed()) return;
      map.flyTo({
        center: [lng, lat],
        zoom,
        pitch,
        bearing,
        speed: 1.2,
      });
    },

    /**
     * Smoothly toggles between 3D isometric view and 2D top-down view.
     * @param {boolean} [enable3D] - Optional explicit state
     * @returns {boolean} Whether 3D is now active
     */
    toggle3D(enable3D = null) {
      if (isDestroyed()) return false;
      const currentPitch = map.getPitch();
      const shouldEnable = enable3D !== null ? enable3D : currentPitch < 20;
      map.easeTo({
        pitch: shouldEnable ? 58 : 0,
        bearing: shouldEnable ? -20 : 0,
        duration: 900,
      });
      return shouldEnable;
    },

    /**
     * Returns whether the map is currently pitched in 3D perspective mode.
     * @returns {boolean}
     */
    is3D() {
      if (isDestroyed()) return false;
      return map.getPitch() > 20;
    },

    /**
     * Activates street-level location pick mode on the map.
     * Automatically queries vector tiles to snap to the nearest road
     * and shows a live green road highlight preview.
     *
     * @param {Object} [pickOptions={}]
     * @param {Function} [pickOptions.onSelect] - Callback({ lng, lat, roadName, roadGeometry, isRoadSnapped })
     * @param {Function} [pickOptions.onCancel] - Callback()
     * @param {boolean} [pickOptions.stayActive=false] - Keep pick mode active after click
     */
    enableLocationPick(pickOptions = {}) {
      if (isDestroyed()) return;
      if (locationPickActive) cancelLocationPick();

      locationPickActive = true;
      map.getCanvas().style.cursor = 'crosshair';

      let isDragging = false;
      const onDragStart = () => {
        isDragging = true;
      };
      map.on('dragstart', onDragStart);

      // Live hover road preview
      const onMouseMove = (e) => {
        if (!locationPickActive || isDragging) return;
        const road = findNearestRoadSegment(map, [e.lngLat.lng, e.lngLat.lat], 28);
        if (road && road.roadGeometry) {
          updateTempPickRoad(map, road.roadGeometry);
        } else {
          updateTempPickRoad(map, null);
        }
      };
      map.on('mousemove', onMouseMove);

      const onMapClick = (e) => {
        if (isDragging) {
          isDragging = false;
          return;
        }

        const rawLng = Number(e.lngLat.lng.toFixed(5));
        const rawLat = Number(e.lngLat.lat.toFixed(5));

        // Query nearest road segment
        const road = findNearestRoadSegment(map, [rawLng, rawLat], 36);

        let finalLng = rawLng;
        let finalLat = rawLat;
        let roadName = null;
        let roadGeometry = null;
        let isRoadSnapped = false;

        if (road && road.roadGeometry) {
          finalLng = road.snappedCoords[0];
          finalLat = road.snappedCoords[1];
          roadName = road.roadName;
          roadGeometry = road.roadGeometry;
          isRoadSnapped = true;

          // Preview the selected road segment in green
          updateTempPickRoad(map, roadGeometry);

          // Place temporary marker on road centerline
          if (tempPickMarker) tempPickMarker.remove();
          tempPickMarker = new maplibregl.Marker({ color: '#059669' })
            .setLngLat([finalLng, finalLat])
            .addTo(map);
        } else {
          // Off-road fallback point
          updateTempPickRoad(map, null);
          if (tempPickMarker) tempPickMarker.remove();
          tempPickMarker = new maplibregl.Marker({ color: '#D97706' })
            .setLngLat([rawLng, rawLat])
            .addTo(map);
        }

        const payload = {
          lng: finalLng,
          lat: finalLat,
          roadName,
          roadGeometry,
          isRoadSnapped,
        };

        emit('location:selected', payload);
        if (typeof pickOptions.onSelect === 'function') {
          pickOptions.onSelect(payload);
        }

        if (!pickOptions.stayActive) {
          // Keep preview until modal closes or submits
          if (locationPickCleanup) {
            map.off('click', onMapClick);
            map.off('dragstart', onDragStart);
            map.off('mousemove', onMouseMove);
            map.getCanvas().style.cursor = '';
            locationPickActive = false;
          }
        }
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          cancelLocationPick();
          if (typeof pickOptions.onCancel === 'function') {
            pickOptions.onCancel();
          }
        }
      };

      map.on('click', onMapClick);
      window.addEventListener('keydown', onKeyDown);

      locationPickCleanup = () => {
        map.off('click', onMapClick);
        map.off('dragstart', onDragStart);
        map.off('mousemove', onMouseMove);
        window.removeEventListener('keydown', onKeyDown);
        map.getCanvas().style.cursor = '';
        locationPickActive = false;
      };
    },

    /**
     * Programmatically cancels location pick mode
     */
    cancelLocationPick() {
      cancelLocationPick();
    },

    /**
     * Returns true if location pick mode is active
     * @returns {boolean}
     */
    isLocationPickActive() {
      return locationPickActive;
    },

    /**
     * Subscribe to map module events ('complaint:click', 'location:selected')
     *
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     */
    on(event, handler) {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      eventListeners.get(event).add(handler);
    },

    /**
     * Unsubscribe from map module events
     *
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     */
    off(event, handler) {
      const handlers = eventListeners.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    },

    /**
     * Closes any currently open complaint popup
     */
    closePopup() {
      if (eventTeardown && typeof eventTeardown.closePopup === 'function') {
        eventTeardown.closePopup();
      }
    },

    /**
     * Manually notify map to recalculate dimensions (e.g. after tab or modal shows)
     */
    resize() {
      if (isDestroyed()) return;
      resize();
    },

    /**
     * Returns raw MapLibre Map instance
     * @returns {import('maplibre-gl').Map}
     */
    getMapInstance() {
      return map;
    },

    /**
     * Displays temporary preview marker and road highlight for detected/selected coordinates
     * before complaint submission.
     *
     * @param {number} lng
     * @param {number} lat
     * @param {Object|null} roadGeometry
     * @param {boolean} isRoadSnapped
     */
    showPreviewLocation(lng, lat, roadGeometry = null, isRoadSnapped = false) {
      showPreviewLocation(lng, lat, roadGeometry, isRoadSnapped);
    },

    /**
     * Clears temporary preview marker and road highlight
     */
    clearPreviewLocation() {
      clearPreviewLocation();
    },

    /**
     * Resolves nearest vector-tile road segment for given [lng, lat]
     * @param {number} lng
     * @param {number} lat
     * @returns {Object|null}
     */
    resolveRoadForCoords(lng, lat) {
      if (isDestroyed() || !map || !map.isStyleLoaded()) return null;
      return findNearestRoadSegment(map, [lng, lat], 36);
    },

    /**
     * Returns overall city-wide aggregate road damage percentage and stats
     * @returns {Object}
     */
    getOverallRoadDamageStats() {
      return calculateOverallRoadDamageStats(currentComplaints);
    },

    /**
     * Loads demo complaint data back onto the map on demand
     */
    async loadDemoData() {
      if (isDestroyed()) return;
      setDemoDataEnabled(true);
      if (activeAdapter && typeof activeAdapter.loadDemoData === 'function') {
        currentComplaints = activeAdapter.loadDemoData();
      } else if (activeAdapter && typeof activeAdapter.seed === 'function') {
        const { demoComplaintsData } = await import('./adapters/demo-adapter.js');
        activeAdapter.seed(demoComplaintsData);
        currentComplaints = activeAdapter.getCollection();
      }
      syncSource();
      emit('complaints:updated', currentComplaints);
      return currentComplaints;
    },

    /**
     * Clears all demo complaint data from the map
     */
    clearDemoData() {
      if (isDestroyed()) return;
      setDemoDataEnabled(false);
      if (activeAdapter && typeof activeAdapter.clearDemoData === 'function') {
        currentComplaints = activeAdapter.clearDemoData();
      } else if (activeAdapter && typeof activeAdapter.seed === 'function') {
        activeAdapter.seed({ type: 'FeatureCollection', features: [] });
        currentComplaints = activeAdapter.getCollection();
      }
      syncSource();
      emit('complaints:updated', currentComplaints);
      return currentComplaints;
    },

    /**
     * Check whether map instance has been destroyed
     * @returns {boolean}
     */
    isDestroyed() {
      return isDestroyed();
    },

    /**
     * Cleanly tear down map instance, layers, observers, and event listeners
     */
    destroy() {
      if (isDestroyed()) return;
      if (!isSettled && rejectPending) {
        isSettled = true;
        rejectPending(new Error('Map was destroyed before initialization completed'));
      }

      cancelLocationPick();

      if (eventTeardown) {
        eventTeardown.destroy();
        eventTeardown = null;
      }

      if (rippleMarkers) {
        rippleMarkers.destroy();
        rippleMarkers = null;
      }

      eventListeners.clear();
      removeComplaintLayers(map);
      destroy();
    },
  };
}

/**
 * Validates GeoJSON FeatureCollection defensively without crashing the app.
 * Accepts Point geometry complaints, which are mapped to road segments.
 *
 * @param {any} data
 * @returns {Object} Valid FeatureCollection
 */
function validateFeatureCollection(data) {
  if (!data || typeof data !== 'object') {
    console.warn('[NAMMA OORU Map] Received non-object data, defaulting to empty FeatureCollection.');
    return { type: 'FeatureCollection', features: [] };
  }

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    console.warn('[NAMMA OORU Map] Data is not a valid FeatureCollection, defaulting to empty.');
    return { type: 'FeatureCollection', features: [] };
  }

  const validFeatures = data.features.filter((feature) => {
    if (!feature || feature.type !== 'Feature') return false;
    if (!feature.geometry || feature.geometry.type !== 'Point') return false;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2 || isNaN(coords[0]) || isNaN(coords[1])) {
      console.warn('[NAMMA OORU Map] Dropping feature with invalid Point coordinates:', feature);
      return false;
    }
    return true;
  });

  return {
    type: 'FeatureCollection',
    features: validFeatures,
  };
}

export {
  CHENNAI_CENTER,
  DEFAULT_ZOOM,
  OPENFREEMAP_STYLE_URL,
  STATUS_COLORS,
  STATUS_CONFIG,
  CATEGORY_CONFIG,
  ACTIVE_WORK_CONFIG,
  DENSITY_SEVERITY_COLORS,
  isActiveWork,
};

export {
  calculateComparativeDamagePercentages,
  calculateOverallRoadDamageStats,
  getDamageRiskTier,
} from './damage-risk-scorer.js';

export {
  firestoreAdapter,
  createFirestoreAdapter,
};


