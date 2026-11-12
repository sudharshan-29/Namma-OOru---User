import { calculateComparativeDamagePercentages } from './damage-risk-scorer.js';
import { CHENNAI_CORRIDOR_ROAD_FEATURES } from './corridor-network-data.js';
import { ENABLE_DEMO_DATA, isDemoDataEnabled } from './style-config.js';


/**
 * Returns all active line-based road layer IDs from the loaded MapLibre style.
 * Matches layers from 'openmaptiles' with source-layer 'transportation' or any road line layer.
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {Array<string>} Array of layer IDs
 */
export function getAvailableRoadLayerIds(map) {
  if (!map || typeof map.getStyle !== 'function') return [];
  const style = map.getStyle();
  if (!style || !Array.isArray(style.layers)) return [];

  return style.layers
    .filter((layer) => {
      if (layer.type !== 'line') return false;
      
      const sourceLayer = layer['source-layer'] || '';
      const layerId = (layer.id || '').toLowerCase();
      
      const isTransportation =
        sourceLayer === 'transportation' ||
        sourceLayer === 'road' ||
        layerId.includes('highway') ||
        layerId.includes('road') ||
        layerId.includes('street');
        
      const isExcluded =
        layerId.includes('rail') ||
        layerId.includes('casing') ||
        layerId.includes('bridge_rail') ||
        layerId.includes('tunnel') ||
        layerId.includes('path') ||
        layerId.includes('pedestrian') ||
        layerId.includes('footway') ||
        layerId.includes('cycleway') ||
        layerId.includes('steps') ||
        layerId.includes('track') ||
        layerId.includes('service') ||
        layerId.includes('area') ||
        layerId.includes('ferry');
        
      return isTransportation && !isExcluded;
    })
    .map((layer) => layer.id);
}

/**
 * Calculates Haversine distance in meters between two [lng, lat] coordinates.
 *
 * @param {number[]} coord1 - [lng, lat]
 * @param {number[]} coord2 - [lng, lat]
 * @returns {number} Distance in meters
 */
