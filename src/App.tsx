import { useEffect, useMemo, useState } from 'react';
import CampusMap from './components/CampusMap';
import ControlCard from './components/ControlCard';
import RoomPanel from './components/RoomPanel';
import type { Building, CampusFeature, CampusMoment, LatLng, Meeting, RoomShape, ScheduleFile } from './types';
import { indexSchedule, isEvent, matchesQuery, meetsOn, roomKey, roomStatus } from './lib/schedule';
import { campusNow, formatDate, toMinutes, weekdayOf } from './lib/time';

interface Data {
  campus: CampusFeature[];
  buildings: Building[];
  shapes: Map<string, RoomShape>;
  schedule: ScheduleFile;
}

async function loadData(): Promise<Data> {
  const files = ['campus', 'buildings', 'rooms', 'schedule'].map((f) => fetch(`data/${f}.json`));
  const [c, b, r, s] = await Promise.all(files);
  if (!c.ok || !b.ok || !r.ok || !s.ok) throw new Error('Could not load map data. See the README for the `npm run data:*` scripts.');
  const rooms: Record<string, { floor: number | null; center: LatLng; outline?: LatLng[] }> = (await r.json()).rooms;
  const shapes = new Map<string, RoomShape>();
  for (const [key, room] of Object.entries(rooms)) if (room.outline) shapes.set(key, toShape(room.floor, room.center, room.outline));
  return { campus: (await c.json()).features, buildings: (await b.json()).buildings, shapes, schedule: await s.json() };
}

/** Adds the outline's size in meters so labels can be fitted to the room. */
function toShape(floor: number | null, center: LatLng, outline: LatLng[]): RoomShape {
  const lats = outline.map((p) => p[0]);
  const lngs = outline.map((p) => p[1]);
  const heightM = (Math.max(...lats) - Math.min(...lats)) * 110_950;
  const widthM = (Math.max(...lngs) - Math.min(...lngs)) * 110_950 * Math.cos((center[0] * Math.PI) / 180);
  return { floor, center, outline, widthM, heightM };
}

function sourceLabel(s: ScheduleFile): string {
  if (s.source === 'sample') return 'Sample schedule';
  return `Astra · updated ${formatDate(s.generatedAt.slice(0, 10), true)}`;
}

function outOfRange(s: ScheduleFile, date: string): string | null {
  if (!s.range || (date >= s.range.start && date <= s.range.end)) return null;
  return `No schedule downloaded for this date. Data covers ${formatDate(s.range.start, true)} – ${formatDate(s.range.end, true)}.`;
}

