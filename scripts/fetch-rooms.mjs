// Pulls real room outlines and floors from UTD's official campus map
// (map.utdallas.edu, hosted on Concept3D) and writes public/data/rooms.json.
// Run with: npm run data:rooms   (needs public/data/buildings.json first)
//
// Only rooms the official map itself shows are used: live entries under the
// "Interiors" categories, not archived revisions or floor-plan text labels.
// Coordinates are copied exactly, and each room keeps its official location id
// so `npm run check:rooms` can verify it against the live map.
//
// The key below is the public client key the official map page itself uses.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const MAP_ID = '1772';
const KEY = process.env.CONCEPT3D_KEY ?? '0001085cc708b9cef47080f064612ca5';
const API = 'https://api.concept3d.com';

// Rooms are named like "ECSS 2.410", "2.410" or "Theatre (JO 2.702)".
const ROOM_RE = /(?:^|[\s(])(?:([A-Z]{2,5}\d?)\s+)?(\d{1,2}\.\d{3}[A-Z]?)(?=[\s)]|$)/;
// Floor-plan annotations that share room numbers but aren't rooms.
const NOT_A_ROOM = /^(Label|Add|Removal)\b/i;

async function get(path) {
  const res = await fetch(`${API}${path}?map=${MAP_ID}&key=${KEY}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Concept3D ${path} returned ${res.status}`);
  return res.json();
}

function pointInRing([lat, lng], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const parseJSON = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Room outline as [lat, lng] points, from either a polygon or a rectangle shape. */
function parseOutline(shape) {
  if (!shape || typeof shape !== 'object') return null;
  let pts = null;
  if (shape.type === 'polygon') pts = parseJSON(shape.paths);
  if (shape.type === 'rectangle') {
    const [[s, w], [n, e]] = parseJSON(shape.bounds);
    pts = [[s, w], [n, w], [n, e], [s, e]];
  }
  if (!Array.isArray(pts) || pts.length < 3) return null;
  return pts.map(([lat, lng]) => [Number(lat), Number(lng)]);
}

async function main() {
  const { buildings } = JSON.parse(await readFile('public/data/buildings.json', 'utf8'));
  const [locations, categories] = await Promise.all([get('/locations'), get('/categories')]);

  const byId = new Map(categories.map((c) => [String(c.catId), c]));
  const rootName = (catId) => {
    let c = byId.get(String(catId));
    let last = null;
    for (let hops = 0; c && hops < 20; hops++, c = byId.get(String(c.parent))) last = c;
    return last?.name;
  };
  // Interior categories are named "Engineering and Computer Science South (ECSS)" or "ECSW Interiors".
  const categoryCode = (catId) => {
    const name = byId.get(String(catId))?.name ?? '';
    return /\(([A-Z0-9]+)\)\s*$/.exec(name)?.[1] ?? /^([A-Z0-9]+) Interiors$/.exec(name)?.[1];
  };

  const rooms = {};
  const rank = {}; // how well the chosen entry matches its key; higher wins
  for (const loc of locations) {
    const name = (loc.name ?? '').trim();
    const m = ROOM_RE.exec(name);
    if (!m || loc.lat == null || NOT_A_ROOM.test(name) || rootName(loc.catId) !== 'Interiors') continue;

    let outline = null;
    try {
      outline = parseOutline(loc.shape);
    } catch {
      // Malformed shape: the official map can't draw it either, so skip the room.
    }
    if (!outline) continue;

    const center = [Number(loc.lat), Number(loc.lng)];
    const catCode = categoryCode(loc.catId);
    // Candidate buildings: the code in the name, the category, and the footprint the point
    // sits in. Scheduling systems don't always agree (Astra's "TH 2.702" is the map's
    // "Theatre (JO 2.702)"), so the room is filed under each of them.
    const candidates = new Set(
      [m[1], catCode, buildings.find((b) => pointInRing(center, b.rings[0]))?.code].filter(Boolean),
    );
    const floor = Number(String(loc.level).replace(/[^\d]/g, '')) || null;
    const entry = { id: Number(loc.id), floor, center, outline };

    for (const code of candidates) {
      const key = `${code} ${m[2]}`;
      // Prefer the entry filed in the building's own category (JSOM over the JSOM3
      // duplicate), then one whose name spells out the building, then one named starting with
      // it ("JO 2.604 (Performance Hall)" over "Performance Hall (JO 2.604)"), matching the
      // official search.
      const score = (catCode === code ? 4 : 0) + (m[1] === code ? 2 : 0) + (name.startsWith(key) ? 1 : 0);
      if (!(key in rank) || score > rank[key]) {
        rooms[key] = entry;
        rank[key] = score;
      }
    }
  }

  await mkdir('public/data', { recursive: true });
  await writeFile('public/data/rooms.json', JSON.stringify({ source: 'UT Dallas campus map (Concept3D)', rooms }));
  console.log(`Wrote ${Object.keys(rooms).length} rooms.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
