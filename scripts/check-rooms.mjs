// Verifies that every room drawn on the map uses exactly the same room
// shape as UTD's official campus map (map.utdallas.edu).
//
// For each room in schedule.json that we draw, it runs the official map's own
// search for "BUILDING ROOM", checks that the entry it finds is the one in
// rooms.json, then fetches that location live and compares every coordinate.
// Run with: npm run check:rooms
import { readFile } from 'node:fs/promises';

const MAP_ID = '1772';
const KEY = process.env.CONCEPT3D_KEY ?? '0001085cc708b9cef47080f064612ca5';
const API = 'https://api.concept3d.com';
const DELAY_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, params = '') {
  const res = await fetch(`${API}${path}?map=${MAP_ID}&key=${KEY}${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const parseJSON = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
function outlineOf(shape) {
  if (shape?.type === 'polygon') return parseJSON(shape.paths).map(([a, b]) => [Number(a), Number(b)]);
  if (shape?.type === 'rectangle') {
    const [[s, w], [n, e]] = parseJSON(shape.bounds);
    return [[s, w], [n, w], [n, e], [s, e]].map(([a, b]) => [Number(a), Number(b)]);
  }
  return null;
}
const same = (a, b) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

async function main() {
  const { rooms } = JSON.parse(await readFile('public/data/rooms.json', 'utf8'));
  const schedule = JSON.parse(await readFile('public/data/schedule.json', 'utf8'));
  const keys = Object.entries(schedule.rooms).flatMap(([b, rs]) => rs.map((r) => `${b} ${r}`));
  const drawn = keys.filter((k) => rooms[k]);
  console.log(`Checking ${drawn.length} drawn rooms against the official map (${keys.length - drawn.length} have no official shape and are not drawn)...`);

  const problems = [];
  for (const key of drawn) {
    const ours = rooms[key];
    const number = key.split(' ')[1];
    const search = await get('/search', `&q=${encodeURIComponent(key)}&ppage=10`);
    // The official search's hit for this room: same room number, building either named in the
    // result or implied by our match (e.g. "Theatre (JO 2.702)" for TH 2.702), and an actual room
    // shape. Venue markers like "ECSS 2.102 (TI Auditorium)" have no shape, so the official map
    // outlines the room with the next hit instead.
    const hits = (search.data ?? []).filter((x) => new RegExp(`(^|[\\s(])${number.replace('.', '\\.')}([\\s)]|$)`).test(x.name));
    const ordered = [...hits.filter((x) => x.name.includes(key)), ...hits.filter((x) => !x.name.includes(key) && Number(x.id) === ours.id)];
    let official = null;
    let live = null;
    for (const hit of ordered) {
      live = await get(`/locations/${hit.id}`);
      if (outlineOf(live.shape)) {
        official = hit;
        break;
      }
      await sleep(DELAY_MS);
    }
    if (!official) {
      problems.push(`${key}: official search does not find this room with a shape`);
    } else if (Number(official.id) !== ours.id) {
      problems.push(`${key}: official search shows location ${official.id} ("${official.name}"), we use ${ours.id}`);
    } else {
      if (!same(outlineOf(live.shape), ours.outline)) problems.push(`${key}: outline differs from the live map (location ${ours.id})`);
      const liveFloor = Number(String(live.level).replace(/[^\d]/g, '')) || null;
      if (liveFloor !== ours.floor) problems.push(`${key}: floor ${ours.floor} here, ${liveFloor} on the live map`);
    }
    await sleep(DELAY_MS);
  }

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  console.log(`All ${drawn.length} room shapes match the official map exactly.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