export function haversineMeters(coord1, coord2) {
  const R = 6371000; // Earth radius in meters
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
 * Projects a point onto a line segment [v, w].
 * Returns the nearest point on the segment and parameter t in [0, 1].
 */
function projectOnSegment(point, v, w) {
  const dx = w[0] - v[0];
  const dy = w[1] - v[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { pt: v, t: 0 };

  let t = ((point[0] - v[0]) * dx + (point[1] - v[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    pt: [v[0] + t * dx, v[1] + t * dy],
    t,
  };
}

/**
 * Finds the closest point on a LineString coordinates array to a target [lng, lat].
 *
 * @param {number[]} target - [lng, lat]
 * @param {Array<number[]>} lineCoords - Array of [lng, lat]
 * @returns {Object | null} { point, segmentIndex, distanceMeters }
 */
export function findClosestPointOnLine(target, lineCoords) {
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return null;

  let minDistance = Infinity;
  let bestMatch = null;

  for (let i = 0; i < lineCoords.length - 1; i++) {
    const v = lineCoords[i];
    const w = lineCoords[i + 1];
    const proj = projectOnSegment(target, v, w);
    const dist = haversineMeters(target, proj.pt);

    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = {
        point: proj.pt,
        segmentIndex: i,
        distanceMeters: dist,
      };
    }
  }

  return bestMatch;
}

/**
 * Clips a road LineString around a complaint coordinate to avoid
 * highlighting an entire long motorway when only a localized stretch is affected.
 * For standard municipal street segments (length <= 700m), preserves the full
 * unbroken road geometry from intersection to intersection.
 *
 * @param {number[]} target - [lng, lat]
 * @param {Array<number[]>} lineCoords - Array of [lng, lat]
 * @param {number} [maxHalfDist=280] - Maximum half-distance in meters
 * @returns {Array<number[]>} Clipped or full sub-LineString coordinates
 */
export function clipRoadAroundPoint(target, lineCoords, maxHalfDist = 280) {
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return lineCoords;

  // Calculate total length in meters
  let totalLen = 0;
  for (let i = 0; i < lineCoords.length - 1; i++) {
    totalLen += haversineMeters(lineCoords[i], lineCoords[i + 1]);
  }
  // If line is <= 700m (standard municipal street segment or block), preserve the full continuous street geometry!
  if (totalLen <= 700) {
    return lineCoords;
  }

  const closest = findClosestPointOnLine(target, lineCoords);
  if (!closest) return lineCoords;

  const segIdx = closest.segmentIndex;
  const snapPt = closest.point;

  // Trace backwards along the road
  const backwards = [];
  let dBack = 0;
  let prevBack = snapPt;
  for (let i = segIdx; i >= 0; i--) {
    const pt = lineCoords[i];
    const step = haversineMeters(prevBack, pt);
    if (dBack + step <= maxHalfDist) {
      backwards.unshift(pt);
      dBack += step;
      prevBack = pt;
    } else {
      const remain = maxHalfDist - dBack;
      if (remain > 4 && step > 0) {
        const ratio = remain / step;
        const interp = [
          prevBack[0] + ratio * (pt[0] - prevBack[0]),
          prevBack[1] + ratio * (pt[1] - prevBack[1]),
        ];
        backwards.unshift(interp);
      }
      break;
    }
  }

  // Trace forwards along the road
  const forwards = [];
  let dFwd = 0;
  let prevFwd = snapPt;
  for (let i = segIdx + 1; i < lineCoords.length; i++) {
    const pt = lineCoords[i];
    const step = haversineMeters(prevFwd, pt);
    if (dFwd + step <= maxHalfDist) {
      forwards.push(pt);
      dFwd += step;
      prevFwd = pt;
    } else {
      const remain = maxHalfDist - dFwd;
      if (remain > 4 && step > 0) {
        const ratio = remain / step;
        const interp = [
          prevFwd[0] + ratio * (pt[0] - prevFwd[0]),
          prevFwd[1] + ratio * (pt[1] - prevFwd[1]),
        ];
        forwards.push(interp);
      }
      break;
    }
  }

  const result = [...backwards, snapPt, ...forwards];

  // Deduplicate consecutive identical vertices
  const clean = [];
  for (let i = 0; i < result.length; i++) {
    if (i === 0 || haversineMeters(result[i], result[i - 1]) > 0.8) {
      clean.push(result[i]);
    }
  }

  return clean.length >= 2 ? clean : lineCoords;
}

/**
 * Finds the nearest vector-tile road feature to a given coordinate.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {number[]} coords - [lng, lat]
 * @param {number} [searchRadiusPx=36] - Search bounding box half-size in screen pixels
 * @returns {Object | null} { roadGeometry, snappedCoords, roadName, roadClass }
 */
export function findNearestRoadSegment(map, coords, searchRadiusPx = 36) {
  if (!map || !map.isStyleLoaded()) return null;

  const roadLayerIds = getAvailableRoadLayerIds(map);
  if (roadLayerIds.length === 0) return null;

  let point;
  try {
    point = map.project(coords);
  } catch {
    return null;
  }

  const bbox = [
    [point.x - searchRadiusPx, point.y - searchRadiusPx],
    [point.x + searchRadiusPx, point.y + searchRadiusPx],
  ];

  let renderedRoads = [];
  try {
    renderedRoads = map.queryRenderedFeatures(bbox, { layers: roadLayerIds });
  } catch (err) {
    console.warn('[NAMMA OORU] Error querying road features:', err);
    return null;
  }

  if (!renderedRoads || renderedRoads.length === 0) {
    return null;
  }

  // Find road LineString closest to coords
  let bestCandidate = null;
  let minWeightedDistance = Infinity;

  for (const feature of renderedRoads) {
    if (!feature.geometry) continue;

    const roadClass = (feature.properties?.class || '').toLowerCase();
    // Exclude pedestrian paths, sidewalks, footways, tracks, service driveways
    if (['path', 'pedestrian', 'footway', 'steps', 'cycleway', 'track', 'service'].includes(roadClass)) {
      continue;
    }

    // Road class preference weighting so major/secondary roads are preferred over minor alleys
    let classWeight = 1.0;
    if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(roadClass)) {
      classWeight = 0.85; // Favored arterial
    } else if (['street', 'residential', 'minor', 'road', 'street_limited'].includes(roadClass)) {
      classWeight = 1.0;
    } else {
      classWeight = 1.3;
    }

    let lineStrings = [];
    if (feature.geometry.type === 'LineString') {
      lineStrings.push(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiLineString') {
      lineStrings = feature.geometry.coordinates;
    }

    for (const lineCoords of lineStrings) {
      if (!Array.isArray(lineCoords) || lineCoords.length < 2) continue;

      const closest = findClosestPointOnLine(coords, lineCoords);
      if (closest) {
        const weightedDist = closest.distanceMeters * classWeight;
        if (weightedDist < minWeightedDistance) {
          minWeightedDistance = weightedDist;
          bestCandidate = {
            lineCoords,
            snappedCoords: closest.point,
            properties: feature.properties || {},
            actualDistanceMeters: closest.distanceMeters,
          };
        }
      }
    }
  }

  // Maximum allowed snap tolerance in meters (~80 meters from road centerline)
  if (!bestCandidate || bestCandidate.actualDistanceMeters > 80) {
    return null;
  }

  // Extract a sensible street highlight section centered around the complaint
  const clippedCoords = clipRoadAroundPoint(
    bestCandidate.snappedCoords,
    bestCandidate.lineCoords,
    280
  );

  if (!clippedCoords || clippedCoords.length < 2) {
    return null;
  }

  // Query nearby street name label if possible
  let roadName =
    bestCandidate.properties.name ||
    bestCandidate.properties.name_en ||
    bestCandidate.properties.ref ||
    null;

  if (!roadName) {
    try {
      const styleLayers = map.getStyle()?.layers || [];
      const validNameLayers = styleLayers
        .filter((l) => l.type === 'symbol' && (l['source-layer'] === 'transportation_name' || l.id.includes('road') || l.id.includes('transportation')))
        .map((l) => l.id);

      if (validNameLayers.length > 0) {
        const nameFeatures = map.queryRenderedFeatures(bbox, {
          layers: validNameLayers,
        });
        if (nameFeatures && nameFeatures.length > 0) {
          roadName = nameFeatures[0].properties?.name || nameFeatures[0].properties?.name_en || null;
        }
      }
    } catch {
      // Ignore optional name query failure
    }
  }

  return {
    roadGeometry: {
      type: 'LineString',
      coordinates: clippedCoords,
    },
    snappedCoords: [
      Number(bestCandidate.snappedCoords[0].toFixed(5)),
      Number(bestCandidate.snappedCoords[1].toFixed(5)),
    ],
    roadName: roadName ? String(roadName) : 'Chennai Street',
    roadClass: bestCandidate.properties.class || 'road',
  };
}

/**
 * Snaps a point to the nearest road or returns original coordinates.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {number[]} coords - [lng, lat]
 * @returns {Object} { snappedCoords, roadName, roadGeometry, isRoadSnapped }
 */
export function snapPointToRoad(map, coords) {
  const resolved = findNearestRoadSegment(map, coords);
  if (resolved) {
    return {
      snappedCoords: resolved.snappedCoords,
      roadName: resolved.roadName,
      roadGeometry: resolved.roadGeometry,
      isRoadSnapped: true,
    };
  }
  return {
    snappedCoords: coords,
    roadName: null,
    roadGeometry: null,
    isRoadSnapped: false,
  };
}

/**
 * Builds the highlighted road LineString collection and fallback points collection
 * from the complaints dataset. Handles multiple complaints overlapping on the same street.
 *
 * Visual Rules:
 * 1. Road Geometry is highlighted using a thick LineString following the actual street.
 * 2. Red for 'open', Amber for 'in_progress', Green for 'resolved'.
 * 3. Base map roads remain visible underneath or around the highlight.
 * 4. Fallback point markers are used only if road feature cannot be identified reliably.
 * 5. Overlapping complaints on the same road segment are grouped so all are accessible in the UI.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Object} complaintsFeatureCollection
 * @param {Map<string, Object>} [roadCache] - In-memory cache of resolved road geometries
 * @returns {Object} { roadCollection, fallbackCollection }
 */
export function buildRoadHighlightCollections(
  map,
  complaintsFeatureCollection,
  roadCache = new Map()
) {
  const roadFeatures = [];
  const fallbackFeatures = [];

  const complaints =
    complaintsFeatureCollection && Array.isArray(complaintsFeatureCollection.features)
      ? complaintsFeatureCollection.features
      : [];

  // Group complaints to detect overlaps on the same road segment
  const roadGroups = new Map();

  for (const complaint of complaints) {
    if (!complaint || !complaint.geometry || !complaint.properties) continue;
    const cid = complaint.properties.id;
    const coords = complaint.geometry.coordinates;

    // Check if complaint already has roadGeometry or cached
    let resolved =
      (complaint.properties.roadGeometry
        ? {
            roadGeometry: {
              type: 'LineString',
              coordinates: clipRoadAroundPoint(
                coords,
                complaint.properties.roadGeometry.coordinates,
                280
              ),
            },
            roadName: complaint.properties.roadName || 'Chennai Street',
            snappedCoords: coords,
          }
        : null) || roadCache.get(cid);

    if (!resolved && map && map.isStyleLoaded()) {
      resolved = findNearestRoadSegment(map, coords);
      if (resolved) {
        complaint.properties.roadGeometry = resolved.roadGeometry;
        complaint.properties.roadName = resolved.roadName;
        roadCache.set(cid, resolved);
      }
    }

    if (
      resolved &&
      resolved.roadGeometry &&
      Array.isArray(resolved.roadGeometry.coordinates) &&
      resolved.roadGeometry.coordinates.length >= 2
    ) {
      // Group key based on approximate midpoint of the road segment (~15m precision)
      const midIdx = Math.floor(resolved.roadGeometry.coordinates.length / 2);
      const midCoord = resolved.roadGeometry.coordinates[midIdx] || coords;
      const groupKey = `${midCoord[0].toFixed(3)},${midCoord[1].toFixed(3)}`;

      if (!roadGroups.has(groupKey)) {
        roadGroups.set(groupKey, {
          roadGeometry: resolved.roadGeometry,
          roadName: resolved.roadName || complaint.properties.roadName || 'Chennai Street',
          complaints: [],
        });
      }
      roadGroups.get(groupKey).complaints.push(complaint);
    } else {
      // Fallback point marker if road geometry cannot be identified reliably
      fallbackFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coords,
        },
        properties: {
          ...complaint.properties,
          isFallback: true,
        },
      });
    }
  }

  // Construct LineString GeoJSON features with multi-complaint overlap support
  for (const group of roadGroups.values()) {
    const groupComplaints = group.complaints;
    if (groupComplaints.length === 0) continue;

    // Status hierarchy for road styling: open > in_progress > resolved
    let primaryStatus = 'resolved';
    if (groupComplaints.some((c) => c.properties.status === 'open')) {
      primaryStatus = 'open';
    } else if (groupComplaints.some((c) => c.properties.status === 'in_progress')) {
      primaryStatus = 'in_progress';
    }

    const primaryComplaint = groupComplaints[0];
    const allSerialized = groupComplaints.map((c) => ({
      id: c.properties.id,
      category: c.properties.category,
      severity: c.properties.severity,
      damageRiskTier: c.properties.damageRiskTier,
      damagePercentage: c.properties.damagePercentage,
      status: c.properties.status,
      description: c.properties.description,
      createdAt: c.properties.createdAt,
      photo: c.properties.photo || null,
      roadName: group.roadName,
      demo: c.properties.demo ?? true,
    }));

    const roadFeature = {
      type: 'Feature',
      geometry: group.roadGeometry,
      properties: {
        id: primaryComplaint.properties.id,
        category: primaryComplaint.properties.category,
        status: primaryStatus,
        description: primaryComplaint.properties.description,
        createdAt: primaryComplaint.properties.createdAt,
        photo: primaryComplaint.properties.photo || null,
        demo: true,
        roadName: group.roadName,
        overlapCount: groupComplaints.length,
        complaintCount: groupComplaints.length,
        densityCount: groupComplaints.length,
        complaintIds: groupComplaints.map((c) => c.properties.id).join(', '),
        allComplaintsJson: JSON.stringify(allSerialized),
      },
    };
    roadFeatures.push(roadFeature);
    group.roadFeature = roadFeature;
  }

  // Verified municipal arterial and connected corridor road network features
  // (extracted directly from OpenFreeMap vector tile street centerlines)
  if (isDemoDataEnabled()) {
    for (const corridor of CHENNAI_CORRIDOR_ROAD_FEATURES) {
      roadFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: corridor.coordinates,
        },
        properties: {
          id: corridor.id,
          category: corridor.category,
          status: corridor.status,
          description: corridor.damageExplanation,
          createdAt: new Date().toISOString(),
          roadName: corridor.roadName,
          overlapCount: corridor.overlapCount || 0,
          complaintCount: corridor.complaintCount || 0,
          densityCount: corridor.densityCount || 0,
          damageRiskTier: corridor.damageRiskTier,
          damageRiskLabel: corridor.damageRiskLabel,
          roadColor: corridor.roadColor,
          roadHighlightColor: corridor.roadHighlightColor,
          casingColor: corridor.casingColor,
          damagePercentage: corridor.damagePercentage,
          damageExplanation: corridor.damageExplanation,
          isMonitoredZero: corridor.damageRiskTier === 'minimal',
          isCorridorNetwork: true,
        },
      });
    }
  }

  // Centralized comparative road-risk scoring across all currently damaged road segments
  calculateComparativeDamagePercentages(roadFeatures, fallbackFeatures, complaints);

  // Construct small, neat circular complaint markers placed directly ON the road geometries
  const markerFeatures = [];

  for (const group of roadGroups.values()) {
    const groupComplaints = group.complaints;
    const parentRoad = group.roadFeature;
    if (groupComplaints.length === 0 || !parentRoad) continue;

    groupComplaints.forEach((c, idx) => {
      // Always project the marker directly onto the parent road centerline geometry
      // so the marker and the road highlight line are 100% in the exact same position
      let markerCoords = null;
      if (Array.isArray(group.roadGeometry?.coordinates) && group.roadGeometry.coordinates.length >= 2) {
        const queryPt = c.geometry?.coordinates || c.properties?.snappedCoords;
        const closest = findClosestPointOnLine(queryPt, group.roadGeometry.coordinates);
        if (closest && closest.point) {
          markerCoords = [
            Number(closest.point[0].toFixed(5)),
            Number(closest.point[1].toFixed(5)),
          ];
        }
      }
      if (!markerCoords) {
        markerCoords = c.properties?.snappedCoords || c.geometry?.coordinates;
      }

      // If multiple complaints share the exact same coordinates on this road,
      // slightly separate them along the road curve (~18m micro-offset) so all markers remain visible
      if (groupComplaints.length > 1 && idx > 0) {
        const offsetDist = 0.00016 * idx;
        markerCoords = [
          Number((markerCoords[0] + offsetDist).toFixed(5)),
          Number((markerCoords[1] + offsetDist * 0.4).toFixed(5)),
        ];
      }

      // Explicitly synchronize complaint properties with the parent road segment
      c.properties.damagePercentage = parentRoad.properties.damagePercentage;
      c.properties.damageRiskScore = parentRoad.properties.damageRiskScore;
      c.properties.damageRiskTier = parentRoad.properties.damageRiskTier;
      c.properties.damageRiskLabel = parentRoad.properties.damageRiskLabel;
      c.properties.riskCategory = parentRoad.properties.riskCategory;
      c.properties.markerColor = parentRoad.properties.markerColor;
      c.properties.roadHighlightColor = parentRoad.properties.roadHighlightColor;
      c.properties.roadColor = parentRoad.properties.roadColor;
      c.properties.riskColor = parentRoad.properties.riskColor;
      c.properties.casingColor = parentRoad.properties.casingColor;
      c.properties.textColor = parentRoad.properties.textColor;
      c.properties.predictionColor = parentRoad.properties.predictionColor;
      c.properties.predictionText = parentRoad.properties.predictionText;
      c.properties.riskAssessment = parentRoad.properties.riskAssessment;
      c.properties.damageExplanation = parentRoad.properties.damageExplanation;

      markerFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: markerCoords,
        },
        properties: {
          ...c.properties,
          id: c.properties.id,
          category: c.properties.category,
          status: c.properties.status,
          description: c.properties.description,
          createdAt: c.properties.createdAt,
          photo: c.properties.photo || null,
          demo: true,
          roadName: group.roadName,
          overlapCount: groupComplaints.length,
          damagePercentage: parentRoad.properties.damagePercentage,
          damageRiskScore: parentRoad.properties.damageRiskScore,
          damageRiskTier: parentRoad.properties.damageRiskTier,
          damageRiskLabel: parentRoad.properties.damageRiskLabel,
          riskCategory: parentRoad.properties.riskCategory,
          markerColor: parentRoad.properties.markerColor,
          roadHighlightColor: parentRoad.properties.roadHighlightColor,
          roadColor: parentRoad.properties.roadColor,
          riskColor: parentRoad.properties.riskColor,
          casingColor: parentRoad.properties.casingColor,
          textColor: parentRoad.properties.textColor,
          predictionColor: parentRoad.properties.predictionColor,
          predictionText: parentRoad.properties.predictionText,
          riskAssessment: parentRoad.properties.riskAssessment,
          damageExplanation: parentRoad.properties.damageExplanation,
          highestSeverity: parentRoad.properties.highestSeverity,
          densityFactor: parentRoad.properties.densityFactor,
          recencyWeight: parentRoad.properties.recencyWeight,
          mostRecentDate: parentRoad.properties.mostRecentDate,
          complaintIds: groupComplaints.map((comp) => comp.properties.id).join(', '),
          allComplaintsJson: parentRoad.properties.allComplaintsJson,
          isRoadMarker: true,
          densityCount: groupComplaints.length,
          complaintCount: groupComplaints.length,
          isActiveWork: c.properties.status === 'in_progress',
        },
      });
    });
  }

  // Add real-time interactive markers on verified municipal corridor centerlines (when demo data is enabled)
  if (isDemoDataEnabled()) {
    for (const corridor of CHENNAI_CORRIDOR_ROAD_FEATURES) {
      if (!Array.isArray(corridor.coordinates) || corridor.coordinates.length < 2) continue;
      const midIdx = Math.floor(corridor.coordinates.length / 2);
      const midCoord = corridor.coordinates[midIdx];

      const isActive = corridor.status === 'in_progress';
      markerFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [
            Number(midCoord[0].toFixed(5)),
            Number(midCoord[1].toFixed(5)),
          ],
        },
        properties: {
          id: `MARKER-${corridor.id}`,
          roadName: corridor.roadName,
          category: corridor.category,
          status: corridor.status,
          description: corridor.damageExplanation,
          createdAt: new Date().toISOString(),
          damagePercentage: corridor.damagePercentage,
          damageRiskScore: corridor.damagePercentage,
          damageRiskTier: corridor.damageRiskTier,
          damageRiskLabel: corridor.damageRiskLabel,
          riskCategory: corridor.damageRiskTier,
          markerColor: corridor.roadColor,
          roadHighlightColor: corridor.roadHighlightColor,
          roadColor: corridor.roadColor,
          riskColor: corridor.roadColor,
          casingColor: corridor.casingColor,
          textColor: corridor.roadColor,
          predictionColor: corridor.roadColor,
          predictionText: corridor.damageExplanation,
          riskAssessment: corridor.damageExplanation,
          damageExplanation: corridor.damageExplanation,
          isRoadMarker: true,
          densityCount: corridor.densityCount || 1,
          complaintCount: corridor.complaintCount || 1,
          isActiveWork: isActive,
        },
      });
    }
  }

  return {
    roadCollection: {
      type: 'FeatureCollection',
      features: roadFeatures,
    },
    fallbackCollection: {
      type: 'FeatureCollection',
      features: fallbackFeatures,
    },
    markerCollection: {
      type: 'FeatureCollection',
      features: markerFeatures,
    },
  };
}

export { calculateComparativeDamagePercentages };

