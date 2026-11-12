import fs from 'fs';

const STRETCHES = [
  // Central Chennai (14 complaints)
  { id: 'C01', region: 'Central', road: 'Anna Salai', stretch: 'Gemini Flyover descent', lng: 80.2503, lat: 13.0516, kw: 'Anna' },
  { id: 'C02', region: 'Central', road: 'Anna Salai', stretch: 'Thousand Lights Metro', lng: 80.2585, lat: 13.0585, kw: 'Anna' },
  { id: 'C03', region: 'Central', road: 'Anna Salai', stretch: 'Nandanam Signal junction', lng: 80.2412, lat: 13.0317, kw: 'Anna' },
  { id: 'C04', region: 'Central', road: 'Poonamallee High Road', stretch: 'Aminjikarai Market', lng: 80.2180, lat: 13.0760, kw: 'Poonamallee' },
  { id: 'C05', region: 'Central', road: 'Poonamallee High Road', stretch: 'Kilpauk Medical College', lng: 80.2426, lat: 13.0776, kw: 'Poonamallee' },
  { id: 'C06', region: 'Central', road: 'Royapettah High Road', stretch: 'Royapettah Clock Tower', lng: 80.2641, lat: 13.0504, kw: 'Royapettah' },
  { id: 'C07', region: 'Central', road: 'Royapettah High Road', stretch: 'Luz Church road junction', lng: 80.2620, lat: 13.0400, kw: 'Royapettah' },
  { id: 'C08', region: 'Central', road: 'North Usman Road', stretch: 'Panagal Park flyover approach', lng: 80.2323, lat: 13.0435, kw: 'Usman' },
  { id: 'C09', region: 'Central', road: 'South Usman Road', stretch: 'T. Nagar Ranganathan St approach', lng: 80.2317, lat: 13.0398, kw: 'Usman' },
  { id: 'C10', region: 'Central', road: 'Sardar Patel Road', stretch: 'Guindy Raj Bhavan stretch', lng: 80.2250, lat: 13.0080, kw: 'Sardar' },
  { id: 'C11', region: 'Central', road: 'Sardar Patel Road', stretch: 'Adyar CLRI / IIT Madras', lng: 80.2480, lat: 13.0070, kw: 'Sardar' },
  { id: 'C12', region: 'Central', road: 'Cathedral Road', stretch: 'Gopalapuram / Stella Maris', lng: 80.2540, lat: 13.0480, kw: 'Cathedral' },
  { id: 'C13', region: 'Central', road: 'TTK Road', stretch: 'Alwarpet Music Academy approach', lng: 80.2530, lat: 13.0410, kw: 'TTK' },
  { id: 'C14', region: 'Central', road: 'Dr Radhakrishnan Salai', stretch: 'Mylapore / Marina approach', lng: 80.2690, lat: 13.0450, kw: 'Radhakrishnan' },

  // North Chennai (12 complaints)
  { id: 'N01', region: 'North', road: 'Tondiarpet High Road', stretch: 'Tollgate / Basin Bridge approach', lng: 80.2680, lat: 13.1180, kw: 'Tondiarpet' },
  { id: 'N02', region: 'North', road: 'Tondiarpet High Road', stretch: 'Apollo Tondiarpet vicinity', lng: 80.2515, lat: 13.1309, kw: 'Tondiarpet' },
  { id: 'N03', region: 'North', road: 'Tondiarpet High Road', stretch: 'Stanley Medical College approach', lng: 80.2820, lat: 13.1090, kw: 'Stanley' },
  { id: 'N04', region: 'North', road: 'Chennai–Tiruvottiyur High Road', stretch: 'Kaladipet market stretch', lng: 80.2980, lat: 13.1480, kw: 'Tiruvottiyur' },
  { id: 'N05', region: 'North', road: 'Chennai–Tiruvottiyur High Road', stretch: 'Theradi / Sannathi St', lng: 80.3010, lat: 13.1620, kw: 'Tiruvottiyur' },
  { id: 'N06', region: 'North', road: 'Chennai–Tiruvottiyur High Road', stretch: 'Wimco Nagar approach', lng: 80.3030, lat: 13.1760, kw: 'Tiruvottiyur' },
  { id: 'N07', region: 'North', road: 'Paper Mills Road', stretch: 'Perambur Church stretch', lng: 80.2410, lat: 13.1120, kw: 'Paper' },
  { id: 'N08', region: 'North', road: 'Paper Mills Road', stretch: 'Sembium bus depot stretch', lng: 80.2330, lat: 13.1190, kw: 'Paper' },
  { id: 'N09', region: 'North', road: 'Paper Mills Road', stretch: 'Retteri junction approach', lng: 80.2220, lat: 13.1280, kw: 'Paper' },
  { id: 'N10', region: 'North', road: 'Madhavaram High Road', stretch: 'Moolakadai signal junction', lng: 80.2410, lat: 13.1180, kw: 'Madhavaram' },
  { id: 'N11', region: 'North', road: 'Madhavaram High Road', stretch: 'Madhavaram market central', lng: 80.2370, lat: 13.1270, kw: 'Madhavaram' },
  { id: 'N12', region: 'North', road: 'Madhavaram High Road', stretch: 'Madhavaram Roundtana bypass', lng: 80.2310, lat: 13.1420, kw: 'Madhavaram' },

  // West Chennai (14 complaints)
  { id: 'W01', region: 'West', road: 'Inner Ring Road (100 Feet Road)', stretch: 'Koyambedu wholesale market entrance', lng: 80.2075, lat: 13.0676, kw: 'Jawaharlal' },
  { id: 'W02', region: 'West', road: 'Inner Ring Road (100 Feet Road)', stretch: 'Arumbakkam Metro station', lng: 80.2117, lat: 13.0617, kw: 'Jawaharlal' },
  { id: 'W03', region: 'West', road: 'Inner Ring Road (100 Feet Road)', stretch: 'Vadapalani flyover descent', lng: 80.2121, lat: 13.0509, kw: 'Jawaharlal' },
  { id: 'W04', region: 'West', road: 'Inner Ring Road (100 Feet Road)', stretch: 'Ashok Nagar Pillar intersection', lng: 80.2110, lat: 13.0360, kw: 'Jawaharlal' },
  { id: 'W05', region: 'West', road: 'Arcot Road', stretch: 'Vadapalani junction', lng: 80.2114, lat: 13.0498, kw: 'Arcot' },
  { id: 'W06', region: 'West', road: 'Arcot Road', stretch: 'Alwarthirunagar signal', lng: 80.1900, lat: 13.0440, kw: 'Arcot' },
  { id: 'W07', region: 'West', road: 'Arcot Road', stretch: 'Valasaravakkam central', lng: 80.1791, lat: 13.0420, kw: 'Arcot' },
  { id: 'W08', region: 'West', road: 'Mount–Poonamallee Road', stretch: 'Porur junction', lng: 80.1602, lat: 13.0341, kw: 'Mount' },
  { id: 'W09', region: 'West', road: 'Mount–Poonamallee Road', stretch: 'Ramapuram / DLF IT Park', lng: 80.1780, lat: 13.0320, kw: 'Mount' },
  { id: 'W10', region: 'West', road: 'Mount–Poonamallee Road', stretch: 'MIOT Hospital vicinity', lng: 80.1880, lat: 13.0230, kw: 'Mount' },
  { id: 'W11', region: 'West', road: 'Ambattur Estate Main Road', stretch: 'Estate 2nd Main Road North', lng: 80.1650, lat: 13.0980, kw: 'Main' },
  { id: 'W12', region: 'West', road: 'Ambattur Estate Main Road', stretch: 'Estate 2nd Main Road South', lng: 80.1630, lat: 13.0940, kw: 'Main' },
  { id: 'W13', region: 'West', road: 'Ambattur Estate Main Road', stretch: 'Telephone Exchange stretch', lng: 80.1550, lat: 13.0900, kw: 'Main' },
  { id: 'W14', region: 'West', road: 'Ambattur Estate Main Road', stretch: 'Pattaravakkam rail approach', lng: 80.1680, lat: 13.1040, kw: 'Main' },

  // South Chennai (14 complaints)
  { id: 'S01', region: 'South', road: 'Grand Southern Trunk (GST) Road', stretch: 'Guindy Kathipara interchange', lng: 80.2050, lat: 13.0070, kw: 'Trunk' },
  { id: 'S02', region: 'South', road: 'Grand Southern Trunk (GST) Road', stretch: 'Pallavaram flyover descent', lng: 80.1480, lat: 12.9680, kw: 'Trunk' },
  { id: 'S03', region: 'South', road: 'Grand Southern Trunk (GST) Road', stretch: 'Chromepet bus terminus', lng: 80.1365, lat: 12.9466, kw: 'Trunk' },
  { id: 'S04', region: 'South', road: 'Velachery Main Road', stretch: 'Vijayanagar MRTS flyover', lng: 80.2184, lat: 12.9815, kw: 'Velachery' },
  { id: 'S05', region: 'South', road: 'Velachery Main Road', stretch: 'Dhandeeswaram junction', lng: 80.2220, lat: 12.9830, kw: 'Velachery' },
  { id: 'S06', region: 'South', road: 'Velachery Main Road', stretch: 'Kaiveli / Madipakkam border', lng: 80.2050, lat: 12.9700, kw: 'Velachery' },
  { id: 'S07', region: 'South', road: 'OMR (Rajiv Gandhi Salai)', stretch: 'Taramani / Tidel Park', lng: 80.2450, lat: 12.9890, kw: 'Rajiv' },
  { id: 'S08', region: 'South', road: 'OMR (Rajiv Gandhi Salai)', stretch: 'Perungudi toll plaza', lng: 80.2440, lat: 12.9650, kw: 'Rajiv' },
  { id: 'S09', region: 'South', road: 'OMR (Rajiv Gandhi Salai)', stretch: 'Sholinganallur junction', lng: 80.2280, lat: 12.8988, kw: 'Rajiv' },
  { id: 'S10', region: 'South', road: 'East Coast Road (ECR)', stretch: 'Thiruvanmiyur RTO beach approach', lng: 80.2578, lat: 12.9875, kw: 'Coast' },
  { id: 'S11', region: 'South', road: 'East Coast Road (ECR)', stretch: 'Palavakkam signal junction', lng: 80.2563, lat: 12.9621, kw: 'Coast' },
  { id: 'S12', region: 'South', road: 'Medavakkam Main Road', stretch: 'Madipakkam bazaar stretch', lng: 80.1980, lat: 12.9650, kw: 'Medavakkam' },
  { id: 'S13', region: 'South', road: 'Medavakkam Main Road', stretch: 'Keelkattalai signal junction', lng: 80.1858, lat: 12.9531, kw: 'Medavakkam' },
  { id: 'S14', region: 'South', road: 'Medavakkam Main Road', stretch: 'Medavakkam junction approach', lng: 80.1900, lat: 12.9180, kw: 'Medavakkam' },
];

