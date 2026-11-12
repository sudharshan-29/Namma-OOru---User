import demoComplaintsData from '../../data/demo-complaints.geojson';
import { ENABLE_DEMO_DATA, setDemoDataEnabled } from '../style-config.js';

export { demoComplaintsData };

/**
 * In-Memory Demo Adapter
 * Manages fictional Chennai civic complaints without requiring a database or backend.
 * Provides full CRUD operations on in-memory GeoJSON data.
 * Includes simulated AI authenticity checks, risk-based prioritization, and recurring issue detection.
 */
// Haversine distance in meters
function getDistanceInMeters(lon1, lat1, lon2, lat2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate Risk Score
function calculateRiskScore(category, description, createdAt) {
  let score = 0;
  const desc = description.toLowerCase();
  
  // Category base risk
  if (category === 'road_damage') score += 40;
  else if (category === 'water_leakage') score += 30;
  else if (category === 'waste_disposal') score += 20;
  else score += 10;
  
  // Obstruction / Safety Risk keywords
  if (desc.includes('accident') || desc.includes('danger') || desc.includes('hazard')) score += 30;
  if (desc.includes('block') || desc.includes('obstruct') || desc.includes('traffic')) score += 20;
  if (desc.includes('deep') || desc.includes('large') || desc.includes('huge')) score += 10;
  
  // Age factor (older = slightly higher risk to prioritize)
  const daysOld = (Date.now() - new Date(createdAt).getTime()) / (1000 * 3600 * 24);
  score += Math.min(daysOld * 2, 20); // Cap at 20 points
  
  return Math.min(Math.round(score), 100);
}

// Simulate AI Evidence Check
function simulateAiCheck(photo, category) {
  if (!photo) return null;
  const flags = [];
  
  // Randomly flag ~15% of photos for demo purposes
  const r = Math.random();
  if (r < 0.05) flags.push("Potential Duplicate: Image visually matches a previously resolved report.");
  else if (r < 0.10) flags.push(`Mismatch: Image contents do not appear to match category '${category}'.`);
  else if (r < 0.15) flags.push("Authenticity Warning: Possible metadata manipulation detected.");
  
  return flags.length > 0 ? flags : null;
}
export class DemoComplaintAdapter {
  constructor(seedData = null) {
    this._features = new Map();
    const initialSeed =
      seedData !== null
        ? seedData
        : ENABLE_DEMO_DATA
        ? demoComplaintsData
        : { type: 'FeatureCollection', features: [] };
    this.seed(initialSeed);
  }

  /**
   * Initializes or resets the store from a GeoJSON FeatureCollection
   * @param {Object} data
   */
  seed(data) {
    this._features.clear();
    const collection = data && Array.isArray(data.features) ? data.features : [];
    for (const feat of collection) {
      if (feat && feat.properties && feat.properties.id) {
        // Store deep copy
        const copy = JSON.parse(JSON.stringify(feat));
        // Preserve validated road geometries for accurate road snapping
        this._features.set(copy.properties.id, copy);
      }
    }
  }

  /**
   * Replaceable adapter contract method:
   * @returns {Promise<Object>} Resolves to a valid GeoJSON FeatureCollection
   */
  async load() {
    return this.getCollection();
  }

  /**
   * Returns all features as an array
   * @returns {Array<Object>}
   */
  getAll() {
    return Array.from(this._features.values()).map((f) => JSON.parse(JSON.stringify(f)));
  }

  /**
   * Returns current features packaged into a GeoJSON FeatureCollection
   * @returns {Object}
   */
  getCollection() {
    return {
      type: 'FeatureCollection',
      name: 'CivicProof_Chennai_Fictional_Demo_Complaints',
      disclaimer: 'FICTIONAL DEMO DATA — NOT A LIVE GOVERNMENT RECORD',
      features: this.getAll(),
    };
  }

  /**
   * Retrieves a single complaint feature by ID
   * @param {string} id
   * @returns {Object | null}
   */
  getComplaint(id) {
    const f = this._features.get(id);
    return f ? JSON.parse(JSON.stringify(f)) : null;
  }

  /**
   * Adds a new complaint to the collection
   * @param {Object} feature - GeoJSON Feature
   * @returns {Object} Added feature
   */
  addComplaint(feature) {
    if (!feature || typeof feature !== 'object') {
      throw new Error('[CivicProof Adapter] Invalid complaint feature provided.');
    }
    const props = feature.properties || {};
    const id = props.id || `DEMO-2026-${String(this._features.size + 1).padStart(4, '0')}`;

    if (this._features.has(id)) {
      console.warn(`[CivicProof Adapter] Complaint with ID ${id} already exists. Skipping duplicate.`);
      return this.getComplaint(id);
    }

    const category = props.category || 'other';
    const description = props.description || 'No description provided.';
    const createdAt = props.createdAt || new Date().toISOString();
    
    // 1. Recurring Issue Detection
    const lng = feature.geometry?.coordinates?.[0] || 80.2707;
    const lat = feature.geometry?.coordinates?.[1] || 13.0827;
    
    let isRecurring = false;
    let recurringCount = 0;
    
    for (const [existingId, existingFeat] of this._features.entries()) {
      if (existingFeat.properties.category === category && existingFeat.properties.status === 'resolved') {
        const exLng = existingFeat.geometry.coordinates[0];
        const exLat = existingFeat.geometry.coordinates[1];
        if (getDistanceInMeters(lng, lat, exLng, exLat) < 50) {
          isRecurring = true;
          recurringCount = (existingFeat.properties.recurringCount || 1) + 1;
        }
      }
    }

    // 2. Risk-based Prioritization
    const riskScore = calculateRiskScore(category, description, createdAt);
    let riskLevel = 'Low';
    if (riskScore >= 80) riskLevel = 'Critical';
    else if (riskScore >= 60) riskLevel = 'High';
    else if (riskScore >= 40) riskLevel = 'Medium';

    // 3. AI Evidence Checks
    const aiFlags = simulateAiCheck(props.photo, category);
    
    // Status can be flagged for review if AI flags are present
    const status = props.status || (aiFlags ? 'flagged' : 'open');

    const newFeature = {
      type: 'Feature',
      geometry: feature.geometry || {
        type: 'Point',
        coordinates: [80.2707, 13.0827],
      },
      properties: {
        id,
        category,
        status,
        description,
        createdAt,
        demo: true,
        riskScore,
        riskLevel,
        isRecurring,
        recurringCount,
        aiFlags,
        photo: props.photo || null,
        roadName: props.roadName || null,
        anonymous: props.anonymous || false
      },
    };

    this._features.set(id, newFeature);
    return JSON.parse(JSON.stringify(newFeature));
  }

  /**
   * Updates an existing complaint with patch properties
   * Preserves immutable identity (id)
   * @param {string} id
   * @param {Object} patch
   * @returns {Object | null} Updated feature or null if not found
   */
  updateComplaint(id, patch) {
    if (!this._features.has(id)) {
      console.warn(`[CivicProof Adapter] Cannot update: Complaint ID ${id} not found.`);
      return null;
    }

    const current = this._features.get(id);
    const safePatch = { ...patch };
    // Prevent overriding immutable ID
    delete safePatch.id;

    if (safePatch.coordinates && Array.isArray(safePatch.coordinates)) {
      current.geometry.coordinates = [...safePatch.coordinates];
      delete safePatch.coordinates;
    }

    current.properties = {
      ...current.properties,
      ...safePatch,
    };

    this._features.set(id, current);
    return JSON.parse(JSON.stringify(current));
  }

  /**
   * Removes a complaint by ID
   * @param {string} id
   * @returns {boolean} True if removed, false if not found
   */
  removeComplaint(id) {
    if (!this._features.has(id)) {
      console.warn(`[CivicProof Adapter] Cannot remove: Complaint ID ${id} not found.`);
      return false;
    }
    return this._features.delete(id);
  }

  /**
   * Resets the store back to initial demo complaints if enabled, or empty
   */
  reset() {
    this.seed(ENABLE_DEMO_DATA ? demoComplaintsData : { type: 'FeatureCollection', features: [] });
  }

  /**
   * Explicitly loads all 56 demo complaints into memory
   */
  loadDemoComplaints() {
    setDemoDataEnabled(true);
    this.seed(demoComplaintsData);
    return this.getCollection();
  }

  /**
   * Temporarily removes all demo complaints
   */
  clearDemoComplaints() {
    setDemoDataEnabled(false);
    this.seed({ type: 'FeatureCollection', features: [] });
    return this.getCollection();
  }
}

// Default singleton instance
export const demoAdapter = new DemoComplaintAdapter();

/**
 * Factory for creating custom adapter instances
 * @param {Object} [seedData]
 * @returns {DemoComplaintAdapter}
 */
export function createDemoAdapter(seedData) {
  return new DemoComplaintAdapter(seedData);
}
