/**
 * NAMMA OORU — Chennai Prototype Complaint Data Generator
 * Geographically accurate road alignment using OpenStreetMap road network geometry.
 */

import fs from 'fs';
import path from 'path';

// Haversine distance in meters
function haversineMeters(coord1, coord2) {
  const R = 6371000;
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLng = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Project point onto segment [v, w]
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

// Find closest point on LineString
function findClosestPointOnLine(target, lineCoords) {
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
        point: [Number(proj.pt[0].toFixed(5)), Number(proj.pt[1].toFixed(5))],
        segmentIndex: i,
        distanceMeters: Number(dist.toFixed(2)),
      };
    }
  }
  return bestMatch;
}

// Extract a localized road window around the snapped point (250-400m)
function extractRoadWindow(lineCoords, snapPoint, maxHalfDist = 280) {
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return lineCoords;
  const closest = findClosestPointOnLine(snapPoint, lineCoords);
  if (!closest) return lineCoords;

  const segIdx = closest.segmentIndex;
  const snapPt = closest.point;

  // Backwards
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
      if (remain > 5 && step > 0) {
        const ratio = remain / step;
        backwards.unshift([
          Number((prevBack[0] + ratio * (pt[0] - prevBack[0])).toFixed(5)),
          Number((prevBack[1] + ratio * (pt[1] - prevBack[1])).toFixed(5)),
        ]);
      }
      break;
    }
  }

  // Forwards
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
      if (remain > 5 && step > 0) {
        const ratio = remain / step;
        forwards.push([
          Number((prevFwd[0] + ratio * (pt[0] - prevFwd[0])).toFixed(5)),
          Number((prevFwd[1] + ratio * (pt[1] - prevFwd[1])).toFixed(5)),
        ]);
      }
      break;
    }
  }

  const combined = [...backwards, snapPt, ...forwards];
  const clean = [];
  for (let i = 0; i < combined.length; i++) {
    if (i === 0 || haversineMeters(combined[i], combined[i - 1]) > 1.5) {
      clean.push(combined[i]);
    }
  }
  return clean.length >= 2 ? clean : lineCoords;
}

export {
  haversineMeters,
  findClosestPointOnLine,
  extractRoadWindow,
};
