// Pulls real class meetings from UTD's Astra Schedule (the room-booking system)
// using its public guest session, and writes public/data/schedule.json.
//
//   npm run data:astra                          (next 14 days from today)
//   ASTRA_DAYS=30 npm run data:astra            (a longer window)
//   ASTRA_START=2026-10-05 npm run data:astra   (a specific start date)
//
// Astra returns one day per request, so this makes ASTRA_DAYS requests with a
// pause between each. Keep the window modest and don't run it more than about
// once a day. Instructor names are not available from Astra.
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://www.aaiscloud.com/UTXDallas';
const DAYS = Number(process.env.ASTRA_DAYS ?? 14);
const DELAY_MS = 1500;
const UA = 'utd-course-map/0.1 (student project; campus room map)';

// Astra building codes that differ from the OpenStreetMap codes used on the map.
const BUILDING_ALIASES = { SOM: 'JSOM' };
const SKIP_BUILDINGS = new Set(['ONLINE']);

const FIELDS =
  'ActivityId,ActivityPk,ActivityName,ParentActivityId,ParentActivityName,MeetingType,Description,StartDate,EndDate,DayOfWeek,StartMinute,EndMinute,ActivityTypeCode,ResourceId,CampusName,BuildingCode,RoomNumber,RoomName,LocationName,InstitutionId,SectionId,SectionPk,IsExam,IsCrosslist,IsAllDay,IsPrivate,EventId,EventPk,CurrentState,NotAllowedUsageMask,UsageColor,UsageColorIsPrimary,EventTypeColor,MaxAttendance,ActualAttendance,Capacity';
const COL = Object.fromEntries(FIELDS.split(',').map((f, i) => [f, i]));
const ACTIVITY_CLASS = 1; // ActivityTypeCode for course sections

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- guest session -------------------------------------------------------

/** Astra signs anonymous visitors in as "guest" through a couple of redirects; collect the cookies. */
async function guestCookies() {
  const jar = new Map();
  let url = `${BASE}/Default.aspx`;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) break;
    url = new URL(loc, url).toString();
  }
  if (!jar.size) throw new Error('Astra did not issue a guest session.');
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ---- requests ------------------------------------------------------------

async function fetchDay(date, cookie) {
  const filter = encodeURIComponent(`(StartDate<="${date}T23:00:00")&&(EndDate>="${date}T00:00:00")`);
  const url =
    `${BASE}/~api/calendar/CalendarWeekGrid?_dc=${Date.now()}&action=GET&start=0&limit=5000&isForWeekView=false` +
    `&fields=${FIELDS}&filter=${filter}&page=1&sortOrder=%2BStartDate,%2BStartMinute`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: cookie } });
    if (res.ok) return (await res.json()).data ?? [];
    // Astra answers 404 when it rate-limits an IP, so back off hard rather than hammering it.
    if (attempt >= 3) throw new Error(`Astra returned ${res.status} for ${date}${res.status === 404 ? ' (likely rate-limited; wait and retry later)' : ''}`);
    await sleep(10_000 * attempt);
  }
}

// ---- parsing -------------------------------------------------------------

const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
const KEEP_UPPER = new Set(['UNIX', 'US', 'U.S.', 'AI', 'UTD', 'STEM', 'HCI', 'VLSI', 'CAD', 'ML', 'ECS', 'NSM', 'IT', 'GIS', 'ROTC']);
function titleCase(s) {
  return s
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((w, i) => {
      const up = w.toUpperCase();
      if (ROMAN.test(up) || KEEP_UPPER.has(up)) return up;
      if (i > 0 && /^(and|of|the|in|for|to|a|an|with|on|or)$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('');
}

/** "CHEM 1111/145 - GENERAL CHEMISTRY LAB I" -> { code, sec, title } */
function parseActivity(name) {
  const m = /^([A-Z]{2,5}) (\w{4})\/(\w+)\s*-\s*(.*)$/.exec(name ?? '');
  if (!m) return { code: name ?? 'Class', sec: '', title: '' };
  return { code: `${m[1]} ${m[2]}`, sec: m[3], title: titleCase(m[4].trim()) };
}

const hhmm = (iso) => iso.slice(11, 16);

function campusToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---- main ----------------------------------------------------------------

async function main() {
  const start = process.env.ASTRA_START ?? campusToday();
  const end = addDays(start, DAYS - 1);
  console.log(`Fetching Astra class meetings ${start} → ${end} (${DAYS} requests)...`);

  const cookie = await guestCookies();

  // One entry per room + time slot per day; crosslisted sections collapse into one.
  const slots = new Map();
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    const rows = await fetchDay(date, cookie);
    let classes = 0;
    for (const row of rows) {
      if (row[COL.ActivityTypeCode] !== ACTIVITY_CLASS || row[COL.IsPrivate]) continue;
      const rawB = row[COL.BuildingCode];
      const r = row[COL.RoomNumber];
      if (!rawB || !r || SKIP_BUILDINGS.has(rawB)) continue;
      const b = BUILDING_ALIASES[rawB] ?? rawB;
      const s = row[COL.StartDate];
      const e = row[COL.EndDate];
      if (s.slice(0, 10) !== date) continue; // multi-day holds are not classes
      const { code, sec, title } = parseActivity(row[COL.ActivityName]);
      const key = `${date}|${b}|${r}|${hhmm(s)}|${hhmm(e)}`;
      const slot = slots.get(key);
      if (slot) {
        if (code !== slot.code && !slot.xl.includes(code)) slot.xl.push(code);
      } else {
        slots.set(key, { date, b, r, start: hhmm(s), end: hhmm(e), code, sec, title, cap: row[COL.Capacity] || null, xl: [] });
        classes++;
      }
    }
    console.log(`  ${date}: ${classes} class meetings`);
    if (i < DAYS - 1) await sleep(DELAY_MS);
  }

  // Fold identical weekly meetings together so the file stays small.
  const patterns = new Map();
  for (const s of slots.values()) {
    const key = [s.b, s.r, s.code, s.sec, s.start, s.end].join('|');
    let p = patterns.get(key);
    if (!p) {
      p = { b: s.b, r: s.r, code: s.code, sec: s.sec, title: s.title, prof: '', days: [], start: s.start, end: s.end, from: null, to: null, dates: [], cap: s.cap };
      if (s.xl.length) p.xl = s.xl;
      patterns.set(key, p);
    }
    p.dates.push(s.date);
    const wd = new Date(s.date + 'T12:00:00Z').getUTCDay();
    if (!p.days.includes(wd)) p.days.push(wd);
  }
  const meetings = [...patterns.values()];
  for (const m of meetings) m.days.sort();

  const rooms = {};
  for (const m of meetings) (rooms[m.b] ??= new Set()).add(m.r);

  await mkdir('public/data', { recursive: true });
  await writeFile(
    'public/data/schedule.json',
    JSON.stringify({
      term: `${start} to ${end}`,
      source: 'astra',
      generatedAt: new Date().toISOString(),
      range: { start, end },
      rooms: Object.fromEntries(Object.entries(rooms).map(([b, s]) => [b, [...s]])),
      meetings,
    }),
  );
  console.log(`Wrote ${slots.size} class meetings (${meetings.length} patterns) across ${Object.values(rooms).reduce((n, s) => n + s.size, 0)} rooms.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
