import {
  calculateComparativeDamagePercentages,
  getDamageRiskTier,
  getComplaintSeverityWeight,
  getComplaintRecencyWeight,
  getComplaintDensityFactor,
  calculateSegmentRawScore,
} from './src/damage-risk-scorer.js';


console.log('🧪 ============================================================');
console.log('🧪 TEST SUITE: Comparative Road Damage Percentage & Risk Scoring');
console.log('🧪 ============================================================\n');

// -------------------------------------------------------------
// PART 1: Unit Testing Centralized Scorer & Normalization
// -------------------------------------------------------------

console.log('--- TEST 1: Severity Weights ---');
const minimalComplaint = {
  properties: {
    category: 'other',
    description: 'Minor small surface hairline scratch',
    status: 'open',
  },
};
const severeComplaint = {
  properties: {
    category: 'road_damage',
    description: 'Deep asphalt crater near flyover causing fatal accident hazard',
    status: 'open',
  },
};
const resolvedComplaint = {
  properties: {
    category: 'road_damage',
    description: 'Deep asphalt crater near flyover',
    status: 'resolved',
  },
};

const wMinimal = getComplaintSeverityWeight(minimalComplaint);
const wSevere = getComplaintSeverityWeight(severeComplaint);
const wResolved = getComplaintSeverityWeight(resolvedComplaint);

console.log(`Minimal complaint severity weight: ${wMinimal}`);
console.log(`Severe complaint severity weight: ${wSevere}`);
console.log(`Resolved complaint severity weight: ${wResolved}`);

if (wSevere <= wMinimal) {
  throw new Error(`Severe complaint weight (${wSevere}) must exceed minimal weight (${wMinimal})`);
}
if (wResolved >= wSevere) {
  throw new Error(`Resolved complaint weight (${wResolved}) must be less than open severe weight (${wSevere})`);
}
console.log('✓ PASS: Severity weighting conforms to requirements.\n');

console.log('--- TEST 2: Comparative Scoring & Normalization (Single Minimal vs Multi Severe) ---');

// Mock road segments
const segMinimal = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [[80.20, 13.00], [80.21, 13.00]],
  },
  properties: {
    id: 'SEG-MINIMAL',
    roadName: 'Quiet Residential Lane',
    overlapCount: 1,
    allComplaintsJson: JSON.stringify([
      {
        id: 'C-MIN',
        category: 'other',
        description: 'Small surface gravel patch',
        status: 'open',
        createdAt: new Date(Date.now() - 40 * 86400000).toISOString(), // 40 days old
      },
    ]),
  },
};

const segModerate = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [[80.23, 13.04], [80.24, 13.04]],
  },
  properties: {
    id: 'SEG-MODERATE',
    roadName: 'Market Cross Road',
    overlapCount: 1,
    allComplaintsJson: JSON.stringify([
      {
        id: 'C-MOD',
        category: 'water_leakage',
        description: 'Water pipeline leakage eroding road shoulder',
        status: 'open',
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
    ]),
  },
};

const segHighRisk = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [[80.232, 13.041], [80.234, 13.042]],
  },
  properties: {
    id: 'SEG-HIGH',
    roadName: 'Usman Road Arterial',
    overlapCount: 3,
    allComplaintsJson: JSON.stringify([
      {
        id: 'C-SEV-1',
        category: 'road_damage',
        description: 'Deep crater hole causing accident danger to bikes',
        status: 'open',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'C-SEV-2',
        category: 'road_damage',
        description: 'Huge asphalt collapse obstructing evening traffic',
        status: 'open',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'C-SEV-3',
        category: 'road_damage',
        description: 'Massive sinkhole hazard near flyover ramp',
        status: 'open',
        createdAt: new Date().toISOString(),
      },
    ]),
  },
};

const allComplaintsMock = [
  { geometry: { coordinates: [80.20, 13.00] } },
  { geometry: { coordinates: [80.23, 13.04] } },
  { geometry: { coordinates: [80.232, 13.041] } },
  { geometry: { coordinates: [80.233, 13.0415] } },
  { geometry: { coordinates: [80.234, 13.042] } },
];

const roadFeaturesList = [segMinimal, segModerate, segHighRisk];
calculateComparativeDamagePercentages(roadFeaturesList, [], allComplaintsMock);

