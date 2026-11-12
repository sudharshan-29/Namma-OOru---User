/**
 * NAMMA OORU — Chennai Prototype Complaint Data Generator
 * 
 * Distributes 54 simulated civic complaints across 54 distinct road stretches
 * covering Central, North, West, and South Chennai.
 * 
 * Guarantees:
 * - 0 exact coordinate duplicates
 * - Minimum spatial separation >= 160 meters between all pairs
 * - 100% snapped to authoritative OpenStreetMap road centerlines (distanceToRoad = 0.0m)
 * - Balanced representation: Central (14), North (12), West (14), South (14)
 * - Active work synchronization: 18 in-progress complaints with yellow triangles (▲)
 */

import './build-distributed-demo-complaints.mjs';
