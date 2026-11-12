# CivicProof GIS Map Module

A reusable, framework-agnostic GIS map module built for **CivicProof**, a civic issue reporting application for Chennai.

> **Current Implementation: Street-Level Complaint Highlighting**  
> Visualizes citizen complaints as colored road segment line highlights following the actual curves and geometry of Chennai streets. Supports interactive citizen complaint submission, street snapping, multi-complaint switcher for overlapping reports, and off-road fallback indicators.

---

## Technical Stack

- **Language & Architecture**: Vanilla JavaScript (ES Modules), HTML, CSS
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)
- **Map Engine**: [MapLibre GL JS](https://maplibre.org/) pinned at `5.2.0`
- **Base Tile Style**: [OpenFreeMap Liberty](https://openfreemap.org/) (`https://tiles.openfreemap.org/styles/liberty`)
  - *Note on OpenFreeMap*: Base style uses keyless, free vector tiles. Usage terms and service availability should be periodically verified at [openfreemap.org](https://openfreemap.org).
- **API Keys & Backend**: None. Zero paid API keys, no backend dependencies, no external database required.

---

## Core Features

### 1. Street-Level Complaint Highlighting (Visual Reference Aligned)
- **Real Road Vector Tile Geometry**: Queries vector tile road features from OpenFreeMap Liberty (`source: 'openmaptiles'`, `source-layer: 'transportation'`) to extract authentic street centerlines rather than decorative straight strokes.
- **Visual Cleanliness & High-Fidelity Road Styling**:
  - **Soft Ambient Glow (`LAYER_ROADS_GLOW`)**: Luminous outer halo hugging street curves matching status color.
  - **Crisp Dark Casing (`LAYER_ROADS_CASING`)**: High-contrast under-stroke with round caps and joins (`#0F172A`) ensuring legibility across light city base tiles.
  - **Primary Street Highlight (`LAYER_ROADS_HIGHLIGHT`)**: Saturated, vivid line with rounded caps and joins following the road shape.
  - **Inner Core Line (`LAYER_ROADS_CORE`)**: Subtle white-tinted inner centerline ribbon providing modern GIS clarity.
- **Status Color Hierarchy**:
  - **Open**: Crimson Red (`#EF4444`) with vivid glow
  - **In Progress**: Traffic Amber (`#F59E0B`) with glowing halo
  - **Resolved**: Emerald Green (`#10B981`) with clean 0.70 soft opacity
- **Transparent Geometry Limitation Handling**:
  - When complaints have valid road locations, they follow real road geometries with rounded corners.
  - If a complaint is situated in an off-road location (e.g. Semmozhi Poonga park interior or Marina Beach shoreline) where no municipal street centerline exists within 80m, the module transparently displays a clean point marker and explains the limitation in the popup rather than drawing misleading estimated strokes.
- **Overlapping Road Segment Support**: When multiple complaints share the same street (e.g. Usman Road or Kamarajar Salai), they are automatically grouped. Clicking the road segment presents an interactive switcher (`[◀ Prev] Complaint 1 of 2 [Next ▶]`) to inspect each issue.

### 2. GPS-Geotagged Complaint Photos & Environment Diagnostics
- **Dual Photo Inputs**:
  - **Take Photo**: Directly opens device camera via `type="file"`, `accept="image/*"`, and `capture="environment"`. Handles cancellation without resetting state. On desktop platforms, browsers automatically provide the standard system file picker fallback.
  - **Upload from Gallery**: Allows selecting existing photo files with safe client-side EXIF inspection.
- **Honest Location Sourcing**:
  - Automatically parses original embedded EXIF GPS tags from JPEG photos when present (`source: 'exif_gps'`).
  - If a gallery image has no EXIF metadata, the system explicitly warns that current device location may not match where older photos were taken, offering explicit `Use Device Location Now` (`source: 'device_gps_at_upload'`) or `Choose Spot on Map` (`source: 'map_selected'`) actions.
  - **Diagnostics & Error Categorization**: Differentiates between:
    - `PERMISSION_DENIED` (Code 1): Detects if running within an iframe subject to Permissions Policy constraints (e.g. AI Studio Preview) and offers clear guidance to open the standalone app URL or use manual map pinning.
    - `POSITION_UNAVAILABLE` (Code 2): Device hardware or network provider error.
    - `TIMEOUT` (Code 3): Raised after 12 seconds with high-accuracy GPS satellite acquisition.
- **Google AI Studio Preview Environment Note**:
  - Web applications embedded in iframes are constrained by the host's `allow="camera; geolocation"` Permission Policy.
  - To test physical device camera and GPS hardware permissions directly, open the application URL in a standalone secure browser tab (`https://...run.app`) on a mobile or laptop browser with location services enabled.
  - The fallback "Choose on map" is always available to set exact coordinates without requiring hardware permissions.
- **Road Snapping Integration**: Captured coordinates automatically query vector tile street centerlines (`findNearestRoadSegment`) to snap and highlight the affected road corridor or cleanly mark off-road points.
- **Structured Data Storage**: Photo and location metadata are recorded together:
  ```json
  {
    "photo": {
      "url": "data:image/jpeg;base64,...",
      "captureMethod": "camera",
      "capturedAt": "2026-10-10T03:45:00Z",
      "location": {
        "latitude": 13.0827,
        "longitude": 80.2707,
        "accuracyMeters": 8,
        "source": "device_gps"
      }
    }
  }
  ```
- **Interactive Popup Badges**: Complaint popups display the photo preview alongside geotag metadata, capture method, timestamp, and location source.

### 3. User-Triggered Cinematic Welcome Screen
- Preserves the cinematic Chennai night backdrop, headlines, tagline, live statistics, neighborhood tags, and pulsing civic issue nodes.
- **Strictly user-triggered**: No automatic timeouts or delayed auto-transitions. The welcome screen remains visible until intentional user interaction.
- Supported interaction triggers:
  - Clicking or tapping the animated `↑ SCROLL TO EXPLORE` indicator at the bottom.
  - Clicking the `Explore the Map` button or navigation link.
  - Scrolling down with mouse wheel (`deltaY > 15`) or swiping upward on mobile touch devices.
  - Pressing `ArrowDown`, `PageDown`, or `Space`.
  - Clicking `Report an Issue` immediately transitions and opens the reporting modal.
- Accidental clicks on text, statistics cards, background, or brand logo are prevented from triggering transitions.
- Fully respects `prefers-reduced-motion` accessibility preferences.
- Map is initialized once on page load and cleanly resizes upon transition.

---

## Public Module API (`createComplaintMap`)

```javascript
import { createComplaintMap } from './src/index.js';

const complaintMap = createComplaintMap('#map-container', {
  navControlPosition: 'bottom-right',
  showCompass: false,
});

await complaintMap.whenReady();

// Inspect complaints
const complaints = complaintMap.getComplaints();

// Add new complaint (automatically snaps and highlights road)
complaintMap.addComplaint({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [80.2337, 13.0418] },
  properties: {
    id: 'DEMO-2026-9999',
    category: 'road_damage',
    status: 'open',
    description: 'Road crater near flyover.',
    createdAt: new Date().toISOString(),
    demo: true,
  },
});

// Update or remove
complaintMap.updateComplaint('DEMO-2026-9999', { status: 'resolved' });
complaintMap.removeComplaint('DEMO-2026-9999');

// Navigation & Lifecycle
complaintMap.flyToComplaint('DEMO-2026-0001');
complaintMap.flyToLocation(80.2707, 13.0827, 14);
complaintMap.resize();
complaintMap.destroy();
```

---

## Directory Structure

```text
├── data/
│   └── demo-complaints.geojson  # 27 Chennai demo complaints with road geometries and overlaps
├── demo/
│   └── index.html               # Developer test harness with verification actions
├── src/
│   ├── adapters/
│   │   └── demo-adapter.js      # In-memory CRUD adapter for GeoJSON complaints
│   ├── events.js                # Road click/hover handlers and safe multi-complaint popup
│   ├── index.js                 # Public factory createComplaintMap and road lifecycle
│   ├── layers.js                # Road highlight line, casing, hitbox, and fallback layers
│   ├── map-init.js              # MapLibre map initialization and container sizing
│   ├── map.css                  # Modal, popup, toast, and legend styles
│   ├── report-modal.js          # Citizen complaint submission modal & road snapping UI
│   ├── road-resolver.js         # Vector-tile road geometry query, clipping, and grouping
│   └── style-config.js          # OpenFreeMap style URL, status colors, and layer constants
├── index.html                   # Citizen-facing app view
├── metadata.json                # Project descriptor
├── package.json                 # Pinned dependencies (maplibre-gl@5.2.0)
├── tsconfig.json                # Vite TypeScript config
├── vite.config.ts               # Multi-page build configuration
└── README.md
```

---

## Verification & Commands

```bash
# Production Build
npm run build

# Type Check & Lint
npm run lint

# Start Local Dev Server
npm run dev
```