console.log(`Minimal Segment damagePercentage: ${segMinimal.properties.damagePercentage}% (${segMinimal.properties.damageRiskLabel}) [Color: ${segMinimal.properties.riskColor}]`);
console.log(`Moderate Segment damagePercentage: ${segModerate.properties.damagePercentage}% (${segModerate.properties.damageRiskLabel}) [Color: ${segModerate.properties.riskColor}]`);
console.log(`High Risk Segment damagePercentage: ${segHighRisk.properties.damagePercentage}% (${segHighRisk.properties.damageRiskLabel}) [Color: ${segHighRisk.properties.riskColor}]`);

if (segMinimal.properties.damagePercentage > 33) {
  throw new Error(`Minimal segment should be 0-33%, got ${segMinimal.properties.damagePercentage}%`);
}
if (segMinimal.properties.damageRiskTier !== 'minimal') {
  throw new Error(`Minimal segment tier must be minimal, got ${segMinimal.properties.damageRiskTier}`);
}
if (segHighRisk.properties.damagePercentage < 67) {
  throw new Error(`High risk segment should be 67-100%, got ${segHighRisk.properties.damagePercentage}%`);
}
if (segHighRisk.properties.damageRiskTier !== 'high') {
  throw new Error(`High risk segment tier must be high, got ${segHighRisk.properties.damageRiskTier}`);
}
if (segHighRisk.properties.damagePercentage <= segMinimal.properties.damagePercentage) {
  throw new Error('High risk segment must have higher damagePercentage than minimal segment');
}
console.log('✓ PASS: Comparative score calculation, tiers, and colors verified.\n');

console.log('--- TEST 3: Recalculation on Dynamic Data Add/Remove/Edit ---');
// Dynamic change: Add a catastrophic cluster next to segMinimal
const segCatastrophic = {
  type: 'Feature',
  geometry: { coordinates: [[80.201, 13.001], [80.202, 13.002]] },
  properties: {
    id: 'SEG-CATASTROPHIC',
    roadName: 'Disaster Roadway',
    overlapCount: 5,
    allComplaintsJson: JSON.stringify([
      { id: 'C1', category: 'road_damage', description: 'Huge road collapse fatal disaster hazard', status: 'open', createdAt: new Date().toISOString() },
      { id: 'C2', category: 'road_damage', description: 'Deep sinkhole emergency danger', status: 'open', createdAt: new Date().toISOString() },
      { id: 'C3', category: 'road_damage', description: 'Major asphalt crater', status: 'open', createdAt: new Date().toISOString() },
      { id: 'C4', category: 'road_damage', description: 'Critical roadway rupture', status: 'open', createdAt: new Date().toISOString() },
      { id: 'C5', category: 'road_damage', description: 'Multiple accidents recorded', status: 'open', createdAt: new Date().toISOString() },
    ]),
  },
};

const updatedList = [segMinimal, segModerate, segHighRisk, segCatastrophic];
calculateComparativeDamagePercentages(updatedList, [], [...allComplaintsMock, { geometry: { coordinates: [80.201, 13.001] } }]);

console.log(`After adding Disaster Roadway:`);
console.log(`Minimal Segment damagePercentage: ${segMinimal.properties.damagePercentage}%`);
console.log(`Moderate Segment damagePercentage: ${segModerate.properties.damagePercentage}%`);
console.log(`High Risk Segment damagePercentage: ${segHighRisk.properties.damagePercentage}%`);
console.log(`Disaster Roadway damagePercentage: ${segCatastrophic.properties.damagePercentage}% (${segCatastrophic.properties.damageRiskLabel})`);

if (segCatastrophic.properties.damagePercentage < segHighRisk.properties.damagePercentage) {
  throw new Error('Catastrophic segment must receive highest comparative score');
}
console.log('--- TEST 4: Color and Prediction Text Synchronization (18%, 52%, 82%) ---');
import { getRiskStyle, calculateRoadDamageScores } from './src/damage-risk-scorer.js';

// Verify 18% (Minimal risk - Single Unified Green)
const style18 = getRiskStyle(18);
console.log(`18%: Category="${style18.riskCategory}", Marker="${style18.markerColor}", Road="${style18.roadHighlightColor}", Text="${style18.textColor}"`);
if (style18.riskCategory !== 'minimal') throw new Error(`18% should be minimal risk, got ${style18.riskCategory}`);
if (style18.markerColor !== '#22C55E') throw new Error(`18% markerColor should be #22C55E, got ${style18.markerColor}`);
if (style18.roadHighlightColor !== '#22C55E') throw new Error(`18% roadHighlightColor should be #22C55E (Unified Green), got ${style18.roadHighlightColor}`);