async function fetchStretchWay(stretch) {
  const delta = 0.005; // ~500m bounding box
  const bbox = `${(stretch.lng - delta).toFixed(4)},${(stretch.lat - delta).toFixed(4)},${(stretch.lng + delta).toFixed(4)},${(stretch.lat + delta).toFixed(4)}`;
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'NammaOoruStretchSurvey/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const nodeMap = new Map();
  for (const el of data.elements) {
    if (el.type === 'node') nodeMap.set(el.id, [Number(el.lon.toFixed(5)), Number(el.lat.toFixed(5))]);
  }
  const ways = data.elements.filter(el => el.type === 'way' && el.tags?.highway);
  
  // Find matching major highway
  let matched = ways.find(w => {
    const rname = (w.tags.name || w.tags['name:en'] || '').toLowerCase();
    const hclass = w.tags.highway || '';
    if (['primary', 'secondary', 'trunk', 'tertiary'].includes(hclass)) {
      if (stretch.kw && rname.includes(stretch.kw.toLowerCase())) return true;
    }
    return false;
  }) || ways.find(w => ['trunk', 'primary', 'secondary'].includes(w.tags?.highway))
     || ways[0];

  if (!matched) throw new Error('No highway way in bbox');
  const coords = matched.nodes.map(id => nodeMap.get(id)).filter(Boolean);
  if (coords.length < 2) throw new Error(`Insufficient coordinates: ${coords.length}`);

  return {
    stretchId: stretch.id,
    region: stretch.region,
    road: stretch.road,
    stretch: stretch.stretch,
    wayId: matched.id,
    highwayName: matched.tags.name || matched.tags['name:en'] || stretch.road,
    highwayClass: matched.tags.highway || 'road',
    coordinates: coords,
  };
}

async function run() {
  console.log(`Starting survey of ${STRETCHES.length} stretches...`);
  const resolved = [];
  for (let i = 0; i < STRETCHES.length; i++) {
    const s = STRETCHES[i];
    try {
      const res = await fetchStretchWay(s);
      resolved.push(res);
      console.log(`[${i+1}/${STRETCHES.length}] ✓ ${s.region} - ${s.road} (${s.stretch}): Way ${res.wayId}, ${res.coordinates.length} nodes`);
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.error(`[${i+1}/${STRETCHES.length}] ✗ ${s.region} - ${s.road} (${s.stretch}): ${err.message}`);
    }
  }

  console.log(`\nSurvey complete: ${resolved.length} / ${STRETCHES.length} stretches resolved.`);
  fs.writeFileSync('scripts/resolved-chennai-stretches.json', JSON.stringify(resolved, null, 2));
}

run();
