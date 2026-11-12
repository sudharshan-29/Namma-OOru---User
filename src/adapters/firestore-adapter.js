import { demoAdapter, demoComplaintsData } from './demo-adapter.js';
import { setDemoDataEnabled, isDemoDataEnabled } from '../style-config.js';

/**
 * Validates whether coordinates represent a valid latitude and longitude.
 *
 * @param {*} lng
 * @param {*} lat
 * @returns {boolean}
 */
export function isValidCoordinate(lng, lat) {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    !isNaN(lng) &&
    !isNaN(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Converts a raw Firestore document snapshot or data object into a standardized GeoJSON feature.
 * Handles Firestore GeoPoint, coordinates array, object notation, and missing fields defensively.
 *
 * @param {Object} doc - Document snapshot or raw document object
 * @returns {Object|null} GeoJSON Point feature or null if coordinates are invalid
 */
export function firestoreDocToFeature(doc) {
  if (!doc) return null;
  const id = doc.id || (doc.properties && doc.properties.id) || (doc.data && doc.data.id) || `FS-${Date.now()}`;
  const data = typeof doc.data === 'function' ? doc.data() : (doc.data || doc);

  let lng = null;
  let lat = null;

  // 1. Check for Firestore GeoPoint ({ latitude, longitude }) in location field
  if (data.location) {
    if (typeof data.location.longitude === 'number' && typeof data.location.latitude === 'number') {
      lng = data.location.longitude;
      lat = data.location.latitude;
    } else if (typeof data.location.lng === 'number' && typeof data.location.lat === 'number') {
      lng = data.location.lng;
      lat = data.location.lat;
    } else if (Array.isArray(data.location.coordinates) && data.location.coordinates.length >= 2) {
      lng = data.location.coordinates[0];
      lat = data.location.coordinates[1];
    }
  }

  // 2. Check for root coordinates or geometry object
  if (lng === null || lat === null) {
    if (data.geometry && Array.isArray(data.geometry.coordinates) && data.geometry.coordinates.length >= 2) {
      lng = data.geometry.coordinates[0];
      lat = data.geometry.coordinates[1];
    } else if (Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
      lng = data.coordinates[0];
      lat = data.coordinates[1];
    } else if (typeof data.lng === 'number' && typeof data.lat === 'number') {
      lng = data.lng;
      lat = data.lat;
    } else if (typeof data.longitude === 'number' && typeof data.latitude === 'number') {
      lng = data.longitude;
      lat = data.latitude;
    }
  }

  // 3. Fallback to properties if already wrapped in GeoJSON
  if ((lng === null || lat === null) && doc.geometry && Array.isArray(doc.geometry.coordinates)) {
    lng = doc.geometry.coordinates[0];
    lat = doc.geometry.coordinates[1];
  }

  if (!isValidCoordinate(lng, lat)) {
    console.warn(`[NAMMA OORU Firestore] Skipping record ${id}: invalid coordinates [${lng}, ${lat}]`);
    return null;
  }

  // Parse createdAt timestamp safely
  let createdAt = new Date().toISOString();
  if (data.createdAt) {
    if (typeof data.createdAt.toDate === 'function') {
      createdAt = data.createdAt.toDate().toISOString();
    } else if (typeof data.createdAt === 'string') {
      createdAt = data.createdAt;
    } else if (typeof data.createdAt === 'number') {
      createdAt = new Date(data.createdAt).toISOString();
    }
  }

  // Extract explicit severity only if present in data; do not invent it
  const severity = data.severity !== undefined ? data.severity : null;

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))],
    },
    properties: {
      id,
      category: data.category || 'other',
      status: data.status || 'open',
      description: data.description || '',
      createdAt,
      photo: data.photo || null,
      roadName: data.roadName || null,
      severity,
      ...(data.properties || {}),
    },
  };
}

/**
 * Safely resolves Firestore SDK without crashing bundlers if firebase package is not installed.
 */
async function getFirestoreSDK() {
  if (typeof window !== 'undefined' && window.firestoreSDK) {
    return window.firestoreSDK;
  }
  try {
    const pkg = 'firebase/firestore';
    return await import(/* @vite-ignore */ pkg);
  } catch {
    return null;
  }
}

/**
 * Robust Firebase Firestore Complaint Adapter.
 * Connects to live Firebase Firestore when available, handles real-time snapshot updates,
 * coordinate validation, and seamlessly falls back to the in-memory data store when offline
 * or unconfigured.
 */
export class FirestoreComplaintAdapter {
  constructor(options = {}) {
    this.collectionName = options.collectionName || 'complaints';
    this.demoCollectionName = options.demoCollectionName || 'demo_complaints';
    this._isDemoMode = options.demoMode !== undefined ? Boolean(options.demoMode) : isDemoDataEnabled();
    this._db = options.firestore || (typeof window !== 'undefined' ? (window.db || window.firestore) : null);
    this._fallbackAdapter = options.fallbackAdapter || demoAdapter;
    this._unsubscribe = null;
    this._listeners = new Set();
    this._cachedFeatures = new Map();
    this._isLiveFirestore = false;

    if (this._db) {
      this._isLiveFirestore = true;
    }
  }