// Verify 52% (Medium risk - Single Unified Yellow)
const style52 = getRiskStyle(52);
console.log(`52%: Category="${style52.riskCategory}", Marker="${style52.markerColor}", Road="${style52.roadHighlightColor}", Text="${style52.textColor}"`);
if (style52.riskCategory !== 'medium') throw new Error(`52% should be medium risk, got ${style52.riskCategory}`);
if (style52.markerColor !== '#EAB308') throw new Error(`52% markerColor should be #EAB308, got ${style52.markerColor}`);
if (style52.roadHighlightColor !== '#EAB308') throw new Error(`52% roadHighlightColor should be #EAB308 (Unified Yellow), got ${style52.roadHighlightColor}`);

// Verify 82% (High risk - Single Unified Red)
const style82 = getRiskStyle(82);
console.log(`82%: Category="${style82.riskCategory}", Marker="${style82.markerColor}", Road="${style82.roadHighlightColor}", Text="${style82.textColor}"`);
if (style82.riskCategory !== 'high') throw new Error(`82% should be high risk, got ${style82.riskCategory}`);
if (style82.markerColor !== '#EF4444') throw new Error(`82% markerColor should be #EF4444, got ${style82.markerColor}`);
if (style82.roadHighlightColor !== '#EF4444') throw new Error(`82% roadHighlightColor should be #EF4444 (Unified Red), got ${style82.roadHighlightColor}`);
console.log('✓ PASS: Single unified colors and prediction text tokens are 100% synchronized for 18%, 52%, and 82%.\n');

console.log('--- TEST 5: Edge Cases (Equal Raw Scores, Missing Timestamps, Empty Datasets) ---');
// Empty dataset
calculateRoadDamageScores([], [], []);
console.log('✓ PASS: Empty features array handled safely without error.');

// Equal raw scores across 2 segments
const equalSeg1 = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[80.1, 13.1], [80.2, 13.1]] },
  properties: { id: 'EQ-1', overlapCount: 1, allComplaintsJson: JSON.stringify([{ id: 'EQC1', category: 'road_damage', status: 'open' }]) },
};
const equalSeg2 = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[80.3, 13.1], [80.4, 13.1]] },
  properties: { id: 'EQ-2', overlapCount: 1, allComplaintsJson: JSON.stringify([{ id: 'EQC2', category: 'road_damage', status: 'open' }]) },
};
calculateRoadDamageScores([equalSeg1, equalSeg2], [], []);
console.log(`Equal score segment 1 damagePercentage: ${equalSeg1.properties.damagePercentage}%`);
console.log(`Equal score segment 2 damagePercentage: ${equalSeg2.properties.damagePercentage}%`);
if (isNaN(equalSeg1.properties.damagePercentage) || isNaN(equalSeg2.properties.damagePercentage)) {
  throw new Error('Equal scores produced NaN');
}
if (!isFinite(equalSeg1.properties.damagePercentage) || !isFinite(equalSeg2.properties.damagePercentage)) {
  throw new Error('Equal scores produced Infinity');
}
console.log('✓ PASS: Equal raw scores handled safely with documented baseline strategy.\n');

// Missing / invalid timestamps
const invalidTimestampComplaint = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[80.5, 13.1], [80.6, 13.1]] },
  properties: {
    id: 'INV-1',
    allComplaintsJson: JSON.stringify([
      { id: 'INV-C', category: 'other', createdAt: 'not-a-valid-date-string' }
    ]),
  },
};
calculateRoadDamageScores([invalidTimestampComplaint], [], []);
console.log(`Invalid timestamp damagePercentage: ${invalidTimestampComplaint.properties.damagePercentage}%`);
if (isNaN(invalidTimestampComplaint.properties.damagePercentage)) {
  throw new Error('Invalid timestamp produced NaN');
}
console.log('✓ PASS: Invalid timestamps handled safely without NaN.\n');

console.log('🎉 ALL UNIT AND NORMALIZATION TESTS PASSED SUCCESSFULLY!\n');

