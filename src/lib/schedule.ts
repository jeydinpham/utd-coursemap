import type { CampusMoment, Meeting, Room, ScheduleFile } from '../types';
import { toMinutes } from './time';

export const roomKey = (building: string, room: string) => `${building} ${room}`;

/**
 * UTD room numbers lead with the floor: "2.410" is on floor 2. Some buildings
 * (JSOM, SP2, CRA) prefix a wing digit, so "12.214" is wing 1, floor 2.
 * Anything unparseable goes to floor 1.
 */
export function floorOf(room: string): number {
  const n = parseInt(room, 10);
  if (!Number.isFinite(n)) return 1;
  if (n < 10) return Math.max(1, n);
  return n % 10 || 1;
}


export function compareRooms(a: Room, b: Room) {
  return a.floor - b.floor || a.number.localeCompare(b.number, undefined, { numeric: true });
}

export interface ScheduleIndex {
  rooms: Map<string, Room>;
  byBuilding: Map<string, Room[]>;
  byRoom: Map<string, Meeting[]>;
}

export function indexSchedule(data: ScheduleFile): ScheduleIndex {
  const rooms = new Map<string, Room>();
  const byRoom = new Map<string, Meeting[]>();

  const addRoom = (b: string, r: string) => {
    const key = roomKey(b, r);
    if (!rooms.has(key)) rooms.set(key, { key, building: b, number: r, floor: floorOf(r) });
    return key;
  };

  for (const [b, list] of Object.entries(data.rooms ?? {})) for (const r of list) addRoom(b, r);
  for (const m of data.meetings) {
    const key = addRoom(m.b, m.r);
    let list = byRoom.get(key);
    if (!list) byRoom.set(key, (list = []));
    list.push(m);
  }

  const byBuilding = new Map<string, Room[]>();
  for (const room of rooms.values()) {
    let list = byBuilding.get(room.building);
    if (!list) byBuilding.set(room.building, (list = []));
    list.push(room);
  }
  for (const list of byBuilding.values()) list.sort(compareRooms);

  return { rooms, byBuilding, byRoom };
}

export const isEvent = (m: Meeting) => m.kind === 'event';

/** "CS 3354.005" for a class; the event's name for anything else. */
export const meetingLabel = (m: Meeting) => (isEvent(m) ? m.code : `${m.code}.${m.sec}`);

export const meetsOn = (m: Meeting, date: string, weekday: number) =>
  m.dates ? m.dates.includes(date) : m.days.includes(weekday) && (!m.from || m.from <= date) && (!m.to || date <= m.to);

/** All meetings in a room on a given date, earliest first. */
export function meetingsOn(index: ScheduleIndex, key: string, date: string, weekday: number): Meeting[] {
  return (index.byRoom.get(key) ?? []).filter((m) => meetsOn(m, date, weekday)).sort((a, b) => a.start.localeCompare(b.start));
}

export type RoomStatus =
  | { kind: 'active'; meeting: Meeting; minutesLeft: number }
  | { kind: 'soon'; meeting: Meeting; minutesUntil: number }
  | { kind: 'free'; next?: Meeting; minutesUntil?: number };

/** How soon a class has to start for the room to count as "starting soon". */
export const SOON_MINUTES = 20;

export function roomStatus(index: ScheduleIndex, key: string, at: CampusMoment): RoomStatus {
  const today = meetingsOn(index, key, at.date, at.weekday);
  for (const m of today) {
    const s = toMinutes(m.start);
    const e = toMinutes(m.end);
    if (s <= at.minutes && at.minutes < e) return { kind: 'active', meeting: m, minutesLeft: e - at.minutes };
  }
  const next = today.find((m) => toMinutes(m.start) > at.minutes);
  if (!next) return { kind: 'free' };
  const minutesUntil = toMinutes(next.start) - at.minutes;
  return minutesUntil <= SOON_MINUTES ? { kind: 'soon', meeting: next, minutesUntil } : { kind: 'free', next, minutesUntil };
}

/** Lower-cased, space-insensitive match used by the search box: "cs3345", "ECSS 2.4", "data struct". */
export function matchesQuery(m: Meeting, q: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const nq = norm(q);
  if (!nq) return true;
  return (
    norm(m.code).includes(nq) ||
    norm(`${m.code}.${m.sec}`).includes(nq) ||
    norm(roomKey(m.b, m.r)).includes(nq) ||
    (m.xl ?? []).some((c) => norm(c).includes(nq)) ||
    m.title.toLowerCase().includes(q.trim().toLowerCase()) ||
    m.prof.toLowerCase().includes(q.trim().toLowerCase())
  );
}
