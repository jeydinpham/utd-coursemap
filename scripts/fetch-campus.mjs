// Pulls UT Dallas building footprints plus the surrounding roads, paths,
// parking, lawns and water from OpenStreetMap (Overpass API), and writes
// public/data/buildings.json and public/data/campus.json.
// Run with: npm run data:campus
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BBOX = '32.9780,-96.7600,32.9980,-96.7400'; // south,west,north,east around main campus
const QUERY = `[out:json][timeout:90];
(
  way["building"](${BBOX});
  relation["building"](${BBOX});
  way["highway"](${BBOX});
  way["amenity"="parking"](${BBOX});
  way["leisure"~"^(park|pitch|garden|track|stadium)$"](${BBOX});
  way["landuse"~"^(grass|recreation_ground|meadow)$"](${BBOX});
  way["natural"~"^(water|wood)$"](${BBOX});
);
out geom;`;

// Background features drawn under the buildings, keyed by how the app styles them.
function featureKind(t) {
  if (t.natural === 'water') return 'water';
  if (t.amenity === 'parking') return 'parking';
  if (t.leisure || t.landuse || t.natural === 'wood') return 'green';
  if (t.highway) {
    if (/^(footway|path|pedestrian|steps|cycleway)$/.test(t.highway)) return 'path';
    if (/^(service|parking_aisle|track)$/.test(t.highway)) return 'service';
    if (/^(primary|secondary|tertiary|residential|unclassified|trunk)(_link)?$/.test(t.highway)) return 'road';
  }
  return null;
}

// Buildings that are mapped without a short_name tag in OSM.
const CODE_OVERRIDES = {
  "Edith O'Donnell Arts & Technology Building": 'ATC',
  'Student Union / Student Success Center': 'SSC',
  'Edith and Peter O’Donnell Jr. Athenaeum': 'ATH',
};

const SKIP_TYPES = new Set(['dormitory', 'apartments', 'detached', 'house', 'roof', 'construction', 'garage', 'parking']);

const round = (n) => Math.round(n * 1e6) / 1e6;

// Joins a relation's outer member ways (which may be split into segments) into closed rings.
function stitchRings(segments) {
  const rings = [];
  const pool = segments.map((s) => s.slice());
  while (pool.length) {
    let ring = pool.shift();
    let extended = true;
    while (extended && !samePt(ring[0], ring[ring.length - 1])) {
      extended = false;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        const end = ring[ring.length - 1];
        if (samePt(seg[0], end)) ring = ring.concat(seg.slice(1));
        else if (samePt(seg[seg.length - 1], end)) ring = ring.concat(seg.slice().reverse().slice(1));
        else continue;
        pool.splice(i, 1);
        extended = true;
        break;
      }
    }
    rings.push(ring);
  }
  return rings;
}
const samePt = (a, b) => a[0] === b[0] && a[1] === b[1];
const toPts = (geom) => geom.map((g) => [round(g.lat), round(g.lon)]);

// Overpass is frequently overloaded, so retry a few times before giving up.
async function fetchOverpass() {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': 'utd-course-map/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(QUERY),
    });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`Overpass returned ${res.status}`);
    console.warn(`Overpass returned ${res.status}, retrying (${attempt}/3)...`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

async function main() {
  // `--from saved.json` builds from a previously downloaded Overpass response.
  const fromIdx = process.argv.indexOf('--from');
  const { elements } = fromIdx > -1 ? JSON.parse(await readFile(process.argv[fromIdx + 1], 'utf8')) : await fetchOverpass();

  const buildings = [];
  const features = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!t.building) {
      const kind = el.type === 'way' && featureKind(t);
      if (kind) features.push({ kind, name: t.highway && t.name ? t.name : undefined, pts: toPts(el.geometry) });
      continue;
    }
    // Unnamed / residential buildings are drawn as plain background shapes.
    if (!t.name || SKIP_TYPES.has(t.building)) {
      if (el.type === 'way') features.push({ kind: 'building', pts: toPts(el.geometry) });
      continue;
    }
    const code = CODE_OVERRIDES[t.name] ?? t.short_name ?? t.ref;
    if (!code) {
      if (el.type === 'way') features.push({ kind: 'building', pts: toPts(el.geometry) });
      continue;
    }

    let rings;
    if (el.type === 'way') rings = [toPts(el.geometry)];
    else rings = stitchRings(el.members.filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry).map((m) => toPts(m.geometry)));
    if (!rings.length || rings[0].length < 4) continue;

    buildings.push({
      code,
      name: t.name,
      levels: Number(t['building:levels']) || null,
      rings,
    });
  }
  buildings.sort((a, b) => a.code.localeCompare(b.code));

  await mkdir('public/data', { recursive: true });
  await writeFile('public/data/buildings.json', JSON.stringify({ source: 'OpenStreetMap contributors (ODbL)', buildings }));
  await writeFile('public/data/campus.json', JSON.stringify({ source: 'OpenStreetMap contributors (ODbL)', features }));
  console.log(`Wrote ${buildings.length} buildings: ${buildings.map((b) => b.code).join(', ')}`);
  console.log(`Wrote ${features.length} background features.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