  /**
   * Returns current active Firestore collection name based on demo mode.
   * Isolates prototype demo complaints in 'demo_complaints' and preserves 'complaints' for production.
   * @returns {string}
   */
  getActiveCollectionName() {
    return this._isDemoMode ? this.demoCollectionName : this.collectionName;
  }

  /**
   * Returns whether adapter is operating in demo/prototype mode.
   * @returns {boolean}
   */
  isDemoMode() {
    return this._isDemoMode;
  }

  /**
   * Toggles demo mode on or off.
   * When enabled, live operations target 'demo_complaints' without altering 'complaints'.
   * @param {boolean} enabled
   * @returns {Promise<Object>}
   */
  async setDemoMode(enabled) {
    this._isDemoMode = Boolean(enabled);
    setDemoDataEnabled(this._isDemoMode);
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._db && this._listeners.size > 0) {
      this._attachSnapshotListener();
    }
    return this.load();
  }

  /**
   * Returns whether live Firestore instance is currently active.
   * @returns {boolean}
   */
  isLive() {
    return this._isLiveFirestore;
  }

  /**
   * Sets the Firestore DB instance and updates live tracking flag.
   * Cleans up existing snapshot listeners before re-attaching.
   *
   * @param {Object} db - Firestore database instance
   */
  setFirestore(db) {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._db = db;
    this._isLiveFirestore = Boolean(db);
  }

  /**
   * Loads all complaints and packages them as a GeoJSON FeatureCollection.
   * @returns {Promise<Object>}
   */
  async load() {
    if (this._db) {
      try {
        const sdk = await getFirestoreSDK();
        if (sdk && sdk.collection && sdk.getDocs) {
          const colRef = sdk.collection(this._db, this.getActiveCollectionName());
          const snap = await sdk.getDocs(colRef);
          this._cachedFeatures.clear();

          snap.forEach((doc) => {
            const feat = firestoreDocToFeature(doc);
            if (feat) {
              this._cachedFeatures.set(feat.properties.id, feat);
            }
          });

          return this.getCollection();
        }
      } catch (err) {
        console.warn(`[NAMMA OORU Firestore] getDocs error on ${this.getActiveCollectionName()}; falling back to demo store:`, err);
      }
    }

    // Fallback adapter
    const fallbackData = await this._fallbackAdapter.load();
    this._cachedFeatures.clear();
    if (fallbackData && Array.isArray(fallbackData.features)) {
      fallbackData.features.forEach((f) => {
        if (f && f.properties && f.properties.id) {
          this._cachedFeatures.set(f.properties.id, f);
        }
      });
    }
    return this.getCollection();
  }

  /**
   * Registers a subscriber for real-time complaint collection updates.
   * Automatically manages unsubscription to prevent duplicate listeners.
   *
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.add(callback);

    // If live Firestore is available and no listener attached yet, setup onSnapshot
    if (this._db && !this._unsubscribe) {
      this._attachSnapshotListener();
    }

    // Immediately notify with current cache
    callback(this.getCollection());

    return () => {
      this._listeners.delete(callback);
      if (this._listeners.size === 0 && this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
    };
  }

  /**
   * Internal helper to attach Firestore onSnapshot listener
   */
  async _attachSnapshotListener() {
    try {
      const sdk = await getFirestoreSDK();
      if (!sdk || !sdk.collection || !sdk.onSnapshot || !this._db) return;

      const colRef = sdk.collection(this._db, this.getActiveCollectionName());
      this._unsubscribe = sdk.onSnapshot(
        colRef,
        (snapshot) => {
          this._cachedFeatures.clear();
          snapshot.forEach((doc) => {
            const feat = firestoreDocToFeature(doc);
            if (feat) {
              this._cachedFeatures.set(feat.properties.id, feat);
            }
          });
          const currentCollection = this.getCollection();
          this._notifyListeners(currentCollection);
        },
        (error) => {
          console.warn('[NAMMA OORU Firestore] onSnapshot error:', error);
        }
      );
    } catch (err) {
      console.warn('[NAMMA OORU Firestore] Unable to attach onSnapshot listener:', err);
    }
  }

  /**
   * Notifies all registered subscribers
   */
  _notifyListeners(collectionData) {
    for (const listener of this._listeners) {
      try {
        listener(collectionData);
      } catch (err) {
        console.error('[NAMMA OORU Firestore] Error in listener callback:', err);
      }
    }
  }

  /**
   * Returns current features packaged into a GeoJSON FeatureCollection
   * @returns {Object}
   */
  getCollection() {
    return {
      type: 'FeatureCollection',
      name: 'NAMMA_OORU_Complaints',
      collection: this.getActiveCollectionName(),
      isDemoMode: this._isDemoMode,
      isLiveFirestore: this._isLiveFirestore,
      features: Array.from(this._cachedFeatures.values()).map((f) => JSON.parse(JSON.stringify(f))),
    };
  }

  /**
   * Adds a new complaint to Firestore (or fallback store)
   *
   * @param {Object} feature - GeoJSON feature
   * @returns {Promise<Object>} Added feature
   */
  async addComplaint(feature) {
    if (!feature || typeof feature !== 'object') {
      throw new Error('[NAMMA OORU Firestore] Invalid complaint feature provided.');
    }

    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [80.2707, 13.0827];
    const id = props.id || `CP-${Date.now()}`;

    if (this._db) {
      try {
        const sdk = await getFirestoreSDK();
        if (sdk && sdk.collection && sdk.addDoc) {
          const docPayload = {
            id,
            category: props.category || 'other',
            status: props.status || 'open',
            description: props.description || '',
            createdAt: props.createdAt || new Date().toISOString(),
            photo: props.photo || null,
            roadName: props.roadName || null,
            severity: props.severity !== undefined ? props.severity : null,
            location: sdk.GeoPoint ? new sdk.GeoPoint(coords[1], coords[0]) : { lat: coords[1], lng: coords[0] },
          };

          const docRef = await sdk.addDoc(sdk.collection(this._db, this.getActiveCollectionName()), docPayload);
          const feat = firestoreDocToFeature({ id: docRef.id, data: docPayload });
          if (feat) {
            this._cachedFeatures.set(feat.properties.id, feat);
            this._notifyListeners(this.getCollection());
            return feat;
          }
        }
      } catch (err) {
        console.warn('[NAMMA OORU Firestore] addDoc error; delegating to fallback adapter:', err);
      }
    }

    // Fallback store
    const added = this._fallbackAdapter.addComplaint(feature);
    if (added) {
      this._cachedFeatures.set(added.properties.id, added);
      this._notifyListeners(this.getCollection());
    }
    return added;
  }

  /**
   * Updates an existing complaint status or properties
   *
   * @param {string} id
   * @param {Object} patch
   * @returns {Promise<Object|null>}
   */
  async updateComplaint(id, patch) {
    if (this._db) {
      try {
        const sdk = await getFirestoreSDK();
        if (sdk && sdk.doc && sdk.updateDoc) {
          const docRef = sdk.doc(this._db, this.getActiveCollectionName(), id);
          await sdk.updateDoc(docRef, patch);
          if (this._cachedFeatures.has(id)) {
            const current = this._cachedFeatures.get(id);
            Object.assign(current.properties, patch);
            this._notifyListeners(this.getCollection());
            return current;
          }
        }
      } catch (err) {
        console.warn('[NAMMA OORU Firestore] updateDoc error; delegating to fallback adapter:', err);
      }
    }

    const updated = this._fallbackAdapter.updateComplaint(id, patch);
    if (updated) {
      this._cachedFeatures.set(id, updated);
      this._notifyListeners(this.getCollection());
    }
    return updated;
  }

  /**
   * Removes a complaint by ID
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async removeComplaint(id) {
    if (this._db) {
      try {
        const sdk = await getFirestoreSDK();
        if (sdk && sdk.doc && sdk.deleteDoc) {
          const docRef = sdk.doc(this._db, this.getActiveCollectionName(), id);
          await sdk.deleteDoc(docRef);
          this._cachedFeatures.delete(id);
          this._notifyListeners(this.getCollection());
          return true;
        }
      } catch (err) {
        console.warn('[NAMMA OORU Firestore] deleteDoc error; delegating to fallback adapter:', err);
      }
    }

    const removed = this._fallbackAdapter.removeComplaint(id);
    if (removed) {
      this._cachedFeatures.delete(id);
      this._notifyListeners(this.getCollection());
    }
    return removed;
  }

  /**
   * Loads demo complaints into cache and notifies subscribers
   */
  loadDemoData(seedData = demoComplaintsData) {
    this._isDemoMode = true;
    setDemoDataEnabled(true);
    if (this._fallbackAdapter && typeof this._fallbackAdapter.seed === 'function') {
      this._fallbackAdapter.seed(seedData);
    }
    this._cachedFeatures.clear();
    const collection = this._fallbackAdapter.getCollection();
    if (collection && Array.isArray(collection.features)) {
      collection.features.forEach((f) => {
        if (f && f.properties && f.properties.id) {
          this._cachedFeatures.set(f.properties.id, f);
        }
      });
    }
    const current = this.getCollection();
    this._notifyListeners(current);
    return current;
  }

  /**
   * Clears demo complaints from cache and notifies subscribers
   */
  clearDemoData() {
    this._isDemoMode = false;
    setDemoDataEnabled(false);
    if (this._fallbackAdapter && typeof this._fallbackAdapter.seed === 'function') {
      this._fallbackAdapter.seed({ type: 'FeatureCollection', features: [] });
    }
    this._cachedFeatures.clear();
    const current = this.getCollection();
    this._notifyListeners(current);
    return current;
  }
}

// Default singleton adapter instance
export const firestoreAdapter = new FirestoreComplaintAdapter();

/**
 * Creates a new Firestore complaint adapter instance
 * @param {Object} [options]
 * @returns {FirestoreComplaintAdapter}
 */
export function createFirestoreAdapter(options) {
  return new FirestoreComplaintAdapter(options);
}
