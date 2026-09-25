export type LatLng = [number, number];

export interface Building {
  code: string;
  name: string;
  levels: number | null;
  rings: LatLng[][];
}

/** A background shape from OpenStreetMap (road, path, lawn, parking...). */
export interface CampusFeature {
  kind: 'road' | 'service' | 'path' | 'parking' | 'green' | 'water' | 'building';
  name?: string;
  pts: LatLng[];
}

/** One recurring class meeting in one room, as written by the data scripts. */
export interface Meeting {
  b: string; // building code, e.g. "ECSS"
  r: string; // room number, e.g. "2.410"
  code: string; // "CS 3345"
  sec: string; // "001"
  title: string;
  prof: string;
  days: number[]; // 0 = Sunday ... 6 = Saturday
  start: string; // "HH:MM", 24h, campus time
  end: string;
  from: string | null; // ISO date the meeting pattern starts, null = always
  to: string | null;
  dates?: string[]; // exact ISO dates it meets (Astra data); overrides days/from/to
  cap?: number | null; // room capacity
  xl?: string[]; // other course codes crosslisted into the same meeting
}

export interface ScheduleFile {
  term: string;
  source: 'astra' | 'sample';
  generatedAt: string;
  /** Dates the file covers, when it only holds a window of days (Astra). */
  range?: { start: string; end: string };
  rooms: Record<string, string[]>;
  meetings: Meeting[];
}

/** A room's real footprint from the campus map. */
export interface RoomShape {
  floor: number | null;
  center: LatLng;
  outline: LatLng[];
  widthM: number; // bounding-box size, for fitting labels
  heightM: number;
}

export interface Room {
  key: string; // "ECSS 2.410"
  building: string;
  number: string;
  floor: number;
}

/** A moment on campus, expressed in campus-local (America/Chicago) terms. */
export interface CampusMoment {
  date: string; // "YYYY-MM-DD"
  weekday: number;
  minutes: number; // minutes since midnight
}
