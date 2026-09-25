// Pulls real room outlines and floors from UTD's official campus map
// (map.utdallas.edu, hosted on Concept3D) and writes public/data/rooms.json.
// Run with: npm run data:rooms   (needs public/data/buildings.json first)
//
// The key below is the public client key the official map page itself uses.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const MAP_ID = '1772';
const KEY = process.env.CONCEPT3D_KEY ?? '0001085cc708b9cef47080f064612ca5';
const API = 'https://api.concept3d.com';

// Rooms are named like "2.410", "ECSS 2.410", "Label 1.171A" or "Theatre (JO 2.702)".
const ROOM_RE = /(?:^|[\s(])(?:([A-Z]{2,5}\d?)\s+)?(\d{1,2}\.\d{3}[A-Z]?)(?=[\s)]|$)/;
const round = (n) => Math.round(n * 1e6) / 1e6;

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
  return pts.map(([lat, lng]) => [round(Number(lat)), round(Number(lng))]);
}

async function main() {
  const { buildings } = JSON.parse(await readFile('public/data/buildings.json', 'utf8'));
  const [locations, categories] = await Promise.all([get('/locations'), get('/categories')]);

  // Interior categories are named "Engineering and Computer Science South (ECSS)".
  const categoryCode = new Map();
  for (const c of categories) {
    const m = /\(([A-Z0-9]+)\)\s*$/.exec(c.name ?? '');
    if (m) categoryCode.set(String(c.catId), m[1]);
  }

  const rooms = {};
  for (const loc of locations) {
    const m = ROOM_RE.exec(loc.name ?? '');
    if (!m || loc.lat == null) continue;
    const center = [round(Number(loc.lat)), round(Number(loc.lng))];
    // Candidate buildings: the code in the name, the footprint the point sits in, and the
    // category. Scheduling systems don't always agree (Astra's "TH 2.702" is the map's
    // "Theatre (JO 2.702)"), so the room is filed under each of them.
    const candidates = new Set(
      [m[1], buildings.find((b) => pointInRing(center, b.rings[0]))?.code, categoryCode.get(String(loc.catId))].filter(Boolean),
    );
    if (!candidates.size) continue;

    const floor = Number(String(loc.level).replace(/[^\d]/g, '')) || null;
    let outline = null;
    try {
      outline = parseOutline(loc.shape);
    } catch {
      // A few shapes have malformed coordinates; the centre point still places the room.
    }
    const entry = { floor, center, ...(outline ? { outline } : {}) };

    for (const code of candidates) {
      const key = `${code} ${m[2]}`;
      // The map sometimes has a label point and a shaped room for the same number; keep the shaped one.
      const prev = rooms[key];
      if (!prev || (!prev.outline && outline)) rooms[key] = entry;
    }
  }

  await mkdir('public/data', { recursive: true });
  await writeFile('public/data/rooms.json', JSON.stringify({ source: 'UT Dallas campus map (Concept3D)', rooms }));
  const n = Object.keys(rooms).length;
  const shaped = Object.values(rooms).filter((r) => r.outline).length;
  console.log(`Wrote ${n} rooms (${shaped} with outlines).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