/** Ticks every 15 s so the "live" view keeps up with the clock. */
function useCampusClock(): CampusMoment {
  const [now, setNow] = useState(campusNow);
  useEffect(() => {
    const id = setInterval(() => setNow(campusNow()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<{ date: string; minutes: number } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(null);
  const [query, setQuery] = useState('');
  const [chosenFloor, setFloor] = useState<number | null>(null);
  const clock = useCampusClock();

  useEffect(() => {
    loadData().then(setData, (e) => setError(String(e.message ?? e)));
  }, []);

  const moment: CampusMoment = useMemo(
    () => (override ? { ...override, weekday: weekdayOf(override.date) } : clock),
    [override, clock],
  );

  // The campus map's floor wins over the one implied by the room number (e.g. TH 2.702 is on floor 1).
  const index = useMemo(() => {
    if (!data) return null;
    const idx = indexSchedule(data.schedule);
    for (const room of idx.rooms.values()) room.floor = data.shapes.get(room.key)?.floor ?? room.floor;
    return idx;
  }, [data]);

  // Classrooms we can draw: those with a real outline from the campus map.
  const drawable = useMemo(
    () => [...(index?.rooms.values() ?? [])].filter((r) => data?.shapes.has(r.key)),
    [index, data],
  );
  useEffect(() => {
    const missing = [...(index?.rooms.keys() ?? [])].filter((k) => !data?.shapes.has(k));
    if (missing.length) console.warn('No campus-map location for these rooms, so they are not drawn:', missing.join(', '));
  }, [index, data]);

  const academic = useMemo(() => new Set(drawable.map((r) => r.building)), [drawable]);
  const floors = useMemo(() => [...new Set(drawable.map((r) => r.floor))].sort((a, b) => a - b), [drawable]);
  // Open on floor 2, where most classes are, until someone picks another floor.
  const floor = chosenFloor ?? (floors.includes(2) ? 2 : (floors[0] ?? 1));

  const visibleRooms = useMemo(() => drawable.filter((r) => r.floor === floor), [drawable, floor]);
  const floorBuildings = useMemo(() => new Set(visibleRooms.map((r) => r.building)), [visibleRooms]);

  const hasInstructors = useMemo(() => !!data?.schedule.meetings.some((m) => m.prof), [data]);

  const buildingNames = useMemo(() => new Map(data?.buildings.map((b) => [b.code, b.name])), [data]);

  const todays = useMemo(
    () => (data ? data.schedule.meetings.filter((m) => meetsOn(m, moment.date, moment.weekday)) : []),
    [data, moment.date, moment.weekday],
  );

  const matches = useMemo(() => (query.trim() ? todays.filter((m) => matchesQuery(m, query)) : null), [todays, query]);
  const highlight = useMemo(() => (matches ? new Set(matches.map((m) => roomKey(m.b, m.r))) : null), [matches]);

  const results = useMemo(() => {
    if (!matches) return [];
    const rank = (m: Meeting) => {
      const s = toMinutes(m.start);
      const e = toMinutes(m.end);
      if (s <= moment.minutes && moment.minutes < e) return 0;
      return s > moment.minutes ? 1 : 2;
    };
    return [...matches].sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start)).slice(0, 8);
  }, [matches, moment.minutes]);

  // What's on right now: classes and events campus-wide, and rooms in use per floor.
  const { activeClasses, activeEvents, activeByFloor } = useMemo(() => {
    const byFloor = new Map<number, number>();
    let classes = 0;
    let events = 0;
    for (const room of index?.rooms.values() ?? []) {
      const status = roomStatus(index!, room.key, moment);
      if (status.kind !== 'active') continue;
      if (isEvent(status.meeting)) events++;
      else classes++;
      if (data?.shapes.has(room.key)) byFloor.set(room.floor, (byFloor.get(room.floor) ?? 0) + 1);
    }
    return { activeClasses: classes, activeEvents: events, activeByFloor: byFloor };
  }, [index, moment, data]);

  if (error)
    return (
      <div className="splash">
        <p className="mono splash__error">{error}</p>
      </div>
    );
  if (!data || !index)
    return (
      <div className="splash" role="status" aria-label="Loading campus map">
        <p className="splash__word" data-text="UTD Course Map">
          UTD Course Map
        </p>
      </div>
    );

  const selected = selectedKey ? index.rooms.get(selectedKey) : undefined;

  return (
    <div className={`app${selected ? ' app--panel' : ''}`}>
      <CampusMap
        campus={data.campus}
        buildings={data.buildings}
        index={index}
        shapes={data.shapes}
        visibleRooms={visibleRooms}
        academic={academic}
        floorBuildings={floorBuildings}
        moment={moment}
        selectedKey={selectedKey}
        highlight={highlight}
        focus={focus}
        onSelectRoom={setSelectedKey}
      />
      <ControlCard
        moment={moment}
        live={!override}
        onTimeTravel={setOverride}
        activeClasses={activeClasses}
        activeEvents={activeEvents}
        query={query}
        onQuery={setQuery}
        results={results}
        floors={floors}
        floor={floor}
        onFloor={setFloor}
        activeByFloor={activeByFloor}
        onPickResult={(m) => {
          const key = roomKey(m.b, m.r);
          const room = index.rooms.get(key);
          // Jump to the result's floor so its room is actually on the map.
          if (room && room.floor !== floor) setFloor(room.floor);
          setSelectedKey(key);
          setFocus((f) => ({ key, n: (f?.n ?? 0) + 1 }));
        }}
        sourceLabel={sourceLabel(data.schedule)}
        hasInstructors={hasInstructors}
        outOfRange={outOfRange(data.schedule, moment.date)}
      />
      <div className="legend mono" aria-label="Legend">
        <span><i className="swatch swatch--active" /> Class</span>
        <span><i className="swatch swatch--event" /> Event</span>
        <span><i className="swatch swatch--soon" /> Soon</span>
        <span><i className="swatch swatch--free" /> Free</span>
      </div>
      {data.schedule.source === 'sample' && (
        <p className="sample-note mono">Sample data · run npm run data:astra for real schedules</p>
      )}
      {selected && (
        <RoomPanel
          key={`${selected.key}|${moment.date}`}
          room={selected}
          buildingName={buildingNames.get(selected.building)}
          roomType={data.schedule.roomTypes?.[selected.key]}
          index={index}
          moment={moment}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}
