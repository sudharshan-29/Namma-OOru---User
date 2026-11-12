import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  haversineMeters,
  findClosestPointOnLine,
  extractRoadWindow,
} from './road-geometry-helper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GEOJSON_PATH = path.join(ROOT_DIR, 'data', 'demo-complaints.geojson');
const STRETCHES_PATH = path.join(__dirname, 'resolved-chennai-stretches.json');

function buildDistributedComplaints() {
  console.log('='.repeat(70));
  console.log('NAMMA OORU — Distribute Demo Complaints Across Chennai Road Network');
  console.log('='.repeat(70));

  if (!fs.existsSync(STRETCHES_PATH)) {
    throw new Error(`Stretches file not found at: ${STRETCHES_PATH}`);
  }

  const stretches = JSON.parse(fs.readFileSync(STRETCHES_PATH, 'utf-8'));
  console.log(`Loaded ${stretches.length} resolved OSM road stretches.`);

  let existingGeoJSON = null;
  if (fs.existsSync(GEOJSON_PATH)) {
    existingGeoJSON = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8'));
    console.log(`Found existing demo dataset with ${existingGeoJSON.features?.length || 0} records.`);
  }

  const existingFeatures = existingGeoJSON?.features || [];
  const updatedFeatures = [];

  // Track coordinates for duplicate and distance validation
  const allocatedPoints = [];

  for (let i = 0; i < stretches.length; i++) {
    const s = stretches[i];
    const existingFeat = existingFeatures[i] || {};
    const existingProps = existingFeat.properties || {};

    const id = existingProps.id || `DEMO-2026-${String(i + 1).padStart(4, '0')}`;
    const status = existingProps.status || (i % 3 === 1 ? 'in_progress' : i % 7 === 0 ? 'resolved' : 'open');
    const category = existingProps.category || (i % 4 === 0 ? 'road_damage' : i % 4 === 1 ? 'water_leakage' : i % 4 === 2 ? 'waste_disposal' : 'street_light');
    const severity = existingProps.severity || (status === 'open' ? 'high' : status === 'in_progress' ? 'moderate' : 'low');
    const createdAt = existingProps.createdAt || new Date(Date.now() - (i % 25 + 2) * 86400000).toISOString();
    const isActiveWork = status === 'in_progress';

    // Pick vertex along the stretch coordinates
    // If a way is shared between two stretches, offset target index to ensure separation
    const coords = s.coordinates;
    const len = coords.length;
    let targetIdx = Math.floor(len / 2);

    if (s.stretchId === 'C01') targetIdx = Math.max(0, Math.floor(len * 0.15));
    else if (s.stretchId === 'C02') targetIdx = Math.min(len - 1, Math.floor(len * 0.85));
    else if (s.stretchId === 'C08') targetIdx = Math.max(0, Math.floor(len * 0.15));
    else if (s.stretchId === 'C09') targetIdx = Math.min(len - 1, Math.floor(len * 0.85));
    else if (s.stretchId === 'W01') targetIdx = Math.max(0, Math.floor(len * 0.15));
    else if (s.stretchId === 'W02') targetIdx = Math.min(len - 1, Math.floor(len * 0.85));
    else if (s.stretchId === 'W12') targetIdx = Math.max(0, Math.floor(len * 0.20));
    else if (s.stretchId === 'W13') targetIdx = Math.min(len - 1, Math.floor(len * 0.80));

    const selectedPoint = coords[targetIdx];

    // Snap to line geometry to ensure exact 0.0m distance
    const snapResult = findClosestPointOnLine(selectedPoint, coords);
    const snappedCoords = snapResult ? snapResult.point : selectedPoint;
    const distanceMeters = snapResult ? snapResult.distanceMeters : 0.0;

    // Extract road highlight segment
    const roadWindowCoords = extractRoadWindow(coords, snappedCoords, 280);

    // Keep description contextual to the road stretch
    let desc = existingProps.description;
    if (!desc || desc.length < 10) {
      if (category === 'road_damage') {
        desc = `Pavement distress and surface rutting along ${s.road} near ${s.stretch}.`;
      } else if (category === 'water_leakage') {
        desc = `Underground supply line leak causing shoulder water stagnation along ${s.road} at ${s.stretch}.`;
      } else if (category === 'waste_disposal') {
        desc = `Garbage bin clearance and sidewalk verge cleaning required near ${s.stretch}.`;
      } else {
        desc = `Non-functional street light fixture and power cable inspection on ${s.road} (${s.stretch}).`;
      }
    }

    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: snappedCoords,
      },
      properties: {
        id,
        category,
        status,
        severity,
        roadName: s.road,
        stretchName: s.stretch,
        junction: `${s.road} (${s.stretch})`,
        corridorId: `CORR-${s.region.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
        corridorZone: `${s.region} Chennai`,
        sourceRoadId: `OSM-WAY-${s.wayId}`,
        osmWayName: s.highwayName,
        roadClass: s.highwayClass,
        description: desc,
        createdAt,
        demo: true,
        isSimulatedPrototype: true,
        isActiveWork,
        verificationStatus: 'verified_on_road',
        snappedCoordinates: snappedCoords,
        distanceToRoadMeters: distanceMeters,
        toleranceMeters: 5.0,
        disclaimer: 'Simulated prototype record for Chennai civic demonstration — NOT a live government record',
        roadGeometry: {
          type: 'LineString',
          coordinates: roadWindowCoords,
        },
      },
    };

    updatedFeatures.push(feature);
    allocatedPoints.push({
      id,
      road: s.road,
      stretch: s.stretch,
      region: s.region,
      coords: snappedCoords,
    });
  }

  // VALIDATION & SPATIAL CHECKS
  console.log('\n--- SPATIAL SEPARATION & DUPLICATE AUDIT ---');

  // 1. Check for exact duplicate coordinates
  const coordKeySet = new Set();
  const exactDuplicates = [];

  for (const p of allocatedPoints) {
    const key = `${p.coords[0].toFixed(5)},${p.coords[1].toFixed(5)}`;
    if (coordKeySet.has(key)) {
      exactDuplicates.push({ id: p.id, key, road: p.road, stretch: p.stretch });
    }
    coordKeySet.add(key);
  }

  if (exactDuplicates.length > 0) {
    console.error('❌ EXACT DUPLICATES DETECTED:', exactDuplicates);
    throw new Error('Exact duplicate coordinates found in dataset!');
  } else {
    console.log(`✓ 0 Exact coordinate duplicates (All ${allocatedPoints.length} coordinates are 100% unique).`);
  }

  // 2. Check pairwise distances across the entire dataset
  let minDistance = Infinity;
  let closestPair = null;
  const closePairs = [];

  for (let i = 0; i < allocatedPoints.length; i++) {
    for (let j = i + 1; j < allocatedPoints.length; j++) {
      const p1 = allocatedPoints[i];
      const p2 = allocatedPoints[j];
      const d = haversineMeters(p1.coords, p2.coords);

      if (d < minDistance) {
        minDistance = d;
        closestPair = { p1, p2, d };
      }

      if (d < 120) {
        closePairs.push({ p1: `${p1.id} (${p1.road} - ${p1.stretch})`, p2: `${p2.id} (${p2.road} - ${p2.stretch})`, d: Math.round(d) });
      }
    }
  }

  console.log(`✓ Minimum separation between any two complaints: ${Math.round(minDistance)} meters.`);
  console.log(`  Closest pair: ${closestPair.p1.id} (${closestPair.p1.stretch}) <--> ${closestPair.p2.id} (${closestPair.p2.stretch}) = ${Math.round(minDistance)}m`);

  if (closePairs.length > 0) {
    console.warn(`⚠ Pairs under 120m:`, closePairs);
  } else {
    console.log(`✓ 0 Unintended near-duplicates (< 120m). Every single complaint has ample spatial clearance!`);
  }

  // 3. Regional distribution summary
  const regionalCounts = { Central: 0, North: 0, West: 0, South: 0 };
  for (const p of allocatedPoints) {
    regionalCounts[p.region] = (regionalCounts[p.region] || 0) + 1;
  }
  console.log('\n--- REGIONAL SPREAD SUMMARY ---');
  console.log(`- Central Chennai: ${regionalCounts.Central} complaints`);
  console.log(`- North Chennai:   ${regionalCounts.North} complaints`);
  console.log(`- West Chennai:    ${regionalCounts.West} complaints`);
  console.log(`- South Chennai:   ${regionalCounts.South} complaints`);
  console.log(`- Total Records:   ${updatedFeatures.length}`);

  // 4. Status and active work summary
  let inProgressCount = 0;
  let openCount = 0;
  let resolvedCount = 0;
  for (const f of updatedFeatures) {
    if (f.properties.status === 'in_progress') inProgressCount++;
    else if (f.properties.status === 'resolved') resolvedCount++;
    else openCount++;
  }
  console.log(`\n--- STATUS & ACTIVE WORK ---`);
  console.log(`- Open: ${openCount}`);
  console.log(`- In-Progress (▲ Active Work): ${inProgressCount}`);
  console.log(`- Resolved: ${resolvedCount}`);

  // Save updated dataset
  const outputCollection = {
    type: 'FeatureCollection',
    name: 'NAMMA_OORU_Chennai_Demo_Complaints',
    generatedAt: new Date().toISOString(),
    disclaimer: 'FICTIONAL DEMO DATA — NOT A LIVE GOVERNMENT RECORD',
    features: updatedFeatures,
  };

  fs.writeFileSync(GEOJSON_PATH, JSON.stringify(outputCollection, null, 2), 'utf-8');
  console.log(`\n[SUCCESS] Wrote ${updatedFeatures.length} geographically distributed records to:`);
  console.log(`  ${GEOJSON_PATH}\n`);
  console.log('='.repeat(70));
}

buildDistributedComplaints();
